// The agent executor: runs a checked agent file (see agent-check.js) against one chat turn.
// Format reference: docs/DATA-FORMATS.md, "Agents".
//
// Plain JavaScript for the same reason as agent-check.js: the runner plugin carries a copy of this code in the
// engine's QuickJS sandbox. Its only import is the sibling checker (stripped when the two are put together).
//
// It is PURE and STATELESS. It never calls a model, reads a file or writes one. A run is a series of calls with
// the same inputs and a growing `answers` map, the way the engine's two-phase generation works:
//   runAgent(file, ctx, {})            -> { status: "need", requests: [ ... ] }   the model calls that can run now
//   runAgent(file, ctx, { ask: {...} }) -> { status: "need", ... } again, or { status: "done", ... }
// Cards that do not call a model cost nothing and are simply evaluated again on every call.
//
// A wire carries a value, or one of three states: SKIP (this path did not fire), PENDING (waits for a model answer),
// and `undefined` (data that is missing: an empty field, an unread source). Missing data is not "no": a rule that
// reads it answers Unknown. A card that needs a value and gets SKIP or missing data is skipped, and so is
// everything that depends only on it; a skipped card costs nothing.

import { AGENT_CARDS, dashKey, splitEnd } from './agent-check.js';

const SKIP = { skip: true };
const PENDING = { pending: true };
const ABSENT = { absent: true }; // an optional input with no wire
const TEXT_MAX = 20000;
const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);
const asText = (v) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : v === true ? 'yes' : v === false ? 'no' : '');

// ---------- model answers ----------

const stripThinking = (text) => String(text ?? '').replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '').trim();

/** "YES"/"NO" on the first line; anything else is Unknown, not a failure. */
export function parseYesNo(text) {
  const t = stripThinking(text);
  const first = t.split('\n')[0].trim();
  // \b and \w know only Latin letters, so the word edge is spelled out
  const yes = /^[^A-Za-z\u0400-\u04FF]*(yes|так|y)(?![A-Za-z\u0400-\u04FF])/i.test(first);
  const no = /^[^A-Za-z\u0400-\u04FF]*(no|ні|ни|n)(?![A-Za-z\u0400-\u04FF])/i.test(first);
  const reason = t.split('\n').slice(1).join(' ').trim() || (yes || no ? first.replace(/^[^A-Za-z\u0400-\u04FF]*[A-Za-z\u0400-\u04FF]+[^A-Za-z\u0400-\u04FF]*/, '') : t);
  return { answer: yes && !no ? 'yes' : no && !yes ? 'no' : 'unknown', reason: clip(reason, 1000) };
}

/** The first JSON object in a reply (a code fence or chatter around it is fine). Null when there is none. */
export function extractJson(text) {
  const t = stripThinking(text).replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(t.slice(a, b + 1));
    return isPlain(v) ? v : null;
  } catch {
    return null;
  }
}

/** Checks a JSON object against a card's `shape` and turns it into wire values. `{ error }` when it does not fit. */
export function shapeValues(obj, shape) {
  const out = {};
  for (const [id, spec] of Object.entries(shape ?? {})) {
    const v = obj[id];
    if (typeof spec === 'string' && spec.startsWith('enum:')) {
      const options = spec.slice(5).split('|');
      if (typeof v !== 'string' || !options.includes(v.trim())) return { error: `"${id}" must be one of ${options.join(', ')}` };
      out[id] = v.trim();
    } else if (spec === 'number') {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (!Number.isFinite(n)) return { error: `"${id}" must be a number` };
      out[id] = n;
    } else if (spec === 'bool') {
      if (typeof v !== 'boolean') return { error: `"${id}" must be true or false` };
      out[id] = v ? 'yes' : 'no';
    } else {
      if (typeof v !== 'string' && typeof v !== 'number') return { error: `"${id}" must be text` };
      out[id] = clip(String(v), TEXT_MAX);
    }
  }
  return { values: out };
}

