import { useState } from 'react'
import { ArrowCounterClockwise, CaretDown, CaretRight, Check, PencilSimple, Plus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import type { DashView, Thread } from '@/lib/dashboard'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { useNotesAct } from './dash-context'

const FIELD = 'rounded-none'
const THREAD_MAX = 200
const DEFAULT_MAX_OPEN = 3

function ThreadRow({ th, editable, openOnly }: { th: Thread; editable: boolean; openOnly?: boolean }) {
  const t = useT()
  const act = useNotesAct()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(th.text)
  const open = th.status === 'open'
  const save = () => { void act({ op: 'thread-edit', id: th.id, text: text.trim() }).then((ok) => { if (ok) setEditing(false) }) }
  const setStatus = (status: 'open' | 'resolved') => { void act({ op: 'thread-edit', id: th.id, status }) }
  return (
    <li className={cn('flex gap-1.5 text-xs leading-snug', !open && 'text-muted-foreground')}>
      <span aria-hidden="true" className="mt-[5px] size-1.5 shrink-0 rotate-45 bg-cta" />
      {editing ? (
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={THREAD_MAX} aria-label={t('dash.note.edit')} className={cn(FIELD, 'h-7 text-xs')} />
          <span className="flex gap-2">
            <Button size="xs" className={FIELD} disabled={!text.trim() || text.trim() === th.text} onClick={save}>{t('dash.set.save')}</Button>
            <Button size="xs" variant="ghost" className={FIELD} onClick={() => { setText(th.text); setEditing(false) }}>{t('home.cancel')}</Button>
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className={cn('break-words', !open && 'line-through')}>{th.text}</span>
          {th.by === 'user' && <span className="ml-1.5 border border-border px-1 text-[10px] uppercase tracking-wide">{t('dash.thread.yours')}</span>}
          {!openOnly && (
            <span className="ml-2 whitespace-nowrap text-[11px]">
              {open ? t('dash.thread.since', { n: th.since }) : t('dash.thread.resolved')}
            </span>
          )}
        </span>
      )}
      {editable && !editing && (
        <span className="flex shrink-0 items-start">
          {open ? (
            <Button variant="ghost" size="icon-xs" className={FIELD} onClick={() => setStatus('resolved')} aria-label={t('dash.thread.resolve')} title={t('dash.thread.resolve')}><Check aria-hidden="true" /></Button>
          ) : (
            <Button variant="ghost" size="icon-xs" className={FIELD} onClick={() => setStatus('open')} aria-label={t('dash.thread.reopen')} title={t('dash.thread.reopen')}><ArrowCounterClockwise aria-hidden="true" /></Button>
          )}
          <Button variant="ghost" size="icon-xs" className={FIELD} onClick={() => { setText(th.text); setEditing(true) }} aria-label={t('dash.note.edit')} title={t('dash.note.edit')}><PencilSimple aria-hidden="true" /></Button>
        </span>
      )}
    </li>
  )
}

function AddThread({ full, max }: { full: boolean; max: number }) {
  const t = useT()
  const act = useNotesAct()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button size="xs" variant="outline" className={FIELD} disabled={full} onClick={() => setOpen(true)}><Plus aria-hidden="true" />{t('dash.thread.add')}</Button>
        {full && <span className="text-[11px] text-muted-foreground">{t('dash.thread.limit', { n: max })}</span>}
      </div>
    )
  }
  const add = async () => {
    setBusy(true)
    const ok = await act({ op: 'thread-add', text: text.trim() })
    setBusy(false)
    if (ok) { setText(''); setOpen(false) }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={THREAD_MAX} placeholder={t('dash.thread.placeholder')} aria-label={t('dash.thread.add')} className={cn(FIELD, 'h-7 text-xs')} />
      <div className="flex gap-2">
        <Button size="xs" className={FIELD} disabled={busy || !text.trim()} onClick={() => { void add() }}>{t('dash.set.addRow')}</Button>
        <Button size="xs" variant="ghost" className={FIELD} onClick={() => setOpen(false)}>{t('home.cancel')}</Button>
      </div>
    </div>
  )
}

/**
 * Open threads, then (collapsed) the resolved ones. `editable` adds Resolve / Reopen / Edit per
 * thread and, with `canAdd`, "Add thread" (disabled at the open limit); an older plugin has none of it.
 */
export function ThreadList({ threads, limit, openOnly, editable, canAdd, maxOpen }: {
  threads: DashView['threads']
  limit?: number
  openOnly?: boolean
  editable?: boolean
  canAdd?: boolean
  maxOpen?: number
}) {
  const t = useT()
  const open = threads.filter((th) => th.status === 'open')
  const resolved = threads.filter((th) => th.status !== 'open')
  const max = maxOpen ?? DEFAULT_MAX_OPEN
  const shown = limit ? open.slice(0, limit) : open
  const ed = !!editable
  return (
    <div className="flex flex-col gap-2">
      {shown.length === 0 && (openOnly || resolved.length === 0) ? (
        <p className="text-[11px] text-muted-foreground">{t('dash.threads.none')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((th) => <ThreadRow key={th.id} th={th} editable={ed} openOnly={openOnly} />)}
        </ul>
      )}
      {!openOnly && resolved.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group/rs flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <CaretRight className="size-3 group-data-[panel-open]/rs:hidden" aria-hidden="true" />
            <CaretDown className="hidden size-3 group-data-[panel-open]/rs:block" aria-hidden="true" />
            {t('dash.thread.resolvedN', { n: resolved.length })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {resolved.map((th) => <ThreadRow key={th.id} th={th} editable={ed} />)}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {ed && canAdd && <AddThread full={open.length >= max} max={max} />}
    </div>
  )
}
