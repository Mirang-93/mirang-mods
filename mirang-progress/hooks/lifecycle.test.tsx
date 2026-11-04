import { expect, mock, test } from 'claude-code/testing'
const PLUGIN = 'mirang-progress'
const TOOL = 'mcp__mirang-progress__progress'
const band = { hasSurvey: false, isWorking: true, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

async function start($: any, on: any, opened: string[] = []) {
  mock.clock(on)
  on('ui.open', (_$: any, e: any) => { opened.push(e.id); return { value: { isPlaced: true } } })
  on('ui.close', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/repo' }))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('tool.register', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'desktop', isInteractive: true })
}
async function svg($: any) {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  const value = String((await ui.find({ type: 'Svg' }))?.props.source)
  await ui.unmount()
  return value
}
test('direct work: panel opens and main character exists without any worker', async ($, on) => {
  await start($, on)
  expect(await svg($)).toContain('작업 대기')
  await $.turn.start({ turnId: 'one', text: 'inspect files' } as never)
  expect(await svg($)).toContain('단계 미보고')
  expect(await svg($)).not.toContain('>100%</text>')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'mirang-agents', props: pane })
  expect((await ui.findAll({ type: 'Svg' })).some(el => String(el.props.alt).includes('현재 작업:') && String(el.props.alt).includes('진행 중'))).toBe(true)
})
test('main response completion never invents task progress', async ($, on) => {
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  await $.turn.complete({ turnId: 'one', reason: 'answer', answer: 'ok' } as never)
  const row = await svg($)
  expect(row).toContain('응답 완료')
  expect(row).not.toContain('>100%</text>')
})
test('interrupted turn is not marked completed', async ($, on) => {
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  await $.turn.complete({ turnId: 'one', reason: 'interrupted', answer: '' } as never)
  expect(await svg($)).toContain('중단')
  expect(await svg($)).not.toContain('응답 완료')
})
test('any worker prompt passes through untouched', async ($, on) => {
  let seen = ''
  on('agent.spawn', (_$: any, e: any) => { seen = e.prompt; return { agentId: 'a1', model: 'sonnet' } })
  await start($, on)
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'original instructions', description: 'review', subagentType: 'savvy-careful', provider: 'engine', parentModel: 'sonnet', background: false, fork: false } as never)
  expect(seen).toBe('original instructions')
})
test('explicit progress reports completed real steps', async ($, on) => {
  await start($, on)
  await $.tool.call({ tool: TOOL, title: '문서 정리', phase: 'delegate', total: 4, done: 1 } as never)
  expect(await svg($)).toContain('25%')
  expect(await svg($)).toContain('작업 1/4')
})
test('partial progress stays partial after the response ends', async ($, on) => {
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  await $.tool.call({ tool: TOOL, title: '부분 작업', phase: 'delegate', total: 4, done: 1 } as never)
  await $.turn.complete({ turnId: 'one', reason: 'answer', answer: 'waiting' } as never)
  expect(await svg($)).toContain('25%')
  expect(await svg($)).not.toContain('>100%</text>')
})

async function paneAlts($: any) {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'mirang-agents', props: pane })
  const alts = (await ui.findAll({ type: 'Svg' })).map((el: any) => String(el.props.alt))
  await ui.unmount()
  return alts
}

test('a question to the person waits, and the next turn keeps the reported progress', async ($, on) => {
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  await $.tool.call({ tool: TOOL, title: '여러 턴 작업', phase: 'delegate', total: 8, done: 3 } as never)
  await $.turn.complete({ turnId: 'one', reason: 'answer', answer: 'A로 할까요 B로 할까요?' } as never)
  const waiting = await svg($)
  expect(waiting).toContain('답변 대기 3/8')
  expect(waiting).not.toContain('응답 완료')
  expect(waiting).not.toContain('작업 완료')

  await $.turn.start({ turnId: 'two', text: 'A로 해줘' } as never)
  const resumed = await svg($)
  expect(resumed).toContain('여러 턴 작업')
  expect(resumed).toContain('작업 3/8')
  expect(resumed).toContain('38%')
})

