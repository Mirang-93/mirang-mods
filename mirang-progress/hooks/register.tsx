import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Flow, Panel, Phase, PlannedTask, SessionSnap } from '../types'

const flow = atom({ plugin: 'mirang-progress', key: 'flow' } as const, null)
const agents = atom({ plugin: 'mirang-progress', key: 'agents' } as const, [])
const panel = atom({ plugin: 'mirang-progress', key: 'panel' } as const, {
  isCompact: false,
  isDoneCollapsed: false,
  autoOpenedFor: '',
})
const now = atom({ plugin: 'mirang-progress', key: 'now' } as const, 0)

const main = atom({ plugin: 'mirang-progress', key: 'main' } as const, null as AgentRun | null)
const peers = atom({ plugin: 'mirang-progress', key: 'peers' } as const, [] as SessionSnap[])
const TOOL = 'mcp__mirang-progress__progress'
const STEP_TOOL = 'mcp__mirang-progress__step'
const PANE = 'mirang-agents'
const PHASES: readonly Phase[] = ['plan', 'design', 'delegate', 'review', 'close']
const TIERS: readonly string[] = ['fable', 'heavy', 'careful', 'medium', 'light']
// The tools' schemas are advice to the model, not a check: what a call may ask
// the band and the panel to draw is bounded here.
const MAX_TASKS = 200
const MAX_AFTER = 20
const MAX_TITLE = 120
const ACCENT = '#8f8cf4'
const DONE = '#5fbf8f'
const WAIT = '#BA7517'
const HALT = '#D85A30'

// Finished green, waiting for the person amber, stopped or failed red, else the accent.
const flowColor = (f: Flow): string => (f.isFinished ? DONE : f.state === 'waiting' ? WAIT : f.state ? HALT : ACCENT)

type ProgressInput = {
  title?: string
  total?: number
  done?: number
  phase?: Phase
  finished?: boolean
  tasks?: { title?: string; tier?: string; after?: number[] }[]
}

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else the
// process locale; English when nothing says Hebrew or Russian.

type Lang = 'en' | 'ru' | 'he' | 'ko'

