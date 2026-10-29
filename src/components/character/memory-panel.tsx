import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowsClockwise, BookOpenText, CaretRight, CheckCircle, CircleNotch, DotsThree, Trash, Warning, Waves } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { ApiError } from '@/lib/engine'
import { resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Character } from '@/lib/types'
import {
  type MemoryOwner,
  type MemoryView,
  type MemSource,
  MEM_MAX_TOKENS,
  MEM_MIN_TOKENS,
  HABITS_MAX_TOKENS,
  HABITS_MIN_TOKENS,
  deleteMemorySource,
  fetchMemory,
  putMemory,
} from './memory-api'
import { MEMORY_TEXT } from './memory-kind'
import { AddButton, Block } from './memory-block'
import { HabitsBlock } from './memory-habits'
import { MemoryImportDialog } from './memory-import-dialog'
import { StoryLines } from './memory-story-lines'

// the card keeps its old key; a persona's and a world's carry their kind
const openKey = (o: MemoryOwner) => (o.kind === 'card' ? `rp-mem-open:${o.id}` : `rp-mem-open:${o.kind}:${o.id}`)
const readOpen = (o: MemoryOwner): string[] => {
  try { const v = JSON.parse(sessionStorage.getItem(openKey(o)) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] }
}
const writeOpen = (o: MemoryOwner, ids: string[]) => { try { sessionStorage.setItem(openKey(o), JSON.stringify(ids)) } catch { /* private window */ } }

const HABIT_ERRORS = ['full', 'repeat', 'empty', 'missing'] as const
/** A failed change in the app's language when the route sends a code it knows; its own text otherwise. */
const message = (e: unknown, t: ReturnType<typeof useT>) => {
  if (e instanceof ApiError && e.code && (HABIT_ERRORS as readonly string[]).includes(e.code)) {
    return t(`mem.habits.err.${e.code as (typeof HABIT_ERRORS)[number]}`, { max: String(e.data?.max ?? '') })
  }
  return e instanceof Error && e.message ? e.message : String(e)
}

/** The long memory of one owner: the stories it remembers, importing a chat into that memory, and how much
 *  room the memory takes in chats. The owner is a card (its Memory tab, with habits), a persona or a saved
 *  World DM world (stories only; a chat takes those in only when it opts in). Changes act at once (like the
 *  favourite star and the Soul tab); there is no draft and no Save. */
