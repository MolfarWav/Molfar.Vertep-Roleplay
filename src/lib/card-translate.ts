import type { Character, Lorebook, LoreEntry } from './types'

/** Translating a card from the Store: a preview of a listing, and a pass over
 *  a character (and its embedded lorebook) that was just installed. Everything
 *  here is pure or takes its side effects as arguments, so the tests can run
 *  it with fakes; the Store wires it to the store actions and POST /translate. */

/** The language names the translation tab offers (the plugin's code table). */
export const TRANSLATE_LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Polish', 'Russian',
  'Japanese', 'Korean', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Ukrainian', 'Turkish',
  'Arabic', 'Hebrew', 'Dutch', 'Czech', 'Greek', 'Swedish', 'Indonesian', 'Vietnamese',
]

export type Translator = (text: string) => Promise<string>

/** Requests in flight at once, and how many failures end a pass. */
export const TRANSLATE_CONCURRENCY = 2
export const TRANSLATE_MAX_FAILURES = 3

/** Run `worker` over `items`, at most `limit` at a time. Once `shouldStop()`
 *  is true no new item is started (the ones in flight finish). */
export async function runLimited<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  let next = 0
  const lane = async () => {
    while (next < items.length && !shouldStop()) {
      const i = next++
      await worker(items[i]!, i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane))
}

const clean = (s: unknown): string | null => (typeof s === 'string' && s.trim() ? s : null)

// ── the preview in the detail dialog ──────────────────────────────────────

/** The text parts of a listing's detail that the Store shows. */
export interface DetailTexts {
  greeting: string
  alternateGreetings: string[]
  personality: string
  scenario: string
  exampleDialogs: string
  creatorNotes: string
  systemPrompt: string
  postHistoryInstructions: string
}
export const DETAIL_FIELDS = ['greeting', 'personality', 'scenario', 'exampleDialogs', 'creatorNotes', 'systemPrompt', 'postHistoryInstructions'] as const

/** What the preview translates: the listing's own lines and the detail. */
export interface PreviewInput<D extends DetailTexts = DetailTexts> { tagline: string; description: string; detail: D | null }
export type PreviewOutput<D extends DetailTexts = DetailTexts> = PreviewInput<D>

/** Every non-empty text of a preview, with a stable id. */
export function planPreview(src: PreviewInput<DetailTexts>): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = []
  const add = (id: string, v: unknown) => { const t = clean(v); if (t) out.push({ id, text: t }) }
  add('tagline', src.tagline)
  // the listing description usually starts with the tagline: one request is enough
  if (src.description.trim() && src.description.trim() !== src.tagline.trim()) add('description', src.description)
  if (src.detail) {
    for (const f of DETAIL_FIELDS) add(f, src.detail[f])
    src.detail.alternateGreetings.forEach((g, i) => add(`alt.${i}`, g))
  }
  return out
}

/** The translated preview: every text that has an answer replaced, the rest kept. */
export function buildPreview<D extends DetailTexts>(src: PreviewInput<D>, answers: Record<string, string>): PreviewOutput<D> {
  const pick = (id: string, original: string) => answers[id] ?? original
  const description = src.description.trim() && src.description.trim() === src.tagline.trim()
    ? pick('tagline', src.description)
    : pick('description', src.description)
  const detail = src.detail
    ? {
        ...src.detail,
        ...Object.fromEntries(DETAIL_FIELDS.map((f) => [f, pick(f, src.detail![f])])),
        alternateGreetings: src.detail.alternateGreetings.map((g, i) => pick(`alt.${i}`, g)),
      } as D
    : null
  return { tagline: pick('tagline', src.tagline), description, detail }
}

// ── an installed character ────────────────────────────────────────────────

export const CARD_FIELDS = [
  'description', 'personality', 'scenario', 'firstMessage', 'exampleDialogue',
  'creatorNotes', 'systemPromptOverride', 'postHistoryInstructions',
] as const
export type CardField = (typeof CARD_FIELDS)[number]

export type CardJob = { kind: 'field'; field: CardField; text: string } | { kind: 'greeting'; index: number; text: string }

export function cardJobLabel(j: CardJob): string {
  return j.kind === 'field' ? j.field : `altGreetings[${j.index}]`
}

