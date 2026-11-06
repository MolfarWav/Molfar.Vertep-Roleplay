/**
 * A long chat's vectors do not fit in one file: the engine refuses a plugin write of 4 MB, and 3072 numbers a vector is about 25 KB.
 * Before this, finishEmbed threw "fs.write content too large", the throw ended the whole tick (no chapter of any chat was written)
 * and the same batch was asked for again and again. Now the vectors go on in `<chatId>.p2.json`, ..., and a failed save only ends
 * the request.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { L, env, useRoot, story, writeChat, writeJson, readJson, exists, mockHost, tick } from "./rp-memory-m2-kit";

useRoot();

const LIMIT = 4 * 1024 * 1024;
const fact = (id: string, text: string) => ({ id, text, subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", origin: "migrated", at: 1, updatedAt: 1 });
/** The same refusal the engine's sandbox gives. */
function limited(m: ReturnType<typeof mockHost>) {
  const write = m.host.fs.write;
  m.host.fs.write = (rel: string, content: string) => {
    if (Buffer.byteLength(content) >= LIMIT) throw new Error("fs.write content too large (4MB)");
    write(rel, content);
  };
}
function chat(chatId: string, m: ReturnType<typeof mockHost>, facts: number) {
  writeChat(chatId, story(12));
  const st = L.emptyChat(chatId);
  st.migrated = true;
  st.facts = Array.from({ length: facts }, (_, i) => fact("f" + i, `Fact ${i} of ${chatId}: the mill, the duke, the pendant.`));
  L.saveChatFile(m.host.fs, st);
  return st;
}
const bigVec = (seed: number, dim = 3072) => Array.from({ length: dim }, (_, i) => Math.sin(seed * 12.9898 + i * 0.37) * 0.0321);
const files = (chatId: string) => fs.readdirSync(path.join(env.root, "litopys/vectors")).filter((f) => f === chatId + ".json" || f.startsWith(chatId + ".p")).sort();

describe("vectors of a long chat", () => {
  it("120 vectors of 3072 numbers go on in extra files, each under the limit, and read back whole", () => {
    const m = mockHost();
    limited(m);
    const st = chat("long1", m, 120);
    const gaps = st.facts.map((f: any) => ({ id: f.id, hash: L.fnv1a(f.text) }));
    const vectors = gaps.map((_: unknown, i: number) => bigVec(i));
    expect(L.finishEmbed(m.host.fs, st, gaps, vectors, "text-embedding-3-large")).toBe(120);
    const names = files("long1");
    expect(names.length).toBeGreaterThan(1);
    expect(names[0]).toBe("long1.json");
    for (const n of names) expect(fs.statSync(path.join(env.root, "litopys/vectors", n)).size).toBeLessThan(LIMIT);
    expect(readJson("litopys/vectors/long1.json")._more).toBe(names.length - 1);
    // nothing is missing: every vector came back from the files
    expect(L.vectorGaps(m.host.fs, st, "text-embedding-3-large", 999)).toEqual([]);
  });

  it("a batch added at the end rewrites only the last file: the files before it are the same text", () => {
    const m = mockHost();
    limited(m);
    const st = chat("long2", m, 210);
    const all = st.facts.map((f: any) => ({ id: f.id, hash: L.fnv1a(f.text) }));
    L.finishEmbed(m.host.fs, st, all.slice(0, 200), all.slice(0, 200).map((_: unknown, i: number) => bigVec(i)), "m");
    expect(files("long2")).toEqual(["long2.json", "long2.p2.json", "long2.p3.json"]);
    const writes: string[] = [];
    const write = m.host.fs.write;
    m.host.fs.write = (rel: string, c: string) => {
      writes.push(rel);
      write(rel, c);
    };
    L.finishEmbed(m.host.fs, st, all.slice(200), all.slice(200).map((_: unknown, i: number) => bigVec(200 + i)), "m");
    expect(writes).toEqual(["litopys/vectors/long2.p3.json"]);
    expect(L.vectorGaps(m.host.fs, st, "m", 999)).toEqual([]);
  });

  it("an old single file over 4 MB (pretty printed) is read, and the next save splits it", () => {
    const m = mockHost();
    limited(m);
    const st = chat("old1", m, 80);
    const map: Record<string, unknown> = {};
    for (const f of st.facts) map[f.id] = { hash: L.fnv1a(f.text), vector: bigVec(Number(f.id.slice(1))), m: "m" };
    writeJson("litopys/vectors/old1.json", map); // pretty printed by the helper
    expect(fs.statSync(path.join(env.root, "litopys/vectors/old1.json")).size).toBeGreaterThan(LIMIT);
    expect(L.vectorGaps(m.host.fs, st, "m", 999)).toEqual([]);
    // one more fact arrives: this save is the one that used to throw
    st.facts.push(fact("f80", "A new fact, with a new vector."));
    const need = [{ id: "f80", hash: L.fnv1a("A new fact, with a new vector.") }];
    expect(() => L.finishEmbed(m.host.fs, st, need, [bigVec(80)], "m")).not.toThrow();
    expect(L.vectorGaps(m.host.fs, st, "m", 999)).toEqual([]);
    expect(fs.statSync(path.join(env.root, "litopys/vectors/old1.json")).size).toBeLessThan(LIMIT);
  });

  it("a save that fits in one file removes the extra files of an older, longer record", () => {
    const m = mockHost();
    const small = chat("shrink1", m, 3);
    writeJson("litopys/vectors/shrink1.p2.json", {});
    writeJson("litopys/vectors/shrink1.p9.json", {});
    const need = small.facts.map((f: any) => ({ id: f.id, hash: L.fnv1a(f.text) }));
    L.finishEmbed(m.host.fs, small, need, need.map((_: unknown, i: number) => bigVec(i, 8)), "m");
    expect(files("shrink1")).toEqual(["shrink1.json"]);
  });

  it("the orphan sweep keeps the extra files of a live chat and removes those of a gone one", () => {
    const m = mockHost();
    chat("live1", m, 2);
    writeJson("litopys/vectors/live1.json", { f0: { hash: "x", vector: [1, 0] }, _more: 1 });
    writeJson("litopys/vectors/live1.p2.json", { f1: { hash: "y", vector: [0, 1] } });
    writeJson("litopys/vectors/gone1.json", {});
    writeJson("litopys/vectors/gone1.p2.json", {});
    const store = { chats: {} };
    L.pruneOrphans(m.host.fs, store, ["live1.jsonl"]);
    expect(exists("litopys/vectors/live1.p2.json")).toBe(true);
    expect(exists("litopys/vectors/gone1.json")).toBe(false);
    expect(exists("litopys/vectors/gone1.p2.json")).toBe(false);
  });

  it("a missing extra file only makes its vectors gaps, and a damaged _more is harmless", () => {
    const m = mockHost();
    const st = chat("dmg1", m, 3);
    const hash = (i: number) => L.fnv1a(st.facts[i].text);
    writeJson("litopys/vectors/dmg1.json", { f0: { hash: hash(0), vector: [1, 0], m: "m" }, _more: 4 });
    writeJson("litopys/vectors/dmg1.p3.json", { f1: { hash: hash(1), vector: [0, 1], m: "m" } });
    expect(L.vectorGaps(m.host.fs, st, "m", 99).map((g: any) => g.id)).toEqual(["f2"]);
    writeJson("litopys/vectors/dmg1.json", { f0: { hash: hash(0), vector: [1, 0], m: "m" }, _more: 1e9 });
    expect(L.vectorGaps(m.host.fs, st, "m", 99).map((g: any) => g.id)).toEqual(["f2"]);
    writeJson("litopys/vectors/dmg1.json", { f0: { hash: hash(0), vector: [1, 0], m: "m" }, _more: "x" });
    expect(L.vectorGaps(m.host.fs, st, "m", 99).map((g: any) => g.id)).toEqual(["f1", "f2"]);
  });
});

