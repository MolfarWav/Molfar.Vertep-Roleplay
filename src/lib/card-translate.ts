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

/** The language the app translates cards to, one choice for the Store and the
 *  character editor, remembered per browser. */
export const TRANSLATE_TO_KEY = 'chrysalis.marketplace.translateTo'
/** The remembered choice, else `fallback` (callers pass the app's own language:
 *  translating an English card "to English" changes nothing). */
export function loadTranslateTo(fallback = 'English'): string {
  try {
    const v = localStorage.getItem(TRANSLATE_TO_KEY)
    return v && TRANSLATE_LANGUAGES.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
export function saveTranslateTo(v: string): void {
  try { localStorage.setItem(TRANSLATE_TO_KEY, v) } catch { /* storage unavailable */ }
}

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
): { patch: Partial<Character>; changed: string[]; skipped: string[] } {
  const patch: Partial<Character> = {}
  const skipped: string[] = []
  const original: Record<string, unknown> = {}
  const changed: string[] = []
  const greetings = [...c.altGreetings]
  let greetingsChanged = false
  jobs.forEach((job, i) => {
    const ans = clean(answers[i])
    if (!ans || ans === job.text) return
    // edited while the pass ran: the translation would overwrite the edit
    const now = job.kind === 'field' ? c[job.field] : c.altGreetings[job.index]
    if (now !== job.text) { skipped.push(cardJobLabel(job)); return }
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
  if (!changed.length) return { patch: {}, changed, skipped }
  const extras = { ...(c.cardExtras ?? {}) }
  const ext = (extras.extensions && typeof extras.extensions === 'object' ? extras.extensions : {}) as Record<string, unknown>
  const prev = (ext.molfar_translation && typeof ext.molfar_translation === 'object' ? ext.molfar_translation : {}) as { original?: Record<string, unknown> }
  patch.cardExtras = {
    ...extras,
    extensions: { ...ext, molfar_translation: { target: meta.target, provider: meta.provider, at: meta.at, original: { ...original, ...(prev.original ?? {}) } } },
  }
  return { patch, changed, skipped }
}

/** The originals kept by a translation, back in the character: a patch for
 *  updateCharacter, or null when the card has no record. The keys are the ones
 *  applyCardResults stored (the writing fields and the whole altGreetings list);
 *  the record is removed from the extensions. The lorebook is not part of it:
 *  its originals are not stored (its keys kept them anyway). */
export function restoreOriginal(c: Pick<Character, 'cardExtras'>): { patch: Partial<Character>; restored: string[]; target: string } | null {
  const ext = c.cardExtras?.extensions
  if (!ext || typeof ext !== 'object') return null
  const rec = (ext as Record<string, unknown>).molfar_translation
  if (!rec || typeof rec !== 'object') return null
  const original = (rec as { original?: unknown }).original
  if (!original || typeof original !== 'object') return null
  const patch: Partial<Character> = {}
  const restored: string[] = []
  for (const field of CARD_FIELDS) {
    const v = (original as Record<string, unknown>)[field]
    if (typeof v === 'string') { (patch as Record<string, unknown>)[field] = v; restored.push(field) }
  }
  const g = (original as Record<string, unknown>).altGreetings
  if (Array.isArray(g)) { patch.altGreetings = g.map(String); restored.push('altGreetings') }
  const { molfar_translation: _gone, ...rest } = ext as Record<string, unknown>
  const extras = { ...(c.cardExtras ?? {}) }
  if (Object.keys(rest).length) extras.extensions = rest
  else delete extras.extensions
  patch.cardExtras = Object.keys(extras).length ? extras : undefined
  return { patch, restored, target: String((rec as { target?: unknown }).target ?? '') }
}

/** Whether a card carries a translation record that can be undone. */
export const hasTranslationRecord = (c: Pick<Character, 'cardExtras'>): boolean => restoreOriginal(c) !== null

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
): { entries: LoreEntry[]; changed: number; skipped: number } {
  const entries = book.entries.map((e) => ({ ...e }))
  let changed = 0
  let skipped = 0
  jobs.forEach((job, i) => {
    const ans = clean(answers[i])
    const e = entries[job.entry]
    if (!ans || !e) return
    if (job.part === 'content') {
      if (e.content !== job.text) skipped++ // edited while the pass ran
      else if (ans !== e.content) { e.content = ans; changed++ }
    } else if (job.part === 'memo') {
      if (e.memo !== job.text) skipped++
      else if (ans !== e.memo) { if (e.title === e.memo) e.title = ans; e.memo = ans; changed++ }
    } else {
      const field = job.part
      const merged = mergeKeys(e[field], splitKeys(ans))
      if (merged.length !== e[field].length) { e[field] = merged; changed++ }
    }
  })
  return { entries, changed, skipped }
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
  /** every answer equalled its text: the card is already in the target language */
  unchanged: boolean
  /** with `{ apply: false }`: the answers, to preview and then save with applyPendingTranslation */
  pending?: PendingTranslation
}

/** A finished pass that is not saved yet (the editor previews it first). */
export interface PendingTranslation {
  meta: TranslationMeta
  cardJobs: CardJob[]
  cardAnswers: (string | null)[]
  bookId: string | null
  bookJobs: BookJob[]
  bookAnswers: (string | null)[]
}

/** What the character and its book look like with a pending translation in,
 *  computed against their CURRENT state (a field edited meanwhile keeps the edit). */
export function previewPendingTranslation(
  pending: PendingTranslation,
  c: Pick<Character, CardField | 'altGreetings' | 'cardExtras'>,
  book: Pick<Lorebook, 'entries'> | undefined,
): { patch: Partial<Character>; changed: string[]; skipped: string[]; entries: LoreEntry[] | null; bookChanged: number; bookSkipped: number } {
  const card = applyCardResults(c, pending.cardJobs, pending.cardAnswers, pending.meta)
  const b = book && pending.bookJobs.length ? applyBookResults(book, pending.bookJobs, pending.bookAnswers) : null
  return {
    patch: card.patch, changed: card.changed, skipped: card.skipped,
    entries: b && b.changed ? b.entries : null, bookChanged: b ? b.changed : 0, bookSkipped: b ? b.skipped : 0,
  }
}

/** Save a pending translation: the same checks as a direct pass, on the state as it is now. */
export function applyPendingTranslation(id: string, pending: PendingTranslation, deps: Pick<InstallTranslateDeps, 'getCharacter' | 'updateCharacter' | 'getBook' | 'updateBook'>): { changed: number; skipped: string[] } {
  const c = deps.getCharacter(id)
  if (!c) return { changed: 0, skipped: ['the character was not found'] }
  const book = pending.bookId ? deps.getBook(pending.bookId) : undefined
  const p = previewPendingTranslation(pending, c, book)
  if (p.changed.length) deps.updateCharacter(id, p.patch)
  if (book && p.entries) deps.updateBook(book.id, { entries: p.entries })
  const skipped = [...p.skipped.map((l) => `${l} (edited meanwhile)`)]
  if (p.bookSkipped) skipped.push(`${p.bookSkipped} lorebook text${p.bookSkipped === 1 ? '' : 's'} (edited meanwhile)`)
  return { changed: p.changed.length + p.bookChanged, skipped }
}

/** Translate a character's writing fields and its embedded lorebook. Two
 *  requests at a time; after TRANSLATE_MAX_FAILURES failures the pass stops and
 *  says what is left. Whatever was translated is saved, unless `apply: false`:
 *  then nothing is written and `pending` carries the answers. */
export async function translateInstalled(id: string, deps: InstallTranslateDeps, meta: TranslationMeta, opts: { apply?: boolean } = {}): Promise<InstallTranslateResult> {
  const apply = opts.apply !== false
  const char = deps.getCharacter(id)
  if (!char) return { total: 0, done: 0, notTranslated: ['the character was not found'], unchanged: false }
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
  const missed = cardJobs.filter((_, i) => !cardAnswers[i]).map(cardJobLabel)
  if (missed.length) notTranslated.push(...missed)

  const bookAnswers: (string | null)[] = bookJobs.map(() => null)
  if (book && bookJobs.length && !stop()) {
    await runLimited(bookJobs, TRANSLATE_CONCURRENCY, async (job, i) => {
      bookAnswers[i] = await ask(job.text)
      deps.progress(++done, total)
    }, stop)
  }
  if (book && bookJobs.length) {
    const missedEntries = new Set(bookJobs.filter((_, i) => !bookAnswers[i]).map((j) => j.entry))
    if (missedEntries.size) notTranslated.push(`${missedEntries.size} lorebook entr${missedEntries.size === 1 ? 'y' : 'ies'}`)
  }
  const same = (jobs: readonly { text: string }[], answers: readonly (string | null)[]) =>
    answers.every((a, i) => a == null || a.trim() === jobs[i]!.text.trim())
  const answered = cardAnswers.some(Boolean) || bookAnswers.some(Boolean)
  const unchanged = answered && same(cardJobs, cardAnswers) && same(bookJobs, bookAnswers)
  const pending: PendingTranslation = { meta, cardJobs, cardAnswers, bookId: book ? book.id : null, bookJobs, bookAnswers }
  if (!apply) return { total, done, notTranslated, unchanged, pending }
  const res = applyPendingTranslation(id, pending, deps)
  notTranslated.push(...res.skipped)
  return { total, done, notTranslated, unchanged }
}
