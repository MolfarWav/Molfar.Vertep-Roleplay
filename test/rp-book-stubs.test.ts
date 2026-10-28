// Lorebook summaries on the client (the twin of the character summaries, #46): the start-up list holds books
// without entries (`stub`), the whole book is loaded when a screen needs it, and a summary is NEVER written
// back over a book (it would blank the user's entries).
import { beforeAll, beforeEach, describe, expect, it } from "bun:test";

const store = new Map<string, string>();
type Call = { method: string; path: string; body: any };
let calls: Call[] = [];
let routes: (call: Call) => Promise<Response> | Response | null = () => null;
let useApp: any;
let storeMod: any;
let eng: any;

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
  (globalThis as any).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      path: String(url).replace("/v1/apps/roleplay", ""),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return (await routes(call)) ?? json({ error: "not mocked: " + call.method + " " + call.path }, 404);
  };
  storeMod = await import("../src/lib/store");
  useApp = storeMod.useApp;
  eng = await import("../src/lib/engine");
});

/** A whole book as the engine stores it. */
const wholeRaw = (id: string, n = 3) => ({
  id, name: "Lore " + id, globalActive: false, linkedCharacterIds: [], isEmbedded: true, formatTemplate: "",
  settings: { scanDepth: 4 }, vectorized: { embedding: "x", queryMessages: 2, scoreThreshold: 0.35, topK: 10 },
  entries: Array.from({ length: n }, (_, i) => ({ uid: i, keys: ["k" + i], content: "entry " + i, enabled: true, order: 100 })),
});
/** The summary the plugin's bookSummary sends for it. */
const summaryRaw = (id: string, n = 3, rev = "10:1") => ({
  id, stub: true, name: "Lore " + id, folderId: null, globalActive: false, isEmbedded: true, linkedCharacterIds: [], formatTemplate: "",
  entryCount: n, tokens: 12, rev,
});
const stubOf = (id: string, n = 3, rev = "10:1") => eng.engineLorebookToUI(summaryRaw(id, n, rev), id);

beforeEach(() => {
  calls = [];
  routes = () => null;
  useApp.setState({ lorebooks: [], characters: [] });
});

describe("summary mapping", () => {
  it("a summary becomes a stub: no entries, the count and the rev on it, no leaked fields in extra", () => {
    const b = stubOf("a", 45, "99:7");
    expect(b.stub).toBe(true);
    expect(b.entries).toEqual([]);
    expect(b.entryCount).toBe(45);
    expect(b.tokens).toBe(12);
    expect(b.rev).toBe("99:7");
    expect(b.extra).toBeUndefined();
    expect(eng.bookEntryCount(b)).toBe(45);
  });

  it("a whole book is not a stub and counts its entries", () => {
    const b = eng.engineLorebookToUI(wholeRaw("a", 4), "a");
    expect(b.stub).toBeUndefined();
    expect(b.entries).toHaveLength(4);
    expect(eng.bookEntryCount(b)).toBe(4);
  });

  it("lorebookToEngine refuses a stub: it would write an empty book", () => {
    expect(() => eng.lorebookToEngine(stubOf("a"))).toThrow(/summary/);
    expect(() => eng.lorebookToEngine(eng.engineLorebookToUI(wholeRaw("a"), "a"))).not.toThrow();
  });

  it("an export refuses a card whose own book is a stub, and carries the whole book's entries", () => {
    const card = { id: "c", name: "C", embeddedLorebookId: "a", linkedLorebookIds: [], tags: [], isGroup: false, altGreetings: [], groupGreetings: [], depthPrompt: { text: "", depth: 4, role: "system" }, colors: {}, stats: [], descVariants: [], personalityVariants: [], scenarioVariants: [], versions: [], gallery: [], expressions: [], altAvatars: [], characterRegexIds: [], voices: [] };
    expect(() => eng.characterToExportCard(card, [stubOf("a", 45)], { markSections: false })).toThrow(/not loaded/);
    const out = eng.characterToExportCard(card, [eng.engineLorebookToUI(wholeRaw("a", 45), "a")], { markSections: false });
    expect(out.data.character_book.entries).toHaveLength(45);
  });
});

describe("keeping a whole book", () => {
  it("a stub with the same rev leaves the whole book in place; a moved rev marks it stale but keeps it", () => {
    const whole = { ...eng.engineLorebookToUI(wholeRaw("a", 45), "a"), rev: "10:1" };
    const same = storeMod.reconcileBooks([whole], [stubOf("a", 45, "10:1")], true);
    expect(same.books[0]).toBe(whole);
    expect(same.stale).toEqual([]);
    const moved = storeMod.reconcileBooks([whole], [stubOf("a", 45, "11:2")], true);
    expect(moved.books[0]).toBe(whole); // no flash of a loading pane while it is fetched again
    expect(moved.stale.map((b: any) => b.id)).toEqual(["a"]);
    const noRev = storeMod.reconcileBooks([whole], [eng.engineLorebookToUI({ ...summaryRaw("a"), rev: undefined }, "a")], true);
    expect(noRev.stale).toHaveLength(1);
  });

  it("a new book arrives as a stub; a book that went away leaves, unless the index is still being built", () => {
    const old = stubOf("old");
    const fresh = stubOf("new");
    expect(storeMod.reconcileBooks([old], [fresh], true).books.map((b: any) => b.id)).toEqual(["new"]);
    expect(storeMod.reconcileBooks([old], [fresh], false).books.map((b: any) => b.id)).toEqual(["new", "old"]);
    expect(storeMod.reconcileBooks([], [fresh], true).books[0].stub).toBe(true);
  });
});

