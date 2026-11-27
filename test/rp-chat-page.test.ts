/**
 * A long chat loads by pages (Molfar.Vertep#537): the engine gives the newest messages (`GET /chats/:id?tail=N`) and
 * older pages (`GET /chats/:id/messages?before=&limit=`) with where they start, how many the chat has and the usage
 * totals of what is not sent; the page merges a fresh tail over the older pages it holds (src/lib/chat-page.ts).
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import * as S from "../src/lib/chat-store.js";
import { chatTail, hasOlder, mergeTail, messageTotal, pageFields, prependPage } from "../src/lib/chat-page";
import type { Chat, Message } from "../src/lib/types";
import { env, useRoot, mockHost } from "./rp-memory-m2-kit";

useRoot();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eng = (await import("../plugins/engine/plugin.js")) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type M = Record<string, any>;

function host() {
  const m = mockHost();
  m.host.fs.stat = (rel: string | string[]) => {
    const one = (r: string) => { try { const st = fs.statSync(path.resolve(env.root, r)); return { size: st.isDirectory() ? 0 : st.size, mtimeMs: 1, dir: st.isDirectory() }; } catch { return null; } };
    return Array.isArray(rel) ? rel.map(one) : one(rel);
  };
  return m;
}
/** n messages; every reply has a usage, every fifth a known cost. */
function chat(n: number): M[] {
  return Array.from({ length: n }, (_, i) => {
    const id = "m" + (i + 1);
    const text = (i % 2 ? "Aria answers " : "You say ") + "line " + (i + 1) + " about the harvest.";
    if (i % 2 === 0) return { id, name: "You", role: "user", text, at: i, swipes: [text], swipe: 0 };
    return { id, name: "Aria", charId: "aria", role: "char", text, at: i, swipes: [text], swipe: 0, extra: { model: "x/y", usage: { input: 100 + i, output: 10, cacheRead: 5, ...(i % 5 === 1 ? { costTotal: 0.01 } : {}) } } };
  });
}
const route = (m: ReturnType<typeof host>, p: string, query: M = {}) => JSON.parse(JSON.stringify(eng.handleRoute({ method: "GET", path: p, query }, m.host).json));
const sum = (ms: M[]) => ms.reduce((u, x) => { const s = x.extra?.usage; if (!s) return u; u.n++; u.tin += s.input; u.tout += s.output; u.cached += s.cacheRead; if (s.costTotal != null) { u.cost += s.costTotal; u.costN++; } return u; }, { n: 0, tin: 0, tout: 0, cached: 0, cost: 0, costN: 0 });

describe("the engine's pages", () => {
  function long() {
    const m = host();
    const msgs = chat(450);
    S.chatSave(m.host.fs, "c1", { id: "c1", title: "T", characterId: "aria" }, msgs);
    return { m, msgs };
  }
  it("the newest messages, where they start, how many there are, and the usage of the rest", () => {
    const { m, msgs } = long();
    const r = route(m, "/chats/c1", { tail: "100" });
    expect(r.messages.map((x: M) => x.id)).toEqual(msgs.slice(350).map((x) => x.id));
    expect(r).toMatchObject({ firstIndex: 350, total: 450, hasUser: true });
    const want = sum(msgs.slice(0, 350));
    expect(r.older.n).toBe(want.n);
    expect(r.older.tin).toBe(want.tin);
    expect(r.older.costN).toBe(want.costN);
    expect(r.older.cost).toBeCloseTo(want.cost, 9);
    expect(r.meta.id).toBe("c1");
  });
  it("older pages, and every message before one", () => {
    const { m, msgs } = long();
    const p = route(m, "/chats/c1/messages", { before: "m351", limit: "100" });
    expect(p.messages.map((x: M) => x.id)).toEqual(msgs.slice(250, 350).map((x) => x.id));
    expect(p).toMatchObject({ firstIndex: 250, total: 450 });
    expect(p.older.tin).toBe(sum(msgs.slice(0, 250)).tin);
    const all = route(m, "/chats/c1/messages", { before: "m251", limit: "0" });
    expect(all.messages.length).toBe(250);
    expect(all.firstIndex).toBe(0);
    expect(all.older).toBeUndefined();
    expect(eng.handleRoute({ method: "GET", path: "/chats/c1/messages", query: { before: "nope" } }, m.host).status).toBe(404);
  });
  it("without a tail, every message as before; with tail=0 none, and whether the player wrote", () => {
    const { m, msgs } = long();
    const r = route(m, "/chats/c1");
    expect(r.messages.length).toBe(450);
    expect(r.firstIndex).toBeUndefined();
    expect(r.messages).toEqual(msgs);
    const none = route(m, "/chats/c1", { tail: "0" });
    expect(none).toMatchObject({ messages: [], firstIndex: 450, total: 450, hasUser: true });
  });
  it("a tail reads no old part; the boot payload carries the shown chat by its tail", () => {
    const { m } = long();
    const reads: string[] = [];
    const read = m.host.fs.read;
    m.host.fs.read = (rel: string) => { reads.push(rel); return read(rel); };
    route(m, "/chats/c1", { tail: "100" });
    expect(reads.filter((r) => r.includes(".parts/") && r.endsWith(".jsonl"))).toEqual([]);
    const boot = route(m, "/bootstrap", { chat: "c1", tail: "50" });
    expect(boot.activeChat.messages.length).toBe(50);
    expect(boot.activeChat).toMatchObject({ firstIndex: 400, total: 450 });
  });
});

