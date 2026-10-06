/**
 * Relationship dashboard (plugins/relations): the physics with exact numbers,
 * the chat state rules (one snapshot per message key, swipes, notes), the
 * two-phase update route with a scripted sensor, config and prompt handling.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const pluginUrl = new URL("../plugins/relations/plugin.js", import.meta.url).href;
const pluginPath = new URL("../plugins/relations/plugin.js", import.meta.url);
const P = (await import(pluginUrl)) as Record<string, any>;

const CYRILLIC = /[Ѐ-ӿ]/;

// ---------- physics ----------
type Ev = { id: string; weight?: string; from?: string | null; to: string };
const ev = (id: string, weight: string, to: string, from: string | null = "user"): Ev => ({ id, weight, to, ...(from === null ? {} : { from }) });
const zero = () => ({ stats: { trust: 0, comfort: 0, attraction: 0, respect: 0, affection: 0 }, pulse: { excitement: 12, arousal: 9 }, hostility: null as number | null });
const turn = (name: string, prev: any, events: Ev[], soul?: any, cls = "neutral", vocab?: any) => P.applyTurn({ name, prev, soul, cls, events, vocab });

describe("physics", () => {
  it("band and tilt follow the spectrum bands", () => {
    expect([10, 24, 25, 49, 50, 51, 75, 76, 100].map(P.band)).toEqual([0.75, 0.75, 0.9, 0.9, 1, 1.1, 1.1, 1.25, 1.25]);
    expect(P.band(undefined)).toBe(1);
    expect(P.tilt({ spectra: { a: 45 } }, ["a", false])).toBe(0.9);
    expect(P.tilt({ spectra: { a: 40 } }, ["a", true])).toBe(1.1);
    expect(P.tilt(undefined, ["a", false])).toBe(1);
    expect(P.tilt({ spectra: {} }, ["a", true])).toBe(1);
  });

  it("A. Medli, turn 25: the mock example, exactly", () => {
    const soul = {
      class: "ally",
      traits: { shyness: 72, curiosity: 80 },
      spectra: { suspicious_trusting: 45, lawful_rebellious: 40, pessimist_optimist: 65, introvert_extrovert: 30, reserved_emotional: 75, cautious_reckless: 35 },
      triggers: [{ cue: "shouting", event: "raised_voice", stat: "comfort", x: 1.5 }],
      values: [{ cue: "a kept word", event: "kept_promise", stat: "trust", x: 1.5 }],
    };
    const prev = { stats: { trust: -13, comfort: 12, attraction: 6, respect: 61, affection: 24 }, pulse: { excitement: 18, arousal: 9 }, hostility: null };
    const events = [ev("kept_promise", "significant", "Medli"), ev("raised_voice", "routine", "Medli"), ev("novelty", "routine", "Medli", null)];
    const r = turn("Medli", prev, events, soul, "ally");
    expect(r.stats).toEqual({ trust: -12, comfort: 8, attraction: 6, respect: 62, affection: 24 });
    expect(r.pulse).toEqual({ excitement: 30, arousal: 9 });
    expect(r.hostility).toBeNull();
    expect(P.constellationOf(r.stats, "ally").id).toBe("honor_without_trust");
    expect(r.math.events[0]).toEqual(
      expect.arrayContaining(["trust +1 base", "x2 significant", "x1.5 value: a kept word", "x0.9 suspicious_trusting 45", "respect +1 base", "x1.1 lawful_rebellious 40", "halved near the pole"]),
    );
    expect(r.math.events[1]).toEqual(expect.arrayContaining(["comfort -3 base", "x1.5 trigger: shouting", "x0.9 pessimist_optimist 65"]));
    expect(r.math.turn).toContain("shyness 72 > 60: growth capped at +1");
  });

  it("ignores events aimed at someone else or sent by another character", () => {
    const r = turn("Medli", zero(), [ev("compliment", "pivotal", "Isolde"), ev("compliment", "pivotal", "Medli", "Isolde"), ev("compliment", "routine", "Medli")]);
    expect(r.stats.affection).toBe(1);
    expect(r.math.events[0]).toEqual([]);
    expect(r.math.events[1]).toEqual([]);
  });

  it("B. a guest with no soul: promise, kept, betrayal", () => {
    let st = zero();
    let r = turn("Guest", st, [ev("kept_promise", "significant", "Guest")]);
    expect([r.stats.trust, r.stats.respect]).toEqual([2, 2]);
    expect(P.constellationOf(r.stats, "neutral").id).toBe("strangers");
    st = r;
    r = turn("Guest", st, [ev("kept_promise", "pivotal", "Guest")]);
    expect([r.stats.trust, r.stats.respect]).toEqual([6, 6]);
    expect(P.constellationOf(r.stats, "neutral").id).toBe("strangers");
    st = r;
    r = turn("Guest", st, [ev("betrayed_secret", "pivotal", "Guest")]);
    expect([r.stats.trust, r.stats.comfort, r.stats.respect]).toEqual([-6, -8, 6]);
    expect(r.hostility).toBeNull();
    expect([P.tierIndex(st.stats.trust), P.tierIndex(r.stats.trust)]).toEqual([2, 1]);
    expect([P.tierIndex(st.stats.comfort), P.tierIndex(r.stats.comfort)]).toEqual([2, 1]);
    expect(P.constellationOf(r.stats, "neutral").id).toBe("strangers");
    expect(r.math.turn.join("|")).toContain("trust capped at -12 (was -16)");
  });

  it("C. the per-turn cap on a gain", () => {
    const r = turn("Guest", zero(), [ev("compliment", "significant", "Guest"), ev("remembered_detail", "significant", "Guest"), ev("gift", "significant", "Guest")]);
    expect([r.stats.affection, r.stats.attraction, r.stats.comfort]).toEqual([6, 2, 2]);
  });

  it("D. diminishing returns near the pole, harm is never halved", () => {
    const prev = zero();
    prev.stats.affection = 60;
    expect(turn("Guest", prev, [ev("remembered_detail", "routine", "Guest")]).stats.affection).toBe(61);
    const r = turn("Guest", prev, [ev("cold_shoulder", "routine", "Guest")]);
    expect([r.stats.affection, r.stats.comfort]).toEqual([58, -1]);
  });

  it("E. rounding: a real change never rounds to nothing", () => {
    expect(P.roundStep(0.9)).toBe(1);
    expect(P.roundStep(-0.4)).toBe(-1);
    expect(P.roundStep(2.7)).toBe(2);
    expect(P.roundStep(-4.05)).toBe(-4);
    expect(P.roundStep(0)).toBe(0);
    // and through applyTurn, with a custom vocabulary and a soul
    const vocab = P.buildVocab([
      { id: "nudge", family: "warmth", meaning: "x", deltas: { trust: 1 } },
      { id: "sting", family: "conflict", meaning: "x", deltas: { comfort: -0.4 } },
    ]);
    const soul = { spectra: { suspicious_trusting: 45 } };
    const r = turn("Guest", zero(), [ev("nudge", "routine", "Guest"), ev("sting", "routine", "Guest")], soul, "neutral", vocab);
    expect(r.stats.trust).toBe(1);
    expect(r.stats.comfort).toBe(-1);
  });

  it("F. hostility moves only for a hostile class", () => {
    const prev = zero();
    prev.hostility = 10;
    const r = turn("Orc", prev, [ev("insult", "routine", "Orc")], { class: "hostile" }, "hostile");
    expect([r.hostility, r.stats.respect, r.stats.affection]).toEqual([13, -2, -2]);
    const ally = turn("Orc", zero(), [ev("insult", "routine", "Orc")], { class: "ally" }, "ally");
    expect(ally.hostility).toBeNull();
  });

  it("G. pulse decays 5 toward its base, never past it", () => {
    const soul = { traits: { curiosity: 80 } };
    expect(P.pulseBases(soul)).toEqual({ excitement: 18, arousal: 9 });
    expect(P.pulseBases({ pulseBase: { arousal: 4 } })).toEqual({ excitement: 12, arousal: 4 });
    let st: any = { stats: zero().stats, pulse: { excitement: 30, arousal: 9 }, hostility: null };
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      st = turn("Medli", st, [], soul);
      seen.push(st.pulse.excitement);
    }
    expect(seen).toEqual([25, 20, 18, 18]);
    // below the base it climbs back
    expect(turn("Medli", { stats: zero().stats, pulse: { excitement: 3, arousal: 9 }, hostility: null }, [], soul).pulse.excitement).toBe(8);
  });

  it("startChar clamps the start to +-20 and sets hostility only for hostile", () => {
    const s = P.startChar({ start: { trust: 50, respect: -90, affection: 7, hostility: 30 }, traits: { curiosity: 80 } }, "hostile");
    expect(s.stats).toEqual({ trust: 20, comfort: 0, attraction: 0, respect: -20, affection: 7 });
    expect(s.pulse).toEqual({ excitement: 18, arousal: 9 });
    expect(s.hostility).toBe(30);
    expect(P.startChar({ start: { hostility: 30 } }, "ally").hostility).toBeNull();
    expect(P.startChar(undefined, "neutral").stats.trust).toBe(0);
  });

  it("tierIndex edges", () => {
    expect([-100, -51, -50, -1, 0, 50, 51, 100].map(P.tierIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("every constellation has a case, in priority order", () => {
    const S = (o: Record<string, number>) => ({ trust: 0, comfort: 0, attraction: 0, respect: 0, affection: 0, ...o });
    const cases: [string, Record<string, number>, string][] = [
      ["contempt", { respect: -60 }, "ally"],
      ["grudging_respect", { respect: 40 }, "hostile"],
      ["fear", { comfort: -60, respect: 10 }, "ally"],
      ["romance", { attraction: 50, affection: 50, trust: 30 }, "romantic"],
      ["dangerous_pull", { attraction: 60, trust: -5 }, "ally"],
      ["honor_without_trust", { respect: 60, trust: -5 }, "ally"],
      ["loyal", { trust: 60, respect: 50 }, "ally"],
      ["friendship", { trust: 40, comfort: 40, affection: 40 }, "ally"],
      ["outsider", { trust: -40, comfort: -30 }, "neutral"],
      ["strangers", { trust: 15, comfort: -15 }, "neutral"],
      ["unsettled", { trust: 20 }, "neutral"],
    ];
    expect(cases.map((c) => c[0])).toEqual(P.CONSTELLATIONS.map((c: any) => c.id));
    for (const [id, stats, cls] of cases) expect(P.constellationOf(S(stats), cls).id).toBe(id);
    // a hostile class with low respect is not grudging
    expect(P.constellationOf(S({ respect: 20 }), "hostile").id).toBe("unsettled");
  });

  it("tier phrases fill their placeholders", () => {
    expect(P.tierPhrase("trust", -10, { user: "the King" })).toBe("wary; tests the King's words before believing them");
    expect(P.tierPhrase("trust", 80)).toBe("says the uncomfortable thing themself");
    expect(P.tierPhrase("respect", 80, { user: "Ann" })).toBe("defers on what matters; changes their mind when Ann speaks");
    expect(P.pulseBand(19, 9)).toBe("low");
    expect(P.pulseBand(20, 9)).toBe("moderate");
    expect(P.pulseBand(71, 9)).toBe("high");
  });

  it("the clock: time, bands, midnight and continue", () => {
    const start = P.advanceClock(null, { minutes: 30 }, "send");
    expect(start).toEqual({ day: 1, time: null, minutes: 30, band: null, place: null, weather: null });
    const t = P.advanceClock(start, { time: "23:40", minutes: 30, place: "Garden" }, "send");
    expect([t.day, t.time, t.band, t.place]).toEqual([2, "00:10", "night", "Garden"]);
    expect(P.advanceClock(t, { minutes: 900 }, "send").minutes).toBe(720);
    expect(P.advanceClock(t, { minutes: 20 }, "continue")).toMatchObject({ time: "00:10", minutes: 0 });
    const word = P.advanceClock(t, { time: "evening", day: 3 }, "send");
    expect([word.day, word.time, word.band]).toEqual([3, null, "evening"]);
    expect(P.advanceClock(null, { time: "06:00" }, "send").band).toBe("dawn");
    expect(P.advanceClock(null, { time: "11:00" }, "send").band).toBe("late morning");
    expect(P.advanceClock(null, { time: "7:30", minutes: 90 }, "send")).toMatchObject({ time: "09:00", band: "morning" });
  });
});

describe("vocabulary", () => {
  it("has the starter table minus the three derived events, and `other`", () => {
    const v = P.buildVocab([]);
    expect(v.kept_promise.deltas).toEqual({ trust: 1, respect: 1 });
    expect(v.betrayed_secret.deltas).toEqual({ trust: -4, comfort: -2, hostility: 3 });
    expect(v.novelty.family).toBe("knowledge");
    expect(v.other.deltas).toEqual({});
    for (const id of ["learned_about_user", "heard_user_name", "heard_rumor"]) expect(v[id]).toBeUndefined();
    expect(Object.keys(v).length).toBe(35);
  });

  it("a user entry replaces or adds; an invalid one is skipped", () => {
    const v = P.buildVocab([
      { id: "kept_promise", family: "trust", meaning: "mine", deltas: { trust: 5 } },
      { id: "dance", family: "play", meaning: "danced", deltas: { affection: 1 } },
      { id: "bad_delta", family: "trust", meaning: "x", deltas: { luck: 1 } },
      { id: "bad_value", family: "trust", meaning: "x", deltas: { trust: "1" } },
      { id: "Bad Id", family: "trust", deltas: {} },
      "nope",
    ]);
    expect(v.kept_promise.deltas).toEqual({ trust: 5 });
    expect(v.dance.family).toBe("play");
    expect(v.bad_delta).toBeUndefined();
    expect(v.bad_value).toBeUndefined();
    expect(v["Bad Id"]).toBeUndefined();
  });
});

// ---------- source rules ----------
describe("plugin source", () => {
  const src = fs.readFileSync(pluginPath, "utf8");
  it("is English only and does not look like a request hook", () => {
    expect(CYRILLIC.test(src)).toBe(false);
    expect(typeof P.llmRequest).toBe("function");
  });
  it("the sensor prompt has no Cyrillic and names the language", () => {
    const text = P.DEFAULT_PROMPTS.sensor as string;
    expect(text.length).toBeGreaterThan(500);
    expect(CYRILLIC.test(text)).toBe(false);
    expect(text).toContain("language the story is written in");
    expect(text).toContain("New messages");
    expect(text).toContain("Previous state");
  });
});

// ---------- the route, with a scripted sensor ----------
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-"));
  for (const d of ["chats", "characters/aria", "characters/bram", "groups"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  const card = (name: string, soul?: any) => ({ spec: "chara_card_v2", name, extensions: soul ? { molfar_soul: { v: 1, characters: { [name]: soul } } } : {} });
  fs.writeFileSync(path.join(root, "characters/aria/card.json"), JSON.stringify(card("Aria", { class: "ally" })));
  fs.writeFileSync(path.join(root, "characters/bram/card.json"), JSON.stringify(card("Bram")));
  fs.writeFileSync(path.join(root, "groups/g1.json"), JSON.stringify({ memberIds: ["aria", "bram"], mode: "round" }));
  // the stage 1 tests have a card without a soul (Bram): automatic rating is off unless a test turns it on
  fs.mkdirSync(path.join(root, "dashboard"), { recursive: true });
  fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false }));
});
afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {}
});

type Reply = string | { error: string; text?: string };
type Sent = { key: string; req: any };

function mockHost(replies: Reply[] = []) {
  const results: Record<string, unknown> = {};
  const requests: Sent[] = [];
  let pending: Sent[] = [];
  const queue = replies.slice();
  const host = {
    fs: {
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => {
        const full = path.resolve(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: {
      request: (key: string, req: any) => {
        const s = { key, req };
        requests.push(s);
        pending.push(s);
      },
      results,
      embed: () => {},
      embedResults: {},
    },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
  /** Like the engine: only the answers to the last round are visible. */
  const answer = () => {
    for (const k of Object.keys(results)) delete results[k];
    for (const { key } of pending) {
      const next = queue.shift();
      if (next === undefined) throw new Error("no scripted reply left for " + key);
      results[key] =
        typeof next === "string"
          ? { text: next, model: "mock/sensor", usage: { input: 100, output: 20 }, genTimeMs: 42 }
          : { text: next.text ?? "", model: "error", error: next.error, usage: { input: 0, output: 0 } };
    }
    pending = [];
  };
  const push = (...r: Reply[]) => queue.push(...r);
  return { host, requests, answer, push, left: () => queue.length };
}

type RouteOut = { status?: number; json?: any; __llmPending?: boolean; stash?: any };
function drive(mock: ReturnType<typeof mockHost>, req: { method: string; path: string; body?: unknown; query?: Record<string, string> }): RouteOut {
  const call: any = { query: {}, ...req };
  for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as any)[k];
  let out = P.handleRoute(call, mock.host) as RouteOut;
  for (let pass = 0; out?.__llmPending && pass < 3; pass++) {
    if (out.stash) call.stash = out.stash;
    mock.answer();
    out = P.handleRoute(call, mock.host) as RouteOut;
  }
  return out;
}
const update = (mock: ReturnType<typeof mockHost>, chatId: string, op?: string) => drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId, ...(op ? { op } : {}) } });
const getState = (mock: ReturnType<typeof mockHost>, chatId: string) => drive(mock, { method: "GET", path: "/dashboard/state", query: { chatId } }).json;

type Msg = { id: string; role: string; name?: string; text: string; swipe?: number };
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "You", text });
const A = (id: string, text: string): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });
function writeChat(id: string, msgs: Msg[], meta: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ title: "t", characterId: "aria", userName: "You", model: "chat/model", updatedAt: Date.now(), ...meta }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}
const stateFile = (id: string) => path.join(root, "dashboard/state", id + ".json");
const readStateFile = (id: string) => JSON.parse(fs.readFileSync(stateFile(id), "utf8"));
const reply = (o: Record<string, unknown>) => JSON.stringify(o);

const three = () => [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "I kept my promise.")];
const keptPromise = reply({
  present: ["Aria"],
  minutes: 10,
  place: "Hall",
  events: [{ id: "kept_promise", weight: "significant", from: "user", to: "Aria", quote: "I kept my promise." }],
  chars: { Aria: { mood: "relieved", holding: "a key" } },
  learned: [{ who: "Aria", text: "The user keeps their word", how: "saw" }],
  threads: { open: [{ id: null, text: "Who has the key?" }] },
});

