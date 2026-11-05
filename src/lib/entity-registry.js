/**
 * Entity registry: one id per person (later thing and place) in a chat. Design: docs/ENTITY-REGISTRY.md.
 *
 * Plain JavaScript with no imports and no dependencies, because plugins load one file each and cannot import
 * from src/. `bun scripts/sync-registry.ts` copies this file (with `export ` removed) into plugins/relations,
 * plugins/world and plugins/litopys; a test fails when a copy differs. Edit only this file, then run the script.
 *
 * Everything takes and returns plain objects. Nothing here runs at load time except constant definitions.
 * Names that plugins might already use are prefixed `reg`; `resolveName` is the one exception.
 */

/** Title and honorific words (folded) that never count as a word of a name. */
export const REG_TITLES = new Set([
  "queen", "king", "sir", "lady", "lord", "dr", "mr", "mrs", "ms", "miss", "prince", "princess", "captain", "master",
  "mistress", "professor", "sensei", "san", "kun", "chan", "sama", "the", "of", "and",
  "\u043a\u043e\u0440\u043e\u043b\u0435\u0432\u0430", "\u043a\u043e\u0440\u043e\u043b\u044c", "\u0441\u044d\u0440", "\u043b\u0435\u0434\u0438", "\u0433\u043e\u0441\u043f\u043e\u0436\u0430", "\u0433\u043e\u0441\u043f\u043e\u0434\u0438\u043d", "\u043f\u0440\u0438\u043d\u0446", "\u043f\u0440\u0438\u043d\u0446\u0435\u0441\u0441\u0430", "\u043f\u0430\u043d", "\u043f\u0430\u043d\u0456", "\u043f\u0430\u043d\u0438",
  "\u043a\u0430\u043f\u0438\u0442\u0430\u043d", "\u043a\u0430\u043f\u0456\u0442\u0430\u043d", "\u043f\u0440\u043e\u0444\u0435\u0441\u0441\u043e\u0440", "\u043f\u0440\u043e\u0444\u0435\u0441\u043e\u0440", "\u043c\u0438\u0441\u0441", "\u043c\u0456\u0441",
]);

/** Headings of a card description that are sections of text, not names of people (folded first words). */
const REG_STOP = new Set([
  "personality", "appearance", "background", "backstory", "description", "scenario", "history", "abilities", "ability",
  "skills", "skill", "relationships", "relationship", "setting", "world", "notes", "note", "traits", "trait", "likes",
  "dislikes", "physical", "clothing", "outfit", "behavior", "behaviour", "speech", "example", "examples", "dialogue",
  "greeting", "plot", "story", "rules", "rule", "instructions", "instruction", "characters", "character", "overview",
  "info", "information", "details", "summary", "goals", "goal", "secrets", "hobbies", "family", "occupation", "age",
  "gender", "body", "voice", "kinks", "quirks", "habits", "fears", "motivation", "role", "roles", "profile", "bio",
  "biography", "guidelines", "guideline", "characterization", "characterisation", "introduction", "intro", "mannerisms", "speaking", "special", "other", "additional", "important", "ooc",
  "system", "narrator", "tags", "genre", "tone", "style", "format", "stats", "stat", "inventory", "location", "locations",
  "\u043b\u0438\u0447\u043d\u043e\u0441\u0442\u044c", "\u0432\u043d\u0435\u0448\u043d\u043e\u0441\u0442\u044c", "\u0445\u0430\u0440\u0430\u043a\u0442\u0435\u0440", "\u043f\u0440\u0435\u0434\u044b\u0441\u0442\u043e\u0440\u0438\u044f", "\u0438\u0441\u0442\u043e\u0440\u0438\u044f", "\u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435", "\u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0439", "\u0441\u0446\u0435\u043d\u0430\u0440\u0456\u0439", "\u043d\u0430\u0432\u044b\u043a\u0438", "\u043d\u0430\u0432\u0438\u0447\u043a\u0438",
  "\u0441\u043f\u043e\u0441\u043e\u0431\u043d\u043e\u0441\u0442\u0438", "\u0437\u0434\u0456\u0431\u043d\u043e\u0441\u0442\u0456", "\u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u044f", "\u0432\u0456\u0434\u043d\u043e\u0441\u0438\u043d\u0438", "\u043c\u0438\u0440", "\u0441\u0432\u0456\u0442", "\u0437\u0430\u043c\u0435\u0442\u043a\u0438", "\u043d\u043e\u0442\u0430\u0442\u043a\u0438", "\u043f\u0440\u0430\u0432\u0438\u043b\u0430", "\u043f\u0435\u0440\u0441\u043e\u043d\u0430\u0436\u0438",
  "\u043f\u0435\u0440\u0441\u043e\u043d\u0430\u0436\u0456", "\u043f\u0440\u0438\u043c\u0435\u0447\u0430\u043d\u0438\u0435", "\u043f\u0440\u0438\u043c\u0456\u0442\u043a\u0430", "\u0438\u043d\u0442\u0435\u0440\u0435\u0441\u044b", "\u0456\u043d\u0442\u0435\u0440\u0435\u0441\u0438", "\u043f\u0440\u0438\u0432\u044b\u0447\u043a\u0438", "\u0437\u0432\u0438\u0447\u043a\u0438", "\u043e\u0441\u043e\u0431\u0438\u0441\u0442\u0456\u0441\u0442\u044c", "\u043f\u0435\u0440\u0435\u0434\u0456\u0441\u0442\u043e\u0440\u0456\u044f",
  "\u043e\u043f\u0438\u0441", "\u0437\u043e\u0432\u043d\u0456\u0448\u043d\u0456\u0441\u0442\u044c", "\u0432\u043d\u0435\u0448\u043d\u0438\u0439", "\u0437\u043e\u0432\u043d\u0456\u0448\u043d\u0456\u0439", "\u0431\u0438\u043e\u0433\u0440\u0430\u0444\u0438\u044f", "\u0431\u0456\u043e\u0433\u0440\u0430\u0444\u0456\u044f", "\u0441\u044e\u0436\u0435\u0442", "\u0440\u0430\u0441\u0441\u043a\u0430\u0437\u0447\u0438\u043a", "\u043e\u043f\u043e\u0432\u0456\u0434\u0430\u0447",
]);