test('an interrupted flow resumes on the next turn instead of starting over', async ($, on) => {
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  await $.tool.call({ tool: TOOL, title: '중단될 작업', phase: 'delegate', total: 4, done: 2 } as never)
  await $.turn.complete({ turnId: 'one', reason: 'aborted', answer: '' } as never)
  expect(await svg($)).toContain('중단 2/4')
  await $.turn.start({ turnId: 'two' } as never)
  expect(await svg($)).toContain('작업 2/4')
})

test('an API error is shown as an error, not as done', async ($, on) => {
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  await $.tool.call({ tool: TOOL, title: '오류 작업', phase: 'delegate', total: 2, done: 1 } as never)
  await $.turn.complete({ turnId: 'one', reason: 'error', answer: '' } as never)
  expect(await svg($)).toContain('오류 1/2')
})

test('every step done is not complete until the model reports finished', async ($, on) => {
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  await $.tool.call({ tool: TOOL, title: '끝난 작업', phase: 'delegate', total: 2, done: 2 } as never)
  await $.turn.complete({ turnId: 'one', reason: 'answer', answer: 'done' } as never)
  const unconfirmed = await svg($)
  expect(unconfirmed).toContain('완료 보고 전 2/2')
  expect(unconfirmed).not.toContain('작업 완료')
  // The next turn picks it up; `finished: true` completes it.
  await $.turn.start({ turnId: 'two' } as never)
  expect(await svg($)).toContain('작업 2/2')
  await $.tool.call({ tool: TOOL, finished: true } as never)
  await $.turn.complete({ turnId: 'two', reason: 'answer', answer: 'ok' } as never)
  expect(await svg($)).toContain('작업 완료')
  // A finished flow does not leak into the next request.
  await $.turn.start({ turnId: 'three' } as never)
  expect(await svg($)).toContain('현재 작업')
})

test('a background worker of an earlier flow never adds to the new flow', async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }) as never)
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-opus-5-5', input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  await start($, on)
  await $.tool.call({ tool: TOOL, title: '이전 작업 A', phase: 'delegate', total: 2, done: 0 } as never)
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'background', subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-opus-5-5', background: true, fork: false } as never)
  await $.tool.call({ tool: TOOL, title: '새 작업 B', phase: 'delegate', total: 1, done: 0 } as never)
  // The worker reports late: a request, then its end.
  for await (const _ of ($.turn.step as any)({ turnId: 'w', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId: 'a1' })) void _
  await ($.turn.complete as any)({ turnId: 'w', agentId: 'a1', reason: 'answer', answer: 'late', usage: { model: 'claude-opus-5-5', input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })
  const alts = await paneAlts($)
  const header = alts.find(a => a.startsWith('새 작업 B:')) ?? ''
  expect(header).toContain('≈$0.00')
  expect(alts.some(a => a.includes('≈$4.00'))).toBe(false)
})

test('a pane the person closed is not reopened by the next turn', async ($, on) => {
  const opened: string[] = []
  on('ui.panes', () => ({ value: [{ id: 'mirang-agents', isPlaced: true }] }))
  await start($, on, opened)
  // `/work-progress` toggles the open pane closed: the person's own choice.
  await $.command.run({ command: 'work-progress', args: '' } as never)
  opened.length = 0
  await $.turn.start({ turnId: 'one' } as never)
  await $.tool.call({ tool: TOOL, title: '패널 닫힘', phase: 'delegate', tasks: [{ title: 'a', tier: 'light' }] } as never)
  expect(opened).toEqual([])
  // `/work-progress open` brings it back.
  await $.command.run({ command: 'work-progress', args: 'open' } as never)
  expect(opened).toEqual(['mirang-agents'])
})

test('the main run sums every turn of one flow and starts over with the next flow', async ($, on) => {
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-opus-5-5', input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  await start($, on)
  const step = async (turnId: string) => {
    for await (const _ of ($.turn.step as any)({ turnId, index: 0, model: 'claude-opus-5-5', messageCount: 1 })) void _
  }
  await $.turn.start({ turnId: 'one' } as never)
  await $.tool.call({ tool: TOOL, title: '합산 작업', phase: 'delegate', total: 3, done: 1 } as never)
  await step('one')
  await $.turn.complete({ turnId: 'one', reason: 'answer', answer: '?' } as never)
  await $.turn.start({ turnId: 'two' } as never)
  await step('two')
  // Two requests of 1M input at $4/M: $8 for the flow, not the last turn's $4.
  expect((await paneAlts($)).some(a => a.includes('≈$8.00'))).toBe(true)

  await $.tool.call({ tool: TOOL, title: '새 작업', phase: 'delegate', total: 1, done: 0 } as never)
  await step('two')
  expect((await paneAlts($)).some(a => a.includes('≈$4.00'))).toBe(true)
})

