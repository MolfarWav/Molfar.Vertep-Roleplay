/**
 * Polish my message (GitHub #15).
 *
 * POST /polish/chats/:id { text, model? } runs the player's draft through the
 * chat's own model with an editing instruction and returns { text }. Nothing
 * is sent or stored: the composer puts the result back into the box, with an
 * Undo for the draft it replaced.
 *
 * Model: the one the page sends (the chat's model as the composer resolves
 * it), else the chat's saved model, else the app's default; with none set the
 * engine picks the user's default model.
 * Prompt: the preset's utility prompt `polish` (studio bag, else top level);
 * blank means DEFAULT_POLISH below, which src/lib/seed.ts mirrors as
 * DEFAULT_POLISH_PROMPT (a test keeps the two equal).
 *
 * Two-phase LLM, like every route here: the first pass calls
 * host.llm.request and returns { __llmPending, stash }; the engine runs the
 * call and re-runs the route with the reply in host.llm.results. A route's
 * answer is { status, json } — the engine drops any other shape.
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
 * - Read on touch. `chats/<id>.parts/index.json` keeps the light fields of every message in the parts (id, swipe, role,
 *   name, flags: everything but CHAT_HEAVY). A read gives the tail's messages whole and the parts' messages as stand-ins
 *   with those fields; the first read or write of a heavy field (`text`, `swipes`, `extra`, ...) of one of them reads its
 *   part and fills every message of that part. A reader that needs only the message keys, or only the newest messages,
 *   never reads an old part. A save leaves a part alone when none of its stand-ins was touched.
 * - Order. A save that changes the set of parts writes the new parts and the index, then the meta, then the tail, then
 *   the meta again, and removes the parts no longer listed last. A reader that comes in between sees a message twice
 *   (once in a part, once in the old tail), never a hole; the reader keeps one copy of each id, the newer file's. The
 *   index is trusted for a part only when its `rev` is the one the meta lists.
 */

const CHAT_TAIL_MAX = 200;
const CHAT_PART_MSGS = 100;
// JS characters of lines: at most about three bytes each, so a part stays well under the engine's 4 MB write cap
const CHAT_PART_CHARS = 600000;
const CHAT_TAIL_CHARS = 900000;
/** The fields a stand-in leaves in its part until something touches them. */
const CHAT_HEAVY = ["text", "swipes", "extra", "translation", "attachments", "directions", "reasoning", "mes", "parts", "tools"];

const chatTailPath = (id) => "chats/" + id + ".jsonl";
const chatMetaPath = (id) => "chats/" + id + ".meta.json";
const chatPartsDir = (id) => "chats/" + id + ".parts";
const chatPartPath = (id, n) => chatPartsDir(id) + "/" + n + ".jsonl";
const chatIndexPath = (id) => chatPartsDir(id) + "/index.json";

const chatIsObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const chatHasId = (m) => m.id !== undefined && m.id !== null && m.id !== "";
const CHAT_HEAVY_SET = new Set(CHAT_HEAVY);
// what a read leaves on its array (not enumerable, so it never reaches JSON): the file texts it read, so a save of the
// same array rewrites only the files whose text changed without reading them again
const CHAT_READ = "__chatRead";
// what a stand-in carries until it is filled (not enumerable): { view, n, pos, row, len }
const CHAT_STUB = "__chatStub";
const CHAT_LOST = "__chatLost";
// where a message of a closed part came from (not enumerable, kept after a fill): { n, pos, rev }
const CHAT_FROM = "__chatFrom";
const chatSame = (a, b) => a === b || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

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

/** The parts the meta lists: [{n, count, first, last, user, rev}]. */
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

/** The messages of one file's text, in full shape; lines that do not parse are left out. */
function chatParseLines(s) {
  const out = [];
  for (const line of s.split("\n")) {
    if (!line.trim()) continue;
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    if (chatIsObj(m)) out.push(chatUnpack(m));
  }
  return out;
}

/** A message's light fields, in its key order, heavy ones as 0 (what the index keeps). */
function chatRowOf(m) {
  const row = {};
  for (const k of Object.keys(m)) row[k] = CHAT_HEAVY_SET.has(k) ? 0 : m[k];
  return row;
}

/** One part of a view, read once: its messages by id and by place. */
function chatPartOf(view, n) {
  let p = view.parts.get(n);
  if (p) return p;
  const rel = chatPartPath(view.id, n);
  const s = String(view.fsx.read(rel));
  view.raw[rel] = s;
  const msgs = chatParseLines(s);
  const byId = new Map();
  for (const m of msgs) if (chatHasId(m) && !byId.has(String(m.id))) byId.set(String(m.id), m);
  p = { msgs, byId };
  view.parts.set(n, p);
  return p;
}

