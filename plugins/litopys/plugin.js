/**
 * Litopys — world-lore keeper for roleplay chats.
 *
 * Two passes, one plugin (separated by cadence and rights, not by process):
 *
 *  SCRIBE (frequent, append-only, safe):
 *    reads recent messages → proposes world facts (places, NPCs, items,
 *    events, lore — NEVER relationship feelings/metrics, that's the tracker's
 *    job), chronicle events and a running story recap.
 *    Applies: new facts (exact-dupes skipped), chronicle, storySoFar.
 *    Exact-text retirements auto-apply; rewrites go to proposals.
 *    Source of truth: data/litopys/store.json (ids, statuses, history).
 *    Human face: data/vault-chats/<character>.md, regenerated on every commit.
 *
 *  CURATOR (rare, destructive power — mostly 제안):
 *    reads the whole lore store (+ tracker facts/threads) → an LLM pass
 *    judges each item: keep | merge | retire | rewrite.
 *    Auto-applies ONLY exact-duplicate merges; everything else becomes a
 *    proposal in data/litopys/proposals.json for approval
 *    (Litopys panel or POST /litopys/proposals).
 *    Also backfills missing ids in tracker facts/threads so later ops can
 *    address them precisely.
 *
 *  Timeline/chronicle is append-only — curation never deletes history, it
 *  retires facts (status kept in JSON, hidden from MD).
 *
 * Routes (under /v1/apps/roleplay/):
 *  POST /litopys/poll {chatId} — scribe now (two-phase)
 *  POST /litopys/curate {chatId} — curator now (two-phase)
 *  GET  /litopys/state?chatId= — store slice + pending proposal count
 *  GET  /litopys/proposals?chatId= — pending (+ recent decided) proposals
 *    (each item also carries targetTexts[] — human-readable texts resolved
 *    from ids at read time, so the panel never shows raw f… ids)
 *  POST /litopys/proposals {action: approve|reject, ids[]} — apply
 *  POST /litopys/facts {chatId, action: add|retire|update|restore, id?, text?} —
 *    manual fact edit: add writes a new fact, retire hides one at once,
 *    update replaces its text, restore brings a retired one back. All
 *    commit to store.json + re-render the vault MD at once.
 *  POST /litopys/story {chatId, text} — the user's own recap ("" clears)
 *  GET /litopys/config · PUT /litopys/config
 *  DELETE /litopys/config/prompts — back to the shipped prompts
 */
const STORE_FILE = "litopys/store.json";
const PROPOSALS_FILE = "litopys/proposals.json";
const CONFIG_FILE = "litopys/config.json";
const VAULT_DIR = "vault-chats";

const DEFAULT_CONFIG = {
  enabled: true,
  extractEveryNTurns: 2,   // scribe when >= this*2 new messages
  curateEveryNTurns: 12,   // curator when >= this*2 new messages
  model: "",               // extraction model ref; "" = chat model
  autoApplySafe: true,     // exact-dupe merges apply without approval
  maxFacts: 80,
  maxChronicle: 200,
  // the lore block in every reply's prompt: off until asked for. Its hook never ran on
  // imported installs (an engine bug, fixed in 0.8.1), and Memory v2 will carry these facts
  inject: false,
};

// The prompts ship with the plugin. config.json holds a prompt only when the
// user changed it, so a better default reaches everyone who did not, and
// "Restore default prompts" in the panel drops the user's copy. The JSON
// schema and the lists the model works on are appended in code: no edit here
// can break the output format.
const DEFAULT_PROMPTS = {
  scribePrompt: [
    "You keep the lore record of an ongoing roleplay story. From the RECENT MESSAGES, record what is now true in the story's world, so it can be recalled many scenes later.",
    "",
    "Facts:",
    "- Record only what the messages state or show as true in the story. Never guess, never explain motives, never add knowledge from outside the story.",
    "- Keep what stays true across scenes: places and how they connect; characters and who they are (role, allegiance, kinship, lasting appearance); important objects and who holds them; past events that matter; rules of the world (magic, technology, laws, customs).",
    "- Leave out what holds for one scene only: moods and passing feelings, momentary actions, the time of day, the weather, today's clothes.",
    "- A claim, belief or lie of a character is not a fact of the world: record it as theirs (\"Mira says the bridge is guarded\").",
    "- Write each fact as one sentence that makes sense read alone: names, never pronouns. Use the names in the CHARACTER and USER lines for the two leads.",
    "- Add only what CURRENT FACTS does not already say, even in other words. At most 8 new facts: keep the most important.",
    "- When a message changes a current fact, put it in updated, quoting the current text exactly. When it ends or disproves one, quote it exactly in retired.",
    "- Out-of-character notes and instructions to the AI are not part of the story.",
    "",
    "Chronicle: the events in THESE messages that move the story, in order, one short line each: who did what, and what came of it. Skip small talk.",
    "",
    "Recap (storySoFar): the whole story so far in at most 250 words, past tense: CURRENT RECAP brought up to date with these messages. Say where things stand, what is unresolved and what the characters are after. Return null when nothing important changed.",
    "",
    "Language: write facts, chronicle and recap in the language the story is written in (the language most messages use). Keep every name exactly as the story spells it.",
  ].join("\n"),
  curatePrompt: [
    "You maintain the lore record of a roleplay story. Read EVERY listed item. Return an op only for an item that needs one; every item you leave out is kept as it is.",
    "",
    "- merge: two or more items say the same thing. targets[0] is the one kept; give text when a combined wording is clearer than any of them.",
    "- rewrite: the item is true but badly worded: a pronoun instead of a name, vague, two facts in one, or a rumor stated as truth. text is the fixed wording, with the same meaning.",
    "- retire: the item is no longer true or no longer matters: a later item contradicts it, it was resolved and nothing refers to it since, or it is a one-scene detail (a mood, the weather, the time of day) that slipped in.",
    "",
    "Be conservative: when unsure, keep. Age alone is never a reason to retire: a long-past event that shaped the story stays. Never add facts of your own. Quote targets exactly as listed. Write text in the language of the items. Give each op a reason of a few words.",
  ].join("\n"),
};

