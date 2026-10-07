import { useEffect, useState } from 'react'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { WorkerDot } from './worker-dot'
import type { LitChat } from './litopys-api'

export function WorkerLine({
  worker,
  rebuilding,
  rebuildScenes,
}: {
  worker: LitChat['worker']
  rebuilding: LitChat['rebuilding']
  rebuildScenes: number
}) {
  const t = useT()
  const rel = useRelativeTime()
  const [, setTick] = useState(0)

  useEffect(() => {
    if (worker?.state !== 'working') return
    const timer = setInterval(() => setTick((v) => v + 1), 1000)
    return () => clearInterval(timer)
  }, [worker?.state])

  const state = worker?.state ?? 'never'
  const secondary = worker?.error

  const main = (() => {
    if (!worker) return t('lit.worker.never')
    switch (worker.state) {
      case 'working': {
        const s = worker.inFlight ? Math.max(0, Math.floor((Date.now() - worker.inFlight.since) / 1000)) : 0
        return worker.inFlight
          ? t('lit.w.working', { from: worker.inFlight.fromNo, to: worker.inFlight.toNo, s })
          : t('lit.w.workingNa')
      }
      case 'idle':
        return t('lit.w.idle')
      case 'queued':
        return (worker.next ?? 0) > 0
          ? t('lit.w.queued', { n: worker.next! })
          : t('lit.w.queuedTurn')
      case 'retry': {
        const time =
          typeof worker.retryAt === 'number'
            ? new Date(worker.retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : ''
        return t('lit.w.retry', { time })
      }
      case 'stalled': {
        const n = Math.max(1, Math.round((worker.stalledFor ?? 0) / 60000))
        return t('lit.w.stalled', { n, left: worker.next ?? 0 })
      }
      default:
        return t('lit.worker.never')
    }
  })()

  const buildN = rebuilding ? rebuilding.chapters + (worker?.state === 'working' ? 1 : 0) : 0
  const buildTotal = Math.max(rebuildScenes, buildN, 1)
  const buildPct = Math.min(100, Math.round((buildN / buildTotal) * 100))

  const detailParts: string[] = []
  if (worker && worker.lastRunAt > 0) detailParts.push(t('lit.worker.last', { when: rel(worker.lastRunAt) }))
  if (worker?.lastProgressAt) detailParts.push(t('lit.w.progress', { when: rel(worker.lastProgressAt) }))
  if (worker?.facts) {
    detailParts.push(
      t('lit.worker.facts', { got: worker.facts.got, added: worker.facts.added }) +
        (worker.facts.skipped > 0 ? t('lit.worker.factsSkipped', { skipped: worker.facts.skipped }) : '')
    )
  }
  if (typeof worker?.ms === 'number') detailParts.push(t('lit.worker.ms', { n: worker.ms }))

  return (
    <div
      data-testid="worker-line"
      data-state={state}
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card px-3 py-2.5"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <WorkerDot worker={worker} className="mt-0.5 size-3" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            className={cn(
              'text-xs leading-snug',
              state === 'retry' && 'text-amber-600 dark:text-amber-400',
              state === 'stalled' && 'text-destructive',
              state !== 'retry' && state !== 'stalled' && 'text-foreground'
            )}
          >
            {main}
          </div>
          {state === 'retry' && secondary && (
            <div className="text-xs break-words text-muted-foreground">{secondary}</div>
          )}
          {detailParts.length > 0 && (
            <div className="text-[11px] leading-snug break-words text-muted-foreground">
              {detailParts.join(' · ')}
            </div>
          )}
        </div>
      </div>

      {(rebuilding || worker?.rebuild) && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-primary">
            {t('lit.w.rebuild', { n: buildN, total: buildTotal })}
          </div>
          <div className="h-1 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${buildPct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
