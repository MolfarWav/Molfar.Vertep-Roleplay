import { create } from 'zustand'

/**
 * Progress of an import (cards, presets, lorebooks, personas, regex, chats, backups, links): one job per import,
 * shown as a card at the bottom of the app (components/shell/import-progress-card.tsx). A job counts whole units
 * (a file, a batch of cards sent together); a unit that cannot be split (one big preset, one chat) shows its
 * steps ("Reading the file", "Saving") and moves the bar by the share the caller names, so the bar never claims
 * a percent the work does not have. Cancel stops between units: what is already imported stays.
 */

export interface ImportJob {
  id: string
  title: string
  /** the unit being worked on (a file name), and the step inside it */
  current: string
  step: string
  /** how many units there are, how many are finished, and the share of the running one (0..1) */
  total: number
  done: number
  inner: number
  failed: { name: string; message: string }[]
  status: 'running' | 'done' | 'cancelled'
  cancelRequested: boolean
  startedAt: number
  /** the line shown when the job ends */
  summary?: string
  /** show "3 of 12": off when the units are not what the user thinks of (files and batches together) */
  count: boolean
}

/** 0..1: the finished units plus the share of the running one; a finished job is whole. */
export function jobFraction(job: Pick<ImportJob, 'total' | 'done' | 'inner' | 'status'>): number {
  if (job.status === 'done') return 1
  if (job.total <= 0) return 0
  return Math.max(0, Math.min(1, (job.done + Math.max(0, Math.min(1, job.inner))) / job.total))
}

interface ImportStore {
  jobs: ImportJob[]
  patch: (id: string, change: Partial<ImportJob> | ((j: ImportJob) => Partial<ImportJob>)) => void
  dismiss: (id: string) => void
  requestCancel: (id: string) => void
}

export const useImportProgress = create<ImportStore>((set) => ({
  jobs: [],
  patch: (id, change) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...(typeof change === 'function' ? change(j) : change) } : j)) })),
  dismiss: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
  requestCancel: (id) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id && j.status === 'running' ? { ...j, cancelRequested: true } : j)) })),
}))

export interface ImportRun {
  readonly id: string
  /** a unit begins; `name` is shown (a file name) */
  start(name: string, step?: string): void
  /** a step inside the running unit; `inner` is the share of the unit that is done (0..1), when known */
  step(step: string, inner?: number): void
  /** the running unit ends */
  finish(ok?: boolean, message?: string): void
  /** the user pressed Cancel: stop before the next unit */
  cancelled(): boolean
  /** the job ends; `summary` replaces the default line */
  end(summary?: string): void
  /** the job is taken off the screen at once (another job carries on from here) */
  drop(): void
}

let counter = 0

/** Begin a job of `total` units. Always call `end` (put it in a finally). */
export function beginImport(title: string, total: number, opts?: { count?: boolean }): ImportRun {
  const id = `imp_${Date.now().toString(36)}_${++counter}`
  const job: ImportJob = { id, title, current: '', step: '', total: Math.max(1, Math.floor(total)), done: 0, inner: 0, failed: [], status: 'running', cancelRequested: false, startedAt: Date.now(), count: opts?.count !== false }
  useImportProgress.setState((s) => ({ jobs: [...s.jobs, job] }))
  const patch = useImportProgress.getState().patch
  return {
    id,
    start: (name, step = '') => patch(id, { current: name, step, inner: 0 }),
    step: (step, inner) => patch(id, (j) => ({ step, inner: inner ?? j.inner })),
    finish: (ok = true, message = '') => patch(id, (j) => ({
      done: Math.min(j.total, j.done + 1),
      inner: 0,
      failed: ok ? j.failed : [...j.failed, { name: j.current, message }],
    })),
    cancelled: () => !!useImportProgress.getState().jobs.find((j) => j.id === id)?.cancelRequested,
    drop: () => useImportProgress.getState().dismiss(id),
    end: (summary) => patch(id, (j) => ({
      status: j.cancelRequested && j.done < j.total ? 'cancelled' : 'done',
      inner: 0,
      step: '',
      ...(summary ? { summary } : {}),
    })),
  }
}

/**
 * The common shape of a per-file import: one unit per file, Cancel between files. `fn` does the file (and may
 * name its steps with `run.step`); it returns false, or throws, when the file failed. The job ends here.
 */
export async function forEachImport<T>(
  title: string,
  items: readonly T[],
  nameOf: (item: T) => string,
  fn: (item: T, run: ImportRun) => Promise<boolean | void>,
): Promise<void> {
  if (!items.length) return
  const run = beginImport(title, items.length)
  try {
    for (const item of items) {
      if (run.cancelled()) break
      run.start(nameOf(item))
      try {
        const ok = await fn(item, run)
        run.finish(ok !== false, ok === false ? 'not imported' : '')
      } catch (e) {
        run.finish(false, String((e as Error)?.message ?? e))
      }
    }
  } finally {
    run.end()
  }
}
