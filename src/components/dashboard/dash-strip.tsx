import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowClockwise, ArrowsOut, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { type DashView } from '@/lib/dashboard'
import { useT } from '@/hooks/use-t'
import { CarriedBanner } from './dash-carried'
import { AgeText, FooterLine, LiveDot, Notices, useTx } from './dash-common'
import { DashTabs, DashTop, HerePanel, NotesPanel, PersonPanel, QuestsPanel, type DashTabId } from './dash-tabs'
import { clampStripWidth, isNarrowStrip, STRIP_DEFAULT, STRIP_MAX, STRIP_MIN, stripWeatherSize } from '@/lib/dash-strip-width'
import type { WorldHere } from '@/lib/world'

const STRIP_TABS: DashTabId[] = ['person', 'here', 'quests', 'notes']

/**
 * The drag handle on the strip's left edge. Pointer drag, arrow keys (Left widens, Right narrows, Shift for
 * bigger steps), double click for the default. `onWidth(n, final)`: final is true when the change is done.
 */
export function StripHandle({ width, onWidth }: { width: number; onWidth: (n: number, final: boolean) => void }) {
  const t = useT()
  const drag = useRef<{ x: number; w: number } | null>(null)
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, w: width }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d) onWidth(clampStripWidth(d.w + (d.x - e.clientX)), false)
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    onWidth(clampStripWidth(d.w + (d.x - e.clientX)), true)
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10
    if (e.key === 'ArrowLeft') onWidth(clampStripWidth(width + step), true)
    else if (e.key === 'ArrowRight') onWidth(clampStripWidth(width - step), true)
    else if (e.key === 'Home') onWidth(STRIP_MIN, true)
    else if (e.key === 'End') onWidth(STRIP_MAX, true)
    else return
    e.preventDefault()
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('dash.strip.resize')}
      aria-valuemin={STRIP_MIN}
      aria-valuemax={STRIP_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title={t('dash.strip.resize')}
      data-testid="dash-strip-handle"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      onDoubleClick={() => onWidth(STRIP_DEFAULT, true)}
      className="group absolute inset-y-0 -left-1 z-20 flex w-2 cursor-col-resize touch-none items-center justify-center outline-none"
    >
      <span className="h-10 w-0.5 bg-border group-hover:bg-cta group-focus-visible:bg-cta group-active:bg-cta" aria-hidden="true" />
    </div>
  )
}

export function DashStrip({ chatId, view, here, focus, onFocus, onOpen, onNotebook, onRefresh, onReload, refreshing, collapsed, onCollapse, now, avatars, onPortrait, width, onWidth }: {
  chatId: string
  view: DashView
  here: WorldHere | null
  focus: string
  onFocus: (name: string) => void
  onOpen: () => void
  /** open the wide view on the focused character, the notebook in view */
  onNotebook: () => void
  onRefresh: () => void
  /** read the state and the World DM's records again (after the DM was switched on) */
  onReload: () => void
  refreshing: boolean
  collapsed: boolean
  onCollapse: () => void
  now: number
  avatars: Record<string, string | undefined>
  /** opens the portrait dialog for a name (a click on the focused character's avatar) */
  onPortrait?: (name: string) => void
  userName: string
  width: number
  onWidth: (n: number, final: boolean) => void
}) {
  const t = useT()
  const tx = useTx()
  const [tab, setTab] = useState<DashTabId>('person')
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

  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-border bg-card" style={{ width }} aria-label={t('dash.title')} data-testid="dash-strip">
      <StripHandle width={width} onWidth={onWidth} />
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

      {/* the way into the full dashboard sits on top, in the accent colour: at the bottom of a long strip it went unseen */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <Button size="sm" className="w-full rounded-none" onClick={onOpen}>
          <ArrowsOut aria-hidden="true" />
          {t('dash.open')}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col" style={{ width: width - 1 }}>
          {view.inherit && <CarriedBanner chatId={chatId} inherit={view.inherit} className="m-3" />}
          <DashTop
            view={view}
            here={here}
            focus={focus}
            onFocus={onFocus}
            avatars={avatars}
            onPortrait={onPortrait}
            weatherSize={stripWeatherSize(width)}
            onTab={setTab}
          />
          <DashTabs
            tabs={STRIP_TABS}
            value={tab}
            onValueChange={setTab}
            view={view}
            here={here}
            focus={focus}
            render={(id) =>
              id === 'person' ? (
                <PersonPanel view={view} here={here} chatId={chatId} onReload={onReload} focus={focus} onFocus={onFocus} avatars={avatars} narrow={isNarrowStrip(width)} />
              ) : id === 'here' ? (
                <HerePanel view={view} here={here} chatId={chatId} onReload={onReload} focus={focus} onFocus={onFocus} />
              ) : id === 'quests' ? (
                <QuestsPanel view={view} />
              ) : (
                <NotesPanel view={view} focus={focus} onNotebook={onNotebook} />
              )
            }
          />
          <div className="flex flex-col gap-2 px-3 py-2.5 empty:hidden">
            <Notices view={view} />
          </div>
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border px-3 py-2">
        <FooterLine view={view} chatId={chatId} />
      </div>
    </aside>
  )
}
