/**
 * Litopys 2.0: chapters and facts per chat, and the story record each reply carries.
 *
 * One chapter per closed scene, built by one model call per tick (the oldest
 * closed scene that has none), plus fact operations that come back with it.
 * Before each reply (llmRequest) it inserts chapters of what left the prompt and facts, within
 * the user's token budget (see M3-SPEC.md), in two blocks: the chapter just before the history
 * above it, the rest just before the newest turn (so the provider's prompt cache keeps the
 * history). The module is evaluated afresh on every pass of a hook, so all state lives in files.
 *
 * Files (under data/litopys/):
 *   chats/<chatId>.json      chapters, facts, proposals, the scene in progress,
 *                            counters and the worker's last run
 *   vectors/<chatId>.json    { id: { hash, vector } } for chapters and facts
 *   config.json              the user's changes to the defaults
 *   embed-status.json        { ok, checkedAt }: a failed embed pauses for 1 hour
 *   store.json, proposals.json   Litopys 1.x, kept as a backup; read by the
 *                            migration, trimmed for deleted chats
 *
 * Routes (under /v1/apps/roleplay/):
 *  GET /litopys/config . PUT /litopys/config
 *  DELETE /litopys/config/prompts   back to the shipped prompts (?key=chapter|arc|remembers|continues|cardMemory: only that one)
 *  GET|PUT|DELETE /litopys/memory ?kind=card|persona|world&id=   a long memory by owner (memory/personas/<id>.json,
 *                            memory/worlds/<id>.json; a card's stays characters/<id>/memory.json); POST /litopys/memory/preview
 *                            and /import { kind, id, chatId, ... }. /litopys/card-memory* is the card's own, unchanged
 */

// PART A: utils, config, legacy store, chat reading, scenes, worker request / parse / apply

const LITOPYS_DIR = "litopys";
const CHAT_DIR = "litopys/chats/";
const VECTOR_DIR = "litopys/vectors/";
const CONFIG_FILE = "litopys/config.json";
const STORE_FILE = "litopys/store.json";
const PROPOSALS_FILE = "litopys/proposals.json";
const EMBED_STATUS_FILE = "litopys/embed-status.json";
const VAULT_DIR = "vault-chats";
const RETRY_MS = 600000;
/** The most tokens the prompt insert may be given (wave 1 of the memory work; it was 4000). */
export const BUDGET_MAX = 16000;
/** Auto memory size: this share of the model's context window, never below AUTO_MIN. A first guess, to be tuned on real chats. */
export const AUTO_SHARE = 0.15;
export const AUTO_MIN = 800;
/** The memory size for a model with `contextTokens` of context; null when the engine did not say. */
export function autoBudget(contextTokens) {
  const n = Number(contextTokens);
  return Number.isFinite(n) && n > 0 ? clamp(Math.round(n * AUTO_SHARE), AUTO_MIN, BUDGET_MAX) : null;
}
/** Sanity cap on the chapters and arcs the ranked insert considers; the budget is the real limit. */
const CHAPTERS_MAX = 60;
/** Of what is left after the pinned and present facts and the bridge, chapters and arcs get at least this share. */
const CHAPTER_SHARE = 0.4;
const DICE_LIMIT = 0.85;

// ---------- tiny utils ----------
export function readJson(fsx, path, dflt) {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
}

export function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

export function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

export function cut(s, n) {
  return str(s).slice(0, n);
}

export function arr(v) {
  return Array.isArray(v) ? v : [];
}

export function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// FNV-1a 32-bit, 8 hex chars
export function fnv1a(s) {
  s = String(s || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** FNV-1a of the covered messages' texts joined by char code 1. msgs = array of message objects. */
export function chapterSig(msgs) {
  const s = arr(msgs).map((m) => String((m && m.text) || "")).join(String.fromCharCode(1));
  return fnv1a(s);
}

const WORD_APOS = /['\u2019\u02BC\u2018`\u00B4\u02B9\u2032]/g;
function normText(s) {
  return String(s).normalize("NFD").replace(/\u0301/g, "").normalize("NFC").toLowerCase().replace(WORD_APOS, "'").replace(/\u0451/g, "\u0435");
}

function trigrams(text) {
  const t = normText(text).replace(/\s+/g, " ").trim();
  const out = new Set();
  if (t.length < 3) {
    if (t) out.add(t);
    return out;
  }
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Dice similarity of two texts by character trigrams, 0 to 1. */
export function diceSimilarity(a, b) {
  const x = trigrams(a);
  const y = trigrams(b);
  if (!x.size || !y.size) return 0;
  let hit = 0;
  for (const g of x) if (y.has(g)) hit++;
  return (2 * hit) / (x.size + y.size);
}

/** Token estimate by script (ported from engine): ASCII ~3.5 chars a token,
 *  other letters ~2, CJK and the rest 1. */
export function estimateTokens(text) {
  const s = String(text == null ? "" : text);
  let ascii = 0;
  let alpha = 0;
  let other = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) ascii++;
    else if (c < 0x2e80) alpha++;
    else other++;
  }
  return Math.ceil(ascii / 3.5 + alpha / 2 + other);
}

// ---------- config ----------
/** Without a Dashboard snapshot, whoever wrote in this many latest messages counts as present. */
const PRESENT_WINDOW = 20;
/** Direct messages kept after the cut scenes: from 2, no upper limit that matters (a huge number cuts nothing). */
const SCENE_KEEP_MAX = 100000;

export const DEFAULT_CONFIG = {
  enabled: true,
  model: "",
  recentMessages: 100,
  // "fit": the model's window decides how much of what chapters cover leaves the prompt; "scenes": a scene
  // leaves whole as soon as its chapter exists, and sceneKeep (2 and up, no upper limit in practice) direct messages stay after the last one
  cutMode: "fit",
  sceneKeep: 2,
  scene: {
    minMessages: 6,
    maxMessages: 40,
  },
  pinLimit: 5,
  insert: true,
  budget: 800,
  budgetMode: "fixed",
  // 0.9.2: the most the backstory of a linked earlier chat may take (0 = none)
  linkBudget: 800,
  // M4d arcs: older chapters merged into one summary when they outgrow the budget. A new install merges by itself
  // (a merge only adds an arc over its chapters, nothing is deleted); an install that already had Litopys data
  // keeps "ask" until its owner switches (stampInstall)
  arcMode: "auto",
  // "pending": the Library offers an install that kept "ask" to switch to "auto", once; "done": nothing to offer
  arcNotice: "done",
  // wave 1: "ask" waits for a click on every proposal; "quiet" applies a pin or a rewrite by itself and logs it with an Undo
  // (a retire or a merge always waits)
  proposals: "ask",
  // Consolidate facts runs by itself after this many new facts; null = on only while proposals are "quiet"
  autoConsolidate: null,
  arcKeep: 4,
  arcThreshold: 0,
  arcSizeMin: 5,
  arcSizeMax: 8,
  arcWords: 150,
  // #106: the chapter worker also watches for habits a character shows again and again (habits); a candidate
  // is earned (starts to act in the chat) once it was seen in this many chapters
  habits: true,
  habitsEarnAfter: 2,
  // #99: when a scene has two or more named characters besides the player, the worker also writes what each of them
  // remembers of it (chapter.views); the reply of a character carries its own, the narrator's carries all
  recollections: true,
  // #99 piece 3: how the lexical recall weighs a match. "phrases" (default): a name, two words in a row and a word the chat
  // does not use all the time weigh differently; "words": the old rule, a rare word counts the same wherever it stands.
  // No setting in the app: a hand-edited key to go back if the new rule does worse for someone.
  recallScoring: "phrases",
  // #178: a new fact may name the earlier fact that caused it (fact.because); when the insert picks an effect and
  // the budget has room, its cause (if active) rides right after it. No setting in the app: a hand-edited key to turn it off.
  causes: true,
};

/** ask: the Library offers a merge; auto: the worker merges by itself; off: no new arcs. */
export const ARC_MODES = ["ask", "auto", "off"];
export const PROPOSAL_MODES = ["ask", "quiet"];

// What the memory parts are FOR (#110): the characters lived it. "Do not retell it" alone was read as "do not mention it".
export const REMEMBERS = "The characters remember it: it is established canon and a question about it gets a real answer. Do not retell it unprompted, do not contradict it.";
export const CONTINUES =
  "This chat CONTINUES that story. The characters remember it: it really happened to them, so treat it as established canon and let it show naturally. When a character is asked or reminded of it, they recognise it and answer from it. The opening messages of this chat may read like a first meeting: treat them as a later scene of the same story. Do not retell it unprompted, do not contradict it.";
// The sentences that tell the model what the memory parts are FOR are editable like the writing prompts (#113):
// the bracketed lead of each part stays in code, only the sentence after it is the user's.
export const CARD_MEMORY_RULE = "{name} lived through these; recognise them when reminded or asked, and do not bring them up unprompted.";

export const DEFAULT_PROMPTS = {
  chapter: [
    "You keep the story record of an ongoing roleplay. From the Scene messages, write the chapter of what happened and the durable facts that came out of it. The Previous chapter and the Known facts are background: do not retell them, repeat them or contradict them without cause.",
    "",
    "Chapter:",
    "- 3-6 sentences, past tense, third person, names not pronouns.",
    "- State consequences, not a retelling: who won or lost, who is hurt, what was gained or lost, how people's feelings toward each other changed, what was decided or promised, who learned what.",
    "- Never invent; use only what the messages say.",
    "",
    "Facts:",
    "- Durable things only, one short self-contained sentence each, at most 8.",
    "- subject: a name, the user's character's name, or \"world\".",
    "- knownBy: names who witnessed or were told, or \"all\".",
    "- type: event|trait|change|relation|world|plan. change = a lasting change that overrides the character card (a lost arm, a new scar, a title).",
    "- weight: everyday|important|key.",
    "- To change a known fact: {op:\"update\", id, text} or {op:\"retire\", id, reason}. New facts {op:\"add\", ...}. Never repeat a known fact.",
    "- Use only what the messages say; never invent and never add knowledge from outside the story.",
    "",
    "Language: write the chapter, its label and the facts in English, whatever language the story is written in. Keep every name exactly as the story spells it, in its own script: never translate or transliterate a name.",
    "",
    "Reply with ONE JSON object and nothing else. No code fences, no commentary.",
  ].join("\n"),
  arc: [
    "You keep the story record of an ongoing roleplay. The Chapters below follow each other in the story. Merge them into one arc: what this stretch of the story changed, for a reader who will never see the chapters.",
    "",
    "- Past tense, third person, names not pronouns.",
    "- State consequences, not a retelling: who won or lost, who is hurt, what was gained or lost, how people's feelings toward each other changed, what was decided or promised, who learned what, what is still open.",
    "- When a later chapter undoes or settles something from an earlier one, keep only how it ended.",
    "- Never invent; use only what the chapters say.",
    "- label: 2-6 words naming this stretch of the story.",
    "",
    "Language: write the arc and its label in English, whatever language the chapters are in. Keep every name exactly as the chapters spell it, in its own script: never translate or transliterate a name.",
    "",
    "Reply with ONE JSON object and nothing else. No code fences, no commentary.",
  ].join("\n"),
  // the summary of a whole chat for a card's memory (#113): asked for in the import dialog, reviewed there
  summary: [
    "You keep the story record of an ongoing roleplay. The Record below is the story so far, as arcs and chapters in order. Write the summary of the whole story that a character who lived through it would carry into a new story with the same people.",
    "",
    "- Past tense, third person, names not pronouns.",
    "- Keep what lasts: what happened in order, who did what to whom, how people's feelings toward each other changed, what was decided or promised, what is still open. Leave out scene detail and dialogue.",
    "- When a later part undoes or settles something from an earlier one, keep only how it ended.",
    "- Never invent; use only the record.",
    "",
    "Language: write the summary in English, whatever language the record is in. Keep every name exactly as the record spells it, in its own script: never translate or transliterate a name.",
    "",
    "Reply with the summary text only: plain prose, no title, no list, no code fences.",
  ].join("\n"),
  // what the memory parts say about themselves (#113): sent with the story, not to a writing model
  remembers: REMEMBERS,
  continues: CONTINUES,
  cardMemory: CARD_MEMORY_RULE,
};

export const ARC_SHAPE = '{"arc":{"label":"2-6 words","text":"the arc"}}';

export const WORKER_SHAPE =
  '{"chapter":{"label":"2-5 words","text":"3-6 sentences"},"facts":[{"op":"add","text":"","subject":"","knownBy":["names"]|"all","type":"event|trait|change|relation|world|plan","weight":"everyday|important|key"},{"op":"update","id":"f3","text":"","type":"change"?},{"op":"retire","id":"f4","reason":""}]}';

/** Added to the chapter prompt while habits are on (#106), so a customised chapter prompt keeps working. */
export const HABITS_RULE = [
  "Habits (optional, usually none):",
  "- A habit is a habit or reaction a character clearly showed in this scene and will show again in any story: how they act in a situation. Not an ability, not a fact about the story, not a mood, not what the card already says.",
  "- Add one only when a character did something characteristic: {who, name, rule, when, evidence}. At most 2 per scene. Never for the user's character.",
  "- name: 2-6 words. rule: 1-3 short lines saying what they do. when: one short line, or \"\". evidence: a short quote or one line on what they did in this scene.",
  "- When a Known habit showed again, give {reinforce: its id, evidence} and no new habit.",
].join("\n");
export const HABITS_SHAPE = ',"habits":[{"who":"","name":"","rule":"","when":"","evidence":""},{"reinforce":"k2","evidence":""}]';

/** Added to the chapter prompt when the scene has two or more named characters besides the player (#99). */
export const RECOLLECTIONS_RULE = [
  "Recollections:",
  "- For each character listed under Characters, write what THEY remember of this scene: 1-2 short sentences, first person, past tense, in their own voice.",
  "- Only what that character saw, heard, did or was told in this scene, and how it left them feeling. Nothing they were not present for, nothing another character thought in private.",
  "- Different characters remember the same event differently: keep each one's own view. Never invent; use only the messages. Skip a character who has nothing of their own to remember.",
].join("\n");
export const RECOLLECTIONS_SHAPE = ',"views":[{"who":"a name from Characters","text":"I ..."}]';
/** Added to the chapter prompt while causes are on and the scene has Known facts to point at (#178). */
export const CAUSE_RULE = [
  "Causes (optional, usually none):",
  '- When a new fact happened BECAUSE of a Known fact, add "because": that fact\'s id (one id, like "f3"). Only a cause the messages show; leave it out otherwise.',
].join("\n");
export const CAUSE_SHAPE = ',"because":"f3"?';

/** At most this many recollections to a chapter, each this long (the worker may ramble). */
const VIEWS_MAX = 8;
const VIEW_CHARS = 300;
/** The words a scene's speaker list leaves out: the voice of the story, not a character. */
const NOT_A_CAST = new Set(["narrator", "system", "user", "you", "assistant", "game master", "gm", "dm"]);

const PROMPT_KEYS = Object.keys(DEFAULT_PROMPTS);
const PAST_DEFAULT_PROMPTS = {
  // before 2026-10-07 the chapter followed the story's language
  chapter: [
    DEFAULT_PROMPTS.chapter.replace(
      "Language: write the chapter, its label and the facts in English, whatever language the story is written in. Keep every name exactly as the story spells it, in its own script: never translate or transliterate a name.",
      "Language: write the chapter and the facts in the language the story is written in (the language most messages use). Keep every name exactly as the story spells it.",
    ),
  ],
};

const promptKey = (s) => String(s || "").replace(/\s+/g, " ").trim();
const isDefaultPrompt = (key, text) =>
  !promptKey(text) || [DEFAULT_PROMPTS[key], ...(PAST_DEFAULT_PROMPTS[key] || [])].some((d) => promptKey(d) === promptKey(text));

// ---------- legacy store helpers (exactly as in the 1.x file) ----------
const LEGACY_DIR = "archivarius/";
export function moveLegacy(fsx) {
  try {
    if (fsx.list(LITOPYS_DIR).includes("store.json")) return;
  } catch {}
  const old = readJson(fsx, LEGACY_DIR + "store.json", null);
  if (old === null) return;
  try {
    fsx.write(STORE_FILE, JSON.stringify(old, null, 2));
    for (const file of [PROPOSALS_FILE, CONFIG_FILE]) {
      const name = file.split("/").pop();
      let have = true;
      try {
        have = fsx.list(LITOPYS_DIR).includes(name);
      } catch {
        have = false;
      }
      if (have) continue;
      const prev = readJson(fsx, LEGACY_DIR + name, null);
      if (prev !== null) fsx.write(file, JSON.stringify(prev, null, 2));
    }
  } catch {}
}

export function readOwn(fsx, file, dflt) {
  moveLegacy(fsx);
  return readJson(fsx, file, dflt);
}

export function loadStore(fsx) {
  return readOwn(fsx, STORE_FILE, { chats: {} });
}

export function saveStore(fsx, s) {
  fsx.write(STORE_FILE, JSON.stringify(s, null, 2));
}

export function loadProposals(fsx) {
  return readOwn(fsx, PROPOSALS_FILE, { items: [] });
}

export function saveProposals(fsx, p) {
  fsx.write(PROPOSALS_FILE, JSON.stringify(p, null, 2));
}

/**
 * Memory wave 1: arcs merge by themselves on a new install, and an install that already has Litopys data keeps
 * its choice ("ask" when it never made one) and is offered the switch once. Told apart by what is on disk the
 * first time the config is read, then written down in config.json so a later chat file cannot change the answer.
 */
function stampInstall(fsx) {
  const raw = readOwn(fsx, CONFIG_FILE, null);
  if (isObj(raw) && "arcNotice" in raw) return;
  let hasData = isObj(raw);
  if (!hasData) {
    try {
      hasData = fsx.list(CHAT_DIR.replace(/\/$/, "")).length > 0 || fsx.list(LITOPYS_DIR.replace(/\/$/, "")).includes("store.json");
    } catch {}
  }
  const next = isObj(raw) ? { ...raw } : {};
  if (hasData) {
    if (!ARC_MODES.includes(next.arcMode)) next.arcMode = "ask";
    next.arcNotice = next.arcMode === "ask" ? "pending" : "done";
  } else {
    next.arcMode = "auto";
    next.arcNotice = "done";
  }
  try {
    fsx.write(CONFIG_FILE, JSON.stringify(next, null, 2));
  } catch {}
}

/** config.json as stored, minus prompts that are a default (so they follow it). */
function storedConfig(fsx) {
  stampInstall(fsx);
  const raw = readOwn(fsx, CONFIG_FILE, null);
  // only keys this version knows: the 1.x keys (extractEveryNTurns, inject, ...) are ignored
  const cfg = {};
  if (isObj(raw)) {
    // habits were called skills until 4.67.0: the old keys are read when the new ones are not there
    if (!("habits" in raw) && "skills" in raw) raw.habits = raw.skills;
    if (!("habitsEarnAfter" in raw) && "skillsEarnAfter" in raw) raw.habitsEarnAfter = raw.skillsEarnAfter;
    for (const key of Object.keys(DEFAULT_CONFIG)) if (key in raw) cfg[key] = raw[key];
    for (const key of PROMPT_KEYS) if (typeof raw[key] === "string" && !isDefaultPrompt(key, raw[key])) cfg[key] = raw[key];
  }
  return cfg;
}

/** The config in effect: defaults, then what the user chose. */
export function loadConfig(fsx) {
  const stored = storedConfig(fsx);
  const scene = { ...DEFAULT_CONFIG.scene, ...(isObj(stored.scene) ? stored.scene : {}) };
  const cfg = { ...DEFAULT_CONFIG, ...DEFAULT_PROMPTS, ...stored };
  cfg.scene = {
    minMessages: clamp(scene.minMessages, 1, 40),
    maxMessages: clamp(scene.maxMessages, 10, 200),
  };
  if (cfg.scene.maxMessages < cfg.scene.minMessages) cfg.scene.maxMessages = cfg.scene.minMessages;
  cfg.recentMessages = clamp(cfg.recentMessages, 6, 200);
  cfg.cutMode = cfg.cutMode === "scenes" ? "scenes" : "fit";
  cfg.sceneKeep = clamp(cfg.sceneKeep, 2, SCENE_KEEP_MAX);
  cfg.pinLimit = clamp(cfg.pinLimit, 1, 20);
  cfg.insert = cfg.insert !== false;
  cfg.budget = clamp(cfg.budget, 200, BUDGET_MAX);
  cfg.budgetMode = cfg.budgetMode === "auto" ? "auto" : "fixed";
  cfg.linkBudget = clamp(intOf(cfg.linkBudget, 800), 0, 3000);
  cfg.arcMode = ARC_MODES.includes(cfg.arcMode) ? cfg.arcMode : DEFAULT_CONFIG.arcMode;
  cfg.arcNotice = cfg.arcNotice === "pending" ? "pending" : "done";
  cfg.proposals = PROPOSAL_MODES.includes(cfg.proposals) ? cfg.proposals : DEFAULT_CONFIG.proposals;
  cfg.autoConsolidate = typeof cfg.autoConsolidate === "boolean" ? cfg.autoConsolidate : null;
  cfg.arcKeep = clamp(intOf(cfg.arcKeep, 4), 1, 50);
  cfg.arcThreshold = arcThresholdValue(cfg.arcThreshold);
  cfg.arcSizeMin = clamp(intOf(cfg.arcSizeMin, 5), 2, 20);
  cfg.arcSizeMax = Math.max(cfg.arcSizeMin, clamp(intOf(cfg.arcSizeMax, 8), 2, 30));
  cfg.arcWords = clamp(intOf(cfg.arcWords, 150), 40, 400);
  cfg.habits = cfg.habits !== false;
  cfg.habitsEarnAfter = clamp(intOf(cfg.habitsEarnAfter, 2), 1, 5);
  cfg.recollections = cfg.recollections !== false;
  cfg.recallScoring = cfg.recallScoring === "words" ? "words" : "phrases";
  cfg.causes = cfg.causes !== false;
  return cfg;
}

/** A whole number from a value, or the fallback when it is not a number. */
function intOf(v, dflt) {
  return v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v)) ? Math.round(Number(v)) : dflt;
}

/** 0 = follow the budget (twice the insert budget), else 200..40000 tokens. */
function arcThresholdValue(v) {
  const n = intOf(v, 0);
  return n <= 0 ? 0 : clamp(n, 200, 40000);
}

/** The tokens the older chapters may take before an arc is offered. */
export function arcThresholdOf(cfg) {
  return (cfg && cfg.arcThreshold) || 2 * clamp(cfg && cfg.budget, 200, BUDGET_MAX);
}

/** The PUT logic described in item 13. Writes the file, returns loadConfig(fsx). */
export function patchConfig(fsx, body) {
  const b0 = body && typeof body === "object" ? body : {};
  const b = b0.values && typeof b0.values === "object" ? { ...b0, ...b0.values } : b0;
  const stored = storedConfig(fsx);
  const next = { ...DEFAULT_CONFIG, ...stored };
  if (b.enabled !== undefined) next.enabled = b.enabled !== false && b.enabled !== "off";
  if (b.model !== undefined) next.model = typeof b.model === "string" ? b.model.trim().slice(0, 160) : "";
  if (b.recentMessages !== undefined) next.recentMessages = clamp(intOf(b.recentMessages, 100), 6, 200);
  if (b.cutMode !== undefined) next.cutMode = b.cutMode === "scenes" ? "scenes" : "fit";
  if (b.sceneKeep !== undefined) next.sceneKeep = clamp(intOf(b.sceneKeep, 2), 2, SCENE_KEEP_MAX);
  if (b.pinLimit !== undefined) next.pinLimit = clamp(intOf(b.pinLimit, 5), 1, 20);
  if (b.insert !== undefined) next.insert = b.insert !== false && b.insert !== "off";
  if (b.budget !== undefined) next.budget = clamp(intOf(b.budget, 800), 200, BUDGET_MAX);
  if (b.budgetMode !== undefined) next.budgetMode = b.budgetMode === "auto" ? "auto" : "fixed";
  if (b.linkBudget !== undefined) next.linkBudget = clamp(intOf(b.linkBudget, 800), 0, 3000);
  if (b.arcMode !== undefined) {
    next.arcMode = ARC_MODES.includes(str(b.arcMode)) ? str(b.arcMode) : DEFAULT_CONFIG.arcMode;
    // a choice made on purpose settles the offer
    next.arcNotice = "done";
  }
  if (b.arcNotice !== undefined) next.arcNotice = "done";
  if (b.proposals !== undefined) next.proposals = PROPOSAL_MODES.includes(str(b.proposals)) ? str(b.proposals) : DEFAULT_CONFIG.proposals;
  if (b.autoConsolidate !== undefined) next.autoConsolidate = typeof b.autoConsolidate === "boolean" ? b.autoConsolidate : null;
  if (b.arcKeep !== undefined) next.arcKeep = clamp(intOf(b.arcKeep, 4), 1, 50);
  if (b.arcThreshold !== undefined) next.arcThreshold = arcThresholdValue(b.arcThreshold);
  if (b.arcSizeMin !== undefined) next.arcSizeMin = clamp(intOf(b.arcSizeMin, 5), 2, 20);
  if (b.arcSizeMax !== undefined) next.arcSizeMax = clamp(intOf(b.arcSizeMax, 8), 2, 30);
  if (b.arcWords !== undefined) next.arcWords = clamp(intOf(b.arcWords, 150), 40, 400);
  if (b.habits !== undefined) next.habits = b.habits !== false && b.habits !== "off";
  if (b.habitsEarnAfter !== undefined) next.habitsEarnAfter = clamp(intOf(b.habitsEarnAfter, 2), 1, 5);
  if (b.recollections !== undefined) next.recollections = b.recollections !== false && b.recollections !== "off";
  // a max below the min follows the min
  if (intOf(next.arcSizeMax, 8) < intOf(next.arcSizeMin, 5)) next.arcSizeMax = intOf(next.arcSizeMin, 5);
  next.scene = { ...DEFAULT_CONFIG.scene, ...(isObj(stored.scene) ? stored.scene : {}) };
  const sc = { ...(isObj(b.scene) ? b.scene : {}), ...(b.scene_minMessages !== undefined ? { minMessages: b.scene_minMessages } : {}), ...(b.scene_maxMessages !== undefined ? { maxMessages: b.scene_maxMessages } : {}) };
  if (sc.minMessages !== undefined) next.scene.minMessages = clamp(intOf(sc.minMessages, 6), 1, 40);
  if (sc.maxMessages !== undefined) next.scene.maxMessages = clamp(intOf(sc.maxMessages, 40), 10, 200);
  if (next.scene.maxMessages < next.scene.minMessages) next.scene.maxMessages = next.scene.minMessages;
  for (const key of PROMPT_KEYS) {
    if (typeof b[key] !== "string") continue;
    if (isDefaultPrompt(key, b[key])) delete next[key];
    else next[key] = b[key].slice(0, 8000);
  }
  fsx.write(CONFIG_FILE, JSON.stringify(next, null, 2));
  return loadConfig(fsx);
}

/** Deletes the stored prompts (only `only` when it names one), returns loadConfig(fsx). */
export function resetPrompts(fsx, only) {
  const stored = storedConfig(fsx);
  for (const key of PROMPT_KEYS) if (!only || only === key) delete stored[key];
  fsx.write(CONFIG_FILE, JSON.stringify(stored, null, 2));
  return loadConfig(fsx);
}

/** Which prompts the user changed. */
export function customPrompts(fsx) {
  return PROMPT_KEYS.filter((key) => key in storedConfig(fsx));
}

// ---------- chat reading ----------
export function readChat(fsx, chatId) {
  const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
  if (!isObj(meta)) return null;
  const msgs = [];
  try {
    for (const line of String(fsx.read("chats/" + chatId + ".jsonl")).split("\n")) {
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line);
        if (isObj(m)) msgs.push(m);
      } catch {}
    }
  } catch {}
  return { meta, msgs };
}

/** The ACTIVE LINE array of message objects (role user|char, non-empty id, hidden !== true). */
export function activeLine(msgs) {
  return msgs.filter(
    (m) =>
      (m.role === "user" || m.role === "char") &&
      m.id !== undefined &&
      m.id !== null &&
      m.id !== "" &&
      m.hidden !== true,
  );
}

export function readDash(fsx, chatId) {
  return readJson(fsx, "dashboard/state/" + chatId + ".json", { snapshots: {} });
}

const JUMP_MINUTES = 360;
/** The place a snapshot's clock carries ("" when none). */
const placeOf = (snap) => (snap && isObj(snap.clock) ? str(snap.clock.place) : "");

/** The sensor rewords places ("east road" / "the road east"): same when one holds the other or they read alike. */
export function samePlace(a, b) {
  const x = normText(a).replace(/\s+/g, " ").trim();
  const y = normText(b).replace(/\s+/g, " ").trim();
  if (!x || !y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  return diceSimilarity(x, y) >= 0.6;
}

export function snapOf(dash, msg) {
  if (!dash || !isObj(dash.snapshots)) return null;
  const key = msg.id + "#" + (Number.isFinite(msg.swipe) ? msg.swipe : 0);
  const s = dash.snapshots[key];
  return isObj(s) ? s : null;
}

// ---------- scenes ----------
function clockMinutes(clock) {
  if (!clock || !clock.time) return null;
  const [h, m] = String(clock.time).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const day = Number(clock.day) || 1;
  return (day - 1) * 1440 + h * 60 + m;
}

/** The marks (st.marks: message id pairs the reader set apart) as index ranges in the line; unknown ids and overlaps are left out. */
export function markRanges(line, marks) {
  const out = [];
  for (const m of arr(marks)) {
    if (!isObj(m)) continue;
    const fromIdx = line.findIndex((x) => x.id === m.from);
    const toIdx = line.findIndex((x) => x.id === m.to);
    if (fromIdx < 0 || toIdx < fromIdx) continue;
    out.push({ id: m.id, fromIdx, toIdx });
  }
  out.sort((a, b) => a.fromIdx - b.fromIdx);
  return out.filter((r, i) => i === 0 || r.fromIdx > out[i - 1].toIdx);
}

/**
 * findScenes(line, dash, cfg, marks) -> [{ from, to, fromIdx, toIdx, count, kind, label, place, closed, open }]
 * Covers the whole line without gaps.
 */
export function findScenes(line, dash, cfg, marks) {
  if (!line.length) return [];
  const cfgScene = cfg.scene || DEFAULT_CONFIG.scene;
  const minMessages = clamp(cfgScene.minMessages, 1, 40);
  const maxMessages = clamp(cfgScene.maxMessages, 10, 200);
  const hasDash = dash && isObj(dash.snapshots) && Object.keys(dash.snapshots).length > 0;

  // Boundaries: a sensor flag, a new place, a clock jump of more than 6 hours. A new place or a
  // jump is a hard boundary (the chat header shows it too): the scene before it closes whatever
  // the length of the one after. A sensor flag alone is soft: a short scene behind it folds back.
  const bounds = new Set([0]);
  const hard = new Set();
  let prevClock = null;
  let prevPlace = null;
  let sawSnap = false;
  for (let i = 0; i < line.length; i++) {
    const snap = hasDash ? snapOf(dash, line[i]) : null;
    if (!snap) continue;
    sawSnap = true;
    const place = placeOf(snap);
    const minutes = clockMinutes(snap.clock);
    const placeChanged = !!(place && prevPlace && !samePlace(place, prevPlace));
    const timeJump = minutes !== null && prevClock !== null && Math.abs(minutes - prevClock) > JUMP_MINUTES;
    if (i > 0 && ((snap.scene && snap.scene.new === true) || placeChanged || timeJump)) bounds.add(i);
    if (i > 0 && (placeChanged || timeJump)) hard.add(i);
    if (place) prevPlace = place;
    if (minutes !== null) prevClock = minutes;
  }

  // no dashboard data: every maxMessages messages is a boundary
  if (!sawSnap) {
    for (let i = maxMessages; i < line.length; i += maxMessages) bounds.add(i);
  }

  // Scenes the reader marked (st.marks): each stands alone, whatever the sensor saw inside it and
  // however short it is. A boundary inside a marked range is dropped; its two ends become boundaries.
  const marked = markRanges(line, marks);
  for (const r of marked) {
    for (const b of [...bounds]) if (b > r.fromIdx && b <= r.toIdx) bounds.delete(b);
    if (r.fromIdx > 0) bounds.add(r.fromIdx);
    if (r.toIdx + 1 < line.length) bounds.add(r.toIdx + 1);
  }
  const isMarked = (r) => marked.some((m) => m.fromIdx === r.fromIdx && m.toIdx === r.toIdx);

  // Build raw scenes
  const raw = [];
  const boundArr = [...bounds].sort((a, b) => a - b);
  for (let i = 0; i < boundArr.length; i++) {
    const fromIdx = boundArr[i];
    const toIdx = i + 1 < boundArr.length ? boundArr[i + 1] - 1 : line.length - 1;
    if (toIdx < fromIdx) continue;
    raw.push({ fromIdx, toIdx });
  }
  if (!raw.length) raw.push({ fromIdx: 0, toIdx: line.length - 1 });

  // Merge short scenes into previous (only those a sensor flag alone started); a short first scene (a greeting) joins the next one
  const merged = [];
  for (const r of raw) {
    const len = r.toIdx - r.fromIdx + 1;
    const own = isMarked(r);
    // a marked scene is never folded into the one before it, and nothing is folded into it
    if (len < minMessages && merged.length && !own && !hard.has(r.fromIdx) && !merged[merged.length - 1].marked) {
      merged[merged.length - 1].toIdx = r.toIdx;
    } else {
      merged.push({ ...r, marked: own });
    }
  }
  if (merged.length > 1 && !merged[0].marked && !merged[1].marked && merged[0].toIdx - merged[0].fromIdx + 1 < minMessages) {
    merged[1].fromIdx = merged[0].fromIdx;
    merged.shift();
  }

  // Split long scenes into parts
  const scenes = [];
  for (const r of merged) {
    const len = r.toIdx - r.fromIdx + 1;
    if (len > maxMessages) {
      // n parts of nearly equal size, none over the maximum
      const n = Math.ceil(len / maxMessages);
      const base = Math.floor(len / n);
      const extra = len % n;
      let fromIdx = r.fromIdx;
      for (let i = 0; i < n; i++) {
        const toIdx = fromIdx + base + (i < extra ? 1 : 0) - 1;
        scenes.push({ fromIdx, toIdx, kind: "part", marked: r.marked === true });
        fromIdx = toIdx + 1;
      }
    } else {
      scenes.push({ fromIdx: r.fromIdx, toIdx: r.toIdx, kind: "scene", marked: r.marked === true });
    }
  }

  // Finalize scenes
  const result = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const from = line[s.fromIdx].id;
    const to = line[s.toIdx].id;
    const count = s.toIdx - s.fromIdx + 1;
    // label: the first sensor label in the scene (a greeting has no snapshot), else the place;
    // place: of the last snapshot in the scene
    let label = "";
    let firstPlace = "";
    let lastPlace = null;
    for (let j = s.fromIdx; j <= s.toIdx; j++) {
      const snap = snapOf(dash, line[j]);
      if (!label && snap && snap.scene && str(snap.scene.label)) label = cut(snap.scene.label, 80);
      const p = snap ? placeOf(snap) : "";
      if (!p) continue;
      if (!firstPlace) firstPlace = p;
      lastPlace = p;
    }
    if (!label) label = firstPlace;
    // closed: a later scene exists. A later scene shorter than minMessages would have merged
    // into this one, so the boundary is settled. recentMessages only decides what the prompt
    // keeps word for word; a chapter may be written while its messages are still recent.
    // a scene the reader marked is closed at once, even at the end of the chat
    const closed = i < scenes.length - 1 || s.marked === true;
    result.push({
      from,
      to,
      fromIdx: s.fromIdx,
      toIdx: s.toIdx,
      count,
      kind: s.kind,
      label,
      place: lastPlace,
      closed,
      open: false,
      marked: s.marked === true,
    });
  }
  // Mark the last scene as open
  if (result.length) result[result.length - 1].open = true;
  return result;
}

/**
 * Where a chapter sits in the line: { fromIdx, toIdx, orphan, partial }.
 * orphan: its first message is gone (no range). partial: its last message is gone,
 * the range then runs count messages from the first one.
 */
export function rangeOf(ch, line) {
  const at = (id) => line.findIndex((m) => m.id === id);
  const fromIdx = ch && ch.from ? at(ch.from) : -1;
  if (fromIdx < 0) return { fromIdx: -1, toIdx: -1, orphan: true, partial: false };
  const toAt = at(ch.to);
  if (toAt >= fromIdx) return { fromIdx, toIdx: toAt, orphan: false, partial: false };
  return { fromIdx, toIdx: Math.min(line.length - 1, fromIdx + Math.max(1, Number(ch.count) || 1) - 1), orphan: false, partial: true };
}

