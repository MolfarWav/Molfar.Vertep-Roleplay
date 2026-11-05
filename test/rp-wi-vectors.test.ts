/**
 * Vectorized lorebook entries (#184): the threshold follows the book (cosine floors differ by model, #216),
 * a book keeps at most topK hits, vectors know their model, a vector still obeys the secondary keys.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const engine = (await import(engineUrl)) as { wiVectorHits: Function; WI_VEC: Record<string, number>; handleRoute: Function };

/** A unit vector whose cosine to [1, 0] is c. */
const at = (c: number) => [c, Math.sqrt(1 - c * c)];
const SCAN = [1, 0];
const item = (id: string, bookId = "b", vec: Record<string, unknown> | undefined = undefined) =>
  ({ id: `${bookId}#${id}`, bookId, vec, entry: { status: "vectorized" } });
const mapOf = (cs: Record<string, number>, bookId = "b", m?: string) =>
  Object.fromEntries(Object.entries(cs).map(([k, c]) => [`${bookId}#${k}`, { hash: "h", vector: at(c), ...(m ? { m } : {}) }]));

describe("wiVectorHits", () => {
  const crowd = { a: 0.4, b: 0.45, c: 0.38, d: 0.42, e: 0.41, f: 0.44, g: 0.4, h: 0.43 };

  it("lets in the entry that stands out from the book, not the ones on its floor", () => {
    const cs = { ...crowd, hit: 0.85 };
    const items = Object.keys(cs).map((k) => item(k));
    const hits = engine.wiVectorHits(items, mapOf(cs), SCAN, "");
    expect([...hits.keys()]).toEqual(["b#hit"]);
    expect(hits.get("b#hit")).toBe(0.85);
  });

  it("a floor of 0.7 (a model whose unrelated text sits high) needs no different setting", () => {
    const cs = { a: 0.7, b: 0.72, c: 0.69, d: 0.71, e: 0.7, f: 0.73, hit: 0.93 };
    const hits = engine.wiVectorHits(Object.keys(cs).map((k) => item(k)), mapOf(cs), SCAN, "");
    expect([...hits.keys()]).toEqual(["b#hit"]);
  });

  it("nothing stands out: nothing fires", () => {
    const cs = { a: 0.5, b: 0.5, c: 0.51, d: 0.5, e: 0.49, f: 0.5 };
    const hits = engine.wiVectorHits(Object.keys(cs).map((k) => item(k)), mapOf(cs), SCAN, "");
    expect(hits.size).toBe(0);
  });

  it("a book of fewer than 4 vectors has nothing to compare with: a fixed 0.55", () => {
    const cs = { a: 0.6, b: 0.5 };
    const hits = engine.wiVectorHits(Object.keys(cs).map((k) => item(k)), mapOf(cs), SCAN, "");
    expect([...hits.keys()]).toEqual(["b#a"]);
  });

  it("the book's old scoreThreshold (every book carries 0.35) is not used unless thresholdMode is fixed", () => {
    const cs = { a: 0.4, b: 0.45 };
    const old = { scoreThreshold: 0.35, topK: 10 };
    expect(engine.wiVectorHits(Object.keys(cs).map((k) => item(k, "b", old)), mapOf(cs), SCAN, "").size).toBe(0);
    const fixed = { ...old, thresholdMode: "fixed" };
    expect(engine.wiVectorHits(Object.keys(cs).map((k) => item(k, "b", fixed)), mapOf(cs), SCAN, "").size).toBe(2);
  });

  it("keeps at most topK per book, best first", () => {
    const cs = { a: 0.9, b: 0.8, c: 0.7, d: 0.6 };
    const vec = { thresholdMode: "fixed", scoreThreshold: 0.5, topK: 2 };
    const hits = engine.wiVectorHits(Object.keys(cs).map((k) => item(k, "b", vec)), mapOf(cs), SCAN, "");
    expect([...hits.keys()]).toEqual(["b#a", "b#b"]);
  });

  it("books are judged on their own", () => {
    const x = mapOf({ a: 0.6 }, "x");
    const y = mapOf({ a: 0.4 }, "y");
    const hits = engine.wiVectorHits([item("a", "x"), item("a", "y")], { ...x, ...y }, SCAN, "");
    expect([...hits.keys()]).toEqual(["x#a"]);
  });

  it("leaves out vectors of another model, and of an unknown one once the scan's model is known", () => {
    const items = [item("a")];
    expect(engine.wiVectorHits(items, mapOf({ a: 0.9 }, "b", "m1"), SCAN, "m1").size).toBe(1);
    expect(engine.wiVectorHits(items, mapOf({ a: 0.9 }, "b", "m1"), SCAN, "m2").size).toBe(0);
    expect(engine.wiVectorHits(items, mapOf({ a: 0.9 }), SCAN, "m2").size).toBe(0);
    expect(engine.wiVectorHits(items, mapOf({ a: 0.9 }), SCAN, "").size).toBe(1); // no model reported: as before
  });

  it("entries that are not vectorized never join, and a vector of another size is skipped", () => {
    const plain = { id: "b#p", bookId: "b", vec: undefined, entry: {} };
    const map = { ...mapOf({ p: 0.99 }), "b#odd": { hash: "h", vector: [1, 0, 0] } };
    const odd = { id: "b#odd", bookId: "b", vec: undefined, entry: { vectorized: true } };
    expect(engine.wiVectorHits([plain, odd], map, SCAN, "").size).toBe(0);
  });
});

