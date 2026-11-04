import { describe, expect, mock, test } from 'claude-code/testing'

import { advise, kshort, untilKo } from '../hooks/advice'

describe('mirang-usage', () => {
  test('판단 단계', async () => {
    expect(advise({ percent: 10, tokens: 20_000, isCacheCold: false }).level).toBe(0)
    expect(advise({ percent: 45, tokens: 90_000, isCacheCold: false }).level).toBe(1)
    expect(advise({ percent: 30, tokens: 90_000, isCacheCold: true }).level).toBe(1)
    expect(advise({ percent: 55, tokens: 110_000, isCacheCold: false, fiveHour: 85 }).level).toBe(2)
    expect(advise({ percent: 65, tokens: 130_000, isCacheCold: false }).level).toBe(2)
    expect(advise({ percent: 76, tokens: 152_000, isCacheCold: true }).level).toBe(2)
    expect(advise({ percent: 82, tokens: 164_000, isCacheCold: false }).text).not.toContain('/park')
    expect(advise({ percent: 82, tokens: 164_000, isCacheCold: false }).level).toBe(3)
  })

  test('한국식 숫자와 남은 시간', async () => {
    expect(kshort(134_400)).toBe('13.4만')
    expect(kshort(9_800)).toBe('9,800')
    expect(untilKo(new Date(133 * 60_000).toISOString(), 0)).toBe('2시간 13분 후')
    expect(untilKo(undefined, 0)).toBe('')
  })

  test('입력창 위 띠가 한글로 그려진다', async ($, on) => {
    let tokens = 36_100
    on('clock.now', () => ({ value: 0 }) as any)
    on('session.start', (_$, e) => ({ sessionId: 's', cwd: e.cwd }) as any)
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        rateLimits: [{ kind: 'five_hour', percentUsed: 42 }, { kind: 'seven_day', percentUsed: 18 }],
        context: { tokens, window: 200_000, percent: Math.round(tokens / 2_000) },
        cost: { usd: 1.234 },
      },
    }) as any)
    on('turn.complete', () => ({ text: '' }) as any)
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return Text({ children: 'engine band' }) as any
    })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

    const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } }
    const ui = await $.ui.mount({ plugin: 'mirang-usage', surface: 'terminal', ...BAND } as any)
    expect(await ui.find({ type: 'Text', text: /맥락 18%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /요금제 5시간 42% · 7일 18% · 이번 세션 \$1\.23/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /🟢/ })).toBeDefined()

    tokens = 164_000
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1 } as any)
    expect(await ui.find({ type: 'Text', text: /맥락 82%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /직전 \+12\.8만/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /🔴 맥락 80% 이상/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /engine band/ })).toBeDefined()
    await ui.unmount()
  })

  test('시간이 흐르면 리셋 시간이 다시 그려진다', async ($, on) => {
    const clock = mock.clock(on, { now: 0 })
    on('session.start', (_$, e) => ({ sessionId: 's', cwd: e.cwd }) as any)
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        rateLimits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: new Date(30 * 60_000).toISOString() }],
        context: { tokens: 36_100, window: 200_000, percent: 18 },
      },
    }) as any)
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return Text({ children: 'engine band' }) as any
    })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)

    const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } }
    const ui = await $.ui.mount({ plugin: 'mirang-usage', surface: 'terminal', ...BAND } as any)
    expect(await ui.find({ type: 'Text', text: /30분 후 리셋/ })).toBeDefined()
    await clock.advance(60_000)
    expect(await ui.find({ type: 'Text', text: /29분 후 리셋/ })).toBeDefined()
    await clock.advance(9 * 60_000)
    expect(await ui.find({ type: 'Text', text: /20분 후 리셋/ })).toBeDefined()
    await ui.unmount()
  })

  test('캐시 시간은 추정으로 표시하고, 만료되는 순간 한 번 알린다', async ($, on) => {
    const clock = mock.clock(on, { now: 0 })
    const toasts: string[] = []
    on('ui.toast', (_$, e: any) => { toasts.push(String(e.text ?? e.message ?? JSON.stringify(e))); return { value: undefined } as any })
    on('session.start', (_$, e) => ({ sessionId: 's', cwd: e.cwd }) as any)
    on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { tokens: 160_000, window: 1_000_000, percent: 16 } } }) as any)
    on('turn.step', async function* (_$, e: any) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as any
    })
    on('turn.complete', () => ({ text: '' }) as any)
    on('ui.render', ($, e) => {
      const { Text } = $.ui.resolve(e)
      return Text({ children: 'engine band' }) as any
    })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
    for await (const _ of ($.turn.step as any)({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 })) void _
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1 } as any)
    expect(toasts).toEqual([])

    const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } }
    const ui = await $.ui.mount({ plugin: 'mirang-usage', surface: 'terminal', ...BAND } as any)
    expect(await ui.find({ type: 'Text', text: /캐시 약 5:00 남음\(5분 가정\)/ })).toBeDefined()

    await clock.advance(5 * 60_000 + 1000)
    expect(toasts.length).toBe(1)
    expect(toasts[0]).toContain('같은 작업이면 계속')
    expect(await ui.find({ type: 'Text', text: /캐시 만료\(5분 가정\)/ })).toBeDefined()
    await ui.unmount()
  })
})
