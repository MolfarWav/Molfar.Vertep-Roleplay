/**
 * Card profile: "Structure it" and "Fill empty" for the Profile tab of a
 * character and of a persona (docs/DATA-FORMATS.md, "The profile").
 * Structure it: one model call reads the free text and proposes profile fields
 * plus the text that fits none of them. Fill empty: one model call proposes
 * values for the empty fields the app names, from the text (and the portrait,
 * when the app sends one to a vision model). Either proposal is a draft file
 * (data/profile-drafts/<id>.json, persona-<id>.json for a persona); the app shows
 * it and the user accepts it (the app writes the card) or discards it. This
 * plugin never writes a card or a persona.
 *
 * Routes (relative to /v1/apps/roleplay); a target is {characterId} or {personaId}:
 *   POST   /profile/structure {target}                         split the text, file the draft
 *   POST   /profile/fill {target, fields, image?, model?, replace?}  fill empty fields, file the draft
 *          (replace: "Read from picture" describes the listed fields anew, filled or not)
 *   GET    /profile/draft?characterId= | ?personaId= | ?groupId=  the draft, or null
 *   DELETE /profile/draft?characterId= | ?personaId= | ?groupId=  discard it
 *   GET    /profile/card-tasks?characterId=                     the card's own task settings and the model that will run
 *   PUT    /profile/card-tasks {characterId, model?, maxInput?, maxOutput?}  save them (characters/<id>/card-tasks.json)
 *
 * The model for a card's tasks: the one named in the request (an unsaved pick in the editor), else the card's own
 * (card-tasks.json), else the app-wide "Card tasks" model (settings.json ui.cardTasks.model), else the Dashboard
 * sensor's, else the app's default. The request may carry the editor's working text (card: {name, description,
 * personality, scenario, mes_example}) so a proposal reads what is on screen, and limits: {inputChars, outputTokens}
 * from the chosen model's real window. A card longer than inputChars is read in parts: Structure it takes
 * {part} (0 first) and answers {part, parts, done}; each part's fields merge into one draft.
 *
 * Group scene (the group editor's Scene tab): one model call writes a proposal
 * the user accepts or discards; the plugin never writes the group file.
 *   POST   /profile/group-scene {groupId, mode?: "cards" | "wild", wish?}  the shared scenario
 *   POST   /profile/group-opening {groupId, scenario?, wish?}  one opening, from the scenario
 *          (the editor's text, else the group's saved one)
 * Both file data/profile-drafts/group-<groupId>.json {kind: "scenario" | "opening", text}.
 */

const CARD_ID = /^[A-Za-z0-9_-]{1,120}$/;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const cut = (s, n) => (s.length > n ? s.slice(0, n) : s);
const ok = (json, status) => ({ status: status || 200, json });

const readJson = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};
const MODEL_REF = /^[^\s]{1,200}$/;

/** {kind, id} from a body or a query; null when neither id is valid. */
function targetOf(v) {
  const b = isObj(v) ? v : {};
  if (b.characterId !== undefined) return CARD_ID.test(String(b.characterId)) ? { kind: "character", id: String(b.characterId) } : null;
  if (b.personaId !== undefined) return CARD_ID.test(String(b.personaId)) ? { kind: "persona", id: String(b.personaId) } : null;
  return null;
}
const sourcePath = (t) => (t.kind === "persona" ? "personas/" + t.id + ".json" : "characters/" + t.id + "/card.json");
const draftPath = (t) => "profile-drafts/" + (t.kind === "persona" ? "persona-" + t.id : t.id) + ".json";

// The fields the model may fill, by section. Must match src/lib/profile.ts.
export const SHAPE = {
  identity: { text: ["first", "family", "title", "occupation", "age", "birthday", "gender", "pronouns"], lists: ["nicknames"] },
  appearance: { text: ["face", "eyes", "hair", "body", "height", "weight", "measurements", "skin", "marks", "attire", "voice", "scent", "other"], lists: [] },
  lists: { text: [], lists: ["strengths", "flaws", "traits", "values", "fears", "wishes", "secrets", "petPeeves", "guiltyPleasures", "coreBeliefs"] },
  behaviors: { text: ["speech", "quirks", "habits", "motivations", "social", "underStress", "bodyLanguage", "hobbies"], lists: [] },
  goals: { text: ["life", "shortTerm", "career", "growth", "relationships", "unfinished"], lists: [] },
  background: { text: ["birthplace", "nationality", "ethnicity", "culture", "socialClass", "location", "living", "neighborhood", "circle", "politics", "religion", "summary"], lists: ["affiliations"] },
  trauma: { text: ["coping"], lists: ["experiences", "triggers"] },
  sexuality: { text: ["orientation", "romantic", "relationshipStyle", "libido", "position", "experience", "boundaries", "notes"], lists: ["turnOns", "turnOffs", "kinks"] },
};
const TEXT_MAX = 1500;
const SUMMARY_MAX = 3000;
const LIST_MAX = 12;
const ITEM_MAX = 120;
const LEFTOVER_MAX = 12000;

