// The agent board: the card set of an agent file (`vertep-canvas` v1, kind "agent"), the ports each card
// derives from its params, and the checker that decides whether a file may be installed.
// Format reference: docs/DATA-FORMATS.md, "Agents". The checker is pure (no DOM, no network): the editor,
// the installer and the future runner all call the same function, so they cannot disagree about a file.

import { fromFile, splitEnd, wouldCycle } from '../graph'
import type { BoardKind, CanvasFile, CanvasNode, Graph, PortDef } from '../graph'

type Params = Record<string, any> // card params are checked by the card's own rules below

const SOURCE_TYPE: Record<string, string | null> = {
  lastReply: 'text', lastUserMessage: 'text', history: 'text', card: 'text', persona: 'text', summary: 'text',
  authorNote: 'text', myPrevious: 'text', preGenInjections: 'text', parallelResults: 'text', state: null,
}
const shapeType = (spec: unknown): string => (spec === 'number' ? 'number' : spec === 'bool' ? 'flag' : 'text') // enum:a|b and text are text
const PORT_ID = /^[A-Za-z0-9_-]+$/
const slotsOf = (s: unknown): string[] => [...new Set([...String(s ?? '').matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)].map((m) => m[1]!))]
const shapeOut = (shape: unknown): PortDef[] => Object.entries((shape ?? {}) as Record<string, unknown>).map(([id, spec]) => ({ id, side: 'out' as const, type: shapeType(spec) }))
const one = (ports: PortDef[]): PortDef[] => ports.map((p) => (p.side === 'in' ? { ...p, max: 1 } : p)) // an input takes one wire

const ownType = (as: unknown): string => (as === 'number' ? 'number' : as === 'flag' ? 'flag' : 'text') // a state value on a wire
const itemPorts = (item: unknown): PortDef[] => Object.entries((item ?? {}) as Record<string, unknown>).map(([id, spec]) => ({ id, side: 'in' as const, type: ownType(spec) }))
const whenDone: PortDef[] = [{ id: 'when', side: 'in', type: 'signal', optional: true }, { id: 'done', side: 'out', type: 'signal' }]

interface Card {
  label: string
  colorVar: string
  hint: string
  ports: (p: Params) => PortDef[]
  /** permission tokens the card needs (shown on the install screen, never trusted from the file) */
  needs: (p: Params) => string[]
  /** model calls the card can make per run */
  calls?: number
}

const OUTPUT_TEXT_KINDS = ['prompt-insert', 'note', 'choices']
const NEEDS_BY_OUTPUT: Record<string, string[]> = { 'prompt-insert': ['write:prompt'], note: ['show:note'], choices: ['show:choices'] }

