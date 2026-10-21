import { toast } from 'sonner'
import { create } from 'zustand'
import { j } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { applyPendingTranslation, translateBook, translateInstalled, type PendingTranslation, type Translator } from '@/lib/card-translate'
import { resolveLanguage, t } from '@/lib/i18n'
import type { AppSettings } from '@/lib/types'

/** The glue between card-translate.ts and the running app: one request to the
 *  app's translator (provider and DeepL key from the translation settings),
 *  and a pass over a character in the library with progress and result toasts.
 *  Used by the Store (install translated) and the character editor. */

export type TranslationSettings = AppSettings['translation']

export function makeTranslator(target: string, translation: TranslationSettings): Translator {
  return async (text, signal) => {
    const r = await j<{ text: string }>('/translate', {
      method: 'POST',
      body: JSON.stringify({ text, target, provider: translation.provider, deeplKey: translation.deeplKey }),
      signal,
    })
    return r.text
  }
}

/** Characters (and books) with a pass running, so a second one is not started. */
const running = new Set<string>()
export const isTranslating = (id: string): boolean => running.has(id)

/** The Cancel of a running pass: aborting its requests ends it with nothing written. */
const controllers = new Map<string, AbortController>()
export function cancelTranslation(id: string): void { controllers.get(id)?.abort() }

const lang = () => resolveLanguage(useApp.getState().settings.language)

/** The progress toast of a pass, with a Cancel button (a click keeps the toast; the pass then replaces it). */
function progressToast(id: string, message: string, tid?: string | number): string | number {
  return toast.loading(message, {
    ...(tid !== undefined ? { id: tid } : {}),
    action: { label: t('tr.cancel', lang()), onClick: (e) => { e.preventDefault(); cancelTranslation(id) } },
    // a 40 px target on a phone
    classNames: { actionButton: 'max-sm:!h-10 max-sm:!px-4 max-sm:!text-sm' },
  })
}

/** The options that turn the progress toast into a final one: same toast, the Cancel gone. */
const done = (tid: string | number) => ({ id: tid, action: undefined, classNames: undefined })

/** Start a pass: its controller and its progress toast. */
function begin(id: string, message: string): { ac: AbortController; tid: string | number } {
  running.add(id)
  const ac = new AbortController()
  controllers.set(id, ac)
  return { ac, tid: progressToast(id, message) }
}

function end(id: string): void {
  running.delete(id)
  controllers.delete(id)
}

const cancelledToast = (name: string, tid: string | number) => toast.info(t('tr.cancelled', lang(), { name }), { ...done(tid) })

/** Translate a character (and its embedded lorebook) in the library. Never
 *  throws: the card stays as it is whatever happens, and the toasts say what
 *  was not translated. */
export async function translateCharacter(
  id: string,
  name: string,
  opts: { target: string; translation: TranslationSettings; onOpen?: () => void },
): Promise<void> {
  if (running.has(id)) return
  const { ac, tid } = begin(id, `Translating ${name}…`)
  const st = () => useApp.getState()
  try {
    const res = await translateInstalled(id, {
      translate: makeTranslator(opts.target, opts.translation),
      signal: ac.signal,
      getCharacter: (cid) => st().characters.find((c) => c.id === cid),
      updateCharacter: (cid, patch) => st().updateCharacter(cid, patch),
      getBook: (bid) => st().lorebooks.find((b) => b.id === bid),
      updateBook: (bid, patch) => st().updateLorebook(bid, patch),
      progress: (done, total) => { if (!ac.signal.aborted) progressToast(id, `Translating ${name}: ${done}/${total}`, tid) },
    }, { target: opts.target, provider: opts.translation.provider || 'llm', at: new Date().toISOString() })
    if (res.cancelled) {
      cancelledToast(name, tid)
    } else if (res.unchanged) {
      toast.warning(`${name} is already in ${opts.target}`, { ...done(tid), description: 'Nothing changed. Pick another language to translate to.' })
    } else if (res.notTranslated.length) {
      toast.warning(`${name} is only partly translated`, { ...done(tid), description: `Not translated: ${res.notTranslated.join(', ')}. What was translated is saved.` })
    } else {
      toast.success(`${name} translated to ${opts.target}`, { ...done(tid), ...(opts.onOpen ? { action: { label: 'Open', onClick: opts.onOpen } } : {}) })
    }
  } catch (e) {
    if (ac.signal.aborted) cancelledToast(name, tid)
    else toast.error(`Couldn't translate ${name}`, { ...done(tid), description: `${String((e as Error).message ?? e)} The card is kept as it was.` })
  } finally {
    end(id)
  }
}

/** Translate a lorebook in the library, optionally keeping a copy of it as it
 *  was first (the copy is not active and is linked to nothing). Never throws. */
