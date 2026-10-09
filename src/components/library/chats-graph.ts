// The map of one chat (0.9.2): its chain back and its descendants, laid out top to bottom. Pure
// functions, kept apart from the component so tests can load them without the app.
import type { LitChatItem } from './litopys-api'

export interface NodeLayout {
  item: LitChatItem
  x: number
  y: number
  kind: 'link' | 'fork'
  children: NodeLayout[]
}

export interface MapLayout {
  nodes: NodeLayout[]
  width: number
  height: number
}

const SLOT_W = 132
const ROW_H = 96
const TOP = 40

export function predecessorOf(item: LitChatItem, items: LitChatItem[]): LitChatItem | null {
  const predId = item.continues ?? item.parentChatId
  if (!predId) return null
  return items.find((i) => i.id === predId) ?? null
}

export function chainBack(item: LitChatItem, items: LitChatItem[]): LitChatItem[] {
  const chain: LitChatItem[] = []
  let current = item
  const seen = new Set<string>()
  while (current && !seen.has(current.id) && chain.length < 12) {
    seen.add(current.id)
    const pred = predecessorOf(current, items)
    if (!pred) break
    chain.unshift(pred)
    current = pred
  }
  return chain
}

export function descendants(item: LitChatItem, items: LitChatItem[]): LitChatItem[] {
  const result: LitChatItem[] = []
  const visited = new Set<string>([item.id])
  let frontier = [item]
  for (let depth = 0; depth < 6 && result.length < 60; depth++) {
    const next: LitChatItem[] = []
    for (const node of frontier) {
      for (const child of items) {
        if (result.length >= 60) break
        if (visited.has(child.id)) continue
        const predId = child.continues ?? child.parentChatId
        if (predId === node.id) {
          visited.add(child.id)
          result.push(child)
          next.push(child)
        }
      }
    }
    frontier = next
    if (!frontier.length) break
  }
  return result
}

/** The edge into a chat: 'link' when it continues a chat on the map, else 'fork'. */
const kindOf = (item: LitChatItem, items: LitChatItem[]): 'link' | 'fork' =>
  item.continues && items.some((i) => i.id === item.continues) ? 'link' : 'fork'

/**
 * The chat on its own row, its chain back above it in its column (oldest on top), its descendants as a
 * tidy tree below: leaves take consecutive slots, a parent sits centred over its children.
 */
export function layoutChatMap(chat: LitChatItem, items: LitChatItem[]): MapLayout {
  const chain = chainBack(chat, items)
  const kids = new Map<string, LitChatItem[]>()
  for (const d of descendants(chat, items)) {
    const p = predecessorOf(d, items)
    if (p) kids.set(p.id, [...(kids.get(p.id) ?? []), d])
  }
  const nodes: NodeLayout[] = []
  const seen = new Set<string>()
  let slot = 0
  const place = (item: LitChatItem, depth: number): NodeLayout => {
    seen.add(item.id)
    const children = (kids.get(item.id) ?? [])
      .filter((c) => !seen.has(c.id))
      .sort((x, y) => x.title.localeCompare(y.title))
      .map((c) => place(c, depth + 1))
    const x = children.length ? (children[0].x + children[children.length - 1].x) / 2 : (slot++ + 0.5) * SLOT_W
    const node: NodeLayout = { item, x, y: TOP + depth * ROW_H, kind: kindOf(item, items), children }
    nodes.push(node)
    return node
  }
  const root = place(chat, chain.length)
  let below = root
  for (let i = chain.length - 1; i >= 0; i--) {
    const node: NodeLayout = { item: chain[i], x: root.x, y: TOP + i * ROW_H, kind: kindOf(chain[i], items), children: [below] }
    nodes.push(node)
    below = node
  }
  return { nodes, width: Math.max(1, slot) * SLOT_W, height: Math.max(...nodes.map((n) => n.y)) + ROW_H }
}