/** A chapter whose messages changed (or went missing) is stale. True when any chapter changed. */
export function markStale(st, line) {
  let changed = false;
  for (const ch of st.chapters) {
    // the user wrote it: it stays until the user rewrites or deletes it (else the cut would stop there)
    if (ch.edited === true) continue;
    const r = rangeOf(ch, line);
    const stale = r.orphan || r.partial || chapterSig(line.slice(r.fromIdx, r.toIdx + 1)) !== ch.sig;
    if (stale && !ch.stale) {
      ch.stale = true;
      changed = true;
    }
  }
  return changed;
}

/**
 * M3b item 2: the covered count of a chat line. A chapter counts from index 0
 * while it is not stale and not orphan; a merged chapter counts. A gap or a
 * stale/orphan chapter stops the coverage. Chapters past a gap do not count.
 */
export function coveredCount(st, line) {
  if (!st || !Array.isArray(st.chapters) || !Array.isArray(line) || !line.length) return 0;
  const ranges = st.chapters
    .filter((ch) => isObj(ch) && (ch.stale !== true || ch.edited === true))
    .map((ch) => ({ ...rangeOf(ch, line), edited: ch.edited === true }))
    .concat(skipRanges(st, line))
    .filter((r) => !r.orphan && (!r.partial || r.edited))
    .sort((a, b) => a.fromIdx - b.fromIdx);
  let covered = 0;
  for (const r of ranges) {
    if (r.fromIdx > covered) break;
    if (r.toIdx + 1 > covered) covered = r.toIdx + 1;
  }
  return Math.min(covered, line.length);
}

/** The ends (count of line messages up to the end of a chapter) of the chapters covering the line from its
 *  start without a gap, ascending: where a whole scene ends. Same coverage rules as coveredCount. */
export function sceneEnds(st, line) {
  if (!st || !Array.isArray(st.chapters) || !Array.isArray(line) || !line.length) return [];
  const ranges = st.chapters
    .filter((ch) => isObj(ch) && (ch.stale !== true || ch.edited === true))
    .map((ch) => ({ ...rangeOf(ch, line), edited: ch.edited === true }))
    .concat(skipRanges(st, line))
    .filter((r) => !r.orphan && (!r.partial || r.edited))
    .sort((a, b) => a.fromIdx - b.fromIdx);
  let covered = 0;
  const ends = new Set();
  for (const r of ranges) {
    if (r.fromIdx > covered) break;
    if (r.toIdx + 1 > covered) covered = r.toIdx + 1;
    ends.add(Math.min(r.toIdx + 1, line.length));
  }
  return [...ends].sort((a, b) => a - b);
}

/**
 * M3b item 2: the cut count = covered, at most line.length - recentMessages. In cutMode "scenes" it is
 * the end of the last whole scene that leaves sceneKeep messages after it (a scene goes whole or not at all).
 */
export function cutCount(st, line, cfg) {
  if (cfg && cfg.cutMode === "scenes") {
    const limit = line.length - clamp(cfg.sceneKeep, 2, SCENE_KEEP_MAX);
    const ends = sceneEnds(st, line).filter((e) => e <= limit);
    return ends.length ? ends[ends.length - 1] : 0;
  }
  const covered = coveredCount(st, line);
  const recent = (cfg && cfg.recentMessages) || DEFAULT_CONFIG.recentMessages;
  const limit = Math.max(0, line.length - recent);
  return Math.max(0, Math.min(covered, limit));
}


/**
 * The oldest closed scene that needs a chapter: { scene, replaces } or null.
 * A scene has a chapter when one overlaps it. A stale chapter of kind scene or part (not
 * merged, not edited) is rebuilt in place. A merged chapter (the old summary) ends
 * mid-scene: the part of the scene after it still gets its own chapter.
 */
export function pickWork(st, line, dash, cfg) {
  return workList(st, line, dash, cfg, 1)[0] || null;
}

/** M4a: how many closed scenes still wait for a chapter (the "next" of the worker line). */
export function countWork(st, line, dash, cfg) {
  return workList(st, line, dash, cfg, Infinity).length;
}

/**
 * Where the user deleted a chapter and asked to keep it gone (st.skipScenes, message ids): the
 * worker never chapters those messages again, and the cut counts them as held, or the cut
 * would stop there for good.
 */
export function skipRanges(st, line) {
  const out = [];
  for (const s of arr(st && st.skipScenes)) {
    if (!isObj(s)) continue;
    const fromIdx = line.findIndex((m) => m.id === s.from);
    if (fromIdx < 0) continue;
    let toIdx = line.findIndex((m) => m.id === s.to);
    if (toIdx < fromIdx) toIdx = Math.min(line.length - 1, fromIdx + Math.max(1, Number(s.count) || 1) - 1);
    out.push({ fromIdx, toIdx, orphan: false, partial: false });
  }
  return out;
}

function workList(st, line, dash, cfg, limit) {
  const minMessages = (cfg.scene && cfg.scene.minMessages) || DEFAULT_CONFIG.scene.minMessages;
  const ranges = st.chapters.map((ch) => ({ ch, r: rangeOf(ch, line) })).filter((x) => !x.r.orphan);
  const skips = skipRanges(st, line);
  const out = [];
  for (const scene of findScenes(line, dash, cfg, st.marks).filter((x) => x.closed)) {
    if (out.length >= limit) break;
    if (skips.some((r) => r.fromIdx <= scene.toIdx && r.toIdx >= scene.fromIdx)) continue;
    const hit = ranges.filter((x) => x.r.fromIdx <= scene.toIdx && x.r.toIdx >= scene.fromIdx);
    if (!hit.length) {
      out.push({ scene, replaces: null });
      continue;
    }
    const own = hit.filter((x) => x.ch.kind !== "merged");
    if (own.length) {
      const target = own.find((x) => x.ch.from === scene.from && x.ch.to === scene.to) || own[0];
      if (target.ch.stale && !target.ch.edited) {
        out.push({ scene, replaces: target.ch.id });
        continue;
      }
    }
    // the old summary, or a chapter written before the scene grew (a greeting that later
    // joined it), ends mid-scene: cover what comes after it
    const after = Math.max(...hit.map((x) => x.r.toIdx)) + 1;
    if (after <= scene.toIdx && scene.toIdx - after + 1 >= minMessages) {
      out.push({ scene: { ...scene, from: line[after].id, fromIdx: after, count: scene.toIdx - after + 1, label: scene.label }, replaces: null });
    }
  }
  return out;
}

/** The scene's character names: message names + user + present names from snapshots. */
export function sceneNames(scene, line, dash, meta) {
  const names = new Set();
  for (let i = scene.fromIdx; i <= scene.toIdx; i++) {
    const m = line[i];
    if (m.name) names.add(m.name);
    if (dash && isObj(dash.snapshots)) {
      const snap = snapOf(dash, m);
      if (snap && Array.isArray(snap.present)) {
        for (const p of snap.present) if (typeof p === "string") names.add(p);
      }
    }
  }
  if (meta && meta.userName) names.add(meta.userName);
  return [...names];
}

/**
 * The named characters of a scene besides the player (#99): who could have a recollection of it. The player's own
 * name and the voice of the story (a narrator, a group in narrator mode: `notCast`) are left out. Fewer than two
 * means there is no one to tell a different story from, so the worker is not asked.
 */
export function sceneCast(scene, line, dash, meta, notCast = []) {
  // a name the Dashboard's user removed from the cast is no one to remember the scene either
  const skip = new Set([...NOT_A_CAST, ...arr(notCast).map((n) => str(n).toLowerCase()), ...arr(dash && dash.removed).map((n) => str(n).toLowerCase())]);
  const userNames = new Set();
  if (meta && str(meta.userName)) userNames.add(str(meta.userName).toLowerCase());
  for (let i = scene.fromIdx; i <= scene.toIdx; i++) if (line[i] && line[i].role === "user" && str(line[i].name)) userNames.add(str(line[i].name).toLowerCase());
  const seen = new Set();
  const out = [];
  for (const n of sceneNames(scene, line, dash, meta)) {
    const key = str(n).toLowerCase();
    if (!key || skip.has(key) || userNames.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(str(n));
  }
  return out;
}

/** item 6: returns the request object for host.llm.request. */
/** M4d: words in a text (letters and digits between spaces), for the chapter size check. */
export function wordCount(text) {
  return String(text || "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** The words of the messages a scene covers. */
export function sceneWords(line, scene) {
  let n = 0;
  for (let i = scene.fromIdx; i <= scene.toIdx && i < line.length; i++) n += wordCount(line[i] && line[i].text);
  return n;
}

/** M4d: a chapter longer than the messages it replaces saves nothing; retried once at a third of their words. */
export function sizeLimit(line, scene) {
  return Math.max(20, Math.ceil(sceneWords(line, scene) / 3));
}

/** The story as the model reads it. A preset hides blocks of a reply (a plan, an inner voice, a log) with prompt-only
 *  regex scripts that delete them; a cut of a reply must not spend its characters on those. Returns (text, role) -> text
 *  for one chat. Only scripts that replace a match with nothing are run (no macros, no depth limits), the stored text
 *  never changes. */
export function storyView(fsx, meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  const chars = [m.characterId, ...(Array.isArray(m.characterIds) ? m.characterIds : [])].filter(Boolean);
  const inScope = (s) => {
    const sc = s.scope || "global";
    if (sc === "global") return true;
    if (!s.scopeTargetId) return false;
    if (sc === "chat") return s.scopeTargetId === m.id;
    if (sc === "character") return chars.includes(s.scopeTargetId);
    if (sc === "preset") return s.scopeTargetId === (m.presetId || "default");
    return false;
  };
  // the prompt stage: a script with the promptOnly flag, or one saved before the flags that listed "prompt"
  const forPrompt = (s) => {
    if (typeof s.promptOnly === "boolean" || typeof s.markdownOnly === "boolean") return s.promptOnly === true;
    const pl = Array.isArray(s.placement) ? s.placement : [];
    return !pl.includes("display") || pl.includes("prompt");
  };
  const wheres = (s) => (Array.isArray(s.placement) ? s.placement : []);
  let found = [];
  try {
    found = fsx.list("regex").filter((f) => f.endsWith(".json")).map((f) => {
      try { return JSON.parse(fsx.read("regex/" + f)); } catch { return null; }
    }).filter(Boolean);
  } catch { return (text) => text; }
  const compiled = [];
  for (const s of found) {
    if (s.disabled || !inScope(s) || !forPrompt(s)) continue;
    if (String(s.replaceString ?? "") !== "" || (s.macroMode && s.macroMode !== "none")) continue;
    if ((s.minDepth != null && s.minDepth >= 0) || (s.maxDepth != null && s.maxDepth >= 0)) continue;
    const find = String(s.findRegex ?? "");
    if (!find || find.length > 500) continue;
    try { compiled.push({ re: new RegExp(find, s.flags || "g"), where: wheres(s) }); } catch {}
  }
  if (!compiled.length) return (text) => text;
  return (text, role) => {
    const place = role === "user" ? "user_input" : "ai_output";
    let out = String(text).slice(0, 20000);
    for (const c of compiled) {
      if (c.where.length && !c.where.includes(place)) continue;
      c.re.lastIndex = 0;
      out = out.replace(c.re, "");
    }
    return out;
  };
}

export function buildWorkerRequest(st, work, line, dash, cfg, meta, opts = {}) {
  const scene = work.scene;
  const model = cfg.model && str(cfg.model) ? str(cfg.model) : meta && meta.model ? meta.model : "";
  const parts = [];

  // Previous chapter
  const prevCh = st.chapters.filter((c) => {
    const r = rangeOf(c, line);
    return !r.orphan && r.toIdx < scene.fromIdx;
  }).sort((a, b) => rangeOf(b, line).toIdx - rangeOf(a, line).toIdx)[0];
  if (prevCh) parts.push("Previous chapter\n" + prevCh.text);

  // Known facts
  const names = sceneNames(scene, line, dash, meta);
  const nameSet = new Set(names.map((n) => n.toLowerCase()));
  const activeFacts = st.facts.filter((f) => {
    if (f.status !== "active") return false;
    const subj = str(f.subject).toLowerCase();
    if (subj === "world") return true;
    if (nameSet.has(subj)) return true;
    if (f.knownBy === "all") return false;
    if (Array.isArray(f.knownBy)) {
      return f.knownBy.some((k) => nameSet.has(str(k).toLowerCase()));
    }
    return false;
  });
  activeFacts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const factLines = activeFacts.slice(0, 40).map((f) => f.id + ": " + f.text);
  if (factLines.length) parts.push("Known facts\n" + factLines.join("\n"));

  // Scene messages
  const msgLines = [];
  for (let i = scene.fromIdx; i <= scene.toIdx; i++) {
    const m = line[i];
    const name = m.role === "user" ? meta && meta.userName ? meta.userName : m.name : m.name || "Character";
    const text = cut(opts.view ? opts.view(String(m.text), m.role) : m.text, 1500);
    if (text) msgLines.push("[" + name + "] " + text);
  }
  // #99: who could remember this scene on their own, when there are two or more
  const cast = cfg.recollections !== false ? sceneCast(scene, line, dash, meta, opts.notCast) : [];
  const viewsOn = cast.length >= 2;
  if (viewsOn) parts.push("Characters\n" + cast.map((n) => "- " + n).join("\n"));
  parts.push("Scene messages\n" + msgLines.join("\n"));

  const habitsOn = cfg.habits !== false;
  if (habitsOn) {
    const known = (st.habits || [])
      .filter((k) => k.status !== "rejected" && nameSet.has(str(k.who).toLowerCase()))
      .slice(0, 12)
      .map((k) => k.id + ": " + k.who + " - " + k.name + ": " + str(k.rule).split("\n").join(" "));
    if (known.length) parts.splice(parts.length - 1, 0, "Known habits\n" + known.join("\n"));
  }
  const userText = parts.join("\n\n");
  // #178: only when there is a known fact to point at
  const causesOn = cfg.causes !== false && factLines.length > 0;
  const base = causesOn ? WORKER_SHAPE.replace('"weight":"everyday|important|key"}', '"weight":"everyday|important|key"' + CAUSE_SHAPE + "}") : WORKER_SHAPE;
  const shape = base.replace(/\}$/, (habitsOn ? HABITS_SHAPE : "") + (viewsOn ? RECOLLECTIONS_SHAPE : "") + "}");
  let systemPrompt = (cfg.chapter || DEFAULT_PROMPTS.chapter) + (habitsOn ? "\n\n" + HABITS_RULE : "") + (causesOn ? "\n\n" + CAUSE_RULE : "") + (viewsOn ? "\n\n" + RECOLLECTIONS_RULE : "") + "\n\nOutput shape\n" + shape;
  // the reader set this scene apart by hand: say why it is its own chapter
  if (scene.marked) systemPrompt += "\n\nThe reader marked this scene as important, a turning point. Keep what happened, who did what, and what changed for the characters because of it, even though the scene is short.";
  // the first answer retold the scene at full length: ask again, shorter
  if (opts.maxWords) systemPrompt += "\n\nSize: the chapter text must be at most " + opts.maxWords + " words, far shorter than the messages. Keep only the consequences.";

  const req = {
    systemPrompt,
    messages: [{ role: "user", content: userText }],
    presetParams: { temperature: 0.3, max_tokens: 2000 },
  };
  if (model) req.model = model;
  // NEVER set a reasoning field (reasoning stays off)
  return req;
}

// ---------- M3b insert: the Litopys block before each reply ----------
// The lexical ranking below is ported from relations rankNotes (plugins/relations/plugin.js):
// rare-word matches weighted by ln(1 + N / df), stems by the relations stemmer,
// with weight bonus: key +6, important +3, everyday 0. Chapters score on label + text.
const WORD_APOS_M3B = /['\u2019\u02BC\u2018`\u00B4\u02B9\u2032]/g;
const WORD_STOP_M3B = new Set(
  (
    "the and for are but not you all any can had her was his that this with have " +
    "from they them then than there here what when where which while who whom will your into upon over under " +
    "again once only very just also been being because both each more most other some such too own same about " +
    "after before between during through above below off out up down further she him hers its our ours " +
    "their theirs myself yourself himself herself itself ourselves themselves " +
    "\u0456 \u0439 \u0442\u0430 \u0430 \u0430\u043B\u0435 \u0430\u0431\u043E \u0449\u043E \u0446\u0435 \u044F\u043A \u0442\u0430\u043A \u043D\u0435 \u043D\u0456 \u0436 \u0436\u0435 \u0431\u0438 \u0431 \u0431\u043E \u0432 \u0443 \u043D\u0430 \u0434\u043E \u0437 \u0456\u0437 \u0437\u0456 \u0437\u0430 \u0432\u0456\u0434 \u0434\u043B\u044F \u043F\u043E \u043F\u0440\u043E \u043F\u0440\u0438 \u043F\u0456\u0434 \u043D\u0430\u0434 \u043C\u0456\u0436 \u0447\u0435\u0440\u0435\u0437 \u0449\u043E\u0431 " +
    "\u043A\u043E\u043B\u0438 \u0434\u0435 \u0442\u0430\u043C \u0442\u0443\u0442 \u0432\u0436\u0435 \u0449\u0435 \u0442\u0435\u0436 \u0442\u0430\u043A\u043E\u0436 \u043B\u0438\u0448\u0435 \u0442\u0456\u043B\u044C\u043A\u0438 \u0434\u0443\u0436\u0435 \u0439\u043E\u0433\u043E \u0457\u0457 \u0457\u0445 \u0457\u0439 \u0439\u043E\u043C\u0443 \u0432\u0456\u043D \u0432\u043E\u043D\u0430 \u0432\u043E\u043D\u043E \u0432\u043E\u043D\u0438 \u043C\u0438 \u0432\u0438 \u044F \u0442\u0438 \u043C\u0435\u043D\u0435 \u0442\u0435\u0431\u0435 \u0441\u0435\u0431\u0435 " +
    "\u043C\u0456\u0439 \u043C\u043E\u044F \u043C\u043E\u0454 \u043C\u043E\u0457 \u0442\u0432\u0456\u0439 \u0442\u0432\u043E\u044F \u0441\u0432\u0456\u0439 \u0441\u0432\u043E\u044F \u0446\u0435\u0439 \u0446\u044F \u0446\u0456 \u0442\u043E\u0439 \u0442\u0435 \u0431\u0443\u0432 \u0431\u0443\u043B\u0430 \u0431\u0443\u043B\u043E \u0431\u0443\u043B\u0438 \u0454 \u0431\u0443\u0434\u0435 \u0431\u0443\u0442\u0438 \u043C\u043E\u0436\u0435 \u0442\u0440\u0435\u0431\u0430 " +
    "\u0438 \u0432\u043E \u0447\u0442\u043E \u043E\u043D \u043E\u043D\u0430 \u043E\u043D\u043E \u043E\u043D\u0438 \u0441 \u0441\u043E \u043A\u0430\u043A \u0442\u043E \u0432\u0441\u0435 \u0442\u0430\u043A \u0435\u0433\u043E \u0435\u0435 \u043D\u043E \u0434\u0430 \u043A \u0432\u044B \u0431\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043C\u043D\u0435 \u0432\u043E\u0442 \u043E\u0442 \u043C\u0435\u043D\u044F \u0435\u0449\u0435 \u043D\u0435\u0442 \u043E \u0438\u0437 \u0435\u043C\u0443 \u043A\u043E\u0433\u0434\u0430 \u0434\u0430\u0436\u0435 " +
    "\u043D\u0443 \u043B\u0438 \u0435\u0441\u043B\u0438 \u0443\u0436\u0435 \u0438\u043B\u0438 \u043D\u0438 \u0431\u044B\u0442\u044C \u0431\u044B\u043B \u043D\u0435\u0433\u043E \u0432\u0430\u0441 \u0432\u0435\u0434\u044C \u043F\u043E\u0442\u043E\u043C \u0441\u0435\u0431\u044F \u043D\u0438\u0447\u0435\u0433\u043E \u0435\u0439 \u0442\u0443\u0442 \u0433\u0434\u0435 \u0435\u0441\u0442\u044C \u043D\u0430\u0434\u043E \u043D\u0435\u0439 \u043C\u044B \u0442\u0435\u0431\u044F \u0447\u0435\u043C \u0441\u0430\u043C \u0431\u0435\u0437 " +
    "\u0447\u0435\u0433\u043E \u0440\u0430\u0437 \u0442\u043E\u0436\u0435 \u043F\u043E\u0434 \u043A\u0442\u043E \u044D\u0442\u043E\u0442 \u0442\u043E\u0433\u043E \u043F\u043E\u0442\u043E\u043C\u0443 \u044D\u0442\u043E\u0433\u043E \u043A\u0430\u043A\u043E\u0439 \u0437\u0434\u0435\u0441\u044C \u044D\u0442\u043E\u043C \u043C\u043E\u0439 \u0442\u0435\u043C \u0447\u0442\u043E\u0431\u044B \u0441\u0435\u0439\u0447\u0430\u0441"
  ).split(" "),
);
function normTextM3b(s) {
  return String(s).normalize("NFD").replace(/\u0301/g, "").normalize("NFC").toLowerCase().replace(WORD_APOS_M3B, "'").replace(/\u0451/g, "\u0435");
}
export function wordTokensM3b(s) {
  return normTextM3b(s)
    .split(/[^\p{L}\p{N}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t && !WORD_STOP_M3B.has(t));
}
const WORD_SUFFIX_M3B = /(\u0430\u043C\u0438|\u044F\u043C\u0438|\u043E\u0432\u0456|\u0435\u0432\u0456|\u043E\u0433\u043E|\u043E\u043C\u0443|\u0438\u043C\u0438|\u0435\u043C\u0443|\u0456\u0439|\u043E\u0457|\u043E\u044E|\u0435\u044E|\u044F\u0445|\u0430\u0445|\u0456\u0432|\u044F\u043C|\u0430\u043C|\u043E\u043C|\u0435\u043C|\u0438\u043C|\u0438\u0445|\u0438\u0439|\u044B\u0439|\u0430\u044F|\u044F\u044F|\u043E\u0435|\u0435\u0435|\u0443\u044E|\u044E\u044E|\u043E\u0432|\u0435\u0432|\u0435\u0439|\u044B|\u0438|\u0456|\u0430|\u044F|\u0443|\u044E|\u043E|\u0435|\u044C|\u0439)$/;
function wordStemM3b(t) {
  if (t.length <= 3) return t;
  const r = t.replace(WORD_SUFFIX_M3B, "");
  return r.length >= 3 ? r : t;
}
/** Two words are the same: short ones exactly, longer ones by stem (ported from relations). */
export function sameWordM3b(a, b) {
  if (a.length <= 3 || b.length <= 3) return a === b;
  const x = wordStemM3b(a);
  const y = wordStemM3b(b);
  if (x === y) return true;
  const [sh, lg] = x.length <= y.length ? [x, y] : [y, x];
  return sh.length >= 4 && lg.startsWith(sh) && lg.length - sh.length <= 2;
}
/**
 * `(word) => scan.some((w) => sameWordM3b(word, w))` with the scan indexed once (as relations
 * sceneMatcher): many facts against a long scan ran the insert hook past the script time limit.
 */
export function scanMatcherM3b(scanWords) {
  const exact = new Set(scanWords);
  const stems = new Set();
  const prefixes = new Set();
  for (const w of exact) {
    if (w.length <= 3) continue;
    const y = wordStemM3b(w);
    stems.add(y);
    for (const cut of [1, 2]) if (y.length - cut >= 4) prefixes.add(y.slice(0, y.length - cut));
  }
  return (word) => {
    if (word.length <= 3) return exact.has(word);
    const x = wordStemM3b(word);
    if (stems.has(x) || prefixes.has(x)) return true;
    for (const cut of [1, 2]) if (x.length - cut >= 4 && stems.has(x.slice(0, x.length - cut))) return true;
    return false;
  };
}
const weightBonus = (f) => (f && f.weight === "key" ? 6 : f && f.weight === "important" ? 3 : 0);
/** A fact's lexical score against the scan text (ported from relations rankNotes plus weight bonus). */
function factScore(f, scan, inScan, df, n) {
  const keys = wordTokensM3b(str(f.text));
  let score = weightBonus(f);
  if (scan.length) {
    for (const k of keys) {
      if (inScan(k)) {
        score += 10 * Math.log(1 + n / (df.get(wordStemM3b(k)) || 1));
      }
    }
  }
  return score;
}
/** Turns for a fact's recency to fall to about a third; see factRecency. */
const RECENCY_SPAN = 40;
/** How many uses count toward the use bonus. */
const USE_CAP = 5;
/**
 * #50: a ranking factor in 0.5-1.2 from how lately a fact was written or surfaced in a prompt and
 * how often it was used. `written` and `lastUsed` are turns (line positions), `uses` a count.
 * A fact with no known turn (written by hand, migrated) gets 1: it ranks as before.
 */
export function factRecency({ written, lastUsed, uses }, turn) {
  const seen = Math.max(Number.isFinite(written) ? written : -1, Number.isFinite(lastUsed) ? lastUsed : -1);
  if (seen < 0) return 1;
  const age = Math.max(0, turn - seen);
  const used = Math.min(USE_CAP, Math.max(0, Number(uses) || 0)) / USE_CAP;
  return 0.5 + 0.5 * Math.exp(-age / RECENCY_SPAN) + 0.2 * used;
}
/** Cosine of two vectors; null on a shape mismatch, a non-number or a zero vector. */
export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? null : dot / Math.sqrt(na * nb);
}
/** What a standard deviation above the pool's mean cosine adds to a score; about one rare word hit. */
const SEM_WEIGHT = 12;
/** Past this many deviations a match adds no more. */
const SEM_Z_CAP = 3;
/** Fewest items with a vector for the pool's mean and spread to mean anything. */
const SEM_MIN_POOL = 4;
/**
 * Wave 2: a score bonus per item from how close its vector lies to the scan window's. Cosines are
 * compared inside the pool, not against a fixed line, because models differ in what "unrelated"
 * scores (0.1 for one, 0.75 for another); only items above the pool's mean get a bonus, so the
 * words still decide when the vectors say nothing. `sem` is `{ vec, of(item) -> vector | null }`;
 * no `sem`, a pool of fewer than SEM_MIN_POOL, or equal cosines: no bonus, ranking is by words alone.
 */
export function semanticBonuses(items, sem) {
  const out = new Map();
  if (!sem || !Array.isArray(sem.vec) || !sem.vec.length) return out;
  const cos = [];
  for (const it of items) {
    const v = sem.of(it);
    const c = v ? cosine(v, sem.vec) : null;
    if (c !== null) cos.push([it, c]);
  }
  if (cos.length < SEM_MIN_POOL) return out;
  const mean = cos.reduce((t, [, c]) => t + c, 0) / cos.length;
  const sd = Math.sqrt(cos.reduce((t, [, c]) => t + (c - mean) * (c - mean), 0) / cos.length);
  if (!(sd > 1e-6)) return out;
  for (const [it, c] of cos) {
    const z = (c - mean) / sd;
    if (z > 0) out.set(it, SEM_WEIGHT * Math.min(SEM_Z_CAP, z));
  }
  return out;
}
/** A stored vector, when it is still of the text it was made from (an edited fact's old vector is not). */
function vectorOf(vectors, id, text) {
  const e = isObj(vectors) ? vectors[id] : null;
  return isObj(e) && e.hash === fnv1a(text) && Array.isArray(e.vector) ? e.vector : null;
}
/** An arc has no vector of its own: it takes the vector of the member chapter nearest to the scan window. */
export function bestMemberVector(members, vectors, scanVec) {
  let best = null;
  let bestCos = -2;
  for (const c of arr(members).filter(isObj)) {
    const v = vectorOf(vectors, c.id, str(c.text));
    const k = v ? cosine(v, scanVec) : null;
    if (k !== null && k > bestCos) {
      bestCos = k;
      best = v;
    }
  }
  return best;
}
// ---------- recall scoring: names, phrases, words the chat uses all the time (#99 piece 3) ----------
/** A name found in the text counts this much more than a plain word of the same rarity. */
const NAME_WEIGHT = 1.6;
/** Two content words in a row that the scan also has in a row add this share of their own weights again. */
const PHRASE_SHARE = 0.5;
/** A word that every message of the chat uses weighs 1 / (1 + FREQ_K) of what it would. */
const FREQ_K = 3;
/** Fewest messages for the chat's own word counts to mean anything, and how many of the newest are read. */
const FREQ_MIN_MSGS = 20;
const FREQ_WINDOW = 200;

/**
 * How many of the chat's newest messages use a word (by stem): `share(stem)` in 0..1, or null when the chat is too
 * short to say. Words like "door" or "said" that every scene has tell nothing about which fact matters now.
 */
export function chatWordShare(line) {
  const msgs = arr(line).filter((m) => isObj(m) && str(m.text)).slice(-FREQ_WINDOW);
  if (msgs.length < FREQ_MIN_MSGS) return null;
  const count = new Map();
  for (const m of msgs) {
    for (const w of new Set(wordTokensM3b(str(m.text)).map(wordStemM3b))) count.set(w, (count.get(w) || 0) + 1);
  }
  return (stem) => (count.get(stem) || 0) / msgs.length;
}

/** The stems of the names in a text: a capitalised word that does not open a sentence, and the given names (a fact's subject, who knows it). */
function nameStems(text, given) {
  const out = new Set();
  const add = (w) => {
    const t = wordTokensM3b(w)[0];
    if (t) out.add(wordStemM3b(t));
  };
  const src = String(text);
  for (const m of src.matchAll(/\p{L}[\p{L}'’]*/gu)) {
    const w = m[0];
    if (w.length < 3 || w === w.toLowerCase() || w === w.toUpperCase()) continue;
    const before = src.slice(0, m.index).replace(/[\s"'“”«(\[*_]+$/u, "");
    if (!before || /[.!?…:;\n]$/u.test(before)) continue;
    add(w);
  }
  for (const g of arr(given)) if (str(g) && str(g).toLowerCase() !== "world" && str(g).toLowerCase() !== "all") add(str(g));
  return out;
}

/**
 * A scorer for a pool of items: `(item) => lexical score against the scan`. With no `opts` it is the old rule (a word of
 * the item that the scan has adds 10 * ln(1 + N / df), df counted inside the pool). With `opts` ({ share }): a name
 * weighs NAME_WEIGHT times more, a word the chat uses in many messages weighs less (share), and two content words
 * in a row that the scan has in a row add PHRASE_SHARE of their weights again.
 */
function lexicalScorer(list, textOf, givenOf, scanText, opts) {
  const df = new Map();
  const toks = new Map();
  for (const it of list) {
    const all = wordTokensM3b(textOf(it));
    toks.set(it, all);
    for (const w of new Set(all.map(wordStemM3b))) df.set(w, (df.get(w) || 0) + 1);
  }
  const n = Math.max(1, list.length);
  const scan = wordTokensM3b(scanText || "");
  const inScan = scanMatcherM3b(scan);
  const share = opts && typeof opts.share === "function" ? opts.share : null;
  const scanPairs = new Set();
  if (opts) for (let i = 0; i + 1 < scan.length; i++) scanPairs.add(wordStemM3b(scan[i]) + " " + wordStemM3b(scan[i + 1]));
  return (it) => {
    if (!scan.length) return 0;
    const all = toks.get(it);
    const names = opts ? nameStems(textOf(it), givenOf ? givenOf(it) : []) : null;
    const weight = (k) => {
      const stem = wordStemM3b(k);
      let w = 10 * Math.log(1 + n / (df.get(stem) || 1));
      if (opts) {
        if (names.has(stem)) w *= NAME_WEIGHT;
        if (share) w /= 1 + FREQ_K * share(stem);
      }
      return w;
    };
    let score = 0;
    for (const k of new Set(all)) if (inScan(k)) score += weight(k);
    if (opts && scanPairs.size) {
      const seen = new Set();
      for (let i = 0; i + 1 < all.length; i++) {
        const pair = wordStemM3b(all[i]) + " " + wordStemM3b(all[i + 1]);
        if (seen.has(pair) || !scanPairs.has(pair)) continue;
        seen.add(pair);
        score += PHRASE_SHARE * (weight(all[i]) + weight(all[i + 1]));
      }
    }
    return score;
  };
}

/**
 * Rank facts for group d: relevant facts, newest first on ties. `recency(f)` (optional, #50)
 * multiplies a fact's relevance; `sem` (optional, wave 2) adds the vector bonus to it; `opts` (optional, #99) is the
 * recall scoring with names, phrases and the chat's own word counts ({ share }, see lexicalScorer). Nothing here
 * changes anything on disk.
 */
export function rankFacts(facts, scanText, recency, sem, opts) {
  const list = arr(facts).filter(isObj);
  if (opts) {
    const lex = lexicalScorer(list, (f) => str(f.text), (f) => [f.subject, ...(Array.isArray(f.knownBy) ? f.knownBy : [])], scanText, opts);
    const extra = semanticBonuses(list, sem);
    return list
      .map((f) => ({ f, score: (weightBonus(f) + lex(f) + (extra.get(f) || 0)) * (recency ? recency(f) : 1) }))
      .sort((a, b) => b.score - a.score || (b.f.updatedAt || 0) - (a.f.updatedAt || 0))
      .map((x) => x.f);
  }
  const df = new Map();
  const keysMap = new Map();
  for (const f of list) {
    const ks = [...new Set(wordTokensM3b(str(f.text)))];
    keysMap.set(f, ks);
    for (const w of new Set(ks.map(wordStemM3b))) df.set(w, (df.get(w) || 0) + 1);
  }
  const n = Math.max(1, list.length);
  const scan = wordTokensM3b(scanText || "");
  const inScan = scanMatcherM3b(scan);
  const bonus = semanticBonuses(list, sem);
  return list
    .map((f) => ({ f, score: (factScore(f, scan, inScan, df, n) + (bonus.get(f) || 0)) * (recency ? recency(f) : 1) }))
    .sort((a, b) => b.score - a.score || (b.f.updatedAt || 0) - (a.f.updatedAt || 0))
    .map((x) => x.f);
}
/** Rank chapters before the cut: score on label + text (and, wave 2, the vector bonus); the bridge chapter stays first when it qualifies. */
export function rankChapters(chapters, scanText, sem, opts) {
  const list = arr(chapters).filter(isObj);
  if (opts) {
    const lex = lexicalScorer(list, (ch) => str(ch.label) + " " + str(ch.text), null, scanText, opts);
    const extra = semanticBonuses(list, sem);
    return list
      .map((ch) => ({ ch, score: lex(ch) + (extra.get(ch) || 0) }))
      .sort((a, b) => b.score - a.score || (b.ch.at || 0) - (a.ch.at || 0))
      .map((x) => x.ch);
  }
  const df = new Map();
  const keysMap = new Map();
  for (const ch of list) {
    const ks = [...new Set(wordTokensM3b(str(ch.label) + " " + str(ch.text)))];
    keysMap.set(ch, ks);
    for (const w of new Set(ks.map(wordStemM3b))) df.set(w, (df.get(w) || 0) + 1);
  }
  const n = Math.max(1, list.length);
  const scan = wordTokensM3b(scanText || "");
  const inScan = scanMatcherM3b(scan);
  const bonus = semanticBonuses(list, sem);
  const score = (ch) => {
    let s = bonus.get(ch) || 0;
    if (scan.length) {
      for (const k of keysMap.get(ch)) {
        if (inScan(k)) {
          s += 10 * Math.log(1 + n / (df.get(wordStemM3b(k)) || 1));
        }
      }
    }
    return s;
  };
  return list
    .map((ch) => ({ ch, score: score(ch) }))
    .sort((a, b) => b.score - a.score || (b.ch.at || 0) - (a.ch.at || 0))
    .map((x) => x.ch);
}

/** The fill order and text of the Litopys insert; null when nothing can be inserted. */
export function buildInsert({ st, line, dash, meta, cfg, scanText, speakerName, used, scanVec, vectors, promptCut }) {
  if (!st || !Array.isArray(line) || !line.length) return null;
  // the engine says where the last prompt's history started (null: it did not say). In "fit" mode the
  // window may have dropped more than the recent window allows: what lies before is carried here. In
  // "scenes" mode the engine's cut is the cut: a scene still in the prompt is not carried twice.
  const told = Number.isInteger(promptCut) && promptCut >= 0 ? Math.min(line.length, promptCut) : null;
  const own = cutCount(st, line, cfg);
  const cut = told === null ? own : cfg && cfg.cutMode === "scenes" ? told : Math.max(own, told);
  // who is present: the newest snapshot of the line, else the names in the recent window
  const present = new Set();
  let snapFound = false;
  for (let i = line.length - 1; i >= 0 && !snapFound; i--) {
    const snap = snapOf(dash, line[i]);
    if (snap && Array.isArray(snap.present)) {
      snapFound = true;
      for (const p of snap.present) if (str(p)) present.add(str(p));
    }
  }
  if (!snapFound) {
    for (const m of line.slice(-PRESENT_WINDOW)) if (str(m.name)) present.add(str(m.name));
  }
  if (str(speakerName)) present.add(str(speakerName));
  const userName = str(meta && meta.userName) || "You";
  present.add(userName);
  const here = new Set([...present].map((n) => n.toLowerCase()));
  const subj = (f) => str(f.subject).toLowerCase();

  const known = (f) => f.knownBy === "all" || (Array.isArray(f.knownBy) && f.knownBy.some((k) => here.has(str(k).toLowerCase())));
  const active = arr(st.facts).filter((f) => isObj(f) && f.status === "active" && str(f.text) && known(f));
  const ranges = new Map(arr(st.chapters).filter(isObj).map((ch) => [ch.id, rangeOf(ch, line)]));
  const allBefore = chaptersBeforeCut(st, line, cut);
  if (!active.length && !allBefore.length) return null;
  // M4d: a fresh arc whose chapters all left the prompt rides in their place, never beside them
  const beforeIds = new Set(allBefore.map((ch) => ch.id));
  const arcs = freshArcs(st).filter((a) => a.chapterIds.every((id) => beforeIds.has(id)));
  const held = new Set(arcs.flatMap((a) => a.chapterIds));
  for (const a of arcs) ranges.set(a.id, { fromIdx: Math.min(...a.chapterIds.map((id) => ranges.get(id).fromIdx)), toIdx: Math.max(...a.chapterIds.map((id) => ranges.get(id).toIdx)) });
  const beforeCut = allBefore.filter((ch) => !held.has(ch.id));

  // fill order: a) pinned facts of present characters or the world, b) change/trait of present
  // characters, c) the last chapter before the cut, d) other facts by relevance, e) other chapters
  const a = active.filter((f) => f.pinned === true && (subj(f) === "world" || here.has(subj(f))));
  const b = active.filter((f) => !a.includes(f) && (f.type === "change" || f.type === "trait") && here.has(subj(f)));
  const bridge = beforeCut.slice().sort((x, y) => ranges.get(y.id).toIdx - ranges.get(x.id).toIdx)[0] || null;
  const stillSeen = (f) => {
    // a fact whose chapter lies wholly after the cut: its messages are still in the prompt
    const r = f.src && f.src.chapter ? ranges.get(f.src.chapter) : null;
    return !!(r && !r.orphan && r.fromIdx >= cut);
  };
  // #50: recent and used facts rank a little higher; `used` is the insert file's record
  const pos = new Map(line.map((m, i) => [m.id, i]));
  const writtenAt = (f) => {
    const src = isObj(f.src) ? f.src : {};
    if (pos.has(src.to)) return pos.get(src.to);
    const r = src.chapter ? ranges.get(src.chapter) : null;
    return r && !r.orphan ? r.toIdx : undefined;
  };
  const usedBy = isObj(used) ? used : {};
  const recency = (f) => {
    const u = isObj(usedBy[f.id]) ? usedBy[f.id] : {};
    return factRecency({ written: writtenAt(f), lastUsed: Number(u.turn), uses: u.n }, line.length);
  };
  const rest = active.filter((f) => !a.includes(f) && !b.includes(f) && !stillSeen(f));
  // wave 2: when the engine embedded the scan window and Litopys holds vectors, meaning counts beside words;
  // an arc has no vector of its own: it takes the best of its chapters'
  const useVec = Array.isArray(scanVec) && scanVec.length > 0 && isObj(vectors);
  const factSem = useVec && { vec: scanVec, of: (f) => vectorOf(vectors, f.id, str(f.text)) };
  const chapterVec = (ch) => (arcs.includes(ch) ? bestMemberVector(arr(ch.chapterIds).map((id) => allBefore.find((c) => c.id === id)), vectors, scanVec) : vectorOf(vectors, ch.id, str(ch.text)));
  const chapterSem = useVec && { vec: scanVec, of: chapterVec };
  // #99: names, phrases and the chat's own word counts weigh in, unless the hand-edited key asks for the old rule
  const recall = cfg && cfg.recallScoring === "words" ? null : { share: chatWordShare(line) };
  const d = rankFacts(rest, scanText, recency, factSem, recall);
  const e = rankChapters([...beforeCut.filter((ch) => ch !== bridge), ...arcs], scanText, chapterSem, recall).slice(0, CHAPTERS_MAX);

  // Two blocks, for the provider's prompt cache: the bridge chapter changes only when a chapter
  // closes (the history above it changes then too), so it rides above the history; facts and the
  // chapters picked by relevance change every reply, so they ride after the newest turn.
  const headHeader = "[Story record (Litopys): what happened just before the messages below. " + (cfg.remembers || REMEMBERS) + "]";
  const tailHeader = "[Story record (Litopys): earlier chapters and what stays true. " + (cfg.remembers || REMEMBERS) + "]";
  const factLine = (f) => "- " + str(f.text) + (Array.isArray(f.knownBy) && f.knownBy.length ? " (known to: " + f.knownBy.join(", ") + ")" : "");
  const chapterLine = (ch) => "- " + (str(ch.label) ? str(ch.label) + ": " : "") + str(ch.text);
  const budget = clamp(cfg && cfg.budget, 200, BUDGET_MAX);
  const byStory = (list) => list.slice().sort((x, y) => ranges.get(x.id).fromIdx - ranges.get(y.id).fromIdx);
  const arcsOf = (list) => list.filter((x) => arcs.includes(x)).length;
  const result = (facts, chapters, head, tail, full) => {
    const text = [head, tail].filter(Boolean).join("\n\n");
    return { text, head, tail, tokens: estimateTokens(text), facts: facts.length, chapters: chapters.length - arcsOf(chapters), arcs: arcsOf(chapters), cut, full, factIds: facts.map((f) => f.id) };
  };

  // Full record: when everything known fits, none of it is ranked away. The chapters (the fresh arcs in
  // place of their chapters) ride above the history in story order, so the head holds the same text until
  // the next chapter closes; the facts ride in the tail.
  const allChapters = byStory([...beforeCut, ...arcs]);
  const allFacts = [...a, ...b, ...d];
  const fullHead = allChapters.length ? ["[Story record (Litopys): the story so far, up to the messages below. " + (cfg.remembers || REMEMBERS) + "]", ...allChapters.map(chapterLine)].join("\n") : "";
  const fullTail = allFacts.length ? ["[Story record (Litopys): what stays true. " + (cfg.remembers || REMEMBERS) + "]", "Facts:", ...allFacts.map(factLine)].join("\n") : "";
  if (estimateTokens([fullHead, fullTail].filter(Boolean).join("\n\n")) <= budget) return result(allFacts, allChapters, fullHead, fullTail, true);

  // Ranked: each item goes in whole or not at all; a group stops at its first item that does not fit
  const facts = [];
  const chapters = [];
  const renderHead = () => (bridge && chapters.includes(bridge) ? [headHeader, chapterLine(bridge)].join("\n") : "");
  const renderTail = () => {
    const others = chapters.filter((ch) => ch !== bridge);
    if (!others.length && !facts.length) return "";
    const out = [tailHeader];
    if (others.length) out.push("Earlier chapters:", ...byStory(others).map(chapterLine));
    if (facts.length) out.push("Facts:", ...facts.map(factLine));
    return out.join("\n");
  };
  const render = () => [renderHead(), renderTail()].filter(Boolean).join("\n\n");
  /** Adds items from `from` on while the whole insert stays within `limit`; returns where it stopped. */
  const fill = (list, items, from, limit) => {
    let i = from;
    for (; i < items.length; i++) {
      list.push(items[i]);
      if (estimateTokens(render()) <= limit) continue;
      list.pop();
      break;
    }
    return i;
  };
  fill(facts, a, 0, budget);
  fill(facts, b, 0, budget);
  if (bridge) fill(chapters, [bridge], 0, budget);
  // chapters and arcs are held a share of what is left (when both kinds exist); what one leaves unused the other takes
  const left = budget - estimateTokens(render());
  const factLimit = d.length && e.length ? budget - Math.ceil(CHAPTER_SHARE * Math.max(0, left)) : budget;
  const next = fill(facts, d, 0, factLimit);
  fill(chapters, e, 0, budget);
  fill(facts, d, next, budget);
  if (!facts.length && !chapters.length) return null;
  // #178: an effect that was picked brings its cause, right after it, when the cause is active, not already in the
  // prompt and still fits. This runs after everything else is placed, so it only ever uses what was left over:
  // it can never push out a fact that ranked on its own. One step only (a cause's own cause is not followed).
  const causes = { pulled: 0, missed: 0, together: 0 };
  if (!cfg || cfg.causes !== false) {
    const byId = new Map(active.map((f) => [f.id, f]));
    for (const effect of facts.slice()) {
      const cause = effect.because ? byId.get(effect.because) : null;
      if (!cause || cause === effect || stillSeen(cause)) continue;
      if (facts.includes(cause)) {
        causes.together++;
        continue;
      }
      facts.splice(facts.indexOf(effect) + 1, 0, cause);
      if (estimateTokens(render()) <= budget) causes.pulled++;
      else {
        facts.splice(facts.indexOf(cause), 1);
        causes.missed++;
      }
    }
  }
  return { ...result(facts, chapters, renderHead(), renderTail(), false), causes };
}

/**
 * #178, the measurement: what causes did in this reply (`causes`: pulled in after their effect, missed because they did
 * not fit, already there beside it) and the running total over the replies of the chat (`causeStats`), for the
 * insert file. Nothing when the chat has no link in its insert (and none counted before), so a chat without
 * causes gets no new keys.
 */
export function causeRecord(prev, insert) {
  const c = insert && isObj(insert.causes) ? insert.causes : null;
  const before = isObj(prev) && isObj(prev.causeStats) ? prev.causeStats : null;
  const now = c && (c.pulled || c.missed || c.together) ? c : null;
  if (!now && !before) return {};
  const n = (v) => Math.max(0, Number(v) || 0);
  const total = {
    replies: n(before && before.replies) + (now ? 1 : 0),
    pulled: n(before && before.pulled) + (now ? now.pulled : 0),
    missed: n(before && before.missed) + (now ? now.missed : 0),
    together: n(before && before.together) + (now ? now.together : 0),
  };
  return { causes: now ? { pulled: now.pulled, missed: now.missed, together: now.together } : { pulled: 0, missed: 0, together: 0 }, causeStats: total };
}

/** Most facts the insert file keeps a use record for: the most recently used win. */
const USED_KEEP = 500;
/** The insert file's use record after a prompt included `factIds` at `turn` (#50). */
export function markUsed(used, factIds, turn) {
  const next = { ...(isObj(used) ? used : {}) };
  for (const id of arr(factIds)) {
    if (!str(id)) continue;
    const u = isObj(next[id]) ? next[id] : {};
    next[id] = { n: Math.min(USE_CAP, (Number(u.n) || 0) + 1), turn };
  }
  const ids = Object.keys(next);
  if (ids.length <= USED_KEEP) return next;
  const keep = ids.sort((x, y) => (Number(next[y].turn) || 0) - (Number(next[x].turn) || 0)).slice(0, USED_KEEP);
  return Object.fromEntries(keep.map((id) => [id, next[id]]));
}

/** Insert one system message after the leading system block (ported from relations withInsert). */
// the line a preset puts right before the story starts ("[Start a new chat]"): memory belongs above it
const CHAT_START_MARK = /^\[?\s*start a new (chat|story|roleplay|scene)\s*\]?$/i;
function withInsert(messages, text) {
  let lead = 0;
  while (lead < messages.length && messages[lead] && messages[lead].role === "system") lead++;
  let at = lead;
  while (at > 0 && typeof messages[at - 1].content === "string" && CHAT_START_MARK.test(messages[at - 1].content.trim())) at--;
  return [...messages.slice(0, at), { role: "system", content: text }, ...messages.slice(at)];
}

/**
 * Insert one system message just before the newest turn (the user's line, or the reply that
 * Continue extends): what changes every reply goes below the history, so the provider's prompt
 * cache keeps the history above it, and the user's line stays last for the notes that end it.
 * (The dashboard plugin carries the same function.)
 */
function withTailInsert(messages, text) {
  let last = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role !== "system") {
      last = i;
      break;
    }
  }
  if (last < 0) return [...messages, { role: "system", content: text }];
  return [...messages.slice(0, last), { role: "system", content: text }, ...messages.slice(last)];
}

/** M3b item 3: read files, build the insert, insert the block, write st.lastInsert. */
export function llmRequest(ctx, host) {
  if (!ctx || ctx.key !== "reply" || !ctx.turn) return null;
  if (ctx.turn.op === "impersonate") return null;
  const chatId = str(ctx.turn.chatId);
  if (!SAFE_CHAT_ID.test(chatId)) return null;
  const req = ctx.request || {};
  if (!Array.isArray(req.messages)) return null;
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx) return null;
  const offForChat = (fsx, chatId, key) => {
    const m = readJson(fsx, "chats/" + chatId + ".meta.json", null);
    const off = m && m.promptBoard && Array.isArray(m.promptBoard.off) ? m.promptBoard.off : [];
    // the habits switch was "plugin:cardskills" until 4.67.0
    return off.includes(key) || (key === "plugin:cardhabits" && off.includes("plugin:cardskills"));
  };
  // the Litopys switch does not take the card's own memory with it: that one has its own (plugin:cardmemory)
  const litOff = offForChat(fsx, chatId, "plugin:litopys");
  // persona and world memory are the chat's own opt-in (meta.memory.persona / .world), muted by their own switches
  const takenIn = (kind) => {
    const m = readJson(fsx, "chats/" + chatId + ".meta.json", null);
    return !!(m && isObj(m.memory) && m.memory[kind] === true) && !offForChat(fsx, chatId, kind === "persona" ? "plugin:personamemory" : "plugin:worldmemory");
  };
  const takesPersona = takenIn("persona");
  const takesWorld = takenIn("world");
  if (litOff && offForChat(fsx, chatId, "plugin:cardmemory") && offForChat(fsx, chatId, "plugin:cardhabits") && !takesPersona && !takesWorld) return null;
  try {
    const cfg = loadConfig(fsx);
    if (cfg.enabled === false || cfg.insert === false) return null;
    const rc = readChat(fsx, chatId);
    if (!rc) return null;
    const line = activeLine(rc.msgs);
    const speakerName = str(ctx.turn.speakerName);
    // a chat that continues an earlier one gets its story from the first reply on, with or without a record of its own
    const back = litOff ? null : buildBackstory({ fsx, chatId, line, meta: rc.meta, cfg, speakerName });
    const st = litOff ? null : loadChatFile(fsx, chatId);
    const scanText = req.messages
      .filter((m) => m && m.role !== "system" && typeof m.content === "string")
      .slice(-6)
      .map((m) => m.content)
      .join("\n");
    // the use record (#50) lives in the insert file: one write per reply, gone with the chat
    const prevInsert = litOff ? null : readJson(fsx, INSERT_DIR + chatId + ".json", null);
    const used = isObj(prevInsert) && isObj(prevInsert.used) ? prevInsert.used : {};
    // wave 2: the engine embedded the scan window (ctx.turn.scanVec); Litopys ranks by it too when it holds vectors
    // Auto memory size: a share of the model's context window (the engine says it in the turn labels)
    const autoSize = cfg.budgetMode === "auto" ? autoBudget(ctx.turn.contextTokens) : null;
    const sizedCfg = autoSize ? { ...cfg, budget: autoSize } : cfg;
    const scanVec = Array.isArray(ctx.turn.scanVec) && ctx.turn.scanVec.length ? ctx.turn.scanVec : null;
    const vectors = scanVec && st ? loadVectors(fsx, chatId) : null;
    const insert = !litOff && st && line.length ? buildInsert({ st, line, dash: readDash(fsx, chatId), meta: rc.meta, cfg: sizedCfg, scanText, speakerName, used, scanVec, vectors, promptCut: promptCutOf(fsx, chatId, line) }) : null;
    // the card's long memory: after what the story and the Dashboard already say, so it never says it twice
    // Only what does not change from reply to reply is compared with: the blocks sit above the history
    // (like the backstory), so a text that moved with the scene or the Dashboard would break the provider's
    // prompt cache every turn. The story so far is stable between chapters; the per-reply tail is not used.
    const stable = [insert && insert.head].filter(Boolean).flatMap((t) => String(t).split("\n"));
    let cardMem = null;
    if (!offForChat(fsx, chatId, "plugin:cardmemory")) {
      try {
        cardMem = cardMemoryFor({
          fsx,
          chatId,
          meta: rc.meta,
          speakerName,
          chosen: stable,
          dash: readDash(fsx, chatId),
          cfg,
        });
      } catch (e) {
        try {
          host.log("litopys card memory: " + (e && e.message ? e.message : String(e)));
        } catch {}
      }
    }
    // the player's character and the world, when this chat took their memory in: after the character's own, so a line
    // the card memory already carries is not said again
    const memoryOwn = (kind, taken, prior) => {
      if (!taken) return null;
      try {
        return ownerMemoryFor({ fsx, kind, chatId, meta: rc.meta, chosen: [...stable, ...prior], dash: readDash(fsx, chatId) });
      } catch (e) {
        try {
          host.log("litopys " + kind + " memory: " + (e && e.message ? e.message : String(e)));
        } catch {}
        return null;
      }
    };
    const cardLines = cardMem ? String(cardMem.text).split("\n") : [];
    const personaMem = memoryOwn("persona", takesPersona, cardLines);
    const worldMem = memoryOwn("world", takesWorld, [...cardLines, ...(personaMem ? String(personaMem.text).split("\n") : [])]);
    // what the character does, from its card's habits (#106): rules, so they need no story and no Litopys record
    let habits = null;
    if (!offForChat(fsx, chatId, "plugin:cardhabits")) {
      try {
        habits = cardHabitsFor({ fsx, chatId, meta: rc.meta, speakerName, chosen: stable });
      } catch (e) {
        try {
          host.log("litopys card habits: " + (e && e.message ? e.message : String(e)));
        } catch {}
      }
    }
    // what the characters remember of the scenes that left the prompt (#99): from the chat's own record, so it follows the Litopys switch too
    let recall = null;
    if (st && line.length && cfg.recollections !== false && !offForChat(fsx, chatId, "plugin:recollections")) {
      try {
        recall = recollectionsFor({ fsx, meta: rc.meta, st, line, cut: insert ? insert.cut : cutCount(st, line, cfg), speakerName });
      } catch (e) {
        try {
          host.log("litopys recollections: " + (e && e.message ? e.message : String(e)));
        } catch {}
      }
    }
    if (!insert && !back && !cardMem && !personaMem && !worldMem && !habits && !recall) return null;
    // never write the chat file here: the worker may be saving a chapter at the same time
    try {
      fsx.write(
        INSERT_DIR + chatId + ".json",
        JSON.stringify({
          used: insert ? markUsed(used, insert.factIds, line.length) : used,
          at: Date.now(),
          tokens: insert ? insert.tokens : 0,
          facts: insert ? insert.facts : 0,
          chapters: insert ? insert.chapters : 0,
          arcs: insert ? insert.arcs : 0,
          cut: insert ? insert.cut : 0,
          ...(insert && insert.full ? { full: true } : {}),
          ...causeRecord(prevInsert, insert),
          ...(back ? { backstory: { from: back.from, ...(back.chain ? { chain: back.chain } : {}), tokens: back.tokens, facts: back.facts, chapters: back.chapters } } : {}),
          ...(cardMem ? { cardMemory: { cardId: cardMem.cardId, tokens: cardMem.tokens, sources: cardMem.sources, dupes: cardMem.dupes } } : {}),
          ...(personaMem ? { personaMemory: { personaId: personaMem.ownerId, tokens: personaMem.tokens, sources: personaMem.sources, dupes: personaMem.dupes } } : {}),
          ...(worldMem ? { worldMemory: { worldId: worldMem.ownerId, tokens: worldMem.tokens, sources: worldMem.sources, dupes: worldMem.dupes } } : {}),
          ...(habits ? { cardHabits: { cardId: habits.cardId, tokens: habits.tokens, habits: habits.habits, dupes: habits.dupes } } : {}),
          ...(recall ? { recollections: { tokens: recall.tokens, scenes: recall.scenes, who: recall.who } } : {}),
        }),
      );
    } catch {}
    // the backstory first (it is the older story), then the chat's own record
    let messages = req.messages;
    const promptSources = { parts: [] };
    if (back) {
      messages = withInsert(messages, back.text);
      promptSources.parts.push({ kind: "memory", label: "Litopys · backstory", text: String(back.text || "").trim() });
    }
    if (cardMem) {
      messages = withInsert(messages, cardMem.text);
      promptSources.parts.push({ kind: "memory", label: "Litopys · character memory", text: String(cardMem.text).trim() });
    }
    if (personaMem) {
      messages = withInsert(messages, personaMem.text);
      promptSources.parts.push({ kind: "memory", label: "Litopys · persona memory", text: String(personaMem.text).trim() });
    }
    if (worldMem) {
      messages = withInsert(messages, worldMem.text);
      promptSources.parts.push({ kind: "memory", label: "Litopys · world memory", text: String(worldMem.text).trim() });
    }
    if (habits) {
      messages = withInsert(messages, habits.text);
      promptSources.parts.push({ kind: "memory", label: "Litopys · character habits", text: String(habits.text).trim() });
    }
    if (recall) {
      messages = withInsert(messages, recall.text);
      promptSources.parts.push({ kind: "memory", label: "Litopys · recollections", text: String(recall.text).trim() });
    }
    if (insert && insert.head) {
      messages = withInsert(messages, insert.head);
      promptSources.parts.push({ kind: "memory", label: insert.full ? "Litopys · full record, story so far" : "Litopys · story so far", text: String(insert.head).trim() });
    }
    if (insert && insert.tail) {
      messages = withTailInsert(messages, insert.tail);
      promptSources.parts.push({ kind: "memory", label: insert.full ? "Litopys · full record, facts" : "Litopys · facts and earlier chapters", text: String(insert.tail).trim() });
    }
    return { messages, ...(promptSources.parts.length ? { promptSources } : {}) };
  } catch (e) {
    try {
      host.log("litopys insert: " + (e && e.message ? e.message : String(e)));
    } catch {}
    return null;
  }
}
const SAFE_CHAT_ID = /^[A-Za-z0-9_-]{1,128}$/;


// ---------- reply parsing ----------
function firstObject(s) {
  const start = s.indexOf("{");
  if (start < 0) return { body: null, cuts: [] };
  const stack = [];
  const cuts = [];
  let inString = false;
  let escaped = false;
  let out = "";
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === "}" || s[j] === "]") continue;
      cuts.push(out + stack.slice().reverse().join(""));
    }
    out += ch;
    if (ch === "\"") inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (!stack.length) return { body: out, cuts: [] };
    }
  }
  return { body: null, cuts: cuts.reverse() };
}

