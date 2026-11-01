// The small pure pieces Home's blocks use: a random pick that stays put for one visit, the tip pool for
// "Did you know?", the open quests of a chat, and the Marketplace cache's shape. No store, no fetch, no DOM,
// so the rules can be tested on their own.

import { compareVersions, type Tip } from './guide'

/** Where the project's releases are listed (the repository in manifest.json). A test keeps it in step. */
export const RELEASES_URL = 'https://github.com/MolfarWav/Molfar.Vertep-Roleplay/releases'

/**
 * The index a seeded pick lands on, moved on by `step` (the "Another" button). `seed` is a random number in
 * [0, 1) drawn once per Home visit, so the block keeps its card while the user stays on the page.
 */
export function pickAt(seed: number, len: number, step = 0): number {
  if (len <= 0) return -1
  const base = Math.floor((Number.isFinite(seed) ? seed : 0) * len)
  return (((base + step) % len) + len) % len
}

/**
 * The tips "Did you know?" draws from: the ones the user has not had in What's new yet, newest release first; the
 * whole list when all of them were seen. Only tips that are in the help list or announce a release count (tour
 * steps are not help).
 */
export function tipPool(tips: readonly Tip[], seen: readonly string[]): Tip[] {
  const usable = tips.filter((tip) => tip.help !== undefined || tip.since !== undefined)
  const unseen = usable.filter((tip) => !seen.includes(tip.id))
  const unseenNew = unseen.filter((tip) => tip.since !== undefined)
  const base = unseenNew.length > 0 ? unseenNew : unseen.length > 0 ? unseen : usable
  return [...base].sort((a, b) => compareVersions(b.since ?? '0', a.since ?? '0'))
}

/** The newest release notes: tips that carry a `since`, newest first, at most `n`. */
export function latestTips(tips: readonly Tip[], n: number): Tip[] {
  return tips
    .filter((tip) => tip.since !== undefined)
    .sort((a, b) => compareVersions(b.since!, a.since!))
    .slice(0, Math.max(0, n))
}

export interface QuestLike {
  id: string
  text: string
  status: 'open' | 'resolved'
  since: number
  kind?: 'main' | 'side' | 'everyday'
}

const KIND_RANK: Record<string, number> = { main: 0, side: 1, everyday: 2 }

/** The open quests and plot threads: main quests first, then the rest, newest first inside a kind. */
export function openQuests<T extends QuestLike>(threads: readonly T[]): T[] {
  return threads
    .filter((th) => th.status === 'open')
    .sort((a, b) => (KIND_RANK[a.kind ?? 'side'] ?? 1) - (KIND_RANK[b.kind ?? 'side'] ?? 1) || b.since - a.since)
}

/** One Marketplace listing as Home shows it. */
export interface MarketCard {
  id: string
  name: string
  creator: string
  tagline: string
  avatar: string | null
  downloads: number
  tokens: number
}

/** Keeps the fields Home shows from a search answer; anything without a name or id is dropped. */
export function normalizeMarket(results: unknown): MarketCard[] {
  if (!Array.isArray(results)) return []
  const out: MarketCard[] = []
  for (const r of results) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!id || !name) continue
    out.push({
      id,
      name,
      creator: typeof o.creator === 'string' ? o.creator : '',
      tagline: typeof o.tagline === 'string' ? o.tagline : '',
      avatar: typeof o.avatar === 'string' && o.avatar ? o.avatar : null,
      downloads: typeof o.downloads === 'number' && Number.isFinite(o.downloads) ? o.downloads : 0,
      tokens: typeof o.tokens === 'number' && Number.isFinite(o.tokens) ? o.tokens : 0,
    })
  }
  return out
}

/** How long one fetched set of suggestions is reused (memory and localStorage). */
export const MARKET_TTL_MS = 60 * 60_000

/** The stored cache `{ at, items }` when it is an hour old or less and holds cards; otherwise null. */
export function freshMarket(stored: unknown, now: number): MarketCard[] | null {
  if (!stored || typeof stored !== 'object') return null
  const o = stored as Record<string, unknown>
  const at = typeof o.at === 'number' ? o.at : NaN
  if (!Number.isFinite(at) || now - at > MARKET_TTL_MS || now < at - MARKET_TTL_MS) return null
  const items = normalizeMarket(o.items)
  return items.length > 0 ? items : null
}

/** 12345 becomes "12.3k", 980 stays "980" (the Marketplace's own short form). */
export function shortCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(Math.round(n))
}
