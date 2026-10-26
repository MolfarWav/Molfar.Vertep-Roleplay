// The agent editor's model: pure functions over a graph, so the editor (a form beside the board) and the tests share
// one set of rules. The checker (agent-check.js) stays the judge of a file; these helpers only keep an edit tidy
// (ports that vanished take their wires with them, the call budget follows the cards) and never decide what is valid.

import { AGENT_BOARD, AGENT_CARDS, compileAgent, validateAgent } from '@/canvas-kit/boards/agent'
import type { AgentIssue } from '@/canvas-kit/boards/agent'
import { canConnect, connect, portsOfNode, removeEdge, splitEnd } from '@/canvas-kit/graph'
import type { CanvasFile, CanvasNode, Graph, PortDef } from '@/canvas-kit/graph'

type Params = Record<string, unknown>

/** The cards in the order the "add a card" list shows them. `note` is a comment for people. */
export const CARD_ORDER = [
  'agent.input', 'text.template', 'model.ask', 'data.parse', 'logic.if', 'logic.merge',
  'state.read', 'state.set', 'state.add', 'state.list', 'agent.output', 'note',
] as const

export const INPUT_SOURCES = ['lastReply', 'lastUserMessage', 'history', 'card', 'persona', 'authorNote', 'myPrevious'] as const
export const OUTPUT_KINDS = ['note', 'choices', 'prompt-insert', 'state-patch'] as const

/** What a new card starts with: something the checker accepts as a shape, which the user then fills in. */
export function defaultParams(type: string): Params {
  switch (type) {
    case 'agent.input': return { give: [{ id: 'reply', source: 'lastReply' }] }
    case 'text.template': return { text: '' }
    case 'model.ask': return { role: 'fast', prompt: '', answer: { as: 'text' }, maxTokens: 100, batchKey: null }
    case 'data.parse': return { shape: { value: 'text' } }
    case 'logic.if': return { inputs: [], match: 'all', rows: [] }
    case 'logic.merge': return { count: 2 }
    case 'state.read': return { field: '', as: 'number' }
    case 'state.set': return { field: '', as: 'number' }
    case 'state.add': return { field: '', amount: 1 }
    case 'state.list': return { field: '', op: 'add', item: {} }
    case 'agent.output': return { kind: 'note' }
    default: return {}
  }
}

const slug = (type: string) => type.replace(/^[a-z]+\./, '').replace(/[^a-z0-9]+/g, '')

/** A card id nobody uses yet: `ask`, `ask2`, `ask3` … */
export function nextNodeId(g: Graph, type: string): string {
  const base = slug(type) || 'card'
  const used = new Set(g.nodes.map((n) => n.id))
  if (!used.has(base)) return base
  let i = 2
  while (used.has(`${base}${i}`)) i++
  return `${base}${i}`
}

export function nextEdgeId(g: Graph): string {
  const used = new Set(g.edges.map((e) => e.id))
  let i = g.edges.length + 1
  while (used.has(`e${i}`)) i++
  return `e${i}`
}

/** A new card, placed at `at` (board coordinates). */
export function newCard(g: Graph, type: string, at: { x: number; y: number }): CanvasNode {
  const label = AGENT_CARDS[type]?.label ?? type
  return { id: nextNodeId(g, type), type, x: Math.round(at.x), y: Math.round(at.y), title: label, params: defaultParams(type) }
}

/** The size of a card on the board: a header and one row for each port pair. The editor and `roomy` share it. */
export const CARD = { W: 190, HEAD: 36, ROW: 26, PAD: 6, NOTE: 44 } as const
export function cardHeight(n: CanvasNode): number {
  const { ins, outs } = portsOf(n)
  const rows = Math.max(ins.length, outs.length)
  return CARD.HEAD + (rows ? rows * CARD.ROW + CARD.PAD * 2 : CARD.NOTE)
}

/**
 * Cards laid out for narrower ones would touch, with no room for a wire between them. When the columns are closer than
 * `step`, the columns are opened up, and a card that then sits on the one above it moves down. Positions only; a file
 * that already has room comes back as it is.
 */
export function roomy(g: Graph, step = 240): Graph {
  const starts: number[] = []
  for (const x of [...new Set(g.nodes.map((n) => n.x))].sort((a, b) => a - b)) if (!starts.length || x - starts[starts.length - 1] > 60) starts.push(x)
  let gap = Infinity
  for (let i = 1; i < starts.length; i++) gap = Math.min(gap, starts[i] - starts[i - 1])
  const f = gap < step - 10 ? Math.min(1.6, step / gap) : 1
  const col = (x: number) => starts.reduce((best, s0, i) => (Math.abs(x - s0) < Math.abs(x - starts[best]) ? i : best), 0)
  const placed = g.nodes.map((n) => ({ ...n, x: Math.round(n.x * f) }))
  const bottom = new Map<number, number>()
  for (const n of [...placed].sort((a, b) => a.y - b.y)) {
    const c = col(g.nodes.find((o) => o.id === n.id)!.x)
    const free = bottom.get(c) ?? -Infinity
    if (n.y < free) n.y = free
    bottom.set(c, n.y + cardHeight(n) + 18)
  }
  const same = placed.every((n, i) => n.x === g.nodes[i].x && n.y === g.nodes[i].y)
  return same ? g : { nodes: placed, edges: g.edges }
}