const parseObj = (body) => {
  try {
    const v = JSON.parse(body);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
};

/** The fact ops wherever the model put them: "facts", "fact_ops", "ops", or inside "chapter". */
function factOps(v) {
  for (const x of [v.facts, v.fact_ops, v.factOps, v.ops, isObj(v.chapter) ? v.chapter.facts : undefined]) {
    if (Array.isArray(x)) return x.slice(0, 12);
  }
  return [];
}

/** The chapter as asked ({chapter:{label,text}}) or flat ({chapter:"label", text} or {label, text}). */
function workerShape(v) {
  if (!v) return null;
  let label = "";
  let text = "";
  if (isObj(v.chapter)) {
    label = str(v.chapter.label || v.chapter.title);
    text = str(v.chapter.text);
  } else if (typeof v.chapter === "string" && str(v.text)) {
    label = str(v.chapter);
    text = str(v.text);
  } else if (typeof v.chapter === "string") {
    text = str(v.chapter);
    label = str(v.label || v.title);
  } else if (str(v.text)) {
    label = str(v.label || v.title);
    text = str(v.text);
  }
  if (!text) return null;
  return { chapter: { label: cut(label, 80), text: cut(text, 1500) }, facts: factOps(v), habits: habitList(v), views: viewList(v) };
}

/** item 7: parse the worker's reply JSON, tolerating a cut reply. */
export function parseWorkerReply(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();
  const fo = firstObject(s);
  if (fo.body) {
    const got = workerShape(parseObj(fo.body));
    if (got) return got;
  }
  for (const cutStr of fo.cuts) {
    const got = workerShape(parseObj(cutStr));
    if (got) return got;
  }
  return null;
}

// ---------- quiet proposals (memory wave 1) ----------
/**
 * With config `proposals: "quiet"`, a pin or a rewrite the worker (or Consolidate) proposes is applied at once: the
 * proposal is kept as accepted with `auto: true` and what is needed to take it back, and the Activity gets a row
 * with an Undo. Never a retire or a merge. Left pending, for the user: a rewrite of a fact the user wrote or edited or
 * pinned, and a pin that would pass the pin limit. Returns how many were applied.
 */
export function applyQuiet(st, cfg, now) {
  if (!cfg || cfg.proposals !== "quiet") return 0;
  let n = 0;
  for (const p of st.proposals) {
    if (!isObj(p) || p.status !== "pending" || (p.op !== "pin" && p.op !== "rewrite")) continue;
    const target = st.facts.find((f) => f.id === arr(p.targets)[0] && f.status === "active");
    if (!target) continue;
    if (p.op === "rewrite") {
      const text = cut(str(p.text), 300);
      if (!text || text === str(target.text) || target.edited === true || target.pinned === true) continue;
      p.undo = { text: str(target.text) };
      target.text = text;
      target.updatedAt = now;
      settle(p, "accepted", now);
    } else {
      if (target.pinned === true || pinFact(st, target, "", Number(cfg.pinLimit) || 5, now)) continue;
      p.undo = { pinned: true };
    }
    p.auto = true;
    const text = p.op === "pin" ? str(target.text) : str(p.text);
    addActivity(st, "worker", "proposal.auto", "Applied a proposal by itself: " + str(p.op) + " " + quote(text), [p.id, target.id], now, { op: str(p.op), text });
    n++;
  }
  return n;
}

/** POST /litopys/proposals op "undo": takes back a proposal applied by itself, unless the fact changed since. */
function undoProposal(st, p, now) {
  if (p.auto !== true || p.status !== "accepted" || !isObj(p.undo)) return { status: 409, json: { error: "nothing to undo" } };
  const target = st.facts.find((f) => f.id === arr(p.targets)[0] && f.status === "active");
  if (!target) return { status: 409, json: { error: "target gone" } };
  if (p.op === "rewrite") {
    if (str(target.text) !== str(p.text)) return { status: 409, json: { error: "changed since" } };
    target.text = str(p.undo.text);
  } else {
    if (target.pinned !== true) return { status: 409, json: { error: "changed since" } };
    target.pinned = false;
  }
  target.updatedAt = now;
  p.status = "rejected";
  p.undone = true;
  p.settledAt = now;
  const text = p.op === "pin" ? str(target.text) : str(p.text);
  addActivity(st, "user", "proposal.undo", "Took back a proposal: " + str(p.op) + " " + quote(text), [p.id, target.id], now, { op: str(p.op), text });
  return null;
}

// ---------- applying the worker result ----------
/** Models drop "op" on new facts or say "new": no id means add. */
function factOp(op) {
  const raw = str(op.op || op.action).toLowerCase();
  if (raw === "add" || raw === "new" || raw === "create" || raw === "insert") return "add";
  if (raw === "update" || raw === "edit" || raw === "change") return "update";
  if (raw === "retire" || raw === "remove" || raw === "delete") return "retire";
  return raw || (op.id === undefined || op.id === null || op.id === "" ? "add" : "");
}

/**
 * #178: the id of the earlier fact a new fact says it came from, or "". Wherever the model put it ("because", "cause",
 * "caused_by"), as "f3", "F3", 3 or "f3: the river thawed"; only one id, and only a fact of this record that is not the
 * new fact itself. Anything else is ignored: a wrong or missing cause never fails the chapter.
 */
export function causeOf(st, op) {
  if (!isObj(op)) return "";
  const raw = [op.because, op.cause, op.causedBy, op.caused_by, op.dueTo].find((x) => x !== undefined && x !== null && x !== "" && (typeof x === "string" || typeof x === "number"));
  if (raw === undefined) return "";
  const m = /^\s*f?(\d{1,9})\b/i.exec(String(raw));
  if (!m) return "";
  const id = "f" + Number(m[1]);
  return arr(st && st.facts).some((f) => isObj(f) && f.id === id) ? id : "";
}

/** item 8: mutate st including st.worker; returns the chapter object made. */
export function applyWorkerResult(st, work, parsed, ctx) {
  const { scene, replaces } = work;
  const { now, model, usage, ms, line } = ctx;
  const chapterId = replaces || "c" + ++st.counters.chapter;
  const factAdds = [];
  let skipped = 0;

  const newChapter = {
    id: chapterId,
    from: scene.from,
    to: scene.to,
    count: scene.count,
    sig: chapterSig(line.slice(scene.fromIdx, scene.toIdx + 1)),
    label: cut(parsed.chapter.label, 80) || scene.label || "",
    text: cut(parsed.chapter.text, 1500),
    kind: scene.kind,
    at: now,
  };
  if (scene.marked) newChapter.marked = true;
  if (scene.place) newChapter.place = scene.place;
  // #99: what each character remembers of the scene; only asked for (and kept) when the scene had a cast of two or more
  const views = ctx.cast && ctx.cast.length >= 2 ? cleanViews(parsed.views, ctx.cast) : [];
  if (views.length) newChapter.views = views;
  if (model) newChapter.model = model;
  const at = replaces ? st.chapters.findIndex((c) => c.id === replaces) : -1;
  if (at >= 0) st.chapters[at] = newChapter;
  else st.chapters.push(newChapter);
  // chapters stay in story order; one whose messages are gone goes last
  const pos = (c) => {
    const r = rangeOf(c, line);
    return r.orphan ? Infinity : r.fromIdx;
  };
  st.chapters.sort((a, b) => pos(a) - pos(b));

  // Fact ops
  for (const op of arr(parsed.facts)) {
    if (!isObj(op) || factAdds.length >= 8) break;
    const opName = factOp(op);
    if (opName === "add") {
      const text = cut(op.text, 300);
      if (!text) continue;
      const subject = str(op.subject) || "world";
      let knownBy = op.knownBy === "all" ? "all" : Array.isArray(op.knownBy) && op.knownBy.length ? op.knownBy.map((x) => str(x)).filter(Boolean) : "all";
      // a character knows what is about them; models often list only the others
      if (Array.isArray(knownBy) && subject.toLowerCase() !== "world" && !knownBy.some((k) => k.toLowerCase() === subject.toLowerCase())) knownBy = [subject, ...knownBy];
      const typeMap = ["event", "trait", "change", "relation", "world", "plan"];
      const type = typeMap.includes(op.type) ? op.type : "event";
      const weightMap = ["everyday", "important", "key"];
      const weight = weightMap.includes(op.weight) ? op.weight : "everyday";
      // Skip when Dice >= 0.85 against any active fact with the same subject
      const dup = st.facts.some(
        (f) => f.status === "active" && str(f.subject).toLowerCase() === subject.toLowerCase() && diceSimilarity(text, f.text) >= DICE_LIMIT,
      );
      if (dup) continue;
      // only repeats the card or the lorebook: the model sees those anyway
      if (ctx.sources && repeatsSource(text, ctx.sources)) {
        skipped++;
        continue;
      }
      if (factAdds.length >= 8) break;
      const because = ctx.causes === false ? "" : causeOf(st, op);
      const fact = {
        id: "f" + ++st.counters.fact,
        text,
        subject,
        knownBy,
        type,
        weight,
        pinned: false,
        status: "active",
        ...(because ? { because } : {}),
        src: { from: scene.from, to: scene.to, chapter: chapterId },
        origin: "chapter",
        at: now,
        updatedAt: now,
      };
      st.facts.push(fact);
      factAdds.push(fact);
      // only the user pins; the worker proposes a pin for a key fact (M4a)
      if (weight === "key") {
        fact.pinProposed = true;
        st.proposals.push({ id: "p" + ++st.counters.proposal, op: "pin", targets: [fact.id], reason: "key fact", status: "pending", chapter: chapterId, at: now });
      }
    } else if (opName === "update") {
      const id = str(op.id);
      const target = st.facts.find((f) => f.id === id && f.status === "active");
      if (!target) continue;
      const text = cut(op.text, 300);
      if (!text) continue;
      // the user's own wording is never replaced by the worker, only proposed (M4a)
      if ((op.type === "change" || target.type === "change") && target.edited !== true) {
        // Apply at once: supersede
        target.status = "superseded";
        target.updatedAt = now;
        const because = ctx.causes === false ? "" : causeOf(st, op);
        const newFact = {
          id: "f" + ++st.counters.fact,
          text,
          subject: target.subject,
          knownBy: target.knownBy,
          weight: target.weight,
          pinned: target.pinned,
          type: "change",
          // the old version's own cause is no cause of the new one
          ...(because && because !== target.id ? { because } : {}),
          supersedes: target.id,
          status: "active",
          src: { from: scene.from, to: scene.to, chapter: chapterId },
          origin: "chapter",
          at: now,
          updatedAt: now,
        };
        st.facts.push(newFact);
        factAdds.push(newFact);
      } else {
        // a rewrite of an ordinary fact is never silent: a proposal
        const identical = st.proposals.some((p) => p.op === "rewrite" && p.status === "pending" && arr(p.targets).includes(target.id));
        if (!identical) {
          st.proposals.push({
            id: "p" + ++st.counters.proposal,
            op: "rewrite",
            targets: [target.id],
            text,
            reason: "chapter " + chapterId,
            status: "pending",
            chapter: chapterId,
            at: now,
          });
        }
      }
    } else if (opName === "retire") {
      const id = str(op.id);
      const target = st.facts.find((f) => f.id === id && f.status === "active");
      if (!target) continue;
      const reason = cut(op.reason, 200);
      const identical = st.proposals.some((p) => p.op === "retire" && p.status === "pending" && arr(p.targets).includes(target.id));
      if (!identical) {
        st.proposals.push({
          id: "p" + ++st.counters.proposal,
          op: "retire",
          targets: [target.id],
          reason,
          status: "pending",
          chapter: chapterId,
          at: now,
        });
      }
    }
  }

  // Habits the characters showed (#106), kept on the chat record itself (a rebuild keeps its own generation apart)
  if (ctx.habits) {
    const earned = applyHabits(ctx.habitsStore || st, parsed.habits, {
      now,
      chapterId,
      earnAfter: ctx.earnAfter || 2,
      userName: ctx.userName,
      sources: ctx.sources,
      cardRules: ctx.cardRules,
    });
    // the activity log tells it like a level reached: who earned what, and who was seen with a habit the first time
    for (const k of earned.earnedList) addActivity(ctx.habitsStore || st, "worker", "habit.earn", k.who + " earned the habit " + quote(k.name), [k.id], now, { who: k.who, name: k.name, seen: k.seen });
    for (const k of earned.addedList) addActivity(ctx.habitsStore || st, "worker", "habit.seen", k.who + " showed a habit: " + quote(k.name), [k.id], now, { who: k.who, name: k.name });
  }

  // Keep proposals at most 100 entries (drop oldest non-pending first)
  if (st.proposals.length > 100) {
    const nonPending = st.proposals.filter((p) => p.status !== "pending");
    let excess = st.proposals.length - 100;
    while (excess > 0 && nonPending.length) {
      const idx = st.proposals.indexOf(nonPending.shift());
      if (idx !== -1) {
        st.proposals.splice(idx, 1);
        excess--;
      }
    }
    while (st.proposals.length > 100) st.proposals.shift();
  }

  st.worker = {
    lastRunAt: now,
    lastProgressAt: now,
    lastScene: { from: scene.from, to: scene.to },
    ok: true,
    ms,
    usage,
    facts: { got: arr(parsed.facts).length, added: factAdds.length, ...(skipped ? { skipped } : {}) },
  };
  if (ctx.reply) st.worker.reply = cut(ctx.reply, 4000);
  delete st.worker.error;
  delete st.worker.retryAt;
  return newChapter;
}

/** item 8 failure: sets st.worker only. */
export function failWorker(st, work, message, ctx) {
  const { now, ms, usage } = ctx;
  const before = isObj(st.worker) ? st.worker : {};
  st.worker = {
    lastRunAt: now,
    lastScene: { from: work.scene.from, to: work.scene.to },
    ok: false,
    error: cut(message, 200) || "worker failed",
    retryAt: now + RETRY_MS,
  };
  if (before.lastProgressAt) st.worker.lastProgressAt = before.lastProgressAt;
  if (ms !== undefined) st.worker.ms = ms;
  if (usage !== undefined) st.worker.usage = usage;
  if (ctx.reply) st.worker.reply = cut(ctx.reply, 4000);
}

// ---------- chat files and sidecars ----------

export function emptyChat(chatId) {
  return {
    v: 2,
    chatId,
    migrated: false,
    chapters: [],
    facts: [],
    proposals: [],
    scene: { openFrom: null },
    arcs: [],
    habits: [],
    counters: { chapter: 0, fact: 0, proposal: 0, arc: 0, habit: 0 },
  };
}

/** The worker's habit reports; a model that still answers with the old name "skills" is understood too. */
const habitList = (v) => (Array.isArray(v.habits) ? v.habits : Array.isArray(v.skills) ? v.skills : []).slice(0, 6);

/** The worker's recollections wherever the model put them: a list of {who, text}, or a map from a name to the text. */
function viewList(v) {
  const raw = [v.views, v.recollections, v.memories, isObj(v.chapter) ? v.chapter.views : undefined].find((x) => Array.isArray(x) || isObj(x));
  const list = Array.isArray(raw) ? raw : isObj(raw) ? Object.entries(raw).map(([who, text]) => ({ who, text })) : [];
  return list.filter(isObj).slice(0, 2 * VIEWS_MAX);
}

/**
 * The recollections of one chapter as kept: only a name of the scene's cast (spelled as the scene spells it), one per
 * character, text trimmed. `cast` empty = unknown, then any name stays.
 */
export function cleanViews(list, cast) {
  const byLower = new Map(arr(cast).map((n) => [str(n).toLowerCase(), str(n)]));
  const done = new Set();
  const out = [];
  for (const x of arr(list)) {
    if (!isObj(x)) continue;
    const key = str(x.who || x.name || x.character).toLowerCase();
    const who = byLower.size ? byLower.get(key) : str(x.who || x.name || x.character);
    const text = cut(str(x.text || x.memory || x.view), VIEW_CHARS);
    if (!who || !text || done.has(who.toLowerCase())) continue;
    done.add(who.toLowerCase());
    out.push({ who, text });
    if (out.length >= VIEWS_MAX) break;
  }
  return out;
}

export function loadChatFile(fsx, chatId) {
  const st = readJson(fsx, CHAT_DIR + chatId + ".json", null);
  if (!isObj(st)) return null;
  st.v = typeof st.v === "number" ? st.v : 2;
  st.chatId = st.chatId || chatId;
  st.migrated = st.migrated === true;
  st.chapters = arr(st.chapters);
  st.facts = arr(st.facts);
  st.proposals = arr(st.proposals);
  st.scene = isObj(st.scene) ? st.scene : { openFrom: null };
  st.counters = isObj(st.counters)
    ? {
        chapter: Number(st.counters.chapter) || 0,
        fact: Number(st.counters.fact) || 0,
        proposal: Number(st.counters.proposal) || 0,
        arc: Number(st.counters.arc) || 0,
        habit: Number(st.counters.habit ?? st.counters.skill) || 0,
      }
    : { chapter: 0, fact: 0, proposal: 0, arc: 0, habit: 0 };
  st.arcs = arr(st.arcs).filter(isObj);
  // habits were called skills until 4.67.0
  st.habits = arr(st.habits ?? st.skills).filter(isObj);
  delete st.skills;
  st.rev = Number(st.rev) || 0;
  st.activity = arr(st.activity);
  st.skipScenes = arr(st.skipScenes);
  st.marks = arr(st.marks).filter(isObj);
  return st;
}

/**
 * Write the record unless someone else saved it since it was read (M4a): routes and the tick
 * normally run one at a time on the engine's single sandbox thread, but a replaced or retiring
 * sandbox worker can overlap another. false = the file on disk moved on; reload and redo.
 */
export function saveChatFile(fsx, st) {
  const disk = readJson(fsx, CHAT_DIR + st.chatId + ".json", null);
  if (isObj(disk) && (Number(disk.rev) || 0) !== (Number(st.rev) || 0)) return false;
  st.rev = (Number(st.rev) || 0) + 1;
  fsx.write(CHAT_DIR + st.chatId + ".json", JSON.stringify(st, null, 2));
  return true;
}

const ACTIVITY_KEEP = 100;
/**
 * M4a: one line of the Activity tab, newest last. by: user|worker|sweep|notes|rebuild. text is an
 * English sentence (logs, Molfar); data holds the values the UI puts into its own words.
 */
export function addActivity(st, by, kind, text, ids, now, data) {
  st.activity = arr(st.activity);
  const row = { at: now || Date.now(), by, kind, text: cut(text, 200), ids: arr(ids).map(str).filter(Boolean) };
  if (isObj(data)) row.data = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? cut(v, 160) : v]));
  st.activity.push(row);
  if (st.activity.length > ACTIVITY_KEEP) st.activity.splice(0, st.activity.length - ACTIVITY_KEEP);
}

