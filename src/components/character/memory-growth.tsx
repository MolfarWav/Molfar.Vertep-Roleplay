import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowCounterClockwise, ArrowsClockwise, Check, CircleNotch, DotsThree, PencilSimple, Trash, TrendUp, Warning, X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import type { Character } from '@/lib/types'
import {
  type GrowthEntry,
  type GrowthFields,
  type GrowthKind,
  type GrowthPatch,
  type GrowthSection,
  type GrowthView,
  GROWTH_BASIS_MAX,
  GROWTH_MAX_TOKENS,
  GROWTH_MIN_TOKENS,
  GROWTH_TEXT_MAX,
  GROWTH_TITLE_MAX,
  loadGrowth,
  putGrowth,
} from './memory-api'
import { AddButton, Block } from './memory-block'
import { TokenField } from './memory-token-field'

type T = ReturnType<typeof useT>
/** Runs one change on the server; true when it went through (a failure is already a toast). */
type Act = (patch: GrowthPatch) => Promise<boolean>

export const SECTION_ORDER: GrowthSection[] = ['background', 'relationships', 'personality', 'behaviors', 'goals', 'trauma', 'sexuality', 'other']
const KINDS: GrowthKind[] = ['changed', 'added']

/** A block longer than this is folded behind "Show more" (about six lines at the width the tab has). */
export const FOLD_CHARS = 420
export const FOLD_LINES = 6
export const isLong = (text: string) => text.length > FOLD_CHARS || text.split(/\r?\n/).length > FOLD_LINES

/** The list split the way the block shows it: proposals first, then the accepted ones. */
export function splitGrowth(entries: GrowthEntry[]) {
  return { proposed: entries.filter((e) => e.state === 'proposed'), accepted: entries.filter((e) => e.state !== 'proposed') }
}

/** The accepted blocks under their section, in the portrait's order (the server's list when it sends one); a section nobody knows goes to "other"; empty sections are left out. */
export function groupBySection(accepted: GrowthEntry[], order: readonly string[] = SECTION_ORDER) {
  const known = new Set(order)
  return order
    .map((section) => ({ section, entries: accepted.filter((e) => (known.has(e.section) ? e.section : 'other') === section) }))
    .filter((g) => g.entries.length > 0)
}

/** The accepted block a proposal revises, or null (a new block, or the block is gone). */
export function revisedBlock(e: GrowthEntry, entries: GrowthEntry[]): GrowthEntry | null {
  if (e.state !== 'proposed' || !e.revises) return null
  return entries.find((x) => x.id === e.revises && x.state === 'accepted') ?? null
}

/** A short name of a block for a label read aloud: its title, else the start of its text. */
export const growthLabel = (e: GrowthEntry, max = 50) => {
  const base = (e.title || e.text).trim()
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base
}

/** The body of an edit call: the title only belongs to an "added" block, an empty title or basis is sent as such (the server removes it). */
export const editPatch = (id: string, v: GrowthFields): GrowthPatch => ({
  op: 'edit',
  id,
  section: v.section,
  kind: v.kind,
  title: v.kind === 'added' ? (v.title ?? '').trim() : '',
  text: v.text.trim(),
  basis: (v.basis ?? '').trim(),
})

/** The body of an add call: only what is filled in is sent. */
export const addPatch = (v: GrowthFields): GrowthPatch => {
  const title = v.kind === 'added' ? (v.title ?? '').trim() : ''
  const basis = (v.basis ?? '').trim()
  return { op: 'add', section: v.section, kind: v.kind, text: v.text.trim(), ...(title ? { title } : {}), ...(basis ? { basis } : {}) }
}

const sectionLabel = (t: T, s: string) => t(`mem.grow.sec.${SECTION_ORDER.includes(s as GrowthSection) ? s : 'other'}` as MsgKey)

/** The card's "How they changed" portrait: what an agent proposed and what the user accepted or wrote. Loads and saves on its own
 *  (the agents plugin keeps the file), and every change acts at once, like the rest of the Memory tab. */
