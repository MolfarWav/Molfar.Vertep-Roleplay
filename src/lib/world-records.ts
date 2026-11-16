// The Records tab's list logic (pure): kind filter, search over names and aliases, active first.

import type { WorldKind, WorldRecord } from '@/lib/world'

/** The kinds the form offers and the book writes; an old note ('fact') is read and moved, never written. */
export const KINDS: WorldKind[] = ['person', 'place', 'group', 'thing']
/** What the book list can show: every active record, one kind, the old notes, what is not active (retired or tidied up), or the cards of the cast deck (not records: the list shows them itself). */
export type BookFilter = WorldKind | 'all' | 'archive' | 'cast'
/** The text limits the plugin enforces: an active record, a retired one. */
export const TEXT_LIMIT = { active: 600, past: 240 } as const

export function filterRecords(records: WorldRecord[], filter: BookFilter, query: string): WorldRecord[] {
  if (filter === 'cast') return []
  const q = query.trim().toLowerCase()
  const hit = (r: WorldRecord) => !q || [r.name, ...r.aliases, r.text].some((n) => n.toLowerCase().includes(q))
  return records
    .filter((r) => (filter === 'archive' ? r.status !== 'active' : r.status === 'active' && (filter === 'all' || r.kind === filter)) && hit(r))
    // the newest change first; old notes: the longest first, so what cannot go to the Litopys as it is comes up at once
    .sort((x, y) => (filter === 'fact' ? y.text.length - x.text.length : y.at - x.at))
}

export function countByKind(records: WorldRecord[]): Record<WorldKind | 'all' | 'archive', number> {
  const out: Record<WorldKind | 'all' | 'archive', number> = { all: 0, archive: 0, person: 0, place: 0, group: 0, thing: 0, fact: 0 }
  for (const r of records) {
    if (r.status !== 'active') out.archive += 1
    else { out.all += 1; out[r.kind] += 1 }
  }
  return out
}

/** "Mira, Mirka" -> ["Mira", "Mirka"]: trimmed, no empties, no repeats. */
export function parseAliases(s: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
    const k = a.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(a) }
  }
  return out
}
