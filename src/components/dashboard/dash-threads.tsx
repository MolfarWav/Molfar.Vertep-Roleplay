import { useEffect, useRef, useState } from 'react'
import { ArrowCounterClockwise, CaretDown, CaretRight, Check, Lightbulb, PencilSimple, Plus, Star } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { InfoTip } from '@/components/ui/info-tip'
import { Input } from '@/components/ui/input'
import {
  QUEST_KINDS,
  questFull,
  questGroups,
  questKindOf,
  questLimitsOf,
  questReplaceable,
  type DashView,
  type QuestKind,
  type QuestLimits,
  type QuestProposal,
  type Thread,
} from '@/lib/dashboard'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { useNotesAct } from './dash-context'

const FIELD = 'rounded-none'
const THREAD_MAX = 200
// text buttons and icon buttons get a thumb-sized target on a phone (below 768 px)
const TOUCH = 'max-md:min-h-10'
const TOUCH_ICON = 'max-md:size-10'
const SELECT = 'h-7 rounded-none border border-input bg-background px-1.5 text-xs max-md:h-10'

function KindSelect({ value, onChange, label }: { value: QuestKind; onChange: (k: QuestKind) => void; label: string }) {
  const t = useT()
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as QuestKind)} aria-label={label} className={SELECT}>
      {QUEST_KINDS.map((k) => <option key={k} value={k}>{t(`dash.quest.kind.${k}`)}</option>)}
    </select>
  )
}

function ThreadRow({ th, editable, openOnly, step }: { th: Thread; editable: boolean; openOnly?: boolean; step?: boolean }) {
  const t = useT()
  const act = useNotesAct()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(th.text)
  const [kind, setKind] = useState<QuestKind>(questKindOf(th))
  const open = th.status === 'open'
  const kindChanged = !step && kind !== questKindOf(th)
  const save = () => {
    void act({ op: 'thread-edit', id: th.id, ...(text.trim() !== th.text ? { text: text.trim() } : {}), ...(kindChanged ? { kind } : {}) }).then((ok) => { if (ok) setEditing(false) })
  }
  const setStatus = (status: 'open' | 'resolved') => { void act({ op: 'thread-edit', id: th.id, status }) }
  const cancel = () => { setText(th.text); setKind(questKindOf(th)); setEditing(false) }
  return (
    <li className={cn('flex gap-1.5 text-xs leading-snug', !open && 'text-muted-foreground')}>
      <span aria-hidden="true" className={cn('mt-[5px] size-1.5 shrink-0 bg-cta', step ? 'rounded-full' : 'rotate-45')} />
      {editing ? (
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={THREAD_MAX} aria-label={t('dash.note.edit')} className={cn(FIELD, 'h-7 text-xs max-md:h-10')} />
          {!step && <KindSelect value={kind} onChange={setKind} label={t('dash.quest.kind.label')} />}
          <span className="flex gap-2">
            <Button size="xs" className={cn(FIELD, TOUCH)} disabled={!text.trim() || (text.trim() === th.text && !kindChanged)} onClick={save}>{t('dash.set.save')}</Button>
            <Button size="xs" variant="ghost" className={cn(FIELD, TOUCH)} onClick={cancel}>{t('home.cancel')}</Button>
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className={cn('break-words', !open && 'line-through')}>{th.text}</span>
          {th.by === 'user' && <span className="ml-1.5 border border-border px-1 text-[10px] uppercase tracking-wide">{t('dash.thread.yours')}</span>}
          {/* a flat list (the strip) has no group titles: say which are main or everyday */}
          {openOnly && !step && questKindOf(th) !== 'side' && <span className="ml-1.5 border border-border px-1 text-[10px] uppercase tracking-wide">{t(`dash.quest.kind.${questKindOf(th)}`)}</span>}
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
            <Button variant="ghost" size="icon-xs" className={cn(FIELD, TOUCH_ICON)} onClick={() => setStatus('resolved')} aria-label={t('dash.thread.resolve')} title={t('dash.thread.resolve')}><Check aria-hidden="true" /></Button>
          ) : (
            <Button variant="ghost" size="icon-xs" className={cn(FIELD, TOUCH_ICON)} onClick={() => setStatus('open')} aria-label={t('dash.thread.reopen')} title={t('dash.thread.reopen')}><ArrowCounterClockwise aria-hidden="true" /></Button>
          )}
          <Button variant="ghost" size="icon-xs" className={cn(FIELD, TOUCH_ICON)} onClick={() => { setText(th.text); setKind(questKindOf(th)); setEditing(true) }} aria-label={t('dash.note.edit')} title={t('dash.note.edit')}><PencilSimple aria-hidden="true" /></Button>
        </span>
      )}
    </li>
  )
}

