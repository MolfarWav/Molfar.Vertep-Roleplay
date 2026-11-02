/**
 * #122: a chat's own Litopys settings (scene length, recent messages, pin limit, insert budget) laid over the
 * global ones: stored in the chat's record, set by POST /litopys/chat-config, read by the tick, the insert and the view.
 */
import { describe, expect, it } from "bun:test";
import { L, chapterReply, mockHost, readJson, story, tick, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any, query: Record<string, string> = {}) => L.handleRoute({ method, path, query, body }, host);
const seed = (id: string, config?: Record<string, unknown>) => writeJson(`litopys/chats/${id}.json`, { ...L.emptyChat(id), migrated: true, ...(config ? { config } : {}) });

describe("chatOverrides and withChat", () => {
  it("keep known keys inside their limits and drop the rest", () => {
    const own = L.chatOverrides({ config: { recentMessages: 9999, pinLimit: "3", budget: 10, junk: 1, scene: { minMessages: 0, maxMessages: "x" } } });
    expect(own).toEqual({ recentMessages: 200, pinLimit: 3, budget: 200, scene: { minMessages: 1 } });
    expect(L.chatOverrides({})).toEqual({});
    expect(L.chatOverrides(null)).toEqual({});
  });
  it("lay a chat's values over the config, and a max below the min follows the min", () => {
    const cfg = L.loadConfig(mockHost().host.fs);
    expect(L.withChat(cfg, {})).toBe(cfg);
    const next = L.withChat(cfg, { config: { recentMessages: 30, scene: { minMessages: 30, maxMessages: 12 } } });
    expect(next.recentMessages).toBe(30);
    expect(next.scene).toEqual({ minMessages: 30, maxMessages: 30 });
    expect(next.pinLimit).toBe(cfg.pinLimit);
  });
});

describe("POST /litopys/chat-config", () => {
  it("sets a chat's own values and shows them, the value in effect and the global one in the view", () => {
    writeChat("c1", story(10), { updatedAt: Date.now() });
    seed("c1");
    const { host } = mockHost();
    const res = route(host, "POST", "/litopys/chat-config", { chatId: "c1", values: { recentMessages: 30, scene: { maxMessages: 20 } } });
    expect(res.status).toBe(200);
    expect(res.json.chatConfig.own).toEqual({ recentMessages: 30, scene: { maxMessages: 20 } });
    expect(res.json.chatConfig.value.recentMessages).toBe(30);
    expect(res.json.chatConfig.value.scene.maxMessages).toBe(20);
    expect(res.json.chatConfig.global.recentMessages).toBe(L.loadConfig(host.fs).recentMessages);
    expect(readJson("litopys/chats/c1.json").config).toEqual({ recentMessages: 30, scene: { maxMessages: 20 } });
  });
  it("null puts one key back on the global value, reset puts them all back", () => {
    writeChat("c1", story(10), { updatedAt: Date.now() });
    seed("c1", { recentMessages: 30, pinLimit: 2, scene: { maxMessages: 20 } });
    const { host } = mockHost();
    const one = route(host, "POST", "/litopys/chat-config", { chatId: "c1", values: { recentMessages: null, scene: { maxMessages: "" } } });
    expect(one.json.chatConfig.own).toEqual({ pinLimit: 2 });
    const all = route(host, "POST", "/litopys/chat-config", { chatId: "c1", reset: true });
    expect(all.json.chatConfig.own).toEqual({});
    expect("config" in readJson("litopys/chats/c1.json")).toBe(false);
  });
  it("refuses a value that is not a number, an unknown chat and a chat that is rebuilding", () => {
    writeChat("c1", story(10), { updatedAt: Date.now() });
    seed("c1");
    const { host } = mockHost();
    expect(route(host, "POST", "/litopys/chat-config", { chatId: "c1", values: { pinLimit: "many" } }).status).toBe(400);
    expect(route(host, "POST", "/litopys/chat-config", { chatId: "nope", values: { pinLimit: 3 } }).status).toBe(404);
    writeJson("litopys/chats/c1.json", { ...L.emptyChat("c1"), rebuild: { startedAt: 1, chapters: [], facts: [], proposals: [], counters: { chapter: 0, fact: 0, proposal: 0 } } });
    expect(route(host, "POST", "/litopys/chat-config", { chatId: "c1", values: { pinLimit: 3 } }).status).toBe(409);
  });
});

describe("the chat's own values are used", () => {
  it("the tick cuts scenes by the chat's own maxMessages, another chat keeps the global one", () => {
    writeChat("mine", story(70), { updatedAt: Date.now() });
    seed("mine", { scene: { maxMessages: 20 } });
    const m = mockHost();
    tick(m, [chapterReply("T", "X")]);
    const ch = readJson("litopys/chats/mine.json").chapters;
    expect(ch).toHaveLength(1);
    expect([ch[0].from, ch[0].to]).toEqual(["m1", "m20"]);
  });
  it("the global value still rules a chat with no settings of its own", () => {
    writeChat("plain", story(70), { updatedAt: Date.now() });
    seed("plain");
    const m = mockHost();
    tick(m, [chapterReply("T", "X")]);
    const ch = readJson("litopys/chats/plain.json").chapters;
    expect([ch[0].from, ch[0].to]).toEqual(["m1", "m40"]);
  });
  it("the pin limit of a chat decides when a fact cannot be pinned", () => {
    writeChat("c1", story(10), { updatedAt: Date.now() });
    const base = L.emptyChat("c1");
    const fact = (id: string, pinned: boolean) => ({ id, text: "t" + id, subject: "Aria", kind: "trait", status: "active", pinned, weight: 3, createdAt: 1, sources: [] });
    writeJson("litopys/chats/c1.json", { ...base, config: { pinLimit: 1 }, facts: [fact("f1", true), fact("f2", false)], counters: { ...base.counters, fact: 2 } });
    const { host } = mockHost();
    const res = route(host, "POST", "/litopys/facts", { chatId: "c1", op: "pin", id: "f2" });
    expect(res.status).toBe(409);
    expect(res.json.limit).toBe(1);
  });
});
