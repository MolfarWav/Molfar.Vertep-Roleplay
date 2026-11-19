// The places map's logic (Molfar.Vertep#454): the kept shape, the layout of new nodes, a dragged node, the routes.
import { describe, expect, it } from "bun:test";
import { BOARD_H, BOARD_W, MAX_NODES, cleanPlaceMap, layoutMap, moveNode, roadsOf, stepRoute, toggleRoute, visibleRoutes, withPositions, wholeOf, type PlaceMapData } from "../src/lib/place-map";
import type { WorldRecord } from "../src/lib/world";

let n = 0;
const place = (name: string, extra: Partial<WorldRecord> = {}): WorldRecord => ({
  id: `n${++n}`, kind: "place", name, aliases: [], text: "", status: "active", at: n, ...extra,
});
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("cleanPlaceMap", () => {
  it("keeps clean positions and routes, clamps to the board, drops junk", () => {
    const got = cleanPlaceMap({
      v: 1,
      nodes: { n1: { x: 10.4, y: 99999 }, n2: { x: "a", y: 1 }, "": { x: 1, y: 1 }, n3: null },
      routes: [{ a: "n2", b: "n1" }, { a: "n1", b: "n2" }, { a: "n1", b: "n1" }, { a: 5, b: "x" }],
      picture: { id: "bg1" },
      at: "n1",
    });
    expect(got?.nodes.n1).toEqual({ x: 70, y: BOARD_H - 70 });
    expect(Object.keys(got?.nodes ?? {})).toEqual(["n1"]);
    expect(got?.routes).toEqual([{ a: "n1", b: "n2" }]);
    expect(got?.picture).toEqual({ id: "bg1" });
    expect(got?.at).toBe("n1");
  });
  it("is null when nothing is left", () => {
    expect(cleanPlaceMap(null)).toBeNull();
    expect(cleanPlaceMap([])).toBeNull();
    expect(cleanPlaceMap({ nodes: { a: { x: "q" } }, routes: [] })).toBeNull();
  });
  it("caps the nodes", () => {
    const nodes: Record<string, { x: number; y: number }> = {};
    for (let i = 0; i < MAX_NODES + 30; i++) nodes[`k${i}`] = { x: 100, y: 100 };
    expect(Object.keys(cleanPlaceMap({ nodes })?.nodes ?? {}).length).toBe(MAX_NODES);
  });
});