/** Add a quest (kind chosen, side by default) or, with `parent`, a step of that main quest. A full kind is not a wall: the new one waits in Suggestions. */
function AddThread({ threads, limits, parent }: { threads: Thread[]; limits: QuestLimits; parent?: string }) {
  const t = useT()
  const act = useNotesAct()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<QuestKind>('side')
  const [busy, setBusy] = useState(false)
  const full = questFull(limits, threads, kind, parent)
  // the form opens at the end of a long list: bring it into view, or a phone user sees nothing happen
  const form = useRef<HTMLDivElement>(null)
  useEffect(() => { if (open) form.current?.scrollIntoView({ block: 'nearest' }) }, [open])
  if (!open) {
    return (
      <Button size="xs" variant={parent ? 'ghost' : 'outline'} className={cn(FIELD, TOUCH, 'self-start')} onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />{parent ? t('dash.quest.step.add') : t('dash.thread.add')}
      </Button>
    )
  }
  const add = async () => {
    setBusy(true)
    const ok = await act({ op: 'thread-add', text: text.trim(), ...(parent ? { parent } : { kind }) })
    setBusy(false)
    if (ok) { setText(''); setOpen(false) }
  }
  return (
    <div ref={form} className="flex flex-col gap-1.5">
      <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={THREAD_MAX} placeholder={parent ? t('dash.quest.step.placeholder') : t('dash.thread.placeholder')} aria-label={parent ? t('dash.quest.step.add') : t('dash.thread.add')} className={cn(FIELD, 'h-7 text-xs max-md:h-10')} />
      {!parent && (
        <div className="flex items-center gap-1.5">
          <KindSelect value={kind} onChange={setKind} label={t('dash.quest.kind.label')} />
          <InfoTip label={t('dash.quest.kinds.about')}>{t('dash.quest.kinds.info')}</InfoTip>
        </div>
      )}
      {full && <p className="text-[11px] text-muted-foreground">{parent ? t('dash.quest.full.steps') : t('dash.quest.full', { kind: t(`dash.quest.kind.${kind}`) })}</p>}
      <div className="flex gap-2">
        <Button size="xs" className={cn(FIELD, TOUCH)} disabled={busy || !text.trim()} onClick={() => { void add() }}>{t('dash.set.addRow')}</Button>
        <Button size="xs" variant="ghost" className={cn(FIELD, TOUCH)} onClick={() => setOpen(false)}>{t('home.cancel')}</Button>
      </div>
    </div>
  )
}

