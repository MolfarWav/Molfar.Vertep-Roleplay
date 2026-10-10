import { toast } from 'sonner'
import { create } from 'zustand'
import { j } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { applyPendingTranslation, translateInstalled, type PendingTranslation, type Translator } from '@/lib/card-translate'
import type { AppSettings } from '@/lib/types'

/** The glue between card-translate.ts and the running app: one request to the
 *  app's translator (provider and DeepL key from the translation settings),
 *  and a pass over a character in the library with progress and result toasts.
 *  Used by the Store (install translated) and the character editor. */

export type TranslationSettings = AppSettings['translation']

export function makeTranslator(target: string, translation: TranslationSettings): Translator {
  return async (text) => {
    const r = await j<{ text: string }>('/translate', {
      method: 'POST',
      body: JSON.stringify({ text, target, provider: translation.provider, deeplKey: translation.deeplKey }),
    })
    return r.text
  }
}

/** Characters with a pass running, so a second one is not started. */
const running = new Set<string>()
export const isTranslating = (id: string): boolean => running.has(id)

/** Translate a character (and its embedded lorebook) in the library. Never
 *  throws: the card stays as it is whatever happens, and the toasts say what
 *  was not translated. */
export async function translateCharacter(
  id: string,
  name: string,
  opts: { target: string; translation: TranslationSettings; onOpen?: () => void },
): Promise<void> {
  if (running.has(id)) return
  running.add(id)
  const tid = toast.loading(`Translating ${name}…`)
  const st = () => useApp.getState()
  try {
    const res = await translateInstalled(id, {
      translate: makeTranslator(opts.target, opts.translation),
      getCharacter: (cid) => st().characters.find((c) => c.id === cid),
      updateCharacter: (cid, patch) => st().updateCharacter(cid, patch),
      getBook: (bid) => st().lorebooks.find((b) => b.id === bid),
      updateBook: (bid, patch) => st().updateLorebook(bid, patch),
      progress: (done, total) => { toast.loading(`Translating ${name}: ${done}/${total}`, { id: tid }) },
    }, { target: opts.target, provider: opts.translation.provider || 'llm', at: new Date().toISOString() })
    if (res.unchanged) {
      toast.warning(`${name} is already in ${opts.target}`, { id: tid, description: 'Nothing changed. Pick another language to translate to.' })
    } else if (res.notTranslated.length) {
      toast.warning(`${name} is only partly translated`, { id: tid, description: `Not translated: ${res.notTranslated.join(', ')}. What was translated is saved.` })
    } else {
      toast.success(`${name} translated to ${opts.target}`, { id: tid, ...(opts.onOpen ? { action: { label: 'Open', onClick: opts.onOpen } } : {}) })
    }
  } catch (e) {
    toast.error(`Couldn't translate ${name}`, { id: tid, description: `${String((e as Error).message ?? e)} The card is kept as it was.` })
  } finally {
    running.delete(id)
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
  running.add(id)
  const tid = toast.loading(`Translating ${name}…`)
  const st = () => useApp.getState()
  try {
    const res = await translateInstalled(id, {
      translate: makeTranslator(opts.target, opts.translation),
      getCharacter: (cid) => st().characters.find((c) => c.id === cid),
      updateCharacter: () => {},
      getBook: (bid) => st().lorebooks.find((b) => b.id === bid),
      updateBook: () => {},
      progress: (done, total) => { toast.loading(`Translating ${name}: ${done}/${total}`, { id: tid }) },
    }, { target: opts.target, provider: opts.translation.provider || 'llm', at: new Date().toISOString() }, { apply: false })
    if (res.unchanged) {
      toast.warning(`${name} is already in ${opts.target}`, { id: tid, description: 'Nothing changed. Pick another language to translate to.' })
      return false
    }
    if (!res.pending || !(res.pending.cardAnswers.some(Boolean) || res.pending.bookAnswers.some(Boolean))) {
      toast.error(`Couldn't translate ${name}`, { id: tid, description: `Not translated: ${res.notTranslated.join(', ') || 'everything'}. The card is kept as it was.` })
      return false
    }
    toast.dismiss(tid)
    if (res.notTranslated.length) toast.warning(`${name}: part of the card was not translated`, { description: `Not translated: ${res.notTranslated.join(', ')}.` })
    setPending(id, res.pending)
    return true
  } catch (e) {
    toast.error(`Couldn't translate ${name}`, { id: tid, description: `${String((e as Error).message ?? e)} The card is kept as it was.` })
    return false
  } finally {
    running.delete(id)
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