function cleanList(v) {
  const out = [];
  for (const x of Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []) {
    const s = cut(str(x), ITEM_MAX);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= LIST_MAX) break;
  }
  return out;
}

/** The model's profile, kept to the known fields and sizes. Empty fields are dropped. */
export function cleanProfile(raw) {
  const p = isObj(raw) ? raw : {};
  const out = {};
  for (const [section, { text, lists }] of Object.entries(SHAPE)) {
    const src = isObj(p[section]) ? p[section] : {};
    const sec = {};
    for (const k of text) {
      const v = cut(str(src[k]), k === "summary" ? SUMMARY_MAX : TEXT_MAX);
      if (v) sec[k] = v;
    }
    for (const k of lists) {
      const v = cleanList(src[k]);
      if (v.length) sec[k] = v;
    }
    if (Object.keys(sec).length) out[section] = sec;
  }
  // adult details the card already states: shown switched on, so accepting keeps them in the text
  if (out.sexuality) out.sexuality.enabled = true;
  const rel = [];
  for (const r of Array.isArray(p.relationships) ? p.relationships : []) {
    if (!isObj(r) || !str(r.name)) continue;
    rel.push({ name: cut(str(r.name), ITEM_MAX), relation: cut(str(r.relation), ITEM_MAX), notes: cut(str(r.notes), TEXT_MAX) });
    if (rel.length >= LIST_MAX) break;
  }
  if (rel.length) out.relationships = rel;
  return out;
}

/** The fields the model is told about, one line per section (shared by both prompts). */
const FIELDS = [
  "identity: first, family, title, occupation, age, birthday, gender, pronouns (text); nicknames (list).",
  "appearance: face, eyes, hair, body, height, weight, measurements (bust-waist-hips), skin, marks (scars, tattoos), attire, voice, scent, other (text).",
  "lists: strengths, flaws, traits, values, fears, wishes, secrets, petPeeves, guiltyPleasures, coreBeliefs (lists of short items).",
  "behaviors: speech, quirks, habits, motivations, social (how they are with people), underStress, bodyLanguage, hobbies (text).",
  "goals: life, shortTerm, career, growth (how they want to change), relationships, unfinished (unfinished business) (text).",
  "background: birthplace, nationality, ethnicity, culture, socialClass, location (where they live now), living (living conditions), neighborhood, circle (social circle), politics, religion, summary (backstory) (text); affiliations (list).",
  "trauma: experiences, triggers (lists); coping (text).",
  "sexuality: orientation, romantic, relationshipStyle, libido, position, experience, boundaries, notes (text); turnOns, turnOffs, kinks (lists).",
];

export const SYSTEM = [
  "You split a roleplay character card into structured fields.",
  "Copy the card's own words; shorten only where a field needs a short value. Never invent anything the card does not say.",
  "Put each fact in ONE field only: never repeat it in another field or in the backstory.",
  "Write every value in the card's language. Keep {{char}} and {{user}} as they are.",
  "A birthday is not an age: put a date in birthday.",
  "Fields:",
  ...FIELDS,
  "relationships: a list of { name, relation, notes } for named people.",
  "Fill sexuality and trauma only when the card states them.",
  "leftover: the text of the description and of the personality that fits no field (world facts, rules for the narrator, formatting notes), copied as it is.",
  "Reply with JSON only: {\"profile\": {<sections>}, \"leftover\": {\"description\": \"\", \"personality\": \"\"}, \"note\": \"one line on what did not fit\"}",
  "Leave out any field the card does not fill.",
].join("\n");

