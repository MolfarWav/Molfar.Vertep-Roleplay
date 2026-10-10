import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PresetChoices, usePresetCosts, type PresetValues } from '@/components/chat/preset-choices'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { formatTokens } from '@/lib/tokens'
import type { ID, PresetMemory } from '@/lib/types'

/**
 * The short step before a chat starts: pick the preset and its options for this chat. It opens with the
 * preset and picks of this character's last chat where they were chosen (per-character memory), else the
 * user's default preset with its defaults. Nothing is created until "Start".
 */
export function NewChatStep() {
  const step = useApp((s) => s.newChatStep)
  if (!step) return null
  // keyed by the request, so a second step starts from a clean state
  return <StepDialog key={`${step.charId}:${step.greetingIndex ?? 0}`} charId={step.charId} greetingIndex={step.greetingIndex} />
}

function StepDialog({ charId, greetingIndex }: { charId: ID; greetingIndex?: number }) {
  const t = useT()
  const character = useApp((s) => s.characters.find((c) => c.id === charId))
  const presets = useApp((s) => s.presets)
  const fetchPresetMemory = useApp((s) => s.fetchPresetMemory)
  const startChatWith = useApp((s) => s.startChatWith)
  const closeNewChatStep = useApp((s) => s.closeNewChatStep)
  const updateSettings = useApp((s) => s.updateSettings)
  const defaultId = (presets.find((p) => p.isDefault) ?? presets[0])?.id ?? ''
  const [memory, setMemory] = useState<PresetMemory | null>(null)
  const [ready, setReady] = useState(false)
  const [presetId, setPresetId] = useState<ID>(defaultId)
  const [values, setValues] = useState<PresetValues>({})
  const [dontAsk, setDontAsk] = useState(false)

  // the character's memory (single characters only)
  useEffect(() => {
    let live = true
    const done = (m: PresetMemory | null) => {
      if (!live) return
      setMemory(m)
      if (m?.presetId && presets.some((p) => p.id === m.presetId)) {
        setPresetId(m.presetId)
        setValues(m.vars ?? {})
      }
      setReady(true)
    }
    if (character?.isGroup) done(null)
    else void fetchPresetMemory(charId).then(done)
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId])

  const preset = presets.find((p) => p.id === presetId) ?? presets.find((p) => p.id === defaultId)

  const costs = usePresetCosts(`${preset?.id ?? ''}|${JSON.stringify(preset?.variables ?? [])}`, preset?.id, { vars: values }, JSON.stringify(values), ready)

  const start = () => {
    if (!preset || !ready) return
    if (dontAsk) updateSettings({ askPresetOnNewChat: false })
    closeNewChatStep()
    void startChatWith(charId, greetingIndex, { presetId: preset.id, presetVars: values })
  }

  const pickPreset = (id: ID) => {
    setPresetId(id)
    setValues(memory?.presetId === id ? memory.vars ?? {} : {})
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) closeNewChatStep() }}>
      <DialogContent
        className="flex max-h-[88dvh] flex-col gap-3 sm:max-w-lg"
        data-testid="new-chat-step"
        onKeyDown={(e) => {
          const el = e.target as HTMLElement
          if (e.key === 'Enter' && !e.shiftKey && !el.closest('input, textarea, button, [role="combobox"], [role="radio"], [role="checkbox"], [role="switch"]')) {
            e.preventDefault()
            start()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('pc.step.title', { name: character?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('pc.step.desc')}</DialogDescription>
        </DialogHeader>
        {/* the preset picker stays in view; only the options scroll */}
        {preset && (
          <div className="flex flex-col gap-1.5">
            <Select value={preset.id} onValueChange={(id) => id && pickPreset(id)}>
              <SelectTrigger className="h-8 w-full text-xs" aria-label={t('pc.title')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {costs ? t('pc.total', { n: formatTokens(costs.total) }) : t('pc.totalCounting')}
            </p>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
          {preset && preset.variables.length > 0 && (
            <PresetChoices
              preset={preset}
              values={values}
              costs={costs}
              onChange={(name, value) => setValues((cur) => {
                const next = { ...cur }
                if (value === null) delete next[name]
                else next[name] = value
                return next
              })}
            />
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={dontAsk} onCheckedChange={(c) => setDontAsk(c === true)} className="mt-0.5" />
            <span className="flex flex-col">
              <span>{t('pc.step.dontAsk')}</span>
              <span className="text-[11px] text-muted-foreground">{t('pc.step.dontAskHint')}</span>
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeNewChatStep}>{t('pc.step.cancel')}</Button>
            <Button size="sm" onClick={start} disabled={!ready || !preset} data-testid="new-chat-start">{t('pc.step.start')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