/** The wires whose ports no longer exist, or no longer fit each other, are dropped. */
export function prune(g: Graph): Graph {
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const portOn = (end: string): PortDef | undefined => {
    const [id, port] = splitEnd(end)
    const node = byId.get(id)
    return node ? portsOfNode(AGENT_BOARD, node)?.find((p) => p.id === port) : undefined
  }
  const edges = g.edges.filter((e) => {
    const a = portOn(e.from)
    const b = portOn(e.to)
    return !!a && !!b && a.side === 'out' && b.side === 'in' && a.type === b.type
  })
  return edges.length === g.edges.length ? g : { nodes: g.nodes, edges }
}

/** Changes one card's params (and title); the wires that lost their ports go with them. */
export function setCard(g: Graph, id: string, patch: { params?: Params; title?: string }): Graph {
  const nodes = g.nodes.map((n) => (n.id === id ? { ...n, ...(patch.params ? { params: patch.params } : {}), ...(patch.title !== undefined ? { title: patch.title } : {}) } : n))
  return prune({ nodes, edges: g.edges })
}

/** Every output that may feed input `to` ("card:port"), as the board would allow it. */
export function wireChoices(g: Graph, to: string): { end: string; label: string; wired: boolean }[] {
  const [toNode] = splitEnd(to)
  const without: Graph = { nodes: g.nodes, edges: g.edges.filter((e) => e.to !== to) }
  const current = g.edges.find((e) => e.to === to)?.from
  const out: { end: string; label: string; wired: boolean }[] = []
  for (const n of g.nodes) {
    if (n.id === toNode) continue
    for (const p of portsOfNode(AGENT_BOARD, n) ?? []) {
      if (p.side !== 'out') continue
      const end = `${n.id}:${p.id}`
      if (canConnect(AGENT_BOARD, without, end, to).ok) out.push({ end, label: `${n.title} · ${p.label ?? p.id}`, wired: end === current })
    }
  }
  return out
}

/** Wires input `to` to output `from`, replacing what was there; `from` null unplugs it. */
export function setWire(g: Graph, to: string, from: string | null): { graph: Graph; reason?: string } {
  const without: Graph = { nodes: g.nodes, edges: g.edges.filter((e) => e.to !== to) }
  if (!from) return { graph: without }
  const r = connect(AGENT_BOARD, without, from, to, nextEdgeId(without))
  return r.verdict.ok ? { graph: r.graph } : { graph: g, reason: r.verdict.reason }
}

/** The ports of a card, split into the inputs a person can wire and the outputs. */
export function portsOf(n: CanvasNode): { ins: PortDef[]; outs: PortDef[] } {
  const all = portsOfNode(AGENT_BOARD, n) ?? []
  return { ins: all.filter((p) => p.side === 'in'), outs: all.filter((p) => p.side === 'out') }
}

/** The header an edit leaves: the call budget follows the cards, every role a card asks for exists, and no stale `derived`. */
export function tidyHeader(agent: Record<string, unknown>, g: Graph): Record<string, unknown> {
  const asks = g.nodes.filter((n) => n.type === 'model.ask')
  const models = { ...((agent.models as Record<string, unknown> | undefined) ?? {}) }
  for (const n of asks) {
    const role = typeof n.params?.role === 'string' && n.params.role ? n.params.role : 'fast'
    if (!models[role]) models[role] = { hint: 'cheap, short answers' }
  }
  const limits = { ...((agent.limits as Record<string, unknown> | undefined) ?? {}), maxCalls: asks.length, concurrency: 1 }
  const { derived: _gone, ...rest } = agent
  return { ...rest, models, limits }
}

export function fileOf(title: string, agent: Record<string, unknown>, g: Graph): CanvasFile {
  return { format: 'vertep-canvas', version: 1, kind: 'agent', title, nodes: g.nodes, edges: g.edges, agent: tidyHeader(agent, g) }
}

/** An empty agent: one Input that gives the last reply, one note Output, nothing wired. */
export function blankAgent(id: string, name: string): CanvasFile {
  const g: Graph = {
    nodes: [
      { id: 'in', type: 'agent.input', x: 10, y: 60, title: 'Input', params: defaultParams('agent.input') },
      { id: 'out', type: 'agent.output', x: 500, y: 60, title: 'Output', params: { kind: 'note', title: name } },
    ],
    edges: [],
  }
  return fileOf(name, {
    formatVersion: 1, id, version: '1.0.0', name, description: '', author: '',
    trigger: { when: 'after', everyN: 1, keywords: [] },
  }, g)
}

export interface ForgeReport { errors: AgentIssue[]; warnings: AgentIssue[]; needs: string[]; maxCalls: number }

/** The checker's verdict on the file as it stands. */
export function check(file: CanvasFile): ForgeReport {
  const c = compileAgent(file) as { error?: string; report?: { errors: AgentIssue[]; warnings: AgentIssue[]; derived: { needs: string[]; maxCalls: number } | null } }
  if (c.error || !c.report) return { errors: [{ code: 'E_ENVELOPE', message: c.error ?? 'Not an agent file' }], warnings: [], needs: [], maxCalls: 0 }
  return { errors: c.report.errors, warnings: c.report.warnings, needs: c.report.derived?.needs ?? [], maxCalls: c.report.derived?.maxCalls ?? 0 }
}

/** Issues grouped by the card they name, for the badge on a card. */
export function issuesByNode(r: ForgeReport): Map<string, { errors: number; warnings: number }> {
  const m = new Map<string, { errors: number; warnings: number }>()
  const bump = (id: string | undefined, key: 'errors' | 'warnings') => {
    if (!id) return
    const v = m.get(id) ?? { errors: 0, warnings: 0 }
    v[key]++
    m.set(id, v)
  }
  for (const e of r.errors) bump(e.node, 'errors')
  for (const w of r.warnings) bump(w.node, 'warnings')
  return m
}

export { removeEdge, validateAgent }
