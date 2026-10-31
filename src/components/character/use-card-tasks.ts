import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { j } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { estimateTokens } from '@/lib/tokens'
import { mergeTasks, requestLimits, resolveCardModel, sameTasks, taskLimits, type CardTasks, type TaskKind } from '@/lib/card-tasks'
import type { SideDraft } from '@/components/character/use-card-draft'

/** Whose tasks: a card (by id; kept in its own settings file, written by the editor's Save changes) or a persona
 *  (kept on the persona itself and written at once, since the persona page has no Save button). */
export type TasksOwner = string | { personaId: string; saved: CardTasks | undefined; write: (own: CardTasks | undefined) => void }

/**
 * The model a card's own tasks run on (GitHub #104), as the editor holds it: the saved choice, the one
 * being edited, and what that means for the limits. For a character the edit is a side change of the card's
 * draft: it is written by the same Save changes (to the card's own settings file, not to the card).
 */
export function useCardTasks(owner: TasksOwner) {
  const t = useT()
  const models = useApp((s) => s.models)
  const appModel = useApp((s) => s.settings.cardTasks?.model ?? '')
  const fallback = useApp((s) => s.model)
  const persona = typeof owner === 'string' ? null : owner
  const characterId = typeof owner === 'string' ? owner : null
  const ownerId = persona?.personaId ?? characterId ?? ''
  const [saved, setSaved] = useState<CardTasks>({})
  const [edit, setEditState] = useState<CardTasks>({})
  const [sensor, setSensor] = useState('')
  const [loaded, setLoaded] = useState(false)
  // the persona's latest values, for the writer below (the hook is called with fresh ones each render)
  const personaRef = useRef(persona)
  personaRef.current = persona
  const editRef = useRef(edit)
  editRef.current = edit

  useEffect(() => {
    let alive = true
    setLoaded(false)
    if (personaRef.current) {
      const own = personaRef.current.saved ?? {}
      setSaved(own); setEditState(own); setLoaded(true)
    } else {
      j<{ own?: CardTasks }>(`/profile/card-tasks?characterId=${encodeURIComponent(ownerId)}`)
        .then((r) => { if (alive) { setSaved(r.own ?? {}); setEditState(r.own ?? {}); setLoaded(true) } })
        .catch(() => { /* a group, or no plugin: the card has no settings of its own */ })
    }
    j<{ sensorModel?: unknown }>('/dashboard/config')
      .then((r) => { if (alive) setSensor(typeof r.sensorModel === 'string' ? r.sensorModel : '') })
      .catch(() => {})
    return () => { alive = false }
  }, [ownerId])

  const resolved = useMemo(() => resolveCardModel(edit.model, appModel, sensor, fallback), [edit.model, appModel, sensor, fallback])
  const info = useMemo(() => models.find((m) => m.ref === resolved.model) ?? null, [models, resolved.model])
  const dirty = loaded && !persona && !sameTasks(saved, edit)

  const setEdit = useCallback((patch: Partial<CardTasks>) => {
    const p = personaRef.current
    if (p) {
      const next = mergeTasks(editRef.current, patch)
      setEditState(next)
      setSaved(next)
      p.write(Object.keys(next).length ? next : undefined)
      return
    }
    setEditState((cur) => mergeTasks(cur, patch))
  }, [])

  const save = useCallback(async (): Promise<boolean> => {
    if (personaRef.current) return true
    try {
      const r = await j<{ own?: CardTasks }>('/profile/card-tasks', { method: 'PUT', body: JSON.stringify({ characterId: ownerId, ...edit }) })
      const own = r.own ?? {}
      setSaved(own)
      setEditState(own)
      return true
    } catch {
      return false
    }
  }, [ownerId, edit])

  const discard = useCallback(() => setEditState(saved), [saved])

  const side: SideDraft = useMemo(() => ({ dirty, label: t('ct.sideLabel'), panel: 'profile', save, discard }), [dirty, t, save, discard])

  const limits = useCallback((kind: TaskKind) => taskLimits(info, edit, kind), [info, edit])

  /** What goes with a request: the editor's unsaved model pick, and the limits for the text it will send. */
  const requestFor = useCallback((kind: TaskKind, text: string) => ({
    ...(edit.model ? { taskModel: edit.model } : {}),
    limits: requestLimits(limits(kind), text, estimateTokens(text)),
  }), [edit.model, limits])

  return { edit, setEdit, saved, loaded, resolved, info, limits, requestFor, side, appModel }
}
export type CardTasksState = ReturnType<typeof useCardTasks>
