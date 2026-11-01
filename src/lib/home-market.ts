// Home's "From the Marketplace" suggestion: one search of the Marketplace's top listings (the same route and body
// the Marketplace view sends for Chub with its default filters: trending, safe maturity, 24 per page), kept for an
// hour in memory and in localStorage. Nothing here shows a spinner: a failure gives an empty list, and Home then
// leaves the block out.

import { useEffect, useState } from 'react'
import { j } from './engine'
import { MARKET_TTL_MS, freshMarket, normalizeMarket, pickAt, type MarketCard } from './home-pick'

export const MARKET_KEY = 'rp.home.market'
const PAGE = 24

let memory: { at: number; items: MarketCard[] } | null = null

/** The request body: the Marketplace's own shape for Chub, default filters (adult listings hidden). */
export function marketBody(): Record<string, unknown> {
  return {
    source: 'chub',
    search: '',
    sort: 'downloads',
    trending: true,
    page: 1,
    first: PAGE,
    tags: [],
    tagsMode: 'all',
    nsfw: false,
    nsfwOnly: false,
    nsfl: false,
    includeForks: true,
  }
}

function readStored(): unknown {
  try {
    return JSON.parse(localStorage.getItem(MARKET_KEY) ?? 'null')
  } catch {
    return null
  }
}

function writeStored(value: unknown): void {
  try {
    localStorage.setItem(MARKET_KEY, JSON.stringify(value))
  } catch {
    /* private window or full storage: the memory copy still serves this session */
  }
}

/** The top listings for this hour: memory, then localStorage, else one request. Rejects on a failed request. */
export async function loadMarket(now = Date.now()): Promise<MarketCard[]> {
  if (memory && now - memory.at <= MARKET_TTL_MS) return memory.items
  const stored = readStored()
  const fresh = freshMarket(stored, now)
  if (fresh) {
    memory = { at: (stored as { at: number }).at, items: fresh }
    return fresh
  }
  const r = await j<{ results?: unknown }>('/marketplace/search', { method: 'POST', body: JSON.stringify(marketBody()) })
  const items = normalizeMarket(r.results)
  if (items.length === 0) return []
  memory = { at: now, items }
  writeStored({ at: now, items })
  return items
}

/** One listing per visit (seeded once), "Another" takes the next one from the same set with no request. `card` is
 *  null while loading, when disabled, on error, or when the Marketplace has nothing: Home then leaves the block out. */
export function useMarketSuggest(enabled: boolean): { card: MarketCard | null; another: () => void } {
  const [items, setItems] = useState<MarketCard[]>([])
  const [seed] = useState(() => Math.random())
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setItems([])
      return
    }
    let live = true
    loadMarket().then(
      (list) => { if (live) setItems(list) },
      () => { if (live) setItems([]) },
    )
    return () => { live = false }
  }, [enabled])
  const i = pickAt(seed, items.length, step)
  return { card: i >= 0 ? items[i] ?? null : null, another: () => setStep((s) => s + 1) }
}

let pendingOpen: MarketCard | null = null

/** Home's "Open in Marketplace" names the listing it shows; the Marketplace view opens that card's page on arrival. */
export function queueMarketOpen(card: MarketCard): void {
  pendingOpen = card
}

/** The queued listing, left in place: React may run a state initializer twice, so it is cleared by an effect. */
export function peekMarketOpen(): MarketCard | null {
  return pendingOpen
}

export function clearMarketOpen(): void {
  pendingOpen = null
}