describe("update route", () => {
  it("an event of a family switched off counts as other and moves nothing", () => {
    writeChat("c1", three());
    fs.mkdirSync(path.join(root, "dashboard"), { recursive: true });
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ families: { trust: false } }));
    const mock = mockHost([keptPromise]);
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(mock.requests[0].req.systemPrompt).not.toContain("kept_promise");
    const s1 = readStateFile("c1").snapshots["m3#0"];
    expect(s1.events[0].id).toBe("other");
    expect(s1.chars.Aria.stats).toMatchObject({ trust: 0, respect: 0 });
  });

  it("a reply cut off mid-way keeps its complete fields and marks the snapshot partial", () => {
    const cut = '{"present": ["Aria", "Bram"], "minutes": 10, "events": [{"id": "compliment", "weight": "routine", "from": "user", "to": "Aria", "quote": "Well done"}, {"id": "gave_order", "weight": "routine", "from": "user", "to": "Aria", "quote": "Go!"}], "chars": {"Aria": {"mood": "inspired", "holding": "a spear"}, "Bram": {"mood';
    const parsed = P.parseSensorText(cut);
    expect(parsed.__partial).toBe(true);
    expect(parsed.events.length).toBe(2);
    expect(parsed.chars.Aria).toEqual({ mood: "inspired", holding: "a spear" });
    expect(P.parseSensorText('{"present": ["Ari')).toBeNull();
    writeChat("c1", three());
    const mock = mockHost([cut]);
    expect(update(mock, "c1").json.ok).toBe(true);
    const s1 = readStateFile("c1").snapshots["m3#0"];
    expect(s1.partial).toBe(true);
    expect(s1.chars.Aria.stats).toMatchObject({ attraction: 1, affection: 1, respect: 1, comfort: -1 });
  });

  it("a character with no history is one short line for the sensor", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Bram"], minutes: 1 })]);
    update(mock, "c1");
    writeChat("c1", [...three(), A("m4", "Hm."), U("m5", "Bye.")]);
    mock.push(reply({ present: ["Bram"] }));
    update(mock, "c1");
    expect(mock.requests.at(-1)!.req.messages[0].content).toContain("Bram toward You: no history yet.");
  });

  it("an explicit empty present list means alone; a report without the key falls back to the card", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: [], minutes: 5 })]);
    update(mock, "c1");
    expect(readStateFile("c1").snapshots["m3#0"].present).toEqual([]);
    expect(mock.requests[0].req.messages[0].content).toContain("Aria (ally)");
    writeChat("c2", three());
    mock.push(reply({ minutes: 5 }));
    update(mock, "c2");
    expect(readStateFile("c2").snapshots["m3#0"].present).toEqual(["Aria"]);
    // a card with no soul may be a narrator: the sensor is told so
    writeChat("c3", three(), { characterId: "bram" });
    mock.push(reply({ present: [] }));
    update(mock, "c3");
    expect(mock.requests.at(-1)!.req.messages[0].content).toContain("Bram (the card: a character, or a narrator who is no person in the scene)");
  });

  it("writes nothing on pass A", () => {
    writeChat("c1", three());
    const mock = mockHost();
    const out = P.handleRoute({ method: "POST", path: "/dashboard/update", query: {}, body: { chatId: "c1" } }, mock.host);
    expect(out.__llmPending).toBe(true);
    expect(mock.requests.length).toBe(1);
    expect(fs.readdirSync(path.join(root, "dashboard"))).toEqual(["config.json"]);
    expect(fs.existsSync(path.join(root, "_debug"))).toBe(false);
  });

  it("a 3-message chat gets turn 1; the same call again changes nothing; a new message gets turn 2 from turn 1", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    const r1 = update(mock, "c1");
    expect(r1.json.ok).toBe(true);
    const st = readStateFile("c1");
    expect(Object.keys(st.snapshots)).toEqual(["m3#0"]);
    const s1 = st.snapshots["m3#0"];
    expect(s1.turn).toBe(1);
    expect(s1.chars.Aria.stats).toMatchObject({ trust: 2, respect: 2 });
    expect(s1.chars.Aria.mood).toBe("relieved");
    expect(s1.chars.Aria.constellation).toBe("strangers");
    expect(s1.clock).toMatchObject({ day: 1, minutes: 10, place: "Hall" });
    expect(s1.events[0]).toMatchObject({ id: "kept_promise", family: "trust", weight: "significant", from: "user", to: "Aria" });
    expect(s1.events[0].math).toContain("x2 significant");
    expect(s1.threads).toEqual([{ id: "t1", text: "Who has the key?", since: 1, status: "open" }]);
    expect(st.notebook.Aria[0]).toMatchObject({ id: "n1", how: "saw", src: "m3#0", turn: 1 });
    expect(st.usage).toEqual({ calls: 1, inTokens: 100, outTokens: 20, lastMs: 42 });
    expect(st.lastError).toBeNull();
    expect(st.history.Aria).toBeUndefined();

    const before = fs.readFileSync(stateFile("c1"), "utf8");
    const again = update(mock, "c1");
    expect(again.json.unchanged).toBe(true);
    expect(mock.requests.length).toBe(1);
    expect(fs.readFileSync(stateFile("c1"), "utf8")).toBe(before);

    writeChat("c1", [...three(), A("m4", "Thank you."), U("m5", "You are welcome.")]);
    mock.push(reply({ events: [{ id: "compliment", weight: "routine", from: "user", to: "Aria" }], minutes: 5 }));
    const r2 = update(mock, "c1");
    expect(r2.json.ok).toBe(true);
    const s2 = readStateFile("c1").snapshots["m5#0"];
    expect(s2.turn).toBe(2);
    expect(s2.chars.Aria.stats).toMatchObject({ trust: 2, respect: 2, affection: 1, attraction: 1 });
    expect(s2.chars.Aria.mood).toBe("relieved");
    expect(s2.chars.Aria.holding).toBe("a key");
    expect(s2.clock.place).toBe("Hall");
    expect(s2.threads.map((t: any) => t.id)).toEqual(["t1"]);
    // only the messages after the base went to the sensor
    const asked = mock.requests[1]!.req.messages[0].content as string;
    expect(asked).toContain("New messages\n[Aria] Thank you.\n[user] You are welcome.");
    expect(asked).not.toContain("Welcome.\n[user] I kept");
    expect(asked).toContain("Previous state\nDay 1.");
    expect(asked).toContain("Notebook of Aria\nn1 saw: The user keeps their word");
  });

  it("the first sensor call: model, system prompt, sections", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    update(mock, "c1");
    const { req } = mock.requests[0]!;
    expect(req.model).toBe("chat/model");
    expect(req.presetParams).toEqual({ temperature: 0.2, max_tokens: 3000 });
    expect(req.systemPrompt.startsWith(P.DEFAULT_PROMPTS.sensor)).toBe(true);
    expect(req.systemPrompt).toContain("\n\nEvent vocabulary\ntrust: kept_promise - did what was promised;");
    expect(req.systemPrompt).toContain("knowledge: novelty - something new or surprising; danger - danger in the scene\nother: anything else");
    expect(req.systemPrompt).not.toContain("learned_about_user");
    expect(req.systemPrompt).toContain("\n\nOutput shape\n{ \"present\"");
    expect(req.systemPrompt).toContain("\"open\": [ { \"id\": \"t1 or null\"");
    expect(req.systemPrompt.endsWith("Leave out any key the new messages give nothing for.")).toBe(true);
    const user = req.messages[0].content as string;
    expect(user.startsWith("Characters\nuser: You. Aria (ally).\n\nPrevious state\n(none: this is the start)\nOpen thread limit: 3.\n\nNew messages\n[user] Hello.")).toBe(true);
    expect(CYRILLIC.test(req.systemPrompt)).toBe(false);
  });

  it("a switched-off family leaves the vocabulary; the sensor model setting wins over the chat's", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { sensorModel: "free/small", families: { body: false } } });
    update(mock, "c1");
    const { req } = mock.requests[0]!;
    expect(req.model).toBe("free/small");
    expect(req.systemPrompt).not.toContain("body: ");
    expect(req.systemPrompt).not.toContain("gentle_touch");
    expect(req.systemPrompt).toContain("conflict: raised_voice");
  });

  it("a swipe is computed from the snapshot before that message, and its notes go inactive", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    update(mock, "c1");
    writeChat("c1", [...three(), A("m4", "Thank you.")]);
    mock.push(reply({ events: [{ id: "compliment", weight: "routine", from: "user", to: "Aria" }], learned: [{ who: "Aria", text: "The user is kind", how: "saw" }] }));
    update(mock, "c1");
    const mid = readStateFile("c1");
    expect(mid.snapshots["m4#0"].turn).toBe(2);
    expect(mid.snapshots["m4#0"].chars.Aria.stats.affection).toBe(1);

    // the user swipes the last message
    writeChat("c1", [...three(), { ...A("m4", "You are welcome."), swipe: 1 }]);
    mock.push(reply({ events: [{ id: "gift", weight: "routine", from: "user", to: "Aria" }] }));
    update(mock, "c1");
    const st = readStateFile("c1");
    expect(Object.keys(st.snapshots).sort()).toEqual(["m3#0", "m4#0", "m4#1"]);
    const swiped = st.snapshots["m4#1"];
    expect(swiped.turn).toBe(2);
    // from m3#0 (affection 0), not from the discarded m4#0 (affection 1)
    expect(swiped.chars.Aria.stats).toMatchObject({ trust: 2, affection: 1, comfort: 1, attraction: 0 });
    // the note written under the discarded swipe does not count on the new line
    const keys = ["m1#0", "m2#0", "m3#0", "m4#1"];
    expect(P.activeNotebook(st, keys).Aria.map((n: any) => n.id)).toEqual(["n1"]);
    expect(st.notebook.Aria.map((n: any) => n.id)).toEqual(["n1", "n2"]);
    expect(P.activeNotebook(st, [...keys.slice(0, 3), "m4#0"]).Aria.map((n: any) => n.id)).toEqual(["n1", "n2"]);
    // GET state names the current key and the active keys
    const got = getState(mock, "c1");
    expect(got.current).toBe("m4#1");
    expect(got.activeKeys).toEqual(keys);
  });

  it("the UI view is settled for the active line: previous stats, live notes, series, stale", () => {
    const view = (id: string) => drive(mockHostShared, { method: "GET", path: "/dashboard/state", query: { chatId: id, view: "1" } }).json;
    const mockHostShared = mockHost([keptPromise]);
    expect(view("c1")).toEqual({ exists: false, chat: false, messages: 0, view: null, lastError: null });
    writeChat("c1", three());
    update(mockHostShared, "c1");
    writeChat("c1", [...three(), A("m4", "Thank you.")]);
    mockHostShared.push(reply({ events: [{ id: "compliment", weight: "routine", from: "user", to: "Aria" }], learned: [{ who: "Aria", text: "The user is kind", how: "saw" }] }));
    update(mockHostShared, "c1");
    writeChat("c1", [...three(), { ...A("m4", "You are welcome."), swipe: 1 }]);
    // the swipe has no snapshot yet: the view stands on m3#0 and says it is stale
    const stale = view("c1");
    expect(stale.messages).toBe(4);
    expect(stale.view.key).toBe("m3#0");
    expect(stale.view.stale).toBe(true);
    expect(stale.view.chars.Aria.prev).toBeNull();
    expect(stale.view.chars.Aria.notebook.map((n: any) => n.text)).toEqual(["The user keeps their word"]);
    mockHostShared.push(reply({ events: [{ id: "gift", weight: "routine", from: "user", to: "Aria" }] }));
    update(mockHostShared, "c1");
    const v = view("c1").view;
    expect(v.key).toBe("m4#1");
    expect(v.stale).toBe(false);
    expect(v.turn).toBe(2);
    expect(v.order).toEqual(["Aria"]);
    const aria = v.chars.Aria;
    expect(aria.prev.stats).toEqual(readStateFile("c1").snapshots["m3#0"].chars.Aria.stats);
    expect(aria.series.map((s: any) => s.turn)).toEqual([1, 2]);
    // the note of the discarded swipe is not in the view, and no src leaks out
    expect(aria.notebook).toEqual([{ id: "n1", text: "The user keeps their word", how: "saw", from: null, turn: 1, tag: null }]);
    expect(aria.retired).toEqual([]);
    expect(v.maxThreads).toBe(3);
    expect(JSON.stringify(v)).not.toContain('"src"');
    expect(aria.pulseBase).toEqual({ excitement: 12, arousal: 9 });
    expect(typeof aria.rated).toBe("boolean");
    expect(v.threads[0]).toMatchObject({ text: "Who has the key?", status: "open" });
    expect(v.insert).toMatchObject({ tokens: expect.any(Number), budget: expect.any(Number) });
    expect(v.insertEnabled).toBe(true);
  });

  it("a sensor error sets lastError and changes nothing else", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    update(mock, "c1");
    const before = readStateFile("c1");
    writeChat("c1", [...three(), A("m4", "Thanks.")]);
    mock.push({ error: "model unavailable" });
    const r = update(mock, "c1");
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(false);
    expect(r.json.error).toBe("model unavailable");
    const after = readStateFile("c1");
    expect(after.lastError.message).toBe("model unavailable");
    expect(after.snapshots).toEqual(before.snapshots);
    expect(after.notebook).toEqual(before.notebook);
    expect(after.usage).toEqual(before.usage);
    // an empty reply is an error too
    mock.push("   ");
    expect((update(mock, "c1").json as any).ok).toBe(false);
    expect(readStateFile("c1").snapshots).toEqual(before.snapshots);
  });

  it("a reply that is not JSON is an error and keeps the old state", () => {
    writeChat("c1", three());
    const mock = mockHost(["I am sorry, I cannot help with that."]);
    const r = update(mock, "c1");
    expect(r.json.ok).toBe(false);
    expect(r.json.error).toBe("sensor reply was not JSON");
    const st = readStateFile("c1");
    expect(st.snapshots).toEqual({});
    expect(st.lastError.message).toBe("sensor reply was not JSON");
    // a reply cut off before it closes is not JSON either
    mock.push('{"events": [{"id": "gift"');
    expect(update(mock, "c1").json.ok).toBe(false);
  });

  it("a fenced reply with a trailing comma parses", () => {
    writeChat("c1", three());
    const fenced = 'Here you go:\n```json\n{\n  "events": [ { "id": "compliment", "weight": "routine", "from": "user", "to": "Aria", }, ],\n  "present": ["Aria",],\n  "place": "a, b, }",\n}\n```\nDone.';
    const mock = mockHost([fenced]);
    const r = update(mock, "c1");
    expect(r.json.ok).toBe(true);
    const s = readStateFile("c1").snapshots["m3#0"];
    expect(s.chars.Aria.stats.affection).toBe(1);
    expect(s.clock.place).toBe("a, b, }");
  });

  it("a rate-limited sensor is asked once more", () => {
    writeChat("c1", three());
    const mock = mockHost([{ error: "HTTP 429 rate limited" }, keptPromise]);
    const r = update(mock, "c1");
    expect(r.json.ok).toBe(true);
    expect(mock.requests.map((x) => x.key)).toEqual(["sensor", "sensor_retry"]);
    // and only once
    writeChat("c1", [...three(), A("m4", "Hm.")]);
    const again = mockHost([{ error: "429" }, { error: "429" }]);
    const r2 = update(again, "c1");
    expect(r2.json.ok).toBe(false);
    expect(again.requests.length).toBe(2);
  });

  it("unknown event ids become `other`, odd weights routine, quotes are cut; events to strangers change nothing", () => {
    writeChat("c1", three());
    const quote = "q".repeat(500);
    const mock = mockHost([
      reply({
        present: ["Aria"],
        events: [
          { id: "teleported", weight: "huge", from: "user", to: "aria", quote },
          { id: "kept_promise", weight: "pivotal", from: "user", to: "Nobody" },
        ],
      }),
    ]);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { debug: true } });
    update(mock, "c1");
    const s = readStateFile("c1").snapshots["m3#0"];
    expect(s.events[0]).toMatchObject({ id: "other", family: "other", weight: "routine", to: "Aria" });
    expect(s.events[0].quote.length).toBe(200);
    expect(s.events[1]).toMatchObject({ id: "kept_promise", to: "Nobody" });
    expect(s.chars.Nobody).toBeUndefined();
    expect(s.chars.Aria.stats.trust).toBe(0);
    const dbg = JSON.parse(fs.readFileSync(path.join(root, "_debug/dashboard.json"), "utf8"));
    expect(dbg.unknownEvents).toEqual(["teleported"]);
    expect(dbg.raw).toContain("teleported");
    expect(dbg.input).toContain("New messages");
  });

  it("heard with no teller means the user told them", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], learned: [{ who: "Aria", text: "The user was born by the sea", how: "heard", from: null }] })]);
    update(mock, "c1");
    expect(readStateFile("c1").notebook.Aria[0]).toMatchObject({ how: "heard", from: "user", believes: true });
  });

  it("knowledge guard: an absent character learns nothing; told copies as heard; retire hides until its key is gone", () => {
    writeChat("g", three(), { characterId: undefined, groupId: "g1" });
    const mock = mockHost([
      reply({
        present: ["Aria"],
        learned: [
          { who: "Bram", text: "The user has a key", how: "saw" },
          { who: "Aria", text: "The user has a key", how: "saw" },
          { who: "Aria", text: "The mayor lies", how: "heard", from: "Cob" },
        ],
      }),
    ]);
    update(mock, "g");
    let st = readStateFile("g");
    expect(st.notebook.Bram).toBeUndefined();
    expect(st.notebook.Aria.map((n: any) => [n.id, n.how, n.from, n.believes ?? null])).toEqual([
      ["n1", "saw", null, null],
      ["n2", "heard", "Cob", true],
    ]);
    expect(st.snapshots["m3#0"].present).toEqual(["Aria"]);

    writeChat("g", [...three(), A("m4", "Bram walks in."), U("m5", "Hi Bram.")], { characterId: undefined, groupId: "g1" });
    mock.push(
      reply({
        present: ["Aria", "Bram"],
        told: [
          { from: "Aria", to: "Bram", note: "n1" },
          { from: "Aria", to: "Ghost", note: "n1" },
          { from: "Bram", to: "Aria", note: "n1" },
        ],
        retire: ["n2"],
        names: [{ who: "Bram", heardUserName: true, calls: "Your Grace" }],
      }),
    );
    update(mock, "g");
    st = readStateFile("g");
    expect(st.notebook.Bram).toEqual([{ id: "n3", text: "The user has a key", how: "heard", from: "Aria", believes: true, turn: 2, src: "m5#0", weight: "everyday" }]);
    expect(st.notebook.Aria.find((n: any) => n.id === "n2").retiredBy).toBe("m5#0");
    const keys = ["m1#0", "m2#0", "m3#0", "m4#0", "m5#0"];
    expect(P.activeNotebook(st, keys).Aria.map((n: any) => n.id)).toEqual(["n1"]);
    // the retiring message is swiped away: the note lives again
    expect(P.activeNotebook(st, [...keys.slice(0, 4), "m5#1"]).Aria.map((n: any) => n.id)).toEqual(["n1", "n2"]);
    expect(P.activeNames(st, keys).Bram).toEqual([{ knowsUserName: true, calls: "Your Grace", turn: 2, src: "m5#0" }]);
    expect(P.activeNames(st, keys.slice(0, 4)).Bram).toBeUndefined();
    // a character without a soul is an undefined guest, class neutral
    expect(st.snapshots["m5#0"].chars.Bram.cls).toBe("neutral");
    expect(st.snapshots["m5#0"].chars.Aria.cls).toBe("ally");
  });

  it("history lines: a tier crossing and a constellation change, under the message key", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ events: [{ id: "betrayed_secret", weight: "pivotal", from: "user", to: "Aria" }], present: ["Aria"] })]);
    update(mock, "c1");
    const st = readStateFile("c1");
    const lines = st.history.Aria as any[];
    expect(lines).toEqual(
      expect.arrayContaining([
        { turn: 1, kind: "tier", stat: "trust", from: 2, to: 1, src: "m3#0" },
        { turn: 1, kind: "tier", stat: "comfort", from: 2, to: 1, src: "m3#0" },
      ]),
    );
    expect(st.snapshots["m3#0"].chars.Aria.constellation).toBe("strangers");
    expect(P.activeHistory(st, ["m3#0"]).Aria.length).toBe(lines.length);
    expect(P.activeHistory(st, ["m3#1"]).Aria).toBeUndefined();
  });

  it("threads: three at most, none dropped for a new one, resolved ones close", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ threads: { open: ["one", "two", { id: null, text: "three" }, "four"] } })]);
    update(mock, "c1");
    let t = readStateFile("c1").snapshots["m3#0"].threads;
    expect(t.map((x: any) => [x.id, x.text])).toEqual([["t1", "one"], ["t2", "two"], ["t3", "three"]]);
    writeChat("c1", [...three(), A("m4", "Go on.")]);
    mock.push(reply({ threads: { open: [{ id: "t2", text: "two, reworded" }, { id: null, text: "five" }], resolved: ["t1"] } }));
    update(mock, "c1");
    t = readStateFile("c1").snapshots["m4#0"].threads;
    expect(t.map((x: any) => [x.id, x.text, x.status])).toEqual([
      ["t1", "one", "resolved"],
      ["t2", "two, reworded", "open"],
      ["t3", "three", "open"],
      ["t4", "five", "open"],
    ]);
    // the resolved one is gone next turn, and a thread nobody mentions stays open
    writeChat("c1", [...three(), A("m4", "Go on."), U("m5", "Hm.")]);
    mock.push(reply({}));
    update(mock, "c1");
    t = readStateFile("c1").snapshots["m5#0"].threads;
    expect(t.map((x: any) => x.id)).toEqual(["t2", "t3", "t4"]);
  });

  it("only the newest 40 snapshots are kept, and unknown keys survive a rewrite", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    update(mock, "c1");
    const st = readStateFile("c1");
    st.future = { keep: "me" };
    st.snapshots["m3#0"].custom = 7;
    for (let i = 0; i < 44; i++) st.snapshots["old" + i + "#0"] = { turn: 0, at: 1000 + i, chars: {}, present: [] };
    fs.writeFileSync(stateFile("c1"), JSON.stringify(st));
    writeChat("c1", [...three(), A("m4", "More.")]);
    mock.push(reply({}));
    update(mock, "c1");
    const after = readStateFile("c1");
    expect(Object.keys(after.snapshots).length).toBe(40);
    expect(after.snapshots["m4#0"]).toBeDefined();
    expect(after.snapshots["m3#0"].custom).toBe(7);
    expect(after.snapshots.old0).toBeUndefined();
    expect(after.future).toEqual({ keep: "me" });
  });

  it("answers 404 for a missing chat, 400 without an id, and nothing for other paths", () => {
    const mock = mockHost();
    expect(update(mock, "nope").status).toBe(404);
    expect(drive(mock, { method: "POST", path: "/dashboard/update", body: {} }).status).toBe(400);
    expect(drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId: "../x" } }).status).toBe(400);
    expect(P.handleRoute({ method: "GET", path: "/chats", query: {} }, mock.host)).toBeNull();
    expect(P.handleRoute({ method: "GET", path: "/dashboard/nothing", query: {} }, mock.host)).toBeNull();
    expect(drive(mock, { method: "GET", path: "/dashboard/state", query: { chatId: "nope" } }).json).toEqual({ state: null, activeKeys: [], current: null });
  });

  it("a chat with no messages, or no text in the new ones, is left alone", () => {
    writeChat("c1", []);
    const mock = mockHost();
    expect(update(mock, "c1").json).toMatchObject({ ok: true, unchanged: true });
    writeChat("c2", [{ id: "e1", role: "char", name: "Aria", text: "  " }]);
    expect(update(mock, "c2").json.unchanged).toBe(true);
    expect(mock.requests.length).toBe(0);
    expect(fs.readdirSync(path.join(root, "dashboard"))).toEqual(["config.json"]);
  });

  it("a long message is cut in the middle, the whole input to its last 8000 characters", () => {
    const long = `${"a".repeat(1000)}MIDDLE${"b".repeat(3000)}`;
    writeChat("c1", [U("m1", long), A("m2", "ok")]);
    const mock = mockHost([reply({})]);
    update(mock, "c1");
    const user = mock.requests[0]!.req.messages[0].content as string;
    const body = user.slice(user.indexOf("New messages\n"));
    expect(body).toContain("…");
    expect(body).not.toContain("MIDDLE");
    expect(body.length).toBeLessThan(1700);
    const many = Array.from({ length: 20 }, (_, i) => U("x" + i, `${i}`.padEnd(1000, "z")));
    writeChat("c2", many);
    const m2 = mockHost([reply({})]);
    update(m2, "c2");
    const u2 = m2.requests[0]!.req.messages[0].content as string;
    expect(u2.slice(u2.indexOf("New messages\n") + 13).length).toBeLessThanOrEqual(8000);
    expect(u2).toContain("[user] 19zzz");
    expect(u2).not.toContain("[user] 0zzz");
  });

  it("a user event vocabulary reaches the sensor and the physics", () => {
    fs.mkdirSync(path.join(root, "dashboard"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "dashboard/events.json"),
      JSON.stringify({ events: [{ id: "danced", family: "play", meaning: "danced with them", deltas: { affection: 3 } }, { id: "kept_promise", family: "trust", meaning: "kept a vow", deltas: { trust: 3 } }, { id: "broken", family: "trust", deltas: { nope: 1 } }] }),
    );
    writeChat("c1", three());
    const mock = mockHost([reply({ events: [{ id: "danced", weight: "routine", from: "user", to: "Aria" }, { id: "kept_promise", weight: "routine", from: "user", to: "Aria" }] })]);
    update(mock, "c1");
    expect(mock.requests[0]!.req.systemPrompt).toContain("play: danced");
    expect(mock.requests[0]!.req.systemPrompt).toContain("kept_promise - kept a vow");
    const s = readStateFile("c1").snapshots["m3#0"];
    expect(s.chars.Aria.stats).toMatchObject({ affection: 3, trust: 3, respect: 0 });
    expect(s.events.map((e: any) => e.id)).toEqual(["danced", "kept_promise"]);
    const cfg = drive(mock, { method: "GET", path: "/dashboard/config" }).json;
    expect(cfg.events.find((e: any) => e.id === "danced").family).toBe("play");
    expect(cfg.events.find((e: any) => e.id === "broken")).toBeUndefined();
  });

  it("more than four present: the first four are full, the rest compact", () => {
    writeChat("c1", three());
    const names = ["Aria", "Bo", "Cy", "Di", "Ed", "Flo"];
    const mock = mockHost([reply({ present: names, events: [{ id: "compliment", weight: "routine", from: "user", to: "Flo" }] })]);
    update(mock, "c1");
    const c = readStateFile("c1").snapshots["m3#0"].chars;
    // Flo is named in the events, so she leads; then the old order
    expect(names.map((n) => c[n].compact)).toEqual([false, false, false, true, true, false]);
    expect(Object.keys(c).sort()).toEqual([...names].sort());
  });

  it("absent characters keep their numbers and are compact", () => {
    writeChat("g", three(), { characterId: undefined, groupId: "g1" });
    const mock = mockHost([reply({ present: ["Aria", "Bram"], events: [{ id: "kept_promise", weight: "routine", from: "user", to: "Bram" }] })]);
    update(mock, "g");
    writeChat("g", [...three(), A("m4", "Bram left.")], { characterId: undefined, groupId: "g1" });
    mock.push(reply({ present: ["Aria", "Bram"], struck: ["Bram"], events: [{ id: "compliment", weight: "routine", from: "user", to: "Aria" }] }));
    update(mock, "g");
    const s = readStateFile("g").snapshots["m4#0"];
    expect(s.present).toEqual(["Aria"]);
    expect(s.chars.Bram.compact).toBe(true);
    expect(s.chars.Bram.stats).toMatchObject({ trust: 1, respect: 1 });
    expect(s.chars.Aria.compact).toBe(false);
  });
});

// ---------- config ----------
describe("config", () => {
  // these tests look at what config.json holds: start without the fixture's file
  beforeEach(() => fs.rmSync(path.join(root, "dashboard"), { recursive: true, force: true }));
  const config = (mock: ReturnType<typeof mockHost>) => drive(mock, { method: "GET", path: "/dashboard/config" }).json;
  const stored = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8"));
    } catch {
      return null;
    }
  };

  it("GET returns the defaults, the prompt and the vocabulary", () => {
    const c = config(mockHost());
    expect(c).toMatchObject({ sensorModel: "", mode: "sensor", catchUp: true, debug: false, injection: { enabled: true, maxTokens: 300 }, custom: [] });
    expect(c.families.body).toBe(true);
    expect(c.sensor).toBe(P.DEFAULT_PROMPTS.sensor);
    expect(c.events.length).toBe(35);
  });

  it("PUT of the default prompt (or whitespace changes of it) stores nothing", () => {
    const mock = mockHost();
    const put = (body: unknown) => drive(mock, { method: "PUT", path: "/dashboard/config", body });
    put({ sensor: P.DEFAULT_PROMPTS.sensor });
    expect(stored()).toBeNull();
    put({ sensor: `${P.DEFAULT_PROMPTS.sensor.replace(/ /g, "  ")}\n\n` });
    expect(stored()).toBeNull();
    // every default value is a no-op too
    put({ sensorModel: "", mode: "sensor", catchUp: "on", debug: false, families: { trust: true }, injection: { enabled: true, maxTokens: 300 } });
    expect(stored()).toBeNull();
    const r = put({ sensor: "My own prompt." });
    expect(r.json.custom).toEqual(["sensor"]);
    expect(stored()).toEqual({ sensor: "My own prompt." });
    expect(config(mock).sensor).toBe("My own prompt.");
    // saving the default again drops the custom copy
    put({ sensor: P.DEFAULT_PROMPTS.sensor });
    expect(stored()).toEqual({});
    expect(config(mock).custom).toEqual([]);
  });

  it("DELETE restores the default prompt and keeps the other settings", () => {
    const mock = mockHost();
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { sensor: "Mine.", sensorModel: "a/b", mode: "manual" } });
    expect(stored()).toEqual({ sensor: "Mine.", sensorModel: "a/b", mode: "manual" });
    const r = drive(mock, { method: "DELETE", path: "/dashboard/config/prompts" });
    expect(r.json.sensor).toBe(P.DEFAULT_PROMPTS.sensor);
    expect(r.json.custom).toEqual([]);
    expect(stored()).toEqual({ sensorModel: "a/b", mode: "manual" });
  });

  it("config.json holds only changes, and a stored copy of the default is ignored", () => {
    const mock = mockHost();
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { catchUp: false, debug: true, families: { body: false, care: false }, injection: { maxTokens: 500 }, mode: "bogus" } });
    expect(stored()).toEqual({ catchUp: false, debug: true, families: { body: false, care: false }, injection: { maxTokens: 500 } });
    // families back on remove their entries
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { families: { body: "on" } } });
    expect(stored().families).toEqual({ care: false });
    // a hand-written file with the default prompt in it follows the default
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ sensor: P.DEFAULT_PROMPTS.sensor, debug: true }));
    expect(config(mock).custom).toEqual([]);
    expect(config(mock).debug).toBe(true);
  });

  it("a stored copy of the previous default soul prompt follows the new default", () => {
    const mock = mockHost();
    const past = P.PAST_DEFAULT_PROMPTS.soul as string[];
    const previous = past[past.length - 1]!;
    expect(past.length).toBe(3);
    expect(previous).toContain("rate those characters again under the same keys");
    expect(P.DEFAULT_PROMPTS.soul).toContain("do what the message says about them");
    expect(P.DEFAULT_PROMPTS.soul).toContain("Always give cardType.");
    expect(previous).not.toBe(P.DEFAULT_PROMPTS.soul);
    fs.mkdirSync(path.join(root, "dashboard"), { recursive: true });
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ soul: previous, debug: true }));
    expect(config(mock).custom).toEqual([]);
    expect(config(mock).soul).toBe(P.DEFAULT_PROMPTS.soul);
    // PUT of a past default stores nothing either
    fs.rmSync(path.join(root, "dashboard/config.json"));
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { soul: previous } });
    expect(stored()).toBeNull();
  });

  it("accepts the panel envelope, and the panel switch is the mode", () => {
    const mock = mockHost();
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { enabled: true, values: { sensorModel: "x/y", mode: "sensor", catchUp: "off", sensor: "Panel prompt" } } });
    expect(stored()).toEqual({ sensorModel: "x/y", catchUp: false, sensor: "Panel prompt" });
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { enabled: false } });
    expect(stored().mode).toBe("manual");
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { enabled: true } });
    expect(stored().mode).toBeUndefined();
    const long = drive(mock, { method: "PUT", path: "/dashboard/config", body: { sensor: "z".repeat(9000) } });
    expect(long.json.sensor.length).toBe(8000);
  });

  it("the panel", () => {
    const mock = mockHost();
    const plain = P.uiPanel({}, mock.host);
    expect(plain.label).toBe("Relationship dashboard");
    expect(plain.items.length).toBe(1);
    const item = plain.items[0];
    expect(item.saveUrl).toBe("/dashboard/config");
    expect(item.deleteUrl).toBeUndefined();
    const field = (it: any, key: string) => it.fields.find((f: any) => f.key === key);
    const partKeys = P.SENSOR_PARTS.map((x: any) => "sensorPart_" + x.key);
    expect(item.fields.map((f: any) => f.key)).toEqual(["sensorModel", "sensorMaxTokens", "maxThreads", "threadCheckEvery", "mode", "insert", "insertTokens", "catchUp", "autoSoul", ...partKeys, "soul", "nudge", "fast"]);
    expect(item.fields[0].kind).toBe("model");
    expect(field(item, "autoSoul")).toMatchObject({ kind: "select", list: ["on", "off"], value: "on" });
    expect(field(item, "sensorPart_role")).toMatchObject({ kind: "textarea", advanced: true, value: P.DEFAULT_SENSOR_PARTS.role });
    expect(field(item, "soul")).toMatchObject({ kind: "textarea", advanced: true, label: "Soul rating prompt", value: P.DEFAULT_PROMPTS.soul });
    // a whole custom prompt (the older way) shows as one textarea
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { sensor: "Mine." } });
    const custom = P.uiPanel({}, mock.host).items[0];
    expect(custom.deleteUrl).toBe("/dashboard/config/prompts");
    expect(field(custom, "sensor").value).toBe("Mine.");
    expect(field(custom, "sensorPart_role")).toBeUndefined();
    // the automatic rating switch is stored only when it is off, and a custom soul prompt is kept like the sensor's
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { autoSoul: "off", soul: "My rating." } });
    expect(stored()).toEqual({ sensor: "Mine.", autoSoul: false, soul: "My rating." });
    const off = P.uiPanel({}, mock.host).items[0];
    expect(field(off, "autoSoul").value).toBe("off");
    expect(field(off, "soul").value).toBe("My rating.");
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { autoSoul: "on" } });
    expect(stored().autoSoul).toBeUndefined();
    expect(drive(mock, { method: "DELETE", path: "/dashboard/config/prompts" }).json.soul).toBe(P.DEFAULT_PROMPTS.soul);
  });
});

// ---------- catch-up ----------
describe("onTick", () => {
  /** Run a tick the way the engine does: pass A, then the answers, up to 3 passes. */
  function tick(mock: ReturnType<typeof mockHost>) {
    let ctx: any = { pluginId: "relations" };
    for (let pass = 0; pass < 3; pass++) {
      for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as any)[k];
      const before = mock.requests.length;
      if (pass > 0) mock.answer();
      const out = P.onTick(ctx, mock.host);
      if (out && typeof out === "object") ctx = out;
      if (mock.requests.length === before && pass > 0) break;
      if (!out) break;
    }
  }

  it("updates the newest recently active chat that has no snapshot", () => {
    writeChat("old", three(), { updatedAt: Date.now() - 3 * 3600_000 });
    writeChat("c1", three(), { updatedAt: Date.now() - 5 * 60_000 });
    writeChat("c2", [...three(), A("m4", "later")], { updatedAt: Date.now() - 2 * 60_000 });
    const mock = mockHost([keptPromise, keptPromise]);
    tick(mock);
    expect(fs.existsSync(stateFile("c2"))).toBe(true);
    expect(fs.existsSync(stateFile("c1"))).toBe(false);
    expect(fs.existsSync(stateFile("old"))).toBe(false);
    expect(readStateFile("c2").snapshots["m4#0"].turn).toBe(1);
    expect(readStateFile("c2").snapshots["m4#0"].op).toBe("catchup");
    // next tick: c2 is done, so c1 is next
    tick(mock);
    expect(fs.existsSync(stateFile("c1"))).toBe(true);
    // nothing left to do: no request
    const n = mock.requests.length;
    tick(mock);
    expect(mock.requests.length).toBe(n);
  });

  it("does nothing in manual mode or with catch-up off", () => {
    writeChat("c1", three(), { updatedAt: Date.now() - 5 * 60_000 });
    const mock = mockHost([keptPromise]);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "manual" } });
    tick(mock);
    expect(mock.requests.length).toBe(0);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "sensor", catchUp: false } });
    tick(mock);
    expect(mock.requests.length).toBe(0);
  });

  it("writes nothing on pass A", () => {
    writeChat("c1", three(), { updatedAt: Date.now() - 5 * 60_000 });
    const mock = mockHost([keptPromise]);
    const out = P.onTick({ pluginId: "relations" }, mock.host);
    expect(out.dashboard.chatId).toBe("c1");
    expect(mock.requests.length).toBe(1);
    expect(fs.readdirSync(path.join(root, "dashboard"))).toEqual(["config.json"]);
  });

  it("pauses a chat for ten minutes after an error", () => {
    writeChat("c1", three(), { updatedAt: Date.now() - 5 * 60_000 });
    const mock = mockHost([{ error: "boom" }]);
    tick(mock);
    expect(readStateFile("c1").lastError.message).toBe("boom");
    const n = mock.requests.length;
    tick(mock);
    expect(mock.requests.length).toBe(n);
    const st = readStateFile("c1");
    st.lastError.at = Date.now() - 11 * 60_000;
    fs.writeFileSync(stateFile("c1"), JSON.stringify(st));
    mock.push(keptPromise);
    tick(mock);
    expect(mock.requests.length).toBe(n + 1);
    expect(readStateFile("c1").lastError).toBeNull();
  });

  it("removes state files of chats that no longer exist, at most 20 per tick", () => {
    fs.mkdirSync(path.join(root, "dashboard/state"), { recursive: true });
    for (let i = 0; i < 25; i++) fs.writeFileSync(stateFile("gone" + i), "{}");
    writeChat("alive", three(), { updatedAt: Date.now() - 5 * 3600_000 });
    fs.writeFileSync(stateFile("alive"), "{}");
    const mock = mockHost();
    tick(mock);
    expect(fs.readdirSync(path.join(root, "dashboard/state")).length).toBe(6);
    tick(mock);
    expect(fs.readdirSync(path.join(root, "dashboard/state"))).toEqual(["alive.json"]);
  });
});