export function GrowthBlock({ card }: { card: Character }) {
  const t = useT()
  const [data, setData] = useState<GrowthView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(0)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(() => {
    setLoadError(null)
    loadGrowth(card.id)
      .then((v) => { if (alive.current) setData(v) })
      .catch((e) => { if (alive.current) setLoadError(e instanceof Error && e.message ? e.message : String(e)) })
  }, [card.id])
  useEffect(() => { setData(null); load() }, [load])

  const act: Act = async (patch) => {
    setBusy((n) => n + 1)
    try {
      const v = await putGrowth(card.id, patch)
      if (alive.current) setData(v)
      return true
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : String(e))
      return false
    } finally {
      if (alive.current) setBusy((n) => n - 1)
    }
  }

  if (!data) {
    return (
      <Block tone="sky" icon={TrendUp} title={t('mem.grow')}>
        <div className="flex flex-col gap-3 text-body text-muted-foreground" role="status" data-testid="mem-grow-loading">
          {loadError ? (
            <>
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-foreground">
                <Warning className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
                {t('mem.grow.loadError', { error: loadError })}
              </p>
              <Button variant="outline" size="sm" className="w-fit max-md:h-10" onClick={load}>
                <ArrowsClockwise aria-hidden="true" />{t('mem.retry')}
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-2"><CircleNotch className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t('mem.grow.loading')}</p>
          )}
        </div>
      </Block>
    )
  }
  return <GrowthBody card={card} data={data} t={t} act={act} busy={busy > 0} />
}

