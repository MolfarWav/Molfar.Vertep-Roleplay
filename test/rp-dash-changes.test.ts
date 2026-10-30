// Issue 176, the Dashboard side: what changed since the last reply, what a character wears and carries,
// the strip's width and the weather tile's name.
import { describe, expect, it } from "bun:test";
import { personChanges, sceneChanges, sinceChanges, tabCounts, tally } from "../src/lib/dash-changes";
import { outfitEmpty, outfitOf, sensorDifference, sensorOutfitChanged, splitList, thingCount } from "../src/lib/dash-outfit";
import { clampStripWidth, isNarrowStrip, readFullscreen, readStripWidth, STRIP_DEFAULT, stripWeatherSize, writeFullscreen, writeStripWidth } from "../src/lib/dash-strip-width";
import { weatherKind, weatherNameKey } from "../src/components/dashboard/dash-weather";
import { DICTIONARIES } from "../src/lib/i18n";
import type { DashChar, DashView } from "../src/lib/dashboard";
import type { WorldHere, WorldRecord } from "../src/lib/world";

const stats = (o: Partial<Record<"trust" | "comfort" | "attraction" | "respect" | "affection", number>> = {}) => ({ trust: 0, comfort: 0, attraction: 0, respect: 0, affection: 0, ...o });
const char = (o: Partial<DashChar> = {}): DashChar => ({
  cls: "neutral", stats: stats(), pulse: { excitement: 0, arousal: 0 }, hostility: null, constellation: "strangers", prevConstellation: null,
  mood: null, moodWas: null, condition: null, outfit: null, holding: null, goal: null, leads: null, blindSpot: null, compact: false, pronouns: null,
  rated: true, pulseBase: { excitement: 0, arousal: 0 }, prev: null, notebook: [], name: null, history: [], series: [], ...o,
} as DashChar);
const view = (chars: Record<string, DashChar>, extra: Partial<DashView> = {}): DashView => ({
  key: "k", turn: 5, at: 0, op: null, partial: false, sensorModel: "", stale: false, clock: null, present: Object.keys(chars), order: Object.keys(chars),
  events: [], threads: [], edges: [], chars, usage: { calls: 0, inTokens: 0, outTokens: 0, lastMs: 0 }, lastError: null, insert: null, insertEnabled: true, mode: "sensor", ...extra,
} as DashView);
const rec = (id: string, name: string, extra: Partial<WorldRecord> = {}): WorldRecord => ({ id, kind: "thing", name, aliases: [], text: "", status: "active", at: 1, ...extra });
const here = (o: Partial<WorldHere> = {}): WorldHere => ({
  on: true, scenePlace: "", place: null, parent: null, spots: [], things: [], held: [], asleep: [], carry: {}, present: [], changed: { at: 0, ids: [], carry: [] }, background: null, carrySource: "sensor", sensor: {}, ...o,
});

describe("personChanges", () => {
  it("counts a mood that moved, a carry the DM changed, and the stats that fell or rose", () => {
    const c = char({ mood: "curious", moodWas: "wary", stats: stats({ trust: -3, comfort: -3, respect: 1 }), prev: { stats: stats({ trust: 0, comfort: 0, respect: 0 }), pulse: { excitement: 0, arousal: 0 }, hostility: null, constellation: null } });
    const list = personChanges("Ren", c, here({ carrySource: "dm", changed: { at: 1, ids: [], carry: ["ren"] } }));
    expect(list.map((x) => x.kind)).toEqual(["mood", "carry", "fell", "rose"]);
    const fell = list.find((x) => x.kind === "fell")!;
    expect(fell).toMatchObject({ negative: true, n: 2, stats: ["trust", "comfort"] });
    expect(tally(list)).toEqual({ n: 5, negative: true });
  });

  it("counts nothing when the mood is the same, there is no earlier snapshot, or the character is unknown", () => {
    expect(personChanges("A", char({ mood: "Calm", moodWas: "calm" }), null)).toEqual([]);
    expect(personChanges("A", char({ stats: stats({ trust: 9 }) }), null)).toEqual([]);
    expect(personChanges("A", undefined, null)).toEqual([]);
    expect(tally([])).toBeNull();
  });

  it("a rise alone is not negative", () => {
    const c = char({ stats: stats({ trust: 4 }), prev: { stats: stats(), pulse: { excitement: 0, arousal: 0 }, hostility: null, constellation: null } });
    expect(tally(personChanges("A", c, null))).toEqual({ n: 1, negative: false });
  });
});

