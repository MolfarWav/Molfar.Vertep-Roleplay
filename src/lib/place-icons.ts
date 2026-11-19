// The painted icons of the places map (Molfar.Vertep#454): the engine ships four variants per kind of place at
// `/v1/place-icons/<kind>-<n>.webp` and lists them at `/v1/place-icons`. The app picks the kind from the place's name
// (`placeKind`) and the variant from the place's id, so two taverns look different and one tavern always looks the same.
// An engine without the set answers 404: every node then keeps its emoji.

import { useEffect, useState } from 'react'

/** Kind id -> how many variants the engine has. Empty = no set (an older engine). */
export type PlaceIconIndex = Record<string, number>

/** A small stable hash (FNV-1a) of a place id. */
export function hashId(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The variant (1..count) a place gets: the same id always gets the same one. */
export function variantOf(id: string, count: number): number {
  return count > 0 ? (hashId(id) % count) + 1 : 0
}

/** The path of the icon a place shows, or null when the set has none for this kind (the emoji stays). */
export function placeIconPath(kindId: string, placeId: string, index: PlaceIconIndex | null | undefined): string | null {
  const count = index?.[kindId]
  if (!count) return null
  return `/v1/place-icons/${kindId}-${variantOf(placeId, count)}.webp`
}

/** Every variant of a kind (for a picker or a test sheet). */
export function placeIconVariants(kindId: string, index: PlaceIconIndex | null | undefined): string[] {
  const count = index?.[kindId] ?? 0
  return Array.from({ length: count }, (_, i) => `/v1/place-icons/${kindId}-${i + 1}.webp`)
}

/** Keep only a well-formed index: kind ids of lowercase words, counts of 1..99. */
export function cleanIconIndex(raw: unknown): PlaceIconIndex {
  const out: PlaceIconIndex = {}
  const icons = raw && typeof raw === 'object' ? (raw as { icons?: unknown }).icons : null
  if (!icons || typeof icons !== 'object') return out
  for (const [kind, n] of Object.entries(icons as Record<string, unknown>)) {
    if (/^[a-z]+(?:-[a-z]+)*$/.test(kind) && typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 99) out[kind] = n
  }
  return out
}

let loading: Promise<PlaceIconIndex> | null = null

/** The engine's list of icons, asked once per page load; `{}` when the engine has none or cannot be reached. */
export function loadPlaceIconIndex(): Promise<PlaceIconIndex> {
  loading ??= fetch('/v1/place-icons')
    .then((r) => (r.ok ? r.json() : null))
    .then(cleanIconIndex)
    .catch(() => ({}) as PlaceIconIndex)
  return loading
}

/** The icon index once it has arrived (null while it is being asked, `{}` when there is none). */
export function usePlaceIconIndex(): PlaceIconIndex | null {
  const [index, setIndex] = useState<PlaceIconIndex | null>(null)
  useEffect(() => {
    let live = true
    void loadPlaceIconIndex().then((i) => { if (live) setIndex(i) })
    return () => { live = false }
  }, [])
  return index
}