export const AGENT_CARDS: Record<string, Card> = {
  'agent.input': {
    label: 'Input', colorVar: '--k-data', hint: 'What the agent receives. What is not listed here, the agent cannot see.',
    ports: (p) => (p.give ?? []).map((g: Params) => ({ id: g.id, side: 'out' as const, type: g.source === 'state' ? (g.as === 'number' ? 'number' : 'text') : (SOURCE_TYPE[g.source] ?? 'text') })),
    needs: (p) => (p.give ?? []).map((g: Params) => (g.source === 'state' ? `read:state.${g.field}` : `read:${g.source}`)),
  },
  'agent.output': {
    label: 'Output', colorVar: '--k-main', hint: 'Where the result goes: state, the prompt, a note or buttons.',
    ports: (p) => [{ id: 'in', side: 'in', type: OUTPUT_TEXT_KINDS.includes(p.kind) ? 'text' : 'signal' }],
    needs: (p) => NEEDS_BY_OUTPUT[p.kind] ?? [],
  },
  'text.template': {
    label: 'Template', colorVar: '--k-data', hint: 'Text with {{slots}}; every slot is an input.',
    ports: (p) => [...slotsOf(p.text).map((id) => ({ id, side: 'in' as const, type: 'text' })), { id: 'text', side: 'out', type: 'text' }],
    needs: () => [],
  },
  'model.ask': {
    label: 'Ask the model', colorVar: '--k-model', hint: 'One model call: text, yes/no or JSON.', calls: 1,
    ports: (p) => {
      const out: PortDef[] = p.answer?.as === 'json' ? shapeOut(p.answer.shape)
        : p.answer?.as === 'yesno' ? [{ id: 'answer', side: 'out', type: 'flag' }, { id: 'reason', side: 'out', type: 'text' }]
        : [{ id: 'text', side: 'out', type: 'text' }]
      return [...slotsOf(p.prompt).map((id) => ({ id, side: 'in' as const, type: 'text' })), ...out]
    },
    needs: () => ['llm'],
  },
  'data.parse': {
    label: 'Parse JSON', colorVar: '--k-model', hint: 'Check text against a shape.',
    ports: (p) => [{ id: 'text', side: 'in', type: 'text' }, ...shapeOut(p.shape), { id: 'failed', side: 'out', type: 'signal' }],
    needs: () => [],
  },
  'logic.if': {
    label: 'If', colorVar: '--k-logic', hint: 'Yes, No or Unknown. Never calls the model.',
    ports: (p) => [
      ...(p.inputs ?? []).map((i: Params) => ({ id: i.id, side: 'in' as const, type: i.type })),
      ...['yes', 'no', 'unknown'].map((id) => ({ id, side: 'out' as const, type: 'signal' })),
    ],
    needs: (p) => (p.rows ?? []).flatMap((r: Params) => [r.left, r.right]).filter((o: Params | undefined) => o?.from === 'state').map((o: Params) => `read:state.${o.field}`),
  },
  'logic.merge': {
    label: 'Merge', colorVar: '--k-logic', hint: 'Fires when any of its inputs fires.',
    ports: (p) => [...Array.from({ length: p.count ?? 2 }, (_, i) => ({ id: `i${i + 1}`, side: 'in' as const, type: 'signal' })), { id: 'out', side: 'out', type: 'signal' }],
    needs: () => [],
  },
  'write.state': {
    label: 'Write to Dashboard', colorVar: '--k-write', hint: 'Queued, applied only after a successful run.',
    ports: (p) => [{ id: 'value', side: 'in', type: p.as === 'number' ? 'number' : 'text' }, { id: 'when', side: 'in', type: 'signal', optional: true }, { id: 'done', side: 'out', type: 'signal' }],
    needs: (p) => [`write:state.${p.field}`],
  },
  'state.read': {
    label: 'Read own state', colorVar: '--k-data', hint: 'The current value of one of the agent\'s own fields.',
    ports: (p) => [{ id: 'value', side: 'out', type: ownType(p.as) }],
    needs: (p) => [`read:own.${p.field}`],
  },
  'state.set': {
    label: 'Set own state', colorVar: '--k-write', hint: 'Replaces the value of one own field. Queued like every write.',
    ports: (p) => [{ id: 'value', side: 'in', type: ownType(p.as) }, ...whenDone],
    needs: (p) => [`write:own.${p.field}`],
  },
  'state.add': {
    label: 'Add to own number', colorVar: '--k-write', hint: 'Adds or subtracts. The result is clamped by the field\'s limits; the code counts, not the model.',
    ports: () => [{ id: 'by', side: 'in', type: 'number', optional: true }, ...whenDone], // `by` or the card's own `amount`
    needs: (p) => [`write:own.${p.field}`],
  },
  'state.list': {
    label: 'Change own list', colorVar: '--k-write', hint: 'Add, update or remove one entry of an own list.',
    ports: (p) => [...(p.op === 'remove' ? [{ id: 'key', side: 'in' as const, type: ownType((p.item ?? {})[p.key]) }] : itemPorts(p.item)), ...whenDone],
    needs: (p) => [`write:own.${p.field}`],
  },
  note: { label: 'Note', colorVar: '--k-data', hint: 'A note for people; never sent to a model.', ports: () => [], needs: () => [] },
}

/** The board the editor and `canConnect` use for agent files. Wiring rules shared with the checker: types must match, one wire per input, no loops. */
export const AGENT_BOARD: BoardKind = {
  kind: 'agent',
  types: Object.fromEntries(
    Object.entries(AGENT_CARDS).map(([type, c]) => [type, { type, label: c.label, colorVar: c.colorVar, hint: c.hint, ports: [], portsFor: (p: Record<string, unknown>) => one(c.ports(p as Params)), deletable: type !== 'agent.input' }]),
  ),
  canConnect: (g: Graph, from: string, to: string) =>
    wouldCycle({ nodes: g.nodes, edges: g.edges.filter((e) => !e.locked) }, from, to)
      ? { ok: false, reason: 'That would make a loop. Agents have no loops in this version' }
      : { ok: true },
}

