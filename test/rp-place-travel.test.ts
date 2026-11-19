// Travel by a tap on the places map (Molfar.Vertep#454, M3): the pure parts.
import { describe, expect, it } from "bun:test";
import { cleanMinutes, cleanVia, footMinutes, minutesFor, spanOfMinutes, travelDirection, type TravelPlan } from "../src/lib/place-travel";
import { cleanPlaceMap, routeOf, setRouteInfo, toggleRoute } from "../src/lib/place-map";

const plan = (over: Partial<TravelPlan> = {}): TravelPlan => ({ from: "Hearthstone Inn", to: "Old Forge", mode: "foot", minutes: 20, via: null, within: false, ...over });

describe("minutes of a trip", () => {
  it("come from the distance: 10 board units a minute, to 5 minutes, at least 5", () => {
    expect(footMinutes({ x: 0, y: 0 }, { x: 300, y: 0 })).toBe(30);
    expect(footMinutes({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(5);
    expect(footMinutes({ x: 100, y: 100 }, { x: 100 + 3 * 53, y: 100 + 4 * 53 })).toBe(25);
  });
  it("riding takes 0.4 of the walk, skipping the road takes none", () => {
    expect(minutesFor(30, "foot")).toBe(30);
    expect(minutesFor(30, "ride")).toBe(10);
    expect(minutesFor(60, "ride")).toBe(25);
    expect(minutesFor(10, "ride")).toBe(5);
    expect(minutesFor(30, "skip")).toBe(0);
    expect(minutesFor(-4, "foot")).toBe(1);
  });
  it("read as hours and minutes", () => {
    expect(spanOfMinutes(20)).toBe("20 minutes");
    expect(spanOfMinutes(1)).toBe("1 minute");
    expect(spanOfMinutes(60)).toBe("1 hour");
    expect(spanOfMinutes(90)).toBe("1 hour 30 minutes");
    expect(spanOfMinutes(180)).toBe("3 hours");
  });
  it("are kept only as whole numbers in range", () => {
    expect(cleanMinutes(25)).toBe(25);
    for (const bad of [0, -1, 2.5, 100000, "5", null, NaN]) expect(cleanMinutes(bad as unknown)).toBeNull();
  });
});

describe("the hidden direction", () => {
  it("walks a known road with its time and its name", () => {
    const d = travelDirection(plan({ via: "Tanners' Lane" }));
    expect(d.startsWith("[[") && d.endsWith("]]")).toBe(true);
    expect(d).toContain("from Hearthstone Inn to Old Forge on foot, about 20 minutes");
    expect(d).toContain('the road known as "Tanners\' Lane" (keep to it)');
    expect(d).toContain("Show the new time of day");
  });
  it("asks for a name when the road has none, riding says so", () => {
    const d = travelDirection(plan({ mode: "ride", minutes: 8 }));
    expect(d).toContain("riding, about 8 minutes");
    expect(d).toContain("name in a few words");
  });
  it("skipping the road gives no minutes and asks for one line at most", () => {
    const d = travelDirection(plan({ mode: "skip" }));
    expect(d).toContain("Skip the road");
    expect(d).not.toContain("minutes");
  });
  it("an unknown start has no road and no time", () => {
    const d = travelDirection(plan({ from: null }));
    expect(d).toContain("heads to Old Forge");
    expect(d).not.toContain("minutes");
    expect(d).not.toContain("from ");
  });
  it("a move within one place is a line, no time", () => {
    const d = travelDirection(plan({ within: true, to: "Cellar" }));
    expect(d).toContain("goes to Cellar");
    expect(d).not.toContain("minutes");
  });
  it("brackets in names cannot end the direction early", () => {
    const d = travelDirection(plan({ to: "Evil ]] place [[", via: "a]]b" }));
    expect(d.slice(2, -2)).not.toContain("]");
    expect(d.slice(2, -2)).not.toContain("[");
    expect(cleanVia("  A ]] [[ Lane  ")).toBe("A Lane");
    expect(cleanVia("")).toBeNull();
    expect(cleanVia("x".repeat(300))?.length).toBe(120);
  });
});

describe("what a road keeps", () => {
  it("minutes and a name are cleaned with the map and survive a round trip", () => {
    const out = cleanPlaceMap({ v: 1, routes: [{ a: "n2", b: "n1", minutes: 25, via: "  Old  [Lane] " }, { a: "n3", b: "n4", minutes: 2.5, via: 5 }] });
    expect(out?.routes).toEqual([{ a: "n1", b: "n2", minutes: 25, via: "Old Lane" }, { a: "n3", b: "n4" }]);
    expect(cleanPlaceMap(out)).toEqual(out);
  });
  it("setRouteInfo makes the road when there is none and keeps the rest when only one thing changes", () => {
    const one = setRouteInfo(null, "n2", "n1", { minutes: 20 });
    expect(one.routes).toEqual([{ a: "n1", b: "n2", minutes: 20 }]);
    const two = setRouteInfo(one, "n1", "n2", { via: "Lane" });
    expect(two.routes).toEqual([{ a: "n1", b: "n2", minutes: 20, via: "Lane" }]);
    const three = setRouteInfo(two, "n1", "n2", { minutes: null });
    expect(three.routes).toEqual([{ a: "n1", b: "n2", via: "Lane" }]);
    expect(routeOf(three, "n2", "n1")).toEqual({ a: "n1", b: "n2", via: "Lane" });
    expect(routeOf(three, "n1", "n9")).toBeNull();
  });
  it("taking a road away takes its time and name with it", () => {
    const d = setRouteInfo(null, "n1", "n2", { minutes: 20, via: "Lane" });
    expect(toggleRoute(d, "n1", "n2").data.routes).toEqual([]);
  });
});

import { CHANCE_DEFAULT, ROAD_EVENTS, loadEventPref, rollRoadEvent, saveEventPref } from "../src/lib/place-travel";

describe("a road event", () => {
  it("the same seed gives the same roll and the same kind", () => {
    const a = rollRoadEvent("chat|12|n1|n2", 25);
    expect(rollRoadEvent("chat|12|n1|n2", 25)).toEqual(a);
    expect(a.roll).toBeGreaterThanOrEqual(1);
    expect(a.roll).toBeLessThanOrEqual(100);
    expect(a.hit).toBe(a.roll <= 25);
    expect(rollRoadEvent("chat|13|n1|n2", 25).roll === a.roll && rollRoadEvent("chat|14|n1|n2", 25).roll === a.roll).toBe(false);
  });
  it("a hit names one of the kinds, a miss names none; 100 always hits", () => {
    let hits = 0;
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const r = rollRoadEvent(`c|${i}|a|b`, 25);
      if (r.hit) { hits++; expect(ROAD_EVENTS as readonly string[]).toContain(r.kind!); kinds.add(r.kind!); } else expect(r.kind).toBeNull();
      expect(rollRoadEvent(`c|${i}|a|b`, 100).hit).toBe(true);
    }
    expect(hits).toBeGreaterThan(60);
    expect(hits).toBeLessThan(140);
    expect(kinds.size).toBeGreaterThan(3);
  });
  it("the chance is held to 1..100", () => {
    expect(rollRoadEvent("s", 500).chance).toBe(100);
    expect(rollRoadEvent("s", -3).chance).toBe(1);
    expect(rollRoadEvent("s", NaN).chance).toBe(CHANCE_DEFAULT);
  });
  it("the direction says where the DM's event belongs, or names the kind the die gave", () => {
    const base = { from: "Inn", to: "Forge", mode: "foot" as const, minutes: 20, via: null, within: false };
    const dm = travelDirection({ ...base, event: { dm: true } });
    expect(dm).toContain("The narrator holds an event for this turn: let it happen on the road if it fits.");
    const die = travelDirection({ ...base, event: { kind: "a stranger on the road" } });
    expect(die).toContain("Something small happens on the road: a stranger on the road.");
    expect(die.indexOf("arrival at Forge")).toBeLessThan(die.indexOf("Something small"));
    expect(die.indexOf("Something small")).toBeLessThan(die.indexOf("Show the new time of day"));
    expect(travelDirection({ ...base, event: null })).not.toContain("happens");
    // a skipped road or a move within a place has no event
    expect(travelDirection({ ...base, mode: "skip", event: { dm: true } })).not.toContain("narrator");
    expect(travelDirection({ ...base, within: true, event: { dm: true } })).not.toContain("narrator");
  });
  it("the switch and the chance are kept per chat, off and 25 until changed", () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(loadEventPref("c1", st)).toEqual({ on: false, chance: 25 });
    saveEventPref("c1", { on: true, chance: 60 }, st);
    expect(loadEventPref("c1", st)).toEqual({ on: true, chance: 60 });
    expect(loadEventPref("c2", st)).toEqual({ on: false, chance: 25 });
    saveEventPref("c1", { on: true, chance: 900 }, st);
    expect(loadEventPref("c1", st).chance).toBe(100);
    mem.set("rp.map.roadEvent.c3", "not json");
    expect(loadEventPref("c3", st)).toEqual({ on: false, chance: 25 });
    expect(loadEventPref("c1", null)).toEqual({ on: false, chance: 25 });
  });
});
