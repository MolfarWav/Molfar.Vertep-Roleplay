import { useT } from '@/hooks/use-t'
import { type TabProps, useFactControls } from './ledger-facts'
import { ProposalsTab } from './ledger-proposals'
import { CastCards } from './overview-cast'
import { Timeline } from './overview-timeline'
import { StitchHeading } from './stitch'

const Heading = StitchHeading

/**
 * The Overview of one chat (M4c): the chapter timeline on the left, the proposals and the
 * character cards on the right; one column when the panel is narrow (container queries, since
 * the Library is a drawer on desktop and a page on phones). Every fact can be edited here too.
 */
export function OverviewBody({ chat, onChat, onRefresh }: TabProps) {
  const t = useT()
  const ctl = useFactControls(chat, onChat)
  const pending = chat.proposals.filter((p) => p.status === 'pending').length
  return (
    <div className="@container" data-testid="overview">
      {ctl.dialogs}
      <div className="grid gap-5 @2xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <section className="flex min-w-0 flex-col gap-3 @2xl:order-1">
          <Heading>{t('lit.ov.timeline')}</Heading>
          <Timeline chat={chat} onChat={onChat} onRefresh={onRefresh} ctl={ctl} />
        </section>
        <aside className="flex min-w-0 flex-col gap-5 @2xl:order-2">
          {pending > 0 && (
            <section className="flex flex-col gap-3">
              <Heading>{t('lit.ov.proposals', { n: pending })}</Heading>
              <ProposalsTab chat={chat} onChat={onChat} onRefresh={onRefresh} />
            </section>
          )}
          <section className="flex flex-col gap-3">
            <Heading>{t('lit.ov.cast')}</Heading>
            <CastCards chat={chat} onChat={onChat} onRefresh={onRefresh} ctl={ctl} />
          </section>
        </aside>
      </div>
    </div>
  )
}
