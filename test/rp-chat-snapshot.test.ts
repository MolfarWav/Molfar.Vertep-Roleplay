// A chat on screen never loses its loaded transcript to a snapshot that has none (Discord report:
// the log jumped to the oldest message while sidecars finished). The engine writes a transcript
// with a plain file write, so a read that lands mid-write parses as an empty chat; applied, it
// emptied the log, the browser clamped the reader's scroll to the top, and the next refresh left
// them there.
import { beforeAll, beforeEach, describe, expect, it } from "bun:test";

const store = new Map<string, string>();
type Call = { method: string; path: string };
let routes: (call: Call) => Response | null = () => null;
let useApp: any;
let eng: any;
let snap: any;

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

beforeAll(async () => {
  (globalThis as any).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    const call: Call = { method: init?.method ?? "GET", path: String(url).replace("/v1/apps/roleplay", "") };
    return routes(call) ?? json({ error: "not mocked: " + call.method + " " + call.path }, 404);
  };
  useApp = (await import("../src/lib/store")).useApp;
  eng = await import("../src/lib/engine");
  snap = await import("../src/lib/chat-snapshot");
});

const meta = { id: "c1", characterId: "ch1", title: "Chat", createdAt: 1, updatedAt: 2 };
const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "m" + i, role: i % 2 ? "char" : "user", name: i % 2 ? "Dzvinka" : "You", text: "line " + i, at: 10 + i, swipes: ["line " + i], swipe: 0 }));
const chatWith = (n: number) => eng.engineChatToUI(meta, msgs(n));
const shownCount = () => useApp.getState().chats.find((c: any) => c.id === "c1")?.messages.length;
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  routes = () => null;
  useApp.setState({ chats: [chatWith(6)], activeChatId: "c1", view: "chat", characters: [] });
});

describe("keepShownTranscript", () => {
  it("keeps a loaded transcript against an empty snapshot", () => {
    expect(snap.keepShownTranscript(chatWith(6), 0)).toBe(true);
  });
  it("takes any snapshot that has messages, fewer ones included", () => {
    expect(snap.keepShownTranscript(chatWith(6), 6)).toBe(false);
    expect(snap.keepShownTranscript(chatWith(6), 2)).toBe(false);
  });
  it("takes an empty snapshot when nothing was loaded", () => {
    expect(snap.keepShownTranscript(chatWith(0), 0)).toBe(false);
    expect(snap.keepShownTranscript(null, 0)).toBe(false);
  });
});

describe("reloading the open chat", () => {
  it("a transcript read mid-write (no messages) leaves the loaded messages in place", async () => {
    routes = (c) => (c.path === "/chats/c1" ? json({ meta, messages: [] }) : null);
    await useApp.getState().reloadChat("c1");
    await settle();
    expect(shownCount()).toBe(6);
  });
  it("a real snapshot still replaces the messages", async () => {
    routes = (c) => (c.path === "/chats/c1" ? json({ meta, messages: msgs(8) }) : null);
    await useApp.getState().reloadChat("c1");
    await settle();
    expect(shownCount()).toBe(8);
  });
});