// ---------- the prompt insert ----------
describe("prompt insert", () => {
  const SYS = (content: string) => ({ role: "system", content });
  const defaultMessages = () => [SYS("card"), { role: "user", content: "hi" }];
  const ask = (mock: ReturnType<typeof mockHost>, chatId: string, messages: any = defaultMessages(), extra: Record<string, unknown> = {}, requestExtra: Record<string, unknown> = {}) =>
    P.llmRequest({ key: "reply", request: { sessionId: chatId, messages, ...requestExtra }, ...extra }, mock.host) as { messages: any[] } | null;
  /** The text of the insert inside a patched message list. */
  const insertOf = (out: { messages: any[] } | null): string => {
    const m = out?.messages.find((x) => String(x.content).startsWith("[Background, the scene:"));
    if (!m) throw new Error("no insert in the patch");
    return m.content;
  };
  const groupMeta = { characterId: undefined, groupId: "g1" };
  const setStats = (chatId: string, key: string, name: string, stats: Record<string, number>) => {
    const st = readStateFile(chatId);
    st.snapshots[key].chars[name].stats = { ...st.snapshots[key].chars[name].stats, ...stats };
    fs.writeFileSync(stateFile(chatId), JSON.stringify(st));
  };
  /** A chat with one real update behind it. */
  const withState = (replyText: string = keptPromise, chatId = "c1", msgs: Msg[] = three(), meta: Record<string, unknown> = {}) => {
    writeChat(chatId, msgs, meta);
    const mock = mockHost([replyText]);
    expect(update(mock, chatId).json.ok).toBe(true);
    return mock;
  };

  it("1. gives nothing for another key, a bad session id, no state file, or injection switched off", () => {
    const mock = withState();
    expect(ask(mock, "c1")).not.toBeNull();
    expect(P.llmRequest({ key: "sensor", request: { sessionId: "c1", messages: defaultMessages() } }, mock.host)).toBeNull();
    expect(P.llmRequest({ key: "title", request: { sessionId: "c1", messages: defaultMessages() } }, mock.host)).toBeNull();
    expect(P.llmRequest({ key: "reply", request: { messages: defaultMessages() } }, mock.host)).toBeNull();
    expect(P.llmRequest({ key: "reply", request: { sessionId: "", messages: defaultMessages() } }, mock.host)).toBeNull();
    expect(ask(mock, "../x")).toBeNull();
    expect(ask(mock, "no such id")).toBeNull();
    expect(ask(mock, "ghost")).toBeNull();
    expect(P.llmRequest({ key: "reply", request: { sessionId: "c1" } }, mock.host)).toBeNull();
    expect(P.llmRequest({ key: "reply" }, mock.host)).toBeNull();
    expect(P.llmRequest(null, mock.host)).toBeNull();
    // a chat that exists but was never updated has no state file
    writeChat("fresh", three());
    expect(fs.existsSync(stateFile("fresh"))).toBe(false);
    expect(ask(mock, "fresh")).toBeNull();
    // switched off in config.json
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ injection: { enabled: false } }));
    expect(ask(mock, "c1")).toBeNull();
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ injection: { enabled: true } }));
    expect(ask(mock, "c1")).not.toBeNull();
  });

  it("2. the insert is the last leading system message; only messages are patched", () => {
    const mock = withState();
    const msgs = [SYS("A"), SYS("B"), { role: "user", content: "X" }, { role: "assistant", content: "Y" }, { role: "user", content: "Z" }];
    const out = ask(mock, "c1", msgs)!;
    expect(Object.keys(out)).toEqual(["messages"]);
    expect(out.messages.length).toBe(6);
    expect(out.messages.slice(0, 2)).toEqual([SYS("A"), SYS("B")]);
    expect(out.messages[2].role).toBe("system");
    expect(out.messages[2].content.startsWith("[Background, the scene:")).toBe(true);
    expect(out.messages.slice(3)).toEqual(msgs.slice(2));
    // the request's own array is left as it was
    expect(msgs.length).toBe(5);
    // with no leading system message the insert comes first
    const bare = ask(mock, "c1", [{ role: "user", content: "X" }, { role: "assistant", content: "Y" }])!;
    expect(Object.keys(bare)).toEqual(["messages"]);
    expect(bare.messages.length).toBe(3);
    expect(bare.messages[0].role).toBe("system");
    expect(bare.messages[0].content.startsWith("[Background, the scene:")).toBe(true);
    expect(bare.messages.slice(1)).toEqual([{ role: "user", content: "X" }, { role: "assistant", content: "Y" }]);
    // an empty message list still gets the insert
    expect(ask(mock, "c1", [])!.messages.length).toBe(1);
  });

  it("3. impersonation gets no insert, whether the label rides ctx.turn or the request", () => {
    const mock = withState();
    expect(ask(mock, "c1", defaultMessages(), { turn: { op: "send" } })).not.toBeNull();
    expect(ask(mock, "c1", defaultMessages(), { turn: { op: "impersonate" } })).toBeNull();
    expect(ask(mock, "c1", defaultMessages(), {}, { turn: { op: "impersonate" } })).toBeNull();
    // ctx.turn wins over the request's field
    expect(ask(mock, "c1", defaultMessages(), { turn: { op: "send" } }, { turn: { op: "impersonate" } })).not.toBeNull();
  });

  describe("speaker and notebooks", () => {
    const bothKnow = reply({
      present: ["Aria", "Bram"],
      learned: [
        { who: "Aria", text: "The user hides a silver key", how: "saw" },
        { who: "Bram", text: "The user limps on the left leg", how: "saw" },
      ],
    });

    it("4. a group speaker gets their own notebook only; the other is just 'Also present'", () => {
      const mock = withState(bothKnow, "g", three(), groupMeta);
      const st = readStateFile("g");
      expect(st.notebook.Aria.length).toBe(1);
      expect(st.notebook.Bram.length).toBe(1);
      const text = insertOf(ask(mock, "g", defaultMessages(), { turn: { op: "next", speakerName: "Bram" } }));
      expect(text).toContain("[How Bram is right now:");
      expect(text).toContain("What Bram knows about You: Saw: The user limps on the left leg.");
      expect(text).not.toContain("silver key");
      expect(text).not.toContain("[How Aria");
      expect(text).not.toContain("What Aria");
      expect(text).toContain("Also present: Aria:");
      expect(text.indexOf("Also present:")).toBeGreaterThan(text.indexOf("[How Bram"));
      // the speaker is Aria: the mirror image
      const aria = insertOf(ask(mock, "g", defaultMessages(), { turn: { op: "next", speakerName: "Aria" } }));
      expect(aria).toContain("[How Aria is right now:");
      expect(aria).toContain("silver key");
      expect(aria).not.toContain("limps");
      expect(aria).not.toContain("[How Bram");
      expect(aria).toContain("Also present: Bram:");
    });

    it("4b. a group chat with no turn label (old engine): full blocks, no notebook line at all", () => {
      const mock = withState(bothKnow, "g", three(), groupMeta);
      const text = insertOf(ask(mock, "g"));
      expect(text).toContain("[How Aria is right now:");
      expect(text).toContain("[How Bram is right now:");
      expect(text).not.toMatch(/What \S+ knows/);
      expect(text).not.toContain("silver key");
      expect(text).not.toContain("limps");
      expect(text).not.toContain("Also present:");
      // a speaker who is not in the scene counts as no speaker
      const stranger = insertOf(ask(mock, "g", defaultMessages(), { turn: { op: "next", speakerName: "Nobody" } }));
      expect(stranger).not.toMatch(/What \S+ knows/);
      expect(stranger).toContain("[How Bram is right now:");
    });

    it("5. a narrator card: a full block only for whom the turn is about, each with only their own note", () => {
      const replyText = reply({
        present: ["Medli", "Garrett"],
        learned: [
          { who: "Medli", text: "The user fears the sea", how: "saw" },
          { who: "Garrett", text: "The user owes a debt", how: "saw" },
        ],
      });
      // the card is Bram, who has no soul and is not in the scene
      const mock = withState(replyText, "c1", three(), { characterId: "bram" });
      expect(readStateFile("c1").snapshots["m3#0"].present).toEqual(["Medli", "Garrett"]);
      const userSays = (content: string) => [SYS("card"), { role: "user", content }];
      // the user turns to Medli: only she gets a block and her own note; Garrett is one line
      const toMedli = insertOf(ask(mock, "c1", userSays("I turn to Medli."), { turn: { op: "send" } }));
      expect(toMedli).not.toContain("[How Bram");
      expect(toMedli).toContain("[How Medli is right now:");
      expect(toMedli).toContain("What Medli knows about You: Saw: The user fears the sea.");
      expect(toMedli).not.toContain("[How Garrett");
      expect(toMedli).not.toContain("owes a debt");
      expect(toMedli).toContain("Also present: Garrett:");
      // both named (an ending on the name still counts): two blocks, each with only their own note
      const both = insertOf(ask(mock, "c1", userSays("Medli and Garretto, come here."), { turn: { op: "send" } }));
      const pieces = both.split("[How ");
      const medli = pieces.find((p) => p.startsWith("Medli"))!;
      const garrett = pieces.find((p) => p.startsWith("Garrett"))!;
      expect(medli).toContain("fears the sea");
      expect(medli).not.toContain("owes a debt");
      expect(garrett).toContain("owes a debt");
      expect(garrett).not.toContain("fears the sea");
      // nobody named and nothing happened to anyone: one line each, no notebook at all
      const nobody = insertOf(ask(mock, "c1", userSays("I ride on in silence."), { turn: { op: "send" } }));
      expect(nobody).not.toContain("[How ");
      expect(nobody).not.toMatch(/knows about/);
      expect(nobody).toContain("People here: Medli:");
    });
  });

  it("6. words only: no digit, tier phrases above the threshold, 'no history yet' for a blank, the day in words", () => {
    const mock = withState();
    setStats("c1", "m3#0", "Aria", { trust: 60, respect: -30, comfort: 0, attraction: 0, affection: 0 });
    const who = { user: "You", their: "their", self: "themself" };
    const text = insertOf(ask(mock, "c1"));
    expect(text).not.toMatch(/\d/);
    expect(text).toContain(P.tierPhrase("trust", 60, who));
    expect(text).toContain(P.tierPhrase("respect", -30, who));
    expect(P.tierPhrase("trust", 60, who)).not.toBe(P.tierPhrase("trust", 0, who));
    // comfort, attraction and affection sit at 0: below the threshold of 10, no phrase
    for (const stat of ["comfort", "attraction", "affection"]) expect(text).not.toContain(P.tierPhrase(stat, 0, who));
    expect(text).toContain("The first day.");
    // the edge: 9 is silent, 10 and -10 speak
    setStats("c1", "m3#0", "Aria", { trust: 0, respect: 0, comfort: 9, attraction: -9, affection: 10 });
    const edge = insertOf(ask(mock, "c1"));
    expect(edge).toContain(P.tierPhrase("affection", 10, who));
    expect(edge).not.toContain(P.tierPhrase("comfort", 9, who));
    expect(edge).not.toContain(P.tierPhrase("attraction", -9, who));
    // all zero: no history yet, and the third day in words (an evening on it)
    writeChat("c2", three());
    const blank = mockHost([reply({ present: ["Aria"], day: 3, time: "evening" })]);
    update(blank, "c2");
    const c = readStateFile("c2").snapshots["m3#0"].chars.Aria.stats;
    expect(Object.values(c).every((v) => v === 0)).toBe(true);
    const fresh = insertOf(ask(blank, "c2"));
    expect(fresh).toContain("Toward You: no history yet.");
    expect(fresh).toContain("Evening of the third day.");
    expect(fresh).not.toMatch(/\d/);
  });

  it("7. the blind spot never reaches the prompt; the preview checks say so", () => {
    const blind = "does not know the key is fake";
    const mock = withState(
      reply({
        present: ["Aria"],
        events: [{ id: "kept_promise", weight: "significant", from: "user", to: "Aria" }],
        chars: { Aria: { mood: "relieved" } },
        learned: [{ who: "Aria", text: "The user keeps their word", how: "saw" }],
        blindSpot: { Aria: blind },
      }),
    );
    // the sensor's line is really in the state, so the check below means something
    expect(readStateFile("c1").snapshots["m3#0"].chars.Aria.blindSpot).toBe(blind);
    const text = insertOf(ask(mock, "c1"));
    expect(text).not.toContain(blind);
    expect(text).not.toContain("key is fake");
    const pv = drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1", speaker: "Aria" } });
    expect(pv.status).toBe(200);
    expect(pv.json.checks.noBlindSpot).toBe(true);
    expect(pv.json.checks.notebookOf).toEqual(["Aria"]);
    expect(pv.json.checks.digits).toBe(0);
    expect(typeof pv.json.insert.tokens).toBe("number");
    expect(pv.json.insert.tokens).toBeLessThan(300);
    expect(pv.json.insert.text).not.toContain(blind);
    expect(pv.json.insert.focus).toEqual(["Aria"]);
    // preview edge cases: no id, no state
    expect(drive(mock, { method: "GET", path: "/dashboard/preview", query: {} }).status).toBe(400);
    writeChat("fresh", three());
    expect(drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "fresh" } }).json).toEqual({ insert: null, speakers: [] });
  });

  describe("swipe and continue read the state before the target", () => {
    const four = () => [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "Tell me."), A("m4", "I will.")];
    // turn 1: a compliment, nothing felt yet; turn 2: a pivotal threat, trust and comfort drop to -12
    const setup = () => {
      writeChat("c1", [U("m1", "Hello."), A("m2", "Welcome.")]);
      const mock = mockHost([reply({ present: ["Aria"], events: [{ id: "compliment", weight: "pivotal", from: "user", to: "Aria" }], chars: { Aria: { mood: "calm" } } })]);
      update(mock, "c1");
      writeChat("c1", four());
      mock.push(reply({ present: ["Aria"], events: [{ id: "threat", weight: "pivotal", from: "user", to: "Aria" }], chars: { Aria: { mood: "tense" } } }));
      update(mock, "c1");
      const st = readStateFile("c1");
      expect(st.snapshots["m2#0"].turn).toBe(1);
      expect(st.snapshots["m4#0"].turn).toBe(2);
      expect(st.snapshots["m2#0"].chars.Aria.stats).toMatchObject({ trust: 0, comfort: 0 });
      expect(st.snapshots["m4#0"].chars.Aria.stats).toMatchObject({ trust: -12, comfort: -12 });
      return mock;
    };
    const who = { user: "You", their: "their", self: "themself" };
    const wary = P.tierPhrase("trust", -12, who);
    const onEdge = P.tierPhrase("comfort", -12, who);

    it("8. swipe and continue of m4 show turn 1; send shows turn 2", () => {
      const mock = setup();
      const sent = insertOf(ask(mock, "c1", defaultMessages(), { turn: { op: "send" } }));
      expect(sent).toContain(wary);
      expect(sent).toContain(onEdge);
      expect(sent).toContain("Mood: tense, shifting from calm.");
      for (const op of ["swipe", "continue"]) {
        const text = insertOf(ask(mock, "c1", defaultMessages(), { turn: { op, targetId: "m4" } }));
        expect(text).not.toContain(wary);
        expect(text).not.toContain(onEdge);
        expect(text).toContain("Toward You: no strong feelings yet.");
        expect(text).toContain("Mood: calm.");
        expect(text).not.toContain("tense");
      }
      // no label at all, or no target: the newest state
      expect(insertOf(ask(mock, "c1"))).toContain(wary);
      expect(insertOf(ask(mock, "c1", defaultMessages(), { turn: { op: "swipe" } }))).toContain(wary);
      // a target that is not in the chat falls back to the newest state
      expect(insertOf(ask(mock, "c1", defaultMessages(), { turn: { op: "swipe", targetId: "zz" } }))).toContain(wary);
      // the label may ride the request on an older engine
      expect(insertOf(ask(mock, "c1", defaultMessages(), {}, { turn: { op: "swipe", targetId: "m4" } }))).not.toContain(wary);
    });

    it("8b. swiping a message with no snapshot before it gives no insert", () => {
      const mock = setup();
      expect(ask(mock, "c1", defaultMessages(), { turn: { op: "swipe", targetId: "m2" } })).toBeNull();
      expect(ask(mock, "c1", defaultMessages(), { turn: { op: "swipe", targetId: "m1" } })).toBeNull();
    });
  });

  it("9. a note whose source swipe is no longer active is left out", () => {
    const mock = withState();
    writeChat("c1", [...three(), A("m4", "Thank you.")]);
    mock.push(reply({ present: ["Aria"], learned: [{ who: "Aria", text: "The user is kind", how: "saw" }] }));
    update(mock, "c1");
    const both = insertOf(ask(mock, "c1"));
    expect(both).toContain("The user keeps their word");
    expect(both).toContain("The user is kind");
    // m4 is swiped: the new swipe has no snapshot yet, so the line ends at m3 and the note of m4#0 sleeps
    writeChat("c1", [...three(), { ...A("m4", "You are welcome."), swipe: 1 }]);
    const after = insertOf(ask(mock, "c1"));
    expect(after).toContain("The user keeps their word");
    expect(after).not.toContain("The user is kind");
    // the same for a swipe in progress: the target's own notes do not leak either
    const redo = insertOf(ask(mock, "c1", defaultMessages(), { turn: { op: "swipe", targetId: "m4" } }));
    expect(redo).not.toContain("The user is kind");
    // swiping back to the first swipe brings the note back
    writeChat("c1", [...three(), A("m4", "Thank you.")]);
    expect(insertOf(ask(mock, "c1"))).toContain("The user is kind");
  });

  it("9b. a note retired by an active message is left out, and comes back when that message is gone", () => {
    const mock = withState();
    writeChat("c1", [...three(), A("m4", "Thank you.")]);
    mock.push(reply({ present: ["Aria"], retire: ["n1"] }));
    update(mock, "c1");
    expect(insertOf(ask(mock, "c1"))).not.toContain("The user keeps their word");
    writeChat("c1", [...three(), { ...A("m4", "Thank you."), swipe: 1 }]);
    expect(insertOf(ask(mock, "c1"))).toContain("The user keeps their word");
  });

  it("10. the pronoun comes from the soul: her, and them without one", () => {
    const told = reply({ present: ["Aria"], learned: [{ who: "Aria", text: "The user was born by the sea", how: "heard", from: null }] });
    const soulPath = path.join(root, "characters/aria/card.json");
    const cardWith = (pronouns: string) => JSON.stringify({ spec: "chara_card_v2", name: "Aria", extensions: { molfar_soul: { v: 1, characters: { Aria: { class: "ally", pronouns } } } } });
    fs.writeFileSync(soulPath, cardWith("she"));
    const she = withState(told, "c1");
    const text = insertOf(ask(she, "c1"));
    expect(text).toContain("You told her: The user was born by the sea.");
    expect(text).not.toContain("told them");
    // Bram has no soul at all
    const bram = withState(reply({ present: ["Bram"], learned: [{ who: "Bram", text: "The user was born by the sea", how: "heard", from: null }] }), "c2", three(), { characterId: "bram" });
    const them = insertOf(ask(bram, "c2"));
    expect(them).toContain("You told them: The user was born by the sea.");
    expect(them).not.toContain("told her");
    // he, and an unknown value, are read too
    fs.writeFileSync(soulPath, cardWith("he"));
    expect(insertOf(ask(she, "c1"))).toContain("You told him: ");
    fs.writeFileSync(soulPath, cardWith("xe"));
    expect(insertOf(ask(she, "c1"))).toContain("You told them: ");
  });

  it("11. body, clothes and hands only when seen this turn; the mood stays, its shift only when it changed", () => {
    const mock = withState(reply({ present: ["Aria"], chars: { Aria: { mood: "tense", holding: "a key", condition: "wet" } } }));
    let text = insertOf(ask(mock, "c1"));
    expect(text).toContain("Holding: a key.");
    expect(text).toContain("Body: wet.");
    writeChat("c1", [...three(), A("m4", "Hm."), U("m5", "Well?")]);
    mock.push(reply({ present: ["Aria"], chars: { Aria: { outfit: "a grey cloak" } } }));
    expect(update(mock, "c1").json.ok).toBe(true);
    text = insertOf(ask(mock, "c1"));
    expect(text).not.toContain("a key");
    expect(text).not.toContain("wet");
    expect(text).toContain("Wearing: a grey cloak.");
    expect(text).toContain("Mood: tense.");
    expect(text).not.toContain("shifting from");
    // the closing line says it is background, not text to retell
    expect(text).toContain("not text to retell");
  });

  it("11b. open threads ride along without ids; a goal only when seen this turn", () => {
    const mock = withState(reply({ present: ["Aria"], chars: { Aria: { goal: "find the ferry" } }, threads: { open: [{ id: null, text: "Who sank the ferry?" }] } }));
    let text = insertOf(ask(mock, "c1"));
    expect(text).toContain("[Open threads the story can move toward: Who sank the ferry?.]");
    expect(text).toContain("the open threads are there to pull on");
    expect(text).toContain("Wants: find the ferry.");
    expect(text).not.toMatch(/\d/);
    writeChat("c1", [...three(), A("m4", "Hm."), U("m5", "Well?")]);
    mock.push(reply({ present: ["Aria"], threads: { open: [], resolved: ["t1"] } }));
    expect(update(mock, "c1").json.ok).toBe(true);
    text = insertOf(ask(mock, "c1"));
    expect(text).not.toContain("find the ferry");
    expect(text).not.toContain("Open threads");
    expect(text).not.toContain("pull on");
  });

  it("13. the user's limit: set from the panel, others go first, then notebooks, and the preview says so", () => {
    const mock = withState(reply({ present: ["Aria", "Bram"], learned: [{ who: "Aria", text: "The user carries a long letter from the capital, sealed twice with black wax, and keeps it inside the coat even at supper, never letting anyone near it or asking about it", how: "saw" }] }));
    const put = drive(mock, { method: "PUT", path: "/dashboard/config", body: { enabled: true, values: { insert: "on", insertTokens: "60" } } });
    expect(put.json.injection).toEqual({ enabled: true, maxTokens: 60 });
    const tight = drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1", speaker: "Aria" } }).json;
    expect(tight.insert.trimmed).toEqual(["others", "notebooks"]);
    expect(tight.insert.text).not.toContain("Also present");
    expect(tight.insert.text).not.toContain("long letter");
    // the preview writes nothing; a real reply that got cut leaves a notice for the app
    expect(drive(mock, { method: "GET", path: "/dashboard/notice", query: { chatId: "c1" } }).json.notice).toBeNull();
    expect(ask(mock, "c1")).not.toBeNull();
    const notice = drive(mock, { method: "GET", path: "/dashboard/notice", query: { chatId: "c1" } }).json.notice;
    expect(notice.trimmed).toEqual(["others", "notebooks"]);
    expect(notice.wanted).toBeGreaterThan(notice.budget);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { values: { insertTokens: "2000" } } });
    const at = notice.at;
    ask(mock, "c1");
    expect(drive(mock, { method: "GET", path: "/dashboard/notice", query: { chatId: "c1" } }).json.notice.at).toBe(at);
    const roomy = drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1", speaker: "Aria" } }).json;
    expect(roomy.insert.trimmed).toEqual([]);
    expect(roomy.insert.text).toContain("long letter");
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { values: { insert: "off" } } });
    expect(ask(mock, "c1")).toBeNull();
    const panel = P.uiPanel({}, mock.host).items[0].fields.map((f: any) => f.key);
    expect(panel).toContain("insert");
    expect(panel).toContain("insertTokens");
  });

  it("12. a name counts with an ending, a plain substring does not", () => {
    expect(P.mentions("I turn to Mariann.", "Marianna")).toBe(true);
    expect(P.mentions("Chandru!", "Chandra")).toBe(true);
    expect(P.mentions("hello Aria", "Aria")).toBe(true);
    expect(P.mentions("a malaria cure", "Aria")).toBe(false);
    expect(P.mentions("", "Aria")).toBe(false);
  });
});

