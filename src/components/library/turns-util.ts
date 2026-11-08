// Pure helpers of the Turning points tab (#288): no React, so they are tested without a DOM.
import { isGroupToken } from '@/lib/known-by'
import type { LitChat, LitTurn } from './litopys-api'

export const TURN_CHARS = 450
export const STANCE_CHARS = 120
export const STANCES_MAX = 6

/** Turning points the story still stands on: not undone by a later one. */
export const activeTurnCount = (turns: LitTurn[] | undefined): number => (turns ?? []).filter((x) => !x.overriddenBy).length

const idNo = (id: string) => Number(/\d+/.exec(id)?.[0] ?? 0)

/** Story order: oldest first (ties by the number in the id). */
export const sortTurns = (turns: LitTurn[] | undefined): LitTurn[] => [...(turns ?? [])].sort((a, b) => a.at - b.at || idNo(a.id) - idNo(b.id))

/** The first words of a text, cut at a word, for "Undone by ..." and "Undoes: ..."; the whole text when it is short. */
export function firstWords(text: string, max = 48): string {
  const s = text.replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return (at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:.\-–—]+$/, '') + '…'
}

/** An editor row: a name and its one-line feeling. */
export interface StanceRow {
  who: string
  line: string
}

export const stanceRowsOf = (stances: Record<string, string> | undefined): StanceRow[] => Object.entries(stances ?? {}).map(([who, line]) => ({ who, line }))

/** Rows back to the map the route takes: a row missing its name or its line is dropped, a repeated name keeps the last line. */
export function stancesOfRows(rows: StanceRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    const who = r.who.trim()
    const line = r.line.replace(/\s+/g, ' ').trim()
    if (!who || !line) continue
    for (const k of Object.keys(out)) if (k.toLowerCase() === who.toLowerCase()) delete out[k]
    out[who] = line
  }
  return out
}

export function sameStances(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => b[k] === a[k])
}

export function sameKnown(a: string[] | 'all', b: string[] | 'all'): boolean {
  if (a === 'all' || b === 'all') return a === b
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/** Every person's name the record mentions (facts, stances, who knows, a cast), once each, for the "Known to" picker. Group tokens stay out. */
export function turnNames(chat: Pick<LitChat, 'facts'> & { turns?: LitTurn[] }): string[] {
  const map = new Map<string, string>()
  const add = (n: string) => {
    const name = n.trim()
    if (name && name.toLowerCase() !== 'world' && !isGroupToken(name) && !map.has(name.toLowerCase())) map.set(name.toLowerCase(), name)
  }
  for (const f of chat.facts) {
    add(f.subject)
    if (Array.isArray(f.knownBy)) f.knownBy.forEach(add)
  }
  for (const x of chat.turns ?? []) {
    for (const n of x.cast ?? []) add(n)
    if (Array.isArray(x.knownBy)) x.knownBy.forEach(add)
    Object.keys(x.stances ?? {}).forEach(add)
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/** The Undo on an Activity row "found a turning point": only for one the worker added, still there and not touched since. */
export const canUndoFoundTurn = (turn: LitTurn | undefined): turn is LitTurn => !!turn && turn.origin === 'chapter' && !turn.edited
