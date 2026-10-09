// Portraits by name, for every place that shows a story's cast: the Library's character cards,
// the dashboard (strip, wide view, phone sheet) and the Soul tab. The user's own portraits
// (Library M4c, litopys/portraits.json: one image per lower-cased name, for every chat) live in
// one shared store, so a portrait set in one place shows in the others at once.

import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { fetchLitPortraits, type LitPortraits } from '@/components/library/litopys-api'
import { useApp } from '@/lib/store'

/** A later mount reads the file again after this long (another device may have changed it). */
const STALE_MS = 60_000

const usePortraitStore = create<{ own: LitPortraits; loadedAt: number }>()(() => ({ own: {}, loadedAt: 0 }))

let inflight: Promise<void> | null = null
function load(): Promise<void> {
  inflight ??= fetchLitPortraits()
    .then((own) => usePortraitStore.setState({ own, loadedAt: Date.now() }))
    // no Litopys plugin: cards and initials still show
    .catch(() => usePortraitStore.setState({ loadedAt: Date.now() }))
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Takes the whole map the plugin answers after a change. */
export const setOwnPortraits = (own: LitPortraits) => usePortraitStore.setState({ own, loadedAt: Date.now() })

/** The user's own portraits, by lower-cased name; loaded on first use, again when stale. */
export function useOwnPortraits(): LitPortraits {
  const own = usePortraitStore((s) => s.own)
  useEffect(() => {
    if (Date.now() - usePortraitStore.getState().loadedAt > STALE_MS) void load()
  }, [])
  return own
}

/**
 * Lower-cased name → portrait URL. Order, last wins: a persona, any character card, the cards
 * in `prefer` (the chat's card and its group members, so a namesake elsewhere never replaces
 * them), then the user's own portrait. No entry = initials.
 */
export function usePortraitMap(prefer: (string | null | undefined)[] = []): Map<string, string> {
  const own = useOwnPortraits()
  const characters = useApp((s) => s.characters)
  const personas = useApp((s) => s.personas)
  const key = prefer.filter(Boolean).join('|')
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const p of personas) if (p.avatar) map.set(p.name.toLowerCase(), p.avatar)
    for (const c of characters) if (c.avatar) map.set(c.name.toLowerCase(), c.avatar)
    for (const id of key ? key.split('|') : []) {
      const c = characters.find((x) => x.id === id)
      if (c?.avatar) map.set(c.name.toLowerCase(), c.avatar)
    }
    for (const [k, v] of Object.entries(own)) map.set(k, v.url)
    return map
  }, [characters, personas, own, key])
}
