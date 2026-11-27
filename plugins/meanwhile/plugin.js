/**
 * Meanwhile (#449, M1a): people who are not in the scene act, and what they did becomes knowledge.
 *
 * This file is the PURE part, written first so the rules are tested before any model is called: what an event may be
 * (`cleanEvent`, `buildEvents`), when a pass is due (`dueReason`), how a swipe or a delete takes events back (`reconcile`),
 * what the model is asked (`buildPrompt`), how its answer is read (`parseEvents`), what Litopys is told (`factDraft`) and what
 * the panel may show (`spoilerView`). M1b adds the routes at the end of the file: a pass reads the chat, asks the model once (a
 * retry for an empty or rate-limited answer), keeps what passes the rules and writes a log; nothing reaches Litopys yet (M2a).
 *
 * The rules (owner, 2026-11-11 and 2026-11-18; decisions in .fork/handoff/meanwhile-449/DESIGN.md of the engine repo):
 *  - an event is `{ id, who[], what, where, when, witnesses[], visibility, effects[] }`; who and witnesses are registry ids of
 *    people, never the player's character ("user"), never anyone in the scene; effects come from a closed list;
 *  - a failed event is dropped whole, never repaired;
 *  - an event is tied to the message key (`id#swipe`) of the reply after which it happened; a swipe or delete takes it back;
 *  - the player's character never knows an event: `factDraft` names only the people it happened to or who saw it.
 *
 * Routes (under /v1/apps/roleplay/):
 *  GET  /meanwhile/state?chatId=      {config, model, due, events (as the spoiler setting allows), log, usage}
 *  PUT  /meanwhile/config {enabled?, model?, k?, clockHours?, minReplies?, spoilers?, offCards?}
 *  POST /meanwhile/run {chatId, force?}   one pass if due (force: now). {ok, kept, dropped, events} | {ok:false, reason}
 *       reason: off | combat | no-dashboard | few | quiet | cooldown | nobody | no-model | no-chat | busy | empty | bad-reply | error
 *
 * Files (fs root = the app's data/):
 *  meanwhile/config.json              what differs from DEFAULT_CONFIG
 *  meanwhile/state/<chatId>.json      { v: 1, chatId, cursor: "<message key of the last pass>", next: <number of the next event id>,
 *    passes: [{ key, at, reason, ids }], events: [{ id, who, what, where, whereName, when, witnesses, visibility, effects, afterKey, at,
 *    status: "active" | "undone" }], log: [{ at, reason, from, to, model, ms, offered, kept, dropped: [text], events: [{ id, who, visibility }], usage?, retried?, error? }],
 *    usage: { input, output, cost, runs }, lastFailAt }
 */

// ==== BEGIN GENERATED: src/lib/chat-store.js (bun scripts/sync-chat-store.ts) ====
/**
 * A chat's transcript on disk (Molfar.Vertep#537). Pasted into every plugin that reads or writes transcripts by
 * `bun scripts/sync-chat-store.ts`: edit this file, run the script, commit all. No imports, no host calls but `fsx`.
 *
 * - One copy of the chosen text. A line keeps `text`; `swipes[swipe]` is stored as null when it is the same text, and a
 *   message with one version stores no `swipes` at all. A greeting keeps both, since its swipes are raw (`{{user}}`) and
 *   `text` is expanded. Reading puts the full shape back, so every reader sees what it always saw.
 * - Pieces. A chat of more than CHAT_TAIL_MAX messages (or CHAT_TAIL_CHARS of lines) keeps its older messages in closed
 *   parts, `chats/<id>.parts/<n>.jsonl`, and only the live tail `chats/<id>.jsonl` is rewritten on a send. A part is
 *   rewritten only when a message in it changed. The meta lists the parts (`transcript.parts`) and carries what the
 *   chat list shows (`count`, `preview`, `hasUser`), so the list reads no transcript.
 * - Order. A save that changes the set of parts writes the new parts, then the meta, then the tail, then the meta again,
 *   and removes the parts no longer listed last. A reader that comes in between sees a message twice (once in a part,
 *   once in the old tail), never a hole; the reader keeps one copy of each id, the newer file's.
 */

const CHAT_TAIL_MAX = 200;
const CHAT_PART_MSGS = 100;
// JS characters of lines: at most about three bytes each, so a part stays well under the engine's 4 MB write cap
const CHAT_PART_CHARS = 600000;
const CHAT_TAIL_CHARS = 900000;

const chatTailPath = (id) => "chats/" + id + ".jsonl";
const chatMetaPath = (id) => "chats/" + id + ".meta.json";
const chatPartsDir = (id) => "chats/" + id + ".parts";
const chatPartPath = (id, n) => chatPartsDir(id) + "/" + n + ".jsonl";

const chatIsObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const chatHasId = (m) => m.id !== undefined && m.id !== null && m.id !== "";
// what a read leaves on its array (not enumerable, so it never reaches JSON): the file texts it read, so a save of the
// same array rewrites only the files whose text changed without reading them again
const CHAT_READ = "__chatRead";

/** A message as it is kept on disk: the chosen text once. `m` is not changed. */
function chatPack(m) {
  if (!chatIsObj(m) || typeof m.text !== "string" || !Array.isArray(m.swipes) || !Number.isInteger(m.swipe)) return m;
  if (m.swipes[m.swipe] !== m.text) return m;
  const o = Object.assign({}, m);
  if (m.swipes.length === 1 && m.swipe === 0) delete o.swipes;
  else {
    o.swipes = m.swipes.slice();
    o.swipes[m.swipe] = null;
  }
  return o;
}

/** A line as read back, in its full shape (changed in place and returned). */
function chatUnpack(m) {
  if (!chatIsObj(m) || typeof m.text !== "string" || !Number.isInteger(m.swipe)) return m;
  if (!Array.isArray(m.swipes)) {
    if (m.swipe === 0) m.swipes = [m.text];
  } else if (m.swipes[m.swipe] === null) m.swipes[m.swipe] = m.text;
  return m;
}

/** The parts the meta lists: [{n, count, last, user}]. */
function chatPartsOf(meta) {
  const t = chatIsObj(meta) && chatIsObj(meta.transcript) ? meta.transcript : null;
  if (!t || !Array.isArray(t.parts)) return [];
  return t.parts.filter((p) => chatIsObj(p) && Number.isInteger(p.n) && p.n > 0);
}

function chatReadMeta(fsx, id) {
  try {
    const m = JSON.parse(fsx.read(chatMetaPath(id)));
    return chatIsObj(m) ? m : null;
  } catch {
    return null;
  }
}

/** Part numbers on disk, for a meta that does not say (one written before parts, or rebuilt by hand). */
function chatPartsOnDisk(fsx, id) {
  let names = [];
  try {
    names = fsx.list(chatPartsDir(id)) || [];
  } catch {
    return [];
  }
  return names
    .map((f) => /^([1-9][0-9]*)\.jsonl$/.exec(f))
    .filter(Boolean)
    .map((x) => Number(x[1]))
    .sort((a, b) => a - b);
}

