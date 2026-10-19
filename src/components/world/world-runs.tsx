import { useEffect, useRef, useState } from 'react'
import { Warning } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm'
import { useRelativeTime, useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { loadWorldRuns, useWorldLive, type WorldRun, type WorldUsage } from '@/lib/world'
import { formatK, formatMoney, formatSeconds } from './world-common'

const REASONS = ['every', 'stagnation', 'transition', 'manual', 'start', 'deck'] as const

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex min-w-[5.5rem] flex-1 flex-col gap-0.5 rounded-md border border-border bg-card p-2.5">
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function RunRow({ run, shown }: { run: WorldRun; shown: boolean }) {
  const t = useT()
  const relativeTime = useRelativeTime()

  const reasonLabel = (REASONS as readonly string[]).includes(run.reason)
    ? t(`world.reason.${run.reason}` as MsgKey)
    : run.reason

  return (
    <div data-testid="world-run" className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <time
          dateTime={new Date(run.at).toISOString()}
          title={new Date(run.at).toLocaleString()}
          className="text-sm font-medium"
        >
          {relativeTime(run.at)}
        </time>

        <Badge variant="secondary" className="text-[11px]">
          {reasonLabel}
        </Badge>

        {run.retried && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {t('world.runs.retried')}
          </Badge>
        )}

        {run.error && (
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
            <Warning className="size-3" aria-hidden="true" />
            {t(`world.runs.err.${run.error}` as MsgKey)}
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {!(run.error && run.changes === 0 && run.fronts === 0) && (
          <span>{t('world.runs.changes', { n: run.changes, f: run.fronts })}</span>
        )}

        {run.usage && <span>{t('world.runs.tokens', { in: formatK(run.usage.input), out: formatK(run.usage.output) })}</span>}

        {run.usage && run.usage.cost > 0 && <span>{formatMoney(run.usage.cost)}</span>}

        {run.ms > 0 && <span>{formatSeconds(run.ms)} s</span>}
      </div>

      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {run.model && <span className="font-mono break-all">{run.model}</span>}
        {run.limit && <span>{t('world.runs.limit', { max: run.limit.max })}</span>}
      </div>

      {shown && (
        <p className={cn('mt-2 border-t border-border pt-2 text-xs text-muted-foreground break-words', !run.summary && 'italic')}>
          {run.summary || t('world.runs.noSummary')}
        </p>
      )}
    </div>
  )
}

export function WorldRuns({ chatId }: { chatId: string }) {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()

  const [runs, setRuns] = useState<WorldRun[] | null>(null)
  const [usage, setUsage] = useState<(WorldUsage & { runs: number }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(false)

  const reqRef = useRef(0)
  const lastRunAt = useWorldLive((s) => s.views[chatId]?.lastRunAt)
  // a failed run does not move lastRunAt: its error time does
  const lastErrorAt = useWorldLive((s) => s.views[chatId]?.lastError?.at)

  useEffect(() => {
    let live = true
    const my = ++reqRef.current
    setLoading(true)
    setError(null)

    loadWorldRuns(chatId)
      .then((res) => {
        if (!live || my !== reqRef.current) return
        setRuns(res.runs)
        setUsage(res.usage)
      })
      .catch((e) => {
        if (!live || my !== reqRef.current) return
        setError(e instanceof Error ? e.message : String(e))
        setRuns(null)
        setUsage(null)
      })
      .finally(() => {
        if (!live || my !== reqRef.current) return
        setLoading(false)
      })

    return () => {
      live = false
    }
  }, [chatId, lastRunAt, lastErrorAt])

  const askShow = async () => {
    const yes = await confirm({
      title: t('world.peekTitle'),
      description: t('world.peekWarn'),
      actionLabel: t('world.peekGo'),
      destructive: false,
    })
    if (yes) setShown(true)
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading && runs === null && (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('chats.panel.loading')}</p>
      )}

      {!loading && runs !== null && runs.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('world.runs.empty')}</p>
      )}

      {runs !== null && runs.length > 0 && usage && (
        <>
          <div className="flex flex-wrap gap-2">
            <Stat value={usage.runs} label={t('world.runs.statRuns')} />
            <Stat value={formatK(usage.input + usage.output)} label={t('world.runs.statTokens')} />
            {usage.cost > 0 && <Stat value={formatMoney(usage.cost)} label={t('world.runs.statCost')} />}
          </div>

          {!shown && (
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{t('world.runs.hidden')}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 max-md:h-10"
                onClick={() => void askShow()}
              >
                {t('world.runs.show')}
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {runs.map((run) => (
              <RunRow key={`${run.at}-${run.reason}`} run={run} shown={shown} />
            ))}
          </div>
        </>
      )}

      {confirmDialog}
    </div>
  )
}
