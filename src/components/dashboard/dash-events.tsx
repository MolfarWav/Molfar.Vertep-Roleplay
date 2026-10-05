import type { DashEvent } from '@/lib/dashboard'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import { Box, useTx } from './dash-common'

const chip = 'border border-border px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground'

export function EventList({ events, userName, className, compact }: {
  events: DashEvent[]
  userName: string
  className?: string
  /** the wide view: at most ~360 px tall, scrolls inside */
  compact?: boolean
}) {
  const t = useT()
  const tx = useTx()
  const you = userName || t('dash.you')
  const side = (s: string | null) => (s === 'user' ? you : s)
  return (
    <Box title={t('dash.changed')} className={cn(compact && 'max-h-[360px] overflow-y-auto', className)}>
      {events.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t('dash.changed.none')}</div>
      ) : (
        <ul className="flex flex-col">
          {events.map((ev) => {
            const from = side(ev.from)
            const to = side(ev.to)
            return (
              <li key={`${ev.id}|${ev.from}|${ev.to}|${ev.quote}`} className="min-w-0 border-b border-dashed border-border py-2 first:pt-0 last:border-b-0 last:pb-0">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="font-heading text-sm break-words">{ev.id.replace(/_/g, ' ')}</span>
                  <span className={chip}>{tx('dash.family', ev.family)}</span>
                  <span className={chip}>{tx('dash.weight', ev.weight)}</span>
                </div>
                {from && to && <div className="mt-0.5 text-xs text-muted-foreground break-words">{t('dash.event.from', { from, to })}</div>}
                {ev.quote && <div className="mt-0.5 text-sm italic break-words">“{ev.quote}”</div>}
                {ev.math.length > 0 && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {ev.math.map((m) => (
                      <div key={m} className="font-mono text-[11px] text-muted-foreground break-words">{m}</div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Box>
  )
}
