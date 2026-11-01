// The chat's recent dice rolls: a flat Fold in the DM panel. Read on mount (its summary shows the newest roll) and on Refresh.
import { useCallback, useEffect, useState } from 'react'
import { Fold } from '@/components/ui/fold'
import { useRelativeTime, useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { loadWorldDice, type WorldDiceRoll } from '@/lib/world'
import { rollsSummary } from './world-summaries'

const SHOWN = 10

type T = ReturnType<typeof useT>

/** One roll as a short line: the dice, the total and what it made. */
export function rollLine(t: T, r: WorldDiceRoll): string {
  const outcome = (o: string | undefined) => (o ? t(`world.dice.out.${o}` as MsgKey) : '')
  if (r.kind === 'life') return r.gated ? t('world.dice.life', { tier: t(`world.dice.tier.${r.tier}` as MsgKey) }) : t('world.dice.life.quiet')
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

export function DiceLog({ chatId }: { chatId: string }) {
  const t = useT()
  const relativeTime = useRelativeTime()
  const [rolls, setRolls] = useState<WorldDiceRoll[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    loadWorldDice(chatId).then((r) => setRolls(r.rolls.slice(-SHOWN).reverse())).catch(() => setFailed(true))
  }, [chatId])

  useEffect(() => {
    setRolls(null)
    load()
  }, [load])

  const newest = rolls?.[0]
  const summary = rolls === null ? t('chats.panel.loading') : rollsSummary(t, { last: newest ? rollLine(t, newest) : null, n: rolls.length })

  return (
    <div data-testid="dice-log">
      <Fold id="rolls" title={t('world.dice.log')} summary={summary} flat>
        <div className="flex flex-col gap-1 px-4 py-2">
          {failed && <p className="text-caption text-muted-foreground">{t('chats.panel.loading')}</p>}
          {rolls && rolls.length === 0 && <p className="text-caption text-muted-foreground">{t('world.dice.log.empty')}</p>}
          {rolls && rolls.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-caption text-muted-foreground">
              {rolls.map((r, i) => (
                <li key={`${r.at}-${i}`} className={r.gated ? 'text-foreground' : ''}>
                  {rollLine(t, r)} <span className="text-muted-foreground">· {relativeTime(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={load} className="self-start text-caption text-primary underline-offset-2 hover:underline max-md:min-h-10">
            {t('world.dice.log.refresh')}
          </button>
        </div>
      </Fold>
    </div>
  )
}
