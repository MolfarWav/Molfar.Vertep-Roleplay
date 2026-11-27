/**
 * Direction for group chats (Molfar.Vertep #496, phase 1).
 *
 * The duo the phase 0 bench settled (engine repo .fork/handoff/direction/RESULTS.md): a model reports the scene (its kind and
 * which members are in it), code decides what follows. After each reply the client calls /direction/run; one small director
 * call reads the newest pair of messages with its own log of the last turns and answers { tag, present, sceneNew }. Code maps
 * the names to members, applies the precedence of `alone_moment`, and keeps the report tied to the reply it read
 * (`<msgId>#<swipe>`), so a swipe or a delete takes it back.
 *
 * The engine plugin reads this plugin's state file to decide who may answer and whose card is whole (it has its own reader,
 * `directionScene`: plugins do not import each other). This file's `llmRequest` adds two lines to a reply: the lock ("only X is
 * here") while the player holds the scene, and once, after the lock is released, the return of the others.
 *
 * Routes (under /v1/apps/roleplay/):
 *  GET  /direction/state?chatId=      { config, chat: { on, lock, returning }, scene, report, members, log }
 *  GET  /direction/config             { config }
 *  PUT  /direction/config {model}     the director's model, one for every chat ("" = none: the director does not run)
 *  PUT  /direction/chat {chatId, on?, lock?: { ids } | null}   this chat's switch and lock; releasing a lock sets the return
 *  POST /direction/run {chatId, force?}   one director call for the newest reply. { ok, report } | { ok:false, reason }
 *       reason: not-group | off | no-model | no-reply | done | bad-reply | error | no-chat
 *  Phase 2 (genre rules):
 *  PUT  /direction/rules {chatId, set?, on?, rule?: { id, on?, need?, cooldown?, k?, m? }}   the chat's genre set, its switch, edits
 *  POST /direction/fire {chatId, rule}   "Fire now": the rule's note rides the next reply (no roll, no cooldown, no tension)
 *  POST /direction/skip {chatId}         drop the queued note
 *  Phase 3 (beat plan):
 *  PUT  /direction/plan {chatId, beats: [{ id?, text, who, when, wait, skipped }]}   the whole list; { plan: { beats } }
 *  POST /direction/fire {chatId, beat}   also takes a beat id: "Fire now" for a beat
 *  GET  /direction/state also returns plan: { beats: [{ id, text, who, when, wait, tries, status, left?, hold?, result? }], ... }
 *       status: waiting | due | queued | delivered | skipped | failed | behind
 *
 * The plan: ordered beats the player wrote (text, who, when: after N replies / a scene kind / a place / by hand). The first unfinished
 * beat is looked at after each report; when due it waits up to 6 replies for a scene boundary, then goes as a queued `next` of kind
 * "beat" through the same ledger, note and judgement as a rule (a beat is decided before the rules; one note per reply).
 *
 * Genre rules: decided once per reported reply, by code: the rule's conditions over the director's reports, the cooldown, the
 * payoff silence, then 2d6. A decision is a queued `next` (the engine counts who comes as present for that reply); the reply
 * after it carries the note; the director's report of that reply says whether they came, were only mentioned, or it missed.
 *
 * Files (fs root = the app's data/):
 *  direction/config.json              { v: 1, model }
 *  direction/state/<chatId>.json      { v: 1, chatId, on, lock: { ids, at } | null, returning: { ids, after, at } | null,
 *    reports: [{ key, at, tag, present: [member id], sceneNew, model, ms, usage? }], log: [{ at, key?, kind, ... }],
 *    usage: { input, output, runs },
 *    rules: { set, on, edits: { <ruleId>: { on?, need?, cooldown?, k?, m? } } },
 *    next: { id, rule, kind, who, with, after, forced, at } | null,   the note for the first reply after `after`
 *    fires: [{ id, rule, kind, who, with, after, n, roll, tension, hold, payoff, result, carrier, forced, why, at }],   a beat's rule is "beat:<id>"
 *    plan: { beats: [{ id, text, who, when: { kind, n | tag | place }, wait, skipped, skipN, addedN, dueKey, dueN, dueWhy }] } }
 */

/** The scene kinds every chat's director offers (the school-flavoured list of phases 1 to 3). */
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

export const BASE_TAGS = ["lesson", "break", "lunch", "club", "commute", "group_out", "date", "alone_moment", "at_home", "event"];
/** Kinds a genre set adds to the list the director offers (phase 4); a chat with no set, or the rom-com set, offers none of them. */
export const EXTRA_TAGS = ["work", "meal", "downtime", "argument", "travel", "danger", "investigation", "secret", "night"];
export const TAGS = [...BASE_TAGS, ...EXTRA_TAGS];
/** Alone with one member, these kinds become `alone_moment` (the bench: models ignore the rule, code applies it). */
const ALONE_WINS = ["commute", "break", "lunch", "club"];
export const DEFAULT_CONFIG = { model: "" };
const REPORTS_KEEP = 30;
const LOG_KEEP = 30;
const LOG_LINES = 8;
const PREV_CHARS = 1500;
const NEW_CHARS = 6000;
const MAX_TOKENS = 600;
const RETRY_TOKENS = 3000;
const ID = /^[A-Za-z0-9_-]{1,120}$/;
const MODEL_REF = /^\S{1,200}$/;
const OPS = ["send", "next", "swipe"];

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
export const keyOf = (m) => m.id + "#" + (Number.isFinite(m.swipe) ? m.swipe : 0);
const isReply = (m) => isObj(m) && m.role === "char" && !m.greeting && !m.picture;
const idList = (v) => [...new Set(arr(v).filter((x) => typeof x === "string" && ID.test(x)))].slice(0, 40);

export function cleanConfig(raw) {
  const r = isObj(raw) ? raw : {};
  const model = str(r.model);
  return { model: MODEL_REF.test(model) ? model : "" };
}

export function emptyState(chatId) {
  return { v: 1, chatId, on: null, lock: null, returning: null, reports: [], log: [], usage: { input: 0, output: 0, runs: 0 }, rules: { set: "", on: false, edits: {} }, next: null, fires: [], plan: { beats: [] } };
}

// ---------- genre rules (phase 2) ----------
const FIRES_KEEP = 40;
/** What a queued note is: a rule's interrupt / join / return, or a beat of the plan (phase 3). */
export const KINDS = ["interrupt", "join", "return", "beat"];
/** `sent`: a beat with nobody to look for (an event only) went into a reply; there is nothing to judge it by. */
export const RESULTS = ["came", "mentioned", "missed", "yielded", "sent"];
const NEED_MIN = 2;
const NEED_MAX = 13; // 13 = never (2d6 tops out at 12)

/**
 * The built-in genre sets. A rule = `when` (a closed list of conditions over the director's reports: tag, tagNot, min / max
 * present, alone = the same single member alone with the player for N replies, empty = nobody present for N replies) + `do`
 * (interrupt: someone walks in on the moment; join: someone joins the group; return: someone away comes back) + the chance
 * (2d6 total at least `need`) + the cooldown (replies) + the payoff (every K-th firing the rule stays quiet M replies more).
 * The numbers are first guesses, to be tuned in play (design note section 6).
 */
export const SETS = {
  romcom: {
    name: "School rom-com",
    rules: [
      { id: "interrupted", name: "Interrupted moment", when: { alone: 3 }, do: { kind: "interrupt", count: 1 }, need: 8, cooldown: 5, payoff: { k: 3, m: 4 } },
      { id: "nobody", name: "Someone comes by", when: { empty: 3, tagNot: ["at_home"] }, do: { kind: "return", count: 1 }, need: 7, cooldown: 4, payoff: null },
      { id: "crowd", name: "Friends join the break", when: { tag: ["break", "lunch", "club"], max: 2 }, do: { kind: "join", count: 1 }, need: 9, cooldown: 6, payoff: null },
    ],
  },
};
/** A rule of a built-in set: the numbers are first guesses, tuned in play. */
const R = (id, name, when, kind, need, cooldown, payoff = null) => ({ id, name, when, do: { kind, count: 1 }, need, cooldown, payoff });
/** A beat template of a set: text only (names are the player's to add), a condition and the wait. */
const T = (id, text, when = { kind: "replies", n: 6 }, wait = true) => ({ id, text, when, wait });

SETS.romcom.tags = [];
SETS.romcom.templates = [
  T("festival", "The school festival is announced, and the class has to decide what to do for it.", { kind: "replies", n: 8 }),
  T("confession", "Someone is about to say something they have kept to themselves for a long time."),
  T("rumour", "A rumour about the two of them starts going around the school.", { kind: "replies", n: 10 }),
];
SETS.harem = {
  name: "Harem",
  tags: ["meal", "downtime", "argument"],
  rules: [
    R("cutin", "Someone cuts in", { alone: 2 }, "interrupt", 8, 4, { k: 3, m: 3 }),
    R("gather", "Everyone gathers", { tag: ["meal", "group_out", "event"], max: 2 }, "join", 8, 5),
    R("leftout", "Left out", { empty: 2 }, "return", 7, 4),
  ],
  templates: [
    T("jealous", "One of them notices how close the others have got, and cannot hide it."),
    T("gift", "Someone brings a small gift and is a little too eager about it.", { kind: "replies", n: 8 }),
    T("rivalry", "A friendly contest between two of them turns out to matter more than either admits.", { kind: "tag", tag: "argument" }, false),
  ],
};
SETS.slice = {
  name: "Slice of life",
  tags: ["work", "meal", "downtime"],
  rules: [
    R("drop", "A neighbour drops by", { tag: ["at_home", "downtime", "meal"], max: 2 }, "join", 9, 6),
    R("home", "Someone comes home", { empty: 3 }, "return", 7, 5),
    R("quiet", "A quiet interruption", { alone: 4 }, "interrupt", 10, 8),
  ],
  templates: [
    T("errand", "A small errand comes up that needs more than one pair of hands.", { kind: "replies", n: 5 }),
    T("weather", "The weather turns, and plans for the day have to change.", { kind: "replies", n: 8 }),
    T("memory", "Something ordinary brings back a memory one of them has not shared before.", { kind: "tag", tag: "downtime" }),
  ],
};
SETS.drama = {
  name: "Drama",
  tags: ["argument", "secret", "night"],
  rules: [
    R("worst", "At the worst moment", { alone: 3 }, "interrupt", 8, 5, { k: 3, m: 4 }),
    R("overheard", "Someone overhears", { tag: ["argument", "secret"], max: 2 }, "join", 8, 5),
    R("return", "The absent one returns", { empty: 3 }, "return", 7, 5),
  ],
  templates: [
    T("truth", "A truth that has been avoided comes up, and nobody can leave it alone.", { kind: "tag", tag: "argument" }, false),
    T("letter", "A message arrives that changes what one of them thought they knew.", { kind: "replies", n: 8 }),
    T("choice", "Someone has to choose between two people they care about.", { kind: "replies", n: 14 }),
  ],
};
SETS.thriller = {
  name: "Thriller",
  tags: ["danger", "secret", "night"],
  rules: [
    R("ally", "An ally arrives", { tag: ["danger"], max: 2 }, "join", 8, 5),
    R("followed", "Someone is watching", { alone: 3 }, "interrupt", 9, 6, { k: 3, m: 4 }),
    R("back", "Back from the dark", { empty: 3 }, "return", 7, 5),
  ],
  templates: [
    T("clock", "Word comes that they have less time than they thought.", { kind: "replies", n: 6 }),
    T("betrayal", "One of the people they trust has been acting against them.", { kind: "replies", n: 14 }),
    T("escape", "They have to leave this place now, and quietly.", { kind: "tag", tag: "danger" }, false),
  ],
};
SETS.detective = {
  name: "Detective",
  tags: ["investigation", "work", "secret"],
  rules: [
    R("witness", "A witness turns up", { tag: ["investigation"], max: 2 }, "join", 8, 5),
    R("lead", "A lead walks in", { alone: 3 }, "interrupt", 9, 6),
    R("field", "Back from the field", { empty: 3 }, "return", 7, 5),
  ],
  templates: [
    T("clue", "A detail that did not matter before starts to look like the key.", { kind: "replies", n: 6 }),
    T("alibi", "Someone's account of that night does not hold together.", { kind: "tag", tag: "investigation" }),
    T("warning", "A warning is left for them: stop looking.", { kind: "replies", n: 12 }),
  ],
};
SETS.steamy = {
  name: "Steamy romance",
  tags: ["night", "secret", "downtime"],
  rules: [
    R("knock", "A knock at the door", { alone: 3 }, "interrupt", 8, 5, { k: 3, m: 5 }),
    R("early", "Someone comes home early", { tag: ["at_home", "night"], max: 2 }, "interrupt", 9, 7),
    R("wonder", "Left to wonder", { empty: 3 }, "return", 7, 5),
  ],
  templates: [
    T("slow", "A moment of quiet between two of them lasts a little longer than it should.", { kind: "tag", tag: "alone_moment" }, false),
    T("closer", "Something small forces them to stand closer than they meant to.", { kind: "replies", n: 6 }),
    T("tension", "An unspoken thing between two of them becomes impossible to ignore.", { kind: "replies", n: 12 }),
  ],
};
SETS.adventure = {
  name: "Adventure",
  tags: ["travel", "danger", "night"],
  rules: [
    R("companion", "A companion catches up", { tag: ["travel"], max: 2 }, "join", 8, 5),
    R("trouble", "Trouble on the road", { alone: 3 }, "interrupt", 9, 6),
    R("camp", "Back at camp", { empty: 3 }, "return", 7, 5),
  ],
  templates: [
    T("crossroads", "The road splits, and nobody agrees which way is safer.", { kind: "tag", tag: "travel" }),
    T("stranger", "A stranger offers help that comes with a price.", { kind: "replies", n: 8 }),
    T("storm", "Bad weather closes in and they need shelter.", { kind: "replies", n: 12 }),
  ],
};
SETS.horror = {
  name: "Horror",
  tags: ["danger", "night", "secret"],
  rules: [
    R("room", "Something is in the room", { alone: 3 }, "interrupt", 9, 6, { k: 3, m: 4 }),
    R("apart", "Someone is missing", { empty: 3 }, "return", 7, 5),
    R("noise", "A noise from the dark", { tag: ["night", "danger"], max: 2 }, "join", 8, 5),
  ],
  templates: [
    T("wrong", "Something about this place is slightly wrong, and one of them has noticed.", { kind: "replies", n: 6 }),
    T("light", "The lights fail, and for a moment nobody can see anything.", { kind: "tag", tag: "night" }, false),
    T("gone", "One of them is not where they were a moment ago.", { kind: "replies", n: 14 }),
  ],
};