export async function translateLorebook(
  bookId: string,
  name: string,
  opts: { target: string; translation: TranslationSettings; keepCopy: boolean },
): Promise<void> {
  if (running.has(bookId)) return
  const { ac, tid } = begin(bookId, `Translating ${name}…`)
  const st = () => useApp.getState()
  let copyId: string | null = null
  try {
    if (opts.keepCopy) {
      copyId = st().duplicateLorebook(bookId)
      st().updateLorebook(copyId, { name: `${name} (original)` })
    }
    const res = await translateBook(bookId, {
      translate: makeTranslator(opts.target, opts.translation),
      signal: ac.signal,
      getBook: (bid) => st().lorebooks.find((b) => b.id === bid),
      updateBook: (bid, patch) => st().updateLorebook(bid, patch),
      progress: (done, total) => { if (!ac.signal.aborted) progressToast(bookId, `Translating ${name}: ${done}/${total}`, tid) },
    })
    if (res.cancelled) {
      // the copy was made for a translation that did not happen
      if (copyId) st().deleteLorebook(copyId)
      cancelledToast(name, tid)
    } else if (!res.total) toast.info(`${name} has no text to translate`, { ...done(tid) })
    else if (res.unchanged) toast.warning(`${name} is already in ${opts.target}`, { ...done(tid) })
    else if (res.missed) toast.warning(`${name} is only partly translated`, { ...done(tid), description: `${res.missed} entr${res.missed === 1 ? 'y' : 'ies'} stayed as they were. What was translated is saved.` })
    else toast.success(`${name} translated to ${opts.target}`, { ...done(tid) })
  } catch (e) {
    if (ac.signal.aborted) {
      if (copyId) st().deleteLorebook(copyId)
      cancelledToast(name, tid)
    } else toast.error(`Couldn't translate ${name}`, { ...done(tid), description: String((e as Error).message ?? e) })
  } finally {
    end(bookId)
  }
}

/** Translations the character editor shows before they are saved, by character id. */
export const usePendingTranslations = create<{ byId: Record<string, PendingTranslation> }>(() => ({ byId: {} }))
const setPending = (id: string, p: PendingTranslation | null) =>
  usePendingTranslations.setState((s) => {
    const byId = { ...s.byId }
    if (p) byId[id] = p
    else delete byId[id]
    return { byId }
  })

/** Translate a character WITHOUT saving: the answers wait in usePendingTranslations
 *  for the editor's preview; savePendingTranslation / discardPendingTranslation end it.
 *  Returns true when there is something to preview. */
export async function previewTranslation(
  id: string,
  name: string,
  opts: { target: string; translation: TranslationSettings },
): Promise<boolean> {
  if (running.has(id)) return false
  const { ac, tid } = begin(id, `Translating ${name}…`)
  const st = () => useApp.getState()
  try {
    const res = await translateInstalled(id, {
      translate: makeTranslator(opts.target, opts.translation),
      signal: ac.signal,
      getCharacter: (cid) => st().characters.find((c) => c.id === cid),
      updateCharacter: () => {},
      getBook: (bid) => st().lorebooks.find((b) => b.id === bid),
      updateBook: () => {},
      progress: (done, total) => { if (!ac.signal.aborted) progressToast(id, `Translating ${name}: ${done}/${total}`, tid) },
    }, { target: opts.target, provider: opts.translation.provider || 'llm', at: new Date().toISOString() }, { apply: false })
    if (res.cancelled) {
      cancelledToast(name, tid)
      return false
    }
    if (res.unchanged) {
      toast.warning(`${name} is already in ${opts.target}`, { ...done(tid), description: 'Nothing changed. Pick another language to translate to.' })
      return false
    }
    if (!res.pending || !(res.pending.cardAnswers.some(Boolean) || res.pending.bookAnswers.some(Boolean))) {
      toast.error(`Couldn't translate ${name}`, { ...done(tid), description: `Not translated: ${res.notTranslated.join(', ') || 'everything'}. The card is kept as it was.` })
      return false
    }
    toast.dismiss(tid)
    if (res.notTranslated.length) toast.warning(`${name}: part of the card was not translated`, { description: `Not translated: ${res.notTranslated.join(', ')}.` })
    setPending(id, res.pending)
    return true
  } catch (e) {
    if (ac.signal.aborted) cancelledToast(name, tid)
    else toast.error(`Couldn't translate ${name}`, { ...done(tid), description: `${String((e as Error).message ?? e)} The card is kept as it was.` })
    return false
  } finally {
    end(id)
  }
}

/** Save the previewed translation (fields edited meanwhile keep the edit). */
export function savePendingTranslation(id: string, name: string): void {
  const p = usePendingTranslations.getState().byId[id]
  if (!p) return
  const st = useApp.getState()
  const res = applyPendingTranslation(id, p, {
    getCharacter: (cid) => st.characters.find((c) => c.id === cid),
    updateCharacter: (cid, patch) => useApp.getState().updateCharacter(cid, patch),
    getBook: (bid) => useApp.getState().lorebooks.find((b) => b.id === bid),
    updateBook: (bid, patch) => useApp.getState().updateLorebook(bid, patch),
  })
  setPending(id, null)
  if (res.skipped.length) toast.warning(`${name}: translation saved in part`, { description: `Kept as edited: ${res.skipped.join(', ')}.` })
  else toast.success(`${name}: translation saved`)
}

export function discardPendingTranslation(id: string): void {
  setPending(id, null)
}
