// The dice controls (mode with an explanation each, stat, chance): one block, on the profile's Options card and in the chat's sheet.
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { WORLD_DICE_STATS, type WorldDiceMode, type WorldDiceStat } from '@/lib/world'

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

export function DiceFields({ mode, stat, chance, onChange, idPrefix = 'dice' }: {
  mode: WorldDiceMode
  stat: WorldDiceStat
  chance: number
  onChange: (patch: { dice?: WorldDiceMode; diceStat?: WorldDiceStat; diceChance?: number }) => void
  idPrefix?: string
}) {
  const t = useT()
  return (
    <>
      <div role="radiogroup" aria-label={t('world.opt.dice')} className="flex flex-col gap-1.5 text-sm" data-testid="dice-options">
        <span className="font-medium">{t('world.opt.dice')}</span>
        <span className="text-xs text-muted-foreground">{t('world.opt.diceHint')}</span>
        {MODES.map((v) => (
          <label key={v} className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-2 max-md:min-h-11', mode === v ? 'border-primary bg-primary/5' : 'border-border')}>
            <input type="radio" name={idPrefix} checked={mode === v} onChange={() => onChange({ dice: v })} className="mt-1 accent-primary" />
            <span className="min-w-0">
              {t(`world.opt.dice.${v}` as MsgKey)}
              <span className="block text-xs text-muted-foreground">{t(`world.opt.dice.${v}.hint` as MsgKey)}</span>
            </span>
          </label>
        ))}
      </div>
      {mode !== 'off' && (
        <>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">{t('world.opt.diceStat')}<span className="block text-xs text-muted-foreground">{t('world.opt.diceStatHint')}</span></span>
            <select value={stat} onChange={(e) => onChange({ diceStat: e.target.value as WorldDiceStat })} aria-label={t('world.opt.diceStat')} className="h-9 rounded-md border border-border bg-background px-2 text-sm max-md:h-11">
              {WORLD_DICE_STATS.map((s) => <option key={s} value={s}>{t(`world.opt.diceStat.${s}` as MsgKey)}</option>)}
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