/** Who a rule may bring (phase 3b): the group's members, people of the chat's World, or either. */
export const FROMS = ["members", "world", "any"];
/** A World record's id (a person on its bench). */
const NPC_ID = /^n\d{1,6}$/;
const npcList = (v) => [...new Set(arr(v).filter((x) => typeof x === "string" && NPC_ID.test(x)))].slice(0, 8);
const clampInt = (v, lo, hi, dflt) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : dflt);

export function cleanRules(raw) {
  const r = isObj(raw) ? raw : {};
  const set = typeof r.set === "string" && SETS[r.set] ? r.set : "";
  const edits = {};
  for (const [id, e] of Object.entries(isObj(r.edits) ? r.edits : {})) {
    if (!ID.test(id) || !isObj(e)) continue;
    const out = {};
    if (typeof e.on === "boolean") out.on = e.on;
    if (e.need !== undefined) out.need = clampInt(e.need, NEED_MIN, NEED_MAX, undefined);
    if (e.cooldown !== undefined) out.cooldown = clampInt(e.cooldown, 0, 30, undefined);
    if (e.k !== undefined) out.k = clampInt(e.k, 0, 10, undefined);
    if (e.m !== undefined) out.m = clampInt(e.m, 0, 20, undefined);
    if (FROMS.includes(e.from)) out.from = e.from;
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    if (Object.keys(out).length) edits[id] = out;
  }
  return { set, on: set ? r.on === true : false, edits };
}

/** The set's rules with the chat's edits applied: [{ ...rule, on, need, cooldown, payoff }]. */
export function activeRules(rules) {
  const set = SETS[rules.set];
  if (!set) return [];
  return set.rules.map((d) => {
    const e = rules.edits[d.id] || {};
    const k = e.k !== undefined ? e.k : d.payoff ? d.payoff.k : 0;
    const m = e.m !== undefined ? e.m : d.payoff ? d.payoff.m : 0;
    return { ...d, defaults: { need: d.need, cooldown: d.cooldown, k: d.payoff ? d.payoff.k : 0, m: d.payoff ? d.payoff.m : 0, from: "members" }, from: e.from || "members", on: e.on !== false, need: e.need !== undefined ? e.need : d.need, cooldown: e.cooldown !== undefined ? e.cooldown : d.cooldown, payoff: k > 0 && m > 0 ? { k, m } : null };
  });
}

const refList = (v) => [...new Set(arr(v).filter((x) => typeof x === "string" && ID.test(x)))].slice(0, 8);
function cleanRoll(r) {
  return isObj(r) && Number.isFinite(r.d1) && Number.isFinite(r.d2) ? { d1: clampInt(r.d1, 1, 6, 1), d2: clampInt(r.d2, 1, 6, 1), total: clampInt(r.total, 2, 12, 2), need: clampInt(r.need, NEED_MIN, NEED_MAX, 8) } : null;
}
function cleanFire(raw) {
  if (!isObj(raw) || !str(raw.id) || !str(raw.rule) || !KINDS.includes(raw.kind) || !str(raw.after)) return null;
  return {
    id: str(raw.id).slice(0, 60),
    rule: str(raw.rule).slice(0, 60),
    kind: raw.kind,
    who: refList(raw.who),
    npc: npcList(raw.npc),
    with: refList(raw.with),
    after: str(raw.after),
    n: Math.max(0, Math.round(Number(raw.n) || 0)),
    roll: cleanRoll(raw.roll),
    tension: Math.max(0, Math.round(Number(raw.tension) || 0)),
    hold: Math.max(0, Math.round(Number(raw.hold) || 0)),
    payoff: raw.payoff === true,
    result: RESULTS.includes(raw.result) ? raw.result : null,
    carrier: str(raw.carrier),
    forced: raw.forced === true,
    why: str(raw.why).slice(0, 200),
    at: Number(raw.at) || 0,
  };
}
const nextOf = (f) => ({ id: f.id, rule: f.rule, kind: f.kind, who: f.who, npc: f.npc || [], with: f.with, after: f.after, forced: f.forced, at: f.at });
function cleanNext(raw) {
  if (!isObj(raw) || !str(raw.id) || !str(raw.rule) || !KINDS.includes(raw.kind) || !str(raw.after)) return null;
  const who = refList(raw.who);
  const npc = npcList(raw.npc);
  // a beat may be an event with nobody to bring in; a rule always brings someone
  return who.length || npc.length || raw.kind === "beat" ? { id: str(raw.id).slice(0, 60), rule: str(raw.rule).slice(0, 60), kind: raw.kind, who, npc, with: refList(raw.with), after: str(raw.after), forced: raw.forced === true, at: Number(raw.at) || 0 } : null;
}