// Defaults earlier versions wrote into config.json in full. A config holding
// one verbatim never chose it, so it follows the current default.
const PAST_DEFAULT_PROMPTS = {
  scribePrompt: [
    "You are a lore archivist for a roleplay conversation. Extract WORLD facts only: places, NPCs, items, events, rules of the world. " +
      "NEVER relationship content (feelings, attraction, trust, dynamic between CHARACTER and USER) — a separate tracker owns that. " +
      "NEVER scene-volatile detail (exact hour, weather right now) — that lives in the scene block, not the lore. " +
      "Facts must be durable: true across many scenes. One fact per line, self-contained (names, not pronouns). " +
      "If a new message contradicts or replaces an earlier-listed fact, quote it in updated/retired — never silently duplicate. " +
      "Chronicle: only plot-moving events from THESE messages (who did what, 1 line each). storySoFar: full replacement recap ≤250 words, or null to keep.",
  ],
  curatePrompt: [
    "You are the curator of a lore vault. Judge EVERY listed item. " +
      "merge: exact or near duplicates (keep the clearest wording). retire: played-out, resolved, contradicted by later events, or scene-volatile trivia that slipped in. " +
      "rewrite: true fact with bad wording (pronouns, vagueness). keep: everything still true and useful. " +
      "Be conservative with retire: when in doubt, keep. A fact is played-out only if the story moved past it AND nothing references it anymore. " +
      "Reason each op in a few words.",
  ],
};
const PROMPT_KEYS = Object.keys(DEFAULT_PROMPTS);

// ---------- tiny utils ----------
const readJson = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const uid = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** A prompt as the user would see it changed: whitespace does not count. */
const promptKey = (s) => String(s || "").replace(/\s+/g, " ").trim();
const isDefaultPrompt = (key, text) =>
  !promptKey(text) || [DEFAULT_PROMPTS[key], ...PAST_DEFAULT_PROMPTS[key]].some((d) => promptKey(d) === promptKey(text));

/** config.json as stored, minus prompts that are a default (so they follow it). */
function storedConfig(fsx) {
  const raw = readOwn(fsx, CONFIG_FILE, null);
  const cfg = raw && typeof raw === "object" ? { ...raw } : {};
  for (const key of PROMPT_KEYS) if (typeof cfg[key] !== "string" || isDefaultPrompt(key, cfg[key])) delete cfg[key];
  return cfg;
}

/** The config in effect: defaults, then what the user chose. */
function loadConfig(fsx) {
  return { ...DEFAULT_CONFIG, ...DEFAULT_PROMPTS, ...storedConfig(fsx) };
}

/** Which prompts the user changed. */
const customPrompts = (fsx) => PROMPT_KEYS.filter((key) => key in storedConfig(fsx));
// Renamed from Archivarius: a store written before the rename lives in archivarius/*.
// It moves over ONCE: when litopys/store.json is missing and archivarius/store.json
// exists, the store, proposals and config are copied into litopys/ (a file litopys
// already has stays). After that archivarius/ is never read; its files stay on disk.
const LEGACY_DIR = "archivarius/";
function moveLegacy(fsx) {
  try {
    if (fsx.list("litopys").includes("store.json")) return;
  } catch {}
  const old = readJson(fsx, LEGACY_DIR + "store.json", null);
  if (old === null) return;
  try {
    fsx.write(STORE_FILE, JSON.stringify(old, null, 2));
    for (const file of [PROPOSALS_FILE, CONFIG_FILE]) {
      const name = file.split("/").pop();
      let have = true;
      try {
        have = fsx.list("litopys").includes(name);
      } catch {
        have = false;
      }
      if (have) continue;
      const prev = readJson(fsx, LEGACY_DIR + name, null);
      if (prev !== null) fsx.write(file, JSON.stringify(prev, null, 2));
    }
  } catch {}
}
const readOwn = (fsx, file, dflt) => {
  moveLegacy(fsx);
  return readJson(fsx, file, dflt);
};
const loadStore = (fsx) => readOwn(fsx, STORE_FILE, { chats: {} });
const saveStore = (fsx, s) => fsx.write(STORE_FILE, JSON.stringify(s, null, 2));
const loadProposals = (fsx) => readOwn(fsx, PROPOSALS_FILE, { items: [] });
const saveProposals = (fsx, p) => fsx.write(PROPOSALS_FILE, JSON.stringify(p, null, 2));

function slugify(name, fallback) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яёїіє]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || fallback;
}

function emptyChatStore() {
  return {
    charName: null,
    userName: null,
    slug: null,
    worldFacts: [],    // [{ id, text, kind, at, updatedAt, status: active|retired }]
    chronicle: [],     // [{ at, note }]
    storySoFar: null,
    lastExtractLen: 0,
    turnsExtracted: 0,
    lastCurateLen: 0,
    turnsCurated: 0,
  };
}

function record(st, note, cfg) {
  st.chronicle.push({ at: Date.now(), note: String(note).slice(0, 300) });
  if (st.chronicle.length > (cfg.maxChronicle || 200)) st.chronicle.splice(0, st.chronicle.length - (cfg.maxChronicle || 200));
}

function readMsgs(fsx, chatId) {
  const lines = [];
  try {
    for (const line of String(fsx.read("chats/" + chatId + ".jsonl")).split("\n")) {
      const t = line.trim();
      if (t) {
        try {
          lines.push(JSON.parse(t));
        } catch {}
      }
    }
  } catch {}
  return lines;
}

function transcriptOf(msgs, n) {
  const lines = [];
  for (const m of msgs.slice(-n)) {
    const who = m.role === "user" ? "User" : m.name || "Character";
    const t = String(m.text || "").trim();
    if (t) lines.push(who + ": " + t.slice(0, 1500));
  }
  return lines.join("\n");
}

