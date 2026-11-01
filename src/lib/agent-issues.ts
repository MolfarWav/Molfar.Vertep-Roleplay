// The checker's codes (E_*, W_*) as two plain sentences: what is wrong and how to fix it. The code itself stays on
// screen, small, for reports; the checker's English message is the fallback for a code not listed here.
// Template codes (E_TPL_*) have their own texts in the panel form (fg.tpl.err.*).

import type { MsgKey, Vars } from './i18n'

/** Every code that has a text here. A test keeps this equal to the codes the checker can emit. */
export const ISSUE_CODES = [
  'E_BIND', 'E_BUDGET', 'E_CALLS_MISMATCH', 'E_CYCLE', 'E_DASH_FIELD', 'E_DASH_OF', 'E_DASH_TYPE', 'E_DUP_NODE',
  'E_EDGE_DIRECTION', 'E_EDGE_NODE', 'E_EDGE_PORT', 'E_ENVELOPE', 'E_FORMAT_VERSION', 'E_HASH', 'E_ID', 'E_IF_EMPTY',
  'E_IF_OP', 'E_IF_OPERAND', 'E_INPUT_COUNT', 'E_JSON', 'E_NEEDS_MISMATCH', 'E_OUTPUT_COUNT', 'E_PANEL',
  'E_PARALLEL_INSERT', 'E_PARAM', 'E_PORT_ID', 'E_REGEX', 'E_REGEX_RISK', 'E_ROLE', 'E_ROUNDS', 'E_SCRIPT_LIMIT', 'E_SCRIPT_SYNTAX', 'E_SHOW_NOT_ALLOWED',
  'E_SIZE', 'E_STATE_FIELD', 'E_STATE_LIMIT', 'E_STATE_OP', 'E_STATE_TYPE', 'E_STATE_UNKNOWN', 'E_TRIGGER',
  'E_TWO_WIRES', 'E_TYPE', 'E_UNWIRED', 'E_WIDGET', 'W_ISLAND', 'W_LIMIT', 'W_UNKNOWN_TYPE',
] as const

export type IssueCode = (typeof ISSUE_CODES)[number]

type T = (key: MsgKey, vars?: Vars) => string

const known = new Set<string>(ISSUE_CODES)

/**
 * The sentences for one checker issue. `card` is the card the issue blames (its title), when the checker knows it.
 * `plain` is false for a code with no text: the caller then shows the checker's own message.
 */
export function issueText(code: string, t: T, ctx: { card?: string } = {}): { what: string; fix: string; plain: boolean } {
  if (!known.has(code)) return { what: '', fix: '', plain: false }
  const card = ctx.card?.trim() || t('ag.issue.thisCard')
  return {
    what: t(`ag.issue.${code}` as MsgKey, { card }),
    fix: t(`ag.issue.${code}.fix` as MsgKey, { card }),
    plain: true,
  }
}