/** A small seeded generator (the same algorithm as World's): one decision always rolls the same dice, a swiped reply rolls again. */
export function seededRandom(seed) {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function roll2d6(seed, need) {
  const rnd = seededRandom(seed);
  const d1 = Math.floor(rnd() * 6) + 1;
  const d2 = Math.floor(rnd() * 6) + 1;
  return { d1, d2, total: d1 + d2, need };
}

export function cleanState(raw, chatId) {
  const st = emptyState(chatId);
  if (!isObj(raw)) return st;
  if (typeof raw.on === "boolean") st.on = raw.on;
  if (isObj(raw.lock) && idList(raw.lock.ids).length) st.lock = { ids: idList(raw.lock.ids), at: Number(raw.lock.at) || 0 };
  if (isObj(raw.returning) && idList(raw.returning.ids).length && str(raw.returning.after)) {
    st.returning = { ids: idList(raw.returning.ids), after: str(raw.returning.after), at: Number(raw.returning.at) || 0 };
  }
  st.reports = arr(raw.reports)
    .filter((r) => isObj(r) && str(r.key))
    .map((r) => ({
      key: str(r.key),
      at: Number(r.at) || 0,
      tag: TAGS.includes(r.tag) ? r.tag : null,
      present: idList(r.present),
      ...(Array.isArray(r.others) ? { others: npcList(r.others) } : {}),
      sceneNew: r.sceneNew === true,
      model: str(r.model),
      ms: Number(r.ms) || 0,
      ...(isObj(r.usage) ? { usage: { input: Number(r.usage.input) || 0, output: Number(r.usage.output) || 0 } } : {}),
    }))
    .slice(-REPORTS_KEEP);
  st.log = arr(raw.log).filter(isObj).slice(-LOG_KEEP);
  if (isObj(raw.usage)) st.usage = { input: Number(raw.usage.input) || 0, output: Number(raw.usage.output) || 0, runs: Number(raw.usage.runs) || 0 };
  st.rules = cleanRules(raw.rules);
  st.next = cleanNext(raw.next);
  st.fires = arr(raw.fires).map(cleanFire).filter(Boolean).slice(-FIRES_KEEP);
  st.plan = cleanPlan(raw.plan);
  return st;
}

/** `alone_moment` wins over commute, break, lunch and club when exactly one member is present. */
export function applyPrecedence(tag, presentCount) {
  if (!TAGS.includes(tag)) return null;
  return presentCount === 1 && ALONE_WINS.includes(tag) ? "alone_moment" : tag;
}

/**
 * The names a member goes by: the card's name, its first word (3+ letters), and the names and aliases of the chat registry's
 * person made from this card (a Russian chat writes "Хана" for "Hana Morimoto"; the Dashboard already resolved that).
 */
export function memberNames(members, registry) {
  const byCard = new Map();
  for (const e of arr(registry)) {
    if (!isObj(e) || e.kind !== "person" || str(e.merged) || !str(e.card)) continue;
    const list = byCard.get(str(e.card)) || [];
    list.push(str(e.name), ...arr(e.aliases).map((a) => str(isObj(a) ? a.text : a)));
    byCard.set(str(e.card), list);
  }
  return members.map((m) => {
    const name = str(m.name);
    const firstWord = name.split(" ")[0] || "";
    const names = [name, firstWord.length >= 3 ? firstWord : "", ...(byCard.get(m.id) || [])].filter(Boolean);
    return { id: m.id, name, names: [...new Set(names.map((n) => n.toLowerCase()))] };
  });
}

/** Member ids for the names a model or the sensor gave. A name matches a member's name or alias whole, or by its first word. */
export function matchMembers(names, named) {
  const out = [];
  for (const raw of arr(names)) {
    const n = str(raw).toLowerCase();
    if (!n) continue;
    const first = n.split(" ")[0];
    const hit = named.find((m) => m.names.includes(n)) || named.find((m) => m.names.includes(first));
    if (hit && !out.includes(hit.id)) out.push(hit.id);
  }
  return out;
}

const TAG_WORDS = [
  "lesson (a class in session)",
  "break (a short break in school or at work)",
  "lunch (the lunch break)",
  "club (a club or a team meeting in its room)",
  "commute (on the way to or from school or work)",
  "group_out (several people out together, outside school or work)",
  "date ({user} and one member on a planned outing)",
  "alone_moment ({user} and one member alone in a private moment that is not a date: an empty room, a rooftop, a walk together; it wins over commute, break, lunch and club)",
  "at_home (at someone's home)",
  "event (a festival, a party, a ceremony, a school event)",
];

const EXTRA_TAG_WORDS = [
  "work (at work, on a job, a task or a shift)",
  "meal (a shared meal or a drink at a table)",
  "downtime (quiet, unhurried time: resting, chores, a slow talk)",
  "argument (a quarrel or a tense confrontation)",
  "travel (on a journey, on the road, in transit)",
  "danger (a threat, a chase, a fight, an emergency)",
  "investigation (searching, questioning, following a lead)",
  "secret (a hidden meeting, sneaking, something kept from others)",
  "night (late at night, in the dark, everyone else asleep)",
];
/** The scene kinds the director offers in a chat with this genre set: the base ones, then the set's own. */
export const tagsFor = (setId) => [...BASE_TAGS, ...arr(SETS[setId] && SETS[setId].tags).filter((t) => EXTRA_TAGS.includes(t))];

/** The director's prompt: the members, its own log of the last turns, the reply before as background, and the new pair. */
export function buildPrompt({ members, userName, log, prev, player, reply, others = [], extraTags = [] }) {
  const user = str(userName) || "the player";
  // phase 3b: asked only for the reply that carries a note naming people of the World (they are not members, so `present` cannot hold them)
  const askOthers = others.length > 0;
  const system = [
    "You are the director of a group roleplay. The player plays " + user + ". After each turn you read the newest messages and report the scene for the code that runs the story's rules. You never write the story.",
    "Members: " + members.map((m) => m.name).join(", ") + ".",
    "",
    "Report:",
    "- tag: the kind of scene at the end of the new messages, one of: " + [...TAG_WORDS, ...EXTRA_TAG_WORDS.filter((w) => extraTags.includes(w.split(" ")[0]))].map((t) => t.replace(/\{user\}/g, user)).join("; ") + ".",
    "- present: the members physically in the scene at the end of the new messages, with their names exactly as in the list above, never " + user + ". Someone who only texts, calls or is talked about is not present.",
    ...(askOthers ? ["- others: of these people, who are not members: " + others.join(", ") + ", the ones physically in the scene at the end of the new messages (the same rule as present); [] when none."] : []),
    "- sceneNew: true when the new messages move to another place or skip more than about 30 minutes.",
    "",
    askOthers ? 'Reply with one JSON object: { "tag": "...", "present": ["..."], "others": ["..."], "sceneNew": false }. No prose, no code fences.' : 'Reply with one JSON object: { "tag": "...", "present": ["..."], "sceneNew": false }. No prose, no code fences.',
  ].join("\n");
  const userText = [
    "Your log (turn: tag | present):",
    log.length ? log.join("\n") : "(empty, this is the first turn you read)",
    "",
    prev ? "Reply before (background):\n" + prev.slice(-PREV_CHARS) : "",
    "",
    "New messages:",
    player ? "PLAYER: " + player.slice(0, NEW_CHARS) : "",
    "REPLY: " + reply.slice(0, NEW_CHARS),
  ]
    .filter((x, i, a) => x !== "" || (a[i - 1] !== "" && i > 0))
    .join("\n");
  return { system, user: userText };
}

/** The first JSON object in a model's answer (a thinking block and code fences are dropped). */
export function parseReport(text) {
  const t = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = t.indexOf("{");
  if (start < 0) return null;
  for (let end = t.lastIndexOf("}"); end > start; end = t.lastIndexOf("}", end - 1)) {
    try {
      const j = JSON.parse(t.slice(start, end + 1));
      if (!isObj(j)) return null;
      return { tag: str(j.tag).toLowerCase(), present: arr(j.present).map(str).filter(Boolean), others: arr(j.others).map(str).filter(Boolean), sceneNew: j.sceneNew === true };
    } catch {}
  }
  return null;
}

/** The first reply after the message with key `after`, or null. */
export function carrierOf(after, msgs) {
  const list = arr(msgs).filter(isObj);
  const at = list.findIndex((m) => keyOf(m) === after);
  if (at < 0) return null;
  return list.slice(at + 1).find(isReply) || null;
}

/**
 * Takes back what a swipe or a delete removed: reports of replies no longer on the line, a return or a queued rule note whose
 * anchor is gone, a firing whose anchor is gone (its cooldown and tension go with it). A firing already judged whose carrier reply
 * was swiped away is open again and queued again (the swipe is asking for the same moment).
 */
export function reconcile(state, msgs) {
  const line = new Set(arr(msgs).filter(isObj).map(keyOf));
  const reports = state.reports.filter((r) => line.has(r.key));
  const returning = state.returning && line.has(state.returning.after) ? state.returning : null;
  let next = state.next && line.has(state.next.after) ? state.next : null;
  let firesChanged = false;
  const fires = [];
  for (const f of state.fires) {
    if (!line.has(f.after)) {
      firesChanged = true;
      continue;
    }
    if (f.carrier && !line.has(f.carrier)) {
      firesChanged = true;
      fires.push({ ...f, result: null, carrier: "" });
      if (!next && dueAfter(f.after, msgs, "send")) next = nextOf(f);
    } else fires.push(f);
  }
  // a beat that became due on a reply no longer on the line is not due any more (its condition is read again on the next report)
  const stale = (b) => !!b.dueKey && !line.has(b.dueKey);
  const plan = state.plan.beats.some(stale) ? { beats: state.plan.beats.map((b) => (stale(b) ? { ...b, dueKey: "", dueN: 0, dueWhy: "" } : b)) } : state.plan;
  const changed = reports.length !== state.reports.length || returning !== state.returning || next !== state.next || firesChanged || plan !== state.plan;
  return changed ? { ...state, reports, returning, next, fires, plan } : state;
}

/** The newest report whose reply is the newest reply of the line, or the newest on the line at all. */
export function newestReport(state, msgs) {
  const line = arr(msgs).filter(isReply).map(keyOf);
  for (let i = line.length - 1; i >= 0; i--) {
    const r = state.reports.find((x) => x.key === line[i]);
    if (r) return r;
  }
  return null;
}

/**
 * Whether the return line still rides the next reply: only the first reply after the message the lock was released at (and a
 * swipe of it). `op` is the turn's op: a swipe rewrites the last reply, so that reply does not count.
 */
export function returnDue(state, msgs, op) {
  return !!state.returning && dueAfter(state.returning.after, msgs, op);
}
/** Whether no reply follows the message `after` (a swipe rewrites the last reply, so that one does not count). */
export function dueAfter(after, msgs, op) {
  const list = arr(msgs).filter(isObj);
  const at = list.findIndex((m) => keyOf(m) === after);
  if (at < 0) return false;
  let count = list.slice(at + 1).filter(isReply).length;
  if (op === "swipe" && count > 0 && isReply(list[list.length - 1])) count--;
  return count === 0;
}
/** Who a queued rule note brings in, while its reply is still to come. */
export const nextIds = (state, msgs, op) => (state.on === true && state.next && dueAfter(state.next.after, msgs, op) ? state.next.who : []);

// ---------- genre rules: conditions, the dice, the decision ----------
/** One row per reply on the line, oldest first: { n (1-based), key, report | null }. */
export function replyRows(state, msgs) {
  return arr(msgs).filter(isReply).map((m, i) => ({ n: i + 1, key: keyOf(m), report: state.reports.find((r) => r.key === keyOf(m)) || null }));
}
/** How many replies in a row, counting back from the newest, a member was not present (a reply with no report ends the count). */
export function absentRun(rows, id) {
  let c = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i].report;
    if (!r) break;
    if (r.present.includes(id)) return c;
    c++;
  }
  return c;
}
const nameOfId = (members, id) => (members.find((m) => m.id === id) || {}).name || id;

// ---------- people of the World (phase 3b) ----------
const PEOPLE_MAX = 60;
const PERSON_TEXT = 160;
const firstSentence = (t) => {
  const s = str(t);
  const m = /^(.*?[.!?…])(\s|$)/.exec(s);
  return (m ? m[1] : s).slice(0, PERSON_TEXT);
};
/** The names a World person goes by, lowercased: name, aliases, and the first word of the name when it is 3+ letters. */
const personNames = (name, aliases) => [...new Set([name, name.split(" ")[0].length >= 3 ? name.split(" ")[0] : "", ...aliases].filter(Boolean).map((n) => n.toLowerCase()))];

/**
 * The people of the chat's World the player can bring in: active person records that are not the player and not members of the
 * group (a member's name or the player's name on a record means it is that person). [{ id, name, names, text, noReturn }].
 * Reads World's state file; nothing here writes it (plugins do not import each other).
 */
export function worldPeople(fsx, chatId, named, userName) {
  const w = readJson(fsx, "world/state/" + chatId + ".json", null);
  if (!isObj(w)) return [];
  const own = new Set([...named.flatMap((m) => m.names), str(userName).toLowerCase()].filter(Boolean));
  const out = [];
  for (const e of arr(w.entities)) {
    if (!isObj(e) || e.kind !== "person" || !NPC_ID.test(str(e.id)) || !str(e.name)) continue;
    if (e.status !== undefined && e.status !== "active") continue;
    const name = str(e.name);
    const names = personNames(name, arr(e.aliases).map((a) => str(isObj(a) ? a.text : a)));
    if (names.some((n) => own.has(n))) continue;
    out.push({ id: str(e.id), name, names, text: firstSentence(e.text), noReturn: e.noReturn === true });
    if (out.length >= PEOPLE_MAX) break;
  }
  return out;
}

/** World person ids for the names a model gave: a name or alias whole, or the first word. */
export function matchNpc(names, people) {
  const out = [];
  for (const raw of arr(names)) {
    const n = str(raw).toLowerCase();
    if (!n) continue;
    const first = n.split(" ")[0];
    const hit = people.find((p) => p.names.includes(n)) || people.find((p) => first.length >= 3 && p.names.includes(first));
    if (hit && !out.includes(hit.id)) out.push(hit.id);
  }
  return out;
}

/** The pool a rule may draw World people from: not noReturn, and not named in the Dashboard's present list (when there is one). */
export function npcPool(people, dashNames) {
  const here = new Set(arr(dashNames).map((n) => str(n).toLowerCase()));
  return people.filter((p) => !p.noReturn && !p.names.some((n) => here.has(n))).map((p) => p.id);
}

/** Members who could come in, the longest away first (ties by the seeded generator `rnd`). */
function candidatesFor(rows, members, present, rnd) {
  return members
    .filter((m) => !present.includes(m.id))
    .map((m) => ({ id: m.id, away: absentRun(rows, m.id), tie: rnd() }))
    .sort((a, b) => b.away - a.away || a.tie - b.tie)
    .map((c) => c.id);
}

