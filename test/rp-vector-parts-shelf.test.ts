/**
 * #267: the Data Bank file's vectors and the lorebook vector cache pass the engine's 4 MB plugin write cap the same way a chat's
 * vectors did (#266), so they go on in `<name>.p2.json`, ... too. The engine plugin deletes and edits the shelf's files, so its side is
 * tested here as well.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { L, env, useRoot, mockHost, readJson, writeJson, exists } from "./rp-memory-m2-kit";

useRoot();

const engine = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as Record<string, any>;
const LIMIT = 4 * 1024 * 1024;
const bigVec = (seed: number, dim = 3072) => Array.from({ length: dim }, (_, i) => Math.sin(seed * 12.9898 + i * 0.37) * 0.0321);

function limited(m: ReturnType<typeof mockHost>) {
  const write = m.host.fs.write;
  m.host.fs.write = (rel: string, content: string) => {
    if (Buffer.byteLength(content) >= LIMIT) throw new Error("fs.write content too large (4MB)");
    write(rel, content);
  };
}
const mk = () => {
  const m = mockHost();
  (m.host.fs as any).root = env.root;
  limited(m);
  return m;
};
const call = (m: ReturnType<typeof mk>, method: string, p: string, body?: unknown) => {
  const out = engine.handleRoute({ method, path: p, query: {}, body }, m.host) as { status?: number; json: any };
  return { status: out.status ?? 200, json: out.json };
};
const names = (dir: string, prefix: string) => (exists(dir) ? fs.readdirSync(path.join(env.root, dir)).filter((f) => f.startsWith(prefix)).sort() : []);
const read = (dir: string, f: string) => fs.readFileSync(path.join(env.root, dir, f), "utf8");

/** A Data Bank file of n passages, and its vectors written the way Litopys writes them. */
function shelfFile(m: ReturnType<typeof mk>, name: string, n: number) {
  const id = name;
  const chunks = Array.from({ length: n }, (_, i) => ({ i, text: `Passage ${i} names Aria and the mill.` }));
  writeJson(`databank/${id}.json`, { id, name, kind: "snapshot", scope: "chat", enabled: true, addedAt: 1, size: 1, chunks });
  const file = { id, chunks };
  const batch = chunks.map((c) => ({ i: c.i }));
  return { id, file, chunks, stored: () => L.finishShelf(m.host.fs, file, batch, chunks.map((_, k) => bigVec(k)), "text-embedding-3-large", 3072) };
}

describe("Data Bank vectors of a long file", () => {
  it("200 passages of 3072 numbers go on in extra files under the cap, and read back whole", () => {
    const m = mk();
    const s = shelfFile(m, "long", 200);
    expect(s.chunks.length).toBe(200);
    expect(s.stored()).toBe(200);
    const files = names("databank-vectors", s.id);
    expect(files.length).toBeGreaterThan(1);
    for (const f of files) expect(fs.statSync(path.join(env.root, "databank-vectors", f)).size).toBeLessThan(LIMIT);
    expect(readJson(`databank-vectors/${s.id}.json`)._more).toBe(files.length - 1);
    expect(readJson(`databank-vectors/${s.id}.json`).m).toBe("text-embedding-3-large");
    expect(L.shelfGaps(m.host.fs, s.file, "text-embedding-3-large", 999)).toEqual([]);
  });

  it("the engine forgets one passage's vector in the file that has it, and only there", () => {
    const m = mk();
    const s = shelfFile(m, "long2", 200);
    s.stored();
    const files = names("databank-vectors", s.id);
    const last = readJson(`databank-vectors/${files[files.length - 1]}`);
    const inLast = Object.keys(last.chunks)[0];
    const before = files.map((f) => read("databank-vectors", f));
    expect(call(m, "PATCH", `/databank/${s.id}`, { chunk: { i: Number(inLast), text: "Rewritten passage about Aria." } }).status).toBe(200);
    const after = files.map((f) => read("databank-vectors", f));
    expect(after.filter((t, k) => t !== before[k]).length).toBe(1);
    const gaps = L.shelfGaps(m.host.fs, { id: s.id, chunks: readJson(`databank/${s.id}.json`).chunks }, "text-embedding-3-large", 999);
    expect(gaps.map((g: any) => g.i)).toEqual([Number(inLast)]);
  });

  it("deleting the file takes the extra files with it", () => {
    const m = mk();
    const s = shelfFile(m, "long3", 200);
    s.stored();
    expect(names("databank-vectors", s.id).length).toBeGreaterThan(1);
    expect(call(m, "DELETE", `/databank/${s.id}`).status).toBe(200);
    expect(names("databank-vectors", s.id)).toEqual([]);
  });

  it("another model replaces the file as a whole and leaves no extra file of the old one", () => {
    const m = mk();
    const s = shelfFile(m, "long4", 200);
    s.stored();
    const few = s.chunks.slice(0, 3);
    expect(L.finishShelf(m.host.fs, { id: s.id, chunks: few }, few.map((c) => ({ i: c.i })), few.map((_, k) => bigVec(k, 8)), "other-model", 8)).toBe(3);
    expect(names("databank-vectors", s.id)).toEqual([`${s.id}.json`]);
  });

  it("a small file stays one file, as before", () => {
    const m = mk();
    const s = shelfFile(m, "small", 3);
    s.stored();
    expect(names("databank-vectors", s.id)).toEqual([`${s.id}.json`]);
    expect(readJson(`databank-vectors/${s.id}.json`)._more).toBeUndefined();
  });
});

