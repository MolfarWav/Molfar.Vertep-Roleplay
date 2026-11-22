/**
 * Direction (#496, phase 1) in the engine: who is in the scene (the lock, the director's report, the Dashboard), who may answer,
 * whose card is whole, and Spotlight among those present.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const E = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as {
  handleRoute: Function;
  groupTurnPlan: Function;
  directionScene: Function;
};

const members = [{ id: "aria", name: "Aria Vale" }, { id: "bo", name: "Bo" }, { id: "cy", name: "Cy" }];
const ids = (list: { id: string }[]) => list.map((m) => m.id);

describe("turn plan with a known scene", () => {
  const group = { memberIds: ["aria", "bo", "cy"], mode: "natural" };
  const scene = (list: string[]) => ({ source: "director", present: new Set(list) });
  it("only members in the scene are picked", () => {
    for (let i = 0; i < 20; i++) expect(ids(E.groupTurnPlan(group, members, null, "hello", Math.random, undefined, scene(["bo"])))).toEqual(["bo"]);
  });
  it("naming someone calls them in, present or not", () => {
    expect(ids(E.groupTurnPlan(group, members, null, "Cy, come here", Math.random, undefined, scene(["bo"])))).toEqual(["cy"]);
  });
  it("in order: only those present, in the group's order", () => {
    expect(ids(E.groupTurnPlan({ ...group, mode: "list" }, members, null, "", Math.random, undefined, scene(["cy", "aria"])))).toEqual(["aria", "cy"]);
  });
  it("nobody of the group present, or no scene: as before", () => {
    expect(E.groupTurnPlan(group, members, null, "", null, undefined, scene([]))).toHaveLength(1);
    expect(ids(E.groupTurnPlan({ ...group, mode: "list" }, members, null, "", null, undefined, null))).toEqual(["aria", "bo", "cy"]);
  });
  it("the one who just spoke still waits, unless they are the only one here", () => {
    expect(ids(E.groupTurnPlan(group, members, "bo", "", Math.random, undefined, scene(["bo"])))).toEqual(["bo"]);
    for (let i = 0; i < 10; i++) expect(ids(E.groupTurnPlan(group, members, "bo", "", Math.random, undefined, scene(["bo", "cy"])))).toEqual(["cy"]);
  });
});

describe("the scene the engine reads", () => {
  let root: string;
  const files: Record<string, string> = {};
  const fsx = { read: (p: string) => { if (!(p in files)) throw new Error("ENOENT"); return files[p]!; } };
  const meta = { id: "c1", groupId: "g" };
  const msgs = [{ id: "u1", role: "user" }, { id: "r1", role: "char", swipe: 0 }];
  beforeEach(() => { for (const k of Object.keys(files)) delete files[k]; root = ""; void root; });
  it("nothing without a Direction state, or with the switch off and no lock", () => {
    expect(E.directionScene(fsx, meta, members, msgs)).toBeNull();
    files["direction/state/c1.json"] = JSON.stringify({ on: false, reports: [{ key: "r1#0", present: ["aria"] }] });
    expect(E.directionScene(fsx, meta, members, msgs)).toBeNull();
  });
  it("the lock wins even with the switch off", () => {
    files["direction/state/c1.json"] = JSON.stringify({ on: false, lock: { ids: ["cy", "ghost"] } });
    expect([...E.directionScene(fsx, meta, members, msgs).present]).toEqual(["cy"]);
  });
  it("the director's report on the line, else the Dashboard", () => {
    files["direction/state/c1.json"] = JSON.stringify({ on: true, reports: [{ key: "r1#0", present: ["bo"] }] });
    expect(E.directionScene(fsx, meta, members, msgs)).toMatchObject({ source: "director" });
    expect([...E.directionScene(fsx, meta, members, msgs).present]).toEqual(["bo"]);
    files["direction/state/c1.json"] = JSON.stringify({ on: true, reports: [{ key: "r1#1", present: ["bo"] }] });
    files["dashboard/state/c1.json"] = JSON.stringify({ snapshots: { a: { turn: 1, present: ["Aria"] }, b: { turn: 2, present: ["aria vale", "Cy"] } } });
    const s = E.directionScene(fsx, meta, members, msgs);
    expect(s.source).toBe("dashboard");
    expect([...s.present].sort()).toEqual(["aria", "cy"]);
  });
  it("members let back count as present until the first reply after the release", () => {
    files["direction/state/c1.json"] = JSON.stringify({ on: true, reports: [{ key: "r1#0", present: ["bo"] }], returning: { ids: ["aria"], after: "r1#0" } });
    expect([...E.directionScene(fsx, meta, members, [...msgs, { id: "u2", role: "user" }]).present].sort()).toEqual(["aria", "bo"]);
    const later = [...msgs, { id: "u2", role: "user" }, { id: "r2", role: "char", swipe: 0 }];
    files["direction/state/c1.json"] = JSON.stringify({ on: true, reports: [{ key: "r2#0", present: ["bo"] }], returning: { ids: ["aria"], after: "r1#0" } });
    expect([...E.directionScene(fsx, meta, members, later).present]).toEqual(["bo"]);
  });
});

describe("the prompt of a narrator group", () => {
  let root = "";
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dircast-"));
    for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({
      id: "default", name: "Default", temperature: 0.8, openai_max_tokens: 512, openai_max_context: 8192,
      prompts: [
        { identifier: "charDescription", name: "Char", marker: true, role: "system" },
        { identifier: "scenario", name: "Scenario", marker: true, role: "system" },
        { identifier: "chatHistory", name: "History", marker: true },
      ],
      prompt_order: [{ character_id: 100000, order: [
        { identifier: "charDescription", enabled: true },
        { identifier: "scenario", enabled: true },
        { identifier: "chatHistory", enabled: true },
      ] }],
    }));
    for (const m of members) {
      fs.mkdirSync(path.join(root, "characters", m.id), { recursive: true });
      fs.writeFileSync(path.join(root, "characters", m.id, "card.json"), JSON.stringify({ spec: "chara_card_v2", name: m.name, description: `${m.name} has a long story.`, first_mes: "Hi." }));
    }
    fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
    fs.writeFileSync(path.join(root, "groups", "trio.json"), JSON.stringify({ id: "trio", name: "Trio", memberIds: ["aria", "bo", "cy"], mode: "natural", mutedIds: [], generationMode: "narrator", spotlight: true }));
  });
  afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });
  const host = {
    fs: {
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
    log: () => {},
  };
  const call = (method: string, p: string, body?: unknown) => (E.handleRoute({ method, path: p, query: {}, body }, host) as { json?: Record<string, any> })?.json ?? {};
  const history = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, role: "char", charId: "trio", name: "Trio", text: "Aria Vale argues again.", swipe: 0 }));
  const peek = (state?: Record<string, unknown>) => {
    const id = call("POST", "/chats", { groupId: "trio" }).meta.id as string;
    fs.appendFileSync(path.join(root, "chats", `${id}.jsonl`), history.map((m) => JSON.stringify(m) + "\n").join("") + JSON.stringify({ id: "u1", role: "user", name: "You", text: "go" }) + "\n");
    if (state) host.fs.write(`direction/state/${id}.json`, JSON.stringify(state));
    return JSON.stringify(call("POST", "/prompt/preview", { chatId: id }));
  };
  it("no Direction: every card whole, as before", () => {
    const all = peek();
    expect(all).toContain("Bo has a long story.");
    expect(all).toContain("Cy has a long story.");
    expect(all).not.toContain("not in this scene");
  });
  it("the director's scene: absent members are one line, named in the scene text, and Spotlight leaves them alone", () => {
    const all = peek({ on: true, reports: [{ key: "r5#0", present: ["aria"] }] });
    expect(all).toContain("Aria Vale has a long story.");
    expect(all).not.toContain("Bo has a long story.");
    expect(all).toContain("Bo is not in this scene now.");
    expect(all).toContain("Characters: Aria Vale. Not in this scene now: Bo, Cy.");
    expect(all).not.toContain("has been quiet");
  });
  it("the lock holds the scene to its members", () => {
    const all = peek({ on: false, lock: { ids: ["bo"] } });
    expect(all).toContain("Bo has a long story.");
    expect(all).toContain("Aria Vale is not in this scene now.");
    expect(all).toContain("Cy is not in this scene now.");
  });
});
