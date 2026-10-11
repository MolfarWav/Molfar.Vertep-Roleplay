/**
 * Card profile: "Structure it" for the character editor's Profile tab
 * (docs/DATA-FORMATS.md, "The profile"). One model call reads a card's free
 * text and proposes profile fields plus the text that fits none of them. The
 * proposal is a draft file (data/profile-drafts/<id>.json); the app shows it and the user accepts it (the app
 * writes the card) or discards it. This plugin never writes a card.
 *
 * Routes (relative to /v1/apps/roleplay):
 *   POST   /profile/structure {characterId}   ask the model (two-phase), file the draft
 *   GET    /profile/draft?characterId=        the draft, or null
 *   DELETE /profile/draft?characterId=        discard it
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
const cardPath = (id) => "characters/" + id + "/card.json";
const draftPath = (id) => "profile-drafts/" + id + ".json";

// The fields the model may fill, by section. Must match src/lib/profile.ts.
export const SHAPE = {
  identity: { text: ["first", "family", "title", "occupation", "age", "gender", "pronouns"], lists: ["nicknames"] },
  appearance: { text: ["face", "eyes", "hair", "body", "height", "skin", "marks", "attire", "voice", "scent", "other"], lists: [] },
  lists: { text: [], lists: ["strengths", "flaws", "traits", "values", "fears", "wishes", "secrets"] },
  behaviors: { text: ["speech", "quirks", "habits", "underStress", "bodyLanguage"], lists: [] },
  goals: { text: ["life", "shortTerm"], lists: [] },
  background: { text: ["birthplace", "location", "socialClass", "culture", "circle", "summary"], lists: ["affiliations"] },
  sexuality: { text: ["orientation", "experience", "boundaries"], lists: ["turnOns", "turnOffs", "kinks"] },
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

export const SYSTEM = [
  "You split a roleplay character card into structured fields.",
  "Copy the card's own words; shorten only where a field needs a short value. Never invent anything the card does not say.",
  "Put each fact in ONE field only: never repeat it in another field or in the backstory.",
  "Write every value in the card's language. Keep {{char}} and {{user}} as they are.",
  "Fields:",
  "identity: first, family, title, occupation, age, gender, pronouns (text); nicknames (list).",
  "appearance: face, eyes, hair, body, height, skin, marks (scars, tattoos), attire, voice, scent, other (text).",
  "lists: strengths, flaws, traits, values, fears, wishes, secrets (lists of short items).",
  "behaviors: speech, quirks, habits, underStress, bodyLanguage (text).",
  "goals: life, shortTerm (text).",
  "background: birthplace, location (where they live now), socialClass, culture, circle (social circle), summary (backstory) (text); affiliations (list).",
  "relationships: a list of { name, relation, notes } for named people.",
  "sexuality: orientation, experience, boundaries (text); turnOns, turnOffs, kinks (lists). Only when the card states it.",
  "leftover: the text of the description and of the personality that fits no field (world facts, rules for the narrator, formatting notes), copied as it is.",
  "Reply with JSON only: {\"profile\": {<sections>}, \"leftover\": {\"description\": \"\", \"personality\": \"\"}, \"note\": \"one line on what did not fit\"}",
  "Leave out any field the card does not fill.",
].join("\n");

function userText(card) {
  const field = (label, v, max) => (str(v) ? label + "\n" + cut(str(v), max) : "");
  return [
    "Card: " + (str(card.name) || "unnamed"),
    field("Description", card.description, 8000),
    field("Personality", card.personality, 4000),
    field("Scenario (context only, do not move it)", card.scenario, 1500),
    field("Example dialogue (for speech only)", card.mes_example, 1500),
  ].filter(Boolean).join("\n\n");
}

function modelOf(fsx) {
  const dash = readJson(fsx, "dashboard/config.json", null);
  const settings = readJson(fsx, "settings.json", null);
  return str(isObj(dash) ? dash.sensorModel : "") || str(isObj(settings) ? settings.model : "");
}

/** The first JSON object in a reply (fenced or not); null when there is none. */
export function parseReply(text) {
  let s = String(text || "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i.exec(s);
  if (fence) s = fence[1];
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(s.slice(start, end + 1));
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

/** The draft filed for a reply; a failure is a draft with an error and no fields. */
export function draftFromReply(reply, now) {
  const r = isObj(reply) ? reply : {};
  const at = now || Date.now();
  if (r.error || !str(r.text)) return { v: 1, at, error: r.error ? String(r.error) : "the model returned nothing" };
  const out = parseReply(r.text);
  if (!out) return { v: 1, at, error: "the reply was not JSON" };
  const profile = cleanProfile(out.profile);
  const lo = isObj(out.leftover) ? out.leftover : {};
  const leftover = { description: cut(str(lo.description), LEFTOVER_MAX), personality: cut(str(lo.personality), LEFTOVER_MAX) };
  if (!Object.keys(profile).length) return { v: 1, at, error: "the reply filled no field" };
  return { v: 1, at, ...(str(r.model) ? { model: str(r.model) } : {}), ...(str(out.note) ? { note: cut(str(out.note), 300) } : {}), profile, leftover };
}

function structureRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const id = String(b.characterId || "");
  if (!CARD_ID.test(id)) return ok({ error: "characterId required" }, 400);
  const card = readJson(fsx, cardPath(id), null);
  if (!isObj(card)) return ok({ error: "no such character" }, 404);
  const r = host.llm.results.structure;
  if (!r) {
    if (!str(card.description) && !str(card.personality)) return ok({ error: "the card has no description or personality" }, 400);
    const model = modelOf(fsx);
    host.llm.request("structure", {
      ...(model ? { model } : {}),
      systemPrompt: SYSTEM,
      messages: [{ role: "user", content: userText(card) }],
      presetParams: { temperature: 0.2, max_tokens: 4000 },
    });
    return { __llmPending: true, stash: {} };
  }
  const draft = draftFromReply(r);
  if (draft.error) return ok({ ok: false, error: draft.error });
  fsx.write(draftPath(id), JSON.stringify(draft, null, 2));
  return ok({ ok: true, draft });
}

function draftRoute(req, fsx) {
  const id = String((req.query || {}).characterId || "");
  if (!CARD_ID.test(id)) return ok({ error: "characterId required" }, 400);
  const path = draftPath(id);
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
  if (path === "/profile/draft" && (req.method === "GET" || req.method === "DELETE")) return draftRoute(req, host.fs);
  return ok({ error: "not found" }, 404);
}
