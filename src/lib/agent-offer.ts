// The rules of the offer of ready agents in the new-chat step (Molfar.Vertep#396 item 0). Pure, so a test can hold it.
// Nothing here talks to the engine: the step inspects the recipes (POST /agents/inspect), shows what each one reads,
// shows and costs, and only on Start installs the picked ones with the grants the person has just read.

import type { CanvasFile } from '@/canvas-kit/graph'
import type { AgentPreview, AgentPreviewRow, AgentSet } from './agents'

/** The order of the list: what helps the writing first, then the boards that show game state, the portrait last. */
export const STARTER_ORDER = ['repetition-guard', 'canon-guard', 'next-moves-ai', 'pacing-nudge', 'scene-recap', 'tension-meter', 'story-map', 'territory-board', 'ledger', 'character-growth']

/** "Turn on the suggested three": the cheapest ones that show something at once (one runs in code, two ask a model once a reply). */
export const SUGGESTED = ['repetition-guard', 'next-moves-ai', 'scene-recap']

/** The agents that make no sense in a group chat: a portrait is proposed for one character, a group proposes nothing yet. */
export const SINGLE_ONLY = ['character-growth']

/** The recipes the offer lists, in STARTER_ORDER; a recipe not in the order goes last, in the order it came. */
export function starterFiles(recipes: CanvasFile[], isGroup: boolean): CanvasFile[] {
  const rank = (f: CanvasFile) => { const i = STARTER_ORDER.indexOf(String(f.agent?.id ?? '')); return i < 0 ? STARTER_ORDER.length : i }
  return recipes
    .filter((f) => !(isGroup && SINGLE_ONLY.includes(String(f.agent?.id ?? ''))))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map((x) => x.f)
}

/** A preview that can be turned on: it compiled, this runner can give every need and run its scripts. */
export const usable = (r: AgentPreviewRow | undefined): r is AgentPreview => !!r && !r.error && (r as AgentPreview).unsupported.length === 0 && !(r as AgentPreview).scriptsMissing

/**
 * The agents the new chat starts with: the set it would have started with (the default set or the one picked, `base`),
 * then the picked starter agents that are not in it. A picked agent that is already in the set keeps its place.
 */
export function chatAgentsWith(base: AgentSet['items'], picked: string[]): { agent: string; on: boolean; phase?: string; wait?: boolean }[] {
  const out = base.map((x) => ({ agent: x.agent, on: x.on, ...(x.phase ? { phase: x.phase } : {}), ...(typeof x.wait === 'boolean' ? { wait: x.wait } : {}) }))
  for (const id of picked) {
    const at = out.findIndex((x) => x.agent === id)
    if (at >= 0) out[at] = { ...out[at], on: true }
    else out.push({ agent: id, on: true })
  }
  return out
}

/** What the person still has to allow before the agent runs: nothing when it is installed and allowed already. */
export const needsAllowing = (p: AgentPreview): string[] => p.missing.filter((n) => !p.unsupported.includes(n))

const SHOWN_KEY = 'rp.agentOfferShown'
/** Has the offer been put in front of this person once? A simple setup (one preset, no options, no sets) skips the new-chat step; the offer opens it once so agents are seen, then leaves the step alone. */
export function offerShown(): boolean {
  try { return globalThis.localStorage?.getItem(SHOWN_KEY) === '1' } catch { return true }
}
export function markOfferShown(): void {
  try { globalThis.localStorage?.setItem(SHOWN_KEY, '1') } catch { /* storage is optional */ }
}
