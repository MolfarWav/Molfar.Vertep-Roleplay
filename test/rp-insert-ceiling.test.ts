/**
 * Each memory plugin answers its own insert ceiling (Molfar.Vertep#220, the Roleplay half of #217): Dashboard (relations), Litopys,
 * World and agents export `insertCeiling({ chatId, windowTokens })` and the engine plugin reserves room from their answers, keeping its
 * own table as the fallback for an older engine, a call that did not say the window, or a plugin that did not answer.
 *
 * What is checked: (1) a plugin's answer is the table's row for the same chat, scenario by scenario (the two stay in step), except the
 * one place the plugin is more exact (a group's Dashboard); (2) how the engine plugin takes the answers; (3) the manifests allow the hook.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { mockHost, writeJson } from "./rp-memory-m2-kit";
import { useRoot } from "./rp-memory-m2-kit";
import { ceilingQuery } from "../src/lib/ceiling-query";

useRoot();

type Row = { id: string; tokens: number };
type Answer = { plugin: string; id: string; tokens: number };
const load = (p: string) => import(new URL(`../plugins/${p}/plugin.js`, import.meta.url).href) as Promise<Record<string, any>>;
const E = (await load("engine")) as {
  hookInsertBreakdown: (fsx: any, chatId: string, meta?: any, windowTokens?: number, ceilings?: { window: number; rows: Answer[] } | null) => Row[];
  ceilingsOf: (host: any, req: any) => { window: number; rows: Answer[] } | null;
};
const PLUGINS = ["litopys", "relations", "world", "agents"] as const;
const mods = Object.fromEntries(await Promise.all(PLUGINS.map(async (p) => [p, await load(p)]))) as Record<(typeof PLUGINS)[number], Record<string, any>>;

/** What the engine's dispatch would collect: every plugin's answer, sanitised the way the engine does (`sanitizeInsertCeilings`). */
function askAll(chatId: string, windowTokens?: number): Answer[] {
  const out: Answer[] = [];
  for (const p of PLUGINS) {
    const res = mods[p].insertCeiling({ chatId, plugin: "engine", ...(windowTokens ? { windowTokens } : {}) }, mockHost().host);
    for (const r of (res?.ceilings ?? []) as Row[]) {
      if (typeof r.tokens !== "number" || !Number.isFinite(r.tokens) || r.tokens < 0) continue;
      expect(r.id).toMatch(/^[\w:. -]{1,64}$/); // the engine drops any other id
      out.push({ plugin: p, id: r.id, tokens: Math.ceil(r.tokens) });
    }
  }
  return out;
}
const table = (meta: Record<string, unknown>, chatId = "c1", windowTokens?: number) => E.hookInsertBreakdown(mockHost().host.fs, chatId, { id: chatId, ...meta }, windowTokens);
const byId = (r: Array<{ id: string; tokens: number }>): Record<string, number> => Object.fromEntries(r.filter((x) => x.tokens > 0).map((x) => [x.id, x.tokens]));
/** The chat's meta is on disk for the plugins, and the same object goes to the table. */
const chat = (meta: Record<string, unknown> = {}, chatId = "c1") => {
  writeJson(`chats/${chatId}.meta.json`, { id: chatId, ...meta });
  return meta;
};

const memory = (extra: Record<string, unknown> = {}) => ({ v: 1, sources: [{ id: "s1", on: true, arc: "x" }], habits: [{ id: "k1", name: "n", rule: "r" }], ...extra });
const seedCards = () => {
  writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "x" });
  writeJson("characters/bram/card.json", { spec: "chara_card_v2", name: "Bram", description: "x" });
  writeJson("groups/g1.json", { id: "g1", name: "G", memberIds: ["aria", "bram"] });
};