describe("the lorebook vector cache", () => {
  const entries = (n: number, from = 0) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`book#${from + i}`, { hash: "h" + i, vector: bigVec(from + i), m: "m" }]));

  it("150 vectors of 3072 numbers are kept in extra files and read back; no error is left", () => {
    const m = mk();
    engine.saveWiVectors(m.host.fs, entries(150));
    expect(names("lorebooks", ".vectors").length).toBeGreaterThan(1);
    expect(exists("lorebooks/.vectors-error.json")).toBe(false);
    const back = engine.loadWiVectors(m.host.fs);
    expect(Object.keys(back).length).toBe(150);
    expect(back["book#149"].vector.length).toBe(3072);
    expect(back["book#7"].m).toBe("m");
  });

  it("an old pretty-printed cache over 4 MB is read, and the next save splits it", () => {
    const m = mk();
    fs.mkdirSync(path.join(env.root, "lorebooks"), { recursive: true });
    fs.writeFileSync(path.join(env.root, "lorebooks/.vectors.json"), JSON.stringify(entries(110), null, 2));
    expect(fs.statSync(path.join(env.root, "lorebooks/.vectors.json")).size).toBeGreaterThan(LIMIT);
    const map = engine.loadWiVectors(m.host.fs);
    expect(Object.keys(map).length).toBe(110);
    map["book#new"] = { hash: "n", vector: bigVec(999), m: "m" };
    engine.saveWiVectors(m.host.fs, map);
    expect(fs.statSync(path.join(env.root, "lorebooks/.vectors.json")).size).toBeLessThan(LIMIT);
    expect(Object.keys(engine.loadWiVectors(m.host.fs)).length).toBe(111);
  });

  it("a write that fails does not break the caller and leaves a note until the next good save", () => {
    const m = mk();
    const write = m.host.fs.write;
    m.host.fs.write = (rel: string, c: string) => {
      if (rel.startsWith("lorebooks/.vectors.")) throw new Error("disk full");
      write(rel, c);
    };
    expect(() => engine.saveWiVectors(m.host.fs, entries(2))).not.toThrow();
    expect(readJson("lorebooks/.vectors-error.json").error).toContain("disk full");
    m.host.fs.write = write;
    engine.saveWiVectors(m.host.fs, entries(2));
    expect(exists("lorebooks/.vectors-error.json")).toBe(false);
  });

  it("the extra files are not listed as books", () => {
    const m = mk();
    engine.saveWiVectors(m.host.fs, entries(150));
    const r = call(m, "GET", "/lorebooks");
    expect(JSON.stringify(r.json)).not.toContain(".vectors");
  });
});
