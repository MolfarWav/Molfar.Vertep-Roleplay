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
  'agent.input', 'text.template', 'model.ask', 'data.parse', 'text.extract', 'text.cut', 'logic.if', 'logic.merge',
  'random.dice', 'random.pick', 'state.read', 'state.set', 'state.add', 'state.list', 'write.state', 'agent.output', 'note',
] as const

export const INPUT_SOURCES = ['lastReply', 'lastUserMessage', 'history', 'card', 'persona', 'authorNote', 'myPrevious', 'litopysFacts', 'lorebook'] as const
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
    case 'random.dice': return { count: 1, sides: 20 }
    case 'random.pick': return { items: [{ text: 'Option A', weight: 1 }, { text: 'Option B', weight: 1 }] }
    case 'text.extract': return { pattern: '(.+)', group: 1 }
    case 'text.cut': return { keep: 'first', unit: 'words', n: 50 }
    case 'state.read': return { field: '', as: 'number' }
    case 'state.set': return { field: '', as: 'number' }
    case 'state.add': return { field: '', amount: 1 }
    case 'state.list': return { field: '', op: 'add', item: {} }
    case 'write.state': return { field: 'mood', as: 'text' }
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

/**
 * The agent as one shareable file: checked, with `agent.derived` filled in, and named `<id>.vertep-agent.json`.
 * `error` while the check has errors, because a file with errors would be refused where it is installed.
 */
export function exportOf(file: CanvasFile): { file: CanvasFile; name: string } | { error: string } {
  const c = compileAgent(file) as { error?: string; file?: CanvasFile; report?: { errors: AgentIssue[] } }
  if (c.error || !c.file) return { error: c.error ?? 'Not an agent file' }
  if (c.report?.errors.length) return { error: c.report.errors[0]!.message }
  const id = String((c.file.agent as Record<string, unknown> | undefined)?.id ?? 'agent')
  return { file: c.file, name: `${id}.vertep-agent.json` }
}

/** An id nobody has taken: `id`, `id-2`, `id-3` (the checker's slug, up to 41 characters). */
export function freeId(base: string, taken: Iterable<string>): string {
  const have = new Set(taken)
  let id = base.slice(0, 41)
  for (let i = 2; have.has(id); i++) id = `${base.slice(0, 41 - String(i).length - 1)}-${i}`
  return id
}

