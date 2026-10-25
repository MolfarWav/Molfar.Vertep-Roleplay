// Agents plugin (GitHub #127). The block between the two marker lines is generated: do not edit it.
// ==== BEGIN GENERATED: src/canvas-kit/boards/agent-check.js + agent-run.js (bun scripts/sync-agents-plugin.ts) ====
// The agent checker: the card set of an agent file (`vertep-canvas` v1, kind "agent"), the ports each card
// derives from its params, and the function that decides whether a file may be installed.
// Format reference: docs/DATA-FORMATS.md, "Agents".
//
// This file is PLAIN JAVASCRIPT ON PURPOSE, and it is the one source of truth. The editor and the install screen
// import it (typed by agent-check.d.ts); the runner plugin runs in the engine's QuickJS sandbox, which loads one
// file per plugin and has no imports, no TextEncoder and no crypto.subtle, so a generated copy of this file is
// pasted into the plugin (see test/rp-agent-check-sandbox.test.ts, which runs this source in a bare context).
// So: no import, no browser or Node globals, no async. Everything it needs is below.

const isObject = (v) => typeof v === 'object' && v !== null;
const isString = (v) => typeof v === 'string';
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
/** "node:port" -> [node, port]; a node id may itself hold a colon, the port never does. */
const splitEnd = (end) => {
  const i = end.lastIndexOf(':');
  return i < 0 ? [end, ''] : [end.slice(0, i), end.slice(i + 1)];
};
/** The Canvas envelope, read the way src/canvas-kit/graph.ts `fromFile` reads it (a test keeps the two equal). */
const readCanvasFile = (raw) => {
  if (!isObject(raw)) return { error: 'Not an object' };
  if (raw.format !== 'vertep-canvas') return { error: 'Wrong format' };
  if (raw.version !== 1) return { error: 'Unsupported version' };
  if (!isString(raw.kind)) return { error: 'Missing kind' };
  if (!isString(raw.title)) return { error: 'Missing title' };
  if (!Array.isArray(raw.nodes)) return { error: 'nodes must be an array' };
  if (!Array.isArray(raw.edges)) return { error: 'edges must be an array' };
  const nodes = [];
  for (const n of raw.nodes) {
    if (!isObject(n) || !isString(n.id) || !isString(n.type) || !isFiniteNumber(n.x) || !isFiniteNumber(n.y) || !isString(n.title)) return { error: 'Invalid node' };
    const node = { id: n.id, type: n.type, x: n.x, y: n.y, title: n.title };
    if (isString(n.subtitle)) node.subtitle = n.subtitle;
    if (isObject(n.params)) node.params = n.params;
    if (isString(n.note)) node.note = n.note;
    nodes.push(node);
  }
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) return { error: 'Duplicate node id' };
  const edges = [];
  for (const e of raw.edges) {
    if (!isObject(e) || !isString(e.id) || !isString(e.from) || !isString(e.to)) return { error: 'Invalid edge' };
    if (!ids.has(splitEnd(e.from)[0]) || !ids.has(splitEnd(e.to)[0])) return { error: `Edge ${e.id} references an unknown node` };
    edges.push(e.locked === true ? { id: e.id, from: e.from, to: e.to, locked: true } : { id: e.id, from: e.from, to: e.to });
  }
  const file = { format: 'vertep-canvas', version: 1, kind: raw.kind, title: raw.title, nodes, edges };
  if (isObject(raw.agent) && !Array.isArray(raw.agent)) file.agent = raw.agent;
  return { file };
};

const SOURCE_TYPE = {
  lastReply: 'text', lastUserMessage: 'text', history: 'text', card: 'text', persona: 'text', summary: 'text',
  authorNote: 'text', myPrevious: 'text', preGenInjections: 'text', parallelResults: 'text', state: null,
};
const shapeType = (spec) => (spec === 'number' ? 'number' : spec === 'bool' ? 'flag' : 'text'); // enum:a|b and text are text
const PORT_ID = /^[A-Za-z0-9_-]+$/;
const slotsOf = (s) => [...new Set([...String(s ?? '').matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)].map((m) => m[1]))];
const shapeOut = (shape) => Object.entries((shape ?? {})).map(([id, spec]) => ({ id, side: 'out', type: shapeType(spec) }));
const ownType = (as) => (as === 'number' ? 'number' : as === 'flag' ? 'flag' : 'text'); // a state value on a wire
const itemPorts = (item) => Object.entries((item ?? {})).map(([id, spec]) => ({ id, side: 'in', type: ownType(spec) }));
const whenDone = [{ id: 'when', side: 'in', type: 'signal', optional: true }, { id: 'done', side: 'out', type: 'signal' }];
const OUTPUT_TEXT_KINDS = ['prompt-insert', 'note', 'choices'];
const NEEDS_BY_OUTPUT = { 'prompt-insert': ['write:prompt'], note: ['show:note'], choices: ['show:choices'] };
const AGENT_CARDS = {
  'agent.input': {
    label: 'Input', colorVar: '--k-data', hint: 'What the agent receives. What is not listed here, the agent cannot see.',
    ports: (p) => (p.give ?? []).map((g) => ({ id: g.id, side: 'out', type: g.source === 'state' ? (g.as === 'number' ? 'number' : 'text') : (SOURCE_TYPE[g.source] ?? 'text') })),
    needs: (p) => (p.give ?? []).map((g) => (g.source === 'state' ? `read:state.${g.field}` : `read:${g.source}`)),
  },
  'agent.output': {
    label: 'Output', colorVar: '--k-main', hint: 'Where the result goes: state, the prompt, a note or buttons.',
    ports: (p) => [{ id: 'in', side: 'in', type: OUTPUT_TEXT_KINDS.includes(p.kind) ? 'text' : 'signal' }],
    needs: (p) => NEEDS_BY_OUTPUT[p.kind] ?? [],
  },
  'text.template': {
    label: 'Template', colorVar: '--k-data', hint: 'Text with {{slots}}; every slot is an input.',
    ports: (p) => [...slotsOf(p.text).map((id) => ({ id, side: 'in', type: 'text' })), { id: 'text', side: 'out', type: 'text' }],
    needs: () => [],
  },
  'model.ask': {
    label: 'Ask the model', colorVar: '--k-model', hint: 'One model call: text, yes/no or JSON.', calls: 1,
    ports: (p) => {
      const out = p.answer?.as === 'json' ? shapeOut(p.answer.shape)
        : p.answer?.as === 'yesno' ? [{ id: 'answer', side: 'out', type: 'flag' }, { id: 'reason', side: 'out', type: 'text' }]
          : [{ id: 'text', side: 'out', type: 'text' }];
      return [...slotsOf(p.prompt).map((id) => ({ id, side: 'in', type: 'text' })), ...out];
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
      ...(p.inputs ?? []).map((i) => ({ id: i.id, side: 'in', type: i.type })),
      ...['yes', 'no', 'unknown'].map((id) => ({ id, side: 'out', type: 'signal' })),
    ],
    needs: (p) => (p.rows ?? []).flatMap((r) => [r.left, r.right]).filter((o) => o?.from === 'state').map((o) => `read:state.${o.field}`),
  },
  'logic.merge': {
    label: 'Merge', colorVar: '--k-logic', hint: 'Fires when any of its inputs fires.',
    ports: (p) => [...Array.from({ length: p.count ?? 2 }, (_, i) => ({ id: `i${i + 1}`, side: 'in', type: 'signal' })), { id: 'out', side: 'out', type: 'signal' }],
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
    ports: (p) => [...(p.op === 'remove' ? [{ id: 'key', side: 'in', type: ownType((p.item ?? {})[p.key]) }] : itemPorts(p.item)), ...whenDone],
    needs: (p) => [`write:own.${p.field}`],
  },
  note: { label: 'Note', colorVar: '--k-data', hint: 'A note for people; never sent to a model.', ports: () => [], needs: () => [] },
};
const OPS = {
  text: ['eq', 'neq', 'contains', 'notContains', 'in', 'isSet', 'isMissing'],
  number: ['lt', 'lte', 'eq', 'gte', 'gt', 'between', 'isSet', 'isMissing'],
  flag: ['isYes', 'isNo', 'isUnknown'],
};
/** Where an Output of each kind may show its result. The first entry is the default place. */
const SHOW_BY_KIND = {
  'state-patch': ['log', 'feed', 'top1', 'top2', 'float', 'toast'],
  note: ['note', 'log', 'feed', 'top1', 'float'],
  'prompt-insert': ['inspector', 'note'],
  choices: ['bottom', 'log', 'float'],
};
const canon = (v) => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
    : v;