export const FILL_SYSTEM = [
  "You complete a roleplay character profile.",
  "Fill ONLY the empty fields the user lists; leave out every other field.",
  "Stay consistent with everything the text already says. Where it is silent, invent plausible details that fit its tone, genre and world.",
  "When a picture is attached, it is the character's portrait: take appearance from it first, and only what it shows.",
  "Keep values short: a phrase, or a few short list items. Write in the language of the text. Keep {{char}} and {{user}} as they are.",
  "Fields:",
  ...FIELDS,
  "Reply with JSON only: {\"profile\": {<sections>}, \"note\": \"one line on what you guessed\"}",
].join("\n");

/** The empty fields the app asked for, kept to SHAPE; null when none is valid. */
export function cleanFields(v) {
  const out = {};
  for (const [section, keys] of Object.entries(isObj(v) ? v : {})) {
    const shape = SHAPE[section];
    if (!shape || !Array.isArray(keys)) continue;
    const known = keys.filter((k) => typeof k === "string" && (shape.text.includes(k) || shape.lists.includes(k)));
    if (known.length) out[section] = [...new Set(known)];
  }
  return Object.keys(out).length ? out : null;
}

/** A model's fill, kept to the fields that were asked for. */
export function onlyFields(profile, fields) {
  const out = {};
  for (const [section, keys] of Object.entries(fields)) {
    const sec = isObj(profile[section]) ? profile[section] : null;
    if (!sec) continue;
    const kept = {};
    for (const k of keys) if (k in sec) kept[k] = sec[k];
    if (Object.keys(kept).length) out[section] = kept;
  }
  return out;
}

function personaText(p) {
  return [
    "Persona (the user's own character): " + (str(p.name) || "unnamed"),
    str(p.description) ? "Description\n" + cut(str(p.description), 8000) : "",
  ].filter(Boolean).join("\n\n");
}

const cardTasksPath = (id) => "characters/" + id + "/card-tasks.json";

/** The card's own task settings: {model?, maxInput?, maxOutput?}; empty when it has none. */
export function readCardTasks(fsx, id) {
  const raw = CARD_ID.test(String(id || "")) ? readJson(fsx, cardTasksPath(id), null) : null;
  const o = isObj(raw) ? raw : {};
  const out = {};
  if (MODEL_REF.test(str(o.model))) out.model = str(o.model);
  for (const k of ["maxInput", "maxOutput"]) if (Number.isFinite(Number(o[k])) && Number(o[k]) > 0) out[k] = Math.floor(Number(o[k]));
  return out;
}

/** Which model runs a card's task, and why: {model, source}. `pick` is an unsaved choice from the editor. */
export function resolveTaskModel(fsx, characterId, pick) {
  if (MODEL_REF.test(str(pick))) return { model: str(pick), source: "card" };
  const own = characterId ? readCardTasks(fsx, characterId).model : "";
  if (own) return { model: own, source: "card" };
  const settings = readJson(fsx, "settings.json", null);
  const ui = isObj(settings) && isObj(settings.ui) ? settings.ui : {};
  const app = isObj(ui.cardTasks) ? str(ui.cardTasks.model) : "";
  if (app) return { model: app, source: "app" };
  const dash = readJson(fsx, "dashboard/config.json", null);
  const sensor = str(isObj(dash) ? dash.sensorModel : "");
  if (sensor) return { model: sensor, source: "sensor" };
  const dflt = str(isObj(settings) ? settings.model : "");
  return { model: dflt, source: dflt ? "default" : "none" };
}

const modelOf = (fsx, characterId, pick) => resolveTaskModel(fsx, characterId, pick).model;

const CHUNK_DEFAULT = 12000;
const clampInt = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, Math.floor(n))) : dflt;
};

/** The request's limits, kept to sane bounds: how many characters of the card go in one call, and the reply size. */
export function limitsOf(body, outDefault) {
  const l = isObj(body) && isObj(body.limits) ? body.limits : {};
  return { inputChars: clampInt(l.inputChars, 3000, 400000, CHUNK_DEFAULT), outputTokens: clampInt(l.outputTokens, 800, 64000, outDefault) };
}

/** Text cut into pieces of at most `max` characters: at a paragraph, else a line, else a space. */
export function splitText(text, max) {
  const t = String(text || "");
  if (t.length <= max) return [t];
  const units = [];
  const hard = (piece) => {
    let rest = piece;
    while (rest.length > max) {
      let at = rest.lastIndexOf(" ", max);
      if (at < max / 2) at = max;
      units.push(rest.slice(0, at));
      rest = rest.slice(at).replace(/^ /, "");
    }
    if (rest) units.push(rest);
  };
  for (const para of t.split(/\n{2,}/)) {
    if (para.length <= max) units.push(para);
    else for (const line of para.split("\n")) (line.length <= max ? units.push(line) : hard(line));
  }
  const out = [];
  let cur = "";
  for (const u of units) {
    if (cur && cur.length + u.length + 2 > max) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? cur + "\n\n" + u : u;
  }
  if (cur) out.push(cur);
  return out;
}