// ---------- souls: lookup, clean-up, proposals, rating, effects, guests ----------
describe("souls", () => {
  const SPECTRA = { introvert_extrovert: 30, cautious_reckless: 35, reserved_emotional: 75, lawful_rebellious: 40, suspicious_trusting: 45, pessimist_optimist: 65 };
  const medli = () => ({
    class: "ally",
    pronouns: "she",
    aliases: ["Медли"],
    start: { trust: 5, respect: 10, affection: 10 },
    traits: { dominance: 15, confidence: 30, shyness: 72, patience: 60, curiosity: 80 },
    spectra: { ...SPECTRA },
    triggers: [{ cue: "shouting", event: "raised_voice", stat: "comfort", x: 1.5 }],
    values: [{ cue: "a kept word", event: "kept_promise", stat: "trust", x: 1.5 }],
    coping: "sings when it is hard",
  });
  const writeCard = (id: string, card: Record<string, unknown>) => {
    fs.mkdirSync(path.join(root, "characters", id), { recursive: true });
    fs.writeFileSync(path.join(root, "characters", id, "card.json"), JSON.stringify({ spec: "chara_card_v2", extensions: {}, ...card }));
  };
  const draftFile = (id: string) => path.join(root, "dashboard/soul-drafts", id + ".json");
  const writeDraft = (id: string, draft: unknown) => {
    fs.mkdirSync(path.join(root, "dashboard/soul-drafts"), { recursive: true });
    fs.writeFileSync(draftFile(id), JSON.stringify(draft));
  };
  const readDraftFile = (id: string) => JSON.parse(fs.readFileSync(draftFile(id), "utf8"));
  const autoOn = (mock: ReturnType<typeof mockHost>) => drive(mock, { method: "PUT", path: "/dashboard/config", body: { autoSoul: "on" } });
  const rate = (mock: ReturnType<typeof mockHost>, body: Record<string, unknown>) => drive(mock, { method: "POST", path: "/dashboard/soul/rate", body });
  const soulReply = reply({
    characters: {
      Medli: { class: "ally", pronouns: "she", aliases: ["Медли"], start: { trust: 5 }, traits: { shyness: 72 }, triggers: [{ cue: "shouting", event: "raised_voice", stat: "comfort", x: 1.5 }, { cue: "bad", event: "Not An Id", stat: "trust" }] },
    },
    note: "Chosen from the card",
  });

  it("soulOf: exact key, then case-insensitive, then an alias", () => {
    const a = { aliases: ["Медли", " Meddy "] };
    const b = { class: "hostile" };
    const souls = { Medli: a, Garrett: b };
    expect(P.soulOf(souls, "Medli")).toBe(a);
    expect(P.soulOf(souls, "  medli ")).toBe(a);
    expect(P.soulOf(souls, "Медли")).toBe(a);
    expect(P.soulOf(souls, "МЕДЛИ")).toBe(a);
    expect(P.soulOf(souls, "meddy")).toBe(a);
    expect(P.soulOf(souls, "GARRETT")).toBe(b);
    expect(P.soulOf(souls, "Nobody")).toBeUndefined();
    expect(P.soulOf(souls, "constructor")).toBeUndefined();
    expect(P.soulOf(souls, "")).toBeUndefined();
    expect(P.soulOf(undefined, "Medli")).toBeUndefined();
  });

  it("an alias is listed once, under the story's spelling, and the soul is used", () => {
    writeCard("bram", { name: "Bram", extensions: { molfar_soul: { v: 1, characters: { Medli: { class: "ally", aliases: ["Медли"], start: { trust: 5 } } } } } });
    writeChat("c1", three(), { characterId: "bram" });
    const mock = mockHost([reply({ present: ["Медли"], minutes: 1 })]);
    update(mock, "c1");
    // the first call lists the soul key (nobody has used the alias yet)
    expect(mock.requests[0]!.req.messages[0].content).toContain("Bram (the card: a character, or a narrator who is no person in the scene), Medli (ally).");
    const first = readStateFile("c1").snapshots["m3#0"].chars;
    expect(Object.keys(first)).toEqual(["Медли"]);
    expect(first["Медли"].cls).toBe("ally");
    expect(first["Медли"].stats.trust).toBe(5);
    // now the snapshot has Медли: the key Medli stands for the same soul and is not listed again
    writeChat("c1", [...three(), A("m4", "Hm."), U("m5", "Well?")], { characterId: "bram" });
    mock.push(reply({ present: ["Медли"] }));
    update(mock, "c1");
    const asked = mock.requests[1]!.req.messages[0].content as string;
    expect(asked).toContain("Медли (ally)");
    expect(asked).not.toContain("Medli");
    expect(readStateFile("c1").snapshots["m5#0"].chars["Медли"].stats.trust).toBe(5);
  });

  it("normalizeSoul clamps, drops what the code cannot read, keeps unknown keys, x defaults to 1.5", () => {
    const raw = {
      class: "bogus",
      pronouns: "she",
      aliases: [" Медли ", "медли", "x".repeat(80), "", 5, "a", "b", "c", "d", "e", "f", "g", "h"],
      start: { trust: 99, comfort: -50.6, hostility: 150, respect: "x", luck: 3 },
      traits: { shyness: 150, curiosity: -5, wit: 5 },
      spectra: { introvert_extrovert: 49.5, nope: 1 },
      triggers: [
        { cue: "c".repeat(100), event: "raised_voice", stat: "comfort", x: 9 },
        { cue: "bad id", event: "Bad Id", stat: "comfort" },
        { cue: "bad stat", event: "kiss", stat: "luck" },
        { cue: "no x", event: "kiss", stat: "attraction" },
        { event: "kiss", stat: "attraction", x: "NaN" },
        { cue: "low", event: "kiss", stat: "affection", x: 0.2 },
        "nope",
      ],
      values: 5,
      coping: "z".repeat(400),
      pulseBase: { arousal: 120.4 },
      locked: "yes",
      ratedBy: "user",
      custom: { keep: 1 },
      mood: "kept",
    };
    const n = P.normalizeSoul(raw);
    expect(n.class).toBeUndefined();
    expect(n.pronouns).toBe("she");
    expect(n.aliases).toEqual(["Медли", "x".repeat(60), "a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(n.start).toEqual({ trust: 20, comfort: -20, hostility: 100 });
    expect(n.traits).toEqual({ shyness: 100, curiosity: 0 });
    expect(n.spectra).toEqual({ introvert_extrovert: 50 });
    expect(n.triggers.map((t: any) => [t.cue.length, t.event, t.stat, t.x])).toEqual([
      [80, "raised_voice", "comfort", 3],
      [4, "kiss", "attraction", 1.5],
      [0, "kiss", "attraction", 1.5],
      [3, "kiss", "affection", 1],
    ]);
    expect(n.values).toBeUndefined();
    expect(n.coping.length).toBe(300);
    expect(n.pulseBase).toEqual({ arousal: 100 });
    expect(n.locked).toBeUndefined();
    expect(n.ratedBy).toBe("user");
    expect(n.custom).toEqual({ keep: 1 });
    expect(n.mood).toBe("kept");
    // a new object: the input is left as it was
    expect(raw.class).toBe("bogus");
    expect(raw.start.trust).toBe(99);
    expect(P.normalizeSoul({ class: "hostile", locked: true })).toEqual({ class: "hostile", locked: true });
    expect(P.normalizeSoul(null)).toEqual({});
    expect(P.normalizeSoul("x")).toEqual({});
  });

  it("normalizeDraft: by, notes, at most twelve names, souls cleaned; not an object is null", () => {
    const many: Record<string, unknown> = {};
    for (let i = 0; i < 15; i++) many["N" + i] = { class: "ally" };
    many["  "] = { class: "ally" };
    many["Bad"] = "text";
    const d = P.normalizeDraft({ v: 7, at: 5, by: "robot", model: "a/b", note: "n".repeat(500), error: "e".repeat(500), dismissedAt: 9, characters: many });
    expect(d).toMatchObject({ v: 1, at: 5, by: "auto", model: "a/b", dismissedAt: 9 });
    expect(d.note.length).toBe(400);
    expect(d.error.length).toBe(400);
    expect(Object.keys(d.characters).length).toBe(12);
    expect(d.characters.N0).toEqual({ class: "ally" });
    expect(P.normalizeDraft({ by: "molfar", characters: { Medli: { class: "nope", coping: "x" } } })).toEqual({ v: 1, at: 0, by: "molfar", characters: { Medli: { coping: "x" } } });
    expect(P.normalizeDraft({ characters: 3 }).characters).toEqual({});
    expect(P.normalizeDraft(null)).toBeNull();
    expect(P.normalizeDraft([])).toBeNull();
    expect(P.normalizeDraft("x")).toBeNull();
  });

  it("effects: the Medli soul of the mock, in order, with the numbers the physics uses", () => {
    const mock = mockHost();
    const effects = drive(mock, { method: "POST", path: "/dashboard/soul/effects", body: { soul: medli() } }).json.effects;
    expect(effects).toEqual([
      { kind: "brake", trait: "shyness", value: 72, stats: ["trust", "comfort"], cap: 1 },
      { kind: "gain", stat: "trust", spectrum: "suspicious_trusting", value: 45, inverted: false, x: 0.9 },
      { kind: "gain", stat: "comfort", spectrum: "introvert_extrovert", value: 30, inverted: false, x: 0.9 },
      { kind: "gain", stat: "attraction", spectrum: "cautious_reckless", value: 35, inverted: false, x: 0.9 },
      { kind: "gain", stat: "respect", spectrum: "lawful_rebellious", value: 40, inverted: true, x: 1.1 },
      { kind: "gain", stat: "affection", spectrum: "reserved_emotional", value: 75, inverted: false, x: 1.1 },
      { kind: "harm", spectrum: "pessimist_optimist", value: 65, x: 0.9 },
      { kind: "base", stat: "excitement", value: 18, normal: 12, trait: "curiosity", traitValue: 80 },
      { kind: "trigger", cue: "shouting", event: "raised_voice", stat: "comfort", x: 1.5, known: true },
      { kind: "value", cue: "a kept word", event: "kept_promise", stat: "trust", x: 1.5, known: true },
    ]);
    // hostile first; an event the vocabulary does not have is not known; arousal base; shyness 60 is no brake
    const odd = drive(mock, {
      method: "POST",
      path: "/dashboard/soul/effects",
      body: { soul: { class: "hostile", traits: { shyness: 60 }, pulseBase: { arousal: 30 }, triggers: [{ cue: "x", event: "unheard_of", stat: "trust", x: 2 }] } },
    }).json.effects;
    expect(odd).toEqual([
      { kind: "hostile" },
      { kind: "base", stat: "arousal", value: 30, normal: 9 },
      { kind: "trigger", cue: "x", event: "unheard_of", stat: "trust", x: 2, known: false },
    ]);
    // the soul is cleaned first; nothing is written
    expect(drive(mock, { method: "POST", path: "/dashboard/soul/effects", body: { soul: { spectra: { introvert_extrovert: 10, junk: 1 } } } }).json.effects).toEqual([
      { kind: "gain", stat: "comfort", spectrum: "introvert_extrovert", value: 10, inverted: false, x: 0.75 },
    ]);
    expect(drive(mock, { method: "POST", path: "/dashboard/soul/effects", body: {} }).json.effects).toEqual([]);
    expect(fs.readdirSync(path.join(root, "dashboard"))).toEqual(["config.json"]);
  });

  it("the effects follow the same code as the physics: the shyness cap", () => {
    const soul = { traits: { shyness: 61 } };
    const r = turn("Guest", zero(), [ev("kept_promise", "pivotal", "Guest")], soul);
    expect(r.stats.trust).toBe(1);
    expect(r.math.turn).toContain("shyness 61 > 60: growth capped at +1");
  });

  it("proposal routes: GET, dismiss and accept", () => {
    const mock = mockHost();
    const get = () => drive(mock, { method: "GET", path: "/dashboard/soul-draft", query: { characterId: "bram" } });
    expect(get().json).toEqual({ draft: null });
    expect(drive(mock, { method: "GET", path: "/dashboard/soul-draft", query: { characterId: "../x" } }).status).toBe(400);
    expect(drive(mock, { method: "DELETE", path: "/dashboard/soul-draft", query: {} }).status).toBe(400);
    writeDraft("bram", { v: 1, at: 123, by: "molfar", note: "n", characters: { Medli: { class: "bogus", pronouns: "she" } } });
    expect(get().json.draft).toEqual({ v: 1, at: 123, by: "molfar", note: "n", characters: { Medli: { pronouns: "she" } } });
    // dismiss: the file stays, empty, with the time; the old time and author are kept
    const before = Date.now();
    expect(drive(mock, { method: "DELETE", path: "/dashboard/soul-draft", query: { characterId: "bram" } }).json).toEqual({ ok: true });
    const gone = readDraftFile("bram");
    expect(gone).toMatchObject({ v: 1, at: 123, by: "molfar", characters: {} });
    expect(gone.dismissedAt).toBeGreaterThanOrEqual(before);
    expect(get().json.draft.dismissedAt).toBe(gone.dismissedAt);
    // dismissing with no file writes one with the current time
    drive(mock, { method: "DELETE", path: "/dashboard/soul-draft", query: { characterId: "aria" } });
    expect(readDraftFile("aria")).toMatchObject({ v: 1, by: "auto", characters: {} });
    expect(readDraftFile("aria").at).toBeGreaterThanOrEqual(before);
    // accepted: the file is removed
    expect(drive(mock, { method: "DELETE", path: "/dashboard/soul-draft", query: { characterId: "bram", accepted: "1" } }).json).toEqual({ ok: true });
    expect(fs.existsSync(draftFile("bram"))).toBe(false);
    expect(get().json).toEqual({ draft: null });
    // accepting what is not there is fine
    expect(drive(mock, { method: "DELETE", path: "/dashboard/soul-draft", query: { characterId: "bram", accepted: "1" } }).json).toEqual({ ok: true });
    // DELETE with name removes only that key
    writeDraft("bram", { v: 1, at: 1, by: "auto", characters: { Medli: { class: "ally" }, Garrett: { class: "neutral" } } });
    drive(mock, { method: "DELETE", path: "/dashboard/soul-draft", query: { characterId: "bram", accepted: "1", name: "Medli" } });
    expect(readDraftFile("bram")).toMatchObject({ characters: { Garrett: {} } });
    // removing all names deletes the file
    drive(mock, { method: "DELETE", path: "/dashboard/soul-draft", query: { characterId: "bram", accepted: "1", name: "Garrett" } });
    expect(fs.existsSync(draftFile("bram"))).toBe(false);
  });

  describe("nameKey and transliteration", () => {
    it("nameKey: lowercase, Cyrillic transliterated, accents dropped", () => {
      expect(P.nameKey("Medli")).toBe("medli");
      expect(P.nameKey("MEDLI")).toBe("medli");
      expect(P.nameKey("Café")).toBe("cafe");
      // Cyrillic transliteration
      const medli = String.fromCharCode(0x041c) + String.fromCharCode(0x0435) + String.fromCharCode(0x0434) + String.fromCharCode(0x043b) + String.fromCharCode(0x0438); // Медли
      expect(P.nameKey(medli)).toBe("medli");
      const chandra = String.fromCharCode(0x0427) + String.fromCharCode(0x0430) + String.fromCharCode(0x043d) + String.fromCharCode(0x0434) + String.fromCharCode(0x0440) + String.fromCharCode(0x0430); // Чандра
      expect(P.nameKey(chandra)).toBe("chandra");
      const t_sha = String.fromCharCode(0x0422) + String.fromCharCode(0x044c) + String.fromCharCode(0x0428) + String.fromCharCode(0x0430); // Т'Ша
      expect(P.nameKey(t_sha)).toBe("tsha");
    });

    it("soulOf: exact, case-insensitive, alias, transliteration", () => {
      const medli = String.fromCharCode(0x041c) + String.fromCharCode(0x0435) + String.fromCharCode(0x0434) + String.fromCharCode(0x043b) + String.fromCharCode(0x0438); // Медли
      const tsandra = String.fromCharCode(0x0427) + String.fromCharCode(0x044f) + String.fromCharCode(0x043d) + String.fromCharCode(0x0434) + String.fromCharCode(0x0440) + String.fromCharCode(0x0430); // Чандра
      const tsha = String.fromCharCode(0x0422) + String.fromCharCode(0x044c) + String.fromCharCode(0x0428) + String.fromCharCode(0x0430); // Т'Ша
      const soul = { class: "ally" };
      const souls = { Medli: soul };
      // transliteration: Медли finds Medli
      expect(P.soulOf(souls, medli)).toBe(soul);
      // Cyrillic with apostrophe transliterates correctly
      const tshaAlias = [tsha];
      const tshaKnown = { "T'Sha": { class: "neutral", aliases: tshaAlias } };
      expect(P.soulOf(tshaKnown, tsha)).toEqual({ class: "neutral", aliases: tshaAlias });
    });

    it("soulOf: near-miss by edit distance 1 when nameKey >= 6, only if exactly one match", () => {
      const marianna = String.fromCharCode(0x041c) + String.fromCharCode(0x0430) + String.fromCharCode(0x0440) + String.fromCharCode(0x0438) + String.fromCharCode(0x0430) + String.fromCharCode(0x043d) + String.fromCharCode(0x043d) + String.fromCharCode(0x0430); // Марианна
      const soul = { class: "ally" };
      const souls = { Marianne: soul };
      // Марианна transliterates to marianna, which is edit distance 1 from marianne, finds the soul
      expect(P.soulOf(souls, marianna)).toBe(soul);
      // too short: no match (medli -> medli, Media has nameKey media, distance 1 but too short)
      expect(P.soulOf({ Media: { class: "neutral" } }, "Medli")).toBeUndefined();
      // ambiguous: "Mariana" is distance 1 from both "Mariane" and "Marianna", no match
      const s1 = { class: "ally", aliases: [] };
      const s2 = { class: "neutral", aliases: [] };
      expect(P.soulOf({ Mariane: s1, Marianna: s2 }, "Mariana")).toBeUndefined();
      // alias distance match: searching for "Mariana" finds soul with alias "Mariane"
      const s3 = { class: "ally", aliases: ["Mariane"] };
      expect(P.soulOf({ Marianne: s3 }, "Mariana")).toBe(s3);
    });
  });

  describe("lorebook aliases", () => {
    it("a card whose linked lorebook makes a Cyrillic name resolve to a soul through aliases", () => {
      writeCard("bram", { name: "Bram", extensions: { molfar_soul: { v: 1, characters: { Marianne: { class: "ally", coping: "hums an old song" } } } } });
      const cardBefore = fs.readFileSync(path.join(root, "characters/bram/card.json"), "utf8");
      fs.mkdirSync(path.join(root, "lorebooks"), { recursive: true });
      const marianna = String.fromCharCode(0x041c) + String.fromCharCode(0x0430) + String.fromCharCode(0x0440) + String.fromCharCode(0x0438) + String.fromCharCode(0x0430) + String.fromCharCode(0x043d) + String.fromCharCode(0x043d) + String.fromCharCode(0x0430); // Марианна
      fs.writeFileSync(path.join(root, "lorebooks/lb1.json"), JSON.stringify({
        entries: [{ keys: ["Marianne", marianna, "harp"], content: "A character" }],
      }));
      writeChat("c1", three(), { characterId: "bram", lorebookIds: ["lb1"] });
      const mock = mockHost([reply({ present: [marianna], minutes: 1 })]);
      update(mock, "c1");
      // the snapshot should have the Cyrillic name with the correct soul (resolved through lorebook aliases)
      const snap = readStateFile("c1").snapshots["m3#0"];
      expect(snap.present).toContain(marianna);
      expect(snap.chars[marianna].cls).toBe("ally");
      // the prompt insert finds the same soul for the Cyrillic name
      const pv = drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1", speaker: marianna } });
      expect(String(pv.json.insert && pv.json.insert.text)).toContain("hums an old song");
      // a lowercase key is no name, and the card is never written
      expect(P.soulOf({ Marianne: { aliases: [] } }, "harp")).toBeUndefined();
      expect(fs.readFileSync(path.join(root, "characters/bram/card.json"), "utf8")).toBe(cardBefore);
    });
  });

  describe("rating a card", () => {
    it("pass A writes nothing and asks with the soul prompt, the event list and the card", () => {
      writeCard("bram", { name: "Bram", description: "A narrator of the sea.", personality: "calm", scenario: "A harbour town.", first_mes: "Welcome to the harbour." });
      fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: "app/default" }));
      const mock = mockHost();
      const out = P.handleRoute({ method: "POST", path: "/dashboard/soul/rate", query: {}, body: { characterId: "bram" } }, mock.host);
      expect(out.__llmPending).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["soul_rate"]);
      expect(fs.existsSync(path.join(root, "dashboard/soul-drafts"))).toBe(false);
      const { req } = mock.requests[0]!;
      expect(req.systemPrompt.startsWith(P.DEFAULT_PROMPTS.soul)).toBe(true);
      expect(req.systemPrompt).toContain("\n\nEvent ids\nkept_promise: did what was promised\n");
      expect(req.systemPrompt).toContain("novelty: something new or surprising");
      expect(req.systemPrompt).not.toContain("other: anything else");
      expect(req.systemPrompt).toContain("Stat names: trust, comfort, attraction, respect, affection, excitement, arousal, hostility");
      expect(req.systemPrompt).toContain('Reply with JSON only: {"characters": {"<name>": {"class"');
      expect(CYRILLIC.test(req.systemPrompt)).toBe(false);
      expect(req.presetParams).toEqual({ temperature: 0.3, max_tokens: 3000 });
      // no chat: the app's default model
      expect(req.model).toBe("app/default");
      const user = req.messages[0].content as string;
      expect(user.startsWith("Card: Bram\n\nDescription\nA narrator of the sea.\n\nPersonality\ncalm\n\nScenario\nA harbour town.\n\nFirst message\nWelcome to the harbour.")).toBe(true);
      expect(user).not.toContain("never rate them");
    });

    it("a family a chat switched off is still in the list", () => {
      writeCard("bram", { name: "Bram" });
      const mock = mockHost();
      drive(mock, { method: "PUT", path: "/dashboard/config", body: { families: { body: false } } });
      P.handleRoute({ method: "POST", path: "/dashboard/soul/rate", query: {}, body: { characterId: "bram" } }, mock.host);
      expect(mock.requests[0]!.req.systemPrompt).toContain("gentle_touch: wanted, gentle touch");
    });

    it("the model: the sensor model, else the chat's, else the app's, else none", () => {
      writeCard("bram", { name: "Bram" });
      writeChat("c1", three(), { characterId: "bram" });
      const ask = (body: Record<string, unknown>, mock = mockHost()) => {
        P.handleRoute({ method: "POST", path: "/dashboard/soul/rate", query: {}, body }, mock.host);
        return mock.requests[0]!.req;
      };
      expect(ask({ characterId: "bram", chatId: "c1" }).model).toBe("chat/model");
      expect(ask({ characterId: "bram" })).not.toHaveProperty("model");
      const mock = mockHost();
      drive(mock, { method: "PUT", path: "/dashboard/config", body: { sensorModel: "free/small" } });
      expect(ask({ characterId: "bram", chatId: "c1" }, mock).model).toBe("free/small");
    });

    it("the user message: the card's lorebooks, disabled entries skipped, the user's character named", () => {
      const big = (n: number, ch: string) => ch.repeat(n);
      writeCard("bram", {
        name: "Bram",
        description: big(5000, "d"),
        personality: big(2500, "p"),
        scenario: big(2500, "s"),
        first_mes: big(2000, "f"),
        character_book: { name: "Inside", entries: [{ comment: "Garrett", content: "A smith with a limp.", keys: ["garrett"] }] },
        studio: { embeddedLorebookId: "lb1", linkedLorebookIds: ["lb2"] },
      });
      fs.mkdirSync(path.join(root, "lorebooks"), { recursive: true });
      const book = (o: unknown) => JSON.stringify(o);
      fs.writeFileSync(path.join(root, "lorebooks/lb1.json"), book({ name: "World", entries: [{ name: "Sea", content: "The sea is cold." }, { comment: "Hidden", content: "never shown", disable: true }, { keys: ["k1", "k2"], content: "also hidden", enabled: false }, { keys: ["k3", "k4"], content: "Keyed entry." }] }));
      fs.writeFileSync(path.join(root, "lorebooks/lb2.json"), book({ name: "Ports", entries: { "0": { comment: "Dock", content: "The dock creaks." } } }));
      fs.writeFileSync(path.join(root, "lorebooks/lb3.json"), book({ name: "Chat book", entries: [{ comment: "Long", content: big(1500, "L") }] }));
      writeChat("c1", three(), { characterId: "bram", lorebookIds: ["lb3", "lb1", "../bad"] });
      const mock = mockHost();
      P.handleRoute({ method: "POST", path: "/dashboard/soul/rate", query: {}, body: { characterId: "bram", chatId: "c1" } }, mock.host);
      const user = mock.requests[0]!.req.messages[0].content as string;
      const cardPart = user.slice(0, user.indexOf("\n\nLorebook:"));
      expect(cardPart.length).toBeLessThanOrEqual(8000);
      expect(cardPart).toContain("Description\n" + big(4000, "d"));
      expect(cardPart).not.toContain(big(4001, "d"));
      expect(cardPart).toContain("Personality\n" + big(2000, "p"));
      expect(user).toContain("Lorebook: Inside\n- Garrett: A smith with a limp.");
      expect(user).toContain("Lorebook: World\n- Sea: The sea is cold.\n- k3, k4: Keyed entry.");
      expect(user).toContain("Lorebook: Ports\n- Dock: The dock creaks.");
      expect(user).toContain("Lorebook: Chat book\n- Long: " + big(1200 - "- Long: ".length, "L") + "\n");
      expect(user).not.toContain("never shown");
      expect(user).not.toContain("also hidden");
      // lb1 is used once, though the card and the chat both name it
      expect(user.split("Lorebook: World").length).toBe(2);
      expect(user.endsWith("The user's character is You: never rate them.")).toBe(true);
      // the lorebook part stops when it is full
      const entries = Array.from({ length: 20 }, (_, i) => ({ comment: "E" + i, content: big(1500, "x") }));
      fs.writeFileSync(path.join(root, "lorebooks/lb3.json"), book({ name: "Chat book", entries }));
      const m2 = mockHost();
      P.handleRoute({ method: "POST", path: "/dashboard/soul/rate", query: {}, body: { characterId: "bram", chatId: "c1" } }, m2.host);
      const u2 = m2.requests[0]!.req.messages[0].content as string;
      expect(u2).toContain("(more entries left out)");
      const books = u2.slice(u2.indexOf("\n\nLorebook:"), u2.indexOf("\n\n(more entries left out)"));
      expect(books.length).toBeLessThanOrEqual(10000 + 400);
      expect(u2).not.toContain("- E19:");
    });

    it("pass B writes a normalized proposal, by auto, with the model's note", () => {
      writeCard("bram", { name: "Bram" });
      const mock = mockHost([soulReply]);
      const before = Date.now();
      const r = rate(mock, { characterId: "bram" });
      expect(r.status).toBe(200);
      expect(r.json.ok).toBe(true);
      const d = readDraftFile("bram");
      expect(r.json.draft).toEqual(d);
      expect(d).toMatchObject({ v: 1, by: "auto", model: "mock/sensor", note: "Chosen from the card" });
      expect(d.at).toBeGreaterThanOrEqual(before);
      expect(d.error).toBeUndefined();
      expect(Object.keys(d.characters)).toEqual(["Medli"]);
      expect(d.characters.Medli).toEqual({
        class: "ally",
        pronouns: "she",
        aliases: ["Медли"],
        start: { trust: 5 },
        traits: { shyness: 72 },
        triggers: [{ cue: "shouting", event: "raised_voice", stat: "comfort", x: 1.5 }],
      });
      // the proposal is in the GET route too
      expect(drive(mock, { method: "GET", path: "/dashboard/soul-draft", query: { characterId: "bram" } }).json.draft).toEqual(d);
    });

    it("a reply that is not JSON, an error, or no characters writes a proposal with an error", () => {
      writeCard("bram", { name: "Bram" });
      const mock = mockHost(["I am sorry, I cannot do that."]);
      let r = rate(mock, { characterId: "bram" });
      expect(r.json.ok).toBe(false);
      expect(r.json.draft).toMatchObject({ v: 1, by: "auto", characters: {}, error: "the reply was not JSON" });
      expect(readDraftFile("bram").error).toBe("the reply was not JSON");
      mock.push({ error: "model unavailable" });
      r = rate(mock, { characterId: "bram" });
      expect(r.json.ok).toBe(false);
      expect(readDraftFile("bram")).toMatchObject({ error: "model unavailable", characters: {} });
      mock.push("   ");
      expect(rate(mock, { characterId: "bram" }).json.draft.error).toBe("the model returned nothing");
      mock.push(reply({ note: "none" }));
      expect(rate(mock, { characterId: "bram" }).json.draft.error).toBe("the reply had no characters");
      // none fit: not an error, an empty proposal with the note
      mock.push(reply({ characters: {}, note: "Only a narrator." }));
      const none = rate(mock, { characterId: "bram" });
      expect(none.json.ok).toBe(true);
      expect(none.json.draft).toMatchObject({ characters: {}, note: "Only a narrator." });
      expect(none.json.draft.error).toBeUndefined();
      // a fenced reply parses, like the sensor's
      mock.push("```json\n" + soulReply + "\n```");
      expect(rate(mock, { characterId: "bram" }).json.ok).toBe(true);
    });

    it("the rating request's user message has the names section with counts when the card's chats saw names", () => {
      writeCard("bram", { name: "Bram" });
      const now = Date.now();
      writeChat("c1", three(), { characterId: "bram", updatedAt: now });
      writeChat("c2", three(), { characterId: "bram", updatedAt: now - 5000 });
      // Create state files with snapshots
      const stateFile1 = path.join(root, "dashboard/state/c1.json");
      fs.mkdirSync(path.dirname(stateFile1), { recursive: true });
      fs.writeFileSync(stateFile1, JSON.stringify({
        v: 2, chatId: "c1", snapshots: {
          "m1#0": { turn: 1, at: 1, present: ["Medli", "Garrett"], chars: {} },
          "m2#0": { turn: 2, at: 2, present: ["Medli", "Garrett"], chars: {} },
          "m3#0": { turn: 3, at: 3, present: ["Medli", "Garrett"], chars: {} },
        },
      }));
      const stateFile2 = path.join(root, "dashboard/state/c2.json");
      fs.writeFileSync(stateFile2, JSON.stringify({
        v: 2, chatId: "c2", snapshots: {
          "m1#0": { turn: 1, at: 1, present: ["Garrett", "Brigid"], chars: {} },
          "m2#0": { turn: 2, at: 2, present: ["Garrett", "Brigid"], chars: {} },
          "m3#0": { turn: 3, at: 3, present: ["Garrett", "Brigid"], chars: {} },
        },
      }));
      const mock = mockHost();
      const r = P.handleRoute({ method: "POST", path: "/dashboard/soul/rate", query: {}, body: { characterId: "bram" } }, mock.host);
      const user = mock.requests[0]!.req.messages[0].content as string;
      // names section appears when there are names
      expect(user).toContain("Names seen in this card's chats (most seen first):");
      expect(user).toContain("Garrett (6)"); // present in 3 snapshots in c1 + 3 in c2
      expect(user).toContain("Medli (3)"); // present in 3 snapshots in c1
      expect(user).toContain("Brigid (3)"); // present in 3 snapshots in c2
    });

    it("a reply's minor is carried into the proposal file", () => {
      writeCard("bram", { name: "Bram" });
      const mock = mockHost([
        reply({
          characters: { Medli: { class: "ally" } },
          minor: ["Narrator", "Guard"],
          note: "n",
        }),
      ]);
      rate(mock, { characterId: "bram" });
      const draft = readDraftFile("bram");
      expect(draft.minor).toEqual(["Narrator", "Guard"]);
    });

    it("a rate-limited reply is asked once more, and only once", () => {
      writeCard("bram", { name: "Bram" });
      const mock = mockHost([{ error: "HTTP 429 rate limited" }, soulReply]);
      expect(rate(mock, { characterId: "bram" }).json.ok).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["soul_rate", "soul_rate_retry"]);
      const again = mockHost([{ error: "429" }, { error: "429" }]);
      const r = rate(again, { characterId: "bram" });
      expect(r.json.ok).toBe(false);
      expect(again.requests.length).toBe(2);
      // the first rating left a live proposal: a failure writes nothing over it
      expect(r.json.error).toBe("429");
      expect(readDraftFile("bram").error).toBeUndefined();
    });

    it("400 for a bad id, 404 for a missing card", () => {
      const mock = mockHost();
      expect(rate(mock, {}).status).toBe(400);
      expect(rate(mock, { characterId: "../x" }).status).toBe(400);
      expect(rate(mock, { characterId: "nobody" }).status).toBe(404);
      expect(mock.requests.length).toBe(0);
    });

    it("auto: skipped with a soul, with a proposal of any state, or with the setting off; rated otherwise", () => {
      writeCard("bram", { name: "Bram" });
      const mock = mockHost([soulReply]);
      // the fixture has the setting off
      expect(rate(mock, { characterId: "bram", auto: true }).json).toEqual({ skipped: true });
      autoOn(mock);
      // aria has a soul
      expect(rate(mock, { characterId: "aria", auto: true }).json).toEqual({ skipped: true });
      expect(mock.requests.length).toBe(0);
      // a proposal file counts: dismissed, live, or failed less than ten minutes ago
      for (const draft of [{ v: 1, at: 1, by: "auto", characters: {}, dismissedAt: 5 }, { v: 1, at: Date.now() - 60_000, by: "auto", characters: {}, error: "x" }, { v: 1, at: 1, by: "auto", characters: { Medli: {} } }]) {
        writeDraft("bram", draft);
        expect(rate(mock, { characterId: "bram", auto: true }).json).toEqual({ skipped: true });
      }
      expect(mock.requests.length).toBe(0);
      // an older failure is tried again
      writeDraft("bram", { v: 1, at: Date.now() - 11 * 60_000, by: "auto", characters: {}, error: "429 rate limit" });
      expect(rate(mock, { characterId: "bram", auto: true }).json.ok).toBe(true);
      expect(readDraftFile("bram").error).toBeUndefined();
      mock.push(soulReply);
      // the button (not auto) still works over a dismissed one, and replaces it
      writeDraft("bram", { v: 1, at: 1, by: "auto", characters: {}, dismissedAt: 5 });
      expect(rate(mock, { characterId: "bram" }).json.ok).toBe(true);
      expect(readDraftFile("bram").dismissedAt).toBeUndefined();
      // nothing in the way: auto rates
      fs.rmSync(draftFile("bram"));
      mock.push(soulReply);
      expect(rate(mock, { characterId: "bram", auto: true }).json.ok).toBe(true);
      expect(fs.existsSync(draftFile("bram"))).toBe(true);
    });

    it("rating with names: merges into existing proposal, keeps others, unions minor", () => {
      writeCard("bram", { name: "Bram" });
      // write an existing proposal with multiple characters
      writeDraft("bram", {
        v: 1,
        at: 100,
        by: "auto",
        characters: { Medli: { class: "ally", pronouns: "she", aliases: ["Медли"], start: { trust: 5 }, traits: { shyness: 72 }, triggers: [{ cue: "shouting", event: "raised_voice", stat: "comfort", x: 1.5 }] }, Isolde: { class: "romantic" } },
        minor: ["Guard"],
        note: "Old note",
      });
      // rate only Medli with new values
      const newReply = reply({
        characters: {
          Medli: { class: "neutral", pronouns: "they", aliases: ["Medli alt"] },
        },
        minor: ["Passer-by"],
        note: "Updated Medli",
      });
      const mock = mockHost([newReply]);
      const r = rate(mock, { characterId: "bram", names: ["Medli"] });
      expect(r.json.ok).toBe(true);
      const merged = readDraftFile("bram");
      // Medli is replaced, Isolde kept
      expect(merged.characters.Medli).toMatchObject({ class: "neutral", pronouns: "they" });
      expect(merged.characters.Isolde).toEqual({ class: "romantic" });
      // minors are unioned
      expect(merged.minor).toContain("Guard");
      expect(merged.minor).toContain("Passer-by");
      // new note replaces old one
      expect(merged.note).toBe("Updated Medli");
      // check the request had the names line
      expect(mock.requests[0]!.req.messages[0].content).toContain("Rate only these characters, and use exactly these names as keys: Medli.");
    });

    it("a failed named rating keeps the existing proposal untouched", () => {
      writeCard("bram", { name: "Bram" });
      const existing = {
        v: 1,
        at: 100,
        by: "auto",
        characters: { Medli: { class: "ally", start: { trust: 5 } } },
        note: "Original",
      };
      writeDraft("bram", existing);
      const mock = mockHost([{ error: "model unavailable" }]);
      const r = rate(mock, { characterId: "bram", names: ["Medli"] });
      expect(r.json.ok).toBe(false);
      expect(r.json.error).toBe("model unavailable");
      // the original file is not changed
      const kept = readDraftFile("bram");
      expect(kept).toEqual(existing);
      // a reply that is not JSON is a failure too, and writes nothing
      const mock2 = mockHost([{ text: "Sure! Here are the souls you asked for." }]);
      const r2 = rate(mock2, { characterId: "bram", names: ["Medli"] });
      expect(r2.json.ok).toBe(false);
      expect(readDraftFile("bram")).toEqual(existing);
    });

    it("names parameter with auto: true is treated as not auto (the button asked for it)", () => {
      writeCard("bram", { name: "Bram" });
      const mock = mockHost([soulReply]);
      // with auto: true and names, it should not skip
      const r = rate(mock, { characterId: "bram", auto: true, names: ["Medli"] });
      expect(r.json.ok).toBe(true);
      expect(mock.requests.length).toBe(1);
    });
  });

  describe("the update rates first", () => {
    const sensorReply = reply({ present: ["Medli"], minutes: 5 });
    const pass = (mock: ReturnType<typeof mockHost>, call: any, out: any) => {
      if (out.stash) call.stash = out.stash;
      mock.answer();
      return P.handleRoute(call, mock.host);
    };
    beforeEach(() => {
      writeCard("bram", { name: "Bram" });
      writeChat("c1", three(), { characterId: "bram" });
    });

    it("pass 1 asks only the rating, pass 2 writes it and asks the sensor, pass 3 commits with the new soul", () => {
      const mock = mockHost([soulReply, sensorReply]);
      autoOn(mock);
      const call: any = { method: "POST", path: "/dashboard/update", query: {}, body: { chatId: "c1" } };
      const a = P.handleRoute(call, mock.host);
      expect(a.__llmPending).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["soul_rate_bram"]);
      expect(a.stash).toMatchObject({ chatId: "c1", rating: ["bram"] });
      // pass A of the whole flow writes nothing
      expect(fs.existsSync(path.join(root, "dashboard/soul-drafts"))).toBe(false);
      expect(fs.existsSync(path.join(root, "dashboard/state"))).toBe(false);
      const b = pass(mock, call, a);
      expect(b.__llmPending).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["soul_rate_bram", "sensor"]);
      expect(b.stash.rated).toBe(true);
      expect(readDraftFile("bram")).toMatchObject({ by: "auto", note: "Chosen from the card" });
      expect(fs.existsSync(path.join(root, "dashboard/state"))).toBe(false);
      // the sensor already knows the new soul
      expect(mock.requests[1]!.req.messages[0].content).toContain("Medli (ally, she)");
      const c = pass(mock, call, b);
      expect(c.json.ok).toBe(true);
      const snap = readStateFile("c1").snapshots["m3#0"];
      expect(snap.chars.Medli.cls).toBe("ally");
      // no events toward her: she starts from her start values
      expect(snap.chars.Medli.stats).toEqual({ trust: 5, comfort: 0, attraction: 0, respect: 0, affection: 0 });
      expect(mock.requests.length).toBe(2);
      // the same chat again changes nothing and asks nothing
      expect(update(mock, "c1").json.unchanged).toBe(true);
      expect(mock.requests.length).toBe(2);
    });

    it("the rating is not asked again once the proposal exists, and a later chat uses it", () => {
      const mock = mockHost([soulReply, sensorReply]);
      autoOn(mock);
      update(mock, "c1");
      writeChat("c2", three(), { characterId: "bram" });
      mock.push(reply({ present: ["Medli"], events: [{ id: "compliment", weight: "routine", from: "user", to: "Medli" }] }));
      expect(update(mock, "c2").json.ok).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["soul_rate_bram", "sensor", "sensor"]);
      // she starts at trust 5 and a compliment adds to affection and attraction
      expect(readStateFile("c2").snapshots["m3#0"].chars.Medli.stats).toMatchObject({ trust: 5, affection: 1, attraction: 1 });
    });

    it("a dismissed or failed proposal: no rating, and its souls are not used", () => {
      for (const draft of [
        { v: 1, at: 1, by: "auto", characters: { Medli: { class: "ally", start: { trust: 5 } } }, dismissedAt: 5 },
        { v: 1, at: Date.now(), by: "auto", characters: { Medli: { class: "ally", start: { trust: 5 } } }, error: "boom" },
      ]) {
        writeDraft("bram", draft);
        fs.rmSync(path.join(root, "dashboard/state"), { recursive: true, force: true });
        const mock = mockHost([sensorReply]);
        autoOn(mock);
        expect(update(mock, "c1").json.ok).toBe(true);
        expect(mock.requests.map((x) => x.key)).toEqual(["sensor"]);
        expect(mock.requests[0]!.req.messages[0].content).not.toContain("Medli (ally, she)");
        const who = readStateFile("c1").snapshots["m3#0"].chars.Medli;
        expect(who.cls).toBe("neutral");
        expect(who.stats.trust).toBe(0);
      }
    });

    it("autoSoul off, manual mode, or a card with a soul: the sensor alone", () => {
      // off (the fixture)
      let mock = mockHost([sensorReply]);
      expect(update(mock, "c1").json.ok).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["sensor"]);
      expect(fs.existsSync(path.join(root, "dashboard/soul-drafts"))).toBe(false);
      // manual mode: the route still updates, without rating
      fs.rmSync(path.join(root, "dashboard/state"), { recursive: true, force: true });
      mock = mockHost([sensorReply]);
      drive(mock, { method: "PUT", path: "/dashboard/config", body: { autoSoul: "on", mode: "manual" } });
      expect(update(mock, "c1").json.ok).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["sensor"]);
      // a card with a soul (Aria)
      writeChat("c3", three());
      mock = mockHost([keptPromise]);
      autoOn(mock);
      drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "sensor" } });
      expect(update(mock, "c3").json.ok).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["sensor"]);
    });

    it("a failed rating still lets the update run, and leaves a proposal with the error", () => {
      const mock = mockHost([{ error: "HTTP 500" }, sensorReply]);
      autoOn(mock);
      expect(update(mock, "c1").json.ok).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["soul_rate_bram", "sensor"]);
      expect(readDraftFile("bram")).toMatchObject({ error: "HTTP 500", characters: {} });
      expect(readStateFile("c1").snapshots["m3#0"].chars.Medli.cls).toBe("neutral");
    });

    it("after a rating a rate-limited sensor is not retried: it is recorded as the error", () => {
      const mock = mockHost([soulReply, { error: "HTTP 429 rate limited" }]);
      autoOn(mock);
      const r = update(mock, "c1");
      expect(r.json.ok).toBe(false);
      expect(r.json.error).toBe("HTTP 429 rate limited");
      expect(mock.requests.map((x) => x.key)).toEqual(["soul_rate_bram", "sensor"]);
      expect(readStateFile("c1").lastError.message).toBe("HTTP 429 rate limited");
      // the proposal was kept: the next try goes straight to the sensor
      expect(fs.existsSync(draftFile("bram"))).toBe(true);
      mock.push(sensorReply);
      expect(update(mock, "c1").json.ok).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["soul_rate_bram", "sensor", "sensor"]);
    });

    it("a group rates the member cards without a soul, at most four", () => {
      for (let i = 1; i <= 6; i++) writeCard("n" + i, { name: "N" + i });
      fs.writeFileSync(path.join(root, "groups/g2.json"), JSON.stringify({ memberIds: ["aria", "n1", "n2", "n3", "n4", "n5", "n6", "n1"], mode: "round" }));
      writeChat("g2", three(), { characterId: undefined, groupId: "g2" });
      const mock = mockHost();
      autoOn(mock);
      const out = P.handleRoute({ method: "POST", path: "/dashboard/update", query: {}, body: { chatId: "g2" } }, mock.host);
      expect(out.__llmPending).toBe(true);
      expect(mock.requests.map((x) => x.key)).toEqual(["soul_rate_n1", "soul_rate_n2", "soul_rate_n3", "soul_rate_n4"]);
      expect(out.stash.rating).toEqual(["n1", "n2", "n3", "n4"]);
    });

    it("a proposal found on disk by pass 2 is not overwritten", () => {
      const mock = mockHost([soulReply, sensorReply]);
      autoOn(mock);
      const call: any = { method: "POST", path: "/dashboard/update", query: {}, body: { chatId: "c1" } };
      const a = P.handleRoute(call, mock.host);
      // someone else got there first (the user dismissed it)
      writeDraft("bram", { v: 1, at: 7, by: "molfar", characters: {}, dismissedAt: 8 });
      pass(mock, call, a);
      expect(readDraftFile("bram")).toEqual({ v: 1, at: 7, by: "molfar", characters: {}, dismissedAt: 8 });
    });

    it("the catch-up tick rates first too", () => {
      const mock = mockHost([soulReply, sensorReply]);
      autoOn(mock);
      writeChat("c1", three(), { characterId: "bram", updatedAt: Date.now() - 5 * 60_000 });
      let ctx: any = { pluginId: "relations" };
      const seen: string[][] = [];
      for (let p = 0; p < 3; p++) {
        for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as any)[k];
        if (p > 0) mock.answer();
        const out = P.onTick(ctx, mock.host);
        seen.push(mock.requests.map((x) => x.key));
        if (out && typeof out === "object") ctx = out;
        if (p === 0) {
          expect(fs.existsSync(path.join(root, "dashboard/soul-drafts"))).toBe(false);
          expect(fs.existsSync(path.join(root, "dashboard/state"))).toBe(false);
        }
      }
      expect(seen).toEqual([["soul_rate_bram"], ["soul_rate_bram", "sensor"], ["soul_rate_bram", "sensor"]]);
      const snap = readStateFile("c1").snapshots["m3#0"];
      expect(snap.op).toBe("catchup");
      expect(snap.chars.Medli.stats.trust).toBe(5);
    });
  });

  describe("guests", () => {
    const stateWith = (chatId: string, presents: string[][]) => {
      fs.mkdirSync(path.join(root, "dashboard/state"), { recursive: true });
      const snapshots: Record<string, unknown> = {};
      presents.forEach((present, i) => (snapshots[`m${i}#0`] = { turn: i + 1, at: i + 1, present, chars: {} }));
      fs.writeFileSync(stateFile(chatId), JSON.stringify({ v: 2, chatId, snapshots }));
    };
    const guests = (mock: ReturnType<typeof mockHost>, characterId = "bram") => drive(mock, { method: "GET", path: "/dashboard/guests", query: { characterId } });

    it("names seen with no soul, most seen first; the user, other cards and groups left out", () => {
      writeCard("bram", { name: "Bram", extensions: { molfar_soul: { v: 1, characters: { Medli: { class: "ally", aliases: ["Медли"] } } } } });
      writeDraft("bram", { v: 1, at: 1, by: "auto", characters: { Isolde: { class: "ally" } } });
      const now = Date.now();
      writeChat("a", [], { characterId: "bram", updatedAt: now });
      writeChat("b", [], { characterId: "bram", updatedAt: now - 5000 });
      writeChat("other", [], { characterId: "aria", updatedAt: now });
      writeChat("grp", [], { characterId: "bram", groupId: "g1", updatedAt: now });
      stateWith("a", [["Garrett", "Медли", "You"], ["Garrett", "Isolde", "You"]]);
      stateWith("b", [["Garrett", "Medli", "Brigid"]]);
      stateWith("other", [["Zed"]]);
      stateWith("grp", [["Yan"]]);
      const mock = mockHost();
      const r = guests(mock);
      expect(r.status).toBe(200);
      expect(r.json.seen).toEqual(["Garrett", "You", "Медли", "Isolde", "Medli", "Brigid"]);
      // Brigid was seen once: a passer-by, not a guest
      expect(r.json.guests).toEqual(["Garrett"]);
      // a dismissed proposal gives no soul: Isolde, seen twice, is a guest again
      writeDraft("bram", { v: 1, at: 1, by: "auto", characters: {}, dismissedAt: 5 });
      stateWith("b", [["Garrett", "Medli", "Brigid", "Isolde"]]);
      expect(guests(mock).json.guests).toEqual(["Garrett", "Isolde"]);
      // a name the card keeps as minor is no guest, in any script
      writeCard("bram", { name: "Bram", extensions: { molfar_soul: { v: 1, characters: { Medli: { class: "ally", aliases: ["Медли"] } }, minor: ["Гарретт"] } } });
      expect(guests(mock).json.guests).toEqual(["Isolde"]);
      // another card (Zed seen once), and a card with no chats
      expect(guests(mock, "aria").json).toEqual({ guests: [], seen: ["Zed"] });
      writeCard("empty", { name: "Empty" });
      expect(guests(mock, "empty").json).toEqual({ guests: [], seen: [] });
    });

    it("only the newest 30 chats count", () => {
      writeCard("bram", { name: "Bram" });
      const now = Date.now();
      for (let i = 0; i < 32; i++) {
        writeChat("x" + i, [], { characterId: "bram", updatedAt: now - i * 1000 });
        stateWith("x" + i, [[i >= 30 ? "Old" : "Recent"]]);
      }
      expect(guests(mockHost()).json.seen).toEqual(["Recent"]);
    });

    it("400 for a bad id, 404 for a missing card", () => {
      const mock = mockHost();
      expect(guests(mock, "../x").status).toBe(400);
      expect(drive(mock, { method: "GET", path: "/dashboard/guests", query: {} }).status).toBe(400);
      expect(guests(mock, "nobody").status).toBe(404);
    });
  });

  describe("re-keying proposals to saved souls", () => {
    it("a re-rating on request (names) with Cyrillic spellings lands under saved souls with aliases added", () => {
      writeCard("bram", {
        name: "Bram",
        extensions: {
          molfar_soul: {
            v: 1,
            characters: {
              Medli: { class: "ally", aliases: [], traits: { shyness: 72 }, locked: true },
              Marianne: { class: "ally", aliases: [] },
            },
          },
        },
      });
      const soulReplyWithCyrillic = `{
        "characters": {
          "Медли": { "class": "romantic", "pronouns": "she", "traits": { "shyness": 40 } },
          "Марианна": { "class": "ally", "pronouns": "she" },
          "Kefka": { "class": "neutral", "pronouns": "they" }
        }
      }`;
      const mock = mockHost([soulReplyWithCyrillic]);
      const r = drive(mock, {
        method: "POST",
        path: "/dashboard/soul/rate",
        body: { characterId: "bram", names: ["Medli", "Marianne"] },
      });
      expect(r.json.ok).toBe(true);
      expect(r.json.added).toEqual(["Medli", "Marianne", "Kefka"]);
      const draft = readDraftFile("bram");
      expect(Object.keys(draft.characters)).toEqual(["Medli", "Marianne", "Kefka"]);
      expect(draft.characters.Medli.aliases).toContain("Медли");
      expect(draft.characters.Marianne.aliases).toContain("Марианна");
      // the re-rating brings its own values: the saved soul is only what the editor compares with
      expect(draft.characters.Medli.class).toBe("romantic");
      expect(draft.characters.Medli.traits.shyness).toBe(40);
      expect(draft.characters.Medli.locked).toBeUndefined();
    });

    it("GET soul-draft of a hand-written proposal keyed in Cyrillic returns it under saved key", () => {
      writeCard("bram", {
        name: "Bram",
        extensions: {
          molfar_soul: {
            v: 1,
            characters: { Medli: { class: "ally", aliases: [] } },
          },
        },
      });
      writeDraft("bram", {
        v: 1,
        at: 1,
        by: "molfar",
        characters: { Медли: { class: "ally", pronouns: "she" } },
      });
      const mock = mockHost();
      const r = drive(mock, {
        method: "GET",
        path: "/dashboard/soul-draft",
        query: { characterId: "bram" },
      });
      expect(r.json.draft.characters).toHaveProperty("Medli");
      expect(r.json.draft.characters.Medli.aliases).toContain("Медли");
      expect(Object.keys(r.json.draft.characters)).not.toContain("Медли");
      // file is not rewritten
      expect(readDraftFile("bram").characters).toHaveProperty("Медли");
    });

    it("cardType is carried in proposals and kept on merge", () => {
      writeCard("bram", { name: "Bram" });
      const soulReplyWithCardType = `{
        "characters": {
          "Medli": { "class": "ally", "pronouns": "she" }
        },
        "cardType": "narrator"
      }`;
      const mock = mockHost([soulReplyWithCardType]);
      const r = drive(mock, {
        method: "POST",
        path: "/dashboard/soul/rate",
        body: { characterId: "bram" },
      });
      expect(r.json.draft.cardType).toBe("narrator");
      // invalid cardType is dropped (the first proposal would give its own cardType to the merge)
      fs.rmSync(draftFile("bram"));
      const mockBad = mockHost([`{
        "characters": { "Medli": { "class": "ally" } },
        "cardType": "robot"
      }`]);
      const rBad = drive(mockBad, {
        method: "POST",
        path: "/dashboard/soul/rate",
        body: { characterId: "bram" },
      });
      expect(rBad.json.draft.cardType).toBeUndefined();
    });

    it("named-rating merge keeps existing cardType when new reply has none", () => {
      writeCard("bram", { name: "Bram" });
      writeDraft("bram", {
        v: 1,
        at: 1,
        by: "auto",
        cardType: "narrator",
        characters: { Medli: { class: "ally" } },
      });
      const soulReplyNoCardType = `{
        "characters": { "Kefka": { "class": "hostile" } }
      }`;
      const mock = mockHost([soulReplyNoCardType]);
      const r = drive(mock, {
        method: "POST",
        path: "/dashboard/soul/rate",
        body: { characterId: "bram", names: ["Kefka"] },
      });
      expect(r.json.draft.cardType).toBe("narrator");
    });
  });

  describe("settled proposals, removing one name, and Rate now", () => {
    const savedCard = () =>
      writeCard("bram", { name: "Bram", extensions: { molfar_soul: { v: 1, characters: { Medli: { ...medli(), locked: true, ratedBy: "user" }, Garrett: { class: "hostile", traits: { dominance: 80 } } } } } });
    const del = (mock: ReturnType<typeof mockHost>, query: Record<string, string>) => drive(mock, { method: "DELETE", path: "/dashboard/soul-draft", query: { characterId: "bram", ...query } });
    const get = (mock: ReturnType<typeof mockHost>) => drive(mock, { method: "GET", path: "/dashboard/soul-draft", query: { characterId: "bram" } }).json.draft;

    it("DELETE of one name goes through the re-keying: the Cyrillic key goes, the other fields stay", () => {
      savedCard();
      writeDraft("bram", { v: 1, at: 5, by: "molfar", model: "m/x", note: "n", cardType: "narrator", minor: ["стражник"], characters: { Медли: { class: "ally" }, Chandra: { class: "neutral" } } });
      const mock = mockHost();
      expect(get(mock).characters).toHaveProperty("Medli");
      expect(del(mock, { accepted: "1", name: "Medli" }).json).toEqual({ ok: true });
      expect(readDraftFile("bram")).toEqual({ v: 1, at: 5, by: "molfar", model: "m/x", note: "n", cardType: "narrator", minor: ["стражник"], characters: { Chandra: { class: "neutral" } } });
      // the last name takes the file with it
      expect(del(mock, { accepted: "1", name: "chandra" }).json.ok).toBe(true);
      expect(fs.existsSync(draftFile("bram"))).toBe(false);
    });

    it("DELETE of one name removes twins (a name and its other spelling)", () => {
      savedCard();
      writeDraft("bram", { v: 1, at: 5, by: "auto", characters: { Medli: { class: "ally" }, Медли: { class: "romantic" } } });
      const mock = mockHost();
      del(mock, { accepted: "1", name: "Medli" });
      expect(fs.existsSync(draftFile("bram"))).toBe(false);
      writeDraft("bram", { v: 1, at: 5, by: "auto", characters: { Medli: { class: "ally" }, Медли: { class: "romantic" }, Isolde: { class: "ally" } } });
      del(mock, { accepted: "1", name: "Medli" });
      expect(Object.keys(readDraftFile("bram").characters)).toEqual(["Isolde"]);
    });

    it("GET drops a proposal that equals the saved soul, and keeps one that differs", () => {
      savedCard();
      const same = { ...medli(), aliases: ["Medli alt"], ratedBy: "molfar", extra: 1, spectra: Object.fromEntries(Object.entries(SPECTRA).reverse()) };
      writeDraft("bram", { v: 1, at: 5, by: "auto", note: "n", characters: { Medli: same, Garrett: { class: "hostile", traits: { dominance: 70 } }, Chandra: {} } });
      const mock = mockHost();
      const d = get(mock);
      expect(Object.keys(d.characters)).toEqual(["Garrett", "Chandra"]);
      expect(d.note).toBe("n");
      // the file is not rewritten, and the same through another spelling
      expect(Object.keys(readDraftFile("bram").characters)).toEqual(["Medli", "Garrett", "Chandra"]);
      writeDraft("bram", { v: 1, at: 5, by: "auto", characters: { Медли: same } });
      expect(get(mock).characters).toEqual({});
      // missing class and pronouns count as neutral and they
      writeDraft("bram", { v: 1, at: 5, by: "auto", characters: { Garrett: { class: "hostile", pronouns: "they", traits: { dominance: 80 } } } });
      expect(get(mock).characters).toEqual({});
    });

    it("Rate now rates only characters with no soul: another spelling and a minor name of a saved soul are dropped", () => {
      savedCard();
      const mock = mockHost([reply({ characters: { Медли: { class: "romantic", pronouns: "she" }, Chandra: { class: "ally" } }, minor: ["Medli", "стражник"], note: "n" })]);
      const r = rate(mock, { characterId: "bram" });
      expect(r.json).toMatchObject({ ok: true, added: ["Chandra"] });
      const d = readDraftFile("bram");
      expect(Object.keys(d.characters)).toEqual(["Chandra"]);
      expect(d.minor).toEqual(["стражник"]);
      expect(r.json.draft).toEqual(d);
      const sent = mock.requests[0]!.req.messages[0].content as string;
      expect(sent).toContain("do not rate them again");
      expect(sent).toContain("Medli (aliases: Медли)");
      expect(sent).not.toContain("reuse these exact keys");
    });

    it("Rate now keeps a live proposal and adds to it", () => {
      savedCard();
      const old = { v: 1, at: 5, by: "molfar", note: "re-rating", minor: ["Guard"], characters: { Medli: { class: "romantic", pronouns: "she" } } };
      writeDraft("bram", old);
      const mock = mockHost([reply({ characters: { Chandra: { class: "ally" }, Медли: { class: "hostile" } }, minor: ["Cook"] })]);
      const r = rate(mock, { characterId: "bram" });
      expect(r.json).toMatchObject({ ok: true, added: ["Chandra"] });
      const d = readDraftFile("bram");
      expect(Object.keys(d.characters).sort()).toEqual(["Chandra", "Medli"]);
      expect(d.characters.Medli).toMatchObject(old.characters.Medli);
      expect(d.minor).toEqual(["Guard", "Cook"]);
      expect(Object.keys(r.json.draft.characters).sort()).toEqual(["Chandra", "Medli"]);
    });

    it("Rate now that fails leaves a live proposal untouched; without one the error is filed", () => {
      savedCard();
      writeDraft("bram", { v: 1, at: 5, by: "molfar", characters: { Medli: { class: "romantic" } } });
      const before = fs.readFileSync(draftFile("bram"), "utf8");
      const mock = mockHost([{ error: "model unavailable" }, "not json at all"]);
      const r = rate(mock, { characterId: "bram" });
      expect(r.json).toEqual({ ok: false, error: "model unavailable" });
      expect(fs.readFileSync(draftFile("bram"), "utf8")).toBe(before);
      expect(rate(mock, { characterId: "bram" }).json.ok).toBe(false);
      expect(fs.readFileSync(draftFile("bram"), "utf8")).toBe(before);
      // a dismissed file is no live proposal: the error is filed over it
      writeDraft("bram", { v: 1, at: 5, by: "auto", characters: {}, dismissedAt: 7 });
      mock.push({ error: "model unavailable" });
      const again = rate(mock, { characterId: "bram" });
      expect(again.json.ok).toBe(false);
      expect(again.json.draft.error).toBe("model unavailable");
      expect(readDraftFile("bram").error).toBe("model unavailable");
    });

    it("Rate now that finds only saved souls writes nothing", () => {
      savedCard();
      const mock = mockHost([reply({ characters: { Медли: { class: "romantic" }, Garrett: { class: "ally" } }, minor: ["Medli"] })]);
      const r = rate(mock, { characterId: "bram" });
      expect(r.json).toEqual({ ok: true, added: [], draft: null });
      expect(fs.existsSync(draftFile("bram"))).toBe(false);
    });

    it("Rate now on a card with no souls still files the proposal, even an empty one", () => {
      writeCard("bram", { name: "Bram" });
      const mock = mockHost([reply({ characters: {}, minor: ["Narrator"], cardType: "narrator", note: "Only a narrator." })]);
      const r = rate(mock, { characterId: "bram" });
      expect(r.json).toMatchObject({ ok: true, added: [] });
      expect(readDraftFile("bram")).toMatchObject({ characters: {}, minor: ["Narrator"], cardType: "narrator", note: "Only a narrator." });
    });

    it("rating by names still re-rates a saved soul, under its key, and keeps the old wording", () => {
      savedCard();
      const mock = mockHost([reply({ characters: { Медли: { class: "romantic", pronouns: "she" } } })]);
      const r = rate(mock, { characterId: "bram", names: ["Medli"] });
      expect(r.json).toMatchObject({ ok: true, added: ["Medli"] });
      expect(r.json.draft.characters.Medli.class).toBe("romantic");
      expect(readDraftFile("bram").characters.Medli.aliases).toContain("Медли");
      const sent = mock.requests[0]!.req.messages[0].content as string;
      expect(sent).toContain("reuse these exact keys");
      expect(sent).not.toContain("do not rate them again");
    });
  });
});

