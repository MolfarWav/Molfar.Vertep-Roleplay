// The Lorebooks chips and the used-by list: the counts per chip, the "needs keys" warning, the book kinds and the
// usage line. Pure functions, no DOM.
import { describe, expect, it } from "bun:test";
import { ENTRY_FILTERS, bookFilterCounts, entryFilterCounts, matchesBookFilter, matchesEntryFilter, needsKeys } from "../src/lib/lore-filters";
import { bookUsageLabel, usedByRows } from "../src/lib/lore-usage";
import type { Character, LoreEntry, Lorebook } from "../src/lib/types";

const entry = (id: string, over: Partial<LoreEntry>) => ({ id, title: id, keys: [], content: "", status: "normal", enabled: true, ...over }) as unknown as LoreEntry;

describe("entry filter chips", () => {
  const entries = [
    entry("a", {}),                                   // keyed, no keys: never fires
    entry("b", { keys: ["tide"] }),                   // keyed, with keys
    entry("c", { status: "constant", enabled: false }), // always on, switched off, no keys needed
    entry("d", { status: "vectorized", keys: ["x"] }),  // by meaning
  ];

  it("counts every chip in the order the chips show", () => {
    expect(ENTRY_FILTERS).toEqual(["all", "on", "off", "constant", "keyed", "vector", "nokeys"]);
    expect(entryFilterCounts(entries)).toEqual({ all: 4, on: 3, off: 1, constant: 1, keyed: 2, vector: 1, nokeys: 1 });
  });

  it("the no-keys chip holds only keyed entries without keys", () => {
    expect(entries.filter((e) => matchesEntryFilter(e, "nokeys")).map((e) => e.id)).toEqual(["a"]);
    expect(needsKeys(entries[2]!)).toBe(false);
    expect(needsKeys(entries[0]!)).toBe(true);
  });

  it("an empty book counts zero everywhere", () => {
    expect(Object.values(entryFilterCounts([])).every((n) => n === 0)).toBe(true);
  });
});

describe("book filter chips", () => {
  const books = [
    { id: "b1", globalActive: true },  // own book of one card
    { id: "b2", globalActive: false }, // linked by two cards: shared
    { id: "b3", globalActive: false }, // no card uses it
  ];
  const card = (id: string, own: string | null, linked: string[] = []) =>
    ({ id, name: id, embeddedLorebookId: own, linkedLorebookIds: linked }) as unknown as Character;
  const cards = [card("c1", "b1"), card("c2", null, ["b2"]), card("c3", null, ["b2"])];

  it("counts all, global and the three ways a book is tied to cards", () => {
    expect(bookFilterCounts(books, cards)).toEqual({ all: 3, global: 1, own: 1, shared: 1, unlinked: 1 });
  });

  it("matches a book by its flag or its kind", () => {
    const b1 = books[0] as Pick<Lorebook, "globalActive"> & { id: string };
    expect(matchesBookFilter(b1, "own", "own")).toBe(true);
    expect(matchesBookFilter(b1, "own", "global")).toBe(true);
    expect(matchesBookFilter(b1, "own", "shared")).toBe(false);
    expect(matchesBookFilter(books[2]!, "unlinked", "all")).toBe(true);
  });

  it("the Used by rows say which card owns the book", () => {
    expect(usedByRows(cards, "b1")).toEqual([{ id: "c1", name: "c1", own: true }]);
    expect(usedByRows(cards, "b2").map((r) => [r.id, r.own])).toEqual([["c2", false], ["c3", false]]);
    expect(usedByRows(cards, "b3")).toEqual([]);
  });

  it("the usage line: not linked, the own card, or a count of cards", () => {
    expect(bookUsageLabel(cards, "b3")).toEqual({ key: "lore.use.none", vars: {}, muted: true });
    expect(bookUsageLabel(cards, "b1")).toEqual({ key: "lore.use.own", vars: { name: "c1" }, muted: false });
    expect(bookUsageLabel(cards, "b2")).toEqual({ key: "lore.use.cards", vars: { n: 2 }, muted: false });
    expect(bookUsageLabel([card("c4", null, ["b5"])], "b5")).toEqual({ key: "lore.use.cardsOne", vars: { n: 1 }, muted: false });
  });
});
