
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ImgHTMLAttributes } from 'react'
import { MagnifyingGlass, Storefront, DownloadSimple, CircleNotch, ArrowSquareOut, Check, Heart, X, CaretLeft, CaretRight, BookOpenText, BookBookmark, User, Tag, Plus, SlidersHorizontal, Fire, UploadSimple, LinkSimple } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useApp } from '@/lib/store'
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
import { DEFAULT_AVATAR, cn } from '@/lib/utils'
import { j, proxyUrl, downscaleRemoteImage } from '@/lib/engine'
import { importCardFiles, importCardFromLink, importAnyCardLink, JANNY_MESSAGE } from '@/lib/card-import'

/** One marketplace listing, normalized by the plugin from whatever the
 *  source returns — `id` is the "user/slug" full path (download URL + dedupe). */
type MarketplaceItem = {
  id: string
  name: string
  creator: string
  tagline: string
  description: string
  topics: string[]
  downloads: number
  favorites: number
  tokens: number
  rating: number
  ratingCount: number
  chats: number
  messages: number
  nsfw: boolean
  avatar: string | null
  maxRes: string | null
  createdAt: string | null
  /** set by the plugin for the non-chub sources */
  source?: string
  hasLore?: boolean
  pageUrl?: string
  /** Wyvern: lorebooks the card links on the site (they do not come with the import) */
  linkedBooks?: number
  /** JannyAI: the card can only be downloaded in the browser */
  browserOnly?: boolean
}
type SearchResponse = { source: string; count: number; page: number; first: number; hasMore?: boolean; results: MarketplaceItem[] }
/** Full card definition, fetched when a listing is opened for preview. */
type MarketplaceDetail = {
  id: string
  greeting: string
  alternateGreetings: string[]
  personality: string
  scenario: string
  exampleDialogs: string
  creatorNotes: string
  systemPrompt: string
  postHistoryInstructions: string
  /** -1: has a lorebook, the count is unknown (RisuRealm) */
  lorebookEntries: number
  /** RisuRealm: only the author's description; the card comes with the download */
  partial?: boolean
}

/** Orderings the catalog accepts. Download order is also its default, and a
 *  search term narrows the pool before any ordering applies, so there is no
 *  separate relevance mode. "Trending" is deliberately absent: it is not an
 *  ordering but a different, much smaller pool, so it gets its own switch. */
const SORTS = ['downloads', 'rating', 'newest', 'updated', 'tokens', 'name', 'random'] as const
type SortKey = (typeof SORTS)[number]
/** Sources of the Store. The first three are catalogs the engine plugin reads;
 *  JannyAI blocks apps, so it is a drop zone for files the user downloads in
 *  the browser. `label` is the switcher text, `name` the short name on a card. */