const STRINGS = {
  ko: {
    pane: '작업 진행도', cost: '예상 비용', tokens: '토큰', time: '시간',
    collapse: '접기', expand: '펼치기', running: '진행 중', finished: '종료', planned: '예정',
    empty: '작업 대기 중', round: '회차', failed: '중단/오류', after: '이후',
    tokensWord: '토큰', agentsCount: '작업자', isRunning: '진행 중', isFinished: '종료',
    isPlanned: '예정', opened: '작업 진행도 패널을 열었습니다.', closed: '패널을 닫았습니다.',
    done: '응답 완료', complete: '작업 완료', waiting: '답변 대기', unconfirmed: '완료 보고 전', stopped: '중단', errored: '오류', unpriced: '단가 미상', plan: '계획', design: '설계', tasks: '작업', review: '검증', busy: '진행 중', ctx: '맥락',
    tier: { light: '가벼운 작업', medium: '일반 작업', careful: '검토', heavy: '복잡한 작업', fable: '고난도', other: '작업자' },
    effort: { low: '낮음', medium: '보통', high: '높음', xhigh: '매우 높음', max: '최대' },
  },
  en: {
    pane: 'Agents',
    cost: 'Cost',
    tokens: 'Tokens',
    time: 'Time',
    collapse: 'Collapse',
    expand: 'Expand',
    running: 'Running',
    finished: 'Finished',
    planned: 'Planned',
    empty: 'No subagents yet.',
    round: 'round',
    failed: 'error',
    after: 'after',
    tokensWord: 'tokens',
    agentsCount: 'agents',
    isRunning: 'running',
    isFinished: 'finished',
    isPlanned: 'planned',
    opened: 'Agents panel opened.',
    closed: 'Agents panel closed.',
    done: 'Done',
    complete: 'Complete',
    waiting: 'Waiting',
    unconfirmed: 'Not confirmed',
    stopped: 'Stopped',
    errored: 'Error',
    unpriced: 'price unknown',
    plan: 'Plan',
    design: 'Design',
    tasks: 'Tasks',
    review: 'Review',
    busy: 'running',
    ctx: 'ctx',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  ru: {
    pane: 'Агенты',
    cost: 'Стоимость',
    tokens: 'Токены',
    time: 'Время',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    running: 'Работают',
    finished: 'Завершены',
    planned: 'Запланированы',
    empty: 'Субагентов пока нет.',
    round: 'раунд',
    failed: 'ошибка',
    after: 'после',
    tokensWord: 'токенов',
    agentsCount: 'агентов',
    isRunning: 'работает',
    isFinished: 'завершён',
    isPlanned: 'запланирована',
    opened: 'Панель агентов открыта.',
    closed: 'Панель агентов закрыта.',
    done: 'Готово',
    complete: 'Завершено',
    waiting: 'Ожидание',
    unconfirmed: 'Не подтверждено',
    stopped: 'Остановлено',
    errored: 'Ошибка',
    unpriced: 'цена неизвестна',
    plan: 'План',
    design: 'Дизайн',
    tasks: 'Задачи',
    review: 'Ревью',
    busy: 'в работе',
    ctx: 'ctx',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  he: {
    pane: 'סוכנים',
    cost: 'עלות',
    tokens: 'טוקנים',
    time: 'זמן',
    collapse: 'כיווץ',
    expand: 'הרחבה',
    running: 'פועלים',
    finished: 'הסתיימו',
    planned: 'מתוכננים',
    empty: 'עדיין אין סוכנים.',
    round: 'סבב',
    failed: 'שגיאה',
    after: 'אחרי',
    tokensWord: 'טוקנים',
    agentsCount: 'סוכנים',
    isRunning: 'פועל',
    isFinished: 'הסתיים',
    isPlanned: 'מתוכנן',
    opened: 'חלונית הסוכנים נפתחה.',
    closed: 'חלונית הסוכנים נסגרה.',
    done: 'הושלם',
    complete: 'הושלם',
    waiting: 'ממתין',
    unconfirmed: 'לא אושר',
    stopped: 'נעצר',
    errored: 'שגיאה',
    unpriced: 'מחיר לא ידוע',
    plan: 'תכנון',
    design: 'עיצוב',
    tasks: 'משימות',
    review: 'בדיקה',
    busy: 'בעבודה',
    ctx: 'הקשר',
    tier: { light: 'קל', medium: 'בינוני', careful: 'זהיר', heavy: 'כבד', fable: 'פייבל', other: 'אחר' },
    effort: { low: 'נמוך', medium: 'בינוני', high: 'גבוה', xhigh: 'גבוה מאוד', max: 'מקסימלי' },
  },
} as const

// Module scope is fine here: session.start sets it again on every (re)load.
let lang: Lang = 'ko'
const tr = () => STRINGS[lang]

// Hebrew draws every row mirrored: crab and title on the right, numbers on the left.
const isRtl = () => lang === 'he'

// Tier and effort words as shown; anything unknown shows as it came.
const tierWord = (tier: string): string => (tr().tier as Record<string, string>)[tier] ?? tier
const effortWord = (effort: string): string => (tr().effort as Record<string, string>)[effort] ?? effort

async function detectLang(_$: EngineInterface, _option: unknown): Promise<Lang> { return 'ko' }

const blank = (): Flow => ({
  title: '작업 대기',
  total: 0,
  done: 0,
  running: 0,
  phase: 'plan',
  isFinished: false,
  tasks: [],
})

const isNewFlow = (prev: Flow | null, input: ProgressInput): boolean =>
  !prev || prev.isFinished || (input.title !== undefined && clip(input.title.trim(), MAX_TITLE) !== prev.title)

// Only a known tier is kept: the name is later a key into the tier tables.
const tierName = (v: string): string => {
  const t = v.replace(/^savvy-/, '').trim().toLowerCase()
  return TIERS.includes(t) ? t : ''
}

const cleanTasks = (tasks: ProgressInput['tasks']): PlannedTask[] | undefined =>
  tasks
    ?.filter(t => t.title?.trim())
    .slice(0, MAX_TASKS)
    .map(t => ({
      title: (t.title ?? '').trim(),
      tier: tierName(t.tier ?? ''),
      after: (t.after ?? []).filter(n => Number.isInteger(n) && n > 0).slice(0, MAX_AFTER),
    }))

const merge = (prev: Flow | null, input: ProgressInput): Flow => {
  // A new title means a new flow: never carry counters over from an earlier one.
  const base = isNewFlow(prev, input) || !prev ? blank() : { ...blank(), ...prev }
  const tasks = cleanTasks(input.tasks) ?? base.tasks
  const total = Math.min(MAX_TASKS, Math.max(0, Math.round(input.total ?? (input.tasks ? tasks.length : base.total))))
  const done = Math.min(total || Infinity, Math.max(0, Math.round(input.done ?? base.done)))
  const phase = input.phase && PHASES.includes(input.phase) ? input.phase : base.phase
  return {
    ...base,
    title: clip(input.title?.trim() || base.title, MAX_TITLE),
    total,
    done,
    phase: input.finished ? 'close' : phase,
    isFinished: input.finished === true,
    state: undefined,
    tasks,
  }
}

const label = (f: Flow): string => {
  const s = tr()
  // A reported flow whose steps are all done is complete; a turn with no reported steps only answered.
  if (f.isFinished) return f.total ? s.complete : s.done
  const halt = f.state === 'waiting' ? s.waiting : f.state === 'stopped' ? s.stopped : f.state === 'error' ? s.errored : ''
  // Every step done but no `finished` yet: not complete, and not a question to the person either.
  if (f.state === 'waiting' && f.total && f.done >= f.total) return `${s.unconfirmed} ${f.done}/${f.total}`
  if (halt) return f.total ? `${halt} ${f.done}/${f.total}` : halt
  if (!f.total) return f.title === '작업 대기' ? '대기' : '단계 미보고'
  if (f.phase === 'plan') return s.plan
  if (f.phase === 'design') return s.design
  const count = f.total ? `${f.done}/${f.total}` : `${f.running} ${s.busy}`
  return `${f.phase === 'review' ? s.review : s.tasks} ${count}`
}

const ratio = (f: Flow): number => (f.total ? f.done / f.total : 0)

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

// The whole row is one SVG: the desktop wraps sibling elements onto new lines,
// so title, bar, percent and the crab live in one drawing; only the count and
// the dismiss are Buttons beside it.
const H = 22
const BAR_H = 16
const CRAB_W = 26
// The crab's drawing grid is 30 units wide, props included.
const CRAB_BOX = 30
const CELL = 3
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// CJK, fullwidth forms and emoji advance about 1em; at 0.56em a Chinese title was sized at half its width and the bar drew over it.
// 中日韩文字、全角标点和 emoji 约占 1em；按 0.56em 算时中文标题宽度被低估近一半，进度条会压到标题上。
const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

// Rough advance of system UI text, in em; good enough to size the title's slot.
const charEm = (ch: string): number =>
  WIDE.test(ch) ? 1 : /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZА-ЯЁmwшщжюМШЩЖЮ@%]/.test(ch) ? 0.72 : 0.56

const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

const rowSvg = (f: Flow, W: number, isWorking: boolean): string => {
  // The title takes what it needs, up to 40% of the row; the bar takes the rest.
  const title = fitText(f.title, 13, Math.max(60, W * 0.4))
  const BAR_X = Math.round(16 + textWidth(title, 13) + 12)
  const BAR_W = Math.max(60, W - BAR_X - 46 - CRAB_W)
  const color = flowColor(f)
  const y0 = (H - BAR_H) / 2
  const fillW = Math.round(BAR_W * ratio(f))
  const runW = f.total ? Math.round((BAR_W * Math.min(f.total, f.done + f.running)) / f.total) : 0
  const dots: string[] = []
  // Positions are worked out left to right; right to left mirrors each box
  // inside the bar (`bx`) and across the row (`rx`). Text is never mirrored.
  const rtl = isRtl()
  const bx = (x: number, w: number): number => (rtl ? BAR_W - x - w : x)
  const rx = (x: number, w: number): number => (rtl ? W - x - w : x)

  // Dithered fill: sparse at the start, dense toward the head.
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) dots.push(`<rect class="t${Math.floor(noise(r, c) * 4)}" x="${bx(c * CELL + 1, 2)}" y="${r * CELL + 1}" width="2" height="2"/>`)
    }
  }
  // Handed to workers, not yet accepted: a faint second layer.
  const faint: string[] = []
  for (let c = cols; c < Math.floor(runW / CELL); c++) {
    for (let r = 0; r < rows; r++) {
      if (noise(c + 7, r + 3) < 0.2) faint.push(`<rect class="t${Math.floor(noise(r + 5, c) * 4)}" x="${bx(c * CELL + 1, 1.7)}" y="${r * CELL + 1}" width="1.7" height="1.7"/>`)
    }
  }

  const ticks: string[] = []
  for (let i = 1; i < f.total; i++) {
    const x = Math.round((BAR_W * i) / f.total)
    if (x > fillW + 4) ticks.push(`<rect x="${bx(x, 1.5)}" y="${BAR_H / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)
  }

  const text = label(f)
  const pillW = Math.round(18 + textWidth(text, 11))
  const pillX = bx(Math.max(0, Math.min(BAR_W - pillW, fillW - pillW)), pillW)
  const percent = (f.total ? `${Math.round(ratio(f) * 100)}%` : '—')
  // `direction="rtl"` puts Hebrew words and numbers in reading order; `start` is then the right edge.
  const titleAt = rtl ? `x="${W - 16}" direction="rtl" text-anchor="start"` : 'x="16"'
  const percentAt = rtl ? `x="${CRAB_W + 6}" y="${H / 2 + 4.5}"` : `x="${W - CRAB_W - 6}" y="${H / 2 + 4.5}" text-anchor="end"`
  const crabW = CRAB_BOX * 0.8

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
/* Pixels twinkle in four out-of-phase groups; a finished bar settles to a slow glow. */
.t0,.t1,.t2,.t3{animation:tw ${f.isFinished ? 3.2 : 2.2}s ease-in-out infinite}
.t1{animation-duration:${f.isFinished ? 3.8 : 2.8}s;animation-delay:-.7s}.t2{animation-duration:${f.isFinished ? 4.4 : 1.9}s;animation-delay:-1.3s}.t3{animation-duration:${f.isFinished ? 3.5 : 3.3}s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${f.isFinished ? 0.8 : 0.3}}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
<circle cx="${rtl ? W - 5 : 5}" cy="${H / 2}" r="4" fill="${color}"/>
<text class="t" ${titleAt} y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${xml(title)}</text>
<g transform="translate(${rx(BAR_X, BAR_W)},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c)">
<g fill="${color}">${dots.join('')}</g>
<g fill="${color}" opacity="0.45">${faint.join('')}</g>
<g class="tk">${ticks.join('')}</g>
</g>
<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle"${rtl ? ' direction="rtl"' : ''} font-family="${FONT}" font-size="11" font-weight="600" fill="#ffffff">${xml(text)}</text>
</g>
<text class="m" ${percentAt} font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${percent}</text>
${CRAB_CSS}${crab(rx(W - CRAB_W + 1, crabW), 0, 'other', false, isWorking, 0.8, rtl)}
</svg>`
}

const barText = (f: Flow, width: number): string => {
  const filled = Math.round(width * ratio(f))
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// ---------------------------------------------------------------------------
// Agents panel: every subagent of the session, plus the tasks the flow planned.

const TIER_COLOR: Record<string, string> = {
  fable: '#7F77DD',
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
  other: '#888780',
}

// What each savvy tier runs on, for planned tasks that have no run yet.
const colorOf = (tier: string): string => TIER_COLOR[tier] ?? '#888780'

const TIER_MODEL: Record<string, [model: string, effort: string]> = {
  fable: ['Fable', 'high'],
  heavy: ['Opus', 'xhigh'],
  careful: ['Opus', 'high'],
  medium: ['Opus', 'medium'],
  light: ['Opus', 'low'],
}

// "Opus · xhigh", with the effort word in the panel's language; '' for an unknown tier.
const tierModel = (tier: string): string => {
  const m = TIER_MODEL[tier]
  return m ? `${m[0]} · ${effortWord(m[1])}` : ''
}

// "Opus 5.5 · low" for a run, or just the model when no effort was seen.
const runModel = (a: AgentRun): string => (a.effort ? `${modelName(a.model)} · ${effortWord(a.effort)}` : modelName(a.model))

// USD per million tokens: input, output, cache read, cache write. The first row that
// matches a model id wins, so a release sits above its family.
// The engine reports tokens, not money, so the panel's cost is an estimate. It reports
// one cache-write count with no split by lifetime; writes are priced at the 1-hour
// rate (2x input), which is what Claude Code writes on a subscription.
type Price = [input: number, output: number, cacheRead: number, cacheWrite: number]

const PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, [10, 50, 0.25, 20]],
  [/fable|mythos/, [10, 50, 1, 20]],
  [/opus-5-5/, [4, 20, 0.2, 8]],
  [/opus/, [5, 25, 0.5, 10]],
  [/sonnet-5-5/, [2, 10, 0.1, 4]],
  [/sonnet-5/, [2, 10, 0.2, 4]],
  [/sonnet/, [3, 15, 0.3, 6]],
  [/haiku-5-5/, [0.1, 0.5, 0.01, 0.2]],
  [/haiku/, [1, 5, 0.1, 2]],
]

