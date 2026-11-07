/**
 * #184 P4: a lie one character tells in front of others is taken as true by the listeners until they learn better.
 * It lives on the lie's entry in the Said list (`heardBy`, `exposed`), reaches a listener's own reply part only, is shown to
 * the sensor so it can end the belief, and goes away per person.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-belief-"));
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
const notes = (m: ReturnType<typeof mockHost>, body: Record<string, unknown>) => drive(m, { method: "POST", path: "/dashboard/notes", body: { chatId: "c1", ...body } });
const readStateFile = (id: string) => JSON.parse(fs.readFileSync(path.join(root, "dashboard/state", id + ".json"), "utf8"));
type Msg = { id: string; role: string; name?: string; text: string; swipe?: number };
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "You", text });
const A = (id: string, text: string): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });
function writeChat(id: string, msgs: Msg[]) {
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ title: "Chat " + id, characterId: "aria", userName: "You", model: "chat/model", updatedAt: Date.now() }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}
const reply = (o: Record<string, unknown>) => JSON.stringify(o);
const said = (who: string, text: string, kind = "promise", extra: Record<string, unknown> = {}) => ({ who, text, kind, ...extra });
const LIE = "The debt to the tavern is already paid.";
const lie = () => said("Aria", LIE, "lie", { lie: true });
const three = () => [U("m1", "Hello."), A("m2", "Do not worry, " + LIE), U("m3", "Is that so?")];

/** a chat where Aria lies in front of Bram, seen by the sensor once */
function lied(extraReplies: string[] = []) {
  writeChat("c1", three());
  const mock = mockHost([reply({ present: ["Aria", "Bram"], said: [lie()] }), ...extraReplies]);
  update(mock, "c1");
  return mock;
}

describe("a lie is heard by the others in the scene (#184 P4)", () => {
  it("is remembered on the lie for each listener, never the speaker or the user, and only for a lie", () => {
    lied();
    expect(readStateFile("c1").said.Aria[0]).toMatchObject({ kind: "lie", hidden: true, heardBy: ["Bram"] });
  });

  it("a promise has no listeners to fool, and a lie in front of nobody fools nobody", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria", "Bram"], said: [said("Aria", "I will not run.", "vow")] })]);
    update(mock, "c1");
    expect(readStateFile("c1").said.Aria[0].heardBy).toBeUndefined();
    writeChat("c2", three());
    const alone = mockHost([reply({ present: ["Aria"], said: [lie()] })]);
    update(alone, "c2");
    expect(readStateFile("c2").said.Aria[0]).toMatchObject({ kind: "lie" });
    expect(readStateFile("c2").said.Aria[0].heardBy).toBeUndefined();
  });

  it("the listener's reply gets it as told by the liar and has no reason to doubt; the liar's own line still says it was a lie", () => {
    lied();
    const text = P.saidBlock(readStateFile("c1"), ["m3#0"], ["Aria", "Bram"], 120);
    expect(text).toContain("[What Aria has said, and is held to: a lie they told “" + LIE + "”.]");
    expect(text).toContain("[Bram was told by Aria: “" + LIE + "”. Bram has no reason to doubt it unless the story shows otherwise.]");
  });

  it("only the listener's section carries it: a reply spoken by the liar, or by a third person, does not", () => {
    lied();
    const st = readStateFile("c1");
    const liarOnly = P.saidBlock(st, ["m3#0"], ["Aria"], 120);
    expect(liarOnly).not.toContain("Bram was told");
    const third = P.saidBlock(st, ["m3#0"], ["Cora"], 120);
    expect(third).toBe("");
  });

  it("the switch of the said part carries the belief with it", () => {
    const mock = lied();
    const turn = { op: "send", speakerName: "Aria", targetId: "", userText: "hi" };
    const on = P.buildInsert(mock.host.fs, "c1", turn, { injection: {}, said: { inject: true } });
    expect(on.saidText).toContain("a lie they told");
    const off = P.buildInsert(mock.host.fs, "c1", turn, { injection: {}, said: { inject: false } });
    expect(off.saidText).toBe("");
  });
});