/** Words that make a long heading a phrase, not a name (folded). */
const REG_FUNC = new Set(["he", "she", "her", "his", "hers", "him", "they", "them", "their", "it", "its", "how", "what", "why", "when", "where", "who", "with", "without", "to", "for", "from", "in", "on", "at", "by", "is", "are", "was", "were", "be", "not", "no", "you", "your", "my", "our", "about", "as"]);

/** A card name or heading that is a narrator or a scenario, not a person. */
const REG_NARR = /narrat|\u0440\u0430\u0441\u0441\u043a\u0430\u0437\u0447\u0438\u043a|\u043e\u043f\u043e\u0432\u0456\u0434\u0430\u0447|\u043d\u0430\u0440\u0440\u0430\u0442\u043e\u0440|\u043d\u0430\u0440\u0430\u0442\u043e\u0440|\u043d\u0430\u0440\u0430\u0446\u0456\u044f|\u043d\u0430\u0440\u0430\u0446\u0438\u044f|storyteller|game ?master/iu;

/** Cyrillic (Russian and Ukrainian) to Latin, applied to folded text, so no \u0439 or \u0451 or \u0457. */
const REG_CYR = {
  "\u0430": "a", "\u0431": "b", "\u0432": "v", "\u0433": "g", "\u0491": "g", "\u0434": "d", "\u0435": "e", "\u0451": "e", "\u0436": "zh", "\u0437": "z", "\u0438": "i", "\u0439": "i",
  "\u0456": "i", "\u0457": "i", "\u044b": "i", "\u043a": "k", "\u043b": "l", "\u043c": "m", "\u043d": "n", "\u043e": "o", "\u043f": "p", "\u0440": "r", "\u0441": "s", "\u0442": "t",
  "\u0443": "u", "\u045e": "u", "\u0444": "f", "\u0445": "h", "\u0446": "ts", "\u0447": "ch", "\u0448": "sh", "\u0449": "shch", "\u044a": "", "\u044c": "", "\u044d": "e",
  "\u044e": "iu", "\u044f": "ia", "\u0454": "ie",
};

/** Lowercase, accents stripped from Latin and Cyrillic letters, every other mark (letter or digit excepted) a space, spaces collapsed. */
export function regFold(s) {
  const text = String(s == null ? "" : s);
  if (text.length > 200) return regFoldRaw(text);
  let r = regFoldMemo.get(text);
  if (r === undefined) {
    r = regFoldRaw(text);
    if (regFoldMemo.size > 6000) regFoldMemo.clear();
    regFoldMemo.set(text, r);
  }
  return r;
}
// the same names and words are folded again and again (a lookup compares a word with every name of the registry): once each
const regFoldMemo = new Map();
function regFoldRaw(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/([\p{Script=Latin}\p{Script=Cyrillic}])\p{M}+/gu, "$1")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

/**
 * A key for comparing a name across Cyrillic and Latin spelling. Fold, Cyrillic to Latin, then one phonetic key:
 * ch->k, ph->f, ck->k, h after a consonant dropped (Rhea, Sh, Zh), c before e/i/y -> s else k, q->k, x->ks, y/j->i,
 * z->s, w->v, an i between a vowel and a vowel dropped (Reia = Rea), doubled letters collapsed.
 * Equal keys (Cyrillic and Latin spellings): Kaede, Isabella, Ember, Rhea, Geralt, Yor, Bayonetta, Denis, Sina, Mei,
 * Saki. One letter apart: Alisa and Alice (alisa/alise, the a/e ending). Alice/Alex and Mark/Mary have different keys;
 * Sina/Nina differ by one letter, which is why the near step needs different scripts and the same first letter.
 */
export function regTranslit(s) {
  const text = String(s == null ? "" : s);
  if (text.length > 200) return regTranslitRaw(text);
  let r = regTranslitMemo.get(text);
  if (r === undefined) {
    r = regTranslitRaw(text);
    if (regTranslitMemo.size > 6000) regTranslitMemo.clear();
    regTranslitMemo.set(text, r);
  }
  return r;
}
const regTranslitMemo = new Map();
function regTranslitRaw(s) {
  let t = regFold(s).replace(/[\u0400-\u04ff]/g, (ch) => (ch in REG_CYR ? REG_CYR[ch] : ch));
  t = t
    .replace(/ch/g, "k")
    .replace(/kh/g, "h")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/([bcdfgjklmnpqrstvwxz])h/g, "$1")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/[cq]/g, "k")
    .replace(/x/g, "ks")
    .replace(/[yj]/g, "i")
    .replace(/z/g, "s")
    .replace(/w/g, "v")
    .replace(/([a-z0-9])\1+/g, "$1")
    .replace(/([aeou])i(?=[aeiou])/g, "$1")
    .replace(/([a-z0-9])\1+/g, "$1");
  return t.trim();
}

/** The folded words of a name without titles. */
export function regTokens(name) {
  return regFold(name).split(" ").filter((w) => w && !REG_TITLES.has(w));
}

/** An empty registry. */
export function regNew(chatId, from) {
  return { v: 1, chatId, from: from || null, next: { p: 1, o: 1, l: 1 }, entities: [], apart: [], suggest: [] };
}

const regIdIndexes = new WeakMap();
/** The entity with this id from an index of the list (id to position), kept per list and rebuilt when the list grows or shrinks,
 *  or when the position it names no longer holds that id. A miss is looked for in the list itself, so the answer is always the list's. */
