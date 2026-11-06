// When a chat has grown so large that each reply sends a lot (#261). Pure, so the rule is easy to test:
// the strip above the composer asks `alertLimit` and `shouldOfferTrim` and nothing else.
import type { Message } from './types'

/** The share of the model's window that counts as "big" when the person did not set a size. */
export const ALERT_SHARE = 0.6
/** After "Not now" the strip stays away until the prompt has grown by this factor. */
export const REOFFER_GROWTH = 1.5

/** The Litopys settings that decide the limit (`promptAlert`, `promptAlertTokens`). */
export interface AlertSetting {
  promptAlert?: 'auto' | 'tokens' | 'off'
  promptAlertTokens?: number
}

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

/** The prompt size from which the strip appears; null = never (switched off, or "auto" and the window is not known).
 *  A setting that is missing (an older plugin, no Litopys) reads as "auto". */
export function alertLimit(s: AlertSetting | null | undefined, windowTokens: number | null | undefined): number | null {
  const mode = s?.promptAlert ?? 'auto'
  if (mode === 'off') return null
  if (mode === 'tokens') {
    const n = Number(s?.promptAlertTokens)
    return Number.isFinite(n) && n >= 1 ? Math.round(n) : null
  }
  return windowTokens && windowTokens > 0 ? Math.round(windowTokens * ALERT_SHARE) : null
}

/** Offer the trim when the prompt reached the limit and the person did not already wave it away at about this size.
 *  `dismissedAt` is the prompt size at the moment of "Not now" (null = never dismissed). */
export function shouldOfferTrim(tokens: number, limit: number | null, dismissedAt: number | null): boolean {
  if (limit === null || tokens <= 0 || tokens < limit) return false
  return dismissedAt === null || tokens >= dismissedAt * REOFFER_GROWTH
}

/** 45000 reads "45k", 45300 "45.3k", 900 "900" */
export function shortTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n))
}

/** How close the last request is to the limit: nothing sent yet, below the limit, within a quarter of it, or past it.
 *  `ok` also covers "no limit" (the alarm is off or the window is unknown). */
export type RequestLevel = 'none' | 'ok' | 'near' | 'over'
export function requestLevel(tokens: number, limit: number | null): RequestLevel {
  if (tokens <= 0) return 'none'
  if (limit === null) return 'ok'
  return tokens >= limit ? 'over' : tokens >= limit * 0.75 ? 'near' : 'ok'
}

/** The sizes a person can type: "100000", "100 000", "100k", "1.5m". null = not a size, or outside what the setting allows. */
export const ALERT_MIN = 1000
export const ALERT_MAX = 5_000_000
export function parseTokens(text: string): number | null {
  let clean = text.replace(/[\s\u00a0_]/g, '')
  // "100,000" and "1.500.000" are thousands separators, "1.5k" is a decimal
  if (/^\d{1,3}([,.]\d{3})+$/.test(clean)) clean = clean.replace(/[,.]/g, '')
  const m = /^(\d+(?:[.,]\d+)?)([km]?)$/i.exec(clean)
  if (!m) return null
  const n = Number(m[1]!.replace(',', '.')) * (m[2]!.toLowerCase() === 'k' ? 1000 : m[2]!.toLowerCase() === 'm' ? 1_000_000 : 1)
  const r = Math.round(n)
  return Number.isFinite(r) && r >= ALERT_MIN && r <= ALERT_MAX ? r : null
}
