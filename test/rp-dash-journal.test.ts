/**
 * The character journal, data and sensor side (docs/JOURNAL-HANDOFF.md, "Data" and "Sensor"): a thought per present
 * character in the snapshot, the people lines in their own bag, the prompt rules and versions, and the switches.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-journal-"));
  for (const d of ["chats", "characters/aria", "dashboard", "litopys"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "characters/aria/card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", extensions: { molfar_soul: { v: 1, characters: { Aria: { class: "ally" } } } } }));
  fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false }));
});
afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {}
});

function mockHost(replies: string[] = []) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; req: any }[] = [];
  let pending: { key: string; req: any }[] = [];
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
  const answer = () => {
    for (const k of Object.keys(results)) delete results[k];
    for (const { key } of pending) {
      const next = queue.shift();
      if (next === undefined) throw new Error("no scripted reply left for " + key);
      results[key] = { text: next, model: "mock/sensor", usage: { input: 100, output: 20 }, genTimeMs: 42 };
    }
    pending = [];
  };
  return { host, requests, answer, push: (...r: string[]) => queue.push(...r) };
}
function drive(mock: ReturnType<typeof mockHost>, req: { method: string; path: string; body?: unknown; query?: Record<string, string> }) {
  const call: any = { query: {}, ...req };
  for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as any)[k];
  let out = P.handleRoute(call, mock.host) as any;
  for (let pass = 0; out?.__llmPending && pass < 3; pass++) {
    if (out.stash) call.stash = out.stash;
    mock.answer();
    out = P.handleRoute(call, mock.host);
  }
  return out;
}
const update = (m: ReturnType<typeof mockHost>, chatId: string, op = "send") => drive(m, { method: "POST", path: "/dashboard/update", body: { chatId, op } });
const view = (m: ReturnType<typeof mockHost>, chatId: string) => drive(m, { method: "GET", path: "/dashboard/state", query: { chatId, view: "1" } }).json;
const getConfig = (m: ReturnType<typeof mockHost>) => drive(m, { method: "GET", path: "/dashboard/config" }).json;
const readStateFile = (id: string) => JSON.parse(fs.readFileSync(path.join(root, "dashboard/state", id + ".json"), "utf8"));
const promptOfRequest = (m: ReturnType<typeof mockHost>) => String(m.requests.at(-1)!.req.messages[0].content);

type Msg = { id: string; role: string; name?: string; text: string; swipe?: number };
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "You", text });
const A = (id: string, text: string): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });
function writeChat(id: string, msgs: Msg[], meta: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ title: "Chat " + id, characterId: "aria", userName: "You", model: "chat/model", updatedAt: Date.now(), ...meta }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}
const link = (from: string, chatId: string) => fs.writeFileSync(path.join(root, "litopys/links.json"), JSON.stringify({ v: 1, links: { [chatId]: { from, at: 1 } } }));
const reply = (o: Record<string, unknown>) => JSON.stringify(o);
const three = (): Msg[] => [U("m1", "Hello."), A("m2", "I will not run."), U("m3", "Promise?")];
const keysOf = (st: any) => Object.keys(st.snapshots);

describe("the journal: thoughts (snapshot, chars)", () => {
  it("a present character's thought is written with its turn, carried when the sensor says nothing, never written for an absent one", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], chars: { Aria: { mood: "wary", thought: "He is hiding something from me." } } })]);
    update(mock, "c1");
    expect(readStateFile("c1").snapshots["m3#0"].chars.Aria).toMatchObject({ thought: "He is hiding something from me.", thoughtTurn: 1 });

    // Aria is not in the scene now: the sensor's thought for her is ignored, the old one stays with its turn
    writeChat("c1", [...three(), U("m4", "The hall is empty.")]);
    mock.push(reply({ present: [], chars: { Aria: { thought: "Nobody is here." } } }));
    update(mock, "c1");
    expect(readStateFile("c1").snapshots["m4#0"].chars.Aria).toMatchObject({ thought: "He is hiding something from me.", thoughtTurn: 1 });
    // the thought is never shown to the sensor again
    expect(promptOfRequest(mock)).not.toContain("He is hiding something from me.");
    expect(String(mock.requests.at(-1)!.req.systemPrompt)).not.toContain("He is hiding something from me.");

    // present again without a thought: carried
    writeChat("c1", [...three(), U("m4", "The hall is empty."), U("m5", "Aria, are you there?")]);
    mock.push(reply({ present: ["Aria"] }));
    update(mock, "c1");
    expect(readStateFile("c1").snapshots["m5#0"].chars.Aria).toMatchObject({ thought: "He is hiding something from me.", thoughtTurn: 1 });

    // present with a new thought: it is written with this turn
    writeChat("c1", [...three(), U("m4", "The hall is empty."), U("m5", "Aria, are you there?"), U("m6", "Speak.")]);
    mock.push(reply({ present: ["Aria"], chars: { Aria: { thought: "Maybe I was wrong about him." } } }));
    update(mock, "c1");
    const s6 = readStateFile("c1").snapshots["m6#0"];
    expect(s6.chars.Aria).toMatchObject({ thought: "Maybe I was wrong about him.", thoughtTurn: s6.turn });
  });

  it("a thought is cut to 200 characters", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], chars: { Aria: { thought: "x".repeat(260) } } })]);
    update(mock, "c1");
    expect(readStateFile("c1").snapshots["m3#0"].chars.Aria.thought.length).toBe(200);
  });

  it("switched off: the sensor is not asked for a thought or a people line, and a reply with one writes nothing", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], chars: { Aria: { thought: "Hm." } }, people: [{ who: "Aria", about: "You", text: "I know him." }] })]);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { journal: { on: false } } });
    update(mock, "c1");
    const system = String(mock.requests[0]!.req.systemPrompt);
    expect(system).not.toContain(P.JOURNAL_THOUGHT_RULE);
    expect(system).not.toContain(P.JOURNAL_PEOPLE_RULE);
    expect(system).not.toContain('"thought"');
    expect(system).not.toContain('"people"');
    const st = readStateFile("c1");
    expect(st.snapshots["m3#0"].chars.Aria.thought).toBeNull();
    expect(st.journal).toEqual({});
  });

  it("switched on, the sensor is asked for both (the rules and the output shape)", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"] })]);
    update(mock, "c1");
    const system = String(mock.requests[0]!.req.systemPrompt);
    expect(system).toContain(P.JOURNAL_THOUGHT_RULE);
    expect(system).toContain(P.JOURNAL_PEOPLE_RULE);
    expect(system).toContain('"thought": "text"');
    expect(system).toContain('"people": [');
  });
});

describe("the journal: people lines (own bag, one line per person)", () => {
  it("a people line is written, and shown in the next Previous state; the thought is not", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], chars: { Aria: { thought: "Secret thought." } }, people: [{ who: "Aria", about: "You", text: "I trust him more now." }] })]);
    update(mock, "c1");
    expect(readStateFile("c1").journal.Aria).toEqual([{ id: "j1", about: "You", text: "I trust him more now.", src: "m3#0", turn: 1, by: "sensor" }]);
    writeChat("c1", [...three(), U("m4", "Nice weather.")]);
    mock.push(reply({ present: ["Aria"] }));
    update(mock, "c1");
    const prompt = promptOfRequest(mock);
    expect(prompt).toContain("Aria's view of You: I trust him more now.");
    expect(prompt).not.toContain("Secret thought.");
  });

  it("a new line replaces the effective one for the same person; at most four sensor lines per person are stored", () => {
    writeChat("c1", three());
    const mock = mockHost();
    let msgs = three();
    for (let i = 1; i <= 5; i++) {
      msgs = [...msgs, U("x" + i, "Line " + i + ".")];
      writeChat("c1", msgs);
      mock.push(reply({ present: ["Aria"], people: [{ who: "Aria", about: "You", text: "Opinion " + i + "." }] }));
      update(mock, "c1");
    }
    const st = readStateFile("c1");
    expect(st.journal.Aria.map((l: any) => l.text)).toEqual(["Opinion 2.", "Opinion 3.", "Opinion 4.", "Opinion 5."]);
    expect(st.counters.journal).toBe(5);
    expect(P.effectiveJournal(st, keysOf(st)).Aria).toEqual([{ about: "You", text: "Opinion 5.", by: "sensor", turn: 5, id: "j5" }]);
  });

  it("a line about another person in the scene is kept apart from the one about the player", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria", "Cora"], people: [{ who: "Aria", about: "Cora", text: "She hides a letter." }, { who: "Aria", about: "You", text: "I owe him." }] })]);
    update(mock, "c1");
    const eff = P.effectiveJournal(readStateFile("c1"), ["m1#0", "m2#0", "m3#0"]);
    expect(eff.Aria.map((l: any) => [l.about, l.text])).toEqual([
      ["Cora", "She hides a letter."],
      ["You", "I owe him."],
    ]);
  });

  it("at most two people lines a turn are read; a line about someone unknown is skipped; the same line again is not written", () => {
    writeChat("c1", three());
    const mock = mockHost([
      reply({ present: ["Aria"], people: [{ who: "Aria", about: "You", text: "First." }, { who: "Aria", about: "Stranger", text: "Nobody knows him." }, { who: "Aria", about: "You", text: "Third." }] }),
      reply({ present: ["Aria"], people: [{ who: "Aria", about: "You", text: "First." }] }),
    ]);
    update(mock, "c1");
    expect(readStateFile("c1").journal.Aria.map((l: any) => l.text)).toEqual(["First."]);
    writeChat("c1", [...three(), U("m4", "Again.")]);
    update(mock, "c1");
    expect(readStateFile("c1").journal.Aria.length).toBe(1);
  });

  it("a line from the player's character, or about or from someone not in the scene, is kept out and counted", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], people: [{ who: "You", about: "Aria", text: "I think I know her." }, { who: "Bram", about: "You", text: "I never came here." }] })]);
    update(mock, "c1");
    const st = readStateFile("c1");
    expect(st.journal).toEqual({});
    expect(st.keptOut).toMatchObject({ user: 1, absent: 1 });
    expect(view(mock, "c1").view.keptOut).toMatchObject({ user: 1, absent: 1 });
  });

  it("a user's line wins over the sensor's line about the same person; the sensor's line is still stored", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], people: [{ who: "Aria", about: "You", text: "Sensor view." }] })]);
    update(mock, "c1");
    const st = readStateFile("c1");
    st.journal.Aria.push({ id: "j9", about: "You", text: "My own reading.", src: "m3#0", turn: 1, by: "user" });
    fs.writeFileSync(path.join(root, "dashboard/state/c1.json"), JSON.stringify(st));
    writeChat("c1", [...three(), U("m4", "Hm.")]);
    mock.push(reply({ present: ["Aria"], people: [{ who: "Aria", about: "You", text: "Later sensor view." }] }));
    update(mock, "c1");
    const after = readStateFile("c1");
    expect(P.effectiveJournal(after, ["m1#0", "m2#0", "m3#0", "m4#0"]).Aria).toEqual([{ about: "You", text: "My own reading.", by: "user", turn: 1, id: "j9" }]);
    expect(after.journal.Aria.some((l: any) => l.text === "Later sensor view.")).toBe(true);
  });

  it("a re-sense of the same message drops the line it wrote, and the one before shows again", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], people: [{ who: "Aria", about: "You", text: "I trust him." }] })]);
    update(mock, "c1");
    writeChat("c1", [...three(), A("m4", "He smiled.")]);
    mock.push(reply({ present: ["Aria"], people: [{ who: "Aria", about: "You", text: "I doubt him now." }] }));
    update(mock, "c1");
    expect(P.effectiveJournal(readStateFile("c1"), ["m1#0", "m2#0", "m3#0", "m4#0"]).Aria[0].text).toBe("I doubt him now.");
    // the reply is edited: m4 is read again, and what the old read wrote goes
    writeChat("c1", [...three(), A("m4", "He frowned.")]);
    mock.push(reply({ present: ["Aria"] }));
    update(mock, "c1", "edit");
    const st = readStateFile("c1");
    expect(st.snapshots["m4#0"].op).toBe("resense");
    expect(st.journal.Aria.map((l: any) => [l.text, l.src])).toEqual([["I trust him.", "m3#0"]]);
    expect(P.effectiveJournal(st, ["m1#0", "m2#0", "m3#0", "m4#0"]).Aria[0].text).toBe("I trust him.");
  });
});

describe("the journal and a chat that continues another", () => {
  function firstChat(mock: ReturnType<typeof mockHost>) {
    writeChat("c1", three());
    mock.push(reply({ present: ["Aria"], chars: { Aria: { thought: "Old thought." } }, people: [{ who: "Aria", about: "You", text: "I owe him a favour." }] }));
    update(mock, "c1");
    writeChat("c2", [A("n1", "A new morning.")]);
    link("c1", "c2");
  }

  it("carries the people lines but not the thoughts", () => {
    const mock = mockHost();
    firstChat(mock);
    mock.push(reply({ present: ["Aria"] }));
    expect(update(mock, "c2").json.ok).toBe(true);
    const st2 = readStateFile("c2");
    expect(st2.journal.Aria).toEqual([{ id: "j1", about: "You", text: "I owe him a favour.", by: "sensor", turn: 1, src: "inherit", fromChat: "c1" }]);
    expect(st2.snapshots["n1#0"].chars.Aria.thought).toBeNull();
    expect(promptOfRequest(mock)).toContain("Aria's view of You: I owe him a favour.");
    expect(promptOfRequest(mock)).not.toContain("Old thought.");
  });

  it("start clean drops the carried people lines", () => {
    const mock = mockHost();
    firstChat(mock);
    drive(mock, { method: "POST", path: "/dashboard/inherit", body: { chatId: "c2", on: false } });
    expect(readStateFile("c2").journal).toEqual({});
  });
});

describe("the journal settings (config)", () => {
  it("defaults are in the view; the stored diff keeps only what differs; values are clamped", () => {
    const mock = mockHost([reply({ present: ["Aria"] })]);
    writeChat("c1", three());
    update(mock, "c1");
    expect(view(mock, "c1").view.journal).toEqual({ on: true, inject: true, thoughtTurns: 3, maxTokens: 120 });
    const put = (journal: Record<string, unknown>) => drive(mock, { method: "PUT", path: "/dashboard/config", body: { journal } });
    put({ thoughtTurns: 99, maxTokens: 5 });
    expect(getConfig(mock).journal).toEqual({ on: true, inject: true, thoughtTurns: 10, maxTokens: 40 });
    put({ thoughtTurns: 0, maxTokens: 9999, on: "off", inject: false });
    expect(getConfig(mock).journal).toEqual({ on: false, inject: false, thoughtTurns: 1, maxTokens: 400 });
    put({ on: true, inject: true, thoughtTurns: 3, maxTokens: 120 });
    expect(getConfig(mock).journal).toEqual({ on: true, inject: true, thoughtTurns: 3, maxTokens: 120 });
    expect(JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8")).journal).toBeUndefined();
  });

  it("the getters default and clamp", () => {
    expect(P.thoughtTurnsOf({ journal: { thoughtTurns: 0 } })).toBe(1);
    expect(P.thoughtTurnsOf({ journal: { thoughtTurns: 50 } })).toBe(10);
    expect(P.thoughtTurnsOf({})).toBe(3);
    expect(P.journalTokensOf({ journal: { maxTokens: 10 } })).toBe(40);
    expect(P.journalTokensOf({ journal: { maxTokens: 9999 } })).toBe(400);
    expect(P.journalTokensOf({})).toBe(120);
    expect(P.journalOnOf({})).toBe(true);
    expect(P.journalOnOf({ journal: { on: false } })).toBe(false);
  });
});

describe("the sensor prompt and output shape for the journal", () => {
  it("the rules sit in the default; the version before them is a past default; stored copies of every past default follow the default", () => {
    const text = P.DEFAULT_PROMPTS.sensor as string;
    expect(text).toContain(P.JOURNAL_THOUGHT_RULE);
    expect(text).toContain(P.JOURNAL_PEOPLE_RULE);
    expect(text.indexOf(P.JOURNAL_THOUGHT_RULE)).toBeGreaterThan(text.indexOf("Scene:"));
    expect(text.indexOf(P.JOURNAL_THOUGHT_RULE)).toBeLessThan(text.indexOf("Knowledge:"));
    expect(text.indexOf(P.JOURNAL_PEOPLE_RULE)).toBeGreaterThan(text.indexOf("Knowledge:"));
    expect(text.indexOf(P.JOURNAL_PEOPLE_RULE)).toBeLessThan(text.indexOf("Threads:"));
    expect(P.JOURNAL_LANGUAGE).toContain("in the language the story is written in");
    expect(P.JOURNAL_THOUGHT_RULE).toContain(P.JOURNAL_LANGUAGE);
    expect(P.JOURNAL_PEOPLE_RULE).toContain(P.JOURNAL_LANGUAGE);

    const past = P.PAST_DEFAULT_PROMPTS.sensor as string[];
    const v16 = past.at(-2)!;
    expect(v16).not.toContain(P.JOURNAL_THOUGHT_RULE);
    expect(v16).not.toContain(P.JOURNAL_PEOPLE_RULE);
    expect(v16).not.toBe(text);
    // the seventeenth default is the sixteenth with the journal rules (and the older outfit rules)
    expect(v16).toBe(past.at(-1)!.split("\n").filter((l) => l !== P.JOURNAL_THOUGHT_RULE && l !== P.JOURNAL_PEOPLE_RULE).join("\n"));
    // the split into blocks still gives the default back
    expect(P.promptOf("sensor", {})).toBe(text);

    const mock = mockHost();
    writeChat("c1", three());
    for (const old of past) {
      fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, sensor: old }));
      const cfg = getConfig(mock);
      expect(cfg.custom).toEqual([]);
      expect(cfg.sensor).toBe(text);
    }
  });

  it("the shape names the thought and the people lines; without the journal they are left out", () => {
    expect(P.OUTPUT_SHAPE).toContain('"thought": "text"');
    expect(P.OUTPUT_SHAPE).toContain('"people": [ { "who": "name", "about": "name or user", "text": "text" } ],');
    expect(P.OUTPUT_SHAPE.indexOf('"people"')).toBeLessThan(P.OUTPUT_SHAPE.indexOf('"blindSpot"'));
    expect(P.OUTPUT_SHAPE_NO_JOURNAL).not.toContain("thought");
    expect(P.OUTPUT_SHAPE_NO_JOURNAL).not.toContain("people");
  });

  it("fast mode: the note carries the rules and the shape when the journal is on, and neither when it is off", () => {
    const ctx = (cfg: Record<string, unknown>) => ({
      cfg,
      vocab: {},
      state: { notebook: {}, journal: {}, names: {}, said: {}, snapshots: {}, counters: {} },
      overlay: null,
      base: null,
      line: [],
      K: null,
      resense: false,
      threads: [],
      characters: ["Aria"],
      souls: {},
      userName: "You",
      userNames: ["You"],
    });
    const on = P.fastInstructions(ctx({ families: {} }));
    expect(on).toContain(P.JOURNAL_THOUGHT_RULE);
    expect(on).toContain('"thought": "text"');
    const off = P.fastInstructions(ctx({ families: {}, journal: { on: false } }));
    expect(off).not.toContain(P.JOURNAL_THOUGHT_RULE);
    expect(off).not.toContain(P.JOURNAL_PEOPLE_RULE);
    expect(off).not.toContain('"thought"');
    expect(off).not.toContain('"people"');
    expect(off).toContain("scene: new is true");
  });
});

describe("the journal in the prompt insert: block, budget, request and view", () => {
  const SYS = (content: string) => ({ role: "system", content });
  const askAt = (mock: ReturnType<typeof mockHost>, chatId: string, userText = "Hi.", extra: Record<string, unknown> = {}) =>
    P.llmRequest({ key: "reply", request: { sessionId: chatId, messages: [SYS("card"), { role: "user", content: userText }] }, ...extra }, mock.host) as any;
  const jline = (id: string, about: string, text: string, turn = 1) => ({ id, about, text, src: "k", turn, by: "sensor" });
  const HEAD = "[What Aria thinks and feels (journal): their own view, in their own words. Let it colour what they do; never quote it.";
  const snapAt = (turn: number, present: string[], thoughtTurn: number | null = 3, thought = "Він щось приховує.") => ({ turn, present, chars: { Aria: { thought, thoughtTurn } } });
  const journalState = (lines: Record<string, unknown>[] = [jline("j1", "Cora", "Вона бреше."), jline("j2", "You", "Я йому вірю.")]) => ({ journal: { Aria: lines } });
  const blockOf = (snap: any, cfg: any = {}, st: any = journalState()) => P.journalBlock({ snap, user: "You", state: st, keys: ["k"] }, "Aria", cfg);

  it("the block has the exact shape: the thought, then the player's line, then the others'", () => {
    expect(blockOf(snapAt(4, ["Aria", "Cora"]))).toBe(HEAD + "\nRight now: Він щось приховує.\nAbout You: Я йому вірю.\nAbout Cora: Вона бреше.]");
    // the others follow snap.present, not the order of the bag
    const st = journalState([jline("j1", "Bram", "Він ненадійний."), jline("j2", "Cora", "Вона чесна."), jline("j3", "You", "Вірю.")]);
    expect(blockOf(snapAt(4, ["Aria", "Cora", "Bram"]), {}, st)).toBe(HEAD + "\nRight now: Він щось приховує.\nAbout You: Вірю.\nAbout Cora: Вона чесна.\nAbout Bram: Він ненадійний.]");
    // no fresh thought: the people lines alone; no thought and no line: nothing
    expect(blockOf(snapAt(6, ["Aria", "Cora"]))).toBe(HEAD + "\nAbout You: Я йому вірю.\nAbout Cora: Вона бреше.]");
    expect(blockOf(snapAt(4, ["Aria"], 3, ""), {}, journalState([]))).toBe("");
    expect(blockOf(snapAt(9, ["Aria"]), {}, journalState([]))).toBe("");
  });

  it("the thought is fresh for thoughtTurns turns (3 by default), then it leaves the block; a changed setting moves that", () => {
    const st = journalState();
    // written at turn 3: fresh at turns 3 to 5, gone from turn 6 (3 is not less than 3)
    expect(blockOf(snapAt(5, ["Aria", "Cora"], 3), {}, st)).toContain("Right now: Він щось приховує.");
    const old = blockOf(snapAt(6, ["Aria", "Cora"], 3), {}, st);
    expect(old).not.toContain("Right now");
    expect(old).toContain("About You: Я йому вірю.");
    expect(blockOf(snapAt(6, ["Aria", "Cora"], 3), { journal: { thoughtTurns: 4 } }, st)).toContain("Right now:");
    expect(blockOf(snapAt(4, ["Aria", "Cora"], 3), { journal: { thoughtTurns: 1 } }, st)).not.toContain("Right now");
    // a thought with no turn number is never fresh
    expect(blockOf(snapAt(4, ["Aria", "Cora"], null), {}, st)).not.toContain("Right now");
  });

  it("people lines only about the player or a character present: the one about an absent character is left out", () => {
    const text = blockOf(snapAt(4, ["Aria"]));
    expect(text).toContain("About You: Я йому вірю.");
    expect(text).not.toContain("Cora");
    expect(text).not.toContain("Вона бреше.");
    // a line about the character herself is not written in her own block
    expect(blockOf(snapAt(4, ["Aria"]), {}, journalState([jline("j1", "Aria", "Я сам собі не вірю.")]))).toBe(HEAD + "\nRight now: Він щось приховує.]");
  });

  it("the budget is counted by script: Cyrillic is about two characters a token, and the people lines go from the end", () => {
    expect(P.estimateTokensScript("")).toBe(0);
    expect(P.estimateTokensScript("a".repeat(35))).toBe(10);
    expect(P.estimateTokensScript("б".repeat(10))).toBe(5);
    expect(P.estimateTokensScript("б".repeat(200))).toBeGreaterThan(Math.ceil(200 / 3.2));
    expect(P.estimateTokensScript("ж".repeat(4) + "x".repeat(7))).toBe(4);

    const long = "Я не можу перестати думати про те, що він сказав мені вчора ввечері, і чому. ".repeat(3).slice(0, 190).trim();
    const st = journalState([jline("j1", "Cora", long), jline("j2", "You", "Я йому вірю.")]);
    const youOnly = blockOf(snapAt(4, ["Aria"]), { journal: { maxTokens: 400 } }, st);
    const full = blockOf(snapAt(4, ["Aria", "Cora"]), { journal: { maxTokens: 400 } }, st);
    expect(full).toContain("About Cora: " + long);
    const t = P.estimateTokensScript(youOnly);
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(P.estimateTokensScript(full));
    // a budget that fits the player's line and not the long one: the long one goes, the thought and the player's line stay
    expect(blockOf(snapAt(4, ["Aria", "Cora"]), { journal: { maxTokens: t } }, st)).toBe(youOnly);
    // the smallest budget: the thought is never cut, even over budget; every people line goes
    const small = blockOf(snapAt(4, ["Aria", "Cora"]), { journal: { maxTokens: 40 } }, st);
    expect(small).toBe(HEAD + "\nRight now: Він щось приховує.]");
    const bigThought = "Я думаю про це весь час і не можу зупинитися, бо все знову і знову повертається. ".repeat(2).slice(0, 190).trim();
    const kept = blockOf(snapAt(4, ["Aria", "Cora"], 3, bigThought), { journal: { maxTokens: 40 } }, st);
    expect(kept).toBe(HEAD + "\nRight now: " + bigThought + "]");
  });

  it("the switches: journal.on=false or journal.inject=false give no journal text, in the insert and in the preview", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria", "Cora"], chars: { Aria: { thought: "Думаю." } }, people: [{ who: "Aria", about: "You", text: "Вірю." }] })]);
    update(mock, "c1");
    const pv = () => drive(mock, { method: "GET", path: "/dashboard/preview", query: { chatId: "c1", speaker: "Aria" } }).json.insert;
    expect(pv().journalText).toContain("[What Aria thinks and feels (journal)");
    expect(pv().journalTokens).toBe(P.estimateTokensScript(pv().journalText));
    expect(pv().journalTokens).toBeGreaterThan(0);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { journal: { on: false } } });
    expect(pv().journalText).toBe("");
    expect(pv().journalTokens).toBe(0);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { journal: { on: true, inject: false } } });
    expect(pv().journalText).toBe("");
    expect(pv().journalTokens).toBe(0);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { journal: { on: true, inject: true } } });
    expect(pv().journalText).toContain("Right now: Думаю.");
  });

  it("llmRequest: the journal message and its part come after the dashboard part and before the said part", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria", "Cora"], chars: { Aria: { thought: "Думаю." } }, people: [{ who: "Aria", about: "You", text: "Вірю." }], said: [{ who: "Aria", text: "Я не побіжу.", kind: "vow" }] })]);
    update(mock, "c1");
    const out = askAt(mock, "c1", "Hi.", { turn: { op: "send", speakerName: "Aria" } });
    expect(out.promptSources.parts.map((p: { label: string }) => p.label)).toEqual(["Relationship dashboard", "Dashboard · journal", "Dashboard · said"]);
    const part = out.promptSources.parts[1];
    expect(part.kind).toBe("dashboard");
    expect(part.text).toContain("[What Aria thinks and feels (journal)");
    // in the messages: dashboard, journal, said, then the user's line last
    expect(String(out.messages[1].content).startsWith("[Background, the scene:")).toBe(true);
    expect(out.messages[2]).toEqual({ role: "system", content: part.text });
    expect(String(out.messages[3].content).startsWith("[What Aria has said")).toBe(true);
    expect(out.messages.at(-1)).toEqual({ role: "user", content: "Hi." });
  });

  it("a chat that muted plugin:journal gets no journal message or part; unmuting brings it back", () => {
    writeChat("c1", three(), { promptBoard: { v: 1, off: ["plugin:journal"] } });
    const mock = mockHost([reply({ present: ["Aria", "Cora"], chars: { Aria: { thought: "Думаю." } }, people: [{ who: "Aria", about: "You", text: "Вірю." }] })]);
    update(mock, "c1");
    const off = askAt(mock, "c1", "Hi.", { turn: { op: "send", speakerName: "Aria" } });
    expect(off.promptSources.parts.map((p: { label: string }) => p.label)).toEqual(["Relationship dashboard"]);
    expect(JSON.stringify(off.messages)).not.toContain("(journal)");
    writeChat("c1", three(), { promptBoard: { v: 1, off: [] } });
    const on = askAt(mock, "c1", "Hi.", { turn: { op: "send", speakerName: "Aria" } });
    expect(on.promptSources.parts.map((p: { label: string }) => p.label)).toEqual(["Relationship dashboard", "Dashboard · journal"]);
  });

  it("a group chat that cannot say who speaks gets no journal text; a named speaker gets their own block and never another's thought", () => {
    fs.mkdirSync(path.join(root, "groups"), { recursive: true });
    fs.writeFileSync(path.join(root, "groups/g1.json"), JSON.stringify({ memberIds: ["aria"], mode: "round" }));
    writeChat("g", three(), { characterId: undefined, groupId: "g1" });
    const mock = mockHost([reply({ present: ["Aria", "Cora"], chars: { Aria: { thought: "Вона бреше мені." }, Cora: { thought: "Він мене лякає." } }, people: [{ who: "Aria", about: "Cora", text: "Бреше." }] })]);
    update(mock, "g");
    const none = askAt(mock, "g");
    expect(none.promptSources.parts.map((p: { label: string }) => p.label)).toEqual(["Relationship dashboard"]);
    expect(JSON.stringify(none.messages)).not.toContain("(journal)");
    const named = askAt(mock, "g", "Hi.", { turn: { op: "send", speakerName: "Aria" } });
    const jtext = named.promptSources.parts.find((p: { label: string }) => p.label === "Dashboard · journal").text as string;
    expect(jtext).toContain("What Aria thinks");
    expect(jtext).toContain("Вона бреше мені.");
    expect(jtext).not.toContain("Він мене лякає.");
    expect(jtext).not.toContain("What Cora");
  });

  it("a narrator group gives every focus character its block, joined in order with a line break", () => {
    fs.mkdirSync(path.join(root, "groups"), { recursive: true });
    fs.writeFileSync(path.join(root, "groups/g1.json"), JSON.stringify({ id: "g1", generationMode: "narrator", memberIds: ["aria"] }));
    writeChat("n", three(), { characterId: undefined, groupId: "g1" });
    const mock = mockHost([reply({ present: ["Aria", "Cora"], chars: { Aria: { thought: "Думаю про неї." }, Cora: { thought: "Думаю про нього." } } })]);
    update(mock, "n");
    const out = askAt(mock, "n", "Aria and Cora, hello.");
    const jtext = out.promptSources.parts.find((p: { label: string }) => p.label === "Dashboard · journal").text as string;
    expect(jtext).toContain("What Aria thinks and feels (journal)");
    expect(jtext).toContain("What Cora thinks and feels (journal)");
    expect(jtext.indexOf("What Aria")).toBeLessThan(jtext.indexOf("What Cora"));
    expect(jtext).toContain("Right now: Думаю про неї.]\n[What Cora");
  });

  it("the view carries thought, thoughtTurn, thoughtFresh and the people lines for each character", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria", "Cora"], chars: { Aria: { thought: "Він щось приховує." } }, people: [{ who: "Aria", about: "You", text: "Я йому вірю." }] })]);
    update(mock, "c1");
    const v = view(mock, "c1").view;
    expect(v.turn).toBe(1);
    expect(v.chars.Aria).toMatchObject({
      thought: "Він щось приховує.",
      thoughtTurn: 1,
      thoughtFresh: true,
      journal: [{ id: "j1", about: "You", text: "Я йому вірю.", by: "sensor", turn: 1 }],
    });
    expect(v.chars.Cora).toMatchObject({ thought: null, thoughtTurn: null, thoughtFresh: false, journal: [] });

    // the thought fades in the view after thoughtTurns (3) turns; the people line stays
    let msgs = three();
    for (let i = 4; i <= 6; i++) {
      msgs = [...msgs, U("m" + i, "Line " + i + ".")];
      writeChat("c1", msgs);
      mock.push(reply({ present: ["Aria"] }));
      update(mock, "c1");
      const now = view(mock, "c1").view;
      expect(now.turn).toBe(i - 2);
      expect(now.chars.Aria.thoughtFresh).toBe(i < 6);
      expect(now.chars.Aria.thought).toBe("Він щось приховує.");
      expect(now.chars.Aria.journal.map((j: { text: string }) => j.text)).toEqual(["Я йому вірю."]);
    }
    // a shorter setting fades a fresh thought at once
    writeChat("c2", three());
    mock.push(reply({ present: ["Aria"], chars: { Aria: { thought: "Думаю." } } }));
    update(mock, "c2");
    writeChat("c2", [...three(), U("m4", "Once more.")]);
    mock.push(reply({ present: ["Aria"] }));
    update(mock, "c2");
    expect(view(mock, "c2").view.chars.Aria.thoughtFresh).toBe(true);
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { journal: { thoughtTurns: 1 } } });
    expect(view(mock, "c2").view.chars.Aria.thoughtFresh).toBe(false);
  });
});
