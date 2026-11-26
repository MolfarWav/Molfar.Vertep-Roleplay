import { CaretDown, Warning } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ModelPicker } from '@/components/settings/model-picker'
import { useT } from '@/hooks/use-t'
import { fitReport, shortTokens } from '@/lib/card-tasks'
import { estimateTokens } from '@/lib/tokens'
import { shortModel } from '@/lib/utils'
import type { CardTasksState } from '@/components/character/use-card-tasks'
import type { VisionModel } from '@/components/character/structure-draft'

/** A whole number from a field, or undefined when it is empty (= automatic). */
const wholeNumber = (v: string): number | undefined => {
  const n = Math.floor(Number(v))
  return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * "Model for this card's tasks" (GitHub #104): the model Structure it, Fill empty and the Soul rating use for
 * this card, with the limits that model really has and whether the card fits in one call; and (GitHub #528, #530)
 * the model that reads the card's portrait, for Read from picture and the Appearance fields of Fill empty. It sits
 * at the top of the Profile tab; what it sets is written by the editor's Save changes (a persona's at once).
 */
export function CardModelPanel({ tasks, c, vision, hasPortrait, saves = 'card' }: {
  tasks: CardTasksState
  c: { description: string; personality?: string }
  vision: VisionModel
  hasPortrait: boolean
  saves?: 'card' | 'now'
}) {
  const t = useT()
  const { edit, resolved, info, limits } = tasks
  const lim = limits('structure')
  const cardTokens = estimateTokens(`${c.description}\n${c.personality ?? ''}`)
  const fit = fitReport(cardTokens, lim)
  const name = resolved.model ? shortModel(resolved.model) : t('ct.none')
  const noPictureModel = vision.models.length === 0 && !vision.engineRef
  const pictureName = vision.value === 'none' ? t('ct.pic.off') : vision.active ? vision.named(vision.active) : t('ct.pic.none')
  const price = info?.pricing ? t('ct.price', { input: info.pricing.input, output: info.pricing.output }) : ''
  return (
    <Collapsible className="rounded-lg border border-border" data-testid="card-model-panel">
      <CollapsibleTrigger className="flex min-h-10 w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:min-h-9">
        <span className="font-medium">{t('ct.panelTitle')}</span>
        <span className="text-muted-foreground">{t('ct.textShort')}</span>
        <span className="min-w-0 truncate font-mono" title={resolved.model}>{name}</span>
        <span className="rounded border border-border bg-muted px-1 py-px text-[10px] text-muted-foreground">{t(`ct.src.${resolved.source}`)}</span>
        <span className="text-muted-foreground">{t('ct.picShort')}</span>
        <span className="min-w-0 truncate font-mono" title={vision.active}>{pictureName}</span>
        {!fit.fits && (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Warning className="size-3.5" aria-hidden="true" />{t('ct.parts', { n: fit.parts })}
          </span>
        )}
        <CaretDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 border-t border-border p-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">{t('ct.textTitle')}</h3>
          <p className="text-xs text-muted-foreground">{t('ct.textFor')}</p>
        </div>
        <ModelPicker
          value={edit.model ?? ''}
          onChange={(v) => tasks.setEdit({ model: v || undefined })}
          chatDefaultLabel={t('ct.follow')}
          ariaLabel={t('ct.title')}
        />
        <p className="text-xs text-muted-foreground">
          {lim.context
            ? t('ct.window', { context: shortTokens(lim.context), out: shortTokens(lim.maxOut ?? lim.outputTokens) })
            : t('ct.windowUnknown', { n: shortTokens(lim.inputTokens) })}
          {' · '}
          {t('ct.size', { tokens: shortTokens(cardTokens) })}
          {' '}
          <span className={fit.fits ? '' : 'text-amber-600 dark:text-amber-400'}>
            {fit.fits ? t('ct.fits') : t('ct.parts', { n: fit.parts })}
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor="ct-in">{t('ct.maxInput')}</Label>
            <Input id="ct-in" type="number" inputMode="numeric" min={500} className="max-md:h-10" value={edit.maxInput ?? ''} placeholder={`${t('ct.auto')} (${shortTokens(lim.inputTokens)})`}
              onChange={(e) => tasks.setEdit({ maxInput: wholeNumber(e.target.value) })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor="ct-out">{t('ct.maxOutput')}</Label>
            <Input id="ct-out" type="number" inputMode="numeric" min={800} className="max-md:h-10" value={edit.maxOutput ?? ''} placeholder={`${t('ct.auto')} (${shortTokens(lim.outputTokens)})`}
              onChange={(e) => tasks.setEdit({ maxOutput: wholeNumber(e.target.value) })} />
          </div>
        </div>
        {resolved.model && (
          <p className="text-xs text-muted-foreground">
            {t('ct.privacy', { model: name })}{price ? ` ${price}` : ''}
          </p>
        )}
        <div className="flex flex-col gap-2 border-t border-border pt-3" data-testid="card-picture-model">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">{t('ct.picTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('ct.picFor')}</p>
          </div>
          <Select value={noPictureModel ? 'settings' : vision.value} onValueChange={(v) => vision.setValue(v ? String(v) : 'settings')} disabled={noPictureModel}>
            <SelectTrigger className="w-full text-sm max-md:h-10" aria-label={t('ct.picTitle')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="settings">{vision.settingsLabel}</SelectItem>
              <SelectItem value="none">{t('ct.picOff')}</SelectItem>
              {vision.models.map((m) => <SelectItem key={m.ref} value={m.ref}>{`${m.provider} · ${m.id}`}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {noPictureModel
              ? t('ct.picNone')
              : vision.value === 'none'
                ? t('ct.picOffNote')
                : !vision.active
                  ? t('ct.picPick')
                  : hasPortrait
                    ? t('ct.picPrivacy', { model: vision.named(vision.active) })
                    : t('ct.picNoPortrait')}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{t(saves === 'now' ? 'ct.savedNow' : 'ct.saved')}</p>
      </CollapsibleContent>
    </Collapsible>
  )
}
