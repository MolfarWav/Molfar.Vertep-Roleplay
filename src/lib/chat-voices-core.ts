// The pure part of the chat voices (no engine, no store): the people the plugin lists and the voices a message is painted by.

import { voiceMatcher, type DialogueVoice, type VoiceMatcher } from './dialogue-voices'

export interface VoicePerson {
  id: string
  name: string
  aliases: string[]
  /** '' while the chat does not use voice colours */
  color: string
  /** picked by the user: a spread leaves it alone */
  hand: boolean
}

export interface ChatVoices {
  mode: 'auto' | 'on' | 'off'
  /** false: the chat does not paint voices (a one-person chat until the user turns it on) */
  active: boolean
  people: VoicePerson[]
}

export type VoiceOp =
  | { op: 'on' | 'off' | 'auto' | 'spread'; all?: boolean }
  | { op: 'set'; id: string; color: string }
  | { op: 'unset'; id: string }

/** One matcher over all the spellings of a person: the first place any of them is said. */
function anyOf(names: string[]): VoiceMatcher | null {
  const ms = names.map((n) => voiceMatcher(n)).filter((m): m is VoiceMatcher => !!m)
  if (!ms.length) return null
  const exec = (text: string) => {
    let best: { index: number } | null = null
    for (const m of ms) {
      const r = m.exec(text)
      if (r && (!best || r.index < best.index)) best = r
    }
    return best
  }
  return { exec, test: (text) => exec(text) !== null }
}

/** Does the chat leave the voices alone? In the automatic mode a card whose author or owner chose a dialogue colour keeps it:
 *  the colours are handed out only where nobody chose. The switch turned on by hand ('on') always paints. */
export function leavesVoicesAlone(v: ChatVoices | null | undefined, cardColor: boolean): boolean {
  return !!v && v.mode === 'auto' && cardColor
}

/** The voices a chat paints its messages by: its people, each with the colour kept for them; empty when the chat uses none
 *  (or the card has its own dialogue colour and the mode is automatic, see leavesVoicesAlone). */
export function peopleVoices(v: ChatVoices | null | undefined, opts: { cardColor?: boolean } = {}): DialogueVoice[] {
  if (!v?.active || leavesVoicesAlone(v, !!opts.cardColor)) return []
  const out: DialogueVoice[] = []
  for (const p of v.people) {
    if (!p.color) continue
    const match = anyOf([p.name, ...p.aliases])
    if (match) out.push({ name: p.name, color: p.color, match })
  }
  return out
}
