/**
 * World cast and the scene boundary (#496, phase 3a): a person who is due waits up to six replies for a new place or a time jump, then
 * comes anyway. The boundary is read from the Dashboard's snapshot of the newest reply and from the Direction director's report of it;
 * with neither nobody waits. A switch in the settings turns the wait off.
 */
import { describe, expect, it } from "bun:test";
import { BOUNDARY_WAIT, boundaryHold, castStatus, DEFAULT_SETTINGS, emptyState, normalizeState, sceneBoundary, sceneOf } from "../plugins/world/plugin.js";

const msg = (i: number, role: string) => ({ id: "m" + i, role, text: "text " + i, swipe: 0 });
/** user, char, user, char ... : the newest reply is m(n-1) when n is even */
const chat = (n: number) => Array.from({ length: n }, (_, i) => msg(i, i % 2 === 0 ? "user" : "char"));
const files = (more: Record<string, unknown>) => {
  const f: Record<string, string> = Object.fromEntries(Object.entries(more).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    read: (p: string) => {
      if (!(p in f)) throw new Error("ENOENT " + p);
      return f[p];
    },
    write: (p: string, t: string) => void (f[p] = t),
  };
};
const dash = (snaps: Record<string, unknown>) => ({ "dashboard/state/c1.json": { v: 1, snapshots: snaps } });
const snap = (place: string, more: Record<string, unknown> = {}) => ({ present: [], clock: { place }, scene: {}, ...more });
const settings = (over: Record<string, unknown> = {}) => ({ ...DEFAULT_SETTINGS, ...over });

describe("the Dashboard's scene says the story moved", () => {
  it("a new scene on the newest reply's snapshot, or another place than the snapshot before it", () => {
    const msgs = chat(6);
    expect(sceneOf(files(dash({ "m3#0": snap("Hall"), "m5#0": snap("Hall", { scene: { new: true } }) })), "c1", msgs as any)!.moved).toBe(true);
    expect(sceneOf(files(dash({ "m3#0": snap("Hall"), "m5#0": snap("Roof") })), "c1", msgs as any)!.moved).toBe(true);
    expect(sceneOf(files(dash({ "m3#0": snap("Hall"), "m5#0": snap("hall.") })), "c1", msgs as any)!.moved).toBe(false);
  });
  it("an old new scene does not count when the Dashboard has not read the newest reply yet", () => {
    const msgs = chat(8);
    expect(sceneOf(files(dash({ "m5#0": snap("Hall", { scene: { new: true } }) })), "c1", msgs as any)!.moved).toBe(false);
  });
});

describe("sceneBoundary", () => {
  const msgs = chat(6);
  it("null when nothing can tell, the Dashboard's answer, or the director's report of the newest reply", () => {
    expect(sceneBoundary(files({}), "c1", msgs as any, null)).toBeNull();
    expect(sceneBoundary(files({}), "c1", msgs as any, { moved: false } as any)).toBe(false);
    expect(sceneBoundary(files({}), "c1", msgs as any, { moved: true } as any)).toBe(true);
    const director = (on: boolean, key: string, sceneNew: boolean) => ({ "direction/state/c1.json": { on, reports: [{ key, sceneNew }] } });
    expect(sceneBoundary(files(director(true, "m5#0", true)), "c1", msgs as any, null)).toBe(true);
    expect(sceneBoundary(files(director(true, "m5#0", false)), "c1", msgs as any, null)).toBe(false);
    // an older reply's report, or a director that is off, tells nothing
    expect(sceneBoundary(files(director(true, "m3#0", true)), "c1", msgs as any, null)).toBeNull();
    expect(sceneBoundary(files(director(false, "m5#0", true)), "c1", msgs as any, null)).toBeNull();
  });
  it("either source saying the scene moved is enough", () => {
    const f = files({ "direction/state/c1.json": { on: true, reports: [{ key: "m5#0", sceneNew: true }] } });
    expect(sceneBoundary(f, "c1", msgs as any, { moved: false } as any)).toBe(true);
  });
});

describe("boundaryHold", () => {
  const st = (over: Record<string, unknown> = {}, set = {}) => ({ ...emptyState("c1"), settings: settings(set), ...over }) as any;
  it("waits while the scene is known not to have changed, then lets the person come after six replies", () => {
    const s = st();
    expect(boundaryHold(s, false, 20)).toBe(true);
    expect(s.castWait).toEqual({ n: 20 });
    expect(boundaryHold(s, false, 20 + BOUNDARY_WAIT - 1)).toBe(true);
    expect(s.castWait).toEqual({ n: 20 });
    expect(boundaryHold(s, false, 20 + BOUNDARY_WAIT)).toBe(false);
    expect(s.castWait).toBeUndefined();
  });
  it("a scene change, no information, or the switch off: nobody waits and the wait is cleared", () => {
    for (const [b, set] of [[true, {}], [null, {}], [false, { castBoundary: false }]] as const) {
      const s = st({ castWait: { n: 5 } }, set);
      expect(boundaryHold(s, b, 10)).toBe(false);
      expect(s.castWait).toBeUndefined();
    }
  });
  it("replies deleted since the wait began start it over", () => {
    const s = st({ castWait: { n: 30 } });
    expect(boundaryHold(s, false, 12)).toBe(true);
    expect(s.castWait).toEqual({ n: 12 });
  });
});

describe("the switch and the panel", () => {
  it("on by default, kept when off, and shown in the cast status", () => {
    expect(normalizeState({}, "c1").settings.castBoundary).toBe(true);
    expect(normalizeState({ settings: { castBoundary: false } }, "c1").settings.castBoundary).toBe(false);
    // the cast wait survives a load
    expect(normalizeState({ castWait: { n: 7 } }, "c1").castWait).toEqual({ n: 7 });
    expect(DEFAULT_SETTINGS.castBoundary).toBe(true);
  });
  it("castStatus says the wait: on, holding, replies left", () => {
    const state = { ...emptyState("c1"), castWait: { n: 10 }, settings: settings({ level: "chronicler", cast: "normal" }) } as any;
    const f = files({
      "world/state/c1.json": state,
      "chats/c1.meta.json": { id: "c1", title: "t" },
      "chats/c1.jsonl": chat(26).map((m) => JSON.stringify(m)).join("\n"),
    });
    const s = castStatus(f as any, "c1") as any;
    expect(s.boundary.on).toBe(true);
    expect(s.boundary.wait).toBe(BOUNDARY_WAIT);
    expect(typeof s.boundary.holding).toBe("boolean");
  });
});
