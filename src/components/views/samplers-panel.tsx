
import { useState } from 'react'
import { ArrowCounterClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { canOpenModelSettings, openModelSettings } from '@/lib/shell-bridge'
import { defaultSamplers } from '@/lib/seed'
import { cn } from '@/lib/utils'
import type { Preset, SamplerSettings } from '@/lib/types'

type NumKey = {
  [K in keyof SamplerSettings]: SamplerSettings[K] extends { value: number; enabled: boolean } ? K : never
}[keyof SamplerSettings]

const numParams: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'temperature', label: 'Temperature', min: 0, max: 3, step: 0.01 },
  { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.01 },
  { key: 'top_k', label: 'Top K', min: 0, max: 200, step: 1 },
  { key: 'min_p', label: 'Min P', min: 0, max: 1, step: 0.01 },
  { key: 'rep_pen', label: 'Repetition penalty', min: 1, max: 2, step: 0.01 },
  { key: 'freq_pen', label: 'Frequency penalty', min: 0, max: 2, step: 0.01 },
  { key: 'pres_pen', label: 'Presence penalty', min: 0, max: 2, step: 0.01 },
]

export function SamplersPanel({ preset }: { preset: Preset }) {
  const updatePreset = useApp((s) => s.updatePreset)
  const ro = preset.readOnly
  const sp = preset.samplers
  const up = (patch: Partial<SamplerSettings>) => updatePreset(preset.id, { samplers: { ...sp, ...patch } })
  const t = useT()
  const model = useApp((s) => s.model)

  return (
    // @container: this panel lives anywhere from a phone page to a narrow
    // drawer to a full page; the grids below must follow the PANEL's width,
    // not the viewport, or a flex-1 slider collapses to zero and its thumb
    // never mounts (a zero-width control has no position to show)
    <div className="mx-auto flex max-w-3xl flex-col gap-4 @container">
      {/* 0.9.2: the engine sends the model's parameters; this preset fills only what the model leaves unset */}
      <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs" data-testid="model-first">
        <p className="text-muted-foreground">{t(preset.samplersOverrideModel ? 'model.presetWins' : 'model.modelWins')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <Switch
              checked={preset.samplersOverrideModel === true}
              disabled={ro}
              onCheckedChange={(v) => updatePreset(preset.id, { samplersOverrideModel: v })}
              aria-label={t('model.overrideSwitch')}
            />
            {t('model.overrideSwitch')}
          </label>
          {canOpenModelSettings() && model && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void openModelSettings(model).catch((e: unknown) => toast.error(String((e as Error).message ?? e)))}>
              {t('model.setUp')}
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="ml-auto flex items-center gap-2 text-xs">
          <Switch checked={sp.streaming} disabled={ro} onCheckedChange={(v) => up({ streaming: v })} aria-label="Streaming" />
          Streaming
        </label>
        <Button variant="outline" size="sm" className="text-xs" disabled={ro} onClick={() => { up(defaultSamplers()); toast.success('Neutralized samplers') }}>
          <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />Neutralize
        </Button>
      </div>

      <Tabs defaultValue="core">
        {/* same scrollable strip as Tools/Presets: flex-none triggers
            overflow, touch on mobile, wheel→horizontal on desktop */}
        <div
          className="-mx-1 overflow-x-auto overscroll-x-contain px-1 no-scrollbar"
          onWheel={(e) => {
            if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              e.currentTarget.scrollLeft += e.deltaY
            }
          }}
        >
          <TabsList className="h-8 w-max flex-nowrap @min-[28rem]:h-auto @min-[28rem]:w-full @min-[28rem]:flex-wrap @min-[28rem]:gap-y-1">
            <TabsTrigger value="core" className="flex-none px-2.5 text-xs">Core</TabsTrigger>
            <TabsTrigger value="tokensctx" className="flex-none px-2.5 text-xs">Tokens & bias</TabsTrigger>
            <TabsTrigger value="extra" className="flex-none px-2.5 text-xs">Extra params</TabsTrigger>
            <TabsTrigger value="reasoning" className="flex-none px-2.5 text-xs">Reasoning</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="core" className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 @min-[32rem]:grid-cols-2">
          {numParams.map(({ key, label, min, max, step }) => {
            const p = sp[key]
            return (
              <div key={key} className={cn('flex items-center gap-2', !p.enabled && 'opacity-50')}>
                <Switch checked={p.enabled} disabled={ro} onCheckedChange={(v) => up({ [key]: { ...p, enabled: v } } as never)} aria-label={`Send ${label}`} />
                <Label className="w-36 shrink-0 text-xs">{label}</Label>
                <Slider value={[p.value]} min={min} max={max} step={step} disabled={ro || !p.enabled} onValueChange={(vs) => up({ [key]: { ...p, value: Array.isArray(vs) ? vs[0] : vs } } as never)} aria-label={label} className="flex-1" />
                <Input
                  type="number" value={p.value} min={min} max={max} step={step} disabled={ro || !p.enabled}
                  onChange={(e) => up({ [key]: { ...p, value: Number(e.target.value) } } as never)}
                  className="h-6 w-18 text-[11px]" aria-label={`${label} value`}
                />
              </div>
            )
          })}
        </TabsContent>

        <TabsContent value="tokensctx" className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 @min-[26rem]:grid-cols-2 @min-[44rem]:grid-cols-3">
            <Num label="Max response tokens" value={sp.maxTokens} onChange={(v) => up({ maxTokens: v })} disabled={ro} wide />
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Context size {sp.contextUnlocked && '(unlocked)'}</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={sp.contextSize} disabled={ro} onChange={(e) => up({ contextSize: Number(e.target.value) })} className="h-7 text-xs" aria-label="Context size" />
                <Switch checked={sp.contextUnlocked} disabled={ro} onCheckedChange={(v) => up({ contextUnlocked: v })} aria-label="Unlock context" />
              </div>
              <p className="text-[11px] text-muted-foreground">{t('model.ctxFromModel')}</p>
            </div>
            <Num label="Seed (-1 random)" value={sp.seed} onChange={(v) => up({ seed: v })} disabled={ro} wide />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Custom stop strings (one per line)</Label>
            <Textarea value={sp.stopStrings.join('\n')} rows={3} disabled={ro} onChange={(e) => up({ stopStrings: e.target.value.split('\n').filter(Boolean) })} aria-label="Stop strings" className="font-mono text-xs" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Logit bias</Label>
            {sp.logitBias.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={b.token} disabled={ro} onChange={(e) => up({ logitBias: sp.logitBias.map((x, j) => j === i ? { ...x, token: e.target.value } : x) })} className="h-7 w-40 font-mono text-xs" aria-label="Token" />
                <Slider value={[b.bias]} min={-100} max={100} step={1} disabled={ro} onValueChange={(vs) => { const v = Array.isArray(vs) ? vs[0] : vs; up({ logitBias: sp.logitBias.map((x, j) => j === i ? { ...x, bias: v } : x) }) }} aria-label="Bias" className="flex-1" />
                <span className="w-10 text-right text-xs">{b.bias}</span>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" disabled={ro} onClick={() => up({ logitBias: sp.logitBias.filter((_, j) => j !== i) })}>remove</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-fit text-xs" disabled={ro} onClick={() => up({ logitBias: [...sp.logitBias, { token: '', bias: 0 }] })}>Add bias</Button>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Assistant prefill (start of the reply)</Label>
            <Input value={sp.assistantPrefill} disabled={ro} onChange={(e) => up({ assistantPrefill: e.target.value })} aria-label="Assistant prefill" className="h-7 text-xs" />
          </div>
        </TabsContent>

        <TabsContent value="extra" className="mt-3 flex max-w-lg flex-col gap-2">
          <p className="text-xs text-muted-foreground">Sent to the endpoint as-is. Preset imports fill these from the source file.</p>
          {Object.entries(preset.extendedSamplers ?? {}).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-44 shrink-0 truncate font-mono text-xs" title={k}>{k}</span>
              {typeof v === 'boolean' ? (
                <Switch checked={v} disabled={ro} onCheckedChange={(nv) => updatePreset(preset.id, { extendedSamplers: { ...preset.extendedSamplers, [k]: nv } })} aria-label={k} />
              ) : (
                <Input
                  value={String(v)} disabled={ro}
                  onChange={(e) => updatePreset(preset.id, { extendedSamplers: { ...preset.extendedSamplers, [k]: typeof v === 'number' && e.target.value !== '' && !isNaN(Number(e.target.value)) ? Number(e.target.value) : e.target.value } })}
                  onBlur={(e) => { if (typeof v === 'number' && e.target.value !== '' && !isNaN(Number(e.target.value))) updatePreset(preset.id, { extendedSamplers: { ...preset.extendedSamplers, [k]: Number(e.target.value) } }) }}
                  className="h-7 flex-1 font-mono text-xs" aria-label={`${k} value`}
                />
              )}
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" disabled={ro} onClick={() => { const next = { ...preset.extendedSamplers }; delete next[k]; updatePreset(preset.id, { extendedSamplers: next }) }}>remove</Button>
            </div>
          ))}
          <ExtraParamAdder preset={preset} disabled={ro} onAdd={(k, v) => updatePreset(preset.id, { extendedSamplers: { ...preset.extendedSamplers, [k]: v } })} />
        </TabsContent>

        <TabsContent value="reasoning" className="mt-3 flex max-w-md flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={sp.reasoning.enabled} disabled={ro} onCheckedChange={(v) => up({ reasoning: { ...sp.reasoning, enabled: v } })} aria-label="Enable reasoning" />
            Enable reasoning
          </label>
          <div className="flex items-center gap-3">
            <Label className="w-28 text-xs">Effort</Label>
            <Select value={sp.reasoning.effort} onValueChange={(v) => up({ reasoning: { ...sp.reasoning, effort: v as never } })}>
              <SelectTrigger className="w-32" aria-label="Reasoning effort" disabled={ro}><SelectValue /></SelectTrigger>
              <SelectContent>
                {['off', 'min', 'low', 'med', 'high', 'max'].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Num label="Token budget" value={sp.reasoning.budget} onChange={(v) => up({ reasoning: { ...sp.reasoning, budget: v } })} disabled={ro} wide />
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={sp.reasoning.autoParse} disabled={ro} onCheckedChange={(v) => up({ reasoning: { ...sp.reasoning, autoParse: v } })} aria-label="Auto-parse" />
            Auto-parse think tags
          </label>
          <div className="flex items-center gap-3">
            <Label className="w-28 text-xs">Display</Label>
            <Select value={sp.reasoning.display} onValueChange={(v) => up({ reasoning: { ...sp.reasoning, display: v as never } })}>
              <SelectTrigger className="w-32" aria-label="Reasoning display" disabled={ro}><SelectValue /></SelectTrigger>
              <SelectContent>
                {['collapsed', 'expanded', 'hidden'].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Open tag</Label>
              <Input value={sp.reasoning.thinkTagOpen} disabled={ro} onChange={(e) => up({ reasoning: { ...sp.reasoning, thinkTagOpen: e.target.value } })} className="h-7 font-mono text-xs" aria-label="Think tag open" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Close tag</Label>
              <Input value={sp.reasoning.thinkTagClose} disabled={ro} onChange={(e) => up({ reasoning: { ...sp.reasoning, thinkTagClose: e.target.value } })} className="h-7 font-mono text-xs" aria-label="Think tag close" />
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  )
}


function Num({ label, value, onChange, disabled, wide = false }: {
  label: string; value: number; onChange: (v: number) => void; disabled: boolean; wide?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-1', wide && 'w-full')}>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="h-7 text-xs" aria-label={label} />
    </div>
  )
}

/** key + value row that appends an extended sampler parameter */
function ExtraParamAdder({ preset, disabled, onAdd }: {
  preset: Preset
  disabled: boolean
  onAdd: (key: string, value: number | string | boolean) => void
}) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const add = () => {
    const k = key.trim()
    if (!k) { toast.error('Name the parameter'); return }
    if (preset.extendedSamplers && k in preset.extendedSamplers) { toast.error('Parameter exists'); return }
    const num = value !== '' && !isNaN(Number(value)) ? Number(value) : value === 'true' ? true : value === 'false' ? false : value
    onAdd(k, num)
    setKey('')
    setValue('')
  }
  return (
    <div className="flex items-center gap-2">
      <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="name" disabled={disabled} className="h-7 w-44 font-mono text-xs" aria-label="New parameter name" />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" disabled={disabled} className="h-7 flex-1 font-mono text-xs" aria-label="New parameter value" onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={disabled} onClick={add}>Add</Button>
    </div>
  )
}
