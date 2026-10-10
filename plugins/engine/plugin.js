/**
 * Studio Engine — the three-pane chat studio backend.
 *
 * Data layout (under the app's data/ dir, git-tracked, agent-editable):
 *   characters/<id>/card.json        personas/<id>.json
 *   presets/<id>.json                regex/<id>.json
 *   groups/<id>.json                 lorebooks/<id>.json
 *   chats/<id>.jsonl + <id>.meta.json
 *   settings.json {model, personaId}
 *
 * Messages are a FLAT list with per-message swipes (classic studio shape):
 *   {id, name, charId, role: "user"|"char", text, at, swipes:[], swipe,
 *    extra?: {model, usage}}
 * Chat meta: {id, title, characterId, groupId, presetId, personaId, model,
 *   authorNote, lorebookIds, createdAt, updatedAt, tainted}
 *
 * Presets keep the import/export shape users already have: prompts[] +
 * prompt_order[] with markers (main, charDescription, chatHistory, ...) and
 * flat sampler fields (temperature, top_p, openai_max_tokens, ...).
 *
 * Routes (/v1/apps/studio/...): characters/personas/presets/regex/groups/
 * lorebooks CRUD · settings · chats (list/create/get/patch/delete) ·
 * chats/:id/{send,swipe,continue,impersonate,next} · messages patch/delete ·
 * prompt/preview · export/backup (zip, stored entries).
 *
 * Two-phase contract: generation routes return {__llmPending:true} WITHOUT
 * writing; the kernel executes host.llm requests and re-invokes with
 * host.llm.results populated; only then are messages committed. Passes are
 * stateless re-reads of the chat files.
 */

// ---------- tiny utils ----------
const uid = (p) => (p || "e") + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "item";
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- dashboard fast mode: the state tag at the end of a story reply ----------
// In fast mode the dashboard asks the story model to end its reply with
// <vertep_state>{json}</vertep_state>. The tag never reaches a saved message:
// it is cut out here (in every mode, a model may keep writing it) and its body
// waits in dashboard/fast/<chatId>.json for the dashboard update (plugins/relations).
const FAST_TAG = "vertep_state";
const FAST_DIR = "dashboard/fast/";
const FAST_BODY_MAX = 16000;
const FAST_MAX_ENTRIES = 20;
const FAST_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The reply text without its state tag: { text, body, closed }. The last
 * <vertep_state> is the report (body = what lies between the tags); without a
 * closing tag the reply was cut off and the tag runs to the end. Earlier tags go
 * too. Text without a tag comes back unchanged with body null.
 */
export function cutStateTag(text) {
  const open = "<" + FAST_TAG + ">";
  const close = "</" + FAST_TAG + ">";
  const whole = String(text == null ? "" : text);
  let rest = whole;
  let body = null;
  let closed = false;
  for (;;) {
    const at = rest.lastIndexOf(open);
    if (at < 0) break;
    const from = at + open.length;
    const end = rest.indexOf(close, from);
    if (body === null) {
      body = end < 0 ? rest.slice(from) : rest.slice(from, end);
      closed = end >= 0;
    }
    rest = rest.slice(0, at) + (end < 0 ? "" : rest.slice(end + close.length));
  }
  return body === null ? { text: whole, body: null, closed: false } : { text: rest.trimEnd(), body, closed };
}

/** The same cut over the text parts of a tool-using or aborted reply; a part that was only the tag goes. */
function cutPartsTag(parts) {
  if (!Array.isArray(parts)) return { parts, body: null, closed: false };
  let body = null;
  let closed = false;
  const out = [];
  for (const p of parts) {
    if (!p || p.type !== "text" || typeof p.text !== "string") { out.push(p); continue; }
    const c = cutStateTag(p.text);
    if (c.body === null) { out.push(p); continue; }
    body = c.body;
    closed = c.closed;
    if (c.text.trim()) out.push({ ...p, text: c.text });
  }
  return { parts: out, body, closed };
}

/** A finished reply with its tag cut from text and parts (reply.parts is replaced): { text, body, closed }. */
function cutReply(reply) {
  const t = cutStateTag(String(reply.text || "").trim());
  if (Array.isArray(reply.parts)) {
    const p = cutPartsTag(reply.parts);
    reply.parts = p.parts;
    // a reply whose text lost the tag but whose parts kept it (or the other way round) still has its body
    if (t.body === null && p.body !== null) return { text: t.text, body: p.body, closed: p.closed };
  }
  return t;
}

/** Keep what a whole reply reported for the dashboard update; only in fast mode; a failure never fails the reply. */
function saveFastState(fsx, chatId, key, cut, model) {
  try {
    if (!cut || typeof cut.body !== "string" || !cut.body.trim()) return;
    let mode = "";
    try { mode = JSON.parse(fsx.read("dashboard/config.json")).mode; } catch {}
    if (mode !== "fast") return;
    const file = FAST_DIR + chatId + ".json";
    let entries = {};
    try {
      const doc = JSON.parse(fsx.read(file));
      if (doc && typeof doc === "object" && doc.entries && typeof doc.entries === "object") entries = doc.entries;
    } catch {}
    const now = Date.now();
    entries[key] = { body: cut.body.slice(0, FAST_BODY_MAX), at: now, model: String(model || ""), closed: cut.closed === true };
    // a day old goes; of the rest the newest 20 stay
    const keep = Object.keys(entries)
      .filter((k) => k === key || now - Number(entries[k] && entries[k].at) <= FAST_TTL_MS)
      .sort((a, b) => Number(entries[b].at) - Number(entries[a].at))
      .slice(0, FAST_MAX_ENTRIES);
    const next = {};
    for (const k of keep) next[k] = entries[k];
    fsx.write(file, JSON.stringify({ v: 1, entries: next }));
  } catch {}
}

/** A reply that was extended no longer matches what it reported: forget the entry of its key (the sensor reads it again). */
function dropFastState(fsx, chatId, key) {
  try {
    const file = FAST_DIR + chatId + ".json";
    const doc = JSON.parse(fsx.read(file));
    if (!doc || typeof doc !== "object" || !doc.entries || !(key in doc.entries)) return;
    delete doc.entries[key];
    if (Object.keys(doc.entries).length) fsx.write(file, JSON.stringify(doc));
    else fsx.remove(file);
  } catch {}
}

// ---------- macros (subset evaluated server-side) ----------
function strHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function rollDice(arg) {
  const a = String(arg).trim();
  let m = /^(\d+)$/.exec(a);
  if (m) return 1 + Math.floor(Math.random() * Number(m[1])); // bare N = 1dN
  m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(a);
  if (!m) return "";
  const n = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  const mod = m[3] ? Number(m[3]) : 0;
  if (n < 1 || n > 100 || sides < 2 || sides > 10000) return "";
  let total = mod;
  for (let i = 0; i < n; i++) total += 1 + Math.floor(Math.random() * sides);
  return String(total);
}
/** "3 minutes" / "2 hours" / "5 days" — coarse humanized span for {{idle_duration}}. */
function humanIdle(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return "just now";
  const mins = Math.floor(s / 60);
  if (mins < 60) return mins + " minute" + (mins === 1 ? "" : "s");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " hour" + (hours === 1 ? "" : "s");
  const days = Math.floor(hours / 24);
  return days + " day" + (days === 1 ? "" : "s");
}
/**
 * Macro expansion. `mc` carries everything the macros can touch:
 *   userName/charName/personaText/chatId — identity
 *   card: {description, personality, scenario} — card-field macros
 *   vars — chat-local variable map ({{setvar}} writes INTO this object;
 *     callers that saveChat afterwards persist the mutations)
 *   lastMessage/lastUserMessage/lastCharMessage/idleText — chat context
 *   summary — the running chat summary
 *   words — summarize-prompt budget ({{words}}/{{limit}})
 */
function expandMacros(text, mc) {
  let out = String(text);
  // macro names are case-insensitive ({{user}}, {{User}}, {{USER}} all resolve)
  const ci = (t, name, val) => t.replace(new RegExp("\\{\\{" + name + "\\}\\}", "gi"), val == null ? "" : String(val));
  const list = (raw) => {
    const sep = raw.indexOf("::") >= 0 ? "::" : ",";
    return raw.split(sep).map((x) => x.replace(/\\,/g, ",").trim()).filter(Boolean);
  };
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  // chat-local variables — setvar/addvar/incvar/decvar mutate mc.vars, getvar reads
  out = out.replace(/\{\{setvar::([^:]+)::([\s\S]*?)\}\}/gi, (_, n, v) => {
    if (mc.vars) mc.vars[n.trim()] = v;
    return "";
  });
  out = out.replace(/\{\{addvar::([^:]+)::([\s\S]*?)\}\}/gi, (_, n, v) => {
    if (mc.vars) { const k = n.trim(); mc.vars[k] = String(num(mc.vars[k]) + num(v)); return String(mc.vars[k]); }
    return "";
  });
  out = out.replace(/\{\{incvar::([^}]+)\}\}/gi, (_, n) => {
    if (mc.vars) { const k = n.trim(); mc.vars[k] = String(num(mc.vars[k]) + 1); return String(mc.vars[k]); }
    return "";
  });
  out = out.replace(/\{\{decvar::([^}]+)\}\}/gi, (_, n) => {
    if (mc.vars) { const k = n.trim(); mc.vars[k] = String(num(mc.vars[k]) - 1); return String(mc.vars[k]); }
    return "";
  });
  out = out.replace(/\{\{getvar::([^}]+)\}\}/gi, (_, n) => {
    const v = mc.vars ? mc.vars[n.trim()] : undefined;
    return v == null ? "" : String(v);
  });
  // random re-rolls on every resolution; pick is stable per chat+content
  out = out.replace(/\{\{random\s?::?([^}]+)\}\}/gi, (_, raw) => {
    const o = list(raw);
    return o.length ? o[Math.floor(Math.random() * o.length)] : "";
  });
  out = out.replace(/\{\{pick\s?::?([^}]+)\}\}/gi, (_, raw) => {
    const o = list(raw);
    return o.length ? o[strHash((mc.chatId || "") + "|" + raw) % o.length] : "";
  });
  out = out.replace(/\{\{roll[ :]+([^}\s]+)\}\}/gi, (_, raw) => rollDice(raw));
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const p2 = (n) => String(n).padStart(2, "0");
  out = ci(out, "time", now.toLocaleTimeString());
  out = ci(out, "isotime", p2(now.getHours()) + ":" + p2(now.getMinutes()));
  out = ci(out, "date", now.toLocaleDateString());
  out = ci(out, "isodate", now.getFullYear() + "-" + p2(now.getMonth() + 1) + "-" + p2(now.getDate()));
  out = ci(out, "weekday", days[now.getDay()]);
  out = ci(out, "persona", mc.personaText || "");
  out = ci(out, "user", mc.userName || "User");
  out = ci(out, "char", mc.charName || "");
  const card = mc.card || {};
  out = ci(out, "description", card.description || "");
  out = ci(out, "personality", card.personality || "");
  out = ci(out, "scenario", card.scenario || "");
  out = ci(out, "lastMessage", mc.lastMessage || "");
  out = ci(out, "lastUserMessage", mc.lastUserMessage || "");
  out = ci(out, "lastCharMessage", mc.lastCharMessage || "");
  out = ci(out, "idle_duration", mc.idleText || "just now");
  // the old Memory summary is gone (Litopys holds the story); presets that still use the macro get nothing
  out = ci(out, "summary", "");
  if (mc.words != null) {
    out = ci(out, "words", String(mc.words));
    out = ci(out, "limit", String(mc.words));
  }
  // {{trim}} eats its surrounding newlines; {{//…}} is a comment; {{newline}} is literal
  out = out.replace(/(?:\r?\n)*\{\{trim\}\}(?:\r?\n)*/gi, "");
  out = out.replace(/\{\{\/\/[^}]*\}\}/gi, "");
  out = ci(out, "newline", "\n");
  return out;
}
/** Shared macro context for a chat's visible transcript (last-message
 *  macros, idle span) — used by assemble() and the swipe/greeting paths. */
function transcriptMacros(msgs, base) {
  const vis = msgs.filter((m) => (m.role === "user" || m.role === "char") && m.hidden !== true);
  const lastUser = [...vis].reverse().find((m) => m.role === "user");
  const lastChar = [...vis].reverse().find((m) => m.role === "char");
  return {
    ...base,
    lastMessage: vis.length ? String(vis[vis.length - 1].text || "") : "",
    lastUserMessage: lastUser ? String(lastUser.text || "") : "",
    lastCharMessage: lastChar ? String(lastChar.text || "") : "",
    idleText: humanIdle(Date.now() - (lastUser ? lastUser.at || Date.now() : Date.now())),
  };
}

// ---------- regex scripts (shared by assembly, world info and the edit route) ----------
/** Escape a literal so it can be embedded in a regex pattern verbatim. */
const escapeRegexLiteral = (v) => String(v ?? "")
  .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");

/** macroMode "escaped" needs the macro VALUES regex-escaped while the
 *  surrounding pattern stays intact — clone the context with its scalar
 *  fields escaped. */
function macroEscapedContext(mc) {
  if (!mc || typeof mc !== "object") return mc;
  const esc = (v) => (typeof v === "string" ? escapeRegexLiteral(v) : v);
  const out = { ...mc };
  for (const k of ["userName", "charName", "personaText", "chatId", "lastMessage", "lastUserMessage", "lastCharMessage", "idleText", "summary"]) out[k] = esc(out[k]);
  if (out.card && typeof out.card === "object") {
    out.card = { ...out.card, description: esc(out.card.description), personality: esc(out.card.personality), scenario: esc(out.card.scenario) };
  }
  return out;
}

/** Script execution order: global first, then preset-bound, then scoped
 *  (character/chat); `order` sequences within a class. */
function regexScopeRank(s) {
  const sc = s.scope || "global";
  if (sc === "global") return 0;
  if (sc === "preset") return 1;
  return 2;
}

function loadRegexScripts(fsx) {
  let scripts = [];
  try {
    scripts = fsx.list("regex").filter((f) => f.endsWith(".json"))
      .map((f) => { try { return JSON.parse(fsx.read("regex/" + f)); } catch { return null; } })
      .filter(Boolean);
  } catch {}
  return scripts.sort((a, b) =>
    regexScopeRank(a) - regexScopeRank(b) ||
    ((a.order ?? 0) - (b.order ?? 0)) ||
    String(a.scriptName ?? "").localeCompare(String(b.scriptName ?? "")));
}

/** One script over one string — the studio replace semantics: {{match}} is
 *  the whole (trimmed) match, $n / $<name> pull captured groups — each
 *  trimmed of the script's trim strings, a missing group vanishes — and
 *  macros substitute in the replacement. The FIND side substitutes macros
 *  per the script's macroMode (none / raw / escaped). */
function applyRegexScript(s, input, mc) {
  let find = String(s.findRegex ?? "");
  if (!find || find.length > 500) return String(input);
  if (s.macroMode === "raw") find = expandMacros(find, mc);
  else if (s.macroMode === "escaped") find = expandMacros(find, macroEscapedContext(mc));
  let re;
  try { re = new RegExp(find, s.flags || "g"); } catch { return String(input); }
  const trims = (Array.isArray(s.trimStrings) ? s.trimStrings : [])
    .map((t) => expandMacros(String(t), mc)).filter(Boolean);
  const trim = (v) => { let out = v; for (const t of trims) out = out.split(t).join(""); return out; };
  const replace = String(s.replaceString ?? "");
  try {
    return String(input).slice(0, 20000).replace(re, (...args) => {
      // (match, p1..pn, offset, string[, named-groups object]) — a $n beyond
      // the capture count would read the offset and leak it; those vanish
      const last = args[args.length - 1];
      const hasNamed = last != null && typeof last === "object";
      const nGroups = hasNamed ? args.length - 4 : args.length - 3;
      const groups = hasNamed ? last : null;
      let out = replace.replace(/\{\{match\}\}/gi, "\u0000");
      out = out.replace(/\$(\d+)|\$<([^>]+)>/g, (_, num, name) => {
        if (num && Number(num) > nGroups) return "";
        const v = num ? args[Number(num)] : (groups ? groups[name] : undefined);
        return v != null && v !== "" ? trim(String(v)) : "";
      });
      out = out.split("\u0000").join(trim(String(args[0] ?? "")));
      return expandMacros(out, mc);
    });
  } catch { return String(input); }
}

const REGEX_WHERE = ["user_input", "ai_output", "slash", "wi", "reasoning"];
/** A script's two axes: WHERE it applies (placement) and WHEN. With neither
 *  "only" flag the text is rewritten as the message is saved; markdownOnly
 *  changes only what is shown; promptOnly only what the model reads; both
 *  together change display and prompt but never the saved text. Scripts saved
 *  before the flags existed listed "display"/"prompt" among their placements;
 *  they read as the flags that reproduce what they used to do. */
function regexAxes(s) {
  const pl = Array.isArray(s.placement) ? s.placement : [];
  const where = pl.filter((p) => REGEX_WHERE.includes(p));
  if (typeof s.markdownOnly === "boolean" || typeof s.promptOnly === "boolean") {
    return { where, markdownOnly: s.markdownOnly === true, promptOnly: s.promptOnly === true };
  }
  if (pl.includes("prompt") && !where.includes("wi")) where.push("wi");
  const roles = where.some((p) => p === "user_input" || p === "ai_output");
  if (!pl.includes("display")) return { where, markdownOnly: false, promptOnly: true };
  if (!roles && !pl.includes("prompt")) return { where: [...where, "user_input", "ai_output"], markdownOnly: true, promptOnly: false };
  return { where, markdownOnly: true, promptOnly: true };
}

/** Scope + placement + stage + depth gate around applyRegexScript.
 *  `placements` is where the text comes from; `stage` is what is happening
 *  to it: "store" (a message is being saved), "edit" (a saved message was
 *  edited: stored scripts that opted in), or "prompt" (the outgoing prompt). */
function runRegexScripts(scripts, meta, members, text, placements, depth, mc, stage) {
  const inScope = (s) => {
    const sc = s.scope || "global";
    if (sc === "global") return true;
    if (!s.scopeTargetId) return false;
    if (sc === "chat") return s.scopeTargetId === meta.id;
    if (sc === "character") return s.scopeTargetId === meta.characterId || members.some((x) => x.id === s.scopeTargetId);
    if (sc === "preset") return s.scopeTargetId === (meta.presetId || "default");
    return true;
  };
  let out = String(text);
  for (const s of scripts) {
    if (!s || s.disabled || !inScope(s)) continue;
    const ax = regexAxes(s);
    if (!placements.some((p) => ax.where.includes(p))) continue;
    if (stage === "prompt" ? !ax.promptOnly : ax.markdownOnly || ax.promptOnly) continue;
    if (stage === "edit" && s.runOnEdit !== true) continue;
    if (depth != null && typeof depth === "number") {
      if (s.minDepth != null && s.minDepth >= 0 && depth < s.minDepth) continue;
      if (s.maxDepth != null && s.maxDepth >= 0 && depth > s.maxDepth) continue;
    }
    out = applyRegexScript(s, out, mc);
  }
  return out;
}

/** Macro context for rewriting text as it is saved: the chat's current
 *  persona and the speaking character. */
function saveMacros(fsx, meta, msgs, speaker) {
  const card = speaker && speaker.card ? speaker.card : null;
  return transcriptMacros(msgs, {
    userName: chatUserName(fsx, meta),
    charName: speaker ? speaker.name : "",
    chatId: meta.id,
    card: card ? {
      description: card.description ? String(card.description) : "",
      personality: card.personality ? String(card.personality) : "",
      scenario: card.scenario ? String(card.scenario) : "",
    } : {},
    vars: meta.chatVars || {},
  });
}

/** A card's greetings (first message, then alternates) as they are saved
 *  into a chat: stored-text regex applies to each. */
function cardGreetings(fsx, meta, charId, card) {
  const who = { id: charId, name: card.name, card };
  return [card.first_mes || "", ...(Array.isArray(card.alternate_greetings) ? card.alternate_greetings : [])]
    .map(String).filter((t) => t.trim())
    .map((t) => regexOnSave(fsx, meta, [who], t, "ai_output", saveMacros(fsx, meta, [], who)));
}

/** Stored-text rewrite for one message about to be saved (user input, a
 *  reply, a greeting, reasoning): the scripts with neither "only" flag. */
function regexOnSave(fsx, meta, members, text, placement, mc) {
  if (!text) return text;
  return runRegexScripts(loadRegexScripts(fsx), meta, members, text, [placement], null, mc, "store");
}

// ---------- data bank (chunked documents, term-scored retrieval) ----------
/** Split text into overlapping chunks, cut at a paragraph, sentence or word
 *  boundary (a passage cut mid-word reads as noise to the model). */
function chunkText(t, size = 1000, overlap = 150) {
  const parts = [];
  let i = 0;
  while (i < t.length) {
    let end = Math.min(t.length, i + size);
    if (end < t.length) {
      const win = t.slice(i, end);
      const cut = Math.max(win.lastIndexOf("\n\n"), win.lastIndexOf("\n"), win.lastIndexOf(". "), win.lastIndexOf("! "), win.lastIndexOf("? "));
      const space = win.lastIndexOf(" ");
      if (cut >= size / 2) end = i + cut + 1;
      else if (space >= size / 2) end = i + space + 1;
    }
    parts.push(t.slice(i, end));
    if (end >= t.length) break;
    // the overlap starts at a word boundary too
    let next = Math.max(i + 1, end - overlap);
    const sp = t.indexOf(" ", next);
    if (sp > 0 && sp < end) next = sp + 1;
    i = next;
  }
  return parts.filter((x) => x.trim()).map((text, n) => ({ i: n, text, terms: dbTerms(text) }));
}

/** A text's words as stems with counts (word forms of one word share a stem). */
function dbTerms(text) {
  const out = {};
  for (const w of wiWords(text)) {
    if (w.length < 3 || MEM_STOP.has(w)) continue;
    const st = stem(w);
    out[st] = (out[st] || 0) + 1;
  }
  return out;
}

