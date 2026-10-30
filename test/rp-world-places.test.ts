// The Places tab's tree (issue 176): whole places with spots under them, things under the place they name,
// the rest under "Not placed". Names are matched like the engine's placeKey.
import { describe, expect, it } from "bun:test";
import { answersTo, buildPlaceTree, placeKey, treeRows } from "../src/lib/world-places";
import type { WorldRecord } from "../src/lib/world";

let n = 0;
const rec = (kind: WorldRecord["kind"], name: string, extra: Partial<WorldRecord> = {}): WorldRecord => ({
  id: `n${++n}`, kind, name, aliases: [], text: `${name} text`, status: "active", at: n, ...extra,
});

describe("placeKey", () => {
  it("lower-cases and turns anything that is not a letter or digit into a space", () => {
    expect(placeKey("Mei's  Apartment!")).toBe("mei s apartment");
    expect(placeKey("  Café Lumen ")).toBe("café lumen");
    expect(placeKey("Квартира Мей")).toBe("квартира мей");
    expect(placeKey(null)).toBe("");
  });

  it("answersTo matches a name or an alias, never an empty name", () => {
    const r = rec("place", "Mei's apartment", { aliases: ["Home"] });
    expect(answersTo(r, "mei s APARTMENT")).toBe(true);
    expect(answersTo(r, "home!")).toBe(true);
    expect(answersTo(r, "kitchen")).toBe(false);
    expect(answersTo(r, "")).toBe(false);
  });
});

describe("buildPlaceTree", () => {
  const flat = rec("place", "Mei's apartment", { visits: 3, aliases: ["Home"] });
  const living = rec("place", "Living room", { size: "spot", inside: "mei's apartment", visits: 2 });
  const kitchen = rec("place", "Kitchen", { size: "spot", inside: "Home", visits: 1 });
  const cafe = rec("place", "Café Lumen", { visits: 5 });
  const vase = rec("thing", "Ceramic vase", { place: "Living room" });
  const key = rec("thing", "Spare key", { place: "mei s apartment" });
  const card = rec("thing", "Loyalty card", { place: "Café Lumen" });
  const note = rec("thing", "Folded note", { holder: "Ren" });
  const lost = rec("thing", "Umbrella", { place: "the old market" });
  const loose = rec("thing", "Coin");
  const old = rec("place", "Old house", { status: "past" });
  const all = [flat, living, kitchen, cafe, vase, key, card, note, lost, loose, old];

  it("puts spots under the place they are inside, matched by name or alias", () => {
    const tree = buildPlaceTree(all, null);
    expect(tree.roots.map((r) => r.place.name)).toEqual(["Café Lumen", "Mei's apartment"]); // by visits
    const home = tree.roots.find((r) => r.place === flat)!;
    expect(home.spots.map((s) => s.place.name)).toEqual(["Living room", "Kitchen"]);
    expect(tree.places).toBe(4);
  });

  it("puts a thing under the place or spot it names, and the rest under Not placed", () => {
    const tree = buildPlaceTree(all, null);
    const home = tree.roots.find((r) => r.place === flat)!;
    expect(home.things.map((t) => t.name)).toEqual(["Spare key"]);
    expect(home.spots[0]!.things.map((t) => t.name)).toEqual(["Ceramic vase"]);
    expect(tree.roots.find((r) => r.place === cafe)!.things).toEqual([card]);
    // held by a person, a place that does not exist, and no place at all
    expect(tree.unplaced.map((t) => t.name).sort()).toEqual(["Coin", "Folded note", "Umbrella"]);
    expect(tree.things).toBe(6);
  });

  it("leaves retired records out", () => {
    const tree = buildPlaceTree(all, null);
    expect(treeRows(tree).some((r) => r.node.place === old)).toBe(false);
  });

  it("marks the scene's place and lists it first", () => {
    const tree = buildPlaceTree(all, living.id);
    const home = tree.roots.find((r) => r.place === flat)!;
    expect(home.spots[0]!.place).toBe(living);
    expect(home.spots[0]!.here).toBe(true);
    expect(home.here).toBe(false);
    const here = buildPlaceTree(all, cafe.id);
    expect(here.roots[0]!.place).toBe(cafe);
  });

  it("keeps a spot whose parent is unknown at the top level, with the name it points at", () => {
    const stray = rec("place", "Attic", { size: "spot", inside: "Nowhere house" });
    const tree = buildPlaceTree([stray], null);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]!.strayInside).toBe("Nowhere house");
  });

  it("puts a spot inside a spot under the whole place", () => {
    const home = rec("place", "House");
    const hall = rec("place", "Hall", { size: "spot", inside: "House" });
    const closet = rec("place", "Closet", { size: "spot", inside: "Hall" });
    const tree = buildPlaceTree([home, hall, closet], null);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]!.spots.map((s) => s.place.name).sort()).toEqual(["Closet", "Hall"]);
  });

  it("is empty for a world with no places or things", () => {
    const tree = buildPlaceTree([rec("person", "Mei"), rec("fact", "It rains")], null);
    expect(tree).toMatchObject({ roots: [], unplaced: [], places: 0, things: 0 });
  });
});

import { isRevealed, markRevealed, needsGate, revealKey } from "../src/lib/world-reveal";

describe("the spoiler question", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("asks only when the world was built before the story", () => {
    // a chat's world: no origin = the DM wrote it from the story
    expect(needsGate({ chatId: "c1" }, { origin: null })).toBe(false);
    expect(needsGate({ chatId: "c1" }, { origin: { kind: "cards", at: 1 } })).toBe(true);
    expect(needsGate({ chatId: "c1" }, null)).toBeUndefined();
    // a saved world: `from` = saved from a played chat
    expect(needsGate({ worldId: "w1" }, { from: { chatId: "c1", title: "x" } })).toBe(false);
    expect(needsGate({ worldId: "w1" }, { from: null })).toBe(true);
  });

  it("remembers the answer per chat and per world, and survives blocked storage", () => {
    const s = store();
    expect(isRevealed({ chatId: "c1" }, s)).toBe(false);
    markRevealed({ chatId: "c1" }, s);
    markRevealed({ chatId: "c1" }, s);
    expect(isRevealed({ chatId: "c1" }, s)).toBe(true);
    expect(isRevealed({ worldId: "c1" }, s)).toBe(false);
    expect(isRevealed({ chatId: "c2" }, s)).toBe(false);
    expect(revealKey({ worldId: "w9" })).toBe("w:w9");
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(isRevealed({ chatId: "c1" }, broken)).toBe(false);
    expect(() => markRevealed({ chatId: "c1" }, broken)).not.toThrow();
    expect(isRevealed({ chatId: "c1" }, null)).toBe(false);
  });
});
