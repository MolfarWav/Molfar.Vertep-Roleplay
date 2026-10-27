// The Litopys cut follows the model's window (4.72.0): the shipped default of recent messages, and the
// insert carrying a chapter for every message the prompt left out, however far the window forced it.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { L, line, mockHost, story, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

describe("recent messages default", () => {
  // the memory kit pins the loaded module to the old 20, so the shipped value is read from the source
  it("is 100 as shipped", () => {
    const src = readFileSync(new URL("../plugins/litopys/plugin.js", import.meta.url), "utf8");
    expect(src).toMatch(/DEFAULT_CONFIG = \{[^}]*?recentMessages: 100,/s);
  });
});

describe("the insert follows where the prompt's history starts", () => {
  function seed() {
    const msgs = story(60);
    writeChat("w1", msgs);
    const ln = line(msgs);
    writeJson("litopys/chats/w1.json", {
      chatId: "w1",
      migrated: true,
      chapters: [
        { id: "c1", from: ln[0].id, to: ln[9].id, count: 10, kind: "scene", text: "The mill was rebuilt by Aria.", label: "Mill", at: 1 },
        { id: "c2", from: ln[10].id, to: ln[29].id, count: 20, kind: "scene", text: "A stranger came to the mill.", label: "Stranger", at: 2 },
      ],
      facts: [],
      proposals: [],
      counters: { chapter: 2, fact: 0, proposal: 0 },
    });
    return ln;
  }
  const insert = (ln: any[], extra: Record<string, unknown> = {}) =>
    L.buildInsert({ st: L.loadChatFile(mockHost().host.fs, "w1"), line: ln, dash: null, meta: { userName: "You" }, cfg: { ...L.loadConfig(mockHost().host.fs), budget: 4000, recentMessages: 40 }, scanText: "mill", speakerName: "Aria", ...extra });

  it("with the recent window alone, a chapter inside the last 40 messages stays out", () => {
    const ln = seed();
    const ins = insert(ln);
    expect(ins.text).toContain("The mill was rebuilt");
    expect(ins.text).not.toContain("A stranger came");
  });

  it("when the window dropped more, the chapter for those messages is carried", () => {
    const ln = seed();
    const ins = insert(ln, { promptCut: 30 });
    expect(ins.text).toContain("The mill was rebuilt");
    expect(ins.text).toContain("A stranger came");
  });

  it("a prompt cut that is nonsense is ignored", () => {
    const ln = seed();
    const a = insert(ln);
    expect(insert(ln, { promptCut: -5 }).text).toBe(a.text);
    expect(insert(ln, { promptCut: "x" }).text).toBe(a.text);
  });
});

describe("cutMode scenes in the plugin", () => {
  function seedScenes() {
    const msgs = story(40);
    writeChat("s1", msgs);
    const ln = line(msgs);
    writeJson("litopys/chats/s1.json", {
      chatId: "s1",
      migrated: true,
      chapters: [
        { id: "c1", from: ln[0].id, to: ln[11].id, count: 12, kind: "scene", text: "The first scene: the mill.", label: "Mill", at: 1 },
        { id: "c2", from: ln[12].id, to: ln[25].id, count: 14, kind: "scene", text: "The second scene: the stranger.", label: "Stranger", at: 2 },
      ],
      facts: [],
      proposals: [],
      counters: { chapter: 2, fact: 0, proposal: 0 },
    });
    return ln;
  }
  const cfgOf = (extra: Record<string, unknown>) => ({ ...L.loadConfig(mockHost().host.fs), ...extra });

  it("the default is the window-driven mode with 2 direct messages", () => {
    const c = L.loadConfig(mockHost().host.fs);
    expect(c.cutMode).toBe("fit");
    expect(c.sceneKeep).toBe(2);
  });

  it("cuts at the end of the last whole scene that leaves the direct messages after it", () => {
    const ln = seedScenes();
    const st = L.loadChatFile(mockHost().host.fs, "s1");
    expect(L.cutCount(st, ln, cfgOf({ cutMode: "scenes", sceneKeep: 2 }))).toBe(26);
    // 40 messages, keeping 15: the second scene would leave only 14, so only the first goes
    expect(L.cutCount(st, ln, cfgOf({ cutMode: "scenes", sceneKeep: 15 }))).toBe(12);
    // keeping 29 leaves no whole scene
    expect(L.cutCount(st, ln, cfgOf({ cutMode: "scenes", sceneKeep: 29 }))).toBe(0);
  });

  it("the insert carries exactly the scenes the engine cut, not those still in the prompt", () => {
    const ln = seedScenes();
    const st = L.loadChatFile(mockHost().host.fs, "s1");
    const cfg = { ...cfgOf({ cutMode: "scenes", sceneKeep: 2 }), budget: 4000 };
    const base = { st, line: ln, dash: null, meta: { userName: "You" }, cfg, scanText: "mill", speakerName: "Aria" };
    const cutFirst = L.buildInsert({ ...base, promptCut: 12 });
    expect(cutFirst.text).toContain("The first scene");
    expect(cutFirst.text).not.toContain("The second scene");
    const both = L.buildInsert({ ...base, promptCut: 26 });
    expect(both.text).toContain("The second scene");
  });

  it("settings: the mode and the direct messages are saved, clamped, an unknown mode is the default", () => {
    const m = mockHost();
    const put = (body: any) => L.handleRoute({ method: "PUT", path: "/litopys/config", query: {}, body }, m.host);
    expect(put({ cutMode: "scenes", sceneKeep: 5 }).json).toMatchObject({ cutMode: "scenes", sceneKeep: 5 });
    expect(put({ sceneKeep: 1 }).json.sceneKeep).toBe(2);
    expect(put({ sceneKeep: 999999999 }).json.sceneKeep).toBe(100000);
    expect(put({ cutMode: "nonsense" }).json.cutMode).toBe("fit");
  });
});
