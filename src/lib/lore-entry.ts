// Pure logic of the lorebook entry panel: the three-way "When it appears" mapping onto the stored status, the key chips
// (parse and serialize), the recursion wait value and the one-line summary each fold shows while it is closed.
// Nothing here reads the store or the DOM; the components pass translated labels in.

import type { MsgKey, Vars } from '@/lib/i18n'
import type { EntryStatus, LoreEntry } from '@/lib/types'

export type Tr = (key: MsgKey, vars?: Vars) => string

// ── When it appears ────────────────────────────────────────────────────────────────────────────────────────────────

/** The three choices of "When it appears". They are the stored status: constant, normal and vectorized. */
export type Appearance = 'always' | 'keys' | 'meaning'
export const APPEARANCES: readonly Appearance[] = ['always', 'keys', 'meaning']

const STATUS_OF: Record<Appearance, EntryStatus> = { always: 'constant', keys: 'normal', meaning: 'vectorized' }

export const APPEARANCE_KEY: Record<Appearance, MsgKey> = {
  always: 'lore.status.constant',
  keys: 'lore.status.normal',
  meaning: 'lore.status.vectorized',
}

export const APPEARANCE_HINT_KEY: Record<Appearance, MsgKey> = {
  always: 'lore.ed.appearAlways',
  keys: 'lore.ed.appearKeys',
  meaning: 'lore.ed.appearMeaning',
}

export function statusOf(a: Appearance): EntryStatus {
  return STATUS_OF[a]
}

/** Any status the editor does not name (an imported one) reads as "When mentioned", the engine's default. */
export function appearanceOf(status: EntryStatus): Appearance {
  if (status === 'constant') return 'always'
  if (status === 'vectorized') return 'meaning'
  return 'keys'
}

// ── Keys ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The keys a comma-separated text holds: each part trimmed, empty parts dropped. */
export function parseKeys(text: string): string[] {
  return text.split(',').map((k) => k.trim()).filter(Boolean)
}

/** Keys as the comma-separated text the engine's export and older builds use. */
export function serializeKeys(keys: string[]): string {
  return keys.join(', ')
}

/**
 * While typing: the parts before a comma are complete keys and go into the list; the text after the last comma stays
 * in the box (raw, so the cursor keeps its place).
 */
export function splitKeyDraft(draft: string): { add: string[]; rest: string } {
  const parts = draft.split(',')
  const rest = parts.pop() ?? ''
  return { add: parts.map((p) => p.trim()).filter(Boolean), rest }
}

/** Enter (or leaving the box): everything in the box becomes keys, commas or not. */
export function commitKeyDraft(draft: string): string[] {
  return parseKeys(draft)
}

