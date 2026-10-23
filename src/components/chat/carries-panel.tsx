import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BookOpenText, Brain, ListChecks, ChatCenteredText, GitBranch, Gauge, GlobeHemisphereWest, Note } from '@phosphor-icons/react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { useT } from '@/hooks/use-t'
import { buildCarries, flipOff, ownStoryChats, type CarriesAnswer, type CarriesResult, type CarryKind, type CarryPart, type DashCarries } from '@/lib/carries'
import type { MsgKey } from '@/lib/i18n'
import { fetchWIStatus, getChatPromptBoard, j, setChatPromptBoard } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { skillCounts } from '@/lib/skill-earned'
import { announceEarned } from '@/lib/skill-earned-toast'
import { estimateTokens } from '@/lib/tokens'
import { fetchLitChat, fetchLitLinks } from '@/components/library/litopys-api'
import { fetchCardMemory } from '@/components/character/memory-api'
import { StoryChoices } from './carries-stories'
import { cn } from '@/lib/utils'

type T = ReturnType<typeof useT>

const ICONS: Record<CarryKind, PhosphorIcon> = { memory: Brain, skills: ListChecks, backstory: GitBranch, litopys: BookOpenText, dashboard: Gauge, said: ChatCenteredText, world: GlobeHemisphereWest, note: Note }

interface DashAnswer {
  view?: { insert?: { tokens?: number; saidTokens?: number } | null; inherit?: DashCarries['inherit'] } | null
  inherit?: DashCarries['inherit']
}
/** The card has stories that would normally reach this chat but none does now (the chat left them out, or a "separate" one is not let in):
 *  the answer carries no memory, so the part is made up with 0 tokens, to let the user choose stories again. */
async function withIdleMemory(c: CarriesAnswer, chatId: string): Promise<CarriesAnswer> {
  const st = useApp.getState()
  const chat = st.chats.find((x) => x.id === chatId)
  const card = chat?.characterId ? st.characters.find((x) => x.id === chat.characterId) : undefined
  if (!card || c.off.includes('plugin:cardmemory')) return c
  try {
    const [mem, links] = await Promise.all([fetchCardMemory(card.id), fetchLitLinks().then((r) => r.links).catch(() => ({}))])
    const mine = ownStoryChats(chatId, links)
    if (!mem.memory.inject.enabled || !mem.memory.sources.some((s) => s.on && !(s.chatId && mine.has(s.chatId)))) return c
    return { ...c, cardMemory: { cardId: card.id, name: card.name, tokens: 0, dupes: 0, sources: [], text: '' } }
  } catch {
    return c
  }
}

interface Loaded {
  chatId: string
  carries: CarriesAnswer | null
  dash: DashCarries | null
  skills: { earned: number; candidates: number } | null
  /** Lorebook entries that fired on the latest scan, and chapters in the chat's own record; null = not known (yet). */
  loreFired: number | null
  chapters: number | null
}

export interface CarriesState {
  result: CarriesResult
  /** The numbers the header tools show next to their names. */
  loreFired: number | null
  chapters: number | null
  open: boolean
  setOpen: (open: boolean) => void
}

/** What the chat carries into the prompt besides the history (#107), read again after each message, with the counters
 *  the header's story tools show (#109). The header and the phone menu show them; `CarriesPanel` is the panel behind. */
