// A lorebook file in the app's own format keeps its names, folders, status, depth, order and settings on import,
// with or without a `vectorized` key, in both of the app's shapes (Molfar.Vertep #295).
import { beforeAll, describe, expect, it } from "bun:test";

let isNativeBook: (j: Record<string, unknown>) => boolean;
let nativeBookToEngine: (j: Record<string, unknown>, id: string) => any;

beforeAll(async () => {
  (globalThis as any).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
  (globalThis as any).localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const m = await import("../src/lib/engine");
  isNativeBook = m.isNativeBook;
  nativeBookToEngine = m.nativeBookToEngine;
}, 60000);

/** What data/lorebooks/<id>.json holds: the stored shape, no `vectorized`. */
const stored = () => ({
  name: "Harbour",
  folders: ["Places"],
  settings: { scanDepth: 7, contextPercent: 30, budgetCap: 0, minActivations: 0, maxRecursion: 2, insertionStrategy: "character_first", caseSensitive: false, wholeWords: true, groupScoring: false, recursiveScan: true, includeNames: true, overflowAlert: true },
  entries: [
    { uid: 0, title: "The quay", memo: "where ships dock", keys: ["quay", "dock"], secondaryKeys: ["fog"], selectiveLogic: "AND_ALL", status: "normal", content: "A stone quay.", position: "at_depth", depth: 2, role: "user", order: 40, probability: 60, folder: "Places", enabled: true },
    { uid: 1, title: "The law", memo: "", keys: [], status: "constant", content: "Nobody carries a blade in port.", position: "before_char", order: 10, enabled: true },
  ],
});

describe("is this a book in the app's own shape", () => {
  it("a stored book without `vectorized` is native", () => {
    expect(isNativeBook(stored())).toBe(true);
  });

  it("the editor's shape with `vectorized` is native, an empty one only with it", () => {
    expect(isNativeBook({ settings: {}, vectorized: {}, entries: [{ id: "e0", logic: "AND_ANY", keys: [], content: "x" }] })).toBe(true);
    expect(isNativeBook({ settings: {}, vectorized: {}, entries: [] })).toBe(true);
    expect(isNativeBook({ settings: {}, entries: [] })).toBe(false);
  });

  it("other formats are not: a V2 card book, a world-info object, entries with another format's names", () => {
    expect(isNativeBook({ name: "x", entries: [{ keys: ["a"], content: "b", insertion_order: 1, extensions: {} }] })).toBe(false);
    expect(isNativeBook({ entries: { "0": { key: ["a"], content: "b" } } })).toBe(false);
    expect(isNativeBook({ settings: {}, entries: [{ keys: ["a"], content: "b", insertion_order: 1 }] })).toBe(false);
    expect(isNativeBook({ settings: {}, entries: [{ keys: ["a"], content: "b" }] })).toBe(false);
  });
});

describe("a native book keeps what it carries", () => {
  it("the stored shape: names, folders, status, depth, role, order, logic, probability and the book's settings", () => {
    const b = nativeBookToEngine(stored(), "book-1");
    expect(b.id).toBe("book-1");
    expect(b.folders).toEqual(["Places"]);
    expect(b.settings.scanDepth).toBe(7);
    expect(b.vectorized).toMatchObject({ topK: 10 }); // the default fills the key the file lacked
    const [quay, law] = b.entries;
    expect(quay).toMatchObject({ title: "The quay", memo: "where ships dock", keys: ["quay", "dock"], secondaryKeys: ["fog"], selectiveLogic: "AND_ALL", status: "normal", position: "at_depth", depth: 2, role: "user", order: 40, probability: 60, folder: "Places" });
    expect(law).toMatchObject({ title: "The law", status: "constant", order: 10 });
  });

  it("the editor's shape (what Export writes) still comes through, and a missing `vectorized` is filled", () => {
    const file = {
      name: "Exported", settings: { scanDepth: 5 },
      entries: [{ id: "e0", uid: 0, title: "Gate", memo: "", keys: ["gate"], keysRegex: false, secondaryKeys: [], logic: "NOT_ANY", status: "normal", content: "A gate.", position: "before_char", depth: 4, role: "system", order: 100, probability: 30, useProbability: true, enabled: true }],
    };
    const b = nativeBookToEngine(file, "book-2");
    expect(b.entries[0]).toMatchObject({ title: "Gate", selectiveLogic: "NOT_ANY", probability: 30 });
    expect(b.vectorized).toMatchObject({ topK: 10 });
  });
});
