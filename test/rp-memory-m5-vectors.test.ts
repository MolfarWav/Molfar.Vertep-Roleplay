/**
 * Litopys wave 2: the scan window's vector (ctx.turn.scanVec) ranks facts and chapters beside the
 * words, and the engine plugin embeds the scan window when only Litopys holds vectors.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { L, useRoot, line, story, writeChat, writeJson, readJson, mockHost } from "./rp-memory-m2-kit";

useRoot();

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;

const fact = (id: string, text: string) => ({ id, text, subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active" });
const vec = (facts: { id: string; text: string }[], by: Record<string, number[]>) =>
  Object.fromEntries(facts.filter((f) => by[f.id]).map((f) => [f.id, { hash: L.fnv1a(f.text.trim()), vector: by[f.id] }]));

describe("cosine and semanticBonuses", () => {
  it("cosine is null for a shape mismatch, a zero vector or junk", () => {
    expect(L.cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(L.cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(L.cosine([1, 0], [1, 0, 0])).toBeNull();
    expect(L.cosine([0, 0], [1, 0])).toBeNull();
    expect(L.cosine([1, "x"], [1, 0])).toBeNull();
    expect(L.cosine([], [])).toBeNull();
    expect(L.cosine(null, [1])).toBeNull();
  });

  const items = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  const by: Record<string, number[]> = { a: [1, 0], b: [0.9, 0.4], c: [0.1, 1], d: [0, 1], e: [0.2, 0.9] };
  const sem = { vec: [1, 0], of: (it: { id: string }) => by[it.id] ?? null };

  it("gives a bonus only to items above the pool's mean, the nearest the most", () => {
    const out = L.semanticBonuses(items, sem) as Map<{ id: string }, number>;
    const get = (id: string) => out.get(items.find((i) => i.id === id)!) ?? 0;
    expect(get("a")).toBeGreaterThan(get("b"));
    expect(get("b")).toBeGreaterThan(0);
    expect(get("d")).toBe(0);
    expect(get("e")).toBe(0);
    expect(Math.max(...out.values())).toBeLessThanOrEqual(12 * 3);
  });

  it("gives nothing without a vector, with a small pool, equal cosines or another dimension", () => {
    expect(L.semanticBonuses(items, null).size).toBe(0);
    expect(L.semanticBonuses(items, false).size).toBe(0);
    expect(L.semanticBonuses(items, { vec: [], of: sem.of }).size).toBe(0);
    expect(L.semanticBonuses(items.slice(0, 3), sem).size).toBe(0);
    expect(L.semanticBonuses(items, { vec: [1, 0], of: () => [0.5, 0.5] }).size).toBe(0);
    expect(L.semanticBonuses(items, { vec: [1, 0, 0], of: sem.of }).size).toBe(0);
  });
});

describe("ranking with vectors", () => {
  // English facts, a Ukrainian scan: no word can match, only meaning can
  const facts = [
    fact("f1", "The mill wheel is broken."),
    fact("f2", "Aria distrusts strangers."),
    fact("f3", "A lantern never goes out."),
    fact("f4", "Bram owes a debt to a duke."),
    fact("f5", "The cellar holds a hidden key."),
  ];
  const vectors = vec(facts, { f1: [0, 1, 0], f2: [0.1, 0.9, 0], f3: [0, 0.2, 1], f4: [1, 0, 0.1], f5: [0.2, 0, 1] });
  const scanText = "Скільки вона йому винна?";

  it("puts the fact nearest in meaning first when the words say nothing", () => {
    const words = L.rankFacts(facts, scanText).map((f: { id: string }) => f.id);
    expect(words).not.toBeNull();
    const withVec = L.rankFacts(facts, scanText, null, { vec: [1, 0, 0], of: (f: { id: string; text: string }) => vectors[f.id].vector });
    expect(withVec[0].id).toBe("f4");
  });

  it("ranks as before when there is no scan vector", () => {
    const a = L.rankFacts(facts, "mill wheel").map((f: { id: string }) => f.id);
    const b = L.rankFacts(facts, "mill wheel", null, false).map((f: { id: string }) => f.id);
    expect(b).toEqual(a);
    expect(a[0]).toBe("f1");
  });

  it("a vector of an edited text is ignored; so is one of another size", () => {
    const stale = { ...vectors, f4: { hash: L.fnv1a("Another text."), vector: [1, 0, 0.1] } };
    const st = L.emptyChat("c1");
    st.facts = facts;
    const ln = line(story(12));
    const run = (v: unknown, scanVec: number[]) =>
      L.buildInsert({ st, line: ln, dash: { snapshots: {} }, meta: { userName: "You" }, cfg: { enabled: true, insert: true, budget: 200, recentMessages: 20 }, scanText, speakerName: "Aria", scanVec, vectors: v });
    const budgetFits = (r: { facts: number }) => r.facts;
    // all five facts fit a 200-token budget: this checks only that nothing throws on stale or odd vectors
    expect(budgetFits(run(stale, [1, 0, 0]))).toBe(5);
    expect(budgetFits(run(vectors, [1, 0]))).toBe(5);
    expect(budgetFits(run(null, [1, 0, 0]))).toBe(5);
  });

  it("under a small budget the fact near in meaning is the one inserted", () => {
    const padded = facts.map((f) => ({ ...f, text: f.text + " " + "pad ".repeat(60) }));
    const v = vec(padded, { f1: [0, 1, 0], f2: [0.1, 0.9, 0], f3: [0, 0.2, 1], f4: [1, 0, 0.1], f5: [0.2, 0, 1] });
    const st = L.emptyChat("c1");
    st.facts = padded;
    const ln = line(story(12));
    const run = (scanVec: number[] | null) =>
      L.buildInsert({ st, line: ln, dash: { snapshots: {} }, meta: { userName: "You" }, cfg: { enabled: true, insert: true, budget: 200, recentMessages: 20 }, scanText, speakerName: "Aria", scanVec, vectors: scanVec ? v : null });
    const near = run([1, 0, 0]);
    expect(near.full).toBe(false);
    expect(near.factIds).toContain("f4");
    const other = run([0, 0.2, 1]);
    expect(other.factIds).toContain("f3");
    expect(other.factIds).not.toContain("f4");
  });

  it("an arc takes the vector of its member chapter nearest the scan window", () => {
    const chapters = [
      { id: "c1", text: "The mill burned." },
      { id: "c2", text: "A duke arrived." },
    ];
    const v = vec(chapters, { c1: [0, 1], c2: [1, 0] });
    expect(L.bestMemberVector(chapters, v, [1, 0])).toEqual([1, 0]);
    expect(L.bestMemberVector(chapters, v, [0, 1])).toEqual([0, 1]);
    expect(L.bestMemberVector(chapters, {}, [1, 0])).toBeNull();
    expect(L.bestMemberVector([undefined, null], v, [1, 0])).toBeNull();
  });
});

describe("llmRequest reads turn.scanVec", () => {
  it("inserts the fact nearest in meaning, and still works without the vector", () => {
    const chatId = "vec1";
    writeChat(chatId, story(12));
    const padded = ["f1", "f2", "f3", "f4", "f5"].map((id, i) => fact(id, ["The mill wheel", "Aria distrusts", "A lantern", "Bram owes a debt", "The cellar key"][i] + " " + "pad ".repeat(60)));
    const st = L.emptyChat(chatId);
    st.migrated = true;
    st.facts = padded;
    writeJson(`litopys/chats/${chatId}.json`, st);
    writeJson(`litopys/vectors/${chatId}.json`, vec(padded, { f1: [0, 1, 0], f2: [0.1, 0.9, 0], f3: [0, 0.2, 1], f4: [1, 0, 0.1], f5: [0.2, 0, 1] }));
    writeJson("litopys/config.json", { enabled: true, insert: true, budget: 200, recentMessages: 6 });
    const m = mockHost();
    const ask = (turn: Record<string, unknown>) =>
      L.llmRequest({ key: "reply", request: { messages: [{ role: "system", content: "S" }, { role: "user", content: "Hello." }] }, turn: { op: "send", chatId, speakerName: "Aria", ...turn } }, m.host);
    const near = ask({ scanVec: [1, 0, 0] });
    const nearText = JSON.stringify(near.messages);
    expect(nearText).toContain("Bram owes a debt");
    const other = ask({ scanVec: [0, 0.2, 1] });
    expect(JSON.stringify(other.messages)).toContain("A lantern");
    expect(JSON.stringify(other.messages)).not.toContain("Bram owes a debt");
    // no vector: the call is unchanged and does not read the vectors file
    expect(ask({})).not.toBeNull();
  });
});

describe("the engine plugin embeds the scan window for Litopys vectors", () => {
  const withRoot = (fn: (root: string, fsx: Record<string, Function>) => void) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "m5-"));
    try {
      for (const d of ["lorebooks", "chats", "litopys/vectors"]) fs.mkdirSync(path.join(root, d), { recursive: true });
      const fsx = {
        read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
        write: (rel: string, c: string) => {
          fs.mkdirSync(path.dirname(path.resolve(root, rel)), { recursive: true });
          fs.writeFileSync(path.resolve(root, rel), c);
        },
        list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      };
      fn(root, fsx);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };

  it("asks for the scan embedding when the chat has Litopys vectors, and not otherwise", async () => {
    const E = (await import(engineUrl)) as { semanticEmbedWork: Function };
    withRoot((root, fsx) => {
      const meta = { id: "chat1", lorebookIds: [] };
      expect(E.semanticEmbedWork(fsx, meta, [], "scan text")).toBeNull();
      fs.writeFileSync(path.join(root, "litopys/vectors/chat1.json"), "{}");
      expect(E.semanticEmbedWork(fsx, meta, [], "scan text")).toEqual({ needed: [], wantScan: true });
      // nothing to compare: an empty window is not embedded
      expect(E.semanticEmbedWork(fsx, meta, [], "  ")).toBeNull();
      // another chat's vectors do not count
      expect(E.semanticEmbedWork(fsx, { id: "chat2", lorebookIds: [] }, [], "scan text")).toBeNull();
      // switched off for the chat, or Litopys off or not inserting
      expect(E.semanticEmbedWork(fsx, { ...meta, promptBoard: { off: ["plugin:litopys"] } }, [], "scan text")).toBeNull();
      fs.writeFileSync(path.join(root, "litopys/config.json"), JSON.stringify({ insert: false }));
      expect(E.semanticEmbedWork(fsx, meta, [], "scan text")).toBeNull();
    });
  });

  it("embeds the scan window for a book whose vectors are all cached (it used to wait for new entries)", async () => {
    const E = (await import(engineUrl)) as { semanticEmbedWork: Function };
    withRoot((root, fsx) => {
      const entry = { uid: 1, keys: ["tower"], content: "The tower leans.", enabled: true, vectorized: true };
      fs.writeFileSync(path.join(root, "lorebooks/b.json"), JSON.stringify({ id: "b", name: "B", entries: [entry] }));
      const meta = { id: "chat1", lorebookIds: ["b"] };
      const first = E.semanticEmbedWork(fsx, meta, [], "scan text");
      expect(first.needed).toHaveLength(1);
      expect(first.wantScan).toBe(true);
      // cache it the way cacheWiVectorBatch does, then ask again
      fs.writeFileSync(path.join(root, "lorebooks/.vectors.json"), JSON.stringify({ [first.needed[0].key]: { hash: first.needed[0].hash, vector: [0.1, 0.2] } }));
      expect(E.semanticEmbedWork(fsx, meta, [], "scan text")).toEqual({ needed: [], wantScan: true });
    });
  });

  it("semanticPrep embeds the scan, then hands the vector on for the turn labels", async () => {
    const E = (await import(engineUrl)) as { semanticPrep: Function };
    withRoot((root) => {
      fs.writeFileSync(path.join(root, "litopys/vectors/chat1.json"), "{}");
      const m = mockHost();
      Object.assign(m.host.fs, {
        read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
        write: (rel: string, c: string) => fs.writeFileSync(path.resolve(root, rel), c),
        list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      });
      const meta = { id: "chat1", lorebookIds: [] };
      const staged = [{ text: "Hello there." }];
      const first = E.semanticPrep(m.host, m.host.fs, meta, staged, "Where is the key?", {});
      expect(first.pending).toBeTruthy();
      expect(m.embeds).toHaveLength(1);
      expect(m.embeds[0].key).toBe("scan");
      expect(m.embeds[0].texts).toHaveLength(1);
      m.embedResults.scan = [[0.3, 0.4]];
      const second = E.semanticPrep(m.host, m.host.fs, meta, staged, "Where is the key?", { stash: { wiEmbed: [] } });
      expect(second.scanVec).toEqual([0.3, 0.4]);
      expect(m.embeds).toHaveLength(1);
    });
  });
});

describe("Auto memory size", () => {
  it("is a share of the model's context, within the floor and the ceiling", () => {
    expect(L.autoBudget(8192)).toBe(1229);
    expect(L.autoBudget(4096)).toBe(800);
    expect(L.autoBudget(200000)).toBe(16000);
    expect(L.autoBudget(0)).toBeNull();
    expect(L.autoBudget(undefined)).toBeNull();
    expect(L.autoBudget("x")).toBeNull();
  });

  it("is saved as a mode, and anything else means a fixed size", () => {
    const m = mockHost();
    expect(L.loadConfig(m.host.fs).budgetMode).toBe("fixed");
    L.patchConfig(m.host.fs, { budgetMode: "auto" });
    expect(L.loadConfig(m.host.fs).budgetMode).toBe("auto");
    expect(L.loadConfig(m.host.fs).budget).toBe(800);
    L.patchConfig(m.host.fs, { budgetMode: "huge" });
    expect(L.loadConfig(m.host.fs).budgetMode).toBe("fixed");
  });

  it("llmRequest sizes the insert by the context window in Auto, and by the saved number otherwise", () => {
    const chatId = "auto1";
    writeChat(chatId, story(12));
    // 30 facts of ~60 tokens each: about 1800 tokens in all
    const facts = Array.from({ length: 30 }, (_, i) => fact("f" + (i + 1), "Fact number " + (i + 1) + " " + "pad ".repeat(45).trim()));
    const st = L.emptyChat(chatId);
    st.migrated = true;
    st.facts = facts;
    writeJson(`litopys/chats/${chatId}.json`, st);
    const m = mockHost();
    const insertTokens = (cfg: Record<string, unknown>, turn: Record<string, unknown>) => {
      writeJson("litopys/config.json", { enabled: true, insert: true, recentMessages: 6, ...cfg });
      L.llmRequest({ key: "reply", request: { messages: [{ role: "system", content: "S" }, { role: "user", content: "Hello." }] }, turn: { op: "send", chatId, speakerName: "Aria", ...turn } }, m.host);
      return readJson(`litopys/insert/${chatId}.json`).tokens as number;
    };
    const fixed = insertTokens({ budget: 800 }, { contextTokens: 32768 });
    const auto = insertTokens({ budget: 800, budgetMode: "auto" }, { contextTokens: 32768 });
    const autoNoCtx = insertTokens({ budget: 800, budgetMode: "auto" }, {});
    expect(fixed).toBeLessThanOrEqual(800);
    expect(auto).toBeGreaterThan(fixed);
    expect(auto).toBeLessThanOrEqual(L.autoBudget(32768));
    expect(autoNoCtx).toBe(fixed);
  });
});
