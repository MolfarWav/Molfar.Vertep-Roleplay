// The card editor's working copy (GitHub #103). A change in the editor stays a draft
// until the user presses Save changes; this module holds the logic that does not
// need React: which fields really changed, and how a save meets a card that changed
// while the editor was open (Molfar, the Soul tab, sync). Pure: no store, no DOM.

import type { Character } from '@/lib/types'

export type CardPatch = Partial<Character>

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Equal as saved data (the card goes to disk as JSON, so that is the comparison that counts). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
}

/** The part of `patch` that really differs from `base`: a field put back to what it was drops out. */
export function effectivePatch(base: Character, patch: CardPatch): CardPatch {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!sameValue((base as unknown as Record<string, unknown>)[k], v)) out[k] = v
  }
  return out as CardPatch
}

/** How many fields the draft changes. */
export function changedCount(base: Character, patch: CardPatch): number {
  return Object.keys(effectivePatch(base, patch)).length
}

/** The panel (tab) each field is edited in, for the dot on a changed tab. Names are the editor's panels. */
export const FIELD_PANEL: Partial<Record<keyof Character, string>> = {
  name: 'core', tags: 'core', description: 'core', descVariants: 'core', firstMessage: 'core', altGreetings: 'core', groupGreetings: 'core', avatar: 'core',
  exampleDialogue: 'dialogue',
  systemPromptOverride: 'advanced', postHistoryInstructions: 'advanced', depthPrompt: 'advanced', scenario: 'advanced', scenarioVariants: 'advanced',
  personality: 'advanced', personalityVariants: 'advanced', creatorNotes: 'advanced', creator: 'advanced', version: 'advanced',
  css: 'colors', colors: 'colors',
  expressions: 'sprites', defaultExpression: 'sprites', outfit: 'sprites',
  gallery: 'gallery',
  voiceProvider: 'voice', voiceId: 'voice',
}

/** The panels that hold a changed field. `cardExtras` holds the profile (the Profile tab) and the talkativeness (More). */
export function changedPanels(base: Character, patch: CardPatch): Set<string> {
  const panels = new Set<string>()
  for (const k of Object.keys(effectivePatch(base, patch)) as (keyof Character)[]) {
    if (k === 'cardExtras') {
      const a = base.cardExtras as Record<string, unknown> | undefined
      const b = (patch.cardExtras ?? undefined) as Record<string, unknown> | undefined
      const ea = isObj(a?.extensions) ? a.extensions : {}
      const eb = isObj(b?.extensions) ? b.extensions : {}
      if (!sameValue(ea.molfar_profile, eb.molfar_profile)) panels.add('profile')
      if (!sameValue(ea.talkativeness, eb.talkativeness)) panels.add('advanced')
      continue
    }
    if (k === 'description' || k === 'personality') panels.add(k === 'description' ? 'core' : 'advanced')
    const p = FIELD_PANEL[k]
    if (p) panels.add(p)
  }
  // a profile edit rewrites description and personality: the Profile tab is where the user made it
  if (panels.has('profile')) { panels.delete('core'); panels.delete('advanced') }
  return panels
}

/** What a changed field is called in the conflict list. */
export const FIELD_LABEL: Partial<Record<keyof Character, string>> = {
  name: 'Name', tags: 'Tags', description: 'Description', descVariants: 'Description variants', firstMessage: 'First message',
  altGreetings: 'Alternate greetings', groupGreetings: 'Group greetings', avatar: 'Portrait', exampleDialogue: 'Example dialogue',
  systemPromptOverride: 'System prompt override', postHistoryInstructions: 'Post-history instructions', depthPrompt: 'Depth prompt',
  scenario: 'Scenario', scenarioVariants: 'Scenario variants', personality: 'Personality', personalityVariants: 'Personality variants',
  creatorNotes: 'Creator notes', creator: 'Creator', version: 'Version', css: 'Character CSS', colors: 'Colors',
  expressions: 'Sprites', defaultExpression: 'Default sprite', outfit: 'Sprite outfit', gallery: 'Gallery', voiceProvider: 'Voice provider', voiceId: 'Voice',
  cardExtras: 'Profile and card extras', favorite: 'Favorite', versions: 'Version history',
  embeddedLorebookId: 'Embedded lorebook', linkedLorebookIds: 'Linked lorebooks',
}

/** The result of laying a draft over the card as it is stored now. */
export interface DraftMerge {
  /** Fields that can be written as they are: the stored card did not touch them since the draft began. */
  patch: CardPatch
  /** Fields both sides changed, with the editor's value: written only when the user keeps theirs. */
  conflicting: CardPatch
}

/** A three-way merge of `extras`: sub-keys of the card extras (and of its `extensions`) that only one side changed. */
function mergeExtras(base: Record<string, unknown> | undefined, stored: Record<string, unknown> | undefined, mine: Record<string, unknown> | undefined): { value: Record<string, unknown> | undefined } | null {
  const b = base ?? {}
  const s = stored ?? {}
  const m = mine ?? {}
  const out: Record<string, unknown> = { ...s }
  for (const key of new Set([...Object.keys(b), ...Object.keys(m)])) {
    if (sameValue(b[key], m[key])) continue // I did not touch it
    if (sameValue(b[key], s[key]) || sameValue(s[key], m[key])) {
      if (key in m) out[key] = m[key]
      else delete out[key]
      continue
    }
    if (key === 'extensions' && isObj(b[key] ?? {}) && isObj(s[key] ?? {}) && isObj(m[key] ?? {})) {
      const inner = mergeExtras(b[key] as Record<string, unknown> | undefined, s[key] as Record<string, unknown> | undefined, m[key] as Record<string, unknown> | undefined)
      if (!inner) return null
      out[key] = inner.value
      continue
    }
    return null // both sides changed the same sub-key
  }
  return { value: Object.keys(out).length ? out : undefined }
}

/**
 * Lays the draft `mine` (changes made on top of `base`, the card as it was when the draft began) over `stored`
 * (the card now). A field only the draft changed is written. A field both sides changed is a conflict, except
 * `cardExtras`, which is merged one sub-key at a time (the Soul tab and the profile write different ones).
 */
export function mergeDraft(base: Character, stored: Character, mine: CardPatch): DraftMerge {
  const patch: Record<string, unknown> = {}
  const conflicting: Record<string, unknown> = {}
  const b = base as unknown as Record<string, unknown>
  const s = stored as unknown as Record<string, unknown>
  for (const [k, v] of Object.entries(effectivePatch(base, mine))) {
    if (sameValue(s[k], b[k])) { patch[k] = v; continue }
    if (sameValue(s[k], v)) continue // already stored, nothing to write
    if (k === 'cardExtras') {
      const merged = mergeExtras(b[k] as Record<string, unknown> | undefined, s[k] as Record<string, unknown> | undefined, v as Record<string, unknown> | undefined)
      if (merged) { patch[k] = merged.value; continue }
    }
    conflicting[k] = v
  }
  return { patch: patch as CardPatch, conflicting: conflicting as CardPatch }
}

/** The names of the conflicting fields, for the dialog. */
export function conflictLabels(m: DraftMerge): string[] {
  return (Object.keys(m.conflicting) as (keyof Character)[]).map((k) => FIELD_LABEL[k] ?? String(k))
}
