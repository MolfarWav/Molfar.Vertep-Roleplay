import { useState } from 'react'
import { ArrowClockwise, CaretDown } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Constellation } from './constellation'
import { PulseBar, SignedBar } from './dash-bars'
import { Notebook } from './dash-notebook'
import { EventList } from './dash-events'
import { StatChart, StoryList } from './dash-history'
import { cn } from '@/lib/utils'
import { canEditNotes, sortedThreads, type DashView } from '@/lib/dashboard'
import { DISPOSITION, PULSE, type DispositionStat } from '@/lib/soul'
import { useT } from '@/hooks/use-t'
import { AvatarButton, BandMark, bandTextClass, CharFields, Label, Notices, SceneBlock, useTx, GOLD_TEXT } from './dash-common'
import { ThreadList } from './dash-threads'

export function DashPhoneBar({ view, focus, onOpen }: {
  view: DashView
  focus: string
  onOpen: () => void
}) {
  const tx = useTx()
  const char = view.chars[focus]
  if (!char) return null
  const clock = view.clock
  const band = clock?.band ? tx('dash.band', clock.band) : null
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-9 w-full shrink-0 items-center gap-2 border-b border-border bg-card px-3 text-left text-sm"
    >
      {clock?.time ? <span className="shrink-0 font-mono text-[13px] tabular-nums">{clock.time}</span> : null}
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
      <CaretDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

export function DashPhoneSheet({ view, focus, onFocus, onRefresh, refreshing, avatars, onPortrait, userName }: {
  view: DashView
  focus: string
  onFocus: (name: string) => void
  onRefresh: () => void
  refreshing: boolean
  now: number
  avatars: Record<string, string | undefined>
  /** opens the portrait dialog for a name (a click on the focused character's avatar) */
  onPortrait?: (name: string) => void
  userName: string
}) {
  const t = useT()
  const tx = useTx()
  const char = view.chars[focus]
  const [chartStat, setChartStat] = useState<DispositionStat>('trust')
  if (!char) return null

  const fullChars = view.order.filter((n) => view.chars[n] && !view.chars[n].compact)
  const present = view.order.filter((n) => view.present.includes(n) && view.chars[n] && !view.chars[n].compact)

  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 pb-6">
      <div className="flex items-center gap-1.5 pr-10">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {fullChars.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onFocus(n)}
              className={cn(
                'shrink-0 rounded-none border px-2.5 py-1 font-heading text-[13px] whitespace-nowrap',
                n === focus ? 'border-cta bg-cta/15 text-foreground' : 'border-border text-muted-foreground',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={refreshing} aria-label={t('dash.refresh')} className="rounded-none">
          <ArrowClockwise className={cn(refreshing && 'animate-spin')} />
        </Button>
      </div>

      <Tabs defaultValue="scene">
        <TabsList variant="line" className="w-full rounded-none border-b border-border">
          <TabsTrigger value="scene">{t('dash.tab.scene')}</TabsTrigger>
          <TabsTrigger value="constellation">{t('dash.tab.constellation')}</TabsTrigger>
          <TabsTrigger value="notebook">{t('dash.tab.notebook')}</TabsTrigger>
          <TabsTrigger value="history">{t('dash.tab.history')}</TabsTrigger>
        </TabsList>

        <TabsContent value="scene">
          <div className="flex flex-col gap-4 pt-4">
            <SceneBlock clock={view.clock} />
            {present.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {present.map((n) => (
                  <AvatarButton key={n} name={n} url={avatars[n]} onFocus={onFocus} focused={n === focus} onPortrait={onPortrait} />
                ))}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>{t('dash.threads')}</Label>
              <ThreadList threads={sortedThreads(view.threads)} editable={canEditNotes(view)} canAdd maxOpen={view.maxThreads} />
            </div>
            <Notices view={view} />
          </div>
        </TabsContent>

        <TabsContent value="constellation">
          <div className="flex flex-col gap-4 pt-4">
            <div className="flex flex-col items-center gap-1 px-8">
              <Constellation stats={char.stats} prevStats={char.prev?.stats} id={char.constellation} prevId={char.prevConstellation} size={170} labels />
              <div className={cn('font-heading text-lg', GOLD_TEXT)}>{tx('dash.const', char.constellation)}</div>
              <div className="text-center text-[11.5px] text-muted-foreground">{tx('dash.constLine', char.constellation)}</div>
            </div>
            <div className="flex flex-col gap-2">
              {DISPOSITION.map((stat) => (
                <SignedBar key={stat} stat={stat} value={char.stats[stat]} prev={char.prev?.stats[stat]} tier />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {PULSE.map((stat) => (
                <PulseBar key={stat} stat={stat} value={char.pulse[stat]} base={char.pulseBase[stat]} prev={char.prev?.pulse[stat]} />
              ))}
            </div>
            <CharFields char={char} />
          </div>
        </TabsContent>

        <TabsContent value="notebook">
          <div className="pt-4">
            <Notebook name={focus} char={char} userName={userName} />
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="flex flex-col gap-3 pt-4">
            <EventList events={view.events} userName={userName} />
            <StoryList char={char} />
            <StatChart char={char} stat={chartStat} onStat={setChartStat} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
