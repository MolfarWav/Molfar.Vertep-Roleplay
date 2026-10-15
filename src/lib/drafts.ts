import type { ID } from './types'

/** Unsent composer text lives under a per-chat key so a reload, rebuild, or
 *  chat switch never eats a half-written thought. */
export const draftKey = (chatId: ID) => `chrysalis.roleplay.draft.${chatId}`

export const readDraft = (chatId: ID): string => {
  try { return localStorage.getItem(draftKey(chatId)) ?? '' } catch { return '' }
}

/** Keys the shell refused to store (its storage is full): the engine bridge
 *  lists them (window.chrysalisStorage, 1.0.9+) and fires "chrysalis:storage". */
export function unsavedKeys(): string[] {
  try {
    const api = (window as { chrysalisStorage?: { unsaved?: () => Array<{ key: string }> } }).chrysalisStorage
    return api?.unsaved ? api.unsaved().map((u) => u.key) : []
  } catch {
    return []
  }
}

/** A waiting fill goes straight into the box only while the draft still reads what it read when
 *  the request started; anything typed since wins and the fill is offered instead. */
export const fillAction = (base: string, current: string): 'put' | 'offer' => (current === base ? 'put' : 'offer')
