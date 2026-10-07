/**
 * Litopys 2.0: chapters and facts per chat, and the story record each reply carries.
 *
 * One chapter per closed scene, built by one model call per tick (the oldest
 * closed scene that has none), plus fact operations that come back with it.
 * Before each reply (llmRequest) it inserts one block: chapters of what left the
 * prompt and facts, within the user's token budget (see M3-SPEC.md). The module is evaluated afresh on
 * every pass of a hook, so all state lives in files.
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
 *  DELETE /litopys/config/prompts   back to the shipped prompt
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
export const DEFAULT_CONFIG = {
  enabled: true,
  model: "",
  recentMessages: 20,
  scene: {
    minMessages: 6,
    maxMessages: 40,
  },
  pinLimit: 5,
  insert: true,
  budget: 800,
};

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
};

export const WORKER_SHAPE =
  '{"chapter":{"label":"2-5 words","text":"3-6 sentences"},"facts":[{"op":"add","text":"","subject":"","knownBy":["names"]|"all","type":"event|trait|change|relation|world|plan","weight":"everyday|important|key"},{"op":"update","id":"f3","text":"","type":"change"?},{"op":"retire","id":"f4","reason":""}]}';

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

/** config.json as stored, minus prompts that are a default (so they follow it). */
function storedConfig(fsx) {
  const raw = readOwn(fsx, CONFIG_FILE, null);
  // only keys this version knows: the 1.x keys (extractEveryNTurns, inject, ...) are ignored
  const cfg = {};
  if (isObj(raw)) {
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
  cfg.pinLimit = clamp(cfg.pinLimit, 1, 20);
  cfg.insert = cfg.insert !== false;
  cfg.budget = clamp(cfg.budget, 200, 4000);
  return cfg;
}

/** A whole number from a value, or the fallback when it is not a number. */
const intOf = (v, dflt) => (v !== "" && v !== null && Number.isFinite(Number(v)) ? Math.round(Number(v)) : dflt);

/** The PUT logic described in item 13. Writes the file, returns loadConfig(fsx). */
export function patchConfig(fsx, body) {
  const b0 = body && typeof body === "object" ? body : {};
  const b = b0.values && typeof b0.values === "object" ? { ...b0, ...b0.values } : b0;
  const stored = storedConfig(fsx);
  const next = { ...DEFAULT_CONFIG, ...stored };
  if (b.enabled !== undefined) next.enabled = b.enabled !== false && b.enabled !== "off";
  if (b.model !== undefined) next.model = typeof b.model === "string" ? b.model.trim().slice(0, 160) : "";
  if (b.recentMessages !== undefined) next.recentMessages = clamp(intOf(b.recentMessages, 20), 6, 200);
  if (b.pinLimit !== undefined) next.pinLimit = clamp(intOf(b.pinLimit, 5), 1, 20);
  if (b.insert !== undefined) next.insert = b.insert !== false && b.insert !== "off";
  if (b.budget !== undefined) next.budget = clamp(intOf(b.budget, 800), 200, 4000);
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

/** Deletes the stored prompt, returns loadConfig(fsx). */
export function resetPrompts(fsx) {
  const stored = storedConfig(fsx);
  for (const key of PROMPT_KEYS) delete stored[key];
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

/**
 * findScenes(line, dash, cfg) -> [{ from, to, fromIdx, toIdx, count, kind, label, place, closed, open }]
 * Covers the whole line without gaps.
 */
export function findScenes(line, dash, cfg) {
  if (!line.length) return [];
  const cfgScene = cfg.scene || DEFAULT_CONFIG.scene;
  const minMessages = clamp(cfgScene.minMessages, 1, 40);
  const maxMessages = clamp(cfgScene.maxMessages, 10, 200);
  const hasDash = dash && isObj(dash.snapshots) && Object.keys(dash.snapshots).length > 0;

  // Boundaries: a sensor flag, a new place, a clock jump of more than 6 hours
  const bounds = new Set([0]);
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
    if (place) prevPlace = place;
    if (minutes !== null) prevClock = minutes;
  }

  // no dashboard data: every maxMessages messages is a boundary
  if (!sawSnap) {
    for (let i = maxMessages; i < line.length; i += maxMessages) bounds.add(i);
  }

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

  // Merge short scenes into previous; a short first scene (a greeting) joins the next one
  const merged = [];
  for (const r of raw) {
    const len = r.toIdx - r.fromIdx + 1;
    if (len < minMessages && merged.length) {
      merged[merged.length - 1].toIdx = r.toIdx;
    } else {
      merged.push({ ...r });
    }
  }
  if (merged.length > 1 && merged[0].toIdx - merged[0].fromIdx + 1 < minMessages) {
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
        scenes.push({ fromIdx, toIdx, kind: "part" });
        fromIdx = toIdx + 1;
      }
    } else {
      scenes.push({ fromIdx: r.fromIdx, toIdx: r.toIdx, kind: "scene" });
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
    const closed = i < scenes.length - 1;
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

/** M3b item 2: the cut count = covered, at most line.length - recentMessages. */
export function cutCount(st, line, cfg) {
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
  for (const scene of findScenes(line, dash, cfg).filter((x) => x.closed)) {
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

/** item 6: returns the request object for host.llm.request. */
export function buildWorkerRequest(st, work, line, dash, cfg, meta) {
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
    const text = cut(m.text, 1500);
    if (text) msgLines.push("[" + name + "] " + text);
  }
  parts.push("Scene messages\n" + msgLines.join("\n"));

  const userText = parts.join("\n\n");
  const systemPrompt = (cfg.chapter || DEFAULT_PROMPTS.chapter) + "\n\nOutput shape\n" + WORKER_SHAPE;

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
function wordTokensM3b(s) {
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
function sameWordM3b(a, b) {
  if (a.length <= 3 || b.length <= 3) return a === b;
  const x = wordStemM3b(a);
  const y = wordStemM3b(b);
  if (x === y) return true;
  const [sh, lg] = x.length <= y.length ? [x, y] : [y, x];
  return sh.length >= 4 && lg.startsWith(sh) && lg.length - sh.length <= 2;
}
const weightBonus = (f) => (f && f.weight === "key" ? 6 : f && f.weight === "important" ? 3 : 0);
/** A fact's lexical score against the scan text (ported from relations rankNotes plus weight bonus). */
function factScore(f, scanText, df, n) {
  const keys = wordTokensM3b(str(f.text));
  let score = weightBonus(f);
  const scan = wordTokensM3b(scanText || "");
  if (scan.length) {
    for (const k of keys) {
      if (scan.some((w) => sameWordM3b(k, w))) {
        score += 10 * Math.log(1 + n / (df.get(wordStemM3b(k)) || 1));
      }
    }
  }
  return score;
}
/** Rank facts for group d: relevant facts, newest first on ties. */
export function rankFacts(facts, scanText) {
  const list = arr(facts).filter(isObj);
  const df = new Map();
  const keysMap = new Map();
  for (const f of list) {
    const ks = [...new Set(wordTokensM3b(str(f.text)))];
    keysMap.set(f, ks);
    for (const w of new Set(ks.map(wordStemM3b))) df.set(w, (df.get(w) || 0) + 1);
  }
  const n = Math.max(1, list.length);
  return list
    .map((f) => ({ f, score: factScore(f, scanText, df, n) }))
    .sort((a, b) => b.score - a.score || (b.f.updatedAt || 0) - (a.f.updatedAt || 0))
    .map((x) => x.f);
}
/** Rank chapters before the cut: score on label + text; the bridge chapter stays first when it qualifies. */
export function rankChapters(chapters, scanText) {
  const list = arr(chapters).filter(isObj);
  const df = new Map();
  const keysMap = new Map();
  for (const ch of list) {
    const ks = [...new Set(wordTokensM3b(str(ch.label) + " " + str(ch.text)))];
    keysMap.set(ch, ks);
    for (const w of new Set(ks.map(wordStemM3b))) df.set(w, (df.get(w) || 0) + 1);
  }
  const n = Math.max(1, list.length);
  const scan = wordTokensM3b(scanText || "");
  const score = (ch) => {
    let s = 0;
    if (scan.length) {
      for (const k of keysMap.get(ch)) {
        if (scan.some((w) => sameWordM3b(k, w))) {
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
export function buildInsert({ st, line, dash, meta, cfg, scanText, speakerName }) {
  if (!st || !Array.isArray(line) || !line.length) return null;
  const cut = cutCount(st, line, cfg);
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
    const recent = Math.max(6, Number(cfg && cfg.recentMessages) || 6);
    for (const m of line.slice(-recent)) if (str(m.name)) present.add(str(m.name));
  }
  if (str(speakerName)) present.add(str(speakerName));
  const userName = str(meta && meta.userName) || "You";
  present.add(userName);
  const here = new Set([...present].map((n) => n.toLowerCase()));
  const subj = (f) => str(f.subject).toLowerCase();

  const known = (f) => f.knownBy === "all" || (Array.isArray(f.knownBy) && f.knownBy.some((k) => here.has(str(k).toLowerCase())));
  const active = arr(st.facts).filter((f) => isObj(f) && f.status === "active" && str(f.text) && known(f));
  const ranges = new Map(arr(st.chapters).filter(isObj).map((ch) => [ch.id, rangeOf(ch, line)]));
  const beforeCut = arr(st.chapters).filter((ch) => {
    const r = ranges.get(ch.id);
    return isObj(ch) && !ch.stale && r && !r.orphan && r.toIdx < cut && str(ch.text);
  });
  if (!active.length && !beforeCut.length) return null;

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
  const d = rankFacts(active.filter((f) => !a.includes(f) && !b.includes(f) && !stillSeen(f)), scanText);
  const e = rankChapters(beforeCut.filter((ch) => ch !== bridge), scanText).slice(0, 6);

  const header =
    "[Story record (Litopys): what happened before the messages below and what stays true. Background for the next reply: do not retell it, do not contradict it.]";
  const factLine = (f) => "- " + str(f.text) + (Array.isArray(f.knownBy) && f.knownBy.length ? " (known to: " + f.knownBy.join(", ") + ")" : "");
  const chapterLine = (ch) => "- " + (str(ch.label) ? str(ch.label) + ": " : "") + str(ch.text);
  const facts = [];
  const chapters = [];
  const render = () => {
    const out = [header];
    if (chapters.length) {
      const ordered = chapters.slice().sort((x, y) => ranges.get(x.id).fromIdx - ranges.get(y.id).fromIdx);
      out.push("Earlier chapters:", ...ordered.map(chapterLine));
    }
    if (facts.length) out.push("Facts:", ...facts.map(factLine));
    return out.join("\n");
  };
  const budget = clamp(cfg && cfg.budget, 200, 4000);
  // each item goes in whole or not at all; a group stops at its first item that does not fit
  const tryAdd = (list, item) => {
    list.push(item);
    if (estimateTokens(render()) <= budget) return true;
    list.pop();
    return false;
  };
  for (const f of a) if (!tryAdd(facts, f)) break;
  for (const f of b) if (!tryAdd(facts, f)) break;
  if (bridge) tryAdd(chapters, bridge);
  for (const f of d) if (!tryAdd(facts, f)) break;
  for (const ch of e) if (!tryAdd(chapters, ch)) break;
  if (!facts.length && !chapters.length) return null;
  const text = render();
  return { text, tokens: estimateTokens(text), facts: facts.length, chapters: chapters.length, cut };
}

/** Insert one system message after the leading system block (ported from relations withInsert). */
function withInsert(messages, text) {
  let lead = 0;
  while (lead < messages.length && messages[lead] && messages[lead].role === "system") lead++;
  return [...messages.slice(0, lead), { role: "system", content: text }, ...messages.slice(lead)];
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
  try {
    const cfg = loadConfig(fsx);
    if (cfg.enabled === false || cfg.insert === false) return null;
    const rc = readChat(fsx, chatId);
    if (!rc) return null;
    const line = activeLine(rc.msgs);
    const st = loadChatFile(fsx, chatId);
    if (!st || !line.length) return null;
    const scanText = req.messages
      .filter((m) => m && m.role !== "system" && typeof m.content === "string")
      .slice(-6)
      .map((m) => m.content)
      .join("\n");
    const insert = buildInsert({ st, line, dash: readDash(fsx, chatId), meta: rc.meta, cfg, scanText, speakerName: str(ctx.turn.speakerName) });
    if (!insert) return null;
    // never write the chat file here: the worker may be saving a chapter at the same time
    try {
      fsx.write(
        "litopys/insert/" + chatId + ".json",
        JSON.stringify({ at: Date.now(), tokens: insert.tokens, facts: insert.facts, chapters: insert.chapters, cut: insert.cut }),
      );
    } catch {}
    return { messages: withInsert(req.messages, insert.text) };
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
  return { chapter: { label: cut(label, 80), text: cut(text, 1500) }, facts: factOps(v) };
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

// ---------- applying the worker result ----------
/** Models drop "op" on new facts or say "new": no id means add. */
function factOp(op) {
  const raw = str(op.op || op.action).toLowerCase();
  if (raw === "add" || raw === "new" || raw === "create" || raw === "insert") return "add";
  if (raw === "update" || raw === "edit" || raw === "change") return "update";
  if (raw === "retire" || raw === "remove" || raw === "delete") return "retire";
  return raw || (op.id === undefined || op.id === null || op.id === "" ? "add" : "");
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
  if (scene.place) newChapter.place = scene.place;
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
      const fact = {
        id: "f" + ++st.counters.fact,
        text,
        subject,
        knownBy,
        type,
        weight,
        pinned: false,
        status: "active",
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
        const newFact = {
          id: "f" + ++st.counters.fact,
          text,
          subject: target.subject,
          knownBy: target.knownBy,
          weight: target.weight,
          pinned: target.pinned,
          type: "change",
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
    counters: { chapter: 0, fact: 0, proposal: 0 },
  };
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
      }
    : { chapter: 0, fact: 0, proposal: 0 };
  st.rev = Number(st.rev) || 0;
  st.activity = arr(st.activity);
  st.skipScenes = arr(st.skipScenes);
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
    let books = [];
    try {
      books = (fsx.list("lorebooks") || []).filter((f) => f.endsWith(".json"));
    } catch {}
    for (const f of books) {
      const book = readJson(fsx, "lorebooks/" + f, null);
      if (!isObj(book) || !bound.has(str(book.id || book.name))) continue;
      for (const e of arr(book.entries)) if (isObj(e) && e.enabled !== false) texts.push(str(e.content));
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
function liveNotes(dash, line, overlay) {
  const keys = new Set(line.map((m) => m.id + "#" + (Number.isFinite(m.swipe) ? m.swipe : 0)));
  const edits = isObj(overlay && overlay.edits) ? overlay.edits : {};
  const out = [];
  for (const [holder, notes] of Object.entries(isObj(dash && dash.notebook) ? dash.notebook : {})) {
    for (const n of arr(notes)) {
      if (!isObj(n) || !keys.has(n.src) || (n.retiredBy && keys.has(n.retiredBy))) continue;
      const e = isObj(edits[n.id]) ? edits[n.id] : null;
      if (e && e.retired === true) continue;
      out.push({ holder, id: str(n.id), text: e && str(e.text) ? str(e.text) : str(n.text), turn: Number(n.turn), weight: n.weight, tag: e && e.tag !== undefined ? e.tag : n.tag });
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
  st.facts = facts;
  st.proposals = arr(g.proposals);
  st.counters = { ...st.counters, chapter: g.counters.chapter, fact: Math.max(g.counters.fact, st.counters.fact), proposal: Math.max(g.counters.proposal, st.counters.proposal) };
  st.worker = isObj(g.worker) ? g.worker : st.worker;
  delete st.inFlight;
  st.queue = isObj(g.queue) ? g.queue : { next: 0 };
  st.rebuiltAt = now;
  delete st.rebuild;
  delete st.cut;
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
      counters: { chapter: st.counters.chapter, fact: st.counters.fact, proposal: st.counters.proposal },
    };
    addActivity(st, "user", "rebuild.start", "Rebuild from scratch started", [], now);
    if (!saveChatFile(fsx, st)) continue;
    wake(fsx, chatId, true);
    const line = activeLine(rc.msgs);
    return { scenes: findScenes(line, readDash(fsx, chatId), cfg).filter((s) => s.closed).length };
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
        const scenes = findScenes(line, dash, cfg);
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
        if (!work && gen !== st) {
          finishRebuild(st, now);
          if (saveChatFile(fsx, st)) wake(fsx, chatId, false);
          continue;
        }
        if (!work) {
          if (changed) saveChatFile(fsx, st);
          wake(fsx, chatId, false);
          continue;
        }
        const keyOf = (s, g, w) => (g !== s ? "litr_" : "lit_") + chatId + "_" + w.scene.from + "_" + w.scene.to;
        const key = keyOf(st, gen, work);
        if (host.llm && host.llm.results && host.llm.results[key]) {
          const reply = host.llm.results[key];
          const parsed = reply && !reply.error && reply.text ? parseWorkerReply(reply.text) : null;
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
            const by = g !== cur ? "rebuild" : "worker";
            if (parsed) {
              const before = new Set(g.facts.map((f) => f.id));
              const pendingBefore = g.proposals.filter((p) => p.status === "pending").length;
              const chapter = applyWorkerResult(g, w, parsed, { now, model: reply.model, usage: reply.usage, ms: reply.genTimeMs, line, reply: reply.text, sources: sourceSentences(fsx, meta) });
              const added = g.facts.filter((f) => !before.has(f.id)).map((f) => f.id);
              const proposed = Math.max(0, g.proposals.filter((p) => p.status === "pending").length - pendingBefore);
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
        // M4a+: the request in flight, so the view can show the worker alive
        gen.inFlight = { key, from: work.scene.from, to: work.scene.to, fromNo: work.scene.fromIdx + 1, toNo: work.scene.toIdx + 1, since: now };
        if (!saveChatFile(fsx, st)) return;
        beat(fsx, chatId, now);
        const req = buildWorkerRequest(gen, work, line, dash, cfg, meta);
        if (host.llm && typeof host.llm.request === "function") host.llm.request(key, req);
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
      addActivity(st, "user", "fact.pin", "Pinned: " + quote(fact.text), b.replace ? [fact.id, str(b.replace)] : [fact.id], now, { text: fact.text });
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
      if (!Object.keys(next).length) return bad("nothing to change");
      Object.assign(ch, next);
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

/** POST /litopys/proposals { chatId, id, op: "accept"|"reject", replace? } */
export function proposalRoute(fsx, body) {
  const b = isObj(body) ? body : {};
  const op = str(b.op);
  if (op !== "accept" && op !== "reject") return bad("unknown op");
  const cfg = loadConfig(fsx);
  return mutateChat(fsx, str(b.chatId), (st) => {
    const now = Date.now();
    const p = st.proposals.find((x) => x.id === str(b.id));
    if (!p) return { status: 404, json: { error: "no such proposal" } };
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
    scene: st ? st.scene : { openFrom: null },
    sceneFromNo: st && st.scene && st.scene.openFrom ? line.findIndex((m) => m.id === st.scene.openFrom) + 1 : 0,
    worker: workerView(st, line, next, beatAt(fsx), Date.now()),
    activity: st ? st.activity : [],
    // M4a: scenes the user deleted and kept out of the record, as message numbers
    skipped: st ? skipRanges(st, line).map((x) => ({ fromNo: x.fromIdx + 1, toNo: x.toIdx + 1 })) : [],
    pinLimit: cfg.pinLimit,
    rev: st ? st.rev : 0,
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
    rebuildScenes: findScenes(line, readDash(fsx, chatId), cfg).filter((x) => x.closed).length,
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
  if (path === "/litopys/config" && req.method === "GET") {
    return { status: 200, json: loadConfig(fsx) };
  }
  if (path === "/litopys/config" && req.method === "PUT") {
    const cfg = patchConfig(fsx, req.body || {});
    return { status: 200, json: cfg };
  }
  if (path === "/litopys/rebuild" && req.method === "POST") {
    const body = isObj(req.body) ? req.body : {};
    const res = rebuildChat(fsx, str(body.chatId), loadConfig(fsx));
    if (!res) return { status: 404, json: { error: "chat not found" } };
    if (res.busy) return { status: 409, json: { error: "busy, try again" } };
    return { status: 200, json: res };
  }
  if (path === "/litopys/facts" && req.method === "POST") return factRoute(fsx, req.body);
  if (path === "/litopys/chapters" && req.method === "POST") return chapterRoute(fsx, req.body);
  if (path === "/litopys/proposals" && req.method === "POST") return proposalRoute(fsx, req.body);
  if (path === "/litopys/config/prompts" && req.method === "DELETE") {
    const cfg = resetPrompts(fsx);
    return { status: 200, json: cfg };
  }
  return null;
}

export function uiPanel(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  const cfg = fsx ? loadConfig(fsx) : { ...DEFAULT_CONFIG, ...DEFAULT_PROMPTS };
  let chats = 0;
  if (fsx) {
    try {
      chats = fsx.list("litopys/chats").filter((f) => f.endsWith(".json")).length;
    } catch {}
  }
  const custom = fsx ? customPrompts(fsx) : [];
  return {
    label: "Litopys",
    icon: "book",
    hint: "Chapters and facts per chat, built in shadow mode (" + chats + " chats have a file).",
    items: [
      {
        id: "config",
        title: "Chapters and facts",
        enabled: cfg.enabled !== false,
        saveUrl: "/litopys/config",
        ...(custom.length ? { deleteUrl: "/litopys/config/prompts", deleteLabel: "Restore default prompts" } : {}),
        fields: [
          { key: "model", label: "Model", hint: "Empty = the chat's own model.", placeholder: "provider/model-id", kind: "model", value: cfg.model || "" },
          { key: "recentMessages", label: "Recent messages", hint: "Newest messages the prompt keeps word for word. A scene gets its chapter as soon as the next scene has begun.", kind: "number", value: cfg.recentMessages },
          { key: "insert", label: "Insert into the prompt", hint: "Before each reply, add the Litopys record for this chat: chapters before the cut and facts.", kind: "select", list: ["on", "off"], value: cfg.insert === false ? "off" : "on" },
          { key: "budget", label: "Insert budget, tokens", hint: "The most the Litopys block may take. 200 to 4000, default 800.", kind: "number", value: cfg.budget },
          { key: "scene_minMessages", label: "Min messages per scene", hint: "Shorter scenes merge into the previous one.", kind: "number", value: cfg.scene.minMessages },
          { key: "scene_maxMessages", label: "Max messages per scene", hint: "Longer scenes split into parts.", kind: "number", value: cfg.scene.maxMessages },
          { key: "pinLimit", label: "Pin limit", hint: "The most pinned facts per character (and for the world). Only you pin; Litopys may propose a pin.", kind: "number", value: cfg.pinLimit },
          { key: "chapter", label: "Chapter prompt", hint: custom.includes("chapter") ? "Changed from the default." : "This is the default.", kind: "textarea", rows: 10, advanced: true, value: cfg.chapter },
        ],
      },
    ],
  };
}
