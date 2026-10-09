/**
 * Studio Import — clean-room data import against public file formats.
 * Two entry points:
 *   POST /import/batch { cards?, worldInfo?, presets?, regex?, personas?, themes?, chats? }
 *     The UI cracks archives open in the browser (it can see PNG binaries,
 *     the sandbox cannot) and posts parsed JSON here.
 *   POST /import/zip   { zipBase64 }
 *     Text-entry archives (worlds, presets, regex, personas, chats, JSON
 *     cards) handled plugin-side via the kernel zip service; PNG binaries are
 *     reported for the /import/batch path.
 * Zero external code — formats from public documentation only.
 */

// ---------- PNG card extraction (own parser) ----------
function b64ToBytes(b64) {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = String(b64).replace(/[^A-Za-z0-9+/]/g, "");
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (table.indexOf(clean[i]) << 18) | (table.indexOf(clean[i + 1]) << 12) | ((table.indexOf(clean[i + 2]) & 63) << 6) | ((table.indexOf(clean[i + 3]) & 63) & 63);
    out.push((n >> 16) & 255);
    if (clean[i + 2] && clean[i + 2] !== "=") out.push((n >> 8) & 255);
    if (clean[i + 3] && clean[i + 3] !== "=") out.push(n & 255);
  }
  return out;
}
function latin1(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}
function extractCardFromPng(bytes) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3];
    const type = latin1(bytes.slice(off + 4, off + 8));
    if (type === "tEXt") {
      const data = bytes.slice(off + 8, off + 8 + len);
      const nul = data.indexOf(0);
      if (nul > 0) {
        const keyword = latin1(data.slice(0, nul));
        if (keyword === "ccv3" || keyword === "chara") {
          try {
            const json = latin1(b64ToBytes(latin1(data.slice(nul + 1))));
            return JSON.parse(json);
          } catch { /* next chunk */ }
        }
      }
    }
    off += 12 + len;
    if (type === "IEND") break;
  }
  return null;
}

// ---------- normalizers ----------
const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "item";
// Backup zips carry chat titles only as slug filenames ("crossroads-at-dusk-fork-cXXXXXXXXXXXX"):
// recover a readable title by dropping the trailing engine id and un-slugging.
const unslugTitle = (s) => {
  const pretty = String(s)
    .replace(/-[a-z][a-z0-9]{9,}$/i, "")
    .replace(/-/g, " ")
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase())
    .trim();
  return pretty || String(s);
};
const firstOf = (v) => (Array.isArray(v) ? String(v[0] || "") : v === undefined ? "" : String(v));

/** Collection folders a backup can carry, ours and the foreign layouts'.
 *  Matching one anchors the entry: everything above it is wrapper folders
 *  (data/, default-user/, the install directory someone zipped) and is cut. */
const COLLECTION_DIRS = new Set([
  "characters", "chats", "group chats", "groups", "worlds", "presets", "personas",
  "regex", "lorebooks", "themes", "backgrounds", "extensions", "databank", "memories",
  "assets", "user settings", "openai settings", "textgen settings", "koboldai settings",
  "novelai settings", "instruct", "context", "quickreplies", "user avatars",
]);
/** Files that mean something at a backup's root (and nowhere else). */
const ROOT_FILES = new Set(["card.json", "settings.json", "personas.json", "library.json", "meta.json"]);

/** A zip entry's path as our tree sees it, wrapper folders removed. Unknown
 *  paths ride through untouched — a name we don't recognize is skipped later
 *  anyway, and mangling it would only make the summary harder to read. */
function normalizeEntryName(raw) {
  const segs = String(raw).split("/").filter((s) => s && s !== ".");
  for (let i = 0; i < segs.length - 1; i++) {
    if (COLLECTION_DIRS.has(segs[i].toLowerCase())) return segs.slice(i).join("/");
  }
  const base = segs[segs.length - 1] || String(raw);
  return ROOT_FILES.has(base.toLowerCase()) ? base : String(raw);
}

/** Base64 of a binary zip entry, or null for a text/oversized one. The kernel
 *  tags these `__b64__`; an older spelling (`__b64`) is still accepted so a
 *  mismatch here can never again silently drop every PNG card in a backup. */
const entryBase64 = (e) =>
  e && typeof e === "object" && (e.__b64__ === true || e.__b64 === true) && typeof e.base64 === "string" ? e.base64 : null;

// ---------- base64 and UTF-8 in plain JS ----------
// The engine's QuickJS sandbox has no atob, btoa, TextDecoder or TextEncoder,
// and its 10 s clock does not allow decoding a multi-MB file byte by byte in
// the interpreter. b64Slice decodes only the bytes asked for.
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_VALUE = (() => {
  const t = new Uint8Array(128);
  for (let i = 0; i < 64; i++) t[B64_CHARS.charCodeAt(i)] = i;
  t[45] = 62; t[95] = 63; // url-safe - and _
  return t;
})();
/** Length in bytes of clean base64 text (no whitespace). */
function b64Length(b64) {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor(b64.length / 4) * 3 - pad;
}
/** Bytes [from, from + len) of base64 text. */
function b64Slice(b64, from, len) {
  const end = Math.min(b64Length(b64), from + len);
  if (from < 0 || from >= end) return new Uint8Array(0);
  const g0 = Math.floor(from / 3);
  const g1 = Math.ceil(end / 3);
  const out = new Uint8Array((g1 - g0) * 3);
  let o = 0;
  for (let g = g0; g < g1; g++) {
    const i = g * 4;
    const n = (B64_VALUE[b64.charCodeAt(i) & 127] << 18) | (B64_VALUE[b64.charCodeAt(i + 1) & 127] << 12)
      | (B64_VALUE[b64.charCodeAt(i + 2) & 127] << 6) | B64_VALUE[b64.charCodeAt(i + 3) & 127];
    out[o++] = (n >> 16) & 255; out[o++] = (n >> 8) & 255; out[o++] = n & 255;
  }
  const skip = from - g0 * 3;
  return out.subarray(skip, skip + (end - from));
}
const b64Bytes = (b64) => b64Slice(b64, 0, b64Length(b64));
function b64Encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    s += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63]
      + (b === undefined ? "=" : B64_CHARS[(n >> 6) & 63]) + (c === undefined ? "=" : B64_CHARS[n & 63]);
  }
  return s;
}
function utf8Decode(bytes) {
  // UTF-16 code units flushed in blocks: string += per character is slow in
  // the sandbox's interpreter on a large card
  const parts = [];
  let units = [];
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    let cp;
    if (b < 0x80) cp = b;
    else if (b >= 0xc0 && b < 0xe0) cp = ((b & 31) << 6) | (bytes[i++] & 63);
    else if (b >= 0xe0 && b < 0xf0) cp = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else if (b >= 0xf0 && b < 0xf8) cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else cp = 0xfffd;
    if (cp > 0x10ffff) cp = 0xfffd;
    if (cp >= 0x10000) { cp -= 0x10000; units.push(0xd800 | (cp >> 10), 0xdc00 | (cp & 1023)); }
    else units.push(cp);
    if (units.length >= 8192) { parts.push(String.fromCharCode.apply(null, units)); units = []; }
  }
  parts.push(String.fromCharCode.apply(null, units));
  return parts.join("");
}
function utf8Encode(s) {
  const out = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}
const asciiOf = (bytes) => {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192))));
  return parts.join("");
};

/** Walks a base64 PNG's chunk headers (8 bytes each) without decoding the
 *  image data, and calls visit(keyword, chunkType, dataOffset, dataLength)
 *  for every tEXt/iTXt chunk. visit returns true to stop. */
function walkPngText(b64, visit) {
  const total = b64Length(b64);
  const sig = b64Slice(b64, 0, 8);
  if (sig.length < 8 || sig[0] !== 0x89 || sig[1] !== 0x50 || sig[2] !== 0x4e || sig[3] !== 0x47) return false;
  let off = 8;
  while (off + 12 <= total) {
    const h = b64Slice(b64, off, 8);
    const len = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
    const type = asciiOf(h.subarray(4, 8));
    if (type === "tEXt" || type === "iTXt") {
      const head = b64Slice(b64, off + 8, Math.min(len, 80));
      const nul = head.indexOf(0);
      if (nul > 0 && visit(asciiOf(head.subarray(0, nul)), type, off + 8, len)) return true;
    }
    if (type === "IEND") break;
    off += 12 + len;
  }
  return true;
}

/** True when a base64 PNG carries a character card chunk; reads headers only. */
function pngHasCard(b64) {
  let found = false;
  walkPngText(b64, (keyword) => (found = keyword === "chara" || keyword === "ccv3"));
  return found;
}

/** PNG tEXt chunk reader for embedded cards ("chara" base64 JSON, v2, or
 *  "ccv3" JSON) — mirrors what the browser-side importer does with .png
 *  cards, so backup zips with PNG characters import fully plugin-side. */
function cardFromPngBase64(b64) {
  // ccv3 (V3) wins over chara (V2) when both parse. The V3 spec stores ccv3
  // as base64 like chara; a bare-JSON ccv3 is accepted too. A chunk that does
  // not parse is skipped instead of ending the scan (a V3 PNG whose ccv3 came
  // first used to read as "no card"). Only the card chunks are decoded.
  let v2 = null;
  let v3 = null;
  try {
    walkPngText(String(b64), (keyword, type, at, len) => {
      if (keyword !== "chara" && keyword !== "ccv3") return false;
      const body = b64Slice(b64, at, len);
      let q = body.indexOf(0) + 1;
      if (type === "iTXt") {
        // skip compression flag(1) + method(1) + lang NUL + translated NUL
        q += 2;
        q = body.indexOf(0, q) + 1;
        q = body.indexOf(0, q) + 1;
      }
      const text = asciiOf(body.subarray(q)).replace(/[^A-Za-z0-9+/=_-]/g, "");
      let json = null;
      try { json = JSON.parse(utf8Decode(b64Bytes(text))); } catch { /* not base64 JSON */ }
      if (!json && keyword === "ccv3") { try { json = JSON.parse(utf8Decode(body.subarray(q))); } catch { /* not JSON */ } }
      if (json && keyword === "ccv3") { v3 = json; return true; }
      if (json && !v2) v2 = json;
      return false;
    });
  } catch {}
  return v3 || v2;
}

/** Fields the normalizer owns; everything else on the card's data object is
 *  copied verbatim (the card spec forbids destroying unknown fields, and v3
 *  additions like nickname/assets/group_only_greetings must survive). */
const CARD_KNOWN_FIELDS = new Set([
  "name", "description", "personality", "scenario", "first_mes", "mes_example",
  "alternate_greetings", "creator_notes", "creatorcomment", "tags", "system_prompt",
  "post_history_instructions", "character_book", "avatar", "extensions",
]);

function normalizeCard(raw, avatarDataUrl) {
  if (!raw) return null;
  const d = raw && typeof raw.data === "object" && raw.data ? raw.data : raw;
  if (!d || typeof d.name !== "string" || !d.name) return null;
  // v3-only and unknown data fields ride the card verbatim
  const passthrough = {};
  for (const [k, v] of Object.entries(d)) {
    if (!CARD_KNOWN_FIELDS.has(k) && v !== undefined && v !== null) passthrough[k] = v;
  }
  const isV3 = raw.spec === "chara_card_v3" || d.spec === "chara_card_v3";
  return {
    spec: isV3 ? "chara_card_v3" : "chara_card_v2", name: d.name,
    ...(isV3 ? { spec_version: "3.0" } : {}),
    ...passthrough,
    description: firstOf(d.description), personality: firstOf(d.personality),
    scenario: firstOf(d.scenario), first_mes: firstOf(d.first_mes), mes_example: firstOf(d.mes_example),
    ...(Array.isArray(d.alternate_greetings) && d.alternate_greetings.length ? { alternate_greetings: d.alternate_greetings.map(String) } : {}),
    ...(typeof d.creator_notes === "string" && d.creator_notes ? { creator_notes: d.creator_notes } : {}),
    ...(typeof d.creatorcomment === "string" && d.creatorcomment ? { creator_notes: d.creatorcomment } : {}),
    ...(Array.isArray(d.tags) && d.tags.length ? { tags: d.tags.map(String) } : {}),
    ...(typeof d.system_prompt === "string" && d.system_prompt ? { system_prompt: d.system_prompt } : {}),
    ...(typeof d.post_history_instructions === "string" && d.post_history_instructions ? { post_history_instructions: d.post_history_instructions } : {}),
    ...(d.extensions && typeof d.extensions === "object" ? { extensions: d.extensions } : {}),
    ...(avatarDataUrl && typeof avatarDataUrl === "string" && avatarDataUrl.startsWith("data:") ? { avatar: avatarDataUrl } : {}),
  };
}

/** Card-spec v3 assets: {type, name, uri, ext}. `icon`+`main` is the default
 *  avatar, `emotion` entries are expression sprites. URIs: __asset:/embeded://
 *  point into the package (assetDict), ccdefault: is the source PNG, data:
 *  carries the bytes inline. Returns {avatar, expressions} with what could be
 *  resolved within size caps; unresolvable assets are skipped, never faked. */
// The images ride inside card.json, and the sandbox writes at most 4 MB per
// file: the expressions of one card stay under this total (the browser
// downscales them before import, so a whole pack usually fits).
const EXPRESSIONS_BUDGET = 3 * 1024 * 1024;

/** An expression's name without the "<character>_" prefix RisuAI packs use
 *  ("Yrel_angry" -> "angry"), so the app's emotion labels match it. */
function expressionName(name, cardName) {
  const first = String(cardName || "").trim().split(/[\s_/-]+/)[0];
  if (!first) return name;
  const lower = name.toLowerCase();
  for (const prefix of [String(cardName).trim().toLowerCase(), first.toLowerCase()]) {
    if (prefix && lower.startsWith(prefix) && /^[_\s-]/.test(name.slice(prefix.length)) && name.length > prefix.length + 1) {
      return name.slice(prefix.length + 1).trim();
    }
  }
  return name;
}

function resolveCardAssets(card, assetDict, sourceAvatar) {
  const out = { avatar: null, expressions: [], skipped: 0 };
  const assets = Array.isArray(card && card.assets) ? card.assets : [];
  const MAX_AVATAR = 900 * 1024;
  const MAX_EMOTION = 700 * 1024;
  let spent = 0;
  const seen = new Set();
  for (const a of assets) {
    if (!a || typeof a !== "object" || typeof a.uri !== "string") continue;
    let url = null;
    if (a.uri.startsWith("__asset:") || a.uri.startsWith("embeded://")) {
      const v = assetDict[a.uri.replace(/^(?:__asset:|embeded:\/\/)/, "")];
      // the browser sends ready data URLs (downscaled); the zip path raw base64
      if (typeof v === "string" && /^data:image\/(png|jpeg|webp|gif);base64,/.test(v)) url = v;
      else if (v) url = "data:image/" + (a.ext === "webp" ? "webp" : a.ext === "jpeg" || a.ext === "jpg" ? "jpeg" : "png") + ";base64," + v;
    } else if (a.uri === "ccdefault:") {
      url = sourceAvatar && sourceAvatar.startsWith("data:") ? sourceAvatar : null;
    } else if (a.uri.startsWith("data:")) {
      url = a.uri;
    }
    if (!url) continue;
    if (a.type === "icon" && a.name === "main") {
      if (url.length < MAX_AVATAR) out.avatar = url;
    } else if ((a.type === "emotion" || a.type === "x-risu-asset") && typeof a.name === "string" && a.name) {
      // RisuAI keeps its emotion images as "x-risu-asset" entries
      const name = expressionName(a.name, card.name);
      if (seen.has(name.toLowerCase())) continue;
      if (url.length >= MAX_EMOTION || spent + url.length > EXPRESSIONS_BUDGET) { out.skipped++; continue; }
      seen.add(name.toLowerCase());
      spent += url.length;
      out.expressions.push({ name, url });
    }
  }
  return out;
}

