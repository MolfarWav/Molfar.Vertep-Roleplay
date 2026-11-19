// Ready maps of the places map (Molfar.Vertep#454): the engine's packs, the key a chat keeps, and the default picked by code.
import { describe, expect, it } from "bun:test";
import { BUILTIN_KEY, cleanPacks, defaultMapKey, defaultMapKind, hasMap, mapKindWords, mapPackUrl, type MapPack } from "../src/lib/map-packs";
import { cleanPlaceMap } from "../src/lib/place-map";
import type { WorldRecord } from "../src/lib/world";

const PACK: MapPack = {
  id: "default",
  name: "Molfar Vertep",
  maps: ["region", "wilds", "coast", "city", "village", "port-town", "interior", "underground"].flatMap((kind) => [1, 2, 3, 4].map((n) => ({ id: `${kind}-${n}`, kind, w: 1376, h: 768 }))),
};

let n = 0;
const place = (name: string, extra: Partial<WorldRecord> = {}): WorldRecord => ({ id: `n${++n}`, kind: "place", name, aliases: [], text: "", status: "active", at: n, ...extra });
const names = (...list: string[]) => list.map((x) => place(x));

describe("the engine's packs", () => {
  it("keep only well-formed packs and maps", () => {
    const out = cleanPacks({ packs: [
      { id: "default", name: "Molfar Vertep", maps: [{ id: "city-1", kind: "city", w: 1376, h: 768 }, { id: "City-2", kind: "city" }, { id: "city-0", kind: "city" }, { id: "x-1", kind: "Bad Kind" }, 5] },
      { id: "Bad Pack", maps: [{ id: "city-1", kind: "city" }] },
      { id: "empty", maps: [] },
      { id: "nomaps" },
    ] });
    expect(out).toEqual([{ id: "default", name: "Molfar Vertep", maps: [{ id: "city-1", kind: "city", w: 1376, h: 768 }] }]);
    expect(cleanPacks(null)).toEqual([]);
    expect(cleanPacks({ error: "not found" })).toEqual([]);
  });
  it("a chat's key is <pack>/<map id>, its path is the engine's", () => {
    expect(BUILTIN_KEY.test("default/city-3")).toBe(true);
    for (const bad of ["city-3", "default/city", "Default/city-3", "default/city-3/x", "default/../x-1", ""]) expect(BUILTIN_KEY.test(bad), bad).toBe(false);
    expect(mapPackUrl("default/port-town-2")).toBe("/v1/map-packs/default/port-town-2.webp");
    expect(mapPackUrl("default/port-town-2", true)).toBe("/v1/map-packs/default/port-town-2-thumb.webp");
    expect(mapKindWords("port-town")).toBe("port town");
  });
  it("a key the engine does not have is not a map (an older engine shows the grid)", () => {
    expect(hasMap("default/city-3", [PACK])).toBe(true);
    expect(hasMap("default/city-9", [PACK])).toBe(false);
    expect(hasMap("other/city-3", [PACK])).toBe(false);
    expect(hasMap("default/city-3", null)).toBe(false);
    expect(hasMap("default/city-3", [])).toBe(false);
  });
});

describe("the picture a chat keeps", () => {
  it("is one of: the player's own, a ready map, none; anything else is dropped", () => {
    expect(cleanPlaceMap({ v: 1, picture: { id: "abc" } })?.picture).toEqual({ id: "abc" });
    expect(cleanPlaceMap({ v: 1, picture: { builtin: "default/city-3" } })?.picture).toEqual({ builtin: "default/city-3" });
    expect(cleanPlaceMap({ v: 1, picture: { none: true } })?.picture).toEqual({ none: true });
    for (const bad of [{ builtin: "city-3" }, { builtin: "Default/city-3" }, { none: false }, { builtin: 5 }, "default/city-3", null, []]) expect(cleanPlaceMap({ v: 1, picture: bad as unknown })).toBeNull();
  });
});

