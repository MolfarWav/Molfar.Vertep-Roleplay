import { useEffect, useRef, useState } from 'react'
import { Check } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'
import type { ID, Preset, PresetCosts, PromptVariable } from '@/lib/types'

/** A chat's (or the step's) picks for one preset: variable name -> choice ids / option strings / text.
 *  A name that is absent means "the preset's default". */
export type PresetValues = Record<string, string | string[]>

/**
 * A preset's token costs: what each option adds is fetched once per preset (the slow part in the
 * engine's sandbox), the total again a moment after every change (`changeKey`). `body` says whose
 * picks count: a chat's (`chatId`) or unsaved ones (`vars`).
 */
export function usePresetCosts(presetKey: string, presetId: ID | undefined, body: { chatId?: ID; vars?: PresetValues }, changeKey: string, enabled: boolean): PresetCosts | null {
  const fetchPresetCosts = useApp((s) => s.fetchPresetCosts)
  const [options, setOptions] = useState<PresetCosts['vars'] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const bodyRef = useRef(body)
  bodyRef.current = body
  // biome-ignore lint/correctness/useExhaustiveDependencies: presetKey refetches when the preset's variables change
  useEffect(() => {
    setOptions(null)
    setTotal(null)
    if (!enabled || !presetId) return
    let live = true
    fetchPresetCosts(presetId, bodyRef.current).then((c) => { if (live) { setOptions(c.vars); setTotal(c.total) } }).catch(() => {})
    return () => { live = false }
  }, [enabled, presetKey, presetId, fetchPresetCosts])
  // biome-ignore lint/correctness/useExhaustiveDependencies: changeKey is the trigger; the body is read from a ref
  useEffect(() => {
    if (!enabled || !presetId) return
    let live = true
    const timer = setTimeout(() => {
      fetchPresetCosts(presetId, { ...bodyRef.current, only: 'total' }).then((c) => { if (live) setTotal(c.total) }).catch(() => {})
    }, 300)
    return () => { live = false; clearTimeout(timer) }
  }, [enabled, presetId, changeKey, fetchPresetCosts])
  return total == null ? null : { total, vars: options ?? {} }
}

/** Past this many options a single choice becomes a select instead of a list of rows. */
const LIST_MAX = 8

const isMulti = (v: PromptVariable) => v.type === 'multi' || (v.type === 'choice' && v.multi === true)

/** The options of a choice-like variable as {id,label}; null for free-form types.
 *  Older dropdown/multi variables list plain strings: each is its own id and label. */
function optionsOf(v: PromptVariable): { id: ID; label: string }[] | null {
  if (v.type === 'choice') return (v.choices ?? []).filter((c) => c.id).map((c) => ({ id: c.id, label: c.label || c.value }))
  if (v.type === 'dropdown' || v.type === 'multi') return (v.options ?? []).filter(Boolean).map((o) => ({ id: o, label: o }))
  return null
}

/** The option ids a variable starts with (mirrors the engine): its defaults, else the first option of a single choice. */
export function defaultIdsOf(v: PromptVariable): ID[] {
  const opts = optionsOf(v) ?? []
  const raw = v.type === 'choice'
    ? (v.defaults ?? [])
    : (isMulti(v) ? String(v.defaultValue ?? '').split(',') : [String(v.defaultValue ?? '')]).map((x) => x.trim())
  const ids = raw.filter((id) => opts.some((o) => o.id === id))
  if (isMulti(v)) return ids
  return ids.length ? ids.slice(0, 1) : opts.length ? [opts[0].id] : []
}

/** The option ids in effect: the stored picks that still exist, else the defaults. */
export function currentIdsOf(v: PromptVariable, stored: string | string[] | undefined): ID[] {
  const opts = optionsOf(v) ?? []
  const asked = stored == null ? null : (Array.isArray(stored) ? stored : [stored]).map(String)
  let ids = asked ? asked.filter((id) => opts.some((o) => o.id === id)) : null
  if (!ids || (!ids.length && asked && asked.length)) ids = defaultIdsOf(v)
  return isMulti(v) ? ids : ids.slice(0, 1)
}

/** The text of a free-form variable in effect. */
function textOf(v: PromptVariable, stored: string | string[] | undefined): string {
  if (stored == null) return String(v.defaultValue ?? '')
  return Array.isArray(stored) ? stored.join(', ') : String(stored)
}

export const isOff = (s: string) => ['', 'false', '0', 'no', 'off'].includes(s.trim().toLowerCase())

