// The DM's memory (#425, step 5, half A). One place to see what the DM learned from what the player removes and rewrites:
// proposals waiting for an answer (with the evidence), the rules in force (this chat's and all chats'), a rule written by hand,
// the names the DM is told not to write again, and a reset. Also here: the DM tab's row and dot, the read-only card of the profile
// editor ("Learned memory": exactly what reaches the DM's input) and the chat sheet's card ("What the DM learns": the switch, the
// levers, the log of every proposal and answer). Half A moves exact settings; rules in prose come in half B.

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Brain, Plus, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { Fold } from '@/components/ui/fold'
import { Input } from '@/components/ui/input'
import { Section, Chip } from '@/components/ui/section'
import { Segmented, SettingRow } from '@/components/ui/setting-row'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useRelativeTime, useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  addLearnedRule, answerLearned, clearLearnedNames, editLearnedRule, loadLearned, removeLearnedRule, resetLearned, useLearnedLive,
  type LearnKey, type LearnLine, type LearnProposal, type LearnRule, type WorldChat, type WorldLearned, type WorldThings, type WorldView,
} from '@/lib/world'

/** The row's id in the DM tab's list (a profile id can never look like this). */
export const MEMORY_ID = '__memory__'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const THINGS_RULE: WorldThings[] = ['reasons', 'off']
const CAST_RULE = ['normal', 'rare', 'off'] as const
const LEVER_KEYS: LearnKey[] = ['things', 'textMax', 'cast']

type T = ReturnType<typeof useT>

/** What a lever's value means, in the player's words: "Things in the book: only with a reason". */
export function leverText(t: T, key: LearnKey, to: string | number): string {
  if (key === 'things') return t('world.mem.rule.things', { v: t(`world.things.${to}` as MsgKey) })
  if (key === 'cast') return t('world.mem.rule.cast', { v: t(`world.cast.freq.${to}` as MsgKey) })
  return t('world.mem.rule.text', { n: Number(to) })
}

/** The sentence a proposal opens with: what the player did, as a count and a share. */
function evidenceHead(t: T, p: { key: LearnKey; ev: LearnProposal['ev'] }): string {
  const v = { n: p.ev.n, total: p.ev.total, share: p.ev.share, kind: t(`world.kind.${p.ev.kind ?? 'thing'}` as MsgKey) }
  return t(`world.mem.p.${p.key}` as MsgKey, v)
}

/** The question: the exact lever the answer flips. */
function proposalAsk(t: T, p: LearnProposal): string {
  if (p.key === 'things') return t(`world.mem.q.things.${p.lever.to}` as MsgKey)
  if (p.key === 'cast') return t('world.mem.q.cast', { v: t(`world.cast.freq.${p.lever.to}` as MsgKey) })
  return t('world.mem.q.text', { n: Number(p.lever.to) })
}

/** One line of the log: what was proposed or answered, with the share and the threshold that raised it. */
export function learnLine(t: T, l: LearnLine): string {
  const what = l.to !== undefined ? leverText(t, l.key, l.to) : t(`world.mem.lever.${l.key}` as MsgKey)
  if (l.act === 'raise') return t('world.learn.line.raise', { what, n: l.ev?.n ?? 0, total: l.ev?.total ?? 0, share: l.ev?.share ?? 0, thr: l.ev?.thr ?? 0 })
  if (l.act === 'answer') return t(`world.learn.line.answer.${l.answer ?? 'no'}` as MsgKey, { what })
  return t(`world.learn.line.${l.act}` as MsgKey, { what, scope: l.scope ? t(`world.mem.scope.${l.scope}` as MsgKey) : '' })
}

/** Reads the memory of a chat (or, with no chat, of all chats) and again after every answer and every 15 s. */
export function useLearned(chatId?: string, refresh?: unknown) {
  const stamp = useLearnedLive((s) => s.stamp)
  const last = useLearnedLive((s) => s.last)
  const [data, setData] = useState<WorldLearned | null>(null)
  const [error, setError] = useState('')
  // a read that started before a newer one (or before an answer) must not overwrite it when it comes back late
  const seq = useRef(0)
  const load = useCallback(() => {
    const mine = ++seq.current
    loadLearned(chatId).then((d) => { if (mine === seq.current) { setData(d); setError('') } }).catch((e: unknown) => { if (mine === seq.current) setError(errText(e)) })
  }, [chatId])
  // an answer returns the new view: show it now (a read takes a second or more), the read that follows confirms it
  useEffect(() => {
    if (!last || (chatId !== undefined && last.chatId !== chatId)) return
    seq.current++
    setData(last)
    setError('')
  }, [last, chatId])
  useEffect(() => {
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, 15_000)
    return () => clearInterval(id)
  }, [load, stamp, refresh])
  return { data, error, reload: load }
}

