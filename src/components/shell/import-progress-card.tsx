import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useT } from '@/hooks/use-t'
import { jobFraction, useImportProgress, type ImportJob } from '@/lib/import-progress'

/** A job that ended with nothing to read closes by itself after this long. */
const AUTO_CLOSE_MS = 7000
/** The failed files listed before "and N more". */
const SHOW_FAILED = 3

function JobCard({ job }: { job: ImportJob }) {
  const t = useT()
  const dismiss = useImportProgress((s) => s.dismiss)
  const requestCancel = useImportProgress((s) => s.requestCancel)
  const running = job.status === 'running'
  const pct = Math.round(jobFraction(job) * 100)
  const ok = Math.max(0, job.done - job.failed.length)

  useEffect(() => {
    if (running || job.failed.length > 0) return
    const timer = window.setTimeout(() => dismiss(job.id), AUTO_CLOSE_MS)
    return () => window.clearTimeout(timer)
  }, [running, job.failed.length, job.id, dismiss])

  const line = running
    ? job.cancelRequested ? t('imp.cancelling') : [job.current, job.step].filter(Boolean).join(' · ')
    : job.summary ?? (job.status === 'cancelled' ? t('imp.cancelled', { ok, total: job.total }) : t('imp.done', { ok, total: job.total }))

  return (
    <section
      role="group"
      aria-label={job.title}
      className="pointer-events-auto flex flex-col gap-2 border border-border bg-popover p-3 text-popover-foreground shadow-lg"
      data-testid="import-progress"
    >
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-heading text-sm">{job.title}</h3>
        {running ? (
          <Button size="sm" variant="outline" className="rounded-none max-md:h-10" disabled={job.cancelRequested} onClick={() => requestCancel(job.id)}>
            {t('imp.cancel')}
          </Button>
        ) : (
          <Button size="icon-sm" variant="ghost" className="rounded-none max-md:size-10" onClick={() => dismiss(job.id)} aria-label={t('imp.dismiss')} title={t('imp.dismiss')}>
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={job.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-full bg-muted"
      >
        <div
          className={cn(
            'h-full transition-[width] duration-200 motion-reduce:transition-none',
            running ? 'bg-primary' : job.status === 'cancelled' ? 'bg-amber-500' : job.failed.length ? 'bg-amber-500' : 'bg-emerald-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex min-w-0 items-baseline gap-2 text-xs text-muted-foreground" aria-live="polite">
        <span className="min-w-0 flex-1 truncate">{line}</span>
        <span className="shrink-0 font-mono">{running && job.count && job.total > 1 ? t('imp.count', { done: job.done, total: job.total }) : `${pct}%`}</span>
      </div>
      {!running && job.failed.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2 text-xs">
          <p className="font-medium text-rose-700 dark:text-rose-300">{t('imp.failed', { n: job.failed.length })}</p>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {job.failed.slice(0, SHOW_FAILED).map((f, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the same file can fail twice in one job
              <li key={i} className="break-words">{f.name}{f.message ? `: ${f.message}` : ''}</li>
            ))}
            {job.failed.length > SHOW_FAILED && <li>{t('imp.more', { n: job.failed.length - SHOW_FAILED })}</li>}
          </ul>
        </div>
      )}
    </section>
  )
}

/** The progress of every running or just finished import, stacked at the bottom of the app (above the tab bar on a phone). */
export function ImportProgressCard() {
  const jobs = useImportProgress((s) => s.jobs)
  if (!jobs.length) return null
  // on the body, beside the drawers' own portals: inside #app the card would sit under an open drawer
  // and be inert with it, and Cancel is needed exactly while the drawer where the file was chosen is open
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2 max-md:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]">
      {jobs.map((job) => <JobCard key={job.id} job={job} />)}
    </div>,
    document.body,
  )
}