/**
 * Do a rule's conditions hold on the newest reported reply? { ok, who, with, why } or { ok: false }. Reads only the director's
 * reports (and the member list); nothing here rolls or counts the cooldown.
 */
export function evalRule(rule, { rows, members, rnd, npcs = [] }) {
  const last = rows[rows.length - 1];
  const rep = last && last.report;
  if (!rep) return { ok: false };
  const w = rule.when;
  const why = [];
  const here = rep.present;
  if (w.tag) {
    if (!w.tag.includes(rep.tag)) return { ok: false };
    why.push("the scene is " + rep.tag);
  }
  if (w.tagNot && w.tagNot.includes(rep.tag)) return { ok: false };
  if (Number.isFinite(w.min) && here.length < w.min) return { ok: false };
  if (Number.isFinite(w.max)) {
    if (here.length > w.max) return { ok: false };
    why.push(here.length + " here");
  }
  if (w.alone) {
    const tail = rows.slice(-w.alone);
    const id = tail.length ? tail[0].report && tail[0].report.present[0] : null;
    if (tail.length < w.alone || !id || tail.some((r) => !r.report || r.report.present.length !== 1 || r.report.present[0] !== id)) return { ok: false };
    why.push("alone with " + nameOfId(members, id) + " for " + w.alone + " replies");
  }
  if (w.empty) {
    const tail = rows.slice(-w.empty);
    if (tail.length < w.empty || tail.some((r) => !r.report || r.report.present.length !== 0)) return { ok: false };
    why.push("nobody here for " + w.empty + " replies");
  }
  const pick = pickWho(rule, { rows, members, here, rnd, npcs });
  if (!pick) return { ok: false };
  return { ok: true, who: pick.who, npc: pick.npc, with: rule.do.kind === "return" ? [] : here.slice(0, 4), why: why.join("; ") };
}

/**
 * Who a rule brings: group members (the longest away first), a person of the World (`npcs`, ids not in the scene), or either (a coin
 * from the seeded generator when both exist). A member's turn calls `rnd` exactly as before, so a rule that takes members only
 * rolls and picks as it did in phase 2. Returns { who, npc } or null when nobody can come.
 */
export function pickWho(rule, { rows, members, here, rnd, npcs = [] }) {
  const from = rule.from || "members";
  const order = from === "world" ? [] : candidatesFor(rows, members, here, rnd);
  const pool = from === "members" ? [] : npcs.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (pool.length && (!order.length || from === "world" || rnd() < 0.5)) return { who: [], npc: [pool[0]] };
  if (!order.length) return null;
  const count = rule.do.kind === "join" ? Math.max(1, rule.do.count || 1) : 1;
  return { who: order.slice(0, count), npc: [] };
}

const lastFireOf = (state, ruleId) => {
  const mine = state.fires.filter((f) => f.rule === ruleId && !f.forced);
  return mine.length ? mine[mine.length - 1] : null;
};

/** Where a rule stands now: ready, cooling down, in its payoff silence; and how many replies are left of that. */
export function ruleStatus(state, rule, total) {
  if (!rule.on) return { status: "off", left: 0, tension: 0 };
  const last = lastFireOf(state, rule.id);
  const left = last ? Math.max(0, last.hold - (total - last.n)) : 0;
  const tension = last && !last.payoff ? last.tension : 0;
  return { status: left > 0 ? (last.payoff ? "payoff" : "cooldown") : "ready", left, tension };
}

/**
 * The decision for the newest reported reply: the first enabled rule whose conditions hold, that is not cooling down or in its
 * payoff silence, and whose 2d6 reaches `need`, fires. Nothing fires while the player holds the lock, in an explicit scene, when a
 * decision for this reply exists already, or when the newest reply has no report. Returns { fire, logs }.
 */
export function decideRules({ state, msgs, members, chatId, dashDirection, now, npcs = [] }) {
  const none = { fire: null, logs: [] };
  if (state.on !== true || !state.rules.on || state.lock || dashDirection === "explicit") return none;
  const rules = activeRules(state.rules).filter((r) => r.on);
  const rows = replyRows(state, msgs);
  const last = rows[rows.length - 1];
  if (!rules.length || !last || !last.report || state.fires.some((f) => f.after === last.key) || (state.next && state.next.after === last.key)) return none;
  const total = rows.length;
  const logs = [];
  for (const rule of rules) {
    const found = evalRule(rule, { rows, members, npcs, rnd: seededRandom(chatId + "|" + rule.id + "|" + last.key + "|pick") });
    if (!found.ok) continue;
    const prev = lastFireOf(state, rule.id);
    if (prev && total - prev.n < prev.hold) continue;
    const roll = roll2d6(chatId + "|" + rule.id + "|" + last.key, rule.need);
    if (roll.total < rule.need) {
      logs.push({ at: now, key: last.key, kind: "rule", rule: rule.id, state: "missed", roll, who: found.who, npc: found.npc, with: found.with, why: found.why });
      continue;
    }
    const base = prev && !prev.payoff ? prev.tension : 0;
    const tension = base + 1;
    const payoff = !!rule.payoff && tension >= rule.payoff.k;
    const fire = {
      id: "f" + now.toString(36) + rule.id.slice(0, 6),
      rule: rule.id,
      kind: rule.do.kind,
      who: found.who,
      npc: found.npc,
      with: found.with,
      after: last.key,
      n: total,
      roll,
      tension,
      hold: rule.cooldown + (payoff ? rule.payoff.m : 0),
      payoff,
      result: null,
      carrier: "",
      forced: false,
      why: found.why,
      at: now,
    };
    logs.push({ at: now, key: last.key, kind: "rule", rule: rule.id, state: "fired", roll, who: found.who, npc: found.npc, with: found.with, why: found.why, payoff });
    return { fire, logs };
  }
  return { fire: null, logs };
}

/** The queued note, once its carrier reply has been reported: did they come (in the report's present), only get mentioned, or did it miss. */
export function judgeNext(state, report, msgs, named, people = []) {
  const next = state.next;
  if (!next) return state;
  const carrier = carrierOf(next.after, msgs);
  if (!carrier) return state;
  const text = String(carrier.text || "").toLowerCase();
  const sameReply = keyOf(carrier) === report.key;
  let result = "missed";
  // a beat with nobody to look for (an event only): it went into the reply, and nothing else can be judged
  const npc = next.npc || [];
  if (!next.who.length && !npc.length) result = "sent";
  else if (sameReply) {
    const said = (names) => names.some((n) => n.length >= 3 && text.includes(n));
    // a person of the World is in the scene when the director was asked about them and named them (`others`)
    if (next.who.some((id) => report.present.includes(id)) || npc.some((id) => arr(report.others).includes(id))) result = "came";
    else if (next.who.some((id) => said((named.find((n) => n.id === id) || {}).names || [])) || npc.some((id) => said((people.find((x) => x.id === id) || {}).names || []))) result = "mentioned";
  }
  const fires = state.fires.map((f) => (f.id === next.id ? { ...f, result, carrier: keyOf(carrier) } : f));
  return { ...state, next: null, fires, log: [...state.log, { at: Date.now(), key: keyOf(carrier), kind: "result", rule: next.rule, result, who: next.who, npc }].slice(-LOG_KEEP) };
}

const nameList = (names) => (names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1]);

/** The note a queued rule puts into its reply (the bench's template notes). */
export function ruleNote({ next, members, userName, people = [] }) {
  const user = str(userName) || "the player";
  const npcs = (next.npc || []).map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const who = [...next.who.map((id) => nameOfId(members, id)).filter(Boolean), ...npcs.map((p) => p.name)];
  if (!who.length) return null;
  const others = next.with.map((id) => nameOfId(members, id)).filter(Boolean);
  const group = others.length ? user + " and " + nameList(others) : user;
  const what =
    next.kind === "interrupt" ? nameList(who) + " walks in on " + group + " and interrupts the moment."
    : next.kind === "join" ? nameList(who) + " joins " + group + " here."
    : nameList(who) + " " + (who.length === 1 ? "comes" : "come") + " back into the scene and " + (who.length === 1 ? "joins" : "join") + " " + user + ".";
  return "[SCENE EVENT: must happen in this reply]\nWhat: " + what + aboutNpc(npcs) + "\nHow: bring it into this reply as part of the scene; the characters react in character.\nDo not: explain where it came from or mention a director.";
}

/** For people of the World: who they are, and that they are not part of the group (nobody here has their card). */
const aboutNpc = (npcs) => (npcs.length ? "\nWho: " + npcs.map((p) => p.name + (p.text ? " (" + p.text + ")" : "")).join("; ") + ". They are not one of the group: play them from this description, in character." : "");

/** The lines a reply gets: the lock while it holds, the return once. Empty when neither applies. */
export function sceneLines({ state, members, userName, msgs, op }) {
  const user = str(userName) || "the player";
  const nameOf = (id) => (members.find((m) => m.id === id) || {}).name || "";
  const parts = [];
  if (state.lock) {
    const here = state.lock.ids.map(nameOf).filter(Boolean);
    if (here.length) {
      parts.push({
        label: "Direction · lock",
        text: "[SCENE: only " + nameList(here) + " " + (here.length === 1 ? "is" : "are") + " here with " + user + "]\nHold: nobody else enters, calls in person or appears in this reply; the others are elsewhere until the player brings them back.\nDo not: explain this or mention a director.",
      });
    }
  } else if (returnDue(state, msgs, op)) {
    const back = state.returning.ids.map(nameOf).filter(Boolean);
    if (back.length) {
      parts.push({
        label: "Direction · return",
        text: "[SCENE EVENT: must happen in this reply]\nWhat: " + nameList(back) + " come back into the scene and join " + user + ".\nHow: bring them in as part of the scene; the characters react in character.\nDo not: explain where it came from or mention a director.",
      });
    }
  }
  return parts;
}

// ---------- the beat plan (phase 3) ----------
/**
 * A beat is a stage direction the player wrote: `text` (what happens), `who` (members who take part; those away come in), and `when`:
 *  replies { n }   n replies after the beat became the next one (0 = at once)
 *  tag { tag }     the director reads this scene kind
 *  place { place } the Dashboard's place holds these words
 *  manual          only "Fire now"
 * The plan is ordered: only the first beat that is not finished is looked at (a beat finishes when it was delivered, given up after two
 * misses, or skipped by hand). When the condition holds the beat is DUE and waits up to BOUNDARY_WAIT replies for a scene boundary (the
 * director's `sceneNew`, or the Dashboard's new scene) so it does not cut into the middle of a moment; then it fires anyway. A beat set to
 * not wait, and a place beat (arriving is the boundary), fire at once. Firing is the same queue as a rule's: a fire in the ledger
 * (`rule: "beat:<id>"`) and a queued `next`; what came of it is the same judgement; a beat's status is derived from that ledger, so a
 * swipe or a delete takes it back with no extra bookkeeping.
 */
export const WHEN_KINDS = ["replies", "tag", "place", "manual"];
export const BOUNDARY_WAIT = 6;
const BEATS_MAX = 20;
const BEAT_TEXT_MAX = 400;
const BEAT_ID = /^[a-z0-9]{1,40}$/;
const DONE = ["came", "mentioned", "sent"];
export const beatRuleId = (id) => "beat:" + id;

export function cleanWhen(raw) {
  const w = isObj(raw) ? raw : {};
  if (w.kind === "tag" && TAGS.includes(w.tag)) return { kind: "tag", tag: w.tag };
  if (w.kind === "place" && str(w.place)) return { kind: "place", place: str(w.place).slice(0, 80) };
  if (w.kind === "manual") return { kind: "manual" };
  return { kind: "replies", n: clampInt(w.n, 0, 200, 3) };
}

