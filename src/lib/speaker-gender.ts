// Who "she" is in a reply: the pronouns of a line say which gender speaks, and a voice that was named next to a pronoun
// earlier in the same reply has that gender. Used by the dialogue colours (markdown.tsx `lineSpeakers`) when a quote's own
// line names nobody: "— No, — she said." after "Rhea steps forward." (Molfar.Vertep#477, #130).
import type { DialogueVoice } from './dialogue-voices'

export type Gender = 'f' | 'm'

// Only pronouns, whole words, in English, Russian and Ukrainian. Forms that are also another word are left out
// (Russian "им", "ними", "её" is kept: it is also the possessive, which still says who the owner is).
const FEMALE = ['she', 'her', 'hers', 'herself', 'она', 'её', 'ее', 'ей', 'неё', 'нее', 'ею', 'вона', 'її', 'їй', 'нею']
const MALE = ['he', 'his', 'him', 'himself', 'он', 'его', 'ему', 'него', 'нём', 'нем', 'він', 'його', 'йому', 'нього', 'ньому']

const WORD = /\p{L}[\p{L}'’]*/gu
const FEM = new Set(FEMALE)
const MAS = new Set(MALE)

/** The gender the pronouns of a text point at, or null when there are none or both genders appear. */
export function genderCue(text: string): Gender | null {
  let f = 0
  let m = 0
  for (const w of text.toLowerCase().matchAll(WORD)) {
    if (FEM.has(w[0])) f++
    else if (MAS.has(w[0])) m++
  }
  return f > 0 && m === 0 ? 'f' : m > 0 && f === 0 ? 'm' : null
}

/** What was learned so far in one reply: a voice's name and the gender its pronouns showed. */
export type GenderBook = Map<string, Gender>

/** A line that names exactly one voice and carries pronouns of one gender teaches that voice's gender (the first lesson stays). */
export function learnGender(line: string, voices: DialogueVoice[], book: GenderBook): void {
  const named = voices.filter((v) => v.match.test(line))
  if (named.length !== 1) return
  const g = genderCue(line)
  if (g && !book.has(named[0]!.name)) book.set(named[0]!.name, g)
}

/** The one voice known to have this gender, or null when none or several do. */
export function voiceOfGender(g: Gender, voices: DialogueVoice[], book: GenderBook): DialogueVoice | null {
  const hits = voices.filter((v) => book.get(v.name) === g)
  return hits.length === 1 ? hits[0]! : null
}
