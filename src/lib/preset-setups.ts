import type { PresetSetup, PresetSetups } from './types.js'

type Picks = Record<string, string | string[]>

/** Above this many setups the list gets a search field. */
export const SETUPS_SEARCH_FROM = 6

/** Same choices, whatever the key order (a missing name = the preset's default either way). */
export function sameValues(a: Picks, b: Picks): boolean {
  const norm = (v: Picks) => JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k]]))
  return norm(a) === norm(b)
}

/** The setups of one preset, starred first, then in the order they were saved. */
export function orderedSetups(v: PresetSetups): PresetSetup[] {
  return [...v.items].sort((a, b) => Number(b.id === v.defaultId) - Number(a.id === v.defaultId))
}