/** The plugins' answers and the table agree on this chat (the answers are the table's rows, row by row). */
function agree(meta: Record<string, unknown>, windowTokens?: number, except: string[] = []) {
  chat(meta);
  const a = byId(askAll("c1", windowTokens));
  const t = byId(table(meta, "c1", windowTokens));
  for (const id of except) {
    delete a[id];
    delete t[id];
  }
  expect(a).toEqual(t);
}

describe("each plugin's ceiling is the table's row for the same chat", () => {
  it("defaults: the Dashboard rows, the Litopys insert, nothing else", () => {
    agree({});
    // a chat with no card has no sole voice, so the "who knows what" brief is reserved too (#283)
    expect(byId(askAll("c1"))).toEqual({ dashboard: 800, "dashboard said": 120, "dashboard journal": 360, litopys: 900, "litopys who knows what": 250 });
  });
  it("the Dashboard config: size, said, journal, switched off", () => {
    writeJson("dashboard/config.json", { injection: { enabled: true, maxTokens: 1000 }, said: { inject: false }, journal: { maxTokens: 200 } });
    agree({});
    writeJson("dashboard/config.json", { journal: { on: false } });
    agree({});
    writeJson("dashboard/config.json", { injection: { enabled: false } });
    agree({});
    expect(byId(askAll("c1")).dashboard).toBeUndefined();
    writeJson("dashboard/config.json", {});
    agree({ promptBoard: { off: ["plugin:relations"] } });
    agree({ promptBoard: { off: ["plugin:said", "plugin:journal"] } });
  });
  it("Litopys: a fixed size, auto from the window, the link and the passages of a continued chat", () => {
    writeJson("litopys/config.json", { budget: 2000 });
    agree({}, 32000);
    writeJson("litopys/config.json", {});
    agree({}, 32000);
    expect(byId(askAll("c1", 32000)).litopys).toBe(4800 + 100);
    expect(byId(askAll("c1")).litopys).toBe(800 + 100); // no window said: the fixed size
    writeJson("litopys/links.json", { links: { c1: { from: "c0" } } });
    agree({}, 32000);
    expect(byId(askAll("c1", 32000))["litopys backstory"]).toBe(900);
    expect(byId(askAll("c1", 32000))["litopys verbatim"]).toBe(400);
    writeJson("litopys/config.json", { insert: false });
    agree({}, 32000);
  });
  it("card memory and habits, a group's biggest member, the switches", () => {
    seedCards();
    writeJson("characters/aria/memory.json", memory({ inject: { maxTokens: 300, habitsMaxTokens: 100 } }));
    writeJson("characters/bram/memory.json", memory({ inject: { maxTokens: 1200 } }));
    agree({ characterId: "aria" });
    agree({ groupId: "g1" }, undefined, ["dashboard"]);
    agree({ groupId: "g1", promptBoard: { off: ["plugin:cardmemory", "plugin:cardskills"] } }, undefined, ["dashboard"]);
    expect(byId(askAll("c1"))["litopys card memory"]).toBeUndefined(); // muted for this chat
    chat({ groupId: "g1" });
    expect(byId(askAll("c1"))["litopys card memory"]).toBe(1200);
  });
  it("persona and world memory the chat took in, recollections, who knows what and the hidden plan", () => {
    seedCards();
    writeJson("memory/personas/p1.json", memory({ inject: { maxTokens: 600 } }));
    writeJson("world/state/c1.json", { origin: { kind: "library", worldId: "w-abcd" }, settings: { level: "off", insert: true } });
    writeJson("memory/worlds/w-abcd.json", memory());
    agree({ characterId: "aria", personaId: "p1", memory: { persona: true, world: true } });
    expect(byId(askAll("c1"))["litopys persona memory"]).toBe(600);
    expect(byId(askAll("c1"))["litopys world memory"]).toBe(300);
    writeJson("litopys/config.json", { hiddenPlan: true });
    agree({ groupId: "g1" }, undefined, ["dashboard"]);
    expect(byId(askAll("c1"))["litopys hidden plan"]).toBe(130);
    expect(byId(askAll("c1"))["litopys who knows what"]).toBe(250);
    expect(byId(askAll("c1"))["litopys recollections"]).toBe(300);
    writeJson("litopys/insert/c1.json", { recollections: { text: "x" } });
    agree({ characterId: "aria" });
    expect(byId(askAll("c1"))["litopys recollections"]).toBe(300);
    // one card with several names (a narrator card) voices several characters
    writeJson("characters/nar/card.json", { name: "Narrator", extensions: { molfar_soul: { characters: { Ann: {}, Ben: {} } } } });
    agree({ characterId: "nar" }, undefined, ["dashboard"]);
    expect(byId(askAll("c1"))["litopys who knows what"]).toBe(250);
  });
  it("World: the note, the event and the dice", () => {
    writeJson("world/state/c1.json", { settings: { level: "off", insert: true } });
    agree({});
    writeJson("world/state/c1.json", { settings: { level: "director", insert: true, dice: "d6" } });
    agree({});
    expect(byId(askAll("c1"))).toMatchObject({ "world here": 258, "world event": 115, "world dice": 60 });
    agree({ promptBoard: { off: ["plugin:world"] } });
  });
  it("agents: exactly what the chat's agents left for the next reply", () => {
    writeJson("agents/inserts/c1.json", { items: [{ agent: "a1", label: "Hint", text: "The hint the agent wrote for the next reply, a sentence or two long." }, { agent: "a2", text: "" }, { agent: "a3", text: "Ще одна підказка українською мовою." }] });
    agree({});
    expect(byId(askAll("c1")).agents).toBeGreaterThan(30);
    writeJson("agents/inserts/c1.json", { items: [] });
    agree({});
  });
  it("a group's Dashboard is the one place the plugin is more exact: three focused characters, not two", () => {
    seedCards();
    chat({ groupId: "g1" });
    expect(byId(askAll("c1")).dashboard).toBe(300 * 3 + 200);
    expect(byId(table({ groupId: "g1" })).dashboard).toBe(300 * 3 + 200); // the table follows (#217: it reserved one block too few)
    // a narrator card reads as a wide chat too; an ordinary card is reserved at two (one speaks, a card out of the scene may focus more)
    writeJson("characters/narr/card.json", { name: "The Narrator" });
    chat({ characterId: "narr" });
    expect(byId(askAll("c1")).dashboard).toBe(300 * 3 + 200);
    chat({ characterId: "aria" });
    expect(byId(askAll("c1")).dashboard).toBe(300 * 2 + 200);
  });
  it("a chat the plugins cannot read answers nothing (the table decides), and a plugin with nothing to reserve says so with a zero row", () => {
    for (const p of PLUGINS) {
      expect(mods[p].insertCeiling({ chatId: "../bad" }, mockHost().host)).toEqual({ ceilings: [] });
      expect(mods[p].insertCeiling({}, mockHost().host)).toEqual({ ceilings: [] });
    }
    chat({ promptBoard: { off: ["plugin:relations", "plugin:litopys", "plugin:world"] } });
    writeJson("litopys/config.json", { insert: false });
    for (const p of ["relations", "world", "agents"] as const) {
      const rows = mods[p].insertCeiling({ chatId: "c1" }, mockHost().host).ceilings as Row[];
      expect(rows.length).toBeGreaterThan(0); // an answer, so the engine plugin does not fall back for this plugin
      expect(rows.every((r) => r.tokens === 0)).toBe(true);
    }
  });
});