/** One thing the story proposed and waits for an answer: a quest with no room, or one left alone. */
function ProposalRow({ p, threads, limits }: { p: QuestProposal; threads: Thread[]; limits: QuestLimits }) {
  const t = useT()
  const act = useNotesAct()
  const [replacing, setReplacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const run = async (body: { op: string } & Record<string, unknown>) => { setBusy(true); await act(body); setBusy(false) }
  const isClose = p.type === 'close'
  const accept = () => {
    // a full kind needs the owner to say which open quest this one takes the place of
    if (!isClose && questFull(limits, threads, p.kind, p.parent)) setReplacing(true)
    else void run({ op: 'proposal-accept', id: p.id })
  }
  const label = isClose ? t('dash.quest.sugg.close') : p.parent ? t('dash.quest.sugg.openStep') : t('dash.quest.sugg.open', { kind: t(`dash.quest.kind.${p.kind}`).toLowerCase() })
  return (
    <li className="flex flex-col gap-1.5 text-xs leading-snug">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="break-words">
        {p.text}
        {p.by === 'user' && <span className="ml-1.5 border border-border px-1 text-[10px] uppercase tracking-wide">{t('dash.thread.yours')}</span>}
      </span>
      {replacing ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">{t('dash.quest.replace')}</span>
          {questReplaceable(threads, p.kind, p.parent).map((th) => (
            <Button key={th.id} size="xs" variant="outline" className={cn(FIELD, TOUCH, 'h-auto justify-start whitespace-normal py-1 text-left')} disabled={busy} onClick={() => { void run({ op: 'proposal-accept', id: p.id, replace: th.id }) }}>{th.text}</Button>
          ))}
          <Button size="xs" variant="ghost" className={cn(FIELD, TOUCH, 'self-start')} onClick={() => setReplacing(false)}>{t('home.cancel')}</Button>
        </div>
      ) : (
        <span className="flex gap-2">
          <Button size="xs" className={cn(FIELD, TOUCH)} disabled={busy} onClick={accept}>{isClose ? t('dash.quest.sugg.closeIt') : t('dash.quest.sugg.accept')}</Button>
          <Button size="xs" variant="ghost" className={cn(FIELD, TOUCH)} disabled={busy} onClick={() => { void run({ op: 'proposal-reject', id: p.id }) }}>{isClose ? t('dash.quest.sugg.keep') : t('dash.quest.sugg.dismiss')}</Button>
        </span>
      )}
    </li>
  )
}

function Suggestions({ proposals, threads, limits }: { proposals: QuestProposal[]; threads: Thread[]; limits: QuestLimits }) {
  const t = useT()
  return (
    <div className="flex flex-col gap-2 border border-amber-500/50 bg-amber-500/10 p-2" data-testid="quest-suggestions">
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
        <Lightbulb className="size-3.5" aria-hidden="true" />
        {t('dash.quest.sugg', { n: proposals.length })}
      </div>
      <p className="text-[11px] text-muted-foreground">{t('dash.quest.sugg.hint')}</p>
      <ul className="flex flex-col gap-3">
        {proposals.map((p) => <ProposalRow key={p.id} p={p} threads={threads} limits={limits} />)}
      </ul>
    </div>
  )
}

function GroupTitle({ kind, n, max }: { kind: QuestKind; n: number; max?: number }) {
  const t = useT()
  return (
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
      {kind === 'main' && <Star className="size-3" weight="fill" aria-hidden="true" />}
      <span>{t(`dash.quest.kind.${kind}`)}</span>
      <span aria-label={max === undefined ? undefined : t('dash.quest.of', { n, max })}>{max === undefined ? n : `${n}/${max}`}</span>
    </div>
  )
}

/**
 * The quests: open ones by kind (main with its steps, side, everyday folded), then (collapsed) the resolved ones.
 * `editable` adds Resolve / Reopen / Edit per thread and, with `canAdd`, Add quest and Add step; `proposals` are
 * the story's suggestions waiting for an answer. `openOnly` is the strip's flat short list. An older plugin
 * sends no `limits` or `proposals`: the lists still work.
 */