/** The block itself, from a loaded list. Split from `GrowthBlock` so it renders without a server. */
export function GrowthBody({ card, data, t, act, busy }: { card: Pick<Character, 'id' | 'name'>; data: GrowthView; t: T; act: Act; busy: boolean }) {
  const [confirm, confirmDialog] = useConfirm()
  // the add form sits under the list; a block being edited opens in a dialog
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<GrowthEntry | null>(null)
  // a switch moves at once; the server's answer settles it, and a failure drops the entry so it springs back
  const [pending, setPending] = useState<Record<string, boolean>>({})

  const { growth, tokens } = data
  const entries = growth.entries
  const { proposed, accepted } = splitGrowth(entries)
  const groups = groupBySection(accepted, data.sections?.length ? data.sections : SECTION_ORDER)
  const none = entries.length === 0

  const setOn = (e: GrowthEntry, on: boolean) => {
    setPending((p) => ({ ...p, [e.id]: on }))
    void act({ op: 'on', id: e.id, on }).finally(() => setPending(({ [e.id]: _gone, ...rest }) => rest))
  }
  const accept = async (e: GrowthEntry) => {
    if (await act({ op: 'accept', id: e.id })) toast.success(t(revisedBlock(e, entries) ? 'mem.grow.updated' : 'mem.grow.accepted'))
  }
  const dismiss = async (e: GrowthEntry) => {
    if (await act({ op: 'delete', id: e.id })) toast.success(t('mem.grow.dismissed'))
  }
  const remove = async (e: GrowthEntry) => {
    const sure = await confirm({ title: t('mem.grow.remove.title'), description: t('mem.grow.remove.text', { block: growthLabel(e, 90), name: card.name }), actionLabel: t('mem.grow.remove.action') })
    if (sure && (await act({ op: 'delete', id: e.id }))) toast.success(t('mem.grow.removed'))
  }
  const revert = async (e: GrowthEntry) => {
    if (await act({ op: 'revert', id: e.id })) toast.success(t('mem.grow.reverted'))
  }
  /** Saves the add form. */
  const add = async (v: GrowthFields) => {
    const ok = await act(addPatch(v))
    if (ok) { setAdding(false); toast.success(t('mem.grow.added')) }
    return ok
  }
  /** Saves the edit dialog; a proposal can be saved and accepted in the same go. */
  const save = async (e: GrowthEntry, v: GrowthFields, thenAccept: boolean) => {
    let ok = await act(editPatch(e.id, v))
    if (ok && thenAccept) ok = await act({ op: 'accept', id: e.id })
    if (ok) { setEditing(null); toast.success(t(thenAccept ? (revisedBlock(e, entries) ? 'mem.grow.updated' : 'mem.grow.accepted') : 'mem.grow.saved')) }
    return ok
  }

  return (
    <Block tone="sky" icon={TrendUp} title={t('mem.grow')} count={accepted.length}>
      <p className="text-caption text-muted-foreground">{t('mem.grow.hint', { name: card.name })}</p>

      {proposed.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2.5" aria-labelledby={`${card.id}-grow-waiting`} data-testid="mem-grow-waiting">
          <header>
            <h4 id={`${card.id}-grow-waiting`} className="flex items-center gap-1.5 text-body font-medium">
              <Warning className="size-4 shrink-0 text-amber-700 dark:text-amber-300" weight="fill" aria-hidden="true" />{t('mem.grow.waiting', { n: proposed.length })}
            </h4>
            <p className="text-caption text-muted-foreground">{t('mem.grow.waiting.hint')}</p>
          </header>
          <ul className="flex flex-col gap-2">
            {proposed.map((e) => {
              const target = revisedBlock(e, entries)
              return (
                <li key={e.id} className="flex flex-col gap-2 rounded-md border border-border bg-card p-2.5" data-testid="mem-grow-proposal">
                  <Chips e={e} t={t} section />
                  {e.title && <span className="break-words text-body font-medium">{e.title}</span>}
                  <FoldText text={e.text} t={t} />
                  {e.basis && <p className="break-words text-caption text-muted-foreground">{t('mem.grow.replaces', { basis: e.basis })}</p>}
                  {target && (
                    <div className="flex flex-col gap-1 rounded-md border border-dashed border-border bg-muted/40 p-2" data-testid="mem-grow-current">
                      <span className="text-caption font-medium text-muted-foreground">{t('mem.grow.current')}</span>
                      <FoldText text={target.text} t={t} muted />
                    </div>
                  )}
                  <span className="break-words text-caption text-muted-foreground">{origin(e, t)}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="max-md:h-10" disabled={busy} onClick={() => void accept(e)}><Check aria-hidden="true" />{t(target ? 'mem.grow.accept.update' : 'mem.grow.accept')}</Button>
                    <Button size="sm" variant="outline" className="max-md:h-10" disabled={busy} onClick={() => setEditing(e)}><PencilSimple aria-hidden="true" />{t('mem.grow.edit')}</Button>
                    <Button size="sm" variant="ghost" className="max-md:h-10" disabled={busy} onClick={() => void dismiss(e)}><X aria-hidden="true" />{t('mem.grow.delete')}</Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {none && !adding ? (
        <Empty className="gap-3 border border-dashed border-border p-5" data-testid="mem-grow-empty">
          <EmptyHeader>
            <EmptyDescription>{t('mem.grow.empty', { name: card.name })}</EmptyDescription>
          </EmptyHeader>
          <AddButton onClick={() => setAdding(true)} label={t('mem.grow.add')} primary />
        </Empty>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.section} className="flex flex-col" aria-labelledby={`${card.id}-grow-sec-${g.section}`} data-testid={`mem-grow-section-${g.section}`}>
              <h4 id={`${card.id}-grow-sec-${g.section}`} className="text-body font-medium">{sectionLabel(t, g.section)}</h4>
              <ul className="flex flex-col">
                {g.entries.map((e) => {
                  const on = pending[e.id] ?? e.on
                  const older = e.prev?.length ?? 0
                  return (
                    <li key={e.id} className="flex items-start gap-3 border-t border-border py-2 first:border-t-0" data-testid="mem-grow-entry">
                      <Switch checked={on} onCheckedChange={(v) => setOn(e, v)} aria-label={t('mem.grow.use', { name: growthLabel(e) })} className="mt-1.5 max-md:mt-3 max-md:after:-inset-y-4" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          {e.title && <span className={`break-words text-body font-medium${on ? '' : ' text-muted-foreground'}`}>{e.title}</span>}
                          <Chips e={e} t={t} />
                        </div>
                        <FoldText text={e.text} t={t} muted={!on} />
                        <span className="break-words text-caption text-muted-foreground">{origin(e, t)}</span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="max-md:size-10" aria-label={t('mem.grow.menu', { name: growthLabel(e) })} />}>
                          <DotsThree className="size-5" weight="bold" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-40">
                          <DropdownMenuItem className="max-md:min-h-10" onClick={() => setEditing(e)}><PencilSimple aria-hidden="true" />{t('mem.grow.edit')}</DropdownMenuItem>
                          {older > 0 && <DropdownMenuItem className="max-md:min-h-10" disabled={busy} onClick={() => void revert(e)}><ArrowCounterClockwise aria-hidden="true" />{t('mem.grow.revert', { n: older })}</DropdownMenuItem>}
                          <DropdownMenuItem className="text-destructive max-md:min-h-10" onClick={() => void remove(e)}><Trash aria-hidden="true" />{t('mem.grow.delete')}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          {adding ? (
            <GrowthForm key="new" t={t} sections={data.sections} initial={{ section: 'personality', kind: 'changed', title: '', text: '', basis: '' }} submitLabel={t('mem.grow.form.add')} onCancel={() => setAdding(false)} onSubmit={(v) => add(v)} />
          ) : (
            <AddButton onClick={() => setAdding(true)} label={t('mem.grow.add')} />
          )}
        </>
      )}

      {!none && (
        <div className="flex flex-col gap-3 border-t border-border pt-3" data-testid="mem-grow-room">
          <label className="flex min-h-8 items-center gap-3 text-body max-md:min-h-10">
            <Switch checked={growth.inject.enabled} onCheckedChange={(v) => void act({ op: 'inject', enabled: v })} aria-label={t('mem.grow.inject.switch')} className="max-md:after:-inset-y-4" />
            {t('mem.grow.inject.switch')}
          </label>
          <TokenField
            id={`mem-grow-budget-${card.id}`}
            label={t('mem.grow.inject.tokens')}
            unit={t('mem.grow.inject.unit')}
            value={growth.inject.maxTokens}
            min={GROWTH_MIN_TOKENS}
            max={GROWTH_MAX_TOKENS}
            step={100}
            onCommit={(v) => act({ op: 'inject', maxTokens: v })}
          />
          <p className="text-caption text-muted-foreground">{t('mem.grow.inject.hint')}</p>
          <p className="text-caption text-muted-foreground" data-testid="mem-grow-cost">
            {growth.inject.enabled ? t('mem.grow.cost', { used: tokens.used, room: tokens.room }) : t('mem.grow.inject.off')}
          </p>
          {growth.inject.enabled && tokens.omitted > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-caption text-foreground" role="status" data-testid="mem-grow-omitted">
              <Warning className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" weight="fill" aria-hidden="true" />
              <span>{t('mem.grow.omitted', { n: tokens.omitted })} {t('mem.grow.omitted.hint')}</span>
            </p>
          )}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null) }}>
        <DialogContent className="sm:max-w-lg" data-testid="mem-grow-edit-dialog">
          <DialogTitle>{t('mem.grow.edit.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('mem.grow.edit.title')}</DialogDescription>
          {editing && (
            <GrowthForm
              key={editing.id}
              t={t}
              sections={data.sections}
              bare
              initial={{ section: editing.section, kind: editing.kind, title: editing.title ?? '', text: editing.text, basis: editing.basis ?? '' }}
              submitLabel={t('mem.grow.form.save')}
              acceptLabel={editing.state === 'proposed' ? t(revisedBlock(editing, entries) ? 'mem.grow.form.saveUpdate' : 'mem.grow.form.saveAccept') : undefined}
              onCancel={() => setEditing(null)}
              onSubmit={(v, thenAccept) => save(editing, v, thenAccept)}
            />
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </Block>
  )
}

const origin = (e: GrowthEntry, t: T) => (e.origin === 'user' ? t('mem.grow.by.user') : e.from?.title ? t('mem.grow.from.chat', { title: e.from.title }) : t('mem.grow.from.agent'))

/** The small tags of a block: its section (in a proposal, where no section heading is above it) and whether it updates the card or adds to it. */
function Chips({ e, t, section }: { e: GrowthEntry; t: T; section?: boolean }) {
  const added = e.kind === 'added'
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {section && <Badge variant="secondary" className="w-fit" data-testid="mem-grow-chip-section">{sectionLabel(t, e.section)}</Badge>}
      <Badge variant="outline" className={`w-fit ${added ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300'}`} data-testid="mem-grow-chip-kind">
        {t(added ? 'mem.grow.kind.added' : 'mem.grow.kind.changed')}
      </Badge>
    </span>
  )
}

/** A paragraph in full; past about six lines it folds behind "Show more" (a button, so it works without hover). */
function FoldText({ text, t, muted }: { text: string; t: T; muted?: boolean }) {
  const [open, setOpen] = useState(false)
  const long = isLong(text)
  return (
    <div className="flex min-w-0 flex-col">
      <p className={`break-words text-body whitespace-pre-line${long && !open ? ' line-clamp-6' : ''}${muted ? ' text-muted-foreground' : ''}`} data-testid="mem-grow-text">{text}</p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 flex min-h-6 w-fit items-center rounded-md px-0.5 text-caption text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-h-10"
        >
          {open ? t('mem.grow.less') : t('mem.grow.more')}
        </button>
      )}
    </div>
  )
}

/** The form for one block: add (under the list) and edit (in the dialog). It is not a <form>: Enter makes a new line in the text,
 *  Ctrl+Enter or the button saves, Esc cancels. A proposal can also be saved and accepted at once (`acceptLabel`). */
export function GrowthForm({ t, sections, initial, submitLabel, acceptLabel, onCancel, onSubmit, bare }: { t: T; sections?: readonly string[]; initial: GrowthFields; submitLabel: string; acceptLabel?: string; onCancel: () => void; onSubmit: (v: GrowthFields, thenAccept: boolean) => Promise<boolean>; bare?: boolean }) {
  const uid = useId()
  const [v, setV] = useState<GrowthFields>(initial)
  const [busy, setBusy] = useState(false)
  const missing = !v.text.trim()
  const list = (sections?.length ? sections : SECTION_ORDER) as GrowthSection[]
  const submit = async (thenAccept: boolean) => {
    if (missing || busy) return
    setBusy(true)
    try { await onSubmit(v, thenAccept) } finally { setBusy(false) }
  }
  const keys = (e: React.KeyboardEvent, multi: boolean) => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
    else if (e.key === 'Enter' && (!multi || e.ctrlKey || e.metaKey)) { e.preventDefault(); if (e.ctrlKey || e.metaKey) void submit(false) }
  }
  return (
    <div className={bare ? 'flex flex-col gap-3' : 'flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-2.5'} data-testid="mem-grow-form">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-caption font-medium">
          {t('mem.grow.form.section')}
          <Select value={v.section} onValueChange={(x) => x && setV({ ...v, section: String(x) as GrowthSection })}>
            <SelectTrigger className="w-full max-md:h-10" data-testid="mem-grow-select-section"><SelectValue /></SelectTrigger>
            <SelectContent>
              {list.map((s) => <SelectItem key={s} value={s} className="max-md:min-h-10">{sectionLabel(t, s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium">
          {t('mem.grow.form.kind')}
          <Select value={v.kind} onValueChange={(x) => x && setV({ ...v, kind: String(x) as GrowthKind })}>
            <SelectTrigger className="w-full max-md:h-10" data-testid="mem-grow-select-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => <SelectItem key={k} value={k} className="max-md:min-h-10">{t(`mem.grow.kind.${k}` as MsgKey)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      </div>
      {v.kind === 'added' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-title`} className="text-caption font-medium">{t('mem.grow.form.title')}</label>
          <Input id={`${uid}-title`} value={v.title ?? ''} maxLength={GROWTH_TITLE_MAX} placeholder={t('mem.grow.form.title.ph')} className="max-md:h-10" onChange={(e) => setV({ ...v, title: e.target.value })} onKeyDown={(e) => keys(e, false)} />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-text`} className="text-caption font-medium">{t('mem.grow.form.text')}</label>
        <Textarea
          id={`${uid}-text`}
          value={v.text}
          rows={5}
          maxLength={GROWTH_TEXT_MAX}
          placeholder={t('mem.grow.form.text.ph')}
          className="min-h-28 text-body"
          onChange={(e) => setV({ ...v, text: e.target.value })}
          onKeyDown={(e) => keys(e, true)}
        />
        <span className="flex flex-wrap justify-between gap-x-3 text-caption text-muted-foreground">
          <span>{t('mem.grow.form.text.hint')}</span>
          <span className="tabular-nums" aria-live="polite">{t('mem.grow.form.count', { n: v.text.length, max: GROWTH_TEXT_MAX })}</span>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-basis`} className="text-caption font-medium">{t('mem.grow.form.basis')}</label>
        <Input id={`${uid}-basis`} value={v.basis ?? ''} maxLength={GROWTH_BASIS_MAX} placeholder={t('mem.grow.form.basis.ph')} className="max-md:h-10" onChange={(e) => setV({ ...v, basis: e.target.value })} onKeyDown={(e) => keys(e, false)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="max-md:h-10" disabled={missing || busy} onClick={() => void submit(false)}>{submitLabel}</Button>
        {acceptLabel && <Button size="sm" variant="outline" className="max-md:h-10" disabled={missing || busy} onClick={() => void submit(true)}>{acceptLabel}</Button>}
        <Button size="sm" variant="outline" className="max-md:h-10" disabled={busy} onClick={onCancel}>{t('home.cancel')}</Button>
        {missing && <span className="text-caption text-muted-foreground">{t('mem.grow.form.need')}</span>}
      </div>
    </div>
  )
}