/** Fill a stand-in from its part: its heavy fields, and the light ones nobody changed since the read. */
function chatFill(m) {
  const s = m[CHAT_STUB];
  if (!s) return;
  delete m[CHAT_STUB];
  let full = null;
  try {
    const p = chatPartOf(s.view, s.n);
    full = (chatHasId(m) && p.byId.get(String(m.id))) || p.msgs[s.pos] || null;
    if (full && chatHasId(m) && String(full.id) !== String(m.id)) full = null;
  } catch {}
  if (!full) {
    // the part changed or went since the read: find the message in the files as they are now
    try {
      const got = chatCollect(s.view.fsx, s.view.id, chatListed(s.view.fsx, s.view.id, chatReadMeta(s.view.fsx, s.view.id)), null);
      full = got.out.find((x) => chatHasId(x) && chatHasId(m) && String(x.id) === String(m.id)) || null;
    } catch {}
  }
  if (!full) {
    Object.defineProperty(m, CHAT_LOST, { value: true, enumerable: false, configurable: true });
    full = {};
  }
  for (const k of Object.keys(m)) {
    if (!CHAT_HEAVY_SET.has(k)) continue;
    if (k in full) Object.defineProperty(m, k, { value: full[k], writable: true, enumerable: true, configurable: true });
    else delete m[k];
  }
  for (const k of Object.keys(full)) {
    if (CHAT_HEAVY_SET.has(k)) {
      if (!(k in m)) m[k] = full[k];
    } else if (!(k in m) ? !(k in s.row) : chatSame(m[k], s.row[k])) m[k] = full[k];
  }
}

/** A stand-in for a message of part `n` at `pos`, from its index row. */
function chatStub(view, n, pos, row, len) {
  const m = {};
  for (const k of Object.keys(row)) {
    if (!CHAT_HEAVY_SET.has(k)) {
      m[k] = row[k];
      continue;
    }
    Object.defineProperty(m, k, {
      enumerable: true,
      configurable: true,
      get() {
        chatFill(m);
        return m[k];
      },
      set(v) {
        chatFill(m);
        m[k] = v;
      },
    });
  }
  Object.defineProperty(m, CHAT_STUB, { value: { view, n, pos, row, len }, enumerable: false, configurable: true });
  return m;
}

/**
 * Where a message of a closed part lies: { n, pos, rev } (its part, its place in it, the part's rev), or null for a
 * message of the tail, one made since the read, or a part without a rev. A part's messages change only with its rev,
 * so whatever is worked out from them once can be kept by (n, rev, pos).
 */
function chatOrigin(m) {
  const o = chatIsObj(m) ? m[CHAT_FROM] : null;
  return o && Number.isInteger(o.rev) ? o : null;
}

/** A stand-in nobody touched: its heavy fields unread and its light fields as the index has them. */
function chatIntact(m, id) {
  const s = chatIsObj(m) ? m[CHAT_STUB] : null;
  if (!s || s.view.id !== id) return null;
  const keys = Object.keys(m);
  const rowKeys = Object.keys(s.row);
  if (keys.length !== rowKeys.length) return null;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k !== rowKeys[i]) return null;
    if (CHAT_HEAVY_SET.has(k)) {
      const d = Object.getOwnPropertyDescriptor(m, k);
      if (!d || !d.get) return null;
    } else if (!chatSame(m[k], s.row[k])) return null;
  }
  return s;
}

/** The index of the parts, by number, when it is the one the meta lists: {n: {rev, lens, rows}}. */
function chatTrustedIndex(fsx, id, meta) {
  const parts = chatPartsOf(meta);
  if (!parts.length) return {};
  let ix = null;
  try {
    ix = JSON.parse(fsx.read(chatIndexPath(id)));
  } catch {
    return {};
  }
  if (!chatIsObj(ix) || ix.v !== 1 || !Array.isArray(ix.parts)) return {};
  const out = {};
  for (const p of parts) {
    const e = ix.parts.find((x) => chatIsObj(x) && x.n === p.n);
    if (!e || !Number.isInteger(p.rev) || e.rev !== p.rev || !Array.isArray(e.rows) || e.rows.length !== p.count) continue;
    if (!Array.isArray(e.lens) || e.lens.length !== e.rows.length || !e.rows.every(chatIsObj)) continue;
    out[p.n] = e;
  }
  return out;
}

/** The part numbers to read: the meta's, or those on disk for a meta without the record. */
function chatListed(fsx, id, meta) {
  return chatIsObj(meta) && chatIsObj(meta.transcript) ? chatPartsOf(meta).map((p) => p.n) : chatPartsOnDisk(fsx, id);
}

