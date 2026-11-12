// Skip time (src/components/chat/time-skip-dialog.tsx): the pure parts. Like "Continue from someone's view" it is a
// stage direction sent alone ([[...]]): nobody in the story hears it and no words of the player's go into the chat.
// The Dashboard clock follows from the reply that narrates the jump, so nothing else is stored.

export const TIME_UNITS = ['minute', 'hour', 'day', 'week', 'month', 'year'] as const
export type TimeUnit = (typeof TIME_UNITS)[number]

export const AMOUNT_MAX = 999
const NOTE_MAX = 300

/** How long the jump is: "1 hour", "3 days"; '' when there is no usable amount. */
export function spanText(amount: number, unit: TimeUnit): string {
  const n = Math.floor(amount)
  if (!Number.isFinite(n) || n < 1) return ''
  const k = Math.min(n, AMOUNT_MAX)
  return `${k} ${unit}${k === 1 ? '' : 's'}`
}

/**
 * The direction for a jump of `amount` units and/or a free note ("until morning"). Brackets are cut out of the note so
 * it cannot end the direction early. Null when there is neither an amount nor a note.
 */
export function timeSkipDirection(amount: number, unit: TimeUnit, note: string): string | null {
  const span = spanText(amount, unit)
  const clean = note.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX)
  if (!span && !clean) return null
  const head = `Time skip: ${span || clean.replace(/[.!?]+$/, '')}.`
  const tail = ' Jump straight past the gap (a line or two on what changed is enough) and continue the story from the moment it ends; show the new time of day.'
  return `[[${head}${span && clean ? ` ${clean.replace(/[.!?]+$/, '')}.` : ''}${tail}]]`
}