const OPS: Record<string, string[]> = {
  text: ['eq', 'neq', 'contains', 'notContains', 'in', 'isSet', 'isMissing'],
  number: ['lt', 'lte', 'eq', 'gte', 'gt', 'between', 'isSet', 'isMissing'],
  flag: ['isYes', 'isNo', 'isUnknown'],
}

/** Where an Output of each kind may show its result. The first entry is the default place. */
export const SHOW_BY_KIND: Record<string, string[]> = {
  'state-patch': ['log', 'feed', 'top1', 'top2', 'float', 'toast'],
  note: ['note', 'log', 'feed', 'top1', 'float'],
  'prompt-insert': ['inspector', 'note'],
  choices: ['bottom', 'log', 'float'],
}

export interface AgentIssue { code: string; message: string; node?: string }
export interface AgentDerived { needs: string[]; maxCalls: number; hash: string }
export interface AgentReport { errors: AgentIssue[]; warnings: AgentIssue[]; derived: AgentDerived | null }

const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
  : v

const sha256Hex = async (text: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Hash of what the agent IS: the header (without `derived`), the cards without their position, the wires. Moving a card does not change it. */
export const agentHash = async (f: CanvasFile): Promise<string> => {
  const { derived: _derived, ...agent } = (f.agent ?? {}) as Params
  const nodes = f.nodes.map(({ x: _x, y: _y, ...n }) => n)
  return `sha256:${await sha256Hex(JSON.stringify(canon({ agent, nodes, edges: f.edges })))}`
}


type Err = (code: string, message: string, node?: string) => void
interface StateField { type: 'number' | 'text' | 'flag' | 'list'; item?: Record<string, string> }
const FIELD_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/
const SCALARS = ['number', 'text', 'flag']
const isObj = (v: unknown): v is Params => !!v && typeof v === 'object' && !Array.isArray(v)

/** The `state` section of the header: fields the agent owns. Returns only the well-formed fields, so later checks do not trip over a broken one. */
function checkState(raw: unknown, err: Err): Record<string, StateField> {
  const out: Record<string, StateField> = {}
  if (raw === undefined) return out
  if (!isObj(raw)) { err('E_STATE_FIELD', 'agent.state must be an object of fields'); return out }
  const entries = Object.entries(raw)
  if (entries.length > 40) err('E_STATE_LIMIT', 'An agent may own at most 40 state fields')
  for (const [id, spec] of entries) {
    if (!FIELD_ID.test(id)) { err('E_STATE_FIELD', `State field "${id}": the name may use letters, digits, _ and -, and starts with a letter`); continue }
    if (!isObj(spec) || ![...SCALARS, 'list'].includes(spec.type)) { err('E_STATE_FIELD', `State field "${id}": type must be number, text, flag or list`); continue }
    if (spec.type === 'number') {
      const nums = ['min', 'max', 'start'].filter((k) => spec[k] !== undefined)
      if (nums.some((k) => !Number.isFinite(spec[k]))) { err('E_STATE_FIELD', `State field "${id}": min, max and start must be numbers`); continue }
      if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) { err('E_STATE_FIELD', `State field "${id}": min is above max`); continue }
      if (spec.start !== undefined && ((spec.min !== undefined && spec.start < spec.min) || (spec.max !== undefined && spec.start > spec.max))) { err('E_STATE_FIELD', `State field "${id}": start is outside min..max`); continue }
    }
    if (spec.type === 'text' && spec.start !== undefined && typeof spec.start !== 'string') { err('E_STATE_FIELD', `State field "${id}": start must be text`); continue }
    if (spec.type === 'flag' && spec.start !== undefined && typeof spec.start !== 'boolean') { err('E_STATE_FIELD', `State field "${id}": start must be true or false`); continue }
    if (spec.type === 'list') {
      if (!Number.isInteger(spec.max) || spec.max < 1 || spec.max > 500) { err('E_STATE_LIMIT', `State field "${id}": a list needs max, a whole number from 1 to 500`); continue }
      const item = isObj(spec.item) ? Object.entries(spec.item) : []
      if (!item.length || item.length > 8 || item.some(([k, t]) => !FIELD_ID.test(k) || !SCALARS.includes(t as string))) { err('E_STATE_FIELD', `State field "${id}": a list needs "item", 1 to 8 fields of type number, text or flag`); continue }
      out[id] = { type: 'list', item: Object.fromEntries(item) as Record<string, string> }
      continue
    }
    out[id] = { type: spec.type }
  }
  return out
}

