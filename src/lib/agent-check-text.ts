// The checker's codes (src/canvas-kit/boards/agent-check.js, mirrored in plugins/agents) said in the person's language: what
// happened, and what to do about it. The stable code stays on the line for diagnostics; the checker's own English message
// is kept as a detail only where it carries numbers or names a sentence cannot (`DETAIL_CODES`). Pure, so a test can hold it.

import type { MsgKey, Vars } from './i18n'

export interface CheckItem { code: string; message: string; node?: string }
export interface CheckText {
  /** the problem, in a sentence */
  what: string
  /** the way out ('' when the sentence already says it) */
  fix: string
  /** the checker's own words, for the codes whose message holds a number or a name; else null */
  detail: string | null
}

/**
 * Every code the checker can emit. A new code in the checker without a line here fails test/rp-agent-check-text.test.ts,
 * so a person never meets a bare code by surprise.
 */
export const CHECK_CODES = [
  'E_BIND', 'E_BUDGET', 'E_CALLS_MISMATCH', 'E_CYCLE', 'E_DASH_FIELD', 'E_DASH_OF', 'E_DASH_TYPE', 'E_DUP_NODE', 'E_EDGE_DIRECTION',
  'E_EDGE_NODE', 'E_EDGE_PORT', 'E_ENVELOPE', 'E_FORMAT_VERSION', 'E_HASH', 'E_ID', 'E_IF_EMPTY', 'E_IF_OP', 'E_IF_OPERAND', 'E_JSON',
  'E_INPUT_COUNT', 'E_NEEDS_MISMATCH', 'E_OUTPUT_COUNT', 'E_PANEL', 'E_PARALLEL_INSERT', 'E_PARAM', 'E_PORT_ID', 'E_REGEX',
  'E_REGEX_RISK', 'E_ROLE', 'E_ROUNDS', 'E_SHOW_NOT_ALLOWED', 'E_SIZE', 'E_STATE_FIELD', 'E_STATE_LIMIT', 'E_STATE_OP', 'E_STATE_TYPE',
  'E_STATE_UNKNOWN', 'E_TPL_FIELD', 'E_TPL_FORBIDDEN', 'E_TPL_UNCLOSED', 'E_TRIGGER', 'E_TWO_WIRES', 'E_TYPE', 'E_UNWIRED', 'E_WIDGET',
  'W_ISLAND', 'W_LIMIT', 'W_UNKNOWN_TYPE',
] as const

/** Codes whose message holds a number, a field name or a path the sentence cannot say; the message is shown under it. */
export const DETAIL_CODES: ReadonlySet<string> = new Set([
  'E_PANEL', 'E_PARAM', 'E_STATE_FIELD', 'E_STATE_LIMIT', 'E_STATE_TYPE', 'E_WIDGET', 'E_BIND', 'W_LIMIT',
])

const KNOWN: ReadonlySet<string> = new Set(CHECK_CODES)
export const isKnownCheckCode = (code: string): boolean => KNOWN.has(code)

/** The card a message names first (`"Title": ...`), for lists that do not hold the cards themselves. */
export function cardInMessage(message: string): string | undefined {
  return /^"([^"]{1,80})"/.exec(message)?.[1]
}

type T = (key: MsgKey, vars?: Vars) => string

/** The template errors already have full sentences, with the fix inside (panels-form.tsx). */
const TEMPLATE_KEYS: Record<string, MsgKey> = {
  E_TPL_FORBIDDEN: 'fg.tpl.err.forbidden',
  E_TPL_UNCLOSED: 'fg.tpl.err.unclosed',
  E_TPL_FIELD: 'fg.tpl.err.field',
}

/**
 * One checker line in words. `cardTitle` is the card the error blames when the caller can look it up; without it the
 * first quoted name of the message stands in for it, and a line with neither says "a card".
 */
export function explainCheck(item: CheckItem, t: T, cardTitle?: string): CheckText {
  if (!KNOWN.has(item.code)) return { what: item.message, fix: '', detail: null }
  const title = cardTitle ?? (item.node ? cardInMessage(item.message) : undefined)
  const where = title ? t('fg.ck.card', { name: title }) : t('fg.ck.aCard')
  const tpl = TEMPLATE_KEYS[item.code]
  if (tpl) return { what: t(tpl, { token: /\{\{[^{}]*\}\}/.exec(item.message)?.[0] ?? '' }), fix: '', detail: null }
  const what = t(`fg.ck.${item.code}` as MsgKey, { where })
  const fix = t(`fg.ck.${item.code}.fix` as MsgKey)
  return { what, fix, detail: DETAIL_CODES.has(item.code) ? item.message : null }
}
