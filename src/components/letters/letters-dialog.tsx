// Letters from cards (#72): the switch, the limits and the cards that must not write again.
// Opened from the Characters page's menu. Off by default: nothing is written until the player turns it on.

import { useEffect } from 'react'
import { EnvelopeSimple } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NumControl, SettingRow } from '@/components/ui/setting-row'
import { loadLetters, muteCard, saveLettersConfig, useLetters } from '@/lib/letters'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'

export function LettersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const { config, muted, model, available } = useLetters()
  const characters = useApp((s) => s.characters)
  useEffect(() => { if (open) void loadLetters() }, [open])
  const nameOf = (id: string) => characters.find((c) => c.id === id)?.name ?? id
  const off = !config.enabled
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="letters-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><EnvelopeSimple className="size-5 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />{t('letters.title')}</DialogTitle>
          <DialogDescription>{t('letters.about')}</DialogDescription>
        </DialogHeader>
        {!available ? (
          <p className="text-body text-muted-foreground">{t('letters.noPlugin')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Card variant="rows">
              <SettingRow label={t('letters.enable')} info={t('letters.enableInfo')}>
                <Switch checked={config.enabled} onCheckedChange={(on) => void saveLettersConfig({ enabled: on })} aria-label={t('letters.enable')} />
              </SettingRow>
              <SettingRow label={t('letters.idleDays')} info={t('letters.idleDaysInfo')} off={off}>
                <NumControl label={t('letters.idleDays')} value={config.idleDays} min={7} max={90} disabled={off} onCommit={(n) => void saveLettersConfig({ idleDays: n })} />
              </SettingRow>
              <SettingRow label={t('letters.perDay')} info={t('letters.perDayInfo')} off={off}>
                <NumControl label={t('letters.perDay')} value={config.perDay} min={1} max={10} disabled={off} onCommit={(n) => void saveLettersConfig({ perDay: n })} />
              </SettingRow>
              <SettingRow label={t('letters.perCard')} info={t('letters.perCardInfo')} off={off}>
                <NumControl label={t('letters.perCard')} value={config.perCardDays} min={7} max={180} disabled={off} onCommit={(n) => void saveLettersConfig({ perCardDays: n })} />
              </SettingRow>
              <SettingRow
                label={t('letters.model')}
                off={off}
                status={config.enabled && !model ? <span className="text-destructive">{t('letters.noModel')}</span> : model ? t('letters.modelIs', { model }) : undefined}
              >
                <span />
              </SettingRow>
            </Card>
            {muted.length > 0 && (
              <div className="flex flex-col gap-1.5" data-testid="letters-muted">
                <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">{t('letters.mutedTitle')}</p>
                <ul className="flex flex-col gap-1">
                  {muted.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 max-md:min-h-12">
                      <span className="min-w-0 truncate text-body">{nameOf(id)}</span>
                      <Button variant="outline" size="sm" className="max-md:h-10" onClick={() => void muteCard(id, false)}>{t('letters.allow')}</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
