// The kind a place's name says it is, for the map's icon (#454).
import { describe, expect, it } from "bun:test";
import { FALLBACK_KIND, PLACE_KINDS, placeKind } from "../src/lib/place-kinds";

describe("placeKind", () => {
  it("reads English names, plurals included", () => {
    expect(placeKind("The Rusty Tavern").id).toBe("tavern");
    expect(placeKind("Old Mill").id).toBe("mill");
    expect(placeKind("Mei's apartment").id).toBe("house");
    expect(placeKind("Kitchen").id).toBe("room");
    expect(placeKind("The Forges").id).toBe("smithy");
  });
  it("reads Ukrainian and Russian names by stem", () => {
    expect(placeKind("Таверна «Іржавий кухоль»").id).toBe("tavern");
    expect(placeKind("Стара кузня").id).toBe("smithy");
    expect(placeKind("Темний ліс").id).toBe("forest");
    expect(placeKind("Квартира Мей").id).toBe("house");
    expect(placeKind("Кухня").id).toBe("room");
    expect(placeKind("Каменный мост").id).toBe("bridge");
  });
  it("a bridge is not a city, and a word inside another word is not a hit", () => {
    expect(placeKind("Міст").id).toBe("bridge");
    expect(placeKind("Столиця: місто Лев").id).toBe("city");
    expect(placeKind("Research lab").id).toBe("place");
    expect(placeKind("Goodbarn").id).toBe("place");
  });
  it("tries the other names too, and falls back to the pin", () => {
    expect(placeKind("Rest", "Hearthstone Inn").id).toBe("inn");
    expect(placeKind("").id).toBe(FALLBACK_KIND.id);
    expect(placeKind(null, undefined).id).toBe("place");
  });
  it("the table has unique ids and an emoji each", () => {
    const ids = PLACE_KINDS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of PLACE_KINDS) expect(k.emoji.length).toBeGreaterThan(0);
  });
});
