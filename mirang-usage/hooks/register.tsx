// 사용량(한글): 입력창 위에 맥락·캐시·요금제 사용량과, 세션을 새로 시작할지에 대한 판단을 보여준다.
// token-weather(Hamza Zafar)의 맥락 기록·캐시 카운트다운 로직을 바탕으로 했다.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { CacheTtl, UsageReading } from '../types'
import { advise, kshort, untilKo } from './advice'
import { bandsFile, parseOrder, stackBands } from './bands'

const HISTORY = 12
const BARS = '▁▂▃▄▅▆▇█'
const TTL_MS = { '5m': 5 * 60_000, '1h': 60 * 60_000 } as const
// 캐시가 살아 있으면 카운트다운(분:초)을 1초마다, 아니면 요금제 리셋 시간만 15초마다 다시 그린다.
const WARM_STEP_MS = 1000
const IDLE_STEP_MS = 15_000
const WARN_BELOW_MS = 60_000
const TAIL_BYTES = 1024 * 1024
const KIND_KO: Record<string, string> = { five_hour: '5시간', seven_day: '7일', spend_limit: '지출 한도' }

const readings = atom({ plugin: 'mirang-usage', key: 'readings' } as const, [] as UsageReading[])
const lastRequestAt = atom({ plugin: 'mirang-usage', key: 'lastRequestAt' } as const, null as number | null)
const detectedTtl = atom({ plugin: 'mirang-usage', key: 'detectedTtl' } as const, null as CacheTtl | null)
const notifiedLevel = atom({ plugin: 'mirang-usage', key: 'notifiedLevel' } as const, 0)

let bandOrder: Promise<string[]> | undefined

async function readBandOrder($: EngineInterface): Promise<string[]> {
  const file = bandsFile(await $.env.get('CLAUDE_CONFIG_DIR'), await $.env.get('HOME'))
  return file && (await $.fs.exists(file)) ? parseOrder(await $.fs.read(file)) : []
}

export function resetBandOrder() {
  bandOrder = undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await takeReading($)
    if ((await read($, detectedTtl)) === null) {
      const known = await $.store.get('detectedTtl').catch(() => undefined)
      if (known === '5m' || known === '1h') await update($, detectedTtl, () => known)
    }
    return result
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      await update($, lastRequestAt, () => null)
      await update($, notifiedLevel, () => 0)
    }
    return next(e)
  })

  // 메인 스레드의 요청이 끝날 때마다 캐시 수명이 다시 시작된다.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (!e.agentId && result.stopReason !== null) {
      const now = await $.clock.now()
      await update($, lastRequestAt, () => now)
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      await takeReading($)
      const found = ttlFromTranscript(await readTail($))
      if (found !== null) await detect($, found)
      await maybeToast($)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    const history = await read($, readings)
    const now = history.at(-1)
    if (e.props.hasSurvey || !now) return rest

    const { Box, Text } = $.ui.resolve(e)
    const isWide = e.props.bodyColumns >= 60
    const clockNow = await $.clock.now()
    const { rateLimits, cost } = await $.session.usage()

    const since = await read($, lastRequestAt)
    const ttl = await ttlMs($)
    const leftMs = since === null ? null : since + ttl - clockNow
    keepTicking($, leftMs !== null && leftMs > 0 ? WARM_STEP_MS : IDLE_STEP_MS) // 리로드로 타이머를 잃어도 다음 그리기에서 다시 건다
    const isCold = leftMs !== null && leftMs <= 0
    const fiveHour = rateLimits.find(r => r.kind === 'five_hour')?.percentUsed
    const adv = advise({ percent: now.percent, tokens: now.tokens, isCacheCold: isCold, fiveHour })

    const limits = rateLimits.map(r => {
      const when = isWide ? untilKo(r.resetsAt, clockNow) : ''
      return `${KIND_KO[r.kind] ?? r.kind} ${r.percentUsed}%${when ? ` (${when} 리셋)` : ''}`
    })
    if (cost) limits.push(`이번 세션 $${cost.usd.toFixed(2)}`)

    const mine = (
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row">
          <Text color={adv.color} bold>{`맥락 ${now.percent}%`}</Text>
          <Text dimColor>{` ${kshort(now.tokens)} / ${kshort(now.window)}`}</Text>
          {isWide && history.length > 1 && <Text dimColor>{` · 직전 ${trend(history)}`}</Text>}
          {isWide && <Text color={adv.color}>{` ${sparkline(history)}`}</Text>}
          {leftMs !== null && <Text color={isCold ? 'red' : leftMs < WARN_BELOW_MS ? 'yellow' : undefined} dimColor={!isCold}>{isCold ? ' · 캐시 만료' : ` · 캐시 ${clock(leftMs)} 남음`}</Text>}
        </Box>
        {limits.length > 0 && <Text dimColor>{`요금제 ${limits.join(' · ')}`}</Text>}
        <Text color={adv.color}>{`${adv.icon} ${adv.text}`}</Text>
      </Box>
    )
    bandOrder ??= readBandOrder($).catch(() => [])
    return stackBands(rest, 'mirang-usage', mine, 'above', await bandOrder)
  })
}

