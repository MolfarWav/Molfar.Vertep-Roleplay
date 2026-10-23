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
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, said: { perTurn: 2 } }));
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
    expect(past.at(-3)).not.toContain("- said:");
    expect(past.at(-3)).toContain("who: the character who learned it");
    expect(past.at(-1)!.replace(/- said:.*\n/, "")).toBe(past.at(-3));
    // the first wording of the rule is a past default too: it did not name what is not said
    expect(past.at(-2)).toContain("- said: the strong statements");
    expect(P.DEFAULT_PROMPTS.sensor).toContain("NOT said, never report");
    expect(P.DEFAULT_PROMPTS.sensor).toContain("strength: 1 to 3");
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

describe("the user's edits of what was said (#98)", () => {
  const notes = (m: ReturnType<typeof mockHost>, body: Record<string, unknown>) => drive(m, { method: "POST", path: "/dashboard/notes", body: { chatId: "c1", ...body } });
  it("edit, remove and bring back go through the notes route and reach the view and the prompt part", () => {
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, said: { perTurn: 2 } }));
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], said: [said("Aria", "I will not run.", "vow"), said("Aria", "Touch it and I end you.", "threat")] })]);
    update(mock, "c1");
    const edit = notes(mock, { op: "edit", id: "s1", text: "I will never run." });
    expect(edit.json.ok).toBe(true);
    const chars = () => view(mock, "c1").view.chars.Aria;
    expect(chars().said[0]).toMatchObject({ id: "s1", text: "I will never run.", edited: true });
    expect(P.saidBlock(readStateFile("c1"), ["m3#0"], ["Aria"], 120, { edits: { s1: { text: "I will never run." } } })).toContain("I will never run.");
    expect(notes(mock, { op: "retire", id: "s2" }).json.ok).toBe(true);
    expect(chars().said.map((s: any) => s.id)).toEqual(["s1"]);
    expect(chars().saidRemoved.map((s: any) => s.id)).toEqual(["s2"]);
    expect(notes(mock, { op: "restore", id: "s2" }).json.ok).toBe(true);
    expect(chars().said.map((s: any) => s.id)).toEqual(["s1", "s2"]);
    expect(notes(mock, { op: "retire", id: "s99" }).status).toBe(404);
  });
});

describe("the Prompt board switch for the said part (#98)", () => {
  it("leaves the said part out of the request when the chat switched it off, and keeps the Dashboard's own part", () => {
    writeChat("c1", three(), { promptBoard: { v: 1, off: ["plugin:said"] } });
    const mock = mockHost([reply({ present: ["Aria"], said: [said("Aria", "I will not run.", "vow")] })]);
    update(mock, "c1");
    const request = { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }] };
    const turn = { op: "send", speakerName: "Aria" };
    const off = P.llmRequest({ key: "reply", request, turn }, mock.host);
    const textOff = JSON.stringify(off.messages);
    expect(textOff).not.toContain("has said, and is held to");
    expect(off.promptSources.parts.some((p: any) => p.label === "Dashboard · said")).toBe(false);
    writeChat("c1", three(), { promptBoard: { v: 1, off: [] } });
    const on = P.llmRequest({ key: "reply", request, turn }, mock.host);
    expect(JSON.stringify(on.messages)).toContain("has said, and is held to");
    expect(on.promptSources.parts.some((p: any) => p.label === "Dashboard · said")).toBe(true);
  });
});

describe("said stays rare (#98, owner's check 2026-10-22)", () => {
  it("one a turn by default; the strongest wins; a weak one is never kept; no strength counts as kept", () => {
    writeChat("c1", three());
    const mock = mockHost([
      reply({
        present: ["Aria"],
        said: [said("Aria", "I am Aria, keeper of this glade.", "confession", { strength: 1 }), said("Aria", "I will not run from this gate.", "vow", { strength: 2 }), said("Aria", "Touch the gate and I will end you.", "threat", { strength: 3 })],
      }),
    ]);
    update(mock, "c1");
    expect(readStateFile("c1").said.Aria.map((s: any) => s.text)).toEqual(["Touch the gate and I will end you."]);
    writeChat("c2", three());
    const older = mockHost([reply({ present: ["Aria"], said: [said("Aria", "I will not run from this gate.", "vow")] })]);
    update(older, "c2");
    expect(readStateFile("c2").said.Aria).toHaveLength(1);
  });

  it("a line the notebook already holds is not said again", () => {
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], learned: [{ who: "Aria", text: "Aria keeps a brass key on a cord around her neck.", how: "saw" }], said: [said("Aria", "Aria keeps a brass key on a cord around her neck.", "secret", { strength: 3 })] })]);
    update(mock, "c1");
    expect(readStateFile("c1").said).toEqual({});
  });

  it("the same kind from the same speaker within three turns is one moment; a character holds about eight", () => {
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false, said: { perTurn: 4 } }));
    writeChat("c1", three());
    const mock = mockHost([reply({ present: ["Aria"], said: [said("Aria", "I promise to guard the gate tonight.", "promise", { strength: 2 }), said("Aria", "I promise to bring the key back by dawn.", "promise", { strength: 2 }), said("Aria", "Another vow entirely about the river.", "vow", { strength: 2 })] })]);
    update(mock, "c1");
    // two promises in one report: the cooldown only looks at earlier turns, so both are the same turn; the cap and the
    // cooldown are checked against what was stored before this report
    expect(readStateFile("c1").said.Aria.length).toBeGreaterThanOrEqual(2);
    const seeded = readStateFile("c1");
    seeded.said.Aria = Array.from({ length: 8 }, (_, i) => ({ id: "s" + (i + 20), text: "Old oath number " + i + " about " + "abcdefgh"[i].repeat(5), kind: ["vow", "threat", "order", "refusal", "secret", "confession", "lie", "other"][i], turn: 0, src: seeded.said.Aria[0].src, source: "chat" }));
    fs.writeFileSync(path.join(root, "dashboard/state/c1.json"), JSON.stringify(seeded));
    writeChat("c1", [...three(), U("m4", "And then?"), A("m5", "Fine.")]);
    const again = mockHost([reply({ present: ["Aria"], said: [said("Aria", "Brand new threat about the harbour.", "threat", { strength: 2 })] })]);
    update(again, "c1");
    expect(readStateFile("c1").said.Aria).toHaveLength(8);
  });
});
