// The "Soul" tab of the character editor. It keeps a working copy of the card's
// souls; "Save soul" writes the selected one (and locks its traits and spectra),
// a proposal from the plugin or from Molfar is overlaid onto the copy for review. Contract:
// docs/SOUL.md. The tab stays mounted while the editor shows other tabs, so an
// unsaved copy survives a tab switch.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleNotch, Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { ApiError, j } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { askMolfar, canAskMolfar } from '@/lib/shell-bridge'
import {
  MAX_ALIASES, clampSoul, cleanNames, minorOf, molfarDraftText, soulsOf, stableJson, validSoulName, withMinor, withSouls,
  type Soul, type SoulClass, type SoulDraft, type SoulMap,
} from '@/lib/soul'
import type { Character } from '@/lib/types'
import { cn } from '@/lib/utils'
import { SoulForm, type VocabEvent } from './soul-form'
import { SoulGuests } from './soul-guests'
import type { Effect } from './effect-text'

const CLASS_COLORS: Record<SoulClass, string> = {
  romantic: '#d4577f', ally: '#5fae86', neutral: '#8b8478', hostile: '#c9545a',
}
const POLL_MS = 5000
const MOLFAR_WINDOW_MS = 10 * 60_000

const has = (o: object, k: string) => Object.hasOwn(o, k)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const errMsg = (e: unknown) => String((e as Error)?.message ?? e)

function normalizeDraft(raw: unknown): SoulDraft | null {
  if (!isObj(raw)) return null
  const characters: SoulMap = {}
  if (isObj(raw.characters)) {
    for (const [name, soul] of Object.entries(raw.characters)) {
      if (validSoulName(name) && isObj(soul)) characters[name] = soul as Soul
    }
  }
  return { ...(raw as object), characters, minor: cleanNames(raw.minor) } as SoulDraft
}

