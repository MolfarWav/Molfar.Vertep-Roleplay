// The Records tab: the world book of one chat, readable and editable by hand. Behind the same
// spoiler question as "Look at the world" (once per visit to the tab). The DM keeps editing the
// records too; a record you write or change is marked "by you".

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowCounterClockwise, Archive, CircleNotch, MagnifyingGlass, PencilSimple, PushPin, Plus, Trash, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import { ApiError } from '@/lib/engine'
import { cn } from '@/lib/utils'
import { countByKind, filterRecords, KINDS, parseAliases, TEXT_LIMIT } from '@/lib/world-records'
import { editWorldRecord, fillWorldKeys, peekWorld, useWorldLive, type WorldKind, type WorldRecord, type WorldRecordOp } from '@/lib/world'
import type { MsgKey } from '@/lib/i18n'
import { KIND_TONE } from './world-common'

export function KindChip({ kind, className }: { kind: WorldKind; className?: string }) {
  const t = useT()
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none', KIND_TONE[kind], className)}>
      {t(`world.kind.${kind}` as MsgKey)}
    </span>
  )
}

interface Form {
  name: string
  kind: WorldKind
  aliases: string[]
  text: string
  /** a place: a spot of the place named in `inside`, else a whole place */
  spot: boolean
  inside: string
  /** a thing: lying in `place`, held by `holder`, or neither */
  where: 'place' | 'holder' | 'none'
  place: string
  holder: string
}

const formOf = (r: Pick<WorldRecord, 'name' | 'kind' | 'aliases' | 'text'> & Partial<WorldRecord>): Form => ({
  name: r.name,
  kind: r.kind,
  aliases: r.aliases,
  text: r.text,
  spot: r.size === 'spot',
  inside: r.inside ?? '',
  where: r.holder ? 'holder' : 'place',
  place: r.place ?? '',
  holder: r.holder ?? '',
})

/** The space fields to send with a save: "" clears a field the engine would otherwise keep. */
function spaceOf(f: Form): Partial<WorldRecord> {
  if (f.kind === 'place') return { size: f.spot ? 'spot' : '', inside: f.spot ? f.inside.trim() : '' }
  if (f.kind === 'thing') return { holder: f.where === 'holder' ? f.holder.trim() : '', place: f.where === 'place' ? f.place.trim() : '' }
  return {}
}

/** The keys of a record as removable chips plus an input: Enter or a comma adds one. */
function KeysInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const next = parseAliases([...value, raw].join(','))
    if (next.length !== value.length) onChange(next)
    setDraft('')
  }
  return (
    <div className="flex flex-col gap-1.5 text-sm" data-testid="keys-input">
      <span className="font-medium">{t('world.rec.keys')}</span>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((k) => (
            <li key={k} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-xs">
              <span className="break-all">{k}</span>
              <button type="button" aria-label={t('world.rec.keyRemove', { k })} className="inline-flex size-5 items-center justify-center rounded-full hover:bg-accent max-md:size-7" onClick={() => onChange(value.filter((x) => x !== k))}>
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        value={draft}
        aria-label={t('world.rec.keys')}
        placeholder={t('world.rec.keysPh')}
        className="h-10 md:h-9"
        onChange={(e) => {
          const v = e.target.value
          if (v.includes(',')) add(v)
          else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) add(draft) }
          else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => { if (draft.trim()) add(draft) }}
      />
    </div>
  )
}

