// "Why?" in the carries panel opens Canvas > Prompt > Memory for that chat (#184 P6). The Canvas reads these keys when
// it mounts: the picked chat is the Prompt board's usual key, and the Memory tab is a one-shot flag the board clears.
import { writeCanvasBoard } from '@/lib/canvas-board'
import { useApp } from '@/lib/store'

export const PROMPT_CHAT_KEY = 'rp.canvas.prompt.chatId'
export const OPEN_MEMORY_KEY = 'rp.canvas.prompt.openMemory'

export function openMemoryTrace(chatId: string): void {
  try {
    localStorage.setItem(PROMPT_CHAT_KEY, JSON.stringify(chatId))
    localStorage.setItem(OPEN_MEMORY_KEY, '1')
  } catch {
    /* storage is optional: the Canvas then opens on its own chat and tab */
  }
  writeCanvasBoard('prompt')
  useApp.getState().navigate('canvas')
}

/** True when "Why?" asked for the Memory tab. Reading does not clear it (a re-render must see it too); clearOpenMemory does. */
export function wantsMemory(): boolean {
  try {
    return localStorage.getItem(OPEN_MEMORY_KEY) === '1'
  } catch {
    return false
  }
}
export function clearOpenMemory(): void {
  try {
    localStorage.removeItem(OPEN_MEMORY_KEY)
  } catch {
    /* nothing to clear */
  }
}
