export interface PortDef { id: string; side: 'in' | 'out'; type: string; label?: string; max?: number } // max: max wires on this port (undefined = unlimited)
export interface NodeTypeDef { type: string; label: string; colorVar: string; hint: string; ports: PortDef[]; deletable?: boolean }
export interface CanvasNode { id: string; type: string; x: number; y: number; title: string; subtitle?: string; params?: Record<string, unknown>; note?: string }
export interface CanvasEdge { id: string; from: string; to: string } // "nodeId:portId"
export interface Graph { nodes: CanvasNode[]; edges: CanvasEdge[] }
export type Verdict = { ok: true; replaces?: string[] } | { ok: false; reason: string } // replaces = edge ids that the new wire would replace
export interface BoardKind {
  kind: string
  types: Record<string, NodeTypeDef>
  /** board-specific rule, run after the generic checks; return a Verdict */
  canConnect?: (g: Graph, from: string, to: string) => Verdict
}
export interface CanvasFile { format: 'vertep-canvas'; version: 1; kind: string; title: string; nodes: CanvasNode[]; edges: CanvasEdge[] }

export const splitEnd = (end: string): [string, string] => {
  const i = end.lastIndexOf(':')
  if (i < 0) return [end, '']
  return [end.slice(0, i), end.slice(i + 1)]
}

export const portOf = (board: BoardKind, g: Graph, end: string): PortDef | null => {
  const [nodeId, portId] = splitEnd(end)
  const node = g.nodes.find((n) => n.id === nodeId)
  if (!node) return null
  const def = board.types[node.type]
  if (!def) return null
  return def.ports.find((p) => p.id === portId) ?? null
}

export const canConnect = (board: BoardKind, g: Graph, from: string, to: string): Verdict => {
  const fp = portOf(board, g, from)
  const tp = portOf(board, g, to)
  if (!fp || !tp) return { ok: false, reason: 'Unknown port' }
  if (fp.side !== 'out' || tp.side !== 'in') return { ok: false, reason: 'Connect an output to an input' }
  const [fromNode] = splitEnd(from)
  const [toNode] = splitEnd(to)
  if (fromNode === toNode) return { ok: false, reason: 'A card cannot connect to itself' }
  if (fp.type !== tp.type) return { ok: false, reason: 'These ports do not fit together' }
  if (g.edges.some((e) => e.from === from && e.to === to)) return { ok: false, reason: 'Already connected' }
  const replaces: string[] = []
  const consider = (port: PortDef, end: string, side: 'from' | 'to'): void => {
    if (port.max === undefined) return
    const ids = g.edges.filter((e) => e[side] === end).map((e) => e.id)
    const excess = ids.length + 1 - port.max
    for (let i = 0; i < excess && i < ids.length; i++) replaces.push(ids[i])
  }
  consider(tp, to, 'to')
  consider(fp, from, 'from')
  if (board.canConnect) {
    const v = board.canConnect(g, from, to)
    if (!v.ok) return v
    for (const id of v.replaces ?? []) if (!replaces.includes(id)) replaces.push(id)
  }
  return { ok: true, replaces }
}

export const wouldCycle = (g: Graph, from: string, to: string): boolean => {
  const [fromNode] = splitEnd(from)
  const [toNode] = splitEnd(to)
  const seen = new Set<string>([toNode])
  const queue = [toNode]
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (cur === fromNode) return true
    for (const e of g.edges) {
      const [src] = splitEnd(e.from)
      const [dst] = splitEnd(e.to)
      if (src === cur && !seen.has(dst)) {
        seen.add(dst)
        queue.push(dst)
      }
    }
  }
  return false
}

export const connect = (board: BoardKind, g: Graph, from: string, to: string, newId: string): { graph: Graph; verdict: Verdict } => {
  const verdict = canConnect(board, g, from, to)
  if (!verdict.ok) return { graph: g, verdict }
  const drop = new Set(verdict.replaces ?? [])
  const edges = [...g.edges.filter((e) => !drop.has(e.id)), { id: newId, from, to }]
  return { graph: { nodes: g.nodes, edges }, verdict }
}