// ---------- stage 5: re-sense, the UI trigger, the vocabulary editor, preview speakers ----------
describe("re-sense of the newest message", () => {
  const five = (last = "You are welcome.") => [...three(), A("m4", "Thank you."), U("m5", last)];
  const second = reply({
    present: ["Aria"],
    minutes: 5,
    events: [{ id: "humiliated_her", weight: "pivotal", from: "user", to: "Aria" }],
    learned: [{ who: "Aria", text: "Second note", how: "saw" }],
    names: [{ who: "Aria", calls: "Sir", heardUserName: true }],
    retire: ["n1"],
  });
  const edited = reply({ present: ["Aria"], minutes: 7, events: [{ id: "compliment", weight: "routine", from: "user", to: "Aria" }], learned: [{ who: "Aria", text: "Third note", how: "guess" }] });

  /** Two updates: m3 (note n1) and m5 (retires n1, adds a note, a name and history). */
  function twoUpdates() {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    expect(update(mock, "c1").json.ok).toBe(true);
    writeChat("c1", five());
    mock.push(second);
    expect(update(mock, "c1").json.ok).toBe(true);
    return mock;
  }

  it("a changed text of the newest message is sensed again; the old snapshot's traces are gone", () => {
    const mock = twoUpdates();
    const st1 = readStateFile("c1");
    expect(st1.snapshots["m5#0"].sig).toMatch(/^[0-9a-f]{8}$/);
    expect(st1.notebook.Aria.find((n: any) => n.id === "n1").retiredBy).toBe("m5#0");
    expect(st1.notebook.Aria.some((n: any) => n.src === "m5#0")).toBe(true);
    expect(st1.names.Aria.some((n: any) => n.src === "m5#0")).toBe(true);
    expect(st1.history.Aria.some((h: any) => h.src === "m5#0")).toBe(true);
    const counters = st1.counters;
    const calls = mock.requests.length;

    // same text: nothing
    const same = update(mock, "c1");
    expect(same.json.unchanged).toBe(true);
    expect(mock.requests.length).toBe(calls);

    // edited text: one more call, a clean snapshot
    writeChat("c1", five("You are very welcome indeed."));
    mock.push(edited);
    const r = update(mock, "c1", "edit");
    expect(r.json.ok).toBe(true);
    expect(mock.requests.length).toBe(calls + 1);
    // the sensor read the whole new message, with the old snapshot's notes out of its notebook
    const prompt = mock.requests.at(-1)!.req.messages[0].content as string;
    expect(prompt).toContain("You are very welcome indeed.");
    expect(prompt).toContain("n1 saw: The user keeps their word");
    expect(prompt).not.toContain("Second note");
    const st2 = readStateFile("c1");
    const snap = st2.snapshots["m5#0"];
    expect(snap.op).toBe("resense");
    expect(snap.sig).not.toBe(st1.snapshots["m5#0"].sig);
    expect(snap.turn).toBe(2);
    expect(snap.clock.minutes).toBe(7);
    expect(st2.notebook.Aria.map((n: any) => n.text)).toEqual(["The user keeps their word", "Third note"]);
    expect(st2.notebook.Aria[0].retiredBy).toBeUndefined();
    expect(st2.names).toEqual({});
    expect((st2.history.Aria || []).some((h: any) => h.src === "m5#0" && h.stat === "comfort")).toBe(false);
    expect(Object.keys(st2.snapshots).sort()).toEqual(["m3#0", "m5#0"]);
    expect(st2.counters.note).toBe(counters.note + 1);
    expect(r.json.ms).toBe(42);
    // and it settles again
    expect(update(mock, "c1").json.unchanged).toBe(true);
  });

  it("a Continue of the newest message counts the minutes as for any re-sense", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    update(mock, "c1");
    writeChat("c1", [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "I kept my promise. And more.")]);
    mock.push(reply({ present: ["Aria"], minutes: 30 }));
    update(mock, "c1", "continue");
    const snap = readStateFile("c1").snapshots["m3#0"];
    expect(snap.op).toBe("resense");
    expect(snap.clock.minutes).toBe(30);
  });

  it("a snapshot made before sigs existed is left alone, and a failed re-sense keeps the old snapshot", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    update(mock, "c1");
    const st = readStateFile("c1");
    const sig = st.snapshots["m3#0"].sig;
    delete st.snapshots["m3#0"].sig;
    fs.writeFileSync(stateFile("c1"), JSON.stringify(st));
    writeChat("c1", [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "Edited text.")]);
    const calls = mock.requests.length;
    expect(update(mock, "c1").json.unchanged).toBe(true);
    expect(mock.requests.length).toBe(calls);
    // with a sig and a failing sensor: the old snapshot stays
    st.snapshots["m3#0"].sig = sig;
    fs.writeFileSync(stateFile("c1"), JSON.stringify(st));
    mock.push({ error: "boom" });
    expect(update(mock, "c1").json.ok).toBe(false);
    const after = readStateFile("c1");
    expect(after.snapshots["m3#0"].sig).toBe(sig);
    expect(after.notebook.Aria.length).toBe(1);
  });

  it("catch-up picks a chat whose newest message was edited", () => {
    const old = Date.now() - 5 * 60_000;
    writeChat("c1", three(), { updatedAt: old });
    const mock = mockHost([keptPromise]);
    update(mock, "c1");
    writeChat("c1", [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "I really kept my promise.")], { updatedAt: old });
    mock.push(keptPromise);
    for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as any)[k];
    const out = P.onTick({ pluginId: "relations" }, mock.host);
    expect(out.dashboard.chatId).toBe("c1");
  });
});

describe("the UI trigger", () => {
  const auto = (mock: ReturnType<typeof mockHost>, body: Record<string, unknown>) => drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId: "c1", auto: true, ...body } });

  it("auto in manual mode and impersonate are skipped without a model call", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "manual" } });
    expect(auto(mock, { op: "send" }).json).toEqual({ ok: true, skipped: "manual" });
    expect(mock.requests.length).toBe(0);
    // an update from the panel (no auto) still runs
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(mock.requests.length).toBe(1);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "sensor" } });
    writeChat("c2", three());
    expect(drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId: "c2", op: "impersonate", auto: true } }).json).toEqual({ ok: true, skipped: "impersonate" });
    expect(drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId: "c2", op: "impersonate" } }).json).toEqual({ ok: true, skipped: "impersonate" });
    expect(mock.requests.length).toBe(1);
    expect(fs.existsSync(stateFile("c2"))).toBe(false);
  });

  it("auto in sensor mode updates and the answer carries the sensor time", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    const r = auto(mock, { op: "send" });
    expect(r.json).toMatchObject({ ok: true, snapshot: "m3#0", turn: 1, ms: 42 });
    expect(r.json.ms).toBe(readStateFile("c1").usage.lastMs);
  });

  it("catch-up skips a chat updated 10 s ago and picks it at 2 minutes", () => {
    writeChat("c1", three(), { updatedAt: Date.now() - 10_000 });
    const mock = mockHost([keptPromise]);
    expect(P.onTick({ pluginId: "relations" }, mock.host)).toBeUndefined();
    expect(mock.requests.length).toBe(0);
    writeChat("c1", three(), { updatedAt: Date.now() - 2 * 60_000 });
    const out = P.onTick({ pluginId: "relations" }, mock.host);
    expect(out.dashboard.chatId).toBe("c1");
  });
});

describe("the event vocabulary editor", () => {
  const eventsFile = () => path.join(root, "dashboard/events.json");
  const readEvents = () => JSON.parse(fs.readFileSync(eventsFile(), "utf8"));
  const put = (mock: ReturnType<typeof mockHost>, events: unknown) => drive(mock, { method: "PUT", path: "/dashboard/events", body: { events } });
  const rowOf = (json: any, id: string) => json.events.find((e: any) => e.id === id);

  it("an off row removes an event from the vocabulary, the sensor's prompt and the physics", () => {
    const v = P.buildVocab([{ id: "kept_promise", off: true }, { id: "dance", family: "play", meaning: "danced", deltas: { affection: 1 } }, { id: "dance", off: true }, { id: "other", off: true }, { id: "Bad Id", off: true }]);
    expect(v.kept_promise).toBeUndefined();
    expect(v.dance).toBeUndefined();
    // `other` is the fallback and stays
    expect(v.other).toBeDefined();
    expect(P.buildVocab([{ id: "kept_promise", off: true }, { id: "kept_promise", family: "trust", meaning: "back", deltas: { trust: 1 } }]).kept_promise.meaning).toBe("back");
    expect(Object.keys(v).length).toBe(34);
    fs.writeFileSync(eventsFile(), JSON.stringify({ events: [{ id: "kept_promise", off: true }] }));
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(mock.requests[0].req.systemPrompt).not.toContain("kept_promise");
    expect(mock.requests[0].req.systemPrompt).toContain("broke_promise");
    // the sensor still named it: unknown now, counts as other, moves nothing
    const s1 = readStateFile("c1").snapshots["m3#0"];
    expect(s1.events[0].id).toBe("other");
    expect(s1.chars.Aria.stats).toMatchObject({ trust: 0, respect: 0 });
  });

  it("vocabRows lists defaults, changed, custom and off rows in order", () => {
    const rows = P.vocabRows([
      { id: "dance", family: "play", meaning: "danced", deltas: { affection: 1 } },
      { id: "kept_promise", family: "trust", meaning: "mine", deltas: { trust: 5 } },
      { id: "broke_promise", family: "trust", meaning: "failed a promise", deltas: { respect: -1, trust: -3 } },
      { id: "gift", off: true },
      { id: "dance", off: true },
      { id: "nothing_here", off: true },
      { id: "bad", family: "Bad" },
    ]);
    const ids = rows.map((r: any) => r.id);
    expect(ids.slice(0, 3)).toEqual(["kept_promise", "broke_promise", "told_truth"]);
    expect(ids.at(-1)).toBe("dance");
    expect(ids.length).toBe(36);
    const by = (id: string) => rows.find((r: any) => r.id === id);
    expect(by("kept_promise")).toMatchObject({ source: "changed", off: false, meaning: "mine", deltas: { trust: 5 } });
    expect(by("broke_promise")).toMatchObject({ source: "default", off: false });
    expect(by("gift")).toMatchObject({ source: "default", off: true, family: "warmth", meaning: "gave something meant for them" });
    expect(by("dance")).toMatchObject({ source: "custom", off: true, family: "play", deltas: { affection: 1 } });
    expect(by("told_truth")).toMatchObject({ source: "default", off: false });
    expect(P.vocabRows([]).length).toBe(35);
  });

  it("GET /dashboard/config carries the rows, the delta keys and the family order", () => {
    fs.writeFileSync(eventsFile(), JSON.stringify({ events: [{ id: "kept_promise", family: "trust", meaning: "mine", deltas: { trust: 5 } }, { id: "dance", family: "play", meaning: "d", deltas: {} }, { id: "gift", off: true }] }));
    const mock = mockHost();
    const j = drive(mock, { method: "GET", path: "/dashboard/config" }).json;
    expect(rowOf(j, "kept_promise")).toMatchObject({ source: "changed", off: false });
    expect(rowOf(j, "dance")).toMatchObject({ source: "custom", off: false });
    expect(rowOf(j, "gift")).toMatchObject({ source: "default", off: true });
    expect(rowOf(j, "insult")).toMatchObject({ source: "default", off: false });
    expect(j.deltaKeys).toEqual(["trust", "comfort", "attraction", "respect", "affection", "excitement", "arousal", "hostility"]);
    expect(j.familyList).toEqual(["trust", "warmth", "power", "body", "conflict", "care", "knowledge"]);
    expect(j.families).toBeDefined();
    expect(j.custom).toEqual([]);
  });

  it("PUT stores only what differs; clamps, cleans, keeps other top-level keys", () => {
    fs.writeFileSync(eventsFile(), JSON.stringify({ note: "mine", events: [{ id: "gift", off: true }] }));
    const mock = mockHost();
    const j = put(mock, [
      // equal to its default: dropped
      { id: "kept_promise", family: "trust", meaning: "did what was promised", deltas: { respect: 1, trust: 1 } },
      // changed, clamped, a zero dropped, long meaning cut, unknown key dropped
      { id: "broke_promise", family: "trust", meaning: "m".repeat(300), deltas: { trust: -50, respect: 0, comfort: 99 }, junk: 1 },
      { id: "dance", family: "play", meaning: "danced", deltas: { affection: 1 } },
      { id: "dance", family: "play", meaning: "danced twice", deltas: { affection: 2 } },
      { id: "insult", off: true, family: "conflict", meaning: "ignored" },
      // invalid: skipped
      { id: "Bad Id", family: "x" },
      { id: "luck", family: "x", deltas: { luck: 1 } },
      { id: "nofam" },
      { id: "other", off: true },
      "nope",
    ]).json;
    expect(j.skipped).toBe(5);
    const file = readEvents();
    expect(file.note).toBe("mine");
    expect(file.events).toEqual([
      { id: "broke_promise", family: "trust", meaning: "m".repeat(200), deltas: { trust: -20, comfort: 20 } },
      { id: "dance", family: "play", meaning: "danced twice", deltas: { affection: 2 } },
      { id: "insult", off: true },
    ]);
    expect(rowOf(j, "broke_promise")).toMatchObject({ source: "changed" });
    expect(rowOf(j, "insult")).toMatchObject({ off: true });
    expect(rowOf(j, "gift")).toMatchObject({ off: false });
    expect(rowOf(j, "dance")).toMatchObject({ source: "custom", off: false });
  });

  it("PUT with no rows writes nothing when there is no file, and empties the rows when there is one; at most 200 rows", () => {
    const mock = mockHost();
    expect(put(mock, []).json.skipped).toBe(0);
    expect(fs.existsSync(eventsFile())).toBe(false);
    const many = Array.from({ length: 230 }, (_, i) => ({ id: "ev_" + i, family: "play", meaning: "x", deltas: {} }));
    const j = put(mock, many).json;
    expect(readEvents().events.length).toBe(200);
    expect(j.skipped).toBe(30);
    put(mock, []);
    expect(readEvents()).toEqual({ events: [] });
  });

  it("DELETE empties the rows and keeps the other keys", () => {
    fs.writeFileSync(eventsFile(), JSON.stringify({ note: "mine", events: [{ id: "gift", off: true }] }));
    const mock = mockHost();
    const j = drive(mock, { method: "DELETE", path: "/dashboard/events" }).json;
    expect(readEvents()).toEqual({ note: "mine", events: [] });
    expect(rowOf(j, "gift")).toMatchObject({ source: "default", off: false });
    fs.rmSync(eventsFile());
    drive(mock, { method: "DELETE", path: "/dashboard/events" });
    expect(fs.existsSync(eventsFile())).toBe(false);
  });
});

describe("preview speakers", () => {
  it("lists the names an insert can be built for; none without a snapshot", () => {
    writeChat("fresh", three());
    const mock = mockHost([reply({ present: ["Aria", "Bram"], minutes: 1 })]);
    expect(drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "fresh" } }).json).toEqual({ insert: null, speakers: [] });
    expect(drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "nochat" } }).json).toEqual({ insert: null, speakers: [] });
    writeChat("c1", three(), { groupId: "g1", characterId: undefined });
    expect(update(mock, "c1").json.ok).toBe(true);
    // Bram leaves, a guest arrives: present first, then the compact ones
    writeChat("c1", [...three(), A("m4", "x"), U("m5", "y")], { groupId: "g1", characterId: undefined });
    mock.push(reply({ present: ["Aria", "Guest"], minutes: 1 }));
    expect(update(mock, "c1").json.ok).toBe(true);
    const snap = readStateFile("c1").snapshots["m5#0"];
    expect(snap.chars.Bram.compact).toBe(true);
    const pv = drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1" } }).json;
    expect(pv.speakers).toEqual(["Aria", "Guest", "Bram"]);
    expect(pv.insert).not.toBeNull();
  });
});

