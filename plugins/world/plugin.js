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
 *  POST /world/records/keys {chatId}   the build model writes keys for the living records that have none
 *  GET  /world/recipes               what a start can build (from the cards, an interview, the player's own files)
 *  POST /world/start {chatId, begin?, recipe?, cardIds?, answers?, lang?, deck?}   begin = a new draft; then
 *                                     each call makes one build call (two-phase) until done == total.
 *                                     {begin, newWorld: true, name, description?, level?, profile?, ...} builds a
 *                                     world without a chat (answers worldId; later calls send {worldId});
 *                                     {worldId, peek: true} reads its draft without a build call
 *  PUT  /world/draft {chatId | worldId, op: accept|discard, drop?: {entities, fronts, deck}}   the draft into
 *                                     the world (a worldId's draft becomes a saved world)
 *  POST /world/deck {chatId, lang?}   a new events deck (profile option deck)
 *  GET|POST|PUT|DELETE /world/library  saved worlds: list, save a chat's world {chatId, name?, description?},
 *                                     rename {id, name?, description?}, remove ?id=
 *  POST /world/carry {toChatId, fromChatId? | worldId?, replace?}   a world into a chat (records, fronts, clocks)
 *  POST /world/opening {chatId, worldId?, wish?, lang?}   the build model drafts the chat's scenario and first message
 *  PUT  /world/override {chatId, scenario?: {text, mode: replace|append} | null, opening?}   the chat's own
 *                                     scenario (meta.worldScenario, read by the engine plugin) and first message
 *  GET|POST|PUT /world/backgrounds {chatId|worldId}   the world's places and folder; POST {places, direction?,
 *                                     variants?, taken?} plans a set (build model); PUT {folderId|null} links a folder
 *  POST /world/backgrounds/places {chatId|worldId}   the build model lists the places the cards and records name
 *  POST /world/backgrounds/name {image, model?, hint?}   a vision model names one background: {file, tags}
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
 *  world/recipes/<id>.json     a recipe of the player's (an id of a built-in replaces it)
 *  world/library/w-<id>.json   a saved world: records, fronts, deck, settings
 *  world/library/w-<id>.draft.json   a world being built without a chat, until accepted
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
const FOLDER_ID = /^[A-Za-z0-9_-]{1,80}$/;

export const LEVELS = ["off", "chronicler", "living", "director", "antagonist", "chaos"];
/** The levels that work today (all of them since P2). */
export const READY_LEVELS = LEVELS;
/** Levels whose events are a MUST for the writing model; living sends soft rumours. */
const HARD_LEVELS = ["director", "antagonist", "chaos"];
export const DIRECTIONS = ["domestic", "social", "intrigue", "investigation", "travel", "combat", "explicit", "transition"];
/** Stagnation threshold per direction: x2 slow, x0.5 fast, 0 = the counter is paused. */
const STAGNATION_FACTOR = { domestic: 2, social: 1, intrigue: 1, investigation: 1, travel: 0.5, combat: 0, explicit: 0, transition: 1 };
export const KINDS = ["person", "place", "group", "thing", "fact"];

export const DEFAULT_SETTINGS = { level: "off", everyN: 5, stagnation: 6, onTransition: true, insert: true, profile: "", dice: "", diceStat: "", diceChance: 0 };
// model = the play model (runs after replies), buildModel = the one that builds worlds (P3 Start)
// imageModel: the backgrounds' image model ("" = the app's, Settings > Images); autoBackground: new chats in a
// world switch backgrounds by scene (off by default, user 2026-10-19: it changes how the chat looks)
export const DEFAULT_CONFIG = { model: "", buildModel: "", maxTokens: 1500, imageModel: "", autoBackground: false };

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
/** A text shown to the player, shortened at a word with an ellipsis instead of mid-word. */
const shorten = (s, n) => {
  if (s.length <= n) return s;
  const head = s.slice(0, n - 1);
  const space = head.lastIndexOf(" ");
  return (space > n * 0.6 ? head.slice(0, space) : head).replace(/[\s,.;:]+$/, "") + "…";
};
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
    imageModel: MODEL_REF.test(str(c.imageModel)) ? str(c.imageModel) : "",
    autoBackground: c.autoBackground === true,
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
    // this chat's dice over the profile's: "" / 0 = the profile decides (user, 2026-10-27: the switch sits in the chat's sheet)
    dice: DICE_MODES.includes(b.dice) ? b.dice : "",
    diceStat: DICE_STAT_CHOICES.includes(b.diceStat) ? b.diceStat : "",
    diceChance: Number.isFinite(Number(b.diceChance)) && Number(b.diceChance) >= 1 ? clamp(Math.round(Number(b.diceChance)), 1, 100) : 0,
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
    // always in the prompt, no keys needed (the player pins it in the Records tab)
    ...(e.pinned === true ? { pinned: true } : {}),
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
  const deck = cleanDeck(s.deck);
  if (deck.length) out.deck = deck;
  const draft = cleanDraft(s.draft);
  if (draft) out.draft = draft;
  if (isObj(s.origin) && str(s.origin.kind)) out.origin = s.origin;
  // the world's backgrounds: a folder of the app's Backgrounds library (its id lives in library.json)
  if (FOLDER_ID.test(str(s.backgroundFolderId))) out.backgroundFolderId = str(s.backgroundFolderId);
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
  // a world built without a chat names its cards itself
  if (Array.isArray(meta.cardIds)) return meta.cardIds.filter((id) => typeof id === "string" && CHAT_ID.test(id));
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
  "- Skip what does not matter beyond this scene: a nameless passer-by, the furniture, a passing mood, and things a character just carries or wears (a backpack, a bottle, a phone, a coat). Record a thing only when the story makes it matter: a clue, a weapon, a gift, a promise, something people fight over.",
  "- One record per person, place, group, thing or fact. Its text is one to three short sentences in the present tense: what someone needs to know when the name comes up again (who or what it is, where, how it stands toward the characters).",
  "- Update a record only when the story changed something about it (it moved, was hurt, a secret came out). Never update a record just to reword it.",
  "- Retire a record when it is finished for good (dead, destroyed, gone from the story for good). Its text then says in one or two sentences who or what it was and how it ended.",
  "- aliases: the keys that bring this record into the story: 2 to 5 short words or phrases the story will use when it comes up again: a short name, how the characters call it, its main word (for \"IKEA dresser\": \"dresser\"; for \"Ava's house\": \"Ava's place\", \"Ava's home\"), exactly as the story would spell them. Never a word that comes up in every scene (room, door, day, man).",
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
// events deck (Arbiter's way, user 2026-10-19, off by default): built at start, the DM picks one by id
// dice (user, 2026-10-27, off by default): code rolls 2d6 plus a Dashboard number before the reply is written
export const DICE_MODES = ["off", "flavour", "strict"];
export const DICE_STATS = ["trust", "comfort", "attraction", "respect", "affection"];
// "auto": the model takes the stat the attempted action leans on (code rolls the die once and gives the result for every stat)
export const DICE_STAT_CHOICES = ["auto", ...DICE_STATS];
export const DEFAULT_OPTIONS = { clocks: "model", clockEvery: 6, eventByClock: false, deck: false, dice: "off", diceStat: "auto", diceChance: 25 };

function cleanOptions(o) {
  const b = isObj(o) ? o : {};
  const n = Number(b.clockEvery);
  return {
    clocks: b.clocks === "code" ? "code" : "model",
    clockEvery: Number.isFinite(n) ? clamp(Math.round(n), 2, 50) : DEFAULT_OPTIONS.clockEvery,
    eventByClock: b.eventByClock === true,
    deck: b.deck === true,
    dice: DICE_MODES.includes(b.dice) ? b.dice : DEFAULT_OPTIONS.dice,
    diceStat: DICE_STAT_CHOICES.includes(b.diceStat) ? b.diceStat : DEFAULT_OPTIONS.diceStat,
    diceChance: Number.isFinite(Number(b.diceChance)) ? clamp(Math.round(Number(b.diceChance)), 1, 100) : DEFAULT_OPTIONS.diceChance,
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
export function dmInput({ cards, userName, entities, msgs, level, fronts, event, direction, threads, cap, catchingUp, options, deck }) {
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
    ...(level && LEVEL_RULES[level] ? levelInput({ fronts, event, direction, threads, options, deck }) : []),
    ...(catchingUp ? ["This is an older part of the story, read to catch up; newer parts come in the next runs. Record the world, move the fronts if time passed, but send no event: event null."] : []),
    "New part of the story\n" + story,
  ].join("\n\n");
}

/** How far a front's clock is, as the wording its news should take. */
export function clockStage(f) {
  const r = f.size ? f.clock / f.size : 0;
  return r < 1 / 3 ? "early: only a subtle rumour or a small sign" : r < 2 / 3 ? "growing: a visible development people talk about" : "late: unmistakable, it touches the characters' lives";
}

function levelInput({ fronts, event, direction, threads, options, deck }) {
  const o = options || DEFAULT_OPTIONS;
  const active = arr(fronts).filter((f) => f.status === "active");
  const out = ["Fronts" + (active.length ? "\n" + active.map(frontLine).join("\n") : ": none yet.")];
  if (o.clocks === "code") out.push("The clocks tick by themselves as story time passes: never send tick ops. Add a front when the story sets one up, retire one that is finished.");
  if (o.eventByClock && active.length) {
    out.push("How news of each front reads now, by its clock:\n" + active.map((f) => f.id + " " + f.name + ": " + clockStage(f)).join("\n"));
    out.push("Off-screen effects arrive as news, threats or signs, never as harm already done to the user's character.");
  }
  if (Array.isArray(deck)) {
    out.push(deck.length
      ? 'Events deck: an event comes only from this deck. When one is due, pick the card that fits the scene best and send event {"deck":"<its id>"}; never invent one.\n' + deck.map((c) => c.id + " · " + c.text).join("\n")
      : "The events deck is used up: send no event (event null).");
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
export function applyLevel(state, out, { level, direction, now, catchingUp, codeClocks, useDeck }) {
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
  // with the deck on, only a card of the deck becomes the event, and it is used up
  const card = useDeck && isObj(out.event) ? arr(state.deck).find((c) => c.id === str(out.event.deck)) : null;
  const text = useDeck ? (card ? card.text : "") : isObj(out.event) ? cut(str(out.event.text), EVENT_MAX) : "";
  if (card && !quiet && !catchingUp && (!state.event || state.event.sent === 0)) state.deck = state.deck.filter((c) => c !== card);
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

// ---------- the dice ----------
// Code rolls before the reply is written (no model call): 2d6 plus a modifier from one of the
// character's Dashboard numbers (-100..100, a twentieth of it, so -5..+5), read as four outcomes.
// The line rides the reply request like the DM's event and shows in the prompt Inspector as "Dice".
const DICE_BANDS = [5, 7, 9]; // up to 5 miss, 6-7 no but, 8-9 yes but, 10 and more full
const DICE_OUTCOMES = {
  miss: ["miss", "it fails outright and costs something"],
  no_but: ["no, but", "it does not work, but something is gained or a way stays open"],
  yes_but: ["yes, but", "it works, but with a complication or a price"],
  full: ["full success", "it works cleanly, with no complication"],
};
const DICE_LOG_MAX = 30;
const dicePath = (chatId) => "world/dice/" + chatId + ".json";

function hashText(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same seed gives the same rolls, so a reload does not re-roll and a swipe does. */
export function seededRandom(seed) {
  let a = hashText(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const diceMod = (value) => (Number.isFinite(value) ? clamp(Math.sign(value) * Math.round(Math.abs(value) / 20), -5, 5) : 0);

export function diceOutcome(total) {
  return total <= DICE_BANDS[0] ? "miss" : total <= DICE_BANDS[1] ? "no_but" : total <= DICE_BANDS[2] ? "yes_but" : "full";
}

/** One roll for one reply: first whether the die is on the table at all (chance, percent), then 2d6 + mod. */
export function rollFate(seed, chance, mod) {
  const rnd = seededRandom(seed);
  const gate = Math.floor(rnd() * 100) + 1;
  if (gate > chance) return { gated: false, gate };
  const d1 = Math.floor(rnd() * 6) + 1;
  const d2 = Math.floor(rnd() * 6) + 1;
  const total = d1 + d2 + mod;
  return { gated: true, gate, d1, d2, mod, total, outcome: diceOutcome(total) };
}

export function diceInsert(roll, mode, stat, who) {
  const [label, meaning] = DICE_OUTCOMES[roll.outcome];
  const sign = roll.mod >= 0 ? "+" : "-";
  const from = who ? " (" + stat + " of " + who + ")" : "";
  return [
    "[FATE: a hidden roll for this reply. Never mention dice, numbers or this note.]",
    "2d6 " + sign + " " + Math.abs(roll.mod) + from + " = " + roll.total + ": " + label + ".",
    "If the user's character attempts something uncertain in this turn, " + meaning + ".",
    mode === "strict" ? "This result binds: do not soften it, reverse it or add a way around it." : "Let it colour the scene and stay in character; bend it only where the character demands.",
    "If nothing uncertain is attempted, ignore this note.",
  ].join(" ");
}

/** Auto stat: one 2d6, and the outcome it makes with each of the five numbers; the model takes the stat the action leans on. */
export function rollFateAuto(seed, chance, stats) {
  const roll = rollFate(seed, chance, 0);
  if (!roll.gated) return roll;
  const base = roll.d1 + roll.d2;
  const by = {};
  for (const st of DICE_STATS) by[st] = diceOutcome(base + diceMod(stats[st]));
  return { gated: true, gate: roll.gate, d1: roll.d1, d2: roll.d2, mod: 0, total: base, outcome: diceOutcome(base), by };
}

export function diceInsertAuto(roll, mode, who) {
  const groups = {};
  for (const st of DICE_STATS) (groups[roll.by[st]] ||= []).push(st);
  const order = ["full", "yes_but", "no_but", "miss"].filter((o) => groups[o]);
  const lines = order.map((o) => DICE_OUTCOMES[o][0] + ": " + groups[o].join(", "));
  const legend = [...new Set([...order, roll.outcome])].map((o) => DICE_OUTCOMES[o][0] + " = " + DICE_OUTCOMES[o][1]).join("; ");
  return [
    "[FATE: a hidden roll for this reply. Never mention dice, numbers or this note.]",
    "2d6 = " + roll.total + (who ? " for " + who : "") + ".",
    "If the user's character attempts something uncertain in this turn, take the stat the action leans on and use its result (" + lines.join(" | ") + "; any other action: " + DICE_OUTCOMES[roll.outcome][0] + "). Meanings: " + legend + ".",
    mode === "strict" ? "This result binds: do not soften it, reverse it or add a way around it." : "Let it colour the scene and stay in character; bend it only where the character demands.",
    "If nothing uncertain is attempted, ignore this note.",
  ].join(" ");
}

/** The newest Dashboard snapshot on the chat's active line. */
function lastSnapshot(fsx, chatId, msgs) {
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const snaps = isObj(dash) && isObj(dash.snapshots) ? dash.snapshots : null;
  if (!snaps) return null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const sn = snaps[keyOf(msgs[i])];
    if (isObj(sn)) return sn;
  }
  return null;
}

/** The number the die adds: the speaker's (else the first present character's) Dashboard value toward the user. */
export function diceStatOf(fsx, chatId, msgs, speakerName, stat) {
  const { who, stats } = diceStatsOf(fsx, chatId, msgs, speakerName);
  return { who, value: stats && Number.isFinite(stats[stat]) ? stats[stat] : null };
}

/** All of that character's numbers (null when the Dashboard has none). */
export function diceStatsOf(fsx, chatId, msgs, speakerName) {
  const sn = lastSnapshot(fsx, chatId, msgs);
  if (!sn || !isObj(sn.chars)) return { who: "", stats: null };
  const present = arr(sn.present).filter((n) => isObj(sn.chars[n]));
  const who = present.includes(speakerName) ? speakerName : present[0] || "";
  return { who, stats: who && isObj(sn.chars[who].stats) ? sn.chars[who].stats : null };
}

function logDice(fsx, chatId, entry) {
  const old = readJson(fsx, dicePath(chatId), null);
  const rolls = isObj(old) ? arr(old.rolls).filter(isObj) : [];
  writeJson(fsx, dicePath(chatId), { v: 1, rolls: [...rolls, entry].slice(-DICE_LOG_MAX) });
}

/** The dice in force for a chat: its own setting where set, else the profile's option. */
export function diceOf(profile, settings) {
  const o = profile && profile.options ? profile.options : DEFAULT_OPTIONS;
  return {
    mode: settings.dice || o.dice,
    stat: settings.diceStat || o.diceStat,
    chance: settings.diceChance || o.diceChance,
  };
}

function diceRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const raw = readJson(host.fs, dicePath(chatId), null);
  return ok({ rolls: isObj(raw) ? arr(raw.rolls).filter(isObj) : [] });
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
    const { state, existed } = loadState(fsx, chatId);
    if (!existed) return null;
    const lv = state.settings.level;
    if (!state.settings.insert || lv === "off" || lv === "chronicler") return null;
    const profile = profileFor(fsx, state.settings);
    const eventDue = !!state.event && state.event.sent === 0;
    const dice = diceOf(profile, state.settings);
    const diceMode = profile ? dice.mode : "off";
    if (!eventDue && diceMode === "off") return null;
    const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
    const off = isObj(meta) && isObj(meta.promptBoard) && Array.isArray(meta.promptBoard.off) ? meta.promptBoard.off : [];
    if (off.includes("plugin:world")) return null;
    const chat = readChat(fsx, chatId);
    const dir = directionOf(state, chat ? sceneOf(fsx, chatId, chat.msgs) : null);
    if (dir === "explicit") return null;
    if (dir === "combat" && lv !== "antagonist" && lv !== "chaos") return null;
    const parts = [];
    const eventText = eventDue ? eventInsert(state.event, profile && profile.blocks.event) : null;
    if (eventText) {
      state.event = { ...state.event, sent: state.event.sent + 1, sentAt: Date.now() };
      saveState(fsx, state);
      parts.push({ kind: "plugin", label: "World DM", text: eventText });
    }
    if (diceMode !== "off") {
      const opt = { diceStat: dice.stat, diceChance: dice.chance };
      // the chat's own last message, not the request: other plugins rewrite the request text before or after this hook
      const msgs = chat ? chat.msgs : [];
      const seed = chatId + "|" + (msgs.length ? keyOf(msgs[msgs.length - 1]) : "") + "|" + msgs.length + "|" + str(turn.op) + "|" + (Number.isFinite(turn.swipe) ? turn.swipe : 0);
      let text = "";
      if (opt.diceStat === "auto") {
        const { who, stats } = diceStatsOf(fsx, chatId, msgs, str(turn.speakerName));
        const roll = rollFateAuto(seed, opt.diceChance, stats || {});
        logDice(fsx, chatId, { at: Date.now(), op: str(turn.op), mode: diceMode, stat: "auto", who, value: null, chance: opt.diceChance, ...roll, inserted: roll.gated });
        if (roll.gated) text = diceInsertAuto(roll, diceMode, who);
      } else {
        const { who, value } = diceStatOf(fsx, chatId, msgs, str(turn.speakerName), opt.diceStat);
        const roll = rollFate(seed, opt.diceChance, diceMod(value));
        logDice(fsx, chatId, { at: Date.now(), op: str(turn.op), mode: diceMode, stat: opt.diceStat, who, value, chance: opt.diceChance, ...roll, inserted: roll.gated });
        if (roll.gated) text = diceInsert(roll, diceMode, opt.diceStat, who);
      }
      if (text) parts.push({ kind: "plugin", label: "Dice", text });
    }
    if (!parts.length) return null;
    return { messages: withLast(req.messages, parts.map((p) => p.text).join("\n\n")), promptSources: { parts } };
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
    // a pinned living record is always in the prompt; the rest come up by their keys
    status: e.pinned && e.status !== "past" ? "constant" : "normal",
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
    description: "Reads the cards, then invents the setting, the people and the trouble around them.",
    mode: "invent",
    questions: [],
    sections: [
      { id: "setting", kinds: ["place", "group", "fact"], max: 6, prompt: "Invent the setting these characters live in: the main places where their days go, the groups and powers around them (families, schools, guilds, gangs, authorities) and the customs or history that shape daily life." },
      { id: "people", kinds: ["person"], max: 5, prompt: "Invent the other people of this world who will meet these characters: allies, rivals, someone who owes or fears them. Each one wants something." },
      { id: "trouble", kinds: ["fact", "thing"], max: 4, prompt: "Invent what can go wrong for these characters: a secret, a rumour, a danger, and at most one object that matters to the story." },
    ],
    fronts: { count: 2, prompt: "Invent the powers that want something from these characters or this place and will move off screen." },
  },
  {
    id: "interview",
    name: "Interview",
    description: "A few questions about the story you want; the DM builds a world around the cards from your answers.",
    mode: "invent",
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
    id, name: cut(str(raw.name), NAME_LEN) || id, description: cut(str(raw.description), DESC_LEN), mode: raw.mode === "invent" ? "invent" : "learn", questions, sections,
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
      if (str(card[field])) parts.push({ label: name + ": " + field, text: str(card[field]), kind: "card" });
    }
    addBooks(booksOf(card));
  }
  if (meta.groupId) {
    const group = readJson(fsx, "groups/" + meta.groupId + ".json", null);
    if (isObj(group)) {
      if (str(group.scenario)) parts.push({ label: (str(group.name) || "group") + ": scenario", text: str(group.scenario), kind: "card" });
      addBooks(booksOf(group));
    }
  }
  for (const id of books) {
    const book = readJson(fsx, "lorebooks/" + id + ".json", null);
    if (!isObj(book) || str(book.ownerChatId)) continue;
    for (const e of arr(book.entries)) {
      if (!isObj(e) || e.enabled === false || !str(e.content)) continue;
      const title = str(e.title) || arr(e.keys).map(str).filter(Boolean).slice(0, 3).join(", ");
      parts.push({ label: (str(book.name) || id) + (title ? ": " + title : ""), text: str(e.content), kind: "lore", title });
    }
  }
  let total = 0;
  return parts.filter((p) => (total += p.text.length) <= SOURCE_MAX);
}

const BRIEF_FIELD = { description: 900, personality: 500, scenario: 500 };
const BRIEF_LORE = 40;
/**
 * What an inventing recipe reads instead of every chunk: each card's fields cut short, and only the titles of
 * its books' entries (what already exists, so the new records agree with it). One text of at most `max`
 * characters: a small context window reads it whole, and the calls do not repeat per chunk.
 */
export function castBrief(parts, max = CHUNK_MAX) {
  const own = [];
  for (const p of parts) {
    if (p.kind === "lore") continue;
    const field = /: (description|personality|scenario)$/.exec(p.label);
    own.push("[" + p.label + "]\n" + cut(p.text, field ? BRIEF_FIELD[field[1]] : BRIEF_FIELD.scenario));
  }
  const titles = [...new Set(parts.filter((p) => p.kind === "lore" && p.title).map((p) => p.title))].slice(0, BRIEF_LORE);
  const head = own.join("\n\n");
  const tail = titles.length ? "Already in the cards' lorebooks (do not repeat or retell; stay consistent with them):\n" + titles.map((t) => "- " + t).join("\n") : "";
  const text = [head, tail].filter(Boolean).join("\n\n");
  return text.length <= max ? text : cut(head, max);
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

/** A step's `chunk` when it reads the brief (castBrief) instead of a chunk of the cards. */
const BRIEF_STEP = -2;
const BUILD_RULES = [
  "You build the world of a roleplay story before it starts. Another model will write the story; it reads your record when a name comes up.",
  "Rules:",
  "- Learn from the texts you are given; write each record in your own short words. Never copy a text whole.",
  "- Do not record the user's character or the characters listed as having their own cards: they are kept elsewhere.",
  "- One record per person, place, group, thing or fact. Its text is one to three short sentences in the present tense: what someone needs to know when the name comes up (who or what it is, where, how it stands toward the characters).",
  "- Never repeat a record that is already in the world record; to add to one, use its exact name.",
  "- aliases: the keys that bring this record into the story: 2 to 5 short words or phrases the story will use when it comes up again: a short name, how the characters call it, its main word (for \"IKEA dresser\": \"dresser\"; for \"Ava's house\": \"Ava's place\", \"Ava's home\"), exactly as the story would spell them. Never a word that comes up in every scene (room, door, day, man).",
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
// An inventing recipe (from the cards, interview): the cards are the input, the world is new. The learning
// rules above stay for a recipe that records what texts say (a player's own file without `mode: "invent"`).
const INVENT_RULES = [
  "You build the world of a roleplay story before it starts. Another model will write the story; it reads your record when a name comes up.",
  "The cards describe the characters. Your job is to INVENT the world around them, not to retell them.",
  "Rules:",
  "- First decide the genre and the tone the cards imply. Every record you invent must fit them.",
  "- Never record what a card or a lorebook already says: those texts stay as they are. Use their names and facts so that your records agree with them, never contradict them.",
  "- Do not record the user's character or the characters listed as having their own cards: they are kept elsewhere.",
  "- Every record must touch at least one character: someone goes there, belongs to it, fears it, owes it or is hunted by it. Its text says how.",
  "- Give each record something to play with: a want, a secret, a danger or a rule. Not a bare description.",
  "- No trivia: not furniture, clothes or things a character just carries, unless the thing is the point (a clue, a weapon, a promise).",
  "- One record per person, place, group, thing or fact. Its text is one to three short sentences in the present tense.",
  "- Never repeat a record that is already in the world record; to add to one, use its exact name.",
  BUILD_RULES.find((r) => r.startsWith("- aliases:")),
  "- Only the JSON keys and kind values are English.",
];
export const BUILD_SYSTEM = [...BUILD_RULES, ...BUILD_OUTPUT].join("\n");
export const INVENT_SYSTEM = [...INVENT_RULES, ...BUILD_OUTPUT].join("\n");
const buildSystemFor = (recipe) => (recipe && recipe.mode === "invent" ? INVENT_SYSTEM : BUILD_SYSTEM);
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
    ...(chunk ? [(recipe.mode === "invent" ? "The cards (what already exists: agree with it, do not retell it)\n" : "Texts to learn from\n") + chunk] : []),
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
    // an inventing recipe reads the brief once per section, not every chunk of the cards
    if (recipe.mode === "invent") steps.push({ section: s.id, chunk: chunks.length ? BRIEF_STEP : -1 });
    else if (chunks.length) for (let i = 0; i < chunks.length; i++) steps.push({ section: s.id, chunk: i });
    else steps.push({ section: s.id, chunk: -1 });
  }
  if (withFronts && recipe.fronts.count > 0) steps.push({ fronts: true });
  return steps;
}


// ---------- start: the draft, the deck, the library, carry, the chat's own opening ----------
// A start writes a draft (user, 2026-10-19: free models invent extras, so the player removes what they do
// not want, then accepts). One route pass = one build call (two-phase); the app calls again until done.
const DECK_MIN = 8;
const DECK_MAX = 12;
const LIBRARY_DIR = "world/library/";
const WORLD_ID = /^w-[a-z0-9]{4,40}$/;
const LIBRARY_MAX = 100;
const SCENARIO_MAX = 4000;
const OPENING_MAX = 6000;
const LANG_MAX = 40;

export const DECK_SYSTEM = [
  "You build the world of a roleplay story. From the world record and its fronts, write a deck of events that can happen later in the story: each one concrete thing that happens in a scene (a visitor, a hook, a complication, news that cannot be ignored), built from the record and the fronts, never from nowhere.",
  "- One or two plain sentences each: what happens, who and where. Never write the story itself.",
  "- Mix small and big ones. They must fit the genre and the tone of the world.",
  "- Only the JSON keys are English.",
  "Output: one JSON object and nothing else, no code fences:",
  '{"deck":[{"text":"..."}],"summary":"one short line"}',
].join("\n");

export const OPENING_SYSTEM = [
  "You set up a new roleplay chat in a world that already exists. Write the chat's scenario (where and how the story starts: the situation, not the backstory) and its first message (the opening scene, written as the story's narrator or the character, in the card's style, ending where the user's character can act).",
  "- Build both from the world record and the cards; the card's own scenario and first message show the style, do not repeat them.",
  "- Never write what the user's character says, does or feels. Refer to them as {{user}} and to the card's character as {{char}}.",
  "- Only the JSON keys are English.",
  "Output: one JSON object and nothing else, no code fences:",
  '{"scenario":"...","opening":"..."}',
].join("\n");

function cleanCard(c, i) {
  const text = cut(str(isObj(c) ? c.text : c), EVENT_MAX);
  return text ? { id: isObj(c) && /^e\d{1,6}$/.test(str(c.id)) ? str(c.id) : "e" + (i + 1), text } : null;
}
export function cleanDeck(v) {
  const out = [];
  for (const c of arr(v)) {
    const x = cleanCard(c, out.length);
    if (x && !out.some((y) => y.id === x.id)) out.push(x);
    if (out.length >= DECK_MAX * 2) break;
  }
  return out;
}

function cleanDraft(d) {
  if (!isObj(d) || !str(d.recipe)) return null;
  const entities = arr(d.entities).map(cleanEntity).filter(Boolean);
  const fronts = arr(d.fronts).map(cleanFront).filter(Boolean);
  const steps = arr(d.steps).filter(isObj).slice(0, 60).map((s) => (s.fronts ? { fronts: true } : s.deck ? { deck: true } : { section: str(s.section), chunk: Math.round(Number(s.chunk)) }));
  return {
    recipe: str(d.recipe),
    cardIds: arr(d.cardIds).filter((id) => typeof id === "string" && CHAT_ID.test(id)),
    answers: isObj(d.answers) ? Object.fromEntries(Object.entries(d.answers).map(([k, v]) => [k, cut(str(v), ANSWER_MAX)]).filter(([, v]) => v)) : {},
    lang: cut(str(d.lang), LANG_MAX),
    steps,
    done: clamp(Math.round(num(d.done)), 0, steps.length),
    entities, nextId: Math.max(Number.isInteger(d.nextId) ? d.nextId : 1, entities.length + 1),
    fronts, nextFront: Math.max(Number.isInteger(d.nextFront) ? d.nextFront : 1, fronts.length + 1),
    deck: cleanDeck(d.deck),
    at: num(d.at) || Date.now(),
    ...(isObj(d.error) && str(d.error.message) ? { error: cleanError(d.error) } : {}),
  };
}

const draftView = (d) => (d ? { recipe: d.recipe, cardIds: d.cardIds, lang: d.lang, total: d.steps.length, done: d.done, entities: d.entities, fronts: d.fronts, deck: d.deck, at: d.at, error: d.error || null } : null);

/** The answer of a build call: the parsed object, or an error to keep (one retry on a rate limit or a reply all thinking). */
function buildResult(host, key, ask, stash) {
  const retry = stash.retry === true;
  const r = host.llm.results[retry ? key + "_retry" : key];
  if (!r) {
    ask(retry ? key + "_retry" : key);
    return { pending: { __llmPending: true, stash: { ...stash, retry, started: Number(stash.started) || Date.now() } } };
  }
  const limit = limitOf(r);
  if (!retry && (r.error ? isRateLimit(r) : thinkingOnly(r) && !(limit && limit.fromModel))) {
    ask(key + "_retry", thinkingOnly(r) ? Math.min(RETRY_MAX, 6000) : undefined);
    return { pending: { __llmPending: true, stash: { ...stash, retry: true, started: Number(stash.started) || Date.now() } } };
  }
  const usage = isObj(r.usage) ? { input: num(r.usage.input), output: num(r.usage.output), cost: r.usage.priced === false ? 0 : num(r.usage.costTotal) } : null;
  const run = { model: str(r.model) && r.model !== "error" ? str(r.model) : "", ms: Math.round(num(r.genTimeMs) || Date.now() - (Number(stash.started) || Date.now())), ...(usage ? { usage } : {}), ...(limit ? { limit } : {}), ...(retry ? { retried: true } : {}) };
  if (r.error || !str(r.text)) return { run, usage, error: classifyError(r, limit) };
  const out = parseReply(r.text) || firstJson(r.text);
  if (!out) return { run, usage, error: { code: "not-json", message: "The build model's reply was not JSON: pick a stronger build model.", details: cut(str(r.text), 1200) } };
  return { run, usage, out };
}

/** The first JSON object of a text, whatever keys it has (the deck and opening replies have none of the run's). */
function firstJson(text) {
  const s = String(text || "").replace(/```(?:json)?/gi, "");
  for (let i = s.indexOf("{"); i >= 0; i = s.indexOf("{", i + 1)) {
    const o = firstObject(s, i);
    if (!o) return null;
    try {
      const v = JSON.parse(o);
      if (isObj(v)) return v;
    } catch {}
  }
  return null;
}

/** Tokens of a build call count with the chat's DM; the run log shows it with its reason. */
function countBuild(state, built, reason, changes) {
  const u = built.usage;
  const t = state.usage || { input: 0, output: 0, cost: 0, runs: 0 };
  state.usage = { input: t.input + (u ? u.input : 0), output: t.output + (u ? u.output : 0), cost: t.cost + (u ? u.cost : 0), runs: t.runs + 1 };
  state.log = [...state.log, { at: Date.now(), reason, ...built.run, key: state.lastKey, changes, fronts: 0, summary: "", ...(built.error ? { error: cleanError(built.error).code } : {}) }].slice(-LOG_MAX);
}

function buildAsk(host, fsx, cfg, meta, systemPrompt, content) {
  const pick = buildModel(fsx, cfg, meta);
  return (k, maxTokens) =>
    host.llm.request(k, {
      ...(pick.model ? { model: pick.model } : {}),
      systemPrompt,
      messages: [{ role: "user", content }],
      ...callParams(fsx, cfg, meta, maxTokens || Math.max(cfg.maxTokens, 2000)),
    });
}

/** The draft's records merged by name; never one the world already has. */
function mergeDraft(draft, state, out, section, ctx) {
  const known = (name) => !!findEntity(state.entities, { name });
  const adds = arr(out.add).filter((a) => isObj(a) && !known(cut(str(a.name), NAME_MAX)))
    .map((a) => ({ ...a, kind: section.kinds.includes(a.kind) ? a.kind : section.kinds[0] }))
    .slice(0, section.max);
  const pseudo = { entities: draft.entities, nextId: draft.nextId };
  const changes = applyReport(pseudo, { add: adds }, ctx);
  draft.entities = pseudo.entities.map((e) => (/^n\d/.test(e.id) ? { ...e, id: "d" + e.id.slice(1) } : e));
  draft.nextId = pseudo.nextId;
  return changes;
}

function deckFrom(out, max) {
  return arr(out.deck).map((c, i) => cleanCard(c, i)).filter(Boolean).slice(0, max);
}

const nextDeckId = (deck) => deck.reduce((m, c) => Math.max(m, Number(c.id.slice(1)) || 0), 0) + 1;

// A world can also be built without a chat (user, 2026-10-19: "New world" in the Worlds tab): its draft
// lives in world/library/<id>.draft.json until it is accepted into the library as <id>.json.
const draftPath = (id) => LIBRARY_DIR + id + ".draft.json";
const NEW_LEVELS = ["chronicler", "living", "director", "antagonist", "chaos"];

/** What a start works on: a chat's world, or a world being built in the library. */
function startTarget(fsx, b) {
  if (str(b.chatId)) {
    const chatId = str(b.chatId);
    if (!CHAT_ID.test(chatId)) return { error: ok({ error: "chatId required" }, 400) };
    const chat = readChat(fsx, chatId);
    if (!chat) return { error: ok({ error: "no such chat" }, 404) };
    const { state } = loadState(fsx, chatId);
    return { chat, meta: chat.meta, state, title: str(chat.meta.title), save: (st) => saveState(fsx, st) };
  }
  let id = str(b.worldId);
  let raw = WORLD_ID.test(id) ? readJson(fsx, draftPath(id), null) : null;
  if (!isObj(raw)) {
    // a new world: only a begin may make one
    if (b.begin !== true || b.newWorld !== true) return { error: ok({ error: "chatId or worldId required" }, 400) };
    if (listWorlds(fsx).length + listBuilding(fsx).length >= LIBRARY_MAX) return { error: ok({ error: "the library is full" }, 409) };
    id = "w-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const level = NEW_LEVELS.includes(str(b.level)) ? str(b.level) : "living";
    raw = { name: cut(str(b.name), NAME_LEN) || "World", description: cut(str(b.description), DESC_LEN), at: Date.now(), settings: { level, ...(str(b.profile) ? { profile: str(b.profile) } : {}) } };
  }
  const state = normalizeState(raw, id);
  const head = { name: cut(str(raw.name), NAME_LEN) || "World", description: cut(str(raw.description), DESC_LEN), at: num(raw.at) || Date.now() };
  const cardIds = state.draft ? state.draft.cardIds : arr(b.cardIds).filter((x) => typeof x === "string" && CHAT_ID.test(x));
  return { worldId: id, head, meta: { cardIds }, state, title: head.name, save: (st) => writeJson(fsx, draftPath(id), { ...st, ...head }) };
}

/** Worlds being built without a chat, for the Worlds list. */
export function listBuilding(fsx) {
  let files = [];
  try {
    files = fsx.list(LIBRARY_DIR.slice(0, -1)).filter((f) => f.endsWith(".draft.json"));
  } catch {}
  const out = [];
  for (const f of files) {
    const id = f.slice(0, -".draft.json".length);
    const raw = WORLD_ID.test(id) ? readJson(fsx, LIBRARY_DIR + f, null) : null;
    const d = isObj(raw) ? cleanDraft(raw.draft) : null;
    if (d) out.push({ id, name: cut(str(raw.name), NAME_LEN) || "World", at: num(raw.at), level: cleanSettings(raw.settings).level, done: d.done, total: d.steps.length, error: d.error || null });
  }
  return out.sort((a, b) => b.at - a.at);
}

function startRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const t = startTarget(fsx, b);
  if (t.error) return t.error;
  const { state, meta } = t;
  const chat = t.chat || { meta };
  const cfg = loadConfig(fsx);
  if (b.begin === true) {
    const recipe = recipeOf(fsx, str(b.recipe) || "from-cards");
    if (!recipe) return ok({ error: "no such recipe" }, 404);
    const cardIds = arr(b.cardIds).filter((id) => typeof id === "string" && CHAT_ID.test(id));
    const usesCards = recipe.id === "from-cards" || b.fromCards === true;
    const chunks = usesCards ? chunkSources(startSources(fsx, t.chat ? meta : { cardIds }, cardIds)) : [];
    if (usesCards && !chunks.length) return ok({ error: "the chosen cards have nothing to learn from", code: "no-text" }, 409);
    const profile = profileFor(fsx, state.settings);
    const withDeck = b.deck === true || (b.deck !== false && !!(profile && profile.options && profile.options.deck));
    const steps = startPlan(recipe, chunks, state.settings.level !== "chronicler");
    if (withDeck) steps.push({ deck: true });
    state.draft = cleanDraft({ recipe: recipe.id, cardIds, answers: b.answers, lang: b.lang, steps, done: 0, at: Date.now() });
    t.save(state);
    return ok({ ok: true, ...(t.worldId ? { worldId: t.worldId } : {}), draft: draftView(state.draft) });
  }
  const draft = cleanDraft(state.draft);
  // peek: read a world's draft without running a step (the Worlds tab reopens one being built)
  if (b.peek === true) return ok({ ok: true, draft: draft ? draftView(draft) : null });
  if (!draft) return ok({ error: "no start in progress" }, 409);
  if (draft.done >= draft.steps.length) return ok({ ok: true, draft: draftView(draft) });
  const recipe = recipeOf(fsx, draft.recipe);
  if (!recipe) return ok({ error: "no such recipe" }, 404);
  const step = draft.steps[draft.done];
  const cards = cardNames(fsx, chat.meta);
  const userName = userNameOf(fsx, chat.meta);
  const stash = isObj(req.stash) ? req.stash : {};
  let system;
  let content;
  if (step.fronts || step.deck) {
    const entities = [...state.entities, ...draft.entities];
    if (step.fronts) {
      system = FRONTS_SYSTEM;
      content = frontsInput({ entities, recipe, answers: draft.answers, lang: draft.lang });
    } else {
      system = DECK_SYSTEM;
      content = deckInput({ entities, fronts: [...state.fronts, ...draft.fronts], lang: draft.lang });
    }
  } else {
    const section = recipe.sections.find((s) => s.id === step.section) || recipe.sections[0];
    const sources = step.chunk >= 0 || step.chunk === BRIEF_STEP ? startSources(fsx, chat.meta, draft.cardIds) : [];
    const chunk = step.chunk === BRIEF_STEP ? castBrief(sources) : step.chunk >= 0 ? chunkSources(sources)[step.chunk] || "" : "";
    content = buildInput({ cards, userName, entities: [...state.entities, ...draft.entities], section, chunk, recipe, answers: draft.answers, lang: draft.lang });
    system = buildSystemFor(recipe);
  }
  const built = buildResult(host, "world_build", buildAsk(host, fsx, cfg, chat.meta, system, content), stash);
  if (built.pending) return built.pending;
  let changes = 0;
  if (!built.error) {
    if (step.fronts) {
      const pseudo = { fronts: draft.fronts, nextFront: draft.nextFront, event: null, entities: [] };
      const adds = arr(built.out.fronts).filter((f) => isObj(f) && !state.fronts.some((x) => x.status === "active" && sameName(x.name, str(f.name))))
        .map((f) => ({ ...f, op: "add" })).slice(0, recipe.fronts.count || FRONTS_MAX);
      changes = applyLevel(pseudo, { fronts: adds }, { level: "living", catchingUp: true });
      draft.fronts = pseudo.fronts;
      draft.nextFront = pseudo.nextFront;
    } else if (step.deck) {
      const cardsOut = deckFrom(built.out, DECK_MAX);
      if (cardsOut.length) draft.deck = cardsOut.map((c, i) => ({ id: "e" + (i + 1), text: c.text }));
      changes = draft.deck.length;
    } else {
      const section = recipe.sections.find((s) => s.id === step.section) || recipe.sections[0];
      changes = mergeDraft(draft, state, built.out, section, { cards, userName, now: Date.now() });
    }
    draft.done++;
    delete draft.error;
  } else draft.error = cleanError({ at: Date.now(), ...built.error });
  countBuild(state, built, "start", changes);
  state.draft = draft;
  t.save(state);
  return ok({ ok: !built.error, ...(t.worldId ? { worldId: t.worldId } : {}), ...(built.error ? { error: draft.error.message, code: draft.error.code } : {}), draft: draftView(draft) });
}

export function deckInput({ entities, fronts, lang }) {
  return [
    "World record\n" + (entities.filter((e) => e.status === "active").map(entityLine).join("\n") || "empty"),
    "Fronts" + (arr(fronts).filter((f) => f.status === "active").length ? "\n" + fronts.filter((f) => f.status === "active").map(frontLine).join("\n") : ": none"),
    "Task: write " + DECK_MIN + " to " + DECK_MAX + " events.",
    "Write them in " + (lang || "the language of the record") + ".",
  ].join("\n\n");
}

/** Accept the draft (minus what the player removed) into the world, or throw it away. */
function draftRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  if (!str(b.chatId) && !WORLD_ID.test(str(b.worldId))) return ok({ error: "chatId or worldId required" }, 400);
  const t = startTarget(fsx, b);
  if (t.error) return t.error;
  const { state, chat } = t;
  const chatId = t.chat ? state.chatId : "";
  const draft = cleanDraft(state.draft);
  if (!draft) return ok({ error: "no draft" }, 409);
  if (b.op === "discard") {
    if (t.worldId) {
      try {
        fsx.remove(draftPath(t.worldId));
      } catch {}
      return ok({ ok: true, worlds: listWorlds(fsx).map(worldRow), building: listBuilding(fsx) });
    }
    delete state.draft;
    saveState(fsx, state);
    return ok({ ok: true });
  }
  if (b.op !== "accept") return ok({ error: "op must be accept or discard" }, 400);
  const drop = isObj(b.drop) ? b.drop : {};
  const gone = (list, id) => arr(list).includes(id);
  const now = Date.now();
  let added = 0;
  for (const e of draft.entities) {
    if (gone(drop.entities, e.id) || findEntity(state.entities, { name: e.name }) || state.entities.length >= ENTITIES_MAX) continue;
    state.entities.push({ ...e, id: "n" + state.nextId++, uid: 0, at: now });
    added++;
  }
  for (const f of draft.fronts) {
    if (gone(drop.fronts, f.id) || state.fronts.filter((x) => x.status === "active").length >= FRONTS_MAX) continue;
    if (state.fronts.some((x) => x.status === "active" && sameName(x.name, f.name))) continue;
    state.fronts.push({ ...f, id: "f" + state.nextFront++, at: now });
  }
  const deck = draft.deck.filter((c) => !gone(drop.deck, c.id));
  if (deck.length) {
    const kept = cleanDeck(state.deck);
    let n = nextDeckId(kept);
    state.deck = [...kept, ...deck.map((c) => ({ id: "e" + n++, text: c.text }))].slice(-DECK_MAX * 2);
  }
  state.origin = { kind: draft.recipe === "from-cards" ? "cards" : "recipe", recipe: draft.recipe, cardIds: draft.cardIds, at: now };
  delete state.draft;
  if (t.worldId) {
    // a world built without a chat goes into the library; the draft file goes
    if (!state.entities.length && !state.fronts.length) return ok({ error: "the world would be empty", code: "empty" }, 409);
    writeJson(fsx, LIBRARY_DIR + t.worldId + ".json", cleanWorld({ ...state, ...t.head, at: now, from: null }, t.worldId));
    try {
      fsx.remove(draftPath(t.worldId));
    } catch {}
    return ok({ ok: true, added, id: t.worldId, worlds: listWorlds(fsx).map(worldRow), building: listBuilding(fsx) });
  }
  if (state.entities.length) {
    writeBook(fsx, state, str(chat.meta.title));
    bindBook(fsx, chatId, chat.meta, state.bookId);
  }
  saveState(fsx, state);
  const cfg = loadConfig(fsx);
  return ok({ ok: true, added, ...stateView(state, chat.msgs, cfg, sceneOf(fsx, chatId, chat.msgs), playModel(fsx, cfg, chat.meta), fsx) });
}

/** A new deck for the chat (the old one is used up, or the player wants another). One build call. */
function deckRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state } = loadState(fsx, chatId);
  const cfg = loadConfig(fsx);
  const content = deckInput({ entities: state.entities, fronts: state.fronts, lang: cut(str(b.lang), LANG_MAX) });
  const built = buildResult(host, "world_deck", buildAsk(host, fsx, cfg, chat.meta, DECK_SYSTEM, content), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  const cards = built.error ? [] : deckFrom(built.out, DECK_MAX);
  if (cards.length) state.deck = cards.map((c, i) => ({ id: "e" + (i + 1), text: c.text }));
  countBuild(state, built, "deck", cards.length);
  saveState(fsx, state);
  if (built.error) return ok({ ok: false, error: built.error.message, code: built.error.code });
  return ok({ ok: true, deck: cards.length });
}

// ---------- the library of saved worlds ----------
function cleanWorld(raw, id) {
  if (!isObj(raw)) return null;
  const s = normalizeState({ entities: raw.entities, fronts: raw.fronts, settings: raw.settings }, "x");
  return {
    v: 1, id, name: cut(str(raw.name), NAME_LEN) || "World", description: cut(str(raw.description), DESC_LEN),
    at: num(raw.at) || Date.now(),
    from: isObj(raw.from) ? { chatId: str(raw.from.chatId), title: cut(str(raw.from.title), 120) } : null,
    settings: s.settings, entities: s.entities.map((e) => ({ ...e, uid: 0 })), fronts: s.fronts, deck: cleanDeck(raw.deck),
    ...(FOLDER_ID.test(str(raw.backgroundFolderId)) ? { backgroundFolderId: str(raw.backgroundFolderId) } : {}),
  };
}
const worldRow = (w) => ({ id: w.id, name: w.name, description: w.description, at: w.at, from: w.from, backgroundFolderId: w.backgroundFolderId || null, level: w.settings.level, records: w.entities.filter((e) => e.status === "active").length, fronts: w.fronts.filter((f) => f.status === "active").length, deck: w.deck.length });

export function listWorlds(fsx) {
  let files = [];
  try {
    files = fsx.list(LIBRARY_DIR.slice(0, -1)).filter((f) => f.endsWith(".json"));
  } catch {}
  const out = [];
  for (const f of files) {
    const id = f.slice(0, -5);
    const w = WORLD_ID.test(id) ? cleanWorld(readJson(fsx, LIBRARY_DIR + f, null), id) : null;
    if (w) out.push(w);
  }
  return out.sort((a, b) => b.at - a.at);
}

function libraryRoute(req, host) {
  const fsx = host.fs;
  if (req.method === "GET") return ok({ worlds: listWorlds(fsx).map(worldRow), building: listBuilding(fsx) });
  if (req.method === "DELETE") {
    const id = String((req.query && req.query.id) || "");
    if (!WORLD_ID.test(id)) return ok({ error: "id required" }, 400);
    try {
      fsx.remove(LIBRARY_DIR + id + ".json");
    } catch {}
    return ok({ ok: true, worlds: listWorlds(fsx).map(worldRow) });
  }
  const b = body(req);
  if (req.method === "PUT") {
    const id = str(b.id);
    const w = WORLD_ID.test(id) ? cleanWorld(readJson(fsx, LIBRARY_DIR + id + ".json", null), id) : null;
    if (!w) return ok({ error: "no such world" }, 404);
    if (b.name !== undefined) w.name = cut(str(b.name), NAME_LEN) || w.name;
    if (b.description !== undefined) w.description = cut(str(b.description), DESC_LEN);
    if (b.backgroundFolderId !== undefined) {
      if (FOLDER_ID.test(str(b.backgroundFolderId))) w.backgroundFolderId = str(b.backgroundFolderId);
      else delete w.backgroundFolderId;
    }
    writeJson(fsx, LIBRARY_DIR + id + ".json", w);
    return ok({ ok: true, worlds: listWorlds(fsx).map(worldRow) });
  }
  // POST: save the chat's world as it stands
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
  if (!isObj(meta)) return ok({ error: "no such chat" }, 404);
  const { state } = loadState(fsx, chatId);
  if (!state.entities.length && !state.fronts.length) return ok({ error: "this chat's world is empty" }, 409);
  if (listWorlds(fsx).length >= LIBRARY_MAX) return ok({ error: "the library is full" }, 409);
  const id = "w-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const w = cleanWorld({ ...state, deck: state.deck, name: str(b.name) || str(meta.title), description: b.description, at: Date.now(), from: { chatId, title: str(meta.title) } }, id);
  writeJson(fsx, LIBRARY_DIR + id + ".json", w);
  return ok({ ok: true, id, worlds: listWorlds(fsx).map(worldRow) });
}

/**
 * A world into another chat (user, 2026-10-18: records and fronts as they stand, clocks included): from a
 * chat or from the library. The run fields start fresh; the settings come along (off becomes chronicler).
 * A chat whose world already has records is refused unless `replace`.
 */
function carryRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const toChatId = String(b.toChatId || "");
  if (!CHAT_ID.test(toChatId)) return ok({ error: "toChatId required" }, 400);
  const chat = readChat(fsx, toChatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  let src = null;
  let origin = null;
  if (WORLD_ID.test(str(b.worldId))) {
    src = cleanWorld(readJson(fsx, LIBRARY_DIR + str(b.worldId) + ".json", null), str(b.worldId));
    origin = src && { kind: "library", worldId: src.id, name: src.name };
  } else if (CHAT_ID.test(str(b.fromChatId)) && str(b.fromChatId) !== toChatId) {
    const { state: from, existed } = loadState(fsx, str(b.fromChatId));
    src = existed ? { ...from, deck: cleanDeck(from.deck) } : null;
    origin = src && { kind: "chat", chatId: str(b.fromChatId), title: str(readJson(fsx, "chats/" + str(b.fromChatId) + ".meta.json", {}).title) };
  }
  if (!src) return ok({ error: "no such world" }, 404);
  const { state: old } = loadState(fsx, toChatId);
  if (old.entities.length && b.replace !== true) return ok({ error: "this chat already has a world", code: "has-world" }, 409);
  const state = emptyState(toChatId);
  state.settings = { ...cleanSettings(src.settings), ...(src.settings && src.settings.level === "off" ? { level: "chronicler" } : {}) };
  state.entities = src.entities.map((e) => ({ ...e, uid: 0 }));
  state.fronts = src.fronts;
  state.deck = cleanDeck(src.deck);
  const s = normalizeState(state, toChatId);
  s.deck = state.deck;
  s.origin = { ...origin, at: Date.now() };
  // the world's backgrounds come along (user, 2026-10-19); switching by scene follows the World default
  if (FOLDER_ID.test(str(src.backgroundFolderId))) s.backgroundFolderId = str(src.backgroundFolderId);
  let meta = chat.meta;
  if (s.backgroundFolderId && !isObj(meta.autoBackground)) {
    meta = { ...meta, autoBackground: { on: loadConfig(fsx).autoBackground, folderId: s.backgroundFolderId } };
    writeJson(fsx, "chats/" + toChatId + ".meta.json", meta);
  }
  if (s.entities.length) {
    writeBook(fsx, s, str(chat.meta.title));
    bindBook(fsx, toChatId, meta, s.bookId);
  }
  saveState(fsx, s);
  const cfg = loadConfig(fsx);
  return ok({ ok: true, ...stateView(s, chat.msgs, cfg, sceneOf(fsx, toChatId, chat.msgs), playModel(fsx, cfg, chat.meta), fsx) });
}

// ---------- the chat's own scenario and first message ----------
const cleanScenario = (v) => {
  const text = isObj(v) ? cut(str(v.text), SCENARIO_MAX) : "";
  return text ? { text, mode: v.mode === "append" ? "append" : "replace" } : null;
};

/** The DM drafts the chat's scenario and first message from its world (or a library world) and its card. */
function openingRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const world = WORLD_ID.test(str(b.worldId)) ? cleanWorld(readJson(fsx, LIBRARY_DIR + str(b.worldId) + ".json", null), str(b.worldId)) : loadState(fsx, chatId).state;
  if (!world || !world.entities.length) return ok({ error: "no world to build from" }, 409);
  const cfg = loadConfig(fsx);
  const cardLines = [];
  for (const id of memberIds(fsx, chat.meta)) {
    const card = cardOf(fsx, id);
    if (!card) continue;
    cardLines.push("[" + (str(card.name) || id) + "]");
    if (str(card.description)) cardLines.push("Who: " + cutMiddle(str(card.description), 1500));
    if (str(card.scenario)) cardLines.push("Card's scenario: " + cutMiddle(str(card.scenario), 1000));
    if (str(card.first_mes)) cardLines.push("Card's first message (style only): " + cutMiddle(str(card.first_mes), 1500));
  }
  const content = [
    "The user's character: " + (userNameOf(fsx, chat.meta) || "the user") + " ({{user}}).",
    "Cards\n" + (cardLines.join("\n") || "none"),
    "World record\n" + world.entities.filter((e) => e.status === "active").map(entityLine).join("\n"),
    ...(world.fronts.filter((f) => f.status === "active").length ? ["Fronts (what moves off screen; do not reveal their plans)\n" + world.fronts.filter((f) => f.status === "active").map(frontLine).join("\n")] : []),
    ...(str(b.wish) ? ["What the player wants from this start: " + cut(str(b.wish), ANSWER_MAX)] : []),
    "Write both in " + (cut(str(b.lang), LANG_MAX) || "the language of the card's first message") + ".",
  ].join("\n\n");
  const built = buildResult(host, "world_opening", buildAsk(host, fsx, cfg, chat.meta, OPENING_SYSTEM, content), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  if (built.error) return ok({ ok: false, error: built.error.message, code: built.error.code });
  const scenario = cut(str(built.out.scenario), SCENARIO_MAX);
  const opening = cut(str(built.out.opening), OPENING_MAX);
  if (!scenario && !opening) return ok({ ok: false, error: "The build model wrote neither a scenario nor a first message.", code: "empty" });
  return ok({ ok: true, scenario, opening, model: built.run.model, usage: built.usage });
}

/**
 * Set the chat's own scenario (meta.worldScenario; null = the card's again) and, before the player's first
 * message, its first message: the new text becomes the greeting's first swipe, the card's greetings stay
 * behind it as swipes.
 */
function overrideRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const opening = cut(str(b.opening), OPENING_MAX);
  if (opening && chat.msgs.some((m) => m.role === "user")) return ok({ error: "the chat has already started", code: "started" }, 409);
  const meta = { ...chat.meta };
  if (b.scenario !== undefined) {
    const sc = cleanScenario(b.scenario);
    if (sc) meta.worldScenario = sc;
    else delete meta.worldScenario;
  }
  let msgs = chat.msgs;
  if (opening) {
    const i = msgs.findIndex((m) => m.greeting === true && m.role !== "system");
    const userName = userNameOf(fsx, meta) || "User";
    const text = opening.split("{{user}}").join(userName);
    if (i >= 0) {
      const g = msgs[i];
      const name = str(g.name);
      const shown = text.split("{{char}}").join(name);
      const old = arr(g.swipes).filter((t) => typeof t === "string" && t !== shown);
      msgs = msgs.map((m, k) => (k === i ? { ...m, text: shown, swipes: [shown, ...old], swipe: 0, ...(isObj(m.extra) && Array.isArray(m.extra.swipeMeta) ? { extra: { ...m.extra, swipeMeta: [null, ...m.extra.swipeMeta] } } : {}) } : m));
    } else {
      const card = meta.characterId ? cardOf(fsx, meta.characterId) : null;
      const name = card ? str(card.name) : "Narrator";
      const shown = text.split("{{char}}").join(name);
      const id = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      msgs = [card ? { id, name, charId: meta.characterId, role: "char", text: shown, at: Date.now(), swipes: [shown], swipe: 0, greeting: true } : { id, name, charId: null, role: "system", text: shown, at: Date.now(), swipes: [shown], swipe: 0, greeting: true }, ...msgs];
    }
    fsx.write("chats/" + chatId + ".jsonl", msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
  }
  meta.updatedAt = Date.now();
  writeJson(fsx, "chats/" + chatId + ".meta.json", meta);
  return ok({ ok: true, scenario: meta.worldScenario || null, opening: !!opening });
}

// ---------- backgrounds (user, 2026-10-19) ----------
// Pre-generated sets, no live per-scene generation. The build model plans the set (an English file name,
// tags and an image prompt per place); the app draws each image with its image model, stores it as WebP
// in the asset store and files it in the world's folder of the Backgrounds library. A vision model names
// the player's own images the same way. The Dashboard sensor picks among them by scene (its own switch).
const FILE_NAME = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const FILE_MAX = 60;
const TAGS_MAX = 6;
const PLACES_MAX = 30;
const VARIANTS_MAX = 3;
const PROMPT_MAX = 1200;

export const BACKGROUNDS_SYSTEM = [
  "You plan background images for the places of a roleplay story. Each image is a wide scene background the story's chat shows behind the text.",
  "For each place and variant:",
  "- file: a short English name for the image file, 1 to 4 words in snake_case (a-z, 0-9, _), naming the place: tavern, tavern_kitchen, red_tower. A second variant of a place ends in _2, a third in _3.",
  "- tags: 2 to 6 English words for kind, time, weather and mood (inn, night, rain, crowded), so a scene can be matched to it.",
  "- prompt: an English prompt for an image model: the place, its light, time and mood, in the style direction given; a wide establishing view with no people unless the place needs a crowd; no text, no captions. Variants differ in time of day, weather or angle.",
  "Output: one JSON object and nothing else, no code fences:",
  '{"images":[{"place":"the place\'s name as given","file":"...","tags":["..."],"prompt":"..."}]}',
].join("\n");

export const NAME_IMAGE_SYSTEM = [
  "You name a background image of a roleplay story so a scene can be matched to it.",
  "- file: a short English name, 1 to 4 words in snake_case (a-z, 0-9, _), naming the place shown: tavern, forest_path, throne_room.",
  "- tags: 2 to 6 English words for kind, time, weather and mood (inn, night, rain, crowded).",
  "Output: one JSON object and nothing else, no code fences:",
  '{"file":"...","tags":["..."]}',
].join("\n");

export const cleanFile = (v) => {
  const f = str(v).toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return FILE_NAME.test(f) ? cut(f, FILE_MAX).replace(/_$/, "") : "";
};
export const cleanTags = (v) => [...new Set(arr(v).map((t) => cleanFile(t).replace(/_/g, " ")).filter(Boolean))].slice(0, TAGS_MAX);

/** The planned set: known places only, file names unique (a clash gets _2, _3), up to `variants` per place. */
export function cleanPlan(out, places, variants, taken = []) {
  const used = new Set(taken.map((t) => cleanFile(t)).filter(Boolean));
  const per = new Map();
  const images = [];
  for (const raw of arr(isObj(out) ? out.images : null)) {
    if (!isObj(raw)) continue;
    const place = places.find((p) => sameName(p.name, str(raw.place))) || (places.length === 1 ? places[0] : null);
    if (!place) continue;
    const n = per.get(place.name) || 0;
    if (n >= variants) continue;
    const prompt = cut(str(raw.prompt), PROMPT_MAX);
    let file = cleanFile(raw.file) || cleanFile(place.name) || "place";
    if (!prompt) continue;
    for (let i = 2; used.has(file); i++) file = cut(file.replace(/_\d+$/, ""), FILE_MAX - 3) + "_" + i;
    used.add(file);
    per.set(place.name, n + 1);
    images.push({ place: place.name, file, tags: cleanTags(raw.tags), prompt });
  }
  return images;
}

export function backgroundsInput({ places, direction, variants, lang }) {
  return [
    "Style direction for the whole set: " + (direction || "painterly, atmospheric, cinematic light") + ".",
    "Variants per place: " + variants + ".",
    "Places\n" + places.map((p) => "- " + p.name + (p.text ? ": " + cutMiddle(p.text, 400) : "")).join("\n"),
    ...(lang ? ["The place names are in " + lang + "; the file names, tags and prompts are always English."] : []),
  ].join("\n\n");
}

/** The world's places: its active place records, for the set's list (the player adds their own). */
/**
 * Entries of the chat's card and group books, offered as places to pick (user, 2026-10-19: places should come
 * semi-automatically from the card and its lorebook). No model call: the player ticks the ones that are places.
 */
export function bookChoices(fsx, meta) {
  if (!isObj(meta)) return [];
  const books = [];
  const add = (list) => {
    for (const id of list) if (!books.includes(id) && id !== str(meta.worldBookId)) books.push(id);
  };
  for (const id of memberIds(fsx, meta)) {
    const card = cardOf(fsx, id);
    if (card) add(booksOf(card));
  }
  if (meta.groupId) {
    const group = readJson(fsx, "groups/" + meta.groupId + ".json", null);
    if (isObj(group)) add(booksOf(group));
  }
  const out = [];
  for (const id of books) {
    const book = readJson(fsx, "lorebooks/" + id + ".json", null);
    if (!isObj(book) || str(book.ownerChatId)) continue;
    for (const e of arr(book.entries)) {
      if (!isObj(e) || e.enabled === false) continue;
      const name = cut(str(e.title) || arr(e.keys).map(str).find(Boolean) || "", NAME_MAX);
      if (name && !out.some((x) => sameName(x.name, name))) out.push({ name, text: cut(str(e.content), 300), book: str(book.name) || id });
      if (out.length >= BOOK_CHOICES_MAX) return out;
    }
  }
  return out;
}
const BOOK_CHOICES_MAX = 60;

export const FIND_PLACES_SYSTEM = [
  "You read the cards and the world record of a roleplay story and list the places where its scenes can happen: rooms, houses, streets, towns, landscapes. Only places the text names or plainly describes; never people, groups, things or events.",
  "- For each: a short name as the text calls it, and one plain sentence of what it looks like.",
  "- Only the JSON keys are English; names and text stay in the language of the source.",
  "Output: one JSON object and nothing else, no code fences:",
  '{"places":[{"name":"...","text":"..."}]}',
].join("\n");

/** The cards' text (the first chunk) and the world's records, for finding places. */
export function findPlacesInput({ chunk, entities }) {
  return [
    chunk ? "Cards\n" + chunk : "Cards: none",
    "World record\n" + (arr(entities).filter((e) => e.status === "active").map(entityLine).join("\n") || "empty"),
    "Task: list up to " + PLACES_MAX + " places.",
  ].join("\n\n");
}

/** POST {chatId|worldId}: the build model finds the places named in the cards and the world (two-phase). */
function findPlacesRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const worldId = str(b.worldId);
  const chatId = str(b.chatId);
  const lib = WORLD_ID.test(worldId);
  if (!lib && !CHAT_ID.test(chatId)) return ok({ error: "chatId or worldId required" }, 400);
  const world = lib ? cleanWorld(readJson(fsx, LIBRARY_DIR + worldId + ".json", null), worldId) : loadState(fsx, chatId).state;
  if (!world) return ok({ error: "no such world" }, 404);
  const meta = lib ? null : readJson(fsx, "chats/" + chatId + ".meta.json", null);
  const chunk = isObj(meta) ? chunkSources(startSources(fsx, meta, undefined))[0] || "" : "";
  if (!chunk && !world.entities.length) return ok({ error: "nothing to read: no cards and no records", code: "no-text" }, 409);
  const cfg = loadConfig(fsx);
  const built = buildResult(host, "world_places", buildAsk(host, fsx, cfg, isObj(meta) ? meta : null, FIND_PLACES_SYSTEM, findPlacesInput({ chunk, entities: world.entities })), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  if (built.error) return ok({ ok: false, error: built.error.message, code: built.error.code });
  const places = [];
  for (const p of arr(built.out.places)) {
    const name = isObj(p) ? cut(str(p.name), NAME_MAX) : "";
    if (name && !places.some((x) => sameName(x.name, name))) places.push({ name, text: cut(str(p.text), TEXT_MAX) });
    if (places.length >= PLACES_MAX) break;
  }
  return ok({ ok: true, places, model: built.run.model, usage: built.usage });
}

function worldPlaces(fsx, b) {
  const w = WORLD_ID.test(str(b.worldId)) ? cleanWorld(readJson(fsx, LIBRARY_DIR + str(b.worldId) + ".json", null), str(b.worldId)) : CHAT_ID.test(str(b.chatId)) ? loadState(fsx, str(b.chatId)).state : null;
  return w ? w.entities.filter((e) => e.status === "active" && e.kind === "place").map((e) => ({ name: e.name, text: e.text })) : [];
}

/**
 * GET: the world's places and its folder. POST {chatId|worldId, places, direction?, variants?, taken?}: the build
 * model plans the set (two-phase). PUT {chatId|worldId, folderId|null}: link the world to a folder.
 */
function backgroundsRoute(req, host) {
  const fsx = host.fs;
  const q = req.method === "GET" || req.method === "DELETE" ? req.query || {} : body(req);
  const worldId = str(q.worldId);
  const chatId = str(q.chatId);
  if (!WORLD_ID.test(worldId) && !CHAT_ID.test(chatId)) return ok({ error: "chatId or worldId required" }, 400);
  const lib = WORLD_ID.test(worldId);
  const world = lib ? cleanWorld(readJson(fsx, LIBRARY_DIR + worldId + ".json", null), worldId) : loadState(fsx, chatId).state;
  if (!world) return ok({ error: "no such world" }, 404);
  if (req.method === "GET") {
    const meta = lib ? null : readJson(fsx, "chats/" + chatId + ".meta.json", null);
    return ok({ places: worldPlaces(fsx, q), fromBooks: bookChoices(fsx, meta), folderId: world.backgroundFolderId || null });
  }
  if (req.method === "PUT") {
    const folder = FOLDER_ID.test(str(q.folderId)) ? str(q.folderId) : null;
    if (folder) world.backgroundFolderId = folder;
    else delete world.backgroundFolderId;
    if (lib) writeJson(fsx, LIBRARY_DIR + worldId + ".json", world);
    else {
      const { state, existed } = loadState(fsx, chatId);
      if (!existed && !folder) return ok({ ok: true, folderId: null });
      if (folder) state.backgroundFolderId = folder;
      else delete state.backgroundFolderId;
      saveState(fsx, state);
    }
    return ok({ ok: true, folderId: folder });
  }
  const places = arr(q.places).map((p) => (isObj(p) ? { name: cut(str(p.name), NAME_MAX), text: cut(str(p.text), TEXT_MAX) } : { name: cut(str(p), NAME_MAX), text: "" }))
    .filter((p) => p.name).slice(0, PLACES_MAX);
  if (!places.length) return ok({ error: "no places" }, 400);
  const variants = clamp(Math.round(num(q.variants)) || 1, 1, VARIANTS_MAX);
  const cfg = loadConfig(fsx);
  const meta = CHAT_ID.test(chatId) ? readJson(fsx, "chats/" + chatId + ".meta.json", null) : null;
  const content = backgroundsInput({ places, direction: cut(str(q.direction), 600), variants, lang: cut(str(q.lang), LANG_MAX) });
  const built = buildResult(host, "world_backgrounds", buildAsk(host, fsx, cfg, isObj(meta) ? meta : null, BACKGROUNDS_SYSTEM, content), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  if (built.error) return ok({ ok: false, error: built.error.message, code: built.error.code });
  const images = cleanPlan(built.out, places, variants, arr(q.taken).map(str));
  if (!images.length) return ok({ ok: false, error: "The build model planned no image for these places.", code: "empty" });
  return ok({ ok: true, images, imageModel: cfg.imageModel, model: built.run.model, usage: built.usage });
}

/** A vision model names one background: {image: {data, mimeType}, model?, hint?} -> {file, tags}. */
function nameImageRoute(req, host) {
  const b = body(req);
  const img = isObj(b.image) && str(b.image.data) && /^image\//.test(str(b.image.mimeType)) ? { data: String(b.image.data), mimeType: str(b.image.mimeType) } : null;
  if (!img) return ok({ error: "image required" }, 400);
  const r = host.llm.results.world_name;
  if (!r) {
    const model = MODEL_REF.test(str(b.model)) ? str(b.model) : "";
    host.llm.request("world_name", {
      // no model named: the engine's Vision model (Settings)
      ...(model ? { model } : {}),
      systemPrompt: NAME_IMAGE_SYSTEM,
      messages: [{ role: "user", content: "Name this background." + (str(b.hint) ? " Its current name: " + cut(str(b.hint), 80) + "." : "") }],
      images: [img],
      presetParams: { temperature: 0.2, max_tokens: 400 },
    });
    return { __llmPending: true };
  }
  const limit = limitOf(r);
  if (r.error || !str(r.text)) return ok({ ok: false, ...classifyError(r, limit) });
  const out = firstJson(r.text);
  const file = out ? cleanFile(out.file) : "";
  if (!file) return ok({ ok: false, code: "not-json", message: "The vision model did not name the image.", details: cut(str(r.text), 600) });
  return ok({ ok: true, file, tags: cleanTags(out.tags), model: str(r.model) });
}

// ---------- routes ----------
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

function stateView(state, msgs, cfg, scene, play, fsx) {
  const unread = unreadMessages(msgs, state.lastKey);
  return {
    settings: state.settings,
    // the dice in force (the chat's own over the profile's), for the sheet
    dice: state.settings.level === "off" || !fsx ? null : diceOf(profileFor(fsx, state.settings), state.settings),
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
    // Start: a draft in progress, how many deck cards are left (not their text), where the world came from
    draft: draftView(state.draft || null),
    deck: arr(state.deck).length,
    origin: state.origin || null,
    backgroundFolderId: state.backgroundFolderId || null,
  };
}

function stateRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(host.fs, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const cfg = loadConfig(host.fs);
  return ok(stateView(loadState(host.fs, chatId).state, chat.msgs, cfg, sceneOf(host.fs, chatId, chat.msgs), playModel(host.fs, cfg, chat.meta), host.fs));
}

/** "Look at the world": the records only, newest first; the DM's plans (fronts, the event) stay its own. */
function peekRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const { state } = loadState(host.fs, chatId);
  const records = state.entities
    .map((e) => ({ id: e.id, kind: e.kind, name: e.name, aliases: e.aliases, text: e.text, status: e.status, at: e.at ?? 0, ...(e.by ? { by: e.by } : {}), ...(e.pinned ? { pinned: true } : {}) }))
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
  for (const k of ["level", "everyN", "stagnation", "onTransition", "insert", "dice", "diceStat", "diceChance"]) if (b[k] !== undefined) patch[k] = b[k];
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
  return ok(stateView(state, chat.msgs, cfg, sceneOf(host.fs, chatId, chat.msgs), playModel(host.fs, cfg, chat.meta), host.fs));
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
  for (const k of ["model", "buildModel", "maxTokens", "imageModel", "autoBackground"]) if (b[k] !== undefined) patch[k] = b[k];
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
        deck: options.deck ? state.deck || [] : null,
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
  let moved = level !== "chronicler" ? applyLevel(state, out, { level, direction: scene && scene.direction, now: Date.now(), catchingUp, codeClocks, useDeck: !!options.deck }) : 0;
  if (level !== "chronicler" && codeClocks) moved += tickClocks(state, take.msgs.filter(isReply).length, options.clockEvery, Date.now());
  if (scene && scene.direction === "transition") state.transitionKey = scene.key;
  state.lastKey = str(stash.upTo) || upTo;
  state.lastRunAt = Date.now();
  if (str(r.model)) state.lastModel = str(r.model);
  delete state.lastError;
  const behind = catchingUp ? unreadMessages(chat.msgs, state.lastKey).length : 0;
  state.log = [...state.log, { ...run, key: state.lastKey, changes, fronts: moved, summary: shorten(str(out.summary), 600), ...(behind ? { behind } : {}) }].slice(-LOG_MAX);
  count(usage);
  if (changes || state.entities.length) {
    writeBook(fsx, state, str(chat.meta.title));
    bindBook(fsx, chatId, chat.meta, state.bookId);
  }
  saveState(fsx, state);
  return ok({ ok: true, changes, ...stateView(state, chat.msgs, cfg, scene, play, fsx) });
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
    state.entities.push({ id: "n" + state.nextId++, kind: KINDS.includes(r.kind) ? r.kind : "fact", name, aliases: cleanAliases(r.aliases, name), text, status: "active", uid: 0, at: now, by: "player", ...(r.pinned === true ? { pinned: true } : {}) });
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
      if (r.pinned === true) e.pinned = true;
      else if (r.pinned === false) delete e.pinned;
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

export const KEYS_SYSTEM = [
  "You add lorebook keys to the records of a roleplay world. A record comes into the story only when one of its keys appears in the newest messages, so each needs the words the story will really use.",
  "- For each record: 2 to 5 short words or phrases: a short name, how the characters call it, its main word (for \"IKEA dresser\": \"dresser\"; for \"Ava's house\": \"Ava's place\", \"Ava's home\").",
  "- In the language and script of the record. Never a word that comes up in every scene (room, door, day, man).",
  "Output: one JSON object and nothing else, no code fences:",
  '{"keys":[{"id":"n3","keys":["..."]}]}',
].join("\n");

/** POST {chatId}: the build model writes keys for the living records that have none (one call). */
function keysRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state } = loadState(fsx, chatId);
  const bare = state.entities.filter((e) => e.status === "active" && !e.aliases.length && !e.pinned);
  if (!bare.length) return ok({ ok: true, changed: 0 });
  const cfg = loadConfig(fsx);
  const content = "Records\n" + bare.slice(0, 60).map(entityLine).join("\n");
  const built = buildResult(host, "world_keys", buildAsk(host, fsx, cfg, chat.meta, KEYS_SYSTEM, content), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  if (built.error) return ok({ ok: false, error: built.error.message, code: built.error.code });
  let changed = 0;
  for (const k of arr(built.out.keys)) {
    const e = isObj(k) ? bare.find((x) => x.id === str(k.id)) : null;
    if (!e) continue;
    const keys = cleanAliases(k.keys, e.name);
    if (keys.length) {
      e.aliases = keys;
      changed++;
    }
  }
  countBuild(state, built, "keys", changed);
  if (changed) {
    writeBook(fsx, state, str(chat.meta.title));
    bindBook(fsx, chatId, chat.meta, state.bookId);
  }
  saveState(fsx, state);
  return ok({ ok: true, changed });
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
  if (path === "/world/dice" && req.method === "GET") return diceRoute(req, host);
  if (path === "/world/test" && req.method === "POST") return testRoute(req, host);
  if (path === "/world/profiles" && ["GET", "PUT", "DELETE"].includes(req.method)) return profilesRoute(req, host);
  if (path === "/world/records" && req.method === "PUT") return recordsRoute(req, host);
  if (path === "/world/recipes" && req.method === "GET") return ok({ recipes: listRecipes(host.fs) });
  if (path === "/world/start" && req.method === "POST") return startRoute(req, host);
  if (path === "/world/draft" && req.method === "PUT") return draftRoute(req, host);
  if (path === "/world/deck" && req.method === "POST") return deckRoute(req, host);
  if (path === "/world/library" && ["GET", "POST", "PUT", "DELETE"].includes(req.method)) return libraryRoute(req, host);
  if (path === "/world/carry" && req.method === "POST") return carryRoute(req, host);
  if (path === "/world/opening" && req.method === "POST") return openingRoute(req, host);
  if (path === "/world/override" && req.method === "PUT") return overrideRoute(req, host);
  if (path === "/world/backgrounds" && ["GET", "POST", "PUT"].includes(req.method)) return backgroundsRoute(req, host);
  if (path === "/world/backgrounds/name" && req.method === "POST") return nameImageRoute(req, host);
  if (path === "/world/backgrounds/places" && req.method === "POST") return findPlacesRoute(req, host);
  if (path === "/world/records/keys" && req.method === "POST") return keysRoute(req, host);
  return ok({ error: "not found" }, 404);
}
