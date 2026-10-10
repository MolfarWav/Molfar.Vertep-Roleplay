import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowCounterClockwise, Star } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PresetChoices, type PresetValues } from '@/components/chat/preset-choices'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { formatTokens } from '@/lib/tokens'
import type { ID, PresetCosts } from '@/lib/types'

/**
 * The chat's Preset panel: which preset THIS chat runs and what it picked in it. Every change is saved
 * at once (the engine keeps the picks in the chat and leaves a muted note in the transcript); the
 * token numbers refresh a moment after the last change.
 */
export function PresetPanel({ chatId, open, onOpenChange }: { chatId: ID; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT()
  const chat = useApp((s) => s.chats.find((c) => c.id === chatId))
  const presets = useApp((s) => s.presets)
  const setChatPreset = useApp((s) => s.setChatPreset)
  const fetchPresetCosts = useApp((s) => s.fetchPresetCosts)
  const updatePreset = useApp((s) => s.updatePreset)
  const preset = presets.find((p) => p.id === chat?.presetId) ?? presets.find((p) => p.isDefault) ?? presets[0]
  const stored: PresetValues = useMemo(() => (preset ? chat?.presetVars?.[preset.id] ?? {} : {}), [chat?.presetVars, preset])
  const [costs, setCosts] = useState<PresetCosts | null>(null)

  // costs follow the picks, a moment after the last change
  const key = `${preset?.id ?? ''}|${JSON.stringify(stored)}|${preset?.variables.length ?? 0}`
  useEffect(() => {
    if (!open || !preset) return
    let live = true
    const timer = setTimeout(() => {
      fetchPresetCosts(preset.id, { chatId }).then((c) => { if (live) setCosts(c) }).catch(() => { if (live) setCosts(null) })
    }, 300)
    return () => { live = false; clearTimeout(timer) }
  }, [open, key, chatId, preset, fetchPresetCosts])

  if (!chat || !preset) return null
  const hasPicks = Object.keys(stored).length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:w-full sm:max-w-md" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{t('pc.title')}</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4" data-testid="preset-panel">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">{t('pc.thisChat')}</span>
            <div className="flex items-center gap-2">
              <Select value={preset.id} onValueChange={(id) => id && id !== preset.id && void setChatPreset(chatId, { presetId: id })}>
                <SelectTrigger className="h-8 min-w-0 flex-1 text-xs" aria-label={t('pc.thisChat')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-xs"
                disabled={preset.isDefault}
                title={t('pc.makeDefaultTip')}
                onClick={() => { updatePreset(preset.id, { isDefault: true }); toast.success(t('pc.madeDefault', { name: preset.name })) }}
              >
                <Star className="size-3.5" aria-hidden="true" />{preset.isDefault ? t('pc.default') : t('pc.makeDefault')}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground" data-testid="preset-total">
              {costs ? t('pc.total', { n: formatTokens(costs.total) }) : t('pc.totalCounting')}
            </p>
          </div>

          {preset.description?.trim() && (
            <details className="rounded-lg border border-border/70 px-2.5 py-1.5 text-xs">
              <summary className="cursor-pointer select-none font-medium">{t('pc.about')}</summary>
              <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-muted-foreground">{preset.description}</p>
            </details>
          )}

          {preset.variables.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('pc.noChoices')}</p>
          ) : (
            <PresetChoices
              preset={preset}
              values={stored}
              costs={costs}
              onChange={(name, value) => void setChatPreset(chatId, { vars: { [name]: value } })}
            />
          )}

          <div className="flex flex-col gap-2">
            {preset.variables.length > 0 && (
              <Button variant="ghost" size="sm" className="w-fit text-xs" disabled={!hasPicks} onClick={() => void setChatPreset(chatId, { reset: true })}>
                <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />{t('pc.reset')}
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">{t('pc.hint')}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
