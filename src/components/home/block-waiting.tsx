// Waiting on you: what the inbox holds (failures, Library suggestions, proposed souls). Red when something failed.
// The button opens the inbox drawer the way the rail's Inbox button does.

import { Tray } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/store'
import { useInbox } from '@/lib/attention'
import { useInboxBadge } from '@/components/shell/inbox'
import { useT } from '@/hooks/use-t'
import { BODY, BlockCard, BlockHead } from '@/components/home/home-frame'

export interface WaitingViewProps {
  total: number
  failures: number
  onOpen: () => void
}

export function WaitingView({ total, failures, onOpen }: WaitingViewProps) {
  const t = useT()
  const other = Math.max(0, total - failures)
  return (
    <BlockCard>
      <BlockHead tone="sky" icon={Tray} title={t('inbox.title')} aside={failures > 0 ? <span className="rounded-full bg-destructive px-2 py-0.5 text-caption font-semibold text-white">{failures}</span> : null} />
      <div className={BODY}>
        {total === 0 ? (
          <p className="text-body text-muted-foreground">{t('inbox.empty')}</p>
        ) : (
          <div className="flex flex-col gap-1">
            <p className={`font-heading text-display tabular-nums ${failures > 0 ? 'text-destructive' : ''}`}>{total}</p>
            {failures > 0 && <p className="text-body text-destructive">{t('inbox.failedCount', { n: failures })}</p>}
            {other > 0 && <p className="text-body text-muted-foreground">{t('home.waitingMore', { n: other })}</p>}
          </div>
        )}
        <div className="mt-auto pt-2">
          <Button variant="outline" className="max-md:h-10" onClick={onOpen}>
            <Tray aria-hidden="true" /> {t('home.openInbox')}
          </Button>
        </div>
      </div>
    </BlockCard>
  )
}

/** Opens the inbox the way the rail does: from any section, with the full list. */
export function openInbox(): void {
  const inbox = useInbox.getState()
  if (!inbox.open) {
    useApp.getState().closeDrawer()
    inbox.setFilter('all')
  }
  inbox.setOpen(true)
}

export function WaitingBlock() {
  const { total, failures } = useInboxBadge()
  return <WaitingView total={total} failures={failures} onOpen={openInbox} />
}