/** The writing fields of a character that have text, one job each. */
export function planCardJobs(c: Pick<Character, CardField | 'altGreetings'>): CardJob[] {
  const jobs: CardJob[] = []
  for (const field of CARD_FIELDS) { const t = clean(c[field]); if (t) jobs.push({ kind: 'field', field, text: t }) }
  c.altGreetings.forEach((g, index) => { const t = clean(g); if (t) jobs.push({ kind: 'greeting', index, text: t }) })
  return jobs
}

export interface TranslationMeta { target: string; provider: string; at: string }

/** What the character becomes with the answers in: the patch for
 *  updateCharacter, and which parts changed. The originals of the changed
 *  fields are kept in the card's extensions (cardExtras.extensions), so the
 *  card can be translated back. An older record keeps its first originals. */
export function applyCardResults(
  c: Pick<Character, CardField | 'altGreetings' | 'cardExtras'>,
  jobs: readonly CardJob[],
  answers: readonly (string | null)[],
  meta: TranslationMeta,
): { patch: Partial<Character>; changed: string[] } {
  const patch: Partial<Character> = {}
  const original: Record<string, unknown> = {}
  const changed: string[] = []
  const greetings = [...c.altGreetings]
  let greetingsChanged = false
  jobs.forEach((job, i) => {
    const ans = clean(answers[i])
    if (!ans || ans === job.text) return
    changed.push(cardJobLabel(job))
    if (job.kind === 'field') {
      ;(patch as Record<string, unknown>)[job.field] = ans
      original[job.field] = job.text
    } else {
      greetings[job.index] = ans
      greetingsChanged = true
    }
  })
  if (greetingsChanged) { patch.altGreetings = greetings; original.altGreetings = [...c.altGreetings] }
  if (!changed.length) return { patch: {}, changed }
  const extras = { ...(c.cardExtras ?? {}) }
  const ext = (extras.extensions && typeof extras.extensions === 'object' ? extras.extensions : {}) as Record<string, unknown>
  const prev = (ext.molfar_translation && typeof ext.molfar_translation === 'object' ? ext.molfar_translation : {}) as { original?: Record<string, unknown> }
  patch.cardExtras = {
    ...extras,
    extensions: { ...ext, molfar_translation: { target: meta.target, provider: meta.provider, at: meta.at, original: { ...original, ...(prev.original ?? {}) } } },
  }
  return { patch, changed }
}

// ── a lorebook ────────────────────────────────────────────────────────────

export type BookJob = { entry: number; part: 'content' | 'memo' | 'keys' | 'secondaryKeys'; text: string }

/** The texts of a book's entries: content, comment (memo), and the key lists
 *  as one comma line each (regex keys are patterns, not words: left alone). */
export function planBookJobs(book: Pick<Lorebook, 'entries'>): BookJob[] {
  const jobs: BookJob[] = []
  book.entries.forEach((e, entry) => {
    const content = clean(e.content)
    if (content) jobs.push({ entry, part: 'content', text: content })
    const memo = clean(e.memo)
    if (memo) jobs.push({ entry, part: 'memo', text: memo })
    if (!e.keysRegex) {
      const keys = e.keys.filter((k) => k.trim())
      if (keys.length) jobs.push({ entry, part: 'keys', text: keys.join(', ') })
      const sec = e.secondaryKeys.filter((k) => k.trim())
      if (sec.length) jobs.push({ entry, part: 'secondaryKeys', text: sec.join(', ') })
    }
  })
  return jobs
}

/** A translated key line back to keys: split on the usual separators (also the
 *  full-width ones), trimmed, quotes dropped, short enough to be a key. */
