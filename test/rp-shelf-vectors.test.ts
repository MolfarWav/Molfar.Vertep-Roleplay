/**
 * #184 DB-vec: the Data Bank shelf matched by meaning. Litopys embeds the passages of every file on a click
 * (`databank-vectors/<id>.json`, one model per file); the engine ranks with them the passages the words already let in,
 * and forgets a vector when its passage changes.
 */
import { describe, expect, it } from "bun:test";
import { L, useRoot, env, writeJson, readJson, exists, mockHost, tick } from "./rp-memory-m2-kit";

useRoot();

const engine = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as Record<string, any>;

const mk = () => {
  const m = mockHost();
  (m.host.fs as any).root = env.root;
  return m;
};
const call = (m: ReturnType<typeof mk>, method: string, path: string, body?: unknown, query: Record<string, string> = {}) => {
  const out = engine.handleRoute({ method, path, query, body }, m.host) as { status?: number; json: any };
  return { status: out.status ?? 200, json: out.json };
};
/** A plain file of N short passages, each naming Aria, so the words let every one in. Returns the file id. */
function upload(m: ReturnType<typeof mk>, name: string, passages: string[]) {
  const r = call(m, "POST", "/databank", { name, content: passages.join("\n\n") });
  return r.json.file.id as string;
}
const chunksOf = (id: string) => readJson(`databank/${id}.json`).chunks as { i: number; text: string }[];
const shelf = (m: ReturnType<typeof mk>) => L.handleRoute({ method: "GET", path: "/litopys/shelf" }, m.host);
const click = (m: ReturnType<typeof mk>, fileId?: string) => L.handleRoute({ method: "POST", path: "/litopys/shelf", body: fileId ? { fileId } : {} }, m.host);

const TEXTS = [
  "Aria hid the silver pendant in the cellar of the old mill.",
  "Aria sold her horse at the autumn fair for a small purse.",
  "Aria never learned to swim, and she avoids the river bridge.",
  "Aria keeps a diary under a loose board in her room.",
  "Aria mistrusts the duke since the night of the fire.",
];

