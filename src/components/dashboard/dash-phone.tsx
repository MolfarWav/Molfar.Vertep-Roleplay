import { useState } from 'react'
import { CaretDown, Gauge } from '@phosphor-icons/react'
import { Notebook } from './dash-notebook'
import { EventList } from './dash-events'
import { StatChart, StoryList } from './dash-history'
import { cn } from '@/lib/utils'
import { type DashView } from '@/lib/dashboard'
import { type DispositionStat } from '@/lib/soul'
import { useT } from '@/hooks/use-t'
import { CarriedBanner } from './dash-carried'
import { BandMark, bandTextClass, Notices, useTx, GOLD_TEXT } from './dash-common'
import { DashTabs, DashTop, HerePanel, PersonPanel, QuestsPanel, type DashTabId } from './dash-tabs'
import { useGuidePlace } from '@/components/guide/place'
import type { WorldHere } from '@/lib/world'

const PHONE_TABS: DashTabId[] = ['person', 'here', 'quests', 'notes', 'history']

export function DashPhoneBar({ view, focus, onOpen }: {
  view: DashView
  focus: string
  onOpen: () => void
}) {
  const t = useT()
  const tx = useTx()
  const char = view.chars[focus]
  if (!char) return null
  const clock = view.clock
  const band = clock?.band ? tx('dash.band', clock.band) : null
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${t('dash.open')}: ${tx('dash.const', char.constellation)}`}
      className="flex h-9 w-full shrink-0 items-center gap-2 border-b border-border bg-card px-3 text-left text-sm"
    >
      {clock?.time ? <span className="shrink-0 font-mono text-[13px] tabular-nums" title={clock.approx ? t('dash.time.approx') : undefined}>{clock.approx ? '≈' : ''}{clock.time}</span> : null}
      {band && (
        <span className={cn('flex shrink-0 items-center gap-1', bandTextClass(clock?.band))}>
          <BandMark band={clock?.band} />
          {band}
        </span>
      )}
      {clock?.place && <span className="min-w-0 flex-1 truncate text-muted-foreground">{clock.place}</span>}
      <span className={cn('truncate font-heading', GOLD_TEXT, clock?.place ? 'max-w-[40%]' : 'ml-auto')}>
        {tx('dash.const', char.constellation)}
      </span>
      {/* the whole bar opens the dashboard; this chip is what says so */}
      <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-background/60 px-1.5 py-0.5 text-muted-foreground" aria-hidden="true">
        <Gauge className="size-3.5" />
        <CaretDown className="size-3" />
      </span>
    </button>
  )
}

export function DashPhoneSheet({ chatId, view, here, focus, onFocus, onReload, avatars, onPortrait, userName }: {
  chatId: string
  view: DashView
  here: WorldHere | null
  focus: string
  onFocus: (name: string) => void
  onReload: () => void
  now: number
  avatars: Record<string, string | undefined>
  /** opens the portrait dialog for a name (a click on the focused character's avatar) */
  onPortrait?: (name: string) => void
  userName: string
}) {
  const [chartStat, setChartStat] = useState<DispositionStat>('trust')
  const [tab, setTab] = useState<DashTabId>('person')
  useGuidePlace('dashboard')
  const char = view.chars[focus]
  if (!char) return null

  return (
    <div className="flex min-w-0 flex-col pb-6">
      {view.inherit && <CarriedBanner chatId={chatId} inherit={view.inherit} className="m-3" />}
      <DashTop view={view} here={here} focus={focus} onFocus={onFocus} avatars={avatars} onPortrait={onPortrait} weatherSize={52} onTab={setTab} />
      <DashTabs
        tabs={PHONE_TABS}
        value={tab}
        onValueChange={setTab}
        view={view}
        here={here}
        focus={focus}
        guide
        render={(id) =>
          id === 'person' ? (
            <PersonPanel view={view} here={here} chatId={chatId} onReload={onReload} focus={focus} onFocus={onFocus} avatars={avatars} />
          ) : id === 'here' ? (
            <HerePanel view={view} here={here} chatId={chatId} onReload={onReload} focus={focus} onFocus={onFocus} />
          ) : id === 'quests' ? (
            <QuestsPanel view={view} full />
          ) : id === 'notes' ? (
            <div className="p-2">
              <Notebook name={focus} char={char} userName={userName} />
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-2">
              <EventList events={view.events} userName={userName} />
              <StoryList char={char} />
              <StatChart char={char} stat={chartStat} onStat={setChartStat} />
            </div>
          )
        }
      />
      <div className="px-4 pt-3 empty:hidden">
        <Notices view={view} />
      </div>
    </div>
  )
}