/** The DM tab's overview: the rules for all chats and how many proposals wait in any chat. */
export function useMemoryOverview(): { rules: number; waiting: number } | null {
  const { data } = useLearned()
  // the rules for all chats only (a chat's own rules show in its Memory view)
  return data ? { rules: data.rules.filter((r) => r.scope === 'all').length, waiting: data.waiting.length } : null
}

/** A small dot that says "something waits for you" (not colour alone: the label is read aloud and shown on hover). */
export function WaitingDot({ className }: { className?: string }) {
  const t = useT()
  return <span role="img" aria-label={t('world.mem.dot')} title={t('world.mem.dot')} data-testid="memory-dot" className={cn('inline-block size-2 shrink-0 rounded-full bg-amber-500', className)} />
}

/** The row at the top of the DM tab's list. */
export function MemoryRow({ selected, onSelect, overview }: { selected: boolean; onSelect: () => void; overview: { rules: number; waiting: number } | null }) {
  const t = useT()
  const stat = !overview ? '' : overview.rules + overview.waiting === 0 ? t('world.mem.rowEmpty') : t('world.mem.rowStat', { n: overview.rules, w: overview.waiting })
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      data-testid="world-memory-row"
      className={cn('relative mb-1 flex min-h-12 w-full flex-col justify-center gap-0.5 rounded-md border border-border px-2 py-1.5 text-left text-body', selected ? 'bg-accent' : 'hover:bg-accent/50')}
    >
      <span className="flex min-w-0 items-center gap-1.5 font-medium">
        <Brain className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 truncate">{t('world.mem.row')}</span>
        {!!overview?.waiting && <WaitingDot className="ml-auto" />}
      </span>
      {stat && <span className="text-caption text-muted-foreground">{stat}</span>}
    </button>
  )
}

/** The value control of a lever: a few choices as a segmented control, the text length as a number. */
function LeverValue({ lever, value, onChange, label }: { lever: LearnKey; value: string | number; onChange: (v: string | number) => void; label: string }) {
  const t = useT()
  if (lever === 'things') {
    return <Segmented label={label} value={String(value)} onChange={onChange} options={THINGS_RULE.map((v) => ({ id: v as string, label: t(`world.things.${v}` as MsgKey) }))} />
  }
  if (lever === 'cast') {
    return <Segmented label={label} value={String(value)} onChange={onChange} options={CAST_RULE.map((v) => ({ id: v as string, label: t(`world.cast.freq.${v}` as MsgKey) }))} />
  }
  return (
    <span className="flex items-center gap-2">
      <Input type="number" inputMode="numeric" min={200} max={3000} step={50} value={String(value)} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} className="h-10 w-24 md:h-9" />
      <span className="text-caption text-muted-foreground">{t('world.mem.chars')}</span>
    </span>
  )
}

const DEFAULT_VALUE: Record<LearnKey, string | number> = { things: 'reasons', textMax: 600, cast: 'rare' }

// ---------- the Memory view (the DM tab's detail) ----------

function ProposalCard({ p, disabled, onAnswer }: { p: LearnProposal; disabled: boolean; onAnswer: (a: 'all' | 'chat' | 'no') => void }) {
  const t = useT()
  const verb = p.key === 'textMax' ? t('world.mem.ev.rewritten') : t('world.mem.ev.removed')
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3" data-testid="memory-proposal">
      <p className="text-body font-medium">{evidenceHead(t, p)}</p>
      {p.ev.names.length > 0 && <p className="text-caption text-muted-foreground">{verb}: {p.ev.names.join(', ')}</p>}
      <p className="text-caption text-muted-foreground">{t('world.mem.threshold', { min: p.ev.min, thr: p.ev.thr, days: p.ev.days })}</p>
      <p className="text-body">{proposalAsk(t, p)}</p>
      <div className="flex flex-wrap gap-2">
        <Button className="max-md:h-11" disabled={disabled} onClick={() => onAnswer('chat')} data-testid="memory-answer-chat">{t('world.mem.thisChat')}</Button>
        <Button variant="outline" className="max-md:h-11" disabled={disabled} onClick={() => onAnswer('all')} data-testid="memory-answer-all">{t('world.mem.allChats')}</Button>
        <Button variant="ghost" className="max-md:h-11" disabled={disabled} onClick={() => onAnswer('no')} data-testid="memory-answer-no">{t('world.mem.no')}</Button>
      </div>
    </li>
  )
}