/** The same agent as a new draft: its own id and name, and no `derived`, so the check fills it again. */
export function copyOf(file: CanvasFile, taken: Iterable<string>, name: string): { id: string; file: CanvasFile } {
  const agent = { ...((file.agent ?? {}) as Record<string, unknown>) }
  const id = freeId(`${String(agent.id ?? 'agent')}-copy`.replace(/-copy-copy$/, '-copy'), taken)
  const { derived: _gone, ...rest } = agent
  return { id, file: { ...file, title: name, agent: { ...rest, id, name } } }
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


// ---------- panels and the agent's own memory ----------

type StateField = { type: string; item?: Record<string, string> }
type State = Record<string, StateField>

/** The list with the item at `i` moved one place up (-1) or down (1); the same list when there is no such place. */
export function moveItem<T>(list: T[], i: number, by: -1 | 1): T[] {
  const j = i + by
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}

/** A list as `useDragList` wants it: every item with an id (its place), so items without an id of their own can be dragged. The saved file keeps its shape. */
export function dragItems<T>(list: T[], idOf?: (item: T, i: number) => string): { id: string; item: T }[] {
  return list.map((item, i) => ({ id: idOf ? idOf(item, i) : String(i), item }))
}

/** The items of a dragged list in their new order. The same list when the order did not change. */
export function droppedItems<T>(before: T[], ordered: { id: string; item: T }[]): T[] {
  const next = ordered.map((x) => x.item)
  return next.length === before.length && next.every((x, i) => x === before[i]) ? before : next
}

/** The widgets a form can make. */
export const WIDGET_KINDS = ['meter', 'number', 'counter', 'table', 'list', 'log', 'text', 'actions', 'html', 'grid'] as const
/** How tall an `html` widget is when the file does not say, and the limits the checker keeps. */
export const HTML_HEIGHT = { start: 80, min: 40, max: 600 } as const
export const PANEL_PLACE_LIST = ['top1', 'top2', 'float'] as const
export const MAX_PANELS = 4
export const MAX_WIDGETS = 20
export const MAX_ACTIONS = 8
/** The type of state field a widget shows (the checker's own table). */
export const WIDGET_BIND: Record<string, string> = { meter: 'number', number: 'number', counter: 'number', table: 'list', list: 'list', log: 'list', text: 'text', grid: 'list' }
/** What a `grid` widget needs: the biggest board, and its legend. The checker's own numbers. */
export const GRID = { max: 16, legend: 8, tones: ['ok', 'info', 'warn', 'bad', 'accent', 'muted'] } as const

/** The entry fields a grid reads from a list: two numbers (column, row) and a text (the tile's state), or null when the list cannot be a board. */
export function gridFields(f: StateField | undefined): { x: string; y: string; cell: string } | null {
  const item = Object.entries(f?.item ?? {})
  const nums = item.filter(([, t]) => t === 'number').map(([k]) => k)
  const text = item.find(([, t]) => t === 'text')?.[0]
  return f?.type === 'list' && nums.length >= 2 && text ? { x: nums[0]!, y: nums[1]!, cell: text } : null
}

/** The state fields a widget of this kind may show. */
export function fieldsFor(kind: string, state: State): string[] {
  const want = WIDGET_BIND[kind]
  if (kind === 'grid') return Object.keys(state).filter((k) => gridFields(state[k]))
  return want ? Object.keys(state).filter((k) => state[k]?.type === want) : []
}

/** A template to start from: the first field of the agent, shown the way its kind is shown. */
export function starterTemplate(state: State): string {
  const [id, f] = Object.entries(state)[0] ?? []
  if (!id || !f) return '<p>Hello</p>'
  if (f.type !== 'list') return `<p>${id}: <b>{{${id}}}</b></p>`
  return `{{#each ${id}}}\n<p>${Object.keys(f.item ?? {}).map((k) => `{{${k}}}`).join(' · ')}</p>\n{{/each}}`
}

/** A new widget of a kind, bound to the first field that fits (empty when none does: the check then names it). */
export function newWidget(kind: string, state: State): Params {
  if (kind === 'html') return { w: 'html', template: starterTemplate(state), height: HTML_HEIGHT.start }
  if (kind === 'actions') return { w: 'actions', items: [{ label: 'Continue', send: 'Continue.' }] }
  if (kind === 'grid') {
    const bind = fieldsFor('grid', state)[0] ?? ''
    return { w: 'grid', label: bind, bind, cols: 8, rows: 6, ...(gridFields(state[bind]) ?? { x: '', y: '', cell: '' }), legend: [{ value: 'seen', label: 'Seen', tone: 'info', mark: '•' }] }
  }
  const bind = fieldsFor(kind, state)[0] ?? ''
  const w: Params = { w: kind, label: bind, bind }
  if (kind === 'table') w.columns = Object.keys(state[bind]?.item ?? {}).slice(0, 3)
  return w
}

/** The same widget as another kind: the label stays, the field is the first of the new kind that fits. */
export function setWidgetKind(w: Params, kind: string, state: State): Params {
  if (['actions', 'html', 'grid'].includes(kind) || ['actions', 'html', 'grid'].includes(String(w.w))) return newWidget(kind, state)
  const keep = fieldsFor(kind, state).includes(String(w.bind)) ? String(w.bind) : (fieldsFor(kind, state)[0] ?? '')
  const next: Params = { ...w, w: kind, bind: keep }
  delete next.columns
  if (kind === 'table') next.columns = Object.keys(state[keep]?.item ?? {}).slice(0, 3)
  return next
}

/** A panel nobody has used the id of, with one widget to start from. */
export function newPanel(panels: Params[], state: State, title: string): Params {
  const used = new Set(panels.map((p) => String(p.id)))
  let id = 'panel'
  for (let i = 2; used.has(id); i++) id = `panel-${i}`
  const first = WIDGET_KINDS.find((k) => fieldsFor(k, state).length) ?? 'actions'
  return { id, title, place: 'float', widgets: [newWidget(first, state)] }
}

/** A template with a field renamed: the slots that name the agent's field, not the entry fields inside an {{#each}}. */
export function renameInTemplate(tpl: string, from: string, to: string): string {
  let depth = 0
  return tpl.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (m, tag: string) => {
    const open = /^#(each|if)\s+(.+)$/.exec(tag)
    if (tag === '/each') { depth = Math.max(0, depth - 1); return m }
    if (open) {
      const top = depth === 0
      if (open[1] === 'each') depth++
      return top && open[2] === from ? `{{#${open[1]} ${to}}}` : m
    }
    return depth === 0 && tag === from ? `{{${to}}}` : m
  })
}

/**
 * A state field renamed: the field itself, the panels that show it and the cards that use it follow.
 * The agent and the graph come back together, so the editor writes them as one change.
 */
export function renameField(agent: Record<string, any>, g: Graph, from: string, to: string): { agent: Record<string, any>; graph: Graph } {
  const state = Object.fromEntries(Object.entries((agent.state ?? {}) as State).map(([k, f]) => [k === from ? to : k, f]))
  const panels = Array.isArray(agent.panels)
    ? agent.panels.map((p: Params) => ({ ...p, widgets: Array.isArray(p.widgets) ? p.widgets.map((w: Params) => (w.bind === from ? { ...w, bind: to } : w.w === 'html' && typeof w.template === 'string' ? { ...w, template: renameInTemplate(w.template, from, to) } : w)) : p.widgets }))
    : agent.panels
  const nodes = g.nodes.map((n) => (n.params?.field === from ? { ...n, params: { ...n.params, field: to } } : n))
  return { agent: { ...agent, state, ...(panels ? { panels } : {}) }, graph: { nodes, edges: g.edges } }
}

/** The cards that were waiting on a `when` signal and, after this change, are not any more: they would now run on every reply. */
export function lostWhen(before: Graph, after: Graph): string[] {
  const wired = (g: Graph) => new Set(g.edges.map((e) => e.to))
  const was = wired(before)
  const is = wired(after)
  return after.nodes.filter((n) => was.has(`${n.id}:when`) && !is.has(`${n.id}:when`)).map((n) => n.title)
}

export { removeEdge, validateAgent }