function regById(ents, id) {
  let ix = regIdIndexes.get(ents);
  if (!ix || ix.n !== ents.length) {
    ix = { n: ents.length, at: new Map() };
    for (let i = ents.length - 1; i >= 0; i--) if (ents[i] && ents[i].id !== undefined) ix.at.set(ents[i].id, i);
    regIdIndexes.set(ents, ix);
  }
  const i = ix.at.get(id);
  if (i !== undefined && ents[i] && ents[i].id === id) return ents[i];
  return ents.find((e) => e && e.id === id) || null;
}

/** The entity with this id, following `merged` to the final target; null when missing or in a cycle. */
export function regGet(reg, id) {
  const ents = reg && Array.isArray(reg.entities) ? reg.entities : [];
  let cur = regById(ents, id);
  for (let i = 0; cur && cur.merged; i++) {
    if (i > ents.length) return null;
    cur = regById(ents, cur.merged);
  }
  return cur;
}

const regOneLine = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const regKindLetter = { person: "p", thing: "o", place: "l" };

function regAliasList(entity, list, src) {
  for (const a of Array.isArray(list) ? list : []) {
    const t0 = a && typeof a === "object" ? a.text : a;
    if (typeof t0 !== "string") continue;
    const text = regOneLine(t0).slice(0, 80);
    const f = regFold(text);
    if (!f || f === regFold(entity.name) || entity.aliases.some((x) => regFold(x.text) === f)) continue;
    const s = a && typeof a === "object" && typeof a.src === "string" && a.src ? a.src : src;
    entity.aliases.push({ text, src: s });
  }
}

/** A new entity with the next id (p1, o1, l1). `aliases` are strings or { text, src }. Null when there is no name. */
export function regAdd(reg, { kind = "person", name, src, card, aliases } = {}) {
  const nm = regOneLine(name).slice(0, 80);
  if (!regFold(nm)) return null;
  const k = regKindLetter[kind] ? kind : "person";
  const letter = regKindLetter[k];
  if (!reg.next || typeof reg.next !== "object") reg.next = { p: 1, o: 1, l: 1 };
  let n = Number(reg.next[letter]) || 1;
  while (reg.entities.some((e) => e.id === letter + n)) n++;
  reg.next[letter] = n + 1;
  const e = { id: letter + n, kind: k, name: nm, aliases: [], src: src || "seen" };
  if (card) e.card = String(card);
  regAliasList(e, aliases, e.src);
  reg.entities.push(e);
  return e;
}

/** Make or update the entity `user` (the persona). Old names stay as aliases. */
export function regUser(reg, name) {
  const nm = regOneLine(name).slice(0, 80);
  let e = reg.entities.find((x) => x.id === "user");
  if (!regFold(nm)) return e || null;
  if (!e) {
    e = { id: "user", kind: "person", name: nm, aliases: [], src: "persona" };
    reg.entities.push(e);
    return e;
  }
  if (regFold(e.name) !== regFold(nm)) {
    const old = e.name;
    e.name = nm;
    e.aliases = e.aliases.filter((a) => regFold(a.text) !== regFold(nm));
    regAliasList(e, [old], "persona");
  }
  return e;
}

/** Add an alias (deduped by fold; empty and the entity's own name are ignored). On a merged id it goes to the target. True when added. */
export function regAlias(reg, id, text, src) {
  const e = regGet(reg, id);
  if (!e) return false;
  // a place takes only a name of the same place: not its house or its street, not two rooms at once (another alphabet cannot be judged by words)
  const from = src || "seen";
  if (e.kind === "place" && (from === "seen" || from === "world") && regScript(String(text)) === regScript(e.name) && !regPlaceSame(text, e.name)) return false;
  const before = e.aliases.length;
  regAliasList(e, [text], src || "seen");
  return e.aliases.length > before;
}

function regWithin1(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1);
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

const regScript = (s) => (/[\u0400-\u04ff]/.test(s) ? "cyr" : "lat");
const regLen = (s) => s.replace(/ /g, "").length;

/** Words (folded) that join two names into one text: "hallway and kitchen" names two places, not one. */
const REG_JOIN = new Set(["and", "und", "et", "y", "e", "och", "og", "en", "oraz", "\u0438", "\u0456", "\u0439", "\u0442\u0430"]);

/** A place text as its levels, outer first: "Denis's house, kitchen" is [[denis, s, house], [kitchen]] (folded words, titles out). */
function regPlaceSegs(s) {
  return String(s == null ? "" : s)
    .split(/[,;:()]|\s[\u2014\u2013-]\s/)
    .map(regTokens)
    .filter((t) => t.length);
}

/** True when the innermost level of a place text names two places ("hallway and kitchen", "kitchen / hall"). */
function regJoined(s) {
  const parts = String(s == null ? "" : s).split(/[,;:()]|\s[\u2014\u2013-]\s/).filter((x) => regFold(x));
  const last = parts.length ? regFold(parts[parts.length - 1]).split(" ") : [];
  return last.some((w) => REG_JOIN.has(w)) || /[&/+]/.test(String(s == null ? "" : s));
}

/**
 * The places a text that names two of them means, each with the outer levels: "Denis's house, hallway and kitchen" is
 * ["Denis's house, hallway", "Denis's house, kitchen"]. A text that names one place is itself.
 */
export function regPlaceParts(s) {
  const text = regOneLine(s);
  if (!regJoined(text)) return text ? [text] : [];
  const levels = text.split(/[,;:()]|\s[\u2014\u2013-]\s/).map((x) => x.trim()).filter((x) => regFold(x));
  if (!levels.length) return [];
  const outer = levels.slice(0, -1).join(", ");
  const join = new RegExp("\\s*[&/+]\\s*|\\s+(?:" + [...REG_JOIN].join("|") + ")\\s+", "iu");
  return levels[levels.length - 1]
    .split(join)
    .map((x) => x.trim())
    .filter((x) => regFold(x))
    .map((x) => (outer ? outer + ", " + x : x));
}

/** Every word of `small` inside `big`, in order (by fold or translit key). */
const regWithin = (small, big) => regInOrder(small.map(regTranslit), big.map(regTranslit), small, big);

/** Two levels of place texts hold one another (every word of one inside the other, in order). */
const regLevelFits = (x, y) => regWithin(x, y) || regWithin(y, x);