describe("layoutMap", () => {
  it("puts the first place in the middle and the others apart from each other, inside the board", () => {
    const rs = Array.from({ length: 12 }, (_, i) => place(`Place ${i}`));
    const { nodes, added } = layoutMap(rs, null, rs[0].id);
    expect(Object.keys(added).length).toBe(12);
    expect(nodes[0]).toMatchObject({ x: BOARD_W / 2, y: BOARD_H / 2 });
    for (const a of nodes) {
      expect(a.x).toBeGreaterThanOrEqual(70);
      expect(a.x).toBeLessThanOrEqual(BOARD_W - 70);
      expect(a.y).toBeGreaterThanOrEqual(70);
      expect(a.y).toBeLessThanOrEqual(BOARD_H - 70);
      for (const b of nodes) if (a !== b) expect(dist(a, b)).toBeGreaterThanOrEqual(119);
    }
  });
  it("lays places out oldest first, so the first one is in the middle even when the book lists the newest first", () => {
    const rs = [place("C"), place("B"), place("A")].reverse().reverse();
    const newestFirst = [...rs].sort((x, y) => y.id.localeCompare(x.id, "en", { numeric: true }));
    const { nodes } = layoutMap(newestFirst, null, null);
    const oldest = [...rs].sort((x, y) => x.id.localeCompare(y.id, "en", { numeric: true }))[0];
    expect(nodes.find((x) => x.id === oldest.id)).toMatchObject({ x: BOARD_W / 2, y: BOARD_H / 2 });
  });
  it("is the same every time", () => {
    const rs = Array.from({ length: 6 }, (_, i) => place(`P${i}`));
    expect(layoutMap(rs, null, null)).toEqual(layoutMap(rs, null, null));
  });
  it("never moves a node that has a position, and a new place lands next to the place the story is in", () => {
    const a = place("Inn");
    const b = place("Forge");
    const data: PlaceMapData = { v: 1, nodes: { [a.id]: { x: 300, y: 300 } }, routes: [] };
    const { nodes, added } = layoutMap([a, b], data, a.id);
    expect(nodes.find((x) => x.id === a.id)).toMatchObject({ x: 300, y: 300 });
    expect(Object.keys(added)).toEqual([b.id]);
    const nb = nodes.find((x) => x.id === b.id)!;
    expect(dist(nb, { x: 300, y: 300 })).toBeLessThan(260);
  });
  it("puts a new place next to the end of a route that reaches it", () => {
    const a = place("Inn");
    const far = place("Mill");
    const c = place("Camp");
    const data: PlaceMapData = { v: 1, nodes: { [a.id]: { x: 200, y: 200 }, [far.id]: { x: 1300, y: 800 } }, routes: [{ a: c.id, b: far.id }] };
    const got = layoutMap([a, far, c], data, a.id).nodes.find((x) => x.id === c.id)!;
    expect(dist(got, { x: 1300, y: 800 })).toBeLessThan(dist(got, { x: 200, y: 200 }));
  });
  it("puts spots around their place, close, and leaves retired places out", () => {
    const home = place("Home");
    const kitchen = place("Kitchen", { size: "spot", inside: "Home" });
    const gone = place("Old mill", { status: "past" });
    const data: PlaceMapData = { v: 1, nodes: { [home.id]: { x: 800, y: 500 } }, routes: [] };
    const { nodes } = layoutMap([home, kitchen, gone], data, kitchen.id);
    expect(nodes.map((x) => x.id).sort()).toEqual([home.id, kitchen.id].sort());
    const k = nodes.find((x) => x.id === kitchen.id)!;
    expect(k.spot).toBe(true);
    expect(k.parentId).toBe(home.id);
    expect(k.here).toBe(true);
    expect(dist(k, { x: 800, y: 500 })).toBeLessThan(130);
  });
  it("a spot whose place is not in the book is a place of its own", () => {
    const s = place("Attic", { size: "spot", inside: "Nowhere" });
    expect(layoutMap([s], null, null).nodes[0]).toMatchObject({ spot: false, parentId: null });
  });
});

describe("moveNode and withPositions", () => {
  it("clamps, and a place takes its spots along", () => {
    const d: PlaceMapData = { v: 1, nodes: { a: { x: 400, y: 400 }, s: { x: 450, y: 440 } }, routes: [] };
    const m = moveNode(d, "a", { x: 600, y: 500 }, ["s"]);
    expect(m.nodes.a).toEqual({ x: 600, y: 500 });
    expect(m.nodes.s).toEqual({ x: 650, y: 540 });
    expect(moveNode(d, "a", { x: -50, y: 99999 }).nodes.a).toEqual({ x: 70, y: BOARD_H - 70 });
  });
  it("a spot dragged alone does not move its place", () => {
    const d: PlaceMapData = { v: 1, nodes: { a: { x: 400, y: 400 }, s: { x: 450, y: 440 } }, routes: [] };
    const m = moveNode(d, "s", { x: 300, y: 300 });
    expect(m.nodes.a).toEqual({ x: 400, y: 400 });
    expect(m.nodes.s).toEqual({ x: 300, y: 300 });
  });
  it("withPositions merges and keeps the picture and routes", () => {
    const d: PlaceMapData = { v: 1, nodes: { a: { x: 1, y: 1 } }, routes: [{ a: "a", b: "b" }], picture: { id: "p" } };
    const m = withPositions(d, { c: { x: 5, y: 5 } });
    expect(Object.keys(m.nodes).sort()).toEqual(["a", "c"]);
    expect(m.picture).toEqual({ id: "p" });
    expect(m.routes).toHaveLength(1);
  });
});