function keyList(k) {
  if (Array.isArray(k)) return k.filter((x) => typeof x === "string");
  if (typeof k === "string") return k.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Card-embedded books (the card-spec shape: flat entries with keys/
 *  secondary_keys/insertion_order + an extensions bag) rebuilt as world-info
 *  entries so the shared normalizer handles both. */
function embeddedBookToWorld(raw) {
  if (!raw || typeof raw !== "object") return null;
  const list = Array.isArray(raw.entries) ? raw.entries : raw.entries && typeof raw.entries === "object" ? Object.values(raw.entries) : null;
  if (!list || !list.length) return null;
  const entries = {};
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const id = typeof entry.id === "number" ? entry.id : index;
    const x = entry.extensions && typeof entry.extensions === "object" ? entry.extensions : {};
    entries[id] = {
      uid: id,
      key: entry.keys, keysecondary: entry.secondary_keys,
      comment: entry.comment || entry.name || "",
      content: entry.content,
      constant: entry.constant === true, selective: entry.selective === true,
      order: typeof entry.insertion_order === "number" ? entry.insertion_order : 100,
      position: typeof x.position === "number" ? x.position : entry.position === "before_char" ? 0 : 1,
      disable: entry.enabled === false,
      excludeRecursion: x.exclude_recursion === true, preventRecursion: x.prevent_recursion === true,
      delayUntilRecursion: x.delay_until_recursion === true,
      probability: x.probability, useProbability: x.useProbability,
      depth: x.depth, selectiveLogic: x.selectiveLogic,
      group: x.group, groupOverride: x.group_override === true, groupWeight: x.group_weight,
      scanDepth: x.scan_depth, caseSensitive: x.case_sensitive,
      matchWholeWords: x.match_whole_words, useGroupScoring: x.use_group_scoring,
      automationId: x.automation_id, role: x.role,
      vectorized: x.vectorized === true,
      sticky: x.sticky, cooldown: x.cooldown, delay: x.delay,
      matchPersonaDescription: x.match_persona_description === true,
      matchCharacterDescription: x.match_character_description === true,
      matchCharacterPersonality: x.match_character_personality === true,
      matchScenario: x.match_scenario === true,
      ignoreBudget: x.ignore_budget === true,
    };
  });
  return { entries };
}

// world_info_position: 0 before-char, 1 after-char, 2 AN-top, 3 AN-bottom,
// 4 at-depth, 5 EM-top, 6 EM-bottom, 7 outlet. The studio engine models
// before/after/at_depth — everything else lands after the char block.
// entry role: 0 system, 1 user, 2 assistant.
function normalizeBook(raw, fallbackName) {
  if (!raw || !raw.entries || typeof raw.entries !== "object") return null;
  const name = typeof raw.name === "string" && raw.name ? raw.name : (fallbackName || "imported-book");
  const LOGIC = ["AND_ANY", "NOT_ALL", "NOT_ANY", "AND_ALL"];
  const ROLE = ["system", "user", "assistant"];
  const entries = [];
  for (const e of Object.values(raw.entries)) {
    if (!e || typeof e !== "object") continue;
    const content = typeof e.content === "string" ? e.content : "";
    if (!content.trim()) continue;
    const stPos = typeof e.position === "number" ? e.position : 0;
    const pos = stPos === 0 ? "before_char" : stPos === 4 ? "at_depth" : "after_char";
    // the comment doubles as the entry title/memo — without it every imported
    // entry renders with a blank name
    const comment = typeof e.comment === "string" ? e.comment.trim() : "";
    const num = (v) => (typeof v === "number" ? v : undefined);
    entries.push({
      uid: typeof e.uid === "number" ? e.uid : undefined,
      title: comment || "Entry " + (entries.length + 1),
      memo: comment,
      keys: keyList(e.key), secondaryKeys: keyList(e.keysecondary),
      ...(typeof e.selectiveLogic === "number" && LOGIC[e.selectiveLogic] ? { selectiveLogic: LOGIC[e.selectiveLogic] } : {}),
      content, enabled: e.disable !== true,
      status: e.vectorized === true ? "vectorized" : e.constant === true ? "constant" : "normal",
      constant: e.constant === true,
      order: typeof e.order === "number" ? e.order : 100,
      position: pos,
      ...(pos === "at_depth" ? { depth: num(e.depth) ?? 4, role: ROLE[e.role] || "system" } : {}),
      // probability applies only when useProbability is on
      ...(e.useProbability !== false && typeof e.probability === "number" && e.probability < 100 ? { probability: e.probability } : {}),
      ...(e.group ? { group: String(e.group) } : {}),
      ...(num(e.groupWeight) != null ? { groupWeight: e.groupWeight } : {}),
      ...(e.groupOverride === true ? { groupOverride: true } : {}),
      ...(e.matchWholeWords === false ? { matchWholeWords: false } : {}),
      ...(e.excludeRecursion === true ? { nonRecursable: true } : {}),
      ...(e.ignoreBudget === true ? { ignoreBudget: true } : {}),
      ...(e.preventRecursion === true ? { preventFurtherRecursion: true } : {}),
      ...(e.delayUntilRecursion ? { delayUntilRecursion: num(e.delayUntilRecursion) ?? true } : {}),
      ...(num(e.sticky) != null ? { sticky: e.sticky } : {}),
      ...(num(e.cooldown) != null ? { cooldown: e.cooldown } : {}),
      ...(num(e.delay) != null ? { delay: e.delay } : {}),
      ...(e.automationId ? { automationId: String(e.automationId) } : {}),
      ...(e.matchCharacterDescription || e.matchCharacterPersonality || e.matchScenario || e.matchPersonaDescription ? {
        matchSources: {
          description: e.matchCharacterDescription === true,
          personality: e.matchCharacterPersonality === true,
          scenario: e.matchScenario === true,
          persona: e.matchPersonaDescription === true,
        },
      } : {}),
    });
  }
  return entries.length ? { name, entries } : null;
}

// The full standard sampler sweep a chat-completion preset can carry. Numeric
// keys copy as-is; the engine forwards them to the provider body (strict
// endpoints ignore or reject unknown ones, textgen endpoints honor them).
// Keep in sync with the engine plugin's forwarded-key list.
const SAMPLER_NUM_KEYS = [
  "top_p", "top_k", "min_p", "top_a", "typical_p", "eta_cutoff", "epsilon_cutoff",
  "repetition_penalty", "rep_pen", "repetition_penalty_range", "encoder_rep_pen",
  "no_repeat_ngram_size", "presence_penalty", "frequency_penalty", "penalty_alpha",
  "guidance_scale", "negative_prompt_scale", "smoothing_factor", "smoothing_curve",
  "dry_multiplier", "dry_base", "dry_allowed_length", "dry_last_n",
  "xtc_probability", "xtc_threshold",
  "dynatemp_min", "dynatemp_max", "dynatemp_exponent",
  "mirostat_mode", "mirostat_tau", "mirostat_eta",
  "seed", "temperature_last",
];
const SAMPLER_STR_KEYS = ["negative_prompt"];
const SAMPLER_BOOL_KEYS = ["temperature_last", "skip_special_tokens", "ban_eos_token", "add_bos_token"];

/** An instruct template's sequences as the text completion format. "wrap"
 *  puts a newline between a sequence and the message, and ends a message
 *  that has no suffix with one. The story string wrapper, when present, is
 *  what surrounds the system block at the top. */
function instructFormat(t) {
  if (!t || typeof t.input_sequence !== "string" || typeof t.output_sequence !== "string") return null;
  const str = (v) => (typeof v === "string" ? v : "");
  const nl = t.wrap === true ? "\n" : "";
  const prefix = (seq) => (seq ? seq + nl : "");
  const suffix = (seq) => str(seq) || nl;
  return {
    systemPrefix: prefix(str(t.story_string_prefix) || (t.system_same_as_user ? str(t.input_sequence) : str(t.system_sequence))),
    systemSuffix: suffix(str(t.story_string_suffix) || (t.system_same_as_user ? str(t.input_suffix) : str(t.system_suffix))),
    userPrefix: prefix(t.input_sequence),
    userSuffix: suffix(t.input_suffix),
    assistantPrefix: prefix(t.output_sequence),
    assistantSuffix: suffix(t.output_suffix),
    systemAsUser: t.system_same_as_user === true,
  };
}

/** A preset this app wrote comes back whole: its editor sections carry the
 *  generation types, groups and conditions the portable format has no room
 *  for. Which preset is the default, and which are stock, stays the target's
 *  call. Anything else is another tool's file and goes through the converter. */
function restorePreset(raw, fallbackName) {
  if (!raw || typeof raw !== "object" || !raw.studio || typeof raw.studio !== "object" || !Array.isArray(raw.studio.sections)) {
    return normalizePreset(raw, fallbackName);
  }
  const { id: _id, ...rest } = raw;
  const { isDefault: _isDefault, readOnly: _readOnly, ...studio } = raw.studio;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name : fallbackName || "imported";
  return { ...rest, name, studio };
}

function normalizePreset(raw, fallbackName) {
  if (!raw || typeof raw !== "object") return null;
  const label = typeof raw.name === "string" && raw.name.trim() ? raw.name
    : typeof raw.presetName === "string" && raw.presetName.trim() ? raw.presetName
    : typeof fallbackName === "string" && fallbackName.trim() ? fallbackName
    : "imported";
  const num = (k) => (typeof raw[k] === "number" ? raw[k] : undefined);
  const preset = {
    name: label,
    temperature: num("temperature") ?? num("temp") ?? undefined,
    // token/context ceilings come under several names depending on the source UI
    openai_max_tokens: num("openai_max_tokens") ?? num("max_tokens") ?? num("max_length") ?? num("n_predict") ?? undefined,
    openai_max_context: num("openai_max_context") ?? num("max_context") ?? num("truncation_length") ?? undefined,
  };
  for (const k of SAMPLER_NUM_KEYS) if (num(k) != null) preset[k] = raw[k];
  for (const k of SAMPLER_STR_KEYS) if (typeof raw[k] === "string" && raw[k].trim()) preset[k] = raw[k];
  for (const k of SAMPLER_BOOL_KEYS) if (raw[k] === true || raw[k] === false) preset[k] = raw[k];

  // behavior + utility prompts map onto the studio bag; blank strings are
  // "off" in our schema, so empty sources just don't set them
  const studio = {};
  // numeric enum: -1 never prepend, 0 default (groups), 1 completion name
  // field, 2 always prefix content
  const namesBehavior = { [-1]: "none", 0: "default", 1: "completion", 2: "content" }[raw.names_behavior];
  if (namesBehavior) studio.namesBehavior = namesBehavior;
  if (raw.squash_system_messages === true || raw.squash_system_messages === false) studio.squashSystemMessages = raw.squash_system_messages;
  if (raw.continue_prefill === true || raw.continue_prefill === false) studio.continuePrefill = raw.continue_prefill;
  const instruct = instructFormat(raw.instruct && typeof raw.instruct === "object" ? raw.instruct : raw);
  if (instruct) studio.promptFormat = { use: "custom", custom: instruct };
  if (typeof raw.custom_prompt_post_processing === "string" && raw.custom_prompt_post_processing) {
    const POST = { claude: "merge", merge: "merge", merge_tools: "merge", semi: "semi", semi_tools: "semi", strict: "strict", strict_tools: "strict", single: "single" };
    const mode = POST[raw.custom_prompt_post_processing];
    if (mode) studio.promptPostProcessing = { enabled: true, mode };
  }
  const samplers = {};
  if (typeof raw.assistant_prefill === "string" && raw.assistant_prefill.trim()) samplers.assistantPrefill = raw.assistant_prefill;
  // NEVER trim a stop string: leading whitespace is the point of the most
  // common one ("\nUser:" halts the model as it starts the user's turn).
  const stops = [
    ...(Array.isArray(raw.stop) ? raw.stop.filter((x) => typeof x === "string" && x) : []),
    ...(typeof raw.custom_stop_strings === "string" && raw.custom_stop_strings.trim() ? raw.custom_stop_strings.split("\n") : []),
  ].filter((x) => x.trim());
  if (stops.length) samplers.stopStrings = [...new Set(stops)];
  if (typeof raw.reasoning_effort === "string" && ["low", "medium", "high"].includes(raw.reasoning_effort)) preset.reasoning = raw.reasoning_effort;
  const utilityPrompts = {};
  const utilMap = [
    ["impersonation_prompt", "impersonation"],
    ["continue_nudge_prompt", "continueNudge"],
    ["new_chat_prompt", "newChat"],
    ["group_nudge_prompt", "groupNudge"],
    ["send_if_empty", "emptySend"],
  ];
  for (const [src, dst] of utilMap) {
    if (typeof raw[src] === "string" && raw[src].trim()) utilityPrompts[dst] = raw[src];
  }
  if (Object.keys(samplers).length) studio.samplers = samplers;
  if (Object.keys(studio).length) preset.studio = studio;
  if (Object.keys(utilityPrompts).length) preset.utilityPrompts = utilityPrompts;
  if (Array.isArray(raw.prompts) && raw.prompts.length) {
    // in-chat injection: numeric 0/1 in outside files, "absolute" in our own
    // exports — both spell the same thing here
    const absolute = (p) => p.injection_position === 1 || p.injection_position === "absolute";
    preset.prompts = raw.prompts
      .filter((p) => p && (p.identifier || p.name))
      .map((p) => ({
        identifier: p.identifier || slug(p.name || "prompt"),
        name: p.name || p.identifier,
        role: p.role === "user" || p.role === "assistant" ? p.role : "system",
        marker: p.marker === true,
        // markers carry editable text too (main/jailbreak and hand-built
        // marker entries) — keep whatever content is there
        ...(typeof p.content === "string" && p.content.trim() ? { content: p.content } : {}),
        ...(absolute(p) && typeof p.injection_depth === "number" ? { injection_position: "absolute", injection_depth: p.injection_depth } : {}),
        ...(Array.isArray(p.injection_trigger) && p.injection_trigger.length ? { injection_trigger: p.injection_trigger } : {}),
      }));
    preset.prompt_order = Array.isArray(raw.prompt_order)
      ? raw.prompt_order
      : preset.prompts.map((p) => ({ identifier: p.identifier, enabled: true }));
    // prompt_order arrives as [{character_id, order:[{identifier, enabled}]}]
    if (Array.isArray(raw.prompt_order) && raw.prompt_order.length && raw.prompt_order[0] && Array.isArray(raw.prompt_order[0].order)) {
      preset.prompt_order = raw.prompt_order;
    }
    if (Array.isArray(preset.prompt_order) && preset.prompt_order.length && !Array.isArray(preset.prompt_order[0].order)) {
      preset.prompt_order = [{ character_id: 100000, order: preset.prompt_order }];
    }
  } else {
    // text-completion story_string → single-block layout
    const content = typeof raw.story_string === "string" && raw.story_string.trim() ? raw.story_string : undefined;
    preset.prompts = [
      ...(content ? [{ identifier: "story", name: "Story", role: "system", content }] : []),
      { identifier: "worldInfoBefore", name: "World Info (before)", role: "system", marker: true },
      { identifier: "charDescription", name: "Char Description", role: "system", marker: true },
      { identifier: "charPersonality", name: "Char Personality", role: "system", marker: true },
      { identifier: "scenario", name: "Scenario", role: "system", marker: true },
      { identifier: "personaDescription", name: "Persona", role: "system", marker: true },
      { identifier: "worldInfoAfter", name: "World Info (after)", role: "system", marker: true },
      { identifier: "dialogueExamples", name: "Chat Examples", role: "system", marker: true },
      { identifier: "chatHistory", name: "Chat History", role: "system", marker: true },
    ];
    preset.prompt_order = [{ character_id: 100000, order: preset.prompts.map((p) => ({ identifier: p.identifier, enabled: true })) }];
  }
  return preset;
}

