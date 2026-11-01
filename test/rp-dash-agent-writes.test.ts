/**
 * #132 (write): what an agent changed on the Dashboard (the ledger in data/dashboard/agent/<chatId>.json) is put back
 * when the sensor reads a message again and makes its snapshot anew, and is not put back once it was undone.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-agent-"));
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
const stateFile = (id: string) => path.join(root, "dashboard/state", id + ".json");
const readStateFile = (id: string) => JSON.parse(fs.readFileSync(stateFile(id), "utf8"));

type Msg = { id: string; role: string; name?: string; text: string; swipe?: number };
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "You", text });
const A = (id: string, text: string): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });
function writeChat(id: string, msgs: Msg[], meta: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ title: "Chat " + id, characterId: "aria", userName: "You", model: "chat/model", updatedAt: Date.now(), ...meta }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}
const link = (from: string, chatId: string) => fs.writeFileSync(path.join(root, "litopys/links.json"), JSON.stringify({ v: 1, links: { [chatId]: { from, at: 1 } } }));
const reply = (o: Record<string, unknown>) => JSON.stringify(o);



const three = () => [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "Good evening.")];
const senseMood = (mock: ReturnType<typeof mockHost>, chatId: string, mood: string) => {
  mock.push(reply({ present: ["Aria"], chars: { Aria: { mood } } }));
  expect(update(mock, chatId).json.ok).toBe(true);
};
const ledger = (entries: Record<string, unknown>[]) => {
  fs.mkdirSync(path.join(root, "dashboard/agent"), { recursive: true });
  fs.writeFileSync(path.join(root, "dashboard/agent/c1.json"), JSON.stringify({ v: 1, counter: entries.length, entries }));
};
const moodOf = () => readStateFile("c1").snapshots["m3#0"].chars.Aria.mood;

describe("changes agents made survive a new reading of the message", () => {
  it("a snapshot made anew gets the agent's value again, and the sensor goes on from it", () => {
    const mock = mockHost();
    writeChat("c1", three());
    senseMood(mock, "c1", "calm");
    expect(moodOf()).toBe("calm");
    // the agent changed the mood and trust of the newest snapshot (the Agents plugin writes both the file and the ledger)
    const st = readStateFile("c1");
    st.snapshots["m3#0"].chars.Aria.mood = "tense";
    st.snapshots["m3#0"].chars.Aria.stats.trust = 40;
    fs.writeFileSync(stateFile("c1"), JSON.stringify(st, null, 2));
    ledger([
      { id: "d1", agent: "x", key: "m3#0", field: "mood", who: "Aria", before: "calm", after: "tense", at: 1 },
      { id: "d2", agent: "x", key: "m3#0", field: "trust", who: "Aria", before: 0, after: 40, at: 1 },
    ]);
    // the last message is edited: the sensor reads it again and says "calm" again
    writeChat("c1", [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "Good evening, friend.")]);
    senseMood(mock, "c1", "calm");
    const aria = readStateFile("c1").snapshots["m3#0"].chars.Aria;
    expect(aria.mood).toBe("tense");
    expect(aria.stats.trust).toBe(40);
    expect(aria.fresh).toContain("mood");
  });

  it("an undone change is not put back, and a change for a message that is gone is ignored", () => {
    const mock = mockHost();
    writeChat("c1", three());
    senseMood(mock, "c1", "calm");
    ledger([
      { id: "d1", agent: "x", key: "m3#0", field: "mood", who: "Aria", before: "calm", after: "tense", at: 1, undone: 2 },
      { id: "d2", agent: "x", key: "m9#0", field: "mood", who: "Aria", before: "calm", after: "furious", at: 1 },
      { id: "d3", agent: "x", key: "m3#0", field: "mood", who: "Nobody", before: null, after: "lost", at: 1 },
    ]);
    writeChat("c1", [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "Good evening, friend.")]);
    senseMood(mock, "c1", "calm");
    expect(moodOf()).toBe("calm");
    expect(Object.keys(readStateFile("c1").snapshots)).not.toContain("m9#0");
  });

  it("a scene field comes back too, with the place log", () => {
    const mock = mockHost();
    writeChat("c1", three());
    mock.push(reply({ present: ["Aria"], place: "the road", weather: "dry" }));
    expect(update(mock, "c1").json.ok).toBe(true);
    ledger([{ id: "d1", agent: "x", key: "m3#0", field: "weather", before: "dry", after: "fog", at: 1 }, { id: "d2", agent: "x", key: "m3#0", field: "place", before: "the road", after: "the mill", at: 1 }]);
    writeChat("c1", [U("m1", "Hello."), A("m2", "Welcome."), U("m3", "Good evening, friend.")]);
    mock.push(reply({ present: ["Aria"], place: "the road", weather: "dry" }));
    expect(update(mock, "c1").json.ok).toBe(true);
    const s = readStateFile("c1");
    expect(s.snapshots["m3#0"].clock).toMatchObject({ weather: "fog", place: "the mill" });
    expect(s.places["m3#0"].place).toBe("the mill");
  });
});
