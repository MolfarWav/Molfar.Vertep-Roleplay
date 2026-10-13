// The Library map hands a chat to the Canvas tab: "Edit on canvas" opens the chat-links board with
// that chat selected. A one-shot value in localStorage, read once by the Canvas view.
import { useApp } from '@/lib/store'

const KEY = 'rp.canvas.focus'

export function openOnCanvas(chatId: string): void {
  try { localStorage.setItem(KEY, chatId) } catch { /* private mode: the board opens without a selection */ }
  useApp.getState().navigate('canvas')
}

export function takeCanvasFocus(): string | null {
  try {
    const id = localStorage.getItem(KEY)
    localStorage.removeItem(KEY)
    return id
  } catch {
    return null
  }
}
