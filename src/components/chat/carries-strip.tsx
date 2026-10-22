import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BookOpenText, Brain, ListChecks, CaretRight, ChatCenteredText, GitBranch, Gauge, GlobeHemisphereWest, Note, SlidersHorizontal } from '@phosphor-icons/react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { useIsMobile } from '@/hooks/use-mobile'
import { useT } from '@/hooks/use-t'
import { buildCarries, flipOff, parseHidden, CARRY_KINDS, HIDDEN_KEY, type CarriesAnswer, type CarryKind, type CarryPart, type DashCarries } from '@/lib/carries'
import type { MsgKey } from '@/lib/i18n'
import { getChatPromptBoard, j, setChatPromptBoard } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { estimateTokens } from '@/lib/tokens'
import { cn } from '@/lib/utils'

type T = ReturnType<typeof useT>

const ICONS: Record<CarryKind, PhosphorIcon> = { memory: Brain, skills: ListChecks, backstory: GitBranch, litopys: BookOpenText, dashboard: Gauge, said: ChatCenteredText, world: GlobeHemisphereWest, note: Note }
/** Colour by kind, tokens only (never colour alone: every chip also has an icon and a word). */
const TINT: Record<CarryKind, string> = {
  memory: 'border-sky-500/40 bg-sky-500/10',
  skills: 'border-violet-500/40 bg-violet-500/10',
  backstory: 'border-emerald-500/40 bg-emerald-500/10',
  litopys: 'border-emerald-500/40 bg-emerald-500/10',
  dashboard: 'border-border bg-muted/50',
  said: 'border-border bg-muted/50',
  world: 'border-border bg-muted/50',
  note: 'border-amber-500/40 bg-amber-500/10',
}

interface DashAnswer {
  view?: { insert?: { tokens?: number; saidTokens?: number } | null; inherit?: DashCarries['inherit'] } | null
  inherit?: DashCarries['inherit']
}
interface Loaded { chatId: string; carries: CarriesAnswer | null; dash: DashCarries | null }

/** The strip under the chat header: what the chat carries into the prompt besides the history, and the
 *  panel that opens from a chip, with a switch per part. Hidden in a plain chat. */
