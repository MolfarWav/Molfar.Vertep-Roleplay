/**
 * The start-up list of lorebooks: /bootstrap ships summaries built from an index in the app's local cache,
 * never whole books. A SillyTavern library comes over with a book per character, and every book whole ran the
 * plugin sandbox out of memory at ~1,000 characters (the app no longer started and the imports that ran at the
 * same time died with "worker exited"). A send reads only the books in its scope.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;

let root: string;
let reads: string[];
let statCalls = 0;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rp-books-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: null }));
  reads = [];
  statCalls = 0;
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

function book(id: string, over: Record<string, unknown> = {}, entries = 3) {
  const b = {
    id, name: "Lore of " + id, folderId: null, globalActive: false, isEmbedded: true, linkedCharacterIds: [],
    settings: { scanDepth: 4, contextPercent: 25 }, vectorized: { embedding: "m", queryMessages: 2, scoreThreshold: 0.3, topK: 5 },
    formatTemplate: "", secretExtra: "x".repeat(500),
    entries: Array.from({ length: entries }, (_, i) => ({ uid: i, keys: ["k" + i], content: "C".repeat(400), enabled: true })),
    ...over,
  };
  fs.writeFileSync(path.join(root, "lorebooks", id + ".json"), JSON.stringify(b));
  return b;
}

function host(opts: { stat?: boolean } = {}) {
  const fsx: Record<string, unknown> = {
    read: (rel: string) => { reads.push(rel); return fs.readFileSync(path.resolve(root, rel), "utf8"); },
    write: (rel: string, content: string) => {
      const full = path.resolve(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  };
  if (opts.stat !== false) {
    const one = (rel: string) => {
      try {
        const st = fs.statSync(path.resolve(root, rel));
        return { size: st.size, mtimeMs: Math.floor(st.mtimeMs), dir: st.isDirectory() };
      } catch { return null; }
    };
    fsx.stat = (rel: string | string[]) => {
      statCalls++;
      return Array.isArray(rel) ? rel.map(one) : one(rel);
    };
  }
  return { fs: fsx, store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] }, log: () => {} };
}

async function route(method: string, p: string, body?: unknown, h = host(), query: Record<string, string> = {}) {
  const mod = (await import(engineUrl)) as { handleRoute: Function };
  const out = mod.handleRoute({ method, path: p, query, body }, h) as { status?: number; json?: Record<string, unknown> };
  return { status: out?.status ?? 200, json: (out?.json ?? {}) as Record<string, unknown> };
}
const bookReads = () => reads.filter((r) => r.startsWith("lorebooks/")).length;

describe("lorebook summaries at start", () => {
  it("ships summaries: the small fields, the counts, no entries and no unknown extras", async () => {
    book("aria-lore", { folderId: "f1", globalActive: true, linkedCharacterIds: ["aria"] }, 5);
    const r = await route("GET", "/bootstrap");
    expect(r.status).toBe(200);
    const list = r.json.lorebooks as Record<string, unknown>[];
    expect(list.length).toBe(1);
    const b = list[0]!;
    expect(b.id).toBe("aria-lore");
    expect(b.stub).toBe(true);
    expect(b.name).toBe("Lore of aria-lore");
    expect(b.folderId).toBe("f1");
    expect(b.globalActive).toBe(true);
    expect(b.isEmbedded).toBe(true);
    expect(b.linkedCharacterIds).toEqual(["aria"]);
    expect(b.entryCount).toBe(5);
    expect(b.tokens).toBe(500);
    expect(b.settings).toEqual({ scanDepth: 4, contextPercent: 25 });
    expect(b.entries).toBeUndefined();
    expect(b.secretExtra).toBeUndefined();
    expect(typeof b.rev).toBe("string");
    expect(r.json.lorebooksPending).toBe(0);
  });

  it("keeps a chat's own book out of nothing here (the app filters it) but carries its owner", async () => {
    book("w1", { ownerChatId: "chat9", isEmbedded: false });
    const b = ((await route("GET", "/bootstrap")).json.lorebooks as Record<string, unknown>[])[0]!;
    expect(b.ownerChatId).toBe("chat9");
  });

  it("the payload stays small however many books there are", async () => {
    for (let i = 0; i < 60; i++) book("b" + i, {}, 40);
    const r = await route("GET", "/bootstrap");
    expect((r.json.lorebooks as unknown[]).length).toBe(60);
    // 60 books of 16 KB each are ~1 MB on disk; the summaries are a few KB each at most
    expect(JSON.stringify(r.json.lorebooks).length).toBeLessThan(60 * 800);
  });

  it("skips the AI-only templates (a _ prefix) like the plain list does", async () => {
    book("_template");
    book("real");
    const r = await route("GET", "/bootstrap");
    expect((r.json.lorebooks as Record<string, unknown>[]).map((b) => b.id)).toEqual(["real"]);
  });

  it("keeps the index in the local cache and reads no book again until it changes", async () => {
    book("a1");
    book("a2");
    await route("GET", "/bootstrap");
    expect(bookReads()).toBe(2);
    expect(fs.readdirSync(path.join(root, ".cache", "lorebooks-index")).length).toBeGreaterThan(0);
    reads = [];
    statCalls = 0;
    const again = await route("GET", "/lorebooks", undefined, host(), { summaries: "1" });
    expect((again.json.items as unknown[]).length).toBe(2);
    expect(again.json.pending).toBe(0);
    expect(bookReads()).toBe(0);
    expect(statCalls).toBe(1);
  });

  it("picks up an edit made outside the app on the next read", async () => {
    book("a1", {}, 2);
    await route("GET", "/bootstrap");
    book("a1", { name: "Renamed" }, 9);
    fs.utimesSync(path.join(root, "lorebooks", "a1.json"), new Date(), new Date(Date.now() + 5000));
    const r = await route("GET", "/lorebooks", undefined, host(), { summaries: "1" });
    const b = (r.json.items as Record<string, unknown>[])[0]!;
    expect(b.name).toBe("Renamed");
    expect(b.entryCount).toBe(9);
  });

  it("drops a deleted book from the index", async () => {
    book("a1");
    book("a2");
    await route("GET", "/bootstrap");
    fs.rmSync(path.join(root, "lorebooks", "a2.json"));
    const r = await route("GET", "/lorebooks", undefined, host(), { summaries: "1" });
    expect((r.json.items as Record<string, unknown>[]).map((b) => b.id)).toEqual(["a1"]);
  });

  it("stops reading books when its time is up and says how many are left; the next call goes on", async () => {
    for (const id of ["b1", "b2", "b3", "b4", "b5"]) book(id);
    let clock = 1_000_000;
    const now = spyOn(Date, "now").mockImplementation(() => clock);
    const h = host();
    const read = h.fs.read as (rel: string) => string;
    h.fs.read = (rel: string) => { if (rel.startsWith("lorebooks/")) clock += 1500; return read(rel); };
    try {
      const first = await route("GET", "/bootstrap", undefined, h);
      expect((first.json.lorebooks as unknown[]).length).toBe(2);
      expect(first.json.lorebooksPending).toBe(3);
      const second = await route("GET", "/lorebooks", undefined, h, { summaries: "1" });
      expect((second.json.items as unknown[]).length).toBe(5);
      expect(second.json.pending).toBe(0);
    } finally {
      now.mockRestore();
    }
  });

  it("works on an engine without fs.stat: no index, every book read, still summaries", async () => {
    book("a1");
    const r = await route("GET", "/bootstrap", undefined, host({ stat: false }));
    const b = (r.json.lorebooks as Record<string, unknown>[])[0]!;
    expect(b.stub).toBe(true);
    expect(b.entries).toBeUndefined();
    expect(fs.existsSync(path.join(root, ".cache"))).toBe(false);
  });

  it("the whole book is still one GET away, and the plain list still returns whole books", async () => {
    book("a1", {}, 4);
    const one = await route("GET", "/lorebooks/a1");
    expect((one.json.entries as unknown[]).length).toBe(4);
    expect(one.json.secretExtra).toBeDefined();
    const all = await route("GET", "/lorebooks");
    expect((all.json.items as Record<string, unknown>[])[0]!.entries).toBeDefined();
  });

  it("refuses to write a summary over a book, by PUT or PATCH", async () => {
    book("a1", {}, 4);
    for (const method of ["PUT", "PATCH"]) {
      const r = await route(method, "/lorebooks/a1", { name: "Lore", stub: true, entries: [] });
      expect(r.status).toBe(409);
    }
    const disk = JSON.parse(fs.readFileSync(path.join(root, "lorebooks", "a1.json"), "utf8"));
    expect(disk.entries.length).toBe(4);
  });
});

describe("a send reads only the books in its scope", () => {
  const embedWork = async (bound: string[]) => {
    const mod = (await import(engineUrl)) as { semanticEmbedWork: Function };
    return mod.semanticEmbedWork(host().fs, { lorebookIds: bound }, [], "the scan") as { needed: { text: string }[]; wantScan: boolean } | null;
  };
  const vecBook = (id: string, over: Record<string, unknown> = {}) =>
    book(id, { entries: [{ uid: 0, keys: ["k"], content: "text of " + id, enabled: true, vectorized: true }], ...over });

  it("opens the bound book by its path, not the whole shelf", async () => {
    for (let i = 0; i < 30; i++) vecBook("b" + i);
    reads = [];
    const w = await embedWork(["b7", "b12"]);
    expect(w!.needed.map((n) => n.text.split("\n")[0]).sort()).toEqual(["text of b12", "text of b7"]);
    expect(reads.filter((r) => r.startsWith("lorebooks/") && !r.includes("/.")).sort()).toEqual(["lorebooks/b12.json", "lorebooks/b7.json"]);
  });

  it("finds a book bound by its name when no file carries that name, one file at a time", async () => {
    vecBook("file-name", { id: undefined, name: "Named Book" });
    for (let i = 0; i < 5; i++) vecBook("other" + i);
    const w = await embedWork(["Named Book"]);
    expect(w!.needed.length).toBe(1);
    expect(w!.needed[0]!.text.startsWith("text of file-name")).toBe(true);
  });

  it("ignores an id that is not a plain id (no path walking) and a book that is gone", async () => {
    vecBook("b1");
    reads = [];
    const w = await embedWork(["../settings", "gone"]);
    expect(w === null || w.needed.length === 0).toBe(true);
    expect(reads.some((r) => r.includes("settings"))).toBe(false);
  });
});
