// The sprite stage (Molfar.Vertep#456): a chat can show several sprite windows, each with one character.
// The pure parts: who can be shown, who spoke last and is in the scene, which window shows whom, how the
// layout is kept and arranged. The window itself is src/components/chat/expression-panel.tsx.

import { leadVoiceIn, voiceMatcher, type DialogueVoice } from '@/lib/dialogue-voices'
import { detectExpressionLabels } from '@/lib/expressions'
import { pickSpriteFor, type PickedSprite, type SpriteCard } from '@/lib/sprite-pick'
import type { Character, Message } from '@/lib/types'

export const MAX_WINDOWS = 8
/** "Spoke recently" = within this many of the latest assistant messages (when the Dashboard has no scene list). */
export const RECENT = 6
/** How far back a character's last line is looked for. */
const SCAN = 40

const low = (s: string) => s.trim().toLowerCase()
const hasImage = (c: Pick<SpriteCard, 'expressions'>) => c.expressions.some((s) => !!s.url)

// ── Who can be shown ──

/** One character a window can show. `character` is the voice's name for a Narrator voice, '' for a whole card. */
export interface StageMember {
  key: string
  name: string
  card: SpriteCard
  character: string
  /** where the chat keeps this one's outfit choice (`Chat.spriteOutfits`) */
  outfitKey: string
  /** how this one's lines are recognised in a narrator message; null = the whole message when it is theirs */
  voice: DialogueVoice | null
  /** the card whose messages are this one's own (a group member), or null */
  ownerId: string | null
}

/** A group member's outfit lives under `@<card id>`: a bare '' key would be shared by every card of the group. */
export const memberOutfitKey = (cardId: string) => `@${cardId}`

/**
 * The outfit record `pickSprite` reads for a card that is a member of a group: the member's own choice stands in
 * for the '' key. Outside a group the record is returned as it is.
 */
export function outfitsFor(outfits: Record<string, string> | undefined, cardId: string, inGroup: boolean): Record<string, string> | undefined {
  if (!inGroup || !outfits) return outfits
  const own = outfits[memberOutfitKey(cardId)]
  return own ? { ...outfits, '': own } : outfits
}

/**
 * Everyone the chat can show a sprite for: a group's members that own sprites (in the chat's order), the voices of a
 * Narrator card that own sprites (plus the card itself when it has shared sprites), or the one card.
 */
export function stageMembers(chatCard: Character | undefined, characters: readonly Character[], order?: readonly string[]): StageMember[] {
  if (!chatCard) return []
  if (chatCard.isGroup) {
    const ids = [...(chatCard.group?.memberIds ?? chatCard.members ?? [])]
    if (order?.length) ids.sort((a, b) => (order.indexOf(a) + 1 || 1e6) - (order.indexOf(b) + 1 || 1e6))
    const out: StageMember[] = []
    for (const id of ids) {
      const c = characters.find((x) => x.id === id && !x.isGroup)
      if (!c || !hasImage(c)) continue
      const match = voiceMatcher(c.name)
      out.push({
        key: `m:${c.id}`, name: c.name, card: c, character: '', outfitKey: memberOutfitKey(c.id),
        voice: match ? { name: c.name, color: '', match } : null, ownerId: c.id,
      })
    }
    return out
  }
  if (!hasImage(chatCard)) return []
  const out: StageMember[] = []
  const owners = new Set(chatCard.expressions.filter((s) => s.url && s.character?.trim()).map((s) => low(s.character!)))
  for (const v of chatCard.voices ?? []) {
    const match = voiceMatcher(v.name)
    if (!match || !owners.has(low(v.name))) continue
    out.push({ key: `v:${low(v.name)}`, name: v.name, card: chatCard, character: v.name, outfitKey: v.name, voice: { name: v.name, color: v.color, match }, ownerId: null })
  }
  // the card itself: the only one of a plain card, the voice of the narration of a Narrator card with shared sprites
  if (!out.length || chatCard.expressions.some((s) => s.url && !s.character?.trim())) {
    out.push({ key: `c:${chatCard.id}`, name: chatCard.name, card: chatCard, character: '', outfitKey: '', voice: null, ownerId: chatCard.id })
  }
  return out
}

// ── Who spoke, who is in the scene ──

/** What one character last said: their text, how many assistant messages ago, and where in that message. */
export interface Contribution { text: string; ago: number; order: number }

const textOf = (m: Message) => m.swipes[m.activeSwipe]?.content ?? ''

