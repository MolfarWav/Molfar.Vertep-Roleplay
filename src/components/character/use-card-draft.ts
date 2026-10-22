import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import type { Character } from '@/lib/types'
import { FIELD_LABEL, changedPanels, effectivePatch, mergeDraft, sameValue, conflictLabels, type CardPatch } from '@/lib/card-draft'
import { setLeaveGuard } from '@/lib/leave-guard'
import type { DraftPrompt } from '@/components/character/draft-dialogs'

/** A change held beside the card's fields that the same Save writes (the card's model choice, #104). */
export interface SideDraft {
  dirty: boolean
  /** Shown in the list of unsaved changes. */
  label: string
  /** The editor panel it belongs to (a dot on that tab). */
  panel: string
  save: () => Promise<boolean>
  discard: () => void
}

/**
 * The card editor's working copy (GitHub #103). `up(patch)` changes the draft only; nothing reaches the
 * card until `saveNow`. The card shown is the stored one with the draft laid over it. A draft that
 * meets a card changed in the meantime (Molfar, the Soul tab, sync) asks which side to keep.
 */
export function useCardDraft(character: Character, opts: { frozen: boolean; side?: SideDraft | null }) {
  const t = useT()
  const updateCharacter = useApp((s) => s.updateCharacter)
  const [draft, setDraft] = useState<CardPatch>({})
  const draftRef = useRef<CardPatch>({})
  /** The card as it was when the draft began: what "changed" is measured against. */
  const baseRef = useRef<Character | null>(null)
  const characterRef = useRef(character)
  characterRef.current = character
  const sideRef = useRef(opts.side ?? null)
  sideRef.current = opts.side ?? null
  const frozenRef = useRef(opts.frozen)
  frozenRef.current = opts.frozen
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [prompt, setPromptState] = useState<DraftPrompt | null>(null)
  const promptRef = useRef<DraftPrompt | null>(null)
  const setPrompt = (p: DraftPrompt | null) => { promptRef.current = p; setPromptState(p) }
  const conflictResolve = useRef<((ok: boolean) => void) | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  const effective = useMemo(() => effectivePatch(baseRef.current ?? character, draft), [draft, character])
  const sideDirty = !!opts.side?.dirty
  const count = Object.keys(effective).length + (sideDirty ? 1 : 0)
  const dirty = count > 0
  const labels = useMemo(() => {
    const out = (Object.keys(effective) as (keyof Character)[]).map((k) => FIELD_LABEL[k] ?? String(k))
    if (sideDirty && opts.side) out.push(opts.side.label)
    return out
  }, [effective, sideDirty, opts.side])
  const panels = useMemo(() => {
    const p = changedPanels(baseRef.current ?? character, draft)
    if (sideDirty && opts.side) p.add(opts.side.panel)
    return p
  }, [draft, character, sideDirty, opts.side])

  /** Read at any moment (the store asks while a state change is still on its way to a render). */
  const dirtyNow = useCallback(() => {
    const base = baseRef.current ?? characterRef.current
    return Object.keys(effectivePatch(base, draftRef.current)).length > 0 || !!sideRef.current?.dirty
  }, [])

  const c: Character = useMemo(() => ({ ...character, ...draft }), [character, draft])
  const cRef = useRef(c)
  cRef.current = c

  const up = useCallback((patch: CardPatch) => {
    if (frozenRef.current) return
    if (!baseRef.current) baseRef.current = characterRef.current
    draftRef.current = { ...draftRef.current, ...patch }
    setDraft(draftRef.current)
  }, [])

  const clearAll = () => {
    draftRef.current = {}
    baseRef.current = null
    setDraft({})
  }

  /** Drops what was written from the draft; an edit made while the save ran stays. */
  const settle = (snapshot: CardPatch) => {
    const left: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(draftRef.current)) {
      if (k in snapshot && sameValue((snapshot as Record<string, unknown>)[k], v)) continue
      left[k] = v
    }
    draftRef.current = left as CardPatch
    setDraft(draftRef.current)
    baseRef.current = Object.keys(left).length ? (useApp.getState().characters.find((x) => x.id === character.id) ?? characterRef.current) : null
  }

  const flash = () => {
    setSavedFlash(true)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setSavedFlash(false), 2500)
  }

  /** Writes `patch` once (and the side change), then clears the draft. Resolves false when the engine refused. */
  const commit = (patch: CardPatch): Promise<boolean> => new Promise((resolve) => {
    const snapshot = draftRef.current
    savingRef.current = true
    setSaving(true)
    const finish = async (stored: boolean) => {
      let ok = stored
      if (ok && sideRef.current?.dirty) ok = await sideRef.current.save()
      savingRef.current = false
      setSaving(false)
      if (ok) { settle(snapshot); flash() } else toast.error(t('cd.failed'))
      resolve(ok)
    }
    if (Object.keys(patch).length === 0) { void finish(true); return }
    updateCharacter(character.id, patch, (stored) => { void finish(stored) })
  })

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false
    // the card as the engine has it now: a change made a moment ago (Molfar, another tab) must be seen
    try { await useApp.getState().refreshCharacter(character.id) } catch { /* offline: compare with what is held */ }
    const base = baseRef.current ?? characterRef.current
    const stored = useApp.getState().characters.find((x) => x.id === character.id) ?? characterRef.current
    const m = mergeDraft(base, stored, draftRef.current)
    if (!Object.keys(m.conflicting).length) return commit(m.patch)
    return await new Promise<boolean>((resolve) => {
      conflictResolve.current = resolve
      const done = (patch: CardPatch) => { conflictResolve.current = null; setPrompt(null); void commit(patch).then(resolve) }
      setPrompt({ kind: 'conflict', labels: conflictLabels(m), keep: () => done({ ...m.patch, ...m.conflicting }), theirs: () => done(m.patch) })
    })
  }, [character.id])

  const discard = useCallback(() => {
    clearAll()
    sideRef.current?.discard()
  }, [])

  const closePrompt = () => {
    if (promptRef.current?.kind === 'conflict') { conflictResolve.current?.(false); conflictResolve.current = null }
    setPrompt(null)
  }

  const saveThen = async (then: () => void) => {
    const ok = await saveNow()
    if (!ok) return
    setPrompt(null)
    then()
  }
  const discardThen = (then: () => void) => {
    discard()
    setPrompt(null)
    then()
  }

  /** Runs `run` on the saved card: straight away when nothing is unsaved, else after the user decides. */
  const withSavedCard = (label: string, run: () => void) => {
    if (!dirtyNow()) { run(); return }
    setPrompt({ kind: 'action', label, run })
  }

  // leaving the card (another section or card, a chat, the drawer closing) asks first
  useEffect(() => setLeaveGuard({ dirty: dirtyNow, ask: (go) => setPrompt({ kind: 'leave', go }) }), [dirtyNow])

  // a page reload or a closed tab: the browser's own question
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  return { c, cRef, up, dirty, dirtyNow, count, labels, panels, saving, savedFlash, saveNow, discard, prompt, closePrompt, saveThen, discardThen, withSavedCard }
}