export function useCarries(chatId: string, noteText: string, msgCount: number): CarriesState & { mine: Loaded | null; refetch: () => Promise<void>; flip: (key: string) => Promise<void> } {
  const t = useT()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [open, setOpen] = useState(false)
  const seq = useRef(0)

  const refetch = useCallback(async () => {
    if (!chatId) return
    const mine = ++seq.current
    // each answer may fail on its own: the tools show what they have, silently
    const [carries, dash, rec, lore] = await Promise.all([
      j<CarriesAnswer>(`/litopys/carries?chatId=${encodeURIComponent(chatId)}`).catch(() => null),
      j<DashAnswer>(`/dashboard/state?chatId=${encodeURIComponent(chatId)}&view=1`).catch(() => null),
      // the chat's Litopys record: the skills earned in it (one toast when a new one was earned, and a line in the Skills row)
      fetchLitChat(chatId).catch(() => null),
      // the same scan a generation runs: how many entries fire now
      fetchWIStatus(chatId).catch(() => null),
    ])
    if (mine !== seq.current) return
    const carriesOut = carries && !carries.cardMemory ? await withIdleMemory(carries, chatId) : carries
    if (mine !== seq.current) return
    const view = dash?.view
    const dashPart: DashCarries | null = view
      ? { tokens: Number(view.insert?.tokens) || 0, saidTokens: Number(view.insert?.saidTokens) || 0, inherit: view.inherit ?? dash?.inherit ?? null }
      : null
    if (rec) announceEarned(chatId, rec.skills)
    setLoaded({ chatId, carries: carriesOut, dash: dashPart, skills: rec?.skills ? skillCounts(rec.skills) : null, loreFired: lore ? lore.fired.length : null, chapters: rec ? rec.chapters.length : null })
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
    // the switch turns at once; a failed save puts it back
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

  return { result, loreFired: mine?.loreFired ?? null, chapters: mine?.chapters ?? null, open, setOpen, mine, refetch, flip }
}

/** The panel "What this chat carries": a switch per part, the exact lines, and shortcuts. Opens from the header's
 *  "~N tok" button (the phone menu's row); the Author's note has its own drawer, linked from here. */
export function CarriesPanel({ chatId, state, onOpenNote }: { chatId: string; state: ReturnType<typeof useCarries>; onOpenNote: () => void }) {
  const t = useT()
  const { result, mine, open, setOpen, refetch, flip } = state
  const chipText = (p: CarryPart) => (p.empty ? t('carries.empty') : t('carries.tok', { n: p.tokens }))

  return (
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
              chatSkills={mine?.skills ?? null}
              dash={mine?.dash ?? null}
              t={t}
              chatId={chatId}
              onChanged={() => void refetch()}
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
  )
}

function PartRow({ part, chatId, carries, chatSkills, dash, t, onFlip, onLeave, onChanged }: { part: CarryPart; chatId: string; onChanged: () => void; carries: CarriesAnswer | null; chatSkills: { earned: number; candidates: number } | null; dash: DashCarries | null; t: T; onFlip: () => void; onLeave: () => void }) {
  const [shown, setShown] = useState(false)
  const Icon = ICONS[part.kind]
  const cm = carries?.cardMemory
  const sk = carries?.cardSkills
  const bs = carries?.backstory
  const wd = carries?.world
  const text = part.kind === 'memory' ? cm?.text : part.kind === 'skills' ? sk?.text : part.kind === 'backstory' ? bs?.text : part.kind === 'world' && wd?.waiting ? wd.text : ''
  const detail =
    part.kind === 'memory' ? (cm && cm.sources.length === 0 ? t('carries.memory.none') : t('carries.memory.detail', { n: cm?.sources.length ?? 0 }))
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
      {part.kind === 'skills' && !!chatSkills && (chatSkills.earned > 0 || chatSkills.candidates > 0) && (
        <p className="text-xs text-muted-foreground" data-testid="carries-skills-earned">{t('carries.skills.chat', { earned: chatSkills.earned, candidates: chatSkills.candidates })}</p>
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
      {part.kind === 'memory' && !!cm && <StoryChoices chatId={chatId} cardId={cm.cardId} t={t} onChanged={onChanged} />}
      {shown && !!text && (
        <pre id={textId} aria-label={t('carries.text')} tabIndex={0} data-testid={textId} className="max-h-56 overflow-y-auto rounded-md border border-border bg-muted p-2 text-xs break-words whitespace-pre-wrap">{text}</pre>
      )}
    </li>
  )
}
