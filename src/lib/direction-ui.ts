// What the Direction bar and the member chips show, worked out from the state route's answer (plugins/direction).
// Pure functions, so the bar's states are tested without a browser.

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadDirection, useDirectionLive, type DirectionLogEntry, type DirectionScene, type DirectionState, type DirectionTag } from './direction'

/** How a member stands in the scene: `unknown` = nothing says (no report, no Dashboard), so no marks at all. */
export type Presence = 'unknown' | 'here' | 'away' | 'locked'

export function presenceOf(scene: DirectionScene | null | undefined, id: string): Presence {
  if (!scene || scene.source === 'none') return 'unknown'
  if (scene.present.includes(id)) return 'here'
  return scene.source === 'lock' ? 'locked' : 'away'
}

/** The bar's mode: no model, off for this chat, or working (with a report, with none yet, or with the last run failed). */
export type BarMode = 'no-model' | 'off' | 'error' | 'empty' | 'report'

/** The newest log entry that says how the director's last run went. */
export function lastRun(log: DirectionLogEntry[]): DirectionLogEntry | null {
  return log.find((e) => e.kind === 'report' || e.kind === 'error') ?? null
}

export function barMode(state: DirectionState): BarMode {
  if (!state.config.model) return 'no-model'
  if (!state.chat.on) return 'off'
  const run = lastRun(state.log)
  if (run?.kind === 'error' && (!state.report || run.at >= state.report.at)) return 'error'
  return state.report ? 'report' : 'empty'
}

export function nameOf(state: DirectionState, id: string): string {
  return state.members.find((m) => m.id === id)?.name ?? id
}

/** "Yuzu" for one, "Yuzu, Hana" for two, "Yuzu, Hana +2" beyond. */
export function namesOf(state: DirectionState, ids: string[], max = 2): string {
  const names = ids.map((id) => nameOf(state, id))
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} +${names.length - max}`
}

export function tagKey(tag: DirectionTag | null): `dir.tag.${DirectionTag}` | 'dir.tag.none' {
  return tag ? `dir.tag.${tag}` : 'dir.tag.none'
}

/** The error of a failed run in words: the plugin's reason code, else its message. */
export function errorKey(reason?: string): 'dir.err.bad-reply' | 'dir.err.error' | 'dir.err.no-model' {
  return reason === 'bad-reply' ? 'dir.err.bad-reply' : reason === 'no-model' ? 'dir.err.no-model' : 'dir.err.error'
}

/**
 * The state of one chat, read again when a report, the switch or the lock changed (`useDirectionLive.stamp`) and when the
 * chat's messages changed (`messageSig`, for example the last message's id and swipe). `null` while it loads or when the
 * app has no Direction plugin.
 */
export function useDirectionState(chatId: string, messageSig: string): { state: DirectionState | null; reload: () => void } {
  const stamp = useDirectionLive((s) => s.stamp)
  const [state, setState] = useState<DirectionState | null>(null)
  const seq = useRef(0)
  const reload = useCallback(() => {
    const mine = ++seq.current
    loadDirection(chatId).then((s) => { if (mine === seq.current) setState(s) }).catch(() => {})
  }, [chatId])
  useEffect(() => { setState(null) }, [chatId])
  useEffect(() => { reload() }, [reload, stamp, messageSig])
  return { state, reload }
}
