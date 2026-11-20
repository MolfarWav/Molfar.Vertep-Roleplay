// The curtain's targets (#448, T3): what the Backstage menu lists for one chat.
import { describe, expect, it } from "bun:test";
import { MAX_BOOK_ROWS, backstageTargets } from "../src/lib/backstage-targets";

const books = [
  { id: "b1", name: "World book" },
  { id: "b2", name: "Her book" },
  { id: "b3", name: "Third" },
  { id: "b4", name: "Fourth" },
];

describe("backstageTargets", () => {
  it("lists the card, the preset, the lorebooks, then this chat's own tools", () => {
    const t = backstageTargets({
      character: { id: "c1", name: "Ada", embeddedLorebookId: "b1", linkedLorebookIds: ["b2"] },
      preset: { id: "p1", name: "Default" },
      lorebooks: books,
    });
    expect(t.map((x) => x.key)).toEqual(["card", "preset", "book", "book", "fired", "library", "world"]);
    expect(t[0]).toMatchObject({ objectId: "c1", objectName: "Ada" });
    expect(t[1]).toMatchObject({ objectId: "p1" });
    expect(t.filter((x) => x.key === "book").map((x) => x.objectId)).toEqual(["b1", "b2"]);
  });

  it("skips a missing preset and a lorebook that no longer exists, and never repeats a book", () => {
    const t = backstageTargets({
      character: { id: "c1", name: "Ada", embeddedLorebookId: "b1", linkedLorebookIds: ["b1", "gone"] },
      preset: undefined,
      lorebooks: books,
    });
    expect(t.map((x) => x.key)).toEqual(["card", "book", "fired", "library", "world"]);
  });

  it("gives at most a few lorebooks a row of their own", () => {
    const t = backstageTargets({
      character: { id: "c1", name: "Ada", embeddedLorebookId: null, linkedLorebookIds: ["b1", "b2", "b3", "b4"] },
      preset: null,
      lorebooks: books,
    });
    expect(t.filter((x) => x.key === "book")).toHaveLength(MAX_BOOK_ROWS);
  });

  it("ids are unique, so a menu can key its rows by them", () => {
    const t = backstageTargets({
      character: { id: "c1", name: "Ada", embeddedLorebookId: "b1", linkedLorebookIds: ["b2", "b3"] },
      preset: { id: "p1", name: "P" },
      lorebooks: books,
    });
    expect(new Set(t.map((x) => x.id)).size).toBe(t.length);
  });
});
