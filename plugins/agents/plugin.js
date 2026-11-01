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
  authorNote: 'text', myPrevious: 'text', preGenInjections: 'text', parallelResults: 'text', litopysFacts: 'text', lorebook: 'text', state: null,
};
/**
 * The Dashboard fields an agent may read (#132). The list is short on purpose: the user's own notes, the threads and
 * what the characters said stay closed. A `scene` field belongs to the scene; a `char` field to one character: the
 * `of` name on the Input entry (or the If operand), else the character who spoke last. Reading only: no card writes
 * these fields yet.
 */
const DASH_FIELDS = {
  present: { as: 'text' }, place: { as: 'text' }, weather: { as: 'text' },
  mood: { as: 'text', char: true }, condition: { as: 'text', char: true }, outfit: { as: 'text', char: true },
  holding: { as: 'text', char: true }, goal: { as: 'text', char: true },
  trust: { as: 'number', char: true }, comfort: { as: 'number', char: true }, attraction: { as: 'number', char: true },
  respect: { as: 'number', char: true }, affection: { as: 'number', char: true },
};
/** Where the host puts a Dashboard value for the executor: the field, and `field@name` when the entry names a character. */
const dashKey = (x) => (x?.of ? `${x.field}@${x.of}` : x?.field);
/** One `state` source (an Input entry or an If operand): the field must be on the list, with the right type and `of` only where it means something. */
function checkDashRead(o, where, err, node) {
  const spec = DASH_FIELDS[o.field];
  if (!spec) {
    err('E_DASH_FIELD', `${where}: the Dashboard field "${o.field}" is not available to agents. They can read: ${Object.keys(DASH_FIELDS).join(', ')}`, node);
    return;
  }
  if ((o.as ?? 'text') !== spec.as)
    err('E_DASH_TYPE', `${where}: "${o.field}" is a ${spec.as} field, so "as" must be "${spec.as}"`, node);
  if (o.of !== undefined && !spec.char)
    err('E_DASH_OF', `${where}: "${o.field}" belongs to the scene, so it takes no character name ("of")`, node);
  else if (o.of !== undefined && (!isString(o.of) || !o.of.trim() || o.of.length > 60))
    err('E_DASH_OF', `${where}: "of" is a character name of 1 to 60 characters`, node);
}
const shapeType = (spec) => (spec === 'number' ? 'number' : spec === 'bool' ? 'flag' : 'text'); // enum:a|b and text are text
const PORT_ID = /^[A-Za-z0-9_-]+$/;
const slotsOf = (s) => [...new Set([...String(s ?? '').matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)].map((m) => m[1]))];
const shapeOut = (shape) => Object.entries((shape ?? {})).map(([id, spec]) => ({ id, side: 'out', type: shapeType(spec) }));
const ownType = (as) => (as === 'number' ? 'number' : as === 'flag' ? 'flag' : 'text'); // a state value on a wire
const itemPorts = (item) => Object.entries((item ?? {})).map(([id, spec]) => ({ id, side: 'in', type: ownType(spec) }));
const whenIn = [{ id: 'when', side: 'in', type: 'signal', optional: true }];
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
  'random.dice': {
    label: 'Dice', colorVar: '--k-logic', hint: 'Rolls dice in code, never the model. The same reply always gets the same roll.',
    ports: () => [...whenIn, { id: 'total', side: 'out', type: 'number' }, { id: 'rolls', side: 'out', type: 'text' }],
    needs: () => [],
  },
  'random.pick': {
    label: 'Pick', colorVar: '--k-logic', hint: 'Picks one of your lines by weight, in code. The same reply always gets the same pick.',
    ports: () => [...whenIn, { id: 'text', side: 'out', type: 'text' }, { id: 'index', side: 'out', type: 'number' }],
    needs: () => [],
  },
  'text.extract': {
    label: 'Extract', colorVar: '--k-data', hint: 'Takes the part of a text a pattern matches. Never calls the model.',
    ports: () => [{ id: 'in', side: 'in', type: 'text' }, { id: 'match', side: 'out', type: 'text' }, { id: 'none', side: 'out', type: 'signal' }],
    needs: () => [],
  },
  'text.cut': {
    label: 'Cut', colorVar: '--k-data', hint: 'Keeps the first or last part of a text: characters, words or lines.',
    ports: () => [{ id: 'in', side: 'in', type: 'text' }, { id: 'text', side: 'out', type: 'text' }],
    needs: () => [],
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
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const PATTERN_MAX = 200;
const PICK_MAX = 40;
/** A pattern that can run for a very long time on a short text: a quantified group that holds a quantifier or an alternation, or a back reference. The run is stopped by the sandbox after seconds, so refuse these up front. */
const riskyPattern = (src) => /\\[1-9]/.test(src) || /\((?:[^()\\]|\\.)*(?:[*+]|\{\d|\|)(?:[^()\\]|\\.)*\)[*+{]/.test(src);
/** What each Input source that gives a list reads at most; the host clamps a number outside it and ignores a wrong one. */
const GIVE_LIMITS = { history: { key: 'last', max: 60 }, litopysFacts: { key: 'limit', max: 60 }, lorebook: { key: 'limit', max: 20 } };
/** A count on an Input source that the host would change on its own: said here, so it is not silent. */
function checkGiveLimits(n, warn) {
  const w = (msg) => warn('W_LIMIT', `"${n.title}": ${msg}`, n.id);
  for (const g of n.params?.give ?? []) {
    const lim = GIVE_LIMITS[g?.source];
    if (!lim) continue;
    const v = g[lim.key];
    if (v !== undefined && !isInt(v, 1, lim.max))
      w(Number.isInteger(v) && v > lim.max ? `${g.id}: ${lim.key} ${v} is over ${lim.max}, so ${lim.max} is used` : `${g.id}: ${lim.key} must be a whole number from 1 to ${lim.max}, so the default is used`);
    if (g.source === 'history' && g.tokens !== undefined && !isInt(g.tokens, 100, 100000))
      w(Number.isInteger(g.tokens) && g.tokens > 100000 ? `${g.id}: tokens ${g.tokens} is over 100000, so 100000 is used` : `${g.id}: tokens must be a whole number from 100 to 100000, so no cap is applied`);
  }
}
/** The parameters of the dice, pick, extract and cut cards. */
function checkCodeCard(n, err) {
  const p = n.params ?? {};
  const bad = (code, msg) => err(code, `"${n.title}": ${msg}`, n.id);
  if (n.type === 'random.dice') {
    if (p.count !== undefined && !isInt(p.count, 1, 20)) bad('E_PARAM', 'count is a whole number from 1 to 20');
    if (p.sides !== undefined && !isInt(p.sides, 2, 1000)) bad('E_PARAM', 'sides is a whole number from 2 to 1000');
    if (p.bonus !== undefined && !isInt(p.bonus, -1000, 1000)) bad('E_PARAM', 'bonus is a whole number from -1000 to 1000');
  } else if (n.type === 'random.pick') {
    const items = Array.isArray(p.items) ? p.items : [];
    if (items.length < 2 || items.length > PICK_MAX) bad('E_PARAM', `a pick needs 2 to ${PICK_MAX} lines`);
    else if (items.some((i) => !isObj(i) || typeof i.text !== 'string' || !i.text.trim() || i.text.length > 400 || (i.weight !== undefined && !isInt(i.weight, 1, 100))))
      bad('E_PARAM', 'every line needs text (up to 400 characters) and a weight from 1 to 100 or none');
  } else if (n.type === 'text.extract') {
    const flags = p.flags === undefined ? '' : p.flags;
    if (typeof p.pattern !== 'string' || !p.pattern || p.pattern.length > PATTERN_MAX) { bad('E_PARAM', `pattern is text of 1 to ${PATTERN_MAX} characters`); return; }
    if (typeof flags !== 'string' || !/^[ims]{0,3}$/.test(flags) || new Set(flags).size !== flags.length) bad('E_PARAM', 'flags may be i, m and s');
    let groups = 0;
    try { groups = new RegExp(p.pattern + '|', typeof flags === 'string' && /^[ims]{0,3}$/.test(flags) ? flags : '').exec('').length - 1; }
    catch { bad('E_REGEX', 'the pattern is not a valid regular expression'); return; }
    if (riskyPattern(p.pattern)) bad('E_REGEX_RISK', 'a repeated group that holds a repeat or a choice can take very long on some texts; write it without nesting');
    if (p.group !== undefined && (!isInt(p.group, 0, 9) || p.group > groups)) bad('E_PARAM', `group is a whole number from 0 to ${groups}, the groups the pattern has`);
    if (p.all !== undefined && typeof p.all !== 'boolean') bad('E_PARAM', 'all is true or false');
    if (p.join !== undefined && (typeof p.join !== 'string' || p.join.length > 20)) bad('E_PARAM', 'join is text of up to 20 characters');
  } else if (n.type === 'text.cut') {
    if (!['first', 'last'].includes(p.keep)) bad('E_PARAM', 'keep is first or last');
    if (!['chars', 'words', 'lines'].includes(p.unit)) bad('E_PARAM', 'unit is chars, words or lines');
    if (!isInt(p.n, 1, 20000)) bad('E_PARAM', 'n is a whole number from 1 to 20000');
  }
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
/** What is wrong with one template, for the editor: `[{code, message}]`, empty when it is fine. `state` is the agent's `state` (the shape the checker reads). */
function templateProblems(tpl, state) {
  const out = [];
  if (typeof tpl !== 'string' || !tpl.trim())
    return [{ code: 'E_WIDGET', message: 'The template is empty' }];
  if (tpl.length > 8192)
    return [{ code: 'E_WIDGET', message: 'The template is longer than 8192 characters' }];
  checkTemplate(tpl, state ?? {}, 'Template', (code, message) => out.push({ code, message: message.replace(/^Template: /, '') }));
  return out;
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
        if (w.height !== undefined && (!Number.isInteger(w.height) || w.height < 40 || w.height > 600))
          err('E_WIDGET', `${where}: height is a whole number of pixels from 40 to 600`);
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
/** The most model calls an agent may make one behind another. The runner takes one pass for each, plus the pass that commits (the Agents plugin's `limits.passes` is this plus one). */
const AGENT_MAX_ROUNDS = 7;
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
    if (n.type === 'agent.input') {
      checkGiveLimits(n, warn);
      for (const g of p.give ?? [])
        if (g?.source === 'state') checkDashRead(g, `"${n.title}" (${g.id})`, err, n.id);
    }
    if (n.type === 'logic.if')
      for (const r of p.rows ?? [])
        for (const o of [r.left, r.right])
          if (o?.from === 'state') checkDashRead(o, `A rule in "${n.title}"`, err, n.id);
    if (n.type.startsWith('state.'))
      checkStateCard(n, state, err);
    if (n.type.startsWith('random.') || n.type.startsWith('text.') && n.type !== 'text.template')
      checkCodeCard(n, err);
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
  // rounds: the most model calls one behind another on any path. Each round is one more pass of the runner, so the number is bounded
  if (!errors.some((e) => e.code === 'E_CYCLE')) {
    const memo = new Map();
    const depth = (id) => {
      if (memo.has(id))
        return memo.get(id);
      const own = byId.get(id)?.type === 'model.ask' ? 1 : 0;
      const d = own + Math.max(0, ...(adj.get(id) ?? []).map(depth));
      memo.set(id, d);
      return d;
    };
    const rounds = Math.max(0, ...f.nodes.map((n) => depth(n.id)));
    if (rounds > AGENT_MAX_ROUNDS)
      err('E_ROUNDS', `A path of the graph asks the model ${rounds} times one after another, and an agent may ask at most ${AGENT_MAX_ROUNDS} times in a row. Ask in parallel, or put two questions into one`);
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

// ---------- dice, pick, extract, cut: plain code, no model ----------

const hash32 = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
/** A small seeded generator (mulberry32): the same seed gives the same numbers on every pass of one run. */
function seeded(seed) {
  let a = hash32(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` dice of `sides` sides plus `bonus`: { total, rolls: "4, 17" }. */
function rollDice(seed, p) {
  const count = Number.isInteger(p.count) ? p.count : 1;
  const sides = Number.isInteger(p.sides) ? p.sides : 20;
  const bonus = Number.isInteger(p.bonus) ? p.bonus : 0;
  const rnd = seeded(seed);
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(rnd() * sides));
  return { total: rolls.reduce((a, b) => a + b, 0) + bonus, rolls: rolls.join(', ') };
}

/** One line by weight (a weight is 1 when none is given): { index: 1-based, text }. */
function pickWeighted(seed, items) {
  const weights = items.map((i) => (Number.isInteger(i.weight) ? i.weight : 1));
  let at = seeded(seed)() * weights.reduce((a, b) => a + b, 0);
  let index = 0;
  while (index < items.length - 1 && at >= weights[index]) { at -= weights[index]; index++; }
  return { index: index + 1, text: items[index].text };
}

/** The first match of a pattern (or every match, joined) as text; null when nothing matched. At most 20 matches. */
function extractText(text, p) {
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
function cutText(text, p) {
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
 * ctx: { inputs: { <give id>: text | number | undefined }, own: { <field>: value }, dash: { <field>: value }, chat: { messageCount, lastSpeaker }, seed }
 *   `seed` makes the dice and picks repeatable: the host gives the same text for the same reply, so every pass of a run rolls the same.
 *   `inputs` is what the host read for the agent's Input card; the executor trusts nothing else about the chat.
 * answers: { <model.ask card id>: { text } | { error } }
 * Returns { status: "need", requests, trace }, { status: "done", writes, outputs, calls, trace } or { status: "failed", reason, node, trace }.
 * With `ctx.explain` the result also has `wires`: what every output port carries, for the editor's trial run
 * (`{ "<node>:<port>": { state: "value", value } | { state: "skip" | "wait" | "missing" } }`). The runner never asks for it.
 */
function runAgent(file, ctx, answers) {
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
 *   agents/config.json                   { model?, models?: { <role>: <model> }, byAgent?: { <id>: { models?: { <role>: <model> }, maxCalls?, everyN? } } }
 *   agents/state/<chatId>/<id>.json      the agent's own fields in that chat, { v, own, last, before }
 *   agents/runs/<chatId>.json            the newest runs: { v, runs: [...] }
 *   agents/inserts/<chatId>.json         prompt inserts waiting for the next reply: { v, items: [...] }
 * Presets and a chat's binding are the engine's (agents/presets, agents/settings.json, chat meta `agents`).
 *
 * Dashboard fields: read:state.<field> works for the fields on DASH_FIELDS (#132); write:state.* does not yet.
 * Not yet: write:state.*, the sources preGenInjections / parallelResults. An agent that needs them installs but does
 * not run, and says so.
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
    out.push({ agent: it.agent, on: it.on !== false, ...(AG_PHASES.includes(it.phase) ? { phase: it.phase } : {}), ...(it.wait === false ? { wait: false } : {}) });
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
  const also = isObj(b.also) ? b.also : {};
  return items.map((it) => ({ ...it, show: AG_PLACES.includes(show[it.agent]) ? show[it.agent] : null, ...(also[it.agent] === true ? { also: true } : {}) }));
}

// ---------- what this runner can give an agent ----------

const UNSUPPORTED_NEEDS = (t) =>
  (t.startsWith("read:state.") ? !Object.prototype.hasOwnProperty.call(DASH_FIELDS, t.slice("read:state.".length)) : t.startsWith("write:state."))
  || t === "read:preGenInjections" || t === "read:parallelResults";

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

/** The permissions the user has been shown and answered for: every need at the last grant, else (older files) what was granted. A need outside it is new in an update. */
const askedOf = (fsx, id) => {
  const g = readJsonAt(fsx, "agents/grants/" + id + ".json", null);
  const a = isObj(g) && Array.isArray(g.asked) ? g.asked : grantedOf(fsx, id);
  return a.filter((t) => typeof t === "string");
};

/** Why an installed agent cannot run now, or "" when it can. */
function blocker(agent, granted, cap) {
  if (agent.report.errors.length) return "The file does not pass the check: " + agent.report.errors[0].message;
  const needs = agent.report.derived ? agent.report.derived.needs : [];
  const no = unsupportedNeeds(needs);
  if (no.length) return "Needs something this version cannot give yet: " + no.join(", ");
  const missing = needs.filter((t) => !granted.includes(t));
  if (missing.length) return "Waiting for permission: " + missing.join(", ");
  const calls = agent.report.derived ? agent.report.derived.maxCalls : 0;
  if (cap && calls > cap) return "Can make up to " + calls + " model calls a run, over your limit of " + cap + " for this agent";
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

/** A token estimate by script (ASCII about 3.5 characters a token, other letters 2, CJK and the rest 1), as the engine's. */
function approxTokens(text) {
  const s = String(text == null ? "" : text);
  let ascii = 0, alpha = 0, other = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) ascii++;
    else if (c < 0x2e80) alpha++;
    else other++;
  }
  return Math.ceil(ascii / 3.5 + alpha / 2 + other);
}

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
    // an optional cap in tokens: the oldest rows go first, the newest always stays
    const cap = Number.isInteger(give.tokens) && give.tokens >= 100 ? Math.min(give.tokens, 100000) : 0;
    while (cap && rows.length > 1 && approxTokens(rows.join("\n\n")) > cap) rows.shift();
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
  if (src === "litopysFacts") return litopysFactsText(fsx, meta, give);
  if (src === "lorebook") return lorebookText(fsx, meta, msgs, give);
  return undefined; // summary, and anything this host does not know
}

const giveLimit = (give, dflt, max) => (Number.isInteger(give.limit) && give.limit > 0 ? Math.min(give.limit, max) : dflt);

/** The chat's active Litopys facts, pinned ones first, then the newest, as "- fact" lines. Undefined when Litopys has none for this chat. */
function litopysFactsText(fsx, meta, give) {
  const rec = meta && AG_CHAT.test(str(meta.id)) ? readJsonAt(fsx, "litopys/chats/" + meta.id + ".json", null) : null;
  const facts = isObj(rec) && Array.isArray(rec.facts) ? rec.facts.filter((f) => isObj(f) && f.status === "active" && str(f.text)) : [];
  if (!facts.length) return undefined;
  const n = giveLimit(give, 20, 60);
  const pinned = facts.filter((f) => f.pinned === true);
  const rest = facts.filter((f) => f.pinned !== true);
  const pick = [...pinned, ...rest.slice(-Math.max(0, n - pinned.length))].slice(0, n);
  return clip(pick.map((f) => "- " + clip(str(f.text), 400)).join("\n"), 4000);
}

/**
 * The lorebook entries that apply to this chat now, as "- title: text" lines: the books the chat uses (the
 * character's embedded and linked books, the chat's own, the world book and the global ones), entries that are
 * constant or whose keys appear in the last six messages. An approximation of the app's scan: keys are matched as
 * plain text, regular-expression keys, timed effects, groups and probability are not applied. Undefined when none applies.
 */
function lorebookText(fsx, meta, msgs, give) {
  const card = meta && meta.characterId ? readJsonAt(fsx, "characters/" + meta.characterId + "/card.json", null) : null;
  const studio = isObj(card) && isObj(card.studio) ? card.studio : {};
  const ids = [studio.embeddedLorebookId, ...(Array.isArray(studio.linkedLorebookIds) ? studio.linkedLorebookIds : []), ...(meta && Array.isArray(meta.lorebookIds) ? meta.lorebookIds : []), meta && meta.worldBookId];
  const books = [];
  const seen = new Set();
  const take = (id) => {
    if (seen.has(id) || !AG_CHAT.test(id)) return;
    seen.add(id);
    const book = readJsonAt(fsx, "lorebooks/" + id + ".json", null);
    if (isObj(book)) books.push(book);
  };
  // the books the chat names first, in their order, then the global ones
  for (const id of ids) if (typeof id === "string") take(id);
  let files = [];
  try { files = (fsx.list("lorebooks") || []).filter((f) => f.endsWith(".json") && !f.startsWith("_")); } catch { files = []; }
  for (const f of files) {
    const id = f.slice(0, -5);
    if (seen.has(id)) continue;
    const book = readJsonAt(fsx, "lorebooks/" + f, null);
    if (isObj(book) && book.globalActive === true) { seen.add(id); books.push(book); }
  }
  const text = msgs.filter((m) => m.role !== "system").slice(-6).map((m) => msgText(m, false)).join("\n").toLowerCase();
  const hit = (e) => (Array.isArray(e.keys) ? e.keys : []).some((k) => typeof k === "string" && k.trim() && e.keysRegex !== true && text.includes(k.trim().toLowerCase()));
  const lines = [];
  for (const book of books) {
    for (const e of Array.isArray(book.entries) ? book.entries : []) {
      if (!isObj(e) || e.enabled === false || !str(e.content)) continue;
      if (e.status === "constant" || hit(e)) lines.push("- " + (str(e.title) ? str(e.title) + ": " : "") + clip(str(e.content), 400));
    }
  }
  return lines.length ? clip(lines.slice(0, giveLimit(give, 8, 20)).join("\n"), 4000) : undefined;
}

// ---------- which model answers an agent's question ----------

/** The user's own limits for one agent (`byAgent` of agents/config.json): a model for each role, the most model calls a run may make,
 *  and how often it runs (everyN: every N replies, in place of the author's trigger.everyN; 0 = the author's). */
function ownOf(cfg, id) {
  const o = isObj(cfg) && isObj(cfg.byAgent) && isObj(cfg.byAgent[id]) ? cfg.byAgent[id] : {};
  return {
    models: isObj(o.models) ? o.models : {},
    maxCalls: Number.isInteger(o.maxCalls) && o.maxCalls > 0 ? o.maxCalls : 0,
    everyN: Number.isInteger(o.everyN) && o.everyN >= 1 && o.everyN <= EVERY_N_MAX ? o.everyN : 0,
  };
}
const EVERY_N_MAX = 50;
const ownFor = (fsx, id) => ownOf(readJsonAt(fsx, "agents/config.json", {}), id);
const capOf = (fsx, id) => ownFor(fsx, id).maxCalls;

function modelFor(fsx, meta, role, agentId) {
  const cfg = readJsonAt(fsx, "agents/config.json", {});
  const dash = readJsonAt(fsx, "dashboard/config.json", null);
  const settings = readJsonAt(fsx, "settings.json", null);
  const list = [ownOf(cfg, agentId).models[role], isObj(cfg.models) ? cfg.models[role] : "", cfg.model, isObj(dash) ? dash.sensorModel : "", meta && meta.model, isObj(settings) ? settings.model : ""];
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

// `extra` is 1 before and beside a reply: the reply being made is one more than the replies there are now.
function everyNOk(trigger, msgs, extra) {
  const n = isObj(trigger) && Number.isInteger(trigger.everyN) && trigger.everyN > 1 ? trigger.everyN : 1;
  return n === 1 || (msgs.filter(isReplyMsg).length + (extra || 0)) % n === 0;
}
/** The author's trigger with the user's own cadence in place of its everyN (0 = the author's stays). */
function withOwnEvery(trigger, everyN) {
  return everyN > 0 ? { ...(isObj(trigger) ? trigger : {}), everyN } : trigger;
}
function keywordsOk(trigger, msgs) {
  const kw = isObj(trigger) && Array.isArray(trigger.keywords) ? trigger.keywords.filter((k) => typeof k === "string" && k.trim()) : [];
  if (!kw.length) return true;
  const text = msgs.slice(-2).map((m) => msgText(m, false).toLowerCase()).join("\n");
  return kw.some((k) => text.includes(k.trim().toLowerCase()));
}

/** A short stable tag of a text, so a turn that has no message id yet can still be told from another. */
function shortHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * The turn an agent run belongs to. After a reply it is that reply (`id#swipe`). Before and beside a reply the user's
 * message is not saved yet, so the turn is the last saved message plus a tag of what the user wrote: the same send
 * run again replaces its own run instead of counting twice.
 */
function turnOf(phase, last, userText) {
  if (phase === "after") return { id: String(last.id), key: msgKey(last) };
  const id = (last ? String(last.id) : "start") + ">" + shortHash(userText);
  return { id, key: id };
}

/** The chat as agents of a phase before the reply see it: the saved messages, and the user's new message at the end. */
function stagedView(chat, userText) {
  return { meta: chat.meta, msgs: [...chat.msgs, { id: "staged", role: "user", name: "", text: userText, swipe: 0 }] };
}

/**
 * Which agents of the chat run in `phase`, and why the others do not. `manual` names one agent to run whatever its
 * trigger says. `view` is what the agents will read, `turn` the turn they belong to.
 */
function pickAgents(fsx, chat, view, items, phase, manual, turn, runs, last, skipped) {
  const picks = [];
  const extra = phase === "after" ? 0 : 1;
  for (const it of items) {
    const agent = loadAgent(fsx, it.agent);
    if (!agent) { skipped.push({ agent: it.agent, why: "not installed" }); continue; }
    const set = it.phase || (isObj(agent.file.agent && agent.file.agent.trigger) ? agent.file.agent.trigger.when : "");
    // an agent set to run before the reply that the reply does not wait for runs beside it, and its hint goes into the next reply
    const when = set === "before" && it.wait === false ? "parallel" : set;
    if (manual) { /* a manual run goes ahead whatever the trigger says */ }
    else if (when !== phase) { skipped.push({ agent: it.agent, why: when === "manual" ? "manual" : "runs " + (when === "after" ? "after" : when === "before" ? "before" : "beside") + " the reply, not " + (phase === "parallel" ? "beside" : phase) + " it" }); continue; }
    else if (phase === "after" && !isReplyMsg(last)) { skipped.push({ agent: it.agent, why: "no new reply" }); continue; }
    else if (!everyNOk(withOwnEvery(agent.file.agent.trigger, ownFor(fsx, it.agent).everyN), chat.msgs, extra) || !keywordsOk(agent.file.agent.trigger, view.msgs)) { skipped.push({ agent: it.agent, why: "its trigger did not fire" }); continue; }
    const why = blocker(agent, grantedOf(fsx, it.agent), capOf(fsx, it.agent));
    if (why) { skipped.push({ agent: it.agent, why }); continue; }
    if (!manual && runs.some((r) => r.agent === it.agent && r.key === turn.key && r.status !== "failed")) { skipped.push({ agent: it.agent, why: phase === "after" ? "already ran for this reply" : "already ran for this message" }); continue; }
    picks.push({ item: it, agent });
  }
  return picks;
}

/** A model's answer as it travels from one pass to the next (the engine hands the plugin only the newest pass's answers). */
const packAnswer = (r) => (isObj(r) ? { text: typeof r.text === "string" ? r.text : "", model: typeof r.model === "string" ? r.model : "", ...(r.error ? { error: typeof r.error === "string" ? r.error : isObj(r.error) && r.error.message ? String(r.error.message) : "the model sent no answer" } : {}) } : null);

// ---------- the Dashboard as an agent sees it (read only, #132) ----------

/**
 * The Dashboard snapshot that stands for the chat's own line: the newest one among the messages the agent sees (a branch
 * never sees another branch's snapshot, the way the Dashboard itself picks it), else the state an earlier chat carried.
 * `removed` = the characters the user took off the Dashboard. null when the chat has no Dashboard state.
 */
export function dashSnapshot(fsx, view) {
  const state = readJsonAt(fsx, "dashboard/state/" + view.chatId + ".json", null);
  if (!isObj(state)) return null;
  const snaps = isObj(state.snapshots) ? state.snapshots : {};
  let snap = null;
  for (let i = view.msgs.length - 1; i >= 0 && !snap; i--) if (isObj(snaps[msgKey(view.msgs[i])])) snap = snaps[msgKey(view.msgs[i])];
  if (!snap && isObj(state.inherited) && state.inherited.off !== true && isObj(state.inherited.snap)) snap = state.inherited.snap;
  if (!snap) return null;
  const removed = new Set((Array.isArray(state.removed) ? state.removed : []).filter((n) => typeof n === "string").map((n) => n.trim().toLowerCase()));
  return { snap, removed };
}

/** The key of `chars` that matches a name (case does not matter; a character the user removed is not there). */
function dashCharKey(d, name) {
  const want = str(name).toLowerCase();
  if (!want || d.removed.has(want) || !isObj(d.snap.chars)) return "";
  return Object.keys(d.snap.chars).find((k) => k.trim().toLowerCase() === want && isObj(d.snap.chars[k])) || "";
}

/** The character a field without `of` is about: whoever wrote the last reply in this view, else the first one in the scene. */
function dashSpeaker(d, view) {
  for (let i = view.msgs.length - 1; i >= 0; i--) {
    const m = view.msgs[i];
    if (isReplyMsg(m) && dashCharKey(d, m.name)) return dashCharKey(d, m.name);
  }
  const present = Array.isArray(d.snap.present) ? d.snap.present : [];
  return present.map((n) => dashCharKey(d, n)).find((k) => k) || "";
}

/** One Dashboard value as the executor takes it (text or a finite number), undefined when the Dashboard has none. */
function dashValue(d, view, field, of) {
  const spec = DASH_FIELDS[field];
  if (!d || !spec) return undefined;
  if (!spec.char) {
    if (field === "present") {
      const names = (Array.isArray(d.snap.present) ? d.snap.present : []).filter((n) => str(n) && !d.removed.has(str(n).toLowerCase())).map(str);
      return names.length ? clip(names.join(", "), 400) : undefined;
    }
    const v = isObj(d.snap.clock) ? d.snap.clock[field] : undefined;
    return typeof v === "string" && v.trim() ? clip(v.trim(), 200) : undefined;
  }
  const who = of ? dashCharKey(d, of) : dashSpeaker(d, view);
  const c = who ? d.snap.chars[who] : null;
  if (!c) return undefined;
  if (spec.as === "number") {
    const v = isObj(c.stats) ? c.stats[field] : undefined;
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  }
  const v = Array.isArray(c[field]) ? c[field].filter((x) => typeof x === "string" && x.trim()).join(", ") : c[field];
  return typeof v === "string" && v.trim() ? clip(v.trim(), 600) : undefined;
}

/** `ctx.dash` for one agent: only the fields its Input and If cards ask for, each under its `dashKey`. */
export function dashFor(file, d, view) {
  const dash = {};
  if (!d) return dash;
  const asks = [];
  for (const n of file.nodes) {
    const p = isObj(n.params) ? n.params : {};
    if (n.type === "agent.input") for (const g of Array.isArray(p.give) ? p.give : []) { if (isObj(g) && g.source === "state") asks.push(g); }
    else if (n.type === "logic.if") for (const r of Array.isArray(p.rows) ? p.rows : []) for (const o of [r && r.left, r && r.right]) { if (isObj(o) && o.from === "state") asks.push(o); }
  }
  for (const o of asks) {
    const v = dashValue(d, view, o.field, typeof o.of === "string" ? o.of : "");
    if (v !== undefined) dash[dashKey(o)] = v;
  }
  return dash;
}

/**
 * One round of a run. Every agent is run again from the start with all the answers so far (the cards that cost
 * nothing are cheap, and a pass can lose nothing); the questions that can be asked now are asked together.
 * Returns { pending } with what the next pass needs (the answers so far), or { results } when every agent has what it needs.
 */
function stepRun(host, fsx, view, picks, last, stash) {
  const answersAll = isObj(stash && stash.answers) ? { ...stash.answers } : {};
  const fresh = host.llm && host.llm.results ? host.llm.results : {};
  for (const k of Object.keys(fresh)) { const a = packAnswer(fresh[k]); if (a) answersAll[k] = a; }
  const lastMsg = view.msgs.length ? view.msgs[view.msgs.length - 1] : null;
  // the Dashboard file is read once a pass, and only when a picked agent asks for one of its fields
  let dashSnap;
  const dashOf = (pick) => {
    if (!needsOf(pick.agent.file).some((t) => t.startsWith("read:state."))) return null;
    if (dashSnap === undefined) dashSnap = dashSnapshot(fsx, view);
    return dashSnap;
  };
  const results = picks.map((pick, ai) => {
    const schema = (pick.agent.file.agent && pick.agent.file.agent.state) || {};
    const st = loadOwn(fsx, view.chatId, pick.item.agent, schema);
    // a regenerated reply replaces the run of the same message instead of counting twice
    const before = st.raw && isObj(st.raw.before) && String(st.raw.before.id) === String(view.turnId) ? st.raw.before.own : null;
    const base = before ? { ...initialOwn(schema), ...before } : st.own;
    const inputs = {};
    for (const g of (pick.agent.file.nodes.find((n) => n.type === "agent.input") || { params: {} }).params.give || []) {
      inputs[g.id] = sourceValue(fsx, view, g, st.raw && typeof st.raw.last === "string" ? st.raw.last : "");
    }
    // dice and picks repeat within one reply (every pass of a run) and change with a new swipe: the key carries the swipe
    const ctx = { inputs, own: base, dash: dashFor(pick.agent.file, dashOf(pick), view), chat: { messageCount: view.msgs.length, lastSpeaker: str(last ? last.name : lastMsg && lastMsg.name) }, seed: view.chatId + "|" + pick.item.agent + "|" + (view.turnKey || view.turnId) };
    const answers = {};
    pick.agent.file.nodes.forEach((n, ni) => {
      const r = answersAll[`ag_${ai}_${ni}`];
      if (!r) return;
      answers[n.id] = r.error || !r.text.trim() ? { error: r.error || "the model sent no answer" } : { text: r.text, model: r.model };
    });
    return { ai, pick, schema, base, st, res: runAgent(pick.agent.file, ctx, answers), answers };
  });

  // one pass for each model call in a row: past the limit an agent fails with a reason instead of vanishing when the engine drops the pass
  const pass = Number(stash && stash.pass) || 0;
  if (pass >= AGENT_MAX_ROUNDS) {
    for (const r of results) {
      if (r.res.status === "need") r.res = { status: "failed", reason: "It needs more than " + AGENT_MAX_ROUNDS + " model calls one behind another", node: r.res.requests[0] ? r.res.requests[0].node : "", trace: r.res.trace };
    }
  }

  let asked = 0;
  for (const r of results) {
    if (r.res.status !== "need") continue;
    for (const q of r.res.requests) {
      const ni = r.pick.agent.file.nodes.findIndex((n) => n.id === q.node);
      const model = modelFor(fsx, view.meta, q.role, r.pick.item.agent);
      host.llm.request(`ag_${r.ai}_${ni}`, {
        ...(model ? { model } : {}),
        systemPrompt: AGENT_SYSTEM,
        messages: [{ role: "user", content: q.prompt }],
        presetParams: { temperature: 0.3, max_tokens: Number.isInteger(q.maxTokens) && q.maxTokens > 0 ? Math.min(q.maxTokens, 4000) : 600 },
      });
      asked++;
    }
  }
  if (asked) return { pending: { started: Number(stash && stash.started) || Date.now(), pass: pass + 1, answers: answersAll } };
  return { results };
}

/** Every agent has its answer: keep the state, the log and the hints. Returns what each agent did. */
function commitRun(fsx, chatId, results, turn, runs, started, phase) {
  const now = Date.now();
  const ranOut = [];
  const inserts = readJsonAt(fsx, insertsPath(chatId), { v: 1, items: [] });
  let items2 = Array.isArray(inserts.items) ? inserts.items : [];
  for (const r of results) {
    const id = r.pick.item.agent;
    const entry = { agent: id, key: turn.key, at: now, ms: now - started, status: "ok", ...(phase !== "after" ? { phase } : {}), trace: r.res.trace };
    if (r.res.status === "failed") {
      runs.push({ ...entry, status: "failed", reason: r.res.reason, node: r.res.node });
      ranOut.push({ agent: id, status: "failed", reason: r.res.reason });
      continue;
    }
    const applied = applyWrites(r.schema, r.base, r.res.writes);
    const outputs = r.res.outputs.map((o) => (o.show || r.pick.item.show ? { ...o, show: r.pick.item.show && (SHOW_BY_KIND[o.kind] || []).includes(r.pick.item.show) ? r.pick.item.show : o.show } : o));
    writeJsonAt(fsx, statePath(chatId, id), { v: 1, own: applied.own, last: lastTextOf(outputs), before: { id: turn.id, own: r.base } });
    items2 = items2.filter((x) => x.agent !== id).concat(outputs.filter((o) => o.kind === "prompt-insert" && o.text).map((o) => ({ agent: id, label: o.label, text: o.text, position: o.position, at: now })));
    runs.push({ ...entry, calls: r.res.calls, writes: r.res.writes, refused: applied.refused, outputs });
    ranOut.push({ agent: id, status: "ok", calls: r.res.calls, writes: r.res.writes.length, outputs: outputs.length });
  }
  writeJsonAt(fsx, runsPath(chatId), { v: 1, runs: runs.slice(-AG_RUNS_MAX) });
  writeJsonAt(fsx, insertsPath(chatId), { v: 1, items: items2 });
  return ranOut;
}

/**
 * POST /agents/run { chatId, agent?, phase?, userText? }. `phase` is "after" (default: the agents set to run after a
 * reply), or "parallel" (the agents set to run beside the reply: the app calls it when a send starts and passes what the
 * user wrote, which is not saved yet). `agent` runs that one agent by hand.
 */
function runRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const chatId = str(b.chatId);
  if (!AG_CHAT.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChatFiles(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const manual = str(b.agent);
  const phase = b.phase === "parallel" ? "parallel" : "after";
  const userText = phase === "parallel" ? clip(str(b.userText).trim(), 8000) : "";
  if (phase === "parallel" && !userText) return ok({ error: "userText required" }, 400);
  const last = chat.msgs.length ? chat.msgs[chat.msgs.length - 1] : null;
  if (!last && phase === "after") return ok({ ok: true, skipped: "empty chat" });
  const turn = turnOf(phase, last, userText);
  const view = phase === "after" ? { meta: chat.meta, msgs: chat.msgs } : stagedView(chat, userText);
  view.chatId = chatId;
  view.turnId = turn.id;
  view.turnKey = turn.key;
  const items = chatAgents(fsx, chat.meta).filter((it) => it.on && (manual ? it.agent === manual : (it.phase || "") !== "manual"));
  const runsFile = readJsonAt(fsx, runsPath(chatId), { v: 1, runs: [] });
  const runs = Array.isArray(runsFile.runs) ? runsFile.runs : [];
  const skipped = [];
  const picks = pickAgents(fsx, chat, view, items, phase, manual, turn, runs, last, skipped);
  if (!picks.length) return ok({ ok: true, ran: [], skipped });

  const step = stepRun(host, fsx, view, picks, last, req.stash);
  if (step.pending) return { __llmPending: true, stash: step.pending };
  const started = Number(req.stash && req.stash.started) || Date.now();
  return ok({ ok: true, ran: commitRun(fsx, chatId, step.results, turn, runs, started, phase), skipped });
}

/** The text of the last user message of a model request, as the model gets it. */
function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!isObj(m) || m.role !== "user") continue;
    const c = m.content;
    const t = typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => (isObj(p) && typeof p.text === "string" ? p.text : "")).join("\n") : "";
    return t.trim();
  }
  return "";
}

/**
 * The agents set to run before a reply, run inside the reply's request hook, so their hint reaches this very reply.
 * Returns { pending } while they still wait for the model (the hook hands it back as its next ctx), or null once they
 * are done, or when there is nothing to run. A failure never stops the reply: it goes without the hint.
 */
function runBefore(ctx, host, fsx, chatId, req) {
  const chat = readChatFiles(fsx, chatId);
  if (!chat) return null;
  const userText = clip(lastUserText(req.messages), 8000);
  if (!userText) return null;
  const items = chatAgents(fsx, chat.meta).filter((it) => it.on && (it.phase || "") !== "manual");
  if (!items.length) return null;
  const last = chat.msgs.length ? chat.msgs[chat.msgs.length - 1] : null;
  const turn = turnOf("before", last, userText);
  const view = stagedView(chat, userText);
  view.chatId = chatId;
  view.turnId = turn.id;
  view.turnKey = turn.key;
  const runsFile = readJsonAt(fsx, runsPath(chatId), { v: 1, runs: [] });
  const runs = Array.isArray(runsFile.runs) ? runsFile.runs : [];
  const picks = pickAgents(fsx, chat, view, items, "before", "", turn, runs, last, []);
  if (!picks.length) return null;
  const stash = isObj(ctx.stash) ? ctx.stash : null;
  const step = stepRun(host, fsx, view, picks, last, stash);
  if (step.pending) return { pending: step.pending };
  commitRun(fsx, chatId, step.results, turn, runs, Number(stash && stash.started) || Date.now(), "before");
  return null;
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
  const asked = [...new Set([...askedOf(fsx, id), ...(ask || [])])];
  writeJsonAt(fsx, "agents/grants/" + id + ".json", { v: 1, needs: granted, ...(asked.length ? { asked } : {}) });
  return ok({ ok: true, id, updated: !!had, needs, granted, missing: needs.filter((t) => !granted.includes(t)), unsupported: unsupportedNeeds(needs), warnings: report.warnings });
}

// ---------- drafts: agent files that Molfar wrote into the workspace, waiting for the user to look and install ----------

const DRAFT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const DRAFT_SUFFIX = ".vertep-agent.json";
const draftPath = (name) => "agents/drafts/" + name + DRAFT_SUFFIX;

/** One draft read and checked as an install would check it. `file` is the parsed file when it parsed. */
function readDraft(fsx, name) {
  let text;
  try { text = fsx.read(draftPath(name)); } catch { return null; }
  if (text.length > AG_FILE_MAX) return { name, errors: [{ code: "E_SIZE", message: "the file is over 256 KB" }], warnings: [] };
  let file;
  try { file = JSON.parse(text); } catch (e) { return { name, errors: [{ code: "E_JSON", message: "not valid JSON: " + String((e && e.message) || e) }], warnings: [] }; }
  const compiled = compileAgent(file);
  if ("error" in compiled) return { name, file, errors: [{ code: "E_ENVELOPE", message: compiled.error }], warnings: [] };
  return { name, file, errors: compiled.report.errors, warnings: compiled.report.warnings, derived: compiled.report.derived };
}

/** The checker's errors or warnings with `nodeTitle` (the card's title) next to `node`, so a list can name the card. */
function withNodeTitles(file, list) {
  const nodes = isObj(file) && Array.isArray(file.nodes) ? file.nodes : [];
  const titles = new Map();
  for (const n of nodes) if (isObj(n) && typeof n.id === "string" && typeof n.title === "string" && n.title) titles.set(n.id, n.title.slice(0, 80));
  return (Array.isArray(list) ? list : []).map((x) => (x && x.node && titles.has(x.node) ? { ...x, nodeTitle: titles.get(x.node) } : x));
}

function draftsRoute(req, host) {
  const fsx = host.fs;
  let files = [];
  try { files = fsx.list("agents/drafts").filter((f) => f.endsWith(DRAFT_SUFFIX)); } catch {}
  const drafts = [];
  for (const f of files.slice(0, 50)) {
    const name = f.slice(0, -DRAFT_SUFFIX.length);
    if (!DRAFT_NAME_RE.test(name)) continue;
    const d = readDraft(fsx, name);
    if (!d) continue;
    const a = isObj(d.file) && isObj(d.file.agent) ? d.file.agent : {};
    drafts.push({
      name, id: str(a.id), title: str(a.name) || str(d.file && d.file.title) || name, description: str(a.description),
      needs: d.derived ? d.derived.needs : [], maxCalls: d.derived ? d.derived.maxCalls : 0,
      installed: !!str(a.id) && !!readJsonAt(fsx, agentPath(str(a.id)), null),
      errors: withNodeTitles(d.file, d.errors), warnings: withNodeTitles(d.file, d.warnings),
    });
  }
  return ok({ drafts });
}

function draftInstallRoute(req, host) {
  const b = isObj(req.body) ? req.body : {};
  const name = str(b.name);
  if (!DRAFT_NAME_RE.test(name)) return ok({ error: "name required" }, 400);
  const d = readDraft(host.fs, name);
  if (!d) return ok({ error: "no such draft" }, 404);
  if (!isObj(d.file)) return ok({ error: d.errors[0].message, errors: d.errors, warnings: d.warnings }, 400);
  return installRoute({ ...req, body: { file: d.file } }, host);
}

/** One draft as the file it holds, for the editor. A file that is not valid JSON comes back as `text`, so it can be shown and fixed. */
function draftReadRoute(req, host, name) {
  if (!DRAFT_NAME_RE.test(name)) return ok({ error: "bad name" }, 400);
  let text;
  try { text = host.fs.read(draftPath(name)); } catch { return ok({ error: "no such draft" }, 404); }
  try { return ok({ name, file: JSON.parse(text) }); } catch { return ok({ name, text: text.slice(0, AG_FILE_MAX) }); }
}

/** Saves a draft as the editor left it. It is not checked here: work in progress may have errors, and the sheet shows them. */
function draftWriteRoute(req, host, name) {
  if (!DRAFT_NAME_RE.test(name)) return ok({ error: "bad name" }, 400);
  const b = isObj(req.body) ? req.body : {};
  if (!isObj(b.file)) return ok({ error: "file required" }, 400);
  const text = JSON.stringify(b.file, null, 2) + "\n";
  if (text.length > AG_FILE_MAX) return ok({ error: "the file is over 256 KB" }, 400);
  host.fs.write(draftPath(name), text);
  return ok({ ok: true, name });
}

/** A copy of an installed agent in the drafts, to open in the editor. Without `derived`: the check fills it again. */
function draftCopyRoute(req, host) {
  const b = isObj(req.body) ? req.body : {};
  const id = str(b.id);
  const file = DRAFT_NAME_RE.test(id) ? readJsonAt(host.fs, agentPath(id), null) : null;
  if (!isObj(file)) return ok({ error: "not installed" }, 404);
  // a draft of this name may hold edits that are not installed yet: open that one, never overwrite it
  let there = false;
  try { host.fs.read(draftPath(id)); there = true; } catch {}
  if (there) return ok({ ok: true, name: id, existing: true });
  const copy = JSON.parse(JSON.stringify(file));
  if (isObj(copy.agent)) delete copy.agent.derived;
  host.fs.write(draftPath(id), JSON.stringify(copy, null, 2) + "\n");
  return ok({ ok: true, name: id });
}

function draftRemoveRoute(req, host, name) {
  if (!DRAFT_NAME_RE.test(name)) return ok({ error: "bad name" }, 400);
  try { host.fs.remove(draftPath(name)); } catch {}
  return ok({ ok: true });
}

/** The places the chat may move this agent's results to, from its Outputs and its panels; the first is where the author put them. */
function placesOf(file) {
  const kinds = (Array.isArray(file.nodes) ? file.nodes : []).filter((n) => n && n.type === 'agent.output' && isObj(n.params)).map((n) => n.params);
  const out = [];
  for (const p of kinds) for (const pl of SHOW_BY_KIND[p.kind] ?? []) if (!out.includes(pl)) out.push(pl);
  if (Array.isArray(file.agent?.panels) && file.agent.panels.length) for (const pl of ['top1', 'top2', 'float']) if (!out.includes(pl)) out.push(pl);
  return out;
}

function listRoute(req, host) {
  const fsx = host.fs;
  let files = [];
  try {
    files = fsx.list("agents").filter((f) => f.endsWith(".vertep-agent.json"));
  } catch {}
  const agents = [];
  const cfg = readJsonAt(fsx, "agents/config.json", {});
  for (const f of files) {
    const id = f.slice(0, -".vertep-agent.json".length);
    const agent = loadAgent(fsx, id);
    if (!agent) continue;
    const a = agent.file.agent || {};
    const granted = grantedOf(fsx, id);
    const needs = agent.report.derived ? agent.report.derived.needs : [];
    const own = ownOf(cfg, id);
    agents.push({
      id, name: str(a.name) || id, description: str(a.description), author: str(a.author), version: str(a.version),
      trigger: isObj(a.trigger) ? a.trigger : {}, models: isObj(a.models) ? a.models : {},
      needs, granted, missing: needs.filter((t) => !granted.includes(t)), unsupported: unsupportedNeeds(needs),
      added: (() => { const asked = askedOf(fsx, id); return asked.length ? needs.filter((t) => !asked.includes(t) && !UNSUPPORTED_NEEDS(t)) : []; })(),
      maxCalls: agent.report.derived ? agent.report.derived.maxCalls : 0, errors: withNodeTitles(agent.file, agent.report.errors), warnings: withNodeTitles(agent.file, agent.report.warnings),
      runnable: !blocker(agent, granted, own.maxCalls), blocker: blocker(agent, granted, own.maxCalls), places: placesOf(agent.file),
      own: { models: own.models, maxCalls: own.maxCalls, everyN: own.everyN },
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
  // the person has now seen every need of this version, so only a later version's extra needs count as new
  writeJsonAt(fsx, "agents/grants/" + id + ".json", { v: 1, needs: granted, asked: needs });
  return ok({ ok: true, id, granted, missing: needs.filter((t) => !granted.includes(t)) });
}

function removeRoute(req, host, id) {
  const fsx = host.fs;
  if (!AG_ID.test(id)) return ok({ error: "invalid id" }, 400);
  try { fsx.remove(agentPath(id)); } catch {}
  try { fsx.remove("agents/grants/" + id + ".json"); } catch {}
  const cfg = readJsonAt(fsx, "agents/config.json", {});
  if (isObj(cfg) && isObj(cfg.byAgent) && id in cfg.byAgent) { const by = { ...cfg.byAgent }; delete by[id]; const next = { ...cfg, byAgent: by }; if (!Object.keys(by).length) delete next.byAgent; writeJsonAt(fsx, "agents/config.json", next); }
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

/** What the chat's panels need in one call: for each agent that is on, allowed to run and has panels, the panels, the schema and its state (and the state before the last run, for a change marker). */
function panelsRoute(req, host) {
  const fsx = host.fs;
  const chatId = str(req.query && req.query.chatId);
  if (!AG_CHAT.test(chatId)) return ok({ error: "chatId required" }, 400);
  const meta = readJsonAt(fsx, "chats/" + chatId + ".meta.json", null);
  if (!isObj(meta)) return ok({ error: "no such chat" }, 404);
  const out = [];
  for (const it of chatAgents(fsx, meta)) {
    if (!it.on) continue;
    const agent = loadAgent(fsx, it.agent);
    if (!agent || blocker(agent, grantedOf(fsx, it.agent), capOf(fsx, it.agent))) continue;
    const a = agent.file.agent || {};
    if (!Array.isArray(a.panels) || !a.panels.length) continue;
    const schema = isObj(a.state) ? a.state : {};
    const st = loadOwn(fsx, chatId, it.agent, schema);
    const prev = st.raw && isObj(st.raw.before) && isObj(st.raw.before.own) ? st.raw.before.own : null;
    out.push({ agent: it.agent, name: str(a.name) || it.agent, show: it.show || null, panels: a.panels, schema, own: st.own, prev });
  }
  return ok({ panels: out });
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
  // the user's limits for one agent: the whole map is replaced, like `models`; an agent with nothing set has no entry
  if ("byAgent" in b && isObj(b.byAgent)) {
    const by = {};
    for (const [id, v] of Object.entries(b.byAgent)) {
      if (!AG_ID.test(id) || !isObj(v)) continue;
      const entry = {};
      const m = {};
      if (isObj(v.models)) for (const [role, x] of Object.entries(v.models)) if (/^[A-Za-z0-9_-]{1,40}$/.test(role) && AG_MODEL.test(str(x))) m[role] = str(x);
      if (Object.keys(m).length) entry.models = m;
      if (Number.isInteger(v.maxCalls) && v.maxCalls >= 1 && v.maxCalls <= 50) entry.maxCalls = v.maxCalls;
      if (Number.isInteger(v.everyN) && v.everyN >= 1 && v.everyN <= EVERY_N_MAX) entry.everyN = v.everyN;
      if (Object.keys(entry).length) by[id] = entry;
    }
    if (Object.keys(by).length) next.byAgent = by; else delete next.byAgent;
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
  if (path === "/agents/drafts" && req.method === "GET") return draftsRoute(req, host);
  if (path === "/agents/drafts/install" && req.method === "POST") return draftInstallRoute(req, host);
  if (path === "/agents/drafts/copy" && req.method === "POST") return draftCopyRoute(req, host);
  if (seg.length === 3 && seg[1] === "drafts" && req.method === "GET") return draftReadRoute(req, host, seg[2]);
  if (seg.length === 3 && seg[1] === "drafts" && req.method === "PUT") return draftWriteRoute(req, host, seg[2]);
  if (seg.length === 3 && seg[1] === "drafts" && req.method === "DELETE") return draftRemoveRoute(req, host, seg[2]);
  if (path === "/agents/grant" && req.method === "POST") return grantRoute(req, host);
  if (path === "/agents/run" && req.method === "POST") return runRoute(req, host);
  if (path === "/agents/state" && (req.method === "GET" || req.method === "DELETE")) return stateRoute(req, host);
  if (path === "/agents/runs" && req.method === "GET") return runsRoute(req, host);
  if (path === "/agents/panels" && req.method === "GET") return panelsRoute(req, host);
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
    // the agents set to run before the reply ask the model first; their hint then goes into this very reply
    if (ctx.turn && ctx.turn.op === "send") {
      let before = null;
      try { before = runBefore(ctx, host, fsx, chatId, req); } catch (e) { try { host.log("agents before: " + (e && e.message ? e.message : String(e))); } catch {} }
      if (before && before.pending) return { ...ctx, stash: before.pending };
    }
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
