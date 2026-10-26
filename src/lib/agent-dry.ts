// The trial run of the agent editor: the real executor over a made-up turn, with no model and no chat. The person
// supplies what the agent would receive and what the model would answer; the result says what every wire carried, what
// the agent would write and show, and how its memory would change. Pure, so a test can hold it.

import { applyWrites, initialOwn, runAgent } from '@/canvas-kit/boards/agent-run'
import { AGENT_MAX_ROUNDS } from '@/canvas-kit/boards/agent-check'
import type { Own } from '@/canvas-kit/boards/agent-run'

type Json = Record<string, any>
export interface DryFile { nodes: Json[]; edges: Json[]; agent?: Json }

/** What the person sets for a trial: the agent's inputs, its memory at the start, and the model's answers by card id. */
export interface DrySetup {
  inputs: Record<string, string>
  own: Record<string, unknown>
  replies: Record<string, string>
  chat: { messageCount: number; lastSpeaker: string }
}

export type WireView = { state: 'value'; value: unknown } | { state: 'skip' | 'wait' | 'missing' }
export interface Asked { node: string; prompt: string; reply: string; example: boolean }
export interface DryWrite { op: string; field: string; value?: unknown; by?: unknown; item?: unknown }
export interface DryResult {
  status: 'done' | 'failed'
  reason?: string
  node?: string
  calls: number
  asked: Asked[]
  wires: Record<string, WireView>
  /** card id -> what happened to it */
  nodes: Record<string, 'ran' | 'skipped' | 'waiting' | 'failed'>
  trace: { node: string; status: string; out?: Record<string, unknown> }[]
  /** writes to the agent's own memory, then the Dashboard writes the agent would queue */
  ownWrites: DryWrite[]
  dashWrites: DryWrite[]
  refused: { write: DryWrite; why: string }[]
  ownAfter: Own
  outputs: Json[]
}

const SAMPLE_INPUT: Record<string, string> = {
  lastReply: 'The guard steps closer, one hand on his sword. "You do not belong here," he says.',
  lastUserMessage: 'I raise my hands and try to talk my way past him.',
  history: 'USER: I knock on the gate.\nCHARACTER: A guard opens it and eyes you with suspicion.',
  card: 'A weary city guard, loyal to the crown, slow to trust.',
  persona: 'A travelling merchant.',
  summary: 'The traveller reached the city gate at dusk.',
  authorNote: '',
  myPrevious: '',
  preGenInjections: '',
  parallelResults: '',
}

/** A made-up value for each thing the Input card gives; a Dashboard field starts empty (missing data is a case worth trying). */
export function sampleInputs(file: Pick<DryFile, 'nodes'>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const n of file.nodes) {
    if (n.type !== 'agent.input') continue
    for (const g of (n.params?.give ?? []) as Json[]) out[g.id] = g.source === 'state' ? '' : SAMPLE_INPUT[g.source] ?? 'Sample text.'
  }
  return out
}

const sampleOf = (spec: unknown): unknown => {
  if (typeof spec === 'string' && spec.startsWith('enum:')) return spec.slice(5).split('|')[0]
  return spec === 'number' ? 1 : spec === 'bool' ? true : 'Example'
}

/** What a model might say to a card, in the format the card asks for. */
export function exampleReply(node: Json): string {
  const a = node.params?.answer
  if (a?.as === 'yesno') return 'YES\nThe message says so.'
  if (a?.as === 'json') return JSON.stringify(Object.fromEntries(Object.entries(a.shape ?? {}).map(([k, v]) => [k, sampleOf(v)])))
  return 'An example answer from the model.'
}

/** The memory a trial starts with: the fields' starting values, then what the person changed. */
export function startOwn(schema: Json | undefined, own: Record<string, unknown>): Own {
  return { ...initialOwn(schema), ...own } as Own
}

const isOwnWrite = (w: DryWrite) => w.op.startsWith('own.') || w.op.startsWith('list.')

export function dryRun(file: DryFile, setup: DrySetup): DryResult {
  const nodes = new Map(file.nodes.map((n) => [n.id, n]))
  const schema = file.agent?.state as Json | undefined
  const inputs: Record<string, string | undefined> = {}
  const dash: Record<string, string | number | undefined> = {}
  for (const n of file.nodes) {
    if (n.type !== 'agent.input') continue
    for (const g of (n.params?.give ?? []) as Json[]) {
      const raw = setup.inputs[g.id]
      if (g.source === 'state') dash[g.field] = raw === undefined || raw === '' ? undefined : g.as === 'number' ? Number(raw) : raw
      else inputs[g.id] = raw === '' ? undefined : raw
    }
  }
  const own = startOwn(schema, setup.own)
  const ctx = { inputs, own, dash, chat: setup.chat, explain: true }
  const answers: Record<string, { text: string }> = {}
  const asked = new Map<string, Asked>()
  let res: Json = { status: 'failed', reason: 'The run did not start', trace: [], wires: {} }
  for (let round = 0; round <= AGENT_MAX_ROUNDS + 1; round++) {
    res = runAgent(file as any, ctx, answers) as Json
    if (res.status !== 'need') break
    for (const rq of res.requests as Json[]) {
      const given = setup.replies[rq.node]
      const reply = given ?? exampleReply(nodes.get(rq.node) ?? {})
      answers[rq.node] = { text: reply }
      asked.set(rq.node, { node: rq.node, prompt: rq.prompt, reply, example: given === undefined })
    }
  }
  if (res.status === 'need') res = { ...res, status: 'failed', reason: 'The agent asks the model more times in a row than the limit', trace: res.trace ?? [] }
  const writes = (res.writes ?? []) as DryWrite[]
  const applied = applyWrites(schema as never, own, writes.filter(isOwnWrite) as never)
  const states: DryResult['nodes'] = {}
  for (const t of (res.trace ?? []) as Json[]) states[t.node] = t.status === 'ran' ? 'ran' : t.status === 'skipped' ? 'skipped' : 'waiting'
  if (res.status === 'failed' && res.node) states[res.node] = 'failed'
  return {
    status: res.status === 'done' ? 'done' : 'failed',
    reason: res.reason,
    node: res.node,
    calls: res.calls ?? asked.size,
    asked: [...asked.values()],
    wires: (res.wires ?? {}) as Record<string, WireView>,
    nodes: states,
    trace: (res.trace ?? []) as DryResult['trace'],
    ownWrites: writes.filter(isOwnWrite),
    dashWrites: writes.filter((w) => !isOwnWrite(w)),
    refused: applied.refused as DryResult['refused'],
    ownAfter: applied.own,
    outputs: (res.outputs ?? []) as Json[],
  }
}

const brief = (v: unknown): string => {
  const t = typeof v === 'string' ? v : JSON.stringify(v)
  return t.length > 60 ? `${t.slice(0, 59)}…` : t
}

/** One queued write in a short line: `mana −10`, `mood = tense`, `rooms + {"name":"Cellar"}`. */
export function describeWrite(w: DryWrite & Json): string {
  if (w.op === 'own.add') return `${w.field} ${Number(w.by) < 0 ? '−' : '+'}${Math.abs(Number(w.by))}`
  if (w.op === 'list.add') return `${w.field} + ${brief(w.item)}`
  if (w.op === 'list.update') return `${w.field} ~ ${brief(w.id)}`
  if (w.op === 'list.remove') return `${w.field} − ${brief(w.id)}`
  return `${w.field} = ${brief(w.value)}`
}
