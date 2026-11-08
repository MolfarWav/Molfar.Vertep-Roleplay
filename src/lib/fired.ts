// Pure (no engine import, so tests can load it); the loader is in fired-load.ts.
// "What fired" (#253): what the lorebooks, Litopys and the Data Bank put into the prompt of the last reply, and in how many replies
// of the whole chat. The plugins keep ids and counters only (`fired-log/<chatId>.json`, `litopys/fired/<chatId>.json`); the
// numbers and rows here are those files, grouped for the panel.

import type { WIBlockedRow, WIFiredRow } from '@/lib/engine'
import { buildReport, type MemoryTrace, type TracePerson } from '@/lib/memory-trace'

/** The newest reply's rows, as the engine plugin's `last` (the same row shape as the lorebook status). */
export interface FiredLast {
  gen: string
  at: number
  /** the number of this reply in the count */
  reply: number
  /** who spoke */
  by: string
  /** chars the lorebooks used and their budget */
  used: number
  budget: number
  scanDepth: number
  fired: WIFiredRow[]
  skipped: WIFiredRow[]
  blocked: WIBlockedRow[]
}
export interface LoreCount {
  n: number
  /** the number of the reply that counted it last */
  at: number
  t: string
  b: string
  v: { key?: number; vector?: number; sticky?: number }
  best?: number
}
export interface BankCount {
  n: number
  at: number
  f: string
  p: number
  best?: number
}
export interface FiredLog {
  v: 1
  since: number
  replies: number
  at: number
  lore: Record<string, LoreCount>
  bank: Record<string, BankCount>
  last: FiredLast | null
}

export interface LitFiredFact { id: string; n: number; at: number; gone: boolean; text: string; by: 'all' | TracePerson[] }
export interface LitFiredChapter { id: string; n: number; at: number; gone: boolean; label: string; text: string }
/** How often the far part of a long backstory went in (#288), and what it held the last time. */
export interface LitFiredFar { n: number; at: number; chats: number; first: number; last: number; tokens: number; turns: number; facts: number; units: number }
export interface LitFired {
  far?: LitFiredFar | null
  since: number
  replies: number
  factsTotal: number
  chaptersTotal: number
  facts: LitFiredFact[]
  chapters: LitFiredChapter[]
}

/** The most rows one list of the "whole chat" view shows (the plugin sends at most 30 of Litopys's). */
export const MAX_ROWS = 30

export interface LoreGroups {
  vector: WIFiredRow[]
  key: WIFiredRow[]
  sticky: WIFiredRow[]
  constant: WIFiredRow[]
  /** matched, but held back: a delay, a cooldown, a chance, a group, the secondary keys ... */
  held: WIBlockedRow[]
  /** matched and fitted the rules, but the lorebook budget was spent */
  cut: WIFiredRow[]
}

/** The newest reply's lorebook rows, one list per way in. A hit by meaning comes first inside its list (the closest first). */
export function loreGroups(last: FiredLast): LoreGroups {
  const by = (via: WIFiredRow['via']) => last.fired.filter((r) => r.via === via)
  return {
    vector: by('vector').sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    key: by('key'),
    sticky: by('sticky'),
    constant: by('constant'),
    held: last.blocked,
    cut: last.skipped,
  }
}

/** Tokens of a row, as the lorebook panel counts them (four characters a token). */
export const rowTokens = (r: { chars: number }): number => Math.ceil(r.chars / 4)

export function constantTokens(rows: WIFiredRow[]): number {
  return rows.reduce((n, r) => n + rowTokens(r), 0)
}

/** The entries the whole-chat view lists: the most often first, then the latest. */
export function topLore(log: FiredLog, limit = MAX_ROWS): { id: string; e: LoreCount }[] {
  return Object.entries(log.lore)
    .map(([id, e]) => ({ id, e }))
    .sort((a, b) => b.e.n - a.e.n || b.e.at - a.e.at)
    .slice(0, limit)
}
export function topBank(log: FiredLog, limit = MAX_ROWS): { id: string; e: BankCount }[] {
  return Object.entries(log.bank)
    .map(([id, e]) => ({ id, e }))
    .sort((a, b) => b.e.n - a.e.n || b.e.at - a.e.at)
    .slice(0, limit)
}

/** How many replies ago a count last moved: 0 = the newest reply. */
export const repliesAgo = (log: { replies: number }, at: number): number => Math.max(0, log.replies - at)