export const removeEdge = (g: Graph, edgeId: string): Graph => ({
  nodes: g.nodes,
  edges: g.edges.filter((e) => e.id !== edgeId),
})

export const removeNode = (g: Graph, nodeId: string): Graph => ({
  nodes: g.nodes.filter((n) => n.id !== nodeId),
  edges: g.edges.filter((e) => {
    const [f] = splitEnd(e.from)
    const [t] = splitEnd(e.to)
    return f !== nodeId && t !== nodeId
  }),
})

export const moveNode = (g: Graph, nodeId: string, x: number, y: number): Graph => ({
  nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
  edges: g.edges,
})

export const addNode = (g: Graph, node: CanvasNode): Graph => ({
  nodes: [...g.nodes, node],
  edges: g.edges,
})

export const insertOnEdge = (board: BoardKind, g: Graph, edgeId: string, nodeId: string): { graph: Graph; ok: boolean; reason?: string } => {
  const edge = g.edges.find((e) => e.id === edgeId)
  if (!edge) return { graph: g, ok: false, reason: 'Unknown wire' }
  const [fromNode] = splitEnd(edge.from)
  const [toNode] = splitEnd(edge.to)
  if (fromNode === nodeId || toNode === nodeId) return { graph: g, ok: false, reason: 'That card is already an end of this wire' }
  const node = g.nodes.find((n) => n.id === nodeId)
  if (!node) return { graph: g, ok: false, reason: 'Unknown node' }
  const def = board.types[node.type]
  if (!def) return { graph: g, ok: false, reason: 'Unknown node type' }
  const fromPort = portOf(board, g, edge.from)
  const toPort = portOf(board, g, edge.to)
  const inPort = def.ports.find((p) => p.side === 'in' && toPort !== null && p.type === toPort.type)
  const outPort = def.ports.find((p) => p.side === 'out' && fromPort !== null && p.type === fromPort.type)
  if (!inPort || !outPort) return { graph: g, ok: false, reason: 'That card has no matching ports for this wire' }
  const g1 = removeEdge(g, edgeId)
  const v1 = canConnect(board, g1, edge.from, `${nodeId}:${inPort.id}`)
  if (!v1.ok) return { graph: g, ok: false, reason: v1.reason }
  const drop1 = new Set(v1.replaces ?? [])
  const g2: Graph = { nodes: g1.nodes, edges: [...g1.edges.filter((e) => !drop1.has(e.id)), { id: `${edgeId}a`, from: edge.from, to: `${nodeId}:${inPort.id}` }] }
  const v2 = canConnect(board, g2, `${nodeId}:${outPort.id}`, edge.to)
  if (!v2.ok) return { graph: g, ok: false, reason: v2.reason }
  const drop2 = new Set(v2.replaces ?? [])
  const g3: Graph = { nodes: g2.nodes, edges: [...g2.edges.filter((e) => !drop2.has(e.id)), { id: `${edgeId}b`, from: `${nodeId}:${outPort.id}`, to: edge.to }] }
  return { graph: g3, ok: true }
}

export const toFile = (kind: string, title: string, g: Graph): CanvasFile => ({
  format: 'vertep-canvas',
  version: 1,
  kind,
  title,
  nodes: g.nodes,
  edges: g.edges,
})

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isString = (v: unknown): v is string => typeof v === 'string'
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const fromFile = (raw: unknown): { file: CanvasFile } | { error: string } => {
  if (!isObject(raw)) return { error: 'Not an object' }
  if (raw.format !== 'vertep-canvas') return { error: 'Wrong format' }
  if (raw.version !== 1) return { error: 'Unsupported version' }
  if (!isString(raw.kind)) return { error: 'Missing kind' }
  if (!isString(raw.title)) return { error: 'Missing title' }
  if (!Array.isArray(raw.nodes)) return { error: 'nodes must be an array' }
  if (!Array.isArray(raw.edges)) return { error: 'edges must be an array' }
  const nodes: CanvasNode[] = []
  for (const n of raw.nodes) {
    if (!isObject(n) || !isString(n.id) || !isString(n.type) || !isFiniteNumber(n.x) || !isFiniteNumber(n.y) || !isString(n.title)) {
      return { error: 'Invalid node' }
    }
    const node: CanvasNode = { id: n.id, type: n.type, x: n.x, y: n.y, title: n.title }
    if (isString(n.subtitle)) node.subtitle = n.subtitle
    if (isObject(n.params)) node.params = n.params as Record<string, unknown>
    if (isString(n.note)) node.note = n.note
    nodes.push(node)
  }
  const ids = new Set(nodes.map((n) => n.id))
  if (ids.size !== nodes.length) return { error: 'Duplicate node id' }
  const edges: CanvasEdge[] = []
  for (const e of raw.edges) {
    if (!isObject(e) || !isString(e.id) || !isString(e.from) || !isString(e.to)) return { error: 'Invalid edge' }
    const [f] = splitEnd(e.from)
    const [t] = splitEnd(e.to)
    if (!ids.has(f) || !ids.has(t)) return { error: `Edge ${e.id} references an unknown node` }
    edges.push({ id: e.id, from: e.from, to: e.to })
  }
  return { file: { format: 'vertep-canvas', version: 1, kind: raw.kind, title: raw.title, nodes, edges } }
}

