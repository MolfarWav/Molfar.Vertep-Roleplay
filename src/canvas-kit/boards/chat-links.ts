import { layoutForest, splitEnd, wouldCycle } from '../graph'
import type { BoardKind, CanvasEdge, Graph } from '../graph'
import type { LitChatItem } from '@/components/library/litopys-api'

export const CHAT_LINKS: BoardKind = {
  kind: 'chat-links',
  types: {
    chat: {
      type: 'chat',
      label: 'Chat',
      colorVar: '--k-story',
      hint: 'A chat from the Library',
      ports: [
        { id: 'prev', side: 'in', type: 'story', label: 'continues', max: 1 },
        { id: 'next', side: 'out', type: 'story', label: 'continued by' },
      ],
    },
  },
  canConnect: (g: Graph, from: string, to: string) => {
    if (wouldCycle(g, from, to)) {
      return { ok: false, reason: 'That would make a loop: a chat cannot continue its own continuation' }
    }
    return { ok: true }
  },
}

export const boardFromChats = (items: LitChatItem[], positions?: Record<string, { x: number; y: number }>): Graph => {
  const ids = new Set(items.map((i) => i.id))
  const nodes = items.map((i) => ({
    id: i.id,
    type: 'chat',
    x: 0,
    y: 0,
    title: i.title || 'Untitled',
    subtitle: i.name,
  }))
  const edges: CanvasEdge[] = []
  for (const i of items) {
    if (i.continues && ids.has(i.continues)) {
      edges.push({ id: `l:${i.id}`, from: `${i.continues}:next`, to: `${i.id}:prev` })
    }
  }
  let g: Graph = { nodes, edges }
  g = layoutForest(g)
  if (positions) {
    g = {
      ...g,
      nodes: g.nodes.map((n) => {
        const p = positions[n.id]
        return p ? { ...n, x: p.x, y: p.y } : n
      }),
    }
  }
  return g
}

/**
 * The `setLitLink` calls that turn `before` into `after`. A chat removed from the board is only hidden
 * there ("Remove" keeps it in the Library), so neither it nor a link to a hidden chat counts as a change.
 */
export const linkChanges = (before: Graph, after: Graph): Array<{ chatId: string; from: string | null }> => {
  const prevOf = (g: Graph): Map<string, string> => {
    const m = new Map<string, string>()
    for (const e of g.edges) {
      const [dst, port] = splitEnd(e.to)
      if (port === 'prev' && !m.has(dst)) m.set(dst, splitEnd(e.from)[0])
    }
    return m
  }
  const beforePrev = prevOf(before)
  const afterPrev = prevOf(after)
  const shown = new Set(after.nodes.map((n) => n.id))
  const changes: Array<{ chatId: string; from: string | null }> = []
  for (const n of after.nodes) {
    const was = beforePrev.get(n.id) ?? null
    const now = afterPrev.get(n.id) ?? null
    if (was === now) continue
    if (now === null && was !== null && !shown.has(was)) continue
    changes.push({ chatId: n.id, from: now })
  }
  return changes.sort((a, b) => (a.chatId < b.chatId ? -1 : a.chatId > b.chatId ? 1 : 0))
}