// numeric placement of the portable regex format: 1 user input, 2 AI
// output, 3 slash command, 5 world info, 6 reasoning (0, the retired
// display-only slot, has no meaning any more)
const PLACEMENT = { 1: "user_input", 2: "ai_output", 3: "slash", 5: "wi", 6: "reasoning" };
function normalizeRegex(raw) {
  if (!raw || typeof raw.findRegex !== "string") return null;
  let find = raw.findRegex;
  let flags;
  const m = /^\/(.*)\/([a-z]*)$/s.exec(find);
  if (m) { find = m[1]; flags = m[2] || undefined; }
  const placement = Array.isArray(raw.placement)
    ? Array.from(new Set(raw.placement.map((n) => PLACEMENT[n]).filter(Boolean)))
    : ["ai_output"];
  return {
    scriptName: typeof raw.scriptName === "string" ? raw.scriptName : "imported",
    findRegex: find, replaceString: typeof raw.replaceString === "string" ? raw.replaceString : "",
    placement,
    // WHEN it applies: neither flag = the saved text is rewritten
    markdownOnly: raw.markdownOnly === true,
    promptOnly: raw.promptOnly === true,
    runOnEdit: raw.runOnEdit === true,
    trimStrings: Array.isArray(raw.trimStrings) ? raw.trimStrings.map(String) : [],
    ...(flags ? { flags } : {}),
    minDepth: typeof raw.minDepth === "number" && raw.minDepth >= -1 ? raw.minDepth : null,
    maxDepth: typeof raw.maxDepth === "number" && raw.maxDepth >= 0 ? raw.maxDepth : null,
    disabled: raw.disabled === true,
    ...(raw.substituteRegex === 1 ? { macroMode: "raw" } : raw.substituteRegex === 2 ? { macroMode: "escaped" } : {}),
  };
}

function normalizeChatLines(raw) {
  // raw: {character?: string, file?: string, lines: [public chat-line objects]}
  if (!raw || !Array.isArray(raw.lines) || !raw.lines.length) return null;
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const msgs = [];
  for (const l of raw.lines) {
    if (!l || typeof l.mes !== "string") continue;
    const isUser = l.is_user === true;
    // our own backups tuck the fields the public line shape has no room for
    // into extra.chry — a hidden turn, a bookmark, a generated picture, a
    // translation, and the model/usage/reasoning stamp on the reply
    const x = l.extra && typeof l.extra === "object" && l.extra.chry && typeof l.extra.chry === "object" ? l.extra.chry : {};
    msgs.push({
      id: uid("e"), name: typeof l.name === "string" ? l.name : (isUser ? "User" : "Character"),
      charId: (l.extra && typeof l.extra.chry_char_id === "string" && l.extra.chry_char_id) || null,
      role: isUser ? "user" : l.is_system === true ? "system" : "char",
      text: l.mes, at: l.send_date && !isNaN(Date.parse(l.send_date)) ? Date.parse(l.send_date) : Date.now(),
      swipes: Array.isArray(l.swipes) && l.swipes.length ? l.swipes.map(String) : [l.mes],
      swipe: typeof l.swipe_id === "number" && l.swipe_id >= 0 ? l.swipe_id : 0,
      ...(x.hidden === true ? { hidden: true } : {}),
      ...(x.bookmark ? { bookmark: x.bookmark } : {}),
      ...(x.picture ? { picture: x.picture } : {}),
      ...(typeof x.translation === "string" && x.translation ? { translation: x.translation } : {}),
      ...(x.extra && typeof x.extra === "object" ? { extra: x.extra } : {}),
    });
  }
  if (!msgs.length) return null;
  const title = (raw.character ? raw.character + " — " : "") + unslugTitle(raw.file || "imported chat");
  return { title, msgs };
}

// chub's CDN/API rejects default http-client user-agents with a fake
// "not available in your country" page — present as a browser
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

// ---------- More card sources (RisuRealm, CharaVault, direct links) ----------
// chub keeps its own paths below untouched. Every other source only FETCHES
// the card file here (allowlisted host, size cap, timeout, no host change on
// redirect, magic bytes checked) and hands the bytes back; the Store imports
// them exactly like a dropped file, so there is one importer for all of them.
const HONEST_UA = "Molfar-Vertep studio-import/1.13.0 (+https://github.com/MolfarWav/Molfar.Vertep)";
const CARD_MAX_BYTES = 16 * 1024 * 1024; // the chub card PNG cap
const CARD_TIMEOUT_MS = 30000;
const SOURCE_LABELS = { chub: "Chub", risurealm: "RisuRealm", charavault: "CharaVault", wyvern: "Wyvern", pygmalion: "Pygmalion", janny: "JannyAI", url: "a direct link" };
const OTHER_SOURCES = ["risurealm", "charavault", "wyvern", "pygmalion", "janny"];
// A direct link may only be downloaded from these services, and a redirect
// may only stay inside the same service (Hugging Face serves files from its
// CDN, github.com/raw lands on raw.githubusercontent.com). The engine checks
// every hop against networkHosts as well.
const DIRECT_SERVICES = [
  { name: "GitHub", hosts: ["raw.githubusercontent.com"] },
  { name: "Hugging Face", hosts: ["huggingface.co", "cdn-lfs.huggingface.co", "*.hf.co"] },
  { name: "Catbox", hosts: ["files.catbox.moe"] },
  { name: "Discord", hosts: ["cdn.discordapp.com"] },
];
const DIRECT_NAMES = "GitHub (raw), Hugging Face, Catbox, Discord, Wyvern, Pygmalion";
const hostIn = (hostname, patterns) =>
  patterns.some((p) => hostname === p || (p.startsWith("*.") && hostname.endsWith(p.slice(1))));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fileNameOf = (s) => String(s).replace(/[^\w.() -]+/g, "_").slice(-120) || "card";
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** Where a pasted link is downloaded from. Never fetches; returns
 *  { error, status?, openInBrowser? } when the link cannot be used. */
function classifyCardLink(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return { error: "That is not a link." }; }
  if (u.protocol !== "https:") return { error: "Only https:// links can be downloaded." };
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  // JannyAI / JanitorAI sit behind a browser check that apps must not get
  // around: the user downloads the card in the browser and drops it here.
  if (/(^|\.)(jannyai\.com|janitorai\.com)$/.test(host)) {
    return { status: 422, error: "JannyAI cards cannot be downloaded by the app. Open the page in your browser, download the card, then drop the file into the Store.", openInBrowser: u.href };
  }
  if (/(^|\.)(chub\.ai|characterhub\.(ai|org))$/.test(host)) return { status: 400, error: "Chub links go through the chub import." };
  // Wyvern and Pygmalion give the card as JSON fields, not a file: the
  // plugin reads them and builds a V2 card (see wyvernCard / pygCard)
  if (host === "wyvern.chat" || host === "app.wyvern.chat") {
    const id = parts[0] === "characters" ? parts[1] : "";
    if (!id || !/^[\w-]{6,64}$/.test(id)) return { error: "Not a Wyvern character link. Use https://app.wyvern.chat/characters/<id>." };
    return {
      source: "wyvern", api: true, hosts: ["api.wyvern.chat"], fileBase: id,
      pageUrl: "https://app.wyvern.chat/characters/" + id,
      url: "https://api.wyvern.chat/characters/" + id, headers: { accept: "application/json" },
    };
  }
  if (host === "pygmalion.chat" || host === "www.pygmalion.chat") {
    const id = parts[0] === "character" ? parts[1] : "";
    if (!id || !UUID_RE.test(id)) return { error: "Not a Pygmalion character link. Use https://pygmalion.chat/character/<id>." };
    return {
      source: "pygmalion", api: true, hosts: ["server.pygmalion.chat"], fileBase: id.toLowerCase(),
      pageUrl: "https://pygmalion.chat/character/" + id.toLowerCase(),
      url: PYG_API + "/Character?" + new URLSearchParams({ connect: "v1", encoding: "json", message: JSON.stringify({ characterMetaId: id.toLowerCase() }) }).toString(),
      headers: { accept: "application/json" },
    };
  }
  if (host === "realm.risuai.net") {
    const id = parts[0] === "character" ? parts[1] : parts[0] === "api" ? parts[parts.length - 1] : "";
    if (!id || !UUID_RE.test(id)) return { error: "Not a RisuRealm character link. Use https://realm.risuai.net/character/<id>." };
    return {
      source: "risurealm", hosts: ["realm.risuai.net"], fileBase: id.toLowerCase(),
      pageUrl: "https://realm.risuai.net/character/" + id.toLowerCase(),
      url: "https://realm.risuai.net/api/v1/download/dynamic/" + id.toLowerCase() + "?cors=true",
      headers: { "x-risu-api-version": "4", accept: "image/png, application/zip, application/charx, application/json" },
    };
  }
  if (host === "charavault.net" || host === "www.charavault.net") {
    // page /cards/<folder>/<file> or the API's /api/cards/download/<folder>/<file>
    const at = parts[0] === "cards" ? 1 : parts[0] === "api" && parts[2] === "download" ? 3 : -1;
    if (at < 0 || parts.length !== at + 2) return { error: "Not a CharaVault card link. Use https://charavault.net/cards/<folder>/<file>." };
    const folder = safeDecode(parts[at]);
    const file = safeDecode(parts[at + 1]);
    const tail = encodeURIComponent(folder) + "/" + encodeURIComponent(file);
    return {
      source: "charavault", hosts: ["charavault.net"], fileBase: file,
      pageUrl: "https://charavault.net/cards/" + tail,
      url: "https://charavault.net/api/cards/download/" + tail,
      headers: { accept: "image/png" },
    };
  }
  // GitHub and Hugging Face "view" links point at a web page; rewrite them to
  // the file itself (a pure URL rewrite, no extra host is contacted).
  let direct = u;
  if (host === "github.com" && (parts[2] === "blob" || parts[2] === "raw") && parts.length > 4) {
    direct = new URL("https://raw.githubusercontent.com/" + [parts[0], parts[1], ...parts.slice(3)].join("/"));
  } else if (host === "huggingface.co" && parts.includes("blob")) {
    direct = new URL(u.href.replace("/blob/", "/resolve/"));
  }
  const service = DIRECT_SERVICES.find((s) => hostIn(direct.hostname.toLowerCase(), s.hosts));
  if (!service) {
    return { status: 422, error: "The app can only download cards from " + DIRECT_NAMES + ", RisuRealm and CharaVault. For any other site, download the file and drop it into the Store." };
  }
  return {
    source: "url", hosts: service.hosts, service: service.name, pageUrl: u.href,
    fileBase: safeDecode(direct.pathname.split("/").filter(Boolean).pop() || "card"),
    url: direct.href, headers: { accept: "image/png, application/json, application/zip, */*" },
  };
}

/** What a fetched card file is, from its first bytes. A PNG must carry a card
 *  chunk (headers only are read); a JSON file must parse and have a name
 *  (files over 2 MB are left to the browser's importer). Returns { kind } or
 *  { error }. */
function sniffCardFile(base64) {
  const s = String(base64);
  const total = b64Length(s);
  const head = b64Slice(s, 0, 16);
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
    return pngHasCard(s) ? { kind: "png" } : { error: "This PNG is a plain image with no character card inside." };
  }
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return { kind: "charx", zipOffset: 0 };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    // RisuRealm also serves charx as a JPEG cover with the zip appended. The
    // zip's end record says where the zip starts: end - directory size -
    // directory offset. The Store cuts the cover off before /import/zip.
    const tailStart = Math.max(0, total - 768);
    const tail = b64Slice(s, tailStart, total - tailStart);
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
        const u32 = (o) => (tail[o] | (tail[o + 1] << 8) | (tail[o + 2] << 16) | (tail[o + 3] << 24)) >>> 0;
        const zipStart = tailStart + i - u32(i + 12) - u32(i + 16);
        if (zipStart > 0 && zipStart < tailStart + i) return { kind: "charx", zipOffset: zipStart };
        break;
      }
    }
    return { error: "This JPEG is a plain image with no character card inside." };
  }
  const lead = utf8Decode(b64Slice(s, 0, 64)).replace(/^﻿/, "").trimStart();
  if (lead.startsWith("<")) return { error: "The link opens a web page, not a card file. Use the link of the file itself (on GitHub: Raw; on Hugging Face: download)." };
  if (lead.startsWith("{")) {
    if (total > 2 * 1024 * 1024) return { kind: "json" };
    try {
      const j = JSON.parse(utf8Decode(b64Bytes(s)).replace(/^﻿/, ""));
      const name = j && (j.name || (j.data && j.data.name) || (j.char_name));
      if (typeof name === "string" && name.trim()) return { kind: "json" };
      return { error: "This JSON file is not a character card (it has no name)." };
    } catch { return { error: "This file looks like JSON but does not parse." }; }
  }
  return { error: "This file is not a character card (PNG, JSON or charx)." };
}

