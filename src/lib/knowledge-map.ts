// The knowledge map (#449, S1): secrets as rows, people as columns. Pure reading of a chat's Litopys
// facts, no model call. A secret is an active fact that the reader marked (`secret: true`) or that fewer
// people know than the cast holds. Facts told to "all" are never secrets.
import { isGroupToken, groupWords } from '@/lib/known-by'
import type { LitChat, LitFact } from '@/components/library/litopys-api'

export type KnowState = 'knows' | 'suspects' | 'none'

export interface KnowPerson {
  /** lower-cased key (a group keeps its raw token, lower-cased) */
  key: string
  name: string
  /** a group token: every member knows, the client cannot list them */
  group: boolean
  /** how many shown secrets this person knows or suspects */
  involved: number
}

export interface KnowRow {
  id: string
  text: string
  subject: string
  type: LitFact['type']
  /** the reader or the worker marked it a secret */
  marked: boolean
  /** person keys that know / only suspect */
  knows: string[]
  suspects: string[]
  /** nobody is named: it is known to whoever was in the scene */
  unnamed: boolean
  updatedAt: number
}

export interface KnowMap {
  people: KnowPerson[]
  rows: KnowRow[]
  /** active facts that are not secrets (told to everyone, or known to the whole cast) */
  open: number
}

const keyOf = (n: string): string => n.trim().toLowerCase()

function nameOf(n: string): string {
  return isGroupToken(n) ? groupWords(n) : n.trim()
}

/** The map of one chat. `rows` are ordered: marked first, then the fewest knowers, then the newest. */
export function knowledgeMap(chat: Pick<LitChat, 'facts' | 'chapters'>): KnowMap {
  const first = new Map<string, KnowPerson>()
  const see = (n: string): string => {
    const key = keyOf(n)
    if (key && !first.has(key)) first.set(key, { key, name: nameOf(n), group: isGroupToken(n), involved: 0 })
    return key
  }
  const live = chat.facts.filter((f) => f.status === 'active')
  // the cast: everyone a fact names, and everyone a chapter remembers a scene for
  for (const f of live) {
    if (Array.isArray(f.knownBy)) for (const n of f.knownBy) see(n)
    for (const n of f.suspectedBy ?? []) see(n)
  }
  for (const c of chat.chapters) for (const v of c.views ?? []) see(v.who)

  const castSize = first.size
  const rows: KnowRow[] = []
  let open = 0
  for (const f of live) {
    const marked = f.secret === true
    if (f.knownBy === 'all') {
      open++
      continue
    }
    const knows = [...new Set((Array.isArray(f.knownBy) ? f.knownBy : []).map(keyOf).filter(Boolean))]
    const suspects = [...new Set((f.suspectedBy ?? []).map(keyOf).filter((k) => k && !knows.includes(k)))]
    // a belief is a lie its holder takes as true, not a secret, unless the reader marked it
    if (!marked && (f.type === 'belief' || knows.length >= castSize)) {
      open++
      continue
    }
    rows.push({
      id: f.id,
      text: f.text,
      subject: f.subject,
      type: f.type,
      marked,
      knows,
      suspects,
      unnamed: knows.length === 0,
      updatedAt: f.updatedAt,
    })
  }
  rows.sort((a, b) => Number(b.marked) - Number(a.marked) || a.knows.length - b.knows.length || b.updatedAt - a.updatedAt)

  for (const r of rows) for (const k of [...r.knows, ...r.suspects]) {
    const p = first.get(k)
    if (p) p.involved++
  }
  // people first, groups after; the most involved first, then by name
  const people = [...first.values()]
    .filter((p) => p.involved > 0)
    .sort((a, b) => Number(a.group) - Number(b.group) || b.involved - a.involved || a.name.localeCompare(b.name))
  return { people, rows, open }
}

/** What one person knows of one secret. */
export function stateOf(row: KnowRow, personKey: string): KnowState {
  if (row.knows.includes(personKey)) return 'knows'
  if (row.suspects.includes(personKey)) return 'suspects'
  return 'none'
}