test('a model with no known price is not guessed at', async ($, on) => {
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'some-other-model', input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  for await (const _ of ($.turn.step as any)({ turnId: 'one', index: 0, model: 'some-other-model', messageCount: 1 })) void _
  const alts = await paneAlts($)
  expect(alts.some(a => a.includes('단가 미상'))).toBe(true)
  expect(alts.some(a => a.includes('≈$4.00'))).toBe(false)
})

test('workers of turns with nothing reported stay in view on the next turn', async ($, on) => {
  let n = 0
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-haiku-5-5', agentId: e.description === '병렬 A' ? 'w1' : `w${++n + 1}` }) as never)
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-haiku-5-5', input_tokens: 50_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  for (const d of ['병렬 A', '병렬 B']) {
    await $.agent.spawn({ tool_use_id: d, prompt: 'p', description: d, subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-opus-5-5', background: true, fork: false } as never)
  }
  for await (const _ of ($.turn.step as any)({ turnId: 'a1', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'w1' })) void _
  // A finishes its first run; the main turn ends; a notification starts the next turn.
  await ($.turn.complete as any)({ turnId: 'a1', agentId: 'w1', reason: 'answer', answer: 'waiting on background work' })
  await $.turn.complete({ turnId: 'one', reason: 'answer', answer: 'ok' } as never)
  await $.turn.start({ turnId: 'two' } as never)
  let alts = await paneAlts($)
  expect(alts.some(a => a.startsWith('병렬 A:'))).toBe(true)
  expect(alts.some(a => a.startsWith('병렬 B:') && a.includes('진행 중'))).toBe(true)

  // A runs again when its background work reports back: running, its earlier usage kept.
  await $.agent.spawn({ tool_use_id: '병렬 A', prompt: 'p', description: '병렬 A', subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-opus-5-5', background: true, fork: false } as never)
  alts = await paneAlts($)
  expect(alts.some(a => a.startsWith('병렬 A:') && a.includes('진행 중'))).toBe(true)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'mirang-agents', props: pane })
  expect(await ui.find({ type: 'Text', text: /50k/ })).toBeDefined()
})

test('until progress is reported once, the panel says how to make Claude report it', async ($, on) => {
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  const mount = () => $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'mirang-agents', props: pane })
  let ui = await mount()
  expect(await ui.find({ type: 'Text', text: /CLAUDE\.md에 아래 한 줄/ })).toBeDefined()
  await ui.unmount()
  await $.tool.call({ tool: TOOL, title: '보고한 작업', phase: 'delegate', total: 2, done: 0 } as never)
  await $.tool.call({ tool: TOOL, finished: true } as never)
  await $.turn.complete({ turnId: 'one', reason: 'answer', answer: 'ok' } as never)
  await $.turn.start({ turnId: 'two' } as never)
  ui = await mount()
  expect(await ui.find({ type: 'Text', text: /CLAUDE\.md에 아래 한 줄/ })).toBeUndefined()
})

test('the person can close the setup hint', async ($, on) => {
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'mirang-agents', props: pane })
  await ui.press({ key: 'hint-close' })
  expect(await ui.find({ type: 'Text', text: /CLAUDE\.md에 아래 한 줄/ })).toBeUndefined()
})

test('while the flow waits for the person, the main row stays with the running, not the finished', async ($, on) => {
  await start($, on)
  await $.turn.start({ turnId: 'one' } as never)
  await $.tool.call({ tool: TOOL, title: '조율 작업', phase: 'delegate', total: 6, done: 3 } as never)
  await $.turn.complete({ turnId: 'one', reason: 'answer', answer: '?' } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'mirang-agents', props: pane })
  expect(await ui.find({ type: 'Text', text: /◷ 답변 대기/ })).toBeDefined()
  // Nothing finished: no "종료" toggle at all.
  expect(await ui.find({ key: 'done' })).toBeUndefined()
})