function chatCollect(fsx, id, nums) {
  const out = [];
  const at = new Map();
  const raw = {};
  let missing = false;
  const take = (path, needed) => {
    let s;
    try {
      s = String(fsx.read(path));
    } catch {
      if (needed) missing = true;
      return;
    }
    raw[path] = s;
    for (const line of s.split("\n")) {
      if (!line.trim()) continue;
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (!chatIsObj(m)) continue;
      chatUnpack(m);
      if (chatHasId(m)) {
        const k = String(m.id);
        // the same message in two files (a save in progress): the later file's copy, at the earlier place
        if (at.has(k)) {
          out[at.get(k)] = m;
          continue;
        }
        at.set(k, out.length);
      }
      out.push(m);
    }
  };
  for (const n of nums) take(chatPartPath(id, n), true);
  take(chatTailPath(id), false);
  return { out, raw, missing };
}

/**
 * The chat's messages in order (the closed parts, then the tail), each in its full shape. Lines that do not parse are
 * left out. `meta` is the chat's meta when the caller has it (undefined: read it here).
 */
function chatMessages(fsx, id, meta) {
  let m = meta === undefined ? chatReadMeta(fsx, id) : meta;
  const listed = (x) => (chatIsObj(x) && chatIsObj(x.transcript) ? chatPartsOf(x).map((p) => p.n) : chatPartsOnDisk(fsx, id));
  let got = chatCollect(fsx, id, listed(m));
  // a listed part went away: a save finished between our two reads; read again by its meta
  if (got.missing) {
    m = chatReadMeta(fsx, id);
    got = chatCollect(fsx, id, listed(m));
  }
  Object.defineProperty(got.out, CHAT_READ, { value: { id, raw: got.raw }, enumerable: false });
  return got.out;
}

/** { meta, msgs } of a chat, or null when it has no meta. */
function chatRead(fsx, id) {
  const meta = chatReadMeta(fsx, id);
  if (!meta) return null;
  return { meta, msgs: chatMessages(fsx, id, meta) };
}

/** What the chat list shows, from the messages. */
function chatSummaryOf(msgs, lines) {
  const last = msgs.length ? msgs[msgs.length - 1] : null;
  return {
    count: lines.length,
    preview: last && chatIsObj(last) ? String(last.text || "").slice(0, 160) : "",
    hasUser: msgs.some((m) => chatIsObj(m) && m.role === "user"),
  };
}

/**
 * The chat list's numbers for one chat: the meta's own when the tail on disk is the one the meta was written with
 * (`tailSize` is that file's size from fs.stat; null when unknown), else read from the files.
 */
function chatSummary(fsx, id, meta, tailSize) {
  const t = chatIsObj(meta) && chatIsObj(meta.transcript) ? meta.transcript : null;
  if (t && Number.isInteger(t.count) && Number.isInteger(t.tailSize) && t.tailSize === tailSize) {
    return { count: t.count, preview: String(t.preview || ""), hasUser: t.hasUser === true };
  }
  const parts = chatPartsOf(meta);
  if (t && parts.length && parts.every((p) => Number.isInteger(p.count))) {
    // the tail changed behind the meta's back (an older app, a hand edit): the parts' own numbers and the tail
    let lines = [];
    try {
      lines = String(fsx.read(chatTailPath(id))).split("\n").filter((l) => l.trim());
    } catch {}
    let last = null;
    for (let i = lines.length - 1; i >= 0 && !last; i--) {
      try {
        last = JSON.parse(lines[i]);
      } catch {}
    }
    return {
      count: parts.reduce((a, p) => a + p.count, 0) + lines.length,
      preview: last && chatIsObj(last) ? String(last.text || "").slice(0, 160) : "",
      hasUser: parts.some((p) => p.user === true) || lines.some((l) => l.includes('"role":"user"')),
    };
  }
  const msgs = chatMessages(fsx, id, meta);
  return chatSummaryOf(msgs, msgs);
}

/** Write `text` to `rel` unless the file already holds it (`raw` = what a read of the same array saw). */
function chatWriteIfChanged(fsx, rel, text, raw) {
  if (raw && Object.prototype.hasOwnProperty.call(raw, rel)) {
    if (raw[rel] === text) return false;
  } else {
    try {
      if (String(fsx.read(rel)) === text) return false;
    } catch {}
  }
  fsx.write(rel, text);
  return true;
}

/**
 * Where the parts of `msgs` fall: [{n, from, to, kept}] (`to` exclusive); the rest is the tail. An old part keeps its
 * number and its place: it ends after its last message, or, when that one is gone, before the first message of what
 * came after it. A part whose end cannot be found runs on into the next one (the next number goes), and an emptied part
 * goes. Messages past the old parts close into new parts, numbered above `top`, while the tail is too long.
 */
function chatPlan(prev, tailFirst, top, msgs, lines) {
  const total = lines.reduce((a, l) => a + l.length, 0);
  if (msgs.length <= CHAT_TAIL_MAX && total <= CHAT_TAIL_CHARS) return [];
  const first = new Map();
  msgs.forEach((m, k) => {
    if (chatIsObj(m) && chatHasId(m) && !first.has(String(m.id))) first.set(String(m.id), k);
  });
  const parts = [];
  let at = 0;
  let open = 0;
  for (let i = 0; i < prev.length; i++) {
    const p = prev[i];
    const where = (id) => {
      if (id === undefined || id === null || id === "") return -1;
      const k = first.get(String(id));
      return k === undefined || k < at ? -1 : k;
    };
    let end = -1;
    const j = where(p.last);
    if (j >= 0) end = j + 1;
    else {
      const q = where(i + 1 < prev.length ? prev[i + 1].first : tailFirst);
      if (q >= 0) end = q;
    }
    const n = open || p.n;
    if (end < 0) {
      open = n;
      continue;
    }
    open = 0;
    if (end > at) {
      parts.push({ n, from: at, to: end, kept: true });
      at = end;
    }
  }
  let left = msgs.length - at;
  let chars = 0;
  for (let k = at; k < msgs.length; k++) chars += lines[k].length;
  while (left > CHAT_TAIL_MAX || chars > CHAT_TAIL_CHARS) {
    let end = at;
    let c = 0;
    // at least one message to a part, at least one left in the tail
    while (end < msgs.length - 1 && end - at < CHAT_PART_MSGS && (end === at || c + lines[end].length <= CHAT_PART_CHARS)) {
      c += lines[end].length;
      end++;
    }
    if (end === at) break;
    parts.push({ n: ++top, from: at, to: end, kept: false });
    left -= end - at;
    chars -= c;
    at = end;
  }
  return parts;
}

/**
 * Save a chat: its parts (only those whose text changed), the tail, and the meta (its `transcript` is set here). Throws
 * when a file cannot be written. `msgs` in their full shape, as chatMessages gives them.
 */
