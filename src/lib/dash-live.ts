// Live state of the relationship dashboard's automatic update: the chat view and the
// dashboard hook read it, `triggerDashUpdate` writes it. The plugin does the work
// (POST /dashboard/update with `auto: true`); an app without the plugin answers 404
// and stays silent. Errors are not toasts: the line under the newest message shows them.

import { create } from 'zustand'
import { ApiError, j } from './engine'

export interface DashLast {
  at: number
  ok: boolean
  ms?: number
  error?: string
  skipped?: string
  unchanged?: boolean
}

interface DashLiveState {
  running: Record<string, true>
  last: Record<string, DashLast>
}

export const useDashLive = create<DashLiveState>(() => ({ running: {}, last: {} }))

interface UpdateReply { ok?: boolean; error?: string; skipped?: string; unchanged?: boolean; ms?: number }

/** Let the reply settle first (a group turn's next member starts right after it). */
const WAIT_MS = 1500

/** The dashboard hook of an open chat: read the state again (see `onDashReload`). */
const reloaders = new Map<string, () => Promise<void>>()

/** The hook registers how to re-read the state: an update ends only after that, so the line under the message never shows the old state. */
export function onDashReload(chatId: string, fn: () => Promise<void>): () => void {
  reloaders.set(chatId, fn)
  return () => { if (reloaders.get(chatId) === fn) reloaders.delete(chatId) }
}

/** 'wait' = in the delay (more calls fold into it), 'run' = request in flight. */
const phase = new Map<string, 'wait' | 'run'>()
/** a call arrived while a request ran: one more update when it ends */
const queued = new Set<string>()

function setRunning(chatId: string, on: boolean) {
  useDashLive.setState((s) => {
    if (on === !!s.running[chatId]) return s
    const running = { ...s.running }
    if (on) running[chatId] = true
    else delete running[chatId]
    return { running }
  })
}

function setLast(chatId: string, last: DashLast) {
  useDashLive.setState((s) => ({ last: { ...s.last, [chatId]: last } }))
}

/** One request. Returns true when the app has no dashboard plugin (stop, record nothing). */
async function runOnce(chatId: string, op: string): Promise<boolean> {
  try {
    const r = await j<UpdateReply>('/dashboard/update', { method: 'POST', body: JSON.stringify({ chatId, op, auto: true }) })
    const at = Date.now()
    if (r?.ok === false) setLast(chatId, { at, ok: false, error: r.error || 'unknown error' })
    else if (r?.skipped) setLast(chatId, { at, ok: true, skipped: r.skipped })
    else if (r?.unchanged) setLast(chatId, { at, ok: true, unchanged: true })
    else setLast(chatId, { at, ok: true, ...(typeof r?.ms === 'number' ? { ms: r.ms } : {}) })
    return false
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return true
    setLast(chatId, { at: Date.now(), ok: false, error: String((e as Error)?.message ?? e) })
    return false
  }
}

/**
 * Ask the plugin to read the newest message into the dashboard, after a reply, an edit of
 * the last message or a switch to another swipe. `busy` says a reply is being written for
 * this chat (the next group member): then this call ends, and that reply's end triggers again.
 */
export async function triggerDashUpdate(chatId: string, op: string, busy: () => boolean): Promise<void> {
  const p = phase.get(chatId)
  if (p === 'wait') return
  if (p === 'run') { queued.add(chatId); return }
  phase.set(chatId, 'wait')
  setRunning(chatId, true)
  try {
    await new Promise((r) => setTimeout(r, WAIT_MS))
    do {
      if (busy()) return
      phase.set(chatId, 'run')
      if (await runOnce(chatId, op)) return
    } while (queued.delete(chatId))
    await reloaders.get(chatId)?.().catch(() => {})
  } finally {
    phase.delete(chatId)
    queued.delete(chatId)
    setRunning(chatId, false)
  }
}
