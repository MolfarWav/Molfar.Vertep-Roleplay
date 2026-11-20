// Several maps in one chat (Molfar.Vertep#473): the kept shape, which map a place stands on, the story's place on another map,
// roads on the maps that have both ends, travel by scale.
import { describe, expect, it } from "bun:test";
import {
  MAIN_LEVEL, addLevel, cleanPlaceMap, layoutLevels, levelIds, levelInfo, levelOfPlan, levelSlice, parentLevel, putSlice, removeLevel, setLevelInfo, setMembers, stepRoute, wholePlaces, type PlaceMapData,
} from "../src/lib/place-map";
import { footMinutes, minutesFor, modesFor, spanOfMinutes, travelDirection } from "../src/lib/place-travel";
import { defaultMapKey, type MapPack } from "../src/lib/map-packs";
import { MAP_GEN_KINDS, defaultGenKind, mapPrompt } from "../src/lib/map-generate";
import { loadLevel, saveLevel } from "../src/lib/place-map-level";
import type { WorldRecord } from "../src/lib/world";

let n = 0;
const place = (name: string, extra: Partial<WorldRecord> = {}): WorldRecord => ({
  id: `n${++n}`, kind: "place", name, aliases: [], text: "", status: "active", at: n, ...extra,
});

describe("cleanPlaceMap with levels", () => {
  it("keeps clean levels and drops junk ones", () => {
    const got = cleanPlaceMap({
      v: 1, nodes: { n1: { x: 100, y: 100 } }, routes: [], name: "  The   Vale ", scale: "region",
      levels: [
        { id: "l1", name: "Oakford", scale: "town", plan: "n2", nodes: { n3: { x: 5, y: 5 } }, routes: [{ a: "n4", b: "n3", minutes: 1200000 }], picture: { builtin: "default/city-1" } },
        { id: "l1", name: "Duplicate", nodes: {}, routes: [] },
        { id: "bad", name: "x" },
        { id: "l2", name: "", nodes: {} },
        { id: "l3", name: "Sky", scale: "moon", nodes: { n9: { x: 1, y: 1 } } },
        null,
      ],
    });
    expect(got?.name).toBe("The Vale");
    expect(got?.scale).toBe("region");
    expect(got?.levels?.map((l) => l.id)).toEqual(["l1", "l3"]);
    const l1 = got?.levels?.[0];
    expect(l1?.plan).toBe("n2");
    expect(l1?.nodes.n3).toEqual({ x: 70, y: 70 });
    expect(l1?.routes).toEqual([{ a: "n3", b: "n4" }]);
    expect(l1?.picture).toEqual({ builtin: "default/city-1" });
    expect(got?.levels?.[1]?.scale).toBe("town");
  });
  it("caps the levels at 12 and keeps town scale as the default (not written)", () => {
    const levels = Array.from({ length: 20 }, (_, i) => ({ id: `l${i + 1}`, name: `M${i}`, nodes: {} }));
    expect(cleanPlaceMap({ levels })?.levels?.length).toBe(12);
    expect(cleanPlaceMap({ name: "A", scale: "town" })?.scale).toBeUndefined();
  });
  it("a chat with only levels or a name is not empty", () => {
    expect(cleanPlaceMap({ levels: [{ id: "l1", name: "Cave", nodes: {} }] })).not.toBeNull();
    expect(cleanPlaceMap({ name: "World" })).not.toBeNull();
  });
});

describe("slices", () => {
  const data: PlaceMapData = {
    v: 1, nodes: { a: { x: 100, y: 100 } }, routes: [], at: "a", labels: { a: "Alpha" },
    levels: [{ id: "l1", name: "Inner", scale: "town", nodes: { b: { x: 200, y: 200 } }, routes: [], picture: { none: true } }],
  };
  it("a slice is one map with what all maps share, and goes back where it came from", () => {
    const s = levelSlice(data, "l1");
    expect(s.nodes).toEqual({ b: { x: 200, y: 200 } });
    expect(s.picture).toEqual({ none: true });
    expect(s.at).toBe("a");
    expect(s.labels).toEqual({ a: "Alpha" });
    const back = putSlice(data, "l1", { ...s, nodes: { b: { x: 300, y: 300 } }, labels: { a: "Alpha", b: "Beta" } });
    expect(back.levels?.[0]?.nodes.b).toEqual({ x: 300, y: 300 });
    expect(back.nodes).toEqual(data.nodes);
    expect(back.labels?.b).toBe("Beta");
    expect(back.levels?.[0]?.name).toBe("Inner");
  });
  it("the first map's slice drops the levels and putting it back keeps them", () => {
    const s = levelSlice(data, MAIN_LEVEL);
    expect(s.levels).toBeUndefined();
    const back = putSlice(data, MAIN_LEVEL, { ...s, nodes: { a: { x: 1, y: 1 } } });
    expect(back.levels?.length).toBe(1);
    expect(back.nodes.a).toEqual({ x: 1, y: 1 });
  });
  it("a picture taken off a slice is taken off that map only", () => {
    const s = levelSlice(data, "l1");
    const { picture: _p, ...rest } = s;
    const back = putSlice(data, "l1", rest);
    expect(back.levels?.[0]?.picture).toBeUndefined();
    const withMain: PlaceMapData = { ...data, picture: { id: "x" } };
    expect(putSlice(withMain, "l1", rest).picture).toEqual({ id: "x" });
  });
});