function RuleRow({ r, disabled, onEdit, onRemove }: { r: LearnRule; disabled: boolean; onEdit: (to: string | number) => void; onRemove: () => void }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string | number>(r.lever.to)
  return (
    <li className="flex flex-col gap-2 px-4 py-3" data-testid="memory-rule">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-[1_1_12rem] text-body font-medium">{leverText(t, r.lever.key, r.lever.to)}</span>
        <Chip tone={r.scope === 'all' ? 'sky' : undefined}>{t(`world.mem.scope.${r.scope}` as MsgKey)}</Chip>
        {r.scope === 'all' && !r.here && <Chip tone="amber">{t('world.mem.differs')}</Chip>}
      </div>
      <p className="text-caption text-muted-foreground">
        {t(`world.mem.src.${r.source}` as MsgKey)}
        {r.ev ? ` · ${evidenceHead(t, { key: r.lever.key, ev: r.ev })}` : ''}
      </p>
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <LeverValue lever={r.lever.key} value={draft} onChange={setDraft} label={t('world.mem.edit')} />
          <Button size="sm" className="max-md:h-10" disabled={disabled} onClick={() => { onEdit(draft); setEditing(false) }}>{t('world.prof.save')}</Button>
          <Button size="sm" variant="ghost" className="max-md:h-10" onClick={() => { setDraft(r.lever.to); setEditing(false) }}>{t('world.mem.cancel')}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="max-md:h-10" disabled={disabled} onClick={() => setEditing(true)}>{t('world.mem.edit')}</Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive max-md:h-10" disabled={disabled} onClick={onRemove}>
            <Trash className="size-4" aria-hidden="true" />{t('world.mem.remove')}
          </Button>
        </div>
      )}
    </li>
  )
}

function AddRule({ disabled, onAdd }: { disabled: boolean; onAdd: (scope: 'chat' | 'all', key: LearnKey, to: string | number) => void }) {
  const t = useT()
  const [key, setKey] = useState<LearnKey>('things')
  const [to, setTo] = useState<string | number>(DEFAULT_VALUE.things)
  const [scope, setScope] = useState<'chat' | 'all'>('chat')
  const pick = (k: LearnKey) => { setKey(k); setTo(DEFAULT_VALUE[k]) }
  return (
    <div className="flex flex-col gap-3 px-4 py-3" data-testid="memory-add">
      <p className="text-caption text-muted-foreground">{t('world.mem.add.hint')}</p>
      <Select value={key} onValueChange={(v) => pick(v as LearnKey)}>
        <SelectTrigger className="h-10 w-full md:h-9" aria-label={t('world.mem.add.lever')}><SelectValue /></SelectTrigger>
        <SelectContent>
          {LEVER_KEYS.map((k) => <SelectItem key={k} value={k}>{t(`world.mem.lever.${k}` as MsgKey)}</SelectItem>)}
        </SelectContent>
      </Select>
      <LeverValue lever={key} value={to} onChange={setTo} label={t('world.mem.add.value')} />
      <Segmented label={t('world.mem.add.scope')} value={scope} onChange={setScope} options={[{ id: 'chat' as const, label: t('world.mem.scope.chat') }, { id: 'all' as const, label: t('world.mem.scope.all') }]} />
      <Button variant="outline" className="self-start max-md:h-11" disabled={disabled} onClick={() => onAdd(scope, key, to)}>
        <Plus className="size-4" aria-hidden="true" />{t('world.mem.add.go')}
      </Button>
    </div>
  )
}