/** Plain words for a failed host.net download. */
function downloadError(r, label) {
  const status = r && r.status;
  const err = String((r && r.error) || "");
  const outside = /networkHosts allowlist: (\S+)/.exec(err);
  if (outside) return { status: 422, error: "The link redirected to " + outside[1] + ", which the app may not contact. Download the file in your browser and drop it into the Store." };
  if (/too large/.test(err)) return { status: 413, error: "The file is larger than 16 MB, the most the app downloads." };
  if (/timed? ?out|abort/i.test(err)) return { status: 504, error: label + " did not answer in time. Try again later." };
  if (status === 429) return { status: 429, error: label + " asks to slow down. Wait a minute, then try again." };
  if (status === 404 || status === 410) return { status: 404, error: label + " has no card at this link (" + status + ")." };
  if (status === 401 || status === 403) return { status: 502, error: label + " refused the download (" + status + "). The card may be private, or the site does not let apps download it: open it in your browser, download it, and drop the file into the Store." };
  return { status: 502, error: "Download from " + label + " failed (" + (status || err || "no response") + ")." };
}

/** SvelteKit page data (devalue): a flat array where object and array members
 *  are indexes into the same array. Turns it back into plain values. */
function devalueRoot(data) {
  if (!Array.isArray(data)) return null;
  const memo = new Map();
  const at = (i) => {
    if (typeof i !== "number" || i < 0 || i >= data.length) return undefined;
    if (memo.has(i)) return memo.get(i);
    const v = data[i];
    let out = v;
    if (Array.isArray(v)) { out = []; memo.set(i, out); for (const x of v) out.push(at(x)); }
    else if (v && typeof v === "object") { out = {}; memo.set(i, out); for (const k of Object.keys(v)) out[k] = at(v[k]); }
    memo.set(i, out);
    return out;
  };
  return at(0);
}
const risuNodeRoot = (json, key) => {
  const nodes = json && Array.isArray(json.nodes) ? json.nodes : [];
  for (const n of nodes) {
    const root = n && n.type === "data" ? devalueRoot(n.data) : null;
    if (root && typeof root === "object" && key in root) return root;
  }
  return null;
};
// "17.2k" / "1.1m" / "950" -> number
const risuCount = (s) => {
  const m = /^([\d.]+)\s*([km]?)$/i.exec(String(s || "").trim());
  return m ? Math.round(Number(m[1]) * (m[2].toLowerCase() === "k" ? 1e3 : m[2].toLowerCase() === "m" ? 1e6 : 1)) || 0 : 0;
};
const RISU_PAGE = 30; // the site's own page size
// Store sort key -> the site's own. RisuRealm, checked 2026-10-09: no
// parameter = recommended; "download" only orders a search with a query
// (without one it lists the newest); "like" changes nothing, so it is absent.
const RISU_SORTS = { trending: "trending", newest: "date", downloads: "download", random: "random" };
const CV_SORTS = {
  downloads: "most_downloaded", rating: "top_rated", newest: "newest", oldest: "oldest",
  name: "name_asc", name_desc: "name_desc", creator: "creator_asc",
  tokens: "token_count_desc", tokens_asc: "token_count_asc", comments: "most_commented",
};
// Wyvern: public JSON API, no key; without an account it lists SFW cards only.
// With a search term the site's own client sends no ordering.
const WYVERN_SORTS = { popular: "popular", recommended: "recommended", newest: "created_at", rating: "votes", chats: "messages" };
// Pygmalion: the public Connect API (GET, JSON encoding), SFW without an
// account. Page numbers start at 0 there.
const PYG_API = "https://server.pygmalion.chat/galatea.v1.PublicCharacterService";
const PYG_SORTS = { downloads: "downloads", rating: "stars", views: "views", newest: "approved_at", tokens: "token_count", name: "display_name" };
// JannyAI: search only. Its site searches a public Meilisearch index from the
// browser with this search-only key (a Meilisearch search key is meant to be
// public); the site itself and its download API sit behind a browser check,
// so cards are installed by the user in the browser, never fetched here.
// When the key rotates, search answers 401/403 and the Store says so.
const JANNY_SEARCH_URL = "https://search.jannyai.com/multi-search";
const JANNY_SEARCH_KEY = "88a6463b66e04fb07ba87ee3db06af337f492ce511d93df6e2d2968cb2ff2b30";
const JANNY_SORTS = { newest: ["createdAtStamp:desc"], oldest: ["createdAtStamp:asc"], tokens: ["totalToken:desc"], tokens_asc: ["totalToken:asc"] };
// JannyAI's tag ids as its site names them (the index stores ids only)
const JANNY_TAGS = {
  1: "Male", 2: "Female", 3: "Non-binary", 4: "Celebrity", 5: "OC", 6: "Fictional", 7: "Real", 8: "Game", 9: "Anime",
  10: "Historical", 11: "Royalty", 12: "Detective", 13: "Hero", 14: "Villain", 15: "Magical", 16: "Non-human", 17: "Monster",
  18: "Monster Girl", 19: "Alien", 20: "Robot", 21: "Politics", 22: "Vampire", 23: "Giant", 24: "OpenAI", 25: "Elf",
  26: "Multiple", 27: "VTuber", 28: "Dominant", 29: "Submissive", 30: "Scenario", 31: "Pokemon", 32: "Assistant",
  34: "Non-English", 36: "Philosophy", 38: "RPG", 39: "Religion", 41: "Books", 42: "AnyPOV", 43: "Angst", 44: "Demi-Human",
  45: "Enemies to Lovers", 46: "Smut", 47: "MLM", 48: "WLW", 49: "Action", 50: "Romance", 51: "Horror", 52: "Slice of Life",
  53: "Fantasy", 54: "Drama", 55: "Comedy", 56: "Mystery", 57: "Sci-Fi", 59: "Yandere", 60: "Furry", 61: "Movies/TV",
};
const JANNY_TAG_IDS = Object.fromEntries(Object.entries(JANNY_TAGS).map(([id, name]) => [name.toLowerCase(), Number(id)]));
const jannySlug = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
// where an archived card came from; the site lists these in its own filter
const CV_ORIGINS = ["chub", "sakura", "crushx", "easygirl", "risuai", "nyai", "nsfwaichat", "janny", "Character Archive", "CharaVault"];

function risuItem(c) {
  const desc = typeof c.desc === "string" ? c.desc : "";
  const id = String(c.id || "").toLowerCase();
  const minutes = Number(c.date);
  return {
    id, source: "risurealm",
    name: String(c.name || "Untitled").slice(0, 200),
    creator: typeof c.authorname === "string" ? c.authorname : "",
    tagline: desc.split("\n").find((l) => l.trim())?.slice(0, 500) ?? "",
    description: desc.slice(0, 12000),
    topics: Array.isArray(c.tags) ? c.tags.map(String).slice(0, 30) : [],
    downloads: risuCount(c.download), favorites: 0, tokens: 0, rating: 0, ratingCount: 0, chats: 0, messages: 0,
    nsfw: false,
    avatar: typeof c.img === "string" && /^[0-9a-f]{16,128}$/i.test(c.img) ? "https://sv.risuai.xyz/resource/" + c.img : null,
    maxRes: null,
    createdAt: Number.isFinite(minutes) && minutes > 0 ? new Date(minutes * 60000).toISOString() : null,
    hasLore: c.haslore === true,
    // RisuRealm flags emotion images and other assets separately; for cards
    // both are emotion images in practice
    hasEmotions: c.hasEmotion === true || c.hasAsset === true,
    pageUrl: "https://realm.risuai.net/character/" + id,
  };
}

function cvItem(c) {
  const folder = String(c.folder || "");
  const file = String(c.file || "");
  return {
    id: folder + "/" + file, source: "charavault",
    name: String(c.name || file || "Untitled").slice(0, 200),
    creator: typeof c.creator === "string" ? c.creator : "",
    tagline: typeof c.description_preview === "string" ? c.description_preview.split("\n").find((l) => l.trim())?.slice(0, 500) ?? "" : "",
    description: typeof c.description_preview === "string" ? c.description_preview.slice(0, 12000) : "",
    topics: Array.isArray(c.tags) ? c.tags.map(String).slice(0, 30) : [],
    downloads: Number(c.download_count) || 0, favorites: 0,
    tokens: Number(c.token_count) || 0,
    rating: Number(c.avg_rating) || 0, ratingCount: Number(c.rating_count) || 0, chats: 0, messages: 0,
    nsfw: c.nsfw === true,
    // the site's own grid thumbnail (small webp, no card data inside)
    avatar: folder && file ? "https://charavault.net/cards/thumb/" + encodeURIComponent(folder) + "/" + encodeURIComponent(file) : null,
    maxRes: null,
    createdAt: typeof c.indexed_at === "string" ? c.indexed_at : null,
    hasLore: c.has_lorebook === true,
    pageUrl: "https://charavault.net/cards/" + encodeURIComponent(folder) + "/" + encodeURIComponent(file),
  };
}

const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
const httpsUrl = (v) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);
const firstLine = (s) => String(s || "").split("\n").find((l) => l.trim())?.slice(0, 500) ?? "";
const NO_STATS = { downloads: 0, favorites: 0, tokens: 0, rating: 0, ratingCount: 0, chats: 0, messages: 0 };

function wyvernItem(c) {
  const id = String(c.id || c._id || "");
  const stats = c.entity_statistics && typeof c.entity_statistics === "object" ? c.entity_statistics : {};
  return {
    id, source: "wyvern",
    name: str(c.name, 200) || "Untitled",
    creator: c.creator && typeof c.creator.displayName === "string" ? c.creator.displayName : "",
    tagline: str(c.tagline, 500) || firstLine(c.creator_notes),
    description: str(c.creator_notes, 12000) || str(c.tagline, 12000),
    topics: Array.isArray(c.tags) ? c.tags.map(String).slice(0, 30) : [],
    ...NO_STATS,
    downloads: Number(stats.total_downloads) || 0,
    favorites: Number(c.likes) || 0,
    tokens: Number(c.token_count) || 0,
    chats: Number(stats.total_chats) || 0,
    messages: Number(stats.total_messages) || 0,
    nsfw: typeof c.rating === "string" && c.rating !== "none",
    avatar: httpsUrl(c.avatar), maxRes: httpsUrl(c.avatar),
    createdAt: typeof c.created_at === "string" ? c.created_at : null,
    // Wyvern links its books by id; they are not readable without an account
    hasLore: false, linkedBooks: Array.isArray(c.lorebooks) ? c.lorebooks.length : 0,
    pageUrl: "https://app.wyvern.chat/characters/" + id,
  };
}

function pygItem(c) {
  const id = String(c.id || "").toLowerCase();
  const secs = Number(c.approvedAt || c.createdAt);
  return {
    id, source: "pygmalion",
    name: str(c.displayName, 200) || "Untitled",
    creator: c.owner && typeof c.owner.displayName === "string" ? c.owner.displayName : "",
    tagline: firstLine(c.description), description: str(c.description, 12000),
    topics: Array.isArray(c.tags) ? c.tags.map(String).slice(0, 30) : [],
    ...NO_STATS,
    downloads: Number(c.downloads) || 0, favorites: Number(c.stars) || 0,
    tokens: Number(c.personalityTokenCount) || 0, chats: Number(c.chatCount) || 0,
    nsfw: false,
    avatar: httpsUrl(c.avatarUrl), maxRes: httpsUrl(c.avatarUrl),
    createdAt: Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000).toISOString() : null,
    hasLore: false,
    pageUrl: "https://pygmalion.chat/character/" + id,
  };
}

// JannyAI descriptions are HTML from its editor; the Store shows plain text
const plainText = (html) => String(html || "")
  .replace(/<(br|\/p|\/div|\/li)\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

function jannyItem(h) {
  const id = String(h.id || "");
  const secs = Number(h.createdAtStamp);
  const text = plainText(h.description);
  return {
    id, source: "janny",
    name: str(h.name, 200) || "Untitled", creator: "",
    tagline: firstLine(text), description: text.slice(0, 12000),
    topics: Array.isArray(h.tagIds) ? h.tagIds.map((t) => JANNY_TAGS[t]).filter(Boolean) : [],
    ...NO_STATS,
    tokens: Number(h.totalToken) || 0,
    nsfw: h.isNsfw === true,
    avatar: typeof h.avatar === "string" && /^[\w.-]{1,200}$/.test(h.avatar) ? "https://image.jannyai.com/bot-avatars/" + h.avatar : null,
    maxRes: null,
    createdAt: Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000).toISOString() : null,
    hasLore: false,
    // installed by the user in the browser: the Store opens this page
    browserOnly: true,
    pageUrl: "https://jannyai.com/characters/" + id + "_character-" + jannySlug(h.name),
  };
}

/** A V2 card from Wyvern's character JSON. Greetings live in two places
 *  there (first_mes + alternate_greetings, and the newer greetings list);
 *  both are kept, duplicates dropped. */
function wyvernCard(c) {
  const fromList = Array.isArray(c.greetings) ? c.greetings.map((g) => (g && typeof g.content === "string" ? g.content : "")) : [];
  const all = [str(c.first_mes, 100000), ...fromList, ...(Array.isArray(c.alternate_greetings) ? c.alternate_greetings.map(String) : [])]
    .filter((g, i, arr) => g.trim() && arr.indexOf(g) === i);
  const id = String(c.id || c._id || "");
  return {
    spec: "chara_card_v2", spec_version: "2.0",
    data: {
      name: str(c.name, 200) || "Untitled",
      description: str(c.description, 200000), personality: str(c.personality, 100000), scenario: str(c.scenario, 100000),
      first_mes: all[0] || "", alternate_greetings: all.slice(1), mes_example: str(c.mes_example, 100000),
      creator_notes: str(c.creator_notes, 100000), system_prompt: str(c.pre_history_instructions, 100000),
      post_history_instructions: str(c.post_history_instructions, 100000),
      tags: Array.isArray(c.tags) ? c.tags.map(String).slice(0, 60) : [],
      creator: c.creator && typeof c.creator.displayName === "string" ? c.creator.displayName : "",
      character_version: "",
      extensions: { source: { site: "wyvern", id, url: "https://app.wyvern.chat/characters/" + id } },
    },
  };
}

/** A V2 card from Pygmalion's character JSON (persona, greeting, notes). */
function pygCard(ch) {
  const p = ch.personality && typeof ch.personality === "object" ? ch.personality : {};
  const id = String(ch.id || "").toLowerCase();
  return {
    spec: "chara_card_v2", spec_version: "2.0",
    data: {
      name: str(p.name, 200) || str(ch.displayName, 200) || "Untitled",
      description: str(p.persona, 200000), personality: "", scenario: str(p.scenario, 100000),
      first_mes: str(p.greeting, 100000), alternate_greetings: [], mes_example: str(p.mesExample || p.exampleConversation, 100000),
      creator_notes: [str(ch.description, 20000), str(p.characterNotes, 100000)].filter((s) => s.trim()).join("\n\n"),
      system_prompt: "", post_history_instructions: "",
      tags: Array.isArray(ch.tags) ? ch.tags.map(String).slice(0, 60) : [],
      creator: ch.owner && typeof ch.owner.displayName === "string" ? ch.owner.displayName : "",
      character_version: "",
      extensions: { source: { site: "pygmalion", id, url: "https://pygmalion.chat/character/" + id } },
    },
  };
}

const utf8Base64 = (s) => b64Encode(utf8Encode(s));