/** Adds keys that are not in the list yet (exact match), in the order given. */
export function addKeys(current: string[], incoming: string[]): string[] {
  const out = [...current]
  for (const k of incoming) {
    const v = k.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

export function removeKey(keys: string[], index: number): string[] {
  return keys.filter((_, i) => i !== index)
}

// ── Recursion wait ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The stored value is `true` (level 1), a number (the level it waits for) or false (off). Shown as one number, 0 = off. */
export function waitsOf(v: LoreEntry['delayUntilRecursion']): number {
  return typeof v === 'number' ? v : v ? 1 : 0
}

export function waitsValue(n: number): number | false {
  return n > 0 ? n : false
}

// ── Tri-state (Book default / On / Off) ────────────────────────────────────────────────────────────────────────────

export type TriChoice = 'book' | 'on' | 'off'

export const triOf = (v: boolean | null): TriChoice => (v == null ? 'book' : v ? 'on' : 'off')
export const triValue = (c: TriChoice): boolean | null => (c === 'book' ? null : c === 'on')

// ── Fold summaries ─────────────────────────────────────────────────────────────────────────────────────────────────

const SEP = ' · '

export interface WhereInput {
  /** the position's short name, e.g. "after char" or "@4 depth" */
  positionLabel: string
  /** the role's name when the position is "at depth", else null (the role does not apply) */
  roleLabel: string | null
  order: number
  ignoreBudget: boolean
}

/** "after char · system · order 100" */
export function whereSummary(i: WhereInput, tr: Tr): string {
  const parts = [i.positionLabel]
  if (i.roleLabel) parts.push(i.roleLabel)
  parts.push(tr('lore.sum.order', { n: i.order }))
  if (i.ignoreBudget) parts.push(tr('lore.sum.ignoresBudget'))
  return parts.join(SEP)
}

export interface OnlyWhenInput {
  secondaryCount: number
  probability: number
  /** the names of the speakers the entry is limited to (empty = anyone) */
  speakers: string[]
  speakerExclude: boolean
  tags: string[]
  /** the translated reply kinds the entry is limited to (empty = all) */
  kinds: string[]
}

/** "no second keys · any speaker · 100%" */
export function onlyWhenSummary(i: OnlyWhenInput, tr: Tr): string {
  const parts: string[] = [i.secondaryCount > 0 ? tr('lore.sum.second', { n: i.secondaryCount }) : tr('lore.sum.noSecond')]
  if (i.speakers.length === 0) parts.push(tr('lore.sum.anySpeaker'))
  else parts.push(tr(i.speakerExclude ? 'lore.sum.except' : 'lore.sum.only', { names: i.speakers.join(', ') }))
  if (i.tags.length > 0) parts.push(tr('lore.sum.tags', { tags: i.tags.join(', ') }))
  if (i.kinds.length > 0) parts.push(tr('lore.sum.kinds', { kinds: i.kinds.join(', ') }))
  parts.push(`${i.probability}%`)
  return parts.join(SEP)
}

export interface StaysInput {
  sticky: number
  cooldown: number
  delay: number
}

/** "sticky 3 · no cooldown · no delay" */
export function staysSummary(i: StaysInput, tr: Tr): string {
  return [
    i.sticky > 0 ? tr('lore.sum.sticky', { n: i.sticky }) : tr('lore.sum.noSticky'),
    i.cooldown > 0 ? tr('lore.sum.cooldown', { n: i.cooldown }) : tr('lore.sum.noCooldown'),
    i.delay > 0 ? tr('lore.sum.delay', { n: i.delay }) : tr('lore.sum.noDelay'),
  ].join(SEP)
}

export interface GroupsInput {
  group: string
  /** true when the entry is kept from triggering or triggering others, or waits for a recursion level */
  chainLimits: boolean
}

/** "no group · chains allowed" */
export function groupsSummary(i: GroupsInput, tr: Tr): string {
  const name = i.group.trim()
  return [
    name ? tr('lore.sum.group', { name }) : tr('lore.sum.noGroup'),
    i.chainLimits ? tr('lore.sum.chainLimits') : tr('lore.sum.chainsAllowed'),
  ].join(SEP)
}

export interface MatchInput {
  caseSensitive: boolean | null
  wholeWords: boolean | null
  wordForms: boolean | null
  scanDepth: number | null
  /** the translated names of the sources the entry also scans (description, persona, ...) */
  sources: string[]
  automationId: string
}

/** "book defaults" when nothing is overridden, else the overrides: "case sensitive: On · also in description" */
export function matchSummary(i: MatchInput, tr: Tr): string {
  const parts: string[] = []
  const tri = (what: MsgKey, v: boolean | null) => {
    if (v != null) parts.push(tr('lore.sum.override', { what: tr(what), value: tr(v ? 'lore.ed.tri.on' : 'lore.ed.tri.off') }))
  }
  tri('lore.set.caseSensitive', i.caseSensitive)
  tri('lore.set.wholeWords', i.wholeWords)
  tri('lore.set.wordForms', i.wordForms)
  if (i.scanDepth != null && i.scanDepth > 0) parts.push(tr('lore.sum.scanDepth', { n: i.scanDepth }))
  if (i.sources.length > 0) parts.push(tr('lore.sum.also', { list: i.sources.join(', ') }))
  if (i.automationId.trim()) parts.push(tr('lore.sum.automation'))
  return parts.length > 0 ? parts.join(SEP) : tr('lore.sum.bookDefaults')
}

/** True when an entry is held back by a chain rule: it is not triggered by others, does not trigger others, or waits. */
export function hasChainLimits(e: Pick<LoreEntry, 'nonRecursable' | 'preventFurtherRecursion' | 'delayUntilRecursion'>): boolean {
  return e.nonRecursable || e.preventFurtherRecursion || waitsOf(e.delayUntilRecursion) > 0
}