/** A beat as kept; the server's own fields (addedN, skipN, dueKey, dueN, dueWhy) are never taken from a client. */
export function cleanBeat(raw) {
  if (!isObj(raw) || !str(raw.text)) return null;
  const id = str(raw.id);
  return {
    id: BEAT_ID.test(id) ? id : "",
    text: str(raw.text).slice(0, BEAT_TEXT_MAX),
    who: refList(raw.who),
    npc: npcList(raw.npc),
    when: cleanWhen(raw.when),
    wait: raw.wait !== false,
    skipped: raw.skipped === true,
    skipN: Math.max(0, Math.round(Number(raw.skipN) || 0)),
    addedN: Math.max(0, Math.round(Number(raw.addedN) || 0)),
    dueKey: str(raw.dueKey),
    dueN: Math.max(0, Math.round(Number(raw.dueN) || 0)),
    dueWhy: str(raw.dueWhy).slice(0, 120),
  };
}

export function cleanPlan(raw) {
  const seen = new Set();
  const beats = [];
  for (const b of arr(isObj(raw) ? raw.beats : [])) {
    const beat = cleanBeat(b);
    if (!beat || !beat.id || seen.has(beat.id)) continue;
    seen.add(beat.id);
    beats.push(beat);
  }
  return { beats: beats.slice(0, BEATS_MAX) };
}

/** What became of a beat, from the ledger: skipped, delivered (came / mentioned / sent), failed (two misses), queued, or open (with `retry` after a miss or a yield). */
export function beatOutcome(state, beat) {
  const fires = state.fires.filter((f) => f.rule === beatRuleId(beat.id));
  const misses = fires.filter((f) => f.result === "missed");
  const done = fires.find((f) => DONE.includes(f.result));
  if (beat.skipped) return { status: "skipped", end: beat.skipN, tries: misses.length };
  if (done) return { status: "delivered", end: done.n, result: done.result, tries: misses.length };
  if (misses.length >= 2) return { status: "failed", end: misses[misses.length - 1].n, tries: misses.length };
  if (state.next && state.next.rule === beatRuleId(beat.id)) return { status: "queued", end: 0, tries: misses.length };
  const lastFire = fires[fires.length - 1];
  return { status: "open", end: 0, tries: misses.length, retry: !!lastFire && (lastFire.result === "missed" || lastFire.result === "yielded") };
}

/** The first beat not finished, with the reply count it counts from (its own creation, or when the one before it ended). */
export function planHead(state, total) {
  let prevEnd = 0;
  for (const beat of state.plan.beats) {
    const outcome = beatOutcome(state, beat);
    if (outcome.status === "skipped" || outcome.status === "delivered" || outcome.status === "failed") {
      prevEnd = Math.max(prevEnd, outcome.end);
      continue;
    }
    return { beat, outcome, armed: Math.min(total, Math.max(beat.addedN, prevEnd)) };
  }
  return null;
}

/** Does the beat's `when` hold now? { met, why } or { met: false, left? } (left = replies still to count for a `replies` beat). */
export function beatCondition(beat, { total, armed, report, place }) {
  const w = beat.when;
  if (w.kind === "replies") return total - armed >= w.n ? { met: true, why: w.n ? w.n + " replies passed" : "from the start" } : { met: false, left: armed + w.n - total };
  if (w.kind === "tag") return report && report.tag === w.tag ? { met: true, why: "the scene is " + w.tag } : { met: false };
  if (w.kind === "place") return place && place.toLowerCase().includes(w.place.toLowerCase()) ? { met: true, why: "the story is at " + place } : { met: false };
  return { met: false };
}

/**
 * The decision for the newest reported reply: the next beat of the plan, when its condition holds (and it has waited for a scene boundary,
 * or its wait is over). Nothing under the lock, with the switch off, in an explicit scene, with a note queued already, or when the newest
 * reply has no report. Returns { fire, beats, logs }: `beats` is the plan's new list when a beat became due, else null.
 */
export function decideBeat({ state, msgs, members, dashDirection, dashPlace, dashMoved, now, people = [] }) {
  const none = { fire: null, beats: null, logs: [] };
  if (state.on !== true || state.lock || state.next) return none;
  const rows = replyRows(state, msgs);
  const last = rows[rows.length - 1];
  if (!last || !last.report || state.fires.some((f) => f.after === last.key)) return none;
  const total = rows.length;
  const head = planHead(state, total);
  if (!head || head.outcome.status === "queued") return none;
  const { beat, outcome, armed } = head;
  let beats = null;
  let due = beat;
  const logs = [];
  if (!beat.dueKey) {
    const cond = beatCondition(beat, { total, armed, report: last.report, place: dashPlace });
    if (!cond.met) return none;
    due = { ...beat, dueKey: last.key, dueN: total, dueWhy: cond.why };
    beats = state.plan.beats.map((b) => (b.id === beat.id ? due : b));
    logs.push({ at: now, key: last.key, kind: "beat", state: "due", beat: beat.id, text: beat.text.slice(0, 120), why: cond.why });
  }
  if (dashDirection === "explicit") return { fire: null, beats, logs };
  const boundary = dashMoved === true || rows.slice(Math.max(0, due.dueN - 1)).some((r) => r.report && r.report.sceneNew);
  const immediate = outcome.retry || !due.wait || due.when.kind === "place";
  const waited = total - due.dueN >= BOUNDARY_WAIT;
  if (!immediate && !boundary && !waited) return { fire: null, beats, logs };
  const how = outcome.retry ? "again after a miss" : immediate ? "" : boundary ? "the scene changed" : "waited " + BOUNDARY_WAIT + " replies for a scene change";
  const why = [due.dueWhy, how].filter(Boolean).join("; ");
  const who = due.who.filter((id) => members.some((m) => m.id === id));
  // a person of the World that left the book (retired, deleted) is dropped quietly
  const npc = due.npc.filter((id) => people.some((x) => x.id === id));
  const fire = {
    id: "f" + now.toString(36) + beat.id.slice(0, 6),
    rule: beatRuleId(beat.id),
    kind: "beat",
    who,
    npc,
    with: last.report.present.filter((id) => !who.includes(id)).slice(0, 4),
    after: last.key,
    n: total,
    roll: null,
    tension: 0,
    hold: 0,
    payoff: false,
    result: null,
    carrier: "",
    forced: false,
    why,
    at: now,
  };
  logs.push({ at: now, key: last.key, kind: "beat", state: "fired", beat: beat.id, text: beat.text.slice(0, 120), who, npc, why });
  return { fire, beats, logs };
}

/** The note a queued beat puts into its reply. A beat left out once says so, shorter and stricter. */
export function beatNote({ next, beat, members, userName, tries, people = [] }) {
  if (!beat) return null;
  const user = str(userName) || "the player";
  const npcs = (next.npc || []).map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const who = [...next.who.map((id) => nameOfId(members, id)).filter(Boolean), ...npcs.map((p) => p.name)];
  const lines = ["[SCENE EVENT: must happen in this reply]", "What: " + beat.text];
  if (who.length) lines.push("Who: " + nameList(who) + " " + (who.length === 1 ? "takes" : "take") + " part; if they are not here yet, they come into the scene for it, with " + user + " there.");
  if (npcs.length) lines.push(aboutNpc(npcs).slice(1));
  lines.push(tries > 0 ? "How: this was left out of the last reply and must happen in this one; the shortest form will do." : "How: bring it into this reply as part of the scene; the characters react in character.");
  lines.push("Do not: explain where it came from or mention a director or a plan.");
  return lines.join("\n");
}

/** The plan as the panel shows it: each beat with its status (waiting, due, queued, delivered, skipped, failed, behind), what it waits for, and why it is held. */
export function beatStatuses(state, msgs, { dashDirection, dashPlace }) {
  const rows = replyRows(state, msgs);
  const total = rows.length;
  const head = planHead(state, total);
  const newest = rows.length ? rows[rows.length - 1].report : null;
  return state.plan.beats.map((beat) => {
    const o = beatOutcome(state, beat);
    const base = { id: beat.id, text: beat.text, who: beat.who, npc: beat.npc, when: beat.when, wait: beat.wait, tries: o.tries };
    if (o.status !== "open") return { ...base, status: o.status, ...(o.result ? { result: o.result } : {}) };
    if (!head || head.beat.id !== beat.id) return { ...base, status: "behind" };
    const hold = state.on !== true ? "off" : state.lock ? "lock" : beat.dueKey && dashDirection === "explicit" ? "explicit" : "";
    if (beat.dueKey) {
      const immediate = o.retry || !beat.wait || beat.when.kind === "place";
      return { ...base, status: "due", left: immediate ? 0 : Math.max(0, BOUNDARY_WAIT - (total - beat.dueN)), ...(hold ? { hold } : {}) };
    }
    const cond = beatCondition(beat, { total, armed: head.armed, report: newest, place: dashPlace });
    return { ...base, status: "waiting", ...(Number.isFinite(cond.left) ? { left: cond.left } : {}), ...(cond.met ? { met: true } : {}), ...(hold ? { hold } : {}) };
  });
}

// ---------- files ----------
const CONFIG_FILE = "direction/config.json";
const STATE_DIR = "direction/state/";
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
export const loadState = (fsx, chatId) => cleanState(readJson(fsx, stateFile(chatId), null), chatId);
const saveState = (fsx, st) => fsx.write(stateFile(st.chatId), JSON.stringify(st, null, 2));

function readChat(fsx, chatId) {
  const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
  if (!isObj(meta)) return null;
  // every part and the tail, in full shape (chat-store.js)
  const msgs = chatMessages(fsx, chatId, meta).filter((m) => m.id !== undefined && m.id !== null && m.id !== "");
  return { meta, msgs };
}

/** The group's members as { id, name } (cards that are missing are left out). */
export function groupMembers(fsx, meta) {
  if (!isObj(meta) || !str(meta.groupId)) return null;
  const g = readJson(fsx, "groups/" + meta.groupId + ".json", null);
  if (!isObj(g)) return null;
  const out = [];
  for (const id of idList(g.memberIds)) {
    const card = readJson(fsx, "characters/" + id + "/card.json", null);
    if (isObj(card) && str(card.name)) out.push({ id, name: str(card.name) });
  }
  return { group: g, members: out };
}
const registryOf = (fsx, chatId) => {
  const reg = readJson(fsx, "registry/" + chatId.replace(/[^\w-]/g, "_") + ".json", null);
  return isObj(reg) ? arr(reg.entities) : [];
};
const userNameOf = (fsx, meta) => {
  if (str(meta && meta.userName)) return str(meta.userName);
  const settings = readJson(fsx, "settings.json", {});
  const pid = str(meta && meta.personaId) || str(isObj(settings) ? settings.personaId : "") || "you";
  const persona = readJson(fsx, "personas/" + pid + ".json", null);
  return isObj(persona) ? str(persona.name) : "";
};

/** The Dashboard's newest snapshot's `present` names, [] without one. */
function dashboardPresent(fsx, chatId) {
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const snaps = isObj(dash) && isObj(dash.snapshots) ? Object.values(dash.snapshots).filter(isObj) : [];
  if (!snaps.length) return null;
  const last = snaps.sort((a, b) => (Number(a.turn) || 0) - (Number(b.turn) || 0))[snaps.length - 1];
  return arr(last.present).map(str).filter(Boolean);
}

