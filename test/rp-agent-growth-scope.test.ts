/**
 * Where a block of the living portrait acts (Molfar.Vertep#450): a block an agent or the hand button wrote is bound to the story it
 * came from (the chat, and the chats that continue it, plus the ones the user chose); a block with no scope acts in every chat of the
 * card, as before. `skip` switches one off in a chat whatever the scope says.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const plugin = (await import(new URL("../plugins/agents/plugin.js", import.meta.url).href)) as typeof import("../plugins/agents/plugin.js");

type Json = Record<string, any>;
let root: string;
const host = () => ({
  fs: {
    root,
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
  store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
  llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  log: () => {},
});
const call = (method: string, p: string, body?: unknown, query?: Json) =>
  plugin.handleRoute({ method, path: p, query: query ?? {}, body } as never, host() as never) as { status?: number; json?: Json };
const put = (body: Json) => call("PUT", "/agents/growth", { cardId: "aria", ...body });
const get = (query: Json = {}) => call("GET", "/agents/growth", undefined, { cardId: "aria", ...query }).json as Json;
const disk = () => JSON.parse(fs.readFileSync(path.join(root, "characters/aria/growth.json"), "utf8"));
const writeGrowth = (entries: Json[]) => fs.writeFileSync(path.join(root, "characters/aria/growth.json"), JSON.stringify({ v: 2, next: 50, entries, inject: { enabled: true, maxTokens: 1500 } }));
const link = (links: Record<string, string>) => {
  fs.mkdirSync(path.join(root, "litopys"), { recursive: true });
  fs.writeFileSync(path.join(root, "litopys/links.json"), JSON.stringify({ v: 1, links: Object.fromEntries(Object.entries(links).map(([child, from]) => [child, { from, at: 1 }])) }));
};
const block = (id: string, text: string, extra: Json = {}): Json => ({ id, section: "personality", kind: "changed", text, on: true, state: "accepted", origin: "agent", at: 10, ...extra });
const story = (chatId: string, extra: Json = {}): Json => ({ scope: "story", from: { chatId, title: "Chat " + chatId, at: 1 }, ...extra });
const PROMPT = () => [{ role: "system", content: "Aria is a tsundere." }, { role: "user", content: "Go on." }];
const reply = (chatId: string) => plugin.llmRequest({ key: "reply", request: { sessionId: chatId, messages: PROMPT() } } as never, host() as never) as Json | null;
const sent = (chatId: string) => JSON.stringify(reply(chatId) ?? "");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-growth-scope-"));
  fs.mkdirSync(path.join(root, "characters", "aria"), { recursive: true });
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ name: "Aria", description: "A tsundere." }));
  fs.mkdirSync(path.join(root, "chats"), { recursive: true });
  for (const id of ["a1", "a2", "a3", "b1"]) fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ id, title: "Chat " + id, characterId: "aria" }));
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

describe("a story block acts in its story only (#450)", () => {
  it("in the chat it came from and the chats that continue it, not in an unrelated chat or an earlier one", () => {
    writeGrowth([block("g1", "She learned to say sorry first.", story("a2"))]);
    link({ a2: "a1", a3: "a2" });
    expect(sent("a2")).toContain("say sorry first");
    expect(sent("a3")).toContain("say sorry first");
    // a1 is the chat a2 continues: the story had not happened there yet
    expect(sent("a1")).not.toContain("say sorry first");
    expect(sent("b1")).not.toContain("say sorry first");
  });

  it("a block with no scope acts in every chat of the card, as before", () => {
    writeGrowth([block("g1", "She is warmer now.")]);
    for (const id of ["a1", "a2", "b1"]) expect(sent(id)).toContain("warmer now");
  });

  it("a story block with no chat it came from is read as card-wide, and a scope it cannot keep is dropped", () => {
    writeGrowth([block("g1", "Card-wide by the file.", { scope: "story" })]);
    expect(sent("b1")).toContain("Card-wide");
    expect(disk().entries[0].scope).toBe("story");
    expect(get().growth.entries[0].scope).toBeUndefined();
  });
});

describe("choosing the chats (#450)", () => {
  it("the 'chat' op adds a chat to a story block and takes it away again", () => {
    writeGrowth([block("g1", "She keeps a spare key.", story("a1"))]);
    expect(sent("b1")).not.toContain("spare key");
    let a = put({ op: "chat", id: "g1", chatId: "b1", apply: true }).json as Json;
    expect(a.reach).toBeUndefined();
    expect(disk().entries[0].chats).toEqual(["b1"]);
    expect(sent("b1")).toContain("spare key");
    put({ op: "chat", id: "g1", chatId: "b1", apply: false });
    expect(disk().entries[0].chats).toBeUndefined();
    expect(disk().entries[0].skip).toBeUndefined();
    expect(sent("b1")).not.toContain("spare key");
  });

  it("switching a block off where it would act writes a skip; switching it on again clears it", () => {
    writeGrowth([block("g1", "She keeps a spare key.", story("a1"))]);
    link({ a2: "a1" });
    put({ op: "chat", id: "g1", chatId: "a2", apply: false });
    expect(disk().entries[0].skip).toEqual(["a2"]);
    expect(sent("a2")).not.toContain("spare key");
    expect(sent("a1")).toContain("spare key");
    put({ op: "chat", id: "g1", chatId: "a2", apply: true });
    expect(disk().entries[0].skip).toBeUndefined();
    expect(disk().entries[0].chats).toBeUndefined();
    expect(sent("a2")).toContain("spare key");
  });

  it("a card-wide block can be switched off in one chat only", () => {
    writeGrowth([block("g1", "She is warmer now.")]);
    put({ op: "chat", id: "g1", chatId: "b1", apply: false });
    expect(sent("b1")).not.toContain("warmer now");
    expect(sent("a1")).toContain("warmer now");
  });

  it("'scope' binds a block that has a chat to its story, frees it, and refuses a block with no chat", () => {
    writeGrowth([block("g1", "She is warmer now.", { from: { chatId: "a1", title: "Chat a1", at: 1 } }), block("g2", "Typed by the user.", { origin: "user" })]);
    expect(put({ op: "scope", id: "g1", scope: "story" }).status).toBe(200);
    expect(sent("b1")).not.toContain("warmer now");
    expect(put({ op: "scope", id: "g2", scope: "story" }).status).toBe(400);
    put({ op: "chat", id: "g1", chatId: "b1", apply: true });
    put({ op: "scope", id: "g1", scope: "card" });
    expect(disk().entries[0].scope).toBeUndefined();
    expect(disk().entries[0].chats).toBeUndefined();
    expect(sent("b1")).toContain("warmer now");
    expect(put({ op: "scope", id: "g1", scope: "nowhere" }).status).toBe(400);
    expect(put({ op: "chat", id: "g1", chatId: "../x", apply: true }).status).toBe(400);
  });
});

describe("what a chat is told about the blocks (#450)", () => {
  it("GET with a chat says why each block acts there and what that chat is sent; the whole file says which chats continue a story", () => {
    writeGrowth([block("g1", "Story A.", story("a1")), block("g2", "Card-wide.", { at: 11 }), block("g3", "Chosen here.", story("a1", { chats: ["b1"], at: 12 })), block("g4", "Switched off.", { skip: ["b1"], at: 13 })]);
    link({ a2: "a1" });
    const a = get({ chatId: "b1" });
    expect(a.reach).toEqual({ g1: "none", g2: "card", g3: "chosen", g4: "skipped" });
    expect(a.tokens).toMatchObject({ live: 4, sent: 2 });
    expect(a.text).toContain("Chosen here.");
    expect(a.text).not.toContain("Story A.");
    expect(get({ chatId: "a2" }).reach.g1).toBe("continues");
    expect(get({ chatId: "a1" }).reach.g1).toBe("source");
    expect(get().reach).toBeUndefined();
    expect(get().growth.entries.find((e: Json) => e.id === "g1").continues).toEqual(["a2"]);
    expect(get().tokens.sent).toBe(4);
  });

  it("a chat that is sent no block says so: the part is left out", () => {
    writeGrowth([block("g1", "Story A.", story("a1"))]);
    expect(reply("b1")).toBeNull();
    expect(get({ chatId: "b1" }).tokens).toMatchObject({ live: 1, sent: 0 });
  });
});

describe("an older file: agent blocks written before stories (#540)", () => {
  const old = (chatId: string, extra: Json = {}): Json => ({ from: { chatId, title: "Chat " + chatId, at: 1 }, ...extra });

  it("an agent's block with no scope is bound to the chat it came from, and saved so on the next write", () => {
    writeGrowth([block("g1", "She hums when she cooks.", old("a1")), block("g2", "Second block.", old("a1"))]);
    expect(get().growth.entries[0].scope).toBe("story");
    expect(sent("a1")).toContain("hums when she cooks");
    expect(sent("b1")).not.toContain("hums when she cooks");
    put({ op: "on", id: "g2", on: true });
    expect(disk().v).toBe(3);
    expect(disk().entries[0].scope).toBe("story");
  });

  it("'every chat' chosen after that stays: a v3 file is not bound again", () => {
    writeGrowth([block("g1", "She hums when she cooks.", old("a1"))]);
    put({ op: "scope", id: "g1", scope: "card" });
    expect(disk().v).toBe(3);
    expect(get().growth.entries[0].scope).toBeUndefined();
    expect(sent("b1")).toContain("hums when she cooks");
  });

  it("a block from a deleted chat, and a block the user wrote, stay card-wide", () => {
    writeGrowth([block("g1", "From a chat that is gone.", old("gone1")), block("g2", "The user wrote it.", old("a1", { origin: "user" }))]);
    const g = get().growth.entries;
    expect(g.map((e: Json) => e.scope)).toEqual([undefined, undefined]);
    expect(sent("b1")).toContain("chat that is gone");
    expect(sent("b1")).toContain("user wrote it");
  });
});
