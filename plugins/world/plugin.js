/**
 * World DM (GitHub #52; design: engine repo .fork/handoff/world-dm/DESIGN.md).
 *
 * The Dashboard owns the scene, Litopys the past, prose is canon. The DM owns
 * the world off screen. After a reply, on the player's schedule (every N
 * replies, or the "World turn" button), a DM model reads the new part of the
 * story and returns small JSON, never prose. Code turns it into the chat's own
 * world lorebook: one entry per person, place, group, thing or fact that
 * matters beyond the scene. A retired entry (a dead villain) is kept: cut to
 * one or two sentences, fired by its name only.
 *
 * Levels: off; chronicler (records only); living (fronts with clocks tick off
 * screen, news reaches the party as a soft rumour); director (hooks,
 * complications, visitors: a hard event); antagonist (pressure and
 * consequences, aimed at the Dashboard's threads and relations); chaos
 * (ignores genre and logic). Fronts: Blades in the Dark / Dungeon World.
 * An event rides ONE reply through the llmRequest hook, after the chat history;
 * the next run checks the prose, re-sends a missed event once, then drops it.
 *
 * Scene direction comes from the Dashboard sensor (its snapshot's
 * scene.direction): explicit freezes the DM (no run, no event, chaos too),
 * combat pauses stagnation and new events below antagonist, transition runs
 * the DM at once. Without the Dashboard the DM names the direction itself.
 *
 * Routes (under /v1/apps/roleplay/):
 *  GET  /world/state?chatId=          the chat's DM: settings, counts, when it runs next, last error
 *  PUT  /world/settings {chatId, level?, everyN?, stagnation?, onTransition?, insert?}   the chat's DM settings
 *  GET  /world/peek?chatId=           the world book's records, for the player who asks (fronts and events stay hidden)
 *  GET  /world/config?chatId=         the DM's models and reply limit (all chats), with the models in force
 *  PUT  /world/config {model?, buildModel?, maxTokens?}
 *  GET  /world/chats                  every chat with a DM, for the World section's list
 *  GET  /world/runs?chatId=           the chat's run history, newest first (tokens, time, errors)
 *  POST /world/test {chatId?, which?}  one tiny call to the play (or build) model: works, or why not
 *  GET  /world/profiles               the DM profiles: five built in (the levels), the player's own; prompt blocks with defaults
 *  PUT  /world/profiles {id?, name?, description?, base?, blocks?, defaults?}   change one (a block set to null goes back
 *                                     to its default), or make a new one (no id, or an id not in use)
 *  DELETE /world/profiles?id=         remove one of the player's own (chats on it fall back to its base)
 *  PUT  /world/records {chatId, op: add|update|retire|restore|delete, record}   the player edits the world book by hand
 *  POST /world/update {chatId, auto?}  a DM run (two-phase); auto = the app's call after a reply,
 *                                      which runs only when a trigger is due; without auto it always runs
 *                                      (except in an explicit scene)
 *
 * Hook: llmRequest adds the pending event to the last user message of a reply request.
 *
 * Files (fs root = the app's data/):
 *  world/state/<chatId>.json   the chat's world state (shape: normalizeState)
 *  world/config.json           only what differs from the defaults
 *  world/profiles/<id>.json    a built-in profile's changes (only blocks that differ) or a player's own profile
 *  lorebooks/world-<chatId>.json  the chat's world book: ownerChatId = the chat, so the app's
 *                              library never lists it; the chat's meta names it as worldBookId,
 *                              and the engine plugin scans it in that chat only
 */

const STATE_DIR = "world/state/";
const CONFIG_FILE = "world/config.json";
const CHAT_ID = /^[A-Za-z0-9_-]{1,120}$/;
// a player's own profile: "p-" and a slug, never a level's name
const OWN_PROFILE_ID = /^p-[a-z0-9-]{1,40}$/;
const MODEL_REF = /^[^\s]{1,200}$/;

export const LEVELS = ["off", "chronicler", "living", "director", "antagonist", "chaos"];
/** The levels that work today (all of them since P2). */
export const READY_LEVELS = LEVELS;
/** Levels whose events are a MUST for the writing model; living sends soft rumours. */
const HARD_LEVELS = ["director", "antagonist", "chaos"];
export const DIRECTIONS = ["domestic", "social", "intrigue", "investigation", "travel", "combat", "explicit", "transition"];
/** Stagnation threshold per direction: x2 slow, x0.5 fast, 0 = the counter is paused. */
const STAGNATION_FACTOR = { domestic: 2, social: 1, intrigue: 1, investigation: 1, travel: 0.5, combat: 0, explicit: 0, transition: 1 };
export const KINDS = ["person", "place", "group", "thing", "fact"];

export const DEFAULT_SETTINGS = { level: "off", everyN: 5, stagnation: 6, onTransition: true, insert: true, profile: "" };
// model = the play model (runs after replies), buildModel = the one that builds worlds (P3 Start)
export const DEFAULT_CONFIG = { model: "", buildModel: "", maxTokens: 1500 };

// what a run reads and writes, kept small for small context windows
const NEW_TEXT_MAX = 8000;
const MSG_MAX = 2500;
// below this share per message a run reads fewer messages (catch-up) instead of cutting each one thinner
const MSG_MIN = 400;
const LINE_EXTRA = 40;
// a retry after a reply that was all thinking gets this many times the room, at most RETRY_MAX
const RETRY_FACTOR = 3;
const RETRY_MAX = 12000;
const NAME_MAX = 80;
const TEXT_MAX = 600;
const PAST_TEXT_MAX = 240;
const ALIASES_MAX = 6;
const ENTITIES_MAX = 300;
const CHANGES_MAX = 8;
const LOG_MAX = 30;
const FRONTS_MAX = 8;
const EVENT_MAX = 400;
const CLOCK_SIZES = [4, 6, 8];

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const arr = (v) => (Array.isArray(v) ? v : []);
const cut = (s, n) => (s.length > n ? s.slice(0, n) : s);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const ok = (json, status) => ({ status: status || 200, json });

const readJson = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};
const writeJson = (fsx, path, v) => fsx.write(path, JSON.stringify(v, null, 2));

// ---------- config (all chats) ----------
export function loadConfig(fsx) {
  const c = readJson(fsx, CONFIG_FILE, {});
  return cleanConfig({ ...DEFAULT_CONFIG, ...(isObj(c) ? c : {}) });
}

function cleanConfig(c) {
  const model = str(c.model);
  const build = str(c.buildModel);
  const n = Number(c.maxTokens);
  return {
    model: MODEL_REF.test(model) ? model : "",
    buildModel: MODEL_REF.test(build) ? build : "",
    maxTokens: Number.isFinite(n) ? clamp(Math.round(n), 500, 8000) : DEFAULT_CONFIG.maxTokens,
  };
}

// ---------- state (one chat) ----------
export const bookIdOf = (chatId) => "world-" + chatId;
const statePath = (chatId) => STATE_DIR + chatId + ".json";

export function emptyState(chatId) {
  return { v: 1, chatId, bookId: bookIdOf(chatId), settings: { ...DEFAULT_SETTINGS }, lastKey: null, nextId: 1, entities: [], nextFront: 1, fronts: [], event: null, log: [] };
}

function cleanSettings(s) {
  const b = isObj(s) ? s : {};
  const level = LEVELS.includes(b.level) ? b.level : DEFAULT_SETTINGS.level;
  const n = Number(b.everyN);
  const st = Number(b.stagnation);
  return {
    level,
    everyN: Number.isFinite(n) ? clamp(Math.round(n), 1, 50) : DEFAULT_SETTINGS.everyN,
    // 0 = no stagnation trigger
    stagnation: Number.isFinite(st) ? clamp(Math.round(st), 0, 50) : DEFAULT_SETTINGS.stagnation,
    onTransition: typeof b.onTransition === "boolean" ? b.onTransition : DEFAULT_SETTINGS.onTransition,
    insert: typeof b.insert === "boolean" ? b.insert : DEFAULT_SETTINGS.insert,
    // a player's own profile on top of the level (its base); "" = the level's built-in profile
    profile: level !== "off" && OWN_PROFILE_ID.test(str(b.profile)) ? str(b.profile) : "",
  };
}

/** A front: a faction or threat with a goal and a clock (0..size; full = it happens). */
function cleanFront(f) {
  if (!isObj(f)) return null;
  const id = str(f.id);
  const name = cut(str(f.name), NAME_MAX);
  if (!name || !/^f\d{1,6}$/.test(id)) return null;
  const size = CLOCK_SIZES.includes(Number(f.size)) ? Number(f.size) : 6;
  const clock = Number.isFinite(Number(f.clock)) ? clamp(Math.round(Number(f.clock)), 0, size) : 0;
  return { id, name, goal: cut(str(f.goal), TEXT_MAX), clock, size, status: f.status === "past" ? "past" : "active", ...(Number.isFinite(f.at) ? { at: f.at } : {}) };
}

/** The event waiting for a reply: text, hard or soft, sent (how many replies carried it), retried once. */
function cleanEvent(e) {
  if (!isObj(e) || !str(e.text)) return null;
  return {
    text: cut(str(e.text), EVENT_MAX),
    hard: e.hard === true,
    sent: Number.isInteger(e.sent) && e.sent > 0 ? e.sent : 0,
    retried: e.retried === true,
    ...(Number.isFinite(e.at) ? { at: e.at } : {}),
    ...(Number.isFinite(e.sentAt) ? { sentAt: e.sentAt } : {}),
  };
}

function cleanAliases(v, name) {
  const out = [];
  for (const a of arr(v)) {
    const s = cut(str(a), NAME_MAX);
    if (s && s.toLowerCase() !== name.toLowerCase() && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= ALIASES_MAX) break;
  }
  return out;
}

/** One record of the world: kept to known fields and sizes; null when it has no name. */
function cleanEntity(e) {
  if (!isObj(e)) return null;
  const name = cut(str(e.name), NAME_MAX);
  const id = str(e.id);
  if (!name || !/^[a-z]\d{1,6}$/.test(id)) return null;
  const past = e.status === "past";
  const text = cut(str(e.text), past ? PAST_TEXT_MAX : TEXT_MAX);
  return {
    id,
    kind: KINDS.includes(e.kind) ? e.kind : "fact",
    name,
    aliases: cleanAliases(e.aliases, name),
    text,
    status: past ? "past" : "active",
    uid: Number.isInteger(e.uid) && e.uid > 0 ? e.uid : 0,
    ...(Number.isFinite(e.at) ? { at: e.at } : {}),
    // written or changed by the player by hand (the Records tab)
    ...(e.by === "player" ? { by: "player" } : {}),
  };
}

