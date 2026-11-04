/**
 * Polish my message (GitHub #15).
 *
 * POST /polish/chats/:id { text, model? } runs the player's draft through the
 * chat's own model with an editing instruction and returns { text }. Nothing
 * is sent or stored: the composer puts the result back into the box, with an
 * Undo for the draft it replaced.
 *
 * Model: the one the page sends (the chat's model as the composer resolves
 * it), else the chat's saved model, else the app's default; with none set the
 * engine picks the user's default model.
 * Prompt: the preset's utility prompt `polish` (studio bag, else top level);
 * blank means DEFAULT_POLISH below, which src/lib/seed.ts mirrors as
 * DEFAULT_POLISH_PROMPT (a test keeps the two equal).
 *
 * Two-phase LLM, like every route here: the first pass calls
 * host.llm.request and returns { __llmPending, stash }; the engine runs the
 * call and re-runs the route with the reply in host.llm.results. A route's
 * answer is { status, json } — the engine drops any other shape.
 */

export const DEFAULT_POLISH =
  "You edit {{user}}'s next message in a roleplay before it is sent. Rewrite the draft so it reads well and can be sent as-is. " +
  "Fix spelling, grammar and punctuation. Make the prose more vivid: precise verbs, a sensory detail or two, a touch of feeling. " +
  "Keep every action, fact and spoken line of the draft, and keep its language, its person (I, he, she) and its tense. " +
  "Keep the formatting the draft and the story use, for example *actions* in asterisks and speech in quotes. " +
  "Write only for {{user}}: add no new events, do not decide how an action turns out, and never speak or act for other characters. " +
  "Keep it close to the draft's length, at most about twice as long. Output only the rewritten message, with no notes, title or quotes around it.";

const CHAT_ID = /^[A-Za-z0-9_-]{1,120}$/;
const MODEL_REF = /^[^\s]{1,200}$/;
const TEXT_MAX = 8000;
const CTX_MSGS = 6;
const CTX_MAX = 600;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v : "");
const cut = (s, n) => {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n) + "…" : t;
};
const ok = (json, status) => ({ status: status || 200, json });

