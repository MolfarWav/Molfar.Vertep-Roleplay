// The Lorebook tab of a persona and of a card (Molfar.Vertep#463): which books are attached (own first, then linked), an id the
// library does not have shown as a row to remove (it used to be silent), and the states of the list.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
// the store keeps its state in localStorage and writes through to the engine: a bare stand-in and a fetch that goes nowhere
const kept = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) };
(globalThis as any).fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
const { BookLinks, attachedBooks } = await import("../src/components/lore/book-links");

const book = (id: string, name: string) =>
  ({ id, name, folderId: null, globalActive: false, linkedCharacterIds: [], entries: [], settings: {}, vectorized: {}, isEmbedded: false, formatTemplate: "" }) as unknown as import("../src/lib/types").Lorebook;

describe("attachedBooks", () => {
  const library = [book("b1", "Harbour"), book("b2", "Court"), book("b3", "Unused")];
  it("lists only the attached books, in the order given, and never the rest of the library", () => {
    const rows = attachedBooks({ ownId: null, linkedIds: ["b2", "b1"] }, library, false);
    expect(rows.map((r) => r.book?.name)).toEqual(["Court", "Harbour"]);
    expect(rows.every((r) => !r.own)).toBe(true);
  });
  it("puts the own book first, and ignores an own id for an owner that has none (a persona)", () => {
    expect(attachedBooks({ ownId: "b3", linkedIds: ["b1"] }, library, true).map((r) => [r.id, r.own])).toEqual([["b3", true], ["b1", false]]);
    expect(attachedBooks({ ownId: "b3", linkedIds: ["b1"] }, library, false).map((r) => r.id)).toEqual(["b1"]);
  });
  it("keeps an id the library does not have, with no book, so the tab can show it", () => {
    const rows = attachedBooks({ ownId: "own-gone", linkedIds: ["b1", "gone"] }, library, true);
    expect(rows.map((r) => [r.id, r.book === null])).toEqual([["own-gone", true], ["b1", false], ["gone", true]]);
  });
});

// the store starts with an empty library, so every attached id is one the library lacks
const render = (ownId: string | null, linkedIds: string[]) =>
  renderToStaticMarkup(<BookLinks value={{ ownId, linkedIds }} onChange={() => {}} ownerName="Ada" usedElsewhere={() => 0} allowOwn testId="t" title="Books" empty="Nothing here" />);

describe("BookLinks", () => {
  it("says so when no book is attached", () => {
    expect(render(null, [])).toContain("Nothing here");
  });
  it("shows an id the library does not have as a row with Unlink, and does not claim the list is empty", () => {
    const html = render(null, ["gone-id"]);
    expect(html).toContain('data-testid="book-missing"');
    expect(html).toContain("Not in your library");
    expect(html).toContain("gone-id");
    expect(html).toContain("Unlink");
    expect(html).not.toContain("Nothing here");
  });
  it("a card's own book that is missing is a row too", () => {
    expect(render("own-gone", [])).toContain("own-gone");
  });
});