export function splitKeys(text: string): string[] {
  return text
    .split(/[,，、;；\n]+/)
    .map((k) => k.trim().replace(/^["'“”‘’「」]+|["'“”‘’「」]+$/g, '').trim())
    .filter((k) => k && k.length <= 100)
}

/** The originals first, then the new keys that are not already there
 *  (compared without case), so an entry fires in both languages. */
export function mergeKeys(originals: readonly string[], extra: readonly string[]): string[] {
  const seen = new Set(originals.map((k) => k.trim().toLowerCase()))
  const out = [...originals]
  for (const k of extra) {
    const low = k.toLowerCase()
    if (seen.has(low)) continue
    seen.add(low)
    out.push(k)
  }
  return out
}

/** The entries with the answers in. Content and comment are replaced (the
 *  entry title follows the comment when it was a copy of it); keys and
 *  secondary keys get the translated words added next to the originals. */
export function applyBookResults(
  book: Pick<Lorebook, 'entries'>,
  jobs: readonly BookJob[],
  answers: readonly (string | null)[],
): { entries: LoreEntry[]; changed: number } {
  const entries = book.entries.map((e) => ({ ...e }))
  let changed = 0
  jobs.forEach((job, i) => {
    const ans = clean(answers[i])
    const e = entries[job.entry]
    if (!ans || !e) return
    if (job.part === 'content') { if (ans !== e.content) { e.content = ans; changed++ } }
    else if (job.part === 'memo') {
      if (ans !== e.memo) { if (e.title === e.memo) e.title = ans; e.memo = ans; changed++ }
    } else {
      const field = job.part
      const merged = mergeKeys(e[field], splitKeys(ans))
      if (merged.length !== e[field].length) { e[field] = merged; changed++ }
    }
  })
  return { entries, changed }
}

// ── the whole pass over an installed card ─────────────────────────────────

export interface InstallTranslateDeps {
  translate: Translator
  getCharacter: (id: string) => Character | undefined
  updateCharacter: (id: string, patch: Partial<Character>) => void
  getBook: (id: string) => Lorebook | undefined
  updateBook: (id: string, patch: Partial<Lorebook>) => void
  /** called after every finished request */
  progress: (done: number, total: number) => void
}

export interface InstallTranslateResult {
  total: number
  done: number
  /** what stayed in the original language, in words for a toast */
  notTranslated: string[]
}

/** Translate a character's writing fields and its embedded lorebook. Two
 *  requests at a time; after TRANSLATE_MAX_FAILURES failures the pass stops and
 *  says what is left. Whatever was translated is saved. */
export async function translateInstalled(id: string, deps: InstallTranslateDeps, meta: TranslationMeta): Promise<InstallTranslateResult> {
  const char = deps.getCharacter(id)
  if (!char) return { total: 0, done: 0, notTranslated: ['the character was not found'] }
  const cardJobs = planCardJobs(char)
  const book = char.embeddedLorebookId ? deps.getBook(char.embeddedLorebookId) : undefined
  const bookJobs = book ? planBookJobs(book) : []
  const total = cardJobs.length + bookJobs.length
  let done = 0
  let failures = 0
  const stop = () => failures >= TRANSLATE_MAX_FAILURES
  const ask = async (text: string): Promise<string | null> => {
    try {
      const r = clean(await deps.translate(text))
      if (r) return r
      failures++
    } catch {
      failures++
    }
    return null
  }
  const notTranslated: string[] = []

  const cardAnswers: (string | null)[] = cardJobs.map(() => null)
  await runLimited(cardJobs, TRANSLATE_CONCURRENCY, async (job, i) => {
    cardAnswers[i] = await ask(job.text)
    deps.progress(++done, total)
  }, stop)
  const applied = applyCardResults(deps.getCharacter(id) ?? char, cardJobs, cardAnswers, meta)
  if (applied.changed.length) deps.updateCharacter(id, applied.patch)
  const missed = cardJobs.filter((_, i) => !cardAnswers[i]).map(cardJobLabel)
  if (missed.length) notTranslated.push(...missed)

  if (book && bookJobs.length) {
    const bookAnswers: (string | null)[] = bookJobs.map(() => null)
    if (!stop()) {
      await runLimited(bookJobs, TRANSLATE_CONCURRENCY, async (job, i) => {
        bookAnswers[i] = await ask(job.text)
        deps.progress(++done, total)
      }, stop)
    }
    const fresh = deps.getBook(book.id) ?? book
    const res = applyBookResults(fresh, bookJobs, bookAnswers)
    if (res.changed) deps.updateBook(book.id, { entries: res.entries })
    const missedEntries = new Set(bookJobs.filter((_, i) => !bookAnswers[i]).map((j) => j.entry))
    if (missedEntries.size) notTranslated.push(`${missedEntries.size} lorebook entr${missedEntries.size === 1 ? 'y' : 'ies'}`)
  }
  return { total, done, notTranslated }
}