// ---------- start values that follow later soul edits; presence guard ----------
describe("seed: soul start values saved after a character entered", () => {
  const cardFile = () => "characters/aria/card.json";
  /** The Aria card with this soul (none: a card without a soul). */
  const setSoul = (soul?: any) =>
    fs.writeFileSync(path.join(root, cardFile()), JSON.stringify({ spec: "chara_card_v2", name: "Aria", extensions: soul ? { molfar_soul: { v: 1, characters: { Aria: soul } } } : {} }));
  const more = (n: number) => [...three(), ...Array.from({ length: n }, (_, i) => (i % 2 === 0 ? A("x" + i, "Hm " + i) : U("x" + i, "Yes " + i)))];
  const quiet = reply({ present: ["Aria"], minutes: 1 });
  const stats = (st: any, key: string) => st.snapshots[key].chars.Aria.stats;
  const ZERO = { trust: 0, comfort: 0, attraction: 0, respect: 0, affection: 0 };
  const seedLines = (st: any) => (st.history.Aria || []).filter((h: any) => h.kind === "seed");

  it("a character born without a soul gets +start when a soul appears; a later edit shifts by the difference", () => {
    setSoul();
    writeChat("c1", three());
    const mock = mockHost([quiet]);
    expect(update(mock, "c1").json.ok).toBe(true);
    let st = readStateFile("c1");
    expect(st.snapshots["m3#0"].chars.Aria.seed).toEqual(ZERO);
    expect(stats(st, "m3#0")).toEqual(ZERO);

    setSoul({ class: "ally", start: { trust: 5, respect: 3 } });
    writeChat("c1", more(2));
    mock.push(quiet);
    expect(update(mock, "c1").json.ok).toBe(true);
    st = readStateFile("c1");
    const key = "x1#0";
    expect(stats(st, key)).toEqual({ ...ZERO, trust: 5, respect: 3 });
    expect(st.snapshots[key].chars.Aria.seed).toEqual({ ...ZERO, trust: 5, respect: 3 });
    expect(seedLines(st)).toEqual([{ turn: 2, kind: "seed", from: ZERO, to: { ...ZERO, trust: 5, respect: 3 }, src: key }]);
    // the dashboard view passes the line through (without src) and the seed with the entry
    const view = getState(mock, "c1");
    expect(view.state.snapshots[key].chars.Aria.seed.trust).toBe(5);
    const shown = drive(mock, { method: "GET", path: "/dashboard/state", query: { chatId: "c1", view: "1" } }).json.view;
    expect(shown.chars.Aria.history.find((h: any) => h.kind === "seed")).toEqual({ turn: 2, kind: "seed", from: ZERO, to: { ...ZERO, trust: 5, respect: 3 } });

    // an edit of the start: only the difference moves
    setSoul({ class: "ally", start: { trust: 8, respect: 3, affection: -4 } });
    writeChat("c1", more(4));
    mock.push(quiet);
    expect(update(mock, "c1").json.ok).toBe(true);
    st = readStateFile("c1");
    const key2 = "x3#0";
    expect(stats(st, key2)).toEqual({ ...ZERO, trust: 8, respect: 3, affection: -4 });
    expect(seedLines(st).length).toBe(2);
    // unchanged soul: nothing more
    writeChat("c1", more(6));
    mock.push(quiet);
    update(mock, "c1");
    st = readStateFile("c1");
    expect(seedLines(st).length).toBe(2);
    expect(stats(st, "x5#0")).toEqual(stats(st, key2));
  });

  it("the shift is clamped like the physics and also reaches a character who is out of the scene", () => {
    setSoul();
    writeChat("c1", three());
    const mock = mockHost([quiet]);
    update(mock, "c1");
    setSoul({ class: "ally", start: { trust: 20 } });
    writeChat("c1", more(2));
    // the sensor puts Aria out of the scene: her entry is copied as compact, and still follows the soul
    mock.push(reply({ present: [], struck: ["Aria"], minutes: 1 }));
    update(mock, "c1");
    const st = readStateFile("c1");
    const entry = st.snapshots["x1#0"].chars.Aria;
    expect(entry.compact).toBe(true);
    expect(entry.stats.trust).toBe(20);
    expect(entry.seed.trust).toBe(20);
    expect(seedLines(st).length).toBe(1);
  });

  it("a legacy entry without a seed: an earliest snapshot near zero means the start never applied", () => {
    setSoul();
    writeChat("c1", three());
    const mock = mockHost([quiet]);
    update(mock, "c1");
    const legacy = readStateFile("c1");
    delete legacy.snapshots["m3#0"].chars.Aria.seed;
    fs.writeFileSync(stateFile("c1"), JSON.stringify(legacy));
    setSoul({ class: "ally", start: { trust: 5, comfort: -2 } });
    writeChat("c1", more(2));
    mock.push(quiet);
    update(mock, "c1");
    const st = readStateFile("c1");
    expect(stats(st, "x1#0")).toEqual({ ...ZERO, trust: 5, comfort: -2 });
    expect(seedLines(st).length).toBe(1);
    expect(seedLines(st)[0].from).toEqual(ZERO);
  });

  it("a legacy entry whose earliest snapshot already shows the start is assumed seeded: no shift", () => {
    setSoul({ class: "ally", start: { trust: 10, respect: 8 } });
    writeChat("c1", three());
    const mock = mockHost([quiet]);
    update(mock, "c1");
    const legacy = readStateFile("c1");
    expect(stats(legacy, "m3#0")).toEqual({ ...ZERO, trust: 10, respect: 8 });
    delete legacy.snapshots["m3#0"].chars.Aria.seed;
    fs.writeFileSync(stateFile("c1"), JSON.stringify(legacy));
    writeChat("c1", more(2));
    mock.push(quiet);
    update(mock, "c1");
    let st = readStateFile("c1");
    expect(stats(st, "x1#0")).toEqual({ ...ZERO, trust: 10, respect: 8 });
    expect(seedLines(st)).toEqual([]);
    // the seed is recorded now, so a later edit shifts by the difference
    expect(st.snapshots["x1#0"].chars.Aria.seed).toEqual({ ...ZERO, trust: 10, respect: 8 });
    setSoul({ class: "ally", start: { trust: 12, respect: 8 } });
    writeChat("c1", more(4));
    mock.push(quiet);
    update(mock, "c1");
    st = readStateFile("c1");
    expect(stats(st, "x3#0")).toEqual({ ...ZERO, trust: 12, respect: 8 });
  });

  it("a legacy entry with a small start (within 3) is not shifted", () => {
    setSoul();
    writeChat("c1", three());
    const mock = mockHost([quiet]);
    update(mock, "c1");
    const legacy = readStateFile("c1");
    delete legacy.snapshots["m3#0"].chars.Aria.seed;
    fs.writeFileSync(stateFile("c1"), JSON.stringify(legacy));
    setSoul({ class: "ally", start: { trust: 3 } });
    writeChat("c1", more(2));
    mock.push(quiet);
    update(mock, "c1");
    expect(stats(readStateFile("c1"), "x1#0")).toEqual(ZERO);
  });

  it("a provisional draft without a start, then a saved soul with one, shifts the stats", () => {
    setSoul();
    fs.mkdirSync(path.join(root, "dashboard/soul-drafts"), { recursive: true });
    fs.writeFileSync(path.join(root, "dashboard/soul-drafts/aria.json"), JSON.stringify({ v: 1, at: 7, by: "molfar", characters: { Aria: { class: "ally", pronouns: "she" } } }));
    writeChat("c1", three());
    const mock = mockHost([quiet]);
    update(mock, "c1");
    expect(readStateFile("c1").snapshots["m3#0"].chars.Aria.seed).toEqual(ZERO);
    setSoul({ class: "ally", pronouns: "she", start: { trust: 6, affection: 4 } });
    writeChat("c1", more(2));
    mock.push(quiet);
    update(mock, "c1");
    const st = readStateFile("c1");
    expect(stats(st, "x1#0")).toEqual({ ...ZERO, trust: 6, affection: 4 });
    expect(seedLines(st).length).toBe(1);
  });
});

describe("presence guard", () => {
  const Bram = (id: string, text: string): Msg => ({ id, role: "char", name: "Bram", text, swipe: 0 });
  const setAria = (soul: any) => fs.writeFileSync(path.join(root, "characters/aria/card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", extensions: { molfar_soul: { v: 1, characters: { Aria: soul } } } }));
  /** A base snapshot with Aria and Bram present, then a second update over `msgs` with the sensor's `present`. */
  function second(msgs: Msg[], out: Record<string, unknown>, soul: any = { class: "ally" }) {
    setAria(soul);
    writeChat("c1", [...three(), Bram("b1", "Hm.")], { groupId: "g1", characterId: undefined });
    const mock = mockHost([reply({ present: ["Aria", "Bram"], minutes: 1 })]);
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(readStateFile("c1").snapshots["b1#0"].present).toEqual(["Aria", "Bram"]);
    writeChat("c1", [...three(), Bram("b1", "Hm."), ...msgs], { groupId: "g1", characterId: undefined });
    mock.push(reply({ minutes: 1, ...out }));
    expect(update(mock, "c1").json.ok).toBe(true);
    return readStateFile("c1").snapshots[msgs[msgs.length - 1]!.id + "#0"];
  }

  it("someone present before who is named in the new messages stays, though the sensor left them out", () => {
    const snap = second([U("u1", "Aria, come here."), Bram("b2", "I will wait.")], { present: ["Bram"] });
    expect(snap.present).toEqual(["Bram", "Aria"]);
    expect(snap.chars.Aria.compact).toBe(false);
  });

  it("a Cyrillic spelling counts through the aliases of the soul, and through the name key without one", () => {
    const aliased = second([U("u1", "Арія засміялася."), Bram("b2", "Ну.")], { present: ["Bram"] }, { class: "ally", aliases: ["Арія"] });
    expect(aliased.present).toContain("Aria");
  });

  it("the name key alone: another script, an ending on the name", () => {
    const snap = second([U("u1", "Арію ніхто не бачив."), Bram("b2", "Ну.")], { present: ["Bram"] });
    expect(snap.present).toContain("Aria");
  });

  it("a speaker of the new messages counts as named", () => {
    const snap = second([A("a1", "(she nods)"), Bram("b2", "Ok.")], { present: ["Bram"] });
    expect(snap.present).toContain("Aria");
  });

  it("not named: dropped as the sensor said", () => {
    const snap = second([U("u1", "Well then."), Bram("b2", "I will wait.")], { present: ["Bram"] });
    expect(snap.present).toEqual(["Bram"]);
  });

  it("named but reported as leaving: not kept", () => {
    const snap = second([U("u1", "Goodbye, Aria."), Bram("b2", "Hm.")], { present: ["Bram"], struck: ["Aria"] });
    expect(snap.present).toEqual(["Bram"]);
  });

  it("someone absent before who is only mentioned is not added", () => {
    setAria({ class: "ally" });
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], minutes: 1 })]);
    update(mock, "c1");
    writeChat("c1", [...three(), A("a2", "Hm."), U("u2", "Where is Bram?")]);
    mock.push(reply({ present: ["Aria"], minutes: 1 }));
    update(mock, "c1");
    expect(readStateFile("c1").snapshots["u2#0"].present).toEqual(["Aria"]);
  });

  it("a report without the present key still falls back to the base list", () => {
    const snap = second([U("u1", "Well then."), Bram("b2", "Ok.")], {});
    expect(snap.present).toEqual(["Aria", "Bram"]);
  });
});

describe("the sensor prompt default", () => {
  it("says who is present, and the previous default still counts as the default", () => {
    const text = P.DEFAULT_PROMPTS.sensor as string;
    expect(text).toContain("acts, speaks or is addressed");
    expect(text).toContain("Everyone in the Previous state stays present");
    const past = P.PAST_DEFAULT_PROMPTS.sensor as string[];
    expect(past.length).toBe(6);
    expect(past[4]).toContain("Keep up to three open threads");
    expect(text).toContain("the open thread limit given in the input");
    expect(text).not.toContain("three open threads");
    expect(past[3]).toContain("already knows the user's character personally");
    expect(past[3]).not.toContain("the exact form of address");
    expect(text).toContain("the exact form of address the character uses");
    expect(text).toContain("with nothing at stake is not a thread");
    expect(past[1]).toContain("acts, speaks or is addressed");
    expect(past[1]).toContain("one short line on what they do not know");
    expect(text).toContain("up to 15 words");
    // the previous default also counts as the default
    // the names rule: a character who already knows the user's character counts too
    expect(text).toContain("already knows the user's character personally");
    expect(text).toContain("never guess");
    expect(past[2]).not.toContain("already knows the user's character");
    expect(past[2]).toContain("up to 15 words");
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, sensor: past[2] }));
    expect(drive(mockHost(), { method: "GET", path: "/dashboard/config" }).json.sensor).toBe(text);
    // and the sensor input names the user's character, so "calls" can be filled
    writeChat("c1", three());
    const names = mockHost([reply({ present: ["Aria"], minutes: 1 })]);
    update(names, "c1");
    expect(names.requests[0]!.req.messages[0].content).toContain("user: You.");
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, sensor: past[1] }));
    expect(drive(mockHost(), { method: "GET", path: "/dashboard/config" }).json.custom).toEqual([]);
    expect(past[0]).not.toBe(text);
    expect(past[0]).toContain("the people in the scene at the end of the new messages");
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, sensor: past[0] }));
    const mock = mockHost();
    const j = drive(mock, { method: "GET", path: "/dashboard/config" }).json;
    expect(j.custom).toEqual([]);
    expect(j.sensor).toBe(text);
    // a changed copy is still the user's own
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, sensor: past[0] + " Extra." }));
    expect(drive(mock, { method: "GET", path: "/dashboard/config" }).json.custom).toEqual(["sensor"]);
  });
});

describe("compact reports: the user's own character and generic notes", () => {
  it("blindSpot, learned and names about the user are dropped", () => {
    writeChat("c1", three());
    const mock = mockHost([
      reply({
        present: ["Aria"],
        minutes: 1,
        blindSpot: { You: "does not know the key is fake", user: "x", Aria: "does not know who sent the letter" },
        learned: [
          { who: "You", text: "About the user", how: "saw" },
          { who: "user", text: "About the user too", how: "saw" },
          { who: "Aria", text: "The user carries a key", how: "saw" },
        ],
        names: [{ who: "You", calls: "Sir", heardUserName: true }, { who: "Aria", calls: "Sir" }],
      }),
    ]);
    expect(update(mock, "c1").json.ok).toBe(true);
    const st = readStateFile("c1");
    const snap = st.snapshots["m3#0"];
    expect(Object.keys(snap.chars)).toEqual(["Aria"]);
    expect(snap.chars.Aria.blindSpot).toBe("does not know who sent the letter");
    expect(Object.keys(st.notebook)).toEqual(["Aria"]);
    expect(st.notebook.Aria.map((n: any) => n.text)).toEqual(["The user carries a key"]);
    expect(Object.keys(st.names)).toEqual(["Aria"]);
    expect(st.counters.note).toBe(1);
  });

  it("a learned text identical for three or more characters is dropped; for two it stays", () => {
    const people = ["Aria", "Bram", "Cara", "Dov"];
    const note = (who: string, text: string) => ({ who, text, how: "heard", from: "user" });
    writeChat("c1", three(), { groupId: "g1", characterId: undefined });
    const mock = mockHost([
      reply({
        present: people,
        minutes: 1,
        learned: [
          note("Aria", "Suggestions for solving problems"),
          note("Bram", "  suggestions for  solving problems "),
          note("Cara", "Suggestions for solving problems"),
          note("Aria", "The user keeps a key"),
          note("Bram", "The user has a scar"),
          note("Dov", "The user has a scar"),
        ],
      }),
    ]);
    expect(update(mock, "c1").json.ok).toBe(true);
    const st = readStateFile("c1");
    const texts = (who: string) => (st.notebook[who] || []).map((n: any) => n.text);
    expect(texts("Aria")).toEqual(["The user keeps a key"]);
    expect(texts("Bram")).toEqual(["The user has a scar"]);
    expect(texts("Cara")).toEqual([]);
    expect(texts("Dov")).toEqual(["The user has a scar"]);
    expect(st.counters.note).toBe(3);
  });
});

describe("sensor reply limit and pronouns in the sensor input", () => {
  const putCfg = (mock: ReturnType<typeof mockHost>, body: Record<string, unknown>) => drive(mock, { method: "PUT", path: "/dashboard/config", body });
  const storedCfg = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8"));
    } catch {
      return null;
    }
  };
  const quietReply = reply({ present: ["Aria"], minutes: 1 });

  it("sensorMaxTokens: default 3000, clamped 1000..8000, stored only when not the default", () => {
    const mock = mockHost([quietReply]);
    expect(drive(mock, { method: "GET", path: "/dashboard/config" }).json.sensorMaxTokens).toBe(3000);
    expect(putCfg(mock, { sensorMaxTokens: 5000 }).json.sensorMaxTokens).toBe(5000);
    expect(storedCfg().sensorMaxTokens).toBe(5000);
    expect(putCfg(mock, { sensorMaxTokens: 500 }).json.sensorMaxTokens).toBe(1000);
    expect(putCfg(mock, { sensorMaxTokens: "99999" }).json.sensorMaxTokens).toBe(8000);
    expect(putCfg(mock, { sensorMaxTokens: "junk" }).json.sensorMaxTokens).toBe(8000);
    // the panel envelope
    expect(putCfg(mock, { enabled: true, values: { sensorMaxTokens: "4500" } }).json.sensorMaxTokens).toBe(4500);
    // back to the default: not stored
    putCfg(mock, { sensorMaxTokens: 3000 });
    expect(storedCfg().sensorMaxTokens).toBeUndefined();
    // the panel has the field with its value
    const field = P.uiPanel({}, mock.host).items[0].fields.find((f: any) => f.key === "sensorMaxTokens");
    expect(field).toMatchObject({ kind: "number", value: 3000 });
    expect(String(field.hint)).toContain("slower");
  });

  it("the sensor call and the soul rating call use it as max_tokens", () => {
    writeChat("c1", three());
    const mock = mockHost([quietReply]);
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(mock.requests[0]!.req.presetParams.max_tokens).toBe(3000);
    putCfg(mock, { sensorMaxTokens: 6000 });
    writeChat("c2", three());
    mock.push(quietReply);
    update(mock, "c2");
    expect(mock.requests.at(-1)!.req.presetParams.max_tokens).toBe(6000);
    // the rating of a card
    const before = mock.requests.length;
    P.handleRoute({ method: "POST", path: "/dashboard/soul/rate", query: {}, body: { characterId: "bram" } }, mock.host);
    const rating = mock.requests.slice(before).find((r) => r.key.startsWith("soul"));
    expect(rating).toBeDefined();
    expect(rating!.req.presetParams.max_tokens).toBe(6000);
  });

  it("the Characters line carries the soul's pronouns, and only when it has them", () => {
    fs.writeFileSync(
      path.join(root, "characters/aria/card.json"),
      JSON.stringify({ spec: "chara_card_v2", name: "Aria", extensions: { molfar_soul: { v: 1, characters: { Aria: { class: "ally", pronouns: "she" }, Tom: { class: "neutral", pronouns: "he" }, Sam: { class: "neutral" } } } } }),
    );
    writeChat("c1", three());
    const mock = mockHost([quietReply]);
    update(mock, "c1");
    const input = mock.requests[0]!.req.messages[0].content as string;
    expect(input).toContain("Aria (ally, she)");
    expect(input).toContain("Tom (neutral, he)");
    expect(input).toContain("Sam (neutral)");
    expect(input).not.toContain("Sam (neutral,");
  });
});

// ---------- round 3: the user's overlay, thread checks, prompt blocks, forms of address ----------
describe("the user's notes and threads (overlay)", () => {
  const stored = () => JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8"));
  const notes = (mock: ReturnType<typeof mockHost>, body: Record<string, unknown>) => drive(mock, { method: "POST", path: "/dashboard/notes", body: { chatId: "c1", ...body } });
  const view = (mock: ReturnType<typeof mockHost>) => drive(mock, { method: "GET", path: "/dashboard/state", query: { chatId: "c1", view: "1" } }).json.view;
  const overlayFile = () => path.join(root, "dashboard/notes/c1.json");
  const readOverlay = () => JSON.parse(fs.readFileSync(overlayFile(), "utf8"));
  const grow = (n: number) => [...three(), ...Array.from({ length: n }, (_, i) => (i % 2 === 0 ? A("x" + i, "Hm " + i) : U("x" + i, "Yes " + i)))];
  const quiet = reply({ present: ["Aria"], minutes: 1 });
  /** One update (keptPromise: note n1 "The user keeps their word", thread t1). */
  function started() {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    expect(update(mock, "c1").json.ok).toBe(true);
    return mock;
  }

  it("add: a user note with an id of its own, shown in the view, state untouched", () => {
    const mock = started();
    const before = fs.readFileSync(stateFile("c1"), "utf8");
    expect(notes(mock, { op: "add", name: "Nobody", text: "x" }).status).toBe(400);
    expect(notes(mock, { op: "add", name: "Aria", text: "  " }).status).toBe(400);
    expect(notes(mock, { op: "add", name: "Aria", text: "x", tag: "huge" }).status).toBe(400);
    expect(notes(mock, { op: "add", name: "Aria", text: "x", how: "dreamt" }).status).toBe(400);
    expect(notes(mock, { op: "nope" }).status).toBe(400);
    expect(drive(mock, { method: "POST", path: "/dashboard/notes", body: { chatId: "../x", op: "add" } }).status).toBe(400);
    expect(fs.existsSync(overlayFile())).toBe(false);
    const r = notes(mock, { op: "add", name: "Aria", text: "z".repeat(400), how: "heard", tag: "pinned" });
    expect(r.json.ok).toBe(true);
    const aria = r.json.view.chars.Aria;
    expect(aria.notebook.map((n: any) => n.id)).toEqual(["n1", "u1"]);
    expect(aria.notebook[1]).toMatchObject({ id: "u1", how: "heard", tag: "pinned", by: "user", believes: true });
    expect(aria.notebook[1].text.length).toBe(300);
    expect(aria.notebook[0].tag).toBeNull();
    expect(aria.notebook[0].by).toBeUndefined();
    expect(readOverlay()).toMatchObject({ v: 1, counter: 1, added: { Aria: [{ id: "u1", how: "heard", tag: "pinned" }] } });
    expect(fs.readFileSync(stateFile("c1"), "utf8")).toBe(before);
  });

  it("edit and retire/restore: sensor notes through edits, the user's own in place", () => {
    const mock = started();
    notes(mock, { op: "add", name: "Aria", text: "Mine" });
    expect(notes(mock, { op: "edit", id: "n9", text: "x" }).status).toBe(404);
    expect(notes(mock, { op: "edit", id: "n1" }).status).toBe(400);
    const e = notes(mock, { op: "edit", id: "n1", text: "The user always keeps their word", tag: "important" }).json.view.chars.Aria;
    expect(e.notebook[0]).toMatchObject({ id: "n1", text: "The user always keeps their word", tag: "important", edited: true });
    expect(readOverlay().edits.n1).toEqual({ text: "The user always keeps their word", tag: "important" });
    // a tag cleared with null
    expect(notes(mock, { op: "edit", id: "n1", tag: null }).json.view.chars.Aria.notebook[0].tag).toBeNull();
    // the user's own note is changed where it is
    const u = notes(mock, { op: "edit", id: "u1", text: "Mine, changed", tag: "everyday" }).json.view.chars.Aria.notebook[1];
    expect(u).toMatchObject({ text: "Mine, changed", tag: "everyday", by: "user" });
    expect(readOverlay().edits.u1).toBeUndefined();
    // retire and restore
    const gone = notes(mock, { op: "retire", id: "n1" }).json.view.chars.Aria;
    expect(gone.notebook.map((n: any) => n.id)).toEqual(["u1"]);
    expect(gone.retired.map((n: any) => n.id)).toEqual(["n1"]);
    notes(mock, { op: "retire", id: "u1" });
    expect(view(mock).chars.Aria.retired.map((n: any) => n.id)).toEqual(["n1", "u1"]);
    expect(notes(mock, { op: "retire", id: "n9" }).status).toBe(404);
    notes(mock, { op: "restore", id: "u1" });
    const back = notes(mock, { op: "restore", id: "n1" }).json.view.chars.Aria;
    expect(back.notebook.map((n: any) => n.id)).toEqual(["n1", "u1"]);
    expect(back.retired).toEqual([]);
    // the restored note keeps its edit (the text), the edit entry is not empty
    expect(readOverlay().edits.n1.text).toBe("The user always keeps their word");
  });

  it("the sensor reads the effective notes, labelled; it cannot retire a note of the user", () => {
    const mock = started();
    notes(mock, { op: "add", name: "Aria", text: "Likes tea" });
    notes(mock, { op: "edit", id: "n1", text: "Keeps promises" });
    writeChat("c1", grow(2));
    mock.push(reply({ present: ["Aria"], minutes: 1, retire: ["u1", "n1"] }));
    expect(update(mock, "c1").json.ok).toBe(true);
    const input = mock.requests.at(-1)!.req.messages[0].content as string;
    expect(input).toContain("n1 saw: Keeps promises");
    expect(input).toContain("u1 saw: Likes tea (written by the user)");
    expect(input).not.toContain("The user keeps their word");
    const st = readStateFile("c1");
    expect(st.notebook.Aria.find((n: any) => n.id === "n1").retiredBy).toBe("x1#0");
    // the user's note is not in the state at all, and is still live in the view
    expect(JSON.stringify(st)).not.toContain("Likes tea");
    expect(view(mock).chars.Aria.notebook.map((n: any) => n.id)).toEqual(["u1"]);
  });

  it("the insert orders notes pinned, important, unmarked, everyday; newest first in a group", () => {
    const mock = started();
    notes(mock, { op: "add", name: "Aria", text: "ev-a", tag: "everyday" });
    notes(mock, { op: "add", name: "Aria", text: "pin-b", tag: "pinned" });
    notes(mock, { op: "add", name: "Aria", text: "imp-c", tag: "important" });
    notes(mock, { op: "add", name: "Aria", text: "plain-d" });
    const pv = drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1", speaker: "Aria" } }).json;
    expect(pv.insert.text).toContain("Saw: pin-b; imp-c; plain-d; The user keeps their word; ev-a.");
  });

  it("over the limit the notebook lines go from the end; pinned lines stay", () => {
    const mock = started();
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { insertTokens: 50 } });
    notes(mock, { op: "add", name: "Aria", text: "PINNED-KEEP", tag: "pinned" });
    for (let i = 0; i < 8; i++) notes(mock, { op: "add", name: "Aria", text: "filler-" + i + " " + "w".repeat(120) });
    const pv = drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1", speaker: "Aria" } }).json;
    expect(pv.insert.text).toContain("PINNED-KEEP");
    expect(pv.insert.text).not.toContain("filler-7");
    expect(pv.insert.trimmed).toContain("notebooks");
    expect(pv.insert.notebookOf).toEqual(["Aria"]);
    // without a pinned note nothing of the notebook is left
    notes(mock, { op: "retire", id: "u1" });
    const none = drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1", speaker: "Aria" } }).json;
    expect(none.insert.text).not.toContain("PINNED-KEEP");
    expect(none.insert.text).not.toContain("What Aria knows");
    expect(none.insert.notebookOf).toEqual([]);
  });

  it("a thread of the user: carried by the next update, counted in the limit, resolved stays resolved", () => {
    const mock = started();
    const add = notes(mock, { op: "thread-add", text: "Find the missing letter" });
    expect(add.json.view.threads.find((t: any) => t.id === "ut1")).toMatchObject({ text: "Find the missing letter", status: "open", by: "user" });
    // limit 3: t1 and ut1 are open, one more fits, the next is refused
    expect(notes(mock, { op: "thread-add", text: "Second" }).status).toBe(200);
    expect(notes(mock, { op: "thread-add", text: "Third" }).status).toBe(409);
    expect(notes(mock, { op: "thread-add", text: "  " }).status).toBe(400);
    writeChat("c1", grow(2));
    mock.push(reply({ present: ["Aria"], minutes: 1, threads: { resolved: ["ut1"], open: [{ id: "t1", text: "Who has the key?" }] } }));
    update(mock, "c1");
    const input = mock.requests.at(-1)!.req.messages[0].content as string;
    expect(input).toContain('ut1 "Find the missing letter"');
    expect(input).toContain('ut2 "Second"');
    const snap = readStateFile("c1").snapshots["x1#0"];
    expect(snap.threads.find((t: any) => t.id === "ut1").status).toBe("resolved");
    expect(snap.threads.find((t: any) => t.id === "ut2")).toMatchObject({ status: "open", by: "user" });
    // a thread the user resolved stays resolved: the sensor is not shown it and does not carry it
    notes(mock, { op: "thread-edit", id: "t1", status: "resolved" });
    expect(notes(mock, { op: "thread-edit", id: "t9", status: "open" }).status).toBe(404);
    expect(notes(mock, { op: "thread-edit", id: "t1", status: "maybe" }).status).toBe(400);
    writeChat("c1", grow(4));
    mock.push(quiet);
    update(mock, "c1");
    expect((mock.requests.at(-1)!.req.messages[0].content as string)).not.toContain('t1 "Who has the key?"');
    const snap2 = readStateFile("c1").snapshots["x3#0"];
    expect(snap2.threads.map((t: any) => t.id)).toEqual(["ut2"]);
    // editing text, and reopening
    const ut = notes(mock, { op: "thread-edit", id: "ut1", status: "open", text: "Letter found?" }).json.view.threads;
    expect(ut.find((t: any) => t.id === "ut1")).toMatchObject({ text: "Letter found?", status: "open", by: "user" });
  });

  it("maxThreads is the open limit for the sensor's own threads too", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], minutes: 1, threads: { open: ["a", "b", "c", "d"].map((t) => ({ id: null, text: "Thread " + t })) } })]);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { maxThreads: 2 } });
    update(mock, "c1");
    expect(readStateFile("c1").snapshots["m3#0"].threads.length).toBe(2);
    expect(notes(mock, { op: "thread-add", text: "More" }).status).toBe(409);
    const body = (v: unknown) => drive(mock, { method: "PUT", path: "/dashboard/config", body: { maxThreads: v } }).json.maxThreads;
    expect([body(9), body(0), body("x"), body(3)]).toEqual([6, 1, 1, 3]);
    expect(stored().maxThreads).toBeUndefined();
  });

  it("removes the notes file of a chat that no longer exists", () => {
    fs.mkdirSync(path.join(root, "dashboard/notes"), { recursive: true });
    fs.writeFileSync(path.join(root, "dashboard/notes/gone.json"), "{}");
    writeChat("alive", three(), { updatedAt: Date.now() - 5 * 3600_000 });
    fs.writeFileSync(path.join(root, "dashboard/notes/alive.json"), "{}");
    const mock = mockHost();
    P.onTick({ pluginId: "relations" }, mock.host);
    expect(fs.readdirSync(path.join(root, "dashboard/notes"))).toEqual(["alive.json"]);
  });
});