describe("sceneChanges", () => {
  it("reads the DM's changed ids for the place and the things, and the quests of this turn", () => {
    const place = rec("p1", "Living room", { kind: "place" });
    const vase = rec("t1", "Vase", { place: "Living room" });
    const key = rec("t2", "Key", { holder: "Mei" });
    const h = here({ place, things: [vase], held: [{ ...key, who: "Mei" }], changed: { at: 1, ids: ["p1", "t1", "t2", "zzz"], carry: [] } });
    const v = view({ Mei: char() }, {
      turn: 5,
      threads: [
        { id: "a", text: "new", since: 5, status: "open" },
        { id: "b", text: "old", since: 2, status: "open" },
        { id: "c", text: "shut", since: 5, status: "resolved" },
      ],
      proposals: [{ id: "x", type: "open", why: "limit", text: "t", kind: "side", turn: 5 }],
    });
    const list = sceneChanges(v, h);
    expect(list.map((x) => [x.kind, x.tab, x.n])).toEqual([["place", "here", 1], ["things", "here", 2], ["quest", "quests", 1], ["proposal", "quests", 1]]);
    const counts = tabCounts(v, h, "Mei");
    expect(counts.here).toEqual({ n: 3, negative: false });
    expect(counts.quests).toEqual({ n: 2, negative: false });
    expect(counts.person).toBeNull();
  });

  it("is quiet without the World DM and without new quests", () => {
    expect(sceneChanges(view({ A: char() }), null)).toEqual([]);
  });
});

describe("sinceChanges", () => {
  it("lists the focus's changes, only the falls of the others, then the scene", () => {
    const prev = { stats: stats(), pulse: { excitement: 0, arousal: 0 }, hostility: null, constellation: null };
    const v = view({
      Mei: char({ mood: "a", moodWas: "b" }),
      Ren: char({ mood: "c", moodWas: "d", stats: stats({ trust: -1 }), prev }),
      Vika: char({ stats: stats({ trust: 2 }), prev }),
    });
    const list = sinceChanges(v, null, "Mei");
    expect(list.map((x) => [x.kind, x.who])).toEqual([["mood", "Mei"], ["fell", "Ren"]]);
  });
});

describe("carry source", () => {
  const prev = (o: { outfit?: string | null; holding?: string | null }) => ({ stats: stats(), pulse: { excitement: 0, arousal: 0 }, hostility: null, constellation: null, ...o });

  it("sensor source: the outfit and holding changing against the snapshot before is the change, the DM's last run is not", () => {
    const moved = char({ outfit: "red sweater", holding: "cup", prev: prev({ outfit: "grey coat", holding: "cup" }) });
    expect(sensorOutfitChanged(moved)).toBe(true);
    expect(personChanges("Mei", moved, here()).map((x) => x.kind)).toEqual(["carry"]);
    const same = char({ outfit: "Grey coat, jeans", holding: "nothing", prev: prev({ outfit: "jeans, grey coat", holding: "-" }) });
    expect(sensorOutfitChanged(same)).toBe(false);
    // the DM touched this person, but the sensor is the source: no chip
    expect(personChanges("Mei", same, here({ changed: { at: 1, ids: [], carry: ["Mei"] } }))).toEqual([]);
    // a snapshot without the fields, or none: nothing to compare, nothing counted
    expect(sensorOutfitChanged(char({ prev: prev({}) }))).toBeNull();
    expect(sensorOutfitChanged(char())).toBeNull();
    expect(personChanges("Mei", char({ outfit: "x", prev: prev({}) }), null)).toEqual([]);
  });

  it("DM source: the DM's last run is the change", () => {
    expect(personChanges("Mei", char(), here({ carrySource: "dm", changed: { at: 1, ids: [], carry: ["mei"] } })).map((x) => x.kind)).toEqual(["carry"]);
    expect(personChanges("Mei", char(), here({ carrySource: "dm" }))).toEqual([]);
  });

  it("outfitOf: hands come from the carry or the sensor, held things are carried, nearby only with the DM as the source", () => {
    const sensorHere = here({
      carry: { Mei: { wearing: ["grey coat"], carried: [], nearby: ["stray"], hands: "coffee cup", at: 0 } },
      held: [{ ...rec("t1", "Spare key"), who: "mei" }, { ...rec("t2", "Coffee cup"), who: "Mei" }],
    });
    const o = outfitOf("Mei", char({ holding: "something else" }), sensorHere);
    expect(o.wearing).toEqual(["grey coat"]);
    expect(o.hands).toEqual(["coffee cup"]);
    expect(o.carried).toEqual([{ what: "Spare key" }]);
    expect(o.nearby).toEqual([]);
    const dmHere = here({ carrySource: "dm", carry: { Mei: { wearing: ["coat"], carried: [{ what: "bag", where: "chair" }], nearby: ["umbrella"], at: 1 } } });
    const d = outfitOf("Mei", char({ holding: "cup" }), dmHere);
    expect(d.hands).toEqual(["cup"]);
    expect(d.carried).toEqual([{ what: "bag", where: "chair" }]);
    expect(d.nearby).toEqual(["umbrella"]);
  });

  it("sensorDifference: only with the DM as the source and only when the two lists differ", () => {
    const sensor = { Mei: { wearing: ["red sweater"], carried: [], nearby: [], hands: "cup", at: 0 } };
    expect(sensorDifference("Mei", here({ sensor }))).toBeNull();
    const dm = here({ carrySource: "dm", sensor, carry: { Mei: { wearing: ["grey coat"], carried: [], nearby: [], at: 1 } } });
    expect(sensorDifference("Mei", dm)).toEqual({ wearing: ["red sweater"], hands: ["cup"] });
    const agree = here({ carrySource: "dm", sensor, carry: { Mei: { wearing: ["Red sweater"], carried: [{ what: "Cup" }], nearby: [], at: 1 } } });
    expect(sensorDifference("Mei", agree)).toBeNull();
    expect(sensorDifference("Ren", dm)).toBeNull();
    expect(sensorDifference("Mei", null)).toBeNull();
  });
});