describe("filling the shelf: GET/POST /litopys/shelf", () => {
  it("is empty with no files, and spends nothing until it is posted", () => {
    const m = mk();
    expect(shelf(m).json).toMatchObject({ chatId: "shelf", state: "empty", items: 0 });
    tick(m);
    expect(m.embeds).toHaveLength(0);
  });

  it("counts the passages of every file, none embedded yet, with a line per file", () => {
    const m = mk();
    const a = upload(m, "Lore", TEXTS);
    const b = upload(m, "Map", ["The road runs north from the harbour to the pass."]);
    const v = shelf(m).json;
    expect(v).toMatchObject({ state: "none", have: 0, missing: v.items, other: 0 });
    expect(v.items).toBe(chunksOf(a).length + chunksOf(b).length);
    expect(v.files.map((f: any) => f.name).sort()).toEqual(["Lore", "Map"]);
    expect(v.tokens).toBeGreaterThan(0);
  });

  it("one click fills every file, stores the model once per file, and ends with state 'all'", () => {
    const m = mk();
    const a = upload(m, "Lore", TEXTS);
    const b = upload(m, "Map", ["The road runs north."]);
    expect(click(m).json.state).toBe("working");
    m.host.llm.embedInfo = { [`lit_db_${a}`]: { model: "mock-embed", via: "Mock" }, [`lit_db_${b}`]: { model: "mock-embed", via: "Mock" } };
    // one file a tick: the engine answers one embed at a time
    for (let i = 0; i < 4; i++) tick(m);
    for (const id of [a, b]) {
      const vf = readJson(`databank-vectors/${id}.json`);
      expect(vf.m).toBe("mock-embed");
      expect(Object.keys(vf.chunks).sort()).toEqual(chunksOf(id).map((c) => String(c.i)).sort());
    }
    expect(shelf(m).json).toMatchObject({ state: "all", missing: 0, model: "mock-embed", via: "Mock" });
    expect(exists(`litopys/embed-want/db_${a}.json`)).toBe(false);
  });

  it("a click on one file leaves the others alone", () => {
    const m = mk();
    const a = upload(m, "Lore", TEXTS);
    const b = upload(m, "Map", ["The road runs north."]);
    click(m, b);
    m.host.llm.embedInfo = { [`lit_db_${b}`]: { model: "mock-embed", via: "Mock" } };
    tick(m);
    expect(exists(`databank-vectors/${b}.json`)).toBe(true);
    expect(exists(`databank-vectors/${a}.json`)).toBe(false);
    expect(shelf(m).json.state).toBe("partial");
  });

  it("goes on in batches of 64", () => {
    const m = mk();
    const id = upload(m, "Big", Array.from({ length: 70 }, (_, i) => `Aria visited place number ${i} on the long road.`));
    // the upload joins short passages into larger chunks: build the many-passage file by hand
    const f = readJson(`databank/${id}.json`);
    f.chunks = Array.from({ length: 70 }, (_, i) => ({ i, text: `Aria visited place number ${i}.` }));
    writeJson(`databank/${id}.json`, f);
    click(m);
    m.host.llm.embedInfo = { [`lit_db_${id}`]: { model: "mock-embed", via: "Mock" } };
    tick(m);
    expect(m.embeds.map((e) => e.texts.length)).toEqual([64, 6]);
    expect(shelf(m).json).toMatchObject({ state: "all", items: 70, have: 70 });
  });

  it("a failed call ends the request and says failing", () => {
    const m = mk();
    upload(m, "Lore", TEXTS);
    (m as any).embedder = () => null;
    click(m);
    tick(m);
    expect(shelf(m).json.state).toBe("failing");
    expect(m.embeds).toHaveLength(1);
  });

  it("vectors of another model are 'other' and are replaced as a whole file", () => {
    const m = mk();
    const id = upload(m, "Lore", TEXTS);
    const idx = chunksOf(id).map((c) => c.i);
    writeJson("litopys/embed-status.json", { ok: true, checkedAt: Date.now(), model: "new-model", via: "Local", dim: 2 });
    writeJson(`databank-vectors/${id}.json`, { v: 1, m: "old-model", dim: 2, chunks: Object.fromEntries(idx.map((i) => [String(i), [0.1, 0.2]])) });
    expect(shelf(m).json).toMatchObject({ state: "other", other: idx.length });
    click(m);
    m.host.llm.embedInfo = { [`lit_db_${id}`]: { model: "new-model", via: "Local" } };
    tick(m);
    expect(readJson(`databank-vectors/${id}.json`).m).toBe("new-model");
    expect(shelf(m).json.state).toBe("all");
  });

  it("a bad file id is refused", () => {
    const m = mk();
    expect(click(m, "../x").status).toBe(400);
  });
});

