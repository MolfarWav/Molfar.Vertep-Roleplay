/**
 * Relationship dashboard: how each character stands toward the user.
 *
 * After a reply, a SENSOR model reports what happened (events, mood, scene,
 * what each character learned). It never gives relationship numbers. Code
 * turns the events into numbers (pure functions below, tested without a model)
 * and saves one SNAPSHOT per chat message, keyed "<msgId>#<swipe>". The active
 * line of the chat decides which snapshots, notes and history lines count, so a
 * swipe or a deleted message never leaves stale state behind.
 *
 * Routes (under /v1/apps/roleplay/):
 *  POST /dashboard/update {chatId, op?}    sensor now (two-phase)
 *  GET  /dashboard/state?chatId=           state + active keys + current key
 *  GET  /dashboard/preview?chatId=&speaker=&text= the insert the next reply gets
 *
 * Before each reply, the llmRequest hook adds "how the characters are right
 * now" in words as the last leading system message (buildInsert).
 *  GET  /dashboard/config                  effective config + events
 *  PUT  /dashboard/config                  flat body or panel envelope
 *  DELETE /dashboard/config/prompts        back to the shipped prompt
 *
 * Files (fs root = the app's data/):
 *  dashboard/state/<chatId>.json   one chat
 *  dashboard/config.json           only what differs from the defaults
 *  dashboard/events.json           optional own event vocabulary
 *  _debug/dashboard.json           last sensor call, only when debug is on
 */

const STATE_DIR = "dashboard/state/";
const CONFIG_FILE = "dashboard/config.json";
const EVENTS_FILE = "dashboard/events.json";
const DEBUG_FILE = "_debug/dashboard.json";
const SNAPSHOT_LIMIT = 40;
// one turn moves the clock at most this far (a night's sleep fits)
const MAX_MINUTES = 720;
const CHAT_ID = /^[A-Za-z0-9_-]{1,120}$/;

// ---------- vocabulary of the physics ----------
export const DISPOSITION = ["trust", "comfort", "attraction", "respect", "affection"];
export const PULSE = ["excitement", "arousal"];
const CLASSES = ["romantic", "ally", "neutral", "hostile"];
export const WEIGHTS = { routine: 1, significant: 2, pivotal: 4 };
const DELTA_KEYS = [...DISPOSITION, ...PULSE, "hostility"];

// [family, id, meaning, deltas]; Sergey tunes these later, a user file can replace any of them
const EVENT_ROWS = [
  ["trust", "kept_promise", "did what was promised", { trust: 1, respect: 1 }],
  ["trust", "broke_promise", "failed a promise", { trust: -3, respect: -1 }],
  ["trust", "told_truth", "said an uncomfortable truth", { trust: 1, respect: 1 }],
  ["trust", "caught_lying", "was caught in a lie", { trust: -3, respect: -2 }],
  ["trust", "shared_secret", "trusted them with a secret", { trust: 2, affection: 1 }],
  ["trust", "kept_her_secret", "kept their secret when it cost something", { trust: 2 }],
  ["trust", "betrayed_secret", "told their secret to others", { trust: -4, comfort: -2, hostility: 3 }],
  ["warmth", "compliment", "sincere praise", { affection: 1, attraction: 1 }],
  ["warmth", "shared_laughter", "laughed together", { comfort: 1, affection: 1 }],
  ["warmth", "remembered_detail", "remembered something small about them", { affection: 2 }],
  ["warmth", "gift", "gave something meant for them", { affection: 1, comfort: 1 }],
  ["warmth", "cold_shoulder", "ignored or dismissed them", { affection: -2, comfort: -1 }],
  ["power", "gave_order", "commanded them", { respect: 1, comfort: -1 }],
  ["power", "asked_her_advice", "asked and listened", { respect: 1, trust: 1 }],
  ["power", "deferred_to_her", "let them decide", { respect: 1, comfort: 1 }],
  ["power", "overruled_her", "overrode their choice", { comfort: -1, respect: -1 }],
  ["power", "protected_her_standing", "defended them in front of others", { respect: 1, affection: 1, trust: 1 }],
  ["power", "humiliated_her", "shamed them in front of others", { respect: -2, comfort: -3, hostility: 3 }],
  ["body", "gentle_touch", "wanted, gentle touch", { comfort: 1, attraction: 1, arousal: 6 }],
  ["body", "unwanted_touch", "touch they did not want", { comfort: -4, trust: -2, hostility: 3 }],
  ["body", "flirt", "flirted with them", { attraction: 1, excitement: 6, arousal: 4 }],
  ["body", "kiss", "kissed (welcome)", { attraction: 2, affection: 1, arousal: 12 }],
  ["body", "intimacy", "intimate moment (welcome)", { attraction: 2, comfort: 1, arousal: 20 }],
  ["conflict", "raised_voice", "shouted, at them or near them", { comfort: -3 }],
  ["conflict", "insult", "insulted them", { respect: -2, affection: -2, hostility: 3 }],
  ["conflict", "threat", "threatened them", { comfort: -4, trust: -3, hostility: 4 }],
  ["conflict", "fair_argument", "argued honestly", { respect: 1 }],
  ["conflict", "apology", "sincere apology", { trust: 1, comfort: 1, hostility: -2 }],
  ["care", "protected_her", "shielded them from harm", { trust: 2, affection: 1, comfort: 1 }],
  ["care", "cared_for_kin", "helped their people or family", { affection: 2, trust: 1 }],
  ["care", "tended_her", "looked after their wound or need", { comfort: 2, affection: 1 }],
  ["care", "ignored_her_need", "saw their need and did nothing", { affection: -2, trust: -1 }],
  ["knowledge", "novelty", "something new or surprising", { excitement: 12 }],
  ["knowledge", "danger", "danger in the scene", { excitement: 10, comfort: -1 }],
  ["other", "other", "anything else", {}],
];
const FAMILIES = ["trust", "warmth", "power", "body", "conflict", "care", "knowledge"];

// [spectrum, inverted]: which spectrum tilts the gain of a stat
const SPECTRUM_FOR_GAIN = {
  trust: ["suspicious_trusting", false],
  comfort: ["introvert_extrovert", false],
  attraction: ["cautious_reckless", false],
  respect: ["lawful_rebellious", true],
  affection: ["reserved_emotional", false],
};
const HARM_SPECTRUM = ["pessimist_optimist", true];

// four phrases per stat: < -50, -50..-1, 0..50, > 50. {user} {their} {self} are filled by code.
export const TIERS = {
  trust: [
    "expects betrayal",
    "wary; tests {user}'s words before believing them",
    "answers honestly",
    "says the uncomfortable thing {self}",
  ],
  comfort: [
    "flinches and watches the exits whenever {user} is near",
    "on edge near {user}; keeps a step of distance",
    "polite and steady near {user}",
    "wholly at ease; lets silences stand, guard down",
  ],
  attraction: [
    "repelled; recoils from closeness and avoids {user}'s eyes",
    "unmoved or put off; keeps talk cool and impersonal",
    "no pull beyond a passing glance",
    "openly drawn; seeks closeness and loses the thread of a sentence",
  ],
  respect: [
    "holds {user} in contempt; talks over and past {user}",
    "doubts {user}'s judgment; obeys only when pressed",
    "listens and takes {user} seriously, yet speaks plainly",
    "defers on what matters; changes {their} mind when {user} speaks",
  ],
  affection: [
    "wants nothing to do with {user}; withholds even courtesy",
    "cool; polite but keeps all warmth back",
    "courteous; warms only when given a reason",
    "cares openly; seeks {user} out and worries when {user} is hurt",
  ],
};

// low band (value <= base + 10) injects nothing
export const PULSE_BANDS = {
  excitement: {
    moderate: "alert and restless; speech quickens, hands will not stay still",
    high: "keyed up; talks fast, cannot sit still, misses small things",
  },
  arousal: {
    moderate: "warm and aware of closeness; gaze drifts, voice softens",
    high: "flushed and short of breath; hard to keep to a plain topic",
  },
};

const within = (v, n) => Math.abs(v) <= n;
// first match wins
export const CONSTELLATIONS = [
  { id: "contempt", test: (s) => s.respect < -50 },
  { id: "grudging_respect", test: (s, cls) => cls === "hostile" && s.respect > 30 },
  { id: "fear", test: (s) => s.comfort < -50 && s.respect > 0 },
  { id: "romance", test: (s) => s.attraction > 40 && s.affection > 40 && s.trust > 20 },
  { id: "dangerous_pull", test: (s) => s.attraction > 50 && s.trust < 0 },
  { id: "honor_without_trust", test: (s) => s.respect > 50 && s.trust < 0 },
  { id: "loyal", test: (s) => s.trust > 50 && s.respect > 40 && s.attraction < 20 },
  { id: "friendship", test: (s) => s.trust > 30 && s.comfort > 30 && s.affection > 30 },
  { id: "outsider", test: (s) => s.trust < -30 && s.comfort < -20 },
  { id: "strangers", test: (s) => DISPOSITION.every((k) => within(s[k], 15)) },
  { id: "unsettled", test: () => true },
];