describe("thread checks", () => {
  const stored = () => JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8"));
  const grow = (n: number) => [...three(), ...Array.from({ length: n }, (_, i) => (i % 2 === 0 ? A("x" + i, "Hm " + i) : U("x" + i, "Yes " + i)))];
  const inputOf = (mock: ReturnType<typeof mockHost>) => mock.requests.at(-1)!.req.messages[0].content as string;

  it("the sensor input gets a Thread check section on schedule, listing old open threads", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { threadCheckEvery: 2 } });
    update(mock, "c1");
    expect(inputOf(mock)).not.toContain("Thread check");
    const seen: boolean[] = [];
    for (let k = 1; k <= 3; k++) {
      writeChat("c1", grow(2 * k));
      mock.push(reply({ present: ["Aria"], minutes: 1, threads: { open: [{ id: "t1", text: "Who has the key?" }] } }));
      update(mock, "c1");
      seen.push(inputOf(mock).includes("Thread check"));
    }
    // turns 2 and 3: the thread is 1 and 2 turns old, no check; turn 4: due
    expect(seen).toEqual([false, false, true]);
    const text = inputOf(mock);
    expect(text).toContain('t1 "Who has the key?" (3 turns)');
    expect(text).toContain("Has the story settled this, dropped it, or is it still open? Resolve settled or dropped ones.");
    // 0 = never
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { threadCheckEvery: 0 } });
    writeChat("c1", grow(8));
    mock.push(reply({ present: ["Aria"], minutes: 1 }));
    update(mock, "c1");
    expect(inputOf(mock)).not.toContain("Thread check");
    expect(drive(mock, { method: "PUT", path: "/dashboard/config", body: { threadCheckEvery: 99 } }).json.threadCheckEvery).toBe(50);
  });

  it("the check is on schedule only, not on every turn once a thread is overdue", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { threadCheckEvery: 3 } });
    update(mock, "c1");
    const seen: boolean[] = [];
    for (let k = 1; k <= 5; k++) {
      writeChat("c1", grow(2 * k));
      mock.push(reply({ present: ["Aria"], minutes: 1, threads: { open: [{ id: "t1", text: "Who has the key?" }] } }));
      update(mock, "c1");
      seen.push(inputOf(mock).includes("Thread check"));
    }
    // next turns 2..6: thread 1 turn old at 2; 4 is not a multiple of 3; only turn 6 is due (not every turn once overdue)
    expect(seen).toEqual([false, false, false, false, true]);
  });
});

describe("the sensor prompt in blocks", () => {
  const stored = () => JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8"));
  const putCfg = (mock: ReturnType<typeof mockHost>, body: Record<string, unknown>) => drive(mock, { method: "PUT", path: "/dashboard/config", body });
  const getCfg = (mock: ReturnType<typeof mockHost>) => drive(mock, { method: "GET", path: "/dashboard/config" }).json;

  it("the blocks joined with a blank line are the default prompt, character for character", () => {
    const parts = P.SENSOR_PARTS as { key: string; title: string }[];
    expect(parts.map((p) => p.key)).toEqual(["role", "language", "truth", "events", "scene", "knowledge", "threads", "style"]);
    for (const p of parts) expect(typeof P.DEFAULT_SENSOR_PARTS[p.key]).toBe("string");
    expect(parts.map((p) => P.DEFAULT_SENSOR_PARTS[p.key]).join("\n\n")).toBe(P.DEFAULT_PROMPTS.sensor);
    expect(P.DEFAULT_SENSOR_PARTS.truth.startsWith("Truth:")).toBe(true);
    expect(P.DEFAULT_SENSOR_PARTS.threads.startsWith("Threads:")).toBe(true);
    expect(P.DEFAULT_SENSOR_PARTS.language.startsWith("Language:")).toBe(true);
    expect(P.DEFAULT_SENSOR_PARTS.style).toBe("Keep the whole reply compact: short values, no filler.");
    // nothing stored: the effective prompt is the default itself
    expect(P.promptOf("sensor", {})).toBe(P.DEFAULT_PROMPTS.sensor);
  });

  it("only changed blocks are stored; the sensor gets them joined; one or all restored", () => {
    const mock = mockHost([keptPromise]);
    const j0 = getCfg(mock);
    expect(j0.sensorMode).toBe("parts");
    expect(j0.sensorParts.map((p: any) => [p.key, p.custom])).toEqual(P.SENSOR_PARTS.map((p: any) => [p.key, false]));
    expect(j0.sensorParts[0]).toMatchObject({ key: "role", title: "Role and reply format", text: P.DEFAULT_SENSOR_PARTS.role, default: P.DEFAULT_SENSOR_PARTS.role });
    expect(j0.sensor).toBe(P.DEFAULT_PROMPTS.sensor);
    const j = putCfg(mock, { sensorParts: { role: "You read a story.", truth: P.DEFAULT_SENSOR_PARTS.truth + "  ", nope: "x", scene: "" } }).json;
    // the part equal to its default (whitespace aside), the empty one and the unknown key are not stored
    expect(stored().sensorParts).toEqual({ role: "You read a story." });
    expect(j.sensorParts.find((p: any) => p.key === "role")).toMatchObject({ text: "You read a story.", custom: true });
    expect(j.sensorParts.find((p: any) => p.key === "truth").custom).toBe(false);
    expect(j.custom).toEqual(["sensor"]);
    expect(j.sensorMode).toBe("parts");
    expect(j.sensor.startsWith("You read a story.\n\nLanguage:")).toBe(true);
    expect(j.sensor.endsWith(P.DEFAULT_SENSOR_PARTS.style)).toBe(true);
    // the call uses it
    writeChat("c1", three());
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(mock.requests[0]!.req.systemPrompt.startsWith("You read a story.\n\nLanguage:")).toBe(true);
    // cut to 4000, a second part, restore one
    putCfg(mock, { sensorParts: { events: "e".repeat(5000) } });
    expect(stored().sensorParts.events.length).toBe(4000);
    expect(stored().sensorParts.role).toBe("You read a story.");
    const one = drive(mock, { method: "DELETE", path: "/dashboard/config/prompts", query: { part: "role" } }).json;
    expect(stored().sensorParts).toEqual({ events: "e".repeat(4000) });
    expect(one.sensorParts.find((p: any) => p.key === "role").custom).toBe(false);
    // a part set back to its default by hand is dropped
    putCfg(mock, { sensorParts: { events: P.DEFAULT_SENSOR_PARTS.events } });
    expect(stored().sensorParts).toBeUndefined();
    // restore all
    putCfg(mock, { sensorParts: { scene: "S." }, soul: "My rating." });
    const all = drive(mock, { method: "DELETE", path: "/dashboard/config/prompts" }).json;
    expect(stored().sensorParts).toBeUndefined();
    expect(all.custom).toEqual([]);
    expect(all.sensor).toBe(P.DEFAULT_PROMPTS.sensor);
  });

  it("a whole custom prompt still wins over blocks; the panel has one textarea per block", () => {
    const mock = mockHost();
    putCfg(mock, { sensorParts: { role: "Blocks." }, sensor: "The whole thing." });
    const j = getCfg(mock);
    expect(j.sensorMode).toBe("whole");
    expect(j.sensor).toBe("The whole thing.");
    expect(P.uiPanel({}, mock.host).items[0].fields.find((f: any) => f.key === "sensor").value).toBe("The whole thing.");
    drive(mock, { method: "DELETE", path: "/dashboard/config/prompts" });
    expect(getCfg(mock).sensorMode).toBe("parts");
    // the panel envelope: one field per block
    putCfg(mock, { enabled: true, values: { sensorPart_truth: "Only facts.", sensorPart_scene: P.DEFAULT_SENSOR_PARTS.scene } });
    expect(stored().sensorParts).toEqual({ truth: "Only facts." });
    const item = P.uiPanel({}, mock.host).items[0];
    expect(item.fields.find((f: any) => f.key === "sensorPart_truth")).toMatchObject({ kind: "textarea", advanced: true, value: "Only facts." });
    expect(item.fields.find((f: any) => f.key === "sensorPart_scene").value).toBe(P.DEFAULT_SENSOR_PARTS.scene);
    expect(item.deleteUrl).toBe("/dashboard/config/prompts");
  });

  it("the previous default sensor prompt counts as the default", () => {
    const past = P.PAST_DEFAULT_PROMPTS.sensor as string[];
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, sensor: past[past.length - 1] }));
    const j = getCfg(mockHost());
    expect(j.sensorMode).toBe("parts");
    expect(j.custom).toEqual([]);
    expect(j.sensor).toBe(P.DEFAULT_PROMPTS.sensor);
  });
});

describe("forms of address", () => {
  const stored = () => JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8"));
  const grow = (n: number) => [...three(), ...Array.from({ length: n }, (_, i) => (i % 2 === 0 ? A("x" + i, "Hm " + i) : U("x" + i, "Yes " + i)))];
  const callsLines = (st: any) => (st.history.Aria || []).filter((h: any) => h.kind === "calls");

  it("a change of how a character addresses the user is a history line; a report without it keeps the old one", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], minutes: 1, names: [{ who: "Aria", calls: "sir", heardUserName: true }] })]);
    update(mock, "c1");
    expect(callsLines(readStateFile("c1"))).toEqual([{ turn: 1, kind: "calls", from: "", to: "sir", src: "m3#0" }]);
    // the same word again: no line; a report with no calls keeps "sir"
    writeChat("c1", grow(2));
    mock.push(reply({ present: ["Aria"], minutes: 1, names: [{ who: "Aria", calls: "sir" }] }));
    update(mock, "c1");
    writeChat("c1", grow(4));
    mock.push(reply({ present: ["Aria"], minutes: 1, names: [{ who: "Aria" }] }));
    update(mock, "c1");
    let st = readStateFile("c1");
    expect(callsLines(st).length).toBe(1);
    expect(st.names.Aria.at(-1)).toMatchObject({ calls: "sir", knowsUserName: true });
    // a new word
    writeChat("c1", grow(6));
    mock.push(reply({ present: ["Aria"], minutes: 1, names: [{ who: "Aria", calls: "my lord" }] }));
    update(mock, "c1");
    st = readStateFile("c1");
    expect(callsLines(st).at(-1)).toMatchObject({ turn: 4, kind: "calls", from: "sir", to: "my lord", src: "x5#0" });
    // the view carries the line (without src)
    const shown = drive(mock, { method: "GET", path: "/dashboard/state", query: { chatId: "c1", view: "1" } }).json.view;
    expect(shown.chars.Aria.history.filter((h: any) => h.kind === "calls").map((h: any) => h.to)).toEqual(["sir", "my lord"]);
    expect(shown.chars.Aria.history.some((h: any) => "src" in h)).toBe(false);
  });

  it("the insert names the form of address when the character knows the name and uses another word", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], minutes: 1, names: [{ who: "Aria", calls: "sir", heardUserName: true }] })]);
    update(mock, "c1");
    const text = () => drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1", speaker: "Aria" } }).json.insert.text as string;
    expect(text()).toContain('Calls You "sir".');
    // the same as the name: nothing
    writeChat("c1", grow(2));
    mock.push(reply({ present: ["Aria"], minutes: 1, names: [{ who: "Aria", calls: "You" }] }));
    update(mock, "c1");
    expect(text()).not.toContain("Calls You");
    // a character who does not know the name gets the older line, not this one
    writeChat("c2", three());
    mock.push(reply({ present: ["Aria"], minutes: 1, names: [{ who: "Aria", calls: "stranger" }] }));
    update(mock, "c2");
    const t2 = drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c2", speaker: "Aria" } }).json.insert.text as string;
    expect(t2).not.toContain("Calls You");
    expect(t2).toContain('Knows You only as "stranger"');
  });
});

describe("overlay keys and the open thread limit line", () => {
  const notes = (mock: ReturnType<typeof mockHost>, body: Record<string, unknown>) => drive(mock, { method: "POST", path: "/dashboard/notes", body: { chatId: "c1", ...body } });

  it("a name or id that is an object key of the prototype chain is refused, and dropped when read", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    update(mock, "c1");
    for (const name of ["__proto__", "constructor", "prototype", "toString"]) {
      expect(notes(mock, { op: "add", name, text: "x" }).status).toBe(400);
    }
    expect(notes(mock, { op: "edit", id: "__proto__", text: "x" }).status).toBe(404);
    expect(notes(mock, { op: "retire", id: "constructor" }).status).toBe(404);
    expect(notes(mock, { op: "thread-edit", id: "__proto__", status: "resolved" }).status).toBe(404);
    expect(fs.existsSync(path.join(root, "dashboard/notes/c1.json"))).toBe(false);
    expect(({} as any).text).toBeUndefined();
    // a hand-written file with such keys: they are ignored, the rest works
    fs.mkdirSync(path.join(root, "dashboard/notes"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "dashboard/notes/c1.json"),
      '{"v":1,"counter":1,"added":{"__proto__":[{"id":"u1","text":"evil"}],"Aria":[{"id":"u2","text":"fine"}]},"edits":{"__proto__":{"retired":true},"constructor":{"text":"x"}},"threads":{"added":[],"edits":{"__proto__":{"status":"resolved"}}}}',
    );
    const r = notes(mock, { op: "add", name: "Aria", text: "Another" });
    expect(r.json.ok).toBe(true);
    expect(r.json.view.chars.Aria.notebook.map((n: any) => n.text)).toEqual(["The user keeps their word", "fine", "Another"]);
    const saved = fs.readFileSync(path.join(root, "dashboard/notes/c1.json"), "utf8");
    expect(saved).not.toContain("evil");
    expect(saved).not.toContain("__proto__");
    expect(Object.getPrototypeOf(JSON.parse(saved).added)).toBe(Object.prototype);
  });

  it("the sensor input states the open thread limit", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise, reply({ present: ["Aria"], minutes: 1 })]);
    update(mock, "c1");
    expect(mock.requests[0]!.req.messages[0].content).toContain("Open thread limit: 3.");
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { maxThreads: 5 } });
    writeChat("c1", [...three(), A("m4", "Hm."), U("m5", "Yes.")]);
    update(mock, "c1");
    expect(mock.requests.at(-1)!.req.messages[0].content).toContain("Open thread limit: 5.");
    expect(P.DEFAULT_PROMPTS.sensor).toContain("up to the open thread limit given in the input");
  });
});

describe("story, move (nudge)", () => {
  const SYS = (content: string) => ({ role: "system", content });
  const ask = (mock: ReturnType<typeof mockHost>, chatId: string, messages: any = [SYS("card"), { role: "user", content: "hi" }], extra: Record<string, unknown> = {}, requestExtra: Record<string, unknown> = {}) =>
    P.llmRequest({ key: "reply", request: { sessionId: chatId, messages, ...requestExtra }, ...extra }, mock.host) as { messages: any[] } | null;
  const nudge = (mock: ReturnType<typeof mockHost>, body: Record<string, unknown> = {}) => drive(mock, { method: "POST", path: "/dashboard/nudge", body: { chatId: "c1", ...body } });
  const unnudge = (mock: ReturnType<typeof mockHost>, chatId = "c1") => drive(mock, { method: "DELETE", path: "/dashboard/nudge", query: { chatId } });
  const view = (mock: ReturnType<typeof mockHost>) => drive(mock, { method: "GET", path: "/dashboard/state", query: { chatId: "c1", view: "1" } }).json.view;
  const nudgeFile = (id = "c1") => path.join(root, "dashboard/nudge", id + ".json");
  const NOTE = "[For this reply only: do not just react to the last message.";
  /** A chat with one update behind it: open thread t1 "Who has the key?", plus the user's ut1. */
  function started() {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(drive(mock, { method: "POST", path: "/dashboard/notes", body: { chatId: "c1", op: "thread-add", text: "Find the missing letter." } }).status).toBe(200);
    return mock;
  }
  const noteOf = (out: { messages: any[] } | null) => String(out!.messages[out!.messages.length - 1].content);

  it("1. POST arms, DELETE clears, a closed thread is 409, a bad chat id 400", () => {
    const mock = started();
    expect(view(mock).nudge).toBeNull();
    const armed = nudge(mock);
    expect(armed.status).toBe(200);
    expect(armed.json).toMatchObject({ ok: true, nudge: { threadId: null } });
    expect(typeof armed.json.nudge.at).toBe("number");
    expect(JSON.parse(fs.readFileSync(nudgeFile(), "utf8"))).toEqual({ v: 1, threadId: null, at: armed.json.nudge.at });
    expect(view(mock).nudge).toEqual(armed.json.nudge);
    // arming again replaces it
    expect(nudge(mock, { threadId: "ut1" }).json.nudge.threadId).toBe("ut1");
    expect(view(mock).nudge.threadId).toBe("ut1");
    expect(unnudge(mock).json).toEqual({ ok: true, nudge: null });
    expect(fs.existsSync(nudgeFile())).toBe(false);
    expect(view(mock).nudge).toBeNull();
    // clearing nothing is fine
    expect(unnudge(mock).status).toBe(200);
    // not an open thread: unknown, or resolved by the user
    expect(nudge(mock, { threadId: "t99" })).toMatchObject({ status: 409, json: { error: "thread not open" } });
    expect(drive(mock, { method: "POST", path: "/dashboard/notes", body: { chatId: "c1", op: "thread-edit", id: "t1", status: "resolved" } }).status).toBe(200);
    expect(nudge(mock, { threadId: "t1" }).status).toBe(409);
    expect(fs.existsSync(nudgeFile())).toBe(false);
    expect(nudge(mock, { chatId: "../x" }).status).toBe(400);
    expect(nudge(mock, { chatId: "" }).status).toBe(400);
    expect(unnudge(mock, "../x").status).toBe(400);
    expect(nudge(mock, { chatId: "ghost" }).status).toBe(404);
  });

  it("2. a send with the nudge for all threads: the note ends the last user message, nothing is mutated, the file is used up", () => {
    const mock = started();
    nudge(mock);
    const msgs = [SYS("card"), { role: "assistant", content: "Y" }, { role: "user", content: "Z" }];
    const copy = JSON.parse(JSON.stringify(msgs));
    const out = ask(mock, "c1", msgs, { turn: { op: "send" } })!;
    // the insert plus the note: one patch
    expect(out.messages.length).toBe(4);
    expect(out.messages[1].content.startsWith("[Background, the scene:")).toBe(true);
    const last = out.messages[3];
    expect(last.role).toBe("user");
    expect(last.content.startsWith("Z\n\n" + NOTE)).toBe(true);
    expect(last.content).toContain("pulling on one of these open threads: Who has the key?; Find the missing letter. Stay in character");
    expect(last.content.endsWith("never mention this note.]")).toBe(true);
    expect(last.content).not.toContain("{threads}");
    // the request's own array and objects are as they were
    expect(msgs).toEqual(copy);
    expect(out.messages[3]).not.toBe(msgs[2]);
    expect(fs.existsSync(nudgeFile())).toBe(false);
    // the chat file never held it, and the next request has no note
    expect(fs.readFileSync(path.join(root, "chats/c1.jsonl"), "utf8")).not.toContain("For this reply only");
    expect(ask(mock, "c1", msgs)!.messages.map((m) => m.content).join("|")).not.toContain(NOTE);
  });

  it("3. one picked thread: only its text appears", () => {
    const mock = started();
    nudge(mock, { threadId: "ut1" });
    const note = noteOf(ask(mock, "c1", [SYS("card"), { role: "user", content: "go" }]));
    expect(note).toContain("moves the story forward, pulling on this open thread: Find the missing letter. Stay in character");
    expect(note).not.toContain("Who has the key?");
    expect(note).not.toContain("one of these");
    // a thread resolved after arming: the note falls back to all open threads
    nudge(mock, { threadId: "ut1" });
    drive(mock, { method: "POST", path: "/dashboard/notes", body: { chatId: "c1", op: "thread-edit", id: "ut1", status: "resolved" } });
    const later = noteOf(ask(mock, "c1", [SYS("card"), { role: "user", content: "go" }]));
    expect(later).toContain("pulling on one of these open threads: Who has the key?. Stay");
    expect(later).not.toContain("Find the missing letter");
  });

  it("4. an empty send, next, or a swipe of the last reply: the note is a user message of its own", () => {
    const mock = started();
    for (const op of ["send", "next", "swipe"]) {
      nudge(mock);
      const msgs = [SYS("card"), { role: "user", content: "hi" }, { role: "assistant", content: "Hello." }];
      const out = ask(mock, "c1", msgs, { turn: { op } })!;
      expect(out.messages.length).toBe(5);
      expect(out.messages[4]).toEqual({ role: "user", content: expect.stringContaining(NOTE) });
      expect(out.messages[3]).toEqual(msgs[2]);
      expect(msgs.length).toBe(3);
      expect(fs.existsSync(nudgeFile())).toBe(false);
    }
    // a last user message made of parts (not a string) is left alone: the note follows it
    nudge(mock);
    const parts = { role: "user", content: [{ type: "text", text: "look" }] };
    const out = ask(mock, "c1", [SYS("card"), parts])!;
    expect(out.messages[2]).toBe(parts);
    expect(out.messages[3].role).toBe("user");
    expect(out.messages[3].content).toContain(NOTE);
  });

  it("5. impersonate and continue get no note and keep the file; a missing label counts as a send", () => {
    const mock = started();
    nudge(mock);
    const before = fs.readFileSync(nudgeFile(), "utf8");
    for (const op of ["impersonate", "continue"]) {
      const out = ask(mock, "c1", [SYS("card"), { role: "user", content: "hi" }], { turn: { op } });
      expect(JSON.stringify(out)).not.toContain(NOTE);
      expect(fs.readFileSync(nudgeFile(), "utf8")).toBe(before);
    }
    // the label on the request, like an older engine
    expect(JSON.stringify(ask(mock, "c1", undefined, {}, { turn: { op: "continue" } }))).not.toContain(NOTE);
    expect(fs.existsSync(nudgeFile())).toBe(true);
    // no label at all: applied like a send
    expect(noteOf(ask(mock, "c1"))).toContain(NOTE);
    expect(fs.existsSync(nudgeFile())).toBe(false);
  });

  it("6. with the insert switched off the note still applies and the insert does not", () => {
    const mock = started();
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ injection: { enabled: false } }));
    expect(ask(mock, "c1")).toBeNull();
    nudge(mock);
    const out = ask(mock, "c1")!;
    expect(out.messages.length).toBe(2);
    expect(out.messages.some((m) => String(m.content).startsWith("[Background, the scene:"))).toBe(false);
    expect(out.messages[1].content.startsWith("hi\n\n" + NOTE)).toBe(true);
    expect(fs.existsSync(nudgeFile())).toBe(false);
  });

  it("7. an expired file is ignored and removed by the hook; the view shows none and removes nothing", () => {
    const mock = started();
    fs.mkdirSync(path.join(root, "dashboard/nudge"), { recursive: true });
    fs.writeFileSync(nudgeFile(), JSON.stringify({ v: 1, threadId: null, at: Date.now() - 31 * 60 * 1000 }));
    expect(view(mock).nudge).toBeNull();
    expect(fs.existsSync(nudgeFile())).toBe(true);
    expect(JSON.stringify(ask(mock, "c1"))).not.toContain(NOTE);
    expect(fs.existsSync(nudgeFile())).toBe(false);
    // inside the limit it still counts
    fs.writeFileSync(nudgeFile(), JSON.stringify({ v: 1, threadId: null, at: Date.now() - 29 * 60 * 1000 }));
    expect(view(mock).nudge).toMatchObject({ threadId: null });
    expect(JSON.stringify(ask(mock, "c1"))).toContain(NOTE);
    // a damaged file is dropped too
    fs.writeFileSync(nudgeFile(), "{nope");
    expect(view(mock).nudge).toBeNull();
    expect(JSON.stringify(ask(mock, "c1"))).not.toContain(NOTE);
    expect(fs.existsSync(nudgeFile())).toBe(false);
  });

  it("8. a chat with no dashboard state: the note applies with nothing after the story forward", () => {
    writeChat("fresh", three());
    const mock = mockHost();
    expect(drive(mock, { method: "POST", path: "/dashboard/nudge", body: { chatId: "fresh" } }).status).toBe(200);
    // a thread cannot be picked without state
    expect(drive(mock, { method: "POST", path: "/dashboard/nudge", body: { chatId: "fresh", threadId: "t1" } }).status).toBe(409);
    const out = ask(mock, "fresh")!;
    expect(out.messages.length).toBe(2);
    const note = out.messages[1].content as string;
    expect(note).toContain("moves the story forward. Stay in character and in the scene; never mention this note.]");
    expect(note).not.toContain("pulling");
    expect(fs.existsSync(nudgeFile("fresh"))).toBe(false);
  });

  it("9. a custom nudge prompt is used; one equal to the default is not stored", () => {
    const mock = started();
    expect(P.DEFAULT_PROMPTS.nudge).toContain("{threads}");
    expect(CYRILLIC.test(P.DEFAULT_PROMPTS.nudge)).toBe(false);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { nudge: "(Surprise me{threads}.)" } });
    expect(JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8")).nudge).toBe("(Surprise me{threads}.)");
    expect(drive(mock, { method: "GET", path: "/dashboard/config" }).json.custom).toContain("nudge");
    nudge(mock, { threadId: "ut1" });
    expect(noteOf(ask(mock, "c1"))).toBe("hi\n\n(Surprise me, pulling on this open thread: Find the missing letter.)");
    // a prompt without {threads} gets nothing substituted
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { nudge: "Something happens." } });
    nudge(mock);
    expect(noteOf(ask(mock, "c1"))).toBe("hi\n\nSomething happens.");
    // the default (even with other whitespace) is not stored, and clears a stored one
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { nudge: P.DEFAULT_PROMPTS.nudge + "  " } });
    const cfgFile = path.join(root, "dashboard/config.json");
    expect(fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, "utf8")).nudge : undefined).toBeUndefined();
    expect(drive(mock, { method: "GET", path: "/dashboard/config" }).json.custom).not.toContain("nudge");
    // the panel field carries the prompt
    const field = P.uiPanel({}, mock.host).items[0].fields.find((f: any) => f.key === "nudge");
    expect(field).toMatchObject({ kind: "textarea", advanced: true, label: "Story, move prompt", value: P.DEFAULT_PROMPTS.nudge });
  });
});

