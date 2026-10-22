import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowsClockwise, BookOpenText, CaretRight, CheckCircle, CircleNotch, DotsThree, Plus, Trash, Warning, Waves } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Character } from '@/lib/types'
import {
  type CardMemoryView,
  type MemSource,
  MEM_MAX_TOKENS,
  MEM_MIN_TOKENS,
  deleteCardMemorySource,
  fetchCardMemory,
  putCardMemory,
} from './memory-api'
import { MemoryImportDialog } from './memory-import-dialog'
import { StoryLines } from './memory-story-lines'

const openKey = (cardId: string) => `rp-mem-open:${cardId}`
const readOpen = (cardId: string): string[] => {
  try { const v = JSON.parse(sessionStorage.getItem(openKey(cardId)) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] }
}
const writeOpen = (cardId: string, ids: string[]) => { try { sessionStorage.setItem(openKey(cardId), JSON.stringify(ids)) } catch { /* private window */ } }

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : String(e))

/** The Memory tab of the card editor: the stories the character remembers, importing a chat into
 *  that memory, and how much room the memory takes in new chats. Changes act at once (like the
 *  favourite star and the Soul tab); this tab has no draft and no Save. */
export function MemoryTab({ c }: { c: Character }) {
  const t = useT()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const [data, setData] = useState<CardMemoryView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ chatId: string | null } | null>(null)
  const [confirm, confirmDialog] = useConfirm()
  // which stories are opened, remembered per card for this browser tab
  const [open, setOpen] = useState<string[]>(() => readOpen(c.id))
  const toggle = (id: string) => setOpen((cur) => { const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; writeOpen(c.id, next); return next })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(() => {
    setLoadError(null)
    fetchCardMemory(c.id)
      .then((v) => { if (alive.current) setData(v) })
      .catch((e) => { if (alive.current) setLoadError(message(e)) })
  }, [c.id])
  useEffect(() => { load() }, [load])

  /** Runs one change on the server and shows what it answered; a failure is a toast and the old view. */
  const apply = async (run: () => Promise<CardMemoryView>) => {
    try {
      const v = await run()
      if (alive.current) setData(v)
      return true
    } catch (e) {
      toast.error(message(e))
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
    void apply(() => putCardMemory(c.id, { source: { id: s.id, on } })).then((ok) => { if (!ok) load() })
  }
  const remove = async (s: MemSource) => {
    const sure = await confirm({
      title: t('mem.remove.title', { title: s.title || t('mem.untitled') }),
      description: t('mem.remove.text', { name: c.name }),
      actionLabel: t('mem.remove.action'),
    })
    if (sure && (await apply(() => deleteCardMemorySource(c.id, s.id)))) toast.success(t('mem.removed'))
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t('mem.intro', { name: c.name })}</p>

      <Block tone="sky" icon={BookOpenText} title={t('mem.stories')} count={sources.length}>
        {sources.length === 0 ? (
          <Empty className="gap-3 border border-dashed border-border p-5" data-testid="mem-empty">
            <EmptyHeader>
              <EmptyTitle>{t('mem.empty.title')}</EmptyTitle>
              <EmptyDescription>{t('mem.empty.text', { name: c.name })}</EmptyDescription>
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
                    {isOpen && <StoryLines cardId={c.id} cardName={c.name} source={s} t={t} apply={apply} />}
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-muted-foreground">{t('mem.stories.hint')}{anyGone && ` ${t('mem.chatGone.hint')}`}</p>
            <AddButton onClick={() => setDialog({ chatId: null })} label={t('mem.add')} />
          </>
        )}
      </Block>

      <InjectBlock c={c} data={data} t={t} apply={apply} />

      <p className="text-xs text-muted-foreground">{t('mem.saved')}</p>

      {dialog && (
        <MemoryImportDialog
          open
          onOpenChange={(o) => { if (!o) setDialog(null) }}
          card={{ id: c.id, name: c.name }}
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

function AddButton({ onClick, label, primary }: { onClick: () => void; label: string; primary?: boolean }) {
  return (
    <Button variant={primary ? 'default' : 'outline'} size="sm" className="w-fit max-md:h-10" onClick={onClick}>
      <Plus aria-hidden="true" />{label}
    </Button>
  )
}

const TONES = {
  sky: { box: 'border-sky-500/40', head: 'border-sky-500/40 bg-sky-500/10', icon: 'bg-sky-500/20 text-sky-700 dark:text-sky-300' },
  emerald: { box: 'border-emerald-500/40', head: 'border-emerald-500/40 bg-emerald-500/10', icon: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
} as const

/** A section with a coloured header strip, so the two sections are told apart at a glance. */
function Block({ tone, icon: Icon, title, count, children }: { tone: keyof typeof TONES; icon: typeof Plus; title: string; count?: number; children: React.ReactNode }) {
  const k = TONES[tone]
  return (
    <section className={cn('overflow-hidden rounded-lg border', k.box)}>
      <header className={cn('flex items-center gap-2 border-b px-3 py-2', k.head)}>
        <span className={cn('grid size-7 shrink-0 place-items-center rounded-md', k.icon)}><Icon className="size-4" aria-hidden="true" /></span>
        <h3 className="text-sm font-medium">{title}</h3>
        {count !== undefined && <Badge variant="secondary" className="px-1.5">{count}</Badge>}
      </header>
      <div className="flex flex-col gap-3 p-3">{children}</div>
    </section>
  )
}

/** "In new chats": the switch and the number field for the memory's room in the prompt. */
function InjectBlock({ c, data, t, apply }: { c: Character; data: CardMemoryView; t: ReturnType<typeof useT>; apply: (run: () => Promise<CardMemoryView>) => Promise<boolean> }) {
  const { inject } = data.memory
  const [text, setText] = useState(String(inject.maxTokens))
  // the server's value wins after every save (it clamps)
  useEffect(() => { setText(String(inject.maxTokens)) }, [inject.maxTokens])
  const commit = async () => {
    const n = Math.round(Number(text))
    const v = Number.isFinite(n) && text.trim() !== '' ? Math.min(MEM_MAX_TOKENS, Math.max(MEM_MIN_TOKENS, n)) : inject.maxTokens
    setText(String(v))
    if (v !== inject.maxTokens) await apply(() => putCardMemory(c.id, { inject: { maxTokens: v } }))
  }
  const fieldId = `mem-budget-${c.id}`
  return (
    <Block tone="emerald" icon={Waves} title={t('mem.inject')}>
      <label className="flex min-h-8 items-center gap-3 text-sm max-md:min-h-10">
        <Switch checked={inject.enabled} onCheckedChange={(v) => void apply(() => putCardMemory(c.id, { inject: { enabled: v } }))} aria-label={t('mem.inject.switch')} className="max-md:after:-inset-y-4" />
        {t('mem.inject.switch')}
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId} className="text-xs font-medium">{t('mem.inject.tokens')}</label>
        <div className="flex items-center gap-2">
          <Input
            id={fieldId}
            type="number"
            inputMode="numeric"
            min={MEM_MIN_TOKENS}
            max={MEM_MAX_TOKENS}
            step={50}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="w-28 max-md:h-10"
          />
          <span className="text-xs text-muted-foreground">{t('mem.inject.unit')}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{inject.enabled ? t('mem.inject.hint', { tokens: data.tokens, budget: data.budget }) : t('mem.inject.off')}</p>
    </Block>
  )
}