/** The Dashboard's newest snapshot's scene direction ("explicit" and so on), "" without one. */
function dashboardDirection(fsx, chatId) {
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const snaps = isObj(dash) && isObj(dash.snapshots) ? Object.values(dash.snapshots).filter(isObj) : [];
  if (!snaps.length) return "";
  const last = snaps.sort((a, b) => (Number(a.turn) || 0) - (Number(b.turn) || 0))[snaps.length - 1];
  return isObj(last.scene) ? str(last.scene.direction) : "";
}

/**
 * The Dashboard's scene for the beat plan: its place (the newest snapshot's clock), its direction, and whether the story just moved
 * (the snapshot of the newest reply says a new scene or names another place than the one before). `moved` is false when the Dashboard
 * has not read the newest reply yet: an old snapshot's new scene must not count twice.
 */
export function dashboardScene(fsx, chatId, msgs) {
  const none = { direction: "", place: "", moved: false };
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const snaps = isObj(dash) && isObj(dash.snapshots) ? dash.snapshots : null;
  if (!snaps) return none;
  const list = arr(msgs).filter(isObj);
  const line = list.map(keyOf).filter((k) => isObj(snaps[k]));
  if (!line.length) return none;
  const last = snaps[line[line.length - 1]];
  const prev = line.length > 1 ? snaps[line[line.length - 2]] : null;
  const placeOf = (sn) => (isObj(sn) && isObj(sn.clock) ? str(sn.clock.place) : "");
  const sc = isObj(last.scene) ? last.scene : {};
  const lastReply = list.filter(isReply).pop();
  const fresh = !!lastReply && keyOf(lastReply) === line[line.length - 1];
  const moved = fresh && (sc.new === true || (!!prev && !!placeOf(prev) && !!placeOf(last) && placeOf(prev).toLowerCase() !== placeOf(last).toLowerCase()));
  return { direction: str(sc.direction), place: placeOf(last), moved };
}

/**
 * Who is in the scene now, by member id, and where that comes from: the lock (the player), the director's newest report, the
 * Dashboard, or nothing known. The engine plugin's `directionScene` reads the same file the same way.
 */
export function sceneNow(state, msgs, members, named, dashNames) {
  const ids = members.map((m) => m.id);
  const back = [...(state.returning && returnDue(state, msgs, "send") ? state.returning.ids : []), ...nextIds(state, msgs, "send")];
  if (state.lock) return { source: "lock", present: state.lock.ids.filter((id) => ids.includes(id)), tag: null };
  // with the switch off the engine does not limit the scene (`directionScene`), so nothing is shown as limited either
  if (state.on !== true) return { source: "none", present: [], tag: null };
  const report = newestReport(state, msgs);
  if (report) return { source: "director", present: [...new Set([...report.present, ...back])].filter((id) => ids.includes(id)), tag: report.tag };
  if (dashNames) return { source: "dashboard", present: [...new Set([...matchMembers(dashNames, named), ...back])], tag: null };
  return { source: "none", present: [], tag: null };
}

const thinkingOnly = (r) => !r.error && !str(r.text) && !!str(r.reasoning);
const isRateLimit = (r) => /429|rate.?limit|too many requests/i.test(String((r && r.error) || ""));
const usageOf = (r) => (isObj(r.usage) ? { input: Number(r.usage.input) || 0, output: Number(r.usage.output) || 0 } : null);
const logLine = (st, line) => ({ ...st, log: [...st.log, { at: Date.now(), ...line }].slice(-LOG_KEEP) });

function settle(fsx, state, msgs) {
  const next = reconcile(state, msgs);
  if (next !== state) saveState(fsx, next);
  return next;
}

function requestFor(p, model, maxTokens) {
  // NEVER set a reasoning field: the report is a small structured answer
  return { model, systemPrompt: p.system, messages: [{ role: "user", content: p.user }], presetParams: { temperature: 0, max_tokens: maxTokens } };
}

/** What the director reads for the newest reply: the pair, the reply before, its own log of the last turns. */
function inputFor(state, msgs, members, userName, people = []) {
  const list = arr(msgs).filter(isObj);
  let at = -1;
  for (let i = list.length - 1; i >= 0; i--) if (isReply(list[i])) { at = i; break; }
  if (at < 0) return null;
  const reply = list[at];
  let player = "";
  for (let i = at - 1; i >= 0 && !isReply(list[i]); i--) if (list[i].role === "user") { player = String(list[i].text || ""); break; }
  let prev = "";
  for (let i = at - 1; i >= 0; i--) if (isReply(list[i])) { prev = String(list[i].text || ""); break; }
  const nameOf = (id) => (members.find((m) => m.id === id) || {}).name || id;
  const line = list.filter(isReply).map(keyOf);
  const log = state.reports
    .filter((r) => line.indexOf(r.key) >= 0 && line.indexOf(r.key) < line.indexOf(keyOf(reply)))
    .slice(-LOG_LINES)
    .map((r) => (line.indexOf(r.key) + 1) + ": " + (r.tag || "?") + " | " + (r.present.map(nameOf).join(", ") || "nobody"));
  // the reply that carries a note naming people of the World: ask the director whether they are in the scene (phase 3b)
  const queued = state.next && arr(state.next.npc).length ? state.next : null;
  const carrier = queued ? carrierOf(queued.after, msgs) : null;
  const asked = carrier && keyOf(carrier) === keyOf(reply) ? queued.npc.map((id) => people.find((p) => p.id === id)).filter(Boolean) : [];
  return { key: keyOf(reply), asked, prompt: buildPrompt({ members, userName, log, prev, player, reply: String(reply.text || ""), others: asked.map((p) => p.name), extraTags: tagsFor(state.rules.set).filter((t) => EXTRA_TAGS.includes(t)) }) };
}

function runRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!ID.test(chatId)) return ok({ ok: false, error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ ok: false, reason: "no-chat" }, 404);
  const gm = groupMembers(fsx, chat.meta);
  if (!gm || !gm.members.length) return ok({ ok: false, reason: "not-group" });
  const cfg = readConfig(fsx);
  const state = settle(fsx, loadState(fsx, chatId), chat.msgs);
  const userName = userNameOf(fsx, chat.meta);
  const named = memberNames(gm.members, registryOf(fsx, chatId));
  const people = worldPeople(fsx, chatId, named, userName);
  const res = host.llm && isObj(host.llm.results) ? host.llm.results : {};
  const r = res.direction_retry || res.direction;
  const stash = isObj(req.stash) ? req.stash : {};
  if (!r) {
    if (state.on !== true) return ok({ ok: false, reason: "off" });
    if (!cfg.model) return ok({ ok: false, reason: "no-model" });
    const input = inputFor(state, chat.msgs, gm.members, userName, people);
    if (!input) return ok({ ok: false, reason: "no-reply" });
    if (b.force !== true && state.reports.some((x) => x.key === input.key)) return ok({ ok: false, reason: "done" });
    host.llm.request("direction", requestFor(input.prompt, cfg.model, MAX_TOKENS));
    return { __llmPending: true, stash: { key: input.key, model: cfg.model, started: Date.now(), retry: false } };
  }
  const input = inputFor(state, chat.msgs, gm.members, userName, people);
  if (!input || input.key !== stash.key) return ok({ ok: false, reason: "error", message: "the reply changed while the director read it" });
  const retry = stash.retry === true;
  const again = (maxTokens) => {
    host.llm.request("direction_retry", requestFor(input.prompt, stash.model, maxTokens));
    return { __llmPending: true, stash: { ...stash, retry: true } };
  };
  if (!retry && r.error && isRateLimit(r)) return again(MAX_TOKENS);
  if (!retry && !r.error && !str(r.text)) return again(thinkingOnly(r) ? RETRY_TOKENS : MAX_TOKENS);
  const now = Date.now();
  const usage = usageOf(r);
  const ms = Math.round(Number(r.genTimeMs) || now - (Number(stash.started) || now));
  const counted = (st) => ({ ...st, usage: { input: st.usage.input + (usage ? usage.input : 0), output: st.usage.output + (usage ? usage.output : 0), runs: st.usage.runs + 1 } });
  const fail = (reason, message) => {
    saveState(fsx, logLine(counted(state), { key: stash.key, kind: "error", reason, message, model: stash.model, ms }));
    return ok({ ok: false, reason, message });
  };
  if (r.error) return fail("error", String(r.error).split("\n")[0].slice(0, 300));
  const parsed = parseReport(r.text);
  if (!parsed) return fail("bad-reply", thinkingOnly(r) ? "the model spent its whole limit thinking" : "no report in the answer");
  const present = matchMembers(parsed.present, named);
  const report = { key: stash.key, at: now, tag: applyPrecedence(parsed.tag, present.length), present, ...(input.asked.length ? { others: matchNpc(parsed.others, input.asked) } : {}), sceneNew: parsed.sceneNew, model: str(r.model) && r.model !== "error" ? str(r.model) : stash.model, ms, ...(usage ? { usage } : {}) };
  let st = { ...state, reports: [...state.reports.filter((x) => x.key !== report.key), report].slice(-REPORTS_KEEP) };
  // the return is spent once a reply after it was read
  if (st.returning && !returnDue(st, chat.msgs, "send")) st = { ...st, returning: null };
  st = logLine(counted(st), { key: report.key, kind: "report", tag: report.tag, present: report.present, sceneNew: report.sceneNew, model: report.model, ms, ...(usage ? { usage } : {}), ...(retry ? { retried: true } : {}) });
  // judge the note this reply carried, then decide the next one: a beat of the plan first, a genre rule when no beat fires
  st = judgeNext(st, report, chat.msgs, named, people);
  const dash = dashboardScene(fsx, chatId, chat.msgs);
  const beat = decideBeat({ state: st, msgs: chat.msgs, members: gm.members, dashDirection: dash.direction, dashPlace: dash.place, dashMoved: dash.moved, now, people });
  if (beat.beats) st = { ...st, plan: { beats: beat.beats } };
  for (const l of beat.logs) st = { ...st, log: [...st.log, l].slice(-LOG_KEEP) };
  if (beat.fire) st = { ...st, fires: [...st.fires, beat.fire].slice(-FIRES_KEEP), next: nextOf(beat.fire) };
  const decided = st.next ? { fire: null, logs: [] } : decideRules({ state: st, msgs: chat.msgs, members: gm.members, chatId, dashDirection: dash.direction, now, npcs: npcPool(people, dashboardPresent(fsx, chatId)) });
  if (decided.fire) st = { ...st, fires: [...st.fires, decided.fire].slice(-FIRES_KEEP), next: nextOf(decided.fire) };
  for (const l of decided.logs) st = { ...st, log: [...st.log, l].slice(-LOG_KEEP) };
  saveState(fsx, st);
  return ok({ ok: true, report });
}