// ---------- prompts ----------
// The sensor prompt ships with the plugin. config.json holds one only when the
// user changed it. The event vocabulary and the output shape are appended in
// code, so no edit can break the format.
export const DEFAULT_PROMPTS = {
  sensor: [
    "You are the scene sensor of an ongoing roleplay story. Read the New messages and the Previous state, and report what happened in the new messages. Code turns your report into numbers. You never give numbers for relationships. The only number you give is \"minutes\".",
    "",
    "Reply with one JSON object in the shape under \"Output shape\". Name events only from \"Event vocabulary\". No prose, no code fences. Write every letter as itself, never as a \\u escape.",
    "",
    "Language: Write every text value in the language the story is written in. Keep ids, keys and enum values (\"saw\", \"heard\", \"guess\", \"routine\", \"significant\", \"pivotal\", \"user\") exactly as given. Keep every name as the story spells it.",
    "",
    "Truth:",
    "- Use only what the New messages say or show. Never invent.",
    "- The Previous state is background. Never report an event, fact or mood from it unless the New messages show it again.",
    "- When the new text shows nothing for a key, leave the key out.",
    "",
    "Events:",
    "- One entry for each thing the user's character did toward a character (\"from\": \"user\"), and for scene events that touch a character (danger, novelty; \"from\" left out). Most turns have 0 to 3.",
    "- Between two other characters, name no event: describe it in \"edges\".",
    "- \"to\" is a character name. \"quote\" is a short line from the text (under 15 words).",
    "- weight. routine: ordinary for this scene. significant: those involved will still remember it tomorrow. pivotal: it changes how they stand to each other for good (a life saved, a vow, a betrayal).",
    "- Nothing in the vocabulary fits: use \"other\". Never stretch an id to fit.",
    "",
    "Scene:",
    "- minutes: story time that passed in the new messages. Estimate it from what happens: a few lines of talk 2-5, a meal 20-40, a walk across a castle 10-20, a night's sleep 480. 0 only when nothing happens (for example a continuation of the same moment).",
    "- time and day: only when the text states them (\"evening\", \"19:40\", \"day 3\").",
    "- present: the people in the scene at the end of the new messages (the full list; [] when the user's character is alone). A narrator who only tells the story is not a person in the scene. struck: anyone who left, fell asleep or is otherwise out of it.",
    "- place and weather: only when stated or changed.",
    "- chars: for each present character, mood, condition, outfit, holding, goal, leads (who drives the scene right now: a name or \"user\"), only what the text shows.",
    "",
    "Knowledge:",
    "- A character learns only what happened while they were present (\"saw\"), what they were told (\"heard\", \"from\" is the teller), or what they guess (\"guess\"). Never give knowledge to someone absent, asleep or struck.",
    "- learned: whenever a character sees, hears or guesses something new about the user's character, add it; at most 4 per turn, the ones that matter. Skip anything already in their Notebook, even in other words.",
    "- told: when one character repeats a notebook entry to another, give from, to and the entry id. retire: ids of notebook entries the new text disproves.",
    "- names: when the user's name is said in a character's presence, set heardUserName true for them. \"calls\" is how they address the user.",
    "- blindSpot: for the characters named in this turn's events, one short line on what they do not know that matters here. It is for the user's eyes only.",
    "- edges: for two present characters who are not the user, a one-word role and a one-word warmth.",
    "",
    "Threads:",
    "- Keep up to three open threads: unanswered questions or promises that drive the story.",
    "- Never drop one to make room for a new one. Silence is not resolution: a thread nobody mentioned stays open.",
    "- Resolve a thread only when the new text settles it. Give its id in \"resolved\".",
    "- In \"open\", list kept threads with their id and new ones with id null.",
  ].join("\n"),
};
// Earlier defaults, so a stored copy of one follows the current default.
export const PAST_DEFAULT_PROMPTS = { sensor: [] };
const PROMPT_KEYS = Object.keys(DEFAULT_PROMPTS);

const OUTPUT_SHAPE = [
  "{ \"present\": [\"name\"], \"struck\": [\"name\"],",
  "  \"minutes\": 0, \"time\": \"HH:MM or dawn|morning|late morning|day|evening|night\", \"day\": 1,",
  "  \"place\": \"text\", \"weather\": \"text\",",
  "  \"events\": [ { \"id\": \"event id\", \"weight\": \"routine|significant|pivotal\", \"from\": \"name or user\", \"to\": \"name or user\", \"quote\": \"text\" } ],",
  "  \"chars\": { \"name\": { \"mood\": \"text\", \"condition\": \"text\", \"outfit\": \"text\", \"holding\": \"text\", \"goal\": \"text\", \"leads\": \"name or user\" } },",
  "  \"learned\": [ { \"who\": \"name\", \"text\": \"text\", \"how\": \"saw|heard|guess\", \"from\": \"name or null\" } ],",
  "  \"told\": [ { \"from\": \"name\", \"to\": \"name\", \"note\": \"entry id\" } ],",
  "  \"retire\": [\"entry id\"],",
  "  \"names\": [ { \"who\": \"name\", \"heardUserName\": true, \"calls\": \"text\" } ],",
  "  \"threads\": { \"open\": [ { \"id\": \"t1 or null\", \"text\": \"...\" } ], \"resolved\": [\"thread id\"] },",
  "  \"blindSpot\": { \"name\": \"text\" },",
  "  \"edges\": [ { \"from\": \"name\", \"to\": \"name\", \"role\": \"word\", \"warmth\": \"word\" } ] }",
].join("\n");

// ---------- tiny utils ----------
const readJson = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const unique = (list) => list.filter((x, i) => list.indexOf(x) === i);
/** The array at bag[key], created in place when missing. */
const listIn = (bag, key) => {
  if (!Array.isArray(bag[key])) bag[key] = [];
  return bag[key];
};
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const fmt = (n) => String(Math.round(n * 100) / 100);
const signed = (n) => (n > 0 ? "+" : "") + fmt(n);
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const isUser = (s) => String(s).trim().toLowerCase() === "user";
const cut = (s, n) => String(s).slice(0, n);

/** Truncate toward zero; a real change never rounds away to nothing. */
export function roundStep(sum) {
  const s = round6(sum);
  const t = Math.trunc(s);
  return t === 0 && s !== 0 ? (s > 0 ? 1 : -1) : t;
}

// ---------- the vocabulary: defaults plus the user's file ----------
const VOCAB_FAMILY = /^[a-z][a-z0-9_]{0,31}$/;
const VOCAB_ID = /^[a-z][a-z0-9_]{0,47}$/;

function readDeltas(raw) {
  if (!isObj(raw)) return null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!DELTA_KEYS.includes(k)) return null;
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    if (v !== 0) out[k] = v;
  }
  return out;
}

/** Event table by id: the defaults, then valid entries of the user file (same id replaces). */
export function buildVocab(userEvents) {
  const vocab = {};
  for (const [family, id, meaning, deltas] of EVENT_ROWS) vocab[id] = { id, family, meaning, deltas };
  for (const e of arr(userEvents)) {
    if (!isObj(e) || !VOCAB_ID.test(String(e.id)) || !VOCAB_FAMILY.test(String(e.family))) continue;
    const deltas = readDeltas(e.deltas === undefined ? {} : e.deltas);
    if (!deltas) continue;
    vocab[e.id] = { id: e.id, family: e.family, meaning: cut(str(e.meaning), 200), deltas };
  }
  return vocab;
}
const DEFAULT_VOCAB = buildVocab([]);
const loadVocab = (fsx) => {
  const raw = readJson(fsx, EVENTS_FILE, null);
  return buildVocab(isObj(raw) ? raw.events : []);
};

// ---------- physics ----------
export function band(v) {
  const n = num(v);
  if (!Number.isFinite(n)) return 1;
  if (n < 25) return 0.75;
  if (n < 50) return 0.9;
  if (n === 50) return 1;
  if (n <= 75) return 1.1;
  return 1.25;
}

/** Multiplier from one spectrum of the soul; [name, inverted]. */
export function tilt(soul, spec) {
  const raw = num(soul && soul.spectra ? soul.spectra[spec[0]] : undefined);
  if (!Number.isFinite(raw)) return 1;
  return band(spec[1] ? 100 - raw : raw);
}

const tiltNote = (soul, spec, m) => "x" + m + " " + spec[0] + " " + num(soul.spectra[spec[0]]);

/** The pulse stats rest here when nothing excites them. */
export function pulseBases(soul) {
  const curiosity = num(soul && soul.traits ? soul.traits.curiosity : undefined);
  const arousal = num(soul && soul.pulseBase ? soul.pulseBase.arousal : undefined);
  return {
    excitement: 12 + Math.trunc(round6(Math.max(0, Number.isFinite(curiosity) ? curiosity - 60 : 0) * 0.3)),
    arousal: Number.isFinite(arousal) ? arousal : 9,
  };
}

export function startChar(soul, cls) {
  const stats = {};
  for (const k of DISPOSITION) {
    const v = num(soul && soul.start ? soul.start[k] : undefined);
    stats[k] = Number.isFinite(v) ? clamp(Math.trunc(v), -20, 20) : 0;
  }
  const h = num(soul && soul.start ? soul.start.hostility : undefined);
  return {
    stats,
    pulse: pulseBases(soul),
    hostility: cls === "hostile" ? clamp(Number.isFinite(h) ? Math.trunc(h) : 0, 0, 100) : null,
  };
}