// SHA-256 in plain JS: the sandbox has no crypto.subtle. UTF-8 is encoded by hand for the same reason.
const utf8 = (str) => {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) { const d = str.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
};
const SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const sha256Hex = (text) => {
  const bytes = utf8(text);
  const bits = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255); // lengths under 512 MB
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
};
/** Hash of what the agent IS: the header (without `derived`), the cards without their position, the wires. Moving a card does not change it. */
const agentHash = (f) => {
  const { derived: _derived, ...agent } = (f.agent ?? {});
  const nodes = f.nodes.map(({ x: _x, y: _y, ...n }) => n);
  return `sha256:${sha256Hex(JSON.stringify(canon({ agent, nodes, edges: f.edges })))}`;
};
const FIELD_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
const SCALARS = ['number', 'text', 'flag'];
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** The `state` section of the header: fields the agent owns. Returns only the well-formed fields, so later checks do not trip over a broken one. */
function checkState(raw, err) {
  const out = {};
  if (raw === undefined)
    return out;
  if (!isObj(raw)) {
    err('E_STATE_FIELD', 'agent.state must be an object of fields');
    return out;
  }
  const entries = Object.entries(raw);
  if (entries.length > 40)
    err('E_STATE_LIMIT', 'An agent may own at most 40 state fields');
  for (const [id, spec] of entries) {
    if (!FIELD_ID.test(id)) {
      err('E_STATE_FIELD', `State field "${id}": the name may use letters, digits, _ and -, and starts with a letter`);
      continue;
    }
    if (!isObj(spec) || ![...SCALARS, 'list'].includes(spec.type)) {
      err('E_STATE_FIELD', `State field "${id}": type must be number, text, flag or list`);
      continue;
    }
    if (spec.type === 'number') {
      const nums = ['min', 'max', 'start'].filter((k) => spec[k] !== undefined);
      if (nums.some((k) => !Number.isFinite(spec[k]))) {
        err('E_STATE_FIELD', `State field "${id}": min, max and start must be numbers`);
        continue;
      }
      if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) {
        err('E_STATE_FIELD', `State field "${id}": min is above max`);
        continue;
      }
      if (spec.start !== undefined && ((spec.min !== undefined && spec.start < spec.min) || (spec.max !== undefined && spec.start > spec.max))) {
        err('E_STATE_FIELD', `State field "${id}": start is outside min..max`);
        continue;
      }
    }
    if (spec.type === 'text' && spec.start !== undefined && typeof spec.start !== 'string') {
      err('E_STATE_FIELD', `State field "${id}": start must be text`);
      continue;
    }
    if (spec.type === 'flag' && spec.start !== undefined && typeof spec.start !== 'boolean') {
      err('E_STATE_FIELD', `State field "${id}": start must be true or false`);
      continue;
    }
    if (spec.type === 'list') {
      if (!Number.isInteger(spec.max) || spec.max < 1 || spec.max > 500) {
        err('E_STATE_LIMIT', `State field "${id}": a list needs max, a whole number from 1 to 500`);
        continue;
      }
      const item = isObj(spec.item) ? Object.entries(spec.item) : [];
      if (!item.length || item.length > 8 || item.some(([k, t]) => !FIELD_ID.test(k) || !SCALARS.includes(t))) {
        err('E_STATE_FIELD', `State field "${id}": a list needs "item", 1 to 8 fields of type number, text or flag`);
        continue;
      }
      out[id] = { type: 'list', item: Object.fromEntries(item) };
      continue;
    }
    out[id] = { type: spec.type };
  }
  return out;
}
const WIDGET_BIND = { meter: 'number', number: 'number', counter: 'number', table: 'list', list: 'list', log: 'list', text: 'text' };
const PANEL_PLACES = ['top1', 'top2', 'float'];
const TPL_TAGS = /<\s*(script|iframe|object|embed|link|meta|base|form|frame|frameset|applet|foreignobject)\b/i;
const TPL_BAD = [
  /[\s"'/]on[a-z]{2,}\s*=/i, // event handlers
  /(?:^|[\s"'/])(?:src|srcdoc|href|xlink:href|action|formaction|poster|background)\s*=/i, // anything the browser would load or follow
  /url\s*\(/i, /@import/i, /javascript:/i, /expression\s*\(/i,
];
/** Template slots of an html widget: `{{field}}`, `{{#each list}}…{{/each}}` (fields of the entry inside), `{{#if field}}…{{/if}}`. */
function checkTemplate(tpl, state, where, err) {
  if (TPL_TAGS.test(tpl) || TPL_BAD.some((re) => re.test(tpl))) {
    err('E_TPL_FORBIDDEN', `${where}: the template has markup that can run code or load something (script, frames, event handlers, src/href, url())`);
    return;
  }
  const stack = [];
  const scopeNow = () => { const top = [...stack].reverse().find((x) => x.kind === 'each'); return top ? top.scope : Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.type])); };
  for (const m of tpl.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    const tag = m[1];
    if (tag === '/each' || tag === '/if') {
      if (stack.pop()?.kind !== tag.slice(1)) {
        err('E_TPL_UNCLOSED', `${where}: {{${tag}}} closes something that is not open`);
        return;
      }
      continue;
    }
    const open = /^#(each|if)\s+([A-Za-z][A-Za-z0-9_-]*)$/.exec(tag);
    if (open) {
      const field = open[2];
      const scope = scopeNow();
      if (!(field in scope)) {
        err('E_TPL_FIELD', `${where}: {{${tag}}} names "${field}", which is not a field here`);
        return;
      }
      if (open[1] === 'each') {
        if (stack.some((x) => x.kind === 'each')) {
          err('E_TPL_FIELD', `${where}: {{#each}} inside {{#each}} is not supported`);
          return;
        }
        if (scope[field] !== 'list') {
          err('E_TPL_FIELD', `${where}: {{#each ${field}}} needs a list field`);
          return;
        }
        stack.push({ kind: 'each', scope: state[field].item });
      }
      else
        stack.push({ kind: 'if', scope: null });
      continue;
    }
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(tag)) {
      err('E_TPL_FIELD', `${where}: {{${tag}}} is not a field, {{#each}} or {{#if}}`);
      return;
    }
    const t = scopeNow()[tag];
    if (!t) {
      err('E_TPL_FIELD', `${where}: {{${tag}}} is not a field here`);
      return;
    }
    if (t === 'list') {
      err('E_TPL_FIELD', `${where}: {{${tag}}} is a list; use {{#each ${tag}}}`);
      return;
    }
  }
  if (stack.length)
    err('E_TPL_UNCLOSED', `${where}: {{#${stack[stack.length - 1].kind}}} is never closed`);
}
/** The `panels` section: what the agent shows beside the chat. A description, never code. */
function checkPanels(raw, state, err) {
  if (raw === undefined)
    return 0;
  if (!Array.isArray(raw) || raw.length > 4) {
    err('E_PANEL', 'agent.panels must be a list of at most 4 panels');
    return 0;
  }
  const ids = new Set();
  for (const [i, pn] of raw.entries()) {
    const at = `Panel ${i + 1}`;
    if (!isObj(pn) || !/^[a-z0-9][a-z0-9-]{0,30}$/.test(pn.id ?? '') || ids.has(pn.id)) {
      err('E_PANEL', `${at}: needs a unique lowercase id`);
      continue;
    }
    ids.add(pn.id);
    if (typeof pn.title !== 'string' || !pn.title.trim() || pn.title.length > 60)
      err('E_PANEL', `${at}: title must be text of 1-60 characters`);
    if (pn.place !== undefined && !PANEL_PLACES.includes(pn.place))
      err('E_PANEL', `${at}: place must be one of ${PANEL_PLACES.join(', ')}`);
    if (!Array.isArray(pn.widgets) || !pn.widgets.length || pn.widgets.length > 20) {
      err('E_PANEL', `${at}: needs 1-20 widgets`);
      continue;
    }
    for (const [j, w] of pn.widgets.entries()) {
      const where = `${at}, widget ${j + 1}`;
      if (!isObj(w)) {
        err('E_WIDGET', `${where}: not an object`);
        continue;
      }
      if (w.w === 'actions') {
        const items = Array.isArray(w.items) ? w.items : [];
        if (!items.length || items.length > 8 || items.some((x) => !isObj(x) || typeof x.label !== 'string' || !x.label.trim() || typeof x.send !== 'string' || !x.send.trim() || x.send.length > 500))
          err('E_WIDGET', `${where}: actions needs 1-8 items, each with a label and a "send" text up to 500 characters`);
        continue;
      }
      if (w.w === 'html') {
        if (typeof w.template !== 'string' || !w.template.trim() || w.template.length > 8192)
          err('E_WIDGET', `${where}: html needs a template of up to 8192 characters`);
        else
          checkTemplate(w.template, state, where, err);
        continue;
      }
      const want = WIDGET_BIND[w.w];
      if (!want) {
        err('E_WIDGET', `${where}: unknown widget "${w.w}"`);
        continue;
      }
      const field = state[w.bind];
      if (!field) {
        err('E_BIND', `${where}: bind "${w.bind}" is not a field in agent.state`);
        continue;
      }
      if (field.type !== want) {
        err('E_BIND', `${where}: a ${w.w} shows a ${want} field, but "${w.bind}" is ${field.type}`);
        continue;
      }
      if (w.w === 'table' && (!Array.isArray(w.columns) || !w.columns.length || w.columns.some((c) => typeof c !== 'string' || !(c in field.item))))
        err('E_BIND', `${where}: columns must be fields of the entries of "${w.bind}"`);
    }
  }
  return raw.length;
}
/** Extra rules of the four cards that touch the agent's own state: the field must exist, with the type the card says. */
function checkStateCard(n, state, err) {
  const p = (n.params ?? {});
  const f = state[p.field];
  if (!f) {
    err('E_STATE_UNKNOWN', `"${n.title}" uses the field "${p.field}", which is not in agent.state`, n.id);
    return;
  }
  if (n.type === 'state.add') {
    if (f.type !== 'number')
      err('E_STATE_TYPE', `"${n.title}" adds to "${p.field}", which is ${f.type}, not number`, n.id);
    return;
  }
  if (n.type === 'state.read' || n.type === 'state.set') {
    if (f.type === 'list' || f.type !== p.as)
      err('E_STATE_TYPE', `"${n.title}" says ${p.as}, but "${p.field}" is ${f.type}. Lists change only through a "Change own list" card`, n.id);
    return;
  }
  // state.list
  if (f.type !== 'list') {
    err('E_STATE_TYPE', `"${n.title}" changes a list, but "${p.field}" is ${f.type}`, n.id);
    return;
  }
  if (!['add', 'update', 'remove'].includes(p.op)) {
    err('E_STATE_OP', `"${n.title}": op must be add, update or remove`, n.id);
    return;
  }
  if (p.op !== 'add' && !(p.key in f.item))
    err('E_STATE_TYPE', `"${n.title}": key "${p.key}" is not a field of the entries of "${p.field}"`, n.id);
  if (JSON.stringify(canon(p.item)) !== JSON.stringify(canon(f.item)))
    err('E_STATE_TYPE', `"${n.title}": item does not match the entries of "${p.field}"`, n.id);
}
/** Checks an agent file. `derived` is what the file ought to declare (needs, calls, hash); a file that declares something else is refused. */
function validateAgent(raw) {
  const errors = [];
  const warnings = [];
  const err = (code, message, node) => errors.push({ code, message, ...(node ? { node } : {}) });
  const warn = (code, message, node) => warnings.push({ code, message, ...(node ? { node } : {}) });
  const parsed = readCanvasFile(raw);
  if ('error' in parsed || parsed.file.kind !== 'agent')
    return { errors: [{ code: 'E_ENVELOPE', message: 'Not a vertep-canvas v1 file of kind "agent"' }], warnings, derived: null };
  const f = parsed.file;
  const a = (f.agent ?? {});
  if (a.formatVersion !== 1)
    err('E_FORMAT_VERSION', 'agent.formatVersion must be 1');
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(a.id ?? ''))
    err('E_ID', 'agent.id must be a lowercase slug of 2-41 characters');
  if (!['before', 'parallel', 'after', 'manual'].includes(a.trigger?.when))
    err('E_TRIGGER', 'trigger.when must be before, parallel, after or manual');
  if (a.trigger?.when === 'parallel' && f.nodes.some((n) => n.type === 'agent.output' && n.params?.kind === 'prompt-insert')) {
    err('E_PARALLEL_INSERT', 'A parallel agent runs beside the reply, so its text cannot reach this reply. Use "before" for a prompt insert, or write to state');
  }
  const state = checkState(a.state, err);
  const byId = new Map();
  for (const n of f.nodes) {
    if (byId.has(n.id))
      err('E_DUP_NODE', `Two cards share the id ${n.id}`, n.id);
    byId.set(n.id, n);
  }
  const ports = new Map();
  const needs = new Set();
  let maxCalls = 0;
  for (const n of f.nodes) {
    const card = AGENT_CARDS[n.type];
    if (!card) {
      warn('W_UNKNOWN_TYPE', `Card "${n.title}" has an unknown type ${n.type}; it is kept, shown grey, and the agent will not run`, n.id);
      continue;
    }
    const p = (n.params ?? {});
    const list = card.ports(p);
    for (const pt of list)
      if (!PORT_ID.test(pt.id))
        err('E_PORT_ID', `Port id "${pt.id}" on "${n.title}" may use only letters, digits, _ and -`, n.id);
    ports.set(n.id, list);
    for (const t of card.needs(p))
      needs.add(t);
    maxCalls += card.calls ?? 0;
    if (n.type.startsWith('state.'))
      checkStateCard(n, state, err);
    if (n.type === 'model.ask' && !a.models?.[p.role])
      err('E_ROLE', `"${n.title}" asks for the model role "${p.role}", which agent.models does not declare`, n.id);
    if (n.type === 'logic.if') {
      const inTypes = Object.fromEntries((p.inputs ?? []).map((i) => [i.id, i.type]));
      if (!(p.rows ?? []).length)
        err('E_IF_EMPTY', `"${n.title}" has no rules`, n.id);
      for (const r of p.rows ?? []) {
        const t = r.left?.from === 'wire' ? inTypes[r.left.port]
          : r.left?.from === 'state' ? r.left.as
            : r.left?.from === 'chat' ? (r.left.what === 'messageCount' ? 'number' : 'text')
              : typeof r.left?.value === 'number' ? 'number' : 'text';
        if (!t)
          err('E_IF_OPERAND', `A rule in "${n.title}" reads a port that is not declared in inputs`, n.id);
        else if (!OPS[t]?.includes(r.op))
          err('E_IF_OP', `"${r.op}" does not work on ${t} values (rule in "${n.title}")`, n.id);
      }
    }
  }
  if (checkPanels(a.panels, state, err))
    needs.add('show:panel');
  const inputs = f.nodes.filter((n) => n.type === 'agent.input');
  const outputs = f.nodes.filter((n) => n.type === 'agent.output');
  if (inputs.length !== 1)
    err('E_INPUT_COUNT', `An agent needs exactly one Input card, found ${inputs.length}`);
  if (outputs.length < 1)
    err('E_OUTPUT_COUNT', 'An agent needs at least one Output card');
  for (const o of outputs) {
    const op = (o.params ?? {});
    if (op.show != null && !(SHOW_BY_KIND[op.kind] ?? []).includes(op.show))
      err('E_SHOW_NOT_ALLOWED', `Output "${o.title}": "${op.show}" is not a place where a "${op.kind}" result can be shown`, o.id);
  }
  const wiresIn = new Map();
  const adj = new Map();
  for (const e of f.edges) {
    const [fn, fp] = splitEnd(e.from);
    const [tn, tp] = splitEnd(e.to);
    if (!byId.has(fn) || !byId.has(tn)) {
      err('E_EDGE_NODE', `Wire ${e.id} points at a card that is not there`);
      continue;
    }
    const fromPorts = ports.get(fn);
    const toPorts = ports.get(tn);
    if (!fromPorts || !toPorts)
      continue; // unknown card type: nothing to check
    const from = fromPorts.find((p) => p.id === fp);
    const to = toPorts.find((p) => p.id === tp);
    if (!from || !to) {
      err('E_EDGE_PORT', `Wire ${e.id} points at a port that does not exist (${!from ? e.from : e.to})`);
      continue;
    }
    if (from.side !== 'out' || to.side !== 'in') {
      err('E_EDGE_DIRECTION', `Wire ${e.id} must go from an output to an input`);
      continue;
    }
    if (from.type !== to.type)
      err('E_TYPE', `Wire ${e.id}: a ${from.type} output cannot feed a ${to.type} input`);
    const key = `${tn}:${tp}`;
    const count = (wiresIn.get(key) ?? 0) + 1;
    wiresIn.set(key, count);
    if (count > 1)
      err('E_TWO_WIRES', `Input "${tp}" on "${byId.get(tn).title}" has more than one wire`, tn);
    adj.set(fn, [...(adj.get(fn) ?? []), tn]);
  }
  for (const n of f.nodes) {
    for (const p of ports.get(n.id) ?? []) {
      if (p.side === 'in' && !p.optional && !wiresIn.has(`${n.id}:${p.id}`))
        err('E_UNWIRED', `Input "${p.id}" on "${n.title}" has no wire`, n.id);
    }
  }
  // acyclic: depth-first search with colours
  const colour = new Map();
  const dfs = (id) => {
    colour.set(id, 1);
    for (const next of adj.get(id) ?? []) {
      if (colour.get(next) === 1)
        return true;
      if (!colour.get(next) && dfs(next))
        return true;
    }
    colour.set(id, 2);
    return false;
  };
  for (const n of f.nodes) {
    if (!colour.get(n.id) && dfs(n.id)) {
      err('E_CYCLE', 'The wires make a loop. Agents have no loops in this version');
      break;
    }
  }
  for (const n of f.nodes) {
    if (n.type === 'state.add' && !wiresIn.has(`${n.id}:by`) && !Number.isFinite(n.params?.amount))
      err('E_UNWIRED', `"${n.title}" needs a wire into "by" or a fixed amount`, n.id);
  }
  const wired = new Set(f.edges.flatMap((e) => [splitEnd(e.from)[0], splitEnd(e.to)[0]]));
  for (const n of f.nodes)
    if (n.type !== 'note' && ports.has(n.id) && !wired.has(n.id))
      warn('W_ISLAND', `"${n.title}" is not connected to anything`, n.id);
  if (a.limits?.maxCalls !== undefined && a.limits.maxCalls < maxCalls)
    err('E_BUDGET', `The agent can make ${maxCalls} model calls but limits.maxCalls is ${a.limits.maxCalls}`);
  const derived = { needs: [...needs].sort(), maxCalls, hash: agentHash(f) };
  const d = a.derived;
  if (d) {
    if (JSON.stringify(d.needs) !== JSON.stringify(derived.needs))
      err('E_NEEDS_MISMATCH', `The file declares needs ${JSON.stringify(d.needs)} but its cards need ${JSON.stringify(derived.needs)}`);
    if (d.maxCalls !== derived.maxCalls)
      err('E_CALLS_MISMATCH', `The file declares ${d.maxCalls} model calls but its cards can make ${derived.maxCalls}`);
    if (d.hash !== derived.hash)
      err('E_HASH', 'The file changed after it was compiled (hash differs). Compile it again');
  }
  return { errors, warnings, derived };
}
/** Fills `agent.derived` from the cards, so a file made in the editor is always consistent. Returns the file and the report of the filled file. */
function compileAgent(raw) {
  const parsed = readCanvasFile(raw);
  if ('error' in parsed)
    return { error: parsed.error };
  const { derived: _old, ...header } = (parsed.file.agent ?? {});
  const file = { ...parsed.file, agent: header };
  const first = validateAgent(file);
  if (!first.derived)
    return { error: first.errors[0]?.message ?? 'Not an agent file' };
  file.agent = { ...header, derived: first.derived };
  return { file, report: validateAgent(file) };
}

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
function parseYesNo(text) {
  const t = stripThinking(text);
  const first = t.split('\n')[0].trim();
  // \b and \w know only Latin letters, so the word edge is spelled out
  const yes = /^[^A-Za-z\u0400-\u04FF]*(yes|так|y)(?![A-Za-z\u0400-\u04FF])/i.test(first);
  const no = /^[^A-Za-z\u0400-\u04FF]*(no|ні|ни|n)(?![A-Za-z\u0400-\u04FF])/i.test(first);
  const reason = t.split('\n').slice(1).join(' ').trim() || (yes || no ? first.replace(/^[^A-Za-z\u0400-\u04FF]*[A-Za-z\u0400-\u04FF]+[^A-Za-z\u0400-\u04FF]*/, '') : t);
  return { answer: yes && !no ? 'yes' : no && !yes ? 'no' : 'unknown', reason: clip(reason, 1000) };
}