function chatSave(fsx, id, meta, msgs) {
  const lines = msgs.map((m) => JSON.stringify(chatPack(m)));
  const read = msgs[CHAT_READ];
  const raw = read && read.id === id ? read.raw : null;
  const known = chatIsObj(meta.transcript);
  const prev = chatPartsOf(meta);
  // a meta that lost its record (rebuilt by hand) leaves parts on disk it does not name: none is kept, all go
  const onDisk = known ? prev.map((p) => p.n) : chatPartsOnDisk(fsx, id);
  const top = Math.max(0, ...prev.map((p) => p.n), ...onDisk);
  const plan = chatPlan(known ? prev : [], known ? meta.transcript.tailFirst : undefined, top, msgs, lines);
  const text = (a, b) => (b > a ? lines.slice(a, b).join("\n") + "\n" : "");
  for (const p of plan) {
    const rel = chatPartPath(id, p.n);
    if (p.kept) chatWriteIfChanged(fsx, rel, text(p.from, p.to), raw);
    else fsx.write(rel, text(p.from, p.to));
  }
  const tailFrom = plan.length ? plan[plan.length - 1].to : 0;
  const listed = plan.map((p) => ({
    n: p.n,
    count: p.to - p.from,
    first: msgs[p.from].id,
    last: msgs[p.to - 1].id,
    user: msgs.slice(p.from, p.to).some((m) => chatIsObj(m) && m.role === "user"),
  }));
  const tailFirst = tailFrom < msgs.length && chatIsObj(msgs[tailFrom]) ? msgs[tailFrom].id : undefined;
  const writeMeta = (tailSize) => {
    meta.transcript = { v: 1, ...chatSummaryOf(msgs, lines), tailSize, ...(tailFirst !== undefined ? { tailFirst } : {}), parts: listed };
    fsx.write(chatMetaPath(id), JSON.stringify(meta, null, 2) + "\n");
  };
  const was = new Set(onDisk);
  const keep = new Set(listed.map((p) => p.n));
  // a new part is on record before the tail gives up the messages it holds
  if (listed.some((p) => !was.has(p.n))) writeMeta(null);
  chatWriteIfChanged(fsx, chatTailPath(id), text(tailFrom, msgs.length), raw);
  let tailSize = null;
  try {
    const st = typeof fsx.stat === "function" ? fsx.stat(chatTailPath(id)) : null;
    if (st && Number.isInteger(st.size)) tailSize = st.size;
  } catch {}
  writeMeta(tailSize);
  // a part no longer listed goes last, once nothing points at it
  if (!keep.size) {
    if (onDisk.length) {
      try {
        fsx.remove(chatPartsDir(id));
      } catch {}
    }
  } else {
    for (const n of onDisk) {
      if (keep.has(n)) continue;
      try {
        fsx.remove(chatPartPath(id, n));
      } catch {}
    }
  }
}

/** Remove a chat's transcript: the tail and every part (the meta and other files are the caller's). */
function chatRemove(fsx, id) {
  try {
    fsx.remove(chatTailPath(id));
  } catch {}
  try {
    fsx.remove(chatPartsDir(id));
  } catch {}
}
// ==== END GENERATED: chat-store ====

export const DEFAULT_CONFIG = { enabled: false, model: "", k: 3, clockHours: 6, minReplies: 2, spoilers: "hints", offCards: [] };

const VISIBILITY = ["secret", "local", "public"];
const SPOILERS = ["none", "hints", "all"];
const RELATION_CHANGES = ["closer", "cooler", "break"];
const EFFECT_TYPES = ["front_clock", "relation", "item_moved", "npc_moved", "injury_healed"];
const WHAT_MIN = 12;
const WHAT_MAX = 280;
const WHERE_MAX = 80;
const WHEN_MAX = 60;
const PEOPLE_MAX = 4;
const EFFECTS_MAX = 3;
const PASSES_KEEP = 24;
const EVENTS_KEEP = 200;
const LOG_KEEP = 30;
const OFF_CARDS_MAX = 60;
const ID = /^[A-Za-z0-9_-]{1,120}$/;
const PLACE_ID = /^l\d{1,6}$/;
const PERSON_ID = /^p\d{1,6}$/;
const THING_ID = /^o\d{1,6}$/;
const FRONT_ID = /^f\d{1,6}$/;

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const cut = (s, n) => (s.length > n ? s.slice(0, n).trimEnd() : s);
const num = (v, lo, hi, dflt) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const unique = (list) => [...new Set(list)];

/** The message key the Dashboard and the World use for one version of a message. */
export const keyOf = (m) => m.id + "#" + (Number.isFinite(m.swipe) ? m.swipe : 0);

/** Only what differs from the defaults is kept, and everything is clamped. */
export function cleanConfig(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    enabled: r.enabled === true,
    model: typeof r.model === "string" && /^\S{1,200}$/.test(r.model.trim()) ? r.model.trim() : "",
    k: num(r.k, 1, 6, DEFAULT_CONFIG.k),
    clockHours: num(r.clockHours, 1, 168, DEFAULT_CONFIG.clockHours),
    minReplies: num(r.minReplies, 1, 20, DEFAULT_CONFIG.minReplies),
    spoilers: SPOILERS.includes(r.spoilers) ? r.spoilers : DEFAULT_CONFIG.spoilers,
    // card ids whose character must not act off screen (the per-card switch)
    offCards: unique(arr(r.offCards).filter((c) => typeof c === "string" && ID.test(c))).slice(0, OFF_CARDS_MAX),
  };
}

export function emptyState(chatId) {
  return { v: 1, chatId, cursor: "", next: 1, passes: [], events: [], log: [], usage: { input: 0, output: 0, cost: 0, runs: 0 }, lastFailAt: 0 };
}

/** A loaded file made safe: wrong shapes become empty, unknown statuses become active. */
export function cleanState(raw, chatId) {
  const base = emptyState(chatId);
  if (!isObj(raw)) return base;
  const events = arr(raw.events)
    .filter((e) => isObj(e) && str(e.id) && str(e.what))
    .map((e) => ({ ...e, status: e.status === "undone" ? "undone" : "active" }));
  const passes = arr(raw.passes).filter((p) => isObj(p) && str(p.key)).slice(-PASSES_KEEP);
  return {
    v: 1,
    chatId,
    cursor: str(raw.cursor),
    next: num(raw.next, 1, 1e9, events.length + 1),
    passes,
    events: events.slice(-EVENTS_KEEP),
    log: arr(raw.log).filter(isObj).slice(-LOG_KEEP),
    usage: { ...base.usage, ...(isObj(raw.usage) ? Object.fromEntries(Object.entries(raw.usage).filter(([k, v]) => k in base.usage && Number.isFinite(v))) : {}) },
    lastFailAt: Number.isFinite(raw.lastFailAt) ? raw.lastFailAt : 0,
  };
}

// ---------- the registry, read as the file keeps it ----------

/**
 * The registry's entities by id, merged ones followed to their target. `entities` is the `entities` array of
 * registry/<chatId>.json: [{ id, kind: person | thing | place, name, aliases: [{ text }], merged? }].
 * Names are matched by plain lower case and, in `presentIds`, through the Dashboard's `personIds` (name -> registry id), which has
 * already resolved a transliterated or one-letter-off spelling; a name the Dashboard never resolved is matched by plain lower case only.
 */
