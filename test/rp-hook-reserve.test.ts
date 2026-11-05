/**
 * The history budget reserves room for what the sibling plugins add to the request after assembly (MEMORY-INJECTION 13.1,
 * #184): not only the Dashboard, the Litopys insert and the backstory link, but the card, persona and world memory, the
 * habits, the recollections, "who knows what" and the hidden plan, the Dashboard's said block, the World notes and the
 * agents' inserts. Each block is a ceiling read from the plugin's own config for THIS chat; a block the chat cannot have
 * counts 0. The sum is what `hookInsertReserve` takes off the window; `hookInsertBreakdown` names the rows.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, useRoot, writeJson } from "./rp-memory-m2-kit";

useRoot();

const E = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as {
  hookInsertBreakdown: (fsx: any, chatId: string, meta?: any, windowTokens?: number) => Array<{ id: string; tokens: number }>;
};
const rows = (meta: Record<string, unknown> = {}, chatId = "c1", windowTokens?: number) => E.hookInsertBreakdown(mockHost().host.fs, chatId, { id: chatId, ...meta }, windowTokens);
const byId = (r: Array<{ id: string; tokens: number }>): Record<string, number> => Object.fromEntries(r.map((x) => [x.id, x.tokens]));
const sum = (r: Array<{ tokens: number }>) => r.reduce((t, x) => t + x.tokens, 0);

const memory = (extra: Record<string, unknown> = {}) => ({ v: 1, sources: [{ id: "s1", on: true, arc: "x" }], habits: [{ id: "k1", name: "n", rule: "r" }], ...extra });
const seedCards = () => {
  writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "x" });
  writeJson("characters/bram/card.json", { spec: "chara_card_v2", name: "Bram", description: "x" });
  writeJson("groups/g1.json", { id: "g1", name: "G", memberIds: ["aria", "bram"] });
};

describe("hook reserve: the blocks that were counted before", () => {
  it("defaults: the dashboard (max*2+200) and its said block, the Litopys insert (budget+100)", () => {
    expect(byId(rows())).toEqual({ dashboard: 800, "dashboard said": 120, "dashboard journal": 360, litopys: 900 });
    writeJson("dashboard/config.json", { injection: { enabled: true, maxTokens: 1000 }, said: { inject: false } });
    writeJson("litopys/config.json", { budget: 2000 });
    expect(byId(rows())).toEqual({ dashboard: 2200, "dashboard journal": 360, litopys: 2100 });
    writeJson("dashboard/config.json", { injection: { enabled: false } });
    writeJson("litopys/config.json", { insert: false });
    expect(rows()).toEqual([]);
  });
  it("a Litopys budget above the old cap of 4000 counts, and auto is a share of the window", () => {
    writeJson("litopys/config.json", { budget: 12000 });
    expect(byId(rows()).litopys).toBe(12100);
    writeJson("litopys/config.json", { budgetMode: "auto", budget: 800 });
    expect(byId(rows({}, "c1", 32000)).litopys).toBe(4800 + 100);
    expect(byId(rows({}, "c1", 2000)).litopys).toBe(800 + 100);
  });
  it("the backstory link of a continued chat", () => {
    writeJson("litopys/links.json", { links: { c1: { from: "c0" } } });
    expect(byId(rows())["litopys backstory"]).toBe(900);
  });
  it("unreadable configs count as the defaults", () => {
    const fsx = mockHost().host.fs;
    fsx.write("dashboard/config.json", "{not json");
    fsx.write("litopys/config.json", "{not json");
    expect(byId(E.hookInsertBreakdown(fsx, "c1", { id: "c1" }))).toEqual({ dashboard: 800, "dashboard said": 120, "dashboard journal": 360, litopys: 900 });
  });
});

describe("hook reserve: the Dashboard journal", () => {
  it("one row right after the said block: the default 120 tokens times the 3 focus characters", () => {
    writeJson("dashboard/config.json", { injection: { enabled: true, maxTokens: 300 } });
    const r = rows();
    expect(byId(r)["dashboard journal"]).toBe(120 * 3);
    expect(r.map((x) => x.id).indexOf("dashboard journal")).toBe(r.map((x) => x.id).indexOf("dashboard said") + 1);
  });
  it("follows a changed journal.maxTokens, clamped to 40..400", () => {
    writeJson("dashboard/config.json", { journal: { maxTokens: 200 } });
    expect(byId(rows())["dashboard journal"]).toBe(200 * 3);
    writeJson("dashboard/config.json", { journal: { maxTokens: 10 } });
    expect(byId(rows())["dashboard journal"]).toBe(40 * 3);
    writeJson("dashboard/config.json", { journal: { maxTokens: 9000 } });
    expect(byId(rows())["dashboard journal"]).toBe(400 * 3);
    writeJson("dashboard/config.json", { journal: { on: true, inject: true } });
    expect(byId(rows())["dashboard journal"]).toBe(120 * 3);
  });
  it("disappears with journal.on=false", () => {
    writeJson("dashboard/config.json", { journal: { on: false, maxTokens: 200 } });
    expect(byId(rows())["dashboard journal"]).toBeUndefined();
    expect(byId(rows())["dashboard said"]).toBe(120);
  });
  it("disappears with journal.inject=false", () => {
    writeJson("dashboard/config.json", { journal: { inject: false } });
    expect(byId(rows())["dashboard journal"]).toBeUndefined();
    expect(byId(rows())["dashboard said"]).toBe(120);
  });
  it("the said row disappears when the chat switches the said part off (#248), the journal stays", () => {
    expect(byId(rows())["dashboard said"]).toBe(120);
    const r = byId(rows({ promptBoard: { off: ["plugin:said"] } }));
    expect(r["dashboard said"]).toBeUndefined();
    expect(r["dashboard journal"]).toBe(120 * 3);
  });
  it("disappears when the chat mutes plugin:journal", () => {
    expect(byId(rows({ promptBoard: { off: ["plugin:journal"] } }))["dashboard journal"]).toBeUndefined();
    expect(byId(rows({ promptBoard: { off: ["plugin:said"] } }))["dashboard journal"]).toBe(120 * 3);
  });
  it("disappears when the Dashboard insert itself is off", () => {
    writeJson("dashboard/config.json", { injection: { enabled: false } });
    expect(byId(rows())["dashboard journal"]).toBeUndefined();
    writeJson("dashboard/config.json", { injection: { enabled: true } });
    expect(byId(rows({ promptBoard: { off: ["plugin:relations"] } }))["dashboard journal"]).toBeUndefined();
  });
});

describe("hook reserve: the card's memory and habits", () => {
  it("only when the card has them: sources count for the memory, habits for the habits; the ceilings are the file's", () => {
    seedCards();
    expect(byId(rows({ characterId: "aria" }))["litopys card memory"]).toBeUndefined();
    writeJson("characters/aria/memory.json", memory());
    let r = byId(rows({ characterId: "aria" }));
    expect(r["litopys card memory"]).toBe(400);
    expect(r["litopys habits"]).toBe(250);
    writeJson("characters/aria/memory.json", memory({ inject: { enabled: true, maxTokens: 900, habitsMaxTokens: 600 } }));
    r = byId(rows({ characterId: "aria" }));
    expect(r["litopys card memory"]).toBe(900);
    expect(r["litopys habits"]).toBe(600);
    // a memory with no habits and no sources
    writeJson("characters/aria/memory.json", memory({ sources: [], habits: [] }));
    expect(byId(rows({ characterId: "aria" }))["litopys card memory"]).toBeUndefined();
    expect(byId(rows({ characterId: "aria" }))["litopys habits"]).toBeUndefined();
  });
  it("a group counts the biggest member, a switch off for the chat or in the file counts nothing", () => {
    seedCards();
    writeJson("characters/aria/memory.json", memory({ inject: { maxTokens: 300 } }));
    writeJson("characters/bram/memory.json", memory({ inject: { maxTokens: 1200 } }));
    expect(byId(rows({ groupId: "g1" }))["litopys card memory"]).toBe(1200);
    expect(byId(rows({ groupId: "g1", promptBoard: { off: ["plugin:cardmemory"] } }))["litopys card memory"]).toBeUndefined();
    expect(byId(rows({ groupId: "g1", promptBoard: { off: ["plugin:cardskills"] } }))["litopys habits"]).toBeUndefined();
    writeJson("characters/bram/memory.json", memory({ inject: { enabled: false } }));
    expect(byId(rows({ groupId: "g1" }))["litopys card memory"]).toBe(300);
  });
  it("Litopys off (the global insert switch) takes the card's memory with it, as the plugin does", () => {
    seedCards();
    writeJson("characters/aria/memory.json", memory());
    writeJson("litopys/config.json", { insert: false });
    expect(byId(rows({ characterId: "aria" }))["litopys card memory"]).toBeUndefined();
  });
});

describe("hook reserve: persona and world memory, recollections, who knows what, the plan", () => {
  it("persona and world memory only when the chat took them in and the file has stories", () => {
    writeJson("memory/personas/you.json", { sources: [{ id: "s1" }] });
    expect(byId(rows({ personaId: "you" }))["litopys persona memory"]).toBeUndefined();
    expect(byId(rows({ personaId: "you", memory: { persona: true } }))["litopys persona memory"]).toBe(300);
    writeJson("memory/personas/you.json", { sources: [{ id: "s1" }], inject: { maxTokens: 700 } });
    expect(byId(rows({ personaId: "you", memory: { persona: true } }))["litopys persona memory"]).toBe(700);
    expect(byId(rows({ personaId: "you", memory: { persona: true }, promptBoard: { off: ["plugin:personamemory"] } }))["litopys persona memory"]).toBeUndefined();
    writeJson("world/state/c1.json", { origin: { kind: "library", worldId: "w-abcd12" }, settings: { level: "off" } });
    writeJson("memory/worlds/w-abcd12.json", { sources: [{ id: "s1" }] });
    expect(byId(rows({ memory: { world: true } }))["litopys world memory"]).toBe(300);
  });
  it("recollections: a group, or a chat whose last insert had some; off in the config or the chat counts nothing", () => {
    seedCards();
    expect(byId(rows())["litopys recollections"]).toBeUndefined();
    expect(byId(rows({ groupId: "g1" }))["litopys recollections"]).toBe(300);
    writeJson("litopys/insert/c1.json", { recollections: { tokens: 120, scenes: 2, who: ["Aria"] } });
    expect(byId(rows())["litopys recollections"]).toBe(300);
    expect(byId(rows({ promptBoard: { off: ["plugin:recollections"] } }))["litopys recollections"]).toBeUndefined();
    writeJson("litopys/config.json", { recollectBudget: 700 });
    expect(byId(rows({ groupId: "g1" }))["litopys recollections"]).toBe(700);
    writeJson("litopys/config.json", { recollectBudget: 5000 });
    expect(byId(rows({ groupId: "g1" }))["litopys recollections"]).toBe(1500);
    writeJson("litopys/config.json", { recollections: false });
    expect(byId(rows({ groupId: "g1" }))["litopys recollections"]).toBeUndefined();
  });
  it("who knows what (250) and the hidden plan (130) only for a group, and the plan only when switched on", () => {
    seedCards();
    expect(byId(rows())["litopys who knows what"]).toBeUndefined();
    expect(byId(rows({ groupId: "g1" }))["litopys who knows what"]).toBe(250);
    expect(byId(rows({ groupId: "g1" }))["litopys hidden plan"]).toBeUndefined();
    writeJson("litopys/config.json", { hiddenPlan: true });
    expect(byId(rows({ groupId: "g1" }))["litopys hidden plan"]).toBe(130);
    expect(byId(rows())["litopys hidden plan"]).toBeUndefined();
    writeJson("litopys/config.json", { hiddenPlan: true, castKnowledge: false });
    expect(byId(rows({ groupId: "g1" }))["litopys who knows what"]).toBeUndefined();
    expect(byId(rows({ groupId: "g1" }))["litopys hidden plan"]).toBeUndefined();
  });
  it("the ceilings hold the real blocks: the plan note and the brief, measured with the engine's script-aware estimate", () => {
    // the engine counts ASCII at 3.5 characters a token; the note is plain English
    const note = L.hiddenPlanNote() as string;
    expect(Math.ceil(note.length / 3.5)).toBeLessThanOrEqual(130);
    const many = Array.from({ length: 40 }, (_, i) => ({ id: "f" + i, text: "Secret number " + i + " of the long night.", subject: "world", knownBy: ["Bram"], status: "active" }));
    const brief = L.castKnowledgeFor({ st: { facts: many }, line: L.activeLine([{ id: "m1", role: "char", name: "Aria", text: "x" }, { id: "m2", role: "char", name: "Bram", text: "y" }]), dash: null, meta: { userName: "Jude" }, speakerName: "" });
    expect(Math.ceil(brief.text.length / 3.5)).toBeLessThanOrEqual(250 + 40);
  });
});

describe("hook reserve: Dashboard said, World, agents", () => {
  it("the World note and the event ride when the chat has a world state; the dice only with a dice setting", () => {
    writeJson("world/state/c1.json", { settings: { level: "off", insert: true } });
    expect(byId(rows())["world here"]).toBe(258);
    expect(byId(rows())["world event"]).toBeUndefined();
    writeJson("world/state/c1.json", { settings: { level: "director", insert: true } });
    expect(byId(rows())["world here"]).toBe(258);
    expect(byId(rows())["world event"]).toBe(115);
    expect(byId(rows())["world dice"]).toBeUndefined();
    writeJson("world/state/c1.json", { settings: { level: "director", insert: true, dice: "d6" } });
    expect(byId(rows())["world dice"]).toBe(60);
    expect(byId(rows({ promptBoard: { off: ["plugin:world"] } }))["world here"]).toBeUndefined();
  });
  it("agents: exactly what the chat's agents left on disk", () => {
    const text = "The hint the agent wrote for the next reply, a sentence or two long.";
    writeJson("agents/inserts/c1.json", { items: [{ agent: "a1", label: "Hint", text }, { agent: "a2", text: "" }] });
    const a = byId(rows()).agents!;
    expect(a).toBeGreaterThan(15);
    expect(a).toBeLessThan(40);
    writeJson("agents/inserts/c1.json", { items: [] });
    expect(byId(rows()).agents).toBeUndefined();
  });
  it("the dashboard is left out when its plugin is off for the chat", () => {
    expect(byId(rows({ promptBoard: { off: ["plugin:relations"] } })).dashboard).toBeUndefined();
    expect(byId(rows({ promptBoard: { off: ["plugin:litopys"] } })).litopys).toBeUndefined();
  });
  it("a heavy chat adds up to more than the old three blocks", () => {
    seedCards();
    writeJson("characters/aria/memory.json", memory());
    writeJson("world/state/c1.json", { settings: { level: "director", insert: true, dice: "d6" } });
    writeJson("litopys/config.json", { hiddenPlan: true });
    const heavy = sum(rows({ groupId: "g1", characterId: "aria" }));
    const old = 800 + 900;
    expect(heavy).toBeGreaterThan(old + 1000);
  });
});
