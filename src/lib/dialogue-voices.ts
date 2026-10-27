import type { Character } from '@/lib/types'

/** Finds where a voice's name is said in a text. */
export type VoiceMatcher = { exec(text: string): { index: number } | null; test(text: string): boolean }

/** Who a group's dialogue belongs to, by name, and the colour it takes. */
export type DialogueVoice = { name: string; color: string; match: VoiceMatcher }

/** Colours a member takes when neither the group nor its card names one. */
export const VOICE_PALETTE = ['#e06c75', '#e5c07b', '#98c379', '#56b6c2', '#61afef', '#c678dd', '#d19a66', '#abb2bf']

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', ё: 'e', є: 'e', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}
const CYRILLIC = /[\u0400-\u04ff]/
const LATIN = /[a-z]/i

/** A word as it sounds, for comparing a name across scripts: Cyrillic as Latin, then spelling variants
 *  folded (Isabella and Изабелла both give "isabela", Rhea and Рея both give "rea"). */
export function soundKey(word: string): string {
  let out = ''
  for (const ch of word.toLowerCase()) out += CYR_TO_LAT[ch] ?? ch
  return out
    .normalize('NFD')
    .replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/[cq]/g, 'k')
    .replace(/z/g, 's')
    .replace(/w/g, 'v')
    .replace(/[hy]/g, '')
    .replace(/(.)\1+/g, '$1')
}

const oneEdit = (a: string, b: string): boolean => {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length < b.length ? a.slice(i) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i)
}

/** Does a word of the text say the name's word, spelled in the other script? The word must open with a capital;
 *  an ending of up to two letters is allowed (Рея, Рее, Рею for Rhea); a long name may differ by one letter. */
function soundsLike(word: string, nameKey: string): boolean {
  if (!/^\p{Lu}/u.test(word)) return false
  const k = soundKey(word)
  if (!k || !nameKey) return false
  if (k === nameKey) return true
  const stem = /[aeiou]$/.test(nameKey) && nameKey.length >= 3 ? nameKey.slice(0, -1) : nameKey
  if (k.startsWith(stem) && k.length <= stem.length + (stem.length >= 3 ? 2 : 1)) return true
  return nameKey.length >= 5 && k.length >= 5 && oneEdit(k, nameKey)
}

const WORD = /\p{L}[\p{L}'’]*/gu

/** A whole-word match on the name's first word. A name of 3+ letters ending in a vowel also
 *  matches its inflected forms (Єва: Єви, Єві, Євою), so a Ukrainian narration still finds it. A name
 *  in one script is also found written in the other (Ember in a Russian narration: Эмбер, Изабелла for Isabella). */
export function voiceMatcher(name: string): VoiceMatcher | null {
  const word = name.trim().split(/\s+/)[0] ?? ''
  if (word.length < 2) return null
  const stem = word.length >= 3 && /[aeiouyаеєиіїоуюя]$/i.test(word) ? word.slice(0, -1) : word
  const tail = stem === word ? "(?:'s|’s)?" : '\\p{L}{0,2}'
  const same = new RegExp(`(?<![\\p{L}\\p{N}])${esc(stem)}${tail}(?![\\p{L}\\p{N}])`, 'u')
  const key = soundKey(word)
  // a name in a single script is also said in the other one
  const here = CYRILLIC.test(word) ? CYRILLIC : LATIN
  const there = here === CYRILLIC ? LATIN : CYRILLIC
  const crosses = (w: string) => there.test(w) && !here.test(w)
  const exec = (text: string): { index: number } | null => {
    let at = same.exec(text)?.index ?? Infinity
    if (key.length >= 2) {
      for (const m of text.matchAll(WORD)) {
        if (m.index >= at) break
        if (crosses(m[0]) && soundsLike(m[0], key)) { at = m.index; break }
      }
    }
    return at === Infinity ? null : { index: at }
  }
  return { exec, test: (text) => exec(text) !== null }
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

/** The voice a line opens with as a speaker label: `Name:`, `**Name:**`, `**Name**:` (the text of the
 *  line, markup gone, starts with the name and a colon). It beats a name that only appears in the line. */
export function leadVoiceIn(line: string, voices: DialogueVoice[]): DialogueVoice | null {
  const label = leadLabelIn(line)
  if (label) for (const v of voices) if (v.match.exec(label)?.index === 0) return v
  // a name of several words ("Bo Lin:") leads only as a whole: "Bo says:" is not a label
  for (const v of voices) {
    if (/\s/.test(v.name.trim()) && new RegExp(`^[\\s*_~"“«(\\[]*${v.name.trim().split(/\s+/).map(escRe).join('\\s+')}[\\s*_~)\\]]*[:：]`, 'iu').test(line)) return v
  }
  return null
}

const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The one-word speaker label a line opens with (`Name:`, `**Name:**`), or null. */
export function leadLabelIn(line: string): string | null {
  return /^[\s*_~"“«(\[]*(\p{L}[\p{L}'’]*)[\s*_~)\]]*[:：]/u.exec(line)?.[1] ?? null
}

/** Does the line open like a speaker label of one to three words (`Mary Jane:`)? Whose it is does not matter. */
export const opensWithLabel = (line: string): boolean => /^[\s*_~"“«(\[]*\p{L}[\p{L}'’]*(?:[ \u00a0]\p{L}[\p{L}'’]*){0,2}[\s*_~)\]]*[:：]/u.test(line)

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

/** The voices a single card speaks with (its `voices` list: a Narrator card that plays several
 *  characters). A voice without a colour takes the palette's by position. Empty: the card has none. */
export function cardVoices(card: Pick<Character, 'voices'>): DialogueVoice[] {
  const out: DialogueVoice[] = []
  ;(card.voices ?? []).forEach((v, i) => {
    const match = voiceMatcher(v.name)
    if (match) out.push({ name: v.name, color: v.color || VOICE_PALETTE[i % VOICE_PALETTE.length]!, match })
  })
  return out
}

/** A member's colour as dialogue ink: the palette is made for dark backgrounds, so on a light
 *  theme it is mixed toward the theme's text colour (`--voice-keep` in globals.css) and a
 *  pale yellow stays readable; the hue is kept. */
export const voiceInk = (color: string) => `color-mix(in oklab, ${color} var(--voice-keep, 100%), var(--foreground))`
