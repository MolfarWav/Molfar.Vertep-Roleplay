// The chat's recent dice rolls, folded away in the World DM sheet; read when opened.
import { useState } from 'react'
import { useRelativeTime, useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { loadWorldDice, type WorldDiceRoll } from '@/lib/world'

const SHOWN = 10

export function DiceLog({ chatId }: { chatId: string }) {
  const t = useT()
  const relativeTime = useRelativeTime()
  const [rolls, setRolls] = useState<WorldDiceRoll[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = () => {
    setFailed(false)
    loadWorldDice(chatId).then((r) => setRolls(r.slice(-SHOWN).reverse())).catch(() => setFailed(true))
  }

  const outcome = (o: string | undefined) => (o ? t(`world.dice.out.${o}` as MsgKey) : '')

  const line = (r: WorldDiceRoll) => {
    if (!r.gated) return t('world.dice.quiet', { gate: r.gate, chance: r.chance })
    const dice = `${r.d1}+${r.d2}`
    if (r.stat === 'auto') {
      // the model picks the person and the stat, so only what the dice and the cast allow is known
      const who = r.who ? ` · ${r.who}` : ''
      return `${dice} = ${r.total}: ${outcome(r.outcome)} (${t('world.dice.bare')})${who}`
    }
    const mod = r.mod ? ` ${r.mod > 0 ? '+' : '−'}${Math.abs(r.mod)}` : ''
    return `${dice}${mod} = ${r.total}: ${outcome(r.outcome)} · ${t(`world.opt.diceStat.${r.stat}` as MsgKey)}${r.who ? ` (${r.who})` : ''}`
  }

  return (
    <details className="rounded-md border border-border bg-background/60 px-3 text-sm" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) load() }} data-testid="dice-log">
      <summary className="flex cursor-pointer items-center gap-2 py-1 font-medium max-md:min-h-11">{t('world.dice.log')}</summary>
      <div className="flex flex-col gap-1 pb-1">
        {failed && <p className="text-xs text-muted-foreground">{t('chats.panel.loading')}</p>}
        {rolls && rolls.length === 0 && <p className="text-xs text-muted-foreground">{t('world.dice.log.empty')}</p>}
        {rolls && rolls.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {rolls.map((r) => (
              <li key={r.at} className={r.gated ? 'text-foreground' : ''}>
                {line(r)} <span className="text-muted-foreground">· {relativeTime(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={load} className="self-start text-xs text-primary underline-offset-2 hover:underline max-md:min-h-11">{t('world.dice.log.refresh')}</button>
      </div>
    </details>
  )
}