describe("outfit", () => {
  it("splits the sensor's text on commas and drops 'nothing'", () => {
    expect(splitList("grey coat, black jeans; white sneakers, Grey Coat")).toEqual(["grey coat", "black jeans", "white sneakers"]);
    expect(splitList("nothing")).toEqual([]);
    expect(splitList(" - ")).toEqual([]);
    expect(splitList(null)).toEqual([]);
  });

  it("takes the DM's wearing list first, the sensor's outfit as a fallback, and adds held things to the hands", () => {
    const c = char({ outfit: "red sweater, dark skirt", holding: "coffee cup" });
    const withDm = here({
      carrySource: "dm",
      carry: { mei: { wearing: ["grey coat"], carried: [{ what: "leather bag", where: "on the chair" }], nearby: ["umbrella"], at: 1 } },
      held: [{ ...rec("t1", "Folded note"), who: "Mei" }],
    });
    const o = outfitOf("Mei", c, withDm);
    expect(o.wearing).toEqual(["grey coat"]);
    expect(o.hands).toEqual(["coffee cup"]);
    expect(o.carried).toEqual([{ what: "leather bag", where: "on the chair" }, { what: "Folded note" }]);
    expect(o.nearby).toEqual(["umbrella"]);
    expect(thingCount(o)).toBe(4);
    expect(outfitOf("Vika", c, null).wearing).toEqual(["red sweater", "dark skirt"]);
  });

  it("is empty when nothing is known", () => {
    expect(outfitEmpty(outfitOf("A", char(), here()))).toBe(true);
    expect(outfitEmpty(outfitOf("A", char({ holding: "nothing" }), null))).toBe(true);
  });
});

describe("strip width", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("keeps 300 to 420 and defaults to 340", () => {
    expect([100, 299, 300, 340, 421, 999].map(clampStripWidth)).toEqual([300, 300, 300, 340, 420, 420]);
    expect(clampStripWidth(Number.NaN)).toBe(STRIP_DEFAULT);
    expect(STRIP_DEFAULT).toBe(340);
  });

  it("remembers the width, clamped, and survives blocked storage", () => {
    const s = store();
    expect(readStripWidth(s)).toBe(340);
    writeStripWidth(390, s);
    expect(readStripWidth(s)).toBe(390);
    writeStripWidth(9999, s);
    expect(readStripWidth(s)).toBe(420);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readStripWidth(broken)).toBe(340);
    expect(() => writeStripWidth(350, broken)).not.toThrow();
    expect(readStripWidth(null)).toBe(340);
  });

  it("shrinks the weather icon under 322 px", () => {
    expect([300, 321, 322, 340].map(isNarrowStrip)).toEqual([true, true, false, false]);
    expect([300, 340, 420].map(stripWeatherSize)).toEqual([40, 52, 52]);
  });

  it("remembers full screen", () => {
    const s = store();
    expect(readFullscreen(s)).toBe(false);
    writeFullscreen(true, s);
    expect(readFullscreen(s)).toBe(true);
    writeFullscreen(false, s);
    expect(readFullscreen(s)).toBe(false);
  });
});

describe("weather tile names", () => {
  it("every kind has a name in both languages, and clear at night is its own", () => {
    for (const text of ["sunny", "partly cloudy", "overcast", "light rain", "thunderstorm", "heavy snow", "dense fog", "strong wind"]) {
      const kind = weatherKind(text)!;
      const key = weatherNameKey(kind);
      expect(DICTIONARIES.en[key], key).toBeTruthy();
      expect(DICTIONARIES.uk[key], key).toBeTruthy();
    }
    expect(weatherNameKey("clear", true)).toBe("dash.wx.clearNight");
    expect(weatherNameKey("rain", true)).toBe("dash.wx.rain");
    expect(DICTIONARIES.en["dash.wx.clearNight"]).toBe("Clear night");
  });
});
