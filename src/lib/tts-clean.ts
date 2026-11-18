// What TTS reads. Kept apart from tts.ts (which pulls the engine bridge and the
// browser's `location`) so a test can run it as plain code.
import type { AppSettings } from './types'

/** The text TTS actually reads: the message minus what the switches skip,
 *  and minus markup. HTML tags come out BEFORE the quote pass: a tag's
 *  attribute values are quoted (style="color:#CC79A7") and would otherwise be
 *  narrated as dialogue by "only narrate quotes" (Molfar.Vertep#441). */
export function cleanedText(text: string, tts: AppSettings['tts']): string {
  let out = text
  if (tts.skipCodeblocks) out = out.replace(/```[\s\S]*?```/g, ' ')
  // comments and style/script blocks carry no speech at all, not even their body
  out = out.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  // a tag must start with a letter or "</", so "5 < 6" and "i <3 you" stay
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
  if (tts.skipAsterisks) out = out.replace(/\*[^*]*\*/g, ' ')
  if (tts.onlyQuotes) out = (out.match(/"([^"]*)"/g) ?? []).map((q) => q.slice(1, -1)).join('. ') || out
  return out.trim()
}