/** The strongest trigger or value of the soul for this event and stat. */
function cardMultiplier(soul, eventId, stat) {
  let best = null;
  const scan = (list, kind) => {
    for (const t of arr(list)) {
      if (!isObj(t) || t.event !== eventId || t.stat !== stat) continue;
      const x = num(t.x);
      const mult = Number.isFinite(x) ? x : 1;
      if (!best || mult > best.x) best = { x: mult, kind, cue: String(t.cue || "") };
    }
  };
  if (soul) {
    scan(soul.triggers, "trigger");
    scan(soul.values, "value");
  }
  return best;
}

/** One event on one stat, as floats, with a math line per step. */
function eventDelta(soul, e, stat, base, weightName, prevValue, lines) {
  let x = base;
  lines.push(stat + " " + signed(base) + " base");
  const w = WEIGHTS[weightName];
  if (w !== 1) {
    x *= w;
    lines.push("x" + w + " " + weightName);
  }
  const hit = cardMultiplier(soul, e.id, stat);
  if (hit && hit.x !== 1) {
    x *= hit.x;
    lines.push("x" + hit.x + " " + hit.kind + ": " + hit.cue);
  }
  if (!DISPOSITION.includes(stat)) return x;
  const spec = x > 0 ? SPECTRUM_FOR_GAIN[stat] : HARM_SPECTRUM;
  const m = tilt(soul, spec);
  if (m !== 1) {
    x *= m;
    lines.push(tiltNote(soul, spec, m));
  }
  if (x > 0 && prevValue > 50) {
    x /= 2;
    lines.push("halved near the pole");
  }
  return x;
}

/** Cap and round the summed stat. Returns the integer step. */
function settleDisposition(stat, sum, soul, turnLines) {
  let s = sum;
  const shy = num(soul && soul.traits ? soul.traits.shyness : undefined);
  if ((stat === "trust" || stat === "comfort") && Number.isFinite(shy) && shy > 60 && s > 1) {
    s = 1;
    turnLines.push("shyness " + fmt(shy) + " > 60: growth capped at +1");
  }
  if (s > 6) {
    turnLines.push(stat + " capped at +6 (was " + fmt(s) + ")");
    s = 6;
  } else if (s < -12) {
    turnLines.push(stat + " capped at -12 (was " + fmt(s) + ")");
    s = -12;
  }
  return roundStep(s);
}

const towardBase = (value, base) => (value > base ? Math.max(base, value - 5) : Math.min(base, value + 5));

/**
 * One character, one turn. Only events aimed at `name` from the user (or from
 * the scene, "from" empty) count. Returns the new numbers and the math lines:
 * math.events[i] belongs to events[i], math.turn holds caps.
 */
export function applyTurn({ name, prev, soul, cls, events, vocab }) {
  const table = vocab || DEFAULT_VOCAB;
  const before = prev || startChar(soul, cls);
  const hostile = cls === "hostile";
  const sums = {};
  const stimulated = {};
  const math = { events: events.map(() => []), turn: [] };

  events.forEach((e, i) => {
    const mine = e.to === name && (e.from === undefined || e.from === null || e.from === "" || e.from === "user");
    const def = table[e.id];
    if (!mine || !def) return;
    const weightName = WEIGHTS[e.weight] ? e.weight : "routine";
    for (const stat of DELTA_KEYS) {
      const d = def.deltas[stat];
      if (!d || (stat === "hostility" && !hostile)) continue;
      const prevValue = DISPOSITION.includes(stat) ? (before.stats[stat] ?? 0) : 0;
      sums[stat] = (sums[stat] || 0) + eventDelta(soul, e, stat, d, weightName, prevValue, math.events[i]);
      stimulated[stat] = true;
    }
  });

  const stats = {};
  for (const stat of DISPOSITION) {
    const step = stimulated[stat] ? settleDisposition(stat, sums[stat], soul, math.turn) : 0;
    stats[stat] = clamp((before.stats[stat] ?? 0) + step, -100, 100);
  }
  const bases = pulseBases(soul);
  const pulse = {};
  for (const stat of PULSE) {
    const was = before.pulse && Number.isFinite(before.pulse[stat]) ? before.pulse[stat] : bases[stat];
    pulse[stat] = clamp(stimulated[stat] ? was + roundStep(sums[stat]) : towardBase(was, bases[stat]), 0, 100);
  }
  const hostility = hostile ? clamp((before.hostility ?? 0) + (stimulated.hostility ? roundStep(sums.hostility) : 0), 0, 100) : null;
  return { stats, pulse, hostility, math };
}

export function tierIndex(v) {
  if (v < -50) return 0;
  if (v < 0) return 1;
  if (v <= 50) return 2;
  return 3;
}

export function constellationOf(stats, cls) {
  return CONSTELLATIONS.find((c) => c.test(stats, cls));
}

/** Pulse band of a value: low, moderate or high. */
export function pulseBand(value, base) {
  if (value <= base + 10) return "low";
  return value > 70 ? "high" : "moderate";
}

/** The tier phrase of one stat with the placeholders filled. */
export function tierPhrase(stat, value, who) {
  const w = who || {};
  return TIERS[stat][tierIndex(value)]
    .split("{user}").join(w.user || "the user")
    .split("{their}").join(w.their || "their")
    .split("{self}").join(w.self || "themself");
}

// ---------- chat: messages, active line, characters ----------
function readChat(fsx, chatId) {
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

/** The messages in file order, each with its current swipe: [{key, msg}]. */
export function activeLine(msgs) {
  return msgs
    .filter((m) => m.id !== undefined && m.id !== null && m.id !== "")
    .map((m) => ({ key: m.id + "#" + (Number.isFinite(m.swipe) ? m.swipe : 0), msg: m }));
}

function chatCharacters(fsx, meta) {
  const ids = meta.groupId ? arr(readJson(fsx, "groups/" + meta.groupId + ".json", {}).memberIds) : meta.characterId ? [meta.characterId] : [];
  const names = [];
  const souls = {};
  for (const id of ids) {
    const card = readJson(fsx, "characters/" + id + "/card.json", null);
    if (!isObj(card) || !card.name) continue;
    names.push(String(card.name));
    const found = card.extensions && card.extensions.molfar_soul && card.extensions.molfar_soul.characters;
    if (isObj(found)) for (const [n, soul] of Object.entries(found)) if (isObj(soul) && !souls[n]) souls[n] = soul;
  }
  return { names: unique(names), souls };
}

function userNameOf(fsx, meta) {
  if (str(meta.userName)) return str(meta.userName);
  if (meta.personaId && CHAT_ID.test(String(meta.personaId))) {
    const persona = readJson(fsx, "personas/" + meta.personaId + ".json", null);
    if (persona && str(persona.name)) return str(persona.name);
  }
  return "the user";
}

// ---------- chat state file ----------
function emptyState(chatId) {
  return {
    v: 2,
    chatId,
    snapshots: {},
    notebook: {},
    names: {},
    history: {},
    counters: { note: 0, thread: 0 },
    lastError: null,
    usage: { calls: 0, inTokens: 0, outTokens: 0, lastMs: 0 },
  };
}

/** Unknown top-level keys ride along untouched. */
function normalizeState(raw, chatId) {
  const base = emptyState(chatId);
  const st = { ...base, ...(isObj(raw) ? raw : {}), v: 2, chatId };
  for (const k of ["snapshots", "notebook", "names", "history"]) if (!isObj(st[k])) st[k] = {};
  st.counters = { ...base.counters, ...(isObj(st.counters) ? st.counters : {}) };
  st.usage = { ...base.usage, ...(isObj(st.usage) ? st.usage : {}) };
  if (!isObj(st.lastError)) st.lastError = null;
  return st;
}

/** The state of a chat and whether its file exists. */
function loadState(fsx, chatId) {
  const raw = readJson(fsx, STATE_DIR + chatId + ".json", null);
  return { state: normalizeState(raw, chatId), existed: raw !== null };
}

function saveState(fsx, ctx) {
  if (JSON.stringify(ctx.state) === ctx.before) return;
  fsx.write(STATE_DIR + ctx.chatId + ".json", JSON.stringify(ctx.state, null, 2));
}

const keySet = (keys) => new Set(keys);

/** Notes that count on this line: the source is active and no active key retired them. */
export function activeNotebook(state, keys) {
  const on = keySet(keys);
  const out = {};
  for (const [name, notes] of Object.entries(state.notebook || {})) {
    const live = arr(notes).filter((n) => on.has(n.src) && !(n.retiredBy && on.has(n.retiredBy)));
    if (live.length) out[name] = live;
  }
  return out;
}

const activeBySrc = (bag, keys) => {
  const on = keySet(keys);
  const out = {};
  for (const [name, list] of Object.entries(bag || {})) {
    const live = arr(list).filter((x) => on.has(x.src));
    if (live.length) out[name] = live;
  }
  return out;
};
export const activeNames = (state, keys) => activeBySrc(state.names, keys);
export const activeHistory = (state, keys) => activeBySrc(state.history, keys);

/** The newest active key that has a snapshot, searching keys[0..before). */
function nearestSnapshot(state, keys, before) {
  for (let i = before - 1; i >= 0; i--) if (state.snapshots[keys[i]]) return i;
  return -1;
}

// ---------- config ----------
const DEFAULT_CONFIG = {
  sensorModel: "",
  mode: "sensor",
  families: { trust: true, warmth: true, power: true, body: true, conflict: true, care: true, knowledge: true },
  injection: { enabled: true, maxTokens: 300 },
  catchUp: true,
  debug: false,
};

/** A prompt as the user would see it changed: whitespace does not count. */
const promptKey = (s) => String(s || "").replace(/\s+/g, " ").trim();
const isDefaultPrompt = (key, text) =>
  !promptKey(text) || [DEFAULT_PROMPTS[key], ...PAST_DEFAULT_PROMPTS[key]].some((d) => promptKey(d) === promptKey(text));

/** config.json as stored, minus prompts that are a default (so they follow it). */
function storedConfig(fsx) {
  const raw = readJson(fsx, CONFIG_FILE, null);
  const cfg = isObj(raw) ? { ...raw } : {};
  for (const key of PROMPT_KEYS) if (typeof cfg[key] !== "string" || isDefaultPrompt(key, cfg[key])) delete cfg[key];
  return cfg;
}

const mergeConfig = (stored) => ({
  ...DEFAULT_CONFIG,
  ...DEFAULT_PROMPTS,
  ...stored,
  families: { ...DEFAULT_CONFIG.families, ...(isObj(stored.families) ? stored.families : {}) },
  injection: { ...DEFAULT_CONFIG.injection, ...(isObj(stored.injection) ? stored.injection : {}) },
});
const loadConfig = (fsx) => mergeConfig(storedConfig(fsx));
const customPrompts = (fsx) => PROMPT_KEYS.filter((key) => key in storedConfig(fsx));
export const promptOf = (key, cfg) => (cfg && typeof cfg[key] === "string" && !isDefaultPrompt(key, cfg[key]) ? cfg[key] : DEFAULT_PROMPTS[key]);

function parseBool(v) {
  if (v === true || v === false) return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "on", "yes", "1"].includes(s)) return true;
  if (["false", "off", "no", "0"].includes(s)) return false;
  return undefined;
}