/**
 * Could two place texts be one place? Texts name levels in either order ("Denis's house, kitchen", "Class 3-B, Sakura
 * Academy"), so the order is not trusted. With as many levels each, every level pairs with the one in the same or the
 * mirrored position: "Denis's house, hallway" and "Denis's house, kitchen" are two places. With fewer levels on one side,
 * each of its levels holds a different level of the other: "hidden chamber" is "Underground dungeon, hidden chamber", and so
 * is "Underground dungeon", since words cannot tell the room from the house; that is good enough to tell whether the scene
 * moved, never enough to learn a name (regPlaceSame). A text that names two places is never one of them.
 */
function regPlaceFits(a, b) {
  const x = regPlaceSegs(a);
  const y = regPlaceSegs(b);
  if (!x.length || !y.length || regJoined(a) || regJoined(b)) return false;
  if (x.length === y.length) return regPlaceSame(a, b);
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  const used = new Set();
  return short.every((lv) => {
    const i = long.findIndex((l, k) => !used.has(k) && regLevelFits(lv, l));
    if (i < 0) return false;
    used.add(i);
    return true;
  });
}

/** One place for sure: as many levels each, every one paired in the same or the mirrored order. Only this teaches a place a name. */
function regPlaceSame(a, b) {
  const x = regPlaceSegs(a);
  const y = regPlaceSegs(b);
  if (!x.length || x.length !== y.length || regJoined(a) || regJoined(b)) return false;
  const same = x.every((lv, i) => regLevelFits(lv, y[i]));
  const mirrored = x.every((lv, i) => regLevelFits(lv, y[y.length - 1 - i]));
  return same || mirrored;
}

/** True when the user said these two are different people (ids are followed through merges). */
export function regIsApart(reg, a, b) {
  const ga = regGet(reg, a);
  const gb = regGet(reg, b);
  if (!ga || !gb) return false;
  return (reg.apart || []).some((p) => {
    const x = regGet(reg, p[0]);
    const y = regGet(reg, p[1]);
    return !!x && !!y && ((x.id === ga.id && y.id === gb.id) || (x.id === gb.id && y.id === ga.id));
  });
}

/** True when every word of `small` appears in `big`, in the same order (a word matches by its fold or its translit key). */
function regInOrder(sk, bk, sw, bw) {
  let j = 0;
  for (let i = 0; i < sk.length; i++) {
    while (j < bk.length && bk[j] !== sk[i] && bw[j] !== sw[i]) j++;
    if (j >= bk.length) return false;
    j++;
  }
  return true;
}

function regFind(reg, text, kind, notWith, skip) {
  const raw = String(text == null ? "" : text);
  const f = regFold(raw);
  if (!f) return null;
  const want = kind || "person";
  const cands = [];
  const seen = new Map();
  for (const e of reg && Array.isArray(reg.entities) ? reg.entities : []) {
    const o = regGet(reg, e.id);
    if (!o || o.kind !== want) continue;
    if (skip && skip.indexOf(o.id) >= 0) continue;
    if (notWith && regIsApart(reg, o.id, notWith)) continue;
    let c = seen.get(o.id);
    if (!c) {
      c = { id: o.id, strs: [] };
      seen.set(o.id, c);
      cands.push(c);
    }
    c.strs.push(e.name);
    for (const a of e.aliases || []) c.strs.push(a.text);
  }
  const hit = (pred) => cands.filter((c) => c.strs.some(pred)).map((c) => c.id);
  const done = (ids, step) => (ids.length === 1 ? { id: ids[0], step } : ids.length > 1 ? { ambiguous: ids } : null);
  let r = done(hit((s) => regFold(s) === f), 1);
  if (r) return r;
  const key = regTranslit(raw);
  if (key) {
    r = done(hit((s) => regTranslit(s) === key), 2);
    if (r) return r;
  }
  const toks = regTokens(raw);
  if (toks.length === 1) {
    const w = toks[0];
    const wk = regTranslit(w);
    const ends = (s) => {
      const t = regTokens(s);
      return t.length ? [t[0], t[t.length - 1]] : [];
    };
    // the same word, or the same in another alphabet (Yuki written in Cyrillic is Yuki)
    r = done(hit((s) => ends(s).some((x) => x === w || regTranslit(x) === wk)), 3);
    if (r) return r;
    // one letter off in another alphabet (Alisa and Alice), only when no name matches exactly: Yuki in Cyrillic is not Yumi
    r = done(
      hit((s) =>
        ends(s).some((x) => {
          const xk = regTranslit(x);
          return regScript(x) !== regScript(w) && regLen(xk) >= 4 && regLen(wk) >= 4 && xk[0] === wk[0] && regWithin1(xk, wk);
        }),
      ),
      3,
    );
    if (r) return r;
  }
  if (toks.length >= 2 && want === "place") {
    // a place: the same innermost level (and outer level, when both have one); a part or a whole of it is another place
    r = done(hit((s) => regPlaceFits(raw, s)), 3.5);
    if (r) return r;
  } else if (toks.length >= 2) {
    // several words: all inside one candidate's name or alias in order ("Rhea Faeth" in "Queen of Elves Rhea Faeth"), or the reverse
    const tk = toks.map(regTranslit);
    r = done(
      hit((s) => {
        const t = regTokens(s);
        if (t.length < 2) return false;
        const k = t.map(regTranslit);
        return regInOrder(tk, k, toks, t) || regInOrder(k, tk, t, toks);
      }),
      3.5,
    );
    if (r) return r;
  }
  const sc = regScript(raw);
  r = done(
    hit((s) => {
      const fs = regFold(s);
      if (regLen(fs) >= 6 && regLen(f) >= 6 && regWithin1(fs, f)) return true;
      if (regScript(s) === sc) return false;
      const ks = regTranslit(s);
      return regLen(ks) >= 3 && regLen(key) >= 3 && ks[0] === key[0] && regWithin1(ks, key);
    }),
    4,
  );
  return r;
}