export function MemoryPanel({ owner, card }: { owner: MemoryOwner; card?: Character }) {
  const t = useT()
  const txt = MEMORY_TEXT[owner.kind]
  const isCard = owner.kind === 'card'
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const [data, setData] = useState<MemoryView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ chatId: string | null } | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  // which stories are opened, remembered per card for this browser tab
  const [open, setOpen] = useState<string[]>(() => readOpen(owner))
  const toggle = (id: string) => setOpen((cur) => { const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; writeOpen(owner, next); return next })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(() => {
    setLoadError(null)
    fetchMemory(owner)
      .then((v) => { if (alive.current) setData(v) })
      .catch((e) => { if (alive.current) setLoadError(message(e, t)) })
  }, [owner.kind, owner.id])
  useEffect(() => { load() }, [load])

  /** Runs one change on the server and shows what it answered; a failure is a toast and the old view. */
  const apply = async (run: () => Promise<MemoryView>) => {
    try {
      const v = await run()
      if (alive.current) setData(v)
      return true
    } catch (e) {
      toast.error(message(e, t))
      return false
    }
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3 text-sm text-muted-foreground" role="status">
        {loadError ? (
          <>
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-foreground">
              <Warning className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
              {t('mem.loadError', { error: loadError })}
            </p>
            <Button variant="outline" size="sm" className="w-fit max-md:h-10" onClick={load}>
              <ArrowsClockwise aria-hidden="true" />{t('mem.retry')}
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2"><CircleNotch className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t('mem.loading')}</p>
        )}
      </div>
    )
  }

  const { memory, chats } = data
  const sources = memory.sources
  const chatIds = new Set(chats.map((x) => x.id))
  const anyGone = sources.some((s) => !chatIds.has(s.chatId))

  const setOn = (s: MemSource, on: boolean) => {
    // the switch moves at once; the server's answer (or the old state on an error) settles it
    setData({ ...data, memory: { ...memory, sources: sources.map((x) => (x.id === s.id ? { ...x, on } : x)) } })
    void apply(() => putMemory(owner, { source: { id: s.id, on } })).then((ok) => { if (!ok) load() })
  }
  const remove = async (s: MemSource) => {
    const sure = await confirm({
      title: t('mem.remove.title', { title: s.title || t('mem.untitled') }),
      description: t(txt.removeText, { name: owner.name }),
      actionLabel: t('mem.remove.action'),
    })
    if (sure && (await apply(() => deleteMemorySource(owner, s.id)))) toast.success(t('mem.removed'))
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t(txt.intro, { name: owner.name })}</p>

      <Block tone="sky" icon={BookOpenText} title={t('mem.stories')} count={sources.length}>
        {sources.length === 0 ? (
          <Empty className="gap-3 border border-dashed border-border p-5" data-testid="mem-empty">
            <EmptyHeader>
              <EmptyTitle>{t('mem.empty.title')}</EmptyTitle>
              <EmptyDescription>{t(txt.emptyText, { name: owner.name })}</EmptyDescription>
            </EmptyHeader>
            <AddButton onClick={() => setDialog({ chatId: null })} label={t('mem.add')} primary />
          </Empty>
        ) : (
          <>
            <ul className="flex flex-col" data-testid="mem-stories">
              {sources.map((s) => {
                const title = s.title || t('mem.untitled')
                const exists = chatIds.has(s.chatId)
                const isOpen = open.includes(s.id)
                return (
                  <li key={s.id} className="border-t border-border py-2 first:border-t-0 first:pt-0" data-testid="mem-story">
                    <div className="flex items-center gap-3">
                      <Switch checked={s.on} onCheckedChange={(v) => setOn(s, v)} aria-label={t('mem.story.use', { title })} className="max-md:after:-inset-y-4" />
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={t(isOpen ? 'mem.story.collapse' : 'mem.story.expand', { title })}
                        onClick={() => toggle(s.id)}
                        className="flex min-h-10 min-w-0 flex-1 items-start gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        <CaretRight className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', isOpen && 'rotate-90')} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-sm font-medium', !s.on && 'text-muted-foreground')}>{title}</span>
                          <span className="block text-xs text-muted-foreground">{summary(s, t, lang)}</span>
                          <ChatBadge exists={exists} t={t} className="mt-1 md:hidden" />
                        </span>
                      </button>
                      <ChatBadge exists={exists} t={t} className="max-md:hidden" />
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="max-md:size-10" aria-label={t('mem.menu', { title })} />}>
                          <DotsThree className="size-5" weight="bold" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-52">
                          {exists && (
                            <DropdownMenuItem className="max-md:min-h-10" onClick={() => setDialog({ chatId: s.chatId })}>
                              <ArrowsClockwise aria-hidden="true" />{t('mem.again')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive max-md:min-h-10" onClick={() => void remove(s)}>
                            <Trash aria-hidden="true" />{t('mem.remove')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {isOpen && <StoryLines owner={owner} source={s} t={t} apply={apply} />}
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">{t('mem.stories.hint')}{anyGone && ` ${t('mem.chatGone.hint')}`}</p>
            <AddButton onClick={() => setDialog({ chatId: null })} label={t('mem.add')} />
          </>
        )}
      </Block>

      {isCard && card && <HabitsBlock c={card} data={data} t={t} apply={apply} />}

      <InjectBlock owner={owner} data={data} t={t} apply={apply} />

      <p className="text-xs text-muted-foreground">{t('mem.saved')}</p>

      {dialog && (
        <MemoryImportDialog
          open
          onOpenChange={(o) => { if (!o) setDialog(null) }}
          owner={owner}
          chats={chats}
          initialChatId={dialog.chatId}
          onDone={(v) => { setData(v); setDialog(null); toast.success(t('mem.dlg.added')) }}
        />
      )}
      {confirmDialog}
    </div>
  )
}

/** "added 3 Mar 2026 · 4 facts, 2 notes, story summary" (zeros are left out). */
function summary(s: MemSource, t: ReturnType<typeof useT>, lang: string) {
  const date = new Date(s.importedAt).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
  const parts = [
    s.facts.length ? t('mem.count.facts', { n: s.facts.length }) : '',
    s.notes.length ? t('mem.count.notes', { n: s.notes.length }) : '',
    s.said.length ? t('mem.count.said', { n: s.said.length }) : '',
    s.arc ? t('mem.count.arc') : '',
  ].filter(Boolean)
  return `${t('mem.story.added', { date })} · ${parts.length ? parts.join(', ') : t('mem.count.none')}`
}

function ChatBadge({ exists, t, className }: { exists: boolean; t: ReturnType<typeof useT>; className?: string }) {
  return exists ? (
    <Badge variant="outline" className={cn('w-fit gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', className)}>
      <CheckCircle weight="fill" aria-hidden="true" />{t('mem.chatExists')}
    </Badge>
  ) : (
    <Badge variant="outline" className={cn('w-fit gap-1 border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300', className)}>
      <Warning weight="fill" aria-hidden="true" />{t('mem.chatGone')}
    </Badge>
  )
}

/** "In new chats": the switch for the memory and the room in the prompt for the memory and (a card) for the habits. */
function InjectBlock({ owner, data, t, apply }: { owner: MemoryOwner; data: MemoryView; t: ReturnType<typeof useT>; apply: (run: () => Promise<MemoryView>) => Promise<boolean> }) {
  const { inject } = data.memory
  const txt = MEMORY_TEXT[owner.kind]
  return (
    <Block tone="emerald" icon={Waves} title={t(txt.injectTitle)}>
      <label className="flex min-h-8 items-center gap-3 text-sm max-md:min-h-10">
        <Switch checked={inject.enabled} onCheckedChange={(v) => void apply(() => putMemory(owner, { inject: { enabled: v } }))} aria-label={t(txt.injectSwitch)} className="max-md:after:-inset-y-4" />
        {t(txt.injectSwitch)}
      </label>
      <TokenField
        id={`mem-budget-${owner.kind}-${owner.id}`}
        label={t('mem.inject.tokens')}
        unit={t('mem.inject.unit')}
        value={inject.maxTokens}
        min={MEM_MIN_TOKENS}
        max={MEM_MAX_TOKENS}
        onCommit={(v) => apply(() => putMemory(owner, { inject: { maxTokens: v } }))}
      />
      <p className="text-xs text-muted-foreground">{inject.enabled ? t(txt.injectHint, { tokens: data.tokens, budget: data.budget }) : t(txt.injectOff)}</p>
      {owner.kind === 'card' && (
        <TokenField
          id={`mem-habits-budget-${owner.id}`}
          label={t('mem.inject.habits')}
          unit={t('mem.inject.habits.unit')}
          value={inject.habitsMaxTokens}
          min={HABITS_MIN_TOKENS}
          max={HABITS_MAX_TOKENS}
          onCommit={(v) => apply(() => putMemory(owner, { inject: { habitsMaxTokens: v } }))}
        />
      )}
    </Block>
  )
}

/** A number of tokens that is saved when the field is left (or Enter); the server's clamped value wins after every save. */
function TokenField({ id, label, unit, value, min, max, onCommit }: { id: string; label: string; unit: string; value: number; min: number; max: number; onCommit: (v: number) => Promise<unknown> }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const commit = async () => {
    const n = Math.round(Number(text))
    const v = Number.isFinite(n) && text.trim() !== '' ? Math.min(max, Math.max(min, n)) : value
    setText(String(v))
    if (v !== value) await onCommit(v)
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={50}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-28 max-md:h-10"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}