describe("stepRoute", () => {
  const inn = place("Inn");
  const forge = place("Forge");
  const cellar = place("Cellar", { size: "spot", inside: "Inn" });
  const book = [inn, forge, cellar];
  it("the first sight only sets where the story is", () => {
    const d = stepRoute(null, book, inn.id);
    expect(d).toMatchObject({ at: inn.id, routes: [] });
  });
  it("a move to another whole place adds one route, once", () => {
    const d1 = stepRoute(null, book, inn.id);
    const d2 = stepRoute(d1, book, forge.id)!;
    expect(d2.routes).toEqual([inn.id < forge.id ? { a: inn.id, b: forge.id } : { a: forge.id, b: inn.id }]);
    expect(d2.at).toBe(forge.id);
    const d3 = stepRoute(stepRoute(d2, book, inn.id), book, forge.id)!;
    expect(d3.routes).toHaveLength(1);
  });
  it("a move between spots of one place is not a journey; the same place twice changes nothing", () => {
    const d1 = stepRoute(null, book, inn.id);
    expect(stepRoute(d1, book, cellar.id)).toBe(d1);
    expect(stepRoute(d1, book, inn.id)).toBe(d1);
  });
  it("a spot counts as its whole place, and an unknown place changes nothing", () => {
    expect(wholeOf(book, cellar.id)).toBe(inn.id);
    const d1 = stepRoute(null, book, forge.id);
    expect(stepRoute(d1, book, null)).toBe(d1);
    expect(stepRoute(d1, book, "zzz")).toBe(d1);
    const d2 = stepRoute(d1, book, cellar.id)!;
    expect(d2.at).toBe(inn.id);
    expect(d2.routes).toHaveLength(1);
  });
  it("a place that left the book starts no route", () => {
    const d1: PlaceMapData = { v: 1, nodes: {}, routes: [], at: "gone" };
    expect(stepRoute(d1, book, forge.id)).toMatchObject({ at: forge.id, routes: [] });
  });
  it("visibleRoutes keeps only the routes whose both ends are on the map", () => {
    const d: PlaceMapData = { v: 1, nodes: {}, routes: [{ a: "a", b: "b" }, { a: "a", b: "z" }] };
    const nodes = [{ id: "a" }, { id: "b" }] as never;
    expect(visibleRoutes(d, nodes)).toEqual([{ a: "a", b: "b" }]);
  });
});

describe("map labels (a place renamed on the map only)", () => {
  it("are kept clean: squeezed, 80 characters, never empty, never for a nameless id", () => {
    const out = cleanPlaceMap({ v: 1, labels: { n1: "  The   Rusty \n Mug ", n2: "", n3: 5, "": "x", n4: "y".repeat(200) } });
    expect(out?.labels).toEqual({ n1: "The Rusty Mug", n4: "y".repeat(80) });
    expect(cleanPlaceMap({ v: 1, labels: {} })).toBeNull();
    expect(cleanPlaceMap({ v: 1, labels: [1, 2] })).toBeNull();
  });

  it("show on the node, the record keeps its own name, and the kind is read from both", async () => {
    const { placeKind } = await import("../src/lib/place-kinds");
    const tavern = place("Таверна «Іржавий кухоль»");
    const plain = place("Old Forge");
    const { nodes } = layoutMap([tavern, plain], { v: 1, nodes: {}, routes: [], labels: { [tavern.id]: "The Rusty Mug" } }, null);
    expect(nodes[0]).toMatchObject({ id: tavern.id, name: "The Rusty Mug", bookName: "Таверна «Іржавий кухоль»" });
    expect(nodes[0].names).toEqual(["The Rusty Mug", "Таверна «Іржавий кухоль»"]);
    expect(placeKind(...nodes[0].names).id).toBe("tavern");
    expect(nodes[1]).toMatchObject({ name: "Old Forge", bookName: "Old Forge" });
  });

  it("survive a drag, a new position, a road and a reset of the layout", () => {
    const a = place("A");
    const b = place("B");
    const data = { v: 1 as const, nodes: {}, routes: [], labels: { [a.id]: "Home" } };
    const laid = layoutMap([a, b], data, a.id);
    const moved = moveNode(withPositions(data, laid.added), a.id, { x: 300, y: 300 }, []);
    expect(moved.labels).toEqual({ [a.id]: "Home" });
    const stepped = stepRoute(stepRoute(moved, [a, b], a.id), [a, b], b.id);
    expect(stepped?.labels).toEqual({ [a.id]: "Home" });
    expect(stepped?.routes.length).toBe(1);
  });
});