const msg = (id: string): Message => ({ id, role: "user", swipes: [{ id: "s", content: id, model: "", genTimeMs: 0, timestamp: 0 }], activeSwipe: 0, timestamp: 0, edited: false, hidden: false, bookmarked: false } as unknown as Message);
const ids = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => msg("m" + (from + i)));
const page = (from: number, to: number, total: number, extra: Partial<Chat> = {}): Chat => ({ id: "c1", messages: ids(from, to), firstIndex: from, total, ...extra } as unknown as Chat);

describe("the page's pieces of a chat", () => {
  it("a chat opens with two screens of messages, and at least 100", () => {
    expect(chatTail(50)).toBe(100);
    expect(chatTail(80)).toBe(160);
  });
  it("counts the whole chat", () => {
    expect(messageTotal(page(400, 450, 450))).toBe(450);
    expect(messageTotal({ messages: [], messageCount: 12 })).toBe(12);
    expect(messageTotal(page(0, 3, 3))).toBe(3);
    expect(hasOlder(page(400, 450, 450))).toBe(true);
    expect(hasOlder(page(0, 3, 3))).toBe(false);
  });
  it("reads the page fields of an answer, an answer without them being the whole chat", () => {
    expect(pageFields({ firstIndex: 10, total: 30 }, 20)).toEqual({ firstIndex: 10, total: 30 });
    expect(pageFields({}, 7)).toEqual({ firstIndex: 0, total: 7 });
  });
  it("a fresh tail keeps the older pages held when it starts where they end", () => {
    const shown = page(200, 450, 450, { olderUse: { n: 1, tin: 1, tout: 1, cached: 0, cost: 0, costN: 0 } });
    // a reply landed: two more messages, the tail moved by two
    const fresh = page(352, 452, 452);
    const merged = mergeTail(shown, fresh);
    expect(merged.firstIndex).toBe(200);
    expect(merged.messages.map((m) => m.id)).toEqual(ids(200, 452).map((m) => m.id));
    expect(merged.olderUse).toEqual(shown.olderUse);
    expect(merged.total).toBe(452);
  });
  it("a fresh tail that does not fit (a deletion further up) replaces what is held", () => {
    const shown = page(200, 450, 450);
    const shifted = { ...page(349, 449, 449), messages: ids(350, 450) };
    expect(mergeTail(shown, shifted)).toBe(shifted);
    expect(mergeTail(page(400, 450, 450), page(300, 450, 450)).firstIndex).toBe(300);
  });
  it("an older page goes in front only when it ends where the held messages start", () => {
    const shown = page(300, 450, 450);
    const next = prependPage(shown, page(200, 300, 450));
    expect(next!.firstIndex).toBe(200);
    expect(next!.messages.length).toBe(250);
    expect(prependPage(shown, page(150, 250, 450))).toBeNull();
    expect(prependPage(shown, { ...page(200, 300, 450), messages: [...ids(200, 299), msg("m300")] })).toBeNull();
  });
});
