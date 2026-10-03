import { createContext, useContext, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { useIsMobile } from '@/hooks/use-mobile'
import { useT } from '@/hooks/use-t'
import type { ViewKey } from '@/lib/store'
import { SECTIONS } from '@/components/shell/sections'

/** Where a section view is mounted: as the page itself (from Home, Chats or
 *  another section, on phones) or as the drawer (desktop, or over a chat). */
type SectionHost = 'page' | 'drawer'

const HostContext = createContext<SectionHost>('page')
export const SectionHostProvider = HostContext.Provider
export const useSectionHost = () => useContext(HostContext)

/** The translated title of a section. */
function useSectionTitle(section: ViewKey): string {
  const t = useT()
  const item = SECTIONS.find((s) => s.key === section)
  return item ? t(item.labelKey) : ''
}

/**
 * Wraps a section view. As a page it puts the section's title (Kurale, with the
 * item count chip) above the view; as a drawer it adds nothing, since the
 * drawer carries its own title bar.
 *
 * hideOnPhone drops the title on phones while a detail pane is open: the
 * detail already has its own back row there and the room is better spent.
 */
export function SectionPage({ section, count, hideOnPhone, actions, children }: {
  section: ViewKey
  count?: number | string
  hideOnPhone?: boolean
  /** shown at the right end of the title row */
  actions?: ReactNode
  children: ReactNode
}) {
  const host = useSectionHost()
  const isMobile = useIsMobile()
  const title = useSectionTitle(section)
  if (host === 'drawer') return <>{children}</>
  const showTitle = !(hideOnPhone && isMobile)
  return (
    <div className="flex h-full min-h-0 flex-col">
      {showTitle && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 pt-3.5 pb-3 md:px-8 md:pt-5 md:pb-4">
          <h1 className="font-heading text-[25px] leading-none md:text-[40px]">{title}</h1>
          {count != null && <Badge variant="secondary">{count}</Badge>}
          {actions && <div className="ml-auto flex min-w-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

/**
 * The small title inside a view's own header row. In a drawer it is the old
 * compact heading (with its count); as a page the big title above already says
 * it, so this keeps only a screen-reader heading.
 */
export function PaneTitle({ section, count, icon }: { section: ViewKey; count?: number | string; icon?: ReactNode }) {
  const host = useSectionHost()
  const title = useSectionTitle(section)
  if (host === 'page') return <h2 className="sr-only">{title}</h2>
  return (
    <>
      {icon}
      <h1 className="text-sm font-semibold">{title}</h1>
      {count != null && <Badge variant="secondary">{count}</Badge>}
    </>
  )
}