const shapeHint = (shape) =>
  '{' + Object.entries(shape ?? {}).map(([id, spec]) => `"${id}": ${typeof spec === 'string' && spec.startsWith('enum:') ? `"${spec.slice(5)}"` : spec === 'number' ? '0' : spec === 'bool' ? 'true' : '"text"'}`).join(', ') + '}';

/** The text sent to the model for a `model.ask` card: the author's prompt and the answer format the card expects. */
export function askPrompt(prompt, answer) {
  if (answer && answer.as === 'yesno') return prompt + '\n\nAnswer on the first line with exactly YES or NO. On the next line give one short reason.';
  if (answer && answer.as === 'json') return prompt + '\n\nAnswer with JSON only, no other text, in this shape (for "a|b" use exactly one of the options): ' + shapeHint(answer.shape);
  return prompt;
}

// ---------- dice, pick, extract, cut: plain code, no model ----------

const hash32 = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
/** A small seeded generator (mulberry32): the same seed gives the same numbers on every pass of one run. */
export function seeded(seed) {
  let a = hash32(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` dice of `sides` sides plus `bonus`: { total, rolls: "4, 17" }. */
export function rollDice(seed, p) {
  const count = Number.isInteger(p.count) ? p.count : 1;
  const sides = Number.isInteger(p.sides) ? p.sides : 20;
  const bonus = Number.isInteger(p.bonus) ? p.bonus : 0;
  const rnd = seeded(seed);
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(rnd() * sides));
  return { total: rolls.reduce((a, b) => a + b, 0) + bonus, rolls: rolls.join(', ') };
}

/** One line by weight (a weight is 1 when none is given): { index: 1-based, text }. */
export function pickWeighted(seed, items) {
  const weights = items.map((i) => (Number.isInteger(i.weight) ? i.weight : 1));
  let at = seeded(seed)() * weights.reduce((a, b) => a + b, 0);
  let index = 0;
  while (index < items.length - 1 && at >= weights[index]) { at -= weights[index]; index++; }
  return { index: index + 1, text: items[index].text };
}

/** The first match of a pattern (or every match, joined) as text; null when nothing matched. At most 20 matches. */
export function extractText(text, p) {
  const re = new RegExp(p.pattern, (p.flags || '') + 'g');
  const group = Number.isInteger(p.group) ? p.group : 0;
  const found = [];
  const src = clip(String(text), TEXT_MAX);
  for (let m = re.exec(src); m && found.length < (p.all ? 20 : 1); m = re.exec(src)) {
    if (m[0] === '') re.lastIndex++;
    const v = m[group];
    if (typeof v === 'string' && v.trim()) found.push(v.trim());
  }
  return found.length ? clip(found.join(typeof p.join === 'string' ? p.join : ', '), TEXT_MAX) : null;
}

/** The first or last `n` characters, words or lines of a text. */
export function cutText(text, p) {
  const t = String(text);
  const take = (parts, glue) => (p.keep === 'last' ? parts.slice(-p.n) : parts.slice(0, p.n)).join(glue);
  if (p.unit === 'words') return take(t.split(/\s+/).filter(Boolean), ' ');
  if (p.unit === 'lines') return take(t.split('\n'), '\n');
  return p.keep === 'last' ? t.slice(-p.n) : t.slice(0, p.n);
}

// ---------- If ----------

const Y = 'yes';
const N = 'no';
const U = 'unknown';

/** One rule of an If card: Y, N or U. Missing data is U (except isSet / isMissing, which are about exactly that). */
export function ruleResult(type, op, left, right) {
  const missing = left === undefined || left === null || left === '';
  if (type === 'flag') {
    const v = left === 'yes' || left === 'no' ? left : 'unknown';
    if (op === 'isYes') return v === 'unknown' ? U : v === 'yes' ? Y : N;
    if (op === 'isNo') return v === 'unknown' ? U : v === 'no' ? Y : N;
    if (op === 'isUnknown') return v === 'unknown' ? Y : N;
    return U;
  }
  if (op === 'isSet') return missing ? N : Y;
  if (op === 'isMissing') return missing ? Y : N;
  if (missing || right === undefined) return U;
  if (type === 'number') {
    const a = Number(left);
    if (!Number.isFinite(a)) return U;
    if (op === 'between') {
      const [lo, hi] = Array.isArray(right) ? right.map(Number) : [NaN, NaN];
      return Number.isFinite(lo) && Number.isFinite(hi) ? (a >= lo && a <= hi ? Y : N) : U;
    }
    const b = Number(right);
    if (!Number.isFinite(b)) return U;
    const t = op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'eq' ? a === b : op === 'gte' ? a >= b : op === 'gt' ? a > b : null;
    return t === null ? U : t ? Y : N;
  }
  const a = String(left);
  if (op === 'in') {
    const list = Array.isArray(right) ? right.map(String) : String(right).split(',').map((s) => s.trim());
    return list.includes(a) ? Y : N;
  }
  const b = String(right);
  const t = op === 'eq' ? a === b : op === 'neq' ? a !== b : op === 'contains' ? a.toLowerCase().includes(b.toLowerCase()) : op === 'notContains' ? !a.toLowerCase().includes(b.toLowerCase()) : null;
  return t === null ? U : t ? Y : N;
}

/** Rules combined by `match` (all, any, none). Unknown stays Unknown unless another rule already decides. */
export function combineRules(match, results) {
  if (!results.length) return U;
  const has = (r) => results.includes(r);
  if (match === 'any') return has(Y) ? Y : has(U) ? U : N;
  if (match === 'none') return has(Y) ? N : has(U) ? U : Y;
  return has(N) ? N : has(U) ? U : Y; // all
}

// ---------- state ----------

/** The agent's own fields as they start: numbers at `start` (else min, else 0), lists empty, the rest unset. */
export function initialOwn(schema) {
  const own = {};
  for (const [id, f] of Object.entries(schema ?? {})) {
    if (!isPlain(f)) continue;
    if (f.type === 'list') own[id] = [];
    else if (f.type === 'number') own[id] = Number.isFinite(f.start) ? f.start : Number.isFinite(f.min) ? f.min : 0;
    else if (f.start !== undefined) own[id] = f.start;
  }
  return own;
}

const withDefaults = (schema, own) => ({ ...initialOwn(schema), ...(isPlain(own) ? own : {}) });
const clampTo = (f, n) => Math.min(Number.isFinite(f.max) ? f.max : Infinity, Math.max(Number.isFinite(f.min) ? f.min : -Infinity, n));

/**
 * Applies the writes a run staged to the agent's own state. Returns the new state and what was refused.
 * Numbers stay inside the field's min and max (and a card's maxStep); a full list takes no new entry.
 */
export function applyWrites(schema, own, writes) {
  const next = withDefaults(schema, own);
  for (const k of Object.keys(next)) if (Array.isArray(next[k])) next[k] = next[k].map((x) => ({ ...x }));
  const refused = [];
  for (const w of writes ?? []) {
    const f = schema && schema[w.field];
    if (!f) { refused.push({ write: w, why: 'no such field' }); continue; }
    if (w.op === 'own.set') {
      if (f.type === 'number' && Number.isFinite(w.value)) next[w.field] = clampTo(f, w.value);
      else if (f.type === 'text' && typeof w.value === 'string') next[w.field] = clip(w.value, TEXT_MAX);
      else if (f.type === 'flag' && typeof w.value === 'boolean') next[w.field] = w.value;
      else refused.push({ write: w, why: 'wrong type' });
    } else if (w.op === 'own.add') {
      if (f.type !== 'number' || !Number.isFinite(w.by)) { refused.push({ write: w, why: 'wrong type' }); continue; }
      const step = w.clamp && Number.isFinite(w.clamp.maxStep) ? Math.min(Math.abs(w.by), Math.abs(w.clamp.maxStep)) * Math.sign(w.by) : w.by;
      next[w.field] = clampTo(f, (Number.isFinite(next[w.field]) ? next[w.field] : 0) + step);
    } else if (w.op === 'list.add' || w.op === 'list.update' || w.op === 'list.remove') {
      if (f.type !== 'list') { refused.push({ write: w, why: 'wrong type' }); continue; }
      const list = Array.isArray(next[w.field]) ? next[w.field] : [];
      const at = w.op === 'list.add' ? -1 : list.findIndex((e) => String(e[w.key]) === String(w.id));
      if (w.op === 'list.add') {
        if (list.length >= f.max) { refused.push({ write: w, why: 'list is full' }); continue; }
        list.push(w.item);
      } else if (at < 0) refused.push({ write: w, why: 'no such entry' });
      else if (w.op === 'list.remove') list.splice(at, 1);
      else list[at] = { ...list[at], ...w.item };
      next[w.field] = list;
    } else refused.push({ write: w, why: 'unknown op' });
  }
  return { own: next, refused };
}

// ---------- the run ----------

const slotRe = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;
const fill = (text, values) => String(text ?? '').replace(slotRe, (_, id) => asText(values[id]));
const short = (v) => (typeof v === 'string' ? clip(v, 200) : v);

/**
 * ctx: { inputs: { <give id>: text | number | undefined }, own: { <field>: value }, dash: { <field>: value }, chat: { messageCount, lastSpeaker }, seed }
 *   `seed` makes the dice and picks repeatable: the host gives the same text for the same reply, so every pass of a run rolls the same.
 *   `inputs` is what the host read for the agent's Input card; the executor trusts nothing else about the chat.
 * answers: { <model.ask card id>: { text } | { error } }
 * Returns { status: "need", requests, trace }, { status: "done", writes, outputs, calls, trace } or { status: "failed", reason, node, trace }.
 * With `ctx.explain` the result also has `wires`: what every output port carries, for the editor's trial run
 * (`{ "<node>:<port>": { state: "value", value } | { state: "skip" | "wait" | "missing" } }`). The runner never asks for it.
 */
export function runAgent(file, ctx, answers) {
  const seen = ctx && ctx.explain ? new Map() : null;
  const r = runCards(file, ctx, answers, seen);
  if (seen) {
    r.wires = {};
    for (const [k, v] of seen) r.wires[k] = v === SKIP ? { state: 'skip' } : v === PENDING ? { state: 'wait' } : v === undefined ? { state: 'missing' } : { state: 'value', value: v };
  }
  return r;
}

function runCards(file, ctx, answers, seen) {
  const nodes = file.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const schema = (file.agent && file.agent.state) || {};
  const own = withDefaults(schema, ctx && ctx.own);
  const inputs = (ctx && ctx.inputs) || {};
  const dash = (ctx && ctx.dash) || {};
  const chat = (ctx && ctx.chat) || {};
  const given = answers || {};
  const trace = [];
  const requests = [];
  const writes = [];
  const outputs = [];
  let calls = 0;

  // topological order (Kahn); the checker refused cycles, but a file that skipped it must not hang us
  const into = new Map();
  const after = new Map(nodes.map((n) => [n.id, []]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of file.edges) {
    const [fn] = splitEnd(e.from);
    const [tn, tp] = splitEnd(e.to);
    into.set(tn + ':' + tp, e.from);
    if (after.has(fn) && indeg.has(tn)) { after.get(fn).push(tn); indeg.set(tn, indeg.get(tn) + 1); }
  }
  const order = [];
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const nx of after.get(id)) { indeg.set(nx, indeg.get(nx) - 1); if (indeg.get(nx) === 0) queue.push(nx); }
  }
  if (order.length !== nodes.length) return { status: 'failed', reason: 'The wires make a loop', trace };

  const wire = seen || new Map(); // "node:port" -> value | SKIP | PENDING
  const setAll = (node, state) => { for (const p of AGENT_CARDS[node.type].ports(node.params || {})) if (p.side === 'out') wire.set(node.id + ':' + p.id, state); };

  for (const id of order) {
    const node = byId.get(id);
    const card = AGENT_CARDS[node.type];
    if (!card) return { status: 'failed', reason: `Unknown card type ${node.type}`, node: id, trace };
    const p = node.params || {};
    const ports = card.ports(p);
    const ins = {};
    for (const pt of ports) if (pt.side === 'in') ins[pt.id] = into.has(id + ':' + pt.id) ? wire.get(into.get(id + ':' + pt.id)) : ABSENT;
    const out = (port, v) => wire.set(id + ':' + port, v);
    const skip = () => { setAll(node, SKIP); trace.push({ node: id, status: 'skipped' }); };
    const wait = () => { setAll(node, PENDING); trace.push({ node: id, status: 'waiting' }); };
    // the state of a card's required inputs: SKIP beats PENDING beats missing data
    const gate = (required, optionalGate) => {
      const all = [...required.map((r) => ins[r]), ...(optionalGate ? [ins[optionalGate]] : [])];
      if (all.some((v) => v === SKIP)) return 'skip';
      if (all.some((v) => v === PENDING)) return 'wait';
      if (required.some((r) => ins[r] === undefined || ins[r] === ABSENT)) return 'skip';
      return 'run';
    };
    const ran = (o) => trace.push({ node: id, status: 'ran', ...(o ? { out: o } : {}) });

    if (node.type === 'agent.input') {
      for (const g of p.give || []) out(g.id, g.source === 'state' ? dash[dashKey(g)] : inputs[g.id]);
      ran();
    } else if (node.type === 'note') {
      // no ports
    } else if (node.type === 'state.read') {
      const v = own[p.field];
      out('value', typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
      ran({ [p.field]: short(v) });
    } else if (node.type === 'text.template') {
      const slots = ports.filter((x) => x.side === 'in').map((x) => x.id);
      const g = gate(slots);
      if (g === 'skip') skip(); else if (g === 'wait') wait();
      else { const text = clip(fill(p.text, ins), TEXT_MAX); out('text', text); ran({ text: short(text) }); }
    } else if (node.type === 'model.ask') {
      const slots = ports.filter((x) => x.side === 'in').map((x) => x.id);
      const g = gate(slots);
      if (g === 'skip') skip();
      else if (g === 'wait') wait();
      else {
        const a = given[id];
        if (!a) {
          requests.push({ node: id, role: p.role, prompt: askPrompt(fill(p.prompt, ins), p.answer), maxTokens: p.maxTokens, ...(p.batchKey ? { batchKey: p.batchKey } : {}) });
          wait();
        } else if (a.error || typeof a.text !== 'string') {
          return { status: 'failed', reason: `The model call of "${node.title}" failed${a.error ? ': ' + a.error : ''}`, node: id, trace };
        } else {
          calls++;
          const as = (p.answer && p.answer.as) || 'text';
          if (as === 'yesno') { const r = parseYesNo(a.text); out('answer', r.answer); out('reason', r.reason); ran({ answer: r.answer }); }
          else if (as === 'json') {
            const obj = extractJson(a.text);
            const r = obj ? shapeValues(obj, p.answer.shape) : { error: 'the reply has no JSON object' };
            if (r.error) return { status: 'failed', reason: `"${node.title}": ${r.error}`, node: id, trace };
            for (const [k, v] of Object.entries(r.values)) out(k, v);
            ran(Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, short(v)])));
          } else { const text = clip(stripThinking(a.text), TEXT_MAX); out('text', text); ran({ text: short(text) }); }
        }
      }
    } else if (node.type === 'data.parse') {
      const g = gate(['text']);
      if (g === 'skip') skip(); else if (g === 'wait') wait();
      else {
        const obj = extractJson(ins.text);
        const r = obj ? shapeValues(obj, p.shape) : { error: 'no JSON object' };
        if (r.error) {
          if (!file.edges.some((e) => e.from === id + ':failed')) return { status: 'failed', reason: `"${node.title}": ${r.error}`, node: id, trace };
          setAll(node, SKIP); out('failed', true); trace.push({ node: id, status: 'ran', out: { failed: r.error } });
        } else {
          setAll(node, SKIP);
          for (const [k, v] of Object.entries(r.values)) out(k, v);
          ran(r.values);
        }
      }
    } else if (node.type === 'logic.if') {
      const vals = ports.filter((x) => x.side === 'in').map((x) => ins[x.id]);
      if (vals.some((v) => v === SKIP)) skip();
      else if (vals.some((v) => v === PENDING)) wait();
      else {
        const types = Object.fromEntries((p.inputs || []).map((i) => [i.id, i.type]));
        const operand = (o) => {
          if (!isPlain(o)) return { value: undefined, type: 'text' };
          if (o.from === 'wire') { const v = ins[o.port]; return { value: v === ABSENT ? undefined : v, type: types[o.port] }; }
          if (o.from === 'state') return { value: dash[dashKey(o)], type: o.as };
          if (o.from === 'chat') return { value: chat[o.what], type: o.what === 'messageCount' ? 'number' : 'text' };
          return { value: o.value, type: typeof o.value === 'number' ? 'number' : 'text' };
        };
        const results = (p.rows || []).map((r) => {
          const l = operand(r.left);
          return ruleResult(l.type, r.op, l.value, operand(r.right).value);
        });
        const verdict = combineRules(p.match || 'all', results);
        setAll(node, SKIP);
        out(verdict, true);
        ran({ verdict, rules: results.join(',') });
      }
    } else if (node.type === 'logic.merge') {
      const vals = ports.filter((x) => x.side === 'in').map((x) => ins[x.id]);
      if (vals.some((v) => v !== SKIP && v !== PENDING && v !== ABSENT)) { out('out', true); ran(); }
      else if (vals.some((v) => v === PENDING)) wait();
      else skip();
    } else if (node.type === 'write.state' || node.type === 'state.set' || node.type === 'state.add' || node.type === 'state.list') {
      const dataPorts = ports.filter((x) => x.side === 'in' && x.id !== 'when' && !(node.type === 'state.add' && x.id === 'by')).map((x) => x.id);
      const needBy = node.type === 'state.add' && ins.by !== ABSENT;
      const g = gate(needBy ? [...dataPorts, 'by'] : dataPorts, 'when');
      if (g === 'skip') skip();
      else if (g === 'wait') wait();
      else {
        const f = schema[p.field];
        let w = null;
        if (node.type === 'write.state') w = { op: 'dash.set', field: p.field, value: p.as === 'number' ? Number(ins.value) : asText(ins.value), ...(p.clamp ? { clamp: p.clamp } : {}) };
        else if (node.type === 'state.set') w = { op: 'own.set', field: p.field, value: p.as === 'flag' ? (ins.value === 'yes' ? true : ins.value === 'no' ? false : undefined) : ins.value };
        else if (node.type === 'state.add') w = { op: 'own.add', field: p.field, by: needBy ? ins.by : p.amount, ...(p.clamp ? { clamp: p.clamp } : {}) };
        else if (f && f.type === 'list') {
          const item = {};
          for (const k of Object.keys(f.item || {})) item[k] = f.item[k] === 'flag' ? ins[k] === 'yes' : ins[k];
          w = p.op === 'remove' ? { op: 'list.remove', field: p.field, key: p.key, id: ins.key }
            : { op: p.op === 'update' ? 'list.update' : 'list.add', field: p.field, item, ...(p.op === 'update' ? { key: p.key, id: item[p.key] } : {}) };
        }
        if (!w || (w.op === 'own.set' && w.value === undefined)) skip();
        else { writes.push(w); out('done', true); ran({ [w.op]: w.field }); }
      }
    } else if (node.type === 'random.dice' || node.type === 'random.pick') {
      const g = gate([], 'when');
      if (g === 'skip') skip();
      else if (g === 'wait') wait();
      else {
        const seed = String((ctx && ctx.seed) || '') + '|' + id;
        if (node.type === 'random.dice') { const r = rollDice(seed, p); out('total', r.total); out('rolls', r.rolls); ran({ total: r.total, rolls: r.rolls }); }
        else { const r = pickWeighted(seed, p.items || []); out('text', r.text); out('index', r.index); ran({ text: short(r.text), index: r.index }); }
      }
    } else if (node.type === 'text.extract') {
      const g = gate(['in']);
      if (g === 'skip') skip(); else if (g === 'wait') wait();
      else {
        const v = extractText(ins.in, p);
        setAll(node, SKIP);
        if (v === null) { out('none', true); ran({ none: 'no match' }); }
        else { out('match', v); ran({ match: short(v) }); }
      }
    } else if (node.type === 'text.cut') {
      const g = gate(['in']);
      if (g === 'skip') skip(); else if (g === 'wait') wait();
      else { const v = cutText(ins.in, p); out('text', v); ran({ text: short(v) }); }
    } else if (node.type === 'code.script') {
      const g = gate(ports.filter((x) => x.side === 'in' && x.id !== 'when').map((x) => x.id), 'when');
      if (g === 'skip') skip();
      else if (g === 'wait') wait();
      else {
        const a = given[id];
        const outs = ports.filter((x) => x.side === 'out' && x.id !== 'failed');
        const fail = (why) => {
          if (!file.edges.some((e) => e.from === id + ':failed')) return { status: 'failed', reason: `The script of "${node.title}" failed: ${why}`, node: id, trace };
          setAll(node, SKIP);
          out('failed', true);
          trace.push({ node: id, status: 'ran', out: { failed: short(why) } });
          return null;
        };
        if (!a) {
          const input = {};
          for (const x of ports) if (x.side === 'in' && x.id !== 'when') input[x.id] = x.type === 'flag' ? (ins[x.id] === 'yes' ? true : ins[x.id] === 'no' ? false : null) : ins[x.id];
          requests.push({ node: id, kind: 'script', code: p.code, input });
          wait();
        } else {
          let why = a.error ? String(a.error) : '';
          const values = {};
          if (!why) {
            const v = isPlain(a.value) ? a.value : {};
            for (const x of outs) {
              const got = v[x.id];
              if (got === undefined || got === null) continue; // left out: missing data, never a silent zero
              if (x.type === 'number' && typeof got === 'number' && Number.isFinite(got)) values[x.id] = got;
              else if (x.type === 'flag' && typeof got === 'boolean') values[x.id] = got ? 'yes' : 'no';
              else if (x.type === 'text' && (typeof got === 'string' || typeof got === 'number')) values[x.id] = clip(String(got), TEXT_MAX);
              else { why = `"${x.id}" must be ${x.type === 'flag' ? 'true or false' : x.type === 'number' ? 'a number' : 'text'}`; break; }
            }
          }
          if (why) { const r = fail(why); if (r) return r; }
          else {
            setAll(node, SKIP);
            for (const x of outs) out(x.id, values[x.id]);
            ran(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, short(v)])));
          }
        }
      }
    } else if (node.type === 'agent.output') {
      const g = gate(['in']);
      if (g === 'skip') skip();
      else if (g === 'wait') wait();
      else {
        const show = p.show || undefined;
        if (p.kind === 'prompt-insert') outputs.push({ node: id, kind: 'prompt-insert', text: clip(asText(ins.in), 4000), position: p.position || 'after-history', label: p.label || node.title, ...(show ? { show } : {}) });
        else if (p.kind === 'note') outputs.push({ node: id, kind: 'note', title: p.title || node.title, text: clip(asText(ins.in), 4000), ...(p.short ? { short: p.short } : {}), ...(show ? { show } : {}) });
        else if (p.kind === 'choices') outputs.push({ node: id, kind: 'choices', choices: asText(ins.in).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6), ...(show ? { show } : {}) });
        else outputs.push({ node: id, kind: 'state-patch', ...(show ? { show } : {}) });
        ran();
      }
    }
  }

  if (requests.length) return { status: 'need', requests, trace };
  return { status: 'done', writes, outputs, calls, trace };
}