/** What differs from the defaults, as the next stored config. */
function nextConfig(stored, b) {
  const next = { ...stored };
  const put = (key, value, dflt) => {
    if (JSON.stringify(value) === JSON.stringify(dflt)) delete next[key];
    else next[key] = value;
  };
  if (b.sensorModel !== undefined) put("sensorModel", typeof b.sensorModel === "string" ? b.sensorModel.trim().slice(0, 160) : "", DEFAULT_CONFIG.sensorModel);
  if (b.mode === "sensor" || b.mode === "manual") put("mode", b.mode, DEFAULT_CONFIG.mode);
  if (parseBool(b.catchUp) !== undefined) put("catchUp", parseBool(b.catchUp), DEFAULT_CONFIG.catchUp);
  if (parseBool(b.debug) !== undefined) put("debug", parseBool(b.debug), DEFAULT_CONFIG.debug);
  if (isObj(b.families)) {
    const fam = { ...(isObj(next.families) ? next.families : {}) };
    for (const [k, v] of Object.entries(b.families)) {
      if (!VOCAB_FAMILY.test(k) || parseBool(v) === undefined) continue;
      if (parseBool(v) === true) delete fam[k];
      else fam[k] = false;
    }
    put("families", fam, {});
  }
  if (isObj(b.injection)) {
    const inj = { ...(isObj(next.injection) ? next.injection : {}) };
    if (parseBool(b.injection.enabled) !== undefined) inj.enabled = parseBool(b.injection.enabled);
    if (Number.isFinite(num(b.injection.maxTokens))) inj.maxTokens = clamp(Math.round(num(b.injection.maxTokens)), 50, 2000);
    for (const k of Object.keys(inj)) if (inj[k] === DEFAULT_CONFIG.injection[k]) delete inj[k];
    put("injection", inj, {});
  }
  for (const key of PROMPT_KEYS) {
    if (typeof b[key] !== "string") continue;
    if (isDefaultPrompt(key, b[key])) delete next[key];
    else next[key] = b[key].slice(0, 8000);
  }
  return next;
}

function writeConfig(fsx, next) {
  if (Object.keys(next).length === 0 && readJson(fsx, CONFIG_FILE, null) === null) return;
  fsx.write(CONFIG_FILE, JSON.stringify(next, null, 2));
}

// ---------- sensor input ----------

/** One line per enabled family: `family: id - meaning; ...`. */
function vocabularyText(vocab, cfg) {
  const byFamily = {};
  for (const e of Object.values(vocab)) listIn(byFamily, e.family).push(e);
  const order = unique([...FAMILIES, ...Object.keys(byFamily).filter((f) => f !== "other"), "other"]).filter((f) => byFamily[f] && (f === "other" || cfg.families[f] !== false));
  return order
    .map((f) => (f === "other" ? "other: anything else" : f + ": " + byFamily[f].map((e) => e.id + (e.meaning ? " - " + e.meaning : "")).join("; ")))
    .join("\n");
}

function sensorSystem(cfg, vocab) {
  return (
    promptOf("sensor", cfg) +
    "\n\nEvent vocabulary\n" + vocabularyText(vocab, cfg) +
    "\n\nOutput shape\n" + OUTPUT_SHAPE +
    "\nLeave out any key the new messages give nothing for."
  );
}

function clockLine(c) {
  const when = c.time ? c.time + (c.band ? " (" + c.band + ")" : "") : c.band ? cap1(c.band) : "";
  return (when ? when + ", day " : "Day ") + c.day + ".";
}

function previousStateText(ctx) {
  const B = ctx.base && ctx.base.snap;
  if (!B) return "Previous state\n(none: this is the start)";
  const who = { user: ctx.userName, their: "their", self: "themself" };
  const lines = [clockLine(B.clock || {})];
  const scene = [B.clock && B.clock.place, B.clock && B.clock.weather].filter(Boolean).join("; ");
  if (scene) lines.push(scene + ".");
  lines.push("Present: " + arr(B.present).join(", ") + ".");
  for (const name of arr(B.present)) {
    const c = B.chars && B.chars[name];
    if (!c) continue;
    const fresh = DISPOSITION.every((s) => !c.stats[s]);
    let line = name + " toward " + ctx.userName + ": " + (fresh ? "no history yet" : DISPOSITION.map((s) => tierPhrase(s, c.stats[s], who)).join("; ")) + ".";
    if (c.mood) line += " Mood: " + c.mood + ".";
    if (c.holding) line += " Holding: " + c.holding + ".";
    lines.push(line);
  }
  const open = arr(B.threads).filter((t) => t.status === "open");
  if (open.length) lines.push("Open threads: " + open.map((t) => t.id + " \"" + t.text + "\"").join(", "));
  return "Previous state\n" + lines.join("\n");
}

function noteLine(n) {
  return n.id + " " + n.how + (n.how === "heard" && n.from ? " from " + n.from : "") + ": " + n.text;
}

function notebookTexts(ctx) {
  const live = activeNotebook(ctx.state, ctx.line.map((l) => l.key));
  const B = ctx.base && ctx.base.snap;
  const out = [];
  for (const name of B ? arr(B.present) : ctx.characters) {
    const notes = (live[name] || []).slice(-20);
    if (notes.length) out.push("Notebook of " + name + "\n" + notes.map(noteLine).join("\n"));
  }
  return out;
}

const cutMiddle = (s, max) => (s.length <= max ? s : s.slice(0, Math.floor((max - 3) / 2)) + " … " + s.slice(s.length - Math.floor((max - 3) / 2)));

function newMessagesText(msgs) {
  const lines = msgs.map((m) => "[" + (m.role === "user" ? "user" : str(m.name) || m.role || "narrator") + "] " + cutMiddle(String(m.text).trim(), 1500));
  return "New messages\n" + lines.join("\n").slice(-8000);
}

function sensorUser(ctx) {
  const listed = unique([...ctx.characters, ...Object.keys(ctx.souls), ...(ctx.base ? Object.keys(ctx.base.snap.chars || {}) : [])]);
  // a card without a soul may be a narrator card; the sensor decides from the text
  const label = (n) => (ctx.souls[n] ? classOf(ctx.souls[n]) : ctx.characters.includes(n) ? "the card: a character, or a narrator who is no person in the scene" : "neutral");
  const classes = listed.map((n) => n + " (" + label(n) + ")").join(", ");
  return [
    "Characters\nuser: " + ctx.userName + ". " + classes + ".",
    previousStateText(ctx),
    ...notebookTexts(ctx),
    newMessagesText(ctx.newMsgs),
  ].join("\n\n");
}

const classOf = (soul) => (soul && CLASSES.includes(soul.class) ? soul.class : "neutral");

// ---------- reading the sensor's reply ----------
/**
 * The first balanced {...} of the text, trailing commas dropped. When it never
 * closes (the reply was cut off), `cuts` holds the text up to each comma with
 * the open brackets closed, newest first, to salvage what came before.
 */
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