function loadVectors(fsx, chatId) {
  return readJson(fsx, VECTOR_DIR + chatId + ".json", {});
}

function saveVectors(fsx, chatId, map) {
  fsx.write(VECTOR_DIR + chatId + ".json", JSON.stringify(map, null, 2));
}

// ---------- migration ----------

export function migrateChat(fsx, chatId, meta, line, now) {
  const st = emptyChat(chatId);
  st.migrated = true;

  const activeFacts = () => st.facts.filter((f) => f.status === "active");

  function addFact(text, extras) {
    const t = str(text);
    if (!t) return null;
    if (activeFacts().some((f) => diceSimilarity(t, f.text) >= DICE_LIMIT)) return null;
    st.counters.fact += 1;
    const id = "f" + st.counters.fact;
    st.facts.push({
      id,
      text: t,
      subject: "world",
      knownBy: "all",
      type: "event",
      weight: "everyday",
      pinned: false,
      status: "active",
      origin: "migrated",
      at: now,
      updatedAt: now,
      ...extras,
    });
    return id;
  }

  const store = loadStore(fsx);
  const oldChat = (store && store.chats && store.chats[chatId]) || null;
  if (oldChat && Array.isArray(oldChat.worldFacts)) {
    for (const old of oldChat.worldFacts) {
      if (!isObj(old)) continue;
      const kind = String(old.kind || "").toLowerCase();
      const type = kind === "npc" ? "trait" : kind === "event" ? "event" : "world";
      const status = old.status === "retired" ? "retired" : "active";
      addFact(old.text, {
        type,
        status,
        at: old.at || now,
        updatedAt: old.updatedAt || now,
        weight: "everyday",
        origin: "migrated",
      });
    }
  }

  const vectors = loadVectors(fsx, chatId);
  let vectorsChanged = false;
  const memories = readJson(fsx, "chats/" + chatId + ".memories.json", []);
  if (Array.isArray(memories)) {
    for (const m of memories) {
      if (!isObj(m)) continue;
      const t = str(m.text);
      if (!t) continue;
      const weight = vaultWeight(m);
      const id = addFact(t, {
        weight,
        pinned: !!m.pinned,
        type: "event",
        origin: "migrated",
        at: m.at || now,
        updatedAt: now,
      });
      if (id && Array.isArray(m.vector) && m.vector.length > 0) {
        vectors[id] = { hash: fnv1a(t), vector: m.vector };
        vectorsChanged = true;
      }
    }
  }
  if (vectorsChanged) saveVectors(fsx, chatId, vectors);

  if (meta && meta.summary && meta.memoryCutoffMessageId && line && line.length) {
    const cutoffIdx = line.findIndex((m) => m && m.id === meta.memoryCutoffMessageId);
    if (cutoffIdx >= 0) {
      const slice = line.slice(0, cutoffIdx + 1);
      st.counters.chapter += 1;
      st.chapters.push({
        id: "c" + st.counters.chapter,
        from: line[0].id,
        to: meta.memoryCutoffMessageId,
        count: slice.length,
        sig: chapterSig(slice),
        label: "",
        text: str(meta.summary),
        kind: "merged",
        place: null,
        at: now,
      });
    }
  }

  return st;
}

// ---------- fork ----------

export function forkFrom(fsx, parentSt, parentLine, parentMessageId, chatId, childLine, now) {
  const child = emptyChat(chatId);
  child.migrated = true;
  child.counters = {
    chapter: Number(parentSt.counters.chapter) || 0,
    fact: Number(parentSt.counters.fact) || 0,
    proposal: Number(parentSt.counters.proposal) || 0,
  };

  const boundaryIndex = parentMessageId != null ? parentLine.findIndex((m) => m && m.id === parentMessageId) : parentLine.length - 1;
  const copyAll = parentMessageId == null;
  const copiedIds = new Set();

  for (const ch of parentSt.chapters) {
    const r = rangeOf(ch, parentLine);
    if (r.orphan || r.toIdx < 0) continue;
    if (copyAll || r.toIdx <= boundaryIndex) {
      child.chapters.push({ ...ch });
      copiedIds.add(ch.id);
    }
  }

  for (const f of parentSt.facts) {
    let include = false;
    if (!f.src || f.src.to == null) {
      include = true;
    } else {
      const idx = parentLine.findIndex((m) => m && m.id === f.src.to);
      if (idx === -1) continue;
      if (copyAll || idx <= boundaryIndex) include = true;
    }
    if (include) {
      child.facts.push({ ...f });
      copiedIds.add(f.id);
    }
  }

  dropLostCauses(child.facts);
  // a superseded fact whose successor stayed behind in the parent is current here
  for (const f of child.facts) {
    if (f.status !== "superseded") continue;
    const successor = parentSt.facts.find((x) => x.supersedes === f.id);
    if (!successor || !copiedIds.has(successor.id)) f.status = "active";
  }

  const parentVectors = loadVectors(fsx, parentSt.chatId);
  const childVectors = {};
  let vectorsChanged = false;
  for (const id of copiedIds) {
    if (parentVectors[id]) {
      childVectors[id] = parentVectors[id];
      vectorsChanged = true;
    }
  }
  if (vectorsChanged) saveVectors(fsx, chatId, childVectors);

  return child;
}

// ---------- vectors ----------

export function needVectors(fsx, st) {
  const map = loadVectors(fsx, st.chatId);
  const out = [];
  for (const ch of st.chapters) {
    const text = str(ch.text);
    if (!text) continue;
    const hash = fnv1a(text);
    const entry = map[ch.id];
    if (!entry || entry.hash !== hash) out.push({ id: ch.id, text, hash });
  }
  for (const f of st.facts) {
    if (f.status !== "active") continue;
    const text = str(f.text);
    if (!text) continue;
    const hash = fnv1a(text);
    const entry = map[f.id];
    if (!entry || entry.hash !== hash) out.push({ id: f.id, text, hash });
  }
  return out.slice(0, 64);
}

export function finishEmbed(fsx, st, needed, vectors) {
  if (!needed.length || !Array.isArray(vectors)) return 0;
  const map = loadVectors(fsx, st.chatId);
  let stored = 0;
  for (let i = 0; i < needed.length && i < vectors.length; i++) {
      const v = vectors[i];
      if (Array.isArray(v) && v.length && v.every((n) => typeof n === "number" && Number.isFinite(n))) {
      map[needed[i].id] = { hash: needed[i].hash, vector: v };
      stored++;
    }
  }
  if (stored > 0) saveVectors(fsx, st.chatId, map);
  return stored;
}

export function embedAllowed(fsx) {
  const status = readJson(fsx, EMBED_STATUS_FILE, null);
  if (!isObj(status)) return true;
  if (status.ok === false) {
    const checked = Number(status.checkedAt) || 0;
    if (Date.now() - checked < 3600000) return false;
  }
  return true;
}

export function setEmbedStatus(fsx, ok) {
  fsx.write(EMBED_STATUS_FILE, JSON.stringify({ ok: !!ok, checkedAt: Date.now() }, null, 2));
}

// ---------- housekeeping ----------

export function pruneOrphans(fsx, store, files) {
  if (!Array.isArray(files)) return false;
  const live = new Set(
    files
      .filter((f) => typeof f === "string" && f.endsWith(".jsonl"))
      .map((f) => f.slice(0, -6)),
  );
  const gone = Object.keys(store.chats || {}).filter((id) => !live.has(id));
  const goneSet = new Set(gone);
  let storeChanged = false;
  let proposalsChanged = false;

  if (gone.length) {
    for (const id of gone) delete store.chats[id];
    storeChanged = true;

    let vault = [];
    try {
      vault = fsx.list(VAULT_DIR);
    } catch {}
    const liveTails = new Set([...live].map((id) => id.slice(-6)));
    for (const id of gone) {
      const tail = id.slice(-6);
      if (!liveTails.has(tail)) {
        for (const f of vault) {
          if (f.endsWith("-" + tail + ".md")) {
            try {
              fsx.remove(VAULT_DIR + "/" + f);
            } catch {}
          }
        }
      }
    }

    const props = loadProposals(fsx);
    const items = Array.isArray(props.items) ? props.items : [];
    const kept = items.filter((p) => !(p && goneSet.has(p.chatId)));
    if (kept.length !== items.length) {
      saveProposals(fsx, { ...props, items: kept });
      proposalsChanged = true;
    }
  }

  for (const dir of [CHAT_DIR, VECTOR_DIR, "litopys/insert/"]) {
    let list = [];
    try {
      list = fsx.list(dir);
    } catch {
      continue;
    }
    for (const f of list) {
      if (!f.endsWith(".json")) continue;
      const id = f.slice(0, -5);
      if (!live.has(id)) {
        try {
          fsx.remove(dir + f);
        } catch {}
      }
    }
  }

  return storeChanged || proposalsChanged;
}

export function ensureChat(fsx, chatId, meta, line, depth) {
  let st = loadChatFile(fsx, chatId);
  if (st) {
    if (st.migrated !== true) {
      const rev = st.rev;
      st = migrateChat(fsx, chatId, meta, line, Date.now());
      st.rev = rev;
      saveChatFile(fsx, st);
      return { st, changed: true };
    }
    return { st, changed: false };
  }
  const now = Date.now();
  if (meta.parentChatId && depth < 3) {
    const parent = readChat(fsx, meta.parentChatId);
    if (parent) {
      const parentSt = ensureChat(fsx, meta.parentChatId, parent.meta, activeLine(parent.msgs), depth + 1).st;
      st = forkFrom(fsx, parentSt, activeLine(parent.msgs), meta.parentMessageId, chatId, line, now);
    }
  }
  if (!st) st = migrateChat(fsx, chatId, meta, line, now);
  st.migrated = true;
  saveChatFile(fsx, st);
  return { st, changed: true };
}

export function pickChats(fsx, now) {
  const out = [];
  const wokenMap = readJson(fsx, WAKE_FILE, {});
  const woken = isObj(wokenMap) ? wokenMap : {};
  let files = [];
  try {
    files = fsx.list("chats") || [];
  } catch {
    return out;
  }
  for (const f of files) {
    if (!f.endsWith(".meta.json")) continue;
    const chatId = f.slice(0, -10);
    const meta = readJson(fsx, "chats/" + f, null);
    if (!isObj(meta) || meta.temporary) continue;
    // an older chat is visited only while the user asked for work on it (a rebuild, a rewrite)
    if (!woken[chatId] && (!meta.updatedAt || now - meta.updatedAt > 7 * 24 * 3600 * 1000)) continue;
    let hasJsonl = false;
    try {
      hasJsonl = files.includes(chatId + ".jsonl");
    } catch {
      hasJsonl = false;
    }
    if (!hasJsonl) continue;
    out.push({ chatId, meta });
  }
  const order = (x) => Math.max(Number(x.meta.updatedAt) || 0, Number(woken[x.chatId]) || 0);
  out.sort((a, b) => order(b) - order(a));
  return out;
}

// ---------- M3b: the sweep, migrated weights, card repeats, dashboard notes, rebuild ----------
const INSERT_DIR = "litopys/insert/";
/** Where the engine's last prompt started its verbatim history (count of line messages before it);
 *  null when it left no record or the chat has changed since (the id at that place is another). */
function promptCutOf(fsx, chatId, line) {
  const r = readJson(fsx, "litopys/prompt-cut/" + chatId + ".json", null);
  const n = isObj(r) ? Number(r.count) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > line.length) return null;
  if (n === 0) return 0;
  return line[n - 1] && line[n - 1].id === r.upTo ? n : null;
}

/** The weight of an old vault entry: by its importance (1-5), a pinned one at least important. */
function vaultWeight(m) {
  const imp = typeof m.importance === "number" ? m.importance : 0;
  if (imp >= 5) return "key";
  if (imp >= 3 || m.pinned === true) return "important";
  return "everyday";
}

/** Facts from an old Memory vault (`.memories.json`), skipping ones Litopys already holds. */
export function importMemories(st, list, now) {
  let n = 0;
  for (const m of arr(list)) {
    const text = cut(str(m && m.text), 300);
    if (!text) continue;
    if (st.facts.some((f) => f.status === "active" && diceSimilarity(text, f.text) >= DICE_LIMIT)) continue;
    const pinned = m.pinned === true;
    st.counters.fact += 1;
    st.facts.push({
      id: "f" + st.counters.fact,
      text,
      subject: "world",
      knownBy: "all",
      type: "event",
      weight: vaultWeight(m),
      pinned,
      status: "active",
      origin: "migrated",
      at: now,
      updatedAt: now,
    });
    n++;
  }
  return n;
}

/**
 * Every chat gets a Litopys file (not only the recent ones), and an old Memory vault is taken in
 * and then deleted (user, 2026-10-07). At most `limit` chats per call. The chat meta's old keys
 * are stripped by the engine plugin, never here: it owns that file.
 */
export function sweepMigrate(fsx, now, limit = 20) {
  let files = [];
  try {
    files = fsx.list("chats") || [];
  } catch {
    return 0;
  }
  const has = new Set(files);
  let touched = 0;
  for (const f of files) {
    if (touched >= limit) break;
    if (!f.endsWith(".meta.json")) continue;
    const chatId = f.slice(0, -10);
    if (!SAFE_ID.test(chatId) || !has.has(chatId + ".jsonl")) continue;
    const vault = "chats/" + chatId + ".memories.json";
    const hasVault = has.has(chatId + ".memories.json");
    let st = loadChatFile(fsx, chatId);
    if (st && st.migrated === true && !hasVault) continue;
    const rc = readChat(fsx, chatId);
    if (!rc || rc.meta.temporary) continue;
    if (!st || st.migrated !== true) st = ensureChat(fsx, chatId, rc.meta, activeLine(rc.msgs), 0).st;
    if (hasVault) {
      const n = importMemories(st, readJson(fsx, vault, []), now);
      if (n) addActivity(st, "sweep", "import", n + " facts taken from the old Memory", [], now, { n });
      // the old vault goes only once its facts are safely in the record
      if (saveChatFile(fsx, st)) {
        try {
          fsx.remove(vault);
        } catch {}
      }
    }
    touched++;
  }
  return touched;
}

/** Facts migrated before M3 all read "important": once per chat they become everyday, unless edited. */
export function fixMigratedWeights(st) {
  if (st.v2fix) return false;
  for (const f of st.facts) {
    if (f.origin === "migrated" && f.weight === "important" && f.pinned !== true && f.updatedAt === f.at) f.weight = "everyday";
  }
  st.v2fix = true;
  return true;
}

const SENTENCE_SPLIT = /(?<=[.!?…])\s+|\n+/;
/** The sentences of the chat's cards (every member of a group) and of its lorebooks' enabled entries. */
export function sourceSentences(fsx, meta) {
  const texts = [];
  const ids = [];
  if (meta && meta.groupId) {
    const g = readJson(fsx, "groups/" + meta.groupId + ".json", null);
    for (const id of arr(g && g.memberIds)) ids.push(str(id));
  } else if (meta && meta.characterId) ids.push(str(meta.characterId));
  for (const id of ids) {
    if (!SAFE_ID.test(id)) continue;
    const card = readJson(fsx, "characters/" + id + "/card.json", null);
    if (isObj(card)) for (const k of ["description", "personality", "scenario", "first_mes"]) texts.push(str(card[k]));
  }
  const bound = new Set(arr(meta && meta.lorebookIds).map(str));
  if (bound.size) {
    const seen = new Set();
    const take = (book) => {
      const key = isObj(book) ? str(book.id || book.name) : "";
      if (!key || seen.has(key) || !bound.has(key)) return;
      seen.add(key);
      for (const e of arr(book.entries)) if (isObj(e) && e.enabled !== false) texts.push(str(e.content));
    };
    // a book's file is named after its id: those are read by path; the rest of the shelf (a thousand books
    // after a big import) only when a name is left over
    for (const id of bound) if (SAFE_ID.test(id)) take(readJson(fsx, "lorebooks/" + id + ".json", null));
    if (bound.size > seen.size) {
      let files = [];
      try {
        files = (fsx.list("lorebooks") || []).filter((f) => f.endsWith(".json") && !f.startsWith("."));
      } catch {}
      for (const f of files) if (!seen.has(f.slice(0, -5))) take(readJson(fsx, "lorebooks/" + f, null));
    }
  }
  const out = [];
  for (const t of texts) for (const s of t.split(SENTENCE_SPLIT)) if (s.trim().length >= 12) out.push(s.trim());
  return out;
}

/** A fact that only repeats the card or the lorebook. */
export function repeatsSource(text, sentences) {
  return arr(sentences).some((s) => diceSimilarity(text, s) >= 0.7);
}

/** Notebook notes as they count (ported from relations activeNotebook + effectiveNotebook, reading only). */
function liveNotes(dash, line, overlay, withCarried) {
  const keys = new Set(line.map((m) => m.id + "#" + (Number.isFinite(m.swipe) ? m.swipe : 0)));
  // notes a continued chat carried in count for a card's memory, not for the notes-to-facts move (#100)
  if (withCarried) keys.add("inherit");
  const edits = isObj(overlay && overlay.edits) ? overlay.edits : {};
  const out = [];
  for (const [holder, notes] of Object.entries(isObj(dash && dash.notebook) ? dash.notebook : {})) {
    for (const n of arr(notes)) {
      if (!isObj(n) || !keys.has(n.src) || (n.retiredBy && keys.has(n.retiredBy))) continue;
      const e = isObj(edits[n.id]) ? edits[n.id] : null;
      if (e && e.retired === true) continue;
      out.push({ holder, id: str(n.id), how: n.how, text: e && str(e.text) ? str(e.text) : str(n.text), turn: Number(n.turn), weight: n.weight, tag: e && e.tag !== undefined ? e.tag : n.tag });
    }
  }
  for (const [holder, list] of Object.entries(isObj(overlay && overlay.added) ? overlay.added : {})) {
    for (const a of arr(list)) {
      if (!isObj(a) || typeof a.id !== "string" || !str(a.text)) continue;
      const e = isObj(edits[a.id]) ? edits[a.id] : null;
      if (e && e.retired === true) continue;
      out.push({ holder, id: a.id, text: e && str(e.text) ? str(e.text) : str(a.text), turn: Number(a.turn), weight: null, tag: e && e.tag !== undefined ? e.tag : a.tag });
    }
  }
  return out;
}

/** Dashboard notes that have aged out of the dashboard insert and matter: they become facts (user, 2026-10-07). */
export function notesToMove(fsx, chatId, st, dash, line, userName) {
  const dcfg = readJson(fsx, "dashboard/config.json", {});
  const age = clamp(isObj(dcfg) && dcfg.noteAgeTurns !== undefined ? dcfg.noteAgeTurns : 30, 5, 500);
  let now = 0;
  for (let i = line.length - 1; i >= 0; i--) {
    const snap = snapOf(dash, line[i]);
    if (snap && Number.isFinite(Number(snap.turn))) {
      now = Number(snap.turn);
      break;
    }
  }
  if (!now) return [];
  const moved = new Set(arr(st.fromNotes));
  const overlay = readJson(fsx, "dashboard/notes/" + chatId + ".json", null);
  const out = [];
  for (const n of liveNotes(dash, line, overlay)) {
    if (moved.has(n.id) || !n.text || !Number.isFinite(n.turn) || now - n.turn < age) continue;
    const pinned = n.tag === "pinned";
    const weight = pinned ? "important" : n.tag === "important" || n.weight === "important" ? "important" : n.weight === "key" ? "key" : null;
    if (!weight) continue; // everyday notes fade
    out.push({ noteId: n.id, text: cut(n.text, 300), subject: userName, knownBy: [n.holder], weight, pinned });
  }
  return out;
}

export function moveNotes(fsx, chatId, st, dash, line, userName, now) {
  const list = notesToMove(fsx, chatId, st, dash, line, userName);
  if (!list.length) return 0;
  st.fromNotes = arr(st.fromNotes);
  let n = 0;
  for (const x of list) {
    st.fromNotes.push(x.noteId);
    if (st.facts.some((f) => f.status === "active" && diceSimilarity(x.text, f.text) >= DICE_LIMIT)) continue;
    st.counters.fact += 1;
    st.facts.push({
      id: "f" + st.counters.fact,
      text: x.text,
      subject: x.subject,
      knownBy: x.knownBy,
      type: "relation",
      weight: x.weight,
      pinned: x.pinned,
      status: "active",
      src: { from: null, to: null },
      origin: "dashboard",
      at: now,
      updatedAt: now,
    });
    n++;
  }
  if (n) addActivity(st, "notes", "notes.move", n + " dashboard notes became facts", st.facts.slice(-n).map((f) => f.id), now, { n });
  return n;
}

/** #178: a link to a fact that is not in this list (a rebuild or a branch left it behind), or to the fact itself, goes. */
function dropLostCauses(facts) {
  const ids = new Set(facts.map((f) => f.id));
  for (const f of facts) if (f.because !== undefined && (f.because === f.id || !ids.has(f.because))) delete f.because;
}

/** The new generation replaces the record: its chapters and facts, plus user and dashboard facts added meanwhile. */
export function finishRebuild(st, now) {
  const g = st.rebuild;
  if (!isObj(g)) return false;
  const carried = new Set(arr(g.carried));
  const inUse = new Map(arr(st.facts).map((f) => [f.id, f]));
  // a carried fact the user edited, retired or deleted during the rebuild stays that way
  const facts = arr(g.facts)
    .map((f) => (carried.has(f.id) ? (inUse.has(f.id) ? { ...inUse.get(f.id) } : null) : f))
    .filter(Boolean);
  const ids = new Set(facts.map((f) => f.id));
  for (const f of arr(st.facts)) {
    if (carried.has(f.id) || f.status !== "active" || !keptByUser(f)) continue;
    if (facts.some((x) => x.text === f.text && x.subject === f.subject)) continue;
    const copy = { ...f };
    if (ids.has(copy.id)) {
      g.counters.fact += 1;
      copy.id = "f" + g.counters.fact;
    }
    ids.add(copy.id);
    facts.push(copy);
  }
  st.chapters = arr(g.chapters);
  dropLostCauses(facts);
  st.facts = facts;
  st.proposals = arr(g.proposals);
  st.counters = { ...st.counters, chapter: g.counters.chapter, fact: Math.max(g.counters.fact, st.counters.fact), proposal: Math.max(g.counters.proposal, st.counters.proposal) };
  st.worker = isObj(g.worker) ? g.worker : st.worker;
  delete st.inFlight;
  st.queue = isObj(g.queue) ? g.queue : { next: 0 };
  st.rebuiltAt = now;
  delete st.rebuild;
  delete st.cut;
  // arcs were made of the old chapters: the new ones get offered afresh
  st.arcs = [];
  delete st.arcAsk;
  delete st.arcFlight;
  delete st.arcFail;
  delete st.arcSnooze;
  const chapters = st.chapters.length;
  const kept = st.facts.filter((f) => f.status === "active").length;
  addActivity(st, "rebuild", "rebuild.finish", "Rebuilt: " + chapters + " chapters, " + kept + " facts", [], now, { chapters, facts: kept });
  return true;
}

/** Facts the user wrote or touched (or the dashboard gave): a rebuild keeps them. */
function keptByUser(f) {
  return f.origin === "user" || f.origin === "dashboard" || f.edited === true || f.pinned === true;
}

/** Start over from the messages, as a new generation beside the record in use: chapters and the facts written
 *  from them are rewritten, the user's and the dashboard's facts stay. The old record rides the prompt until
 *  the new one is done (finishRebuild), so the insert never goes empty. */
export function rebuildChat(fsx, chatId, cfg) {
  if (!SAFE_ID.test(chatId)) return null;
  const rc = readChat(fsx, chatId);
  if (!rc) return null;
  // no closed scene to write from: a rebuild would swap in an empty record over the one in use (it did, 2026-10-22)
  const own = loadChatFile(fsx, chatId);
  const closed = findScenes(activeLine(rc.msgs), readDash(fsx, chatId), cfg, own ? own.marks : []).filter((s) => s.closed).length;
  if (!closed) return { none: true, messages: activeLine(rc.msgs).length };
  for (let attempt = 0; attempt < 3; attempt++) {
    const st = loadChatFile(fsx, chatId);
    if (!st) return null;
    // the record in use keeps riding the prompt until the new one covers every closed scene;
    // chapters the user edited are kept as written (the worker never rebuilds them), and so are
    // the user's facts and the ones the user edited or pinned
    const now = Date.now();
    st.rebuild = {
      startedAt: now,
      chapters: st.chapters.filter((ch) => ch.edited === true).map((ch) => ({ ...ch })),
      facts: st.facts.filter((f) => f.status === "active" && keptByUser(f)).map((f) => ({ ...f })),
      proposals: [],
      // facts copied from the record in use: at the swap they take the state the user left them in
      carried: st.facts.filter((f) => f.status === "active" && keptByUser(f)).map((f) => f.id),
      skipScenes: arr(st.skipScenes).map((s) => ({ ...s })),
      marks: arr(st.marks).map((m) => ({ ...m })),
      counters: { chapter: st.counters.chapter, fact: st.counters.fact, proposal: st.counters.proposal },
    };
    addActivity(st, "user", "rebuild.start", "Rebuild from scratch started", [], now);
    if (!saveChatFile(fsx, st)) continue;
    wake(fsx, chatId, true);
    const line = activeLine(rc.msgs);
    return { scenes: findScenes(line, readDash(fsx, chatId), cfg, st.marks).filter((s) => s.closed).length };
  }
  return { busy: true };
}


export function onTick(_ctx, host) {
  try {
    const fsx = host && host.fs ? host.fs : null;
    if (!fsx) return;
    const cfg = loadConfig(fsx);
    if (cfg.enabled === false) return;
    let all = null;
    try {
      all = fsx.list("chats");
    } catch {}
    const store = loadStore(fsx);
    if (pruneOrphans(fsx, store, all)) saveStore(fsx, store);

    if (host.llm && host.llm.embedResults) {
      for (const key of Object.keys(host.llm.embedResults)) {
        if (!key.startsWith("lit_emb_")) continue;
        const vectors = host.llm.embedResults[key];
        if (!vectors) {
          setEmbedStatus(fsx, false);
          return;
        }
        const chatId = key.slice(8);
        const st = loadChatFile(fsx, chatId);
        if (!st) return;
        const needed = needVectors(fsx, st);
        const n = finishEmbed(fsx, st, needed, vectors);
        setEmbedStatus(fsx, n > 0);
        return;
      }
    }

    const now = Date.now();
    try {
      sweepMigrate(fsx, now, 20);
    } catch (e) {
      host.log("litopys sweep: " + (e && e.message ? e.message : String(e)));
    }
    let chats = [];
    try {
      chats = pickChats(fsx, now);
    } catch (e) {
      host.log("litopys pickChats: " + (e && e.message ? e.message : String(e)));
      return;
    }

    for (const item of chats) {
      try {
        const { chatId, meta } = item;
        const rc = readChat(fsx, chatId);
        if (!rc) continue;
        const line = activeLine(rc.msgs);
        if (!line.length) continue;
        const dash = readDash(fsx, chatId);
        const ensured = ensureChat(fsx, chatId, meta, line, 0);
        let st = ensured.st;
        let changed = ensured.changed;
        if (fixMigratedWeights(st)) changed = true;
        if (moveNotes(fsx, chatId, st, dash, line, str(meta.userName) || "You", now) > 0) changed = true;
        // a rebuild writes a new generation beside the record in use and swaps it in when done
        const gen = isObj(st.rebuild) ? st.rebuild : st;
        if (gen.worker && gen.worker.retryAt && gen.worker.retryAt > now) {
          if (changed) saveChatFile(fsx, st);
          continue;
        }
        if (markStale(st, line)) changed = true;
        if (gen !== st && markStale(gen, line)) changed = true;
        if (tidyArcs(st, now)) changed = true;
        const scenes = findScenes(line, dash, cfg, st.marks);
        const lastScene = scenes[scenes.length - 1];
        if (lastScene) {
          const openFrom = line[lastScene.fromIdx] ? line[lastScene.fromIdx].id : null;
          if (st.scene.openFrom !== openFrom || st.scene.label !== (lastScene.label || "")) {
            st.scene.openFrom = openFrom;
            st.scene.label = lastScene.label || "";
            changed = true;
          }
        }
        // M3b item 2: store the cut record after a tick that touched this chat
        const cut = cutCount(st, line, cfg);
        const upTo = cut > 0 ? line[cut - 1] ? line[cut - 1].id : null : null;
        if (!st.cut || st.cut.count !== cut || st.cut.upTo !== upTo) {
          st.cut = { upTo, count: cut, at: now };
          changed = true;
        }
        const works = workList(gen, line, dash, cfg, Infinity);
        const work = works[0] || null;
        // M4a+: closed scenes left, for the worker line and the chat list
        if (!isObj(gen.queue) || gen.queue.next !== works.length) {
          gen.queue = { next: works.length };
          changed = true;
        }
        if (!work && gen.inFlight) {
          delete gen.inFlight;
          changed = true;
        }
        if (!work && gen !== st && !arr(gen.chapters).length && arr(st.chapters).length) {
          // the new generation wrote nothing (no closed scene, or the worker failed): never swap it over a record that has chapters
          delete st.rebuild;
          addActivity(st, "rebuild", "rebuild.abort", "Rebuild stopped: it had no chapter to put in place of " + st.chapters.length + "; the record is untouched", [], now);
          if (saveChatFile(fsx, st)) wake(fsx, chatId, false);
          continue;
        }
        if (!work && gen !== st) {
          finishRebuild(st, now);
          if (saveChatFile(fsx, st)) wake(fsx, chatId, false);
          continue;
        }
        // M4d: with every scene chaptered, the worker merges arcs (one call per tick)
        if (!work && arcStep(fsx, host, chatId, st, line, cfg, meta, now)) return;
        // #51: a Consolidate the user asked for, one batch per tick, after chapters and arcs
        if (!work && consolidateStep(fsx, host, chatId, st, cfg, meta, now)) return;
        // #113: a story summary for a card's memory, after the chapters it is written from
        if (!work && summaryStep(fsx, host, chatId, st, cfg, meta, now)) return;
        if (!work && st.arcFlight) {
          delete st.arcFlight;
          changed = true;
        }
        if (!work) {
          if (changed) saveChatFile(fsx, st);
          wake(fsx, chatId, false);
          continue;
        }
        const keyOf = (s, g, w) => (g !== s ? "litr_" : "lit_") + chatId + "_" + w.scene.from + "_" + w.scene.to;
        const key = keyOf(st, gen, work);
        const shortKey = key + "_short";
        const results = host.llm && host.llm.results ? host.llm.results : {};
        const replyKey = results[shortKey] ? shortKey : results[key] ? key : null;
        if (replyKey) {
          const reply = results[replyKey];
          const parsed = reply && !reply.error && reply.text ? parseWorkerReply(reply.text) : null;
          // M4d size check: the first answer longer than its messages is asked again, once, shorter
          if (parsed && replyKey === key && wordCount(parsed.chapter.text) > sceneWords(line, work.scene)) {
            const maxWords = sizeLimit(line, work.scene);
            gen.sizeRetry = { key, maxWords, words: wordCount(parsed.chapter.text) };
            gen.inFlight = { key: shortKey, from: work.scene.from, to: work.scene.to, fromNo: work.scene.fromIdx + 1, toNo: work.scene.toIdx + 1, since: now };
            if (!saveChatFile(fsx, st)) return;
            beat(fsx, chatId, now);
            if (typeof host.llm.request === "function") host.llm.request(shortKey, buildWorkerRequest(gen, work, line, dash, cfg, meta, { maxWords, view: storyView(fsx, meta), notCast: narratorNames(fsx, meta) }));
            return;
          }
          // applied to the record as it is on disk; a save that lost a race is redone once
          let cur = st;
          for (let attempt = 0; attempt < 2; attempt++) {
            let g = gen;
            let w = work;
            if (attempt) {
              cur = loadChatFile(fsx, chatId);
              if (!cur) break;
              g = isObj(cur.rebuild) ? cur.rebuild : cur;
              w = pickWork(g, line, dash, cfg);
              if (!w || keyOf(cur, g, w) !== key) break;
            }
            delete g.inFlight;
            delete g.sizeRetry;
            const by = g !== cur ? "rebuild" : "worker";
            if (parsed) {
              const before = new Set(g.facts.map((f) => f.id));
              const pendingBefore = g.proposals.filter((p) => p.status === "pending").length;
              const chapter = applyWorkerResult(g, w, parsed, {
                now,
                model: reply.model,
                usage: reply.usage,
                ms: reply.genTimeMs,
                line,
                reply: reply.text,
                sources: sourceSentences(fsx, meta),
                habits: cfg.habits !== false,
                causes: cfg.causes !== false,
                habitsStore: cur,
                earnAfter: cfg.habitsEarnAfter,
                userName: meta && meta.userName,
                cardRules: cfg.habits !== false ? cardHabitRules(fsx, meta) : [],
                cast: cfg.recollections !== false ? sceneCast(w.scene, line, dash, meta, narratorNames(fsx, meta)) : [],
              });
              const added = g.facts.filter((f) => !before.has(f.id)).map((f) => f.id);
              const proposed = Math.max(0, g.proposals.filter((p) => p.status === "pending").length - pendingBefore);
              // a rebuild's generation is written beside the record in use: its proposals are never applied by themselves
              if (g === cur) applyQuiet(cur, cfg, now);
              const span = "messages " + (w.scene.fromIdx + 1) + "-" + (w.scene.toIdx + 1);
              const verb = w.replaces ? "Rewrote" : "Wrote";
              addActivity(cur, by, "chapter.write", verb + ' the chapter "' + (chapter.label || chapter.id) + '" (' + span + "): " + added.length + " facts, " + proposed + " proposals", [chapter.id, ...added], now, { label: chapter.label || "", from: w.scene.fromIdx + 1, to: w.scene.toIdx + 1, facts: added.length, proposals: proposed, rewrite: !!w.replaces });
              if (!saveChatFile(fsx, cur)) continue;
              if (embedAllowed(fsx) && typeof host.llm.embed === "function") {
                const needed = needVectors(fsx, cur);
                if (needed.length) host.llm.embed("lit_emb_" + chatId, { texts: needed.map((x) => x.text) });
              }
            } else {
              const wasOk = !isObj(g.worker) || g.worker.ok !== false;
              const message = reply && reply.error ? reply.error : "empty or invalid reply";
              failWorker(g, w, message, { now, model: reply && reply.model, usage: reply && reply.usage, ms: reply && reply.genTimeMs, reply: reply && reply.text });
              if (wasOk) addActivity(cur, by, "worker.fail", "The worker failed: " + str(message), [], now, { error: str(message) });
              if (!saveChatFile(fsx, cur)) continue;
            }
            break;
          }
          beat(fsx, chatId, now);
          return;
        }
        // a size retry still owed for this scene (the engine stopped between the two calls) goes out as the short one
        const retry = isObj(gen.sizeRetry) && gen.sizeRetry.key === key ? gen.sizeRetry : null;
        const sendKey = retry ? shortKey : key;
        // M4a+: the request in flight, so the view can show the worker alive
        gen.inFlight = { key: sendKey, from: work.scene.from, to: work.scene.to, fromNo: work.scene.fromIdx + 1, toNo: work.scene.toIdx + 1, since: now };
        if (!saveChatFile(fsx, st)) return;
        beat(fsx, chatId, now);
        const req = buildWorkerRequest(gen, work, line, dash, cfg, meta, { ...(retry ? { maxWords: retry.maxWords } : {}), view: storyView(fsx, meta), notCast: narratorNames(fsx, meta) });
        if (host.llm && typeof host.llm.request === "function") host.llm.request(sendKey, req);
        return;
      } catch (e) {
        try {
          host.log("litopys onTick chat: " + (e && e.message ? e.message : String(e)));
        } catch {}
      }
    }
  } catch (e) {
    try {
      host.log("litopys onTick: " + (e && e.message ? e.message : String(e)));
    } catch {}
  }
}

