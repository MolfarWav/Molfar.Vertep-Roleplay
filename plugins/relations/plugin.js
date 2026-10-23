/**
 * Relationship dashboard: how each character stands toward the user.
 *
 * After a reply, a SENSOR model reports what happened (events, mood, scene,
 * what each character learned). It never gives relationship numbers. Code
 * turns the events into numbers (pure functions below, tested without a model)
 * and saves one SNAPSHOT per chat message, keyed "<msgId>#<swipe>". The active
 * line of the chat decides which snapshots, notes and history lines count. An
 * edit, a Continue, a deleted message or another swipe leaves every snapshot
 * after it computed from text that is gone: the next update drops those and
 * reads the line again from the last snapshot that stands, in one sensor call,
 * and answers `reread: {from, trimmed?}` — the message it went back to.
 *
 * Routes (under /v1/apps/roleplay/):
 *  POST /dashboard/update {chatId, op?, auto?}  sensor now (two-phase); auto = the UI's trigger after a reply
 *  GET  /dashboard/state?chatId=           state + active keys + current key
 *  GET  /dashboard/preview?chatId=&speaker=&text= the insert the next reply gets, and the speakers it can be built for
 *  GET  /dashboard/notice?chatId=          the last insert that did not fit the limit
 *  POST /dashboard/nudge {chatId, threadId?}  "Story, move": the next reply moves the story (one open thread, or null = all)
 *  DELETE /dashboard/nudge?chatId=         take the nudge back
 *
 * Before each reply, the llmRequest hook adds "how the characters are right
 * now" in words just before the newest turn (buildInsert, withTailInsert).
 *  GET  /dashboard/config                  effective config + events
 *  PUT  /dashboard/config                  flat body or panel envelope
 *  DELETE /dashboard/config/prompts        back to the shipped prompts (?part=<block> or ?key=soul|nudge|fast|sensor: only that one)
 *  POST /dashboard/notes {chatId, op, ...}  the user's own notes and threads (add, edit, retire, restore, thread-add, thread-edit, proposal-accept, proposal-reject)
 *  PUT    /dashboard/events {events}       the user's own event rows (changed, new, off)
 *  DELETE /dashboard/events                back to the default vocabulary
 *
 * Souls (docs/SOUL.md): who a character is. A card holds them; a rating call proposes them.
 *  POST   /dashboard/soul/rate {characterId, chatId?, auto?}  rate a card's main characters (two-phase)
 *  GET    /dashboard/soul-draft?characterId=                  the proposal of a card, or null
 *  GET    /dashboard/soul-drafts                              cards with a proposal waiting: [{characterId, at, n, failed}] (the "needs you" inbox, #55)
 *  DELETE /dashboard/soul-draft?characterId=[&accepted=1[&name=]]  dismiss it, or remove it (or one name) once accepted
 *  GET    /dashboard/guests?characterId=                      names seen in the card's chats with no soul
 *  POST   /dashboard/soul/effects {soul}                      what a soul changes in play
 *
 * Files (fs root = the app's data/):
 *  dashboard/state/<chatId>.json   one chat
 *  dashboard/soul-drafts/<characterId>.json  proposed souls waiting for review
 *  dashboard/notes/<chatId>.json   what the user added or changed (notes, tags, threads); updates never write it
 *  dashboard/nudge/<chatId>.json   one pending "Story, move" nudge {v, threadId, at}; removed when used, 30 minutes to live
 *  dashboard/fast/<chatId>.json    fast mode: the state a story reply carried, {v, entries: {"<msgId>#<swipe>": {body, at, model, closed}}}; the chat plugin writes it, the update uses and removes it
 *  dashboard/config.json           only what differs from the defaults
 *  dashboard/events.json           optional own event vocabulary
 *  _debug/dashboard.json           last sensor call, only when debug is on
 */

const STATE_DIR = "dashboard/state/";
const DRAFT_DIR = "dashboard/soul-drafts/";
const CONFIG_FILE = "dashboard/config.json";
const EVENTS_FILE = "dashboard/events.json";
const DEBUG_FILE = "_debug/dashboard.json";
const DEBUG_RUNS_FILE = "_debug/dashboard-runs.json";
const DEBUG_RUNS_KEEP = 10;
const DEBUG_RUN_TEXT_MAX = 20000;
// the last time an insert did not fit the user's limit, per chat (the app shows it once)
const NOTICE_DIR = "dashboard/notice/";
const NOTES_DIR = "dashboard/notes/";
// the state a rebuild on top of an earlier chat replaced (one copy per chat, gone with the chat)
const REBASE_DIR = "dashboard/rebase/";
// the user's one-time "Story, move" nudge per chat: rides the next reply request only, never the chat file
const NUDGE_DIR = "dashboard/nudge/";
const NUDGE_TTL_MS = 30 * 60 * 1000;
// fast mode: the story reply ends with <vertep_state>{sensor JSON}</vertep_state>; the chat plugin cuts it out and
// keeps its body here until the update for that message key uses it
const FAST_DIR = "dashboard/fast/";
const FAST_TTL_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_LIMIT = 40;
// the place log (state.places) outlives the snapshot cap: the scene list reads it
const PLACES_LIMIT = 2000;
// the scene list keeps this many of the newest scenes
const SCENES_LIMIT = 200;
// one turn moves the clock at most this far (a night's sleep fits)
const MAX_MINUTES = 720;
const CHAT_ID = /^[A-Za-z0-9_-]{1,120}$/;

// ---------- vocabulary of the physics ----------
export const DISPOSITION = ["trust", "comfort", "attraction", "respect", "affection"];
export const PULSE = ["excitement", "arousal"];
const CLASSES = ["romantic", "ally", "neutral", "hostile"];
export const WEIGHTS = { routine: 1, significant: 2, pivotal: 4 };
const DELTA_KEYS = [...DISPOSITION, ...PULSE, "hostility"];
// the scales of a soul: the code reads these, so no other key is kept inside them
const PRONOUN_KEYS = ["she", "he", "they"];
const TRAIT_KEYS = ["dominance", "confidence", "shyness", "patience", "curiosity"];
const SPECTRUM_KEYS = ["introvert_extrovert", "cautious_reckless", "reserved_emotional", "lawful_rebellious", "suspicious_trusting", "pessimist_optimist"];
// above this shyness, trust and comfort grow at most +1 per turn
const SHYNESS_BRAKE = 60;