function stateRoute(req, host) {
  const fsx = host.fs;
  const chatId = String((req.query && req.query.chatId) || "");
  if (!ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const gm = groupMembers(fsx, chat.meta);
  const cfg = readConfig(fsx);
  const state = settle(fsx, loadState(fsx, chatId), chat.msgs);
  const members = gm ? gm.members : [];
  const named = memberNames(members, registryOf(fsx, chatId));
  const scene = sceneNow(state, chat.msgs, members, named, dashboardPresent(fsx, chatId));
  const report = newestReport(state, chat.msgs);
  const total = replyRows(state, chat.msgs).length;
  const dash = dashboardScene(fsx, chatId, chat.msgs);
  const plan = beatStatuses(state, chat.msgs, { dashDirection: dash.direction, dashPlace: dash.place });
  const rules = activeRules(state.rules).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.do.kind,
    on: r.on,
    need: r.need,
    cooldown: r.cooldown,
    k: r.payoff ? r.payoff.k : 0,
    m: r.payoff ? r.payoff.m : 0,
    from: r.from,
    defaults: r.defaults,
    when: r.when,
    ...ruleStatus(state, r, total),
  }));
  const people = worldPeople(fsx, chatId, named, userNameOf(fsx, chat.meta));
  return ok({
    config: cfg,
    chat: { on: state.on === true, lock: state.lock, returning: state.returning && returnDue(state, chat.msgs, "send") ? state.returning : null },
    scene,
    report,
    members,
    log: state.log.slice().reverse(),
    usage: state.usage,
    rules: { set: state.rules.set, on: state.rules.on, sets: Object.entries(SETS).map(([id, s]) => ({ id, name: s.name })), items: rules },
    next: state.next && state.on === true ? { ...state.next, due: dueAfter(state.next.after, chat.msgs, "send") } : null,
    fires: state.fires.slice().reverse(),
    plan: { beats: plan, whenKinds: WHEN_KINDS, tags: tagsFor(state.rules.set), templates: arr(SETS[state.rules.set] && SETS[state.rules.set].templates), boundaryWait: BOUNDARY_WAIT, max: BEATS_MAX, textMax: BEAT_TEXT_MAX },
    // people of this chat's World the player can bring in (phase 3b): ids as the beats and rules name them
    world: { people: people.map((x) => ({ id: x.id, name: x.name, ...(x.text ? { text: x.text } : {}), ...(x.noReturn ? { noReturn: true } : {}) })) },
  });
}

/**
 * The chat's plan, as a whole list (the panel edits it and sends it back): new beats get an id and count from now; a beat whose `when`
 * changed is not due any more; skipping stamps the reply count the next beat counts from. Beats that left the list take their firings
 * (and a queued note) with them.
 */
function planRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  if (!groupMembers(fsx, chat.meta)) return ok({ error: "not a group chat" }, 400);
  if (!Array.isArray(b.beats)) return ok({ error: "beats required" }, 400);
  const st0 = settle(fsx, loadState(fsx, chatId), chat.msgs);
  const total = replyRows(st0, chat.msgs).length;
  const before = new Map(st0.plan.beats.map((x) => [x.id, x]));
  const now = Date.now();
  const beats = [];
  b.beats.slice(0, BEATS_MAX).forEach((raw, i) => {
    const c = cleanBeat(raw);
    if (!c) return;
    const old = before.get(c.id);
    if (!old) {
      beats.push({ ...c, id: "b" + (now + i).toString(36), skipN: c.skipped ? total : 0, addedN: total, dueKey: "", dueN: 0, dueWhy: "" });
      return;
    }
    const sameWhen = JSON.stringify(old.when) === JSON.stringify(c.when);
    beats.push({ ...c, skipN: c.skipped ? (old.skipped ? old.skipN : total) : 0, addedN: old.addedN, ...(sameWhen && !c.skipped ? { dueKey: old.dueKey, dueN: old.dueN, dueWhy: old.dueWhy } : { dueKey: "", dueN: 0, dueWhy: "" }) });
  });
  const kept = new Set(beats.map((x) => beatRuleId(x.id)));
  const gone = (rule) => rule.startsWith("beat:") && !kept.has(rule);
  // a queued note of a beat that was deleted or skipped never reaches a reply: it leaves the ledger too
  const stopped = st0.next && st0.next.rule.startsWith("beat:") && (gone(st0.next.rule) || beats.some((x) => x.skipped && beatRuleId(x.id) === st0.next.rule));
  const next = stopped ? null : st0.next;
  const st = { ...st0, plan: cleanPlan({ beats }), next, fires: st0.fires.filter((f) => !gone(f.rule) && !(stopped && f.id === st0.next.id)) };
  saveState(fsx, st);
  return ok({ plan: st.plan });
}

/** The chat's genre set, its switch and the edits to a rule's numbers. Changing the set drops the queued note. */
function rulesRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  if (!groupMembers(fsx, chat.meta)) return ok({ error: "not a group chat" }, 400);
  let st = settle(fsx, loadState(fsx, chatId), chat.msgs);
  const before = st.rules;
  const patch = { ...before };
  if (typeof b.set === "string") {
    if (b.set !== "" && !SETS[b.set]) return ok({ error: "unknown set" }, 400);
    patch.set = b.set;
    if (b.set && b.set !== before.set) patch.on = true;
  }
  if (typeof b.on === "boolean") patch.on = b.on;
  if (isObj(b.rule) && ID.test(String(b.rule.id || ""))) {
    const known = (SETS[patch.set] ? SETS[patch.set].rules : []).some((r) => r.id === b.rule.id);
    if (!known) return ok({ error: "unknown rule" }, 400);
    patch.edits = { ...before.edits, [b.rule.id]: { ...(before.edits[b.rule.id] || {}), ...b.rule, id: undefined } };
  }
  const rules = cleanRules(patch);
  st = { ...st, rules };
  if (!rules.on || rules.set !== before.set) st = { ...st, next: null };
  if (rules.set !== before.set || rules.on !== before.on) st = logLine(st, { kind: "rules", set: rules.set, on: rules.on });
  saveState(fsx, st);
  return ok({ rules });
}

/** "Fire now": a rule's note for the next reply, no roll, no cooldown, no tension. It replaces a queued note. */
function fireRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const gm = groupMembers(fsx, chat.meta);
  if (!gm) return ok({ error: "not a group chat" }, 400);
  const st0 = settle(fsx, loadState(fsx, chatId), chat.msgs);
  if (st0.on !== true) return ok({ error: "Direction is off in this chat" }, 400);
  if (st0.lock) return ok({ error: "the scene is locked" }, 400);
  const beat = typeof b.beat === "string" ? st0.plan.beats.find((x) => x.id === b.beat) : null;
  const rule = beat ? null : activeRules(st0.rules).find((r) => r.id === b.rule);
  if (!rule && !beat) return ok({ error: b.beat ? "unknown beat" : "unknown rule" }, 400);
  if (beat && beatOutcome(st0, beat).status !== "open" && beatOutcome(st0, beat).status !== "queued") return ok({ error: "this beat is finished" }, 400);
  const rows = replyRows(st0, chat.msgs);
  const last = rows[rows.length - 1];
  if (!last) return ok({ error: "no reply yet" }, 400);
  const named = memberNames(gm.members, registryOf(fsx, chatId));
  const here = last.report ? last.report.present : (() => { const d = dashboardPresent(fsx, chatId); return d ? matchMembers(d, named) : null; })();
  if (!here) return ok({ error: "the scene is not known yet" }, 400);
  const now = Date.now();
  if (beat) {
    // a beat by hand: now, whatever its condition and its wait; its people are the ones the player named
    const who = beat.who.filter((id) => gm.members.some((m) => m.id === id));
    const known = worldPeople(fsx, chatId, named, userNameOf(fsx, chat.meta));
    const npc = beat.npc.filter((id) => known.some((x) => x.id === id));
    const fire = {
      id: "f" + now.toString(36) + beat.id.slice(0, 6),
      rule: beatRuleId(beat.id),
      kind: "beat",
      who,
      npc,
      with: here.filter((id) => !who.includes(id)).slice(0, 4),
      after: last.key,
      n: rows.length,
      roll: null,
      tension: 0,
      hold: 0,
      payoff: false,
      result: null,
      carrier: "",
      forced: true,
      why: "fired by hand",
      at: now,
    };
    const fires = [...st0.fires.filter((f) => !(st0.next && f.id === st0.next.id)), fire].slice(-FIRES_KEEP);
    const st = logLine({ ...st0, fires, next: nextOf(fire) }, { key: last.key, kind: "beat", state: "fired", beat: beat.id, text: beat.text.slice(0, 120), who, npc, why: fire.why, forced: true });
    saveState(fsx, st);
    return ok({ next: st.next });
  }
  const pool = npcPool(worldPeople(fsx, chatId, named, userNameOf(fsx, chat.meta)), dashboardPresent(fsx, chatId));
  const pick = pickWho(rule, { rows, members: gm.members, here, npcs: pool, rnd: seededRandom(chatId + "|" + rule.id + "|" + last.key + "|now|" + now) });
  if (!pick) return ok({ error: rule.from === "world" ? "nobody from the World can come" : "everyone is already here" }, 400);
  const fire = {
    id: "f" + now.toString(36) + rule.id.slice(0, 6),
    rule: rule.id,
    kind: rule.do.kind,
    who: pick.who,
    npc: pick.npc,
    with: rule.do.kind === "return" ? [] : here.slice(0, 4),
    after: last.key,
    n: rows.length,
    roll: null,
    tension: 0,
    hold: 0,
    payoff: false,
    result: null,
    carrier: "",
    forced: true,
    why: "fired by hand",
    at: now,
  };
  // a queued note this replaces is dropped from the ledger too (it never reached a reply)
  const fires = [...st0.fires.filter((f) => !(st0.next && f.id === st0.next.id)), fire].slice(-FIRES_KEEP);
  const st = logLine({ ...st0, fires, next: nextOf(fire) }, { key: last.key, kind: "rule", rule: rule.id, state: "fired", who: fire.who, npc: fire.npc, with: fire.with, why: fire.why, forced: true });
  saveState(fsx, st);
  return ok({ next: st.next });
}

function skipRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const st0 = settle(fsx, loadState(fsx, chatId), chat.msgs);
  if (!st0.next) return ok({ next: null });
  const id = st0.next.id;
  // dropped by hand: gone from the ledger, so the rule's cooldown and tension do not count it
  const st = logLine({ ...st0, next: null, fires: st0.fires.filter((f) => f.id !== id) }, { kind: "skip", rule: st0.next.rule, who: st0.next.who, npc: st0.next.npc || [] });
  saveState(fsx, st);
  return ok({ next: null });
}

// ---------- a draft of a plan from the members' cards (phase 4) ----------
const DRAFT_MAX_BEATS = 8;
const CARD_CHARS = 700;
const DRAFT_TOKENS = 1800;

/** The members with the start of their cards, for the draft: [{ id, name, about }] (a card with no description reads as its name only). */
function cardsOf(fsx, members) {
  return members.map((m) => {
    const card = readJson(fsx, "characters/" + m.id + "/card.json", {});
    const about = [str(card.description).slice(0, CARD_CHARS), str(card.personality).slice(0, CARD_CHARS)].filter(Boolean).join(" ");
    return { id: m.id, name: m.name, about };
  });
}

/** The draft prompt: the group, the genre (when one is picked), the scene kinds a beat may wait for, the beats already written. */
export function buildDraftPrompt({ cards, userName, setName, tags, existing }) {
  const user = str(userName) || "the player";
  const system = [
    "You plan the story of a group roleplay. The player plays " + user + ". You do not write the story; you suggest beats: short stage directions the player can add to a plan. Each beat is one thing that happens, in one or two sentences, in the present tense.",
    "Members:",
    ...cards.map((c) => "- " + c.name + (c.about ? ": " + c.about : "")),
    setName ? "Genre: " + setName + "." : "",
    "",
    "Write " + Math.min(DRAFT_MAX_BEATS, 6) + " to " + DRAFT_MAX_BEATS + " beats, in the order they should happen, built on who these members are and what they want. Spread them out. Do not repeat the beats already planned.",
    'Each beat: { "text": "...", "who": ["member names that take part, exactly as listed; [] when none"], "when": { "kind": "replies", "n": 4 } or { "kind": "tag", "tag": "<one of: ' + tags.join(", ") + '>" } }. "replies" counts from when the beat before it is done (between 3 and 20).',
    'Reply with one JSON object: { "beats": [ ... ] }. No prose, no code fences.',
  ].filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n");
  const userText = existing.length ? "Beats already planned (do not repeat):\n" + existing.map((t) => "- " + t).join("\n") : "No beats are planned yet.";
  return { system, user: userText };
}