/** The first JSON object in a reply (a code fence or chatter around it is fine). Null when there is none. */
function extractJson(text) {
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
function shapeValues(obj, shape) {
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
function askPrompt(prompt, answer) {
  if (answer && answer.as === 'yesno') return prompt + '\n\nAnswer on the first line with exactly YES or NO. On the next line give one short reason.';
  if (answer && answer.as === 'json') return prompt + '\n\nAnswer with JSON only, no other text, in this shape (for "a|b" use exactly one of the options): ' + shapeHint(answer.shape);
  return prompt;
}

// ---------- If ----------

const Y = 'yes';
const N = 'no';
const U = 'unknown';

/** One rule of an If card: Y, N or U. Missing data is U (except isSet / isMissing, which are about exactly that). */
function ruleResult(type, op, left, right) {
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
function combineRules(match, results) {
  if (!results.length) return U;
  const has = (r) => results.includes(r);
  if (match === 'any') return has(Y) ? Y : has(U) ? U : N;
  if (match === 'none') return has(Y) ? N : has(U) ? U : Y;
  return has(N) ? N : has(U) ? U : Y; // all
}

// ---------- state ----------

/** The agent's own fields as they start: numbers at `start` (else min, else 0), lists empty, the rest unset. */
function initialOwn(schema) {
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
function applyWrites(schema, own, writes) {
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
 * ctx: { inputs: { <give id>: text | number | undefined }, own: { <field>: value }, dash: { <field>: value }, chat: { messageCount, lastSpeaker } }
 *   `inputs` is what the host read for the agent's Input card; the executor trusts nothing else about the chat.
 * answers: { <model.ask card id>: { text } | { error } }
 * Returns { status: "need", requests, trace }, { status: "done", writes, outputs, calls, trace } or { status: "failed", reason, node, trace }.
 */
function runAgent(file, ctx, answers) {
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

  const wire = new Map(); // "node:port" -> value | SKIP | PENDING
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
      for (const g of p.give || []) out(g.id, g.source === 'state' ? dash[g.field] : inputs[g.id]);
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
          if (o.from === 'state') return { value: dash[o.field], type: o.as };
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
// ==== END GENERATED ====

/**
 * Agents: the runner. A checked agent file (data/agents/<id>.vertep-agent.json) is run after a reply for the chats
 * that use it. The checker and the executor above are generated from src/canvas-kit/boards/agent-check.js and
 * agent-run.js (bun scripts/sync-agents-plugin.ts); this half is the host: it reads the chat, asks the models
 * the executor wants asked, keeps the agent's own state and a run log, and hands a "prompt insert" to the next reply.
 *
 * Data (under the app's data/ dir):
 *   agents/<id>.vertep-agent.json        the installed agent, checked and compiled
 *   agents/grants/<id>.json              the permissions the user confirmed: { needs: [...] }
 *   agents/config.json                   { model?, models?: { <role>: <model> } }
 *   agents/state/<chatId>/<id>.json      the agent's own fields in that chat, { v, own, last, before }
 *   agents/runs/<chatId>.json            the newest runs: { v, runs: [...] }
 *   agents/inserts/<chatId>.json         prompt inserts waiting for the next reply: { v, items: [...] }
 * Presets and a chat's binding are the engine's (agents/presets, agents/settings.json, chat meta `agents`).
 *
 * Not yet: Dashboard fields (read:state.*, write:state.*), the sources preGenInjections / parallelResults and the
 * triggers `before` and `parallel` (they need the client to wait for the agent before it sends the reply). An agent
 * that needs them installs but does not run, and says so.
 */

const AG_CHAT = /^[A-Za-z0-9_-]{1,120}$/;
const AG_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const AG_MODEL = /^[^\s]{1,200}$/;
const AG_FILE_MAX = 256 * 1024;
const AG_RUNS_MAX = 100;
const AG_PLACES = ["log", "feed", "top1", "top2", "float", "toast", "note", "bottom", "inspector"];
const AG_PHASES = ["before", "parallel", "after", "manual"];

const str = (v) => (typeof v === "string" ? v.trim() : "");
const ok = (json, status) => ({ status: status || 200, json });
const readJsonAt = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};
const writeJsonAt = (fsx, path, v) => fsx.write(path, JSON.stringify(v, null, 2) + "\n");
const agentPath = (id) => "agents/" + id + ".vertep-agent.json";

// ---------- which agents a chat uses (the same rules as the engine's resolveChatAgents) ----------

function cleanItems(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  const out = [];
  for (const it of list) {
    if (!isObj(it) || typeof it.agent !== "string" || !AG_ID.test(it.agent) || seen.has(it.agent)) continue;
    seen.add(it.agent);
    out.push({ agent: it.agent, on: it.on !== false, ...(AG_PHASES.includes(it.phase) ? { phase: it.phase } : {}) });
    if (out.length >= 50) break;
  }
  return out;
}

/** What a chat runs: its own copy of the items, else its preset's (else the default preset's). Items: { agent, on, phase?, show }. */
export function chatAgents(fsx, meta) {
  const b = isObj(meta && meta.agents) ? meta.agents : {};
  const dflt = str(readJsonAt(fsx, "agents/settings.json", {}).defaultPreset);
  const presetId = (typeof b.preset === "string" && b.preset) || dflt || "";
  const preset = presetId && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(presetId) ? readJsonAt(fsx, "agents/presets/" + presetId + ".json", null) : null;
  const own = cleanItems(b.own);
  const items = own || (preset ? cleanItems(preset.items) || [] : []);
  const show = isObj(b.show) ? b.show : {};
  return items.map((it) => ({ ...it, show: AG_PLACES.includes(show[it.agent]) ? show[it.agent] : null }));
}

// ---------- what this runner can give an agent ----------

const UNSUPPORTED_NEEDS = (t) => t.startsWith("read:state.") || t.startsWith("write:state.") || t === "read:preGenInjections" || t === "read:parallelResults";

/** The permissions of a file this runner cannot serve yet. */
export const unsupportedNeeds = (needs) => (Array.isArray(needs) ? needs : []).filter(UNSUPPORTED_NEEDS);

function loadAgent(fsx, id) {
  if (!AG_ID.test(id)) return null;
  const raw = readJsonAt(fsx, agentPath(id), null);
  if (!raw) return null;
  const report = validateAgent(raw);
  const f = readCanvasFile(raw);
  return "file" in f ? { file: f.file, report } : null;
}

const grantedOf = (fsx, id) => {
  const g = readJsonAt(fsx, "agents/grants/" + id + ".json", null);
  return isObj(g) && Array.isArray(g.needs) ? g.needs.filter((t) => typeof t === "string") : [];
};

/** Why an installed agent cannot run now, or "" when it can. */
function blocker(agent, granted) {
  if (agent.report.errors.length) return "The file does not pass the check: " + agent.report.errors[0].message;
  const needs = agent.report.derived ? agent.report.derived.needs : [];
  const no = unsupportedNeeds(needs);
  if (no.length) return "Needs something this version cannot give yet: " + no.join(", ");
  const missing = needs.filter((t) => !granted.includes(t));
  if (missing.length) return "Waiting for permission: " + missing.join(", ");
  return "";
}

// ---------- the chat as an agent sees it ----------

function readChatFiles(fsx, chatId) {
  const meta = readJsonAt(fsx, "chats/" + chatId + ".meta.json", null);
  if (!isObj(meta)) return null;
  const msgs = [];
  try {
    for (const line of String(fsx.read("chats/" + chatId + ".jsonl")).split("\n")) {
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line);
        if (isObj(m) && m.id !== undefined && m.id !== null && m.id !== "") msgs.push(m);
      } catch {}
    }
  } catch {}
  return { meta, msgs };
}

const msgKey = (m) => m.id + "#" + (Number.isFinite(m.swipe) ? m.swipe : 0);
const isUserMsg = (m) => m.role === "user";
const isReplyMsg = (m) => m.role !== "user" && m.role !== "system";
const msgText = (m, thinking) => {
  const t = typeof m.text === "string" ? m.text : "";
  return (thinking ? t : t.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "")).trim();
};
const lastOf = (msgs, test) => {
  for (let i = msgs.length - 1; i >= 0; i--) if (test(msgs[i]) && msgText(msgs[i], false)) return msgs[i];
  return null;
};

/** One `give` of the Input card -> text (or undefined when the chat has nothing for it). */
function sourceValue(fsx, chat, give, last) {
  const { meta, msgs } = chat;
  const src = give.source;
  if (src === "lastReply") { const m = lastOf(msgs, isReplyMsg); return m ? msgText(m, false) : undefined; }
  if (src === "lastUserMessage") { const m = lastOf(msgs, isUserMsg); return m ? msgText(m, false) : undefined; }
  if (src === "history") {
    const n = Number.isInteger(give.last) && give.last > 0 ? Math.min(give.last, 60) : 10;
    const only = give.only === "user" ? isUserMsg : give.only === "char" ? isReplyMsg : () => true;
    const rows = msgs.filter((m) => m.role !== "system" && only(m)).slice(-n).map((m) => (str(m.name) || (isUserMsg(m) ? "User" : "Character")) + ": " + msgText(m, give.thinking === true)).filter((r) => r.length > 2);
    return rows.length ? rows.join("\n\n") : undefined;
  }
  if (src === "card") {
    const card = meta.characterId ? readJsonAt(fsx, "characters/" + meta.characterId + "/card.json", null) : null;
    if (!isObj(card)) return undefined;
    const t = [card.name, card.description, card.personality, card.scenario].filter((x) => typeof x === "string" && x.trim()).join("\n\n");
    return t ? clip(t, 4000) : undefined;
  }
  if (src === "persona") {
    const p = meta.personaId ? readJsonAt(fsx, "personas/" + meta.personaId + ".json", null) : null;
    return isObj(p) && str(p.description) ? clip(p.description, 2000) : undefined;
  }
  if (src === "authorNote") return typeof meta.authorNote === "string" && meta.authorNote.trim() ? clip(meta.authorNote, 2000) : undefined;
  if (src === "myPrevious") return typeof last === "string" && last ? last : undefined;
  return undefined; // summary, and anything this host does not know
}

// ---------- which model answers an agent's question ----------

function modelFor(fsx, meta, role) {
  const cfg = readJsonAt(fsx, "agents/config.json", {});
  const dash = readJsonAt(fsx, "dashboard/config.json", null);
  const settings = readJsonAt(fsx, "settings.json", null);
  const list = [isObj(cfg.models) ? cfg.models[role] : "", cfg.model, isObj(dash) ? dash.sensorModel : "", meta && meta.model, isObj(settings) ? settings.model : ""];
  const hit = list.find((m) => AG_MODEL.test(str(m)));
  return hit ? str(hit) : "";
}

const AGENT_SYSTEM = "You help a small program that tracks a story. Answer exactly in the format the question asks for, with no preface and no commentary.";

// ---------- the agent's own state and the run log ----------

const statePath = (chatId, id) => "agents/state/" + chatId + "/" + id + ".json";
function loadOwn(fsx, chatId, id, schema) {
  const s = readJsonAt(fsx, statePath(chatId, id), null);
  return { own: initialOwn(schema), ...(isObj(s) && isObj(s.own) ? { own: { ...initialOwn(schema), ...s.own } } : {}), raw: isObj(s) ? s : null };
}
const runsPath = (chatId) => "agents/runs/" + chatId + ".json";
const insertsPath = (chatId) => "agents/inserts/" + chatId + ".json";

/** What a run left as text for the agent to read next time (its `myPrevious`). */
const lastTextOf = (outputs) => {
  const o = outputs.find((x) => typeof x.text === "string" && x.text);
  return o ? clip(o.text, 2000) : "";
};

// ---------- /agents/run ----------

function everyNOk(trigger, msgs) {
  const n = isObj(trigger) && Number.isInteger(trigger.everyN) && trigger.everyN > 1 ? trigger.everyN : 1;
  return n === 1 || msgs.filter(isReplyMsg).length % n === 0;
}
function keywordsOk(trigger, msgs) {
  const kw = isObj(trigger) && Array.isArray(trigger.keywords) ? trigger.keywords.filter((k) => typeof k === "string" && k.trim()) : [];
  if (!kw.length) return true;
  const text = msgs.slice(-2).map((m) => msgText(m, false).toLowerCase()).join("\n");
  return kw.some((k) => text.includes(k.trim().toLowerCase()));
}

function runRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const chatId = str(b.chatId);
  if (!AG_CHAT.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChatFiles(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const manual = str(b.agent);
  const last = chat.msgs.length ? chat.msgs[chat.msgs.length - 1] : null;
  if (!last) return ok({ ok: true, skipped: "empty chat" });
  const key = msgKey(last);
  const items = chatAgents(fsx, chat.meta).filter((it) => it.on && (manual ? it.agent === manual : (it.phase || "") !== "manual"));
  const runsFile = readJsonAt(fsx, runsPath(chatId), { v: 1, runs: [] });
  const runs = Array.isArray(runsFile.runs) ? runsFile.runs : [];
  const picks = [];
  const skipped = [];
  for (const it of items) {
    const agent = loadAgent(fsx, it.agent);
    if (!agent) { skipped.push({ agent: it.agent, why: "not installed" }); continue; }
    const when = it.phase || (isObj(agent.file.agent && agent.file.agent.trigger) ? agent.file.agent.trigger.when : "");
    if (manual) { /* a manual run goes ahead whatever the trigger says */ }
    else if (when !== "after") { skipped.push({ agent: it.agent, why: when === "manual" ? "manual" : "this runner starts only agents set to run after a reply" }); continue; }
    else if (!isReplyMsg(last)) { skipped.push({ agent: it.agent, why: "no new reply" }); continue; }
    else if (!everyNOk(agent.file.agent.trigger, chat.msgs) || !keywordsOk(agent.file.agent.trigger, chat.msgs)) { skipped.push({ agent: it.agent, why: "its trigger did not fire" }); continue; }
    const why = blocker(agent, grantedOf(fsx, it.agent));
    if (why) { skipped.push({ agent: it.agent, why }); continue; }
    if (!manual && runs.some((r) => r.agent === it.agent && r.key === key && r.status !== "failed")) { skipped.push({ agent: it.agent, why: "already ran for this reply" }); continue; }
    picks.push({ item: it, agent });
  }
  if (!picks.length) return ok({ ok: true, ran: [], skipped });

  // every pass asks again from the start; the cards that cost nothing are cheap, and a pass can lose nothing
  const results = picks.map((pick, ai) => {
    const schema = (pick.agent.file.agent && pick.agent.file.agent.state) || {};
    const st = loadOwn(fsx, chatId, pick.item.agent, schema);
    // a regenerated reply replaces the run of the same message instead of counting twice
    const before = st.raw && isObj(st.raw.before) && String(st.raw.before.id) === String(last.id) ? st.raw.before.own : null;
    const base = before ? { ...initialOwn(schema), ...before } : st.own;
    const inputs = {};
    for (const g of (pick.agent.file.nodes.find((n) => n.type === "agent.input") || { params: {} }).params.give || []) {
      inputs[g.id] = sourceValue(fsx, chat, g, st.raw && typeof st.raw.last === "string" ? st.raw.last : "");
    }
    const ctx = { inputs, own: base, dash: {}, chat: { messageCount: chat.msgs.length, lastSpeaker: str(last.name) } };
    const answers = {};
    pick.agent.file.nodes.forEach((n, ni) => {
      const r = host.llm.results[`ag_${ai}_${ni}`];
      if (!r) return;
      const text = typeof r.text === "string" ? r.text : "";
      answers[n.id] = r.error || !text.trim() ? { error: typeof r.error === "string" ? r.error : isObj(r.error) && r.error.message ? String(r.error.message) : "the model sent no answer" } : { text, model: r.model };
    });
    return { ai, pick, schema, base, st, res: runAgent(pick.agent.file, ctx, answers), answers };
  });

  let asked = 0;
  for (const r of results) {
    if (r.res.status !== "need") continue;
    for (const q of r.res.requests) {
      const ni = r.pick.agent.file.nodes.findIndex((n) => n.id === q.node);
      const model = modelFor(fsx, chat.meta, q.role);
      host.llm.request(`ag_${r.ai}_${ni}`, {
        ...(model ? { model } : {}),
        systemPrompt: AGENT_SYSTEM,
        messages: [{ role: "user", content: q.prompt }],
        presetParams: { temperature: 0.3, max_tokens: Number.isInteger(q.maxTokens) && q.maxTokens > 0 ? Math.min(q.maxTokens, 4000) : 600 },
      });
      asked++;
    }
  }
  if (asked) return { __llmPending: true, stash: { started: Number(req.stash && req.stash.started) || Date.now() } };

  // every agent has an answer: commit
  const now = Date.now();
  const started = Number(req.stash && req.stash.started) || now;
  const ranOut = [];
  const inserts = readJsonAt(fsx, insertsPath(chatId), { v: 1, items: [] });
  let items2 = Array.isArray(inserts.items) ? inserts.items : [];
  for (const r of results) {
    const id = r.pick.item.agent;
    const entry = { agent: id, key, at: now, ms: now - started, status: "ok", trace: r.res.trace };
    if (r.res.status === "failed") {
      runs.push({ ...entry, status: "failed", reason: r.res.reason, node: r.res.node });
      ranOut.push({ agent: id, status: "failed", reason: r.res.reason });
      continue;
    }
    const applied = applyWrites(r.schema, r.base, r.res.writes);
    const outputs = r.res.outputs.map((o) => (o.show || r.pick.item.show ? { ...o, show: r.pick.item.show && (SHOW_BY_KIND[o.kind] || []).includes(r.pick.item.show) ? r.pick.item.show : o.show } : o));
    writeJsonAt(fsx, statePath(chatId, id), { v: 1, own: applied.own, last: lastTextOf(outputs), before: { id: String(last.id), own: r.base } });
    items2 = items2.filter((x) => x.agent !== id).concat(outputs.filter((o) => o.kind === "prompt-insert" && o.text).map((o) => ({ agent: id, label: o.label, text: o.text, position: o.position, at: now })));
    runs.push({ ...entry, calls: r.res.calls, writes: r.res.writes, refused: applied.refused, outputs });
    ranOut.push({ agent: id, status: "ok", calls: r.res.calls, writes: r.res.writes.length, outputs: outputs.length });
  }
  writeJsonAt(fsx, runsPath(chatId), { v: 1, runs: runs.slice(-AG_RUNS_MAX) });
  writeJsonAt(fsx, insertsPath(chatId), { v: 1, items: items2 });
  return ok({ ok: true, ran: ranOut, skipped });
}

// ---------- install, list, grant, remove ----------

const needsOf = (file) => (file && file.agent && file.agent.derived && Array.isArray(file.agent.derived.needs) ? file.agent.derived.needs : []);

function installRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  if (!isObj(b.file)) return ok({ error: "file required" }, 400);
  if (JSON.stringify(b.file).length > AG_FILE_MAX) return ok({ error: "the file is over 256 KB" }, 400);
  const compiled = compileAgent(b.file);
  if ("error" in compiled) return ok({ error: compiled.error, errors: [{ code: "E_ENVELOPE", message: compiled.error }] }, 400);
  // a file that came with a derived section is checked as it is: a lie in it is refused, not quietly repaired
  const given = isObj(b.file.agent) && isObj(b.file.agent.derived) ? validateAgent(b.file) : null;
  const report = given || compiled.report;
  if (report.errors.length) return ok({ error: report.errors[0].message, errors: report.errors, warnings: report.warnings }, 400);
  const file = given ? readCanvasFile(b.file).file : compiled.file;
  const id = file.agent.id;
  const had = readJsonAt(fsx, agentPath(id), null);
  writeJsonAt(fsx, agentPath(id), file);
  const needs = needsOf(file);
  const ask = b.grant === true ? needs.filter((t) => !UNSUPPORTED_NEEDS(t)) : Array.isArray(b.grant) ? b.grant.filter((t) => needs.includes(t) && !UNSUPPORTED_NEEDS(t)) : null;
  // an update keeps what the user already confirmed, for the permissions it still asks for
  const kept = grantedOf(fsx, id).filter((t) => needs.includes(t));
  const granted = [...new Set([...kept, ...(ask || [])])];
  writeJsonAt(fsx, "agents/grants/" + id + ".json", { v: 1, needs: granted });
  return ok({ ok: true, id, updated: !!had, needs, granted, missing: needs.filter((t) => !granted.includes(t)), unsupported: unsupportedNeeds(needs), warnings: report.warnings });
}

function listRoute(req, host) {
  const fsx = host.fs;
  let files = [];
  try {
    files = fsx.list("agents").filter((f) => f.endsWith(".vertep-agent.json"));
  } catch {}
  const agents = [];
  for (const f of files) {
    const id = f.slice(0, -".vertep-agent.json".length);
    const agent = loadAgent(fsx, id);
    if (!agent) continue;
    const a = agent.file.agent || {};
    const granted = grantedOf(fsx, id);
    const needs = agent.report.derived ? agent.report.derived.needs : [];
    agents.push({
      id, name: str(a.name) || id, description: str(a.description), author: str(a.author), version: str(a.version),
      trigger: isObj(a.trigger) ? a.trigger : {}, models: isObj(a.models) ? a.models : {},
      needs, granted, missing: needs.filter((t) => !granted.includes(t)), unsupported: unsupportedNeeds(needs),
      maxCalls: agent.report.derived ? agent.report.derived.maxCalls : 0, errors: agent.report.errors, warnings: agent.report.warnings,
      runnable: !blocker(agent, granted), blocker: blocker(agent, granted),
    });
  }
  return ok({ agents });
}

function grantRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const id = str(b.id);
  const agent = loadAgent(fsx, id);
  if (!agent || !agent.report.derived) return ok({ error: "not installed" }, 404);
  const needs = agent.report.derived.needs;
  const want = b.tokens === true ? needs : Array.isArray(b.tokens) ? b.tokens.filter((t) => typeof t === "string") : null;
  if (!want) return ok({ error: "tokens: true or a list required" }, 400);
  const granted = want.filter((t) => needs.includes(t) && !UNSUPPORTED_NEEDS(t));
  writeJsonAt(fsx, "agents/grants/" + id + ".json", { v: 1, needs: granted });
  return ok({ ok: true, id, granted, missing: needs.filter((t) => !granted.includes(t)) });
}

function removeRoute(req, host, id) {
  const fsx = host.fs;
  if (!AG_ID.test(id)) return ok({ error: "invalid id" }, 400);
  try { fsx.remove(agentPath(id)); } catch {}
  try { fsx.remove("agents/grants/" + id + ".json"); } catch {}
  return ok({ ok: true });
}

// ---------- state, runs, config ----------

function stateRoute(req, host) {
  const fsx = host.fs;
  const chatId = str(req.query && req.query.chatId);
  const id = str(req.query && req.query.agent);
  if (!AG_CHAT.test(chatId) || !AG_ID.test(id)) return ok({ error: "chatId and agent required" }, 400);
  const agent = loadAgent(fsx, id);
  const schema = (agent && agent.file.agent && agent.file.agent.state) || {};
  if (req.method === "DELETE") { try { fsx.remove(statePath(chatId, id)); } catch {} return ok({ ok: true }); }
  const st = loadOwn(fsx, chatId, id, schema);
  return ok({ agent: id, schema, own: st.own });
}

function runsRoute(req, host) {
  const chatId = str(req.query && req.query.chatId);
  if (!AG_CHAT.test(chatId)) return ok({ error: "chatId required" }, 400);
  const f = readJsonAt(host.fs, runsPath(chatId), { runs: [] });
  return ok({ runs: Array.isArray(f.runs) ? f.runs : [], inserts: (readJsonAt(host.fs, insertsPath(chatId), { items: [] }).items || []).map((x) => ({ agent: x.agent, label: x.label, at: x.at })) });
}

function configRoute(req, host) {
  const fsx = host.fs;
  if (req.method === "GET") return ok(readJsonAt(fsx, "agents/config.json", {}));
  const b = isObj(req.body) ? req.body : {};
  const cur = readJsonAt(fsx, "agents/config.json", {});
  const next = { ...(isObj(cur) ? cur : {}) };
  if ("model" in b) { if (AG_MODEL.test(str(b.model))) next.model = str(b.model); else delete next.model; }
  if ("models" in b && isObj(b.models)) {
    const m = {};
    for (const [role, v] of Object.entries(b.models)) if (/^[A-Za-z0-9_-]{1,40}$/.test(role) && AG_MODEL.test(str(v))) m[role] = str(v);
    if (Object.keys(m).length) next.models = m; else delete next.models;
  }
  writeJsonAt(fsx, "agents/config.json", next);
  return ok(next);
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (!path.startsWith("/agents/")) return null;
  const seg = path.split("/").filter(Boolean);
  if (path === "/agents/list" && req.method === "GET") return listRoute(req, host);
  if (path === "/agents/install" && req.method === "PUT") return installRoute(req, host);
  if (path === "/agents/grant" && req.method === "POST") return grantRoute(req, host);
  if (path === "/agents/run" && req.method === "POST") return runRoute(req, host);
  if (path === "/agents/state" && (req.method === "GET" || req.method === "DELETE")) return stateRoute(req, host);
  if (path === "/agents/runs" && req.method === "GET") return runsRoute(req, host);
  if (path === "/agents/config" && (req.method === "GET" || req.method === "PUT")) return configRoute(req, host);
  if (seg.length === 2 && req.method === "DELETE") return removeRoute(req, host, seg[1]);
  return ok({ error: "not found" }, 404);
}

// ---------- the hint for the next reply ----------

function withLastUser(messages, text) {
  const last = messages[messages.length - 1];
  if (last && last.role === "user" && typeof last.content === "string") return [...messages.slice(0, -1), { ...last, content: last.content + "\n\n" + text }];
  return [...messages, { role: "user", content: text }];
}

/** The prompt inserts of the agents this chat still uses are added to the reply request, after the history, with the agent's label. */
export function llmRequest(ctx, host) {
  if (!ctx || ctx.key !== "reply") return null;
  const req = ctx.request || {};
  const chatId = String(req.sessionId || "");
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx || !AG_CHAT.test(chatId) || !Array.isArray(req.messages)) return null;
  try {
    const f = readJsonAt(fsx, insertsPath(chatId), null);
    if (!isObj(f) || !Array.isArray(f.items) || !f.items.length) return null;
    const meta = readJsonAt(fsx, "chats/" + chatId + ".meta.json", null);
    if (!isObj(meta)) return null;
    const live = new Set(chatAgents(fsx, meta).filter((it) => it.on).map((it) => it.agent));
    const send = f.items.filter((x) => isObj(x) && live.has(x.agent) && typeof x.text === "string" && x.text.trim());
    if (!send.length) return null;
    const text = send.map((x) => "[" + (str(x.label) || x.agent) + "]\n" + x.text.trim()).join("\n\n");
    return { messages: withLastUser(req.messages, text), promptSources: { parts: send.map((x) => ({ kind: "plugin", label: "Agent: " + (str(x.label) || x.agent), text: x.text })) } };
  } catch (e) {
    try { host.log("agents insert: " + (e && e.message ? e.message : String(e))); } catch {}
    return null;
  }
}