describe("the default map, by what the places are", () => {
  it("rooms make a house plan, caves and cellars a cave system, the sea a coast", () => {
    expect(defaultMapKind(["room", "room", "room", "house"])).toBe("interior");
    expect(defaultMapKind(["cave", "cellar", "dungeon"])).toBe("underground");
    expect(defaultMapKind(["sea", "beach", "lighthouse", "tavern"])).toBe("coast");
  });
  it("streets and shops make a town, a few of them a village, a harbour a harbour town", () => {
    expect(defaultMapKind(["tavern", "inn", "shop", "smithy", "church", "market", "street"])).toBe("city");
    expect(defaultMapKind(["tavern", "smithy", "house"])).toBe("village");
    expect(defaultMapKind(["port", "tavern", "shop", "house"])).toBe("port-town");
  });
  it("woods and rivers make the wilds; nothing known makes a region", () => {
    expect(defaultMapKind(["forest", "river", "camp"])).toBe("wilds");
    expect(defaultMapKind(["place", "place"])).toBe("region");
    expect(defaultMapKind([])).toBe("region");
  });
  it("picks one of the four maps of the kind by the chat, always the same one, and none without a pack", () => {
    const records = names("Hearthstone Inn", "Old Forge", "Market Square", "The Rusty Tavern", "Corner Shop", "Stone Church", "Elm Street");
    const a = defaultMapKey(records, "chat-a", [PACK])!;
    expect(a).toMatch(/^default\/city-[1-4]$/);
    expect(defaultMapKey(records, "chat-a", [PACK])).toBe(a);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(defaultMapKey(records, `chat-${i}`, [PACK])!);
    expect(seen.size).toBe(4);
    expect(defaultMapKey(records, "chat-a", [])).toBeNull();
    expect(defaultMapKey(records, "chat-a", null)).toBeNull();
  });
  it("counts whole places only, active ones, and reads the aliases too", () => {
    const rooms = [place("Kitchen", { inside: "House" }), place("Attic", { inside: "House" }), place("Hall", { inside: "House" })];
    expect(defaultMapKey(rooms, "c", [PACK])).toMatch(/^default\/region-/);
    const gone = names("Tavern", "Inn", "Shop", "Forge", "Church", "Market").map((r) => ({ ...r, status: "past" as const }));
    expect(defaultMapKey(gone, "c", [PACK])).toMatch(/^default\/region-/);
    const poetic = [place("The Gilded Cup", { aliases: ["tavern"] }), place("Number Nine", { aliases: ["house"] }), place("The Anvil Yard", { aliases: ["forge"] })];
    expect(defaultMapKey(poetic, "c", [PACK])).toMatch(/^default\/village-/);
  });
});

describe("the default map of a modern city", () => {
  const MODERN: MapPack = {
    id: "modern",
    name: "Modern city",
    maps: ["modern-downtown", "modern-residential", "modern-industrial", "modern-campus", "modern-waterfront", "modern-old-town", "modern-airport", "modern-metropolis", "modern-park", "modern-small-town"].flatMap((kind) => [1, 2, 3, 4].map((n) => ({ id: `${kind}-${n}`, kind, w: 1376, h: 768 }))),
  };
  it("picks a modern plan by what the places are", () => {
    expect(defaultMapKind(["hospital", "police-station", "cafe", "bank", "office", "cinema", "skyscraper", "hotel", "gym", "museum"])).toBe("modern-metropolis");
    expect(defaultMapKind(["hospital", "police-station", "cafe", "bank", "cinema", "gym"])).toBe("modern-downtown");
    expect(defaultMapKind(["suburban-house", "apartment-block", "supermarket", "cafe"])).toBe("modern-residential");
    expect(defaultMapKind(["factory", "warehouse", "power-plant", "office"])).toBe("modern-industrial");
    expect(defaultMapKind(["airport", "hotel", "restaurant"])).toBe("modern-airport");
    expect(defaultMapKind(["harbour-modern", "warehouse", "cafe"])).toBe("modern-waterfront");
    expect(defaultMapKind(["university", "stadium", "cafe", "museum"])).toBe("modern-campus");
    expect(defaultMapKind(["cafe", "bank", "post-office"])).toBe("modern-small-town");
  });
  it("two modern places among many medieval ones are not a modern city", () => {
    expect(defaultMapKind(["tavern", "smithy", "inn", "church", "market", "street", "cafe", "bank"])).toBe("city");
  });
  it("reads the names, picks from any pack that has the kind, and falls back to the region", () => {
    const records = names("Central Hospital", "Police Station", "Corner Cafe", "City Bank", "Grand Cinema", "Iron Gym");
    expect(defaultMapKey(records, "c1", [PACK, MODERN])).toMatch(/^modern\/modern-downtown-[1-4]$/);
    // only the first pack on an engine without the modern one: the region
    expect(defaultMapKey(records, "c1", [PACK])).toMatch(/^default\/region-[1-4]$/);
  });
});
