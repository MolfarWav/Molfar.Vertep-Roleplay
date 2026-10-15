// "Write for me" results and unsent messages go back to their own chat's composer, never over
// newer typing (Discord tracker BUG-015, BUG-016; GitHub #29, #30).
import { beforeAll, describe, expect, it } from "bun:test";

const store = new Map<string, string>();
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = () => Promise.reject(new Error("offline"));
let useApp: any;
let drafts: any;

beforeAll(async () => {
  (globalThis as any).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as any).fetch = (url: string, init?: RequestInit) => fetchImpl(String(url), init);
  useApp = (await import("../src/lib/store")).useApp;
  drafts = await import("../src/lib/drafts");
});

const chat = (id: string) => ({ id, characterId: null, title: id, messages: [], presetId: null, personaId: null, lorebookIds: [], createdAt: 0, updatedAt: 0 });
function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => { resolve = r; });
  return { promise, resolve };
}
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });

describe("composer fills", () => {
  it("a fill goes in only over the draft it started from", () => {
    expect(drafts.fillAction("", "")).toBe("put");
    expect(drafts.fillAction("old", "old")).toBe("put");
    expect(drafts.fillAction("old", "old and more")).toBe("offer");
    expect(drafts.fillAction("", "typed meanwhile")).toBe("offer");
  });

  it("a late impersonation result is kept for its own chat with the draft it started from", async () => {
    useApp.setState({ chats: [chat("A"), chat("B")], composerDrafts: {}, streaming: null });
    store.set(drafts.draftKey("A"), "half a thought");
    const a = deferred();
    const b = deferred();
    fetchImpl = (url) => (url.includes("/chats/A/") ? a.promise : b.promise);
    useApp.getState().impersonate("A");
    // the user moves to B and asks there too
    useApp.getState().impersonate("B");
    expect(useApp.getState().streaming?.chatId).toBe("B");
    // A lands first: B's "writing" state stays
    a.resolve(json({ text: "A's line" }));
    await new Promise((r) => setTimeout(r, 10));
    expect(useApp.getState().streaming?.chatId).toBe("B");
    b.resolve(json({ text: "B's line" }));
    await new Promise((r) => setTimeout(r, 10));
    expect(useApp.getState().streaming).toBeNull();
    const fills = useApp.getState().composerDrafts;
    expect(fills.A).toMatchObject({ chatId: "A", text: "A's line", base: "half a thought", kind: "impersonate" });
    expect(fills.B).toMatchObject({ chatId: "B", text: "B's line", base: "", kind: "impersonate" });
    // taking A's fill leaves B's
    useApp.getState().dropComposerDraft("A", fills.A.id);
    expect(Object.keys(useApp.getState().composerDrafts)).toEqual(["B"]);
    // an older id does not drop a newer fill
    useApp.getState().dropComposerDraft("B", "stale");
    expect(Object.keys(useApp.getState().composerDrafts)).toEqual(["B"]);
  });

  it("a send refused before it starts says not-sent", async () => {
    useApp.setState({ chats: [chat("A")], streaming: { chatId: "A", messageId: "x", full: "", shown: 0, startedAt: 0 } });
    expect(await useApp.getState().sendMessage("A", "hello")).toBe("not-sent");
    expect(await useApp.getState().sendMessage("missing", "hello")).toBe("not-sent");
  });

  it("a send whose request fails before the engine stored it says not-sent", async () => {
    useApp.setState({ chats: [chat("A")], streaming: null });
    fetchImpl = () => Promise.reject(new Error("offline"));
    expect(await useApp.getState().sendMessage("A", "lost words")).toBe("not-sent");
  });
});
