// What the strip and the phone sheet share: the top block (scene, weather, the character switcher, "Since your last
// reply"), the tabs with their tone squares and corner counters, and the panels the tabs open.

import { useState, type ReactNode } from 'react'
import { Flag, Notebook as NotebookIcon, Sparkle } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { TONES } from '@/components/ui/tone'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AvatarButton, Box, ChangeBadge, NameChip, SceneBlock, TONE_TAB, type Tone } from './dash-common'
import { AttitudeCard, HereCard, MoodCard, OthersGrid, OutfitCard, ThingsCard } from './dash-cards'
import { ThreadList } from './dash-threads'
import { SuggestCallout } from './dash-merge'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { canEditNotes, noteCounts, sortedThreads, type DashView } from '@/lib/dashboard'
import { personChanges, sinceChanges, sortChanges, tabCounts, tally, type DashChange } from '@/lib/dash-changes'
import { ChangeChip, useChangeText } from './change-chips'
import type { WorldHere } from '@/lib/world'

export type DashTabId = 'person' | 'here' | 'quests' | 'notes' | 'history'

const TAB_TONE: Record<DashTabId, Tone> = { person: 'people', here: 'place', quests: 'plot', notes: 'memory', history: 'scene' }
const TAB_LABEL: Record<DashTabId, MsgKey> = { person: 'dash.tab.person', here: 'dash.tab.here', quests: 'dash.threads', notes: 'dash.tab.notes', history: 'dash.tab.history' }
const TAB_GUIDE: Partial<Record<DashTabId, string>> = { person: 'dash.constellation', notes: 'dash.notebook' }

/** Tabs with a tone square before the label, the active one underlined in its tone, a counter in the top right corner of a tab that holds changes. */
export function DashTabs({ tabs, value, onValueChange, view, here, focus, render, guide }: {
  /** mark the tabs for the in-app guide (the phone sheet; the strip is not a guide target) */
  guide?: boolean
  tabs: DashTabId[]
  value: DashTabId
  onValueChange: (id: DashTabId) => void
  view: DashView
  here: WorldHere | null
  focus: string
  render: (id: DashTabId) => ReactNode
}) {
  const t = useT()
  const counts = tabCounts(view, here, focus)
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as DashTabId)} className="gap-0">
      <TabsList variant="line" className="group-data-horizontal/tabs:h-[46px] w-full gap-0 rounded-none border-b border-border p-0">
        {tabs.map((id) => {
          const look = TONE_TAB[TAB_TONE[id]]
          const count = id === value ? null : id === 'person' || id === 'here' || id === 'quests' ? counts[id] : null
          return (
            <TabsTrigger
              key={id}
              value={id}
              data-guide={guide ? TAB_GUIDE[id] : undefined}
              data-testid={`dash-tab-${id}`}
              className={cn('h-full min-w-0 flex-1 gap-1.5 rounded-none px-1 pt-3 text-[13px] font-semibold group-data-horizontal/tabs:after:bottom-0', look.line)}
            >
              <span className={cn('size-2 shrink-0', look.square)} aria-hidden="true" />
              <span className="truncate">{t(TAB_LABEL[id])}</span>
              <ChangeBadge count={count} className="absolute top-0 right-0.5" />
            </TabsTrigger>
          )
        })}
      </TabsList>
      {tabs.map((id) => (
        <TabsContent key={id} value={id}>{render(id)}</TabsContent>
      ))}
    </Tabs>
  )
}

// ---------- Since your last reply ----------

const SINCE_SHOWN = 3