/** The latest assistant messages, newest first (a hidden picture is not a turn). */
function turns(messages: readonly Message[]): { msg: Message; text: string }[] {
  const out: { msg: Message; text: string }[] = []
  for (let i = messages.length - 1; i >= 0 && out.length < SCAN; i--) {
    const m = messages[i]!
    if (m.role !== 'assistant' || m.picture) continue
    out.push({ msg: m, text: textOf(m) })
  }
  return out
}

/** A streaming reply re-reads the history on every token: a settled message is read for a member once. */
const lineCache = new WeakMap<Message, Map<string, { text: string; hit: { text: string; order: number } | null }>>()

/** The lines of a message that open with this member's label ("Aria: ..."), or null. */
function labelledLines(m: StageMember, msg: Message, text: string): { text: string; order: number } | null {
  let per = lineCache.get(msg)
  if (!per) { per = new Map(); lineCache.set(msg, per) }
  const seen = per.get(m.key)
  if (seen && seen.text === text) return seen.hit
  const mine: string[] = []
  let last = -1
  text.split(/\r?\n/).forEach((line, i) => { if (leadVoiceIn(line, [m.voice!])) { mine.push(line); last = i } })
  const hit = mine.length ? { text: mine.join('\n'), order: last } : null
  per.set(m.key, { text, hit })
  return hit
}

/** The last thing each member said (null: nothing found within the scan). */
export function contributions(members: readonly StageMember[], messages: readonly Message[]): Map<string, Contribution | null> {
  const t = turns(messages)
  const out = new Map<string, Contribution | null>()
  for (const m of members) {
    let found: Contribution | null = null
    for (let ago = 0; ago < t.length && !found; ago++) {
      const { msg, text } = t[ago]!
      const from = msg.characterId ?? null
      if (m.ownerId && from === m.ownerId) { found = { text, ago, order: 1e6 }; break }
      if (!m.voice) {
        // a plain card: a message that is nobody else's
        if (!m.ownerId || from === null) found = { text, ago, order: 1e6 }
        continue
      }
      const hit = labelledLines(m, msg, text)
      if (hit) found = { text: hit.text, ago, order: hit.order }
    }
    out.set(m.key, found)
  }
  return out
}

/** The one who spoke last: the newest message, and in a message with several voices the one speaking last. */
export function speakerOf(members: readonly StageMember[], said: ReadonlyMap<string, Contribution | null>): string | null {
  let best: StageMember | null = null
  let bestC: Contribution | null = null
  for (const m of members) {
    const c = said.get(m.key) ?? null
    if (!c) continue
    if (!bestC || c.ago < bestC.ago || (c.ago === bestC.ago && c.order > bestC.order)) { best = m; bestC = c }
  }
  return best?.key ?? members[0]?.key ?? null
}

/** Is a name the Dashboard lists the member? Equal names, or one's first word is the other's whole name. */
export function sameName(a: string, b: string): boolean {
  const x = low(a)
  const y = low(b)
  if (!x || !y) return false
  if (x === y) return true
  const fx = x.split(/\s+/)[0]!
  const fy = y.split(/\s+/)[0]!
  return (fx === y && fx.length >= 2) || (fy === x && fy.length >= 2)
}

/**
 * Who is in the scene, most recently active first. With the Dashboard's `present` list: the members it names.
 * Without one (or when it names none of them): the members who spoke within `RECENT` messages. A chat with no
 * history yet: everyone, in the chat's order.
 */
export function sceneKeys(members: readonly StageMember[], said: ReadonlyMap<string, Contribution | null>, present: readonly string[] | null): string[] {
  const rank = (m: StageMember) => said.get(m.key)?.ago ?? 1e6
  const byRecency = [...members].sort((a, b) => rank(a) - rank(b))
  const named = present?.length ? byRecency.filter((m) => present.some((p) => sameName(p, m.name))) : []
  if (named.length) return named.map((m) => m.key)
  const recent = byRecency.filter((m) => rank(m) < RECENT)
  if (recent.length) return recent.map((m) => m.key)
  return members.map((m) => m.key)
}

// ── The windows ──

export interface StageWindow {
  id: string
  /** 'speaker' = whoever speaks, 'auto' = the next in the scene, or a member's key */
  who: string
  /** pixels from the top-left of the page; null = the default corner */
  x: number | null
  y: number | null
  /** the sprite's height in pixels; null = the default */
  h: number | null
  folded: boolean
  /** no frame, no backing: only the picture, and clicks pass through to the chat */
  transparent: boolean
}

/** Where the windows sit against the chat text: over it (as always), under it, or in a strip the chat keeps for them. */
export type StagePlace = 'front' | 'behind' | 'reserve'
export const STAGE_PLACES: readonly StagePlace[] = ['front', 'behind', 'reserve']

