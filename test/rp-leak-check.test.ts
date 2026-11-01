/**
 * #184 P3: does a reply let a character act on a secret it does not know? Step A (code) finds the restricted Litopys facts
 * the new messages resemble; step B is the sensor's call (or a small call of its own in fast mode, only when step A found
 * something). A hit waits for the user's answer, and until then the character's notes from that reply are not kept.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "leak-"));
  for (const d of ["chats", "characters/aria", "dashboard", "litopys/chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
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
  return { host, requests, answer };
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
const json = (o: Record<string, unknown>) => JSON.stringify(o);

const SECRET = "Bram sold the guild's map to the Duke's spy.";
const facts = (knownBy: unknown = ["Bram"]) =>
  fs.writeFileSync(path.join(root, "litopys/chats/c1.json"), JSON.stringify({ facts: [{ id: "f1", text: SECRET, status: "active", knownBy }, { id: "f2", text: "The harbour is closed for the winter.", status: "active", knownBy: "all" }] }));
const leaky = () => [U("m1", "Where did the guild's map go?"), A("m2", "Aria narrows her eyes. 'Bram sold the map to the Duke's spy, I am sure of it.'")];
const learned = [{ who: "Aria", text: "You are asking about the map", how: "heard", weight: "everyday" }];

describe("leak check, step A", () => {
  const base = { reply: "Aria says Bram sold the guild map to the Duke spy.", userText: "Where is the map?", people: ["Aria", "Bram"], speakers: ["Aria"], userNames: ["You"] };
  it("pairs a restricted fact the reply resembles with a present character who does not know it", () => {
    const c = P.leakCandidates({ ...base, facts: [{ id: "f1", text: SECRET, knownBy: ["Bram"] }] });
    expect(c).toEqual([{ who: "Aria", factId: "f1", text: SECRET }]);
  });
  it("skips a fact everyone knows, one the speaker knows, one the player just said, and a weak resemblance", () => {
    expect(P.leakCandidates({ ...base, facts: [{ id: "f1", text: SECRET, knownBy: "all" }] })).toEqual([]);
    expect(P.leakCandidates({ ...base, facts: [{ id: "f1", text: SECRET, knownBy: ["Aria", "Bram"] }] })).toEqual([]);
    expect(P.leakCandidates({ ...base, userText: "I heard Bram sold the guild map to the Duke spy.", facts: [{ id: "f1", text: SECRET, knownBy: ["Bram"] }] })).toEqual([]);
    expect(P.leakCandidates({ ...base, reply: "Aria says the map is old.", facts: [{ id: "f1", text: SECRET, knownBy: ["Bram"] }] })).toEqual([]);
  });
  it("blames a named character of a narrator reply, never the player or one not mentioned", () => {
    const f = [{ id: "f1", text: SECRET, knownBy: ["Bram"] }];
    const c = P.leakCandidates({ ...base, speakers: ["Narrator"], reply: "The narrator tells how Cael muttered that Bram sold the guild map to the Duke spy.", people: ["Aria", "Bram", "Cael", "You"], facts: f });
    expect(c.map((x: any) => x.who)).toEqual(["Cael"]);
  });
  it("reads Russian endings the same way", () => {
    const f = [{ id: "f1", text: "Брам продал карту гильдии шпиону герцога.", knownBy: ["Брам"] }];
    const c = P.leakCandidates({ facts: f, reply: "Ария шепнула: Брам продал карту шпиону герцога, я уверена.", userText: "Где карта?", people: ["Ария", "Брам"], speakers: ["Ария"], userNames: ["Ты"] });
    expect(c.map((x: any) => x.who)).toEqual(["Ария"]);
  });
});

describe("leak check, in the sensor call", () => {
  it("asks about the candidates, keeps a hit, holds the character's notes, and shows it in the view", () => {
    facts();
    writeChat("c1", leaky());
    const mock = mockHost([json({ present: ["Aria"], learned, leaks: [{ id: "L1", quote: "Bram sold the map to the Duke's spy" }] })]);
    update(mock, "c1");
    const input = mock.requests[0]!.req.messages[0].content as string;
    expect(input).toContain("Leak check:");
    expect(input).toContain("L1: Aria does not know: " + SECRET);
    const st = readStateFile("c1");
    expect(st.leaks["m2#0"].items).toEqual([{ who: "Aria", factId: "f1", text: SECRET, quote: "Bram sold the map to the Duke's spy", status: "open" }]);
    expect(st.notebook.Aria).toBeUndefined();
    expect(view(mock, "c1").leaks).toEqual([{ key: "m2#0", msgId: "m2", swipe: 0, who: "Aria", factId: "f1", text: SECRET, quote: "Bram sold the map to the Duke's spy" }]);
  });

  it("keeps the notes when the sensor finds no leak, and asks nothing when nothing resembles a restricted fact", () => {
    facts();
    writeChat("c1", leaky());
    const mock = mockHost([json({ present: ["Aria"], learned })]);
    update(mock, "c1");
    expect(readStateFile("c1").leaks).toBeUndefined();
    expect(readStateFile("c1").notebook.Aria.length).toBe(1);
    expect(view(mock, "c1").leaks).toEqual([]);
    writeChat("c2", [U("m1", "Hello."), A("m2", "Aria waves.")]);
    fs.copyFileSync(path.join(root, "litopys/chats/c1.json"), path.join(root, "litopys/chats/c2.json"));
    const quiet = mockHost([json({ present: ["Aria"] })]);
    update(quiet, "c2");
    expect(quiet.requests[0]!.req.messages[0].content).not.toContain("Leak check");
  });

  it("is switched off by leakCheck: false", () => {
    facts();
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, leakCheck: false }));
    writeChat("c1", leaky());
    const mock = mockHost([json({ present: ["Aria"], learned, leaks: [{ id: "L1", quote: "x" }] })]);
    update(mock, "c1");
    expect(mock.requests[0]!.req.messages[0].content).not.toContain("Leak check");
    expect(readStateFile("c1").leaks).toBeUndefined();
    expect(readStateFile("c1").notebook.Aria.length).toBe(1);
  });

  it("ignores an id the model made up, and a re-read of the reply clears an old hit", () => {
    facts();
    writeChat("c1", leaky());
    const bad = mockHost([json({ present: ["Aria"], leaks: [{ id: "L9", quote: "x" }] })]);
    update(bad, "c1");
    expect(readStateFile("c1").leaks).toBeUndefined();
    fs.rmSync(path.join(root, "dashboard/state"), { recursive: true, force: true });
    const hit = mockHost([json({ present: ["Aria"], leaks: [{ id: "L1", quote: "q" }] })]);
    update(hit, "c1");
    expect(Object.keys(readStateFile("c1").leaks)).toEqual(["m2#0"]);
    // the reply is edited and read again: the new reading replaces the hit
    writeChat("c1", [U("m1", "Where did the guild's map go?"), { ...A("m2", "Aria narrows her eyes. 'Bram sold the map to the Duke's spy, I am sure of it. Sorry.'"), edited: true } as Msg]);
    const again = mockHost([json({ present: ["Aria"] })]);
    update(again, "c1");
    expect(readStateFile("c1").leaks).toEqual({});
  });
});

describe("leak check, the user's answer", () => {
  const hitChat = () => {
    facts();
    writeChat("c1", leaky());
    const mock = mockHost([json({ present: ["Aria"], learned, leaks: [{ id: "L1", quote: "q" }] })]);
    update(mock, "c1");
    return mock;
  };
  const answer = (mock: ReturnType<typeof mockHost>, op: string, extra: Record<string, unknown> = {}) => drive(mock, { method: "POST", path: "/dashboard/leak", body: { chatId: "c1", key: "m2#0", who: "Aria", factId: "f1", op, ...extra } });

  it("found out and ignore both close the badge; nothing else is open", () => {
    for (const op of ["found", "ignore"]) {
      fs.rmSync(path.join(root, "dashboard/state"), { recursive: true, force: true });
      const mock = hitChat();
      const r = answer(mock, op);
      expect(r.status).toBe(200);
      expect(r.json.leaks).toEqual([]);
      expect(readStateFile("c1").leaks["m2#0"].items[0].status).toBe(op === "found" ? "found" : "ignored");
      // a second answer finds nothing open
      expect(answer(mock, op).status).toBe(404);
    }
  });

  it("refuses a bad op, a bad chat id and an unknown hit", () => {
    const mock = hitChat();
    expect(answer(mock, "regenerate").status).toBe(400);
    expect(drive(mock, { method: "POST", path: "/dashboard/leak", body: { chatId: "../x", op: "found" } }).status).toBe(400);
    expect(answer(mock, "found", { who: "Bram" }).status).toBe(404);
  });
});

describe("leak check, fast mode", () => {
  const fastEntry = (body: unknown) => {
    fs.mkdirSync(path.join(root, "dashboard/fast"), { recursive: true });
    fs.writeFileSync(path.join(root, "dashboard/fast/c1.json"), JSON.stringify({ v: 1, entries: { "m2#0": { body: json(body as Record<string, unknown>), at: Date.now(), model: "m/x", closed: true } } }));
  };

  it("makes its own small call only when step A found something", () => {
    facts();
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, mode: "fast" }));
    writeChat("c1", leaky());
    fastEntry({ present: ["Aria"], learned });
    const mock = mockHost([json({ leaks: [{ id: "L1", quote: "Bram sold the map" }] })]);
    update(mock, "c1");
    expect(mock.requests.map((r) => r.key)).toEqual(["leak"]);
    expect(mock.requests[0]!.req.messages[0].content).toContain("L1: Aria does not know: " + SECRET);
    const st = readStateFile("c1");
    expect(st.leaks["m2#0"].items[0]).toMatchObject({ who: "Aria", status: "open" });
    expect(st.notebook.Aria).toBeUndefined();
  });

  it("makes no call when nothing resembles a restricted fact", () => {
    facts();
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, mode: "fast" }));
    writeChat("c1", [U("m1", "Hello."), A("m2", "Aria waves.")]);
    fastEntry({ present: ["Aria"] });
    const mock = mockHost([]);
    update(mock, "c1");
    expect(mock.requests.length).toBe(0);
  });
});
