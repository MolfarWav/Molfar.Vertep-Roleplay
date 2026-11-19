// Ready maps of the places map (Molfar.Vertep#454): the engine ships map packs (painted plans) at `/v1/map-packs`. A chat's map
// can use one (`placeMap.picture = { builtin: "<pack>/<map id>" }`), the player's own picture (`{ id }`), or none (`{ none: true }`,
// the dotted grid). A chat that has chosen nothing gets a default picked by code from what its places are, so a new map is not bare.
// An engine without packs answers 404: the grid stays.

import { useEffect, useState } from 'react'
import { placeKind } from '@/lib/place-kinds'
import type { WorldRecord } from '@/lib/world'
import { hashId } from '@/lib/place-icons'

export interface MapEntry { id: string; kind: string; w: number; h: number }
export interface MapPack { id: string; name: string; maps: MapEntry[] }

/** `<pack>/<map id>`: the key a chat keeps for a ready map. */
export const BUILTIN_KEY = /^[a-z][a-z0-9-]{0,30}\/[a-z]+(?:-[a-z]+)*-[1-9][0-9]?$/

/** The engine path of a ready map (or its small thumbnail). */
export function mapPackUrl(key: string, thumb = false): string {
  const [pack, id] = key.split('/')
  return `/v1/map-packs/${pack}/${id}${thumb ? '-thumb' : ''}.webp`
}

/** Keep only well-formed packs from the engine's answer. */
export function cleanPacks(raw: unknown): MapPack[] {
  const list = raw && typeof raw === 'object' ? (raw as { packs?: unknown }).packs : null
  if (!Array.isArray(list)) return []
  const out: MapPack[] = []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const { id, name, maps } = p as { id?: unknown; name?: unknown; maps?: unknown }
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,30}$/.test(id) || !Array.isArray(maps)) continue
    const entries: MapEntry[] = []
    for (const m of maps) {
      const e = m as Partial<MapEntry>
      if (typeof e?.id === 'string' && BUILTIN_KEY.test(`${id}/${e.id}`) && typeof e.kind === 'string' && /^[a-z]+(?:-[a-z]+)*$/.test(e.kind)) entries.push({ id: e.id, kind: e.kind, w: Number(e.w) || 0, h: Number(e.h) || 0 })
    }
    if (entries.length) out.push({ id, name: typeof name === 'string' && name ? name.slice(0, 80) : id, maps: entries })
  }
  return out
}

let loading: Promise<MapPack[]> | null = null

/** The engine's packs, asked once per page load; `[]` when the engine has none or cannot be reached. */
export function loadMapPacks(): Promise<MapPack[]> {
  loading ??= fetch('/v1/map-packs')
    .then((r) => (r.ok ? r.json() : null))
    .then(cleanPacks)
    .catch(() => [] as MapPack[])
  return loading
}

/** The packs once they have arrived (null while they are asked, `[]` when there are none). */
export function useMapPacks(): MapPack[] | null {
  const [packs, setPacks] = useState<MapPack[] | null>(null)
  useEffect(() => {
    let live = true
    void loadMapPacks().then((p) => { if (live) setPacks(p) })
    return () => { live = false }
  }, [])
  return packs
}

/** Is this key one of the shipped maps? (An older engine, or a pack that was taken away, says no: the grid shows instead.) */
export const hasMap = (key: string, packs: MapPack[] | null | undefined): boolean => {
  const [pack, id] = key.split('/')
  return !!packs?.some((p) => p.id === pack && p.maps.some((m) => m.id === id))
}