// Haiku 5.5 is priced by prompt length: a request whose prompt (input, cache reads and
// cache writes together) is over 100,000 tokens pays these prices instead.
const HAIKU_LONG_PROMPT = 100_000
const HAIKU_LONG: Price = [0.5, 2.5, 0.05, 1]

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const priceOf = (model: string, prompt: number): Price | null => {
  const id = model.toLowerCase()
  if (prompt > HAIKU_LONG_PROMPT && /haiku-5-5/.test(id)) return HAIKU_LONG
  return PRICES.find(([re]) => re.test(id))?.[1] ?? null
}

// A model no row prices (another provider, a newer release) is not guessed at: it adds
// nothing to the cost and marks the run so the panel says the figure is incomplete.
const isPriced = (model: string): boolean => PRICES.some(([re]) => re.test(model.toLowerCase()))

// `isRequest` says the usage is one model request, which is what a prompt-length price
// is set by; a turn's sum is priced at the model's ordinary prices.
const costOf = (model: string, u: Usage, isRequest: boolean): number => {
  const prompt = isRequest ? (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) : 0
  const price = priceOf(model, prompt)
  if (!price) return 0
  const [i, o, r, w] = price
  return (
    ((u.input_tokens || 0) * i +
      (u.output_tokens || 0) * o +
      (u.cache_read_input_tokens || 0) * r +
      (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

// Haiku 4.5 and the Claude 3 models have a 200K window; the rest, Haiku 5.5 included, 1M.
const windowOf = (model: string): number => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

// `savvy-careful`, or `savvy-flow:savvy-careful` when the agents ship in a plugin.
const tierOf = (type: string): string => {
  const bare = type.replace(/^[^:]*:/, '')
  const t = bare.replace(/^savvy-/, '').toLowerCase()
  if (Object.hasOwn(TIER_COLOR, t) && bare.startsWith('savvy-')) return t
  if (/explore|research|discovery/.test(bare)) return 'heavy'
  if (/review|qa|test|risk|security/.test(bare)) return 'careful'
  if (/develop|implement|engineer/.test(bare)) return 'medium'
  if (/plan|architect|lead/.test(bare)) return 'fable'
  return 'other'
}

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

// "≈$1.20" estimated; "≈$1.20+" when some of it ran on a model with no known price.
const costText = (usd: number, isPartial?: boolean): string =>
  isPartial ? (usd > 0 ? `≈${fmtCost(usd)}+` : tr().unpriced) : `≈${fmtCost(usd)}`

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// Earlier turns of the same flow count their own length, not the wait between them.
const elapsed = (a: AgentRun, at: number): number => (a.priorMs ?? 0) + (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

type Planned = PlannedTask & { n: number }

const plannedOf = (f: Flow | null, list: AgentRun[]): Planned[] => {
  if (!f || f.isFinished) return []
  const started = new Set(list.map(a => norm(a.description)))
  return (f.tasks ?? []).map((t, i) => ({ ...t, n: i + 1 })).filter(t => !started.has(norm(t.title)))
}

// One model request added to a run: its context is the request's prompt plus answer.
const withRequest = (a: AgentRun, model: string, usage: Usage): AgentRun => {
  const sum = (usage.input_tokens || 0) + (usage.output_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
  return { ...a, model, contextTokens: sum, contextMax: windowOf(model), tokens: a.tokens + sum, costUsd: a.costUsd + costOf(model, usage, true), isPriceUnknown: a.isPriceUnknown || !isPriced(model), steps: a.steps + 1 }
}

// Workers still running when a new flow starts stay in view, marked as the earlier
// flow's: what they report later never adds to the new flow's totals.
const carryOver = (list: AgentRun[]): AgentRun[] => list.filter(a => a.status === 'running').map(a => ({ ...a, isCarried: true }))

const totals = (all: AgentRun[], at: number) => {
  const list = all.filter(a => !a.isCarried)
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = list.reduce((s, a) => s + a.tokens, 0)
  const isPartial = list.some(a => a.isPriceUnknown)
  // With the main session in the list its own working time is the flow's; workers alone span start to end.
  const lead = list.find(a => a.type === 'main')
  if (lead) return { cost, tokens, isPartial, time: elapsed(lead, at) }
  const start = Math.min(...list.map(a => a.startedAt))
  const end = Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt)))
  return { cost, tokens, isPartial, time: list.length ? end - start : 0 }
}

// --- desktop drawings: each row is one SVG, as the band above the prompt is.

// The pane's backdrop: a dotted grid as tall as the content laid over it; the
// row SVGs are transparent, so it shows through between their marks.
const GRID_STEP = 16
// A Text or Button row on the desktop is about 20px; the grid errs taller.
const LINE_H = 24
// The engine refuses an Svg taller than 4096px, so a long grid is stacked from
// tiles of at most this height; a multiple of GRID_STEP keeps the dots aligned.
const GRID_TILE = 4096
const gridTiles = (H: number) => Array.from({ length: Math.ceil(H / GRID_TILE) }, (_, i) => Math.min(GRID_TILE, H - i * GRID_TILE))
const gridSvg = (W: number, H: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>.d{fill:#d9d8d4}@media (prefers-color-scheme: dark){.d{fill:#3a3a38}}</style>
<defs><pattern id="g" width="${GRID_STEP}" height="${GRID_STEP}" patternUnits="userSpaceOnUse"><circle class="d" cx="${GRID_STEP / 2}" cy="${GRID_STEP / 2}" r="1"/></pattern></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`

const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

// Pixel Clawd from DockCrab (Clawdy): a 24×18 crab on a 30×28 grid, one costume per tier.
// The body keeps the brand clay; the tier's color lives in the costume's accent.
const CLAY = '#D97757'
const INK = '#1F1E1D'

// `cls` puts a pixel in a named group: `bd` (the default) is the body and its
// costume, `la`/`lb` the leg pairs, anything else a prop with its own motion.
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// `armCls` lets a raised claw travel with the prop it holds.
const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// Pure CSS, run by the compositor: no redraws. Periods divide one second, so the
// once-a-second redraw of a running row restarts them in phase. Every crab walks;
// each costume adds its prop's own motion on top.
const CRAB_CSS = `<style>
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
.c-fable.run{animation:float 1s ease-in-out infinite}
.c-fable.run .la,.c-fable.run .lb,.c-fable.run .bd{animation:none}
.c-fable.run .ant{animation:blink 1s steps(1) infinite}
.c-fable.run .star{animation:blink .5s steps(1) infinite -.25s}
@keyframes float{50%{transform:translateY(-2px)}}@keyframes blink{50%{opacity:.15}}
.c-heavy.run .it{animation:scan 1s steps(1) infinite}
.c-heavy.run .gl{animation:blink 1s steps(1) infinite -.5s}
@keyframes scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}
.c-careful.run .it{transform-origin:100% 100%;animation:twist .5s ease-in-out infinite}
@keyframes twist{50%{transform:rotate(-35deg)}}
.c-medium.run .pan{transform-origin:0 50%;animation:tilt 1s ease-in-out infinite}
.c-medium.run .egg{animation:flip 1s ease-in-out infinite}
@keyframes tilt{20%,40%{transform:rotate(-12deg)}}@keyframes flip{30%{transform:translateY(-5px) scaleY(-1)}60%{transform:translateY(0)}}
.c-light.run .la{animation-duration:.25s}.c-light.run .lb{animation-duration:.25s;animation-delay:-.125s}
.c-light.run .flag{transform-origin:0 50%;animation:wave .25s steps(1) infinite}
@keyframes wave{50%{transform:skewY(-12deg) scaleX(.85)}}
.c-explore.run .it{transform-origin:50% 100%;animation:fence .5s ease-in-out infinite}
@keyframes fence{50%{transform:rotate(25deg)}}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}
</style>`

const COSTUMES: Record<string, (f: Fill, t: string) => void> = {
  // Fable: astronaut in a glass dome; floats instead of walking, the antenna and the star blink.
  fable: (f, t) => {
    crabBody(f)
    f(6, 7, 18, 1, '#E6E8EE'); f(5, 8, 1, 14, '#E6E8EE'); f(24, 8, 1, 14, '#E6E8EE'); f(6, 22, 18, 1, '#C9CCD2')
    f(6, 8, 18, 14, 'rgba(169,214,245,.32)'); f(8, 9, 2, 1, '#fff'); f(8, 10, 1, 2, '#fff')
    f(14, 4, 2, 3, '#C9CCD2'); f(14, 2, 2, 2, t, 'ant'); f(13, 18, 4, 2, t)
    f(27, 3, 1, 3, '#F5C542', 'star'); f(26, 4, 3, 1, '#F5C542', 'star')
  },
  // Heavy: detective with a deerstalker; the magnifier sweeps and glints.
  heavy: (f, t) => {
    crabBody(f, -4, 'it')
    stamp(f, 6, 3, ['......bbbbbb......', '....bbcbbcbbbb....', '...bbbbbbbbbbbb...', '..bcbbcbbcbbcbbb..', '.bbbbbbbbbbbbbbbb.', 'dddddddddddddddddd'], { b: '#7A4A26', c: '#A0703F', d: '#5A3519' })
    f(6, 9, 18, 1, t)
    stamp(f, 23, 1, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(24, 2, 3, 3, 'rgba(169,214,245,.7)', 'it'); f(25, 6, 1, 4, '#7A4A26', 'it'); f(24, 2, 1, 1, '#fff', 'gl')
  },
  // Careful: engineer in a hard hat; the wrench turns a bolt.
  careful: (f, t) => {
    crabBody(f)
    stamp(f, 6, 4, ['.....yyyyyyyy.....', '...yyyyyhhyyyyy...', '..yyyyyyhhyyyyyy..', '..yyyyyyhhyyyyyy..', '.yyyyyyyhhyyyyyyy.', 'dddddddddddddddddd'], { y: '#F5C542', h: '#FBE08A', d: '#C99A1E' })
    f(13, 5, 4, 2, t)
    stamp(f, 0, 10, ['.s.s', 'sss.', '.s..', '.s..'], { s: '#8E929A' }, 'it')
  },
  // Medium: chef, the toque traced from DockCrab's Sprites.chefHat; tosses the omelette.
  medium: (f, t) => {
    crabBody(f, -4, 'pan')
    stamp(f, 6, 0, ['........lll.......', '.......lllll......', '.wwwwgwwwwwwgwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwgwwwwwggwwwww', '.wwwwgwwwwwggwwwww', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.'], { w: '#F4F3EE', l: '#F7F6F2', g: '#D2D1C8', b: t, d: '#B45F43' })
    f(22, 8, 7, 2, '#4A4A48', 'pan'); f(26, 10, 1, 1, '#4A4A48', 'pan'); f(24, 7, 3, 1, '#F5B731', 'egg')
  },
  // Light: racer in a helmet; runs at double pace, the checkered flag flutters.
  light: (f, t) => {
    crabBody(f, -4)
    stamp(f, 6, 5, ['....rrrrrrrrrr....', '..rrrrrrwwrrrrrr..', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.kkkkkkkkkkkkkkkkr'], { r: t, w: '#F8F6F1', k: INK })
    f(25, 1, 1, 9, '#8E929A')
    stamp(f, 26, 1, ['wkwk', 'kwkw', 'wkwk'], { w: '#F8F6F1', k: INK }, 'flag')
  },
  // Explore: pirate scouting the code; the cutlass fences.
  explore: f => {
    crabBody(f)
    stamp(f, 5, 3, ['.kk..............kk.', '.kkk....kkkk....kkk.', '..kkkkkkkwwkkkkkkk..', '..kkkkkkkkkkkkkkkk..', '.gggggggggggggggggg.'], { k: '#55514C', w: '#F8F6F1', g: '#F5C542' })
    f(7, 11, 11, 1, INK); f(18, 11, 4, 3, INK)
    f(27, 6, 1, 9, '#C9CCD2', 'it'); f(26, 15, 3, 1, '#7A4A26', 'it')
  },
  other: f => crabBody(f),
}

const costumeOf = (type: string): string => (type === 'Explore' ? 'explore' : tierOf(type))

const CRAB_SCALE = 1.1

// Body and props nest inside `bd` so a prop rides the bob and adds its own motion;
// legs stay outside it and step on their own. `mirror` flips the crab inside its
// own box (x .. x + CRAB_BOX * scale) so it faces left.
const crab = (x: number, y: number, costume: string, dim = false, isWalking = false, scale = CRAB_SCALE, mirror = false): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  const draw = COSTUMES[costume] ?? ((g: Fill) => crabBody(g))
  draw(f, colorOf(costume))
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  const place = mirror ? `translate(${x + CRAB_BOX * scale},${y}) scale(${-scale},${scale})` : `translate(${x},${y}) scale(${scale})`
  return `<g transform="${place}" opacity="${dim ? 0.45 : 1}" shape-rendering="crispEdges"><g class="c-${costume}${isWalking ? ' run' : ''}">${body}${group('la')}${group('lb')}</g></g>`
}

const statusMark = (x: number, y: number, status: string, color: string): string => {
  if (status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (status === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (status === 'failed') return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
  return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#9a9a96" stroke-width="1.4"/><path d="M${x} ${y - 2.5}v2.8l1.8 1.2" fill="none" stroke="#9a9a96" stroke-width="1.4" stroke-linecap="round"/>`
}

// Panel rows are laid out left to right; in Hebrew each box mirrors across the
// row (`mx`) and text hugs the mirrored side. `words` text may hold Hebrew and
// takes `direction="rtl"` (whose `start` is the right edge); numbers stay
// left to right so "≈$0.25" keeps its order.
const mx = (W: number, x: number, w = 0): number => (isRtl() ? W - x - w : x)

// Text that starts at x: left-aligned, or right-aligned at the mirrored x.
const startText = (W: number, x: number, y: number, words = true): string =>
  !isRtl()
    ? `x="${x}" y="${y}"`
    : `x="${W - x}" y="${y}"${words ? ' direction="rtl" text-anchor="start"' : ' text-anchor="end"'}`

// Text that ends at x: right-aligned, or left-aligned at the mirrored x.
const endText = (W: number, x: number, y: number, words = false): string =>
  !isRtl() ? `x="${x}" y="${y}" text-anchor="end"` : `x="${W - x}" y="${y}"${words ? ' direction="rtl" text-anchor="end"' : ''}`

const crabWidth = (scale: number): number => Math.round(CRAB_BOX * scale * 100) / 100

// A panel crab at x in a row of width W: on the mirrored side and facing left in Hebrew.
const rowCrab = (W: number, x: number, y: number, costume: string, dim = false, isWalking = false): string =>
  crab(mx(W, x, crabWidth(CRAB_SCALE)), y, costume, dim, isWalking, CRAB_SCALE, isRtl())

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${CRAB_CSS}${body}</svg>`

// The pane's own title already says "Agents": the header names the flow, if any.
const headerSvg = (W: number, title: string, t: ReturnType<typeof totals>): string => {
  const s = tr()
  const gap = 6
  const tw = (W - gap * 2) / 3
  const top = title ? 28 : 0
  const tile = (i: number, k: string, v: string) =>
    `<rect class="tile" x="${mx(W, i * (tw + gap), tw)}" y="${top}" width="${tw}" height="40" rx="8"/>
<text class="s" ${startText(W, i * (tw + gap) + 9, top + 16)} font-family="${FONT}" font-size="11">${k}</text>
<text class="t" ${startText(W, i * (tw + gap) + 9, top + 33, false)} font-family="${FONT}" font-size="15" font-weight="600" font-variant-numeric="tabular-nums">${v}</text>`
  return svg(
    W,
    headerHeight(title),
    `${title ? `<text class="t" ${startText(W, 0, 15)} font-family="${FONT}" font-size="14" font-weight="600">${xml(fitText(title, 14, W))}</text>` : ''}
${tile(0, s.cost, costText(t.cost, t.isPartial))}${tile(1, s.tokens, fmtTokens(t.tokens))}${tile(2, s.time, fmtTime(t.time))}`,
  )
}

const headerHeight = (title: string): number => (title ? 72 : 44)

// The task's own progress when the worker reports steps; a finished run is full.
const progressOf = (a: AgentRun): number | null => {
  if (a.type === 'main') return a.stepTotal ? Math.min(1, (a.stepDone ?? 0) / a.stepTotal) : null
  if (a.status === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)
  return null
}

const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

const agentSvg = (W: number, a: AgentRun, at: number): string => {
  const s = tr()
  const tier = tierOf(a.type)
  const color = colorOf(tier)
  const ctx = ctxOf(a)
  const textW = W - 42 - 22
  const meta = [runModel(a)]
  if (a.round > 1) meta.push(`${s.round} ${a.round}`)
  if (a.status === 'failed') meta.push(s.failed)
  if (a.isCarried) meta.push('이전 작업')
  const barW = textW
  const progress = progressOf(a)
  const stats = a.type === 'main' ? `${a.stepTotal ? '보고된 단계' : '단계 미보고'} · ${fmtTokens(a.tokens)}  ${costText(a.costUsd, a.isPriceUnknown)}  ${fmtTime(elapsed(a, at))}` : `${s.ctx} ${ctx}% · ${fmtTokens(a.contextTokens)}  ${costText(a.costUsd, a.isPriceUnknown)}  ${fmtTime(elapsed(a, at))}`
  const steps = a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' · ' + a.stepNote : ''}` : ''
  const stepsW = Math.max(0, barW - textWidth(stats, 11) - 12)
  // Without reported steps the bar falls back to the context, drawn grey.
  const fillW = Math.round(barW * (progress ?? ctx / 100))
  return svg(
    W,
    66,
    `${rowCrab(W, 0, 14, costumeOf(a.type), false, a.status === 'running')}
<text class="t" ${startText(W, 42, 18)} font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(a.description || a.type, 13, textW))}</text>
<text ${startText(W, 42, 34)} font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tier === 'other' ? a.type : tierWord(tier))}</tspan><tspan class="s">  ${xml(meta.join('  ·  '))}</tspan></text>
${steps && stepsW > 30 ? `<text class="t" ${startText(W, 42, 49)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(fitText(steps, 11, stepsW))}</text>` : ''}
<text class="s" ${endText(W, 42 + barW, 49, true)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${stats}</text>
<rect class="k" x="${mx(W, 42, barW)}" y="55" width="${barW}" height="4" rx="2"/><rect${progress === null ? ' class="m"' : ''} x="${mx(W, 42, fillW)}" y="55" width="${fillW}" height="4" rx="2"${progress === null ? '' : ` fill="${color}"`}/>
${statusMark(mx(W, W - 8), 16, a.status, color)}
<line class="ln" x1="0" y1="65.5" x2="${W}" y2="65.5"/>`,
  )
}

const plannedSvg = (W: number, p: Planned): string => {
  const tier = p.tier in TIER_COLOR ? p.tier : 'other'
  const color = colorOf(tier)
  const textW = W - 42 - 22
  const meta = [tierModel(tier)]
  if (p.after.length) meta.push(`${tr().after} ${p.after.join(', ')}`)
  return svg(
    W,
    46,
    `${rowCrab(W, 0, 6, tier, true)}
<text class="s" ${startText(W, 42, 18)} font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(`${p.n}. ${p.title}`, 13, textW))}</text>
<text ${startText(W, 42, 34)} font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tierWord(tier))}</tspan><tspan class="m">  ${xml(meta.filter(Boolean).join('  ·  '))}</tspan></text>
${statusMark(mx(W, W - 8), 16, 'planned', color)}
<line class="ln" x1="0" y1="45.5" x2="${W}" y2="45.5"/>`,
  )
}

const compactSvg = (W: number, list: AgentRun[], planned: Planned[], t: ReturnType<typeof totals>): string => {
  const icons = [
    ...list.filter(a => a.status === 'running').map(a => ({ k: costumeOf(a.type), c: colorOf(tierOf(a.type)), s: 'running', dim: false })),
    ...list.filter(a => a.status !== 'running').map(a => ({ k: costumeOf(a.type), c: colorOf(tierOf(a.type)), s: a.status, dim: false })),
    ...planned.map(p => ({ k: p.tier in TIER_COLOR ? p.tier : 'other', c: colorOf(p.tier), s: 'planned', dim: true })),
  ]
  const fit = Math.max(1, Math.floor((W - 150) / 36))
  const shown = icons.slice(0, fit)
  const more = icons.length - shown.length
  const body = shown
    .map((ic, i) => rowCrab(W, i * 36, 0, ic.k, ic.dim, ic.s === 'running') + (ic.s === 'running' ? `<circle class="live" cx="${mx(W, i * 36 + 32)}" cy="4" r="3" fill="${ic.c}"/>` : ''))
    .join('')
  const x = shown.length * 36 + (more ? 4 : 0)
  return svg(
    W,
    32,
    `${body}${more ? `<text class="s" ${startText(W, x, 21, false)} font-family="${FONT}" font-size="12">+${more}</text>` : ''}
<text class="s" ${endText(W, W, 21)} font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${costText(t.cost, t.isPartial)} · ${fmtTokens(t.tokens)} · ${fmtTime(t.time)}</text>`,
  )
}

// --- terminal drawing: the same rows in text.

const ctxBar = (pct: number, width: number): string => {
  const filled = Math.round((width * pct) / 100)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

const STATUS_GLYPH: Record<string, string> = { running: '●', done: '✓', failed: '✗', planned: '◷' }

// Opens the agents pane, or closes it when it is up; true when it ends up open.
async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await setClosedByUser($, true)
    await $.ui.close({ id: PANE })
    return false
  }
  await setClosedByUser($, false)
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: PANE, title: tr().pane }).catch(() => {})
  return true
}