describe("the engine plugin reserves from the answers, with its table as the fallback", () => {
  const meta = {};
  it("an answer replaces the table's rows of that plugin and leaves the others", () => {
    seedCards();
    const w = 32000;
    const t = table(meta, "c1", w);
    expect(byId(t)).toEqual({ dashboard: 800, "dashboard said": 120, "dashboard journal": 360, litopys: 4800 + 100, "litopys who knows what": 250 });
    // the Dashboard says 1000, and Litopys is silent: its row comes from the table
    const rows = E.hookInsertBreakdown(mockHost().host.fs, "c1", { id: "c1" }, w, { window: w, rows: [{ plugin: "relations", id: "dashboard", tokens: 1000 }] });
    expect(byId(rows)).toEqual({ dashboard: 1000, litopys: 4900, "litopys who knows what": 250 });
    // a zero row from a plugin means "nothing to reserve": its table rows go too
    const none = E.hookInsertBreakdown(mockHost().host.fs, "c1", { id: "c1" }, w, { window: w, rows: [{ plugin: "relations", id: "dashboard", tokens: 0 }, { plugin: "litopys", id: "litopys", tokens: 0 }] });
    expect(none.reduce((s, r) => s + r.tokens, 0)).toBe(0);
  });
  it("answers count only for the window they were asked for; any other window, or none, and the table decides", () => {
    const answer = [{ plugin: "relations", id: "dashboard", tokens: 5 }];
    const base = byId(table(meta, "c1", 32000));
    expect(byId(E.hookInsertBreakdown(mockHost().host.fs, "c1", { id: "c1" }, 32000, { window: 16000, rows: answer }))).toEqual(base);
    expect(byId(E.hookInsertBreakdown(mockHost().host.fs, "c1", { id: "c1" }, 32000, null))).toEqual(base);
    expect(byId(E.hookInsertBreakdown(mockHost().host.fs, "c1", { id: "c1" }, undefined, { window: 32000, rows: answer }))).toEqual(byId(table(meta, "c1")));
  });
  it("the answers of the real plugins give the same reserve as the table for an ordinary chat", () => {
    chat({});
    const w = 32000;
    const answers = askAll("c1", w);
    const viaPlugins = E.hookInsertBreakdown(mockHost().host.fs, "c1", { id: "c1" }, w, { window: w, rows: answers });
    expect(byId(viaPlugins)).toEqual(byId(table({}, "c1", w)));
  });
  it("ceilingsOf takes host.insertCeilings only with a whole-number window in the query", () => {
    const rows = [{ plugin: "litopys", id: "litopys", tokens: 900 }, { plugin: "x", id: 5, tokens: 1 }, { plugin: "x", id: "bad", tokens: NaN }];
    expect(E.ceilingsOf({ insertCeilings: rows }, { query: { window: "32000" } })).toEqual({ window: 32000, rows: [rows[0]] });
    expect(E.ceilingsOf({ insertCeilings: rows }, { query: {} })).toBeNull();
    expect(E.ceilingsOf({ insertCeilings: rows }, { query: { window: "abc" } })).toBeNull();
    expect(E.ceilingsOf({ insertCeilings: rows }, { query: { window: "1.5" } })).toBeNull();
    expect(E.ceilingsOf({}, { query: { window: "32000" } })).toBeNull(); // an engine before 1.9.7
    expect(E.ceilingsOf({ insertCeilings: [] }, { query: { window: "32000" } })).toBeNull();
    expect(E.ceilingsOf(null, null)).toBeNull();
  });
});

describe("the client and the manifests", () => {
  it("asks for the ceilings only with a known window", () => {
    expect(ceilingQuery("c1", 32000)).toBe("?insertceilings=c1&window=32000");
    expect(ceilingQuery("c 1", 32000.4, "&")).toBe("&insertceilings=c%201&window=32000");
    expect(ceilingQuery("c1", undefined)).toBe("");
    expect(ceilingQuery("c1", 0)).toBe("");
  });
  it("the four plugins may be called for the hook, and the one that asks for it does not need it itself", () => {
    for (const p of PLUGINS) {
      const m = JSON.parse(fs.readFileSync(new URL(`../plugins/${p}/manifest.json`, import.meta.url), "utf8")) as { permissions: string[] };
      expect(m.permissions).toContain("hooks");
      expect(m.permissions).toContain("fs");
    }
  });
});
