import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** The universal avatar fallback — every speaker/persona/app identity
 *  without its own image resolves to this, so nothing ever renders as a
 *  broken image or an initials tile. */
export const DEFAULT_AVATAR = `${import.meta.env.BASE_URL}avatar-default.png`

/** Media paths saved before the app frame moved to its user-scoped path
 *  still say /app/<app-id>/…; re-anchor them on this install's base so old
 *  cards, personas and galleries keep their art. Anything else (data: URLs,
 *  /v1/assets, remote) passes through untouched. */
export function storedMediaUrl(url: string): string {
  const m = /^\/app\/[a-z0-9_-]+\/(.+)$/i.exec(url)
  return m ? `${import.meta.env.BASE_URL}${m[1]}` : url
}

/** Call this from an image's onError. The app frame has no cookies: an `/v1/` picture (the asset store) first fails
 *  there, and the bridge then swaps in a blob of it, so giving up on that first error hides a picture that is about
 *  to load. `giveUp` runs at once for any other address, and for an `/v1/` one only if the picture has still not
 *  loaded after a grace period. */
export function onImageError(img: HTMLImageElement, giveUp: () => void, graceMs = 6000): void {
  if (!img.getAttribute('src')?.startsWith('/v1/')) { giveUp(); return }
  window.setTimeout(() => {
    if (img.isConnected && !(img.complete && img.naturalWidth > 0)) giveUp()
  }, graceMs)
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Display name for a model id or qualified ref: the segment after the last
 *  slash, so "vendor/claude-fable-5.1" and "c_x/anthropic/claude-fable-5.1"
 *  both show as "claude-fable-5.1". Selection keys stay full — display only. */
export function shortModel(id: string): string {
  const i = id.lastIndexOf('/')
  return i === -1 ? id : id.slice(i + 1)
}

/** Relative luminance of a hex color (0=black, 1=white). */
export function hexLuminance(hex: string): number {
  const p = parseInt(hex.slice(1), 16)
  const f = (shift: number) => {
    const v = ((p >> shift) & 0xff) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(16) + 0.7152 * f(8) + 0.0722 * f(0)
}

/** Character name colors are authored against unknown surfaces (chat bg, card
 *  bg — both near-black or near-white depending on theme). A color that
 *  vanishes on one of the two extremes (like an avatar-extracted near-black)
 *  is dropped in favor of the theme's own foreground. */
export function readableNameColor(hex: string | undefined | null): string | undefined {
  if (!hex) return undefined
  const l = hexLuminance(hex)
  return l >= 0.16 && l <= 0.84 ? hex : undefined
}

/** Clipboard write that also works off a secure origin (plain http on a LAN
 *  address, which is how phones reach the engine): `navigator.clipboard` is
 *  undefined there, and even where it exists writeText rejects when the
 *  document isn't focused. The fallback selects a throwaway textarea, which
 *  must live inside the topmost open dialog or the selection is blocked.
 *  Returns whether the text actually reached the clipboard, so callers can
 *  report the failure instead of claiming a copy that never happened. */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the selection-based path
    }
  }
  const dialogs = document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"]')
  const parent = dialogs[dialogs.length - 1] ?? document.body
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none'
  parent.appendChild(area)
  try {
    area.focus()
    area.select()
    area.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
