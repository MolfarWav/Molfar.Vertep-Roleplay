/**
 * Stage directions (Molfar.Vertep#368): text in [[double brackets]] inside the player's own message is cut out
 * of the words and sent to the model as an out-of-character instruction for that reply only.
 * The engine does the real cut (plugins/engine/plugin.js, `splitDirections`); this copy lets the page show a
 * message the way it will be stored while the send is still in flight. A test keeps the two in step.
 */
const DIRECTION_RE = /\[\[([^[\]]+)\]\](?!\()/g
export const DIRECTIONS_MAX = 8
export const DIRECTION_MAX_CHARS = 2000

export function splitDirections(text: string): { text: string; directions: string[] } {
  const directions: string[] = []
  const clean = String(text ?? '')
    .replace(DIRECTION_RE, (_all, inner: string) => {
      const d = String(inner).trim()
      if (d && directions.length < DIRECTIONS_MAX) directions.push(d.slice(0, DIRECTION_MAX_CHARS))
      return ' '
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  return { text: directions.length ? clean : String(text ?? ''), directions }
}

/** The typed form again: the words, then each direction as [[...]]. What the engine receives and splits. */
export function withDirections(text: string, directions: readonly string[]): string {
  const tail = directions.map((d) => `[[${d}]]`).join(' ')
  return [String(text ?? '').trim(), tail].filter(Boolean).join(' ')
}
