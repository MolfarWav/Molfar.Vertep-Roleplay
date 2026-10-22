import { useCallback, useEffect, useMemo, useState } from 'react'
import { j } from '@/lib/engine'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { estimateTokens } from '@/lib/tokens'
import { requestLimits, resolveCardModel, taskLimits, type CardTasks, type TaskKind } from '@/lib/card-tasks'
import type { SideDraft } from '@/components/character/use-card-draft'

const same = (a: CardTasks, b: CardTasks) => (a.model ?? '') === (b.model ?? '') && (a.maxInput ?? 0) === (b.maxInput ?? 0) && (a.maxOutput ?? 0) === (b.maxOutput ?? 0)

/**
 * The model a card's own tasks run on (GitHub #104), as the editor holds it: the card's saved choice, the one
 * being edited, and what that means for the limits. The edit is a side change of the card's draft: it is written
 * by the same Save changes (to the card's own settings file, not to the card).
 */
export function useCardTasks(characterId: string) {
  const t = useT()
  const models = useApp((s) => s.models)
  const appModel = useApp((s) => s.settings.cardTasks?.model ?? '')
  const fallback = useApp((s) => s.model)
  const [saved, setSaved] = useState<CardTasks>({})
  const [edit, setEditState] = useState<CardTasks>({})
  const [sensor, setSensor] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    setLoaded(false)
    j<{ own?: CardTasks }>(`/profile/card-tasks?characterId=${encodeURIComponent(characterId)}`)
      .then((r) => { if (alive) { setSaved(r.own ?? {}); setEditState(r.own ?? {}); setLoaded(true) } })
      .catch(() => { /* a group, or no plugin: the card has no settings of its own */ })
    j<{ sensorModel?: unknown }>('/dashboard/config')
      .then((r) => { if (alive) setSensor(typeof r.sensorModel === 'string' ? r.sensorModel : '') })
      .catch(() => {})
    return () => { alive = false }
  }, [characterId])

  const resolved = useMemo(() => resolveCardModel(edit.model, appModel, sensor, fallback), [edit.model, appModel, sensor, fallback])
  const info = useMemo(() => models.find((m) => m.ref === resolved.model) ?? null, [models, resolved.model])
  const dirty = loaded && !same(saved, edit)

  const setEdit = useCallback((patch: Partial<CardTasks>) => {
    setEditState((cur) => {
      const next: CardTasks = { ...cur, ...patch }
      for (const k of Object.keys(next) as (keyof CardTasks)[]) if (next[k] === undefined || next[k] === '' || next[k] === 0) delete next[k]
      return next
    })
  }, [])

  const save = useCallback(async (): Promise<boolean> => {
    try {
      const r = await j<{ own?: CardTasks }>('/profile/card-tasks', { method: 'PUT', body: JSON.stringify({ characterId, ...edit }) })
      const own = r.own ?? {}
      setSaved(own)
      setEditState(own)
      return true
    } catch {
      return false
    }
  }, [characterId, edit])

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