function RecordForm({ initial, past, busy, onSave, onCancel, placeNames }: { initial: Form; past: boolean; busy: boolean; onSave: (f: Form) => void; onCancel: () => void; placeNames: string[] }) {
  const t = useT()
  const [f, setF] = useState(initial)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest' }) }, [])
  const limit = past ? TEXT_LIMIT.past : TEXT_LIMIT.active
  const over = f.text.length > limit
  const ok = f.name.trim() !== '' && f.text.trim() !== '' && !over
  return (
    <form
      ref={ref}
      className="flex flex-col gap-3 rounded-md border border-primary/40 bg-card p-3"
      onSubmit={(e) => { e.preventDefault(); if (ok && !busy) onSave(f) }}
      data-testid="record-form"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('world.rec.name')}</span>
        <Input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-10 md:h-9" autoFocus />
      </label>
      <div className="flex flex-col gap-1 text-sm" role="radiogroup" aria-label={t('world.rec.kind')}>
        <span className="font-medium">{t('world.rec.kind')}</span>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={f.kind === k}
              onClick={() => setF({ ...f, kind: k })}
              className={cn(
                'inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors max-md:h-10',
                f.kind === k ? cn(KIND_TONE[k], 'ring-1 ring-current') : 'border-border text-muted-foreground hover:bg-accent',
              )}
            >
              {t(`world.kind.${k}` as MsgKey)}
            </button>
          ))}
        </div>
      </div>
      {f.kind === 'place' && (
        <div className="flex flex-col gap-2" data-testid="record-space-place">
          <div className="flex flex-col gap-1 text-sm" role="radiogroup" aria-label={t('world.rec.size')}>
            <span className="font-medium">{t('world.rec.size')}</span>
            <div className="flex flex-wrap gap-1.5">
              {([false, true] as const).map((spot) => (
                <button
                  key={String(spot)}
                  type="button"
                  role="radio"
                  aria-checked={f.spot === spot}
                  onClick={() => setF({ ...f, spot })}
                  className={cn('inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors max-md:h-10', f.spot === spot ? cn(KIND_TONE.place, 'ring-1 ring-current') : 'border-border text-muted-foreground hover:bg-accent')}
                >
                  {spot ? t('world.rec.size.spot') : t('world.rec.size.whole')}
                </button>
              ))}
            </div>
          </div>
          {f.spot && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t('world.rec.inside')}</span>
              <Input value={f.inside} maxLength={80} list="world-place-names" placeholder={t('world.rec.insidePh')} onChange={(e) => setF({ ...f, inside: e.target.value })} className="h-10 md:h-9" />
            </label>
          )}
        </div>
      )}
      {f.kind === 'thing' && (
        <div className="flex flex-col gap-2" data-testid="record-space-thing">
          <div className="flex flex-col gap-1 text-sm" role="radiogroup" aria-label={t('world.rec.where')}>
            <span className="font-medium">{t('world.rec.where')}</span>
            <div className="flex flex-wrap gap-1.5">
              {(['place', 'holder', 'none'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={f.where === w}
                  onClick={() => setF({ ...f, where: w })}
                  className={cn('inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors max-md:h-10', f.where === w ? cn(KIND_TONE.thing, 'ring-1 ring-current') : 'border-border text-muted-foreground hover:bg-accent')}
                >
                  {t(`world.rec.where.${w}` as MsgKey)}
                </button>
              ))}
            </div>
          </div>
          {f.where === 'place' && (
            <Input value={f.place} maxLength={80} list="world-place-names" placeholder={t('world.rec.placePh')} aria-label={t('world.rec.where.place')} onChange={(e) => setF({ ...f, place: e.target.value })} className="h-10 md:h-9" />
          )}
          {f.where === 'holder' && (
            <Input value={f.holder} maxLength={80} placeholder={t('world.rec.holderPh')} aria-label={t('world.rec.where.holder')} onChange={(e) => setF({ ...f, holder: e.target.value })} className="h-10 md:h-9" />
          )}
        </div>
      )}
      <datalist id="world-place-names">{placeNames.map((n) => <option key={n} value={n} />)}</datalist>
      <KeysInput value={f.aliases} onChange={(aliases) => setF({ ...f, aliases })} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('world.rec.text')}</span>
        <Textarea value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} rows={4} className="min-h-24" />
        <span className={cn('text-xs', over ? 'text-destructive' : 'text-muted-foreground')}>
          {t('world.rec.len', { n: f.text.length, max: limit })}
          {past ? ` · ${t('world.rec.pastLimit')}` : ''}
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!ok || busy} className="max-md:h-10">{t('world.rec.save')}</Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="max-md:h-10">{t('home.cancel')}</Button>
      </div>
    </form>
  )
}

