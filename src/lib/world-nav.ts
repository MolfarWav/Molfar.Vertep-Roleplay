// Where the World section opens: the tab it shows is remembered for the session, so a link from elsewhere can name one.
import { useSyncExternalStore } from 'react'

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

// The World section's left-pane switch (Chats | Worlds | DM), shared with the rail: its DM item (#183) opens the
// section on the DM tab and is current only while that tab is open, as the Agents item is for its Canvas board.
// Kept for the session (a reload of the frame keeps it, a new visit starts on Chats); an event tells the open
// World section and the rail when it changes.
export type WorldTop = 'chats' | 'worlds' | 'dm'
const TOP_KEY = 'rp.worldTop'
const TOP_EVENT = 'rp-world-top'
const TOPS: readonly string[] = ['chats', 'worlds', 'dm']
let topNow: WorldTop | null = null

export function parseWorldTop(raw: unknown): WorldTop {
  return typeof raw === 'string' && TOPS.includes(raw) ? (raw as WorldTop) : 'chats'
}

export function readWorldTop(): WorldTop {
  if (topNow) return topNow
  try {
    topNow = parseWorldTop(sessionStorage.getItem(TOP_KEY))
  } catch {
    topNow = 'chats'
  }
  return topNow
}

export function writeWorldTop(top: WorldTop): void {
  topNow = top
  try {
    sessionStorage.setItem(TOP_KEY, top)
  } catch {
    // no session storage: the value lives until the frame reloads
  }
  window.dispatchEvent(new CustomEvent(TOP_EVENT, { detail: top }))
}

function subscribeTop(cb: () => void): () => void {
  window.addEventListener(TOP_EVENT, cb)
  return () => window.removeEventListener(TOP_EVENT, cb)
}

/** The World section's open tab (Chats, Worlds or DM), live. */
export function useWorldTop(): WorldTop {
  return useSyncExternalStore(subscribeTop, readWorldTop, () => 'chats')
}