export function CarriesStrip({
  chatId,
  noteText,
  msgCount,
  onOpenNote,
}: {
  chatId: string
  noteText: string
  /** Changes after each new message: the numbers are read again. */
  msgCount: number
  onOpenNote: () => void
}) {
  const t = useT()
  const isMobile = useIsMobile()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [open, setOpen] = useState(false)
  const seq = useRef(0)
  // chip kinds this viewer hid in the strip (the panel and its total still list everything)
  const [hidden, setHidden] = useState<CarryKind[]>(() => { try { return parseHidden(localStorage.getItem(HIDDEN_KEY)) } catch { return [] } })
  const saveHidden = (next: CarryKind[]) => { setHidden(next); try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)) } catch { /* no storage: the choice lasts until reload */ } }

  const refetch = useCallback(async () => {
    const mine = ++seq.current
    // each answer may fail on its own: the strip shows what it has, silently
    const [carries, dash] = await Promise.all([
      j<CarriesAnswer>(`/litopys/carries?chatId=${encodeURIComponent(chatId)}`).catch(() => null),
      j<DashAnswer>(`/dashboard/state?chatId=${encodeURIComponent(chatId)}&view=1`).catch(() => null),
    ])
    if (mine !== seq.current) return
    const view = dash?.view
    const dashPart: DashCarries | null = view
      ? { tokens: Number(view.insert?.tokens) || 0, saidTokens: Number(view.insert?.saidTokens) || 0, inherit: view.inherit ?? dash?.inherit ?? null }
      : null
    setLoaded({ chatId, carries, dash: dashPart })
  }, [chatId])
  useEffect(() => { void refetch() }, [refetch, msgCount, open])
  useEffect(() => { setOpen(false) }, [chatId])

  const labels = useMemo(() => ({
    memory: (name: string) => t('carries.label.memory', { name }),
    skills: (name: string) => t('carries.label.skills', { name }),
    backstory: (title: string) => t('carries.label.backstory', { title }),
    litopys: t('carries.label.litopys'),
    dashboard: t('carries.label.dashboard'),
    said: t('carries.label.said'),
    world: (level: string) => t('carries.label.world', { level: t(`world.level.${level}` as MsgKey) }),
    note: t('carries.label.note'),
  }), [t])
  const mine = loaded && loaded.chatId === chatId ? loaded : null
  const result = useMemo(
    () => buildCarries({ carries: mine?.carries ?? null, dash: mine?.dash ?? null, noteText, estimate: estimateTokens, labels }),
    [mine, noteText, labels],
  )

  /** Flips one key of the chat's prompt switches through the same calls the Prompt board saves with. */
  const flip = async (key: string) => {
    // the switch and the chip turn at once; a failed save puts them back
    seq.current++ // an answer still on its way was asked before this switch
    const before = mine?.carries?.off ?? []
    const optimistic = flipOff(before, key)
    setLoaded((l) => (l && l.carries ? { ...l, carries: { ...l.carries, off: optimistic } } : l))
    try {
      const cur = await getChatPromptBoard(chatId)
      const off = flipOff(cur?.off ?? [], key)
      const next = off.length > 0 || cur?.history ? { v: 1 as const, ...(off.length > 0 ? { off } : {}), ...(cur?.history ? { history: cur.history } : {}) } : null
      await setChatPromptBoard(chatId, next)
    } catch (e) {
      setLoaded((l) => (l && l.carries ? { ...l, carries: { ...l.carries, off: before } } : l))
      toast.error(t('carries.saveFailed', { error: e instanceof Error ? e.message : String(e) }))
    }
    void refetch()
  }

  if (!result.visible && !open) return null
  const chipText = (p: CarryPart) => (p.empty ? t('carries.empty') : t('carries.tok', { n: p.tokens }))

  return (
    <>
      {result.visible && (
        isMobile ? (
          <div className="relative z-10 shrink-0 border-b border-border bg-card px-2 py-1.5" data-testid="carries-strip">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{t('carries.phone', { total: result.total })}</span>
              <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div role="group" aria-label={t('carries.strip')} className="relative z-10 flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-card px-3 py-1.5" data-testid="carries-strip">
            {result.parts.filter((p) => !hidden.includes(p.kind)).map((p) => {
              const Icon = ICONS[p.kind]
              return (
                <button
                  key={p.key}
                  type="button"
                  data-chip={p.key}
                  data-off={p.off || undefined}
                  onClick={p.kind === 'note' ? onOpenNote : () => setOpen(true)}
                  aria-label={`${p.label}, ${chipText(p)}${p.off ? `, ${t('carries.chipOff')}` : ''}`}
                  className={cn(
                    'inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[11px] outline-none transition-colors hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring/60',
                    TINT[p.kind],
                    p.off && 'opacity-60',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className={cn('truncate font-medium', p.off && 'line-through')}>{p.label}</span>
                  <span className={cn('shrink-0 text-muted-foreground', p.off && 'line-through')}>{chipText(p)}</span>
                </button>
              )
            })}
            <Popover>
              <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t('carries.customize')} title={t('carries.customize')} data-testid="carries-customize" />}>
                <SlidersHorizontal aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 gap-2">
                <p className="text-sm font-medium">{t('carries.customize.title')}</p>
                <ul className="flex flex-col">
                  {CARRY_KINDS.map((k) => (
                    <li key={k}>
                      <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                        <Checkbox checked={!hidden.includes(k)} onCheckedChange={(v) => saveHidden(v === true ? hidden.filter((x) => x !== k) : [...hidden, k])} aria-label={t(`carries.kind.${k}` as MsgKey)} />
                        {t(`carries.kind.${k}` as MsgKey)}
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{t('carries.customize.hint')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" className="w-fit" disabled={hidden.length === 0} onClick={() => saveHidden([])}>{t('carries.customize.all')}</Button>
                  {/* the way into the panel stays here even when every chip is hidden */}
                  <Button variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>{t('carries.customize.panel')}</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[420px]" data-testid="carries-panel">
          <SheetHeader className="border-b border-border p-4 pr-14">
            <div className="flex items-baseline justify-between gap-3">
              <SheetTitle>{t('carries.title')}</SheetTitle>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="carries-total">{t('carries.total', { n: result.total })}</span>
            </div>
            <SheetDescription className="text-xs">{t('carries.subtitle')}</SheetDescription>
          </SheetHeader>
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {result.parts.filter((p) => p.kind !== 'note').map((p) => (
              <PartRow
                key={p.key}
                part={p}
                carries={mine?.carries ?? null}
                dash={mine?.dash ?? null}
                t={t}
                onFlip={() => p.switchKey && void flip(p.switchKey)}
                onLeave={() => setOpen(false)}
              />
            ))}
            <li className="flex flex-col gap-1.5 p-3" data-testid="carries-row-note">
              <div className="flex min-h-10 items-center gap-3">
                <Note className="size-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-sm font-medium">{t('carries.note.title')}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{chipText(result.parts.find((p) => p.kind === 'note') ?? { key: 'note', kind: 'note', label: '', tokens: 0, off: false, switchKey: null, empty: true })}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('carries.note.detail')}</p>
              <Button variant="outline" size="sm" className="w-fit max-md:h-10" onClick={() => { setOpen(false); onOpenNote() }}>{t('carries.note.open')}</Button>
            </li>
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}

function PartRow({ part, carries, dash, t, onFlip, onLeave }: { part: CarryPart; carries: CarriesAnswer | null; dash: DashCarries | null; t: T; onFlip: () => void; onLeave: () => void }) {
  const [shown, setShown] = useState(false)
  const Icon = ICONS[part.kind]
  const cm = carries?.cardMemory
  const sk = carries?.cardSkills
  const bs = carries?.backstory
  const wd = carries?.world
  const text = part.kind === 'memory' ? cm?.text : part.kind === 'skills' ? sk?.text : part.kind === 'backstory' ? bs?.text : part.kind === 'world' && wd?.waiting ? wd.text : ''
  const detail =
    part.kind === 'memory' ? t('carries.memory.detail', { n: cm?.sources.length ?? 0 })
    : part.kind === 'skills' ? t('carries.skills.detail', { n: sk?.skills.length ?? 0, name: sk?.name ?? '' })
    : part.kind === 'backstory' ? t('carries.backstory.detail', { facts: bs?.facts ?? 0, chapters: bs?.chapters ?? 0 })
    : part.kind === 'litopys' ? t('carries.litopys.detail', { facts: carries?.litopys.facts ?? 0, chapters: carries?.litopys.chapters ?? 0 })
    : part.kind === 'dashboard' ? t('carries.dashboard.detail')
    : part.kind === 'world' ? (wd?.level === 'chronicler' ? t('carries.world.chronicler') : wd?.waiting ? t('carries.world.waiting') : t('carries.world.idle'))
    : t('carries.said.detail')
  const inherit = part.kind === 'dashboard' && dash?.inherit?.on ? dash.inherit : null
  const showLabel = part.kind === 'world' ? (shown ? t('carries.world.hide') : t('carries.world.show')) : shown ? (part.kind === 'memory' || part.kind === 'skills' ? t('carries.memory.hide') : t('carries.backstory.hide')) : part.kind === 'memory' || part.kind === 'skills' ? t('carries.memory.show') : t('carries.backstory.show')
  const textId = `carries-text-${part.key}`
  return (
    <li className="flex flex-col gap-1.5 border-b border-border p-3" data-testid={`carries-row-${part.key}`}>
      <div className="flex min-h-10 items-center gap-3">
        <Switch checked={!part.off} onCheckedChange={onFlip} aria-label={part.label} className="max-md:after:-inset-y-4" />
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className={cn('block break-words text-sm font-medium', part.off && 'text-muted-foreground line-through')}>{part.label}</span>
          {part.off && <span className="block text-[11px] text-muted-foreground">{t('carries.offNow')}</span>}
        </div>
        <span className={cn('shrink-0 text-xs tabular-nums text-muted-foreground', part.off && 'line-through')}>{t('carries.tok', { n: part.tokens })}</span>
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
      {inherit && <p className="text-xs text-muted-foreground">{t('carries.dashboard.inherit', { title: inherit.title || inherit.from || '' })}</p>}
      {part.kind === 'memory' && !!cm && cm.dupes > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs">{t('carries.memory.dupes', { n: cm.dupes })}</p>
      )}
      {part.kind === 'skills' && !!sk && sk.dupes > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs">{t('carries.skills.dupes', { n: sk.dupes })}</p>
      )}
      <div className="flex flex-wrap gap-1">
        {(part.kind === 'memory' || part.kind === 'skills' || part.kind === 'backstory' || part.kind === 'world') && !!text && (
          <Button variant="ghost" size="sm" className="max-md:h-10" aria-expanded={shown} aria-controls={textId} onClick={() => setShown((v) => !v)}>{showLabel}</Button>
        )}
        {part.kind === 'memory' && !!cm && (
          <Button variant="ghost" size="sm" className="max-md:h-10" onClick={() => { onLeave(); useApp.getState().openCharacterOnTab(cm.cardId, 'memory') }}>{t('carries.memory.edit')}</Button>
        )}
        {part.kind === 'skills' && !!sk && (
          <Button variant="ghost" size="sm" className="max-md:h-10" onClick={() => { onLeave(); useApp.getState().openCharacterOnTab(sk.cardId, 'memory') }}>{t('carries.memory.edit')}</Button>
        )}
        {part.kind === 'backstory' && !!bs && (
          <Button variant="ghost" size="sm" className="max-md:h-10" onClick={() => { onLeave(); useApp.getState().openChat(bs.from) }}>{t('carries.backstory.open')}</Button>
        )}
        {part.kind === 'dashboard' && (
          <Button variant="ghost" size="sm" className="max-md:h-10" onClick={() => { onLeave(); useApp.getState().openDashboard() }}>{t('carries.dashboard.open')}</Button>
        )}
      </div>
      {shown && !!text && (
        <pre id={textId} aria-label={t('carries.text')} tabIndex={0} data-testid={textId} className="max-h-56 overflow-y-auto rounded-md border border-border bg-muted p-2 text-xs break-words whitespace-pre-wrap">{text}</pre>
      )}
    </li>
  )
}