describe("loadBook", () => {
  it("fetches the whole book once for concurrent callers and puts it in place of the stub", async () => {
    useApp.setState({ lorebooks: [stubOf("a", 3, "10:1")] });
    let gets = 0;
    routes = (c) => {
      if (c.method === "GET" && c.path === "/lorebooks/a") { gets++; return json(wholeRaw("a", 3)); }
      return null;
    };
    const [x, y] = await Promise.all([useApp.getState().loadBook("a"), useApp.getState().loadBook("a")]);
    expect(gets).toBe(1);
    expect(x).toBe(y);
    expect(x.stub).toBeUndefined();
    expect(x.entries).toHaveLength(3);
    expect(x.rev).toBe("10:1"); // the summary's rev stays on it: the next list is compared with it
    expect(useApp.getState().lorebooks[0]).toBe(x);
    // a whole book is not fetched again
    expect(await useApp.getState().loadBook("a")).toBe(x);
    expect(gets).toBe(1);
  });

  it("answers null for an unknown id and when the engine does not answer, and keeps the stub", async () => {
    expect(await useApp.getState().loadBook("nope")).toBeNull();
    useApp.setState({ lorebooks: [stubOf("a")] });
    routes = () => json({ error: "boom" }, 500);
    expect(await useApp.getState().loadBook("a")).toBeNull();
    expect(useApp.getState().lorebooks[0].stub).toBe(true);
  });
});

describe("saving never writes a stub", () => {
  const putsOf = () => calls.filter((c) => c.method === "PUT" || c.method === "PATCH");

  it("updateLorebook on a stub loads the book first, then writes it whole with the change", async () => {
    useApp.setState({ lorebooks: [stubOf("a", 3)] });
    routes = (c) => (c.method === "GET" && c.path === "/lorebooks/a" ? json(wholeRaw("a", 3)) : c.method === "PUT" ? json({ ok: true }) : null);
    useApp.getState().updateLorebook("a", { globalActive: true });
    expect(putsOf()).toHaveLength(0); // nothing is written from the summary
    for (let i = 0; i < 10 && !putsOf().length; i++) await tick();
    expect(putsOf()).toHaveLength(1);
    const body = putsOf()[0]!.body;
    expect(body.entries).toHaveLength(3);
    expect(body.entries[1].content).toBe("entry 1");
    expect(body.globalActive).toBe(true);
    expect(body.stub).toBeUndefined();
    expect(body._stub).toBeUndefined();
    expect(body.rev).toBeUndefined();
    expect(useApp.getState().lorebooks[0].globalActive).toBe(true);
  });

  it("updateLorebook on a stub writes nothing when the book cannot be loaded", async () => {
    useApp.setState({ lorebooks: [stubOf("a", 3)] });
    routes = () => json({ error: "down" }, 500);
    useApp.getState().updateLorebook("a", { name: "Renamed" });
    for (let i = 0; i < 5; i++) await tick();
    expect(putsOf()).toHaveLength(0);
    expect(useApp.getState().lorebooks[0].name).toBe("Lore a");
  });

  it("duplicateLorebook on a stub copies the whole book's entries", async () => {
    useApp.setState({ lorebooks: [stubOf("a", 3)] });
    routes = (c) => (c.method === "GET" && c.path === "/lorebooks/a" ? json(wholeRaw("a", 3)) : c.method === "PUT" ? json({ ok: true }) : null);
    const newId = useApp.getState().duplicateLorebook("a");
    for (let i = 0; i < 10 && !putsOf().length; i++) await tick();
    expect(putsOf()).toHaveLength(1);
    expect(putsOf()[0]!.path).toBe("/lorebooks/" + newId);
    expect(putsOf()[0]!.body.entries).toHaveLength(3);
    expect(putsOf()[0]!.body.name).toBe("Lore a (copy)");
    expect(putsOf()[0]!.body.rev).toBeUndefined();
  });

  it("updateLorebook on a whole book writes it at once, entries and all", async () => {
    useApp.setState({ lorebooks: [eng.engineLorebookToUI(wholeRaw("a", 45), "a")] });
    routes = (c) => (c.method === "PUT" ? json({ ok: true }) : null);
    useApp.getState().updateLorebook("a", { name: "New name" });
    await tick();
    expect(putsOf()).toHaveLength(1);
    expect(putsOf()[0]!.body.entries).toHaveLength(45);
  });
});

describe("export loads the card's own book first", () => {
  const card = (embedded: string | null) => ({ id: "c", name: "C", embeddedLorebookId: embedded });

  it("loadOwnBooks fetches the stubbed own books and hands back whole ones", async () => {
    useApp.setState({ lorebooks: [stubOf("a", 45), stubOf("b", 2)] });
    routes = (c) => (c.method === "GET" && c.path === "/lorebooks/a" ? json(wholeRaw("a", 45)) : null);
    const books = await storeMod.loadOwnBooks([card("a"), card("a"), card(null)]);
    expect(calls.filter((c) => c.path === "/lorebooks/a")).toHaveLength(1);
    expect(calls.some((c) => c.path === "/lorebooks/b")).toBe(false); // only the books the cards own
    expect(books.find((b: any) => b.id === "a").entries).toHaveLength(45);
    expect(books.find((b: any) => b.id === "b").stub).toBe(true);
  });

  it("loadOwnBooks throws rather than let an export go out without the book", async () => {
    useApp.setState({ lorebooks: [stubOf("a", 45)] });
    routes = () => json({ error: "down" }, 500);
    await expect(storeMod.loadOwnBooks([card("a")])).rejects.toThrow(/lorebook/);
  });

  it("loadOwnBooks leaves a card with no book in the library alone", async () => {
    useApp.setState({ lorebooks: [] });
    expect(await storeMod.loadOwnBooks([card("gone")])).toEqual([]);
  });
});
