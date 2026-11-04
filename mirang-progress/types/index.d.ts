export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

export type FlowState = 'waiting' | 'stopped' | 'error'

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  /** How the last main turn ended while the flow was not finished: absent while it runs. */
  state?: FlowState
  tasks: PlannedTask[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Working time of earlier turns of the same flow, without the waits between them. */
  priorMs?: number
  /** Some of its usage ran on a model with no known price: the cost is a lower bound. */
  isPriceUnknown?: boolean
  /** Still running from an earlier flow: shown, but kept out of this flow's totals. */
  isCarried?: boolean
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
}

/** One session's progress, as it writes it for the other sessions of the same project. */
export type SessionSnap = {
  id: string
  root: string
  cwd: string
  title: string
  label: string
  done: number
  total: number
  state: 'working' | 'waiting' | 'stopped' | 'error' | 'finished' | 'idle' | 'ended'
  costUsd: number
  tokens: number
  isPartial?: boolean
  workers: number
  activeMs: number
  updatedAt: number
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  autoOpenedFor: string
  /** The person closed the pane; only `/work-progress` opens it again. */
  isClosedByUser?: boolean
  /** Progress was reported once, in any session, or the person closed the hint: no setup hint. */
  isHintHidden?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'mirang-progress': {
      main: AgentRun | null
      flow: Flow | null
      agents: AgentRun[]
      peers: SessionSnap[]
      panel: Panel
      now: number
    }
  }
}
