/**
 * What the chat's books hold (#258, #259): `GET /fired-books` sets the chat's lorebooks against the "What fired" log (entries that
 * never fired; not the always-on, switched-off or other chats' ones) and against the entry vectors (how many entries that match by
 * meaning have a usable one, and from which model).
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const engine = (await import(engineUrl)) as { handleRoute: Function; chatBookReport: Function; saveWiVectors: Function; wiEntryHash: Function };

let root: string;
const TOWER = { uid: 1, title: "Tower", keys: ["tower"], content: "An old tower.", enabled: true, order: 100, position: "before_char" };
const GHOST = { uid: 2, title: "Ghost", keys: ["ghost"], content: "A ghost.", enabled: true, order: 100, position: "before_char" };
const RULES = { uid: 0, title: "Rules", keys: [], content: "Always true.", constant: true, enabled: true, order: 100, position: "before_char" };
const OFF = { uid: 3, title: "Hidden", keys: ["hidden"], content: "Not used.", enabled: false, order: 100, position: "before_char" };
const MEANING = { uid: 4, title: "Mood", keys: [], content: "A mood of dread.", status: "vectorized", enabled: true, order: 100, position: "before_char" };
const MEANING2 = { uid: 5, title: "Weather", keys: [], content: "Rain on the roofs.", status: "vectorized", enabled: true, order: 100, position: "before_char" };

const writeBook = (id: string, entries: unknown[], extra: Record<string, unknown> = {}) =>
  fs.writeFileSync(path.join(root, "lorebooks", `${id}.json`), JSON.stringify({ id, name: id === "town" ? "Town" : id, globalActive: false, linkedCharacterIds: [], settings: {}, entries, ...extra }));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "fired-books-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], temperature: 0.8, top_p: 0.95, openai_max_tokens: 512, openai_max_context: 8192 }));
  fs.mkdirSync(path.join(root, "characters", "aria"), { recursive: true });
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista.", personality: "dry", scenario: "night", first_mes: "Welcome in, {{user}}.", mes_example: "" }));
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
  writeBook("town", [RULES, TOWER, GHOST, OFF]);
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

function mockHost() {
  const results: Record<string, unknown> = {};
  const requests: { key: string }[] = [];
  const host = {
    fs: {
      root,
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => {
        const full = path.resolve(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: (key: string) => { requests.push({ key }); }, results, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
    log: () => {},
  };
  const resolve = () => { for (const { key } of requests) results[key] = { text: "MOCK-REPLY", model: "mock/model", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costTotal: 0 } }; };
  return { host, resolve };
}

async function drive(req: { method: string; path: string; body?: unknown }, mock: ReturnType<typeof mockHost>): Promise<{ status: number; json: Record<string, unknown> }> {
  for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as Record<string, unknown>)[k];
  const qIdx = req.path.indexOf("?");
  const query: Record<string, string> = {};
  if (qIdx >= 0) for (const [k, v] of new URLSearchParams(req.path.slice(qIdx + 1))) query[k] = v;
  const call = { method: req.method, path: qIdx >= 0 ? req.path.slice(0, qIdx) : req.path, query, body: req.body };
  let out = engine.handleRoute(call, mock.host) as { status?: number; json?: Record<string, unknown>; __llmPending?: boolean; stash?: Record<string, unknown> };
  for (let pass = 0; out && out.__llmPending && pass < 3; pass++) {
    if (out.stash && typeof out.stash === "object") (call as { stash?: unknown }).stash = out.stash;
    mock.resolve();
    out = engine.handleRoute(call, mock.host) as typeof out;
  }
  return { status: out?.status ?? 200, json: (out?.json ?? {}) as Record<string, unknown> };
}

type Row = { id: string; name: string; off: boolean; entries: number; disabled: number; constant: number; neverTotal: number; never: { uid: number | null; title: string; keys: number; vectorized: boolean }[]; vec: { items: number; have: number; other: number; missing: number } };
type Report = { chatId: string; since: number | null; replies: number; capped: boolean; model: string; books: Row[] };

const newChat = async (m: ReturnType<typeof mockHost>, books = ["town"]) => {
  const id = ((await drive({ method: "POST", path: "/chats", body: { characterId: "aria" } }, m)).json.meta as { id: string }).id;
  await drive({ method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: books } }, m);
  return id;
};
const send = (m: ReturnType<typeof mockHost>, id: string, text: string) => drive({ method: "POST", path: `/chats/${id}/send`, body: { text, model: "mock/model" } }, m);
const report = async (m: ReturnType<typeof mockHost>, id: string) => (await drive({ method: "GET", path: `/fired-books?chatId=${id}` }, m)).json as unknown as Report;

describe("fired-books: entries that never fired (#258)", () => {
  it("before the first reply nothing is called never, but the books and their entries are counted", async () => {
    const m = mockHost();
    const id = await newChat(m);
    const r = await report(m, id);
    expect(r.since).toBeNull();
    expect(r.replies).toBe(0);
    expect(r.books).toHaveLength(1);
    expect(r.books[0]).toMatchObject({ id: "town", name: "Town", entries: 3, disabled: 1, constant: 1, neverTotal: 0, never: [] });
  }, 30_000);

  it("after a reply only the entries the log never saw are named: not the fired one, the always-on one or the switched-off one", async () => {
    const m = mockHost();
    const id = await newChat(m);
    await send(m, id, "We climbed the tower.");
    const r = await report(m, id);
    expect(r.replies).toBe(1);
    expect(typeof r.since).toBe("number");
    expect(r.capped).toBe(false);
    expect(r.books[0].neverTotal).toBe(1);
    expect(r.books[0].never.map((e) => e.title)).toEqual(["Ghost"]);
    expect(r.books[0].never[0]).toMatchObject({ uid: 2, keys: 1, vectorized: false });
  }, 30_000);

  it("a book that is linked but never matched shows every enabled entry; a book switched off on the prompt board is marked", async () => {
    writeBook("far", [{ ...TOWER, uid: 7, title: "Hill", keys: ["hill"], content: "A hill." }, { ...GHOST, uid: 8, title: "Pond", keys: ["pond"], content: "A pond." }]);
    const m = mockHost();
    const id = await newChat(m, ["town", "far"]);
    await drive({ method: "PATCH", path: `/chats/${id}`, body: { promptBoard: { off: ["book:far"] } } }, m);
    await send(m, id, "We climbed the tower.");
    const r = await report(m, id);
    const far = r.books.find((b) => b.id === "far")!;
    expect(far.off).toBe(true);
    expect(far.neverTotal).toBe(2);
    expect(r.books.find((b) => b.id === "town")!.off).toBe(false);
  }, 30_000);

  it("names at most 40 entries of a book but counts them all, and says when the log is full (an entry may only have been dropped for room)", () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({ uid: 100 + i, title: `E${i}`, keys: [`k${i}`], content: `c${i}`, enabled: true }));
    writeBook("big", entries);
    const m = mockHost();
    const meta = { id: "x", lorebookIds: ["big"] };
    const lore: Record<string, unknown> = {};
    for (let i = 0; i < 300; i++) lore[`other:${i}`] = { n: 1, at: 1, t: "t", b: "b", v: {} };
    const full = engine.chatBookReport(m.host.fs, meta, { v: 1, since: 5, replies: 9, lore }) as Report;
    expect(full.capped).toBe(true);
    expect(full.books[0].neverTotal).toBe(60);
    expect(full.books[0].never).toHaveLength(40);
    const some = engine.chatBookReport(m.host.fs, meta, { v: 1, since: 5, replies: 9, lore: { "big:100": { n: 1 } } }) as Report;
    expect(some.capped).toBe(false);
    expect(some.books[0].neverTotal).toBe(59);
  });

  it("an unknown chat is a 404 and a missing chatId a 400", async () => {
    const m = mockHost();
    expect((await drive({ method: "GET", path: "/fired-books?chatId=nope" }, m)).status).toBe(404);
    expect((await drive({ method: "GET", path: "/fired-books" }, m)).status).toBe(400);
  });
});

describe("fired-books: lorebook entry vectors (#259)", () => {
  const vec = (entry: Record<string, unknown>, model?: string) => ({ hash: engine.wiEntryHash(entry), vector: [1, 0], ...(model ? { m: model } : {}) });

  it("counts entries that match by meaning: with a vector, with one of another model, with none", async () => {
    writeBook("mood", [MEANING, MEANING2, { ...MEANING, uid: 6, title: "Edited", content: "Text changed since." }, TOWER]);
    fs.mkdirSync(path.join(root, ".cache"), { recursive: true });
    fs.writeFileSync(path.join(root, ".cache", "embed-status.json"), JSON.stringify({ ok: true, model: "emb/new", checkedAt: Date.now() }));
    const m = mockHost();
    engine.saveWiVectors(m.host.fs, {
      "mood#4": vec(MEANING, "emb/new"),
      "mood#5": vec(MEANING2, "emb/old"),
      // an entry edited after its vector was made counts as having none
      "mood#6": { hash: "stale", vector: [0, 1], m: "emb/new" },
    });
    const id = await newChat(m, ["mood"]);
    const r = await report(m, id);
    expect(r.model).toBe("emb/new");
    expect(r.books[0].vec).toEqual({ items: 3, have: 1, other: 1, missing: 1 });
  }, 30_000);

  it("a chat whose books have no entry by meaning reports zero items", async () => {
    const m = mockHost();
    const id = await newChat(m);
    expect((await report(m, id)).books[0].vec).toEqual({ items: 0, have: 0, other: 0, missing: 0 });
  }, 30_000);

  it("a vector from before models were recorded counts as another model's once the model is known", async () => {
    writeBook("mood", [MEANING]);
    fs.mkdirSync(path.join(root, ".cache"), { recursive: true });
    fs.writeFileSync(path.join(root, ".cache", "embed-status.json"), JSON.stringify({ ok: true, model: "emb/new", checkedAt: Date.now() }));
    const m = mockHost();
    engine.saveWiVectors(m.host.fs, { "mood#4": vec(MEANING) });
    const id = await newChat(m, ["mood"]);
    expect((await report(m, id)).books[0].vec).toEqual({ items: 1, have: 0, other: 1, missing: 0 });
  }, 30_000);
});