/** The state file as code trusts it: anything unknown or malformed is dropped. */
export function normalizeState(raw, chatId) {
  const s = isObj(raw) ? raw : {};
  const out = emptyState(chatId);
  out.settings = cleanSettings(s.settings);
  if (typeof s.lastKey === "string" && s.lastKey) out.lastKey = s.lastKey;
  const entities = [];
  for (const e of arr(s.entities)) {
    const c = cleanEntity(e);
    if (c && !entities.some((x) => x.id === c.id)) entities.push(c);
    if (entities.length >= ENTITIES_MAX) break;
  }
  out.entities = entities;
  const maxId = entities.reduce((m, e) => Math.max(m, Number(e.id.slice(1)) || 0), 0);
  out.nextId = Math.max(Number.isInteger(s.nextId) ? s.nextId : 1, maxId + 1);
  const fronts = [];
  for (const f of arr(s.fronts)) {
    const c = cleanFront(f);
    if (c && !fronts.some((x) => x.id === c.id)) fronts.push(c);
  }
  out.fronts = fronts.slice(-FRONTS_MAX * 3);
  out.nextFront = Math.max(Number.isInteger(s.nextFront) ? s.nextFront : 1, fronts.reduce((m, f) => Math.max(m, Number(f.id.slice(1)) || 0), 0) + 1);
  out.event = cleanEvent(s.event);
  if (DIRECTIONS.includes(s.direction)) out.direction = s.direction;
  if (typeof s.transitionKey === "string") out.transitionKey = s.transitionKey;
  if (Number.isInteger(s.clockReplies) && s.clockReplies > 0) out.clockReplies = s.clockReplies;
  out.log = arr(s.log).filter(isObj).slice(-LOG_MAX);
  if (Number.isFinite(s.lastRunAt)) out.lastRunAt = s.lastRunAt;
  if (str(s.lastModel)) out.lastModel = str(s.lastModel);
  if (isObj(s.lastError) && str(s.lastError.message)) out.lastError = cleanError(s.lastError);
  if (isObj(s.usage)) out.usage = cleanUsage(s.usage, true);
  return out;
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);

/** Tokens of one run (input, output, cost when the provider prices it); totals also count runs. */
function cleanUsage(u, totals) {
  const b = isObj(u) ? u : {};
  return { input: Math.round(num(b.input)), output: Math.round(num(b.output)), cost: num(b.cost), ...(totals ? { runs: Math.round(num(b.runs)) } : {}) };
}

/** The limit a run went out with: max output tokens and the model block it came from (null = the DM's own). */
function cleanLimit(l) {
  if (!isObj(l) || !Number.isFinite(Number(l.max))) return null;
  return { max: Math.round(Number(l.max)), block: str(l.block) ? cut(str(l.block), 80) : null, fromModel: l.fromModel === true };
}

export const ERROR_CODES = ["thinking", "thinking-block", "reasoning-off", "rate", "context", "auth", "model", "not-json", "empty", "other"];

/** A failed run as the app shows it: a code it can say in the player's language, the plain message, the raw text for "details". */
function cleanError(e) {
  const limit = cleanLimit(e.limit);
  return {
    at: Number(e.at) || 0,
    code: ERROR_CODES.includes(e.code) ? e.code : "other",
    message: cut(str(e.message), 400),
    ...(str(e.details) ? { details: cut(str(e.details), 1200) } : {}),
    ...(limit ? { limit } : {}),
  };
}

export function loadState(fsx, chatId) {
  const raw = readJson(fsx, statePath(chatId), null);
  return { state: normalizeState(raw, chatId), existed: isObj(raw) };
}

function saveState(fsx, state) {
  writeJson(fsx, statePath(state.chatId), state);
}

// ---------- chat ----------
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

const keyOf = (m) => m.id + "#" + (Number.isFinite(m.swipe) ? m.swipe : 0);
const isReply = (m) => m.role !== "user" && m.role !== "system";

/** The messages after the one the DM read last (all of them when it never ran or that message is gone). */
export function unreadMessages(msgs, lastKey) {
  if (!lastKey) return msgs;
  const id = String(lastKey).split("#")[0];
  const i = msgs.findIndex((m) => String(m.id) === id);
  return i < 0 ? msgs : msgs.slice(i + 1);
}

const textLen = (m) => (str(m.text) ? String(m.text).trim().length : 0);

