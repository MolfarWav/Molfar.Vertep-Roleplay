// The Agent sets screen of the Canvas: which lane an agent of a set is in, what a turn with the set costs in time and
// calls (worked out from the agents' real runs), and the small edits the screen makes to a set before it is saved.
// Pure, so a test can hold it.

import type { AgentInfo, AgentPhase, AgentRun, AgentSet } from './agents'

export type SetItem = AgentSet['items'][number]

/** The lanes of the screen. `manual` agents run only when the user presses their button, so no time line is drawn for them. */
export type Lane = 'before' | 'parallel' | 'after' | 'manual'
export const LANES: Lane[] = ['before', 'parallel', 'after', 'manual']

/** An agent set to run before the reply with "wait" off runs beside it: the lane says what really happens. */
export function laneOf(it: SetItem, info: AgentInfo | undefined): Lane {
  const phase: AgentPhase = it.phase ?? info?.trigger.when ?? 'after'
  return phase === 'before' && it.wait === false ? 'parallel' : phase
}

/**
 * What an item looks like once the agent is moved to a lane. "Beside the reply" is `before` with the wait switch off, the
 * way the chat's own list says it: the agent's hint may then go into the next reply, which a `parallel` agent may not do.
 */
export function inLane(it: SetItem, lane: Lane): SetItem {
  const { wait: _wait, ...rest } = it
  return lane === 'parallel' ? { ...rest, phase: 'before', wait: false } : { ...rest, phase: lane }
}

/** What one agent costs per run, from its runs in a chat. `known: false` = no run to go by, so the figures are guesses. */
export interface Cost { ms: number; calls: number; known: boolean }

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** The time one model call takes when nothing else says: the median over the runs that did a call, else this. */
export const GUESS_CALL_MS = 2000
/** The time the main reply takes, when the person has not said. The app does not measure it. */
export const GUESS_REPLY_MS = 6000

export interface Costs {
  byAgent: Map<string, Cost>
  /** one model call, typically, in this chat's runs */
  callMs: number
}

/** The newest 20 good runs of each agent, medians of their time and calls. */
export function costsFromRuns(runs: AgentRun[], infos: AgentInfo[]): Costs {
  const good = runs.filter((r) => r.status === 'ok' && r.ms > 0).sort((a, b) => b.at - a.at)
  const per = new Map<string, AgentRun[]>()
  for (const r of good) {
    const l = per.get(r.agent) ?? []
    if (l.length < 20) l.push(r)
    per.set(r.agent, l)
  }
  const perCall = good.filter((r) => (r.calls ?? 0) > 0).map((r) => r.ms / r.calls!)
  const callMs = perCall.length ? Math.round(median(perCall)) : GUESS_CALL_MS
  const byAgent = new Map<string, Cost>()
  for (const [id, l] of per) byAgent.set(id, { ms: Math.round(median(l.map((r) => r.ms))), calls: Math.round(median(l.map((r) => r.calls ?? 0))), known: true })
  for (const a of infos) {
    if (!byAgent.has(a.id)) byAgent.set(a.id, { ms: a.maxCalls * callMs, calls: a.maxCalls, known: false })
  }
  return { byAgent, callMs }
}

export interface Bar { agent: string; lane: Lane; from: number; to: number; calls: number; known: boolean }

export interface Turn {
  bars: Bar[]
  /** where the main reply starts and ends */
  reply: { from: number; to: number }
  /** the end of the longest bar */
  end: number
  /** what the person waits for before the reply starts */
  waitMs: number
  /** the reply is on screen: the wait before it, then the reply */
  turnMs: number
  calls: number
}

/**
 * One turn with the set. Agents before the reply run together and the reply starts when the slowest is done; agents
 * beside it start with the send and the reply does not wait for them; agents after it start when the reply is done.
 * Off agents and by-hand agents take no time.
 */
export function simulate(items: SetItem[], infos: AgentInfo[], costs: Costs, replyMs: number): Turn {
  const info = new Map(infos.map((a) => [a.id, a]))
  const costOf = (id: string): Cost => costs.byAgent.get(id) ?? { ms: GUESS_CALL_MS, calls: 1, known: false }
  const running = items.filter((it) => it.on).map((it) => ({ it, lane: laneOf(it, info.get(it.agent)) })).filter((x) => x.lane !== 'manual')
  const waitMs = Math.max(0, ...running.filter((x) => x.lane === 'before').map((x) => costOf(x.it.agent).ms))
  const replyTo = waitMs + replyMs
  const bars: Bar[] = running.map(({ it, lane }) => {
    const c = costOf(it.agent)
    const from = lane === 'after' ? replyTo : 0
    return { agent: it.agent, lane, from, to: from + c.ms, calls: c.calls, known: c.known }
  })
  return {
    bars,
    reply: { from: waitMs, to: replyTo },
    end: Math.max(replyTo, ...bars.map((b) => b.to)),
    waitMs,
    turnMs: replyTo,
    calls: bars.reduce((n, b) => n + b.calls, 0) + 1,
  }
}

/** Moves one agent into a lane; an agent not in the set yet is added there, switched on. */
export function putInLane(items: SetItem[], agent: string, lane: Lane): SetItem[] {
  return items.some((it) => it.agent === agent)
    ? items.map((it) => (it.agent === agent ? inLane(it, lane) : it))
    : [...items, inLane({ agent, on: true }, lane)]
}

export const sameItems = (a: SetItem[], b: SetItem[]): boolean => JSON.stringify(a) === JSON.stringify(b)

/** A name for a copy that nobody has taken yet: "Name", "Name 2", "Name 3". */
export function freeName(name: string, taken: string[]): string {
  const have = new Set(taken.map((n) => n.toLowerCase()))
  let out = name
  for (let n = 2; have.has(out.toLowerCase()); n++) out = `${name} ${n}`
  return out
}

/** The sets an agent is in, for the library's line "In sets: …". */
export function setsWith(sets: AgentSet[], agent: string): AgentSet[] {
  return sets.filter((s) => s.items.some((it) => it.agent === agent))
}
