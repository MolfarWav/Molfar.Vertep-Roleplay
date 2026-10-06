import { useRelativeTime, useT } from '@/hooks/use-t'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Gear, WarningCircle } from '@phosphor-icons/react'
import type { LitWorker } from './litopys-api'

export function WorkerLine({ worker }: { worker: LitWorker | null }) {
  const t = useT()
  const rel = useRelativeTime()

  if (worker === null) {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Gear className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {t('lit.worker')}
          </span>
          <span className="text-muted-foreground">{t('lit.worker.never')}</span>
        </div>
      </div>
    )
  }

  const ok = worker.ok
  const lastScene = worker.lastScene
  const hasScene =
    lastScene != null &&
    typeof lastScene.fromNo === 'number' &&
    typeof lastScene.toNo === 'number' &&
    lastScene.fromNo > 0 &&
    lastScene.toNo > 0

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Gear className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {t('lit.worker')}
        </span>

        {ok ? (
          <Badge variant="secondary" className="text-[10px]">
            <CheckCircle
              className="mr-1 size-3 text-primary"
              weight="fill"
              aria-hidden="true"
            />
            {t('lit.worker.ok')}
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-[10px]">
            <WarningCircle className="mr-1 size-3" aria-hidden="true" />
            {t('lit.worker.failed')}
          </Badge>
        )}

        {worker.lastRunAt > 0 && (
          <span className="text-muted-foreground">
            {t('lit.worker.last', { when: rel(worker.lastRunAt) })}
          </span>
        )}

        {hasScene && (
          <span className="text-muted-foreground">
            {t('lit.worker.scene', {
              from: lastScene!.fromNo!,
              to: lastScene!.toNo!,
            })}
          </span>
        )}

        {typeof worker.ms === 'number' && (
          <span className="text-muted-foreground">
            {t('lit.worker.ms', { n: worker.ms })}
          </span>
        )}

        {!ok &&
          typeof worker.retryAt === 'number' &&
          worker.retryAt > Date.now() && (
            <span className="text-muted-foreground">
              {t('lit.worker.retry', {
                time: new Date(worker.retryAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </span>
          )}
      </div>

      {!ok && worker.error && (
        <div className="mt-1 w-full text-destructive break-words">{worker.error}</div>
      )}
    </div>
  )
}