const sign = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`)

/**
 * The picks of one preset: one block per variable, in preset order. Shared by the chat's Preset panel
 * (changes save at once) and the new-chat step (changes stay in local state). `values` holds only what
 * was picked; everything else shows the preset's default. `onChange(name, null)` goes back to the default.
 */
export function PresetChoices({
  preset, values, costs, onChange, className,
}: {
  preset: Preset
  values: PresetValues
  costs: PresetCosts | null
  onChange: (name: string, value: string | string[] | null) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {preset.variables.map((v) => (
        <VariableBlock key={v.id} v={v} stored={values[v.name]} costs={costs?.vars[v.name]} onChange={(val) => onChange(v.name, val)} />
      ))}
    </div>
  )
}

function VariableBlock({
  v, stored, costs, onChange,
}: {
  v: PromptVariable
  stored: string | string[] | undefined
  costs: Record<ID, number> | undefined
  onChange: (value: string | string[] | null) => void
}) {
  const t = useT()
  const opts = optionsOf(v)
  const label = v.label || v.name
  const body = opts
    ? <OptionPicker v={v} opts={opts} ids={currentIdsOf(v, stored)} costs={costs} onChange={onChange} />
    : v.type === 'toggle'
      ? (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 font-semibold text-primary">{label}</span>
          <Switch
            checked={!isOff(textOf(v, stored))}
            onCheckedChange={(on) => onChange(on ? 'true' : 'false')}
            aria-label={label}
          />
        </label>
      )
      : v.type === 'slider'
        ? <SliderControl v={v} value={textOf(v, stored)} onCommit={onChange} />
        : <TextControl v={v} value={textOf(v, stored)} onCommit={onChange} />
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-card/40 p-2.5" data-var={v.name}>
      {v.type !== 'toggle' && (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-primary">{label}</span>
          {v.question && <span className="text-[11px] leading-snug text-muted-foreground">{v.question}</span>}
        </div>
      )}
      {v.type === 'toggle' && v.question && <span className="order-last text-[11px] leading-snug text-muted-foreground">{v.question}</span>}
      {body}
      {opts && opts.length === 0 && <span className="text-[11px] text-muted-foreground">{t('pc.noChoices')}</span>}
    </div>
  )
}

function CostMark({ n, className }: { n: number | undefined; className?: string }) {
  if (!n) return null
  return <span className={cn('shrink-0 font-mono text-[10px] text-muted-foreground', className)}>{sign(n)}</span>
}

function OptionPicker({
  v, opts, ids, costs, onChange,
}: {
  v: PromptVariable
  opts: { id: ID; label: string }[]
  ids: ID[]
  costs: Record<ID, number> | undefined
  onChange: (value: string | string[] | null) => void
}) {
  const t = useT()
  const multi = isMulti(v)
  const defaults = defaultIdsOf(v)
  const buttons = v.type === 'choice' && v.display === 'buttons'
  const costTitle = (n: number | undefined) => (n ? t(n > 0 ? 'pc.costAdds' : 'pc.costSaves', { n: Math.abs(n) }) : undefined)
  // multi: toggle one id in the list; single: pick it
  const pick = (id: ID) => {
    if (!multi) { onChange(id); return }
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : opts.map((o) => o.id).filter((x) => ids.includes(x) || x === id)
    onChange(next)
  }

  if (!multi && !buttons && opts.length > LIST_MAX) {
    const items = Object.fromEntries(opts.map((o) => [o.id, o.label]))
    return (
      <Select items={items} value={ids[0] ?? ''} onValueChange={(val) => val && onChange(val)}>
        <SelectTrigger className="h-8 w-full text-xs" aria-label={v.label || v.name}>
          <SelectValue placeholder={t('pc.pick')} />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              <span className="flex w-full items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {defaults.includes(o.id) && <span className="text-[10px] text-muted-foreground">{t('pc.default')}</span>}
                <CostMark n={costs?.[o.id]} />
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (buttons) {
    return (
      <div className="flex flex-wrap gap-1.5" role={multi ? 'group' : 'radiogroup'} aria-label={v.label || v.name}>
        {opts.map((o) => {
          const on = ids.includes(o.id)
          return (
            <button
              key={o.id}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={on}
              title={costTitle(costs?.[o.id])}
              onClick={() => pick(o.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-left text-xs transition-colors',
                on ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span>{o.label}</span>
              {defaults.includes(o.id) && <span className="text-[9px] uppercase tracking-wide text-muted-foreground/80">{t('pc.default')}</span>}
              <CostMark n={costs?.[o.id]} />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5" role={multi ? 'group' : 'radiogroup'} aria-label={v.label || v.name}>
      {opts.map((o) => {
        const on = ids.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={on}
            title={costTitle(costs?.[o.id])}
            onClick={() => pick(o.id)}
            className={cn(
              'flex items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent',
              on && 'bg-accent/60',
            )}
          >
            <span
              className={cn(
                'mt-px flex size-4 shrink-0 items-center justify-center border',
                multi ? 'rounded-[4px]' : 'rounded-full',
                on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
              )}
              aria-hidden="true"
            >
              {on && (multi ? <Check className="size-3" weight="bold" /> : <span className="size-1.5 rounded-full bg-primary-foreground" />)}
            </span>
            <span className="min-w-0 flex-1 break-words">{o.label}</span>
            {defaults.includes(o.id) && <span className="mt-0.5 shrink-0 text-[10px] text-muted-foreground">{t('pc.default')}</span>}
            <CostMark n={costs?.[o.id]} className="mt-0.5" />
          </button>
        )
      })}
    </div>
  )
}

/** text / number: a draft that saves on blur or Enter (a long text is a textarea: blur or Ctrl+Enter). */
function TextControl({ v, value, onCommit }: { v: PromptVariable; value: string; onCommit: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => { if (draft !== value) onCommit(draft) }
  const long = v.type === 'text' && (value.length > 80 || value.includes('\n'))
  if (long) {
    return (
      <Textarea
        value={draft}
        rows={4}
        aria-label={v.label || v.name}
        className="text-xs"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() } }}
      />
    )
  }
  return (
    <Input
      type={v.type === 'number' ? 'number' : 'text'}
      value={draft}
      aria-label={v.label || v.name}
      className="h-8 text-xs"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
    />
  )
}

function SliderControl({ v, value, onCommit }: { v: PromptVariable; value: string; onCommit: (value: string | null) => void }) {
  const min = v.min ?? 0
  const max = v.max ?? 100
  const n = Number.isFinite(Number(value)) && value !== '' ? Number(value) : min
  const [live, setLive] = useState(n)
  useEffect(() => setLive(n), [n])
  return (
    <div className="flex items-center gap-3">
      <Slider
        value={[live]}
        min={min}
        max={max}
        onValueChange={(a) => setLive(Array.isArray(a) ? a[0] : (a as number))}
        onValueCommitted={(a) => onCommit(String(Array.isArray(a) ? a[0] : a))}
        aria-label={v.label || v.name}
      />
      <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">{live}</span>
    </div>
  )
}