export interface History { past: Graph[]; present: Graph; future: Graph[] }

export const historyOf = (g: Graph): History => ({ past: [], present: g, future: [] })

export function commit(h: History, next: Graph, limit = 100): History {
  if (next === h.present) return h
  const past = [...h.past, h.present]
  if (past.length > limit) past.splice(0, past.length - limit)
  return { past, present: next, future: [] }
}

export function undo(h: History): History {
  if (h.past.length === 0) return h
  const past = [...h.past]
  const present = past.pop()!
  return { past, present, future: [h.present, ...h.future] }
}

export function redo(h: History): History {
  if (h.future.length === 0) return h
  const [present, ...future] = h.future
  return { past: [...h.past, h.present], present, future }
}

export const layoutForest = (g: Graph, opts?: { colW?: number; rowH?: number }): Graph => {
  const colW = opts?.colW ?? 220
  const rowH = opts?.rowH ?? 150
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const children = new Map<string, string[]>()
  const hasIncoming = new Set<string>()
  const connected = new Set<string>()
  for (const e of g.edges) {
    const [p] = splitEnd(e.from)
    const [c] = splitEnd(e.to)
    if (!byId.has(p) || !byId.has(c) || p === c) continue
    connected.add(p)
    connected.add(c)
    if (hasIncoming.has(c)) continue
    hasIncoming.add(c)
    children.set(p, [...(children.get(p) ?? []), c])
  }
  const byTitle = (a: string, b: string): number => (byId.get(a)?.title ?? '').localeCompare(byId.get(b)?.title ?? '')
  for (const list of children.values()) list.sort(byTitle)
  const pos = new Map<string, { x: number; y: number }>()
  let slot = 0
  const seen = new Set<string>()
  const place = (id: string, depth: number): { min: number; max: number } => {
    seen.add(id)
    const kids = (children.get(id) ?? []).filter((k) => !seen.has(k))
    if (kids.length === 0) {
      const x = slot++ * colW
      pos.set(id, { x, y: depth * rowH })
      return { min: x, max: x }
    }
    let min = Infinity
    let max = -Infinity
    for (const k of kids) {
      const r = place(k, depth + 1)
      min = Math.min(min, r.min)
      max = Math.max(max, r.max)
    }
    const x = (min + max) / 2
    pos.set(id, { x, y: depth * rowH })
    return { min, max }
  }
  const roots = g.nodes
    .filter((n) => !hasIncoming.has(n.id) && (children.get(n.id)?.length ?? 0) > 0)
    .sort((a, b) => a.title.localeCompare(b.title))
  for (const r of roots) if (!seen.has(r.id)) place(r.id, 0)
  const isolated = g.nodes
    .filter((n) => !connected.has(n.id))
    .sort((a, b) => a.title.localeCompare(b.title))
  for (const n of isolated) pos.set(n.id, { x: slot++ * colW, y: 0 })
  return {
    nodes: g.nodes.map((n) => {
      const p = pos.get(n.id)
      return p ? { ...n, x: p.x, y: p.y } : n
    }),
    edges: g.edges,
  }
}