describe("layoutLevels", () => {
  it("with one map every place is on it, as before", () => {
    const rs = [place("Inn"), place("Forge")];
    const { data, layouts } = layoutLevels(rs, null, null);
    expect(layouts.length).toBe(1);
    expect(layouts[0]?.nodes.length).toBe(2);
    expect(Object.keys(data?.nodes ?? {}).sort()).toEqual(rs.map((r) => r.id).sort());
  });
  it("a place stands only on the maps that have it; a new place goes to the map the story is on", () => {
    const city = place("Oakford city");
    const inn = place("The Rusty Inn");
    const forge = place("Old Forge");
    const rs = [city, inn, forge];
    let d: PlaceMapData | null = { v: 1, nodes: { [city.id]: { x: 800, y: 500 } }, routes: [] };
    d = addLevel(d, rs, { name: "Oakford plan", scale: "town", plan: city.id }).data;
    d = setMembers(d, rs, "l1", [inn.id]);
    // the forge is new and the story is in the inn (on l1)
    const out = layoutLevels(rs, d, inn.id);
    const main = out.layouts.find((l) => l.id === MAIN_LEVEL)!;
    const l1 = out.layouts.find((l) => l.id === "l1")!;
    expect(main.nodes.map((x) => x.id)).toEqual([city.id]);
    expect(l1.nodes.map((x) => x.id).sort()).toEqual([forge.id, inn.id].sort());
    expect(out.data?.levels?.[0]?.nodes[forge.id]).toBeDefined();
    expect(out.data?.nodes[forge.id]).toBeUndefined();
  });
  it("the story's place on a map that does not hold it is the place the map above stands for", () => {
    const city = place("Oakford city");
    const inn = place("The Rusty Inn");
    const rs = [city, inn];
    let d: PlaceMapData | null = { v: 1, nodes: { [city.id]: { x: 800, y: 500 } }, routes: [] };
    d = addLevel(d, rs, { name: "Oakford plan", scale: "town", plan: city.id }).data;
    d = setMembers(d, rs, "l1", [inn.id]);
    const out = layoutLevels(rs, d, inn.id);
    expect(out.layouts.find((l) => l.id === "l1")!.nodes.find((x) => x.here)?.id).toBe(inn.id);
    expect(out.layouts.find((l) => l.id === MAIN_LEVEL)!.nodes.find((x) => x.here)?.id).toBe(city.id);
  });
  it("a new city also goes to the region and world maps, a new tavern does not", () => {
    const cap = place("Capital city");
    const rs0 = [cap];
    let d: PlaceMapData | null = { v: 1, nodes: { [cap.id]: { x: 800, y: 500 } }, routes: [] };
    d = addLevel(d, rs0, { name: "Country", scale: "world" }).data;
    const town = place("Harrow village");
    const tavern = place("The Anchor tavern");
    const rs = [cap, town, tavern];
    const out = layoutLevels(rs, d, cap.id);
    expect(out.layouts.find((l) => l.id === "l1")!.nodes.map((x) => x.id)).toContain(town.id);
    expect(out.layouts.find((l) => l.id === "l1")!.nodes.map((x) => x.id)).not.toContain(tavern.id);
    expect(out.layouts.find((l) => l.id === MAIN_LEVEL)!.nodes.map((x) => x.id)).toContain(tavern.id);
  });
  it("rooms follow their place on a town map and are left off a region map", () => {
    const house = place("Hartwell house");
    const room = place("Kitchen", { inside: "Hartwell house", size: "spot" });
    const rs = [house, room];
    let d: PlaceMapData | null = { v: 1, nodes: { [house.id]: { x: 800, y: 500 } }, routes: [] };
    d = addLevel(d, rs, { name: "Land", scale: "region" }).data;
    d = setMembers(d, rs, "l1", [house.id]);
    const out = layoutLevels(rs, d, null);
    expect(out.layouts.find((l) => l.id === MAIN_LEVEL)!.nodes.length).toBe(2);
    expect(out.layouts.find((l) => l.id === "l1")!.nodes.map((x) => x.id)).toEqual([house.id]);
  });
});