/** /marketplace/search and /marketplace/detail for the sources other than
 *  chub. Two-phase like chub: pass A asks host.net, pass B maps the answer. */
function otherSourceSearch(source, b, host) {
  if (!host.net) return { status: 503, json: { error: "network permission not granted" } };
  const search = String(b.search || "").slice(0, 120).trim();
  const page = Math.max(1, Math.min(1000, Math.floor(Number(b.page) || 1)));
  const label = SOURCE_LABELS[source];
  const first = Math.max(1, Math.min(50, Math.floor(Number(b.first) || 24)));
  const tagList = (v) => (Array.isArray(v) ? v : [])
    .filter((t) => typeof t === "string" && t.trim() && t.length <= 60)
    .slice(0, 12).map((t) => t.replace(/,/g, " ").trim()).filter(Boolean);
  const num = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 1000000 ? n : null; };
  let url;
  let spec = null; // a request other than a plain GET
  if (source === "wyvern") {
    const qs = new URLSearchParams({ limit: String(first), page: String(page) });
    if (search) qs.set("q", search);
    else { qs.set("sort", WYVERN_SORTS[String(b.sort)] ?? "popular"); qs.set("order", "DESC"); }
    const tags = tagList(b.tags);
    if (tags.length) qs.set("tags", tags.join(","));
    url = "https://api.wyvern.chat/exploreSearch/characters?" + qs.toString();
  } else if (source === "pygmalion") {
    const message = { query: search, orderBy: PYG_SORTS[String(b.sort)] ?? "downloads", orderDescending: b.sort !== "name", pageSize: first, page: page - 1 };
    url = PYG_API + "/CharacterSearch?" + new URLSearchParams({ connect: "v1", encoding: "json", message: JSON.stringify(message) }).toString();
  } else if (source === "janny") {
    const filter = [];
    if (b.nsfw !== true) filter.push("isNsfw = false");
    if (b.lowQuality !== true) filter.push("isLowQuality = false");
    if (num(b.minTokens) !== null) filter.push("totalToken >= " + num(b.minTokens));
    if (num(b.maxTokens) !== null) filter.push("totalToken <= " + num(b.maxTokens));
    for (const t of tagList(b.tags)) { const tid = JANNY_TAG_IDS[t.toLowerCase()]; if (tid) filter.push("tagIds = " + tid); }
    for (const t of tagList(b.excludeTags)) { const tid = JANNY_TAG_IDS[t.toLowerCase()]; if (tid) filter.push("tagIds != " + tid); }
    const query = { indexUid: "janny-characters", q: search, hitsPerPage: first, page, filter };
    const sort = JANNY_SORTS[String(b.sort)] ?? (search ? null : JANNY_SORTS.newest);
    if (sort) query.sort = sort;
    url = JANNY_SEARCH_URL;
    spec = { method: "POST", body: { queries: [query] }, headers: { authorization: "Bearer " + JANNY_SEARCH_KEY, "content-type": "application/json" } };
  } else if (source === "risurealm") {
    // UNOFFICIAL: RisuRealm has no search API. This reads the data its own
    // search page loads (SvelteKit __data.json). It is not a promised
    // interface and may break when the site changes.
    const qs = new URLSearchParams({ q: search, page: String(page), nsfw: b.nsfw === true ? "true" : "false" });
    // no sort parameter = the site's "recommended" list
    const sort = RISU_SORTS[String(b.sort)];
    if (sort) qs.set("sort", sort);
    url = "https://realm.risuai.net/__data.json?" + qs.toString();
  } else {
    // CharaVault: a public archive with a documented, keyless API (see the
    // API section on charavault.net). Its robots.txt disallows /api/ for
    // crawlers, so this stays at one request per user action and never
    // prefetches downloads.
    const qs = new URLSearchParams({
      q: search, limit: String(first), offset: String((page - 1) * first),
      sort: CV_SORTS[String(b.sort)] ?? "most_downloaded", nsfw: b.nsfw === true ? "true" : "false",
    });
    // same body keys as the chub filters, so the Store reuses its controls;
    // the archive's origin filter ("chub", "risuai", "janny"...) is a tag there
    const tags = tagList(b.tags);
    if (typeof b.origin === "string" && CV_ORIGINS.includes(b.origin)) tags.push(b.origin);
    if (tags.length) qs.set("tags", tags.join(","));
    const excludeTags = tagList(b.excludeTags);
    if (excludeTags.length) qs.set("exclude_tags", excludeTags.join(","));
    if (/^[\w .-]{1,80}$/.test(String(b.creator || ""))) qs.set("creator", String(b.creator));
    if (b.requireLore === true) qs.set("has_book", "true");
    if (num(b.minTokens) !== null) qs.set("token_min", String(num(b.minTokens)));
    if (num(b.maxTokens) !== null) qs.set("token_max", String(num(b.maxTokens)));
    url = "https://charavault.net/api/cards?" + qs.toString();
  }
  if (!Object.keys(host.net.results).length) {
    host.net.request("search", {
      url, json: true, maxBytes: 4 * 1024 * 1024, timeoutMs: CARD_TIMEOUT_MS,
      ...(spec ? { method: spec.method, body: spec.body } : {}),
      headers: { "user-agent": HONEST_UA, accept: "application/json", ...(spec ? spec.headers : {}) },
    });
    return { __llmPending: true };
  }
  const r = host.net.results.search;
  if (!r || !r.ok || !r.json) {
    const e = downloadError(r, label);
    if (source === "janny" && r && (r.status === 401 || r.status === 403)) {
      return { status: 502, json: { error: "JannyAI changed its search key; search there is not available until the app is updated. You can still open jannyai.com, download a card and drop it here." } };
    }
    return { status: e.status, json: { error: e.status === 429 || e.status === 504 ? e.error : "Search on " + label + " failed (" + ((r && (r.status || r.error)) || "no response") + ")." } };
  }
  const shapeError = { status: 502, json: { error: label + " answered in an unknown shape; the site may have changed." } };
  if (source === "wyvern") {
    if (!Array.isArray(r.json.results)) return shapeError;
    const results = r.json.results.filter((c) => c && typeof c === "object" && (c.id || c._id)).map(wyvernItem);
    const total = Number(r.json.total) || results.length;
    return { status: 200, json: { source, count: total, page, first, hasMore: r.json.hasMore === true || page * first < total, results } };
  }
  if (source === "pygmalion") {
    if (!Array.isArray(r.json.characters)) return shapeError;
    const results = r.json.characters.filter((c) => c && typeof c === "object" && UUID_RE.test(String(c.id || ""))).map(pygItem);
    const total = Number(r.json.totalItems) || results.length;
    return { status: 200, json: { source, count: total, page, first, hasMore: page * first < total, results } };
  }
  if (source === "janny") {
    const res = Array.isArray(r.json.results) ? r.json.results[0] : null;
    if (!res || !Array.isArray(res.hits)) return shapeError;
    const results = res.hits.filter((h) => h && typeof h === "object" && /^[\w-]{6,64}$/.test(String(h.id || ""))).map(jannyItem);
    const total = Number(res.totalHits) || results.length;
    return { status: 200, json: { source, count: total, page, first, hasMore: page * first < total, results } };
  }
  if (source === "risurealm") {
    const root = risuNodeRoot(r.json, "cards");
    if (!root || !Array.isArray(root.cards)) return { status: 502, json: { error: "RisuRealm changed its search page; the app cannot read it any more." } };
    const results = root.cards.filter((c) => c && typeof c === "object" && UUID_RE.test(String(c.id || ""))).map(risuItem);
    // the site gives no total: one more page exists while a page comes back full
    const hasMore = root.cards.length >= RISU_PAGE;
    return { status: 200, json: { source, count: (page - 1) * RISU_PAGE + results.length + (hasMore ? 1 : 0), page, first: RISU_PAGE, hasMore, results } };
  }
  const list = Array.isArray(r.json.results) ? r.json.results : null;
  if (!list) return { status: 502, json: { error: "CharaVault answered in an unknown shape." } };
  const results = list.filter((c) => c && typeof c === "object" && c.folder && c.file).map(cvItem);
  const perPage = Number(r.json.limit) || results.length || first;
  const total = Number(r.json.total) || results.length;
  return { status: 200, json: { source, count: total, page, first: perPage, hasMore: page * perPage < total, results } };
}

function otherSourceDetail(source, b, host) {
  if (!host.net) return { status: 503, json: { error: "network permission not granted" } };
  const id = String(b.id || "");
  const label = SOURCE_LABELS[source];
  let url;
  if (source === "janny") {
    // the site is behind a browser check: the listing is all there is
    if (!/^[\w-]{6,64}$/.test(id)) return { status: 400, json: { error: "bad listing id" } };
    return { status: 200, json: { source, id, partial: true, browserOnly: true, greeting: "", alternateGreetings: [], personality: "", scenario: "", exampleDialogs: "", creatorNotes: "", systemPrompt: "", postHistoryInstructions: "", lorebookEntries: 0 } };
  }
  if (source === "wyvern" || source === "pygmalion") {
    const link = classifyCardLink(source === "wyvern" ? "https://app.wyvern.chat/characters/" + id : "https://pygmalion.chat/character/" + id);
    if (link.error) return { status: 400, json: { error: "bad listing id" } };
    url = link.url;
  } else if (source === "risurealm") {
    if (!UUID_RE.test(id)) return { status: 400, json: { error: "bad listing id" } };
    url = "https://realm.risuai.net/character/" + id.toLowerCase() + "/__data.json"; // unofficial, see search
  } else {
    const slash = id.indexOf("/");
    if (slash <= 0 || slash === id.length - 1 || id.length > 600) return { status: 400, json: { error: "bad listing id" } };
    url = "https://charavault.net/api/cards/" + encodeURIComponent(id.slice(0, slash)) + "/" + encodeURIComponent(id.slice(slash + 1));
  }
  if (!Object.keys(host.net.results).length) {
    host.net.request("detail", { url, json: true, maxBytes: 5 * 1024 * 1024, timeoutMs: CARD_TIMEOUT_MS, headers: { "user-agent": HONEST_UA, accept: "application/json" } });
    return { __llmPending: true };
  }
  const r = host.net.results.detail;
  if (!r || !r.ok || !r.json) { const e = downloadError(r, label); return { status: e.status, json: { error: e.error } }; }
  const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  if (source === "risurealm") {
    const root = risuNodeRoot(r.json, "card");
    const c = root && root.card && typeof root.card === "object" ? root.card : null;
    if (!c) return { status: 502, json: { error: "RisuRealm changed its card page; the app cannot read it any more." } };
    // the page shows the author's description only; the card itself comes
    // with the download
    return { status: 200, json: { source, id, partial: true, greeting: "", alternateGreetings: [], personality: "", scenario: "", exampleDialogs: "", creatorNotes: clip(c.desc, 8000), systemPrompt: "", postHistoryInstructions: "", lorebookEntries: c.haslore === true ? -1 : 0 } };
  }
  let d;
  if (source === "wyvern" || source === "pygmalion") {
    const ch = source === "pygmalion" ? r.json.character : r.json;
    if (!ch || typeof ch !== "object") return { status: 502, json: { error: label + " answered in an unknown shape; the site may have changed." } };
    // the same card the install builds, so the preview shows what arrives
    d = (source === "wyvern" ? wyvernCard(ch) : pygCard(ch)).data;
    if (source === "wyvern" && Array.isArray(ch.lorebooks) && ch.lorebooks.length) {
      d = { ...d, creator_notes: d.creator_notes + (d.creator_notes ? "\n\n" : "") + "(This card links " + ch.lorebooks.length + " lorebook(s) on Wyvern; they are not readable without an account and do not come with the import.)" };
    }
  } else {
    const meta = r.json.full_metadata && typeof r.json.full_metadata === "object" ? r.json.full_metadata : null;
    d = meta && meta.data && typeof meta.data === "object" ? meta.data : meta || {};
  }
  const book = d.character_book && typeof d.character_book === "object" ? d.character_book : null;
  return {
    status: 200,
    json: {
      source, id,
      greeting: clip(d.first_mes, 16000),
      alternateGreetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map((g) => String(g).slice(0, 16000)).slice(0, 40) : [],
      personality: clip(d.description, 24000),
      scenario: clip(d.scenario, 8000),
      exampleDialogs: clip(d.mes_example, 16000),
      creatorNotes: clip(d.creator_notes, 8000),
      systemPrompt: clip(d.system_prompt, 8000),
      postHistoryInstructions: clip(d.post_history_instructions, 8000),
      lorebookEntries: book ? (Array.isArray(book.entries) ? book.entries.length : Object.keys(book.entries || {}).length) : 0,
    },
  };
}

/** POST /fetch/card { url } -> { source, sourceLabel, kind, fileName, base64, pageUrl }.
 *  Downloads only; the Store imports the bytes like a dropped file. */
function fetchCardFile(b, host) {
  const link = classifyCardLink(b && b.url);
  if (link.error) return { status: link.status || 400, json: { error: link.error, ...(link.openInBrowser ? { openInBrowser: link.openInBrowser } : {}) } };
  const label = link.source === "url" ? link.service : SOURCE_LABELS[link.source];
  // resolve: where the card FILE is, without fetching it. The Store pulls big
  // files itself through the engine's file route (a plugin's net answer is
  // held in memory, 20 MB at most; image packs make cards of 100 MB+).
  // Wyvern and Pygmalion give JSON fields, not a file: they answer api: true.
  if (b && b.resolve === true) {
    return {
      status: 200,
      json: link.api
        ? { source: link.source, sourceLabel: label, api: true, pageUrl: link.pageUrl }
        : { source: link.source, sourceLabel: label, downloadUrl: link.url, fileBase: fileNameOf(String(link.fileBase).replace(/\.(png|json|charx|card\.png)$/i, "")), pageUrl: link.pageUrl },
    };
  }
  if (!host.net) return { status: 503, json: { error: "network permission not granted" } };
  if (!Object.keys(host.net.results).length) {
    host.net.request("card", {
      url: link.url, ...(link.api ? { json: true, maxBytes: 8 * 1024 * 1024 } : { binary: true, maxBytes: CARD_MAX_BYTES }),
      timeoutMs: CARD_TIMEOUT_MS, headers: { "user-agent": HONEST_UA, ...link.headers },
    });
    return { __llmPending: true };
  }
  const r = host.net.results.card;
  if (link.api) {
    // Wyvern / Pygmalion: card fields as JSON -> a V2 card file for the importer
    if (!r || !r.ok || !r.json) { const e = downloadError(r, label); return { status: e.status, json: { error: e.error } }; }
    const ch = link.source === "pygmalion" ? r.json.character : r.json;
    if (!ch || typeof ch !== "object" || !(ch.name || ch.displayName)) return { status: 502, json: { error: label + " answered in an unknown shape; the site may have changed." } };
    const card = link.source === "wyvern" ? wyvernCard(ch) : pygCard(ch);
    const avatarUrl = httpsUrl(link.source === "wyvern" ? ch.avatar : ch.avatarUrl);
    return {
      status: 200,
      json: {
        source: link.source, sourceLabel: label, kind: "json", fileName: fileNameOf(link.fileBase) + ".json",
        base64: utf8Base64(JSON.stringify(card)), pageUrl: link.pageUrl, ...(avatarUrl ? { avatarUrl } : {}),
        ...(link.source === "wyvern" && Array.isArray(ch.lorebooks) && ch.lorebooks.length ? { skippedBooks: ch.lorebooks.length } : {}),
      },
    };
  }
  if (!r || !r.ok || !r.base64) { const e = downloadError(r, label); return { status: e.status, json: { error: e.error } }; }
  // the engine already refused hosts outside networkHosts; this keeps a
  // redirect inside the service the link belongs to
  let finalHost = "";
  try { finalHost = new URL(String(r.url || link.url)).hostname.toLowerCase(); } catch { /* keep empty */ }
  if (!hostIn(finalHost, link.hosts)) {
    return { status: 422, json: { error: "The link redirected away from " + label + " (to " + (finalHost || "an unknown host") + "). Download the file in your browser and drop it into the Store." } };
  }
  const sniff = sniffCardFile(r.base64);
  if (sniff.error) return { status: 422, json: { error: sniff.error } };
  const ext = "." + sniff.kind;
  const base = fileNameOf(String(link.fileBase).replace(/\.(png|json|charx|card\.png)$/i, ""));
  return {
    status: 200,
    json: { source: link.source, sourceLabel: label, kind: sniff.kind, fileName: base + ext, base64: r.base64, pageUrl: link.pageUrl, ...(sniff.kind === "charx" ? { zipOffset: sniff.zipOffset } : {}) },
  };
}