const SOURCES = [
  { value: 'chub', label: 'Chub', name: 'Chub' },
  { value: 'risurealm', label: 'RisuRealm', name: 'RisuRealm' },
  { value: 'charavault', label: 'CharaVault (archive)', name: 'CharaVault' },
  { value: 'wyvern', label: 'Wyvern', name: 'Wyvern' },
  { value: 'pygmalion', label: 'Pygmalion', name: 'Pygmalion' },
  { value: 'janny', label: 'JannyAI', name: 'JannyAI' },
] as const
type SourceId = (typeof SOURCES)[number]['value']
const sourceName = (id: string | undefined): string => SOURCES.find((s) => s.value === id)?.name ?? ''
/** Sources with their own adult switch (chub uses its Filters panel). */
type AdultSource = 'risurealm' | 'charavault' | 'janny'
const isAdultSource = (s: SourceId): s is AdultSource => s === 'risurealm' || s === 'charavault' || s === 'janny'
/** Sources with the tag picker. */
const hasTags = (s: SourceId): boolean => s === 'chub' || s === 'charavault' || s === 'wyvern' || s === 'janny'
const NOTES: Partial<Record<SourceId, string>> = {
  charavault: 'CharaVault is an archive of cards collected from other sites (chub, JannyAI, RisuAI and more). Check the original author before you share a card.',
  risurealm: 'RisuRealm has no public search API; the app reads its search page, which may change.',
  wyvern: 'Wyvern shows SFW cards only without an account. Lorebooks linked on Wyvern do not come with the import.',
  pygmalion: 'Pygmalion shows SFW cards only without an account.',
  janny: 'JannyAI cards can only be downloaded in the browser: press "Get on JannyAI", download the PNG there, then drop it on the bar below.',
}
const WYVERN_SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' }, { value: 'recommended', label: 'Recommended' }, { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Most liked' }, { value: 'chats', label: 'Most chats' },
] as const
const PYG_SORT_OPTIONS = [
  { value: 'downloads', label: 'Most downloaded' }, { value: 'rating', label: 'Most stars' }, { value: 'views', label: 'Most viewed' },
  { value: 'newest', label: 'Newest' }, { value: 'name', label: 'Name' },
] as const
const JANNY_SORT_OPTIONS = [
  { value: 'default', label: 'Relevance / newest' }, { value: 'oldest', label: 'Oldest' },
  { value: 'tokens', label: 'Most tokens' }, { value: 'tokens_asc', label: 'Fewest tokens' },
] as const
/** JannyAI's tag names; the index stores ids, so the picker offers this list. */
const JANNY_TAGS = ['Male', 'Female', 'Non-binary', 'Celebrity', 'OC', 'Fictional', 'Real', 'Game', 'Anime', 'Historical', 'Royalty', 'Detective', 'Hero', 'Villain', 'Magical', 'Non-human', 'Monster', 'Monster Girl', 'Alien', 'Robot', 'Politics', 'Vampire', 'Giant', 'OpenAI', 'Elf', 'Multiple', 'VTuber', 'Dominant', 'Submissive', 'Scenario', 'Pokemon', 'Assistant', 'Non-English', 'Philosophy', 'RPG', 'Religion', 'Books', 'AnyPOV', 'Angst', 'Demi-Human', 'Enemies to Lovers', 'Smut', 'MLM', 'WLW', 'Action', 'Romance', 'Horror', 'Slice of Life', 'Fantasy', 'Drama', 'Comedy', 'Mystery', 'Sci-Fi', 'Yandere', 'Furry', 'Movies/TV']
const JANNY_VOCAB = JANNY_TAGS.map((tag) => ({ tag, n: 0 }))
/** The "download it in the browser" hint is shown once per session. */
let jannyHintShown = false
/** RisuRealm and CharaVault orderings (the plugin maps them to the site's own). */
const RISU_SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' }, { value: 'trending', label: 'Trending' },
  { value: 'newest', label: 'Newest' }, { value: 'random', label: 'Random' }, { value: 'downloads', label: 'Most downloaded' },
] as const
const CV_SORT_OPTIONS = [
  { value: 'downloads', label: 'Most downloaded' }, { value: 'rating', label: 'Top rated' },
  { value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' },
  { value: 'name', label: 'A–Z' }, { value: 'name_desc', label: 'Z–A' }, { value: 'creator', label: 'Creator A–Z' },
  { value: 'tokens', label: 'Longest cards' }, { value: 'tokens_asc', label: 'Shortest cards' }, { value: 'comments', label: 'Most commented' },
] as const
/** Where an archived CharaVault card came from; the value is what the plugin sends. */
const CV_ORIGINS = [
  { value: 'chub', label: 'Chub' }, { value: 'risuai', label: 'RisuAI' }, { value: 'janny', label: 'JannyAI' },
  { value: 'sakura', label: 'Sakura' }, { value: 'crushx', label: 'CrushX' }, { value: 'easygirl', label: 'EasyGirl' },
  { value: 'nyai', label: 'NyAI' }, { value: 'nsfwaichat', label: 'NSFWAIChat' },
  { value: 'Character Archive', label: 'Character Archive' }, { value: 'CharaVault', label: 'CharaVault' },
] as const
/** Sources with their own tags, creator and Filters panel. */
type FilterSource = 'chub' | 'charavault' | 'janny'
const isFilterSource = (s: SourceId): s is FilterSource => s === 'chub' || s === 'charavault' || s === 'janny'
/** A search answer is reused this long within the session. */
const CACHE_MS = 5 * 60_000
const searchCache = new Map<string, { at: number; r: SearchResponse }>()
const PAGE_SIZE = 24
const MAX_TAGS = 6

/** The catalog's own narrowing parameters. `maturity` covers adult listings:
 *  "safe" drops them, "include" is the catalog's full pool, "only" keeps just
 *  those. Numbers stay strings while typed so a half-entered value doesn't
 *  fire a search. */
type Filters = {
  maturity: 'safe' | 'include' | 'only'
  nsfl: boolean
  includeForks: boolean
  minTokens: string
  maxTokens: string
  maxDaysAgo: string
  minAiRating: string
  minTags: string
  excludeTags: string[]
  /** JannyAI: also list cards its own quality check hides */
  lowQuality: boolean
  requireExamples: boolean
  requireLore: boolean
  requireLoreEmbedded: boolean
  requireLoreLinked: boolean
  requireGreetings: boolean
  requireCustomPrompt: boolean
  requireImages: boolean
  requireExpressions: boolean
}

// Adult cards are hidden by default; the user opts into including them.
const NO_FILTERS: Filters = {
  maturity: 'safe', nsfl: false, includeForks: true,
  minTokens: '', maxTokens: '', maxDaysAgo: '', minAiRating: '', minTags: '',
  excludeTags: [], lowQuality: false,
  requireExamples: false, requireLore: false, requireLoreEmbedded: false, requireLoreLinked: false,
  requireGreetings: false, requireCustomPrompt: false, requireImages: false, requireExpressions: false,
}

/** Marketplace filters persist per-browser so a tuned search survives a
 *  reload. The first visit starts on the defaults (adult cards hidden); the
 *  user's own choices win from then on. */
const FILTERS_KEYS: Record<FilterSource, string> = { chub: 'chrysalis.marketplace.filters', charavault: 'chrysalis.marketplace.filters.charavault', janny: 'chrysalis.marketplace.filters.janny' }

function loadFilters(src: FilterSource): Filters {
  try {
    const raw = localStorage.getItem(FILTERS_KEYS[src])
    if (!raw) return NO_FILTERS
    const p = JSON.parse(raw) as Partial<Filters>
    return {
      ...NO_FILTERS,
      ...p,
      maturity: p.maturity === 'safe' || p.maturity === 'include' || p.maturity === 'only' ? p.maturity : NO_FILTERS.maturity,
      excludeTags: Array.isArray(p.excludeTags) ? p.excludeTags.filter((t): t is string => typeof t === 'string') : [],
    }
  } catch {
    return NO_FILTERS
  }
}

/** The browse position: what was searched, which page it landed on, and how
 *  far down the reader had got. Kept per tab so a reload — the engine
 *  restarting, a phone dropping a backgrounded page — comes back to the same
 *  place instead of the top of page one. Filters live in their own key
 *  because they are a preference, not a position. */
const BROWSE_KEY = 'chrysalis.marketplace.browse'

/** What one source remembers: its query, page and (chub only) the ordering
 *  and tag controls. `sort` is a chub SortKey, or for RisuRealm
 *  'recommended' | 'downloads'. */
interface SourceState {
  query: string
  applied: string
  sort: string
  trending: boolean
  tags: string[]
  tagsMode: 'all' | 'any'
  creator: string | null
  /** CharaVault: where the archived card came from, '' = anywhere */
  origin: string
  page: number
}

/** The record keeps one SourceState per source, so switching away and back
 *  returns to where that source was. Records written before sources existed
 *  were flat (chub only): they load as the chub state. */
interface Browse {
  source: SourceId
  per: Record<SourceId, SourceState>
  scrollTop: number
}

const NO_SOURCE: SourceState = {
  query: '', applied: '', sort: 'downloads', trending: false,
  tags: [], tagsMode: 'all', creator: null, origin: '', page: 1,
}
const DEFAULT_SORT: Record<SourceId, string> = { chub: 'downloads', risurealm: 'recommended', charavault: 'downloads', wyvern: 'popular', pygmalion: 'downloads', janny: 'default' }
const initialSourceState = (id: SourceId): SourceState => ({ ...NO_SOURCE, sort: DEFAULT_SORT[id] })
const NO_BROWSE: Browse = {
  source: 'chub', scrollTop: 0,
  per: Object.fromEntries(SOURCES.map((x) => [x.value, initialSourceState(x.value)])) as Record<SourceId, SourceState>,
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function loadSourceState(id: SourceId, raw: unknown): SourceState {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<SourceState>
  const sorts: readonly string[] = id === 'risurealm' ? RISU_SORT_OPTIONS.map((o) => o.value) : id === 'charavault' ? CV_SORT_OPTIONS.map((o) => o.value)
    : id === 'wyvern' ? WYVERN_SORT_OPTIONS.map((o) => o.value) : id === 'pygmalion' ? PYG_SORT_OPTIONS.map((o) => o.value)
    : id === 'janny' ? JANNY_SORT_OPTIONS.map((o) => o.value) : SORTS
  return {
    query: str(p.query),
    applied: str(p.applied),
    sort: typeof p.sort === 'string' && sorts.includes(p.sort) ? p.sort : initialSourceState(id).sort,
    trending: id === 'chub' && p.trending === true,
    tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === 'string').slice(0, MAX_TAGS) : [],
    tagsMode: p.tagsMode === 'any' ? 'any' : 'all',
    creator: typeof p.creator === 'string' ? p.creator : null,
    origin: id === 'charavault' && CV_ORIGINS.some((o) => o.value === p.origin) ? String(p.origin) : '',
    page: typeof p.page === 'number' && p.page >= 1 ? Math.floor(p.page) : 1,
  }
}

function loadBrowse(): Browse {
  try {
    const raw = sessionStorage.getItem(BROWSE_KEY)
    if (!raw) return NO_BROWSE
    const p = JSON.parse(raw) as Record<string, unknown>
    const stored = p.per && typeof p.per === 'object' ? (p.per as Record<string, unknown>) : { chub: p } // flat record: chub
    const per = Object.fromEntries(SOURCES.map((s) => [s.value, loadSourceState(s.value, stored[s.value])])) as Record<SourceId, SourceState>
    return {
      source: SOURCES.some((s) => s.value === p.source) ? (p.source as SourceId) : p.source === 'jannyai' ? 'janny' : NO_BROWSE.source,
      per,
      scrollTop: typeof p.scrollTop === 'number' && p.scrollTop >= 0 ? p.scrollTop : 0,
    }
  } catch {
    return NO_BROWSE
  }
}

/** "Show adult cards" for RisuRealm and CharaVault, remembered per source.
 *  Off by default. Chub keeps its own maturity filter. */
const ADULT_KEY = 'chrysalis.marketplace.adult'
function loadAdult(): Record<AdultSource, boolean> {
  try {
    const p = JSON.parse(localStorage.getItem(ADULT_KEY) ?? '{}') as Partial<Record<AdultSource, unknown>>
    return { risurealm: p.risurealm === true, charavault: p.charavault === true, janny: p.janny === true }
  } catch {
    return { risurealm: false, charavault: false, janny: false }
  }
}

/** "Must have" switches, in the order they read best in the panel. */
const REQUIREMENTS: { key: keyof Filters; label: string }[] = [
  { key: 'requireExamples', label: 'Example dialogue' },
  { key: 'requireGreetings', label: 'Alternate greetings' },
  { key: 'requireLore', label: 'A lorebook' },
  { key: 'requireLoreEmbedded', label: 'An embedded lorebook' },
  { key: 'requireLoreLinked', label: 'A linked lorebook' },
  { key: 'requireCustomPrompt', label: 'A custom system prompt' },
  { key: 'requireImages', label: 'Gallery images' },
  { key: 'requireExpressions', label: 'Expression sprites' },
]

/** CharaVault takes only these from the panel (adult has its own switch). */
const CV_FILTER_KEYS = ['minTokens', 'maxTokens'] as const

const countFilters = (f: Filters, src: FilterSource = 'chub'): number =>
  src !== 'chub'
    ? CV_FILTER_KEYS.filter((k) => f[k].trim()).length + (f.excludeTags.length ? 1 : 0) + (f.requireLore ? 1 : 0)
    : (f.maturity === 'include' ? 0 : 1) + (f.nsfl ? 1 : 0) + (f.includeForks ? 0 : 1)
  + [f.minTokens, f.maxTokens, f.maxDaysAgo, f.minAiRating, f.minTags].filter((v) => v.trim()).length
  + (f.excludeTags.length ? 1 : 0)
  + REQUIREMENTS.filter((r) => f[r.key] === true).length

/** Filters → the plugin's search body. Blank numbers are left out entirely so
 *  the catalog never sees a zero bound. */
function filterBody(f: Filters, src: FilterSource = 'chub'): Record<string, unknown> {
  const n = (v: string) => { const x = Number(v.trim()); return v.trim() && Number.isFinite(x) && x > 0 ? Math.floor(x) : undefined }
  if (src !== 'chub') {
    const cv: Record<string, unknown> = {}
    for (const k of CV_FILTER_KEYS) { const x = n(f[k]); if (x !== undefined) cv[k] = x }
    if (f.excludeTags.length) cv.excludeTags = f.excludeTags
    if (src === 'charavault' && f.requireLore) cv.requireLore = true
    if (src === 'janny') cv.lowQuality = f.lowQuality
    return cv
  }
  const body: Record<string, unknown> = {
    nsfw: f.maturity !== 'safe',
    nsfwOnly: f.maturity === 'only',
    nsfl: f.nsfl,
    includeForks: f.includeForks,
  }
  const nums = { minTokens: f.minTokens, maxTokens: f.maxTokens, maxDaysAgo: f.maxDaysAgo, minAiRating: f.minAiRating, minTags: f.minTags }
  for (const [k, v] of Object.entries(nums)) { const x = n(v); if (x !== undefined) body[k] = x }
  if (f.excludeTags.length) body.excludeTags = f.excludeTags
  for (const r of REQUIREMENTS) if (f[r.key] === true) body[r.key] = true
  return body
}

/** The scroll area keeps its own scrolling element under the root. */
const viewportOf = (root: HTMLElement | null): HTMLElement | null =>
  root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null

const fmtCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n))

