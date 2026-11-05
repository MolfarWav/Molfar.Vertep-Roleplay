// Matching by meaning, for one chat (#184): what GET /litopys/vectors says, and the one state the card shows.
// Pure: no fetch here (vectors-load.ts), so the states can be tested without a browser.

/** What the Litopys plugin knows from the chat's own files. "empty" = nothing to embed yet. */
export type VectorsServerState = 'empty' | 'all' | 'partial' | 'none' | 'other' | 'failing' | 'working'

export interface VectorsView {
  chatId: string
  state: VectorsServerState
  /** active facts + chapters with text */
  items: number
  /** of those, with a usable vector of the model in use */
  have: number
  /** with no vector (or one of a text since edited) */
  missing: number
  /** with a vector made by another model */
  other: number
  /** a rough cost of embedding `missing + other` items: four characters a token */
  tokens: number
  model: string
  via: string
  failing: { at: number; retryAt: number } | null
  /** the Data Bank view only (chatId 'shelf'): one line per file */
  files?: { id: string; name: string; items: number; have: number; other: number }[]
}

/** Is an embeddings connection ready in the engine? "unknown" = an older engine that does not say. */
export type EmbedSetup = 'ready' | 'none' | 'unknown'

/** The card's state: the plugin's, with "off" when the engine has no embeddings connection at all (then nothing is compared, whatever is stored). */
export type MeaningState = VectorsServerState | 'off'

export function meaningState(view: VectorsView | null, setup: EmbedSetup): MeaningState | null {
  if (!view) return null
  if (view.state === 'working') return 'working'
  if (setup === 'none') return 'off'
  return view.state
}

/** Items a click would embed. */
export const toEmbed = (v: VectorsView): number => v.missing + v.other

/** Minutes until the engine tries again after a failed call, at least 1. */
export function retryMinutes(v: VectorsView, now: number): number {
  return v.failing ? Math.max(1, Math.ceil((v.failing.retryAt - now) / 60000)) : 0
}

/** Rounded for reading: "about 3,000", never a false precision. */
export function roughTokens(n: number): number {
  if (n < 100) return Math.max(10, Math.round(n / 10) * 10)
  if (n < 10000) return Math.round(n / 100) * 100
  return Math.round(n / 1000) * 1000
}

/** The engine's setup answer (`GET /v1/embeddings/config`) as the card needs it. */
export function setupOf(config: unknown): EmbedSetup {
  const list = (config as { providers?: unknown } | null)?.providers
  if (!Array.isArray(list)) return 'unknown'
  return list.some((p) => (p as { ready?: unknown } | null)?.ready === true) ? 'ready' : 'none'
}

/** What a reply's trace says about ranking by meaning (`sem` in the insert trace). */
export interface SemTrace {
  scan: boolean
  have: number
  seen: number
  /** when scan is false: novec (no vectors yet), failing (the last call failed), noscan (the reply was not embedded) */
  why: string
  model: string
}

/** Fewer candidates with a vector than this and the ranking has too little to compare (SEM_MIN_POOL in the plugin). */
export const SEM_MIN = 4

export type SemVerdict =
  | { kind: 'yes'; have: number; seen: number }
  | { kind: 'few'; have: number; seen: number }
  | { kind: 'no'; why: 'novec' | 'failing' | 'noscan' }

/** null = a trace from before this was recorded: nothing to say. */
export function semVerdict(sem: SemTrace | null | undefined): SemVerdict | null {
  if (!sem) return null
  if (sem.scan) return sem.have >= SEM_MIN ? { kind: 'yes', have: sem.have, seen: sem.seen } : { kind: 'few', have: sem.have, seen: sem.seen }
  return { kind: 'no', why: sem.why === 'novec' || sem.why === 'failing' ? sem.why : 'noscan' }
}