/** The card's text for the model as one message per part. A card that fits `max` is one part; a longer one is
 *  cut at paragraph edges, each piece under its field's label. Scenario and example dialogue are context for
 *  the first part only. */
export function cardParts(card, max) {
  const name = "Card: " + (str(card.name) || "unnamed");
  const segs = [];
  for (const [label, v] of [["Description", card.description], ["Personality", card.personality]]) {
    const t = str(v);
    if (!t) continue;
    splitText(t, Math.max(500, max - 200)).forEach((piece, i) => segs.push(label + (i ? " (continued)" : "") + "\n" + piece));
  }
  const context = [
    str(card.scenario) ? "Scenario (context only, do not move it)\n" + cut(str(card.scenario), 1500) : "",
    str(card.mes_example) ? "Example dialogue (for speech only)\n" + cut(str(card.mes_example), 1500) : "",
  ].filter(Boolean);
  const groups = [];
  let cur = [];
  let len = name.length;
  for (const seg of segs) {
    if (cur.length && len + seg.length + 2 > max) {
      groups.push(cur);
      cur = [];
      len = name.length;
    }
    cur.push(seg);
    len += seg.length + 2;
  }
  if (cur.length || !groups.length) groups.push(cur);
  return groups.map((g, i) => [name, ...g, ...(i === 0 ? context : [])].join("\n\n"));
}

