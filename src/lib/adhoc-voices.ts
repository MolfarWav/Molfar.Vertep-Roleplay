// A speaker the chat's people list does not know. The registry only holds the names the Dashboard's sensor has reported, so
// a person who has just walked into the scene ("— Здесь пахнет железом, — говорит Эш") would speak in the base colour, the same
// as everyone else without a colour (Molfar.Vertep#477). Such a speaker is read off the line itself: a capitalised name right
// beside a speech verb. It gets a colour that depends on the name only (the same in every message and every session, nothing
// to store), kept apart from the colours the chat already uses.
import { voiceMatcher, type DialogueVoice } from './dialogue-voices'

// Speech verbs: Russian and Ukrainian by stem (the endings vary), English by form. Not a complete list on purpose: a verb
// that is missing only leaves the speaker uncoloured, as before; a wrong one would colour a stranger.
const STEMS = [
  // ru
  'говор', 'произнос', 'произнес', 'произнёс', 'сказ', 'скаж', 'отвеч', 'ответ', 'спрос', 'спраш', 'шепч', 'шепн', 'шепот', 'крикн', 'крича', 'кричи', 'воскли',
  'бормоч', 'пробормо', 'буркн', 'бросает', 'бросил', 'добавл', 'поясн', 'замеча', 'замет', 'заяв', 'объясн', 'уточн', 'предлож', 'прошипе', 'шипит', 'рычит',
  'проворч', 'фыркн', 'хмыкн', 'выдыха', 'вздыха', 'процеди', 'цедит', 'огрыза', 'огрызн', 'возраж', 'настаива', 'продолж', 'перебива', 'перебил', 'молвит', 'роняет', 'уронил',
  // uk
  'каже', 'кажу', 'мовив', 'мовит', 'мовила', 'відпов', 'запит', 'спита', 'пита', 'прошепо', 'шепоч', 'вигук', 'пробурм', 'кинув', 'кинула', 'додав', 'пояс', 'зауваж', 'запропон',
  'прошип', 'прогарч', 'фирк', 'хмик', 'видихн', 'зітхн', 'процід', 'огриз', 'заперечи', 'наполяг', 'перебив',
]
const EN = new Set([
  'said', 'says', 'asked', 'asks', 'replied', 'replies', 'whispered', 'whispers', 'muttered', 'mutters', 'shouted', 'shouts', 'called', 'calls', 'answered', 'answers',
  'murmured', 'murmurs', 'snapped', 'snaps', 'added', 'adds', 'continued', 'continues', 'hissed', 'hisses', 'growled', 'growls', 'sighed', 'sighs', 'cried', 'cries',
  'exclaimed', 'remarked', 'remarks', 'told', 'tells', 'breathed', 'drawled', 'offered', 'suggested', 'demanded', 'states', 'stated', 'speaks', 'spoke',
])
// capitalised words that are not names: pronouns, and what a sentence often opens with
const NOT_NAMES = new Set([
  'она', 'он', 'они', 'оно', 'вона', 'він', 'вони', 'воно', 'she', 'he', 'they', 'it', 'i', 'we', 'you', 'the', 'a', 'and', 'but', 'then', 'so', 'her', 'his',
  'тогда', 'затем', 'потом', 'вдруг', 'наконец', 'просто', 'пока', 'тут', 'там', 'здесь', 'так', 'и', 'но', 'а', 'же', 'ведь', 'потім', 'раптом', 'нарешті', 'тоді', 'тут', 'там', 'ось',
  'кто', 'что', 'это', 'эй', 'ну', 'вот', 'хм', 'ах', 'ох', 'мне', 'тебе', 'ему', 'ей', 'нам', 'вам', 'им', 'мені', 'тобі', 'йому', 'їй', 'нам', 'вам', 'їм',
])

const WORD = /\p{L}[\p{L}'’-]*/gu

export const isSpeechVerb = (w: string): boolean => {
  const l = w.toLowerCase()
  return EN.has(l) || STEMS.some((s) => l.startsWith(s))
}
const isCapital = (w: string): boolean => w[0] !== w[0]!.toLowerCase() && w[0] === w[0]!.toUpperCase() && w.length >= 2 && !NOT_NAMES.has(w.toLowerCase())

/** The name of the speaker a line's own words give: a capitalised name right after a speech verb ("говорит Эш", "said Bo")
 *  or right before one ("Эш говорит", "Bo said"); up to two capitalised words ("Каел Ворн"). null when there is none. */
export function speakerNameIn(text: string): string | null {
  const toks = [...text.matchAll(WORD)].map((m) => m[0])
  for (let i = 0; i < toks.length; i++) {
    if (!isSpeechVerb(toks[i]!)) continue
    // after the verb
    if (i + 1 < toks.length && isCapital(toks[i + 1]!)) {
      return i + 2 < toks.length && isCapital(toks[i + 2]!) && !isSpeechVerb(toks[i + 2]!) ? `${toks[i + 1]} ${toks[i + 2]}` : toks[i + 1]!
    }
    // before the verb
    if (i >= 1 && isCapital(toks[i - 1]!) && !isSpeechVerb(toks[i - 1]!)) {
      return i >= 2 && isCapital(toks[i - 2]!) && !isSpeechVerb(toks[i - 2]!) ? `${toks[i - 2]} ${toks[i - 1]}` : toks[i - 1]!
    }
  }
  return null
}

const hue = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

const fromHue = (h: number): string => {
  const s = 0.55
  const l = 0.66
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const m = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(m - 3, 9 - m, 1)))).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** A colour for a name: its own hue from the name's letters, moved on in steps until it is at least 28 degrees from every
 *  colour in use. The same name and the same neighbours always give the same colour. */
export function adhocColor(name: string, taken: string[]): string {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360
  const used = taken.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map(hue)
  for (let step = 0; step < 24; step++) {
    const cand = (h + step * 29) % 360
    if (used.every((u) => Math.min(Math.abs(u - cand), 360 - Math.abs(u - cand)) >= 28)) return fromHue(cand)
  }
  return fromHue(h)
}

/** The voice of a speaker found in a line: matched by name like any other, coloured away from the voices already in use. */
export function adhocVoice(name: string, inUse: DialogueVoice[]): DialogueVoice | null {
  const match = voiceMatcher(name)
  if (!match) return null
  return { name, color: adhocColor(name, inUse.map((v) => v.color)), match }
}
