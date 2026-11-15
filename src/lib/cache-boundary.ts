// Which part of the prompt the provider's cache covered (#112). Pure, so the rules are easy to test.
//
// A provider caches the START of a request: a prefix. The last reply's usage says how many tokens of its prompt
// came from the cache (`cacheRead`), and the next prompt begins with the same text, so the same number of tokens
// from the top is what the cache can serve again. The prompt peek shows the next prompt as blocks (the system
// prompt, then each message), counted with our own tokenizer; the provider's tokenizer counts a little
// differently, so the boundary is scaled by the ratio of the two totals and shown as approximate.
import type { Message } from './types'

export interface ReplyUsage {
  /** Tokens billed at the full input price. */
  input: number
  cacheRead: number
  cacheWrite: number
  /** The whole request: input + cacheRead + cacheWrite. */
  prompt: number
}

/** The usage of the newest generated reply that has one (looks past replies still streaming, a few back). */
export function lastReplyUsage(messages: Message[]): ReplyUsage | null {
  let seen = 0
  for (let i = messages.length - 1; i >= 0 && seen < 4; i--) {
    const m = messages[i]!
    if (m.role !== 'assistant') continue
    seen++
    const u = m.swipes[m.activeSwipe]?.usage
    if (u && u.input > 0) {
      const cacheRead = u.cacheRead ?? 0
      const cacheWrite = u.cacheWrite ?? 0
      return { input: u.input, cacheRead, cacheWrite, prompt: u.input + cacheRead + cacheWrite }
    }
  }
  return null
}

export interface CacheSplit {
  read: number
  written: number
  /** Not served from a cache and not written to one: the full price. */
  fresh: number
  prompt: number
}

/** The three shares of the last request. `input` already excludes what was read or written. */
export function cacheSplit(u: ReplyUsage): CacheSplit {
  return { read: u.cacheRead, written: u.cacheWrite, fresh: u.input, prompt: u.prompt }
}

export type CacheState = 'cached' | 'partial' | 'new'

export interface Boundary {
  /** Where the cache ends, in the preview's own token count. */
  at: number
  /** The preview's total, in the same count. */
  total: number
  /** Index of the block the cut falls in (blocks.length when the cache covers everything). */
  block: number
  /** How far into that block, 0 to 1. */
  within: number
}

/** `blocks` are the preview's blocks in order with their token counts; `cachedReal` and `promptReal` are the provider's
 *  numbers for the last request. null when there is nothing cached or nothing to measure against. */
export function cacheBoundary(blocks: readonly { tokens: number }[], cachedReal: number, promptReal: number): Boundary | null {
  const total = blocks.reduce((n, b) => n + b.tokens, 0)
  if (cachedReal <= 0 || promptReal <= 0 || total <= 0) return null
  // the preview can be a little larger than the last prompt (it holds the newest turn), the provider counts differently:
  // the share of the last prompt that was cached, applied to the preview, is the honest estimate
  const at = Math.min(total, Math.max(0, Math.round(total * Math.min(1, cachedReal / promptReal))))
  let start = 0
  for (let i = 0; i < blocks.length; i++) {
    const end = start + blocks[i]!.tokens
    if (at < end) return { at, total, block: i, within: blocks[i]!.tokens > 0 ? (at - start) / blocks[i]!.tokens : 0 }
    start = end
  }
  return { at, total, block: blocks.length, within: 1 }
}

/** A stretch of the prompt (token offsets in the preview's count) against the boundary. */
export function stateOf(start: number, end: number, boundary: Boundary): CacheState {
  if (end <= boundary.at) return 'cached'
  if (start >= boundary.at) return 'new'
  return 'partial'
}

/** The state of each block, in order. */
export function blockStates(blocks: readonly { tokens: number }[], boundary: Boundary): CacheState[] {
  let start = 0
  return blocks.map((b) => {
    const end = start + b.tokens
    const s = stateOf(start, end, boundary)
    start = end
    return s
  })
}

export interface TextSpan { msg: number; start: number; end: number; part: number }

/** The state of each source part, from where its marks sit. Offsets inside a block are characters; they are turned into
 *  tokens in proportion, which is cheap and close enough for a mark. A part with no mark in the request has no state. */
export function partStates(
  blocks: readonly { msg: number; tokens: number; length: number }[],
  spans: readonly TextSpan[],
  partCount: number,
  boundary: Boundary,
): (CacheState | null)[] {
  const begin = new Map<number, { start: number; tokens: number; length: number }>()
  let at = 0
  for (const b of blocks) {
    begin.set(b.msg, { start: at, tokens: b.tokens, length: b.length })
    at += b.tokens
  }
  const lo: number[] = new Array(partCount).fill(Number.POSITIVE_INFINITY)
  const hi: number[] = new Array(partCount).fill(-1)
  for (const s of spans) {
    const b = begin.get(s.msg)
    if (!b || s.part < 0 || s.part >= partCount || b.length <= 0) continue
    const a = b.start + (b.tokens * Math.min(s.start, b.length)) / b.length
    const z = b.start + (b.tokens * Math.min(s.end, b.length)) / b.length
    if (a < lo[s.part]!) lo[s.part] = a
    if (z > hi[s.part]!) hi[s.part] = z
  }
  return lo.map((a, i) => (hi[i]! < 0 ? null : stateOf(a, hi[i]!, boundary)))
}
