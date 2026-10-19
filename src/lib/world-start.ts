// Pure helpers of the Start tab: what a draft holds, what accepting it adds, the build plan in numbers.

import type { WorldDraft, WorldKind, WorldRecipe, WorldRecord } from '@/lib/world'
import { KINDS } from '@/lib/world-records'

/** The ids the player took out of a draft. */
export interface Removed { entities: Set<string>; fronts: Set<string>; deck: Set<string> }
export const noneRemoved = (): Removed => ({ entities: new Set(), fronts: new Set(), deck: new Set() })

/** Everything a draft would add. */
export const draftTotal = (d: WorldDraft) => d.entities.length + d.fronts.length + d.deck.length

/** How many things stay if the player accepts now. */
export const acceptCount = (d: WorldDraft, r: Removed) => draftTotal(d) - r.entities.size - r.fronts.size - r.deck.size

/** The `drop` of finishWorldDraft; undefined when nothing was taken out. */
export function dropOf(r: Removed): { entities?: string[]; fronts?: string[]; deck?: string[] } | undefined {
  const out: { entities?: string[]; fronts?: string[]; deck?: string[] } = {}
  if (r.entities.size) out.entities = [...r.entities]
  if (r.fronts.size) out.fronts = [...r.fronts]
  if (r.deck.size) out.deck = [...r.deck]
  return Object.keys(out).length ? out : undefined
}

/** The records of a draft by kind, in the order of the kind chips; empty kinds are left out. */
export function groupByKind(records: WorldRecord[]): { kind: WorldKind; items: WorldRecord[] }[] {
  return KINDS.map((kind) => ({ kind, items: records.filter((r) => r.kind === kind) })).filter((g) => g.items.length > 0)
}

/** A rough number of build calls before the exact total is known: sections, fronts, deck (cards take more, one per chunk). */
export function plannedCalls(recipe: WorldRecipe | undefined, withFronts: boolean, withDeck: boolean): number {
  if (!recipe) return 0
  return recipe.sections.length + (withFronts && recipe.fronts.count > 0 ? 1 : 0) + (withDeck ? 1 : 0)
}

/** The English names the build prompt is given for the app's languages. */
export const LANG_ENGLISH: Record<string, string> = { en: 'English', uk: 'Ukrainian' }
