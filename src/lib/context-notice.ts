// "The context window is too small": what the engine reports when the history is already down to its last message and
// the prompt still does not fit (plugins/engine buildPrompt, `tooSmall`). The turn is not stopped; older messages were
// dropped and the rest was sent, and this says why that may fail and what to change. Pure: the caller passes `t`.

import type { useT } from '@/hooks/use-t'

type T = ReturnType<typeof useT>

export interface TooSmall {
  /** the window the prompt was budgeted against */
  window: number
  /** what the prompt still needs after the history was cut down, in tokens (an estimate) */
  need: number
  /** the room it had: the window less the reply reserve and the inserts */
  budget: number
  /** the room kept for the reply (max output tokens, or 1024 when none is set) */
  reply: number
  /** false when the model's window is not known and the 32,768 default was used */
  windowKnown?: boolean
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)

/** The engine's `tooSmall` object, or null when it is absent or malformed. */
export function parseTooSmall(v: unknown): TooSmall | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const window = num(o.window)
  const need = num(o.need)
  const budget = num(o.budget)
  const reply = num(o.reply)
  if (window === null || need === null || budget === null || reply === null) return null
  return { window, need, budget, reply, ...(o.windowKnown === false ? { windowKnown: false } : {}) }
}

/** The reply reserve is most of the window: lowering Max output tokens is the first thing to try. */
export function replyTakesMost(ts: TooSmall): boolean {
  return ts.reply * 2 >= ts.window
}

export function contextNotice(ts: TooSmall, t: T): { title: string; description: string } {
  const fmt = (n: number) => n.toLocaleString('en-US')
  const lines = [
    replyTakesMost(ts)
      ? t('ctx.small.reply', { reply: fmt(ts.reply), window: fmt(ts.window) })
      : t('ctx.small.body', { need: fmt(ts.need), budget: fmt(ts.budget), window: fmt(ts.window), reply: fmt(ts.reply) }),
  ]
  if (ts.windowKnown === false) lines.push(t('ctx.small.unknown', { window: fmt(ts.window) }))
  return { title: t('ctx.small.title'), description: lines.join(' ') }
}
