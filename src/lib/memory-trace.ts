// Pure (no engine import, so tests can load it); the loader is in memory-trace-load.ts.
// The memory trace of a chat's last reply (#184 P6): why Litopys carried what it did, what the Data Bank did, and what the
// checks after the reply found. Pure helpers plus one loader. The plugins keep ids and codes only; the texts, the names of
// who knows a fact and the registry ids of the people are joined by GET /litopys/trace when the view is opened.

import type { LeakHit } from '@/lib/dashboard'

/** A person as the registry names them: the canonical name and the id ("p3", "user"; "" when the registry does not know them). */
export interface TracePerson { name: string; id: string }

/** Why a fact or chapter is in or out. "speaker" = not known to whoever speaks (or, with several voices, to anyone present). */
export type TraceWhy = 'pin' | 'change' | 'trait' | 'rank' | 'cause' | 'budget' | 'speaker' | 'bridge' | 'arc' | 'unseen'

export interface TraceFact {
  id: string
  state: 'in' | 'out'
  why: TraceWhy | string
  rank?: number
  /** the fact was deleted since the reply */
  gone: boolean
  text: string
  type: string
  weight: string
  subject: TracePerson | null
  by: 'all' | TracePerson[]
}

export interface TraceChapter {
  id: string
  state: 'in' | 'out'
  why: TraceWhy | string
  rank?: number
  arc: boolean
  gone: boolean
  label: string
  text: string
  cast: TracePerson[]
}

export interface LitopysTrace {
  at: number
  op: string
  speaker: TracePerson | null
  /** one character spoke: only what it knows (or everyone) went in; otherwise what anyone present knows */
  one: boolean
  knowers: TracePerson[]
  /** everything that was known fitted, nothing was ranked away */
  full: boolean
  /** the insert budget, in tokens */
  limit: number
  tokens: number
  n: { live?: number; hidden?: number; seen?: number; inF?: number; drop?: number; unseen?: number; held?: number }
  facts: TraceFact[]
  chapters: TraceChapter[]
}

export interface DatabankTrace {
  at: number
  gen: string
  off: boolean
  hits: { file: string; n: number; score: number; state: 'in' | 'room' }[]
  scoped: { file: string; scope: string; target: string }[]
  scopedMore: number
}

export interface MemoryTrace {
  /** null: no reply has been traced yet, or Litopys did not insert anything for it */
  litopys: LitopysTrace | null
  databank: DatabankTrace | null
  leaks: LeakHit[]
  /** the sensor's last report: facts it could not keep (for the user's character or for someone not in the scene) */
  keptOut: { user: number; absent: number; noQuote?: number } | null
  /** the Litopys route did not answer: an older plugin, or the plugin is off */
  unavailable: boolean
}

/** The rows of one section, in the order the view shows them: in-prompt facts by their place, the others by rank. */
export function factsIn(tr: LitopysTrace): TraceFact[] {
  return tr.facts.filter((f) => f.state === 'in')
}
export function factsOut(tr: LitopysTrace, why: 'speaker' | 'budget'): TraceFact[] {
  return tr.facts.filter((f) => f.state === 'out' && f.why === why)
}
export function chaptersIn(tr: LitopysTrace): TraceChapter[] {
  return tr.chapters.filter((c) => c.state === 'in')
}
export function chaptersOut(tr: LitopysTrace): TraceChapter[] {
  return tr.chapters.filter((c) => c.state === 'out')
}

/** "Aria p1" for a person with an id, "Aria" without. */
export function personLabel(p: TracePerson): string {
  return p.id ? `${p.name} (${p.id})` : p.name
}
export function knownLabel(by: TraceFact['by']): string {
  return by === 'all' ? 'everyone' : by.map(personLabel).join(', ')
}

