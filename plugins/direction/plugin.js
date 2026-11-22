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
 *    fires: [{ id, rule, kind, who, with, after, n, roll, tension, hold, payoff, result, carrier, forced, why, at }] }
 */

export const TAGS = ["lesson", "break", "lunch", "club", "commute", "group_out", "date", "alone_moment", "at_home", "event"];
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
  return { v: 1, chatId, on: null, lock: null, returning: null, reports: [], log: [], usage: { input: 0, output: 0, runs: 0 }, rules: { set: "", on: false, edits: {} }, next: null, fires: [] };
}

// ---------- genre rules (phase 2) ----------
const FIRES_KEEP = 40;
export const KINDS = ["interrupt", "join", "return"];
export const RESULTS = ["came", "mentioned", "missed", "yielded"];
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
    return { ...d, on: e.on !== false, need: e.need !== undefined ? e.need : d.need, cooldown: e.cooldown !== undefined ? e.cooldown : d.cooldown, payoff: k > 0 && m > 0 ? { k, m } : null };
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
const nextOf = (f) => ({ id: f.id, rule: f.rule, kind: f.kind, who: f.who, with: f.with, after: f.after, forced: f.forced, at: f.at });
function cleanNext(raw) {
  if (!isObj(raw) || !str(raw.id) || !str(raw.rule) || !KINDS.includes(raw.kind) || !str(raw.after)) return null;
  const who = refList(raw.who);
  return who.length ? { id: str(raw.id).slice(0, 60), rule: str(raw.rule).slice(0, 60), kind: raw.kind, who, with: refList(raw.with), after: str(raw.after), forced: raw.forced === true, at: Number(raw.at) || 0 } : null;
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

/** The director's prompt: the members, its own log of the last turns, the reply before as background, and the new pair. */
export function buildPrompt({ members, userName, log, prev, player, reply }) {
  const user = str(userName) || "the player";
  const system = [
    "You are the director of a group roleplay. The player plays " + user + ". After each turn you read the newest messages and report the scene for the code that runs the story's rules. You never write the story.",
    "Members: " + members.map((m) => m.name).join(", ") + ".",
    "",
    "Report:",
    "- tag: the kind of scene at the end of the new messages, one of: " + TAG_WORDS.map((t) => t.replace(/\{user\}/g, user)).join("; ") + ".",
    "- present: the members physically in the scene at the end of the new messages, with their names exactly as in the list above, never " + user + ". Someone who only texts, calls or is talked about is not present.",
    "- sceneNew: true when the new messages move to another place or skip more than about 30 minutes.",
    "",
    'Reply with one JSON object: { "tag": "...", "present": ["..."], "sceneNew": false }. No prose, no code fences.',
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
      return { tag: str(j.tag).toLowerCase(), present: arr(j.present).map(str).filter(Boolean), sceneNew: j.sceneNew === true };
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
  const changed = reports.length !== state.reports.length || returning !== state.returning || next !== state.next || firesChanged;
  return changed ? { ...state, reports, returning, next, fires } : state;
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
export function evalRule(rule, { rows, members, rnd }) {
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
  const order = candidatesFor(rows, members, here, rnd);
  if (!order.length) return { ok: false };
  const count = rule.do.kind === "join" ? Math.max(1, rule.do.count || 1) : 1;
  const who = order.slice(0, count);
  return { ok: true, who, with: rule.do.kind === "return" ? [] : here.slice(0, 4), why: why.join("; ") };
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
export function decideRules({ state, msgs, members, chatId, dashDirection, now }) {
  const none = { fire: null, logs: [] };
  if (state.on !== true || !state.rules.on || state.lock || dashDirection === "explicit") return none;
  const rules = activeRules(state.rules).filter((r) => r.on);
  const rows = replyRows(state, msgs);
  const last = rows[rows.length - 1];
  if (!rules.length || !last || !last.report || state.fires.some((f) => f.after === last.key) || (state.next && state.next.after === last.key)) return none;
  const total = rows.length;
  const logs = [];
  for (const rule of rules) {
    const found = evalRule(rule, { rows, members, rnd: seededRandom(chatId + "|" + rule.id + "|" + last.key + "|pick") });
    if (!found.ok) continue;
    const prev = lastFireOf(state, rule.id);
    if (prev && total - prev.n < prev.hold) continue;
    const roll = roll2d6(chatId + "|" + rule.id + "|" + last.key, rule.need);
    if (roll.total < rule.need) {
      logs.push({ at: now, key: last.key, kind: "rule", rule: rule.id, state: "missed", roll, who: found.who, with: found.with, why: found.why });
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
    logs.push({ at: now, key: last.key, kind: "rule", rule: rule.id, state: "fired", roll, who: found.who, with: found.with, why: found.why, payoff });
    return { fire, logs };
  }
  return { fire: null, logs };
}

/** The queued note, once its carrier reply has been reported: did they come (in the report's present), only get mentioned, or did it miss. */
export function judgeNext(state, report, msgs, named) {
  const next = state.next;
  if (!next) return state;
  const carrier = carrierOf(next.after, msgs);
  if (!carrier) return state;
  const text = String(carrier.text || "").toLowerCase();
  const sameReply = keyOf(carrier) === report.key;
  let result = "missed";
  if (sameReply) {
    if (next.who.some((id) => report.present.includes(id))) result = "came";
    else if (next.who.some((id) => ((named.find((n) => n.id === id) || {}).names || []).some((n) => n.length >= 3 && text.includes(n)))) result = "mentioned";
  }
  const fires = state.fires.map((f) => (f.id === next.id ? { ...f, result, carrier: keyOf(carrier) } : f));
  return { ...state, next: null, fires, log: [...state.log, { at: Date.now(), key: keyOf(carrier), kind: "result", rule: next.rule, result, who: next.who }].slice(-LOG_KEEP) };
}

const nameList = (names) => (names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1]);

/** The note a queued rule puts into its reply (the bench's template notes). */
export function ruleNote({ next, members, userName }) {
  const user = str(userName) || "the player";
  const who = next.who.map((id) => nameOfId(members, id)).filter(Boolean);
  if (!who.length) return null;
  const others = next.with.map((id) => nameOfId(members, id)).filter(Boolean);
  const group = others.length ? user + " and " + nameList(others) : user;
  const what =
    next.kind === "interrupt" ? nameList(who) + " walks in on " + group + " and interrupts the moment."
    : next.kind === "join" ? nameList(who) + " joins " + group + " here."
    : nameList(who) + " " + (who.length === 1 ? "comes" : "come") + " back into the scene and " + (who.length === 1 ? "joins" : "join") + " " + user + ".";
  return "[SCENE EVENT: must happen in this reply]\nWhat: " + what + "\nHow: bring it into this reply as part of the scene; the characters react in character.\nDo not: explain where it came from or mention a director.";
}

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
function inputFor(state, msgs, members, userName) {
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
  return { key: keyOf(reply), prompt: buildPrompt({ members, userName, log, prev, player, reply: String(reply.text || "") }) };
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
  const res = host.llm && isObj(host.llm.results) ? host.llm.results : {};
  const r = res.direction_retry || res.direction;
  const stash = isObj(req.stash) ? req.stash : {};
  if (!r) {
    if (state.on !== true) return ok({ ok: false, reason: "off" });
    if (!cfg.model) return ok({ ok: false, reason: "no-model" });
    const input = inputFor(state, chat.msgs, gm.members, userName);
    if (!input) return ok({ ok: false, reason: "no-reply" });
    if (b.force !== true && state.reports.some((x) => x.key === input.key)) return ok({ ok: false, reason: "done" });
    host.llm.request("direction", requestFor(input.prompt, cfg.model, MAX_TOKENS));
    return { __llmPending: true, stash: { key: input.key, model: cfg.model, started: Date.now(), retry: false } };
  }
  const input = inputFor(state, chat.msgs, gm.members, userName);
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
  const named = memberNames(gm.members, registryOf(fsx, chatId));
  const present = matchMembers(parsed.present, named);
  const report = { key: stash.key, at: now, tag: applyPrecedence(parsed.tag, present.length), present, sceneNew: parsed.sceneNew, model: str(r.model) && r.model !== "error" ? str(r.model) : stash.model, ms, ...(usage ? { usage } : {}) };
  let st = { ...state, reports: [...state.reports.filter((x) => x.key !== report.key), report].slice(-REPORTS_KEEP) };
  // the return is spent once a reply after it was read
  if (st.returning && !returnDue(st, chat.msgs, "send")) st = { ...st, returning: null };
  st = logLine(counted(st), { key: report.key, kind: "report", tag: report.tag, present: report.present, sceneNew: report.sceneNew, model: report.model, ms, ...(usage ? { usage } : {}), ...(retry ? { retried: true } : {}) });
  // genre rules: judge the note this reply carried, then decide the next one
  st = judgeNext(st, report, chat.msgs, named);
  const decided = decideRules({ state: st, msgs: chat.msgs, members: gm.members, chatId, dashDirection: dashboardDirection(fsx, chatId), now });
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
  const rules = activeRules(state.rules).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.do.kind,
    on: r.on,
    need: r.need,
    cooldown: r.cooldown,
    k: r.payoff ? r.payoff.k : 0,
    m: r.payoff ? r.payoff.m : 0,
    when: r.when,
    ...ruleStatus(state, r, total),
  }));
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
  });
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
  const rule = activeRules(st0.rules).find((r) => r.id === b.rule);
  if (!rule) return ok({ error: "unknown rule" }, 400);
  const rows = replyRows(st0, chat.msgs);
  const last = rows[rows.length - 1];
  if (!last) return ok({ error: "no reply yet" }, 400);
  const named = memberNames(gm.members, registryOf(fsx, chatId));
  const here = last.report ? last.report.present : (() => { const d = dashboardPresent(fsx, chatId); return d ? matchMembers(d, named) : null; })();
  if (!here) return ok({ error: "the scene is not known yet" }, 400);
  const now = Date.now();
  const order = candidatesFor(rows, gm.members, here, seededRandom(chatId + "|" + rule.id + "|" + last.key + "|now|" + now));
  if (!order.length) return ok({ error: "everyone is already here" }, 400);
  const fire = {
    id: "f" + now.toString(36) + rule.id.slice(0, 6),
    rule: rule.id,
    kind: rule.do.kind,
    who: order.slice(0, rule.do.kind === "join" ? Math.max(1, rule.do.count || 1) : 1),
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
  const st = logLine({ ...st0, fires, next: nextOf(fire) }, { key: last.key, kind: "rule", rule: rule.id, state: "fired", who: fire.who, with: fire.with, why: fire.why, forced: true });
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
  const st = logLine({ ...st0, next: null, fires: st0.fires.filter((f) => f.id !== id) }, { kind: "skip", rule: st0.next.rule, who: st0.next.who });
  saveState(fsx, st);
  return ok({ next: null });
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
      const note = why ? null : ruleNote({ next: state.next, members: gm.members, userName });
      if (note) parts.push({ label: "Direction · rule", text: note });
      else {
        const id = state.next.id;
        const rule = state.next.rule;
        const who = state.next.who;
        saveState(fsx, logLine({ ...state, next: null, fires: state.fires.map((f) => (f.id === id ? { ...f, result: "yielded" } : f)) }, { kind: "result", rule, result: "yielded", by: why || "empty", who }));
      }
    }
    if (!parts.length) return null;
    return { messages: withLast(req.messages, parts.map((p) => p.text).join("\n\n")), promptSources: { parts: parts.map((p) => ({ kind: "plugin", label: p.label, text: p.text })) } };
  } catch {
    return null;
  }
}
