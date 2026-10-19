import type { PromptSourcePart, PromptSourceSpan } from '@/lib/engine'

/**
 * The order the prompt board's "Request to the model" list shows its rows in: where each part
 * really sits in the request, not the order of the switches. A row's place is its first span
 * (msg -1 = the system prompt, then the messages). Litopys and the dashboard have no text in a
 * preview (they are added when a reply is generated): Litopys sits just above the history (its
 * story block; its facts ride below with the dashboard), the dashboard just after the history.
 * Rows with no place keep their board order, after the placed ones.
 */
export function requestOrder<T extends { item: { key: string } }>(
  rows: T[],
  parts: PromptSourcePart[] | undefined,
  spans: PromptSourceSpan[] | undefined,
): T[] {
  if (!parts || !spans || spans.length === 0) return rows
  const at = (msg: number, start: number) => (msg + 1) * 1e9 + start
  const first = new Map<string, number>()
  let historyStart = Infinity
  let historyEnd = -Infinity
  for (const s of spans) {
    const key = parts[s.part]?.key
    if (!key) continue
    const pos = at(s.msg, s.start)
    if (!first.has(key) || pos < (first.get(key) as number)) first.set(key, pos)
    if (key === 'history') {
      historyStart = Math.min(historyStart, pos)
      historyEnd = Math.max(historyEnd, at(s.msg, s.end))
    }
  }
  const place = (key: string): number | undefined => {
    if (first.has(key)) return first.get(key)
    if (key === 'plugin:litopys' && historyStart !== Infinity) return historyStart - 0.5
    if (key === 'plugin:relations' && historyEnd !== -Infinity) return historyEnd + 0.5
    return undefined
  }
  return rows
    .map((row, i) => ({ row, i, pos: place(row.item.key) }))
    .sort((a, b) => (a.pos ?? Infinity) - (b.pos ?? Infinity) || a.i - b.i)
    .map(x => x.row)
}