const WIDGET_BIND: Record<string, string> = { meter: 'number', number: 'number', counter: 'number', table: 'list', list: 'list', log: 'list', text: 'text' }
export const PANEL_PLACES = ['top1', 'top2', 'float']
const TPL_TAGS = /<\s*(script|iframe|object|embed|link|meta|base|form|frame|frameset|applet|foreignobject)\b/i
const TPL_BAD = [
  /[\s"'/]on[a-z]{2,}\s*=/i, // event handlers
  /(?:^|[\s"'/])(?:src|srcdoc|href|xlink:href|action|formaction|poster|background)\s*=/i, // anything the browser would load or follow
  /url\s*\(/i, /@import/i, /javascript:/i, /expression\s*\(/i,
]

/** Template slots of an html widget: `{{field}}`, `{{#each list}}…{{/each}}` (fields of the entry inside), `{{#if field}}…{{/if}}`. */
function checkTemplate(tpl: string, state: Record<string, StateField>, where: string, err: Err): void {
  if (TPL_TAGS.test(tpl) || TPL_BAD.some((re) => re.test(tpl))) { err('E_TPL_FORBIDDEN', `${where}: the template has markup that can run code or load something (script, frames, event handlers, src/href, url())`); return }
  const stack: Array<{ kind: 'each' | 'if'; scope: Record<string, string> | null }> = []
  const scopeNow = (): Record<string, string> => { const top = [...stack].reverse().find((x) => x.kind === 'each'); return top ? top.scope! : Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.type])) }
  for (const m of tpl.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    const tag = m[1]!
    if (tag === '/each' || tag === '/if') {
      if (stack.pop()?.kind !== tag.slice(1)) { err('E_TPL_UNCLOSED', `${where}: {{${tag}}} closes something that is not open`); return }
      continue
    }
    const open = /^#(each|if)\s+([A-Za-z][A-Za-z0-9_-]*)$/.exec(tag)
    if (open) {
      const field = open[2]!
      const scope = scopeNow()
      if (!(field in scope)) { err('E_TPL_FIELD', `${where}: {{${tag}}} names "${field}", which is not a field here`); return }
      if (open[1] === 'each') {
        if (stack.some((x) => x.kind === 'each')) { err('E_TPL_FIELD', `${where}: {{#each}} inside {{#each}} is not supported`); return }
        if (scope[field] !== 'list') { err('E_TPL_FIELD', `${where}: {{#each ${field}}} needs a list field`); return }
        stack.push({ kind: 'each', scope: state[field]!.item! })
      } else stack.push({ kind: 'if', scope: null })
      continue
    }
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(tag)) { err('E_TPL_FIELD', `${where}: {{${tag}}} is not a field, {{#each}} or {{#if}}`); return }
    const t = scopeNow()[tag]
    if (!t) { err('E_TPL_FIELD', `${where}: {{${tag}}} is not a field here`); return }
    if (t === 'list') { err('E_TPL_FIELD', `${where}: {{${tag}}} is a list; use {{#each ${tag}}}`); return }
  }
  if (stack.length) err('E_TPL_UNCLOSED', `${where}: {{#${stack[stack.length - 1]!.kind}}} is never closed`)
}

/** The `panels` section: what the agent shows beside the chat. A description, never code. */
function checkPanels(raw: unknown, state: Record<string, StateField>, err: Err): number {
  if (raw === undefined) return 0
  if (!Array.isArray(raw) || raw.length > 4) { err('E_PANEL', 'agent.panels must be a list of at most 4 panels'); return 0 }
  const ids = new Set<string>()
  for (const [i, pn] of raw.entries()) {
    const at = `Panel ${i + 1}`
    if (!isObj(pn) || !/^[a-z0-9][a-z0-9-]{0,30}$/.test(pn.id ?? '') || ids.has(pn.id)) { err('E_PANEL', `${at}: needs a unique lowercase id`); continue }
    ids.add(pn.id)
    if (typeof pn.title !== 'string' || !pn.title.trim() || pn.title.length > 60) err('E_PANEL', `${at}: title must be text of 1-60 characters`)
    if (pn.place !== undefined && !PANEL_PLACES.includes(pn.place)) err('E_PANEL', `${at}: place must be one of ${PANEL_PLACES.join(', ')}`)
    if (!Array.isArray(pn.widgets) || !pn.widgets.length || pn.widgets.length > 20) { err('E_PANEL', `${at}: needs 1-20 widgets`); continue }
    for (const [j, w] of pn.widgets.entries()) {
      const where = `${at}, widget ${j + 1}`
      if (!isObj(w)) { err('E_WIDGET', `${where}: not an object`); continue }
      if (w.w === 'actions') {
        const items = Array.isArray(w.items) ? w.items : []
        if (!items.length || items.length > 8 || items.some((x: Params) => !isObj(x) || typeof x.label !== 'string' || !x.label.trim() || typeof x.send !== 'string' || !x.send.trim() || x.send.length > 500)) err('E_WIDGET', `${where}: actions needs 1-8 items, each with a label and a "send" text up to 500 characters`)
        continue
      }
      if (w.w === 'html') {
        if (typeof w.template !== 'string' || !w.template.trim() || w.template.length > 8192) err('E_WIDGET', `${where}: html needs a template of up to 8192 characters`)
        else checkTemplate(w.template, state, where, err)
        continue
      }
      const want = WIDGET_BIND[w.w]
      if (!want) { err('E_WIDGET', `${where}: unknown widget "${w.w}"`); continue }
      const field = state[w.bind]
      if (!field) { err('E_BIND', `${where}: bind "${w.bind}" is not a field in agent.state`); continue }
      if (field.type !== want) { err('E_BIND', `${where}: a ${w.w} shows a ${want} field, but "${w.bind}" is ${field.type}`); continue }
      if (w.w === 'table' && (!Array.isArray(w.columns) || !w.columns.length || w.columns.some((c: unknown) => typeof c !== 'string' || !(c in field.item!)))) err('E_BIND', `${where}: columns must be fields of the entries of "${w.bind}"`)
    }
  }
  return raw.length
}

/** Extra rules of the four cards that touch the agent's own state: the field must exist, with the type the card says. */
function checkStateCard(n: CanvasNode, state: Record<string, StateField>, err: Err): void {
  const p = (n.params ?? {}) as Params
  const f = state[p.field]
  if (!f) { err('E_STATE_UNKNOWN', `"${n.title}" uses the field "${p.field}", which is not in agent.state`, n.id); return }
  if (n.type === 'state.add') { if (f.type !== 'number') err('E_STATE_TYPE', `"${n.title}" adds to "${p.field}", which is ${f.type}, not number`, n.id); return }
  if (n.type === 'state.read' || n.type === 'state.set') {
    if (f.type === 'list' || f.type !== p.as) err('E_STATE_TYPE', `"${n.title}" says ${p.as}, but "${p.field}" is ${f.type}. Lists change only through a "Change own list" card`, n.id)
    return
  }
  // state.list
  if (f.type !== 'list') { err('E_STATE_TYPE', `"${n.title}" changes a list, but "${p.field}" is ${f.type}`, n.id); return }
  if (!['add', 'update', 'remove'].includes(p.op)) { err('E_STATE_OP', `"${n.title}": op must be add, update or remove`, n.id); return }
  if (p.op !== 'add' && !(p.key in f.item!)) err('E_STATE_TYPE', `"${n.title}": key "${p.key}" is not a field of the entries of "${p.field}"`, n.id)
  if (JSON.stringify(canon(p.item)) !== JSON.stringify(canon(f.item))) err('E_STATE_TYPE', `"${n.title}": item does not match the entries of "${p.field}"`, n.id)
}

/** Checks an agent file. `derived` is what the file ought to declare (needs, calls, hash); a file that declares something else is refused. */
export async function validateAgent(raw: unknown): Promise<AgentReport> {
  const errors: AgentIssue[] = []
  const warnings: AgentIssue[] = []
  const err = (code: string, message: string, node?: string) => errors.push({ code, message, ...(node ? { node } : {}) })
  const warn = (code: string, message: string, node?: string) => warnings.push({ code, message, ...(node ? { node } : {}) })
  const parsed = fromFile(raw)
  if ('error' in parsed || parsed.file.kind !== 'agent') return { errors: [{ code: 'E_ENVELOPE', message: 'Not a vertep-canvas v1 file of kind "agent"' }], warnings, derived: null }
  const f = parsed.file
  const a = (f.agent ?? {}) as Params
  if (a.formatVersion !== 1) err('E_FORMAT_VERSION', 'agent.formatVersion must be 1')
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(a.id ?? '')) err('E_ID', 'agent.id must be a lowercase slug of 2-41 characters')
  if (!['before', 'parallel', 'after', 'manual'].includes(a.trigger?.when)) err('E_TRIGGER', 'trigger.when must be before, parallel, after or manual')
  if (a.trigger?.when === 'parallel' && f.nodes.some((n) => n.type === 'agent.output' && (n.params as Params | undefined)?.kind === 'prompt-insert')) {
    err('E_PARALLEL_INSERT', 'A parallel agent runs beside the reply, so its text cannot reach this reply. Use "before" for a prompt insert, or write to state')
  }
  const state = checkState(a.state, err)
  const byId = new Map<string, CanvasNode>()
  for (const n of f.nodes) { if (byId.has(n.id)) err('E_DUP_NODE', `Two cards share the id ${n.id}`, n.id); byId.set(n.id, n) }
  const ports = new Map<string, PortDef[]>()
  const needs = new Set<string>()
  let maxCalls = 0
  for (const n of f.nodes) {
    const card = AGENT_CARDS[n.type]
    if (!card) { warn('W_UNKNOWN_TYPE', `Card "${n.title}" has an unknown type ${n.type}; it is kept, shown grey, and the agent will not run`, n.id); continue }
    const p = (n.params ?? {}) as Params
    const list = card.ports(p)
    for (const pt of list) if (!PORT_ID.test(pt.id)) err('E_PORT_ID', `Port id "${pt.id}" on "${n.title}" may use only letters, digits, _ and -`, n.id)
    ports.set(n.id, list)
    for (const t of card.needs(p)) needs.add(t)
    maxCalls += card.calls ?? 0
    if (n.type.startsWith('state.')) checkStateCard(n, state, err)
    if (n.type === 'model.ask' && !a.models?.[p.role]) err('E_ROLE', `"${n.title}" asks for the model role "${p.role}", which agent.models does not declare`, n.id)
    if (n.type === 'logic.if') {
      const inTypes = Object.fromEntries((p.inputs ?? []).map((i: Params) => [i.id, i.type]))
      if (!(p.rows ?? []).length) err('E_IF_EMPTY', `"${n.title}" has no rules`, n.id)
      for (const r of p.rows ?? []) {
        const t = r.left?.from === 'wire' ? inTypes[r.left.port]
          : r.left?.from === 'state' ? r.left.as
          : r.left?.from === 'chat' ? (r.left.what === 'messageCount' ? 'number' : 'text')
          : typeof r.left?.value === 'number' ? 'number' : 'text'
        if (!t) err('E_IF_OPERAND', `A rule in "${n.title}" reads a port that is not declared in inputs`, n.id)
        else if (!OPS[t]?.includes(r.op)) err('E_IF_OP', `"${r.op}" does not work on ${t} values (rule in "${n.title}")`, n.id)
      }
    }
  }
  if (checkPanels(a.panels, state, err)) needs.add('show:panel')
  const inputs = f.nodes.filter((n) => n.type === 'agent.input')
  const outputs = f.nodes.filter((n) => n.type === 'agent.output')
  if (inputs.length !== 1) err('E_INPUT_COUNT', `An agent needs exactly one Input card, found ${inputs.length}`)
  if (outputs.length < 1) err('E_OUTPUT_COUNT', 'An agent needs at least one Output card')
  for (const o of outputs) {
    const op = (o.params ?? {}) as Params
    if (op.show != null && !(SHOW_BY_KIND[op.kind] ?? []).includes(op.show)) err('E_SHOW_NOT_ALLOWED', `Output "${o.title}": "${op.show}" is not a place where a "${op.kind}" result can be shown`, o.id)
  }
  const wiresIn = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const e of f.edges) {
    const [fn, fp] = splitEnd(e.from)
    const [tn, tp] = splitEnd(e.to)
    if (!byId.has(fn) || !byId.has(tn)) { err('E_EDGE_NODE', `Wire ${e.id} points at a card that is not there`); continue }
    const fromPorts = ports.get(fn)
    const toPorts = ports.get(tn)
    if (!fromPorts || !toPorts) continue // unknown card type: nothing to check
    const from = fromPorts.find((p) => p.id === fp)
    const to = toPorts.find((p) => p.id === tp)
    if (!from || !to) { err('E_EDGE_PORT', `Wire ${e.id} points at a port that does not exist (${!from ? e.from : e.to})`); continue }
    if (from.side !== 'out' || to.side !== 'in') { err('E_EDGE_DIRECTION', `Wire ${e.id} must go from an output to an input`); continue }
    if (from.type !== to.type) err('E_TYPE', `Wire ${e.id}: a ${from.type} output cannot feed a ${to.type} input`)
    const key = `${tn}:${tp}`
    const count = (wiresIn.get(key) ?? 0) + 1
    wiresIn.set(key, count)
    if (count > 1) err('E_TWO_WIRES', `Input "${tp}" on "${byId.get(tn)!.title}" has more than one wire`, tn)
    adj.set(fn, [...(adj.get(fn) ?? []), tn])
  }
  for (const n of f.nodes) {
    for (const p of ports.get(n.id) ?? []) {
      if (p.side === 'in' && !p.optional && !wiresIn.has(`${n.id}:${p.id}`)) err('E_UNWIRED', `Input "${p.id}" on "${n.title}" has no wire`, n.id)
    }
  }
  // acyclic: depth-first search with colours
  const colour = new Map<string, 1 | 2>()
  const dfs = (id: string): boolean => {
    colour.set(id, 1)
    for (const next of adj.get(id) ?? []) {
      if (colour.get(next) === 1) return true
      if (!colour.get(next) && dfs(next)) return true
    }
    colour.set(id, 2)
    return false
  }
  for (const n of f.nodes) {
    if (!colour.get(n.id) && dfs(n.id)) { err('E_CYCLE', 'The wires make a loop. Agents have no loops in this version'); break }
  }
  for (const n of f.nodes) {
    if (n.type === 'state.add' && !wiresIn.has(`${n.id}:by`) && !Number.isFinite((n.params as Params | undefined)?.amount)) err('E_UNWIRED', `"${n.title}" needs a wire into "by" or a fixed amount`, n.id)
  }
  const wired = new Set(f.edges.flatMap((e) => [splitEnd(e.from)[0], splitEnd(e.to)[0]]))
  for (const n of f.nodes) if (n.type !== 'note' && ports.has(n.id) && !wired.has(n.id)) warn('W_ISLAND', `"${n.title}" is not connected to anything`, n.id)
  if (a.limits?.maxCalls !== undefined && a.limits.maxCalls < maxCalls) err('E_BUDGET', `The agent can make ${maxCalls} model calls but limits.maxCalls is ${a.limits.maxCalls}`)
  const derived: AgentDerived = { needs: [...needs].sort(), maxCalls, hash: await agentHash(f) }
  const d = a.derived as Partial<AgentDerived> | undefined
  if (d) {
    if (JSON.stringify(d.needs) !== JSON.stringify(derived.needs)) err('E_NEEDS_MISMATCH', `The file declares needs ${JSON.stringify(d.needs)} but its cards need ${JSON.stringify(derived.needs)}`)
    if (d.maxCalls !== derived.maxCalls) err('E_CALLS_MISMATCH', `The file declares ${d.maxCalls} model calls but its cards can make ${derived.maxCalls}`)
    if (d.hash !== derived.hash) err('E_HASH', 'The file changed after it was compiled (hash differs). Compile it again')
  }
  return { errors, warnings, derived }
}

/** Fills `agent.derived` from the cards, so a file made in the editor is always consistent. Returns the file and the report of the filled file. */
export async function compileAgent(raw: unknown): Promise<{ file: CanvasFile; report: AgentReport } | { error: string }> {
  const parsed = fromFile(raw)
  if ('error' in parsed) return { error: parsed.error }
  const { derived: _old, ...header } = (parsed.file.agent ?? {}) as Params
  const file: CanvasFile = { ...parsed.file, agent: header }
  const first = await validateAgent(file)
  if (!first.derived) return { error: first.errors[0]?.message ?? 'Not an agent file' }
  file.agent = { ...header, derived: first.derived }
  return { file, report: await validateAgent(file) }
}