describe("the tick with a long chat", () => {
  it("embeds all of it in batches with the engine's write limit in force, and no tick throws", () => {
    const m = mockHost({ embedder: (texts) => texts.map((_, i) => bigVec(i)) });
    limited(m);
    const logged: string[] = [];
    m.host.log = (s: string) => logged.push(s);
    chat("tick1", m, 150);
    writeJson("litopys/embed-status.json", { ok: true, checkedAt: Date.now(), model: "mock-embed", via: "Mock", dim: 3072 });
    m.host.llm.embedInfo = { lit_emb_tick1: { model: "mock-embed", via: "Mock" } };
    writeJson("litopys/embed-want/tick1.json", { more: true, at: 0, batch: null, asked: Date.now() });
    for (let i = 0; i < 12; i++) tick(m);
    expect(logged.filter((l) => /too large/.test(l))).toEqual([]);
    expect(files("tick1").length).toBeGreaterThan(1);
    expect(exists("litopys/embed-want/tick1.json")).toBe(false);
    expect(readJson("litopys/embed-status.json").ok).toBe(true);
  });

  it("a save that fails ends the request, says failing, asks for nothing more, and the chapters go on", () => {
    const m = mockHost({ embedder: (texts) => texts.map(() => [0.1, 0.5]) });
    const write = m.host.fs.write;
    m.host.fs.write = (rel: string, c: string) => {
      if (rel.startsWith("litopys/vectors/")) throw new Error("fs.write content too large (4MB)");
      write(rel, c);
    };
    const logged: string[] = [];
    m.host.log = (s: string) => logged.push(s);
    chat("fail1", m, 3);
    writeJson("litopys/embed-status.json", { ok: true, checkedAt: Date.now(), model: "mock-embed", via: "Mock", dim: 2 });
    m.host.llm.embedInfo = { lit_emb_fail1: { model: "mock-embed", via: "Mock" } };
    writeJson("litopys/embed-want/fail1.json", { more: true, at: 0, batch: null, asked: Date.now() });
    const sentEmbeds: number[] = [];
    for (let i = 0; i < 6; i++) sentEmbeds.push(tick(m, []).embeds.length);
    expect(logged.some((l) => /embed save/.test(l))).toBe(true);
    expect(logged.some((l) => /^litopys onTick: /.test(l))).toBe(false);
    expect(exists("litopys/embed-want/fail1.json")).toBe(false);
    expect(readJson("litopys/embed-status.json").ok).toBe(false);
    // one request, then none: the automatic filling waits for a call that works
    expect(sentEmbeds.reduce((a, b) => a + b, 0)).toBe(1);
  });
});
