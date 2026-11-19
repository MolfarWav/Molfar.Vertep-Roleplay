// Names from the shared catalog (#373, step 3). The engine reads the catalog (GET /v1/catalog/...); the app asks it for a small random pool
// of names and sends the pool with a DM run or a Start, where the plugin turns it into a nudge in the prompt. Everything here fails soft: an
// engine without the routes, the Store off or no network give no pool and the DM runs as it always did.

export interface CatalogInfo {
  /** The catalog can be read: the routes exist, the Store is on and at least one pack came. */
  available: boolean
  genres: string[]
  cultures: string[]
  /** Entries in the packs, by kind, for the card's "about N" line. */
  kinds: { name: number; place: number; organization: number; item: number }
}

/** The pool as the plugin takes it: lists of plain names. */
export interface NamePool {
  persons: { f: string[]; m: string[]; family: string[] }
  places: string[]
  groups: string[]
  things: string[]
}

export interface NamesChoice {
  namesGenres: string[]
  namesCultures: string[]
}

/** A vocabulary word as people read it: `dark_fantasy` becomes "Dark fantasy". */
export const tagLabel = (tag: string): string => {
  const s = tag.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const PER_LIST = 12
const WAIT_MS = 4000

const UNAVAILABLE: CatalogInfo = { available: false, genres: [], cultures: [], kinds: { name: 0, place: 0, organization: 0, item: 0 } }

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(WAIT_MS) })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

interface CatalogReply {
  enabled?: boolean
  packs?: { kinds?: Record<string, number> }[]
  tags?: { genres?: string[]; cultures?: string[] } | null
}

/** What the catalog offers now: the vocabulary for the chips and the counts. Never throws. */
export async function loadCatalogInfo(): Promise<CatalogInfo> {
  const c = await getJson<CatalogReply>('/v1/catalog')
  if (!c || c.enabled !== true || !Array.isArray(c.packs) || c.packs.length === 0) return UNAVAILABLE
  const sum = (k: string) => c.packs!.reduce((n, p) => n + (p.kinds?.[k] ?? 0), 0)
  return {
    available: true,
    genres: Array.isArray(c.tags?.genres) ? c.tags!.genres!.filter((x): x is string => typeof x === 'string') : [],
    cultures: Array.isArray(c.tags?.cultures) ? c.tags!.cultures!.filter((x): x is string => typeof x === 'string') : [],
    kinds: { name: sum('name'), place: sum('place'), organization: sum('organization'), item: sum('item') },
  }
}

interface SearchReply {
  items?: { name?: unknown }[]
}

/** One random list of entry names. */
async function names(query: Record<string, string>): Promise<string[]> {
  const q = new URLSearchParams({ ...query, random: '1', limit: String(PER_LIST) })
  const r = await getJson<SearchReply>(`/v1/catalog/search?${q}`)
  return (r?.items ?? []).map((e) => (typeof e.name === 'string' ? e.name : '')).filter(Boolean)
}

/** A random pool for the chosen style and cultures; null when nothing came (so nothing is sent). */
export async function fetchNamePool(choice: NamesChoice): Promise<NamePool | null> {
  const style: Record<string, string> = choice.namesGenres.length ? { anyTags: choice.namesGenres.join(',') } : {}
  const culture: Record<string, string> = choice.namesCultures.length ? { culture: choice.namesCultures.join(',') } : {}
  const [f, m, family, places, groups, things] = await Promise.all([
    names({ kind: 'name', part: 'given', gender: 'f', ...culture }),
    names({ kind: 'name', part: 'given', gender: 'm', ...culture }),
    names({ kind: 'name', part: 'family', ...culture }),
    names({ kind: 'place', ...style }),
    names({ kind: 'organization', ...style }),
    names({ kind: 'item', ...style }),
  ])
  const pool: NamePool = { persons: { f, m, family }, places, groups, things }
  return f.length + m.length + family.length + places.length + groups.length + things.length > 0 ? pool : null
}

/** The pool a run of this chat should carry: nothing when the chat's switch is off. */
export async function poolFor(settings: { names?: boolean; namesGenres?: string[]; namesCultures?: string[] } | undefined): Promise<NamePool | null> {
  if (!settings?.names) return null
  return fetchNamePool({ namesGenres: settings.namesGenres ?? [], namesCultures: settings.namesCultures ?? [] })
}
