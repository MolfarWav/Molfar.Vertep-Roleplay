// Finding what a tip points at: the element carrying `data-guide="<target>"`. The same
// target can be drawn twice (the rail and the phone bar), so the first one that is
// actually on screen wins.

const visible = (el: HTMLElement): boolean => {
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  const cs = getComputedStyle(el)
  return cs.visibility !== 'hidden' && cs.display !== 'none'
}

export function findTarget(target: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-guide="${target}"]`)
  for (const el of all) if (visible(el)) return el
  return null
}
