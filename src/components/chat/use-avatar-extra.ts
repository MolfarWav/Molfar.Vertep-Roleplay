// Sets --ls-av-extra on the chat log: how many px the stage look's side portrait may grow to the left (see
// lib/avatar-extra.ts and the .look-stage block in globals.css). It follows the log's width, so it shrinks back when
// the window is narrow or the dashboard strip takes room. Written straight to the element: no re-render per resize.

import { useEffect, type RefObject } from 'react'
import { avatarExtra } from '@/lib/avatar-extra'

export function useAvatarExtra(logRef: RefObject<HTMLElement | null>, enabled: boolean, key: string) {
  useEffect(() => {
    const log = logRef.current
    const col = log?.querySelector<HTMLElement>('.chat-column') ?? null
    if (!log || !col || !enabled || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const pad = Number.parseFloat(getComputedStyle(col).paddingLeft) || 0
      log.style.setProperty('--ls-av-extra', `${avatarExtra(log.clientWidth, col.offsetWidth, pad)}px`)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(log)
    ro.observe(col)
    return () => {
      ro.disconnect()
      log.style.removeProperty('--ls-av-extra')
    }
  }, [logRef, enabled, key])
}
