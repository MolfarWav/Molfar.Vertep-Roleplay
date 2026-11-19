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
    expect(placeKind("Observatory").id).toBe("place");
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

  it("reads the names of a modern city", () => {
    const cases: Record<string, string> = {
      "Central Hospital": "hospital", "St. Mary's Clinic": "hospital", "Main Street Pharmacy": "pharmacy", "Police Station No. 4": "police-station",
      "Fire Station": "fire-station", "Post Office": "post-office", "City Bank": "bank", "National Museum": "museum", "Grand Cinema": "cinema",
      "Karaoke Star": "karaoke", "Neon Nightclub": "nightclub", "Iron Gym": "gym", "City Stadium": "stadium", "State University": "university",
      "Hotel Aurora": "hotel", "Luigi's Restaurant": "restaurant", "Corner Cafe": "cafe", "Metro Station": "subway", "Airport": "airport",
      "Central Railway Station": "train-station", "Bus Stop 12": "bus-stop", "Car Park": "parking", "Gas Station": "gas-station",
      "Container Port": "harbour-modern", "Power Plant": "power-plant", "Old Factory": "factory", "Warehouse 9": "warehouse",
      "Research Laboratory": "lab", "Skyscraper": "skyscraper", "Sunrise Apartments": "apartment-block", "Linden Avenue": "city-street",
      "Лікарня №3": "hospital", "Аптека": "pharmacy", "Вокзал": "train-station", "Хмарочос": "skyscraper", "Кінотеатр": "cinema",
    };
    for (const [name, kind] of Object.entries(cases)) expect(placeKind(name).id, name).toBe(kind);
  });
  it("the older kinds keep their names: a café is not a tavern but a pub is, an inn is not a hotel", () => {
    expect(placeKind("The Rusty Pub").id).toBe("tavern");
    expect(placeKind("Hearthstone Inn").id).toBe("inn");
    expect(placeKind("Mei's apartment").id).toBe("house");
    expect(placeKind("Kitchen").id).toBe("room");
    expect(placeKind("Elm Street").id).toBe("street");
    expect(placeKind("Salt Road").id).toBe("road");
    expect(placeKind("Old School").id).toBe("school");
  });
});