/**
 * Which entity does this word mean? `{ id, step }`, `{ ambiguous: [ids] }` or null. Steps, first hit wins:
 * 1 exact fold of a name or alias; 2 equal regTranslit key; 3 a single word (titles removed) equal to the first or
 * last word of exactly one entity's name or alias; 3.5 (3b) a text of two or more words that all sit, in order, inside
 * exactly one entity's name or alias, or the reverse (a name of two or more words inside the text); 4 near (fold keys one letter apart when both are 6+ letters, or
 * translit keys one letter apart when the spellings are in different scripts, 3+ letters, same first letter).
 * Merged entities are not candidates but their names point to the target. `notWith` (an id) skips candidates the
 * user marked apart from it. `user` is a candidate like the others: the caller decides what to do with it.
 */
export function resolveName(reg, text, kind = "person", notWith) {
  return regFind(reg, text, kind, notWith, null);
}

/** Remember a story spelling found by steps 2-4 as an alias (src `seen`), so the next lookup is exact. True when added. */
export function regLearn(reg, id, text) {
  if (!regTokens(text).length) return false;
  const e = regGet(reg, id);
  if (e && e.kind === "place" && (regJoined(text) || !regPlaceSame(text, e.name))) return false;
  return regAlias(reg, id, text, "seen");
}

const regPairHas = (p, a, b) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);

/** Merge `fromId` into `intoId`. False (nothing changed) for `user` as the source, the same entity, an apart pair, or a missing id. */
export function regMerge(reg, fromId, intoId) {
  const from = reg.entities.find((e) => e.id === fromId);
  const into = regGet(reg, intoId);
  if (!from || !into || from.merged || from.id === "user" || from.id === into.id) return false;
  if (from.kind !== into.kind || regIsApart(reg, from.id, into.id)) return false;
  from.merged = into.id;
  regAliasList(into, [from.name], "merged");
  regAliasList(into, from.aliases, "merged");
  const redirect = (x) => (x === from.id ? into.id : x);
  const apart = [];
  for (const p of reg.apart || []) {
    const a = redirect(p[0]);
    const b = redirect(p[1]);
    if (a !== b && !apart.some((q) => regPairHas(q, a, b))) apart.push([a, b]);
  }
  reg.apart = apart;
  const suggest = [];
  for (const s of reg.suggest || []) {
    const a = redirect(s.a);
    const b = redirect(s.b);
    if (a !== b && !suggest.some((q) => regPairHas([q.a, q.b], a, b))) suggest.push({ ...s, a, b });
  }
  reg.suggest = suggest;
  return true;
}

/** Record that two entities are different people (unordered, once); drops the suggestion for the pair. False when an id is missing or equal. */
export function regApart(reg, a, b) {
  const x = regGet(reg, a);
  const y = regGet(reg, b);
  if (!x || !y || x.id === y.id) return false;
  if (!(reg.apart || []).some((p) => regPairHas(p, x.id, y.id))) {
    if (!Array.isArray(reg.apart)) reg.apart = [];
    reg.apart.push(x.id < y.id ? [x.id, y.id] : [y.id, x.id]);
  }
  reg.suggest = (reg.suggest || []).filter((s) => !regPairHas([s.a, s.b], x.id, y.id));
  return true;
}

/** Suggest that two entities may be one. Not when they are apart, already suggested, equal, or one is merged. True when added. */
export function regSuggest(reg, a, b, why) {
  const x = reg.entities.find((e) => e.id === a);
  const y = reg.entities.find((e) => e.id === b);
  if (!x || !y || x.merged || y.merged || x.id === y.id) return false;
  if (regIsApart(reg, x.id, y.id)) return false;
  if (!Array.isArray(reg.suggest)) reg.suggest = [];
  if (reg.suggest.some((s) => regPairHas([s.a, s.b], x.id, y.id))) return false;
  reg.suggest.push({ a: x.id, b: y.id, why: regOneLine(why).slice(0, 80) });
  return true;
}

// ---------- names out of a character card ----------

const REG_NAME_LINE = /^(?:name|full name|\u0438\u043c\u044f|\u043f\u043e\u043b\u043d\u043e\u0435 \u0438\u043c\u044f|\u0456\u043c['’ʼ]\u044f|\u043f\u043e\u0432\u043d\u0435 \u0456\u043c['’ʼ]\u044f)\s*[:：]\s*(.+)$/iu;
const REG_ALIAS_LINE =
  /^(?:also called|also known as|aka|a\.k\.a\.?|nicknames?|aliases|alias|\u043f\u0440\u043e\u0437\u0432\u0438\u0449\u0435|\u043f\u0440\u043e\u0437\u0432\u0438\u0449\u0430|\u043f\u0441\u0435\u0432\u0434\u043e\u043d\u0438\u043c|\u0442\u0430\u043a\u0436\u0435\s+\p{L}+\s+\u043a\u0430\u043a|\u043f\u0440\u0456\u0437\u0432\u0438\u0441\u044c\u043a\u043e|\u043f\u0440\u0456\u0437\u0432\u0438\u0441\u044c\u043a\u0430|\u0442\u0430\u043a\u043e\u0436\s+\p{L}+\s+\u044f\u043a)\s*[:：]\s*(.+)$/iu;

