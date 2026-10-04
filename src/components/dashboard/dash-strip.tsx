import { ArrowClockwise, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Constellation } from './constellation'
import { HostilityBar, SignedBar } from './dash-bars'
import { cn } from '@/lib/utils'
import { noteCounts, sortedThreads, type DashView } from '@/lib/dashboard'
import { DISPOSITION } from '@/lib/soul'
import { useT } from '@/hooks/use-t'
import { AgeText, AvatarButton, FooterLine, Label, LiveDot, NameChip, Notices, SceneBlock, ThreadList, useTx, GOLD_TEXT } from './dash-common'

export function DashStrip({ view, focus, onFocus, onOpen, onRefresh, refreshing, collapsed, onCollapse, now, avatars }: {
  view: DashView
  focus: string
  onFocus: (name: string) => void
  onOpen: () => void
  onRefresh: () => void
  refreshing: boolean
  collapsed: boolean
  onCollapse: () => void
  now: number
  avatars: Record<string, string | undefined>
  userName: string
}) {
  const t = useT()
  const tx = useTx()
  const char = view.chars[focus]
  if (!char) return null
  const constName = tx('dash.const', char.constellation)

  if (collapsed) {
    return (
      <div className="flex h-full w-7 shrink-0 flex-col items-center gap-3 border-l border-border bg-card py-2">
        <button
          type="button"
          onClick={onCollapse}
          aria-label={t('dash.expand')}
          title={t('dash.expand')}
          className="rounded-none p-1 text-muted-foreground hover:text-foreground"
        >
          <CaretLeft className="size-4" />
        </button>
        <div
          className="max-h-full overflow-hidden whitespace-nowrap font-heading text-[12px] text-muted-foreground"
          style={{ writingMode: 'vertical-rl' }}
        >
          {constName}
        </div>
      </div>
    )
  }

  const present = view.order.filter((n) => view.present.includes(n) && view.chars[n] && !view.chars[n].compact)
  const counts = noteCounts(char)
  const section = 'border-b border-border px-3 py-2.5'

  return (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-l border-border bg-card" aria-label={t('dash.title')}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="font-heading text-[15px]">{t('dash.title')}</span>
        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          <LiveDot at={view.at} now={now} />
          <AgeText at={view.at} now={now} />
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onRefresh} disabled={refreshing} aria-label={t('dash.refresh')} title={t('dash.refresh')} className="ml-auto rounded-none">
          <ArrowClockwise className={cn(refreshing && 'animate-spin')} />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onCollapse} aria-label={t('dash.collapse')} title={t('dash.collapse')} className="rounded-none">
          <CaretRight />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-[271px] flex-col">
          {(view.clock || present.length > 0) && (
            <div className={cn(section, 'flex flex-col gap-2.5')}>
              <SceneBlock clock={view.clock} />
              {present.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {present.map((n) => (
                    <AvatarButton key={n} name={n} url={avatars[n]} onFocus={onFocus} focused={n === focus} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={cn(section, 'flex flex-col gap-2')}>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 truncate font-heading text-base">{focus}</span>
              <Badge variant="outline" className="rounded-none text-[10px]">{t(`soul.class.${char.cls}`)}</Badge>
            </div>
            <div className="flex justify-center">
              <Constellation stats={char.stats} prevStats={char.prev?.stats} id={char.constellation} prevId={char.prevConstellation} size={128} />
            </div>
            <div className="text-center">
              <div className={cn('font-heading text-base', GOLD_TEXT)}>{constName}</div>
              <div className="text-[11.5px] text-muted-foreground">{tx('dash.constLine', char.constellation)}</div>
            </div>
          </div>

          <div className={cn(section, 'flex flex-col gap-1.5')}>
            {DISPOSITION.map((stat) => (
              <SignedBar key={stat} stat={stat} value={char.stats[stat]} prev={char.prev?.stats[stat]} compact />
            ))}
            {char.cls === 'hostile' && char.hostility !== null && <HostilityBar value={char.hostility} />}
          </div>

          <div className={cn(section, 'flex flex-col gap-1.5')}>
            <Label>{t('dash.threads')}</Label>
            <ThreadList threads={sortedThreads(view.threads)} limit={3} openOnly />
          </div>

          <div className={cn(section, 'flex flex-wrap items-center gap-1.5')}>
            <Badge variant="outline" className="rounded-none text-[10px]">{t('dash.notes.about', { n: counts.about })}</Badge>
            <Badge variant="outline" className="rounded-none text-[10px]">{t('dash.notes.heard', { n: counts.heard })}</Badge>
            <NameChip char={char} />
          </div>

          <div className="flex flex-col gap-2 px-3 py-2.5">
            <Notices view={view} />
            <Button variant="outline" className="w-full rounded-none" onClick={onOpen}>
              {t('dash.open')}
            </Button>
          </div>
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border px-3 py-2">
        <FooterLine view={view} />
      </div>
    </aside>
  )
}
