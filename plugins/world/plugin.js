/**
 * World DM (GitHub #52; design: engine repo .fork/handoff/world-dm/DESIGN.md).
 *
 * The Dashboard owns the scene, Litopys the past, prose is canon. The DM owns
 * the world off screen. After a reply, on the player's schedule (every N
 * replies, or the "World turn" button), a DM model reads the new part of the
 * story and returns small JSON, never prose. Code turns it into the chat's own
 * world lorebook: one entry per person, place, group, thing or fact that
 * matters beyond the scene. A retired entry (a dead villain) is kept: cut to
 * one or two sentences, fired by its name only.
 *
 * Levels: off; chronicler (records only); living (fronts with clocks tick off
 * screen, news reaches the party as a soft rumour); director (hooks,
 * complications, visitors: a hard event); antagonist (pressure and
 * consequences, aimed at the Dashboard's threads and relations); chaos
 * (ignores genre and logic). Fronts: Blades in the Dark / Dungeon World.
 * An event rides ONE reply through the llmRequest hook, after the chat history;
 * the next run checks the prose, re-sends a missed event once, then drops it.
 * The dice below are the DM's own seeded check (2d6, rolled by code); the Dice Roller tool is the model's, in
 * plugins/tools: see docs/COUPLINGS.md, "Two kinds of dice".
 *
 * Scene direction comes from the Dashboard sensor (its snapshot's
 * scene.direction): explicit freezes the DM (no run, no event, chaos too),
 * combat pauses stagnation and new events below antagonist, transition runs
 * the DM at once. Without the Dashboard the DM names the direction itself.
 *
 * Routes (under /v1/apps/roleplay/):
 *  GET  /world/state?chatId=          the chat's DM: settings, counts, when it runs next, last error
 *  PUT  /world/settings {chatId, level?, everyN?, stagnation?, onTransition?, insert?}   the chat's DM settings
 *  GET  /world/learned?chatId=        the DM's memory: rules, proposals waiting, the log, the names kept (#425); POST /world/learned/answer|rule|remove|edit|phrase|clear|reset
 *  GET  /world/peek?chatId=           the world book's records, for the player who asks (fronts and events stay hidden)
 *  GET  /world/here?chatId=           the Dashboard's Here and Outfit and things: the scene's place, the things here and asleep, what people carry, what the last run changed
 *  GET  /world/config?chatId=         the DM's models and reply limit (all chats), with the models in force
 *  PUT  /world/config {model?, buildModel?, maxTokens?, imageModel?, autoBackground?, defaultProfile?}   defaultProfile: the profile a new chat starts with ("" = the chronicler)
 *  GET  /world/chats                  every chat with a DM, for the World section's list
 *  GET  /world/runs?chatId=           the chat's run history, newest first (tokens, time, errors)
 *  POST /world/test {chatId?, which?}  one tiny call to the play (or build) model: works, or why not
 *  GET  /world/profiles               the DM profiles: five built in (the levels), the player's own; prompt blocks with defaults; `default` marks the one new chats start with
 *  PUT  /world/profiles {id?, name?, description?, base?, blocks?, defaults?}   change one (a block set to null goes back
 *                                     to its default), or make a new one (no id, or an id not in use)
 *  DELETE /world/profiles?id=         remove one of the player's own (chats on it fall back to its base)
 *  PUT  /world/records {chatId, op: add|update|retire|restore|delete, record}   the player edits the world book by hand
 *  POST /world/records/keys {chatId}   the build model writes keys for the living records that have none
 *  GET  /world/recipes               what a start can build (from the cards, an interview, the player's own files)
 *  POST /world/start {chatId, begin?, recipe?, cardIds?, answers?, lang?, deck?}   begin = a new draft; then
 *                                     each call makes one build call (two-phase) until done == total.
 *                                     {begin, newWorld: true, name, description?, level?, profile?, ...} builds a
 *                                     world without a chat (answers worldId; later calls send {worldId});
 *                                     {worldId, peek: true} reads its draft without a build call
 *  PUT  /world/draft {chatId | worldId, op: accept|discard, drop?: {entities, fronts, deck}}   the draft into
 *                                     the world (a worldId's draft becomes a saved world)
 *  POST /world/deck {chatId, lang?}   a new events deck (profile option deck)
 *  POST /world/bench {chatId, lang?}  adopt the people of the cards' lorebooks as linked records (cast, #424)
 *  GET  /world/cast?chatId=           the cast as the chat stands: Frequency, who is due, the entrance, the last one
 *  GET|POST|PUT|DELETE /world/library  saved worlds: list, save a chat's world {chatId, name?, description?},
 *                                     rename {id, name?, description?}, remove ?id=
 *  POST /world/carry {toChatId, fromChatId? | worldId?, replace?}   a world into a chat (records, fronts, clocks)
 *  POST /world/opening {chatId, worldId?, wish?, lang?}   the build model drafts the chat's scenario and first message
 *  PUT  /world/override {chatId, scenario?: {text, mode: replace|append} | null, opening?}   the chat's own
 *                                     scenario (meta.worldScenario, read by the engine plugin) and first message
 *  GET|POST|PUT /world/backgrounds {chatId|worldId}   the world's places and folder; POST {places, direction?,
 *                                     variants?, taken?} plans a set (build model); PUT {folderId|null} links a folder
 *  POST /world/backgrounds/places {chatId|worldId}   the build model lists the places the cards and records name
 *  POST /world/backgrounds/name {image, model?, hint?}   a vision model names one background: {file, tags}
 *  POST /world/update {chatId, auto?}  a DM run (two-phase); auto = the app's call after a reply,
 *                                      which runs only when a trigger is due; without auto it always runs
 *                                      (except in an explicit scene)
 *  POST /world/rollback {chatId, drop?}  puts the world back after a reply was deleted or swiped (#75); drop = the id of
 *                                      the reply about to be written again. {ok, undone, event}
 *
 * Rollback (#75): before each run changes the world, a snapshot of its core (records, fronts, event, carry, ...) is kept in
 * world/snaps/<chatId>.json, keyed by the message the run read up to. When that message is no longer on the chat's line (deleted,
 * or another swipe showing), the snapshot is put back and the DM reads the story again from there. An event that rode a reply
 * that is gone is sent again. The player's own record edits survive. See reconcile().
 *
 * Hook: llmRequest adds the pending event, the dice and "World · here" (the scene's place, the things in it, what the
 * people in the scene wear and carry; no model call, also at the chronicler level and with the DM off) to the last user message of a reply request.
 * The sweep (#185): code lists the places and things the scene tracker met that the book has no record of (sweepCandidates) and a records-only run
 * offers them to the DM model; it runs whatever the level, also with the DM off, and each name is offered once (state.sweepAsked).
 *
 * Files (fs root = the app's data/):
 *  world/state/<chatId>.json   the chat's world state (shape: normalizeState)
 *  world/snaps/<chatId>.json   the last few snapshots of that state, for the rollback (#75)
 *  world/config.json           only what differs from the defaults
 *  world/profiles/<id>.json    a built-in profile's changes (only blocks that differ) or a player's own profile
 *  world/recipes/<id>.json     a recipe of the player's (an id of a built-in replaces it)
 *  world/library/w-<id>.json   a saved world: records, fronts, deck, settings
 *  world/library/w-<id>.draft.json   a world being built without a chat, until accepted
 *  lorebooks/world-<chatId>.json  the chat's world book: ownerChatId = the chat, so the app's
 *                              library never lists it; the chat's meta names it as worldBookId,
 *                              and the engine plugin scans it in that chat only
 */

const STATE_DIR = "world/state/";
const CONFIG_FILE = "world/config.json";
const CHAT_ID = /^[A-Za-z0-9_-]{1,120}$/;
// a player's own profile: "p-" and a slug, never a level's name
const OWN_PROFILE_ID = /^p-[a-z0-9-]{1,40}$/;
const MODEL_REF = /^[^\s]{1,200}$/;
const FOLDER_ID = /^[A-Za-z0-9_-]{1,80}$/;

export const LEVELS = ["off", "chronicler", "living", "director", "antagonist", "chaos"];
/** The levels that work today (all of them since P2). */
export const READY_LEVELS = LEVELS;
/** Levels whose events are a MUST for the writing model; living sends soft rumours. */
const HARD_LEVELS = ["director", "antagonist", "chaos"];
export const DIRECTIONS = ["domestic", "social", "intrigue", "investigation", "travel", "combat", "explicit", "transition"];
/** Stagnation threshold per direction: x2 slow, x0.5 fast, 0 = the counter is paused. */
const STAGNATION_FACTOR = { domestic: 2, social: 1, intrigue: 1, investigation: 1, travel: 0.5, combat: 0, explicit: 0, transition: 1 };
// every kind a record may have when it is read (an old "fact" still shows); WRITE_KINDS = what the DM and the player may write now:
// facts live in the Litopys, a world fact is folded into the text of its place or group (#424, step 3)
export const KINDS = ["person", "place", "group", "thing", "fact"];
export const WRITE_KINDS = ["person", "place", "group", "thing"];
// why a thing is in the book: a clue, a hidden thing, a promise, a gift, a weapon, something people fight over (clue, hidden and promise are never tidied away)
export const WHYS = ["clue", "hidden", "promise", "gift", "weapon", "contested"];
// a person or a group stands to the player's character as one of these (colour, and where the weight comes from)
export const RELATIONS = ["ally", "family", "rival", "enemy", "neutral"];
// how much a person weighs in the story: 0 an acquaintance, 1 a friend or a rival, 2 family, a partner or a central figure
export const WEIGHTS = [0, 1, 2];
// how often a person who has been away is brought back (#424); a new chat starts on normal, a chat that had a state file before stays off until the player asks
export const CAST_FREQ = ["off", "rare", "normal", "often"];
// the cast deck (#424, step 4): cards of new people, how long a card is, and how many a Start or a refill asks for per faction
export const CAST_LENS = ["short", "normal", "long"];

export const DEFAULT_SETTINGS = { level: "off", everyN: 5, recordsEveryN: 0, stagnation: 6, onTransition: true, onPlace: true, insert: true, textMax: 900, changesMax: 12, carrySource: "sensor", profile: "", dice: "", diceStat: "", diceChance: 0, diceTilt: "", diceLife: -1, dicePace: -1, diceShow: false, cast: "off", tidy: true, castDeck: false, castPer: 2, castLen: "normal", things: "all", learn: true };
// model = the play model (runs after replies), buildModel = the one that builds worlds (P3 Start)
// imageModel: the backgrounds' image model ("" = the app's, Settings > Images); autoBackground: new chats in a
// world switch backgrounds by scene (off by default, user 2026-10-19: it changes how the chat looks)
// defaultProfile: the profile a new chat starts with (a built-in level above the chronicler or one of the player's own);
// "" = the chronicler, the lowest level. The DM "off" is never a default: it is a choice for one chat.
export const DEFAULT_CONFIG = { model: "", buildModel: "", maxTokens: 1500, imageModel: "", autoBackground: false, defaultProfile: "" };

// what a run reads and writes, kept small for small context windows
const NEW_TEXT_MAX = 12000;
const MSG_MAX = 6000;
// below this share per message a run reads fewer messages (catch-up) instead of cutting each one thinner
const MSG_MIN = 400;
const LINE_EXTRA = 40;
/** A pending event is judged by the messages after the reply that carried it, also the ones earlier runs took: how many of them, and their share of the input. */
const SINCE_MSGS = 6;
const SINCE_TEXT_MAX = 8000;
const SINCE_MSG_MIN = 300;
// a retry after a reply that was all thinking gets this many times the room, at most RETRY_MAX
const RETRY_FACTOR = 3;
const RETRY_MAX = 12000;
const NAME_MAX = 80;
// fronts, backgrounds and the like keep this size; a record's text follows the chat's settings.textMax (bounds below)
const TEXT_MAX = 600;
const PAST_TEXT_MAX = 240;
const TEXT_BOUNDS = [200, 3000];
const PAST_HARD = 1200;
const CHANGES_BOUNDS = [4, 20];
// a recipe section builds at most this many records per call
const SECTION_MAX = 8;
// what a character wears and carries (state.carry): short lists, cut on read
const CARRY_WHO_MAX = 12;
const WEARING_MAX = 12;
const CARRIED_MAX = 12;
const NEARBY_MAX = 8;
const ITEM_MAX = 60;
const CHANGED_MAX = 30;
const ALIASES_MAX = 6;
const ENTITIES_MAX = 300;
const LOG_MAX = 30;
const DROPPED_MAX = 50;
const FRONTS_MAX = 8;
const EVENT_MAX = 400;
const CLOCK_SIZES = [4, 6, 8];

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const arr = (v) => (Array.isArray(v) ? v : []);
// ==== BEGIN GENERATED: src/lib/entity-registry.js (bun scripts/sync-registry.ts) ====
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
const REG_TITLES = new Set([
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
function regFold(s) {
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
function regTranslit(s) {
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
function regTokens(name) {
  return regFold(name).split(" ").filter((w) => w && !REG_TITLES.has(w));
}

/** An empty registry. */
function regNew(chatId, from) {
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
function regGet(reg, id) {
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
function regAdd(reg, { kind = "person", name, src, card, aliases } = {}) {
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
function regUser(reg, name) {
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
function regAlias(reg, id, text, src) {
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
function regPlaceParts(s) {
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
function regIsApart(reg, a, b) {
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
function resolveName(reg, text, kind = "person", notWith) {
  return regFind(reg, text, kind, notWith, null);
}

/** Remember a story spelling found by steps 2-4 as an alias (src `seen`), so the next lookup is exact. True when added. */
function regLearn(reg, id, text) {
  if (!regTokens(text).length) return false;
  const e = regGet(reg, id);
  if (e && e.kind === "place" && (regJoined(text) || !regPlaceSame(text, e.name))) return false;
  return regAlias(reg, id, text, "seen");
}

const regPairHas = (p, a, b) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);

/** Merge `fromId` into `intoId`. False (nothing changed) for `user` as the source, the same entity, an apart pair, or a missing id. */
function regMerge(reg, fromId, intoId) {
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
function regApart(reg, a, b) {
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
function regSuggest(reg, a, b, why) {
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
function regCardNames(card) {
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
function regReconcile(reg) {
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
function regPrune(reg, cards, keepIds) {
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
function regSeed(reg, { cards = [], personaName, souls = {} } = {}) {
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
const regPath = (chatId) => "registry/" + String(chatId == null ? "" : chatId).replace(/[^\w-]/g, "_") + ".json";

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
function regLoad(fsx, chatId, from) {
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
function regSave(fsx, reg) {
  fsx.write(regPath(reg.chatId), JSON.stringify(reg));
  return reg;
}
// ==== END GENERATED: entity-registry ====
const cut = (s, n) => (s.length > n ? s.slice(0, n) : s);
/** A text shown to the player, shortened at a word with an ellipsis instead of mid-word. */
const shorten = (s, n) => {
  if (s.length <= n) return s;
  const head = s.slice(0, n - 1);
  const space = head.lastIndexOf(" ");
  return (space > n * 0.6 ? head.slice(0, space) : head).replace(/[\s,.;:]+$/, "") + "…";
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const ok = (json, status) => ({ status: status || 200, json });

const readJson = (fsx, path, dflt) => {
  try {
    return JSON.parse(fsx.read(path));
  } catch {
    return dflt;
  }
};
const writeJson = (fsx, path, v) => fsx.write(path, JSON.stringify(v, null, 2));

// ---------- config (all chats) ----------
export function loadConfig(fsx) {
  const c = readJson(fsx, CONFIG_FILE, {});
  return cleanConfig({ ...DEFAULT_CONFIG, ...(isObj(c) ? c : {}) });
}

function cleanConfig(c) {
  const model = str(c.model);
  const build = str(c.buildModel);
  const n = Number(c.maxTokens);
  return {
    model: MODEL_REF.test(model) ? model : "",
    buildModel: MODEL_REF.test(build) ? build : "",
    maxTokens: Number.isFinite(n) ? clamp(Math.round(n), 500, 8000) : DEFAULT_CONFIG.maxTokens,
    imageModel: MODEL_REF.test(str(c.imageModel)) ? str(c.imageModel) : "",
    autoBackground: c.autoBackground === true,
    // the chronicler is what "" means; an id that no longer exists is dealt with when it is used (startSettings)
    defaultProfile: str(c.defaultProfile) !== "chronicler" && (PROFILE_LEVELS.includes(str(c.defaultProfile)) || OWN_PROFILE_ID.test(str(c.defaultProfile))) ? str(c.defaultProfile) : "",
  };
}

// ---------- state (one chat) ----------
export const bookIdOf = (chatId) => "world-" + chatId;
const statePath = (chatId) => STATE_DIR + chatId + ".json";

export function emptyState(chatId) {
  return { v: 1, chatId, bookId: bookIdOf(chatId), settings: { ...DEFAULT_SETTINGS }, lastKey: null, nextId: 1, carry: {}, entities: [], nextFront: 1, fronts: [], event: null, log: [] };
}

function cleanSettings(s) {
  const b = isObj(s) ? s : {};
  const level = LEVELS.includes(b.level) ? b.level : DEFAULT_SETTINGS.level;
  const n = Number(b.everyN);
  const st = Number(b.stagnation);
  const rn = Number(b.recordsEveryN);
  const tm = Number(b.textMax);
  const cm = Number(b.changesMax);
  return {
    level,
    everyN: Number.isFinite(n) ? clamp(Math.round(n), 1, 50) : DEFAULT_SETTINGS.everyN,
    // how often the records are written; 0 = with every N (the fronts and events keep every N)
    recordsEveryN: Number.isFinite(rn) && rn >= 1 ? clamp(Math.round(rn), 1, 50) : 0,
    // the size of a record's text and the number of changes in one run (bounds: TEXT_BOUNDS, CHANGES_BOUNDS)
    textMax: Number.isFinite(tm) ? clamp(Math.round(tm), TEXT_BOUNDS[0], TEXT_BOUNDS[1]) : DEFAULT_SETTINGS.textMax,
    changesMax: Number.isFinite(cm) ? clamp(Math.round(cm), CHANGES_BOUNDS[0], CHANGES_BOUNDS[1]) : DEFAULT_SETTINGS.changesMax,
    // who keeps what the characters wear and hold (user, 2026-10-30): the Dashboard's sensor (default: one field of its
    // own report, no extra tokens) or the DM (lists: wearing, carried, nearby). Places and things are always the DM's.
    carrySource: b.carrySource === "dm" ? "dm" : "sensor",
    // a run when the story leaves a place (the Dashboard's place changed since the last run)
    onPlace: typeof b.onPlace === "boolean" ? b.onPlace : DEFAULT_SETTINGS.onPlace,
    // 0 = no stagnation trigger
    stagnation: Number.isFinite(st) ? clamp(Math.round(st), 0, 50) : DEFAULT_SETTINGS.stagnation,
    onTransition: typeof b.onTransition === "boolean" ? b.onTransition : DEFAULT_SETTINGS.onTransition,
    insert: typeof b.insert === "boolean" ? b.insert : DEFAULT_SETTINGS.insert,
    // this chat's dice over the profile's: "" / 0 = the profile decides (user, 2026-10-27: the switch sits in the chat's sheet)
    dice: DICE_MODES.includes(b.dice) ? b.dice : "",
    diceStat: DICE_STAT_CHOICES.includes(b.diceStat) ? b.diceStat : "",
    diceTilt: Object.hasOwn(DICE_TILTS, b.diceTilt) ? b.diceTilt : "",
    // a small mark under each reply that had a roll (the chat's own; the profile has no say)
    diceShow: b.diceShow === true,
    // -1 = the profile decides; 0 = never
    diceLife: b.diceLife !== "" && b.diceLife !== null && Number.isFinite(Number(b.diceLife)) && Number(b.diceLife) >= 0 ? clamp(Math.round(Number(b.diceLife)), 0, 100) : -1,
    dicePace: b.dicePace !== "" && b.dicePace !== null && Number.isFinite(Number(b.dicePace)) && Number(b.dicePace) >= 0 ? clamp(Math.round(Number(b.dicePace)), 0, 100) : -1,
    diceChance: Number.isFinite(Number(b.diceChance)) && Number(b.diceChance) >= 1 ? clamp(Math.round(Number(b.diceChance)), 1, 100) : 0,
    // a player's own profile on top of the level (its base); "" = the level's built-in profile
    profile: level !== "off" && OWN_PROFILE_ID.test(str(b.profile)) ? str(b.profile) : "",
    // how often people who have been away come back (#424); a file from before it has no value and stays off
    cast: CAST_FREQ.includes(b.cast) ? b.cast : DEFAULT_SETTINGS.cast,
    // a small mark under each reply that had a person come back, with who, why and the dice (the chat's own; for testing)
    castShow: b.castShow === true,
    // the code tidy-up of things that played out (#424, step 3); on unless the player switched it off
    tidy: typeof b.tidy === "boolean" ? b.tidy : DEFAULT_SETTINGS.tidy,
    // the cast deck (#424, step 4): new people drawn from cards; a file from before it has no value and stays off
    castDeck: typeof b.castDeck === "boolean" ? b.castDeck : DEFAULT_SETTINGS.castDeck,
    castPer: Number.isFinite(Number(b.castPer)) && Number(b.castPer) >= 1 ? clamp(Math.round(Number(b.castPer)), 1, CAST_PER_MAX) : DEFAULT_SETTINGS.castPer,
    castLen: CAST_LENS.includes(b.castLen) ? b.castLen : DEFAULT_SETTINGS.castLen,
    // what the DM may write as a thing (#425): all, only a clue, hidden or promised one, none; a lever the player's answers move
    things: THINGS_STEPS.includes(b.things) ? b.things : DEFAULT_SETTINGS.things,
    // the DM may raise proposals from what the player removes and rewrites (the chat's switch; the log shows every one)
    learn: typeof b.learn === "boolean" ? b.learn : DEFAULT_SETTINGS.learn,
  };
}

/** A front: a faction or threat with a goal and a clock (0..size; full = it happens). */
function cleanFront(f) {
  if (!isObj(f)) return null;
  const id = str(f.id);
  const name = cut(str(f.name), NAME_MAX);
  if (!name || !/^f\d{1,6}$/.test(id)) return null;
  const size = CLOCK_SIZES.includes(Number(f.size)) ? Number(f.size) : 6;
  const clock = Number.isFinite(Number(f.clock)) ? clamp(Math.round(Number(f.clock)), 0, size) : 0;
  return { id, name, goal: cut(str(f.goal), TEXT_MAX), clock, size, status: f.status === "past" ? "past" : "active", ...(f.stirred === true ? { stirred: true } : {}), ...(Number.isFinite(f.at) ? { at: f.at } : {}) };
}

/** The event waiting for a reply: text, hard or soft, sent (how many replies carried it), retried once. */
function cleanEvent(e) {
  if (!isObj(e) || !str(e.text)) return null;
  return {
    text: cut(str(e.text), EVENT_MAX),
    hard: e.hard === true,
    sent: Number.isInteger(e.sent) && e.sent > 0 ? e.sent : 0,
    retried: e.retried === true,
    ...(Number.isFinite(e.at) ? { at: e.at } : {}),
    ...(Number.isFinite(e.sentAt) ? { sentAt: e.sentAt } : {}),
    // the message the reply that carried it followed (a key), so a deleted or swiped reply can be told from a kept one (#75)
    ...(typeof e.after === "string" && e.after ? { after: cut(e.after, 80) } : {}),
    // where the story was when the event was written (the place key, and the Dashboard's place id when it had one): a missed event is not sent again once the story has moved on
    ...(typeof e.place === "string" && e.place ? { place: cut(e.place, NAME_MAX * 2) } : {}),
    ...(REF_ID.test(str(e.placeId)) ? { placeId: str(e.placeId) } : {}),
  };
}

export const CAST_BANDS = ["small", "medium", "big"];
// why a card of the deck was drawn: its tie is in the scene, its faction's front is stirred or half full, its faction belongs to the scene's place, or by chance
const HOOK_MAX = 200;
const CAST_PICKS = ["tie", "front", "place", "random"];
const CAST_RESULTS = ["came", "mentioned", "missed"];
const RECORD_ID = /^[a-z]\d{1,6}$/;

const TIDY_LOG_MAX = 60;
const SIGNALS_MAX = 200;
const SIGNAL_OPS = ["delete", "retire", "restore", "pin", "add", "edit"];

/** One line of the tidy-up log: which thing, archived or woken, by whom (code or the DM naming it again), and the count that decided it. */
function cleanTidyLine(l) {
  if (!isObj(l) || !RECORD_ID.test(str(l.id)) || !["archive", "wake"].includes(l.act) || !Number.isFinite(l.at)) return null;
  return { at: l.at, n: Number.isInteger(l.n) && l.n >= 0 ? l.n : 0, id: str(l.id), name: cut(str(l.name), NAME_MAX), act: l.act, count: Number.isInteger(l.count) && l.count >= 0 ? l.count : 0, via: l.via === "dm" ? "dm" : "code", ...(WHYS.includes(l.why) ? { why: l.why } : {}) };
}

/** One thing the player did to the book: what, which record (its name and a short text), who made it, and for an edit the text's length before and after. */
function cleanSignal(g) {
  if (!isObj(g) || !SIGNAL_OPS.includes(g.op) || !Number.isFinite(g.at)) return null;
  const name = cut(str(g.name), NAME_MAX);
  if (!name) return null;
  return { at: g.at, op: g.op, kind: KINDS.includes(g.kind) ? g.kind : "thing", name, madeBy: g.madeBy === "player" ? "player" : "dm", ...(g.src === "deck" || g.src === "bench" ? { src: g.src } : {}), ...(str(g.text) ? { text: cut(str(g.text), 120) } : {}), ...(Number.isInteger(g.lenBefore) && g.lenBefore >= 0 ? { lenBefore: g.lenBefore } : {}), ...(Number.isInteger(g.lenAfter) && g.lenAfter >= 0 ? { lenAfter: g.lenAfter } : {}) };
}

/** Writes a signal into the state (the player's own action: not in CORE_KEYS). */
function noteSignal(state, sig) {
  state.signals = [...arr(state.signals), { at: Date.now(), ...sig }].slice(-SIGNALS_MAX);
}

/** The names the player deleted and did not bring back, newest first: the DM does not record them again (and is told so). */
export function removedNames(state, max = 30) {
  const out = [];
  const done = new Set();
  const list = arr(state.signals);
  for (let i = list.length - 1; i >= 0 && out.length < max; i--) {
    const key = str(list[i].name).toLowerCase();
    if (done.has(key)) continue;
    done.add(key);
    if (list[i].op === "delete") out.push(list[i].name);
  }
  return out;
}

/** A person coming back (#424), waiting to be judged: who, how big, how long they were away, sent (how many replies carried it), retried once. */
function cleanEntrance(e) {
  if (!isObj(e) || !RECORD_ID.test(str(e.id)) || !CAST_BANDS.includes(e.band)) return null;
  return {
    id: str(e.id),
    name: cut(str(e.name), NAME_MAX),
    band: e.band,
    // why: the 2d6 total and its parts, when a die made it (the Life die picks a band by its own tier), and the silence that was needed
    ...(Number.isFinite(e.roll) ? { roll: e.roll } : {}),
    ...(Array.isArray(e.d) && e.d.length === 2 && e.d.every((x) => Number.isInteger(x) && x >= 1 && x <= 6) ? { d: e.d } : {}),
    ...(Number.isInteger(e.mod) ? { mod: e.mod } : {}),
    ...(WEIGHTS.includes(e.weight) ? { weight: e.weight } : {}),
    ...(Number.isInteger(e.threshold) && e.threshold >= 0 ? { threshold: e.threshold } : {}),
    ...(typeof e.tier === "string" && LIFE_BAND[e.tier] ? { tier: e.tier } : {}),
    silence: Number.isInteger(e.silence) && e.silence >= 0 ? e.silence : 0,
    // replies since the person was last named (never more than the silence on stage), shown in the log when it differs
    ...(Number.isInteger(e.seen) && e.seen >= 0 ? { seen: e.seen } : {}),
    // the die's band was raised to medium because the last return only ended as a mention
    ...(e.floor === true ? { floor: true } : {}),
    via: e.via === "life" ? "life" : "silence",
    // a person of the cast deck (#424, step 4): the id is the card's, the tie is who already exists, the pick says why this card
    ...(e.src === "deck" ? { src: "deck" } : {}),
    ...(e.src === "deck" && str(e.faction) ? { faction: cut(str(e.faction), NAME_MAX) } : {}),
    ...(e.src === "deck" && str(e.tie) ? { tie: cut(str(e.tie), NAME_MAX) } : {}),
    ...(e.src === "deck" && CAST_PICKS.includes(e.pick) ? { pick: e.pick } : {}),
    sent: Number.isInteger(e.sent) && e.sent > 0 ? e.sent : 0,
    retried: e.retried === true,
    ...(Number.isInteger(e.n) && e.n >= 0 ? { n: e.n } : {}),
    ...(Number.isFinite(e.sentAt) ? { sentAt: e.sentAt } : {}),
    ...(typeof e.after === "string" && e.after ? { after: cut(e.after, 80) } : {}),
  };
}

/** The last entrance that was judged: the number of replies then (the gap between two is counted from it) and whether the person came. */
function cleanLastEntrance(e) {
  if (!isObj(e) || !RECORD_ID.test(str(e.id)) || !Number.isInteger(e.n) || e.n < 0) return null;
  // res: came (on stage), mentioned (only named) or missed; an older record has ok only
  const res = CAST_RESULTS.includes(e.res) ? e.res : e.ok === true ? "came" : "missed";
  return { id: str(e.id), n: e.n, band: CAST_BANDS.includes(e.band) ? e.band : "small", ok: res === "came", res, ...(e.src === "deck" ? { src: "deck" } : {}) };
}

function cleanAliases(v, name) {
  const out = [];
  for (const a of arr(v)) {
    const s = cut(str(a), NAME_MAX);
    if (s && s.toLowerCase() !== name.toLowerCase() && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= ALIASES_MAX) break;
  }
  return out;
}

/** The most people a group or a place lists. */
const MEMBERS_MAX = 30;
/** A list of names: trimmed, cut, each once (case-insensitive), at most MEMBERS_MAX. */
function cleanMembers(v) {
  const out = [];
  for (const x of arr(v)) {
    const t = cut(str(x), NAME_MAX);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= MEMBERS_MAX) break;
  }
  return out;
}

/**
 * Where a record sits (#176): a place is a "spot" (a room, a corner) inside a bigger place, named by `inside`;
 * a thing has a `holder` (a person's name) or a `place` (a place's name), never both. Names, matched to
 * records by name or alias in code. Everything optional: records from before work as they did.
 */
function spaceFields(kind, raw) {
  const out = {};
  // the people who belong to a group or a place (#184 P7): the Library's "known to" can name the group
  if (kind === "group" || kind === "place") {
    const members = cleanMembers(raw.members);
    if (members.length) out.members = members;
  }
  if (kind === "place") {
    if (raw.size === "spot") out.size = "spot";
    if (str(raw.inside)) out.inside = cut(str(raw.inside), NAME_MAX);
    // the id of a picture in the app's Backgrounds library: the scene in this place shows it (a spot without one takes its place's)
    if (FOLDER_ID.test(str(raw.background))) out.background = str(raw.background);
  } else if (kind === "thing") {
    if (str(raw.holder)) out.holder = cut(str(raw.holder), NAME_MAX);
    else if (str(raw.place)) out.place = cut(str(raw.place), NAME_MAX);
    if (WHYS.includes(raw.why)) out.why = raw.why;
  }
  return out;
}

/** The DM's update of a record's space fields (in place): a key that is sent changes it, "" clears it. True when something changed. */
function applySpace(e, raw) {
  const keys = e.kind === "place" ? ["size", "inside", "background", "members"] : e.kind === "thing" ? ["holder", "place", "why"] : e.kind === "group" ? ["members"] : [];
  let changed = false;
  for (const k of keys) {
    if (raw[k] === undefined) continue;
    // a list that is sent replaces the old one, [] clears it
    if (k === "members") {
      const next = cleanMembers(raw.members);
      if (JSON.stringify(e.members || []) === JSON.stringify(next)) continue;
      if (next.length) e.members = next;
      else delete e.members;
      changed = true;
      continue;
    }
    const v = k === "why" ? (WHYS.includes(raw.why) ? raw.why : "") : k === "size" ? (raw.size === "spot" ? "spot" : "") : k === "background" ? (FOLDER_ID.test(str(raw.background)) ? str(raw.background) : "") : cut(str(raw[k]), NAME_MAX);
    if ((e[k] || "") === v) continue;
    if (v) e[k] = v;
    else delete e[k];
    changed = true;
    // a thing is held or placed, not both: naming the new one drops the old
    if (v && k === "holder" && e.place && raw.place === undefined) delete e.place;
    if (v && k === "place" && e.holder && raw.holder === undefined) delete e.holder;
  }
  return changed;
}

const cleanItems = (v, max) => {
  const out = [];
  for (const x of arr(v)) {
    const t = cut(str(x), ITEM_MAX);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= max) break;
  }
  return out;
};

const cleanCarried = (v) => {
  const out = [];
  for (const x of arr(v)) {
    const what = cut(str(isObj(x) ? x.what : x), ITEM_MAX);
    if (!what || out.some((o) => o.what.toLowerCase() === what.toLowerCase())) continue;
    const where = isObj(x) ? cut(str(x.where), ITEM_MAX) : "";
    out.push({ what, ...(where ? { where } : {}) });
    if (out.length >= CARRIED_MAX) break;
  }
  return out;
};

/** What each character wears and carries: { "<name>": { wearing: [..], carried: [{ what, where? }], nearby: [..], at } }. */
function cleanCarry(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [who, v] of Object.entries(raw)) {
    const name = cut(str(who), NAME_MAX);
    if (!name || !isObj(v) || Object.keys(out).length >= CARRY_WHO_MAX) continue;
    const c = { wearing: cleanItems(v.wearing, WEARING_MAX), carried: cleanCarried(v.carried), nearby: cleanItems(v.nearby, NEARBY_MAX), at: Number.isFinite(v.at) ? v.at : 0 };
    if (c.wearing.length || c.carried.length || c.nearby.length) out[name] = c;
  }
  return out;
}

/** One record of the world: kept to known fields and sizes; null when it has no name. */
function cleanEntity(e) {
  if (!isObj(e)) return null;
  const name = cut(str(e.name), NAME_MAX);
  const id = str(e.id);
  if (!name || !/^[a-z]\d{1,6}$/.test(id)) return null;
  const past = e.status === "past";
  const text = cut(str(e.text), past ? PAST_HARD : TEXT_BOUNDS[1]);
  if (!KINDS.includes(e.kind)) return null;
  const kind = e.kind;
  const folk = kind === "person" || kind === "group";
  const link = kind === "person" && isObj(e.link) && str(e.link.book) && Number.isInteger(e.link.uid) ? { book: cut(str(e.link.book), 80), uid: e.link.uid, title: cut(str(e.link.title), NAME_MAX) } : null;
  return {
    id,
    kind,
    name,
    aliases: cleanAliases(e.aliases, name),
    text,
    // "dormant": put to rest by the code's tidy-up (a later release writes it); it is out of the book and off the bench, and the player can wake it
    status: past ? "past" : e.status === "dormant" ? "dormant" : "active",
    // who a person or a faction is to the player's character, and how much they weigh in the story (no weight = what the relation says)
    ...(folk && RELATIONS.includes(e.relation) ? { relation: e.relation } : {}),
    ...(folk && e.weight !== undefined && e.weight !== null && WEIGHTS.includes(Number(e.weight)) ? { weight: Number(e.weight) } : {}),
    // the lorebook entry this person is (a link, not a copy; the entry keeps firing by its keys)
    ...(link ? { link } : {}),
    // the player switched "bring back automatically" off for this person
    ...(kind === "person" && e.noReturn === true ? { noReturn: true } : {}),
    // came from the cast deck (a person from the lorebooks has `link`): the memory counts what the player deletes of them
    ...(kind === "person" && e.src === "deck" ? { src: "deck" } : {}),
    // why this person may come back now (the DM wrote it in `returns`; the next entrance uses it once): what they were doing, what they want
    ...(kind === "person" && isObj(e.hook) && str(e.hook.text) ? { hook: { text: cut(str(e.hook.text), HOOK_MAX), at: Number.isFinite(e.hook.at) ? e.hook.at : 0 } } : {}),
    uid: Number.isInteger(e.uid) && e.uid > 0 ? e.uid : 0,
    ...(Number.isFinite(e.at) ? { at: e.at } : {}),
    // written or changed by the player by hand (the Records tab)
    ...(e.by === "player" ? { by: "player" } : {}),
    // always in the prompt, no keys needed (the player pins it in the Records tab)
    ...(e.pinned === true ? { pinned: true } : {}),
    ...spaceFields(kind, e),
    // how many times the story came to this place (counted by code when the Dashboard's place changes)
    ...(Number.isInteger(e.visits) && e.visits > 0 ? { visits: e.visits } : {}),
  };
}

/** The state file as code trusts it: anything unknown or malformed is dropped. */
export function normalizeState(raw, chatId) {
  const s = isObj(raw) ? raw : {};
  const out = emptyState(chatId);
  out.settings = cleanSettings(s.settings);
  if (typeof s.lastKey === "string" && s.lastKey) out.lastKey = s.lastKey;
  const entities = [];
  for (const e of arr(s.entities)) {
    const c = cleanEntity(e);
    if (c && !entities.some((x) => x.id === c.id)) entities.push(c);
    if (entities.length >= ENTITIES_MAX) break;
  }
  out.entities = entities;
  const maxId = entities.reduce((m, e) => Math.max(m, Number(e.id.slice(1)) || 0), 0);
  out.nextId = Math.max(Number.isInteger(s.nextId) ? s.nextId : 1, maxId + 1);
  const fronts = [];
  for (const f of arr(s.fronts)) {
    const c = cleanFront(f);
    if (c && !fronts.some((x) => x.id === c.id)) fronts.push(c);
  }
  out.fronts = fronts.slice(-FRONTS_MAX * 3);
  out.nextFront = Math.max(Number.isInteger(s.nextFront) ? s.nextFront : 1, fronts.reduce((m, f) => Math.max(m, Number(f.id.slice(1)) || 0), 0) + 1);
  out.event = cleanEvent(s.event);
  const entrance = cleanEntrance(s.entrance);
  if (entrance) out.entrance = entrance;
  const lastEntrance = cleanLastEntrance(s.lastEntrance);
  if (lastEntrance) out.lastEntrance = lastEntrance;
  if (DIRECTIONS.includes(s.direction)) out.direction = s.direction;
  if (typeof s.transitionKey === "string") out.transitionKey = s.transitionKey;
  out.carry = cleanCarry(s.carry);
  // the entity registry's person for each NPC record: { "n3": "p7" } (the registry file is data/registry/<chatId>.json)
  if (isObj(s.regIds)) {
    const ids = {};
    // a person links to p#, a thing to t#, a place to l#
    for (const [rid, pid] of Object.entries(s.regIds)) {
      const rec = entities.find((e) => e.id === rid);
      if (typeof pid === "string" && rec && REG_LINK_LETTER[rec.kind] && pid.startsWith(REG_LINK_LETTER[rec.kind]) && /^[pol]\d{1,6}$/.test(pid)) ids[rid] = pid;
    }
    if (Object.keys(ids).length) out.regIds = ids;
  }
  // what the last run changed: record ids and characters whose carry moved, for the Dashboard's counters
  if (isObj(s.lastChange)) out.lastChange = { at: Number.isFinite(s.lastChange.at) ? s.lastChange.at : 0, ids: arr(s.lastChange.ids).map(str).filter(Boolean).slice(0, CHANGED_MAX), carry: arr(s.lastChange.carry).map(str).filter(Boolean).slice(0, CARRY_WHO_MAX) };
  // the message the last full run (fronts, events) read up to, and the place the last run saw
  if (typeof s.levelKey === "string" && s.levelKey) out.levelKey = s.levelKey;
  if (typeof s.lastPlace === "string" && s.lastPlace) out.lastPlace = cut(s.lastPlace, NAME_MAX * 2);
  // the registry id of that place, when the Dashboard gave one (the move check compares ids first)
  if (typeof s.lastPlaceId === "string" && /^l\d{1,6}$/.test(s.lastPlaceId)) out.lastPlaceId = s.lastPlaceId;
  if (arr(s.sweepAsked).length) out.sweepAsked = arr(s.sweepAsked).map(str).filter(Boolean).slice(-SWEEP_ASKED_MAX);
  if (Number.isInteger(s.clockReplies) && s.clockReplies > 0) out.clockReplies = s.clockReplies;
  // records the player deleted by hand, so a rollback does not bring them back (#75)
  const dropped = arr(s.dropped).filter((d) => isObj(d) && /^[a-z]\d{1,6}$/.test(str(d.id)) && Number.isFinite(d.at)).map((d) => ({ id: str(d.id), at: d.at })).slice(-DROPPED_MAX);
  if (dropped.length) out.dropped = dropped;
  // the tidy-up (#424, step 3): the reply count of the last pass and the things it saw; a log of every archive and wake
  if (isObj(s.tidy) && Number.isInteger(s.tidy.n) && s.tidy.n >= 0) out.tidy = { n: s.tidy.n, seen: arr(s.tidy.seen).map(str).filter((id) => RECORD_ID.test(id)).slice(0, ENTITIES_MAX) };
  const tidyLog = arr(s.tidyLog).map(cleanTidyLine).filter(Boolean).slice(-TIDY_LOG_MAX);
  if (tidyLog.length) out.tidyLog = tidyLog;
  // what the player did to the DM's book (step 0 of the DM's memory): never rewound, a swipe does not undo a hand
  const signals = arr(s.signals).map(cleanSignal).filter(Boolean).slice(-SIGNALS_MAX);
  if (signals.length) out.signals = signals;
  // the DM's memory for this chat (#425): rules, proposals, answers, the log; not in CORE_KEYS, a swipe does not undo what the player answered
  const learned = cleanLearned(s.learned);
  if (learned) out.learned = learned;
  out.log = arr(s.log).filter(isObj).slice(-LOG_MAX);
  if (Number.isFinite(s.lastRunAt)) out.lastRunAt = s.lastRunAt;
  if (str(s.lastModel)) out.lastModel = str(s.lastModel);
  if (isObj(s.lastError) && str(s.lastError.message)) out.lastError = cleanError(s.lastError);
  if (isObj(s.usage)) out.usage = cleanUsage(s.usage, true);
  const deck = cleanDeck(s.deck);
  if (deck.length) out.deck = deck;
  // the cast deck (#424, step 4): cards of new people, when the last refill was tried, and a log of the refills
  const cast = cleanCast(s.cast);
  if (cast.length) out.cast = cast;
  if (isObj(s.castBuild) && Number.isInteger(s.castBuild.n) && s.castBuild.n >= 0) out.castBuild = { n: s.castBuild.n };
  const castLog = arr(s.castLog).map(cleanCastLine).filter(Boolean).slice(-CAST_LOG_MAX);
  if (castLog.length) out.castLog = castLog;
  const draft = cleanDraft(s.draft);
  if (draft) out.draft = draft;
  if (isObj(s.origin) && str(s.origin.kind)) out.origin = s.origin;
  // the world's backgrounds: a folder of the app's Backgrounds library (its id lives in library.json)
  if (FOLDER_ID.test(str(s.backgroundFolderId))) out.backgroundFolderId = str(s.backgroundFolderId);
  return out;
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);

/** Tokens of one run (input, output, cost when the provider prices it); totals also count runs. */
function cleanUsage(u, totals) {
  const b = isObj(u) ? u : {};
  return { input: Math.round(num(b.input)), output: Math.round(num(b.output)), cost: num(b.cost), ...(totals ? { runs: Math.round(num(b.runs)) } : {}) };
}

/** The limit a run went out with: max output tokens and the model block it came from (null = the DM's own). */
function cleanLimit(l) {
  if (!isObj(l) || !Number.isFinite(Number(l.max))) return null;
  return { max: Math.round(Number(l.max)), block: str(l.block) ? cut(str(l.block), 80) : null, fromModel: l.fromModel === true };
}

export const ERROR_CODES = ["thinking", "thinking-block", "reasoning-off", "rate", "context", "auth", "model", "not-json", "empty", "other"];

/** A failed run as the app shows it: a code it can say in the player's language, the plain message, the raw text for "details". */
function cleanError(e) {
  const limit = cleanLimit(e.limit);
  return {
    at: Number(e.at) || 0,
    code: ERROR_CODES.includes(e.code) ? e.code : "other",
    message: cut(str(e.message), 400),
    ...(str(e.details) ? { details: cut(str(e.details), 1200) } : {}),
    ...(limit ? { limit } : {}),
  };
}

export function loadState(fsx, chatId) {
  const raw = readJson(fsx, statePath(chatId), null);
  const state = normalizeState(raw, chatId);
  // the rules for all chats reach this chat the first time it is read after the rule was made (a save then keeps them)
  syncGlobalRules(state, loadLearned(fsx));
  return { state, existed: isObj(raw) };
}

function saveState(fsx, state) {
  writeJson(fsx, statePath(state.chatId), state);
}

// ---------- chat ----------
function readChat(fsx, chatId) {
  const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
  if (!isObj(meta)) return null;
  const msgs = [];
  try {
    for (const line of String(fsx.read("chats/" + chatId + ".jsonl")).split("\n")) {
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line);
        if (isObj(m) && m.id !== undefined && m.id !== null && m.id !== "") msgs.push(m);
      } catch {}
    }
  } catch {}
  return { meta, msgs };
}

const keyOf = (m) => m.id + "#" + (Number.isFinite(m.swipe) ? m.swipe : 0);
const isReply = (m) => m.role !== "user" && m.role !== "system";

/** The messages after the one the DM read last (all of them when it never ran or that message is gone). */
export function unreadMessages(msgs, lastKey) {
  if (!lastKey) return msgs;
  const id = String(lastKey).split("#")[0];
  const i = msgs.findIndex((m) => String(m.id) === id);
  return i < 0 ? msgs : msgs.slice(i + 1);
}

// ---------- rollback (#75): a deleted or swiped reply takes the world's changes with it ----------
// Before a run changes the world, a snapshot of the parts it can change is kept, keyed by the message the run reads up to.
// The line of the chat is what counts: when that message is gone (deleted, or another swipe showing), the run is undone and
// the snapshot goes back. The DM then reads the story again from the older lastKey. Settings, the run history, the tokens
// spent and the player's own hand edits stay (an edit survives while the DM has not changed the same record since).
const SNAP_DIR = "world/snaps/";
const SNAP_MAX = 8;
const SNAP_BYTES = 1500000;
const CORE_KEYS = ["lastKey", "levelKey", "nextId", "nextFront", "entities", "fronts", "event", "direction", "transitionKey", "carry", "regIds", "lastChange", "lastPlace", "lastPlaceId", "sweepAsked", "clockReplies", "deck", "cast", "castBuild", "castLog", "entrance", "lastEntrance", "tidy", "tidyLog"];
const snapPath = (chatId) => SNAP_DIR + chatId + ".json";
const cloneJson = (v) => JSON.parse(JSON.stringify(v));

/** The part of the state a rollback puts back (a copy). */
export function coreOf(state) {
  const core = {};
  for (const k of CORE_KEYS) if (state[k] !== undefined) core[k] = cloneJson(state[k]);
  return core;
}

/** The chat's snapshots, oldest first: { upTo, at, core }. */
export function loadSnaps(fsx, chatId) {
  const raw = readJson(fsx, snapPath(chatId), null);
  return isObj(raw) ? arr(raw.snaps).filter((x) => isObj(x) && typeof x.upTo === "string" && x.upTo && isObj(x.core) && Number.isFinite(x.at)) : [];
}

/** Writes the newest SNAP_MAX; a big world keeps fewer (never fewer than two) so the file stays under SNAP_BYTES. */
function saveSnaps(fsx, chatId, snaps) {
  let list = snaps.slice(-SNAP_MAX);
  let text = JSON.stringify({ v: 1, snaps: list });
  while (list.length > 2 && text.length > SNAP_BYTES) {
    list = list.slice(1);
    text = JSON.stringify({ v: 1, snaps: list });
  }
  fsx.write(snapPath(chatId), text);
}

/** Called before a run changes the world; `upTo` is the key of the newest message the run reads. */
function pushSnap(fsx, state, upTo, msgs) {
  const snaps = loadSnaps(fsx, state.chatId);
  // a second run over the same message goes back to before the first
  if (!upTo || snaps.some((x) => x.upTo === upTo)) return;
  // `head`: the chat's first message then; if it changes, old history was trimmed (see firstGone)
  saveSnaps(fsx, state.chatId, [...snaps, { upTo, at: Date.now(), head: msgs.length ? String(msgs[0].id) : "", core: coreOf(state) }]);
}

/**
 * Index of the oldest run to undo, or -1: the first whose message is no longer on the chat's line, or whose message is the
 * reply about to be written again (`drop`, an id). What does NOT count, so the world is not wiped by housekeeping:
 * - an empty read of the chat (a failed read, not a chat with no messages);
 * - old history trimmed from the top ("delete above"): the chat's first message is not the one the run saw, so the story the
 *   world was built from was kept in the records, not retracted;
 * - another swipe showing on a reply that is not the newest one (someone reading the alternatives of an old reply).
 */
export function firstGone(snaps, msgs, drop) {
  if (!msgs.length) return -1;
  const byId = new Map(msgs.map((m) => [String(m.id), m]));
  let newest = null;
  for (let k = msgs.length - 1; k >= 0; k--) {
    if (isReply(msgs[k])) {
      newest = msgs[k];
      break;
    }
  }
  const head = String(msgs[0].id);
  const dropId = drop ? String(drop) : "";
  for (let i = 0; i < snaps.length; i++) {
    const up = snaps[i].upTo;
    const id = up.split("#")[0];
    if (dropId && id === dropId) return i;
    if (snaps[i].head && snaps[i].head !== head) continue;
    const m = byId.get(id);
    if (!m) return i;
    if (keyOf(m) !== up && m === newest) return i;
  }
  return -1;
}

/**
 * Did the reply that carried the pending event go away? It was inserted into the request after the message `event.after`; the
 * reply that carries it is the first reply after that message. Gone when that message is gone, no reply follows it, or the
 * reply is the one `drop` names (it is being written again). An event without `after` (sent before this existed) is never lost.
 */
export function eventLost(event, msgs, drop) {
  if (!event || !(event.sent > 0) || !event.after || !msgs.length) return false;
  const id = String(event.after).split("#")[0];
  const i = msgs.findIndex((m) => String(m.id) === id);
  if (i < 0) return true;
  const carrier = msgs.slice(i + 1).find(isReply);
  return !carrier || (!!drop && String(carrier.id) === String(drop));
}

/** Puts snapshot `i` back, and drops it and every later one from the list. Edits made by hand since stay. */
function undoFrom(state, snaps, i) {
  const snap = snaps[i];
  const mine = state.entities.filter((e) => e.by === "player" && Number.isFinite(e.at) && e.at > snap.at);
  const nextId = state.nextId;
  const nextFront = state.nextFront;
  for (const k of CORE_KEYS) {
    if (snap.core[k] === undefined) delete state[k];
    else state[k] = cloneJson(snap.core[k]);
  }
  // ids are never handed out twice, so the file of what fired and the registry links keep one meaning per id
  state.nextId = Math.max(nextId, Number.isInteger(state.nextId) ? state.nextId : 1);
  state.nextFront = Math.max(nextFront, Number.isInteger(state.nextFront) ? state.nextFront : 1);
  if (!Array.isArray(state.entities)) state.entities = [];
  if (!Array.isArray(state.fronts)) state.fronts = [];
  const gone = new Set(arr(state.dropped).filter((d) => d.at > snap.at).map((d) => d.id));
  state.entities = state.entities.filter((e) => !gone.has(e.id));
  for (const e of mine) {
    if (gone.has(e.id)) continue;
    const j = state.entities.findIndex((x) => x.id === e.id);
    if (j >= 0) state.entities[j] = e;
    else if (state.entities.length < ENTITIES_MAX) state.entities.push(e);
  }
  const undone = new Set(snaps.slice(i).map((x) => x.upTo));
  state.log = state.log.map((r) => (isObj(r) && undone.has(r.key) && !r.error ? { ...r, undone: true } : r));
}

/**
 * Brings the world in line with the chat. `state` changes in place and the caller saves it (and rewrites the book when
 * `undone` is above 0). `drop` = the id of the reply that is about to be written again (a swipe).
 * Returns { undone: runs put back, event: the pending event is due again }.
 */
export function reconcile(fsx, state, msgs, { drop = "" } = {}) {
  const out = { undone: 0, event: false };
  if (!msgs.length) return out;
  const snaps = loadSnaps(fsx, state.chatId);
  const i = firstGone(snaps, msgs, drop);
  if (i >= 0) {
    undoFrom(state, snaps, i);
    saveSnaps(fsx, state.chatId, snaps.slice(0, i));
    out.undone = snaps.length - i;
  } else {
    // history was trimmed from the top: the first message now is the first message for the snapshots too
    const head = String(msgs[0].id);
    if (snaps.some((x) => x.head && x.head !== head)) saveSnaps(fsx, state.chatId, snaps.map((x) => ({ ...x, head })));
  }
  if (eventLost(state.event, msgs, drop)) {
    const { after, sentAt, ...rest } = state.event;
    state.event = { ...rest, sent: 0 };
    out.event = true;
  }
  // a person's entrance rides the same way: a reply that carried it and is gone (deleted, swiped) sends it again
  if (eventLost(state.entrance, msgs, drop)) {
    const { after, sentAt, ...rest } = state.entrance;
    state.entrance = { ...rest, sent: 0 };
    out.event = true;
  }
  return out;
}

/** reconcile + save, and the world book written again from the restored records. */
function settle(fsx, state, chat, drop) {
  const r = reconcile(fsx, state, chat.msgs, { drop });
  if (r.undone || r.event) {
    if (r.undone && (state.entities.length || readJson(fsx, "lorebooks/" + state.bookId + ".json", null))) {
      writeBook(fsx, state, str(chat.meta.title));
      bindBook(fsx, state.chatId, chat.meta, state.bookId);
    }
    saveState(fsx, state);
  }
  return r;
}

const textLen = (m) => (str(m.text) ? String(m.text).trim().length : 0);

/**
 * The messages after the one the carrying reply followed (event.after) and before `firstKey` (what this run reads): the
 * part of the story earlier runs already took. A sweep reads on without judging an event, so by the time a full run asks
 * "did it happen?" the scene may sit in messages the run no longer sees, and the answer was a false "no" that sent the
 * event again, in a later scene (a pharmacy visit played out, then Tuesday morning started with it). The oldest
 * SINCE_MSGS are kept: the carrier is the likeliest place for it.
 */
export function eventSince(event, msgs, firstKey) {
  if (!event || !(event.sent > 0) || !event.after || !arr(msgs).length) return [];
  const id = String(event.after).split("#")[0];
  const i = msgs.findIndex((m) => String(m.id) === id);
  if (i < 0) return [];
  const j = firstKey ? msgs.findIndex((m) => keyOf(m) === firstKey) : -1;
  return msgs.slice(i + 1, j < 0 ? msgs.length : j).filter((m) => str(m.text)).slice(0, SINCE_MSGS);
}

/**
 * A missed event is sent once more with the next reply, but only while the story is where it was written. After a move
 * (a time skip, a new scene) it would drag the story back to a place it left. Events written before this field existed
 * have no place and are not judged.
 */
export function retryStale(event, scene) {
  if (!event || !event.retried || event.sent > 0 || !scene) return false;
  if (event.placeId && scene.placeId) return event.placeId !== scene.placeId;
  const now = placeKey(scene.place);
  return !!event.place && !!now && event.place !== now;
}

/** The largest per-message size c with sum(min(len, c)) <= budget, at most MSG_MAX. */
function fairCap(lens, budget) {
  let lo = 0;
  let hi = MSG_MAX;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lens.reduce((n, l) => n + Math.min(l, mid), 0) <= budget) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * What one run reads of the unread messages: { msgs, cap, rest }. All of them when each can keep
 * at least MSG_MIN chars (long ones are cut in the middle to a fair share of NEW_TEXT_MAX, so no
 * message is lost); else the oldest ones that fit, and `rest` waits for the next run (catch-up).
 */
export function takeUnread(unread) {
  const lens = unread.map(textLen);
  // each line also carries "[name] " and a newline
  const cap = fairCap(lens, NEW_TEXT_MAX - LINE_EXTRA * unread.length);
  if (cap >= MSG_MIN || unread.length <= 1) return { msgs: unread, cap: Math.max(cap, MSG_MIN), rest: [] };
  let size = 0;
  let n = 0;
  while (n < unread.length && (n === 0 || size + Math.min(lens[n], MSG_MAX) + LINE_EXTRA <= NEW_TEXT_MAX)) size += Math.min(lens[n++], MSG_MAX) + LINE_EXTRA;
  return { msgs: unread.slice(0, n), cap: MSG_MAX, rest: unread.slice(n) };
}

/** How far behind the DM is: unread messages one run cannot read, and the runs it takes to read them all. */
export function behindOf(unread) {
  let rest = unread;
  let runs = 0;
  while (rest.length && runs < 200) {
    const take = takeUnread(rest);
    rest = take.rest;
    runs++;
  }
  const first = takeUnread(unread).rest.length;
  return { messages: first, runs: first ? runs : 0 };
}

/**
 * The scene as the Dashboard sensor saw it last on the chat's active line: { direction, before,
 * key, stagnant } (stagnant = turns since the place, the cast or the scene last changed), or
 * null when the Dashboard has no snapshot for this chat.
 */
const THING_ID = /^o\d{1,6}$/;
const layoutThings = (list) => arr(list).filter((o) => isObj(o) && str(o.item)).slice(-12).map((o) => ({ ...(THING_ID.test(str(o.id)) ? { id: str(o.id) } : {}), item: cut(str(o.item), NAME_MAX), where: cut(str(o.where), NAME_MAX) }));
/** A character's worn and held things as the Dashboard registered them: [{ id: "t#", kind: "wear" | "hold", text }]. Entries without an id are dropped (the words stay in outfit / holding). */
const sceneItems = (list) => arr(list).filter((x) => isObj(x) && THING_ID.test(str(x.id))).slice(0, 24).map((x) => ({ id: str(x.id), kind: x.kind === "hold" ? "hold" : "wear", text: cut(str(x.text), ITEM_MAX) }));

export function sceneOf(fsx, chatId, msgs) {
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const snaps = isObj(dash) && isObj(dash.snapshots) ? dash.snapshots : null;
  if (!snaps) return null;
  const line = msgs.map(keyOf).filter((k) => isObj(snaps[k]));
  if (!line.length) return null;
  const last = snaps[line[line.length - 1]];
  const sig = (sn) => [isObj(sn.clock) ? str(sn.clock.place) : "", arr(sn.present).slice().sort().join("|")].join("/");
  let stagnant = 0;
  for (let i = line.length - 1; i >= 0; i--) {
    const sn = snaps[line[i]];
    if ((isObj(sn.scene) && sn.scene.new === true) || sig(sn) !== sig(last)) break;
    stagnant++;
  }
  const sc = isObj(last.scene) ? last.scene : {};
  return {
    key: line[line.length - 1],
    direction: DIRECTIONS.includes(sc.direction) ? sc.direction : null,
    before: DIRECTIONS.includes(sc.before) ? sc.before : null,
    stagnant,
    // where the sensor puts the scene now (free text), and who is in it
    place: isObj(last.clock) ? cut(str(last.clock.place), NAME_MAX * 2) : "",
    // the registry id of that place, when the sensor's place was resolved (clock.placeId)
    ...(isObj(last.clock) && /^l\d{1,6}$/.test(str(last.clock.placeId)) ? { placeId: str(last.clock.placeId) } : {}),
    present: arr(last.present).map(str).filter(Boolean).slice(0, 12),
    // every place the sensor named along the line (newest first), the things lying around now and the ones left in the place the story just left (#185)
    places: placesAlong(snaps, line),
    objects: layoutThings(isObj(last.layout) ? last.layout.objects : []),
    left: isObj(last.layout) && isObj(last.layout.left) ? { place: cut(str(last.layout.left.place), NAME_MAX * 2), objects: layoutThings(last.layout.left.objects) } : null,
    // the sensor's own lines per character (free text), for the outfit when the sensor keeps it
    chars: Object.fromEntries(Object.entries(isObj(last.chars) ? last.chars : {}).filter(([, c]) => isObj(c) && (str(c.outfit) || str(c.holding) || sceneItems(c.items).length)).slice(0, 12).map(([n, c]) => [cut(n, NAME_MAX), { outfit: cut(str(c.outfit), 300), holding: cut(str(c.holding), 200), ...(sceneItems(c.items).length ? { items: sceneItems(c.items) } : {}) }])),
    // objects of the places the scene left, kept by place id (layout.byPlace, when the Dashboard writes it)
    ...(isObj(last.layout) && isObj(last.layout.byPlace) && Object.keys(last.layout.byPlace).length
      ? { byPlace: Object.fromEntries(Object.entries(last.layout.byPlace).filter(([k]) => /^l\d{1,6}$/.test(k)).slice(0, 12).map(([k, v]) => [k, layoutThings(v)])) }
      : {}),
  };
}

/** A place as the DM compares it between runs: case, punctuation and spaces do not count. */
export const placeKey = (place) => str(place).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// ---------- the sweep (#185): code reads what the scene tracker met, the DM decides what is worth a record ----------
const SWEEP_STOP = new Set(["the", "a", "an", "of", "in", "on", "at", "to", "and", "s"]);
const nameWords = (v) => placeKey(v).split(" ").filter((w) => w && !SWEEP_STOP.has(w));
/** One name says the other: every word of the shorter is in the longer ("changing room" in "the locked changing room"). */
export const looseSame = (a, b) => {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return false;
  const [sh, lg] = x.length <= y.length ? [x, y] : [y, x];
  return sh.every((w) => lg.includes(w));
};
/** known says everything name does (all of name's words are in it): "corridor" is covered by "school corridor", "school corridor" is not covered by "School". */
const covered = (known, name) => {
  const w = nameWords(name);
  const k = nameWords(known);
  return w.length > 0 && w.every((x) => k.includes(x));
};
function placesAlong(snaps, line) {
  const out = [];
  for (let i = line.length - 1; i >= 0 && out.length < 12; i--) {
    const sn = snaps[line[i]];
    const name = isObj(sn) && isObj(sn.clock) ? cut(str(sn.clock.place), NAME_MAX * 2) : "";
    if (name && !out.some((o) => looseSame(o, name))) out.push(name);
  }
  return out;
}
const SWEEP_PLACES = 6;
const SWEEP_ASKED_MAX = 100;
/**
 * Places and things the scene tracker named that the book has no record of and that no earlier sweep offered.
 * Pure: the scene is what sceneOf read, the book is state.entities.
 */
export function sweepCandidates(state, scene) {
  const out = { places: [], things: [] };
  if (!scene) return out;
  const asked = arr(state.sweepAsked);
  const seen = (kind, name) => state.entities.some((e) => e.kind === kind && namesOf(e).some((n) => covered(n, name))) || asked.some((k) => covered(k, name));
  for (const name of arr(scene.places)) {
    if (out.places.length >= SWEEP_PLACES) break;
    if (!seen("place", name) && !out.places.some((o) => looseSame(o, name))) out.places.push(name);
  }
  // the scene's own place has the tracker's id: the DM's record of it carries that id (ref) whatever language it is named in
  const here = scene.placeId ? out.places.find((n) => looseSame(n, str(scene.place))) : "";
  if (here) out.placeIds = { [here]: scene.placeId };
  // things are not offered any more (#424, step 3): a cup of noodles in a guard's hands is not a record; the DM records a thing that has a reason
  return out;
}
/** A sweep is due: there is something to offer the DM and at least one reply came since its last run. */
export function sweepDue(state, msgs, scene) {
  if (!scene) return false;
  const c = sweepCandidates(state, scene);
  return (c.places.length > 0 || c.things.length > 0) && repliesSince(msgs, state.lastKey) >= 1;
}
/** What was offered is not offered again, whether the DM recorded it or not. */
function markSwept(state, c) {
  const names = [...c.places, ...c.things.map((t) => t.name)].map((n) => cut(n, NAME_MAX * 2));
  state.sweepAsked = [...arr(state.sweepAsked), ...names.filter((n) => !arr(state.sweepAsked).some((k) => covered(k, n)))].slice(-SWEEP_ASKED_MAX);
}
const TRACKED_MAX = 10;
/**
 * The things the scene tracker keeps in the scene now (lying, or held by someone) that no active record is linked to,
 * with their ids. The DM ties a record of its own to one of them with an update's ref, so a thing it named in the story's
 * language and the tracker named in its own words become one. Things the sweep offers are left to the sweep.
 */
export function trackedThings(state, scene, rc, sweep) {
  if (!scene || !rc) return [];
  const linked = new Set(
    Object.entries(isObj(state.regIds) ? state.regIds : {})
      .filter(([k]) => state.entities.some((e) => e.id === k && e.status === "active"))
      .map(([, v]) => regCanonId(rc.reg, v)),
  );
  const swept = new Set(arr(sweep && sweep.things).map((t) => str(t.id)).filter(Boolean));
  const out = [];
  const put = (id, text, where) => {
    const cid = regCanonId(rc.reg, id);
    if (!THING_ID.test(cid) || linked.has(cid) || swept.has(id) || out.some((o) => o.id === cid)) return;
    out.push({ id: cid, text: cut(str(text), NAME_MAX), where: cut(str(where), NAME_MAX) });
  };
  // the scene's own place, when no place record is linked to it yet
  const pid = scene.placeId ? regCanonId(rc.reg, scene.placeId) : "";
  if (/^l\d{1,6}$/.test(pid) && !linked.has(pid) && str(scene.place)) out.push({ id: pid, text: cut(str(scene.place), NAME_MAX), where: "the scene's place now" });
  for (const o of arr(scene.objects)) if (o.id) put(o.id, o.item, o.where);
  for (const [who, c] of Object.entries(isObj(scene.chars) ? scene.chars : {})) for (const i of arr(c.items)) if (i.kind === "hold") put(i.id, i.text, who + " holds it");
  return out.slice(0, TRACKED_MAX);
}
/** The block of a DM run that lists the tracker's unlinked things and place. */
function trackedInput(list) {
  return "Things and the place the scene tracker keeps, by its id\n" + list.map((t) => t.id + " " + t.text + (t.where ? " (" + t.where + ")" : "")).join("; ") + ".\nWhen one of your records is one of these, whatever language it is named in, send an update of that record with its ref.";
}

/** The block of a DM run that lists what the sweep found. */
function sweepInput(c) {
  const rows = [];
  const ids = isObj(c.placeIds) ? c.placeIds : {};
  if (c.places.length) rows.push("Places: " + c.places.map((n) => (ids[n] ? ids[n] + " " : "") + n).join("; ") + ".");
  if (c.things.length) rows.push("Things: " + c.things.map((t) => (t.id ? t.id + " " : "") + t.name + (t.where || t.place ? " (" + [t.where, t.place && "in " + t.place].filter(Boolean).join(", ") + ")" : "")).join("; ") + ".");
  return "Named in the story by the scene tracker, with no record yet\n" + rows.join("\n") + "\nRecord each place the story may come back to (a room, a school, a cafe; a room inside a bigger place is a spot of it). Leave out what is only passing. Name them as the story does.";
}

// ---------- the tidy-up (#424, step 3): things that played out leave the book, in code, no model call ----------
// Every TIDY_EVERY replies: a thing named in fewer than TIDY_NAMED_MIN of the last TIDY_EVERY replies, that belongs to nobody named and is not
// pinned or kept for a reason (clue, hidden, promise), is put to rest (status "dormant": out of the book and the DM's input, restorable). A
// thing that existed at the last pass is judged; a younger one waits for the next. An archived thing named in TIDY_WAKE_NAMED of the last
// TIDY_EVERY replies, or named again by the DM, is active again. People, places and groups are never put to rest by this pass.
export const TIDY_EVERY = 10;
const TIDY_NAMED_MIN = 3;
const TIDY_WAKE_NAMED = 2;
const TIDY_EXEMPT = ["clue", "hidden", "promise"];

function tidyNote(state, line) {
  state.tidyLog = [...arr(state.tidyLog), line].slice(-TIDY_LOG_MAX);
}

/**
 * One pass. state is changed in place. msgs = the chat, scene = what sceneOf read (or null), cards = the cards' character names,
 * userName = the player's character. force = "Tidy now": runs at once, and a chat with no earlier pass judges every thing.
 * Returns { ran, archived: [records], woken: [records] }.
 */
export function tidyBook(state, { msgs, scene, cards, userName, now, force }) {
  const out = { ran: false, archived: [], woken: [] };
  if (!force && state.settings.tidy === false) return out;
  const replies = msgs.filter(isReply);
  const n = replies.length;
  if (!force && (n < TIDY_EVERY || (state.tidy && n - state.tidy.n < TIDY_EVERY))) return out;
  const texts = replies.slice(-TIDY_EVERY).map((m) => str(m.text));
  const seen = new Set(state.tidy ? state.tidy.seen : []);
  // no earlier pass: the first automatic pass only takes the list, "Tidy now" judges everything
  if (!state.tidy && !force) {
    state.tidy = { n, seen: state.entities.filter((e) => e.kind === "thing" && e.status === "active").map((e) => e.id) };
    out.ran = true;
    return out;
  }
  const judged = (id) => (state.tidy ? seen.has(id) : true);
  const owners = new Set(
    [...arr(cards), userName, ...state.entities.filter((e) => e.kind === "person" && e.status === "active").flatMap(namesOf)].map((x) => str(x).toLowerCase()).filter(Boolean),
  );
  const chars = isObj(scene && scene.chars) ? Object.values(scene.chars) : [];
  const belongs = (rec, re) => (rec.holder && owners.has(rec.holder.toLowerCase())) || (!!re && chars.some((c) => re.test(str(c.holding)) || arr(c.items).some((i) => re.test(str(i.text)))));
  const at = now || Date.now();
  for (const rec of state.entities) {
    if (rec.kind !== "thing") continue;
    const re = namesPattern(namesOf(rec));
    const count = re ? texts.filter((t) => re.test(t)).length : 0;
    if (rec.status === "dormant") {
      if (count >= TIDY_WAKE_NAMED) {
        rec.status = "active";
        out.woken.push(rec);
        tidyNote(state, { at, n, id: rec.id, name: rec.name, act: "wake", count, via: "code", ...(rec.why ? { why: rec.why } : {}) });
      }
      continue;
    }
    if (rec.status !== "active" || !judged(rec.id)) continue;
    if (rec.pinned === true || TIDY_EXEMPT.includes(rec.why) || count >= TIDY_NAMED_MIN || belongs(rec, re)) continue;
    rec.status = "dormant";
    out.archived.push(rec);
    tidyNote(state, { at, n, id: rec.id, name: rec.name, act: "archive", count, via: "code", ...(rec.why ? { why: rec.why } : {}) });
  }
  state.tidy = { n, seen: state.entities.filter((e) => e.kind === "thing" && e.status === "active").map((e) => e.id) };
  out.ran = true;
  return out;
}

/** Runs a pass for a chat and saves the state and the book when it changed something. Returns what tidyBook returned. */
function runTidy(fsx, state, chat, force) {
  const scene = sceneOf(fsx, state.chatId, chat.msgs);
  const res = tidyBook(state, { msgs: chat.msgs, scene, cards: cardNames(fsx, chat.meta), userName: userNameOf(fsx, chat.meta), force });
  if (res.ran) {
    saveState(fsx, state);
    if (res.archived.length || res.woken.length) {
      writeBook(fsx, state, str(chat.meta.title));
      bindBook(fsx, state.chatId, chat.meta, state.bookId);
    }
  }
  return res;
}

/** The direction the DM goes by: the sensor's, else what the DM said last time. */
const directionOf = (state, scene) => (scene && scene.direction) || state.direction || null;

/**
 * Why an automatic run is due now, or null: "every" (N replies), "stagnation" (the scene stood
 * still long enough for its direction), "transition" (a time skip, once per sensor snapshot).
 * Nothing runs in an explicit scene.
 */
export function dueReason(state, msgs, scene) {
  const dir = directionOf(state, scene);
  if (dir === "explicit") return null;
  // the book keeps itself whatever the DM's level: with the DM off only the sweep runs
  if (state.settings.level === "off") return sweepDue(state, msgs, scene) ? "sweep" : null;
  if (state.settings.onTransition && scene && scene.direction === "transition" && state.transitionKey !== scene.key) return "transition";
  // the story left a place: write the scene it was. Two new replies at least, so a place the sensor words
  // differently from one reply to the next does not run the DM every time
  if (state.settings.onPlace && scene && placeKey(scene.place) && state.lastPlace && placeMoved(state, scene) && repliesSince(msgs, state.lastKey) >= 2) return "place";
  const due = dueParts(state, msgs);
  if (due.full === 0) return "every";
  if (due.records === 0) return "records";
  if (sweepDue(state, msgs, scene)) return "sweep";
  if (state.settings.stagnation > 0 && scene) {
    const factor = STAGNATION_FACTOR[dir || "social"];
    // the still stretch counts from the last run too, or a scene that stays still would run the DM every reply
    const still = Math.min(scene.stagnant, unreadMessages(msgs, state.lastKey).filter(isReply).length);
    if (factor > 0 && still >= Math.max(1, Math.round(state.settings.stagnation * factor))) return "stagnation";
  }
  return null;
}

const repliesSince = (msgs, key) => unreadMessages(msgs, key).filter(isReply).length;

/** Replies until the next full run (fronts, events) and until the next records-only run; the chronicler has only the records' cadence. */
function dueParts(state, msgs) {
  const s = state.settings;
  const records = Math.max(0, (s.recordsEveryN || s.everyN) - repliesSince(msgs, state.lastKey));
  const full = s.level === "chronicler" ? records : Math.max(0, s.everyN - repliesSince(msgs, state.levelKey || state.lastKey));
  return { records, full };
}

/** How many replies until the next automatic run (0 = due now). */
export function dueIn(state, msgs) {
  const due = dueParts(state, msgs);
  return Math.min(due.records, due.full);
}

function memberIds(fsx, meta) {
  // a world built without a chat names its cards itself
  if (Array.isArray(meta.cardIds)) return meta.cardIds.filter((id) => typeof id === "string" && CHAT_ID.test(id));
  const ids = meta.groupId ? arr(readJson(fsx, "groups/" + meta.groupId + ".json", {}).memberIds) : meta.characterId ? [meta.characterId] : [];
  return ids.filter((id) => typeof id === "string" && CHAT_ID.test(id));
}

function cardNames(fsx, meta) {
  const names = [];
  for (const id of memberIds(fsx, meta)) {
    const card = readJson(fsx, "characters/" + id + "/card.json", null);
    const name = isObj(card) ? str(card.name) || (isObj(card.data) ? str(card.data.name) : "") : "";
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** {{user}} and {{char}} (case-insensitive, spaces inside the braces allowed) in text that goes to a helper model as
 *  input. An empty name leaves its macro raw. Other macros stay raw. Copied from plugins/litopys, relations, letters,
 *  agents (#156); test/rp-helper-names.test.ts keeps the copies equal. */
export function expandNames(text, userName, charName) {
  if (typeof text !== "string" || text.indexOf("{{") < 0) return text;
  const u = typeof userName === "string" ? userName.trim() : "";
  const c = typeof charName === "string" ? charName.trim() : "";
  let out = text;
  if (u) out = out.replace(/\{\{\s*user\s*\}\}/gi, () => u);
  if (c) out = out.replace(/\{\{\s*char\s*\}\}/gi, () => c);
  // macros with nothing for a helper to read (#283): comments, variable writes and reads (their values live in the preset, which
  // a helper call does not carry), line breaks and random picks (the first choice) are settled here, so the helper does not read
  // `{{getvar::mood}}` as story text. {{if}} blocks and the other macros stay raw.
  out = out
    .replace(/\{\{\s*\/\/[\s\S]*?\}\}/g, "")
    .replace(/\{\{\s*(?:setvar|setglobalvar|addvar|addglobalvar|incvar|decvar|getvar|getglobalvar)\s*::[^{}]*\}\}/gi, "")
    .replace(/\{\{\s*(?:trim|noop)\s*\}\}/gi, "")
    .replace(/\{\{\s*newline\s*\}\}/gi, "\n")
    .replace(/\{\{\s*(?:random|pick)\s*::([^{}]*)\}\}/gi, (_m, a) => a.split("::")[0].trim())
    .replace(/\{\{\s*(?:random|pick)\s*:([^:{}][^{}]*)\}\}/gi, (_m, a) => a.split(",")[0].trim());
  return out;
}

/** The names {{user}} and {{char}} stand for in a helper request: the persona, and the card only in a solo chat (#156). */
export function helperNames(fsx, meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  const names = !m.groupId && memberIds(fsx, m).length === 1 ? cardNames(fsx, m) : [];
  return { user: userNameOf(fsx, m), char: names[0] || "" };
}

/** A helper request's text with {{user}} and {{char}} expanded (#156). Without a chat the text is returned as it is. */
function expandNamesFor(fsx, meta, text) {
  if (!meta || typeof text !== "string" || text.indexOf("{{") < 0) return text;
  const n = helperNames(fsx, meta);
  return expandNames(text, n.user, n.char);
}

function userNameOf(fsx, meta) {
  if (str(meta.userName)) return str(meta.userName);
  if (meta.personaId && CHAT_ID.test(String(meta.personaId))) {
    const persona = readJson(fsx, "personas/" + meta.personaId + ".json", null);
    if (persona && str(persona.name)) return str(persona.name);
  }
  return "";
}

// ---------- the entity registry (#240): a person keeps one name across the World DM, Litopys and the Dashboard ----------
// Persons whose own source is not the story: the DM never records them as NPCs.
const REG_OWN_SRC = ["persona", "card", "soul", "group"];

function cardObjects(fsx, meta) {
  const out = [];
  for (const id of memberIds(fsx, meta)) {
    const card = readJson(fsx, "characters/" + id + "/card.json", null);
    if (isObj(card)) out.push({ id, card });
  }
  return out;
}

/**
 * The chat's registry context: the registry (loaded, seeded with the chat's cards and the persona, saved when seeding
 * added something: regSeed is idempotent) and the Dashboard's display names for people (read only). `dirty` = the
 * registry changed since; save it with regFlush.
 */
export function openRegistry(fsx, chatId, meta) {
  let reg;
  try {
    reg = regLoad(fsx, chatId);
    const before = JSON.stringify(reg);
    regSeed(reg, { cards: cardObjects(fsx, meta), personaName: userNameOf(fsx, meta) });
    if (JSON.stringify(reg) !== before) regSave(fsx, reg);
  } catch {
    reg = regNew(chatId);
  }
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  return { reg, ids: isObj(dash) && isObj(dash.personIds) ? dash.personIds : null, dirty: false };
}

/** The chat's registry for reading only (nothing is seeded or saved), or null. */
function regView(fsx, chatId) {
  try {
    return regLoad(fsx, chatId);
  } catch {
    return null;
  }
}

/** Save the registry when this run changed it. Call it right after the change, with a registry opened right before it. */
export function regFlush(fsx, rc) {
  if (!rc || !rc.dirty) return;
  rc.dirty = false;
  try {
    regSave(fsx, rc.reg);
  } catch {}
}

/** The registry person a word means (a learned spelling is kept as an alias), or null. */
function regPersonOf(rc, text) {
  const s = str(text);
  if (!rc || !s) return null;
  const r = resolveName(rc.reg, s, "person");
  if (!r || !r.id) return null;
  const e = regGet(rc.reg, r.id);
  if (e && r.step > 1 && e.id !== "user" && regLearn(rc.reg, e.id, s)) rc.dirty = true;
  return e;
}

/** How the Dashboard and the rest of the app name this person: `user` for the user's character, else the Dashboard's display name for the id, else the registry name. */
function regDisplay(rc, e) {
  if (e.id === "user") return "user";
  if (rc.ids) {
    for (const [k, v] of Object.entries(rc.ids)) {
      if (typeof v === "string" && typeof k === "string") {
        const t = regGet(rc.reg, v);
        if (t && t.id === e.id && !/^(?:user|[pol]\d+)$/.test(k)) return k;
      }
      if (typeof v === "string" && regGet(rc.reg, k) && regGet(rc.reg, k).id === e.id && /^(?:user|[pol]\d+)$/.test(k)) return v;
    }
  }
  return e.name;
}

/** A name written by the DM, as the app names that person; unknown names stay as written. */
function regCanon(rc, text) {
  const s = str(text);
  if (!rc || !s) return s;
  const e = regPersonOf(rc, s);
  return e ? regDisplay(rc, e) : s;
}

/** The NPC record of the person this word means (by the registry), or null. */
function npcRecordOf(state, rc, text) {
  const e = regPersonOf(rc, text);
  if (!e || !isObj(state.regIds)) return null;
  const rid = Object.keys(state.regIds).find((k) => {
    const t = regGet(rc.reg, state.regIds[k]);
    return !!t && t.id === e.id;
  });
  return rid ? state.entities.find((x) => x.id === rid) || null : null;
}

/** The registry id letter of each record kind that is linked: a person p#, a thing o#, a place l# (state.regIds). */
const REG_LINK_LETTER = { person: "p", thing: "o", place: "l" };

/** The registry id after merges (the Dashboard may hold an id that was merged into another); the same text when the registry does not know it. */
const regCanonId = (reg, id) => {
  const e = reg && str(id) ? regGet(reg, str(id)) : null;
  return e ? e.id : str(id);
};

/** The registry thing or place (kind) a word means, or null; a learned spelling is kept as an alias. */
function regKindOf(rc, text, kind) {
  const w = str(text);
  if (!rc || !w) return null;
  const r = resolveName(rc.reg, w, kind);
  if (!r || !r.id) return null;
  const e = regGet(rc.reg, r.id);
  if (!e || e.kind !== kind) return null;
  if (r.step > 1 && regLearn(rc.reg, e.id, w)) rc.dirty = true;
  return e;
}

/** The record of this kind linked to the registry entity a word means (any spelling of it), or null. */
function recordOfKind(state, rc, text, kind) {
  const e = regKindOf(rc, text, kind);
  if (!e || !isObj(state.regIds)) return null;
  const rid = Object.keys(state.regIds).find((k) => regCanonId(rc.reg, state.regIds[k]) === e.id && state.entities.some((x) => x.id === k && x.kind === kind && x.status === "active"));
  return rid ? state.entities.find((x) => x.id === rid) : null;
}

/** A tracker id the DM wrote (ref): o# for a thing, l# for a place. */
const REF_ID = /^[ol]\d{1,6}$/;

/** The registry entity a DM's ref means: the right letter for the kind, known to the registry, of that kind; else null. */
function refEntity(rc, ref, kind) {
  const r = str(ref);
  if (!rc || !REF_ID.test(r) || r[0] !== REG_LINK_LETTER[kind]) return null;
  const e = regGet(rc.reg, r);
  return e && e.kind === kind ? e : null;
}

/** The active record of this kind already linked to that registry entity, or null. */
function recordOfRef(state, rc, e, kind) {
  if (!isObj(state.regIds)) return null;
  const rid = Object.keys(state.regIds).find((k) => regCanonId(rc.reg, state.regIds[k]) === e.id && state.entities.some((x) => x.id === k && x.kind === kind && x.status === "active"));
  return rid ? state.entities.find((x) => x.id === rid) : null;
}

/**
 * Link a record to the tracker's entity the DM named by ref. The record's name (the story's language) becomes an alias of
 * it. A record the World had linked to an entity of its own (a copy made before the ids were shown) has that copy merged
 * into the tracker's, so the two stay one. A record linked to another tracker entity is left alone: the DM may be wrong.
 */
function linkToRef(state, rc, rec, e) {
  const now = isObj(state.regIds) ? state.regIds[rec.id] : "";
  const cur = now ? regGet(rc.reg, now) : null;
  if (cur && cur.id === e.id) return;
  if (cur && cur.src !== "world") return;
  if (recordOfRef(state, rc, e, rec.kind)) return;
  if (cur && regMerge(rc.reg, cur.id, e.id)) rc.dirty = true;
  (state.regIds ||= {})[rec.id] = e.id;
  for (const n of namesOf(rec)) if (regAlias(rc.reg, e.id, n, "world")) rc.dirty = true;
}

/**
 * Link a thing or place record to the registry (state.regIds): the registry entity its name means (the Dashboard may have
 * registered it already), else a new one made by the World. Already linked, retired and other kinds are left alone.
 */
function linkRecord(state, rc, rec) {
  if (!rc || !rec || (rec.kind !== "thing" && rec.kind !== "place") || rec.status !== "active") return;
  const now = isObj(state.regIds) ? state.regIds[rec.id] : "";
  if (now && regGet(rc.reg, now)) return;
  let e = null;
  for (const n of namesOf(rec)) {
    e = regKindOf(rc, n, rec.kind);
    if (e) break;
  }
  if (e) {
    if (regAlias(rc.reg, e.id, rec.name, "world")) rc.dirty = true;
  } else {
    e = regAdd(rc.reg, { kind: rec.kind, name: rec.name, src: "world", aliases: rec.aliases });
    if (e) rc.dirty = true;
  }
  if (e) (state.regIds ||= {})[rec.id] = e.id;
}

/** The parent place or the place a record names (inside / place), written as the linked place record's name; the text when no record answers to it. */
function canonPlaceName(state, rc, text, self) {
  const w = str(text);
  if (!rc || !w) return w;
  const p = recordOfKind(state, rc, w, "place");
  return p && (!self || p.id !== self.id) ? p.name : w;
}

/** After a report: every thing and place record is linked, and an inside / place that names a recorded place uses that record's name. */
function settleLinks(state, rc) {
  if (!rc) return;
  for (const e of state.entities) linkRecord(state, rc, e);
  for (const e of state.entities) {
    if (e.status !== "active") continue;
    if (e.kind === "place" && e.inside) e.inside = cut(canonPlaceName(state, rc, e.inside, e), NAME_MAX);
    else if (e.kind === "thing" && e.place) e.place = cut(canonPlaceName(state, rc, e.place), NAME_MAX);
  }
}

/** The cast line of a DM run: the cards' people with the other names they answer to. */
export function castOf(rc, cards) {
  if (!rc) return cards;
  const out = [];
  const seen = new Set();
  const put = (e, fallback) => {
    if (e && seen.has(e.id)) return;
    if (e) seen.add(e.id);
    const name = e ? e.name : fallback;
    const also = e ? e.aliases.map((a) => a.text).slice(0, 6) : [];
    out.push(name + (also.length ? " (also " + also.join(", ") + ")" : ""));
  };
  for (const c of cards) {
    const e = regPersonOf(rc, c);
    put(e && e.id !== "user" ? e : null, c);
  }
  for (const e of rc.reg.entities) if (!e.merged && e.kind === "person" && ["card", "soul", "group"].includes(e.src)) put(e, e.name);
  return out;
}

// ---------- the DM call ----------
const CHRONICLER_RULES = [
  "You are the world keeper of an ongoing roleplay story. You read the newest part of the story and keep the record of its world: people, places, groups and things that matter beyond this one scene. Another model writes the story; it reads your record when a name comes up again.",
  "Rules:",
  "- The story text is canon. Record only what it shows or plainly says. Never invent events, and never contradict the story.",
  "- Do not record the user's character or the characters listed as having their own cards: they are kept elsewhere.",
  "- Skip what does not matter beyond this scene: a nameless passer-by, the furniture, a passing mood. What a character wears and carries goes to carry, not to the records. Record a thing only when the story makes it matter: a clue, a weapon, a gift, a promise, something people fight over.",
  "- One record per person, place, group or thing. Its text is one to three short sentences in the present tense: what someone needs to know when the name comes up again (who or what it is, where, how it stands toward the characters).",
  "- A custom, a law or a piece of history is not a record of its own: when the story shows one that belongs to a place or a group, say it in that record's text (an update).",
  "- Update a record only when the story changed something about it (it moved, was hurt, a secret came out). Never update a record just to reword it.",
  "- Retire a record when it is finished for good (dead, destroyed, gone from the story for good). Its text then says in one or two sentences who or what it was and how it ended.",
  "- aliases: the keys that bring this record into the story: 2 to 5 short words or phrases the story will use when it comes up again: a short name, how the characters call it, its main word (for \"IKEA dresser\": \"dresser\"; for \"Ava's house\": \"Ava's place\", \"Ava's home\"), exactly as the story would spell them. Never a word that comes up in every scene (room, door, day, man).",
  "- Write names and text in the language and script of the story's replies. Only the JSON keys and kind values are English.",
  "- When the player writes in another language or script, add the player's spellings of a name to its aliases too (Anna and \u0410\u043d\u043d\u0430): the book matches names in both.",
  "- At most {changes} changes in one reply, each text at most {text} characters. Nothing worth recording: empty lists.",
];
// places, things and what characters carry (#176): locked like the output, so a player's own keeper block still gets them
const SPACE_RULES = [
  "Places, things and what characters carry:",
  "- places: record each place the story visits and may come back to (a home, a cafe, a party house) as a record of kind place. A room or a corner of a bigger place is a spot: size \"spot\" and inside = the name of the place it belongs to. A whole place needs no size.",
  "- things: record a thing only when it has a reason, and give the reason in why: clue, hidden, promise, gift, weapon or contested (something people fight over). A thing the story only passes by (a cup, a bag, the furniture) stays out. Give it holder (the name of the person who has it) or place (the name of the place where it is, a spot when the story says where): one of them. When it is put down, picked up, handed over or moved, update it with the new holder or place, and \"\" for the one it no longer has. A bag, a phone or a key ring stays out unless the story makes it matter.",
  "- carry: for the user's character and the characters with their own cards, keep what each one wears and carries now: { who, wearing, carried: [{what, where}], nearby }. wearing = clothes and worn things; carried = what is on them or in their bag (where = the pocket or bag, optional); nearby = things close to them, not on them. Send a person only when the story changed something, and send each list you include complete: it replaces the old one. At most 12 items in a list.",
];
// the reply's shape: locked, parseReply and applyReport depend on it
const CHRONICLER_OUTPUT = [
  "Output: one JSON object and nothing else, no code fences:",
  '{"add":[{"kind":"person|place|group|thing","name":"...","aliases":["..."],"text":"...","size":"spot","inside":"...","holder":"...","place":"...","why":"clue|hidden|promise|gift|weapon|contested","ref":"o3"}],"update":[{"id":"n3","text":"...","aliases":["..."],"holder":"...","place":"...","why":"clue|hidden|promise|gift|weapon|contested","ref":"o3"}],"retire":[{"id":"n3","text":"..."}],"carry":[{"who":"...","wearing":["..."],"carried":[{"what":"...","where":"..."}],"nearby":["..."]}],"summary":"one short line: what changed in the world"}',
  "size, inside, holder and place are only for places and things; why is only for things; leave out what does not apply.",
  "ref: the scene tracker's id of that thing (o3) or place (l2), when the input shows one before its name; the same thing or place keeps that id however you name it. Leave it out otherwise, never make one up.",
];
const CARRY_JSON = '"carry":[{"who":"...","wearing":["..."],"carried":[{"what":"...","where":"..."}],"nearby":["..."]}],';
const CARRY_SHAPE = '"carry":[...],';
/** The prompt for a chat whose sensor keeps clothes and what is in the hands: the carry rule and key go, the DM is told to leave them out. */
const withoutCarry = (text) => text.split("\n").filter((l) => !l.startsWith("- carry:")).join("\n").split(CARRY_JSON).join("").split(CARRY_SHAPE).join("").replace("Places, things and what characters carry:", "Places and things:") + "";
/** The limits a prompt names: the chat's own, else the defaults. */
const limitsOf = (settings) => ({ changes: settings ? settings.changesMax : DEFAULT_SETTINGS.changesMax, text: settings ? settings.textMax : DEFAULT_SETTINGS.textMax });
const withLimits = (text, limits) => text.replace(/\{changes\}/g, String(limits.changes)).replace(/\{text\}/g, String(limits.text));
export const CHRONICLER_SYSTEM = withLimits([...CHRONICLER_RULES, ...SPACE_RULES, ...CHRONICLER_OUTPUT].join("\n"), limitsOf(null));

// what each level above the chronicler may do; one block, added to the chronicler's rules
const LEVEL_RULES = {
  living: [
    "Your level: living world. Beyond the record, you keep the world moving off screen. The characters are not the only ones with plans.",
    "- fronts: factions, threats and powers with a goal and a clock (4, 6 or 8 segments). Add a front only when the story set one up. Tick a clock by 1 when time passes or the front's plan moves on off screen; a full clock means its goal comes true.",
    "- event: at most one piece of news that may reach the characters from off screen (a rumour, a letter, talk in the street), soft: the story may use it or not. Only when a clock moved or the story stands still. Never in the middle of a fight.",
  ],
  director: [
    "Your level: director. Beyond the record, you keep the world moving and bring things into the scene.",
    "- fronts: factions, threats and powers with a goal and a clock (4, 6 or 8 segments). Add a front when the story set one up, or one that fits the world. Tick a clock by 1 when time passes or the front's plan moves on; a full clock means its goal comes true and touches the characters.",
    "- event: one concrete thing that happens in the next scene: a visitor, a hook, a complication, news that cannot be ignored. Build it from the record, the fronts and the open threads, never from nowhere. It must fit the genre and the tone of the story.",
  ],
  antagonist: [
    "Your level: antagonist. Beyond the record, you push back against the characters: the world has consequences and enemies who act.",
    "- fronts: factions, threats and enemies with a goal and a clock (4, 6 or 8 segments). Tick a clock by 1, or by 2 when the characters gave the front an opening; a full clock means its goal comes true and hurts the characters.",
    "- event: one concrete consequence or pressure in the next scene. Aim it where it hurts: an open thread, a bond between the characters, something they care about. Hard, but fair: built from what the story already set up. In a fight you may send reinforcements or a turn for the worse.",
  ],
  chaos: [
    "Your level: total chaos. Beyond the record, you break the story open: anything may happen, whatever the genre or the logic of the world (killer rabbits from space in a slow romance are fine).",
    "- fronts: the wildest powers you can think of, with a goal and a clock (4, 6 or 8 segments). Tick them fast.",
    "- event: one absurd, surprising, concrete thing that happens in the next scene. Still never rewrite what already happened in the story.",
  ],
};

const LEVEL_SHARED = [
  "- direction: the kind of scene now: domestic, social, intrigue, investigation, travel, combat, explicit (a sexual scene) or transition (a time skip). In an explicit scene send no event at all.",
  "- delivered: when the input shows an event sent in an earlier reply, say whether the story shows it happened (true) or not (false).",
  "- Never write the story yourself and never mention a game master: the event is one or two plain sentences of what happens, who and where.",
];

const LEVEL_SHAPE = '{"add":[...],"update":[...],"retire":[...],"carry":[...],"fronts":[{"op":"add","name":"...","goal":"...","size":6},{"op":"tick","id":"f1","by":1,"reason":"..."},{"op":"retire","id":"f1"}],"event":{"text":"..."} or null,"delivered":true|false|null,"direction":"...","summary":"..."}';

const LEVEL_OUTPUT = ["Output at this level, the same object with more keys:", LEVEL_SHAPE];

const SOFT_EVENT = "[World news, may come up in this reply if it fits: {event} If it fits, let it reach the characters as talk, a rumour or a message. Never mention where this note came from.]";
const HARD_EVENT = [
  "[WORLD EVENT: must happen in this reply]",
  "What: {event}",
  "How: bring it into this reply as part of the scene; the characters react in character.",
  "Do not: resolve it in this reply, explain where it came from, or mention a game master.",
].join("\n");

// ---------- profiles: which DM a chat gets ----------
// The five levels are the built-in profiles; the player can change their prompt blocks (only what differs
// is stored, each block resets on its own) and make profiles of their own on top of a level (its base,
// which decides what code does: fronts, events, hard or soft). The output block is never editable.
export const PROFILE_LEVELS = LEVELS.filter((l) => l !== "off");
const PROFILE_DIR = "world/profiles/";
const BLOCK_MAX = 6000;
const PROFILES_MAX = 40;
const NAME_LEN = 60;
const DESC_LEN = 300;

/** The editable blocks of a level, with their default texts (the event block's text has {event}). */
export function defaultBlocks(base) {
  const out = { keeper: CHRONICLER_RULES.join("\n") };
  if (LEVEL_RULES[base]) {
    out.level = LEVEL_RULES[base].join("\n");
    out.shared = LEVEL_SHARED.join("\n");
    out.event = HARD_LEVELS.includes(base) ? HARD_EVENT : SOFT_EVENT;
  }
  return out;
}

/** The locked output block of a level, shown read-only. */
export const outputBlock = (base) => (LEVEL_RULES[base] ? [...CHRONICLER_OUTPUT, "", ...LEVEL_OUTPUT] : CHRONICLER_OUTPUT).join("\n");

const DEFAULT_PROFILE_SETTINGS = { everyN: DEFAULT_SETTINGS.everyN, stagnation: DEFAULT_SETTINGS.stagnation, onTransition: true, insert: true };

// profile options (user, 2026-10-19, both off by default): clocks ticked by code every N replies read
// (Arbiter's way: cheaper and steadier on small models; the model then only adds and retires fronts), and
// event wording that follows the front's clock (Story Engine's way: rumour, then visible, then unmistakable)
// events deck (Arbiter's way, user 2026-10-19, off by default): built at start, the DM picks one by id
// dice (user, 2026-10-27, off by default): code rolls 2d6 plus a Dashboard number before the reply is written
export const DICE_MODES = ["off", "flavour", "strict"];
export const DICE_STATS = ["trust", "comfort", "attraction", "respect", "affection"];
// "auto": the model takes the stat the attempted action leans on (code rolls the die once and gives the result for every stat)
// how kind the dice are: the totals up to each limit are miss / no but / yes but, above the last one a full success
export const DICE_TILTS = { kind: [4, 6, 8], even: [5, 7, 9], harsh: [6, 8, 10] };
export const DICE_STAT_CHOICES = ["auto", ...DICE_STATS];
// cast: how often a person who has been away comes back, for the chats this profile starts (a chat keeps its own after that)
export const DEFAULT_OPTIONS = { clocks: "model", clockEvery: 6, eventByClock: false, deck: false, dice: "off", diceStat: "auto", diceChance: 25, diceTilt: "even", diceLife: 0, dicePace: 0, cast: "normal", castDeck: true };

function cleanOptions(o) {
  const b = isObj(o) ? o : {};
  const n = Number(b.clockEvery);
  return {
    clocks: b.clocks === "code" ? "code" : "model",
    clockEvery: Number.isFinite(n) ? clamp(Math.round(n), 2, 50) : DEFAULT_OPTIONS.clockEvery,
    eventByClock: b.eventByClock === true,
    deck: b.deck === true,
    dice: DICE_MODES.includes(b.dice) ? b.dice : DEFAULT_OPTIONS.dice,
    diceStat: DICE_STAT_CHOICES.includes(b.diceStat) ? b.diceStat : DEFAULT_OPTIONS.diceStat,
    diceChance: Number.isFinite(Number(b.diceChance)) ? clamp(Math.round(Number(b.diceChance)), 1, 100) : DEFAULT_OPTIONS.diceChance,
    diceTilt: Object.hasOwn(DICE_TILTS, b.diceTilt) ? b.diceTilt : DEFAULT_OPTIONS.diceTilt,
    diceLife: Number.isFinite(Number(b.diceLife)) && Number(b.diceLife) >= 0 ? clamp(Math.round(Number(b.diceLife)), 0, 100) : DEFAULT_OPTIONS.diceLife,
    dicePace: Number.isFinite(Number(b.dicePace)) && Number(b.dicePace) >= 0 ? clamp(Math.round(Number(b.dicePace)), 0, 100) : DEFAULT_OPTIONS.dicePace,
    cast: CAST_FREQ.includes(b.cast) ? b.cast : DEFAULT_OPTIONS.cast,
    castDeck: typeof b.castDeck === "boolean" ? b.castDeck : DEFAULT_OPTIONS.castDeck,
  };
}

function cleanDefaults(d) {
  const s = cleanSettings({ ...DEFAULT_PROFILE_SETTINGS, ...(isObj(d) ? d : {}), level: "chronicler" });
  return { everyN: s.everyN, stagnation: s.stagnation, onTransition: s.onTransition, insert: s.insert };
}

/** Changed blocks only: known keys, non-empty, not equal to the default; the event block must keep {event}. */
function cleanBlocks(raw, base) {
  const dflt = defaultBlocks(base);
  const out = {};
  if (!isObj(raw)) return out;
  for (const k of Object.keys(dflt)) {
    const v = typeof raw[k] === "string" ? raw[k].replace(/\r\n/g, "\n").trim() : "";
    if (!v || v === dflt[k]) continue;
    if (k === "event" && !v.includes("{event}")) continue;
    out[k] = cut(v, BLOCK_MAX);
  }
  return out;
}

function readProfileFile(fsx, id) {
  const raw = readJson(fsx, PROFILE_DIR + id + ".json", null);
  return isObj(raw) ? raw : null;
}

/** A profile as code trusts it, with every block's text in force; null when there is no such profile. */
export function loadProfile(fsx, id) {
  if (PROFILE_LEVELS.includes(id)) {
    const raw = readProfileFile(fsx, id) || {};
    return { id, builtIn: true, base: id, name: "", description: "", blocks: cleanBlocks(raw.blocks, id), defaults: cleanDefaults(raw.defaults), options: cleanOptions(raw.options) };
  }
  if (!OWN_PROFILE_ID.test(id)) return null;
  const raw = readProfileFile(fsx, id);
  if (!raw || !PROFILE_LEVELS.includes(raw.base)) return null;
  return {
    id, builtIn: false, base: raw.base,
    name: cut(str(raw.name), NAME_LEN) || id,
    description: cut(str(raw.description), DESC_LEN),
    blocks: cleanBlocks(raw.blocks, raw.base),
    defaults: cleanDefaults(raw.defaults),
    options: cleanOptions(raw.options),
  };
}

/** The profile a chat runs with: its own one when it still exists on the same level, else the level's. */
export function profileFor(fsx, settings) {
  if (settings.level === "off") return null;
  const own = settings.profile ? loadProfile(fsx, settings.profile) : null;
  return own && own.base === settings.level ? own : loadProfile(fsx, settings.level);
}

const blockText = (profile, key) => (profile && profile.blocks[key]) || defaultBlocks(profile ? profile.base : "chronicler")[key] || "";

/** The system prompt of a run: a level name (built-in texts) or a profile (its blocks, the output locked). */
export function systemFor(levelOrProfile, settings, recordsOnly) {
  const profile = isObj(levelOrProfile) ? levelOrProfile : { base: levelOrProfile, blocks: {} };
  const keeper = blockText(profile, "keeper");
  const limits = limitsOf(settings);
  const sensorKeeps = !!settings && settings.carrySource !== "dm";
  const fin = (text) => withLimits(sensorKeeps ? withoutCarry(text) + "\n- Do not record what the characters wear or hold in their hands: the scene tracker keeps that." : text, limits);
  // a records-only run (a place change, or the records' own cadence) leaves the fronts and the event alone
  if (!LEVEL_RULES[profile.base] || recordsOnly) return fin([keeper, ...SPACE_RULES, ...CHRONICLER_OUTPUT].join("\n"));
  return fin([keeper, ...SPACE_RULES, ...CHRONICLER_OUTPUT, "", blockText(profile, "level"), blockText(profile, "shared"), ...LEVEL_OUTPUT].join("\n"));
}

function profileView(fsx, p, used, defaultId) {
  const dflt = defaultBlocks(p.base);
  return {
    id: p.id, builtIn: p.builtIn, base: p.base, name: p.name, description: p.description,
    // the profile a new chat starts with (the chronicler when none was chosen or the chosen one is gone)
    default: p.id === defaultId,
    defaults: p.defaults,
    options: p.options,
    blocks: Object.keys(dflt).map((key) => ({ key, text: p.blocks[key] || dflt[key], default: dflt[key], changed: !!p.blocks[key] })),
    output: outputBlock(p.base),
    changed: Object.keys(p.blocks).length > 0,
    chats: used[p.id] || 0,
  };
}

/** Every profile, built-in first, with how many chats use each. */
export function listProfiles(fsx) {
  const used = {};
  let states = [];
  try {
    states = fsx.list("world/state").filter((f) => f.endsWith(".json"));
  } catch {}
  for (const f of states) {
    const s = readJson(fsx, STATE_DIR + f, null);
    if (!isObj(s) || !isObj(s.settings)) continue;
    const set = cleanSettings(s.settings);
    if (set.level === "off") continue;
    const id = set.profile || set.level;
    used[id] = (used[id] || 0) + 1;
  }
  const own = [];
  let files = [];
  try {
    files = fsx.list("world/profiles").filter((f) => f.endsWith(".json"));
  } catch {}
  for (const f of files) {
    const id = f.slice(0, -5);
    if (!OWN_PROFILE_ID.test(id)) continue;
    const p = loadProfile(fsx, id);
    if (p) own.push(p);
  }
  own.sort((a, b) => a.name.localeCompare(b.name));
  const chosen = loadConfig(fsx).defaultProfile;
  const defaultId = chosen && (PROFILE_LEVELS.includes(chosen) || own.some((p) => p.id === chosen)) ? chosen : "chronicler";
  return [...PROFILE_LEVELS.map((id) => loadProfile(fsx, id)), ...own].map((p) => profileView(fsx, p, used, defaultId));
}

const spaceNote = (e) => (e.kind === "place" && e.inside ? " [" + (e.size === "spot" ? "spot of " : "in ") + e.inside + "]" : e.kind === "thing" ? (e.holder ? " [held by " + e.holder + "]" : e.place ? " [at " + e.place + "]" : "") : "");
const entityLine = (e) => e.id + " · " + e.kind + " · " + e.name + spaceNote(e) + (e.aliases.length ? " (" + e.aliases.join(", ") + ")" : "") + ": " + e.text;
// a record the DM does not need to read in full this run: one line, enough to find it by id (#424, step 2.5)
const entityBrief = (e) => e.id + " · " + e.kind + " · " + e.name;
/** May the DM write this new thing, by the chat's lever `things`. */
const thingAllowed = (set, raw) => !isObj(set) || set.things === undefined || set.things === "all" || (set.things === "reasons" && THINGS_REASONS.includes(str(raw.why)));
const BRIEF_NOTE = "Records listed by name only are known to you but not shown in full here; to change or retire one, use its id as usual.";
const carryLine = (who, c) => who + ": wearing " + (c.wearing.join(", ") || "-") + "; carried " + (c.carried.map((x) => x.what + (x.where ? " (" + x.where + ")" : "")).join(", ") || "-") + "; nearby " + (c.nearby.join(", ") || "-");
const cutMiddle = (s, max) => (s.length <= max ? s : s.slice(0, Math.floor((max - 3) / 2)) + " … " + s.slice(s.length - Math.floor((max - 3) / 2)));

const frontLine = (f) => f.id + " · " + f.name + " · clock " + f.clock + "/" + f.size + (f.goal ? ": " + f.goal : "");

/** The user message of a DM run. extra (levels above the chronicler): fronts, the pending event, the scene, the Dashboard's threads. */
export function dmInput({ cards, userName, entities, msgs, level, fronts, event, direction, threads, cap, catchingUp, options, deck, place, placeId, carry, sweep, tracked, since, full, removed, soon, learned }) {
  const active = entities.filter((e) => e.status === "active");
  const past = entities.filter((e) => e.status === "past");
  const lines = msgs
    .filter((m) => str(m.text))
    .map((m) => "[" + (m.role === "user" ? userName || "user" : str(m.name) || "narrator") + "] " + cutMiddle(String(m.text).trim(), cap || MSG_MAX));
  let story = lines.join("\n");
  if (story.length > NEW_TEXT_MAX) story = "…" + story.slice(-NEW_TEXT_MAX);
  // what earlier runs already read after an event was sent: it may have happened there (see eventSince)
  const earlier = arr(since).filter((m) => str(m.text));
  const earlierCap = earlier.length ? Math.max(SINCE_MSG_MIN, fairCap(earlier.map(textLen), SINCE_TEXT_MAX - LINE_EXTRA * earlier.length)) : 0;
  return [
    "Characters with their own cards (do not record): " + (cards.length ? cards.join(", ") : "none") + ".",
    "The user's character (do not record): " + (userName || "the user") + ".",
    // `full` (a Set of ids, see fullRecordIds): only these are read in full, the others are one line each; no Set = all in full
    "World record so far" + (active.length ? "\n" + active.map((e) => (full instanceof Set && !full.has(e.id) ? entityBrief(e) : entityLine(e))).join("\n") : ": empty."),
    ...(full instanceof Set && active.some((e) => !full.has(e.id)) ? [BRIEF_NOTE] : []),
    ...(arr(removed).length ? ["Do not record (the player removed): " + arr(removed).join(", ") + "."] : []),
    ...(str(learned) ? [str(learned)] : []),
    ...(arr(soon).length ? [returnsInput(soon)] : []),
    ...(past.length ? ["Retired (finished; do not change): " + past.map((e) => e.id + " " + e.name).join(", ") + "."] : []),
    ...(str(place) ? ["Where the scene is now (from the scene tracker): " + (REF_ID.test(str(placeId)) ? str(placeId) + " " : "") + str(place) + "."] : []),
    ...(carry === undefined ? [] : ["What the characters wear and carry now" + (isObj(carry) && Object.keys(carry).length ? "\n" + Object.entries(carry).map(([w, c]) => carryLine(w === "user" && userName ? userName : w, c)).join("\n") : ": nothing recorded yet.")]),
    ...(sweep && (arr(sweep.places).length || arr(sweep.things).length) ? [sweepInput(sweep)] : []),
    ...(arr(tracked).length ? [trackedInput(tracked)] : []),
    ...(level && LEVEL_RULES[level] ? levelInput({ fronts, event, direction, threads, options, deck, earlier: earlier.length > 0 }) : []),
    ...(catchingUp ? ["This is an older part of the story, read to catch up; newer parts come in the next runs. Record the world, move the fronts if time passed, but send no event: event null."] : []),
    ...(earlier.length && level && LEVEL_RULES[level]
      ? ["Already read in earlier runs, after the event was sent (the event may have happened here)\n" + earlier.map((m) => "[" + (m.role === "user" ? userName || "user" : str(m.name) || "narrator") + "] " + cutMiddle(String(m.text).trim(), earlierCap)).join("\n")]
      : []),
    "New part of the story\n" + story,
  ].join("\n\n");
}

/**
 * The records the DM reads in full on a run (the rest go in as one line each, see dmInput): named in the new part of the story
 * (a name or an alias), pinned, the scene's place with its parent and spots, the things placed there or held by people in the scene,
 * the people in the scene, and `soon` (bench people who are due soon, see benchSoon). A swipe or a retry makes the same set.
 */
export function fullRecordIds(state, { story, scene, reg, soon }) {
  const text = str(story);
  const present = scene ? arr(scene.present).map(str).filter(Boolean) : [];
  const place = scene ? placeRecordOf(state, scene, reg) : null;
  const parent = place && place.inside ? state.entities.find((e) => e.kind === "place" && e.status === "active" && refersTo(e, place.inside)) : null;
  const here = [place, parent].filter(Boolean);
  const full = new Set(arr(soon));
  for (const e of state.entities) {
    if (e.status !== "active" || full.has(e.id)) continue;
    const re = namesPattern(namesOf(e));
    if (e.pinned === true || (re && re.test(text))) full.add(e.id);
    else if (here.some((p) => p.id === e.id)) full.add(e.id);
    else if (e.kind === "place" && e.inside && place && refersTo(place, e.inside)) full.add(e.id);
    else if (e.kind === "thing" && ((e.place && here.some((p) => refersTo(p, e.place))) || (e.holder && present.some((n) => samePlace(n, e.holder))))) full.add(e.id);
    else if (e.kind === "person" && present.some((n) => namesOf(e).some((x) => samePlace(x, n)))) full.add(e.id);
  }
  return full;
}

/** How far a front's clock is, as the wording its news should take. */
export function clockStage(f) {
  const r = f.size ? f.clock / f.size : 0;
  return r < 1 / 3 ? "early: only a subtle rumour or a small sign" : r < 2 / 3 ? "growing: a visible development people talk about" : "late: unmistakable, it touches the characters' lives";
}

function levelInput({ fronts, event, direction, threads, options, deck, earlier }) {
  const o = options || DEFAULT_OPTIONS;
  const active = arr(fronts).filter((f) => f.status === "active");
  const out = ["Fronts" + (active.length ? "\n" + active.map(frontLine).join("\n") : ": none yet.")];
  if (o.clocks === "code") out.push("The clocks tick by themselves as story time passes: never send tick ops. Add a front when the story sets one up, retire one that is finished.");
  if (o.eventByClock && active.length) {
    out.push("How news of each front reads now, by its clock:\n" + active.map((f) => f.id + " " + f.name + ": " + clockStage(f)).join("\n"));
    out.push("Off-screen effects arrive as news, threats or signs, never as harm already done to the user's character.");
  }
  const stirred = o.clocks === "code" ? active.filter((f) => f.stirred) : [];
  if (stirred.length) out.push("Stirred since the last look (their plans moved; let news of them reach the story in the next event, worded by the clock):\n" + stirred.map((f) => f.id + " " + f.name + ": " + clockStage(f)).join("\n"));
  if (Array.isArray(deck)) {
    out.push(deck.length
      ? 'Events deck: an event comes only from this deck. When one is due, pick the card that fits the scene best and send event {"deck":"<its id>"}; never invent one.\n' + deck.map((c) => c.id + " · " + c.text).join("\n")
      : "The events deck is used up: send no event (event null).");
  }
  if (event && event.sent > 0) out.push("Event sent in an earlier reply: " + event.text + "\nDid the story show it? " + (earlier ? "Look at the part already read after it was sent, and at the new part. " : "") + "Answer in delivered.");
  else if (event) out.push("Event still waiting for a reply (keep it, or replace it with a better one): " + event.text);
  if (direction) out.push("Scene direction now (from the scene tracker): " + direction + ".");
  if (arr(threads).length) out.push("Open threads (what the characters care about now): " + threads.join("; ") + ".");
  return out;
}

/** The Dashboard's open threads on the newest snapshot, for the levels that aim at them. */
function dashThreads(fsx, chatId, scene) {
  if (!scene) return [];
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const sn = isObj(dash) && isObj(dash.snapshots) ? dash.snapshots[scene.key] : null;
  return arr(sn && sn.threads).filter((t) => isObj(t) && t.status !== "resolved" && str(t.text)).map((t) => cut(str(t.text), 160)).slice(0, 6);
}

/** The preset a chat replies with, as the chat plugin picks it (for the thinking settings). */
function chatPreset(fsx, meta) {
  let id = meta && str(meta.presetId);
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
  if (/[\\/]|^\.\.?$/.test(id || "default")) return null;
  const preset = readJson(fsx, "presets/" + (id || "default") + ".json", null);
  return isObj(preset) ? preset : null;
}

/** Thinking settings of the chat's preset; with a budget the reply limit grows by it (see the dashboard's callParams). */
function callParams(fsx, cfg, meta, maxTokens) {
  const preset = chatPreset(fsx, meta);
  const reasoning = preset && typeof preset.reasoning === "string" && preset.reasoning !== "off" ? preset.reasoning : "";
  const budget = reasoning && typeof preset.thinkingBudget === "number" && preset.thinkingBudget > 0 ? Math.round(preset.thinkingBudget) : 0;
  const tags = preset && isObj(preset.reasoningTags) && str(preset.reasoningTags.open) && str(preset.reasoningTags.close) ? { open: preset.reasoningTags.open, close: preset.reasoningTags.close } : null;
  return {
    ...(reasoning ? { reasoning } : {}),
    ...(budget ? { thinkingBudget: budget } : {}),
    ...(tags ? { reasoningTags: tags } : {}),
    presetParams: { temperature: 0.3, max_tokens: maxTokens || cfg.maxTokens + budget },
  };
}

/** The first model set of the list, with where it came from. */
function firstModel(list) {
  const hit = list.find(([, m]) => MODEL_REF.test(str(m)));
  return hit ? { model: str(hit[1]), from: hit[0] } : { model: "", from: "default" };
}

/**
 * Who plays the DM after replies (user, 2026-10-19): the World's own play model, else the
 * Dashboard sensor's (fast and cheap already), else Litopys's, else the chat's, else the app's default.
 */
export function playModel(fsx, cfg, meta) {
  const dash = readJson(fsx, "dashboard/config.json", null);
  const lit = readJson(fsx, "litopys/config.json", null);
  const settings = readJson(fsx, "settings.json", null);
  return firstModel([
    ["world", cfg.model],
    ["sensor", isObj(dash) ? dash.sensorModel : ""],
    ["litopys", isObj(lit) ? lit.model : ""],
    ["chat", meta && meta.model],
    ["default", isObj(settings) ? settings.model : ""],
  ]);
}

/** Who builds worlds (start, remix): the World's build model, else the chat's, else the app's default. */
export function buildModel(fsx, cfg, meta) {
  const settings = readJson(fsx, "settings.json", null);
  return firstModel([["world", cfg.buildModel], ["chat", meta && meta.model], ["default", isObj(settings) ? settings.model : ""]]);
}

export function dmModel(fsx, cfg, meta) {
  return playModel(fsx, cfg, meta).model;
}

// ---------- reading the DM's reply ----------
/** The first balanced {...} of the text from `from`; null when there is none. */
function firstObject(s, from = 0) {
  const start = s.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

const REPLY_KEYS = ["add", "update", "retire", "carry", "summary", "fronts", "event", "delivered", "direction", "returns"];

const tryObject = (body) => {
  try {
    const v = JSON.parse(body.replace(/,\s*([}\]])/g, "$1"));
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
};

/**
 * The DM's JSON: the LAST balanced object that parses and has a key of the reply (a thinking model may
 * write braces or a draft before the answer); else the first one that parses. Code fences are ignored.
 */
export function parseReply(text) {
  const s = String(text || "").replace(/^\s*<(think|thinking|reasoning)>[\s\S]*?<\/\1>/i, "").replace(/```(?:json)?/gi, " ").trim();
  let first = null;
  let best = null;
  for (let from = 0, body = firstObject(s, 0); body; body = firstObject(s, from)) {
    const at = s.indexOf(body, from);
    from = at + body.length;
    const v = tryObject(body);
    if (!v) {
      // not JSON: look inside it on the next pass
      from = at + 1;
      continue;
    }
    if (!first) first = v;
    if (Object.keys(v).some((k) => REPLY_KEYS.includes(k))) best = v;
  }
  return best || first;
}

const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
const namesOf = (e) => [e.name, ...e.aliases];

/** The record a change points at: its id, else a name or alias. */
function findEntity(entities, change) {
  const id = str(change.id);
  const byId = id ? entities.find((e) => e.id === id) : null;
  if (byId) return byId;
  const name = str(change.name);
  return name ? entities.find((e) => namesOf(e).some((n) => sameName(n, name))) || null : null;
}

/** At most two sentences, within the retired size. */
export function shortText(text, max) {
  const s = str(text);
  const m = /^(.+?[.!?…])\s+(.+?[.!?…])(\s|$)/s.exec(s);
  return cut(m ? m[1] + " " + m[2] : s, max || PAST_TEXT_MAX);
}

/** A retired record's size follows the chat's text limit: 40% of it, at least the old default. */
const pastMaxOf = (settings) => clamp(Math.round((settings ? settings.textMax : DEFAULT_SETTINGS.textMax) * 0.4), PAST_TEXT_MAX, PAST_HARD);

/**
 * Apply the DM's report to the state (in place). Names of cards and of the user are never
 * recorded; a name already on record becomes an update; retired records stay retired.
 * Returns how many records changed.
 */
export function applyReport(state, out, { cards, userName, now, touched, rc }) {
  const at = now || Date.now();
  const skip = [...cards, ...(userName ? [userName] : [])];
  const isSkipped = (name) => skip.some((n) => sameName(n, name));
  // with the registry (rc): a person it knows from a card, a soul or the persona is never an NPC, whatever the spelling;
  // an NPC person is one record whatever the spelling; a holder is written as the app names that person
  const isOwn = (name) => {
    const e = rc ? regPersonOf(rc, name) : null;
    return !!e && (e.id === "user" || REG_OWN_SRC.includes(e.src));
  };
  const canonSpace = (raw, self) => {
    if (!rc) return raw;
    const out = { ...raw };
    if (str(raw.holder)) out.holder = cut(regCanon(rc, str(raw.holder)), NAME_MAX);
    // a parent place or a place written in another spelling is the record the registry says it is
    if (str(raw.inside)) out.inside = cut(canonPlaceName(state, rc, raw.inside, self), NAME_MAX);
    if (str(raw.place)) out.place = cut(canonPlaceName(state, rc, raw.place), NAME_MAX);
    return out;
  };
  let changes = 0;
  const removed = removedNames(state, SIGNALS_MAX);
  // a draft (a world built without a chat) has no settings of its own: the defaults
  const set = isObj(state.settings) ? state.settings : DEFAULT_SETTINGS;
  const textMax = set.textMax;
  const pastMax = pastMaxOf(set);
  const room = () => changes < set.changesMax;
  for (const raw of arr(out.add)) {
    if (!room() || !isObj(raw)) continue;
    const name = cut(str(raw.name), NAME_MAX);
    if (!name || isSkipped(name)) continue;
    // facts are not records any more, and an unknown kind is not a note (#424, step 3)
    if (!WRITE_KINDS.includes(raw.kind)) continue;
    const kind = raw.kind;
    // the player deleted a record of this name: it is not written again (the DM is told so in its input)
    if (removed.some((x) => sameName(x, name))) continue;
    if (kind === "person" && isOwn(name)) continue;
    const text = cut(str(raw.text), textMax);
    const ref = kind === "thing" || kind === "place" ? refEntity(rc, raw.ref, kind) : null;
    let known = ref ? recordOfRef(state, rc, ref, kind) : null;
    if (!known) known = findEntity(state.entities, { name });
    if (!known && kind === "person" && rc) known = npcRecordOf(state, rc, name);
    if (!known && (kind === "thing" || kind === "place") && rc) known = recordOfKind(state, rc, name, kind);
    if (known && ref && known.status === "active") linkToRef(state, rc, known, ref);
    if (known) {
      // the DM names a thing that was put to rest: it is active again (the tidy-up log says so)
      if (known.status === "dormant") {
        known.status = "active";
        known.at = at;
        if (touched) touched.add(known.id);
        tidyNote(state, { at, n: 0, id: known.id, name: known.name, act: "wake", count: 0, via: "dm", ...(known.why ? { why: known.why } : {}) });
        changes++;
      }
      if (known.status === "past" || !text || text === known.text) continue;
      known.text = text;
      known.aliases = cleanAliases([...known.aliases, ...arr(raw.aliases), ...(sameName(known.name, name) ? [] : [name])], known.name);
      applySpace(known, canonSpace(raw, known));
      known.at = at;
      if (touched) touched.add(known.id);
      changes++;
      continue;
    }
    if (!text || state.entities.length >= ENTITIES_MAX) continue;
    // the player's answers can narrow the things the DM may write (#425): none, or only a clue, hidden or promised one
    if (kind === "thing" && !thingAllowed(set, raw)) continue;
    const fresh = { id: "n" + state.nextId++, kind, name, aliases: cleanAliases(raw.aliases, name), text, status: "active", uid: 0, at, ...spaceFields(kind, { ...canonSpace(raw), background: undefined }) };
    state.entities.push(fresh);
    if (ref) linkToRef(state, rc, fresh, ref);
    if (kind === "thing" || kind === "place") linkRecord(state, rc, fresh);
    if (kind === "person" && rc) {
      // the NPC joins the registry (or the person the story already made there), and the record keeps its id
      const seen = regPersonOf(rc, name);
      const pe = seen || regAdd(rc.reg, { kind: "person", name, src: "world" });
      if (pe) {
        if (seen) regAlias(rc.reg, pe.id, name, "world");
        else rc.dirty = true;
        (state.regIds ||= {})[fresh.id] = pe.id;
      }
    }
    if (touched) touched.add(fresh.id);
    changes++;
  }
  for (const raw of arr(out.update)) {
    if (!room() || !isObj(raw)) continue;
    const e = findEntity(state.entities, raw) || (rc && str(raw.name) ? npcRecordOf(state, rc, str(raw.name)) || recordOfKind(state, rc, str(raw.name), "thing") || recordOfKind(state, rc, str(raw.name), "place") : null);
    if (!e || e.status === "past") continue;
    const ref = e.kind === "thing" || e.kind === "place" ? refEntity(rc, raw.ref, e.kind) : null;
    if (ref) linkToRef(state, rc, e, ref);
    const text = cut(str(raw.text), textMax);
    const aliases = raw.aliases !== undefined ? cleanAliases([...e.aliases, ...arr(raw.aliases)], e.name) : e.aliases;
    const moved = applySpace(e, { ...canonSpace(raw, e), background: undefined });
    if ((!text || text === e.text) && aliases.length === e.aliases.length && !moved) continue;
    if (text) e.text = text;
    e.aliases = aliases;
    e.at = at;
    if (touched) touched.add(e.id);
    changes++;
  }
  // the records the Dashboard or an older run left unlinked join the registry now; a parent named before it was recorded is settled
  settleLinks(state, rc);
  for (const raw of arr(out.retire)) {
    if (!room() || !isObj(raw)) continue;
    const e = findEntity(state.entities, raw);
    if (!e || e.status === "past") continue;
    e.status = "past";
    e.text = shortText(str(raw.text) || e.text, pastMax);
    e.at = at;
    if (touched) touched.add(e.id);
    changes++;
  }
  return changes;
}

/**
 * What the DM says each character wears and carries: only the user's character and the cards' characters
 * (others are records). A list that is sent replaces the old one; one that is left out stays. Returns the
 * names whose carry changed.
 */
export function applyCarry(state, list, { cards, userName, now, rc }) {
  const known = [...cards, ...(userName ? [userName] : [])];
  const changed = [];
  for (const raw of arr(list)) {
    if (!isObj(raw) || changed.length >= 6) continue;
    let who = known.find((n) => sameName(n, str(raw.who)));
    // with the registry: any spelling of the user's character or of a card character, kept under the name the app uses
    const legacy = who;
    const e = rc ? regPersonOf(rc, str(raw.who)) : null;
    if (e && (e.id === "user" || REG_OWN_SRC.includes(e.src))) who = regDisplay(rc, e);
    if (!who) continue;
    const old = state.carry[who] || (legacy && state.carry[legacy]) || { wearing: [], carried: [], nearby: [], at: 0 };
    if (legacy && legacy !== who && state.carry[legacy]) delete state.carry[legacy];
    const next = {
      wearing: raw.wearing !== undefined ? cleanItems(raw.wearing, WEARING_MAX) : old.wearing,
      carried: raw.carried !== undefined ? cleanCarried(raw.carried) : old.carried,
      nearby: raw.nearby !== undefined ? cleanItems(raw.nearby, NEARBY_MAX) : old.nearby,
      at: now || Date.now(),
    };
    if (JSON.stringify([next.wearing, next.carried, next.nearby]) === JSON.stringify([old.wearing, old.carried, old.nearby])) continue;
    if (next.wearing.length || next.carried.length || next.nearby.length) state.carry[who] = next;
    else delete state.carry[who];
    changed.push(who);
  }
  return changed;
}

/** How one d6 moves a clock (#155): 1-2 nothing, 3-4 one segment, 5-6 one segment and the front is stirred (news of it may reach the story). */
export const clockStep = (d) => (d <= 2 ? { by: 0, stirred: false } : d <= 4 ? { by: 1, stirred: false } : { by: 1, stirred: true });

/**
 * Code ticks the clocks (profile option "code"): every `every` replies read, each active front rolls a d6 (clockStep).
 * The count carries over between runs in state.clockReplies. With a `seed` the rolls are repeatable (the same run
 * rolls the same, a run on other messages rolls anew); without one every front moves by 1 each tick, as before.
 * `stirred` marks a front for the next DM input; the caller lets it go once a full run has shown it. Returns how many segments moved.
 */
export function tickClocks(state, replies, every, now, seed) {
  let count = (Number.isInteger(state.clockReplies) ? state.clockReplies : 0) + replies;
  let ticks = 0;
  let round = 0;
  while (count >= every) {
    count -= every;
    round++;
    for (const f of state.fronts) {
      if (f.status !== "active" || f.clock >= f.size) continue;
      const step = seed ? clockStep(Math.floor(seededRandom(seed + "|" + round + "|" + f.id)() * 6) + 1) : { by: 1, stirred: false };
      if (!step.by && !step.stirred) continue;
      f.clock += step.by;
      if (step.stirred) f.stirred = true;
      f.at = now || Date.now();
      ticks += step.by;
    }
  }
  state.clockReplies = count;
  return ticks;
}

/**
 * The levels above the chronicler: fronts, the event and the direction (in place). The pending
 * event: delivered drops it; missed once is sent again; missed twice is dropped. A new event
 * waits while the old one is pending. No event in an explicit scene, none in combat below
 * antagonist. Returns how many fronts changed.
 */
export function applyLevel(state, out, { level, direction, now, catchingUp, codeClocks, useDeck, place, placeId }) {
  const at = now || Date.now();
  let changes = 0;
  const said = DIRECTIONS.includes(str(out.direction).toLowerCase()) ? str(out.direction).toLowerCase() : null;
  if (said) state.direction = said;
  const dir = direction || said || state.direction || null;
  for (const raw of arr(out.fronts)) {
    if (!isObj(raw) || changes >= (isObj(state.settings) ? state.settings : DEFAULT_SETTINGS).changesMax) continue;
    const op = str(raw.op);
    if (op === "add") {
      const name = cut(str(raw.name), NAME_MAX);
      if (!name || state.fronts.filter((f) => f.status === "active").length >= FRONTS_MAX) continue;
      if (state.fronts.some((f) => f.status === "active" && sameName(f.name, name))) continue;
      const size = CLOCK_SIZES.includes(Number(raw.size)) ? Number(raw.size) : 6;
      state.fronts.push({ id: "f" + state.nextFront++, name, goal: cut(str(raw.goal), TEXT_MAX), clock: 0, size, status: "active", at });
      changes++;
      continue;
    }
    const f = state.fronts.find((x) => x.status === "active" && (x.id === str(raw.id) || (str(raw.name) && sameName(x.name, str(raw.name)))));
    if (!f) continue;
    if (op === "tick") {
      if (codeClocks) continue;
      const by = clamp(Math.round(Number(raw.by) || 1), -2, 2);
      f.clock = clamp(f.clock + by, 0, f.size);
      f.at = at;
      changes++;
    } else if (op === "retire") {
      f.status = "past";
      f.at = at;
      changes++;
    }
  }
  // the pending event first: one shot, one retry
  if (state.event && state.event.sent > 0) {
    if (out.delivered === true) state.event = null;
    else if (out.delivered === false && !state.event.retried) state.event = { ...state.event, sent: 0, retried: true };
    else if (out.delivered === false) state.event = null;
  }
  const quiet = dir === "explicit" || (dir === "combat" && level !== "antagonist" && level !== "chaos");
  // with the deck on, only a card of the deck becomes the event, and it is used up
  const card = useDeck && isObj(out.event) ? arr(state.deck).find((c) => c.id === str(out.event.deck)) : null;
  const text = useDeck ? (card ? card.text : "") : isObj(out.event) ? cut(str(out.event.text), EVENT_MAX) : "";
  if (card && !quiet && !catchingUp && (!state.event || state.event.sent === 0)) state.deck = state.deck.filter((c) => c !== card);
  if (text && !quiet && !catchingUp && (!state.event || state.event.sent === 0)) {
    state.event = { text, hard: HARD_LEVELS.includes(level), sent: 0, retried: false, at, ...(placeKey(place) ? { place: placeKey(place) } : {}), ...(REF_ID.test(str(placeId)) ? { placeId: str(placeId) } : {}) };
  }
  return changes;
}

// ---------- the insert: the event rides one reply ----------
// the engine plugin's ops: a new reply (send, next) or a new swipe of one; never continue or impersonate
const OPS_WITH_EVENT = ["send", "next", "swipe"];

// ---------- the world here (#176): no model call, code reads the records and the Dashboard's place ----------
const samePlace = (a, b) => !!placeKey(a) && placeKey(a) === placeKey(b);
const refersTo = (rec, name) => !!rec && namesOf(rec).some((n) => samePlace(n, name));

/**
 * The story moved to another place since the last run: by registry ids when the scene and the last run both have one,
 * else by the words (case, punctuation and spaces do not count). False when the scene has no place.
 */
export function placeMoved(state, scene) {
  if (!scene || !placeKey(scene.place)) return false;
  if (scene.placeId && state.lastPlaceId) return scene.placeId !== state.lastPlaceId;
  return state.lastPlace !== placeKey(scene.place);
}

/**
 * The active place record of the scene: the one linked to the scene's place id (clock.placeId), else the one the words
 * point at (findPlace), skipping records that are linked to another place. reg = the chat's registry (merged ids), if loaded.
 */
export function placeRecordOf(state, scene, reg) {
  if (!scene) return null;
  const links = isObj(state.regIds) ? state.regIds : {};
  const sid = scene.placeId ? regCanonId(reg, scene.placeId) : "";
  if (sid) {
    const linked = state.entities.filter((e) => e.kind === "place" && e.status === "active" && links[e.id] && regCanonId(reg, links[e.id]) === sid);
    if (linked.length) return linked.find((e) => e.size === "spot") || linked[0];
  }
  return findPlace(state.entities, scene.place, sid ? (e) => !links[e.id] || regCanonId(reg, links[e.id]) === sid : undefined);
}

/** The active place record the sensor's free-text place points at: a name or alias, else the longest name (4+ letters) inside the text. */
export function findPlace(entities, text, accept) {
  const k = placeKey(text);
  if (!k) return null;
  const places = entities.filter((e) => e.kind === "place" && e.status === "active" && (!accept || accept(e)));
  const exact = places.find((e) => namesOf(e).some((n) => placeKey(n) === k));
  if (exact) return exact;
  // several names inside the text ("the apartment, the living room"): the more specific one, a spot, else the longest name
  let best = null;
  let bestScore = 0;
  for (const e of places) for (const n of namesOf(e)) {
    const pk = placeKey(n);
    const score = (e.size === "spot" ? 1000 : 0) + pk.length;
    if (pk.length >= 4 && score > bestScore && (" " + k + " ").includes(" " + pk + " ")) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/** "grey coat, black jeans and white sneakers" -> three items; at most WEARING_MAX, 60 characters each. */
export function splitItems(text) {
  return cleanItems(str(text).split(/\s*[,;]\s*|\s+(?:and|і|та|и)\s+/i).map((x) => x.replace(/[.]+$/, "")), WEARING_MAX);
}

/** What the sensor says each character wears and holds, in the shape of state.carry (carried and nearby stay empty). */
export function sensorCarry(scene) {
  const out = {};
  for (const [who, c] of Object.entries(scene && isObj(scene.chars) ? scene.chars : {})) {
    // the sensor's lines first; a registered item list stands in for a line that is missing
    const items = arr(c.items);
    const wearing = str(c.outfit) ? splitItems(c.outfit) : cleanItems(items.filter((x) => x.kind === "wear").map((x) => x.text), WEARING_MAX);
    const hands = str(c.holding) ? cut(str(c.holding), ITEM_MAX * 2) : cut(items.filter((x) => x.kind === "hold").map((x) => x.text).join(", "), ITEM_MAX * 2);
    const ids = items.map((x) => x.id).filter(Boolean);
    if (wearing.length || hands || ids.length) out[who] = { wearing, carried: [], nearby: [], hands, ...(ids.length ? { ids } : {}), at: 0 };
  }
  return out;
}

/**
 * What is here: the record of the scene's place and its parent, the things placed here (in the place, its
 * parent or one of its spots), the things held by people in the scene, the things asleep elsewhere, and what
 * the people in the scene wear and carry. extra = names always counted in (the user's character).
 * reg = the chat's registry (optional): records and the Dashboard's places and things are matched by registry id first,
 * by words when an id is missing on either side. `link` maps a thing record to its registry id.
 */
export function hereOf(state, scene, extra, reg) {
  const entities = state.entities;
  const links = isObj(state.regIds) ? state.regIds : {};
  const canon = (id) => regCanonId(reg, id);
  const linkOf = (e) => (links[e.id] ? canon(links[e.id]) : "");
  const places = entities.filter((e) => e.kind === "place" && e.status === "active");
  const place = scene ? placeRecordOf(state, scene, reg) : null;
  // the active place record a name means: by the registry when it knows the name and a record is linked to it, else by the words
  const placeNamed = (name) => {
    const r = reg && str(name) ? resolveName(reg, name, "place") : null;
    const id = r && r.id ? canon(r.id) : "";
    const byId = id ? places.find((e) => linkOf(e) === id) : null;
    return byId || places.find((e) => refersTo(e, name)) || null;
  };
  const parent = place && place.inside ? placeNamed(place.inside) : null;
  const related = new Set();
  if (place) {
    related.add(place.id);
    if (parent) related.add(parent.id);
    for (const e of places) if (e.inside && placeNamed(e.inside) === place) related.add(e.id);
  }
  const placeOf = (t) => (t.place ? placeNamed(t.place) : null);
  // `user` (the registry's name for the user's character) is the first name of extra
  const asName = (n) => (n === "user" && str(arr(extra)[0]) ? str(arr(extra)[0]) : n);
  const present = [...(scene ? arr(scene.present) : []), ...arr(extra)].filter((n, i, a) => a.findIndex((m) => samePlace(m, n)) === i);
  const inScene = (name) => !scene || !present.length || present.some((n) => samePlace(n, name));
  // where the Dashboard has each registered thing: in someone's items, or among the objects lying here
  const dash = new Map();
  for (const [who, c] of Object.entries(scene && isObj(scene.chars) ? scene.chars : {})) for (const it of arr(c.items)) if (it.id) dash.set(canon(it.id), { holder: asName(who) });
  for (const o of arr(scene && scene.objects)) if (o.id && !dash.has(canon(o.id))) dash.set(canon(o.id), { here: true });
  // objects kept by place id for this scene's place (layout.byPlace) lie here as well
  if (scene && scene.placeId && isObj(scene.byPlace)) for (const k of Object.keys(scene.byPlace)) if (canon(k) === canon(scene.placeId)) for (const o of arr(scene.byPlace[k])) if (o.id && !dash.has(canon(o.id))) dash.set(canon(o.id), { here: true });
  const things = [];
  const held = {};
  const asleep = [];
  const link = {};
  const shown = new Set();
  for (const t of entities) {
    if (t.kind !== "thing" || t.status !== "active") continue;
    const id = linkOf(t);
    // one registry thing is one entry, even when two records were made of it
    if (id && shown.has(id)) continue;
    if (id) shown.add(id);
    if (id) link[t.id] = id;
    const at = id ? dash.get(id) : null;
    if (at && at.holder) {
      // the Dashboard says who has it, whether or not the DM recorded a holder
      if (inScene(at.holder)) (held[at.holder] ||= []).push(t);
      else asleep.push(t);
    } else if (at && at.here) {
      things.push(t);
    } else if (t.holder) {
      if (inScene(asName(t.holder))) (held[asName(t.holder)] ||= []).push(t);
      else asleep.push(t);
    } else if (t.place) {
      const p = placeOf(t);
      if (p && related.has(p.id)) things.push(t);
      else asleep.push(t);
    }
  }
  const carry = {};
  const source = state.settings.carrySource === "dm" ? state.carry || {} : sensorCarry(scene);
  // sensor source: what the sensor saw lying in the scene is every present character's nearby list (#185); a thing that has a record (by id or by name)
  // already shows in its own group
  const lying = state.settings.carrySource === "dm" ? [] : arr(scene && scene.objects).filter((o) => !(o.id && shown.has(canon(o.id))) && !entities.some((e) => e.kind === "thing" && e.status === "active" && refersTo(e, o.item))).map((o) => (o.where ? o.item + " (" + o.where + ")" : o.item));
  for (const [who, c] of Object.entries(source)) if (inScene(asName(who))) carry[asName(who)] = { ...(c.ids ? { ...c, ids: c.ids.map(canon) } : c), ...(lying.length ? { nearby: lying } : {}) };
  const spots = place ? places.filter((e) => e.size === "spot" && e.inside && placeNamed(e.inside) === place) : [];
  return { scenePlace: scene ? scene.place : "", place, parent, spots, things, held, asleep, carry, link, present, carrySource: state.settings.carrySource === "dm" ? "dm" : "sensor", sensor: sensorCarry(scene) };
}

const firstSentence = (s) => {
  const m = /^(.+?[.!?…])(\s|$)/s.exec(str(s));
  return m ? m[1] : str(s);
};
const HERE_MAX = 900;

/** The note that rides a reply request ("World · here"), or null when there is nothing to say. */
export function hereInsert(h) {
  const out = [];
  if (h.place) {
    const text = h.place.size === "spot" && h.parent ? shorten(str(h.place.text), 120) + " " + shorten(firstSentence(h.parent.text), 120) : shorten(str(h.place.text), 200);
    out.push("Place: " + h.place.name + (h.parent ? ", in " + h.parent.name : "") + (text ? ". " + text.trim() : "") + (/[.!?…]$/.test(text) || !text ? "" : "."));
  }
  if (h.things.length) out.push("Things here: " + h.things.slice(0, 6).map((t) => t.name + (t.place && h.place && !samePlace(t.place, h.place.name) ? " (" + t.place + ")" : "")).join(", ") + ".");
  const who = new Set([...Object.keys(h.carry), ...Object.keys(h.held)]);
  for (const name of who) {
    const c = h.carry[name];
    const bits = [];
    if (c && c.wearing.length) bits.push("wears " + c.wearing.slice(0, 8).join(", "));
    if (c && c.hands) bits.push("holds " + c.hands);
    const has = [...(c ? c.carried.map((x) => x.what + (x.where ? " (" + x.where + ")" : "")) : []), ...arr(h.held[name]).filter((t) => !(c && c.ids && h.link && h.link[t.id] && c.ids.includes(h.link[t.id]))).map((t) => t.name)].filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
    if (has.length) bits.push("has " + has.slice(0, 8).join(", "));
    // the sensor source's nearby list is for the Dashboard only: the reply prompt already has the objects in the Dashboard's own block
    if (c && c.nearby.length && h.carrySource !== "sensor") bits.push("near them " + c.nearby.slice(0, 4).join(", "));
    if (bits.length) out.push(name + " " + bits.join("; ") + ".");
  }
  if (!out.length) return null;
  const text = "[Where and what, now: " + out.join(" ") + " Keep clothes and things consistent with this; never mention where this note came from.]";
  return text.length > HERE_MAX ? text.slice(0, HERE_MAX - 2) + "…]" : text;
}

/** The text the writing model gets for an event, or null. template = the profile's event block (with {event}). */
export function eventInsert(event, template) {
  if (!event || !str(event.text)) return null;
  const t = typeof template === "string" && template.includes("{event}") ? template : event.hard ? HARD_EVENT : SOFT_EVENT;
  return t.split("{event}").join(event.text);
}

// ---------- cast (#424): people who have been away come back ----------
// A person is "seen" in a message when the Dashboard put them in the scene (matched by registry id first) or the message
// names them (by a name or alias; a name that belongs to another person in the registry does not count: the id decides).
// Silence = the replies since. Past a threshold (Frequency, with a per-person jitter) the person is due. 2d6 plus the length
// of the silence and the person's weight sets how big the return is; the writing model is told firmly that they come in
// and only the form is left to it. Code checks that the person showed up in the next reply; once missed, the note is stricter.
const CAST_SILENCE = { rare: 60, normal: 30, often: 15 };
const CAST_GAP = { rare: 20, normal: 10, often: 5 };
// no return in the first replies of a chat; the reads look back at most this many messages
const CAST_FIRST = 6;
const CAST_SCAN = 400;
// at most this many bench stubs are always in the prompt (the heaviest); the rest come up by their keys
export const BENCH_CONSTANT_MAX = 8;
const CAST_BAND_TEXT = {
  small: "something small: a message, a mention, a short call",
  medium: "something that asks for an answer: a call with a request, an invitation, a visit",
  big: "something that matters: they arrive with news, a demand or a crisis the scene must answer",
};
const LIFE_BAND = { minor: "small", notable: "medium", major: "big" };

/** How much a person weighs: the number set by the DM or the player, else what the relation says (family 2, ally, rival or enemy 1, else 0). */
export function weightOf(rec) {
  if (!rec) return 0;
  if (WEIGHTS.includes(rec.weight)) return rec.weight;
  return rec.relation === "family" ? 2 : rec.relation === "ally" || rec.relation === "rival" || rec.relation === "enemy" ? 1 : 0;
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * One pattern for a person's names: whole words, case-insensitive. A name of 4+ letters may carry a short ending, and one of 5+
 * may also change its last letter (a case ending: Oksana, Oksanu); shorter names match exactly. Other forms come from the
 * registry's aliases and the Dashboard's scene.
 */
function namesPattern(names) {
  const parts = names.map((n) => {
    const letters = Array.from(n);
    if (letters.length < 4) return escRe(n);
    return letters.length >= 5 ? escRe(n) + "\\p{L}{0,2}|" + escRe(letters.slice(0, -1).join("")) + "\\p{L}{1,2}" : escRe(n) + "\\p{L}{0,2}";
  });
  return parts.length ? new RegExp("(?<![\\p{L}\\p{N}])(?:" + parts.join("|") + ")(?![\\p{L}\\p{N}])", "iu") : null;
}

/**
 * Who a person record is, for telling when the story named them: the registry id (state.regIds, merges followed) and the
 * names that stand for them. A name the registry gives to another person (or to the player's character) is dropped, so
 * a shared nickname never counts for the wrong one. `own` = the registry says this is a card, the persona or a group member.
 */
export function castIdentity(state, reg, rec) {
  const links = isObj(state.regIds) ? state.regIds : {};
  let e = reg && links[rec.id] ? regGet(reg, links[rec.id]) : null;
  // an older record has no registry id yet: the person the registry knows under one of its names is it (read only, nothing is learned)
  if (!e && reg) {
    for (const n of [rec.name, ...rec.aliases]) {
      const r = resolveName(reg, n, "person");
      const found = r && r.id ? regGet(reg, r.id) : null;
      if (found) {
        e = found;
        break;
      }
    }
  }
  const names = [rec.name, ...rec.aliases];
  if (e) names.push(e.name, ...arr(e.aliases).map((a) => str(isObj(a) ? a.text : a)));
  const others = new Set();
  if (reg) for (const x of arr(reg.entities)) if (isObj(x) && !x.merged && x.kind === "person" && (!e || x.id !== e.id)) for (const n of [x.name, ...arr(x.aliases).map((a) => str(isObj(a) ? a.text : a))]) others.add(str(n).toLowerCase().trim());
  const mine = [];
  for (const n of names) {
    const s = str(n).trim();
    if (s && !others.has(s.toLowerCase()) && !mine.some((m) => m.toLowerCase() === s.toLowerCase())) mine.push(s);
  }
  return { id: e ? e.id : "", own: !!e && REG_OWN_SRC.includes(e.src), re: namesPattern(mine) };
}

/** The registry id a Dashboard name stands for (the Dashboard's own table first, merges followed, else the registry's reading), or "". */
function presentId(reg, personIds, name) {
  const direct = isObj(personIds) ? personIds[name] : null;
  if (typeof direct === "string" && reg) {
    const e = regGet(reg, direct);
    if (e) return e.id;
  }
  const r = reg ? resolveName(reg, name, "person") : null;
  return r && r.id ? (regGet(reg, r.id) || {}).id || "" : "";
}

/** Is the person named in the text of this message (a name or an alias). */
function namedIn(ident, m) {
  return !!ident.re && ident.re.test(str(m.text));
}

/**
 * Was this person on stage in this message. A message with a Dashboard snapshot: only when the Dashboard put them in the scene
 * (`present`, a far person who texts or calls is in it too, with a contact), by id first, else the name; a name in the text
 * alone is a mention, not the stage. A message with no snapshot (no Dashboard, or it came later): the name in the text counts, as before.
 */
function seenIn(ident, rec, m, snaps, reg, personIds) {
  const sn = isObj(snaps) ? snaps[keyOf(m)] : null;
  if (!isObj(sn)) return namedIn(ident, m);
  for (const n of arr(sn.present)) {
    const name = str(n);
    if (!name) continue;
    const id = presentId(reg, personIds, name);
    if (ident.id && id) {
      if (id === ident.id) return true;
    } else if (namesOf(rec).some((x) => x.toLowerCase() === name.toLowerCase())) return true;
  }
  return false;
}

/**
 * Replies since the person was last on stage (`stage`) and since they were last named or on stage (`mentioned`, never more than
 * `stage`). Looks back CAST_SCAN messages, so a long silence reads as at least that. Without a Dashboard the two are the same.
 */
export function silencesOf(ident, rec, msgs, snaps, reg, personIds) {
  let replies = 0;
  let mentioned = -1;
  for (let i = msgs.length - 1; i >= Math.max(0, msgs.length - CAST_SCAN); i--) {
    const on = seenIn(ident, rec, msgs[i], snaps, reg, personIds);
    if (on) return { stage: replies, mentioned: mentioned >= 0 ? mentioned : replies };
    if (mentioned < 0 && namedIn(ident, msgs[i])) mentioned = replies;
    if (isReply(msgs[i])) replies++;
  }
  return { stage: replies, mentioned: mentioned >= 0 ? mentioned : replies };
}

/** Replies since the person was last on stage (see silencesOf). */
export function silenceOf(ident, rec, msgs, snaps, reg, personIds) {
  return silencesOf(ident, rec, msgs, snaps, reg, personIds).stage;
}

/** The silence that makes a person due: Frequency's number, a quarter more or less, fixed for this person in this chat (a swipe does not move it). */
export function castThreshold(freq, chatId, recId) {
  const base = CAST_SILENCE[freq];
  return base ? Math.max(3, Math.round(base * (0.75 + 0.5 * seededRandom(chatId + "|" + recId + "|cast")()))) : 0;
}

/** 2d6 plus 0..3 for the silence (a step per half threshold past it) plus the weight; up to 6 small, 7 to 9 medium, 10 and more big. */
export function rollEntrance(seed, silence, threshold, weight) {
  const rnd = seededRandom(seed + "|cast");
  const d = [Math.floor(rnd() * 6) + 1, Math.floor(rnd() * 6) + 1];
  const mod = threshold > 0 ? clamp(Math.floor((silence - threshold) / (threshold / 2)), 0, 3) : 0;
  const total = d[0] + d[1] + mod + weight;
  return { d, mod, weight, total, band: total <= 6 ? "small" : total <= 9 ? "medium" : "big" };
}

/** A medium or big return that ended as a mention does not count as one: the next comes after half the usual gap and is at least medium. */
const lastWasMention = (last) => !!last && last.res === "mentioned" && last.band !== "small";
/** Replies to wait after the last return before the next can start. */
export function castGap(freq, last) {
  return lastWasMention(last) ? Math.ceil(CAST_GAP[freq] / 2) : CAST_GAP[freq];
}

/** The people who could come back, most overdue first: { rec, silence, seen, threshold, weight, score }. Nothing while the gap after the last return runs or when Frequency is off. */
export function benchDue({ state, msgs, snaps, reg, personIds, freq }) {
  if (!CAST_SILENCE[freq]) return [];
  const replies = msgs.filter(isReply).length;
  if (replies < CAST_FIRST) return [];
  if (state.lastEntrance && replies - state.lastEntrance.n < castGap(freq, state.lastEntrance)) return [];
  const out = [];
  for (const rec of state.entities) {
    if (rec.kind !== "person" || rec.status !== "active" || rec.noReturn === true) continue;
    const ident = castIdentity(state, reg, rec);
    if (ident.own) continue;
    const { stage: silence, mentioned: seen } = silencesOf(ident, rec, msgs, snaps, reg, personIds);
    const threshold = castThreshold(freq, state.chatId, rec.id);
    if (silence < threshold) continue;
    const weight = weightOf(rec);
    out.push({ rec, silence, seen, threshold, weight, score: silence / threshold + weight * 0.5 });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * The people of the bench who are due or will be within `within` replies (one DM cadence): their ids. The DM reads them in
 * full, so a person who is about to come back is not a bare name when the run is made. Nothing when Frequency is off.
 */
export function benchSoon(args) {
  return benchSoonList(args).map((x) => x.id);
}

/** The same people with their names and the silence so far: [{ id, name, silence }], for the DM's input (it may say why they come back). */
export function benchSoonList({ state, msgs, snaps, reg, personIds, freq, within }) {
  if (!CAST_SILENCE[freq]) return [];
  const out = [];
  for (const rec of state.entities) {
    if (rec.kind !== "person" || rec.status !== "active" || rec.noReturn === true) continue;
    const ident = castIdentity(state, reg, rec);
    if (ident.own) continue;
    const silence = silenceOf(ident, rec, msgs, snaps, reg, personIds);
    if (silence >= castThreshold(freq, state.chatId, rec.id) - Math.max(0, within || 0)) out.push({ id: rec.id, name: rec.name, silence });
  }
  return out;
}

/** What the DM is told about who may come back soon, and how to say why. Input only: the system prompt does not change. */
export function returnsInput(soon) {
  const who = arr(soon).map((x) => x.id + " " + x.name + " (silent " + x.silence + ")").join(", ");
  return "May come back soon: " + who + '. If you can tell, add to your JSON "returns": [{"id": "n3", "why": "..."}] for them: one short sentence, at most ' + HOOK_MAX + " characters, on what that person was doing meanwhile and what they want now, tied to a front or an open thread. Leave a person out if you have nothing.";
}

/**
 * The DM's `returns` become hooks on the people it was told about (and no one else): a person, still on the bench. A hook is a short
 * plain sentence; the next entrance of that person uses it, once. Returns how many hooks were set.
 */
export function applyReturns(state, returns, allowed, now) {
  let n = 0;
  for (const raw of arr(returns)) {
    if (!isObj(raw) || !allowed.has(str(raw.id))) continue;
    const rec = state.entities.find((e) => e.id === str(raw.id));
    const text = cut(str(raw.why).replace(/\s+/g, " "), HOOK_MAX);
    if (!rec || rec.kind !== "person" || rec.status !== "active" || rec.noReturn === true || !text) continue;
    rec.hook = { text, at: now };
    n++;
  }
  return n;
}

/**
 * A new entrance for this reply, or null: the most overdue person, with a band from 2d6 (or from the Life die's tier when
 * Life broke in). `seed` is the reply's seed, so a swipe rolls the same.
 */
export function planEntrance({ state, msgs, snaps, reg, personIds, freq, seed, lifeTier }) {
  if (state.entrance) return null;
  const best = benchDue({ state, msgs, snaps, reg, personIds, freq })[0];
  if (!best) return null;
  const roll = lifeTier ? null : rollEntrance(seed, best.silence, best.threshold, best.weight);
  // after a medium or big return that was only a mention, the next is at least medium (the die's own band is kept in `roll`)
  const floor = !lifeTier && roll.band === "small" && lastWasMention(state.lastEntrance);
  return cleanEntrance({
    id: best.rec.id,
    name: best.rec.name,
    band: lifeTier ? LIFE_BAND[lifeTier] : floor ? "medium" : roll.band,
    ...(floor ? { floor: true } : {}),
    seen: best.seen,
    ...(roll ? { roll: roll.total, d: roll.d, mod: roll.mod } : { tier: lifeTier }),
    weight: best.weight,
    threshold: best.threshold,
    silence: best.silence,
    via: lifeTier ? "life" : "silence",
    sent: 0,
    n: msgs.filter(isReply).length,
  });
}

/** The note for the writing model. Firm: the person comes in; the form is the writer's. A second try after a miss is shorter and stricter. */
export function entranceInsert(en, rec) {
  if (en.src === "deck" && rec && !en.retried) return deckEntranceInsert(en, rec);
  if (en.retried) return "[CAST: " + en.name + " was left out of the last reply and must appear in this one. The shortest form will do: a message or a call that names them. Never mention this note.]";
  // the DM's reason for this return, when it gave one, stands in place of the record's first sentence
  const line = rec && rec.hook && str(rec.hook.text) ? " (" + rec.hook.text + ")" : rec && str(rec.text) ? " (" + shorten(firstSentence(rec.text), 140) + ")" : "";
  return "[CAST: " + en.name + line + " has not been around for " + en.silence + " replies. They come into the story in this reply, at this scale: " + CAST_BAND_TEXT[en.band] + ". The form is yours (a message, a call, a visit, an invitation, or someone present bringing them up), but they do appear, and the others react. If they are far away, only what a message or a call can carry; they know only what they were told. Never mention this note.]";
}

/** The note for a person of the cast deck: nobody knows them yet; the card says who they are, what they want and who they come through. */
export function deckEntranceInsert(en, card) {
  const through = card.tie ? " They know " + card.tie + ", and that is how they come in: through them or because of them." : card.faction ? " They come on behalf of " + card.faction + "." : "";
  const want = card.want ? " What they want: " + card.want : "";
  return "[CAST: " + card.name + " is new to the story and comes into it in this reply, at this scale: " + CAST_BAND_TEXT[en.band] + ". Who they are: " + card.text + want + through + " The form is yours (a message, a call, a visit, an invitation, or someone present bringing them up), but they do appear, and the others react. Nobody has met them before; they know only what they have been told. Never mention this note.]";
}

/** A text cut at the end of a sentence when one lies in the second half of the room, else at the limit. */
function cutSentence(text, max) {
  const t = str(text);
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf("… "));
  return end >= max / 2 ? head.slice(0, end + 1) : head;
}

/**
 * A card of the cast deck whose person has come into the story becomes a person record (and a member of its faction's group record), and
 * the card leaves the deck. A name the world already has (the DM wrote the person meanwhile) is left alone: the card goes, no second record.
 * Returns the new record or null.
 */
export function drawCard(state, card, now) {
  state.cast = arr(state.cast).filter((c) => c.id !== card.id);
  if (!state.cast.length) delete state.cast;
  if (findEntity(state.entities, { name: card.name }) || state.entities.some((e) => namesOf(e).some((x) => card.aliases.some((a) => sameName(a, x)))) || state.entities.length >= ENTITIES_MAX) return null;
  const rec = cleanEntity({ id: "n" + state.nextId, kind: "person", name: card.name, aliases: card.aliases, text: cutSentence(card.text, state.settings.textMax), status: "active", uid: 0, at: now, src: "deck", ...(card.relation ? { relation: card.relation } : {}) });
  if (!rec) return null;
  state.nextId++;
  state.entities.push(rec);
  const group = card.faction ? state.entities.find((e) => e.kind === "group" && e.status === "active" && sameName(e.name, card.faction)) : null;
  if (group) group.members = cleanMembers([...arr(group.members), card.name]);
  return rec;
}

/** Is the person a card ties to in the scene now: named in the Dashboard's scene, or a record the cast sees on stage in the newest message. */
function tieOnStage(state, tie, { msgs, snaps, reg, personIds, present }) {
  if (!tie) return false;
  if (arr(present).some((p) => sameName(str(p), tie))) return true;
  const rec = state.entities.find((e) => e.kind === "person" && e.status === "active" && namesOf(e).some((x) => sameName(x, tie)));
  return !!rec && silencesOf(castIdentity(state, reg, rec), rec, msgs, snaps, reg, personIds).stage === 0;
}

/** Is the faction part of the scene's place: the place record lists it among its members or its text names it. */
function factionAtPlace(place, faction) {
  if (!place || !faction) return false;
  if (arr(place.members).some((m) => sameName(str(m), faction))) return true;
  const re = namesPattern([faction]);
  return !!re && re.test(str(place.text));
}

/**
 * Which card of the deck comes: the one whose tie is in the scene now, then the one whose faction has a front that is stirred or half
 * full, then one whose faction belongs to the scene's place; what is left is chosen by the seed (a swipe picks the same). { card, pick }.
 */
export function pickCard(state, ctx) {
  const rnd = seededRandom(ctx.seed + "|deckpick");
  const hot = state.fronts.filter((f) => f.status === "active" && (f.stirred === true || f.clock * 2 >= f.size));
  let best = null;
  for (const card of arr(state.cast)) {
    let score = 0;
    let pick = "random";
    if (tieOnStage(state, card.tie, ctx)) {
      score += 4;
      pick = "tie";
    }
    if (card.faction && hot.some((f) => sameName(f.name, card.faction))) {
      score += 2;
      if (pick === "random") pick = "front";
    }
    if (factionAtPlace(ctx.place, card.faction)) {
      score += 1;
      if (pick === "random") pick = "place";
    }
    score += rnd();
    if (!best || score > best.score) best = { card, pick, score };
  }
  return best ? { card: best.card, pick: best.pick } : null;
}

/**
 * A new person from the cast deck for this reply, or null. Same ladder as the bench: the Frequency's silence (counted from the last
 * entrance of any kind), then the 2d6 for the scale; the bench has the first call (the caller asks planEntrance first). Never with the
 * deck switched off, an empty deck, or while another entrance waits. A card whose name the world got meanwhile is let go here.
 */
export function planDeckEntrance({ state, msgs, snaps, reg, personIds, freq, seed, place, present }) {
  if (state.entrance || !CAST_SILENCE[freq] || state.settings.castDeck !== true || !arr(state.cast).length) return null;
  const replies = msgs.filter(isReply).length;
  if (replies < CAST_FIRST) return null;
  const last = state.lastEntrance;
  if (last && replies - last.n < castGap(freq, last)) return null;
  const known = (c) => findEntity(state.entities, { name: c.name }) || state.entities.some((e) => namesOf(e).some((x) => c.aliases.some((a) => sameName(a, x))));
  if (state.cast.some(known)) {
    state.cast = state.cast.filter((c) => !known(c));
    if (!state.cast.length) delete state.cast;
    if (!arr(state.cast).length) return null;
  }
  const silence = replies - (last ? last.n : 0);
  const threshold = castThreshold(freq, state.chatId, "deck");
  if (silence < threshold) return null;
  const got = pickCard(state, { msgs, snaps, reg, personIds, place, present, seed });
  if (!got) return null;
  const roll = rollEntrance(seed + "|deck", silence, threshold, 0);
  const floor = roll.band === "small" && lastWasMention(last);
  return cleanEntrance({
    id: got.card.id,
    src: "deck",
    name: got.card.name,
    faction: got.card.faction,
    tie: got.card.tie,
    pick: got.pick,
    band: floor ? "medium" : roll.band,
    ...(floor ? { floor: true } : {}),
    roll: roll.total,
    d: roll.d,
    mod: roll.mod,
    weight: 0,
    threshold,
    silence,
    via: "silence",
    sent: 0,
    n: replies,
  });
}

/**
 * Judges an entrance that a reply carried: the reply after the message `after` is the carrier. The person on stage in it =
 * "came"; only named in its text (with a Dashboard) = "mentioned", done too (see castGap and planEntrance for what follows a medium
 * or big one); in neither = missed once, sent again, stricter; missed twice, given up. Either way the gap before the next entrance starts.
 * Returns null when there was nothing to judge, else { ok (came), res, again } (again = a stricter second try is queued).
 */
export function judgeEntrance(state, msgs, snaps, reg, personIds) {
  const en = state.entrance;
  if (!en || !(en.sent > 0) || !en.after) return null;
  const id = String(en.after).split("#")[0];
  const i = msgs.findIndex((m) => String(m.id) === id);
  if (i < 0) return null;
  const carrier = msgs.slice(i + 1).find(isReply);
  if (!carrier) return null;
  // a person of the cast deck is judged by their card: nobody of that name is in the book yet
  const deck = en.src === "deck";
  const rec = deck ? arr(state.cast).find((c) => c.id === en.id) : state.entities.find((e) => e.id === en.id);
  const ident = rec ? castIdentity(state, reg, deck ? { id: "", name: rec.name, aliases: rec.aliases } : rec) : null;
  const res = ident && seenIn(ident, rec, carrier, snaps, reg, personIds) ? "came" : ident && namedIn(ident, carrier) ? "mentioned" : "missed";
  const ok = res === "came";
  const n = msgs.filter(isReply).length;
  if (res === "missed" && rec && !en.retried) {
    const { after, sentAt, ...rest } = en;
    state.entrance = { ...rest, sent: 0, retried: true };
    return { ok, res, again: true, en, carrier: keyOf(carrier) };
  }
  state.lastEntrance = { id: en.id, n, band: en.band, ok, res, ...(deck ? { src: "deck" } : {}) };
  // the DM's reason for this return was used (or missed): the next one needs a new one
  if (!deck && rec && rec.hook) delete rec.hook;
  delete state.entrance;
  // the person is in the story now (on stage or named): the card becomes a record; a miss keeps the card in the deck
  const drawn = deck && rec && res !== "missed" ? drawCard(state, rec, Date.now()) : null;
  if (drawn) state.lastEntrance.id = drawn.id;
  return { ok, res, again: false, en, carrier: keyOf(carrier), ...(drawn ? { drawn } : {}) };
}

/** Writes the result into the newest log line of this person's entrance that has none: "came" (on stage), "mentioned" (only named), "again" (a stricter second try is queued) or "missed". */
function markCastResult(fsx, chatId, en, result) {
  const old = readJson(fsx, dicePath(chatId), null);
  const rolls = isObj(old) ? arr(old.rolls).filter(isObj) : [];
  for (let i = rolls.length - 1; i >= 0; i--) {
    if (rolls[i].kind === "cast" && rolls[i].id === en.id && !rolls[i].result) {
      rolls[i] = { ...rolls[i], result };
      writeJson(fsx, dicePath(chatId), { v: 1, rolls });
      return;
    }
  }
}

/** One line of the dice log for a person coming back (shown in the log and, with the chat's switch, under the reply): who, why, the dice, what came of it. */
function castLog(en, extra) {
  return { kind: "cast", id: en.id, who: en.name, via: en.via, band: en.band, silence: en.silence, ...(Number.isInteger(en.seen) && en.seen < en.silence ? { seen: en.seen } : {}), ...(en.floor ? { floor: true } : {}), ...(Number.isInteger(en.threshold) ? { threshold: en.threshold } : {}), ...(en.weight !== undefined ? { weight: en.weight } : {}), ...(Array.isArray(en.d) ? { d: en.d, mod: en.mod, total: en.roll } : {}), ...(en.tier ? { tier: en.tier } : {}), ...(en.src === "deck" ? { src: "deck", ...(en.faction ? { faction: en.faction } : {}), ...(en.pick ? { pick: en.pick } : {}), ...(en.tie ? { tie: en.tie } : { loose: true }) } : {}), ...(en.retried ? { retried: true } : {}), ...extra };
}

/** The seed of one reply: the chat, the newest message, how many there are, the op and the swipe; a swipe asks the same question and gets the same dice. */
function replySeed(chatId, msgs, turn) {
  return chatId + "|" + (msgs.length ? keyOf(msgs[msgs.length - 1]) : "") + "|" + msgs.length + "|" + str(turn.op) + "|" + (Number.isFinite(turn.swipe) ? turn.swipe : 0);
}

/** What the cast reads of the chat: the Dashboard's snapshots (who was in each scene), its name table and the registry (read only). */
function castContext(fsx, chatId) {
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  return { snaps: isObj(dash) && isObj(dash.snapshots) ? dash.snapshots : {}, personIds: isObj(dash) && isObj(dash.personIds) ? dash.personIds : {}, reg: regView(fsx, chatId) };
}

/** Puts the waiting entrance into this reply's request and marks it sent after the message the reply follows. True when it went in. */
function sendEntrance(fsx, state, msgs, op, parts) {
  const en = state.entrance;
  if (!en || en.sent > 0) return false;
  const rec = en.src === "deck" ? arr(state.cast).find((c) => c.id === en.id) : state.entities.find((e) => e.id === en.id);
  if (!rec) {
    delete state.entrance;
    saveState(fsx, state);
    return false;
  }
  // the message the reply follows: a swipe writes the last reply again, so it follows the one before that
  const anchor = msgs[msgs.length - (op === "swipe" ? 2 : 1)];
  state.entrance = { ...en, sent: 1, sentAt: Date.now(), ...(anchor ? { after: keyOf(anchor) } : {}) };
  saveState(fsx, state);
  parts.push({ kind: "plugin", label: "Cast", text: entranceInsert(en, rec) });
  const last = msgs.length ? msgs[msgs.length - 1] : null;
  logDice(fsx, state.chatId, { at: Date.now(), n: msgs.length, last: last ? keyOf(last) : "", lastSwipes: last && Array.isArray(last.swipes) ? last.swipes.length : 0, op, inserted: true, ...castLog(en) });
  return true;
}

/**
 * The cast as the chat stands (for testing and for the panel): Frequency, every person of the bench with the silence so far
 * and the silence that makes them due, the entrance waiting or sent, and the last one judged. Read only.
 */
export function castStatus(fsx, chatId) {
  const { state } = loadState(fsx, chatId);
  const chat = readChat(fsx, chatId);
  const freq = state.settings.level !== "off" && CAST_FREQ.includes(state.settings.cast) ? state.settings.cast : "off";
  const ctx = chat ? castContext(fsx, chatId) : null;
  const msgs = chat ? chat.msgs : [];
  const people = [];
  if (ctx) {
    for (const rec of state.entities) {
      if (rec.kind !== "person" || rec.status !== "active") continue;
      const ident = castIdentity(state, ctx.reg, rec);
      if (ident.own) continue;
      const { stage: silence, mentioned: named } = silencesOf(ident, rec, msgs, ctx.snaps, ctx.reg, ctx.personIds);
      const threshold = castThreshold(freq === "off" ? "normal" : freq, chatId, rec.id);
      people.push({ id: rec.id, name: rec.name, silence, named, threshold, weight: weightOf(rec), ...(rec.relation ? { relation: rec.relation } : {}), linked: !!rec.link, byId: !!ident.id, off: rec.noReturn === true, due: freq !== "off" && rec.noReturn !== true && silence >= threshold });
    }
  }
  people.sort((a, b) => b.silence / (b.threshold || 1) - a.silence / (a.threshold || 1));
  const replies = msgs.filter(isReply).length;
  return {
    freq,
    replies,
    // the replies still to wait before the next return can start (the gap after the last one), and before the chat is old enough
    wait: freq === "off" ? 0 : Math.max(0, CAST_FIRST - replies, state.lastEntrance ? castGap(freq, state.lastEntrance) - (replies - state.lastEntrance.n) : 0),
    entrance: state.entrance || null,
    last: state.lastEntrance || null,
    people,
    // lorebook entries of the chat's cards the bench could be adopted from (0 = nothing to offer)
    lorePeople: chat ? benchEntries(fsx, chat.meta).length : 0,
    // the cast deck: the switch, the cards left (not who they are), by faction, how many have no tie, and when the next new person can start
    deck: deckStatus(state, freq, replies),
  };
}

/** The cast deck as the chat stands: on, cards left by faction, loose cards (no tie), the silence since the last entrance and the one that starts the next, the replies still to wait. */
export function deckStatus(state, freq, replies) {
  const cards = arr(state.cast);
  const by = new Map();
  for (const c of cards) by.set(c.faction || "", (by.get(c.faction || "") || 0) + 1);
  const on = state.settings.castDeck === true && freq !== "off";
  const last = state.lastEntrance;
  const f = freq === "off" ? "normal" : freq;
  return {
    on,
    switch: state.settings.castDeck === true,
    left: cards.length,
    factions: [...by.entries()].map(([name, n]) => ({ name, n })),
    loose: cards.filter((c) => !c.tie).length,
    per: state.settings.castPer,
    len: state.settings.castLen,
    silence: replies - (last ? last.n : 0),
    threshold: castThreshold(f, state.chatId, "deck"),
    wait: on ? Math.max(0, CAST_FIRST - replies, last ? castGap(freq, last) - (replies - last.n) : 0) : 0,
    // the refill: whether one is due now, the replies since the last try (null = none yet), and the log of tries (newest first)
    refill: refillDue(state, replies),
    refillAgo: state.castBuild ? replies - state.castBuild.n : null,
    log: [...arr(state.castLog)].reverse(),
  };
}

/** The tidy-up as the chat stands (for the panel and for testing): the switch, the log (newest first), how many things sleep, and the replies to the next pass. */
export function tidyStatus(fsx, chatId) {
  const { state } = loadState(fsx, chatId);
  const chat = readChat(fsx, chatId);
  const replies = chat ? chat.msgs.filter(isReply).length : 0;
  const things = state.entities.filter((e) => e.kind === "thing");
  return {
    on: state.settings.tidy !== false,
    every: TIDY_EVERY,
    replies,
    // 0 = the next reply starts a pass (or the first pass only takes the list)
    next: state.tidy ? Math.max(0, TIDY_EVERY - (replies - state.tidy.n)) : Math.max(0, TIDY_EVERY - replies),
    first: !state.tidy,
    active: things.filter((e) => e.status === "active").length,
    asleep: things.filter((e) => e.status === "dormant").length,
    log: [...arr(state.tidyLog)].reverse(),
  };
}

function tidyRoute(req, host) {
  const fsx = host.fs;
  const b = req.method === "POST" ? body(req) : req.query || {};
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  if (req.method === "POST") {
    const { state, existed } = loadState(fsx, chatId);
    if (!existed) return ok({ error: "this chat has no world yet" }, 409);
    const res = runTidy(fsx, state, chat, true);
    return ok({ ...tidyStatus(fsx, chatId), archived: res.archived.map((e) => e.name), woken: res.woken.map((e) => e.name) });
  }
  return ok(tidyStatus(fsx, chatId));
}

/**
 * POST {chatId, force?, lang?}: one build call adds cards to the cast deck (merge, never replace: what the player edited stays). The app calls it
 * after a DM run when the view says castRefill; `force` is the button in the sheet (no rule, only the room: the deck holds CAST_CARDS_MAX).
 * The factions with the fewest cards come first, at most CAST_PART of them, castPer people each.
 */
function castRefillRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state, existed } = loadState(fsx, chatId);
  if (!existed) return ok({ error: "this chat has no world yet" }, 409);
  const replies = chat.msgs.filter(isReply).length;
  const force = b.force === true;
  if (!force && !refillDue(state, replies)) return ok({ ok: true, skipped: "not due" });
  const room = CAST_CARDS_MAX - arr(state.cast).length;
  if (room <= 0) return ok({ ok: true, skipped: "full" });
  const all = castFactions(state.entities, state.fronts);
  if (!all.length) return ok({ ok: false, error: "the world has no faction to write people for: a group or a front is needed", code: "no-factions" });
  const count = (f) => arr(state.cast).filter((c) => sameName(c.faction, f.name)).length;
  const part = [...all].sort((x, y) => count(x) - count(y)).slice(0, CAST_PART);
  const cfg = loadConfig(fsx);
  const userName = userNameOf(fsx, chat.meta);
  const index = tieIndex(state.entities, cardNames(fsx, chat.meta), userName);
  const have = arr(state.cast).map((c) => c.name);
  const per = state.settings.castPer;
  const content = castInput({ entities: state.entities, fronts: state.fronts, factions: part, per, len: state.settings.castLen, index, have, prompt: "", lang: cut(str(b.lang), LANG_MAX) });
  const built = buildResult(host, "world_cast", buildAsk(host, fsx, cfg, chat.meta, CAST_SYSTEM, content), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  const line = { at: Date.now(), n: replies, factions: part.map((f) => f.name), ...(force ? { forced: true } : {}) };
  state.castBuild = { n: replies };
  if (built.error) {
    state.castLog = [...arr(state.castLog), { ...line, added: 0, error: built.error.code }].slice(-CAST_LOG_MAX);
    countBuild(state, built, "cast", 0);
    saveState(fsx, state);
    return ok({ ok: false, error: built.error.message, code: built.error.code });
  }
  const got = castFrom(built.out, { entities: state.entities, index, factions: part, per, have }).slice(0, room);
  state.cast = cleanCast([...arr(state.cast), ...got]);
  state.castLog = [...arr(state.castLog), { ...line, added: got.length }].slice(-CAST_LOG_MAX);
  countBuild(state, built, "cast", got.length);
  saveState(fsx, state);
  return ok({ ok: true, added: got.length, left: state.cast.length, ...(got.length ? {} : { none: true }) });
}

/**
 * The cards of the cast deck, for the book's "Cast deck" chip: GET lists them; POST {chatId, op: "edit" | "delete", id, ...} changes one.
 * An edit may change the name, aliases, tie, want and text (a card keeps its faction): a name another card or a record has is refused
 * (409, code "clash"), and so is a tie nobody goes by (409, code "tie"). The cards are the player's to read and change; the DM never sees them.
 */
function castCardsRoute(req, host) {
  const fsx = host.fs;
  const b = req.method === "POST" ? body(req) : req.query || {};
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state, existed } = loadState(fsx, chatId);
  if (req.method !== "POST") return ok({ cards: cleanCast(state.cast), per: state.settings.castPer, len: state.settings.castLen });
  if (!existed) return ok({ error: "this chat has no world yet" }, 409);
  const cards = cleanCast(state.cast);
  const card = cards.find((c) => c.id === str(b.id));
  if (!card) return ok({ error: "no such card" }, 404);
  if (b.op === "delete") {
    state.cast = cards.filter((c) => c !== card);
    if (!state.cast.length) delete state.cast;
    saveState(fsx, state);
    return ok({ cards: arr(state.cast) });
  }
  if (b.op !== "edit") return ok({ error: "op must be edit or delete" }, 400);
  const patch = {
    ...(b.name !== undefined ? { name: b.name } : {}),
    ...(b.aliases !== undefined ? { aliases: b.aliases } : {}),
    ...(b.want !== undefined ? { want: b.want } : {}),
    ...(b.text !== undefined ? { text: b.text } : {}),
  };
  if (b.tie !== undefined) {
    const tie = str(b.tie) ? tieOf(tieIndex(state.entities, cardNames(fsx, chat.meta), userNameOf(fsx, chat.meta)), b.tie) : "";
    if (str(b.tie) && !tie) return ok({ error: "nobody who exists goes by that name", code: "tie" }, 409);
    patch.tie = tie;
  }
  const [next] = cleanCast([{ ...card, ...patch }]);
  if (!next) return ok({ error: "a card needs a name and a text", code: "empty" }, 400);
  const taken = cards.some((c) => c !== card && sameName(c.name, next.name)) || (!sameName(card.name, next.name) && !!findEntity(state.entities, { name: next.name }));
  if (taken) return ok({ error: "that name is taken", code: "clash" }, 409);
  state.cast = cards.map((c) => (c === card ? { ...next, id: card.id } : c));
  saveState(fsx, state);
  return ok({ cards: state.cast });
}

function castRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  if (!readChat(host.fs, chatId)) return ok({ error: "no such chat" }, 404);
  return ok(castStatus(host.fs, chatId));
}

function withLast(messages, text) {
  const last = messages[messages.length - 1];
  if (last && last.role === "user" && typeof last.content === "string") return [...messages.slice(0, -1), { ...last, content: last.content + "\n\n" + text }];
  return [...messages, { role: "user", content: text }];
}

// ---------- the dice ----------
// Code rolls before the reply is written (no model call): 2d6 plus a modifier from one of the
// character's Dashboard numbers (-100..100, a twentieth of it, so -5..+5), read as four outcomes.
// The line rides the reply request like the DM's event and shows in the prompt Inspector as "Dice".
const DICE_BANDS = [5, 7, 9]; // up to 5 miss, 6-7 no but, 8-9 yes but, 10 and more full
const DICE_OUTCOMES = {
  miss: ["miss", "it fails outright and costs something"],
  no_but: ["no, but", "it does not work, but something is gained or a way stays open"],
  yes_but: ["yes, but", "it works, but with a complication or a price"],
  full: ["full success", "it works cleanly, with no complication"],
};
const DICE_LOG_MAX = 60;
const dicePath = (chatId) => "world/dice/" + chatId + ".json";

function hashText(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same seed gives the same rolls, so a reload does not re-roll and a swipe does. */
export function seededRandom(seed) {
  let a = hashText(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const diceMod = (value) => (Number.isFinite(value) ? clamp(Math.sign(value) * Math.round(Math.abs(value) / 20), -5, 5) : 0);

// "life intervenes": its own roll, apart from the action's; a d6 sets how big the intrusion is
const LIFE_TIERS = {
  minor: "a small thing: a sound, a passer-by, a change of light or weather",
  notable: "a real interruption: an arrival, news, someone present acting on their own",
  major: "a large turn: a danger, a revelation or a reversal the scene must answer",
};
export const lifeTier = (d) => (d <= 3 ? "minor" : d <= 5 ? "notable" : "major");

/** One roll for one reply: does the world break in, and how big. */
export function rollLife(seed, chance) {
  if (!(chance > 0)) return { gated: false, gate: 0 };
  const rnd = seededRandom(seed + "|life");
  const gate = Math.floor(rnd() * 100) + 1;
  if (gate > chance) return { gated: false, gate };
  const d = Math.floor(rnd() * 6) + 1;
  return { gated: true, gate, d, tier: lifeTier(d) };
}

export function lifeInsert(roll) {
  return "[LIFE: the world intervenes in this reply, " + roll.tier + ". Something outside the focus of the scene breaks in: " + LIFE_TIERS[roll.tier] + ". Weave it in; the others in the scene react to it. Never mention this note.]";
}

// "pacing die" (#155): a check on the step itself. How ready the character is for closeness comes from the Dashboard
// (comfort counts double, trust and affection once; the weighted mean of what exists, -100..100), is read as a twentieth
// like the fate die's number, and 2d6 plus it gives the same four outcomes, worded for closeness. The model tells whether
// the user's move is a step toward closeness; code only says how it lands.
const PACE_WEIGHTS = { comfort: 2, trust: 1, affection: 1 };
const PACE_OUTCOMES = {
  miss: ["not ready", "it does not land: the character is not ready and draws back, deflects or asks for room, kindly and in character, with no harsh rejection"],
  no_but: ["hesitant", "it does not land yet, but the warmth stays: the character hesitates or softens, and a gentler step later could work"],
  yes_but: ["accepts, nervous", "the character accepts, with visible nerves, a condition or a shy price"],
  full: ["welcomes", "the character welcomes it"],
};
export const paceReadiness = (stats) => {
  if (!isObj(stats)) return null;
  let sum = 0;
  let w = 0;
  for (const [k, weight] of Object.entries(PACE_WEIGHTS)) if (Number.isFinite(stats[k])) { sum += stats[k] * weight; w += weight; }
  return w ? sum / w : null;
};
export const paceBand = (r) => (r === null ? "unknown" : r <= -40 ? "closed" : r <= 0 ? "guarded" : r <= 40 ? "open" : "warm");

/** One roll for one reply: is the pacing check on the table at all (chance, percent), then 2d6 + the readiness mod. */
export function rollPace(seed, chance, readiness, bands = DICE_BANDS) {
  if (!(chance > 0)) return { gated: false, gate: 0 };
  return rollFate(seed + "|pace", chance, readiness === null ? 0 : diceMod(readiness), bands);
}

export function paceInsert(roll, mode, who, readiness) {
  const [label, meaning] = PACE_OUTCOMES[roll.outcome];
  const state = readiness === null ? "not known" : paceBand(readiness) + " (" + Math.round(readiness) + "/100 toward the user's character)";
  return [
    "[PACE: a hidden check for this reply. Never mention dice, numbers or this note.]",
    (who ? who + " is " : "The character is ") + "closeness-wise " + state + ". Check: " + label + ".",
    "If the user's character takes a step toward closeness in this turn (a touch, a kiss, an intimate confession, pressing for more), " + meaning + ".",
    "A move that matches what they already share is no step; with no such step, ignore this note.",
    mode === "strict" ? "This result binds: do not soften it, reverse it or add a way around it." : "Let it colour the scene and stay in character.",
  ].join(" ");
}

export function diceOutcome(total, bands = DICE_BANDS) {
  return total <= bands[0] ? "miss" : total <= bands[1] ? "no_but" : total <= bands[2] ? "yes_but" : "full";
}

/** One roll for one reply: first whether the die is on the table at all (chance, percent), then 2d6 + mod. */
export function rollFate(seed, chance, mod, bands = DICE_BANDS) {
  const rnd = seededRandom(seed);
  const gate = Math.floor(rnd() * 100) + 1;
  if (gate > chance) return { gated: false, gate };
  const d1 = Math.floor(rnd() * 6) + 1;
  const d2 = Math.floor(rnd() * 6) + 1;
  const total = d1 + d2 + mod;
  return { gated: true, gate, d1, d2, mod, total, outcome: diceOutcome(total, bands) };
}

/** The closing sentences of a roll line: how binding it is, and what to do when the player already wrote how their action ends. */
function diceTail(mode) {
  return [
    mode === "strict" ? "This result binds: do not soften it, reverse it or add a way around it." : "Let it colour the scene and stay in character; bend it only where the character demands.",
    "If the user's own text already says how their action ends, keep that as written and apply the result to what follows: how the others react and what it gains or costs.",
    "If nothing uncertain is attempted, ignore this note.",
  ];
}

export function diceInsert(roll, mode, stat, who) {
  const [label, meaning] = DICE_OUTCOMES[roll.outcome];
  const sign = roll.mod >= 0 ? "+" : "-";
  const from = who ? " (" + stat + " of " + who + ")" : "";
  return [
    "[FATE: a hidden roll for this reply. Never mention dice, numbers or this note.]",
    "2d6 " + sign + " " + Math.abs(roll.mod) + from + " = " + roll.total + ": " + label + ".",
    "If the user's character attempts something uncertain in this turn, " + meaning + ".",
    ...diceTail(mode),
  ].join(" ");
}

/** Auto: one 2d6 for the whole scene, and the outcome it makes with each present character's numbers; the model takes the person the action is aimed at and the stat it leans on. */
export function rollFateAuto(seed, chance, cast, bands = DICE_BANDS) {
  const roll = rollFate(seed, chance, 0, bands);
  if (!roll.gated) return roll;
  const base = roll.d1 + roll.d2;
  const by = {};
  for (const c of cast) {
    by[c.who] = {};
    for (const st of DICE_STATS) by[c.who][st] = diceOutcome(base + diceMod(c.stats[st]), bands);
  }
  return { gated: true, gate: roll.gate, d1: roll.d1, d2: roll.d2, mod: 0, total: base, outcome: diceOutcome(base, bands), by };
}

export function diceInsertAuto(roll, mode) {
  // only what differs from the bare dice is listed; anyone or anything else gets the bare outcome
  const lines = [];
  const seen = new Set([roll.outcome]);
  for (const [who, row] of Object.entries(roll.by || {})) {
    const groups = {};
    for (const st of DICE_STATS) if (row[st] !== roll.outcome) (groups[row[st]] ||= []).push(st);
    const parts = ["full", "yes_but", "no_but", "miss"].filter((o) => groups[o]).map((o) => {
      seen.add(o);
      return DICE_OUTCOMES[o][0] + ": " + groups[o].join(", ");
    });
    if (parts.length) lines.push(who + " - " + parts.join(" | "));
  }
  const bare = DICE_OUTCOMES[roll.outcome][0];
  const legend = [...seen].map((o) => DICE_OUTCOMES[o][0] + " = " + DICE_OUTCOMES[o][1]).join("; ");
  return [
    "[FATE: a hidden roll for this reply. Never mention dice, numbers or this note.]",
    "2d6 = " + roll.total + ": " + bare + ".",
    lines.length
      ? "If the user's character attempts something uncertain in this turn, take the person it is aimed at and the stat it leans on, and use that result: " + lines.join("; ") + ". Anyone else, or a stat not listed: " + bare + ". Meanings: " + legend + "."
      : "If the user's character attempts something uncertain in this turn, " + DICE_OUTCOMES[roll.outcome][1] + ".",
    ...diceTail(mode),
  ].join(" ");
}

/** The newest Dashboard snapshot on the chat's active line. */
function lastSnapshot(fsx, chatId, msgs) {
  const dash = readJson(fsx, "dashboard/state/" + chatId + ".json", null);
  const snaps = isObj(dash) && isObj(dash.snapshots) ? dash.snapshots : null;
  if (!snaps) return null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const sn = snaps[keyOf(msgs[i])];
    if (isObj(sn)) return sn;
  }
  return null;
}

/** The number the die adds: the speaker's (else the first present character's) Dashboard value toward the user. */
export function diceStatOf(fsx, chatId, msgs, speakerName, stat) {
  const { who, stats } = diceStatsOf(fsx, chatId, msgs, speakerName);
  return { who, value: stats && Number.isFinite(stats[stat]) ? stats[stat] : null };
}

/** Everyone in the scene the Dashboard has numbers for, the speaker first, at most four. */
export function diceCastOf(fsx, chatId, msgs, speakerName) {
  const sn = lastSnapshot(fsx, chatId, msgs);
  if (!sn || !isObj(sn.chars)) return [];
  const names = arr(sn.present).filter((n) => typeof n === "string" && isObj(sn.chars[n]) && isObj(sn.chars[n].stats));
  names.sort((a, b) => (b === speakerName ? 1 : 0) - (a === speakerName ? 1 : 0));
  return names.slice(0, 4).map((who) => ({ who, stats: sn.chars[who].stats }));
}

/** All of that character's numbers (null when the Dashboard has none). */
export function diceStatsOf(fsx, chatId, msgs, speakerName) {
  const sn = lastSnapshot(fsx, chatId, msgs);
  if (!sn || !isObj(sn.chars)) return { who: "", stats: null };
  const present = arr(sn.present).filter((n) => isObj(sn.chars[n]));
  const who = present.includes(speakerName) ? speakerName : present[0] || "";
  return { who, stats: who && isObj(sn.chars[who].stats) ? sn.chars[who].stats : null };
}

function logDice(fsx, chatId, entry) {
  const old = readJson(fsx, dicePath(chatId), null);
  const rolls = isObj(old) ? arr(old.rolls).filter(isObj) : [];
  writeJson(fsx, dicePath(chatId), { v: 1, rolls: [...rolls, entry].slice(-DICE_LOG_MAX) });
}

/** The dice in force for a chat: its own setting where set, else the profile's option. */
export function diceOf(profile, settings) {
  const o = profile && profile.options ? profile.options : DEFAULT_OPTIONS;
  return {
    mode: settings.dice || o.dice,
    stat: settings.diceStat || o.diceStat,
    chance: settings.diceChance || o.diceChance,
    tilt: settings.diceTilt || o.diceTilt,
    life: settings.diceLife >= 0 ? settings.diceLife : o.diceLife,
    pace: settings.dicePace >= 0 ? settings.dicePace : o.dicePace,
  };
}

function diceRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const raw = readJson(host.fs, dicePath(chatId), null);
  const { state } = loadState(host.fs, chatId);
  return ok({ rolls: isObj(raw) ? arr(raw.rolls).filter(isObj) : [], show: state.settings.diceShow === true, castShow: state.settings.castShow === true });
}

/**
 * insertCeiling (Molfar.Vertep#220): the most prompt tokens the World DM may add to the next request of this chat: the "here"
 * note (at most HERE_MAX characters), the event (EVENT_MAX) and the dice line, when the chat has a world state. The rows and ids
 * are the ones plugins/engine `hookInsertBreakdown` keeps as its fallback: change them together.
 */
/** The room the note of a new person from the cast deck can take: the longest card's text and want, plus the frame of the note. 0 with no deck. The engine plugin's table has the same rule: change both. */
export function deckNoteTokens(set, cards) {
  if (!isObj(set) || set.castDeck !== true || !Array.isArray(cards) || !cards.length) return 0;
  return Math.ceil(Math.max(...cards.map((c) => (isObj(c) ? String(c.text || "").length + String(c.want || "").length : 0))) / 3.5) + 110;
}

export function insertCeiling(ctx, host) {
  const fsx = host && host.fs ? host.fs : null;
  const chatId = ctx && typeof ctx.chatId === "string" ? ctx.chatId : "";
  if (!fsx || !CHAT_ID.test(chatId)) return { ceilings: [] };
  const m = readJson(fsx, "chats/" + chatId + ".meta.json", null);
  const offList = isObj(m) && isObj(m.promptBoard) && Array.isArray(m.promptBoard.off) ? m.promptBoard.off.map(String) : [];
  if (offList.includes("plugin:world")) return ceilingAnswer([]);
  const w = readJson(fsx, STATE_DIR + chatId + ".json", null);
  if (!isObj(w)) return ceilingAnswer([]);
  const set = isObj(w.settings) ? w.settings : {};
  const rows = [{ id: "world here", tokens: Math.ceil(HERE_MAX / 3.5) }];
  if (set.insert !== false && set.level !== "off" && set.level !== "chronicler") {
    rows.push({ id: "world event", tokens: Math.ceil(EVENT_MAX / 3.5) });
    if (set.dice) rows.push({ id: "world dice", tokens: 60 });
  }
  // a person coming back: the note; with a deck that has cards, the note of a new person carries the card's text (the longest card's room)
  if (set.level !== "off" && (set.cast === "rare" || set.cast === "normal" || set.cast === "often")) rows.push({ id: "world cast", tokens: Math.max(160, deckNoteTokens(set, w.cast)) });
  return ceilingAnswer(rows);
}
/** An answer with no row would read as no answer at all (the engine drops empty ones and its plugin falls back to its table): a zero row says "asked, nothing to reserve". */
const ceilingAnswer = (rows) => ({ ceilings: rows.length ? rows : [{ id: "world", tokens: 0 }] });

export function llmRequest(ctx, host) {
  if (!ctx || ctx.key !== "reply") return null;
  const req = ctx.request || {};
  const chatId = String(req.sessionId || "");
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx || !CHAT_ID.test(chatId) || !Array.isArray(req.messages)) return null;
  const turn = isObj(ctx.turn) ? ctx.turn : isObj(req.turn) ? req.turn : {};
  if (!OPS_WITH_EVENT.includes(str(turn.op))) return null;
  try {
    const { state, existed } = loadState(fsx, chatId);
    if (!existed) return null;
    const lv = state.settings.level;
    const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
    const off = isObj(meta) && isObj(meta.promptBoard) && Array.isArray(meta.promptBoard.off) ? meta.promptBoard.off : [];
    if (off.includes("plugin:world")) return null;
    const chat = readChat(fsx, chatId);
    const op = str(turn.op);
    // a reply deleted or swiped since the last run takes its changes with it; a swipe writes the last reply again, so what
    // the runs read of it, and an event it carried, are taken back before the new one is built (#75)
    if (chat && chat.msgs.length) settle(fsx, state, chat, op === "swipe" ? String(chat.msgs[chat.msgs.length - 1].id) : "");
    // events and dice need a level above the chronicler and the switch "insert"; the world here does not
    const events = state.settings.insert && lv !== "chronicler" && lv !== "off";
    const profile = events ? profileFor(fsx, state.settings) : null;
    const dice = profile ? diceOf(profile, state.settings) : null;
    const diceMode = dice ? dice.mode : "off";
    const scene = chat ? sceneOf(fsx, chatId, chat.msgs) : null;
    // a missed event waits for the next reply only while the story is still where it was written (a time skip or a new scene since: it is let go)
    if (retryStale(state.event, scene)) {
      state.event = null;
      saveState(fsx, state);
    }
    const eventDue = events && !!state.event && state.event.sent === 0;
    const dir = directionOf(state, scene);
    if (dir === "explicit") return null;
    const eventsAllowed = !(dir === "combat" && lv !== "antagonist" && lv !== "chaos");
    const parts = [];
    const hereText = hereInsert(hereOf(state, scene, chat ? [userNameOf(fsx, chat.meta)].filter(Boolean) : [], regView(fsx, chatId)));
    if (hereText) parts.push({ kind: "plugin", label: "World · here", text: hereText });
    const eventText = eventsAllowed && eventDue ? eventInsert(state.event, profile && profile.blocks.event) : null;
    if (eventText) {
      // the message the reply follows: a swipe writes the last reply again, so it follows the one before that
      const msgs0 = chat ? chat.msgs : [];
      const anchor = msgs0[msgs0.length - (op === "swipe" ? 2 : 1)];
      state.event = { ...state.event, sent: state.event.sent + 1, sentAt: Date.now(), ...(anchor ? { after: keyOf(anchor) } : {}) };
      saveState(fsx, state);
      parts.push({ kind: "plugin", label: "World DM", text: eventText });
    }
    // a person who has been away comes back (#424): works at every level but off, with no events or fronts needed; one at a time, and not while a DM event waits
    const castFreq = lv !== "off" && CAST_FREQ.includes(state.settings.cast) ? state.settings.cast : "off";
    const castCtx = castFreq !== "off" && chat ? castContext(fsx, chatId) : null;
    let castSent = false;
    if (castCtx && eventsAllowed) {
      const judged = judgeEntrance(state, chat.msgs, castCtx.snaps, castCtx.reg, castCtx.personIds);
      if (judged) {
        // a person of the cast deck who came is a record now: the registry and the world book learn them here
        if (judged.drawn && chat) {
          const rc = openRegistry(fsx, chatId, chat.meta);
          joinPeople(state, rc);
          regFlush(fsx, rc);
          writeBook(fsx, state, str(chat.meta.title));
          bindBook(fsx, chatId, chat.meta, state.bookId);
        }
        saveState(fsx, state);
        // what came of it goes into the line the note made, so the log and the mark under the reply say who, why, the dice and the result together
        markCastResult(fsx, chatId, judged.en, judged.res === "missed" && judged.again ? "again" : judged.res);
      }
      // the person is in the scene now, or the player turned the switch off since: let it go
      const en0 = state.entrance;
      const waiting = en0 ? (en0.src === "deck" ? arr(state.cast).find((c) => c.id === en0.id) : state.entities.find((e) => e.id === en0.id)) : null;
      if (en0 && (!waiting || (en0.src === "deck" ? en0.sent === 0 && state.settings.castDeck !== true : waiting.status !== "active" || waiting.noReturn === true))) {
        delete state.entrance;
        saveState(fsx, state);
      }
      if (!eventText && !(state.event && state.event.sent === 0) && !state.entrance) {
        const args = { state, msgs: chat.msgs, snaps: castCtx.snaps, reg: castCtx.reg, personIds: castCtx.personIds, freq: castFreq, seed: replySeed(chatId, chat.msgs, turn) };
        // the bench has the first call; a new person from the deck comes when nobody who exists is due
        const plan = planEntrance(args) || planDeckEntrance({ ...args, place: scene ? placeRecordOf(state, scene, castCtx.reg) : null, present: scene ? arr(scene.present) : [] });
        if (plan) state.entrance = plan;
      }
      castSent = sendEntrance(fsx, state, chat.msgs, op, parts);
    }
    if (eventsAllowed && diceMode !== "off") {
      const opt = { diceStat: dice.stat, diceChance: dice.chance };
      const bands = DICE_TILTS[dice.tilt] || DICE_BANDS;
      // the chat's own last message, not the request: other plugins rewrite the request text before or after this hook
      const msgs = chat ? chat.msgs : [];
      const seed = replySeed(chatId, msgs, turn);
      // where in the chat this roll belongs, so a mark can sit under the reply it shaped
      const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
      const place = { n: msgs.length, last: lastMsg ? keyOf(lastMsg) : "", lastSwipes: lastMsg && Array.isArray(lastMsg.swipes) ? lastMsg.swipes.length : 0 };
      let text = "";
      if (opt.diceStat === "auto") {
        const cast = diceCastOf(fsx, chatId, msgs, str(turn.speakerName));
        const roll = rollFateAuto(seed, opt.diceChance, cast, bands);
        logDice(fsx, chatId, { at: Date.now(), ...place, op: str(turn.op), mode: diceMode, stat: "auto", tilt: dice.tilt, who: cast.map((c) => c.who).join(", "), value: null, chance: opt.diceChance, ...roll, inserted: roll.gated });
        if (roll.gated) text = diceInsertAuto(roll, diceMode);
      } else {
        const { who, value } = diceStatOf(fsx, chatId, msgs, str(turn.speakerName), opt.diceStat);
        const roll = rollFate(seed, opt.diceChance, diceMod(value), bands);
        logDice(fsx, chatId, { at: Date.now(), ...place, op: str(turn.op), mode: diceMode, stat: opt.diceStat, tilt: dice.tilt, who, value, chance: opt.diceChance, ...roll, inserted: roll.gated });
        if (roll.gated) text = diceInsert(roll, diceMode, opt.diceStat, who);
      }
      if (text) parts.push({ kind: "plugin", label: "Dice", text });
      // a step toward closeness meets the character's readiness
      if (dice.pace > 0) {
        const { who, stats } = diceStatsOf(fsx, chatId, msgs, str(turn.speakerName));
        const readiness = paceReadiness(stats);
        const pace = rollPace(seed, dice.pace, readiness, bands);
        logDice(fsx, chatId, { at: Date.now(), ...place, kind: "pace", op: str(turn.op), mode: diceMode, tilt: dice.tilt, who, value: readiness === null ? null : Math.round(readiness), chance: dice.pace, ...pace, inserted: pace.gated });
        if (pace.gated) parts.push({ kind: "plugin", label: "Pace", text: paceInsert(pace, diceMode, who, readiness) });
      }
      // the world may break in on its own; a waiting DM event is that already
      if (dice.life > 0 && !eventText) {
        const life = rollLife(seed, dice.life);
        // cast-aware (#424): when the world breaks in and someone has been away long enough, the intrusion is that person (the tier sets how big)
        let cast = castSent;
        if (life.gated && castCtx && !castSent && !state.entrance) {
          const plan = planEntrance({ state, msgs, snaps: castCtx.snaps, reg: castCtx.reg, personIds: castCtx.personIds, freq: castFreq, seed, lifeTier: life.tier });
          if (plan) {
            state.entrance = plan;
            cast = sendEntrance(fsx, state, msgs, str(turn.op), parts);
          }
        }
        logDice(fsx, chatId, { at: Date.now(), ...place, kind: "life", op: str(turn.op), chance: dice.life, ...life, inserted: life.gated && !cast, ...(life.gated && cast && state.entrance ? { cast: state.entrance.id } : {}) });
        if (life.gated && !cast) parts.push({ kind: "plugin", label: "Life", text: lifeInsert(life) });
      }
    }
    if (!parts.length) return null;
    return { messages: withLast(req.messages, parts.map((p) => p.text).join("\n\n")), promptSources: { parts } };
  } catch (e) {
    try {
      host.log("world insert: " + (e && e.message ? e.message : String(e)));
    } catch {}
    return null;
  }
}

// ---------- the world book ----------
export const BOOK_SETTINGS = {
  scanDepth: 4, contextPercent: 25, budgetCap: 0, minActivations: 0, maxRecursion: 2,
  insertionStrategy: "character_first", caseSensitive: false, wholeWords: true, groupScoring: false,
  recursiveScan: false, includeNames: true, overflowAlert: false,
};

/** One entry of the world book for one record (uid assigned by the caller). */
function entryOf(e, uid, old, constant) {
  return {
    ...(isObj(old) ? old : {}),
    uid,
    title: e.name,
    memo: "world:" + e.id + (e.status === "past" ? " (retired)" : ""),
    keys: namesOf(e),
    keysRegex: false,
    secondaryKeys: [],
    selectiveLogic: "AND_ANY",
    // a pinned living record is always in the prompt; the rest come up by their keys
    // (a bench stub of a weighty person is too: see benchConstant)
    status: (e.pinned || constant) && e.status === "active" ? "constant" : "normal",
    content: e.name + (spaceNote(e) ? spaceNote(e).replace(" [", " (").replace(/\]$/, ")") : "") + ": " + e.text,
    position: "after_char",
    depth: 4,
    role: "system",
    // retired records lose to living ones when the budget runs out
    order: e.status === "past" ? 50 : 100,
    // a dormant record (put to rest by the tidy-up) is out of the prompt until it is woken
    enabled: e.status !== "dormant",
  };
}

/** The ids of the bench stubs that stay in the prompt all the time: linked people who weigh something, the heaviest BENCH_CONSTANT_MAX (a light one comes up by its keys). */
export function benchConstant(state) {
  return new Set(
    state.entities
      .filter((e) => e.kind === "person" && e.status === "active" && e.link && !e.noReturn && weightOf(e) >= 1)
      .sort((a, b) => weightOf(b) - weightOf(a) || (b.at || 0) - (a.at || 0))
      .slice(0, BENCH_CONSTANT_MAX)
      .map((e) => e.id),
  );
}

/**
 * Write the chat's world book from the state: one entry per record, keyed by the record's
 * uid (assigned here once and kept). Entries the DM did not make (memo not "world:") stay.
 */
export function writeBook(fsx, state, title) {
  const path = "lorebooks/" + state.bookId + ".json";
  const old = readJson(fsx, path, null);
  const book = isObj(old) ? old : {};
  const entries = arr(book.entries).filter(isObj);
  const own = new Map();
  const others = [];
  for (const en of entries) {
    const m = /^world:([a-z]\d+)/.exec(str(en.memo));
    if (m) own.set(m[1], en);
    else others.push(en);
  }
  let next = entries.reduce((n, en) => Math.max(n, Number.isInteger(en.uid) ? en.uid : 0), 0) + 1;
  const constant = benchConstant(state);
  const ours = state.entities.map((e) => {
    if (!e.uid) e.uid = next++;
    return entryOf(e, e.uid, own.get(e.id), constant.has(e.id));
  });
  writeJson(fsx, path, {
    ...book,
    id: state.bookId,
    name: str(book.name) || "World" + (title ? ": " + title : ""),
    ownerChatId: state.chatId,
    globalActive: false,
    linkedCharacterIds: [],
    settings: isObj(book.settings) ? book.settings : { ...BOOK_SETTINGS },
    formatTemplate: typeof book.formatTemplate === "string" ? book.formatTemplate : "",
    entries: [...others, ...ours],
  });
}

/** The chat's meta names its world book (the engine plugin scans it from there). */
function bindBook(fsx, chatId, meta, bookId) {
  if (meta.worldBookId === bookId) return;
  writeJson(fsx, "chats/" + chatId + ".meta.json", { ...meta, worldBookId: bookId });
}

// ---------- start: building a world (P3 stage 3) ----------
// The DM learns the world from the chat's cards and their books (user, 2026-10-18: it learns from
// card lore, never copies it). The text is cut into chunks a small context window can read; each chunk
// is one call that returns the same "add" list as a run, merged by name. Recipes say what to look for;
// built-ins live in code, a file world/recipes/<id>.json of the same id replaces one, other ids add one.
const RECIPE_DIR = "world/recipes/";
const RECIPE_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const CHUNK_MAX = 6000;
const SOURCE_MAX = 60000;
const QUESTIONS_MAX = 8;
const SECTIONS_MAX = 6;
const ANSWER_MAX = 400;

const BUILTIN_RECIPES = [
  {
    id: "from-cards",
    name: "From the cards",
    description: "Reads the cards, then invents the setting, the people and the trouble around them.",
    mode: "invent",
    questions: [],
    sections: [
      { id: "setting", kinds: ["place", "group"], max: 6, prompt: "Invent the setting these characters live in: the main places where their days go and the groups and powers around them (families, schools, guilds, gangs, authorities). Put the customs and history that shape daily life into the text of the place or group they belong to." },
      { id: "people", kinds: ["person"], max: 5, prompt: "Invent the other people of this world who will meet these characters: allies, rivals, someone who owes or fears them. Each one wants something." },
      { id: "trouble", kinds: ["group", "thing"], max: 4, prompt: "Invent what can go wrong for these characters: a threat, a secret or a danger, each as a group (who is behind it, what they hide), and at most one object that matters to the story, with its reason." },
    ],
    fronts: { count: 2, prompt: "Invent the powers that want something from these characters or this place and will move off screen." },
    cast: { factions: 3, per: 2, prompt: "" },
  },
  {
    id: "interview",
    name: "Interview",
    description: "A few questions about the story you want; the DM builds a world around the cards from your answers.",
    mode: "invent",
    questions: [
      { id: "genre", text: "Genre", options: ["fantasy", "dark fantasy", "historical", "modern", "science fiction", "horror", "slice of life"] },
      { id: "conflict", text: "What is at stake", options: ["survival", "power", "love", "a secret", "revenge", "a journey"] },
      { id: "tone", text: "Tone", options: ["light", "warm", "tense", "grim", "absurd"] },
      { id: "scale", text: "Scale", options: ["one house", "a village", "a city", "a country", "a whole world"] },
      { id: "extra", text: "Anything else the world must have" },
    ],
    sections: [
      { id: "places", kinds: ["place"], max: 5, prompt: "Invent the places of this world that the story will need, fitting the answers and the cards." },
      { id: "people", kinds: ["person", "group"], max: 6, prompt: "Invent the people and groups who live in this world and matter to the characters, fitting the answers and the cards." },
      { id: "facts", kinds: ["thing"], max: 5, prompt: "Invent the few things this world's story can lean on (a clue, a weapon, a gift, a promise); each needs its reason. Customs, dangers and history belong in the text of the places and groups, not here." },
    ],
    fronts: { count: 3, prompt: "Invent the powers that want something in this world and will move off screen." },
    cast: { factions: 3, per: 2, prompt: "" },
  },
];

function cleanRecipe(raw, id) {
  if (!isObj(raw)) return null;
  const questions = arr(raw.questions).filter(isObj).slice(0, QUESTIONS_MAX).map((q, i) => ({
    id: RECIPE_ID.test(str(q.id)) ? str(q.id) : "q" + (i + 1),
    text: cut(str(q.text), 200),
    ...(arr(q.options).length ? { options: arr(q.options).map(str).filter(Boolean).slice(0, 12).map((o) => cut(o, 80)) } : {}),
    ...(str(q.default) ? { default: cut(str(q.default), ANSWER_MAX) } : {}),
  })).filter((q) => q.text);
  const sections = arr(raw.sections).filter(isObj).slice(0, SECTIONS_MAX).map((s, i) => ({
    id: RECIPE_ID.test(str(s.id)) ? str(s.id) : "s" + (i + 1),
    kinds: arr(s.kinds).filter((k) => WRITE_KINDS.includes(k)).length ? arr(s.kinds).filter((k) => WRITE_KINDS.includes(k)) : WRITE_KINDS,
    max: clamp(Math.round(num(s.max)) || SECTION_MAX, 1, SECTION_MAX),
    prompt: cut(str(s.prompt), 1000),
  })).filter((s) => s.prompt);
  if (!sections.length) return null;
  const f = isObj(raw.fronts) ? raw.fronts : {};
  const c = isObj(raw.cast) ? raw.cast : {};
  return {
    id, name: cut(str(raw.name), NAME_LEN) || id, description: cut(str(raw.description), DESC_LEN), mode: raw.mode === "invent" ? "invent" : "learn", questions, sections,
    fronts: { count: clamp(Math.round(num(f.count)), 0, FRONTS_MAX), prompt: cut(str(f.prompt), 1000) },
    // the cast deck (#424, step 4): how many factions a Start writes new people for, how many each, and the recipe's own words for it
    cast: { factions: c.factions === undefined ? 3 : clamp(Math.round(num(c.factions)), 0, CAST_FACTIONS_MAX), per: c.per === undefined ? DEFAULT_SETTINGS.castPer : clamp(Math.round(num(c.per)), 1, CAST_PER_MAX), prompt: cut(str(c.prompt), 1000) },
  };
}

/** Every recipe: the built-ins (a file of the same id replaces one), then the player's own files. */
export function listRecipes(fsx) {
  const out = BUILTIN_RECIPES.map((r) => ({ ...cleanRecipe(readJson(fsx, RECIPE_DIR + r.id + ".json", null), r.id) || r, builtin: true }));
  let files = [];
  try {
    files = fsx.list(RECIPE_DIR.slice(0, -1)).filter((f) => f.endsWith(".json"));
  } catch {}
  for (const f of files.sort()) {
    const id = f.slice(0, -5);
    if (!RECIPE_ID.test(id) || out.some((r) => r.id === id)) continue;
    const r = cleanRecipe(readJson(fsx, RECIPE_DIR + f, null), id);
    if (r) out.push({ ...r, builtin: false });
  }
  return out;
}

export const recipeOf = (fsx, id) => listRecipes(fsx).find((r) => r.id === id) || null;

const cardOf = (fsx, id) => {
  const c = readJson(fsx, "characters/" + id + "/card.json", null);
  return isObj(c) ? (isObj(c.data) && !str(c.name) ? { ...c.data, studio: c.studio } : c) : null;
};

/** The ids of a card's or a group's books: embedded first, then linked. */
function booksOf(holder) {
  const s = isObj(holder && holder.studio) ? holder.studio : holder || {};
  return [s.embeddedLorebookId, ...arr(s.linkedLorebookIds)].filter((id) => typeof id === "string" && CHAT_ID.test(id));
}

/**
 * What the DM reads to learn the world: each card's description, personality and scenario, the group's
 * scenario, then the enabled entries of their books (each book once; the chat's own world book never).
 * One part per text, labelled; `cardIds` limits it to those of the chat's cards.
 */
export function startSources(fsx, meta, cardIds) {
  const ids = memberIds(fsx, meta).filter((id) => !Array.isArray(cardIds) || !cardIds.length || cardIds.includes(id));
  const parts = [];
  const books = [];
  const seen = new Set([str(meta.worldBookId)]);
  const addBooks = (list) => {
    for (const id of list) {
      if (seen.has(id)) continue;
      seen.add(id);
      books.push(id);
    }
  };
  for (const id of ids) {
    const card = cardOf(fsx, id);
    if (!card) continue;
    const name = str(card.name) || id;
    for (const field of ["description", "personality", "scenario"]) {
      if (str(card[field])) parts.push({ label: name + ": " + field, text: str(card[field]), kind: "card" });
    }
    addBooks(booksOf(card));
  }
  if (meta.groupId) {
    const group = readJson(fsx, "groups/" + meta.groupId + ".json", null);
    if (isObj(group)) {
      if (str(group.scenario)) parts.push({ label: (str(group.name) || "group") + ": scenario", text: str(group.scenario), kind: "card" });
      addBooks(booksOf(group));
    }
  }
  for (const id of books) {
    const book = readJson(fsx, "lorebooks/" + id + ".json", null);
    if (!isObj(book) || str(book.ownerChatId)) continue;
    for (const e of arr(book.entries)) {
      if (!isObj(e) || e.enabled === false || !str(e.content)) continue;
      const title = str(e.title) || arr(e.keys).map(str).filter(Boolean).slice(0, 3).join(", ");
      parts.push({ label: (str(book.name) || id) + (title ? ": " + title : ""), text: str(e.content), kind: "lore", title });
    }
  }
  let total = 0;
  return parts.filter((p) => (total += p.text.length) <= SOURCE_MAX);
}

const BRIEF_FIELD = { description: 900, personality: 500, scenario: 500 };
const BRIEF_LORE = 40;
/**
 * What an inventing recipe reads instead of every chunk: each card's fields cut short, and only the titles of
 * its books' entries (what already exists, so the new records agree with it). One text of at most `max`
 * characters: a small context window reads it whole, and the calls do not repeat per chunk.
 */
export function castBrief(parts, max = CHUNK_MAX) {
  const own = [];
  for (const p of parts) {
    if (p.kind === "lore") continue;
    const field = /: (description|personality|scenario)$/.exec(p.label);
    own.push("[" + p.label + "]\n" + cut(p.text, field ? BRIEF_FIELD[field[1]] : BRIEF_FIELD.scenario));
  }
  const titles = [...new Set(parts.filter((p) => p.kind === "lore" && p.title).map((p) => p.title))].slice(0, BRIEF_LORE);
  const head = own.join("\n\n");
  const tail = titles.length ? "Already in the cards' lorebooks (do not repeat or retell; stay consistent with them):\n" + titles.map((t) => "- " + t).join("\n") : "";
  const text = [head, tail].filter(Boolean).join("\n\n");
  return text.length <= max ? text : cut(head, max);
}

/** Split a text longer than max at paragraph, then sentence, then word ends. */
function splitText(text, max) {
  const out = [];
  let rest = text;
  while (rest.length > max) {
    const head = rest.slice(0, max);
    let at = head.lastIndexOf("\n\n");
    if (at < max / 3) at = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf("\n")) + 1;
    if (at < max / 3) at = head.lastIndexOf(" ");
    if (at < max / 3) at = max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * The sources packed into chunks of at most `max` characters, cut between parts; a part too long on its
 * own is split at paragraph or sentence ends, each piece keeping its label.
 */
export function chunkSources(parts, max = CHUNK_MAX) {
  const chunks = [];
  let cur = "";
  const push = (block) => {
    if (cur && cur.length + 2 + block.length > max) {
      chunks.push(cur);
      cur = "";
    }
    cur = cur ? cur + "\n\n" + block : block;
  };
  for (const p of parts) {
    const head = "[" + p.label + "]\n";
    if (head.length + p.text.length <= max) push(head + p.text);
    else {
      // the first piece fills what is left of the open chunk when that is worth a piece
      const room = cur ? max - cur.length - 2 - head.length : 0;
      let rest = p.text;
      if (room >= 1000) {
        const [first] = splitText(rest, room);
        push(head + first);
        rest = rest.slice(rest.indexOf(first) + first.length).trim();
      }
      for (const piece of splitText(rest, max - head.length)) push(head + piece);
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** A step's `chunk` when it reads the brief (castBrief) instead of a chunk of the cards. */
const BRIEF_STEP = -2;
const BUILD_RULES = [
  "You build the world of a roleplay story before it starts. Another model will write the story; it reads your record when a name comes up.",
  "Rules:",
  "- Learn from the texts you are given; write each record in your own short words. Never copy a text whole.",
  "- Do not record the user's character or the characters listed as having their own cards: they are kept elsewhere.",
  "- One record per person, place, group or thing. Its text is one to three short sentences in the present tense: what someone needs to know when the name comes up (who or what it is, where, how it stands toward the characters).",
  "- A custom, a law, a piece of history, a secret or a rumour is not a record of its own: say it in the text of the place, group or person it belongs to.",
  "- Never repeat a record that is already in the world record; to add to one, use its exact name.",
  "- aliases: the keys that bring this record into the story: 2 to 5 short words or phrases the story will use when it comes up again: a short name, how the characters call it, its main word (for \"IKEA dresser\": \"dresser\"; for \"Ava's house\": \"Ava's place\", \"Ava's home\"), exactly as the story would spell them. Never a word that comes up in every scene (room, door, day, man).",
  "- Only the JSON keys and kind values are English.",
];
const BUILD_OUTPUT = [
  "Output: one JSON object and nothing else, no code fences:",
  '{"add":[{"kind":"person|place|group|thing","name":"...","aliases":["..."],"text":"...","why":"clue|hidden|promise|gift|weapon|contested"}],"summary":"one short line"}',
  "why is only for things.",
];
const FRONTS_OUTPUT = [
  "Output: one JSON object and nothing else, no code fences:",
  '{"fronts":[{"op":"add","name":"...","goal":"what it wants, one sentence","size":6}],"summary":"one short line"}',
];
// An inventing recipe (from the cards, interview): the cards are the input, the world is new. The learning
// rules above stay for a recipe that records what texts say (a player's own file without `mode: "invent"`).
const INVENT_RULES = [
  "You build the world of a roleplay story before it starts. Another model will write the story; it reads your record when a name comes up.",
  "The cards describe the characters. Your job is to INVENT the world around them, not to retell them.",
  "Rules:",
  "- First decide the genre and the tone the cards imply. Every record you invent must fit them.",
  "- Never record what a card or a lorebook already says: those texts stay as they are. Use their names and facts so that your records agree with them, never contradict them.",
  "- Do not record the user's character or the characters listed as having their own cards: they are kept elsewhere.",
  "- Every record must touch at least one character: someone goes there, belongs to it, fears it, owes it or is hunted by it. Its text says how.",
  "- Give each record something to play with: a want, a secret, a danger or a rule. Not a bare description.",
  "- No trivia: not furniture, clothes or things a character just carries, unless the thing is the point (a clue, a weapon, a promise).",
  "- One record per person, place, group or thing. Its text is one to three short sentences in the present tense.",
  "- A custom, a law, a piece of history, a secret or a rumour is not a record of its own: say it in the text of the place, group or person it belongs to.",
  "- Never repeat a record that is already in the world record; to add to one, use its exact name.",
  BUILD_RULES.find((r) => r.startsWith("- aliases:")),
  "- Only the JSON keys and kind values are English.",
];
export const BUILD_SYSTEM = [...BUILD_RULES, ...BUILD_OUTPUT].join("\n");
export const INVENT_SYSTEM = [...INVENT_RULES, ...BUILD_OUTPUT].join("\n");
const buildSystemFor = (recipe) => (recipe && recipe.mode === "invent" ? INVENT_SYSTEM : BUILD_SYSTEM);
export const FRONTS_SYSTEM = [
  "You build the world of a roleplay story before it starts. From the world record, name the fronts: factions, threats and powers with a goal that will move off screen, each with a clock of 4, 6 or 8 segments (bigger = slower).",
  "- Build them only from the record; a front's name may be a record's name.",
  "- Only the JSON keys are English.",
  ...FRONTS_OUTPUT,
].join("\n");

const answerLines = (recipe, answers) =>
  recipe.questions
    .map((q) => [q.text, cut(str(isObj(answers) ? answers[q.id] : "") || str(q.default), ANSWER_MAX)])
    .filter(([, a]) => a)
    .map(([q, a]) => "- " + q + ": " + a);

/** The user message of one build call: a recipe section over one chunk (or over the answers alone). */
export function buildInput({ cards, userName, entities, section, chunk, recipe, answers, lang }) {
  const known = entities.filter((e) => e.status === "active");
  const said = answerLines(recipe, answers);
  return [
    "Characters with their own cards (do not record): " + (cards.length ? cards.join(", ") : "none") + ".",
    "The user's character (do not record): " + (userName || "the user") + ".",
    "World record so far" + (known.length ? "\n" + known.map(entityLine).join("\n") : ": empty."),
    ...(said.length ? ["What the player wants\n" + said.join("\n")] : []),
    "Task: " + section.prompt + " Kinds: " + section.kinds.join(", ") + ". At most " + section.max + " records.",
    "Write names and text in " + (lang || "the language of the texts below") + ".",
    ...(chunk ? [(recipe.mode === "invent" ? "The cards (what already exists: agree with it, do not retell it)\n" : "Texts to learn from\n") + chunk] : []),
  ].join("\n\n");
}

/** The user message of the fronts call. */
export function frontsInput({ entities, recipe, answers, lang }) {
  const said = answerLines(recipe, answers);
  return [
    "World record\n" + (entities.filter((e) => e.status === "active").map(entityLine).join("\n") || "empty"),
    ...(said.length ? ["What the player wants\n" + said.join("\n")] : []),
    "Task: " + (recipe.fronts.prompt || "Name the fronts.") + " At most " + recipe.fronts.count + " fronts.",
    "Write names and goals in " + (lang || "the language of the record") + ".",
  ].join("\n\n");
}

/** The calls a start makes, in order: one per (section, chunk), then the fronts call when the recipe asks for any, then the cast deck's calls (`castParts`). */
export function startPlan(recipe, chunks, withFronts, castParts = 0) {
  const steps = [];
  for (const s of recipe.sections) {
    // an inventing recipe reads the brief once per section, not every chunk of the cards
    if (recipe.mode === "invent") steps.push({ section: s.id, chunk: chunks.length ? BRIEF_STEP : -1 });
    else if (chunks.length) for (let i = 0; i < chunks.length; i++) steps.push({ section: s.id, chunk: i });
    else steps.push({ section: s.id, chunk: -1 });
  }
  if (withFronts && recipe.fronts.count > 0) steps.push({ fronts: true });
  // the cast deck's cards: one call per CAST_PART factions, after the fronts so the factions are there
  for (let i = 0; i < castParts; i++) steps.push({ cast: true, part: i });
  return steps;
}


// ---------- start: the draft, the deck, the library, carry, the chat's own opening ----------
// A start writes a draft (user, 2026-10-19: free models invent extras, so the player removes what they do
// not want, then accepts). One route pass = one build call (two-phase); the app calls again until done.
// DECK_MIN is a request to the model (the deck prompt says "write DECK_MIN to DECK_MAX events"), not a limit: a reply
// with fewer cards is kept as it came. deckRoute tells the app (`short`) so it can say so; DECK_MAX is the real cap.
const DECK_MIN = 8;
const DECK_MAX = 12;
const LIBRARY_DIR = "world/library/";
const WORLD_ID = /^w-[a-z0-9]{4,40}$/;
const LIBRARY_MAX = 100;
const SCENARIO_MAX = 4000;
const OPENING_MAX = 6000;
const LANG_MAX = 40;

export const DECK_SYSTEM = [
  "You build the world of a roleplay story. From the world record and its fronts, write a deck of events that can happen later in the story: each one concrete thing that happens in a scene (a visitor, a hook, a complication, news that cannot be ignored), built from the record and the fronts, never from nowhere.",
  "- One or two plain sentences each: what happens, who and where. Never write the story itself.",
  "- Mix small and big ones. They must fit the genre and the tone of the world.",
  "- Only the JSON keys are English.",
  "Output: one JSON object and nothing else, no code fences:",
  '{"deck":[{"text":"..."}],"summary":"one short line"}',
].join("\n");

export const OPENING_SYSTEM = [
  "You set up a new roleplay chat in a world that already exists. Write the chat's scenario (where and how the story starts: the situation, not the backstory) and its first message (the opening scene, written as the story's narrator or the character, in the card's style, ending where the user's character can act).",
  "- Build both from the world record and the cards; the card's own scenario and first message show the style, do not repeat them.",
  "- Never write what the user's character says, does or feels. Refer to them as {{user}} and to the card's character as {{char}}.",
  "- Only the JSON keys are English.",
  "Output: one JSON object and nothing else, no code fences:",
  '{"scenario":"...","opening":"..."}',
].join("\n");

function cleanCard(c, i) {
  const text = cut(str(isObj(c) ? c.text : c), EVENT_MAX);
  return text ? { id: isObj(c) && /^e\d{1,6}$/.test(str(c.id)) ? str(c.id) : "e" + (i + 1), text } : null;
}
export function cleanDeck(v) {
  const out = [];
  for (const c of arr(v)) {
    const x = cleanCard(c, out.length);
    if (x && !out.some((y) => y.id === x.id)) out.push(x);
    if (out.length >= DECK_MAX * 2) break;
  }
  return out;
}

// ---------- the cast deck (#424, step 4): cards of people the story has not met ----------
// A card: who (name, aliases), the faction it belongs to, the one person who already exists that ties it to the story (tie),
// what it wants, and its text (look, character, goals, a hook for how it comes in). It is not in the prompt until it is drawn.
export const CAST_CARDS_MAX = 24;
export const CAST_PER_MAX = 4;
export const CAST_FACTIONS_MAX = 6;
const CAST_TEXT_MAX = 1200;
const CAST_WANT_MAX = 200;
const CAST_ALIASES_MAX = 4;
const CAST_ID = /^c\d{1,6}$/;
const CAST_LOG_MAX = 40;

function cleanCastCard(c) {
  if (!isObj(c)) return null;
  const name = cut(str(c.name), NAME_MAX);
  const text = cut(str(c.text), CAST_TEXT_MAX);
  if (!name || !text) return null;
  return {
    id: CAST_ID.test(str(c.id)) ? str(c.id) : "",
    name,
    aliases: cleanAliases(c.aliases, name).slice(0, CAST_ALIASES_MAX),
    faction: cut(str(c.faction), NAME_MAX),
    tie: cut(str(c.tie), NAME_MAX),
    want: cut(str(c.want), CAST_WANT_MAX),
    text,
    ...(RELATIONS.includes(c.relation) ? { relation: c.relation } : {}),
  };
}

/** The next free card id ("c1", "c2"...) of a list. */
export const nextCastId = (list) => "c" + (arr(list).reduce((m, c) => Math.max(m, Number(str(c && c.id).slice(1)) || 0), 0) + 1);

/** The cards of the cast deck: each with a name and a text, a name once, an id each (a missing or doubled id gets a new one), at most CAST_CARDS_MAX. */
export function cleanCast(v) {
  const out = [];
  for (const raw of arr(v)) {
    const c = cleanCastCard(raw);
    if (!c || out.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) continue;
    if (!c.id || out.some((x) => x.id === c.id)) c.id = nextCastId(out);
    out.push(c);
    if (out.length >= CAST_CARDS_MAX) break;
  }
  return out;
}

/** One line of the refill log: when, at which reply, how many cards came, for which factions, an error code if the call failed, and whether the player asked for it. */
function cleanCastLine(l) {
  if (!isObj(l) || !Number.isFinite(l.at)) return null;
  return {
    at: l.at,
    n: Number.isInteger(l.n) && l.n >= 0 ? l.n : 0,
    added: Number.isInteger(l.added) && l.added >= 0 ? l.added : 0,
    factions: arr(l.factions).map((x) => cut(str(x), NAME_MAX)).filter(Boolean).slice(0, CAST_FACTIONS_MAX * 2),
    ...(str(l.error) ? { error: cut(str(l.error), 40) } : {}),
    ...(l.forced === true ? { forced: true } : {}),
  };
}

// the refill (#424, step 4): below this many cards a DM run asks the app for one background build call; after a try, this many replies pass before the next
const CAST_REFILL_MIN = 3;
const CAST_REFILL_EVERY = 10;

/** Is the deck due for a refill: the switch and the cast are on, fewer than CAST_REFILL_MIN cards are left, there is a faction to write for, and the last try is CAST_REFILL_EVERY replies old (or there was none). */
export function refillDue(state, replies) {
  const freq = state.settings.level !== "off" && CAST_FREQ.includes(state.settings.cast) ? state.settings.cast : "off";
  if (freq === "off" || state.settings.castDeck !== true) return false;
  if (arr(state.cast).length >= CAST_REFILL_MIN) return false;
  if (!castFactions(state.entities, state.fronts).length) return false;
  return !state.castBuild || replies - state.castBuild.n >= CAST_REFILL_EVERY;
}

/** What a Start asks of the cast deck: how many factions, how many people each, how long a card is. */
export function cleanCastOpts(o) {
  const b = isObj(o) ? o : {};
  return {
    factions: Number.isFinite(Number(b.factions)) ? clamp(Math.round(Number(b.factions)), 1, CAST_FACTIONS_MAX) : 3,
    per: Number.isFinite(Number(b.per)) ? clamp(Math.round(Number(b.per)), 1, CAST_PER_MAX) : DEFAULT_SETTINGS.castPer,
    len: CAST_LENS.includes(b.len) ? b.len : DEFAULT_SETTINGS.castLen,
  };
}

function cleanDraft(d) {
  if (!isObj(d) || !str(d.recipe)) return null;
  const entities = arr(d.entities).map(cleanEntity).filter(Boolean);
  const fronts = arr(d.fronts).map(cleanFront).filter(Boolean);
  const steps = arr(d.steps).filter(isObj).slice(0, 60).map((s) => (s.fronts ? { fronts: true } : s.deck ? { deck: true } : s.bench ? { bench: true } : s.cast ? { cast: true, part: clamp(Math.round(num(s.part)), 0, CAST_FACTIONS_MAX) } : { section: str(s.section), chunk: Math.round(Number(s.chunk)) }));
  return {
    recipe: str(d.recipe),
    cardIds: arr(d.cardIds).filter((id) => typeof id === "string" && CHAT_ID.test(id)),
    answers: isObj(d.answers) ? Object.fromEntries(Object.entries(d.answers).map(([k, v]) => [k, cut(str(v), ANSWER_MAX)]).filter(([, v]) => v)) : {},
    lang: cut(str(d.lang), LANG_MAX),
    steps,
    done: clamp(Math.round(num(d.done)), 0, steps.length),
    entities, nextId: Math.max(Number.isInteger(d.nextId) ? d.nextId : 1, entities.length + 1),
    fronts, nextFront: Math.max(Number.isInteger(d.nextFront) ? d.nextFront : 1, fronts.length + 1),
    deck: cleanDeck(d.deck),
    cast: cleanCast(d.cast),
    ...(isObj(d.castOpts) ? { castOpts: cleanCastOpts(d.castOpts) } : {}),
    at: num(d.at) || Date.now(),
    ...(isObj(d.error) && str(d.error.message) ? { error: cleanError(d.error) } : {}),
  };
}

const draftView = (d) => (d ? { recipe: d.recipe, cardIds: d.cardIds, lang: d.lang, total: d.steps.length, done: d.done, entities: d.entities, fronts: d.fronts, deck: d.deck, cast: d.cast, castOpts: d.castOpts || null, at: d.at, error: d.error || null } : null);

/** The answer of a build call: the parsed object, or an error to keep (one retry on a rate limit or a reply all thinking). */
function buildResult(host, key, ask, stash) {
  const retry = stash.retry === true;
  const r = host.llm.results[retry ? key + "_retry" : key];
  if (!r) {
    ask(retry ? key + "_retry" : key);
    return { pending: { __llmPending: true, stash: { ...stash, retry, started: Number(stash.started) || Date.now() } } };
  }
  const limit = limitOf(r);
  if (!retry && (r.error ? isRateLimit(r) : thinkingOnly(r) && !(limit && limit.fromModel))) {
    ask(key + "_retry", thinkingOnly(r) ? Math.min(RETRY_MAX, 6000) : undefined);
    return { pending: { __llmPending: true, stash: { ...stash, retry: true, started: Number(stash.started) || Date.now() } } };
  }
  const usage = isObj(r.usage) ? { input: num(r.usage.input), output: num(r.usage.output), cost: r.usage.priced === false ? 0 : num(r.usage.costTotal) } : null;
  const run = { model: str(r.model) && r.model !== "error" ? str(r.model) : "", ms: Math.round(num(r.genTimeMs) || Date.now() - (Number(stash.started) || Date.now())), ...(usage ? { usage } : {}), ...(limit ? { limit } : {}), ...(retry ? { retried: true } : {}) };
  if (r.error || !str(r.text)) return { run, usage, error: classifyError(r, limit) };
  const out = parseReply(r.text) || firstJson(r.text);
  if (!out) return { run, usage, error: { code: "not-json", message: "The build model's reply was not JSON: pick a stronger build model.", details: cut(str(r.text), 1200) } };
  return { run, usage, out };
}

/** The first JSON object of a text, whatever keys it has (the deck and opening replies have none of the run's). */
function firstJson(text) {
  const s = String(text || "").replace(/```(?:json)?/gi, "");
  for (let i = s.indexOf("{"); i >= 0; i = s.indexOf("{", i + 1)) {
    const o = firstObject(s, i);
    if (!o) return null;
    try {
      const v = JSON.parse(o);
      if (isObj(v)) return v;
    } catch {}
  }
  return null;
}

/** Tokens of a build call count with the chat's DM; the run log shows it with its reason. */
function countBuild(state, built, reason, changes) {
  const u = built.usage;
  const t = state.usage || { input: 0, output: 0, cost: 0, runs: 0 };
  state.usage = { input: t.input + (u ? u.input : 0), output: t.output + (u ? u.output : 0), cost: t.cost + (u ? u.cost : 0), runs: t.runs + 1 };
  state.log = [...state.log, { at: Date.now(), reason, ...built.run, key: state.lastKey, changes, fronts: 0, summary: "", ...(built.error ? { error: cleanError(built.error).code } : {}) }].slice(-LOG_MAX);
}

// keepMacros: the opening's draft is saved as the chat's own first message, so its input keeps {{user}} and {{char}} raw (#156)
function buildAsk(host, fsx, cfg, meta, systemPrompt, content, opts = {}) {
  const pick = buildModel(fsx, cfg, meta);
  return (k, maxTokens) =>
    host.llm.request(k, {
      ...(pick.model ? { model: pick.model } : {}),
      systemPrompt,
      messages: [{ role: "user", content: opts.keepMacros ? content : expandNamesFor(fsx, meta, content) }],
      ...callParams(fsx, cfg, meta, maxTokens || Math.max(cfg.maxTokens, 2000)),
    });
}

/** The draft's records merged by name; never one the world already has. */
function mergeDraft(draft, state, out, section, ctx) {
  const known = (name) => !!findEntity(state.entities, { name });
  const adds = arr(out.add).filter((a) => isObj(a) && !known(cut(str(a.name), NAME_MAX)))
    .map((a) => ({ ...a, kind: section.kinds.includes(a.kind) ? a.kind : section.kinds[0] }))
    .slice(0, section.max);
  const pseudo = { entities: draft.entities, nextId: draft.nextId };
  const changes = applyReport(pseudo, { add: adds }, ctx);
  draft.entities = pseudo.entities.map((e) => (/^n\d/.test(e.id) ? { ...e, id: "d" + e.id.slice(1) } : e));
  draft.nextId = pseudo.nextId;
  return changes;
}

function deckFrom(out, max) {
  return arr(out.deck).map((c, i) => cleanCard(c, i)).filter(Boolean).slice(0, max);
}

const nextDeckId = (deck) => deck.reduce((m, c) => Math.max(m, Number(c.id.slice(1)) || 0), 0) + 1;

// A world can also be built without a chat (user, 2026-10-19: "New world" in the Worlds tab): its draft
// lives in world/library/<id>.draft.json until it is accepted into the library as <id>.json.
const draftPath = (id) => LIBRARY_DIR + id + ".draft.json";
const NEW_LEVELS = ["chronicler", "living", "director", "antagonist", "chaos"];

/** What a start works on: a chat's world, or a world being built in the library. */
function startTarget(fsx, b) {
  if (str(b.chatId)) {
    const chatId = str(b.chatId);
    if (!CHAT_ID.test(chatId)) return { error: ok({ error: "chatId required" }, 400) };
    const chat = readChat(fsx, chatId);
    if (!chat) return { error: ok({ error: "no such chat" }, 404) };
    const { state } = loadState(fsx, chatId);
    return { chat, meta: chat.meta, state, title: str(chat.meta.title), save: (st) => saveState(fsx, st) };
  }
  let id = str(b.worldId);
  let raw = WORLD_ID.test(id) ? readJson(fsx, draftPath(id), null) : null;
  if (!isObj(raw)) {
    // a new world: only a begin may make one
    if (b.begin !== true || b.newWorld !== true) return { error: ok({ error: "chatId or worldId required" }, 400) };
    if (listWorlds(fsx).length + listBuilding(fsx).length >= LIBRARY_MAX) return { error: ok({ error: "the library is full" }, 409) };
    id = "w-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const level = NEW_LEVELS.includes(str(b.level)) ? str(b.level) : "living";
    raw = { name: cut(str(b.name), NAME_LEN) || "World", description: cut(str(b.description), DESC_LEN), at: Date.now(), settings: { level, ...(str(b.profile) ? { profile: str(b.profile) } : {}) } };
  }
  const state = normalizeState(raw, id);
  const head = { name: cut(str(raw.name), NAME_LEN) || "World", description: cut(str(raw.description), DESC_LEN), at: num(raw.at) || Date.now() };
  const cardIds = state.draft ? state.draft.cardIds : arr(b.cardIds).filter((x) => typeof x === "string" && CHAT_ID.test(x));
  return { worldId: id, head, meta: { cardIds }, state, title: head.name, save: (st) => writeJson(fsx, draftPath(id), { ...st, ...head }) };
}

/** Worlds being built without a chat, for the Worlds list. */
export function listBuilding(fsx) {
  let files = [];
  try {
    files = fsx.list(LIBRARY_DIR.slice(0, -1)).filter((f) => f.endsWith(".draft.json"));
  } catch {}
  const out = [];
  for (const f of files) {
    const id = f.slice(0, -".draft.json".length);
    const raw = WORLD_ID.test(id) ? readJson(fsx, LIBRARY_DIR + f, null) : null;
    const d = isObj(raw) ? cleanDraft(raw.draft) : null;
    if (d) out.push({ id, name: cut(str(raw.name), NAME_LEN) || "World", at: num(raw.at), level: cleanSettings(raw.settings).level, done: d.done, total: d.steps.length, error: d.error || null });
  }
  return out.sort((a, b) => b.at - a.at);
}

function startRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const t = startTarget(fsx, b);
  if (t.error) return t.error;
  const { state, meta } = t;
  const chat = t.chat || { meta };
  const cfg = loadConfig(fsx);
  if (b.begin === true) {
    const recipe = recipeOf(fsx, str(b.recipe) || "from-cards");
    if (!recipe) return ok({ error: "no such recipe" }, 404);
    const cardIds = arr(b.cardIds).filter((id) => typeof id === "string" && CHAT_ID.test(id));
    const usesCards = recipe.id === "from-cards" || b.fromCards === true;
    const chunks = usesCards ? chunkSources(startSources(fsx, t.chat ? meta : { cardIds }, cardIds)) : [];
    if (usesCards && !chunks.length) return ok({ error: "the chosen cards have nothing to learn from", code: "no-text" }, 409);
    const profile = profileFor(fsx, state.settings);
    const withDeck = b.deck === true || (b.deck !== false && !!(profile && profile.options && profile.options.deck));
    // the cast deck (#424, step 4): on unless the player or the profile says no; the numbers are the player's, else the recipe's
    const castAsk = isObj(b.cast) ? b.cast : {};
    const withCast = b.cast === false ? false : typeof castAsk.on === "boolean" ? castAsk.on : !(profile && profile.options && profile.options.castDeck === false);
    const castOpts = cleanCastOpts({ factions: castAsk.factions !== undefined ? castAsk.factions : recipe.cast.factions, per: castAsk.per !== undefined ? castAsk.per : recipe.cast.per, len: castAsk.len });
    const castParts = withCast && castOpts.factions > 0 ? Math.ceil(castOpts.factions / CAST_PART) : 0;
    const steps = startPlan(recipe, chunks, state.settings.level !== "chronicler", castParts);
    if (withDeck) steps.push({ deck: true });
    // the people the cards' lorebooks already have are adopted as linked records (#424); before the fronts, so they can use them
    if (usesCards && b.bench !== false && benchEntries(fsx, t.chat ? meta : { cardIds }).length) {
      const at = steps.findIndex((x) => x.fronts);
      steps.splice(at < 0 ? steps.length : at, 0, { bench: true });
    }
    state.draft = cleanDraft({ recipe: recipe.id, cardIds, answers: b.answers, lang: b.lang, steps, done: 0, ...(castParts ? { castOpts } : {}), at: Date.now() });
    t.save(state);
    return ok({ ok: true, ...(t.worldId ? { worldId: t.worldId } : {}), draft: draftView(state.draft) });
  }
  const draft = cleanDraft(state.draft);
  // peek: read a world's draft without running a step (the Worlds tab reopens one being built)
  if (b.peek === true) return ok({ ok: true, draft: draft ? draftView(draft) : null });
  if (!draft) return ok({ error: "no start in progress" }, 409);
  if (draft.done >= draft.steps.length) return ok({ ok: true, draft: draftView(draft) });
  const recipe = recipeOf(fsx, draft.recipe);
  if (!recipe) return ok({ error: "no such recipe" }, 404);
  const step = draft.steps[draft.done];
  const cards = cardNames(fsx, chat.meta);
  const userName = userNameOf(fsx, chat.meta);
  const stash = isObj(req.stash) ? req.stash : {};
  let system;
  let content;
  let benchEntriesNow = [];
  let castNow = null;
  if (step.fronts || step.deck || step.bench || step.cast) {
    const entities = [...state.entities, ...draft.entities];
    if (step.cast) {
      // the factions of this part (groups first, then fronts, the first `factions` of them), with who already exists for the ties
      const opts = draft.castOpts || cleanCastOpts({});
      const fronts = [...state.fronts, ...draft.fronts];
      const part = castFactions(entities, fronts).slice(0, opts.factions).slice(step.part * CAST_PART, (step.part + 1) * CAST_PART);
      // a world with fewer factions than asked has nothing to write for this part: no call
      if (!part.length) {
        draft.done++;
        delete draft.error;
        state.draft = draft;
        t.save(state);
        return ok({ ok: true, ...(t.worldId ? { worldId: t.worldId } : {}), draft: draftView(draft) });
      }
      castNow = { index: tieIndex(entities, cards, userName), factions: part, per: opts.per, have: [...arr(state.cast), ...draft.cast].map((c) => c.name), entities };
      system = CAST_SYSTEM;
      content = castInput({ entities, fronts, factions: part, per: opts.per, len: opts.len, index: castNow.index, have: castNow.have, prompt: recipe.cast.prompt, lang: draft.lang });
    } else if (step.bench) {
      benchEntriesNow = benchEntries(fsx, chat.meta);
      system = BENCH_SYSTEM;
      content = benchInput({ entries: benchEntriesNow, userName, cards, lang: draft.lang });
    } else if (step.fronts) {
      system = FRONTS_SYSTEM;
      content = frontsInput({ entities, recipe, answers: draft.answers, lang: draft.lang });
    } else {
      system = DECK_SYSTEM;
      content = deckInput({ entities, fronts: [...state.fronts, ...draft.fronts], lang: draft.lang });
    }
  } else {
    const section = recipe.sections.find((s) => s.id === step.section) || recipe.sections[0];
    const sources = step.chunk >= 0 || step.chunk === BRIEF_STEP ? startSources(fsx, chat.meta, draft.cardIds) : [];
    const chunk = step.chunk === BRIEF_STEP ? castBrief(sources) : step.chunk >= 0 ? chunkSources(sources)[step.chunk] || "" : "";
    content = buildInput({ cards, userName, entities: [...state.entities, ...draft.entities], section, chunk, recipe, answers: draft.answers, lang: draft.lang });
    system = buildSystemFor(recipe);
  }
  const built = buildResult(host, "world_build", buildAsk(host, fsx, cfg, chat.meta, system, content), stash);
  if (built.pending) return built.pending;
  let changes = 0;
  if (!built.error) {
    if (step.bench) {
      // people the world already has are left to it; the rest are drafted as linked records and join the registry when the draft is accepted
      const people = arr(built.out.people).filter((x) => isObj(x) && !findEntity(state.entities, { name: cut(str(x.name), NAME_MAX) }));
      const pseudo = { entities: draft.entities, nextId: draft.nextId };
      const res = applyBench(pseudo, null, benchEntriesNow, { people }, { textMax: state.settings.textMax, skip: [...cards, ...(userName ? [userName] : [])] });
      draft.entities = pseudo.entities.map((e) => (/^n\d/.test(e.id) ? { ...e, id: "d" + e.id.slice(1) } : e));
      draft.nextId = pseudo.nextId;
      changes = res.added.length;
    } else if (step.fronts) {
      const pseudo = { fronts: draft.fronts, nextFront: draft.nextFront, event: null, entities: [] };
      const adds = arr(built.out.fronts).filter((f) => isObj(f) && !state.fronts.some((x) => x.status === "active" && sameName(x.name, str(f.name))))
        .map((f) => ({ ...f, op: "add" })).slice(0, recipe.fronts.count || FRONTS_MAX);
      changes = applyLevel(pseudo, { fronts: adds }, { level: "living", catchingUp: true });
      draft.fronts = pseudo.fronts;
      draft.nextFront = pseudo.nextFront;
    } else if (step.cast) {
      const cardsOut = castFrom(built.out, castNow);
      draft.cast = cleanCast([...draft.cast, ...cardsOut]);
      changes = cardsOut.length;
    } else if (step.deck) {
      const cardsOut = deckFrom(built.out, DECK_MAX);
      if (cardsOut.length) draft.deck = cardsOut.map((c, i) => ({ id: "e" + (i + 1), text: c.text }));
      changes = draft.deck.length;
    } else {
      const section = recipe.sections.find((s) => s.id === step.section) || recipe.sections[0];
      changes = mergeDraft(draft, state, built.out, section, { cards, userName, now: Date.now() });
    }
    draft.done++;
    delete draft.error;
  } else draft.error = cleanError({ at: Date.now(), ...built.error });
  countBuild(state, built, "start", changes);
  state.draft = draft;
  t.save(state);
  return ok({ ok: !built.error, ...(t.worldId ? { worldId: t.worldId } : {}), ...(built.error ? { error: draft.error.message, code: draft.error.code } : {}), draft: draftView(draft) });
}

// ---------- the cast deck's build (#424, step 4) ----------
// One call writes the cards for up to CAST_PART factions. A faction is a group record or a front. Every card names one person who
// already exists (its tie: a record, a card of the chat, the user's character) and wants something of its own. The code reads the
// answer: a name the world already has is skipped, a faction that is not asked for is skipped, a tie that is not found is left empty.
const CAST_PART = 4;
const CAST_LEN_TEXT = { short: "5 to 6 sentences", normal: "6 to 8 sentences", long: "8 to 10 sentences" };

export const CAST_SYSTEM = [
  "You build the world of a roleplay story. Write cards for new people the story has not met yet: each one belongs to a faction of the world and can be brought in later, when the story needs someone new.",
  "- Each person belongs to one of the factions you are asked for (write the faction exactly as given).",
  "- Each person is tied to ONE person who already exists: write that person's name exactly as listed under 'Who already exists'. Say in the text how they know each other (a cousin, a debtor, a rival, a former pupil).",
  "- Each person wants something of their own, besides what the faction wants: give it in 'want', a short phrase that goes after the word 'wants' (for example 'the pass closed before winter').",
  "- 'text': the person's look, character, goals and fears, how they know the tie, and a hook for how they might first enter the story (an errand, a message, a visit). Plain sentences, no story, no lines of dialogue.",
  "- Never contradict the world record or the cards; never reuse a name from the record or the deck. Names and the setting must fit the genre and the tone of the world.",
  "- 'aliases': up to 3 short names or nicknames the story could use. 'relation' to the user's character: ally, family, rival, enemy or neutral.",
  "- Only the JSON keys and the relation words are English.",
  "Output: one JSON object and nothing else, no code fences:",
  '{"cast":[{"faction":"...","name":"...","aliases":["..."],"tie":"...","want":"...","text":"...","relation":"neutral"}]}',
].join("\n");

/** The factions the cast deck writes for: the active group records first, then the active fronts that are not named like one. [{ name, kind, text }] */
export function castFactions(entities, fronts) {
  const out = [];
  const add = (name, kind, text) => {
    if (name && !out.some((x) => sameName(x.name, name))) out.push({ name, kind, text: str(text) });
  };
  for (const e of arr(entities)) if (e.kind === "group" && e.status === "active") add(e.name, "group", e.text);
  for (const f of arr(fronts)) if (f.status === "active") add(f.name, "front", f.goal);
  return out;
}

/** Who already exists, for ties: the chat's cards, the user's character and the active person records. [{ name, names }] */
export function tieIndex(entities, cards, userName) {
  const list = [];
  for (const c of arr(cards)) list.push({ name: c, names: [c] });
  if (userName) list.push({ name: userName, names: [userName] });
  for (const e of arr(entities)) if (e.kind === "person" && e.status === "active") list.push({ name: e.name, names: namesOf(e) });
  return list;
}

/** The name a model wrote as a tie, as the world spells it; "" when nobody who exists goes by it. */
export function tieOf(index, said) {
  const t = str(said).toLowerCase();
  if (!t) return "";
  const hit = arr(index).find((x) => x.names.some((n) => n.toLowerCase() === t));
  return hit ? hit.name : "";
}

/** The user message of a cast call: the record, the fronts, the factions asked for, who exists, who is in the deck, the task. */
export function castInput({ entities, fronts, factions, per, len, index, have, prompt, lang }) {
  const active = arr(fronts).filter((f) => f.status === "active");
  return [
    "World record\n" + (arr(entities).filter((e) => e.status === "active").map(entityLine).join("\n") || "empty"),
    "Fronts" + (active.length ? "\n" + active.map(frontLine).join("\n") : ": none"),
    "Factions to write people for\n" + factions.map((f) => "- " + f.name + " (" + f.kind + ")").join("\n"),
    "Who already exists (a tie is one of these names, exactly)\n" + (arr(index).map((x) => x.name).join(", ") || "nobody"),
    ...(arr(have).length ? ["Already in the deck (do not repeat)\n" + have.join(", ")] : []),
    "Task: " + (prompt ? prompt + " " : "") + "For each faction above write " + per + " new " + (per === 1 ? "person" : "people") + ", " + (CAST_LEN_TEXT[len] || CAST_LEN_TEXT.normal) + " of text each.",
    "Write names and text in " + (lang || "the language of the record") + ".",
  ].join("\n\n");
}

/** The cards of a cast answer: only the factions asked for, at most `per` each, a name the world, the cards or the deck already have is skipped, a tie nobody goes by is left empty. No ids yet. */
export function castFrom(out, ctx) {
  const taken = new Set();
  for (const e of arr(ctx.entities)) for (const x of namesOf(e)) taken.add(x.toLowerCase());
  for (const x of arr(ctx.index)) for (const y of x.names) taken.add(y.toLowerCase());
  for (const x of arr(ctx.have)) taken.add(str(x).toLowerCase());
  const counts = new Map();
  const cards = [];
  for (const raw of arr(isObj(out) ? out.cast : null)) {
    if (!isObj(raw) || cards.length >= ctx.factions.length * ctx.per) continue;
    const said = str(raw.faction).toLowerCase();
    const faction = said ? ctx.factions.find((f) => f.name.toLowerCase() === said) || ctx.factions.find((f) => f.name.toLowerCase().includes(said) || said.includes(f.name.toLowerCase())) : null;
    const name = cut(str(raw.name), NAME_MAX);
    if (!faction || !name || taken.has(name.toLowerCase()) || (counts.get(faction.name) || 0) >= ctx.per) continue;
    const [card] = cleanCast([{ name, aliases: arr(raw.aliases).filter((a) => !taken.has(str(a).toLowerCase())), faction: faction.name, tie: tieOf(ctx.index, raw.tie), want: raw.want, text: raw.text, relation: raw.relation }]);
    if (!card) continue;
    card.id = "";
    taken.add(name.toLowerCase());
    counts.set(faction.name, (counts.get(faction.name) || 0) + 1);
    cards.push(card);
  }
  return cards;
}

export function deckInput({ entities, fronts, lang }) {
  return [
    "World record\n" + (entities.filter((e) => e.status === "active").map(entityLine).join("\n") || "empty"),
    "Fronts" + (arr(fronts).filter((f) => f.status === "active").length ? "\n" + fronts.filter((f) => f.status === "active").map(frontLine).join("\n") : ": none"),
    "Task: write " + DECK_MIN + " to " + DECK_MAX + " events.",
    "Write them in " + (lang || "the language of the record") + ".",
  ].join("\n\n");
}

/** Accept the draft (minus what the player removed) into the world, or throw it away. */
function draftRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  if (!str(b.chatId) && !WORLD_ID.test(str(b.worldId))) return ok({ error: "chatId or worldId required" }, 400);
  const t = startTarget(fsx, b);
  if (t.error) return t.error;
  const { state, chat } = t;
  const chatId = t.chat ? state.chatId : "";
  const draft = cleanDraft(state.draft);
  if (!draft) return ok({ error: "no draft" }, 409);
  if (b.op === "discard") {
    if (t.worldId) {
      try {
        fsx.remove(draftPath(t.worldId));
      } catch {}
      return ok({ ok: true, worlds: listWorlds(fsx).map(worldRow), building: listBuilding(fsx) });
    }
    delete state.draft;
    saveState(fsx, state);
    return ok({ ok: true });
  }
  if (b.op !== "accept") return ok({ error: "op must be accept or discard" }, 400);
  const drop = isObj(b.drop) ? b.drop : {};
  const gone = (list, id) => arr(list).includes(id);
  const now = Date.now();
  let added = 0;
  for (const e of draft.entities) {
    if (gone(drop.entities, e.id) || findEntity(state.entities, { name: e.name }) || state.entities.length >= ENTITIES_MAX) continue;
    state.entities.push({ ...e, id: "n" + state.nextId++, uid: 0, at: now });
    added++;
  }
  for (const f of draft.fronts) {
    if (gone(drop.fronts, f.id) || state.fronts.filter((x) => x.status === "active").length >= FRONTS_MAX) continue;
    if (state.fronts.some((x) => x.status === "active" && sameName(x.name, f.name))) continue;
    state.fronts.push({ ...f, id: "f" + state.nextFront++, at: now });
  }
  const deck = draft.deck.filter((c) => !gone(drop.deck, c.id));
  if (deck.length) {
    const kept = cleanDeck(state.deck);
    let n = nextDeckId(kept);
    state.deck = [...kept, ...deck.map((c) => ({ id: "e" + n++, text: c.text }))].slice(-DECK_MAX * 2);
  }
  // the cards of new people that were kept: new ids, a name once, never a person the world already has; the Start's numbers become the chat's
  const castKept = draft.cast.filter((c) => !gone(drop.cast, c.id));
  if (castKept.length) {
    const have = cleanCast(state.cast);
    state.cast = cleanCast([...have, ...castKept.filter((c) => !have.some((x) => sameName(x.name, c.name)) && !findEntity(state.entities, { name: c.name })).map((c) => ({ ...c, id: "" }))]);
  }
  if (draft.castOpts) state.settings = cleanSettings({ ...state.settings, castDeck: true, castPer: draft.castOpts.per, castLen: draft.castOpts.len });
  state.origin = { kind: draft.recipe === "from-cards" ? "cards" : "recipe", recipe: draft.recipe, cardIds: draft.cardIds, at: now };
  delete state.draft;
  if (t.worldId) {
    // a world built without a chat goes into the library; the draft file goes
    if (!state.entities.length && !state.fronts.length) return ok({ error: "the world would be empty", code: "empty" }, 409);
    writeJson(fsx, LIBRARY_DIR + t.worldId + ".json", cleanWorld({ ...state, ...t.head, at: now, from: null }, t.worldId));
    try {
      fsx.remove(draftPath(t.worldId));
    } catch {}
    return ok({ ok: true, added, id: t.worldId, worlds: listWorlds(fsx).map(worldRow), building: listBuilding(fsx) });
  }
  if (state.entities.length) {
    const rc = openRegistry(fsx, chatId, chat.meta);
    joinPeople(state, rc);
    regFlush(fsx, rc);
    writeBook(fsx, state, str(chat.meta.title));
    bindBook(fsx, chatId, chat.meta, state.bookId);
  }
  saveState(fsx, state);
  const cfg = loadConfig(fsx);
  return ok({ ok: true, added, ...stateView(state, chat.msgs, cfg, sceneOf(fsx, chatId, chat.msgs), playModel(fsx, cfg, chat.meta), fsx) });
}

/** A new deck for the chat (the old one is used up, or the player wants another). One build call. */
function deckRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state } = loadState(fsx, chatId);
  const cfg = loadConfig(fsx);
  const content = deckInput({ entities: state.entities, fronts: state.fronts, lang: cut(str(b.lang), LANG_MAX) });
  const built = buildResult(host, "world_deck", buildAsk(host, fsx, cfg, chat.meta, DECK_SYSTEM, content), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  const cards = built.error ? [] : deckFrom(built.out, DECK_MAX);
  if (cards.length) state.deck = cards.map((c, i) => ({ id: "e" + (i + 1), text: c.text }));
  countBuild(state, built, "deck", cards.length);
  saveState(fsx, state);
  if (built.error) return ok({ ok: false, error: built.error.message, code: built.error.code });
  // fewer than the prompt asked for: kept as is (no retry, no second call), but flagged so the app can offer a rebuild
  return ok({ ok: true, deck: cards.length, ...(cards.length < DECK_MIN ? { short: true, min: DECK_MIN } : {}) });
}

// ---------- the bench (#424): people the cards' lorebooks already have ----------
// One build call reads the lorebook entries of the chat's cards and picks the named people who can come back. Code makes
// each one a record that LINKS to its entry (book and uid): the record keeps a short line, a relation and a weight, and the
// entry keeps firing by its keys. Entries with a secret are never offered. A person the book already has gets the link, not a copy.
const BENCH_MAX = 12;
const BENCH_ENTRIES_MAX = 60;
const BENCH_ENTRY_TEXT = 500;
const BENCH_TEXT_MAX = 24000;

export const BENCH_SYSTEM = [
  "You read the lorebook entries of a roleplay and pick the named people who can come back into the story: friends, family, rivals, enemies, colleagues, neighbours, patrons.",
  "Skip the user's character, the characters that have their own cards, places, groups, things, rules, and anyone the entry says is hidden, dead or never met.",
  "For each person give:",
  "- entry: the number of the entry in the input.",
  "- name: how the story writes the name.",
  "- aliases: 2 to 4 short names, nicknames or other spellings, exactly as the story would write them (both scripts when the story switches).",
  "- line: one or two short sentences in the present tense: who they are and how they stand toward the user's character.",
  "- relation: ally, family, rival, enemy or neutral.",
  "- weight: 0 an acquaintance, 1 a friend or a rival, 2 family, a partner or a central figure.",
  "Write in the language and script of the entries. Only the JSON keys and the relation words are English. At most " + BENCH_MAX + " people. Nobody fits: an empty list.",
  "Output: one JSON object and nothing else, no code fences:",
  '{"people":[{"entry":1,"name":"...","aliases":["..."],"line":"...","relation":"ally","weight":1}]}',
].join("\n");

/** The lorebook entries of the chat's cards and group that could name a person: enabled, with text, not secret, not the chat's own world book. [{ book, uid, title, text }]. */
export function benchEntries(fsx, meta) {
  const seen = new Set([str(meta.worldBookId)]);
  const books = [];
  const addBooks = (list) => {
    for (const id of list) {
      if (seen.has(id)) continue;
      seen.add(id);
      books.push(id);
    }
  };
  for (const id of memberIds(fsx, meta)) {
    const card = cardOf(fsx, id);
    if (card) addBooks(booksOf(card));
  }
  if (meta.groupId) {
    const group = readJson(fsx, "groups/" + meta.groupId + ".json", null);
    if (isObj(group)) addBooks(booksOf(group));
  }
  const out = [];
  let total = 0;
  for (const id of books) {
    const book = readJson(fsx, "lorebooks/" + id + ".json", null);
    if (!isObj(book) || str(book.ownerChatId)) continue;
    for (const e of arr(book.entries)) {
      if (!isObj(e) || e.enabled === false || e.secret || !Number.isInteger(e.uid) || !str(e.content)) continue;
      const title = cut(str(e.title) || arr(e.keys).map(str).filter(Boolean).slice(0, 3).join(", "), NAME_MAX);
      const text = cut(str(e.content), BENCH_ENTRY_TEXT);
      if (out.length >= BENCH_ENTRIES_MAX || (total += text.length) > BENCH_TEXT_MAX) return out;
      out.push({ book: id, uid: e.uid, title, text });
    }
  }
  return out;
}

export function benchInput({ entries, userName, cards, lang }) {
  return [
    "User's character: " + (userName || "unknown"),
    "Characters with their own cards (skip them): " + (cards.length ? cards.join(", ") : "none"),
    "Entries:\n" + entries.map((e, i) => "[" + (i + 1) + "] " + (e.title ? e.title + ": " : "") + e.text.replace(/\s+/g, " ")).join("\n"),
    "Write in " + (lang || "the language of the entries") + ".",
  ].join("\n\n");
}

/**
 * Turns the model's people into records on `state` (the chat's, or a Start draft's). `rc` = the registry context (null in a
 * draft: the people join the registry when the draft is accepted). Returns { added, linked } as lists of names.
 */
export function applyBench(state, rc, entries, out, { textMax = TEXT_BOUNDS[1], now = Date.now(), skip = [] } = {}) {
  const res = { added: [], linked: [] };
  const isSkipped = (name) => skip.some((n) => sameName(n, name));
  for (const raw of arr(out && out.people).filter(isObj).slice(0, BENCH_MAX)) {
    const entry = entries[Math.round(num(raw.entry)) - 1];
    const name = cut(str(raw.name), NAME_MAX);
    if (!entry || !name || isSkipped(name)) continue;
    const link = { book: entry.book, uid: entry.uid, title: entry.title };
    const extra = { ...(RELATIONS.includes(raw.relation) ? { relation: raw.relation } : {}), ...(WEIGHTS.includes(Number(raw.weight)) ? { weight: Number(raw.weight) } : {}) };
    let known = findEntity(state.entities, { name });
    if (!known && rc) known = npcRecordOf(state, rc, name);
    if (known) {
      // one record per person: the existing one takes the link and what it lacks
      if (known.kind !== "person" || known.status === "past" || known.link) continue;
      known.link = link;
      if (!known.relation && extra.relation) known.relation = extra.relation;
      if (known.weight === undefined && extra.weight !== undefined) known.weight = extra.weight;
      known.aliases = cleanAliases([...known.aliases, ...arr(raw.aliases)], known.name);
      res.linked.push(known.name);
      continue;
    }
    const text = cut(str(raw.line), textMax);
    if (!text || state.entities.length >= ENTITIES_MAX) continue;
    if (rc && regPersonOf(rc, name) && REG_OWN_SRC.includes((regPersonOf(rc, name) || {}).src)) continue;
    const rec = cleanEntity({ id: "n" + state.nextId, kind: "person", name, aliases: arr(raw.aliases), text, status: "active", uid: 0, at: now, link, ...extra });
    if (!rec) continue;
    state.nextId++;
    state.entities.push(rec);
    res.added.push(name);
  }
  return res;
}

/** Every living person record with no registry id joins the registry (the person the story already made there, else a new one), so the cast can follow them by id. */
function joinPeople(state, rc) {
  if (!rc) return;
  for (const rec of state.entities) {
    if (rec.kind !== "person" || rec.status !== "active" || (isObj(state.regIds) && state.regIds[rec.id])) continue;
    const seen = regPersonOf(rc, rec.name);
    if (seen && seen.id === "user") continue;
    const pe = seen || regAdd(rc.reg, { kind: "person", name: rec.name, src: "world" });
    if (!pe) continue;
    for (const n of rec.aliases) if (regAlias(rc.reg, pe.id, n, "world")) rc.dirty = true;
    if (!seen) rc.dirty = true;
    (state.regIds ||= {})[rec.id] = pe.id;
  }
}

/** POST {chatId, lang?}: the bench of this chat's cards is adopted (one build call); the cast is switched on if it was off. */
function benchRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const cfg = loadConfig(fsx);
  const { state, existed } = loadState(fsx, chatId);
  if (!existed && autoOn(fsx, chat.meta)) state.settings = startSettings(fsx, state.settings, cfg);
  const entries = benchEntries(fsx, chat.meta);
  if (!entries.length) return ok({ ok: true, added: [], linked: [], none: true });
  const userName = userNameOf(fsx, chat.meta);
  const cards = cardNames(fsx, chat.meta);
  const content = benchInput({ entries, userName, cards, lang: cut(str(b.lang), LANG_MAX) });
  const built = buildResult(host, "world_bench", buildAsk(host, fsx, cfg, chat.meta, BENCH_SYSTEM, content), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  if (built.error) {
    countBuild(state, built, "bench", 0);
    saveState(fsx, state);
    return ok({ ok: false, error: built.error.message, code: built.error.code });
  }
  const rc = openRegistry(fsx, chatId, chat.meta);
  const res = applyBench(state, rc, entries, built.out, { textMax: state.settings.textMax, skip: [...cards, ...(userName ? [userName] : [])] });
  joinPeople(state, rc);
  regFlush(fsx, rc);
  // pressing the button is asking for people to come back: a chat that was off starts on normal
  if (state.settings.level !== "off" && state.settings.cast === "off") state.settings = { ...state.settings, cast: DEFAULT_OPTIONS.cast };
  countBuild(state, built, "bench", res.added.length + res.linked.length);
  if (state.entities.length) {
    writeBook(fsx, state, str(chat.meta.title));
    bindBook(fsx, chatId, chat.meta, state.bookId);
  }
  saveState(fsx, state);
  return ok({ ok: true, ...res, cast: state.settings.cast });
}

// ---------- the DM's memory (#425, step 5, half A: levers) ----------
// What the player does to the DM's book (state.signals, step 0) can raise a proposal, in CODE, with no model: "you deleted 7 of the 9
// things the DM wrote; record only things with a reason?". The answer flips an exact setting (the lever), not a line of prose.
// A proposal is a share of the DM's own records of one kind inside a window (a count alone mistakes tidying for a preference).
// Answers: this chat (a rule in the chat's state), all chats (a rule in world/learned.json, applied to each chat the next time it is
// read, and to new chats), or no (not asked again until as many new signals have gathered). Nothing here is rewound by a swipe.

const LEARN_FILE = "world/learned.json";
const LEARN_DAYS = 30;
const LEARN_LOG_MAX = 60;
const LEARN_RULES_MAX = 20;
const LEARN_ANSWERED_MAX = 20;
const LEARN_PROPOSALS_MAX = 3;
const LEARN_QUEUE_MAX = 40;
const LEARN_NAMES_MAX = 8;
/** How a thing may be written: all, only a clue, hidden or promised one, none. A later step is stricter. */
export const THINGS_STEPS = ["all", "reasons", "off"];
export const THINGS_REASONS = ["clue", "hidden", "promise"];
/** The levers a rule can set, each an exact setting of the chat. */
export const LEARN_LEVERS = ["things", "textMax", "cast"];
/** What a proposal, an answer or a log line can be about: a lever, or a rule in words. */
export const LEARN_KEYS = [...LEARN_LEVERS, "words"];
const LEARN_WORD_KINDS = ["person", "place", "group"];
/** A rule in words: one line of at most this many characters; the block of them in the DM's input holds this many rules and this many characters of rule text. */
const RULE_TEXT_MAX = 160;
const PROMPT_RULES_MAX = 10;
const PROMPT_CHARS_MAX = 600;
/** First guesses (owner, 2026-11-16): min = how many, share = percent of the DM's records of that kind, cut = how much shorter a rewrite is. */
export const LEARN_THRESHOLDS = { things: { min: 5, share: 60 }, text: { min: 3, share: 30, cut: 30 }, cast: { min: 3, share: 60 }, words: { min: 5, share: 60 } };

const nint = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/** Is `to` a value this lever can take. */
function leverValid(key, to) {
  if (key === "things") return THINGS_STEPS.includes(to);
  if (key === "cast") return CAST_FREQ.includes(to);
  if (key === "textMax") return Number.isInteger(to) && to >= TEXT_BOUNDS[0] && to <= TEXT_BOUNDS[1];
  return false;
}

/** Is `to` stricter than `cur`: fewer things, fewer returns, shorter records. A rule only tightens. */
export function leverStricter(key, cur, to) {
  if (!leverValid(key, to)) return false;
  if (key === "things") return THINGS_STEPS.indexOf(to) > THINGS_STEPS.indexOf(cur);
  if (key === "cast") return CAST_FREQ.indexOf(to) < CAST_FREQ.indexOf(cur);
  return Number.isFinite(cur) ? to < cur : true;
}

/** The words added to the DM's input for the levers in force (the same text the profile editor shows as "Learned memory"). */
export function learnNote(set) {
  const s = isObj(set) ? set : {};
  if (s.things === "off") return "The player does not want things in the book: record places, people and groups only.";
  if (s.things === "reasons") return "Record a thing only when it is a clue, hidden or promised (give why: clue, hidden or promise); every other object stays out.";
  return "";
}

function cleanEv(ev) {
  if (!isObj(ev)) return null;
  return {
    n: nint(ev.n),
    total: nint(ev.total),
    share: clamp(nint(ev.share), 0, 100),
    min: nint(ev.min),
    thr: clamp(nint(ev.thr), 0, 100),
    days: nint(ev.days),
    names: arr(ev.names).map((x) => cut(str(x), NAME_MAX)).filter(Boolean).slice(0, LEARN_NAMES_MAX),
    ...(KINDS.includes(ev.kind) ? { kind: ev.kind } : {}),
    ...(nint(ev.len) ? { len: nint(ev.len) } : {}),
    ...(ev.manual === true ? { manual: true } : {}),
  };
}

function cleanLever(l) {
  if (!isObj(l) || !LEARN_LEVERS.includes(l.key) || !leverValid(l.key, l.to)) return null;
  return { key: l.key, to: l.to, ...(l.from !== undefined && leverValid(l.key, l.from) ? { from: l.from } : {}) };
}

function cleanRule(r) {
  if (!isObj(r) || !/^[rg]\d{1,6}$/.test(str(r.id)) || !Number.isFinite(r.at)) return null;
  const ev = cleanEv(r.ev);
  const base = { id: str(r.id), scope: r.scope === "all" ? "all" : "chat", source: r.source === "player" ? "player" : "proposal", at: r.at };
  const lever = cleanLever(r.lever);
  if (lever) return { ...base, lever: { key: lever.key, to: lever.to }, ...(r.was !== undefined && leverValid(lever.key, r.was) ? { was: r.was } : {}), ...(ev ? { ev } : {}) };
  // a rule in words (half B): one line the DM reads in the block "what this player prefers"
  const text = cleanRuleText(r.text);
  return text ? { ...base, text, ...(ev ? { ev } : {}) } : null;
}

function cleanProposal(p) {
  if (!isObj(p) || !/^q\d{1,6}$/.test(str(p.id)) || !Number.isFinite(p.at)) return null;
  const ev = cleanEv(p.ev);
  if (!ev) return null;
  if (str(p.key) === "words") {
    // a rule in words waits for the small model call that writes it: pending, then ready (or error, to try again)
    const text = cleanRuleText(p.text);
    const state = text ? "ready" : p.state === "error" ? "error" : "pending";
    return { id: str(p.id), key: "words", ev, text, state, ...(state === "error" && str(p.err) ? { err: cut(str(p.err), 40) } : {}), at: p.at };
  }
  const lever = cleanLever(p.lever);
  if (!lever) return null;
  return { id: str(p.id), key: lever.key, lever, ev, at: p.at };
}

const LEARN_ACTS = ["raise", "answer", "remove", "edit", "add", "reset", "phrase"];

const LEARN_ANSWERS = ["all", "chat", "no", "removed"];

function cleanLearnLog(l) {
  if (!isObj(l) || !LEARN_ACTS.includes(l.act) || !Number.isFinite(l.at) || !LEARN_KEYS.includes(l.key)) return null;
  const ev = cleanEv(l.ev);
  return {
    at: l.at,
    act: l.act,
    key: l.key,
    ...(leverValid(l.key, l.to) ? { to: l.to } : {}),
    ...(str(l.text) ? { text: cleanRuleText(l.text) } : {}),
    ...(LEARN_ANSWERS.includes(l.answer) ? { answer: l.answer } : {}),
    ...(["ok", "none", "error"].includes(l.result) ? { result: l.result } : {}),
    ...(l.scope === "all" || l.scope === "chat" ? { scope: l.scope } : {}),
    ...(ev ? { ev } : {}),
  };
}

/** The chat's part of the memory: rules for this chat, proposals waiting, answers (so a "no" is not asked again soon), what a global rule changed here, the log. */
export function cleanLearned(l) {
  if (!isObj(l)) return null;
  const rules = arr(l.rules).map(cleanRule).filter((r) => r && r.scope === "chat").slice(-LEARN_RULES_MAX);
  const proposals = arr(l.proposals).map(cleanProposal).filter(Boolean).slice(-LEARN_PROPOSALS_MAX);
  const answered = arr(l.answered)
    .filter((a) => isObj(a) && LEARN_KEYS.includes(a.key) && Number.isFinite(a.at) && LEARN_ANSWERS.includes(a.answer))
    .map((a) => ({ key: a.key, at: a.at, answer: a.answer, ...(KINDS.includes(a.kind) ? { kind: a.kind } : {}) }))
    .slice(-LEARN_ANSWERED_MAX);
  const applied = arr(l.applied)
    .filter((a) => isObj(a) && /^g\d{1,6}$/.test(str(a.id)) && LEARN_LEVERS.includes(a.key) && leverValid(a.key, a.to))
    .map((a) => ({ id: str(a.id), key: a.key, to: a.to, ...(a.was !== undefined && leverValid(a.key, a.was) ? { was: a.was } : {}) }));
  const log = arr(l.log).map(cleanLearnLog).filter(Boolean).slice(-LEARN_LOG_MAX);
  const next = Number.isInteger(l.next) && l.next >= 1 ? l.next : 1;
  if (!rules.length && !proposals.length && !answered.length && !applied.length && !log.length) return null;
  return { next, rules, proposals, answered, applied, log };
}

/** The chat's memory, made on first use. */
function learnedOf(state) {
  if (!state.learned) state.learned = { next: 1, rules: [], proposals: [], answered: [], applied: [], log: [] };
  return state.learned;
}

const learnLog = (L, line) => {
  L.log = [...L.log, line].slice(-LEARN_LOG_MAX);
};

// ---- the file of rules for every chat ----

function cleanQueue(q) {
  if (!isObj(q) || !CHAT_ID.test(str(q.chatId)) || !/^q\d{1,6}$/.test(str(q.id)) || !LEARN_KEYS.includes(q.key) || !Number.isFinite(q.at)) return null;
  return { chatId: str(q.chatId), id: str(q.id), key: q.key, at: q.at };
}

/** world/learned.json: { next, rules: [scope all], queue: [proposals waiting in any chat] }. */
export function loadLearned(fsx) {
  const raw = readJson(fsx, LEARN_FILE, {});
  const g = isObj(raw) ? raw : {};
  return {
    next: Number.isInteger(g.next) && g.next >= 1 ? g.next : 1,
    rules: arr(g.rules).map(cleanRule).filter((r) => r && r.scope === "all").slice(-LEARN_RULES_MAX),
    queue: arr(g.queue).map(cleanQueue).filter(Boolean).slice(-LEARN_QUEUE_MAX),
  };
}

function saveLearned(fsx, g) {
  if (!g.rules.length && !g.queue.length) {
    try {
      fsx.remove(LEARN_FILE);
    } catch {}
    return;
  }
  writeJson(fsx, LEARN_FILE, { v: 1, next: g.next, rules: g.rules, queue: g.queue });
}

/** The index of waiting proposals follows the chat's own list (the DM tab shows a dot without reading every state file). */
function syncQueue(fsx, state) {
  const g = loadLearned(fsx);
  const mine = arr(state.learned && state.learned.proposals).map((p) => ({ chatId: state.chatId, id: p.id, key: p.key, at: p.at }));
  const rest = g.queue.filter((q) => q.chatId !== state.chatId);
  const next = [...rest, ...mine].slice(-LEARN_QUEUE_MAX);
  if (JSON.stringify(next) === JSON.stringify(g.queue)) return;
  g.queue = next;
  saveLearned(fsx, g);
}

/**
 * Brings the chat's settings in line with the rules for all chats, in memory (a save then keeps it): a rule not applied here yet and
 * stricter than the chat's value is applied and remembered with the value it replaced; a rule whose value was edited moves the chat
 * if the chat still held the old value; a rule that is gone gives the old value back if the chat still holds the rule's. A value
 * the player changed by hand after the rule is never touched. Rules in words are not settings: they reach the DM through the prompt block.
 */
export function syncGlobalRules(state, g) {
  const rules = arr(g && g.rules).filter((r) => r.lever);
  const have = arr(state.learned && state.learned.applied);
  if (!rules.length && !have.length) return;
  const settings = { ...state.settings };
  let applied = have.map((a) => ({ ...a }));
  let changed = false;
  for (const a of [...applied]) {
    const r = rules.find((x) => x.id === a.id);
    if (!r) {
      if (settings[a.key] === a.to && a.was !== undefined) settings[a.key] = a.was;
      applied = applied.filter((x) => x !== a);
      changed = true;
    } else if (r.lever.to !== a.to) {
      if (settings[a.key] === a.to) settings[a.key] = r.lever.to;
      a.to = r.lever.to;
      changed = true;
    }
  }
  for (const r of rules) {
    if (applied.some((a) => a.id === r.id)) continue;
    const cur = settings[r.lever.key];
    if (!leverStricter(r.lever.key, cur, r.lever.to)) continue;
    applied.push({ id: r.id, key: r.lever.key, to: r.lever.to, was: cur });
    settings[r.lever.key] = r.lever.to;
    changed = true;
  }
  if (!changed) return;
  state.settings = cleanSettings(settings);
  learnedOf(state).applied = applied;
}

const uniqNames = (list) => {
  const seen = new Set();
  const out = [];
  for (const g of list) {
    const k = str(g.name).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(g.name);
  }
  return out;
};
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : 0);

/** The start of the window for one lever (or one kind of prose rule): 30 days back, or the last answer about it (a "no" is asked again only after fresh signals). */
function learnSince(state, key, now, kind) {
  const last = arr(state.learned && state.learned.answered).filter((a) => a.key === key && (kind === undefined || a.kind === kind)).reduce((m, a) => Math.max(m, a.at), 0);
  return Math.max(now - LEARN_DAYS * 86400000, last);
}

/**
 * What the player's signals say right now: a list of { key, lever: { key, from, to }, ev } for a setting, or { key: "words", kind, ev } for
 * a rule in words (people, places and groups have no setting to flip: a model writes the rule, later). Pure: no state is changed.
 * Only records the DM wrote (no `by: "player"`), by kind, as a SHARE of what the DM wrote (deleted and still there), inside the window.
 */
export function learnEvidence(state, now) {
  const out = [];
  const set = state.settings;
  const sigs = arr(state.signals);
  const dm = (e) => e.by !== "player" && e.status !== "past";
  // things: the DM's things the player deleted
  {
    const th = LEARN_THRESHOLDS.things;
    const since = learnSince(state, "things", now);
    const gone = uniqNames(sigs.filter((g) => g.op === "delete" && g.kind === "thing" && g.madeBy === "dm" && g.at >= since).reverse());
    const total = gone.length + state.entities.filter((e) => e.kind === "thing" && dm(e)).length;
    const next = THINGS_STEPS[THINGS_STEPS.indexOf(set.things) + 1];
    if (next && gone.length >= th.min && pct(gone.length, total) >= th.share) {
      out.push({ key: "things", lever: { key: "things", from: set.things, to: next }, ev: { n: gone.length, total, share: pct(gone.length, total), min: th.min, thr: th.share, days: LEARN_DAYS, names: gone.slice(0, LEARN_NAMES_MAX), kind: "thing" } });
    }
  }
  // text: the player rewrote the DM's text shorter, again and again, for one kind
  {
    const th = LEARN_THRESHOLDS.text;
    const since = learnSince(state, "textMax", now);
    let best = null;
    for (const kind of WRITE_KINDS) {
      const edits = sigs.filter((g) => g.op === "edit" && g.kind === kind && g.madeBy === "dm" && g.at >= since && Number.isInteger(g.lenBefore) && Number.isInteger(g.lenAfter));
      const short = edits.filter((g) => g.lenBefore > 0 && g.lenAfter <= (g.lenBefore * (100 - th.cut)) / 100);
      const names = uniqNames([...short].reverse());
      const total = uniqNames(edits).length + state.entities.filter((e) => e.kind === kind && dm(e)).length;
      if (!short.length) continue;
      const to = clamp(Math.ceil(Math.max(...short.map((g) => g.lenAfter)) / 50) * 50, TEXT_BOUNDS[0], TEXT_BOUNDS[1]);
      if (names.length >= th.min && pct(names.length, total) >= th.share && to < set.textMax && (!best || names.length > best.ev.n)) {
        best = { key: "textMax", lever: { key: "textMax", from: set.textMax, to }, ev: { n: names.length, total, share: pct(names.length, total), min: th.min, thr: th.share, days: LEARN_DAYS, names: names.slice(0, LEARN_NAMES_MAX), kind, len: to } };
      }
    }
    if (best) out.push(best);
  }
  // cast: people that came from the deck or the bench and were deleted
  {
    const th = LEARN_THRESHOLDS.cast;
    const since = learnSince(state, "cast", now);
    const gone = uniqNames(sigs.filter((g) => g.op === "delete" && g.kind === "person" && g.madeBy === "dm" && (g.src === "deck" || g.src === "bench") && g.at >= since).reverse());
    const total = gone.length + state.entities.filter((e) => e.kind === "person" && dm(e) && (e.src === "deck" || e.link)).length;
    const idx = CAST_FREQ.indexOf(set.cast);
    const next = idx > 0 ? CAST_FREQ[idx - 1] : null;
    if (next && gone.length >= th.min && pct(gone.length, total) >= th.share) {
      out.push({ key: "cast", lever: { key: "cast", from: set.cast, to: next }, ev: { n: gone.length, total, share: pct(gone.length, total), min: th.min, thr: th.share, days: LEARN_DAYS, names: gone.slice(0, LEARN_NAMES_MAX), kind: "person" } });
    }
  }
  // words: people, places and groups the DM wrote on its own (the deck's and the lorebooks' people have their own lever) and the player deleted
  {
    const th = LEARN_THRESHOLDS.words;
    for (const kind of LEARN_WORD_KINDS) {
      const since = learnSince(state, "words", now, kind);
      const gone = uniqNames(sigs.filter((g) => g.op === "delete" && g.kind === kind && g.madeBy === "dm" && !g.src && g.at >= since).reverse());
      const total = gone.length + state.entities.filter((e) => e.kind === kind && dm(e) && !(e.src === "deck" || e.link)).length;
      if (gone.length >= th.min && pct(gone.length, total) >= th.share) {
        out.push({ key: "words", kind, ev: { n: gone.length, total, share: pct(gone.length, total), min: th.min, thr: th.share, days: LEARN_DAYS, names: gone.slice(0, LEARN_NAMES_MAX), kind } });
      }
    }
  }
  return out;
}

/**
 * Raises what the signals call for and drops a proposal that no longer tightens anything (the setting changed by hand since).
 * Every raise is a line in the chat's learned log: which signals, what share, which threshold. A rule in words is raised as "pending":
 * the model call that writes it comes when the player opens Memory (or presses "Suggest a rule"), not here. True when the state changed.
 */
export function raiseProposals(state, now) {
  if (state.settings.learn === false) return false;
  let changed = false;
  const before = arr(state.learned && state.learned.proposals);
  const kept = before.filter((p) => p.key === "words" || leverStricter(p.key, state.settings[p.key], p.lever.to));
  if (kept.length !== before.length) {
    learnedOf(state).proposals = kept;
    changed = true;
  }
  for (const c of learnEvidence(state, now)) {
    const L = learnedOf(state);
    if (L.proposals.some((p) => p.key === c.key) || L.proposals.length >= LEARN_PROPOSALS_MAX) continue;
    if (c.key === "words") {
      L.proposals = [...L.proposals, { id: "q" + L.next++, key: "words", ev: c.ev, text: "", state: "pending", at: now }];
      learnLog(L, { at: now, act: "raise", key: "words", ev: c.ev });
    } else {
      L.proposals = [...L.proposals, { id: "q" + L.next++, key: c.key, lever: c.lever, ev: c.ev, at: now }];
      learnLog(L, { at: now, act: "raise", key: c.key, to: c.lever.to, ev: c.ev });
    }
    changed = true;
  }
  return changed;
}

const setLever = (state, key, to) => {
  state.settings = cleanSettings({ ...state.settings, [key]: to });
};
const giveBack = (state, a) => {
  if (a.was !== undefined && state.settings[a.key] === a.to) setLever(state, a.key, a.was);
};

/**
 * Answer one proposal: "chat" (a rule here), "all" (a rule for every chat), "no". A rule in words for all chats needs `confirm: true`
 * (the second confirmation, asked by the app in a dialog and checked here). Returns an error text or "".
 */
export function answerProposal(fsx, state, id, answer, now, confirm) {
  const L = learnedOf(state);
  const p = L.proposals.find((x) => x.id === id);
  if (!p) return "no such proposal";
  if (!["chat", "all", "no"].includes(answer)) return "unknown answer";
  const words = p.key === "words";
  if (words && answer !== "no" && p.state !== "ready") return "the rule is not written yet";
  if (words && answer === "all" && confirm !== true) return "confirm needed";
  L.proposals = L.proposals.filter((x) => x !== p);
  L.answered = [...L.answered, { key: p.key, at: now, answer, ...(words && p.ev.kind ? { kind: p.ev.kind } : {}) }].slice(-LEARN_ANSWERED_MAX);
  learnLog(L, { at: now, act: "answer", key: p.key, ...(words ? { text: p.text } : { to: p.lever.to }), answer, ev: p.ev });
  if (words) {
    if (answer === "chat") L.rules = [...L.rules, { id: "r" + L.next++, scope: "chat", text: p.text, source: "proposal", ev: p.ev, at: now }].slice(-LEARN_RULES_MAX);
    else if (answer === "all") {
      const g = loadLearned(fsx);
      g.rules = [...g.rules, { id: "g" + g.next++, scope: "all", text: p.text, source: "proposal", ev: p.ev, at: now }].slice(-LEARN_RULES_MAX);
      saveLearned(fsx, g);
    }
    return "";
  }
  if (answer === "chat") {
    L.rules = [...L.rules, { id: "r" + L.next++, scope: "chat", lever: { key: p.key, to: p.lever.to }, was: p.lever.from, source: "proposal", ev: p.ev, at: now }].slice(-LEARN_RULES_MAX);
    setLever(state, p.key, p.lever.to);
  } else if (answer === "all") {
    const g = loadLearned(fsx);
    const rid = "g" + g.next++;
    g.rules = [...g.rules, { id: rid, scope: "all", lever: { key: p.key, to: p.lever.to }, source: "proposal", ev: p.ev, at: now }].slice(-LEARN_RULES_MAX);
    saveLearned(fsx, g);
    L.applied = [...L.applied, { id: rid, key: p.key, to: p.lever.to, was: p.lever.from }];
    setLever(state, p.key, p.lever.to);
  }
  return "";
}

/**
 * Add a rule by hand: one lever and a value, or a rule in words (key "words", `to` is the text). The chat takes a setting exactly; other
 * chats only where it tightens. A rule in words for all chats needs `confirm: true`.
 */
export function addRule(fsx, state, scope, key, to, now, confirm) {
  const L = learnedOf(state);
  if (key === "words") {
    const text = cleanRuleText(to);
    if (!text) return "a rule needs words";
    if (scope === "all") {
      if (confirm !== true) return "confirm needed";
      const g = loadLearned(fsx);
      g.rules = [...g.rules, { id: "g" + g.next++, scope: "all", text, source: "player", at: now }].slice(-LEARN_RULES_MAX);
      saveLearned(fsx, g);
    } else L.rules = [...L.rules, { id: "r" + L.next++, scope: "chat", text, source: "player", at: now }].slice(-LEARN_RULES_MAX);
    learnLog(L, { at: now, act: "add", key: "words", text, scope: scope === "all" ? "all" : "chat" });
    return "";
  }
  if (!LEARN_LEVERS.includes(key) || !leverValid(key, to)) return "unknown lever or value";
  const was = state.settings[key];
  if (scope === "all") {
    const g = loadLearned(fsx);
    const rid = "g" + g.next++;
    g.rules = [...g.rules, { id: rid, scope: "all", lever: { key, to }, source: "player", at: now }].slice(-LEARN_RULES_MAX);
    saveLearned(fsx, g);
    L.applied = [...L.applied, { id: rid, key, to, was }];
  } else L.rules = [...L.rules, { id: "r" + L.next++, scope: "chat", lever: { key, to }, was, source: "player", at: now }].slice(-LEARN_RULES_MAX);
  setLever(state, key, to);
  learnLog(L, { at: now, act: "add", key, to, scope: scope === "all" ? "all" : "chat" });
  return "";
}

/** Remove a rule: a lever goes back to what it replaced, where the setting still holds the rule's value; a rule in words just stops reaching the DM. */
export function removeRule(fsx, state, id, now) {
  const L = learnedOf(state);
  let r = L.rules.find((x) => x.id === id);
  if (r) {
    if (r.lever) giveBack(state, { key: r.lever.key, to: r.lever.to, was: r.was });
    L.rules = L.rules.filter((x) => x !== r);
  } else {
    const g = loadLearned(fsx);
    r = g.rules.find((x) => x.id === id);
    if (!r) return "no such rule";
    g.rules = g.rules.filter((x) => x !== r);
    saveLearned(fsx, g);
    const a = L.applied.find((x) => x.id === id);
    if (a) {
      giveBack(state, a);
      L.applied = L.applied.filter((x) => x !== a);
    }
  }
  const key = r.lever ? r.lever.key : "words";
  L.answered = [...L.answered, { key, at: now, answer: "removed", ...(r.ev && r.ev.kind && !r.lever ? { kind: r.ev.kind } : {}) }].slice(-LEARN_ANSWERED_MAX);
  learnLog(L, { at: now, act: "remove", key, ...(r.lever ? { to: r.lever.to } : { text: r.text }), scope: r.scope });
  return "";
}

/** Change the value of a rule (or the words of a rule in words). This chat takes a setting exactly, the others follow where they still held the old value. */
export function editRule(fsx, state, id, to, now) {
  const L = learnedOf(state);
  const mine = L.rules.find((x) => x.id === id);
  if (mine && mine.text !== undefined) {
    const text = cleanRuleText(to);
    if (!text) return "a rule needs words";
    mine.text = text;
    learnLog(L, { at: now, act: "edit", key: "words", text, scope: "chat" });
    return "";
  }
  if (mine) {
    if (!leverValid(mine.lever.key, to)) return "unknown value";
    mine.lever = { key: mine.lever.key, to };
    setLever(state, mine.lever.key, to);
    learnLog(L, { at: now, act: "edit", key: mine.lever.key, to, scope: "chat" });
    return "";
  }
  const g = loadLearned(fsx);
  const r = g.rules.find((x) => x.id === id);
  if (!r) return "no such rule";
  if (r.text !== undefined) {
    const text = cleanRuleText(to);
    if (!text) return "a rule needs words";
    r.text = text;
    saveLearned(fsx, g);
    learnLog(L, { at: now, act: "edit", key: "words", text, scope: "all" });
    return "";
  }
  if (!leverValid(r.lever.key, to)) return "unknown value";
  r.lever = { key: r.lever.key, to };
  saveLearned(fsx, g);
  const a = L.applied.find((x) => x.id === id);
  if (a) {
    a.to = to;
    setLever(state, r.lever.key, to);
  } else syncGlobalRules(state, g);
  learnLog(L, { at: now, act: "edit", key: r.lever.key, to, scope: "all" });
  return "";
}

/** Everything the memory holds for this chat and for all chats goes, and the settings it moved go back (where still held). */
export function resetLearned(fsx, state) {
  const L = state.learned;
  if (L) {
    for (const r of L.rules) if (r.lever) giveBack(state, { key: r.lever.key, to: r.lever.to, was: r.was });
    for (const a of L.applied) giveBack(state, a);
    delete state.learned;
  }
  delete state.signals;
  const g = loadLearned(fsx);
  g.rules = [];
  g.queue = g.queue.filter((q) => q.chatId !== state.chatId);
  saveLearned(fsx, g);
}

/** The settings with the rules for all chats laid over the defaults: what a new chat starts with (for the profile editor's card). */
function defaultsWithRules(g) {
  const state = { settings: { ...DEFAULT_SETTINGS }, chatId: "" };
  syncGlobalRules(state, g);
  return state.settings;
}

/** What the DM tab and the chat's card read: the rules, the proposals, the log, the names kept, and the words the memory adds to the DM's input. */
export function learnedView(fsx, state) {
  const g = loadLearned(fsx);
  const L = state ? state.learned : null;
  const applied = arr(L && L.applied);
  const waiting = g.queue.filter((q) => readJson(fsx, "chats/" + q.chatId + ".meta.json", null));
  const set = state ? state.settings : defaultsWithRules(g);
  const text = learnTextRules(L, g);
  return {
    chatId: state ? state.chatId : "",
    on: state ? state.settings.learn !== false : true,
    settings: { things: set.things, textMax: set.textMax, cast: set.cast },
    rules: [
      ...arr(L && L.rules).map((r) => ({ ...r, here: true, ...(r.text ? { inPrompt: text.used.some((u) => u.id === r.id) } : {}) })),
      ...g.rules.map((r) => ({ ...r, here: r.text ? true : !!state && (applied.some((a) => a.id === r.id) || state.settings[r.lever.key] === r.lever.to), ...(r.text ? { inPrompt: text.used.some((u) => u.id === r.id) } : {}) })),
    ],
    proposals: arr(L && L.proposals),
    log: [...arr(L && L.log)].reverse(),
    remembered: state ? removedNames(state, SIGNALS_MAX) : [],
    waiting,
    note: learnedInput(set, L, g),
    thresholds: LEARN_THRESHOLDS,
    days: LEARN_DAYS,
    limits: { rules: PROMPT_RULES_MAX, chars: PROMPT_CHARS_MAX, text: RULE_TEXT_MAX },
  };
}

/** The chat panel's line: rules in force here (this chat's and all chats'), proposals waiting, rules in words being written. */
export function learnCounts(fsx, state) {
  const g = loadLearned(fsx);
  return {
    on: state.settings.learn !== false,
    rules: arr(state.learned && state.learned.rules).length + g.rules.length,
    waiting: arr(state.learned && state.learned.proposals).length,
    phrasing: arr(state.learned && state.learned.proposals).filter((p) => p.key === "words" && p.state === "pending").length,
  };
}

function cleanRuleText(s) {
  return cut(str(s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim(), RULE_TEXT_MAX);
}

/**
 * The rules in words that reach the DM, newest first: this chat's and all chats' together, at most PROMPT_RULES_MAX rules and
 * PROMPT_CHARS_MAX characters of rule text. `used` go into the prompt, the rest of `all` is left out (Memory says so).
 */
export function learnTextRules(learned, g) {
  const all = [...arr(learned && learned.rules).filter((r) => r.text), ...arr(g && g.rules).filter((r) => r.text)].sort((a, b) => b.at - a.at);
  const used = [];
  let chars = 0;
  for (const r of all) {
    if (used.length >= PROMPT_RULES_MAX || chars + r.text.length > PROMPT_CHARS_MAX) break;
    used.push(r);
    chars += r.text.length;
  }
  return { all, used };
}

const learnBlock = (rules) => (rules.length ? "What this player prefers (learned from what they removed and rewrote in the book; follow it when you record):\n" + rules.map((r) => "- " + r.text).join("\n") : "");

/** Exactly what the memory adds to the DM's input: the words for the levers in force, then the block of rules in words. */
export function learnedInput(settings, learned, g) {
  return [learnNote(settings), learnBlock(learnTextRules(learned, g).used)].filter(Boolean).join("\n");
}

export const LEARN_SYSTEM = [
  "You help the game master (the DM) of a roleplay story learn what one player does not want in the story's world book.",
  "You get records the DM wrote that the player deleted or rewrote much shorter, and records the player kept.",
  "If the removed records share a clear pattern that the kept ones do not, write ONE rule for the DM: a single plain sentence of at most 140 characters, in the imperative, about which records to write or leave out (for example: Do not record passing strangers who have no part in the story).",
  "Do not name the removed records, do not quote the story, and give no instruction about anything but which records to write and how long they are.",
  "If there is no clear pattern, return an empty rule.",
  'Output only one JSON object: {"rule": "..."} or {"rule": ""}.',
].join("\n");

/** The evidence for a rule the player asks for by hand ("Suggest a rule from my edits"): the DM's records removed or cut short in the window, any kind. Null when there are none. */
function manualEvidence(state, now) {
  const sigs = arr(state.signals).filter((g) => g.madeBy === "dm" && g.at >= now - LEARN_DAYS * 86400000);
  const gone = sigs.filter((g) => g.op === "delete");
  const short = sigs.filter((g) => g.op === "edit" && g.lenBefore > 0 && g.lenAfter <= g.lenBefore * 0.7);
  const names = uniqNames([...gone, ...short].reverse());
  if (!names.length) return null;
  const count = {};
  for (const g of gone) count[g.kind] = (count[g.kind] || 0) + 1;
  const kind = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  const total = names.length + state.entities.filter((e) => e.by !== "player" && e.status !== "past").length;
  return { n: names.length, total, share: pct(names.length, total), min: 0, thr: 0, days: LEARN_DAYS, names: names.slice(0, LEARN_NAMES_MAX), ...(kind ? { kind } : {}), manual: true };
}

/** The user message of the call that writes a rule in words: what was removed, what was cut short, what was kept. */
function learnInput(state, ev, now) {
  const all = ev.manual === true || !ev.kind;
  const sigs = arr(state.signals).filter((g) => g.madeBy === "dm" && g.at >= now - LEARN_DAYS * 86400000 && (all || g.kind === ev.kind));
  const line = (g, text) => "- " + g.kind + " " + g.name + (text ? ": " + text : "");
  const del = uniqNames([...sigs.filter((g) => g.op === "delete")].reverse()).slice(0, LEARN_NAMES_MAX);
  const delLines = del.map((n) => {
    const g = sigs.find((x) => x.op === "delete" && x.name === n);
    return line(g, cut(str(g.text), 120));
  });
  const cutLines = uniqNames([...sigs.filter((g) => g.op === "edit" && g.lenBefore > 0 && g.lenAfter <= g.lenBefore * 0.7)].reverse())
    .slice(0, LEARN_NAMES_MAX)
    .map((n) => {
      const g = sigs.find((x) => x.op === "edit" && x.name === n);
      return line(g, "from " + g.lenBefore + " to " + g.lenAfter + " characters");
    });
  const kept = state.entities.filter((e) => e.by !== "player" && e.status !== "past" && (all || e.kind === ev.kind)).slice(-4).map((e) => line(e, cut(str(e.text), 100)));
  return [
    delLines.length ? "The player deleted these records the DM wrote:\n" + delLines.join("\n") : "",
    cutLines.length ? "The player rewrote these records much shorter:\n" + cutLines.join("\n") : "",
    kept.length ? "Records the DM wrote that the player kept:\n" + kept.join("\n") : "",
    "Write the rule.",
  ].filter(Boolean).join("\n\n");
}

/**
 * The small call that writes a rule in words (#425, half B): one call of its own on the build model, not part of a DM run. It fills the first
 * pending proposal (or an errored one with `retry`), or, for `manual`, makes a new proposal from the signals. The rule is only a proposal:
 * nothing reaches the DM until the player answers.
 */
function phraseLearn(req, host, state, chat, b, now) {
  const fsx = host.fs;
  const L = learnedOf(state);
  const p = L.proposals.find((x) => x.key === "words" && (x.state === "pending" || (b.retry === true && x.state === "error")));
  if (!p && b.manual !== true) return ok({ ok: true, skipped: "nothing to write" });
  if (!p && L.proposals.some((x) => x.key === "words")) return ok({ error: "A rule in words is already waiting for your answer." }, 409);
  if (!p && L.proposals.length >= LEARN_PROPOSALS_MAX) return ok({ error: "Answer the waiting proposals first." }, 409);
  const ev = p ? p.ev : manualEvidence(state, now);
  if (!ev) return ok({ error: "Nothing to learn from yet: delete or rewrite something the DM wrote first." }, 409);
  const cfg = loadConfig(fsx);
  const built = buildResult(host, "world_learn", buildAsk(host, fsx, cfg, chat.meta, LEARN_SYSTEM, learnInput(state, ev, now)), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  countBuild(state, built, "learn", 0);
  const finish = (extra) => {
    saveState(fsx, state);
    syncQueue(fsx, state);
    return ok({ ...learnedView(fsx, state), ...extra });
  };
  if (built.error) {
    if (p) {
      p.state = "error";
      p.err = built.error.code;
    }
    learnLog(L, { at: now, act: "phrase", key: "words", result: "error", ev });
    return finish({ phraseError: built.error.message, phraseCode: built.error.code });
  }
  const rule = cleanRuleText(isObj(built.out) ? built.out.rule : "");
  if (!rule) {
    if (p) {
      L.proposals = L.proposals.filter((x) => x !== p);
      L.answered = [...L.answered, { key: "words", at: now, answer: "no", ...(ev.kind ? { kind: ev.kind } : {}) }].slice(-LEARN_ANSWERED_MAX);
    }
    learnLog(L, { at: now, act: "phrase", key: "words", result: "none", ev });
    return finish({ phraseNone: true });
  }
  if (p) {
    p.text = rule;
    p.state = "ready";
    delete p.err;
  } else L.proposals = [...L.proposals, { id: "q" + L.next++, key: "words", ev, text: rule, state: "ready", at: now }];
  learnLog(L, { at: now, act: "phrase", key: "words", result: "ok", text: rule, ev });
  return finish({});
}

/**
 * GET /world/learned?chatId=   the memory (without a chatId: the rules for all chats and who waits)
 * POST /world/learned/answer {chatId, id, answer, confirm?}   chat | all | no (a rule in words for all chats needs confirm: true)
 * POST /world/learned/rule {chatId, scope, key, to, confirm?}   write a rule by hand (key words: `to` is the text)
 * POST /world/learned/remove {chatId, id}, /edit {chatId, id, to}
 * POST /world/learned/phrase {chatId, manual?, retry?}   the small call that writes a rule in words (build model)
 * POST /world/learned/clear {chatId}   forget the names the player removed (the signals)
 * POST /world/learned/reset {chatId}   rules for this chat and for all, proposals, log and names
 */
function learnedRoute(req, host, sub) {
  const fsx = host.fs;
  const b = req.method === "POST" ? body(req) : req.query || {};
  const chatId = String(b.chatId || "");
  if (chatId && !CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = chatId ? readChat(fsx, chatId) : null;
  if (chatId && !chat) return ok({ error: "no such chat" }, 404);
  const loaded = chatId ? loadState(fsx, chatId) : null;
  if (req.method === "GET") return ok(learnedView(fsx, loaded && loaded.existed ? loaded.state : null));
  if (!loaded || !loaded.existed) return ok({ error: "this chat has no world yet" }, 409);
  const state = loaded.state;
  const now = Date.now();
  if (sub === "phrase") return phraseLearn(req, host, state, chat, b, now);
  let err = "";
  if (sub === "answer") err = answerProposal(fsx, state, str(b.id), str(b.answer), now, b.confirm === true);
  else if (sub === "rule") err = addRule(fsx, state, b.scope === "all" ? "all" : "chat", str(b.key), b.to, now, b.confirm === true);
  else if (sub === "remove") err = removeRule(fsx, state, str(b.id), now);
  else if (sub === "edit") err = editRule(fsx, state, str(b.id), b.to, now);
  else if (sub === "clear") delete state.signals;
  else if (sub === "reset") resetLearned(fsx, state);
  else return ok({ error: "not found" }, 404);
  if (err) return ok({ error: err }, err === "confirm needed" ? 409 : 400);
  saveState(fsx, state);
  syncQueue(fsx, state);
  return ok(learnedView(fsx, state));
}

// ---------- the library of saved worlds ----------
function cleanWorld(raw, id) {
  if (!isObj(raw)) return null;
  const s = normalizeState({ entities: raw.entities, fronts: raw.fronts, settings: raw.settings }, "x");
  return {
    v: 1, id, name: cut(str(raw.name), NAME_LEN) || "World", description: cut(str(raw.description), DESC_LEN),
    at: num(raw.at) || Date.now(),
    from: isObj(raw.from) ? { chatId: str(raw.from.chatId), title: cut(str(raw.from.title), 120) } : null,
    settings: s.settings, entities: s.entities.map((e) => ({ ...e, uid: 0 })), fronts: s.fronts, deck: cleanDeck(raw.deck), cast: cleanCast(raw.cast),
    ...(FOLDER_ID.test(str(raw.backgroundFolderId)) ? { backgroundFolderId: str(raw.backgroundFolderId) } : {}),
  };
}
const worldRow = (w) => ({ id: w.id, name: w.name, description: w.description, at: w.at, from: w.from, backgroundFolderId: w.backgroundFolderId || null, level: w.settings.level, records: w.entities.filter((e) => e.status === "active").length, fronts: w.fronts.filter((f) => f.status === "active").length, deck: w.deck.length, cast: w.cast.length });

export function listWorlds(fsx) {
  let files = [];
  try {
    files = fsx.list(LIBRARY_DIR.slice(0, -1)).filter((f) => f.endsWith(".json"));
  } catch {}
  const out = [];
  for (const f of files) {
    const id = f.slice(0, -5);
    const w = WORLD_ID.test(id) ? cleanWorld(readJson(fsx, LIBRARY_DIR + f, null), id) : null;
    if (w) out.push(w);
  }
  return out.sort((a, b) => b.at - a.at);
}

function libraryRoute(req, host) {
  const fsx = host.fs;
  if (req.method === "GET") return ok({ worlds: listWorlds(fsx).map(worldRow), building: listBuilding(fsx) });
  if (req.method === "DELETE") {
    const id = String((req.query && req.query.id) || "");
    if (!WORLD_ID.test(id)) return ok({ error: "id required" }, 400);
    try {
      fsx.remove(LIBRARY_DIR + id + ".json");
    } catch {}
    return ok({ ok: true, worlds: listWorlds(fsx).map(worldRow) });
  }
  const b = body(req);
  if (req.method === "PUT") {
    const id = str(b.id);
    const w = WORLD_ID.test(id) ? cleanWorld(readJson(fsx, LIBRARY_DIR + id + ".json", null), id) : null;
    if (!w) return ok({ error: "no such world" }, 404);
    if (b.name !== undefined) w.name = cut(str(b.name), NAME_LEN) || w.name;
    if (b.description !== undefined) w.description = cut(str(b.description), DESC_LEN);
    if (b.backgroundFolderId !== undefined) {
      if (FOLDER_ID.test(str(b.backgroundFolderId))) w.backgroundFolderId = str(b.backgroundFolderId);
      else delete w.backgroundFolderId;
    }
    writeJson(fsx, LIBRARY_DIR + id + ".json", w);
    return ok({ ok: true, worlds: listWorlds(fsx).map(worldRow) });
  }
  // POST: save the chat's world as it stands
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
  if (!isObj(meta)) return ok({ error: "no such chat" }, 404);
  const { state } = loadState(fsx, chatId);
  if (!state.entities.length && !state.fronts.length) return ok({ error: "this chat's world is empty" }, 409);
  if (listWorlds(fsx).length >= LIBRARY_MAX) return ok({ error: "the library is full" }, 409);
  const id = "w-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const w = cleanWorld({ ...state, deck: state.deck, name: str(b.name) || str(meta.title), description: b.description, at: Date.now(), from: { chatId, title: str(meta.title) } }, id);
  writeJson(fsx, LIBRARY_DIR + id + ".json", w);
  return ok({ ok: true, id, worlds: listWorlds(fsx).map(worldRow) });
}

/**
 * A world into another chat (user, 2026-10-18: records and fronts as they stand, clocks included): from a
 * chat or from the library. The run fields start fresh; the settings come along (off becomes chronicler).
 * A chat whose world already has records is refused unless `replace`.
 */
function carryRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const toChatId = String(b.toChatId || "");
  if (!CHAT_ID.test(toChatId)) return ok({ error: "toChatId required" }, 400);
  const chat = readChat(fsx, toChatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  let src = null;
  let origin = null;
  if (WORLD_ID.test(str(b.worldId))) {
    src = cleanWorld(readJson(fsx, LIBRARY_DIR + str(b.worldId) + ".json", null), str(b.worldId));
    origin = src && { kind: "library", worldId: src.id, name: src.name };
  } else if (CHAT_ID.test(str(b.fromChatId)) && str(b.fromChatId) !== toChatId) {
    const { state: from, existed } = loadState(fsx, str(b.fromChatId));
    src = existed ? { ...from, deck: cleanDeck(from.deck), cast: cleanCast(from.cast) } : null;
    origin = src && { kind: "chat", chatId: str(b.fromChatId), title: str(readJson(fsx, "chats/" + str(b.fromChatId) + ".meta.json", {}).title) };
  }
  if (!src) return ok({ error: "no such world" }, 404);
  const { state: old } = loadState(fsx, toChatId);
  if (old.entities.length && b.replace !== true) return ok({ error: "this chat already has a world", code: "has-world" }, 409);
  const state = emptyState(toChatId);
  state.settings = { ...cleanSettings(src.settings), ...(src.settings && src.settings.level === "off" ? { level: "chronicler" } : {}) };
  state.entities = src.entities.map((e) => ({ ...e, uid: 0 }));
  state.fronts = src.fronts;
  state.deck = cleanDeck(src.deck);
  // the cards of new people come along, as the world stands: the ones already drawn are records by now
  state.cast = cleanCast(src.cast);
  const s = normalizeState(state, toChatId);
  s.deck = state.deck;
  s.origin = { ...origin, at: Date.now() };
  // the world's backgrounds come along (user, 2026-10-19); switching by scene follows the World default
  if (FOLDER_ID.test(str(src.backgroundFolderId))) s.backgroundFolderId = str(src.backgroundFolderId);
  let meta = chat.meta;
  if (s.backgroundFolderId && !isObj(meta.autoBackground)) {
    meta = { ...meta, autoBackground: { on: loadConfig(fsx).autoBackground, folderId: s.backgroundFolderId } };
    writeJson(fsx, "chats/" + toChatId + ".meta.json", meta);
  }
  if (s.entities.length) {
    writeBook(fsx, s, str(chat.meta.title));
    bindBook(fsx, toChatId, meta, s.bookId);
  }
  saveState(fsx, s);
  const cfg = loadConfig(fsx);
  return ok({ ok: true, ...stateView(s, chat.msgs, cfg, sceneOf(fsx, toChatId, chat.msgs), playModel(fsx, cfg, chat.meta), fsx) });
}

// ---------- the chat's own scenario and first message ----------
const cleanScenario = (v) => {
  const text = isObj(v) ? cut(str(v.text), SCENARIO_MAX) : "";
  return text ? { text, mode: v.mode === "append" ? "append" : "replace" } : null;
};

/** The DM drafts the chat's scenario and first message from its world (or a library world) and its card. */
function openingRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const world = WORLD_ID.test(str(b.worldId)) ? cleanWorld(readJson(fsx, LIBRARY_DIR + str(b.worldId) + ".json", null), str(b.worldId)) : loadState(fsx, chatId).state;
  if (!world || !world.entities.length) return ok({ error: "no world to build from" }, 409);
  const cfg = loadConfig(fsx);
  const cardLines = [];
  for (const id of memberIds(fsx, chat.meta)) {
    const card = cardOf(fsx, id);
    if (!card) continue;
    cardLines.push("[" + (str(card.name) || id) + "]");
    if (str(card.description)) cardLines.push("Who: " + cutMiddle(str(card.description), 1500));
    if (str(card.scenario)) cardLines.push("Card's scenario: " + cutMiddle(str(card.scenario), 1000));
    if (str(card.first_mes)) cardLines.push("Card's first message (style only): " + cutMiddle(str(card.first_mes), 1500));
  }
  const content = [
    "The user's character: " + (userNameOf(fsx, chat.meta) || "the user") + " ({{user}}).",
    "Cards\n" + (cardLines.join("\n") || "none"),
    "World record\n" + world.entities.filter((e) => e.status === "active").map(entityLine).join("\n"),
    ...(world.fronts.filter((f) => f.status === "active").length ? ["Fronts (what moves off screen; do not reveal their plans)\n" + world.fronts.filter((f) => f.status === "active").map(frontLine).join("\n")] : []),
    ...(str(b.wish) ? ["What the player wants from this start: " + cut(str(b.wish), ANSWER_MAX)] : []),
    "Write both in " + (cut(str(b.lang), LANG_MAX) || "the language of the card's first message") + ".",
  ].join("\n\n");
  const built = buildResult(host, "world_opening", buildAsk(host, fsx, cfg, chat.meta, OPENING_SYSTEM, content, { keepMacros: true }), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  if (built.error) return ok({ ok: false, error: built.error.message, code: built.error.code });
  const scenario = cut(str(built.out.scenario), SCENARIO_MAX);
  const opening = cut(str(built.out.opening), OPENING_MAX);
  if (!scenario && !opening) return ok({ ok: false, error: "The build model wrote neither a scenario nor a first message.", code: "empty" });
  return ok({ ok: true, scenario, opening, model: built.run.model, usage: built.usage });
}

/**
 * Set the chat's own scenario (meta.worldScenario; null = the card's again) and, before the player's first
 * message, its first message: the new text becomes the greeting's first swipe, the card's greetings stay
 * behind it as swipes.
 */
function overrideRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const opening = cut(str(b.opening), OPENING_MAX);
  if (opening && chat.msgs.some((m) => m.role === "user")) return ok({ error: "the chat has already started", code: "started" }, 409);
  const meta = { ...chat.meta };
  if (b.scenario !== undefined) {
    const sc = cleanScenario(b.scenario);
    if (sc) meta.worldScenario = sc;
    else delete meta.worldScenario;
  }
  let msgs = chat.msgs;
  if (opening) {
    const i = msgs.findIndex((m) => m.greeting === true && m.role !== "system");
    const userName = userNameOf(fsx, meta) || "User";
    const text = opening.split("{{user}}").join(userName);
    if (i >= 0) {
      const g = msgs[i];
      const name = str(g.name);
      const shown = text.split("{{char}}").join(name);
      const old = arr(g.swipes).filter((t) => typeof t === "string" && t !== shown);
      msgs = msgs.map((m, k) => (k === i ? { ...m, text: shown, swipes: [shown, ...old], swipe: 0, ...(isObj(m.extra) && Array.isArray(m.extra.swipeMeta) ? { extra: { ...m.extra, swipeMeta: [null, ...m.extra.swipeMeta] } } : {}) } : m));
    } else {
      const card = meta.characterId ? cardOf(fsx, meta.characterId) : null;
      const name = card ? str(card.name) : "Narrator";
      const shown = text.split("{{char}}").join(name);
      const id = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      msgs = [card ? { id, name, charId: meta.characterId, role: "char", text: shown, at: Date.now(), swipes: [shown], swipe: 0, greeting: true } : { id, name, charId: null, role: "system", text: shown, at: Date.now(), swipes: [shown], swipe: 0, greeting: true }, ...msgs];
    }
    fsx.write("chats/" + chatId + ".jsonl", msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
  }
  meta.updatedAt = Date.now();
  writeJson(fsx, "chats/" + chatId + ".meta.json", meta);
  return ok({ ok: true, scenario: meta.worldScenario || null, opening: !!opening });
}

// ---------- backgrounds (user, 2026-10-19) ----------
// Pre-generated sets, no live per-scene generation. The build model plans the set (an English file name,
// tags and an image prompt per place); the app draws each image with its image model, stores it as WebP
// in the asset store and files it in the world's folder of the Backgrounds library. A vision model names
// the player's own images the same way. The Dashboard sensor picks among them by scene (its own switch).
const FILE_NAME = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const FILE_MAX = 60;
const TAGS_MAX = 6;
const PLACES_MAX = 30;
const VARIANTS_MAX = 3;
const PROMPT_MAX = 1200;

export const BACKGROUNDS_SYSTEM = [
  "You plan background images for the places of a roleplay story. Each image is a wide scene background the story's chat shows behind the text.",
  "For each place and variant:",
  "- file: a short English name for the image file, 1 to 4 words in snake_case (a-z, 0-9, _), naming the place: tavern, tavern_kitchen, red_tower. A second variant of a place ends in _2, a third in _3.",
  "- tags: 2 to 6 English words for kind, time, weather and mood (inn, night, rain, crowded), so a scene can be matched to it.",
  "- prompt: an English prompt for an image model: the place, its light, time and mood, in the style direction given; a wide establishing view with no people unless the place needs a crowd; no text, no captions. Variants differ in time of day, weather or angle.",
  "Output: one JSON object and nothing else, no code fences:",
  '{"images":[{"place":"the place\'s name as given","file":"...","tags":["..."],"prompt":"..."}]}',
].join("\n");

export const NAME_IMAGE_SYSTEM = [
  "You name a background image of a roleplay story so a scene can be matched to it.",
  "- file: a short English name, 1 to 4 words in snake_case (a-z, 0-9, _), naming the place shown: tavern, forest_path, throne_room.",
  "- tags: 2 to 6 English words for kind, time, weather and mood (inn, night, rain, crowded).",
  "Output: one JSON object and nothing else, no code fences:",
  '{"file":"...","tags":["..."]}',
].join("\n");

export const cleanFile = (v) => {
  const f = str(v).toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return FILE_NAME.test(f) ? cut(f, FILE_MAX).replace(/_$/, "") : "";
};
export const cleanTags = (v) => [...new Set(arr(v).map((t) => cleanFile(t).replace(/_/g, " ")).filter(Boolean))].slice(0, TAGS_MAX);

/** The planned set: known places only, file names unique (a clash gets _2, _3), up to `variants` per place. */
export function cleanPlan(out, places, variants, taken = []) {
  const used = new Set(taken.map((t) => cleanFile(t)).filter(Boolean));
  const per = new Map();
  const images = [];
  for (const raw of arr(isObj(out) ? out.images : null)) {
    if (!isObj(raw)) continue;
    const place = places.find((p) => sameName(p.name, str(raw.place))) || (places.length === 1 ? places[0] : null);
    if (!place) continue;
    const n = per.get(place.name) || 0;
    if (n >= variants) continue;
    const prompt = cut(str(raw.prompt), PROMPT_MAX);
    let file = cleanFile(raw.file) || cleanFile(place.name) || "place";
    if (!prompt) continue;
    for (let i = 2; used.has(file); i++) file = cut(file.replace(/_\d+$/, ""), FILE_MAX - 3) + "_" + i;
    used.add(file);
    per.set(place.name, n + 1);
    images.push({ place: place.name, file, tags: cleanTags(raw.tags), prompt });
  }
  return images;
}

export function backgroundsInput({ places, direction, variants, lang }) {
  return [
    "Style direction for the whole set: " + (direction || "painterly, atmospheric, cinematic light") + ".",
    "Variants per place: " + variants + ".",
    "Places\n" + places.map((p) => "- " + p.name + (arr(p.aliases).length ? " (also called: " + arr(p.aliases).slice(0, 4).join(", ") + ")" : "") + (str(p.inside) ? " [inside " + str(p.inside) + "]" : "") + (p.text ? ": " + cutMiddle(p.text, 400) : "")).join("\n"),
    ...(lang ? ["The place names are in " + lang + "; the file names, tags and prompts are always English."] : []),
  ].join("\n\n");
}

/** The world's places: its active place records, for the set's list (the player adds their own). */
/**
 * Entries of the chat's card and group books, offered as places to pick (user, 2026-10-19: places should come
 * semi-automatically from the card and its lorebook). No model call: the player ticks the ones that are places.
 */
export function bookChoices(fsx, meta) {
  if (!isObj(meta)) return [];
  const books = [];
  const add = (list) => {
    for (const id of list) if (!books.includes(id) && id !== str(meta.worldBookId)) books.push(id);
  };
  for (const id of memberIds(fsx, meta)) {
    const card = cardOf(fsx, id);
    if (card) add(booksOf(card));
  }
  if (meta.groupId) {
    const group = readJson(fsx, "groups/" + meta.groupId + ".json", null);
    if (isObj(group)) add(booksOf(group));
  }
  const out = [];
  for (const id of books) {
    const book = readJson(fsx, "lorebooks/" + id + ".json", null);
    if (!isObj(book) || str(book.ownerChatId)) continue;
    for (const e of arr(book.entries)) {
      if (!isObj(e) || e.enabled === false) continue;
      const name = cut(str(e.title) || arr(e.keys).map(str).find(Boolean) || "", NAME_MAX);
      if (name && !out.some((x) => sameName(x.name, name))) out.push({ name, text: cut(str(e.content), 300), book: str(book.name) || id });
      if (out.length >= BOOK_CHOICES_MAX) return out;
    }
  }
  return out;
}
const BOOK_CHOICES_MAX = 60;

export const FIND_PLACES_SYSTEM = [
  "You read the cards and the world record of a roleplay story and list the places where its scenes can happen: rooms, houses, streets, towns, landscapes. Only places the text names or plainly describes; never people, groups, things or events.",
  "- For each: a short name as the text calls it, and one plain sentence of what it looks like.",
  "- Only the JSON keys are English; names and text stay in the language of the source.",
  "Output: one JSON object and nothing else, no code fences:",
  '{"places":[{"name":"...","text":"..."}]}',
].join("\n");

/** The cards' text (the first chunk) and the world's records, for finding places. */
export function findPlacesInput({ chunk, entities }) {
  return [
    chunk ? "Cards\n" + chunk : "Cards: none",
    "World record\n" + (arr(entities).filter((e) => e.status === "active").map(entityLine).join("\n") || "empty"),
    "Task: list up to " + PLACES_MAX + " places.",
  ].join("\n\n");
}

/** POST {chatId|worldId}: the build model finds the places named in the cards and the world (two-phase). */
function findPlacesRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const worldId = str(b.worldId);
  const chatId = str(b.chatId);
  const lib = WORLD_ID.test(worldId);
  if (!lib && !CHAT_ID.test(chatId)) return ok({ error: "chatId or worldId required" }, 400);
  const world = lib ? cleanWorld(readJson(fsx, LIBRARY_DIR + worldId + ".json", null), worldId) : loadState(fsx, chatId).state;
  if (!world) return ok({ error: "no such world" }, 404);
  const meta = lib ? null : readJson(fsx, "chats/" + chatId + ".meta.json", null);
  const chunk = isObj(meta) ? chunkSources(startSources(fsx, meta, undefined))[0] || "" : "";
  if (!chunk && !world.entities.length) return ok({ error: "nothing to read: no cards and no records", code: "no-text" }, 409);
  const cfg = loadConfig(fsx);
  const built = buildResult(host, "world_places", buildAsk(host, fsx, cfg, isObj(meta) ? meta : null, FIND_PLACES_SYSTEM, findPlacesInput({ chunk, entities: world.entities })), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  if (built.error) return ok({ ok: false, error: built.error.message, code: built.error.code });
  const places = [];
  for (const p of arr(built.out.places)) {
    const name = isObj(p) ? cut(str(p.name), NAME_MAX) : "";
    if (name && !places.some((x) => sameName(x.name, name))) places.push({ name, text: cut(str(p.text), TEXT_MAX) });
    if (places.length >= PLACES_MAX) break;
  }
  return ok({ ok: true, places, model: built.run.model, usage: built.usage });
}

function worldPlaces(fsx, b) {
  const w = WORLD_ID.test(str(b.worldId)) ? cleanWorld(readJson(fsx, LIBRARY_DIR + str(b.worldId) + ".json", null), str(b.worldId)) : CHAT_ID.test(str(b.chatId)) ? loadState(fsx, str(b.chatId)).state : null;
  return w ? w.entities.filter((e) => e.status === "active" && e.kind === "place").map((e) => ({ name: e.name, text: e.text, aliases: e.aliases, ...(e.inside ? { inside: e.inside } : {}), ...(e.background ? { background: e.background } : {}) })) : [];
}

/**
 * GET: the world's places and its folder. POST {chatId|worldId, places, direction?, variants?, taken?}: the build
 * model plans the set (two-phase). PUT {chatId|worldId, folderId|null}: link the world to a folder.
 */
function backgroundsRoute(req, host) {
  const fsx = host.fs;
  const q = req.method === "GET" || req.method === "DELETE" ? req.query || {} : body(req);
  const worldId = str(q.worldId);
  const chatId = str(q.chatId);
  if (!WORLD_ID.test(worldId) && !CHAT_ID.test(chatId)) return ok({ error: "chatId or worldId required" }, 400);
  const lib = WORLD_ID.test(worldId);
  const world = lib ? cleanWorld(readJson(fsx, LIBRARY_DIR + worldId + ".json", null), worldId) : loadState(fsx, chatId).state;
  if (!world) return ok({ error: "no such world" }, 404);
  if (req.method === "GET") {
    const meta = lib ? null : readJson(fsx, "chats/" + chatId + ".meta.json", null);
    return ok({ places: worldPlaces(fsx, q), fromBooks: bookChoices(fsx, meta), folderId: world.backgroundFolderId || null });
  }
  if (req.method === "PUT") {
    const folder = FOLDER_ID.test(str(q.folderId)) ? str(q.folderId) : null;
    if (folder) world.backgroundFolderId = folder;
    else delete world.backgroundFolderId;
    if (lib) writeJson(fsx, LIBRARY_DIR + worldId + ".json", world);
    else {
      const { state, existed } = loadState(fsx, chatId);
      if (!existed && !folder) return ok({ ok: true, folderId: null });
      if (folder) state.backgroundFolderId = folder;
      else delete state.backgroundFolderId;
      saveState(fsx, state);
    }
    return ok({ ok: true, folderId: folder });
  }
  const places = arr(q.places).map((p) => (isObj(p) ? { name: cut(str(p.name), NAME_MAX), text: cut(str(p.text), TEXT_MAX) } : { name: cut(str(p), NAME_MAX), text: "" }))
    .filter((p) => p.name).slice(0, PLACES_MAX);
  if (!places.length) return ok({ error: "no places" }, 400);
  const variants = clamp(Math.round(num(q.variants)) || 1, 1, VARIANTS_MAX);
  const cfg = loadConfig(fsx);
  const meta = CHAT_ID.test(chatId) ? readJson(fsx, "chats/" + chatId + ".meta.json", null) : null;
  const content = backgroundsInput({ places, direction: cut(str(q.direction), 600), variants, lang: cut(str(q.lang), LANG_MAX) });
  const built = buildResult(host, "world_backgrounds", buildAsk(host, fsx, cfg, isObj(meta) ? meta : null, BACKGROUNDS_SYSTEM, content), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  if (built.error) return ok({ ok: false, error: built.error.message, code: built.error.code });
  const images = cleanPlan(built.out, places, variants, arr(q.taken).map(str));
  if (!images.length) return ok({ ok: false, error: "The build model planned no image for these places.", code: "empty" });
  return ok({ ok: true, images, imageModel: cfg.imageModel, model: built.run.model, usage: built.usage });
}

/** A vision model names one background: {image: {data, mimeType}, model?, hint?} -> {file, tags}. */
function nameImageRoute(req, host) {
  const b = body(req);
  const img = isObj(b.image) && str(b.image.data) && /^image\//.test(str(b.image.mimeType)) ? { data: String(b.image.data), mimeType: str(b.image.mimeType) } : null;
  if (!img) return ok({ error: "image required" }, 400);
  const r = host.llm.results.world_name;
  if (!r) {
    const model = MODEL_REF.test(str(b.model)) ? str(b.model) : "";
    host.llm.request("world_name", {
      // no model named: the engine's Vision model (Settings)
      ...(model ? { model } : {}),
      systemPrompt: NAME_IMAGE_SYSTEM,
      messages: [{ role: "user", content: "Name this background." + (str(b.hint) ? " Its current name: " + cut(str(b.hint), 80) + "." : "") }],
      images: [img],
      presetParams: { temperature: 0.2, max_tokens: 400 },
    });
    return { __llmPending: true };
  }
  const limit = limitOf(r);
  if (r.error || !str(r.text)) return ok({ ok: false, ...classifyError(r, limit) });
  const out = firstJson(r.text);
  const file = out ? cleanFile(out.file) : "";
  if (!file) return ok({ ok: false, code: "not-json", message: "The vision model did not name the image.", details: cut(str(r.text), 600) });
  return ok({ ok: true, file, tags: cleanTags(out.tags), model: str(r.model) });
}

// ---------- routes ----------
function body(req) {
  return isObj(req.body) ? req.body : {};
}

/** The newest run of the log, as the sheet and the hub show it. */
function lastRunOf(state) {
  const r = state.log[state.log.length - 1];
  return isObj(r) ? runView(r) : null;
}

function runView(r) {
  return {
    at: num(r.at), reason: str(r.reason), changes: Math.round(num(r.changes)), fronts: Math.round(num(r.fronts)),
    summary: str(r.summary), model: str(r.model), ms: Math.round(num(r.ms)),
    usage: isObj(r.usage) ? cleanUsage(r.usage) : null, limit: cleanLimit(r.limit),
    behind: Math.round(num(r.behind)), retried: r.retried === true,
    ...(r.undone === true ? { undone: true } : {}),
    ...(ERROR_CODES.includes(r.error) ? { error: r.error } : {}),
  };
}

function stateView(state, msgs, cfg, scene, play, fsx) {
  const unread = unreadMessages(msgs, state.lastKey);
  return {
    settings: state.settings,
    // the DM's memory for the chat panel's line and the dots: rules in force, proposals waiting
    learn: fsx ? learnCounts(fsx, state) : { on: true, rules: 0, waiting: 0 },
    // the dice in force (the chat's own over the profile's), for the sheet
    dice: state.settings.level === "off" || !fsx ? null : diceOf(profileFor(fsx, state.settings), state.settings),
    ready: READY_LEVELS,
    // the profile in force (its own one, else the level's)
    profile: state.settings.level === "off" ? null : state.settings.profile || state.settings.level,
    bookId: state.bookId,
    records: state.entities.filter((e) => e.status === "active").length,
    retired: state.entities.filter((e) => e.status === "past").length,
    // the chat panel's tiles (#424, step 3): active records per kind, old notes still in the book, and what is not active (retired or tidied up)
    kinds: Object.fromEntries(WRITE_KINDS.map((k) => [k, state.entities.filter((e) => e.kind === k && e.status === "active").length])),
    notes: state.entities.filter((e) => e.kind === "fact" && e.status === "active").length,
    archive: state.entities.filter((e) => e.status !== "active").length,
    dueIn: dueIn(state, msgs),
    lastRunAt: state.lastRunAt ?? null,
    lastSummary: state.log.length ? str(state.log[state.log.length - 1].summary) : "",
    lastError: state.lastError ?? null,
    model: cfg.model,
    // what the DM goes by now, and whether an event is waiting (not what it is: the world stays the DM's)
    direction: directionOf(state, scene || null),
    sensor: !!scene,
    fronts: state.fronts.filter((f) => f.status === "active").length,
    eventWaiting: !!(state.event && state.event.sent === 0),
    // the play model in force for this chat and where it comes from (world, sensor, litopys, chat, default)
    play: play || null,
    lastRun: lastRunOf(state),
    usage: state.usage || { input: 0, output: 0, cost: 0, runs: 0 },
    // unread text one run cannot read: "Read the whole chat" runs until it is 0
    behind: state.settings.level === "off" ? { messages: 0, runs: 0 } : behindOf(unread),
    // Start: a draft in progress, how many deck cards are left (not their text), where the world came from
    draft: draftView(state.draft || null),
    deck: arr(state.deck).length,
    // the cast deck: how many cards of new people are left (not who they are)
    cast: arr(state.cast).length,
    // the app calls POST /world/cast/refill once after a run when this is true
    castRefill: refillDue(state, msgs.filter(isReply).length),
    origin: state.origin || null,
    backgroundFolderId: state.backgroundFolderId || null,
  };
}

/**
 * The DM is on for every chat from its first reply (user, 2026-10-29), at the chronicler's level: a chat
 * with no state file counts as switched on, and the first run writes the file. A switch-off writes the
 * file with level "off", which is what keeps it off. Not for a chat whose cards are all assistants:
 * they are no story and there is no world to keep (the player can still switch it on by hand).
 */
export function autoOn(fsx, meta) {
  const ids = memberIds(fsx, meta);
  if (!ids.length) return true;
  return ids.some((id) => {
    const card = readJson(fsx, "characters/" + id + "/card.json", null);
    const ext = isObj(card) && isObj(card.extensions) ? card.extensions : {};
    return str(ext.molfar_card_type) !== "assistant";
  });
}

/**
 * The settings of a chat the DM switches itself on for (autoOn): the default profile's level, its own profile and its
 * numbers (every N, still, transition, insert), else the chronicler as before. A default that was deleted since falls
 * back to the chronicler, and a chat that is already on keeps what it has: this runs only for a chat with no state file.
 * The DM "off" is never a default (config.defaultProfile holds a profile, and "off" is not one).
 */
export function startSettings(fsx, settings, cfg) {
  const id = (cfg || loadConfig(fsx)).defaultProfile;
  const p = id ? loadProfile(fsx, id) : null;
  // a new chat brings people back from the start (#424): the profile's Frequency, else Normal
  if (!p) return { ...settings, level: "chronicler", cast: settings.cast === "off" ? DEFAULT_OPTIONS.cast : settings.cast, castDeck: DEFAULT_OPTIONS.castDeck };
  return cleanSettings({ ...settings, ...p.defaults, level: p.base, profile: p.builtIn ? "" : p.id, cast: p.options && CAST_FREQ.includes(p.options.cast) ? p.options.cast : DEFAULT_OPTIONS.cast, castDeck: p.options && typeof p.options.castDeck === "boolean" ? p.options.castDeck : DEFAULT_OPTIONS.castDeck });
}

/** Where a DM that starts now begins reading: the last few messages, not the whole story. */
function startKeyOf(msgs, settings) {
  const unread = msgs.slice(-Math.max(2, settings.everyN * 2));
  const before = msgs[msgs.length - unread.length - 1];
  return before ? keyOf(before) : null;
}

function stateRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(host.fs, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const cfg = loadConfig(host.fs);
  const { state, existed } = loadState(host.fs, chatId);
  if (!existed && autoOn(host.fs, chat.meta)) state.settings = startSettings(host.fs, state.settings, cfg);
  return ok(stateView(state, chat.msgs, cfg, sceneOf(host.fs, chatId, chat.msgs), playModel(host.fs, cfg, chat.meta), host.fs));
}

/** "Look at the world": the records only, newest first; the DM's plans (fronts, the event) stay its own. */
/** The records of a chat's world, or of a saved world of the library ({worldId}). */
function peekRoute(req, host) {
  const worldId = String((req.query && req.query.worldId) || "");
  const chatId = String((req.query && req.query.chatId) || "");
  let state;
  if (WORLD_ID.test(worldId)) {
    state = cleanWorld(readJson(host.fs, LIBRARY_DIR + worldId + ".json", null), worldId);
    if (!state) return ok({ error: "no such world" }, 404);
  } else {
    if (!CHAT_ID.test(chatId)) return ok({ error: "chatId or worldId required" }, 400);
    state = loadState(host.fs, chatId).state;
  }
  const records = state.entities
    .map((e) => ({ id: e.id, kind: e.kind, name: e.name, aliases: e.aliases, text: e.text, status: e.status, at: e.at ?? 0, ...(e.by ? { by: e.by } : {}), ...(e.why ? { why: e.why } : {}), ...(e.src ? { src: e.src } : {}), ...(e.pinned ? { pinned: true } : {}), ...(e.size ? { size: e.size } : {}), ...(e.inside ? { inside: e.inside } : {}), ...(e.holder ? { holder: e.holder } : {}), ...(e.place ? { place: e.place } : {}), ...(e.members ? { members: e.members } : {}), ...(e.visits ? { visits: e.visits } : {}), ...(e.background ? { background: e.background } : {}), ...(e.relation ? { relation: e.relation } : {}), ...(e.weight !== undefined ? { weight: e.weight } : {}), ...(e.link ? { link: e.link } : {}), ...(e.noReturn ? { noReturn: true } : {}), ...(e.hook ? { hook: e.hook } : {}) }))
    .sort((a, b) => (a.status === b.status ? b.at - a.at : a.status === "active" ? -1 : 1));
  return ok({ records });
}

/** The Dashboard's "Here" and "Outfit and things": the place, what is in it, what the people in the scene wear and carry, and what the last run changed. */
function hereRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(host.fs, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state, existed } = loadState(host.fs, chatId);
  const on = existed ? state.settings.level !== "off" : autoOn(host.fs, chat.meta);
  const userName = userNameOf(host.fs, chat.meta);
  const h = hereOf(state, sceneOf(host.fs, chatId, chat.msgs), userName ? [userName] : [], regView(host.fs, chatId));
  const rec = (e) => ({ id: e.id, name: e.name, kind: e.kind, text: e.text, aliases: e.aliases, ...(e.size ? { size: e.size } : {}), ...(e.inside ? { inside: e.inside } : {}), ...(e.holder ? { holder: e.holder } : {}), ...(e.place ? { place: e.place } : {}), ...(e.members ? { members: e.members } : {}), ...(e.visits ? { visits: e.visits } : {}), ...(e.background ? { background: e.background } : {}) });
  const heldRows = Object.entries(h.held).flatMap(([who, list]) => list.map((t) => ({ ...rec(t), who })));
  return ok({
    on,
    scenePlace: h.scenePlace,
    // the picture bound to the scene's place (a spot without one takes its place's), for "Change the background by scene"
    background: (h.place && h.place.background) || (h.parent && h.parent.background) || null,
    place: h.place ? rec(h.place) : null,
    parent: h.parent ? rec(h.parent) : null,
    spots: h.spots.map(rec),
    things: h.things.map(rec),
    held: heldRows,
    asleep: h.asleep.map(rec),
    carry: h.carry,
    // who keeps the outfit (the sensor or the DM), and the sensor's own lines, to compare
    carrySource: h.carrySource,
    sensor: h.sensor,
    present: h.present,
    changed: state.lastChange || { at: 0, ids: [], carry: [] },
  });
}

function settingsRoute(req, host) {
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(host.fs, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  if (b.level !== undefined && !READY_LEVELS.includes(b.level)) return ok({ error: "unknown or unfinished level" }, 400);
  const { state, existed } = loadState(host.fs, chatId);
  // a save that does not touch the level (the dice, a limit) must not switch off a chat that is on by default
  if (!existed && b.level === undefined && b.profile === undefined && autoOn(host.fs, chat.meta)) state.settings = startSettings(host.fs, state.settings);
  const patch = {};
  for (const k of ["level", "everyN", "recordsEveryN", "stagnation", "onTransition", "onPlace", "insert", "textMax", "changesMax", "carrySource", "dice", "diceStat", "diceChance", "diceTilt", "diceLife", "dicePace", "diceShow", "cast", "castShow", "tidy", "castDeck", "castPer", "castLen", "things", "learn"]) if (b[k] !== undefined) patch[k] = b[k];
  // a profile picks the level too: a built-in one is the level itself, an own one runs on its base
  if (b.profile !== undefined) {
    const p = str(b.profile) ? loadProfile(host.fs, str(b.profile)) : null;
    if (str(b.profile) && !p) return ok({ error: "no such profile" }, 400);
    patch.level = p ? p.base : patch.level;
    patch.profile = p && !p.builtIn ? p.id : "";
    // first switched on with this profile: its defaults; later the chat's own numbers stay
    if (p && state.settings.level === "off") Object.assign(patch, p.defaults, Object.fromEntries(["everyN", "stagnation", "onTransition", "insert"].filter((k) => b[k] !== undefined).map((k) => [k, b[k]])));
  } else if (b.level !== undefined) patch.profile = "";
  const next = cleanSettings({ ...state.settings, ...patch });
  // switched on for the first time: the DM starts reading from now, not from the first message
  // (also when a state file was saved with the DM off and it never ran: lastKey is still null)
  const fresh = !existed || (state.settings.level === "off" && state.lastKey === null && !state.lastRunAt);
  if (fresh && next.level !== "off" && chat.msgs.length && b.fromStart !== true) state.lastKey = startKeyOf(chat.msgs, next);
  // a DM switched on for the first time brings people back too, unless the request says otherwise
  if (fresh && next.level !== "off" && b.cast === undefined && next.cast === "off") next.cast = DEFAULT_OPTIONS.cast;
  // and draws new people from the cast deck (the player's own word on the switch stays)
  if (fresh && next.level !== "off" && b.castDeck === undefined) next.castDeck = DEFAULT_OPTIONS.castDeck;
  // switched off, or a level with no state worth carrying: nothing waits to be sent
  if (next.cast === "off" || next.level === "off" || (!next.castDeck && state.entrance && state.entrance.src === "deck" && !(state.entrance.sent > 0))) delete state.entrance;
  // a level with no events drops a waiting one
  if ((next.level === "off" || next.level === "chronicler") && state.event) state.event = null;
  state.settings = next;
  saveState(host.fs, state);
  const cfg = loadConfig(host.fs);
  return ok(stateView(state, chat.msgs, cfg, sceneOf(host.fs, chatId, chat.msgs), playModel(host.fs, cfg, chat.meta), host.fs));
}

/** The config with the models in force (for a chat when chatId names one). */
function configView(fsx, cfg, chatId) {
  const meta = CHAT_ID.test(chatId) ? readJson(fsx, "chats/" + chatId + ".meta.json", null) : null;
  const m = isObj(meta) ? meta : null;
  return { ...cfg, play: playModel(fsx, cfg, m), build: buildModel(fsx, cfg, m) };
}

function configRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (req.method === "GET") return ok(configView(host.fs, loadConfig(host.fs), chatId));
  const b = body(req);
  const cur = loadConfig(host.fs);
  const patch = {};
  for (const k of ["model", "buildModel", "maxTokens", "imageModel", "autoBackground", "defaultProfile"]) if (b[k] !== undefined) patch[k] = b[k];
  // only a profile that exists can be the default ("" and "chronicler" both mean the chronicler)
  if (patch.defaultProfile !== undefined && str(patch.defaultProfile) && !loadProfile(host.fs, str(patch.defaultProfile))) return ok({ error: "no such profile" }, 400);
  const next = cleanConfig({ ...cur, ...patch });
  saveConfig(host.fs, next);
  return ok(configView(host.fs, next, chatId));
}

/** Writes only what differs from the defaults; the file goes away when nothing does. */
function saveConfig(fsx, next) {
  const diff = {};
  for (const k of Object.keys(DEFAULT_CONFIG)) if (next[k] !== DEFAULT_CONFIG[k]) diff[k] = next[k];
  if (Object.keys(diff).length) writeJson(fsx, CONFIG_FILE, diff);
  else {
    try {
      fsx.remove(CONFIG_FILE);
    } catch {}
  }
}

const isRateLimit = (r) => /429|rate.?limit/i.test(String(r.error || ""));

/** The limit a call went out with, from the engine's echo of its params. */
export function limitOf(r) {
  const p = isObj(r && r.requestParams) ? r.requestParams : {};
  if (!Number.isFinite(Number(p.max_tokens))) return null;
  const from = isObj(p.from) ? p.from : {};
  return { max: Math.round(Number(p.max_tokens)), block: str(p.block) || null, fromModel: from.max_tokens === "model" };
}

/** A reply that is all thinking and no answer. */
const thinkingOnly = (r) => !r.error && !str(r.text) && !!str(r.reasoning);

/**
 * A failed call as one plain sentence and a code the app says in the player's language (world.err.<code>);
 * the provider's own text stays in details. The next step is in the sentence: the player cannot be
 * expected to know the engine (user, 2026-10-18).
 */
export function classifyError(r, limit) {
  const raw = String((r && r.error) || "");
  const details = raw ? cut(raw, 1200) : "";
  const e = (code, message) => ({ code, message, ...(details ? { details } : {}), ...(limit ? { limit } : {}) });
  if (r && thinkingOnly(r)) {
    if (limit && limit.fromModel) return e("thinking-block", "The model spent its whole limit (" + limit.max + " tokens) thinking and wrote no answer. The limit comes from this model's " + (limit.block || "World DM") + " parameters in API connections: raise it there, or pick a model that does not think.");
    return e("thinking", "The model spent its whole limit thinking and wrote no answer, even with more room. Pick a model that does not think, or give it a bigger limit in its parameters in API connections.");
  }
  if (/disabl\w* reasoning|reasoning\W.*(cannot|can't|not).*(disabl|off)|always thinks/i.test(raw)) return e("reasoning-off", "This model always thinks and cannot turn thinking off. Set Reasoning to on (not off) in its parameters in API connections, or pick another model.");
  if (/429|rate.?limit|too many requests/i.test(raw)) return e("rate", "The provider is busy (rate limit). The same messages are read next time.");
  if (/context|too long|maximum.*tokens|token limit/i.test(raw)) return e("context", "The DM's input is too big for this model. Pick a model with a bigger context.");
  if (/\b40[13]\b|unauthori|api key|forbidden/i.test(raw)) return e("auth", "The provider refused the key. Check the connection in API connections.");
  if (/\b404\b|no such model|model.*not found|unknown model/i.test(raw)) return e("model", "The provider does not know this model. Pick another one.");
  if (raw) return e("other", cut(raw.split("\n")[0], 300));
  return e("empty", "The model returned nothing.");
}

function updateRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state, existed } = loadState(fsx, chatId);
  const cfg = loadConfig(fsx);
  // the first run of a chat that never had a state file: the DM switches itself on (see autoOn)
  if (!existed && autoOn(fsx, chat.meta)) {
    state.settings = startSettings(fsx, state.settings, cfg);
    if (chat.msgs.length) state.lastKey = startKeyOf(chat.msgs, state.settings);
    saveState(fsx, state);
  }
  // a reply deleted or swiped since the last run takes its changes with it (#75); the run then reads from the older point
  if (existed) {
    settle(fsx, state, chat, "");
    runTidy(fsx, state, chat, false);
    // what the player removed and rewrote may call for a proposal (code only, no model call)
    if (raiseProposals(state, Date.now())) {
      saveState(fsx, state);
      syncQueue(fsx, state);
    }
  }
  const auto = b.auto === true || b.auto === "true";
  // the DM off: the book still fills, but only by the sweep after a reply, and not in a chat that never had a world (an assistant)
  if (state.settings.level === "off" && (!auto || (!existed && !autoOn(fsx, chat.meta)))) return ok({ ok: true, skipped: "off" });
  if (state.settings.level === "off" && state.lastKey === null && chat.msgs.length) state.lastKey = startKeyOf(chat.msgs, state.settings);
  const unread = unreadMessages(chat.msgs, state.lastKey);
  if (!unread.some((m) => str(m.text))) return ok({ ok: true, skipped: "nothing new" });
  const scene = sceneOf(fsx, chatId, chat.msgs);
  // off reads as the chronicler here: it records, it does not move fronts or send events
  const level = state.settings.level === "off" ? "chronicler" : state.settings.level;
  // an explicit scene freezes the DM, a World turn and chaos included; it waits until the scene ends
  if (directionOf(state, scene) === "explicit") return ok({ ok: true, skipped: "explicit" });
  const reason = auto ? dueReason(state, chat.msgs, scene) : "manual";
  if (!reason) return state.settings.level === "off" ? ok({ ok: true, skipped: "off" }) : ok({ ok: true, skipped: "waiting", dueIn: dueIn(state, chat.msgs) });
  // a scene written because the story left it, or the records' own turn: records only, the fronts and events keep their cadence
  const recordsOnly = reason === "place" || reason === "records" || reason === "sweep" || state.settings.level === "off";
  const sweep = sweepCandidates(state, scene);
  const stash = isObj(req.stash) ? req.stash : {};
  const retry = stash.retry === true;
  const key = retry ? "world_retry" : "world";
  const r = host.llm.results[key];
  // the model answered about a message that is gone now (deleted or swiped while it worked): its answer is stale
  if (r && str(stash.upTo) && !chat.msgs.some((m) => keyOf(m) === str(stash.upTo))) return ok({ ok: true, skipped: "story changed" });
  const cards = cardNames(fsx, chat.meta);
  const userName = userNameOf(fsx, chat.meta);
  const runReg = openRegistry(fsx, chatId, chat.meta);
  const cast = castOf(runReg, cards);
  const tracked = trackedThings(state, scene, runReg, sweep);
  const play = playModel(fsx, cfg, chat.meta);
  // what this run reads: every unread message (cut to a fair share), or the oldest part when far behind
  const take = takeUnread(unread);
  const catchingUp = take.rest.length > 0;
  const profile = profileFor(fsx, state.settings);
  const options = (profile && profile.options) || DEFAULT_OPTIONS;
  // the records the DM reads in full this run; the others go in as one line (see fullRecordIds). The set is the same for a retry.
  const runFreq = state.settings.level !== "off" && CAST_FREQ.includes(state.settings.cast) ? state.settings.cast : "off";
  const runCast = runFreq !== "off" ? castContext(fsx, chatId) : null;
  const soonWho = runCast ? benchSoonList({ state, msgs: chat.msgs, snaps: runCast.snaps, reg: runCast.reg, personIds: runCast.personIds, freq: runFreq, within: state.settings.everyN }) : [];
  const soon = soonWho.map((x) => x.id);
  const fullIds = fullRecordIds(state, { story: take.msgs.map((m) => str(m.text)).join("\n"), scene, reg: runReg.reg, soon });
  const ask = (k, maxTokens) => {
    host.llm.request(k, {
      ...(play.model ? { model: play.model } : {}),
      systemPrompt: systemFor(profile || level, state.settings, recordsOnly),
      messages: [{ role: "user", content: expandNamesFor(fsx, chat.meta, dmInput({
        cards: cast, userName, entities: state.entities, msgs: take.msgs, cap: take.cap, catchingUp, level: recordsOnly ? "chronicler" : level, options, place: scene && scene.place, placeId: scene && scene.placeId, sweep, tracked, full: fullIds, removed: removedNames(state, 30), learned: learnedInput(state.settings, state.learned, loadLearned(fsx)), soon: soonWho, carry: state.settings.carrySource === "dm" ? state.carry : undefined,
        deck: options.deck ? state.deck || [] : null,
        since: recordsOnly ? [] : eventSince(state.event, chat.msgs, keyOf(take.msgs[0])),
        fronts: state.fronts, event: state.event, direction: directionOf(state, scene),
        threads: level === "antagonist" || level === "director" ? dashThreads(fsx, chatId, scene) : [],
      })) }],
      ...callParams(fsx, cfg, chat.meta, maxTokens),
    });
  };
  // the newest message read now: the run is pinned to it, so a reply that lands meanwhile waits for the next run
  const upTo = keyOf(take.msgs[take.msgs.length - 1]);
  const started = Number(stash.started) || Date.now();
  if (!r) {
    ask(key);
    return { __llmPending: true, stash: { retry, upTo, started } };
  }
  const limit = limitOf(r);
  if (!retry && r.error && isRateLimit(r)) {
    ask("world_retry");
    return { __llmPending: true, stash: { retry: true, upTo: stash.upTo || upTo, started } };
  }
  // all thinking, no answer: once more with room for both, unless the model's own block sets the
  // limit (it wins over the request, so more room asked here would change nothing)
  if (!retry && thinkingOnly(r) && !(limit && limit.fromModel)) {
    const room = Math.min(RETRY_MAX, Math.max((limit ? limit.max : cfg.maxTokens) * RETRY_FACTOR, cfg.maxTokens + 2000));
    ask("world_retry", room);
    return { __llmPending: true, stash: { retry: true, upTo: stash.upTo || upTo, started, roomy: true } };
  }
  const usage = isObj(r.usage) ? { input: num(r.usage.input), output: num(r.usage.output), cost: r.usage.priced === false ? 0 : num(r.usage.costTotal) } : null;
  const run = { at: Date.now(), reason, model: str(r.model) && r.model !== "error" ? str(r.model) : play.model, ms: Math.round(num(r.genTimeMs) || Date.now() - started), ...(usage ? { usage } : {}), ...(limit ? { limit } : {}), ...(retry ? { retried: true } : {}) };
  const count = (u) => {
    const t = state.usage || { input: 0, output: 0, cost: 0, runs: 0 };
    state.usage = { input: t.input + (u ? u.input : 0), output: t.output + (u ? u.output : 0), cost: t.cost + (u ? u.cost : 0), runs: t.runs + 1 };
  };
  const fail = (err) => {
    state.lastError = cleanError({ at: Date.now(), ...err });
    state.log = [...state.log, { ...run, key: state.lastKey, changes: 0, fronts: 0, summary: "", error: state.lastError.code }].slice(-LOG_MAX);
    count(usage);
    saveState(fsx, state);
    return ok({ ok: false, error: state.lastError.message, code: state.lastError.code });
  };
  if (r.error || !str(r.text)) return fail(classifyError(r, limit));
  const out = parseReply(r.text);
  if (!out) return fail({ code: "not-json", message: "The DM's reply was not JSON. Small models often fail at this: pick a stronger play model.", details: cut(str(r.text), 1200) });
  // the world as it stands now, for a rollback if the message this run reads up to goes away
  pushSnap(fsx, state, str(stash.upTo) || upTo, chat.msgs);
  const touched = new Set();
  // the registry is read right before it may change, and saved right after
  const rc = openRegistry(fsx, chatId, chat.meta);
  const carried = state.settings.carrySource === "dm" ? applyCarry(state, out.carry, { cards, userName, now: Date.now(), rc }) : [];
  const changes = applyReport(state, out, { cards, userName, now: Date.now(), touched, rc }) + carried.length;
  regFlush(fsx, rc);
  // the reasons the DM gave for people who may come back soon (only for those it was told about)
  applyReturns(state, out.returns, new Set(soon), Date.now());
  state.lastChange = { at: Date.now(), ids: [...touched].slice(0, CHANGED_MAX), carry: carried };
  const codeClocks = options.clocks === "code";
  // a full run showed the DM the fronts stirred by the last ticks; they are let go before the new ticks
  if (!recordsOnly) for (const f of state.fronts) delete f.stirred;
  let moved = level !== "chronicler" && !recordsOnly ? applyLevel(state, out, { level, direction: scene && scene.direction, now: Date.now(), catchingUp, codeClocks, useDeck: !!options.deck, place: scene && scene.place, placeId: scene && scene.placeId }) : 0;
  if (level !== "chronicler" && codeClocks) moved += tickClocks(state, take.msgs.filter(isReply).length, options.clockEvery, Date.now(), chatId + "|clock|" + (str(stash.upTo) || upTo));
  if (scene && scene.direction === "transition") state.transitionKey = scene.key;
  state.lastKey = str(stash.upTo) || upTo;
  markSwept(state, sweep);
  // a full run restarts the fronts' and events' count; a records-only run leaves it
  if (!recordsOnly) state.levelKey = state.lastKey;
  if (scene && placeKey(scene.place)) {
    // a new visit: the story came to a place it was not in at the last run
    if (placeMoved(state, scene)) {
      const here = placeRecordOf(state, scene, rc.reg);
      if (here) here.visits = (here.visits || 0) + 1;
    }
    state.lastPlace = placeKey(scene.place);
    if (scene.placeId) state.lastPlaceId = scene.placeId;
    else delete state.lastPlaceId;
  }
  state.lastRunAt = Date.now();
  if (str(r.model)) state.lastModel = str(r.model);
  delete state.lastError;
  const behind = catchingUp ? unreadMessages(chat.msgs, state.lastKey).length : 0;
  state.log = [...state.log, { ...run, key: state.lastKey, changes, fronts: moved, summary: shorten(str(out.summary), 600), ...(behind ? { behind } : {}) }].slice(-LOG_MAX);
  count(usage);
  if (changes || state.entities.length) {
    writeBook(fsx, state, str(chat.meta.title));
    bindBook(fsx, chatId, chat.meta, state.bookId);
  }
  saveState(fsx, state);
  return ok({ ok: true, changes, ...stateView(state, chat.msgs, cfg, scene, play, fsx) });
}

/** POST {chatId, drop?}: the app tells the DM a reply was deleted or is being written again; the world goes back to match (#75). */
function rollbackRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state, existed } = loadState(fsx, chatId);
  if (!existed) return ok({ ok: true, undone: 0, event: false });
  return ok({ ok: true, ...settle(fsx, state, chat, str(b.drop)) });
}

/** The World section's list: every chat with a DM state, newest run first. Chats that are gone are skipped. */
function chatsRoute(req, host) {
  const fsx = host.fs;
  let files = [];
  try {
    files = fsx.list("world/state").filter((f) => f.endsWith(".json"));
  } catch {}
  const chats = [];
  for (const f of files) {
    const chatId = f.slice(0, -5);
    if (!CHAT_ID.test(chatId)) continue;
    const meta = readJson(fsx, "chats/" + chatId + ".meta.json", null);
    if (!isObj(meta)) continue;
    const { state } = loadState(fsx, chatId);
    if (state.settings.level === "off" && !state.entities.length) continue;
    chats.push({
      chatId,
      title: str(meta.title),
      characterId: str(meta.characterId) || null,
      groupId: str(meta.groupId) || null,
      cards: cardNames(fsx, meta),
      level: state.settings.level,
      lastRunAt: state.lastRunAt ?? null,
      error: state.lastError ? state.lastError.code : null,
      errorAt: state.lastError ? state.lastError.at : null,
      records: state.entities.filter((e) => e.status === "active").length,
      fronts: state.fronts.filter((x) => x.status === "active").length,
      usage: state.usage || { input: 0, output: 0, cost: 0, runs: 0 },
    });
  }
  chats.sort((a, b) => (b.lastRunAt || 0) - (a.lastRunAt || 0));
  return ok({ chats });
}

/** The run history, newest first: when, why, what changed, tokens, time, errors. Summaries can spoil: the app asks first. */
function runsRoute(req, host) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const { state } = loadState(host.fs, chatId);
  return ok({ runs: state.log.map(runView).reverse(), usage: state.usage || { input: 0, output: 0, cost: 0, runs: 0 }, lastError: state.lastError ?? null });
}

/** The profiles: list, change (blocks, name, defaults), make, remove. */
function profilesRoute(req, host) {
  const fsx = host.fs;
  if (req.method === "GET") return ok({ profiles: listProfiles(fsx) });
  if (req.method === "DELETE") {
    const id = String((req.query && req.query.id) || "");
    if (!OWN_PROFILE_ID.test(id)) return ok({ error: "only your own profiles can be removed" }, 400);
    try {
      fsx.remove(PROFILE_DIR + id + ".json");
    } catch {}
    // the default profile was deleted: new chats start with the chronicler again
    const cfg = loadConfig(fsx);
    if (cfg.defaultProfile === id) saveConfig(fsx, { ...cfg, defaultProfile: "" });
    return ok({ profiles: listProfiles(fsx) });
  }
  const b = body(req);
  let id = str(b.id);
  const builtIn = PROFILE_LEVELS.includes(id);
  const current = id ? loadProfile(fsx, id) : null;
  if (id && !builtIn && !OWN_PROFILE_ID.test(id)) return ok({ error: "bad profile id" }, 400);
  if (!current) {
    // a new own profile: on a base level, from that level's texts unless blocks say otherwise
    if (!PROFILE_LEVELS.includes(b.base)) return ok({ error: "a new profile needs a base level" }, 400);
    const own = listProfiles(fsx).filter((p) => !p.builtIn).length;
    if (own >= PROFILES_MAX) return ok({ error: "too many profiles" }, 400);
    if (!id) {
      const slug = str(b.name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "profile";
      id = "p-" + slug;
      for (let n = 2; readProfileFile(fsx, id); n++) id = "p-" + slug + "-" + n;
    }
  }
  const base = current ? current.base : b.base;
  // a block sent as null goes back to its default; a string replaces it; a missing one stays
  const blocks = { ...(current ? current.blocks : {}) };
  if (isObj(b.blocks)) for (const [k, v] of Object.entries(b.blocks)) if (v === null) delete blocks[k]; else if (typeof v === "string") blocks[k] = v;
  if (b.blocks && isObj(b.blocks) && typeof b.blocks.event === "string" && !b.blocks.event.includes("{event}") && b.blocks.event.trim()) return ok({ error: "the event block must keep {event}" }, 400);
  const next = {
    v: 1,
    ...(builtIn ? {} : { name: cut(str(b.name !== undefined ? b.name : current ? current.name : ""), NAME_LEN) || "Profile", description: cut(str(b.description !== undefined ? b.description : current ? current.description : ""), DESC_LEN), base }),
    blocks: cleanBlocks(blocks, base),
    defaults: cleanDefaults(b.defaults !== undefined ? b.defaults : current ? current.defaults : {}),
    options: cleanOptions({ ...(current ? current.options : {}), ...(isObj(b.options) ? b.options : {}) }),
  };
  const plain = builtIn && !Object.keys(next.blocks).length && JSON.stringify(next.defaults) === JSON.stringify(DEFAULT_PROFILE_SETTINGS) && JSON.stringify(next.options) === JSON.stringify(DEFAULT_OPTIONS);
  if (plain) {
    try {
      fsx.remove(PROFILE_DIR + id + ".json");
    } catch {}
  } else writeJson(fsx, PROFILE_DIR + id + ".json", next);
  return ok({ id, profiles: listProfiles(fsx) });
}

/** The player edits the world book by hand: add, change, retire, bring back or delete a record. */
/**
 * The player's edits of who a person or a faction is to the story (#424): relation and weight (null or "" clears the choice, so the
 * relation decides the weight again) and the switch "bring back automatically" (noReturn). Other kinds carry none of these.
 */
function applyFolk(e, r) {
  const folk = e.kind === "person" || e.kind === "group";
  if (!folk) {
    delete e.relation;
    delete e.weight;
  }
  if (e.kind !== "person") {
    delete e.link;
    delete e.noReturn;
  }
  if (folk && r.relation !== undefined) {
    if (RELATIONS.includes(r.relation)) e.relation = r.relation;
    else delete e.relation;
  }
  if (folk && r.weight !== undefined) {
    if (r.weight !== null && r.weight !== "" && WEIGHTS.includes(Number(r.weight))) e.weight = Number(r.weight);
    else delete e.weight;
  }
  if (e.kind === "person" && r.noReturn === true) e.noReturn = true;
  else if (r.noReturn === false) delete e.noReturn;
}

function recordsRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const worldId = str(b.worldId);
  const lib = WORLD_ID.test(worldId);
  const chatId = String(b.chatId || "");
  let chat = null;
  let state;
  let saved = null;
  if (lib) {
    saved = cleanWorld(readJson(fsx, LIBRARY_DIR + worldId + ".json", null), worldId);
    if (!saved) return ok({ error: "no such world" }, 404);
    // the saved world's records as a state, so the same edit code runs; written back to the library file below
    state = normalizeState({ settings: saved.settings, entities: saved.entities }, "x");
  } else {
    if (!CHAT_ID.test(chatId)) return ok({ error: "chatId or worldId required" }, 400);
    chat = readChat(fsx, chatId);
    if (!chat) return ok({ error: "no such chat" }, 404);
    state = loadState(fsx, chatId).state;
  }
  const r = isObj(b.record) ? b.record : {};
  const op = str(b.op);
  const now = Date.now();
  const name = cut(str(r.name), NAME_MAX);
  const text = cut(str(r.text), state.settings.textMax);
  const clash = (exceptId) => state.entities.find((e) => e.id !== exceptId && namesOf(e).some((n) => sameName(n, name)));
  if (op === "add") {
    if (!name || !text) return ok({ error: "a record needs a name and a text" }, 400);
    if (clash(null)) return ok({ error: "a record with this name exists" }, 409);
    if (state.entities.length >= ENTITIES_MAX) return ok({ error: "the world book is full" }, 400);
    if (!WRITE_KINDS.includes(r.kind)) return ok({ error: "unknown kind" }, 400);
    const kind = r.kind;
    const fresh = { id: "n" + state.nextId++, kind, name, aliases: cleanAliases(r.aliases, name), text, status: "active", uid: 0, at: now, by: "player", ...(r.pinned === true ? { pinned: true } : {}), ...spaceFields(kind, r) };
    applyFolk(fresh, r);
    state.entities.push(fresh);
    if (!lib) noteSignal(state, { op: "add", kind, name, madeBy: "player", text: cut(text, 120) });
  } else {
    const e = state.entities.find((x) => x.id === str(r.id));
    if (!e) return ok({ error: "no such record" }, 404);
    if (op === "update") {
      if (name && clash(e.id)) return ok({ error: "a record with this name exists" }, 409);
      const before = { len: e.text.length, pinned: e.pinned === true };
      if (name) e.name = name;
      if (r.text !== undefined) {
        if (!text) return ok({ error: "a record needs a text" }, 400);
        e.text = e.status === "past" ? cut(text, pastMaxOf(state.settings)) : text;
      }
      if (WRITE_KINDS.includes(r.kind)) e.kind = r.kind;
      if (r.aliases !== undefined) e.aliases = cleanAliases(r.aliases, e.name);
      if (r.pinned === true) e.pinned = true;
      else if (r.pinned === false) delete e.pinned;
      applySpace(e, r);
      applyFolk(e, r);
      if (!lib) {
        if (e.text.length !== before.len || r.text !== undefined) noteSignal(state, { op: "edit", kind: e.kind, name: e.name, madeBy: e.by === "player" ? "player" : "dm", lenBefore: before.len, lenAfter: e.text.length });
        if (e.pinned === true && !before.pinned) noteSignal(state, { op: "pin", kind: e.kind, name: e.name, madeBy: e.by === "player" ? "player" : "dm" });
      }
    } else if (op === "retire") {
      if (!lib) noteSignal(state, { op: "retire", kind: e.kind, name: e.name, madeBy: e.by === "player" ? "player" : "dm", text: cut(e.text, 120) });
      e.status = "past";
      e.text = shortText(text || e.text, pastMaxOf(state.settings));
    } else if (op === "restore") {
      if (!lib) noteSignal(state, { op: "restore", kind: e.kind, name: e.name, madeBy: e.by === "player" ? "player" : "dm" });
      e.status = "active";
      // a thing the player woke is judged again only after a full pass, not at once
      if (state.tidy) state.tidy = { ...state.tidy, seen: state.tidy.seen.filter((id) => id !== e.id) };
    } else if (op === "delete") {
      if (!lib) noteSignal(state, { op: "delete", kind: e.kind, name: e.name, madeBy: e.by === "player" ? "player" : "dm", ...(e.src === "deck" ? { src: "deck" } : e.link ? { src: "bench" } : {}), text: cut(e.text, 120) });
      state.entities = state.entities.filter((x) => x !== e);
      state.dropped = [...arr(state.dropped), { id: e.id, at: now }].slice(-DROPPED_MAX);
    } else return ok({ error: "unknown op" }, 400);
    if (op !== "delete") {
      e.at = now;
      e.by = "player";
    }
  }
  if (lib) {
    writeJson(fsx, LIBRARY_DIR + worldId + ".json", cleanWorld({ ...saved, entities: state.entities, at: Date.now() }, worldId));
    return peekRoute({ query: { worldId } }, host);
  }
  writeBook(fsx, state, str(chat.meta.title));
  bindBook(fsx, chatId, chat.meta, state.bookId);
  saveState(fsx, state);
  return peekRoute({ query: { chatId } }, host);
}

export const KEYS_SYSTEM = [
  "You add lorebook keys to the records of a roleplay world. A record comes into the story only when one of its keys appears in the newest messages, so each needs the words the story will really use.",
  "- For each record: 2 to 5 short words or phrases: a short name, how the characters call it, its main word (for \"IKEA dresser\": \"dresser\"; for \"Ava's house\": \"Ava's place\", \"Ava's home\").",
  "- In the language and script of the record. Never a word that comes up in every scene (room, door, day, man).",
  "Output: one JSON object and nothing else, no code fences:",
  '{"keys":[{"id":"n3","keys":["..."]}]}',
].join("\n");

/** POST {chatId}: the build model writes keys for the living records that have none (one call). */
function keysRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const chat = readChat(fsx, chatId);
  if (!chat) return ok({ error: "no such chat" }, 404);
  const { state } = loadState(fsx, chatId);
  const bare = state.entities.filter((e) => e.status === "active" && !e.aliases.length && !e.pinned);
  if (!bare.length) return ok({ ok: true, changed: 0 });
  const cfg = loadConfig(fsx);
  const content = "Records\n" + bare.slice(0, 60).map(entityLine).join("\n");
  const built = buildResult(host, "world_keys", buildAsk(host, fsx, cfg, chat.meta, KEYS_SYSTEM, content), isObj(req.stash) ? req.stash : {});
  if (built.pending) return built.pending;
  if (built.error) return ok({ ok: false, error: built.error.message, code: built.error.code });
  let changed = 0;
  for (const k of arr(built.out.keys)) {
    const e = isObj(k) ? bare.find((x) => x.id === str(k.id)) : null;
    if (!e) continue;
    const keys = cleanAliases(k.keys, e.name);
    if (keys.length) {
      e.aliases = keys;
      changed++;
    }
  }
  countBuild(state, built, "keys", changed);
  if (changed) {
    writeBook(fsx, state, str(chat.meta.title));
    bindBook(fsx, chatId, chat.meta, state.bookId);
  }
  saveState(fsx, state);
  return ok({ ok: true, changed });
}

/** "Test the model": one tiny call. Says it works, or the plain reason, with the limit in force. */
function testRoute(req, host) {
  const fsx = host.fs;
  const b = body(req);
  const chatId = String(b.chatId || "");
  const which = b.which === "build" ? "build" : "play";
  const meta = CHAT_ID.test(chatId) ? readJson(fsx, "chats/" + chatId + ".meta.json", null) : null;
  const cfg = loadConfig(fsx);
  const pick = which === "build" ? buildModel(fsx, cfg, isObj(meta) ? meta : null) : playModel(fsx, cfg, isObj(meta) ? meta : null);
  const r = host.llm.results.world_test;
  if (!r) {
    host.llm.request("world_test", {
      ...(pick.model ? { model: pick.model } : {}),
      systemPrompt: "You answer with one JSON object and nothing else.",
      messages: [{ role: "user", content: 'Reply with exactly this JSON: {"ok":true}' }],
      ...callParams(fsx, cfg, isObj(meta) ? meta : null),
    });
    return { __llmPending: true };
  }
  const limit = limitOf(r);
  const base = { which, model: str(r.model) && r.model !== "error" ? str(r.model) : pick.model, from: pick.from, ms: Math.round(num(r.genTimeMs)), ...(limit ? { limit } : {}) };
  if (r.error || !str(r.text)) return ok({ ok: false, ...base, ...classifyError(r, limit) });
  const out = parseReply(r.text);
  if (!out) return ok({ ok: false, ...base, code: "not-json", message: "The model answers, but not in JSON: the DM needs JSON. Pick a stronger model.", details: cut(str(r.text), 600) });
  return ok({ ok: true, ...base, thinks: !!str(r.reasoning) });
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (!path.startsWith("/world/")) return null;
  if (path === "/world/state" && req.method === "GET") return stateRoute(req, host);
  if (path === "/world/settings" && req.method === "PUT") return settingsRoute(req, host);
  if (path === "/world/peek" && req.method === "GET") return peekRoute(req, host);
  if (path === "/world/here" && req.method === "GET") return hereRoute(req, host);
  if (path === "/world/config" && (req.method === "GET" || req.method === "PUT")) return configRoute(req, host);
  if (path === "/world/update" && req.method === "POST") return updateRoute(req, host);
  if (path === "/world/rollback" && req.method === "POST") return rollbackRoute(req, host);
  if (path === "/world/chats" && req.method === "GET") return chatsRoute(req, host);
  if (path === "/world/runs" && req.method === "GET") return runsRoute(req, host);
  if (path === "/world/dice" && req.method === "GET") return diceRoute(req, host);
  if (path === "/world/test" && req.method === "POST") return testRoute(req, host);
  if (path === "/world/profiles" && ["GET", "PUT", "DELETE"].includes(req.method)) return profilesRoute(req, host);
  if (path === "/world/records" && req.method === "PUT") return recordsRoute(req, host);
  if (path === "/world/recipes" && req.method === "GET") return ok({ recipes: listRecipes(host.fs) });
  if (path === "/world/start" && req.method === "POST") return startRoute(req, host);
  if (path === "/world/draft" && req.method === "PUT") return draftRoute(req, host);
  if (path === "/world/deck" && req.method === "POST") return deckRoute(req, host);
  if (path === "/world/bench" && req.method === "POST") return benchRoute(req, host);
  if (path === "/world/cast" && req.method === "GET") return castRoute(req, host);
  if (path === "/world/cast/refill" && req.method === "POST") return castRefillRoute(req, host);
  if (path === "/world/cast/cards" && (req.method === "GET" || req.method === "POST")) return castCardsRoute(req, host);
  if (path === "/world/tidy" && (req.method === "GET" || req.method === "POST")) return tidyRoute(req, host);
  if (path === "/world/learned" && req.method === "GET") return learnedRoute(req, host, "");
  if (path.startsWith("/world/learned/") && req.method === "POST") return learnedRoute(req, host, path.slice("/world/learned/".length));
  if (path === "/world/library" && ["GET", "POST", "PUT", "DELETE"].includes(req.method)) return libraryRoute(req, host);
  if (path === "/world/carry" && req.method === "POST") return carryRoute(req, host);
  if (path === "/world/opening" && req.method === "POST") return openingRoute(req, host);
  if (path === "/world/override" && req.method === "PUT") return overrideRoute(req, host);
  if (path === "/world/backgrounds" && ["GET", "POST", "PUT"].includes(req.method)) return backgroundsRoute(req, host);
  if (path === "/world/backgrounds/name" && req.method === "POST") return nameImageRoute(req, host);
  if (path === "/world/backgrounds/places" && req.method === "POST") return findPlacesRoute(req, host);
  if (path === "/world/records/keys" && req.method === "POST") return keysRoute(req, host);
  return ok({ error: "not found" }, 404);
}