export function SoulTab({ c, active, onPending }: { c: Character; active: boolean; onPending?: (pending: boolean) => void }) {
  const t = useT()
  const updateCharacter = useApp((s) => s.updateCharacter)
  const lorebooks = useApp((s) => s.lorebooks)
  const chats = useApp((s) => s.chats)
  const [confirm, confirmDialog] = useConfirm()

  const extras = c.cardExtras
  const saved = useMemo(() => soulsOf({ cardExtras: extras }), [extras])
  const minor = useMemo(() => minorOf({ cardExtras: extras }), [extras])
  const savedKey = stableJson(saved)
  const [work, setWork] = useState<SoulMap>(saved)
  const prevSaved = useRef<SoulMap>(saved)
  const edited = useRef(new Set<string>())
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set())
  const [proposedNames, setProposedNames] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const [draft, setDraft] = useState<SoulDraft | null>(null)
  const [guests, setGuests] = useState<string[]>([])
  const [seen, setSeen] = useState<string[]>([])
  const [events, setEvents] = useState<VocabEvent[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [rating, setRating] = useState(false)
  const [askedUntil, setAskedUntil] = useState(0)
  const [effects, setEffects] = useState<Effect[] | null>(null)
  const effectsReq = useRef(0)

  // a soul is unsaved when its working copy differs from the saved one
  const dirtyOf = (name: string) => has(work, name) && stableJson(work[name]) !== stableJson(saved[name])
  const dirtyNames = Object.keys(work).filter(dirtyOf)

  // the card changed under us (an import, an accepted proposal, the same card in
  // another tab): every soul without edits in progress follows it
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs only when the saved souls change; `saved` is read as it is at that moment
  useEffect(() => {
    const before = prevSaved.current
    prevSaved.current = saved
    setWork((w) => {
      const next = { ...w }
      for (const name of new Set([...Object.keys(before), ...Object.keys(saved)])) {
        if (stableJson(w[name]) !== stableJson(before[name])) continue // edits in progress stay
        const now = saved[name]
        if (now) next[name] = now
        else delete next[name]
      }
      return next
    })
  }, [savedKey])

  useEffect(() => {
    if (!dirtyNames.length) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirtyNames.length])

  // ── data from the plugin ──
  const loadDraft = useCallback(async () => {
    try {
      const r = await j<{ draft?: unknown }>(`/dashboard/soul-draft?characterId=${encodeURIComponent(c.id)}`)
      setDraft(normalizeDraft(r.draft))
      setUnavailable(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setUnavailable(true)
    }
  }, [c.id])

  const loadGuests = useCallback(async () => {
    try {
      const r = await j<{ guests?: unknown[]; seen?: unknown[] }>(`/dashboard/guests?characterId=${encodeURIComponent(c.id)}`)
      const names = (list: unknown[] | undefined) => (Array.isArray(list) ? list : [])
        .map((g) => (typeof g === 'string' ? g : isObj(g) && typeof g.name === 'string' ? g.name : ''))
        .filter((g) => validSoulName(g))
      setGuests(names(r.guests))
      setSeen(names(r.seen))
    } catch { /* the plugin is missing: loadDraft reports it */ }
  }, [c.id])

  useEffect(() => {
    void loadDraft()
    void loadGuests()
    void j<{ events?: VocabEvent[] }>('/dashboard/config')
      .then((r) => setEvents(Array.isArray(r.events)
        ? r.events.filter((e) => e && typeof e.id === 'string').map((e) => ({ id: e.id, family: String(e.family ?? ''), meaning: e.meaning }))
        : null))
      .catch(() => setEvents(null))
  }, [loadDraft, loadGuests])

  // looking at the tab again: the proposal may have arrived meanwhile
  useEffect(() => { if (active) { void loadDraft(); void loadGuests() } }, [active, loadDraft, loadGuests])

  // poll the proposal while a rating runs, or within 10 minutes of "Rate with Molfar"
  useEffect(() => {
    if (!active || unavailable) return
    if (!rating && Date.now() >= askedUntil) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (!rating && Date.now() >= askedUntil) { clearInterval(id); return }
      void loadDraft()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [active, unavailable, rating, askedUntil, loadDraft])

  const pending = !!draft && !draft.dismissedAt && !draft.error && Object.keys(draft.characters).length > 0
  const failed = !!draft && !draft.dismissedAt && !!draft.error
  const pendingNames = pending && draft ? Object.keys(draft.characters) : []
  useEffect(() => { onPending?.(pending) }, [pending, onPending])

  const workNames = Object.keys(work)
  const chipNames = [...workNames, ...pendingNames.filter((n) => !has(work, n))]
  const selName = selected && has(work, selected) ? selected : workNames[0] ?? null
  const selSoul = selName ? (work[selName] ?? null) : null
  const selKey = selSoul ? stableJson(selSoul) : ''
  const lockedNow = selName !== null && !!selSoul && selSoul.locked === true && !unlocked.has(selName)
  const isEmpty = chipNames.length === 0
  const selDirty = selName !== null && dirtyOf(selName)

  // ── effects of the selected soul ──
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key of the selected soul stands for its content
  useEffect(() => {
    if (!selSoul || unavailable || !active) { if (!selSoul || unavailable) setEffects(null); return }
    const id = ++effectsReq.current
    const h = setTimeout(() => {
      j<{ effects?: Effect[] }>('/dashboard/soul/effects', { method: 'POST', body: JSON.stringify({ soul: clampSoul(selSoul) }) })
        .then((r) => { if (id === effectsReq.current) setEffects(Array.isArray(r.effects) ? r.effects : null) })
        .catch(() => { if (id === effectsReq.current) setEffects(null) })
    }, 300)
    return () => clearTimeout(h)
  }, [selKey, unavailable, active])

  // ── working copy ──
  const patchSoul = (name: string, fn: (s: Soul) => Soul) => {
    edited.current.add(name)
    setWork((w) => ({ ...w, [name]: fn(w[name] ?? {}) }))
  }

  const addSoul = (raw: string) => {
    const name = raw.trim()
    setAdding(false)
    setNewName('')
    if (!name || !validSoulName(name)) return
    if (!has(work, name)) {
      edited.current.add(name)
      setWork((w) => ({ ...w, [name]: {} }))
    }
    setSelected(name)
  }

  const overlay = (w: SoulMap, names = pendingNames): SoulMap => {
    if (!draft) return w
    const next = { ...w }
    for (const name of names) {
      if (proposedNames.includes(name) && has(w, name)) continue // already overlaid, maybe edited since
      const proposal = draft.characters[name]
      if (proposal) next[name] = { ...proposal, ratedBy: draft.by === 'molfar' ? 'molfar' : 'auto' }
    }
    return next
  }

  const review = () => {
    setWork((w) => overlay(w))
    setProposedNames(pendingNames)
    if (!selName && pendingNames[0]) setSelected(pendingNames[0])
  }

  /** The soul as it is written to the card: in range, locked, signed by who set it. */
  const finalize = (name: string, soul: Soul): Soul => {
    const out = clampSoul({ ...soul })
    out.locked = true
    if (edited.current.has(name) || !out.ratedBy) out.ratedBy = 'user'
    return out
  }

  const forget = (names: string[]) => {
    for (const n of names) edited.current.delete(n)
    setUnlocked((u) => { const next = new Set(u); for (const n of names) next.delete(n); return next })
    setProposedNames((p) => p.filter((n) => !names.includes(n)))
  }

  const dropDraft = async (accepted: boolean, name?: string) => {
    const q = `characterId=${encodeURIComponent(c.id)}${accepted ? '&accepted=1' : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}`
    try {
      await j(`/dashboard/soul-draft?${q}`, { method: 'DELETE' })
    } catch (e) { toast.error(errMsg(e)) }
    await Promise.all([loadDraft(), loadGuests()])
  }

  /** Save soul: only the selected character goes into the card; the other edits stay unsaved. */
  const saveOne = async () => {
    if (!selName || !selSoul) return
    const name = selName
    const soul = finalize(name, selSoul)
    updateCharacter(c.id, withSouls(c, { ...saved, [name]: soul }))
    setWork((w) => ({ ...w, [name]: soul }))
    forget([name])
    toast.success(t('soul.saved'))
    if (pendingNames.includes(name)) await dropDraft(true, name)
  }

  /** Accept all: every proposed soul and the proposal's minor names go into the card. */
  const acceptAll = async () => {
    if (!draft) return
    const merged: SoulMap = { ...saved }
    for (const name of pendingNames) {
      const base = proposedNames.includes(name) && has(work, name)
        ? work[name]!
        : { ...draft.characters[name], ratedBy: draft.by === 'molfar' ? 'molfar' : 'auto' } as Soul
      merged[name] = finalize(name, base)
    }
    const withS = withSouls(c, merged)
    updateCharacter(c.id, withMinor({ cardExtras: withS.cardExtras }, [...minor, ...(draft.minor ?? [])]))
    setWork((w) => ({ ...w, ...Object.fromEntries(pendingNames.map((n) => [n, merged[n]!])) }))
    forget(pendingNames)
    toast.success(t('soul.saved'))
    await dropDraft(true)
  }

  const dismiss = async () => {
    setWork((w) => {
      const next = { ...w }
      for (const name of proposedNames) {
        const old = saved[name]
        if (old) next[name] = old
        else delete next[name]
        edited.current.delete(name)
      }
      return next
    })
    setProposedNames([])
    await dropDraft(false)
  }

  const removeSoul = async () => {
    if (!selName) return
    const yes = await confirm({
      title: t('soul.deleteTitle', { name: selName }),
      description: t('soul.deleteBody'),
      actionLabel: t('soul.delete'),
    })
    if (!yes) return
    if (has(saved, selName)) {
      const { [selName]: _gone, ...rest } = saved
      updateCharacter(c.id, withSouls(c, rest))
      toast.success(t('soul.deleted'))
    }
    forget([selName])
    setWork((w) => { const next = { ...w }; delete next[selName]; return next })
    setSelected(null)
  }

  const unlock = async () => {
    if (!selName) return
    const yes = await confirm({ title: t('soul.editTitle'), description: t('soul.editWarn'), actionLabel: t('soul.edit') })
    if (yes) setUnlocked((u) => new Set(u).add(selName))
  }

  // ── rating ──
  const rateNow = async () => {
    setRating(true)
    try {
      await j('/dashboard/soul/rate', { method: 'POST', body: JSON.stringify({ characterId: c.id }) })
      await loadDraft()
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setUnavailable(true)
      else toast.error(errMsg(e))
    } finally {
      setRating(false)
    }
  }

  const rateWithMolfar = async () => {
    const withoutSoul = [...new Set([...guests, ...seen.filter((n) => !has(work, n))])].filter((n) => !minor.some((m) => m.toLowerCase() === n.toLowerCase()))
    // chats carry no lorebook list in the store: the card's own books plus the global ones
    // are what the engine scans for every chat of this card
    const books = [...new Set([
      ...(c.embeddedLorebookId ? [c.embeddedLorebookId] : []),
      ...c.linkedLorebookIds,
      ...lorebooks.filter((b) => b.globalActive).map((b) => b.id),
    ])]
    const chatIds = chats
      .filter((ch) => ch.characterId === c.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3)
      .map((ch) => ch.id)
    const text = molfarDraftText({ character: c, names: withoutSoul, lorebookIds: books, chatIds })
    try {
      if (canAskMolfar()) {
        await askMolfar(text)
      } else {
        await navigator.clipboard.writeText(text)
        toast.success(t('soul.copied'))
      }
      setAskedUntil(Date.now() + MOLFAR_WINDOW_MS)
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  const taken = new Set([
    ...Object.keys(work), ...pendingNames, ...minor,
    ...Object.values(work).flatMap((sl) => (Array.isArray(sl.aliases) ? sl.aliases : [])),
  ].map((n) => String(n).toLowerCase()))
  const shownGuests = guests.filter((g) => !taken.has(g.toLowerCase()))

  const giveSoul = (name: string) => {
    edited.current.add(name)
    setWork((w) => (has(w, name) ? w : { ...w, [name]: {} }))
    setSelected(name)
  }
  const sameAs = (name: string, target: string) => {
    patchSoul(target, (sl) => ({ ...sl, aliases: cleanNames([...(Array.isArray(sl.aliases) ? sl.aliases : []), name]).slice(0, MAX_ALIASES) }))
    setSelected(target)
  }
  const hide = (name: string) => updateCharacter(c.id, withMinor(c, [...minor, name]))
  const unhide = (name: string) => updateCharacter(c.id, withMinor(c, minor.filter((m) => m !== name)))

  const rateButtons = (
    <>
      <Button variant="outline" size="sm" className="rounded-none" disabled={rating || unavailable} onClick={() => void rateNow()}>
        {rating && <CircleNotch className="animate-spin" aria-hidden="true" />}
        {rating ? t('soul.rating') : t('soul.rateNow')}
      </Button>
      <Button variant="outline" size="sm" className="rounded-none" onClick={() => void rateWithMolfar()}>{t('soul.rateMolfar')}</Button>
    </>
  )

  const addControl = adding ? (
    <Input
      autoFocus
      value={newName}
      maxLength={60}
      placeholder={t('soul.addName')}
      aria-label={t('soul.addName')}
      className="h-7 w-40 rounded-none text-xs md:text-xs"
      onChange={(e) => setNewName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') addSoul(newName)
        else if (e.key === 'Escape') { setAdding(false); setNewName('') }
      }}
      onBlur={() => addSoul(newName)}
    />
  ) : null

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {unavailable && <p className="text-xs text-muted-foreground">{t('soul.pluginMissing')}</p>}

      {/* banners: a proposal, or its failure; then guests */}
      {pending && draft && (
        <div className="flex flex-col gap-2 border border-amber-500/50 bg-amber-500/10 p-3 text-xs" role="status">
          <div>
            <b>{t(draft.by === 'molfar' ? 'soul.proposalMolfar' : 'soul.proposalAuto')}</b>{' '}
            {t('soul.proposalFor', { names: pendingNames.join(', ') })}
            {draft.note && <p className="mt-1 whitespace-pre-wrap break-words text-foreground/80">{draft.note}</p>}
            <p className="mt-1 text-muted-foreground">{t('soul.proposalUsed')}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" className="rounded-none" onClick={review} disabled={pendingNames.every((n) => proposedNames.includes(n))}>{t('soul.review')}</Button>
            <Button size="sm" className="rounded-none" onClick={() => void acceptAll()}>{t('soul.acceptAll')}</Button>
            <Button variant="ghost" size="sm" className="rounded-none" onClick={() => void dismiss()}>{t('soul.dismiss')}</Button>
          </div>
        </div>
      )}
      {failed && draft && (
        <div className="flex flex-wrap items-center gap-2 border border-destructive/50 bg-destructive/10 p-3 text-xs" role="alert">
          <span className="min-w-0 flex-1 break-words"><b>{t('soul.ratingFailed')}</b> {draft.error}</span>
          <Button variant="outline" size="sm" className="rounded-none" disabled={rating || unavailable} onClick={() => void rateNow()}>{t('soul.retry')}</Button>
        </div>
      )}
      <SoulGuests guests={shownGuests} soulNames={Object.keys(work)} minor={minor} onGive={giveSoul} onSame={sameAs} onHide={hide} onUnhide={unhide} />

      {isEmpty ? (
        <div className="flex flex-col items-start gap-2 border border-dashed border-border p-4">
          <p className="max-w-prose text-xs text-muted-foreground">{t('soul.empty')}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {rateButtons}
            {addControl ?? (
              <Button variant="outline" size="sm" className="rounded-none" onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" />{t('soul.addByHand')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('soul.chars')}>
          {chipNames.map((name) => {
            const inWork = has(work, name)
            const inDraft = pendingNames.includes(name)
            const overlaid = proposedNames.includes(name)
            const cls = (inWork ? work[name]?.class : draft?.characters[name]?.class) ?? 'neutral'
            const proposed = overlaid || (inDraft && !inWork)
            const on = name === selName
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => { if (!inWork) review(); setSelected(name) }}
                className={cn(
                  'flex items-center gap-1.5 border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  on ? 'border-primary bg-primary/15' : 'border-border hover:bg-muted',
                  proposed && 'border-dashed',
                )}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: CLASS_COLORS[cls as SoulClass] ?? CLASS_COLORS.neutral }} aria-hidden="true" />
                <span className="max-w-40 truncate">{name}</span>
                {proposed && <span className="text-[10px] text-amber-600 dark:text-amber-400">{t('soul.proposed')}</span>}
                {inWork && dirtyOf(name) && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title={t('soul.unsavedDot')} role="img" aria-label={t('soul.unsavedDot')} />}
                {inDraft && has(saved, name) && <span className="text-[10px] text-muted-foreground">{t('soul.replaces')}</span>}
              </button>
            )
          })}
          {addControl ?? (
            <Button variant="ghost" size="sm" className="rounded-none" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />{t('soul.add')}
            </Button>
          )}
        </div>
      )}

      {/* actions */}
      {!isEmpty && (
        <div className="flex flex-wrap items-center gap-1.5">
          {!isEmpty && rateButtons}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {lockedNow && (
              <Button variant="outline" size="sm" className="rounded-none" onClick={() => void unlock()}>{t('soul.edit')}</Button>
            )}
            {selName && (
              <Button variant="ghost" size="sm" className="rounded-none text-destructive" onClick={() => void removeSoul()}>
                <Trash aria-hidden="true" />{t('soul.delete')}
              </Button>
            )}
            {selDirty && <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><span aria-hidden="true">●</span>{t('soul.unsaved')}</span>}
            <Button size="sm" className="rounded-none" disabled={!selDirty} onClick={() => void saveOne()}>{t('soul.save')}</Button>
          </div>
        </div>
      )}

      {selSoul && selName ? (
        <SoulForm
          key={selName}
          soul={selSoul}
          locked={lockedNow}
          events={events}
          effects={effects}
          onChange={(fn) => patchSoul(selName, fn)}
        />
      ) : !isEmpty ? (
        <p className="text-xs text-muted-foreground">{t('soul.noSoulSelected')}</p>
      ) : null}

      {confirmDialog}
    </div>
  )
}