function parseOut(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------- MD render (human face of the JSON truth) ----------
function renderMd(fsx, chatId, cst, tst) {
  const facts = (cst.worldFacts || []).filter((f) => f.status !== "retired");
  const L = [];
  L.push("---");
  L.push("chat: " + chatId);
  L.push("character: " + (cst.charName || "?"));
  L.push("user: " + (cst.userName || "?"));
  L.push("updated: " + new Date().toISOString().slice(0, 10));
  L.push("turns: " + (cst.turnsExtracted || 0));
  L.push("---");
  L.push("");
  L.push("# " + (cst.charName || "Chat"));
  L.push("");
  L.push("## Суть лінії");
  L.push(cst.storySoFar || "_(переказ ще не складений — з'явиться після кількох проходів Писаря)_");
  L.push("");
  if (tst && tst.metrics) {
    const icons = { affection: "💕", romance: "💘", lust: "🔥", trust: "🛡️", respect: "🎖️", comfort: "😌" };
    const bond = Object.keys(icons)
      .map((k) => icons[k] + " " + k[0].toUpperCase() + k.slice(1) + " " + (Number(tst.metrics[k]) || 0))
      .join(" · ");
    L.push("## Бонд (зріз трекера)");
    L.push(bond + (tst.phase ? " · Phase: " + tst.phase : "") + (tst.mood ? " · Mood: " + tst.mood : ""));
    L.push("");
  }
  if (tst && tst.scene && (tst.scene.location || tst.scene.context)) {
    L.push("## Сцена");
    L.push([tst.scene.time, tst.scene.date, tst.scene.location, tst.scene.weather].filter(Boolean).join(" · "));
    if (tst.scene.context) L.push(tst.scene.context);
    L.push("");
  }
  L.push("## Факти світу");
  if (facts.length) for (const f of facts) L.push("- " + f.text);
  else L.push("_(поки немає)_");
  L.push("");
  const chron = (cst.chronicle || []).filter((c) => c.note && !String(c.note).startsWith("tracked"));
  if (chron.length) {
    L.push("## Хроніка");
    for (const c of chron.slice(-20)) L.push("- " + c.note);
    L.push("");
  }
  if (tst && tst.threads && tst.threads.length) {
    L.push("## Відкриті хвости (трекер)");
    for (const t of tst.threads) L.push("- " + t.text);
    L.push("");
  }
  L.push("## Нотатки агента");
  L.push("- Бонд-метрики, настрій і хвости веде трекер; тут — світ, події, переказ.");
  L.push("- Хроніка append-only: Доглядач прибирає факти (retire), але не історію.");
  try {
    fsx.write(VAULT_DIR + "/" + slugify(cst.charName, "chat") + "-" + chatId.slice(-6) + ".md", L.join("\n"));
  } catch (e) {
    try {
      host_log(fsx, e);
    } catch {}
  }
}
function host_log(_fsx, _e) {}

// ---------- SCRIBE ----------
function scribePromptFor(cfg, cst, charName, userName, transcript) {
  const schema =
    "OUTPUT JSON ONLY:\n" +
    "{\n" +
    '  "facts": [{ "text": string, "kind": "place"|"npc"|"item"|"event"|"lore" }],\n' +
    '  "chronicle": string[],\n' +
    '  "storySoFar": string | null,\n' +
    '  "retired": string[],\n' +
    '  "updated": [{ "match": string, "text": string }]\n' +
    "}\n" +
    "facts: durable world facts from THESE messages. chronicle: plot-moving events from THESE messages. " +
    "retired: exact texts from CURRENT FACTS below that these messages played out or contradicted. " +
    "updated: {match: exact current text, text: replacement}.";
  const current = (cst.worldFacts || []).filter((f) => f.status !== "retired").map((f) => f.text);
  return (
    cfg.scribePrompt + "\n\n" + schema + "\n\n" +
    "CHARACTER: " + (charName || "?") + " | USER: " + (userName || "User") + "\n" +
    "CURRENT FACTS:\n" + (current.length ? current.map((t) => "- " + t).join("\n") : "(none)") + "\n" +
    "CURRENT RECAP: " + (cst.storySoFar || "(none)") + "\n" +
    "RECENT MESSAGES:\n" + transcript
  );
}

function armScribe(fsx, chatId, cfg, host) {
  const msgs = readMsgs(fsx, chatId);
  const meta = readJson(fsx, "chats/" + chatId + ".meta.json", {}) || {};
  const store = loadStore(fsx);
  const cst = store.chats[chatId] || emptyChatStore();
  const charName = cst.charName || meta.title || msgs.find((m) => m.role === "char" && m.name)?.name || null;
  const userName = cst.userName || meta.userName || null;
  const transcript = transcriptOf(msgs, 24);
  if (!transcript) return { error: "chat has no trackable messages" };
  host.llm.request("arch_scribe_" + chatId + "_" + msgs.length, {
    messages: [{ role: "user", content: scribePromptFor(cfg, cst, charName, userName, transcript) }],
    ...(cfg.model && String(cfg.model).trim() ? { model: String(cfg.model).trim() } : {}),
  });
  return { armed: true };
}

function addProposal(fsx, chatId, op, scope, targets, text, reason) {
  const p = loadProposals(fsx);
  p.items.push({
    id: uid(),
    chatId,
    op,            // merge | retire | rewrite
    scope,         // lore | tracker
    targets: targets || [],
    text: text || null,
    reason: String(reason || "").slice(0, 200),
    at: Date.now(),
    status: "pending",
  });
  if (p.items.length > 100) p.items.splice(0, p.items.length - 100);
  saveProposals(fsx, p);
}

function collectScribe(fsx, chatId, host, cfg, key) {
  const reply = host.llm.results[key];
  if (!reply) return { error: "no result" };
  const out = parseOut(reply.text);
  if (!out) return { error: "scribe did not return valid JSON", raw: String(reply.text || "").slice(0, 400) };
  const store = loadStore(fsx);
  const cst = store.chats[chatId] || emptyChatStore();
  const notes = [];
  const active = () => (cst.worldFacts || []).filter((f) => f.status !== "retired");

  for (const f of Array.isArray(out.facts) ? out.facts.slice(0, 8) : []) {
    const text = String((f && f.text) || "").trim().slice(0, 250);
    if (!text) continue;
    if (active().some((x) => norm(x.text) === norm(text))) continue;
    cst.worldFacts.push({ id: uid(), text, kind: (f && f.kind) || "lore", at: Date.now(), updatedAt: Date.now(), status: "active" });
    notes.push("Fact: " + text);
  }
  for (const c of Array.isArray(out.chronicle) ? out.chronicle.slice(0, 5) : []) {
    const note = String(c).trim().slice(0, 250);
    if (note) record(cst, note, cfg);
  }
  if (typeof out.storySoFar === "string" && out.storySoFar.trim()) {
    cst.storySoFar = out.storySoFar.trim().slice(0, 1500);
    notes.push("Recap updated");
  }
  // exact-text retirements: safe, auto-apply
  for (const r of Array.isArray(out.retired) ? out.retired.slice(0, 5) : []) {
    const hit = active().find((x) => norm(x.text) === norm(r));
    if (hit) {
      hit.status = "retired";
      hit.updatedAt = Date.now();
      record(cst, "retired: " + hit.text, cfg);
      notes.push("Retired: " + hit.text);
    }
  }
  // rewrites: never silent — proposals
  for (const u of Array.isArray(out.updated) ? out.updated.slice(0, 5) : []) {
    if (!u || !u.match || !u.text) continue;
    const hit = active().find((x) => norm(x.text) === norm(u.match));
    if (hit && norm(hit.text) !== norm(u.text)) {
      addProposal(fsx, chatId, "rewrite", "lore", [hit.id], String(u.text).slice(0, 250), "scribe: fact changed");
      notes.push("Proposed rewrite: " + hit.text);
    }
  }

  if (cst.worldFacts.filter((f) => f.status !== "retired").length > (cfg.maxFacts || 80)) {
    notes.push("Fact cap reached — run the curator");
  }
  const msgs = readMsgs(fsx, chatId);
  cst.lastExtractLen = msgs.length;
  cst.turnsExtracted = (cst.turnsExtracted || 0) + 1;
  if (!cst.charName) {
    const meta = readJson(fsx, "chats/" + chatId + ".meta.json", {}) || {};
    cst.charName = meta.title || msgs.find((m) => m.role === "char" && m.name)?.name || null;
    cst.userName = meta.userName || null;
    cst.slug = slugify(cst.charName, chatId);
  }
  store.chats[chatId] = cst;
  saveStore(fsx, store);
  renderMd(fsx, chatId, cst, trackerSnapshot(fsx, chatId));
  return { done: true, notes };
}

// ---------- tracker interop (read-only snapshot + id backfill) ----------
function trackerSnapshot(fsx, chatId) {
  try {
    const st = (readJson(fsx, "tracker/state.json", { chats: {} }).chats || {})[chatId];
    return st || null;
  } catch {
    return null;
  }
}
function trackerState(fsx) {
  return readJson(fsx, "tracker/state.json", { chats: {} });
}
function saveTrackerState(fsx, s) {
  fsx.write("tracker/state.json", JSON.stringify(s, null, 2));
}

// ---------- CURATOR ----------
function curatePromptFor(cfg, cst, tst) {
  const schema =
    "OUTPUT JSON ONLY:\n" +
    '{ "ops": [{ "scope": "lore"|"tracker", "op": "merge"|"retire"|"rewrite", "targets": [exact texts from the lists], "text": string|null, "reason": string }] }\n' +
    "merge: targets[0] is the survivor (or text = merged wording). retire: played-out/resolved/trivia. rewrite: text = replacement for targets[0].";
  const lore = (cst.worldFacts || []).filter((f) => f.status !== "retired").map((f) => f.text);
  const tf = tst && Array.isArray(tst.facts) ? tst.facts.map((f) => f.text) : [];
  const tt = tst && Array.isArray(tst.threads) ? tst.threads.map((t) => t.text) : [];
  return (
    cfg.curatePrompt + "\n\n" + schema + "\n\n" +
    "LORE FACTS:\n" + (lore.length ? lore.map((t) => "- " + t).join("\n") : "(none)") + "\n" +
    "TRACKER FACTS (relationship — retire only if factually resolved, never for style):\n" +
    (tf.length ? tf.map((t) => "- " + t).join("\n") : "(none)") + "\n" +
    "TRACKER THREADS:\n" + (tt.length ? tt.map((t) => "- " + t).join("\n") : "(none)")
  );
}

function armCurate(fsx, chatId, cfg, host) {
  const msgs = readMsgs(fsx, chatId);
  if (!msgs.length) return { error: "chat has no messages" };
  const store = loadStore(fsx);
  const cst = store.chats[chatId] || emptyChatStore();
  const tst = trackerSnapshot(fsx, chatId);
  if (!cst.worldFacts.length && !(tst && (tst.facts || []).length)) return { error: "nothing to curate yet" };
  host.llm.request("arch_curate_" + chatId + "_" + msgs.length, {
    messages: [{ role: "user", content: curatePromptFor(cfg, cst, tst) }],
    ...(cfg.model && String(cfg.model).trim() ? { model: String(cfg.model).trim() } : {}),
  });
  return { armed: true };
}

/** Backfill missing ids in tracker facts/threads so ops can address them. Saves when changed. */
function backfillTrackerIds(fsx, chatId) {
  const s = trackerState(fsx);
  const st = s.chats[chatId];
  if (!st) return null;
  let dirty = false;
  for (const arr of [st.facts, st.threads]) {
    if (Array.isArray(arr)) for (const x of arr) if (x && !x.id) {
      x.id = uid();
      dirty = true;
    }
  }
  if (dirty) {
    s.chats[chatId] = st;
    saveTrackerState(fsx, s);
  }
  return st;
}

function findLore(cst, text) {
  const n = norm(text);
  return (cst.worldFacts || []).find((f) => f.status !== "retired" && (f.id === text || norm(f.text) === n));
}

/** Resolve proposal targets (ids or texts) to human-readable texts at read time. Never persisted. */
function targetTextsFor(fsx, chatId, scope, targets) {
  const list = Array.isArray(targets) ? targets : [];
  if (!list.length) return [];
  try {
    if (scope === "tracker") {
      const st = (readJson(fsx, "tracker/state.json", { chats: {} }).chats || {})[chatId];
      const pool = st ? [...(st.facts || []), ...(st.threads || [])] : [];
      return list.map((t) => {
        const hit = pool.find((x) => x && (x.id === t || norm(x.text) === norm(t)));
        return hit && hit.text ? hit.text : String(t);
      });
    }
    const store = loadStore(fsx);
    const cst = store.chats[chatId];
    if (!cst) return list.map((t) => String(t));
    return list.map((t) => {
      // match active first, then retired (so decided proposals still read well)
      const n = norm(t);
      const hit =
        (cst.worldFacts || []).find((f) => f.id === t) ||
        (cst.worldFacts || []).find((f) => norm(f.text) === n);
      return hit && hit.text ? hit.text : String(t);
    });
  } catch {
    return list.map((t) => String(t));
  }
}

const enrichProposal = (fsx, p) => ({ ...p, targetTexts: targetTextsFor(fsx, p.chatId, p.scope, p.targets) });

function collectCurate(fsx, chatId, host, cfg, key) {
  const reply = host.llm.results[key];
  if (!reply) return { error: "no result" };
  const out = parseOut(reply.text);
  if (!out) return { error: "curator did not return valid JSON", raw: String(reply.text || "").slice(0, 400) };
  const store = loadStore(fsx);
  const cst = store.chats[chatId] || emptyChatStore();
  backfillTrackerIds(fsx, chatId);
  const notes = [];
  let auto = 0;
  const ops = Array.isArray(out.ops) ? out.ops.slice(0, 20) : [];

  for (const o of ops) {
    if (!o || (o.op !== "merge" && o.op !== "retire" && o.op !== "rewrite")) continue;
    const scope = o.scope === "tracker" ? "tracker" : "lore";
    const targets = Array.isArray(o.targets) ? o.targets.map((t) => String(t)).slice(0, 4) : [];
    if (!targets.length) continue;
    const reason = String(o.reason || "curator").slice(0, 200);

    // SAFE + automatic: exact-duplicate merge inside lore (no judgment call)
    if (scope === "lore" && o.op === "merge" && cfg.autoApplySafe !== false && targets.length >= 2) {
      const hits = targets.map((t) => findLore(cst, t)).filter(Boolean);
      const uniq = new Set(hits.map((h) => norm(h.text)));
      if (hits.length >= 2 && uniq.size === 1) {
        const keep = hits[0];
        if (o.text && norm(o.text) !== norm(keep.text)) {
          keep.text = String(o.text).slice(0, 250);
          keep.updatedAt = Date.now();
        }
        for (const h of hits.slice(1)) {
          h.status = "retired";
          h.updatedAt = Date.now();
        }
        record(cst, "merged " + hits.length + " exact dupes", cfg);
        auto++;
        notes.push("Auto-merged " + hits.length + " duplicates");
        continue;
      }
    }
    addProposal(fsx, chatId, o.op, scope, targets, o.text ? String(o.text).slice(0, 250) : null, reason);
    notes.push("Proposed " + o.op + " (" + scope + "): " + (o.text || targets[0]));
  }

  const msgs = readMsgs(fsx, chatId);
  cst.lastCurateLen = msgs.length;
  cst.turnsCurated = (cst.turnsCurated || 0) + 1;
  store.chats[chatId] = cst;
  saveStore(fsx, store);
  renderMd(fsx, chatId, cst, trackerSnapshot(fsx, chatId));
  return { done: true, autoApplied: auto, notes };
}

// ---------- proposals ----------
function applyProposal(fsx, chatId, p, cfg) {
  const store = loadStore(fsx);
  const cst = store.chats[chatId];
  if (!cst) return { error: "no lore store for chat" };

  if (p.scope === "lore") {
    const hits = (p.targets || []).map((t) => findLore(cst, t)).filter(Boolean);
    if (!hits.length) return { error: "targets gone (already applied?)" };
    if (p.op === "retire") {
      for (const h of hits) {
        h.status = "retired";
        h.updatedAt = Date.now();
      }
      record(cst, "retired: " + hits.map((h) => h.text).join(" | "), cfg);
    } else if (p.op === "merge") {
      const keep = hits[0];
      if (p.text) keep.text = p.text;
      keep.updatedAt = Date.now();
      for (const h of hits.slice(1)) {
        h.status = "retired";
        h.updatedAt = Date.now();
      }
      record(cst, "merged: " + hits.map((h) => h.text).join(" | "), cfg);
    } else if (p.op === "rewrite") {
      if (!p.text) return { error: "rewrite needs text" };
      hits[0].text = p.text;
      hits[0].updatedAt = Date.now();
      record(cst, "rewrote → " + p.text, cfg);
    }
    store.chats[chatId] = cst;
    saveStore(fsx, store);
    renderMd(fsx, chatId, cst, trackerSnapshot(fsx, chatId));
    return { ok: true };
  }

  // tracker scope: match by id first, then exact text
  const s = trackerState(fsx);
  const st = s.chats[chatId];
  if (!st) return { error: "no tracker state for chat" };
  const match = (arr, t) => (Array.isArray(arr) ? arr.find((x) => x && (x.id === t || norm(x.text) === norm(t))) : null);
  const pool = [...(st.facts || []), ...(st.threads || [])];
  const hits = (p.targets || []).map((t) => pool.find((x) => x && (x.id === t || norm(x.text) === norm(t)))).filter(Boolean);
  if (!hits.length) return { error: "targets gone (already applied?)" };
  const drop = (arr, h) => {
    const i = (arr || []).indexOf(h);
    if (i !== -1) arr.splice(i, 1);
  };
  if (p.op === "retire") {
    for (const h of hits) {
      drop(st.facts, h);
      drop(st.threads, h);
    }
    st.timeline.push({ at: Date.now(), kind: "manual", note: "litopys retired: " + hits.map((h) => h.text).join(" | ").slice(0, 200) });
  } else if (p.op === "merge") {
    const keep = hits[0];
    if (p.text) keep.text = p.text;
    for (const h of hits.slice(1)) {
      drop(st.facts, h);
      drop(st.threads, h);
    }
  } else if (p.op === "rewrite") {
    if (!p.text) return { error: "rewrite needs text" };
    hits[0].text = p.text;
  }
  if (st.timeline.length > 200) st.timeline.splice(0, st.timeline.length - 200);
  s.chats[chatId] = st;
  saveTrackerState(fsx, s);
  return { ok: true };
}

// ---------- sweep ----------
function collectAny(fsx, host, cfg) {
  const done = [];
  const results = (host.llm && host.llm.results) || {};
  for (const key of Object.keys(results)) {
    if (!results[key]) continue;
    let m = /^arch_scribe_(.+)_\d+$/.exec(key);
    if (m) {
      done.push({ kind: "scribe", chatId: m[1], ...collectScribe(fsx, m[1], host, cfg, key) });
      continue;
    }
    m = /^arch_curate_(.+)_\d+$/.exec(key);
    if (m) done.push({ kind: "curator", chatId: m[1], ...collectCurate(fsx, m[1], host, cfg, key) });
  }
  return done;
}

function due(fsx, chatId, cst, cfg, kind) {
  const msgs = readMsgs(fsx, chatId);
  if (!msgs.length) return false;
  if (kind === "scribe") {
    return msgs.length - (Number(cst.lastExtractLen) || 0) >= clamp(Number(cfg.extractEveryNTurns) || 2, 1, 20) * 2;
  }
  return msgs.length - (Number(cst.lastCurateLen) || 0) >= clamp(Number(cfg.curateEveryNTurns) || 12, 4, 100) * 2;
}

/** A deleted chat leaves nothing behind: its store entry, its proposals and its
 *  vault page go. `files` is the listing of chats/ (null when it failed:
 *  nothing is dropped on a guess). True when the store or proposals changed. */
function pruneOrphans(fsx, store, files) {
  if (!Array.isArray(files)) return false;
  const live = new Set(files.filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -6)));
  const gone = Object.keys(store.chats || {}).filter((id) => !live.has(id));
  if (!gone.length) return false;
  const goneSet = new Set(gone);
  const liveTails = new Set([...live].map((id) => id.slice(-6)));
  let vault = [];
  try {
    vault = fsx.list(VAULT_DIR);
  } catch {}
  for (const id of gone) {
    delete store.chats[id];
    const tail = id.slice(-6);
    if (liveTails.has(tail)) continue;
    for (const f of vault) {
      if (f.endsWith("-" + tail + ".md")) {
        try {
          fsx.remove(VAULT_DIR + "/" + f);
        } catch {}
      }
    }
  }
  const props = loadProposals(fsx);
  const items = Array.isArray(props.items) ? props.items : [];
  const kept = items.filter((p) => !(p && goneSet.has(p.chatId)));
  if (kept.length !== items.length) saveProposals(fsx, { ...props, items: kept });
  return true;
}