/** Two parts' proposals as one: a text field keeps both when they differ, a list is the union, the leftover adds up. */
export function mergeProposals(a, b) {
  const profile = {};
  for (const sec of new Set([...Object.keys(a.profile || {}), ...Object.keys(b.profile || {})])) {
    const x = a.profile && a.profile[sec];
    const y = b.profile && b.profile[sec];
    if (Array.isArray(x) || Array.isArray(y)) {
      const seen = new Set();
      profile[sec] = [...(Array.isArray(x) ? x : []), ...(Array.isArray(y) ? y : [])].filter((r) => {
        const k = isObj(r) ? str(r.name).toLowerCase() : "";
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      continue;
    }
    if (!isObj(x) || !isObj(y)) {
      profile[sec] = isObj(x) ? x : y;
      continue;
    }
    const bag = { ...x };
    for (const [k, v] of Object.entries(y)) {
      const u = bag[k];
      if (u === undefined) bag[k] = v;
      else if (Array.isArray(u) && Array.isArray(v)) bag[k] = [...u, ...v.filter((i) => !u.some((j) => String(j).toLowerCase() === String(i).toLowerCase()))].slice(0, LIST_MAX);
      else if (typeof u === "string" && typeof v === "string" && v && v !== u && !u.includes(v)) bag[k] = cut(u + "; " + v, SUMMARY_MAX);
    }
    profile[sec] = bag;
  }
  const lo = (d, k) => str(d.leftover && d.leftover[k]);
  const leftover = {};
  for (const k of ["description", "personality"]) leftover[k] = cut([lo(a, k), lo(b, k)].filter(Boolean).join("\n\n"), LEFTOVER_MAX);
  const note = [str(a.note), str(b.note)].filter(Boolean).join(" ");
  return { ...a, profile, leftover, ...(note ? { note: cut(note, 300) } : {}), ...(str(b.model) ? { model: str(b.model) } : {}) };
}

/** The working text from the editor, laid over the stored card (characters only). */
function withWorkingText(src, body, t) {
  const over = t.kind === "character" && isObj(body) && isObj(body.card) ? body.card : null;
  if (!over) return src;
  const out = { ...src };
  for (const k of ["name", "description", "personality", "scenario", "mes_example"]) if (typeof over[k] === "string") out[k] = over[k];
  return out;
}

/** The first JSON object in a reply (fenced or not); null when there is none. */
export function parseReply(text) {
  // thinking models may leave their notes inline, braces and all
  let s = String(text || "").replace(/<think(?:ing)?>[\s\S]*?(?:<\/think(?:ing)?>|$)/gi, "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i.exec(s);
  if (fence && fence[1].includes("{")) s = fence[1];
  const end = s.lastIndexOf("}");
  // a "{" in prose before the object must not hide it: try each start in turn
  for (let start = s.indexOf("{"); start >= 0 && start < end; start = s.indexOf("{", start + 1)) {
    try {
      const v = JSON.parse(s.slice(start, end + 1));
      if (isObj(v)) return v;
    } catch {
      /* the next "{" */
    }
  }
  return null;
}

/** A reply that opened a JSON object and never closed it: cut by the reply limit. */
export function looksCut(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  if (start < 0) return false;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return false;
  }
  return depth > 0;
}

/** The draft filed for a reply; a failure is a draft with an error and no fields. */
export function draftFromReply(reply, now) {
  const r = isObj(reply) ? reply : {};
  const at = now || Date.now();
  if (r.error || !str(r.text)) return { v: 1, at, error: r.error ? String(r.error) : "the model returned nothing" };
  const out = parseReply(r.text);
  if (!out) {
    return {
      v: 1,
      at,
      error: looksCut(r.text)
        ? "the reply was cut off before its end: the card is long for one reply. Try again, or pick a model that writes longer replies"
        : "the model did not answer in the expected format (JSON). Try again, or pick another model",
    };
  }
  const profile = cleanProfile(out.profile);
  const lo = isObj(out.leftover) ? out.leftover : {};
  const leftover = { description: cut(str(lo.description), LEFTOVER_MAX), personality: cut(str(lo.personality), LEFTOVER_MAX) };
  if (!Object.keys(profile).length) return { v: 1, at, error: "the reply filled no field" };
  return { v: 1, at, ...(str(r.model) ? { model: str(r.model) } : {}), ...(str(out.note) ? { note: cut(str(out.note), 300) } : {}), profile, leftover };
}

function loadTarget(req, fsx) {
  const t = targetOf(req.body);
  if (!t) return { fail: ok({ error: "characterId or personaId required" }, 400) };
  const stored = readJson(fsx, sourcePath(t), null);
  if (!isObj(stored)) return { fail: ok({ error: t.kind === "persona" ? "no such persona" : "no such character" }, 404) };
  return { t, src: withWorkingText(stored, req.body, t) };
}

function structureRoute(req, host) {
  const fsx = host.fs;
  const { t, src, fail } = loadTarget(req, fsx);
  if (fail) return fail;
  const b = isObj(req.body) ? req.body : {};
  const limits = limitsOf(b, 12000);
  // a persona is read whole, as before; a card longer than one call holds is read in parts
  const parts = t.kind === "persona" ? [personaText(src)] : cardParts(src, limits.inputChars);
  const part = Number.isInteger(b.part) && b.part >= 0 ? b.part : 0;
  if (part >= parts.length) return ok({ error: "no such part" }, 400);
  const r = host.llm.results.structure;
  if (!r) {
    if (!str(src.description) && !str(src.personality)) return ok({ error: t.kind === "persona" ? "the persona has no description" : "the card has no description or personality" }, 400);
    const model = modelOf(fsx, t.kind === "character" ? t.id : "", b.taskModel);
    const lead = parts.length > 1 ? "Part " + (part + 1) + " of " + parts.length + " of this card; it is read in parts because it is long. Fill only the fields this part supports and leave the others out. Text that fits no field goes to the leftover.\n\n" : "";
    host.llm.request("structure", {
      ...(model ? { model } : {}),
      systemPrompt: SYSTEM,
      messages: [{ role: "user", content: lead + parts[part] }],
      presetParams: { temperature: 0.2, max_tokens: limits.outputTokens },
    });
    return { __llmPending: true, stash: {} };
  }
  const draft = draftFromReply(r);
  if (draft.error) {
    if (part > 0) fsx.remove(draftPath(t));
    return ok(parts.length > 1 ? { ok: false, error: "part " + (part + 1) + " of " + parts.length + ": " + draft.error, part, parts: parts.length } : { ok: false, error: draft.error });
  }
  draft.kind = "structure";
  let filed = draft;
  if (part > 0) {
    const before = readJson(fsx, draftPath(t), null);
    if (isObj(before) && before.partial === true && before.part === part - 1) filed = { ...mergeProposals(before, draft), kind: "structure", v: 1, at: draft.at };
  }
  const done = part + 1 >= parts.length;
  if (!done) filed = { ...filed, partial: true, part, parts: parts.length };
  else {
    delete filed.partial;
    delete filed.part;
    delete filed.parts;
  }
  fsx.write(draftPath(t), JSON.stringify(filed, null, 2));
  return ok({ ok: true, draft: filed, part, parts: parts.length, done });
}

function fillRoute(req, host) {
  const fsx = host.fs;
  const { t, src, fail } = loadTarget(req, fsx);
  if (fail) return fail;
  const b = isObj(req.body) ? req.body : {};
  const fields = cleanFields(b.fields);
  if (!fields) return ok({ error: "no empty field to fill" }, 400);
  const r = host.llm.results.fill;
  if (!r) {
    const img = isObj(b.image) ? { data: String(b.image.data || ""), mimeType: String(b.image.mimeType || "") } : null;
    // a picture with no model named goes to the engine's Vision model (Settings), not the chat model
    const model = MODEL_REF.test(str(b.model)) ? str(b.model) : img ? "" : modelOf(fsx, t.kind === "character" ? t.id : "", b.taskModel);
    const limits = limitsOf(b, 8000);
    const ask = Object.entries(fields).map(([s, keys]) => s + ": " + keys.join(", ")).join("\n");
    const head = b.replace === true && img
      ? "\n\nDescribe these fields from the attached picture; where the text says otherwise, the picture wins (these fields are NOT empty, rewrite them):\n"
      : "\n\nEmpty fields to fill:\n";
    host.llm.request("fill", {
      ...(model ? { model } : {}),
      systemPrompt: FILL_SYSTEM,
      messages: [{ role: "user", content: (t.kind === "persona" ? personaText(src) : cardParts(src, limits.inputChars)[0]) + head + ask }],
      ...(img ? { images: [img] } : {}),
      presetParams: { temperature: 0.7, max_tokens: limits.outputTokens },
    });
    return { __llmPending: true, stash: { replace: b.replace === true && !!img } };
  }
  const draft = draftFromReply(r);
  if (draft.error) return ok({ ok: false, error: draft.error });
  const profile = onlyFields(draft.profile, fields);
  if (!Object.keys(profile).length) return ok({ ok: false, error: "the reply filled none of the empty fields" });
  const filed = { ...draft, kind: "fill", ...(isObj(req.stash) && req.stash.replace ? { replace: true } : {}), profile, leftover: undefined };
  delete filed.leftover;
  fsx.write(draftPath(t), JSON.stringify(filed, null, 2));
  return ok({ ok: true, draft: filed });
}

// ---------- Group scene: the shared scenario, then openings ----------

/** How the scenario is invented: from what the cards say, or a surprise. */
const SCENE_MODES = ["cards", "wild"];

export const SCENE_SYSTEM = [
  "You write the shared scenario for a group roleplay chat: the situation the characters and {{user}} start in.",
  "Every member listed below takes part and has a reason to be there.",
  "{{user}} is the player: give {{user}} a clear place in the scene, but never decide what {{user}} does, says, thinks or feels.",
  "Cover: where and when, what is going on right now, how the members know each other (or why they meet), and the tension or goal that pulls the scene forward.",
  "One to three short paragraphs, under 180 words. Present tense. No dialogue, no headings, no lists, no notes.",
  "Keep {{user}} and the members' names exactly as written.",
  "Write in the language of the user's wish when there is one, otherwise in the language of the cards.",
  "Reply with the scenario text only.",
].join("\n");

const SCENE_MODE_LINES = {
  cards: "Stay faithful to the cards: use their own world, places, relationships and backstories. Invent only what joins them into one scene.",
  wild: "Surprise the user: put the members in an unexpected place, situation or genre twist the cards never mention. Each member still acts true to their personality.",
};

export const OPENING_SYSTEM = [
  "You write the first message of a group roleplay chat, set in the scenario below.",
  "A narrator sets the scene in a few sentences, then each member present gets a line or an action in their own voice.",
  "End on a moment that invites {{user}} to act. Never write what {{user}} does, says, thinks or feels.",
  "Roleplay style: actions and narration in *asterisks*, speech in \"quotes\". 120 to 250 words.",
  "Keep {{user}} and the members' names exactly as written.",
  "Write in the language of the scenario.",
  "Reply with the message text only.",
].join("\n");

/** Each member's card, cut so that all of them together stay small enough for small models. */
export function membersText(cards) {
  const n = Math.max(1, cards.length);
  const desc = Math.max(400, Math.floor(6000 / n));
  const field = (label, v, max) => (str(v) ? label + ": " + cut(str(v), max) : "");
  return cards.map((c) => [
    "## " + (str(c.name) || "unnamed"),
    field("Description", c.description, desc),
    field("Personality", c.personality, Math.floor(desc / 3)),
    field("Their own scenario", c.scenario, Math.floor(desc / 4)),
  ].filter(Boolean).join("\n")).join("\n\n");
}

/** The model's text without fences, thinking, a leading label or wrapping quotes. */
export function cleanSceneText(text) {
  let s = String(text || "").replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
  const fence = /^```[a-z]*\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1].trim();
  s = s.replace(/^(?:\*\*|#+\s*)?(?:scenario|opening|first message|сценарій|опенінг|сценарий)\s*:?\s*(?:\*\*)?\s*:?\s*\n?/i, "").trim();
  if (s.length > 1 && /^["“«]/.test(s) && /["”»]$/.test(s) && !/["“”«»]/.test(s.slice(1, -1))) s = s.slice(1, -1).trim();
  return s;
}

/** The group, its unmuted members' cards; a fail response when something is missing. */
function loadGroup(req, fsx) {
  const b = isObj(req.body) ? req.body : {};
  const id = String(b.groupId || "");
  if (!CARD_ID.test(id)) return { fail: ok({ error: "groupId required" }, 400) };
  const group = readJson(fsx, "groups/" + id + ".json", null);
  if (!isObj(group)) return { fail: ok({ error: "no such group" }, 404) };
  const muted = new Set(Array.isArray(group.mutedIds) ? group.mutedIds.map(String) : []);
  const ids = (Array.isArray(group.memberIds) ? group.memberIds.map(String) : []).filter((m) => CARD_ID.test(m) && !muted.has(m));
  const cards = ids.map((m) => readJson(fsx, "characters/" + m + "/card.json", null)).filter(isObj);
  if (!cards.length) return { fail: ok({ error: "the group has no active members" }, 400) };
  return { id, group, cards, b };
}

/** The model that writes this group's prose writes its scene: the model set on the group's
 *  latest chat, else the app's chat model (what a new chat uses), else the dashboard's. */
export function sceneModel(fsx, groupId) {
  let best = null;
  try {
    for (const f of fsx.list("chats")) {
      if (!f.endsWith(".meta.json")) continue;
      const m = readJson(fsx, "chats/" + f, null);
      if (!isObj(m) || m.groupId !== groupId || m.temporary || !str(m.model)) continue;
      if (!best || (m.updatedAt || 0) > (best.updatedAt || 0)) best = m;
    }
  } catch { /* no chats folder yet */ }
  if (best) return str(best.model);
  const settings = readJson(fsx, "settings.json", null);
  const dash = readJson(fsx, "dashboard/config.json", null);
  return str(isObj(settings) ? settings.model : "") || str(isObj(dash) ? dash.sensorModel : "");
}

const groupDraftPath = (id) => "profile-drafts/group-" + id + ".json";

/** A finished call becomes the group's draft; nothing on the group changes. */
function fileSceneDraft(fsx, id, kind, r, extra) {
  if (!isObj(r) || r.error) return ok({ ok: false, error: isObj(r) && r.error ? String(r.error) : "the model returned nothing" });
  const text = cut(cleanSceneText(r.text), 6000);
  if (!text) return ok({ ok: false, error: "the model returned nothing" });
  const draft = { v: 1, at: Date.now(), kind, text, ...(str(r.model) ? { model: str(r.model) } : {}), ...extra };
  fsx.write(groupDraftPath(id), JSON.stringify(draft, null, 2));
  return ok({ ok: true, draft });
}

function sceneRoute(req, host) {
  const fsx = host.fs;
  const { id, cards, b, fail } = loadGroup(req, fsx);
  if (fail) return fail;
  const mode = SCENE_MODES.includes(b.mode) ? b.mode : "cards";
  const r = host.llm.results.scene;
  if (!r) {
    const model = sceneModel(fsx, id);
    const wish = cut(str(b.wish), 600);
    host.llm.request("scene", {
      ...(model ? { model } : {}),
      systemPrompt: SCENE_SYSTEM + "\n" + SCENE_MODE_LINES[mode],
      messages: [{ role: "user", content: "Members:\n\n" + membersText(cards) + (wish ? "\n\nThe user's wish (it comes first): " + wish : "") }],
      presetParams: { temperature: mode === "wild" ? 1 : 0.8, max_tokens: 1200 },
    });
    return { __llmPending: true, stash: {} };
  }
  return fileSceneDraft(fsx, id, "scenario", r, { mode });
}

function openingRoute(req, host) {
  const fsx = host.fs;
  const { id, group, cards, b, fail } = loadGroup(req, fsx);
  if (fail) return fail;
  // the editor sends the scenario as typed: its own save may still be on the way
  const scenario = str(b.scenario) || str(group.scenario);
  if (!scenario) return ok({ error: "the group has no scenario yet" }, 400);
  const r = host.llm.results.opening;
  if (!r) {
    const model = sceneModel(fsx, id);
    const wish = cut(str(b.wish), 600);
    const taken = (Array.isArray(group.openings) ? group.openings : []).map(str).filter(Boolean).slice(0, 5);
    const content = [
      "Scenario:\n" + cut(scenario, 3000),
      "Members:\n\n" + membersText(cards),
      taken.length ? "Openings the group already has (write a different one):\n" + taken.map((o) => "- " + cut(o, 300)).join("\n") : "",
      wish ? "The user's wish (it comes first): " + wish : "",
    ].filter(Boolean).join("\n\n");
    host.llm.request("opening", {
      ...(model ? { model } : {}),
      systemPrompt: OPENING_SYSTEM,
      messages: [{ role: "user", content }],
      presetParams: { temperature: 0.9, max_tokens: 1500 },
    });
    return { __llmPending: true, stash: {} };
  }
  return fileSceneDraft(fsx, id, "opening", r, {});
}

/** GET: the card's own settings and the model that will run. PUT: save them (a model, and the input and output sizes). */
function cardTasksRoute(req, fsx) {
  const q = isObj(req.query) ? req.query : {};
  const b = isObj(req.body) ? req.body : {};
  const id = String(req.method === "PUT" ? b.characterId : q.characterId);
  if (!CARD_ID.test(id)) return ok({ error: "characterId required" }, 400);
  if (!isObj(readJson(fsx, "characters/" + id + "/card.json", null))) return ok({ error: "no such character" }, 404);
  if (req.method === "PUT") {
    const next = {};
    if (MODEL_REF.test(str(b.model))) next.model = str(b.model);
    for (const k of ["maxInput", "maxOutput"]) if (Number.isFinite(Number(b[k])) && Number(b[k]) > 0) next[k] = Math.min(1000000, Math.floor(Number(b[k])));
    if (Object.keys(next).length) fsx.write(cardTasksPath(id), JSON.stringify(next, null, 2));
    else fsx.remove(cardTasksPath(id));
  }
  return ok({ own: readCardTasks(fsx, id), resolved: resolveTaskModel(fsx, id, "") });
}

function draftRoute(req, fsx) {
  const q = isObj(req.query) ? req.query : {};
  if (q.groupId !== undefined) {
    const id = String(q.groupId);
    if (!CARD_ID.test(id)) return ok({ error: "groupId required" }, 400);
    if (req.method === "DELETE") {
      fsx.remove(groupDraftPath(id));
      return ok({ ok: true });
    }
    const draft = readJson(fsx, groupDraftPath(id), null);
    return ok({ draft: isObj(draft) && str(draft.text) ? draft : null });
  }
  const t = targetOf(req.query);
  if (!t) return ok({ error: "characterId or personaId required" }, 400);
  const path = draftPath(t);
  if (req.method === "DELETE") {
    fsx.remove(path);
    return ok({ ok: true });
  }
  const draft = readJson(fsx, path, null);
  return ok({ draft: isObj(draft) && isObj(draft.profile) ? draft : null });
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (!path.startsWith("/profile/")) return null;
  if (path === "/profile/structure" && req.method === "POST") return structureRoute(req, host);
  if (path === "/profile/fill" && req.method === "POST") return fillRoute(req, host);
  if (path === "/profile/group-scene" && req.method === "POST") return sceneRoute(req, host);
  if (path === "/profile/group-opening" && req.method === "POST") return openingRoute(req, host);
  if (path === "/profile/draft" && (req.method === "GET" || req.method === "DELETE")) return draftRoute(req, host.fs);
  if (path === "/profile/card-tasks" && (req.method === "GET" || req.method === "PUT")) return cardTasksRoute(req, host.fs);
  return ok({ error: "not found" }, 404);
}