// [family, id, meaning, deltas]; Sergey tunes these later, a user file can replace any of them
const EVENT_ROWS = [
  ["trust", "kept_promise", "did what was promised", { trust: 1, respect: 1 }],
  ["trust", "broke_promise", "failed a promise", { trust: -3, respect: -1 }],
  ["trust", "told_truth", "said an uncomfortable truth", { trust: 1, respect: 1 }],
  ["trust", "caught_lying", "was caught in a lie", { trust: -3, respect: -2 }],
  ["trust", "shared_secret", "trusted them with a secret", { trust: 2, affection: 1 }],
  ["trust", "kept_her_secret", "kept their secret when it cost something", { trust: 2 }],
  ["trust", "betrayed_secret", "told their secret to others", { trust: -4, comfort: -2, hostility: 3 }],
  ["trust", "manipulated_her", "tricked or used them, short of a lie", { trust: -3, comfort: -1, hostility: 2 }],
  ["trust", "abandoned_her", "left them behind or walked out on them", { trust: -3, comfort: -2, affection: -1, hostility: 2 }],
  ["trust", "respected_limit", "held back when they set a limit", { trust: 2, comfort: 1 }],
  ["trust", "pushed_limit", "pressed on after they set a limit", { trust: -2, comfort: -3, hostility: 2 }],
  ["trust", "introduced_self", "told them their name or who they are", { trust: 1 }],
  ["warmth", "compliment", "sincere praise", { affection: 1, attraction: 1 }],
  ["warmth", "shared_laughter", "laughed together", { comfort: 1, affection: 1 }],
  ["warmth", "remembered_detail", "remembered something small about them", { affection: 2 }],
  ["warmth", "gift", "gave something meant for them", { affection: 1, comfort: 1 }],
  ["warmth", "cold_shoulder", "ignored or dismissed them", { affection: -2, comfort: -1 }],
  ["warmth", "teased_her", "teased them playfully, without malice", { affection: 1, comfort: 1, excitement: 4 }],
  ["warmth", "confessed_feelings", "confessed love or deep feelings to them", { affection: 2, attraction: 1, excitement: 8 }],
  ["warmth", "shared_meal", "ate or drank together", { comfort: 1, affection: 1 }],
  ["warmth", "shared_victory", "won or achieved something together", { affection: 1, trust: 1, excitement: 10 }],
  ["warmth", "checked_on_her", "asked how they are and listened", { affection: 1, comfort: 1 }],
  ["warmth", "thanked_her", "thanked them sincerely", { affection: 1, respect: 1 }],
  ["warmth", "invited_her", "invited them to meet or spend time together", { affection: 1, comfort: 1, excitement: 4 }],
  ["power", "gave_order", "commanded them", { respect: 1, comfort: -1 }],
  ["power", "asked_her_advice", "asked and listened", { respect: 1, trust: 1 }],
  ["power", "deferred_to_her", "let them decide", { respect: 1, comfort: 1 }],
  ["power", "overruled_her", "overrode their choice", { comfort: -1, respect: -1 }],
  ["power", "protected_her_standing", "took their side or defended them before others", { respect: 1, affection: 1, trust: 1 }],
  ["power", "humiliated_her", "shamed them in front of others", { respect: -2, comfort: -3, hostility: 3 }],
  ["power", "impressed_her", "showed real skill or courage before them", { respect: 2, attraction: 1, excitement: 4 }],
  ["power", "taught_her", "taught or showed them how to do something", { respect: 1, trust: 1 }],
  ["power", "acted_cowardly", "froze or fled when they needed help", { respect: -3, trust: -1 }],
  ["power", "stood_ground", "held their ground or set a calm boundary", { respect: 2 }],
  ["body", "gentle_touch", "wanted, gentle touch", { comfort: 1, attraction: 1, arousal: 6 }],
  ["body", "unwanted_touch", "touch they did not want", { comfort: -4, trust: -2, hostility: 3 }],
  ["body", "flirt", "flirted with them", { attraction: 1, excitement: 6, arousal: 4 }],
  ["body", "kiss", "kissed (welcome)", { attraction: 2, affection: 1, arousal: 12 }],
  ["body", "intimacy", "intimate moment (welcome)", { attraction: 2, comfort: 1, arousal: 20 }],
  ["body", "rejected_advance", "turned down their romantic or sexual advance", { comfort: -2, affection: -1 }],
  ["conflict", "raised_voice", "shouted, at them or near them", { comfort: -3 }],
  ["conflict", "insult", "insulted, mocked or belittled them", { respect: -2, affection: -2, hostility: 3 }],
  ["conflict", "threat", "threatened them", { comfort: -4, trust: -3, hostility: 4 }],
  ["conflict", "fair_argument", "argued honestly", { respect: 1 }],
  ["conflict", "apology", "sincere apology", { trust: 1, comfort: 1, hostility: -2 }],
  ["conflict", "attacked_her", "hit or physically attacked them", { comfort: -5, trust: -3, hostility: 5 }],
  ["conflict", "jealous_scene", "showed jealousy over them", { attraction: 1, comfort: -1, excitement: 4 }],
  ["conflict", "forgave_her", "forgave them a wrong they did", { trust: 1, affection: 2, hostility: -3 }],
  ["conflict", "ultimatum", "gave them a deadline or a take-it-or-leave-it demand", { comfort: -2, respect: -1, hostility: 1, excitement: 4 }],
  ["conflict", "hinted_leverage", "hinted at a secret or weakness to use", { trust: -2, comfort: -3, hostility: 2 }],
  ["care", "protected_her", "shielded or rescued them from harm", { trust: 2, affection: 1, comfort: 1 }],
  ["care", "cared_for_kin", "helped their people or family", { affection: 2, trust: 1 }],
  ["care", "tended_her", "looked after their wound or need", { comfort: 2, affection: 1 }],
  ["care", "ignored_her_need", "saw their need and did nothing", { affection: -2, trust: -1 }],
  ["care", "comforted_her", "consoled them when they were upset", { comfort: 2, affection: 1, trust: 1 }],
  ["care", "kept_company", "stayed with them so they were not alone", { comfort: 2, affection: 1 }],
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
// The first soul rating prompt, kept so a stored copy of it follows the current default.
const SOUL_PROMPT_1 = [
    "You read a roleplay card and its lorebook and rate its main characters for a relationship tracker.",
    "Rate only recurring characters the sources describe as people with a name and a personality of their own: the card's own character, and for a narrator card the main named characters its story is about. Skip the narrator itself, the user's character (the player, \"you\", {{user}}), and minor figures: unnamed or one-scene people such as guards, servants, merchants and passers-by. At most six characters; fewer is fine; none when no one fits.",
    "Judge from what the sources say, not from stereotypes. When the sources say nothing about a quality, use 50 (no lean) for a trait or a spectrum, and leave start values out.",
    "- class: how the character relates to the user at the start: romantic (a love interest), ally, neutral or hostile.",
    "- start: attitude on first meeting, small numbers from -20 to 20 (most characters within 10 of zero); leave out what is 0.",
    "- traits, 0 to 100: dominance, confidence, shyness, patience, curiosity.",
    "- spectra, 0 to 100 (0 = the first word, 100 = the second): introvert_extrovert, cautious_reckless, reserved_emotional, lawful_rebellious, suspicious_trusting, pessimist_optimist.",
    "- triggers: up to four things that hurt this character more than most people; values: up to four things they prize. Each names one event id from the list below, the stat it hits, and x = 1.5 (strong) or 2 (very strong); cue is a few words.",
    "- coping: one short line on how they behave under strain.",
    "- pronouns: she, he or they. aliases: other spellings of the name the sources use.",
    "Write cue, coping and note in the language of the story; ids, keys and class words stay English. Write letters as they are, never as \\u escapes.",
].join("\n");

// The second soul rating prompt (names seen in the chats, start values from the card).
const SOUL_PROMPT_2 = [
  "You read a roleplay card and its lorebook and rate its main characters for a relationship tracker.",
  "Rate only recurring characters the sources describe as people with a name and a personality of their own: the card's own character, and for a narrator card the main named characters its story is about. Skip the narrator itself, the user's character (the player, \"you\", {{user}}), and minor figures: unnamed or one-scene people such as guards, servants, merchants and passers-by. At most six characters; fewer is fine; none when no one fits.",
  "Judge from what the sources say, not from stereotypes. When the sources say nothing about a quality, use 50 (no lean) for a trait or a spectrum.",
  "- class: how the character relates to the user at the start: romantic (a love interest), ally, neutral or hostile.",
  "- start: how the character feels about the user when the story begins, as the card and its first message set it up (a sworn advisor or an old friend already trusts and respects the user; a rival or a captor distrusts them; a stranger stays near 0). Numbers from -20 to 20; leave a stat out only when the sources give it no lean.",
  "- traits, 0 to 100: dominance, confidence, shyness, patience, curiosity.",
  "- spectra, 0 to 100 (0 = the first word, 100 = the second): introvert_extrovert, cautious_reckless, reserved_emotional, lawful_rebellious, suspicious_trusting, pessimist_optimist.",
  "- triggers: up to four things that hurt this character more than most people; values: up to four things they prize. Each names one event id from the list below, the stat it hits, and x = 1.5 (strong) or 2 (very strong); cue is a few words.",
  "- coping: one short line on how they behave under strain.",
  "- pronouns: she, he or they. aliases: other spellings of the name the sources use.",
  "- Names: the message lists the names already seen in this card's chats. Key each soul by the spelling those chats use; put other spellings of the same character (another script, a transliteration, a nickname) in aliases. Put every seen name that gets no soul (a minor figure, the narrator, the user) in minor.",
  "Write cue, coping and note in the language of the story; ids, keys and class words stay English. Write letters as they are, never as \\u escapes.",
].join("\n");

// The third soul rating prompt (it told the model to rate listed souls again under the same keys).
const SOUL_PROMPT_3 = [
  "You read a roleplay card and its lorebook and rate its main characters for a relationship tracker.",
  "Rate only recurring characters the sources describe as people with a name and a personality of their own: the card's own character, and for a narrator card the main named characters its story is about. Skip the narrator itself, the user's character (the player, \"you\", {{user}}), and minor figures: unnamed or one-scene people such as guards, servants, merchants and passers-by. At most six characters; fewer is fine; none when no one fits.",
  "Judge from what the sources say, not from stereotypes. When the sources say nothing about a quality, use 50 (no lean) for a trait or a spectrum.",
  "- class: how the character relates to the user at the start: romantic (a love interest), ally, neutral or hostile.",
  "- start: how the character feels about the user when the story begins, as the card and its first message set it up (a sworn advisor or an old friend already trusts and respects the user; a rival or a captor distrusts them; a stranger stays near 0). Numbers from -20 to 20; leave a stat out only when the sources give it no lean.",
  "- traits, 0 to 100: dominance, confidence, shyness, patience, curiosity.",
  "- spectra, 0 to 100 (0 = the first word, 100 = the second): introvert_extrovert, cautious_reckless, reserved_emotional, lawful_rebellious, suspicious_trusting, pessimist_optimist.",
  "- triggers: up to four things that hurt this character more than most people; values: up to four things they prize. Each names one event id from the list below, the stat it hits, and x = 1.5 (strong) or 2 (very strong); cue is a few words.",
  "- coping: one short line on how they behave under strain.",
  "- pronouns: she, he or they. aliases: other spellings of the name the sources use.",
  "- cardType: what the card is: single (one character), narrator (a narrator or game master voicing several characters), group (a fixed ensemble), assistant (an AI assistant, not a story character) or other.",
  "- Names: the message lists the names already seen in this card's chats with counts. Key each soul by the spelling those chats use; put other spellings of the same character (another script, a transliteration, a nickname) in aliases. When the message lists souls this card already has, rate those characters again under the same keys; a name that is the same character in another spelling is not a new character. Put every seen name that gets no soul (a minor figure, the narrator, the user) in minor. A name seen only once and not described in the card or lorebook is minor.",
  "Write cue, coping and note in the language of the story; ids, keys and class words stay English. Write letters as they are, never as \\u escapes.",
].join("\n");

// The first sensor prompt, kept so a stored copy of it follows the current default.
const SENSOR_PROMPT_1 = [
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
].join("\n");
// The second sensor prompt (before blindSpot and learned were made shorter and stricter).
const SENSOR_PROMPT_2 = [
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
  "- Use the ids exactly as written in the vocabulary. Nothing in it fits: use \"other\". Never stretch an id to fit.",
  "",
  "Scene:",
  "- minutes: story time that passed in the new messages. Estimate it from what happens: a few lines of talk 2-5, a meal 20-40, a walk across a castle 10-20, a night's sleep 480. 0 only when nothing happens (for example a continuation of the same moment).",
  "- time and day: only when the text states them (\"evening\", \"19:40\", \"day 3\").",
  "- present: everyone physically in the scene at the end of the new messages who acts, speaks or is addressed in them (the full list; [] when the user's character is alone). Everyone in the Previous state stays present unless the text shows them leaving. A narrator who only tells the story is not a person in the scene. struck: anyone who left, fell asleep or is otherwise out of it.",
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
].join("\n");

// The third sensor prompt (before the names rule also counted a character who already knows the user).
const SENSOR_PROMPT_3 = [
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
  "- Use the ids exactly as written in the vocabulary. Nothing in it fits: use \"other\". Never stretch an id to fit.",
  "",
  "Scene:",
  "- minutes: story time that passed in the new messages. Estimate it from what happens: a few lines of talk 2-5, a meal 20-40, a walk across a castle 10-20, a night's sleep 480. 0 only when nothing happens (for example a continuation of the same moment).",
  "- time and day: only when the text states them (\"evening\", \"19:40\", \"day 3\").",
  "- present: everyone physically in the scene at the end of the new messages who acts, speaks or is addressed in them (the full list; [] when the user's character is alone). Everyone in the Previous state stays present unless the text shows them leaving. A narrator who only tells the story is not a person in the scene. struck: anyone who left, fell asleep or is otherwise out of it.",
  "- place and weather: only when stated or changed.",
  "- chars: for each present character, mood, condition, outfit, holding, goal, leads (who drives the scene right now: a name or \"user\"), only what the text shows.",
  "",
  "Knowledge:",
  "- A character learns only what happened while they were present (\"saw\"), what they were told (\"heard\", \"from\" is the teller), or what they guess (\"guess\"). Never give knowledge to someone absent, asleep or struck.",
  "- learned: concrete new facts about the user's character that a character sees, hears or guesses (who, what), never a summary of the conversation and never one note for everyone; at most 4 per turn, the ones that matter; none when nothing is new. Skip anything already in their Notebook, even in other words.",
  "- told: when one character repeats a notebook entry to another, give from, to and the entry id. retire: ids of notebook entries the new text disproves.",
  "- names: when the user's name is said in a character's presence, set heardUserName true for them. \"calls\" is how they address the user.",
  "- blindSpot: only for present characters named in this turn's events, never the user's character: one short line (up to 15 words) on what they do not know that matters here. It is for the user's eyes only.",
  "- edges: for two present characters who are not the user, a one-word role and a one-word warmth.",
  "",
  "Threads:",
  "- Keep up to three open threads: unanswered questions or promises that drive the story.",
  "- Never drop one to make room for a new one. Silence is not resolution: a thread nobody mentioned stays open.",
  "- Resolve a thread only when the new text settles it. Give its id in \"resolved\".",
  "- In \"open\", list kept threads with their id and new ones with id null.",
  "",
  "Keep the whole reply compact: short values, no filler.",
].join("\n");

// The fourth sensor prompt (before thread rules and the exact form of address).
const SENSOR_PROMPT_4 = [
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
  "- Use the ids exactly as written in the vocabulary. Nothing in it fits: use \"other\". Never stretch an id to fit.",
  "",
  "Scene:",
  "- minutes: story time that passed in the new messages. Estimate it from what happens: a few lines of talk 2-5, a meal 20-40, a walk across a castle 10-20, a night's sleep 480. 0 only when nothing happens (for example a continuation of the same moment).",
  "- time and day: only when the text states them (\"evening\", \"19:40\", \"day 3\").",
  "- present: everyone physically in the scene at the end of the new messages who acts, speaks or is addressed in them (the full list; [] when the user's character is alone). Everyone in the Previous state stays present unless the text shows them leaving. A narrator who only tells the story is not a person in the scene. struck: anyone who left, fell asleep or is otherwise out of it.",
  "- place and weather: only when stated or changed.",
  "- chars: for each present character, mood, condition, outfit, holding, goal, leads (who drives the scene right now: a name or \"user\"), only what the text shows.",
  "",
  "Knowledge:",
  "- A character learns only what happened while they were present (\"saw\"), what they were told (\"heard\", \"from\" is the teller), or what they guess (\"guess\"). Never give knowledge to someone absent, asleep or struck.",
  "- learned: concrete new facts about the user's character that a character sees, hears or guesses (who, what), never a summary of the conversation and never one note for everyone; at most 4 per turn, the ones that matter; none when nothing is new. Skip anything already in their Notebook, even in other words.",
  "- told: when one character repeats a notebook entry to another, give from, to and the entry id. retire: ids of notebook entries the new text disproves.",
  "- names: when the user's name is said in a character's presence, set heardUserName true for them. Also set it true when the new messages clearly show the character already knows the user's character personally (serves them, lives or works with them, shares a past with them, addresses them as someone known). A stranger, or someone who only uses a title or form of address with no sign of knowing them, stays false: never guess. \"calls\" is how they address the user.",
  "- blindSpot: only for present characters named in this turn's events, never the user's character: one short line (up to 15 words) on what they do not know that matters here. It is for the user's eyes only.",
  "- edges: for two present characters who are not the user, a one-word role and a one-word warmth.",
  "",
  "Threads:",
  "- Keep up to three open threads: unanswered questions or promises that drive the story.",
  "- Never drop one to make room for a new one. Silence is not resolution: a thread nobody mentioned stays open.",
  "- Resolve a thread only when the new text settles it. Give its id in \"resolved\".",
  "- In \"open\", list kept threads with their id and new ones with id null.",
  "",
  "Keep the whole reply compact: short values, no filler.",
].join("\n");

// The fifth sensor prompt (before the open thread limit came from the input).
const SENSOR_PROMPT_5 = [
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
  "- Use the ids exactly as written in the vocabulary. Nothing in it fits: use \"other\". Never stretch an id to fit.",
  "",
  "Scene:",
  "- minutes: story time that passed in the new messages. Estimate it from what happens: a few lines of talk 2-5, a meal 20-40, a walk across a castle 10-20, a night's sleep 480. 0 only when nothing happens (for example a continuation of the same moment).",
  "- time and day: only when the text states them (\"evening\", \"19:40\", \"day 3\").",
  "- present: everyone physically in the scene at the end of the new messages who acts, speaks or is addressed in them (the full list; [] when the user's character is alone). Everyone in the Previous state stays present unless the text shows them leaving. A narrator who only tells the story is not a person in the scene. struck: anyone who left, fell asleep or is otherwise out of it.",
  "- place and weather: only when stated or changed.",
  "- chars: for each present character, mood, condition, outfit, holding, goal, leads (who drives the scene right now: a name or \"user\"), only what the text shows.",
  "",
  "Knowledge:",
  "- A character learns only what happened while they were present (\"saw\"), what they were told (\"heard\", \"from\" is the teller), or what they guess (\"guess\"). Never give knowledge to someone absent, asleep or struck.",
  "- learned: concrete new facts about the user's character that a character sees, hears or guesses (who, what), never a summary of the conversation and never one note for everyone; at most 4 per turn, the ones that matter; none when nothing is new. Skip anything already in their Notebook, even in other words.",
  "- told: when one character repeats a notebook entry to another, give from, to and the entry id. retire: ids of notebook entries the new text disproves.",
  "- names: when the user's name is said in a character's presence, set heardUserName true for them. Also set it true when the new messages clearly show the character already knows the user's character personally (serves them, lives or works with them, shares a past with them, addresses them as someone known). A stranger, or someone who only uses a title or form of address with no sign of knowing them, stays false: never guess. \"calls\" is the exact form of address the character uses for the user now (name, nickname, pet name, title); report it when it changes.",
  "- blindSpot: only for present characters named in this turn's events, never the user's character: one short line (up to 15 words) on what they do not know that matters here. It is for the user's eyes only.",
  "- edges: for two present characters who are not the user, a one-word role and a one-word warmth.",
  "",
  "Threads:",
  "- Keep up to three open threads: unanswered questions or promises that drive the story. A question, greeting or order with nothing at stake is not a thread.",
  "- Never drop one to make room for a new one. Silence is not resolution: a thread nobody mentioned stays open.",
  "- Resolve a thread only when the new text settles it. Give its id in \"resolved\".",
  "- In \"open\", list kept threads with their id and new ones with id null.",
  "",
  "Keep the whole reply compact: short values, no filler.",
].join("\n");

// The sixth sensor prompt (before the scene field and the note weight).
const SENSOR_PROMPT_6 = [
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
  "- Use the ids exactly as written in the vocabulary. Nothing in it fits: use \"other\". Never stretch an id to fit.",
  "",
  "Scene:",
  "- minutes: story time that passed in the new messages. Estimate it from what happens: a few lines of talk 2-5, a meal 20-40, a walk across a castle 10-20, a night's sleep 480. 0 only when nothing happens (for example a continuation of the same moment).",
  "- time and day: only when the text states them (\"evening\", \"19:40\", \"day 3\").",
  "- present: everyone physically in the scene at the end of the new messages who acts, speaks or is addressed in them (the full list; [] when the user's character is alone). Everyone in the Previous state stays present unless the text shows them leaving. A narrator who only tells the story is not a person in the scene. struck: anyone who left, fell asleep or is otherwise out of it.",
  "- place and weather: only when stated or changed.",
  "- chars: for each present character, mood, condition, outfit, holding, goal, leads (who drives the scene right now: a name or \"user\"), only what the text shows.",
  "",
  "Knowledge:",
  "- A character learns only what happened while they were present (\"saw\"), what they were told (\"heard\", \"from\" is the teller), or what they guess (\"guess\"). Never give knowledge to someone absent, asleep or struck.",
  "- learned: concrete new facts about the user's character that a character sees, hears or guesses (who, what), never a summary of the conversation and never one note for everyone; at most 4 per turn, the ones that matter; none when nothing is new. Skip anything already in their Notebook, even in other words.",
  "- told: when one character repeats a notebook entry to another, give from, to and the entry id. retire: ids of notebook entries the new text disproves.",
  "- names: when the user's name is said in a character's presence, set heardUserName true for them. Also set it true when the new messages clearly show the character already knows the user's character personally (serves them, lives or works with them, shares a past with them, addresses them as someone known). A stranger, or someone who only uses a title or form of address with no sign of knowing them, stays false: never guess. \"calls\" is the exact form of address the character uses for the user now (name, nickname, pet name, title); report it when it changes.",
  "- blindSpot: only for present characters named in this turn's events, never the user's character: one short line (up to 15 words) on what they do not know that matters here. It is for the user's eyes only.",
  "- edges: for two present characters who are not the user, a one-word role and a one-word warmth.",
  "",
  "Threads:",
  "- Keep open threads, up to the open thread limit given in the input: unanswered questions or promises that drive the story. A question, greeting or order with nothing at stake is not a thread.",
  "- Never drop one to make room for a new one. Silence is not resolution: a thread nobody mentioned stays open.",
  "- Resolve a thread only when the new text settles it. Give its id in \"resolved\".",
  "- In \"open\", list kept threads with their id and new ones with id null.",
  "",
  "Keep the whole reply compact: short values, no filler.",
].join("\n");

// What a character said and is held to (#98): its own list in the report, never the user's character.
export const SAID_KINDS = ["vow", "promise", "threat", "confession", "secret", "order", "refusal", "lie"];
// the first wording, before it named what is NOT said and asked for a strength (#98, owner's check 2026-10-22: a self-introduction and an ordinary request were stored)
const SAID_RULE_13 =
  "- said: the strong statements a present character made in these messages and should be held to, the strongest only: a vow or promise, a threat, a confession or a revealed secret, an order, a refusal that matters, a lie they told (who: the speaker, one of those present and never the user's character; text: a short quote or a close paraphrase in the character's own words; kind: one of vow, promise, threat, confession, secret, order, refusal, lie). Set lie to true only when the text itself shows the statement is a lie. Ordinary dialogue is not said; none when nothing strong was said.";
const SAID_RULE =
  "- said: only a statement that binds the speaker or changes the story, and rarely more than one a turn: a vow or promise, a threat, a confession of something hidden or a revealed secret, an order that binds someone, a refusal that closes a door, a lie they told. NOT said, never report: a greeting or an introduction (\"I am the keeper of this glade\"), an ordinary request or question, a warning with no threat behind it, a description of habits, feelings or things, small talk, a joke, anything the Notebook already holds. Fields: who: the speaker, one of those present and never the user's character; text: a short quote or a close paraphrase in the character's own words; kind: one of vow, promise, threat, confession, secret, order, refusal, lie; strength: 1 to 3 (3 = the story will hinge on it, 2 = it matters, 1 = minor; report only 2 or 3). Set lie to true only when the text itself shows the statement is a lie. None when nothing strong was said, which is most turns.";

// How threads become quests (#117): a kind for each new one, and steps under a main one.
const QUEST_RULES = [
  "- Keep open threads, up to the open thread limits given in the input: unanswered questions or promises that drive the story. A question, greeting or order with nothing at stake is not a thread.",
  "- Give each new thread a kind: main (what the story is about now), side (an optional line the story could drop) or everyday (a small errand or chore of the moment, gone in a few turns). Kept threads keep their kind.",
  "- A concrete next step of a main thread is a new thread with parent set to that main thread's id. Only main threads have steps.",
];
// the wording before quests: one limit, no kinds
const THREADS_RULE_14 = "- Keep open threads, up to the open thread limit given in the input: unanswered questions or promises that drive the story. A question, greeting or order with nothing at stake is not a thread.";

export const DEFAULT_PROMPTS = {
  sensor: [
    "You are the scene sensor of an ongoing roleplay story. Read the New messages and the Previous state, and report what happened in the new messages. Code turns your report into numbers. You never give numbers for relationships. The only number you give is \"minutes\".",
    "",
    "Reply with one JSON object in the shape under \"Output shape\". Name events only from \"Event vocabulary\". No prose, no code fences. Write every letter as itself, never as a \\u escape.",
    "",
    "Language: Write every text value in English, whatever language the story is written in. Keep every name exactly as the story spells it, in its own script: never translate or transliterate a name. Keep ids, keys and enum values (\"saw\", \"heard\", \"guess\", \"routine\", \"significant\", \"pivotal\", \"user\") exactly as given.",
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
    "- Use the ids exactly as written in the vocabulary. Nothing in it fits: use \"other\". Never stretch an id to fit.",
    "",
    "Scene:",
    "- minutes: story time that passed in the new messages. Estimate it from what happens: a few lines of talk 2-5, a meal 20-40, a walk across a castle 10-20, a night's sleep 480. 0 only when nothing happens (for example a continuation of the same moment).",
    "- time and day: only when the text states them (\"evening\", \"19:40\", \"day 3\").",
    "- present: everyone in the scene at the end of the new messages who acts, speaks or is addressed in them, in person or in touch with the user's character from elsewhere (text messages, a call, a letter); the full list of the other characters, never the user's character itself, [] when the user's character is alone. Everyone in the Previous state stays present unless the text shows them leaving or the talk ending. A narrator who only tells the story is not a person in the scene. struck: anyone who left, fell asleep, ended the call or chat, or is otherwise out of it.",
    "- place and weather: only when stated or changed.",
    "- scene: new is true when this turn starts a new scene: a fight starts or ends, a conversation ends and someone leaves, the story moves to a new place, or time skips ahead. Otherwise false. label: 2 to 5 words in English naming the new scene; only when new is true.",
    "- chars: for each present character, mood, condition, outfit, holding, goal, leads (who drives the scene right now: a name or \"user\"), only what the text shows. contact, for every present character every turn: \"in person\", or how they reach the user's character from elsewhere: \"text\", \"call\", \"video\" or \"letter\".",
    "",
    "Direction:",
    "- direction: what kind of scene this is now, one of domestic (a private, familiar place with one or two people), social (three or more people in a public or institutional place: an academy, a court, a tavern), intrigue (secret deals, politics, bargaining), investigation (a search, a mystery, an inquiry), travel (on the road, or on hostile or unknown ground), combat (violence under way), explicit (a sexual scene), transition (a time skip or a journey told in a line: \"three days later\").",
    "- Keep the direction of the Previous state unless the new messages show a clear change: a fight starts or ends, people arrive or leave, the place changes, a search or a deal begins, time skips. A change of mood or a single line is not a change. When in doubt, keep it.",
    "- When an explicit scene ends, is interrupted or moves to another place, give the direction it had before (the Previous state names it).",
    "",
    "Knowledge:",
    "- A character learns only what happened while they were present (\"saw\"), what they were told (\"heard\", \"from\" is the teller), or what they guess (\"guess\"). Never give knowledge to someone absent, asleep or struck. Someone in touch from elsewhere sees nothing of the user's character: they learn only what is said or sent to them (\"heard\").",
    "- learned: concrete new facts about the user's character that a character sees, hears or guesses (who: the character who learned it, one of those present and never the user's character; what: the fact), never a summary of the conversation and never one note for everyone; at most 4 per turn, the ones that matter; none when nothing is new. Skip anything already in their Notebook, even in other words. weight of a note: everyday (small, may fade), important (still matters in a week of story time), key (changes who the user's character is to them for good: a name, a secret, a debt, a wound).",
    SAID_RULE,
    "- told: when one character repeats a notebook entry to another, give from, to and the entry id. retire: ids of notebook entries the new text disproves.",
    "- names: when the user's name is said in a character's presence, set heardUserName true for them. Also set it true when the new messages clearly show the character already knows the user's character personally (serves them, lives or works with them, shares a past with them, addresses them as someone known). A stranger, or someone who only uses a title or form of address with no sign of knowing them, stays false: never guess. \"calls\" is the exact form of address the character uses for the user now (name, nickname, pet name, title); report it when it changes.",
    "- blindSpot: only for present characters named in this turn's events, never the user's character: one short line (up to 15 words) on what they do not know that matters here. It is for the user's eyes only.",
    "- edges: for two present characters who are not the user, a one-word role and a one-word warmth.",
    "",
    "Threads:",
    ...QUEST_RULES,
    "- Never drop one to make room for a new one. Silence is not resolution: a thread nobody mentioned stays open.",
    "- Resolve a thread only when the new text settles it. Give its id in \"resolved\".",
    "- In \"open\", list kept threads with their id and new ones with id null. Never list a thread you resolve in the same report.",
    "",
    "Keep the whole reply compact: short values, no filler.",
  ].join("\n"),
  // rates the main characters of a card; the event list, the stat names and the output shape are appended in code
  soul: [
    "You read a roleplay card and its lorebook and rate its main characters for a relationship tracker.",
    "Rate only recurring characters the sources describe as people with a name and a personality of their own: the card's own character, and for a narrator card the main named characters its story is about. Skip the narrator itself, the user's character (the player, \"you\", {{user}}), and minor figures: unnamed or one-scene people such as guards, servants, merchants and passers-by. At most six characters; fewer is fine; none when no one fits.",
    "Judge from what the sources say, not from stereotypes. When the sources say nothing about a quality, use 50 (no lean) for a trait or a spectrum.",
    "- class: how the character relates to the user at the start: romantic (a love interest), ally, neutral or hostile.",
    "- start: how the character feels about the user when the story begins, as the card and its first message set it up (a sworn advisor or an old friend already trusts and respects the user; a rival or a captor distrusts them; a stranger stays near 0). Numbers from -20 to 20; leave a stat out only when the sources give it no lean.",
    "- traits, 0 to 100: dominance, confidence, shyness, patience, curiosity.",
    "- spectra, 0 to 100 (0 = the first word, 100 = the second): introvert_extrovert, cautious_reckless, reserved_emotional, lawful_rebellious, suspicious_trusting, pessimist_optimist.",
    "- triggers: up to four things that hurt this character more than most people; values: up to four things they prize. Each names one event id from the list below, the stat it hits, and x = 1.5 (strong) or 2 (very strong); cue is a few words.",
    "- coping: one short line on how they behave under strain.",
    "- pronouns: she, he or they. aliases: other spellings of the name the sources use.",
    "- cardType: what the card is: single (one character), narrator (a narrator or game master voicing several characters), group (a fixed ensemble), assistant (an AI assistant, not a story character) or other. Always give cardType.",
    "- Names: the message lists the names already seen in this card's chats with counts. Key each soul by the spelling those chats use; put other spellings of the same character (another script, a transliteration, a nickname) in aliases. When the message lists souls this card already has, do what the message says about them; a name that is the same character in another spelling is not a new character. Put every seen name that gets no soul (a minor figure, the narrator, the user) in minor. A name seen only once and not described in the card or lorebook is minor.",
    "Write cue, coping and note in the language of the story; ids, keys and class words stay English. Write letters as they are, never as \\u escapes.",
  ].join("\n"),
  // the "Story, move" note added to the end of one reply request; {threads} is filled in code (see nudgeText)
  // what happens grows out of the scene: with nothing to stand on, a model invented a messenger out of nowhere
  nudge:
    "[For this reply only: do not just react to the last message. Let the world or another character act on their own and make something concrete happen that moves the story forward{threads}. Build it from what is already present or under way: a character's intent, a danger, promise or plan already set up, the place itself. Bring in nothing from nowhere. Stay in character and in the scene, and keep to what each character can know; never mention this note.]",
  // fast mode: what the story model is told about the state tag; the sensor's rules, the event list, the output shape and
  // the previous state are added in code (see fastInstructions)
  fast:
    "Dashboard note: never mention it in the story. After your reply, end the message with the story state of this turn: on its own last line write <vertep_state>, then one JSON object, then </vertep_state>. Write nothing after the closing tag. The tag is cut out before anyone reads the reply. The JSON reports what happened in this turn, that is the user's last message and your reply, in the shape under \"Output shape\" and by the rules below; where the rules say \"the new messages\", they mean those two. Name events only from \"Event vocabulary\". Write every text value in English, whatever language the story is written in. Keep ids, keys and enum values exactly as given, and every name exactly as the story spells it, in its own script. The story itself stays in its own language: only the JSON is in English. Write letters as they are, never as \\u escapes. No code fences. Keep the JSON compact: short values, no filler.",
};
// The fourteenth sensor prompt (before threads became quests with kinds and steps, #117).
const SENSOR_PROMPT_14 = DEFAULT_PROMPTS.sensor.replace(QUEST_RULES.join("\n"), THREADS_RULE_14);
// The thirteenth sensor prompt (before the `said` rule named what is not said and asked for a strength, #98).
const SENSOR_PROMPT_13 = SENSOR_PROMPT_14.replace(SAID_RULE, SAID_RULE_13);
// The twelfth sensor prompt (before the `said` list of what a character said, #98).
const SENSOR_PROMPT_12 = SENSOR_PROMPT_14.replace(SAID_RULE + "\n", "");
// The eleventh sensor prompt (before it said that `who` of a learned fact is a present character and never the user's, and that present never lists the user, #97).
const SENSOR_PROMPT_11 = SENSOR_PROMPT_12
  .replace("the full list of the other characters, never the user's character itself, [] when the user's character is alone.", "the full list, [] when the user's character is alone.")
  .replace("(who: the character who learned it, one of those present and never the user's character; what: the fact)", "(who, what)");
// The tenth sensor prompt (before it told the sensor not to list a thread it resolves, #81).
const SENSOR_PROMPT_10 = SENSOR_PROMPT_11.replace(" Never list a thread you resolve in the same report.", "");
// The ninth sensor prompt (before the scene direction, for the World DM, #52).
const SENSOR_PROMPT_9 = SENSOR_PROMPT_10.replace(/\n\nDirection:\n[\s\S]*?(?=\n\nKnowledge:)/, "");
// The eighth sensor prompt (before a character in touch by text, call or letter counted as present, #16).
const SENSOR_PROMPT_8 = SENSOR_PROMPT_9
  .replace("- present: everyone in the scene at the end of the new messages who acts, speaks or is addressed in them, in person or in touch with the user's character from elsewhere (text messages, a call, a letter); the full list, [] when the user's character is alone. Everyone in the Previous state stays present unless the text shows them leaving or the talk ending. A narrator who only tells the story is not a person in the scene. struck: anyone who left, fell asleep, ended the call or chat, or is otherwise out of it.", "- present: everyone physically in the scene at the end of the new messages who acts, speaks or is addressed in them (the full list; [] when the user's character is alone). Everyone in the Previous state stays present unless the text shows them leaving. A narrator who only tells the story is not a person in the scene. struck: anyone who left, fell asleep or is otherwise out of it.")
  .replace("- chars: for each present character, mood, condition, outfit, holding, goal, leads (who drives the scene right now: a name or \"user\"), only what the text shows. contact, for every present character every turn: \"in person\", or how they reach the user's character from elsewhere: \"text\", \"call\", \"video\" or \"letter\".", "- chars: for each present character, mood, condition, outfit, holding, goal, leads (who drives the scene right now: a name or \"user\"), only what the text shows.")
  .replace("- A character learns only what happened while they were present (\"saw\"), what they were told (\"heard\", \"from\" is the teller), or what they guess (\"guess\"). Never give knowledge to someone absent, asleep or struck. Someone in touch from elsewhere sees nothing of the user's character: they learn only what is said or sent to them (\"heard\").", "- A character learns only what happened while they were present (\"saw\"), what they were told (\"heard\", \"from\" is the teller), or what they guess (\"guess\"). Never give knowledge to someone absent, asleep or struck.");
// The defaults before every text value went English (2026-10-07): the story's language.
const SENSOR_PROMPT_7 = SENSOR_PROMPT_8
  .replace("Write every text value in English, whatever language the story is written in. Keep every name exactly as the story spells it, in its own script: never translate or transliterate a name. Keep ids, keys and enum values (\"saw\", \"heard\", \"guess\", \"routine\", \"significant\", \"pivotal\", \"user\") exactly as given.", "Write every text value in the language the story is written in. Keep ids, keys and enum values (\"saw\", \"heard\", \"guess\", \"routine\", \"significant\", \"pivotal\", \"user\") exactly as given. Keep every name as the story spells it.")
  .replace("label: 2 to 5 words in English naming the new scene; only when new is true.", "label: 2 to 5 words naming the new scene, in the language of the story; only when new is true.");
// The fast note before it said the story keeps its own language (2026-10-12): a small model wrote the story in English too.
const FAST_PROMPT_2 = DEFAULT_PROMPTS.fast.replace(" The story itself stays in its own language: only the JSON is in English.", "");
const FAST_PROMPT_1 = FAST_PROMPT_2.replace("Write every text value in English, whatever language the story is written in. Keep ids, keys and enum values exactly as given, and every name exactly as the story spells it, in its own script.", "Write every text value in the language the story is written in. Keep ids, keys and enum values exactly as given, and every name as the story spells it.");
// The sensor prompt in blocks the user can edit one by one: the default is cut at its headings
// (blank-line paragraphs), and the blocks joined with a blank line give the default back exactly.
export const SENSOR_PARTS = [
  { key: "role", title: "Role and reply format" },
  { key: "language", title: "Language" },
  { key: "truth", title: "Truth" },
  { key: "events", title: "Events" },
  { key: "scene", title: "Scene" },
  { key: "direction", title: "Scene direction" },
  { key: "knowledge", title: "Knowledge" },
  { key: "threads", title: "Threads" },
  { key: "style", title: "Reply size" },
];
const SENSOR_HEADINGS = { "Language:": "language", "Truth:": "truth", "Events:": "events", "Scene:": "scene", "Direction:": "direction", "Knowledge:": "knowledge", "Threads:": "threads" };
function splitSensor(text) {
  const parts = {};
  let key = "role";
  for (const para of text.split("\n\n")) {
    const first = para.split("\n")[0];
    const head = Object.keys(SENSOR_HEADINGS).map((h) => (first.startsWith(h) ? SENSOR_HEADINGS[h] : null)).find(Boolean);
    if (head) key = head;
    else if (key === "threads" && parts.threads !== undefined) key = "style";
    parts[key] = parts[key] === undefined ? para : parts[key] + "\n\n" + para;
  }
  return parts;
}
export const DEFAULT_SENSOR_PARTS = splitSensor(DEFAULT_PROMPTS.sensor);
/** The sensor prompt from the user's changed parts (or the defaults). */
const sensorFromParts = (stored) =>
  SENSOR_PARTS.map((part) => (isObj(stored) && typeof stored[part.key] === "string" && stored[part.key].trim() ? stored[part.key] : DEFAULT_SENSOR_PARTS[part.key])).join("\n\n");

// Earlier defaults, so a stored copy of one follows the current default.
// "Story, move" before 4.26.1: no anchor in the scene
const NUDGE_PROMPT_1 =
  "[For this reply only: do not just react to the last message. Let the world or another character act on their own and make something concrete happen that moves the story forward{threads}. Stay in character and in the scene; never mention this note.]";
export const PAST_DEFAULT_PROMPTS = { sensor: [SENSOR_PROMPT_1, SENSOR_PROMPT_2, SENSOR_PROMPT_3, SENSOR_PROMPT_4, SENSOR_PROMPT_5, SENSOR_PROMPT_6, SENSOR_PROMPT_7, SENSOR_PROMPT_8, SENSOR_PROMPT_9, SENSOR_PROMPT_10, SENSOR_PROMPT_11, SENSOR_PROMPT_12, SENSOR_PROMPT_13, SENSOR_PROMPT_14], soul: [SOUL_PROMPT_1, SOUL_PROMPT_2, SOUL_PROMPT_3], nudge: [NUDGE_PROMPT_1], fast: [FAST_PROMPT_1, FAST_PROMPT_2] };
const PROMPT_KEYS = Object.keys(DEFAULT_PROMPTS);

const OUTPUT_SHAPE = [
  "{ \"present\": [\"name\"], \"struck\": [\"name\"],",
  "  \"minutes\": 0, \"time\": \"HH:MM or dawn|morning|late morning|day|evening|night\", \"day\": 1,",
  "  \"place\": \"text\", \"weather\": \"text\",",
  "  \"scene\": { \"new\": false, \"label\": \"2-5 words\", \"direction\": \"domestic|social|intrigue|investigation|travel|combat|explicit|transition\" },",
  "  \"events\": [ { \"id\": \"event id\", \"weight\": \"routine|significant|pivotal\", \"from\": \"name or user\", \"to\": \"name or user\", \"quote\": \"text\" } ],",
  "  \"chars\": { \"name\": { \"mood\": \"text\", \"condition\": \"text\", \"outfit\": \"text\", \"holding\": \"text\", \"goal\": \"text\", \"leads\": \"name or user\", \"contact\": \"in person|text|call|video|letter\" } },",
  "  \"learned\": [ { \"who\": \"name\", \"text\": \"text\", \"how\": \"saw|heard|guess\", \"from\": \"name or null\", \"weight\": \"everyday|important|key\" } ],",
  "  \"said\": [ { \"who\": \"name\", \"text\": \"quote\", \"kind\": \"vow|promise|threat|confession|secret|order|refusal|lie\", \"strength\": 2, \"lie\": false } ],",
  "  \"told\": [ { \"from\": \"name\", \"to\": \"name\", \"note\": \"entry id\" } ],",
  "  \"retire\": [\"entry id\"],",
  "  \"names\": [ { \"who\": \"name\", \"heardUserName\": true, \"calls\": \"text\" } ],",
  "  \"threads\": { \"open\": [ { \"id\": \"t1 or null\", \"text\": \"...\", \"kind\": \"main|side|everyday\", \"parent\": \"main thread id, only for a step\" } ], \"resolved\": [\"thread id\"] },",
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

/** A valid user row as { id, family, meaning, deltas }, else null. */
function readRow(e) {
  if (!isObj(e) || !VOCAB_ID.test(String(e.id)) || typeof e.family !== "string" || !VOCAB_FAMILY.test(e.family)) return null;
  const deltas = readDeltas(e.deltas === undefined ? {} : e.deltas);
  return deltas ? { id: e.id, family: e.family, meaning: cut(str(e.meaning), 200), deltas } : null;
}

// `other` is where unknown events land, so it cannot be switched off
const isOff = (e) => isObj(e) && VOCAB_ID.test(String(e.id)) && e.off === true && e.id !== "other";

/** Event table by id: the defaults, then the user file in order (same id replaces; an `off` row removes). */
export function buildVocab(userEvents) {
  const vocab = {};
  for (const [family, id, meaning, deltas] of EVENT_ROWS) vocab[id] = { id, family, meaning, deltas };
  for (const e of arr(userEvents)) {
    if (isOff(e)) {
      delete vocab[e.id];
      continue;
    }
    const row = readRow(e);
    if (row) vocab[row.id] = row;
  }
  return vocab;
}
const DEFAULT_VOCAB = buildVocab([]);
const userEventRows = (fsx) => {
  const raw = readJson(fsx, EVENTS_FILE, null);
  return isObj(raw) ? arr(raw.events) : [];
};
const loadVocab = (fsx) => buildVocab(userEventRows(fsx));

const sameRow = (a, b) => a.family === b.family && a.meaning === b.meaning && canonJson(a.deltas) === canonJson(b.deltas);

/** For the UI: every default and custom event as { id, family, meaning, deltas, source, off }. */
export function vocabRows(userEvents) {
  const rows = new Map();
  for (const [family, id, meaning, deltas] of EVENT_ROWS) rows.set(id, { id, family, meaning, deltas, source: "default", off: false });
  for (const e of arr(userEvents)) {
    if (isOff(e)) {
      const had = rows.get(e.id);
      if (had) rows.set(e.id, { ...had, off: true });
      continue;
    }
    const row = readRow(e);
    if (!row) continue;
    const dflt = DEFAULT_VOCAB[row.id];
    rows.set(row.id, { ...row, source: !dflt ? "custom" : sameRow(row, dflt) ? "default" : "changed", off: false });
  }
  return [...rows.values()];
}

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
  if ((stat === "trust" || stat === "comfort") && Number.isFinite(shy) && shy > SHYNESS_BRAKE && s > 1) {
    s = 1;
    turnLines.push("shyness " + fmt(shy) + " > " + SHYNESS_BRAKE + ": growth capped at +1");
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

// ---------- souls: lookup and clean-up ----------
// Russian and Ukrainian letters as Latin ones, for comparing a name across scripts
const CYRILLIC_TO_LATIN = {
  [String.fromCharCode(0x0430)]: "a", [String.fromCharCode(0x0431)]: "b", [String.fromCharCode(0x0432)]: "v", [String.fromCharCode(0x0433)]: "g", [String.fromCharCode(0x0491)]: "g", [String.fromCharCode(0x0434)]: "d", [String.fromCharCode(0x0435)]: "e", [String.fromCharCode(0x0451)]: "e", [String.fromCharCode(0x0454)]: "e", [String.fromCharCode(0x0436)]: "zh", [String.fromCharCode(0x0437)]: "z", [String.fromCharCode(0x0438)]: "i", [String.fromCharCode(0x0456)]: "i", [String.fromCharCode(0x0457)]: "i", [String.fromCharCode(0x0439)]: "i", [String.fromCharCode(0x043a)]: "k", [String.fromCharCode(0x043b)]: "l", [String.fromCharCode(0x043c)]: "m",
  [String.fromCharCode(0x043d)]: "n", [String.fromCharCode(0x043e)]: "o", [String.fromCharCode(0x043f)]: "p", [String.fromCharCode(0x0440)]: "r", [String.fromCharCode(0x0441)]: "s", [String.fromCharCode(0x0442)]: "t", [String.fromCharCode(0x0443)]: "u", [String.fromCharCode(0x0444)]: "f", [String.fromCharCode(0x0445)]: "kh", [String.fromCharCode(0x0446)]: "ts", [String.fromCharCode(0x0447)]: "ch", [String.fromCharCode(0x0448)]: "sh", [String.fromCharCode(0x0449)]: "shch", [String.fromCharCode(0x044a)]: "", [String.fromCharCode(0x044b)]: "y", [String.fromCharCode(0x044c)]: "", [String.fromCharCode(0x044d)]: "e", [String.fromCharCode(0x044e)]: "yu", [String.fromCharCode(0x044f)]: "ya",
};

/** A name for comparing across scripts: lowercase, Cyrillic as Latin, accents and everything but a-z and 0-9 dropped. */
export function nameKey(s) {
  let out = "";
  for (const ch of String(s === undefined || s === null ? "" : s).toLowerCase()) out += Object.prototype.hasOwnProperty.call(CYRILLIC_TO_LATIN, ch) ? CYRILLIC_TO_LATIN[ch] : ch;
  return out.normalize("NFD").replace(/[^a-z0-9]/g, "");
}

/** Edit distance at most 1: true if a and b differ by one insertion, deletion, or replacement. */
function editDistanceAtMostOne(a, b) {
  if (!a || !b) return false;
  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > 1) return false;
  if (lenDiff === 0) {
    // same length: one replacement or identical
    let diffs = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++;
    return diffs <= 1;
  }
  // one is longer: check if it's one insertion
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  let si = 0, insertionFound = false;
  for (let li = 0; li < longer.length; li++) {
    if (si < shorter.length && shorter[si] === longer[li]) {
      si++;
    } else {
      if (insertionFound) return false; // more than one insertion
      insertionFound = true;
    }
  }
  return si === shorter.length;
}

/** The soul for a name: the exact key, a key that differs only in case, an alias, then the same name in another script, then near-miss by edit distance 1. */
export function soulOf(souls, name) {
  if (!isObj(souls)) return undefined;
  const s = str(name);
  if (!s) return undefined;
  if (Object.prototype.hasOwnProperty.call(souls, s) && isObj(souls[s])) return souls[s];
  const low = s.toLowerCase();
  for (const [k, v] of Object.entries(souls)) if (isObj(v) && k.trim().toLowerCase() === low) return v;
  for (const v of Object.values(souls)) if (isObj(v) && arr(v.aliases).some((a) => typeof a === "string" && a.trim().toLowerCase() === low)) return v;
  const key = nameKey(s);
  if (!key) return undefined;
  for (const [k, v] of Object.entries(souls)) if (isObj(v) && nameKey(k) === key) return v;
  for (const v of Object.values(souls)) if (isObj(v) && arr(v.aliases).some((a) => typeof a === "string" && nameKey(a) === key)) return v;
  // near-miss: one edit distance, only if exactly one match
  if (key.length >= 6) {
    const matches = [];
    for (const [k, v] of Object.entries(souls)) {
      if (isObj(v) && editDistanceAtMostOne(key, nameKey(k))) {
        matches.push(v);
      }
    }
    for (const v of Object.values(souls)) {
      if (isObj(v) && !matches.includes(v) && arr(v.aliases).some((a) => typeof a === "string" && editDistanceAtMostOne(key, nameKey(a)))) {
        matches.push(v);
      }
    }
    if (matches.length === 1) return matches[0];
  }
  return undefined;
}

/** A list of names: strings, trimmed, none empty, cut to 60, unique ignoring case, at most 64. */
function cleanNames(raw) {
  const out = [];
  for (const n of arr(raw)) {
    const s = typeof n === "string" ? cut(n.trim(), 60) : "";
    if (s && out.length < 64 && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

/** `names` plus every soul key no listed name already stands for (an alias is not listed twice). */
function withSoulNames(souls, names) {
  const list = unique(names);
  for (const key of Object.keys(souls)) if (!list.some((n) => soulOf(souls, n) === souls[key])) list.push(key);
  return list;
}

/** name -> the key of the saved soul that name stands for (spelling, alias, lorebook key, near-miss), or undefined. */
function savedKeyResolver(fsx, cardId, own) {
  const lookup = withLorebookAliases(fsx, own, [cardId], []);
  return (name) => {
    const hit = soulOf(lookup, name);
    return hit ? Object.keys(lookup).find((k) => lookup[k] === hit) : undefined;
  };
}

/**
 * A proposal filed under the souls the card already has: a proposed name that
 * resolves to a saved soul (spelling, alias, lorebook key, near-miss) takes that
 * soul's key. The proposal's values win (the saved soul is what the editor
 * compares with); the names join the aliases. Lorebook keys only help matching
 * and are never written.
 */
function rekeyToCard(card, draft, fsx, cardId) {
  if (!draft || !isObj(draft.characters) || !Object.keys(draft.characters).length) return draft;
  const own = cardSoulsOf(card);
  if (!Object.keys(own).length) return draft;
  const keyOf = savedKeyResolver(fsx, cardId, own);
  const out = {};
  for (const [name, soul] of Object.entries(draft.characters)) {
    const key = keyOf(name) || name;
    const names = [...arr(out[key] ? out[key].aliases : own[key] ? own[key].aliases : []), ...arr(soul.aliases), name];
    const aliases = cleanNames(names.filter((a) => typeof a === "string" && a.toLowerCase() !== key.toLowerCase())).slice(0, 16);
    // the first proposal for a key brings the values; a twin only adds its name
    const base = out[key] || soul;
    out[key] = { ...base, ...(aliases.length ? { aliases } : {}) };
  }
  return { ...draft, characters: out };
}

// a number, or a numeric string; never a boolean or an array
const numOf = (v) => (typeof v === "number" || typeof v === "string" ? num(v) : NaN);
const intIn = (v, lo, hi) => {
  const n = numOf(v);
  return Number.isFinite(n) ? clamp(Math.round(n), lo, hi) : undefined;
};
/** The known keys of a scale as integers in lo..hi; unknown keys dropped; null when nothing is left. */
function scaleOf(raw, keys, lo, hi) {
  if (!isObj(raw)) return null;
  const out = {};
  for (const k of keys) {
    const n = intIn(raw[k], lo, hi);
    if (n !== undefined) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

/** Triggers or values: { cue, event, stat, x }; an item with an unknown event id or stat is dropped. */
function cueList(raw) {
  const out = [];
  for (const t of arr(raw)) {
    if (!isObj(t) || out.length >= 12) continue;
    const event = typeof t.event === "string" ? t.event : "";
    const stat = typeof t.stat === "string" ? t.stat : "";
    if (!VOCAB_ID.test(event) || !DELTA_KEYS.includes(stat)) continue;
    const x = numOf(t.x);
    out.push({ cue: cut(str(t.cue), 80), event, stat, x: Number.isFinite(x) ? clamp(x, 1, 3) : 1.5 });
  }
  return out;
}

/** A soul as the code may trust it. Unknown keys ride along untouched; known keys are checked. */
export function normalizeSoul(raw) {
  if (!isObj(raw)) return {};
  const out = { ...raw };
  for (const k of ["class", "pronouns", "aliases", "start", "traits", "spectra", "triggers", "values", "coping", "pulseBase", "locked", "ratedBy"]) delete out[k];
  if (CLASSES.includes(raw.class)) out.class = raw.class;
  if (PRONOUN_KEYS.includes(raw.pronouns)) out.pronouns = raw.pronouns;
  if (Array.isArray(raw.aliases)) {
    const seen = [];
    for (const a of raw.aliases) {
      const s = typeof a === "string" ? cut(a.trim(), 60) : "";
      if (s && seen.length < 16 && !seen.some((x) => x.toLowerCase() === s.toLowerCase())) seen.push(s);
    }
    out.aliases = seen;
  }
  if (isObj(raw.start)) {
    const start = scaleOf(raw.start, DISPOSITION, -20, 20) || {};
    const h = intIn(raw.start.hostility, 0, 100);
    if (h !== undefined) start.hostility = h;
    if (Object.keys(start).length) out.start = start;
  }
  const traits = scaleOf(raw.traits, TRAIT_KEYS, 0, 100);
  if (traits) out.traits = traits;
  const spectra = scaleOf(raw.spectra, SPECTRUM_KEYS, 0, 100);
  if (spectra) out.spectra = spectra;
  if (Array.isArray(raw.triggers)) out.triggers = cueList(raw.triggers);
  if (Array.isArray(raw.values)) out.values = cueList(raw.values);
  if (str(raw.coping)) out.coping = cut(str(raw.coping), 300);
  const arousal = isObj(raw.pulseBase) ? intIn(raw.pulseBase.arousal, 0, 100) : undefined;
  if (arousal !== undefined) out.pulseBase = { arousal };
  if (typeof raw.locked === "boolean") out.locked = raw.locked;
  if (str(raw.ratedBy)) out.ratedBy = cut(str(raw.ratedBy), 40);
  return out;
}

/** A proposal file as the code may trust it, or null when it is not an object. */
export function normalizeDraft(raw) {
  if (!isObj(raw)) return null;
  const at = numOf(raw.at);
  const out = { v: 1, at: Number.isFinite(at) ? at : 0, by: raw.by === "molfar" ? "molfar" : "auto" };
  if (str(raw.model)) out.model = cut(str(raw.model), 160);
  if (str(raw.note)) out.note = cut(str(raw.note), 400);
  if (str(raw.error)) out.error = cut(str(raw.error), 400);
  const dismissed = numOf(raw.dismissedAt);
  if (Number.isFinite(dismissed)) out.dismissedAt = dismissed;
  out.characters = {};
  if (Array.isArray(raw.minor)) out.minor = cleanNames(raw.minor);
  if (["single", "narrator", "group", "assistant", "other"].includes(raw.cardType)) out.cardType = raw.cardType;
  if (isObj(raw.characters)) {
    for (const [name, soul] of Object.entries(raw.characters)) {
      const n = cut(name.trim(), 60);
      if (!n || !isObj(soul) || Object.keys(out.characters).length >= 12 || Object.prototype.hasOwnProperty.call(out.characters, n)) continue;
      out.characters[n] = normalizeSoul(soul);
    }
  }
  return out;
}

// ---------- souls: the cards and their proposals ----------
const draftPath = (cardId) => DRAFT_DIR + cardId + ".json";

function fileExists(fsx, path) {
  try {
    fsx.read(path);
    return true;
  } catch {
    return false;
  }
}

/** The proposal of a card (normalized), or null. */
function readDraft(fsx, cardId) {
  return CHAT_ID.test(cardId) ? normalizeDraft(readJson(fsx, draftPath(cardId), null)) : null;
}

/** The souls a card holds itself. */
function cardSoulsOf(card) {
  const found = isObj(card) && card.extensions && card.extensions.molfar_soul && card.extensions.molfar_soul.characters;
  const out = {};
  if (isObj(found)) for (const [n, soul] of Object.entries(found)) if (isObj(soul)) out[n] = soul;
  return out;
}

// the value keys of a soul that a proposal can differ in
const SOUL_VALUE_KEYS = ["start", "traits", "spectra", "triggers", "values", "coping", "pulseBase"];

/** JSON with the keys of every object sorted, so equal values give equal text. */
function canonJson(v) {
  if (Array.isArray(v)) return "[" + v.map(canonJson).join(",") + "]";
  if (isObj(v)) return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonJson(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}

/** What a soul says, as text: no aliases, locked, ratedBy or unknown keys; a missing class is neutral, missing pronouns they. */
function soulValuesOf(raw) {
  const soul = normalizeSoul(raw);
  const out = { class: soul.class || "neutral", pronouns: soul.pronouns || "they" };
  for (const k of SOUL_VALUE_KEYS) if (soul[k] !== undefined) out[k] = soul[k];
  return canonJson(out);
}

/** The proposal without the characters that equal the soul the card already saved under that key. A copy. */
function withoutSettled(card, draft) {
  if (!draft || !isObj(draft.characters)) return draft;
  const own = cardSoulsOf(card);
  const characters = {};
  for (const [name, soul] of Object.entries(draft.characters)) {
    const saved = Object.prototype.hasOwnProperty.call(own, name) ? own[name] : null;
    if (saved && soulValuesOf(saved) === soulValuesOf(soul)) continue;
    characters[name] = soul;
  }
  return { ...draft, characters };
}

/** What the proposal route shows: the file, filed under the card's souls, without what the card already says. */
function visibleDraft(fsx, cardId, card) {
  const draft = readDraft(fsx, cardId);
  if (!draft || !isObj(card)) return draft;
  return withoutSettled(card, rekeyToCard(card, draft, fsx, cardId));
}

/** The names a card marks as minor: no soul on purpose. */
function cardMinorOf(card) {
  const bag = isObj(card) && card.extensions && card.extensions.molfar_soul;
  return isObj(bag) ? cleanNames(bag.minor) : [];
}

/** Lorebook keys as aliases: for each enabled entry, name-like keys (trimmed, 1..40 chars, starts with uppercase, at most 3 words, not a regex). Returns key groups where each key in a group might be an alias for a soul. */
function lorebookAliases(fsx, cardId, extraLorebookIds) {
  const groups = [];
  const card = readCard(fsx, cardId);
  if (!isObj(card)) return groups;
  const studio = isObj(card.studio) ? card.studio : {};
  const bookIds = unique([studio.embeddedLorebookId, ...arr(studio.linkedLorebookIds), ...arr(extraLorebookIds)]).filter((id) => typeof id === "string" && CHAT_ID.test(id));
  // also check embedded lorebook
  const books = [];
  if (isObj(card.character_book)) books.push(entriesOf(card.character_book));
  for (const id of bookIds) {
    const book = readJson(fsx, "lorebooks/" + id + ".json", null);
    if (isObj(book)) books.push(entriesOf(book));
  }
  for (const entries of books) {
    for (const e of entries) {
      if (!isObj(e) || e.disable === true || e.enabled === false) continue;
      const keyList = (Array.isArray(e.keys) ? e.keys : Array.isArray(e.key) ? e.key : []).filter((k) => typeof k === "string");
      const nameKeys = [];
      for (const k of keyList) {
        const trimmed = k.trim();
        if (trimmed.length < 1 || trimmed.length > 40) continue;
        // a capital letter in any script; digits and signs are no names
        if (trimmed[0] === trimmed[0].toLowerCase()) continue;
        const words = trimmed.split(/\s+/).length;
        if (words > 3) continue;
        if (trimmed.startsWith("/")) continue;
        nameKeys.push(trimmed);
      }
      if (nameKeys.length) groups.push(nameKeys);
    }
  }
  return groups;
}

/**
 * The souls with the lorebook's names merged into their aliases: when a key of
 * an entry names a soul, the entry's other name keys count as aliases too.
 * Copies only; what came from the card is never changed or written.
 */
function withLorebookAliases(fsx, souls, cardIds, extraLorebookIds) {
  const groups = [];
  for (const id of unique(cardIds)) groups.push(...lorebookAliases(fsx, id, extraLorebookIds));
  if (!groups.length) return souls;
  const out = { ...souls };
  for (const group of groups) {
    const hit = group.map((k) => soulOf(souls, k)).find(Boolean);
    if (!hit) continue;
    const key = Object.keys(souls).find((k) => souls[k] === hit);
    const merged = arr(out[key].aliases).filter((a) => typeof a === "string");
    for (const k of group) {
      if (merged.length >= 32) break;
      if (k.toLowerCase() !== key.toLowerCase() && !merged.some((a) => a.toLowerCase() === k.toLowerCase())) merged.push(k);
    }
    out[key] = { ...out[key], aliases: merged };
  }
  return out;
}

/** Add the souls of a live proposal (not dismissed, not failed) for names that have none yet. */
function addProvisional(souls, draft) {
  if (!draft || draft.dismissedAt || draft.error) return;
  for (const [n, soul] of Object.entries(draft.characters)) if (!soulOf(souls, n)) souls[n] = soul;
}

const readCard = (fsx, cardId) => (CHAT_ID.test(String(cardId)) ? readJson(fsx, "characters/" + cardId + "/card.json", null) : null);

/** The ids of the cards that speak in this chat. */
function memberIds(fsx, meta) {
  const ids = meta.groupId ? arr(readJson(fsx, "groups/" + meta.groupId + ".json", {}).memberIds) : meta.characterId ? [meta.characterId] : [];
  return ids.filter((id) => typeof id === "string" && CHAT_ID.test(id));
}

function chatCharacters(fsx, meta) {
  const names = [];
  const souls = {};
  const cards = [];
  for (const id of memberIds(fsx, meta)) {
    const card = readCard(fsx, id);
    if (!isObj(card) || !card.name) continue;
    cards.push(id);
    names.push(String(card.name));
    for (const [n, soul] of Object.entries(cardSoulsOf(card))) if (!souls[n]) souls[n] = soul;
  }
  // a proposal the user has not settled yet plays as a provisional soul, behind the souls the cards hold
  for (const id of cards) addProvisional(souls, readDraft(fsx, id));
  return { names: unique(names), souls: withLorebookAliases(fsx, souls, cards, arr(meta.lorebookIds)) };
}

// what the user is called when the chat and the persona give no name
const NO_USER_NAME = "the user";

function userNameOf(fsx, meta) {
  if (str(meta.userName)) return str(meta.userName);
  if (meta.personaId && CHAT_ID.test(String(meta.personaId))) {
    const persona = readJson(fsx, "personas/" + meta.personaId + ".json", null);
    if (persona && str(persona.name)) return str(persona.name);
  }
  return NO_USER_NAME;
}

/** Every name the user's character had in this chat. A persona switched
 *  mid-chat leaves the earlier name in the text, and that is still the
 *  player: never a character in the scene or one to rate (user, 2026-10-18). */
function userNamesOf(fsx, chat) {
  const names = [userNameOf(fsx, chat.meta)];
  for (const m of arr(chat.msgs)) if (isObj(m) && m.role === "user" && str(m.name)) names.push(str(m.name));
  return unique(names.filter((n) => n !== NO_USER_NAME));
}

// ---------- chat state file ----------
function emptyState(chatId) {
  return {
    v: 2,
    chatId,
    snapshots: {},
    places: {},
    notebook: {},
    names: {},
    history: {},
    said: {},
    counters: { note: 0, thread: 0, said: 0, proposal: 0 },
    proposals: [],
    lastError: null,
    usage: { calls: 0, inTokens: 0, outTokens: 0, lastMs: 0 },
  };
}

/** Unknown top-level keys ride along untouched. */
function normalizeState(raw, chatId) {
  const base = emptyState(chatId);
  const st = { ...base, ...(isObj(raw) ? raw : {}), v: 2, chatId };
  for (const k of ["snapshots", "places", "notebook", "names", "history", "said"]) if (!isObj(st[k])) st[k] = {};
  st.counters = { ...base.counters, ...(isObj(st.counters) ? st.counters : {}) };
  st.usage = { ...base.usage, ...(isObj(st.usage) ? st.usage : {}) };
  if (!isObj(st.lastError)) st.lastError = null;
  if (!isObj(st.keptOut)) st.keptOut = null;
  if (!Array.isArray(st.proposals)) st.proposals = [];
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

// ---------- a chat that continues another (#100) ----------
// The end state of the chat it continues is copied in once, at the start: the open threads, the
// characters' numbers, moods and places (as a base snapshot) and the notes still alive. Carried notes
// and names have this src, which always counts as active; the base snapshot stands in for the
// "previous state" until the chat has a snapshot of its own.
const INHERIT_KEY = "inherit";

/** The carried state when it is on: null for a chat that started clean or carries nothing. */
export const activeInherit = (state) => (isObj(state.inherited) && state.inherited.off !== true && isObj(state.inherited.snap) ? state.inherited : null);

/** The chat this one continues (the Litopys link), or null. */
function linkedFrom(fsx, chatId) {
  const raw = readJson(fsx, "litopys/links.json", null);
  const link = isObj(raw) && isObj(raw.links) && isObj(raw.links[chatId]) ? raw.links[chatId] : null;
  const from = link ? str(link.from) : "";
  return CHAT_ID.test(from) && from !== chatId ? from : null;
}

/** The end of an earlier chat: its last snapshot on its active line (or what it carried itself) and the keys that count. */
function endStateOf(fsx, chatId) {
  const chat = readChat(fsx, chatId);
  if (!chat) return null;
  const { state, existed } = loadState(fsx, chatId);
  if (!existed) return null;
  const keys = activeLine(chat.msgs).map((l) => l.key);
  const i = nearestSnapshot(state, keys, keys.length);
  const carried = activeInherit(state);
  const snap = i >= 0 ? state.snapshots[keys[i]] : carried ? carried.snap : null;
  if (!snap) return null;
  return { chat, state, snap, keys: i >= 0 ? keys.slice(0, i + 1) : [], overlay: loadOverlay(fsx, chatId) };
}

/** What a chat that continues `from` starts with, or null when there is nothing to carry. */
function buildInherit(fsx, chatId) {
  const from = linkedFrom(fsx, chatId);
  const end = from ? endStateOf(fsx, from) : null;
  if (!end) return null;
  const cfg = loadConfig(fsx);
  const alive = freshNotes(effectiveNotebook(end.state, end.keys, end.overlay).live, end.snap.turn, noteAgeOf(cfg));
  const notebook = {};
  let notes = 0;
  for (const [name, list] of Object.entries(alive)) {
    const kept = arr(list).filter((n) => isObj(n) && str(n.text)).map(({ retiredBy: _r, ...n }) => ({ ...n, src: INHERIT_KEY, fromChat: from }));
    if (kept.length) {
      notebook[name] = kept;
      notes += kept.length;
    }
  }
  const names = {};
  for (const [name, list] of Object.entries(activeNames(end.state, end.keys))) {
    const last = arr(list).slice(-1)[0];
    if (isObj(last)) names[name] = [{ ...last, src: INHERIT_KEY }];
  }
  // what the characters said and are held to: kept as it stands, the earlier chat's own source stays on each entry
  const said = {};
  for (const [name, list] of Object.entries(activeBySrc(end.state.said, end.keys))) {
    const kept = arr(list).filter((s) => isObj(s) && str(s.text)).map((s) => ({ ...s, src: INHERIT_KEY, fromChat: from }));
    if (kept.length) said[name] = kept;
  }
  const threads = effectiveThreads(end.overlay, end.snap.threads, end.snap.turn).filter((t) => t.status === "open" && str(t.text));
  const { sig: _s, base: _b, partial: _p, fast: _f, ...snap } = end.snap;
  return {
    inherited: {
      v: 1,
      from,
      title: str(end.chat.meta.title) || from,
      at: Date.now(),
      turn: end.snap.turn || 0,
      notes,
      threads: threads.length,
      snap: { ...snap, op: "inherit", events: [], threads },
    },
    notebook,
    names,
    said,
    counters: end.state.counters,
  };
}

function applyInherit(state, seed) {
  state.inherited = seed.inherited;
  for (const bag of ["notebook", "names", "said"]) {
    for (const [name, list] of Object.entries(seed[bag] || {})) state[bag][name] = [...list, ...arr(state[bag][name]).filter((x) => x.src !== INHERIT_KEY)];
  }
  // carried ids stay valid (the sensor retires a note by its id): the counters go on from the higher
  for (const k of ["note", "thread", "said"]) state.counters[k] = Math.max(Number(state.counters[k]) || 0, Number(seed.counters && seed.counters[k]) || 0);
}

/** Switch the carried state off: the chat starts clean. The choice stays, so it is not offered again. */
function dropInherit(state) {
  const was = isObj(state.inherited) ? state.inherited : {};
  state.inherited = { v: 1, off: true, from: was.from || null, title: was.title || "", notes: was.notes || 0, threads: was.threads || 0, at: Date.now() };
  for (const bag of ["notebook", "names", "said"]) {
    for (const name of Object.keys(state[bag])) {
      state[bag][name] = arr(state[bag][name]).filter((x) => x.src !== INHERIT_KEY);
      if (!state[bag][name].length) delete state[bag][name];
    }
  }
}

/**
 * The state of a chat, with the earlier chat's end state in it when this chat continues one and has not
 * started its own Dashboard (nothing is written here: `before` is the file as it was, so the first save
 * of a sensor run writes the carried state with it).
 */
function loadStateFor(fsx, chatId) {
  const loaded = loadState(fsx, chatId);
  const before = JSON.stringify(loaded.state);
  if (loaded.state.inherited === undefined && !Object.keys(loaded.state.snapshots).length) {
    const seed = buildInherit(fsx, chatId);
    if (seed) applyInherit(loaded.state, seed);
  }
  const carried = !!activeInherit(loaded.state);
  return { ...loaded, existed: loaded.existed || carried, before, carried };
}

const keySet = (keys) => new Set([...keys, INHERIT_KEY]);

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

/** FNV-1a 32-bit over the message texts, 8 hex chars: tells whether the newest message was edited or continued. */
function textSig(msgs) {
  const s = arr(msgs).map((m) => String((m && m.text) || "")).join(String.fromCharCode(1));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The place log: one record per message key, written with every snapshot and kept past the snapshot cap.
 * A re-written key moves to the end (insertion order = recency); over PLACES_LIMIT the oldest go.
 */
function logPlace(state, K, clock) {
  if (!isObj(state.places)) state.places = {};
  const c = isObj(clock) ? clock : {};
  const place = typeof c.place === "string" && c.place.trim() ? c.place.trim() : null;
  delete state.places[K];
  state.places[K] = {
    place,
    day: Number.isFinite(c.day) ? c.day : null,
    time: typeof c.time === "string" && c.time ? c.time : null,
    band: typeof c.band === "string" && c.band ? c.band : null,
  };
  const keys = Object.keys(state.places);
  for (const old of keys.slice(0, Math.max(0, keys.length - PLACES_LIMIT))) delete state.places[old];
}

/**
 * Where the story moved along the active line: one entry per change of place (the first place counts).
 * A key without a log record falls back to its snapshot clock (chats from before the log). Read only.
 */
export function scenesOf(state, keys) {
  const places = isObj(state.places) ? state.places : {};
  const snaps = isObj(state.snapshots) ? state.snapshots : {};
  const out = [];
  let last = null;
  for (const key of keys) {
    let rec = places[key];
    if (!isObj(rec)) {
      const snap = snaps[key];
      rec = isObj(snap) && isObj(snap.clock) ? snap.clock : null;
    }
    if (!rec) continue;
    const place = typeof rec.place === "string" ? rec.place.trim() : "";
    if (!place) continue;
    if (last !== null && place.toLowerCase() === last) continue;
    last = place.toLowerCase();
    out.push({
      key,
      place,
      day: Number.isFinite(rec.day) ? rec.day : null,
      time: typeof rec.time === "string" && rec.time ? rec.time : null,
      band: typeof rec.band === "string" && rec.band ? rec.band : null,
    });
  }
  return out.slice(-SCENES_LIMIT);
}

/** Remove everything the snapshot of key K wrote (a re-sense starts clean). Counters stay. */
function dropSnapshot(state, K) {
  delete state.snapshots[K];
  if (isObj(state.places)) delete state.places[K];
  for (const [name, notes] of Object.entries(state.notebook)) {
    const kept = arr(notes).filter((n) => n.src !== K);
    for (const n of kept) if (n.retiredBy === K) delete n.retiredBy;
    if (kept.length) state.notebook[name] = kept;
    else delete state.notebook[name];
  }
  for (const bag of [state.names, state.history]) {
    for (const [name, list] of Object.entries(bag)) {
      const kept = arr(list).filter((x) => x.src !== K);
      if (kept.length) bag[name] = kept;
      else delete bag[name];
    }
  }
}

// ---------- the user's overlay: notes and threads the user owns ----------
// dashboard/notes/<chatId>.json is written only by the user's routes, never by an update,
// so an edit cannot race a sensor call. Unknown ids in it are ignored.
const NOTE_TAGS = ["pinned", "important", "everyday"];
const HOW_WORDS = ["saw", "heard", "guess"];
const TAG_RANK = { pinned: 0, important: 1, everyday: 3 };
const noteRank = (n) => (n && Object.prototype.hasOwnProperty.call(TAG_RANK, n.tag) ? TAG_RANK[n.tag] : 2);
const NOTE_LIMIT = 12;

// ---------- words, for picking notes by what the scene is about ----------
// The same Cyrillic-aware matching as the engine plugin (norm / tokens / stem / sameWord): a plugin
// is one file with no imports, so it is copied. Apostrophe variants and \u0451 fold, stop words drop,
// inflections match by stem, short words match whole.
const WORD_APOS = /['\u2019\u02BC\u2018`\u00B4\u02B9\u2032]/g;
const WORD_STOP = new Set(
  (
    "the and for are but not you all any can had her was his that this with have " +
    "from they them then than there here what when where which while who whom will your into upon over under " +
    "again once only very just also been being because both each more most other some such too own same about " +
    "after before between during through above below off out up down further she him hers its our ours " +
    "their theirs myself yourself himself herself itself ourselves themselves " +
    "\u0456 \u0439 \u0442\u0430 \u0430 \u0430\u043B\u0435 \u0430\u0431\u043E \u0449\u043E \u0446\u0435 \u044F\u043A \u0442\u0430\u043A \u043D\u0435 \u043D\u0456 \u0436 \u0436\u0435 \u0431\u0438 \u0431 \u0431\u043E \u0432 \u0443 \u043D\u0430 \u0434\u043E \u0437 \u0456\u0437 \u0437\u0456 \u0437\u0430 \u0432\u0456\u0434 \u0434\u043B\u044F \u043F\u043E \u043F\u0440\u043E \u043F\u0440\u0438 \u043F\u0456\u0434 \u043D\u0430\u0434 \u043C\u0456\u0436 \u0447\u0435\u0440\u0435\u0437 \u0449\u043E\u0431 " +
    "\u043A\u043E\u043B\u0438 \u0434\u0435 \u0442\u0430\u043C \u0442\u0443\u0442 \u0432\u0436\u0435 \u0449\u0435 \u0442\u0435\u0436 \u0442\u0430\u043A\u043E\u0436 \u043B\u0438\u0448\u0435 \u0442\u0456\u043B\u044C\u043A\u0438 \u0434\u0443\u0436\u0435 \u0439\u043E\u0433\u043E \u0457\u0457 \u0457\u0445 \u0457\u0439 \u0439\u043E\u043C\u0443 \u0432\u0456\u043D \u0432\u043E\u043D\u0430 \u0432\u043E\u043D\u043E \u0432\u043E\u043D\u0438 \u043C\u0438 \u0432\u0438 \u044F \u0442\u0438 \u043C\u0435\u043D\u0435 \u0442\u0435\u0431\u0435 \u0441\u0435\u0431\u0435 " +
    "\u043C\u0456\u0439 \u043C\u043E\u044F \u043C\u043E\u0454 \u043C\u043E\u0457 \u0442\u0432\u0456\u0439 \u0442\u0432\u043E\u044F \u0441\u0432\u0456\u0439 \u0441\u0432\u043E\u044F \u0446\u0435\u0439 \u0446\u044F \u0446\u0456 \u0442\u043E\u0439 \u0442\u0435 \u0431\u0443\u0432 \u0431\u0443\u043B\u0430 \u0431\u0443\u043B\u043E \u0431\u0443\u043B\u0438 \u0454 \u0431\u0443\u0434\u0435 \u0431\u0443\u0442\u0438 \u043C\u043E\u0436\u0435 \u0442\u0440\u0435\u0431\u0430 " +
    "\u0438 \u0432\u043E \u0447\u0442\u043E \u043E\u043D \u043E\u043D\u0430 \u043E\u043D\u043E \u043E\u043D\u0438 \u0441 \u0441\u043E \u043A\u0430\u043A \u0442\u043E \u0432\u0441\u0435 \u0442\u0430\u043A \u0435\u0433\u043E \u0435\u0435 \u043D\u043E \u0434\u0430 \u043A \u0432\u044B \u0431\u044B \u0442\u043E\u043B\u044C\u043A\u043E \u043C\u043D\u0435 \u0432\u043E\u0442 \u043E\u0442 \u043C\u0435\u043D\u044F \u0435\u0449\u0435 \u043D\u0435\u0442 \u043E \u0438\u0437 \u0435\u043C\u0443 \u043A\u043E\u0433\u0434\u0430 \u0434\u0430\u0436\u0435 " +
    "\u043D\u0443 \u043B\u0438 \u0435\u0441\u043B\u0438 \u0443\u0436\u0435 \u0438\u043B\u0438 \u043D\u0438 \u0431\u044B\u0442\u044C \u0431\u044B\u043B \u043D\u0435\u0433\u043E \u0432\u0430\u0441 \u0432\u0435\u0434\u044C \u043F\u043E\u0442\u043E\u043C \u0441\u0435\u0431\u044F \u043D\u0438\u0447\u0435\u0433\u043E \u0435\u0439 \u0442\u0443\u0442 \u0433\u0434\u0435 \u0435\u0441\u0442\u044C \u043D\u0430\u0434\u043E \u043D\u0435\u0439 \u043C\u044B \u0442\u0435\u0431\u044F \u0447\u0435\u043C \u0441\u0430\u043C \u0431\u0435\u0437 " +
    "\u0447\u0435\u0433\u043E \u0440\u0430\u0437 \u0442\u043E\u0436\u0435 \u043F\u043E\u0434 \u043A\u0442\u043E \u044D\u0442\u043E\u0442 \u0442\u043E\u0433\u043E \u043F\u043E\u0442\u043E\u043C\u0443 \u044D\u0442\u043E\u0433\u043E \u043A\u0430\u043A\u043E\u0439 \u0437\u0434\u0435\u0441\u044C \u044D\u0442\u043E\u043C \u043C\u043E\u0439 \u0442\u0435\u043C \u0447\u0442\u043E\u0431\u044B \u0441\u0435\u0439\u0447\u0430\u0441"
  ).split(" "),
);
function normText(s) {
  return String(s).normalize("NFD").replace(/\u0301/g, "").normalize("NFC").toLowerCase().replace(WORD_APOS, "'").replace(/\u0451/g, "\u0435");
}
export function wordTokens(s) {
  return normText(s)
    .split(/[^\p{L}\p{N}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t && !WORD_STOP.has(t));
}
const WORD_SUFFIX = /(\u0430\u043C\u0438|\u044F\u043C\u0438|\u043E\u0432\u0456|\u0435\u0432\u0456|\u043E\u0433\u043E|\u043E\u043C\u0443|\u0438\u043C\u0438|\u0435\u043C\u0443|\u0456\u0439|\u043E\u0457|\u043E\u044E|\u0435\u044E|\u044F\u0445|\u0430\u0445|\u0456\u0432|\u044F\u043C|\u0430\u043C|\u043E\u043C|\u0435\u043C|\u0438\u043C|\u0438\u0445|\u0438\u0439|\u044B\u0439|\u0430\u044F|\u044F\u044F|\u043E\u0435|\u0435\u0435|\u0443\u044E|\u044E\u044E|\u043E\u0432|\u0435\u0432|\u0435\u0439|\u044B|\u0438|\u0456|\u0430|\u044F|\u0443|\u044E|\u043E|\u0435|\u044C|\u0439)$/;
function wordStem(t) {
  if (t.length <= 3) return t;
  const r = t.replace(WORD_SUFFIX, "");
  return r.length >= 3 ? r : t;
}
/** Two words are the same: short ones exactly, longer ones by stem. */
export function sameWord(a, b) {
  if (a.length <= 3 || b.length <= 3) return a === b;
  const x = wordStem(a);
  const y = wordStem(b);
  if (x === y) return true;
  const [sh, lg] = x.length <= y.length ? [x, y] : [y, x];
  return sh.length >= 4 && lg.startsWith(sh) && lg.length - sh.length <= 2;
}
/**
 * `(word) => scene.some((w) => sameWord(word, w))` with the scene indexed once: whole words for the
 * short ones, stems of the long ones, and those stems cut by one and two letters for the prefix rule.
 * Scanning the scene per note word made a long backlog run past the script time limit.
 */
export function sceneMatcher(sceneWords) {
  const exact = new Set(sceneWords);
  const stems = new Set();
  const prefixes = new Set();
  for (const w of exact) {
    if (w.length <= 3) continue;
    const y = wordStem(w);
    stems.add(y);
    for (const cut of [1, 2]) if (y.length - cut >= 4) prefixes.add(y.slice(0, y.length - cut));
  }
  return (word) => {
    if (word.length <= 3) return exact.has(word);
    const x = wordStem(word);
    if (stems.has(x) || prefixes.has(x)) return true;
    for (const cut of [1, 2]) if (x.length - cut >= 4 && stems.has(x.slice(0, x.length - cut))) return true;
    return false;
  };
}

/** Character trigrams of a text, normalized; a text under 3 characters is its own gram. */
function trigrams(text) {
  const t = normText(text).replace(/\s+/g, " ").trim();
  const out = new Set();
  if (t.length < 3) {
    if (t) out.add(t);
    return out;
  }
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}
/** Dice similarity of two texts by character trigrams, 0 to 1. */
export function diceSimilarity(a, b) {
  const x = trigrams(a);
  const y = trigrams(b);
  if (!x.size || !y.size) return 0;
  let hit = 0;
  for (const g of x) if (y.has(g)) hit++;
  return (2 * hit) / (x.size + y.size);
}
const DUP_SIMILARITY = 0.85;
/** A note that says what one of `list` already says. */
const duplicateNote = (text, list) => arr(list).some((n) => n && diceSimilarity(text, n.text) >= DUP_SIMILARITY);

/**
 * A character's notes ranked for a scene: pinned first (newest first), then the rest by how much
 * of the scene they talk about (a word few notes use counts more: 10 * ln(1 + N / df)), an important
 * tag (+5; an everyday one -2) and recency (+3 for the newest, none past the last 20). A note that matches nothing can
 * still make it by tag and recency. Ties go to the newer note.
 */
export function rankNotes(list, sceneText) {
  const all = arr(list).filter(isObj);
  const pinned = all.filter((n) => noteRank(n) === 0).reverse();
  const rest = all.filter((n) => noteRank(n) !== 0);
  const scene = wordTokens(sceneText || "");
  const inScene = sceneMatcher(scene);
  const keys = new Map();
  const df = new Map();
  for (const n of rest) {
    const ks = unique(wordTokens(str(n.text)));
    keys.set(n, ks);
    for (const w of new Set(ks.map(wordStem))) df.set(w, (df.get(w) || 0) + 1);
  }
  const total = Math.max(1, rest.length);
  const scored = rest.map((n, i) => {
    let score = 0;
    if (scene.length) for (const k of keys.get(n)) if (inScene(k)) score += 10 * Math.log(1 + total / (df.get(wordStem(k)) || 1));
    if (n.tag === "important") score += 5;
    else if (n.tag === "everyday") score -= 2;
    score += 3 * Math.max(0, (20 - (rest.length - 1 - i)) / 20);
    return { n, i, score };
  });
  scored.sort((a, b) => b.score - a.score || b.i - a.i);
  return [...pinned, ...scored.map((x) => x.n)];
}
/** At most `limit` notes for a scene; pinned ones always stay, even past the limit. */
export function relevantNotes(list, sceneText, limit) {
  const ranked = rankNotes(list, sceneText);
  const pinned = ranked.filter((n) => noteRank(n) === 0).length;
  return ranked.slice(0, Math.max(pinned, limit));
}

// a user-supplied string must never become one of these object keys
const UNSAFE_KEYS = ["__proto__", "constructor", "prototype"];
const safeKey = (k) => typeof k === "string" && k !== "" && !UNSAFE_KEYS.includes(k);
const ownKey = (obj, k) => safeKey(k) && isObj(obj) && Object.prototype.hasOwnProperty.call(obj, k);
/** A copy of an object keyed by user strings, without the unsafe keys. */
const safeBag = (v) => {
  const out = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (safeKey(k)) out[k] = x;
  return out;
};

const emptyOverlay = () => ({ v: 1, counter: 0, added: {}, edits: {}, threads: { added: [], edits: {}, dismissed: [], queued: [] } });
function normalizeOverlay(raw) {
  if (!isObj(raw)) return emptyOverlay();
  const t = isObj(raw.threads) ? raw.threads : {};
  const counter = num(raw.counter);
  return {
    ...raw,
    v: 1,
    counter: Number.isFinite(counter) ? Math.max(0, Math.trunc(counter)) : 0,
    added: safeBag(raw.added),
    edits: safeBag(raw.edits),
    threads: { ...t, added: arr(t.added), edits: safeBag(t.edits), dismissed: arr(t.dismissed).map(String).slice(-200), queued: arr(t.queued) },
  };
}
const loadOverlay = (fsx, chatId) => normalizeOverlay(readJson(fsx, NOTES_DIR + chatId + ".json", null));
const saveOverlay = (fsx, chatId, ov) => fsx.write(NOTES_DIR + chatId + ".json", JSON.stringify(ov, null, 2));

/**
 * The notebook as it counts: the active sensor notes with the user's edits applied, plus the
 * notes the user added. Retired ones go to `retired` (same shape). Notes are copies.
 */
export function effectiveNotebook(state, keys, ov) {
  const edits = isObj(ov && ov.edits) ? ov.edits : {};
  const live = {};
  const retired = {};
  const place = (name, n) => listIn(isObj(edits[n.id]) && edits[n.id].retired === true ? retired : live, name).push(n);
  for (const [name, notes] of Object.entries(activeNotebook(state, keys))) {
    for (const n0 of notes) {
      const e = isObj(edits[n0.id]) ? edits[n0.id] : null;
      const n = { ...n0 };
      if (e) {
        if (str(e.text) && cut(str(e.text), 300) !== n0.text) {
          n.text = cut(str(e.text), 300);
          n.edited = true;
        }
        if (NOTE_TAGS.includes(e.tag)) n.tag = e.tag;
        else if (e.tag === null) delete n.tag;
      }
      place(name, n);
    }
  }
  for (const [name, list] of Object.entries(isObj(ov && ov.added) ? ov.added : {})) {
    for (const a of arr(list)) {
      if (!isObj(a) || typeof a.id !== "string" || !str(a.text)) continue;
      const how = HOW_WORDS.includes(a.how) ? a.how : "saw";
      place(name, {
        id: a.id,
        text: cut(str(a.text), 300),
        how,
        from: null,
        ...(how === "heard" ? { believes: true } : {}),
        turn: Number.isFinite(num(a.turn)) ? num(a.turn) : null,
        src: "user",
        by: "user",
        ...(NOTE_TAGS.includes(a.tag) ? { tag: a.tag } : {}),
      });
    }
  }
  return { live, retired };
}

/** Threads as they count: the snapshot's threads with the user's edits, plus the ones the user added (by id, once). */
export function effectiveThreads(ov, base, turn) {
  const edits = isObj(ov && ov.threads && ov.threads.edits) ? ov.threads.edits : {};
  const fix = (t) => {
    const e = isObj(edits[t.id]) ? edits[t.id] : null;
    if (e && str(e.text)) t.text = cut(str(e.text), 300);
    if (e && (e.status === "open" || e.status === "resolved")) t.status = e.status;
    if (e && THREAD_KINDS.includes(e.kind)) t.kind = e.kind;
    if (e && e.parent !== undefined) {
      if (typeof e.parent === "string" && e.parent) t.parent = e.parent;
      else delete t.parent;
    }
    if (e && Number.isFinite(num(e.keptAt))) t.keptAt = num(e.keptAt);
    // proposals the owner accepted are the story's own threads, not "yours"
    if (/^ut\d+$/.test(String(t.id)) && !t.proposed) t.by = "user";
    return t;
  };
  const out = arr(base).filter(isObj).map((t) => fix({ ...t }));
  for (const a of arr(ov && ov.threads && ov.threads.added)) {
    if (!isObj(a) || typeof a.id !== "string" || !str(a.text) || out.some((t) => t.id === a.id)) continue;
    out.push(
      fix({
        id: a.id,
        text: cut(str(a.text), 300),
        since: Number.isFinite(num(a.since)) ? num(a.since) : turn || 0,
        status: "open",
        ...(THREAD_KINDS.includes(a.kind) ? { kind: a.kind } : {}),
        ...(typeof a.parent === "string" && a.parent ? { parent: a.parent } : {}),
        ...(a.proposed ? { proposed: true } : {}),
      }),
    );
  }
  // a step lives under a main quest. While that is resolved the step goes with it (and comes back if the quest is
  // reopened); when the parent is gone or is no longer main, the step stands alone
  for (const t of out) {
    if (t.status !== "open" || !t.parent) continue;
    const p = out.find((x) => x.id === t.parent);
    if (p && !p.parent && questKind(p) === "main") {
      if (p.status !== "open") {
        t.status = "resolved";
        t.resolvedAt = Number.isFinite(num(p.resolvedAt)) ? num(p.resolvedAt) : turn || 0;
      }
    } else delete t.parent;
  }
  return out;
}

/**
 * What waits for the owner: the sensor's proposals (state) minus the ones answered (overlay), plus what the owner
 * queued by hand at a full limit. A "close" proposal for a thread that is no longer open is not shown.
 */
export function effectiveProposals(state, ov, threads) {
  const t = isObj(ov && ov.threads) ? ov.threads : {};
  const dismissed = arr(t.dismissed).map(String);
  const open = arr(threads).filter((x) => isObj(x) && x.status === "open");
  const out = [];
  for (const p of arr(state && state.proposals)) {
    if (!isObj(p) || typeof p.id !== "string" || dismissed.includes(p.id)) continue;
    if (p.type === "close") {
      const th = open.find((x) => x.id === p.threadId);
      if (th) out.push({ ...p, text: th.text, kind: questKind(th), ...(th.parent ? { parent: th.parent } : {}) });
    } else if (p.type === "open" && str(p.text)) out.push({ ...p, kind: THREAD_KINDS.includes(p.kind) ? p.kind : "side" });
  }
  for (const q of arr(t.queued)) {
    if (!isObj(q) || typeof q.id !== "string" || !str(q.text)) continue;
    out.push({ id: q.id, type: "open", why: "limit", by: "user", text: cut(str(q.text), 300), kind: THREAD_KINDS.includes(q.kind) ? q.kind : "side", ...(q.parent ? { parent: String(q.parent) } : {}), turn: num(q.turn) || 0 });
  }
  return out;
}

// ---------- quests (#117): a thread is main, side or everyday; a step has a main quest as parent ----------
export const THREAD_KINDS = ["main", "side", "everyday"];
/** "main", "side" or "everyday"; a thread with no kind (everything before quests) is a side quest. */
export const questKind = (t) => (isObj(t) && THREAD_KINDS.includes(t.kind) ? t.kind : "side");
const EVERYDAY_OPEN_MAX = 5;
const PROPOSALS_KEPT = 8;

/** What is open, counted the way the limits count it: main, side (steps and everyday are counted apart). */
function questCounts(threads) {
  const open = arr(threads).filter((t) => isObj(t) && t.status === "open");
  const steps = {};
  let main = 0;
  let side = 0;
  let everyday = 0;
  for (const t of open) {
    if (t.parent) steps[t.parent] = (steps[t.parent] || 0) + 1;
    else if (questKind(t) === "main") main += 1;
    else if (questKind(t) === "everyday") everyday += 1;
    else side += 1;
  }
  return { main, side, everyday, steps };
}

/** Is there room for a new open quest of this kind (a step: under this parent)? */
function questRoom(cfg, counts, kind, parent) {
  if (parent) return (counts.steps[parent] || 0) < maxStepsOf(cfg);
  if (kind === "main") return counts.main < maxMainOf(cfg);
  if (kind === "everyday") return true;
  return counts.side < maxThreadsOf(cfg);
}

/** The line the sensor reads: which limits stand and how full they are. */
function limitsLine(cfg, threads) {
  const c = questCounts(threads);
  return "Open thread limits: main " + c.main + "/" + maxMainOf(cfg) + ", side " + c.side + "/" + maxThreadsOf(cfg) + ", steps per main thread " + maxStepsOf(cfg) + " (everyday threads are not counted).";
}

/** One thread as the sensor reads it. */
function threadLabel(t) {
  const kind = t.parent ? "step of " + t.parent : questKind(t);
  return t.id + " [" + kind + "] \"" + t.text + "\"";
}

/** The newest active key that has a snapshot, searching keys[0..before). */
function nearestSnapshot(state, keys, before) {
  for (let i = before - 1; i >= 0; i--) if (state.snapshots[keys[i]]) return i;
  return -1;
}

// how far back the messages a snapshot read may start when the snapshot before it is gone
const READ_BACK = 12;

/** The messages (j, i] of the line that carry text: the texts a snapshot's sig is taken over. */
function lineRange(line, j, i) {
  const out = [];
  for (let k = j + 1; k <= i; k++) if (str(line[k].msg.text)) out.push(line[k].msg);
  return out;
}

/**
 * Does this snapshot's sig still describe the messages it read? Its range is the messages
 * after the snapshot before it, so the base is that snapshot — or, for the oldest one still
 * standing, nothing: the 40-snapshot cap may have dropped its base, and its sig may then
 * cover a shorter range, so a few shorter ranges are tried too, and the line start last.
 */
function sigStands(line, i, good, sig) {
  const starts = good >= 0 ? [good] : [];
  if (good < 0) {
    for (let j = i - 1; j >= Math.max(-1, i - READ_BACK); j--) starts.push(j);
    if (starts[starts.length - 1] > -1) starts.push(-1);
  }
  for (const j of starts) if (textSig(lineRange(line, j, i)) === sig) return true;
  return false;
}

/**
 * Does this snapshot still describe the line? A snapshot records the key it was computed from
 * (`base`, null = the line start): that must be the standing snapshot just before it, or, when
 * the 40-snapshot cap dropped that one, a key still on the line with no snapshot of its own; and
 * its sig must match the messages between them. A snapshot from before `base` was recorded falls
 * back to the sig check alone (sigStands). Snapshots off the line (another swipe, an abandoned
 * branch) are not judged: they are kept, so swiping back costs no call, and they are judged by
 * the same rule if they come back on the line.
 */
function snapStands(state, line, index, i, good, snap) {
  if (!("base" in snap)) return sigStands(line, i, good, snap.sig);
  const b = snap.base === null ? -1 : index.has(snap.base) ? index.get(snap.base) : -2;
  if (b === -2 || b >= i) return false;
  if (b !== good && !(b > good && !state.snapshots[line[b].key])) return false;
  return textSig(lineRange(line, b, i)) === snap.sig;
}

/**
 * Where the active line has to be read again: the first snapshot on it that no longer stands (an
 * earlier edit, a Continue, a deleted message, another swipe of an earlier message) and every one
 * after it were computed from text that is gone. Returns the index of the last snapshot that still
 * stands (the base to read from) and whether anything has to be dropped at all.
 */
function standingFrom(state, line) {
  const index = new Map(line.map((l, i) => [l.key, i]));
  let good = -1;
  for (let i = 0; i < line.length; i++) {
    const snap = state.snapshots[line[i].key];
    if (!snap) continue;
    // a snapshot made before sigs existed is never re-sensed
    if (typeof snap.sig !== "string" || snapStands(state, line, index, i, good, snap)) good = i;
    else return { good, cut: true, at: i };
  }
  return { good, cut: false };
}

/** The snapshots to drop: every one on the line after the base. */
function dropAfter(state, line, good) {
  const out = [];
  line.forEach((l, i) => {
    if (i > good && state.snapshots[l.key]) out.push(l.key);
  });
  return out;
}

// ---------- config ----------
const DEFAULT_CONFIG = {
  sensorModel: "",
  // max_tokens of the sensor call and of the soul rating call
  sensorMaxTokens: 3000,
  // open threads at most (the user's own count too); and: every N turns the sensor is asked about old threads (0 = never)
  maxThreads: 3,
  threadCheckEvery: 5,
  // quests (#117): open main quests, open steps under one main quest, turns an everyday quest lives (0 = never closed),
  // and thread checks without change before the owner is asked to close one (0 = never asked)
  maxMain: 1,
  maxSteps: 4,
  everydayTurns: 8,
  retireAfter: 3,
  // notes older than this many turns leave the insert (pinned ones stay); Litopys keeps the important ones as facts
  noteAgeTurns: 30,
  // only the parts of the sensor prompt the user changed: { key: text }
  sensorParts: {},
  mode: "sensor",
  families: { trust: true, warmth: true, power: true, body: true, conflict: true, care: true, knowledge: true },
  injection: { enabled: true, maxTokens: 300 },
  // what characters said (#98): how many strong statements a turn may add, and whether they go into the reply prompt
  said: { perTurn: 1, inject: true },
  catchUp: true,
  // rate a card's main characters by itself when it has no soul yet
  autoSoul: true,
  debug: false,
};

const maxTokensOf = (cfg) => {
  const n = num(cfg && cfg.sensorMaxTokens);
  return Number.isFinite(n) ? clamp(Math.round(n), 1000, 8000) : DEFAULT_CONFIG.sensorMaxTokens;
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
  // a changed part is kept; a part equal to its default, empty, or unknown is not
  const parts = {};
  if (isObj(cfg.sensorParts)) {
    for (const part of SENSOR_PARTS) {
      const v = cfg.sensorParts[part.key];
      if (typeof v === "string" && v.trim() && promptKey(v) !== promptKey(DEFAULT_SENSOR_PARTS[part.key])) parts[part.key] = v;
    }
  }
  if (Object.keys(parts).length) cfg.sensorParts = parts;
  else delete cfg.sensorParts;
  return cfg;
}

const mergeConfig = (stored) => ({
  ...DEFAULT_CONFIG,
  ...DEFAULT_PROMPTS,
  ...stored,
  sensorParts: isObj(stored.sensorParts) ? stored.sensorParts : {},
  families: { ...DEFAULT_CONFIG.families, ...(isObj(stored.families) ? stored.families : {}) },
  injection: { ...DEFAULT_CONFIG.injection, ...(isObj(stored.injection) ? stored.injection : {}) },
  said: { ...DEFAULT_CONFIG.said, ...(isObj(stored.said) ? stored.said : {}) },
});
export const saidPerTurnOf = (cfg) => clamp(Math.round(num(cfg && cfg.said && cfg.said.perTurn)) || DEFAULT_CONFIG.said.perTurn, 1, 4);
const loadConfig = (fsx) => mergeConfig(storedConfig(fsx));
const customPrompts = (fsx) => {
  const stored = storedConfig(fsx);
  return PROMPT_KEYS.filter((key) => key in stored || (key === "sensor" && isObj(stored.sensorParts)));
};
const wholeSensorCustom = (cfg) => !!cfg && typeof cfg.sensor === "string" && !isDefaultPrompt("sensor", cfg.sensor);
export const promptOf = (key, cfg) => {
  if (key === "sensor" && !wholeSensorCustom(cfg)) return sensorFromParts(cfg && cfg.sensorParts);
  return cfg && typeof cfg[key] === "string" && !isDefaultPrompt(key, cfg[key]) ? cfg[key] : DEFAULT_PROMPTS[key];
};

const noteAgeOf = (cfg) => {
  const n = num(cfg && cfg.noteAgeTurns);
  return Number.isFinite(n) ? clamp(Math.round(n), 5, 500) : DEFAULT_CONFIG.noteAgeTurns;
};
const maxThreadsOf = (cfg) => {
  const n = num(cfg && cfg.maxThreads);
  return Number.isFinite(n) ? clamp(Math.round(n), 1, 6) : DEFAULT_CONFIG.maxThreads;
};
const threadCheckOf = (cfg) => {
  const n = num(cfg && cfg.threadCheckEvery);
  return Number.isFinite(n) ? clamp(Math.round(n), 0, 50) : DEFAULT_CONFIG.threadCheckEvery;
};
const cfgInt = (cfg, key, lo, hi) => {
  const n = num(cfg && cfg[key]);
  return Number.isFinite(n) ? clamp(Math.round(n), lo, hi) : DEFAULT_CONFIG[key];
};
const maxMainOf = (cfg) => cfgInt(cfg, "maxMain", 1, 2);
const maxStepsOf = (cfg) => cfgInt(cfg, "maxSteps", 1, 6);
const everydayTurnsOf = (cfg) => cfgInt(cfg, "everydayTurns", 0, 30);
const retireAfterOf = (cfg) => cfgInt(cfg, "retireAfter", 0, 10);

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
  if (Number.isFinite(num(b.sensorMaxTokens))) put("sensorMaxTokens", maxTokensOf(b), DEFAULT_CONFIG.sensorMaxTokens);
  if (Number.isFinite(num(b.maxThreads))) put("maxThreads", maxThreadsOf(b), DEFAULT_CONFIG.maxThreads);
  if (Number.isFinite(num(b.noteAgeTurns))) put("noteAgeTurns", noteAgeOf(b), DEFAULT_CONFIG.noteAgeTurns);
  if (Number.isFinite(num(b.threadCheckEvery))) put("threadCheckEvery", threadCheckOf(b), DEFAULT_CONFIG.threadCheckEvery);
  if (Number.isFinite(num(b.maxMain))) put("maxMain", maxMainOf(b), DEFAULT_CONFIG.maxMain);
  if (Number.isFinite(num(b.maxSteps))) put("maxSteps", maxStepsOf(b), DEFAULT_CONFIG.maxSteps);
  if (Number.isFinite(num(b.everydayTurns))) put("everydayTurns", everydayTurnsOf(b), DEFAULT_CONFIG.everydayTurns);
  if (Number.isFinite(num(b.retireAfter))) put("retireAfter", retireAfterOf(b), DEFAULT_CONFIG.retireAfter);
  if (isObj(b.sensorParts)) {
    const sp = { ...(isObj(next.sensorParts) ? next.sensorParts : {}) };
    for (const part of SENSOR_PARTS) {
      const v = b.sensorParts[part.key];
      if (typeof v !== "string") continue;
      if (!v.trim() || promptKey(v) === promptKey(DEFAULT_SENSOR_PARTS[part.key])) delete sp[part.key];
      else sp[part.key] = v.slice(0, 4000);
    }
    put("sensorParts", sp, {});
  }
  if (b.mode === "sensor" || b.mode === "fast" || b.mode === "manual") put("mode", b.mode, DEFAULT_CONFIG.mode);
  if (parseBool(b.catchUp) !== undefined) put("catchUp", parseBool(b.catchUp), DEFAULT_CONFIG.catchUp);
  if (parseBool(b.autoSoul) !== undefined) put("autoSoul", parseBool(b.autoSoul), DEFAULT_CONFIG.autoSoul);
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
  if (isObj(b.said)) {
    const sd = { ...(isObj(next.said) ? next.said : {}) };
    if (Number.isFinite(num(b.said.perTurn))) sd.perTurn = clamp(Math.round(num(b.said.perTurn)), 1, 4);
    if (parseBool(b.said.inject) !== undefined) sd.inject = parseBool(b.said.inject);
    for (const k of Object.keys(sd)) if (sd[k] === DEFAULT_CONFIG.said[k]) delete sd[k];
    put("said", sd, {});
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
  if (!B) return "Previous state\n(none: this is the start)\n" + limitsLine(ctx.cfg, []);
  const who = { user: ctx.userName, their: "their", self: "themself" };
  const lines = [clockLine(B.clock || {})];
  const scene = [B.clock && B.clock.place, B.clock && B.clock.weather].filter(Boolean).join("; ");
  if (scene) lines.push(scene + ".");
  if (B.scene && B.scene.direction) lines.push("Scene direction: " + B.scene.direction + (B.scene.before ? " (before it: " + B.scene.before + ")" : "") + ".");
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
  const open = arr(ctx.threads).filter((t) => t.status === "open");
  if (open.length) lines.push("Open threads: " + open.map(threadLabel).join(", "));
  lines.push(limitsLine(ctx.cfg, ctx.threads));
  return "Previous state\n" + lines.join("\n");
}

function noteLine(n) {
  return n.id + " " + n.how + (n.how === "heard" && n.from ? " from " + n.from : "") + ": " + n.text + (n.by === "user" ? " (written by the user)" : "");
}

function notebookTexts(ctx) {
  // the notes the dropped snapshots wrote are gone: the sensor must not read them as live
  const gone = arr(ctx.drop);
  const live = effectiveNotebook(ctx.state, ctx.line.map((l) => l.key).filter((k) => !gone.includes(k)), ctx.overlay).live;
  const B = ctx.base && ctx.base.snap;
  const out = [];
  const news = arr(ctx.newMsgs).map((m) => str(m && m.text)).join("\n");
  for (const name of B ? arr(B.present) : ctx.characters) {
    const list = live[name] || [];
    // the 8 newest, and of the older ones the 12 that matter most to the new messages
    const newest = list.slice(-8);
    const older = rankNotes(list.slice(0, Math.max(0, list.length - 8)), news).slice(0, 12);
    const keep = new Set([...newest, ...older].map((n) => n.id));
    const notes = list.filter((n) => keep.has(n.id));
    if (notes.length) out.push("Notebook of " + name + "\n" + notes.map(noteLine).join("\n"));
  }
  return out;
}

const cutMiddle = (s, max) => (s.length <= max ? s : s.slice(0, Math.floor((max - 3) / 2)) + " … " + s.slice(s.length - Math.floor((max - 3) / 2)));

/** The "New messages" lines, and whether the 8000-character cut dropped earlier ones. */
function newMessagesBody(msgs) {
  const body = msgs.map((m) => "[" + (m.role === "user" ? "user" : str(m.name) || m.role || "narrator") + "] " + cutMiddle(String(m.text).trim(), 1500)).join("\n");
  return { body, trimmed: body.length > 8000 };
}

function newMessagesText(msgs) {
  return "New messages\n" + newMessagesBody(msgs).body.slice(-8000);
}

/** Every N turns (only then): ask about open threads that have been open that long. */
/** The threads a Thread check asks about this turn (every N turns, those open that long), with their age. */
function threadsInCheck(ctx) {
  const every = threadCheckOf(ctx.cfg);
  if (!every) return [];
  const B = ctx.base && ctx.base.snap;
  const next = (B ? B.turn || 0 : 0) + 1;
  const age = (t) => next - (Number.isFinite(num(t.since)) ? num(t.since) : next);
  const old = arr(ctx.threads).filter((t) => t.status === "open" && age(t) >= every);
  if (!old.length || next % every !== 0) return [];
  return old.map((t) => ({ t, age: age(t) }));
}

function threadCheckText(ctx) {
  const old = threadsInCheck(ctx);
  if (!old.length) return null;
  return (
    "Thread check\nOpen for " + threadCheckOf(ctx.cfg) + " turns or more: " + old.map(({ t, age }) => t.id + " \"" + t.text + "\" (" + age + " turns)").join("; ") + ".\n" +
    "Has the story settled this, dropped it, or is it still open? Resolve settled or dropped ones."
  );
}

/** The "Characters" block: the user, and every character with what the card says they are. */
function castText(ctx) {
  const listed = withSoulNames(ctx.souls, [...ctx.characters, ...(ctx.base ? Object.keys(ctx.base.snap.chars || {}) : [])]);
  // a card without a soul may be a narrator card; the sensor decides from the text
  const label = (n) => {
    const soul = soulOf(ctx.souls, n);
    return soul ? classOf(soul) : ctx.characters.includes(n) ? "the card: a character, or a narrator who is no person in the scene" : "neutral";
  };
  // pronouns when the soul has them, so notes and moods use the right gender
  const pronounWord = (n) => {
    const soul = soulOf(ctx.souls, n);
    return soul && PRONOUN_KEYS.includes(soul.pronouns) ? ", " + soul.pronouns : "";
  };
  const classes = listed.map((n) => n + " (" + label(n) + pronounWord(n) + ")").join(", ");
  return "Characters\nuser: " + ctx.userName + ". " + classes + ".";
}

function sensorUser(ctx) {
  return [
    castText(ctx),
    previousStateText(ctx),
    ...notebookTexts(ctx),
    ...[threadCheckText(ctx)].filter(Boolean),
    ...[backdropText(ctx)].filter(Boolean),
    newMessagesText(ctx.newMsgs),
  ].join("\n\n");
}

// ---------- the chat's background by scene (World DM backgrounds, user 2026-10-19) ----------
// Off unless the chat's meta.autoBackground is on: then the sensor, in the call it makes anyway, picks the image
// of the chat's background folder (library.json) that fits where the scene is now, by place or mood. The app
// sets the chat's background from the snapshot's `background`; no pick, or one not in the folder, changes nothing.
const BACKDROPS_MAX = 40;
export function backdropChoices(fsx, meta) {
  const a = isObj(meta) && isObj(meta.autoBackground) ? meta.autoBackground : null;
  if (!a || a.on !== true || !str(a.folderId)) return [];
  const lib = readJson(fsx, "library.json", {});
  const seen = new Set();
  const out = [];
  for (const b of arr(isObj(lib) ? lib.backgrounds : null)) {
    if (!isObj(b) || b.folderId !== a.folderId || !str(b.name) || seen.has(str(b.name).toLowerCase())) continue;
    seen.add(str(b.name).toLowerCase());
    out.push({ name: str(b.name).slice(0, 60), tags: arr(b.tags).map(str).filter(Boolean).slice(0, 6) });
    if (out.length >= BACKDROPS_MAX) break;
  }
  return out;
}

function backdropText(ctx) {
  if (!arr(ctx.backdrops).length) return "";
  const now = ctx.base && ctx.base.snap && str(ctx.base.snap.background);
  return [
    "Backgrounds: also add \"background\" to your JSON: the name of the image below that fits where the scene is at the end of the new messages, by place first, then by time, weather and mood; null when none fits." + (now ? " Now shown: " + now + "; keep it unless the place or the mood clearly changed." : ""),
    ...ctx.backdrops.map((b) => "- " + b.name + (b.tags.length ? ": " + b.tags.join(", ") : "")),
  ].join("\n");
}

/** The sensor's pick, only when it names an image of the folder. */
export function readBackdrop(v, choices) {
  const name = str(v).toLowerCase();
  const hit = name ? arr(choices).find((b) => b.name.toLowerCase() === name) : null;
  return hit ? hit.name : null;
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
  // a model that writes its thinking inline (no reasoning tags in the preset) puts it first; braces in it are not the answer
  let s = String(text || "").replace(/^\s*<(think|thinking|reasoning)>[\s\S]*?<\/\1>/i, "").trim();
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
/** The sensor's word for remote contact, or null for in person (or a word it does not know). */
export function contactOf(v) {
  const t = str(v).toLowerCase();
  if (/video/.test(t)) return "video";
  if (/text|messag|sms|chat|dm\b/.test(t)) return "text";
  if (/call|phone/.test(t)) return "call";
  if (/letter|mail|note/.test(t)) return "letter";
  return null;
}
const CONTACT_WORDS = { text: "by text messages", call: "on a call", video: "on a video call", letter: "by letters" };
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

/** "user" for any of the user's names (one, or every one the chat had), else the character's known name. */
const userAll = (ctx) => (arr(ctx.userNames).length ? ctx.userNames : [ctx.userName]);

function sideOf(v, userName, known) {
  const s = str(v);
  if (!s) return null;
  const mine = (Array.isArray(userName) ? userName : [userName]).map((n) => String(n).toLowerCase());
  if (isUser(s) || mine.includes(s.toLowerCase())) return "user";
  return canonName(s, known);
}

function readEvents(list, ctx, known, unknownIds) {
  const events = [];
  for (const e of arr(list)) {
    if (!isObj(e)) continue;
    // small models sometimes copy the family in front: "trust.shared_secret"
    const raw = str(e.id);
    const id = ctx.vocab[raw] ? raw : raw.slice(raw.lastIndexOf(".") + 1).trim();
    const entry = ctx.vocab[id];
    // a family switched off for this chat counts as "other"
    const def = entry && ctx.cfg.families[entry.family] !== false ? entry : null;
    if (!entry && raw) unknownIds.push(raw);
    const use = def || ctx.vocab.other;
    events.push({
      id: use.id,
      family: use.family,
      weight: WEIGHTS[e.weight] ? e.weight : "routine",
      from: sideOf(e.from, userAll(ctx), known),
      to: sideOf(e.to, userAll(ctx), known),
      quote: cut(str(e.quote), 200),
      math: [],
    });
  }
  return events;
}

/** Is the name (or an alias of its soul, in any script) in the text, allowing for endings? */
function mentionsName(ctx, text, name) {
  const soul = soulOf(ctx.souls, name);
  const names = [name, ...arr(soul && soul.aliases).filter((a) => typeof a === "string")];
  const words = String(text).toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean).map(nameKey);
  return names.some((n) => {
    if (mentions(text, n)) return true;
    const k = nameKey(n);
    const stem = k.length > 5 ? k.slice(0, -2) : k.length > 3 ? k.slice(0, -1) : k;
    return stem.length >= 3 && words.some((w) => w.startsWith(stem));
  });
}

function scenePresent(ctx, out, known) {
  const B = ctx.base && ctx.base.snap;
  const said = unique(arr(out.present).map((n) => sideOf(n, userAll(ctx), known)).filter((n) => n && n !== "user"));
  const struck = arr(out.struck).map((n) => sideOf(n, userAll(ctx), known));
  // an explicit [] means the user is alone (a narrator card is no person in
  // the scene); only a report without the key falls back
  const start = Array.isArray(out.present) ? said : B ? arr(B.present) : ctx.characters;
  const list = start.filter((n) => !struck.includes(n) && sideOf(n, userAll(ctx), []) !== "user");
  // a cheap sensor may leave out someone who acts or speaks: whoever was present and is named
  // (or speaks) in the new messages stays, unless the sensor said they left; nobody new comes in this way
  if (B && Array.isArray(out.present)) {
    const text = ctx.newMsgs.map((m) => String(m.text) + (m.role === "user" ? "" : " " + str(m.name))).join("\n");
    for (const n of arr(B.present)) if (!list.includes(n) && !struck.includes(n) && sideOf(n, userAll(ctx), []) !== "user" && mentionsName(ctx, text, n)) list.push(n);
  }
  return unique(list);
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
  const soul = soulOf(ctx.souls, name);
  const cls = classOf(soul);
  const old0 = B && B.chars ? B.chars[name] : null;
  // start values saved after the character entered shift the stats by the difference
  const re = old0 ? reseed(ctx, name, old0, soul) : null;
  const old = re ? re.entry : old0;
  const prev = old ? { stats: old.stats, pulse: old.pulse, hostility: old.hostility ?? null } : startChar(soul, cls);
  const turn = applyTurn({ name, prev, soul, cls, events, vocab: ctx.vocab });
  const entry = { cls, stats: turn.stats, pulse: turn.pulse, hostility: turn.hostility, seed: old ? old.seed : startChar(soul, cls).stats };
  for (const f of TEXT_FIELDS) entry[f] = (isObj(sensorChar) && str(sensorChar[f]) ? cut(str(sensorChar[f]), 300) : old ? old[f] : null) ?? null;
  // what the sensor saw THIS turn; carried values are stale for the prompt insert
  entry.fresh = TEXT_FIELDS.filter((f) => isObj(sensorChar) && str(sensorChar[f]));
  // how they reach the user's character from elsewhere (#16); carried like the place, but only
  // while they stay in the scene: someone who comes back is in person unless the sensor says not
  // a new scene starts in person unless the sensor says otherwise: a stale "text" would tell the
  // model a character is away while they stand in the room
  const stayed = !!(B && arr(B.present).includes(name)) && !(isObj(ctx.outScene) && ctx.outScene.new === true);
  entry.contact = isObj(sensorChar) && str(sensorChar.contact) ? contactOf(sensorChar.contact) : stayed && old ? old.contact ?? null : null;
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
  return { entry, old, prev, seedLine: re ? re.line : null };
}

const startStats = (soul, cls) => startChar(soul, cls).stats;
const sameStats = (a, b) => DISPOSITION.every((k) => (a[k] || 0) === (b[k] || 0));

/**
 * The start values a legacy entry (no `seed`) was seeded with. Its character's earliest
 * snapshot tells: all stats near 0 while the soul has a real start means the start never
 * applied (seed 0); otherwise it is assumed applied (seed = the soul's start).
 */
function legacySeed(state, name, start) {
  let first = null;
  for (const snap of Object.values(state.snapshots)) {
    const c = isObj(snap) && isObj(snap.chars) ? snap.chars[name] : null;
    if (isObj(c) && isObj(c.stats) && (!first || (snap.turn || 0) < (first.turn || 0))) first = { turn: snap.turn, stats: c.stats };
  }
  const nearZero = !!first && DISPOSITION.every((k) => Math.abs(num(first.stats[k]) || 0) <= 3);
  const real = DISPOSITION.some((k) => Math.abs(start[k]) > 3);
  if (nearZero && real) return Object.fromEntries(DISPOSITION.map((k) => [k, 0]));
  return { ...start };
}

/**
 * Follow a soul whose start values changed after the entry was made: stats move by
 * newStart - seed, the seed is updated. Returns { entry, line } (line = a history line or null).
 */
function reseed(ctx, name, c, soul) {
  const cls = CLASSES.includes(c.cls) ? c.cls : classOf(soul);
  const start = startStats(soul, cls);
  const seed = isObj(c.seed) ? Object.fromEntries(DISPOSITION.map((k) => [k, num(c.seed[k]) || 0])) : legacySeed(ctx.state, name, start);
  if (sameStats(seed, start)) return { entry: isObj(c.seed) ? c : { ...c, seed: start }, line: null };
  const stats = { ...c.stats };
  for (const k of DISPOSITION) stats[k] = clamp((num(stats[k]) || 0) + (start[k] - seed[k]), -100, 100);
  const entry = { ...c, stats, seed: start, constellation: constellationOf(stats, cls).id };
  if (entry.constellation !== c.constellation) entry.prevConstellation = c.constellation ?? null;
  return { entry, line: { turn: ((ctx.base && ctx.base.snap && ctx.base.snap.turn) || 0) + 1, kind: "seed", from: seed, to: start, src: ctx.K } };
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

const sameText = (t) => str(t).toLowerCase().replace(/\s+/g, " ");

const NOTE_WEIGHTS = ["everyday", "important", "key"];
/** A note's weight as the sensor gave it; anything else is everyday. */
const weightOf = (v) => (NOTE_WEIGHTS.includes(str(v).toLowerCase()) ? str(v).toLowerCase() : "everyday");

export const DIRECTIONS = ["domestic", "social", "intrigue", "investigation", "travel", "combat", "explicit", "transition"];

/**
 * The sensor's scene field: { new, label, direction?, before? }. Missing or malformed is { new: false }.
 * direction: the sensor's word, else the previous scene's (it holds until the sensor names a change);
 * before: the direction an explicit scene interrupted, so leaving it can go back (the World DM reads it).
 */
export function readScene(v, prev) {
  const out = !isObj(v) || typeof v.new !== "boolean" ? { new: false } : { new: v.new, label: cut(str(v.label), 60) };
  const p = isObj(prev) ? prev : {};
  const said = isObj(v) && DIRECTIONS.includes(str(v.direction).toLowerCase()) ? str(v.direction).toLowerCase() : "";
  const direction = said || (DIRECTIONS.includes(p.direction) ? p.direction : "");
  if (!direction) return out;
  out.direction = direction;
  if (direction === "explicit") {
    const before = p.direction === "explicit" ? p.before : p.direction;
    if (DIRECTIONS.includes(before) && before !== "explicit") out.before = before;
  }
  return out;
}

function applyNotebook(ctx, out, present, turn, K) {
  const { state } = ctx;
  const keys = ctx.line.map((l) => l.key);
  // sensor notes (to retire) and the notes as they read now, the user's included (to tell on)
  const raw = activeNotebook(state, keys);
  const live = effectiveNotebook(state, keys, ctx.overlay).live;
  const retire = arr(out.retire).map(str);
  // the user's own notes (u...) are never retired by the sensor
  const retiring = (n) => retire.includes(n.id) && !String(n.id).startsWith("u");
  // what a holder's notebook already says (notes the sensor retires in this same report do not count,
  // so a rewrite lands), and what this report has put in so far
  const fresh = {};
  const says = (who, text) => duplicateNote(text, arr(live[who]).filter((n) => !retiring(n))) || duplicateNote(text, fresh[who]);
  const add = (who, note) => {
    state.counters.note += 1;
    listIn(state.notebook, who).push({ id: "n" + state.counters.note, ...note, turn, src: K });
    listIn(fresh, who).push(note);
  };
  // the same text for three or more characters is a summary, not a fact
  const holders = {};
  for (const l of arr(out.learned)) {
    if (!isObj(l) || sideOf(l.who, userAll(ctx), present) === "user") continue;
    const who = canonName(l.who, present);
    if (present.includes(who)) listIn(holders, sameText(l.text)).push(who);
  }
  const generic = Object.keys(holders).filter((t) => unique(holders[t]).length >= 3);
  // facts the sensor wrote that cannot be kept, counted so the dashboard can say so (#97): the holder is
  // the user's own character (a notebook holds what the others know about them), or is not in the scene
  const keptOut = { user: 0, absent: 0 };
  ctx.keptOut = keptOut;
  let used = 0;
  for (const l of arr(out.learned)) {
    if (used >= 4) break;
    if (!isObj(l)) continue;
    if (sideOf(l.who, userAll(ctx), present) === "user") {
      if (str(l.text)) keptOut.user++;
      continue;
    }
    const who = canonName(l.who, present);
    const text = cut(str(l.text), 300);
    if (!text) continue;
    if (!present.includes(who)) {
      keptOut.absent++;
      continue;
    }
    if (generic.includes(sameText(l.text))) continue;
    const how = ["saw", "heard", "guess"].includes(l.how) ? l.how : "guess";
    // "heard" with no teller: the user told them
    const teller = str(l.from) && str(l.from).toLowerCase() !== "null" ? sideOf(l.from, userAll(ctx), present) : "user";
    const from = how === "heard" ? teller : null;
    // near the same words as a note already there: nothing new to keep
    if (says(who, text)) continue;
    const weight = weightOf(l.weight);
    add(who, how === "heard" ? { text, how, from, believes: true, weight } : { text, how, from: null, weight });
    used++;
  }
  for (const t of arr(out.told)) {
    if (!isObj(t)) continue;
    const from = canonName(t.from, present);
    const to = canonName(t.to, present);
    const note = arr(live[from]).find((n) => n.id === str(t.note));
    if (note && present.includes(to) && to !== from && !says(to, note.text)) add(to, { text: note.text, how: "heard", from, believes: true, weight: weightOf(note.weight) });
  }
  for (const notes of Object.values(raw)) for (const n of notes) if (retiring(n)) n.retiredBy = K;
}

const SAID_COOLDOWN = 3;
const SAID_CAP = 8;
/** What a present character said and is held to (#98): the strongest few of a turn; the user's own words are never kept. */
function applySaid(ctx, out, present, turn, K) {
  const { state } = ctx;
  const live = activeBySrc(state.said, ctx.line.map((l) => l.key));
  const limit = saidPerTurnOf(ctx.cfg);
  const fresh = {};
  const kept = ctx.keptOut || { user: 0, absent: 0 };
  const notes = activeBySrc(state.notebook, ctx.line.map((l) => l.key));
  let used = 0;
  // the strongest first, so the turn's room goes to what matters
  const reported = arr(out.said)
    .filter(isObj)
    .map((s, i) => ({ s, i, strength: Number(s.strength) }))
    .sort((a, b) => (Number.isFinite(b.strength) ? b.strength : 2) - (Number.isFinite(a.strength) ? a.strength : 2) || a.i - b.i)
    .map((x) => x.s);
  for (const s of reported) {
    if (used >= limit) break;
    // a weak one (strength 1) is not kept; one without a strength counts as 2 (an older reply)
    if (Number.isFinite(Number(s.strength)) && Number(s.strength) < 2) continue;
    const text = cut(str(s.text), 300);
    if (!text) continue;
    if (sideOf(s.who, userAll(ctx), present) === "user") {
      kept.user++;
      continue;
    }
    const who = canonName(s.who, present);
    if (!present.includes(who)) {
      kept.absent++;
      continue;
    }
    if (duplicateNote(text, live[who]) || duplicateNote(text, fresh[who]) || duplicateNote(text, notes[who])) continue;
    const said = str(s.kind).toLowerCase();
    const lie = s.lie === true || said === "lie";
    const kind = lie ? "lie" : SAID_KINDS.includes(said) ? said : "other";
    // a cooldown and a cap per character: the same kind from the same speaker within three turns is the same moment,
    // and a character holds about eight live entries (a strength-3 one may go to twelve)
    const mine = arr(live[who]);
    if (mine.some((e) => e.kind === kind && turn - (Number(e.turn) || 0) <= SAID_COOLDOWN && Number(s.strength) < 3)) continue;
    if (mine.length >= (Number(s.strength) >= 3 ? SAID_CAP + 4 : SAID_CAP)) continue;
    state.counters.said += 1;
    // a lie is stored hidden: the user sees it only after asking to reveal, the character still holds to it
    listIn(state.said, who).push({ id: "s" + state.counters.said, text, kind, ...(lie ? { hidden: true } : {}), turn, src: K, source: "chat" });
    listIn(fresh, who).push({ text });
    used++;
  }
}

function applyNames(ctx, out, present, turn, K) {
  const live = activeNames(ctx.state, ctx.line.map((l) => l.key));
  for (const n of arr(out.names)) {
    if (!isObj(n)) continue;
    if (sideOf(n.who, userAll(ctx), present) === "user") continue;
    const who = canonName(n.who, present);
    if (!present.includes(who)) continue;
    const before = arr(live[who]).slice(-1)[0];
    const knows = n.heardUserName === true || !!(before && before.knowsUserName);
    // a report without a form of address keeps the last one
    const calls = cut(str(n.calls), 100) || (before ? str(before.calls) : "");
    listIn(ctx.state.names, who).push({ knowsUserName: knows, calls, turn, src: K });
    if (calls && calls !== (before ? str(before.calls) : "")) listIn(ctx.state.history, who).push({ turn, kind: "calls", from: before ? str(before.calls) : "", to: calls, src: K });
  }
}

function applyThreads(ctx, out, turn) {
  const { state } = ctx;
  const B = ctx.base && ctx.base.snap;
  // A resolved thread stays in the snapshot, closed, with the turn it closed on. Dropped, a thread
  // the user added came back open from the overlay on the next turn (#47), and the history of what
  // the story settled was gone. Only open threads go to the sensor and into prompts.
  const all = arr(ctx.threads).filter(isObj).map((t) => ({ ...t }));
  const threads = all.filter((t) => t.status === "open");
  const closed = all.filter((t) => t.status !== "open").map((t) => ({ ...t, status: "resolved", resolvedAt: Number.isFinite(num(t.resolvedAt)) ? num(t.resolvedAt) : turn }));
  const spec = isObj(out.threads) ? out.threads : {};
  const settled = []; // what the sensor closed in this report (#81)
  const wasText = new Map(threads.map((t) => [t.id, t.text]));
  for (const id of arr(spec.resolved).map(str)) {
    const t = threads.find((x) => x.id === id);
    if (t) { t.status = "resolved"; t.resolvedAt = turn; settled.push({ id: t.id, text: sameText(t.text) }); }
  }
  // proposals still waiting (the owner's answers live in the overlay, the sensor only adds)
  // answered ones stay a while (their text keeps the sensor from proposing the same thing again every turn)
  const dismissed = arr(ctx.overlay && ctx.overlay.threads && ctx.overlay.threads.dismissed).map(String);
  let proposals = arr(state.proposals).filter(isObj);
  const propose = (p) => {
    state.counters.proposal = (Number(state.counters.proposal) || 0) + 1;
    proposals.push({ id: "p" + state.counters.proposal, turn, ...p });
  };
  for (const item of arr(spec.open)) {
    const text = cut(isObj(item) ? str(item.text) : str(item), 300);
    if (!text) continue;
    // a settled thread listed under "open" too must not come back as a new one
    if (settled.some((s) => (isObj(item) && str(item.id) === s.id) || sameText(text) === s.text)) continue;
    const known = isObj(item) ? threads.find((t) => t.id === str(item.id) && t.status === "open") : null;
    // a kept thread keeps its kind and parent: the owner may have set them
    if (known) { known.text = text; continue; }
    // a new one: its kind (a missing or odd one is a side quest), and a step only under an open main quest
    const asked = isObj(item) && THREAD_KINDS.includes(item.kind) ? item.kind : "side";
    const parentId = isObj(item) ? str(item.parent) : "";
    const parent = parentId && threads.some((t) => t.id === parentId && t.status === "open" && !t.parent && questKind(t) === "main") ? parentId : "";
    const kind = parent ? "side" : asked;
    if (questRoom(ctx.cfg, questCounts(threads), kind, parent)) {
      state.counters.thread += 1;
      threads.push({ id: "t" + state.counters.thread, text, since: turn, status: "open", kind, ...(parent ? { parent } : {}) });
    } else if (!threads.some((t) => t.status === "open" && sameText(t.text) === sameText(text)) && !proposals.some((p) => p.type === "open" && sameText(p.text) === sameText(text))) {
      // above the limit: not dropped in silence, it waits for the owner (#86)
      propose({ type: "open", why: "limit", text, kind, ...(parent ? { parent } : {}) });
    }
  }
  // an everyday quest is small: it ends by itself, and no more than a few are open at once
  const everydayFor = everydayTurnsOf(ctx.cfg);
  const everyday = threads.filter((t) => t.status === "open" && !t.parent && questKind(t) === "everyday").sort((a, b) => (num(a.since) || 0) - (num(b.since) || 0));
  for (const t of everyday) if (everydayFor && turn - (num(t.since) || 0) >= everydayFor) { t.status = "resolved"; t.resolvedAt = turn; }
  const stillEveryday = everyday.filter((t) => t.status === "open");
  for (const t of stillEveryday.slice(0, Math.max(0, stillEveryday.length - EVERYDAY_OPEN_MAX))) { t.status = "resolved"; t.resolvedAt = turn; }
  // a thread the check asked about and the story left as it was grows stale; one the sensor reworded starts over
  const retireAt = retireAfterOf(ctx.cfg);
  const every = threadCheckOf(ctx.cfg);
  for (const { t: asked } of threadsInCheck(ctx)) {
    const t = threads.find((x) => x.id === asked.id && x.status === "open");
    if (!t) continue;
    t.checked = t.text === wasText.get(t.id) ? (Number(t.checked) || 0) + 1 : 0;
    const kept = Number.isFinite(num(t.keptAt)) && turn - num(t.keptAt) < retireAt * every;
    const asking = proposals.some((p) => p.type === "close" && p.threadId === t.id && !dismissed.includes(p.id));
    if (retireAt && t.checked >= retireAt && questKind(t) !== "everyday" && !kept && !asking) {
      propose({ type: "close", why: "stale", threadId: t.id, text: t.text, since: t.since });
    }
  }
  // a close proposal for a thread that is closed by now is gone; only the newest few are kept
  proposals = proposals.filter((p) => p.type !== "close" || threads.some((t) => t.id === p.threadId && t.status === "open"));
  // over the cap the answered ones go first, then the oldest; only the unanswered ones count as lost
  while (proposals.length > PROPOSALS_KEPT) {
    const at = Math.max(0, proposals.findIndex((p) => dismissed.includes(p.id)));
    if (!dismissed.includes(proposals[at].id)) state.proposalsDropped = (Number(state.proposalsDropped) || 0) + 1;
    proposals.splice(at, 1);
  }
  state.proposals = proposals;
  // the newest resolved ones stay as history, a bounded number
  const history = [...closed, ...threads.filter((t) => t.status !== "open")]
    .sort((a, b) => (num(b.resolvedAt) || 0) - (num(a.resolvedAt) || 0))
    .slice(0, RESOLVED_THREADS_KEPT);
  return [...threads.filter((t) => t.status === "open"), ...history];
}
const RESOLVED_THREADS_KEPT = 20;

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
  ctx.outScene = isObj(out.scene) ? out.scene : null; // charEntry: a new scene drops a carried contact
  const B = ctx.base && ctx.base.snap;
  const turn = (B ? B.turn || 0 : 0) + 1;
  // a name the user had earlier in the chat may sit in an older snapshot: not a character
  const known0 = withSoulNames(ctx.souls, [...ctx.characters, ...Object.keys((B && B.chars) || {})]).filter((n) => sideOf(n, userAll(ctx), []) !== "user");
  const known = unique([...known0, ...arr(out.present).map((n) => canonName(n, known0)).filter((n) => n && sideOf(n, userAll(ctx), []) !== "user")]);
  const present = scenePresent(ctx, out, known);
  const events = readEvents(out.events, ctx, known, unknownIds);

  const sensorChars = {};
  if (isObj(out.chars)) for (const [n, v] of Object.entries(out.chars)) sensorChars[canonName(n, known)] = v;
  const blind = {};
  if (isObj(out.blindSpot)) for (const [n, v] of Object.entries(out.blindSpot)) if (sideOf(n, userAll(ctx), known) !== "user") blind[canonName(n, known)] = v;

  const targets = events.map((e) => e.to).filter((n) => n && n !== "user" && known.includes(n));
  const names = unique([...Object.keys((B && B.chars) || {}).filter((n) => sideOf(n, userAll(ctx), []) !== "user"), ...present, ...targets]);
  const chars = {};
  for (const name of names) {
    if (!present.includes(name) && !targets.includes(name) && B && B.chars[name]) {
      const re = reseed(ctx, name, B.chars[name], soulOf(ctx.souls, name));
      chars[name] = { ...re.entry, compact: true };
      if (re.line) state.history[name] = [...arr(state.history[name]), re.line];
      continue;
    }
    const made = charEntry(ctx, name, events, sensorChars[name], blind[name], B);
    chars[name] = made.entry;
    if (made.seedLine) state.history[name] = [...arr(state.history[name]), made.seedLine];
    addHistory(state, name, turn, K, made.prev, made.entry, made.old);
  }
  orderPresent(present, events, B).forEach((name, i) => {
    if (chars[name]) chars[name].compact = i >= 4;
  });
  for (const name of names) if (!present.includes(name) && chars[name]) chars[name].compact = true;

  applyNotebook(ctx, out, present, turn, K);
  applySaid(ctx, out, present, turn, K);
  applyNames(ctx, out, present, turn, K);
  const snapshot = {
    turn,
    at: Math.max(Date.now(), 1 + Math.max(0, ...Object.values(state.snapshots).map((x) => x.at || 0))),
    sensorModel: model || "",
    op,
    sig: textSig(ctx.newMsgs),
    // the key this snapshot was computed from (null = the line start): standingFrom checks it still stands
    base: ctx.base ? ctx.base.key : null,
    ...(out.__partial ? { partial: true } : {}),
    clock: advanceClock(B && B.clock, out, op),
    scene: readScene(out.scene, B && B.scene),
    present,
    events,
    chars,
    edges: applyEdges(B, out, known),
    threads: applyThreads(ctx, out, turn),
    extra: {},
  };
  if (arr(ctx.backdrops).length) {
    // the pick holds until the sensor names another image of the folder
    const picked = readBackdrop(out.background, ctx.backdrops) || (B && readBackdrop(B.background, ctx.backdrops));
    if (picked) snapshot.background = picked;
  }
  state.snapshots[K] = snapshot;
  const order = Object.keys(state.snapshots).sort((a, b) => (state.snapshots[b].at || 0) - (state.snapshots[a].at || 0));
  for (const old of order.slice(SNAPSHOT_LIMIT)) delete state.snapshots[old];
  logPlace(state, K, snapshot.clock);
  return snapshot;
}

// ---------- souls: rating a card ----------
// One call per card proposes souls for its main characters; the proposal is a file
// the user settles in the card's Soul tab (docs/SOUL.md). Code adds the event list,
// the stat names and the output shape, so no edit of the prompt can break the format.
const SOUL_SHAPE =
  "{\"characters\": {\"<name>\": {\"class\": \"romantic|ally|neutral|hostile\", \"pronouns\": \"she|he|they\", \"aliases\": [\"other spelling\"], " +
  "\"start\": {\"trust\": 0, \"respect\": 0}, \"traits\": {\"dominance\": 50, \"shyness\": 50}, \"spectra\": {\"introvert_extrovert\": 50}, " +
  "\"triggers\": [{\"cue\": \"a few words\", \"event\": \"event id\", \"stat\": \"stat name\", \"x\": 1.5}], \"values\": [{\"cue\": \"a few words\", \"event\": \"event id\", \"stat\": \"stat name\", \"x\": 1.5}], " +
  "\"coping\": \"one short line\"}}, \"minor\": [\"<seen name>\"], \"cardType\": \"single|narrator|group|assistant|other\", \"note\": \"one or two lines on what you chose and why\"}";

function soulSystem(cfg, vocab) {
  // a soul is not per chat: families a chat switched off are still listed
  const events = Object.values(vocab)
    .filter((e) => e.id !== "other")
    .map((e) => e.id + (e.meaning ? ": " + e.meaning : ""));
  return (
    promptOf("soul", cfg) +
    "\n\nEvent ids\n" + events.join("\n") +
    "\n\nStat names: " + DELTA_KEYS.join(", ") +
    "\n\nOutput shape\nReply with JSON only: " + SOUL_SHAPE +
    "\nLeave out any key you have nothing for."
  );
}

const BOOK_LIMIT = 10000;
const ENTRY_LIMIT = 1200;
const entriesOf = (book) => {
  const e = isObj(book) ? book.entries : null;
  return Array.isArray(e) ? e : isObj(e) ? Object.values(e) : [];
};

/** One lorebook entry as a line; "" for a disabled or empty one. */
function entryLine(e) {
  if (!isObj(e) || e.disable === true || e.enabled === false) return "";
  const content = str(e.content);
  if (!content) return "";
  const keys = (Array.isArray(e.keys) ? e.keys : Array.isArray(e.key) ? e.key : []).filter((k) => typeof k === "string");
  const title = str(e.comment) || str(e.name) || keys.join(", ");
  return cut("- " + (title ? title + ": " : "") + content, ENTRY_LIMIT);
}

/** What the rating call reads: the card and the lorebooks it uses. opts = { lorebookIds, userName }. */
function soulUser(fsx, cardId, opts) {
  const o = isObj(opts) ? opts : {};
  const card = readCard(fsx, cardId) || {};
  const studio = isObj(card.studio) ? card.studio : {};
  const field = (label, v, max) => (str(v) ? label + "\n" + cut(str(v), max) : "");
  const head = [
    "Card: " + (str(card.name) || cardId),
    field("Description", card.description, 4000),
    field("Personality", card.personality, 2000),
    field("Scenario", card.scenario, 2000),
    field("First message", card.first_mes, 1500),
  ]
    .filter(Boolean)
    .join("\n\n");
  const books = [];
  if (isObj(card.character_book)) books.push({ name: str(card.character_book.name) || "embedded in the card", entries: entriesOf(card.character_book) });
  const ids = unique([studio.embeddedLorebookId, ...arr(studio.linkedLorebookIds), ...arr(o.lorebookIds)]).filter((id) => typeof id === "string" && CHAT_ID.test(id));
  for (const id of ids) {
    const book = readJson(fsx, "lorebooks/" + id + ".json", null);
    if (isObj(book)) books.push({ name: str(book.name) || id, entries: entriesOf(book) });
  }
  const sections = [cut(head, 8000)];
  let used = 0;
  let full = false;
  for (const book of books) {
    const lines = [];
    for (const e of book.entries) {
      const line = entryLine(e);
      if (!line) continue;
      if (used + line.length + 1 > BOOK_LIMIT) {
        full = true;
        break;
      }
      used += line.length + 1;
      lines.push(line);
    }
    if (lines.length) sections.push("Lorebook: " + book.name + "\n" + lines.join("\n"));
    if (full) break;
  }
  if (full) sections.push("(more entries left out)");
  // names restriction for named rating
  if (Array.isArray(o.rateNames) && o.rateNames.length) {
    const namesList = o.rateNames.join(", ");
    sections.push("Rate only these characters, and use exactly these names as keys: " + namesList + ".");
  }
  // existing souls on the card
  const existing = cardSoulsOf(card);
  if (Object.keys(existing).length) {
    const soulLines = [];
    for (const [key, soul] of Object.entries(existing)) {
      if (!isObj(soul)) continue;
      const aliases = arr(soul.aliases).join(", ");
      soulLines.push(key + (aliases ? " (aliases: " + aliases + ")" : ""));
    }
    if (soulLines.length) {
      const list = soulLines.join(", ");
      sections.push(
        Array.isArray(o.rateNames) && o.rateNames.length
          ? "Souls this card already has (reuse these exact keys; add other spellings to aliases): " + list
          : "These characters already have souls: do not rate them again and do not list them in characters or minor; other spellings of these names are the same characters: " + list,
      );
    }
  }
  // names seen in chats with counts
  const nameCounts = new Map();
  let files = [];
  try {
    files = fsx.list("chats").filter((f) => f.endsWith(".meta.json"));
  } catch {}
  for (const f of files) {
    const id = f.replace(/\.meta\.json$/, "");
    const meta = readJson(fsx, "chats/" + f, null);
    if (!CHAT_ID.test(id) || !isObj(meta) || meta.characterId !== cardId || meta.groupId) continue;
    for (const snap of Object.values(loadState(fsx, id).state.snapshots)) {
      if (isObj(snap)) for (const n of arr(snap.present)) if (str(n)) nameCounts.set(str(n), (nameCounts.get(str(n)) || 0) + 1);
    }
  }
  const seenNames = [...nameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  if (seenNames.length) {
    const nameList = seenNames.map((e) => e[0] + " (" + e[1] + ")").join(", ");
    sections.push("Names seen in this card's chats (most seen first): " + nameList);
  }
  // collect user names from all chats
  const userNames = new Set();
  for (const f of files) {
    const id = f.replace(/\.meta\.json$/, "");
    const meta = readJson(fsx, "chats/" + f, null);
    if (!CHAT_ID.test(id) || !isObj(meta) || meta.characterId !== cardId || meta.groupId) continue;
    const uname = userNameOf(fsx, meta);
    if (uname !== NO_USER_NAME) userNames.add(uname);
  }
  const userNamesList = str(o.userName) ? [o.userName, ...arr([...userNames].filter((u) => u !== o.userName))] : [...userNames];
  const userMsg = userNamesList.length > 1
    ? "The user's character is " + userNamesList[0] + " (also written " + userNamesList.slice(1).join(", ") + "): never rate them."
    : userNamesList.length === 1 ? "The user's character is " + userNamesList[0] + ": never rate them." : "";
  if (userMsg) sections.push(userMsg);
  return sections.join("\n\n");
}

/** Who rates: the card's own model for its tasks, else the app-wide Card tasks model, else the sensor model, else the chat's model, else the app's default model. */
function soulModel(fsx, cfg, meta, cardId) {
  const settings = readJson(fsx, "settings.json", null);
  const own = cardId && /^[A-Za-z0-9_-]{1,120}$/.test(String(cardId)) ? readJson(fsx, "characters/" + cardId + "/card-tasks.json", null) : null;
  const ui = isObj(settings) && isObj(settings.ui) ? settings.ui : {};
  return (isObj(own) ? str(own.model) : "") || (isObj(ui.cardTasks) ? str(ui.cardTasks.model) : "") || str(cfg.sensorModel) || str(meta && meta.model) || (isObj(settings) ? str(settings.model) : "");
}

/** The preset a chat replies with (the default preset when there is no chat), as the chat plugin picks it. */
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

/**
 * The thinking settings of the chat's preset, for the dashboard's own calls. Without them a
 * thinking model thought with no budget and spent the whole reply limit on it: an empty answer
 * (a local Gemma 4 finetune, 2026-10-12). With a budget, the reply limit grows by it, so the
 * answer keeps its own room.
 */
function callParams(fsx, cfg, meta, temperature) {
  const preset = chatPreset(fsx, meta);
  const reasoning = preset && typeof preset.reasoning === "string" && preset.reasoning !== "off" ? preset.reasoning : "";
  const budget = reasoning && typeof preset.thinkingBudget === "number" && preset.thinkingBudget > 0 ? Math.round(preset.thinkingBudget) : 0;
  const tags = preset && isObj(preset.reasoningTags) && str(preset.reasoningTags.open) && str(preset.reasoningTags.close) ? { open: preset.reasoningTags.open, close: preset.reasoningTags.close } : null;
  return {
    ...(reasoning ? { reasoning } : {}),
    ...(budget ? { thinkingBudget: budget } : {}),
    ...(tags ? { reasoningTags: tags } : {}),
    presetParams: { temperature, max_tokens: maxTokensOf(cfg) + budget },
  };
}

function askSoul(host, cfg, cardId, meta, key, opts) {
  const fsx = host.fs;
  const o = isObj(opts) ? opts : {};
  const model = soulModel(fsx, cfg, meta, cardId);
  const userName = meta ? userNameOf(fsx, meta) : "";
  const rateNames = Array.isArray(o.names) ? o.names.slice(0, 12).filter((n) => typeof n === "string").map((n) => cut(n.trim(), 60)).filter(Boolean) : undefined;
  host.llm.request(key, {
    ...(model ? { model } : {}),
    systemPrompt: soulSystem(cfg, loadVocab(fsx)),
    messages: [{ role: "user", content: soulUser(fsx, cardId, { lorebookIds: meta ? meta.lorebookIds : [], userName: userName === NO_USER_NAME ? "" : userName, rateNames }) }],
    ...callParams(fsx, cfg, meta, 0.3),
  });
}

/**
 * Why a reply gave nothing to read. A thinking model that ran out of room leaves its thoughts
 * and no answer: say so, with what to change, instead of "returned nothing".
 */
function emptyReplyError(r, what) {
  if (r.error) return String(r.error);
  if (str(r.reasoning)) {
    return what + " spent its whole reply limit thinking and wrote no answer. Give the chat's preset a thinking budget, turn thinking off for this model, or raise the dashboard's reply limit.";
  }
  return what + " returned nothing";
}

/** The reply of the rating call as a proposal; a failure becomes a proposal with an error. */
function draftFromReply(reply) {
  const r = isObj(reply) ? reply : {};
  const fail = (message) => normalizeDraft({ v: 1, at: Date.now(), by: "auto", characters: {}, error: message });
  if (r.error || !str(r.text)) return fail(emptyReplyError(r, "the model"));
  const out = parseSensorText(r.text);
  if (!out) return fail("the reply was not JSON");
  if (!isObj(out.characters)) return fail("the reply had no characters");
  return normalizeDraft({ v: 1, at: Date.now(), by: "auto", model: str(r.model), note: out.note, minor: out.minor, cardType: out.cardType, characters: out.characters });
}

/** Merge new draft into existing live proposal, keeping unrelated characters and unioning minor. */
function mergeDraft(existing, newDraft) {
  if (!existing || existing.error || existing.dismissedAt) return newDraft;
  const merged = { ...newDraft, characters: { ...newDraft.characters } };
  // union characters: keep old characters not in newDraft, add new ones
  const oldChars = isObj(existing.characters) ? existing.characters : {};
  for (const [name, soul] of Object.entries(oldChars)) {
    if (!(name in merged.characters)) merged.characters[name] = soul;
  }
  // union minor lists
  const newMinor = arr(newDraft.minor);
  const oldMinor = arr(existing.minor);
  merged.minor = cleanNames([...oldMinor, ...newMinor]);
  if (!merged.minor.length) delete merged.minor;
  // keep existing cardType when new draft has none
  if (!merged.cardType && existing.cardType) merged.cardType = existing.cardType;
  return merged;
}

// Only the first-update rating uses this: it runs for a card with no souls (needsRating), so nothing saved is there to drop.
function saveRated(fsx, cardId, reply) {
  const draft = draftFromReply(reply);
  const card = readCard(fsx, cardId);
  const rekeyed = isObj(card) ? rekeyToCard(card, draft, fsx, cardId) : draft;
  fsx.write(draftPath(cardId), JSON.stringify(rekeyed, null, 2));
  return rekeyed;
}

/** A card with no soul and no proposal file (or only a failed one, after a pause) is rated by itself. */
function needsRating(fsx, cardId, cfg) {
  if (cfg.autoSoul === false) return false;
  const card = readCard(fsx, cardId);
  if (!isObj(card) || Object.keys(cardSoulsOf(card)).length) return false;
  if (!fileExists(fsx, draftPath(cardId))) return true;
  // a failed rating is tried again after the same pause as a failed sensor
  const draft = readDraft(fsx, cardId);
  return !!(draft && draft.error && !draft.dismissedAt && Date.now() - Number(draft.at) >= RATE_ERROR_PAUSE_MS);
}
const RATE_ERROR_PAUSE_MS = 10 * 60 * 1000;

// ---------- one update: plan, ask, commit ----------
const ok = (json, status) => ({ status: status || 200, json });

/**
 * Pass A and pass B both start here. Reads only. Returns { final } when the
 * answer is already known, else everything the sensor call and the commit need.
 */
function planUpdate(fsx, chatId, op) {
  const chat = readChat(fsx, chatId);
  if (!chat) return { final: ok({ error: "no such chat" }, 404) };
  const { state, existed, before } = loadStateFor(fsx, chatId);
  const unchanged = () => ({ final: ok({ ok: true, state: existed ? state : null, unchanged: true }) });
  const line = activeLine(chat.msgs);
  if (!line.length) return unchanged();
  // a chat that carried an earlier chat's state keeps the choice to start clean open until the user has
  // played in it: the background catch-up does not read a lone greeting (a real turn or a button still does)
  if (op === "catchup" && activeInherit(state) && !Object.keys(state.snapshots).length && !line.some((l) => l.msg.role === "user")) return unchanged();
  // a reply with no text (only reasoning, or a cut-off stream) has nothing to read: no sensor call
  if (!str(line[line.length - 1].msg.text)) return { final: ok({ ok: true, state: existed ? state : null, unchanged: true, skipped: "empty" }) };
  const keys = line.map((l) => l.key);
  const K = keys[keys.length - 1];
  const existing = state.snapshots[K];
  // a snapshot made before sigs existed is never re-sensed
  if (existing && typeof existing.sig !== "string") return unchanged();
  // Which snapshots still stand: everything after the first one whose messages changed (an
  // earlier edit, a Continue, a deleted message, another swipe) was computed from text that
  // is gone. Those are dropped and the line is read again from the last one that stands,
  // in one call (standingFrom).
  const { good, cut, at } = standingFrom(state, line);
  const bi = good;
  // from the line start a chat that continues another reads on from the state it carried (key null = the start)
  const carried = activeInherit(state);
  const base = bi >= 0 ? { key: keys[bi], snap: state.snapshots[keys[bi]] } : carried ? { key: null, snap: carried.snap } : null;
  const drop = cut ? dropAfter(state, line, bi) : [];
  const newMsgs = line.slice(bi + 1).map((l) => l.msg).filter((m) => str(m.text));
  // nothing to read after the base (only text-less messages): dropping the stale snapshots needs no call
  if (!newMsgs.length) {
    if (!drop.length) return unchanged();
    return { fsx, chatId, meta: chat.meta, line, K, base, drop, newMsgs, state, before };
  }
  const { names, souls } = chatCharacters(fsx, chat.meta);
  const overlay = loadOverlay(fsx, chatId);
  // the read starts before where the newest key's own snapshot started (an earlier snapshot
  // fell, or the newest one's base did): the line under the reply says from which message.
  // A new swipe of the newest message or an edit of it is an ordinary read.
  const from = bi + 2 + line.slice(bi + 1).findIndex((l) => str(l.msg.text));
  const earlier = cut && (at !== keys.length - 1 || !existing || !("base" in existing) || existing.base !== (base ? base.key : null));
  const reread = earlier ? { from, ...(newMessagesBody(newMsgs).trimmed ? { trimmed: true } : {}) } : null;
  return {
    fsx,
    chatId,
    overlay,
    // the base snapshot's threads with the user's edits and additions: what the sensor sees and carries
    threads: effectiveThreads(overlay, base && base.snap.threads, base ? base.snap.turn : 0),
    op: existing ? "resense" : op,
    // a re-read never takes the state the story reply carried (fast mode)
    ...(existing ? { resense: true } : {}),
    drop,
    ...(reread ? { reread } : {}),
    meta: chat.meta,
    line,
    K,
    base,
    newMsgs,
    characters: names,
    souls,
    userName: userNameOf(fsx, chat.meta),
    userNames: userNamesOf(fsx, chat),
    state,
    before,
    cfg: loadConfig(fsx),
    vocab: loadVocab(fsx),
    backdrops: backdropChoices(fsx, chat.meta),
  };
}

function askSensor(host, ctx, key) {
  const model = str(ctx.cfg.sensorModel) || str(ctx.meta.model);
  host.llm.request(key, {
    ...(model ? { model } : {}),
    systemPrompt: sensorSystem(ctx.cfg, ctx.vocab),
    messages: [{ role: "user", content: sensorUser(ctx) }],
    ...callParams(ctx.fsx, ctx.cfg, ctx.meta, 0.2),
  });
}

function writeDebug(fsx, ctx, info) {
  if (!ctx.cfg.debug) return;
  try {
    const entry = { at: new Date().toISOString(), chatId: ctx.chatId, input: sensorUser(ctx), ...info };
    fsx.write(DEBUG_FILE, JSON.stringify(entry, null, 2));
    // the latest run overwrites the file above, so a reply that went wrong was gone by the next turn:
    // the last runs are kept in a second file, newest last (#97)
    const runs = [...arr(readJson(fsx, DEBUG_RUNS_FILE, [])), { ...entry, input: cut(String(entry.input || ""), DEBUG_RUN_TEXT_MAX), raw: cut(String(entry.raw || ""), DEBUG_RUN_TEXT_MAX) }];
    fsx.write(DEBUG_RUNS_FILE, JSON.stringify(runs.slice(-DEBUG_RUNS_KEEP), null, 1));
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
  if (r.error || !str(r.text)) return failUpdate(fsx, ctx, emptyReplyError(r, "the sensor"), { raw: String(r.text || "") });
  const out = parseSensorText(r.text);
  if (!out) return failUpdate(fsx, ctx, "sensor reply was not JSON", { raw: String(r.text) });
  const unknownIds = [];
  try {
    // every snapshot after the base is read again from it: start from what it wrote
    for (const key of ctx.drop) dropSnapshot(ctx.state, key);
    const snapshot = applySensor(ctx, out, ctx.op, str(r.model), unknownIds);
    // fast mode: the report came with the story reply, so no sensor call and no tokens of its own
    if (r.fast) snapshot.fast = true;
    const usage = isObj(r.usage) ? r.usage : {};
    ctx.state.usage = {
      ...ctx.state.usage,
      calls: ctx.state.usage.calls + 1,
      inTokens: ctx.state.usage.inTokens + (num(usage.input) || 0),
      outTokens: ctx.state.usage.outTokens + (num(usage.output) || 0),
      lastMs: num(r.genTimeMs) || 0,
      ...(r.fast ? { fast: (num(ctx.state.usage.fast) || 0) + 1 } : {}),
    };
    ctx.state.lastError = null;
    // facts the sensor wrote that could not be kept: the dashboard says so until a report keeps all (#97)
    const kept = ctx.keptOut || { user: 0, absent: 0 };
    ctx.state.keptOut = kept.user || kept.absent ? { at: Date.now(), turn: snapshot.turn, user: kept.user, absent: kept.absent } : null;
    saveState(fsx, ctx);
    writeDebug(fsx, ctx, { raw: String(r.text), parsed: out, unknownEvents: unknownIds, keptOut: kept });
    return ok({ ok: true, state: ctx.state, snapshot: ctx.K, turn: snapshot.turn, ms: ctx.state.usage.lastMs, ...(ctx.reread ? { reread: ctx.reread } : {}) });
  } catch (e) {
    // a half-applied report must not leave notes or history behind
    ctx.state = JSON.parse(ctx.before);
    return failUpdate(fsx, ctx, "could not apply the sensor reply: " + (e && e.message ? e.message : String(e)), { raw: String(r.text), parsed: out });
  }
}

/** Only stale snapshots to drop and nothing to read after the base: no sensor call. */
function dropStale(fsx, ctx) {
  for (const key of ctx.drop) dropSnapshot(ctx.state, key);
  ctx.state.lastError = null;
  saveState(fsx, ctx);
  return ok({ ok: true, state: ctx.state, dropped: ctx.drop.length });
}

/**
 * The whole update for a route or a tick. input = {chatId, op, retry}.
 * Returns { pending: input for the next pass } or { done: response }.
 * A rate-limited reply gets one more try (the third pass), under its own key.
 */
function runUpdate(host, input) {
  const fsx = host.fs;
  let ctx = planUpdate(fsx, input.chatId, input.op);
  if (ctx.final) return { done: ctx.final };
  // nothing new to read, only stale snapshots: drop them, no call
  if (!ctx.newMsgs.length) return { done: dropStale(fsx, ctx) };
  const rated = !!input.rated;
  const carry = (extra) => ({ chatId: input.chatId, op: input.op, retry: !!input.retry, ...(rated ? { rated: true } : {}), ...extra });
  // Cards with no soul are rated first, so the sensor starts from their souls. The
  // passes are: ask the rating, write it and ask the sensor, commit. Nothing is
  // written before the answers are in.
  if (!rated && ctx.cfg.mode !== "manual") {
    const rating = arr(input.rating).filter((id) => typeof id === "string" && CHAT_ID.test(id));
    if (rating.length) {
      for (const id of rating) {
        const answer = host.llm.results["soul_rate_" + id];
        // a proposal already on disk (another run got there first) is left alone
        if (answer && needsRating(fsx, id, ctx.cfg)) saveRated(fsx, id, answer);
      }
      // plan again: the chat now sees the provisional souls
      ctx = planUpdate(fsx, input.chatId, input.op);
      if (ctx.final) return { done: ctx.final };
      const early = fastReply(host, ctx);
      if (early) return { done: commitUpdate(fsx, ctx, early) };
      askSensor(host, ctx, "sensor");
      return { pending: carry({ rated: true }) };
    }
    const need = unique(memberIds(fsx, ctx.meta)).filter((id) => needsRating(fsx, id, ctx.cfg)).slice(0, 4);
    if (need.length) {
      for (const id of need) askSoul(host, ctx.cfg, id, ctx.meta, "soul_rate_" + id);
      return { pending: carry({ rating: need }) };
    }
  }
  const key = input.retry ? "sensor_retry" : "sensor";
  const r = host.llm.results[key];
  if (!r) {
    // fast mode: the story reply may already carry the report; anything unusable falls through to the sensor
    const fast = fastReply(host, ctx);
    if (fast) return { done: commitUpdate(fsx, ctx, fast) };
    askSensor(host, ctx, key);
    return { pending: carry({}) };
  }
  // after a rating there is no pass left for a retry
  if (!input.retry && !rated && r.error && isRateLimit(r)) {
    askSensor(host, ctx, "sensor_retry");
    return { pending: carry({ retry: true }) };
  }
  return { done: commitUpdate(fsx, ctx, r) };
}

// ---------- catch-up on a tick ----------
const RECENT_MS = 30 * 60 * 1000;
const ERROR_PAUSE_MS = 10 * 60 * 1000;
// the UI triggers an update right after a reply; catch-up leaves a fresh chat to it
const TRIGGER_GRACE_MS = 90 * 1000;

/** The newest recently-active chat whose newest message has no snapshot (or changed text). */
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
    if (!CHAT_ID.test(id) || !isObj(meta) || meta.temporary || !(now - Number(meta.updatedAt) <= RECENT_MS) || now - Number(meta.updatedAt) < TRIGGER_GRACE_MS) continue;
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

/** State and notice files of chats that no longer exist (at most 20 per tick). */
function removeOrphans(fsx) {
  let removed = 0;
  for (const dir of [STATE_DIR, NOTICE_DIR, NOTES_DIR, NUDGE_DIR, FAST_DIR, REBASE_DIR]) {
    let files = [];
    try {
      files = fsx.list(dir.slice(0, -1)).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const f of files) {
      if (removed >= 20) return;
      const id = f.replace(/\.json$/, "");
      // fast entries also go when a day old (a mode switched back to sensor never uses them)
      const stale = dir === FAST_DIR && fastExpired(readJson(fsx, dir + f, null));
      if (readJson(fsx, "chats/" + id + ".meta.json", null) !== null && !stale) continue;
      try {
        fsx.remove(dir + f);
        removed++;
      } catch {}
    }
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
  "This is background for the next reply, not text to retell: do not restate it, and do not walk through every character each turn. Others present may still act on their own when it fits. Move the story forward; the open threads are there to pull on. Show the state only through behavior, body language, and voice. Never mention numbers, scores, or these notes. The notes are in English for the app: write the reply in the language the story is written in.";
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
  // the newest three messages of the request (not the system ones): what the scene is about now
  const recent = msgs
    .filter((m) => m && m.role !== "system" && typeof m.content === "string")
    .slice(-3)
    .map((m) => m.content.slice(-1500))
    .join("\n");
  return { op: str(t.op), speakerName: str(t.speakerName), targetId: str(t.targetId), userText: lastUser ? lastUser.content.slice(-2000) : "", recent };
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
  if (i >= 0) return { key: keys[i], snap: state.snapshots[keys[i]], keys: keys.slice(0, i + 1) };
  // no snapshot of its own yet: a chat that continues another stands on the state it carried
  const carried = activeInherit(state);
  return carried ? { key: INHERIT_KEY, snap: carried.snap, keys: [] } : null;
}

/**
 * What a character knows about the user. `soft` = this chat continues another one and its Dashboard was not built on
 * that chat (linked late): what it says the character does NOT know is only what it saw in this chat's own turns, and
 * the story so far says otherwise, so the "never heard the name" and "nothing else is known" claims are left out (the
 * Dashboard sits next to the user's line and would outrank the backstory).
 */
function knowsLine(name, user, notes, nameEntry, pr, soft) {
  const saw = notes.filter((n) => n.how === "saw").map((n) => n.text);
  const heard = notes.filter((n) => n.how === "heard");
  const guess = notes.filter((n) => n.how === "guess").map((n) => n.text);
  const parts = [];
  if (saw.length) parts.push("Saw: " + saw.join("; ") + ".");
  for (const n of heard) parts.push((n.from && n.from !== "user" ? n.from : user) + " told " + pr.them + ": " + n.text + ".");
  if (guess.length) parts.push("Guesses: " + guess.join("; ") + ".");
  if (nameEntry && !nameEntry.knowsUserName && !soft) {
    parts.push((nameEntry.calls ? "Knows " + user + " only as \"" + nameEntry.calls + "\" and" : "Has") + " never heard " + user + "'s name.");
  }
  if (!parts.length) return soft ? "" : "What " + name + " knows about " + user + ": nothing yet beyond what happens in front of " + pr.them + ".";
  return "What " + name + " knows about " + user + ": " + parts.join(" ") + (soft ? "" : " Anything else about " + user + ", " + name + " does not know.");
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
  const away = (n) => snap.chars && snap.chars[n] && CONTACT_WORDS[snap.chars[n].contact];
  const here = arr(snap.present).filter((n) => !away(n));
  const far = arr(snap.present).filter(away).map((n) => n + " " + away(n));
  // a texting scene used to send nothing at all, and the model forgot the talk was remote (#16)
  const remote = far.length ? " Not in the same place as " + user + ", in touch from elsewhere: " + far.join(", ") + "." : "";
  return "[Background, the scene: " + dayWords(snap.clock) + "." + (where ? " " + where + "." : "") + " Present: " + [user, ...here].join(", ") + "." + remote + "]";
}

/** Notes young enough for the insert: older ones are Litopys's now (pinned ones always stay). */
export function freshNotes(notebook, turn, age) {
  const now = Number(turn);
  if (!Number.isFinite(now)) return notebook;
  const out = {};
  for (const [name, list] of Object.entries(notebook || {})) {
    out[name] = arr(list).filter((n) => n.tag === "pinned" || !Number.isFinite(Number(n.turn)) || n.turn === null || now - Number(n.turn) < age);
  }
  return out;
}

/** The full block of one character. withNotes = false when it would leak. */
/** A character's notes for this scene: pinned always, then the ones the scene is about, then the important and recent ones. */
function pickNotes(list, limit, sceneText) {
  return relevantNotes(list, sceneText, limit);
}

function characterBlock(ctx, name, withNotes, limit) {
  const { snap, user } = ctx;
  const c = snap.chars[name];
  const soul = soulOf(ctx.souls, name);
  const pr = pronounsOf(soul);
  const who = { user, their: pr.their, self: pr.self };
  const lines = ["[How " + name + " is right now:"];
  if (CONTACT_WORDS[c.contact]) lines.push("Not in the same place as " + user + ": they talk " + CONTACT_WORDS[c.contact] + ".");
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
    const notes = pickNotes(arr(ctx.notebook[name]), limit === undefined ? NOTE_LIMIT : limit, ctx.sceneText);
    const nameEntry = arr(ctx.names[name]).slice(-1)[0];
    const known = knowsLine(name, user, notes, nameEntry, pr, ctx.soft);
    if (known) lines.push(known);
  }
  // the form of address, when the character knows the name and uses another word
  const asked = arr(ctx.names[name]).slice(-1)[0];
  if (asked && asked.knowsUserName && str(asked.calls) && str(asked.calls).toLowerCase() !== str(user).toLowerCase()) lines.push("Calls " + user + " \"" + cut(str(asked.calls), 100) + "\".");
  if (soul && str(soul.coping)) lines.push("Under strain: " + cut(str(soul.coping), 200) + ".");
  lines.push("]");
  return lines.join("\n");
}

function compactLine(ctx, name) {
  const c = ctx.snap.chars[name];
  return name + ": " + warmthWord(c.stats) + " toward " + ctx.user + (c.mood ? ", " + c.mood : "") + ".";
}

/**
 * The insert for one reply, or null. turn = {op, speakerName, targetId, userText, recent?}.
 * Returns { text, tokens, focus, notebookOf, key }.
 */
/** What the characters said as it counts: the active entries with the user's edits, the ones the user removed left out. */
export function effectiveSaid(state, keys, ov) {
  const edits = isObj(ov && ov.edits) ? ov.edits : {};
  const out = {};
  for (const [name, list] of Object.entries(activeBySrc(state.said, keys))) {
    for (const s of arr(list)) {
      const e = isObj(edits[s.id]) ? edits[s.id] : null;
      if (e && e.retired === true) continue;
      const text = e && str(e.text) ? cut(str(e.text), 300) : s.text;
      listIn(out, name).push(text === s.text ? s : { ...s, text, edited: true });
    }
  }
  return out;
}

/** What the user removed, to bring back. */
export function removedSaid(state, keys, ov) {
  const edits = isObj(ov && ov.edits) ? ov.edits : {};
  const out = {};
  for (const [name, list] of Object.entries(activeBySrc(state.said, keys))) {
    for (const s of arr(list)) if (isObj(edits[s.id]) && edits[s.id].retired === true) listIn(out, name).push(s);
  }
  return out;
}

const SAID_TOKENS = 120;
const SAID_KEEP = 4;
const SAID_LABEL = { vow: "vow", promise: "promise", threat: "threat", confession: "confession", secret: "secret revealed", order: "order", refusal: "refusal", lie: "a lie they told", other: "said" };

/**
 * "What <name> has said, and is held to" for the characters whose notebook shows: the newest few, one line
 * each holder, the oldest dropped first until it fits. A hidden lie goes in too (the character knows what
 * they said); hiding is only for the user's eyes. Empty when there is nothing.
 */
export function saidBlock(state, keys, holders, maxTokens, ov) {
  const live = effectiveSaid(state, keys, ov);
  const lines = [];
  for (const name of holders) {
    const items = arr(live[name]).slice(-SAID_KEEP);
    const line = (list) => "[What " + name + " has said, and is held to: " + list.map((s) => SAID_LABEL[s.kind] + " “" + s.text + "”").join("; ") + ".]";
    let list = items;
    while (list.length > 1 && estimateTokens(line(list)) > maxTokens) list = list.slice(1);
    if (list.length) lines.push(line(list));
  }
  return lines.join("\n");
}

export function buildInsert(fsx, chatId, turn, cfg) {
  if (turn.op === "impersonate") return null;
  const chat = readChat(fsx, chatId);
  if (!chat) return null;
  const { state, existed } = loadStateFor(fsx, chatId);
  if (!existed) return null;
  const line = activeLine(chat.msgs);
  const at = snapshotFor(state, line, turn);
  if (!at || !isObj(at.snap.chars)) return null;
  const { names: cards, souls } = chatCharacters(fsx, chat.meta);
  const snap = at.snap;
  const overlay = loadOverlay(fsx, chatId);
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
    notebook: freshNotes(effectiveNotebook(state, at.keys, overlay).live, snap.turn, noteAgeOf(cfg)),
    names: activeNames(state, at.keys),
    // linked to an earlier chat but never started from it: the Dashboard cannot say what is unknown (see knowsLine)
    soft: !isObj(state.inherited) && !!linkedFrom(fsx, chatId),
    // the notes follow the scene: the user's message, the newest messages, who is here
    sceneText: [str(turn.userText), typeof turn.recent === "string" ? turn.recent : line.slice(-3).map((m) => str(m.text)).join("\n"), ...present].join("\n"),
  };
  const rest = present.filter((n) => !focus.includes(n));
  // where the story can go: the model had nothing to pull on and the story stood still (no ids: no digits)
  // main quests first, each with its steps; then side quests. Everyday ones stay on the Dashboard (#117).
  const all = effectiveThreads(overlay, snap.threads, snap.turn).filter((t) => t.status === "open" && str(t.text));
  const stepsOf = (id) => all.filter((t) => t.parent === id).map((t) => str(t.text));
  const open = [
    ...all.filter((t) => !t.parent && questKind(t) === "main").map((t) => str(t.text) + (stepsOf(t.id).length ? " (next steps: " + stepsOf(t.id).join("; ") + ")" : "")),
    ...all.filter((t) => !t.parent && questKind(t) === "side").map((t) => str(t.text)),
  ];
  const threads = open.length ? "[Open threads the story can move toward: " + open.join("; ") + ".]" : "";
  // maxTokens is per character block; the scene, threads and closing lines come on top
  const shared = estimateTokens(sceneLine(snap, ctx.user) + threads + CLOSING);
  const budget = (Number(cfg.injection && cfg.injection.maxTokens) || 300) * Math.max(1, focus.length) + shared;
  // a character with no pinned note shows no notebook line once the limit is 0
  const hasPinned = (n) => arr(ctx.notebook[n]).some((x) => noteRank(x) === 0);
  const showsNotes = (n, notes, limit) => notes.includes(n) && (limit > 0 || hasPinned(n));
  const build = (withRest, notes, limit) => {
    const blocks = [sceneLine(snap, ctx.user), ...focus.map((n) => characterBlock(ctx, n, showsNotes(n, notes, limit), limit))];
    if (withRest && rest.length) blocks.push((focus.length ? "Also present: " : "People here: ") + rest.map((n) => compactLine(ctx, n)).join(" "));
    if (threads) blocks.push(threads);
    blocks.push(threads ? CLOSING : CLOSING.replace("; the open threads are there to pull on", ""));
    return blocks.join("\n");
  };
  // over the user's limit: drop the others' lines first, then the notebooks; say what went
  const trimmed = [];
  const notes = notesFor;
  let limit = NOTE_LIMIT;
  let text = build(true, notes, limit);
  const wanted = estimateTokens(text);
  if (estimateTokens(text) > budget && rest.length) {
    text = build(false, notes, limit);
    trimmed.push("others");
  }
  // then notebook lines from the end of the importance order; pinned lines are never cut
  if (estimateTokens(text) > budget && notes.length) {
    while (estimateTokens(text) > budget && limit > 0) {
      limit--;
      text = build(false, notes, limit);
    }
    trimmed.push("notebooks");
  }
  // how many notebook lines the cut took, of how many the scene would have shown; the rest of the
  // notebook is untouched and comes back when a later scene is about it
  const shownAt = (lim) => notes.filter((n) => focus.includes(n) && showsNotes(n, notes, lim))
    .reduce((sum, n) => sum + pickNotes(arr(ctx.notebook[n]), lim, ctx.sceneText).length, 0);
  const notesWanted = shownAt(NOTE_LIMIT);
  const notesCut = trimmed.includes("notebooks") ? notesWanted - shownAt(limit) : 0;
  // even with every unpinned line gone it does not fit: only a bigger limit helps
  const overEvenBare = estimateTokens(text) > budget;
  // what the speakers said and are held to: its own part, outside the notebook's budget
  const saidText = cfg.said && cfg.said.inject === false ? "" : saidBlock(state, at.keys, notes.filter((n) => focus.includes(n)), SAID_TOKENS, overlay);
  return { text, saidText, saidTokens: saidText ? estimateTokens(saidText) : 0, tokens: estimateTokens(text), wanted, budget, trimmed, notesCut, notesWanted, overEvenBare, focus, notebookOf: notes.filter((n) => focus.includes(n) && (limit > 0 || hasPinned(n))), key: at.key };
}

/**
 * Insert one system message just before the newest turn (the user's line, or the reply that
 * Continue extends): what changes every reply goes below the history, so the provider's prompt
 * cache keeps the history above it, and the user's line stays last for the notes that end it.
 * (The Litopys plugin carries the same function.)
 */
function withTailInsert(messages, text) {
  let last = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role !== "system") {
      last = i;
      break;
    }
  }
  if (last < 0) return [...messages, { role: "system", content: text }];
  return [...messages.slice(0, last), { role: "system", content: text }, ...messages.slice(last)];
}

export function llmRequest(ctx, host) {
  if (!ctx || ctx.key !== "reply") return null;
  const req = ctx.request || {};
  const chatId = String(req.sessionId || "");
  if (!CHAT_ID.test(chatId) || !Array.isArray(req.messages)) return null;
  const fsx = host && host.fs ? host.fs : null;
  if (!fsx) return null;
  const offForChat = (fsx, chatId, key) => {
    const m = readJson(fsx, "chats/" + chatId + ".meta.json", null);
    const off = m && m.promptBoard && Array.isArray(m.promptBoard.off) ? m.promptBoard.off : [];
    return off.includes(key);
  };
  if (offForChat(fsx, chatId, "plugin:relations")) return null;
  const fail = (what, e) => {
    try {
      host.log("dashboard " + what + ": " + (e && e.message ? e.message : String(e)));
    } catch {}
  };
  let messages = req.messages;
  let changed = false;
  let cfg = null;
  const promptSources = { parts: [] };
  const turn = turnOf(ctx);
  try {
    cfg = loadConfig(fsx);
    if (!(cfg.injection && cfg.injection.enabled === false)) {
      const insert = buildInsert(fsx, chatId, turn, cfg);
      if (insert && insert.trimmed.length) {
        // a hook's writes are its own small files (the app's data watcher ignores dashboard/)
        try {
          fsx.write(NOTICE_DIR + chatId + ".json", JSON.stringify({ at: Date.now(), trimmed: insert.trimmed, wanted: insert.wanted, budget: insert.budget, notesCut: insert.notesCut, notesWanted: insert.notesWanted, overEvenBare: insert.overEvenBare }));
        } catch {}
      } else if (insert) {
        // the notice speaks of the latest reply: one that fit drops an older cut's notice
        try {
          fsx.remove(NOTICE_DIR + chatId + ".json");
        } catch {}
      }
      if (insert) {
        messages = withTailInsert(messages, insert.text);
        promptSources.parts.push({ kind: "dashboard", label: "Relationship dashboard", text: String(insert.text || "").trim() });
        if (insert.saidText && !offForChat(fsx, chatId, "plugin:said")) {
          messages = withTailInsert(messages, insert.saidText);
          promptSources.parts.push({ kind: "dashboard", label: "Dashboard · said", text: String(insert.saidText).trim() });
        }
        changed = true;
      }
    }
  } catch (e) {
    fail("insert", e);
  }
  // fast mode: right after the insert, the note that asks for the state report at the end of the reply
  let fast = false;
  try {
    if (cfg && cfg.mode === "fast" && FAST_OPS.includes(turn.op)) {
      const fctx = fastContext(fsx, chatId, turn, cfg);
      if (fctx) {
        const fastText = fastInstructions(fctx);
        messages = withTailInsert(messages, fastText);
        promptSources.parts.push({ kind: "dashboard", label: "Dashboard · fast sensor", text: String(fastText || "").trim() });
        fast = true;
        changed = true;
      }
    }
  } catch (e) {
    fail("fast", e);
  }
  // the user asked for it explicitly: it applies even when the insert is switched off or failed above
  try {
    const note = takeNudge(fsx, chatId, turn, cfg || mergeConfig({}));
    if (note) {
      messages = withNudge(messages, note);
      promptSources.parts.push({ kind: "dashboard", label: "Dashboard · note", text: String(note || "").trim() });
      changed = true;
    }
  } catch (e) {
    fail("nudge", e);
  }
  // last of all, so it follows the nudge
  if (fast) {
    messages = withNudge(messages, FAST_REMINDER);
    promptSources.parts.push({ kind: "dashboard", label: "Dashboard · reminder", text: String(FAST_REMINDER || "").trim() });
  }
  return changed ? { messages, ...(promptSources.parts.length ? { promptSources } : {}) } : null;
}

/** Open threads (id, text) the story stands on at this turn; none without dashboard state. */
function openThreadsAt(fsx, chatId, turn) {
  const chat = readChat(fsx, chatId);
  if (!chat) return [];
  const { state, existed } = loadStateFor(fsx, chatId);
  if (!existed) return [];
  const at = snapshotFor(state, activeLine(chat.msgs), turn);
  if (!at) return [];
  return effectiveThreads(loadOverlay(fsx, chatId), at.snap.threads, at.snap.turn)
    .filter((t) => t.status === "open" && str(t.text))
    .map((t) => ({ id: String(t.id), text: cut(str(t.text), 300) }));
}

/** The pending nudge as stored, or null: missing, malformed or older than the limit. Never removes. */
function readNudge(fsx, chatId) {
  const n = readJson(fsx, NUDGE_DIR + chatId + ".json", null);
  if (!isObj(n) || !Number.isFinite(n.at) || Date.now() - n.at > NUDGE_TTL_MS) return null;
  return { threadId: typeof n.threadId === "string" && n.threadId ? n.threadId : null, at: n.at };
}

/** The note for one reply. open = [{id, text}]; a picked thread that is no longer open falls back to all. */
export function nudgeText(cfg, threadId, open) {
  const picked = threadId ? open.find((t) => t.id === threadId) : null;
  // no ids, no digits from code; a trailing dot would double the one after {threads}
  const clean = (t) => t.text.replace(/[.\s]+$/, "");
  const where = picked ? ", pulling on this open thread: " + clean(picked) : open.length ? ", pulling on one of these open threads: " + open.map(clean).join("; ") : "";
  return promptOf("nudge", cfg).split("{threads}").join(where);
}

// continue extends a reply and impersonate writes the user's own line: no nudge there
// (an engine without turn labels gives "": it counts as a send)
const NUDGE_OPS = ["send", "next", "swipe", ""];

/**
 * The note for this request, or null. Applying it consumes it (removes the file): a reply that
 * fails loses it and the user arms it again, since the hook cannot see the outcome.
 */
function takeNudge(fsx, chatId, turn, cfg) {
  const file = NUDGE_DIR + chatId + ".json";
  // no file: nothing to do; a file that is damaged or too old is dropped below
  try {
    fsx.read(file);
  } catch {
    return null;
  }
  const drop = () => {
    try {
      fsx.remove(file);
    } catch {}
  };
  const n = readNudge(fsx, chatId);
  if (!n) {
    drop();
    return null;
  }
  if (!NUDGE_OPS.includes(turn.op)) return null;
  const text = nudgeText(cfg, n.threadId, openThreadsAt(fsx, chatId, turn));
  drop();
  return text;
}

/** The note goes last so it weighs on this reply: onto a trailing user text, else as a message of its own. Copies only. */
function withNudge(messages, text) {
  const last = messages[messages.length - 1];
  if (last && last.role === "user" && typeof last.content === "string") return [...messages.slice(0, -1), { ...last, content: last.content + "\n\n" + text }];
  return [...messages, { role: "user", content: text }];
}

// ---------- fast mode: the sensor's report rides on the story reply ----------
// The same turns the nudge applies to. Continue extends a reply (the sensor reads it again) and impersonate writes
// the user's own line: neither carries a report.
const FAST_OPS = NUDGE_OPS;
const FAST_REMINDER = "[End this reply with the <vertep_state> tag as instructed.]";
// the sensor rules that still make sense inside a story reply: not its role, language or size lines (the note has its own)
const FAST_PARTS = ["truth", "events", "scene", "direction", "knowledge", "threads"];

function fastRules(cfg) {
  // a whole custom sensor prompt is cut at its headings; a part it lacks falls back to the default
  const own = wholeSensorCustom(cfg) ? splitSensor(cfg.sensor) : isObj(cfg.sensorParts) ? cfg.sensorParts : {};
  return FAST_PARTS.map((key) => (typeof own[key] === "string" && own[key].trim() ? own[key] : DEFAULT_SENSOR_PARTS[key])).join("\n\n");
}

/**
 * The system note that asks the story model for the report. ctx is what the sensor would get
 * (cast, previous state with thread and note ids), so the ids in the report match.
 */
export function fastInstructions(ctx) {
  return [
    promptOf("fast", ctx.cfg),
    fastRules(ctx.cfg),
    "Event vocabulary\n" + vocabularyText(ctx.vocab, ctx.cfg),
    "Output shape\n" + OUTPUT_SHAPE + "\nLeave out any key this turn gives nothing for.",
    castText(ctx),
    previousStateText(ctx),
    ...notebookTexts(ctx),
    ...[threadCheckText(ctx)].filter(Boolean),
  ].join("\n\n");
}

/** The sensor's context for the reply about to be written: the story as it stands before it (nothing is saved for it yet). */
function fastContext(fsx, chatId, turn, cfg) {
  const chat = readChat(fsx, chatId);
  if (!chat) return null;
  const { state } = loadStateFor(fsx, chatId);
  const at = snapshotFor(state, activeLine(chat.msgs), turn);
  const overlay = loadOverlay(fsx, chatId);
  const { names, souls } = chatCharacters(fsx, chat.meta);
  return {
    cfg,
    vocab: loadVocab(fsx),
    state,
    overlay,
    base: at ? { key: at.key, snap: at.snap } : null,
    // notebooks of the line up to the base: the keys after it have no snapshot yet
    line: at ? at.keys.map((key) => ({ key })) : [],
    K: null,
    resense: false,
    threads: effectiveThreads(overlay, at ? at.snap.threads : [], at ? at.snap.turn : 0),
    characters: names,
    souls,
    userName: userNameOf(fsx, chat.meta),
    userNames: userNamesOf(fsx, chat),
  };
}

/** About how many tokens fast mode adds to one reply: three characters in the scene, two open threads, the user's own event list. */
function fastTokens(cfg, vocab) {
  const names = ["Aria", "Bram", "Cora"];
  const stats = { trust: 20, comfort: 15, attraction: 5, respect: 25, affection: 10 };
  const chars = {};
  for (const n of names) chars[n] = { stats, mood: "wary, curious", holding: "a mug" };
  const snap = { turn: 6, clock: { day: 2, time: "19:40", band: "evening", place: "the tavern", weather: "rain" }, present: names, chars };
  const ctx = {
    cfg,
    vocab,
    state: emptyState("sample"),
    overlay: normalizeOverlay(null),
    base: { key: "m0#0", snap },
    line: [],
    K: null,
    resense: false,
    threads: [{ id: "t1", text: "Who took the key?", status: "open" }, { id: "t2", text: "Will Bram keep his promise?", status: "open" }],
    characters: names,
    souls: { Aria: { class: "ally", pronouns: "she" }, Bram: { class: "neutral", pronouns: "he" }, Cora: { class: "neutral", pronouns: "she" } },
    userName: "You",
  };
  return estimateTokens(fastInstructions(ctx)) + estimateTokens("\n\n" + FAST_REMINDER);
}

const readFast = (fsx, chatId) => {
  const doc = readJson(fsx, FAST_DIR + chatId + ".json", null);
  return { v: 1, entries: isObj(doc) && isObj(doc.entries) ? doc.entries : {} };
};

/** Forget one entry (the update used it or turned it down); the file goes with its last entry. */
function dropFast(fsx, chatId, key) {
  try {
    const doc = readFast(fsx, chatId);
    if (!(key in doc.entries)) return;
    delete doc.entries[key];
    if (Object.keys(doc.entries).length) fsx.write(FAST_DIR + chatId + ".json", JSON.stringify(doc));
    else fsx.remove(FAST_DIR + chatId + ".json");
  } catch {}
}

/** No entry is younger than a day (or none is left): the file is only clutter. */
const fastExpired = (doc) => !isObj(doc) || !isObj(doc.entries) || !Object.values(doc.entries).some((e) => isObj(e) && Date.now() - Number(e.at) <= FAST_TTL_MS);

/**
 * Fast mode: the report the story reply carried for the key about to be sensed, as a reply for commitUpdate,
 * or null (the sensor runs as in mode sensor). An entry is used up either way. A re-read of a changed message never uses one.
 */
function fastReply(host, ctx) {
  if (ctx.cfg.mode !== "fast" || ctx.resense) return null;
  const entry = readFast(host.fs, ctx.chatId).entries[ctx.K];
  if (!isObj(entry)) return null;
  dropFast(host.fs, ctx.chatId, ctx.K);
  const body = typeof entry.body === "string" ? entry.body : "";
  if (!parseSensorText(body)) {
    try {
      host.log("dashboard fast: the state in the reply was not usable, asking the sensor");
    } catch {}
    return null;
  }
  return { text: body, model: str(entry.model), fast: true };
}

/** Names an insert can be built for: the newest snapshot of the active line, present non-compact characters first. */
function previewSpeakers(fsx, chatId) {
  const chat = readChat(fsx, chatId);
  const { state, existed } = loadStateFor(fsx, chatId);
  if (!chat || !existed) return [];
  const key = activeLine(chat.msgs).map((l) => l.key).reverse().find((k) => state.snapshots[k]);
  const carried = activeInherit(state);
  const snap = key ? state.snapshots[key] : carried ? carried.snap : null;
  if (!snap || !isObj(snap.chars)) return [];
  const chars = snap.chars;
  const first = arr(snap.present).filter((n) => chars[n] && !chars[n].compact);
  return unique([...first, ...Object.keys(chars)]);
}

/** Settings "What the model sees": the insert for a speaker as the next reply would get it. */
function previewInsert(req, fsx) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const speakerName = str(req.query && req.query.speaker);
  const speakers = previewSpeakers(fsx, chatId);
  const insert = buildInsert(fsx, chatId, { op: "send", speakerName, targetId: "", userText: str(req.query && req.query.text) }, loadConfig(fsx));
  if (!insert) return ok({ insert: null, speakers });
  const { state } = loadStateFor(fsx, chatId);
  const snap = state.snapshots[insert.key] || (activeInherit(state) || {}).snap;
  const blind = Object.values(snap.chars || {}).map((c) => str(c.blindSpot)).filter(Boolean);
  return ok({
    insert,
    speakers,
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
  if (op === "impersonate") return ok({ ok: true, skipped: "impersonate" });
  if (parseBool(b.auto) === true && loadConfig(host.fs).mode === "manual") return ok({ ok: true, skipped: "manual" });
  const stash = isObj(req.stash) ? req.stash : {};
  const step = runUpdate(host, { chatId, op, retry: !!stash.retry, rating: stash.rating, rated: !!stash.rated });
  return step.pending ? { __llmPending: true, stash: step.pending } : step.done;
}

// ---------- routes: souls ----------
/** POST /dashboard/soul/rate: rate the main characters of one card. */
function rateRoute(req, host) {
  const fsx = host.fs;
  const b = isObj(req.body) ? req.body : {};
  const cardId = String(b.characterId || "");
  if (!CHAT_ID.test(cardId)) return ok({ error: "characterId required" }, 400);
  if (!isObj(readCard(fsx, cardId))) return ok({ error: "no such character" }, 404);
  const chatId = String(b.chatId || "");
  const chat = CHAT_ID.test(chatId) ? readChat(fsx, chatId) : null;
  const cfg = loadConfig(fsx);
  // names parameter: extract and clean
  const cleaned = Array.isArray(b.names) ? b.names.slice(0, 12).filter((n) => typeof n === "string").map((n) => cut(n.trim(), 60)).filter(Boolean) : [];
  const names = cleaned.length ? cleaned : undefined;
  // with names, treat auto: true as not auto (the button asked for it)
  const isAuto = parseBool(b.auto) === true && !names;
  if (isAuto && !needsRating(fsx, cardId, cfg)) return ok({ skipped: true });
  const retry = !!(isObj(req.stash) && req.stash.retry);
  const key = retry ? "soul_rate_retry" : "soul_rate";
  const r = host.llm.results[key];
  if (!r) {
    askSoul(host, cfg, cardId, chat ? chat.meta : null, key, { names });
    return { __llmPending: true, stash: { retry, names } };
  }
  if (!retry && r.error && isRateLimit(r)) {
    askSoul(host, cfg, cardId, chat ? chat.meta : null, "soul_rate_retry", { names });
    return { __llmPending: true, stash: { retry: true, names } };
  }
  const card = readCard(fsx, cardId);
  const fresh = draftFromReply(r);
  if (!names) return rateNow(fsx, cardId, card, fresh);
  // rating a few names never spoils the proposal that is there: a failure writes nothing
  if (fresh.error) return ok({ ok: false, error: fresh.error });
  const added = Object.keys(rekeyToCard(card, fresh, fsx, cardId).characters);
  const draft = mergeDraft(readDraft(fsx, cardId), fresh);
  const rekeyed = rekeyToCard(card, draft, fsx, cardId);
  fsx.write(draftPath(cardId), JSON.stringify(rekeyed, null, 2));
  return ok({ ok: true, added, draft: withoutSettled(card, rekeyed) });
}

/**
 * "Rate now": rates only the characters the card has no soul for. A saved soul is
 * re-rated only on request (names). A live proposal is kept and added to; a
 * failure never spoils it.
 */
function rateNow(fsx, cardId, card, fresh) {
  const old = readDraft(fsx, cardId);
  const live = old && !old.error && !old.dismissedAt && Object.keys(old.characters).length ? old : null;
  if (fresh.error) {
    if (live) return ok({ ok: false, error: fresh.error });
    fsx.write(draftPath(cardId), JSON.stringify(fresh, null, 2));
    return ok({ ok: false, draft: fresh });
  }
  const own = cardSoulsOf(card);
  const saved = Object.keys(own);
  const rekeyed = rekeyToCard(card, fresh, fsx, cardId);
  const keyOf = savedKeyResolver(fsx, cardId, own);
  const characters = {};
  for (const [name, soul] of Object.entries(rekeyed.characters)) if (!saved.includes(name)) characters[name] = soul;
  const next = { ...rekeyed, characters };
  if (Array.isArray(rekeyed.minor)) {
    const minor = rekeyed.minor.filter((n) => !keyOf(n));
    if (minor.length) next.minor = minor;
    else delete next.minor;
  }
  const added = Object.keys(characters);
  // nothing new: a live proposal stays as it is (its author, note and time); a card with no souls
  // and no proposal still gets the file, empty or not: its note, minor and cardType, and "rated"
  if (!added.length && (live || saved.length)) return ok({ ok: true, added, draft: visibleDraft(fsx, cardId, card) });
  const merged = mergeDraft(live ? rekeyToCard(card, live, fsx, cardId) : null, next);
  fsx.write(draftPath(cardId), JSON.stringify(merged, null, 2));
  return ok({ ok: true, added, draft: withoutSettled(card, merged) });
}

/** GET returns the proposal of a card; DELETE dismisses it, or removes it once accepted. */
function draftRoute(req, fsx) {
  const q = req.query || {};
  const cardId = String(q.characterId || "");
  if (!CHAT_ID.test(cardId)) return ok({ error: "characterId required" }, 400);
  if (req.method === "GET") {
    return ok({ draft: visibleDraft(fsx, cardId, readCard(fsx, cardId)) });
  }
  const name = str(q.name);
  if (parseBool(q.accepted) === true) {
    if (name) {
      // remove only that name, as the proposal is shown: filed under the card's souls
      const old = readDraft(fsx, cardId);
      if (old && isObj(old.characters)) {
        const card = readCard(fsx, cardId);
        const rekeyed = isObj(card) ? rekeyToCard(card, old, fsx, cardId) : old;
        const low = name.toLowerCase();
        const remaining = {};
        for (const [k, soul] of Object.entries(rekeyed.characters)) if (k.toLowerCase() !== low) remaining[k] = soul;
        if (Object.keys(remaining).length === 0) {
          try {
            fsx.remove(draftPath(cardId));
          } catch {}
        } else {
          fsx.write(draftPath(cardId), JSON.stringify({ ...rekeyed, characters: remaining }, null, 2));
        }
      }
    } else {
      // remove the whole file
      try {
        fsx.remove(draftPath(cardId));
      } catch {}
    }
    return ok({ ok: true });
  }
  const old = readDraft(fsx, cardId) || {};
  const gone = { v: 1, at: old.at || Date.now(), by: old.by || "auto", characters: {}, dismissedAt: Date.now() };
  fsx.write(draftPath(cardId), JSON.stringify(gone, null, 2));
  return ok({ ok: true });
}

/** The cards whose soul proposal waits on the player: not dismissed, with names left or an error. */
function draftsRoute(fsx) {
  let files = [];
  try {
    files = fsx.list(DRAFT_DIR.slice(0, -1)).filter((f) => f.endsWith(".json"));
  } catch {
    return ok({ drafts: [] });
  }
  const drafts = [];
  for (const f of files.slice(0, 500)) {
    const cardId = f.replace(/\.json$/, "");
    if (!CHAT_ID.test(cardId)) continue;
    const card = readCard(fsx, cardId);
    // a proposal left behind by a deleted card has nothing to open: the inbox row would be a blank name
    if (!isObj(card)) continue;
    const draft = visibleDraft(fsx, cardId, card);
    if (!isObj(draft) || draft.dismissedAt) continue;
    const n = isObj(draft.characters) ? Object.keys(draft.characters).length : 0;
    const failed = typeof draft.error === "string" && draft.error !== "";
    if (n === 0 && !failed) continue;
    drafts.push({ characterId: cardId, at: Number(draft.at) || 0, n, failed });
  }
  drafts.sort((a, b) => b.at - a.at);
  return ok({ drafts });
}

const GUEST_CHATS = 30;
const GUEST_MIN_SEEN = 2;

/** Names the sensor saw in this card's chats that have no soul, and every name it saw. */
function guestsRoute(req, fsx) {
  const cardId = String((req.query && req.query.characterId) || "");
  if (!CHAT_ID.test(cardId)) return ok({ error: "characterId required" }, 400);
  const card = readCard(fsx, cardId);
  if (!isObj(card)) return ok({ error: "no such character" }, 404);
  let files = [];
  try {
    files = fsx.list("chats").filter((f) => f.endsWith(".meta.json"));
  } catch {}
  const chats = [];
  for (const f of files) {
    const id = f.replace(/\.meta\.json$/, "");
    const meta = readJson(fsx, "chats/" + f, null);
    if (CHAT_ID.test(id) && isObj(meta) && meta.characterId === cardId && !meta.groupId) chats.push({ id, meta, at: Number(meta.updatedAt) || 0 });
  }
  chats.sort((a, b) => b.at - a.at);
  const counts = new Map();
  const users = new Set();
  const chatLorebookIds = [];
  for (const { id, meta } of chats.slice(0, GUEST_CHATS)) {
    // every name the user had in that chat, a persona switched mid-chat included
    const chat = readChat(fsx, id);
    for (const user of chat ? userNamesOf(fsx, chat) : [userNameOf(fsx, meta)]) if (user !== NO_USER_NAME) users.add(user.toLowerCase());
    if (Array.isArray(meta.lorebookIds)) chatLorebookIds.push(...arr(meta.lorebookIds));
    for (const snap of Object.values(loadState(fsx, id).state.snapshots)) {
      for (const n of arr(isObj(snap) ? snap.present : [])) if (str(n)) counts.set(str(n), (counts.get(str(n)) || 0) + 1);
    }
  }
  const seen = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  const draft = readDraft(fsx, cardId);
  const own = cardSoulsOf(card);
  addProvisional(own, draft);
  const souls = withLorebookAliases(fsx, own, [cardId], chatLorebookIds);
  const minor = [...cardMinorOf(card), ...(draft && Array.isArray(draft.minor) ? draft.minor : [])].map(nameKey).filter(Boolean);
  // one sighting is a passer-by the story named once, not a guest to rate
  const guests = seen.filter((n) => counts.get(n) >= GUEST_MIN_SEEN && !users.has(n.toLowerCase()) && !minor.includes(nameKey(n)) && !soulOf(souls, n));
  return ok({ guests, seen });
}

/** What a soul changes in play, from the same constants the physics reads. */
export function soulEffects(soul, vocab) {
  const out = [];
  if (classOf(soul) === "hostile") out.push({ kind: "hostile" });
  const shy = num(soul.traits ? soul.traits.shyness : undefined);
  if (Number.isFinite(shy) && shy > SHYNESS_BRAKE) out.push({ kind: "brake", trait: "shyness", value: shy, stats: ["trust", "comfort"], cap: 1 });
  for (const [stat, spec] of Object.entries(SPECTRUM_FOR_GAIN)) {
    const x = tilt(soul, spec);
    if (x !== 1) out.push({ kind: "gain", stat, spectrum: spec[0], value: soul.spectra[spec[0]], inverted: spec[1], x });
  }
  const harm = tilt(soul, HARM_SPECTRUM);
  if (harm !== 1) out.push({ kind: "harm", spectrum: HARM_SPECTRUM[0], value: soul.spectra[HARM_SPECTRUM[0]], x: harm });
  const bases = pulseBases(soul);
  if (bases.excitement !== 12) out.push({ kind: "base", stat: "excitement", value: bases.excitement, normal: 12, trait: "curiosity", traitValue: soul.traits.curiosity });
  if (bases.arousal !== 9) out.push({ kind: "base", stat: "arousal", value: bases.arousal, normal: 9 });
  for (const [kind, list] of [["trigger", soul.triggers], ["value", soul.values]]) {
    for (const t of arr(list)) out.push({ kind, cue: t.cue, event: t.event, stat: t.stat, x: t.x, known: !!vocab[t.event] });
  }
  return out;
}

const SERIES_TURNS = 10;

/**
 * What the dashboard UI draws, already settled for the active line: the current
 * snapshot, the one before it (change arrows), and per character the live notes,
 * name, history and the last stats. The UI never filters by src itself.
 */
export function stateView(fsx, chatId, state, keys, cfg) {
  const at = keys.map((k, i) => (state.snapshots[k] ? i : -1)).filter((i) => i >= 0);
  const carried = activeInherit(state);
  if (!at.length && !carried) return null;
  // no snapshot of its own yet: a chat that continues another shows the state it carried
  const idx = at.length ? at[at.length - 1] : -1;
  const key = at.length ? keys[idx] : INHERIT_KEY;
  const snap = at.length ? state.snapshots[key] : carried.snap;
  const before = nearestSnapshot(state, keys, idx);
  const prevSnap = before >= 0 ? state.snapshots[keys[before]] : null;
  const overlay = loadOverlay(fsx, chatId);
  const book = effectiveNotebook(state, keys, overlay);
  const noteItem = ({ id, text, how, from, believes, turn, tag, by, edited }) => ({
    id,
    text,
    how,
    from: from ?? null,
    ...(how === "heard" ? { believes: believes !== false } : {}),
    turn,
    tag: tag ?? null,
    ...(by === "user" ? { by: "user" } : {}),
    ...(edited ? { edited: true } : {}),
  });
  const names = activeNames(state, keys);
  const history = activeHistory(state, keys);
  const saidLive = effectiveSaid(state, keys, overlay);
  const saidGone = removedSaid(state, keys, overlay);
  const saidItem = ({ id, text, kind, hidden, turn, source, edited }) => ({ id, text, kind, hidden: hidden === true, turn, source: source || "chat", ...(edited ? { edited: true } : {}) });
  const chat = readChat(fsx, chatId);
  const souls = chat ? chatCharacters(fsx, chat.meta).souls : {};
  const recent = at.slice(-SERIES_TURNS).map((i) => state.snapshots[keys[i]]);
  const chars = {};
  for (const [name, c] of Object.entries(isObj(snap.chars) ? snap.chars : {})) {
    if (!isObj(c)) continue;
    const p = prevSnap && isObj(prevSnap.chars) ? prevSnap.chars[name] : null;
    const soul = soulOf(souls, name);
    chars[name] = {
      ...c,
      pronouns: soul && soul.pronouns ? soul.pronouns : null,
      rated: !!soul,
      pulseBase: pulseBases(soul),
      prev: isObj(p) ? { stats: p.stats, pulse: p.pulse, hostility: p.hostility ?? null, constellation: p.constellation ?? null } : null,
      notebook: arr(book.live[name]).map(noteItem),
      retired: arr(book.retired[name]).map(noteItem),
      said: arr(saidLive[name]).map(saidItem),
      saidRemoved: arr(saidGone[name]).map(saidItem),
      name: arr(names[name]).slice(-1).map(({ knowsUserName, calls }) => ({ knowsUserName: !!knowsUserName, calls: calls || "" }))[0] || null,
      history: arr(history[name]).map(({ src: _src, ...line }) => line),
      series: recent.filter((s) => isObj(s.chars) && isObj(s.chars[name])).map((s) => ({ turn: s.turn, stats: s.chars[name].stats })),
    };
  }
  const present = arr(snap.present).filter((n) => chars[n]);
  const order = [...present.filter((n) => !chars[n].compact), ...present.filter((n) => chars[n].compact), ...Object.keys(chars).filter((n) => !present.includes(n))];
  let insert = null;
  try {
    const built = buildInsert(fsx, chatId, { op: "send", speakerName: "", targetId: "", userText: "" }, cfg);
    if (built) insert = { tokens: built.tokens, budget: built.budget, trimmed: built.trimmed, saidTokens: built.saidTokens || 0 };
  } catch {}
  return {
    key,
    turn: snap.turn || 0,
    at: snap.at || 0,
    op: snap.op || null,
    partial: !!snap.partial,
    sensorModel: snap.sensorModel || "",
    // fast mode: the state was read from the story reply, not by a sensor call
    fast: !!snap.fast,
    // the newest message has no snapshot yet: the catch-up has not run
    stale: idx !== keys.length - 1,
    clock: isObj(snap.clock) ? snap.clock : null,
    scenes: scenesOf(state, keys),
    present,
    order,
    events: arr(snap.events),
    threads: effectiveThreads(overlay, snap.threads, snap.turn),
    proposals: effectiveProposals(state, overlay, effectiveThreads(overlay, snap.threads, snap.turn)),
    proposalsDropped: Number(state.proposalsDropped) || 0,
    edges: arr(snap.edges),
    chars,
    usage: state.usage,
    lastError: state.lastError,
    keptOut: isObj(state.keptOut) ? state.keptOut : null,
    insert,
    insertEnabled: !(cfg.injection && cfg.injection.enabled === false),
    maxThreads: maxThreadsOf(cfg),
    limits: { main: maxMainOf(cfg), side: maxThreadsOf(cfg), steps: maxStepsOf(cfg), everydayTurns: everydayTurnsOf(cfg), retireAfter: retireAfterOf(cfg) },
    noteAgeTurns: noteAgeOf(cfg),
    saidPerTurn: saidPerTurnOf(cfg),
    mode: cfg.mode,
    // reading only: an expired file is removed by the hook, not here
    nudge: readNudge(fsx, chatId),
  };
}

/**
 * What the Dashboard says about carrying the state of an earlier chat: null when this chat continues
 * nothing. `canSwitch` while the chat has no snapshot of its own (later the choice is made).
 */
function inheritInfo(fsx, chatId, state) {
  const was = isObj(state.inherited) && state.inherited.from ? state.inherited : null;
  const from = was ? was.from : linkedFrom(fsx, chatId);
  if (!from) return null;
  const own = Object.keys(state.snapshots).length > 0;
  return {
    from,
    title: was ? was.title || "" : str((readChat(fsx, from) || { meta: {} }).meta.title),
    on: !!activeInherit(state),
    // the user chose to start clean (an earlier chat with no Dashboard state to carry is neither on nor off)
    off: !!was && was.off === true,
    notes: was ? Number(was.notes) || 0 : 0,
    threads: was ? Number(was.threads) || 0 : 0,
    canSwitch: !own,
    // linked after the chat had read turns of its own: its Dashboard was built without the earlier chat, and can be
    // rebuilt on top of it (the chat is read again, one sensor call; the user's own notes stay)
    canRebase: own && !was && !!endStateOf(fsx, from),
  };
}

/** The view carries the same note, so every layout of the Dashboard can show it without another prop. */
const withInherit = (view, info) => (view && info ? { ...view, inherit: info } : view);

/** POST /dashboard/inherit { chatId, on }: carry the earlier chat's state in, or start clean. Only before the chat has its own snapshot. */
function inheritRoute(req, fsx) {
  const b = isObj(req.body) ? req.body : {};
  const chatId = str(b.chatId);
  if (!CHAT_ID.test(chatId) || !readChat(fsx, chatId)) return ok({ error: "no such chat" }, 400);
  const { state } = loadState(fsx, chatId);
  const own = Object.keys(state.snapshots).length > 0;
  if (own && b.rebase !== true) return ok({ error: "this chat has already started its own Dashboard" }, 409);
  if (own && b.on === false) return ok({ error: "this chat has already started its own Dashboard" }, 409);
  if (b.rebase === true) {
    if (!own) return ok({ error: "nothing to rebuild: the chat has no Dashboard of its own yet" }, 409);
    if (isObj(state.inherited)) return ok({ error: "this chat already took its start from an earlier chat" }, 409);
    const seed = buildInherit(fsx, chatId);
    if (!seed) return ok({ error: "the chat it continues has no Dashboard state to carry" }, 404);
    // the state the chat had is kept once, so a rebuild can be undone by hand
    try {
      fsx.write(REBASE_DIR + chatId + ".json", JSON.stringify(state));
    } catch {}
    // everything the messages produced is dropped and read again on top of the carried state; usage and the user's
    // own notes (dashboard/notes) are not touched
    state.snapshots = {};
    state.places = {};
    state.notebook = {};
    state.names = {};
    state.history = {};
    state.said = {};
    state.counters = { note: 0, thread: 0, said: 0, proposal: 0 };
    state.proposals = [];
    state.keptOut = null;
    state.lastError = null;
    applyInherit(state, seed);
    fsx.write(STATE_DIR + chatId + ".json", JSON.stringify(state, null, 2));
    return ok({ ok: true, rebuilt: true, inherit: inheritInfo(fsx, chatId, state) });
  }
  if (b.on === false) {
    // a chat that never loaded the carried state still remembers where it came from
    if (!isObj(state.inherited)) {
      const seed = buildInherit(fsx, chatId);
      if (seed) applyInherit(state, seed);
    }
    dropInherit(state);
  } else {
    delete state.inherited;
    const seed = buildInherit(fsx, chatId);
    if (!seed) return ok({ error: "the chat it continues has no Dashboard state to carry" }, 404);
    applyInherit(state, seed);
  }
  fsx.write(STATE_DIR + chatId + ".json", JSON.stringify(state, null, 2));
  return ok({ ok: true, inherit: inheritInfo(fsx, chatId, state) });
}

function readState(req, fsx) {
  const chatId = String((req.query && req.query.chatId) || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const { state, existed } = loadStateFor(fsx, chatId);
  const chat = readChat(fsx, chatId);
  const keys = chat ? activeLine(chat.msgs).map((l) => l.key) : [];
  const current = keys.slice().reverse().find((k) => state.snapshots[k]) || null;
  // ?view=1: the settled view only, for the dashboard UI
  if (req.query && (req.query.view === "1" || req.query.view === 1)) {
    return ok({
      exists: existed,
      chat: !!chat,
      messages: keys.length,
      view: existed ? withInherit(stateView(fsx, chatId, state, keys, loadConfig(fsx)), inheritInfo(fsx, chatId, state)) : null,
      inherit: inheritInfo(fsx, chatId, state),
      lastError: existed ? state.lastError : null,
      // a chat with no state yet can still have "Story, move" armed: the composer shows it from here
      nudge: readNudge(fsx, chatId),
    });
  }
  return ok({ state: existed ? state : null, activeKeys: keys, current });
}

function configBody(fsx) {
  const cfg = loadConfig(fsx);
  const sensorParts = SENSOR_PARTS.map((part) => {
    const text = typeof cfg.sensorParts[part.key] === "string" && cfg.sensorParts[part.key].trim() ? cfg.sensorParts[part.key] : DEFAULT_SENSOR_PARTS[part.key];
    return { key: part.key, title: part.title, text, default: DEFAULT_SENSOR_PARTS[part.key], custom: promptKey(text) !== promptKey(DEFAULT_SENSOR_PARTS[part.key]) };
  });
  return {
    ...cfg,
    // the prompt as the sensor gets it (parts joined, or the whole custom prompt)
    sensor: promptOf("sensor", cfg),
    sensorMode: wholeSensorCustom(cfg) ? "whole" : "parts",
    sensorParts,
    // what fast mode adds to every reply, in tokens (the UI hint says "about N")
    fastTokens: fastTokens(cfg, loadVocab(fsx)),
    noteAgeTurns: noteAgeOf(cfg),
    // the other prompts as the calls get them (a stored past default reads as today's default)
    soul: promptOf("soul", cfg),
    nudge: promptOf("nudge", cfg),
    fast: promptOf("fast", cfg),
    custom: customPrompts(fsx),
    events: vocabRows(userEventRows(fsx)),
    deltaKeys: DELTA_KEYS,
    familyList: FAMILIES,
  };
}

const MAX_EVENT_ROWS = 200;

/** One row of PUT /dashboard/events: { id, off: true }, a clean row, or null when invalid. */
function cleanEventRow(e) {
  if (!isObj(e) || !VOCAB_ID.test(String(e.id))) return null;
  if (e.off === true) return e.id === "other" ? null : { id: e.id, off: true };
  if (typeof e.family !== "string" || !VOCAB_FAMILY.test(e.family)) return null;
  const deltas = {};
  if (e.deltas !== undefined) {
    if (!isObj(e.deltas)) return null;
    for (const [k, v] of Object.entries(e.deltas)) {
      if (!DELTA_KEYS.includes(k) || typeof v !== "number" || !Number.isFinite(v)) return null;
      const d = clamp(v, -20, 20);
      if (d !== 0) deltas[k] = d;
    }
  }
  return { id: e.id, family: e.family, meaning: cut(str(e.meaning), 200), deltas };
}

/** Write the user's rows; the file's other top-level keys stay. Nothing is written for no rows and no file. */
function writeEventRows(fsx, rows) {
  const raw = readJson(fsx, EVENTS_FILE, null);
  if (!rows.length && raw === null) return;
  fsx.write(EVENTS_FILE, JSON.stringify({ ...(isObj(raw) ? raw : {}), events: rows }, null, 2));
}

// ---------- route: the user's own notes and threads ----------
const NO_VIEW = (fsx, chatId) => {
  const chat = readChat(fsx, chatId);
  const { state, existed } = loadStateFor(fsx, chatId);
  const keys = chat ? activeLine(chat.msgs).map((l) => l.key) : [];
  return { chat, state, existed, keys };
};

/** The settled view of a chat for the UI, or null when it has no snapshot. */
function viewOf(fsx, chatId) {
  const { state, existed, keys } = NO_VIEW(fsx, chatId);
  return existed ? stateView(fsx, chatId, state, keys, loadConfig(fsx)) : null;
}

/** POST /dashboard/notes { chatId, op, ... }: edits go to the overlay file, never to the state. */
function notesRoute(req, fsx) {
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  const op = str(b.op);
  const { state, existed, keys } = NO_VIEW(fsx, chatId);
  const ov = loadOverlay(fsx, chatId);
  const bad = (msg, status) => ok({ error: msg }, status || 400);
  const tagOf = (v) => (v === null || NOTE_TAGS.includes(v) ? v : undefined);
  const current = keys.slice().reverse().find((k) => state.snapshots[k]) || null;
  const snap = current ? state.snapshots[current] : null;
  const noteId = safeKey(str(b.id)) ? str(b.id) : "";
  const knownNote = () => {
    if (/^u\d+$/.test(noteId)) return Object.values(ov.added).some((l) => arr(l).some((a) => isObj(a) && a.id === noteId));
    // notes and what characters said share the edit overlay: their ids never meet (n..., s..., u...)
    return [state.notebook, state.said].some((bag) => Object.values(bag).some((l) => arr(l).some((n) => isObj(n) && n.id === noteId)));
  };
  const nowThreads = () => effectiveThreads(ov, snap && snap.threads, snap ? snap.turn : 0);
  const isOpenMain = (threads, id) => threads.some((t) => t.id === id && t.status === "open" && !t.parent && questKind(t) === "main");
  let queued = false;
  const editOf = (id) => (isObj(ov.edits[id]) ? { ...ov.edits[id] } : {});
  const putEdit = (id, e) => {
    if (Object.keys(e).length) ov.edits[id] = e;
    else delete ov.edits[id];
  };

  if (op === "add") {
    const name = str(b.name);
    const text = cut(str(b.text), 300);
    if (!text) return bad("text required");
    if (!snap || !ownKey(snap.chars, name) || !isObj(snap.chars[name])) return bad("no such character in the scene state");
    if (b.how !== undefined && !HOW_WORDS.includes(b.how)) return bad("how must be saw, heard or guess");
    if (b.tag !== undefined && tagOf(b.tag) === undefined) return bad("bad tag");
    ov.counter += 1;
    listIn(ov.added, name).push({
      id: "u" + ov.counter,
      text,
      how: b.how || "saw",
      ...(NOTE_TAGS.includes(b.tag) ? { tag: b.tag } : {}),
      at: Date.now(),
      turn: snap.turn || 0,
    });
  } else if (op === "edit") {
    if (!noteId || !knownNote()) return bad("no such note", 404);
    if (b.tag !== undefined && tagOf(b.tag) === undefined) return bad("bad tag");
    const text = b.text === undefined ? undefined : cut(str(b.text), 300);
    if (b.text !== undefined && !text) return bad("text required");
    if (text === undefined && b.tag === undefined) return bad("nothing to change");
    if (noteId.startsWith("u")) {
      // the user's own note is edited in place
      for (const list of Object.values(ov.added)) {
        const a = arr(list).find((x) => isObj(x) && x.id === noteId);
        if (!a) continue;
        if (text !== undefined) a.text = text;
        if (b.tag === null) delete a.tag;
        else if (b.tag !== undefined) a.tag = b.tag;
      }
    } else {
      const e = editOf(noteId);
      if (text !== undefined) e.text = text;
      if (b.tag !== undefined) e.tag = b.tag;
      putEdit(noteId, e);
    }
  } else if (op === "retire" || op === "restore") {
    if (!noteId || !knownNote()) return bad("no such note", 404);
    const e = editOf(noteId);
    if (op === "retire") e.retired = true;
    else delete e.retired;
    putEdit(noteId, e);
  } else if (op === "thread-add") {
    const text = cut(str(b.text), 300);
    if (!text) return bad("text required");
    const kind = b.kind === undefined ? "side" : b.kind;
    if (!THREAD_KINDS.includes(kind)) return bad("kind must be main, side or everyday");
    const parent = b.parent ? str(b.parent) : "";
    const threads = nowThreads();
    if (parent && !isOpenMain(threads, parent)) return bad("parent must be an open main thread");
    ov.counter += 1;
    const at = snap ? snap.turn || 0 : 0;
    if (questRoom(loadConfig(fsx), questCounts(threads), parent ? "side" : kind, parent)) {
      ov.threads.added.push({ id: "ut" + ov.counter, text, at: Date.now(), since: at, kind, ...(parent ? { parent } : {}) });
    } else {
      // a full limit is not a wall: the thread waits among the proposals, and the owner can swap it in
      ov.threads.queued.push({ id: "uq" + ov.counter, text, kind, ...(parent ? { parent } : {}), turn: at });
      queued = true;
    }
  } else if (op === "thread-edit") {
    const id = safeKey(str(b.id)) ? str(b.id) : "";
    const threads = nowThreads();
    const known = !!id && threads.some((t) => t.id === id);
    if (!known) return bad("no such thread", 404);
    const text = b.text === undefined ? undefined : cut(str(b.text), 300);
    if (b.text !== undefined && !text) return bad("text required");
    if (b.status !== undefined && b.status !== "open" && b.status !== "resolved") return bad("status must be open or resolved");
    if (b.kind !== undefined && !THREAD_KINDS.includes(b.kind)) return bad("kind must be main, side or everyday");
    const parent = b.parent === undefined ? undefined : b.parent ? str(b.parent) : null;
    if (parent && (parent === id || !isOpenMain(threads, parent))) return bad("parent must be another open main thread");
    if (text === undefined && b.status === undefined && b.kind === undefined && parent === undefined) return bad("nothing to change");
    const e = isObj(ov.threads.edits[id]) ? { ...ov.threads.edits[id] } : {};
    if (text !== undefined) e.text = text;
    if (b.status !== undefined) e.status = b.status;
    if (b.kind !== undefined) e.kind = b.kind;
    if (parent !== undefined) e.parent = parent;
    ov.threads.edits[id] = e;
  } else if (op === "proposal-accept" || op === "proposal-reject") {
    const id = safeKey(str(b.id)) ? str(b.id) : "";
    const threads = nowThreads();
    const p = effectiveProposals(state, ov, threads).find((x) => x.id === id);
    if (!p) return bad("no such proposal", 404);
    const at = snap ? snap.turn || 0 : 0;
    const settle = () => {
      if (id.startsWith("uq")) ov.threads.queued = ov.threads.queued.filter((q) => !isObj(q) || q.id !== id);
      else ov.threads.dismissed = [...ov.threads.dismissed, id].slice(-200);
    };
    const editOfThread = (tid) => (isObj(ov.threads.edits[tid]) ? { ...ov.threads.edits[tid] } : {});
    if (p.type === "close") {
      // closing is the owner's yes; "keep" asks again only after as many checks as it took to get here
      const e = editOfThread(p.threadId);
      if (op === "proposal-accept") e.status = "resolved";
      else e.keptAt = at;
      ov.threads.edits[p.threadId] = e;
    } else if (op === "proposal-accept") {
      const parent = p.parent && isOpenMain(threads, p.parent) ? p.parent : "";
      const kind = parent ? "side" : p.kind;
      if (!questRoom(loadConfig(fsx), questCounts(threads), kind, parent)) {
        // full: the owner names the open quest this one replaces
        const victim = threads.find((t) => t.id === str(b.replace) && t.status === "open" && (parent ? t.parent === parent : !t.parent && questKind(t) === kind));
        if (!victim) return bad("that kind is full: name an open quest of it to replace", 409);
        ov.threads.edits[victim.id] = { ...editOfThread(victim.id), status: "resolved" };
      }
      ov.counter += 1;
      ov.threads.added.push({ id: "ut" + ov.counter, text: p.text, at: Date.now(), since: at, kind: p.kind, ...(parent ? { parent } : {}), proposed: true });
    }
    settle();
  } else {
    return bad("unknown op");
  }
  saveOverlay(fsx, chatId, ov);
  return ok({ ok: true, ...(queued ? { queued: true } : {}), view: existed ? viewOf(fsx, chatId) : null });
}

function putEvents(req, fsx) {
  const b = isObj(req.body) ? req.body : {};
  const list = arr(b.events);
  const byId = new Map();
  let skipped = 0;
  for (const e of list) {
    const row = cleanEventRow(e);
    if (row) byId.set(row.id, row);
    else skipped++;
  }
  // a row equal to its default is no change
  let rows = [...byId.values()].filter((r) => {
    const d = DEFAULT_VOCAB[r.id];
    return r.off || !d || !sameRow(r, d);
  });
  if (rows.length > MAX_EVENT_ROWS) {
    skipped += rows.length - MAX_EVENT_ROWS;
    rows = rows.slice(0, MAX_EVENT_ROWS);
  }
  writeEventRows(fsx, rows);
  return ok({ ...configBody(fsx), skipped });
}

function putConfig(req, fsx) {
  // the panel editor sends { enabled, values }; direct callers send a flat body
  const b0 = isObj(req.body) ? req.body : {};
  const b = isObj(b0.values) ? { ...b0, ...b0.values } : b0;
  // the panel switch is the mode: off = manual
  if (typeof b0.enabled === "boolean" && b.mode === undefined) b.mode = b0.enabled ? "sensor" : "manual";
  // the panel's one textarea per sensor prompt part
  for (const part of SENSOR_PARTS) {
    const v = b["sensorPart_" + part.key];
    if (typeof v === "string") b.sensorParts = { ...(isObj(b.sensorParts) ? b.sensorParts : {}), [part.key]: v };
  }
  // the panel's flat fields for the prompt insert
  if (b.insert !== undefined || b.insertTokens !== undefined) {
    b.injection = { ...(isObj(b.injection) ? b.injection : {}) };
    if (b.insert !== undefined) b.injection.enabled = b.insert;
    if (b.insertTokens !== undefined) b.injection.maxTokens = b.insertTokens;
  }
  writeConfig(fsx, nextConfig(storedConfig(fsx), b));
  return ok(configBody(fsx));
}

/** POST /dashboard/nudge: arm "Story, move" for the next reply; one pending nudge per chat, arming again replaces it. */
function armNudge(req, fsx) {
  const b = isObj(req.body) ? req.body : {};
  const chatId = String(b.chatId || "");
  if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
  if (!readChat(fsx, chatId)) return ok({ error: "no such chat" }, 404);
  const threadId = typeof b.threadId === "string" && b.threadId ? b.threadId : null;
  // the same threads the view shows: the newest snapshot of the active line, the user's edits applied
  if (threadId && !openThreadsAt(fsx, chatId, { op: "send" }).some((t) => t.id === threadId)) return ok({ error: "thread not open" }, 409);
  const nudge = { threadId, at: Date.now() };
  fsx.write(NUDGE_DIR + chatId + ".json", JSON.stringify({ v: 1, ...nudge }));
  return ok({ ok: true, nudge });
}

export function handleRoute(req, host) {
  const path = String((req && req.path) || "").split("?")[0];
  if (!path.startsWith("/dashboard/")) return null;
  const fsx = host.fs;
  const method = req.method;
  if (path === "/dashboard/update" && method === "POST") return readUpdate(req, host);
  if (path === "/dashboard/soul/rate" && method === "POST") return rateRoute(req, host);
  if (path === "/dashboard/soul-draft" && (method === "GET" || method === "DELETE")) return draftRoute(req, fsx);
  if (path === "/dashboard/soul-drafts" && method === "GET") return draftsRoute(fsx);
  if (path === "/dashboard/guests" && method === "GET") return guestsRoute(req, fsx);
  if (path === "/dashboard/soul/effects" && method === "POST") {
    const b = isObj(req.body) ? req.body : {};
    return ok({ effects: soulEffects(normalizeSoul(b.soul), loadVocab(fsx)) });
  }
  if (path === "/dashboard/state" && method === "GET") return readState(req, fsx);
  if (path === "/dashboard/inherit" && method === "POST") return inheritRoute(req, fsx);
  if (path === "/dashboard/preview" && method === "GET") return previewInsert(req, fsx);
  if (path === "/dashboard/notice" && method === "GET") {
    const chatId = String((req.query && req.query.chatId) || "");
    if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
    return ok({ notice: readJson(fsx, NOTICE_DIR + chatId + ".json", null) });
  }
  if (path === "/dashboard/nudge" && method === "POST") return armNudge(req, fsx);
  if (path === "/dashboard/nudge" && method === "DELETE") {
    const chatId = String((req.query && req.query.chatId) || "");
    if (!CHAT_ID.test(chatId)) return ok({ error: "chatId required" }, 400);
    try {
      fsx.remove(NUDGE_DIR + chatId + ".json");
    } catch {}
    return ok({ ok: true, nudge: null });
  }
  if (path === "/dashboard/config" && method === "GET") return ok(configBody(fsx));
  if (path === "/dashboard/config" && method === "PUT") return putConfig(req, fsx);
  if (path === "/dashboard/events" && method === "PUT") return putEvents(req, fsx);
  if (path === "/dashboard/events" && method === "DELETE") {
    writeEventRows(fsx, []);
    return ok(configBody(fsx));
  }
  // "Restore default prompts" in the panel
  if (path === "/dashboard/config/prompts" && method === "DELETE") {
    const next = { ...storedConfig(fsx) };
    const only = str(req.query && req.query.part);
    const key = str(req.query && req.query.key);
    if (key) {
      // one whole prompt back to its default (soul, nudge, fast; sensor also drops its blocks)
      if (PROMPT_KEYS.includes(key)) delete next[key];
      if (key === "sensor") delete next.sensorParts;
    } else if (only) {
      // one part back to its default
      if (isObj(next.sensorParts)) {
        const sp = { ...next.sensorParts };
        delete sp[only];
        if (Object.keys(sp).length) next.sensorParts = sp;
        else delete next.sensorParts;
      }
    } else {
      for (const key of PROMPT_KEYS) delete next[key];
      delete next.sensorParts;
    }
    writeConfig(fsx, next);
    return ok(configBody(fsx));
  }
  if (path === "/dashboard/notes" && method === "POST") return notesRoute(req, fsx);
  return null;
}