/** The messages of the listed parts and the tail; parts with a trusted index entry as stand-ins (`index` null: none). */
function chatCollect(fsx, id, nums, index, revs) {
  const view = { fsx, id, raw: {}, parts: new Map() };
  const from = (m, n, pos) => Object.defineProperty(m, CHAT_FROM, { value: { n, pos, rev: revs ? revs[n] : undefined }, enumerable: false, configurable: true });
  const out = [];
  const at = new Map();
  let missing = false;
  const put = (m) => {
    if (chatHasId(m)) {
      const k = String(m.id);
      // the same message in two files (a save in progress): the later file's copy, at the earlier place
      if (at.has(k)) {
        out[at.get(k)] = m;
        return;
      }
      at.set(k, out.length);
    }
    out.push(m);
  };
  for (const n of nums) {
    const e = index && index[n];
    if (e) {
      e.rows.forEach((row, pos) => put(from(chatStub(view, n, pos, row, e.lens[pos]), n, pos)));
      continue;
    }
    let p;
    try {
      p = chatPartOf(view, n);
    } catch {
      missing = true;
      continue;
    }
    p.msgs.forEach((m, pos) => put(from(m, n, pos)));
  }
  try {
    const s = String(fsx.read(chatTailPath(id)));
    view.raw[chatTailPath(id)] = s;
    for (const m of chatParseLines(s)) put(m);
  } catch {}
  return { out, view, missing };
}

/**
 * The chat's messages in order (the closed parts, then the tail), each in its full shape as far as any reader can
 * tell: a message of a part is read from its file when one of its heavy fields is first touched. Lines that do not
 * parse are left out. `meta` is the chat's meta when the caller has it (undefined: read it here).
 */
function chatMessages(fsx, id, meta) {
  let m = meta === undefined ? chatReadMeta(fsx, id) : meta;
  const revs = (x) => Object.fromEntries(chatPartsOf(x).map((p) => [p.n, p.rev]));
  let got = chatCollect(fsx, id, chatListed(fsx, id, m), chatTrustedIndex(fsx, id, m), revs(m));
  // a listed part went away: a save finished between our two reads; read again by its meta
  if (got.missing) {
    m = chatReadMeta(fsx, id);
    got = chatCollect(fsx, id, chatListed(fsx, id, m), chatTrustedIndex(fsx, id, m), revs(m));
  }
  Object.defineProperty(got.out, CHAT_READ, { value: { id, raw: got.view.raw }, enumerable: false });
  return got.out;
}

/** { meta, msgs } of a chat, or null when it has no meta. */
function chatRead(fsx, id) {
  const meta = chatReadMeta(fsx, id);
  if (!meta) return null;
  return { meta, msgs: chatMessages(fsx, id, meta) };
}

/** Which parts of a read were read from their files (for checks and measurements). */
function chatPartsRead(msgs) {
  const r = msgs && msgs[CHAT_READ];
  if (!r) return [];
  return Object.keys(r.raw)
    .map((rel) => /\/([1-9][0-9]*)\.jsonl$/.exec(rel))
    .filter(Boolean)
    .map((x) => Number(x[1]))
    .sort((a, b) => a - b);
}

