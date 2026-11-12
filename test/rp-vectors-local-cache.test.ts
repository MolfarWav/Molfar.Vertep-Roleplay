/**
 * Molfar.Vertep#374: the vectors of matching by meaning (a chat's Litopys vectors, the lorebook vectors, the Data Bank vectors) and the
 * "does embedding work here" status live in the local cache (`.cache/`, which sync, git and backups leave out), so two devices on two models
 * never rewrite each other's files. What an older version kept in the synced folders is moved over the first time it is read.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { L, env, useRoot, mockHost, readJson, writeJson, exists } from "./rp-memory-m2-kit";

useRoot();

const engine = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as Record<string, any>;
const mk = () => {
  const m = mockHost();
  (m.host.fs as any).root = env.root;
  return m;
};
const vec = (hash: string, m = "bge-m3") => ({ hash, vector: [0.1, 0.2, 0.3], m });

describe("vectors live in the local cache", () => {
  it("a chat's vectors are written under .cache and nothing appears in the synced litopys folder", () => {
    const m = mk();
    L.saveVectors(m.host.fs, "chatA", { c1: vec("h1") });
    expect(exists(".cache/litopys/vectors/chatA.json")).toBe(true);
    expect(exists("litopys/vectors/chatA.json")).toBe(false);
    expect(L.loadVectors(m.host.fs, "chatA").c1.hash).toBe("h1");
  });

  it("vectors an older version left in the synced folder are copied over once and stay where they were (#389), with their extra files", () => {
    const m = mk();
    writeJson("litopys/vectors/old1.json", { c1: vec("h1"), _more: 1 });
    writeJson("litopys/vectors/old1.p2.json", { c2: vec("h2") });
    const got = L.loadVectors(m.host.fs, "old1");
    expect(Object.keys(got).sort()).toEqual(["c1", "c2"]);
    expect(exists(".cache/litopys/vectors/old1.json")).toBe(true);
    expect(exists(".cache/litopys/vectors/old1.p2.json")).toBe(true);
    // the old copies stay: a removal would travel through the sync and wipe the vectors of a device not updated yet (#389)
    expect(exists("litopys/vectors/old1.json")).toBe(true);
    expect(exists("litopys/vectors/old1.p2.json")).toBe(true);
    // the next read comes from the cache
    expect(Object.keys(L.loadVectors(m.host.fs, "old1")).sort()).toEqual(["c1", "c2"]);
  });

  it("a local file is never replaced by an older synced one that arrives later", () => {
    const m = mk();
    L.saveVectors(m.host.fs, "chatB", { mine: vec("m1") });
    writeJson("litopys/vectors/chatB.json", { theirs: vec("t1", "qwen/qwen3-embedding-4b") });
    expect(Object.keys(L.loadVectors(m.host.fs, "chatB"))).toEqual(["mine"]);
  });

  it("the cleanup removes the vectors of a chat that is gone, from both places", () => {
    const m = mk();
    writeJson(".cache/litopys/vectors/gone1.json", { c1: vec("h") });
    writeJson("litopys/vectors/gone2.json", { c1: vec("h") });
    L.pruneOrphans(m.host.fs, { chats: {} }, ["live.jsonl"]);
    expect(exists(".cache/litopys/vectors/gone1.json")).toBe(false);
    expect(exists("litopys/vectors/gone2.json")).toBe(false);
  });

  it("the lorebook vectors are written under .cache/lorebooks; an old synced cache is copied over once and stays", () => {
    const m = mk();
    writeJson("lorebooks/.vectors.json", { "book#0": vec("h") });
    expect(Object.keys(engine.loadWiVectors(m.host.fs))).toEqual(["book#0"]);
    expect(exists(".cache/lorebooks/.vectors.json")).toBe(true);
    expect(exists("lorebooks/.vectors.json")).toBe(true);
    engine.saveWiVectors(m.host.fs, { "book#1": vec("h1") });
    expect(Object.keys(readJson("lorebooks/.vectors.json"))).toEqual(["book#0"]); // the old copy is never written again
    expect(Object.keys(readJson(".cache/lorebooks/.vectors.json"))).toEqual(["book#1"]);
  });

  it("a Data Bank file's vectors are copied over once, and the engine finds them in the cache", () => {
    const m = mk();
    writeJson("databank-vectors/f1.json", { v: 1, m: "bge-m3", dim: 3, chunks: { "0": [0.1, 0.2, 0.3] } });
    const got = engine.semanticEmbedWork(m.host.fs, { id: "chatx" }, [], "hello there");
    expect(got).toMatchObject({ wantScan: true }); // an old synced file already counts
    const vf = L.finishShelf(m.host.fs, { id: "f1", chunks: [{ i: 1, text: "x" }] }, [{ i: 1 }], [[0.4, 0.5, 0.6]], "bge-m3", 3);
    expect(vf).toBe(1);
    expect(exists("databank-vectors/f1.json")).toBe(true);
    expect(Object.keys(readJson(".cache/databank-vectors/f1.json").chunks).sort()).toEqual(["0", "1"]);
  });

  it("the embeddings status is local: written under .cache, and the old synced file is removed", () => {
    const m = mk();
    writeJson("embed-status.json", { ok: false, checkedAt: Date.now(), model: "other" });
    writeJson("litopys/embed-status.json", { ok: false, checkedAt: Date.now(), model: "other" });
    // the old files no longer decide anything on this device
    expect(L.embedAllowed(m.host.fs)).toBe(true);
    L.setEmbedStatus(m.host.fs, true, { model: "bge-m3", via: "This computer", dim: 3 });
    expect(readJson(".cache/litopys/embed-status.json").model).toBe("bge-m3");
    expect(exists("litopys/embed-status.json")).toBe(false);
  });
});
