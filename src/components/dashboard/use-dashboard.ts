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
  refreshing: boolean
  now: number
}

export function useDashboard(chatId: string): UseDashboard {
  const t = useT()
  const [data, setData] = useState<{ chatId: string; res: DashResponse } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [picked, setPicked] = useState('')
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

  // load on mount and when the chat changes; a reply for an older chat id is dropped in `load`
  useEffect(() => {
    setPicked('')
    void load()
  }, [load])

  // poll while the tab is visible
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') void load() }, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  // an automatic update (after a reply, an edit, a swipe) reads what it wrote before it ends
  useEffect(() => onDashReload(chatId, load), [chatId, load])

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
      if (r && r.ok === false) toast.error(tRef.current('dash.error', { message: r.error || 'unknown error' }))
    } catch (e) {
      toast.error(tRef.current('dash.error', { message: String((e as Error)?.message ?? e) }))
    }
    try { await load() } finally { setRefreshing(false) }
  }, [load])

  const mine = data && data.chatId === chatId ? data.res : null
  const view = mine?.view ?? null
  const status: DashStatus = failed === chatId && !mine ? 'absent' : !mine ? 'loading' : !mine.exists || !view ? 'empty' : 'ready'

  const first = view ? view.order.find((n) => view.chars[n] && !view.chars[n].compact) ?? view.order[0] ?? '' : ''
  const focus = view && picked && view.chars[picked] ? picked : first

  return { status, data: mine, view, focus, setFocus: setPicked, refresh, reload: load, refreshing, now }
}
