/**
 * What #156 left (Molfar.Vertep#283): the direct tail by tokens, the recollections row that lagged a reply, the reserve of a chat
 * with no card, a chapter inserted for messages the prompt still carries (fit mode), and macros in helper input.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, useRoot, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();
const E = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as {
  hookInsertBreakdown: (fsx: any, chatId: string, meta?: any, windowTokens?: number) => Array<{ id: string; tokens: number }>;
};
const rows = (meta: Record<string, unknown> = {}, chatId = "c1") => Object.fromEntries(E.hookInsertBreakdown(mockHost().host.fs, chatId, { id: chatId, ...meta }, undefined).map((x) => [x.id, x.tokens]));

const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
const C = (id: string, text: string): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });
const long = (n: number) => "word ".repeat(n).trim();

describe("the direct tail by tokens", () => {
  const line = L.activeLine([U("m1", long(400)), C("m2", long(400)), U("m3", "ok"), C("m4", "yes"), U("m5", "go"), C("m6", "done")]);
  it("counts messages when recentTokens is 0", () => {
    expect(L.recentCount(line, { recentMessages: 6, recentTokens: 0 })).toBe(6);
  });
  it("keeps the newest messages that fit the tokens, at least 2, so short turns stay and a long one does not weigh the same", () => {
    expect(L.recentCount(line, { recentMessages: 6, recentTokens: 500 })).toBe(4);
    expect(L.recentCount(line, { recentMessages: 6, recentTokens: 8 })).toBe(2);
    expect(L.recentCount(line, { recentMessages: 6, recentTokens: 100000 })).toBe(6);
  });
  it("moves the cut: the same chapters leave more messages in the prompt when the tail is by size", () => {
    const st = L.emptyChat("c1");
    st.chapters.push({ id: "k1", label: "A", text: "x", from: "m1", to: "m6", count: 6, kind: "scene" });
    expect(L.cutCount(st, line, { recentMessages: 2, recentTokens: 0 })).toBe(4);
    expect(L.cutCount(st, line, { recentMessages: 2, recentTokens: 100000 })).toBe(0);
  });
  it("the config keeps a number in range and 0 as off; the engine plugin keeps the same rule", async () => {
    const fsx = mockHost().host.fs;
    expect(L.patchConfig(fsx, { recentTokens: 12000 }).recentTokens).toBe(12000);
    expect(L.patchConfig(fsx, { recentTokens: 10 }).recentTokens).toBe(500);
    expect(L.patchConfig(fsx, { recentTokens: 0 }).recentTokens).toBe(0);
    const fs = await import("node:fs");
    const src = (f: string) => fs.readFileSync(new URL(`../plugins/${f}/plugin.js`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const tailLoop = (s: string) => s.slice(s.indexOf("let used = 0;"), s.indexOf("return Math.max(2, n);")).replace(/\s+/g, " ");
    // the loop in both plugins differs only by the token function's name and the budget variable
    expect(tailLoop(src("engine")).replace("c.recentTokens", "budget").replace("estimateTokens(line[i] && line[i].text)", "X")).toBe(tailLoop(src("litopys")).replace("estimateTokens(str(line[i] && line[i].text))", "X"));
  });
});

describe("reserve rows that lagged or were missing", () => {
  it("a chat whose record holds a recollection reserves its room before the first reply that carries one", () => {
    writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "x" });
    expect(rows({ characterId: "aria" })["litopys recollections"]).toBeUndefined();
    writeJson("litopys/chats/c1.json", { v: 1, chapters: [{ id: "k1", views: [{ who: "Aria", text: "I remember." }] }] });
    expect(rows({ characterId: "aria" })["litopys recollections"]).toBe(300);
    // the Litopys plugin answers the same
    const ask = (meta: any) => {
      writeJson("chats/c1.meta.json", { id: "c1", ...meta });
      return Object.fromEntries(L.insertCeiling({ chatId: "c1", plugin: "engine" }, mockHost().host).ceilings.map((r: any) => [r.id, r.tokens]));
    };
    expect(ask({ characterId: "aria" })["litopys recollections"]).toBe(300);
  });
  it("a chat with no card reserves 'who knows what', in the engine and in Litopys alike", () => {
    writeJson("chats/c1.meta.json", { id: "c1" });
    expect(rows({})["litopys who knows what"]).toBe(250);
    const ceil = Object.fromEntries(L.insertCeiling({ chatId: "c1", plugin: "engine" }, mockHost().host).ceilings.map((r: any) => [r.id, r.tokens]));
    expect(ceil["litopys who knows what"]).toBe(250);
    writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "x" });
    expect(rows({ characterId: "aria" })["litopys who knows what"]).toBeUndefined();
  });
});

describe("a chapter for messages the prompt still carries", () => {
  const msgs = Array.from({ length: 20 }, (_, i) => (i % 2 ? C("m" + (i + 1), "Aria message " + (i + 1)) : U("m" + (i + 1), "Jude message " + (i + 1))));
  const line = L.activeLine(msgs);
  const build = (promptCut: number | null) => {
    const st = L.emptyChat("c1");
    st.migrated = true;
    st.chapters.push({ id: "k1", label: "Old scene", text: "UNIQUECHAPTER the gate was opened at dawn.", from: "m1", to: "m8", count: 8, kind: "scene" });
    st.counters.chapter = 1;
    return L.buildInsert({ st, line, dash: { snapshots: {} }, meta: { userName: "Jude" }, cfg: { ...L.DEFAULT_CONFIG, recentMessages: 6, budget: 800 }, scanText: "", speakerName: "", used: {}, promptCut, voices: null, canon: undefined });
  };
  const all = (ins: any) => (ins ? [ins.head, ins.tail].filter(Boolean).join("\n") : "");
  it("the chapter rides when the prompt dropped its messages", () => {
    expect(all(build(8))).toContain("UNIQUECHAPTER");
    expect(all(build(null))).toContain("UNIQUECHAPTER");
  });
  it("the chapter stays out when the engine kept those messages in the prompt (fit mode, the window had room)", () => {
    expect(all(build(0))).not.toContain("UNIQUECHAPTER");
    expect(all(build(3))).not.toContain("UNIQUECHAPTER");
  });
});

describe("a fact with no knownBy", () => {
  const msgs = Array.from({ length: 6 }, (_, i) => (i % 2 ? C("m" + (i + 1), "Aria message " + (i + 1)) : U("m" + (i + 1), "Jude message " + (i + 1))));
  const line = L.activeLine(msgs);
  const build = (voices: Set<string> | null, present: string[]) => {
    const st = L.emptyChat("c1");
    st.migrated = true;
    st.facts = [
      { id: "f1", text: "The old well is dry.", subject: "world", type: "event", weight: "everyday", status: "active", at: 1, updatedAt: 1 },
      { id: "f2", text: "The cellar holds a secret.", subject: "world", knownBy: ["Bram"], type: "event", weight: "everyday", status: "active", at: 1, updatedAt: 1 },
    ];
    st.counters.fact = 2;
    const snaps: Record<string, any> = {};
    for (const m of line) if (m.role === "char") snaps[m.id + "#0"] = { present };
    const ins = L.buildInsert({ st, line, dash: { snapshots: snaps }, meta: { userName: "Jude" }, cfg: { ...L.DEFAULT_CONFIG, budget: 800 }, scanText: "", speakerName: "Aria", used: {}, promptCut: null, voices, canon: undefined });
    return ins ? [ins.head, ins.tail].filter(Boolean).join("\n") : "";
  };
  it("is known to the people in the scene: the speaker who is there gets it, one who is not does not", () => {
    expect(build(new Set(["aria"]), ["Aria", "Jude"])).toContain("The old well is dry.");
    expect(build(new Set(["cy"]), ["Aria", "Jude"])).not.toContain("The old well is dry.");
  });
  it("a narrator reply gets it, and a fact told to someone else still stays out of the others' replies", () => {
    expect(build(null, ["Aria", "Jude"])).toContain("The old well is dry.");
    expect(build(new Set(["aria"]), ["Aria", "Jude"])).not.toContain("secret");
  });
});
