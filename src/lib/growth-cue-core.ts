// When the story has probably changed a character, so the portrait ("How they changed") is worth a look (#450, triggers).
// The pure part: no network, no DOM, no model. It reads what Litopys and the Dashboard already know and says WHICH
// characters the story touched and why; a model is asked only when the player presses "Update portrait" (the hand
// button, `updateGrowthFromStory`). Three signals: a new turning point (Litopys), a relation class that moved
// (Dashboard), and a pivotal event (Dashboard), the last one at most once every PIVOTAL_GAP replies because the sensor
// calls about a quarter of a chat's events pivotal. A heavy injury is not a signal of its own: the Dashboard keeps it
// only as the text of a character's condition; the RPG app (#486) will bring it as data.
import type { Weight } from '@/lib/dashboard'

export type CueKind = 'turn' | 'relation' | 'pivotal'

export interface Cue {
  /** stable: the same thing found again has the same id */
  id: string
  kind: CueKind
  /** the Dashboard's or Litopys's names of the characters it touched (never the player's character) */
  names: string[]
  /** the line the player reads: what happened */
  text: string
}

/** What a chat remembers between looks: the cues already told, each character's last relation class, the reply count of the last cue. */
export interface CueMemory {
  v: 1
  told: string[]
  cls: Record<string, string>
  lastTurn: number
}

export interface CueInput {
  /** Litopys turning points of the chat */
  turns: readonly { id: string; text: string; cast?: string[] }[]
  /** the newest Dashboard snapshot, null when the Dashboard is off or has none */
  view: {
    key: string
    turn: number
    events: readonly { id: string; weight: Weight | string; from: string | null; to: string | null; quote: string }[]
    chars: Readonly<Record<string, { cls?: string } | undefined>>
  } | null
  mem: CueMemory | null
  /** the player's own names, never a cue's subject */
  userNames?: readonly string[]
}

export const PIVOTAL_GAP = 8
export const TOLD_KEEP = 200
const MAX_CUES = 3
const TEXT_MAX = 200

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const clip = (s: string) => (norm(s).length > TEXT_MAX ? `${norm(s).slice(0, TEXT_MAX - 1)}…` : norm(s))

export const emptyMemory = (): CueMemory => ({ v: 1, told: [], cls: {}, lastTurn: 0 })

/** Reads a stored memory back; anything broken is no memory. */
export function cleanMemory(raw: unknown): CueMemory | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<CueMemory>
  if (r.v !== 1) return null
  const clsIn = r.cls && typeof r.cls === 'object' ? r.cls : {}
  const cls: Record<string, string> = {}
  for (const [k, v] of Object.entries(clsIn)) if (typeof v === 'string') cls[k] = v
  return {
    v: 1,
    told: Array.isArray(r.told) ? r.told.filter((x): x is string => typeof x === 'string').slice(-TOLD_KEEP) : [],
    cls,
    lastTurn: Number.isFinite(r.lastTurn) ? Number(r.lastTurn) : 0,
  }
}

/**
 * The cues of this look and the memory to keep. With no memory yet this is the first look at the chat in this browser:
 * everything that is already there counts as known and nothing is said, so an old chat does not start with a pile of notices.
 */
export function detectCues(input: CueInput): { cues: Cue[]; mem: CueMemory } {
  const user = new Set((input.userNames ?? []).map((n) => n.toLowerCase()).concat('user'))
  const others = (names: readonly (string | null | undefined)[]) => [...new Set(names.filter((n): n is string => !!n && !user.has(n.toLowerCase())))]
  const turn = input.view?.turn ?? 0
  const cls: Record<string, string> = {}
  for (const [name, c] of Object.entries(input.view?.chars ?? {})) if (c && typeof c.cls === 'string' && c.cls) cls[name] = c.cls

  const first = input.mem === null
  const mem = input.mem ?? emptyMemory()
  const told = new Set(mem.told)
  const found: Cue[] = []

  for (const t of input.turns) {
    const id = `turn:${t.id}`
    if (told.has(id)) continue
    found.push({ id, kind: 'turn', names: others(t.cast ?? []), text: clip(t.text) })
  }
  for (const [name, now] of Object.entries(cls)) {
    const was = mem.cls[name]
    if (was === undefined || was === now || user.has(name.toLowerCase())) continue
    const id = `rel:${name}:${was}>${now}`
    if (!told.has(id)) found.push({ id, kind: 'relation', names: [name], text: `${was} → ${now}` })
  }
  if (input.view && turn - mem.lastTurn >= PIVOTAL_GAP) {
    const hit = input.view.events.filter((e) => e.weight === 'pivotal' && others([e.from, e.to]).length > 0)
    for (const e of hit) {
      const id = `ev:${input.view.key}:${e.id}:${e.from ?? ''}:${e.to ?? ''}`
      if (!told.has(id)) found.push({ id, kind: 'pivotal', names: others([e.from, e.to]), text: clip(e.quote) })
    }
  }

  const next: CueMemory = { v: 1, told: [...mem.told], cls: { ...mem.cls, ...cls }, lastTurn: mem.lastTurn }
  for (const c of found) next.told.push(c.id)
  next.told = next.told.slice(-TOLD_KEEP)
  if (first) {
    // the first look only learns what is there
    return { cues: [], mem: { ...next, lastTurn: turn } }
  }
  // strongest first: a turning point, then a relation, then the pivotal event; a character is told about once per look
  const order: Record<CueKind, number> = { turn: 0, relation: 1, pivotal: 2 }
  const cues: Cue[] = []
  const named = new Set<string>()
  for (const c of [...found].sort((a, b) => order[a.kind] - order[b.kind])) {
    if (cues.length >= MAX_CUES) break
    if (c.names.length && c.names.every((n) => named.has(n))) continue
    for (const n of c.names) named.add(n)
    cues.push(c)
  }
  if (cues.length) next.lastTurn = turn
  return { cues, mem: next }
}

/**
 * The cards a cue is about. A chat of one card (also one that voices several characters) is about that card whatever names the
 * story used; in a group only the members whose card name matches a cue's name, exactly or by its start ("Shiori" for
 * "Shiori - The President's Favorite"), are meant.
 */
export function cuesByCard(cues: readonly Cue[], cards: readonly { id: string; name: string }[]): { cardId: string; name: string; cues: Cue[] }[] {
  if (cards.length === 1) return cues.length ? [{ cardId: cards[0]!.id, name: cards[0]!.name, cues: [...cues] }] : []
  const same = (card: string, cue: string) => {
    const a = card.trim().toLowerCase()
    const b = cue.trim().toLowerCase()
    return a !== '' && b !== '' && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `) || a.startsWith(`${b} -`) || b.startsWith(`${a} -`))
  }
  const out: { cardId: string; name: string; cues: Cue[] }[] = []
  for (const card of cards) {
    const mine = cues.filter((c) => c.names.some((n) => same(card.name, n)))
    if (mine.length) out.push({ cardId: card.id, name: card.name, cues: mine })
  }
  return out
}