/** The sensor's JSON. A reply cut off mid-way keeps its complete fields, marked `__partial`. */
export function parseSensorText(text) {
  let s = String(text || "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i.exec(s);
  if (fence) s = fence[1];
  const { body, cuts } = firstObject(s);
  if (body) return parseObj(body);
  for (const cut of cuts.slice(0, 60)) {
    const v = parseObj(cut);
    if (v) return { ...v, __partial: true };
  }
  return null;
}

// ---------- applying the sensor's report: the snapshot ----------
const TEXT_FIELDS = ["mood", "condition", "outfit", "holding", "goal", "leads"];
const BAND_WORDS = ["dawn", "morning", "late morning", "day", "evening", "night"];

function bandOfHour(h) {
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 10) return "morning";
  if (h >= 10 && h < 12) return "late morning";
  if (h >= 12 && h < 17) return "day";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

const pad2 = (n) => (n < 10 ? "0" : "") + n;

/** The clock after this turn. Minutes move a known time, rolling over midnight. */
export function advanceClock(prevClock, out, op) {
  const c = { day: 1, time: null, minutes: 0, band: null, place: null, weather: null, ...(prevClock || {}) };
  const day = num(out.day);
  if (Number.isFinite(day) && day >= 1) c.day = Math.floor(day);
  const t = str(out.time);
  const hm = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (hm && Number(hm[1]) < 24 && Number(hm[2]) < 60) c.time = pad2(Number(hm[1])) + ":" + hm[2];
  else if (BAND_WORDS.includes(t.toLowerCase())) {
    c.band = t.toLowerCase();
    c.time = null;
  }
  const m = num(out.minutes);
  c.minutes = op === "continue" || !Number.isFinite(m) ? 0 : clamp(Math.round(m), 0, MAX_MINUTES);
  if (c.time) {
    const parts = c.time.split(":");
    const total = Number(parts[0]) * 60 + Number(parts[1]) + c.minutes;
    c.day += Math.floor(total / 1440);
    const rest = total % 1440;
    c.time = pad2(Math.floor(rest / 60)) + ":" + pad2(rest % 60);
    c.band = bandOfHour(Math.floor(rest / 60));
  }
  if (str(out.place)) c.place = cut(str(out.place), 200);
  if (str(out.weather)) c.weather = cut(str(out.weather), 200);
  return c;
}

/** The story name a sensor spelling stands for (case-insensitive), else as given. */
function canonName(name, known) {
  const s = str(name);
  if (!s || known.includes(s)) return s;
  return known.find((k) => k.toLowerCase() === s.toLowerCase()) || s;
}

function sideOf(v, userName, known) {
  const s = str(v);
  if (!s) return null;
  if (isUser(s) || s.toLowerCase() === userName.toLowerCase()) return "user";
  return canonName(s, known);
}

function readEvents(list, ctx, known, unknownIds) {
  const events = [];
  for (const e of arr(list)) {
    if (!isObj(e)) continue;
    const id = str(e.id);
    const entry = ctx.vocab[id];
    // a family switched off for this chat counts as "other"
    const def = entry && ctx.cfg.families[entry.family] !== false ? entry : null;
    if (!entry && id) unknownIds.push(id);
    const use = def || ctx.vocab.other;
    events.push({
      id: use.id,
      family: use.family,
      weight: WEIGHTS[e.weight] ? e.weight : "routine",
      from: sideOf(e.from, ctx.userName, known),
      to: sideOf(e.to, ctx.userName, known),
      quote: cut(str(e.quote), 200),
      math: [],
    });
  }
  return events;
}

function scenePresent(ctx, out, known) {
  const B = ctx.base && ctx.base.snap;
  const said = unique(arr(out.present).map((n) => sideOf(n, ctx.userName, known)).filter((n) => n && n !== "user"));
  const struck = arr(out.struck).map((n) => sideOf(n, ctx.userName, known));
  // an explicit [] means the user is alone (a narrator card is no person in
  // the scene); only a report without the key falls back
  const start = Array.isArray(out.present) ? said : B ? arr(B.present) : ctx.characters;
  return unique(start.filter((n) => !struck.includes(n)));
}

/** Present characters first named in this turn's events, then the old order. */
function orderPresent(present, events, B) {
  const named = [];
  for (const e of events) for (const n of [e.to, e.from]) if (n && present.includes(n) && !named.includes(n)) named.push(n);
  const rest = (B ? arr(B.present) : []).filter((n) => present.includes(n) && !named.includes(n));
  return [...named, ...rest, ...present.filter((n) => !named.includes(n) && !rest.includes(n))];
}

/** Numbers and text of one character for this turn. */
function charEntry(ctx, name, events, sensorChar, blind, B) {
  const soul = ctx.souls[name];
  const cls = classOf(soul);
  const old = B && B.chars ? B.chars[name] : null;
  const prev = old ? { stats: old.stats, pulse: old.pulse, hostility: old.hostility ?? null } : startChar(soul, cls);
  const turn = applyTurn({ name, prev, soul, cls, events, vocab: ctx.vocab });
  const entry = { cls, stats: turn.stats, pulse: turn.pulse, hostility: turn.hostility };
  for (const f of TEXT_FIELDS) entry[f] = (isObj(sensorChar) && str(sensorChar[f]) ? cut(str(sensorChar[f]), 300) : old ? old[f] : null) ?? null;
  // what the sensor saw THIS turn; carried values are stale for the prompt insert
  entry.fresh = TEXT_FIELDS.filter((f) => isObj(sensorChar) && str(sensorChar[f]));
  const oldC = old ? old.constellation : null;
  entry.constellation = constellationOf(turn.stats, cls).id;
  entry.prevConstellation = old ? (oldC !== entry.constellation ? oldC : old.prevConstellation ?? null) : null;
  entry.moodWas = old && old.mood && old.mood !== entry.mood ? old.mood : old ? old.moodWas ?? null : null;
  entry.blindSpot = str(blind) ? cut(str(blind), 300) : old ? old.blindSpot ?? null : null;
  entry.compact = false;
  // the math lines belong to the events that caused them; caps go on the last one
  let last = -1;
  events.forEach((_e, i) => {
    if (turn.math.events[i].length) {
      events[i].math.push(...turn.math.events[i]);
      last = i;
    }
  });
  if (last >= 0) events[last].math.push(...turn.math.turn);
  return { entry, old, prev };
}

/** A history line for each tier crossing and each constellation change. */
function addHistory(state, name, turn, K, prev, entry, old) {
  const lines = [];
  for (const stat of DISPOSITION) {
    const from = tierIndex(prev.stats[stat]);
    const to = tierIndex(entry.stats[stat]);
    if (from !== to) lines.push({ turn, kind: "tier", stat, from, to, src: K });
  }
  const was = old ? old.constellation : constellationOf(prev.stats, entry.cls).id;
  if (was !== entry.constellation) lines.push({ turn, kind: "constellation", from: was, to: entry.constellation, src: K });
  if (lines.length) state.history[name] = [...arr(state.history[name]), ...lines];
}

function applyNotebook(ctx, out, present, turn, K) {
  const { state } = ctx;
  const keys = ctx.line.map((l) => l.key);
  const live = activeNotebook(state, keys);
  const add = (who, note) => {
    state.counters.note += 1;
    listIn(state.notebook, who).push({ id: "n" + state.counters.note, ...note, turn, src: K });
  };
  let used = 0;
  for (const l of arr(out.learned)) {
    if (used >= 4) break;
    if (!isObj(l)) continue;
    const who = canonName(l.who, present);
    const text = cut(str(l.text), 300);
    if (!text || !present.includes(who)) continue;
    const how = ["saw", "heard", "guess"].includes(l.how) ? l.how : "guess";
    // "heard" with no teller: the user told them
    const teller = str(l.from) && str(l.from).toLowerCase() !== "null" ? sideOf(l.from, ctx.userName, present) : "user";
    const from = how === "heard" ? teller : null;
    add(who, how === "heard" ? { text, how, from, believes: true } : { text, how, from: null });
    used++;
  }
  for (const t of arr(out.told)) {
    if (!isObj(t)) continue;
    const from = canonName(t.from, present);
    const to = canonName(t.to, present);
    const note = arr(live[from]).find((n) => n.id === str(t.note));
    if (note && present.includes(to) && to !== from) add(to, { text: note.text, how: "heard", from, believes: true });
  }
  const retire = arr(out.retire).map(str);
  for (const notes of Object.values(live)) for (const n of notes) if (retire.includes(n.id)) n.retiredBy = K;
}

function applyNames(ctx, out, present, turn, K) {
  const live = activeNames(ctx.state, ctx.line.map((l) => l.key));
  for (const n of arr(out.names)) {
    if (!isObj(n)) continue;
    const who = canonName(n.who, present);
    if (!present.includes(who)) continue;
    const before = arr(live[who]).slice(-1)[0];
    const knows = n.heardUserName === true || !!(before && before.knowsUserName);
    listIn(ctx.state.names, who).push({ knowsUserName: knows, calls: cut(str(n.calls), 100), turn, src: K });
  }
}

function applyThreads(ctx, out, turn) {
  const { state } = ctx;
  const B = ctx.base && ctx.base.snap;
  const threads = arr(B && B.threads).filter((t) => t.status === "open").map((t) => ({ ...t }));
  const spec = isObj(out.threads) ? out.threads : {};
  for (const id of arr(spec.resolved).map(str)) {
    const t = threads.find((x) => x.id === id);
    if (t) t.status = "resolved";
  }
  const openCount = () => threads.filter((t) => t.status === "open").length;
  for (const item of arr(spec.open)) {
    const text = cut(isObj(item) ? str(item.text) : str(item), 300);
    if (!text) continue;
    const known = isObj(item) ? threads.find((t) => t.id === str(item.id) && t.status === "open") : null;
    if (known) known.text = text;
    else if (openCount() < 3) {
      state.counters.thread += 1;
      threads.push({ id: "t" + state.counters.thread, text, since: turn, status: "open" });
    }
  }
  return threads;
}

function applyEdges(B, out, known) {
  const edges = arr(B && B.edges).map((e) => ({ ...e }));
  for (const e of arr(out.edges)) {
    if (!isObj(e)) continue;
    const from = canonName(e.from, known);
    const to = canonName(e.to, known);
    if (!from || !to || from === to || isUser(from) || isUser(to)) continue;
    const edge = { from, to, role: cut(str(e.role), 40), warmth: cut(str(e.warmth), 40) };
    const at = edges.findIndex((x) => x.from === from && x.to === to);
    if (at >= 0) edges[at] = edge;
    else edges.push(edge);
  }
  return edges;
}

/** Make the snapshot of key K from the parsed sensor report; mutates ctx.state. */
function applySensor(ctx, out, op, model, unknownIds) {
  const { state, K } = ctx;
  const B = ctx.base && ctx.base.snap;
  const turn = (B ? B.turn || 0 : 0) + 1;
  const known0 = unique([...ctx.characters, ...Object.keys(ctx.souls), ...Object.keys((B && B.chars) || {})]);
  const known = unique([...known0, ...arr(out.present).map((n) => canonName(n, known0)).filter((n) => n && !isUser(n))]);
  const present = scenePresent(ctx, out, known);
  const events = readEvents(out.events, ctx, known, unknownIds);

  const sensorChars = {};
  if (isObj(out.chars)) for (const [n, v] of Object.entries(out.chars)) sensorChars[canonName(n, known)] = v;
  const blind = {};
  if (isObj(out.blindSpot)) for (const [n, v] of Object.entries(out.blindSpot)) blind[canonName(n, known)] = v;

  const targets = events.map((e) => e.to).filter((n) => n && n !== "user" && known.includes(n));
  const names = unique([...Object.keys((B && B.chars) || {}), ...present, ...targets]);
  const chars = {};
  for (const name of names) {
    if (!present.includes(name) && !targets.includes(name) && B && B.chars[name]) {
      chars[name] = { ...B.chars[name], compact: true };
      continue;
    }
    const made = charEntry(ctx, name, events, sensorChars[name], blind[name], B);
    chars[name] = made.entry;
    addHistory(state, name, turn, K, made.prev, made.entry, made.old);
  }
  orderPresent(present, events, B).forEach((name, i) => {
    if (chars[name]) chars[name].compact = i >= 4;
  });
  for (const name of names) if (!present.includes(name) && chars[name]) chars[name].compact = true;

  applyNotebook(ctx, out, present, turn, K);
  applyNames(ctx, out, present, turn, K);
  const snapshot = {
    turn,
    at: Math.max(Date.now(), 1 + Math.max(0, ...Object.values(state.snapshots).map((x) => x.at || 0))),
    sensorModel: model || "",
    op,
    ...(out.__partial ? { partial: true } : {}),
    clock: advanceClock(B && B.clock, out, op),
    present,
    events,
    chars,
    edges: applyEdges(B, out, known),
    threads: applyThreads(ctx, out, turn),
    extra: {},
  };
  state.snapshots[K] = snapshot;
  const order = Object.keys(state.snapshots).sort((a, b) => (state.snapshots[b].at || 0) - (state.snapshots[a].at || 0));
  for (const old of order.slice(SNAPSHOT_LIMIT)) delete state.snapshots[old];
  return snapshot;
}

// ---------- one update: plan, ask, commit ----------
const ok = (json, status) => ({ status: status || 200, json });

/**
 * Pass A and pass B both start here. Reads only. Returns { final } when the
 * answer is already known, else everything the sensor call and the commit need.
 */
function planUpdate(fsx, chatId, op) {
  const chat = readChat(fsx, chatId);
  if (!chat) return { final: ok({ error: "no such chat" }, 404) };
  const { state, existed } = loadState(fsx, chatId);
  const unchanged = () => ({ final: ok({ ok: true, state: existed ? state : null, unchanged: true }) });
  const line = activeLine(chat.msgs);
  if (!line.length) return unchanged();
  const K = line[line.length - 1].key;
  if (state.snapshots[K]) return unchanged();
  const bi = nearestSnapshot(state, line.map((l) => l.key), line.length - 1);
  const base = bi >= 0 ? { key: line[bi].key, snap: state.snapshots[line[bi].key] } : null;
  const newMsgs = line.slice(bi + 1).map((l) => l.msg).filter((m) => str(m.text));
  if (!newMsgs.length) return unchanged();
  const { names, souls } = chatCharacters(fsx, chat.meta);
  return {
    chatId,
    op,
    meta: chat.meta,
    line,
    K,
    base,
    newMsgs,
    characters: names,
    souls,
    userName: userNameOf(fsx, chat.meta),
    state,
    before: JSON.stringify(state),
    cfg: loadConfig(fsx),
    vocab: loadVocab(fsx),
  };
}

function askSensor(host, ctx, key) {
  const model = str(ctx.cfg.sensorModel) || str(ctx.meta.model);
  host.llm.request(key, {
    ...(model ? { model } : {}),
    systemPrompt: sensorSystem(ctx.cfg, ctx.vocab),
    messages: [{ role: "user", content: sensorUser(ctx) }],
    presetParams: { temperature: 0.2, max_tokens: 3000 },
  });
}

function writeDebug(fsx, ctx, info) {
  if (!ctx.cfg.debug) return;
  try {
    fsx.write(DEBUG_FILE, JSON.stringify({ at: new Date().toISOString(), chatId: ctx.chatId, input: sensorUser(ctx), ...info }, null, 2));
  } catch {}
}

/** Record a failed update: only lastError changes. */
function failUpdate(fsx, ctx, message, debug) {
  ctx.state.lastError = { at: Date.now(), message };
  saveState(fsx, ctx);
  writeDebug(fsx, ctx, { error: message, ...debug });
  return ok({ ok: false, error: message, state: ctx.state });
}

const isRateLimit = (r) => /429|rate.?limit/i.test(String(r.error || ""));

/** The reply is in: parse it, build the snapshot, write once. */
function commitUpdate(fsx, ctx, r) {
  if (r.error || !str(r.text)) return failUpdate(fsx, ctx, r.error ? String(r.error) : "the sensor returned nothing", { raw: String(r.text || "") });
  const out = parseSensorText(r.text);
  if (!out) return failUpdate(fsx, ctx, "sensor reply was not JSON", { raw: String(r.text) });
  const unknownIds = [];
  try {
    const snapshot = applySensor(ctx, out, ctx.op, str(r.model), unknownIds);
    const usage = isObj(r.usage) ? r.usage : {};
    ctx.state.usage = {
      ...ctx.state.usage,
      calls: ctx.state.usage.calls + 1,
      inTokens: ctx.state.usage.inTokens + (num(usage.input) || 0),
      outTokens: ctx.state.usage.outTokens + (num(usage.output) || 0),
      lastMs: num(r.genTimeMs) || 0,
    };
    ctx.state.lastError = null;
    saveState(fsx, ctx);
    writeDebug(fsx, ctx, { raw: String(r.text), parsed: out, unknownEvents: unknownIds });
    return ok({ ok: true, state: ctx.state, snapshot: ctx.K, turn: snapshot.turn });
  } catch (e) {
    // a half-applied report must not leave notes or history behind
    ctx.state = JSON.parse(ctx.before);
    return failUpdate(fsx, ctx, "could not apply the sensor reply: " + (e && e.message ? e.message : String(e)), { raw: String(r.text), parsed: out });
  }
}

/**
 * The whole update for a route or a tick. input = {chatId, op, retry}.
 * Returns { pending: input for the next pass } or { done: response }.
 * A rate-limited reply gets one more try (the third pass), under its own key.
 */
function runUpdate(host, input) {
  const fsx = host.fs;
  const ctx = planUpdate(fsx, input.chatId, input.op);
  if (ctx.final) return { done: ctx.final };
  const key = input.retry ? "sensor_retry" : "sensor";
  const r = host.llm.results[key];
  if (!r) {
    askSensor(host, ctx, key);
    return { pending: { chatId: input.chatId, op: input.op, retry: !!input.retry } };
  }
  if (!input.retry && r.error && isRateLimit(r)) {
    askSensor(host, ctx, "sensor_retry");
    return { pending: { chatId: input.chatId, op: input.op, retry: true } };
  }
  return { done: commitUpdate(fsx, ctx, r) };
}

// ---------- catch-up on a tick ----------
const RECENT_MS = 30 * 60 * 1000;
const ERROR_PAUSE_MS = 10 * 60 * 1000;

/** The newest recently-active chat whose newest message has no snapshot. */
function pickChat(fsx) {
  let files = [];
  try {
    files = fsx.list("chats").filter((f) => f.endsWith(".meta.json"));
  } catch {}
  const now = Date.now();
  const recent = [];
  for (const f of files) {
    const id = f.replace(/\.meta\.json$/, "");
    const meta = readJson(fsx, "chats/" + f, null);
    if (!CHAT_ID.test(id) || !isObj(meta) || meta.temporary || !(now - Number(meta.updatedAt) <= RECENT_MS)) continue;
    recent.push({ id, at: Number(meta.updatedAt) });
  }
  recent.sort((a, b) => b.at - a.at);
  for (const { id } of recent) {
    const { state } = loadState(fsx, id);
    if (state.lastError && now - Number(state.lastError.at) < ERROR_PAUSE_MS) continue;
    // nothing to do (already has a snapshot, or no new text): not worth a call
    if (planUpdate(fsx, id, "catchup").final) continue;
    return id;
  }
  return null;
}

/** State files of chats that no longer exist (at most 20 per tick). */
function removeOrphans(fsx) {
  let files = [];
  try {
    files = fsx.list(STATE_DIR.slice(0, -1)).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  let removed = 0;
  for (const f of files) {
    if (removed >= 20) break;
    const id = f.replace(/\.json$/, "");
    if (readJson(fsx, "chats/" + id + ".meta.json", null) !== null) continue;
    try {
      fsx.remove(STATE_DIR + f);
      removed++;
    } catch {}
  }
}

export function onTick(ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx) return;
  try {
    const next = (input) => runUpdate(host, input);
    let input = ctx && isObj(ctx.dashboard) ? ctx.dashboard : null;
    if (!input) {
      const cfg = loadConfig(fsx);
      const id = cfg.catchUp === false || cfg.mode === "manual" ? null : pickChat(fsx);
      if (!id) {
        removeOrphans(fsx);
        return;
      }
      input = { chatId: id, op: "catchup", retry: false };
    }
    const step = next(input);
    if (step.pending) return { ...(ctx || {}), dashboard: step.pending };
    removeOrphans(fsx);
  } catch (e) {
    try {
      host.log("dashboard onTick: " + (e && e.message ? e.message : String(e)));
    } catch {}
  }
}

// ---------- the prompt insert: how the characters are right now ----------
// Words only: no stat numbers, no digits from code, never the blind spot.
// The first live run read the insert as text to retell and walked through every
// listed character each turn, so the story stood still: say what it is for.
const CLOSING =
  "This is background for the next reply, not text to retell: do not restate it, and do not walk through every character each turn. Others present may still act on their own when it fits. Move the story forward; the open threads are there to pull on. Show the state only through behavior, body language, and voice. Never mention numbers, scores, or these notes.";
const PRONOUNS = {
  she: { their: "her", them: "her", self: "herself" },
  he: { their: "his", them: "him", self: "himself" },
  they: { their: "their", them: "them", self: "themself" },
};
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];
const FULL_FOCUS = 3;