export function onTick(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx) return;
  const cfg = loadConfig(fsx);
  if (cfg.enabled === false) return;
  try {
    for (const c of collectAny(fsx, host, cfg)) {
      if (c.error) host.log("litopys " + c.kind + " " + c.chatId + ": " + c.error);
    }
    const store = loadStore(fsx);
    let all = null;
    try {
      all = fsx.list("chats");
    } catch {}
    if (pruneOrphans(fsx, store, all)) saveStore(fsx, store);
    const chats = (all || []).filter((f) => f.endsWith(".meta.json"));
    for (const f of chats) {
      const chatId = f.replace(/\.meta\.json$/, "");
      const meta = readJson(fsx, "chats/" + f, null);
      if (!meta || meta.temporary) continue;
      const cst = store.chats[chatId] || emptyChatStore();
      if (due(fsx, chatId, cst, cfg, "scribe")) {
        if (armScribe(fsx, chatId, cfg, host).armed) break;
      } else if (due(fsx, chatId, cst, cfg, "curate")) {
        if (armCurate(fsx, chatId, cfg, host).armed) break;
      }
    }
  } catch (e) {
    try {
      host.log("litopys onTick: " + (e && e.message ? e.message : String(e)));
    } catch {}
  }
}

// ---------- routes ----------
export function handleRoute(req, host) {
  const fsx = host.fs;
  const path = String(req.path || "").split("?")[0];
  const body = () => (req.body && typeof req.body === "object" ? req.body : {});
  const ok = (json, status) => ({ status: status || 200, json });
  const err = (status, error) => ({ status, json: { error } });
  const cfg = loadConfig(fsx);
  const needChat = () => {
    const { chatId } = body();
    if (!chatId) return { error: err(400, "chatId required") };
    if (!readJson(fsx, "chats/" + chatId + ".meta.json", null)) return { error: err(404, "no such chat") };
    return { chatId };
  };

  if (path === "/litopys/poll" && req.method === "POST") {
    const n = needChat();
    if (n.error) return n.error;
    const swept = collectAny(fsx, host, cfg).filter((c) => c.chatId === n.chatId && c.kind === "scribe");
    const fresh = swept.find((c) => !c.error && !c.duplicate) || swept.find((c) => !c.error);
    if (fresh) return ok(fresh);
    const bad = swept.find((c) => c.error);
    if (bad) return err(502, bad.error);
    const r = armScribe(fsx, n.chatId, cfg, host);
    if (r.error) return err(400, r.error);
    return { __llmPending: true };
  }

  if (path === "/litopys/curate" && req.method === "POST") {
    const n = needChat();
    if (n.error) return n.error;
    const swept = collectAny(fsx, host, cfg).filter((c) => c.chatId === n.chatId && c.kind === "curator");
    const fresh = swept.find((c) => !c.error) || null;
    if (fresh) return ok(fresh);
    const bad = swept.find((c) => c.error);
    if (bad) return err(502, bad.error);
    const r = armCurate(fsx, n.chatId, cfg, host);
    if (r.error) return err(400, r.error);
    return { __llmPending: true };
  }

  if (path === "/litopys/state" && req.method === "GET") {
    const chatId = (req.query && req.query.chatId) || null;
    const store = loadStore(fsx);
    const pending = loadProposals(fsx).items.filter((p) => p.status === "pending").length;
    if (chatId) {
      const cst = store.chats[chatId] || null;
      return ok({ chatId, lore: cst, pending });
    }
    const out = Object.entries(store.chats || {}).map(([id, c]) => ({
      chatId: id,
      charName: c.charName,
      facts: (c.worldFacts || []).filter((f) => f.status !== "retired").length,
      retired: (c.worldFacts || []).filter((f) => f.status === "retired").length,
      turnsExtracted: c.turnsExtracted,
      turnsCurated: c.turnsCurated,
    }));
    return ok({ chats: out, pending });
  }

  if (path === "/litopys/proposals" && req.method === "GET") {
    const chatId = (req.query && req.query.chatId) || null;
    const items = loadProposals(fsx).items.filter((p) => !chatId || p.chatId === chatId);
    const pending = items.filter((p) => p.status === "pending").map((p) => enrichProposal(fsx, p));
    const decided = items.filter((p) => p.status !== "pending").slice(-20).map((p) => enrichProposal(fsx, p));
    return ok({ pending, decided });
  }

  if (path === "/litopys/proposals" && req.method === "POST") {
    const b = body();
    if (!b.action || !Array.isArray(b.ids)) return err(400, "action + ids[] required");
    const p = loadProposals(fsx);
    const results = [];
    for (const id of b.ids) {
      const item = p.items.find((x) => x.id === id && x.status === "pending");
      if (!item) {
        results.push({ id, error: "not found or already decided" });
        continue;
      }
      if (b.action === "reject") {
        item.status = "rejected";
        results.push({ id, rejected: true });
        continue;
      }
      if (b.action !== "approve") {
        results.push({ id, error: "unknown action" });
        continue;
      }
      const r = applyProposal(fsx, item.chatId, item, cfg);
      if (r.error) {
        results.push({ id, error: r.error });
      } else {
        item.status = "approved";
        results.push({ id, approved: true });
      }
    }
    saveProposals(fsx, p);
    return ok({ results });
  }

  if (path === "/litopys/facts" && req.method === "POST") {
    const b = body();
    const chatId = b.chatId;
    if (!chatId) return err(400, "chatId required");
    if (!readJson(fsx, "chats/" + chatId + ".meta.json", null)) return err(404, "no such chat");
    const action = b.action;
    const store = loadStore(fsx);
    // a fact written by hand: the chat may have no lore store yet
    if (action === "add") {
      const text = String(b.text || "").trim().slice(0, 250);
      if (!text) return err(400, "text required");
      const cst = store.chats[chatId] || emptyChatStore();
      cst.worldFacts = cst.worldFacts || [];
      if (cst.worldFacts.some((f) => f.status !== "retired" && norm(f.text) === norm(text))) return err(409, "another active fact already has this text");
      const fact = { id: uid(), text, kind: "manual", at: Date.now(), updatedAt: Date.now(), status: "active" };
      cst.worldFacts.push(fact);
      record(cst, "added manually: " + text, cfg);
      store.chats[chatId] = cst;
      saveStore(fsx, store);
      renderMd(fsx, chatId, cst, trackerSnapshot(fsx, chatId));
      return ok({ ok: true, id: fact.id, status: fact.status, text: fact.text });
    }
    const id = String(b.id || b.factId || "").trim();
    if (!id) return err(400, "id required");
    const cst = store.chats[chatId];
    if (!cst) return err(404, "no lore store for chat");
    const hit = (cst.worldFacts || []).find((f) => f.id === id || norm(f.text) === norm(id));
    if (!hit) return err(404, "fact not found (already retired?)");
    if (action === "retire") {
      if (hit.status !== "retired") {
        hit.status = "retired";
        hit.updatedAt = Date.now();
        record(cst, "retired manually: " + hit.text, cfg);
      }
    } else if (action === "update") {
      const text = String(b.text || "").trim().slice(0, 250);
      if (!text) return err(400, "text required");
      if (norm(text) !== norm(hit.text)) {
        const dupe = (cst.worldFacts || []).find(
          (f) => f !== hit && f.status !== "retired" && norm(f.text) === norm(text),
        );
        if (dupe) return err(409, "another active fact already has this text");
        hit.text = text;
        hit.updatedAt = Date.now();
        if (hit.status === "retired") hit.status = "active";
        record(cst, "rewrote manually → " + text, cfg);
      }
    } else if (action === "restore") {
      if (hit.status === "retired") {
        const dupe = (cst.worldFacts || []).find((f) => f !== hit && f.status !== "retired" && norm(f.text) === norm(hit.text));
        if (dupe) return err(409, "another active fact already has this text");
        hit.status = "active";
        hit.updatedAt = Date.now();
        record(cst, "restored manually: " + hit.text, cfg);
      }
    } else {
      return err(400, "action must be add|retire|update|restore");
    }
    store.chats[chatId] = cst;
    saveStore(fsx, store);
    renderMd(fsx, chatId, cst, trackerSnapshot(fsx, chatId));
    return ok({ ok: true, id: hit.id, status: hit.status, text: hit.text });
  }

  // the user's own wording of the story so far; empty clears it
  if (path === "/litopys/story" && req.method === "POST") {
    const b = body();
    const chatId = b.chatId;
    if (!chatId) return err(400, "chatId required");
    if (!readJson(fsx, "chats/" + chatId + ".meta.json", null)) return err(404, "no such chat");
    if (typeof b.text !== "string") return err(400, "text required");
    const store = loadStore(fsx);
    const cst = store.chats[chatId] || emptyChatStore();
    const text = b.text.trim().slice(0, 1500);
    if ((cst.storySoFar || "") !== text) {
      cst.storySoFar = text || null;
      record(cst, text ? "story so far rewritten manually" : "story so far cleared manually", cfg);
      store.chats[chatId] = cst;
      saveStore(fsx, store);
      renderMd(fsx, chatId, cst, trackerSnapshot(fsx, chatId));
    }
    return ok({ ok: true, storySoFar: cst.storySoFar || null });
  }

  if (path === "/litopys/config" && req.method === "GET") return ok(cfg);

  if (path === "/litopys/config" && req.method === "PUT") {
    // the generic panel editor sends { enabled, values: { key → value } };
    // direct callers send a flat body — accept both
    const b0 = body();
    const b = b0.values && typeof b0.values === "object" ? { ...b0, ...b0.values } : b0;
    const next = { ...DEFAULT_CONFIG, ...storedConfig(fsx) };
    if (b.enabled !== undefined) next.enabled = b.enabled !== false;
    if (b.extractEveryNTurns !== undefined) next.extractEveryNTurns = clamp(Math.round(Number(b.extractEveryNTurns) || 2), 1, 20);
    if (b.curateEveryNTurns !== undefined) next.curateEveryNTurns = clamp(Math.round(Number(b.curateEveryNTurns) || 12), 4, 100);
    if (b.model !== undefined) next.model = typeof b.model === "string" ? b.model.trim().slice(0, 160) : "";
    if (b.autoApplySafe !== undefined) next.autoApplySafe = b.autoApplySafe !== false;
    if (b.inject !== undefined) next.inject = b.inject === true || b.inject === "on";
    // a prompt saved as the default (or emptied) goes back to following it
    for (const key of PROMPT_KEYS) {
      if (typeof b[key] !== "string") continue;
      if (isDefaultPrompt(key, b[key])) delete next[key];
      else next[key] = b[key].slice(0, 8000);
    }
    fsx.write(CONFIG_FILE, JSON.stringify(next, null, 2));
    return ok(loadConfig(fsx));
  }

  // "Restore default prompts" in the panel
  if (path === "/litopys/config/prompts" && req.method === "DELETE") {
    const next = { ...DEFAULT_CONFIG, ...storedConfig(fsx) };
    for (const key of PROMPT_KEYS) delete next[key];
    fsx.write(CONFIG_FILE, JSON.stringify(next, null, 2));
    return ok(loadConfig(fsx));
  }

  return null;
}

