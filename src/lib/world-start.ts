// Pure helpers of the Start tab: what a draft holds, what accepting it adds, the build plan in numbers.

import type { WorldDraft, WorldKind, WorldRecipe, WorldRecord } from '@/lib/world'
import { KINDS } from '@/lib/world-records'

/** The ids the player took out of a draft. */
export interface Removed { entities: Set<string>; fronts: Set<string>; deck: Set<string>; cast: Set<string> }
export const noneRemoved = (): Removed => ({ entities: new Set(), fronts: new Set(), deck: new Set(), cast: new Set() })

/** Everything a draft would add. */
export const draftTotal = (d: WorldDraft) => d.entities.length + d.fronts.length + d.deck.length + (d.cast?.length ?? 0)

/** How many things stay if the player accepts now. */
export const acceptCount = (d: WorldDraft, r: Removed) => draftTotal(d) - r.entities.size - r.fronts.size - r.deck.size - r.cast.size

/** The `drop` of finishWorldDraft; undefined when nothing was taken out. */
export function dropOf(r: Removed): { entities?: string[]; fronts?: string[]; deck?: string[]; cast?: string[] } | undefined {
  const out: { entities?: string[]; fronts?: string[]; deck?: string[]; cast?: string[] } = {}
  if (r.entities.size) out.entities = [...r.entities]
  if (r.fronts.size) out.fronts = [...r.fronts]
  if (r.deck.size) out.deck = [...r.deck]
  if (r.cast.size) out.cast = [...r.cast]
  return Object.keys(out).length ? out : undefined
}

/** The records of a draft by kind, in the order of the kind chips; empty kinds are left out. */
export function groupByKind(records: WorldRecord[]): { kind: WorldKind; items: WorldRecord[] }[] {
  return KINDS.map((kind) => ({ kind, items: records.filter((r) => r.kind === kind) })).filter((g) => g.items.length > 0)
}

/** The cast deck's calls: one per four factions asked for (0 when it is off). */
export const castCalls = (cast: { on: boolean; factions: number } | undefined): number => (cast && cast.on && cast.factions > 0 ? Math.ceil(cast.factions / 4) : 0)

/** A rough number of build calls before the exact total is known: sections, fronts, deck, the cast deck (cards take more, one per chunk). */
export function plannedCalls(recipe: WorldRecipe | undefined, withFronts: boolean, withDeck: boolean, cast?: { on: boolean; factions: number }): number {
  if (!recipe) return 0
  return recipe.sections.length + (withFronts && recipe.fronts.count > 0 ? 1 : 0) + (withDeck ? 1 : 0) + castCalls(cast)
}

/** The English names the build prompt is given for the app's languages. */
export const LANG_ENGLISH: Record<string, string> = { en: 'English', uk: 'Ukrainian' }
