import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, DotsThree, ListChecks, PencilSimple, Trash, Trophy, X } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { HabitForm, type Values } from '@/components/character/memory-habits'
import { fetchLitConfig, litHabitOp, type LitChat, type LitHabit, type LitHabitOp } from './litopys-api'
import type { TabProps } from './ledger-facts'

const PIPS = [0, 1, 2, 3, 4]
const FRESH = 60 * 60_000
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Habits the characters showed in this chat (#106): the earned ones act in the chat at once, the candidates wait
 *  for one more scene. Every call answers the whole chat view, like the other tabs. */
export function HabitsTab({ chat, onChat }: TabProps) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [openEv, setOpenEv] = useState<string[]>([])
  const [cfg, setCfg] = useState<{ habits: boolean; after: number | null }>({ habits: true, after: null })
  // a switch moves at once; the answer settles it
  const [pending, setPending] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let live = true
    fetchLitConfig()
      .then((c) => { if (live) setCfg({ habits: c.habits !== false, after: typeof c.habitsEarnAfter === 'number' ? c.habitsEarnAfter : null }) })
      .catch(() => { /* the texts fall back to the generic wording */ })
    return () => { live = false }
  }, [])

  const all = chat.habits ?? []
  const earned = all.filter((k) => k.status === 'active')
  const candidates = all.filter((k) => k.status === 'proposed')

  const run = async (k: LitHabit, o: LitHabitOp): Promise<boolean> => {
    setBusy(k.id)
    try {
      onChat(await litHabitOp(chat.chatId, k.id, o))
      return true
    } catch (e) {
      toast.error(errText(e))
      return false
    } finally {
      setBusy(null)
    }
  }
  const setOn = (k: LitHabit, on: boolean) => {
    setPending((p) => ({ ...p, [k.id]: on }))
    void run(k, { op: 'on', on }).finally(() => setPending(({ [k.id]: _gone, ...rest }) => rest))
  }
  const accept = async (k: LitHabit) => { if (await run(k, { op: 'accept' })) toast.success(t('lit.habits.accepted', { name: k.name })) }
  const keep = async (k: LitHabit) => { if (await run(k, { op: 'keep' })) toast.success(t('lit.habits.keptToast', { who: k.who })) }
  const reject = async (k: LitHabit, ask: boolean) => {
    if (ask && !(await confirm({ title: t('lit.habits.reject.title', { name: k.name }), description: t('lit.habits.reject.text'), actionLabel: t('lit.habits.reject') }))) return
    if (await run(k, { op: 'reject' })) toast.success(t('lit.habits.rejected'))
  }
  const save = async (k: LitHabit, v: Values) => {
    const ok = await run(k, { op: 'edit', ...v })
    if (ok) { setEditing(null); toast.success(t('lit.habits.saved')) }
    return ok
  }
  const toggleEv = (id: string) => setOpenEv((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const form = (k: LitHabit) => (
    <HabitForm key={k.id} t={t} name={k.who} initial={{ name: k.name, rule: k.rule, when: k.when }} submitLabel={t('lit.habits.save')} onCancel={() => setEditing(null)} onSubmit={(v) => save(k, v)} />
  )

  const evidence = (k: LitHabit) => {
    if (!k.evidence.length) return null
    const open = openEv.includes(k.id)
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => toggleEv(k.id)}
          className="flex min-h-6 w-fit items-center rounded-md text-xs text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-h-10"
        >
          {open ? t('lit.habits.evidence.hide') : t('lit.habits.evidence.show', { n: k.evidence.length })}
        </button>
        {open && (
          <ul className="flex flex-col gap-1.5" data-testid="lit-habit-evidence">
            {k.evidence.map((e) => (
              <li key={`${e.chapter}:${e.text}`} className="border-l-2 border-violet-500/40 pl-2 text-xs break-words">
                <span className="whitespace-pre-line">“{e.text}”</span>
                {chapterLabel(chat, e.chapter) && <span className="text-muted-foreground"> · {chapterLabel(chat, e.chapter)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="ledger-habits">
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <p>{t('lit.habits.intro')}</p>
        {!cfg.habits && <p className="font-medium text-amber-800 dark:text-amber-300">{t('lit.habits.off')}</p>}
      </div>

      {all.length === 0 && <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground" data-testid="lit-habits-empty">{t('lit.habits.empty')}</p>}

      {earned.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="lit-habits-earned">
          <h3 id="lit-habits-earned" className="flex items-center gap-1.5 text-sm font-medium">
            <Trophy className="size-4 text-violet-700 dark:text-violet-300" weight="fill" aria-hidden="true" />{t('lit.habits.earned')}
            <Badge variant="secondary" className="px-1.5">{earned.length}</Badge>
          </h3>
          <ul className="flex flex-col gap-2">
            {earned.map((k) => {
              const on = pending[k.id] ?? k.on
              const fresh = !!k.earnedAt && Date.now() - k.earnedAt < FRESH
              return (
                <li key={k.id} className="rounded-md border border-violet-500/40 bg-card p-3" data-testid="lit-habit-earned">
                  {editing === k.id ? form(k) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-3">
                        <Switch checked={on} onCheckedChange={(v) => setOn(k, v)} aria-label={t('lit.habits.use', { name: k.name })} className="mt-1.5 max-md:mt-3 max-md:after:-inset-y-4" />
                        <div className="min-w-0 flex-1 py-1">
                          <HabitText k={k} t={t} muted={!on} badge={fresh ? <Badge className="border-violet-500/50 bg-violet-500/15 text-violet-800 dark:text-violet-200">{t('lit.habits.new')}</Badge> : null} />
                          <Level k={k} need={cfg.after} t={t} />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="max-md:size-10" aria-label={t('lit.habits.menu', { name: k.name })} />}>
                            <DotsThree className="size-5" weight="bold" aria-hidden="true" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-40">
                            <DropdownMenuItem className="max-md:min-h-10" onClick={() => setEditing(k.id)}><PencilSimple aria-hidden="true" />{t('lit.habits.edit')}</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive max-md:min-h-10" onClick={() => void reject(k, true)}><Trash aria-hidden="true" />{t('lit.habits.reject')}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {evidence(k)}
                      <div className="flex flex-wrap items-center gap-2">
                        {k.kept ? (
                          <Button size="sm" variant="outline" className="max-md:h-10" disabled data-testid="lit-habit-kept"><Check aria-hidden="true" />{t('lit.habits.kept')}</Button>
                        ) : (
                          <Button size="sm" className="max-md:h-10" disabled={busy === k.id} onClick={() => void keep(k)} data-testid="lit-habit-keep"><ListChecks aria-hidden="true" />{t('lit.habits.keep')}</Button>
                        )}
                        <span className="text-xs text-muted-foreground">{k.kept ? t('lit.habits.kept.hint', { who: k.who }) : t('lit.habits.keep.hint', { who: k.who })}</span>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {candidates.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="lit-habits-cand">
          <header>
            <h3 id="lit-habits-cand" className="flex items-center gap-1.5 text-sm font-medium">
              {t('lit.habits.candidates')}
              <Badge variant="secondary" className="px-1.5">{candidates.length}</Badge>
            </h3>
            <p className="text-xs text-muted-foreground">{t('lit.habits.candidates.hint')}</p>
          </header>
          <ul className="flex flex-col gap-2">
            {candidates.map((k) => (
              <li key={k.id} className="rounded-md border border-dashed border-violet-500/50 bg-card p-3" data-testid="lit-habit-candidate">
                {editing === k.id ? form(k) : (
                  <div className="flex flex-col gap-2">
                    <div className="min-w-0">
                      <HabitText k={k} t={t} />
                      <Level k={k} need={cfg.after} t={t} />
                    </div>
                    {evidence(k)}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="max-md:h-10" disabled={busy === k.id} onClick={() => void accept(k)}><Check aria-hidden="true" />{t('lit.habits.accept')}</Button>
                      <Button size="sm" variant="outline" className="max-md:h-10" disabled={busy === k.id} onClick={() => setEditing(k.id)}><PencilSimple aria-hidden="true" />{t('lit.habits.edit')}</Button>
                      <Button size="sm" variant="ghost" className="max-md:h-10" disabled={busy === k.id} onClick={() => void reject(k, false)}><X aria-hidden="true" />{t('lit.habits.reject')}</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {confirmDialog}
    </div>
  )
}

const chapterLabel = (chat: LitChat, id: string) => chat.chapters.find((c) => c.id === id)?.label ?? ''

function HabitText({ k, t, muted, badge }: { k: LitHabit; t: ReturnType<typeof useT>; muted?: boolean; badge?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={cn('break-words text-sm font-medium', muted && 'text-muted-foreground')}>{k.name}</span>
        <Badge variant="outline" className="max-w-full truncate text-[10px]">{k.who}</Badge>
        {badge}
      </div>
      <span className={cn('line-clamp-3 break-words text-sm whitespace-pre-line', muted && 'text-muted-foreground')}>{k.rule}</span>
      {k.when && <span className="break-words text-xs text-muted-foreground">{t('mem.habits.when', { when: k.when })}</span>}
    </div>
  )
}

/** How far the habit is: pips for the scenes it showed in (of the scenes it needs, when known) and a line in words. */
function Level({ k, need, t }: { k: LitHabit; need: number | null; t: ReturnType<typeof useT> }) {
  const goal = need ?? Math.max(2, k.seen)
  const pips = Math.min(goal, 5)
  const earned = k.status === 'active'
  const left = need !== null ? Math.max(1, need - k.seen) : 1
  const text = earned
    ? t('lit.habits.seen', { n: k.seen })
    : need === null ? t('lit.habits.cand.generic')
    : k.seen <= 1 ? t('lit.habits.cand.one', { left })
    : t('lit.habits.cand.some', { seen: k.seen, left })
  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground" data-testid="lit-habit-level">
      <span className="flex gap-0.5" aria-hidden="true">
        {PIPS.slice(0, pips).map((n) => (
          <span key={n} className={cn('size-2 rounded-full border border-violet-500/60', n < k.seen && 'bg-violet-500/80')} />
        ))}
      </span>
      <span>{text}</span>
    </div>
  )
}