/** <img> for proxied remote art. The proxy route carries the session, which
 *  the sandboxed page does not have, so the bytes come through the bridge
 *  fetch (the frame's window.fetch is shimmed) as an object URL. Pointing
 *  <img src> straight at the proxy races the bridge rewriter: the browser
 *  fires a cookieless 401 first and Firefox reports a blocked response. */
function ProxyImage({ url, ...rest }: { url: string | null } & ImgHTMLAttributes<HTMLImageElement>) {
  const [src, setSrc] = useState(DEFAULT_AVATAR)
  useEffect(() => {
    if (!url) { setSrc(DEFAULT_AVATAR); return }
    let dead = false
    let made: string | null = null
    fetch(proxyUrl(url))
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob() })
      .then((b) => { if (dead) return; made = URL.createObjectURL(b); setSrc(made) })
      .catch(() => { if (!dead) setSrc(DEFAULT_AVATAR) })
    return () => { dead = true; if (made) URL.revokeObjectURL(made) }
  }, [url])
  return <img src={src} {...rest} />
}

export function MarketplaceView() {
  const hydrate = useApp((s) => s.hydrate)
  const setView = useApp((s) => s.setView)
  const openCharacter = useApp((s) => s.openCharacter)
  const characters = useApp((s) => s.characters)
  // name-keyed local library lookup for the "you may already have this" hint
  const libraryNames = useMemo(() => new Set(characters.map((c) => c.name.trim().toLowerCase())), [characters])

  // The tab comes back where it left off — see BROWSE_KEY. Read once, on
  // mount: re-reading it per render would fight the live state.
  const [restored] = useState(loadBrowse)
  const [source, setSourceRaw] = useState<SourceId>(restored.source)
  /** One record per source; `cur` is the active one. */
  const [per, setPer] = useState(restored.per)
  const cur = per[source]
  const { query, applied, sort, trending, tags, tagsMode, creator, origin, page } = cur
  const patch = useCallback((p: Partial<SourceState>) => setPer((all) => ({ ...all, [source]: { ...all[source], ...p } })), [source])
  const setQuery = (q: string) => patch({ query: q })
  const setPage = (n: number) => patch({ page: n })
  const setTags = (t: string[]) => patch({ tags: t })
  const setTagsMode = (m: 'all' | 'any') => patch({ tagsMode: m })
  const setCreator = (c: string | null) => patch({ creator: c })
  const [tagsOpen, setTagsOpen] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  /** Tag vocabulary bootstrapped from the results the user has actually seen
   *  (chub has no tag-list endpoint) — ranked by how often they appeared. */
  const [vocabs, setVocabs] = useState<Record<SourceId, { tag: string; n: number }[]>>({ chub: [], risurealm: [], charavault: [], wyvern: [], pygmalion: [], janny: JANNY_VOCAB })
  /** Filters are kept per source: chub's never leak into CharaVault. */
  const [allFilters, setAllFilters] = useState<Record<FilterSource, Filters>>(() => ({ chub: loadFilters('chub'), charavault: loadFilters('charavault'), janny: loadFilters('janny') }))
  const filterSrc: FilterSource = isFilterSource(source) ? source : 'chub'
  const filters = allFilters[filterSrc]
  const tagVocab = vocabs[source]
  const setFilters = (f: Filters) => setAllFilters((a) => ({ ...a, [filterSrc]: f }))
  const [filtersOpen, setFiltersOpen] = useState(false)
  // committed filters (Apply) stick around for the next visit
  useEffect(() => {
    for (const src of ['chub', 'charavault', 'janny'] as const) {
      try { localStorage.setItem(FILTERS_KEYS[src], JSON.stringify(allFilters[src])) } catch { /* storage unavailable */ }
    }
  }, [allFilters])
  const [adult, setAdult] = useState(loadAdult)
  useEffect(() => {
    try { localStorage.setItem(ADULT_KEY, JSON.stringify(adult)) } catch { /* storage unavailable */ }
  }, [adult])
  const showAdult = isAdultSource(source) ? adult[source] : false
  const [items, setItems] = useState<MarketplaceItem[]>([])
  const [count, setCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<MarketplaceItem | null>(null)
  const [detailData, setDetailData] = useState<MarketplaceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [greetingIdx, setGreetingIdx] = useState(0)
  const [downloading, setDownloading] = useState<Record<string, boolean>>({})
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set())
  const reqId = useRef(0)
  // the paste-a-link row in the header
  const [linkValue, setLinkValue] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkJanny, setLinkJanny] = useState<string | null>(null)

  /** Ids only mean something inside their source. */
  const keyOf = (item: MarketplaceItem) => `${item.source ?? source}:${item.id}`

  const setSource = (v: SourceId) => {
    if (v === source) return
    reqId.current++
    setItems([])
    setError(null)
    setLoading(true)
    setSourceRaw(v)
  }

  // ── browse position ──
  // Scrolling does not re-render, so the offset rides its own ref and the
  // record is written whenever either half moves. `pagehide` covers the
  // reload itself; the throttled scroll write covers a page the browser
  // drops without warning.
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(restored.scrollTop)
  const browseRef = useRef<Omit<Browse, 'scrollTop'>>(restored)
  browseRef.current = { source, per }
  const saveBrowse = useCallback(() => {
    try {
      sessionStorage.setItem(BROWSE_KEY, JSON.stringify({ ...browseRef.current, scrollTop: scrollTopRef.current }))
    } catch { /* storage unavailable */ }
  }, [])
  useEffect(saveBrowse, [saveBrowse, source, per])
  useEffect(() => {
    const el = viewportOf(scrollRootRef.current)
    if (!el) return
    let due = 0
    const onScroll = () => {
      scrollTopRef.current = el.scrollTop
      if (due) return
      due = window.setTimeout(() => { due = 0; saveBrowse() }, 500)
    }
    const onLeave = () => saveBrowse()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', onLeave)
    return () => {
      clearTimeout(due)
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', onLeave)
      saveBrowse()
    }
  }, [saveBrowse])
  // Land back on the same row once the results that row belongs to are in.
  const placeRestored = useRef(false)
  useLayoutEffect(() => {
    if (placeRestored.current || loading || items.length === 0) return
    placeRestored.current = true
    const el = viewportOf(scrollRootRef.current)
    if (el && restored.scrollTop > 0) el.scrollTop = restored.scrollTop
  }, [loading, items, restored.scrollTop])

  // server-side search — the engine plugin fetches the source (no CORS,
  // browser UA, allowlisted hosts). JannyAI has no search: it is a drop zone.
  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    const body = source === 'chub'
      ? { source, search: applied, sort, trending, page, first: PAGE_SIZE, tags, tagsMode, ...filterBody(filters), ...(creator ? { creator } : {}) }
      : source === 'charavault'
        ? { source, search: applied, sort, page, first: PAGE_SIZE, nsfw: showAdult, tags, ...(origin ? { origin } : {}), ...filterBody(filters, 'charavault'), ...(creator ? { creator } : {}) }
        : source === 'wyvern'
          ? { source, search: applied, sort, page, first: PAGE_SIZE, tags }
          : source === 'pygmalion'
            ? { source, search: applied, sort, page, first: PAGE_SIZE }
            : source === 'janny'
              ? { source, search: applied, page, first: PAGE_SIZE, nsfw: showAdult, tags, ...(sort !== 'default' ? { sort } : {}), ...filterBody(filters, 'janny') }
              : { source, search: applied, page, first: PAGE_SIZE, nsfw: showAdult, ...(sort !== 'recommended' ? { sort } : {}) }
    const cacheKey = JSON.stringify(body)
    const apply = (r: SearchResponse) => {
      setItems(r.results)
      setCount(r.count)
      setHasMore(r.hasMore ?? page * (r.first || PAGE_SIZE) < r.count)
      setPageSize(r.first || PAGE_SIZE)
      if (source === 'risurealm' || source === 'pygmalion' || source === 'janny') return
      setVocabs((all) => {
        const by = new Map(all[source].map((v) => [v.tag, v.n]))
        for (const it of r.results) for (const t of it.topics) by.set(t, (by.get(t) ?? 0) + 1)
        const next = [...by.entries()]
          .map(([tag, n]) => ({ tag, n }))
          .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag))
          .slice(0, 400)
        return { ...all, [source]: next }
      })
    }
    const hit = searchCache.get(cacheKey)
    if (hit && Date.now() - hit.at < CACHE_MS) {
      apply(hit.r)
      setLoading(false)
      return
    }
    j<SearchResponse>('/marketplace/search', { method: 'POST', body: JSON.stringify(body) })
      .then((r) => {
        if (id !== reqId.current) return // stale response (params changed mid-flight)
        searchCache.set(cacheKey, { at: Date.now(), r })
        apply(r)
      })
      .catch((e) => {
        if (id !== reqId.current) return
        setItems([])
        setCount(0)
        setHasMore(false)
        setError(String((e as Error).message ?? e))
      })
      .finally(() => { if (id === reqId.current) setLoading(false) })
  }, [source, applied, sort, trending, page, tags, tagsMode, creator, origin, filters, showAdult])

  // full card definition loads when a listing is opened for preview
  useEffect(() => {
    if (!detail) return
    // JannyAI: the listing is all there is (its site is not reachable from the app)
    if ((detail.source ?? source) === 'janny') { setDetailData(null); setDetailError(null); setDetailLoading(false); return }
    setDetailData(null)
    setDetailError(null)
    setGreetingIdx(0)
    setDetailLoading(true)
    j<MarketplaceDetail>('/marketplace/detail', {
      method: 'POST',
      body: JSON.stringify({ source: detail.source ?? source, id: detail.id }),
    })
      .then(setDetailData)
      .catch((e) => setDetailError(String((e as Error).message ?? e)))
      .finally(() => setDetailLoading(false))
  }, [detail, source])

  // chub and CharaVault tell the total; RisuRealm only whether a next page exists
  const hasTotal = source !== 'risurealm'
  const pages = Math.max(1, Math.ceil(count / pageSize))
  const canNext = source === 'chub' ? page < pages : hasMore

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    patch({ page: 1, applied: query.trim() })
  }

  /** Toggle a tag filter — from the picker, a topic chip, or a typed custom
   *  tag. Capped, back to page 1. */
  const toggleTag = (t: string) => {
    const clean = t.trim().slice(0, 60)
    if (!clean) return
    patch({ tags: tags.includes(clean) ? tags.filter((x) => x !== clean) : tags.length >= MAX_TAGS ? tags : [...tags, clean], page: 1 })
  }

  /** One success path for every source: the toast offers to open the card. */
  const openNew = (id: string | undefined) => {
    if (id) openCharacter(id)
    setDetail(null)
    setView('characters')
  }
  const added = (name: string, id: string | undefined, skippedBooks = 0) =>
    toast.success(`${name} added to Characters`, {
      action: { label: 'Open', onClick: () => openNew(id) },
      ...(skippedBooks > 0 ? { description: `${skippedBooks} linked lorebook${skippedBooks === 1 ? ' was' : 's were'} not imported.` } : {}),
    })

  /** JannyAI cards open on the site; the note says what to do next, once. */
  const getOnJanny = () => {
    if (jannyHintShown) return
    jannyHintShown = true
    toast('Download the card there, then drop the PNG here.')
  }

  /** Install a card. Chub goes through the proven URL-import path — the engine
   *  pulls the card PNG + avatar and writes a local character. The other
   *  sources download the file through the plugin and import it like a
   *  dropped file. */
  const download = async (item: MarketplaceItem) => {
    const key = keyOf(item)
    if (downloading[key] || downloaded.has(key)) return
    setDownloading((d) => ({ ...d, [key]: true }))
    try {
      let name = item.name
      let id: string | undefined
      let skipped = 0
      if ((item.source ?? source) === 'chub') {
        // full-res card image, downscaled to a sane avatar size; fall back to
        // the listing thumbnail if the full-res fetch fails
        let avatar: string | undefined
        if (item.maxRes) {
          try { avatar = await downscaleRemoteImage(item.maxRes) } catch { /* keep the thumbnail */ }
        }
        const r = await j<{ characters: string[]; name?: string }>('/import/url', {
          method: 'POST',
          body: JSON.stringify({ url: `https://chub.ai/characters/${item.id}`, ...(avatar ? { avatar } : {}) }),
        })
        name = r.name ?? name
        id = r.characters?.[0]
        await hydrate()
      } else {
        if (!item.pageUrl) throw new Error('This listing has no download link.')
        const r = await importCardFromLink(item.pageUrl, hydrate)
        name = r.names[0] ?? name
        id = r.characters[0]
        skipped = r.skippedBooks ?? 0
      }
      setDownloaded((s) => new Set(s).add(key))
      added(name, id, skipped)
    } catch (e) {
      toast.error(`Couldn't download ${item.name}`, { description: String((e as Error).message ?? e) })
    } finally {
      setDownloading((d) => { const n = { ...d }; delete n[key]; return n })
    }
  }

  /** The paste-a-link row: JannyAI/JanitorAI pages are never fetched. */
  const importLink = async (e?: FormEvent) => {
    e?.preventDefault()
    const url = linkValue.trim()
    if (!url || linkBusy) return
    setLinkError(null)
    setLinkJanny(null)
    setLinkBusy(true)
    try {
      const r = await importAnyCardLink(url, hydrate)
      if (r.status === 'browser-only') {
        setLinkJanny(r.openUrl)
      } else {
        added(r.names[0] ?? 'Character', r.characters[0], r.skippedBooks ?? 0)
        setLinkValue('')
      }
    } catch (err) {
      setLinkError(String((err as Error).message ?? err))
    } finally {
      setLinkBusy(false)
    }
  }

  const greetings = detailData ? [detailData.greeting, ...detailData.alternateGreetings].filter((g) => g.trim()) : []
  const detailSource = (detail?.source ?? source) as SourceId

  const isChub = source === 'chub'
  const countLabel = !loading && !error && hasTotal ? fmtCount(count) : undefined
  const detailOpenUrl = detail ? (detailSource === 'chub' ? `https://chub.ai/characters/${detail.id}` : detail.pageUrl) : undefined

  return (
    <SectionPage section="marketplace" count={countLabel}>
    <div className="flex h-full min-h-0 flex-col overflow-x-clip">
      {/* header (search + filters) scrolls WITH the results (mobile keyboard room) */}
      <ScrollArea ref={scrollRootRef} className="min-h-0 flex-1">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <PaneTitle section="marketplace" count={countLabel} />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
            {isAdultSource(source) && (
              <label className="flex h-8 items-center gap-1.5 text-xs">
                <Switch
                  size="sm"
                  checked={showAdult}
                  onCheckedChange={(v) => { setAdult((a) => ({ ...a, [source]: v === true })); setPage(1) }}
                  aria-label="Show adult cards"
                />
                Show adult cards
              </label>
            )}
            {source === 'risurealm' && (
              <Select value={sort} onValueChange={(v) => patch({ sort: String(v), page: 1 })}>
                <SelectTrigger className="h-8 w-36 text-xs" aria-label="Sort RisuRealm results">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISU_SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {source === 'charavault' && (
              <>
                <Select value={origin || 'all'} onValueChange={(v) => patch({ origin: v == null || v === 'all' ? '' : String(v), page: 1 })}>
                  <SelectTrigger className="h-8 w-36 text-xs" aria-label="Where the archived card came from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Origin: all</SelectItem>
                    {CV_ORIGINS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={(v) => patch({ sort: String(v), page: 1 })}>
                  <SelectTrigger className="h-8 w-36 text-xs" aria-label="Sort CharaVault results">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CV_SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
            {source === 'wyvern' && (
              <Select value={sort} onValueChange={(v) => patch({ sort: String(v), page: 1 })}>
                <SelectTrigger className="h-8 w-36 text-xs" aria-label="Sort Wyvern results">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WYVERN_SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {source === 'pygmalion' && (
              <Select value={sort} onValueChange={(v) => patch({ sort: String(v), page: 1 })}>
                <SelectTrigger className="h-8 w-36 text-xs" aria-label="Sort Pygmalion results">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PYG_SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {source === 'janny' && (
              <>
                <label className="flex h-8 items-center gap-1.5 text-xs">
                  <Switch
                    size="sm"
                    checked={filters.lowQuality}
                    onCheckedChange={(v) => { setFilters({ ...filters, lowQuality: v === true }); setPage(1) }}
                    aria-label="Show low quality cards"
                  />
                  Show low quality
                </label>
                <Select value={sort} onValueChange={(v) => patch({ sort: String(v), page: 1 })}>
                  <SelectTrigger className="h-8 w-40 text-xs" aria-label="Sort JannyAI results">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JANNY_SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
            {isChub && (
              <>
                <Button
                  variant={trending ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  aria-pressed={trending}
                  title="The catalog's hot list, a few thousand cards rather than all of them"
                  onClick={() => patch({ trending: !trending, page: 1 })}
                >
                  <Fire className="size-3.5" aria-hidden="true" />
                  Trending
                </Button>
                <Select value={sort} onValueChange={(v) => patch({ sort: String(v), page: 1 })} disabled={trending}>
                  <SelectTrigger className="h-8 w-32 text-xs" aria-label="Sort marketplace results">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="downloads">Most downloaded</SelectItem>
                    <SelectItem value="rating">Top rated</SelectItem>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="updated">Recently updated</SelectItem>
                    <SelectItem value="tokens">Longest cards</SelectItem>
                    <SelectItem value="name">A–Z</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            <Select value={source} onValueChange={(v) => setSource(v as SourceId)}>
              <SelectTrigger className="h-8 w-44 text-xs" aria-label="Marketplace source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <form onSubmit={submit} className="relative min-w-0 flex-1">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.form?.requestSubmit() }}
              placeholder="Search characters…"
              className="h-9 pl-9 pr-9 text-sm"
              aria-label="Search marketplace"
            />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 size-7 -translate-y-1/2 p-0 text-muted-foreground"
              aria-label="Search"
            >
              <MagnifyingGlass className="size-4" aria-hidden="true" />
            </Button>
          </form>
          {hasTags(source) && (
            <TagsPicker
              tags={tags}
              tagsMode={tagsMode}
              vocab={tagVocab}
              query={tagQuery}
              onQuery={setTagQuery}
              open={tagsOpen}
              onOpen={setTagsOpen}
              onToggle={toggleTag}
              onMode={() => patch({ tagsMode: tagsMode === 'all' ? 'any' : 'all', page: 1 })}
              modes={isChub}
              fixedVocab={source === 'janny'}
            />
          )}
          {isFilterSource(source) && (
            <FiltersPanel
              src={source}
              filters={filters}
              open={filtersOpen}
              onOpen={setFiltersOpen}
              onApply={(f) => { setFilters(f); setPage(1); setFiltersOpen(false) }}
            />
          )}
        </div>
        {hasTags(source) && (tags.length > 0 || creator) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {creator && (
              <button
                type="button"
                onClick={() => patch({ creator: null, page: 1 })}
                className="flex items-center gap-1 rounded-full border border-primary/40 bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground transition-colors hover:border-primary"
                aria-label={`Stop browsing ${creator}`}
              >
                <User className="size-3" aria-hidden="true" />
                {creator}
                <X className="size-3" aria-hidden="true" />
              </button>
            )}
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => patch({ tags: tags.filter((x) => x !== t), page: 1 })}
                className="flex items-center gap-1 rounded-full border border-primary/40 bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground transition-colors hover:border-primary"
                aria-label={`Remove tag filter ${t}`}
              >
                {t}
                <X className="size-3" aria-hidden="true" />
              </button>
            ))}
            {isChub && tags.length > 1 && (
              <button
                type="button"
                onClick={() => patch({ tagsMode: tagsMode === 'all' ? 'any' : 'all', page: 1 })}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Match ${tagsMode === 'all' ? 'any' : 'all'} tags instead`}
              >
                {tagsMode === 'all' ? 'all tags' : 'any tag'}
              </button>
            )}
            <button
              type="button"
              onClick={() => patch({ tags: [], creator: null, page: 1 })}
              className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              clear
            </button>
          </div>
        )}
        {NOTES[source] && <p className="text-[11px] leading-4 text-muted-foreground">{NOTES[source]}</p>}
        {source === 'wyvern' && applied && (
          <p className="text-[11px] leading-4 text-muted-foreground">A search term ranks by relevance, so the sort does not apply.</p>
        )}
        {source === 'risurealm' && sort === 'downloads' && !applied && (
          <p className="text-[11px] leading-4 text-muted-foreground">Most downloaded only orders a search: type a word and press Enter.</p>
        )}
        <form onSubmit={(e) => void importLink(e)} className="flex flex-col gap-1.5" aria-label="Import a card from a link">
          {linkError && <p role="alert" className="text-xs text-destructive">{linkError}</p>}
          {linkJanny && (
            <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 basis-60">{JANNY_MESSAGE}</span>
              <a
                href={linkJanny}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { setSource('janny'); setLinkJanny(null) }}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                <ArrowSquareOut className="size-3.5" aria-hidden="true" />Open the page
              </a>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <LinkSimple className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={linkValue}
                onChange={(e) => { setLinkValue(e.target.value); setLinkError(null); setLinkJanny(null) }}
                placeholder="Paste a card link…"
                className="h-9 pl-9 text-sm"
                aria-label="Paste a card link"
                inputMode="url"
              />
            </div>
            <Button type="submit" size="sm" className="h-9 shrink-0" disabled={linkBusy || !linkValue.trim()}>
              {linkBusy ? <><CircleNotch className="size-4 animate-spin" aria-hidden="true" />Importing…</> : 'Import'}
            </Button>
          </div>
        </form>
      </header>

        {source === 'janny' && <DropBar hydrate={hydrate} onOpen={() => setView('characters')} />}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="aspect-square w-full animate-pulse bg-accent" />
                <div className="flex flex-col gap-1.5 p-2.5">
                  <div className="h-3.5 w-2/3 animate-pulse rounded bg-accent" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-accent" />
                  <div className="h-2.5 w-full animate-pulse rounded bg-accent" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Storefront aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>Couldn&apos;t reach {sourceName(source)}</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Storefront aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No characters found</EmptyTitle>
              <EmptyDescription>
                {!isChub
                  ? applied || tags.length || origin || countFilters(filters, 'charavault')
                    ? `Nothing matches. Try another word, loosen a filter${showAdult ? '' : ' or show adult cards'}.`
                    : 'The catalog came back empty, try again.'
                  : trending
                    ? 'Trending is a small slice of the catalog. Turn it off to search everything.'
                    : applied || tags.length || countFilters(filters)
                      ? 'Nothing matches. Drop a tag or loosen a filter.'
                      : 'The catalog came back empty, try again.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((item) => (
                <button
                  key={keyOf(item)}
                  type="button"
                  onClick={() => setDetail(item)}
                  className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/50"
                >
                  <span className="relative block">
                    <ProxyImage
                      url={item.avatar}
                      alt={item.name}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                    {item.nsfw && (
                      <Badge className="absolute left-1.5 top-1.5 bg-destructive/90 text-[10px] text-white">18+</Badge>
                    )}
                    {libraryNames.has(item.name.trim().toLowerCase()) && (
                      <span
                        title="You may already have a character with this name"
                        className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur"
                      >
                        <BookBookmark className="size-3" aria-hidden="true" />library
                      </span>
                    )}
                    <span
                      title={`From ${sourceName(item.source ?? source)}`}
                      className="absolute bottom-1.5 right-1.5 rounded-full bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur"
                    >
                      {sourceName(item.source ?? source)}
                    </span>
                    {downloaded.has(keyOf(item)) && (
                      <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" aria-hidden="true" />
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col gap-1 p-2.5">
                    <span className="line-clamp-1 text-sm font-semibold">{item.name}</span>
                    <span className="line-clamp-1 text-[11px] text-muted-foreground">by {item.creator || 'unknown'}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{item.tagline || item.description}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {item.hasLore && (
                        <Badge variant="outline" className="gap-0.5 text-[10px]"><BookOpenText className="size-3" aria-hidden="true" />Lorebook</Badge>
                      )}
                      {item.topics.slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5" title="Downloads"><DownloadSimple className="size-3" aria-hidden="true" />{fmtCount(item.downloads)}</span>
                      {isChub && <span className="flex items-center gap-0.5" title="Favorites"><Heart className="size-3" aria-hidden="true" />{fmtCount(item.favorites)}</span>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {(page > 1 || canNext) && (
              <div className="flex items-center justify-center gap-3 py-3 text-xs text-muted-foreground">
                <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span>{hasTotal ? `page ${page} of ${pages}` : `page ${page}`}</span>
                <Button variant="outline" size="sm" className="h-7" disabled={!canNext} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </ScrollArea>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <div className="flex gap-4">
                  <ProxyImage
                    url={detail.avatar}
                    alt={detail.name}
                    className="size-24 shrink-0 rounded-lg border border-border object-cover sm:size-28"
                  />
                  <div className="flex min-w-0 flex-col items-start gap-1.5">
                    <DialogTitle className="leading-tight">{detail.name}</DialogTitle>
                    <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="rounded-full border border-border bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">{sourceName(detailSource)}</span>
                      {detailSource === 'chub' || detailSource === 'charavault' ? (
                        <button
                          type="button"
                          onClick={() => { if (detail.creator) { patch({ creator: detail.creator, page: 1 }); setDetail(null) } }}
                          title={`Browse everything by ${detail.creator}`}
                          className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                        >
                          <User className="size-3" aria-hidden="true" />by {detail.creator || 'unknown'}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1"><User className="size-3" aria-hidden="true" />by {detail.creator || 'unknown'}</span>
                      )}
                      {detail.createdAt && <span>{new Date(detail.createdAt).toLocaleDateString()}</span>}
                    </DialogDescription>
                    <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-0.5" title="Downloads"><DownloadSimple className="size-3" aria-hidden="true" />{fmtCount(detail.downloads)}</span>
                      {detailSource === 'chub' && <span className="flex items-center gap-0.5" title="Favorites"><Heart className="size-3" aria-hidden="true" />{fmtCount(detail.favorites)}</span>}
                      {detail.tokens > 0 && <span title="Token estimate for the card">{fmtCount(detail.tokens)} tok</span>}
                      {detail.ratingCount > 0 && (
                        <span>{detail.rating.toFixed(1)} ★ ({fmtCount(detail.ratingCount)})</span>
                      )}
                      {detail.hasLore && (
                        <Badge variant="outline" className="gap-0.5 text-[10px]"><BookOpenText className="size-3" aria-hidden="true" />Lorebook</Badge>
                      )}
                      {(detail.linkedBooks ?? 0) > 0 && (
                        <span title="Wyvern lorebooks are not readable without an account">{detail.linkedBooks} linked book{detail.linkedBooks === 1 ? '' : 's'} (not imported)</span>
                      )}
                    </span>
                    {libraryNames.has(detail.name.trim().toLowerCase()) && (
                      <span className="flex items-center gap-1 rounded-full border border-border bg-accent px-2 py-0.5 text-[10px] text-muted-foreground">
                        <BookBookmark className="size-3" aria-hidden="true" />
                        you may already have a character with this name
                      </span>
                    )}
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {detail.topics.slice(0, 12).map((t) => hasTags(detailSource) ? (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { toggleTag(t); setDetail(null) }}
                          title={`Filter the catalog by ${t}`}
                          className="rounded-full border border-transparent bg-accent px-2 py-0.5 text-[10px] text-accent-foreground transition-colors hover:border-primary/50"
                        >
                          {t}
                        </button>
                      ) : (
                        <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">{t}</span>
                      ))}
                      {detail.topics.length > 12 && <Badge variant="outline" className="text-[10px]">+{detail.topics.length - 12}</Badge>}
                    </span>
                  </div>
                </div>
              </DialogHeader>
              {detail.tagline && detail.tagline.trim() && !detailData?.partial && (
                <p className="text-xs italic text-muted-foreground">{detail.tagline}</p>
              )}
              {detail.description && !detailData?.partial && (
                <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{detail.description}</p>
              )}

              {detailSource !== 'janny' && (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Card preview</h3>
                {detailLoading && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />Loading the card…
                  </p>
                )}
                {detailError && (
                  <p className="text-xs text-destructive">Couldn&apos;t load the full card ({detailError}). The download still uses the source card.</p>
                )}
                {detailData && (
                  <>
                    {detailData.partial && (
                      <p className="text-xs text-muted-foreground">{sourceName(detailSource)} shows the card itself only after download.</p>
                    )}
                    {greetings.length > 0 && (
                      <section className="flex flex-col gap-1.5">
                        <span className="flex items-center justify-between">
                          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">First message</h4>
                          {greetings.length > 1 && (
                            <span className="flex items-center gap-1">
                              <span className="text-[10px] tabular-nums text-muted-foreground">{greetingIdx + 1}/{greetings.length}</span>
                              <Button variant="outline" size="sm" className="size-6 p-0" disabled={greetingIdx === 0} onClick={() => setGreetingIdx((i) => i - 1)} aria-label="Previous greeting"><CaretLeft className="size-3.5" aria-hidden="true" /></Button>
                              <Button variant="outline" size="sm" className="size-6 p-0" disabled={greetingIdx >= greetings.length - 1} onClick={() => setGreetingIdx((i) => i + 1)} aria-label="Next greeting"><CaretRight className="size-3.5" aria-hidden="true" /></Button>
                            </span>
                          )}
                        </span>
                        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-accent/40 px-3 py-2 text-xs leading-5">
                          {greetings[greetingIdx]}
                        </div>
                      </section>
                    )}
                    <CardSection title="Description" text={detailData.personality} />
                    <CardSection title="Scenario" text={detailData.scenario} />
                    <CardSection title="Example dialogue" text={detailData.exampleDialogs} />
                    <CardSection title={detailData.partial ? 'Description by the author' : 'Creator notes'} text={detailData.creatorNotes} />
                    <CardSection title="System prompt" text={detailData.systemPrompt} />
                    <CardSection title="Post-history instructions" text={detailData.postHistoryInstructions} />
                    {detailData.lorebookEntries !== 0 && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <BookOpenText className="size-3.5" aria-hidden="true" />
                        {detailData.lorebookEntries < 0
                          ? 'Has a lorebook, imported on download.'
                          : `Includes an embedded lorebook (${detailData.lorebookEntries} entries), imported on download.`}
                      </p>
                    )}
                  </>
                )}
              </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                {detailOpenUrl && !detail.browserOnly && (
                  <a
                    href={detailOpenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent"
                  >
                    <ArrowSquareOut className="size-3.5" aria-hidden="true" />Open on {sourceName(detailSource)}
                  </a>
                )}
                {detail.browserOnly ? (
                  <a
                    href={detail.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={getOnJanny}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <ArrowSquareOut className="size-3.5" aria-hidden="true" />Get on {sourceName(detailSource)}
                  </a>
                ) : downloaded.has(keyOf(detail)) ? (
                  <Button size="sm" onClick={() => { setDetail(null); setView('characters') }}>
                    <Check className="size-4" aria-hidden="true" />Open Characters
                  </Button>
                ) : (
                  <Button size="sm" disabled={downloading[keyOf(detail)]} onClick={() => void download(detail)}>
                    {downloading[keyOf(detail)]
                      ? <><CircleNotch className="size-4 animate-spin" aria-hidden="true" />Downloading…</>
                      : <><DownloadSimple className="size-4" aria-hidden="true" />Download</>}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </SectionPage>
  )
}

/** JannyAI cards can only be downloaded in the browser: this bar takes the
 *  files the user saved there (also any other PNG, JSON or charx card). */
function DropBar({ hydrate, onOpen }: { hydrate: () => Promise<void>; onOpen: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string[] | null>(null)

  const take = async (files: FileList | File[] | null) => {
    if (!files?.length || busy) return
    setBusy(true)
    try {
      const r = await importCardFiles(files, hydrate)
      setDone(r.names)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 px-4 pt-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files) }}
        disabled={busy}
        aria-label="Drop downloaded JannyAI cards here, or click to choose them"
        className={cn(
          'flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40',
          over && 'border-primary bg-accent/60',
        )}
      >
        {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <UploadSimple className="size-4" aria-hidden="true" />}
        <span>{busy ? 'Importing…' : 'Drop downloaded JannyAI cards here (or click to pick)'}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".png,.json,.charx"
        multiple
        className="hidden"
        aria-label="Choose card files"
        onChange={(e) => { void take(e.target.files); e.target.value = '' }}
      />
      {done && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" role="status">
          {done.length > 0 ? <>Imported: {done.join(', ')}</> : <span className="text-muted-foreground">Nothing was imported.</span>}
          {done.length > 0 && <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={onOpen}>Open Characters</Button>}
        </p>
      )}
    </div>
  )
}

function CardSection({ title, text }: { title: string; text: string }) {
  const trimmed = text.trim()
  if (!trimmed) return null
  return (
    <section className="flex flex-col gap-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-accent/40 px-3 py-2 text-xs leading-5">
        {trimmed}
      </div>
    </section>
  )
}

/** Tag filter picker: type-to-search over a vocabulary bootstrapped from the
 *  results the user has browsed, Enter toggles the exact match or adds the
 *  typed text as a custom tag, click rows to toggle, all/any for multi-tag. */
function TagsPicker(props: {
  tags: string[]
  tagsMode: 'all' | 'any'
  vocab: { tag: string; n: number }[]
  query: string
  onQuery: (q: string) => void
  open: boolean
  onOpen: (o: boolean) => void
  onToggle: (t: string) => void
  onMode: () => void
  /** all/any matching; only chub has it */
  modes: boolean
  /** JannyAI: the site's own tag list, no free-typed tags */
  fixedVocab?: boolean
}) {
  const q = props.query.trim().toLowerCase()
  const activeLower = new Set(props.tags.map((t) => t.toLowerCase()))
  const matches = q
    ? props.vocab.filter((v) => v.tag.toLowerCase().includes(q)).slice(0, 40)
    : props.vocab.slice(0, 40)
  const shown = [
    ...props.vocab.filter((v) => activeLower.has(v.tag.toLowerCase())),
    ...matches.filter((v) => !activeLower.has(v.tag.toLowerCase())),
  ]
  const exactActive = props.tags.find((t) => t.toLowerCase() === q)
  const custom = !props.fixedVocab && q && !exactActive && !props.vocab.some((v) => v.tag.toLowerCase() === q)

  const submitTag = () => {
    if (!q) return
    // Enter takes the exact match, else the top suggestion — the typed text
    // only becomes a custom tag when nothing in the vocabulary matches
    const exact = props.tags.find((t) => t.toLowerCase() === q)
      ?? props.vocab.find((v) => v.tag.toLowerCase() === q)?.tag
    const target = exact ?? (shown[0]?.tag ?? props.query.trim().replace(/[,]+/g, ' ').trim())
    props.onToggle(target)
    props.onQuery('')
  }

  return (
    <Popover
      open={props.open}
      onOpenChange={(o) => { props.onOpen(o); if (!o) props.onQuery('') }}
    >
      <PopoverTrigger
        render={
          <Button
            variant={props.tags.length ? 'secondary' : 'outline'}
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            aria-label="Filter by tags"
          >
            <Tag className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Tags</span>
            {props.tags.length > 0 && (
              <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {props.tags.length}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] p-0">
        <div className="border-b border-border p-2">
          <Input
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitTag() } }}
            placeholder="Type a tag, Enter adds it…"
            className="h-8 text-sm"
            aria-label="Filter tags"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {shown.length === 0 && !custom && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {props.vocab.length === 0 ? 'Loading tags…' : 'No matching tag, type one and press Enter.'}
            </p>
          )}
          {shown.map((v) => {
            const active = activeLower.has(v.tag.toLowerCase())
            return (
              <button
                key={v.tag}
                type="button"
                onClick={() => props.onToggle(v.tag)}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                  active && 'text-primary',
                )}
              >
                <Check className={cn('size-3.5 shrink-0', !active && 'invisible')} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{v.tag}</span>
                {v.n > 0 && <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{v.n}</span>}
              </button>
            )
          })}
          {custom && (
            <button
              type="button"
              onClick={() => { props.onToggle(props.query.trim().replace(/[,]+/g, ' ').trim()); props.onQuery('') }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
            >
              <Plus className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                Add <span className="font-medium">“{props.query.trim()}”</span> as a tag filter
              </span>
            </button>
          )}
        </div>
        {props.modes && props.tags.length > 1 && (
          <div className="border-t border-border p-2">
            <Button variant="outline" size="sm" className="h-7 w-full text-xs" onClick={props.onMode}>
              match: {props.tagsMode === 'all' ? 'all tags' : 'any tag'}, tap to switch
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** The catalog's narrowing controls. Edits collect in a draft so a
 *  half-typed number never fires a search; Apply commits the whole set. */
function FiltersPanel(props: {
  src: FilterSource
  filters: Filters
  open: boolean
  onOpen: (open: boolean) => void
  onApply: (f: Filters) => void
}) {
  const [draft, setDraft] = useState<Filters>(props.filters)
  const [excludeText, setExcludeText] = useState(props.filters.excludeTags.join(', '))
  const cv = props.src !== 'chub'
  const active = countFilters(props.filters, props.src)
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const parseTags = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12)
  const apply = () => props.onApply({ ...draft, excludeTags: parseTags(excludeText) })
  const lorebookOnly = props.src === 'charavault' ? REQUIREMENTS.filter((r) => r.key === 'requireLore') : []

  const num = (key: 'minTokens' | 'maxTokens' | 'maxDaysAgo' | 'minTags', label: string, placeholder: string) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={1}
        inputMode="numeric"
        value={draft[key]}
        onChange={(e) => set(key, e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply() } }}
        placeholder={placeholder}
        className="h-8 text-xs"
      />
    </label>
  )

  return (
    <Popover
      open={props.open}
      onOpenChange={(o) => {
        props.onOpen(o)
        // reopening always starts from what is actually applied
        if (o) { setDraft(props.filters); setExcludeText(props.filters.excludeTags.join(', ')) }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant={active ? 'secondary' : 'outline'}
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            aria-label="Search filters"
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Filters</span>
            {active > 0 && (
              <span className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {active}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] p-0">
        <div className="max-h-[min(70dvh,32rem)] space-y-3 overflow-y-auto p-3">
          {!cv && (<>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Adult cards</span>
            <div className="flex gap-1">
              {([['safe', 'Hide'], ['include', 'Include'], ['only', 'Only']] as const).map(([v, label]) => (
                <Button
                  key={v}
                  type="button"
                  variant={draft.maturity === v ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  aria-pressed={draft.maturity === v}
                  onClick={() => set('maturity', v)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={draft.nsfl} onCheckedChange={(v) => set('nsfl', v === true)} />
            Include extreme content
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={draft.includeForks} onCheckedChange={(v) => set('includeForks', v === true)} />
            Include forks
          </label>

          <Separator />
          </>)}

          <div className="flex gap-2">
            {num('minTokens', 'Min tokens', 'any')}
            {num('maxTokens', 'Max tokens', 'any')}
          </div>
          {!cv && (<>
          <div className="flex gap-2">
            {num('maxDaysAgo', 'Created within (days)', 'any')}
            {num('minTags', 'Min tags', 'any')}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Min rating</span>
            <Select value={draft.minAiRating || 'any'} onValueChange={(v) => set('minAiRating', v == null || v === 'any' ? '' : String(v))}>
              <SelectTrigger className="h-8 text-xs" aria-label="Minimum rating">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                {['1', '2', '3', '4', '5'].map((n) => <SelectItem key={n} value={n}>{n}+</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          </>)}

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Exclude tags</span>
            <Input
              value={excludeText}
              onChange={(e) => setExcludeText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply() } }}
              placeholder="comma separated"
              className="h-8 text-xs"
            />
          </label>

          {(!cv || lorebookOnly.length > 0) && (<>
          <Separator />

          <span className="block text-[11px] text-muted-foreground">Must have</span>
          <div className="grid gap-2">
            {(cv ? lorebookOnly : REQUIREMENTS).map((r) => (
              <label key={r.key} className="flex items-center gap-2 text-xs">
                <Checkbox checked={draft[r.key] === true} onCheckedChange={(v) => set(r.key, (v === true) as Filters[typeof r.key])} />
                {r.label}
              </label>
            ))}
          </div>
          </>)}
        </div>
        <div className="flex gap-2 border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => { setDraft(NO_FILTERS); setExcludeText('') }}
          >
            Reset
          </Button>
          <Button size="sm" className="h-7 flex-1 text-xs" onClick={apply}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
