// Finding what a tip points at: the element carrying `data-guide="<target>"`. The same
// target can be drawn twice (the rail and the phone bar), so the first one that is
// actually on screen wins.

const visible = (el: HTMLElement): boolean => {
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  const cs = getComputedStyle(el)
  // a toolbar that only shows on hover is no target, unless the guide can show it (data-guide-reveal)
  if (cs.opacity === '0' && !el.hasAttribute('data-guide-reveal')) return false
  return cs.visibility !== 'hidden' && cs.display !== 'none'
}

export function findTarget(target: string | undefined): HTMLElement | null {
  if (!target) return null
  const all = document.querySelectorAll<HTMLElement>(`[data-guide="${target}"]`)
  for (const el of all) if (visible(el)) return el
  return null
}
