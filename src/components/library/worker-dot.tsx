import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import type { LitWorker } from './litopys-api'

const states = {
  working: 'lit.state.working',
  idle: 'lit.state.idle',
  queued: 'lit.state.queued',
  retry: 'lit.state.retry',
  stalled: 'lit.state.stalled',
} as const

export function WorkerDot({ worker, className }: { worker: LitWorker | null; className?: string }) {
  const t = useT()
  const state = worker?.state ?? 'never'
  const label = state === 'never' ? t('lit.state.never') : t(states[state as keyof typeof states])

  return (
    <span
      role="img"
      data-testid="worker-dot"
      data-state={state}
      aria-label={label}
      title={label}
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
    >
      {state === 'working' && (
        <span className="size-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      )}
      {state === 'idle' && <span className="size-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />}
      {state === 'queued' && <span className="size-2.5 rounded-full bg-muted-foreground/40" />}
      {state === 'retry' && <span className="size-2.5 rounded-full bg-amber-600 dark:bg-amber-400" />}
      {state === 'stalled' && (
        <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
      )}
      {state === 'never' && <span className="size-2.5 rounded-full border-2 border-muted-foreground/40" />}
    </span>
  )
}
