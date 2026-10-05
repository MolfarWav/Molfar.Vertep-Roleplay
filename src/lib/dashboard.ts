// The relationship dashboard as the UI reads it: GET /dashboard/state?chatId=&view=1
// (plugins/relations `stateView`). Pure module: no React, no store. The plugin has
// already settled the view for the active line, so nothing here filters notes by
// source or picks snapshots.

import { j } from '@/lib/engine'
import type { DispositionStat, PulseStat, SoulClass } from '@/lib/soul'

export type How = 'saw' | 'heard' | 'guess'
export type Weight = 'routine' | 'significant' | 'pivotal'

export type Stats = Record<DispositionStat, number>
export type Pulse = Record<PulseStat, number>

export interface Clock {
  day: number
  /** "HH:MM", or null when the story gave only a part of the day */
  time: string | null
  /** minutes this turn moved the clock */
  minutes: number
  band: string | null
  place: string | null
  weather: string | null
}

export interface DashEvent {
  id: string
  family: string
  weight: Weight
  /** "user", a character name, or null */
  from: string | null
  to: string | null
  quote: string
  /** the code's arithmetic, one plain English line each ("trust +1 base", "x2 significant") */
  math: string[]
}

/** A thread; `by: 'user'` when the user added it (round 3 plugin). */
export interface Thread { id: string; text: string; since: number; status: 'open' | 'resolved'; by?: 'user' }
export interface Edge { from: string; to: string; role: string; warmth: string }
export type NoteTag = 'pinned' | 'important' | 'everyday'
export const NOTE_TAGS: readonly NoteTag[] = ['pinned', 'important', 'everyday']
/** A notebook entry. `tag`, `by` and `edited` come from the user overlay (round 3 plugin); an older plugin sends none. */
export interface Note {
  id: string
  text: string
  how: How
  from: string | null
  believes?: boolean
  turn: number
  tag?: NoteTag | null
  by?: 'user'
  edited?: boolean
}
export interface NameInfo { knowsUserName: boolean; calls: string }
export type HistoryLine =
  | { turn: number; kind: 'tier'; stat: DispositionStat; from: number; to: number }
  | { turn: number; kind: 'constellation'; from: string; to: string }
  /** the form of address changed ("" = none before) */
  | { turn: number; kind: 'calls'; from: string; to: string }
  /** the soul's start values changed after the character entered: the stats shifted by to - from */
  | { turn: number; kind: 'seed'; from: Record<string, number>; to: Record<string, number> }

export interface DashChar {
  cls: SoulClass
  stats: Stats
  pulse: Pulse
  /** 0..100 for the hostile class, else null */
  hostility: number | null
  constellation: string
  prevConstellation: string | null
  mood: string | null
  moodWas: string | null
  condition: string | null
  outfit: string | null
  holding: string | null
  goal: string | null
  leads: string | null
  blindSpot: string | null
  /** true = not in the scene, or beyond the four with full state: an ensemble entry */
  compact: boolean
  pronouns: 'she' | 'he' | 'they' | null
  /** the character has a soul (saved or proposed) */
  rated: boolean
  pulseBase: Pulse
  /** the same character in the snapshot before, for change arrows */
  prev: { stats: Stats; pulse: Pulse; hostility: number | null; constellation: string | null } | null
  notebook: Note[]
  /** notes the user removed (restorable); absent on an older plugin, which also means notes cannot be edited */
  retired?: Note[]
  name: NameInfo | null
  history: HistoryLine[]
  /** up to the last 10 snapshots that have this character, oldest first */
  series: { turn: number; stats: Stats }[]
}

export interface DashView {
  key: string
  turn: number
  /** ms timestamp the snapshot was made */
  at: number
  op: string | null
  partial: boolean
  sensorModel: string
  /** the newest message has no snapshot yet */
  stale: boolean
  clock: Clock | null
  present: string[]
  /** every character: full ones in the scene first, then compact, then absent */
  order: string[]
  events: DashEvent[]
  threads: Thread[]
  edges: Edge[]
  chars: Record<string, DashChar>
  usage: { calls: number; inTokens: number; outTokens: number; lastMs: number }
  lastError: { at: number; message: string } | null
  /** what the next reply's prompt insert would weigh; null when there is none */
  insert: { tokens: number; budget: number; trimmed: string[] } | null
  insertEnabled: boolean
  mode: 'sensor' | 'fast' | 'manual' | string
  /** the open-thread limit (config `maxThreads`), when the plugin says */
  maxThreads?: number
  /** the newest snapshot was read from the story reply itself (fast mode), not by a sensor call; absent on an older plugin */
  fast?: boolean
  /** the pending "Story, move" nudge (threadId null = all open threads); absent on an older plugin */
  nudge?: Nudge | null
  /** where the story changed place along the active line: the message key ("<id>#<swipe>") and the new place, with the clock as it was then; absent on an older plugin */
  scenes?: { key: string; place: string; day: number | null; time: string | null; band: string | null }[]
}

