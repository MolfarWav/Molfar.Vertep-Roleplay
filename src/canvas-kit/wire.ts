export interface Pt {
  x: number
  y: number
}

/**
 * Wires leave a card downwards and enter the next one from above. A target below its source gets the
 * plain S-curve; a target at or above the source's level would loop back over its own card, so that
 * wire swings out to the side and comes round (#41).
 */
export function wireControls(a: Pt, b: Pt): { c1: Pt; c2: Pt } {
  if (b.y >= a.y + 24) {
    const dy = Math.max(40, (b.y - a.y) * 0.5)
    return { c1: { x: a.x, y: a.y + dy }, c2: { x: b.x, y: b.y - dy } }
  }
  const dy = 60 + Math.min(120, (a.y - b.y) * 0.25)
  const swing = Math.max(90, Math.min(240, Math.abs(b.x - a.x) * 0.5 + 60)) * (b.x >= a.x ? 1 : -1)
  return { c1: { x: a.x + swing, y: a.y + dy }, c2: { x: b.x - swing, y: b.y - dy } }
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
