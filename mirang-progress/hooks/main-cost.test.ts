import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'mirang-progress'
const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const
const model = 'claude-sonnet-5-5'
// 1M input + 1M output on Sonnet 5.5: 2 + 10 = $12.0, 2.0M tokens.
const usage = { input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

test('direct work with no worker still counts the main session tokens and cost', async ($, on) => {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.start', (_$, e: any) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('turn.step', async function* () {
    return { turnId: 'turn', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model, ...usage } } as never
  })
  await ($.turn.start as (e: unknown) => Promise<unknown>)({ turnId: 'turn', prompt: 'p' })
  for await (const _ of ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 'turn', index: 0, model, messageCount: 1 })) void _

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'mirang-agents', props: pane })
  expect(await ui.find({ type: 'Text', text: /≈\$12\.0 · 2\.0M/ })).toBeDefined()
})
