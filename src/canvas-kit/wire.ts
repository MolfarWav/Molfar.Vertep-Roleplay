export interface Pt {
  x: number
  y: number
}

/** A card's size: its wires leave from the middle of the bottom edge and enter the middle of the top edge. */
export interface CardSize {
  w: number
  h: number
}
const DEFAULT_CARD: CardSize = { w: 200, h: 74 }
/** Room between a card edge and a wire that goes round it, and the radius of the wire's corners. */
const MARGIN = 36
const CORNER = 22

/**
 * Wires leave a card downwards and enter the next one from above. A target below its source gets the
 * plain S-curve (null here). A target at or above the source's level would run back through its own
 * card, so that wire is a route round both cards: down below them, out to one side past their edges,
 * up above them and back down into the target's top (#41).
 */
export function wireCorners(a: Pt, b: Pt, card: CardSize = DEFAULT_CARD): Pt[] | null {
  if (b.y >= a.y + 24) return null
  const right = b.x >= a.x
  const x = right ? Math.max(a.x, b.x) + card.w / 2 + MARGIN : Math.min(a.x, b.x) - card.w / 2 - MARGIN
  // the source card hangs above its port and the target card below its own
  const below = Math.max(a.y, b.y + card.h) + MARGIN
  const above = Math.min(b.y, a.y - card.h) - MARGIN
  return [a, { x: a.x, y: below }, { x, y: below }, { x, y: above }, { x: b.x, y: above }, b]
}

/** The S-curve handles of the plain wire. */
export function wireControls(a: Pt, b: Pt): { c1: Pt; c2: Pt } {
  const dy = Math.max(40, Math.abs(b.y - a.y) * 0.5)
  return { c1: { x: a.x, y: a.y + dy }, c2: { x: b.x, y: b.y - dy } }
}

const len = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y)
const toward = (p: Pt, q: Pt, d: number): Pt => {
  const l = len(p, q) || 1
  return { x: p.x + ((q.x - p.x) * d) / l, y: p.y + ((q.y - p.y) * d) / l }
}

export function wirePath(a: Pt, b: Pt, card: CardSize = DEFAULT_CARD): string {
  const pts = wireCorners(a, b, card)
  if (!pts) {
    const { c1, c2 } = wireControls(a, b)
    return `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`
  }
  // straight runs with rounded corners
  let d = `M${pts[0]!.x},${pts[0]!.y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1]!, c = pts[i]!, n = pts[i + 1]!
    const r = Math.min(CORNER, len(p, c) / 2, len(c, n) / 2)
    const s = toward(c, p, r), e = toward(c, n, r)
    d += ` L${s.x},${s.y} Q${c.x},${c.y} ${e.x},${e.y}`
  }
  const last = pts[pts.length - 1]!
  return `${d} L${last.x},${last.y}`
}

/** A point on the wire, u in 0..1 (along its length). */
export function wirePoint(a: Pt, b: Pt, u: number, card: CardSize = DEFAULT_CARD): Pt {
  const pts = wireCorners(a, b, card)
  if (!pts) {
    const { c1, c2 } = wireControls(a, b)
    const m = 1 - u
    return {
      x: m ** 3 * a.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u ** 3 * b.x,
      y: m ** 3 * a.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u ** 3 * b.y,
    }
  }
  const total = pts.slice(1).reduce((s, q, i) => s + len(pts[i]!, q), 0)
  let left = Math.min(Math.max(u, 0), 1) * total
  for (let i = 1; i < pts.length; i++) {
    const seg = len(pts[i - 1]!, pts[i]!)
    if (left <= seg || i === pts.length - 1) return toward(pts[i - 1]!, pts[i]!, Math.min(left, seg))
    left -= seg
  }
  return b
}