/** What the chat list shows, from the messages. */
function chatSummaryOf(msgs, count) {
  const last = msgs.length ? msgs[msgs.length - 1] : null;
  return {
    count,
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
  return chatSummaryOf(msgs, msgs.length);
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
function chatPlan(prev, tailFirst, top, msgs, lenOf) {
  let total = 0;
  for (let k = 0; k < msgs.length; k++) total += lenOf(k);
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
  for (let k = at; k < msgs.length; k++) chars += lenOf(k);
  while (left > CHAT_TAIL_MAX || chars > CHAT_TAIL_CHARS) {
    let end = at;
    let c = 0;
    // at least one message to a part, at least one left in the tail
    while (end < msgs.length - 1 && end - at < CHAT_PART_MSGS && (end === at || c + lenOf(end) <= CHAT_PART_CHARS)) {
      c += lenOf(end);
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
 * Save a chat: its parts (only those whose text changed; a part none of whose stand-ins was touched is not even
 * rebuilt), the index, the tail, and the meta (its `transcript` is set here). Throws when a file cannot be written,
 * and when a message of the read could not be found in its part any more (nothing is written then).
 */
function chatSave(fsx, id, meta, msgs) {
  const read = msgs[CHAT_READ];
  const raw = read && read.id === id ? read.raw : null;
  const lines = new Array(msgs.length);
  const stubs = msgs.map((m) => chatIntact(m, id));
  const line = (k) => {
    if (lines[k] === undefined) {
      const m = msgs[k];
      if (chatIsObj(m) && m[CHAT_LOST]) throw new Error("chat " + id + " changed while it was read: a message of the read is gone from its part; nothing was saved");
      lines[k] = JSON.stringify(chatPack(m));
      if (chatIsObj(m) && m[CHAT_LOST]) throw new Error("chat " + id + " changed while it was read: a message of the read is gone from its part; nothing was saved");
    }
    return lines[k];
  };
  const lenOf = (k) => (stubs[k] ? stubs[k].len : line(k).length);
  const known = chatIsObj(meta.transcript);
  const prev = chatPartsOf(meta);
  const prevBy = new Map(prev.map((p) => [p.n, p]));
  // a meta that lost its record (rebuilt by hand) leaves parts on disk it does not name: none is kept, all go
  const onDisk = known ? prev.map((p) => p.n) : chatPartsOnDisk(fsx, id);
  const top = Math.max(0, ...prev.map((p) => p.n), ...onDisk);
  const plan = chatPlan(known ? prev : [], known ? meta.transcript.tailFirst : undefined, top, msgs, lenOf);
  // a part whose stand-ins are all there, untouched and in their place, is the file it was
  const untouched = (p) => {
    const old = prevBy.get(p.n);
    if (!p.kept || !old || old.count !== p.to - p.from || !Number.isInteger(old.rev)) return false;
    for (let k = p.from; k < p.to; k++) if (!stubs[k] || stubs[k].n !== p.n || stubs[k].pos !== k - p.from) return false;
    return true;
  };
  const same = plan.map(untouched);
  // every line that will be written is built before the first write, so a message that went missing stops the save
  const tailFrom = plan.length ? plan[plan.length - 1].to : 0;
  plan.forEach((p, i) => {
    if (!same[i]) for (let k = p.from; k < p.to; k++) line(k);
  });
  for (let k = tailFrom; k < msgs.length; k++) line(k);
  const text = (a, b) => (b > a ? lines.slice(a, b).join("\n") + "\n" : "");
  const listed = [];
  const entries = [];
  plan.forEach((p, i) => {
    const old = prevBy.get(p.n);
    let rev = old && Number.isInteger(old.rev) ? old.rev : 0;
    if (same[i]) {
      entries.push({ n: p.n, rev, lens: stubs.slice(p.from, p.to).map((s) => s.len), rows: stubs.slice(p.from, p.to).map((s) => s.row) });
    } else {
      const rel = chatPartPath(id, p.n);
      const wrote = p.kept && rev > 0 ? chatWriteIfChanged(fsx, rel, text(p.from, p.to), raw) : (fsx.write(rel, text(p.from, p.to)), true);
      if (wrote || !rev) rev++;
      entries.push({ n: p.n, rev, lens: lines.slice(p.from, p.to).map((l) => l.length), rows: msgs.slice(p.from, p.to).map(chatRowOf) });
    }
    listed.push({
      n: p.n,
      count: p.to - p.from,
      first: msgs[p.from].id,
      last: msgs[p.to - 1].id,
      user: msgs.slice(p.from, p.to).some((m) => chatIsObj(m) && m.role === "user"),
      rev,
    });
  });
  if (listed.length && !(same.every(Boolean) && listed.length === prev.length && listed.every((p, i) => p.n === prev[i].n))) {
    chatWriteIfChanged(fsx, chatIndexPath(id), JSON.stringify({ v: 1, parts: entries }), raw);
  }
  const tailFirst = tailFrom < msgs.length && chatIsObj(msgs[tailFrom]) ? msgs[tailFrom].id : undefined;
  const writeMeta = (tailSize) => {
    meta.transcript = { v: 1, ...chatSummaryOf(msgs, msgs.length), tailSize, ...(tailFirst !== undefined ? { tailFirst } : {}), parts: listed };
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

export const DEFAULT_POLISH =
  "You edit {{user}}'s next message in a roleplay before it is sent. Rewrite the draft so it reads well and can be sent as-is. " +
  "Fix spelling, grammar and punctuation. Make the prose more vivid: precise verbs, a sensory detail or two, a touch of feeling. " +
  "Keep every action, fact and spoken line of the draft, and keep its language, its person (I, he, she) and its tense. " +
  "Keep the formatting the draft and the story use, for example *actions* in asterisks and speech in quotes. " +
  "Write only for {{user}}: add no new events, do not decide how an action turns out, and never speak or act for other characters. " +
  "Keep it close to the draft's length, at most about twice as long. Output only the rewritten message, with no notes, title or quotes around it.";

const CHAT_ID = /^[A-Za-z0-9_-]{1,120}$/;
const MODEL_REF = /^[^\s]{1,200}$/;
const TEXT_MAX = 8000;
const CTX_MSGS = 6;
const CTX_MAX = 600;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v : "");
const cut = (s, n) => {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n) + "…" : t;
};
const ok = (json, status) => ({ status: status || 200, json });

function readJson(fsx, path, fallback) {
  try {
    const raw = fsx.read(path);
    if (raw == null || raw === "") return fallback;
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function chatPreset(fsx, meta) {
  let id = str(meta.presetId);
  if (!id) {
    let files = [];
    try {
      files = fsx.list("presets").filter((f) => f.endsWith(".json"));
    } catch {}
    for (const f of files) {
      const p = readJson(fsx, "presets/" + f, null);
      if (isObj(p) && isObj(p.studio) && p.studio.isDefault === true) {
        id = f.slice(0, -5);
        break;
      }
    }
  }
  id = id || "default";
  if (/[\\/]|^\.\.?$/.test(id)) return null;
  const preset = readJson(fsx, "presets/" + id + ".json", null);
  return isObj(preset) ? { ...preset, id: str(preset.id) || id } : null;
}

// ---------- the preset's own macros (#237) ----------
// COPY of plugins/engine/plugin.js (presetVariables ... expandIfBlocks): a plugin cannot import a sibling, and
// Polish must read the chat's picks the way the chat does. test/rp-polish-macros.test.ts checks the copy agrees
// with the engine; change both together.
const BUILTIN_MACROS = new Set(["user", "char", "persona", "description", "personality", "scenario", "time", "isotime", "date",
  "isodate", "weekday", "lastmessage", "lastusermessage", "lastcharmessage", "idle_duration", "summary", "words", "limit", "trim", "newline"]);

/** A preset's declared variables (studio bag) that have a usable name. */
function presetVariables(preset) {
  const list = preset && preset.studio && Array.isArray(preset.studio.variables) ? preset.studio.variables : [];
  return list.filter((v) => v && typeof v.name === "string" && /^[\w.-]+$/.test(v.name.trim()));
}

/** The options of a choice-like variable as {id, label, value}; null for free-form types.
 *  Older dropdown/multi variables list plain strings: each is its own id, label and value. */
function variableChoices(v) {
  if (v.type === "choice") {
    return (Array.isArray(v.choices) ? v.choices : [])
      .filter((c) => c && typeof c.id === "string" && c.id)
      .map((c) => ({ id: c.id, label: String(c.label || c.value || ""), value: String(c.value ?? "") }));
  }
  if (v.type === "dropdown" || v.type === "multi") {
    return (Array.isArray(v.options) ? v.options : []).map(String).filter(Boolean).map((o) => ({ id: o, label: o, value: o }));
  }
  return null;
}

const isMultiVar = (v) => v.type === "multi" || (v.type === "choice" && v.multi === true);

/** The choice ids a variable starts with: its defaults, else the first option of a single choice. */
function defaultPicks(v, choices) {
  const raw = v.type === "choice"
    ? (Array.isArray(v.defaults) ? v.defaults.map(String) : [])
    : (isMultiVar(v) ? String(v.defaultValue ?? "").split(",") : [String(v.defaultValue ?? "")]).map((x) => x.trim());
  const ids = raw.filter((id) => choices.some((c) => c.id === id));
  if (isMultiVar(v)) return ids;
  return ids.length ? ids.slice(0, 1) : choices.length ? [choices[0].id] : [];
}

/**
 * Every preset variable's value for one chat, by name: { value, picks }. picks lists the chosen
 * options of a choice-like variable ({id, label, value}), null for the others. The chat's picks
 * live in meta.presetVars[presetId]; a missing name, or only ids the preset no longer has, fall
 * back to the preset's defaults, so an edited preset never breaks a chat. `override` replaces
 * stored picks by name (an empty array = nothing picked).
 */
function resolvePresetVars(preset, meta, override) {
  const out = {};
  const pid = preset && preset.id ? String(preset.id) : "";
  const bag = pid && meta && meta.presetVars && typeof meta.presetVars === "object" ? meta.presetVars[pid] : null;
  const stored = { ...(bag && typeof bag === "object" ? bag : {}), ...(override || {}) };
  for (const v of presetVariables(preset)) {
    const name = v.name.trim();
    const has = Object.prototype.hasOwnProperty.call(stored, name) && stored[name] != null;
    const raw = has ? stored[name] : undefined;
    const choices = variableChoices(v);
    if (choices) {
      const asked = has ? (Array.isArray(raw) ? raw : [raw]).map(String) : null;
      let ids = asked ? asked.filter((id) => choices.some((c) => c.id === id)) : null;
      if (!ids || (!ids.length && asked.length)) ids = defaultPicks(v, choices);
      if (!isMultiVar(v)) ids = ids.slice(0, 1);
      const picks = ids.map((id) => choices.find((c) => c.id === id));
      out[name] = { value: picks.map((c) => c.value).join(typeof v.separator === "string" ? v.separator : ", "), picks };
    } else {
      out[name] = { value: has ? (Array.isArray(raw) ? raw.join(", ") : String(raw)) : String(v.defaultValue ?? ""), picks: null };
    }
  }
  return out;
}

/** A preset variable by name, exact first, then ignoring case. */
function presetVarOf(pv, name) {
  if (!pv) return null;
  const k = String(name).trim();
  if (Object.prototype.hasOwnProperty.call(pv, k)) return pv[k];
  const lk = k.toLowerCase();
  const f = Object.keys(pv).find((x) => x.toLowerCase() === lk);
  return f ? pv[f] : null;
}


// ---------- {{#if}} blocks ----------
const DQ = "\"“”„«»";
const SQ = "'‘’";

function condTokens(src) {
  const raw = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const cls = DQ.includes(ch) ? DQ : SQ.includes(ch) ? SQ : null;
    if (cls) {
      let j = i + 1;
      while (j < src.length && !cls.includes(src[j])) j++;
      raw.push({ t: "lit", v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "||" || two === "&&" || two === "==" || two === "!=") { raw.push({ t: two }); i += 2; continue; }
    if (ch === "(" || ch === ")" || ch === "!") { raw.push({ t: ch }); i++; continue; }
    if (ch === "=") { raw.push({ t: "==" }); i++; continue; }
    const m = /^[^\s()!=|&"'“”„«»‘’]+/.exec(src.slice(i));
    if (!m) { i++; continue; }
    const w = m[0].toLowerCase();
    if (w === "contains" || w === "includes") raw.push({ t: "contains" });
    else if (w === "and") raw.push({ t: "&&" });
    else if (w === "or") raw.push({ t: "||" });
    else if (w === "is") raw.push({ t: "==" });
    else if (w === "not") raw.push({ t: "not" });
    else raw.push({ t: "name", v: m[0] });
    i += m[0].length;
  }
  // "is not" / "not contains" fold into one operator; a lone "not" is "!"
  const out = [];
  for (let k = 0; k < raw.length; k++) {
    const a = raw[k], b = raw[k + 1];
    if (a.t === "==" && b && b.t === "not") { out.push({ t: "!=" }); k++; }
    else if (a.t === "not" && b && b.t === "contains") { out.push({ t: "!contains" }); k++; }
    else out.push(a.t === "not" ? { t: "!" } : a);
  }
  return out;
}

/**
 * One {{#if}} condition. Operands are names (lookup(name) -> {value, picks} | undefined) or quoted
 * literals; ==, !=, contains, not contains; ||, &&, !, parens; `a == "x" || "y"` repeats the last
 * comparison. A lone name is true when set and not false/0/no/off. Comparisons trim and ignore
 * case; a choice also matches by its label, and `contains` on a choice checks the picks.
 * Bad syntax is false.
 */
function evalIfCondition(src, lookup) {
  const tk = condTokens(String(src || ""));
  let p = 0;
  let last = null;
  const norm = (s) => String(s ?? "").trim().toLowerCase();
  const peek = () => tk[p];
  const operand = () => {
    const t = tk[p];
    if (!t || (t.t !== "lit" && t.t !== "name")) return null;
    p++;
    return t;
  };
  // a name nobody defines reads as its own text on the right of a comparison, as empty elsewhere
  const valueOf = (t, right) => {
    if (t.t === "lit") return { value: t.v, picks: null };
    return lookup(t.v) || { value: right ? t.v : "", picks: null };
  };
  const truthy = (v) => { const s = norm(v.value); return s !== "" && !["false", "0", "no", "off"].includes(s); };
  const compare = (left, op, rightRaw) => {
    const r = norm(rightRaw);
    const picks = left.picks;
    const eq = norm(left.value) === r || (!!picks && picks.length === 1 && (norm(picks[0].label) === r || norm(picks[0].value) === r));
    const has = picks ? picks.some((c) => norm(c.value) === r || norm(c.label) === r) : norm(left.value).includes(r);
    if (op === "==") return eq;
    if (op === "!=") return !eq;
    if (op === "contains") return has;
    return !has;
  };
  const primary = () => {
    const t = peek();
    if (!t) throw new Error("end");
    if (t.t === "(") {
      p++;
      const v = orExpr();
      if (!peek() || peek().t !== ")") throw new Error("paren");
      p++;
      return v;
    }
    const a = operand();
    if (!a) throw new Error("operand");
    const op = peek() && ["==", "!=", "contains", "!contains"].includes(peek().t) ? tk[p++].t : null;
    if (op) {
      const b = operand();
      if (!b) throw new Error("operand");
      const left = valueOf(a, false);
      last = { left, op };
      return compare(left, op, valueOf(b, true).value);
    }
    if (a.t === "lit" && last) return compare(last.left, last.op, a.v);
    return truthy(valueOf(a, false));
  };
  const unary = () => {
    if (peek() && peek().t === "!") { p++; return !unary(); }
    return primary();
  };
  const andExpr = () => {
    let v = unary();
    while (peek() && peek().t === "&&") { p++; const r = unary(); v = v && r; }
    return v;
  };
  function orExpr() {
    let v = andExpr();
    while (peek() && peek().t === "||") { p++; const r = andExpr(); v = v || r; }
    return v;
  }
  try {
    const v = orExpr();
    return p === tk.length ? v : false;
  } catch {
    return false;
  }
}

/** {{#if}}…{{else if}}…{{else}}…{{/if}}, nested, innermost first. A block standing on its own
 *  lines that renders nothing takes its line with it; a stray {{/if}} is dropped. */
function expandIfBlocks(text, lookup) {
  let out = String(text);
  if (!/\{\{\s*#if\s/i.test(out)) return out;
  for (let guard = 0; guard < 2000; guard++) {
    const close = /\{\{\s*\/if\s*\}\}/i.exec(out);
    if (!close) break;
    // the first {{/if}} closes the nearest {{#if}} before it
    let open = null;
    const re = /\{\{\s*#if\s+([\s\S]*?)\}\}/gi;
    for (let m = re.exec(out); m && m.index < close.index; m = re.exec(out)) open = m;
    if (!open) {
      out = out.slice(0, close.index) + out.slice(close.index + close[0].length);
      continue;
    }
    const body = out.slice(open.index + open[0].length, close.index);
    const branches = [];
    const sep = /\{\{\s*else(?:\s+if\s+([\s\S]*?))?\s*\}\}/gi;
    let cond = open[1];
    let from = 0;
    for (let s = sep.exec(body); s; s = sep.exec(body)) {
      branches.push({ cond, text: body.slice(from, s.index) });
      cond = s[1] === undefined ? null : s[1];
      from = s.index + s[0].length;
    }
    branches.push({ cond, text: body.slice(from) });
    const hit = branches.find((b) => b.cond === null || evalIfCondition(b.cond, lookup));
    const chosen = hit ? hit.text.replace(/^[ \t]*\r?\n/, "").replace(/\r?\n[ \t]*$/, "") : "";
    let start = open.index;
    let end = close.index + close[0].length;
    if (!chosen) {
      const lineStart = out.lastIndexOf("\n", start - 1) + 1;
      const nl = /^[ \t]*\r?\n/.exec(out.slice(end));
      if (!out.slice(lineStart, start).trim() && nl) { start = lineStart; end += nl[0].length; }
    }
    out = out.slice(0, start) + chosen + out.slice(end);
  }
  return out;
}

// ---------- end of the copy ----------

/** The Polish prompt with the chat's preset picks expanded the way the preset's sections are: {{#if}}, {{name}},
 *  {{var:name}}, {{getvar::name}} (the chat's variables first). {{user}} stays for the caller. */
export function expandPolish(text, preset, meta) {
  const m = isObj(meta) ? meta : {};
  const pv = resolvePresetVars(preset, m);
  const chatVars = isObj(m.chatVars) ? m.chatVars : {};
  const lookup = (name) => {
    const ln = String(name).toLowerCase();
    if (ln === "user" || ln === "char") return undefined;
    const v = presetVarOf(pv, name);
    if (v) return v;
    if (chatVars[name] != null) return { value: String(chatVars[name]), picks: null };
    return undefined;
  };
  let out = String(text || "");
  if (out.indexOf("{{") < 0) return out;
  out = expandIfBlocks(out, lookup);
  out = out.replace(/\{\{var::?([\w.-]+)\}\}/gi, (_, n) => { const v = presetVarOf(pv, n); return v ? v.value : ""; });
  out = out.replace(/\{\{([\w.-]+)\}\}/g, (all, n) => {
    if (BUILTIN_MACROS.has(n.toLowerCase())) return all;
    const v = presetVarOf(pv, n);
    return v ? v.value : all;
  });
  out = out.replace(/\{\{getvar::([^}]+)\}\}/gi, (_, n) => {
    const v = chatVars[n.trim()];
    if (v == null) { const p = presetVarOf(pv, n); return p ? p.value : ""; }
    return String(v);
  });
  return out;
}

export function polishTemplate(preset) {
  if (!isObj(preset)) return DEFAULT_POLISH;
  const bag = isObj(preset.studio) ? preset.studio.utilityPrompts : null;
  const top = preset.utilityPrompts;
  const t = str(isObj(bag) && bag.polish) || str(isObj(top) && top.polish);
  return t.trim() || DEFAULT_POLISH;
}

function userNameOf(fsx, meta) {
  if (str(meta.userName)) return str(meta.userName);
  if (meta.personaId && CHAT_ID.test(String(meta.personaId))) {
    const persona = readJson(fsx, "personas/" + meta.personaId + ".json", null);
    if (isObj(persona) && str(persona.name)) return str(persona.name);
  }
  return "";
}

function cardNames(fsx, meta) {
  let ids = [];
  if (typeof meta.groupId === "string" && meta.groupId) {
    const g = readJson(fsx, "groups/" + meta.groupId + ".json", null);
    if (isObj(g) && Array.isArray(g.memberIds)) ids = g.memberIds;
  } else if (typeof meta.characterId === "string" && meta.characterId) {
    ids = [meta.characterId];
  }
  const names = [];
  for (const id of ids) {
    if (typeof id !== "string" || !CHAT_ID.test(id)) continue;
    const card = readJson(fsx, "characters/" + id + "/card.json", null);
    const name = isObj(card) ? str(card.name) || (isObj(card.data) ? str(card.data.name) : "") : "";
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** The last few messages, so the polish keeps the story's tense, names and style. */
function recentContext(fsx, chatId) {
  const out = [];
  // the newest lines of the whole chat: a long one keeps its older messages in parts (chat-store.js)
  for (const m of chatMessages(fsx, chatId).slice(-CTX_MSGS)) {
    if (!isObj(m) || m.hidden === true || m.role === "system") continue;
    const text = str(m.text || m.mes);
    if (!text.trim()) continue;
    const who = m.role === "user" ? "player" : str(m.name) || "story";
    out.push(who + ": " + cut(text.replace(/\s+/g, " ").trim(), CTX_MAX));
  }
  return out.join("\n");
}

/** The page's model → the chat's saved model → the app default; "" lets the engine choose. */
function polishModel(fsx, meta, asked) {
  const settings = readJson(fsx, "settings.json", null);
  for (const m of [asked, str(meta.model), isObj(settings) ? str(settings.model) : ""]) {
    if (m && MODEL_REF.test(m)) return m;
  }
  return "";
}

/** The model's reply without reasoning, fences or a "Here is…" lead-in. */
export function cleanPolish(text) {
  let t = String(text || "")
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "")
    .trim();
  const fence = t.match(/^```[\w-]*\s*\n?([\s\S]*?)\n?```$/);
  if (fence) t = fence[1].trim();
  t = t
    .replace(/^(?:polished|rewritten|edited|improved) (?:message|draft|text|version)\s*:\s*/i, "")
    .replace(/^here(?:'s| is) (?:the |your )?(?:polished|rewritten|edited|improved) (?:message|draft|text|version)\s*:\s*/i, "")
    .trim();
  return t;
}

function polishRoute(req, host, chatId) {
  const fsx = host.fs;
  if (!CHAT_ID.test(chatId)) return ok({ error: "no such chat" }, 404);
  const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
  if (!isObj(meta)) return ok({ error: "no such chat" }, 404);
  const b = isObj(req.body) ? req.body : {};
  const text = str(b.text);
  if (!text.trim()) return ok({ error: "The draft is empty." }, 400);
  if (text.length > TEXT_MAX) return ok({ error: "The draft is too long to polish." }, 400);

  // second pass: the model's reply is waiting
  const r = host.llm && host.llm.results ? host.llm.results.polish : null;
  if (r) {
    if (r.error) {
      const msg = str(r.error.message) || str(r.error) || "The model call failed.";
      return ok({ error: cut(msg, 300) }, 502);
    }
    const cleaned = cleanPolish(r.text);
    if (!cleaned) return ok({ error: "The model returned an empty answer. Try again, or pick another model for this chat." }, 502);
    return ok({ text: cleaned, model: str(r.model) });
  }

  // first pass: ask the model
  const preset = chatPreset(fsx, meta);
  const userName = userNameOf(fsx, meta) || "User";
  // the chat's preset picks reach Polish too: a picked narrator, language or POV (#237)
  const system = expandPolish(polishTemplate(preset), preset, meta).split("{{user}}").join(userName);
  const names = cardNames(fsx, meta);
  const context = recentContext(fsx, chatId);
  const content =
    (names.length ? "Characters in this chat: " + names.join(", ") + ".\n" : "") +
    (context ? "Recent story, for its tense, names and style (do not rewrite it):\n" + context + "\n\n" : "") +
    "Draft to rewrite:\n" +
    text;
  const model = polishModel(fsx, meta, str(b.model));
  // room for a longer rewrite and for a reasoning model's thinking
  const maxTokens = Math.min(4000, Math.max(1000, text.length * 3 + 600));
  host.llm.request("polish", {
    ...(model ? { model } : {}),
    systemPrompt: system,
    messages: [{ role: "user", content }],
    presetParams: { temperature: 0.7, max_tokens: maxTokens },
  });
  return { __llmPending: true };
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (req.method === "POST" && path.startsWith("/polish/chats/")) {
    return polishRoute(req, host, decodeURIComponent(path.slice("/polish/chats/".length)));
  }
  return null;
}
