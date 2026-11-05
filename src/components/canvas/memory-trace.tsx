import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowClockwise, Copy, EyeSlash, Heartbeat } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Fold } from '@/components/ui/fold'
import { useRelativeTime, useT } from '@/hooks/use-t'
import { cn, copyText } from '@/lib/utils'
import { buildReport, type MemoryTrace } from '@/lib/memory-trace'
import { loadMemoryTrace } from '@/lib/memory-trace-load'
import { MeaningCard } from '@/components/memory/meaning-card'
import { Chip, DatabankFold, LitopysFolds, Summary, type T } from '@/components/memory/trace-parts'
import type { MsgKey } from '@/lib/i18n'

/** The memory trace of a chat's last reply (#184 P6): what went into the prompt from memory, what stayed out and why. */
export function MemoryTraceView({ chatId, title }: { chatId: string; title: string }) {
  const t = useT()
  const ago = useRelativeTime()
  const [trace, setTrace] = useState<MemoryTrace | null>(null)
  const [loading, setLoading] = useState(false)
  // 0 = the newest reply; the few before it can be looked at too
  const [back, setBack] = useState(0)
  // the Refresh button reads the meaning card's numbers again too
  const [refreshes, setRefreshes] = useState(0)
  // a late answer for a chat that is no longer on screen must not fill the view of the new one (as the board does, #39)
  const live = useRef(chatId)
  live.current = chatId
  // `t` is a new function on every render: the loader reads it through a ref so it stays stable (a dependency on it re-ran the effect for ever)
  const tRef = useRef(t)
  tRef.current = t

  const load = useRef(async (id: string, b: number) => {
    setLoading(true)
    try {
      const next = await loadMemoryTrace(id, b)
      if (live.current === id) setTrace(next)
    } catch {
      if (live.current === id) toast.error(tRef.current('memtrace.loadFailed'))
    } finally {
      if (live.current === id) setLoading(false)
    }
  }).current

  useEffect(() => {
    setTrace(null)
    setBack(0)
    void load(chatId, 0)
  }, [chatId, load])
  const pick = (b: number) => {
    setBack(b)
    void load(chatId, b)
  }

  // copyText has the fallback for the app's sandboxed frame, where navigator.clipboard is refused
  const copy = async () => {
    if (!trace) return
    const ok = await copyText(buildReport(title, trace))
    if (ok) toast.success(t('memtrace.copied'))
    else toast.error(t('memtrace.copyFailed'))
  }

  const lit = trace?.litopys ?? null
  const hasAnything = !!trace && (lit || trace.databank || trace.worker || trace.leaks.length > 0 || trace.keptOut)

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="memory-trace">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground max-sm:basis-full">{lit ? t(back > 0 ? 'memtrace.whenEarlier' : 'memtrace.when', { when: ago(lit.at) }) : t('memtrace.intro')}</p>
        <Button variant="outline" size="sm" onClick={() => { setRefreshes((n) => n + 1); pick(0) }} disabled={loading} className="min-h-10 sm:min-h-8">
          <ArrowClockwise className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
          {t('memtrace.refresh')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!trace || !hasAnything} className="min-h-10 sm:min-h-8">
          <Copy className="h-4 w-4" aria-hidden="true" />
          {t('memtrace.copy')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <MeaningCard chatId={chatId} refreshKey={refreshes} />
          {trace === null ? (
            <TraceSkeleton />
          ) : trace.unavailable ? (
            <Note>{t('memtrace.unavailable')}</Note>
          ) : !hasAnything ? (
            <Note title={t('memtrace.emptyTitle')}>{t('memtrace.emptyBody')}</Note>
          ) : (
            <>
              {trace.replies.length > 1 && <ReplyPicker trace={trace} back={back} onPick={pick} disabled={loading} t={t} />}
              {lit && <Summary lit={lit} older={back > 0} t={t} />}
              {lit ? <LitopysFolds lit={lit} t={t} /> : <Note>{t('memtrace.noLitopys')}</Note>}
              <DatabankFold trace={trace} t={t} />
              <WorkerFold trace={trace} t={t} />
              <AfterFold trace={trace} older={back > 0} t={t} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Note({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center">
      {title && <p className="mb-1 text-body font-semibold">{title}</p>}
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

function TraceSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted-foreground/15" />
      ))}
    </div>
  )
}

/** The few replies Litopys remembers a trace of: the newest first, each named by how long ago it was. */
function ReplyPicker({ trace, back, onPick, disabled, t }: { trace: MemoryTrace; back: number; onPick: (b: number) => void; disabled: boolean; t: T }) {
  const ago = useRelativeTime()
  return (
    <div role="group" aria-label={t('memtrace.replies')} className="flex flex-wrap items-center gap-1.5" data-testid="memory-trace-replies">
      {trace.replies.map((r, i) => (
        <Button
          key={r.at}
          variant={i === back ? 'default' : 'outline'}
          size="sm"
          aria-pressed={i === back}
          disabled={disabled && i !== back}
          onClick={() => i !== back && onPick(i)}
          title={ago(r.at)}
          className="min-h-10 sm:min-h-8"
        >
          {i === 0 ? t('memtrace.latest') : t('memtrace.earlier', { n: i })}
        </Button>
      ))}
    </div>
  )
}

/** The facts the worker left out of its last scene and why (#184 P6): it keeps no record of them anywhere else. */
function WorkerFold({ trace, t }: { trace: MemoryTrace; t: T }) {
  const w = trace.worker
  if (!w) return null
  return (
    <Fold id="memtrace.worker" title={t('memtrace.foldWorker')} icon={EyeSlash} tone="amber" summary={String(w.skips.length)}>
      <p className="px-3 pt-2 text-caption text-muted-foreground">{t('memtrace.workerNote', { kept: w.added, got: w.got, ch: w.chapter || '–' })}</p>
      <ul className="divide-y divide-border">
        {w.skips.map((s, i) => (
          <li key={`${i}:${s.why}`} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 break-words text-body">{s.text || '–'}</p>
              {s.id && <p className="mt-0.5 text-caption text-muted-foreground">{s.id}</p>}
            </div>
            <Chip tone="amber">{t(`memtrace.skip.${s.why}` as MsgKey)}</Chip>
          </li>
        ))}
      </ul>
    </Fold>
  )
}

function AfterFold({ trace, older, t }: { trace: MemoryTrace; older: boolean; t: T }) {
  if (older) {
    return (
      <Fold id="memtrace.after" title={t('memtrace.foldAfter')} icon={Heartbeat} tone="sky" summary="–">
        <p className="px-3 py-3 text-sm text-muted-foreground">{t('memtrace.afterNewest')}</p>
      </Fold>
    )
  }
  const n = trace.leaks.length + (trace.keptOut ? 1 : 0)
  return (
    <Fold id="memtrace.after" title={t('memtrace.foldAfter')} icon={Heartbeat} tone="sky" summary={n ? t('memtrace.flagged', { n }) : t('memtrace.clean')} defaultOpen={n > 0}>
      {n === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">{t('memtrace.nothing')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {trace.keptOut && (trace.keptOut.user > 0 || trace.keptOut.absent > 0) && (
            <li className="px-3 py-2 text-body">{t('memtrace.keptOut', { user: trace.keptOut.user, absent: trace.keptOut.absent })}</li>
          )}
          {(trace.keptOut?.rows ?? []).map((r, i) => (
            <li key={`k:${i}:${r.why}`} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start sm:gap-3">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 break-words text-body">{r.text || '–'}</p>
                {r.who && <p className="mt-0.5 break-words text-caption text-muted-foreground">{r.who}</p>}
              </div>
              <Chip tone="amber">{t(`memtrace.kept.${r.why}` as MsgKey)}</Chip>
            </li>
          ))}
          {trace.leaks.map((l) => (
            <li key={`${l.key}:${l.factId}:${l.who}`} className="px-3 py-2">
              <p className="break-words text-body">{t('memtrace.leak', { who: l.who })}</p>
              <p className="mt-0.5 break-words text-caption text-muted-foreground">{l.text}</p>
            </li>
          ))}
        </ul>
      )}
    </Fold>
  )
}

