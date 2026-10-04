// One muted line under the newest message: the dashboard is updating, how long ago it was,
// what a character learned this turn, or why it failed. Nothing while the app has no
// dashboard, while the first load runs, or in manual mode without an error.

import { useEffect, useRef, type ReactNode } from 'react'
import { useT } from '@/hooks/use-t'
import { useDashLive } from '@/lib/dash-live'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ageLabel } from './dash-common'
import { useDashMaybe } from './dash-mount'

const LINE = 'flex min-w-0 flex-wrap items-center gap-x-1.5 px-1 text-[11px] leading-snug text-muted-foreground'
const LINK = 'rounded-none underline underline-offset-2 hover:text-foreground disabled:opacity-50'

/** The line grows after the reply landed: a log pinned to its bottom follows it, so the line is never half under the composer. */
function Follow({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    const log = el?.closest<HTMLElement>('[data-chat-log]')
    if (!el || !log || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (log.dataset.pinned === 'true' && useApp.getState().settings.autoScroll) log.scrollTop = log.scrollHeight
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <div ref={ref} className={className} aria-live="polite">{children}</div>
}

export function DashLiveLine({ chatId }: { chatId: string }) {
  const t = useT()
  const dash = useDashMaybe()
  const running = useDashLive((s) => !!s.running[chatId])
  const last = useDashLive((s) => s.last[chatId])
  const writing = useApp((s) => s.streaming?.chatId === chatId)
  if (!dash || dash.status === 'absent' || dash.status === 'loading' || writing) return null

  const { view, refresh, refreshing, now } = dash

  if (running && view?.mode !== 'manual') {
    return (
      <Follow className={LINE}>
        <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-cta" aria-hidden="true" />
        <span>{t('dash.live.updating')}</span>
      </Follow>
    )
  }

  // an error counts until a newer snapshot lands
  const since = view?.at ?? 0
  const error = last && !last.ok && last.at > since
    ? (last.error ?? '')
    : view?.lastError && view.lastError.at > since ? view.lastError.message : null
  if (error !== null) {
    return (
      <Follow className={cn(LINE, 'text-amber-600 dark:text-amber-400')}>
        <span className="min-w-0 break-words">{t('dash.live.error', { message: error.length > 80 ? `${error.slice(0, 80)}…` : error })}</span>
        <button type="button" onClick={() => { void refresh() }} disabled={refreshing} className={LINK}>{t('dash.live.retry')}</button>
      </Follow>
    )
  }

  if (!view || view.mode === 'manual') return null

  if (view.stale) {
    return (
      <Follow className={LINE}>
        <span>{t('dash.live.stale')}</span>
        <button type="button" onClick={() => { void refresh() }} disabled={refreshing} className={LINK}>{t('dash.live.update')}</button>
      </Follow>
    )
  }

  const age = ageLabel(t, view.at, now)
  const ms = last?.ms ?? view.usage.lastMs
  const notes = view.order
    .flatMap((name) => (view.chars[name]?.notebook ?? []).filter((n) => n.turn === view.turn).map((n) => ({ name, n })))
    .slice(0, 2)

  return (
    <Follow className="flex min-w-0 flex-col gap-0.5 px-1 text-[11px] leading-snug text-muted-foreground">
      <span>{ms > 0 ? t('dash.live.updatedIn', { age, s: (ms / 1000).toFixed(1) }) : t('dash.live.updated', { age })}</span>
      {notes.map(({ name, n }) => {
        const text = n.text.length > 60 ? `${n.text.slice(0, 60)}…` : n.text
        const key = n.how === 'heard' ? 'dash.live.heard' : n.how === 'saw' ? 'dash.live.saw' : 'dash.live.remembered'
        return <span key={`${name}:${n.id}`} className="min-w-0 break-words">{t(key, { name, text })}</span>
      })}
    </Follow>
  )
}
