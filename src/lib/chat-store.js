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

export const CHAT_TAIL_MAX = 200;
export const CHAT_PART_MSGS = 100;
// JS characters of lines: at most about three bytes each, so a part stays well under the engine's 4 MB write cap
export const CHAT_PART_CHARS = 600000;
export const CHAT_TAIL_CHARS = 900000;

export const chatTailPath = (id) => "chats/" + id + ".jsonl";
export const chatMetaPath = (id) => "chats/" + id + ".meta.json";
export const chatPartsDir = (id) => "chats/" + id + ".parts";
export const chatPartPath = (id, n) => chatPartsDir(id) + "/" + n + ".jsonl";

const chatIsObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const chatHasId = (m) => m.id !== undefined && m.id !== null && m.id !== "";
// what a read leaves on its array (not enumerable, so it never reaches JSON): the file texts it read, so a save of the
// same array rewrites only the files whose text changed without reading them again
const CHAT_READ = "__chatRead";

/** A message as it is kept on disk: the chosen text once. `m` is not changed. */
export function chatPack(m) {
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
export function chatUnpack(m) {
  if (!chatIsObj(m) || typeof m.text !== "string" || !Number.isInteger(m.swipe)) return m;
  if (!Array.isArray(m.swipes)) {
    if (m.swipe === 0) m.swipes = [m.text];
  } else if (m.swipes[m.swipe] === null) m.swipes[m.swipe] = m.text;
  return m;
}

/** The parts the meta lists: [{n, count, last, user}]. */
export function chatPartsOf(meta) {
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
export function chatMessages(fsx, id, meta) {
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
export function chatRead(fsx, id) {
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
export function chatSummary(fsx, id, meta, tailSize) {
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
export function chatSave(fsx, id, meta, msgs) {
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
export function chatRemove(fsx, id) {
  try {
    fsx.remove(chatTailPath(id));
  } catch {}
  try {
    fsx.remove(chatPartsDir(id));
  } catch {}
}
