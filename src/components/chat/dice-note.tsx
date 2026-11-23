// A small mark under a reply that had a dice roll, when the chat shows them (World DM sheet, Dice).
import { useMemo } from 'react'
import { DiceFive, Globe, UsersThree } from '@phosphor-icons/react'
import { rollLine } from '@/components/world/dice-log'
import { useT } from '@/hooks/use-t'
import { useDiceLive, type WorldDiceRoll } from '@/lib/world'
import type { Message } from '@/lib/types'

/** The rolls that shaped the reply at `index` (swipe `swipe`): where each was made says which reply it belongs to. */
export function rollsFor(rolls: WorldDiceRoll[], messageId: string, index: number, swipe: number, before: string[] = []): WorldDiceRoll[] {
  const mine = rolls.filter((r) => {
    if (r.n === undefined || !r.inserted) return false
    // a return of the cast is found by the message it followed (`last`): the reply right after it, or after the one message of the player between (the player's line may be saved after the request was built, so the count `n` can be one short)
    if (r.kind === 'cast' && (r.op === 'send' || r.op === 'next')) return swipe === 0 && before.slice(0, 2).includes((r.last ?? '').split('#')[0] ?? '')
    // a sent reply: the roll was made when the chat had as many messages as its index, or one fewer when the player's line was saved
    // after the request was built (both orders happen in real chats; then `last` is the message before the player's line)
    if (r.op === 'send' || r.op === 'next') return swipe === 0 && (r.n === index || (r.n === index - 1 && !!before[1] && (r.last ?? '').split('#')[0] === before[1]))
    if (r.op === 'swipe') return r.n === index + 1 && (r.last ?? '').startsWith(`${messageId}#`) && r.lastSwipes === swipe
    if (r.op === 'continue') return r.n === index + 1 && r.last === `${messageId}#${swipe}`
    return false
  })
  // the newest of each kind: a retried reply rolled again
  const pick = (kind: WorldDiceRoll['kind']) => mine.filter((r) => r.kind === kind).sort((a, b) => b.at - a.at)[0]
  return [pick(undefined), pick('life'), pick('pace'), pick('cast')].filter((r): r is WorldDiceRoll => !!r)
}

export function DiceNote({ chatId, message, index, before = [] }: { chatId: string; message: Message; index: number; /** the ids of the messages just before this one, nearest first */ before?: string[] }) {
  const t = useT()
  const live = useDiceLive((s) => s.chats[chatId])
  const mine = useMemo(
    () => (live && (live.show || live.castShow) && message.role !== 'user' ? rollsFor(live.rolls, message.id, index, message.activeSwipe, before).filter((r) => (r.kind === 'cast' ? live.castShow : live.show)) : []),
    [live, message.id, message.role, message.activeSwipe, index, before.join('|')],
  )
  if (!mine.length) return null
  return (
    <div className="flex flex-col gap-0.5 px-4 py-1" data-testid="dice-note">
      {mine.map((r) => (
        <p key={r.at} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {r.kind === 'cast' ? <UsersThree className="size-3 shrink-0 text-primary" aria-hidden="true" /> : r.kind === 'life' || r.kind === 'pace' ? <Globe className="size-3 shrink-0 text-primary" aria-hidden="true" /> : <DiceFive className="size-3 shrink-0 text-primary" aria-hidden="true" />}
          <span>{rollLine(t, r)}</span>
        </p>
      ))}
    </div>
  )
}
