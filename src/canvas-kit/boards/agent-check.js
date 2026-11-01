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
export const splitEnd = (end) => {
  const i = end.lastIndexOf(':');
  return i < 0 ? [end, ''] : [end.slice(0, i), end.slice(i + 1)];
};
/** The Canvas envelope, read the way src/canvas-kit/graph.ts `fromFile` reads it (a test keeps the two equal). */
export const readCanvasFile = (raw) => {
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
export const DASH_FIELDS = {
  present: { as: 'text' }, place: { as: 'text' }, weather: { as: 'text' },
  mood: { as: 'text', char: true }, condition: { as: 'text', char: true }, outfit: { as: 'text', char: true },
  holding: { as: 'text', char: true }, goal: { as: 'text', char: true },
  trust: { as: 'number', char: true }, comfort: { as: 'number', char: true }, attraction: { as: 'number', char: true },
  respect: { as: 'number', char: true }, affection: { as: 'number', char: true },
};
/** Where the host puts a Dashboard value for the executor: the field, and `field@name` when the entry names a character. */
export const dashKey = (x) => (x?.of ? `${x.field}@${x.of}` : x?.field);
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
const scriptList = (v) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'object' && x !== null && typeof x.id === 'string');
const whenIn = [{ id: 'when', side: 'in', type: 'signal', optional: true }];
const whenDone = [{ id: 'when', side: 'in', type: 'signal', optional: true }, { id: 'done', side: 'out', type: 'signal' }];
const OUTPUT_TEXT_KINDS = ['prompt-insert', 'note', 'choices'];
const NEEDS_BY_OUTPUT = { 'prompt-insert': ['write:prompt'], note: ['show:note'], choices: ['show:choices'] };
export const AGENT_CARDS = {
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
  'code.script': {
    label: 'Script', colorVar: '--k-logic', hint: 'Your own small program: values in, values out. It sees only what you wire in. No files, no internet, no clock.',
    ports: (p) => [
      ...scriptList(p.inputs).map((i) => ({ id: String(i.id), side: 'in', type: ownType(i.type) })),
      { id: 'when', side: 'in', type: 'signal', optional: true },
      ...scriptList(p.outputs).map((o) => ({ id: String(o.id), side: 'out', type: ownType(o.type) })),
      { id: 'failed', side: 'out', type: 'signal' },
    ],
    needs: () => ['run:code'],
  },
  note: { label: 'Note', colorVar: '--k-data', hint: 'A note for people; never sent to a model.', ports: () => [], needs: () => [] },
};
const OPS = {
  text: ['eq', 'neq', 'contains', 'notContains', 'in', 'isSet', 'isMissing'],
  number: ['lt', 'lte', 'eq', 'gte', 'gt', 'between', 'isSet', 'isMissing'],
  flag: ['isYes', 'isNo', 'isUnknown'],
};
/** Where an Output of each kind may show its result. The first entry is the default place. */
export const SHOW_BY_KIND = {
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
export const agentHash = (f) => {
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
export const PATTERN_MAX = 200;
export const PICK_MAX = 40;
/** A pattern that can run for a very long time on a short text: a quantified group that holds a quantifier or an alternation, or a back reference. The run is stopped by the sandbox after seconds, so refuse these up front. */
export const riskyPattern = (src) => /\\[1-9]/.test(src) || /\((?:[^()\\]|\\.)*(?:[*+]|\{\d|\|)(?:[^()\\]|\\.)*\)[*+{]/.test(src);
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
/** Limits of the Script card (the engine enforces its own on the sandbox: .fork/handoff/script-card/DESIGN.md in the engine repo). */
export const SCRIPT_LIMITS = { code: 8000, ports: 8, perAgent: 6 };
/** The parameters of a Script card. */
function checkScript(n, err) {
  const p = n.params ?? {};
  const bad = (code, msg) => err(code, `"${n.title}": ${msg}`, n.id);
  if (typeof p.code !== 'string' || !p.code.trim()) { bad('E_PARAM', 'the script has no code'); return; }
  if (p.code.length > SCRIPT_LIMITS.code) bad('E_PARAM', `the code is longer than ${SCRIPT_LIMITS.code} characters`);
  for (const key of ['inputs', 'outputs']) {
    const list = p[key];
    if (!Array.isArray(list) || list.length > SCRIPT_LIMITS.ports || (key === 'outputs' && !list.length)) {
      bad('E_PARAM', key === 'outputs' ? `outputs is a list of 1 to ${SCRIPT_LIMITS.ports} values the script gives back` : `inputs is a list of up to ${SCRIPT_LIMITS.ports} values the script receives`);
      continue;
    }
    const seen = new Set();
    for (const x of list) {
      if (!isObj(x) || typeof x.id !== 'string' || !FIELD_ID.test(x.id) || !SCALARS.includes(x.type)) { bad('E_PARAM', `every ${key === 'inputs' ? 'input' : 'output'} needs an id (letters, digits, _ and -, starting with a letter) and a type: number, text or flag`); continue; }
      if (x.id === 'when' || x.id === 'failed') bad('E_PARAM', `"${x.id}" is taken by the card itself; pick another name`);
      if (seen.has(x.id)) bad('E_PARAM', `${key} lists "${x.id}" twice`);
      seen.add(x.id);
    }
  }
  if (p.code.length <= SCRIPT_LIMITS.code && typeof Function === 'function') {
    try { new Function('input', 'seed', '"use strict";\n' + p.code); }
    catch (e) { if (e && e.name === 'SyntaxError') bad('E_SCRIPT_SYNTAX', `the code does not parse: ${String(e.message).slice(0, 120)}`); }
  }
}
const WIDGET_BIND = { meter: 'number', number: 'number', counter: 'number', table: 'list', list: 'list', log: 'list', text: 'text', grid: 'list' };
/** The `grid` widget: a board of cols x rows tiles, each tile coloured by a state kept in a list (docs/DATA-FORMATS.md, "Agents"). */
export const GRID_TONES = ['ok', 'info', 'warn', 'bad', 'accent', 'muted'];
export const GRID_LIMITS = { size: 16, legend: 8 };
export const PANEL_PLACES = ['top1', 'top2', 'float'];
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
export function templateProblems(tpl, state) {
  const out = [];
  if (typeof tpl !== 'string' || !tpl.trim())
    return [{ code: 'E_WIDGET', message: 'The template is empty' }];
  if (tpl.length > 8192)
    return [{ code: 'E_WIDGET', message: 'The template is longer than 8192 characters' }];
  checkTemplate(tpl, state ?? {}, 'Template', (code, message) => out.push({ code, message: message.replace(/^Template: /, '') }));
  return out;
}
/** The `grid` widget's own params: the size, which entry fields give the column, the row and the tile's state, and the legend. */
function checkGrid(w, field, where, err) {
  const max = GRID_LIMITS.size;
  for (const k of ['cols', 'rows'])
    if (!isInt(w[k], 1, max)) err('E_WIDGET', `${where}: grid needs ${k}, a whole number from 1 to ${max}`);
  const item = field.item ?? {};
  const named = (k, type) => typeof w[k] === 'string' && item[w[k]] === type;
  if (!named('x', 'number') || !named('y', 'number') || w.x === w.y)
    err('E_BIND', `${where}: grid needs x and y, two different number fields of the entries of "${w.bind}"`);
  if (!named('cell', 'text'))
    err('E_BIND', `${where}: grid needs cell, a text field of the entries of "${w.bind}" that holds the tile's state`);
  const legend = w.legend;
  if (!Array.isArray(legend) || !legend.length || legend.length > GRID_LIMITS.legend) {
    err('E_WIDGET', `${where}: grid needs a legend of 1-${GRID_LIMITS.legend} states`);
    return;
  }
  const seen = new Set();
  for (const [i, l] of legend.entries()) {
    const at = `${where}, legend ${i + 1}`;
    if (!isObj(l) || typeof l.value !== 'string' || !l.value || l.value.length > 40 || seen.has(l.value))
      err('E_WIDGET', `${at}: value is text of 1-40 characters, different from the others`);
    else
      seen.add(l.value);
    if (!isObj(l)) continue;
    if (typeof l.label !== 'string' || !l.label.trim() || l.label.length > 30)
      err('E_WIDGET', `${at}: label is text of 1-30 characters`);
    if (!GRID_TONES.includes(l.tone))
      err('E_WIDGET', `${at}: tone must be one of ${GRID_TONES.join(', ')}`);
    if (l.mark !== undefined && (typeof l.mark !== 'string' || !l.mark || [...l.mark].length > 2))
      err('E_WIDGET', `${at}: mark is 1 or 2 characters`);
  }
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
      if (w.w === 'grid') {
        checkGrid(w, field, where, err);
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
export const AGENT_MAX_ROUNDS = 7;
/** Checks an agent file. `derived` is what the file ought to declare (needs, calls, hash); a file that declares something else is refused. */
export function validateAgent(raw) {
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
    if (n.type === 'code.script')
      checkScript(n, err);
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
  const scripts = f.nodes.filter((n) => n.type === 'code.script').length;
  if (scripts > SCRIPT_LIMITS.perAgent)
    err('E_SCRIPT_LIMIT', `An agent may have at most ${SCRIPT_LIMITS.perAgent} Script cards, found ${scripts}`);
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
      const own = byId.get(id)?.type === 'model.ask' || byId.get(id)?.type === 'code.script' ? 1 : 0;
      const d = own + Math.max(0, ...(adj.get(id) ?? []).map(depth));
      memo.set(id, d);
      return d;
    };
    const rounds = Math.max(0, ...f.nodes.map((n) => depth(n.id)));
    if (rounds > AGENT_MAX_ROUNDS)
      err('E_ROUNDS', `A path of the graph waits for the model or a script ${rounds} times one after another, and an agent may wait at most ${AGENT_MAX_ROUNDS} times in a row. Run them in parallel, or put two questions into one`);
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
export function compileAgent(raw) {
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
