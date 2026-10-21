export interface Pt {
  x: number
  y: number
}

/** How far past the outer wire end the handles sit: the curve peaks at three quarters of it, which clears half a card (100) with room. */
const SWING = 170

/**
 * Wires leave a card downwards and enter the next one from above. A target below its source gets the
 * plain S-curve; a target at or above the source's level would run back through its own card, so that
 * wire goes out to one side, past both cards, and comes round (#41).
 */
export function wireControls(a: Pt, b: Pt): { c1: Pt; c2: Pt } {
  if (b.y >= a.y + 24) {
    const dy = Math.max(40, (b.y - a.y) * 0.5)
    return { c1: { x: a.x, y: a.y + dy }, c2: { x: b.x, y: b.y - dy } }
  }
  const dy = 60 + Math.min(120, (a.y - b.y) * 0.25)
  // both handles go out on the same side, past the cards (a card is 200 wide, its wire leaves from the middle)
  const right = b.x >= a.x
  const x = right ? Math.max(a.x, b.x) + SWING : Math.min(a.x, b.x) - SWING
  return { c1: { x, y: a.y + dy }, c2: { x, y: b.y - dy } }
}

export function wirePath(a: Pt, b: Pt): string {
  const { c1, c2 } = wireControls(a, b)
  return `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`
}

/** A point on the wire, u in 0..1. */
export function wirePoint(a: Pt, b: Pt, u: number): Pt {
  const { c1, c2 } = wireControls(a, b)
  const m = 1 - u
  return {
    x: m ** 3 * a.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u ** 3 * b.x,
    y: m ** 3 * a.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u ** 3 * b.y,
  }
}