describe("ranking by meaning: searchDatabank", () => {
  // five passages that all name Aria, so the words let every one in; the asked-about one is the pendant, which the query's words barely touch
  const setup = (model = "mock-embed") => {
    const m = mk();
    const id = upload(m, "Lore", ["x"]);
    const f = readJson(`databank/${id}.json`);
    f.chunks = TEXTS.map((text, i) => ({ i, text }));
    writeJson(`databank/${id}.json`, f);
    // unit vectors on a circle: passage k at angle k * 70 degrees; the scan window sits on passage 2
    const at = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
    writeJson(`databank-vectors/${id}.json`, { v: 1, m: model, dim: 2, chunks: Object.fromEntries(TEXTS.map((_, i) => [String(i), at(i * 70)])) });
    return { m, id, scan: at(2 * 70) };
  };
  const fsx = (m: ReturnType<typeof mk>) => m.host.fs;
  // "Aria" alone: every passage matches by words; the shortest passage wins on density
  const lexical = (m: ReturnType<typeof mk>) => engine.searchDatabank(fsx(m), "Aria", 5, { chatId: "c" }).map((h: any) => h.chunkIndex);

  it("with no scan vector nothing changes", () => {
    const { m } = setup();
    const order = lexical(m);
    expect(order).toHaveLength(5);
    const info: any = { scoped: [], hidden: 0, sem: null };
    expect(engine.searchDatabank(fsx(m), "Aria", 5, { chatId: "c", scanVec: null }, info).map((h: any) => h.chunkIndex)).toEqual(order);
    expect(info.sem).toBeNull();
  });

  it("the passage nearest the scan window moves up", () => {
    const { m, scan } = setup();
    const before = lexical(m);
    expect(before[0]).not.toBe(2);
    const info: any = { scoped: [], hidden: 0, sem: null };
    const after = engine.searchDatabank(fsx(m), "Aria", 5, { chatId: "c", scanVec: scan, scanModel: "mock-embed" }, info);
    expect(after[0].chunkIndex).toBe(2);
    expect(info.sem).toEqual({ ranked: true, have: 5, seen: 5 });
  });

  it("a vector never lets in a passage the words did not", () => {
    const { m, id, scan } = setup();
    const f = readJson(`databank/${id}.json`);
    f.chunks.push({ i: 5, text: "The weather over the western sea was calm." });
    writeJson(`databank/${id}.json`, f);
    const vf = readJson(`databank-vectors/${id}.json`);
    vf.chunks["5"] = scan; // a perfect match by meaning, no word in common with the query
    writeJson(`databank-vectors/${id}.json`, vf);
    const hits = engine.searchDatabank(fsx(m), "Aria", 10, { chatId: "c", scanVec: scan, scanModel: "mock-embed" });
    expect(hits.map((h: any) => h.chunkIndex)).not.toContain(5);
  });

  it("vectors of another model than the scan window's are not used", () => {
    const { m, scan } = setup("old-model");
    const info: any = { scoped: [], hidden: 0, sem: null };
    const hits = engine.searchDatabank(fsx(m), "Aria", 5, { chatId: "c", scanVec: scan, scanModel: "new-model" }, info);
    expect(hits.map((h: any) => h.chunkIndex)).toEqual(lexical(m));
    expect(info.sem).toEqual({ ranked: false, have: 0, seen: 5 });
  });

  it("a file with no vectors keeps its words-only order", () => {
    const { m, id, scan } = setup();
    call(m, "DELETE", `/databank/${id}`);
    const none = upload(m, "Plain", TEXTS.slice(0, 1));
    expect(none).toBeTruthy();
    const info: any = { scoped: [], hidden: 0, sem: null };
    const hits = engine.searchDatabank(fsx(m), "Aria", 5, { chatId: "c", scanVec: scan, scanModel: "mock-embed" }, info);
    expect(hits.length).toBeGreaterThan(0);
    expect(info.sem).toMatchObject({ ranked: false, have: 0 });
  });
});

describe("a changed passage forgets its vector", () => {
  const seedBook = () => {
    const m = mk();
    const id = "snap1";
    writeJson(`databank/${id}.json`, {
      id, name: "Book", scope: "chat", scopeTargetId: "c1", scopeChatIds: ["c1"], enabled: true, addedAt: 1, size: 20, kind: "snapshot",
      chunks: [{ i: 0, text: "First passage.", kind: "fact", ref: "f1" }, { i: 1, text: "Second passage.", kind: "fact", ref: "f2" }],
    });
    writeJson(`databank-vectors/${id}.json`, { v: 1, m: "mock-embed", dim: 2, chunks: { "0": [1, 0], "1": [0, 1] } });
    return { m, id };
  };

  it("editing the text drops that vector only; the next fill makes a new one", () => {
    const { m, id } = seedBook();
    expect(call(m, "PATCH", `/databank/${id}`, { chunk: { i: 1, text: "Second passage, rewritten." } }).status).toBe(200);
    expect(Object.keys(readJson(`databank-vectors/${id}.json`).chunks)).toEqual(["0"]);
    expect(shelf(m).json).toMatchObject({ state: "partial", have: 1, missing: 1 });
  });

  it("dropping a passage drops its vector", () => {
    const { m, id } = seedBook();
    call(m, "PATCH", `/databank/${id}`, { chunk: { i: 0, drop: true } });
    expect(Object.keys(readJson(`databank-vectors/${id}.json`).chunks)).toEqual(["1"]);
  });

  it("deleting the file deletes its vectors", () => {
    const { m, id } = seedBook();
    call(m, "DELETE", `/databank/${id}`);
    expect(exists(`databank-vectors/${id}.json`)).toBe(false);
  });
});

describe("a reply embeds its scan window when the shelf has vectors", () => {
  it("semanticEmbedWork wants the scan only if something can be ranked", () => {
    const m = mk();
    const meta = { id: "chatx" };
    expect(engine.semanticEmbedWork(m.host.fs, meta, [], "hello there")).toBeNull();
    writeJson("databank-vectors/f1.json", { v: 1, m: "mock-embed", dim: 2, chunks: {} });
    expect(engine.semanticEmbedWork(m.host.fs, meta, [], "hello there")).toMatchObject({ wantScan: true });
    expect(engine.semanticEmbedWork(m.host.fs, meta, [], "  ")).toBeNull();
  });
});