const pronounsOf = (soul) => PRONOUNS[soul && soul.pronouns] || PRONOUNS.they;
const estimateTokens = (s) => Math.ceil(String(s).length / 3.2);

function dayWords(clock) {
  const day = Number(clock && clock.day) || 1;
  const which = day <= ORDINALS.length ? "the " + ORDINALS[day - 1] + " day" : "a day long into the story";
  const band = clock && clock.band ? cap1(clock.band) : "";
  return band ? band + " of " + which : cap1(which);
}

/** One warmth word for a character drawn small. */
function warmthWord(stats) {
  const v = (stats.trust + stats.comfort + stats.affection) / 3;
  if (v > 50) return "warm";
  if (v > 10) return "friendly";
  if (v >= -10) return "neutral";
  if (v >= -50) return "cool";
  return "hostile";
}

function hostilityWords(h) {
  if (h === null || h === undefined) return "";
  if (h >= 70) return "openly hostile, waits for a chance to strike";
  if (h >= 30) return "resentful and guarded";
  return h > 0 ? "a grudge held in check" : "";
}

/** The turn labels: ctx.turn from the engine, or the raw field an older engine leaves in the request. */
function turnOf(ctx) {
  const t = isObj(ctx.turn) ? ctx.turn : ctx.request && isObj(ctx.request.turn) ? ctx.request.turn : {};
  const msgs = ctx.request && Array.isArray(ctx.request.messages) ? ctx.request.messages : [];
  const lastUser = msgs.filter((m) => m && m.role === "user" && typeof m.content === "string").slice(-1)[0];
  return { op: str(t.op), speakerName: str(t.speakerName), targetId: str(t.targetId), userText: lastUser ? lastUser.content.slice(-2000) : "" };
}

