// The records of a chat's world or a saved world, shared by the World book and Places tabs. A world the DM wrote
// from the played story opens at once; a built one asks the spoiler question once per session (lib/world-reveal.ts).

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/confirm'
import { useT } from '@/hooks/use-t'
import { isRevealed, markRevealed, needsGate, revealKey } from '@/lib/world-reveal'
import { loadWorld, peekWorld, useWorldLive, type WorldRecord, type WorldRef } from '@/lib/world'

export interface WorldBook {
  records: WorldRecord[] | null
  setRecords: (r: WorldRecord[]) => void
  /** the question is needed and has not been answered: show the gate */
  locked: boolean
  /** still finding out whether the question is needed, or reading */
  loading: boolean
  /** ask the question (when needed) and read the records */
  reveal: () => Promise<void>
  confirmDialog: ReactNode
}

/**
 * `gated` is given for a saved world (its `from` is known to the caller); a chat's world reads it from its
 * view (`origin`). `initial` = records another tab already read.
 */
export function useWorldBook(ref: WorldRef, o: { gated?: boolean; initial?: WorldRecord[] } = {}): WorldBook {
  const t = useT()
  const [confirm, confirmDialog] = useConfirm()
  const key = revealKey(ref)
  const chatId = 'chatId' in ref ? ref.chatId : null
  const view = useWorldLive((s) => (chatId ? s.views[chatId] : undefined))
  useEffect(() => {
    if (chatId && o.gated === undefined && !view) void loadWorld(chatId).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, !!view])
  const gated = o.gated ?? needsGate(ref, view ? { origin: view.origin } : null)
  const [records, setRecords] = useState<WorldRecord[] | null>(o.initial ?? null)
  const [revealed, setRevealed] = useState(() => isRevealed(ref))
  const open = !!o.initial || revealed || gated === false
  const lastRunAt = chatId ? view?.lastRunAt : undefined

  // read when open; read again after each of the DM's runs (it edits the book too)
  useEffect(() => {
    if (!open) return
    let live = true
    peekWorld(ref).then((r) => { if (live) setRecords(r) }).catch((e: unknown) => { if (live && records === null) toast.error(e instanceof Error ? e.message : String(e)) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, lastRunAt])

  const reveal = useCallback(async () => {
    if (!(await confirm({ title: t('world.peekTitle'), description: t('world.peekWarn'), actionLabel: t('world.peekGo'), destructive: false }))) return
    markRevealed(ref)
    setRevealed(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, confirm, t])

  return { records, setRecords, locked: gated === true && !open, loading: gated === undefined || (open && records === null), reveal, confirmDialog }
}
