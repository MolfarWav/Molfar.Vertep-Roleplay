// The width of the Dashboard strip beside the chat: 340 px by default, dragged between 300 and 420, remembered.

export const STRIP_MIN = 300
export const STRIP_MAX = 420
export const STRIP_DEFAULT = 340
/** Below this width the weather icon and the constellation shrink so nothing overlaps. */
export const STRIP_NARROW = 322
export const STRIP_WIDTH_KEY = 'rp.dashStripWidth'
export const FULLSCREEN_KEY = 'rp.dashFull'

export function clampStripWidth(n: number): number {
  if (!Number.isFinite(n)) return STRIP_DEFAULT
  return Math.min(STRIP_MAX, Math.max(STRIP_MIN, Math.round(n)))
}

export const isNarrowStrip = (width: number): boolean => width < STRIP_NARROW

/** The weather icon: 52 px, 40 px in a narrow strip. */
export const stripWeatherSize = (width: number): number => (isNarrowStrip(width) ? 40 : 52)

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | null => {
  try { return localStorage } catch { return null }
}

/** The remembered width, or the default; storage may be blocked. */
export function readStripWidth(store: Store | null = local()): number {
  try {
    const raw = store?.getItem(STRIP_WIDTH_KEY)
    return raw ? clampStripWidth(Number(raw)) : STRIP_DEFAULT
  } catch {
    return STRIP_DEFAULT
  }
}

export function writeStripWidth(n: number, store: Store | null = local()): void {
  try { store?.setItem(STRIP_WIDTH_KEY, String(clampStripWidth(n))) } catch { /* private mode */ }
}

/** Is the open dashboard remembered as full screen? */
export function readFullscreen(store: Store | null = local()): boolean {
  try { return store?.getItem(FULLSCREEN_KEY) === '1' } catch { return false }
}

export function writeFullscreen(on: boolean, store: Store | null = local()): void {
  try { store?.setItem(FULLSCREEN_KEY, on ? '1' : '0') } catch { /* private mode */ }
}
