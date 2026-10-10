import { describe, it, expect } from "bun:test";
import { bookUsage, ownBookOnlyFor } from "../src/lib/lore-usage";
import type { Character } from "../src/lib/types";

const card = (id: string, own: string | null, linked: string[] = []) =>
  ({ id, name: id, embeddedLorebookId: own, linkedLorebookIds: linked }) as unknown as Character;

describe("who uses a lorebook", () => {
  const cards = [card("a", "b1"), card("b", null, ["b1", "b2"]), card("c", "b3")];
  it("counts own and linked cards", () => {
    expect(bookUsage(cards, "b1").users.map((c) => c.id)).toEqual(["a", "b"]);
    expect(bookUsage(cards, "b1").owners.map((c) => c.id)).toEqual(["a"]);
    expect(bookUsage(cards, "b2").users.map((c) => c.id)).toEqual(["b"]);
    expect(bookUsage(cards, "nope").users).toEqual([]);
  });
  it("an own book goes with its card only when no other card uses it", () => {
    expect(ownBookOnlyFor(cards, "a")).toBeNull();
    expect(ownBookOnlyFor(cards, "c")).toBe("b3");
    expect(ownBookOnlyFor(cards, "b")).toBeNull();
  });
});
