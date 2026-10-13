import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { ArrowCounterClockwise, BookmarkSimple, Star } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PresetChoices, usePresetCosts, type PresetValues } from '@/components/chat/preset-choices'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import { formatTokens } from '@/lib/tokens'
import type { ID } from '@/lib/types'

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
  const updatePreset = useApp((s) => s.updatePreset)
  const presetDefaults = useApp((s) => s.presetDefaults)
  const loadPresetDefaults = useApp((s) => s.loadPresetDefaults)
  const setPresetDefault = useApp((s) => s.setPresetDefault)
  useEffect(() => { if (open) void loadPresetDefaults() }, [open, loadPresetDefaults])
  const preset = presets.find((p) => p.id === chat?.presetId) ?? presets.find((p) => p.isDefault) ?? presets[0]
  const stored: PresetValues = useMemo(() => (preset ? chat?.presetVars?.[preset.id] ?? {} : {}), [chat?.presetVars, preset])
  const costs = usePresetCosts(`${preset?.id ?? ''}|${JSON.stringify(preset?.variables ?? [])}`, preset?.id, { chatId }, JSON.stringify(stored), open)

  if (!chat || !preset) return null
  const hasPicks = Object.keys(stored).length > 0
  const mine = presetDefaults?.[preset.id] ?? null
  const isMine = mine !== null && sameValues(mine, stored)

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
              <div className="flex flex-col gap-1.5 rounded-lg border border-border/70 p-2.5" data-testid="preset-mine">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={isMine}
                    onClick={() => { void setPresetDefault(preset.id, stored).then(() => toast.success(t('pc.mineSaved', { name: preset.name }))) }}
                  >
                    <BookmarkSimple className="size-3.5" aria-hidden="true" />{isMine ? t('pc.mineIs') : t('pc.mineSave')}
                  </Button>
                  {mine && !isMine && (
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => void setChatPreset(chatId, { reset: true, vars: mine })}>
                      {t('pc.mineUse')}
                    </Button>
                  )}
                  {mine && (
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => void setPresetDefault(preset.id, null)}>
                      {t('pc.mineForget')}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">{t('pc.mineHint')}</p>
              </div>
            )}
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

/** Same choices, whatever the key order (a missing name = the preset's default either way). */
function sameValues(a: PresetValues, b: PresetValues): boolean {
  const norm = (v: PresetValues) => JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k]]))
  return norm(a) === norm(b)
}
