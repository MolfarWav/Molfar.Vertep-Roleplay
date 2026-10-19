// The Records tab's list logic (pure): kind filter, search over names and aliases, active first.

import type { WorldKind, WorldRecord } from '@/lib/world'

export const KINDS: WorldKind[] = ['person', 'place', 'group', 'thing', 'fact']
/** The text limits the plugin enforces: an active record, a retired one. */
export const TEXT_LIMIT = { active: 600, past: 240 } as const

export function filterRecords(records: WorldRecord[], kind: WorldKind | 'all', query: string): WorldRecord[] {
  const q = query.trim().toLowerCase()
  const hit = (r: WorldRecord) => !q || [r.name, ...r.aliases].some((n) => n.toLowerCase().includes(q))
  return records
    .filter((r) => (kind === 'all' || r.kind === kind) && hit(r))
    // active first; newest change first inside each group
    .sort((a, b) => (a.status === b.status ? b.at - a.at : a.status === 'active' ? -1 : 1))
}

export function countByKind(records: WorldRecord[]): Record<WorldKind | 'all', number> {
  const out: Record<WorldKind | 'all', number> = { all: records.length, person: 0, place: 0, group: 0, thing: 0, fact: 0 }
  for (const r of records) out[r.kind] += 1
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