/** Is the name in the text, allowing for endings (Mariann for Marianna, Chandru for Chandra)? */
export function mentions(text, name) {
  const t = " " + String(text).toLowerCase().replace(/[^\p{L}\p{N}']+/gu, " ") + " ";
  const n = String(name).toLowerCase();
  const stem = n.length > 5 ? n.slice(0, -2) : n.length > 3 ? n.slice(0, -1) : n;
  return t.includes(" " + stem);
}

/** In a narrator chat: who this turn is about (named by the user, or on the receiving end last turn). */
function aboutNow(present, userText, snap) {
  const named = present.filter((n) => userText && mentions(userText, n));
  const touched = arr(snap.events).map((e) => e.to).filter((n) => present.includes(n));
  return unique([...named, ...touched]);
}

/** The snapshot that stands for the story just before the reply being written. */
export function snapshotFor(state, line, turn) {
  const keys = line.map((l) => l.key);
  let end = keys.length;
  if ((turn.op === "swipe" || turn.op === "continue") && turn.targetId) {
    const at = line.findIndex((l) => l.msg.id === turn.targetId);
    if (at >= 0) end = at;
  }
  const i = nearestSnapshot(state, keys, end);
  return i >= 0 ? { key: keys[i], snap: state.snapshots[keys[i]], keys: keys.slice(0, i + 1) } : null;
}

function knowsLine(name, user, notes, nameEntry, pr) {
  const saw = notes.filter((n) => n.how === "saw").map((n) => n.text);
  const heard = notes.filter((n) => n.how === "heard");
  const guess = notes.filter((n) => n.how === "guess").map((n) => n.text);
  const parts = [];
  if (saw.length) parts.push("Saw: " + saw.join("; ") + ".");
  for (const n of heard) parts.push((n.from && n.from !== "user" ? n.from : user) + " told " + pr.them + ": " + n.text + ".");
  if (guess.length) parts.push("Guesses: " + guess.join("; ") + ".");
  if (nameEntry && !nameEntry.knowsUserName) {
    parts.push((nameEntry.calls ? "Knows " + user + " only as \"" + nameEntry.calls + "\" and" : "Has") + " never heard " + user + "'s name.");
  }
  if (!parts.length) return "What " + name + " knows about " + user + ": nothing yet beyond what happens in front of " + pr.them + ".";
  return "What " + name + " knows about " + user + ": " + parts.join(" ") + " Anything else about " + user + ", " + name + " does not know.";
}

// a feeling this close to neutral is not worth a phrase
const FELT = 10;

function feelingsLine(c, user, who) {
  if (DISPOSITION.every((s) => !c.stats[s])) return "no history yet";
  const felt = DISPOSITION.filter((s) => Math.abs(c.stats[s]) >= FELT);
  return felt.length ? felt.map((s) => tierPhrase(s, c.stats[s], who)).join("; ") : "no strong feelings yet";
}

/** Day, place and who is there: once, above the characters. */
function sceneLine(snap, user) {
  const where = [snap.clock && snap.clock.place, snap.clock && snap.clock.weather].filter(Boolean).join("; ");
  return "[Background, the scene: " + dayWords(snap.clock) + "." + (where ? " " + where + "." : "") + " Present: " + [user, ...arr(snap.present)].join(", ") + ".]";
}

/** The full block of one character. withNotes = false when it would leak. */
function characterBlock(ctx, name, withNotes) {
  const { snap, user } = ctx;
  const c = snap.chars[name];
  const soul = ctx.souls[name];
  const pr = pronounsOf(soul);
  const who = { user, their: pr.their, self: pr.self };
  const lines = ["[How " + name + " is right now:"];
  const hostile = hostilityWords(c.hostility);
  lines.push("Toward " + user + ": " + feelingsLine(c, user, who) + (hostile ? "; " + hostile : "") + ".");
  const bases = pulseBases(soul);
  const pulse = PULSE.map((p) => PULSE_BANDS[p][pulseBand(c.pulse[p], bases[p])]).filter(Boolean);
  // snapshots from before `fresh` existed count every field as fresh
  const isFresh = (f) => !Array.isArray(c.fresh) || c.fresh.includes(f);
  const mood = c.mood ? "Mood: " + c.mood + (c.moodWas && isFresh("mood") ? ", shifting from " + c.moodWas : "") + "." : "";
  if (mood || pulse.length) lines.push([mood, pulse.length ? cap1(pulse.join("; ")) + "." : ""].filter(Boolean).join(" "));
  // body, clothes and hands only when seen this turn: a stale detail gets retold forever
  const body = [
    c.condition && isFresh("condition") && "Body: " + c.condition + ".",
    c.outfit && isFresh("outfit") && "Wearing: " + c.outfit + ".",
    c.holding && isFresh("holding") && "Holding: " + c.holding + ".",
    // a goal carried from an old turn kept a character repeating it ("close ranks!")
    c.goal && isFresh("goal") && "Wants: " + c.goal + ".",
  ].filter(Boolean);
  if (body.length) lines.push(body.join(" "));
  if (withNotes) {
    const notes = arr(ctx.notebook[name]).slice(-12);
    const nameEntry = arr(ctx.names[name]).slice(-1)[0];
    lines.push(knowsLine(name, user, notes, nameEntry, pr));
  }
  if (soul && str(soul.coping)) lines.push("Under strain: " + cut(str(soul.coping), 200) + ".");
  lines.push("]");
  return lines.join("\n");
}

function compactLine(ctx, name) {
  const c = ctx.snap.chars[name];
  return name + ": " + warmthWord(c.stats) + " toward " + ctx.user + (c.mood ? ", " + c.mood : "") + ".";
}

/**
 * The insert for one reply, or null. turn = {op, speakerName, targetId, userText}.
 * Returns { text, tokens, focus, notebookOf, key }.
 */
export function buildInsert(fsx, chatId, turn, cfg) {
  if (turn.op === "impersonate") return null;
  const chat = readChat(fsx, chatId);
  if (!chat) return null;
  const { state, existed } = loadState(fsx, chatId);
  if (!existed) return null;
  const line = activeLine(chat.msgs);
  const at = snapshotFor(state, line, turn);
  if (!at || !isObj(at.snap.chars)) return null;
  const { names: cards, souls } = chatCharacters(fsx, chat.meta);
  const snap = at.snap;
  const present = arr(snap.present).filter((n) => snap.chars[n]);
  const group = !!chat.meta.groupId;
  // a one-card chat whose card is in the scene is an ordinary character chat: the card speaks
  const cardSpeaks = !group && cards.length === 1 && present.includes(cards[0]) ? cards[0] : null;
  const speaker = turn.speakerName && present.includes(turn.speakerName) ? turn.speakerName : cardSpeaks;
  // who gets a full block: the speaker; in a narrator chat, those this turn is about (maybe nobody:
  // then everyone is one short line, which keeps the narrator from a roll call of the cast)
  const focus = speaker ? [speaker] : group ? present.slice(0, FULL_FOCUS) : aboutNow(present, turn.userText, snap).slice(0, FULL_FOCUS);
  if (!present.length) return null;
  // notebooks: the speaker's own; in a one-card chat (a narrator voices them all) each focus character's;
  // none when a group chat cannot say who speaks, so nothing leaks to the wrong character
  const notesFor = speaker ? [speaker] : group ? [] : focus;
  const ctx = {
    snap,
    souls,
    user: userNameOf(fsx, chat.meta),
    notebook: activeNotebook(state, at.keys),
    names: activeNames(state, at.keys),
  };
  const rest = present.filter((n) => !focus.includes(n));
  // where the story can go: the model had nothing to pull on and the story stood still (no ids: no digits)
  const open = arr(snap.threads).filter((t) => t.status === "open" && str(t.text)).map((t) => str(t.text));
  const threads = open.length ? "[Open threads the story can move toward: " + open.join("; ") + ".]" : "";
  // maxTokens is per character block; the scene, threads and closing lines come on top
  const shared = estimateTokens(sceneLine(snap, ctx.user) + threads + CLOSING);
  const budget = Math.max(200, Number(cfg.injection && cfg.injection.maxTokens) || 300) * Math.max(1, focus.length) + shared;
  const build = (withRest, notes) => {
    const blocks = [sceneLine(snap, ctx.user), ...focus.map((n) => characterBlock(ctx, n, notes.includes(n)))];
    if (withRest && rest.length) blocks.push((focus.length ? "Also present: " : "People here: ") + rest.map((n) => compactLine(ctx, n)).join(" "));
    if (threads) blocks.push(threads);
    blocks.push(threads ? CLOSING : CLOSING.replace("; the open threads are there to pull on", ""));
    return blocks.join("\n");
  };
  let text = build(true, notesFor);
  if (estimateTokens(text) > budget) text = build(false, notesFor);
  if (estimateTokens(text) > budget) text = build(false, []);
  return { text, tokens: estimateTokens(text), focus, notebookOf: notesFor.filter((n) => focus.includes(n)), key: at.key };
}

/** The insert goes in as the last of the leading system messages (after the card and preset, before the history). */
function withInsert(messages, text) {
  let lead = 0;
  while (lead < messages.length && messages[lead] && messages[lead].role === "system") lead++;
  return [...messages.slice(0, lead), { role: "system", content: text }, ...messages.slice(lead)];
}

export function llmRequest(ctx, host) {
  if (!ctx || ctx.key !== "reply") return null;
  const req = ctx.request || {};
  const chatId = String(req.sessionId || "");
  if (!CHAT_ID.test(chatId) || !Array.isArray(req.messages)) return null;
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx) return null;
  try {
    const cfg = loadConfig(fsx);
    if (cfg.injection && cfg.injection.enabled === false) return null;
    const insert = buildInsert(fsx, chatId, turnOf(ctx), cfg);
    return insert ? { messages: withInsert(req.messages, insert.text) } : null;
  } catch (e) {
    try {
      host.log("dashboard insert: " + (e && e.message ? e.message : String(e)));
    } catch {}
    return null;
  }
}

/** Settings "What the model sees": the insert for a speaker as the next reply would get it. */
function previewInsert(req, fsx) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const speakerName = str(req.query && req.query.speaker);
  const insert = buildInsert(fsx, chatId, { op: "send", speakerName, targetId: "", userText: str(req.query && req.query.text) }, loadConfig(fsx));
  if (!insert) return ok({ insert: null });
  const { state } = loadState(fsx, chatId);
  const snap = state.snapshots[insert.key];
  const blind = Object.values(snap.chars || {}).map((c) => str(c.blindSpot)).filter(Boolean);
  return ok({
    insert,
    checks: {
      // code writes no digits; any here come from story text the sensor reported
      digits: (insert.text.match(/\d+/g) || []).length,
      noBlindSpot: !blind.some((b) => insert.text.includes(b)),
      notebookOf: insert.notebookOf,
    },
  });
}