function readJson(fsx, path, fallback) {
  try {
    const raw = fsx.read(path);
    if (raw == null || raw === "") return fallback;
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function chatPreset(fsx, meta) {
  let id = str(meta.presetId);
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
  id = id || "default";
  if (/[\\/]|^\.\.?$/.test(id)) return null;
  const preset = readJson(fsx, "presets/" + id + ".json", null);
  return isObj(preset) ? { ...preset, id: str(preset.id) || id } : null;
}

// ---------- the preset's own macros (#237) ----------
// COPY of plugins/engine/plugin.js (presetVariables ... expandIfBlocks): a plugin cannot import a sibling, and
// Polish must read the chat's picks the way the chat does. test/rp-polish-macros.test.ts checks the copy agrees
// with the engine; change both together.
const BUILTIN_MACROS = new Set(["user", "char", "persona", "description", "personality", "scenario", "time", "isotime", "date",
  "isodate", "weekday", "lastmessage", "lastusermessage", "lastcharmessage", "idle_duration", "summary", "words", "limit", "trim", "newline"]);

/** A preset's declared variables (studio bag) that have a usable name. */
function presetVariables(preset) {
  const list = preset && preset.studio && Array.isArray(preset.studio.variables) ? preset.studio.variables : [];
  return list.filter((v) => v && typeof v.name === "string" && /^[\w.-]+$/.test(v.name.trim()));
}

/** The options of a choice-like variable as {id, label, value}; null for free-form types.
 *  Older dropdown/multi variables list plain strings: each is its own id, label and value. */
function variableChoices(v) {
  if (v.type === "choice") {
    return (Array.isArray(v.choices) ? v.choices : [])
      .filter((c) => c && typeof c.id === "string" && c.id)
      .map((c) => ({ id: c.id, label: String(c.label || c.value || ""), value: String(c.value ?? "") }));
  }
  if (v.type === "dropdown" || v.type === "multi") {
    return (Array.isArray(v.options) ? v.options : []).map(String).filter(Boolean).map((o) => ({ id: o, label: o, value: o }));
  }
  return null;
}

const isMultiVar = (v) => v.type === "multi" || (v.type === "choice" && v.multi === true);

/** The choice ids a variable starts with: its defaults, else the first option of a single choice. */
function defaultPicks(v, choices) {
  const raw = v.type === "choice"
    ? (Array.isArray(v.defaults) ? v.defaults.map(String) : [])
    : (isMultiVar(v) ? String(v.defaultValue ?? "").split(",") : [String(v.defaultValue ?? "")]).map((x) => x.trim());
  const ids = raw.filter((id) => choices.some((c) => c.id === id));
  if (isMultiVar(v)) return ids;
  return ids.length ? ids.slice(0, 1) : choices.length ? [choices[0].id] : [];
}

/**
 * Every preset variable's value for one chat, by name: { value, picks }. picks lists the chosen
 * options of a choice-like variable ({id, label, value}), null for the others. The chat's picks
 * live in meta.presetVars[presetId]; a missing name, or only ids the preset no longer has, fall
 * back to the preset's defaults, so an edited preset never breaks a chat. `override` replaces
 * stored picks by name (an empty array = nothing picked).
 */
function resolvePresetVars(preset, meta, override) {
  const out = {};
  const pid = preset && preset.id ? String(preset.id) : "";
  const bag = pid && meta && meta.presetVars && typeof meta.presetVars === "object" ? meta.presetVars[pid] : null;
  const stored = { ...(bag && typeof bag === "object" ? bag : {}), ...(override || {}) };
  for (const v of presetVariables(preset)) {
    const name = v.name.trim();
    const has = Object.prototype.hasOwnProperty.call(stored, name) && stored[name] != null;
    const raw = has ? stored[name] : undefined;
    const choices = variableChoices(v);
    if (choices) {
      const asked = has ? (Array.isArray(raw) ? raw : [raw]).map(String) : null;
      let ids = asked ? asked.filter((id) => choices.some((c) => c.id === id)) : null;
      if (!ids || (!ids.length && asked.length)) ids = defaultPicks(v, choices);
      if (!isMultiVar(v)) ids = ids.slice(0, 1);
      const picks = ids.map((id) => choices.find((c) => c.id === id));
      out[name] = { value: picks.map((c) => c.value).join(typeof v.separator === "string" ? v.separator : ", "), picks };
    } else {
      out[name] = { value: has ? (Array.isArray(raw) ? raw.join(", ") : String(raw)) : String(v.defaultValue ?? ""), picks: null };
    }
  }
  return out;
}

/** A preset variable by name, exact first, then ignoring case. */
function presetVarOf(pv, name) {
  if (!pv) return null;
  const k = String(name).trim();
  if (Object.prototype.hasOwnProperty.call(pv, k)) return pv[k];
  const lk = k.toLowerCase();
  const f = Object.keys(pv).find((x) => x.toLowerCase() === lk);
  return f ? pv[f] : null;
}


// ---------- {{#if}} blocks ----------
const DQ = "\"“”„«»";
const SQ = "'‘’";

function condTokens(src) {
  const raw = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const cls = DQ.includes(ch) ? DQ : SQ.includes(ch) ? SQ : null;
    if (cls) {
      let j = i + 1;
      while (j < src.length && !cls.includes(src[j])) j++;
      raw.push({ t: "lit", v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "||" || two === "&&" || two === "==" || two === "!=") { raw.push({ t: two }); i += 2; continue; }
    if (ch === "(" || ch === ")" || ch === "!") { raw.push({ t: ch }); i++; continue; }
    if (ch === "=") { raw.push({ t: "==" }); i++; continue; }
    const m = /^[^\s()!=|&"'“”„«»‘’]+/.exec(src.slice(i));
    if (!m) { i++; continue; }
    const w = m[0].toLowerCase();
    if (w === "contains" || w === "includes") raw.push({ t: "contains" });
    else if (w === "and") raw.push({ t: "&&" });
    else if (w === "or") raw.push({ t: "||" });
    else if (w === "is") raw.push({ t: "==" });
    else if (w === "not") raw.push({ t: "not" });
    else raw.push({ t: "name", v: m[0] });
    i += m[0].length;
  }
  // "is not" / "not contains" fold into one operator; a lone "not" is "!"
  const out = [];
  for (let k = 0; k < raw.length; k++) {
    const a = raw[k], b = raw[k + 1];
    if (a.t === "==" && b && b.t === "not") { out.push({ t: "!=" }); k++; }
    else if (a.t === "not" && b && b.t === "contains") { out.push({ t: "!contains" }); k++; }
    else out.push(a.t === "not" ? { t: "!" } : a);
  }
  return out;
}

/**
 * One {{#if}} condition. Operands are names (lookup(name) -> {value, picks} | undefined) or quoted
 * literals; ==, !=, contains, not contains; ||, &&, !, parens; `a == "x" || "y"` repeats the last
 * comparison. A lone name is true when set and not false/0/no/off. Comparisons trim and ignore
 * case; a choice also matches by its label, and `contains` on a choice checks the picks.
 * Bad syntax is false.
 */
function evalIfCondition(src, lookup) {
  const tk = condTokens(String(src || ""));
  let p = 0;
  let last = null;
  const norm = (s) => String(s ?? "").trim().toLowerCase();
  const peek = () => tk[p];
  const operand = () => {
    const t = tk[p];
    if (!t || (t.t !== "lit" && t.t !== "name")) return null;
    p++;
    return t;
  };
  // a name nobody defines reads as its own text on the right of a comparison, as empty elsewhere
  const valueOf = (t, right) => {
    if (t.t === "lit") return { value: t.v, picks: null };
    return lookup(t.v) || { value: right ? t.v : "", picks: null };
  };
  const truthy = (v) => { const s = norm(v.value); return s !== "" && !["false", "0", "no", "off"].includes(s); };
  const compare = (left, op, rightRaw) => {
    const r = norm(rightRaw);
    const picks = left.picks;
    const eq = norm(left.value) === r || (!!picks && picks.length === 1 && (norm(picks[0].label) === r || norm(picks[0].value) === r));
    const has = picks ? picks.some((c) => norm(c.value) === r || norm(c.label) === r) : norm(left.value).includes(r);
    if (op === "==") return eq;
    if (op === "!=") return !eq;
    if (op === "contains") return has;
    return !has;
  };
  const primary = () => {
    const t = peek();
    if (!t) throw new Error("end");
    if (t.t === "(") {
      p++;
      const v = orExpr();
      if (!peek() || peek().t !== ")") throw new Error("paren");
      p++;
      return v;
    }
    const a = operand();
    if (!a) throw new Error("operand");
    const op = peek() && ["==", "!=", "contains", "!contains"].includes(peek().t) ? tk[p++].t : null;
    if (op) {
      const b = operand();
      if (!b) throw new Error("operand");
      const left = valueOf(a, false);
      last = { left, op };
      return compare(left, op, valueOf(b, true).value);
    }
    if (a.t === "lit" && last) return compare(last.left, last.op, a.v);
    return truthy(valueOf(a, false));
  };
  const unary = () => {
    if (peek() && peek().t === "!") { p++; return !unary(); }
    return primary();
  };
  const andExpr = () => {
    let v = unary();
    while (peek() && peek().t === "&&") { p++; const r = unary(); v = v && r; }
    return v;
  };
  function orExpr() {
    let v = andExpr();
    while (peek() && peek().t === "||") { p++; const r = andExpr(); v = v || r; }
    return v;
  }
  try {
    const v = orExpr();
    return p === tk.length ? v : false;
  } catch {
    return false;
  }
}

/** {{#if}}…{{else if}}…{{else}}…{{/if}}, nested, innermost first. A block standing on its own
 *  lines that renders nothing takes its line with it; a stray {{/if}} is dropped. */
function expandIfBlocks(text, lookup) {
  let out = String(text);
  if (!/\{\{\s*#if\s/i.test(out)) return out;
  for (let guard = 0; guard < 2000; guard++) {
    const close = /\{\{\s*\/if\s*\}\}/i.exec(out);
    if (!close) break;
    // the first {{/if}} closes the nearest {{#if}} before it
    let open = null;
    const re = /\{\{\s*#if\s+([\s\S]*?)\}\}/gi;
    for (let m = re.exec(out); m && m.index < close.index; m = re.exec(out)) open = m;
    if (!open) {
      out = out.slice(0, close.index) + out.slice(close.index + close[0].length);
      continue;
    }
    const body = out.slice(open.index + open[0].length, close.index);
    const branches = [];
    const sep = /\{\{\s*else(?:\s+if\s+([\s\S]*?))?\s*\}\}/gi;
    let cond = open[1];
    let from = 0;
    for (let s = sep.exec(body); s; s = sep.exec(body)) {
      branches.push({ cond, text: body.slice(from, s.index) });
      cond = s[1] === undefined ? null : s[1];
      from = s.index + s[0].length;
    }
    branches.push({ cond, text: body.slice(from) });
    const hit = branches.find((b) => b.cond === null || evalIfCondition(b.cond, lookup));
    const chosen = hit ? hit.text.replace(/^[ \t]*\r?\n/, "").replace(/\r?\n[ \t]*$/, "") : "";
    let start = open.index;
    let end = close.index + close[0].length;
    if (!chosen) {
      const lineStart = out.lastIndexOf("\n", start - 1) + 1;
      const nl = /^[ \t]*\r?\n/.exec(out.slice(end));
      if (!out.slice(lineStart, start).trim() && nl) { start = lineStart; end += nl[0].length; }
    }
    out = out.slice(0, start) + chosen + out.slice(end);
  }
  return out;
}

// ---------- end of the copy ----------

/** The Polish prompt with the chat's preset picks expanded the way the preset's sections are: {{#if}}, {{name}},
 *  {{var:name}}, {{getvar::name}} (the chat's variables first). {{user}} stays for the caller. */
export function expandPolish(text, preset, meta) {
  const m = isObj(meta) ? meta : {};
  const pv = resolvePresetVars(preset, m);
  const chatVars = isObj(m.chatVars) ? m.chatVars : {};
  const lookup = (name) => {
    const ln = String(name).toLowerCase();
    if (ln === "user" || ln === "char") return undefined;
    const v = presetVarOf(pv, name);
    if (v) return v;
    if (chatVars[name] != null) return { value: String(chatVars[name]), picks: null };
    return undefined;
  };
  let out = String(text || "");
  if (out.indexOf("{{") < 0) return out;
  out = expandIfBlocks(out, lookup);
  out = out.replace(/\{\{var::?([\w.-]+)\}\}/gi, (_, n) => { const v = presetVarOf(pv, n); return v ? v.value : ""; });
  out = out.replace(/\{\{([\w.-]+)\}\}/g, (all, n) => {
    if (BUILTIN_MACROS.has(n.toLowerCase())) return all;
    const v = presetVarOf(pv, n);
    return v ? v.value : all;
  });
  out = out.replace(/\{\{getvar::([^}]+)\}\}/gi, (_, n) => {
    const v = chatVars[n.trim()];
    if (v == null) { const p = presetVarOf(pv, n); return p ? p.value : ""; }
    return String(v);
  });
  return out;
}

export function polishTemplate(preset) {
  if (!isObj(preset)) return DEFAULT_POLISH;
  const bag = isObj(preset.studio) ? preset.studio.utilityPrompts : null;
  const top = preset.utilityPrompts;
  const t = str(isObj(bag) && bag.polish) || str(isObj(top) && top.polish);
  return t.trim() || DEFAULT_POLISH;
}

function userNameOf(fsx, meta) {
  if (str(meta.userName)) return str(meta.userName);
  if (meta.personaId && CHAT_ID.test(String(meta.personaId))) {
    const persona = readJson(fsx, "personas/" + meta.personaId + ".json", null);
    if (isObj(persona) && str(persona.name)) return str(persona.name);
  }
  return "";
}

function cardNames(fsx, meta) {
  let ids = [];
  if (typeof meta.groupId === "string" && meta.groupId) {
    const g = readJson(fsx, "groups/" + meta.groupId + ".json", null);
    if (isObj(g) && Array.isArray(g.memberIds)) ids = g.memberIds;
  } else if (typeof meta.characterId === "string" && meta.characterId) {
    ids = [meta.characterId];
  }
  const names = [];
  for (const id of ids) {
    if (typeof id !== "string" || !CHAT_ID.test(id)) continue;
    const card = readJson(fsx, "characters/" + id + "/card.json", null);
    const name = isObj(card) ? str(card.name) || (isObj(card.data) ? str(card.data.name) : "") : "";
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** The last few messages, so the polish keeps the story's tense, names and style. */
function recentContext(fsx, chatId) {
  let raw = "";
  try {
    raw = String(fsx.read("chats/" + chatId + ".jsonl") || "");
  } catch {
    return "";
  }
  const out = [];
  for (const line of raw.split("\n").filter((l) => l.trim()).slice(-CTX_MSGS)) {
    let m = null;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObj(m) || m.hidden === true || m.role === "system") continue;
    const text = str(m.text || m.mes);
    if (!text.trim()) continue;
    const who = m.role === "user" ? "player" : str(m.name) || "story";
    out.push(who + ": " + cut(text.replace(/\s+/g, " ").trim(), CTX_MAX));
  }
  return out.join("\n");
}

/** The page's model → the chat's saved model → the app default; "" lets the engine choose. */
function polishModel(fsx, meta, asked) {
  const settings = readJson(fsx, "settings.json", null);
  for (const m of [asked, str(meta.model), isObj(settings) ? str(settings.model) : ""]) {
    if (m && MODEL_REF.test(m)) return m;
  }
  return "";
}

/** The model's reply without reasoning, fences or a "Here is…" lead-in. */
export function cleanPolish(text) {
  let t = String(text || "")
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "")
    .trim();
  const fence = t.match(/^```[\w-]*\s*\n?([\s\S]*?)\n?```$/);
  if (fence) t = fence[1].trim();
  t = t
    .replace(/^(?:polished|rewritten|edited|improved) (?:message|draft|text|version)\s*:\s*/i, "")
    .replace(/^here(?:'s| is) (?:the |your )?(?:polished|rewritten|edited|improved) (?:message|draft|text|version)\s*:\s*/i, "")
    .trim();
  return t;
}

function polishRoute(req, host, chatId) {
  const fsx = host.fs;
  if (!CHAT_ID.test(chatId)) return ok({ error: "no such chat" }, 404);
  const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
  if (!isObj(meta)) return ok({ error: "no such chat" }, 404);
  const b = isObj(req.body) ? req.body : {};
  const text = str(b.text);
  if (!text.trim()) return ok({ error: "The draft is empty." }, 400);
  if (text.length > TEXT_MAX) return ok({ error: "The draft is too long to polish." }, 400);

  // second pass: the model's reply is waiting
  const r = host.llm && host.llm.results ? host.llm.results.polish : null;
  if (r) {
    if (r.error) {
      const msg = str(r.error.message) || str(r.error) || "The model call failed.";
      return ok({ error: cut(msg, 300) }, 502);
    }
    const cleaned = cleanPolish(r.text);
    if (!cleaned) return ok({ error: "The model returned an empty answer. Try again, or pick another model for this chat." }, 502);
    return ok({ text: cleaned, model: str(r.model) });
  }

  // first pass: ask the model
  const preset = chatPreset(fsx, meta);
  const userName = userNameOf(fsx, meta) || "User";
  // the chat's preset picks reach Polish too: a picked narrator, language or POV (#237)
  const system = expandPolish(polishTemplate(preset), preset, meta).split("{{user}}").join(userName);
  const names = cardNames(fsx, meta);
  const context = recentContext(fsx, chatId);
  const content =
    (names.length ? "Characters in this chat: " + names.join(", ") + ".\n" : "") +
    (context ? "Recent story, for its tense, names and style (do not rewrite it):\n" + context + "\n\n" : "") +
    "Draft to rewrite:\n" +
    text;
  const model = polishModel(fsx, meta, str(b.model));
  // room for a longer rewrite and for a reasoning model's thinking
  const maxTokens = Math.min(4000, Math.max(1000, text.length * 3 + 600));
  host.llm.request("polish", {
    ...(model ? { model } : {}),
    systemPrompt: system,
    messages: [{ role: "user", content }],
    presetParams: { temperature: 0.7, max_tokens: maxTokens },
  });
  return { __llmPending: true };
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (req.method === "POST" && path.startsWith("/polish/chats/")) {
    return polishRoute(req, host, decodeURIComponent(path.slice("/polish/chats/".length)));
  }
  return null;
}
