import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'mirang-progress'
const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const
const DIR = '/home/u/.claude/mirang-progress/sessions'

const snap = (id: string, cwd: string, extra: Record<string, unknown> = {}) => ({
  id, root: cwd, cwd, title: '', label: '', done: 0, total: 0, state: 'working', costUsd: 0, tokens: 0, workers: 0, activeMs: 0, updatedAt: -1000, ...extra,
})

// The parent session works in /proj; other sessions have written their summaries.
async function parent($: any, on: any, files: Record<string, unknown>, written: Record<string, string> = {}, runs: string[][] = []) {
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.register', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/proj' }))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('session.id', () => ({ value: 'parent' }))
  on('session.root', () => ({ value: '/proj' }))
  on('session.cwd', () => ({ value: '/proj' }))
  on('env.get', (_$: any, e: any) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('fs.list', () => ({ value: Object.keys(files).map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }))
  on('fs.read', (_$: any, e: any) => ({ value: JSON.stringify(files[e.path.split('/').pop()]) }))
  on('fs.write', (_$: any, e: any) => { written[e.path] = e.text; return { value: undefined } })
  on('process.run', (_$: any, e: any) => { runs.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '' } } })
  await $.session.start({ source: 'startup', cwd: '/proj', surface: 'desktop', isInteractive: true })
}

async function alts($: any) {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'mirang-agents', props: pane })
  const out = (await ui.findAll({ type: 'Svg' })).map((el: any) => String(el.props.alt))
  await ui.unmount()
  return out
}

test('sessions working in this project\'s worktrees show in its panel, without opening each', async ($, on) => {
  await parent($, on, {
    'qa.json': snap('qa', '/proj/.claude/worktrees/m1-3a-bkit-qa-236a06', { title: 'M1-3a bkit QA', state: 'waiting', done: 3, total: 6, costUsd: 4.98, workers: 1 }),
    'text.json': snap('text', '/proj/.claude/worktrees/m1-2-large-text-5e8375', { title: 'M1-2 큰 글자', done: 1, total: 4 }),
    // Not this project's worktrees: the project folder itself, another project, and itself.
    'same.json': snap('same', '/proj', { title: '같은 폴더 다른 세션' }),
    'other.json': snap('other', '/elsewhere/.claude/worktrees/x-111111', { title: '다른 프로젝트' }),
    'parent.json': snap('parent', '/proj', { title: '자기 자신' }),
  })
  const out = await alts($)
  expect(out.some(a => a.startsWith('M1-3a bkit QA: 하위 세션, 답변 대기, 3/6, ≈$4.98'))).toBe(true)
  expect(out.some(a => a.startsWith('M1-2 큰 글자: 하위 세션, 진행 중, 1/4'))).toBe(true)
  expect(out.some(a => a.includes('같은 폴더 다른 세션') || a.includes('다른 프로젝트') || a.includes('자기 자신'))).toBe(false)
})

test('a peer gone quiet for a day, or closed hours ago, drops out', async ($, on) => {
  await parent($, on, {
    'old.json': snap('old', '/proj/.claude/worktrees/old-aaaaaa', { title: '오래된 세션', updatedAt: -25 * 3600_000 }),
    'ended.json': snap('ended', '/proj/.claude/worktrees/ended-bbbbbb', { title: '닫힌 세션', state: 'ended', updatedAt: -3 * 3600_000 }),
    'live.json': snap('live', '/proj/.claude/worktrees/live-cccccc', { title: '살아 있는 세션' }),
  })
  const out = await alts($)
  expect(out.some(a => a.startsWith('살아 있는 세션:'))).toBe(true)
  expect(out.some(a => a.includes('오래된 세션') || a.includes('닫힌 세션'))).toBe(false)
})

test('each session writes its own summary for the others', async ($, on) => {
  const written: Record<string, string> = {}
  await parent($, on, {}, written)
  await $.turn.start({ turnId: 'one' } as never)
  await $.tool.call({ tool: 'mcp__mirang-progress__progress', title: '상위 조율', phase: 'delegate', total: 5, done: 2 } as never)
  const mine = JSON.parse(written[`${DIR}/parent.json`] ?? '{}')
  expect(mine).toMatchObject({ id: 'parent', root: '/proj', title: '상위 조율', done: 2, total: 5, state: 'working' })
})

test('summaries older than a week are removed at session start, only in their own folder', async ($, on) => {
  const runs: string[][] = []
  await parent($, on, {}, {}, runs)
  expect(runs).toEqual([['find', DIR, '-maxdepth', '1', '-type', 'f', '-name', '*.json', '-mtime', '+7', '-delete']])
})

