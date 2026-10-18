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
 *  GET  /world/config                 the DM model and reply limit (all chats)
 *  PUT  /world/config {model?, maxTokens?}
 *  POST /world/update {chatId, auto?}  a DM run (two-phase); auto = the app's call after a reply,
 *                                      which runs only when a trigger is due; without auto it always runs
 *                                      (except in an explicit scene)
 *
 * Hook: llmRequest adds the pending event to the last user message of a reply request.
 *
 * Files (fs root = the app's data/):
 *  world/state/<chatId>.json   the chat's world state (shape: normalizeState)
 *  world/config.json           only what differs from the defaults
 *  lorebooks/world-<chatId>.json  the chat's world book: ownerChatId = the chat, so the app's
 *                              library never lists it; the chat's meta names it as worldBookId,
 *                              and the engine plugin scans it in that chat only
 */

const STATE_DIR = "world/state/";
const CONFIG_FILE = "world/config.json";
const CHAT_ID = /^[A-Za-z0-9_-]{1,120}$/;
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

export const DEFAULT_SETTINGS = { level: "off", everyN: 5, stagnation: 6, onTransition: true, insert: true };
export const DEFAULT_CONFIG = { model: "", maxTokens: 1500 };

// what a run reads and writes, kept small for small context windows
const NEW_TEXT_MAX = 8000;
const MSG_MAX = 2500;
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
  const n = Number(c.maxTokens);
  return {
    model: MODEL_REF.test(model) ? model : "",
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
  out.log = arr(s.log).filter(isObj).slice(-LOG_MAX);
  if (Number.isFinite(s.lastRunAt)) out.lastRunAt = s.lastRunAt;
  if (str(s.lastModel)) out.lastModel = str(s.lastModel);
  if (isObj(s.lastError) && str(s.lastError.message)) out.lastError = { at: Number(s.lastError.at) || 0, message: cut(str(s.lastError.message), 400) };
  return out;
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
export const CHRONICLER_SYSTEM = [
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
  "Output: one JSON object and nothing else, no code fences:",
  '{"add":[{"kind":"person|place|group|thing|fact","name":"...","aliases":["..."],"text":"..."}],"update":[{"id":"n3","text":"...","aliases":["..."]}],"retire":[{"id":"n3","text":"..."}],"summary":"one short line: what changed in the world"}',
].join("\n");

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

/** The system prompt of a run at this level. */
export function systemFor(level) {
  if (!LEVEL_RULES[level]) return CHRONICLER_SYSTEM;
  return [CHRONICLER_SYSTEM, "", ...LEVEL_RULES[level], ...LEVEL_SHARED, "Output at this level, the same object with more keys:", LEVEL_SHAPE].join("\n");
}

const entityLine = (e) => e.id + " · " + e.kind + " · " + e.name + (e.aliases.length ? " (" + e.aliases.join(", ") + ")" : "") + ": " + e.text;
const cutMiddle = (s, max) => (s.length <= max ? s : s.slice(0, Math.floor((max - 3) / 2)) + " … " + s.slice(s.length - Math.floor((max - 3) / 2)));

const frontLine = (f) => f.id + " · " + f.name + " · clock " + f.clock + "/" + f.size + (f.goal ? ": " + f.goal : "");

/** The user message of a DM run. extra (levels above the chronicler): fronts, the pending event, the scene, the Dashboard's threads. */
export function dmInput({ cards, userName, entities, msgs, level, fronts, event, direction, threads }) {
  const active = entities.filter((e) => e.status === "active");
  const past = entities.filter((e) => e.status === "past");
  const lines = msgs
    .filter((m) => str(m.text))
    .map((m) => "[" + (m.role === "user" ? userName || "user" : str(m.name) || "narrator") + "] " + cutMiddle(String(m.text).trim(), MSG_MAX));
  let story = lines.join("\n");
  if (story.length > NEW_TEXT_MAX) story = "…" + story.slice(-NEW_TEXT_MAX);
  return [
    "Characters with their own cards (do not record): " + (cards.length ? cards.join(", ") : "none") + ".",
    "The user's character (do not record): " + (userName || "the user") + ".",
    "World record so far" + (active.length ? "\n" + active.map(entityLine).join("\n") : ": empty."),
    ...(past.length ? ["Retired (finished; do not change): " + past.map((e) => e.id + " " + e.name).join(", ") + "."] : []),
    ...(level && LEVEL_RULES[level] ? levelInput({ fronts, event, direction, threads }) : []),
    "New part of the story\n" + story,
  ].join("\n\n");
}

function levelInput({ fronts, event, direction, threads }) {
  const active = arr(fronts).filter((f) => f.status === "active");
  const out = ["Fronts" + (active.length ? "\n" + active.map(frontLine).join("\n") : ": none yet.")];
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
function callParams(fsx, cfg, meta) {
  const preset = chatPreset(fsx, meta);
  const reasoning = preset && typeof preset.reasoning === "string" && preset.reasoning !== "off" ? preset.reasoning : "";
  const budget = reasoning && typeof preset.thinkingBudget === "number" && preset.thinkingBudget > 0 ? Math.round(preset.thinkingBudget) : 0;
  const tags = preset && isObj(preset.reasoningTags) && str(preset.reasoningTags.open) && str(preset.reasoningTags.close) ? { open: preset.reasoningTags.open, close: preset.reasoningTags.close } : null;
  return {
    ...(reasoning ? { reasoning } : {}),
    ...(budget ? { thinkingBudget: budget } : {}),
    ...(tags ? { reasoningTags: tags } : {}),
    presetParams: { temperature: 0.3, max_tokens: cfg.maxTokens + budget },
  };
}

/** Who plays the DM: its own model, else the chat's, else the app's default. */
export function dmModel(fsx, cfg, meta) {
  const settings = readJson(fsx, "settings.json", null);
  return str(cfg.model) || str(meta && meta.model) || (isObj(settings) ? str(settings.model) : "");
}

// ---------- reading the DM's reply ----------
/** The first balanced {...} of the text; null when there is none. */
function firstObject(s) {
  const start = s.indexOf("{");
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

export function parseReply(text) {
  let s = String(text || "").replace(/^\s*<(think|thinking|reasoning)>[\s\S]*?<\/\1>/i, "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i.exec(s);
  if (fence) s = fence[1];
  const body = firstObject(s);
  if (!body) return null;
  try {
    const v = JSON.parse(body.replace(/,\s*([}\]])/g, "$1"));
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
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
 * The levels above the chronicler: fronts, the event and the direction (in place). The pending
 * event: delivered drops it; missed once is sent again; missed twice is dropped. A new event
 * waits while the old one is pending. No event in an explicit scene, none in combat below
 * antagonist. Returns how many fronts changed.
 */
export function applyLevel(state, out, { level, direction, now }) {
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
  if (text && !quiet && (!state.event || state.event.sent === 0)) {
    state.event = { text, hard: HARD_LEVELS.includes(level), sent: 0, retried: false, at };
  }
  return changes;
}

// ---------- the insert: the event rides one reply ----------
// the engine plugin's ops: a new reply (send, next) or a new swipe of one; never continue or impersonate
const OPS_WITH_EVENT = ["send", "next", "swipe"];

/** The text the writing model gets for an event, or null. */
export function eventInsert(event) {
  if (!event || !str(event.text)) return null;
  if (!event.hard) return "[World news, may come up in this reply if it fits: " + event.text + " If it fits, let it reach the characters as talk, a rumour or a message. Never mention where this note came from.]";
  return [
    "[WORLD EVENT: must happen in this reply]",
    "What: " + event.text,
    "How: bring it into this reply as part of the scene; the characters react in character.",
    "Do not: resolve it in this reply, explain where it came from, or mention a game master.",
  ].join("\n");
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
    const text = eventInsert(state.event);
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
function body(req) {
  return isObj(req.body) ? req.body : {};
}

function stateView(state, msgs, cfg, scene) {
  return {
    settings: state.settings,
    ready: READY_LEVELS,
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
  };
}

function stateRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(host.fs, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  return ok(stateView(loadState(host.fs, chatId).state, chat.msgs, loadConfig(host.fs), sceneOf(host.fs, chatId, chat.msgs)));
}

/** "Look at the world": the records only, newest first; the DM's plans (fronts, the event) stay its own. */
function peekRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const { state } = loadState(host.fs, chatId);
  const records = state.entities
    .map((e) => ({ id: e.id, kind: e.kind, name: e.name, aliases: e.aliases, text: e.text, status: e.status, at: e.at ?? 0 }))
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
  const next = cleanSettings({ ...state.settings, ...patch });
  // switched on for the first time: the DM starts reading from now, not from the first message
  if (!existed && next.level !== "off" && chat.msgs.length && b.fromStart !== true) {
    const unread = chat.msgs.slice(-Math.max(2, next.everyN * 2));
    const before = chat.msgs[chat.msgs.length - unread.length - 1];
    state.lastKey = before ? keyOf(before) : null;
  }
  // a level with no events drops a waiting one
  if ((next.level === "off" || next.level === "chronicler") && state.event) state.event = null;
  state.settings = next;
  saveState(host.fs, state);
  return ok(stateView(state, chat.msgs, loadConfig(host.fs), sceneOf(host.fs, chatId, chat.msgs)));
}

function configRoute(req, host) {
  if (req.method === "GET") return ok(loadConfig(host.fs));
  const b = body(req);
  const cur = loadConfig(host.fs);
  const next = cleanConfig({ ...cur, ...(b.model !== undefined ? { model: b.model } : {}), ...(b.maxTokens !== undefined ? { maxTokens: b.maxTokens } : {}) });
  const diff = {};
  for (const k of Object.keys(DEFAULT_CONFIG)) if (next[k] !== DEFAULT_CONFIG[k]) diff[k] = next[k];
  if (Object.keys(diff).length) writeJson(host.fs, CONFIG_FILE, diff);
  else {
    try {
      host.fs.remove(CONFIG_FILE);
    } catch {}
  }
  return ok(next);
}

const isRateLimit = (r) => /429|rate.?limit/i.test(String(r.error || ""));

function emptyReplyError(r) {
  if (r.error) return String(r.error);
  if (str(r.reasoning)) return "the DM model spent its whole reply limit thinking and wrote no answer. Give the chat's preset a thinking budget, turn thinking off for this model, or raise the DM's reply limit.";
  return "the DM model returned nothing";
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
  const ask = (k) => {
    const model = dmModel(fsx, cfg, chat.meta);
    host.llm.request(k, {
      ...(model ? { model } : {}),
      systemPrompt: systemFor(level),
      messages: [{ role: "user", content: dmInput({
        cards, userName, entities: state.entities, msgs: unread, level,
        fronts: state.fronts, event: state.event, direction: directionOf(state, scene),
        threads: level === "antagonist" || level === "director" ? dashThreads(fsx, chatId, scene) : [],
      }) }],
      ...callParams(fsx, cfg, chat.meta),
    });
  };
  // the newest message read now: the run is pinned to it, so a reply that lands meanwhile waits for the next run
  const upTo = keyOf(chat.msgs[chat.msgs.length - 1]);
  if (!r) {
    ask(key);
    return { __llmPending: true, stash: { retry, upTo } };
  }
  if (!retry && r.error && isRateLimit(r)) {
    ask("world_retry");
    return { __llmPending: true, stash: { retry: true, upTo: stash.upTo || upTo } };
  }
  const fail = (message) => {
    state.lastError = { at: Date.now(), message: cut(message, 400) };
    saveState(fsx, state);
    return ok({ ok: false, error: message });
  };
  if (r.error || !str(r.text)) return fail(emptyReplyError(r));
  const out = parseReply(r.text);
  if (!out) return fail("the DM's reply was not JSON");
  const changes = applyReport(state, out, { cards, userName, now: Date.now() });
  const moved = level !== "chronicler" ? applyLevel(state, out, { level, direction: scene && scene.direction, now: Date.now() }) : 0;
  if (scene && scene.direction === "transition") state.transitionKey = scene.key;
  state.lastKey = str(stash.upTo) || upTo;
  state.lastRunAt = Date.now();
  if (str(r.model)) state.lastModel = str(r.model);
  delete state.lastError;
  state.log = [...state.log, { at: state.lastRunAt, key: state.lastKey, reason, changes, fronts: moved, summary: cut(str(out.summary), 200) }].slice(-LOG_MAX);
  if (changes || state.entities.length) {
    writeBook(fsx, state, str(chat.meta.title));
    bindBook(fsx, chatId, chat.meta, state.bookId);
  }
  saveState(fsx, state);
  return ok({ ok: true, changes, ...stateView(state, chat.msgs, cfg, scene) });
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (!path.startsWith("/world/")) return null;
  if (path === "/world/state" && req.method === "GET") return stateRoute(req, host);
  if (path === "/world/settings" && req.method === "PUT") return settingsRoute(req, host);
  if (path === "/world/peek" && req.method === "GET") return peekRoute(req, host);
  if (path === "/world/config" && (req.method === "GET" || req.method === "PUT")) return configRoute(req, host);
  if (path === "/world/update" && req.method === "POST") return updateRoute(req, host);
  return ok({ error: "not found" }, 404);
}
