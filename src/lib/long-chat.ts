// When a chat has grown so large that each reply sends a lot (#261). Pure, so the rule is easy to test:
// the strip above the composer asks `shouldOfferTrim` and nothing else.
import type { Message } from './types'

/** A reply that sent this many tokens (or more) is "big": the cost per reply, whatever the model's window. */
export const BIG_PROMPT_TOKENS = 30000
/** A reply that filled this share of a known window is "big" too: on a small window the model is about to forget. */
export const BIG_PROMPT_SHARE = 0.6
/** After "Not now" the strip stays away until the prompt has grown by this factor. */
export const REOFFER_GROWTH = 1.5

/** What the model was sent for the newest generated reply (input plus cached input), 0 when no reply has usage yet.
 *  Looks past a reply that is still streaming (it has no usage until it ends), but only a few replies back. */
export function lastPromptTokens(messages: Message[]): number {
  let seen = 0
  for (let i = messages.length - 1; i >= 0 && seen < 4; i--) {
    const m = messages[i]!
    if (m.role !== 'assistant') continue
    seen++
    const u = m.swipes[m.activeSwipe]?.usage
    if (u && u.input > 0) return u.input + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0)
  }
  return 0
}

export function isBigPrompt(tokens: number, windowTokens?: number | null): boolean {
  if (tokens <= 0) return false
  if (tokens >= BIG_PROMPT_TOKENS) return true
  return !!windowTokens && windowTokens > 0 && tokens >= windowTokens * BIG_PROMPT_SHARE
}

/** Offer the trim when the prompt is big and the person did not already wave it away at about this size.
 *  `dismissedAt` is the prompt size at the moment of "Not now" (null = never dismissed). */
export function shouldOfferTrim(tokens: number, windowTokens: number | null | undefined, dismissedAt: number | null): boolean {
  if (!isBigPrompt(tokens, windowTokens)) return false
  return dismissedAt === null || tokens >= dismissedAt * REOFFER_GROWTH
}
