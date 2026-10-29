import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Check, DotsThree, ListChecks, PencilSimple, Trash, Warning, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ui/confirm'
import type { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import type { Character } from '@/lib/types'
import { type MemoryView, type MemHabit, deleteCardMemoryHabit, putCardMemory } from './memory-api'
import { AddButton, Block } from './memory-block'

type T = ReturnType<typeof useT>
type Apply = (run: () => Promise<MemoryView>) => Promise<boolean>

const NAME_MAX = 80
const WHEN_MAX = 160
const RULE_MAX = 700
const RULE_LINES = 6

/** How many non-empty lines a rule has (the server keeps the first six and drops the empty ones). */
const countLines = (rule: string) => rule.split(/\r?\n/).filter((l) => l.trim()).length

export interface Values { name: string; rule: string; when: string }

/** The card's habits: short rules for how the character acts. Proposals wait for a yes at the top; the
 *  accepted ones have a switch each. Changes act at once, like the rest of the Memory tab. */
export function HabitsBlock({ c, data, t, apply }: { c: Character; data: MemoryView; t: T; apply: Apply }) {
  const [confirm, confirmDialog] = useConfirm()
  // "new" adds a habit, an id edits that habit (proposal or accepted)
  const [editing, setEditing] = useState<string | null>(null)
  // a switch moves at once; the server's answer settles it, and a failure drops the entry so it springs back
  const [pending, setPending] = useState<Record<string, boolean>>({})
  // habits whose rule is shown in full
  const [full, setFull] = useState<string[]>([])

  const all = data.memory.habits
  const proposed = all.filter((k) => k.state === 'proposed')
  const accepted = all.filter((k) => k.state !== 'proposed')

  const setOn = (k: MemHabit, on: boolean) => {
    setPending((p) => ({ ...p, [k.id]: on }))
    void apply(() => putCardMemory(c.id, { habit: { id: k.id, on } })).finally(() => setPending(({ [k.id]: _gone, ...rest }) => rest))
  }
  const accept = async (k: MemHabit) => {
    if (await apply(() => putCardMemory(c.id, { habit: { id: k.id, state: 'accepted' } }))) toast.success(t('mem.habits.accepted'))
  }
  const dismiss = async (k: MemHabit) => {
    if (await apply(() => deleteCardMemoryHabit(c.id, k.id))) toast.success(t('mem.habits.dismissed'))
  }
  const remove = async (k: MemHabit) => {
    const sure = await confirm({
      title: t('mem.habits.remove.title', { name: k.name }),
      description: t('mem.habits.remove.text', { name: c.name }),
      actionLabel: t('mem.habits.remove.action'),
    })
    if (sure && (await apply(() => deleteCardMemoryHabit(c.id, k.id)))) toast.success(t('mem.habits.removed'))
  }
  /** Saves the form: a new habit, a changed one, or a proposal changed and accepted in the same call. */
  const save = async (k: MemHabit | null, v: Values) => {
    const habit = k ? { id: k.id, ...v, ...(k.state === 'proposed' ? { state: 'accepted' as const } : {}) } : { ...v }
    const ok = await apply(() => putCardMemory(c.id, { habit }))
    if (ok) {
      setEditing(null)
      toast.success(t(!k ? 'mem.habits.added' : k.state === 'proposed' ? 'mem.habits.accepted' : 'mem.habits.saved'))
    }
    return ok
  }
  const toggleFull = (id: string) => setFull((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const form = (k: MemHabit | null, onCard = false) => (
    <HabitForm
      key={k?.id ?? 'new'}
      onCard={onCard}
      t={t}
      name={c.name}
      initial={k ? { name: k.name, rule: k.rule, when: k.when } : { name: '', rule: '', when: '' }}
      submitLabel={!k ? t('mem.habits.form.add') : k.state === 'proposed' ? t('mem.habits.form.saveAccept') : t('mem.habits.form.save')}
      onCancel={() => setEditing(null)}
      onSubmit={(v) => save(k, v)}
    />
  )

  const none = all.length === 0

  return (
    <Block tone="violet" icon={ListChecks} title={t('mem.habits')} count={accepted.length}>
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        <p>{t('mem.habits.hint', { name: c.name })}</p>
        <p data-testid="mem-habits-cost">{t('mem.habits.cost', { tokens: data.habitsTokens ?? 0, budget: data.habitsBudget ?? 0 })}</p>
      </div>

      {proposed.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2.5" aria-labelledby={`${c.id}-habits-waiting`} data-testid="mem-habits-waiting">
          <header>
            <h4 id={`${c.id}-habits-waiting`} className="flex items-center gap-1.5 text-sm font-medium">
              <Warning className="size-4 shrink-0 text-amber-700 dark:text-amber-300" weight="fill" aria-hidden="true" />{t('mem.habits.waiting', { n: proposed.length })}
            </h4>
            <p className="text-xs text-muted-foreground">{t('mem.habits.waiting.hint')}</p>
          </header>
          <ul className="flex flex-col gap-2">
            {proposed.map((k) =>
              editing === k.id ? (
                <li key={k.id} data-testid="mem-habit-proposal">{form(k, true)}</li>
              ) : (
                <li key={k.id} className="flex flex-col gap-2 rounded-md border border-border bg-card p-2.5" data-testid="mem-habit-proposal">
                  <HabitText k={k} t={t} full />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="max-md:h-10" onClick={() => void accept(k)}><Check aria-hidden="true" />{t('mem.habits.accept')}</Button>
                    <Button size="sm" variant="outline" className="max-md:h-10" onClick={() => setEditing(k.id)}><PencilSimple aria-hidden="true" />{t('mem.habits.edit')}</Button>
                    <Button size="sm" variant="ghost" className="max-md:h-10" onClick={() => void dismiss(k)}><X aria-hidden="true" />{t('mem.habits.dismiss')}</Button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {none && editing !== 'new' ? (
        <Empty className="gap-3 border border-dashed border-border p-5" data-testid="mem-habits-empty">
          <EmptyHeader>
            <EmptyTitle>{t('mem.habits.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('mem.habits.empty.text', { name: c.name })}</EmptyDescription>
          </EmptyHeader>
          <AddButton onClick={() => setEditing('new')} label={t('mem.habits.add')} primary />
        </Empty>
      ) : (
        <>
          {accepted.length > 0 && (
            <ul className="flex flex-col" data-testid="mem-habits">
              {accepted.map((k) => {
                const on = pending[k.id] ?? k.on
                const isFull = full.includes(k.id)
                const long = countLines(k.rule) > 2 || k.rule.length > 140
                return editing === k.id ? (
                  <li key={k.id} className="border-t border-border py-2 first:border-t-0 first:pt-0" data-testid="mem-habit">{form(k)}</li>
                ) : (
                  <li key={k.id} className="flex items-start gap-3 border-t border-border py-2 first:border-t-0 first:pt-0" data-testid="mem-habit">
                    <Switch checked={on} onCheckedChange={(v) => setOn(k, v)} aria-label={t('mem.habits.use', { name: k.name })} className="mt-1.5 max-md:mt-3 max-md:after:-inset-y-4" />
                    <div className="min-w-0 flex-1 py-1">
                      <HabitText k={k} t={t} muted={!on} full={isFull} />
                      {long && (
                        <button
                          type="button"
                          aria-expanded={isFull}
                          onClick={() => toggleFull(k.id)}
                          className="mt-0.5 flex min-h-6 items-center rounded-md px-0.5 text-xs text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-h-10"
                        >
                          {isFull ? t('mem.habits.less') : t('mem.habits.more')}
                        </button>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="max-md:size-10" aria-label={t('mem.habits.menu', { name: k.name })} />}>
                        <DotsThree className="size-5" weight="bold" aria-hidden="true" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-40">
                        <DropdownMenuItem className="max-md:min-h-10" onClick={() => setEditing(k.id)}><PencilSimple aria-hidden="true" />{t('mem.habits.edit')}</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive max-md:min-h-10" onClick={() => void remove(k)}><Trash aria-hidden="true" />{t('mem.habits.remove')}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                )
              })}
            </ul>
          )}
          {editing === 'new' ? form(null) : <AddButton onClick={() => setEditing('new')} label={t('mem.habits.add')} disabled={editing !== null} />}
        </>
      )}
      {confirmDialog}
    </Block>
  )
}

/** Name, rule, "when" and where the habit came from. Accepted habits clip the rule to two lines unless `full`. */
function HabitText({ k, t, muted, full }: { k: MemHabit; t: T; muted?: boolean; full?: boolean }) {
  const origin =
    k.state === 'proposed'
      ? k.from?.title ? t('mem.habits.from.story', { title: k.from.title }) : k.origin === 'molfar' ? t('mem.habits.from.molfar') : t('mem.habits.from.other')
      : k.origin === 'molfar' ? t('mem.habits.by.molfar')
      : k.origin === 'story' ? (k.from?.title ? t('mem.habits.from.story', { title: k.from.title }) : t('mem.habits.from.storyNoTitle'))
      : t('mem.habits.by.user')
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={cn('break-words text-sm font-medium', muted && 'text-muted-foreground')}>{k.name}</span>
      <span className={cn('break-words text-sm whitespace-pre-line', !full && 'line-clamp-2', muted && 'text-muted-foreground')}>{k.rule}</span>
      {k.when && <span className="break-words text-xs text-muted-foreground">{t('mem.habits.when', { when: k.when })}</span>}
      <span className="break-words text-xs text-muted-foreground">{origin}</span>
    </div>
  )
}

/** The form for one habit, used to add, to edit and to edit-then-accept a proposal. It is not a <form>: Enter in
 *  a single-line field does nothing, Save is the button (Esc cancels). */
export function HabitForm({ t, name: cardName, initial, submitLabel, onCancel, onSubmit, onCard }: { onCard?: boolean; t: T; name: string; initial: Values; submitLabel: string; onCancel: () => void; onSubmit: (v: Values) => Promise<boolean> }) {
  const uid = useId()
  const [v, setV] = useState<Values>(initial)
  const [busy, setBusy] = useState(false)
  const lines = countLines(v.rule)
  const tooMany = lines > RULE_LINES
  const missing = !v.name.trim() || !v.rule.trim()
  const blocked = missing || tooMany
  const submit = async () => {
    if (blocked || busy) return
    setBusy(true)
    try { await onSubmit({ name: v.name.trim(), rule: v.rule.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n'), when: v.when.trim() }) } finally { setBusy(false) }
  }
  const keys = (e: React.KeyboardEvent, single: boolean) => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
    else if (single && e.key === 'Enter') e.preventDefault()
    else if (!single && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit() }
  }
  return (
    <div className={cn('flex flex-col gap-3 rounded-md border border-border p-2.5', onCard ? 'bg-card' : 'bg-muted/30')} data-testid="mem-habit-form">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-name`} className="text-xs font-medium">{t('mem.habits.form.name')}</label>
        <Input id={`${uid}-name`} autoFocus value={v.name} maxLength={NAME_MAX} placeholder={t('mem.habits.form.name.ph')} className="max-md:h-10" onChange={(e) => setV({ ...v, name: e.target.value })} onKeyDown={(e) => keys(e, true)} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-rule`} className="text-xs font-medium">{t('mem.habits.form.rule')}</label>
        <Textarea
          id={`${uid}-rule`}
          value={v.rule}
          rows={4}
          maxLength={RULE_MAX}
          placeholder={t('mem.habits.form.rule.ph')}
          aria-describedby={`${uid}-rule-hint`}
          aria-invalid={tooMany || undefined}
          className="min-h-24 text-sm"
          onChange={(e) => setV({ ...v, rule: e.target.value })}
          onKeyDown={(e) => keys(e, false)}
        />
        <p id={`${uid}-rule-hint`} className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
          <span>{t('mem.habits.form.rule.hint', { name: cardName })}</span>
          <span className={cn('tabular-nums', tooMany && 'font-medium text-destructive')} aria-live="polite">
            {tooMany ? t('mem.habits.form.tooMany', { max: RULE_LINES }) : t('mem.habits.form.lines', { n: lines, max: RULE_LINES })}
          </span>
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-when`} className="text-xs font-medium">{t('mem.habits.form.when')}</label>
        <Input id={`${uid}-when`} value={v.when} maxLength={WHEN_MAX} placeholder={t('mem.habits.form.when.ph')} className="max-md:h-10" onChange={(e) => setV({ ...v, when: e.target.value })} onKeyDown={(e) => keys(e, true)} />
        <p className="text-xs text-muted-foreground">{t('mem.habits.form.when.hint')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="max-md:h-10" disabled={blocked || busy} onClick={() => void submit()}>{submitLabel}</Button>
        <Button size="sm" variant="outline" className="max-md:h-10" disabled={busy} onClick={onCancel}>{t('home.cancel')}</Button>
        {missing && <span className="text-xs text-muted-foreground">{t('mem.habits.form.need')}</span>}
      </div>
    </div>
  )
}
