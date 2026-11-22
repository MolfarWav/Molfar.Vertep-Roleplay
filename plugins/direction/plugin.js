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
 *
 * Files (fs root = the app's data/):
 *  direction/config.json              { v: 1, model }
 *  direction/state/<chatId>.json      { v: 1, chatId, on, lock: { ids, at } | null, returning: { ids, after, at } | null,
 *    reports: [{ key, at, tag, present: [member id], sceneNew, model, ms, usage? }], log: [{ at, key?, kind, ... }],
 *    usage: { input, output, runs } }
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
  return { v: 1, chatId, on: null, lock: null, returning: null, reports: [], log: [], usage: { input: 0, output: 0, runs: 0 } };
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

/** Takes back what a swipe or a delete removed: reports of replies no longer on the line, a return whose anchor is gone. */
export function reconcile(state, msgs) {
  const line = new Set(arr(msgs).filter(isObj).map(keyOf));
  const reports = state.reports.filter((r) => line.has(r.key));
  const returning = state.returning && line.has(state.returning.after) ? state.returning : null;
  const changed = reports.length !== state.reports.length || returning !== state.returning;
  return changed ? { ...state, reports, returning } : state;
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
  if (!state.returning) return false;
  const list = arr(msgs).filter(isObj);
  const at = list.findIndex((m) => keyOf(m) === state.returning.after);
  if (at < 0) return false;
  let after = list.slice(at + 1).filter(isReply).length;
  if (op === "swipe" && after > 0 && isReply(list[list.length - 1])) after--;
  return after === 0;
}

const nameList = (names) => (names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1]);

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

/**
 * Who is in the scene now, by member id, and where that comes from: the lock (the player), the director's newest report, the
 * Dashboard, or nothing known. The engine plugin's `directionScene` reads the same file the same way.
 */
export function sceneNow(state, msgs, members, named, dashNames) {
  const ids = members.map((m) => m.id);
  const back = state.returning && returnDue(state, msgs, "send") ? state.returning.ids : [];
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
  return ok({
    config: cfg,
    chat: { on: state.on === true, lock: state.lock, returning: state.returning && returnDue(state, chat.msgs, "send") ? state.returning : null },
    scene,
    report,
    members,
    log: state.log.slice().reverse(),
    usage: state.usage,
  });
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
  if (typeof b.on === "boolean" && b.on !== st.on) st = logLine({ ...st, on: b.on }, { kind: b.on ? "on" : "off" });
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
  return ok({ error: "not found" }, 404);
}

function withLast(messages, text) {
  const last = messages[messages.length - 1];
  if (last && last.role === "user" && typeof last.content === "string") return [...messages.slice(0, -1), { ...last, content: last.content + "\n\n" + text }];
  return [...messages, { role: "user", content: text }];
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
    const state = cleanState(raw, chatId);
    const parts = sceneLines({ state, members: gm.members, userName: userNameOf(fsx, chat.meta), msgs: chat.msgs, op });
    if (!parts.length) return null;
    return { messages: withLast(req.messages, parts.map((p) => p.text).join("\n\n")), promptSources: { parts: parts.map((p) => ({ kind: "plugin", label: p.label, text: p.text })) } };
  } catch {
    return null;
  }
}
