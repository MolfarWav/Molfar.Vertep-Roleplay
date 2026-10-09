import { useEffect, useState } from 'react'
import { ArrowClockwise, GearSix, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Constellation } from './constellation'
import { HostilityBar, PulseBar, SignedBar } from './dash-bars'
import { Notebook } from './dash-notebook'
import { StatChart, StoryList } from './dash-history'
import { EventList } from './dash-events'
import { cn } from '@/lib/utils'
import { BANDS, canEditNotes, sortedThreads, type DashView } from '@/lib/dashboard'
import { DISPOSITION, PULSE, type DispositionStat } from '@/lib/soul'
import { useT } from '@/hooks/use-t'
import { AgeText, AvatarButton, AvatarImg, BandMark, bandTextClass, Box, CharFields, FooterLine, LiveDot, Notices, SceneBlock, useTx, GOLD_TEXT } from './dash-common'
import { ThreadList } from './dash-threads'

export function DashWide({ chatId, notebookSignal, view, focus, onFocus, onRefresh, refreshing, onSettings, onClose, now, avatars, onPortrait, userName }: {
  chatId: string
  /** changes each time the strip's note chips ask for the notebook: scroll it into view */
  notebookSignal?: number
  view: DashView
  focus: string
  onFocus: (name: string) => void
  onRefresh: () => void
  refreshing: boolean
  onSettings: () => void
  onClose: () => void
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
  useEffect(() => {
    if (!notebookSignal) return
    const el = document.getElementById('dash-notebook')
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    el?.focus({ preventScroll: true })
  }, [notebookSignal])
  if (!char) return null

  const fullChars = view.order.filter((n) => view.chars[n] && !view.chars[n].compact)
  const others = view.order.filter((n) => n !== focus && view.chars[n])
  const present = view.order.filter((n) => view.present.includes(n) && view.chars[n])
  const constName = tx('dash.const', char.constellation)
  const band = view.clock?.band ?? null
  const bandIdx = band ? (BANDS as readonly string[]).indexOf(band) : -1

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {fullChars.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onFocus(n)}
              className={cn(
                'rounded-none border px-2.5 py-1 font-heading text-[13px] transition-colors',
                n === focus ? 'border-cta bg-cta/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {n}
              <span className="ml-1.5 text-[11px] opacity-70">{t(`soul.class.${view.chars[n].cls}`)}</span>
            </button>
          ))}
        </div>
        <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          <LiveDot at={view.at} now={now} />
          <AgeText at={view.at} now={now} />
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={refreshing} aria-label={t('dash.refresh')} title={t('dash.refresh')} className="rounded-none">
          <ArrowClockwise className={cn(refreshing && 'animate-spin')} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onSettings} aria-label={t('dash.set.open')} title={t('dash.set.open')} className="rounded-none">
          <GearSix />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('dash.close')} title={t('dash.close')} className="rounded-none">
          <X />
        </Button>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {view.clock && (
          <Box>
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
              <div className="min-w-0 max-w-full sm:min-w-[220px]">
                <SceneBlock clock={view.clock} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex flex-wrap gap-0.5">
                  {BANDS.map((b, i) => (
                    <span
                      key={b}
                      className={cn(
                        'border-b-2 px-2 py-0.5 font-heading text-[12px]',
                        b === band ? cn('border-cta bg-accent', bandTextClass(b)) : i < bandIdx ? 'border-border text-muted-foreground' : 'border-transparent text-muted-foreground/60',
                      )}
                    >
                      <BandMark band={b} className={cn('mr-1', b !== band && 'opacity-60')} />
                      {tx('dash.band', b)}
                    </span>
                  ))}
                </div>
                {present.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {present.map((n) => (
                      <AvatarButton key={n} name={n} url={avatars[n]} onFocus={onFocus} focused={n === focus} onPortrait={onPortrait} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Box>
        )}

        <div className="grid grid-cols-1 gap-3 min-[1100px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
          <Box title={t('dash.tab.constellation')}>
            <div className="flex flex-col items-center gap-1 px-10 pt-2">
              <Constellation stats={char.stats} prevStats={char.prev?.stats} id={char.constellation} prevId={char.prevConstellation} size={250} labels />
              <div className={cn('font-heading text-xl', GOLD_TEXT)}>{constName}</div>
              <div className="text-center text-xs text-muted-foreground">{tx('dash.constLine', char.constellation)}</div>
              <div className="text-center text-[11px] text-muted-foreground/80">{t('dash.const.legend')}</div>
              {char.prevConstellation && char.prevConstellation !== char.constellation && (
                <div className="text-[11px] text-muted-foreground">{t('dash.trace', { name: tx('dash.const', char.prevConstellation) })}</div>
              )}
            </div>
          </Box>

          <Box title={t('dash.attitude')}>
            <div className="flex flex-col gap-2.5">
              <div>
                <Badge variant="outline" className="rounded-none text-[10px]">{t(`soul.class.${char.cls}`)}</Badge>
              </div>
              {DISPOSITION.map((stat) => (
                <SignedBar key={stat} stat={stat} value={char.stats[stat]} prev={char.prev?.stats[stat]} tier />
              ))}
              {char.cls === 'hostile' && char.hostility !== null && <HostilityBar value={char.hostility} />}
            </div>
          </Box>

          <Box title={t('dash.pulse')}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                {PULSE.map((stat) => (
                  <PulseBar key={stat} stat={stat} value={char.pulse[stat]} base={char.pulseBase[stat]} prev={char.prev?.pulse[stat]} />
                ))}
              </div>
              <CharFields char={char} />
            </div>
          </Box>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
          <EventList events={view.events} userName={userName} compact />
          <div className="flex min-w-0 flex-col gap-3">
            <StoryList char={char} compact />
            <StatChart char={char} stat={chartStat} onStat={setChartStat} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
          <Notebook id="dash-notebook" compact className="scroll-mt-16" name={focus} char={char} userName={userName} />
          <div className="flex min-w-0 flex-col gap-3">
            <Box title={t('dash.threads')}>
              <ThreadList threads={sortedThreads(view.threads)} editable={canEditNotes(view)} canAdd maxOpen={view.maxThreads} />
            </Box>

            <Box title={t('dash.ensemble')}>
              {others.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dash.ensemble.none')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {others.map((n) => {
                    const c = view.chars[n]
                    const body = (
                      <>
                        <AvatarImg name={n} url={avatars[n]} className="size-8" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                            <span className="truncate font-heading text-[13px]">{n}</span>
                            <span className="text-[11px] text-muted-foreground">{t(`soul.class.${c.cls}`)}</span>
                            {!view.present.includes(n) && <span className="text-[11px] text-muted-foreground">{t('dash.absent')}</span>}
                            {!c.rated && <span className="text-[11px] text-muted-foreground">{t('dash.unrated')}</span>}
                          </span>
                          <span className={cn('text-[12px]', GOLD_TEXT)}>{tx('dash.const', c.constellation)}</span>
                        </span>
                        {c.cls === 'hostile' && c.hostility !== null && <HostilityBar value={c.hostility} className="w-28 shrink-0 [&>div:first-child]:hidden" />}
                      </>
                    )
                    const row = 'flex w-full min-w-0 items-center gap-2.5 border border-border bg-background/40 px-2 py-1.5 text-left'
                    return (
                      <li key={n}>
                        {c.compact ? (
                          <div className={row}>{body}</div>
                        ) : (
                          <button type="button" onClick={() => onFocus(n)} className={cn(row, 'rounded-none hover:bg-muted')}>{body}</button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Box>

            {view.edges.length > 0 && (
              <Box title={t('dash.edges')}>
                <ul className="flex flex-col gap-1 text-xs">
                  {view.edges.map((e) => (
                    <li key={`${e.from}>${e.to}`} className="min-w-0 break-words">
                      {e.from} → {e.to} <span className="text-muted-foreground">· {e.role} · {e.warmth}</span>
                    </li>
                  ))}
                </ul>
              </Box>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap gap-x-2">
            {view.fast ? <span>{t('dash.footer.fast')}</span> : <span className="font-mono break-all">{view.sensorModel}</span>}
            <span>·</span>
            <FooterLine view={view} chatId={chatId} />
          </div>
          <span>{t('dash.footer.tokens', { in: view.usage.inTokens, out: view.usage.outTokens, calls: view.usage.calls })}</span>
          <span>{t('dash.footer.rule')}</span>
          <Notices view={view} />
        </div>
      </div>
    </div>
  )
}
