// Lorebook export: one file per book in the shape the import reads back, all books in one zip with unique names.
import { describe, expect, it } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { bookExportShape, zipBooks, zipNames } from "../src/lib/lore-export";

const book = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, name, entries: [{ id: "e1", content: "x" }], linkedCharacterIds: ["c1"], isEmbedded: true, globalActive: true, rev: "r1", ...extra }) as any;

describe("lorebook export", () => {
  it("drops the revision and every link to this install", () => {
    const out = bookExportShape(book("b1", "Harbour")) as any;
    expect(out.rev).toBeUndefined();
    expect(out.linkedCharacterIds).toEqual([]);
    expect(out.isEmbedded).toBe(false);
    expect(out.globalActive).toBe(false);
    expect(out.entries).toHaveLength(1);
  });

  it("names the files safely and keeps repeated names apart", () => {
    expect(zipNames([{ name: "Harbour" }, { name: "harbour" }, { name: "a/b:c*?" }, { name: "" }, { name: "Harbour" }])).toEqual(["Harbour.json", "harbour-2.json", "a_b_c_.json", "lorebook.json", "Harbour-3.json"]);
  });

  it("zips every book as its own JSON, readable back", () => {
    const files = unzipSync(zipBooks([book("b1", "Harbour"), book("b2", "Harbour")]));
    expect(Object.keys(files).sort()).toEqual(["Harbour-2.json", "Harbour.json"]);
    const one = JSON.parse(strFromU8(files["Harbour.json"]!));
    expect(one.id).toBe("b1");
    expect(one.entries[0].content).toBe("x");
    expect(one.rev).toBeUndefined();
  });
});
