// Stop and Regenerate in the chat (Molfar.Vertep #382, #383).
//  - #382: Regenerate waits for the World DM's rollback; the Stop button must show at once, and a Stop in that
//    window ends the run before any request is sent.
//  - #383: the live stream socket is opened once per page, so a re-hydrate during a reply cannot drop deltas.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const store = new Map<string, string>();
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = () => Promise.reject(new Error("offline"));
let useApp: any;
const sockets: FakeSocket[] = [];

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { sockets.push(this); }
  close() { this.closed = true; this.onclose?.(); }
  push(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}

beforeAll(async () => {
  (globalThis as any).location = { protocol: "http:", host: "localhost", pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as any).WebSocket = FakeSocket;
  (globalThis as any).requestAnimationFrame ??= (cb: () => void) => setTimeout(cb, 0);
  (globalThis as any).cancelAnimationFrame ??= (id: ReturnType<typeof setTimeout>) => clearTimeout(id);
  (globalThis as any).fetch = (url: string, init?: RequestInit) => fetchImpl(String(url), init);
  useApp = (await import("../src/lib/store")).useApp;
}, 60000);

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => { resolve = r; });
  return { promise, resolve };
}
const msg = (id: string, role: "user" | "assistant", text: string) => ({
  id, role, characterId: role === "assistant" ? "c1" : null,
  swipes: [{ id: `${id}-s`, content: text, model: "m", genTimeMs: 0, timestamp: 0 }],
  activeSwipe: 0, timestamp: 0, edited: false, hidden: false, bookmarked: false,
});
const chat = (id: string) => ({ id, characterId: "c1", title: id, messages: [msg("u1", "user", "hi"), msg("a1", "assistant", "hello")], presetId: null, personaId: null, lorebookIds: [], createdAt: 0, updatedAt: 0 });

describe("Regenerate while the World DM takes its writes back (#382)", () => {
  it("Stop shows at once, and a Stop in the wait sends no request", async () => {
    const rollback = deferred();
    const calls: string[] = [];
    fetchImpl = (url) => {
      calls.push(url);
      if (url.includes("/world/rollback")) return rollback.promise;
      return Promise.resolve(json({}));
    };
    useApp.setState({ chats: [chat("A")], streaming: null });
    useApp.getState().regenerate("A");
    // no await: the button must not wait for the rollback
    expect(useApp.getState().streaming).toMatchObject({ chatId: "A", messageId: "a1" });
    useApp.getState().stopStreaming();
    expect(useApp.getState().streaming).toBeNull();
    rollback.resolve(json({}));
    await Bun.sleep(30);
    expect(calls.some((u) => u.includes("/swipe"))).toBe(false);
    expect(useApp.getState().streaming).toBeNull();
    // the old reply is untouched
    expect(useApp.getState().chats[0].messages.at(-1).swipes).toHaveLength(1);
  });

  it("without a Stop the request goes after the rollback, and the stream stays on the message", async () => {
    const rollback = deferred();
    const calls: string[] = [];
    let onSwipe: string | undefined;
    fetchImpl = (url) => {
      calls.push(url);
      if (url.includes("/world/rollback")) return rollback.promise;
      // the swipe request hangs: the reply is being written; the stream is on the old message when it starts
      if (url.includes("/swipe")) { onSwipe = useApp.getState().streaming?.messageId; return new Promise<Response>(() => {}); }
      return Promise.resolve(json({}));
    };
    useApp.setState({ chats: [chat("B")], streaming: null });
    useApp.getState().regenerate("B");
    expect(useApp.getState().streaming?.messageId).toBe("a1");
    // a second click while it waits does nothing
    useApp.getState().regenerate("B");
    await Bun.sleep(5);
    expect(calls.filter((u) => u.includes("/world/rollback"))).toHaveLength(1);
    rollback.resolve(json({}));
    await Bun.sleep(30);
    expect(calls.some((u) => u.includes("/chats/B/swipe"))).toBe(true);
    expect(onSwipe).toBe("a1");
    useApp.getState().stopStreaming();
  });
});

describe("the live stream socket (#383)", () => {
  it("is opened once, so a hydrate during a reply loses no deltas", async () => {
    const boot = { settings: {}, library: {}, databank: {}, chats: [], groups: [], regex: [], characters: [], presets: [], lorebooks: [], personas: [] };
    fetchImpl = (url) => Promise.resolve(json(url.includes("/bootstrap") ? boot : url.includes("/models") ? { models: [] } : {}));
    await useApp.getState().hydrate();
    const first = sockets.length;
    expect(first).toBeGreaterThan(0);
    useApp.setState({ chats: [chat("S")], streaming: { chatId: "S", messageId: "pending-1", full: "", shown: 0, startedAt: 0 } });
    const ws = () => sockets[sockets.length - 1]!;
    ws().push({ type: "app_stream", payload: { chatId: "S", name: "r", delta: "word1 " } });
    ws().push({ type: "app_stream", payload: { chatId: "S", name: "r", delta: "word2 " } });
    // the page re-hydrates (the chat file changed) before the frame that would flush those two words
    await useApp.getState().hydrate();
    expect(sockets.length).toBe(first);
    expect(sockets.every((x) => !x.closed)).toBe(true);
    ws().push({ type: "app_stream", payload: { chatId: "S", name: "r", delta: "word3 " } });
    await Bun.sleep(40);
    // the text on screen, and so the text a Stop freezes, starts at the first word and has every word
    expect(useApp.getState().streaming?.full).toBe("word1 word2 word3 ");
    useApp.setState({ streaming: null });
  });
});

describe("a send right after a Stop (#384)", () => {
  it("the stopped send is 'stopped', not 'not-sent', even when the next send starts before its clean-up ends", async () => {
    const refresh = deferred();
    const calls: string[] = [];
    fetchImpl = (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const m = init?.method ?? "GET";
      if (url.includes("/send")) {
        // the request ends with an error that is not an AbortError once the page aborts it (what a slow page can see)
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("network error")), { once: true });
        });
      }
      // the clean-up after a Stop reads the chat again: slow, so the next send gets in before it ends
      // (it asks for the newest messages, ?tail=N: Molfar.Vertep#537)
      if (m === "GET" && /\/chats\/D(\?|$)/.test(url)) return refresh.promise;
      return Promise.resolve(json({}));
    };
    useApp.setState({ chats: [chat("D")], streaming: null, composerDrafts: {} });
    const first = useApp.getState().sendMessage("D", "first message");
    for (let i = 0; i < 50 && !calls.some((c) => c.includes("/send")); i++) await Bun.sleep(5);
    expect(calls.some((c) => c.includes("/send"))).toBe(true);
    useApp.getState().stopStreaming();
    await Bun.sleep(20);
    // the user sends again within the second: this clears what the old code kept per chat
    const second = useApp.getState().sendMessage("D", "second message");
    await Bun.sleep(20);
    refresh.resolve(json({ meta: { id: "D", title: "D" }, messages: [] }));
    expect(await first).toBe("stopped");
    useApp.getState().stopStreaming();
    await second.catch(() => undefined);
  });
});
