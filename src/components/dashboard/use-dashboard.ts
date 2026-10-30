// The relationship dashboard's data for one chat: GET /dashboard/state, a poll while the
// tab is visible, a refetch the moment an automatic update ends, and the manual "update now". The plugin
// settles the view; this hook only fetches and keeps the focus. A chat whose route fails
// (no plugin, 404, offline) is `absent`: callers render nothing of the dashboard.

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useT } from '@/hooks/use-t'
import { j } from '@/lib/engine'
import { onDashReload } from '@/lib/dash-live'
import type { DashResponse, DashView } from '@/lib/dashboard'
import { loadWorldHere, useWorldLive, type WorldHere } from '@/lib/world'
import { plainDashError } from './dash-common'

export type DashStatus = 'absent' | 'loading' | 'empty' | 'ready'

const POLL_MS = 15_000
const TICK_MS = 10_000

export interface UseDashboard {
  status: DashStatus
  data: DashResponse | null
  view: DashView | null
  focus: string
  setFocus: (name: string) => void
  refresh: () => Promise<void>
  /** read the state again, without running the sensor */
  reload: () => Promise<void>
  /** change the user's notes or threads (POST /dashboard/notes) and redraw from the answer */
  act: (body: { op: string } & Record<string, unknown>) => Promise<boolean>
  /** the World DM's view of where the scene is and what people wear and carry; null without the World plugin */
  here: WorldHere | null
  /** the story's date: set it ("YYYY-MM-DD"), back to automatic (null) or hide/show it (POST /dashboard/calendar) */
  setCalendar: (body: { date?: string | null; off?: boolean }) => Promise<boolean>
  refreshing: boolean
  now: number
}

export function useDashboard(chatId: string): UseDashboard {
  const t = useT()
  const [data, setData] = useState<{ chatId: string; res: DashResponse } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [picked, setPicked] = useState('')
  const [hereState, setHereState] = useState<{ chatId: string; here: WorldHere | null } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const chatRef = useRef(chatId)
  chatRef.current = chatId
  const tRef = useRef(t)
  tRef.current = t

  const load = useCallback(async () => {
    const id = chatId
    if (!id) return
    try {
      const res = await j<DashResponse>(`/dashboard/state?chatId=${encodeURIComponent(id)}&view=1`)
      if (chatRef.current !== id) return
      setData({ chatId: id, res })
      setFailed(null)
    } catch {
      if (chatRef.current !== id) return
      setFailed(id)
    }
  }, [chatId])

  // the World DM's place and carry: a failure leaves what was shown (an app without the plugin answers null)
  const loadHere = useCallback(async () => {
    const id = chatId
    if (!id) return
    try {
      const here = await loadWorldHere(id)
      if (chatRef.current === id) setHereState({ chatId: id, here })
    } catch {
      // keep the last good read
    }
  }, [chatId])
  const lastRunAt = useWorldLive((s) => s.views[chatId]?.lastRunAt ?? null)

  // load on mount and when the chat changes; a reply for an older chat id is dropped in `load`
  useEffect(() => {
    setPicked('')
    void load()
    void loadHere()
  }, [load, loadHere])
  // a DM run changed the records: read them again
  useEffect(() => {
    if (lastRunAt) void loadHere()
  }, [lastRunAt, loadHere])

  // poll while the tab is visible
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') { void load(); void loadHere() } }, POLL_MS)
    return () => clearInterval(id)
  }, [load, loadHere])

  // an automatic update (after a reply, an edit, a swipe) reads what it wrote before it ends
  useEffect(() => onDashReload(chatId, () => { void loadHere(); return load() }), [chatId, load, loadHere])

  // the age text
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const refresh = useCallback(async () => {
    const id = chatRef.current
    if (!id) return
    setRefreshing(true)
    try {
      const r = await j<{ ok?: boolean; error?: string }>('/dashboard/update', { method: 'POST', body: JSON.stringify({ chatId: id, op: 'send' }) })
      if (r && r.ok === false) toast.error(plainDashError(tRef.current, r.error || ''), { description: r.error || undefined })
    } catch (e) {
      toast.error(plainDashError(tRef.current, String((e as Error)?.message ?? e)), { description: String((e as Error)?.message ?? e) })
    }
    try { await load() } finally { setRefreshing(false) }
  }, [load])

  const act = useCallback(async (body: { op: string } & Record<string, unknown>): Promise<boolean> => {
    const id = chatRef.current
    if (!id) return false
    try {
      const r = await j<{ ok?: boolean; error?: string; view?: DashView }>('/dashboard/notes', { method: 'POST', body: JSON.stringify({ chatId: id, ...body }) })
      if (r?.ok === false) { toast.error(tRef.current('dash.notes.error', { message: r.error || 'unknown error' })); return false }
      const view = r?.view
      if (view && chatRef.current === id) setData((d) => (d && d.chatId === id ? { chatId: id, res: { ...d.res, view } } : d))
      else await load()
      return true
    } catch (e) {
      toast.error(tRef.current('dash.notes.error', { message: String((e as Error)?.message ?? e) }))
      return false
    }
  }, [load])

  const setCalendar = useCallback(async (body: { date?: string | null; off?: boolean }): Promise<boolean> => {
    const id = chatRef.current
    if (!id) return false
    try {
      const r = await j<{ ok?: boolean; error?: string }>('/dashboard/calendar', { method: 'POST', body: JSON.stringify({ chatId: id, ...body }) })
      if (r?.ok === false) { toast.error(tRef.current('dash.date.error', { message: r.error || 'unknown error' })); return false }
      await load()
      return true
    } catch (e) {
      toast.error(tRef.current('dash.date.error', { message: String((e as Error)?.message ?? e) }))
      return false
    }
  }, [load])

  const mine = data && data.chatId === chatId ? data.res : null
  const view = mine?.view ?? null
  const status: DashStatus = failed === chatId && !mine ? 'absent' : !mine ? 'loading' : !mine.exists || !view ? 'empty' : 'ready'

  const first = view ? view.order.find((n) => view.chars[n] && !view.chars[n].compact) ?? view.order[0] ?? '' : ''
  const focus = view && picked && view.chars[picked] ? picked : first

  const reload = useCallback(async () => { await Promise.all([load(), loadHere()]) }, [load, loadHere])
  const here = hereState && hereState.chatId === chatId ? hereState.here : null

  return { status, data: mine, view, focus, setFocus: setPicked, refresh, reload, here, act, setCalendar, refreshing, now }
}