function listDatabank(fsx) {
  let names = [];
  try { names = fsx.list("databank"); } catch { return []; }
  return names
    .filter((f) => f.endsWith(".json") && !f.split("/").pop().startsWith("_"))
    .map((f) => { try { return JSON.parse(fsx.read("databank/" + f)); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

// English words that match everything and rank nothing; Ukrainian and
// Russian ones come from MEM_STOP
const DB_STOPWORDS = new Set(("the and for are but not you all any can had her was his that this with have " +
  "from they them then than there here what when where which while who whom will your into upon over under " +
  "again once only very just also been being because both each more most other some such too own same about " +
  "after before between during through above below off out up down further once she him his hers its our ours " +
  "their theirs myself yourself himself herself itself ourselves themselves").split(" "));

/** Is a bank file in this chat's scope? global always; character/chat files
 *  only for their target (a file without a target counts as global). */
function databankInScope(file, scope) {
  if (!scope || !file.scopeTargetId || file.scope === "global" || !file.scope) return true;
  if (file.scope === "chat") return file.scopeTargetId === scope.chatId;
  if (file.scope === "character") return (scope.characterIds || []).includes(file.scopeTargetId);
  return true;
}

/** Top chunks by term density against the query — the retrieval half of the
 *  data bank (used by /databank/search AND by assemble() for injection).
 *  Words are matched by stem, so a word form in the query finds the other
 *  forms in the text. Score is hits per 1000 characters so a long chunk can't
 *  win on size alone; the floor (2.0) keeps glancing hits out. Files written
 *  before stems were stored get them on first use. */
function searchDatabank(fsx, query, limit = 3, scope) {
  const terms = Object.keys(dbTerms(String(query || ""))).slice(0, 48);
  if (!terms.length) return [];
  const scored = [];
  for (const file of listDatabank(fsx)) {
    if (file.enabled === false || !databankInScope(file, scope)) continue;
    let upgraded = false;
    for (const c of file.chunks || []) {
      if (!c.terms || typeof c.terms !== "object") { c.terms = dbTerms(String(c.text || "")); upgraded = true; }
      let hits = 0;
      for (const t of terms) hits += Math.min(50, c.terms[t] || 0);
      if (hits > 0) {
        const score = Math.round((hits * 1000) / Math.max(200, String(c.text || "").length) * 10) / 10;
        if (score >= 2.0) scored.push({ fileId: file.id, fileName: file.name, chunkIndex: c.i, text: c.text, score });
      }
    }
    if (upgraded && file.id) { try { fsx.write("databank/" + file.id + ".json", JSON.stringify(file)); } catch { /* read-only: next time again */ } }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------- translation providers (on the two-phase net bridge) ----------
const LANG_CODES = {
  english: "en", spanish: "es", french: "fr", german: "de", portuguese: "pt",
  italian: "it", polish: "pl", russian: "ru", japanese: "ja", korean: "ko",
  "chinese (simplified)": "zh-CN", "chinese (traditional)": "zh-TW",
  ukrainian: "uk", turkish: "tr", arabic: "ar", hebrew: "he", dutch: "nl",
  czech: "cs", greek: "el", swedish: "sv", indonesian: "id", vietnamese: "vi",
};
// per-request caps for code-based providers (URL/body limits); longer texts
// are chunked and stitched so nothing is silently truncated
const TRANSLATE_CHUNKS = { google: 4000, lingva: 1500, deepl: 4000 };
const TRANSLATE_LLM_CHUNK = 3000;
/** The model translator's instructions: card texts carry macros, script tags and markup that must survive. */
function translateRules(target) {
  return "Translate the user's text into " + target + ". Keep {{ }} macros, < > tags and code exactly as they are, "
    + "keep the markdown, line breaks and blank lines, and leave parts already in " + target + " unchanged. "
    + "Output ONLY the translation, no commentary.";
}
// split on natural boundaries (paragraph, line, sentence, word) so chunks
// translate cleanly and concatenate back to the original
/** Cosine similarity of two equal-length vectors; null on shape mismatch. */
function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]), y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return null;
  return dot / Math.sqrt(na * nb);
}
/** Embedding availability probe, cached: when no connection can embed we
 *  stop paying the extra pass on every send. Re-probes hourly. */
function embedCap(fsx) {
  try {
    const st = JSON.parse(fsx.read("embed-status.json"));
    if (st && st.ok === false && Date.now() - (st.checkedAt || 0) < 3600e3) return false;
    return true;
  } catch { return true; }
}
function setEmbedCap(fsx, ok) {
  try { fsx.write("embed-status.json", JSON.stringify({ ok: ok === true, checkedAt: Date.now() }, null, 2)); } catch {}
}
/** Vectorized world-info entries keep their embeddings in a sidecar cache
 *  keyed book#uid, invalidated by content hash. */
function loadWiVectors(fsx) {
  try {
    const m = JSON.parse(fsx.read("lorebooks/.vectors.json"));
    return m && typeof m === "object" ? m : {};
  } catch { return {}; }
}
function saveWiVectors(fsx, map) {
  try { fsx.write("lorebooks/.vectors.json", JSON.stringify(map, null, 2)); } catch {}
}
function wiVectorKey(book, entry, i) { return (book.id || book.name) + "#" + (entry.uid ?? i); }

/** Semantic prep shared by send/peek: the scan-window embedding text plus
 *  the bound books' vectorized entries that lack a cached vector. Returns
 *  null when neither semantic memories nor vectorized entries need work. */
function semanticEmbedWork(fsx, meta, extraBookIds) {
  const vecMap = loadWiVectors(fsx);
  const needed = [];
  const bound = new Set([...(meta.lorebookIds || []), ...(extraBookIds || [])]);
  let books = [];
  try {
    books = fsx.list("lorebooks").filter((f) => f.endsWith(".json"))
      .map((f) => { try { return JSON.parse(fsx.read("lorebooks/" + f)); } catch { return null; } })
      .filter(Boolean);
  } catch { books = []; }
  for (const book of books) {
    if (!bound.has(book.id || book.name)) continue;
    (book.entries || []).forEach((entry, i) => {
      if (entry.enabled === false) return;
      const isVec = entry.vectorized === true || entry.status === "vectorized";
      if (!isVec) return;
      const key = wiVectorKey(book, entry, i);
      const cached = vecMap[key];
      const hash = strHash(String(entry.content || "") + "|" + String(entry.keys || ""));
      if (cached && cached.hash === hash && Array.isArray(cached.vector)) return;
      const text = String(entry.content || "").trim() + "\n" + (entry.keys || []).join(", ");
      if (text.trim()) needed.push({ key, hash, text });
    });
  }
  if (!needed.length) return null;
  return { needed };
}
/** Store freshly embedded entry vectors into the sidecar cache. */
function cacheWiVectorBatch(fsx, entries, vectors) {
  if (!Array.isArray(entries) || !Array.isArray(vectors)) return;
  const map = loadWiVectors(fsx);
  entries.forEach((e, i) => {
    if (e && vectors[i] && Array.isArray(vectors[i])) map[e.key] = { hash: e.hash, vector: vectors[i] };
  });
  saveWiVectors(fsx, map);
}

/** The embed pass of a reply op. When memory vectors or vectorized entries
 *  exist, the scan window (pending user text + the last 4 messages) is embedded
 *  first: returns { pending } (the caller marks the chat generating and returns
 *  it as the route result) or { scanVec } (null when nothing embedded). The
 *  runtime allows 3 passes: embed, model request, commit. */
function semanticPrep(host, fsx, meta, staged, text, req) {
  if (host.llm.embed && embedCap(fsx)) {
    const scanEmbedText = (text ? text + "\n" : "") + staged.slice(-4).map((m) => m.text || "").join("\n");
    const personaIds = (() => {
      const pid = meta.personaId || (() => { try { return JSON.parse(fsx.read("settings.json")).personaId; } catch { return null; } })();
      let p = null;
      try { p = pid ? JSON.parse(fsx.read("personas/" + pid + ".json")) : null; } catch {}
      return p && Array.isArray(p.lorebookIds) ? p.lorebookIds : [];
    })();
    const work = semanticEmbedWork(fsx, meta, personaIds, scanEmbedText);
    const haveScan = host.llm.embedResults && host.llm.embedResults.scan !== undefined;
    if (work && !haveScan) {
      host.llm.embed("scan", { texts: [scanEmbedText, ...work.needed.map((e) => e.text)] });
      return { pending: pendingOut(meta, { wiEmbed: work.needed }) };
    }
    if (work && haveScan) {
      const res = host.llm.embedResults.scan;
      if (Array.isArray(res)) {
        setEmbedCap(fsx, true);
        if (Array.isArray(req.stash && req.stash.wiEmbed) && req.stash.wiEmbed.length) {
          cacheWiVectorBatch(fsx, req.stash.wiEmbed, res.slice(1));
        }
      } else {
        setEmbedCap(fsx, false);
      }
    }
  }
  const scan = host.llm.embedResults && host.llm.embedResults.scan;
  return { scanVec: Array.isArray(scan) && scan[0] ? scan[0] : null };
}

// ---------- cyrillic-safe text matching (skill: cyrillic-text-matching) ----------
// norm/tokens/stem/sameWord/matches replace the old toLowerCase+includes
// matching: apostrophe variants + ё/NFC folded, stop words dropped,
// inflections matched by stem, short keys by whole token only.
const MEM_APOS = /['’ʼ‘`´ʹ′]/g;
const MEM_STOP = new Set([...DB_STOPWORDS, ...(
  "і й та а але або що це як так не ні ж же би б бо в у на до з із зі за від для по про при під над між через щоб " +
  "коли де там тут вже ще теж також лише тільки дуже його її їх їй йому він вона воно вони ми ви я ти мене тебе себе " +
  "мій моя моє мої твій твоя свій своя цей ця ці той те був була було були є буде бути може треба " +
  "и во что он она оно они с со как то все так его ее но да к вы бы только мне вот от меня еще нет о из ему когда даже " +
  "ну ли если уже или ни быть был него вас ведь потом себя ничего ей тут где есть надо ней мы тебя чем сам без " +
  "чего раз тоже под кто этот того потому этого какой здесь этом мой тем чтобы сейчас"
).split(" ")]);
function norm(s) {
  return String(s).normalize("NFD").replace(/́/g, "").normalize("NFC")
    .toLowerCase().replace(MEM_APOS, "'").replace(/ё/g, "е");
}
function tokens(s) {
  return norm(s).split(/[^\p{L}\p{N}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t && !MEM_STOP.has(t));
}
const MEM_SUFFIX = /(ами|ями|ові|еві|ого|ому|ими|ему|ій|ої|ою|ею|ях|ах|ів|ям|ам|ом|ем|им|их|ий|ый|ая|яя|ое|ее|ую|юю|ов|ев|ей|ы|и|і|а|я|у|ю|о|е|ь|й)$/;
function stem(t) {
  if (t.length <= 3) return t;
  const s = t.replace(MEM_SUFFIX, "");
  return s.length >= 3 ? s : t;
}
/** Two tokens are the same word: short ones exactly, longer ones by stem. */
function sameWord(a, b) {
  if (a.length <= 3 || b.length <= 3) return a === b;
  const x = stem(a), y = stem(b);
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 4 && l.startsWith(s) && l.length - s.length <= 2;
}
/** Every word of the key appears in the text, in any order. */
function matches(key, text) {
  const k = tokens(key), t = tokens(text);
  return k.length > 0 && k.every((kw) => t.some((tw) => sameWord(kw, tw)));
}
// ---------- image prompts (the chat model describes what to draw) ----------
const IMAGE_PROMPT_MODES = {
  scene: "Describe the scene as it stands at the end of this chat: the place, who is there and what they look like, what they are doing, the lighting and the mood.",
  character: "Describe {{char}} as they look right now: build, face, hair, eyes, skin, clothing, accessories, pose and expression, full body.",
  face: "Describe a close-up portrait of {{char}} as they look right now: face, expression, eyes, hair, and what is visible of their clothing. Nothing below the shoulders.",
  user: "Describe {{user}} as {{char}} sees them right now: build, face, hair, clothing, pose and expression, full body.",
  background: "Describe only the place where this scene happens: location, time of day, weather, lighting, notable objects. No people.",
};
const IMAGE_PROMPT_RULES = [
  "This description goes straight to an image generator. Write one paragraph of plain visual description, present tense, under 120 words.",
  "Describe people by what they look like; the image generator does not know anyone's name.",
  "Leave out dialogue, thoughts, sounds, smells, and anything a camera could not see. Do not continue the story.",
  "Write the image prompt in English, whatever language the story is in.",
  "Reply with only the description.",
].join(" ");

/** The newest turns as "Name: text" lines (the image prompt reads them). */
function recentTranscript(msgs, window) {
  return msgs.slice(-window)
    .filter((m) => (m.role === "user" || m.role === "char") && m.hidden !== true)
    .map((m) => (m.role === "user" ? "User" : (m.name || "Character")) + ": " + String(m.text || "").slice(0, 2000))
    .join("\n");
}

function chunkForTranslate(text, limit) {
  if (text.length <= limit) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    const win = rest.slice(0, limit);
    // the best boundary in the second half: a paragraph, else a line, else a
    // sentence, else a word (the latest of any kind cut mid-sentence)
    const half = Math.floor(limit / 2);
    let cut = -1;
    // (a sentence keeps its full stop: the cut falls after it)
    const sentence = Math.max(win.lastIndexOf(". "), win.lastIndexOf("! "), win.lastIndexOf("? "));
    for (const at of [win.lastIndexOf("\n\n"), win.lastIndexOf("\n"), sentence >= 0 ? sentence + 1 : -1, win.lastIndexOf(" ")]) {
      if (at >= half) { cut = at; break; }
    }
    if (cut < half) cut = limit; // no boundary worth keeping — hard cut
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

// ---------- world info (key activation, clean-room semantics) ----------
const WI_LOGIC = { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 };
function keyMatch(scan, key, entry, rawScan) {
  const k = String(key || "").trim();
  if (!k) return false;
  // case-sensitive books/entries match against the RAW text (the shared scan
  // text is pre-lowercased for the case-blind default)
  if (rawScan != null && entry && wiCaseSensitive(entry)) {
    if (k.length > 2 && k.charCodeAt(0) === 47) return false; // regex keys stay case-blind
    return rawScan.includes(k);
  }
  // regex keys: "/pattern/flags" strings (community books) or a per-entry
  // flag marking every key as a pattern (books authored in the app). The scan
  // text is lowercased, so patterns default to case-blind.
  if (k.length > 2 && k.charCodeAt(0) === 47) {
    const m = /^\/(.*)\/([a-z]*)$/s.exec(k);
    if (m) {
      try { return new RegExp(m[1], m[2].includes("i") ? m[2] : m[2] + "i").test(scan); } catch { /* bad pattern: fall through */ }
    }
  } else if (entry && entry.keysRegex === true) {
    try { return new RegExp(k, "i").test(scan); } catch { /* bad pattern: fall through */ }
  }
  const whole = entry ? (entry.wholeWordsOverride === true ? true : entry.wholeWordsOverride === false ? false : entry.matchWholeWords !== false) : true;
  const lk = k.toLowerCase();
  // Cyrillic keys match any form of their words ("вежа" hits "вежі", "вежу"),
  // as a phrase: the key's words side by side, in order
  if (WI_CYR.test(k) && !(entry && entry.wordForms === false)) {
    if (phraseMatch(wordIndex(scan), lk)) return true;
    return !whole && scan.indexOf(lk) >= 0;
  }
  if (whole && WI_KEY_WORDS.test(k)) {
    try {
      const pat = lk.split(MEM_APOS).map(esc).join(WI_APOS_CLASS);
      return new RegExp("(^|[^\\p{L}\\p{N}])" + pat + "([^\\p{L}\\p{N}]|$)", "u").test(scan);
    } catch {
      return scan.indexOf(lk) >= 0;
    }
  }
  return scan.indexOf(lk) >= 0;
}
/** Case sensitivity of an entry: its own override wins over the (book's) flag. */
function wiCaseSensitive(entry) {
  return typeof entry.caseSensitiveOverride === "boolean" ? entry.caseSensitiveOverride : entry.caseSensitive === true;
}
const WI_CYR = /\p{Script=Cyrillic}/u;
// letters of any script, digits, spaces, apostrophes, hyphens: a key that can take word boundaries
const WI_KEY_WORDS = /^[\p{L}\p{M}\p{N}\s'’ʼ‘`´ʹ′-]+$/u;
const WI_APOS_CLASS = "['’ʼ‘`´ʹ′]";
// word indexes of scan texts, alive for one activateWorldInfo call (the same
// window is matched against every key of every entry)
let wiIndexCache = null;
function wiWords(s) {
  return norm(s).split(/[^\p{L}\p{N}']+/u).map((t) => t.replace(/^'+|'+$/g, "")).filter(Boolean);
}
function wordIndex(text) {
  const hit = wiIndexCache && wiIndexCache.get(text);
  if (hit) return hit;
  const toks = wiWords(text);
  const exact = new Map(), byStem = new Map(), byPrefix = new Map();
  const add = (m, k, i) => { const a = m.get(k); if (a) a.push(i); else m.set(k, [i]); };
  toks.forEach((t, i) => {
    add(exact, t, i);
    if (t.length <= 3) return; // short words only ever match exactly (sameWord)
    const s = stem(t);
    add(byStem, s, i);
    if (s.length >= 4) add(byPrefix, s.slice(0, 4), i);
  });
  const idx = { toks, exact, byStem, byPrefix };
  if (wiIndexCache) wiIndexCache.set(text, idx);
  return idx;
}
/** Positions of the scan words that are the same word as `w` (sameWord, through the index). */
function wordPositions(idx, w) {
  if (w.length <= 3) return new Set(idx.exact.get(w) || []);
  const x = stem(w);
  const out = new Set(idx.byStem.get(x) || []);
  if (x.length >= 4) for (const i of idx.byPrefix.get(x.slice(0, 4)) || []) if (sameWord(w, idx.toks[i])) out.add(i);
  return out;
}
/** Every word of the key, in order and side by side, each in any of its forms. */
function phraseMatch(idx, key) {
  const kw = wiWords(key);
  if (!kw.length) return false;
  const sets = kw.map((w) => wordPositions(idx, w));
  for (const p of sets[0]) {
    let j = 1;
    while (j < sets.length && sets[j].has(p + j)) j++;
    if (j === sets.length) return true;
  }
  return false;
}
/** Constant-ness: the `status` field is the source of truth; the `constant`
 *  boolean is a legacy mirror kept for old files. When both are present they
 *  must agree — reading status first keeps injection and the UI in lockstep
 *  even for hand-edited files. */
function isConstantEntry(entry) {
  return entry.status != null ? entry.status === "constant" : entry.constant === true;
}
/** Keys of one entry against a scan text: `key` = the primary key that hit,
 *  `secondary` = the secondary keys that hit; `fail: "secondary"` when the
 *  primary hit but the selective logic did not hold. Probability is the
 *  caller's (rolled once per activation). */
function wiEntryMatch(entry, scanText, rawText, countAll) {
  const keys = entry.keys || [];
  const secondary = entry.secondaryKeys || [];
  const logic = WI_LOGIC[entry.selectiveLogic] != null ? WI_LOGIC[entry.selectiveLogic] : 0;
  const caseBlind = !(entry && wiCaseSensitive(entry));
  const raw = caseBlind ? null : rawText;
  const key = keys.find((k) => keyMatch(scanText, k, entry, raw));
  if (key == null) return null;
  const hits = secondary.filter((k) => keyMatch(scanText, k, entry, raw));
  // group scoring ranks members by how many of their keys hit
  const score = countAll ? keys.filter((k) => keyMatch(scanText, k, entry, raw)).length + hits.length : 0;
  if (secondary.length) {
    const n = hits.length;
    const bad = (logic === 0 && n < 1) || (logic === 3 && n < secondary.length) || (logic === 2 && n > 0) || (logic === 1 && n === secondary.length);
    if (bad) return { key: String(key), secondary: hits.map(String), fail: "secondary" };
  }
  return { key: String(key), secondary: hits.map(String), score };
}
/** One winner per inclusion group among this pass's newly fired entries:
 *  a sticky-active member outranks everything; with group scoring only the
 *  members whose keys hit most stay in; then an override flag, then a
 *  weighted roll by groupWeight (default 100). Losers land in `lost` (with
 *  the group and the winner) when the caller passes it. */
function wiFilterInclusionGroups(list, stickyActive, lost) {
  const groups = new Map();
  for (const item of list) {
    const names = typeof item.entry.group === "string" ? item.entry.group.split(/,\s*/).map((x) => x.trim()).filter(Boolean) : [];
    for (const name of names) {
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    }
  }
  for (const [name, members] of groups) {
    if (members.length <= 1) continue;
    const stickyMember = members.find((m) => stickyActive(m.id));
    let winner;
    if (stickyMember) winner = stickyMember;
    else {
      let pool = members;
      if (members.some((m) => m.groupScoring)) {
        const best = Math.max(...members.map((m) => m.score || 0));
        pool = members.filter((m) => (m.score || 0) === best);
      }
      const prios = pool.filter((m) => m.entry.groupOverride === true || m.entry.groupPrioritize === true)
        .sort((a, b) => ((a.entry.order ?? 100) - (b.entry.order ?? 100)));
      if (prios.length) winner = prios[0];
      else {
        const weight = (m) => (typeof m.entry.groupWeight === "number" && m.entry.groupWeight > 0 ? m.entry.groupWeight : 100);
        let roll = Math.random() * pool.reduce((acc, m) => acc + weight(m), 0);
        winner = pool[pool.length - 1];
        for (const m of pool) { roll -= weight(m); if (roll <= 0) { winner = m; break; } }
      }
    }
    for (const m of members) if (m !== winner) {
      const idx = list.indexOf(m);
      if (idx >= 0) list.splice(idx, 1);
      if (lost && !lost.some((x) => x.item === m)) lost.push({ item: m, group: name, winner });
    }
    if (list.includes(winner)) winner.group = winner.group || name;
  }
  return list;
}
/**
 * The model's own limits, sent by the client (0.9.2): its context window (the engine's number, the
 * user's override first) and its max output from the model's Chat block. They replace the preset's
 * openai_max_context / openai_max_tokens for budgeting, so the context lives in one place.
 */
export function limitsOf(b) {
  const pos = (v) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 100000000 ? v : 0);
  return { contextWindow: pos(b && b.contextWindow), maxOutput: pos(b && b.maxOutput) };
}

/** A copy of the preset with the model's limits in place of its own (the preset file is not touched). */
export function withModelLimits(preset, limits) {
  if (!preset || !limits || (!limits.contextWindow && !limits.maxOutput)) return preset;
  return {
    ...preset,
    ...(limits.contextWindow ? { openai_max_context: limits.contextWindow } : {}),
    ...(limits.maxOutput ? { openai_max_tokens: limits.maxOutput } : {}),
  };
}

/** Context window (tokens) the preset asks for — the preset's openai_max_context. */
function presetMaxCtx(preset) {
  return (preset && typeof preset.openai_max_context === "number" && preset.openai_max_context > 0)
    ? preset.openai_max_context : 16384;
}
/** Token estimate by script (the engine's estimateTextTokens): ASCII ~3.5 chars
 *  a token, other letters (Cyrillic, Greek...) ~2, CJK and the rest 1. chars/4
 *  undercounts non-English text by half. */
function estimateTokens(text) {
  const s = String(text == null ? "" : text);
  let ascii = 0, alpha = 0, other = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) ascii++;
    else if (c < 0x2e80) alpha++;
    else other++;
  }
  return Math.ceil(ascii / 3.5 + alpha / 2 + other);
}
/** Tokens the sibling plugins' hooks may add to the request after assembly
 *  (their inserts are not in the trimmed prompt, so they get a reserve): the
 *  dashboard's notes and focus lines, Litopys's lore block. A config that is
 *  missing or unreadable counts as that plugin's default. */
function hookInsertReserve(fsx, chatId) {
  let reserve = 0;
  let dash = {};
  try {
    const c = JSON.parse(fsx.read("dashboard/config.json"));
    if (c && typeof c === "object" && c.injection && typeof c.injection === "object") dash = c.injection;
  } catch {}
  if (dash.enabled !== false) {
    const n = Number(dash.maxTokens);
    const max = Number.isFinite(n) ? Math.min(2000, Math.max(50, Math.round(n))) : 300;
    reserve += max * 2 + 200;
  }
  let lit = {};
  try {
    const c = JSON.parse(fsx.read("litopys/config.json"));
    if (c && typeof c === "object") lit = c;
  } catch {}
  if (lit.enabled !== false && lit.insert !== false) {
    const b = Number(lit.budget);
    reserve += (Number.isFinite(b) ? Math.min(4000, Math.max(200, Math.round(b))) : 800) + 100;
    // 0.9.2: a chat that continues an earlier one also gets its backstory block (litopys linkBudget)
    let linked = false;
    try {
      const l = JSON.parse(fsx.read("litopys/links.json"));
      linked = !!(chatId && l && l.links && l.links[chatId]);
    } catch {}
    if (linked) {
      const lb = Number(lit.linkBudget);
      const max = Number.isFinite(lb) ? Math.min(3000, Math.max(0, Math.round(lb))) : 800;
      if (max > 0) reserve += max + 100;
    }
  }
  return reserve;
}
// ---------- the Litopys cut: a copy of litopys/plugin.js coveredCount/cutCount (plugins cannot import each other) ----------
/** The messages Litopys counts: user and character turns with an id, not hidden (its activeLine). */
function litopysLine(msgs) {
  return msgs.filter((m) => (m.role === "user" || m.role === "char") && m.id !== undefined && m.id !== null && m.id !== "" && m.hidden !== true);
}
function litRangeOf(ch, line) {
  const at = (id) => line.findIndex((m) => m.id === id);
  const fromIdx = ch && ch.from ? at(ch.from) : -1;
  if (fromIdx < 0) return { fromIdx: -1, toIdx: -1, orphan: true, partial: false };
  const toAt = at(ch.to);
  if (toAt >= fromIdx) return { fromIdx, toIdx: toAt, orphan: false, partial: false };
  return { fromIdx, toIdx: Math.min(line.length - 1, fromIdx + Math.max(1, Number(ch.count) || 1) - 1), orphan: false, partial: true };
}
function litCoveredCount(st, line) {
  if (!st || !Array.isArray(st.chapters) || !Array.isArray(line) || !line.length) return 0;
  const ranges = st.chapters
    .filter((ch) => ch && typeof ch === "object" && ch.stale !== true)
    .map((ch) => litRangeOf(ch, line))
    .filter((r) => !r.orphan && !r.partial)
    .sort((a, b) => a.fromIdx - b.fromIdx);
  let covered = 0;
  for (const r of ranges) {
    if (r.fromIdx > covered) break;
    if (r.toIdx + 1 > covered) covered = r.toIdx + 1;
  }
  return Math.min(covered, line.length);
}
/** How many of the line's first messages Litopys holds as chapters and the prompt may drop; 0 when Litopys is off. */
function litopysCut(fsx, chatId, line) {
  let cfg = {};
  try { const c = JSON.parse(fsx.read("litopys/config.json")); if (c && typeof c === "object") cfg = c; } catch {}
  if (cfg.enabled === false || cfg.insert === false) return 0;
  let st = null;
  try { st = JSON.parse(fsx.read("litopys/chats/" + chatId + ".json")); } catch {}
  if (!st) return 0;
  const n = Number(cfg.recentMessages);
  const recent = Number.isFinite(n) ? Math.min(200, Math.max(6, Math.round(n))) : 20;
  return Math.max(0, Math.min(litCoveredCount(st, line), line.length - recent));
}
/** Whether Litopys holds this chat (then the old Memory keys of its meta can go). */
function litopysHolds(fsx, chatId) {
  try { const st = JSON.parse(fsx.read("litopys/chats/" + chatId + ".json")); return !!(st && st.migrated === true); } catch { return false; }
}

/** World info budget: 25% of
 *  the USABLE context (context minus the reserved response length), chars/4
 *  estimate. Entries claim it in order-DESCENDING priority; entries that
 *  don't fit are dropped whole, never truncated. */
function wiBudgetChars(preset) {
  const ctx = presetMaxCtx(preset);
  const reserve = preset && typeof preset.openai_max_tokens === "number" && preset.openai_max_tokens > 0 ? preset.openai_max_tokens : 0;
  const usable = Math.max(1, ctx - reserve);
  return Math.max(4, Math.round(usable * 0.25) * 4);
}
function activateWorldInfo(fsx, meta, dialogue, extraBookIds, budgetChars, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const dryRun = options.dryRun === true;
  // vectorized entries: similarity activation against the scan embedding
  const scanVec = Array.isArray(options.scanVec) ? options.scanVec : null;
  const wiVecMap = scanVec ? loadWiVectors(fsx) : null;
  const cfg = options.config && typeof options.config === "object" ? options.config : {};
  let budget = budgetChars && budgetChars > 0 ? budgetChars : 8192;
  let books = [];
  if (Array.isArray(options.books)) {
    // the keyword test hands its books in (an unsaved edit included): no scope filter
    books = options.books.filter((b) => b && typeof b === "object");
  } else {
    try {
      books = fsx.list("lorebooks").filter((f) => f.endsWith(".json"))
        .map((f) => { try { return JSON.parse(fsx.read("lorebooks/" + f)); } catch { return null; } })
        .filter(Boolean);
    } catch {
      return { before: [], after: [], depth: [], emBefore: [], emAfter: [], anTop: [], anBottom: [], trace: [], skipped: [], blocked: [], used: 0, budgetChars: budget, scanDepth: 0 };
    }
    // A book scans only when it is in THIS chat's scope — bound
    // to the chat, embedded in / linked to the character, or global (the app
    // resolves all three into meta.lorebookIds before each send). An empty
    // scope means NO world info, never "scan the whole library".
    const bound = new Set([...(meta.lorebookIds || []), ...(extraBookIds || [])]);
    books = books.filter((b) => bound.has(b.id || b.name));
  }
  // budget knobs live on the books: contextPercent rescales the caller's
  // budget (which is the 25% figure), budgetCap is an absolute ceiling —
  // bound books asking for more win, the cap always clamps
  for (const b of books) {
    const st = b.settings && typeof b.settings === "object" ? b.settings : {};
    if (typeof st.contextPercent === "number" && st.contextPercent > 0 && st.contextPercent <= 100) {
      budget = Math.max(budget, Math.round(budget * (st.contextPercent / 25)));
    }
    if (typeof st.budgetCap === "number" && st.budgetCap > 0) budget = Math.min(budget, st.budgetCap);
  }
  // effective scan settings: bound books merge (a book wanting a deeper window
  // gets it), the preset's worldInfo block wins when it sets a value
  const bookCfg = { scanDepth: 0, recursive: null, maxRecursion: 0, minActivations: 0, minActivationsDepthMax: 0 };
  for (const b of books) {
    const st = b.settings && typeof b.settings === "object" ? b.settings : {};
    if (typeof st.scanDepth === "number" && st.scanDepth > bookCfg.scanDepth) bookCfg.scanDepth = Math.floor(st.scanDepth);
    if (typeof st.minActivations === "number" && st.minActivations > bookCfg.minActivations) bookCfg.minActivations = Math.floor(st.minActivations);
    if (typeof st.minActivationsDepthMax === "number" && st.minActivationsDepthMax > bookCfg.minActivationsDepthMax) bookCfg.minActivationsDepthMax = Math.floor(st.minActivationsDepthMax);
    if (st.recursiveScan === true) bookCfg.recursive = true;
    if (st.recursiveScan === false && bookCfg.recursive === null) bookCfg.recursive = false;
    if (typeof st.maxRecursion === "number" && st.maxRecursion > bookCfg.maxRecursion) bookCfg.maxRecursion = Math.floor(st.maxRecursion);
    if (st.includeNames === true) bookCfg.includeNames = true;
    if (!bookCfg.strategy && typeof st.insertionStrategy === "string") bookCfg.strategy = st.insertionStrategy;
  }
  const scanDepth = typeof cfg.scanDepth === "number" && cfg.scanDepth > 0 ? Math.floor(cfg.scanDepth)
    : bookCfg.scanDepth > 0 ? bookCfg.scanDepth : 4;
  const recursionOn = cfg.recursion != null ? cfg.recursion !== false : bookCfg.recursive !== false;
  const maxPasses = typeof cfg.recursionDepth === "number" && cfg.recursionDepth > 0 ? Math.floor(cfg.recursionDepth)
    : bookCfg.maxRecursion > 0 ? bookCfg.maxRecursion : 3;
  // min activations (ST): too few entries fired -> scan deeper into the history
  const minActivations = typeof cfg.minActivations === "number" && cfg.minActivations > 0 ? Math.floor(cfg.minActivations) : bookCfg.minActivations;
  const minDepthMax = typeof cfg.minActivationsDepthMax === "number" && cfg.minActivationsDepthMax > 0 ? Math.floor(cfg.minActivationsDepthMax) : bookCfg.minActivationsDepthMax;
  // include names: the scan sees "Name: text", so a speaker's name can be a key
  const includeNames = typeof cfg.includeNames === "boolean" ? cfg.includeNames : bookCfg.includeNames === true;
  // insertion strategy: whose entries come first (and claim the budget first)
  const strategy = ["evenly", "character_first", "global_first"].includes(cfg.insertionStrategy) ? cfg.insertionStrategy
    : ["character_first", "global_first"].includes(bookCfg.strategy) ? bookCfg.strategy : "evenly";
  const charBooks = new Set(Array.isArray(options.characterBookIds) ? options.characterBookIds : []);
  // filters: who speaks (id, name, card tags) and the generation type; absent = not filtered
  const speaker = options.speaker && typeof options.speaker === "object" ? options.speaker : null;
  const speakerKeys = speaker ? new Set([speaker.id, speaker.name].filter(Boolean).map((x) => String(x).toLowerCase())) : null;
  const speakerTags = speaker ? new Set((Array.isArray(speaker.tags) ? speaker.tags : []).map((x) => String(x).toLowerCase())) : null;
  const genTypes = Array.isArray(options.genTypes) && options.genTypes.length ? options.genTypes : null;
  const filterOut = (entry) => {
    const trig = Array.isArray(entry.triggerFilters) ? entry.triggerFilters.filter((x) => typeof x === "string" && x) : [];
    if (trig.length && genTypes && !genTypes.some((g) => trig.includes(g))) return { reason: "trigger", detail: trig.join(", ") };
    const names = Array.isArray(entry.characterFilter) ? entry.characterFilter.filter(Boolean).map((x) => String(x).toLowerCase()) : [];
    const tags = Array.isArray(entry.tagFilter) ? entry.tagFilter.filter(Boolean).map((x) => String(x).toLowerCase()) : [];
    if ((names.length || tags.length) && speakerKeys) {
      const hit = names.some((x) => speakerKeys.has(x)) || tags.some((t) => speakerTags.has(t));
      if (entry.characterFilterExclude === true ? hit : !hit) return { reason: "character", detail: entry.characterFilterExclude === true ? "excluded" : "not listed" };
    }
    return null;
  };

  // flattened, order-sorted entries with stable per-book ids
  const items = [];
  for (const book of books) {
    const entries = (book.entries || []).slice().sort((a, b) => ((a.order ?? 100) - (b.order ?? 100)));
    const bs = book.settings && typeof book.settings === "object" ? book.settings : {};
    entries.forEach((entry, i) => {
      if (entry.enabled === false) return;
      items.push({
        entry, book: book.name || book.id || "", bookSettings: bs, vec: book.vectorized, id: (book.id || book.name) + "#" + (entry.uid ?? i),
        fmt: typeof book.formatTemplate === "string" ? book.formatTemplate : "",
        rank: strategy === "character_first" ? (charBooks.has(book.id) ? 0 : 1) : strategy === "global_first" ? (book.globalActive === true ? 0 : 1) : 0,
        groupScoring: typeof entry.groupScoringOverride === "boolean" ? entry.groupScoringOverride : bs.groupScoring === true,
      });
    });
  }
  const entryById = new Map(items.map((x) => [x.id, x.entry]));

  // timed effects tick in MESSAGES: sticky keeps a fired entry in for N
  // messages, cooldown locks it out for N after its sticky ends, delay holds
  // an entry back until the chat has N messages. State lives on chat meta;
  // dry runs (peek, the status viewer) read it but never consume it.
  const tick = typeof options.tick === "number" ? options.tick : dialogue.length;
  const timed = meta.wiTimed && typeof meta.wiTimed === "object" ? meta.wiTimed : {};
  let nextTimed = null;
  if (!dryRun) {
    nextTimed = {
      sticky: { ...timed.sticky },
      cooldown: { ...timed.cooldown },
    };
    for (const [id, r] of Object.entries(nextTimed.sticky)) {
      if (tick >= r.end) {
        delete nextTimed.sticky[id];
        const e = entryById.get(id);
        if (e && typeof e.cooldown === "number" && e.cooldown > 0) nextTimed.cooldown[id] = { start: tick, end: tick + e.cooldown };
      }
    }
    for (const [id, r] of Object.entries(nextTimed.cooldown)) {
      if (tick >= r.end) delete nextTimed.cooldown[id];
    }
  }
  // expiry + cascade apply to THIS evaluation: a sticky that just ended is
  // already gone, and the cooldown it armed already suppresses
  const live = nextTimed ?? timed;
  const stickyLive = (id) => {
    const r = (live.sticky || {})[id];
    return r && tick < r.end ? r : null;
  };
  const cooldownLive = (id) => {
    const r = (live.cooldown || {})[id];
    return r && tick < r.end ? r : null;
  };

  // activation passes: recursion re-scans with the content of everything that
  // fired appended to the base window, so entries can trigger entries
  const activated = [];
  const seen = new Set();
  // entries that would have fired but did not, with the reason (the "why"
  // viewer and the keyword test); an entry that fires later leaves this map
  const blocked = new Map();
  const rolledOut = new Set(); // lost the probability roll: one roll per activation
  const windowOf = (n) => {
    const raw = dialogue.slice(-n).map((m) => (includeNames && m.name ? m.name + ": " : "") + m.text).join("\n");
    return { raw, low: raw.toLowerCase() };
  };
  // entries with matchSources key off the card fields too: per-entry flags
  // pick which sources (speaker description / personality / scenario, the
  // persona description) join that entry's own scan
  const srcIn = options.sources && typeof options.sources === "object" ? options.sources : {};
  const mkSrc = (t) => (t && String(t).trim() ? { raw: String(t), low: String(t).toLowerCase() } : null);
  const sourceTexts = {
    description: mkSrc(srcIn.description),
    personality: mkSrc(srcIn.personality),
    scenario: mkSrc(srcIn.scenario),
    persona: mkSrc(srcIn.persona),
  };
  // keys of one entry against the current window: book-level case
  // sensitivity, whole words and word forms, the per-entry scan-depth
  // override (a deeper personal window sees messages the book default misses)
  // and its matchSources
  const matchEntry = (item, win, firstPass) => {
    const { entry, bookSettings } = item;
    const eff = { ...entry };
    if (bookSettings.caseSensitive === true) eff.caseSensitive = true;
    if (bookSettings.wholeWords === false) eff.matchWholeWords = eff.wholeWordsOverride == null ? false : eff.wholeWordsOverride;
    eff.wordForms = typeof entry.wordFormsOverride === "boolean" ? entry.wordFormsOverride : bookSettings.wordForms !== false;
    let text = win.low, raw = win.raw;
    const own = typeof entry.scanDepthOverride === "number" && entry.scanDepthOverride > 0 ? Math.floor(entry.scanDepthOverride) : null;
    if (own != null && own !== depthNow && firstPass) {
      const w = windowOf(own);
      text = w.low; raw = w.raw;
    }
    const ms = entry.matchSources && typeof entry.matchSources === "object" ? entry.matchSources : null;
    if (ms) {
      const parts = [], partsRaw = [];
      for (const srcKey of ["description", "personality", "scenario", "persona"]) {
        const s = sourceTexts[srcKey];
        if (ms[srcKey] === true && s) { parts.push(s.low); partsRaw.push(s.raw); }
      }
      if (parts.length) { text = text + "\n" + parts.join("\n"); raw = raw + "\n" + partsRaw.join("\n"); }
    }
    return wiEntryMatch(eff, text, raw, item.groupScoring && !!entry.group);
  };
  const block = (item, reason, extra) => blocked.set(item.id, { item, reason, ...extra });

  let depthNow = scanDepth;
  let passBase = 0; // pass numbers keep counting across min-activations rounds
  wiIndexCache = new Map();
  try {
    for (;;) {
      const base = windowOf(depthNow);
      // a deeper round still sees what earlier rounds pulled in by recursion
      const carried = activated.filter((x) => x.entry.preventFurtherRecursion !== true).map((x) => String(x.entry.content || ""));
      let win = carried.length ? { raw: base.raw + "\n" + carried.join("\n"), low: base.low + "\n" + carried.join("\n").toLowerCase() } : base;
      for (let pass = 0; ; pass++) {
        let newly = [];
        const firstPass = pass === 0;
        for (const item of items) {
          const { entry, id } = item;
          if (seen.has(id) || rolledOut.has(id)) continue;
          const constant = isConstantEntry(entry);
          const filtered = filterOut(entry);
          const st = stickyLive(id);
          // held back: say why only for entries whose keys would hit now
          const wouldHit = () => constant || (() => { const m = matchEntry(item, win, firstPass); return m && !m.fail ? m : null; })();
          if (filtered) {
            if (!blocked.has(id) && wouldHit()) block(item, filtered.reason, { detail: filtered.detail });
            continue;
          }
          if (typeof entry.delay === "number" && entry.delay > 0 && tick < entry.delay) {
            if (!blocked.has(id) && wouldHit()) block(item, "delay", { detail: entry.delay });
            continue;
          }
          const cd = cooldownLive(id);
          if (cd && !st) {
            if (!blocked.has(id) && wouldHit()) block(item, "cooldown", { detail: cd.end });
            continue;
          }
          const delayLevel = typeof entry.delayUntilRecursion === "number" ? entry.delayUntilRecursion
            : entry.delayUntilRecursion === true ? 1 : 0;
          if (delayLevel > pass && !st) {
            if (!blocked.has(id) && wouldHit()) block(item, "recursion_delay", { detail: delayLevel });
            continue;
          }
          if (pass > 0 && entry.nonRecursable === true && !st) {
            if (!blocked.has(id) && wouldHit()) block(item, "non_recursable");
            continue;
          }
          // vectorized entries activate on embedding similarity OR their keys
          let vecScore = null;
          if ((entry.vectorized === true || entry.status === "vectorized") && scanVec && wiVecMap) {
            const rec = wiVecMap[id];
            const c = rec && Array.isArray(rec.vector) ? cosine(rec.vector, scanVec) : null;
            const threshold = item.vec && typeof item.vec.scoreThreshold === "number" ? item.vec.scoreThreshold : 0.35;
            if (c != null && c >= threshold) vecScore = Math.round(c * 100) / 100;
          }
          let why;
          let score = 0;
          if (st) why = { via: "sticky" };
          else if (constant) why = { via: "constant" };
          else if (vecScore != null) why = { via: "vector", score: vecScore };
          else {
            const m = matchEntry(item, win, firstPass);
            if (!m) continue;
            if (m.fail) { block(item, "secondary", { key: m.key, secondary: m.secondary, detail: entry.selectiveLogic || "AND_ANY" }); continue; }
            why = { via: "key", key: m.key, ...(m.secondary.length ? { secondary: m.secondary } : {}) };
            score = m.score || 0;
          }
          // probability: rolled once; dry runs (status, keyword test) never roll and say the chance
          const prob = typeof entry.probability === "number" && entry.probability < 100 ? Math.max(0, entry.probability) : null;
          if (prob != null && !st) {
            if (!dryRun && Math.random() * 100 >= prob) {
              rolledOut.add(id);
              block(item, "probability", { detail: prob });
              continue;
            }
            why.probability = prob;
          }
          seen.add(id);
          blocked.delete(id);
          newly.push({ ...item, score, sticky: !!st, why: { ...why, pass: passBase + pass, depth: depthNow } });
        }
        const lost = [];
        newly = wiFilterInclusionGroups(newly, stickyLive, lost);
        for (const l of lost) block(l.item, "group", { detail: l.group, winner: wiTitle(l.winner.entry) });
        activated.push(...newly);
        if (!recursionOn || pass + 1 >= maxPasses) { passBase += pass + 1; break; }
        const added = newly
          .filter((x) => x.entry.preventFurtherRecursion !== true)
          .map((x) => String(x.entry.content || ""));
        if (!added.length) { passBase += pass + 1; break; }
        win = { raw: win.raw + "\n" + added.join("\n"), low: win.low + "\n" + added.join("\n").toLowerCase() };
      }
      if (!(minActivations > 0) || activated.length >= minActivations) break;
      const limit = Math.min(dialogue.length, minDepthMax > 0 ? minDepthMax : dialogue.length);
      if (depthNow >= limit) break;
      // at most ~50 deeper rounds however long the chat is
      depthNow = Math.min(limit, depthNow + Math.max(1, Math.ceil((limit - scanDepth) / 50)));
    }
  } finally {
    wiIndexCache = null;
  }
  // sticky arms on every real activation
  if (nextTimed) {
    for (const { entry, id } of activated) {
      if (typeof entry.sticky === "number" && entry.sticky > 0 && !nextTimed.sticky[id]) {
        nextTimed.sticky[id] = { start: tick, end: tick + entry.sticky };
      }
    }
    meta.wiTimed = nextTimed;
  }

  // trace/skipped/blocked feed the app's "active entries" viewer — what
  // fired, what the budget cut and what was held back, with the reasons
  const out = {
    before: [], after: [], depth: [], emBefore: [], emAfter: [], anTop: [], anBottom: [],
    trace: [], skipped: [], blocked: [], used: 0, budgetChars: budget, scanDepth: depthNow,
  };
  const textOf = (x) => wiFormat(x.fmt, String(x.entry.content || "").trim());
  // The budget is claimed in order-DESCENDING priority (higher
  // order wins, constants NOT exempt); ignoreBudget entries are always
  // included but their content still consumes budget for later entries
  const byPriority = activated.slice().sort((x, y) => (x.rank - y.rank) || ((y.entry.order ?? 100) - (x.entry.order ?? 100)));
  const admitted = new Set();
  let used = 0;
  for (const x of byPriority) {
    const c = textOf(x);
    if (!c) continue;
    used += c.length;
    if (x.entry.ignoreBudget === true || used <= budget) admitted.add(x);
  }
  out.used = Math.min(used, budget);
  // prompt emission: ascending order (the WI block runs order 1 -> 999, top to
  // bottom), after the insertion strategy's book rank
  const byOrder = activated.slice().sort((x, y) => (x.rank - y.rank) || ((x.entry.order ?? 100) - (y.entry.order ?? 100)));
  for (const x of byOrder) {
    const { entry, book, sticky, why, group } = x;
    const c = textOf(x);
    if (!c) continue;
    const position = WI_POSITIONS[entry.position] ? entry.position : "before_char";
    const rec = {
      book, uid: entry.uid ?? null,
      title: wiTitle(entry),
      chars: c.length, constant: isConstantEntry(entry), position,
      ...(sticky ? { sticky: true } : {}),
      ...why,
      ...(group ? { group } : {}),
    };
    if (!admitted.has(x)) { out.skipped.push({ ...rec, reason: "budget" }); continue; }
    out.trace.push(rec);
    if (position === "at_depth") out.depth.push({ depth: Math.max(0, Math.floor(entry.depth ?? 4)), role: entry.role === "assistant" ? "assistant" : entry.role === "user" ? "user" : "system", content: c });
    else out[WI_POSITIONS[position]].push(c);
  }
  for (const b of blocked.values()) {
    const { item, ...rest } = b;
    out.blocked.push({ book: item.book, uid: item.entry.uid ?? null, title: wiTitle(item.entry), ...rest });
  }
  out.depth.sort((a, b) => a.depth - b.depth);
  return out;
}
function wiTitle(entry) {
  return entry.title || entry.comment || (entry.keys || []).join(", ") || "untitled";
}
// where an entry's position puts it in activateWorldInfo's result
// (before/after_examples are the editor's other names for before/after_em)
const WI_POSITIONS = {
  before_char: "before", after_char: "after", at_depth: "depth",
  before_em: "emBefore", before_examples: "emBefore", after_em: "emAfter", after_examples: "emAfter",
  before_an: "anTop", after_an: "anBottom",
};
/** The book's format template around an entry: {{original}} (or ST's {0}) marks the content. */
function wiFormat(fmt, c) {
  if (!c || typeof fmt !== "string" || !fmt.trim()) return c;
  if (fmt.includes("{{original}}")) return fmt.split("{{original}}").join(c);
  if (fmt.includes("{0}")) return fmt.split("{0}").join(c);
  return fmt + "\n" + c;
}

// ---------- chat file helpers ----------
function loadChat(fsx, id) {
  const meta = (() => { try { return JSON.parse(fsx.read("chats/" + id + ".meta.json")); } catch { return null; } })();
  if (!meta) return null;
  let msgs = [];
  try {
    msgs = fsx.read("chats/" + id + ".jsonl").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch { /* new chat */ }
  return { meta, msgs };
}
// the old Memory's keys; they go once Litopys holds the chat (its sweep took the vault in)
const OLD_MEMORY_KEYS = ["summary", "memoryCutoffMessageId", "compactions", "memoryExtractedAt"];
function saveChat(fsx, id, meta, msgs) {
  meta.updatedAt = Date.now();
  if (OLD_MEMORY_KEYS.some((k) => k in meta) && litopysHolds(fsx, id)) for (const k of OLD_MEMORY_KEYS) delete meta[k];
  fsx.write("chats/" + id + ".jsonl", msgs.map((m) => JSON.stringify(m)).join("\n") + (msgs.length ? "\n" : ""));
  fsx.write("chats/" + id + ".meta.json", JSON.stringify(meta, null, 2) + "\n");
}

// ---------- prompt assembly ----------
// injection depth: a finite number rounds down to a non-negative depth, and
// 0 is a real depth ("after the newest turn"), not a missing value
const injDepth = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
};
const MARKER_ORDER_FALLBACK = ["main", "worldInfoBefore", "charDescription", "charPersonality", "scenario", "personaDescription", "worldInfoAfter", "dialogueExamples", "chatHistory", "postHistory"];

function orderedPrompts(preset) {
  const prompts = Array.isArray(preset && preset.prompts) ? preset.prompts : [];
  const byId = new Map();
  for (const p of prompts) if (p && p.identifier) byId.set(p.identifier, p);
  let order = null;
  if (preset && Array.isArray(preset.prompt_order)) {
    // Only a NON-EMPTY order is authoritative — legacy/corrupt files carry
    // empty entries and must fall through to the prompts list. Files from
    // other UIs pack several layouts into one file; the chat-completion
    // arrangement lives under character id 100001, so prefer it over any
    // other list (100000 is a different layout, not the author's active one).
    const po = preset.prompt_order.find((o) => o && o.character_id === 100001 && Array.isArray(o.order) && o.order.length)
      || preset.prompt_order.find((o) => o && o.character_id === 100000 && Array.isArray(o.order) && o.order.length)
      || preset.prompt_order.find((o) => o && Array.isArray(o.order) && o.order.length);
    if (po) order = po.order;
  }
  if (order) {
    return order.map((o) => ({ p: byId.get(o.identifier), enabled: o.enabled !== false })).filter((x) => x.p);
  }
  if (prompts.length) return prompts.map((p) => ({ p, enabled: p ? p.enabled !== false : false }));
  return MARKER_ORDER_FALLBACK.map((id) => ({ p: { identifier: id, marker: true, role: "system" }, enabled: true }));
}

/** The chat's persona as it is NOW: the chat's own pick, else the user's
 *  default. Its current name is {{user}} for every new turn, so renaming or
 *  editing a persona reaches every chat that uses it; past user messages keep
 *  the name they were sent under. meta.userName only covers a chat whose
 *  persona file is gone. */
function chatPersona(fsx, meta) {
  let pid = meta.personaId || null;
  if (!pid) { try { pid = JSON.parse(fsx.read("settings.json")).personaId || null; } catch {} }
  let persona = null;
  if (pid) { try { persona = JSON.parse(fsx.read("personas/" + pid + ".json")); } catch {} }
  // NEVER call chatUserName from here: it is this function's own accessor, so
  // the fallback has to be the stored name, not another lookup. Reading the
  // persona through it recursed until the sandbox stack gave out, and every
  // chat that could not resolve a persona — no pick, no default in
  // settings.json, or a persona file a restore didn't bring along — failed
  // every generation, peek and title with "maximum call stack size exceeded".
  const userName = (persona && persona.name) || (typeof meta.userName === "string" && meta.userName) || "User";
  return { persona, personaId: persona ? pid : null, userName };
}
const chatUserName = (fsx, meta) => chatPersona(fsx, meta).userName;

/** Per-chat field variants: a conversation can ride an alternate description /
 *  personality / scenario instead of the card's primary text. The choice lives
 *  on the chat meta (fieldVariantSelection = {desc, personality, scenario}),
 *  points at studio.<field>Variants entries, and an absent key means "primary".
 *  Assembly resolves cards through this, so the chat picker actually changes
 *  the prompt and prompt peek shows what a send would really send. */
const VARIANT_FIELDS = [
  ["desc", "description", "descVariants"],
  ["personality", "personality", "personalityVariants"],
  ["scenario", "scenario", "scenarioVariants"],
];
function resolveCardVariants(card, sel) {
  if (!card || !sel || typeof sel !== "object") return card;
  let out = null;
  for (const [key, base, list] of VARIANT_FIELDS) {
    const id = sel[key];
    if (!id) continue;
    const bag = card.studio && Array.isArray(card.studio[list]) ? card.studio[list] : [];
    const v = bag.find((x) => x && x.id === id);
    if (!v || typeof v.content !== "string") continue;
    if (!out) out = { ...card };
    out[base] = v.content;
  }
  return out || card;
}

function chatMembers(fsx, meta) {
  // returns [{id, name, card}] the bots participating in this chat, each card
  // resolved through the chat's own field-variant selection
  const sel = meta.fieldVariantSelection;
  if (meta.groupId) {
    let g = null;
    try { g = JSON.parse(fsx.read("groups/" + meta.groupId + ".json")); } catch {}
    if (!g) return [];
    const out = [];
    for (const mid of g.memberIds || []) {
      try {
        const card = JSON.parse(fsx.read("characters/" + mid + "/card.json"));
        const rcard = resolveCardVariants(card, sel);
        out.push({ id: mid, name: rcard.name, card: rcard });
      } catch { /* member deleted */ }
    }
    return out;
  }
  if (meta.characterId) {
    try {
      const card = JSON.parse(fsx.read("characters/" + meta.characterId + "/card.json"));
      const rcard = resolveCardVariants(card, sel);
      return [{ id: meta.characterId, name: rcard.name, card: rcard }];
    } catch {}
  }
  return [];
}

/**
 * Assemble the generation request body for a WOULD-BE message list.
 * msgs = messages BEFORE the reply being generated (already includes any
 * pending user message the caller staged). speaker = the member replying.
 */
/** Lorebook ids the cards carry (own book + linked ones): "character" books for the insertion strategy. */
function cardBookIds(cards) {
  const out = [];
  for (const c of cards) {
    const st = c && c.studio && typeof c.studio === "object" ? c.studio : null;
    if (!st) continue;
    if (typeof st.embeddedLorebookId === "string") out.push(st.embeddedLorebookId);
    if (Array.isArray(st.linkedLorebookIds)) out.push(...st.linkedLorebookIds.filter((x) => typeof x === "string"));
  }
  return out;
}
/** The preset the user marked as default; the stock file when none is. */
function defaultPresetId(fsx) {
  try {
    for (const f of fsx.list("presets")) {
      if (!f.endsWith(".json")) continue;
      try {
        const cand = JSON.parse(fsx.read("presets/" + f));
        if (cand && cand.studio && cand.studio.isDefault === true) return f.slice(0, -5);
      } catch {}
    }
  } catch {}
  return "default";
}

function assemble(fsx, meta, msgs, speaker, pendingUserText, opts) {
  const members = chatMembers(fsx, meta);
  const speakerCard = (speaker && speaker.card) || (members[0] && members[0].card) || null;
  const isGroup = !!meta.groupId && members.length > 0;
  const { persona, userName } = chatPersona(fsx, meta);
  const charName = speakerCard ? speakerCard.name : "";
  // generation type this assembly runs for — sections can restrict their
  // trigger list to it (send/swipe/continue/impersonate; a swipe on the last
  // message also satisfies "regenerate")
  const GEN_TYPES = {
    send: ["normal"], swipe: ["swipe", "regenerate"], continue: ["continue"],
    impersonate: ["impersonate"], preview: ["normal"], summarize: ["quiet"],
  };
  const genTypes = GEN_TYPES[(opts && opts.gen) || "send"] || GEN_TYPES.send;

  let preset = null;
  const presetId = meta.presetId || "default";
  try { preset = JSON.parse(fsx.read("presets/" + presetId + ".json")); } catch {}
  if (!preset) {
    // dead binding — the pinned preset was deleted (e.g. an import that
    // didn't survive): assemble with the user's DEFAULT preset instead of
    // silently degrading to the bare fallback layout
    try { preset = JSON.parse(fsx.read("presets/" + defaultPresetId(fsx) + ".json")); } catch {}
  }
  // a preset whose samplers override the model keeps its own max output; the window is still the model's
  preset = withModelLimits(preset, opts && opts.limits && preset && preset.samplers_override_model === true ? { ...opts.limits, maxOutput: 0 } : opts && opts.limits);
  // studio bag: the full app preset rides the engine preset file
  const S = preset && preset.studio && typeof preset.studio.samplers === "object" ? preset.studio.samplers : null;
  // world info scans chat text (+ pending user text); lorebooks BOUND to the
  // active persona are always in scope alongside the chat's own books
  const scanMsgs = pendingUserText ? msgs.concat([{ text: pendingUserText }]) : msgs;
  const wiScanBase = scanMsgs.filter((m) => m.role !== "system" && m.hidden !== true);
  // the author's note can feed world-info keys too (its scan flag)
  const anScan = meta.authorNoteObject && meta.authorNoteObject.includeInWIScan === true ? [String(meta.authorNoteObject.text || "")] : [];
  const wi = activateWorldInfo(fsx, meta, anScan.length && anScan[0] ? wiScanBase.concat([{ text: anScan[0] }]) : wiScanBase, persona?.lorebookIds || [], wiBudgetChars(preset),
    // dry runs (peek) read timed effects but never consume them; the speaker
    // card fields + persona text feed entries with matchSources
    {
      dryRun: !!(opts && opts.dryRun), config: preset && preset.studio && preset.studio.worldInfo,
      scanVec: opts && opts.scanVec ? opts.scanVec : null,
      speaker: { id: (speaker && speaker.id) || meta.characterId || null, name: charName, tags: speakerCard && speakerCard.tags },
      genTypes,
      characterBookIds: cardBookIds(members.map((m) => m.card)),
      sources: {
        description: speakerCard ? speakerCard.description : null,
        personality: speakerCard ? speakerCard.personality : null,
        scenario: speakerCard ? speakerCard.scenario : null,
        persona: persona ? persona.description : null,
      },
    });

  const mc = transcriptMacros(msgs, {
    userName,
    charName,
    personaText: persona ? String(persona.description || "") : "",
    chatId: meta.id,
    card: {
      description: speakerCard && speakerCard.description ? String(speakerCard.description) : "",
      personality: speakerCard && speakerCard.personality ? String(speakerCard.personality) : "",
      scenario: speakerCard && speakerCard.scenario ? String(speakerCard.scenario) : "",
    },
    vars: meta.chatVars || (meta.chatVars = {}),
  });

  // marker → text (pre-macro). `main` carries no engine default — the preset's
  // own main-prompt entry is the editable home for that text; the character
  // card's system_prompt (when present) wins over it.
  // generationMode "append": every member's card joins the prompt (labeled),
  // not just the speaker's — muted members stay out unless they're speaking.
  let groupCfg = null;
  if (meta.groupId) { try { groupCfg = JSON.parse(fsx.read("groups/" + meta.groupId + ".json")); } catch {} }
  const rosterMembers = isGroup && groupCfg && groupCfg.generationMode === "append"
    ? members.filter((m) => !((groupCfg.mutedIds || []).includes(m.id)) || (speaker && m.id === speaker.id))
    : [];
  const joined = (pick) => rosterMembers.map((m) => (m.card && pick(m.card) ? "[" + m.card.name + "]\n" + pick(m.card) : null)).filter(Boolean).join("\n\n");
  // regex scripts — shared machinery (scope/placement/depth gates, studio
  // replace semantics); imported patterns are length-capped there so a bad
  // regex costs a hiccup, not a hang
  const scripts = loadRegexScripts(fsx);
  // only prompt-stage scripts run here: stored rewrites are already baked
  // into the saved text, and preset sections are never regexed
  const rx = (text, placement, depth) => runRegexScripts(scripts, meta, members, text, [placement], depth, mc, "prompt");
  const rxWI = (text) => runRegexScripts(scripts, meta, members, text, ["wi"], null, mc, "prompt");

  const sub = (t) => expandMacros(t, mc);
  const subWI = (t) => expandMacros(rxWI(t), mc);

  const markers = {
    main: speakerCard && speakerCard.system_prompt && speakerCard.system_prompt.trim()
      ? speakerCard.system_prompt
      : "",
    nsfw: "",
    enhanceDefinitions: "",
    charDescription: rosterMembers.length ? joined((c) => c.description) : (speakerCard && speakerCard.description ? speakerCard.description : ""),
    charPersonality: rosterMembers.length ? joined((c) => c.personality) : (speakerCard && speakerCard.personality ? speakerCard.personality : ""),
    scenario: speakerCard && speakerCard.scenario ? speakerCard.scenario : "",
    personaDescription: persona && persona.description ? persona.description : "",
    worldInfoBefore: wi.before.length ? wi.before.join("\n") : "",
    worldInfoAfter: wi.after.length ? wi.after.join("\n") : "",
    // <START> separators become the example-chat marker line — a readable
    // block boundary instead of a literal tag the model might echo back
    dialogueExamples: [
      wi.emBefore.length ? rxWI(wi.emBefore.join("\n")) : "",
      (rosterMembers.length ? joined((c) => c.mes_example) : (speakerCard && speakerCard.mes_example ? speakerCard.mes_example : ""))
        .replace(/<START>/gi, "[Example Chat]"),
      wi.emAfter.length ? rxWI(wi.emAfter.join("\n")) : "",
    ].filter((x) => x.trim()).join("\n"),
    chatHistory: "", // history rides the message array
    postHistory: speakerCard && speakerCard.post_history_instructions ? speakerCard.post_history_instructions : "",
  };

  // group instructions (who exists, who replies)
  if (isGroup) {
    const roster = members.map((m) => m.name).join(", ");
    markers.scenario = (markers.scenario ? markers.scenario + "\n\n" : "") +
      "This is a group scene. Participants: " + roster + ". The next reply comes from " + charName + " — write only " + charName + "'s actions and dialogue.";
  }


  // prompt entries → ordered {role, content} parts. The engine builds marker
  // CONTENT (card fields, world info, …) but the preset entry decides the ROLE
  // it is spoken with — every marker except chatHistory (whose turns are
  // inherently user/assistant) carries a switchable system/user/assistant role.
  const normRole = (r) => (r === "user" || r === "assistant" ? r : "system");
  // section groups + conditions ride the studio bag (the full editor preset
  // is stored verbatim); groupId/condition join in by section identifier
  const studioPreset = preset && preset.studio && typeof preset.studio === "object" ? preset.studio : null;
  const bagSections = new Map(
    Array.isArray(studioPreset && studioPreset.sections) ? studioPreset.sections.map((x) => [x && x.id, x]) : [],
  );
  const sectionGroups = new Map(
    Array.isArray(studioPreset && studioPreset.groups) ? studioPreset.groups.filter((g) => g && g.id).map((g) => [g.id, g]) : [],
  );
  // a condition gates its section on a chat variable: "var" (set + non-empty),
  // "var==value", "var!=value" — anything unparseable is ignored (always on)
  const condPasses = (cond) => {
    const c = String(cond || "").trim().replace(/\s*([=!])=\s*/g, "$1=");
    if (!c) return true;
    const vars = meta.chatVars || {};
    let m = /^([\w.-]+)!=(.+)$/.exec(c);
    if (m) return String(vars[m[1]] ?? "") !== m[2].trim();
    m = /^([\w.-]+)==(.+)$/.exec(c);
    if (m) return String(vars[m[1]] ?? "") === m[2].trim();
    if (/^[\w.-]+$/.test(c)) return String(vars[c] ?? "").trim() !== "";
    return true;
  };
  // wrap format per group: xml tags or a markdown heading; "none" groups
  // still merge consecutive members into one block
  const groupWrap = (g) => {
    const name = String(g && g.name || "group").trim();
    const tag = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "group";
    if (g && g.wrapFormat === "xml") return { open: "<" + tag + ">", close: "</" + tag + ">" };
    if (g && g.wrapFormat === "markdown") return { open: "## " + name, close: "" };
    return { open: "", close: "" };
  };
  const before = []; // parts above the chat-history position
  const after = [];  // parts below it (post-history instructions)
  const placed = new Set(); // markers the preset placed this turn
  let sawHistory = false;
  const depthInj = [];
  // rows collect first so CONSECUTIVE same-group sections can merge into one
  // wrapped block; at-depth (absolute) sections never group
  const rows = [];
  for (const { p, enabled } of orderedPrompts(preset)) {
    if (!enabled) continue;
    if (p.marker && p.identifier === "chatHistory") { sawHistory = true; continue; }
    const bagSec = bagSections.get(p.identifier) || null;
    if (!condPasses(bagSec ? bagSec.condition : null)) continue;
    // a section can gate itself to generation types (imported trigger lists;
    // absent/empty = always) — the engine maps its ops onto those types
    const trig = bagSec && Array.isArray(bagSec.injectionTriggers) && bagSec.injectionTriggers.length ? bagSec.injectionTriggers : null;
    if (trig && genTypes && !genTypes.some((g) => trig.includes(g))) continue;
    if (p.marker) placed.add(p.identifier);
    let raw;
    if (p.marker && p.identifier === "main") {
      // main prompt: the character card's system_prompt wins; the preset's own
      // entry text (where the editable default lives) is the fallback. A main
      // entry marked "forbid overrides" keeps the preset's text instead — the
      // card doesn't get to speak over it.
      raw = String(markers.main || "").trim() && !(bagSec && bagSec.forbidOverrides) ? String(markers.main) : String(p.content || "");
    } else if (p.marker && (p.identifier === "worldInfoBefore" || p.identifier === "worldInfoAfter")) {
      // world-info markers: the entries; the preset's own text is a heading over them
      const own = String(p.content || "").trim();
      const entries = markers[p.identifier] || "";
      raw = own && entries ? own + "\n" + entries : entries;
    } else if (p.marker) {
      // other markers: engine-built text, overridable by preset content.
      raw = String(p.content || "").trim() ? String(p.content) : (markers[p.identifier] != null ? String(markers[p.identifier]) : "");
    } else {
      raw = String(p.content || "");
    }
    const isWIMarker = p.marker && (p.identifier === "worldInfoBefore" || p.identifier === "worldInfoAfter");
    const t = isWIMarker ? subWI(raw) : sub(raw);
    if (!t.trim()) continue;
    if (p.injection_position === "absolute" && typeof p.injection_depth === "number") {
      depthInj.push({ depth: Math.max(0, Math.floor(p.injection_depth)), role: normRole(p.role), content: t });
    } else {
      rows.push({ role: normRole(p.role), content: t, groupId: bagSec ? (bagSec.groupId || null) : null, afterHistory: sawHistory });
    }
  }
  // merge consecutive rows of the same group into one wrapped block
  for (let i = 0; i < rows.length; ) {
    const g = rows[i].groupId;
    if (!g) { (rows[i].afterHistory ? after : before).push({ role: rows[i].role, content: rows[i].content }); i++; continue; }
    let j = i;
    while (j < rows.length && rows[j].groupId === g && rows[j].afterHistory === rows[i].afterHistory) j++;
    const def = sectionGroups.get(g);
    const wrap = groupWrap(def);
    const inner = rows.slice(i, j).map((r) => r.content).join("\n");
    const content = [wrap.open, inner, wrap.close].filter(Boolean).join("\n");
    (rows[i].afterHistory ? after : before).push({ role: rows[i].role, content });
    i = j;
  }

  // world info whose marker the preset does not place is not dropped: it joins
  // the end of the system block (the "why" viewer shows it as placed)
  for (const [id, text] of [["worldInfoBefore", markers.worldInfoBefore], ["worldInfoAfter", markers.worldInfoAfter]]) {
    if (!placed.has(id) && text) before.push({ role: "system", content: subWI(text) });
  }
  if (!placed.has("dialogueExamples")) {
    const em = [...wi.emBefore, ...wi.emAfter];
    if (em.length) before.push({ role: "system", content: subWI(em.join("\n")) });
  }

  // data bank: top chunks relevant to the recent text join the system block
  // (term-scored retrieval over enabled files — basic RAG)
  const dbScan = (pendingUserText ? pendingUserText + "\n" : "") + msgs.slice(-4).map((m) => m.text || "").join("\n");
  const extras = [];
  const dbHits = searchDatabank(fsx, dbScan, 3, { chatId: meta.id, characterIds: members.map((m) => m.id) });
  if (dbHits.length) {
    // about 8% of the context (chars ~ tokens x 4), never under ~200 tokens:
    // small windows keep room for the story
    const ctxTokens = presetMaxCtx(preset) || 8192;
    let room = Math.max(800, Math.round(ctxTokens * 4 * 0.08));
    const parts = [];
    for (const h of dbHits) {
      if (room <= 200) break;
      const text = h.text.length > room ? h.text.slice(0, room) + "…" : h.text;
      parts.push("[" + h.fileName + " #" + (h.chunkIndex + 1) + "]\n" + text);
      room -= text.length;
    }
    if (parts.length) extras.push({ role: "system", content: "[Data bank — retrieved reference material]\n" + parts.join("\n---\n") });
  }

  // author's note: the object form carries position/depth/role
  // (before-system / after-system / in-chat @ depth); the legacy string form
  // keeps its historical behavior (in-chat depth 4, user role)
  const an = meta.authorNoteObject && typeof meta.authorNoteObject === "object"
    ? meta.authorNoteObject
    : (meta.authorNote && String(meta.authorNote).trim() ? { text: String(meta.authorNote), position: "in-chat", depth: 4, role: "user" } : null);
  // insertion frequency: every N messages (1 = every generation)
  const anFreq = Math.max(1, Math.floor(Number(an && an.frequency)) || 1);
  const anWI = [wi.anTop.length ? subWI(wi.anTop.join("\n")) : "", wi.anBottom.length ? subWI(wi.anBottom.join("\n")) : ""];
  let anPlaced = false;
  if (an && String(an.text || "").trim() && (msgs.length % anFreq === 0 || an.position !== "in-chat")) {
    anPlaced = true;
    const anContent = "[Author's note]\n" + [anWI[0], String(an.text), anWI[1]].filter((x) => x.trim()).join("\n");
    const anRole = an.role === "user" || an.role === "assistant" ? an.role : "system";
    if (an.position === "before-system") before.unshift({ role: anRole, content: anContent });
    else if (an.position === "in-chat") depthInj.push({ depth: injDepth(an.depth, 4), role: anRole, content: anContent });
    else extras.push({ role: anRole, content: anContent });
  }
  if (!anPlaced && (anWI[0] || anWI[1])) {
    depthInj.push({ depth: injDepth(an && an.depth, 4), role: "system", content: anWI.filter(Boolean).join("\n") });
  }
  for (const w of wi.depth) depthInj.push({ depth: w.depth, role: w.role, content: subWI(w.content) });

  // history → model messages. Names follow the preset's names-behavior:
  // none never, default only where turns must be told apart (groups),
  // content always prefixes "Name: ", completion rides the message `name`
  // field (the OpenAI wire format carries it; endpoints without it ignore).
  // hide-from-AI (ghost) messages are dropped from the prompt entirely —
  const namesBehavior = (() => {
    const v = preset && preset.studio && preset.studio.namesBehavior;
    return ["none", "default", "content", "completion"].includes(v) ? v : "default";
  })();
  const prefixNames = namesBehavior === "content" || namesBehavior === "completion" || (namesBehavior === "default" && isGroup);
  // the oldest messages leave the prompt once Litopys holds them as chapters and they are older
  // than its recent window; its insert (the Litopys plugin's llmRequest hook) carries them
  let histMsgs = msgs;
  const litLine = litopysLine(msgs);
  const litCut = litopysCut(fsx, meta.id, litLine);
  if (litCut > 0) {
    const gone = new Set(litLine.slice(0, litCut).map((m) => m.id));
    histMsgs = msgs.filter((m) => !gone.has(m.id));
  }
  const visibleHist = histMsgs.filter((m) => (m.role === "user" || m.role === "char") && m.hidden !== true);
  const history = visibleHist
    .map((m, i) => {
      const depth = visibleHist.length - 1 - i;
      // a reply's {{char}} is whoever wrote it; a user turn keeps the speaker's
      const body = expandMacros(rx(m.text, m.role === "user" ? "user_input" : "ai_output", depth), m.role === "char" && m.name ? { ...mc, charName: m.name } : mc);
      return {
        role: m.role === "user" ? "user" : "assistant",
        ...(prefixNames && m.name && namesBehavior === "completion" ? { name: m.name } : {}),
        content: prefixNames && m.name ? m.name + ": " + body : body,
      };
    });

  // compact chat history: the visible chat collapses into ONE message of the
  // chosen role, turns labeled by per-role prefixes so speakers stay
  // distinguishable. For endpoints that bill per message or trip over long
  // role alternations. \n escapes in the fields are real newlines.
  const chCfg = preset && preset.studio && typeof preset.studio.compactHistory === "object" ? preset.studio.compactHistory : null;
  const compactOn = !!(chCfg && chCfg.enabled === true && history.length > 0);
  if (compactOn && history.length > 0) {
    const sep = chCfg.separator === "space" ? " " : chCfg.separator === "newline" ? "\n" : "\n\n";
    const unesc = (s) => String(s == null ? "" : s).replace(/\\n/g, "\n");
    const body = history.map((h, i) => {
      const isUser = h.role === "user";
      const ctx = { ...mc, charName: (visibleHist[i] && visibleHist[i].name) || charName };
      const pre = expandMacros(unesc(isUser ? chCfg.userPrefix : chCfg.charPrefix), ctx);
      const suf = expandMacros(unesc(isUser ? chCfg.userSuffix : chCfg.charSuffix), ctx);
      return pre + h.content + suf;
    }).join(sep);
    const role = chCfg.role === "user" || chCfg.role === "system" ? chCfg.role : "assistant";
    history.length = 0;
    history.push({ role, content: body });
  }

  // context trimming: a token estimate against openai_max_context, minus the
  // room the reply needs and what the sibling plugins' hooks add later
  const replyReserve = preset && typeof preset.openai_max_tokens === "number" && preset.openai_max_tokens > 0 ? preset.openai_max_tokens : 1024;
  const budget = presetMaxCtx(preset) - replyReserve - hookInsertReserve(fsx, meta.id) - 64;
  const msgTokens = (m) => estimateTokens(m.content) + 4;
  const fixedTokens = () => before.concat(extras, after).reduce((a, m) => a + msgTokens(m), 0);
  // what fell out is reported: automatic compaction fires on it
  let trimmed = 0;
  let histTokens = history.reduce((a, m) => a + msgTokens(m), 0);
  while (fixedTokens() + histTokens > budget && history.length > 1) { histTokens -= msgTokens(history[0]); history.splice(0, 1); trimmed++; }

  // utility prompts (preset-level, blank = off):
  //  - new-chat marker rides at the very top of a freshly started chat
  //  - group nudge rides at depth 0, naming this turn's speaker
  const util = (preset && preset.utilityPrompts) || {};
  const lead = [...before, ...extras];
  const newChatTxt = String(util.newChat || "").trim();
  // "freshly started" = no generated replies yet (the greeting may exist, and
  // the first user turn is already staged) — a history-length check can never
  // see this, every send has at least greeting + user
  if (newChatTxt && msgs.filter((x) => x.role === "char").length <= 1) lead.push({ role: "system", content: sub(newChatTxt) });
  const groupNudgeTxt = String(util.groupNudge || "").trim();
  if (isGroup && groupNudgeTxt) {
    depthInj.push({ depth: 0, role: "system", content: sub(groupNudgeTxt).replace(/\{\{name\}\}/g, charName) });
  }

  // Depth injections (author's note, world info at a depth, the group nudge,
  // absolute-position sections) live INSIDE the chat history: depth N means
  // "N turns from the newest", depth 0 means "after the last turn". They must
  // not count past the history into the post-history block — an instruction
  // meant to be the last thing the model reads stays last.
  // Within one depth the roles stack system-closest-to-the-reply, so the
  // strongest instruction is the one the model reads most recently.
  const ROLE_RANK = { assistant: 0, user: 1, system: 2 };
  const byDepth = new Map();
  for (const d of depthInj) {
    if (!byDepth.has(d.depth)) byDepth.set(d.depth, []);
    byDepth.get(d.depth).push({ role: d.role, content: d.content });
  }
  for (const dep of Array.from(byDepth.keys()).sort((a, b) => b - a)) {
    const group = byDepth.get(dep);
    // stable sort by role rank: same-role entries keep collection order
    group.forEach((g, i) => { g._i = i; });
    group.sort((a, b) => (ROLE_RANK[a.role] - ROLE_RANK[b.role]) || (a._i - b._i));
    const idx = Math.max(0, history.length - dep);
    history.splice(idx, 0, ...group.map((g) => ({ role: g.role, content: g.content })));
  }

  // history lands at its marker position (end of the prompt when unplaced)
  const messages = sawHistory ? [...lead, ...history, ...after] : [...lead, ...after, ...history];

  // Assistant prefill (the "start reply with" seed): when the LAST entry of the
  // prompt chain is an assistant-role preset section, it is not an injection —
  // it becomes the seed of the reply (sent as a trailing assistant turn, the
  // model continues from it, the committed message starts with it). The
  // samplers' assistantPrefill field does the same when no section claims it.
  let assistantPrefill = "";
  const lastPart = messages[messages.length - 1];
  if (lastPart && lastPart.role === "assistant" && after.length > 0 && after[after.length - 1] === lastPart) {
    assistantPrefill = lastPart.content;
    messages.pop();
  } else if (S && typeof S.assistantPrefill === "string" && S.assistantPrefill.trim()) {
    assistantPrefill = S.assistantPrefill;
  }

  // Compact system messages: consecutive SYSTEM entries (the system prompt,
  // depth-injected notes, world info) merge into one denser block. Chat
  // turns stay separate — merging user/assistant pairs is post-processing's
  // job, not this switch's.
  if (preset && preset.studio && preset.studio.squashSystemMessages) {
    const squashed = [];
    for (const m of messages) {
      const last = squashed[squashed.length - 1];
      if (m.role === "system" && last && last.role === "system") last.content = last.content + "\n" + m.content;
      else squashed.push({ ...m });
    }
    messages.length = 0;
    messages.push(...squashed);
  }

  // Prompt post-processing: a STRUCTURAL transform of the assembled list for
  // endpoints that mishandle repeated roles — merge collapses consecutive
  // same-role entries, semi also forces mid-prompt system entries to user,
  // strict adds a leading user turn after the system block, single folds
  // everything into one user message. No model, no rewrite — structure only.
  const pp = preset && preset.studio && preset.studio.promptPostProcessing;
  if (pp && pp.enabled === true && pp.mode && pp.mode !== "none") {
    let list = messages.slice();
    if (pp.mode === "single") {
      list = [{ role: "user", content: list.map((m) => m.content).filter(Boolean).join("\n\n") }];
    } else {
      const mergePass = (src) => {
        const merged = [];
        for (const m of src) {
          const last = merged[merged.length - 1];
          if (last && last.role === m.role && m.content) last.content = last.content + "\n\n" + m.content;
          else merged.push({ ...m });
        }
        return merged;
      };
      list = mergePass(list);
      if (pp.mode === "semi" || pp.mode === "strict") {
        for (let i = 1; i < list.length; i++) {
          if (list[i].role === "system") list[i] = { ...list[i], role: "user" };
        }
      }
      if (pp.mode === "strict") {
        if (list.length && list[0].role === "system" && (list.length === 1 || list[1].role !== "user")) {
          list.splice(1, 0, { role: "user", content: "Let's get started." });
        } else if (list.length && list[0].role !== "system" && list[0].role !== "user") {
          list.unshift({ role: "user", content: "Let's get started." });
        }
        list = mergePass(list);
      }
    }
    messages.length = 0;
    messages.push(...list);
  }
  // the prefill rides as the FINAL turn — after squash, so it stays separate
  if (assistantPrefill) messages.push({ role: "assistant", content: assistantPrefill });

  // sampler (kernel GenerateRequest.presetParams). The classic numerics ride
  // the top-level preset keys; everything else lives in the studio bag
  // and maps to standard OpenAI body keys (seed/stop/logit_bias) or the
  // llama.cpp/kobold textgen keys (enabled-only — an "off"
  // sampler must not add unknown params to a strict endpoint).
  const params = {};
  for (const [k, alias] of [["top_p", "top_p"], ["top_k", "top_k"], ["min_p", "min_p"], ["repetition_penalty", "rep_pen"], ["frequency_penalty", "frequency_penalty"], ["presence_penalty", "presence_penalty"]]) {
    const v = preset ? preset[k] : undefined;
    const v2 = preset ? preset[alias] : undefined;
    if (typeof v === "number") params[k] = v;
    else if (typeof v2 === "number") params[k] = v2;
  }
  // imported presets carry the wider textgen sampler set; each key rides the
  // body only when the preset sets it (keep in sync with the importer's sweep)
  const extraNum = [
    "top_a", "typical_p", "eta_cutoff", "epsilon_cutoff", "repetition_penalty_range",
    "no_repeat_ngram_size", "penalty_alpha", "guidance_scale", "negative_prompt_scale",
    "smoothing_factor", "smoothing_curve", "dry_multiplier", "dry_base", "dry_allowed_length",
    "dry_last_n", "xtc_probability", "xtc_threshold", "dynatemp_min", "dynatemp_max",
    "dynatemp_exponent", "mirostat_mode", "mirostat_tau", "mirostat_eta", "temperature_last",
  ];
  if (preset) {
    for (const k of extraNum) if (typeof preset[k] === "number") params[k] = preset[k];
    for (const k of ["temperature_last", "skip_special_tokens", "ban_eos_token", "add_bos_token"]) if (typeof preset[k] === "boolean") params[k] = preset[k];
    if (typeof preset.negative_prompt === "string" && preset.negative_prompt.trim()) params.negative_prompt = preset.negative_prompt;
    if (typeof preset.seed === "number" && preset.seed >= 0) params.seed = preset.seed;
  }
  if (S) {
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    if (num(S.seed) != null && S.seed >= 0) params.seed = S.seed;
    if (Array.isArray(S.stopStrings) && S.stopStrings.filter((x) => typeof x === "string" && x).length) {
      // macros expand in stop strings ("\n{{user}}:" → "\nDaisy:")
      params.stop = S.stopStrings.filter(Boolean).map((x) => sub(x));
    }
    if (Array.isArray(S.logitBias) && S.logitBias.length) {
      const lb = {};
      for (const e of S.logitBias) {
        const id = parseInt(e && e.token, 10);
        const b = num(e && e.bias);
        if (Number.isFinite(id) && b != null) lb[String(id)] = b;
      }
      if (Object.keys(lb).length) params.logit_bias = lb;
    }
  }
  // compact history's stop string: halts the model the moment it starts the
  // user's next turn (the default is the user prefix), so a compacted
  // assistant-role history stays the model's own output
  if (compactOn && chCfg && String(chCfg.stopString || "").trim()) {
    const stopTxt = sub(String(chCfg.stopString).replace(/\\n/g, "\n"));
    if (stopTxt && !(params.stop || []).includes(stopTxt)) params.stop = [...(params.stop || []), stopTxt];
  }
  // verbosity rides the raw request body through the sampling passthrough:
  // OpenAI-compatible endpoints forward it (models with the control act on
  // it, e.g. gpt-5-style verbosity), every other adapter ignores unknown
  // keys. Auto sends nothing at all.
  const verb = preset && preset.studio && typeof preset.studio.verbosity === "string"
    && ["low", "medium", "high"].includes(preset.studio.verbosity) ? preset.studio.verbosity : null;
  if (verb) params.verbosity = verb;
  const presetParams = {
    ...(preset && typeof preset.temperature === "number" ? { temperature: preset.temperature } : {}),
    ...(preset && typeof preset.openai_max_tokens === "number" && preset.openai_max_tokens > 0 ? { max_tokens: preset.openai_max_tokens } : {}),
    ...(Object.keys(params).length ? { params } : {}),
  };

  return {
    // role-carrying messages only — system-role entries ride the array in
    // order and the transport hoists them into the provider system prompt
    messages,
    presetParams,
    ...(assistantPrefill ? { assistantPrefill } : {}),
    ...(preset && typeof preset.reasoning === "string" && preset.reasoning !== "off" ? { reasoning: preset.reasoning } : {}),
    ...(preset && preset.reasoningTags && preset.reasoningTags.open && preset.reasoningTags.close ? { reasoningTags: preset.reasoningTags } : {}),
    ...(preset && typeof preset.thinkingBudget === "number" && preset.thinkingBudget > 0 ? { thinkingBudget: preset.thinkingBudget } : {}),
    ...promptFormatOf(preset),
    presetName: preset && preset.name ? preset.name : "default",
    // 0.9.2: by default the model's parameters win in the engine; this preset switch lets its own win
    ...(preset && preset.samplers_override_model === true ? { paramsSource: "request" } : {}),
    trimmed,
  };
}

/** The preset's text completion format, when it overrides the connection:
 *  a format id, "auto", or the custom markers. Chat completion connections
 *  ignore it. */
function promptFormatOf(preset) {
  const pf = preset && preset.studio && preset.studio.promptFormat;
  if (!pf || typeof pf.use !== "string" || pf.use === "connection") return {};
  if (pf.use !== "custom") return { promptFormat: pf.use };
  return pf.custom && typeof pf.custom === "object" ? { promptFormat: pf.custom } : {};
}

/** How readily a member speaks up unprompted, 0..1 (the card's
 *  talkativeness; 0.5 when the card doesn't say). */
function talkativeness(card) {
  const raw = card && ((card.extensions && card.extensions.talkativeness) ?? card.talkativeness);
  const n = Number(raw);
  return raw == null || raw === "" || !Number.isFinite(n) ? 0.5 : Math.min(1, Math.max(0, n));
}
/** Does the text address this member? The whole name, or any word of it
 *  with 3+ letters, matched as a whole word. Returns the first position, or -1. */
function mentionAt(text, name) {
  let at = -1;
  const full = String(name || "").toLowerCase().trim();
  const words = [full, ...full.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)];
  for (const w of words) {
    if (!w) continue;
    const m = new RegExp("(^|[^\\p{L}\\p{N}])" + esc(w) + "(?=$|[^\\p{L}\\p{N}])", "u").exec(text);
    if (m && (at < 0 || m.index < at)) at = m.index;
  }
  return at;
}
/** Who answers this turn in a group, in order. list: every unmuted member;
 *  natural: the members the user named, else one pick weighted by
 *  talkativeness (never the member who just spoke unless the group allows
 *  self responses); manual: nobody. `random` is injectable for peeks and
 *  tests; peeks pass null and get the most likely pick instead of a roll. */
function groupTurnPlan(group, members, lastSpeakerId, userText, random) {
  const muted = new Set(group.mutedIds || []);
  const order = (group.memberIds || []).map((id) => members.find((m) => m.id === id)).filter((m) => m && !muted.has(m.id));
  if (!order.length || group.mode === "manual") return [];
  if (group.mode === "list") return order;
  const fresh = group.allowSelfResponses ? order : order.filter((m) => m.id !== lastSpeakerId);
  const pool = fresh.length ? fresh : order;
  const text = String(userText || "").toLowerCase();
  const named = pool.map((m) => ({ m, at: mentionAt(text, m.name) })).filter((x) => x.at >= 0).sort((x, y) => x.at - y.at);
  if (named.length) return named.map((x) => x.m);
  const weights = pool.map((m) => talkativeness(m.card));
  const total = weights.reduce((a, w) => a + w, 0);
  if (random === null) return [pool[weights.indexOf(Math.max(...weights))]];
  if (total <= 0) return [pool[Math.floor((random || Math.random)() * pool.length)]];
  let roll = (random || Math.random)() * total;
  for (let i = 0; i < pool.length; i++) { roll -= weights[i]; if (roll < 0) return [pool[i]]; }
  return [pool[pool.length - 1]];
}

// ---------- zip writer (STORE method, no compression — text entries) ----------
const CRC_TABLE = (() => {
  const t = Array.from({ length: 256 });
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** UTF-8 bytes of a string, as a Uint8Array.
 *
 *  This used to write latin1 and turn every character above U+00FF into "?".
 *  A backup is prose: curly quotes, em dashes, ellipses, emoji, and any name
 *  that isn't plain ASCII all came out as "?" — and the U+0080..U+00FF range
 *  (é, ñ, ü) came out as bare high bytes, which is not valid UTF-8, so the
 *  file the importer read back wasn't even parseable JSON. Exports were
 *  lossy for anyone whose characters don't write in ASCII. */
function utf8Bytes(s) {
  const str = String(s);
  // one pass to size the buffer, one to fill it — no per-byte array growth
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.codePointAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c < 0x10000) n += 3;
    else { n += 4; i++; }
  }
  const out = new Uint8Array(n);
  let j = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.codePointAt(i);
    if (c < 0x80) out[j++] = c;
    else if (c < 0x800) {
      out[j++] = 0xc0 | (c >> 6);
      out[j++] = 0x80 | (c & 63);
    } else if (c < 0x10000) {
      out[j++] = 0xe0 | (c >> 12);
      out[j++] = 0x80 | ((c >> 6) & 63);
      out[j++] = 0x80 | (c & 63);
    } else {
      out[j++] = 0xf0 | (c >> 18);
      out[j++] = 0x80 | ((c >> 12) & 63);
      out[j++] = 0x80 | ((c >> 6) & 63);
      out[j++] = 0x80 | (c & 63);
      i++; // the low surrogate was consumed by codePointAt
    }
  }
  return out;
}
function bytesToB64(bytes) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  // built in chunks: one += per group of 3 bytes reallocates the whole string
  // on every step, which is what made a large backup crawl
  const parts = [];
  let chunk = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    chunk += chars[b0 >> 2] + chars[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    chunk += b1 === undefined ? "=" : chars[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    chunk += b2 === undefined ? "=" : chars[b2 & 63];
    if (chunk.length >= 8192) { parts.push(chunk); chunk = ""; }
  }
  if (chunk) parts.push(chunk);
  return parts.join("");
}
function buildZip(files) {
  // files: [{name, text}] — STORE method, timestamps zeroed.
  // Byte buffers are typed arrays, not arrays of numbers: a whole backup used
  // to exist as one JS array with an element per byte, which costs an order
  // of magnitude more than the bytes themselves and blew the sandbox's heap
  // long before a real library finished exporting.
  const u16 = (a, o, v) => { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; };
  const u32 = (a, o, v) => { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; a[o + 2] = (v >> 16) & 255; a[o + 3] = (v >>> 24) & 255; };
  const parts = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const nameB = utf8Bytes(f.name);
    const dataB = utf8Bytes(f.text);
    const crc = crc32(dataB);
    const local = new Uint8Array(30 + nameB.length + dataB.length);
    u32(local, 0, 0x04034b50);
    u16(local, 4, 20);
    // bit 11 = the name and comment are UTF-8, per the zip appendix; without
    // it an unpacker is entitled to read the name as its own code page
    u16(local, 6, 0x0800);
    u32(local, 14, crc);
    u32(local, 18, dataB.length);
    u32(local, 22, dataB.length);
    u16(local, 26, nameB.length);
    local.set(nameB, 30);
    local.set(dataB, 30 + nameB.length);
    const central = new Uint8Array(46 + nameB.length);
    u32(central, 0, 0x02014b50);
    u16(central, 4, 20);
    u16(central, 6, 20);
    u16(central, 8, 0x0800);
    u32(central, 16, crc);
    u32(central, 20, dataB.length);
    u32(central, 24, dataB.length);
    u16(central, 28, nameB.length);
    u32(central, 42, offset);
    central.set(nameB, 46);
    parts.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  u32(eocd, 0, 0x06054b50);
  u16(eocd, 8, files.length);
  u16(eocd, 10, files.length);
  u32(eocd, 12, cdSize);
  u32(eocd, 16, offset);
  const all = new Uint8Array(offset + cdSize + eocd.length);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  for (const c of centrals) { all.set(c, at); at += c.length; }
  all.set(eocd, at);
  return bytesToB64(all);
}

// ---------- two-phase state, carried by the runtime ----------
// The sandbox module is re-evaluated FRESH on every pass, so module-level
// Maps stashed in pass A are always gone by pass B (this silently broke
// gen timing, the sampler snapshot, prefill and {{setvar}} for every
// generation). State rides the kernel's GenerateResult echoes instead —
// genTimeMs / requestParams / assistantPrefill — and {{setvar}} writes ride
// the runtime's `stash` (pass A returns it, pass B receives it on ctx).
const pendingOut = (meta, extra) => ({
  __llmPending: true,
  ...((meta.chatVars && Object.keys(meta.chatVars).length) || (meta.wiTimed && Object.keys(meta.wiTimed).length) || extra
    ? {
        stash: {
          ...(meta.chatVars && Object.keys(meta.chatVars).length ? { vars: meta.chatVars } : {}),
          ...(meta.wiTimed && Object.keys(meta.wiTimed).length ? { wiTimed: meta.wiTimed } : {}),
          ...(extra && typeof extra === "object" ? extra : {}),
        },
      }
    : {}),
});
function applyStashVars(req, meta) {
  const v = req && req.stash && req.stash.vars;
  if (v && typeof v === "object" && Object.keys(v).length) meta.chatVars = { ...meta.chatVars, ...v };
  const t = req && req.stash && req.stash.wiTimed;
  if (t && typeof t === "object") meta.wiTimed = t;
}
// The kernel synthesizes {model:"error", error} when the provider call throws
// (content filter, bad key, transport failure) — surface that cause instead of
// the generic connectivity hint so a filtered turn reads as filtered.
function llmFailReason(reply) {
  const cause = reply && typeof reply.error === "string" ? reply.error.trim() : "";
  return cause || "model failed — check the connection in Settings";
}

// ---------- route handler ----------
// A sprite the caller did not send back keeps the image already on disk. The
// image only ever travels with the card, so any client that lists characters
// without the picture bytes (or fails to load one) would otherwise erase the
// whole pack the moment the card is saved from that view. Names and order
// come from the caller; a picture is only ever replaced by another picture.
function keepStoredSpriteImages(prev, card) {
  const before = prev && prev.studio && Array.isArray(prev.studio.expressions) ? prev.studio.expressions : null;
  const after = card && card.studio && Array.isArray(card.studio.expressions) ? card.studio.expressions : null;
  if (!before || !after) return;
  const stored = new Map();
  for (const e of before) if (e && typeof e.name === "string" && e.url) stored.set(e.name, e.url);
  if (!stored.size) return;
  card.studio = {
    ...card.studio,
    expressions: after.map((e) => (e && typeof e.name === "string" && !e.url && stored.has(e.name) ? { ...e, url: stored.get(e.name) } : e)),
  };
}

// ---------- data upgrades after an app update ----------

function olderThan(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  }
  return false;
}

function readJsonFile(fsx, rel) {
  try { return JSON.parse(fsx.read(rel)); } catch { return null; }
}

function writeJsonFile(fsx, rel, value) {
  fsx.write(rel, JSON.stringify(value, null, 2) + "\n");
}

/** Branch-tree chat (entries with parentId, meta.activeLeafId) → flat
 *  messages along the active path. The leaf's sibling replies become its
 *  swipes. Null when the chat is already flat. */
function flattenTreeChat(jsonl, meta, charName) {
  let entries;
  try { entries = jsonl.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)); } catch { return null; }
  if (!entries.length || !("parentId" in entries[0])) return null;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const trail = [];
  let cur = meta.activeLeafId ? byId.get(meta.activeLeafId) : entries[entries.length - 1];
  while (cur) {
    trail.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  const userName = meta.userName || "User";
  const speaker = charName || "Character";
  const flat = trail.map((e) => ({
    id: "e" + Math.random().toString(36).slice(2, 9),
    name: e.role === "user" ? userName : speaker,
    charId: e.role === "user" ? null : meta.characterId,
    role: e.role === "user" ? "user" : "char",
    text: e.text,
    at: e.at || Date.now(),
    swipes: [e.text],
    swipe: 0,
  }));
  const leaf = trail[trail.length - 1];
  if (leaf && leaf.role !== "user" && flat.length) {
    const siblings = entries.filter((e) => e.id !== leaf.id && e.parentId === leaf.parentId && e.role !== "user");
    if (siblings.length) flat[flat.length - 1].swipes = [leaf.text, ...siblings.map((x) => x.text)];
  }
  const nextMeta = {
    ...meta,
    userName,
    presetId: meta.presetId || "default",
    personaId: meta.personaId || null,
    lorebookIds: meta.lorebookIds || [],
    tainted: true,
    updatedAt: Date.now(),
  };
  delete nextMeta.activeLeafId;
  return { lines: flat.map((m) => JSON.stringify(m)), meta: nextMeta };
}

/** Sections preset → prompts + prompt_order. Null when already converted. */
function convertSectionsPreset(p) {
  if (!p || !Array.isArray(p.sections)) return null;
  const params = (p.sampler && p.sampler.params) || {};
  const prompts = p.sections.map((x) => ({
    identifier: x.id,
    name: x.name || x.id,
    role: x.role === "user" || x.role === "assistant" ? x.role : "system",
    ...(x.marker ? { marker: true } : {}),
    ...(typeof x.content === "string" && x.content.trim() ? { content: x.content } : {}),
    ...(x.position && typeof x.position.depth === "number" ? { injection_position: "absolute", injection_depth: x.position.depth } : {}),
  }));
  return {
    id: p.id,
    name: p.name || p.id || "Preset",
    prompts,
    prompt_order: [{ character_id: 100000, order: prompts.map((x) => ({ identifier: x.identifier, enabled: true })) }],
    ...(p.sampler && typeof p.sampler.temperature === "number" ? { temperature: p.sampler.temperature } : {}),
    ...(p.sampler && typeof p.sampler.maxTokens === "number" ? { openai_max_tokens: p.sampler.maxTokens } : {}),
    ...(p.context && typeof p.context.maxTokens === "number" ? { openai_max_context: p.context.maxTokens } : {}),
    ...params,
  };
}

/** Lorebook entries with nested insertion.{order,position,depth,role} →
 *  flat fields. Null when none are nested. */
function flattenLorebookInsertion(b) {
  if (!b || !Array.isArray(b.entries) || !b.entries.some((e) => e && e.insertion)) return null;
  const entries = b.entries.map((e) => {
    if (!e || !e.insertion) return e;
    const { insertion, ...rest } = e;
    return { ...rest, order: insertion.order, position: insertion.position, ...(insertion.depth != null ? { depth: insertion.depth } : {}), ...(insertion.role ? { role: insertion.role } : {}) };
  });
  return { ...b, entries };
}

/** The editor used to give every section that had no generation types of
 *  its own just "normal", so swipes, regenerations and continues sent none of
 *  the preset. A preset where every section is limited to "normal" is that
 *  damage, not a choice: it gets every generation type back. */
function allTriggersWhereNormalOnly(preset) {
  const sections = preset && preset.studio && Array.isArray(preset.studio.sections) ? preset.studio.sections : null;
  if (!sections || !sections.length) return null;
  const normalOnly = (s) => s && Array.isArray(s.injectionTriggers) && s.injectionTriggers.length === 1 && s.injectionTriggers[0] === "normal";
  if (!sections.every(normalOnly)) return null;
  const all = ["normal", "continue", "impersonate", "swipe", "regenerate", "quiet"];
  return { ...preset, studio: { ...preset.studio, sections: sections.map((s) => ({ ...s, injectionTriggers: all })) } };
}

/** Run once by the engine after this app's code moved from `from` to `to`.
 *  Every step is idempotent and only reads data an older version wrote. */
export function onAppUpdate(ctx, host) {
  const fsx = host.fs;
  const from = ctx && typeof ctx.from === "string" ? ctx.from : "0.0.0";
  const done = [];
  if (olderThan(from, "4.18.2")) {
    let files = [];
    try { files = fsx.list("presets").filter((f) => f.endsWith(".json")); } catch { files = []; }
    for (const f of files) {
      const out = allTriggersWhereNormalOnly(readJsonFile(fsx, "presets/" + f));
      if (!out) continue;
      writeJsonFile(fsx, "presets/" + f, out);
      done.push("presets/" + f + " generation types");
    }
  }
  if (!olderThan(from, "4.0.0")) return { upgraded: done };

  const defaultPreset = readJsonFile(fsx, "presets/default.json");
  // the old cramped generation defaults, only while never customized
  if (defaultPreset && defaultPreset.openai_max_context === 16384 && defaultPreset.openai_max_tokens === 1024) {
    writeJsonFile(fsx, "presets/default.json", { ...defaultPreset, openai_max_context: 128000, openai_max_tokens: 4096 });
    done.push("default preset limits");
  }

  let chats = [];
  try { chats = fsx.list("chats").filter((f) => f.endsWith(".jsonl")); } catch { chats = []; }
  for (const f of chats) {
    const metaRel = "chats/" + f.replace(/\.jsonl$/, ".meta.json");
    const meta = readJsonFile(fsx, metaRel) || {};
    const card = meta.characterId ? readJsonFile(fsx, "characters/" + meta.characterId + "/card.json") : null;
    const out = flattenTreeChat(fsx.read("chats/" + f), meta, card && card.name);
    if (!out) continue;
    fsx.write("chats/" + f, out.lines.join("\n") + "\n");
    writeJsonFile(fsx, metaRel, out.meta);
    done.push("chats/" + f);
  }

  for (const [dir, convert] of [["presets", convertSectionsPreset], ["lorebooks", flattenLorebookInsertion]]) {
    let files = [];
    try { files = fsx.list(dir).filter((f) => f.endsWith(".json")); } catch { files = []; }
    for (const f of files) {
      const out = convert(readJsonFile(fsx, dir + "/" + f));
      if (!out) continue;
      writeJsonFile(fsx, dir + "/" + f, { ...out, id: out.id || f.replace(/\.json$/, "") });
      done.push(dir + "/" + f);
    }
  }
  return { upgraded: done };
}

export function handleRoute(req, host) {
  const fsx = host.fs;
  const seg = req.path.split("?")[0].split("/").filter(Boolean);
  const head = seg[0];
  const id = seg[1];
  const op = seg[2];
  const ok = (json, status = 200) => ({ status, json });
  const err = (status, msg) => ({ status, json: { error: msg } });
  // ids are interpolated into fs paths — refuse path-shaped ids outright
  // ("..", ".", anything with a dot) before any route touches the disk
  if (id != null && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id)) {
    return err(400, "invalid id");
  }
  const readJson = (rel, fb) => { try { return JSON.parse(fsx.read(rel)); } catch { return fb; } };
  const writeJson = (rel, v) => fsx.write(rel, JSON.stringify(v, null, 2) + "\n");
  const body = () => (req.body && typeof req.body === "object" ? req.body : {});
  const touch = (meta) => { meta.updatedAt = Date.now(); return meta; };

  // ---------- boot payload ----------
  // Every route call rebuilds the sandbox and recompiles this file, so a boot
  // that fetches ten collections and then one transcript per chat pays that
  // cost ~25 times over and takes seconds. One route, one dispatch: the
  // sub-calls run in this same context and return the exact shapes the
  // individual routes do, so there is no second definition to keep in sync.
  if (head === "bootstrap" && !id && req.method === "GET") {
    const sub = (p) => handleRoute({ method: "GET", path: p, body: null }, host).json;
    const metas = sub("/chats").chats ?? [];
    const wanted = req.query && req.query.chat ? String(req.query.chat) : "";
    let activeChat = null;
    if (wanted) {
      const full = sub("/chats/" + wanted);
      if (full && full.meta) activeChat = { meta: full.meta, messages: full.messages ?? [] };
    }
    return ok({
      characters: sub("/characters").characters ?? [],
      groups: sub("/groups").items ?? [],
      personas: sub("/personas").items ?? [],
      presets: sub("/presets").items ?? [],
      lorebooks: sub("/lorebooks").items ?? [],
      regex: sub("/regex").items ?? [],
      settings: sub("/settings"),
      library: sub("/library"),
      databank: sub("/databank"),
      // Metas only. Inlining every transcript made this payload grow with
      // every message ever written — a megabyte of JSON built inside a 64MB
      // sandbox heap on every single app load. Each meta carries preview,
      // messageCount and hasUser, so lists and the sweep need no transcript;
      // the client pulls one chat at a time from /chats/:id.
      chats: metas,
      // …except the chat the client is about to show, which rides along so
      // opening the app still costs ONE request and paints a full transcript.
      activeChat,
    });
  }

  // ---------- characters ----------
  if (head === "characters") {
    if (req.method === "GET" && !id) {
      let ids = [];
      try { ids = fsx.list("characters"); } catch {}
      ids = ids.filter((cid) => !cid.startsWith("_")); // _-prefixed = AI-only template
      const out = [];
      for (const cid of ids) {
        const c = readJson("characters/" + cid + "/card.json", null);
        if (c) out.push({ ...c, id: cid, name: c.name, avatar: c.avatar || null, tags: c.tags || [], version: c.spec || "chara_card_v2" });
      }
      return ok({ characters: out });
    }
    if (!id) return err(400, "character id required");
    if (req.method === "GET") {
      const card = readJson("characters/" + id + "/card.json", null);
      return card ? ok({ ...card, id }) : err(404, "not found");
    }
    if (req.method === "PUT") {
      const b = body();
      if (!b.name) return err(400, "name required");
      // Canonical card fields + verbatim studio metadata bag (favorites, colors,
      // sprites, variants, stats…) — the card is storage, assembly reads the card fields.
      const prev = readJson("characters/" + id + "/card.json", {});
      const card = {
        ...prev,
        ...b,
        spec: "chara_card_v2", name: String(b.name),
        description: b.description || "", personality: b.personality || "",
        scenario: b.scenario || "", first_mes: b.first_mes || "", mes_example: b.mes_example || "",
        ...(typeof b.system_prompt === "string" && b.system_prompt ? { system_prompt: b.system_prompt } : {}),
        ...(typeof b.post_history_instructions === "string" && b.post_history_instructions ? { post_history_instructions: b.post_history_instructions } : {}),
        ...(Array.isArray(b.alternate_greetings) ? { alternate_greetings: b.alternate_greetings.map(String) } : {}),
        ...(typeof b.creator_notes === "string" && b.creator_notes ? { creator_notes: b.creator_notes } : {}),
        ...(Array.isArray(b.tags) ? { tags: b.tags.map(String) } : {}),
        ...(typeof b.avatar === "string" && b.avatar.startsWith("data:") ? { avatar: b.avatar } : {}),
      };
      delete card.id;
      keepStoredSpriteImages(prev, card);
      writeJson("characters/" + id + "/card.json", card);
      return ok({ ok: true, id });
    }
    // only what changed: {set, unset, studio, studioUnset}. A card with its
    // emotion images inside runs to megabytes, past the engine's 1 MB cap on
    // app requests, so the app sends a whole card only when it creates one.
    if (req.method === "PATCH") {
      const b = body();
      const prev = readJson("characters/" + id + "/card.json", null);
      if (!prev) return err(404, "character not found");
      const card = { ...prev };
      const set = b.set && typeof b.set === "object" ? b.set : {};
      for (const [k, v] of Object.entries(set)) {
        if (k === "id" || k === "studio" || k === "spec") continue;
        if (k === "avatar" && !(typeof v === "string" && v.startsWith("data:"))) continue; // a served URL is not the image
        card[k] = v;
      }
      if (typeof card.name !== "string" || !card.name) return err(400, "name required");
      for (const k of Array.isArray(b.unset) ? b.unset : []) {
        if (typeof k === "string" && !["name", "spec", "studio", "avatar"].includes(k)) delete card[k];
      }
      if ((b.studio && typeof b.studio === "object") || Array.isArray(b.studioUnset)) {
        const st = { ...(prev.studio && typeof prev.studio === "object" ? prev.studio : {}) };
        for (const [k, v] of Object.entries(b.studio || {})) st[k] = v;
        for (const k of Array.isArray(b.studioUnset) ? b.studioUnset : []) if (typeof k === "string") delete st[k];
        card.studio = st;
        keepStoredSpriteImages(prev, card);
      }
      writeJson("characters/" + id + "/card.json", card);
      return ok({ ok: true, id });
    }
    if (req.method === "DELETE") {
      try {
        fsx.remove("characters/" + id);
        // a deleted character takes its solo chats with it (the studio UI
        // always showed it that way; orphan chats can no longer generate)
        try {
          for (const f of fsx.list("chats")) {
            if (!f.endsWith(".meta.json")) continue;
            const meta = readJson("chats/" + f, null);
            if (meta && meta.characterId === id && !meta.groupId) {
              try { fsx.remove("chats/" + meta.id + ".jsonl"); } catch {}
              try { fsx.remove("chats/" + meta.id + ".meta.json"); } catch {}
              try { fsx.remove("chats/" + meta.id + ".memories.json"); } catch {}
            }
          }
        } catch {}
        return ok({ ok: true });
      } catch { return ok({ ok: false }); }
    }
  }

  // ---------- generic JSON entities ----------
  for (const kind of ["personas", "presets", "regex", "groups", "lorebooks"]) {
    if (head !== kind) continue;
    if (req.method === "GET" && !id) {
      let items = [];
      try {
        items = fsx.list(kind).filter((f) => f.endsWith(".json") && !f.startsWith("_"))
          .map((f) => readJson(kind + "/" + f, null)).filter(Boolean);
      } catch {}
      return ok({ items });
    }
    if (!id) return err(400, kind + " id required");
    if (req.method === "GET") {
      const v = readJson(kind + "/" + id + ".json", null);
      return v ? ok({ ...v, id }) : err(404, "not found");
    }
    if (req.method === "PUT") { writeJson(kind + "/" + id + ".json", { ...body(), id }); return ok({ ok: true, id }); }
    // PATCH merges into what's on disk — no client read-modify-write, no lost
    // updates when two clients touch different fields of the same entity
    if (req.method === "PATCH") {
      const cur = readJson(kind + "/" + id + ".json", null);
      if (!cur) return err(404, "not found");
      writeJson(kind + "/" + id + ".json", { ...cur, ...body(), id: cur.id ?? id });
      return ok({ ok: true, id });
    }
    if (req.method === "DELETE") { try { fsx.remove(kind + "/" + id + ".json"); return ok({ ok: true }); } catch { return ok({ ok: false }); } }
  }

  // ---------- settings ----------
  // library: the studio's local collections (themes, quick replies, tags,
  // folders, backgrounds, data bank) — ONE json file so agents can read and
  // edit the whole app in one glance next to settings.json.
  if (head === "library" && !id) {
    if (req.method === "GET") return ok(readJson("library.json", {}));
    if (req.method === "PUT") {
      const b = body();
      if (!b || typeof b !== "object") return err(400, "library object required");
      writeJson("library.json", b);
      return ok(b);
    }
  }

  if (head === "settings" && !id) {
    if (req.method === "GET") return ok(readJson("settings.json", { model: null, personaId: null }));
    if (req.method === "PUT") {
      const b = body();
      const cur = readJson("settings.json", { model: null, personaId: null });
      if ("model" in b) cur.model = b.model;
      if ("personaId" in b) cur.personaId = b.personaId;
      // `ui` carries the ENTIRE studio UI settings object — agents edit it
      // on disk (data/settings.json) and every open client picks it up live
      // via the data-watcher look_changed → hydrate.
      if ("ui" in b && b.ui && typeof b.ui === "object") cur.ui = b.ui;
      writeJson("settings.json", cur);
      return ok(cur);
    }
  }

  // ---------- peek: assembled prompt ----------
  if (head === "prompt" && id === "preview" && req.method === "POST") {
    const b = body();
    const chat = loadChat(fsx, b.chatId);
    if (!chat) return err(404, "chat not found");
    const members = chatMembers(fsx, chat.meta);
    let msgs = chat.msgs;
    // message-scoped: simulate the prompt AS OF the peeked message, not the
    // chat's current tail. a user message includes itself (a generation would
    // answer it); an assistant message excludes itself (its prompt ended at
    // the previous turn)
    if (b.messageId) {
      const idx = chat.msgs.findIndex((m) => m.id === b.messageId);
      if (idx < 0) return err(404, "message not found");
      msgs = chat.msgs.slice(0, chat.msgs[idx].role === "user" ? idx + 1 : idx);
    }
    if (b.userText && String(b.userText).trim()) {
      msgs = msgs.concat([{ id: "peek", name: chatUserName(fsx, chat.meta), charId: null, role: "user", text: String(b.userText), swipes: [String(b.userText)], swipe: 0 }]);
    }
    // semantic prep mirrors the send path (dry run): one extra pass when
    // vectors are in play, so the peek shows the true request
    if (host.llm.embed && embedCap(fsx)) {
      const scanEmbedText = (b.userText && String(b.userText).trim() ? String(b.userText) + "\n" : "") + msgs.slice(-4).map((m) => m.text || "").join("\n");
      const personaIdsP = (() => {
        const pid = chat.meta.personaId || (() => { try { return JSON.parse(fsx.read("settings.json")).personaId; } catch { return null; } })();
        const per = pid ? readJson("personas/" + pid + ".json", null) : null;
        return per && Array.isArray(per.lorebookIds) ? per.lorebookIds : [];
      })();
      const work = semanticEmbedWork(fsx, chat.meta, personaIdsP, scanEmbedText);
      const haveScan = host.llm.embedResults && host.llm.embedResults.scan !== undefined;
      if (work && !haveScan) {
        host.llm.embed("scan", { texts: [scanEmbedText, ...work.needed.map((e) => e.text)] });
        return { __llmPending: true, stash: { wiEmbed: work.needed } };
      }
      if (work && haveScan) {
        const res = host.llm.embedResults.scan;
        if (Array.isArray(res)) {
          if (Array.isArray(req.stash && req.stash.wiEmbed) && req.stash.wiEmbed.length) cacheWiVectorBatch(fsx, req.stash.wiEmbed, res.slice(1));
        }
      }
    }
    const scanVecPeek = host.llm.embedResults && Array.isArray(host.llm.embedResults.scan) && host.llm.embedResults.scan[0] ? host.llm.embedResults.scan[0] : null;
    // the speaker a real generation from this point would use: the peeked
    // reply's own author, else the group's next in rotation
    const peekGroup = chat.meta.groupId ? readJson("groups/" + chat.meta.groupId + ".json", null) : null;
    const peeked = b.messageId ? chat.msgs.find((m) => m.id === b.messageId) : null;
    const lastReply = [...msgs].reverse().find((m) => m.role === "char" && !m.picture);
    const peekSpeaker = (peeked && peeked.role === "char" && members.find((m) => m.id === peeked.charId))
      || (peekGroup ? groupTurnPlan(peekGroup, members, lastReply ? lastReply.charId : null, b.userText || "", null)[0] : null)
      || members[0] || null;
    const a = assemble(fsx, chat.meta, msgs, peekSpeaker, null, { limits: limitsOf(body()), dryRun: true, scanVec: scanVecPeek, gen: "preview" });
    // tool defs ride the peek exactly as a send would (the wantsTools sibling
    // set) when the caller asks for them — host.siblingTools is absent on
    // engine builds without that contract
    const toolDefs = host && Array.isArray(host.siblingTools) ? host.siblingTools : null;
    return ok({
      systemPrompt: a.systemPrompt, messages: a.messages, presetParams: a.presetParams, presetName: a.presetName,
      // the rest of the exact request envelope a generation would send
      // (chat profile model, else the global engine model — same resolution
      // a send uses)
      model: chat.meta.model != null ? chat.meta.model : (() => { try { return JSON.parse(fsx.read("settings.json")).model; } catch { return null; } })(),
      ...(a.reasoning ? { reasoning: a.reasoning } : {}),
      ...(a.reasoningTags ? { reasoningTags: a.reasoningTags } : {}),
      ...(a.thinkingBudget ? { thinkingBudget: a.thinkingBudget } : {}),
      ...(a.promptFormat ? { promptFormat: a.promptFormat } : {}),
      ...(a.assistantPrefill ? { assistantPrefill: a.assistantPrefill } : {}),
      ...(toolDefs && toolDefs.length ? { tools: toolDefs } : {}),
    });
  }

  // ---------- world info status: what ACTUALLY fires for a chat ----------
  // Same activation path a generation runs, with real budget numbers — the
  // app's "active entries" viewer shows this instead of a mock.
  if (head === "wi-status" && req.method === "POST") {
    const b = body();
    const chat = loadChat(fsx, String(b.chatId || ""));
    if (!chat) return err(404, "chat not found");
    const personaId = chat.meta.personaId || (() => { try { return JSON.parse(fsx.read("settings.json")).personaId; } catch { return null; } })();
    const persona = personaId ? readJson("personas/" + personaId + ".json", null) : null;
    const preset = readJson("presets/" + (chat.meta.presetId || defaultPresetId(fsx)) + ".json", null);
    // what a normal send by the chat's (first) character would see
    const members = chatMembers(fsx, chat.meta);
    const lead = members[0] || null;
    // the scope the app sends before each generation (global books + the
    // cards' own and linked ones): a chat with no send yet has none stored
    const globalIds = (() => {
      try {
        return fsx.list("lorebooks").filter((f) => f.endsWith(".json"))
          .map((f) => readJson("lorebooks/" + f, null)).filter((b) => b && b.globalActive === true).map((b) => b.id);
      } catch { return []; }
    })();
    const wi = activateWorldInfo(
      fsx, chat.meta,
      chat.msgs.filter((m) => m.role !== "system" && m.hidden !== true),
      [...(persona?.lorebookIds || []), ...globalIds, ...cardBookIds(members.map((m) => m.card))], wiBudgetChars(preset),
      {
        dryRun: true, config: preset && preset.studio && preset.studio.worldInfo,
        speaker: lead ? { id: lead.id, name: lead.name, tags: lead.card && lead.card.tags } : null,
        genTypes: ["normal"],
        characterBookIds: cardBookIds(members.map((m) => m.card)),
        sources: (() => {
          const card = lead ? lead.card : null;
          return {
            description: card ? card.description : null,
            personality: card ? card.personality : null,
            scenario: card ? card.scenario : null,
            persona: persona ? persona.description : null,
          };
        })(),
      },
    );
    return ok({
      fired: wi.trace, skipped: wi.skipped, blocked: wi.blocked,
      usedChars: wi.used, budgetChars: wi.budgetChars, scanDepth: wi.scanDepth,
      contextTokens: presetMaxCtx(preset),
    });
  }

  // ---------- keyword test: the real scanner on pasted text ----------
  // {text, books?: [book] (the editor's copy, unsaved edits included) | bookIds?: [id], chatId?}.
  // A dry run: nothing is consumed; a chat lends its timed state, message
  // count and card fields, the scan itself sees only the pasted text.
  if (head === "wi-test" && req.method === "POST") {
    const b = body();
    const text = typeof b.text === "string" ? b.text.slice(0, 200000) : "";
    let books;
    if (Array.isArray(b.books)) books = b.books.slice(0, 50).filter((x) => x && typeof x === "object" && Array.isArray(x.entries));
    else if (Array.isArray(b.bookIds)) {
      books = b.bookIds.filter((x) => typeof x === "string" && /^[\w-]{1,128}$/.test(x))
        .map((x) => readJson("lorebooks/" + x + ".json", null)).filter(Boolean);
    } else return err(400, "books or bookIds required");
    const chat = b.chatId ? loadChat(fsx, String(b.chatId)) : null;
    if (b.chatId && !chat) return err(404, "chat not found");
    const preset = readJson("presets/" + ((chat && chat.meta.presetId) || defaultPresetId(fsx)) + ".json", null);
    const card = chat && chat.meta.characterId ? resolveCardVariants(readJson("characters/" + chat.meta.characterId + "/card.json", null), chat.meta.fieldVariantSelection) : null;
    const wi = activateWorldInfo(fsx, chat ? chat.meta : {}, [{ text }], [], wiBudgetChars(preset), {
      dryRun: true, books, config: preset && preset.studio && preset.studio.worldInfo,
      tick: chat ? chat.msgs.filter((m) => m.role !== "system" && m.hidden !== true).length + 1 : 1,
      sources: card ? { description: card.description, personality: card.personality, scenario: card.scenario } : {},
      speaker: card ? { id: chat.meta.characterId, name: card.name, tags: card.tags } : null,
      genTypes: ["normal"],
      characterBookIds: card ? cardBookIds([card]) : [],
    });
    return ok({ fired: wi.trace, skipped: wi.skipped, blocked: wi.blocked, usedChars: wi.used, budgetChars: wi.budgetChars });
  }

  // ---------- export backup (zip, store entries) ----------
  if (head === "export" && id === "backup" && req.method === "GET") {
    const files = [];
    const usedNames = new Set();
    // Names are deduped WITHIN a folder: a character and a book that share a
    // name are two different files in two different places, and renaming one
    // of them to "-2" only makes the zip harder to read.
    const unameIn = (dir, base, ext) => {
      let n = base + ext, i = 2;
      while (usedNames.has(dir + "/" + n)) n = base + "-" + i++ + ext;
      usedNames.add(dir + "/" + n);
      return n;
    };
    const uname = (base, ext) => unameIn("characters", base, ext);
    const chars = [];
    try {
      for (const cid of fsx.list("characters")) {
        const card = readJson("characters/" + cid + "/card.json", null);
        if (!card) continue;
        const file = uname(slug(card.name || cid), ".json");
        files.push({ name: "characters/" + file, text: JSON.stringify(card, null, 2) });
        const st = card.studio && typeof card.studio === "object" ? card.studio : {};
        chars.push({
          id: cid, slug: file.replace(/\.json$/, ""), name: card.name,
          links: { embedded: st.embeddedLorebookId || null, linked: Array.isArray(st.linkedLorebookIds) ? st.linkedLorebookIds : [] },
        });
      }
    } catch {}
    const groups = [];
    const idToName = new Map(chars.map((c) => [c.id, c.name]));
    try {
      for (const gid of fsx.list("groups")) {
        // fsx.list returns full filenames ("grp_x.json") — don't append again
        const g = readJson("groups/" + (gid.endsWith(".json") ? gid : gid + ".json"), null);
        if (!g) continue;
        const file = uname(slug(g.name || gid), ".json");
        // _memberNames ride along so a restore can remap member ids after
        // characters are re-created under fresh (name-derived) ids
        const memberNames = (g.memberIds || []).map((mid) => idToName.get(mid) ?? null);
        files.push({ name: "groups/" + file, text: JSON.stringify({ ...g, _file: file.replace(/\.json$/, ""), _memberNames: memberNames }, null, 2) });
        groups.push({ id: gid.replace(/\.json$/, ""), slug: file.replace(/\.json$/, ""), name: g.name });
      }
    } catch {}
    const presets = {};
    try {
      for (const f of fsx.list("presets").filter((x) => x.endsWith(".json"))) {
        const preset = readJson("presets/" + f, null);
        if (preset) presets[preset.name || f.replace(/\.json$/, "")] = preset;
      }
    } catch {}
    if (Object.keys(presets).length) files.push({ name: "User Settings/openai_settings.json", text: JSON.stringify(presets, null, 2) });
    try {
      for (const f of fsx.list("regex").filter((x) => x.endsWith(".json"))) {
        const s = readJson("regex/" + f, null);
        if (!s) continue;
        const ax = regexAxes(s);
        const NUM = { user_input: 1, ai_output: 2, slash: 3, wi: 5, reasoning: 6 };
        const rid2 = slug(s.scriptName || f);
        files.push({
          name: "User Settings/regex/" + rid2 + ".json",
          text: JSON.stringify({
            id: rid2, scriptName: s.scriptName || rid2,
            findRegex: "/" + String(s.findRegex || "").replace(/(?<!\\)\//g, "\\/") + "/" + (s.flags || "g"),
            replaceString: s.replaceString || "",
            trimStrings: Array.isArray(s.trimStrings) ? s.trimStrings : [],
            placement: ax.where.map((p) => NUM[p]).filter(Boolean),
            disabled: s.disabled === true,
            markdownOnly: ax.markdownOnly, promptOnly: ax.promptOnly, runOnEdit: s.runOnEdit === true,
            substituteRegex: s.macroMode === "raw" ? 1 : s.macroMode === "escaped" ? 2 : 0,
            minDepth: s.minDepth ?? null, maxDepth: s.maxDepth ?? null,
          }, null, 2),
        });
      }
    } catch {}
    // book names, so anything that points at a book can travel by name: ids
    // are re-minted on the machine that restores, so an id reference is a
    // dangling one the moment it leaves this install
    const bookNames = new Map();
    try {
      for (const f of fsx.list("lorebooks").filter((x) => x.endsWith(".json"))) {
        const b = readJson("lorebooks/" + f, null);
        if (b) bookNames.set(b.id || f.replace(/\.json$/, ""), b.name || f.replace(/\.json$/, ""));
      }
    } catch {}
    const presetNames = new Map();
    try {
      for (const f of fsx.list("presets").filter((x) => x.endsWith(".json"))) {
        const p = readJson("presets/" + f, null);
        if (p) presetNames.set(p.id || f.replace(/\.json$/, ""), p.name || f.replace(/\.json$/, ""));
      }
    } catch {}
    const namesOf = (ids, map) => (Array.isArray(ids) ? ids.map((x) => map.get(x)).filter(Boolean) : []);
    // Personas travelled as a flat {name: description} map, so a restore
    // rebuilt them with the default avatar, no title, no pronouns, no bound
    // characters, no linked books and nothing marked default — which is what
    // made personas behave as if they had been reset on the second device.
    // The full record rides its own file; the flat map stays for other tools.
    let personas = {};
    try {
      for (const f of fsx.list("personas").filter((x) => x.endsWith(".json"))) {
        const p = readJson("personas/" + f, null);
        if (!p) continue;
        const name = p.name || f.replace(/\.json$/, "");
        personas[name] = p.description || "";
        files.push({
          name: "personas/" + unameIn("personas", slug(name), ".json"),
          text: JSON.stringify({
            ...p,
            name,
            _lorebookNames: namesOf(p.lorebookIds, bookNames),
            _boundNames: namesOf(p.boundCharacterIds, idToName),
          }, null, 2),
        });
      }
    } catch {}
    files.push({ name: "User Settings/personas.json", text: JSON.stringify(personas, null, 2) });
    try {
      for (const f of fsx.list("lorebooks").filter((x) => x.endsWith(".json"))) {
        const book = readJson("lorebooks/" + f, null);
        if (!book) continue;
        // to the public world-info shape: entries keyed by uid. EVERY field
        // the importer reads is written back, or a book that leaves in a
        // backup comes home without its timed effects, groups, recursion
        // flags or extra match sources.
        const entries = {};
        (book.entries || []).forEach((entry, i) => {
          const ms = entry.matchSources || {};
          entries[entry.uid != null ? entry.uid : i] = {
            uid: entry.uid != null ? entry.uid : i,
            key: entry.keys || [], keysecondary: entry.secondaryKeys || [],
            comment: entry.memo || entry.title || "",
            content: entry.content || "", constant: isConstantEntry(entry), selective: false,
            vectorized: entry.status === "vectorized",
            selectiveLogic: { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 }[entry.selectiveLogic] ?? 0,
            order: entry.order ?? 100, position: { before_char: 0, after_char: 1, at_depth: 4 }[entry.position] ?? 1,
            depth: entry.depth ?? 4, role: { system: 0, user: 1, assistant: 2 }[entry.role] ?? 0,
            disable: entry.enabled === false,
            probability: entry.probability != null ? entry.probability : 100,
            useProbability: entry.probability != null && entry.probability < 100,
            excludeRecursion: entry.nonRecursable === true,
            preventRecursion: entry.preventFurtherRecursion === true,
            delayUntilRecursion: entry.delayUntilRecursion ?? false,
            ignoreBudget: entry.ignoreBudget === true,
            matchWholeWords: entry.matchWholeWords !== false,
            group: entry.group || "", groupOverride: entry.groupOverride === true,
            groupWeight: entry.groupWeight ?? 100,
            sticky: entry.sticky ?? 0, cooldown: entry.cooldown ?? 0, delay: entry.delay ?? 0,
            automationId: entry.automationId || "",
            matchCharacterDescription: ms.description === true,
            matchCharacterPersonality: ms.personality === true,
            matchScenario: ms.scenario === true,
            matchPersonaDescription: ms.persona === true,
          };
        });
        const bookName = book.name || f.replace(/\.json$/, "");
        files.push({
          name: "worlds/" + unameIn("worlds", slug(bookName), ".json"),
          text: JSON.stringify({
            name: bookName,
            entries,
            // book-level knobs the public world-info shape has nowhere to put:
            // scan depth, budget, recursion, and whether the book is global or
            // linked to particular cards. Without these a restored book came
            // back switched off and scanning with stock settings.
            _studio: {
              settings: book.settings ?? null,
              globalActive: book.globalActive === true,
              folderId: book.folderId ?? null,
              // the app's own file, so a restore here loses nothing the public shape cannot carry
              native: { ...book, id: undefined, linkedCharacterIds: undefined },
              // the cards that use the book (the card side is where links live)
              _linkedNames: chars.filter((c) => c.links.linked.includes(book.id)).map((c) => c.name),
              _embeddedFor: chars.filter((c) => c.links.embedded === book.id).map((c) => c.name),
            },
          }, null, 2),
        });
      }
    } catch {}
    // chats → per character/group folders, public jsonl chat shape
    try {
      for (const cid of fsx.list("chats").filter((f) => f.endsWith(".meta.json") && !f.startsWith("_"))) {
        const chat = loadChat(fsx, cid.replace(/\.meta\.json$/, ""));
        if (!chat || !chat.msgs.length) continue;
        const m = chat.meta;
        const ownerSlug = m.groupId
          ? (groups.find((g) => g.id === m.groupId) || { slug: slug(m.groupId) }).slug
          : (chars.find((c) => c.id === m.characterId) || { slug: slug(m.characterId || "chat") }).slug;
        const lines = chat.msgs.map((msg) => JSON.stringify({
          name: msg.name, is_user: msg.role === "user", is_system: msg.role === "system",
          send_date: new Date(msg.at || 0).toISOString(),
          mes: msg.text,
          swipes: msg.swipes && msg.swipes.length ? msg.swipes : [msg.text],
          swipe_id: msg.swipe || 0,
          // the public line shape has no room for a hidden turn, a bookmark, a
          // generated picture, a translation or the model/usage stamp — all of
          // it used to be dropped on export and could never come back
          extra: {
            chry_char_id: msg.charId || undefined,
            chry: {
              id: msg.id,
              ...(msg.hidden === true ? { hidden: true } : {}),
              ...(msg.bookmark ? { bookmark: msg.bookmark } : {}),
              ...(msg.picture ? { picture: msg.picture } : {}),
              ...(msg.translation ? { translation: msg.translation } : {}),
              ...(msg.extra && typeof msg.extra === "object" ? { extra: msg.extra } : {}),
            },
          },
        }));
        const base = "chats/" + ownerSlug + "/" + unameIn("chats/" + ownerSlug, slug(m.title || m.id) + "-" + m.id, "");
        files.push({ name: base + ".jsonl", text: lines.join("\n") + "\n" });
        // The transcript alone loses everything ABOUT the conversation: which
        // preset and persona it rides, its model, its author's note, its
        // summary and memory cutoff, its folder and tags, which card variant
        // it sends, and where it branched from. A restore re-pinned every
        // chat to the default preset and no persona. The sidecar carries it,
        // with ids that don't survive the trip written out as names too.
        files.push({
          name: base + ".meta.json",
          text: JSON.stringify({
            ...m,
            title: m.title || "",
            _presetName: presetNames.get(m.presetId) ?? null,
            _personaName: (() => {
              const p = m.personaId ? readJson("personas/" + m.personaId + ".json", null) : null;
              return p ? p.name || null : null;
            })(),
            _lorebookNames: namesOf(m.lorebookIds, bookNames),
          }, null, 2),
        });
      }
    } catch {}
    // the data bank rides along: its chunks are the retrieval index, and
    // rebuilding them means re-uploading every source document by hand
    try {
      for (const f of fsx.list("databank").filter((x) => x.endsWith(".json"))) {
        const d = readJson("databank/" + f, null);
        if (d) files.push({ name: "databank/" + unameIn("databank", slug(d.name || f.replace(/\.json$/, "")), ".json"), text: JSON.stringify(d, null, 2) });
      }
    } catch {}
    // settings.json used to be a three-field stamp, so a restore came up with
    // stock theme, fonts, hotkeys, TTS, translation and chat behaviour, and
    // library.json (quick replies, themes, backgrounds, tags, folders,
    // connection profiles) wasn't in the zip at all.
    files.push({
      name: "settings.json",
      text: JSON.stringify({
        app: "studio", exportedAt: new Date().toISOString(), version: 2,
        settings: readJson("settings.json", {}),
      }, null, 2),
    });
    files.push({ name: "library.json", text: JSON.stringify(readJson("library.json", {}), null, 2) });
    return ok({ filename: "studio-backup-" + new Date().toISOString().slice(0, 10) + ".zip", base64: buildZip(files) });
  }

    // translate: LLM or provider-proxy translation (message menu, composer).
    // Providers: google (unofficial endpoint,
    // keyless), lingva (keyless), deepl (keyed — the key is app-level config
    // by design in data/settings.json ui.translation.deeplKey: user-entered
    // app config, not an engine credential, so app backups include it), or
    // llm (any engine model). HTTP providers ride the two-phase host.net
    // contract exactly like the URL importer.
    if (head === "translate" && req.method === "POST") {
      const b = body();
      const ui = (readJson("settings.json", {}).ui || {});
      const tcfg = ui.translation || {};
      const provider = ["llm", "google", "lingva", "deepl"].includes(b.provider) ? b.provider : (tcfg.provider || "llm");
      const target = String(b.target || tcfg.targetLanguage || "English");
      const text = String(b.text || "");
      if (!text.trim()) return err(400, "nothing to translate");

      if (provider === "llm") {
        // a long text goes in pieces: one request for a 20k-character card
        // field ran past free models' output limits and came back cut or failed
        const chunks = chunkForTranslate(text, TRANSLATE_LLM_CHUNK);
        const keyOf = (i) => "translation:" + i;
        if (chunks.some((_, i) => !host.llm.results[keyOf(i)])) {
          const model = readJson("settings.json", {}).model;
          chunks.forEach((c, i) => {
            if (host.llm.results[keyOf(i)]) return;
            host.llm.request(keyOf(i), {
              messages: [
                { role: "system", content: translateRules(target) },
                { role: "user", content: c },
              ],
              ...(model ? { model } : {}),
            });
          });
          // no chat meta here — nothing to stash
          return { __llmPending: true };
        }
        const replies = chunks.map((_, i) => host.llm.results[keyOf(i)]);
        const bad = replies.find((r) => r.model === "error");
        if (bad) return err(503, llmFailReason(bad));
        // chunks were cut at whitespace: put each piece's own edges back
        return ok({
          text: chunks.map((c, i) => {
            const lead = /^\s*/.exec(c)[0], trail = /\s*$/.exec(c)[0];
            return lead + String(replies[i].text || "").trim() + trail;
          }).join("").trim(),
        });
      }

      if (!host.net) return err(503, "network permission not granted");
      const code = LANG_CODES[target.toLowerCase()];
      if (!code) return err(400, "no language code for \"" + target + "\" — pick a listed language or use the llm provider");
      const deeplKey = provider === "deepl" ? String(b.deeplKey || tcfg.deeplKey || "") : "";
      if (provider === "deepl" && !deeplKey) return err(400, "DeepL needs an API key (Tools → Translation)");
      // every chunk rides as its own keyed request; all keys land together on
      // the next pass and stitch back in order
      const chunks = chunkForTranslate(text, TRANSLATE_CHUNKS[provider] || 4000);
      const keyOf = (i) => "tr:" + i;
      const extract = (j) => {
        if (provider === "google" && Array.isArray(j) && Array.isArray(j[0])) return j[0].map((x) => (Array.isArray(x) ? x[0] : "")).join("");
        if (provider === "lingva" && j && typeof j.translation === "string") return j.translation;
        if (provider === "deepl" && j && j.translations && j.translations[0] && typeof j.translations[0].text === "string") return j.translations[0].text;
        return "";
      };
      if (chunks.some((_, i) => host.net.results[keyOf(i)] == null)) {
        chunks.forEach((c, i) => {
          if (provider === "google") {
            host.net.request(keyOf(i), {
              url: "https://translate.google.com/translate_a/single?client=gtx&sl=auto&tl=" + code + "&dt=t&q=" + encodeURIComponent(c),
              json: true, maxBytes: 1024 * 1024,
            });
          } else if (provider === "lingva") {
            host.net.request(keyOf(i), {
              url: "https://lingva.ml/api/v1/auto/" + code + "/" + encodeURIComponent(c),
              json: true, maxBytes: 1024 * 1024,
            });
          } else {
            const base = /:pro$/i.test(deeplKey) ? "https://api.deepl.com" : "https://api-free.deepl.com";
            host.net.request(keyOf(i), {
              url: base + "/v2/translate",
              method: "POST",
              headers: { authorization: "DeepL-Auth-Key " + deeplKey.replace(/:pro$/i, "") },
              body: { text: [c], target_lang: code.split("-")[0].toUpperCase() },
              json: true, maxBytes: 1024 * 1024,
            });
          }
        });
        return { __llmPending: true };
      }
      let out = "";
      for (let i = 0; i < chunks.length; i++) {
        const r = host.net.results[keyOf(i)];
        if (!r.ok) return err(502, "translation provider failed (" + r.status + " " + (r.statusText || "") + ")");
        out += extract(r.json);
      }
      if (!out.trim()) return err(502, "translation provider returned no text");
      return ok({ text: out.trim() });
    }

    // ---------- data bank (docs on disk, chunked + searched + injected) ----------
    if (head === "databank") {
      if (req.method === "GET" && !id) {
        return ok({ files: listDatabank(fsx).map((f) => ({
          id: f.id, name: f.name, scope: f.scope || "global", scopeTargetId: f.scopeTargetId || null,
          status: "ready", size: f.size || 0, chunks: (f.chunks || []).length,
          enabled: f.enabled !== false, addedAt: f.addedAt || 0,
        })) });
      }
      if (req.method === "POST" && !id) {
        const b = body();
        const name = String(b.name || "").trim().slice(0, 120);
        const content = typeof b.content === "string" ? b.content : "";
        if (!name) return err(400, "name required");
        if (!content.trim()) return err(400, "content is empty");
        if (content.length > 2 * 1024 * 1024) return err(413, "file too large (2 MB text limit)");
        const fid = uid("db");
        const chunks = chunkText(content);
        const file = {
          id: fid, name, scope: ["global", "character", "chat"].includes(b.scope) ? b.scope : "global",
          scopeTargetId: b.scope !== "global" && typeof b.scopeTargetId === "string" && b.scopeTargetId ? b.scopeTargetId : null,
          enabled: true, addedAt: Date.now(),
          size: content.length, chunks,
        };
        writeJson("databank/" + fid + ".json", file);
        return ok({ file: { id: fid, name, scope: file.scope, scopeTargetId: file.scopeTargetId, status: "ready", size: file.size, chunks: chunks.length, enabled: true, addedAt: file.addedAt } });
      }
      if (req.method === "GET" && id === "search") {
        const q = String((req.query && req.query.q) || (body().q) || "");
        if (!q.trim()) return err(400, "q required");
        // ?chatId= searches what that chat would see; without it, every file
        const sc = req.query && req.query.chatId ? (() => {
          const ch = loadChat(fsx, String(req.query.chatId));
          return ch ? { chatId: ch.meta.id, characterIds: chatMembers(fsx, ch.meta).map((m) => m.id) } : null;
        })() : null;
        return ok({ results: searchDatabank(fsx, q, 8, sc) });
      }
      if (req.method === "PATCH" && id) {
        const b = body();
        const f = readJson("databank/" + id + ".json", null);
        if (!f) return err(404, "no such file");
        if (typeof b.enabled === "boolean") f.enabled = b.enabled;
        if (typeof b.name === "string" && b.name.trim()) f.name = b.name.trim().slice(0, 120);
        if (["global", "character", "chat"].includes(b.scope)) {
          f.scope = b.scope;
          f.scopeTargetId = b.scope !== "global" && typeof b.scopeTargetId === "string" && b.scopeTargetId ? b.scopeTargetId : null;
        }
        writeJson("databank/" + id + ".json", f);
        return ok({ ok: true });
      }
      if (req.method === "DELETE" && id) {
        try { fsx.remove("databank/" + id + ".json"); } catch { return err(404, "no such file"); }
        return ok({ ok: true });
      }
    }

    // ---------- chats ----------
  if (head === "chats") {
    if (req.method === "GET" && !id) {
      let metas = [];
      try {
        metas = fsx.list("chats").filter((f) => f.endsWith(".meta.json"))
          .map((f) => readJson("chats/" + f, null)).filter(Boolean)
          .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      } catch {}
      // list payload carries a preview + count so chat lists render without
      // fetching every transcript (the studio UI shows both per chat)
      for (const m of metas) {
        try {
          const lines = fsx.read("chats/" + m.id + ".jsonl").split("\n").filter((l) => l.trim());
          m.messageCount = lines.length;
          const last = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
          m.preview = last ? String(last.text || "").slice(0, 160) : "";
          // the boot sweep deletes chats that were created and never went
          // anywhere. It cannot read a transcript it did not load, so it needs
          // to know here whether the user ever spoke. A raw substring test
          // keeps this list cheap: these lines are engine-written JSON.
          m.hasUser = lines.some((l) => l.includes('"role":"user"'));
        } catch { m.messageCount = 0; m.preview = ""; m.hasUser = false; }
      }
      return ok({ chats: metas });
    }

    if (req.method === "POST" && !id) {
      const b = body();
      const cid = uid("c");
      // the persona is pinned at creation: a chat keeps the one it started
      // with until someone switches it, so changing the default later never
      // swaps the persona of chats that already exist
      const personaId = b.personaId || readJson("settings.json", {}).personaId || null;
      const persona = personaId ? readJson("personas/" + personaId + ".json", null) : null;
      const userName = typeof b.userName === "string" && b.userName ? b.userName : (persona && persona.name) || "User";
      const meta = {
        id: cid,
        title: b.title || "New chat",
        characterId: b.characterId || null,
        groupId: b.groupId || null,
        // a new chat starts on the user's default preset, not the stock one
        presetId: b.presetId || defaultPresetId(fsx),
        personaId: persona ? personaId : null,
        model: b.model || null,
        userName,
        authorNote: null,
        lorebookIds: [],
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      // seed the greeting (all greetings as swipes → swipe chevrons rotate them)
      const msgs = [];
      if (meta.characterId) {
        const card = readJson("characters/" + meta.characterId + "/card.json", null);
        if (card) {
          const greetings = cardGreetings(fsx, meta, meta.characterId, card);
          if (greetings.length) {
            const g = expandMacros(greetings[0], transcriptMacros([], { userName: chatUserName(fsx, meta), charName: card.name, personaText: "", chatId: meta.id, vars: {}, summary: "" }));
            msgs.push({ id: uid(), name: card.name, charId: meta.characterId, role: "char", text: g, at: Date.now(), swipes: greetings, swipe: 0, greeting: true });
          }
          meta.title = card.name;
        }
      }
      if (meta.groupId) {
        const g = readJson("groups/" + meta.groupId + ".json", null);
        if (g) {
          meta.title = g.name;
          if (b.openingMessage && String(b.openingMessage).trim()) {
            msgs.push({ id: uid(), name: "System", charId: null, role: "system", text: String(b.openingMessage), at: Date.now(), swipes: [String(b.openingMessage)], swipe: 0 });
          }
          // group-only greetings: a member carrying them opens with one of
          // them (random pick, all variants as swipes) instead of never
          // greeting — the v3 card field, or its legacy extension spelling
          for (const mid of g.memberIds || []) {
            const card = readJson("characters/" + mid + "/card.json", null);
            if (!card) continue;
            const gg = Array.isArray(card.group_only_greetings) ? card.group_only_greetings
              : card.extensions && Array.isArray(card.extensions.group_greetings) ? card.extensions.group_greetings : [];
            const who = { id: mid, name: card.name, card };
            const list = gg.map(String).filter((t) => t.trim()).map((t) => regexOnSave(fsx, meta, [who], t, "ai_output", saveMacros(fsx, meta, [], who)));
            if (!list.length) continue;
            const pick = Math.floor(Math.random() * list.length);
            const text = list[pick].split("{{user}}").join(userName).split("{{char}}").join(card.name);
            msgs.push({ id: uid(), name: card.name, charId: mid, role: "char", text, at: Date.now(), swipes: list, swipe: pick, greeting: true });
          }
        }
      }
      saveChat(fsx, cid, meta, msgs);
      return ok({ meta, messages: msgs }, 201);
    }

    if (!id) return err(400, "chat id required");
    const chat = loadChat(fsx, id);
    if (!chat) return err(404, "chat not found");
    const meta = chat.meta;
    const members = chatMembers(fsx, meta);
    const group = meta.groupId ? readJson("groups/" + meta.groupId + ".json", null) : null;
    const modelOf = () => (body().model != null ? body().model : meta.model);
    // stored-text regex for a message about to be saved in this chat
    const onSave = (text, placement, speaker) => regexOnSave(fsx, meta, members, text, placement, saveMacros(fsx, meta, chat.msgs, speaker));
    // PASS A of a generation writes no transcript — but a page reload inside
    // that window must not let the client's abandoned-chat sweep judge this
    // chat deletable (server-side it is still just a greeting). Persist the
    // taint, meta only: the sweep exempts tainted chats, and pass B re-runs
    // this route fresh so the user message still appends exactly once.
    const markGenerating = () => {
      if (!meta.tainted) saveChat(fsx, id, touch({ ...meta, tainted: true }), chat.msgs);
    };
    // tool calls the model made land on the committed message's extra bag:
    // the flat trace (chip/dialog) and the interleaved parts (body rendering)
    // per-swipe generation facts (model, usage, timing). A message's extra
// describes its ACTIVE swipe only, so every swipe's own numbers ride this
// index-aligned array; null entries are swipes without generation data
// (client-cancelled commits, padded history from before this existed)
// Spend is only recorded when the engine actually had rates for the model.
// An unpriced generation carries NO cost — a stored 0 would read as "free"
// everywhere it is summed.
const genUsage = (reply) => {
  const u = reply.usage;
  if (!u || typeof u !== "object") return u;
  const { priced, costTotal, ...rest } = u;
  return priced === true ? { ...rest, costTotal } : rest;
};
// Forking a fork must not grow the title: every fork numbers off the SAME
// root name, so a chain reads "Tavern fork 2", "Tavern fork 3", never
// "Tavern fork fork fork". The number is the first free one across existing
// chats, so deleting fork 2 lets the next fork reclaim it.
const FORK_SUFFIX = /(?:\s*[—–-]?\s*fork(?:\s+\d+)?)+$/i;
const forkTitle = (fsx, title) => {
  const base = String(title || "Chat").replace(FORK_SUFFIX, "").trim() || "Chat";
  const taken = new Set();
  let files = [];
  try { files = fsx.list("chats").filter((f) => f.endsWith(".meta.json")); } catch {}
  for (const f of files) {
    let m = null;
    try { m = JSON.parse(fsx.read("chats/" + f)); } catch {}
    const t = m && typeof m.title === "string" ? m.title.trim() : "";
    if (!t.toLowerCase().startsWith(base.toLowerCase())) continue;
    const rest = t.slice(base.length);
    const hit = /^\s*[—–-]?\s*fork(?:\s+(\d+))?$/i.exec(rest);
    if (hit) taken.add(hit[1] ? Number(hit[1]) : 1);
  }
  let n = 1;
  while (taken.has(n)) n++;
  return n === 1 ? base + " fork" : base + " fork " + n;
};
const swipeMetaEntry = (reply) => ({ model: reply.model, usage: genUsage(reply), genMs: reply.genTimeMs ?? 0 });
const pushSwipeMeta = (extra, swipesLen, entry) => {
  // pad unknown/misaligned history with nulls so indices always match swipes
  const base = Array.isArray(extra?.swipeMeta) && extra.swipeMeta.length === swipesLen - 1
    ? extra.swipeMeta.slice()
    : Array.from({ length: Math.max(0, swipesLen - 1) }, () => null);
  base.push(entry ?? null);
  return { ...extra, swipeMeta: base };
};
// models echo the speaker's own name at the start of a reply ("Aria:"). Strip that
// echo whether or not names ride the prompt: only at the very start, once,
// case-insensitive, as Name: / Name : / **Name:** / **Name**: / *Name:* / *Name*: /
// __Name:__ / _Name:_. The name is matched literally. Same rule as hideEchoedName
// in src/lib/echo-name.ts (plugins cannot import from src/): keep the two in step.
const stripEchoedName = (text, name) => {
  const t = String(text || "");
  const n = String(name || "").trim();
  if (!n) return t;
  const body = t.trimStart();
  const at = (form) => body.slice(0, form.length).toLowerCase() === form.toLowerCase();
  for (const form of ["**" + n + ":**", "**" + n + "**:", "*" + n + ":*", "*" + n + "*:", "__" + n + ":__", "_" + n + ":_"]) {
    if (at(form)) return body.slice(form.length).trimStart();
  }
  if (!at(n)) return t;
  let i = n.length;
  while (body[i] === " " || body[i] === "\t") i++;
  return body[i] === ":" ? body.slice(i + 1).trimStart() : t;
};
const toolX = (r) => ({
      ...(Array.isArray(r.toolTrace) && r.toolTrace.length ? { tools: r.toolTrace } : {}),
      ...(Array.isArray(r.parts) && r.parts.length ? { parts: r.parts } : {}),
    });

    if (!op && req.method === "GET") {
      // litopysCut: how many of the first messages the prompt leaves to Litopys now (the UI marks them)
      const line = litopysLine(chat.msgs);
      const count = litopysCut(fsx, meta.id, line);
      const litCut = { count, upTo: count > 0 ? line[count - 1].id : null };
      return ok({ meta: { ...meta, litopysCut: litCut }, messages: chat.msgs, members: members.map((m) => ({ id: m.id, name: m.name })) });
    }

    if (!op && req.method === "PATCH") {
      const b = body();
      // no-op guard: the client PATCHes lorebookIds before EVERY generation on
      // book-bound chats — an identical write still touches the file, fires
      // look_changed, and the client's hydrate wipes its staged streaming
      // bubble mid-generation. Nothing changed → no write, no event.
      const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
      const keys = ["title", "presetId", "personaId", "model", "authorNote", "lorebookIds", "userName", "characterId", "groupId",
        "authorNoteObject", "folderId", "chatTags", "backgroundId", "temporary",
        "fieldVariantSelection", "parentChatId", "parentMessageId"];
      if (keys.every((k) => !(k in b) || same(b[k], meta[k]))) return ok(meta);
      const prevPersonaId = meta.personaId;
      for (const k of keys) {
        if (k in b) meta[k] = b[k];
      }
      // switching personas only affects NEW messages ({{user}}, staged turns):
      // past user messages keep the name they were sent under — a chat can
      // mix personas, so history is never rewritten
      if ("personaId" in b && b.personaId !== prevPersonaId) {
        const persona = b.personaId ? readJson("personas/" + b.personaId + ".json", null) : null;
        if (persona && persona.name) meta.userName = persona.name;
      }
      // Settings and automatic binding repairs do not represent chat activity.
      writeJson("chats/" + id + ".meta.json", meta);
      return ok(meta);
    }

    if (op === "fork" && req.method === "POST") {
      const b = body();
      const idx = typeof b.messageId === "string" && b.messageId ? chat.msgs.findIndex((m) => m.id === b.messageId) : chat.msgs.length - 1;
      if (idx < 0) return err(404, "message not found");
      const nid = uid("c");
      const nmeta = { ...meta, id: nid, title: forkTitle(fsx, meta.title), createdAt: Date.now(), updatedAt: Date.now(),
        // branch parentage — the UI's branch tree walks these
        parentChatId: id, parentMessageId: b.messageId || null };
      delete nmeta.tainted;
      for (const k of OLD_MEMORY_KEYS) delete nmeta[k];
      const msgs = chat.msgs.slice(0, idx + 1).map((m) => ({ ...m }));
      saveChat(fsx, nid, nmeta, msgs);
      return ok({ meta: nmeta, messages: msgs }, 201);
    }

    if (!op && req.method === "DELETE") {
      try { fsx.remove("chats/" + id + ".jsonl"); } catch {}
      try { fsx.remove("chats/" + id + ".meta.json"); } catch {}
      // the facts vault belongs to the chat
      try { fsx.remove("chats/" + id + ".memories.json"); } catch {}
      return ok({ ok: true });
    }

    // send: append user message; solo + group(list/natural) auto-reply.
    // An EMPTY text (a bare "continue" send) generates a reply
    // with no user turn — nothing is written into the transcript.
    if (op === "send" && req.method === "POST") {
      const b = body();
      const typed = String(b.text || "").trim();
      if (!typed && b.allowEmpty !== true) return err(400, "text required");
      const text = typed ? onSave(typed, "user_input", members[0] || null).trim() : "";
      const reply = host.llm.results.reply;
      const userMsg = text ? {
        id: uid(), name: chatUserName(fsx, meta), charId: null, role: "user",
        ...(chatPersona(fsx, meta).personaId ? { personaId: chatPersona(fsx, meta).personaId } : {}),
        text, at: Date.now(), swipes: [text], swipe: 0,
        // attachments (data-URL images/files) ride on the stored message
        ...(Array.isArray(body().attachments) && body().attachments.length ? { attachments: body().attachments } : {}),
      } : null;
      // manual-trigger groups: user message only, no generation
      if (group && group.mode === "manual") {
        if (!userMsg) return err(400, "nothing to send");
        chat.msgs.push(userMsg);
        applyStashVars(req, meta);
      saveChat(fsx, id, touch({ ...meta, tainted: true }), chat.msgs);
        return ok({ user: userMsg, reply: null });
      }
      if (!reply) {
        // PASS A: stage the user message + request; NO writes
        let speaker = members[0] || null;
        // a group turn is planned once, here; pass B and the follow-up
        // replies the client runs read the plan from the stash
        let plan = null;
        if (group) {
          const lastChar = [...chat.msgs].reverse().find((m) => m.role === "char" && !m.picture);
          plan = groupTurnPlan(group, members, lastChar ? lastChar.charId : null, text).map((m) => m.id);
          speaker = members.find((m) => m.id === plan[0]) || null;
        }
        if (!speaker) return err(400, "chat has no participating characters");
        const staged = userMsg ? [...chat.msgs, userMsg] : chat.msgs;
        // semantic prep: when memory vectors or vectorized entries exist,
        // embed the scan window (+ uncached entries) first — one extra pass
        const sp = semanticPrep(host, fsx, meta, staged, text, req);
        if (sp.pending) { markGenerating(); return sp.pending; }
        const a = assemble(fsx, meta, staged, speaker, text, { limits: limitsOf(body()), scanVec: sp.scanVec, gen: "send" });
        host.llm.request("reply", {
          sessionId: id,
          messages: a.messages,
          systemPrompt: a.systemPrompt,
          ...(modelOf() ? { model: modelOf() } : {}),
          ...(a.presetParams && Object.keys(a.presetParams).length ? { presetParams: a.presetParams } : {}),
          ...(a.reasoning ? { reasoning: a.reasoning } : {}),
          ...(a.reasoningTags ? { reasoningTags: a.reasoningTags } : {}),
          ...(a.thinkingBudget ? { thinkingBudget: a.thinkingBudget } : {}),
          ...(a.promptFormat ? { promptFormat: a.promptFormat } : {}),
          ...(a.paramsSource ? { paramsSource: a.paramsSource } : {}),
          ...(a.assistantPrefill ? { assistantPrefill: a.assistantPrefill } : {}),
          wantsTools: true,
          stream: { chatId: id, name: speaker ? speaker.name : "" },
          // who speaks and what kind of turn, for llmRequest hooks (never sent to the model)
          turn: { op: "send", chatId: id, speakerId: speaker ? speaker.id : "", speakerName: speaker ? speaker.name : "" },
        });
        markGenerating();
        return pendingOut(meta, a.trimmed || plan ? { ...(a.trimmed ? { trimmed: a.trimmed } : {}), ...(plan ? { plan } : {}) } : undefined);
      }
      // PASS B: commit
      // A failed model call must not eat the user's turn: the user message is
      // truth and the reply is derived, so it commits alone and the 503 names
      // the real cause (content filter, bad key, …). The client's refresh then
      // lands the user bubble instead of wiping its staged copy.
      if (reply.model === "error") {
        if (userMsg) {
          chat.msgs.push(userMsg);
          applyStashVars(req, meta);
          saveChat(fsx, id, touch({ ...meta, tainted: true }), chat.msgs);
        }
        return err(503, llmFailReason(reply));
      }
      if (userMsg) chat.msgs.push(userMsg);
      let speaker = members[0] || null;
      let replyText = String(reply.text || "").trim();
      // fast mode: the state report ends the reply; it is not part of the story
      const stateTag = cutReply(reply);
      replyText = stateTag.text;
      const plan = group && req.stash && Array.isArray(req.stash.plan) ? req.stash.plan : null;
      if (group) speaker = (plan && members.find((m) => m.id === plan[0])) || null;
      if (!speaker) return err(400, "chat has no participating characters");
      replyText = stripEchoedName(replyText, speaker.name);
      // assistant prefill: the committed message starts with it (servers that
      // echo the trailing assistant turn are detected, not doubled)
      const prefill = reply.assistantPrefill;
      if (prefill && !replyText.startsWith(prefill)) replyText = prefill + replyText;
      replyText = onSave(replyText, "ai_output", speaker);
      // a thinking model may draft the state tag in its reasoning too
      if (reply.reasoning) reply.reasoning = onSave(cutStateTag(reply.reasoning).text, "reasoning", speaker);
      const charMsg = {
        id: uid(), name: speaker.name, charId: speaker.id, role: "char",
        text: replyText, at: Date.now(), swipes: [replyText], swipe: 0,
        extra: { model: reply.model, usage: genUsage(reply), genMs: reply.genTimeMs ?? 0, params: reply.requestParams ?? undefined, swipeMeta: [swipeMetaEntry(reply)], ...toolX(reply), ...(reply.reasoning ? { reasoning: reply.reasoning } : {}), ...(reply.reasoningTimeMs ? { reasoningMs: reply.reasoningTimeMs } : {}) },
      };
      chat.msgs.push(charMsg);
      applyStashVars(req, meta);
      saveChat(fsx, id, touch({ ...meta, tainted: true }), chat.msgs);
      saveFastState(fsx, id, charMsg.id + "#0", stateTag, reply.model);
      return ok({
        user: userMsg, reply: charMsg,
        // history the context could not hold this turn (auto-compaction's cue)
        ...(req.stash && req.stash.trimmed ? { trimmed: req.stash.trimmed } : {}),
        // the rest of this group turn: members the client runs next, in order
        ...(plan && plan.length > 1 ? { queue: plan.slice(1) } : {}),
      });
    }

    // group: force a specific member to speak now
    if (op === "next" && req.method === "POST") {
      if (!group) return err(400, "not a group chat");
      const b = body();
      const speaker = members.find((m) => m.id === b.charId) || null;
      if (!speaker) return err(400, "charId must be a member of this group");
      const reply = host.llm.results.reply;
      if (!reply) {
        const sp = semanticPrep(host, fsx, meta, chat.msgs, "", req);
        if (sp.pending) { markGenerating(); return sp.pending; }
        const a = assemble(fsx, meta, chat.msgs, speaker, null, { limits: limitsOf(body()), scanVec: sp.scanVec });
        host.llm.request("reply", {
          sessionId: id,
          messages: a.messages,
          systemPrompt: a.systemPrompt,
          ...(modelOf() ? { model: modelOf() } : {}),
          ...(a.presetParams && Object.keys(a.presetParams).length ? { presetParams: a.presetParams } : {}),
          ...(a.reasoning ? { reasoning: a.reasoning } : {}),
          ...(a.reasoningTags ? { reasoningTags: a.reasoningTags } : {}),
          ...(a.thinkingBudget ? { thinkingBudget: a.thinkingBudget } : {}),
          ...(a.promptFormat ? { promptFormat: a.promptFormat } : {}),
          ...(a.paramsSource ? { paramsSource: a.paramsSource } : {}),
          ...(a.assistantPrefill ? { assistantPrefill: a.assistantPrefill } : {}),
          wantsTools: true,
          stream: { chatId: id, name: speaker.name },
          turn: { op: "next", chatId: id, speakerId: speaker.id, speakerName: speaker.name },
        });
        markGenerating();
        return pendingOut(meta, a.trimmed ? { trimmed: a.trimmed } : undefined);
      }
      if (reply.model === "error") return err(503, llmFailReason(reply));
      const stateTag = cutReply(reply);
      let replyText = stripEchoedName(stateTag.text, speaker.name);
      const prefill = reply.assistantPrefill;
      if (prefill && !replyText.startsWith(prefill)) replyText = prefill + replyText;
      replyText = onSave(replyText, "ai_output", speaker);
      // a thinking model may draft the state tag in its reasoning too
      if (reply.reasoning) reply.reasoning = onSave(cutStateTag(reply.reasoning).text, "reasoning", speaker);
      const charMsg = {
        id: uid(), name: speaker.name, charId: speaker.id, role: "char",
        text: replyText, at: Date.now(), swipes: [replyText], swipe: 0,
        extra: { model: reply.model, usage: genUsage(reply), genMs: reply.genTimeMs ?? 0, params: reply.requestParams ?? undefined, swipeMeta: [swipeMetaEntry(reply)], ...toolX(reply), ...(reply.reasoning ? { reasoning: reply.reasoning } : {}), ...(reply.reasoningTimeMs ? { reasoningMs: reply.reasoningTimeMs } : {}) },
      };
      chat.msgs.push(charMsg);
      applyStashVars(req, meta);
      saveChat(fsx, id, touch({ ...meta, tainted: true }), chat.msgs);
      saveFastState(fsx, id, charMsg.id + "#0", stateTag, reply.model);
      return ok({ reply: charMsg, ...(req.stash && req.stash.trimmed ? { trimmed: req.stash.trimmed } : {}) });
    }

    // swipe: navigate existing swipes on the last char message; generate new
    // when pushing past the end (greeting cycles without a model call)
    if (op === "swipe" && req.method === "POST") {
      const dir = body().dir === -1 ? -1 : 1;
      const idx = (() => {
        for (let i = chat.msgs.length - 1; i >= 0; i--) if (chat.msgs[i].role === "char" && !chat.msgs[i].picture) return i;
        return -1;
      })();
      if (idx < 0) return err(400, "no character message to swipe");
      const msg = chat.msgs[idx];
      const swipes = msg.swipes && msg.swipes.length ? msg.swipes : [msg.text];
      const cur = msg.swipe || 0;
      const next = cur + dir;
      // navigate existing swipes (greeting rotation wraps on pristine chats)
      const pristineGreeting = !meta.tainted && chat.msgs.length === 1 && msg.greeting === true;
      if (next >= 0 && next < swipes.length) {
        const text = expandMacros(String(swipes[next]), transcriptMacros(chat.msgs, { userName: chatUserName(fsx, meta), charName: msg.name, personaText: "", chatId: id, vars: meta.chatVars || (meta.chatVars = {}) }));
        chat.msgs[idx] = { ...msg, text, swipe: next, swipes, translation: undefined };
        saveChat(fsx, id, touch(meta), chat.msgs);
        return ok({ message: chat.msgs[idx], swipe: next, count: swipes.length });
      }
      if (pristineGreeting && (next < 0 || next >= swipes.length)) {
        const wrapped = ((next % swipes.length) + swipes.length) % swipes.length;
        const text = expandMacros(String(swipes[wrapped]), transcriptMacros(chat.msgs, { userName: chatUserName(fsx, meta), charName: msg.name, personaText: "", chatId: id, vars: meta.chatVars || (meta.chatVars = {}) }));
        chat.msgs[idx] = { ...msg, text, swipe: wrapped, swipes, translation: undefined };
        saveChat(fsx, id, touch(meta), chat.msgs);
        return ok({ message: chat.msgs[idx], swipe: wrapped, count: swipes.length });
      }
      if (dir !== 1) return err(400, "no earlier swipe");
      // generate a fresh swipe (two-phase) from history WITHOUT this message
      const reply = host.llm.results.reply;
      const before = chat.msgs.slice(0, idx);
      const speaker = members.find((m) => m.id === msg.charId) || members[0] || null;
      if (!speaker) return err(400, "speaker character missing");
      if (!reply) {
        const sp = semanticPrep(host, fsx, meta, before, "", req);
        if (sp.pending) { markGenerating(); return sp.pending; }
        const a = assemble(fsx, meta, before, speaker, null, { limits: limitsOf(body()), scanVec: sp.scanVec, gen: "swipe" });
        host.llm.request("reply", {
          sessionId: id,
          messages: a.messages,
          systemPrompt: a.systemPrompt,
          ...(modelOf() ? { model: modelOf() } : {}),
          ...(a.presetParams && Object.keys(a.presetParams).length ? { presetParams: a.presetParams } : {}),
          ...(a.reasoning ? { reasoning: a.reasoning } : {}),
          ...(a.reasoningTags ? { reasoningTags: a.reasoningTags } : {}),
          ...(a.thinkingBudget ? { thinkingBudget: a.thinkingBudget } : {}),
          ...(a.promptFormat ? { promptFormat: a.promptFormat } : {}),
          ...(a.paramsSource ? { paramsSource: a.paramsSource } : {}),
          ...(a.assistantPrefill ? { assistantPrefill: a.assistantPrefill } : {}),
          wantsTools: true,
          stream: { chatId: id, name: msg.name },
          turn: { op: "swipe", chatId: id, speakerId: speaker.id, speakerName: speaker.name, targetId: msg.id },
        });
        markGenerating();
        return pendingOut(meta);
      }
      if (reply.model === "error") return err(503, llmFailReason(reply));
      const stateTag = cutReply(reply);
      let fresh = stripEchoedName(stateTag.text, msg.name);
      const swipPrefill = reply.assistantPrefill;
      if (swipPrefill && !fresh.startsWith(swipPrefill)) fresh = swipPrefill + fresh;
      fresh = onSave(fresh, "ai_output", speaker);
      // a thinking model may draft the state tag in its reasoning too
      if (reply.reasoning) reply.reasoning = onSave(cutStateTag(reply.reasoning).text, "reasoning", speaker);
      swipes.push(fresh);
      chat.msgs[idx] = { ...msg, text: fresh, swipe: swipes.length - 1, swipes, translation: undefined, extra: pushSwipeMeta({ model: reply.model, usage: genUsage(reply), genMs: reply.genTimeMs ?? 0, params: reply.requestParams ?? undefined, ...toolX(reply), ...(reply.reasoning ? { reasoning: reply.reasoning } : {}), ...(reply.reasoningTimeMs ? { reasoningMs: reply.reasoningTimeMs } : {}) }, swipes.length, swipeMetaEntry(reply)) };
      applyStashVars(req, meta);
      saveChat(fsx, id, touch({ ...meta, tainted: true }), chat.msgs);
      saveFastState(fsx, id, msg.id + "#" + (swipes.length - 1), stateTag, reply.model);
      return ok({ message: chat.msgs[idx], swipe: swipes.length - 1, count: swipes.length });
    }

    // cancelled: the client aborted a generation and owns what survived — it
    // froze the exact on-screen bytes and commits them here. The engine's own
    // completion for that generation was discarded, so this is the ONLY
    // writer. body: { text, parts?, userText?, attachments?, targetMessageId?,
    // expectedSwipes? } — a fresh send carries its staged user message; an
    // in-place regen targets the message and appends the swipe (guarded by
    // expectedSwipes so a commit that snuck in before the abort 409s instead
    // of double-writing)
    if (op === "cancelled" && req.method === "POST") {
      const b = body();
      const cancelSpeaker = members.find((m) => m.id === (chat.msgs.find((x) => x.id === b.targetMessageId) || {}).charId) || members[0] || null;
      // the client froze what it showed, which may still carry the state tag: cut it, keep nothing of it
      const text = onSave(stripEchoedName(cutStateTag(String(b.text ?? "")).text, cancelSpeaker ? cancelSpeaker.name : undefined), "ai_output", cancelSpeaker);
      const parts = Array.isArray(b.parts) ? cutPartsTag(b.parts).parts : null;
      if (!text.trim() && !(parts && parts.length)) return err(400, "nothing to keep");
      let idx = -1;
      if (b.targetMessageId) {
        idx = chat.msgs.findIndex((m) => m.id === b.targetMessageId);
        if (idx < 0) return err(409, "target message changed");
        const msg = chat.msgs[idx];
        const swipes = msg.swipes && msg.swipes.length ? msg.swipes : [msg.text];
        if (b.expectedSwipes != null && swipes.length !== b.expectedSwipes) return err(409, "a generation already committed");
        swipes.push(text);
        const cancelledMs = Number(b.genMs) || 0;
        const cancelledModel = typeof b.model === "string" && b.model ? b.model : "";
        // the cancelled partial owns its own facts; the message-level extra
        // describes the ACTIVE swipe, so the replaced generation's
        // usage/timing/reasoning must not leak onto it
        chat.msgs[idx] = { ...msg, text, swipe: swipes.length - 1, swipes, translation: undefined, extra: pushSwipeMeta({ ...msg.extra, model: cancelledModel, genMs: cancelledMs, usage: undefined, params: undefined, reasoning: undefined, reasoningMs: undefined, tools: undefined, ...(parts && parts.length ? { parts } : {}) }, swipes.length, { genMs: cancelledMs, ...(cancelledModel ? { model: cancelledModel } : {}) }) };
      } else {
        const userText = typeof b.userText === "string" ? onSave(b.userText.trim(), "user_input", members[0] || null).trim() : "";
        if (userText) {
          chat.msgs.push({
            id: uid(), name: chatUserName(fsx, meta), charId: null, role: "user",
            ...(chatPersona(fsx, meta).personaId ? { personaId: chatPersona(fsx, meta).personaId } : {}),
            text: userText, at: Date.now(), swipes: [userText], swipe: 0,
            ...(Array.isArray(b.attachments) && b.attachments.length ? { attachments: b.attachments } : {}),
          });
        }
        const speaker = members[0] || null;
        if (!speaker) return err(400, "chat has no participating characters");
        const cancelledMs = Number(b.genMs) || 0;
        const cancelledModel = typeof b.model === "string" && b.model ? b.model : "";
        chat.msgs.push({
          id: uid(), name: speaker.name, charId: speaker.id, role: "char",
          text, at: Date.now(), swipes: [text], swipe: 0,
          extra: { ...(parts && parts.length ? { parts } : {}), genMs: cancelledMs, ...(cancelledModel ? { model: cancelledModel } : {}) },
        });
      }
      applyStashVars(req, meta);
      saveChat(fsx, id, touch({ ...meta, tainted: true }), chat.msgs);
      return ok({ ok: true });
    }

    // continue: extend the last char message
    if (op === "continue" && req.method === "POST") {
      const idx = (() => {
        for (let i = chat.msgs.length - 1; i >= 0; i--) if (chat.msgs[i].role === "char" && !chat.msgs[i].picture) return i;
        return -1;
      })();
      if (idx < 0) return err(400, "no character message to continue");
      const msg = chat.msgs[idx];
      const speaker = members.find((m) => m.id === msg.charId) || members[0] || null;
      if (!speaker) return err(400, "speaker character missing");
      const reply = host.llm.results.reply;
      if (!reply) {
        const sp = semanticPrep(host, fsx, meta, chat.msgs, "", req);
        if (sp.pending) { markGenerating(); return sp.pending; }
        const a = assemble(fsx, meta, chat.msgs, speaker, null, { limits: limitsOf(body()), scanVec: sp.scanVec, gen: "continue" });
        // continue nudge: preset utility prompt (blank = plain continue, no
        // nudge appended — no hidden default text)
        const preset = readJson("presets/" + (meta.presetId || "default") + ".json", null);
        const utilMacros = (t) => String(t)
          .replace(/\{\{user\}\}/g, chatUserName(fsx, meta))
          .replace(/\{\{char\}\}/g, (members[0] && members[0].name) || "");
        const nudge = preset && preset.utilityPrompts ? String(preset.utilityPrompts.continueNudge || "").trim() : "";
        // continuing an existing reply — a prefill turn would land mid-message, drop it
        const contMsgs = a.assistantPrefill ? a.messages.slice(0, -1) : a.messages;
        // Continue prefill (on by default): the partial reply already rides as
        // the trailing assistant turn, so NO nudge — the model picks up
        // mid-sentence exactly where it stopped. Off appends the nudge turn.
        const contPrefill = !(preset && preset.studio && preset.studio.continuePrefill === false);
        host.llm.request("reply", {
          sessionId: id,
          messages: nudge && !contPrefill ? [...contMsgs, { role: "user", content: utilMacros(nudge) }] : contMsgs,
          systemPrompt: a.systemPrompt,
          ...(modelOf() ? { model: modelOf() } : {}),
          ...(a.presetParams && Object.keys(a.presetParams).length ? { presetParams: a.presetParams } : {}),
          ...(a.reasoning ? { reasoning: a.reasoning } : {}),
          ...(a.reasoningTags ? { reasoningTags: a.reasoningTags } : {}),
          ...(a.thinkingBudget ? { thinkingBudget: a.thinkingBudget } : {}),
          ...(a.promptFormat ? { promptFormat: a.promptFormat } : {}),
          ...(a.paramsSource ? { paramsSource: a.paramsSource } : {}),
          ...(a.assistantPrefill ? { assistantPrefill: a.assistantPrefill } : {}),
          wantsTools: true,
          stream: { chatId: id, name: msg.name },
          turn: { op: "continue", chatId: id, speakerId: speaker ? speaker.id : "", speakerName: msg.name, targetId: msg.id },
        });
        markGenerating();
        return pendingOut(meta);
      }
      if (reply.model === "error") return err(503, llmFailReason(reply));
      const extra = onSave(cutReply(reply).text, "ai_output", speaker);
      // the report of this reply (if one waits) no longer covers its text: the sensor reads it again
      dropFastState(fsx, id, msg.id + "#" + (msg.swipe || 0));
      // a thinking model may draft the state tag in its reasoning too
      if (reply.reasoning) reply.reasoning = onSave(cutStateTag(reply.reasoning).text, "reasoning", speaker);
      const merged = msg.text + (/\s$/.test(msg.text) ? "" : " ") + extra;
      const swipes = msg.swipes && msg.swipes.length ? msg.swipes.slice() : [msg.text];
      swipes[msg.swipe || 0] = merged;
      const contExtra = { ...msg.extra, model: reply.model, continued: true, params: reply.requestParams ?? undefined, ...toolX(reply), ...(reply.reasoning ? { reasoning: reply.reasoning } : {}), ...(reply.reasoningTimeMs ? { reasoningMs: reply.reasoningTimeMs } : {}) };
      if (Array.isArray(msg.extra?.swipeMeta) && msg.extra.swipeMeta.length === swipes.length) {
        contExtra.swipeMeta = msg.extra.swipeMeta.slice();
        contExtra.swipeMeta[msg.swipe || 0] = swipeMetaEntry(reply);
      }
      chat.msgs[idx] = { ...msg, text: merged, swipes, translation: undefined, extra: contExtra };
      applyStashVars(req, meta);
      saveChat(fsx, id, touch({ ...meta, tainted: true }), chat.msgs);
      return ok({ message: chat.msgs[idx] });
    }

    // image prompt: the chat's model reads the recent scene and writes what an
    // image model should draw. Nothing is written to the chat.
    if (op === "image-prompt" && req.method === "POST") {
      const b = body();
      const mode = IMAGE_PROMPT_MODES[b.mode] ? b.mode : "scene";
      const reply = host.llm.results.imgprompt;
      if (!reply) {
        const lastChar = [...chat.msgs].reverse().find((m) => m.role === "char" && !m.picture);
        const who = members.find((m) => lastChar && m.id === lastChar.charId) || members[0] || null;
        const { persona, userName } = chatPersona(fsx, meta);
        const charName = who ? who.name : "the character";
        const about = (name, text) => (String(text || "").trim() ? "About " + name + ":\n" + String(text).trim().slice(0, 3000) : "");
        const transcript = recentTranscript(chat.msgs, 12);
        const subject = typeof b.subject === "string" ? b.subject.trim().slice(0, 500) : "";
        const content = [
          IMAGE_PROMPT_MODES[mode].split("{{char}}").join(charName).split("{{user}}").join(userName),
          IMAGE_PROMPT_RULES,
          subject ? "The user asked for: " + subject : "",
          who && mode !== "user" && mode !== "background" ? about(charName, who.card && who.card.description) : "",
          mode === "user" || mode === "scene" ? about(userName, persona && persona.description) : "",
          transcript ? "Recent chat:\n" + transcript : "",
        ].filter(Boolean).join("\n\n");
        host.llm.request("imgprompt", { messages: [{ role: "user", content }], ...(modelOf() ? { model: modelOf() } : {}) });
        return pendingOut(meta);
      }
      if (reply.model === "error") return err(503, llmFailReason(reply));
      const prompt = String(reply.text || "")
        .replace(/^\s*(image\s+)?prompt\s*:\s*/i, "")
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500);
      if (!prompt) return err(502, "the model returned an empty description");
      return ok({ prompt, mode });
    }

    // append a finished message without generating anything (a picture the
    // user drew for the scene). Speaks as the chat's character unless a
    // member id is given; hidden messages stay out of the prompt.
    if (op === "messages" && !seg[3] && req.method === "POST") {
      const b = body();
      const speaker = b.role === "user" ? null : members.find((m) => m.id === b.charId) || members[0] || null;
      const text = onSave(String(b.text || "").trim().slice(0, 20000), speaker ? "ai_output" : "user_input", speaker || members[0] || null);
      const attachments = Array.isArray(b.attachments)
        ? b.attachments.filter((a) => a && typeof a.url === "string" && a.url).slice(0, 8)
        : [];
      if (!text && !attachments.length) return err(400, "text or attachments required");
      if (b.role !== "user" && !speaker) return err(400, "chat has no participating characters");
      const who = chatPersona(fsx, meta);
      const msg = {
        id: uid(), name: speaker ? speaker.name : who.userName, charId: speaker ? speaker.id : null,
        ...(!speaker && who.personaId ? { personaId: who.personaId } : {}),
        role: speaker ? "char" : "user", text, at: Date.now(), swipes: [text], swipe: 0,
        ...(b.hidden === true ? { hidden: true } : {}),
        ...(b.picture === true ? { picture: true } : {}),
        ...(attachments.length ? { attachments } : {}),
      };
      chat.msgs.push(msg);
      saveChat(fsx, id, touch({ ...meta, tainted: true }), chat.msgs);
      return ok({ message: msg }, 201);
    }

    // impersonate: draft the user's next message — NEVER written
    if (op === "impersonate" && req.method === "POST") {
      const reply = host.llm.results.reply;
      if (!reply) {
        // not marked generating: an impersonation never writes the transcript
        const sp = semanticPrep(host, fsx, meta, chat.msgs, "", req);
        if (sp.pending) return sp.pending;
        const a = assemble(fsx, meta, chat.msgs, members[0] || null, null, { limits: limitsOf(body()), scanVec: sp.scanVec, gen: "impersonate" });
        const un = chatUserName(fsx, meta);
        // impersonation prompt: preset utility prompt, macros expanded
        // (blank = impersonate from history alone — no hidden default text)
        const preset = readJson("presets/" + (meta.presetId || "default") + ".json", null);
        const imp = preset && preset.utilityPrompts
          ? String(preset.utilityPrompts.impersonation || "").trim()
            .replace(/\{\{user\}\}/g, un)
            .replace(/\{\{char\}\}/g, (members[0] && members[0].name) || "")
          : "";
        // impersonation writes the USER's turn — an assistant prefill turn has
        // no business here, drop it
        const impMsgs = a.assistantPrefill ? a.messages.slice(0, -1) : a.messages;
        host.llm.request("reply", {
          sessionId: id,
          turn: { op: "impersonate", chatId: id },
          messages: imp ? [...impMsgs, { role: "user", content: imp }] : impMsgs,
          systemPrompt: a.systemPrompt,
          ...(modelOf() ? { model: modelOf() } : {}),
          ...(a.presetParams && Object.keys(a.presetParams).length ? { presetParams: a.presetParams } : {}),
          ...(a.reasoning ? { reasoning: a.reasoning } : {}),
          ...(a.reasoningTags ? { reasoningTags: a.reasoningTags } : {}),
          ...(a.thinkingBudget ? { thinkingBudget: a.thinkingBudget } : {}),
          ...(a.promptFormat ? { promptFormat: a.promptFormat } : {}),
          ...(a.paramsSource ? { paramsSource: a.paramsSource } : {}),
          ...(a.assistantPrefill ? { assistantPrefill: a.assistantPrefill } : {}),
        });
        return pendingOut(meta);
      }
      if (reply.model === "error") return err(503, llmFailReason(reply));
      let text = String(reply.text || "").trim();
      const un = chatUserName(fsx, meta) + ":";
      text = text.replace(new RegExp("^" + esc(un)), "");
      return ok({ text: onSave(text.trim(), "user_input", members[0] || null).trim() });
    }

    // message edit (text) or flag flips (hide-from-AI, bookmarks)
    if (op === "messages" && seg[3] && !seg[4] && req.method === "PATCH") {
      const mid = seg[3];
      const idx = chat.msgs.findIndex((m) => m.id === mid);
      if (idx < 0) return err(404, "message not found");
      const b = body();
      const msg = chat.msgs[idx];
      let next = { ...msg };
      if (typeof b.text === "string" && b.text.trim()) {
        // scripts opted into edit-time rewriting clean the stored text itself
        // (the edit is an explicit user action — destructive by nature)
        const speaker = members.find((x) => x.id === msg.charId) || members[0] || null;
        const text = runRegexScripts(
          loadRegexScripts(fsx), meta, members, b.text,
          [msg.role === "user" ? "user_input" : "ai_output"], null, saveMacros(fsx, meta, chat.msgs, speaker), "edit",
        );
        const swipes = msg.swipes && msg.swipes.length ? msg.swipes.slice() : [msg.text];
        swipes[msg.swipe || 0] = text;
        next = { ...next, text, swipes, edited: true, translation: undefined };
      }
      // a message's translation dies with its text: every route that swaps
      // the displayed text (edit, swipe switch/append, continue, cancel
      // commit) drops it so a stale translation never rides a new text
      if (typeof b.translation === "string") next.translation = b.translation; // inline translation
      if (b.translation === null) delete next.translation;
      // reasoning edits are SEPARATE from the reply text: the model's
      // thinking is editable on its own (active swipe's reasoning, or one
      // think segment of a tool-using reply's parts)
      if (typeof b.reasoning === "string") {
        const extra = { ...next.extra };
        if (b.reasoning.trim()) extra.reasoning = b.reasoning;
        else delete extra.reasoning;
        next = { ...next, extra };
      }
      if (b.think && typeof b.think.index === "number" && typeof b.think.text === "string" && Array.isArray(next.extra?.parts)) {
        const parts = next.extra.parts.map((p, i) => (i === b.think.index && p && p.type === "thinking" ? { ...p, text: b.think.text } : p));
        next = { ...next, extra: { ...next.extra, parts } };
      }
      if ("hidden" in b) next.hidden = b.hidden === true;
      if ("bookmarked" in b) next.bookmarked = b.bookmarked === true;
      if ("bookmarkLabel" in b) next.bookmarkLabel = b.bookmarkLabel;
      chat.msgs[idx] = next;
      applyStashVars(req, meta);
      saveChat(fsx, id, touch({ ...meta, tainted: true }), chat.msgs);
      return ok({ message: next });
    }

    // message delete: single, truncate-below (?scope=below) or truncate-above.
    // (!seg[4]: sub-routes like /swipes/:idx DELETE are matched further down)
    if (op === "messages" && seg[3] && !seg[4] && req.method === "DELETE") {
      const mid = seg[3];
      const scope = req.query && req.query.scope;
      const idx = chat.msgs.findIndex((m) => m.id === mid);
      if (idx < 0) return err(404, "message not found");
      // below keeps the anchor — only what comes after it dies
      const kept = scope === "below" ? chat.msgs.slice(0, idx + 1) : scope === "above" ? chat.msgs.slice(idx) : chat.msgs.filter((_, i) => i !== idx);
      saveChat(fsx, id, touch({ ...meta, tainted: true }), kept);
      return ok({ ok: true, remaining: kept.length });
    }

    // set the active swipe on ANY message (the swipe-picker modal); greetings
    // re-run macros exactly like the chevron navigation does
    if (op === "messages" && seg[3] && seg[4] === "swipe" && req.method === "POST") {
      const mid = seg[3];
      const idx = chat.msgs.findIndex((m) => m.id === mid);
      if (idx < 0) return err(404, "message not found");
      const msg = chat.msgs[idx];
      const swipes = msg.swipes && msg.swipes.length ? msg.swipes : [msg.text];
      const want = Math.floor(Number(body().index));
      if (!(want >= 0 && want < swipes.length)) return err(400, "swipe index out of range");
      const text = expandMacros(String(swipes[want]), transcriptMacros(chat.msgs, { userName: chatUserName(fsx, meta), charName: msg.name, personaText: "", chatId: id, vars: meta.chatVars || (meta.chatVars = {}) }));
      chat.msgs[idx] = { ...msg, text, swipe: want, swipes, translation: undefined };
      saveChat(fsx, id, touch(meta), chat.msgs);
      return ok({ message: chat.msgs[idx], swipe: want, count: swipes.length });
    }

    // delete one swipe variant from a message
    if (op === "messages" && seg[3] && seg[4] === "swipes" && seg[5] && req.method === "DELETE") {
      const mid = seg[3];
      const sidx = Math.floor(Number(seg[5]));
      const idx = chat.msgs.findIndex((m) => m.id === mid);
      if (idx < 0) return err(404, "message not found");
      const msg = chat.msgs[idx];
      const swipes = msg.swipes && msg.swipes.length ? msg.swipes.slice() : [msg.text];
      if (swipes.length <= 1) return err(400, "cannot delete the only swipe");
      if (!(sidx >= 0 && sidx < swipes.length)) return err(400, "swipe index out of range");
      swipes.splice(sidx, 1);
      const swipe = Math.min(msg.swipe || 0, swipes.length - 1);
      const metaLeft = Array.isArray(msg.extra?.swipeMeta) && msg.extra.swipeMeta.length === swipes.length + 1 ? msg.extra.swipeMeta.slice() : null;
      if (metaLeft) metaLeft.splice(sidx, 1);
      chat.msgs[idx] = { ...msg, swipes, swipe, text: swipes[swipe], translation: undefined, extra: metaLeft ? { ...msg.extra, swipeMeta: metaLeft } : msg.extra };
      saveChat(fsx, id, touch(meta), chat.msgs);
      return ok({ message: chat.msgs[idx], swipe, count: swipes.length });
    }

    // move a message up/down one position (message hover menu)
    if (op === "messages" && seg[3] && seg[4] === "move" && req.method === "POST") {
      const mid = seg[3];
      const dir = body().dir === -1 ? -1 : 1;
      const idx = chat.msgs.findIndex((m) => m.id === mid);
      const to = idx + dir;
      if (idx < 0) return err(404, "message not found");
      if (to < 0 || to >= chat.msgs.length) return err(400, "cannot move past the end");
      const msgs = chat.msgs.slice();
      const tmp = msgs[idx]; msgs[idx] = msgs[to]; msgs[to] = tmp;
      saveChat(fsx, id, touch({ ...meta, tainted: true }), msgs);
      return ok({ ok: true });
    }

    // delete all messages (chat reset — keeps the chat, reseeds greeting)
    if (op === "reset" && req.method === "POST") {
      let msgs = [];
      if (meta.characterId) {
        const card = readJson("characters/" + meta.characterId + "/card.json", null);
        if (card) {
          const greetings = cardGreetings(fsx, meta, meta.characterId, card);
          if (greetings.length) {
            const g = expandMacros(greetings[0], transcriptMacros([], { userName: chatUserName(fsx, meta), charName: card.name, personaText: "", chatId: id, vars: meta.chatVars || (meta.chatVars = {}) }));
            msgs = [{ id: uid(), name: card.name, charId: meta.characterId, role: "char", text: g, at: Date.now(), swipes: greetings, swipe: 0, greeting: true }];
          }
        }
      }
      const fresh = { ...meta, tainted: undefined };
      delete fresh.tainted;
      saveChat(fsx, id, touch(fresh), msgs);
      return ok({ meta: fresh, messages: msgs });
    }
  }

  return null; // unmatched
}

export const TOOLS = [];
