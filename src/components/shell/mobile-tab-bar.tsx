
import { useState } from 'react'
import { List } from '@phosphor-icons/react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import { SECTIONS } from '@/components/shell/sections'

const PRIMARY = new Set(['home', 'chats', 'characters'])
const primaryTabs = SECTIONS.filter((s) => PRIMARY.has(s.key))
const moreItems = SECTIONS.filter((s) => !PRIMARY.has(s.key))

export function MobileTabBar() {
  const view = useApp((s) => s.view)
  const navigate = useApp((s) => s.navigate)
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = moreItems.some((i) => i.key === view)

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
          aria-label="More sections"
          className={cn(
            'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 border-t-[3px] font-heading text-[12px]',
            moreActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
          )}
        >
          <List className={cn('size-5', moreActive && 'text-cta')} aria-hidden="true" />
          {t('nav.more')}
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <SheetHeader>
            <SheetTitle>All sections</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-4 gap-2 px-4 pb-2">
            {moreItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => { navigate(item.key); setMoreOpen(false) }}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border font-heading text-[12px]',
                  view === item.key
                    ? 'border-primary/40 bg-accent text-foreground [&>svg]:text-cta'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <item.icon className="size-5" aria-hidden="true" />
                {t(item.labelKey)}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