describe("roads drawn by hand", () => {
  it("toggleRoute joins two places, and a second call takes the road away", () => {
    const one = toggleRoute(null, "n2", "n1");
    expect(one.added).toBe(true);
    expect(one.data.routes).toEqual([{ a: "n1", b: "n2" }]);
    const two = toggleRoute(one.data, "n1", "n2");
    expect(two.added).toBe(false);
    expect(two.data.routes).toEqual([]);
  });
  it("ignores a road from a place to itself or an empty id", () => {
    expect(toggleRoute(null, "n1", "n1")).toEqual({ data: { v: 1, nodes: {}, routes: [] }, added: false });
    expect(toggleRoute(null, "", "n1").data.routes).toEqual([]);
  });
  it("keeps the rest of the map and the newest 400 roads", () => {
    const base = { v: 1 as const, nodes: { n1: { x: 100, y: 100 } }, routes: [], at: "n1", labels: { n1: "Home" }, picture: { id: "p" } };
    const r = toggleRoute(base, "n1", "n2").data;
    expect(r).toMatchObject({ nodes: base.nodes, at: "n1", labels: base.labels, picture: base.picture });
    let d: PlaceMapData = { ...base, routes: Array.from({ length: 400 }, (_, i) => ({ a: `a${String(i).padStart(3, "0")}`, b: `b${i}` })) };
    d = toggleRoute(d, "x", "y").data;
    expect(d.routes.length).toBe(400);
    expect(d.routes[399]).toEqual({ a: "x", b: "y" });
  });
  it("a hand road and a tracked road are the same road: the tracker does not add it again", () => {
    const a = place("A");
    const b = place("B");
    const hand = toggleRoute({ v: 1, nodes: {}, routes: [], at: a.id }, a.id, b.id).data;
    const walked = stepRoute(hand, [a, b], b.id);
    expect(walked?.routes.length).toBe(1);
  });
  it("roadsOf counts the roads at a place", () => {
    const d = { v: 1 as const, nodes: {}, routes: [{ a: "n1", b: "n2" }, { a: "n1", b: "n3" }, { a: "n2", b: "n3" }] };
    expect(roadsOf(d, "n1")).toBe(2);
    expect(roadsOf(d, "n9")).toBe(0);
    expect(roadsOf(null, "n1")).toBe(0);
  });
});

describe("icons picked by hand", () => {
  it("are kept clean: only <kind>-<n> keys of lowercase words, a number 1 to 99", () => {
    const out = cleanPlaceMap({ v: 1, icons: { n1: "tavern-3", n2: "battle-field-12", n3: "Tavern-1", n4: "tavern", n5: "tavern-0", n6: "tavern-100", n7: 5, "": "inn-1" } });
    expect(out?.icons).toEqual({ n1: "tavern-3", n2: "battle-field-12" });
    expect(cleanPlaceMap({ v: 1, icons: {} })).toBeNull();
    expect(cleanPlaceMap({ v: 1, icons: ["inn-1"] })).toBeNull();
  });
  it("show on the node; a bad key is ignored there too", () => {
    const a = place("Corner");
    const b = place("Other");
    const { nodes } = layoutMap([a, b], { v: 1, nodes: {}, routes: [], icons: { [a.id]: "castle-2", [b.id]: "Not A Key" } }, null);
    expect(nodes[0].icon).toBe("castle-2");
    expect(nodes[1].icon).toBeNull();
  });
  it("setIcon puts one in, takes it off with null, and leaves the rest of the map alone", async () => {
    const { setIcon } = await import("../src/lib/place-map");
    const base = { v: 1 as const, nodes: { n1: { x: 100, y: 100 } }, routes: [], labels: { n1: "Home" } };
    const one = setIcon(base, "n1", "inn-2");
    expect(one).toMatchObject({ nodes: base.nodes, labels: base.labels, icons: { n1: "inn-2" } });
    expect(setIcon(one, "n1", "bad key").icons).toBeUndefined();
    const off = setIcon(one, "n1", null);
    expect(off.icons).toBeUndefined();
    expect(off.nodes).toEqual(base.nodes);
    expect(setIcon(null, "n9", "inn-1").icons).toEqual({ n9: "inn-1" });
  });
});