function RecordCard({ r, editing, busy, onEdit, onCancel, onSave, onOp, onPin, placeNames }: {
  placeNames: string[]
  r: WorldRecord
  editing: boolean
  busy: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (f: Form) => void
  onOp: (op: 'retire' | 'restore' | 'delete') => void
  onPin: (pinned: boolean) => void
}) {
  const t = useT()
  if (editing) {
    return <RecordForm initial={formOf(r)} past={r.status === 'past'} busy={busy} onSave={onSave} onCancel={onCancel} placeNames={placeNames} />
  }
  const past = r.status === 'past'
  return (
    <li className={cn('rounded-md border border-border bg-card p-3 text-sm', past && 'bg-muted/40')} data-testid="world-record" data-status={r.status}>
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', past && 'opacity-70')}>
        <span className="min-w-0 break-words font-medium">{r.name}</span>
        <KindChip kind={r.kind} />
        {past && <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">{t('world.past')}</span>}
        {r.by === 'player' && <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] leading-none text-primary">{t('world.rec.byYou')}</span>}
      </div>
      {r.pinned && !past ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-primary" data-testid="record-pinned">
          <PushPin className="size-3.5" weight="fill" aria-hidden="true" />
          <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 leading-none">{t('world.rec.pin')}</span>
        </p>
      ) : r.aliases.length === 0 && !past ? (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400" data-testid="record-no-keys">{t('world.rec.noKeys')}</p>
      ) : null}
      {r.aliases.length > 0 && (
        <ul className={cn('mt-1 flex flex-wrap items-center gap-1', past && 'opacity-70')} aria-label={t('world.rec.keys')} data-testid="record-keys">
          <li className="mr-0.5 text-[11px] text-muted-foreground">{t('world.rec.keys')}</li>
          {r.aliases.map((k) => (
            <li key={k} className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs">{k}</li>
          ))}
        </ul>
      )}
      {(r.kind === 'place' && r.size === 'spot' && r.inside) || (r.kind === 'thing' && (r.holder || r.place)) ? (
        <p className={cn('mt-1 text-xs text-muted-foreground', past && 'opacity-70')} data-testid="record-space">
          {r.kind === 'place' ? t('world.rec.spotOf', { name: r.inside ?? '' }) : r.holder ? t('world.rec.heldBy', { name: r.holder }) : t('world.rec.at', { name: r.place ?? '' })}
        </p>
      ) : null}
      <p className={cn('mt-1.5 whitespace-pre-wrap break-words text-muted-foreground', past && 'opacity-70')}>{r.text}</p>
      {r.pinned && !past && <p className="mt-1 text-xs text-muted-foreground">{t('world.rec.pinHint')}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" className="max-md:h-10" disabled={busy} onClick={onEdit}>
          <PencilSimple className="size-4" aria-hidden="true" />{t('world.rec.edit')}
        </Button>
        {past ? (
          <Button variant="outline" size="sm" className="max-md:h-10" disabled={busy} onClick={() => onOp('restore')}>
            <ArrowCounterClockwise className="size-4" aria-hidden="true" />{t('world.rec.restore')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="max-md:h-10" disabled={busy} onClick={() => onOp('retire')}>
            <Archive className="size-4" aria-hidden="true" />{t('world.rec.retire')}
          </Button>
        )}
        {!past && (
          <Button variant={r.pinned ? 'secondary' : 'outline'} size="sm" className="max-md:h-10" disabled={busy} aria-pressed={!!r.pinned} title={t('world.rec.pinHint')} onClick={() => onPin(!r.pinned)} data-testid="record-pin">
            <PushPin className="size-4" weight={r.pinned ? 'fill' : 'regular'} aria-hidden="true" />{t('world.rec.pin')}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive max-md:h-10" disabled={busy} onClick={() => onOp('delete')}>
          <Trash className="size-4" aria-hidden="true" />{t('world.rec.delete')}
        </Button>
      </div>
    </li>
  )
}

export function WorldRecords({ chatId, initial }: { chatId: string; /** records already read (the Places tab asked the spoiler question), the one to edit first, or a new place to add */ initial?: { records: WorldRecord[]; editId?: string; add?: 'place' } }) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [records, setRecords] = useState<WorldRecord[] | null>(initial?.records ?? null)
  const [kind, setKind] = useState<WorldKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(initial?.editId ?? null)
  const [adding, setAdding] = useState(initial?.add === 'place')
  const [busy, setBusy] = useState(false)
  const [filling, setFilling] = useState(false)
  const [fillMsg, setFillMsg] = useState<string | null>(null)
  const [fillErr, setFillErr] = useState<string | null>(null)
  const lastRunAt = useWorldLive((s) => s.views[chatId]?.lastRunAt)

  // the DM edits the book too: read it again after each of its runs
  useEffect(() => {
    if (records === null) return
    let live = true
    peekWorld(chatId).then((r) => { if (live) setRecords(r) }).catch(() => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRunAt])

  const counts = useMemo(() => countByKind(records ?? []), [records])
  const shown = useMemo(() => filterRecords(records ?? [], kind, query), [records, kind, query])

  const reveal = async () => {
    if (!(await confirm({ title: t('world.peekTitle'), description: t('world.peekWarn'), actionLabel: t('world.peekGo'), destructive: false }))) return
    try {
      setRecords(await peekWorld(chatId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const run = async (op: WorldRecordOp, record: Partial<WorldRecord>): Promise<boolean> => {
    setBusy(true)
    try {
      setRecords(await editWorldRecord(chatId, op, record))
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast.error(t('world.rec.clash'))
      else toast.error(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const placeNames = useMemo(() => (records ?? []).filter((r) => r.kind === 'place' && r.status === 'active').map((r) => r.name), [records])
  const keyless = useMemo(() => (records ?? []).filter((r) => r.status === 'active' && !r.pinned && r.aliases.length === 0).length, [records])

  const fill = async () => {
    setFilling(true)
    setFillMsg(null)
    setFillErr(null)
    try {
      const r = await fillWorldKeys(chatId)
      if (!r.ok) setFillErr(r.error ?? t('world.rec.fillFail'))
      else setFillMsg(r.changed ? t('world.rec.filled', { n: r.changed }) : t('world.rec.filledNone'))
      setRecords(await peekWorld(chatId))
    } catch (e) {
      setFillErr(e instanceof Error ? e.message : String(e))
    } finally {
      setFilling(false)
    }
  }

  const onOp = async (r: WorldRecord, op: 'retire' | 'restore' | 'delete') => {
    if (op === 'delete' && !(await confirm({ title: t('world.rec.deleteTitle', { name: r.name }), description: t('world.rec.deleteWarn'), actionLabel: t('world.rec.delete') }))) return
    await run(op, { id: r.id })
  }

  if (records === null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-sm">{t('world.rec.lead')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('world.runs.hidden')}</p>
          <Button variant="outline" size="sm" className="mt-2 max-md:h-10" onClick={() => void reveal()}>
            {t('world.rec.show')}
          </Button>
        </div>
        {confirmDialog}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t('world.rec.lead')}</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('world.rec.search')} aria-label={t('world.rec.search')} className="h-10 pl-8 md:h-9" />
        </div>
        <Button onClick={() => { setAdding(true); setEditingId(null) }} disabled={adding} className="max-md:h-10">
          <Plus className="size-4" aria-hidden="true" />{t('world.rec.add')}
        </Button>
      </div>

      <div role="group" aria-label={t('world.rec.kind')} className="flex flex-wrap gap-1.5">
        {(['all', ...KINDS] as const).map((k) => {
          const on = kind === k
          if (k !== 'all' && counts[k] === 0 && !on) return null
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => setKind(k)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors max-md:h-10',
                on ? (k === 'all' ? 'border-primary bg-primary text-primary-foreground' : cn(KIND_TONE[k], 'ring-1 ring-current')) : 'border-border text-muted-foreground hover:bg-accent',
              )}
            >
              {k === 'all' ? t('world.rec.all') : t(`world.kind.${k}` as MsgKey)}
              <span className="tabular-nums opacity-80">{counts[k]}</span>
            </button>
          )
        })}
      </div>

      {(keyless > 0 || fillMsg || fillErr) && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-3" data-testid="records-fill">
          {keyless > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Button variant="outline" size="sm" className="max-md:h-10" disabled={filling || busy} onClick={() => void fill()} data-testid="records-fill-go">
                {filling && <CircleNotch className="size-4 animate-spin" aria-hidden="true" />}
                {filling ? t('world.rec.filling') : t('world.rec.fill', { n: keyless })}
              </Button>
              <span className="text-xs text-muted-foreground">{t('world.rec.fillCost')}</span>
            </div>
          )}
          {fillMsg && <p className="text-sm" role="status">{fillMsg}</p>}
          {fillErr && <p className="text-sm text-destructive" role="alert">{fillErr}</p>}
        </div>
      )}

      {adding && (
        <RecordForm
          initial={formOf({ name: '', kind: kind === 'all' ? (initial?.add === 'place' ? 'place' : 'person') : kind, aliases: [], text: '' })}
          placeNames={placeNames}
          past={false}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={async (f) => { if (await run('add', { name: f.name.trim(), kind: f.kind, aliases: f.aliases, text: f.text.trim(), ...spaceOf(f) })) setAdding(false) }}
        />
      )}

      {records.length === 0 && !adding && <p className="py-6 text-center text-sm text-muted-foreground">{t('world.rec.empty')}</p>}
      {records.length > 0 && shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('world.rec.noMatch')}</p>}

      <ul className="flex flex-col gap-2">
        {shown.map((r) => (
          <RecordCard
            key={r.id}
            r={r}
            editing={editingId === r.id}
            placeNames={placeNames}
            busy={busy}
            onEdit={() => { setEditingId(r.id); setAdding(false) }}
            onCancel={() => setEditingId(null)}
            onSave={async (f) => {
              if (await run('update', { id: r.id, name: f.name.trim(), kind: f.kind, aliases: f.aliases, text: f.text.trim(), ...spaceOf(f) })) setEditingId(null)
            }}
            onOp={(op) => void onOp(r, op)}
            onPin={(pinned) => void run('update', { id: r.id, pinned })}
          />
        ))}
      </ul>
      {confirmDialog}
    </div>
  )
}
