// Waiting on you: what the inbox holds (failures, Library suggestions, proposed souls). Red when something failed.
// The button opens the inbox drawer the way the rail's Inbox button does.

import type { ReactNode } from 'react'
import { Tray } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/section'
import { useApp } from '@/lib/store'
import { useInbox } from '@/lib/attention'
import { InboxItem, useInboxRows } from '@/components/shell/inbox'
import type { InboxRow } from '@/lib/attention'
import { useT } from '@/hooks/use-t'
import { BODY, BlockCard, BlockHead } from '@/components/home/home-frame'

/** How many rows the block lists before it sends the player to the inbox. */
export const WAITING_ROWS = 3

export interface WaitingViewProps {
  total: number
  failures: number
  onOpen: () => void
  /** what waits, by kind: failures and souls count rows, approvals count proposals */
  kinds?: { failed: number; litopys: number; soul: number; letter: number }
  /** the first rows, already drawn */
  rows?: ReactNode
  /** rows beyond the listed ones */
  more?: number
}

const KIND_TONE = { litopys: 'sky', soul: 'violet', letter: 'emerald' } as const

export function WaitingView({ total, failures, onOpen, kinds, rows, more = 0 }: WaitingViewProps) {
  const t = useT()
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
          </div>
        )}
        {kinds && total > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {kinds.failed > 0 && <Chip className="border-destructive/40 bg-destructive/10 text-destructive">{kinds.failed} {t('inbox.kind.failed')}</Chip>}
            {kinds.litopys > 0 && <Chip tone={KIND_TONE.litopys}>{kinds.litopys} {t('inbox.kind.litopys')}</Chip>}
            {kinds.soul > 0 && <Chip tone={KIND_TONE.soul}>{kinds.soul} {t('inbox.kind.soul')}</Chip>}
            {kinds.letter > 0 && <Chip tone={KIND_TONE.letter}>{kinds.letter} {t('inbox.kind.letter')}</Chip>}
          </div>
        )}
        {rows ? <ul className="flex flex-col gap-2">{rows}</ul> : null}
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
          <Button variant="outline" className="max-md:h-10" onClick={onOpen}>
            <Tray aria-hidden="true" /> {t('home.openInbox')}
          </Button>
          {more > 0 && <span className="text-caption text-muted-foreground">{t('home.waitingMore', { n: more })}</span>}
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

/** The rows by kind for the chips: an approval row counts its proposals, as the badge does. */
export function kindsOf(rows: readonly InboxRow[]): { failed: number; litopys: number; soul: number; letter: number } {
  const k = { failed: 0, litopys: 0, soul: 0, letter: 0 }
  for (const r of rows) k[r.kind] += r.kind === 'litopys' ? r.count : 1
  return k
}

export function WaitingBlock() {
  const { rows, total, failures } = useInboxRows()
  const shown = rows.slice(0, WAITING_ROWS)
  return (
    <WaitingView
      total={total}
      failures={failures}
      onOpen={openInbox}
      kinds={kindsOf(rows)}
      rows={shown.length > 0 ? shown.map((r) => <InboxItem key={r.key} row={r} />) : null}
      more={Math.max(0, rows.length - shown.length)}
    />
  )
}
