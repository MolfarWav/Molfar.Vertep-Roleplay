import type { Character } from '@/lib/types'

/** Who a group's dialogue belongs to, by name, and the colour it takes. */
export type DialogueVoice = { name: string; color: string; match: RegExp }

/** Colours a member takes when neither the group nor its card names one. */
export const VOICE_PALETTE = ['#e06c75', '#e5c07b', '#98c379', '#56b6c2', '#61afef', '#c678dd', '#d19a66', '#abb2bf']

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A whole-word match on the name's first word. A name of 3+ letters ending in a vowel also
 *  matches its inflected forms (Єва: Єви, Єві, Євою), so a Ukrainian narration still finds it. */
export function voiceMatcher(name: string): RegExp | null {
  const word = name.trim().split(/\s+/)[0] ?? ''
  if (word.length < 2) return null
  const stem = word.length >= 3 && /[aeiouyаеєиіїоуюя]$/i.test(word) ? word.slice(0, -1) : word
  const tail = stem === word ? "(?:'s|’s)?" : '\\p{L}{0,2}'
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc(stem)}${tail}(?![\\p{L}\\p{N}])`, 'u')
}

/** The voice whose name comes first in the text, or null. */
export function firstVoiceIn(text: string, voices: DialogueVoice[]): DialogueVoice | null {
  let best: DialogueVoice | null = null
  let at = Infinity
  for (const v of voices) {
    const m = v.match.exec(text)
    if (m && m.index < at) { at = m.index; best = v }
  }
  return best
}

/** Each member's dialogue colour in a group: the group's choice, else the card's, else the palette's by position. */
export function memberColor(group: Character, member: Character): string {
  const g = group.group
  const ids = g?.memberIds ?? []
  const set = g?.memberSettings?.[member.id]?.color
  if (set) return set
  if (member.colors?.dialogue) return member.colors.dialogue
  const i = Math.max(0, ids.indexOf(member.id))
  return VOICE_PALETTE[i % VOICE_PALETTE.length]!
}

/** The voices a narrator's message is coloured by; empty when the group turned colours off. */
export function groupVoices(group: Character, characters: Character[]): DialogueVoice[] {
  const g = group.group
  if (!g || g.colorDialogue === false) return []
  const out: DialogueVoice[] = []
  for (const id of g.memberIds) {
    const c = characters.find((x) => x.id === id && !x.isGroup)
    const match = c ? voiceMatcher(c.name) : null
    if (c && match) out.push({ name: c.name, color: memberColor(group, c), match })
  }
  return out
}