/** One chip per change (the first three, the rest behind "+N more"); a click opens the tab that holds it (and focuses the character it is about). Hidden when nothing changed. */
export function SinceRow({ changes, onPick }: { changes: DashChange[]; onPick: (c: DashChange) => void }) {
  const t = useT()
  const text = useChangeText()
  const [all, setAll] = useState(false)
  if (changes.length === 0) return null
  // what fell comes first, and only a few chips show at once: a long row would push the tabs off a phone's screen
  const sorted = sortChanges(changes)
  const shown = all ? sorted : sorted.slice(0, SINCE_SHOWN)
  const negative = sorted.some((c) => c.kind === 'fell')
  const hidden = sorted.length - shown.length
  return (
    <div className="flex flex-col gap-1.5 border-b border-border bg-muted/40 px-3 py-2" data-testid="dash-since">
      <div className={cn('flex min-h-10 items-center gap-2 rounded-[10px] border px-3 py-1 font-semibold', TONES.sky.fill, TONES.sky.ink)} data-testid="dash-since-title">
        <Sparkle aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 text-body">{t('dash.since.title')}</span>
        <span
          data-testid="dash-since-count"
          data-negative={negative ? 'true' : undefined}
          className={cn('ml-auto grid h-[22px] min-w-[22px] shrink-0 place-items-center rounded-full px-1.5 text-caption font-bold text-white', negative ? 'bg-red-600' : 'bg-sky-600')}
        >
          {sorted.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((c, i) => (
          <ChangeChip key={`${c.kind}-${c.who ?? ''}-${i}`} change={c} text={text(c)} onPick={onPick} />
        ))}
        {(hidden > 0 || all) && sorted.length > SINCE_SHOWN && (
          <button
            type="button"
            onClick={() => setAll(!all)}
            aria-expanded={all}
            className="inline-flex min-h-7 items-center border border-dashed border-border px-2 py-0.5 text-[12px] text-muted-foreground hover:text-foreground max-md:min-h-10"
          >
            {all ? t('dash.since.less') : t('dash.since.more', { n: hidden })}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The top block: the scene (clock, date, weather, place), the 40 px character switcher with counters on the
 * others, and the "Since your last reply" row. \`onTab\` is told which tab a clicked chip belongs to.
 */
export function DashTop({ view, here, focus, onFocus, avatars, onPortrait, weatherSize, onTab }: {
  view: DashView
  here: WorldHere | null
  focus: string
  onFocus: (name: string) => void
  avatars: Record<string, string | undefined>
  onPortrait?: (name: string) => void
  weatherSize: number
  onTab: (id: DashTabId) => void
}) {
  // everyone in the scene gets a portrait; `compact` only trims what the prompt insert says about the fifth and later (#236)
  const present = view.order.filter((n) => view.present.includes(n) && view.chars[n])
  const pick = (c: DashChange) => {
    if (c.who && c.who !== focus) onFocus(c.who)
    onTab(c.tab)
  }
  return (
    <>
      {(view.clock || present.length > 0) && (
        <div className="flex flex-col gap-3 border-b border-border px-3 py-3">
          <SceneBlock clock={view.clock} prev={view.prevClock} calendar={view.calendar} weatherSize={weatherSize} />
          {present.length > 0 && (
            <div className="flex flex-wrap gap-2.5 pt-1">
              {present.map((n) => (
                <AvatarButton
                  key={n}
                  name={n}
                  url={avatars[n]}
                  onFocus={onFocus}
                  focused={n === focus}
                  onPortrait={onPortrait}
                  big
                  count={n === focus ? null : tally(personChanges(n, view.chars[n], here))}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <SinceRow changes={sinceChanges(view, here, focus)} onPick={pick} />
    </>
  )
}

// ---------- panels ----------

/** Person: attitude, mood and state, outfit and things, then the other characters present as tiles. */
export function PersonPanel({ view, here, chatId, onReload, focus, onFocus, avatars, narrow }: {
  view: DashView
  here: WorldHere | null
  chatId: string
  onReload: () => void
  focus: string
  onFocus: (name: string) => void
  avatars: Record<string, string | undefined>
  narrow?: boolean
}) {
  const char = view.chars[focus]
  if (!char) return null
  return (
    <div className="flex min-w-0 flex-col gap-2 p-2">
      <SuggestCallout focus={focus} />
      <AttitudeCard name={focus} char={char} narrow={narrow} avatars={avatars} />
      <MoodCard char={char} />
      <OutfitCard name={focus} char={char} here={here} chatId={chatId} onReload={onReload} />
      <OthersGrid view={view} here={here} focus={focus} onFocus={onFocus} avatars={avatars} />
    </div>
  )
}

/** Here: the place and what is in it, then the things. */
export function HerePanel({ view, here, chatId, onReload, focus, onFocus }: {
  view: DashView
  here: WorldHere | null
  chatId: string
  onReload: () => void
  focus: string
  onFocus: (name: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 p-2">
      <HereCard here={here} scenePlace={view.clock?.place} chatId={chatId} onReload={onReload} />
      <ThingsCard view={view} here={here} focus={focus} onFocus={onFocus} />
    </div>
  )
}

/** Quests: the strip's short flat list, or (\`full\`, the phone) the whole list with Add. */
export function QuestsPanel({ view, full }: { view: DashView; full?: boolean }) {
  const t = useT()
  return (
    <div className="p-2">
      <Box title={t('dash.threads')} tone="plot" icon={Flag} data-guide={full ? 'dash.threads' : undefined}>
        {full ? (
          <ThreadList threads={sortedThreads(view.threads)} editable={canEditNotes(view)} canAdd maxOpen={view.maxThreads} limits={view.limits} proposals={view.proposals} />
        ) : (
          <ThreadList threads={sortedThreads(view.threads)} limit={3} openOnly editable={canEditNotes(view)} limits={view.limits} proposals={view.proposals} />
        )}
      </Box>
    </div>
  )
}

/** Notes (the strip): the note counts and the name chip; each opens the notebook in the wide view. */
export function NotesPanel({ view, focus, onNotebook }: { view: DashView; focus: string; onNotebook: () => void }) {
  const t = useT()
  const char = view.chars[focus]
  if (!char) return null
  const counts = noteCounts(char)
  return (
    <div className="p-2">
      <Box title={t('dash.tab.notebook')} tone="memory" icon={NotebookIcon}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge render={<button type="button" onClick={onNotebook} title={t('dash.notes.open')} />} variant="outline" className="cursor-pointer rounded-none text-caption hover:bg-muted">{t('dash.notes.about', { n: counts.about })}</Badge>
          <Badge render={<button type="button" onClick={onNotebook} title={t('dash.notes.open')} />} variant="outline" className="cursor-pointer rounded-none text-caption hover:bg-muted">{t('dash.notes.heard', { n: counts.heard })}</Badge>
          <NameChip char={char} onClick={onNotebook} />
        </div>
      </Box>
    </div>
  )
}
