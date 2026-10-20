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
  return isObj(preset) ? preset : null;
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
  const system = polishTemplate(preset).split("{{user}}").join(userName);
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