/** The largest per-message size c with sum(min(len, c)) <= budget, at most MSG_MAX. */
function fairCap(lens, budget) {
  let lo = 0;
  let hi = MSG_MAX;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lens.reduce((n, l) => n + Math.min(l, mid), 0) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * What one run reads of the unread messages: { msgs, cap, rest }. All of them when each can keep
 * at least MSG_MIN chars (long ones are cut in the middle to a fair share of NEW_TEXT_MAX, so no
 * message is lost); else the oldest ones that fit, and `rest` waits for the next run (catch-up).
 */
export function takeUnread(unread) {
  const lens = unread.map(textLen);
  // each line also carries "[name] " and a newline
  const cap = fairCap(lens, NEW_TEXT_MAX - LINE_EXTRA * unread.length);
  if (cap >= MSG_MIN || unread.length <= 1) return { msgs: unread, cap: Math.max(cap, MSG_MIN), rest: [] };
  let size = 0;
  let n = 0;
  while (n < unread.length && (n === 0 || size + Math.min(lens[n], MSG_MAX) + LINE_EXTRA <= NEW_TEXT_MAX)) size += Math.min(lens[n++], MSG_MAX) + LINE_EXTRA;
  return { msgs: unread.slice(0, n), cap: MSG_MAX, rest: unread.slice(n) };
}

/** How far behind the DM is: unread messages one run cannot read, and the runs it takes to read them all. */
export function behindOf(unread) {
  let rest = unread;
  let runs = 0;
  while (rest.length && runs < 200) {
    const take = takeUnread(rest);
    rest = take.rest;
    runs++;
  }
  const first = takeUnread(unread).rest.length;
  return { messages: first, runs: first ? runs : 0 };
}

/**
 * The scene as the Dashboard sensor saw it last on the chat's active line: { direction, before,
 * key, stagnant } (stagnant = turns since the place, the cast or the scene last changed), or
 * null when the Dashboard has no snapshot for this chat.
 */
export function sceneOf(fsx, chatId, msgs) {
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const snaps = isObj(dash) && isObj(dash.snapshots) ? dash.snapshots : null;
  if (!snaps) return null;
  const line = msgs.map(keyOf).filter((k) => isObj(snaps[k]));
  if (!line.length) return null;
  const last = snaps[line[line.length - 1]];
  const sig = (sn) => [isObj(sn.clock) ? str(sn.clock.place) : "", arr(sn.present).slice().sort().join("|")].join("/");
  let stagnant = 0;
  for (let i = line.length - 1; i >= 0; i--) {
    const sn = snaps[line[i]];
    if ((isObj(sn.scene) && sn.scene.new === true) || sig(sn) !== sig(last)) break;
    stagnant++;
  }
  const sc = isObj(last.scene) ? last.scene : {};
  return {
    key: line[line.length - 1],
    direction: DIRECTIONS.includes(sc.direction) ? sc.direction : null,
    before: DIRECTIONS.includes(sc.before) ? sc.before : null,
    stagnant,
  };
}

/** The direction the DM goes by: the sensor's, else what the DM said last time. */
const directionOf = (state, scene) => (scene && scene.direction) || state.direction || null;

/**
 * Why an automatic run is due now, or null: "every" (N replies), "stagnation" (the scene stood
 * still long enough for its direction), "transition" (a time skip, once per sensor snapshot).
 * Nothing runs in an explicit scene.
 */
export function dueReason(state, msgs, scene) {
  const dir = directionOf(state, scene);
  if (dir === "explicit") return null;
  if (state.settings.onTransition && scene && scene.direction === "transition" && state.transitionKey !== scene.key) return "transition";
  if (dueIn(state, msgs) === 0) return "every";
  if (state.settings.stagnation > 0 && scene) {
    const factor = STAGNATION_FACTOR[dir || "social"];
    // the still stretch counts from the last run too, or a scene that stays still would run the DM every reply
    const still = Math.min(scene.stagnant, unreadMessages(msgs, state.lastKey).filter(isReply).length);
    if (factor > 0 && still >= Math.max(1, Math.round(state.settings.stagnation * factor))) return "stagnation";
  }
  return null;
}

/** How many replies until the next automatic run (0 = due now). */
export function dueIn(state, msgs) {
  const replies = unreadMessages(msgs, state.lastKey).filter(isReply).length;
  return Math.max(0, state.settings.everyN - replies);
}

function memberIds(fsx, meta) {
  const ids = meta.groupId ? arr(readJson(fsx, "groups/" + meta.groupId + ".json", {}).memberIds) : meta.characterId ? [meta.characterId] : [];
  return ids.filter((id) => typeof id === "string" && CHAT_ID.test(id));
}

function cardNames(fsx, meta) {
  const names = [];
  for (const id of memberIds(fsx, meta)) {
    const card = readJson(fsx, "characters/" + id + "/card.json", null);
    const name = isObj(card) ? str(card.name) || (isObj(card.data) ? str(card.data.name) : "") : "";
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function userNameOf(fsx, meta) {
  if (str(meta.userName)) return str(meta.userName);
  if (meta.personaId && CHAT_ID.test(String(meta.personaId))) {
    const persona = readJson(fsx, "personas/" + meta.personaId + ".json", null);
    if (persona && str(persona.name)) return str(persona.name);
  }
  return "";
}

// ---------- the DM call ----------
const CHRONICLER_RULES = [
  "You are the world keeper of an ongoing roleplay story. You read the newest part of the story and keep the record of its world: people, places, groups, things and facts that matter beyond this one scene. Another model writes the story; it reads your record when a name comes up again.",
  "Rules:",
  "- The story text is canon. Record only what it shows or plainly says. Never invent events, and never contradict the story.",
  "- Do not record the user's character or the characters listed as having their own cards: they are kept elsewhere.",
  "- Skip what does not matter beyond this scene: a nameless passer-by, the furniture, a passing mood.",
  "- One record per person, place, group, thing or fact. Its text is one to three short sentences in the present tense: what someone needs to know when the name comes up again (who or what it is, where, how it stands toward the characters).",
  "- Update a record only when the story changed something about it (it moved, was hurt, a secret came out). Never update a record just to reword it.",
  "- Retire a record when it is finished for good (dead, destroyed, gone from the story for good). Its text then says in one or two sentences who or what it was and how it ended.",
  "- aliases: other names the story uses for it (a nickname, a title, a short name), exactly as the story spells them.",
  "- Write names and text in the language and script of the story's replies. Only the JSON keys and kind values are English.",
  "- When the player writes in another language or script, add the player's spellings of a name to its aliases too (Anna and \u0410\u043d\u043d\u0430): the book matches names in both.",
  "- At most " + CHANGES_MAX + " changes in one reply. Nothing worth recording: empty lists.",
];
// the reply's shape: locked, parseReply and applyReport depend on it
const CHRONICLER_OUTPUT = [
  "Output: one JSON object and nothing else, no code fences:",
  '{"add":[{"kind":"person|place|group|thing|fact","name":"...","aliases":["..."],"text":"..."}],"update":[{"id":"n3","text":"...","aliases":["..."]}],"retire":[{"id":"n3","text":"..."}],"summary":"one short line: what changed in the world"}',
];
export const CHRONICLER_SYSTEM = [...CHRONICLER_RULES, ...CHRONICLER_OUTPUT].join("\n");

// what each level above the chronicler may do; one block, added to the chronicler's rules
const LEVEL_RULES = {
  living: [
    "Your level: living world. Beyond the record, you keep the world moving off screen. The characters are not the only ones with plans.",
    "- fronts: factions, threats and powers with a goal and a clock (4, 6 or 8 segments). Add a front only when the story set one up. Tick a clock by 1 when time passes or the front's plan moves on off screen; a full clock means its goal comes true.",
    "- event: at most one piece of news that may reach the characters from off screen (a rumour, a letter, talk in the street), soft: the story may use it or not. Only when a clock moved or the story stands still. Never in the middle of a fight.",
  ],
  director: [
    "Your level: director. Beyond the record, you keep the world moving and bring things into the scene.",
    "- fronts: factions, threats and powers with a goal and a clock (4, 6 or 8 segments). Add a front when the story set one up, or one that fits the world. Tick a clock by 1 when time passes or the front's plan moves on; a full clock means its goal comes true and touches the characters.",
    "- event: one concrete thing that happens in the next scene: a visitor, a hook, a complication, news that cannot be ignored. Build it from the record, the fronts and the open threads, never from nowhere. It must fit the genre and the tone of the story.",
  ],
  antagonist: [
    "Your level: antagonist. Beyond the record, you push back against the characters: the world has consequences and enemies who act.",
    "- fronts: factions, threats and enemies with a goal and a clock (4, 6 or 8 segments). Tick a clock by 1, or by 2 when the characters gave the front an opening; a full clock means its goal comes true and hurts the characters.",
    "- event: one concrete consequence or pressure in the next scene. Aim it where it hurts: an open thread, a bond between the characters, something they care about. Hard, but fair: built from what the story already set up. In a fight you may send reinforcements or a turn for the worse.",
  ],
  chaos: [
    "Your level: total chaos. Beyond the record, you break the story open: anything may happen, whatever the genre or the logic of the world (killer rabbits from space in a slow romance are fine).",
    "- fronts: the wildest powers you can think of, with a goal and a clock (4, 6 or 8 segments). Tick them fast.",
    "- event: one absurd, surprising, concrete thing that happens in the next scene. Still never rewrite what already happened in the story.",
  ],
};

const LEVEL_SHARED = [
  "- direction: the kind of scene now: domestic, social, intrigue, investigation, travel, combat, explicit (a sexual scene) or transition (a time skip). In an explicit scene send no event at all.",
  "- delivered: when the input shows an event sent in an earlier reply, say whether the story shows it happened (true) or not (false).",
  "- Never write the story yourself and never mention a game master: the event is one or two plain sentences of what happens, who and where.",
];

const LEVEL_SHAPE = '{"add":[...],"update":[...],"retire":[...],"fronts":[{"op":"add","name":"...","goal":"...","size":6},{"op":"tick","id":"f1","by":1,"reason":"..."},{"op":"retire","id":"f1"}],"event":{"text":"..."} or null,"delivered":true|false|null,"direction":"...","summary":"..."}';

const LEVEL_OUTPUT = ["Output at this level, the same object with more keys:", LEVEL_SHAPE];

const SOFT_EVENT = "[World news, may come up in this reply if it fits: {event} If it fits, let it reach the characters as talk, a rumour or a message. Never mention where this note came from.]";
const HARD_EVENT = [
  "[WORLD EVENT: must happen in this reply]",
  "What: {event}",
  "How: bring it into this reply as part of the scene; the characters react in character.",
  "Do not: resolve it in this reply, explain where it came from, or mention a game master.",
].join("\n");

// ---------- profiles: which DM a chat gets ----------
// The five levels are the built-in profiles; the player can change their prompt blocks (only what differs
// is stored, each block resets on its own) and make profiles of their own on top of a level (its base,
// which decides what code does: fronts, events, hard or soft). The output block is never editable.
export const PROFILE_LEVELS = LEVELS.filter((l) => l !== "off");
const PROFILE_DIR = "world/profiles/";
const BLOCK_MAX = 6000;
const PROFILES_MAX = 40;
const NAME_LEN = 60;
const DESC_LEN = 300;

/** The editable blocks of a level, with their default texts (the event block's text has {event}). */
export function defaultBlocks(base) {
  const out = { keeper: CHRONICLER_RULES.join("\n") };
  if (LEVEL_RULES[base]) {
    out.level = LEVEL_RULES[base].join("\n");
    out.shared = LEVEL_SHARED.join("\n");
    out.event = HARD_LEVELS.includes(base) ? HARD_EVENT : SOFT_EVENT;
  }
  return out;
}

/** The locked output block of a level, shown read-only. */
export const outputBlock = (base) => (LEVEL_RULES[base] ? [...CHRONICLER_OUTPUT, "", ...LEVEL_OUTPUT] : CHRONICLER_OUTPUT).join("\n");

const DEFAULT_PROFILE_SETTINGS = { everyN: DEFAULT_SETTINGS.everyN, stagnation: DEFAULT_SETTINGS.stagnation, onTransition: true, insert: true };

// profile options (user, 2026-10-19, both off by default): clocks ticked by code every N replies read
// (Arbiter's way: cheaper and steadier on small models; the model then only adds and retires fronts), and
// event wording that follows the front's clock (Story Engine's way: rumour, then visible, then unmistakable)
export const DEFAULT_OPTIONS = { clocks: "model", clockEvery: 6, eventByClock: false };

function cleanOptions(o) {
  const b = isObj(o) ? o : {};
  const n = Number(b.clockEvery);
  return {
    clocks: b.clocks === "code" ? "code" : "model",
    clockEvery: Number.isFinite(n) ? clamp(Math.round(n), 2, 50) : DEFAULT_OPTIONS.clockEvery,
    eventByClock: b.eventByClock === true,
  };
}

function cleanDefaults(d) {
  const s = cleanSettings({ ...DEFAULT_PROFILE_SETTINGS, ...(isObj(d) ? d : {}), level: "chronicler" });
  return { everyN: s.everyN, stagnation: s.stagnation, onTransition: s.onTransition, insert: s.insert };
}

/** Changed blocks only: known keys, non-empty, not equal to the default; the event block must keep {event}. */
function cleanBlocks(raw, base) {
  const dflt = defaultBlocks(base);
  const out = {};
  if (!isObj(raw)) return out;
  for (const k of Object.keys(dflt)) {
    const v = typeof raw[k] === "string" ? raw[k].replace(/\r\n/g, "\n").trim() : "";
    if (!v || v === dflt[k]) continue;
    if (k === "event" && !v.includes("{event}")) continue;
    out[k] = cut(v, BLOCK_MAX);
  }
  return out;
}

function readProfileFile(fsx, id) {
  const raw = readJson(fsx, PROFILE_DIR + id + ".json", null);
  return isObj(raw) ? raw : null;
}

/** A profile as code trusts it, with every block's text in force; null when there is no such profile. */
export function loadProfile(fsx, id) {
  if (PROFILE_LEVELS.includes(id)) {
    const raw = readProfileFile(fsx, id) || {};
    return { id, builtIn: true, base: id, name: "", description: "", blocks: cleanBlocks(raw.blocks, id), defaults: cleanDefaults(raw.defaults), options: cleanOptions(raw.options) };
  }
  if (!OWN_PROFILE_ID.test(id)) return null;
  const raw = readProfileFile(fsx, id);
  if (!raw || !PROFILE_LEVELS.includes(raw.base)) return null;
  return {
    id, builtIn: false, base: raw.base,
    name: cut(str(raw.name), NAME_LEN) || id,
    description: cut(str(raw.description), DESC_LEN),
    blocks: cleanBlocks(raw.blocks, raw.base),
    defaults: cleanDefaults(raw.defaults),
    options: cleanOptions(raw.options),
  };
}

/** The profile a chat runs with: its own one when it still exists on the same level, else the level's. */
export function profileFor(fsx, settings) {
  if (settings.level === "off") return null;
  const own = settings.profile ? loadProfile(fsx, settings.profile) : null;
  return own && own.base === settings.level ? own : loadProfile(fsx, settings.level);
}

const blockText = (profile, key) => (profile && profile.blocks[key]) || defaultBlocks(profile ? profile.base : "chronicler")[key] || "";

/** The system prompt of a run: a level name (built-in texts) or a profile (its blocks, the output locked). */
export function systemFor(levelOrProfile) {
  const profile = isObj(levelOrProfile) ? levelOrProfile : { base: levelOrProfile, blocks: {} };
  const keeper = blockText(profile, "keeper");
  if (!LEVEL_RULES[profile.base]) return [keeper, ...CHRONICLER_OUTPUT].join("\n");
  return [keeper, ...CHRONICLER_OUTPUT, "", blockText(profile, "level"), blockText(profile, "shared"), ...LEVEL_OUTPUT].join("\n");
}

function profileView(fsx, p, used) {
  const dflt = defaultBlocks(p.base);
  return {
    id: p.id, builtIn: p.builtIn, base: p.base, name: p.name, description: p.description,
    defaults: p.defaults,
    options: p.options,
    blocks: Object.keys(dflt).map((key) => ({ key, text: p.blocks[key] || dflt[key], default: dflt[key], changed: !!p.blocks[key] })),
    output: outputBlock(p.base),
    changed: Object.keys(p.blocks).length > 0,
    chats: used[p.id] || 0,
  };
}

/** Every profile, built-in first, with how many chats use each. */
export function listProfiles(fsx) {
  const used = {};
  let states = [];
  try {
    states = fsx.list("world/state").filter((f) => f.endsWith(".json"));
  } catch {}
  for (const f of states) {
    const s = readJson(fsx, STATE_DIR + f, null);
    if (!isObj(s) || !isObj(s.settings)) continue;
    const set = cleanSettings(s.settings);
    if (set.level === "off") continue;
    const id = set.profile || set.level;
    used[id] = (used[id] || 0) + 1;
  }
  const own = [];
  let files = [];
  try {
    files = fsx.list("world/profiles").filter((f) => f.endsWith(".json"));
  } catch {}
  for (const f of files) {
    const id = f.slice(0, -5);
    if (!OWN_PROFILE_ID.test(id)) continue;
    const p = loadProfile(fsx, id);
    if (p) own.push(p);
  }
  own.sort((a, b) => a.name.localeCompare(b.name));
  return [...PROFILE_LEVELS.map((id) => loadProfile(fsx, id)), ...own].map((p) => profileView(fsx, p, used));
}

const entityLine = (e) => e.id + " · " + e.kind + " · " + e.name + (e.aliases.length ? " (" + e.aliases.join(", ") + ")" : "") + ": " + e.text;
const cutMiddle = (s, max) => (s.length <= max ? s : s.slice(0, Math.floor((max - 3) / 2)) + " … " + s.slice(s.length - Math.floor((max - 3) / 2)));

const frontLine = (f) => f.id + " · " + f.name + " · clock " + f.clock + "/" + f.size + (f.goal ? ": " + f.goal : "");

/** The user message of a DM run. extra (levels above the chronicler): fronts, the pending event, the scene, the Dashboard's threads. */
export function dmInput({ cards, userName, entities, msgs, level, fronts, event, direction, threads, cap, catchingUp, options }) {
  const active = entities.filter((e) => e.status === "active");
  const past = entities.filter((e) => e.status === "past");
  const lines = msgs
    .filter((m) => str(m.text))
    .map((m) => "[" + (m.role === "user" ? userName || "user" : str(m.name) || "narrator") + "] " + cutMiddle(String(m.text).trim(), cap || MSG_MAX));
  let story = lines.join("\n");
  if (story.length > NEW_TEXT_MAX) story = "…" + story.slice(-NEW_TEXT_MAX);
  return [
    "Characters with their own cards (do not record): " + (cards.length ? cards.join(", ") : "none") + ".",
    "The user's character (do not record): " + (userName || "the user") + ".",
    "World record so far" + (active.length ? "\n" + active.map(entityLine).join("\n") : ": empty."),
    ...(past.length ? ["Retired (finished; do not change): " + past.map((e) => e.id + " " + e.name).join(", ") + "."] : []),
    ...(level && LEVEL_RULES[level] ? levelInput({ fronts, event, direction, threads, options }) : []),
    ...(catchingUp ? ["This is an older part of the story, read to catch up; newer parts come in the next runs. Record the world, move the fronts if time passed, but send no event: event null."] : []),
    "New part of the story\n" + story,
  ].join("\n\n");
}

/** How far a front's clock is, as the wording its news should take. */
export function clockStage(f) {
  const r = f.size ? f.clock / f.size : 0;
  return r < 1 / 3 ? "early: only a subtle rumour or a small sign" : r < 2 / 3 ? "growing: a visible development people talk about" : "late: unmistakable, it touches the characters' lives";
}

function levelInput({ fronts, event, direction, threads, options }) {
  const o = options || DEFAULT_OPTIONS;
  const active = arr(fronts).filter((f) => f.status === "active");
  const out = ["Fronts" + (active.length ? "\n" + active.map(frontLine).join("\n") : ": none yet.")];
  if (o.clocks === "code") out.push("The clocks tick by themselves as story time passes: never send tick ops. Add a front when the story sets one up, retire one that is finished.");
  if (o.eventByClock && active.length) {
    out.push("How news of each front reads now, by its clock:\n" + active.map((f) => f.id + " " + f.name + ": " + clockStage(f)).join("\n"));
    out.push("Off-screen effects arrive as news, threats or signs, never as harm already done to the user's character.");
  }
  if (event && event.sent > 0) out.push("Event sent in an earlier reply: " + event.text + "\nDid the new part of the story show it? Answer in delivered.");
  else if (event) out.push("Event still waiting for a reply (keep it, or replace it with a better one): " + event.text);
  if (direction) out.push("Scene direction now (from the scene tracker): " + direction + ".");
  if (arr(threads).length) out.push("Open threads (what the characters care about now): " + threads.join("; ") + ".");
  return out;
}

/** The Dashboard's open threads on the newest snapshot, for the levels that aim at them. */
function dashThreads(fsx, chatId, scene) {
  if (!scene) return [];
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const sn = isObj(dash) && isObj(dash.snapshots) ? dash.snapshots[scene.key] : null;
  return arr(sn && sn.threads).filter((t) => isObj(t) && t.status !== "resolved" && str(t.text)).map((t) => cut(str(t.text), 160)).slice(0, 6);
}

/** The preset a chat replies with, as the chat plugin picks it (for the thinking settings). */
function chatPreset(fsx, meta) {
  let id = meta && str(meta.presetId);
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
  if (/[\\/]|^\.\.?$/.test(id || "default")) return null;
  const preset = readJson(fsx, "presets/" + (id || "default") + ".json", null);
  return isObj(preset) ? preset : null;
}

/** Thinking settings of the chat's preset; with a budget the reply limit grows by it (see the dashboard's callParams). */
function callParams(fsx, cfg, meta, maxTokens) {
  const preset = chatPreset(fsx, meta);
  const reasoning = preset && typeof preset.reasoning === "string" && preset.reasoning !== "off" ? preset.reasoning : "";
  const budget = reasoning && typeof preset.thinkingBudget === "number" && preset.thinkingBudget > 0 ? Math.round(preset.thinkingBudget) : 0;
  const tags = preset && isObj(preset.reasoningTags) && str(preset.reasoningTags.open) && str(preset.reasoningTags.close) ? { open: preset.reasoningTags.open, close: preset.reasoningTags.close } : null;
  return {
    ...(reasoning ? { reasoning } : {}),
    ...(budget ? { thinkingBudget: budget } : {}),
    ...(tags ? { reasoningTags: tags } : {}),
    presetParams: { temperature: 0.3, max_tokens: maxTokens || cfg.maxTokens + budget },
  };
}

/** The first model set of the list, with where it came from. */
function firstModel(list) {
  const hit = list.find(([, m]) => MODEL_REF.test(str(m)));
  return hit ? { model: str(hit[1]), from: hit[0] } : { model: "", from: "default" };
}

/**
 * Who plays the DM after replies (user, 2026-10-19): the World's own play model, else the
 * Dashboard sensor's (fast and cheap already), else Litopys's, else the chat's, else the app's default.
 */
export function playModel(fsx, cfg, meta) {
  const dash = readJson(fsx, "dashboard/config.json", null);
  const lit = readJson(fsx, "litopys/config.json", null);
  const settings = readJson(fsx, "settings.json", null);
  return firstModel([
    ["world", cfg.model],
    ["sensor", isObj(dash) ? dash.sensorModel : ""],
    ["litopys", isObj(lit) ? lit.model : ""],
    ["chat", meta && meta.model],
    ["default", isObj(settings) ? settings.model : ""],
  ]);
}

/** Who builds worlds (start, remix): the World's build model, else the chat's, else the app's default. */
export function buildModel(fsx, cfg, meta) {
  const settings = readJson(fsx, "settings.json", null);
  return firstModel([["world", cfg.buildModel], ["chat", meta && meta.model], ["default", isObj(settings) ? settings.model : ""]]);
}

export function dmModel(fsx, cfg, meta) {
  return playModel(fsx, cfg, meta).model;
}

// ---------- reading the DM's reply ----------
/** The first balanced {...} of the text from `from`; null when there is none. */
function firstObject(s, from = 0) {
  const start = s.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

const REPLY_KEYS = ["add", "update", "retire", "summary", "fronts", "event", "delivered", "direction"];

const tryObject = (body) => {
  try {
    const v = JSON.parse(body.replace(/,\s*([}\]])/g, "$1"));
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
};

/**
 * The DM's JSON: the LAST balanced object that parses and has a key of the reply (a thinking model may
 * write braces or a draft before the answer); else the first one that parses. Code fences are ignored.
 */
export function parseReply(text) {
  const s = String(text || "").replace(/^\s*<(think|thinking|reasoning)>[\s\S]*?<\/\1>/i, "").replace(/```(?:json)?/gi, " ").trim();
  let first = null;
  let best = null;
  for (let from = 0, body = firstObject(s, 0); body; body = firstObject(s, from)) {
    const at = s.indexOf(body, from);
    from = at + body.length;
    const v = tryObject(body);
    if (!v) {
      // not JSON: look inside it on the next pass
      from = at + 1;
      continue;
    }
    if (!first) first = v;
    if (Object.keys(v).some((k) => REPLY_KEYS.includes(k))) best = v;
  }
  return best || first;
}

const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
const namesOf = (e) => [e.name, ...e.aliases];

/** The record a change points at: its id, else a name or alias. */
function findEntity(entities, change) {
  const id = str(change.id);
  const byId = id ? entities.find((e) => e.id === id) : null;
  if (byId) return byId;
  const name = str(change.name);
  return name ? entities.find((e) => namesOf(e).some((n) => sameName(n, name))) || null : null;
}

/** At most two sentences, within the retired size. */
export function shortText(text) {
  const s = str(text);
  const m = /^(.+?[.!?…])\s+(.+?[.!?…])(\s|$)/s.exec(s);
  return cut(m ? m[1] + " " + m[2] : s, PAST_TEXT_MAX);
}

/**
 * Apply the DM's report to the state (in place). Names of cards and of the user are never
 * recorded; a name already on record becomes an update; retired records stay retired.
 * Returns how many records changed.
 */
export function applyReport(state, out, { cards, userName, now }) {
  const at = now || Date.now();
  const skip = [...cards, ...(userName ? [userName] : [])];
  const isSkipped = (name) => skip.some((n) => sameName(n, name));
  let changes = 0;
  const room = () => changes < CHANGES_MAX;
  for (const raw of arr(out.add)) {
    if (!room() || !isObj(raw)) continue;
    const name = cut(str(raw.name), NAME_MAX);
    if (!name || isSkipped(name)) continue;
    const text = cut(str(raw.text), TEXT_MAX);
    const known = findEntity(state.entities, { name });
    if (known) {
      if (known.status === "past" || !text || text === known.text) continue;
      known.text = text;
      known.aliases = cleanAliases([...known.aliases, ...arr(raw.aliases)], known.name);
      known.at = at;
      changes++;
      continue;
    }
    if (!text || state.entities.length >= ENTITIES_MAX) continue;
    state.entities.push({ id: "n" + state.nextId++, kind: KINDS.includes(raw.kind) ? raw.kind : "fact", name, aliases: cleanAliases(raw.aliases, name), text, status: "active", uid: 0, at });
    changes++;
  }
  for (const raw of arr(out.update)) {
    if (!room() || !isObj(raw)) continue;
    const e = findEntity(state.entities, raw);
    if (!e || e.status === "past") continue;
    const text = cut(str(raw.text), TEXT_MAX);
    const aliases = raw.aliases !== undefined ? cleanAliases([...e.aliases, ...arr(raw.aliases)], e.name) : e.aliases;
    if ((!text || text === e.text) && aliases.length === e.aliases.length) continue;
    if (text) e.text = text;
    e.aliases = aliases;
    e.at = at;
    changes++;
  }
  for (const raw of arr(out.retire)) {
    if (!room() || !isObj(raw)) continue;
    const e = findEntity(state.entities, raw);
    if (!e || e.status === "past") continue;
    e.status = "past";
    e.text = shortText(str(raw.text) || e.text);
    e.at = at;
    changes++;
  }
  return changes;
}

/**
 * Code ticks the clocks (profile option "code"): every `every` replies read, each active front moves by 1.
 * The count carries over between runs in state.clockReplies. Returns how many ticks were made.
 */
export function tickClocks(state, replies, every, now) {
  let count = (Number.isInteger(state.clockReplies) ? state.clockReplies : 0) + replies;
  let ticks = 0;
  while (count >= every) {
    count -= every;
    for (const f of state.fronts) {
      if (f.status !== "active" || f.clock >= f.size) continue;
      f.clock++;
      f.at = now || Date.now();
      ticks++;
    }
  }
  state.clockReplies = count;
  return ticks;
}

/**
 * The levels above the chronicler: fronts, the event and the direction (in place). The pending
 * event: delivered drops it; missed once is sent again; missed twice is dropped. A new event
 * waits while the old one is pending. No event in an explicit scene, none in combat below
 * antagonist. Returns how many fronts changed.
 */
export function applyLevel(state, out, { level, direction, now, catchingUp, codeClocks }) {
  const at = now || Date.now();
  let changes = 0;
  const said = DIRECTIONS.includes(str(out.direction).toLowerCase()) ? str(out.direction).toLowerCase() : null;
  if (said) state.direction = said;
  const dir = direction || said || state.direction || null;
  for (const raw of arr(out.fronts)) {
    if (!isObj(raw) || changes >= CHANGES_MAX) continue;
    const op = str(raw.op);
    if (op === "add") {
      const name = cut(str(raw.name), NAME_MAX);
      if (!name || state.fronts.filter((f) => f.status === "active").length >= FRONTS_MAX) continue;
      if (state.fronts.some((f) => f.status === "active" && sameName(f.name, name))) continue;
      const size = CLOCK_SIZES.includes(Number(raw.size)) ? Number(raw.size) : 6;
      state.fronts.push({ id: "f" + state.nextFront++, name, goal: cut(str(raw.goal), TEXT_MAX), clock: 0, size, status: "active", at });
      changes++;
      continue;
    }
    const f = state.fronts.find((x) => x.status === "active" && (x.id === str(raw.id) || (str(raw.name) && sameName(x.name, str(raw.name)))));
    if (!f) continue;
    if (op === "tick") {
      if (codeClocks) continue;
      const by = clamp(Math.round(Number(raw.by) || 1), -2, 2);
      f.clock = clamp(f.clock + by, 0, f.size);
      f.at = at;
      changes++;
    } else if (op === "retire") {
      f.status = "past";
      f.at = at;
      changes++;
    }
  }
  // the pending event first: one shot, one retry
  if (state.event && state.event.sent > 0) {
    if (out.delivered === true) state.event = null;
    else if (out.delivered === false && !state.event.retried) state.event = { ...state.event, sent: 0, retried: true };
    else if (out.delivered === false) state.event = null;
  }
  const quiet = dir === "explicit" || (dir === "combat" && level !== "antagonist" && level !== "chaos");
  const text = isObj(out.event) ? cut(str(out.event.text), EVENT_MAX) : "";
  if (text && !quiet && !catchingUp && (!state.event || state.event.sent === 0)) {
    state.event = { text, hard: HARD_LEVELS.includes(level), sent: 0, retried: false, at };
  }
  return changes;
}

// ---------- the insert: the event rides one reply ----------
// the engine plugin's ops: a new reply (send, next) or a new swipe of one; never continue or impersonate
const OPS_WITH_EVENT = ["send", "next", "swipe"];

/** The text the writing model gets for an event, or null. template = the profile's event block (with {event}). */
export function eventInsert(event, template) {
  if (!event || !str(event.text)) return null;
  const t = typeof template === "string" && template.includes("{event}") ? template : event.hard ? HARD_EVENT : SOFT_EVENT;
  return t.split("{event}").join(event.text);
}

function withLast(messages, text) {
  const last = messages[messages.length - 1];
  if (last && last.role === "user" && typeof last.content === "string") return [...messages.slice(0, -1), { ...last, content: last.content + "\n\n" + text }];
  return [...messages, { role: "user", content: text }];
}

export function llmRequest(ctx, host) {
  if (!ctx || ctx.key !== "reply") return null;
  const req = ctx.request || {};
  const chatId = String(req.sessionId || "");
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx || !CHAT_ID.test(chatId) || !Array.isArray(req.messages)) return null;
  const turn = isObj(ctx.turn) ? ctx.turn : isObj(req.turn) ? req.turn : {};
  if (!OPS_WITH_EVENT.includes(str(turn.op))) return null;
  try {
    const raw = readJson(fsx, statePath(chatId), null);
    if (!isObj(raw) || !isObj(raw.event)) return null;
    const { state } = loadState(fsx, chatId);
    const lv = state.settings.level;
    if (!state.event || state.event.sent > 0 || !state.settings.insert || lv === "off" || lv === "chronicler") return null;
    const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
    const off = isObj(meta) && isObj(meta.promptBoard) && Array.isArray(meta.promptBoard.off) ? meta.promptBoard.off : [];
    if (off.includes("plugin:world")) return null;
    const chat = readChat(fsx, chatId);
    const dir = directionOf(state, chat ? sceneOf(fsx, chatId, chat.msgs) : null);
    if (dir === "explicit") return null;
    if (dir === "combat" && lv !== "antagonist" && lv !== "chaos") return null;
    const profile = profileFor(fsx, state.settings);
    const text = eventInsert(state.event, profile && profile.blocks.event);
    if (!text) return null;
    state.event = { ...state.event, sent: state.event.sent + 1, sentAt: Date.now() };
    saveState(fsx, state);
    return { messages: withLast(req.messages, text), promptSources: { parts: [{ kind: "plugin", label: "World DM", text }] } };
  } catch (e) {
    try {
      host.log("world insert: " + (e && e.message ? e.message : String(e)));
    } catch {}
    return null;
  }
}

// ---------- the world book ----------
export const BOOK_SETTINGS = {
  scanDepth: 4, contextPercent: 25, budgetCap: 0, minActivations: 0, maxRecursion: 2,
  insertionStrategy: "character_first", caseSensitive: false, wholeWords: true, groupScoring: false,
  recursiveScan: false, includeNames: true, overflowAlert: false,
};

/** One entry of the world book for one record (uid assigned by the caller). */
function entryOf(e, uid, old) {
  return {
    ...(isObj(old) ? old : {}),
    uid,
    title: e.name,
    memo: "world:" + e.id + (e.status === "past" ? " (retired)" : ""),
    keys: namesOf(e),
    keysRegex: false,
    secondaryKeys: [],
    selectiveLogic: "AND_ANY",
    status: "normal",
    content: e.name + ": " + e.text,
    position: "after_char",
    depth: 4,
    role: "system",
    // retired records lose to living ones when the budget runs out
    order: e.status === "past" ? 50 : 100,
    enabled: true,
  };
}

/**
 * Write the chat's world book from the state: one entry per record, keyed by the record's
 * uid (assigned here once and kept). Entries the DM did not make (memo not "world:") stay.
 */
export function writeBook(fsx, state, title) {
  const path = "lorebooks/" + state.bookId + ".json";
  const old = readJson(fsx, path, null);
  const book = isObj(old) ? old : {};
  const entries = arr(book.entries).filter(isObj);
  const own = new Map();
  const others = [];
  for (const en of entries) {
    const m = /^world:([a-z]\d+)/.exec(str(en.memo));
    if (m) own.set(m[1], en);
    else others.push(en);
  }
  let next = entries.reduce((n, en) => Math.max(n, Number.isInteger(en.uid) ? en.uid : 0), 0) + 1;
  const ours = state.entities.map((e) => {
    if (!e.uid) e.uid = next++;
    return entryOf(e, e.uid, own.get(e.id));
  });
  writeJson(fsx, path, {
    ...book,
    id: state.bookId,
    name: str(book.name) || "World" + (title ? ": " + title : ""),
    ownerChatId: state.chatId,
    globalActive: false,
    linkedCharacterIds: [],
    settings: isObj(book.settings) ? book.settings : { ...BOOK_SETTINGS },
    formatTemplate: typeof book.formatTemplate === "string" ? book.formatTemplate : "",
    entries: [...others, ...ours],
  });
}

/** The chat's meta names its world book (the engine plugin scans it from there). */
function bindBook(fsx, chatId, meta, bookId) {
  if (meta.worldBookId === bookId) return;
  writeJson(fsx, "chats/" + chatId + ".meta.json", { ...meta, worldBookId: bookId });
}

// ---------- routes ----------
// ---------- start: building a world (P3 stage 3) ----------
// The DM learns the world from the chat's cards and their books (user, 2026-10-18: it learns from
// card lore, never copies it). The text is cut into chunks a small context window can read; each chunk
// is one call that returns the same "add" list as a run, merged by name. Recipes say what to look for;
// built-ins live in code, a file world/recipes/<id>.json of the same id replaces one, other ids add one.
const RECIPE_DIR = "world/recipes/";
const RECIPE_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const CHUNK_MAX = 6000;
const SOURCE_MAX = 60000;
const QUESTIONS_MAX = 8;
const SECTIONS_MAX = 6;
const ANSWER_MAX = 400;

const BUILTIN_RECIPES = [
  {
    id: "from-cards",
    name: "From the cards",
    description: "Reads the cards and their books and records the world they describe.",
    questions: [],
    sections: [{ id: "world", kinds: KINDS, max: 8, prompt: "Record the people, places, groups, things and facts of the world these texts describe, beyond the characters themselves." }],
    fronts: { count: 2, prompt: "Name the powers that want something in this world and could move off screen." },
  },
  {
    id: "interview",
    name: "Interview",
    description: "A few questions about the story you want; the DM builds a world around the cards from your answers.",
    questions: [
      { id: "genre", text: "Genre", options: ["fantasy", "dark fantasy", "historical", "modern", "science fiction", "horror", "slice of life"] },
      { id: "conflict", text: "What is at stake", options: ["survival", "power", "love", "a secret", "revenge", "a journey"] },
      { id: "tone", text: "Tone", options: ["light", "warm", "tense", "grim", "absurd"] },
      { id: "scale", text: "Scale", options: ["one house", "a village", "a city", "a country", "a whole world"] },
      { id: "extra", text: "Anything else the world must have" },
    ],
    sections: [
      { id: "places", kinds: ["place"], max: 5, prompt: "Invent the places of this world that the story will need, fitting the answers and the cards." },
      { id: "people", kinds: ["person", "group"], max: 6, prompt: "Invent the people and groups who live in this world and matter to the characters, fitting the answers and the cards." },
      { id: "facts", kinds: ["thing", "fact"], max: 5, prompt: "Invent the things and facts of this world (customs, dangers, history) the story can lean on." },
    ],
    fronts: { count: 3, prompt: "Invent the powers that want something in this world and will move off screen." },
  },
];

function cleanRecipe(raw, id) {
  if (!isObj(raw)) return null;
  const questions = arr(raw.questions).filter(isObj).slice(0, QUESTIONS_MAX).map((q, i) => ({
    id: RECIPE_ID.test(str(q.id)) ? str(q.id) : "q" + (i + 1),
    text: cut(str(q.text), 200),
    ...(arr(q.options).length ? { options: arr(q.options).map(str).filter(Boolean).slice(0, 12).map((o) => cut(o, 80)) } : {}),
    ...(str(q.default) ? { default: cut(str(q.default), ANSWER_MAX) } : {}),
  })).filter((q) => q.text);
  const sections = arr(raw.sections).filter(isObj).slice(0, SECTIONS_MAX).map((s, i) => ({
    id: RECIPE_ID.test(str(s.id)) ? str(s.id) : "s" + (i + 1),
    kinds: arr(s.kinds).filter((k) => KINDS.includes(k)).length ? arr(s.kinds).filter((k) => KINDS.includes(k)) : KINDS,
    max: clamp(Math.round(num(s.max)) || CHANGES_MAX, 1, CHANGES_MAX),
    prompt: cut(str(s.prompt), 1000),
  })).filter((s) => s.prompt);
  if (!sections.length) return null;
  const f = isObj(raw.fronts) ? raw.fronts : {};
  return {
    id, name: cut(str(raw.name), NAME_LEN) || id, description: cut(str(raw.description), DESC_LEN), questions, sections,
    fronts: { count: clamp(Math.round(num(f.count)), 0, FRONTS_MAX), prompt: cut(str(f.prompt), 1000) },
  };
}

/** Every recipe: the built-ins (a file of the same id replaces one), then the player's own files. */
export function listRecipes(fsx) {
  const out = BUILTIN_RECIPES.map((r) => ({ ...cleanRecipe(readJson(fsx, RECIPE_DIR + r.id + ".json", null), r.id) || r, builtin: true }));
  let files = [];
  try {
    files = fsx.list(RECIPE_DIR.slice(0, -1)).filter((f) => f.endsWith(".json"));
  } catch {}
  for (const f of files.sort()) {
    const id = f.slice(0, -5);
    if (!RECIPE_ID.test(id) || out.some((r) => r.id === id)) continue;
    const r = cleanRecipe(readJson(fsx, RECIPE_DIR + f, null), id);
    if (r) out.push({ ...r, builtin: false });
  }
  return out;
}

export const recipeOf = (fsx, id) => listRecipes(fsx).find((r) => r.id === id) || null;

const cardOf = (fsx, id) => {
  const c = readJson(fsx, "characters/" + id + "/card.json", null);
  return isObj(c) ? (isObj(c.data) && !str(c.name) ? { ...c.data, studio: c.studio } : c) : null;
};

/** The ids of a card's or a group's books: embedded first, then linked. */
function booksOf(holder) {
  const s = isObj(holder && holder.studio) ? holder.studio : holder || {};
  return [s.embeddedLorebookId, ...arr(s.linkedLorebookIds)].filter((id) => typeof id === "string" && CHAT_ID.test(id));
}

/**
 * What the DM reads to learn the world: each card's description, personality and scenario, the group's
 * scenario, then the enabled entries of their books (each book once; the chat's own world book never).
 * One part per text, labelled; `cardIds` limits it to those of the chat's cards.
 */
export function startSources(fsx, meta, cardIds) {
  const ids = memberIds(fsx, meta).filter((id) => !Array.isArray(cardIds) || !cardIds.length || cardIds.includes(id));
  const parts = [];
  const books = [];
  const seen = new Set([str(meta.worldBookId)]);
  const addBooks = (list) => {
    for (const id of list) {
      if (seen.has(id)) continue;
      seen.add(id);
      books.push(id);
    }
  };
  for (const id of ids) {
    const card = cardOf(fsx, id);
    if (!card) continue;
    const name = str(card.name) || id;
    for (const field of ["description", "personality", "scenario"]) {
      if (str(card[field])) parts.push({ label: name + ": " + field, text: str(card[field]) });
    }
    addBooks(booksOf(card));
  }
  if (meta.groupId) {
    const group = readJson(fsx, "groups/" + meta.groupId + ".json", null);
    if (isObj(group)) {
      if (str(group.scenario)) parts.push({ label: (str(group.name) || "group") + ": scenario", text: str(group.scenario) });
      addBooks(booksOf(group));
    }
  }
  for (const id of books) {
    const book = readJson(fsx, "lorebooks/" + id + ".json", null);
    if (!isObj(book) || str(book.ownerChatId)) continue;
    for (const e of arr(book.entries)) {
      if (!isObj(e) || e.enabled === false || !str(e.content)) continue;
      const title = str(e.title) || arr(e.keys).map(str).filter(Boolean).slice(0, 3).join(", ");
      parts.push({ label: (str(book.name) || id) + (title ? ": " + title : ""), text: str(e.content) });
    }
  }
  let total = 0;
  return parts.filter((p) => (total += p.text.length) <= SOURCE_MAX);
}

/** Split a text longer than max at paragraph, then sentence, then word ends. */
function splitText(text, max) {
  const out = [];
  let rest = text;
  while (rest.length > max) {
    const head = rest.slice(0, max);
    let at = head.lastIndexOf("\n\n");
    if (at < max / 3) at = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf("\n")) + 1;
    if (at < max / 3) at = head.lastIndexOf(" ");
    if (at < max / 3) at = max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * The sources packed into chunks of at most `max` characters, cut between parts; a part too long on its
 * own is split at paragraph or sentence ends, each piece keeping its label.
 */
export function chunkSources(parts, max = CHUNK_MAX) {
  const chunks = [];
  let cur = "";
  const push = (block) => {
    if (cur && cur.length + 2 + block.length > max) {
      chunks.push(cur);
      cur = "";
    }
    cur = cur ? cur + "\n\n" + block : block;
  };
  for (const p of parts) {
    const head = "[" + p.label + "]\n";
    if (head.length + p.text.length <= max) push(head + p.text);
    else {
      // the first piece fills what is left of the open chunk when that is worth a piece
      const room = cur ? max - cur.length - 2 - head.length : 0;
      let rest = p.text;
      if (room >= 1000) {
        const [first] = splitText(rest, room);
        push(head + first);
        rest = rest.slice(rest.indexOf(first) + first.length).trim();
      }
      for (const piece of splitText(rest, max - head.length)) push(head + piece);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

const BUILD_RULES = [
  "You build the world of a roleplay story before it starts. Another model will write the story; it reads your record when a name comes up.",
  "Rules:",
  "- Learn from the texts you are given; write each record in your own short words. Never copy a text whole.",
  "- Do not record the user's character or the characters listed as having their own cards: they are kept elsewhere.",
  "- One record per person, place, group, thing or fact. Its text is one to three short sentences in the present tense: what someone needs to know when the name comes up (who or what it is, where, how it stands toward the characters).",
  "- Never repeat a record that is already in the world record; to add to one, use its exact name.",
  "- aliases: other names for it (a nickname, a title, a short name).",
  "- Only the JSON keys and kind values are English.",
];
const BUILD_OUTPUT = [
  "Output: one JSON object and nothing else, no code fences:",
  '{"add":[{"kind":"person|place|group|thing|fact","name":"...","aliases":["..."],"text":"..."}],"summary":"one short line"}',
];
const FRONTS_OUTPUT = [
  "Output: one JSON object and nothing else, no code fences:",
  '{"fronts":[{"op":"add","name":"...","goal":"what it wants, one sentence","size":6}],"summary":"one short line"}',
];
export const BUILD_SYSTEM = [...BUILD_RULES, ...BUILD_OUTPUT].join("\n");
export const FRONTS_SYSTEM = [
  "You build the world of a roleplay story before it starts. From the world record, name the fronts: factions, threats and powers with a goal that will move off screen, each with a clock of 4, 6 or 8 segments (bigger = slower).",
  "- Build them only from the record; a front's name may be a record's name.",
  "- Only the JSON keys are English.",
  ...FRONTS_OUTPUT,
].join("\n");

const answerLines = (recipe, answers) =>
  recipe.questions
    .map((q) => [q.text, cut(str(isObj(answers) ? answers[q.id] : "") || str(q.default), ANSWER_MAX)])
    .filter(([, a]) => a)
    .map(([q, a]) => "- " + q + ": " + a);

/** The user message of one build call: a recipe section over one chunk (or over the answers alone). */
export function buildInput({ cards, userName, entities, section, chunk, recipe, answers, lang }) {
  const known = entities.filter((e) => e.status === "active");
  const said = answerLines(recipe, answers);
  return [
    "Characters with their own cards (do not record): " + (cards.length ? cards.join(", ") : "none") + ".",
    "The user's character (do not record): " + (userName || "the user") + ".",
    "World record so far" + (known.length ? "\n" + known.map(entityLine).join("\n") : ": empty."),
    ...(said.length ? ["What the player wants\n" + said.join("\n")] : []),
    "Task: " + section.prompt + " Kinds: " + section.kinds.join(", ") + ". At most " + section.max + " records.",
    "Write names and text in " + (lang || "the language of the texts below") + ".",
    ...(chunk ? ["Texts to learn from\n" + chunk] : []),
  ].join("\n\n");
}

/** The user message of the fronts call. */
export function frontsInput({ entities, recipe, answers, lang }) {
  const said = answerLines(recipe, answers);
  return [
    "World record\n" + (entities.filter((e) => e.status === "active").map(entityLine).join("\n") || "empty"),
    ...(said.length ? ["What the player wants\n" + said.join("\n")] : []),
    "Task: " + (recipe.fronts.prompt || "Name the fronts.") + " At most " + recipe.fronts.count + " fronts.",
    "Write names and goals in " + (lang || "the language of the record") + ".",
  ].join("\n\n");
}

/** The calls a start makes, in order: one per (section, chunk), then the fronts call when the recipe asks for any. */
export function startPlan(recipe, chunks, withFronts) {
  const steps = [];
  for (const s of recipe.sections) {
    if (chunks.length) for (let i = 0; i < chunks.length; i++) steps.push({ section: s.id, chunk: i });
    else steps.push({ section: s.id, chunk: -1 });
  }
  if (withFronts && recipe.fronts.count > 0) steps.push({ fronts: true });
  return steps;
}

function body(req) {
  return isObj(req.body) ? req.body : {};
}

/** The newest run of the log, as the sheet and the hub show it. */
function lastRunOf(state) {
  const r = state.log[state.log.length - 1];
  return isObj(r) ? runView(r) : null;
}

function runView(r) {
  return {
    at: num(r.at), reason: str(r.reason), changes: Math.round(num(r.changes)), fronts: Math.round(num(r.fronts)),
    summary: str(r.summary), model: str(r.model), ms: Math.round(num(r.ms)),
    usage: isObj(r.usage) ? cleanUsage(r.usage) : null, limit: cleanLimit(r.limit),
    behind: Math.round(num(r.behind)), retried: r.retried === true,
    ...(ERROR_CODES.includes(r.error) ? { error: r.error } : {}),
  };
}

function stateView(state, msgs, cfg, scene, play) {
  const unread = unreadMessages(msgs, state.lastKey);
  return {
    settings: state.settings,
    ready: READY_LEVELS,
    // the profile in force (its own one, else the level's)
    profile: state.settings.level === "off" ? null : state.settings.profile || state.settings.level,
    bookId: state.bookId,
    records: state.entities.filter((e) => e.status === "active").length,
    retired: state.entities.filter((e) => e.status === "past").length,
    dueIn: dueIn(state, msgs),
    lastRunAt: state.lastRunAt ?? null,
    lastSummary: state.log.length ? str(state.log[state.log.length - 1].summary) : "",
    lastError: state.lastError ?? null,
    model: cfg.model,
    // what the DM goes by now, and whether an event is waiting (not what it is: the world stays the DM's)
    direction: directionOf(state, scene || null),
    sensor: !!scene,
    fronts: state.fronts.filter((f) => f.status === "active").length,
    eventWaiting: !!(state.event && state.event.sent === 0),
    // the play model in force for this chat and where it comes from (world, sensor, litopys, chat, default)
    play: play || null,
    lastRun: lastRunOf(state),
    usage: state.usage || { input: 0, output: 0, cost: 0, runs: 0 },
    // unread text one run cannot read: "Read the whole chat" runs until it is 0
    behind: state.settings.level === "off" ? { messages: 0, runs: 0 } : behindOf(unread),
  };
}

function stateRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(host.fs, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const cfg = loadConfig(host.fs);
  return ok(stateView(loadState(host.fs, chatId).state, chat.msgs, cfg, sceneOf(host.fs, chatId, chat.msgs), playModel(host.fs, cfg, chat.meta)));
}

/** "Look at the world": the records only, newest first; the DM's plans (fronts, the event) stay its own. */
function peekRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const { state } = loadState(host.fs, chatId);
  const records = state.entities
    .map((e) => ({ id: e.id, kind: e.kind, name: e.name, aliases: e.aliases, text: e.text, status: e.status, at: e.at ?? 0, ...(e.by ? { by: e.by } : {}) }))
    .sort((a, b) => (a.status === b.status ? b.at - a.at : a.status === "active" ? -1 : 1));
  return ok({ records });
}

function settingsRoute(req, host) {
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(host.fs, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  if (b.level !== undefined && !READY_LEVELS.includes(b.level)) return ok({ error: "unknown or unfinished level" }, 400);
  const { state, existed } = loadState(host.fs, chatId);
  const patch = {};
  for (const k of ["level", "everyN", "stagnation", "onTransition", "insert"]) if (b[k] !== undefined) patch[k] = b[k];
  // a profile picks the level too: a built-in one is the level itself, an own one runs on its base
  if (b.profile !== undefined) {
    const p = str(b.profile) ? loadProfile(host.fs, str(b.profile)) : null;
    if (str(b.profile) && !p) return ok({ error: "no such profile" }, 400);
    patch.level = p ? p.base : patch.level;
    patch.profile = p && !p.builtIn ? p.id : "";
    // first switched on with this profile: its defaults; later the chat's own numbers stay
    if (p && state.settings.level === "off") Object.assign(patch, p.defaults, Object.fromEntries(["everyN", "stagnation", "onTransition", "insert"].filter((k) => b[k] !== undefined).map((k) => [k, b[k]])));
  } else if (b.level !== undefined) patch.profile = "";
  const next = cleanSettings({ ...state.settings, ...patch });
  // switched on for the first time: the DM starts reading from now, not from the first message
  // (also when a state file was saved with the DM off and it never ran: lastKey is still null)
  const fresh = !existed || (state.settings.level === "off" && state.lastKey === null && !state.lastRunAt);
  if (fresh && next.level !== "off" && chat.msgs.length && b.fromStart !== true) {
    const unread = chat.msgs.slice(-Math.max(2, next.everyN * 2));
    const before = chat.msgs[chat.msgs.length - unread.length - 1];
    state.lastKey = before ? keyOf(before) : null;
  }
  // a level with no events drops a waiting one
  if ((next.level === "off" || next.level === "chronicler") && state.event) state.event = null;
  state.settings = next;
  saveState(host.fs, state);
  const cfg = loadConfig(host.fs);
  return ok(stateView(state, chat.msgs, cfg, sceneOf(host.fs, chatId, chat.msgs), playModel(host.fs, cfg, chat.meta)));
}

/** The config with the models in force (for a chat when chatId names one). */
function configView(fsx, cfg, chatId) {
  const meta = CHAT_ID.test(chatId) ? readJson(fsx, "chats/" + chatId + ".meta.json", null) : null;
  const m = isObj(meta) ? meta : null;
  return { ...cfg, play: playModel(fsx, cfg, m), build: buildModel(fsx, cfg, m) };
}

function configRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (req.method === "GET") return ok(configView(host.fs, loadConfig(host.fs), chatId));
  const b = body(req);
  const cur = loadConfig(host.fs);
  const patch = {};
  for (const k of ["model", "buildModel", "maxTokens"]) if (b[k] !== undefined) patch[k] = b[k];
  const next = cleanConfig({ ...cur, ...patch });
  const diff = {};
  for (const k of Object.keys(DEFAULT_CONFIG)) if (next[k] !== DEFAULT_CONFIG[k]) diff[k] = next[k];
  if (Object.keys(diff).length) writeJson(host.fs, CONFIG_FILE, diff);
  else {
    try {
      host.fs.remove(CONFIG_FILE);
    } catch {}
  }
  return ok(configView(host.fs, next, chatId));
}

const isRateLimit = (r) => /429|rate.?limit/i.test(String(r.error || ""));

/** The limit a call went out with, from the engine's echo of its params. */
export function limitOf(r) {
  const p = isObj(r && r.requestParams) ? r.requestParams : {};
  if (!Number.isFinite(Number(p.max_tokens))) return null;
  const from = isObj(p.from) ? p.from : {};
  return { max: Math.round(Number(p.max_tokens)), block: str(p.block) || null, fromModel: from.max_tokens === "model" };
}

/** A reply that is all thinking and no answer. */
const thinkingOnly = (r) => !r.error && !str(r.text) && !!str(r.reasoning);

/**
 * A failed call as one plain sentence and a code the app says in the player's language (world.err.<code>);
 * the provider's own text stays in details. The next step is in the sentence: the player cannot be
 * expected to know the engine (user, 2026-10-18).
 */
export function classifyError(r, limit) {
  const raw = String((r && r.error) || "");
  const details = raw ? cut(raw, 1200) : "";
  const e = (code, message) => ({ code, message, ...(details ? { details } : {}), ...(limit ? { limit } : {}) });
  if (r && thinkingOnly(r)) {
    if (limit && limit.fromModel) return e("thinking-block", "The model spent its whole limit (" + limit.max + " tokens) thinking and wrote no answer. The limit comes from this model's " + (limit.block || "World DM") + " parameters in API connections: raise it there, or pick a model that does not think.");
    return e("thinking", "The model spent its whole limit thinking and wrote no answer, even with more room. Pick a model that does not think, or give it a bigger limit in its parameters in API connections.");
  }
  if (/disabl\w* reasoning|reasoning\W.*(cannot|can't|not).*(disabl|off)|always thinks/i.test(raw)) return e("reasoning-off", "This model always thinks and cannot turn thinking off. Set Reasoning to on (not off) in its parameters in API connections, or pick another model.");
  if (/429|rate.?limit|too many requests/i.test(raw)) return e("rate", "The provider is busy (rate limit). The same messages are read next time.");
  if (/context|too long|maximum.*tokens|token limit/i.test(raw)) return e("context", "The DM's input is too big for this model. Pick a model with a bigger context.");
  if (/\b40[13]\b|unauthori|api key|forbidden/i.test(raw)) return e("auth", "The provider refused the key. Check the connection in API connections.");
  if (/\b404\b|no such model|model.*not found|unknown model/i.test(raw)) return e("model", "The provider does not know this model. Pick another one.");
  if (raw) return e("other", cut(raw.split("\n")[0], 300));
  return e("empty", "The model returned nothing.");
}

function updateRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state } = loadState(fsx, chatId);
  const cfg = loadConfig(fsx);
  if (state.settings.level === "off") return ok({ ok: true, skipped: "off" });
  const auto = b.auto === true || b.auto === "true";
  const unread = unreadMessages(chat.msgs, state.lastKey);
  if (!unread.some((m) => str(m.text))) return ok({ ok: true, skipped: "nothing new" });
  const scene = sceneOf(fsx, chatId, chat.msgs);
  const level = state.settings.level;
  // an explicit scene freezes the DM, a World turn and chaos included; it waits until the scene ends
  if (directionOf(state, scene) === "explicit") return ok({ ok: true, skipped: "explicit" });
  const reason = auto ? dueReason(state, chat.msgs, scene) : "manual";
  if (!reason) return ok({ ok: true, skipped: "waiting", dueIn: dueIn(state, chat.msgs) });
  const stash = isObj(req.stash) ? req.stash : {};
  const retry = stash.retry === true;
  const key = retry ? "world_retry" : "world";
  const r = host.llm.results[key];
  const cards = cardNames(fsx, chat.meta);
  const userName = userNameOf(fsx, chat.meta);
  const play = playModel(fsx, cfg, chat.meta);
  // what this run reads: every unread message (cut to a fair share), or the oldest part when far behind
  const take = takeUnread(unread);
  const catchingUp = take.rest.length > 0;
  const profile = profileFor(fsx, state.settings);
  const options = (profile && profile.options) || DEFAULT_OPTIONS;
  const ask = (k, maxTokens) => {
    host.llm.request(k, {
      ...(play.model ? { model: play.model } : {}),
      systemPrompt: systemFor(profile || level),
      messages: [{ role: "user", content: dmInput({
        cards, userName, entities: state.entities, msgs: take.msgs, cap: take.cap, catchingUp, level, options,
        fronts: state.fronts, event: state.event, direction: directionOf(state, scene),
        threads: level === "antagonist" || level === "director" ? dashThreads(fsx, chatId, scene) : [],
      }) }],
      ...callParams(fsx, cfg, chat.meta, maxTokens),
    });
  };
  // the newest message read now: the run is pinned to it, so a reply that lands meanwhile waits for the next run
  const upTo = keyOf(take.msgs[take.msgs.length - 1]);
  const started = Number(stash.started) || Date.now();
  if (!r) {
    ask(key);
    return { __llmPending: true, stash: { retry, upTo, started } };
  }
  const limit = limitOf(r);
  if (!retry && r.error && isRateLimit(r)) {
    ask("world_retry");
    return { __llmPending: true, stash: { retry: true, upTo: stash.upTo || upTo, started } };
  }
  // all thinking, no answer: once more with room for both, unless the model's own block sets the
  // limit (it wins over the request, so more room asked here would change nothing)
  if (!retry && thinkingOnly(r) && !(limit && limit.fromModel)) {
    const room = Math.min(RETRY_MAX, Math.max((limit ? limit.max : cfg.maxTokens) * RETRY_FACTOR, cfg.maxTokens + 2000));
    ask("world_retry", room);
    return { __llmPending: true, stash: { retry: true, upTo: stash.upTo || upTo, started, roomy: true } };
  }
  const usage = isObj(r.usage) ? { input: num(r.usage.input), output: num(r.usage.output), cost: r.usage.priced === false ? 0 : num(r.usage.costTotal) } : null;
  const run = { at: Date.now(), reason, model: str(r.model) && r.model !== "error" ? str(r.model) : play.model, ms: Math.round(num(r.genTimeMs) || Date.now() - started), ...(usage ? { usage } : {}), ...(limit ? { limit } : {}), ...(retry ? { retried: true } : {}) };
  const count = (u) => {
    const t = state.usage || { input: 0, output: 0, cost: 0, runs: 0 };
    state.usage = { input: t.input + (u ? u.input : 0), output: t.output + (u ? u.output : 0), cost: t.cost + (u ? u.cost : 0), runs: t.runs + 1 };
  };
  const fail = (err) => {
    state.lastError = cleanError({ at: Date.now(), ...err });
    state.log = [...state.log, { ...run, key: state.lastKey, changes: 0, fronts: 0, summary: "", error: state.lastError.code }].slice(-LOG_MAX);
    count(usage);
    saveState(fsx, state);
    return ok({ ok: false, error: state.lastError.message, code: state.lastError.code });
  };
  if (r.error || !str(r.text)) return fail(classifyError(r, limit));
  const out = parseReply(r.text);
  if (!out) return fail({ code: "not-json", message: "The DM's reply was not JSON. Small models often fail at this: pick a stronger play model.", details: cut(str(r.text), 1200) });
  const changes = applyReport(state, out, { cards, userName, now: Date.now() });
  const codeClocks = options.clocks === "code";
  let moved = level !== "chronicler" ? applyLevel(state, out, { level, direction: scene && scene.direction, now: Date.now(), catchingUp, codeClocks }) : 0;
  if (level !== "chronicler" && codeClocks) moved += tickClocks(state, take.msgs.filter(isReply).length, options.clockEvery, Date.now());
  if (scene && scene.direction === "transition") state.transitionKey = scene.key;
  state.lastKey = str(stash.upTo) || upTo;
  state.lastRunAt = Date.now();
  if (str(r.model)) state.lastModel = str(r.model);
  delete state.lastError;
  const behind = catchingUp ? unreadMessages(chat.msgs, state.lastKey).length : 0;
  state.log = [...state.log, { ...run, key: state.lastKey, changes, fronts: moved, summary: cut(str(out.summary), 200), ...(behind ? { behind } : {}) }].slice(-LOG_MAX);
  count(usage);
  if (changes || state.entities.length) {
    writeBook(fsx, state, str(chat.meta.title));
    bindBook(fsx, chatId, chat.meta, state.bookId);
  }
  saveState(fsx, state);
  return ok({ ok: true, changes, ...stateView(state, chat.msgs, cfg, scene, play) });
}

/** The World section's list: every chat with a DM state, newest run first. Chats that are gone are skipped. */
function chatsRoute(req, host) {
  const fsx = host.fs;
  let files = [];
  try {
    files = fsx.list("world/state").filter((f) => f.endsWith(".json"));
  } catch {}
  const chats = [];
  for (const f of files) {
    const chatId = f.slice(0, -5);
    if (!CHAT_ID.test(chatId)) continue;
    const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
    if (!isObj(meta)) continue;
    const { state } = loadState(fsx, chatId);
    if (state.settings.level === "off" && !state.entities.length) continue;
    chats.push({
      chatId,
      title: str(meta.title),
      characterId: str(meta.characterId) || null,
      groupId: str(meta.groupId) || null,
      cards: cardNames(fsx, meta),
      level: state.settings.level,
      lastRunAt: state.lastRunAt ?? null,
      error: state.lastError ? state.lastError.code : null,
      errorAt: state.lastError ? state.lastError.at : null,
      records: state.entities.filter((e) => e.status === "active").length,
      fronts: state.fronts.filter((x) => x.status === "active").length,
      usage: state.usage || { input: 0, output: 0, cost: 0, runs: 0 },
    });
  }
  chats.sort((a, b) => (b.lastRunAt || 0) - (a.lastRunAt || 0));
  return ok({ chats });
}

/** The run history, newest first: when, why, what changed, tokens, time, errors. Summaries can spoil: the app asks first. */
function runsRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const { state } = loadState(host.fs, chatId);
  return ok({ runs: state.log.map(runView).reverse(), usage: state.usage || { input: 0, output: 0, cost: 0, runs: 0 }, lastError: state.lastError ?? null });
}

/** The profiles: list, change (blocks, name, defaults), make, remove. */
function profilesRoute(req, host) {
  const fsx = host.fs;
  if (req.method === "GET") return ok({ profiles: listProfiles(fsx) });
  if (req.method === "DELETE") {
    const id = String((req.query && req.query.id) || "");
    if (!OWN_PROFILE_ID.test(id)) return ok({ error: "only your own profiles can be removed" }, 400);
    try {
      fsx.remove(PROFILE_DIR + id + ".json");
    } catch {}
    return ok({ profiles: listProfiles(fsx) });
  }
  const b = body(req);
  let id = str(b.id);
  const builtIn = PROFILE_LEVELS.includes(id);
  const current = id ? loadProfile(fsx, id) : null;
  if (id && !builtIn && !OWN_PROFILE_ID.test(id)) return ok({ error: "bad profile id" }, 400);
  if (!current) {
    // a new own profile: on a base level, from that level's texts unless blocks say otherwise
    if (!PROFILE_LEVELS.includes(b.base)) return ok({ error: "a new profile needs a base level" }, 400);
    const own = listProfiles(fsx).filter((p) => !p.builtIn).length;
    if (own >= PROFILES_MAX) return ok({ error: "too many profiles" }, 400);
    if (!id) {
      const slug = str(b.name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "profile";
      id = "p-" + slug;
      for (let n = 2; readProfileFile(fsx, id); n++) id = "p-" + slug + "-" + n;
    }
  }
  const base = current ? current.base : b.base;
  // a block sent as null goes back to its default; a string replaces it; a missing one stays
  const blocks = { ...(current ? current.blocks : {}) };
  if (isObj(b.blocks)) for (const [k, v] of Object.entries(b.blocks)) if (v === null) delete blocks[k]; else if (typeof v === "string") blocks[k] = v;
  if (b.blocks && isObj(b.blocks) && typeof b.blocks.event === "string" && !b.blocks.event.includes("{event}") && b.blocks.event.trim()) return ok({ error: "the event block must keep {event}" }, 400);
  const next = {
    v: 1,
    ...(builtIn ? {} : { name: cut(str(b.name !== undefined ? b.name : current ? current.name : ""), NAME_LEN) || "Profile", description: cut(str(b.description !== undefined ? b.description : current ? current.description : ""), DESC_LEN), base }),
    blocks: cleanBlocks(blocks, base),
    defaults: cleanDefaults(b.defaults !== undefined ? b.defaults : current ? current.defaults : {}),
    options: cleanOptions({ ...(current ? current.options : {}), ...(isObj(b.options) ? b.options : {}) }),
  };
  const plain = builtIn && !Object.keys(next.blocks).length && JSON.stringify(next.defaults) === JSON.stringify(DEFAULT_PROFILE_SETTINGS) && JSON.stringify(next.options) === JSON.stringify(DEFAULT_OPTIONS);
  if (plain) {
    try {
      fsx.remove(PROFILE_DIR + id + ".json");
    } catch {}
  } else writeJson(fsx, PROFILE_DIR + id + ".json", next);
  return ok({ id, profiles: listProfiles(fsx) });
}

/** The player edits the world book by hand: add, change, retire, bring back or delete a record. */
function recordsRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state } = loadState(fsx, chatId);
  const r = isObj(b.record) ? b.record : {};
  const op = str(b.op);
  const now = Date.now();
  const name = cut(str(r.name), NAME_MAX);
  const text = cut(str(r.text), TEXT_MAX);
  const clash = (exceptId) => state.entities.find((e) => e.id !== exceptId && namesOf(e).some((n) => sameName(n, name)));
  if (op === "add") {
    if (!name || !text) return ok({ error: "a record needs a name and a text" }, 400);
    if (clash(null)) return ok({ error: "a record with this name exists" }, 409);
    if (state.entities.length >= ENTITIES_MAX) return ok({ error: "the world book is full" }, 400);
    state.entities.push({ id: "n" + state.nextId++, kind: KINDS.includes(r.kind) ? r.kind : "fact", name, aliases: cleanAliases(r.aliases, name), text, status: "active", uid: 0, at: now, by: "player" });
  } else {
    const e = state.entities.find((x) => x.id === str(r.id));
    if (!e) return ok({ error: "no such record" }, 404);
    if (op === "update") {
      if (name && clash(e.id)) return ok({ error: "a record with this name exists" }, 409);
      if (name) e.name = name;
      if (r.text !== undefined) {
        if (!text) return ok({ error: "a record needs a text" }, 400);
        e.text = e.status === "past" ? cut(text, PAST_TEXT_MAX) : text;
      }
      if (KINDS.includes(r.kind)) e.kind = r.kind;
      if (r.aliases !== undefined) e.aliases = cleanAliases(r.aliases, e.name);
    } else if (op === "retire") {
      e.status = "past";
      e.text = shortText(text || e.text);
    } else if (op === "restore") e.status = "active";
    else if (op === "delete") state.entities = state.entities.filter((x) => x !== e);
    else return ok({ error: "unknown op" }, 400);
    if (op !== "delete") {
      e.at = now;
      e.by = "player";
    }
  }
  writeBook(fsx, state, str(chat.meta.title));
  bindBook(fsx, chatId, chat.meta, state.bookId);
  saveState(fsx, state);
  return peekRoute({ query: { chatId } }, host);
}

/** "Test the model": one tiny call. Says it works, or the plain reason, with the limit in force. */
function testRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  const which = b.which === "build" ? "build" : "play";
  const meta = CHAT_ID.test(chatId) ? readJson(fsx, "chats/" + chatId + ".meta.json", null) : null;
  const cfg = loadConfig(fsx);
  const pick = which === "build" ? buildModel(fsx, cfg, isObj(meta) ? meta : null) : playModel(fsx, cfg, isObj(meta) ? meta : null);
  const r = host.llm.results.world_test;
  if (!r) {
    host.llm.request("world_test", {
      ...(pick.model ? { model: pick.model } : {}),
      systemPrompt: "You answer with one JSON object and nothing else.",
      messages: [{ role: "user", content: 'Reply with exactly this JSON: {"ok":true}' }],
      ...callParams(fsx, cfg, isObj(meta) ? meta : null),
    });
    return { __llmPending: true };
  }
  const limit = limitOf(r);
  const base = { which, model: str(r.model) && r.model !== "error" ? str(r.model) : pick.model, from: pick.from, ms: Math.round(num(r.genTimeMs)), ...(limit ? { limit } : {}) };
  if (r.error || !str(r.text)) return ok({ ok: false, ...base, ...classifyError(r, limit) });
  const out = parseReply(r.text);
  if (!out) return ok({ ok: false, ...base, code: "not-json", message: "The model answers, but not in JSON: the DM needs JSON. Pick a stronger model.", details: cut(str(r.text), 600) });
  return ok({ ok: true, ...base, thinks: !!str(r.reasoning) });
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (!path.startsWith("/world/")) return null;
  if (path === "/world/state" && req.method === "GET") return stateRoute(req, host);
  if (path === "/world/settings" && req.method === "PUT") return settingsRoute(req, host);
  if (path === "/world/peek" && req.method === "GET") return peekRoute(req, host);
  if (path === "/world/config" && (req.method === "GET" || req.method === "PUT")) return configRoute(req, host);
  if (path === "/world/update" && req.method === "POST") return updateRoute(req, host);
  if (path === "/world/chats" && req.method === "GET") return chatsRoute(req, host);
  if (path === "/world/runs" && req.method === "GET") return runsRoute(req, host);
  if (path === "/world/test" && req.method === "POST") return testRoute(req, host);
  if (path === "/world/profiles" && ["GET", "PUT", "DELETE"].includes(req.method)) return profilesRoute(req, host);
  if (path === "/world/records" && req.method === "PUT") return recordsRoute(req, host);
  return ok({ error: "not found" }, 404);
}