describe("levels as data", () => {
  it("addLevel makes a level; a region or world map starts with the cities and villages", () => {
    const rs = [place("Capital city"), place("Wayside tavern"), place("Harrow village")];
    const made = addLevel(null, rs, { name: "Kingdom", scale: "world" });
    expect(made.id).toBe("l1");
    expect(Object.keys(made.data.levels?.[0]?.nodes ?? {}).sort()).toEqual([rs[0]!.id, rs[2]!.id].sort());
    const empty = addLevel(made.data, rs, { name: "Cave", scale: "town" });
    expect(empty.id).toBe("l2");
    expect(empty.data.levels?.[1]?.nodes).toEqual({});
  });
  it("addLevel stops at the limit", () => {
    let d: PlaceMapData | null = null;
    for (let i = 0; i < 12; i++) d = addLevel(d, [], { name: `M${i}`, scale: "town" }).data;
    expect(addLevel(d, [], { name: "one more", scale: "town" }).id).toBeNull();
  });
  it("setMembers puts exactly these places on a map, keeps their positions and the roads between them", () => {
    const a = place("Alpha city");
    const b = place("Beta city");
    const c = place("Gamma city");
    const rs = [a, b, c];
    let d: PlaceMapData | null = { v: 1, nodes: { [a.id]: { x: 300, y: 300 }, [b.id]: { x: 700, y: 300 }, [c.id]: { x: 900, y: 600 } }, routes: [{ a: a.id, b: b.id }, { a: b.id, b: c.id }] };
    d = setMembers(d, rs, MAIN_LEVEL, [a.id, b.id]);
    expect(Object.keys(d.nodes).sort()).toEqual([a.id, b.id].sort());
    expect(d.nodes[a.id]).toEqual({ x: 300, y: 300 });
    expect(d.routes).toEqual([{ a: a.id, b: b.id }]);
  });
  it("setLevelInfo renames, rescales and links a level, and names the first map", () => {
    let d = addLevel(null, [], { name: "Cave", scale: "town" }).data;
    d = setLevelInfo(d, "l1", { name: "  Deep   cave ", scale: "region", plan: "n5" });
    expect(levelInfo(d, "l1")).toEqual({ id: "l1", name: "Deep cave", scale: "region", plan: "n5" });
    expect(levelOfPlan(d, "n5")).toBe("l1");
    d = setLevelInfo(d, "l1", { plan: null });
    expect(levelOfPlan(d, "n5")).toBeNull();
    d = setLevelInfo(d, MAIN_LEVEL, { name: "Country", scale: "world" });
    expect(levelInfo(d, MAIN_LEVEL).name).toBe("Country");
    expect(levelInfo(d, MAIN_LEVEL).scale).toBe("world");
    expect(levelInfo(null, MAIN_LEVEL, "Map")).toEqual({ id: MAIN_LEVEL, name: "Map", scale: "town", plan: null });
  });
  it("parentLevel is the map that holds the place a level is the plan of", () => {
    const city = place("Oakford city");
    let d: PlaceMapData | null = { v: 1, nodes: { [city.id]: { x: 800, y: 500 } }, routes: [] };
    d = addLevel(d, [city], { name: "Oakford", scale: "town", plan: city.id }).data;
    expect(parentLevel(d, "l1")).toBe(MAIN_LEVEL);
    expect(parentLevel(d, MAIN_LEVEL)).toBeNull();
    expect(levelIds(d)).toEqual([MAIN_LEVEL, "l1"]);
  });
  it("removeLevel takes it away; the first map stays", () => {
    const d = addLevel(null, [], { name: "Cave", scale: "town" }).data;
    expect(removeLevel(d, "l1")?.levels).toBeUndefined();
    expect(removeLevel(d, MAIN_LEVEL)).toBe(d);
  });
  it("wholePlaces leaves rooms out", () => {
    const house = place("House");
    const room = place("Cellar", { inside: "House", size: "spot" });
    expect(wholePlaces([house, room], null).map((r) => r.id)).toEqual([house.id]);
  });
});

describe("roads between levels", () => {
  it("the story's move adds a road only on the maps that have both places", () => {
    const a = place("Alpha city");
    const b = place("Beta city");
    const c = place("Cave");
    const rs = [a, b, c];
    let d: PlaceMapData | null = { v: 1, nodes: { [a.id]: { x: 100, y: 100 }, [b.id]: { x: 400, y: 100 } }, routes: [], at: a.id };
    d = addLevel(d, rs, { name: "Inner", scale: "town" }).data;
    d = setMembers(d, rs, "l1", [c.id, b.id]);
    const moved = stepRoute(d, rs, b.id)!;
    expect(moved.routes).toEqual([{ a: a.id, b: b.id }]);
    expect(moved.levels?.[0]?.routes).toEqual([]);
    expect(moved.at).toBe(b.id);
  });
});

