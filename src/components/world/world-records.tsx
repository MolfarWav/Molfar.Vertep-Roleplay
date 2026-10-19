// The Records tab: the world book of one chat, readable and editable by hand. Behind the same
// spoiler question as "Look at the world" (once per visit to the tab). The DM keeps editing the
// records too; a record you write or change is marked "by you".

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowCounterClockwise, Archive, MagnifyingGlass, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import { ApiError } from '@/lib/engine'
import { cn } from '@/lib/utils'
import { countByKind, filterRecords, KINDS, parseAliases, TEXT_LIMIT } from '@/lib/world-records'
import { editWorldRecord, peekWorld, useWorldLive, type WorldKind, type WorldRecord, type WorldRecordOp } from '@/lib/world'
import type { MsgKey } from '@/lib/i18n'
import { KIND_TONE } from './world-common'

function KindChip({ kind, className }: { kind: WorldKind; className?: string }) {
  const t = useT()
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none', KIND_TONE[kind], className)}>
      {t(`world.kind.${kind}` as MsgKey)}
    </span>
  )
}

interface Form { name: string; kind: WorldKind; aliases: string; text: string }

function RecordForm({ initial, past, busy, onSave, onCancel }: { initial: Form; past: boolean; busy: boolean; onSave: (f: Form) => void; onCancel: () => void }) {
  const t = useT()
  const [f, setF] = useState(initial)
  const limit = past ? TEXT_LIMIT.past : TEXT_LIMIT.active
  const over = f.text.length > limit
  const ok = f.name.trim() !== '' && f.text.trim() !== '' && !over
  return (
    <form
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
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t('world.rec.aliases')}</span>
        <Input value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} placeholder={t('world.rec.aliasesPh')} className="h-10 md:h-9" />
      </label>
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

function RecordCard({ r, editing, busy, onEdit, onCancel, onSave, onOp }: {
  r: WorldRecord
  editing: boolean
  busy: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (f: Form) => void
  onOp: (op: 'retire' | 'restore' | 'delete') => void
}) {
  const t = useT()
  if (editing) {
    return <RecordForm initial={{ name: r.name, kind: r.kind, aliases: r.aliases.join(', '), text: r.text }} past={r.status === 'past'} busy={busy} onSave={onSave} onCancel={onCancel} />
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
      {r.aliases.length > 0 && <p className={cn('mt-1 text-xs text-muted-foreground', past && 'opacity-70')}>{r.aliases.join(', ')}</p>}
      <p className={cn('mt-1.5 whitespace-pre-wrap break-words text-muted-foreground', past && 'opacity-70')}>{r.text}</p>
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
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive max-md:h-10" disabled={busy} onClick={() => onOp('delete')}>
          <Trash className="size-4" aria-hidden="true" />{t('world.rec.delete')}
        </Button>
      </div>
    </li>
  )
}

export function WorldRecords({ chatId }: { chatId: string }) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [records, setRecords] = useState<WorldRecord[] | null>(null)
  const [kind, setKind] = useState<WorldKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
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

      {adding && (
        <RecordForm
          initial={{ name: '', kind: kind === 'all' ? 'person' : kind, aliases: '', text: '' }}
          past={false}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={async (f) => { if (await run('add', { name: f.name.trim(), kind: f.kind, aliases: parseAliases(f.aliases), text: f.text.trim() })) setAdding(false) }}
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
            busy={busy}
            onEdit={() => { setEditingId(r.id); setAdding(false) }}
            onCancel={() => setEditingId(null)}
            onSave={async (f) => {
              if (await run('update', { id: r.id, name: f.name.trim(), kind: f.kind, aliases: parseAliases(f.aliases), text: f.text.trim() })) setEditingId(null)
            }}
            onOp={(op) => void onOp(r, op)}
          />
        ))}
      </ul>
      {confirmDialog}
    </div>
  )
}
