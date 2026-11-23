// The roll, shown while the reply is written (Molfar.Vertep#501). World's code rolls before the reply model is asked,
// so the result exists during the wait: the dice tumble for a moment and land on the rolled faces, with the outcome
// beside them. Only in a chat that shows its rolls (World DM sheet, Dice, "Show under the reply"); the player never
// throws, this only shows what code rolled. With reduced motion the faces show at once.
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/hooks/use-t'
import type { MsgKey } from '@/lib/i18n'
import { refreshDice, useDiceLive, type WorldDiceRoll } from '@/lib/world'
import { cn } from '@/lib/utils'

const TUMBLE_MS = 1100
const STEP_MS = 90
// the roll is written when the server builds the reply request (after the Dashboard's sensor), about when the stream starts here
const LOOK_AT = [250, 800, 1600, 2800, 4500]
// a roll older than the stream by more than this belongs to an earlier reply
const SLACK_MS = 4000
// the card covers the end of the reply being written: it stays this long after the dice land, then the mark under the reply keeps the roll
const SHOW_MS = 2600
const LINGER_MS = 1500

/** The rolls a reply that started at `since` got: the action's, the pacing check and the world's, when they came up. */
export function freshRolls(rolls: WorldDiceRoll[], since: number): WorldDiceRoll[] {
  const mine = rolls.filter((r) => r.at >= since - SLACK_MS && r.gated && r.inserted && r.kind !== 'cast')
  const pick = (kind: WorldDiceRoll['kind']) => mine.filter((r) => r.kind === kind).sort((a, b) => b.at - a.at)[0]
  return [pick(undefined), pick('pace'), pick('life')].filter((r): r is WorldDiceRoll => !!r)
}

/** The faces a roll landed on: two for the action and the pacing check, one for the world. */
export function facesOf(r: WorldDiceRoll): number[] {
  if (r.kind === 'life') {
    const d = (r as unknown as { d?: unknown }).d
    return typeof d === 'number' ? [d] : []
  }
  return [r.d1, r.d2].filter((n): n is number => typeof n === 'number')
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

function Die({ face, tilt }: { face: number; tilt: number }) {
  const on = PIPS[face] ?? []
  return (
    <span
      className="grid size-8 grid-cols-3 grid-rows-3 gap-px rounded-md border border-border bg-background p-1 shadow-sm transition-transform duration-75"
      style={{ transform: `rotate(${tilt}deg)` }}
      aria-hidden="true"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={cn('m-auto size-1.5 rounded-full', on.includes(i) ? 'bg-foreground' : 'bg-transparent')} />
      ))}
    </span>
  )
}

function label(t: ReturnType<typeof useT>, r: WorldDiceRoll): string {
  if (r.kind === 'life') return t('world.dice.life', { tier: t(`world.dice.tier.${r.tier}` as MsgKey) })
  if (r.kind === 'pace') return t('world.dice.pace', { outcome: t(`world.dice.pace.out.${r.outcome}` as MsgKey) })
  return `${r.total}: ${t(`world.dice.out.${r.outcome}` as MsgKey)}`
}

function Toss({ roll, still }: { roll: WorldDiceRoll; still: boolean }) {
  const t = useT()
  const final = facesOf(roll)
  const [faces, setFaces] = useState<number[]>(still ? final : final.map(() => 1))
  const [tilts, setTilts] = useState<number[]>(final.map(() => 0))
  const [landed, setLanded] = useState(still)
  useEffect(() => {
    if (still) return
    const id = window.setInterval(() => {
      setFaces(final.map(() => 1 + Math.floor(Math.random() * 6)))
      setTilts(final.map(() => Math.round(Math.random() * 50 - 25)))
    }, STEP_MS)
    const end = window.setTimeout(() => {
      window.clearInterval(id)
      setFaces(final)
      setTilts(final.map(() => 0))
      setLanded(true)
    }, TUMBLE_MS)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(end)
    }
    // the roll does not change while it is shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!final.length) return null
  return (
    <div className="flex items-center gap-2">
      <span className="flex gap-1.5">{faces.map((f, i) => <Die key={i} face={f} tilt={tilts[i] ?? 0} />)}</span>
      <span className={cn('text-caption font-medium transition-opacity duration-300', landed ? 'opacity-100' : 'opacity-0')}>{label(t, roll)}</span>
    </div>
  )
}

export function DiceToss({ chatId, active }: { chatId: string; /** a reply is being written */ active: boolean }) {
  const t = useT()
  const [rolls, setRolls] = useState<WorldDiceRoll[]>([])
  const [shown, setShown] = useState(false)
  const since = useRef(0)
  const still = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!active) {
      if (!shown) return
      const id = window.setTimeout(() => {
        setShown(false)
        setRolls([])
      }, LINGER_MS)
      return () => window.clearTimeout(id)
    }
    since.current = Date.now()
    setRolls([])
    setShown(false)
    let stop = false
    const timers = LOOK_AT.map((ms) =>
      window.setTimeout(async () => {
        if (stop) return
        const live = useDiceLive.getState().chats[chatId]
        // a chat that hides its rolls is not read at all
        if (live && !live.show) return
        await refreshDice(chatId)
        const now = useDiceLive.getState().chats[chatId]
        if (stop || !now || !now.show) return
        const got = freshRolls(now.rolls, since.current)
        if (got.length) {
          stop = true
          setRolls(got)
          setShown(true)
        }
      }, ms),
    )
    return () => {
      stop = true
      for (const id of timers) window.clearTimeout(id)
    }
    // `shown` only matters for the fade after the reply
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, chatId])

  // once landed, the card goes after a short while even if the reply is still being written
  useEffect(() => {
    if (!shown) return
    const id = window.setTimeout(() => setShown(false), (still ? 0 : TUMBLE_MS) + SHOW_MS)
    return () => window.clearTimeout(id)
  }, [shown, still])

  if (!shown || !rolls.length) return null
  return (
    <div
      className="pointer-events-none absolute right-3 bottom-full mb-2 flex max-w-[calc(100%-1.5rem)] flex-col gap-1.5 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-md backdrop-blur"
      role="status"
      aria-live="polite"
      aria-label={t('world.dice.toss')}
      data-testid="dice-toss"
    >
      {rolls.map((r) => <Toss key={r.at + (r.kind ?? 'fate')} roll={r} still={still} />)}
    </div>
  )
}