// ---------- M4d: arcs, older chapters merged into one summary ----------
// st.arcs: [{ id, chapterIds, from, to, label, text, sig, at, model?, stale? }], chapterIds in story
// order. The insert takes an arc in place of its chapters while the arc is fresh: every member is
// there, not stale and unchanged since the merge (arcSig). A changed member makes the arc stale,
// and the worker merges it again once every member is fresh. st.arcAsk = the merge the user
// asked for, st.arcFlight = the request out, st.arcFail = the last failure (waits RETRY_MS),
// st.arcSnooze = "Not now" (the offer comes back when the older part grows by another threshold).

/** An arc's signature: its member chapters as they are now (id, messages, text). */
export function arcSig(chapters) {
  return fnv1a(arr(chapters).map((ch) => ch.id + ":" + str(ch.sig) + ":" + str(ch.text)).join(String.fromCharCode(1)));
}

const usable = (ch) => isObj(ch) && (ch.stale !== true || ch.edited === true);

/** The arc's member chapters that still exist, in story order. */
function arcMembers(st, arc) {
  const byId = new Map(st.chapters.map((ch) => [ch.id, ch]));
  return arr(arc.chapterIds).map((id) => byId.get(id)).filter(Boolean);
}

/** Arcs the insert may use: all members there, fresh and unchanged since the merge. */
export function freshArcs(st) {
  return arr(st && st.arcs).filter((a) => {
    if (!isObj(a) || a.stale === true || !str(a.text)) return false;
    const members = arcMembers(st, a);
    return members.length >= 2 && members.length === arr(a.chapterIds).length && members.every(usable) && arcSig(members) === a.sig;
  });
}

/**
 * Arcs whose chapters changed become stale; arcs left with fewer than two chapters, and a merge
 * the user asked for whose chapters are gone, are dropped. True when anything changed.
 */
export function tidyArcs(st, now) {
  let changed = false;
  const fresh = new Set(freshArcs(st));
  const kept = [];
  for (const a of arr(st.arcs)) {
    if (arcMembers(st, a).length < 2) {
      addActivity(st, "worker", "arc.drop", "Dropped the arc " + quote(a.label || a.id) + ": its chapters are gone", [a.id], now, { label: str(a.label) });
      changed = true;
      continue;
    }
    if (!fresh.has(a) && a.stale !== true) {
      a.stale = true;
      changed = true;
    }
    kept.push(a);
  }
  st.arcs = kept;
  if (isObj(st.arcAsk)) {
    const ids = new Set(st.chapters.map((ch) => ch.id));
    if (arr(st.arcAsk.chapterIds).filter((id) => ids.has(id)).length < 2) {
      delete st.arcAsk;
      changed = true;
    }
  }
  return changed;
}

/** The chapters before the cut the insert may draw from, in story order. */
export function chaptersBeforeCut(st, line, cut) {
  return arr(st.chapters)
    .map((ch) => ({ ch, r: rangeOf(ch, line) }))
    .filter(({ ch, r }) => isObj(ch) && !ch.stale && !r.orphan && r.toIdx < cut && str(ch.text))
    .sort((a, b) => a.r.fromIdx - b.r.fromIdx)
    .map((x) => x.ch);
}

const itemLine = (x) => "- " + (str(x.label) ? str(x.label) + ": " : "") + str(x.text);

/**
 * Where the record stands on arcs: the older chapters (all before the cut but the newest arcKeep)
 * and the tokens they take as the insert would carry them (a fresh arc once, in place of its
 * chapters), the threshold, and the oldest run of arcSizeMin..arcSizeMax neighbouring older
 * chapters no arc holds (run: chapters, or null). over: the older part is past the threshold.
 */
export function arcPlan(st, line, cfg) {
  const cut = cutCount(st, line, cfg);
  const before = chaptersBeforeCut(st, line, cut);
  const older = before.slice(0, Math.max(0, before.length - cfg.arcKeep));
  const fresh = freshArcs(st);
  const freshOf = new Map();
  for (const a of fresh) for (const id of a.chapterIds) freshOf.set(id, a);
  const heldBy = new Set(arr(st.arcs).flatMap((a) => arr(a.chapterIds)));
  let tokens = 0;
  const counted = new Set();
  for (const ch of older) {
    const a = freshOf.get(ch.id);
    if (!a) tokens += estimateTokens(itemLine(ch));
    else if (!counted.has(a.id)) {
      counted.add(a.id);
      tokens += estimateTokens(itemLine(a));
    }
  }
  // neighbours = next to each other in the record (a stale chapter between them breaks the run)
  const order = new Map(st.chapters.map((ch, i) => [ch.id, i]));
  let run = null;
  let cur = [];
  const close = () => {
    if (!run && cur.length >= cfg.arcSizeMin) run = cur.slice(0, cfg.arcSizeMax);
    cur = [];
  };
  for (const ch of older) {
    if (heldBy.has(ch.id)) {
      close();
      continue;
    }
    const prev = cur[cur.length - 1];
    if (prev && order.get(ch.id) !== order.get(prev.id) + 1) close();
    cur.push(ch);
  }
  close();
  const threshold = arcThresholdOf(cfg);
  return { cut, older: older.length, tokens, threshold, over: tokens > threshold, run };
}

/** The tokens a run of chapters takes in the insert. */
function runTokens(chapters) {
  return chapters.reduce((n, ch) => n + estimateTokens(itemLine(ch)), 0);
}

/** "Not now" holds while the older part has grown by less than another threshold. */
function snoozed(st, plan) {
  return isObj(st.arcSnooze) && plan.tokens < (Number(st.arcSnooze.tokens) || 0) + plan.threshold;
}

/**
 * The next arc for the worker, or null: a stale arc whose chapters are all fresh again first, then
 * the merge the user asked for, then (auto) the plan's run. { replaces, chapters }. Nothing during
 * a rebuild or while a failure waits.
 */
export function arcWork(st, line, cfg, now) {
  if (isObj(st.rebuild)) return null;
  if (isObj(st.arcFail) && Number(st.arcFail.retryAt) > now) return null;
  const fresh = new Set(freshArcs(st));
  for (const a of arr(st.arcs)) {
    if (fresh.has(a)) continue;
    const members = arcMembers(st, a);
    if (members.length < 2 || !members.every(usable)) continue;
    return { replaces: a.id, chapters: members };
  }
  if (cfg.arcMode === "off") return null;
  if (isObj(st.arcAsk)) {
    const ids = new Set(arr(st.arcAsk.chapterIds));
    const chapters = st.chapters.filter((ch) => ids.has(ch.id));
    // waits while one of its chapters is being rewritten
    if (chapters.length >= 2 && chapters.every(usable)) return { replaces: null, chapters };
    return null;
  }
  if (cfg.arcMode !== "auto") return null;
  const plan = arcPlan(st, line, cfg);
  return plan.over && plan.run ? { replaces: null, chapters: plan.run } : null;
}

/** The result key of an arc request: the same job gives the same key on every pass. */
export function arcKey(chatId, job) {
  return "lita_" + chatId + "_" + (job.replaces || "new") + "_" + fnv1a(job.chapters.map((ch) => ch.id).join(",") + "|" + arcSig(job.chapters));
}

export function buildArcRequest(job, cfg, meta) {
  const model = cfg.model && str(cfg.model) ? str(cfg.model) : meta && meta.model ? meta.model : "";
  const parts = job.chapters.map((ch, i) => "Chapter " + (i + 1) + (str(ch.label) ? ": " + str(ch.label) : "") + "\n" + str(ch.text));
  const systemPrompt =
    (cfg.arc || DEFAULT_PROMPTS.arc) + "\n\nSize: the arc text must be at most " + cfg.arcWords + " words.\n\nOutput shape\n" + ARC_SHAPE;
  const req = {
    systemPrompt,
    messages: [{ role: "user", content: "Chapters\n\n" + parts.join("\n\n") }],
    presetParams: { temperature: 0.3, max_tokens: 1500 },
  };
  if (model) req.model = model;
  // NEVER set a reasoning field (reasoning stays off)
  return req;
}

/** The arc as asked ({arc:{label,text}}), or flat ({label,text}), or under "chapter". */
function arcShape(v) {
  if (!v) return null;
  const o = isObj(v.arc) ? v.arc : isObj(v.chapter) ? v.chapter : v;
  const text = str(o.text || o.summary || (typeof v.arc === "string" ? v.arc : ""));
  if (!text) return null;
  return { label: cut(str(o.label || o.title), 80), text: cut(text, 3000) };
}

export function parseArcReply(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();
  const fo = firstObject(s);
  if (fo.body) {
    const got = arcShape(parseObj(fo.body));
    if (got) return got;
  }
  for (const cutStr of fo.cuts) {
    const got = arcShape(parseObj(cutStr));
    if (got) return got;
  }
  return null;
}

/** Saves the arc (in place of the one it replaces), or answers why not: an arc longer than its chapters saves nothing. */
export function applyArc(st, job, parsed, ctx) {
  const { now, model, line } = ctx;
  const source = job.chapters.reduce((n, ch) => n + wordCount(ch.text), 0);
  if (wordCount(parsed.text) > source) return "the arc came out longer than its chapters";
  const first = job.chapters[0];
  const last = job.chapters[job.chapters.length - 1];
  const arc = {
    id: job.replaces || "a" + ++st.counters.arc,
    chapterIds: job.chapters.map((ch) => ch.id),
    from: first.from,
    to: last.to,
    label: parsed.label || str(first.label),
    text: parsed.text,
    sig: arcSig(job.chapters),
    at: now,
  };
  if (model) arc.model = model;
  const at = job.replaces ? st.arcs.findIndex((a) => a.id === job.replaces) : -1;
  if (at >= 0) st.arcs[at] = arc;
  else st.arcs.push(arc);
  const order = new Map(st.chapters.map((ch, i) => [ch.id, i]));
  st.arcs.sort((a, b) => (order.get(a.chapterIds[0]) ?? Infinity) - (order.get(b.chapterIds[0]) ?? Infinity));
  if (isObj(st.arcAsk) && !job.replaces) delete st.arcAsk;
  delete st.arcSnooze;
  delete st.arcFlight;
  delete st.arcFail;
  const r1 = rangeOf(first, line);
  const r2 = rangeOf(last, line);
  const data = { label: arc.label, chapters: arc.chapterIds.length, from: r1.orphan ? 0 : r1.fromIdx + 1, to: r2.orphan ? 0 : r2.toIdx + 1, rewrite: !!job.replaces };
  const verb = job.replaces ? "Merged again" : "Merged";
  addActivity(st, "worker", "arc.write", verb + " " + data.chapters + " chapters into the arc " + quote(arc.label || arc.id), [arc.id, ...arc.chapterIds], now, data);
  return null;
}

export function failArc(st, message, now) {
  const first = !isObj(st.arcFail);
  st.arcFail = { error: cut(message, 200) || "arc failed", at: now, retryAt: now + RETRY_MS };
  delete st.arcFlight;
  if (first) addActivity(st, "worker", "arc.fail", "Merging an arc failed: " + str(message), [], now, { error: str(message) });
}

/**
 * One tick's arc step for a chat with no chapter work (the chapters come first): apply an answer
 * that came back, else send the next request. true = the tick is done (one call per tick).
 */
function arcStep(fsx, host, chatId, st, line, cfg, meta, now) {
  const job = arcWork(st, line, cfg, now);
  if (!job) return false;
  const key = arcKey(chatId, job);
  const results = host.llm && host.llm.results ? host.llm.results : {};
  const reply = results[key];
  if (reply) {
    const parsed = reply && !reply.error && reply.text ? parseArcReply(reply.text) : null;
    let cur = st;
    for (let attempt = 0; attempt < 2; attempt++) {
      let j = job;
      if (attempt) {
        cur = loadChatFile(fsx, chatId);
        if (!cur) break;
        j = arcWork(cur, line, cfg, now);
        if (!j || arcKey(chatId, j) !== key) break;
      }
      const why = parsed ? applyArc(cur, j, parsed, { now, model: reply.model, line }) : reply && reply.error ? reply.error : "empty or invalid reply";
      if (why) failArc(cur, why, now);
      if (!saveChatFile(fsx, cur)) continue;
      break;
    }
    beat(fsx, chatId, now);
    return true;
  }
  const r1 = rangeOf(job.chapters[0], line);
  const r2 = rangeOf(job.chapters[job.chapters.length - 1], line);
  st.arcFlight = { key, chapters: job.chapters.length, fromNo: r1.orphan ? 0 : r1.fromIdx + 1, toNo: r2.orphan ? 0 : r2.toIdx + 1, since: now, rewrite: !!job.replaces };
  if (!saveChatFile(fsx, st)) return true;
  beat(fsx, chatId, now);
  if (host.llm && typeof host.llm.request === "function") host.llm.request(key, buildArcRequest(job, cfg, meta));
  return true;
}

/** The view's arcs: each with its message numbers and whether the insert uses it. */
function arcsView(st, line) {
  if (!st) return [];
  const fresh = new Set(freshArcs(st));
  return arr(st.arcs).map((a) => {
    const members = arcMembers(st, a);
    const r1 = members.length ? rangeOf(members[0], line) : { orphan: true };
    const r2 = members.length ? rangeOf(members[members.length - 1], line) : { orphan: true };
    return {
      id: str(a.id),
      chapterIds: arr(a.chapterIds).map(str),
      label: str(a.label),
      text: str(a.text),
      fromNo: r1.orphan ? 0 : r1.fromIdx + 1,
      toNo: r2.orphan ? 0 : r2.toIdx + 1,
      at: Number(a.at) || 0,
      stale: !fresh.has(a),
      ...(a.model ? { model: str(a.model) } : {}),
    };
  });
}

/** The Library's arc notice and the worker's arc line. */
function arcStateView(st, line, cfg, now) {
  const out = { mode: cfg.arcMode, keep: cfg.arcKeep, threshold: arcThresholdOf(cfg), tokens: 0, older: 0, suggested: null, queued: null, working: null, error: null, snoozed: false };
  if (!st) return out;
  const plan = arcPlan(st, line, cfg);
  out.tokens = plan.tokens;
  out.older = plan.older;
  out.snoozed = snoozed(st, plan);
  const numbers = (chapters) => {
    const r1 = rangeOf(chapters[0], line);
    const r2 = rangeOf(chapters[chapters.length - 1], line);
    return { fromNo: r1.orphan ? 0 : r1.fromIdx + 1, toNo: r2.orphan ? 0 : r2.toIdx + 1 };
  };
  if (isObj(st.arcAsk)) {
    const ids = new Set(arr(st.arcAsk.chapterIds));
    const chapters = st.chapters.filter((ch) => ids.has(ch.id));
    if (chapters.length) out.queued = { chapterIds: chapters.map((ch) => ch.id), chapters: chapters.length, ...numbers(chapters) };
  }
  if (isObj(st.arcFlight)) {
    const f = st.arcFlight;
    out.working = { chapters: Number(f.chapters) || 0, fromNo: Number(f.fromNo) || 0, toNo: Number(f.toNo) || 0, since: Number(f.since) || 0, rewrite: f.rewrite === true };
  }
  if (isObj(st.arcFail) && Number(st.arcFail.retryAt) > now) out.error = { error: str(st.arcFail.error), retryAt: Number(st.arcFail.retryAt) };
  if (cfg.arcMode === "ask" && plan.over && plan.run && !out.snoozed && !out.queued && !out.working && !isObj(st.rebuild)) {
    const run = plan.run;
    out.suggested = { fromChapter: run[0].id, toChapter: run[run.length - 1].id, chapterIds: run.map((ch) => ch.id), chapters: run.length, tokens: runTokens(run), ...numbers(run) };
  }
  return out;
}

/** POST /litopys/arcs { chatId, op: merge (from, to: chapter ids) | cancel | snooze | rewrite (id) | delete (id) } */
export function arcRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const op = str(b.op);
  if (!["merge", "cancel", "snooze", "rewrite", "delete"].includes(op)) return bad("unknown op");
  const cfg = loadConfig(fsx);
  const chatId = str(b.chatId);
  let woke = false;
  const res = mutateChat(fsx, chatId, (st, line) => {
    const now = Date.now();
    // a rebuild swaps in new chapters, and the arcs over the old ones go with them
    if (isObj(st.rebuild)) return { status: 409, json: { error: "rebuilding" } };
    if (op === "merge") {
      if (cfg.arcMode === "off") return { status: 409, json: { error: "arcs are off" } };
      if (isObj(st.arcAsk)) return { status: 409, json: { error: "a merge is already waiting" } };
      const i = st.chapters.findIndex((ch) => ch.id === str(b.from));
      const j = st.chapters.findIndex((ch) => ch.id === str(b.to));
      if (i < 0 || j < 0) return { status: 404, json: { error: "no such chapter" } };
      const chapters = st.chapters.slice(i, j + 1);
      if (chapters.length < 2 || chapters.length > 30) return bad("an arc takes 2 to 30 chapters");
      const cut = cutCount(st, line, cfg);
      const before = new Set(chaptersBeforeCut(st, line, cut).map((ch) => ch.id));
      if (!chapters.every((ch) => before.has(ch.id))) return { status: 409, json: { error: "only chapters before the cut merge" } };
      const held = new Set(arr(st.arcs).flatMap((a) => arr(a.chapterIds)));
      if (chapters.some((ch) => held.has(ch.id))) return { status: 409, json: { error: "a chapter is in an arc already" } };
      st.arcAsk = { chapterIds: chapters.map((ch) => ch.id), at: now };
      delete st.arcSnooze;
      delete st.arcFail;
      woke = true;
      addActivity(st, "user", "arc.ask", "Asked to merge " + chapters.length + " chapters into an arc", st.arcAsk.chapterIds, now, { chapters: chapters.length });
      return;
    }
    if (op === "cancel") {
      if (!isObj(st.arcAsk)) return;
      delete st.arcAsk;
      st.arcSnooze = { tokens: arcPlan(st, line, cfg).tokens, at: now };
      return;
    }
    if (op === "snooze") {
      st.arcSnooze = { tokens: arcPlan(st, line, cfg).tokens, at: now };
      return;
    }
    const arc = arr(st.arcs).find((a) => a.id === str(b.id));
    if (!arc) return { status: 404, json: { error: "no such arc" } };
    if (op === "rewrite") {
      arc.stale = true;
      delete st.arcFail;
      woke = true;
      addActivity(st, "user", "arc.rewrite", "Asked to merge the arc " + quote(arc.label || arc.id) + " again", [arc.id], now, { label: str(arc.label) });
      return;
    }
    st.arcs = st.arcs.filter((a) => a !== arc);
    // the same chapters would be offered again at once: wait for the older part to grow
    st.arcSnooze = { tokens: arcPlan(st, line, cfg).tokens, at: now };
    addActivity(st, "user", "arc.delete", "Deleted the arc " + quote(arc.label || arc.id) + "; its chapters stay", [arc.id], now, { label: str(arc.label) });
  });
  if (woke && res.status === 200) wake(fsx, chatId, true);
  return res;
}

// ---------- #51: Consolidate facts ----------
/** Fewer active facts than this: nothing worth a pass (the button is off). */
export const CONSOLIDATE_MIN = 20;
/** Facts per model call: fits the small context windows of free models. */
export const CONSOLIDATE_BATCH = 60;
const PROPOSALS_KEEP = 100;

export const CONSOLIDATE_PROMPT = [
  "You keep the story record of an ongoing roleplay. Below are facts from that record, one per line, each with its id and subject.",
  "Find only real problems and propose fixes:",
  "- merge: two or more facts that say the same thing, or that belong in one sentence. Give the ids and the one merged sentence.",
  "- rewrite: a fact that contradicts another one or is unclear. Give the id and the corrected sentence.",
  "- retire: a fact that a later fact makes untrue or that is a pure duplicate of another one you keep. Give the id.",
  "Each with a short reason (at most 15 words). Most facts need nothing: leave them out. Propose nothing when nothing is wrong.",
  "Never invent: use only what the facts say. Keep every name exactly as written. Write in the language the facts are in.",
  "",
  "Reply with ONE JSON object and nothing else. No code fences, no commentary.",
].join("\n");
export const CONSOLIDATE_SHAPE =
  '{"ops":[{"op":"merge","ids":["f1","f2"],"text":"one sentence","reason":""},{"op":"rewrite","id":"f3","text":"one sentence","reason":""},{"op":"retire","id":"f4","reason":""}]}';

/** Active fact ids in batches, one subject's facts kept together so its duplicates meet. */
export function consolidateBatches(st) {
  const active = arr(st && st.facts).filter((f) => isObj(f) && f.status === "active" && str(f.text) && str(f.id));
  const bySubject = new Map();
  for (const f of active) {
    const k = str(f.subject).toLowerCase();
    if (!bySubject.has(k)) bySubject.set(k, []);
    bySubject.get(k).push(f.id);
  }
  const batches = [];
  let cur = [];
  for (const ids of [...bySubject.values()].sort((x, y) => y.length - x.length)) {
    for (let i = 0; i < ids.length; i += CONSOLIDATE_BATCH) {
      const part = ids.slice(i, i + CONSOLIDATE_BATCH);
      if (cur.length + part.length > CONSOLIDATE_BATCH && cur.length) {
        batches.push(cur);
        cur = [];
      }
      cur.push(...part);
    }
  }
  if (cur.length) batches.push(cur);
  return batches;
}

export function buildConsolidateRequest(facts, cfg, meta) {
  const model = cfg && cfg.model && str(cfg.model) ? str(cfg.model) : meta && meta.model ? meta.model : "";
  const lines = facts.map((f) => f.id + " [" + (str(f.subject) || "world") + "] " + str(f.text));
  const req = {
    systemPrompt: CONSOLIDATE_PROMPT + "\n\nOutput shape\n" + CONSOLIDATE_SHAPE,
    messages: [{ role: "user", content: "Facts\n\n" + lines.join("\n") }],
    presetParams: { temperature: 0.2, max_tokens: 1500 },
  };
  if (model) req.model = model;
  // NEVER set a reasoning field (reasoning stays off)
  return req;
}

/** The model's ops, checked against the batch: unknown ids, empty texts and odd shapes are dropped. */
export function parseConsolidateReply(text, batchIds) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();
  const fo = firstObject(s);
  const v = fo.body ? parseObj(fo.body) : null;
  if (!v) return null;
  const list = Array.isArray(v.ops) ? v.ops : Array.isArray(v.proposals) ? v.proposals : null;
  if (!list) return null;
  const inBatch = new Set(arr(batchIds));
  const out = [];
  for (const o of list) {
    if (!isObj(o)) continue;
    const op = str(o.op).toLowerCase();
    const reason = cut(str(o.reason), 200);
    if (op === "merge") {
      const ids = [...new Set(arr(o.ids).map(str))].filter((id) => inBatch.has(id));
      const t = cut(str(o.text), 300);
      if (ids.length >= 2 && t) out.push({ op, targets: ids, text: t, reason });
    } else if (op === "rewrite") {
      const id = str(o.id);
      const t = cut(str(o.text), 300);
      if (inBatch.has(id) && t) out.push({ op, targets: [id], text: t, reason });
    } else if (op === "retire") {
      const id = str(o.id);
      if (inBatch.has(id)) out.push({ op, targets: [id], reason });
    }
  }
  return out;
}

/**
 * Adds the parsed ops to st.proposals: a fact already in a pending proposal is skipped (a second
 * run does not repeat itself), a rewrite to the same text is skipped, the pending list stays at
 * most PROPOSALS_KEEP. Returns how many were added.
 */
export function addConsolidateProposals(st, ops, now) {
  const active = new Map(st.facts.filter((f) => isObj(f) && f.status === "active").map((f) => [f.id, f]));
  const busy = new Set(st.proposals.filter((p) => p.status === "pending").flatMap((p) => arr(p.targets)));
  let added = 0;
  for (const o of arr(ops)) {
    if (st.proposals.filter((p) => p.status === "pending").length >= PROPOSALS_KEEP) break;
    const targets = arr(o.targets);
    if (!targets.length || targets.some((id) => !active.has(id) || busy.has(id))) continue;
    if (o.op === "rewrite" && str(active.get(targets[0]).text) === str(o.text)) continue;
    st.counters.proposal = (Number(st.counters.proposal) || 0) + 1;
    st.proposals.push({ id: "p" + st.counters.proposal, op: o.op, targets, ...(o.text ? { text: o.text } : {}), reason: o.reason || "consolidate", status: "pending", origin: "consolidate", at: now });
    for (const id of targets) busy.add(id);
    added++;
  }
  // settled proposals make room first, as after a chapter
  if (st.proposals.length > PROPOSALS_KEEP) {
    const done = st.proposals.filter((p) => p.status !== "pending");
    let excess = st.proposals.length - PROPOSALS_KEEP;
    while (excess > 0 && done.length) {
      st.proposals.splice(st.proposals.indexOf(done.shift()), 1);
      excess--;
    }
  }
  return added;
}

const consolidateKey = (chatId, job) => "lit_cons_" + chatId + "_" + job.at + "_" + job.next;

/** One tick's Consolidate step: apply an answer, else send the next batch. true = the tick is done. */
function consolidateStep(fsx, host, chatId, st, cfg, meta, now) {
  if (!isObj(st.consolidate) || st.consolidate.state !== "working") {
    if (!autoConsolidateDue(st, cfg)) return false;
    // written down first: the request below is answered on a later tick, which reads the job from the file
    startConsolidate(st, now, true);
    if (!saveChatFile(fsx, st)) return true;
  }
  const job = st.consolidate;
  const batches = arr(job.batches);
  const next = Number(job.next) || 0;
  if (next >= batches.length) {
    finishConsolidate(st, now);
    if (saveChatFile(fsx, st)) wake(fsx, chatId, false);
    return true;
  }
  const key = consolidateKey(chatId, job);
  const results = host.llm && host.llm.results ? host.llm.results : {};
  const reply = results[key];
  if (reply) {
    // re-read: the user may have accepted a proposal or cancelled since the request went out
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = attempt ? loadChatFile(fsx, chatId) : st;
      if (!cur || !isObj(cur.consolidate) || cur.consolidate.state !== "working" || consolidateKey(chatId, cur.consolidate) !== key) break;
      const ops = reply.error ? null : parseConsolidateReply(reply.text, batches[next]);
      if (!ops) {
        cur.consolidate = { ...cur.consolidate, state: "failed", error: cut(reply.error || "empty or invalid reply", 200), at: now };
        delete cur.consolidate.batches;
        addActivity(cur, "worker", "consolidate.fail", "Consolidating facts failed: " + str(reply.error || "empty or invalid reply"), [], now, {});
      } else {
        const added = addConsolidateProposals(cur, ops, now);
        applyQuiet(cur, cfg, now);
        cur.consolidate = { ...cur.consolidate, next: next + 1, proposed: (Number(cur.consolidate.proposed) || 0) + added };
        if (next + 1 >= batches.length) finishConsolidate(cur, now);
      }
      if (saveChatFile(fsx, cur)) break;
    }
    beat(fsx, chatId, now);
    return true;
  }
  const facts = arr(batches[next]).map((id) => st.facts.find((f) => f.id === id && f.status === "active")).filter(Boolean);
  if (facts.length < 2) {
    st.consolidate = { ...job, next: next + 1 };
    if (next + 1 >= batches.length) finishConsolidate(st, now);
    saveChatFile(fsx, st);
    return true;
  }
  beat(fsx, chatId, now);
  if (host.llm && typeof host.llm.request === "function") host.llm.request(key, buildConsolidateRequest(facts, cfg, meta));
  return true;
}

function finishConsolidate(st, now) {
  const proposed = Number(st.consolidate && st.consolidate.proposed) || 0;
  st.consolidate = { state: "done", proposed, at: now };
  addActivity(st, "worker", "consolidate.done", proposed ? "Consolidating facts proposed " + proposed + " changes" : "Consolidating facts found nothing to change", [], now, { proposed });
}

/** Active facts the chat must have gained since the last Consolidate for the automatic one to start. */
export const CONSOLIDATE_AUTO_GROWTH = 30;

/** Does the chat's Consolidate run by itself now: switched on, enough new facts, no run or proposal of its own waiting. */
export function autoConsolidateDue(st, cfg) {
  const on = cfg && (cfg.autoConsolidate === true || (cfg.autoConsolidate == null && cfg.proposals === "quiet"));
  if (!on || !st || isObj(st.rebuild)) return false;
  if (isObj(st.consolidate) && st.consolidate.state === "working") return false;
  if (arr(st.proposals).some((p) => isObj(p) && p.status === "pending" && p.origin === "consolidate")) return false;
  const active = consolidateBatches(st).reduce((n, x) => n + x.length, 0);
  const was = isObj(st.consolidateAt) ? Number(st.consolidateAt.active) || 0 : 0;
  return active >= CONSOLIDATE_MIN && active - was >= CONSOLIDATE_AUTO_GROWTH;
}

/** Starts a Consolidate run on the record (asked by the user, or by itself); the tick sends its batches. */
function startConsolidate(st, now, auto) {
  const batches = consolidateBatches(st);
  const active = batches.reduce((n, x) => n + x.length, 0);
  st.consolidate = { state: "working", batches, next: 0, proposed: 0, at: now, ...(auto ? { auto: true } : {}) };
  st.consolidateAt = { active, at: now };
  addActivity(st, auto ? "worker" : "user", "consolidate.ask", (auto ? "Started consolidating " : "Asked to consolidate ") + active + " facts" + (auto ? " by itself" : ""), [], now, { facts: active, ...(auto ? { auto: true } : {}) });
  return active;
}

/** The view's Consolidate line: the active count, and the run in progress or its outcome. */
function consolidateView(st) {
  const active = st ? st.facts.filter((f) => isObj(f) && f.status === "active").length : 0;
  const c = st && isObj(st.consolidate) ? st.consolidate : null;
  return {
    active,
    min: CONSOLIDATE_MIN,
    state: c ? str(c.state) : "idle",
    batches: c && c.state === "working" ? arr(c.batches).length : 0,
    next: c && c.state === "working" ? Number(c.next) || 0 : 0,
    proposed: c ? Number(c.proposed) || 0 : 0,
    error: c && c.state === "failed" ? str(c.error) : "",
    at: c ? Number(c.at) || 0 : 0,
  };
}

/** POST /litopys/consolidate { chatId, op: start | cancel } */
export function consolidateRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const op = str(b.op);
  if (op !== "start" && op !== "cancel") return bad("unknown op");
  const chatId = str(b.chatId);
  let woke = false;
  const res = mutateChat(fsx, chatId, (st) => {
    const now = Date.now();
    if (op === "cancel") {
      if (!isObj(st.consolidate) || st.consolidate.state !== "working") return;
      const proposed = Number(st.consolidate.proposed) || 0;
      st.consolidate = { state: "idle", proposed, at: now };
      return;
    }
    if (isObj(st.rebuild)) return { status: 409, json: { error: "rebuilding" } };
    if (isObj(st.consolidate) && st.consolidate.state === "working") return { status: 409, json: { error: "already consolidating" } };
    const active = consolidateBatches(st).reduce((n, x) => n + x.length, 0);
    if (active < CONSOLIDATE_MIN) return { status: 409, json: { error: "too few facts", min: CONSOLIDATE_MIN, active } };
    startConsolidate(st, now, false);
    woke = true;
  });
  if (woke && res.status === 200) wake(fsx, chatId, true);
  return res;
}

// ---------- a story summary for the card memory (#113) ----------
// The import dialog can ask the model for the summary of a whole chat instead of the text built from its arcs and
// chapters. st.storySummary = { state: "working" | "done" | "failed", at, sig, text?, model?, error? }; `sig` is the
// record the text was written from, so a chapter written later shows it as old. The user reads and edits the text in
// the dialog; nothing reaches the card by itself.
export const SUMMARY_WORDS = 180;
const SUMMARY_CHARS = 16000;
const summaryKey = (chatId, job) => "lit_sum_" + chatId + "_" + job.at;

/** The record in story order: a fresh arc stands in place of its chapters. [{ label, text }] */
export function summaryRecord(st) {
  const fresh = freshArcs(st);
  const inArc = new Set(fresh.flatMap((a) => arr(a.chapterIds)));
  const first = new Map(fresh.map((a) => [a.chapterIds[0], a]));
  const parts = [];
  for (const ch of arr(st && st.chapters)) {
    const arc = first.get(ch.id);
    if (arc) parts.push({ label: str(arc.label), text: str(arc.text) });
    else if (!inArc.has(ch.id) && usable(ch) && str(ch.text)) parts.push({ label: str(ch.label), text: str(ch.text) });
  }
  return parts;
}

const summarySig = (parts) => fnv1a(parts.map((p) => p.label + "|" + p.text).join(String.fromCharCode(1)));