export interface Nudge { threadId: string | null; at: number }

/** The plugin has the user overlay (notes and threads can be edited). */
export function canEditNotes(view: DashView | null): boolean {
  return !!view && Object.values(view.chars).some((c) => Array.isArray(c.retired))
}

/** The insert's order: pinned, important, unmarked, everyday. */
const TAG_RANK: Record<string, number> = { pinned: 0, important: 1, everyday: 3 }
export function sortedNotes(list: Note[]): Note[] {
  const rank = (n: Note) => (n.tag ? TAG_RANK[n.tag] ?? 2 : 2)
  return [...list].sort((a, b) => rank(a) - rank(b) || (b.turn ?? 0) - (a.turn ?? 0))
}

export interface DashResponse {
  exists: boolean
  chat: boolean
  messages: number
  view: DashView | null
  lastError: { at: number; message: string } | null
}

export const DISPOSITION: readonly DispositionStat[] = ['trust', 'comfort', 'attraction', 'respect', 'affection']
export const PULSE: readonly PulseStat[] = ['excitement', 'arousal']
export const BANDS = ['dawn', 'morning', 'late morning', 'day', 'evening', 'night'] as const

/** Same thresholds as the plugin's tierIndex: < -50, -50..-1, 0..50, > 50. */
export function tierIndex(v: number): 0 | 1 | 2 | 3 {
  if (v < -50) return 0
  if (v < 0) return 1
  if (v <= 50) return 2
  return 3
}

/** Stats each constellation rule reads, in ray order; the widget joins these stars. */
export const CONSTELLATION_STATS: Record<string, readonly DispositionStat[]> = {
  contempt: ['respect'],
  grudging_respect: ['respect'],
  fear: ['comfort', 'respect'],
  romance: ['trust', 'attraction', 'affection'],
  dangerous_pull: ['trust', 'attraction'],
  honor_without_trust: ['trust', 'respect'],
  loyal: ['trust', 'attraction', 'respect'],
  friendship: ['trust', 'comfort', 'affection'],
  outsider: ['trust', 'comfort'],
  strangers: ['trust', 'comfort', 'attraction', 'respect', 'affection'],
  unsettled: [],
}
export const CONSTELLATIONS = Object.keys(CONSTELLATION_STATS)

export const CONSTELLATION_GOLD = '#f2c27a'
export const ZERO_RING = '#538796'
export const COLD_STAR = '#6aa3b5'

/** -1, 0 or 1: how a value moved since the snapshot before (no snapshot = 0). */
export function trend(now: number, before: number | null | undefined): -1 | 0 | 1 {
  if (before === null || before === undefined || before === now) return 0
  return now > before ? 1 : -1
}

/** "+12", "-4", "0". */
export function signed(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}

/** Seconds since the snapshot, never negative. */
export function ageSeconds(at: number, now = Date.now()): number {
  return Math.max(0, Math.round((now - at) / 1000))
}

/** Notebook counts for the strip chips. */
export function noteCounts(c: DashChar): { about: number; heard: number } {
  return { about: c.notebook.length, heard: c.notebook.filter((n) => n.how === 'heard').length }
}

/** Open threads first (newest first), then resolved ones. */
export function sortedThreads(list: Thread[]): Thread[] {
  const open = list.filter((t) => t.status === 'open').sort((a, b) => b.since - a.since)
  return [...open, ...list.filter((t) => t.status !== 'open')]
}

/** The dashed zero ring and the outer edge of the constellation, in viewBox units (the box is 100 wide). */
export const ZERO_RADIUS = 21.5
export const EDGE_RADIUS = 43

/**
 * Distance of a star from the centre: -100 at the centre, 0 on the dashed ring, +100 at the edge,
 * monotonic. A square root spreads the small values, which otherwise sit on the zero ring.
 */
export function starRadius(v: number): number {
  const c = Math.max(-100, Math.min(100, v))
  const k = Math.sqrt(Math.abs(c) / 100)
  return c >= 0 ? ZERO_RADIUS + k * (EDGE_RADIUS - ZERO_RADIUS) : ZERO_RADIUS - k * ZERO_RADIUS
}

/** Arm the one-time "Story, move" nudge for the next reply (POST /dashboard/nudge). Throws with the server's message (409 when the thread is no longer open). */
export async function armNudge(chatId: string, threadId: string | null): Promise<Nudge | null> {
  const r = await j<{ ok?: boolean; nudge?: Nudge | null }>('/dashboard/nudge', { method: 'POST', body: JSON.stringify({ chatId, threadId }) })
  return r?.nudge ?? null
}

/** Cancel the pending nudge (DELETE /dashboard/nudge); the new nudge is always null. */
export async function clearNudge(chatId: string): Promise<null> {
  await j<{ ok?: boolean }>(`/dashboard/nudge?chatId=${encodeURIComponent(chatId)}`, { method: 'DELETE' })
  return null
}
