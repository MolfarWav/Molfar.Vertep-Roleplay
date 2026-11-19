// A floating box over the chat that folds into a round chip (the places map, Molfar.Vertep#454): where it stands,
// how big it is, whether it is folded. Pure geometry and the browser-side copy; the pointer handling is the
// component's. Kept per chat in this browser, like the sprite windows (`sprite-stage.ts`), whose `fitIn` it reuses.

import { fitIn, type Area } from '@/lib/sprite-stage'

export const CHIP = 48
export const MIN_W = 260
export const MIN_H = 200
/** Room kept between a box and the edge of its area, and between a default box and the message box (px). */
const EDGE = 12
const ABOVE_COMPOSER = 96

export interface FloatBox {
  /** top-left in page pixels; null = not placed yet (the default place) */
  x: number | null
  y: number | null
  /** size when open; null = the default */
  w: number | null
  h: number | null
  /** a box starts folded: the chip is what a chat shows until the user opens it */
  folded: boolean
}

export const defaultBox = (): FloatBox => ({ x: null, y: null, w: null, h: null, folded: true })

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)

export function normalizeBox(raw: unknown): FloatBox {
  if (!raw || typeof raw !== 'object') return defaultBox()
  const r = raw as Record<string, unknown>
  const x = num(r.x)
  const y = num(r.y)
  return {
    x: x !== null && y !== null ? x : null,
    y: x !== null && y !== null ? y : null,
    w: num(r.w) !== null ? Math.max(MIN_W, num(r.w)!) : null,
    h: num(r.h) !== null ? Math.max(MIN_H, num(r.h)!) : null,
    folded: r.folded !== false,
  }
}

export const boxKey = (name: string, chatId: string) => `rp.float.${name}.${chatId}`

export function loadBox(name: string, chatId: string, storage: Pick<Storage, 'getItem'> | null): FloatBox {
  try { return normalizeBox(JSON.parse(storage?.getItem(boxKey(name, chatId)) ?? 'null')) } catch { return defaultBox() }
}

export function saveBox(name: string, chatId: string, box: FloatBox, storage: Pick<Storage, 'setItem'> | null): void {
  // a browser blocking site data throws: the box then lasts for this session only
  try { storage?.setItem(boxKey(name, chatId), JSON.stringify(box)) } catch { /* storage unavailable */ }
}

/** The open size: the saved one, else 360 x 300 (a phone: the area's width, a little over half its height), never bigger than the area. */
export function openSize(box: FloatBox, area: Area, phone: boolean): { w: number; h: number } {
  const maxW = Math.max(MIN_W, area.w - EDGE * 2)
  const maxH = Math.max(MIN_H, area.h - EDGE * 2)
  const w = phone ? maxW : Math.min(maxW, Math.max(MIN_W, box.w ?? 360))
  const h = Math.min(maxH, Math.max(MIN_H, box.h ?? (phone ? Math.round(area.h * 0.55) : 300)))
  return { w, h }
}

/**
 * Where the box is, wholly inside `area`. A box never placed stands low in the area: the chip at the left on a
 * desktop (the sprite window keeps the right), at the top right on a phone (the cast strip and the sprite window
 * use the bottom); an open box at the lower right, a phone's across the bottom.
 */
export function boxRect(box: FloatBox, area: Area, phone: boolean): { x: number; y: number; w: number; h: number } {
  const size = box.folded ? { w: CHIP, h: CHIP } : openSize(box, area, phone)
  if (box.x !== null && box.y !== null) {
    const p = fitIn({ x: box.x, y: box.y }, size, area)
    // a phone's open box is as wide as the area: it stands on the area's left edge plus the margin
    return { ...(phone && !box.folded ? { x: area.x + EDGE, y: p.y } : p), ...size }
  }
  if (phone) {
    return box.folded
      ? { x: area.x + area.w - CHIP - EDGE, y: area.y + EDGE, ...size }
      : { x: area.x + EDGE, y: area.y + area.h - size.h - EDGE, ...size }
  }
  return box.folded
    ? { x: area.x + EDGE + 4, y: area.y + area.h - CHIP - ABOVE_COMPOSER, ...size }
    : { x: area.x + area.w - size.w - 16, y: area.y + area.h - size.h - ABOVE_COMPOSER, ...size }
}

/** Fold or open. Opening takes the chip's place and pulls the box back inside the area; folding keeps its corner. */
export function setFolded(box: FloatBox, folded: boolean, area: Area, phone: boolean): FloatBox {
  if (box.folded === folded) return box
  const r = boxRect(box, area, phone)
  if (folded) return { ...box, folded, x: r.x, y: r.y }
  const size = openSize({ ...box, folded: false }, area, phone)
  const p = fitIn({ x: r.x, y: r.y }, size, area)
  return { ...box, folded, x: p.x, y: p.y }
}

/** A drag to (x, y): the box stays inside the area. */
export function dragTo(box: FloatBox, to: { x: number; y: number }, area: Area, phone: boolean): FloatBox {
  const size = box.folded ? { w: CHIP, h: CHIP } : openSize(box, area, phone)
  const p = fitIn(to, size, area)
  return { ...box, x: p.x, y: p.y }
}

/** A resize to (w, h) from the lower corner: inside the area, never below the minimum; a phone changes the height only. */
export function resizeTo(box: FloatBox, to: { w: number; h: number }, area: Area, phone: boolean): FloatBox {
  const r = boxRect(box, area, phone)
  const maxW = Math.max(MIN_W, area.x + area.w - EDGE - r.x)
  const maxH = Math.max(MIN_H, area.y + area.h - EDGE - r.y)
  return {
    ...box,
    x: r.x,
    y: r.y,
    w: phone ? box.w : Math.round(Math.min(maxW, Math.max(MIN_W, to.w))),
    h: Math.round(Math.min(maxH, Math.max(MIN_H, to.h))),
  }
}