/** The fraction of the counted replies an entry went into, 0 to 1. */
export const share = (n: number, replies: number): number => (replies > 0 ? Math.min(1, n / replies) : 0)

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/** The report a tester or Claude reads: the lorebook part (the last reply and the counts), then the memory trace as the
 *  Canvas view writes it. Plain English, ids beside names. */
export function buildFiredReport(title: string, log: FiredLog | null, trace: MemoryTrace | null, lit: LitFired | null, now = Date.now()): string {
  const out: string[] = []
  out.push(`What fired${title ? `: ${title}` : ''}`)
  if (!log) {
    out.push('Lorebooks and Data Bank: no record yet (no reply since the update).')
  } else {
    out.push(`Counted: ${log.replies} replies since ${new Date(log.since).toISOString().slice(0, 10)} (approximate)`)
    const last = log.last
    if (last) {
      out.push('', `Last reply: ${last.gen} by ${last.by || 'unknown'}, ${Math.max(0, Math.round((now - last.at) / 1000))} s before this report`)
      out.push(`Lorebook budget: ~${Math.round(last.used / 4)} of ~${Math.round(last.budget / 4)} tokens`)
      const g = loreGroups(last)
      const row = (r: WIFiredRow) => `- ${r.title} [${r.book}] ${r.via === 'key' ? `key "${r.key ?? ''}"${r.secondary?.length ? ` + ${r.secondary.join(', ')}` : ''}` : r.via === 'vector' ? `by meaning ${(r.score ?? 0).toFixed(2)}` : r.via} ~${rowTokens(r)} tok.`
      out.push('', `By meaning (${g.vector.length}):`, ...(g.vector.length ? g.vector.map(row) : ['- none']))
      out.push('', `By key (${g.key.length}):`, ...(g.key.length ? g.key.map(row) : ['- none']))
      out.push('', `Sticky (${g.sticky.length}):`, ...(g.sticky.length ? g.sticky.map(row) : ['- none']))
      out.push('', `Always on (${g.constant.length}, ~${constantTokens(g.constant)} tok.):`, ...g.constant.map((r) => `- ${r.title} [${r.book}]`))
      out.push('', `Held back (${g.held.length}):`, ...(g.held.length ? g.held.map((r) => `- ${r.title} [${r.book}] ${r.reason}${r.detail != null ? ` (${r.detail})` : ''}${r.via === 'vector' ? ` by meaning ${(r.score ?? 0).toFixed(2)}` : ''}`) : ['- none']))
      out.push('', `Over the budget (${g.cut.length}):`, ...(g.cut.length ? g.cut.map(row) : ['- none']))
    }
    const lore = topLore(log)
    out.push('', `Lorebook entries by replies they went into (top ${lore.length} of ${Object.keys(log.lore).length}):`, ...(lore.length ? lore.map(({ e }) => `- ${e.t} [${e.b}] ${e.n}/${log.replies} (key ${e.v.key ?? 0}, meaning ${e.v.vector ?? 0}, sticky ${e.v.sticky ?? 0})`) : ['- none']))
    const bank = topBank(log)
    out.push('', `Data Bank passages by replies they went into (top ${bank.length} of ${Object.keys(log.bank).length}):`, ...(bank.length ? bank.map(({ e }) => `- ${e.f} #${e.p} ${e.n}/${log.replies}${e.best ? ` best ${e.best}` : ''}`) : ['- none']))
  }
  if (lit) {
    out.push('', `Litopys facts by replies they went into (top ${lit.facts.length} of ${lit.factsTotal}):`, ...(lit.facts.length ? lit.facts.map((f) => `- ${f.id} ${f.n}/${lit.replies} ${f.gone ? '(removed since)' : cut(f.text, 120)}`) : ['- none']))
    if (lit.far) out.push('', `Litopys far backstory (chats ${lit.far.first === lit.far.last ? lit.far.first : `${lit.far.first}-${lit.far.last}`}, condensed): ${lit.far.n}/${lit.replies} replies, last time ~${lit.far.tokens} tok.: ${lit.far.turns} turning point(s), ${lit.far.facts} fact(s), ${lit.far.units} arc line(s)`)
    out.push('', `Litopys chapters (top ${lit.chapters.length} of ${lit.chaptersTotal}):`, ...(lit.chapters.length ? lit.chapters.map((c) => `- ${c.id} ${c.n}/${lit.replies} ${c.gone ? '(removed since)' : cut(c.label ? `${c.label}: ${c.text}` : c.text, 120)}`) : ['- none']))
  }
  if (trace) out.push('', buildReport('', trace, now))
  return out.join('\n')
}