// ---------- routes ----------
function readUpdate(req, host) {
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const op = cut(str(b.op) || "send", 20);
  const step = runUpdate(host, { chatId, op, retry: !!(req.stash && req.stash.retry) });
  return step.pending ? { __llmPending: true, stash: step.pending } : step.done;
}

function readState(req, fsx) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const { state, existed } = loadState(fsx, chatId);
  const chat = readChat(fsx, chatId);
  const keys = chat ? activeLine(chat.msgs).map((l) => l.key) : [];
  const current = keys.slice().reverse().find((k) => state.snapshots[k]) || null;
  return ok({ state: existed ? state : null, activeKeys: keys, current });
}

function configBody(fsx) {
  const cfg = loadConfig(fsx);
  return { ...cfg, custom: customPrompts(fsx), events: Object.values(loadVocab(fsx)) };
}

function putConfig(req, fsx) {
  // the panel editor sends { enabled, values }; direct callers send a flat body
  const b0 = isObj(req.body) ? req.body : {};
  const b = isObj(b0.values) ? { ...b0, ...b0.values } : b0;
  // the panel switch is the mode: off = manual
  if (typeof b0.enabled === "boolean" && b.mode === undefined) b.mode = b0.enabled ? "sensor" : "manual";
  writeConfig(fsx, nextConfig(storedConfig(fsx), b));
  return ok(configBody(fsx));
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (!path.startsWith("/dashboard/")) return null;
  const fsx = host.fs;
  const method = req.method;
  if (path === "/dashboard/update" && method === "POST") return readUpdate(req, host);
  if (path === "/dashboard/state" && method === "GET") return readState(req, fsx);
  if (path === "/dashboard/preview" && method === "GET") return previewInsert(req, fsx);
  if (path === "/dashboard/config" && method === "GET") return ok(configBody(fsx));
  if (path === "/dashboard/config" && method === "PUT") return putConfig(req, fsx);
  // "Restore default prompts" in the panel
  if (path === "/dashboard/config/prompts" && method === "DELETE") {
    const next = { ...storedConfig(fsx) };
    for (const key of PROMPT_KEYS) delete next[key];
    writeConfig(fsx, next);
    return ok(configBody(fsx));
  }
  return null;
}

export function uiPanel(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  const cfg = fsx ? loadConfig(fsx) : mergeConfig({});
  const custom = fsx ? customPrompts(fsx) : [];
  return {
    label: "Relationship dashboard",
    icon: "heart",
    hint: "A sensor model reads each new reply; code turns what it reports into relationship numbers per character. State: data/dashboard/.",
    items: [
      {
        id: "config",
        title: "Sensor",
        subtitle: (cfg.mode === "manual" ? "manual" : "sensor") + " · " + (str(cfg.sensorModel) || "chat model"),
        enabled: cfg.mode !== "manual",
        saveUrl: "/dashboard/config",
        ...(custom.length ? { deleteUrl: "/dashboard/config/prompts", deleteLabel: "Restore default prompts" } : {}),
        fields: [
          { key: "sensorModel", label: "Sensor model", hint: "Empty = the chat's own model. A cheap, fast model is enough: it only reports what happened, as JSON.", placeholder: "provider/model-id", kind: "model", value: cfg.sensorModel || "" },
          { key: "mode", label: "Mode", hint: "sensor: update after replies. manual: no automatic updates.", kind: "select", list: ["sensor", "manual"], value: cfg.mode },
          { key: "catchUp", label: "Catch up", hint: "Update a recently active chat in the background when it missed an update.", kind: "select", list: ["on", "off"], value: cfg.catchUp ? "on" : "off" },
          { key: "sensor", label: "Sensor prompt", hint: custom.includes("sensor") ? "Changed from the default: Restore default prompts (below) puts it back." : "This is the default; edit it to change what the sensor is told. The event list and the output shape are added by code.", kind: "textarea", rows: 12, advanced: true, value: promptOf("sensor", cfg) },
        ],
      },
    ],
  };
}