export function handleRoute(req, host) {
  if (req.method !== "POST") return null;
  if (req.path !== "/import/batch" && req.path !== "/import/zip" && req.path !== "/import/url" && req.path !== "/marketplace/search" && req.path !== "/marketplace/detail" && req.path !== "/fetch/card") return null;
  if (req.path === "/fetch/card") return fetchCardFile(req.body && typeof req.body === "object" ? req.body : {}, host);
  // ---------- Marketplace search (chub.ai today; source id keeps the
  // client shape ready for more storefronts) ----------
  // gateway.chub.ai/search is the catalog the chub frontend itself queries —
  // no auth for public listings, but it insists on a browser user-agent.
  // Two-phase host.net fetch like /import/url; no fs writes here.
  if (req.path === "/marketplace/search") {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const source = String(b.source || "chub");
    if (OTHER_SOURCES.includes(source)) return otherSourceSearch(source, b, host);
    if (source !== "chub") return { status: 400, json: { error: "unknown marketplace source: " + source } };
    if (!host.net) return { status: 503, json: { error: "network permission not granted" } };
    // Orderings the catalog actually accepts — an unknown key is a 400, not a
    // fallback, so every option here is verified. Download order is also the
    // catalog's own default, and a search term filters BEFORE the ordering
    // applies, so there is no separate "relevance" mode to offer.
    const SORTS = { downloads: "download_count", rating: "rating", newest: "created_at", updated: "last_activity_at", tokens: "n_tokens", name: "name", random: "random" };
    // "trending" is NOT an ordering: it swaps the whole searchable pool for a
    // ~1.4k-card hot list. Sent as a sort key it silently shrinks every other
    // filter (a tag inside it returns a handful of cards, or none), so it is
    // its own switch and it replaces the ordering while on.
    const sort = b.trending === true ? "trending" : (SORTS[String(b.sort)] ?? "download_count");
    const search = String(b.search || "").slice(0, 120).trim();
    // creator filter ("by <username>" — chub's own author browse param)
    const username = /^[A-Za-z0-9_.-]{1,80}$/.test(String(b.creator || "")) ? String(b.creator) : "";
    const topicList = (v) => (Array.isArray(v) ? v : [])
      .filter((t) => typeof t === "string" && t.trim() && t.length <= 60)
      .slice(0, 12)
      .map((t) => t.replace(/[,&\s]+/g, " ").trim())
      .filter(Boolean);
    const tags = topicList(b.tags);
    const excludeTags = topicList(b.excludeTags);
    const page = Math.max(1, Math.min(1000, Math.floor(Number(b.page) || 1)));
    const first = Math.max(1, Math.min(50, Math.floor(Number(b.first) || 24)));
    const qs = new URLSearchParams({ namespace: "characters", first: String(first), page: String(page) });
    if (sort) qs.set("sort", sort);
    if (search) qs.set("search", search);
    if (username) qs.set("username", username);
    // Maturity: the catalog hides adult listings unless asked, so an absent
    // flag is NOT "no opinion" — it silently cuts the pool by ~95%. Always
    // state all three.
    qs.set("nsfw", b.nsfw === false ? "false" : "true");
    qs.set("nsfl", b.nsfl === true ? "true" : "false");
    qs.set("nsfw_only", b.nsfwOnly === true ? "true" : "false");
    qs.set("include_forks", b.includeForks === false ? "false" : "true");
    // topics=a,b is AND; inclusive_or flips the whole set to OR. (tags_mode
    // is not a parameter the catalog reads — it silently stayed AND.)
    if (tags.length) {
      qs.set("topics", tags.join(","));
      if (String(b.tagsMode) === "any") qs.set("inclusive_or", "true");
    }
    if (excludeTags.length) qs.set("excludetopics", excludeTags.join(","));
    // numeric narrowing — only sent when the client actually set one
    const num = (v, lo, hi) => {
      const n = Math.floor(Number(v));
      return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
    };
    const minTokens = num(b.minTokens, 1, 1000000);
    const maxTokens = num(b.maxTokens, 1, 1000000);
    const maxDaysAgo = num(b.maxDaysAgo, 1, 36500);
    const minAiRating = num(b.minAiRating, 1, 5);
    const minTags = num(b.minTags, 1, 50);
    if (minTokens !== null) qs.set("min_tokens", String(minTokens));
    if (maxTokens !== null) qs.set("max_tokens", String(maxTokens));
    if (maxDaysAgo !== null) qs.set("max_days_ago", String(maxDaysAgo));
    if (minAiRating !== null) qs.set("min_ai_rating", String(minAiRating));
    if (minTags !== null) qs.set("min_tags", String(minTags));
    // "must have" flags: only the enabled ones are sent (false narrows nothing)
    const REQUIRES = {
      requireExamples: "require_example_dialogues",
      requireLore: "require_lore",
      requireLoreEmbedded: "require_lore_embedded",
      requireLoreLinked: "require_lore_linked",
      requireGreetings: "require_alternate_greetings",
      requireCustomPrompt: "require_custom_prompt",
      requireImages: "require_images",
      requireExpressions: "require_expressions",
    };
    for (const key of Object.keys(REQUIRES)) if (b[key] === true) qs.set(REQUIRES[key], "true");
    if (!Object.keys(host.net.results).length) {
      host.net.request("search", {
        url: "https://gateway.chub.ai/search?" + qs.toString(),
        json: true, maxBytes: 4 * 1024 * 1024,
        headers: { "user-agent": BROWSER_UA, accept: "application/json" },
      });
      return { __llmPending: true };
    }
    const r = host.net.results.search;
    const data = r && r.ok && r.json && typeof r.json.data === "object" ? r.json.data : null;
    if (!data) {
      return { status: 502, json: { error: "chub search failed (" + ((r && (r.status || r.error)) || "no response") + ")" } };
    }
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const results = nodes.map((n) => {
      const fullPath = String(n.fullPath || "");
      const topics = Array.isArray(n.topics) ? n.topics.map(String).slice(0, 30) : [];
      return {
        // "user/slug" — the stable id used for the download URL and dedupe
        id: fullPath,
        name: String(n.name || fullPath.split("/")[1] || "Untitled"),
        creator: fullPath.split("/")[0] || "",
        tagline: typeof n.tagline === "string" ? n.tagline.slice(0, 500) : "",
        description: typeof n.description === "string" ? n.description.slice(0, 12000) : "",
        topics,
        // chub naming quirk: starCount IS the download count; n_favorites is
        // the real "likes". nTokens is their token estimate for the card.
        downloads: Number(n.starCount) || 0,
        favorites: Number(n.n_favorites) || 0,
        tokens: Number(n.nTokens) || 0,
        rating: Number(n.rating) || 0,
        ratingCount: Number(n.ratingCount) || 0,
        chats: Number(n.nChats) || 0,
        messages: Number(n.nMessages) || 0,
        // the adult flag on the listing only covers the ARTWORK — an adult
        // card with a tame avatar carries it in its topics instead
        nsfw: n.nsfw_image === true || topics.some((t) => t.toLowerCase() === "nsfw"),
        avatar: typeof n.avatar_url === "string" ? n.avatar_url : null,
        // full-resolution card image; the client downscales it into the
        // imported character's avatar (the listing avatar is a 200px thumb)
        maxRes: typeof n.max_res_url === "string" ? n.max_res_url : null,
        createdAt: typeof n.createdAt === "string" ? n.createdAt : null,
      };
    }).filter((x) => x.id && x.name);
    return {
      status: 200,
      json: { source, count: Number(data.count) || results.length, page: Number(data.page) || page, first, results },
    };
  }

  // ---------- Marketplace detail (full card definition, chub) ----------
  // The listing gives name/tagline/stats; this fetches the actual card fields
  // (greeting, personality, scenario, examples, alternate greetings) so the
  // preview dialog shows exactly what a download brings in.
  if (req.path === "/marketplace/detail") {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const source = String(b.source || "chub");
    if (OTHER_SOURCES.includes(source)) return otherSourceDetail(source, b, host);
    if (source !== "chub") return { status: 400, json: { error: "unknown marketplace source: " + source } };
    if (!host.net) return { status: 503, json: { error: "network permission not granted" } };
    const id = String(b.id || "");
    const parts = /^([A-Za-z0-9_.-]{1,80})\/([A-Za-z0-9_.-]{1,120})$/.exec(id);
    if (!parts) return { status: 400, json: { error: "bad listing id" } };
    if (!Object.keys(host.net.results).length) {
      host.net.request("detail", {
        url: "https://api.chub.ai/api/characters/" + encodeURIComponent(parts[1]) + "/" + encodeURIComponent(parts[2]) + "?full=true",
        json: true, maxBytes: 5 * 1024 * 1024,
        headers: { "user-agent": BROWSER_UA, accept: "application/json" },
      });
      return { __llmPending: true };
    }
    const r = host.net.results.detail;
    const node = r && r.ok && r.json && r.json.node ? r.json.node : null;
    if (!node) {
      return { status: 502, json: { error: "chub detail failed (" + ((r && (r.status || r.error)) || "no response") + ")" } };
    }
    const d = node.definition && typeof node.definition === "object" ? node.definition : {};
    const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
    const book = d.embedded_lorebook && typeof d.embedded_lorebook === "object" ? d.embedded_lorebook : null;
    const bookEntries = book ? (Array.isArray(book.entries) ? book.entries.length : Object.keys(book.entries || {}).length) : 0;
    return {
      status: 200,
      json: {
        source, id,
        greeting: clip(d.first_message, 16000),
        alternateGreetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map((g) => String(g).slice(0, 16000)).slice(0, 40) : [],
        personality: clip(d.personality, 24000),
        scenario: clip(d.scenario, 8000),
        exampleDialogs: clip(d.example_dialogs, 16000),
        creatorNotes: clip(d.description, 8000),
        systemPrompt: clip(d.system_prompt, 8000),
        postHistoryInstructions: clip(d.post_history_instructions, 8000),
        lorebookEntries: bookEntries,
      },
    };
  }

  const fsx = host.fs;
  const writeJson = (rel, v) => fsx.write(rel, JSON.stringify(v, null, 2) + "\n");
  const readJson = (rel, fb) => { try { return JSON.parse(fsx.read(rel)); } catch { return fb; } };
  const summary = { characters: [], groups: [], lorebooks: [], presets: [], regex: [], personas: [], themes: [], chats: [], databank: [], errors: [], notes: [] };
  const used = new Set();
  // Id collision guard: dedupes within THIS import batch AND against what
  // already exists on disk — re-importing the same card must never silently
  // overwrite the earlier one (its gallery/edits would be lost).
  const taken = (rel) => { try { fsx.read(rel); return true; } catch { return false; } };
  const uid = (base, dir) => {
    let id = base, n = 2;
    const hit = (x) => used.has(x) || (dir && (taken(dir + "/" + x + "/card.json") || taken(dir + "/" + x + ".json") || taken(dir + "/" + x + ".meta.json")));
    while (hit(id)) id = base + "-" + n++;
    used.add(id);
    return id;
  };

  // ---------- URL import (chub / CharacterHub card links) ----------
  // Page link → character detail JSON + the embedded-card PNG from the CDN
  // (both two-phase host.net fetches, no credentials, manifest allowlist
  // enforced host-side). The PNG card wins (full fidelity incl. v3); the
  // detail JSON is the fallback and fills any missing fields.
  if (req.path === "/import/url") {

    const url = String((req.body && req.body.url) || "");
    if (!url.startsWith("https://")) return { status: 400, json: { error: "https URL required" } };
    if (!host.net) return { status: 503, json: { error: "network permission not granted" } };
    const UA = BROWSER_UA;
    const page = /^https:\/\/(?:www\.)?(?:chub\.ai|characterhub\.(?:ai|org))\/characters\/([^/\s?#]+)\/([^/\s?#]+)/.exec(url)
      || /^https:\/\/api\.chub\.ai\/api\/characters\/([^/\s?#]+)\/([^/\s?#]+)/.exec(url);
    if (!page) {
      if (/^https:\/\/[^/]*chub\.ai|^https:\/\/[^/]*characterhub\.(?:ai|org)/.test(url)) {
        return { status: 400, json: { error: "not a character link — use https://chub.ai/characters/<user>/<name>" } };
      }
      return { status: 400, json: { error: "not a chub / CharacterHub character link" } };
    }
    const [, user, nameSlug] = page;
    // optional client-downscaled avatar (data URI). Wins over the 200px
    // chub thumbnail the importer would otherwise keep.
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const avatarOverride = typeof b.avatar === "string" && b.avatar.startsWith("data:image/") && b.avatar.length < 900 * 1024 ? b.avatar : null;
    const requests = {
      png: { url: "https://avatars.charhub.io/avatars/" + encodeURIComponent(user) + "/" + encodeURIComponent(nameSlug) + "/chara_card_v2.png", binary: true, maxBytes: 16 * 1024 * 1024 },
      detail: { url: "https://api.chub.ai/api/characters/" + encodeURIComponent(user) + "/" + encodeURIComponent(nameSlug) + "?full=true", json: true, maxBytes: 5 * 1024 * 1024 },
      webp: { url: "https://avatars.charhub.io/avatars/" + encodeURIComponent(user) + "/" + encodeURIComponent(nameSlug) + "/avatar.webp", binary: true, maxBytes: 8 * 1024 * 1024 },
    };
    if (!Object.keys(host.net.results).length) {
      for (const k of Object.keys(requests)) {
        const spec = requests[k];
        host.net.request(k, { ...spec, headers: { "user-agent": UA, accept: spec.binary ? "image/*" : "application/json" } });
      }
      return { __llmPending: true };
    }
    // pass B: PNG card first, detail JSON second, webp only as avatar filler
    const png = host.net.results.png;
    const detail = host.net.results.detail;
    const webp = host.net.results.webp;
    // avatars come from the small webp variant — the card PNG is multi-MB and
    // only exists to carry the embedded card JSON
    const avatarOf = (r, mime) => (r && r.ok && r.base64 && r.base64.length < 700000 ? "data:" + mime + ";base64," + r.base64 : null);
    let card = null;
    let avatar = avatarOverride;
    if (png && png.ok && png.base64) {
      card = cardFromPngBase64(png.base64);
      // the PNG only exists to carry the embedded card JSON — the avatar comes
    // from the small webp variant whenever it arrived
      avatar = avatar || avatarOf(webp, "image/webp");
    }
    if (!card && detail && detail.ok && detail.json && detail.json.node) {
      const n = detail.json.node;
      const d = n.definition || {};
      card = {
        spec: "chara_card_v2", spec_version: "2.0",
        name: d.name || n.name || nameSlug,
        description: d.personality || "",
        personality: d.tavern_personality || "",
        scenario: d.scenario || "",
        first_mes: d.first_message || "",
        mes_example: d.example_dialogs || "",
        creator_notes: d.description || "",
        system_prompt: d.system_prompt || "",
        post_history_instructions: d.post_history_instructions || "",
        alternate_greetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map(String) : [],
        tags: Array.isArray(n.topics) ? n.topics.map(String) : [],
        creator: user,
        ...(d.embedded_lorebook && typeof d.embedded_lorebook === "object" ? { character_book: d.embedded_lorebook } : {}),
        ...(d.extensions && typeof d.extensions === "object" ? { extensions: d.extensions } : {}),
      };
      avatar = avatar || avatarOf(webp, "image/webp") || (typeof n.avatar_url === "string" ? n.avatar_url : null);
    }
    if (!card) {
      const why = [];
      if (png && !png.ok) why.push("card image " + (png.status || png.error || "failed"));
      if (detail && !detail.ok) why.push("detail " + (detail.status || detail.error || "failed"));
      return { status: 502, json: { error: "no character card found at that URL" + (why.length ? " (" + why.join("; ") + ")" : "") } };
    }
    const n = normalizeCard(card, avatar || undefined);
        if (!n) return { status: 502, json: { error: "the card at that URL was not recognizable" } };
    writeCardWithBook(n, card, null, avatar || undefined);
    return { status: 200, json: { ...summary, name: n.name } };
  }

  // Hoisted so the /import/url handler above can call it before this line.
  function writeCard(card) {
    const id = uid(slug(card.name), "characters");
    writeJson("characters/" + id + "/card.json", card);
    summary.characters.push(id);
    // regex scripts a card carries run for that character only
    const embedded = card.extensions && Array.isArray(card.extensions.regex_scripts) ? card.extensions.regex_scripts : [];
    embedded.forEach((raw, i) => {
      const n = normalizeRegex(raw);
      if (!n) return;
      const rid = uid(slug(n.scriptName), "regex");
      writeJson("regex/" + rid + ".json", { ...n, id: rid, scope: "character", scopeTargetId: id, order: i });
      summary.regex.push(rid);
    });
  }
  /** Cards may embed a lorebook — write it as a book file and link it via
   *  the card's studio bag so the app scopes it to that character. charx
   *  packages also carry assets: the icon/main avatar and emotion sprites
   *  resolve from the package bytes (assetDict) or inline data: URIs. */
  function writeCardWithBook(card, raw, assetDict, sourceAvatar, fallbackAvatar) {
    if (!card) return;
    const src = raw && raw.data && typeof raw.data === "object" && raw.data.character_book ? raw.data : raw;
    const book = src && src.character_book && typeof src.character_book === "object" ? src.character_book : null;
    const world = book ? embeddedBookToWorld(book) : null;
    if (world) {
      const n = normalizeBook(world, (typeof book.name === "string" && book.name) || card.name + " lore");
      if (n) {
        n.isEmbedded = true;
        // card-spec book-level knobs — full settings shape so the client's
        // replace-on-read doesn't lose the other defaults
        const st = { scanDepth: 4, contextPercent: 25, budgetCap: 0, minActivations: 0, maxRecursion: 2, insertionStrategy: "character_first", caseSensitive: false, wholeWords: true, groupScoring: false, recursiveScan: true, includeNames: true, overflowAlert: true };
        if (typeof book.scan_depth === "number" && book.scan_depth >= 0) st.scanDepth = Math.floor(book.scan_depth);
        if (book.recursive_scanning === false) st.recursiveScan = false;
        n.settings = st;
        const id = uid(slug(n.name), "lorebooks");
        writeJson("lorebooks/" + id + ".json", { ...n, id });
        summary.lorebooks.push(id);
        card.studio = { ...card.studio, embeddedLorebookId: id };
      }
    }
    if (Array.isArray(card.assets)) {
      const resolved = resolveCardAssets(card, assetDict || {}, sourceAvatar || null);
      if (resolved.avatar) card.avatar = resolved.avatar;
      if (resolved.expressions.length) {
        card.studio = { ...card.studio, expressions: resolved.expressions };
      }
      if (resolved.skipped) {
        summary.notes.push(card.name + ": " + resolved.skipped + " emotion image(s) left out, the card file would grow past its size limit");
      }
    }
    // a package whose main icon is missing or too large for the avatar
    // field: the browser sends a downscaled one (see the /import/zip charx path)
    if (!card.avatar && fallbackAvatar) card.avatar = fallbackAvatar;
    writeCard(card);
  }
  // Ids are re-minted on the way in, so anything that pointed at an id in the
  // backup has to be re-pointed by NAME. These record what each name became.
  const bookIdByName = new Map();
  const presetIdByName = new Map();
  const personaIdByName = new Map();
  const charIdByName = () => {
    const m = new Map();
    try {
      for (const cid of fsx.list("characters")) {
        const card = readJson("characters/" + cid + "/card.json", null);
        if (card && card.name) m.set(String(card.name).toLowerCase(), cid);
      }
    } catch {}
    return m;
  };
  const lower = (v) => String(v ?? "").toLowerCase();
  const writeBook = (n, fallback, studio) => {
    if (!n) return;
    const id = uid(slug(n.name || fallback || "book"), "lorebooks");
    // book-level knobs an export carries alongside the public entry list:
    // without them a restored book comes back switched off, with stock scan
    // settings and no link to the cards it belonged to
    const extra = studio && typeof studio === "object"
      ? {
          ...(studio.settings ? { settings: studio.settings } : {}),
          ...(studio.globalActive === true ? { globalActive: true } : {}),
          ...(studio.folderId ? { folderId: studio.folderId } : {}),
          ...(studio.vectorized === true ? { vectorized: true } : {}),
          ...(Array.isArray(studio._linkedNames) && studio._linkedNames.length
            ? { linkedCharacterIds: studio._linkedNames.map((nm) => charIdByName().get(lower(nm))).filter(Boolean) }
            : {}),
        }
      : {};
    writeJson("lorebooks/" + id + ".json", { ...n, ...extra, id });
    bookIdByName.set(lower(n.name || fallback), id);
    summary.lorebooks.push(id);
  };
  const writePreset = (n) => {
    if (!n) return;
    const id = uid(slug(n.name || "preset"), "presets");
    writeJson("presets/" + id + ".json", { ...n, id });
    presetIdByName.set(lower(n.name), id);
    summary.presets.push(id);
  };
  const writeRegex = (n) => {
    if (!n) return;
    const id = uid(slug(n.scriptName), "regex");
    writeJson("regex/" + id + ".json", { ...n, id });
    summary.regex.push(id);
  };
  /** A persona from a backup. `full` is the complete record when the zip
   *  carried one — the flat {name: description} map foreign tools write is
   *  all most backups have, and rebuilding from it alone is what dropped the
   *  avatar, title, pronouns, bound cards, linked books and default flag. */
  const writePersona = (name, description, full) => {
    if (!name) return;
    const id = uid(slug(name), "personas");
    const rest = {};
    if (full && typeof full === "object") {
      for (const [k, v] of Object.entries(full)) {
        if (k === "id" || k === "name" || k === "description" || k.startsWith("_")) continue;
        if (k === "lorebookIds" || k === "boundCharacterIds") continue;
        rest[k] = v;
      }
      if (Array.isArray(full._lorebookNames) && full._lorebookNames.length) {
        rest.lorebookIds = full._lorebookNames.map((nm) => bookIdByName.get(lower(nm))).filter(Boolean);
      }
      if (Array.isArray(full._boundNames) && full._boundNames.length) {
        const byName = charIdByName();
        rest.boundCharacterIds = full._boundNames.map((nm) => byName.get(lower(nm))).filter(Boolean);
      }
    }
    writeJson("personas/" + id + ".json", { ...rest, id, name, description: description || "" });
    personaIdByName.set(lower(name), id);
    summary.personas.push(id);
  };
  /** `saved` is the chat's own meta when the backup carried one: everything
   *  ABOUT the conversation (its preset, persona, model, author's note,
   *  summary, memory cutoff, folder, tags, card variant, branch parentage).
   *  Without it every restored chat landed on the default preset and no
   *  persona, which is exactly what a move to a second device looked like. */
  const writeChat = (n, characterId, groupId, saved) => {
    const id = uid(slug(n.title), "chats");
    // pinned to the persona in use at import, like a chat made in the app
    const personaId = readJson("settings.json", {}).personaId || null;
    const persona = personaId ? readJson("personas/" + personaId + ".json", null) : null;
    const meta = {
      id, title: n.title, characterId: characterId || null, groupId: groupId || null,
      presetId: "default", personaId: persona ? personaId : null, model: null, userName: (persona && persona.name) || "User",
      authorNote: null, lorebookIds: [], createdAt: Date.now(), updatedAt: Date.now(), tainted: true,
    };
    if (saved && typeof saved === "object") {
      // ids are re-minted on import; carry the rest of the meta straight over
      const SKIP = new Set(["id", "characterId", "groupId", "presetId", "personaId", "lorebookIds"]);
      for (const [k, v] of Object.entries(saved)) {
        if (SKIP.has(k) || k.startsWith("_")) continue;
        meta[k] = v;
      }
      if (typeof saved.title === "string" && saved.title.trim()) meta.title = saved.title;
      const wantPreset = presetIdByName.get(lower(saved._presetName));
      if (wantPreset) meta.presetId = wantPreset;
      const wantPersona = personaIdByName.get(lower(saved._personaName));
      if (wantPersona) {
        meta.personaId = wantPersona;
        const p = readJson("personas/" + wantPersona + ".json", null);
        if (p && p.name) meta.userName = p.name;
      }
      if (Array.isArray(saved._lorebookNames)) {
        meta.lorebookIds = saved._lorebookNames.map((nm) => bookIdByName.get(lower(nm))).filter(Boolean);
      }
      // branch parentage points at chat ids from the other machine; the
      // restored chats are new files, so a stale parent would render a
      // branch tree that leads nowhere
      delete meta.parentChatId;
      delete meta.parentMessageId;
      meta.id = id;
      meta.characterId = characterId || null;
      meta.groupId = groupId || null;
    }
    fsx.write("chats/" + id + ".jsonl", n.msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
    writeJson("chats/" + id + ".meta.json", meta);
    if (Array.isArray(n.memories) && n.memories.length) {
      writeJson("chats/" + id + ".memories.json", n.memories);
    }
    summary.chats.push(id);
    return id;
  };

  // ---------- browser-driven batch (can include PNG-extracted cards) ----------
  if (req.path === "/import/batch") {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    for (const c of b.cards || []) {
      try {
        let raw = null;
        let avatar = null;
        let assetDict = null;
        if (typeof c === "string") {
          raw = extractCardFromPng(b64ToBytes(c.replace(/^data:[^,]*,/, "")));
        } else if (c && typeof c === "object") {
          // three shapes: {card, avatar, assets?} from the UI, {pngBase64, avatar}, or a bare card
          raw = c.pngBase64 ? extractCardFromPng(b64ToBytes(String(c.pngBase64).replace(/^data:[^,]*,/, ""))) : (c.card ?? c);
          avatar = typeof c.avatar === "string" ? c.avatar : null;
          // V3 PNG cards (RisuAI) carry their emotion images in chara-ext-asset_:N
          // chunks; the UI reads them and sends { "N": base64 } for the
          // card's "__asset:N" uris (resolveCardAssets caps each one)
          if (c.card && c.assets && typeof c.assets === "object" && !Array.isArray(c.assets)) {
            assetDict = {};
            for (const k of Object.keys(c.assets).slice(0, 300)) {
              if (/^[\w.-]{1,40}$/.test(k) && typeof c.assets[k] === "string") assetDict[k] = c.assets[k];
            }
          }
        }
        const n = normalizeCard(raw, avatar);
        if (!n) { summary.errors.push("card skipped: no name or unparseable"); continue; }
        writeCardWithBook(n, raw, assetDict, avatar || undefined);
      } catch (err) { summary.errors.push("card failed: " + String((err && err.message) || err).slice(0, 100)); }
    }
    for (const w of b.worldInfo || []) {
      // world files carry no name — the UI passes the file name as `name`
      try { writeBook(normalizeBook(w, "imported-book"), "imported-book"); } catch { summary.errors.push("world info failed"); }
    }
    for (const p of b.presets || []) {
      try { writePreset(restorePreset(p)); } catch { summary.errors.push("preset failed"); }
    }
    for (const r of b.regex || []) {
      try { writeRegex(normalizeRegex(r)); } catch { summary.errors.push("regex failed"); }
    }
    for (const per of b.personas || []) {
      try { if (per && per.name) writePersona(per.name, per.description); } catch { summary.errors.push("persona failed"); }
    }
    for (const t of b.themes || []) {
      try {
        if (!t || typeof t.name !== "string") continue;
        const id = uid(slug(t.name), "themes");
        writeJson("themes/" + id + ".json", {
          id, name: t.name,
          colors: {
            text: typeof t.main_text_color === "string" ? t.main_text_color : undefined,
            background: typeof t.chat_tint_color === "string" ? t.chat_tint_color : undefined,
            panel: typeof t.main_color === "string" ? t.main_color : undefined,
            accent: typeof t.theme_color === "string" ? t.theme_color : undefined,
          },
        });
        summary.themes.push(id);
      } catch { summary.errors.push("theme failed"); }
    }
    for (const c of b.chats || []) {
      try {
        const n = normalizeChatLines(c);
        if (!n) continue;
        // link to a character by name when one matches
        let characterId = null;
        try {
          for (const cid of fsx.list("characters")) {
            const card = readJson("characters/" + cid + "/card.json", null);
            if (card && c.character && card.name.toLowerCase() === String(c.character).toLowerCase()) { characterId = cid; break; }
          }
        } catch {}
        writeChat(n, characterId);
      } catch { summary.errors.push("chat failed"); }
    }
    return { status: 200, json: summary };
  }

  // ---------- plugin-side zip (text entries only) ----------
  if (req.path === "/import/zip") {
    const rawEntries = host.zip.entries();
    const entries = {};
    const names = Object.keys(rawEntries);
    const isText = (v) => typeof v === "string";

    // Foreign backup layouts normalize to our tree first. The old rule matched
    // one exact nesting (data/<x>/default-user/…) and nothing else, so the
    // three ways people actually make these zips — the tool's own backup, the
    // data folder, the whole install directory — all arrived as unrecognized
    // paths and imported nothing. Anchor on the collection folder instead of
    // the wrapper: whatever sits above "characters/" or "worlds/" is somebody's
    // folder name and none of our business.
    for (const raw of names) {
      if (raw.endsWith(".charx")) continue; // handled as files, not zips
      const name = normalizeEntryName(raw);
      if (entries[name] === undefined) entries[name] = rawEntries[raw];
    }

    // charx package: card.json at the root + assets/ entries the card
    // references by __asset:/embeded:// URIs
    if (isText(entries["card.json"])) {
      try {
        const assetDict = {};
        for (const name of Object.keys(entries)) {
          const b64 = entryBase64(entries[name]);
          if (b64) assetDict[name] = b64;
        }
        const parsed = JSON.parse(entries["card.json"]);
        const card = normalizeCard(parsed);
        // optional downscaled portrait from the browser (it can unzip and resize)
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const fallback = typeof body.avatar === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(body.avatar) && body.avatar.length < 900 * 1024 ? body.avatar : null;
        // downscaled images from the browser win over the package originals
        if (body.assets && typeof body.assets === "object" && !Array.isArray(body.assets)) {
          for (const k of Object.keys(body.assets).slice(0, 300)) {
            const v = body.assets[k];
            if (typeof v === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(v) && k.length <= 200) assetDict[k] = v;
          }
        }
        if (card) { writeCardWithBook(card, parsed, assetDict, null, fallback); return { status: 200, json: { ...summary, name: card.name } }; }
      } catch {}
      return { status: 400, json: { error: "charx package has no readable card.json" } };
    }

    // Preset and persona MAPS first: a chat's meta names the preset and
    // persona it rides, so they have to exist before any chat is written.
    const presetsText = entries["User Settings/openai_settings.json"];
    if (isText(presetsText)) {
      try {
        const all = JSON.parse(presetsText);
        // the map key IS the preset's name — pass it through so restored
        // presets keep their names instead of all landing on "imported"
        for (const [presetName, preset] of Object.entries(all ?? {})) writePreset(restorePreset(preset, presetName));
      } catch { summary.errors.push("presets failed"); }
    }
    for (const rname of Object.keys(entries)) {
      if (!rname.startsWith("User Settings/regex/") || !rname.endsWith(".json") || !isText(entries[rname])) continue;
      try { writeRegex(normalizeRegex(JSON.parse(entries[rname]))); } catch { summary.errors.push("regex failed: " + rname); }
    }
    // The flat {name: description} map is the lowest common denominator; skip
    // it when the zip also carries full persona records, or every persona
    // would be imported twice — once whole, once as a bare name.
    const hasFullPersonas = Object.keys(entries).some((n) => n.startsWith("personas/") && n.endsWith(".json"));
    for (const flat of ["User Settings/personas.json", "personas.json"]) {
      if (hasFullPersonas || !isText(entries[flat])) continue;
      try {
        const map = JSON.parse(entries[flat]);
        for (const [pname, v] of Object.entries(map ?? {})) {
          writePersona(pname, typeof v === "string" ? v : String((v && v.description) || ""));
        }
      } catch { summary.errors.push("personas failed: " + flat); }
    }
    // A foreign tool keeps its personas inside its settings file instead: a
    // map of avatar file → name, plus a parallel map of descriptions.
    if (!hasFullPersonas && isText(entries["settings.json"])) {
      try {
        const st = JSON.parse(entries["settings.json"]);
        const descs = st && typeof st.persona_descriptions === "object" && st.persona_descriptions ? st.persona_descriptions : {};
        const namesMap = st && typeof st.personas === "object" && st.personas ? st.personas : null;
        for (const [avatarKey, pname] of Object.entries(namesMap ?? {})) {
          const d = descs[avatarKey];
          writePersona(String(pname || avatarKey), String((d && d.description) || ""));
        }
      } catch { summary.errors.push("personas failed: settings.json"); }
    }

    // Order matters: a chat resolves its character, group, preset, persona
    // and books by NAME, and a persona resolves its books and bound cards the
    // same way. One pass in whatever order the zip's central directory
    // happened to list things left half of those unresolved.
    const PHASES = ["characters/", "worlds/", "lorebooks/", "presets/", "openai settings/", "textgen settings/", "extensions/regex/", "regex/", "personas/", "groups/", "chats/", "databank/"];
    const phaseOf = (n) => {
      const l = n.toLowerCase();
      for (let i = 0; i < PHASES.length; i++) if (l.startsWith(PHASES[i])) return i;
      return PHASES.length;
    };
    const orderedNames = Object.keys(entries).sort((a, b) => phaseOf(a) - phaseOf(b) || (a < b ? -1 : a > b ? 1 : 0));
    for (const name of orderedNames) {
      // A card PNG lives in characters/, or loose at the root when someone
      // zipped a pile of cards. Anywhere else (persona and user avatars,
      // backgrounds, sprites) a .png is just a picture — reading it as a
      // failed card would bury the real errors in noise.
      if (name.endsWith(".png") && (name.startsWith("characters/") || !name.includes("/"))) {
        const b64 = entryBase64(entries[name]);
        if (b64) {
          const rawCard = cardFromPngBase64(b64);
          const n = rawCard && normalizeCard(rawCard);
          // ccdefault: assets point at the card PNG itself
          if (n) writeCardWithBook(n, rawCard, null, "data:image/png;base64," + b64);
          else if (name.startsWith("characters/")) summary.errors.push("png card without embedded data: " + name);
        } else if (name.startsWith("characters/")) {
          summary.errors.push("png card too large to read from the zip — import it directly from the Import button: " + name);
        }
        continue;
      }
      if (name.startsWith("characters/") && name.endsWith(".json") && isText(entries[name])) {
        try {
          const parsed = JSON.parse(entries[name]);
          const n = normalizeCard(parsed);
          if (n) writeCardWithBook(n, parsed, null, typeof parsed.avatar === "string" ? parsed.avatar : undefined);
        } catch { summary.errors.push("card failed: " + name); }
        continue;
      }
      if ((name.startsWith("worlds/") || name.startsWith("lorebooks/")) && name.endsWith(".json") && isText(entries[name])) {
        try {
          const fallback = name.split("/").pop().replace(/\.json$/i, "");
          const raw = JSON.parse(entries[name]);
          writeBook(normalizeBook(raw, fallback), fallback, raw && raw._studio);
        } catch { summary.errors.push("world failed: " + name); }
        continue;
      }
      // A foreign tool files chat-completion and text-completion presets under
      // their own folders, one file per preset, named by the file.
      if (/^(?:openai|textgen) settings\//i.test(name) && name.endsWith(".json") && isText(entries[name])) {
        try {
          const n = restorePreset(JSON.parse(entries[name]), name.split("/").pop().replace(/\.json$/i, ""));
          if (n) writePreset(n);
        } catch { summary.errors.push("preset failed: " + name); }
        continue;
      }
      if (name.startsWith("regex/") && name.endsWith(".json") && isText(entries[name])) {
        try {
          const raw = JSON.parse(entries[name]);
          for (const one of Array.isArray(raw) ? raw : [raw]) writeRegex(normalizeRegex(one));
        } catch { summary.errors.push("regex failed: " + name); }
        continue;
      }
      if (name.startsWith("databank/") && name.endsWith(".json") && isText(entries[name])) {
        try {
          const d = JSON.parse(entries[name]);
          if (d && typeof d === "object" && Array.isArray(d.chunks)) {
            const did = uid(slug(d.name || "doc"), "databank");
            writeJson("databank/" + did + ".json", { ...d, id: did });
            summary.databank.push(did);
          }
        } catch { summary.errors.push("databank failed: " + name); }
        continue;
      }
      if (name.startsWith("groups/") && name.endsWith(".json") && isText(entries[name])) {
        try {
          const g = JSON.parse(entries[name]);
          // characters were re-created under name-derived ids — remap each
          // member by original id first, then by the exported _memberNames
          const memberIds = (g.memberIds || []).map((mid, i) => {
            if (fsx.list("characters").includes(mid)) return mid;
            const nm = (g._memberNames || [])[i];
            if (!nm) return null;
            try {
              for (const cid of fsx.list("characters")) {
                const card = readJson("characters/" + cid + "/card.json", null);
                if (card && card.name === nm) return cid;
              }
            } catch {}
            return null;
          }).filter(Boolean);
          // the id lands in the write path: slug it like every other collection
          // so a crafted backup cannot climb out of groups/
          const gid = typeof g.id === "string" && g.id ? slug(g.id) : uid(slug(g.name || "group"), "groups");
          writeJson("groups/" + gid + ".json", { id: gid, name: g.name || gid, memberIds, mode: g.mode || "natural", mutedIds: g.mutedIds || [] });
          summary.groups.push(gid);
        } catch { summary.errors.push("group failed: " + name); }
        continue;
      }
      if (name.startsWith("extensions/regex/") && name.endsWith(".json") && isText(entries[name])) {
        try { writeRegex(normalizeRegex(JSON.parse(entries[name]))); } catch { summary.errors.push("regex failed: " + name); }
        continue;
      }
      if (name === "personas.json" && isText(entries[name])) {
        // single-file personas map: { "persona name": { ... } }
        try {
          const map = JSON.parse(entries[name]);
          for (const [pname, p] of Object.entries(map || {})) {
            writePersona(pname, typeof p === "string" ? p : String((p && p.description) || (p && p.position !== undefined && p.text) || ""));
          }
        } catch { summary.errors.push("personas failed: " + name); }
        continue;
      }
      if (name.startsWith("personas/") && name.endsWith(".json") && isText(entries[name])) {
        try {
          const p = JSON.parse(entries[name]);
          // the whole record, not just the two fields the flat map carries
          writePersona(String(p.name || name.split("/").pop().replace(/\.json$/, "")), String(p.description || ""), p);
        } catch { summary.errors.push("persona failed: " + name); }
        continue;
      }
      if (name.startsWith("presets/") && name.endsWith(".json") && isText(entries[name])) {
        try {
          const n = restorePreset(JSON.parse(entries[name]), name.split("/").pop().replace(/\.json$/i, ""));
          if (n) writePreset(n);
        } catch { summary.errors.push("preset failed: " + name); }
        continue;
      }
      if (name.startsWith("chats/") && name.endsWith(".jsonl") && isText(entries[name])) {
        try {
          const parts = name.split("/");
          const character = parts[1] || "";
          const file = (parts[2] || "chat").replace(/\.jsonl$/i, "");
          const lines = entries[name].split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
          const n = normalizeChatLines({ character, file, lines });
          // sidecars our own backups write next to the transcript: everything
          // ABOUT the chat, and its facts vault
          const sidecar = name.replace(/\.jsonl$/i, ".meta.json");
          const saved = isText(entries[sidecar]) ? (() => { try { return JSON.parse(entries[sidecar]); } catch { return null; } })() : null;
          const vault = name.replace(/\.jsonl$/i, ".memories.json");
          if (n && isText(entries[vault])) {
            try {
              const mem = JSON.parse(entries[vault]);
              if (Array.isArray(mem) && mem.length) n.memories = mem;
            } catch { /* a bad vault is not worth failing the chat over */ }
          }
          if (n) {
            let characterId = null;
            try {
              for (const cid of fsx.list("characters")) {
                const card = readJson("characters/" + cid + "/card.json", null);
                if (card && card.name.toLowerCase() === character.toLowerCase()) { characterId = cid; break; }
              }
            } catch {}
            // folder didn't match a card → it's a group chat (folder is the
            // group name slug, or the group id slug from older exports)
            let groupId = null;
            if (!characterId) {
              try {
                for (const gf of fsx.list("groups").filter((x) => x.endsWith(".json"))) {
                  const gr = readJson("groups/" + gf, null);
                  if (gr && (slug(gr.name) === character.toLowerCase() || slug(gr.id) === character.toLowerCase())) { groupId = gr.id; break; }
                }
              } catch {}
            }
            // title prefix from the resolved owner, not the zip folder slug
            const ownerCard = characterId ? readJson("characters/" + characterId + "/card.json", null) : null;
            const ownerGroup = groupId ? readJson("groups/" + groupId + ".json", null) : null;
            const ownerName = ownerCard?.name || ownerGroup?.name;
            // the slug filename is a lossy echo of the title (no case, no
            // punctuation); the sidecar has the real one, so only fall back
            // to un-slugging when there is no sidecar to read
            if (saved && typeof saved.title === "string" && saved.title.trim()) n.title = saved.title;
            else if (ownerName) n.title = ownerName + " — " + unslugTitle(file);
            // group message attribution: engine ids changed on restore —
            // remap each msg.charId by id, then by the speaker name
            if (groupId) {
              const byId = new Map(), byName = new Map();
              try {
                for (const cid of fsx.list("characters")) {
                  const card = readJson("characters/" + cid + "/card.json", null);
                  if (card) { byId.set(cid, cid); byName.set(card.name.toLowerCase(), cid); }
                }
              } catch {}
              for (const m of n.msgs) {
                if (m.charId && byId.has(m.charId)) continue;
                m.charId = (m.name && byName.get(String(m.name).toLowerCase())) || null;
              }
            }
            writeChat(n, characterId, groupId, saved);
          }
        } catch { summary.errors.push("chat failed: " + name); }
        continue;
      }
    }

    // App settings and the local collections (quick replies, themes,
    // backgrounds, tags, folders, connection profiles) are part of a backup
    // too: without them a restore comes up on stock everything.
    if (isText(entries["settings.json"])) {
      try {
        const st = JSON.parse(entries["settings.json"]);
        const saved = st && typeof st.settings === "object" && st.settings ? st.settings : null;
        // `ui` is the whole app settings object. The model is deliberately
        // NOT restored: the connection it names belongs to the other machine.
        if (saved && saved.ui && typeof saved.ui === "object") {
          writeJson("settings.json", { ...readJson("settings.json", {}), ui: saved.ui });
          summary.settings = true;
        }
      } catch { summary.errors.push("settings failed"); }
    }
    if (isText(entries["library.json"])) {
      try {
        const lib = JSON.parse(entries["library.json"]);
        if (lib && typeof lib === "object" && Object.keys(lib).length) {
          writeJson("library.json", { ...readJson("library.json", {}), ...lib });
          summary.library = true;
        }
      } catch { summary.errors.push("library failed"); }
    }
    return { status: 200, json: summary };
  }

  return null;
}

export const TOOLS = [];
