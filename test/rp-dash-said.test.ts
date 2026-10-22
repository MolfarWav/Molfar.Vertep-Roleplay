/**
 * #98: what a character said (a vow, a threat, a confession, a lie) is its own list in the sensor report,
 * kept apart from the notebook, injected as its own part, and a lie stays hidden from the user.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-said-"));
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

describe("what a character said (#98)", () => {
  it("is its own list: kept for a present character, at most the setting per turn, near copies once", () => {
    writeChat("c1", three());
    const mock = mockHost([
      reply({
        present: ["Aria"],
        said: [said("Aria", "I will not run until you tell me the truth."), said("Aria", "I will not run until you tell me the truth!"), said("Aria", "Touch the gate and I will end you.", "threat"), said("Aria", "A third one", "order")],
      }),
    ]);
    update(mock, "c1");
    const list = readStateFile("c1").said.Aria;
    expect(list.map((s: any) => [s.kind, s.source])).toEqual([["promise", "chat"], ["threat", "chat"]]);
    expect(readStateFile("c1").notebook.Aria).toBeUndefined();
    expect(view(mock, "c1").view.chars.Aria.said.map((s: any) => s.id)).toEqual(["s1", "s2"]);
  });

  it("the per-turn limit is a setting", () => {
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, said: { perTurn: 3 } }));
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], said: [said("Aria", "one one"), said("Aria", "two two two", "vow"), said("Aria", "three three three", "order"), said("Aria", "four four four", "refusal")] })]);
    update(mock, "c1");
    expect(readStateFile("c1").said.Aria.length).toBe(3);
    const put = (n: unknown) => drive(mock, { method: "PUT", path: "/dashboard/config", body: { said: { perTurn: n } } });
    put(9);
    expect(drive(mock, { method: "GET", path: "/dashboard/config" }).json.said.perTurn).toBe(4);
    put(2);
    expect(drive(mock, { method: "GET", path: "/dashboard/config" }).json.said.perTurn).toBe(2);
  });

  it("never keeps the user's own words or someone who is not in the scene, and counts them", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], said: [said("You", "I swear it."), said("Bram", "I was never here."), said("Aria", "I stay.")] })]);
    update(mock, "c1");
    const st = readStateFile("c1");
    expect(Object.keys(st.said)).toEqual(["Aria"]);
    expect(st.keptOut).toMatchObject({ user: 1, absent: 1 });
  });

  it("a lie is stored hidden, and the view says so; the character still gets it", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], said: [said("Aria", "I never told anyone about the key.", "lie", { lie: true })] })]);
    update(mock, "c1");
    expect(readStateFile("c1").said.Aria[0]).toMatchObject({ kind: "lie", hidden: true });
    expect(view(mock, "c1").view.chars.Aria.said[0]).toMatchObject({ kind: "lie", hidden: true });
    const text = P.saidBlock(readStateFile("c1"), ["m3#0"], ["Aria"], 120);
    expect(text).toContain("a lie they told");
    expect(text).toContain("I never told anyone about the key.");
  });

  it("the insert has its own part for the speaker, outside the notebook budget, and the setting can switch it off", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], said: [said("Aria", "I will not run.", "vow")] })]);
    update(mock, "c1");
    const turn = { op: "send", speakerName: "Aria", targetId: "", userText: "hi" };
    const on = P.buildInsert(mock.host.fs, "c1", turn, P.loadConfig ? P.loadConfig(mock.host.fs) : { injection: {}, said: { inject: true } });
    expect(on.saidText).toBe("[What Aria has said, and is held to: vow “I will not run.”.]");
    expect(on.text).not.toContain("I will not run");
    expect(on.saidTokens).toBeGreaterThan(0);
    const off = P.buildInsert(mock.host.fs, "c1", turn, { injection: {}, said: { inject: false } });
    expect(off.saidText).toBe("");
  });

  it("the sensor prompt asks for it, the shape names it, and the old default is a past default", () => {
    expect(P.DEFAULT_PROMPTS.sensor).toContain("- said:");
    const past = P.PAST_DEFAULT_PROMPTS.sensor as string[];
    expect(past.at(-1)).not.toContain("- said:");
    expect(past.at(-1)).toContain("who: the character who learned it");
    expect(P.DEFAULT_PROMPTS.sensor.replace(/- said:.*\n/, "")).toBe(past.at(-1));
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"] })]);
    update(mock, "c1");
    expect(String(mock.requests[0].req.systemPrompt)).toContain('"said": [');
  });

  it("is carried into a chat that continues this one, with the source on each entry", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], said: [said("Aria", "I will not run.", "vow")] })]);
    update(mock, "c1");
    writeChat("c2", [A("n1", "Morning.")]);
    fs.writeFileSync(path.join(root, "litopys/links.json"), JSON.stringify({ v: 1, links: { c2: { from: "c1", at: 1 } } }));
    const v = view(mock, "c2");
    expect(v.view.chars.Aria.said.map((s: any) => s.text)).toEqual(["I will not run."]);
    mock.push(reply({ present: ["Aria"] }));
    writeChat("c2", [A("n1", "Morning."), U("n2", "Hi")]);
    update(mock, "c2");
    expect(readStateFile("c2").said.Aria[0]).toMatchObject({ src: "inherit", fromChat: "c1" });
  });
});