/** The Memory view: the DM tab's detail for the row "Memory". `chats` are the chats that have a DM; `chatId` the one it is read for. */
export function MemoryView({ chats, chatId, onChat }: { chats: WorldChat[]; chatId: string | null; onChat: (id: string) => void }) {
  const t = useT()
  const { data, error } = useLearned(chatId ?? undefined)
  const [confirm, confirmDialog] = useConfirm()
  const [busy, setBusy] = useState(false)
  // the chat has a world (an empty chatId in the answer means no state file yet): only then can an answer be saved
  const live = !!data && !!data.chatId
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    try {
      await fn()
      if (done) toast(done)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }
  const cid = chatId ?? ''
  const reset = async () => {
    if (!(await confirm({ title: t('world.mem.reset.title'), description: t('world.mem.reset.warn'), actionLabel: t('world.mem.reset') }))) return
    await run(() => resetLearned(cid), t('world.mem.reset.done'))
  }
  const clearNames = async () => {
    if (!(await confirm({ title: t('world.mem.names.clearTitle'), description: t('world.mem.names.clearWarn'), actionLabel: t('world.mem.names.clear') }))) return
    await run(() => clearLearnedNames(cid))
  }
  const nothing = !!data && !data.proposals.length && !data.rules.length

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4" data-testid="memory-view">
      <div className="flex flex-col gap-1">
        <h2 className="text-heading font-semibold">{t('world.mem.title')}</h2>
        <p className="text-body text-muted-foreground">{t('world.mem.intro')}</p>
      </div>
      <label className="flex flex-col gap-1 text-body">
        <span className="font-medium">{t('world.mem.chat')}</span>
        {chats.length === 0 ? (
          <span className="text-caption text-muted-foreground">{t('world.mem.noChats')}</span>
        ) : (
          <Select value={chatId ?? ''} onValueChange={(v) => { if (v) onChat(v) }}>
            <SelectTrigger className="h-10 w-full md:h-9" data-testid="memory-chat"><SelectValue placeholder={t('world.mem.chat.pick')} /></SelectTrigger>
            <SelectContent>
              {chats.map((c) => <SelectItem key={c.chatId} value={c.chatId}>{c.title || c.chatId}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </label>
      {error && <p className="text-caption text-destructive">{t('world.list.loadError', { error })}</p>}
      {!data && !error && <p className="text-caption text-muted-foreground">{t('chats.panel.loading')}</p>}
      {data && !live && cid && <p className="rounded-md border border-dashed border-border p-3 text-caption text-muted-foreground" data-testid="memory-noworld">{t('world.mem.noWorld')}</p>}
      {data && !data.on && live && <p className="text-caption text-muted-foreground">{t('world.mem.off')}</p>}

      {data && (
        <>
          <section className="flex flex-col gap-2" aria-label={t('world.mem.waiting')}>
            <h3 className="flex items-center gap-2 px-1 text-heading font-semibold">{t('world.mem.waiting')}{data.proposals.length > 0 && <Chip tone="sky">{data.proposals.length}</Chip>}</h3>
            {data.proposals.length === 0 ? (
              <p className="text-caption text-muted-foreground">{nothing ? t('world.mem.empty') : t('world.mem.noneWaiting')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.proposals.map((p) => (
                  <ProposalCard key={p.id} p={p} disabled={busy || !live} onAnswer={(a) => void run(() => answerLearned(cid, p.id, a))} />
                ))}
              </ul>
            )}
            {data.waiting.some((w) => w.chatId !== cid) && <p className="text-caption text-muted-foreground">{t('world.mem.elsewhere', { n: data.waiting.filter((w) => w.chatId !== cid).length })}</p>}
          </section>

          <Section title={t('world.mem.rules')} aside={data.rules.length ? String(data.rules.length) : undefined}>
            {data.rules.length === 0 ? (
              <p className="px-4 py-3 text-caption text-muted-foreground">{t('world.mem.rules.empty')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.rules.map((r) => (
                  <RuleRow
                    key={r.id}
                    r={r}
                    disabled={busy || !live}
                    onEdit={(to) => void run(() => editLearnedRule(cid, r.id, to))}
                    onRemove={() => void run(() => removeLearnedRule(cid, r.id))}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('world.mem.add')}>
            <AddRule disabled={busy || !live} onAdd={(scope, key, to) => void run(() => addLearnedRule(cid, scope, key, to), t('world.mem.add.done'))} />
          </Section>

          <Section title={t('world.mem.names')}>
            <p className="px-4 py-3 text-caption text-muted-foreground">{t('world.mem.names.hint')}</p>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="text-body">{t('world.mem.names.count', { n: data.remembered.length })}</span>
              <Button variant="outline" size="sm" className="ml-auto max-md:h-10" disabled={busy || !live || data.remembered.length === 0} onClick={() => void clearNames()} data-testid="memory-clear-names">{t('world.mem.names.clear')}</Button>
            </div>
            {data.remembered.length > 0 && (
              <Fold id="mem-names" title={t('world.mem.names.show')} summary={data.remembered.slice(0, 3).join(', ')} flat>
                <p className="px-4 py-3 text-caption text-muted-foreground" data-testid="memory-names">{data.remembered.join(', ')}</p>
              </Fold>
            )}
          </Section>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <Button variant="outline" className="self-start text-destructive hover:text-destructive max-md:h-11" disabled={busy || !live} onClick={() => void reset()} data-testid="memory-reset">{t('world.mem.reset')}</Button>
            <p className="text-caption text-muted-foreground">{t('world.mem.reset.hint')}</p>
          </div>
        </>
      )}
      {confirmDialog}
    </div>
  )
}

// ---------- the profile editor's read-only card ----------

/** "Learned memory": exactly what the rules for all chats add to the DM's input, after the profile's blocks. Not editable here. */
export function LearnedMemoryCard() {
  const t = useT()
  const { data } = useLearned()
  const openMemory = () => useApp.getState().focusWorldProfile(MEMORY_ID)
  return (
    <section className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3" data-testid="block-learned">
      <h3 className="flex items-center gap-1.5 text-body font-medium"><Brain className="size-4 text-muted-foreground" aria-hidden="true" />{t('world.mem.card.title')}</h3>
      <p className="text-caption text-muted-foreground">{t('world.mem.card.lead')}</p>
      {data && data.rules.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-caption">
          {data.rules.map((r) => <li key={r.id}>{leverText(t, r.lever.key, r.lever.to)} <span className="text-muted-foreground">· {t('world.mem.scope.all')}</span></li>)}
        </ul>
      )}
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background/60 p-2 font-mono text-caption text-muted-foreground" data-testid="learned-note">{data?.note || t('world.mem.card.none')}</pre>
      <Button variant="outline" size="sm" className="self-start max-md:h-10" onClick={openMemory} data-testid="learned-open">{t('world.mem.card.open')}</Button>
    </section>
  )
}

// ---------- the chat sheet's card ----------

/** "What the DM learns": the switch, the levers in force, the line "N learned rules in force", a way to Memory and the log of every proposal and answer. */
export function LearningCard({ chatId, view, save, on }: {
  chatId: string
  view: WorldView
  save: (patch: Partial<WorldView['settings']>) => Promise<unknown>
  on: boolean
}) {
  const t = useT()
  const relativeTime = useRelativeTime()
  const { data } = useLearned(chatId, `${view.lastRunAt ?? 0}|${view.learn.rules}|${view.learn.waiting}|${view.settings.things}`)
  const log = data?.log ?? []
  const enabled = view.settings.learn !== false
  const openMemory = () => useApp.getState().focusWorldProfile(`${MEMORY_ID}#${chatId}`)
  return (
    <Section variant="tinted" tone="violet" icon={Brain} id="learn" title={t('world.learn.title')} dimmed={!on}>
      <SettingRow label={t('world.learn.switch')} info={t('world.learn.hint')}>
        <Switch checked={enabled} onCheckedChange={(v) => void save({ learn: v })} aria-label={t('world.learn.switch')} />
      </SettingRow>
      <SettingRow label={t('world.learn.things')} info={t('world.learn.things.hint')}>
        <Segmented label={t('world.learn.things')} value={view.settings.things} onChange={(v) => void save({ things: v })} options={(['all', 'reasons', 'off'] as WorldThings[]).map((v) => ({ id: v, label: t(`world.things.${v}` as MsgKey) }))} />
      </SettingRow>
      <div className="flex flex-col gap-2 px-4 py-3">
        <p className="text-caption text-muted-foreground" data-testid="learn-rules" aria-live="polite">{t('world.learn.rules', { n: view.learn.rules })}</p>
        {view.learn.waiting > 0 && <p className="text-caption font-medium text-foreground" data-testid="learn-waiting">{t('world.learn.waiting')}</p>}
        <Button variant={view.learn.waiting > 0 ? 'default' : 'outline'} className="w-full max-md:h-11" onClick={openMemory} data-testid="learn-open">{t('world.learn.open')}</Button>
      </div>
      <div data-testid="learn-log">
        <Fold id="learn-log" title={t('world.learn.log')} summary={log.length ? learnLine(t, log[0]!) : t('world.learn.log.empty')} flat>
          <div className="flex flex-col gap-1 px-4 py-2">
            {log.length === 0 && <p className="text-caption text-muted-foreground">{t('world.learn.log.empty')}</p>}
            {log.length > 0 && (
              <ul className="flex flex-col gap-1 text-caption">
                {log.slice(0, 30).map((l, i) => (
                  <li key={`${l.at}-${l.act}-${i}`} className="text-foreground">{learnLine(t, l)} <span className="text-muted-foreground">· {relativeTime(l.at)}</span></li>
                ))}
              </ul>
            )}
          </div>
        </Fold>
      </div>
    </Section>
  )
}
