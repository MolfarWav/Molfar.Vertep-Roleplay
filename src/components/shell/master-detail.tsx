
import type { ReactNode } from 'react'
import { CaretLeft } from '@phosphor-icons/react'
import { useIsMobile } from '@/hooks/use-mobile'
import { useBackClose } from '@/hooks/use-back-close'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'

/**
 * Two-pane master/detail layout.
 *
 * Desktop (>=768px): master and detail sit side by side, exactly as before.
 * Mobile  (<768px):  only one pane is mounted at a time. The detail pane takes
 *                    the full width in a single page scroller whose first row
 *                    is the back header — it scrolls WITH the page instead of
 *                    pinning over the content (a pinned row keeps eating the
 *                    viewport once the keyboard opens). The detail's own
 *                    ScrollArea auto-heights to its content inside that page
 *                    scroller, so there is exactly one scroll: the page.
 */
export function MasterDetail({
  detailOpen,
  onBack,
  detailTitle,
  masterWidth = 'w-64',
  master,
  detail,
}: {
  /** True when the detail pane should take over the screen on mobile. */
  detailOpen: boolean
  onBack: () => void
  /** Shown in the mobile back header. */
  detailTitle?: string
  /** Tailwind width class for the master pane on desktop. */
  masterWidth?: string
  master: ReactNode
  detail: ReactNode
}) {
  const isMobile = useIsMobile()
  const t = useT()
  useBackClose(detailOpen, onBack)

  if (isMobile) {
    if (!detailOpen) {
      return <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">{master}</div>
    }
    return (
      // inner ScrollArea viewports get overscroll-auto: with their default
      // overscroll-contain, a wheel over the (auto-height, non-scrolling)
      // viewport never chains up to this page scroller and the page won't move
      <div className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [&_[data-slot=scroll-area-viewport]]:overscroll-auto">
        <div className="flex min-h-full flex-col">
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-2">
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 flex min-h-9 items-center gap-0.5 rounded-md pr-2 pl-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <CaretLeft className="size-5" aria-hidden="true" />
              {t('dash.set.back')}
            </button>
            {detailTitle && (
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{detailTitle}</span>
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{detail}</div>
        </div>
      </div>
    )
  }

  return (
    // `min-h-0` on both panes is load-bearing: a flex item defaults to
    // `min-height:auto`, which refuses to shrink below its content. Without it
    // a tall pane grows past the viewport, its inner ScrollArea inherits that
    // grown height, and the overflow becomes unreachable instead of scrolling
    // (the Lorebooks / Presets / Regex "can't scroll down" bug).
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className={cn('flex min-h-0 shrink-0 flex-col border-r border-border', masterWidth)}>{master}</div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{detail}</div>
    </div>
  )
}
