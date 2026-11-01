// The strings of the World DM panel that say what is set: the value chips of the task cards and the summaries of the
// folds. Pure: the caller passes `t` (the app's, or a bound one in tests) and plain values.

import type { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import type { WorldDiceMode, WorldDiceStat, WorldDiceTilt } from '@/lib/world'

export type T = ReturnType<typeof useT>

/** "every 3 replies" and "next in 2" or "due now": the schedule card's chips. */
export function scheduleChips(t: T, v: { everyN: number; dueIn: number }): string[] {
  return [t('world.chip.every', { n: v.everyN }), v.dueIn > 0 ? t('world.chip.next', { n: v.dueIn }) : t('world.chip.dueNow')]
}

/** "records every 5" (0 = together with the run) and "800 characters": the writes card's chips. */
export function writesChips(t: T, v: { recordsEveryN: number; textMax: number }): string[] {
  return [
    v.recordsEveryN > 0 ? t('world.chip.recEvery', { n: v.recordsEveryN }) : t('world.chip.recWithRun'),
    t('world.chip.chars', { n: v.textMax }),
  ]
}

/** "events on" or "events off", then "dice: Hint" when the dice are known: the adds-to-the-story card's chips. */
export function addsChips(t: T, v: { insert: boolean; dice?: WorldDiceMode }): string[] {
  const out = [v.insert ? t('world.chip.eventsOn') : t('world.chip.eventsOff')]
  if (v.dice) out.push(t('world.chip.dice', { mode: t(`world.opt.dice.${v.dice}` as MsgKey) }))
  return out
}

/** The Limits fold, closed: "800 characters · 8 changes per run". */
export function limitsSummary(t: T, v: { textMax: number; changesMax: number }): string {
  return t('world.fold.limitsSum', { chars: v.textMax, n: v.changesMax })
}

/** The Dice details fold, closed: "By the action · Even · 30% of replies · world 10%". */
export function diceSummary(t: T, v: { stat: WorldDiceStat; tilt: WorldDiceTilt; chance: number; life: number }): string {
  return t('world.fold.diceSum', {
    stat: t(`world.opt.diceStat.${v.stat}` as MsgKey),
    tilt: t(`world.opt.diceTilt.${v.tilt}` as MsgKey),
    chance: v.chance,
    life: v.life,
  })
}

/** The Recent rolls fold, closed: "Last: 9, clean · 10 shown", or "No rolls yet" with no roll. */
export function rollsSummary(t: T, v: { last: string | null; n: number }): string {
  if (!v.last) return t('world.fold.rollsNone')
  return t('world.fold.rollsSum', { last: v.last, n: v.n })
}
