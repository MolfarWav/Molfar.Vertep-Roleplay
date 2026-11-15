/**
 * The bond (#bond): the constellation said to the reply model as one line, with a short tail for what has been rising or falling lately,
 * and the eight bands of the five feelings. The words only; no digits reach the model.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-clock-"));
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
const update = (m: ReturnType<typeof mockHost>, chatId: string) => drive(m, { method: "POST", path: "/dashboard/update", body: { chatId, op: "send" } });
const view = (m: ReturnType<typeof mockHost>, chatId: string) => drive(m, { method: "GET", path: "/dashboard/state", query: { chatId, view: "1" } }).json;
const readStateFile = (id: string) => JSON.parse(fs.readFileSync(path.join(root, "dashboard/state", id + ".json"), "utf8"));
type Msg = { id: string; role: string; name?: string; text: string; swipe?: number };
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "You", text });
const A = (id: string, text: string): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });
function writeChat(id: string, msgs: Msg[], meta: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ title: "Chat " + id, characterId: "aria", userName: "You", model: "chat/model", updatedAt: Date.now(), ...meta }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}
const reply = (o: Record<string, unknown>) => JSON.stringify(o);
const three = () => [U("m1", "Hello."), A("m2", "I will not run."), U("m3", "Promise?")];
const said = (who: string, text: string, kind = "promise", extra: Record<string, unknown> = {}) => ({ who, text, kind, ...extra });


const sceneOf = (text: string) => text.split(String.fromCharCode(10)).find((l) => l.startsWith("[Background, the scene:")) ?? "";
const turn = { op: "send", speakerName: "", targetId: "", userText: "hi" };


const WHO = { user: "Sam", their: "their", self: "themself" };
const stats = (o: Record<string, number> = {}) => ({ trust: 0, comfort: 0, attraction: 0, respect: 0, affection: 0, ...o });

describe("bands of a feeling", () => {
  it("the edges: 5 says nothing, 6, 16, 40 and 70 start a band, the same below zero", () => {
    const at = (v: number) => P.bandOf(v);
    expect([0, 5, -5].map(at)).toEqual([0, 0, 0]);
    expect([6, 15, 16, 39, 40, 69, 70, 100].map(at)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect([-6, -15, -16, -39, -40, -69, -70, -100].map(at)).toEqual([-1, -1, -2, -2, -3, -3, -4, -4]);
  });

  it("every stat has eight different phrases, and a neutral value has none", () => {
    for (const stat of ["trust", "comfort", "attraction", "respect", "affection"]) {
      const said = [-100, -50, -20, -8, 8, 20, 50, 100].map((v) => P.tierPhrase(stat, v, WHO));
      expect(said.every(Boolean)).toBe(true);
      expect(new Set(said).size).toBe(8);
      expect(P.tierPhrase(stat, 3, WHO)).toBe("");
    }
  });
});

describe("the bond line", () => {
  it("says the constellation short, in words, with the user's name and no digit", () => {
    const line = P.bondLine(stats({ trust: 56, comfort: 57, attraction: 19, respect: 62, affection: 56 }), "ally", "Sam", []);
    expect(line).toBe("Bond with Sam: loyal to Sam and respectful, but no romance.");
    expect(line).not.toMatch(/\d/);
  });

  it("says nothing for a blank or a strangers pair, and has words for every other constellation", () => {
    expect(P.bondLine(stats(), "ally", "Sam", [])).toBe("");
    expect(P.bondLine(stats({ trust: 10, comfort: -10 }), "neutral", "Sam", [])).toBe("");
    for (const c of P.CONSTELLATIONS) if (!["strangers", "unsettled"].includes(c.id)) expect(typeof P.BOND_WORDS[c.id]).toBe("string");
  });

  it("a friend who likes the user and a friend who cannot stand the user get different bonds", () => {
    expect(P.bondLine(stats({ trust: 40, comfort: 40, affection: 40 }), "ally", "Sam", [])).toContain("friends with Sam");
    expect(P.bondLine(stats({ trust: -45, comfort: -30, affection: -40 }), "neutral", "Sam", [])).toMatch(/resentful|hatred|distrusts/);
  });

  it("the tails come after the bond", () => {
    expect(P.bondLine(stats({ trust: 60, respect: 50 }), "ally", "Sam", ["a romantic interest in Sam is stirring", "relaxing around Sam"])).toBe(
      "Bond with Sam: loyal to Sam and respectful, but no romance; lately a romantic interest in Sam is stirring, relaxing around Sam.",
    );
  });
});

describe("what a stat has been doing lately", () => {
  const trail = (key: string, ...v: number[]) => v.map((x) => stats({ [key]: x }));

  it("a steady climb of attraction says a romantic interest is stirring; with the arousal above its base, physical closeness", () => {
    const t = trail("attraction", 4, 7, 10, 13, 16, 19);
    expect(P.trendTails(t, { user: "Sam" }, false)).toEqual(["a romantic interest in Sam is stirring"]);
    expect(P.trendTails(t, { user: "Sam" }, true)).toEqual(["wants physical closeness with Sam"]);
  });

  it("a fall is said too, and a flat or short trail says nothing", () => {
    expect(P.trendTails(trail("trust", 20, 16, 12, 8, 4, 0), { user: "Sam" }, false)).toEqual(["losing trust in Sam"]);
    expect(P.trendTails(trail("trust", 20, 20, 20, 20, 20, 20), { user: "Sam" }, false)).toEqual([]);
    expect(P.trendTails(trail("trust", 0, 30), { user: "Sam" }, false)).toEqual([]);
    expect(P.trendTails([], { user: "Sam" }, false)).toEqual([]);
  });

  it("a jump with one step back still counts when it is big enough; a wobble does not", () => {
    expect(P.trendTails(trail("comfort", 0, 6, 12, 10, 16, 18), { user: "Sam" }, false)).toEqual(["relaxing around Sam"]);
    expect(P.trendTails(trail("comfort", 10, 14, 9, 15, 8, 13), { user: "Sam" }, false)).toEqual([]);
  });

  it("a stat already past 50 (or below -50) is the bond, not a movement", () => {
    expect(P.trendTails(trail("affection", 44, 48, 52, 56, 60, 64), { user: "Sam" }, false)).toEqual([]);
    expect(P.trendTails(trail("affection", -44, -48, -52, -56, -60, -64), { user: "Sam" }, false)).toEqual([]);
  });

  it("at most two tails, the biggest movement first", () => {
    const t = [0, 1, 2, 3, 4, 5].map((i) => stats({ trust: i * 2, comfort: i * 3, attraction: i * 4, respect: i * 2, affection: i * 2 }));
    expect(P.trendTails(t, { user: "Sam" }, false)).toEqual(["a romantic interest in Sam is stirring", "relaxing around Sam"]);
  });
});

describe("the bond in the reply prompt", () => {
  const msgs = () => [U("m1", "Hello."), A("m2", "Hi."), U("m3", "Walk with me?"), A("m4", "Alright."), U("m5", "Thanks."), A("m6", "Anytime."), U("m7", "More?")];
  const seed = (attractionTrail: number[]) => {
    writeChat("c1", msgs());
    const mock = mockHost([reply({ present: ["Aria"], time: "19:40", day: 1, place: "the tavern" })]);
    update(mock, "c1");
    const file = path.join(root, "dashboard/state/c1.json");
    const st = JSON.parse(fs.readFileSync(file, "utf8"));
    const last = Object.keys(st.snapshots).pop()!;
    // the older snapshots are copies with the stats the trail wants; the newest carries the last value
    const base = JSON.parse(JSON.stringify(st.snapshots[last]));
    const old = attractionTrail.slice(0, -1);
    const slots = old.length ? ["m1#0", "m2#0", "m3#0", "m4#0", "m5#0"].slice(-old.length) : [];
    slots.forEach((k, i) => {
      st.snapshots[k] = JSON.parse(JSON.stringify(base));
      st.snapshots[k].chars.Aria.stats = stats({ trust: 60, respect: 50, attraction: old[i] });
    });
    st.snapshots[last].chars.Aria.stats = stats({ trust: 60, respect: 50, attraction: attractionTrail[attractionTrail.length - 1] });
    st.snapshots[last].chars.Aria.cls = "ally";
    st.snapshots[last].chars.Aria.pulse = { excitement: 12, arousal: 9 };
    fs.writeFileSync(file, JSON.stringify(st));
    return mock;
  };
  const ask = (mock: ReturnType<typeof mockHost>) => P.buildInsert(mock.host.fs, "c1", { op: "send", speakerName: "Aria", targetId: "", userText: "More?" }, { injection: {} }).text as string;

  it("the loyal bond comes first, with the stirring interest as its tail, then the five feelings", () => {
    const text = ask(seed([4, 8, 11, 14, 16, 19]));
    const lines = text.split(String.fromCharCode(10));
    const bond = lines.findIndex((l) => l.startsWith("Bond with You:"));
    const toward = lines.findIndex((l) => l.startsWith("Toward You:"));
    expect(bond).toBeGreaterThan(0);
    expect(toward).toBe(bond + 1);
    expect(lines[bond]).toBe("Bond with You: loyal to You and respectful, but no romance; lately a romantic interest in You is stirring.");
    expect(lines[bond] + lines[toward]).not.toMatch(/[0-9]/);
  });

  it("the setting turns the line off; it is on by default, in a config from before it too", () => {
    const mock = seed([4, 8, 11, 14, 16, 19]);
    const off = P.buildInsert(mock.host.fs, "c1", { op: "send", speakerName: "Aria", targetId: "", userText: "More?" }, { injection: {}, bond: { inject: false } }).text as string;
    expect(off).not.toContain("Bond with");
    expect(off).toContain("Toward You:");
    expect(ask(mock)).toContain("Bond with You:");
    // the route keeps the choice and drops it from the file once it is the default again
    const get = () => drive(mock, { method: "GET", path: "/dashboard/config" }).json;
    expect(get().bond).toEqual({ inject: true });
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { bond: { inject: false } } });
    expect(get().bond).toEqual({ inject: false });
    expect(JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8")).bond).toEqual({ inject: false });
    drive(mock, { method: "PUT", path: "/dashboard/config", body: { bond: { inject: true } } });
    expect(get().bond).toEqual({ inject: true });
    expect(JSON.parse(fs.readFileSync(path.join(root, "dashboard/config.json"), "utf8")).bond).toBeUndefined();
  });

  it("without a trail there is the bond and no tail", () => {
    const text = ask(seed([19]));
    expect(text).toContain("Bond with You: loyal to You and respectful, but no romance.");
    expect(text).not.toContain("lately");
  });
});
