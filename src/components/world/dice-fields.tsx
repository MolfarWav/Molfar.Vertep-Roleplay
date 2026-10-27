// The dice controls (mode with an explanation each, stat, chance): one block, on the profile's Options card and in the chat's sheet.
import { useEffect, useState, type ReactNode } from 'react'
import { DiceFive } from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { WORLD_DICE_STAT_CHOICES, WORLD_DICE_TILTS, type WorldDiceMode, type WorldDiceStat, type WorldDiceTilt } from '@/lib/world'

export function NumField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Math.round(Number(text))
    if (!Number.isFinite(n)) { setText(String(value)); return }
    const c = Math.min(max, Math.max(min, n))
    setText(String(c))
    if (c !== value) onCommit(c)
  }
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
      className="h-10 w-20 shrink-0 text-right md:h-8"
    />
  )
}

const MODES = ['off', 'flavour', 'strict'] as const satisfies readonly WorldDiceMode[]

const SELECT = 'h-9 rounded-md border border-border bg-background px-2 text-sm max-md:h-11'

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="min-w-0">
        {label}
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      {children}
    </label>
  )
}

/** The dice as one card: icon and title, a three-way switch with the explanation of the chosen position, then the settings in their own group. `children` (the roll log) closes the card. */
export function DiceFields({ mode, stat, chance, tilt, life, onChange, children }: {
  mode: WorldDiceMode
  stat: WorldDiceStat
  chance: number
  tilt: WorldDiceTilt
  life: number
  onChange: (patch: { dice?: WorldDiceMode; diceStat?: WorldDiceStat; diceChance?: number; diceTilt?: WorldDiceTilt; diceLife?: number }) => void
  children?: ReactNode
}) {
  const t = useT()
  const on = mode !== 'off'
  return (
    <section className={cn('flex flex-col gap-3 rounded-lg border border-l-4 bg-muted/30 p-3', on ? 'border-l-primary' : 'border-l-border')} data-testid="dice-options">
      <div className="flex items-center gap-2.5">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', on ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')} aria-hidden="true">
          <DiceFive className="size-6" weight="duotone" />
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-tight">{t('world.opt.dice')}</h4>
          <p className="text-xs text-muted-foreground">{t('world.opt.diceHint')}</p>
        </div>
      </div>
      <div role="radiogroup" aria-label={t('world.opt.dice')} className="grid grid-cols-3 gap-1 rounded-md bg-background/70 p-1">
        {MODES.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={mode === v}
            onClick={() => onChange({ dice: v })}
            className={cn('rounded px-2 py-1.5 text-sm max-md:min-h-11', mode === v ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}
          >
            {t(`world.opt.dice.${v}` as MsgKey)}
          </button>
        ))}
      </div>
      <p className="rounded-md bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground" aria-live="polite" data-testid="dice-mode-hint">
        {t(`world.opt.dice.${mode}.hint` as MsgKey)}
      </p>
      {on && (
        <div className="flex flex-col divide-y divide-border rounded-md border border-border bg-background/60">
          <Row label={t('world.opt.diceStat')} hint={t('world.opt.diceStatHint')}>
            <select value={stat} onChange={(e) => onChange({ diceStat: e.target.value as WorldDiceStat })} aria-label={t('world.opt.diceStat')} className={SELECT}>
              {WORLD_DICE_STAT_CHOICES.map((s) => <option key={s} value={s}>{t(`world.opt.diceStat.${s}` as MsgKey)}</option>)}
            </select>
          </Row>
          <Row label={t('world.opt.diceTilt')} hint={t('world.opt.diceTiltHint')}>
            <select value={tilt} onChange={(e) => onChange({ diceTilt: e.target.value as WorldDiceTilt })} aria-label={t('world.opt.diceTilt')} className={SELECT}>
              {WORLD_DICE_TILTS.map((v) => <option key={v} value={v}>{t(`world.opt.diceTilt.${v}` as MsgKey)}</option>)}
            </select>
          </Row>
          <Row label={t('world.opt.diceChance')} hint={t('world.opt.diceChanceHint')}>
            <NumField label={t('world.opt.diceChance')} value={chance} min={1} max={100} onCommit={(n) => onChange({ diceChance: n })} />
          </Row>
          <Row label={t('world.opt.diceLife')} hint={t('world.opt.diceLifeHint')}>
            <NumField label={t('world.opt.diceLife')} value={life} min={0} max={100} onCommit={(n) => onChange({ diceLife: n })} />
          </Row>
        </div>
      )}
      {on && children}
    </section>
  )
}
