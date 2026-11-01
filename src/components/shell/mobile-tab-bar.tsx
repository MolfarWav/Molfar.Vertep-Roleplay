
import { useEffect, useState } from 'react'
import { List, Question, Tray } from '@phosphor-icons/react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import { PHONE_MORE_TILES, PHONE_TABS, itemId } from '@/components/shell/sections'
import { RAIL_HUES } from '@/components/shell/rail-hues'
import { useCanvasBoard, writeCanvasBoard } from '@/lib/canvas-board'
import { NeedsYouBadge, useSectionAttention } from '@/components/shell/needs-you-badge'
import { useInbox, useInboxBadge } from '@/components/shell/inbox'
import { GUIDE_MORE_CLOSE_EVENT, GUIDE_MORE_EVENT, guideTarget } from '@/components/guide/events'

// the sections keep their rail hue on the phone too: the icon is tinted, the label stays neutral
const primaryTabs = PHONE_TABS
const moreItems = PHONE_MORE_TILES

export function MobileTabBar() {
  const view = useApp((s) => s.view)
  const navigate = useApp((s) => s.navigate)
  const canvasBoard = useCanvasBoard()
  const setGuideHelpOpen = useApp((s) => s.setGuideHelpOpen)
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = moreItems.some((i) => i.key === view)
  // #55: the inbox and the Library sit under More on phones, so More carries the total
  const { total: waiting, failures } = useInboxBadge()
  const setInboxOpen = useInbox((s) => s.setOpen)
  // "Show me" for a tip whose target sits under More opens the sheet, so the spotlight has something to point at
  useEffect(() => {
    const open = () => setMoreOpen(true)
    const close = () => setMoreOpen(false)
    window.addEventListener(GUIDE_MORE_EVENT, open)
    window.addEventListener(GUIDE_MORE_CLOSE_EVENT, close)
    return () => { window.removeEventListener(GUIDE_MORE_EVENT, open); window.removeEventListener(GUIDE_MORE_CLOSE_EVENT, close) }
  }, [])

  return (
    <>
      <nav
        aria-label="Primary"
        className="flex shrink-0 items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {primaryTabs.map((item) => {
          const active = view === item.key || (item.key === 'chats' && view === 'chat')
          return (
            <button
              key={item.key}
              type="button"
              data-guide={`nav.${item.key}`}
              onClick={() => navigate(item.key)}
              aria-label={t(item.labelKey)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 border-t-[3px] font-heading text-[12px]',
                active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
              )}
            >
              <item.icon className={cn('size-5', RAIL_HUES[item.hue])} aria-hidden="true" />
              {t(item.labelKey)}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label={waiting > 0 ? `${t('nav.moreSections')}, ${t('attn.waiting', { n: waiting })}` : t('nav.moreSections')}
          className={cn(
            'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 border-t-[3px] font-heading text-[12px]',
            moreActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
          )}
        >
          <span className="relative inline-flex">
            <List className={cn('size-5', moreActive ? 'text-cta' : RAIL_HUES.zinc)} aria-hidden="true" />
            <NeedsYouBadge count={waiting} dot failed={failures > 0} />
          </span>
          {t('nav.more')}
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={(o, d) => { if (!o && guideTarget(d?.event)) return; setMoreOpen(o) }}>
        <SheetContent side="bottom" className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <SheetHeader>
            <SheetTitle>All sections</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-1">
            <button
              type="button"
              data-guide="nav.inbox"
              onClick={() => { setMoreOpen(false); useInbox.getState().setFilter('all'); setInboxOpen(true) }}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border px-3 font-heading text-[15px] text-foreground hover:bg-accent"
            >
              <Tray className={cn('size-5', RAIL_HUES.sky)} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-left">{t('inbox.button')}</span>
              <NeedsYouBadge count={waiting} failed={failures > 0} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 px-4 pb-2">
            {moreItems.map((item) => {
              // Agents is a link to a Canvas board, not a section: current only while that board is open (as on the rail)
              const active = item.key === 'canvas' ? view === 'canvas' && (canvasBoard === 'agents') === !!item.board : view === item.key
              return (
                <button
                  key={itemId(item)}
                  type="button"
                  data-guide={`nav.${itemId(item)}`}
                  onClick={() => {
                    if (item.key === 'canvas') writeCanvasBoard(item.board ?? (canvasBoard === 'agents' ? 'links' : canvasBoard))
                    navigate(item.key)
                    setMoreOpen(false)
                  }}
                  className={cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border font-heading text-caption',
                    active
                      ? 'border-primary/40 bg-accent text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span className="relative inline-flex">
                    <item.icon className={cn('size-5', RAIL_HUES[item.hue])} aria-hidden="true" />
                    {item.key === 'litopys' && <LibraryDot />}
                  </span>
                  {t(item.labelKey)}
                </button>
              )
            })}
            <button
              type="button"
              data-guide="nav.help"
              onClick={() => { setGuideHelpOpen(true); setMoreOpen(false) }}
              className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-border font-heading text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Question className={cn('size-5', RAIL_HUES.zinc)} aria-hidden="true" />
              {t('guide.help')}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function LibraryDot() {
  return <NeedsYouBadge count={useSectionAttention('litopys')} dot />
}