export function registryIndex(entities) {
  const byId = new Map();
  for (const e of arr(entities)) if (isObj(e) && str(e.id)) byId.set(str(e.id), e);
  const resolve = (id) => {
    let e = byId.get(id);
    for (let hops = 0; e && str(e.merged) && hops < 8; hops++) e = byId.get(str(e.merged));
    return e && !str(e.merged) ? e : null;
  };
  return { byId, resolve };
}

const namesOf = (e) => [str(e.name), ...arr(e.aliases).map((a) => str(isObj(a) ? a.text : a))].filter(Boolean);

/** Registry ids of the people who stand in the scene, found by name, alias, or the id itself. */
export function presentIds(index, presentNames, personIds) {
  const want = new Set(arr(presentNames).map((n) => str(n).toLowerCase()).filter(Boolean));
  const out = new Set();
  // the Dashboard's own name -> registry id map (state.personIds) has resolved the spelling already
  if (isObj(personIds)) for (const [name, id] of Object.entries(personIds)) {
    const e = want.has(name.toLowerCase()) && typeof id === "string" ? index.resolve(id) : null;
    if (e && e.kind === "person") out.add(str(e.id));
  }
  for (const [id] of index.byId) {
    const e = index.resolve(id);
    if (!e || e.kind !== "person") continue;
    if (want.has(id.toLowerCase()) || namesOf(e).some((n) => want.has(n.toLowerCase()))) out.add(str(e.id));
  }
  return out;
}

// ---------- one event ----------

const bad = (reason) => ({ ok: false, reason });

/** `ctx`: { index (registryIndex), present (Set of ids from presentIds), fronts (array of front ids) }. */
function personRef(ctx, v, what) {
  const id = str(v);
  if (!PERSON_ID.test(id) && id !== "user") return bad(what + ": " + (id || "empty") + " is not a person id");
  if (id === "user") return bad(what + ": the player's character never takes part");
  const e = ctx.index.resolve(id);
  if (!e) return bad(what + ": unknown id " + id);
  if (e.kind !== "person") return bad(what + ": " + id + " is not a person");
  return { ok: true, id: str(e.id) };
}

function peopleList(ctx, raw, what, { min }) {
  const list = arr(raw).slice(0, 12);
  const ids = [];
  for (const v of list) {
    const r = personRef(ctx, v, what);
    if (!r.ok) return r;
    if (ctx.present.has(r.id)) return bad(what + ": " + r.id + " is in the scene");
    if (!ids.includes(r.id)) ids.push(r.id);
  }
  if (ids.length < min) return bad("no " + what);
  if (ids.length > PEOPLE_MAX) return bad("too many in " + what);
  return { ok: true, ids };
}

function cleanEffect(ctx, raw, involved, knowers) {
  if (!isObj(raw) || !EFFECT_TYPES.includes(raw.type)) return bad("effect: type not in the list");
  const type = raw.type;
  if (type === "front_clock") {
    const front = str(raw.front);
    if (!FRONT_ID.test(front) || !arr(ctx.fronts).includes(front)) return bad("effect: unknown front " + front);
    return { ok: true, effect: { type, front } };
  }
  if (type === "relation") {
    const a = personRef(ctx, raw.a, "effect a");
    const b = personRef(ctx, raw.b, "effect b");
    if (!a.ok) return a;
    if (!b.ok) return b;
    if (a.id === b.id) return bad("effect: a relation needs two people");
    if (!RELATION_CHANGES.includes(raw.change)) return bad("effect: relation change not in the list");
    // one side must be in the event; the other may be anyone off screen (a model often writes "Elena begs Bram", with Bram only named)
    if (!knowers.includes(a.id) && !knowers.includes(b.id)) return bad("effect: a relation of people the event does not involve");
    if (ctx.present.has(a.id) || ctx.present.has(b.id)) return bad("effect: a relation of someone in the scene");
    return { ok: true, effect: { type, a: a.id, b: b.id, change: raw.change } };
  }
  if (type === "item_moved") {
    const item = str(raw.item);
    const thing = THING_ID.test(item) ? ctx.index.resolve(item) : null;
    if (!thing || thing.kind !== "thing") return bad("effect: unknown thing " + item);
    const to = str(raw.to);
    if (PLACE_ID.test(to)) {
      const pl = ctx.index.resolve(to);
      if (!pl || pl.kind !== "place") return bad("effect: unknown place " + to);
      return { ok: true, effect: { type, item: str(thing.id), to: str(pl.id) } };
    }
    const p = personRef(ctx, to, "effect to");
    if (!p.ok) return p;
    if (!knowers.includes(p.id)) return bad("effect: a thing given to someone the event does not involve");
    return { ok: true, effect: { type, item: str(thing.id), to: p.id } };
  }
  const who = personRef(ctx, raw.who, "effect who");
  if (!who.ok) return who;
  if (!involved.includes(who.id)) return bad("effect: " + who.id + " is not in who");
  if (type === "injury_healed") return { ok: true, effect: { type, who: who.id } };
  const to = str(raw.to);
  const pl = PLACE_ID.test(to) ? ctx.index.resolve(to) : null;
  if (!pl || pl.kind !== "place") return bad("effect: unknown place " + to);
  return { ok: true, effect: { type, who: who.id, to: str(pl.id) } };
}

/**
 * One event from the model's object, or the reason it fails. Nothing is repaired: any broken part drops the whole event.
 * The result has no id yet (`buildEvents` numbers it).
 */
export function cleanEvent(raw, ctx) {
  if (!isObj(raw)) return bad("not an object");
  const who = peopleList(ctx, raw.who, "who", { min: 1 });
  if (!who.ok) return who;
  const witnesses = peopleList(ctx, raw.witnesses, "witnesses", { min: 0 });
  if (!witnesses.ok) return witnesses;
  const knowers = unique([...who.ids, ...witnesses.ids]);
  const what = str(raw.what);
  if (what.length < WHAT_MIN) return bad("what is too short");
  if (what.length > WHAT_MAX) return bad("what is too long");
  if (!VISIBILITY.includes(raw.visibility)) return bad("visibility not in the list");
  const whereRaw = str(raw.where);
  let where = cut(whereRaw, WHERE_MAX);
  let whereName = where;
  if (PLACE_ID.test(whereRaw)) {
    const pl = ctx.index.resolve(whereRaw);
    if (!pl || pl.kind !== "place") return bad("where: unknown place " + whereRaw);
    where = str(pl.id);
    whereName = str(pl.name);
  }
  const effectsRaw = arr(raw.effects);
  if (effectsRaw.length > EFFECTS_MAX) return bad("too many effects");
  const effects = [];
  for (const e of effectsRaw) {
    const r = cleanEffect(ctx, e, who.ids, knowers);
    if (!r.ok) return r;
    effects.push(r.effect);
  }
  return { ok: true, event: { who: who.ids, what, where, whereName, when: cut(str(raw.when), WHEN_MAX), witnesses: witnesses.ids, visibility: raw.visibility, effects } };
}

