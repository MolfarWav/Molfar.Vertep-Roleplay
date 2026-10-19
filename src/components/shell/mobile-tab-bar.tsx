
import { useState } from 'react'
import { List, Question, Tray } from '@phosphor-icons/react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import { SECTIONS } from '@/components/shell/sections'
import { NeedsYouBadge, useSectionAttention } from '@/components/shell/needs-you-badge'
import { useInbox, useInboxBadge } from '@/components/shell/inbox'

const PRIMARY = new Set(['home', 'chats', 'characters'])
const primaryTabs = SECTIONS.filter((s) => PRIMARY.has(s.key))
const moreItems = SECTIONS.filter((s) => !PRIMARY.has(s.key))

export function MobileTabBar() {
  const view = useApp((s) => s.view)
  const navigate = useApp((s) => s.navigate)
  const setGuideHelpOpen = useApp((s) => s.setGuideHelpOpen)
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = moreItems.some((i) => i.key === view)
  // #55: the inbox and the Library sit under More on phones, so More carries the total
  const { total: waiting, failures } = useInboxBadge()
  const setInboxOpen = useInbox((s) => s.setOpen)

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
              <item.icon className={cn('size-5', active && 'text-cta')} aria-hidden="true" />
              {t(item.labelKey)}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label={waiting > 0 ? `More sections, ${t('attn.waiting', { n: waiting })}` : 'More sections'}
          className={cn(
            'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 border-t-[3px] font-heading text-[12px]',
            moreActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
          )}
        >
          <span className="relative inline-flex">
            <List className={cn('size-5', moreActive && 'text-cta')} aria-hidden="true" />
            <NeedsYouBadge count={waiting} dot failed={failures > 0} />
          </span>
          {t('nav.more')}
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
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
              <Tray className="size-5 text-cta" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-left">{t('inbox.button')}</span>
              <NeedsYouBadge count={waiting} failed={failures > 0} />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2 px-4 pb-2">
            {moreItems.map((item) => (
              <button
                key={item.key}
                type="button"
                data-guide={`nav.${item.key}`}
                onClick={() => { navigate(item.key); setMoreOpen(false) }}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border font-heading text-[12px]',
                  view === item.key
                    ? 'border-primary/40 bg-accent text-foreground [&>svg]:text-cta'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <span className="relative inline-flex">
                  <item.icon className="size-5" aria-hidden="true" />
                  {item.key === 'litopys' && <LibraryDot />}
                </span>
                {t(item.labelKey)}
              </button>
            ))}
            <button
              type="button"
              data-guide="nav.help"
              onClick={() => { setGuideHelpOpen(true); setMoreOpen(false) }}
              className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-border font-heading text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Question className="size-5" aria-hidden="true" />
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