const WHY_EN: Record<string, string> = {
  pin: 'pinned',
  change: 'a change',
  trait: 'a trait',
  rank: 'ranked',
  cause: 'pulled in as the cause of the fact before it',
  budget: 'no room',
  speaker: 'not known to the speaker',
  bridge: 'the chapter just before the history',
  arc: 'an arc',
  unseen: 'the speaker did not witness it',
}
export const whyEn = (why: string) => WHY_EN[why] ?? why

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/** The report a tester or Claude reads: plain English, ids beside names, the same sections as the view. */
export function buildReport(title: string, tr: MemoryTrace, now = Date.now()): string {
  const out: string[] = []
  out.push(`Memory trace of the last reply${title ? `: ${title}` : ''}`)
  const lit = tr.litopys
  if (!lit) {
    out.push(tr.unavailable ? 'Litopys did not answer (an older plugin, or it is off).' : 'Litopys inserted nothing for the last reply, or no reply has been traced yet.')
  } else {
    const ago = lit.at ? `${Math.max(0, Math.round((now - lit.at) / 1000))} s before this report` : 'time unknown'
    out.push(`Reply: ${lit.op || 'send'} by ${lit.speaker ? personLabel(lit.speaker) : 'several voices'} (${ago})`)
    out.push(
      lit.one
        ? `Filter: only what ${lit.speaker ? lit.speaker.name : 'the speaker'} knows, plus what everyone knows`
        : `Filter: what anyone present knows (${lit.knowers.map(personLabel).join(', ') || 'nobody listed'})`,
    )
    out.push(`Insert: ${lit.tokens} of ${lit.limit} tokens${lit.full ? ', everything known fitted' : ', ranked: not everything fitted'}`)
    const n = lit.n
    out.push(`Facts: ${n.live ?? '?'} active, ${n.hidden ?? 0} not known to the speaker, ${n.seen ?? 0} still in the history, ${n.inF ?? 0} in, ${n.drop ?? 0} over the budget`)
    const row = (f: TraceFact) =>
      `- ${f.id} [${f.state === 'in' ? 'in' : 'out'}, ${whyEn(String(f.why))}${f.rank ? `, rank ${f.rank}` : ''}] (known to: ${knownLabel(f.by)}) ${f.gone ? '(removed since)' : cut(f.text, 160)}`
    const inF = factsIn(lit)
    out.push('', `In the prompt (${inF.length}${inF.length >= 40 ? ', first 40' : ''}):`, ...(inF.length ? inF.map(row) : ['- none']))
    const sp = factsOut(lit, 'speaker')
    out.push('', `Kept out, not known to the speaker (${n.hidden ?? sp.length}${(n.hidden ?? 0) > sp.length ? `, newest ${sp.length} listed` : ''}):`, ...(sp.length ? sp.map(row) : ['- none']))
    const bu = factsOut(lit, 'budget')
    out.push('', `Kept out, no room (${n.drop ?? bu.length}${(n.drop ?? 0) > bu.length ? `, best ${bu.length} listed` : ''}):`, ...(bu.length ? bu.map(row) : ['- none']))
    const chap = (c: TraceChapter) =>
      `- ${c.id}${c.arc ? ' (arc)' : ''} [${c.state}, ${whyEn(String(c.why))}${c.rank ? `, rank ${c.rank}` : ''}]${c.cast.length ? ` (cast: ${c.cast.map(personLabel).join(', ')})` : ''} ${c.gone ? '(removed since)' : cut(`${c.label ? c.label + ': ' : ''}${c.text}`, 140)}`
    out.push('', `Chapters in (${chaptersIn(lit).length}):`, ...(chaptersIn(lit).length ? chaptersIn(lit).map(chap) : ['- none']))
    out.push('', `Chapters kept out (${chaptersOut(lit).length}${(n.unseen ?? 0) ? `, ${n.unseen} not witnessed by the speaker` : ''}):`, ...(chaptersOut(lit).length ? chaptersOut(lit).map(chap) : ['- none']))
  }
  const db = tr.databank
  out.push('', 'Data Bank:')
  if (!db) out.push('- no reply traced yet')
  else {
    if (db.off) out.push('- switched off for this chat')
    for (const h of db.hits) out.push(`- ${h.file} #${h.n} score ${h.score} ${h.state === 'in' ? 'in the prompt' : 'left out: over the Data Bank room'}`)
    if (!db.off && !db.hits.length) out.push('- no chunk matched')
    for (const s of db.scoped) out.push(`- ${s.file} kept out by its scope (${s.scope}${s.target ? ` ${s.target}` : ''})`)
    if (db.scopedMore) out.push(`- and ${db.scopedMore} more files kept out by scope`)
  }
  out.push('', 'After the reply:')
  if (tr.keptOut) out.push(`- the sensor kept out ${tr.keptOut.user} fact(s) about the user's character and ${tr.keptOut.absent} about people not in the scene`)
  for (const l of tr.leaks) out.push(`- possible leak: ${l.who} may know "${cut(l.text, 120)}" (fact ${l.factId}), quote "${cut(l.quote, 120)}"`)
  if (!tr.keptOut && !tr.leaks.length) out.push('- nothing flagged')
  return out.join('\n')
}