const URBAN = new Set(['tavern', 'inn', 'shop', 'market', 'smithy', 'bakery', 'library', 'school', 'church', 'temple', 'house', 'cottage', 'street', 'road', 'gate', 'castle', 'palace', 'tower', 'town', 'city', 'village', 'garden', 'park', 'bridge', 'port'])
const WILD = new Set(['forest', 'meadow', 'field', 'river', 'lake', 'swamp', 'camp', 'hills', 'mountain', 'snow', 'desert'])
const SEA = new Set(['sea', 'beach', 'port', 'ship', 'lighthouse'])
const UNDER = new Set(['cave', 'mine', 'dungeon', 'cellar', 'ruins', 'crypt'])
const INSIDE = new Set(['room'])
// the modern city's kinds (ids of `placeKind`), and the groups that pick which modern map suits
const MODERN = new Set(['apartment-block', 'skyscraper', 'office', 'suburban-house', 'cafe', 'restaurant', 'supermarket', 'mall', 'hospital', 'pharmacy', 'university', 'police-station', 'fire-station', 'subway', 'bus-stop', 'train-station', 'airport', 'parking', 'gas-station', 'city-street', 'crossroads', 'gym', 'cinema', 'nightclub', 'karaoke', 'arcade', 'hotel', 'bank', 'factory', 'warehouse', 'construction-site', 'stadium', 'museum', 'post-office', 'courthouse', 'power-plant', 'lab', 'harbour-modern'])
const INDUSTRIAL = new Set(['factory', 'warehouse', 'power-plant', 'construction-site', 'lab'])
const RESIDENTIAL = new Set(['suburban-house', 'apartment-block'])
const CAMPUS = new Set(['university', 'stadium', 'museum', 'lab', 'gym'])
const WATERFRONT = new Set(['harbour-modern', 'port'])

/**
 * The kind of ready map that suits a set of place kinds (ids from `placeKind`): rooms make a house plan, caves and cellars a cave
 * system, the sea a coast, many streets and shops a walled town, a few a village, woods and rivers the wilds, else a region.
 */
export function defaultMapKind(kinds: readonly string[]): string {
  const n = (set: Set<string>) => kinds.filter((k) => set.has(k)).length
  // a modern city: the modern kinds are at least three and the bulk of the places
  if (n(MODERN) >= 3 && n(MODERN) * 2 >= kinds.length) {
    if (n(new Set(['airport'])) >= 1) return 'modern-airport'
    if (n(INDUSTRIAL) >= 2) return 'modern-industrial'
    if (n(WATERFRONT) >= 1) return 'modern-waterfront'
    if (n(CAMPUS) >= 2 && kinds.includes('university')) return 'modern-campus'
    if (n(new Set(['skyscraper'])) >= 2 || n(MODERN) >= 10) return 'modern-metropolis'
    if (n(RESIDENTIAL) >= 2 && n(RESIDENTIAL) * 2 >= n(MODERN)) return 'modern-residential'
    if (n(MODERN) >= 6) return 'modern-downtown'
    return 'modern-small-town'
  }
  if (n(INSIDE) >= 3 && n(INSIDE) * 2 >= kinds.length) return 'interior'
  if (n(UNDER) >= 2 && n(UNDER) * 2 >= kinds.length) return 'underground'
  if (n(SEA) >= 2 && n(SEA) * 3 >= kinds.length) return 'coast'
  if (kinds.some((k) => k === 'port') && n(URBAN) >= 3) return 'port-town'
  if (n(URBAN) >= 6) return 'city'
  if (n(URBAN) >= 3) return 'village'
  if (n(WILD) >= 2) return 'wilds'
  return 'region'
}

/** The ready map a chat shows until the player picks something: the suiting kind, the variant fixed by the chat's id. */
export function defaultMapKey(records: readonly WorldRecord[], chatId: string, packs: MapPack[] | null | undefined): string | null {
  if (!packs?.length) return null
  const kinds = records.filter((r) => r.kind === 'place' && r.status === 'active' && !r.inside).map((r) => placeKind(r.name, ...(r.aliases ?? [])).id)
  const want = defaultMapKind(kinds)
  const all = packs.flatMap((p) => p.maps.map((m) => ({ key: `${p.id}/${m.id}`, kind: m.kind })))
  const of = (k: string) => all.filter((m) => m.kind === k)
  const pool = of(want).length ? of(want) : of('region').length ? of('region') : all
  const pick = pool[hashId(chatId) % pool.length]
  return pick ? pick.key : null
}

/** A kind id as words: `port-town` -> `port town`. */
export const mapKindWords = (kind: string): string => kind.replace(/-/g, ' ')