// 판단이 🟠/🔴로 올라갈 때 한 번만 알림을 띄운다.
async function maybeToast($: EngineInterface) {
  const now = (await read($, readings)).at(-1)
  if (!now) return
  const since = await read($, lastRequestAt)
  const isCold = since !== null && since + (await ttlMs($)) <= (await $.clock.now())
  const { rateLimits } = await $.session.usage()
  const adv = advise({ percent: now.percent, tokens: now.tokens, isCacheCold: isCold, fiveHour: rateLimits.find(r => r.kind === 'five_hour')?.percentUsed })
  const shown = await read($, notifiedLevel)
  if (adv.level >= 2 && adv.level > shown) $.ui.toast(`${adv.icon} ${adv.text}`)
  if (adv.level !== shown) await update($, notifiedLevel, () => adv.level)
}

async function ttlMs($: EngineInterface) {
  return TTL_MS[(await read($, detectedTtl)) ?? '5m']
}

async function detect($: EngineInterface, ttl: CacheTtl) {
  if ((await read($, detectedTtl)) === ttl) return
  await update($, detectedTtl, () => ttl)
  await $.store.set('detectedTtl', ttl).catch(() => {})
}

async function readTail($: EngineInterface) {
  try {
    const home = await $.env.get('HOME')
    const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home ? `${home}/.claude` : undefined)
    if (!configDir) return ''
    const path = `${configDir}/projects/${(await $.session.root()).replace(/[^a-zA-Z0-9]/g, '-')}/${await $.session.id()}.jsonl`
    const { size } = await $.fs.stat(path)
    if (size <= TAIL_BYTES) return await $.fs.read(path)
    const { exitCode, stdout } = await $.process.run(['tail', '-c', String(TAIL_BYTES), path])
    return exitCode === 0 ? stdout : ''
  } catch {
    return ''
  }
}

// 마지막 메인 응답이 캐시에 쓴 수명; 쓰지 않았거나 못 찾으면 null.
export function ttlFromTranscript(text: string): CacheTtl | null {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: any
    try {
      entry = JSON.parse(lines[i] ?? '')
    } catch {
      continue
    }
    if (entry?.type !== 'assistant' || entry.isSidechain || !entry.message?.usage) continue
    const written = entry.message.usage.cache_creation
    if (Number(written?.ephemeral_1h_input_tokens) > 0) return '1h'
    if (Number(written?.ephemeral_5m_input_tokens) > 0) return '5m'
    return null
  }
  return null
}

let tick: Timer | undefined
let tickStep = 0

// 띠를 그릴 때마다 지금 필요한 간격으로 타이머를 맞춘다(같은 간격이면 그대로 둔다).
function keepTicking($: EngineInterface, step: number) {
  if (tick && tickStep === step) return
  tick?.cancel()
  tickStep = step
  tick = $.clock.every(step, () => $.ui.invalidate('ui.render'))
}

async function takeReading($: EngineInterface) {
  const { context } = await $.session.usage()
  if (!context?.window) return
  const tokens = context.tokens ?? 0
  const percent = context.percent ?? Math.round((tokens / context.window) * 100)
  await update($, readings, h => [...h, { tokens, window: context.window, percent }].slice(-HISTORY))
}

function clock(ms: number) {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function sparkline(history: UsageReading[]) {
  const top = Math.max(...history.map(r => r.tokens), 1)
  return history.map(r => BARS[Math.floor((r.tokens / top) * (BARS.length - 1))]).join('')
}

function trend(history: UsageReading[]) {
  const delta = (history.at(-1)?.tokens ?? 0) - (history.at(-2)?.tokens ?? 0)
  if (delta === 0) return '변화 없음'
  return delta > 0 ? `+${kshort(delta)}` : `-${kshort(-delta)}`
}
