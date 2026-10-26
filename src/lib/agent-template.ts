// The `html` widget of an agent panel: a template with slots (`{{field}}`, `{{#each list}}…{{/each}}`,
// `{{#if field}}…{{/if}}`) filled from the agent's own state. The template is the agent author's markup, vetted by the
// checker at install; every VALUE is escaped here, because values come from a model. Pure, so a test can hold it.

import { templateProblems } from '@/canvas-kit/boards/agent-check'

type Schema = Record<string, { type: string; min?: number; max?: number; item?: Record<string, string> }>
type Own = Record<string, unknown>

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }
export const escapeHtml = (s: string): string => s.replace(/[&<>"'`]/g, (c) => ESC[c]!)

/** One value as the panels print it: whole numbers as they are, others with one decimal, a flag as a mark. */
export const fmtValue = (v: unknown): string =>
  typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : typeof v === 'boolean' ? (v ? '✓' : '–') : String(v ?? '—')

const MAX_ENTRIES = 50

const truthy = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : typeof v === 'number' ? v !== 0 : typeof v === 'string' ? v.trim() !== '' : v === true)

const entries = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)).slice(0, MAX_ENTRIES)

type Piece = { kind: 'text'; text: string } | { kind: 'slot'; field: string } | { kind: 'each' | 'if'; field: string; body: Piece[] }

/** The template as a tree. Tolerant: what does not parse stays plain text, so a bad template never throws. */
function parse(tpl: string): Piece[] {
  const root: Piece[] = []
  const stack: { kind: 'each' | 'if'; field: string; body: Piece[] }[] = []
  const here = () => (stack.length ? stack[stack.length - 1]!.body : root)
  let at = 0
  for (const m of tpl.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    const tag = m[1]!
    const open = /^#(each|if)\s+([A-Za-z][A-Za-z0-9_-]*)$/.exec(tag)
    const close = tag === '/each' || tag === '/if'
    const slot = /^[A-Za-z][A-Za-z0-9_-]*$/.test(tag)
    if (!open && !close && !slot) continue
    if (m.index > at) here().push({ kind: 'text', text: tpl.slice(at, m.index) })
    at = m.index + m[0].length
    if (open) {
      const node = { kind: open[1] as 'each' | 'if', field: open[2]!, body: [] as Piece[] }
      here().push(node)
      stack.push(node)
    } else if (close) {
      if (stack[stack.length - 1]?.kind === tag.slice(1)) stack.pop()
    } else here().push({ kind: 'slot', field: tag })
  }
  if (at < tpl.length) here().push({ kind: 'text', text: tpl.slice(at) })
  return root
}

function emit(pieces: Piece[], scope: Own): string {
  let out = ''
  for (const p of pieces) {
    if (p.kind === 'text') out += p.text
    else if (p.kind === 'slot') {
      const v = scope[p.field]
      out += Array.isArray(v) ? '' : escapeHtml(v === undefined ? '' : fmtValue(v))
    } else if (p.kind === 'if') {
      if (truthy(scope[p.field])) out += emit(p.body, scope)
    } else for (const e of entries(scope[p.field])) out += emit(p.body, e)
  }
  return out
}

/** The template with its slots filled. A field that is missing prints nothing; an {{#each}} takes at most 50 entries. */
export const renderTemplate = (tpl: string, own: Own): string => emit(parse(tpl), own)

/**
 * The markup to show, or what is wrong with the template. The checker already refused a bad template at install, so
 * this is a second look: a file that got in some other way draws nothing.
 */
export function drawTemplate(tpl: unknown, schema: Schema, own: Own): { html: string } | { problems: { code: string; message: string }[] } {
  const problems = templateProblems(tpl, schema)
  return problems.length ? { problems } : { html: renderTemplate(tpl as string, own) }
}

/** What a template is sampled with in the editor: filled values, or the empty state a new chat starts from. */
export function sampleState(schema: Schema, full: boolean, word: string): Own {
  const out: Own = {}
  for (const [id, f] of Object.entries(schema)) {
    if (f.type === 'number') out[id] = full ? (f.max !== undefined ? Math.round(((f.min ?? 0) + f.max) * 0.6) : 7) : f.min ?? 0
    else if (f.type === 'text') out[id] = full ? word : ''
    else if (f.type === 'flag') out[id] = full
    else out[id] = full ? [1, 2, 3].map((n) => sampleEntry(f.item ?? {}, n, word)) : []
  }
  return out
}

function sampleEntry(item: Record<string, string>, n: number, word: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).map(([k, type]) => [k, type === 'number' ? n * 3 : type === 'flag' ? n % 2 === 1 : `${word} ${n}`]))
}

/** The page a widget's markup is drawn in. No scripts (the frame is sealed), and no network: a style that names a url finds nothing. */
export const widgetDoc = (html: string, dark: boolean): string =>
  `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">` +
  `<style>:root{color-scheme:${dark ? 'dark' : 'light'}}html{background:transparent}body{margin:4px;font:13px/1.45 system-ui,sans-serif;color:CanvasText;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>${html}`

/** The slot buttons of the form: what a field of the agent can be put into the template as. */
export function slotsFor(schema: Schema): { label: string; insert: string }[] {
  const out: { label: string; insert: string }[] = []
  for (const [id, f] of Object.entries(schema)) {
    if (f.type === 'list') {
      const inner = Object.keys(f.item ?? {}).map((k) => `{{${k}}}`).join(' · ')
      out.push({ label: `${id} …`, insert: `{{#each ${id}}}\n<div>${inner}</div>\n{{/each}}` })
    } else {
      out.push({ label: id, insert: `{{${id}}}` })
      if (f.type === 'flag' || f.type === 'number' || f.type === 'text') out.push({ label: `if ${id}`, insert: `{{#if ${id}}}…{{/if}}` })
    }
  }
  return out
}