/** The beats object out of a model's answer, or null. */
export function parseDraft(text) {
  const t = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = t.indexOf("{");
  if (start < 0) return null;
  for (let end = t.lastIndexOf("}"); end > start; end = t.lastIndexOf("}", end - 1)) {
    try {
      const j = JSON.parse(t.slice(start, end + 1));
      return isObj(j) && Array.isArray(j.beats) ? j.beats : null;
    } catch {}
  }
  return null;
}

/** The model's beats as clean beats (no ids): names to member ids, a `when` the plan understands, no repeats of the plan, at most DRAFT_MAX_BEATS. */
export function cleanDraft(raw, { named, tags, existing }) {
  const seen = new Set(existing.map((t) => str(t).toLowerCase()));
  const out = [];
  for (const b of arr(raw)) {
    if (!isObj(b)) continue;
    const text = str(b.text).slice(0, BEAT_TEXT_MAX);
    if (!text || seen.has(text.toLowerCase())) continue;
    const w = isObj(b.when) ? b.when : {};
    const when = w.kind === "tag" && tags.includes(w.tag) ? { kind: "tag", tag: w.tag } : { kind: "replies", n: clampInt(w.n, 1, 60, 5) };
    seen.add(text.toLowerCase());
    out.push({ text, who: matchMembers(arr(b.who), named), npc: [], when, wait: true });
    if (out.length >= DRAFT_MAX_BEATS) break;
  }
  return out;
}

/** POST /direction/draft {chatId}: one call on the director's model; the beats come back as a draft and nothing is saved. */
function draftRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!ID.test(chatId)) return ok({ ok: false, error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ ok: false, reason: "no-chat" }, 404);
  const gm = groupMembers(fsx, chat.meta);
  if (!gm || !gm.members.length) return ok({ ok: false, reason: "not-group" });
  const cfg = readConfig(fsx);
  if (!cfg.model) return ok({ ok: false, reason: "no-model" });
  const state = settle(fsx, loadState(fsx, chatId), chat.msgs);
  const userName = userNameOf(fsx, chat.meta);
  const named = memberNames(gm.members, registryOf(fsx, chatId));
  const tags = tagsFor(state.rules.set);
  const existing = state.plan.beats.map((x) => x.text);
  const prompt = buildDraftPrompt({ cards: cardsOf(fsx, gm.members), userName, setName: SETS[state.rules.set] ? SETS[state.rules.set].name : "", tags, existing });
  const res = host.llm && isObj(host.llm.results) ? host.llm.results : {};
  const r = res.direction_draft_retry || res.direction_draft;
  const stash = isObj(req.stash) ? req.stash : {};
  if (!r) {
    host.llm.request("direction_draft", requestFor(prompt, cfg.model, DRAFT_TOKENS));
    return { __llmPending: true, stash: { model: cfg.model, started: Date.now(), retry: false } };
  }
  const again = (maxTokens) => {
    host.llm.request("direction_draft_retry", requestFor(prompt, stash.model || cfg.model, maxTokens));
    return { __llmPending: true, stash: { ...stash, retry: true } };
  };
  if (stash.retry !== true && r.error && isRateLimit(r)) return again(DRAFT_TOKENS);
  if (stash.retry !== true && !r.error && !str(r.text)) return again(thinkingOnly(r) ? RETRY_TOKENS : DRAFT_TOKENS);
  if (r.error) return ok({ ok: false, reason: "error", message: String(r.error).split("\n")[0].slice(0, 300) });
  const parsed = parseDraft(r.text);
  if (!parsed) return ok({ ok: false, reason: "bad-reply", message: thinkingOnly(r) ? "the model spent its whole limit thinking" : "no beats in the answer" });
  const beats = cleanDraft(parsed, { named, tags, existing });
  if (!beats.length) return ok({ ok: false, reason: "empty", message: "the model gave no usable beats" });
  return ok({ ok: true, beats, model: str(r.model) && r.model !== "error" ? str(r.model) : stash.model });
}

function configRoute(req, host) {
  const fsx = host.fs;
  if (req.method === "GET") return ok({ config: readConfig(fsx) });
  const next = cleanConfig({ ...readConfig(fsx), ...(isObj(req.body) ? req.body : {}) });
  fsx.write(CONFIG_FILE, JSON.stringify({ v: 1, ...next }, null, 2));
  return ok({ config: next });
}

function chatRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const gm = groupMembers(fsx, chat.meta);
  if (!gm) return ok({ error: "not a group chat" }, 400);
  const ids = gm.members.map((m) => m.id);
  let st = settle(fsx, loadState(fsx, chatId), chat.msgs);
  if (typeof b.on === "boolean" && b.on !== st.on) st = logLine({ ...st, on: b.on, ...(b.on ? {} : { next: null }) }, { kind: b.on ? "on" : "off" });
  if (b.lock === null && st.lock) {
    // the others come back on the next reply: everyone the lock kept out
    const out = ids.filter((id) => !st.lock.ids.includes(id));
    const last = chat.msgs[chat.msgs.length - 1];
    st = logLine({ ...st, lock: null, returning: out.length && last ? { ids: out, after: keyOf(last), at: Date.now() } : null }, { kind: "release", ids: out });
  } else if (isObj(b.lock)) {
    const lock = idList(b.lock.ids).filter((id) => ids.includes(id));
    if (!lock.length) return ok({ error: "lock needs at least one member of the group" }, 400);
    st = logLine({ ...st, lock: { ids: lock, at: Date.now() }, returning: null }, { kind: "lock", ids: lock });
  }
  saveState(fsx, st);
  return ok({ chat: { on: st.on === true, lock: st.lock, returning: st.returning } });
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (path !== "/direction" && !path.startsWith("/direction/")) return null;
  if (path === "/direction/state" && req.method === "GET") return stateRoute(req, host);
  if (path === "/direction/config" && (req.method === "GET" || req.method === "PUT")) return configRoute(req, host);
  if (path === "/direction/chat" && req.method === "PUT") return chatRoute(req, host);
  if (path === "/direction/run" && req.method === "POST") return runRoute(req, host);
  if (path === "/direction/rules" && req.method === "PUT") return rulesRoute(req, host);
  if (path === "/direction/fire" && req.method === "POST") return fireRoute(req, host);
  if (path === "/direction/skip" && req.method === "POST") return skipRoute(req, host);
  if (path === "/direction/plan" && req.method === "PUT") return planRoute(req, host);
  if (path === "/direction/draft" && req.method === "POST") return draftRoute(req, host);
  if (path === "/direction/sets" && req.method === "GET") return ok({ sets: Object.entries(SETS).map(([id, set]) => ({ id, name: set.name, tags: set.tags, rules: set.rules.map((r) => ({ id: r.id, name: r.name, kind: r.do.kind })), templates: set.templates.length })) });
  return ok({ error: "not found" }, 404);
}

function withLast(messages, text) {
  const last = messages[messages.length - 1];
  if (last && last.role === "user" && typeof last.content === "string") return [...messages.slice(0, -1), { ...last, content: last.content + "\n\n" + text }];
  return [...messages, { role: "user", content: text }];
}

/** Did World put an event or a returning person into this reply already (it runs first)? Both are marked after the message the reply follows. */
function worldCarries(fsx, chatId, msgs, op) {
  const w = readJson(fsx, "world/state/" + chatId + ".json", null);
  if (!isObj(w)) return false;
  const list = arr(msgs).filter(isObj);
  const anchor = list[list.length - (op === "swipe" ? 2 : 1)];
  if (!anchor) return false;
  const ak = keyOf(anchor);
  const sent = (x) => isObj(x) && Number(x.sent) > 0 && x.after === ak;
  return sent(w.event) || sent(w.entrance);
}

/** The reply being swiped carried a rule's note: that firing is open again and queued, so the new try gets the note too. */
function reopenForSwipe(fsx, state, msgs) {
  const list = arr(msgs).filter(isObj);
  const lastMsg = list[list.length - 1];
  if (!lastMsg || !isReply(lastMsg)) return state;
  const f = state.fires.find((x) => x.carrier && x.carrier === keyOf(lastMsg));
  if (!f || state.next) return state;
  const next = { ...state, next: nextOf(f), fires: state.fires.map((x) => (x.id === f.id ? { ...x, result: null, carrier: "" } : x)) };
  saveState(fsx, next);
  return next;
}

/** The lock and the return ride the reply, appended to the newest user message (where World puts its event). */
export function llmRequest(ctx, host) {
  if (!ctx || ctx.key !== "reply") return null;
  const req = ctx.request || {};
  const chatId = String(req.sessionId || "");
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx || !ID.test(chatId) || !Array.isArray(req.messages)) return null;
  const turn = isObj(ctx.turn) ? ctx.turn : isObj(req.turn) ? req.turn : {};
  const op = str(turn.op);
  if (!OPS.includes(op)) return null;
  try {
    const raw = readJson(fsx, stateFile(chatId), null);
    if (!isObj(raw)) return null;
    const chat = readChat(fsx, chatId);
    if (!chat) return null;
    const gm = groupMembers(fsx, chat.meta);
    if (!gm) return null;
    let state = cleanState(raw, chatId);
    const userName = userNameOf(fsx, chat.meta);
    // a swipe of the reply that carried a rule's note asks for the same moment again: the note is open again
    if (op === "swipe") state = reopenForSwipe(fsx, state, chat.msgs);
    const parts = sceneLines({ state, members: gm.members, userName, msgs: chat.msgs, op });
    // a rule's queued note: the lock and the return come first, and so does anything World already put into this reply
    if (state.on === true && state.next && dueAfter(state.next.after, chat.msgs, op)) {
      const why = parts.length ? "direction" : worldCarries(fsx, chatId, chat.msgs, op) ? "world" : "";
      const isBeat = state.next.kind === "beat";
      const people = arr(state.next.npc).length ? worldPeople(fsx, chatId, memberNames(gm.members, registryOf(fsx, chatId)), userName) : [];
      const beat = isBeat ? state.plan.beats.find((x) => beatRuleId(x.id) === state.next.rule) : null;
      const note = why ? null : isBeat ? beatNote({ next: state.next, beat, members: gm.members, userName, people, tries: beat ? beatOutcome(state, beat).tries : 0 }) : ruleNote({ next: state.next, members: gm.members, userName, people });
      if (note) parts.push({ label: isBeat ? "Direction · beat" : "Direction · rule", text: note });
      else {
        const id = state.next.id;
        const rule = state.next.rule;
        const who = state.next.who;
        const npc = state.next.npc || [];
        saveState(fsx, logLine({ ...state, next: null, fires: state.fires.map((f) => (f.id === id ? { ...f, result: "yielded" } : f)) }, { kind: "result", rule, result: "yielded", by: why || "empty", who, npc }));
      }
    }
    if (!parts.length) return null;
    return { messages: withLast(req.messages, parts.map((p) => p.text).join("\n\n")), promptSources: { parts: parts.map((p) => ({ kind: "plugin", label: p.label, text: p.text })) } };
  } catch {
    return null;
  }
}
