import { Fragment, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { fetchEffectiveParams, presetRequestSide, type EffectiveParams } from '@/lib/model-params'
import type { Preset } from '@/lib/types'

type Applied = NonNullable<EffectiveParams['applied']>
type Field = 'temperature' | 'max_tokens' | 'reasoning' | 'thinkingBudget'

const ROWS: [Field, string][] = [['temperature', 'Temperature'], ['max_tokens', 'Max output'], ['reasoning', 'Reasoning']]

const CHIP = {
  model: { label: 'model', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', title: 'Set on this model in Settings › Connections and models' },
  preset: { label: 'preset', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400', title: '' },
  provider: { label: 'provider', cls: 'bg-muted text-muted-foreground', title: "Not sent: the provider's default applies" },
}

function valueOf(a: Applied, f: Field): string | null {
  const v = a[f]
  return v === undefined ? null : String(v)
}

/**
 * The temperature, max output and reasoning this chat's replies are sent, each with its source: the
 * model's Chat block (Settings) or the preset. The engine merges them the way generation does.
 */
export function EffectiveParams({ modelRef, preset }: { modelRef: string | null; preset: Preset | undefined }) {
  const side = presetRequestSide(preset)
  const key = modelRef ? `${modelRef}?${new URLSearchParams(side)}` : ''
  const [state, setState] = useState<{ key: string; applied: Applied | null } | null>(null)

  useEffect(() => {
    if (!key || !modelRef) return
    const ctrl = new AbortController()
    fetchEffectiveParams(modelRef, side, ctrl.signal)
      .then((r) => setState({ key, applied: r.applied ?? null }))
      .catch((e: unknown) => { if ((e as Error)?.name !== 'AbortError') setState({ key, applied: null }) })
    return () => ctrl.abort()
    // the key carries everything the query is built from
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!modelRef) return null
  const loaded = state?.key === key ? state : null
  // an error or an engine older than 0.9.5 (no `applied`): show nothing rather than guesses
  if (loaded && !loaded.applied) return null
  const applied = loaded?.applied ?? null

  return (
    <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 border-b border-border px-3 py-2 text-[11px]" aria-label="Parameters sent with replies">
      {ROWS.concat(applied?.thinkingBudget !== undefined ? [['thinkingBudget', 'Thinking budget']] : []).map(([f, label]) => {
        const value = applied ? valueOf(applied, f) : null
        const src = applied?.from[f]
        const chip = !applied ? null : value === null ? CHIP.provider : src === 'request' ? CHIP.preset : CHIP.model
        return (
          <Fragment key={f}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn('truncate font-mono tabular-nums', value === null && 'text-muted-foreground')}>{applied ? (value ?? 'default') : '…'}</dd>
            <dd>
              {chip && (
                <span className={cn('rounded px-1.5 text-[10px]', chip.cls)} title={chip === CHIP.preset ? `From the preset ${preset?.name ?? ''}` : chip.title}>
                  {chip.label}
                </span>
              )}
            </dd>
          </Fragment>
        )
      })}
      {preset?.samplersOverrideModel && (
        <dd className="col-span-3 text-[10px] text-muted-foreground">This preset's samplers win over the model's.</dd>
      )}
    </dl>
  )
}