export function ThreadList({ threads, limit, openOnly, editable, canAdd, maxOpen, limits, proposals }: {
  threads: DashView['threads']
  limit?: number
  openOnly?: boolean
  editable?: boolean
  canAdd?: boolean
  maxOpen?: number
  limits?: QuestLimits
  proposals?: QuestProposal[]
}) {
  const t = useT()
  const lim = questLimitsOf(limits, maxOpen)
  const g = questGroups(threads)
  const ed = !!editable
  const openCount = g.main.length + g.side.length + g.everyday.length
  const waiting = ed ? proposals ?? [] : []

  // the strip: one flat short list, main quests first, with their steps under them
  if (openOnly) {
    const flat = [...g.main.map((m) => ({ th: m.quest, steps: m.steps })), ...g.side.map((th) => ({ th, steps: [] as Thread[] })), ...g.everyday.map((th) => ({ th, steps: [] as Thread[] }))]
    const shown = limit ? flat.slice(0, limit) : flat
    return (
      <div className="flex flex-col gap-2">
        {waiting.length > 0 && <Suggestions proposals={waiting} threads={threads} limits={lim} />}
        {shown.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">{t('dash.threads.none')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shown.map(({ th, steps }) => (
              <li key={th.id} className="list-none">
                <ul className="flex flex-col gap-1.5">
                  <ThreadRow th={th} editable={ed} openOnly />
                  {steps.length > 0 && <li className="list-none"><ul className="ml-3.5 flex flex-col gap-1.5">{steps.map((s) => <ThreadRow key={s.id} th={s} editable={ed} openOnly step />)}</ul></li>}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {flat.length > shown.length && <p className="text-[11px] text-muted-foreground">{t('dash.quest.more', { n: flat.length - shown.length })}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {waiting.length > 0 && <Suggestions proposals={waiting} threads={threads} limits={lim} />}
      {openCount === 0 && <p className="text-[11px] text-muted-foreground">{t('dash.threads.none')}</p>}
      {g.main.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t('dash.quest.kind.main')}>
          <GroupTitle kind="main" n={g.main.length} max={lim.main} />
          {g.main.map(({ quest, steps, done }) => (
            <div key={quest.id} className="flex flex-col gap-1.5 border border-border bg-muted/30 p-2">
              <ul><ThreadRow th={quest} editable={ed} /></ul>
              {(steps.length > 0 || done > 0) && (
                <>
                  <span className="ml-3 text-[11px] text-muted-foreground">{t('dash.quest.stepsDone', { done, total: done + steps.length })}</span>
                  <ul className="ml-3.5 flex flex-col gap-1.5">{steps.map((s) => <ThreadRow key={s.id} th={s} editable={ed} step />)}</ul>
                </>
              )}
              {ed && canAdd && <div className="ml-3"><AddThread threads={threads} limits={lim} parent={quest.id} /></div>}
            </div>
          ))}
        </section>
      )}
      {g.side.length > 0 && (
        <section className="flex flex-col gap-1.5" aria-label={t('dash.quest.kind.side')}>
          <GroupTitle kind="side" n={g.side.length} max={lim.side} />
          <ul className="flex flex-col gap-1.5">{g.side.map((th) => <ThreadRow key={th.id} th={th} editable={ed} />)}</ul>
        </section>
      )}
      {g.everyday.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group/ev flex min-h-6 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground max-md:min-h-10">
            <CaretRight className="size-3 group-data-[panel-open]/ev:hidden" aria-hidden="true" />
            <CaretDown className="hidden size-3 group-data-[panel-open]/ev:block" aria-hidden="true" />
            {t('dash.quest.everydayN', { n: g.everyday.length })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1.5 flex flex-col gap-1.5">{g.everyday.map((th) => <ThreadRow key={th.id} th={th} editable={ed} />)}</ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {g.resolved.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="group/rs flex min-h-6 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground max-md:min-h-10">
            <CaretRight className="size-3 group-data-[panel-open]/rs:hidden" aria-hidden="true" />
            <CaretDown className="hidden size-3 group-data-[panel-open]/rs:block" aria-hidden="true" />
            {t('dash.thread.resolvedN', { n: g.resolved.length })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {g.resolved.map((th) => <ThreadRow key={th.id} th={th} editable={ed} step={!!th.parent} />)}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {ed && canAdd && <AddThread threads={threads} limits={lim} />}
    </div>
  )
}
