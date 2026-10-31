// The dice controls (mode with an explanation each, stat, luck, chance, life). Used on the profile's Options card and in
// the chat's World DM panel. It draws no card of its own: the caller's card holds it, and it renders a fragment of rows.
import type { ReactNode } from 'react'
import { Switch } from '@/components/ui/switch'
import { Fold } from '@/components/ui/fold'
import { NumControl, SettingRow } from '@/components/ui/setting-row'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { WORLD_DICE_STAT_CHOICES, WORLD_DICE_TILTS, type WorldDiceMode, type WorldDiceStat, type WorldDiceTilt } from '@/lib/world'
import { diceSummary } from './world-summaries'

const MODES = ['off', 'flavour', 'strict'] as const satisfies readonly WorldDiceMode[]

const SELECT = 'h-10 rounded-lg border border-input bg-transparent px-2.5 text-body outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:h-8'

/** The mode, its explanation, and (when on) the details fold; then `children` (the roll log), outside the fold: folds do not nest. */
export function DiceFields({ mode, stat, chance, tilt, life, show, onShow, onChange, disabled = false, children }: {
  mode: WorldDiceMode
  stat: WorldDiceStat
  chance: number
  tilt: WorldDiceTilt
  life: number
  /** a mark under each reply that had a roll (the chat's own: the profile's card leaves it out) */
  show?: boolean
  onShow?: (v: boolean) => void
  onChange: (patch: { dice?: WorldDiceMode; diceStat?: WorldDiceStat; diceChance?: number; diceTilt?: WorldDiceTilt; diceLife?: number }) => void
  /** the DM is off: every control here is disabled (the caller dims the card) */
  disabled?: boolean
  children?: ReactNode
}) {
  const t = useT()
  const on = mode !== 'off'
  return (
    <>
      <div className="flex flex-col gap-2 px-4 py-3" data-testid="dice-options">
        <span className="text-body font-semibold">{t('world.opt.dice')}</span>
        <div role="radiogroup" aria-label={t('world.opt.dice')} className="flex gap-0.5 rounded-lg bg-muted p-0.5">
          {MODES.map((v) => {
            const active = mode === v
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => { if (!active) onChange({ dice: v }) }}
                className={cn(
                  'h-8 flex-1 rounded-md px-2.5 whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 max-md:h-10',
                  active ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  'text-body',
                )}
              >
                {t(`world.opt.dice.${v}` as MsgKey)}
              </button>
            )
          })}
        </div>
        <p className="text-caption text-muted-foreground" aria-live="polite" data-testid="dice-mode-hint">
          {t(`world.opt.dice.${mode}.hint` as MsgKey)}
        </p>
      </div>
      {on && (
        <Fold
          id="dice-details"
          title={t('world.fold.diceDetails')}
          summary={diceSummary(t, { stat, tilt, chance, life })}
          flat
        >
          <SettingRow label={t('world.opt.diceStat')} info={t('world.opt.diceStatHint')}>
            <select value={stat} disabled={disabled} onChange={(e) => onChange({ diceStat: e.target.value as WorldDiceStat })} aria-label={t('world.opt.diceStat')} className={SELECT}>
              {WORLD_DICE_STAT_CHOICES.map((s) => <option key={s} value={s}>{t(`world.opt.diceStat.${s}` as MsgKey)}</option>)}
            </select>
          </SettingRow>
          <SettingRow label={t('world.opt.diceTilt')} info={t('world.opt.diceTiltHint')}>
            <select value={tilt} disabled={disabled} onChange={(e) => onChange({ diceTilt: e.target.value as WorldDiceTilt })} aria-label={t('world.opt.diceTilt')} className={SELECT}>
              {WORLD_DICE_TILTS.map((v) => <option key={v} value={v}>{t(`world.opt.diceTilt.${v}` as MsgKey)}</option>)}
            </select>
          </SettingRow>
          <SettingRow label={t('world.opt.diceChance')} info={t('world.opt.diceChanceHint')}>
            <NumControl label={t('world.opt.diceChance')} value={chance} min={1} max={100} disabled={disabled} onCommit={(n) => onChange({ diceChance: n })} />
          </SettingRow>
          {onShow && (
            <SettingRow label={t('world.opt.diceShow')} info={t('world.opt.diceShowHint')}>
              <Switch checked={show === true} disabled={disabled} onCheckedChange={onShow} aria-label={t('world.opt.diceShow')} />
            </SettingRow>
          )}
          <SettingRow label={t('world.opt.diceLife')} info={t('world.opt.diceLifeHint')}>
            <NumControl label={t('world.opt.diceLife')} value={life} min={0} max={100} disabled={disabled} onCommit={(n) => onChange({ diceLife: n })} />
          </SettingRow>
        </Fold>
      )}
      {on && children}
    </>
  )
}
