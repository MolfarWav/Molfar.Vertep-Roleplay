// A small mark under a reply that had a dice roll, when the chat shows them (World DM sheet, Dice).
import { useMemo } from 'react'
import { DiceFive, Globe } from '@phosphor-icons/react'
import { rollLine } from '@/components/world/dice-log'
import { useT } from '@/hooks/use-t'
import { useDiceLive, type WorldDiceRoll } from '@/lib/world'
import type { Message } from '@/lib/types'

/** The rolls that shaped the reply at `index` (swipe `swipe`): where each was made says which reply it belongs to. */
export function rollsFor(rolls: WorldDiceRoll[], messageId: string, index: number, swipe: number): WorldDiceRoll[] {
  const mine = rolls.filter((r) => {
    if (r.n === undefined || !r.inserted) return false
    if (r.op === 'send' || r.op === 'next') return r.n === index && swipe === 0
    if (r.op === 'swipe') return r.n === index + 1 && (r.last ?? '').startsWith(`${messageId}#`) && r.lastSwipes === swipe
    if (r.op === 'continue') return r.n === index + 1 && r.last === `${messageId}#${swipe}`
    return false
  })
  // the newest of each kind: a retried reply rolled again
  const pick = (life: boolean) => mine.filter((r) => (r.kind === 'life') === life).sort((a, b) => b.at - a.at)[0]
  return [pick(false), pick(true)].filter((r): r is WorldDiceRoll => !!r)
}

export function DiceNote({ chatId, message, index }: { chatId: string; message: Message; index: number }) {
  const t = useT()
  const live = useDiceLive((s) => s.chats[chatId])
  const mine = useMemo(
    () => (live?.show && message.role !== 'user' ? rollsFor(live.rolls, message.id, index, message.activeSwipe) : []),
    [live, message.id, message.role, message.activeSwipe, index],
  )
  if (!mine.length) return null
  return (
    <div className="flex flex-col gap-0.5 px-4 py-1" data-testid="dice-note">
      {mine.map((r) => (
        <p key={r.at} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {r.kind === 'life' ? <Globe className="size-3 shrink-0 text-primary" aria-hidden="true" /> : <DiceFive className="size-3 shrink-0 text-primary" aria-hidden="true" />}
          <span>{rollLine(t, r)}</span>
        </p>
      ))}
    </div>
  )
}