export interface StageLayout {
  windows: StageWindow[]
  place: StagePlace
  /** an empty "next in the scene" window disappears instead of staying blank */
  hideEmpty: boolean
  /** which member each 'auto' window holds (window id → member key), kept while they stay in the scene */
  slots: Record<string, string>
}

export const SPRITE_WIDTH_RATIO = 0.6

export function newWindow(id: string, who: StageWindow['who'] = 'speaker'): StageWindow {
  return { id, who, x: null, y: null, h: null, folded: false, transparent: false }
}

export function defaultLayout(legacy?: { pos?: { x: number; y: number } | null; height?: number | null; folded?: boolean }): StageLayout {
  const w = newWindow('w1')
  if (legacy?.pos) { w.x = legacy.pos.x; w.y = legacy.pos.y }
  if (legacy?.height) w.h = legacy.height
  if (legacy?.folded) w.folded = true
  return { windows: [w], place: 'front', hideEmpty: false, slots: {} }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Reads a stored layout; anything unreadable becomes the default (one window), never an error. */
export function normalizeLayout(raw: unknown): StageLayout {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const seen = new Set<string>()
  const windows: StageWindow[] = []
  for (const item of Array.isArray(r.windows) ? r.windows : []) {
    if (!item || typeof item !== 'object' || windows.length >= MAX_WINDOWS) continue
    const w = item as Record<string, unknown>
    const id = typeof w.id === 'string' && w.id ? w.id : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    windows.push({
      id,
      who: typeof w.who === 'string' && w.who ? w.who : 'speaker',
      x: num(w.x), y: num(w.y), h: num(w.h),
      folded: w.folded === true,
      transparent: w.transparent === true,
    })
  }
  if (!windows.length) return defaultLayout()
  const slots: Record<string, string> = {}
  if (r.slots && typeof r.slots === 'object') {
    for (const [k, v] of Object.entries(r.slots as Record<string, unknown>)) if (typeof v === 'string' && seen.has(k)) slots[k] = v
  }
  const place = STAGE_PLACES.find((x) => x === r.place) ?? 'front'
  return { windows, place, hideEmpty: r.hideEmpty === true, slots }
}

export const layoutKey = (chatId: string) => `rp.stage.${chatId}`

export function loadLayout(chatId: string, storage: Pick<Storage, 'getItem'> | null): StageLayout {
  const read = (k: string): unknown => {
    try { return JSON.parse(storage?.getItem(k) ?? 'null') } catch { return null }
  }
  const stored = read(layoutKey(chatId))
  if (stored) return normalizeLayout(stored)
  // the single window of before: its position, height and fold carry over into the first window
  const pos = read('expr-panel-pos') as { x?: unknown; y?: unknown } | null
  return defaultLayout({
    pos: pos && num(pos.x) !== null && num(pos.y) !== null ? { x: pos.x as number, y: pos.y as number } : null,
    height: num(read('expr-panel-height')),
    folded: read('expr-panel-minimized') === true,
  })
}

export function saveLayout(chatId: string, layout: StageLayout, storage: Pick<Storage, 'setItem'> | null): void {
  // a browser blocking site data throws: the layout then lasts for this session only
  try { storage?.setItem(layoutKey(chatId), JSON.stringify(layout)) } catch { /* storage unavailable */ }
}

const freeId = (layout: StageLayout) => {
  for (let n = layout.windows.length + 1; ; n++) if (!layout.windows.some((w) => w.id === `w${n}`)) return `w${n}`
}

/** The part of the page the chat occupies (its column), in page pixels: windows are laid out inside it. */
export interface Area { x: number; y: number; w: number; h: number }

/** One more window, "next in the scene", put to the left of the others; no-op at the cap. */
export function addWindow(layout: StageLayout, area: Area): StageLayout {
  if (layout.windows.length >= MAX_WINDOWS) return layout
  const w = newWindow(freeId(layout), 'auto')
  const h = Math.round(area.h * 0.34)
  const width = h * SPRITE_WIDTH_RATIO
  const right = area.x + area.w
  const lefts = layout.windows.map((x) => (x.x ?? right - 16 - (x.h ?? area.h * 0.42) * SPRITE_WIDTH_RATIO))
  const left = Math.min(...lefts) - width - 12
  const n = layout.windows.length
  const fits = left >= area.x + 8
  w.h = h
  w.x = Math.round(fits ? left : area.x + 24 * n)
  w.y = Math.max(area.y + 8, Math.round(area.y + area.h - 88 - h - (fits ? 0 : 24 * n)))
  return { ...layout, windows: [...layout.windows, w] }
}

export function removeWindow(layout: StageLayout, id: string): StageLayout {
  if (layout.windows.length <= 1) return layout
  const slots = { ...layout.slots }
  delete slots[id]
  return { ...layout, windows: layout.windows.filter((w) => w.id !== id), slots }
}

export function patchWindow(layout: StageLayout, id: string, patch: Partial<Omit<StageWindow, 'id'>>): StageLayout {
  return { ...layout, windows: layout.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) }
}