describe("travel by scale", () => {
  const A = { x: 0, y: 0 };
  const B = { x: 600, y: 0 };
  it("a region trip takes hours and a world trip days", () => {
    expect(footMinutes(A, B, "town")).toBe(60);
    expect(footMinutes(A, B, "region")).toBe(1800);
    expect(footMinutes(A, B, "world")).toBe(24000);
    expect(spanOfMinutes(24000)).toBe("16 days 16 hours");
    expect(spanOfMinutes(1800)).toBe("1 day 6 hours");
  });
  it("long trips are told in round numbers", () => {
    expect(footMinutes({ x: 0, y: 0 }, { x: 1000, y: 70 }, "region")).toBe(3000);
    expect(footMinutes({ x: 0, y: 0 }, { x: 110, y: 0 }, "region")).toBe(330);
  });
  it("a taxi and the metro are faster than walking, the metro has a wait", () => {
    expect(minutesFor(60, "taxi")).toBe(10);
    expect(minutesFor(60, "metro")).toBe(25);
    expect(minutesFor(30, "foot")).toBe(30);
  });
  it("the ways of travel depend on the scale", () => {
    expect(modesFor("town")).toEqual(["foot", "ride", "taxi", "metro", "skip"]);
    expect(modesFor("region")).toEqual(["foot", "ride", "taxi", "skip"]);
    expect(modesFor("world")).toEqual(["foot", "ride", "skip"]);
  });
  it("the direction names the way", () => {
    const base = { from: "Kyiv", to: "Lviv", minutes: 90, via: null, within: false };
    expect(travelDirection({ ...base, mode: "taxi" })).toContain("by taxi");
    expect(travelDirection({ ...base, mode: "metro" })).toContain("by metro");
    expect(travelDirection({ ...base, mode: "foot", minutes: 4000 })).toContain("2 days 18 hours");
  });
});

describe("a map for a level", () => {
  const packs: MapPack[] = [{ id: "default", name: "Default", maps: [{ id: "city-1", kind: "city", w: 1, h: 1 }, { id: "region-1", kind: "region", w: 1, h: 1 }] }];
  it("a region or world level starts from a region map, whatever the places are", () => {
    const rs = ["Tavern", "Smithy", "Church", "Market", "Shop", "Inn"].map((nm) => place(nm));
    expect(defaultMapKey(rs, "chat1", packs, "town")).toBe("default/city-1");
    expect(defaultMapKey(rs, "chat1", packs, "region")).toBe("default/region-1");
    expect(defaultMapKey(rs, "chat1", packs, "world")).toBe("default/region-1");
  });
});

describe("drawing a map", () => {
  it("every kind has a prompt with the look, the subject and no text on the picture", () => {
    for (const k of MAP_GEN_KINDS) {
      const p = mapPrompt(k);
      expect(p).toContain("Subject:");
      expect(p).toContain("No text");
      expect(p).toContain("16:9");
      expect(p).toContain("plots empty");
    }
  });
  it("names the places and the map, and a modern kind says it is modern", () => {
    const p = mapPrompt("modern-downtown", ["The Anchor", " ", "Old   Forge"], "Kyiv centre");
    expect(p).toContain("The Anchor, Old Forge");
    expect(p).toContain("Kyiv centre");
    expect(p).toContain("modern");
    expect(mapPrompt("city")).not.toContain("modern");
  });
  it("an unknown kind falls back to a region; the start kind follows the scale", () => {
    expect(mapPrompt("nonsense")).toContain("fantasy region");
    expect(defaultGenKind("world")).toBe("continent");
    expect(defaultGenKind("region")).toBe("region");
    expect(defaultGenKind("town", "city")).toBe("city");
  });
});

describe("the map on view", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  it("is kept per chat in the browser; main is the default and is not stored", () => {
    const st = mem();
    expect(loadLevel("c1", st)).toBe("main");
    saveLevel("c1", "l2", st);
    expect(loadLevel("c1", st)).toBe("l2");
    expect(loadLevel("c2", st)).toBe("main");
    saveLevel("c1", "main", st);
    expect(loadLevel("c1", st)).toBe("main");
    st.setItem("rp.map.level.c3", "<script>");
    expect(loadLevel("c3", st)).toBe("main");
    expect(loadLevel("c1", null)).toBe("main");
  });
});