export function buildSummaryRequest(parts, cfg, meta) {
  const model = cfg && cfg.model && str(cfg.model) ? str(cfg.model) : meta && meta.model ? meta.model : "";
  const total = parts.reduce((n, p) => n + p.text.length, 0);
  // a long record is cut evenly, so the first and the last parts both reach the model
  const each = total > SUMMARY_CHARS ? Math.max(200, Math.floor(SUMMARY_CHARS / parts.length)) : Infinity;
  const body = parts.map((p, i) => "Part " + (i + 1) + (p.label ? ": " + p.label : "") + "\n" + (p.text.length > each ? cut(p.text, each) : p.text));
  const req = {
    systemPrompt: (cfg.summary || DEFAULT_PROMPTS.summary) + "\n\nSize: at most " + SUMMARY_WORDS + " words.",
    messages: [{ role: "user", content: "Record\n\n" + body.join("\n\n") }],
    presetParams: { temperature: 0.3, max_tokens: 1200 },
  };
  if (model) req.model = model;
  // NEVER set a reasoning field (reasoning stays off)
  return req;
}

/** The summary as plain text; a model that wrapped it in JSON or a fence is understood too. null = nothing usable. */
export function parseSummaryReply(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = /```(?:\w+)?\s*([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();
  if (s.startsWith("{")) {
    const fo = firstObject(s);
    const v = fo.body ? parseObj(fo.body) : null;
    if (!v) return null;
    s = str(v.summary || v.text || (isObj(v.arc) ? v.arc.text : v.arc));
  }
  s = s.replace(/^["\u201c]+|["\u201d]+$/g, "").trim();
  return s.length >= 40 ? cut(s, 1500) : null;
}

/** One tick's summary step: apply an answer, else send the request. true = the tick is done. */
function summaryStep(fsx, host, chatId, st, cfg, meta, now) {
  const job = st.storySummary;
  if (!isObj(job) || job.state !== "working") return false;
  const key = summaryKey(chatId, job);
  const reply = host.llm && host.llm.results ? host.llm.results[key] : null;
  if (reply) {
    // re-read: the user may have cancelled since the request went out
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = attempt ? loadChatFile(fsx, chatId) : st;
      if (!cur || !isObj(cur.storySummary) || cur.storySummary.state !== "working" || cur.storySummary.at !== job.at) break;
      const text = reply.error ? null : parseSummaryReply(reply.text);
      if (text) {
        cur.storySummary = { state: "done", at: now, sig: str(job.sig), text, model: str(reply.model) };
        addActivity(cur, "worker", "summary.done", "Wrote a story summary for a card's memory", [], now, {});
      } else {
        cur.storySummary = { state: "failed", at: now, error: cut(str(reply.error) || "empty or invalid reply", 200) };
        addActivity(cur, "worker", "summary.fail", "The story summary failed: " + str(reply.error || "empty or invalid reply"), [], now, {});
      }
      if (saveChatFile(fsx, cur)) {
        wake(fsx, chatId, false);
        break;
      }
    }
    beat(fsx, chatId, now);
    return true;
  }
  const parts = summaryRecord(st);
  if (!parts.length) {
    st.storySummary = { state: "failed", at: now, error: "the record has no chapter to summarise" };
    if (saveChatFile(fsx, st)) wake(fsx, chatId, false);
    return true;
  }
  beat(fsx, chatId, now);
  if (host.llm && typeof host.llm.request === "function") host.llm.request(key, buildSummaryRequest(parts, cfg, meta));
  return true;
}

/** What the import dialog shows of the summary: the run, the text, and whether the record moved on since. */
export function summaryView(st) {
  const parts = summaryRecord(st);
  const s = st && isObj(st.storySummary) ? st.storySummary : null;
  const done = s && s.state === "done";
  return {
    can: parts.length > 0,
    state: s ? str(s.state) : "idle",
    text: done ? str(s.text) : "",
    tokens: done ? estimateTokens(str(s.text)) : 0,
    stale: !!done && str(s.sig) !== summarySig(parts),
    error: s && s.state === "failed" ? str(s.error) : "",
    at: s ? Number(s.at) || 0 : 0,
  };
}

/** POST /litopys/story-summary { chatId, op: start | cancel }: answers the summary view. */
export function summaryRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const op = str(b.op);
  if (op !== "start" && op !== "cancel") return bad("unknown op");
  const chatId = str(b.chatId);
  let woke = false;
  const res = mutateChat(fsx, chatId, (st) => {
    const now = Date.now();
    if (op === "cancel") {
      if (isObj(st.storySummary) && st.storySummary.state === "working") delete st.storySummary;
      return { save: true, status: 200, json: { summary: summaryView(st) } };
    }
    if (isObj(st.rebuild)) return { status: 409, json: { error: "rebuilding" } };
    if (isObj(st.storySummary) && st.storySummary.state === "working") return { status: 409, json: { error: "already writing" } };
    const parts = summaryRecord(st);
    if (!parts.length) return { status: 409, json: { error: "the record has no chapter yet" } };
    st.storySummary = { state: "working", at: now, sig: summarySig(parts) };
    woke = true;
    addActivity(st, "user", "summary.ask", "Asked for a story summary for a card's memory", [], now, {});
    return { save: true, status: 200, json: { summary: summaryView(st) } };
  });
  if (woke && res.status === 200) wake(fsx, chatId, true);
  return res;
}

// ---------- M4a+: is the worker alive ----------
const WAKE_FILE = "litopys/wake.json";
const BEAT_FILE = "litopys/worker.json";
const TICK_MS = 60000; // the manifest's schedule.intervalMs
const STALL_MS = 3 * TICK_MS;

/** Chats the worker visits whatever their age (a rebuild, a rewrite or a deleted chapter asked for work). */
export function wake(fsx, chatId, on) {
  const map = readJson(fsx, WAKE_FILE, {});
  const list = isObj(map) ? map : {};
  if (on ? list[chatId] : !list[chatId]) return;
  if (on) list[chatId] = Date.now();
  else delete list[chatId];
  try {
    fsx.write(WAKE_FILE, JSON.stringify(list, null, 2));
  } catch {}
}

export function wokenChats(fsx) {
  const map = readJson(fsx, WAKE_FILE, {});
  return isObj(map) ? Object.keys(map).filter((id) => SAFE_ID.test(id)) : [];
}

/** The worker's last sign of life across all chats: it does one chat per tick, the others wait. */
function beat(fsx, chatId, now) {
  try {
    fsx.write(BEAT_FILE, JSON.stringify({ at: now, chatId }));
  } catch {}
}

/**
 * The worker line's state for one generation (M4a+): working (a request in flight), retry
 * (failed, waits for retryAt), idle (nothing left), queued (work left, the worker is busy with
 * another chat or the next tick is due), stalled (work left and nothing moved for 3 ticks).
 */
export function workerState(gen, next, beatAt, now) {
  const w = isObj(gen && gen.worker) ? gen.worker : {};
  const flight = isObj(gen && gen.inFlight) ? gen.inFlight : null;
  if (flight && now - (Number(flight.since) || 0) < STALL_MS) return { state: "working" };
  if (w.ok === false && Number(w.retryAt) > now) return { state: "retry" };
  if (!flight && !(next > 0)) return { state: "idle" };
  const moved = Math.max(Number(w.lastProgressAt) || 0, Number(w.lastRunAt) || 0, flight ? Number(flight.since) || 0 : 0, Number(w.retryAt) || 0, Number(gen && gen.startedAt) || 0);
  if (now - moved < STALL_MS) return { state: "queued" };
  // the worker moved elsewhere lately: this chat waits its turn
  if (!flight && now - (Number(beatAt) || 0) < STALL_MS) return { state: "queued" };
  return { state: "stalled", stalledFor: now - moved };
}

// ---------- M4d: the original messages behind a chapter or a fact, and a search over them ----------
const MESSAGES_MAX = 80;
const SEARCH_HITS = 20;

/** GET /litopys/messages?chatId&from&to: the messages from..to (ids on the active line), read-only. */
export function messagesView(fsx, q) {
  const chatId = str(q.chatId);
  if (!SAFE_ID.test(chatId)) return { status: 400, json: { error: "bad chatId" } };
  const rc = readChat(fsx, chatId);
  if (!rc) return { status: 404, json: { error: "chat not found" } };
  const line = activeLine(rc.msgs);
  const fromIdx = line.findIndex((m) => m.id === str(q.from));
  if (fromIdx < 0) return { status: 404, json: { error: "those messages are no longer in the chat" } };
  let toIdx = q.to ? line.findIndex((m) => m.id === str(q.to)) : fromIdx;
  if (toIdx < fromIdx) toIdx = fromIdx;
  const end = Math.min(toIdx, fromIdx + MESSAGES_MAX - 1);
  const items = [];
  for (let i = fromIdx; i <= end; i++) {
    const m = line[i];
    items.push({ id: m.id, no: i + 1, role: m.role === "user" ? "user" : "char", name: m.role === "user" ? str(rc.meta.userName) || str(m.name) : str(m.name), text: cut(str(m.text), 6000) });
  }
  return { status: 200, json: { items, more: toIdx > end } };
}

/** GET /litopys/search?chatId&q&before: plain case-insensitive search over the ORIGINAL messages, newest first. */
export function searchView(fsx, q) {
  const chatId = str(q.chatId);
  if (!SAFE_ID.test(chatId)) return { status: 400, json: { error: "bad chatId" } };
  const needle = str(q.q).toLowerCase();
  if (needle.length < 2) return { status: 400, json: { error: "search for at least 2 letters" } };
  const rc = readChat(fsx, chatId);
  if (!rc) return { status: 404, json: { error: "chat not found" } };
  const line = activeLine(rc.msgs);
  const st = loadChatFile(fsx, chatId);
  const ranges = st ? st.chapters.map((ch) => ({ ch, r: rangeOf(ch, line) })).filter((x) => !x.r.orphan) : [];
  const before = Number(q.before) > 0 ? Math.min(line.length, Number(q.before) - 1) : line.length;
  const hits = [];
  for (let i = before - 1; i >= 0 && hits.length < SEARCH_HITS; i--) {
    const m = line[i];
    const text = str(m.text);
    const at = text.toLowerCase().indexOf(needle);
    if (at < 0) continue;
    const start = Math.max(0, at - 80);
    const snippet = (start > 0 ? "…" : "") + text.slice(start, at + needle.length + 80) + (at + needle.length + 80 < text.length ? "…" : "");
    const holder = ranges.find((x) => x.r.fromIdx <= i && x.r.toIdx >= i);
    hits.push({
      id: m.id,
      no: i + 1,
      name: m.role === "user" ? str(rc.meta.userName) || str(m.name) : str(m.name),
      at: Number(m.at) || 0,
      snippet,
      chapter: holder ? { id: holder.ch.id, label: str(holder.ch.label), from: holder.ch.from, to: holder.ch.to } : null,
    });
  }
  return { status: 200, json: { hits } };
}

// ---------- M4c: portraits the user sets for names (narrator cards, lorebook characters) ----------
const PORTRAITS_FILE = "litopys/portraits.json";
const PORTRAIT_MAX = 400000; // characters of a data URL: a 256 px image is far below this
const PORTRAIT_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** { "<lower-cased name>": { name, url } }: one portrait per name, for every chat. */
export function loadPortraits(fsx) {
  const raw = readJson(fsx, PORTRAITS_FILE, {});
  const out = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (isObj(v) && typeof v.url === "string" && PORTRAIT_URL.test(v.url)) out[k] = { name: str(v.name) || k, url: v.url };
  }
  return out;
}

/** POST /litopys/portraits { name, url }: url a small data:image, or null/"" to remove. Answers the whole map. */
export function portraitRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const name = cut(str(b.name), 80);
  if (!name) return { status: 400, json: { error: "name is empty" } };
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (url && (url.length > PORTRAIT_MAX || !PORTRAIT_URL.test(url))) return { status: 400, json: { error: "the image must be a small png, jpeg or webp" } };
  const map = loadPortraits(fsx);
  const key = name.toLowerCase();
  if (url) map[key] = { name, url };
  else delete map[key];
  fsx.write(PORTRAITS_FILE, JSON.stringify(map));
  return { status: 200, json: map };
}

// ---------- 0.9.2: chat links: a later chat continues an earlier one (its backstory) ----------
const LINKS_FILE = "litopys/links.json";

function chatExists(fsx, id) {
  if (!SAFE_ID.test(id)) return false;
  const meta = readJson(fsx, "chats/" + id + ".meta.json", null);
  return isObj(meta) && !meta.temporary;
}

/** { "<later chatId>": { from, at } }: one predecessor per chat; links to chats that are gone are left out. */
export function loadLinks(fsx) {
  const raw = readJson(fsx, LINKS_FILE, null);
  const links = isObj(raw) && isObj(raw.links) ? raw.links : {};
  const out = {};
  for (const [k, v] of Object.entries(links)) {
    if (!isObj(v) || str(v.from) === k || !chatExists(fsx, k) || !chatExists(fsx, str(v.from))) continue;
    out[k] = { from: str(v.from), at: Number(v.at) || 0 };
  }
  return out;
}

/** POST /litopys/links { chatId, from }: from = the chat this one continues, null removes the link. Answers { links }. */
export function linkRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const chatId = str(b.chatId);
  if (!chatExists(fsx, chatId)) return { status: 400, json: { error: "no such chat" } };
  const links = loadLinks(fsx);
  const from = b.from === null || b.from === undefined || b.from === "" ? null : str(b.from);
  if (from === null) delete links[chatId];
  else {
    if (from === chatId) return { status: 400, json: { error: "a chat cannot continue itself" } };
    if (!chatExists(fsx, from)) return { status: 400, json: { error: "no such chat to continue" } };
    // the chain back from the earlier chat must not reach this one
    const seen = new Set();
    for (let cur = from; cur && !seen.has(cur); cur = links[cur] ? links[cur].from : null) {
      if (cur === chatId) return { status: 400, json: { error: "that would make a loop" } };
      seen.add(cur);
    }
    links[chatId] = { from, at: Date.now() };
  }
  fsx.write(LINKS_FILE, JSON.stringify({ v: 1, links }));
  return { status: 200, json: { links } };
}

/** How far back a chain of linked chats is read (0.9.5): A -> B -> C gives C the stories of B and A. */
const CHAIN_MAX = 3;
/** Each chat's share of the one backstory budget, nearest first, by chain length. */
const CHAIN_SHARES = [[1], [0.65, 0.35], [0.5, 0.3, 0.2]];

/**
 * The earlier story a linked chat continues, as one block; null when there is no link, no record
 * there, or nothing fits. Read from the earlier chats' records as they are now, never copied. A chain
 * of links is followed back up to CHAIN_MAX chats; the budget stays one: the oldest chat is filled
 * first within its share and what it leaves unused goes to the nearer ones, so the nearest gets the
 * rest. Rendered oldest first, each chat as its own part (backstoryPart).
 */
export function buildBackstory({ fsx, chatId, line, meta, cfg, speakerName }) {
  const budget = clamp(cfg && cfg.linkBudget !== undefined ? cfg.linkBudget : 800, 0, 3000);
  if (!budget) return null;
  // "Start clean" in the chat's Dashboard (#100) is one switch for the whole carried memory: the story too
  const dash = readDash(fsx, chatId);
  if (isObj(dash) && isObj(dash.inherited) && dash.inherited.off === true) return null;
  const links = loadLinks(fsx);
  // nearest first; the link route refuses loops, the seen set guards files written before it did
  const chain = [];
  const seen = new Set([chatId]);
  for (let cur = links[chatId] ? links[chatId].from : null; cur && !seen.has(cur) && chain.length < CHAIN_MAX; cur = links[cur] ? links[cur].from : null) {
    seen.add(cur);
    chain.push(cur);
  }
  if (!chain.length) return null;

  // present: the names of the new chat's recent messages, the speaker and the user
  const here = new Set();
  for (const m of arr(line).slice(-PRESENT_WINDOW)) if (str(m && m.name)) here.add(str(m.name).toLowerCase());
  if (str(speakerName)) here.add(str(speakerName).toLowerCase());
  here.add((str(meta && meta.userName) || "You").toLowerCase());

  const shares = CHAIN_SHARES[chain.length - 1];
  const usedFacts = new Set();
  const parts = [];
  let spent = 0;
  for (let i = chain.length - 1; i >= 0; i--) {
    // this chat and the older ones together may use their summed shares
    const cap = i === 0 ? budget - spent : Math.floor(budget * shares.slice(i).reduce((a, b) => a + b, 0)) - spent;
    const nearer = i > 0 ? readChat(fsx, chain[i - 1]) : null;
    const part = backstoryPart({ fsx, from: chain[i], here, cap, usedFacts, continues: cfg && cfg.continues, nearerTitle: nearer ? str(nearer.meta && nearer.meta.title) || chain[i - 1] : null });
    if (!part) continue;
    parts.push(part);
    spent += part.tokens;
  }
  if (!parts.length) return null;
  const text = parts.map((p) => p.text).join("\n\n");
  return {
    text,
    tokens: estimateTokens(text),
    from: chain[0],
    ...(chain.length > 1 ? { chain: parts.map((p) => p.from) } : {}),
    facts: parts.reduce((n, p) => n + p.facts, 0),
    chapters: parts.reduce((n, p) => n + p.chapters, 0),
  };
}

/**
 * One earlier chat's part of the backstory, within `cap` tokens. Fill order (whole items; a group
 * stops at its first item that does not fit): pinned facts of the world or of a name present now, the
 * chat's last chapter, key facts (newest first), then arcs and the chapters no fresh arc holds,
 * walking back from the end. A fact already given by an older part is not repeated.
 */
function backstoryPart({ fsx, from, here, cap, usedFacts, nearerTitle, continues }) {
  if (cap <= 0) return null;
  const prc = readChat(fsx, from);
  const pst = loadChatFile(fsx, from);
  if (!prc || !pst) return null;
  const pline = activeLine(prc.msgs);
  const subj = (f) => str(f.subject).toLowerCase();
  const known = (f) => f.knownBy === "all" || (Array.isArray(f.knownBy) && f.knownBy.some((k) => here.has(str(k).toLowerCase())));
  const factKey = (f) => str(f.text).trim().toLowerCase();
  const active = arr(pst.facts).filter((f) => isObj(f) && f.status === "active" && str(f.text) && known(f) && !usedFacts.has(factKey(f)));

  const ranges = new Map();
  const chapters = arr(pst.chapters)
    .map((ch) => ({ ch, r: rangeOf(ch, pline) }))
    .filter(({ ch, r }) => isObj(ch) && !ch.stale && !r.orphan && str(ch.text))
    .sort((x, y) => x.r.fromIdx - y.r.fromIdx);
  for (const { ch, r } of chapters) ranges.set(ch.id, r);
  const last = chapters.length ? chapters[chapters.length - 1].ch : null;
  const arcs = freshArcs(pst).filter((a) => a.chapterIds.every((id) => ranges.has(id) && (!last || id !== last.id)));
  const held = new Set(arcs.flatMap((a) => a.chapterIds));
  for (const a of arcs) ranges.set(a.id, { fromIdx: Math.min(...a.chapterIds.map((id) => ranges.get(id).fromIdx)), toIdx: Math.max(...a.chapterIds.map((id) => ranges.get(id).toIdx)) });
  const older = [...arcs, ...chapters.map((x) => x.ch).filter((ch) => ch !== last && !held.has(ch.id))].sort((x, y) => ranges.get(y.id).toIdx - ranges.get(x.id).toIdx);

  const a = active.filter((f) => f.pinned === true && (subj(f) === "world" || here.has(subj(f))));
  const c = active.filter((f) => !a.includes(f) && f.weight === "key").sort((x, y) => (Number(y.updatedAt) || 0) - (Number(x.updatedAt) || 0));

  const title = str(prc.meta && prc.meta.title) || from;
  const header = nearerTitle
    ? "[Backstory (Litopys), older: the story before " + quote(nearerTitle) + ", from the chat " + quote(title) + ". " + (continues || CONTINUES) + "]"
    : "[Backstory (Litopys): the earlier story this chat continues, from the chat " + quote(title) + ". " + (continues || CONTINUES) + "]";
  const factLine = (f) => "- " + str(f.text) + (Array.isArray(f.knownBy) && f.knownBy.length ? " (known to: " + f.knownBy.join(", ") + ")" : "");
  const facts = [];
  const story = [];
  const render = () => {
    const out = [header];
    if (story.length) out.push("The story so far:", ...story.slice().sort((x, y) => ranges.get(x.id).fromIdx - ranges.get(y.id).fromIdx).map(itemLine));
    if (facts.length) out.push("Facts:", ...facts.map(factLine));
    return out.join("\n");
  };
  const tryAdd = (list, item) => {
    list.push(item);
    if (estimateTokens(render()) <= cap) return true;
    list.pop();
    return false;
  };
  for (const f of a) if (!tryAdd(facts, f)) break;
  if (last) tryAdd(story, last);
  for (const f of c) if (!tryAdd(facts, f)) break;
  for (const x of older) if (!tryAdd(story, x)) break;
  if (!facts.length && !story.length) return null;
  for (const f of facts) usedFacts.add(factKey(f));
  const text = render();
  return { text, tokens: estimateTokens(text), from, facts: facts.length, chapters: story.length };
}

// ---------- M4a: the user edits the record ----------
const FACT_TYPES = ["event", "trait", "change", "relation", "world", "plan"];
const FACT_WEIGHTS = ["everyday", "important", "key"];
const bad = (error) => ({ status: 400, json: { error } });
const quote = (s) => '"' + cut(str(s), 120) + '"';
const sameName = (a, b) => str(a).toLowerCase() === str(b).toLowerCase();

/** "all", or up to 16 names; null when the value is neither. */
function knownByOf(v) {
  if (v === "all") return "all";
  if (!Array.isArray(v)) return null;
  const names = [];
  for (const x of v) {
    const n = cut(str(x), 80);
    if (n && !names.some((m) => sameName(m, n))) names.push(n);
  }
  return names.length ? names.slice(0, 16) : null;
}

/**
 * Load, change, save, answer the chat view. fn(st, line) returns nothing (save), an error
 * { status, json } (nothing saved) or one with save: true (saved, then the error is answered).
 * A save that lost a race to another writer is redone on a fresh read.
 */
export function mutateChat(fsx, chatId, fn) {
  if (!SAFE_ID.test(chatId)) return bad("bad chatId");
  const rc = readChat(fsx, chatId);
  if (!rc) return { status: 404, json: { error: "chat not found" } };
  const line = activeLine(rc.msgs);
  for (let attempt = 0; attempt < 3; attempt++) {
    const st = loadChatFile(fsx, chatId);
    if (!st) return { status: 404, json: { error: "no record for this chat yet" } };
    const res = fn(st, line);
    if (res && !res.save) return res;
    if (!saveChatFile(fsx, st)) continue;
    if (res) return { status: res.status, json: res.json };
    return { status: 200, json: chatView(fsx, chatId) };
  }
  return { status: 409, json: { error: "busy, try again" } };
}

function pinnedOf(st, subject) {
  return st.facts.filter((f) => f.status === "active" && f.pinned === true && sameName(f.subject, subject));
}

/** Pin within the per-subject limit; replace = a pinned fact of the same subject to unpin in the same write. */
function pinFact(st, fact, replaceId, limit, now) {
  if (fact.pinned === true) return null;
  if (replaceId) {
    const other = pinnedOf(st, fact.subject).find((f) => f.id === replaceId);
    if (other) {
      other.pinned = false;
      other.updatedAt = now;
    }
  }
  const pinned = pinnedOf(st, fact.subject);
  if (pinned.length >= limit) return { status: 409, json: { error: "pin limit", limit, subject: str(fact.subject), pinned } };
  fact.pinned = true;
  fact.updatedAt = now;
  delete fact.pinProposed;
  // the worker's pending proposal to pin it is settled by the user's own pin
  for (const p of st.proposals) {
    if (p.status === "pending" && p.op === "pin" && arr(p.targets).includes(fact.id)) settle(p, "accepted", now);
  }
  return null;
}

function settle(p, status, now) {
  p.status = status;
  p.settledAt = now;
}

/** Pending proposals about a fact that is gone can no longer be accepted. */
function expireProposals(st, factId, now) {
  for (const p of st.proposals) {
    if (p.status === "pending" && arr(p.targets).includes(factId)) settle(p, "expired", now);
  }
}

/** POST /litopys/facts { chatId, op, id?, ... } */
export function factRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const op = str(b.op);
  if (!["add", "edit", "pin", "unpin", "retire", "restore", "delete"].includes(op)) return bad("unknown op");
  const cfg = loadConfig(fsx);
  return mutateChat(fsx, str(b.chatId), (st) => {
    const now = Date.now();
    if (op === "add") {
      const text = cut(str(b.text), 300);
      if (!text) return bad("text is empty");
      const knownBy = b.knownBy === undefined ? "all" : knownByOf(b.knownBy);
      if (!knownBy) return bad("knownBy must be \"all\" or a list of names");
      const type = b.type === undefined ? "event" : str(b.type);
      if (!FACT_TYPES.includes(type)) return bad("unknown type");
      const weight = b.weight === undefined ? "everyday" : str(b.weight);
      if (!FACT_WEIGHTS.includes(weight)) return bad("unknown weight");
      const fact = {
        id: "f" + ++st.counters.fact,
        text,
        subject: cut(str(b.subject), 80) || "world",
        knownBy,
        type,
        weight,
        pinned: false,
        status: "active",
        src: { from: null, to: null },
        origin: "user",
        at: now,
        updatedAt: now,
      };
      st.facts.push(fact);
      addActivity(st, "user", "fact.add", "Added a fact: " + quote(text), [fact.id], now, { text });
      return;
    }
    const fact = st.facts.find((f) => f.id === str(b.id));
    if (!fact) return { status: 404, json: { error: "no such fact" } };
    if (op === "edit") {
      if (fact.status === "superseded") return { status: 409, json: { error: "superseded" } };
      const next = {};
      if (b.text !== undefined) {
        next.text = cut(str(b.text), 300);
        if (!next.text) return bad("text is empty");
      }
      if (b.subject !== undefined) {
        next.subject = cut(str(b.subject), 80);
        if (!next.subject) return bad("subject is empty");
      }
      if (b.knownBy !== undefined) {
        next.knownBy = knownByOf(b.knownBy);
        if (!next.knownBy) return bad("knownBy must be \"all\" or a list of names");
      }
      if (b.type !== undefined) {
        next.type = str(b.type);
        if (!FACT_TYPES.includes(next.type)) return bad("unknown type");
      }
      if (b.weight !== undefined) {
        next.weight = str(b.weight);
        if (!FACT_WEIGHTS.includes(next.weight)) return bad("unknown weight");
      }
      if (!Object.keys(next).length) return bad("nothing to change");
      // a pinned fact moved to another subject must fit that subject's pins
      if (next.subject && fact.pinned === true && fact.status === "active" && !sameName(next.subject, fact.subject)) {
        if (pinnedOf(st, next.subject).length >= cfg.pinLimit) {
          return { status: 409, json: { error: "pin limit", limit: cfg.pinLimit, subject: next.subject, pinned: pinnedOf(st, next.subject) } };
        }
      }
      Object.assign(fact, next);
      fact.edited = true;
      fact.updatedAt = now;
      addActivity(st, "user", "fact.edit", "Edited a fact: " + quote(fact.text), [fact.id], now, { text: fact.text });
      return;
    }
    if (op === "pin") {
      if (fact.status !== "active") return { status: 409, json: { error: "not active" } };
      const err = pinFact(st, fact, str(b.replace), cfg.pinLimit, now);
      if (err) return err;
      // a replace names the fact that gave up its pin, so the Activity tab says both
      const other = b.replace ? st.facts.find((f) => f.id === str(b.replace) && f.pinned !== true) : null;
      const text = "Pinned: " + quote(fact.text) + (other ? " in place of " + quote(other.text) : "");
      addActivity(st, "user", "fact.pin", text, other ? [fact.id, other.id] : [fact.id], now, other ? { text: fact.text, replaced: other.text } : { text: fact.text });
      return;
    }
    if (op === "unpin") {
      if (fact.pinned !== true) return;
      fact.pinned = false;
      fact.updatedAt = now;
      addActivity(st, "user", "fact.unpin", "Unpinned: " + quote(fact.text), [fact.id], now, { text: fact.text });
      return;
    }
    if (op === "retire") {
      if (fact.status !== "active") return { status: 409, json: { error: "not active" } };
      fact.status = "retired";
      fact.pinned = false;
      fact.updatedAt = now;
      expireProposals(st, fact.id, now);
      addActivity(st, "user", "fact.retire", "Retired: " + quote(fact.text), [fact.id], now, { text: fact.text });
      return;
    }
    if (op === "restore") {
      if (fact.status !== "retired") return { status: 409, json: { error: "not retired" } };
      fact.status = "active";
      fact.updatedAt = now;
      addActivity(st, "user", "fact.restore", "Restored: " + quote(fact.text), [fact.id], now, { text: fact.text });
      return;
    }
    if (op === "delete") {
      st.facts = st.facts.filter((f) => f !== fact);
      // #178: what named it as its cause has no cause now
      for (const f of st.facts) if (f.because === fact.id) delete f.because;
      expireProposals(st, fact.id, now);
      addActivity(st, "user", "fact.delete", "Deleted: " + quote(fact.text), [fact.id], now, { text: fact.text });
      return;
    }
    return bad("unknown op");
  });
}

/** POST /litopys/chapters { chatId, op, id, ... } */
export function chapterRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const op = str(b.op);
  if (!["edit", "rewrite", "delete"].includes(op)) return bad("unknown op");
  const chatId = str(b.chatId);
  let woke = false;
  const res = mutateChat(fsx, chatId, (st, line) => {
    const now = Date.now();
    // the record in use is swapped out when a rebuild finishes: its chapters wait till then
    if (isObj(st.rebuild)) return { status: 409, json: { error: "rebuilding" } };
    const ch = st.chapters.find((c) => c.id === str(b.id));
    if (!ch) return { status: 404, json: { error: "no such chapter" } };
    const name = quote(ch.label || ch.id);
    if (op === "edit") {
      const next = {};
      if (b.label !== undefined) next.label = cut(str(b.label), 80);
      if (b.text !== undefined) {
        next.text = cut(str(b.text), 1500);
        if (!next.text) return bad("text is empty");
      }
      // #99: what each character remembers of the scene, written by the worker or by the user; an empty list takes them away
      if (b.views !== undefined) {
        if (!Array.isArray(b.views)) return bad("views must be a list of { who, text }");
        const views = cleanViews(b.views, null);
        if (views.length) next.views = views;
        else next.views = undefined;
      }
      if (!Object.keys(next).length) return bad("nothing to change");
      Object.assign(ch, next);
      if (ch.views === undefined) delete ch.views;
      // only the recollections changed: the chapter stays the worker's, so a changed scene still rewrites it
      if (b.label === undefined && b.text === undefined) {
        addActivity(st, "user", "chapter.edit", "Edited what the characters remember in the chapter " + quote(ch.label || ch.id), [ch.id], now, { label: ch.label || "", views: true });
        return;
      }
      ch.edited = true;
      ch.editedAt = now;
      // the user wrote it for the messages as they are now
      const r = rangeOf(ch, line);
      if (!r.orphan && !r.partial) ch.sig = chapterSig(line.slice(r.fromIdx, r.toIdx + 1));
      delete ch.stale;
      addActivity(st, "user", "chapter.edit", "Edited the chapter " + quote(ch.label || ch.id), [ch.id], now, { label: ch.label || "" });
      return;
    }
    if (op === "rewrite") {
      if (ch.kind === "merged") return bad("the old summary cannot be rewritten; delete it and its scenes get chapters of their own");
      ch.stale = true;
      ch.edited = false;
      woke = true;
      addActivity(st, "user", "chapter.rewrite", "Asked to rewrite the chapter " + name, [ch.id], now, { label: ch.label || "" });
      return;
    }
    if (op === "delete") {
      st.chapters = st.chapters.filter((c) => c !== ch);
      const keepGone = b.keepGone === true;
      if (keepGone) {
        const r = rangeOf(ch, line);
        if (!r.orphan) st.skipScenes.push({ from: line[r.fromIdx].id, to: line[r.toIdx].id, count: r.toIdx - r.fromIdx + 1, at: now });
      } else woke = true;
      addActivity(st, "user", "chapter.delete", "Deleted the chapter " + name + (keepGone ? " and kept its scene out of the record" : ""), [ch.id], now, { label: ch.label || "", keepGone });
      return;
    }
    return bad("unknown op");
  });
  if (woke && res.status === 200) wake(fsx, chatId, true);
  return res;
}

/**
 * POST /litopys/scenes { chatId, op: "mark", from, to } | { chatId, op: "unmark", id }
 * The reader sets a run of messages apart as a scene of its own (a short turning point the sensor
 * folded into a longer scene). It is never merged, gets its own chapter, and the worker is told it
 * matters. Chapters written over the same messages before are rewritten to the new scene layout.
 */
export function sceneRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const op = str(b.op);
  if (op !== "mark" && op !== "unmark") return bad("unknown op");
  const chatId = str(b.chatId);
  let woke = false;
  const res = mutateChat(fsx, chatId, (st, line) => {
    const now = Date.now();
    if (isObj(st.rebuild)) return { status: 409, json: { error: "rebuilding" } };
    st.marks = arr(st.marks).filter(isObj);
    let range;
    if (op === "mark") {
      const fromIdx = line.findIndex((m) => m.id === str(b.from));
      const toIdx = line.findIndex((m) => m.id === str(b.to));
      if (fromIdx < 0 || toIdx < 0) return bad("message not found");
      if (toIdx < fromIdx) return bad("the scene ends before it starts");
      if (markRanges(line, st.marks).some((r) => r.fromIdx <= toIdx && r.toIdx >= fromIdx)) return { status: 409, json: { error: "overlaps a scene already marked" } };
      range = { fromIdx, toIdx };
    } else {
      const at = st.marks.findIndex((m) => m.id === str(b.id));
      if (at < 0) return { status: 404, json: { error: "no such mark" } };
      const r = markRanges(line, [st.marks[at]])[0];
      range = r ? { fromIdx: r.fromIdx, toIdx: r.toIdx } : null;
    }
    // chapters over these messages are written for the old layout; one the user edited is theirs to settle
    const over = range ? st.chapters.filter((ch) => {
      const r = rangeOf(ch, line);
      return !r.orphan && r.fromIdx <= range.toIdx && r.toIdx >= range.fromIdx;
    }) : [];
    if (over.some((ch) => ch.edited === true)) return { status: 409, json: { error: "a chapter you edited covers these messages; delete it first" } };
    if (op === "mark") {
      const id = "s" + (1 + Math.max(0, ...st.marks.map((m) => Number(String(m.id).slice(1)) || 0)));
      st.marks.push({ id, from: str(b.from), to: str(b.to), at: now });
      addActivity(st, "user", "scene.mark", "Marked messages " + (range.fromIdx + 1) + "-" + (range.toIdx + 1) + " as a scene of their own", [], now, { fromNo: range.fromIdx + 1, toNo: range.toIdx + 1 });
    } else {
      st.marks = st.marks.filter((m) => m.id !== str(b.id));
      addActivity(st, "user", "scene.unmark", "Took the mark off a scene", [], now);
    }
    for (const ch of over) ch.stale = true;
    woke = true;
  });
  if (woke && res.status === 200) wake(fsx, chatId, true);
  return res;
}

/** POST /litopys/proposals { chatId, id, op: "accept"|"reject"|"undo", replace? } (undo: only a proposal applied by itself) */
export function proposalRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const op = str(b.op);
  if (op !== "accept" && op !== "reject" && op !== "undo") return bad("unknown op");
  const cfg = loadConfig(fsx);
  return mutateChat(fsx, str(b.chatId), (st) => {
    const now = Date.now();
    const p = st.proposals.find((x) => x.id === str(b.id));
    if (!p) return { status: 404, json: { error: "no such proposal" } };
    if (op === "undo") return undoProposal(st, p, now);
    if (p.status !== "pending") return { status: 409, json: { error: "not pending" } };
    const what = str(p.op) + (p.text ? " " + quote(p.text) : "");
    if (op === "reject") {
      settle(p, "rejected", now);
      addActivity(st, "user", "proposal.reject", "Rejected a proposal: " + what, [p.id, ...arr(p.targets)], now, { op: str(p.op), text: str(p.text) });
      return;
    }
    if (op !== "accept") return bad("unknown op");
    const targets = arr(p.targets).map((id) => st.facts.find((f) => f.id === id && f.status === "active"));
    if (!targets.length || targets.some((f) => !f)) {
      settle(p, "expired", now);
      return { status: 409, json: { error: "target gone" }, save: true };
    }
    const ids = [p.id, ...targets.map((f) => f.id)];
    if (p.op === "rewrite") {
      const text = cut(str(p.text), 300);
      if (!text) return bad("the proposal has no text");
      // the user chose this wording: the worker may only propose changes to it from now on
      targets[0].text = text;
      targets[0].edited = true;
      targets[0].updatedAt = now;
    } else if (p.op === "retire") {
      for (const f of targets) {
        f.status = "retired";
        f.pinned = false;
        f.updatedAt = now;
      }
    } else if (p.op === "merge") {
      const text = cut(str(p.text), 300);
      if (!text || targets.length < 2) return bad("a merge needs a text and two facts");
      const first = targets[0];
      const knownBy = targets.some((f) => f.knownBy === "all") ? "all" : knownByOf(targets.flatMap((f) => arr(f.knownBy))) || "all";
      const weight = FACT_WEIGHTS[Math.max(...targets.map((f) => Math.max(0, FACT_WEIGHTS.indexOf(f.weight))))];
      const merged = {
        id: "f" + ++st.counters.fact,
        text,
        subject: first.subject,
        knownBy,
        type: first.type,
        weight,
        // the merged fact keeps a pin its parts of the same subject had: that subject's pin count does not grow
        pinned: targets.some((f) => f.pinned === true && sameName(f.subject, first.subject)),
        status: "active",
        src: isObj(first.src) ? { ...first.src } : { from: null, to: null },
        origin: "merge",
        merges: targets.map((f) => f.id),
        at: now,
        updatedAt: now,
      };
      // #178: the survivor keeps the first cause of its parts that is not one of the parts themselves, and every
      // fact that named a part as its cause now names the survivor
      const partIds = new Set(targets.map((f) => f.id));
      const backsToPart = (id) => partIds.has(str((st.facts.find((x) => x.id === id) || {}).because));
      const cause = targets.map((f) => str(f.because)).find((id) => id && !partIds.has(id) && !backsToPart(id));
      if (cause) merged.because = cause;
      for (const f of st.facts) if (!partIds.has(f.id) && partIds.has(str(f.because))) f.because = merged.id;
      for (const f of targets) {
        f.status = "retired";
        f.pinned = false;
        f.mergedInto = merged.id;
        f.updatedAt = now;
      }
      st.facts.push(merged);
      ids.push(merged.id);
    } else if (p.op === "pin") {
      const err = pinFact(st, targets[0], str(b.replace), cfg.pinLimit, now);
      if (err) return err;
    } else {
      return bad("unknown proposal");
    }
    settle(p, "accepted", now);
    addActivity(st, "user", "proposal.accept", "Accepted a proposal: " + what, ids, now, { op: str(p.op), text: str(p.text) });
  });
}

// ---------- read-only view (the Litopys section) ----------
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const LIST_LIMIT = 300;

/** The name a chat is about: its character, or its group. "" when neither can be read. */
function chatSubject(fsx, meta) {
  try {
    if (meta.groupId) {
      const g = readJson(fsx, "groups/" + meta.groupId + ".json", null);
      if (isObj(g) && g.name) return str(g.name);
    }
    if (meta.characterId) {
      const card = readJson(fsx, "characters/" + meta.characterId + "/card.json", null);
      if (isObj(card)) return str(card.name || (isObj(card.data) ? card.data.name : ""));
    }
  } catch {}
  return "";
}

/**
 * The worker line of a chat (M4a+): the generation in progress (the rebuild one while
 * rebuilding), the request in flight, the last chapter written, the scenes left and a state.
 * next: closed scenes left (counted fresh by the chat view, as of the last tick in the list).
 */
function workerView(st, line, next, beatAt, now) {
  if (!st) return null;
  const gen = isObj(st.rebuild) ? st.rebuild : st;
  const w = isObj(gen.worker) ? gen.worker : {};
  const left = Number.isFinite(next) ? next : isObj(gen.queue) ? Number(gen.queue.next) || 0 : 0;
  const out = { lastRunAt: Number(w.lastRunAt) || 0, ok: w.ok !== false, next: left, ...workerState(gen, left, beatAt, now) };
  if (isObj(w.lastScene)) {
    out.lastScene = { from: str(w.lastScene.from), to: str(w.lastScene.to) };
    if (line) {
      // message numbers (1-based) when the messages are still in the chat, else 0
      out.lastScene.fromNo = line.findIndex((m) => m.id === out.lastScene.from) + 1;
      out.lastScene.toNo = line.findIndex((m) => m.id === out.lastScene.to) + 1;
    }
  }
  if (w.lastProgressAt) out.lastProgressAt = Number(w.lastProgressAt) || 0;
  if (isObj(gen.inFlight)) {
    const f = gen.inFlight;
    out.inFlight = { from: str(f.from), to: str(f.to), since: Number(f.since) || 0, fromNo: Number(f.fromNo) || 0, toNo: Number(f.toNo) || 0 };
    if (line) {
      const i = line.findIndex((m) => m.id === f.from);
      const j = line.findIndex((m) => m.id === f.to);
      if (i >= 0) out.inFlight.fromNo = i + 1;
      if (j >= 0) out.inFlight.toNo = j + 1;
    }
  }
  if (gen !== st) out.rebuild = true;
  if (w.error) out.error = str(w.error);
  if (Number.isFinite(w.ms)) out.ms = w.ms;
  if (isObj(w.facts)) out.facts = { got: Number(w.facts.got) || 0, added: Number(w.facts.added) || 0, skipped: Number(w.facts.skipped) || 0 };
  if (w.retryAt) out.retryAt = Number(w.retryAt) || 0;
  return out;
}

function beatAt(fsx) {
  const b = readJson(fsx, BEAT_FILE, null);
  return isObj(b) ? Number(b.at) || 0 : 0;
}

/** GET /litopys/chats: every chat with its Litopys counts. Reads only. */
export function listChatsView(fsx) {
  let files = [];
  try {
    files = fsx.list("chats") || [];
  } catch {}
  const items = [];
  const beatTime = beatAt(fsx);
  const now = Date.now();
  const links = loadLinks(fsx);
  for (const f of files) {
    if (!f.endsWith(".meta.json")) continue;
    const id = f.slice(0, -10);
    if (!SAFE_ID.test(id)) continue;
    const meta = readJson(fsx, "chats/" + f, null);
    if (!isObj(meta) || meta.temporary) continue;
    const st = loadChatFile(fsx, id);
    items.push({
      id,
      title: str(meta.title) || id,
      name: chatSubject(fsx, meta),
      // M4c: the map of chats draws forks as lines
      parentChatId: SAFE_ID.test(str(meta.parentChatId)) ? str(meta.parentChatId) : null,
      // 0.9.2: the earlier chat this one continues (a link the user drew), drawn solid on the map
      continues: links[id] ? links[id].from : null,
      updatedAt: Number(meta.updatedAt) || 0,
      hasData: !!st,
      chapters: st ? st.chapters.length : 0,
      facts: st ? st.facts.filter((x) => x.status === "active").length : 0,
      proposals: st ? st.proposals.filter((x) => x.status === "pending").length : 0,
      worker: workerView(st, null, undefined, beatTime, now),
    });
  }
  items.sort((a, b) => b.updatedAt - a.updatedAt);
  return { items: items.slice(0, LIST_LIMIT), total: items.length };
}

/** GET /litopys/chat?chatId=: one chat's chapters, facts, proposals, scene and worker. null = no such chat. */
export function chatView(fsx, chatId) {
  if (!SAFE_ID.test(chatId)) return null;
  const rc = readChat(fsx, chatId);
  if (!rc) return null;
  const line = activeLine(rc.msgs);
  const st = loadChatFile(fsx, chatId);
  const cfg = loadConfig(fsx);
  const gen = st ? (isObj(st.rebuild) ? st.rebuild : st) : null;
  const next = gen ? countWork(gen, line, readDash(fsx, chatId), cfg) : 0;
  const chapters = [];
  for (const ch of st ? st.chapters : []) {
    const r = rangeOf(ch, line);
    chapters.push({
      id: ch.id,
      from: str(ch.from),
      to: str(ch.to),
      label: str(ch.label),
      text: str(ch.text),
      kind: ch.kind || "scene",
      count: Number(ch.count) || 0,
      fromNo: r.orphan ? 0 : r.fromIdx + 1,
      toNo: r.orphan ? 0 : r.toIdx + 1,
      place: ch.place ? str(ch.place) : undefined,
      at: Number(ch.at) || 0,
      stale: ch.stale === true,
      edited: ch.edited === true,
      ...(ch.marked === true ? { marked: true } : {}),
      ...(Array.isArray(ch.views) && ch.views.length ? { views: ch.views } : {}),
    });
  }
  return {
    chatId,
    title: str(rc.meta.title) || chatId,
    name: chatSubject(fsx, rc.meta),
    messages: line.length,
    hasData: !!st,
    migrated: st ? st.migrated : false,
    chapters,
    facts: st ? st.facts : [],
    proposals: st ? st.proposals : [],
    habits: st ? st.habits.filter((k) => k.status !== "rejected") : [],
    scene: st ? st.scene : { openFrom: null },
    sceneFromNo: st && st.scene && st.scene.openFrom ? line.findIndex((m) => m.id === st.scene.openFrom) + 1 : 0,
    worker: workerView(st, line, next, beatAt(fsx), Date.now()),
    activity: st ? st.activity : [],
    // M4a: scenes the user deleted and kept out of the record, as message numbers
    marks: st ? markRanges(line, st.marks).map((x) => ({ id: x.id, fromNo: x.fromIdx + 1, toNo: x.toIdx + 1 })) : [],
    skipped: st ? skipRanges(st, line).map((x) => ({ fromNo: x.fromIdx + 1, toNo: x.toIdx + 1 })) : [],
    pinLimit: cfg.pinLimit,
    rev: st ? st.rev : 0,
    // M4d: arcs over older chapters, and the merge offer / the merge in progress
    arcs: arcsView(st, line),
    arcState: arcStateView(st, line, cfg, Date.now()),
    consolidate: consolidateView(st),
    ...chatViewExtras(fsx, chatId, st, line),
  };
}

/** M3 additions to one chat's view: the cut, the last insert and how many scenes a rebuild would take. */
function chatViewExtras(fsx, chatId, st, line) {
  const cfg = loadConfig(fsx);
  const count = st ? cutCount(st, line, cfg) : 0;
  const lastInsert = readJson(fsx, INSERT_DIR + chatId + ".json", null);
  return {
    cut: { count, upTo: count > 0 ? line[count - 1].id : null },
    lastInsert: isObj(lastInsert) ? lastInsert : null,
    rebuildScenes: findScenes(line, readDash(fsx, chatId), cfg, st ? st.marks : []).filter((x) => x.closed).length,
    // a rebuild in progress: chapters the new generation has so far, and when it began
    rebuilding: st && isObj(st.rebuild) ? { chapters: arr(st.rebuild.chapters).length, startedAt: Number(st.rebuild.startedAt) || 0 } : null,
  };
}

export function handleRoute(req, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx) return null;
  const path = String(req.path || "").split("?")[0];
  if (path === "/litopys/chats" && req.method === "GET") {
    return { status: 200, json: listChatsView(fsx) };
  }
  if (path === "/litopys/chat" && req.method === "GET") {
    const view = chatView(fsx, String((req.query && req.query.chatId) || ""));
    if (!view) return { status: 404, json: { error: "chat not found" } };
    return { status: 200, json: view };
  }
  // the config answers carry `custom`: which prompts differ from the default
  if (path === "/litopys/config" && req.method === "GET") {
    return { status: 200, json: { ...loadConfig(fsx), custom: customPrompts(fsx) } };
  }
  if (path === "/litopys/config" && req.method === "PUT") {
    const cfg = patchConfig(fsx, req.body || {});
    return { status: 200, json: { ...cfg, custom: customPrompts(fsx) } };
  }
  if (path === "/litopys/rebuild" && req.method === "POST") {
    const body = isObj(req.body) ? req.body : {};
    const res = rebuildChat(fsx, str(body.chatId), loadConfig(fsx));
    if (!res) return { status: 404, json: { error: "chat not found" } };
    if (res.busy) return { status: 409, json: { error: "busy, try again" } };
    if (res.none) return { status: 409, json: { error: "No scene is closed yet, so there is nothing to rebuild from and the record is untouched. Litopys sees these " + res.messages + " messages as one scene still going. A scene closes when the Dashboard sees a new place or a long jump in time; you can also close one by hand: message menu, Save as a scene.", none: true } };
    return { status: 200, json: res };
  }
  if (path === "/litopys/messages" && req.method === "GET") return messagesView(fsx, req.query || {});
  if (path === "/litopys/search" && req.method === "GET") return searchView(fsx, req.query || {});
  if (path === "/litopys/portraits" && req.method === "GET") return { status: 200, json: loadPortraits(fsx) };
  if (path === "/litopys/portraits" && req.method === "POST") return portraitRoute(fsx, req.body);
  if (path === "/litopys/carries" && req.method === "GET") return carriesRoute(fsx, req.query || {});
  if (path === "/litopys/card-memory" && ["GET", "PUT", "DELETE"].includes(req.method)) return cardMemoryRoute(req, fsx, "card");
  if (path === "/litopys/memory" && ["GET", "PUT", "DELETE"].includes(req.method)) return cardMemoryRoute(req, fsx);
  if (path === "/litopys/card-memory/preview" && req.method === "POST") return cardMemoryPostRoute(req, fsx, "preview", "card");
  if (path === "/litopys/card-memory/import" && req.method === "POST") return cardMemoryPostRoute(req, fsx, "import", "card");
  if (path === "/litopys/memory/preview" && req.method === "POST") return cardMemoryPostRoute(req, fsx, "preview");
  if (path === "/litopys/memory/import" && req.method === "POST") return cardMemoryPostRoute(req, fsx, "import");
  if (path === "/litopys/links" && req.method === "GET") return { status: 200, json: { links: loadLinks(fsx) } };
  if (path === "/litopys/links" && req.method === "POST") return linkRoute(fsx, req.body);
  if (path === "/litopys/facts" && req.method === "POST") return factRoute(fsx, req.body);
  if (path === "/litopys/chapters" && req.method === "POST") return chapterRoute(fsx, req.body);
  if (path === "/litopys/scenes" && req.method === "POST") return sceneRoute(fsx, req.body);
  if (path === "/litopys/arcs" && req.method === "POST") return arcRoute(fsx, req.body);
  if (path === "/litopys/consolidate" && req.method === "POST") return consolidateRoute(fsx, req.body);
  if (path === "/litopys/story-summary" && req.method === "POST") return summaryRoute(fsx, req.body);
  if (path === "/litopys/proposals" && req.method === "POST") return proposalRoute(fsx, req.body);
  if (path === "/litopys/habits" && req.method === "POST") return chatHabitRoute(fsx, req.body);
  if (path === "/litopys/config/prompts" && req.method === "DELETE") {
    const key = req.query && typeof req.query.key === "string" ? req.query.key : "";
    const cfg = resetPrompts(fsx, key);
    return { status: 200, json: { ...cfg, custom: customPrompts(fsx) } };
  }
  return null;
}

// ---------- the card's long memory (memory bridge, #102) ----------
// characters/<cardId>/memory.json: stories the character remembers, each a snapshot imported from a chat
// (a compressed arc, the strongest facts, notes and said lines), kept with a copy of the chat's title so a
// deleted chat breaks nothing. Never in card.json or the card's export. The prompt block is built here, next
// to the Litopys insert, so one pass sees what the story already carries and nothing is said twice.
const CARD_MEMORY_TOKENS = 400;
const IMPORT_TOP = { facts: 9, notes: 6, said: 4 };
const IMPORT_LIST = 30;
const memoryPath = (cardId) => "characters/" + cardId + "/memory.json";

function cardOf(fsx, cardId) {
  return SAFE_ID.test(cardId) ? readJson(fsx, "characters/" + cardId + "/card.json", null) : null;
}

// ---------- persona and world memory (issue #99): the same file and the same rules, a different owner ----------
// A persona's memory is memory/personas/<id>.json, a saved World DM world's is memory/worlds/<id>.json. Same shape
// as a card's (stories imported from chats, kept with a copy of the chat's title), but only the story and its facts:
// no habits, no per-character notes. A chat takes them in on its own (meta.memory.persona / .world): off until then.
const MEMORY_KINDS = ["card", "persona", "world"];
const OWNER_TOKENS = { card: CARD_MEMORY_TOKENS, persona: 300, world: 300 };
const WORLD_LIB_ID = /^w-[a-z0-9]{4,40}$/;
const PERSONA_MEMORY_RULE = "the characters recognise these when reminded or asked, and do not bring them up unprompted.";
const WORLD_MEMORY_RULE = "this is the established history of the world; keep it true, and do not retell it unprompted.";
const memoryFile = (kind, id) => (kind === "persona" ? "memory/personas/" + id + ".json" : kind === "world" ? "memory/worlds/" + id + ".json" : memoryPath(id));
const docName = (doc) => str(isObj(doc) ? doc.name || (isObj(doc.data) ? doc.data.name : "") : "");

/** The owner of a memory: { kind, id, doc, name, names } or null when it does not exist (a deleted persona or world). */
function ownerOf(fsx, kind, id) {
  if (!SAFE_ID.test(str(id))) return null;
  let doc = null;
  if (kind === "card") doc = cardOf(fsx, id);
  else if (kind === "persona") doc = readJson(fsx, "personas/" + id + ".json", null);
  else if (kind === "world" && WORLD_LIB_ID.test(id)) doc = readJson(fsx, "world/library/" + id + ".json", null);
  if (!isObj(doc)) return null;
  const names = kind === "card" ? cardNamesOf(doc) : new Set([docName(doc).toLowerCase()].filter(Boolean));
  return { kind, id, doc, name: docName(doc), names };
}

/** The persona a chat plays with now: its own pick, else the app's. */
function personaIdOf(fsx, meta) {
  const own = str(meta && meta.personaId);
  if (own) return own;
  const set = readJson(fsx, "settings.json", null);
  return isObj(set) ? str(set.personaId) : "";
}

/** The saved world a chat was started in (World DM state origin), or "". */
function worldIdOf(fsx, chatId) {
  if (!SAFE_ID.test(str(chatId))) return "";
  const st = readJson(fsx, "world/state/" + chatId + ".json", null);
  return isObj(st) && isObj(st.origin) && st.origin.kind === "library" ? str(st.origin.worldId) : "";
}

/** The names a card answers to: its own, and the characters of its Soul (a narrator card has several). */
function cardNamesOf(card) {
  const names = new Set();
  const add = (n) => {
    const s = str(n).toLowerCase();
    if (s) names.add(s);
  };
  if (isObj(card)) {
    add(card.name);
    if (isObj(card.data)) add(card.data.name);
    const soul = isObj(card.extensions) ? card.extensions.molfar_soul : null;
    for (const k of Object.keys(isObj(soul) && isObj(soul.characters) ? soul.characters : {})) add(k);
  }
  return names;
}

const HABITS_TOKENS = 250;
const HABIT_MAX = 30;
const HABIT_ORIGINS = new Set(["user", "molfar", "story"]);

/** A habit as the code reads it: a name, 1-6 lines of rule, an optional one-line `when`; null when it has no name or rule. */
function normalizeHabit(raw) {
  if (!isObj(raw) || !str(raw.id)) return null;
  const name = cut(str(raw.name).replace(/\s+/g, " "), 80);
  const rule = cut(
    str(raw.rule)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join("\n"),
    700,
  );
  if (!name || !rule) return null;
  const from = isObj(raw.from) && (str(raw.from.chatId) || str(raw.from.title)) ? { chatId: str(raw.from.chatId), title: cut(str(raw.from.title), 120), at: Number(raw.from.at) || 0 } : null;
  return {
    id: str(raw.id),
    name,
    rule,
    when: cut(str(raw.when).replace(/\s+/g, " "), 160),
    on: raw.on !== false,
    origin: HABIT_ORIGINS.has(raw.origin) ? raw.origin : "user",
    state: raw.state === "proposed" ? "proposed" : "accepted",
    ...(from ? { from } : {}),
  };
}

/** The file as the code reads it; keys it does not know ride along (changes come later, #106). */
export function normalizeMemory(raw, kind = "card") {
  const m = isObj(raw) ? raw : {};
  const { sources: _s, inject: _i, v: _v, next: _n, habits: _k, nextHabit: _nk, skills: _ok, nextSkill: _onk, ...rest } = m;
  const items = (list, pick) => arr(list).filter((x) => isObj(x) && str(x.text)).map(pick);
  const sources = arr(m.sources)
    .filter((s) => isObj(s) && str(s.id))
    .map((s) => ({
      id: str(s.id),
      chatId: str(s.chatId),
      title: cut(str(s.title), 120),
      importedAt: Number(s.importedAt) || 0,
      on: s.on !== false,
      canon: s.canon === "separate" ? "separate" : "main",
      arc: cut(str(s.arc), 1500),
      facts: items(s.facts, (f) => ({ text: cut(str(f.text), 300), subject: cut(str(f.subject), 80) })),
      notes: items(s.notes, (n) => ({ who: cut(str(n.who), 80), how: ["saw", "heard", "guess"].includes(n.how) ? n.how : "saw", text: cut(str(n.text), 300) })),
      said: items(s.said, (x) => ({ who: cut(str(x.who), 80), text: cut(str(x.text), 300), kind: cut(str(x.kind), 20) || "other" })),
    }));
  const inj = isObj(m.inject) ? m.inject : {};
  const top = sources.reduce((n, s) => Math.max(n, Number(String(s.id).replace(/\D/g, "")) || 0), 0);
  const seen = new Set();
  // habits were called skills until 4.67.0: the old keys are read when the new ones are not there
  const habits = arr(m.habits ?? m.skills)
    .map(normalizeHabit)
    .filter((k) => k && !seen.has(k.id) && seen.add(k.id))
    .slice(0, HABIT_MAX);
  const topHabit = habits.reduce((n, k) => Math.max(n, Number(k.id.replace(/\D/g, "")) || 0), 0);
  return {
    ...rest,
    v: 1,
    next: Math.max(Number(m.next) || 0, top),
    nextHabit: Math.max(Number(m.nextHabit ?? m.nextSkill) || 0, topHabit),
    sources,
    habits,
    inject: {
      enabled: inj.enabled !== false,
      maxTokens: clamp(Math.round(Number(inj.maxTokens)) || OWNER_TOKENS[kind] || CARD_MEMORY_TOKENS, 100, 1500),
      habitsMaxTokens: clamp(Math.round(Number(inj.habitsMaxTokens ?? inj.skillsMaxTokens)) || HABITS_TOKENS, 50, 800),
    },
  };
}

export const loadMemory = (fsx, id, kind = "card") => normalizeMemory(readJson(fsx, memoryFile(kind, id), null), kind);
const saveMemory = (fsx, id, mem, kind = "card") => fsx.write(memoryFile(kind, id), JSON.stringify(mem, null, 2));

/** Whether a text is already said by one of the lines (a copy, a near copy, or contained in a longer line). */
function saidAlready(text, lines) {
  const n = normText(text);
  return arr(lines).some((l) => {
    const t = String(l);
    return (n.length > 12 && normText(t).includes(n)) || diceSimilarity(text, t) >= DICE_LIMIT;
  });
}

const rankFact = (f) => (f.pinned ? 100 : 0) + (f.weight === "key" ? 20 : f.weight === "important" ? 10 : 0) + (Number(f.updatedAt) || 0) / 1e14;
const rankNote = (n) => (n.tag === "pinned" ? 100 : n.tag === "important" ? 50 : 0) + (n.weight === "key" ? 40 : n.weight === "important" ? 20 : 0) + (Number(n.turn) || 0) / 1e6;

/** What the chat said and is held to (the Dashboard's `said`, ported reading only), carried entries included. */
function liveSaid(dash, line, overlay) {
  const keys = new Set(line.map((m) => m.id + "#" + (Number.isFinite(m.swipe) ? m.swipe : 0)));
  keys.add("inherit");
  const edits = isObj(overlay && overlay.edits) ? overlay.edits : {};
  const out = [];
  for (const [holder, list] of Object.entries(isObj(dash && dash.said) ? dash.said : {})) {
    for (const s of arr(list)) {
      if (!isObj(s) || !keys.has(s.src) || !str(s.text)) continue;
      const e = isObj(edits[s.id]) ? edits[s.id] : null;
      if (e && e.retired === true) continue;
      out.push({ holder, id: str(s.id), text: e && str(e.text) ? str(e.text) : str(s.text), kind: str(s.kind) || "other", turn: Number(s.turn) || 0 });
    }
  }
  return out;
}

/** The chats a card can take a memory from: the ones with this card, newest first. A persona's: the ones played with it;
 *  a world's: the ones started in it. */
function cardChats(fsx, cardId, mem, kind = "card") {
  let files = [];
  try {
    files = fsx.list("chats").filter((f) => f.endsWith(".meta.json"));
  } catch {}
  const out = [];
  for (const f of files) {
    const id = f.replace(/\.meta\.json$/, "");
    const meta = readJson(fsx, "chats/" + f, null);
    if (!SAFE_ID.test(id) || !isObj(meta) || meta.temporary) continue;
    let mine = str(meta.characterId) === cardId;
    if (kind === "persona") mine = personaIdOf(fsx, meta) === cardId;
    else if (kind === "world") mine = worldIdOf(fsx, id) === cardId;
    else if (!mine && str(meta.groupId)) mine = arr((readJson(fsx, "groups/" + str(meta.groupId) + ".json", null) || {}).memberIds).map(str).includes(cardId);
    if (!mine) continue;
    const src = mem.sources.find((s) => s.chatId === id);
    out.push({ id, title: str(meta.title) || id, updatedAt: Number(meta.updatedAt) || 0, imported: src ? src.id : null });
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out.slice(0, 200);
}

/** What an import of this chat would take, before anything is written. Items carry the chat's own ids. */
export function previewImport(fsx, cardId, chatId, kind = "card") {
  const owner = ownerOf(fsx, kind, cardId);
  const rc = SAFE_ID.test(chatId) ? readChat(fsx, chatId) : null;
  if (!owner || !rc) return null;
  const mem = loadMemory(fsx, cardId, kind);
  const names = owner.names;
  const mine = (holder) => names.has(str(holder).toLowerCase());
  if (kind !== "card") return previewShared(fsx, owner, mem, chatId, rc);
  const line = activeLine(rc.msgs);
  const st = loadChatFile(fsx, chatId);
  const dash = readDash(fsx, chatId);
  const overlay = readJson(fsx, "dashboard/notes/" + chatId + ".json", null);
  // what the card memory already holds from other chats: the same line is not offered twice
  const others = mem.sources.filter((s) => s.chatId !== chatId);
  const held = (list) => others.flatMap((s) => arr(s[list]).map((x) => x.text));
  const flag = (text, lines) => (saidAlready(text, lines) ? "memory" : null);

  let arc = "";
  if (st) {
    const arcs = arr(st.arcs).filter((a) => isObj(a) && str(a.text) && a.stale !== true);
    arc = arcs.length ? arcs.map((a) => str(a.text)).join(" ") : arr(st.chapters).slice(-3).map((c) => str(c.text)).filter(Boolean).join(" ");
  }
  arc = cut(arc, 1200);

  const facts = (st ? st.facts : [])
    .filter((f) => isObj(f) && f.status === "active" && str(f.text) && (f.knownBy === "all" || f.knownBy === undefined))
    .sort((a, b) => rankFact(b) - rankFact(a))
    .slice(0, IMPORT_LIST)
    .map((f, i) => {
      const dup = flag(f.text, held("facts"));
      return { id: str(f.id), text: str(f.text), subject: str(f.subject), weight: f.weight || null, dup, checked: !dup && i < IMPORT_TOP.facts };
    });
  const notes = liveNotes(dash, line, overlay, true)
    .filter((n) => mine(n.holder) && n.text)
    .sort((a, b) => rankNote(b) - rankNote(a))
    .slice(0, IMPORT_LIST)
    .map((n, i) => {
      const dup = flag(n.text, held("notes"));
      return { id: n.id, who: n.holder, text: n.text, how: n.how || "saw", dup, checked: !dup && i < IMPORT_TOP.notes };
    });
  const said = liveSaid(dash, line, overlay)
    .filter((s) => mine(s.holder))
    .sort((a, b) => b.turn - a.turn)
    .slice(0, IMPORT_LIST)
    .map((s, i) => {
      const dup = flag(s.text, held("said"));
      return { id: s.id, who: s.holder, text: s.text, kind: s.kind, dup, checked: !dup && i < IMPORT_TOP.said };
    });
  // habits this chat earned for the card's character (#113): the ones acting here, not yet on the card
  const habits = (st ? st.habits : [])
    .filter((k) => isObj(k) && k.status === "active" && !k.kept && mine(k.who) && str(k.name) && str(k.rule))
    .slice(0, IMPORT_LIST)
    .map((k) => {
      const dup = mem.habits.some((h) => diceSimilarity(h.rule, k.rule) >= DICE_LIMIT) ? "memory" : null;
      return { id: str(k.id), who: str(k.who), name: str(k.name), rule: str(k.rule), when: str(k.when), dup, checked: !dup };
    });
  const already = mem.sources.find((s) => s.chatId === chatId);
  return {
    chat: { id: chatId, title: str(rc.meta.title) || chatId },
    already: already ? already.id : null,
    arc: arc ? { text: arc, tokens: estimateTokens(arc) } : null,
    facts,
    notes,
    said,
    habits,
    summary: st ? summaryView(st) : null,
  };
}

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nameMention = (name) => new RegExp("(^|[^\\p{L}\\p{N}])" + escapeRe(name) + "(?![\\p{L}\\p{N}])", "iu");


/**
 * The import preview of a persona's or a world's memory: the chat's story, and the facts that are about the owner.
 * A persona: facts whose subject is the persona (its name now, or the name the chat used) or whose text names it.
 * A world: facts about the world itself (subject "world" or type "world"). No notes, no said lines, no habits.
 */
function previewShared(fsx, owner, mem, chatId, rc) {
  const st = loadChatFile(fsx, chatId);
  const others = mem.sources.filter((s) => s.chatId !== chatId);
  const held = others.flatMap((s) => arr(s.facts).map((x) => x.text));
  let arc = "";
  if (st) {
    const arcs = arr(st.arcs).filter((a) => isObj(a) && str(a.text) && a.stale !== true);
    arc = arcs.length ? arcs.map((a) => str(a.text)).join(" ") : arr(st.chapters).slice(-3).map((c) => str(c.text)).filter(Boolean).join(" ");
  }
  arc = cut(arc, 1200);
  const userName = str(rc.meta.userName).toLowerCase();
  const mention = owner.kind === "persona" && owner.name.length >= 2 ? nameMention(owner.name) : null;
  const about = (f) => {
    const subj = str(f.subject).toLowerCase();
    if (owner.kind === "world") return subj === "world" || f.type === "world";
    return (!!subj && (owner.names.has(subj) || subj === userName)) || (!!mention && mention.test(str(f.text)));
  };
  const facts = (st ? st.facts : [])
    .filter((f) => isObj(f) && f.status === "active" && str(f.text) && (f.knownBy === "all" || f.knownBy === undefined) && about(f))
    .sort((a, b) => rankFact(b) - rankFact(a))
    .slice(0, IMPORT_LIST)
    .map((f, i) => {
      const dup = saidAlready(f.text, held) ? "memory" : null;
      return { id: str(f.id), text: str(f.text), subject: str(f.subject), weight: f.weight || null, dup, checked: !dup && i < IMPORT_TOP.facts };
    });
  const already = mem.sources.find((s) => s.chatId === chatId);
  return {
    kind: owner.kind,
    chat: { id: chatId, title: str(rc.meta.title) || chatId },
    already: already ? already.id : null,
    arc: arc ? { text: arc, tokens: estimateTokens(arc) } : null,
    facts,
    notes: [],
    said: [],
    habits: [],
    summary: st ? summaryView(st) : null,
  };
}

/** Write the chosen items as a source (a second import of the same chat refreshes that source). */
export function importChat(fsx, cardId, chatId, sel, kind = "card") {
  const prev = previewImport(fsx, cardId, chatId, kind);
  if (!prev) return { status: 404, json: { error: "no such card or chat" } };
  const pick = (items, ids) => items.filter((x) => arr(ids).map(str).includes(x.id));
  const facts = pick(prev.facts, sel.facts);
  const notes = pick(prev.notes, sel.notes);
  const said = pick(prev.said, sel.said);
  const habits = pick(prev.habits, sel.habits);
  // the text the user settled on in the dialog (the model's summary, edited or not) replaces the one built from the record
  const own = typeof sel.arcText === "string" ? cut(sel.arcText.trim(), 1500) : "";
  const arc = sel.arc === false ? "" : own || (prev.arc ? prev.arc.text : "");
  if (!arc && !facts.length && !notes.length && !said.length && !habits.length) return { status: 400, json: { error: "nothing selected to remember" } };
  const mem = loadMemory(fsx, cardId, kind);
  const now = Date.now();
  // a habit goes to the card as an accepted habit of the story, like "keep" does; a rule the card has is as good as kept
  const kept = [];
  for (const k of habits) {
    const err = editHabit(mem, { name: k.name, rule: k.rule, when: k.when, origin: "story", state: "accepted", from: { chatId, title: prev.chat.title, at: now } });
    if (!err || /already there/.test(err)) kept.push(k.id);
  }
  const body = {
    chatId,
    title: prev.chat.title,
    importedAt: Date.now(),
    arc,
    facts: facts.map((f) => ({ text: f.text, subject: f.subject })),
    notes: notes.map((n) => ({ who: n.who, how: n.how, text: n.text })),
    said: said.map((s) => ({ who: s.who, text: s.text, kind: s.kind })),
  };
  // only habits ticked: no story is written, the habits are all this import takes
  if (arc || facts.length || notes.length || said.length) {
    const at = mem.sources.findIndex((s) => s.chatId === chatId);
    if (at >= 0) mem.sources[at] = { ...mem.sources[at], ...body };
    else {
      mem.next += 1;
      mem.sources.push({ id: "s" + mem.next, on: true, canon: "main", ...body });
    }
  }
  const out = normalizeMemory(mem, kind);
  saveMemory(fsx, cardId, out, kind);
  if (kept.length) {
    // the chat's habit now says where it went, so it is not offered or said twice
    mutateChat(fsx, chatId, (st) => {
      for (const k of st.habits) if (kept.includes(str(k.id))) k.kept = { cardId, at: now };
    });
  }
  return { status: 200, json: { ...cardMemoryView(fsx, cardId, out, kind), imported: { habits: kept.length, habitsLeft: habits.length - kept.length } } };
}

/** The card's memory with the chats it can still take one from, and what a new chat would receive. */
function cardMemoryView(fsx, cardId, mem, kind = "card") {
  const owner = ownerOf(fsx, kind, cardId);
  const card = owner && owner.doc;
  if (kind !== "card") {
    const block = cardMemoryText(mem, card, { exclude: new Set(), only: null, chosen: [], kind });
    return { kind, ownerId: cardId, name: owner ? owner.name : "", memory: mem, chats: cardChats(fsx, cardId, mem, kind), tokens: block ? block.tokens : 0, budget: mem.inject.maxTokens };
  }
  const block = cardMemoryText(mem, card, { exclude: new Set(), only: null, chosen: habitLines(mem), rule: loadConfig(fsx).cardMemory });
  const habits = cardHabitsText(mem, card, { cardSentences: [], chosen: [] });
  return {
    kind,
    cardId,
    memory: mem,
    chats: cardChats(fsx, cardId, mem),
    tokens: block ? block.tokens : 0,
    budget: mem.inject.maxTokens,
    habitsTokens: habits ? habits.tokens : 0,
    habitsBudget: mem.inject.habitsMaxTokens,
  };
}

// ---------- card habits (#106): short rule blocks for how a character acts ----------
const RULE_SENTENCES = (rule) => String(rule).split(SENTENCE_SPLIT).map((s) => s.trim()).filter((s) => s.length >= 12);

/** The rules of the habits that are on, as lines the memory block is compared with (a fact that repeats a rule is left out). */
function habitLines(mem) {
  return mem.habits.filter((k) => k.on && k.state === "accepted").flatMap((k) => [k.rule, ...RULE_SENTENCES(k.rule)]);
}

/**
 * The block of a character's habits: the ones that are on and accepted, in the order of the file (so the text
 * does not move between replies), until the budget is spent. A habit whose every sentence repeats the card's own
 * text or a line already in the prompt is left out and counted in `dupes`. Returns { text, tokens, dupes, habits } or null.
 */
export function cardHabitsText(mem, card, opts) {
  if (!isObj(card)) return null;
  const own = arr(opts.cardSentences);
  const lines = arr(opts.chosen);
  const name = str(card.name || (isObj(card.data) ? card.data.name : "")) || "the character";
  const head = "[Character habits: how " + name + " acts, from what happened in earlier stories. Follow these as habits, not as lines to quote:";
  const out = [];
  const used = [];
  let spent = estimateTokens(head + "]");
  let dupes = 0;
  const onCard = mem.habits.filter((k) => k.on && k.state === "accepted");
  // earned in this chat (opts.extra), after the card's own; one the card keeps already is not said twice
  const extra = arr(opts.extra).filter((k) => !onCard.some((c) => diceSimilarity(c.rule, k.rule) >= CHAT_HABIT_SAME));
  for (const k of [...mem.habits, ...extra]) {
    if (!k.on || k.state !== "accepted") continue;
    const sentences = RULE_SENTENCES(k.rule);
    if (sentences.length && sentences.every((s) => repeatsSource(s, own) || saidAlready(s, lines))) {
      dupes++;
      continue;
    }
    const line = "- " + k.name + ": " + k.rule.split("\n").join(" ") + (k.when ? " (When: " + k.when + ")" : "");
    const t = estimateTokens(line + "\n");
    if (spent + t > mem.inject.habitsMaxTokens) continue;
    spent += t;
    out.push(line);
    used.push(k.id);
  }
  if (!out.length) return null;
  const text = head + "\n" + out.join("\n") + "]";
  return { text, tokens: estimateTokens(text), dupes, habits: used };
}

// ---------- habits a character earns in a chat (#106) ----------
// The chapter worker reports habits a character showed in a scene. A first sighting is only a candidate
// ("proposed"); seen in `habitsEarnAfter` different chapters it is earned ("active") and starts to act in this chat.
// The user can switch one off, accept it early, edit it, reject it, or keep it on the card (where it acts in every
// chat of the card). A rejected one stays as a tombstone so it does not come back.
const CHAT_HABIT_MAX = 12;
const CHAT_HABIT_NEW_PER_CHAPTER = 2;
const CHAT_HABIT_SAME = 0.6;

const habitRule = (v) =>
  cut(
    str(v)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6)
      .join("\n"),
    700,
  );

/** The rules already on the chat's card(s): a habit the card keeps is not earned a second time. */
function cardHabitRules(fsx, meta) {
  const ids = [];
  if (meta && meta.groupId) for (const id of arr((readJson(fsx, "groups/" + str(meta.groupId) + ".json", null) || {}).memberIds)) ids.push(str(id));
  else if (meta && meta.characterId) ids.push(str(meta.characterId));
  const out = [];
  for (const id of ids) {
    if (!SAFE_ID.test(id)) continue;
    for (const k of loadMemory(fsx, id).habits) if (k.state === "accepted") out.push(k.rule);
  }
  return out;
}

/**
 * Apply the worker's `habits` list to the chat record. `c` = { now, chapterId, earnAfter, userName, sources, cardRules }.
 * Returns { added, reinforced, earned }.
 */
export function applyHabits(st, list, c) {
  const res = { added: 0, reinforced: 0, earned: 0, addedList: [], earnedList: [] };
  st.habits = arr(st.habits);
  st.counters.habit = Number(st.counters.habit) || 0;
  let fresh = 0;
  for (const op of arr(list).slice(0, 6)) {
    if (!isObj(op)) continue;
    const evidence = cut(str(op.evidence), 200);
    let target = null;
    const rid = str(op.reinforce || op.id);
    if (rid) target = st.habits.find((k) => k.id === rid && k.status !== "rejected") || null;
    if (!target) {
      const who = cut(str(op.who), 80);
      const name = cut(str(op.name).replace(/\s+/g, " "), 80);
      const rule = habitRule(op.rule);
      if (!who || !name || !rule) continue;
      if (c.userName && who.toLowerCase() === str(c.userName).toLowerCase()) continue;
      const same = st.habits.find((k) => str(k.who).toLowerCase() === who.toLowerCase() && diceSimilarity(k.rule, rule) >= CHAT_HABIT_SAME);
      if (same) {
        // seen again, said in other words; one the user rejected does not come back
        if (same.status === "rejected") continue;
        target = same;
      } else {
        if (repeatsSource(rule, c.sources) || arr(c.cardRules).some((r) => diceSimilarity(r, rule) >= CHAT_HABIT_SAME)) continue;
        if (fresh >= CHAT_HABIT_NEW_PER_CHAPTER) continue;
        if (st.habits.filter((k) => k.status !== "rejected").length >= CHAT_HABIT_MAX) continue;
        const made = {
          id: "k" + ++st.counters.habit,
          who,
          name,
          rule,
          when: cut(str(op.when).replace(/\s+/g, " "), 160),
          status: "proposed",
          on: true,
          seen: 1,
          chapters: [c.chapterId],
          evidence: evidence ? [{ text: evidence, chapter: c.chapterId }] : [],
          origin: "chapter",
          at: c.now,
          updatedAt: c.now,
        };
        st.habits.push(made);
        fresh++;
        res.added++;
        res.addedList.push(made);
        // a bar of one sighting is already earned
        if (made.seen >= c.earnAfter) {
          made.status = "active";
          made.earnedAt = c.now;
          res.earned++;
          res.earnedList.push(made);
          res.addedList.pop();
        }
        continue;
      }
    }
    // a rewrite of the same chapter is not a second sighting
    if (arr(target.chapters).includes(c.chapterId)) continue;
    target.chapters = [...arr(target.chapters), c.chapterId];
    target.seen = target.chapters.length;
    if (evidence) target.evidence = [...arr(target.evidence), { text: evidence, chapter: c.chapterId }].slice(-3);
    target.updatedAt = c.now;
    res.reinforced++;
    if (target.status === "proposed" && target.seen >= c.earnAfter) {
      target.status = "active";
      target.earnedAt = c.now;
      res.earned++;
      res.earnedList.push(target);
    }
  }
  // tombstones make room first
  while (st.habits.length > 3 * CHAT_HABIT_MAX) {
    const i = st.habits.findIndex((k) => k.status === "rejected");
    st.habits.splice(i >= 0 ? i : 0, 1);
  }
  return res;
}

/** The habits of this chat that act now for a card: earned, switched on, said by one of the card's names. */
function chatHabitsFor(fsx, chatId, card) {
  const st = SAFE_ID.test(str(chatId)) ? loadChatFile(fsx, chatId) : null;
  if (!st) return [];
  const names = cardNamesOf(card);
  return st.habits
    .filter((k) => k.status === "active" && k.on !== false && names.has(str(k.who).toLowerCase()))
    .map((k) => ({ id: "c" + k.id, name: k.name, rule: k.rule, when: str(k.when), on: true, state: "accepted" }));
}

/** The card whose turn it is: in a group only the speaker's own card talks. */
function cardOfReply(fsx, meta, speakerName) {
  let ids = [];
  const grouped = !!str(meta.groupId);
  if (grouped) ids = arr((readJson(fsx, "groups/" + str(meta.groupId) + ".json", null) || {}).memberIds).map(str);
  else if (str(meta.characterId)) ids = [str(meta.characterId)];
  for (const id of ids) {
    const c = cardOf(fsx, id);
    if (isObj(c) && (!grouped || cardNamesOf(c).has(str(speakerName).toLowerCase()))) return { card: c, cardId: id };
  }
  return null;
}

/**
 * The names that are no character of their own to remember a scene: those that voice the story (a group in narrator
 * mode speaks as the group), and another spelling of a card's own character (the Soul keyed "Sina" for the card
 * "Sina Rose": the Dashboard may list both, the scene has one person).
 */
function narratorNames(fsx, meta) {
  const out = ["Narrator"];
  const gid = str(meta && meta.groupId);
  const g = gid && SAFE_ID.test(gid) ? readJson(fsx, "groups/" + gid + ".json", null) : null;
  if (isObj(g) && g.generationMode === "narrator" && str(g.name)) out.push(str(g.name));
  const ids = [str(meta && meta.characterId), ...(isObj(g) ? arr(g.memberIds).map(str) : [])].filter(Boolean);
  for (const id of ids) {
    const card = cardOf(fsx, id);
    const own = isObj(card) ? str(card.name).toLowerCase() : "";
    const souls = isObj(card) && isObj(card.extensions) && isObj(card.extensions.molfar_soul) ? card.extensions.molfar_soul.characters : null;
    if (!own || !isObj(souls)) continue;
    for (const [key, soul] of Object.entries(souls)) {
      const forms = [key, ...(isObj(soul) ? arr(soul.aliases) : [])].map(str).filter(Boolean);
      if (forms.some((f) => f.toLowerCase() === own)) out.push(...forms.filter((f) => f.toLowerCase() !== own));
    }
  }
  return out;
}

/**
 * Whose recollections this reply carries (#99): a group in narrator mode and a narrator card voice several
 * characters, so the reply carries all of theirs; otherwise only the speaking card's own. Names are lower case.
 */
function recollectors(fsx, meta, speakerName) {
  const gid = str(meta && meta.groupId);
  const g = gid && SAFE_ID.test(gid) ? readJson(fsx, "groups/" + gid + ".json", null) : null;
  if (isObj(g) && g.generationMode === "narrator") {
    const names = new Set();
    for (const id of arr(g.memberIds).map(str)) for (const n of cardNamesOf(cardOf(fsx, id))) names.add(n);
    return { names, many: true, name: "" };
  }
  const hit = cardOfReply(fsx, meta, speakerName);
  if (hit) {
    const names = cardNamesOf(hit.card);
    return { names, many: names.size > 1, name: str(hit.card.name) };
  }
  return { names: new Set(), many: false, name: "" };
}

/** The room of the "what the character remembers" block, in tokens. */
const RECOLLECT_TOKENS = 300;

/**
 * The block "what the character remembers" (#99): the recollections the chapter worker wrote for the character (or,
 * for a narrator, for everyone it voices) of the scenes that have left the prompt, newest first, whole scenes, within
 * RECOLLECT_TOKENS. The same text between replies until a chapter closes or the speaker changes, so it can sit above
 * the history. null when the chat has none for this reply.
 */
export function recollectionsFor({ fsx, meta, st, line, cut, speakerName }) {
  if (!st || !line.length) return null;
  const { names, many, name } = recollectors(fsx, meta, speakerName);
  if (!names.size) return null;
  const rows = [];
  for (const ch of chaptersBeforeCut(st, line, cut)) {
    const mine = arr(ch.views).filter((x) => isObj(x) && str(x.text) && names.has(str(x.who).toLowerCase()));
    if (mine.length) rows.push({ ch, mine });
  }
  if (!rows.length) return null;
  const head = many
    ? "[What each character remembers of earlier scenes (Litopys): their own view, in their own words, of what they saw, heard or were told. It is how they remember it. Each knows only their own part, so never let one use what only another remembers.]"
    : "[What " + (name || "this character") + " remembers of earlier scenes (Litopys): their own view, in their own words, of what they saw, heard or were told. It is how they remember it, and they know nothing of those scenes beyond it.]";
  const lineOf = (ch, v) => "- " + (str(ch.label) ? str(ch.label) + ": " : "") + (many ? str(v.who) + ": " : "") + str(v.text);
  const picked = [];
  const render = () => [head, ...rows.filter((r) => picked.includes(r)).flatMap((r) => r.mine.map((v) => lineOf(r.ch, v)))].join("\n");
  // newest scene first into the room; a scene goes in whole or not at all
  for (const r of rows.slice().reverse()) {
    picked.push(r);
    if (estimateTokens(render()) > RECOLLECT_TOKENS) {
      picked.pop();
      break;
    }
  }
  if (!picked.length) return null;
  const text = render();
  return { text, tokens: estimateTokens(text), scenes: picked.length, who: [...new Set(picked.flatMap((r) => r.mine.map((v) => str(v.who))))] };
}

/** The habits block of this reply's card, or null. `chosen` = the lines the story already puts in the prompt. */
export function cardHabitsFor({ fsx, chatId, meta, speakerName, chosen }) {
  const hit = cardOfReply(fsx, meta, speakerName);
  if (!hit) return null;
  const mem = loadMemory(fsx, hit.cardId);
  // what this character earned in this chat acts here at once, before the user keeps it on the card
  const extra = chatId ? chatHabitsFor(fsx, chatId, hit.card) : [];
  if (!mem.habits.length && !extra.length) return null;
  const res = cardHabitsText(mem, hit.card, { cardSentences: sourceSentences(fsx, meta), chosen, extra });
  return res ? { ...res, cardId: hit.cardId } : null;
}

/** A code the app turns into its own language (the English text stays for Molfar and the log). */
const habitErrorCode = (err) =>
  err === "no such habit" ? "missing" : /at most/.test(err) ? "full" : /already there/.test(err) ? "repeat" : /needs a name/.test(err) ? "empty" : "";

/** Create or change one habit. `s` = { id?, name?, rule?, when?, on?, state?, origin?, from? }; returns an error text or null. */
function editHabit(mem, s) {
  const id = str(s.id);
  if (id) {
    const k = mem.habits.find((x) => x.id === id);
    if (!k) return "no such habit";
    const next = normalizeHabit({
      ...k,
      ...(s.name !== undefined ? { name: s.name } : {}),
      ...(s.rule !== undefined ? { rule: s.rule } : {}),
      ...(s.when !== undefined ? { when: s.when } : {}),
      ...(typeof s.on === "boolean" ? { on: s.on } : {}),
      // a proposal is confirmed here; nothing turns an accepted habit back into a proposal
      ...(s.state === "accepted" ? { state: "accepted" } : {}),
    });
    if (!next) return "a habit needs a name and a rule";
    mem.habits[mem.habits.indexOf(k)] = next;
    return null;
  }
  if (mem.habits.length >= HABIT_MAX) return "a card holds at most " + HABIT_MAX + " habits";
  const nextId = "k" + (mem.nextHabit + 1);
  const fresh = normalizeHabit({
    id: nextId,
    name: s.name,
    rule: s.rule,
    when: s.when,
    on: s.on !== false,
    origin: s.origin,
    state: s.state === "proposed" ? "proposed" : "accepted",
    from: s.from,
  });
  if (!fresh) return "a habit needs a name and a rule";
  // the same rule twice helps nobody (a proposal from a story often comes back)
  if (mem.habits.some((k) => diceSimilarity(k.rule, fresh.rule) >= DICE_LIMIT)) return "a habit with this rule is already there";
  mem.nextHabit += 1;
  mem.habits.push(fresh);
  return null;
}

/**
 * The block a reply gets: for each active source, its arc, then the strongest facts, notes and said lines,
 * in that order, until the budget is spent. `exclude` = chats whose story the chat already carries (itself,
 * its backstory chain); `only` = per-chat choice of sources (a "separate" canon needs it); `chosen` = the lines
 * Litopys and the Dashboard already put in this prompt: a card line that repeats one is left out.
 * Returns { text, tokens, dupes, sources } or null.
 */
export function cardMemoryText(mem, card, opts) {
  if (!mem.inject.enabled || !isObj(card)) return null;
  const { exclude, only, chosen } = opts;
  const own = arr(opts.cardSentences);
  const shared = opts.kind === "persona" || opts.kind === "world";
  const live = mem.sources.filter((s) => {
    if (!s.on || (s.chatId && exclude.has(s.chatId))) return false;
    // a persona's or a world's stories are one canon: a chat picks the whole memory, not its stories one by one
    if (shared) return s.canon !== "separate";
    if (only && only[s.id] === false) return false;
    return s.canon !== "separate" || (only && only[s.id] === true);
  });
  if (!live.length) return null;
  const lines = [...arr(chosen)];
  let dupes = 0;
  // a line goes in once: not in the story already, not in the card's own text, not from an earlier source
  const fresh = (text) => {
    if (saidAlready(text, lines) || repeatsSource(text, own)) {
      dupes++;
      return false;
    }
    lines.push(text);
    return true;
  };
  const name = str(card.name || (isObj(card.data) ? card.data.name : "")) || "the character";
  const head =
    opts.kind === "persona"
      ? "[What " + name + " (the player's character) has lived through in earlier stories (persona memory): " + PERSONA_MEMORY_RULE
      : opts.kind === "world"
        ? "[What happened in " + name + " in earlier stories (world memory): " + WORLD_MEMORY_RULE
        : "[What " + name + " remembers from earlier stories (character memory): " + (str(opts.rule) || CARD_MEMORY_RULE).replaceAll("{name}", name);
  const out = [];
  const used = [];
  let spent = estimateTokens(head + "]");
  const room = mem.inject.maxTokens;
  const add = (text) => {
    const t = estimateTokens(text + "\n");
    if (spent + t > room) return false;
    spent += t;
    out.push(text);
    return true;
  };
  // arcs first, shortest first, so the most stories fit
  for (const s of [...live].sort((a, b) => a.arc.length - b.arc.length)) {
    if (s.arc && fresh(s.arc) && add((s.title ? s.title + ": " : "") + s.arc)) used.push(s.id);
  }
  for (const [label, list, fmt] of [
    ["Facts", "facts", (x) => x.text],
    ["Notes", "notes", (x) => x.text],
    ["Said", "said", (x) => x.kind + " “" + x.text + "”"],
  ]) {
    const picked = [];
    for (const s of live) {
      for (const x of s[list]) {
        if (!fresh(x.text)) continue;
        const line = fmt(x);
        if (spent + estimateTokens(line + "; ") > room) break;
        spent += estimateTokens(line + "; ");
        picked.push(line);
        if (!used.includes(s.id)) used.push(s.id);
      }
    }
    if (picked.length) out.push(label + ": " + picked.join("; ") + ".");
  }
  if (!out.length) return null;
  const text = head + "\n" + out.join("\n") + "]";
  return { text, tokens: estimateTokens(text), dupes, sources: used };
}

/** The card behind this reply, and what the Litopys insert and the Dashboard already say, for the block above. */
export function cardMemoryFor({ fsx, chatId, meta, speakerName, chosen, dash, cfg }) {
  const hit = cardOfReply(fsx, meta, speakerName);
  if (!hit) return null;
  const { card, cardId } = hit;
  const mem = loadMemory(fsx, cardId);
  if (!mem.sources.length) return null;
  const { exclude, seen } = storyChain(fsx, chatId);
  const mc = isObj(meta.memory) ? meta.memory : {};
  // What it is compared with must not move between replies (the block sits above the history, so a moving text
  // would break the provider's prompt cache every turn): the active facts of the chat's own Litopys record and of
  // its chain (not the few the scene picks this time), and the notes and said lines the chat carried in at its
  // start. The Dashboard's live notes change every turn and are left out: a fresh note that repeats a card line
  // is rare, and the next import of that chat will not offer it twice.
  const stableFacts = [...seen].flatMap((id) => arr((loadChatFile(fsx, id) || {}).facts).filter((f) => isObj(f) && f.status === "active").map((f) => str(f.text)));
  const carried = [];
  for (const bag of [dash && dash.notebook, dash && dash.said]) {
    for (const list of Object.values(isObj(bag) ? bag : {})) for (const n of arr(list)) if (isObj(n) && n.src === "inherit") carried.push(str(n.text));
  }
  const own = sourceSentences(fsx, meta);
  const res = cardMemoryText(mem, card, { exclude, only: isObj(mc.sources) ? mc.sources : null, chosen: [...arr(chosen), ...stableFacts, ...carried, ...habitLines(mem)].filter(Boolean), cardSentences: own, rule: cfg && cfg.cardMemory });
  return res ? { ...res, cardId } : null;
}

/** The story this chat already carries by itself: itself and the chats of its backstory chain (ids, and the same as an ordered set). */
function storyChain(fsx, chatId) {
  const exclude = new Set([chatId]);
  const links = loadLinks(fsx);
  const seen = new Set([chatId]);
  for (let cur = links[chatId] ? links[chatId].from : null; cur && !seen.has(cur) && seen.size <= CHAIN_MAX; cur = links[cur] ? links[cur].from : null) {
    seen.add(cur);
    exclude.add(cur);
  }
  return { exclude, seen };
}

/**
 * A persona's or a world's memory for this reply, or null: the chat must have taken it in (meta.memory.persona /
 * .world), the owner must still exist and hold a story. `chosen` = what is already in the prompt (the story so far,
 * the card's memory block); a line that repeats one of those, the chat's carried-in notes or the owner's own text is left out.
 */
export function ownerMemoryFor({ fsx, kind, chatId, meta, chosen, dash }) {
  const mc = isObj(meta && meta.memory) ? meta.memory : {};
  if (mc[kind] !== true) return null;
  const id = kind === "persona" ? personaIdOf(fsx, meta) : worldIdOf(fsx, chatId);
  const owner = id ? ownerOf(fsx, kind, id) : null;
  if (!owner) return null;
  const mem = loadMemory(fsx, id, kind);
  if (!mem.sources.length) return null;
  const { exclude, seen } = storyChain(fsx, chatId);
  // same stable comparison set as the card's block: the prompt cache needs a text that does not move between replies
  const stableFacts = [...seen].flatMap((cid) => arr((loadChatFile(fsx, cid) || {}).facts).filter((f) => isObj(f) && f.status === "active").map((f) => str(f.text)));
  const carried = [];
  for (const bag of [dash && dash.notebook, dash && dash.said]) {
    for (const list of Object.values(isObj(bag) ? bag : {})) for (const n of arr(list)) if (isObj(n) && n.src === "inherit") carried.push(str(n.text));
  }
  const ownText = [str(owner.doc.description), str(owner.doc.scenario)].flatMap((t) => t.split(SENTENCE_SPLIT)).map((t) => t.trim()).filter((t) => t.length >= 12);
  const own = [...sourceSentences(fsx, meta), ...ownText];
  const res = cardMemoryText(mem, owner.doc, { exclude, only: null, chosen: [...arr(chosen), ...stableFacts, ...carried].filter(Boolean), cardSentences: own, kind });
  return res ? { ...res, ownerId: id, kind, name: owner.name } : null;
}

function cardMemoryRoute(req, fsx, fixedKind) {
  const method = req.method;
  const q = req.query || {};
  const b = isObj(req.body) ? req.body : {};
  const src = method === "GET" || method === "DELETE" ? q : b;
  // /litopys/card-memory is the card's; /litopys/memory names its owner (kind: card|persona|world, id)
  const kind = fixedKind || (MEMORY_KINDS.includes(str(src.kind)) ? str(src.kind) : "card");
  const cardId = str(fixedKind ? src.cardId : src.id || src.cardId);
  if (!ownerOf(fsx, kind, cardId)) return { status: 404, json: { error: "no such " + kind } };
  if (kind !== "card" && (isObj(b.habit) || str(q.habitId))) return { status: 400, json: { error: "only a card has habits" } };
  const loadMem = () => loadMemory(fsx, cardId, kind);
  const saveMem = (m) => saveMemory(fsx, cardId, m, kind);
  const view = (m) => cardMemoryView(fsx, cardId, normalizeMemory(m, kind), kind);
  if (method === "GET") return { status: 200, json: cardMemoryView(fsx, cardId, loadMem(), kind) };
  if (method === "PUT") {
    const mem = loadMem();
    if (isObj(b.inject)) {
      if (typeof b.inject.enabled === "boolean") mem.inject.enabled = b.inject.enabled;
      if (Number.isFinite(Number(b.inject.maxTokens))) mem.inject.maxTokens = clamp(Math.round(Number(b.inject.maxTokens)), 100, 1500);
      if (b.inject.habitsMaxTokens !== undefined && Number.isFinite(Number(b.inject.habitsMaxTokens))) mem.inject.habitsMaxTokens = clamp(Math.round(Number(b.inject.habitsMaxTokens)), 50, 800);
    }
    if (isObj(b.habit)) {
      const err = editHabit(mem, b.habit);
      if (err) return { status: err === "no such habit" ? 404 : 400, json: { error: err, code: habitErrorCode(err), max: HABIT_MAX } };
    }
    if (isObj(b.source)) {
      const s = mem.sources.find((x) => x.id === str(b.source.id));
      if (!s) return { status: 404, json: { error: "no such source" } };
      if (typeof b.source.on === "boolean") s.on = b.source.on;
      if (b.source.canon === "main" || b.source.canon === "separate") s.canon = b.source.canon;
      // one line of a story: edit its text, remove it, or add a line by hand (the story keeps working when its chat is gone)
      if (isObj(b.source.line)) {
        if (kind !== "card" && !["arc", "facts"].includes(str(b.source.line.list))) return { status: 400, json: { error: "list must be arc or facts" } };
        const err = editStoryLine(s, b.source.line);
        if (err) return { status: 400, json: { error: err } };
      }
    }
    saveMem(mem);
    return { status: 200, json: view(mem) };
  }
  if (method === "DELETE") {
    const mem = loadMem();
    const habitId = str(q.habitId);
    if (habitId) {
      if (!mem.habits.some((k) => k.id === habitId)) return { status: 404, json: { error: "no such habit" } };
      mem.habits = mem.habits.filter((k) => k.id !== habitId);
      saveMem(mem);
      return { status: 200, json: view(mem) };
    }
    const id = str(q.sourceId);
    if (!mem.sources.some((s) => s.id === id)) return { status: 404, json: { error: "no such source" } };
    mem.sources = mem.sources.filter((s) => s.id !== id);
    saveMem(mem);
    return { status: 200, json: view(mem) };
  }
  return { status: 405, json: { error: "method not allowed" } };
}

/** The card (id and file) a character of this chat belongs to, by the name that earned a habit. */
function cardOfName(fsx, meta, who) {
  const ids = [];
  if (meta && meta.groupId) for (const id of arr((readJson(fsx, "groups/" + str(meta.groupId) + ".json", null) || {}).memberIds)) ids.push(str(id));
  else if (meta && meta.characterId) ids.push(str(meta.characterId));
  for (const id of ids) {
    const card = cardOf(fsx, id);
    if (isObj(card) && cardNamesOf(card).has(str(who).toLowerCase())) return { cardId: id, card };
  }
  return null;
}

/**
 * POST /litopys/habits { chatId, op, id, ... }: what the user does with a habit a character earned in this chat.
 * op: "on" (on: bool), "accept" (earned at once, before the second sighting), "reject" (stays as a tombstone),
 * "edit" (name, rule, when), "keep" (copy onto the character's card, where it acts in every chat of the card).
 */
function chatHabitRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const op = str(b.op);
  if (!["on", "accept", "reject", "edit", "keep"].includes(op)) return bad("unknown op");
  return mutateChat(fsx, str(b.chatId), (st) => {
    const now = Date.now();
    const k = st.habits.find((x) => x.id === str(b.id) && x.status !== "rejected");
    if (!k) return { status: 404, json: { error: "no such habit" } };
    if (op === "on") {
      k.on = b.on !== false;
    } else if (op === "accept") {
      if (k.status === "proposed") {
        k.status = "active";
        k.earnedAt = now;
        addActivity(st, "user", "habit.accept", "Accepted the habit " + quote(k.name) + " of " + k.who + " before it was seen again", [k.id], now, { who: k.who, name: k.name });
      }
    } else if (op === "reject") {
      k.status = "rejected";
    } else if (op === "edit") {
      const name = b.name !== undefined ? cut(str(b.name).replace(/\s+/g, " "), 80) : k.name;
      const rule = b.rule !== undefined ? habitRule(b.rule) : k.rule;
      if (!name || !rule) return bad("a habit needs a name and a rule");
      k.name = name;
      k.rule = rule;
      if (b.when !== undefined) k.when = cut(str(b.when).replace(/\s+/g, " "), 160);
      k.edited = true;
    } else {
      if (k.status !== "active") return bad("only an earned habit can be kept on the card");
      const rc = readChat(fsx, st.chatId);
      const hit = cardOfName(fsx, rc ? rc.meta : null, k.who);
      if (!hit) return bad("no card for " + k.who);
      const mem = loadMemory(fsx, hit.cardId);
      const err = editHabit(mem, {
        name: k.name,
        rule: k.rule,
        when: k.when,
        origin: "story",
        state: "accepted",
        from: { chatId: st.chatId, title: str(rc && rc.meta.title) || st.chatId, at: now },
      });
      // the card already keeps this rule: that is as good as kept
      if (err && !/already there/.test(err)) return bad(err);
      if (!err) saveMemory(fsx, hit.cardId, mem);
      k.kept = { cardId: hit.cardId, at: now };
    }
    k.updatedAt = now;
  });
}

function cardMemoryPostRoute(req, fsx, sub, fixedKind) {
  const b = isObj(req.body) ? req.body : {};
  const kind = fixedKind || (MEMORY_KINDS.includes(str(b.kind)) ? str(b.kind) : "card");
  const cardId = str(fixedKind ? b.cardId : b.id || b.cardId);
  const chatId = str(b.chatId);
  if (sub === "preview") {
    const p = previewImport(fsx, cardId, chatId, kind);
    return p ? { status: 200, json: p } : { status: 404, json: { error: "no such " + kind + " or chat" } };
  }
  return importChat(fsx, cardId, chatId, b, kind);
}

/**
 * Change one line of a story kept in the card's memory. `line` = { list: "arc"|"facts"|"notes"|"said",
 * index?, text?, remove?, add?, who?, kind? }: `add` appends (a line written by hand), `remove` drops the line at
 * `index`, otherwise `text` replaces it. Returns an error text or null.
 */
function editStoryLine(source, line) {
  const list = str(line.list);
  if (!["arc", "facts", "notes", "said"].includes(list)) return "list must be arc, facts, notes or said";
  const text = cut(str(line.text), list === "arc" ? 1500 : 300);
  if (list === "arc") {
    if (line.remove === true) source.arc = "";
    else if (text) source.arc = text;
    else return "text required";
    return null;
  }
  const items = source[list];
  if (line.add === true) {
    if (!text) return "text required";
    if (items.length >= 60) return "a story holds at most 60 lines of one kind";
    if (list === "facts") items.push({ text, subject: cut(str(line.subject), 80) });
    else if (list === "notes") items.push({ who: cut(str(line.who), 80), how: ["saw", "heard", "guess"].includes(line.how) ? line.how : "saw", text });
    else items.push({ who: cut(str(line.who), 80), text, kind: SAID_KIND_SET.has(str(line.kind)) ? str(line.kind) : "other" });
    return null;
  }
  const i = Number(line.index);
  if (!Number.isInteger(i) || i < 0 || i >= items.length) return "no such line";
  if (line.remove === true) items.splice(i, 1);
  else if (text) items[i] = { ...items[i], text };
  else return "text required";
  return null;
}
const SAID_KIND_SET = new Set(["vow", "promise", "threat", "confession", "secret", "order", "refusal", "lie", "other"]);

// ---------- what a chat carries (the strip under the chat header, #107) ----------
const OPENING_HINT_MAX = 4;
/**
 * A chat that continues another one but still opens with the card's own greeting (#113): the greeting was written
 * for a first meeting, the memory above it says otherwise. { messageId, title } while the chat is young (the
 * greeting is the first message of the line, nobody edited it, at most a few messages so far), else null.
 */
export function greetingOpening(fsx, chatId, line, titleOf) {
  const link = loadLinks(fsx)[chatId];
  const first = arr(line)[0];
  if (!link || !str(link.from) || !isObj(first) || first.greeting !== true || first.edited || arr(line).length > OPENING_HINT_MAX) return null;
  return { messageId: str(first.id), title: titleOf(link.from) };
}

/**
 * GET /litopys/carries?chatId=&speaker=: the parts that go into a reply besides the history, as they would be built
 * now (reading only): the card's memory, the Litopys backstory and the chat's own Litopys insert, with their token
 * counts and exact texts, and the chat's own switches. The Dashboard and the said part report their own numbers
 * (/dashboard/state, insert.tokens and insert.saidTokens).
 */
function carriesRoute(fsx, query) {
  const chatId = str(query.chatId);
  const rc = SAFE_ID.test(chatId) ? readChat(fsx, chatId) : null;
  if (!rc) return { status: 404, json: { error: "no such chat" } };
  const cfg = loadConfig(fsx);
  const line = activeLine(rc.msgs);
  const speakerName = str(query.speaker);
  const off = isObj(rc.meta.promptBoard) && Array.isArray(rc.meta.promptBoard.off) ? rc.meta.promptBoard.off : [];
  const dash = readDash(fsx, chatId);
  const st = loadChatFile(fsx, chatId);
  const last = readJson(fsx, INSERT_DIR + chatId + ".json", null);
  let insert = null;
  try {
    insert = st && line.length ? buildInsert({ st, line, dash, meta: rc.meta, cfg, scanText: "", speakerName, used: {} }) : null;
  } catch {}
  const back = buildBackstory({ fsx, chatId, line, meta: rc.meta, cfg, speakerName });
  let card = null;
  try {
    card = cardMemoryFor({ fsx, chatId, meta: rc.meta, speakerName, chosen: [insert && insert.head].filter(Boolean).flatMap((t) => String(t).split("\n")), dash, cfg });
  } catch {}
  let cardName = "";
  if (card) {
    const c = cardOf(fsx, card.cardId);
    cardName = str(c && (c.name || (isObj(c.data) ? c.data.name : "")));
  }
  let habits = null;
  try {
    habits = cardHabitsFor({ fsx, chatId, meta: rc.meta, speakerName, chosen: [insert && insert.head].filter(Boolean).flatMap((t) => String(t).split("\n")) });
  } catch {}
  let habitsName = cardName;
  if (habits && !habitsName) {
    const c = cardOf(fsx, habits.cardId);
    habitsName = str(c && (c.name || (isObj(c.data) ? c.data.name : "")));
  }
  const titleOf = (id) => str((readChat(fsx, id) || { meta: {} }).meta.title) || id;
  // persona and world memory: what this chat could take in, whether it did, and what it would say now
  const stableHead = [insert && insert.head].filter(Boolean).flatMap((t) => String(t).split("\n"));
  const sharedMemory = (kind) => {
    const id = kind === "persona" ? personaIdOf(fsx, rc.meta) : worldIdOf(fsx, chatId);
    const owner = id ? ownerOf(fsx, kind, id) : null;
    if (!owner) return null;
    const mem = loadMemory(fsx, id, kind);
    const taken = isObj(rc.meta.memory) && rc.meta.memory[kind] === true;
    let res = null;
    if (taken) {
      try {
        res = ownerMemoryFor({ fsx, kind, chatId, meta: rc.meta, chosen: [...stableHead, ...(card ? String(card.text).split("\n") : [])], dash });
      } catch {}
    }
    return {
      id,
      name: owner.name,
      taken,
      stories: mem.sources.filter((x) => x.on).length,
      tokens: res ? res.tokens : 0,
      dupes: res ? res.dupes : 0,
      sources: res ? res.sources : [],
      text: res ? res.text : "",
    };
  };
  // what the characters remember of the scenes that left the prompt (#99), as the reply of `speaker` would carry it
  let recall = null;
  try {
    recall = st && line.length && cfg.recollections !== false ? recollectionsFor({ fsx, meta: rc.meta, st, line, cut: insert ? insert.cut : cutCount(st, line, cfg), speakerName }) : null;
  } catch {}
  // the World DM (its own plugin, read as a file): its level and the event waiting for the next reply, if any
  const wr = readJson(fsx, "world/state/" + chatId + ".json", null);
  const wset = isObj(wr) && isObj(wr.settings) ? wr.settings : {};
  const level = str(wset.level) || "off";
  const ev = isObj(wr) && isObj(wr.event) ? wr.event : null;
  const waiting = !!ev && Number(ev.sent) === 0 && !!str(ev.text) && wset.insert !== false && level !== "off" && level !== "chronicler";
  return {
    status: 200,
    json: {
      chatId,
      off,
      litopys: {
        // the chat's own record (story so far, facts), as the last reply carried it; the two links below are separate parts
        tokens: isObj(last) ? Number(last.tokens) || 0 : 0,
        facts: isObj(last) ? Number(last.facts) || 0 : 0,
        chapters: isObj(last) ? Number(last.chapters) || 0 : 0,
        // #178: causes pulled in after their effect (this reply, and over all replies of the chat)
        causes: isObj(last) && isObj(last.causes) ? { pulled: Number(last.causes.pulled) || 0, missed: Number(last.causes.missed) || 0, together: Number(last.causes.together) || 0 } : null,
        causeStats: isObj(last) && isObj(last.causeStats) ? { replies: Number(last.causeStats.replies) || 0, pulled: Number(last.causeStats.pulled) || 0, missed: Number(last.causeStats.missed) || 0, together: Number(last.causeStats.together) || 0 } : null,
      },
      backstory: back ? { from: back.from, title: titleOf(back.from), tokens: back.tokens, facts: back.facts, chapters: back.chapters, text: str(back.text) } : null,
      opening: greetingOpening(fsx, chatId, line, titleOf),
      world: level === "off" ? null : { level, insert: wset.insert !== false, waiting, tokens: waiting ? estimateTokens(str(ev.text)) : 0, text: waiting ? str(ev.text) : "" },
      cardMemory: card ? { cardId: card.cardId, name: cardName, tokens: card.tokens, dupes: card.dupes, sources: card.sources, text: card.text } : null,
      cardHabits: habits ? { cardId: habits.cardId, name: habitsName, tokens: habits.tokens, dupes: habits.dupes, habits: habits.habits, text: habits.text } : null,
      personaMemory: sharedMemory("persona"),
      worldMemory: sharedMemory("world"),
      recollections: recall ? { scenes: recall.scenes, who: recall.who, tokens: recall.tokens, text: recall.text } : null,
    },
  };
}