async function autoOpen($: EngineInterface, key: string): Promise<void> {
  const p = await read($, panel)
  if (p.autoOpenedFor === key) return
  await update($, panel, prev => ({ ...prev, autoOpenedFor: key }))
  await openPane($)
}

// Opens the pane on the mod's own account, unless the person closed it: then only
// `/work-progress` brings it back.
async function openPane($: EngineInterface): Promise<void> {
  if ((await read($, panel)).isClosedByUser) return
  await $.ui.open({ id: PANE, title: tr().pane }).catch(() => {})
}

const setClosedByUser = ($: EngineInterface, isClosed: boolean) => update($, panel, p => ({ ...p, isClosedByUser: isClosed }))

// The end of a main turn says how the turn ended, not whether the work is done.
// A turn with nothing reported only answered. A reported flow is complete only when the
// model says `finished: true`: all steps done is not enough, since a check may remain.
const endOfTurn = (f: Flow, reason: string): Flow => {
  if (f.isFinished) return f
  if (reason !== 'answer') return { ...f, state: reason === 'aborted' || reason === 'interrupted' ? 'stopped' : 'error' }
  if (!f.total && !f.tasks.length) return { ...f, isFinished: true }
  return { ...f, state: 'waiting' }
}

// The session's own context window, when the engine reports it; else the model's guess stays.
async function contextWindow($: EngineInterface): Promise<number | undefined> {
  try {
    const w = (await $.session.usage()).context?.window
    return typeof w === 'number' && w > 0 ? w : undefined
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Other sessions of the same project. Each session is its own process, so the panel
// cannot see another's state: every session writes a small summary of its own work
// to a shared folder, and reads the summaries of sessions working in its project
// worktrees (`.claude/worktrees/…` under its project, where the sessions it starts run). The app's parent-child link is not visible to a mod; the folder is.

const PEER_TTL = 24 * 3600_000
const ENDED_TTL = 2 * 3600_000
const MAX_PEERS = 20
let selfId = ''
let selfRoot = ''
let selfCwd = ''
let peersDir = ''
let lastPublish = 0

const isUnder = (path: string, base: string): boolean => !!path && !!base && (path === base || path.startsWith(base + '/'))

// A peer works in this project's folder or in a worktree under it; this session is not its own peer.
const isPeer = (p: SessionSnap, at: number): boolean => {
  if (!p || p.id === selfId || typeof p.updatedAt !== 'number') return false
  if (at - p.updatedAt > (p.state === 'ended' ? ENDED_TTL : PEER_TTL)) return false
  const trees = `${selfRoot}/.claude/worktrees`
  return isUnder(p.cwd, trees) || isUnder(p.root, trees)
}

const snapState = (f: Flow | null, m: AgentRun | null, isEnded: boolean): SessionSnap['state'] => {
  if (isEnded) return 'ended'
  if (!f) return 'idle'
  if (f.isFinished && (f.total || f.tasks.length)) return 'finished'
  if (m?.status === 'running') return 'working'
  return f.state ?? 'idle'
}

async function setUpPeers($: EngineInterface): Promise<void> {
  try {
    selfId = await $.session.id()
    selfRoot = await $.session.root()
    selfCwd = await $.session.cwd()
    const home = await $.env.get('HOME')
    const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home ? `${home}/.claude` : '')
    peersDir = config ? `${config}/mirang-progress/sessions` : ''
  } catch {
    peersDir = ''
  }
}

// Writes this session's summary for its peers; never fails the hook that calls it.
async function publish($: EngineInterface, isEnded = false): Promise<void> {
  if (!peersDir || !selfId) return
  try {
    const at = await $.clock.now()
    const f = await read($, flow)
    const m = await read($, main)
    const list = await read($, agents)
    const t = totals(m ? [m, ...list] : list, at)
    const snap: SessionSnap = {
      id: selfId,
      root: selfRoot,
      cwd: selfCwd,
      title: f && f.title !== '작업 대기' ? f.title : '',
      label: f ? label(f) : '',
      done: f?.done ?? 0,
      total: f?.total ?? 0,
      state: snapState(f, m, isEnded),
      costUsd: t.cost,
      tokens: t.tokens,
      isPartial: t.isPartial,
      workers: list.filter(a => a.status === 'running' && !a.isCarried).length,
      activeMs: t.time,
      updatedAt: at,
    }
    lastPublish = at
    await $.fs.write(`${peersDir}/${selfId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`, JSON.stringify(snap))
  } catch {
    // A summary that could not be written only leaves the peers' panels a little behind.
  }
}

// Reads the peers' summaries; redraws only when something changed.
async function refreshPeers($: EngineInterface): Promise<void> {
  if (!peersDir || !selfRoot) return
  try {
    const at = await $.clock.now()
    const entries = await $.fs.list(peersDir)
    const found: SessionSnap[] = []
    for (const en of entries) {
      if (en.kind !== 'file' || !en.name.endsWith('.json')) continue
      if (typeof en.mtimeMs === 'number' && at - en.mtimeMs > PEER_TTL) continue
      try {
        const snap = JSON.parse(String(await $.fs.read(`${peersDir}/${en.name}`))) as SessionSnap
        if (isPeer(snap, at)) found.push(snap)
      } catch {
        continue
      }
    }
    found.sort((a, b) => b.updatedAt - a.updatedAt)
    const next = found.slice(0, MAX_PEERS)
    const prev = await read($, peers)
    if (JSON.stringify(prev) !== JSON.stringify(next)) await update($, peers, () => next)
  } catch {
    // No folder yet: no peer has written.
  }
}

// Summaries older than a week are removed once per session start; a refusal costs nothing.
async function pruneSummaries($: EngineInterface): Promise<void> {
  if (!peersDir) return
  await $.process.run(['find', peersDir, '-maxdepth', '1', '-type', 'f', '-name', '*.json', '-mtime', '+7', '-delete']).catch(() => undefined)
}

// Until the model has reported progress once, the panel says how to make it report.
const HINT_LINE = '- 여러 단계 작업은 시작할 때와 단계를 마칠 때마다 mirang-progress 진행도 도구(mcp__mirang-progress__progress)로 제목·전체 단계·완료 단계를 보고한다.'
const HINT_LINES = 4

async function hideHint($: EngineInterface): Promise<void> {
  if ((await read($, panel)).isHintHidden) return
  await update($, panel, p => ({ ...p, isHintHidden: true }))
  await $.store.set('hintHidden', true).catch(() => {})
}

const PEER_WORD: Record<SessionSnap['state'], string> = {
  working: '진행 중', waiting: '답변 대기', stopped: '중단', error: '오류', finished: '완료', idle: '대기', ended: '세션 종료',
}

// Where a peer works, in a few words: its worktree's name, or the project folder's.
const peerPlace = (p: SessionSnap): string => {
  const base = (p.cwd || p.root).split('/').filter(Boolean).pop() ?? ''
  return base.replace(/-[0-9a-f]{6}$/, '')
}

const ago = (ms: number): string => (ms < 60_000 ? '방금' : ms < 3600_000 ? `${Math.round(ms / 60_000)}분 전` : `${Math.round(ms / 3600_000)}시간 전`)

const peerStatus = (p: SessionSnap): string => (p.state === 'working' ? 'running' : p.state === 'finished' ? 'done' : p.state === 'error' || p.state === 'stopped' ? 'failed' : 'planned')

const peerSvg = (W: number, p: SessionSnap, at: number): string => {
  const color = p.state === 'working' ? ACCENT : p.state === 'finished' ? DONE : p.state === 'waiting' ? WAIT : p.state === 'error' || p.state === 'stopped' ? HALT : '#888780'
  const textW = W - 42 - 22
  const steps = p.total ? `${p.done}/${p.total}` : '단계 미보고'
  const meta = [PEER_WORD[p.state] ?? p.state, peerPlace(p), p.workers ? `작업자 ${p.workers}` : ''].filter(Boolean).join('  ·  ')
  const stats = `${fmtTokens(p.tokens)}  ${costText(p.costUsd, p.isPartial)}  ${fmtTime(p.activeMs)}  ·  ${ago(at - p.updatedAt)}`
  const fillW = Math.round(textW * (p.total ? Math.min(1, p.done / p.total) : 0))
  return svg(
    W,
    66,
    `${rowCrab(W, 0, 14, 'other', p.state !== 'working', p.state === 'working')}
<text class="t" ${startText(W, 42, 18)} font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(p.title || peerPlace(p) || '세션', 13, textW))}</text>
<text ${startText(W, 42, 34)} font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(meta)}</tspan></text>
<text class="t" ${startText(W, 42, 49)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(steps)}</text>
<text class="s" ${endText(W, 42 + textW, 49, true)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(stats)}</text>
<rect class="k" x="${mx(W, 42, textW)}" y="55" width="${textW}" height="4" rx="2"/><rect x="${mx(W, 42, fillW)}" y="55" width="${fillW}" height="4" rx="2" fill="${color}"/>
${statusMark(mx(W, W - 8), 16, peerStatus(p), color)}
<line class="ln" x1="0" y1="65.5" x2="${W}" y2="65.5"/>`,
  )
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($, options.language)
    await setUpPeers($)
    await publish($)
    await refreshPeers($)
    await pruneSummaries($)
    if ((await $.store.get('hintHidden').catch(() => undefined)) === true) await update($, panel, p => ({ ...p, isHintHidden: true }))
    // Other sessions of the project: read their summaries every few seconds.
    $.clock.every(3000, () => void refreshPeers($))
    await update($, flow, p => p ?? blank())
    await openPane($)
    await $.tool.register({
      name: 'progress',
      isDeferred: false,
      description:
        'Report progress for any task to the progress bar above the prompt and the agents panel. ' +
        'Call it after presenting the plan (title, total, tasks, phase "delegate"), each time a task is accepted (done), ' +
        'when switching phase or re-planning (tasks), and once at the end with finished: true. Fields left out keep their previous value. ' +
        'For the main session only: a call from a subagent is ignored (workers report with `step`).',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name of the overall task, a few words.' },
          total: { type: 'integer', minimum: 0, description: 'Number of real planned steps (including direct work).' },
          done: { type: 'integer', minimum: 0, description: 'Number of actually completed steps.' },
          phase: { type: 'string', enum: [...PHASES] },
          finished: { type: 'boolean', description: 'True once the flow is closed.' },
          tasks: {
            type: 'array',
            description:
              'The planned worker tasks in order, numbered from 1. Each title must equal the Agent tool `description` the task will be delegated with, so the panel can match runs to tasks.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'A few words; reused verbatim as the Agent description.' },
                tier: { type: 'string', enum: [...TIERS] },
                after: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the tasks this one waits for.' },
              },
              required: ['title', 'tier'],
            },
          },
        },
      },
    })
    await $.tool.register({
      name: 'step',
      description:
        'For any subagent: report progress on your own task to the agents panel. ' +
        'Right after reading the brief, call it with `total` (your plan in 3-8 steps) and `done: 0`; ' +
        'call it again as each step finishes. Cheap and silent: it only draws a bar.',
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
          total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
          note: { type: 'string', description: 'The step in progress, a few words.' },
        },
        required: ['done'],
      },
      // Optional self-reporting tool, without changing agent briefs.
      // In every agent's tool list, not behind ToolSearch: workers do not go looking for it.
      isDeferred: false,
    })
    await $.command.register({
      name: 'work-progress',
      description: 'Show or hide the panel of subagents: running, finished and planned, with model, context, cost and time',
    })

    // Ticks the running agents' clocks; quiet when nothing runs.
    $.clock.every(1000, () => {
      void (async () => {
        const list = await read($, agents)
        if (!list.some(a => a.status === 'running') && (await read($, main))?.status !== 'running') return
        const at = await $.clock.now()
        await update($, now, () => at)
        if (at - lastPublish >= 5000) await publish($)
      })()
    })
    return started
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      const at = await $.clock.now()
      const prev = await read($, flow)
      // A flow that was not finished goes on: the person answered a question, or picks
      // up after an interrupt. Its counts, its workers and the main run's totals stay.
      // Turns with nothing reported are one ongoing "current work" too: a turn ending is
      // no task boundary, so workers launched in one turn stay in view in the next.
      // Only a reported flow's `finished`, or a new title, starts over.
      const isUnreported = !!prev && !prev.total && !prev.tasks.length
      const isContinuing =
        !!prev && (!prev.isFinished || isUnreported) && prev.title !== '작업 대기' && !prev.title.startsWith('중단 · ')
      await update($, flow, p => (isContinuing && p ? { ...p, state: undefined, isFinished: false } : { ...blank(), title: '현재 작업' }))
      if (!isContinuing) await update($, agents, carryOver)
      const window = await contextWindow($)
      await update($, main, (m): AgentRun | null =>
        isContinuing && m
          ? { ...m, status: 'running', priorMs: elapsed(m, m.endedAt ?? at), startedAt: at, endedAt: undefined, round: m.round + 1, contextMax: window ?? m.contextMax }
          : { id: 'main', type: 'main', description: '메인 작업', model: '', status: 'running', startedAt: at, contextTokens: 0, contextMax: window ?? 200000, tokens: 0, costUsd: 0, steps: 0, round: 1 },
      )
      await update($, now, () => at)
      await openPane($)
      await publish($)
    }
    if (e.agentId) {
      // A worker runs again (its own background work reported back): it is working,
      // not finished, and its earlier runs' time stays counted.
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map((a): AgentRun =>
          a.agentId === e.agentId && a.status !== 'running'
            ? { ...a, status: 'running', priorMs: elapsed(a, a.endedAt ?? at), startedAt: at, endedAt: undefined }
            : a,
        ),
      )
    }
    return next(e)
  })

  // The session closes: its peers see it ended, then let it go.
  on('session.end', async ($, e, next) => {
    await publish($, true)
    return next(e)
  })

  // The person closed the pane: it stays closed until they open it again.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await setClosedByUser($, true)
    return next(e)
  })

  on('command.run', { command: 'work-progress' }, async ($, e) => {
    // `/work-progress open` opens the panel, or brings it forward from behind another tab, without toggling it.
    if ((e.args ?? '').trim() === 'open') {
      await setClosedByUser($, false)
      const at = await $.clock.now()
      await update($, now, () => at)
      await $.ui.open({ id: PANE, title: tr().pane }).catch(() => {})
      return { text: tr().opened }
    }
    const isOpen = await togglePane($)
    return { text: isOpen ? tr().opened : tr().closed }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // The flow is the main session's: a call from a worker's loop carries its agentId
    // and changes nothing, or any subagent could rename, finish or reset the flow.
    if (e.agentId) return { result: 'ignored: only the main session reports the flow' }
    const input = e as unknown as ProgressInput
    const prev = await read($, flow)
    if (isNewFlow(prev, input) && input.title !== undefined) {
      // A new flow starts with a clean list; agents still running stay. The main run's
      // totals start over with it, so the panel sums one flow, not two.
      await update($, agents, carryOver)
      if (await read($, main)) {
        const at = await $.clock.now()
        await update($, main, m => (m ? { ...m, tokens: 0, costUsd: 0, steps: 0, priorMs: 0, startedAt: at, round: 1, isPriceUnknown: false } : m))
      }
    }
    const next = await update($, flow, p => merge(p, input))
    await hideHint($)
    if (next && input.tasks?.length) await autoOpen($, next.title)
    await publish($)
    return { result: `ok: ${label(next ?? blank())}` }
  })

  // A worker's own progress: the call runs in the worker's loop, so agentId names it.
  on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
    const input = e as unknown as { done?: number; total?: number; note?: string }
    const agentId = e.agentId
    if (!agentId) return { result: 'ignored: only subagents report steps' }
    let matched = false
    await update($, agents, list =>
      list.map(a => {
        if (a.agentId !== agentId) return a
        matched = true
        const total = Math.max(0, Math.round(input.total ?? a.stepTotal ?? 0))
        const done = Math.max(0, Math.round(input.done ?? a.stepDone ?? 0))
        return { ...a, stepTotal: total, stepDone: total ? Math.min(total, done) : done, stepNote: input.note?.trim() || undefined }
      }),
    )
    return { result: matched ? 'ok' : `ignored: no panel row for agent ${agentId}` }
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    await update($, agents, list => {
      const round = 1 + list.filter(a => norm(a.description) === norm(e.description) && e.description).length
      const run: AgentRun = {
        id: started.agentId ?? e.tool_use_id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        round,
      }
      // A resumed run spawns again under the same id: it keeps its tokens, cost and time.
      const known = list.find(a => a.id === run.id)
      if (known) {
        const resumed: AgentRun = {
          ...known,
          model: started.model || known.model,
          status: 'running',
          priorMs: known.status === 'running' ? known.priorMs : elapsed(known, known.endedAt ?? at),
          startedAt: known.status === 'running' ? known.startedAt : at,
          endedAt: undefined,
        }
        return list.map(a => (a.id === run.id ? resumed : a))
      }
      return [...list, run].slice(-200)
    })
    await update($, now, () => at)
    await autoOpen($, 'any-agent')
    return started
  })

  // Each model request: live context, tokens and cost, for the main session and each subagent.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const usage = result.usage
    if (!usage) return result

    const model = usage.model || e.model
    if (!agentId) {
      const window = await contextWindow($)
      await update($, main, p => (p ? { ...withRequest(p, model, usage), ...(window ? { contextMax: window } : {}) } : p))
      return result
    }
    await update($, agents, list =>
      list.map((a): AgentRun =>
        a.agentId !== agentId
          ? a
          : {
              ...a,
              model,
              effort: typeof e.effort === 'string' ? e.effort : a.effort,
              status: 'running',
              endedAt: undefined,
              contextTokens:
                (usage.input_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0) +
                (usage.output_tokens || 0),
              contextMax: windowOf(model),
              tokens:
                a.tokens +
                (usage.input_tokens || 0) +
                (usage.output_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0),
              costUsd: a.costUsd + costOf(model, usage, true),
              isPriceUnknown: a.isPriceUnknown || !isPriced(model),
              steps: a.steps + 1,
            },
      ),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (!agentId) {
      const at = await $.clock.now()
      await update($, main, (p): AgentRun | null => {
        if (!p) return p
        // A turn whose requests went unseen still gets the turn's own sum.
        const seen = p.steps === 0 && e.usage ? { ...withRequest(p, e.usage.model || p.model, e.usage), costUsd: costOf(e.usage.model || p.model, e.usage, false), isPriceUnknown: !isPriced(e.usage.model || p.model) } : p
        return { ...seen, status: e.reason === 'answer' ? 'done' : 'failed', endedAt: at }
      })
      await update($, flow, p => (p ? endOfTurn(p, e.reason) : p))
      await update($, now, () => at)
    }
    if (agentId) {
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map((a): AgentRun => {
          if (a.agentId !== agentId) return a
          // A run whose steps went unseen still gets the turn's own sum.
          const fallback = a.steps === 0 && e.usage
          return {
            ...a,
            status: e.reason === 'answer' ? 'done' : 'failed',
            endedAt: at,
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || a.model,
                  tokens:
                    e.usage.input_tokens +
                    e.usage.output_tokens +
                    e.usage.cache_read_input_tokens +
                    e.usage.cache_creation_input_tokens,
                  costUsd: costOf(e.usage.model || a.model, e.usage, false),
                  isPriceUnknown: !isPriced(e.usage.model || a.model),
                }
              : {}),
          }
        }),
      )
      await update($, now, () => at)
    }
    await publish($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const workerList = await read($, agents)
    const current = await read($, main)
    const f = await read($, flow)
    const peerList = await read($, peers)
    const list = current ? [{ ...current, description: f?.title || '메인 작업', stepDone: f?.done, stepTotal: f?.total || undefined }, ...workerList] : workerList
    const p: Panel = await read($, panel)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)

    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()
    const planned = plannedOf(f, list)
    const t = totals(list, at)
    // The pane's title says "Agents"; inside, only the flow's own name.
    const title = f && !f.isFinished ? f.title : ''

    const toggleCompact = (
      <Button
        key="compact"
        label={p.isCompact ? s.expand : s.collapse}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isCompact: !prev.isCompact }))}
      />
    )
    const toggleDone = (
      <Button
        key="done"
        label={`${p.isDoneCollapsed ? (isRtl() ? '◂' : '▸') : '▾'} ${s.finished} · ${finished.length}`}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
      />
    )
    const isEmpty = list.length === 0 && planned.length === 0 && peerList.length === 0
    const peerHead = `하위 세션 · ${peerList.length}`
    const showHint = !p.isHintHidden && !!f && !f.total && !f.tasks.length
    const hint = showHint ? (
      <Box key="hint" flexDirection="column" marginBottom={1}>
        <Text dimColor>진행 막대는 Claude가 진행도를 보고해야 채워집니다. CLAUDE.md에 아래 한 줄을 넣으세요.</Text>
        <Text>{HINT_LINE}</Text>
        <Button key="hint-close" label="안내 닫기" plain onPress={() => hideHint($)} />
      </Box>
    ) : null
    const summary = `${costText(t.cost, t.isPartial)}, ${fmtTokens(t.tokens)} ${s.tokensWord}, ${fmtTime(t.time)}`

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))
      const section = (key: string, text: string) => (
        <Text key={key} dimColor>
          {text}
        </Text>
      )

      // In Hebrew the column hugs the right edge: section heads and buttons right-aligned.
      const align = isRtl() ? 'flex-end' : undefined
      if (p.isCompact) {
        return (
          <Box flexDirection="column" gap={1} alignItems={align}>
            <Svg source={compactSvg(W, list, planned, t)} alt={`${list.length} ${s.agentsCount}, ${summary}`} width={W} height={32} />
            {toggleCompact}
          </Box>
        )
      }
      const shownDone = p.isDoneCollapsed ? 0 : finished.length
      const lines = 1 + (showHint ? HINT_LINES + 2 : 0) + (isEmpty ? 1 : 0) + (running.length > 0 ? 1 : 0) + (finished.length > 0 ? 1 : 0) + (planned.length > 0 ? 1 : 0) + (peerList.length > 0 ? 1 : 0)
      const gridH = headerHeight(title) + lines * LINE_H + (running.length + shownDone + peerList.length) * 66 + planned.length * 46
      return (
        <Box flexDirection="column">
          {/* The grid sizes the pane; the content is placed over it, as an
              absolute Box paints over the siblings before it. */}
          {gridTiles(gridH).map((tileH, i) => (
            <Svg key={`grid-${i}`} source={gridSvg(W, tileH)} alt="dotted grid" width={W} height={tileH} />
          ))}
          <Box flexDirection="column" position="absolute" top={0} left={0} right={0} alignItems={align}>
            <Svg source={headerSvg(W, title, t)} alt={title ? `${title}: ${summary}` : summary} width={W} height={headerHeight(title)} />
            {toggleCompact}
            {hint}
            {isEmpty && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && section('h-run', `${s.running} · ${running.length}`)}
            {running.map(a => (
              <Svg key={a.id} source={agentSvg(W, a, at)} alt={`${a.description}: ${modelName(a.model)}, ${s.isRunning}`} width={W} height={66} />
            ))}
            {peerList.length > 0 && section('h-peer', peerHead)}
            {peerList.map(pe => (
              <Svg
                key={`peer-${pe.id}`}
                source={peerSvg(W, pe, Math.max(at, pe.updatedAt))}
                alt={`${pe.title || peerPlace(pe)}: 하위 세션, ${PEER_WORD[pe.state] ?? pe.state}, ${pe.total ? `${pe.done}/${pe.total}` : '단계 미보고'}, ${costText(pe.costUsd, pe.isPartial)}`}
                width={W}
                height={66}
              />
            ))}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed &&
              finished.map(a => (
                <Svg key={a.id} source={agentSvg(W, a, at)} alt={`${a.description}: ${modelName(a.model)}, ${s.isFinished}`} width={W} height={66} />
              ))}
            {planned.length > 0 && section('h-plan', `${s.planned} · ${planned.length}`)}
            {planned.map(pl => (
              <Svg key={`plan-${pl.n}`} source={plannedSvg(W, pl)} alt={`${pl.n}. ${pl.title}: ${s.isPlanned}`} width={W} height={46} />
            ))}
          </Box>
        </Box>
      )
    }

    // Terminal: the same content in text rows.
    const cols = Math.max(24, e.props.bodyColumns || 40)
    const barW = Math.max(6, Math.min(20, cols - 34))
    const row = (a: AgentRun) => {
      const tier = tierOf(a.type)
      const color = colorOf(tier)
      const ctx = ctxOf(a)
      const progress = progressOf(a)
      const model = runModel(a)
      const steps = a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' ' + a.stepNote : ''} · ` : ''
      return (
        <Box key={a.id} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={color}>▣</Text>
            <Text bold wrap="truncate-end">
              {a.description || a.type}
            </Text>
            <Text color={a.status === 'failed' ? 'red' : a.status === 'done' ? 'green' : color}>{STATUS_GLYPH[a.status]}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {tier === 'other' ? a.type : tierWord(tier)} · {model}
            {a.round > 1 ? ` · ${s.round} ${a.round}` : ''}
          </Text>
          <Text wrap="truncate-end">
            {'  '}
            {progress === null ? <Text dimColor>{ctxBar(ctx, barW)}</Text> : <Text color={color}>{ctxBar(progress * 100, barW)}</Text>}
            <Text dimColor>
              {' '}
              {steps}{s.ctx} {ctx}% · {fmtTokens(a.contextTokens)} {costText(a.costUsd, a.isPriceUnknown)} {fmtTime(elapsed(a, at))}
            </Text>
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate-end">
            {title}
          </Text>
          {toggleCompact}
        </Box>
        <Text dimColor>
          {costText(t.cost, t.isPartial)} · {fmtTokens(t.tokens)} {s.tokensWord} · {fmtTime(t.time)}
        </Text>
        {p.isCompact ? (
          <Text wrap="truncate-end">
            {[...running, ...finished].map(a => (
              <Text key={a.id} color={colorOf(tierOf(a.type))}>
                {STATUS_GLYPH[a.status]}{' '}
              </Text>
            ))}
            {planned.map(pl => (
              <Text key={`plan-${pl.n}`} dimColor>
                ◷{' '}
              </Text>
            ))}
          </Text>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            {hint}
            {isEmpty && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && <Text dimColor>{s.running} · {running.length}</Text>}
            {running.map(row)}
            {peerList.length > 0 && <Text dimColor>{peerHead}</Text>}
            {peerList.map(pe => (
              <Box key={`peer-${pe.id}`} flexDirection="column" marginBottom={1}>
                <Text bold wrap="truncate-end">
                  ▤ {pe.title || peerPlace(pe) || '세션'}
                </Text>
                <Text dimColor wrap="truncate-end">
                  {'  '}
                  {PEER_WORD[pe.state] ?? pe.state} · {peerPlace(pe)}
                  {pe.workers ? ` · 작업자 ${pe.workers}` : ''} · {pe.total ? `${pe.done}/${pe.total}` : '단계 미보고'} · {costText(pe.costUsd, pe.isPartial)} · {ago(Math.max(0, at - pe.updatedAt))}
                </Text>
              </Box>
            ))}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed && finished.map(row)}
            {planned.length > 0 && <Text dimColor>{s.planned} · {planned.length}</Text>}
            {planned.map(pl => {
              const tier = pl.tier in TIER_COLOR ? pl.tier : 'other'
              return (
                <Box key={`plan-${pl.n}`} flexDirection="column" marginBottom={1}>
                  <Text dimColor wrap="truncate-end">
                    <Text color={colorOf(tier)}>▢</Text> {pl.n}. {pl.title} ◷
                  </Text>
                  <Text dimColor wrap="truncate-end">
                    {'  '}
                    {tierWord(tier)} · {tierModel(tier)}
                    {pl.after.length ? ` · ${s.after} ${pl.after.join(', ')}` : ''}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const f = await read($, flow)
    if (f === null || e.props.hasSurvey) return next(e)
    // Draw this row with the other mods' bands beneath it. Claude Code's own placeholder ({ type: 'engine' }) is
    // never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const crew = list.length + plannedOf(f, list).length + ((await read($, main)) ? 1 : 0)
    const isWorking = e.props.isWorking || list.some(a => a.status === 'running')
    const crewButton = (
      <Button key="mirang-agents" label={`×${crew}`} plain onPress={() => void togglePane($)} />
    )
    const percent = (f.total ? `${Math.round(ratio(f) * 100)}%` : '—')
    const dismiss = (
      <Button
        key="mirang-dismiss"
        label="✕"
        plain
        role="dismiss"
        onPress={() => update($, flow, () => null)}
      />
    )

    // The terminal's element table is completed with an `Svg` that draws nothing: test the surface too.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      // About 8 CSS px per reported column; the rest is the count, the dismiss
      // and their gaps. No floor above the slot: a row wider than it would wrap.
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 96))
      return (
        <Box flexDirection="column">
          <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" gap={1}>
            <Svg source={rowSvg(f, width, isWorking)} alt={`${f.title}: ${label(f)}, ${percent}`} width={width} height={H} />
            {crewButton}
            {dismiss}
          </Box>
          {below}
        </Box>
      )
    }

    const cols = e.props.bodyColumns
    const titleW = Math.max(8, Math.min(30, f.title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 32))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Box width={titleW} flexShrink={0}>
            <Text color={flowColor(f)}>● </Text>
            <Text wrap="truncate-end">{f.title}</Text>
          </Box>
          <Text color={flowColor(f)}>{barText(f, width)}</Text>
          <Text bold>{label(f)}</Text>
          <Text dimColor>{percent}</Text>
          <Text color={CLAY}>▣</Text>
          {crewButton}
          {dismiss}
        </Box>
        {below}
      </Box>
    )
  })
}
