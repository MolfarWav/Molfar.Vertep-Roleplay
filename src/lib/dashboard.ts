// The relationship dashboard as the UI reads it: GET /dashboard/state?chatId=&view=1
// (plugins/relations `stateView`). Pure module: no React, no store. The plugin has
// already settled the view for the active line, so nothing here filters notes by
// source or picks snapshots.

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

export interface Thread { id: string; text: string; since: number; status: 'open' | 'resolved' }
export interface Edge { from: string; to: string; role: string; warmth: string }
export interface Note { id: string; text: string; how: How; from: string | null; believes?: boolean; turn: number }
export interface NameInfo { knowsUserName: boolean; calls: string }
export type HistoryLine =
  | { turn: number; kind: 'tier'; stat: DispositionStat; from: number; to: number }
  | { turn: number; kind: 'constellation'; from: string; to: string }
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

/** Where the star of a value sits on its ray, 0 (centre, -100) .. 1 (edge, +100). */
export function rayPosition(v: number): number {
  return (Math.max(-100, Math.min(100, v)) + 100) / 200
}