describe("the sensor sees the belief and can end it (#184 P4)", () => {
  it("the next report is shown the belief as a line of the listener's notebook, marked untrue", () => {
    const mock = lied([reply({ present: ["Aria", "Bram"] })]);
    writeChat("c1", [...three(), A("m4", "Of course."), U("m5", "Hm.")]);
    update(mock, "c1");
    const asked = mock.requests[1]!.req.messages[0].content as string;
    expect(asked).toContain("Notebook of Bram\ns1~Bram heard from Aria: " + LIE + " (untrue; Bram does not know)");
    expect(asked).not.toContain("Notebook of Aria\ns1~");
  });

  it("retiring that line ends the belief for that person only, and the view stops listing him", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria", "Bram", "Cora"], said: [lie()] }), reply({ present: ["Aria", "Bram", "Cora"], retire: ["s1~Bram"] })]);
    update(mock, "c1");
    expect(view(mock, "c1").view.chars.Aria.said[0].believers).toEqual(["Bram", "Cora"]);
    writeChat("c1", [...three(), A("m4", "Bram, I lied."), U("m5", "Ah.")]);
    update(mock, "c1");
    const st = readStateFile("c1");
    expect(st.said.Aria[0].exposed).toHaveLength(1);
    expect(st.said.Aria[0].exposed[0]).toMatchObject({ who: "Bram" });
    expect(view(mock, "c1").view.chars.Aria.said[0].believers).toEqual(["Cora"]);
    const text = P.saidBlock(st, ["m5#0", "m3#0"].filter(() => true), ["Bram", "Cora"], 120);
    expect(text).not.toContain("Bram was told");
  });

  it("a bare entry id counts only when one person is left believing it", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria", "Bram"], said: [lie()] }), reply({ present: ["Aria", "Bram"], retire: ["s1"] })]);
    update(mock, "c1");
    writeChat("c1", [...three(), A("m4", "Bram, I lied."), U("m5", "Ah.")]);
    update(mock, "c1");
    expect(view(mock, "c1").view.chars.Aria.said[0].believers).toBeUndefined();
  });

  it("a rewound reply brings the belief back: an exposure counts only while its snapshot is on the line", () => {
    lied();
    const s = readStateFile("c1").said.Aria[0];
    const done = { ...s, exposed: [{ who: "Bram", by: "m9#0", turn: 3 }] };
    expect(P.believersOf(done, "Aria", ["m3#0", "m9#0"], null)).toEqual([]);
    expect(P.believersOf(done, "Aria", ["m3#0"], null)).toEqual(["Bram"]);
  });
});

describe("the user ends a belief by hand (#184 P4)", () => {
  it("'knows-truth' ends it for the named person, and for no one else; unknown ids and names are refused", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria", "Bram", "Cora"], said: [lie()] })]);
    update(mock, "c1");
    expect(notes(mock, { op: "knows-truth", id: "s1", name: "Bram" }).json.ok).toBe(true);
    expect(view(mock, "c1").view.chars.Aria.said[0].believers).toEqual(["Cora"]);
    expect(notes(mock, { op: "knows-truth", id: "s1", name: "Dag" }).status).toBe(404);
    expect(notes(mock, { op: "knows-truth", id: "s99", name: "Bram" }).status).toBe(404);
    expect(notes(mock, { op: "knows-truth", id: "s1" }).status).toBe(400);
    const edits = JSON.parse(fs.readFileSync(path.join(root, "dashboard/notes/c1.json"), "utf8")).edits;
    expect(P.saidBlock(readStateFile("c1"), ["m3#0"], ["Bram", "Cora"], 120, { edits })).not.toContain("Bram was told");
    expect(P.saidBlock(readStateFile("c1"), ["m3#0"], ["Bram", "Cora"], 120, { edits })).toContain("Cora was told by Aria");
  });

  it("removing the lie from the list removes the belief too", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria", "Bram"], said: [lie()] })]);
    update(mock, "c1");
    expect(notes(mock, { op: "retire", id: "s1" }).json.ok).toBe(true);
    const edits = JSON.parse(fs.readFileSync(path.join(root, "dashboard/notes/c1.json"), "utf8")).edits;
    expect(P.saidBlock(readStateFile("c1"), ["m3#0"], ["Aria", "Bram"], 120, { edits })).toBe("");
  });
});

describe("a belief travels with the chat (#184 P4)", () => {
  it("a chat that continues this one keeps who still believes, and drops the bookkeeping of who learned better", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria", "Bram", "Cora"], said: [lie()] }), reply({ present: ["Aria", "Bram", "Cora"], retire: ["s1~Bram"] })]);
    update(mock, "c1");
    writeChat("c1", [...three(), A("m4", "Bram, I lied."), U("m5", "Ah.")]);
    update(mock, "c1");
    writeChat("c2", [A("n1", "Morning.")]);
    fs.writeFileSync(path.join(root, "litopys/links.json"), JSON.stringify({ v: 1, links: { c2: { from: "c1", at: 1 } } }));
    expect(view(mock, "c2").view.chars.Aria.said[0].believers).toEqual(["Cora"]);
    mock.push(reply({ present: ["Aria", "Cora"] }));
    writeChat("c2", [A("n1", "Morning."), U("n2", "Hi")]);
    update(mock, "c2");
    const carried = readStateFile("c2").said.Aria[0];
    expect(carried).toMatchObject({ src: "inherit", heardBy: ["Cora"] });
    expect(carried.exposed).toBeUndefined();
  });
});