// ---------- fast mode: the report rides on the story reply ----------
describe("fast mode", () => {
  const SYS = (content: string) => ({ role: "system", content });
  const ask = (mock: ReturnType<typeof mockHost>, chatId: string, messages: any = [SYS("card"), { role: "user", content: "hi" }], extra: Record<string, unknown> = {}) =>
    P.llmRequest({ key: "reply", request: { sessionId: chatId, messages }, ...extra }, mock.host) as { messages: any[] } | null;
  const setConfig = (cfg: Record<string, unknown>) => fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, ...cfg }));
  const fastFile = (id = "c1") => path.join(root, "dashboard/fast", id + ".json");
  const putFast = (entries: Record<string, unknown>, id = "c1") => {
    fs.mkdirSync(path.join(root, "dashboard/fast"), { recursive: true });
    fs.writeFileSync(fastFile(id), JSON.stringify({ v: 1, entries }));
  };
  const entry = (body: string, extra: Record<string, unknown> = {}) => ({ body, at: Date.now(), model: "story/model", closed: true, ...extra });
  const four = () => [...three(), A("m4", "I believe you.")];
  const REMINDER = "[End this reply with the <vertep_state> tag as instructed.]";
  const NOTE = "[For this reply only: do not just react to the last message.";
  const instructionsOf = (out: { messages: any[] } | null) => {
    const m = out?.messages.find((x) => x.role === "system" && String(x.content).startsWith("Dashboard note:"));
    if (!m) throw new Error("no fast instructions in the patch");
    return String(m.content);
  };
  /** A chat with one sensor update behind it (open thread t1 "Who has the key?"), then the given mode switched on. */
  function started(mode = "fast") {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    expect(update(mock, "c1").json.ok).toBe(true);
    setConfig({ mode });
    return mock;
  }

  it("4. an update with an entry for the key: no sensor call, the snapshot is fast, the entry is used up, the same chat is unchanged", () => {
    setConfig({ mode: "fast" });
    writeChat("c1", four());
    putFast({ "m4#0": entry(keptPromise), "other#0": entry("{}") });
    const mock = mockHost([]);
    const r = update(mock, "c1", "send");
    expect(r.json.ok).toBe(true);
    expect(mock.requests.length).toBe(0);
    const st = readStateFile("c1");
    const snap = st.snapshots["m4#0"];
    expect(snap).toMatchObject({ fast: true, sensorModel: "story/model", op: "send", turn: 1 });
    expect(snap.partial).toBeUndefined();
    expect(snap.events[0]).toMatchObject({ id: "kept_promise", to: "Aria" });
    expect(snap.clock).toMatchObject({ place: "Hall", minutes: 10 });
    // the report counts as a call with no tokens
    expect(st.usage).toMatchObject({ calls: 1, fast: 1, inTokens: 0, outTokens: 0, lastMs: 0 });
    // the entry is gone, the other one stays
    expect(Object.keys(JSON.parse(fs.readFileSync(fastFile(), "utf8")).entries)).toEqual(["other#0"]);
    // the signature covers the saved texts: the next update sees nothing new and asks nothing
    expect(update(mock, "c1").json.unchanged).toBe(true);
    expect(mock.requests.length).toBe(0);
    // the view tells which snapshot was read from the reply
    expect(getState(mock, "c1").state.snapshots["m4#0"].fast).toBe(true);
    expect(drive(mock, { method: "GET", path: "/dashboard/state", query: { chatId: "c1", view: "1" } }).json.view.fast).toBe(true);
  });

  it("the last entry takes its file with it; a cut-off body is applied as partial; a fenced body works", () => {
    setConfig({ mode: "fast" });
    writeChat("c1", four());
    putFast({ "m4#0": entry('{"present": ["Aria"], "minutes": 10, "events": [{"id": "compliment", "weight": "routine", "from": "user", "to": "Aria"}], "chars": {"Aria": {"mood', { closed: false }) });
    const mock = mockHost([]);
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(mock.requests.length).toBe(0);
    expect(readStateFile("c1").snapshots["m4#0"]).toMatchObject({ fast: true, partial: true });
    expect(fs.existsSync(fastFile())).toBe(false);
    writeChat("c2", four());
    putFast({ "m4#0": entry("```json\n" + keptPromise + "\n```") }, "c2");
    expect(update(mock, "c2").json.ok).toBe(true);
    expect(readStateFile("c2").snapshots["m4#0"].fast).toBe(true);
    expect(mock.requests.length).toBe(0);
  });

  it("5. an entry that is not JSON is dropped and the sensor runs; no entry, or one for another swipe: the sensor", () => {
    setConfig({ mode: "fast" });
    writeChat("c1", four());
    putFast({ "m4#0": entry("this is not a report at all") });
    const mock = mockHost([keptPromise]);
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(mock.requests.map((x) => x.key)).toEqual(["sensor"]);
    expect(fs.existsSync(fastFile())).toBe(false);
    const snap = readStateFile("c1").snapshots["m4#0"];
    expect(snap.fast).toBeUndefined();
    expect(snap.sensorModel).toBe("mock/sensor");
    expect(readStateFile("c1").usage).toMatchObject({ calls: 1, inTokens: 100 });
    expect(readStateFile("c1").usage.fast).toBeUndefined();
    // no file at all
    writeChat("c2", four());
    mock.push(keptPromise);
    expect(update(mock, "c2").json.ok).toBe(true);
    expect(mock.requests.map((x) => x.key)).toEqual(["sensor", "sensor"]);
    // an entry for another key (another swipe) is not this message's
    writeChat("c3", four());
    putFast({ "m4#1": entry(keptPromise) }, "c3");
    mock.push(keptPromise);
    expect(update(mock, "c3").json.ok).toBe(true);
    expect(mock.requests.length).toBe(3);
    expect(JSON.parse(fs.readFileSync(fastFile("c3"), "utf8")).entries["m4#1"]).toBeDefined();
    // a body that is not text
    writeChat("c4", four());
    putFast({ "m4#0": { body: 5, at: Date.now() } }, "c4");
    mock.push(keptPromise);
    expect(update(mock, "c4").json.ok).toBe(true);
    expect(mock.requests.length).toBe(4);
  });

  it("5. a re-read after an edit goes to the sensor and leaves the entry; mode sensor never uses an entry", () => {
    setConfig({ mode: "fast" });
    writeChat("c1", four());
    putFast({ "m4#0": entry(keptPromise) });
    const mock = mockHost([keptPromise]);
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(readStateFile("c1").snapshots["m4#0"].fast).toBe(true);
    // the user edits the reply: the text changed, the sensor reads it again even though an entry waits
    writeChat("c1", [...three(), A("m4", "I believe you, truly.")]);
    putFast({ "m4#0": entry(keptPromise) });
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(mock.requests.map((x) => x.key)).toEqual(["sensor"]);
    const snap = readStateFile("c1").snapshots["m4#0"];
    expect(snap).toMatchObject({ op: "resense", sensorModel: "mock/sensor" });
    expect(snap.fast).toBeUndefined();
    expect(fs.existsSync(fastFile())).toBe(true);
    // mode sensor: the entry is ignored
    setConfig({ mode: "sensor" });
    writeChat("c2", four());
    putFast({ "m4#0": entry(keptPromise) }, "c2");
    mock.push(keptPromise);
    expect(update(mock, "c2").json.ok).toBe(true);
    expect(mock.requests.length).toBe(2);
    expect(readStateFile("c2").snapshots["m4#0"].fast).toBeUndefined();
    expect(fs.existsSync(fastFile("c2"))).toBe(true);
  });

  it("a card with no soul is rated first, then the entry is used: one request in all", () => {
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ mode: "fast" }));
    writeChat("c1", four(), { characterId: "bram" });
    putFast({ "m4#0": entry(reply({ present: ["Bram"], minutes: 3 })) });
    const mock = mockHost([reply({ characters: { Bram: { class: "ally", pronouns: "he" } }, cardType: "single" })]);
    expect(update(mock, "c1").json.ok).toBe(true);
    expect(mock.requests.map((x) => x.key)).toEqual(["soul_rate_bram"]);
    const snap = readStateFile("c1").snapshots["m4#0"];
    expect(snap.fast).toBe(true);
    expect(snap.chars.Bram.cls).toBe("ally");
    expect(fs.existsSync(fastFile())).toBe(false);
  });

  it("the catch-up tick uses an entry the UI trigger did not get to; the sweep drops files of gone chats and day-old ones", () => {
    setConfig({ mode: "fast" });
    writeChat("c1", four(), { updatedAt: Date.now() - 5 * 60_000 });
    putFast({ "m4#0": entry(keptPromise) });
    const mock = mockHost([]);
    P.onTick({ pluginId: "relations" }, mock.host);
    expect(mock.requests.length).toBe(0);
    expect(readStateFile("c1").snapshots["m4#0"]).toMatchObject({ op: "catchup", fast: true });
    expect(fs.existsSync(fastFile())).toBe(false);
    // nothing to update now: the tick sweeps
    putFast({ "x#0": entry("{}") }, "gone");
    putFast({ "x#0": entry("{}", { at: Date.now() - 25 * 3600 * 1000 }) }, "c1");
    P.onTick({ pluginId: "relations" }, mock.host);
    expect(fs.existsSync(fastFile("gone"))).toBe(false);
    expect(fs.existsSync(fastFile("c1"))).toBe(false);
  });

  it("6. the hook in fast mode: a system note right after the insert, a reminder ending the last user message, nothing mutated", () => {
    const mock = started();
    const msgs = [SYS("A"), SYS("B"), { role: "user", content: "X" }, { role: "assistant", content: "Y" }, { role: "user", content: "Z" }];
    const copy = JSON.parse(JSON.stringify(msgs));
    const out = ask(mock, "c1", msgs, { turn: { op: "send" } })!;
    expect(out.messages.length).toBe(7);
    expect(out.messages.slice(0, 2)).toEqual([SYS("A"), SYS("B")]);
    expect(out.messages[2].content.startsWith("[Background, the scene:")).toBe(true);
    expect(out.messages[3].role).toBe("system");
    expect(out.messages[3].content.startsWith("Dashboard note:")).toBe(true);
    expect(out.messages.slice(4, 6)).toEqual(msgs.slice(2, 4));
    expect(out.messages[6]).toEqual({ role: "user", content: "Z\n\n" + REMINDER });
    expect(msgs).toEqual(copy);
    // what the note carries: the tag, the rules, the vocabulary, the shape, the cast, the previous state with thread ids
    const text = instructionsOf(out);
    expect(text).toContain("<vertep_state>");
    expect(text).toContain("</vertep_state>");
    for (const head of ["Truth:", "Events:", "Scene:", "Knowledge:", "Threads:", "Event vocabulary\n", "Output shape\n", "Characters\nuser: You.", "Previous state\n"]) expect(text).toContain(head);
    expect(text).toContain("kept_promise");
    expect(text).toContain("Open threads: t1 \"Who has the key?\"");
    expect(text).toContain("Open thread limit: 3.");
    expect(text).toContain("Aria (ally)");
    expect(text).toContain("Present: Aria.");
    // not the sensor's own role, language or size lines
    expect(text).not.toContain("You are the scene sensor");
    expect(text).not.toContain("Language: Write every text value");
    expect(text).not.toContain("Keep the whole reply compact");
    expect(CYRILLIC.test(text)).toBe(false);
    // the thread check is asked only when it is due
    expect(text).not.toContain("Thread check");
  });

  it("6. the note carries the notebook ids of the present characters, as the sensor would", () => {
    const mock = started();
    const note = readStateFile("c1").notebook.Aria[0];
    const out = ask(mock, "c1", undefined, { turn: { op: "send" } })!;
    expect(instructionsOf(out)).toContain("Notebook of Aria\n" + note.id + " saw: The user keeps their word");
  });

  it("6. mode sensor and manual add neither the note nor the reminder; continue and impersonate neither, in fast mode too", () => {
    for (const mode of ["sensor", "manual"]) {
      const mock = started(mode);
      expect(JSON.stringify(ask(mock, "c1", undefined, { turn: { op: "send" } }))).not.toContain("vertep_state");
      fs.rmSync(path.join(root, "dashboard/state"), { recursive: true, force: true });
    }
    const mock = started("fast");
    for (const op of ["continue", "impersonate"]) {
      const out = ask(mock, "c1", undefined, { turn: { op } });
      expect(JSON.stringify(out)).not.toContain("vertep_state");
      expect(JSON.stringify(out)).not.toContain("Dashboard note");
    }
    // ops that start a reply: send, next, swipe, and an engine with no label at all
    for (const turn of [{ op: "send" }, { op: "next" }, { op: "swipe" }, undefined]) {
      const out = ask(mock, "c1", undefined, turn ? { turn } : {})!;
      expect(instructionsOf(out)).toContain("<vertep_state>");
      expect(out.messages[out.messages.length - 1].content).toBe("hi\n\n" + REMINDER);
    }
    // the label on the request, like an older engine
    expect(JSON.stringify(P.llmRequest({ key: "reply", request: { sessionId: "c1", messages: [SYS("card"), { role: "user", content: "hi" }], turn: { op: "impersonate" } } }, mock.host))).not.toContain("vertep_state");
    // other keys are never touched
    expect(P.llmRequest({ key: "sensor", request: { sessionId: "c1", messages: [] } }, mock.host)).toBeNull();
  });

  it("6. with the nudge armed both go in, the nudge first; a swipe reads the story from before its target", () => {
    const mock = started();
    drive(mock, { method: "POST", path: "/dashboard/nudge", body: { chatId: "c1" } });
    const out = ask(mock, "c1", undefined, { turn: { op: "send" } })!;
    const last = String(out.messages[out.messages.length - 1].content);
    expect(last.startsWith("hi\n\n" + NOTE)).toBe(true);
    expect(last.endsWith("\n\n" + REMINDER)).toBe(true);
    expect(last.indexOf(NOTE)).toBeLessThan(last.indexOf(REMINDER));
    expect(fs.existsSync(path.join(root, "dashboard/nudge/c1.json"))).toBe(false);
    // the snapshot sits on m3#0: a swipe of m3 starts from the story before it
    const swipe = ask(mock, "c1", undefined, { turn: { op: "swipe", targetId: "m3" } })!;
    expect(instructionsOf(swipe)).toContain("Previous state\n(none: this is the start)");
    expect(instructionsOf(ask(mock, "c1", undefined, { turn: { op: "send" } }))).toContain("Present: Aria.");
  });

  it("6. with no state yet the note still goes in; with the insert off it goes in alone; an empty message list gets a reminder message", () => {
    setConfig({ mode: "fast" });
    writeChat("fresh", three());
    const mock = mockHost();
    const out = ask(mock, "fresh")!;
    expect(out.messages.length).toBe(3);
    expect(out.messages[1].content).toContain("Previous state\n(none: this is the start)");
    expect(out.messages[2].content).toBe("hi\n\n" + REMINDER);
    expect(out.messages.some((m) => String(m.content).startsWith("[Background, the scene:"))).toBe(false);
    // a chat that does not exist: nothing
    expect(ask(mock, "ghost")).toBeNull();
    // insert off, state present
    const m2 = started();
    setConfig({ mode: "fast", injection: { enabled: false } });
    const alone = ask(m2, "c1")!;
    expect(alone.messages.length).toBe(3);
    expect(alone.messages.some((m) => String(m.content).startsWith("[Background, the scene:"))).toBe(false);
    expect(instructionsOf(alone)).toContain("Open threads: t1");
    // no messages at all: the note, and the reminder as a message of its own
    const bare = ask(m2, "c1", [])!;
    expect(bare.messages.length).toBe(2);
    expect(bare.messages[1]).toEqual({ role: "user", content: REMINDER });
  });

  it("the fast prompt: shipped in English, kept only when changed, shown in the panel; the mode is accepted", () => {
    const mock = mockHost();
    expect(P.DEFAULT_PROMPTS.fast).toContain("<vertep_state>");
    expect(CYRILLIC.test(P.DEFAULT_PROMPTS.fast)).toBe(false);
    expect(P.DEFAULT_PROMPTS.fast).toContain("language the story is written in");
    const stored = () => JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8"));
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "fast" } });
    expect(stored().mode).toBe("fast");
    expect(P.uiPanel({}, mock.host).items[0].subtitle.startsWith("fast")).toBe(true);
    // an unknown mode changes nothing
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "turbo" } });
    expect(stored().mode).toBe("fast");
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "sensor" } });
    expect(stored().mode).toBeUndefined();
    // a custom paragraph is used and listed; the default is not stored
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "fast", fast: "Custom note. <vertep_state>{}</vertep_state>" } });
    expect(stored().fast).toBe("Custom note. <vertep_state>{}</vertep_state>");
    expect(drive(mock, { method: "GET", path: "/dashboard/config" }).json.custom).toContain("fast");
    writeChat("c1", three());
    const out = ask(mock, "c1", undefined, { turn: { op: "send" } })!;
    expect(out.messages[1].content.startsWith("Custom note.")).toBe(true);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { fast: P.DEFAULT_PROMPTS.fast + " " } });
    expect(stored().fast).toBeUndefined();
    const field = P.uiPanel({}, mock.host).items[0].fields.find((f: any) => f.key === "fast");
    expect(field).toMatchObject({ kind: "textarea", advanced: true, label: "Fast mode prompt", value: P.DEFAULT_PROMPTS.fast });
    const modeField = P.uiPanel({}, mock.host).items[0].fields.find((f: any) => f.key === "mode");
    expect(modeField.list).toEqual(["sensor", "fast", "manual"]);
    // the config body carries the size of the note, and the hint says it
    const tokens = drive(mock, { method: "GET", path: "/dashboard/config" }).json.fastTokens;
    expect(tokens).toBeGreaterThan(500);
    expect(modeField.hint).toContain("adds about " + tokens + " tokens");
    // restoring the prompts brings the default back
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { fast: "Mine." } });
    expect(drive(mock, { method: "DELETE", path: "/dashboard/config/prompts" }).json.fast).toBe(P.DEFAULT_PROMPTS.fast);
  });

  it("the note uses the user's sensor parts, and a whole custom sensor prompt by its headings (a part it lacks is the default)", () => {
    const mock = started();
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { sensorParts: { truth: "Truth:\n- Stick to the text, MARKER-T." } } });
    expect(instructionsOf(ask(mock, "c1", undefined, { turn: { op: "send" } }))).toContain("MARKER-T");
    drive(mock, { method: "DELETE", path: "/dashboard/config/prompts" });
    setConfig({ mode: "fast", sensor: "Mine, no headings at all. Report JSON." });
    const text = instructionsOf(ask(mock, "c1", undefined, { turn: { op: "send" } }));
    expect(text).not.toContain("Mine, no headings");
    expect(text).toContain("Truth:");
    setConfig({ mode: "fast", sensor: "Intro.\n\nTruth:\n- Only MARKER-W." });
    expect(instructionsOf(ask(mock, "c1", undefined, { turn: { op: "send" } }))).toContain("MARKER-W");
  });
});

describe("place log and scenes", () => {
  const at = (place: string, minutes = 5) => reply({ present: ["Aria"], minutes, place });
  const view = (mock: ReturnType<typeof mockHost>) => drive(mock, { method: "GET", path: "/dashboard/state", query: { chatId: "c1", view: "1" } }).json.view;
  const scenes = (mock: ReturnType<typeof mockHost>) => view(mock).scenes.map((s: any) => [s.key, s.place]);
  const grow = (n: number): Msg[] => {
    const out: Msg[] = [];
    for (let i = 1; i <= n; i++) out.push(i % 2 ? U("m" + i, "You " + i) : A("m" + i, "Aria " + i));
    return out;
  };
  const snap = (turn: number, at: number, clock: Record<string, unknown>) => ({ turn, at, op: "send", sig: "00000000", clock, present: [], events: [], chars: {}, edges: [], threads: [], extra: {} });
  const writeState = (state: Record<string, unknown>) => {
    fs.mkdirSync(path.join(root, "dashboard/state"), { recursive: true });
    fs.writeFileSync(stateFile("c1"), JSON.stringify({ v: 2, chatId: "c1", ...state }));
  };

  it("two place changes over several turns make the scenes, a revisit counts, a repeat does not", () => {
    writeChat("c1", grow(3));
    const mock = mockHost([at("Hall")]);
    expect(update(mock, "c1").json.ok).toBe(true);
    writeChat("c1", grow(5));
    mock.push(at("Hall"));
    update(mock, "c1");
    writeChat("c1", grow(7));
    mock.push(at("Garden"));
    update(mock, "c1");
    writeChat("c1", grow(9));
    mock.push(at("Hall"));
    update(mock, "c1");
    expect(scenes(mock)).toEqual([
      ["m3#0", "Hall"],
      ["m7#0", "Garden"],
      ["m9#0", "Hall"],
    ]);
    const first = view(mock).scenes[0];
    expect(first).toEqual({ key: "m3#0", place: "Hall", day: 1, time: null, band: null });
    // the log holds every written key, in order
    expect(Object.keys(readStateFile("c1").places)).toEqual(["m3#0", "m5#0", "m7#0", "m9#0"]);
    expect(readStateFile("c1").places["m7#0"]).toEqual({ place: "Garden", day: 1, time: null, band: null });
  });

  it("a change of case or spaces only is not a scene", () => {
    writeChat("c1", grow(3));
    const mock = mockHost([at("The Hall")]);
    update(mock, "c1");
    writeChat("c1", grow(5));
    mock.push(at("  the hall  "));
    update(mock, "c1");
    writeChat("c1", grow(7));
    mock.push(at("THE HALL"));
    update(mock, "c1");
    expect(scenes(mock)).toEqual([["m3#0", "The Hall"]]);
    expect(readStateFile("c1").places["m5#0"].place).toBe("the hall");
  });

  it("a swipe that changes the place: only the active swipe counts", () => {
    writeChat("c1", grow(3));
    const mock = mockHost([at("Hall")]);
    update(mock, "c1");
    writeChat("c1", [...grow(3), A("m4", "Aria 4")]);
    mock.push(at("Cellar"));
    update(mock, "c1");
    expect(scenes(mock)).toEqual([
      ["m3#0", "Hall"],
      ["m4#0", "Cellar"],
    ]);
    writeChat("c1", [...grow(3), { ...A("m4", "Aria 4 again"), swipe: 1 }]);
    mock.push(at("Roof"));
    update(mock, "c1");
    expect(scenes(mock)).toEqual([
      ["m3#0", "Hall"],
      ["m4#1", "Roof"],
    ]);
    // the discarded swipe's record stays in the log but is not on the line
    expect(Object.keys(readStateFile("c1").places)).toEqual(["m3#0", "m4#0", "m4#1"]);
    // swiping back shows the first swipe's scene again
    writeChat("c1", [...grow(3), { ...A("m4", "Aria 4"), swipe: 0 }]);
    expect(scenes(mock)).toEqual([
      ["m3#0", "Hall"],
      ["m4#0", "Cellar"],
    ]);
  });

  it("a re-sense of the newest message rewrites its record and moves it to the end", () => {
    writeChat("c1", grow(3));
    const mock = mockHost([at("Hall")]);
    update(mock, "c1");
    writeChat("c1", grow(5));
    mock.push(at("Garden"));
    update(mock, "c1");
    writeChat("c1", [...grow(4), U("m5", "You 5, edited")]);
    mock.push(at("Market"));
    expect(update(mock, "c1", "edit").json.ok).toBe(true);
    const places = readStateFile("c1").places;
    expect(Object.keys(places)).toEqual(["m3#0", "m5#0"]);
    expect(places["m5#0"].place).toBe("Market");
  });

  it("places outlive the snapshot cap", () => {
    const keys = grow(60).map((m) => m.id + "#0");
    const places: Record<string, unknown> = {};
    keys.forEach((k, i) => (places[k] = { place: i < 30 ? "Hall" : "Garden", day: 1, time: null, band: null }));
    // only the last 40 snapshots are left, as after the cap
    const snapshots: Record<string, unknown> = {};
    keys.slice(-40).forEach((k, i) => (snapshots[k] = snap(i + 1, i + 1, { day: 1, place: "Garden" })));
    writeChat("c1", grow(60));
    writeState({ snapshots, places });
    const mock = mockHost();
    expect(scenes(mock)).toEqual([
      ["m1#0", "Hall"],
      ["m31#0", "Garden"],
    ]);
  });

  it("an old state without places falls back to the snapshot clocks", () => {
    writeChat("c1", grow(7));
    writeState({
      snapshots: {
        "m3#0": snap(1, 1, { day: 2, time: "10:00", band: "morning", place: "Hall" }),
        "m5#0": snap(2, 2, { day: 2, place: "hall" }),
        "m7#0": snap(3, 3, { day: 3, time: "08:30", band: "morning", place: " Garden " }),
      },
    });
    const mock = mockHost();
    const before = fs.readFileSync(stateFile("c1"), "utf8");
    expect(view(mock).scenes).toEqual([
      { key: "m3#0", place: "Hall", day: 2, time: "10:00", band: "morning" },
      { key: "m7#0", place: "Garden", day: 3, time: "08:30", band: "morning" },
    ]);
    // the view never writes
    expect(fs.readFileSync(stateFile("c1"), "utf8")).toBe(before);
  });

  it("a key without a place is skipped, and a record without one does not end the scene", () => {
    writeChat("c1", grow(5));
    writeState({
      snapshots: { "m5#0": snap(3, 3, { day: 1, place: "Hall" }) },
      places: {
        "m1#0": { place: "Hall", day: 1, time: null, band: null },
        "m2#0": { place: null, day: 1, time: null, band: null },
        "m3#0": { place: "hall", day: 1, time: null, band: null },
        "m4#0": { place: "Barn", day: 1, time: null, band: null },
      },
    });
    expect(scenes(mockHost())).toEqual([
      ["m1#0", "Hall"],
      ["m4#0", "Barn"],
      ["m5#0", "Hall"],
    ]);
  });

  it("keeps the last 200 scenes", () => {
    const msgs = grow(300);
    const places: Record<string, unknown> = {};
    msgs.forEach((m, i) => (places[m.id + "#0"] = { place: i % 2 ? "B" : "A", day: 1 + i, time: null, band: null }));
    writeChat("c1", msgs);
    writeState({ snapshots: { "m300#0": snap(1, 1, { day: 300, place: "B" }) }, places });
    const list = view(mockHost()).scenes;
    expect(list.length).toBe(200);
    expect(list[199].key).toBe("m300#0");
    expect(list[0].key).toBe("m101#0");
  });

  it("the log keeps at most 2000 keys, the oldest go first", () => {
    const places: Record<string, unknown> = {};
    for (let i = 0; i < 2000; i++) places["old" + i + "#0"] = { place: "Hall", day: 1, time: null, band: null };
    writeChat("c1", grow(3));
    writeState({ snapshots: {}, places });
    const mock = mockHost([at("Hall")]);
    expect(update(mock, "c1").json.ok).toBe(true);
    const after = Object.keys(readStateFile("c1").places);
    expect(after.length).toBe(2000);
    expect(after[0]).toBe("old1#0");
    expect(after.at(-1)).toBe("m3#0");
  });
});

describe("notes follow the scene", () => {
  const notes = (mock: ReturnType<typeof mockHost>, body: Record<string, unknown>) => drive(mock, { method: "POST", path: "/dashboard/notes", body: { chatId: "c1", ...body } });
  const preview = (mock: ReturnType<typeof mockHost>, text = "") =>
    drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1", speaker: "Aria", ...(text ? { text } : {}) } }).json.insert.text as string;
  /** One update behind it (n1 "The user keeps their word"). */
  function started() {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    expect(update(mock, "c1").json.ok).toBe(true);
    return mock;
  }
  const filler = (mock: ReturnType<typeof mockHost>, n: number, from = 0) => {
    for (let i = from; i < from + n; i++) notes(mock, { op: "add", name: "Aria", text: "Unrelated trivia number " + i + " about weather and tea" });
  };
  const quietReply = () => reply({ present: ["Aria"], minutes: 1 });

  it("relevantNotes: an old note about the scene beats newer unrelated ones", () => {
    const old = { id: "a", text: "Aria is afraid of the old bell tower" };
    const list = [old, ...Array.from({ length: 15 }, (_, i) => ({ id: "f" + i, text: "Filler number " + i + " about tea" }))];
    const got = P.relevantNotes(list, "we walk toward the bell tower", 5);
    expect(got.length).toBe(5);
    expect(got[0].id).toBe("a");
    // without a matching scene the newest win
    const plain = P.relevantNotes(list, "nothing in common", 5).map((n: any) => n.id);
    expect(plain).not.toContain("a");
    expect(plain[0]).toBe("f14");
  });

  it("relevantNotes: pinned always stay, past the limit; the important tag lifts a note; Cyrillic inflections match", () => {
    const list = [
      { id: "p1", text: "pinned one", tag: "pinned" },
      { id: "p2", text: "pinned two", tag: "pinned" },
      { id: "i", text: "marked important", tag: "important" },
      ...Array.from({ length: 6 }, (_, k) => ({ id: "f" + k, text: "filler " + k })),
      { id: "ua", text: "Арія боїться старої дзвіниці" },
      ...Array.from({ length: 6 }, (_, k) => ({ id: "g" + k, text: "other " + k })),
    ];
    const one = P.relevantNotes(list, "", 1).map((n: any) => n.id);
    expect(one).toEqual(["p2", "p1"]); // both pinned, newest first, limit 1 notwithstanding
    const got = P.relevantNotes(list, "ми йдемо до дзвіниці", 4).map((n: any) => n.id);
    expect(got).toContain("ua");
    expect(got.slice(0, 2)).toEqual(["p2", "p1"]);
    const imp = P.relevantNotes(list, "", 4).map((n: any) => n.id);
    expect(imp).toContain("i");
  });

  it("the insert carries an old note about what the user just wrote, and pinned ones always", () => {
    const mock = started();
    notes(mock, { op: "add", name: "Aria", text: "Pinned: never speaks of the harbor fire", tag: "pinned" });
    notes(mock, { op: "add", name: "Aria", text: "Is afraid of the old bell tower" });
    filler(mock, 20);
    const plain = preview(mock);
    expect(plain).not.toContain("bell tower");
    expect(plain).toContain("harbor fire");
    const about = preview(mock, "Let us climb the bell tower");
    expect(about).toContain("bell tower");
    expect(about).toContain("harbor fire");
  });

  it("the insert reads the newest messages of the request too", () => {
    const mock = started();
    notes(mock, { op: "add", name: "Aria", text: "Is afraid of the old bell tower" });
    filler(mock, 20);
    const ask = (messages: any[]) =>
      (P.llmRequest({ key: "reply", request: { sessionId: "c1", messages } }, mock.host) as { messages: any[] }).messages.find((x) => String(x.content).startsWith("[Background, the scene:")).content as string;
    expect(ask([{ role: "system", content: "card" }, { role: "user", content: "hi" }])).not.toContain("bell tower");
    const withScene = ask([
      { role: "system", content: "card" },
      { role: "assistant", content: "The bell tower looms over the square." },
      { role: "user", content: "We stop." },
    ]);
    expect(withScene).toContain("bell tower");
  });

  it("the sensor sees the 8 newest notes and the older ones that match the new messages", () => {
    const mock = started();
    notes(mock, { op: "add", name: "Aria", text: "Is afraid of the old bell tower" });
    filler(mock, 29);
    writeChat("c1", [...three(), A("m4", "The bell tower rises ahead."), U("m5", "I look up at it.")]);
    mock.push(quietReply());
    expect(update(mock, "c1").json.ok).toBe(true);
    const input = mock.requests.at(-1)!.req.messages[0].content as string;
    const block = input.split("Notebook of Aria\n")[1]!.split("\n\n")[0]!;
    expect(block).toContain("afraid of the old bell tower");
    expect(block).toContain("trivia number 28"); // the newest
    expect(block).not.toContain("trivia number 0 "); // an old unrelated one
    // chronological: the old matching note comes before the newest
    expect(block.indexOf("bell tower")).toBeLessThan(block.indexOf("trivia number 28"));
    expect(block.split("\n").length).toBeLessThanOrEqual(20);
  });

  it("a near-duplicate of a live note is skipped, a different one is kept", () => {
    const longNote = "The user carries a long letter from the capital, sealed with black wax";
    const mock = started();
    notes(mock, { op: "add", name: "Aria", text: longNote });
    writeChat("c1", [...three(), A("m4", "Hm."), U("m5", "Yes.")]);
    mock.push(
      reply({
        present: ["Aria"],
        minutes: 1,
        learned: [
          { who: "Aria", text: "The user carries a long letter from the capital, sealed with red wax", how: "saw" },
          { who: "Aria", text: "The user dreams of the mountains", how: "saw" },
        ],
      }),
    );
    expect(update(mock, "c1").json.ok).toBe(true);
    const st = readStateFile("c1");
    const texts = st.notebook.Aria.map((n: any) => n.text);
    expect(texts).toContain("The user dreams of the mountains");
    expect(texts).not.toContain("The user carries a long letter from the capital, sealed with red wax");
    expect(texts.length).toBe(2); // n1 and the new different one
  });

  it("two near-same notes in one report keep one; a rewrite of a note the sensor retires lands", () => {
    const mock = started();
    writeChat("c1", [...three(), A("m4", "Hm."), U("m5", "Yes.")]);
    mock.push(
      reply({
        present: ["Aria"],
        minutes: 1,
        learned: [
          { who: "Aria", text: "The user always keeps their promises to the people of the harbor", how: "saw" },
          { who: "Aria", text: "The user always keeps their promises to the people of the harbour", how: "saw" },
        ],
      }),
    );
    update(mock, "c1");
    const harbor = readStateFile("c1").notebook.Aria.filter((n: any) => /harbou?r/.test(n.text));
    expect(harbor.length).toBe(1);
    // the sensor retires n1 and writes it again nearly the same: the new one is kept
    writeChat("c1", [...three(), A("m4", "Hm."), U("m5", "Yes."), A("m6", "Ok."), U("m7", "Right.")]);
    mock.push(reply({ present: ["Aria"], minutes: 1, retire: ["n1"], learned: [{ who: "Aria", text: "The user keeps their word.", how: "saw" }] }));
    update(mock, "c1");
    const st = readStateFile("c1");
    const n1 = st.notebook.Aria.find((n: any) => n.id === "n1");
    expect(n1.retiredBy).toBeTruthy();
    expect(st.notebook.Aria.some((n: any) => n.text === "The user keeps their word." && !n.retiredBy)).toBe(true);
  });

  it("a told copy that the listener already holds is not added again", () => {
    writeChat("c1", three());
    const mock = mockHost([
      reply({
        present: ["Aria", "Bram"],
        minutes: 1,
        learned: [
          { who: "Aria", text: "The user was born by the sea", how: "saw" },
          { who: "Bram", text: "The user was born by the sea", how: "heard", from: "Aria" },
        ],
      }),
    ]);
    expect(update(mock, "c1").json.ok).toBe(true);
    writeChat("c1", [...three(), A("m4", "Hm."), U("m5", "Yes.")]);
    mock.push(reply({ present: ["Aria", "Bram"], minutes: 1, told: [{ from: "Aria", to: "Bram", note: "n1" }] }));
    expect(update(mock, "c1").json.ok).toBe(true);
    const st = readStateFile("c1");
    expect((st.notebook.Bram || []).filter((n: any) => /born by the sea/.test(n.text)).length).toBe(1);
  });
});

describe("scene boundary and note weight (memory M2)", () => {
  const withScene = (scene: unknown, learned: unknown[] = []) => reply({ present: ["Aria"], minutes: 5, place: "Hall", scene, learned });

  it("a snapshot stores the sensor's scene field", () => {
    writeChat("c1", three());
    const mock = mockHost([withScene({ new: true, label: "A fight in the hall" })]);
    update(mock, "c1");
    expect(readStateFile("c1").snapshots["m3#0"].scene).toEqual({ new: true, label: "A fight in the hall" });
  });

  it("a missing, malformed or half-formed scene is { new: false }", () => {
    expect(P.readScene(undefined)).toEqual({ new: false });
    expect(P.readScene("yes")).toEqual({ new: false });
    expect(P.readScene({ label: "x" })).toEqual({ new: false });
    expect(P.readScene({ new: "true", label: "x" })).toEqual({ new: false });
    expect(P.readScene({ new: false, label: "Quiet" })).toEqual({ new: false, label: "Quiet" });
    expect(P.readScene({ new: true, label: "x".repeat(200) }).label.length).toBe(60);
    writeChat("c1", three());
    update(mockHost([withScene(null)]), "c1");
    expect(readStateFile("c1").snapshots["m3#0"].scene).toEqual({ new: false });
  });

  it("notes keep the sensor's weight; anything else is everyday", () => {
    writeChat("c1", three());
    const mock = mockHost([
      withScene({ new: false }, [
        { who: "Aria", text: "The user carries an old locket", how: "saw", weight: "key" },
        { who: "Aria", text: "The user takes sugar in tea", how: "saw", weight: "important" },
        { who: "Aria", text: "The user wears a green scarf", how: "saw", weight: "huge" },
        { who: "Aria", text: "The user hums when nervous", how: "saw" },
      ]),
    ]);
    update(mock, "c1");
    const notes = readStateFile("c1").notebook.Aria as { text: string; weight: string }[];
    expect(notes.map((n) => n.weight)).toEqual(["key", "important", "everyday", "everyday"]);
  });

  it("the sensor prompt asks for the scene field and the note weight; the old default is a past default", () => {
    expect(P.DEFAULT_PROMPTS.sensor).toContain("scene: new is true when this turn starts a new scene");
    expect(P.DEFAULT_PROMPTS.sensor).toContain("key (changes who");
    writeChat("c1", three());
    const mock = mockHost([withScene({ new: false })]);
    update(mock, "c1");
    const system = String(mock.requests[0].req.systemPrompt);
    expect(system).toContain('"scene": { "new": false');
    expect(system).toContain("everyday|important|key");
    const old = (P.PAST_DEFAULT_PROMPTS.sensor as string[]).slice(-1)[0];
    expect(old).not.toContain("scene: new is true");
    expect(old).toContain("Keep open threads, up to the open thread limit");
  });
});
