// The dice controls (mode with an explanation each, stat, chance): one block, on the profile's Options card and in the chat's sheet.
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { WORLD_DICE_STAT_CHOICES, type WorldDiceMode, type WorldDiceStat } from '@/lib/world'

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

export function DiceFields({ mode, stat, chance, onChange }: {
  mode: WorldDiceMode
  stat: WorldDiceStat
  chance: number
  onChange: (patch: { dice?: WorldDiceMode; diceStat?: WorldDiceStat; diceChance?: number }) => void
}) {
  const t = useT()
  return (
    <>
      <div className="flex flex-col gap-1.5 text-sm" data-testid="dice-options">
        <span className="font-medium">{t('world.opt.dice')}</span>
        <span className="text-xs text-muted-foreground">{t('world.opt.diceHint')}</span>
        <div role="radiogroup" aria-label={t('world.opt.dice')} className="grid grid-cols-3 gap-1 rounded-md border border-border p-1">
          {MODES.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={mode === v}
              onClick={() => onChange({ dice: v })}
              className={cn('rounded px-2 py-1.5 text-sm max-md:min-h-11', mode === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
            >
              {t(`world.opt.dice.${v}` as MsgKey)}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite" data-testid="dice-mode-hint">{t(`world.opt.dice.${mode}.hint` as MsgKey)}</span>
      </div>
      {mode !== 'off' && (
        <>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">{t('world.opt.diceStat')}<span className="block text-xs text-muted-foreground">{t('world.opt.diceStatHint')}</span></span>
            <select value={stat} onChange={(e) => onChange({ diceStat: e.target.value as WorldDiceStat })} aria-label={t('world.opt.diceStat')} className="h-9 rounded-md border border-border bg-background px-2 text-sm max-md:h-11">
              {WORLD_DICE_STAT_CHOICES.map((s) => <option key={s} value={s}>{t(`world.opt.diceStat.${s}` as MsgKey)}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">{t('world.opt.diceChance')}<span className="block text-xs text-muted-foreground">{t('world.opt.diceChanceHint')}</span></span>
            <NumField label={t('world.opt.diceChance')} value={chance} min={1} max={100} onCommit={(n) => onChange({ diceChance: n })} />
          </label>
        </>
      )}
    </>
  )
}
