// Where the World section opens: the tab it shows is remembered for the session, so a link from elsewhere can name one.
export const WORLD_TAB_KEY = 'rp.worldTab'
/** A tab asked for once by a link; the next time the World section focuses a chat it opens there instead of on Overview. */
const WORLD_TAB_ONCE = 'rp.worldTabOnce'
export type WorldTabName = 'overview' | 'places' | 'records' | 'start' | 'backgrounds' | 'runs'
const NAMES: readonly string[] = ['overview', 'places', 'records', 'start', 'backgrounds', 'runs']

/** Make the World section open on `tab` the next time it focuses a chat (the caller then focuses the chat's world). */
export function rememberWorldTab(tab: WorldTabName): void {
  try {
    sessionStorage.setItem(WORLD_TAB_ONCE, tab)
  } catch {
    // no session storage: the World section opens on its own tab
  }
}

/** The tab a link asked for, once; null when none was asked. */
export function takeWorldTab(): WorldTabName | null {
  try {
    const v = sessionStorage.getItem(WORLD_TAB_ONCE)
    sessionStorage.removeItem(WORLD_TAB_ONCE)
    return v && NAMES.includes(v) ? (v as WorldTabName) : null
  } catch {
    return null
  }
}
