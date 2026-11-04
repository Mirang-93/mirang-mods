import { expect, mock, test } from 'claude-code/testing'
const PLUGIN = 'mirang-progress'
const TOOL = 'mcp__mirang-progress__progress'
const band = { hasSurvey: false, isWorking: true, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

async function start($: any, on: any) {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
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
