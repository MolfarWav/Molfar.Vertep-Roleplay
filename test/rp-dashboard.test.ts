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
    expect(fs.existsSync(path.join(root, "dashboard"))).toBe(false);
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
    expect(user.startsWith("Characters\nuser: You. Aria (ally).\n\nPrevious state\n(none: this is the start)\n\nNew messages\n[user] Hello.")).toBe(true);
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
    expect(st.notebook.Bram).toEqual([{ id: "n3", text: "The user has a key", how: "heard", from: "Aria", believes: true, turn: 2, src: "m5#0" }]);
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
    expect(fs.existsSync(path.join(root, "dashboard"))).toBe(false);
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
    expect(item.fields.map((f: any) => f.key)).toEqual(["sensorModel", "mode", "catchUp", "sensor"]);
    expect(item.fields[0].kind).toBe("model");
    expect(item.fields[3]).toMatchObject({ kind: "textarea", advanced: true });
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { sensor: "Mine." } });
    const custom = P.uiPanel({}, mock.host).items[0];
    expect(custom.deleteUrl).toBe("/dashboard/config/prompts");
    expect(custom.fields[3].value).toBe("Mine.");
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
    writeChat("c1", three(), { updatedAt: Date.now() - 60_000 });
    writeChat("c2", [...three(), A("m4", "later")], { updatedAt: Date.now() - 10_000 });
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
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "manual" } });
    tick(mock);
    expect(mock.requests.length).toBe(0);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { mode: "sensor", catchUp: false } });
    tick(mock);
    expect(mock.requests.length).toBe(0);
  });

  it("writes nothing on pass A", () => {
    writeChat("c1", three());
    const mock = mockHost([keptPromise]);
    const out = P.onTick({ pluginId: "relations" }, mock.host);
    expect(out.dashboard.chatId).toBe("c1");
    expect(mock.requests.length).toBe(1);
    expect(fs.existsSync(path.join(root, "dashboard"))).toBe(false);
  });

  it("pauses a chat for ten minutes after an error", () => {
    writeChat("c1", three());
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
    const m = out?.messages.find((x) => String(x.content).startsWith("[Scene now:"));
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
    expect(out.messages[2].content.startsWith("[Scene now:")).toBe(true);
    expect(out.messages.slice(3)).toEqual(msgs.slice(2));
    // the request's own array is left as it was
    expect(msgs.length).toBe(5);
    // with no leading system message the insert comes first
    const bare = ask(mock, "c1", [{ role: "user", content: "X" }, { role: "assistant", content: "Y" }])!;
    expect(Object.keys(bare)).toEqual(["messages"]);
    expect(bare.messages.length).toBe(3);
    expect(bare.messages[0].role).toBe("system");
    expect(bare.messages[0].content.startsWith("[Scene now:")).toBe(true);
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

    it("5. a narrator card voices everyone present: each gets a block with only their own note", () => {
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
      const text = insertOf(ask(mock, "c1", defaultMessages(), { turn: { op: "send" } }));
      expect(text).not.toContain("[How Bram");
      const pieces = text.split("[How ");
      const medli = pieces.find((p) => p.startsWith("Medli"))!;
      const garrett = pieces.find((p) => p.startsWith("Garrett"))!;
      expect(medli).toContain("What Medli knows about You: Saw: The user fears the sea.");
      expect(medli).not.toContain("owes a debt");
      expect(garrett).toContain("What Garrett knows about You: Saw: The user owes a debt.");
      expect(garrett).not.toContain("fears the sea");
      expect(text).not.toContain("Also present:");
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
    expect(drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "fresh" } }).json).toEqual({ insert: null });
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
});