// ---------- through the engine ----------
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "wiv-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], temperature: 0.8, openai_max_tokens: 512, openai_max_context: 8192 }));
  fs.mkdirSync(path.join(root, "characters", "aria"), { recursive: true });
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista.", personality: "dry", scenario: "night", first_mes: "Welcome in.", mes_example: "" }));
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

const writeJson = (rel: string, v: unknown) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(v));
};
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

function mockHost(state: { model: string }) {
  const results: Record<string, unknown> = {};
  const embedResults: Record<string, unknown> = {};
  const embedInfo: Record<string, unknown> = {};
  const requests: { key: string }[] = [];
  const embedRequests: { key: string; req: { texts: string[] } }[] = [];
  const resolve = () => {
    for (const k of Object.keys(embedResults)) delete embedResults[k];
    for (const { key } of requests) results[key] = { text: "OK", model: "mock/model", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costTotal: 0 } };
    for (const { key, req } of embedRequests) {
      embedResults[key] = req.texts.map((t) => (t.includes("harbor") ? [1, 0] : [0, 1]));
      embedInfo[key] = { model: state.model, via: "mock" };
    }
  };
  const host = {
    fs: {
      root,
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: {
      request: (key: string, req: Record<string, unknown>) => { requests.push({ key, ...{ req } } as never); },
      results, embed: (key: string, req: { texts: string[] }) => { embedRequests.push({ key, req }); }, embedResults, embedInfo,
    },
    net: { request: () => {}, results: {} },
    zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
    log: () => {},
  };
  return { host, requests, embedRequests, resolve };
}
async function drive(req: { method: string; path: string; body?: unknown }, mock: ReturnType<typeof mockHost>) {
  const results = mock.host.llm.results as Record<string, unknown>;
  for (const k of Object.keys(results)) delete results[k];
  for (const k of Object.keys(mock.host.llm.embedResults)) delete (mock.host.llm.embedResults as Record<string, unknown>)[k];
  const call: Record<string, unknown> = { method: req.method, path: req.path, query: {}, body: req.body };
  let out = engine.handleRoute(call, mock.host) as { json?: Record<string, unknown>; __llmPending?: boolean; stash?: Record<string, unknown> };
  let passes = 1;
  while (out && out.__llmPending && passes < 3) {
    if (out.stash && typeof out.stash === "object") call.stash = out.stash;
    mock.resolve();
    out = engine.handleRoute(call, mock.host) as typeof out;
    passes++;
  }
  return (out?.json ?? {}) as Record<string, unknown>;
}
async function preview(m: ReturnType<typeof mockHost>, id: string, userText: string) {
  const j = await drive({ method: "POST", path: "/prompt/preview", body: { chatId: id, userText } }, m);
  return (j.messages as { content: string }[]).map((x) => x.content).join("\n");
}
async function setup(entry: Record<string, unknown>, m: ReturnType<typeof mockHost>) {
  writeJson("lorebooks/vb.json", {
    id: "vb", name: "vb", vectorized: { scoreThreshold: 0.35, topK: 10 },
    entries: [{ uid: 0, title: "Harbor", keys: [], content: "The harbor district floods every spring.", enabled: true, order: 100, position: "before_char", status: "vectorized", ...entry }],
  });
  await drive({ method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
  const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
  await drive({ method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["vb"] } }, m);
  return id;
}

describe("vectorized entries through the engine", () => {
  it("the cache records the model, and a new model makes the entry vector again", async () => {
    const state = { model: "embed-a" };
    const m = mockHost(state);
    const id = await setup({}, m);
    const first = await preview(m, id, "harbor at night");
    expect(first).toContain("harbor district floods");
    expect(readJson("lorebooks/.vectors.json")["vb#0"].m).toBe("embed-a");
    expect(readJson("embed-status.json").model).toBe("embed-a");
    m.embedRequests.length = 0;
    await preview(m, id, "harbor again");
    expect(m.embedRequests.at(-1)!.req.texts.length).toBe(1); // only the scan: the entry is cached

    state.model = "embed-b";
    m.embedRequests.length = 0;
    await preview(m, id, "harbor once more"); // the scan embeds with b, the entry vector is from a: left out this turn
    await preview(m, id, "harbor yet again");
    expect(m.embedRequests.some((r) => r.req.texts.some((t) => t.includes("floods every spring")))).toBe(true);
    expect(readJson("lorebooks/.vectors.json")["vb#0"].m).toBe("embed-b");
  }, 30_000);

  it("the entry's title goes into its vector text", async () => {
    const m = mockHost({ model: "embed-a" });
    const id = await setup({ title: "Harbor floods" }, m);
    await preview(m, id, "harbor at night");
    const texts = m.embedRequests.flatMap((r) => r.req.texts);
    expect(texts.some((t) => t.startsWith("Harbor floods\nThe harbor district"))).toBe(true);
    // what is searched for is a query, what is stored is a document (a model with prefixes needs the difference)
    const req = m.embedRequests[0]!.req as { texts: string[]; kinds?: string[] };
    expect(req.kinds).toEqual(["query", "document"]);
  }, 30_000);

  it("a vector does not skip the secondary keys", async () => {
    const m = mockHost({ model: "embed-a" });
    const id = await setup({ secondaryKeys: ["moon"] }, m);
    expect(await preview(m, id, "harbor at night")).not.toContain("harbor district floods");
    expect(await preview(m, id, "harbor under the moon")).toContain("harbor district floods");
  }, 30_000);
});