export type Arrangement = 'grid' | 'row'

/**
 * Places every window inside the chat's column by an estimate of a sprite's width (`SPRITE_WIDTH_RATIO` of its
 * height): a row along the bottom (the visual-novel look; `rowHeight` is the share of the chat's height a window may
 * take, less for a strip that the chat keeps under its text) or a block of columns in the lower right. The user drags
 * from there.
 */
export function arrange(layout: StageLayout, kind: Arrangement, area: Area, rowHeight = 0.5): StageLayout {
  const n = layout.windows.length
  const bottom = area.y + area.h - 88
  const ws: StageWindow[] = []
  if (kind === 'row') {
    const h = Math.round(Math.min(area.h * rowHeight, (area.w - (n + 1) * 8) / n / SPRITE_WIDTH_RATIO))
    const w = h * SPRITE_WIDTH_RATIO
    const gap = Math.max(8, (area.w - n * w) / (n + 1))
    layout.windows.forEach((win, i) => ws.push({ ...win, h, x: Math.round(area.x + gap + i * (w + gap)), y: Math.max(area.y + 8, Math.round(bottom - h)) }))
  } else {
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4
    const rows = Math.ceil(n / cols)
    // clear of the chat's header (about 120 px) at the top and of the composer at the bottom
    const h = Math.round(Math.min(area.h * 0.6, (area.h - 88 - 120) / rows - 8, (area.w * 0.55 - (cols - 1) * 8) / cols / SPRITE_WIDTH_RATIO))
    const w = h * SPRITE_WIDTH_RATIO
    const left = area.x + area.w - 16 - cols * w - (cols - 1) * 8
    const top = bottom - rows * h - (rows - 1) * 8
    layout.windows.forEach((win, i) => ws.push({ ...win, h, x: Math.round(left + (i % cols) * (w + 8)), y: Math.max(area.y + 8, Math.round(top + Math.floor(i / cols) * (h + 8))) }))
  }
  return { ...layout, windows: ws }
}

/**
 * Which member each 'auto' window holds. A member keeps their window while they are in the scene; one who left
 * frees it (it goes blank); a newcomer takes the first free window. Members already shown by another window
 * (`taken`: a named window, or the spotlight of a "whoever speaks" window) are not given a second one. Window
 * order decides ties.
 */
export function assignSlots(autoIds: readonly string[], previous: Readonly<Record<string, string>>, scene: readonly string[], taken: ReadonlySet<string> = new Set()): Record<string, string> {
  const pool = scene.filter((k) => !taken.has(k))
  const out: Record<string, string> = {}
  const used = new Set<string>()
  for (const id of autoIds) {
    const k = previous[id]
    if (k && pool.includes(k) && !used.has(k)) { out[id] = k; used.add(k) }
  }
  const waiting = pool.filter((k) => !used.has(k))
  for (const id of autoIds) {
    if (out[id]) continue
    const k = waiting.shift()
    if (k) out[id] = k
  }
  return out
}

export interface StageView {
  /** window id → member key shown (null: blank) */
  shows: Record<string, string | null>
  /** the new slots of the 'auto' windows, to keep */
  slots: Record<string, string>
}

export function resolveWindows(layout: StageLayout, members: readonly StageMember[], speaker: string | null, scene: readonly string[]): StageView {
  const known = new Set(members.map((m) => m.key))
  const fixed = new Set(layout.windows.map((w) => w.who).filter((k) => known.has(k)))
  // a "whoever speaks" window is the spotlight: the "next in the scene" windows show the others
  if (speaker && layout.windows.some((w) => w.who === 'speaker')) fixed.add(speaker)
  const autos = layout.windows.filter((w) => w.who === 'auto').map((w) => w.id)
  const slots = assignSlots(autos, layout.slots, scene, fixed)
  const shows: Record<string, string | null> = {}
  for (const w of layout.windows) {
    shows[w.id] = w.who === 'speaker' ? speaker : w.who === 'auto' ? slots[w.id] ?? null : known.has(w.who) ? w.who : null
  }
  return { shows, slots }
}

/** The sprite a member shows: their last line decides the emotion, and it stays until they speak again. */
export function memberSprite(m: StageMember, said: Contribution | null, outfits: Record<string, string> | undefined): PickedSprite | null {
  const labels = said ? detectExpressionLabels(said.text) : []
  return pickSpriteFor(labels, m.card, m.character, outfits?.[m.outfitKey])
}
