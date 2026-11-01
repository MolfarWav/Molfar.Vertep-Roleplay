// Which board of the Canvas is open (Chat links, Prompt, Agents, Agent sets). Kept in localStorage, so it is
// remembered; a custom event tells the open Canvas and the rail (its Agents item is current while that board is
// open) when it changes. The guide's "Show me" writes the same key.

import { useSyncExternalStore } from 'react'

export type CanvasBoardKey = 'links' | 'prompt' | 'agents' | 'sets'
export const BOARD_KEY = 'rp.canvas.board'
const EVENT = 'rp-canvas-board'

const KEYS: readonly string[] = ['links', 'prompt', 'agents', 'sets']

export function parseBoard(raw: unknown): CanvasBoardKey {
  return typeof raw === 'string' && KEYS.includes(raw) ? (raw as CanvasBoardKey) : 'links'
}

export function readCanvasBoard(): CanvasBoardKey {
  try {
    const raw = localStorage.getItem(BOARD_KEY)
    return raw ? parseBoard(JSON.parse(raw)) : 'links'
  } catch {
    return 'links'
  }
}

export function writeCanvasBoard(board: CanvasBoardKey): void {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(board))
  } catch {
    /* storage is optional: the event still reaches a mounted Canvas */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: board }))
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

/** The open board, live. */
export function useCanvasBoard(): CanvasBoardKey {
  return useSyncExternalStore(subscribe, readCanvasBoard, () => 'links')
}
