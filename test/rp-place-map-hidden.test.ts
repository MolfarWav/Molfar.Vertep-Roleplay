// Hiding places from the maps (the owner's "delete places that moved onto the map", 2026-11-25): a hidden place (and the rooms of a hidden
// whole place) stands on no map, the World book keeps it, and showing it again puts it back where it stood.
import { describe, expect, it } from "bun:test";
import { addLevel, cleanPlaceMap, hiddenIds, layoutLevels, levelSlice, placeRows, putSlice, setHidden, setMembers, withPositions, type PlaceMapData } from "../src/lib/place-map";
import type { WorldRecord } from "../src/lib/world";

let n = 0;
const place = (name: string, extra: Partial<WorldRecord> = {}): WorldRecord => ({
  id: `q${++n}`, kind: "place", name, aliases: [], text: "", status: "active", at: n, ...extra,
});
const flat = place("Flat", { size: "whole" as never });
const corridor = place("Corridor", { size: "spot", inside: "Flat" });
const kitchen = place("Kitchen", { size: "spot", inside: "Flat" });
const park = place("Park");
const records = [flat, corridor, kitchen, park];
const ids = (d: PlaceMapData | null) => layoutLevels(records, d, null).layouts[0].nodes.map((x) => x.id).sort();

describe("hidden places", () => {
  it("are kept clean: unique ids, 80 characters, 200 at most, nothing else", () => {
    expect(cleanPlaceMap({ hidden: ["a", "a", "", 7, "b"] })?.hidden).toEqual(["a", "b"]);
    expect(cleanPlaceMap({ hidden: ["x".repeat(81)] })).toBeNull();
    expect(cleanPlaceMap({ hidden: Array.from({ length: 300 }, (_, i) => `p${i}`) })?.hidden?.length).toBe(200);
    expect(cleanPlaceMap({ hidden: "a" })).toBeNull();
  });
  it("setHidden hides, shows, and returns the same object when nothing changes", () => {
    const d = setHidden(null, [corridor.id], true)!;
    expect(d.hidden).toEqual([corridor.id]);
    expect(setHidden(d, [corridor.id], true)).toBe(d);
    expect(setHidden(d, [kitchen.id], false)).toBe(d);
    expect(setHidden(null, [kitchen.id], false)).toBeNull();
    const back = setHidden(d, [corridor.id], false)!;
    expect(back.hidden).toBeUndefined();
  });
  it("a hidden room leaves the map, the others stay", () => {
    expect(ids(null)).toEqual([flat.id, corridor.id, kitchen.id, park.id].sort());
    expect(ids(setHidden(null, [corridor.id], true))).toEqual([flat.id, kitchen.id, park.id].sort());
  });
  it("a hidden whole place takes its rooms along, and shows them again with it", () => {
    const d = setHidden(null, [flat.id], true);
    expect(ids(d)).toEqual([park.id]);
    expect([...hiddenIds(records, d)].sort()).toEqual([flat.id, corridor.id, kitchen.id].sort());
    expect(ids(setHidden(d, [flat.id], false))).toEqual([flat.id, corridor.id, kitchen.id, park.id].sort());
  });
  it("a place comes back where it stood", () => {
    const laid = layoutLevels(records, null, null);
    const placed = withPositions(null, laid.layouts[0].added);
    const pos = laid.layouts[0].nodes.find((x) => x.id === corridor.id)!;
    const hid = setHidden(placed, [corridor.id], true);
    expect(layoutLevels(records, hid, null).data?.nodes[corridor.id]).toEqual({ x: pos.x, y: pos.y });
    const shown = layoutLevels(records, setHidden(hid, [corridor.id], false), null).layouts[0].nodes.find((x) => x.id === corridor.id)!;
    expect([shown.x, shown.y]).toEqual([pos.x, pos.y]);
  });
  it("hold on every map of a chat, and survive a slice round trip", () => {
    const withLevel = addLevel(setHidden(null, [park.id], true), records, { name: "Town", scale: "region" }).data;
    expect(levelSlice(withLevel, "main").hidden).toEqual([park.id]);
    expect(levelSlice(withLevel, "l1").hidden).toEqual([park.id]);
    const put = putSlice(withLevel, "l1", { ...levelSlice(withLevel, "l1"), hidden: [park.id, kitchen.id] });
    expect(put.hidden).toEqual([park.id, kitchen.id]);
    const gone = layoutLevels(records, put, null).layouts;
    expect(gone.every((l) => !l.nodes.some((x) => x.id === park.id || x.id === kitchen.id))).toBe(true);
  });
  it("placeRows lists a whole place and its rooms, with what the maps do with each", () => {
    const rows = placeRows(records, setHidden(null, [flat.id], true));
    expect(rows.map((r) => [r.name, r.spot, r.hidden, r.viaParent])).toEqual([
      ["Flat", false, true, false], ["Corridor", true, true, true], ["Kitchen", true, true, true], ["Park", false, false, false],
    ]);
    const own = placeRows(records, setHidden(null, [corridor.id], true)).find((r) => r.id === corridor.id)!;
    expect(own).toMatchObject({ hidden: true, viaParent: false, parentName: "Flat" });
  });
  it("hiding does not touch which maps a place stands on", () => {
    const d = setMembers(null, records, "main", [flat.id, park.id]);
    const hid = setHidden(d, [flat.id], true)!;
    expect(hid.nodes).toEqual(d.nodes);
  });
});
