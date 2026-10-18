/**
 * #50: in a long chat, recently written or recently used facts rank a little higher in the
 * Litopys insert; old unused ones sink slowly. Ranking only: nothing on disk changes.
 */
import { describe, expect, it } from "bun:test";
import { L, line, story, useRoot } from "./rp-memory-m2-kit";

useRoot();

const fact = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id,
  text,
  subject: "world",
  knownBy: "all",
  type: "event",
  weight: "everyday",
  pinned: false,
  status: "active",
  ...extra,
});

describe("factRecency", () => {
  it("stays in 0.5-1.2 and falls with age", () => {
    const fresh = L.factRecency({ written: 99 }, 100);
    const old = L.factRecency({ written: 0 }, 100);
    const ancient = L.factRecency({ written: 0 }, 10_000);
    const usedFresh = L.factRecency({ written: 0, lastUsed: 99, uses: 50 }, 100);
    expect(fresh).toBeGreaterThan(old);
    expect(ancient).toBeCloseTo(0.5, 5);
    expect(usedFresh).toBeLessThanOrEqual(1.2);
    expect(usedFresh).toBeGreaterThan(fresh);
  });
  it("leaves a fact with no known turn as it was", () => {
    expect(L.factRecency({}, 100)).toBe(1);
  });
});

describe("rankFacts with recency", () => {
  it("an old unused fact loses to an equally relevant fresh one; ties stay newest first", () => {
    const oldF = fact("f1", "The mill wheel broke.", { updatedAt: 2 });
    const freshF = fact("f2", "The mill wheel broke again.", { updatedAt: 1 });
    const factor = (f: { id: string }) => (f.id === "f2" ? L.factRecency({ written: 99 }, 100) : L.factRecency({ written: 0 }, 100));
    expect(L.rankFacts([oldF, freshF], "mill wheel", factor).map((f: { id: string }) => f.id)).toEqual(["f2", "f1"]);
    // without the factor the old ordering is untouched
    expect(L.rankFacts([oldF, freshF], "", undefined).map((f: { id: string }) => f.id)).toEqual(["f1", "f2"]);
  });
});

describe("buildInsert and the use record", () => {
  const msgs = story(120);
  const ln = line(msgs);
  const cfg = { enabled: true, insert: true, budget: 4000, recentMessages: 4, scene: { minMessages: 6, maxMessages: 40 } };
  const st = () => {
    const s = L.emptyChat("c1");
    s.chapters = [
      { id: "c1", from: "m1", to: "m10", count: 10, kind: "scene", text: "Early days.", label: "Early" },
      { id: "c2", from: "m11", to: "m116", count: 106, kind: "scene", text: "Late days.", label: "Late" },
    ];
    s.facts = [
      fact("f1", "Aria hides a silver key.", { src: { from: "m1", to: "m2", chapter: "c1" }, updatedAt: 5 }),
      fact("f2", "Aria lost a silver key.", { src: { from: "m100", to: "m110", chapter: "c2" }, updatedAt: 1 }),
      fact("f3", "Aria keeps her pin.", { pinned: true, subject: "Aria", updatedAt: 1 }),
    ];
    return s;
  };
  const order = (ins: { text: string }) => ["hides", "lost"].sort((x, y) => ins.text.indexOf(x) - ins.text.indexOf(y));

  it("puts the fresher of two equally relevant facts first, and a used one rises", () => {
    const ins = L.buildInsert({ st: st(), line: ln, dash: null, meta: { userName: "You" }, cfg, scanText: "silver key", speakerName: "Aria" });
    expect(order(ins)).toEqual(["lost", "hides"]);
    expect(ins.factIds).toContain("f3");
    // the old fact was used in the last few prompts: it comes back up
    const used = { f1: { n: 5, turn: 119 } };
    const again = L.buildInsert({ st: st(), line: ln, dash: null, meta: { userName: "You" }, cfg, scanText: "silver key", speakerName: "Aria", used });
    expect(order(again)).toEqual(["hides", "lost"]);
  });

  it("never moves a pinned fact", () => {
    const ins = L.buildInsert({ st: st(), line: ln, dash: null, meta: { userName: "You" }, cfg, scanText: "silver key", speakerName: "Aria", used: { f3: { n: 0, turn: 0 } } });
    expect(ins.factIds[0]).toBe("f3");
  });

  it("markUsed counts uses (capped), records the turn and keeps the newest when full", () => {
    let used = L.markUsed({}, ["f1", "f2"], 10);
    used = L.markUsed(used, ["f1"], 11);
    expect(used.f1).toEqual({ n: 2, turn: 11 });
    expect(used.f2).toEqual({ n: 1, turn: 10 });
    for (let i = 0; i < 9; i++) used = L.markUsed(used, ["f1"], 12 + i);
    expect(used.f1.n).toBe(5);
    const many = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`x${i}`, { n: 1, turn: i }]));
    const kept = L.markUsed(many, ["new"], 1000);
    expect(Object.keys(kept).length).toBe(500);
    expect(kept.new).toBeDefined();
    expect(kept.x0).toBeUndefined();
  });
});