/** Placeholders and markup out of a card text. */
function regTidy(s) {
  return String(s == null ? "" : s)
    .replace(/\{\{[^}]*\}\}|<\/?(?:char|user|bot)>/gi, " ")
    .replace(/[*`~#]+/g, "")
    .replace(/(^|\s)_+|_+(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** The part of a card name before a separator ( - , — , – , | , ": " , "(" ), or the whole name. */
function regHead(n) {
  const m = n.match(/^(.+?)(?:\s+[-–—|]\s+|:\s+|\s*[(（[])/u);
  return m && m[1].trim() ? m[1].trim() : n;
}

/** Could this be a person's name: letters, at most three words that are not titles, short. */
function regPlausible(n) {
  return !!n && n.length <= 40 && /\p{L}/u.test(n) && regTokens(n).length >= 1 && regTokens(n).length <= 3;
}

/**
 * Could this be the name of a section or a `Name:` line: like regPlausible, but a role may come before the name
 * ("Maid and Familiar of Rhea Ember Feath"), so up to six words; a name of more than three words must be written as a
 * name (every word but the connectors capitalized or caseless) and contain no section word.
 */
function regPlausibleLong(n) {
  if (!n || n.length > 60 || !/\p{L}/u.test(n)) return false;
  const t = regTokens(n);
  if (t.length < 1 || t.length > 6) return false;
  if (t.length <= 3) return true;
  // a longer heading must read as a name: no pronoun, question or preposition (a sentence in title case is not one)
  if (t.some((w) => REG_FUNC.has(w))) return false;
  for (const w of regTidy(n).split(" ")) {
    const f = regFold(w);
    if (!f || REG_TITLES.has(f)) continue;
    if (REG_STOP.has(f)) return false;
    if (!/^\p{Lu}/u.test(w) && w.toLowerCase() !== w.toUpperCase()) return false;
  }
  return true;
}

/** The name a heading with a role in front ends with: the last two words when both are capitalized (or caseless) and not titles, else the last word. Null for under three words or when it is the whole name. */
function regTrailName(name) {
  const w = regTidy(name).split(" ").filter(Boolean);
  if (w.length < 3) return null;
  const cased = (x) => /\p{L}/u.test(x) && (/^\p{Lu}/u.test(x) || x.toLowerCase() === x.toUpperCase());
  const ok = (x) => cased(x) && !REG_TITLES.has(regFold(x));
  const last = w[w.length - 1];
  if (!ok(last)) return null;
  const prev = w[w.length - 2];
  const out = ok(prev) ? prev + " " + last : last;
  return regFold(out) === regFold(name) ? null : out;
}

function regCardPersonName(raw) {
  const n = regTidy(raw);
  if (!n || REG_NARR.test(n)) return null;
  if (/^(?:the|a|an)\s/i.test(n) && /[(（]/.test(n)) return null;
  const head = regHead(n);
  return regPlausible(head) ? head : null;
}

function regHeadingName(raw) {
  const n = regTidy(raw).replace(/:+$/, "").trim();
  if (!n || REG_NARR.test(n)) return null;
  const head = regHead(n);
  const words = regFold(head).split(" ");
  if (!regPlausibleLong(head)) return null;
  if (REG_STOP.has(regFold(head)) || (words.length <= 3 && (REG_STOP.has(words[0]) || REG_STOP.has(words[words.length - 1])))) return null;
  return head;
}

function regLineName(v) {
  const n = regTidy(v).replace(/\([^)]*\)|（[^）]*）/gu, " ").split(/[,;，；]/)[0].replace(/^["'“”«»]+|["'“”«»]+$/g, "").replace(/\s+/g, " ").trim();
  return regPlausible(n) ? n : null;
}

function regSplitAliases(v) {
  const out = [];
  for (let a of regTidy(v).replace(/\([^)]*\)|（[^）]*）/gu, " ").split(/\s*[,;，；]\s*|\s+(?:or|\u0438\u043b\u0438|\u0430\u0431\u043e)\s+/iu)) {
    a = a.replace(/^["'“”«»]+|["'“”«»]+$/g, "").replace(/\s+/g, " ").trim();
    if (a && a.length <= 40 && /\p{L}/u.test(a) && a.split(" ").length <= 5 && !REG_NARR.test(a)) out.push(a);
  }
  return out;
}

const regSame = (a, b) => {
  if (regFold(a) === regFold(b)) return true;
  const x = regTokens(a);
  const y = regTokens(b);
  if (!x.length || !y.length) return false;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.every((w) => l.indexOf(w) >= 0);
};

function regPushAlias(p, a) {
  const f = regFold(a);
  if (f && f !== regFold(p.name) && !p.aliases.some((x) => regFold(x) === f)) p.aliases.push(a);
}

/**
 * The people a character card names, for messy imported cards (nothing is required): the card name (or the part
 * before a separator), `### Name` / `## Name` sections, and lines like `Name:`, `Aliases:`, `Nickname:` (English,
 * Russian, Ukrainian). A card name that is a narrator, a scenario or a long title is not a person; two or more
 * name sections also make the card name not a person. Returns `{ persons: [{ name, aliases: [] }], cardIsPerson }`.
 */
export function regCardNames(card) {
  const d = card && typeof card === "object" ? (card.data && typeof card.data === "object" ? card.data : card) : {};
  const cardName = regCardPersonName(d.name != null ? d.name : card && card.name);
  const desc = String(d.description != null ? d.description : card && card.description ? card.description : "");
  const secs = [{ head: null, declared: null, aliases: [] }];
  let cur = secs[0];
  for (const line of desc.split(/\r?\n/)) {
    const h = line.match(/^\s{0,3}#{2,3}\s+(.+?)\s*#*\s*$/);
    if (h) {
      const nm = regHeadingName(h[1]);
      if (nm) {
        cur = secs.find((s) => s.head && regFold(s.head) === regFold(nm)) || { head: nm, declared: null, aliases: [] };
        if (secs.indexOf(cur) < 0) secs.push(cur);
      }
      continue;
    }
    const cl = line.replace(/^[\s>*\-+•·]+/u, "").replace(/[*_`]+/g, "").trim();
    let m = cl.match(REG_NAME_LINE);
    if (m) {
      const v = regLineName(m[1]);
      if (v) {
        if (!cur.declared) cur.declared = v;
        else cur.aliases.push(v);
      }
      continue;
    }
    m = cl.match(REG_ALIAS_LINE);
    if (m) for (const a of regSplitAliases(m[1])) cur.aliases.push(a);
  }
  const heads = secs.slice(1);
  const cardIsPerson = !!cardName && heads.length < 2;
  const out = [];
  const put = (nm, al) => {
    let p = out.find((q) => regSame(q.name, nm));
    if (p) {
      if (regTokens(nm).length > regTokens(p.name).length) {
        const old = p.name;
        p.name = nm;
        regPushAlias(p, old);
      } else regPushAlias(p, nm);
    } else {
      p = { name: nm, aliases: [] };
      out.push(p);
    }
    for (const a of al) regPushAlias(p, a);
    return p;
  };
  let cp = null;
  if (cardIsPerson) cp = put(cardName, []);
  const sectionPersons = [];
  for (const s of heads) sectionPersons.push(put(s.declared || s.head, [...(s.declared && s.declared !== s.head ? [s.head] : []), ...s.aliases]));
  const s0 = secs[0];
  const target = cp || out[0] || null;
  if (target) {
    if (s0.declared) {
      if (regSame(target.name, s0.declared)) put(s0.declared, []);
      else if (cp) {
        const old = target.name;
        target.name = s0.declared;
        regPushAlias(target, old);
      } else regPushAlias(target, s0.declared);
    }
    for (const a of s0.aliases) regPushAlias(target, a);
  } else if (s0.declared) {
    put(s0.declared, s0.aliases);
  }
  // a role before the name ("Queen of Elves Rhea Faeth"): the name alone is another spelling of the section's person
  for (const p of sectionPersons) {
    const t = regTrailName(p.name);
    if (t) regPushAlias(p, t);
  }
  return { persons: out, cardIsPerson };
}

// ---------- seeding ----------

function regSeedOne(reg, p, src, cardId) {
  const first = regFind(reg, p.name, "person", null, null);
  if (first && first.id === "user" && src === "card") return null;
  const r = regFind(reg, p.name, "person", null, ["user"]);
  // a soul that fits two people is not a third one
  if (r && r.ambiguous && src !== "card") return null;
  let e = null;
  if (r && r.id) {
    e = regGet(reg, r.id);
    if (src === "card" && e.id !== "user" && e.src !== "card" && regFold(e.name) !== regFold(p.name)) {
      // a soul or story entity that is a shorter spelling of this card person: the card person is the entity, the other joins it
      const made = regAdd(reg, { kind: "person", name: p.name, src, card: cardId });
      if (made) regMerge(reg, e.id, made.id);
      e = made || e;
    } else {
      regAlias(reg, e.id, p.name, src);
      if (cardId && src === "card" && !e.card) e.card = String(cardId);
    }
  } else {
    e = regAdd(reg, { kind: "person", name: p.name, src, card: src === "card" ? cardId : undefined });
  }
  if (!e) return null;
  for (const a of p.aliases || []) regAlias(reg, e.id, a, src);
  return e;
}

/**
 * Merge a soul, group or story entity into the card person it now resolves to (an old registry made before the card
 * reader learned to read role-prefixed headings has both). Only a clear match counts (steps 1 to 3b, one candidate, not
 * apart; a story entity is not merged on step 3, a single shared word). Returns the number of merges.
 */
export function regReconcile(reg) {
  let n = 0;
  for (const e of reg.entities.slice()) {
    if (e.merged || e.id === "user" || e.kind !== "person" || !["soul", "seen", "group"].includes(e.src)) continue;
    const skip = reg.entities.filter((x) => x.kind !== "person" || x.merged || x.src !== "card").map((x) => x.id);
    const r = regFind(reg, e.name, "person", e.id, skip);
    // a single word that is the first or last word of a name (step 3) is a guess a story entity leaves to the user (a suggestion)
    if (r && r.id && r.step <= 3.5 && !(e.src === "seen" && r.step === 3) && regMerge(reg, e.id, r.id)) n++;
  }
  return n;
}

/**
 * Drop the card entities the cards no longer produce (an old registry holds a card title as a person) when nothing
 * refers to them: not merged, nothing merged into them, not in `keepIds` (the ids the caller still uses). Does nothing
 * without cards. Returns the number dropped. `cards` as in regSeed.
 */
export function regPrune(reg, cards, keepIds) {
  const list = Array.isArray(cards) ? cards.filter((c) => c && typeof c === "object") : [];
  if (!list.length) return 0;
  const made = new Set();
  const ids = new Set();
  for (const item of list) {
    const wrapped = item.card && typeof item.card === "object";
    if (item.id != null && wrapped) ids.add(String(item.id));
    for (const p of regCardNames(wrapped ? item.card : item).persons) {
      made.add(regFold(p.name));
      for (const a of p.aliases) made.add(regFold(a));
    }
  }
  const keep = new Set(Array.isArray(keepIds) ? keepIds : keepIds ? [...keepIds] : []);
  const target = new Set(reg.entities.filter((e) => e.merged).map((e) => e.merged));
  const drop = new Set();
  for (const e of reg.entities) {
    if (e.src !== "card" || e.merged || e.id === "user" || e.kind !== "person" || keep.has(e.id) || target.has(e.id)) continue;
    if (e.card && ids.size && !ids.has(e.card)) continue;
    if (!made.has(regFold(e.name))) drop.add(e.id);
  }
  if (!drop.size) return 0;
  reg.entities = reg.entities.filter((e) => !drop.has(e.id));
  reg.apart = (reg.apart || []).filter((q) => !drop.has(q[0]) && !drop.has(q[1]));
  reg.suggest = (reg.suggest || []).filter((q) => !drop.has(q.a) && !drop.has(q.b));
  return drop.size;
}

/**
 * Make sure the people the chat starts with exist: the persona as `user`, every person of each card (`cards` are
 * card objects or { id, card }), and the card souls (`souls`: { [name]: { aliases? } }). Resolves first, so doing it
 * twice changes nothing. Returns the registry.
 */
export function regSeed(reg, { cards = [], personaName, souls = {} } = {}) {
  if (personaName) regUser(reg, personaName);
  for (const item of Array.isArray(cards) ? cards : []) {
    if (!item || typeof item !== "object") continue;
    const wrapped = item.card && typeof item.card === "object";
    const card = wrapped ? item.card : item;
    const id = item.id;
    for (const p of regCardNames(card).persons) regSeedOne(reg, p, "card", id);
  }
  regReconcile(reg);
  const names = souls && typeof souls === "object" ? Object.keys(souls) : [];
  for (const name of names) {
    const s = souls[name];
    regSeedOne(reg, { name, aliases: s && Array.isArray(s.aliases) ? s.aliases.filter((x) => typeof x === "string") : [] }, "soul");
  }
  return reg;
}

// ---------- files ----------

/** Where a chat's registry lives under the app's data folder. */
export const regPath = (chatId) => "registry/" + String(chatId == null ? "" : chatId).replace(/[^\w-]/g, "_") + ".json";

const REG_ID = /^(?:user|[pol]\d+)$/;

/** A registry read from disk, made sound: malformed entities dropped, unique ids, `next` above every id, merges without cycles. */
function regValidate(raw, chatId, from) {
  const reg = regNew(chatId, from);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return reg;
  const ids = new Set();
  const kinds = { person: 1, thing: 1, place: 1 };
  // an older registry numbered things t1, t2 ...; they are o1, o2 ... now (threads kept t#)
  const oldThing = new Map();
  for (const e of Array.isArray(raw.entities) ? raw.entities : []) {
    if (e && typeof e === "object" && e.kind === "thing" && typeof e.id === "string" && /^t\d+$/.test(e.id)) oldThing.set(e.id, "o" + e.id.slice(1));
  }
  const upId = (x) => (oldThing.has(x) ? oldThing.get(x) : x);
  if (oldThing.size) {
    raw = {
      ...raw,
      entities: raw.entities.map((e) => (e && typeof e === "object" && (oldThing.has(e.id) || oldThing.has(e.merged)) ? { ...e, id: upId(e.id), ...(e.merged ? { merged: upId(e.merged) } : {}) } : e)),
      apart: Array.isArray(raw.apart) ? raw.apart.map((p) => (Array.isArray(p) ? p.map(upId) : p)) : raw.apart,
      suggest: Array.isArray(raw.suggest) ? raw.suggest.map((q) => (q && typeof q === "object" ? { ...q, a: upId(q.a), b: upId(q.b) } : q)) : raw.suggest,
    };
  }
  for (const e of Array.isArray(raw.entities) ? raw.entities : []) {
    if (!e || typeof e !== "object" || typeof e.id !== "string" || !REG_ID.test(e.id) || ids.has(e.id)) continue;
    const name = regOneLine(e.name).slice(0, 80);
    if (!regFold(name) || !kinds[e.kind]) continue;
    if (e.id !== "user" && regKindLetter[e.kind] !== e.id[0]) continue;
    const out = { id: e.id, kind: e.kind, name, aliases: [], src: typeof e.src === "string" && e.src ? e.src : "seen" };
    regAliasList(out, e.aliases, "seen");
    // a place alias learned by the looser rule of an older version (two rooms, or a room and its house) is dropped;
    // one in another alphabet cannot be judged by words and stays
    if (out.kind === "place") out.aliases = out.aliases.filter((a) => (a.src !== "seen" && a.src !== "world") || regScript(a.text) !== regScript(name) || regPlaceSame(a.text, name));
    if (typeof e.card === "string" && e.card) out.card = e.card;
    if (typeof e.merged === "string" && e.merged) out.merged = e.merged;
    ids.add(e.id);
    reg.entities.push(out);
  }
  for (const e of reg.entities) {
    if (e.merged && (!ids.has(e.merged) || e.merged === e.id || e.id === "user")) delete e.merged;
  }
  for (const e of reg.entities) {
    if (e.merged && !regGet(reg, e.id)) delete e.merged;
  }
  for (const e of reg.entities) {
    if (e.id === "user") continue;
    const n = Number(e.id.slice(1));
    const k = e.id[0];
    if (n >= reg.next[k]) reg.next[k] = n + 1;
  }
  for (const k of ["p", "o", "l"]) {
    const stored = raw.next && Number(k === "o" && raw.next.o == null ? raw.next.t : raw.next[k]);
    if (stored > reg.next[k] && stored < 1e9) reg.next[k] = Math.floor(stored);
  }
  for (const p of Array.isArray(raw.apart) ? raw.apart : []) {
    if (Array.isArray(p) && p.length === 2 && p[0] !== p[1] && ids.has(p[0]) && ids.has(p[1]) && !reg.apart.some((q) => regPairHas(q, p[0], p[1]))) {
      reg.apart.push([p[0], p[1]]);
    }
  }
  for (const s of Array.isArray(raw.suggest) ? raw.suggest : []) {
    if (s && typeof s === "object" && s.a !== s.b && ids.has(s.a) && ids.has(s.b) && !reg.suggest.some((q) => regPairHas([q.a, q.b], s.a, s.b))) {
      reg.suggest.push({ a: s.a, b: s.b, why: regOneLine(s.why).slice(0, 80) });
    }
  }
  return reg;
}

/**
 * The chat's registry: its own file; else a copy of the registry of chat `from` (a chat that continues another);
 * else an empty one. A malformed file gives an empty registry. `fsx` has read(rel) (throws when missing).
 */
export function regLoad(fsx, chatId, from) {
  const readJson = (rel) => {
    try {
      return { ok: true, value: JSON.parse(fsx.read(rel)) };
    } catch (e) {
      return { ok: false, missing: !(e instanceof SyntaxError) };
    }
  };
  const own = readJson(regPath(chatId));
  if (own.ok) return regValidate(own.value, chatId, from || (own.value && own.value.from) || null);
  if (!own.missing) return regNew(chatId, from);
  if (from) {
    const base = readJson(regPath(from));
    if (base.ok) return regValidate(base.value, chatId, from);
  }
  return regNew(chatId, from);
}

/** Write the registry to its file. */
export function regSave(fsx, reg) {
  fsx.write(regPath(reg.chatId), JSON.stringify(reg));
  return reg;
}