export function uiPanel(_ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  const cfg = fsx ? loadConfig(fsx) : { ...DEFAULT_CONFIG, ...DEFAULT_PROMPTS };
  const custom = fsx ? customPrompts(fsx) : [];
  const promptHint = (key, what) =>
    what + (custom.includes(key) ? " Changed from the default: Restore default prompts (below) puts it back." : " This is the default; edit it to change what the model is told.");
  let chats = 0;
  let pending = 0;
  if (fsx) {
    chats = Object.keys((loadStore(fsx).chats || {})).length;
    pending = loadProposals(fsx).items.filter((p) => p.status === "pending").length;
  }
  const scribeEvery = clamp(Math.round(Number(cfg.extractEveryNTurns) || 2), 1, 20);
  const curateEvery = clamp(Math.round(Number(cfg.curateEveryNTurns) || 12), 4, 100);
  return {
    label: "Litopys",
    icon: "book",
    hint: "World-lore keeper: scribe extracts facts + chronicle (" + chats + " chats), curator proposes cleanup (" + pending + " pending). Vault: data/vault-chats/.",
    items: [
      {
        id: "config",
        title: "Scribe & Curator",
        subtitle: "scribe every ~" + scribeEvery * 2 + " msgs · curate every ~" + curateEvery * 2 + " msgs · " + (cfg.model ? cfg.model : "chat model"),
        enabled: cfg.enabled !== false,
        saveUrl: "/litopys/config",
        ...(custom.length ? { deleteUrl: "/litopys/config/prompts", deleteLabel: "Restore default prompts" } : {}),
        fields: [
          { key: "extractEveryNTurns", label: "Scribe pass", hint: "New messages before a scribe run (×2 per turn). Lower = fresher lore, more calls.", kind: "number", value: cfg.extractEveryNTurns },
          { key: "curateEveryNTurns", label: "Curator pass", hint: "New messages before a cleanup proposal. Keep high — curation is rare by design.", kind: "number", value: cfg.curateEveryNTurns },
          { key: "inject", label: "Insert into the prompt", hint: "Add the recap and active facts (up to 4000 characters) to every reply. Off by default: the dashboard and Memory already carry the story.", kind: "select", list: ["off", "on"], value: cfg.inject === true ? "on" : "off" },
          { key: "model", label: "Extraction model", hint: "Same model name can live on several endpoints — the picker groups by endpoint. Empty = chat's own model. Cheap + fast is ideal, both passes output strict JSON.", placeholder: "provider/model-id", kind: "model", value: cfg.model || "" },
          { key: "scribePrompt", label: "Scribe prompt", hint: promptHint("scribePrompt", "What the scribe extracts from new messages."), kind: "textarea", rows: 10, advanced: true, value: cfg.scribePrompt },
          { key: "curatePrompt", label: "Curator prompt", hint: promptHint("curatePrompt", "How the curator judges the lore it cleans up."), kind: "textarea", rows: 10, advanced: true, value: cfg.curatePrompt },
        ],
      },
    ],
  };
}

/** Hooks into the chat generation so the model sees the Litopys lore store.
 *  Only fires for reply passes that have a sessionId (chat id). */
export function llmRequest(ctx, host) {
  if (ctx.key !== "reply") return null;
  const sessionId = ctx.request && ctx.request.sessionId;
  if (!sessionId) return null;
  const fsx = host && host.fs;
  if (!fsx) return null;
  if (loadConfig(fsx).inject !== true) return null;
  const store = loadStore(fsx);
  const cst = store.chats[sessionId] || emptyChatStore();
  const story = cst.storySoFar || "";
  const facts = (cst.worldFacts || []).filter((f) => f.status === "active").reverse();
  if (!story && !facts.length) return null;
  const header = "[World memory — established facts]\n";
  let block = header;
  if (story) block += story + "\n";
  for (const f of facts) {
    const line = "- " + f.text + "\n";
    if ((block + line).length > 4000) break;
    block += line;
  }
  if (block === header) return null;
  return { systemPrompt: (ctx.request.systemPrompt || "") + "\n\n" + block };
}