const wordsOf = (t) => new Set(str(t).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
/** Share of the words two texts have in common, 0 to 1 (words in both over words in either). */
export function overlap(a, b) {
  const x = wordsOf(a);
  const y = wordsOf(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}
export const REPEAT_SHARE = 0.6;
const EARLIER_LOOK = 30;

/**
 * The events a pass keeps. `list` is the model's `events` array; at most `k` survive, in the order given, a repeated `what`
 * is dropped. `earlier` ([{ who, what }], the chat's active events) is checked too: an event about one of the same people whose
 * words are mostly the same as an earlier one is a repeat (a small model copies the recent events it was told not to repeat).
 * Returns { events, dropped: [{ index, reason }], next } with `next` the number for the following event id.
 * `afterKey` is the message key the pass read up to; every event is tied to it.
 */
export function buildEvents(list, ctx, { k = DEFAULT_CONFIG.k, afterKey, next = 1, now = 0, earlier = [] } = {}) {
  const events = [];
  const before = arr(earlier).slice(-EARLIER_LOOK).filter((e) => isObj(e) && arr(e.who).length);
  const dropped = [];
  const seen = new Set();
  let n = next;
  arr(list).forEach((raw, index) => {
    const r = cleanEvent(raw, ctx);
    if (!r.ok) return void dropped.push({ index, reason: r.reason });
    const sig = r.event.what.toLowerCase();
    if (seen.has(sig)) return void dropped.push({ index, reason: "repeats another event" });
    const twin = [...before, ...events].some((e) => e.who.some((w) => r.event.who.includes(w)) && overlap(e.what, r.event.what) >= REPEAT_SHARE);
    if (twin) return void dropped.push({ index, reason: "repeats an earlier event" });
    if (events.length >= k) return void dropped.push({ index, reason: "over the limit of " + k });
    seen.add(sig);
    events.push({ id: "m" + n++, ...r.event, afterKey: str(afterKey), at: now, status: "active" });
  });
  return { events, dropped, next: n };
}

// ---------- when a pass is due ----------

/** Minutes on the story clock `{ day, time: "HH:MM" }`, or null when it holds no hour. */
export function clockMinutes(clock) {
  if (!isObj(clock) || typeof clock.time !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.time.trim());
  if (!m) return null;
  const day = Number.isFinite(Number(clock.day)) && Number(clock.day) >= 1 ? Math.floor(Number(clock.day)) : 1;
  return (day - 1) * 1440 + Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Whether a pass should run now, and why. `snaps` is the Dashboard's `snapshots` (message key -> snapshot with `scene.new`,
 * `clock`), `msgs` the chat's messages on the active line. A pass needs the switch, at least `minReplies` replies since the
 * cursor, and no fight; then either a new scene began since the cursor (the one before it closed), or the story clock
 * moved by `clockHours`. Not due is `{ due: false, reason }`.
 */
export function dueReason({ state, cfg, msgs, snaps, inCombat = false }) {
  if (!cfg.enabled) return { due: false, reason: "off" };
  if (inCombat) return { due: false, reason: "combat" };
  const snapMap = isObj(snaps) ? snaps : {};
  const line = arr(msgs).map(keyOf).filter((k) => isObj(snapMap[k]));
  if (!line.length) return { due: false, reason: "no-dashboard" };
  const at = state.cursor ? line.indexOf(state.cursor) : -1;
  const newer = at >= 0 ? line.slice(at + 1) : line;
  if (newer.length < cfg.minReplies) return { due: false, reason: "few" };
  const to = newer[newer.length - 1];
  const sceneNew = newer.some((k) => isObj(snapMap[k].scene) && snapMap[k].scene.new === true);
  const from = clockMinutes(snapMap[at >= 0 ? line[at] : newer[0]].clock);
  const now = clockMinutes(snapMap[to].clock);
  const span = from !== null && now !== null && now > from ? now - from : 0;
  const base = { from: at >= 0 ? line[at] : "", to, replies: newer.length, spanMinutes: span };
  if (sceneNew) return { due: true, reason: "scene", ...base };
  if (span >= cfg.clockHours * 60) return { due: true, reason: "clock", ...base };
  return { due: false, reason: "quiet", ...base };
}

/** The story time that passed, as words for the prompt: "about 9 hours", "2 days". */
export function spanWords(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 90) return m + " minutes";
  if (m < 48 * 60) return "about " + Math.round(m / 60) + " hours";
  return Math.round(m / 1440) + " days";
}

// ---------- rollback ----------

/**
 * Takes back what a swipe or a delete removed. A pass whose message key is no longer on the line goes; so do its events
 * (marked `undone`, not erased: the caller retires their facts and then calls `dropUndone`). The cursor goes back to the
 * newest pass still on the line. Returns { state, undone: [events newly undone] }; the input is not changed.
 */
export function reconcile(state, msgs) {
  const line = new Set(arr(msgs).map(keyOf));
  const passes = state.passes.filter((p) => line.has(p.key));
  const undone = [];
  const events = state.events.map((e) => {
    if (e.status === "active" && !line.has(e.afterKey)) {
      const u = { ...e, status: "undone" };
      undone.push(u);
      return u;
    }
    return e;
  });
  const cursor = line.has(state.cursor) ? state.cursor : passes.length ? passes[passes.length - 1].key : "";
  return { state: { ...state, cursor, passes, events }, undone };
}

/** The undone events whose facts the caller has retired are removed for good. */
export function dropUndone(state, ids) {
  const gone = new Set(ids);
  return { ...state, events: state.events.filter((e) => !(e.status === "undone" && gone.has(e.id))) };
}

/** What a finished pass adds to the state: the events, the pass record and the new cursor. */
export function recordPass(state, { events, next, key, at, reason }) {
  const passes = [...state.passes, { key, at, reason, ids: events.map((e) => e.id) }].slice(-PASSES_KEEP);
  return { ...state, cursor: key, next, passes, events: [...state.events, ...events].slice(-EVENTS_KEEP) };
}

// ---------- the model's side ----------

const SYSTEM = [
  "You write what happens off screen in an ongoing story: what people who are NOT in the current scene do while time passes.",
  "You get the people (each with where they stand now, when known), the story's open threads, the fronts (factions with a goal and a clock), the places and the time that passed. Propose up to {K} small, concrete events that carry these people forward over that time. An event may be quiet: a visit, a purchase, a quarrel, a journey, a lie told, a secret kept, a message sent, a question asked.",
  "Rules:",
  "- Use only the ids given. `who` are the people the event happens to (1 to 4); `witnesses` are other people who saw or heard it (0 to 4).",
  "- Nobody who is in the scene may appear, and never the player's character.",
  "- Move people on. The time that passed is real: someone who was left in a bad moment has since been treated, moved, questioned, or has done something about it; show where they have got to and what it changed. Never replay the moment they were left in.",
  "- Prefer events that touch an open thread, a front or a person's `now` line, in a way the scene's people could learn of later. A person with nothing to do stays out: an empty list is a good answer.",
  "- Do not decide what the player's character does or feels. Do not resolve a front's goal; it may only move closer.",
  "- `what` is one or two sentences (12 to 280 characters) in the language the story is told in; so are `where` (a place id from the list, or a few words) and `when` (a few words, or empty).",
  "- `visibility`: secret (only who and witnesses ever learn it), local (people nearby will hear of it), public (the whole place will).",
  "- `effects` (at most 3, usually none) are proposals from this list only: {\"type\":\"front_clock\",\"front\":\"f1\"}, {\"type\":\"relation\",\"a\":\"p1\",\"b\":\"p2\",\"change\":\"closer|cooler|break\"}, {\"type\":\"item_moved\",\"item\":\"o1\",\"to\":\"p1 or l1\"}, {\"type\":\"npc_moved\",\"who\":\"p1\",\"to\":\"l1\"}, {\"type\":\"injury_healed\",\"who\":\"p1\"}. A person in an effect must be in who or witnesses.",
  "- Do not repeat the recent events, not even reworded: an event is a step beyond them (a decision, a move, a meeting, a message), never the same moment again. If nothing fits, answer with an empty list.",
  "Answer with one JSON object and nothing else: {\"events\":[{\"who\":[\"p1\"],\"what\":\"...\",\"where\":\"l1\",\"when\":\"...\",\"witnesses\":[],\"visibility\":\"secret\",\"effects\":[]}]}",
].join("\n");

const line = (id, name, extra, max = 160) => "- " + id + " " + cut(str(name), 60) + (extra ? ": " + cut(str(extra), max) : "");
const firstSentence = (t) => (/^.{12,}?[.!?…](?=\s|$)/u.exec(str(t)) || [str(t)])[0];
const NOW_MAX = 200;
const ABOUT_MAX = 140;

/**
 * The request's text. `input`: { k, scene: { place, present: [names] }, span (minutes), fronts: [{ id, name, goal, clock, size }],
 * threads: [text] (the story's open threads), npcs: [{ id, name, now, about, goal, where }] (`now`: where they stand in the story, `about`: who they are), absent: [{ id, name, goal, where }] (card characters whose Meanwhile switch is on),
 * places: [{ id, name }], recent: [text] }. Lists are capped; `tokens` is an estimate (4 characters a token).
 */
export function buildPrompt(input) {
  const k = num(input.k, 1, 6, DEFAULT_CONFIG.k);
  const out = [];
  const sc = isObj(input.scene) ? input.scene : {};
  out.push("Now: " + (str(sc.place) ? "the scene is at " + cut(str(sc.place), 80) + ". " : "") + (str(sc.label) ? "It was: " + cut(str(sc.label), 100) + ". " : "") + (arr(sc.present).length ? "In the scene: " + arr(sc.present).slice(0, 12).map((n) => cut(str(n), 40)).join(", ") + "." : "Nobody else is in the scene."));
  out.push("Time that passed: " + spanWords(input.span || 0) + ".");
  const fronts = arr(input.fronts).slice(0, 6);
  if (fronts.length) out.push("Fronts:\n" + fronts.map((f) => line(f.id, f.name, (f.goal ? "wants " + str(f.goal) : "") + (Number.isFinite(f.size) ? " (clock " + (Number(f.clock) || 0) + "/" + f.size + ")" : ""))).join("\n"));
  const threads = arr(input.threads).map((t) => cut(str(t), 160)).filter(Boolean).slice(0, 5);
  if (threads.length) out.push("Open threads of the story (not settled yet):\n" + threads.map((t) => "- " + t).join("\n"));
  const npcs = arr(input.npcs).slice(0, 12);
  if (npcs.length) out.push("People of the world:\n" + npcs.map((p) => line(p.id, p.name, [p.now ? "now: " + cut(str(p.now), NOW_MAX) : "", p.about ? "is: " + cut(str(p.about), ABOUT_MAX) : "", p.goal ? "wants " + str(p.goal) : "", p.where ? "at " + str(p.where) : ""].filter(Boolean).join("; "), 400)).join("\n"));
  const absent = arr(input.absent).slice(0, 10);
  if (absent.length) out.push("Characters who are away:\n" + absent.map((p) => line(p.id, p.name, [p.goal ? "wants " + str(p.goal) : "", p.where ? "at " + str(p.where) : ""].filter(Boolean).join("; "))).join("\n"));
  const places = arr(input.places).slice(0, 12);
  if (places.length) out.push("Places:\n" + places.map((p) => line(p.id, p.name)).join("\n"));
  const recent = arr(input.recent).slice(-6);
  if (recent.length) out.push("Recent events (do not repeat):\n" + recent.map((t) => "- " + cut(str(t), 160)).join("\n"));
  const system = SYSTEM.replace("{K}", String(k));
  const user = out.join("\n\n");
  return { system, user, tokens: Math.ceil((system.length + user.length) / 4) };
}

/** The first balanced `{...}` of `s` from `from`, or null. */
function firstObject(s, from) {
  const start = s.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

/**
 * The `events` array of the model's answer, or null when none can be read. The last balanced object with an `events` array
 * wins (a thinking model may write braces before the answer); code fences, a thinking block and trailing commas are ignored.
 */
export function parseEvents(text) {
  const s = String(text || "").replace(/^\s*<(think|thinking|reasoning)>[\s\S]*?<\/\1>/i, "").replace(/```(?:json)?/gi, " ").trim();
  let best = null;
  for (let from = 0; ; ) {
    const body = firstObject(s, from);
    if (!body) break;
    const at = s.indexOf(body, from);
    let v = null;
    try {
      v = JSON.parse(body.replace(/,\s*([}\]])/g, "$1"));
    } catch {}
    if (isObj(v) && Array.isArray(v.events)) {
      best = v.events;
      from = at + body.length;
    } else from = at + 1;
  }
  return best;
}

// ---------- what the rest of the app gets ----------

/**
 * The Litopys fact an event becomes (M2a sends it). `knownBy` names only the people it happened to and those who saw it, so
 * the player's character never knows it; a secret event also carries `secret: true`, which the leak check and the "who knows
 * what" note already honour (#416). `personaUnaware` says it on purpose.
 */
export function factDraft(event, index) {
  const names = [];
  for (const id of unique([...event.who, ...event.witnesses])) {
    if (id === "user") continue;
    const e = index.resolve(id);
    if (e && e.kind === "person" && str(e.name)) names.push(str(e.name));
  }
  return {
    text: event.what,
    subject: names[0] || "",
    knownBy: unique(names),
    type: "event",
    weight: "everyday",
    secret: event.visibility === "secret",
    origin: "meanwhile",
    eventId: event.id,
    personaUnaware: true,
  };
}

/**
 * What the panel may show of an event under the chat's spoiler setting: `none` only that something happened, `hints` who and
 * where but not what, `all` everything.
 */
export function spoilerView(event, mode, index) {
  const nameOf = (id) => {
    const e = index.resolve(id);
    return e && str(e.name) ? str(e.name) : id;
  };
  const base = { id: event.id, visibility: event.visibility, status: event.status };
  if (mode === "none") return base;
  const hint = { ...base, who: event.who.map(nameOf), where: event.whereName || event.where, when: event.when };
  if (mode === "hints") return hint;
  return { ...hint, what: event.what, witnesses: event.witnesses.map(nameOf), effects: event.effects };
}

// ---------- routes (M1b) ----------

const CONFIG_FILE = "meanwhile/config.json";
const STATE_DIR = "meanwhile/state/";
const COOLDOWN_MS = 10 * 60 * 1000;
const MODEL_REF = /^\S{1,200}$/;
const OWN_SRC = ["persona", "card", "soul", "group"];
const MAX_TOKENS = 1500;
const RETRY_TOKENS = 6000;

const ok = (json, status) => ({ status: status || 200, json });
const readJson = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};
export const readConfig = (fsx) => cleanConfig(readJson(fsx, CONFIG_FILE, {}));
const stateFile = (chatId) => STATE_DIR + chatId + ".json";
const loadState = (fsx, chatId) => cleanState(readJson(fsx, stateFile(chatId), null), chatId);
const saveState = (fsx, st) => fsx.write(stateFile(st.chatId), JSON.stringify(st, null, 2));
const registryOf = (fsx, chatId) => {
  const reg = readJson(fsx, "registry/" + chatId.replace(/[^\w-]/g, "_") + ".json", null);
  return registryIndex(isObj(reg) ? reg.entities : []);
};

function readChat(fsx, chatId) {
  const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
  if (!isObj(meta)) return null;
  // every part and the tail, in full shape (chat-store.js)
  const msgs = chatMessages(fsx, chatId, meta).filter((m) => m.id !== undefined && m.id !== null && m.id !== "");
  return { meta, msgs };
}

/** The model in force and where it comes from: this plugin's, else the World's, the Dashboard sensor's, Litopys's, the chat's, the app's. */
export function modelFor(fsx, cfg, meta) {
  const world = readJson(fsx, "world/config.json", null);
  const dash = readJson(fsx, "dashboard/config.json", null);
  const lit = readJson(fsx, "litopys/config.json", null);
  const settings = readJson(fsx, "settings.json", null);
  const list = [
    ["meanwhile", cfg.model],
    ["world", isObj(world) ? world.model : ""],
    ["sensor", isObj(dash) ? dash.sensorModel : ""],
    ["litopys", isObj(lit) ? lit.model : ""],
    ["chat", meta && meta.model],
    ["default", isObj(settings) ? settings.model : ""],
  ];
  const hit = list.find(([, m]) => typeof m === "string" && MODEL_REF.test(m.trim()));
  return hit ? { model: hit[1].trim(), from: hit[0] } : { model: "", from: "none" };
}

/** What a pass reads: the scene at message `due.to`, the world's fronts and people, the cards that are away, the places. */
export function gatherInput(fsx, chatId, state, cfg, due) {
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const snaps = isObj(dash) && isObj(dash.snapshots) ? dash.snapshots : {};
  const last = isObj(snaps[due.to]) ? snaps[due.to] : {};
  const index = registryOf(fsx, chatId);
  const presentNames = arr(last.present).map(str).filter(Boolean).slice(0, 12);
  const present = presentIds(index, presentNames, isObj(dash) ? dash.personIds : null);
  const world = readJson(fsx, "world/state/" + chatId + ".json", null);
  const fronts = arr(isObj(world) ? world.fronts : []).filter((x) => isObj(x) && x.status !== "past" && /^f\d{1,6}$/.test(str(x.id)));
  const regIds = isObj(world) && isObj(world.regIds) ? world.regIds : {};
  const seen = new Set();
  const take = (id) => {
    const e = index.resolve(id);
    if (!e || e.kind !== "person" || e.id === "user" || present.has(str(e.id)) || seen.has(str(e.id))) return null;
    seen.add(str(e.id));
    return e;
  };
  const npcs = [];
  for (const rec of arr(isObj(world) ? world.entities : [])) {
    if (!isObj(rec) || rec.kind !== "person" || rec.status === "past" || rec.status === "dormant") continue;
    const e = typeof regIds[rec.id] === "string" ? take(regIds[rec.id]) : null;
    if (!e || OWN_SRC.includes(e.src)) continue;
    const now = isObj(rec.hook) ? str(rec.hook.text) : "";
    npcs.push({ id: str(e.id), name: str(e.name), now, about: firstSentence(rec.text), where: "" });
  }
  const absent = [];
  for (const e0 of index.byId.values()) {
    if (e0.kind !== "person" || e0.src !== "card" || cfg.offCards.includes(str(e0.card))) continue;
    const e = take(str(e0.id));
    if (e) absent.push({ id: str(e.id), name: str(e.name), goal: "", where: "" });
  }
  const places = [...index.byId.values()].filter((e) => e.kind === "place" && !str(e.merged)).map((e) => ({ id: str(e.id), name: str(e.name) }));
  const input = {
    k: cfg.k,
    scene: { place: isObj(last.clock) ? str(last.clock.place) : "", label: isObj(last.scene) ? str(last.scene.label) : "", present: presentNames },
    threads: arr(last.threads).filter((t) => isObj(t) && t.status === "open" && str(t.text)).sort((a, b) => (a.kind === "main" ? 0 : 1) - (b.kind === "main" ? 0 : 1)).map((t) => str(t.text)),
    span: due.spanMinutes || 0,
    fronts: fronts.map((x) => ({ id: str(x.id), name: str(x.name), goal: str(x.goal), clock: x.clock, size: x.size })),
    npcs: npcs.slice(0, 12),
    absent: absent.slice(0, 10),
    places: places.slice(0, 12),
    recent: state.events.filter((e) => e.status === "active").slice(-6).map((e) => e.what),
  };
  return { input, ctx: { index, present, fronts: fronts.map((x) => str(x.id)) }, people: npcs.length + absent.length };
}

const requestFor = (input, model, maxTokens) => {
  const p = buildPrompt(input);
  // NEVER set a reasoning field: the pass is a small structured answer
  return { ...(model ? { model } : {}), systemPrompt: p.system, messages: [{ role: "user", content: p.user }], presetParams: { temperature: 0.7, max_tokens: maxTokens } };
};

/** Takes back what a swipe or a delete removed. M2a will retire the events' Litopys facts first; until then there are none. */
function settle(fsx, state, msgs) {
  const r = reconcile(state, msgs);
  // a log line of a pass whose reply is gone stays (it says what happened) but is marked, so it does not contradict the events
  const line = new Set(arr(msgs).map(keyOf));
  const marked = r.state.log.map((l) => (l.to && !l.undone && !line.has(l.to) ? { ...l, undone: true } : l));
  const logChanged = marked.some((l, i) => l !== r.state.log[i]);
  if (!r.undone.length && !logChanged && r.state.cursor === state.cursor && r.state.passes.length === state.passes.length) return state;
  const next = { ...dropUndone(r.state, r.undone.map((e) => e.id)), log: marked };
  saveState(fsx, next);
  return next;
}

const dueFor = (state, cfg, chat, fsx, chatId, force) => {
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const snaps = isObj(dash) && isObj(dash.snapshots) ? dash.snapshots : {};
  const d = dueReason({ state, cfg: force ? { ...cfg, minReplies: 1 } : cfg, msgs: chat.msgs, snaps });
  return force && !d.due && d.reason === "quiet" ? { ...d, due: true, reason: "manual" } : d;
};

const thinkingOnly = (r) => !r.error && !str(r.text) && !!str(r.reasoning);
const isRateLimit = (r) => /429|rate.?limit|too many requests/i.test(String((r && r.error) || ""));
const usageOf = (r) => (isObj(r.usage) ? { input: Number(r.usage.input) || 0, output: Number(r.usage.output) || 0, cost: r.usage.priced === false ? 0 : Number(r.usage.costTotal) || 0 } : null);

function runRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!ID.test(chatId)) return ok({ ok: false, error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ ok: false, reason: "no-chat" }, 404);
  const cfg = readConfig(fsx);
  const now = Date.now();
  const state = settle(fsx, loadState(fsx, chatId), chat.msgs);
  const res = host.llm && isObj(host.llm.results) ? host.llm.results : {};
  const r = res.meanwhile_retry || res.meanwhile;
  const stash = isObj(req.stash) ? req.stash : {};
  if (!r) {
    if (!cfg.enabled) return ok({ ok: false, reason: "off" });
    if (b.force !== true && state.lastFailAt && now - state.lastFailAt < COOLDOWN_MS) return ok({ ok: false, reason: "cooldown" });
    const due = dueFor(state, cfg, chat, fsx, chatId, b.force === true);
    if (!due.due) return ok({ ok: false, reason: due.reason });
    const g = gatherInput(fsx, chatId, state, cfg, due);
    if (!g.people) return ok({ ok: false, reason: "nobody" });
    const pick = modelFor(fsx, cfg, chat.meta);
    if (!pick.model) return ok({ ok: false, reason: "no-model" });
    host.llm.request("meanwhile", requestFor(g.input, pick.model, MAX_TOKENS));
    return { __llmPending: true, stash: { due, model: pick.model, started: now, retry: false } };
  }
  // the answer: the pass is pinned to the message it was started at
  const due = isObj(stash.due) ? stash.due : null;
  if (!due || !due.to) return ok({ ok: false, reason: "error", message: "the pass lost its start" });
  const g = gatherInput(fsx, chatId, state, cfg, due);
  const retry = stash.retry === true;
  const again = (maxTokens) => {
    host.llm.request("meanwhile_retry", requestFor(g.input, stash.model, maxTokens));
    return { __llmPending: true, stash: { ...stash, retry: true } };
  };
  if (!retry && r.error && isRateLimit(r)) return again(MAX_TOKENS);
  if (!retry && !r.error && !str(r.text)) return again(thinkingOnly(r) ? RETRY_TOKENS : MAX_TOKENS);
  const usage = usageOf(r);
  const started = Number(stash.started) || now;
  const base = { at: now, reason: due.reason, from: due.from, to: due.to, model: str(r.model) && r.model !== "error" ? str(r.model) : stash.model, ms: Math.round(Number(r.genTimeMs) || now - started), ...(usage ? { usage } : {}), ...(retry ? { retried: true } : {}) };
  const count = (st) => ({ ...st, usage: { input: st.usage.input + (usage ? usage.input : 0), output: st.usage.output + (usage ? usage.output : 0), cost: st.usage.cost + (usage ? usage.cost : 0), runs: st.usage.runs + 1 } });
  const fail = (reason, message) => {
    const st = count({ ...state, lastFailAt: now, log: [...state.log, { ...base, offered: 0, kept: 0, dropped: [], error: reason + ": " + message }].slice(-LOG_KEEP) });
    saveState(fsx, st);
    return ok({ ok: false, reason, message });
  };
  if (r.error) return fail("error", String(r.error).split("\n")[0].slice(0, 300));
  if (!str(r.text)) return fail("empty", thinkingOnly(r) ? "the model spent its whole limit thinking" : "the model returned nothing");
  const raw = parseEvents(r.text);
  if (!raw) return fail("bad-reply", "no events list in the answer");
  const built = buildEvents(raw, g.ctx, { k: cfg.k, afterKey: due.to, next: state.next, now, earlier: state.events.filter((e) => e.status === "active") });
  let st = recordPass(state, { events: built.events, next: built.next, key: due.to, at: now, reason: due.reason });
  st = count({ ...st, lastFailAt: 0, log: [...st.log, { ...base, offered: raw.length, kept: built.events.length, dropped: built.dropped.map((d) => d.reason).slice(0, 10), events: built.events.map((e) => ({ id: e.id, who: e.who, visibility: e.visibility })) }].slice(-LOG_KEEP) });
  saveState(fsx, st);
  return ok({ ok: true, kept: built.events.length, offered: raw.length, dropped: built.dropped.length, events: built.events.map((e) => spoilerView(e, cfg.spoilers, g.ctx.index)) });
}

function stateRoute(req, host) {
  const fsx = host.fs;
  const chatId = String((req.query && req.query.chatId) || "");
  if (!ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const cfg = readConfig(fsx);
  const state = settle(fsx, loadState(fsx, chatId), chat.msgs);
  const index = registryOf(fsx, chatId);
  const nameOf = (id) => {
    const e = index.resolve(id);
    return e && str(e.name) ? str(e.name) : id;
  };
  const due = dueFor(state, cfg, chat, fsx, chatId, false);
  // a dropped reason names registry ids ("p3 is in the scene"): say the names
  const named = (text) => String(text).replace(/\b[plo]\d{1,6}\b/g, (id) => nameOf(id));
  const log = state.log.slice().reverse().map((l) => ({ ...l, dropped: arr(l.dropped).map(named), events: arr(l.events).map((e) => (cfg.spoilers === "none" ? { id: e.id, visibility: e.visibility } : { ...e, who: arr(e.who).map(nameOf) })) }));
  return ok({
    config: cfg,
    model: modelFor(fsx, cfg, chat.meta),
    due: { due: due.due, reason: due.reason, replies: due.replies || 0, spanMinutes: due.spanMinutes || 0 },
    events: state.events.filter((e) => e.status === "active").reverse().map((e) => spoilerView(e, cfg.spoilers, index)),
    log,
    usage: state.usage,
  });
}

function configRoute(req, host) {
  const fsx = host.fs;
  if (req.method === "GET") {
    const cfg = readConfig(fsx);
    return ok({ config: cfg, model: modelFor(fsx, cfg, null) });
  }
  const next = cleanConfig({ ...readConfig(fsx), ...(isObj(req.body) ? req.body : {}) });
  fsx.write(CONFIG_FILE, JSON.stringify({ v: 1, ...next }, null, 2));
  return ok({ config: next, model: modelFor(fsx, next, null) });
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (path !== "/meanwhile" && !path.startsWith("/meanwhile/")) return null;
  if (path === "/meanwhile/state" && req.method === "GET") return stateRoute(req, host);
  if (path === "/meanwhile/config" && (req.method === "GET" || req.method === "PUT")) return configRoute(req, host);
  if (path === "/meanwhile/run" && req.method === "POST") return runRoute(req, host);
  return ok({ error: "not found" }, 404);
}
