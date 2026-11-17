/**
 * The relationship stage (#394): how close two people are, worked out from the five numbers, and what it does to the same
 * event: the first hug between acquaintances counts more, the hundredth between a couple less; harm is never scaled.
 * Also the event table itself: every row has a family and a closeness level, and its numbers keep the house rules.
 */
import { describe, expect, it } from "bun:test";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

const stats = (o: Record<string, number>) => ({ trust: 0, comfort: 0, attraction: 0, respect: 0, affection: 0, ...o });
const prevOf = (o: Record<string, number>) => ({ stats: stats(o), pulse: { excitement: 12, arousal: 9 }, hostility: null });
const ev = (id: string, weight = "routine") => ({ id, weight, to: "Aria", from: "user" });
const turn = (prev: any, events: any[], vocab?: any, cls = "neutral") => P.applyTurn({ name: "Aria", prev, soul: undefined, cls, events, vocab });

describe("stageOf", () => {
  it("stranger, acquaintance, friend and close follow the numbers", () => {
    expect(P.stageOf(stats({}))).toBe(0);
    expect(P.stageOf(stats({ affection: 10, trust: 10, comfort: 10 }))).toBe(0);
    expect(P.stageOf(stats({ affection: 20, trust: 20, comfort: 20 }))).toBe(1);
    expect(P.stageOf(stats({ affection: 35, trust: 35, comfort: 35 }))).toBe(2);
    expect(P.stageOf(stats({ affection: 60, trust: 60, comfort: 60 }))).toBe(3);
  });

  it("agrees with the bond constellations at their edges", () => {
    // friendly (above 15 each) is an acquaintance, friendship (above 30 each) is a friend, devoted (above 60) is close
    expect(P.constellationOf(stats({ affection: 16, trust: 16, comfort: 16 })).id).toBe("friendly");
    expect(P.stageOf(stats({ affection: 16, trust: 16, comfort: 16 }))).toBe(1);
    expect(P.constellationOf(stats({ affection: 31, trust: 31, comfort: 31 })).id).toBe("friendship");
    expect(P.stageOf(stats({ affection: 31, trust: 31, comfort: 31 }))).toBe(2);
    expect(P.constellationOf(stats({ affection: 61, trust: 61, comfort: 61 })).id).toBe("devoted");
    expect(P.stageOf(stats({ affection: 61, trust: 61, comfort: 61 }))).toBe(3);
  });

  it("a couple is close as soon as the attraction is there, a cold bond has no stage", () => {
    expect(P.stageOf(stats({ attraction: 45, affection: 42, trust: 22, comfort: 5 }))).toBe(3);
    expect(P.stageOf(stats({ attraction: 45, affection: 42, trust: 10 }))).toBeLessThan(3);
    expect(P.stageOf(stats({ affection: -20, trust: 50, comfort: 50 }))).toBe(-1);
    expect(P.stageOf(stats({ affection: 50, trust: -16 }))).toBe(-1);
    expect(P.stageOf(undefined)).toBe(0);
  });
});

describe("stageFactor", () => {
  it("ahead of the relationship counts more, at it as it is, below it less", () => {
    expect([0, 1, 2, 3].map((s) => P.stageFactor(3, s))).toEqual([1.5, 1.5, 1.5, 1]);
    expect([0, 1, 2, 3].map((s) => P.stageFactor(2, s))).toEqual([1.5, 1.5, 1, 0.5]);
    expect([0, 1, 2, 3].map((s) => P.stageFactor(1, s))).toEqual([1.5, 1, 0.5, 0.5]);
  });

  it("level 0, no level and a cold bond are never scaled", () => {
    for (const s of [-1, 0, 1, 2, 3]) expect(P.stageFactor(0, s)).toBe(1);
    for (const s of [0, 1, 2, 3]) expect(P.stageFactor(null, s)).toBe(1);
    expect(P.stageFactor(undefined, 2)).toBe(1);
    for (const l of [1, 2, 3]) expect(P.stageFactor(l, -1)).toBe(1);
  });
});

describe("the same act at different stages", () => {
  const step = (before: Record<string, number>, id: string, vocab?: any) => {
    const after = turn(prevOf(before), [ev(id)], vocab).stats;
    return Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - (before[k] ?? 0)])) as Record<string, number>;
  };
  const acquaintance = { affection: 20, trust: 20, comfort: 10 }; // stage 1
  const friends = { affection: 35, trust: 35, comfort: 20 }; // stage 2
  const couple = { affection: 60, trust: 60, comfort: 40, attraction: 50 }; // stage 3

  it("a hug (close) counts a half more for acquaintances, as written for friends, half for a couple", () => {
    expect(P.stageOf(stats(acquaintance))).toBe(1);
    expect(P.stageOf(stats(friends))).toBe(2);
    expect(P.stageOf(stats(couple))).toBe(3);
    // hug: comfort +2, affection +1 (a whole point is the least a number moves: 1 x 1.5 stays 1, 1 x 0.5 stays 1)
    expect(step(acquaintance, "hug")).toMatchObject({ comfort: 3, affection: 1 });
    expect(step(friends, "hug")).toMatchObject({ comfort: 2, affection: 1 });
    expect(step(couple, "hug")).toMatchObject({ comfort: 1, affection: 1 });
  });

  it("a kiss (intimate) between strangers counts a half more on the bond numbers", () => {
    // kiss: attraction +2, affection +1
    expect(step({}, "kiss")).toMatchObject({ attraction: 3, affection: 1 });
    expect(step(couple, "kiss")).toMatchObject({ attraction: 2, affection: 1 });
  });

  it("the math line says why, and only when something was scaled", () => {
    const m = turn(prevOf({ affection: 5 }), [ev("kiss")]).math.events[0] as string[];
    expect(m.some((l) => /x1.5 intimate act at the stranger stage/.test(l))).toBe(true);
    const plain = turn(prevOf(friends), [ev("hug")]).math.events[0] as string[];
    expect(plain.some((l) => /stage/.test(l))).toBe(false);
  });

  it("only the good effects are scaled: harm in a row with a level stays as it is", () => {
    const vocab = P.buildVocab([{ id: "rough_hug", family: "body", meaning: "x", deltas: { comfort: -3, affection: 2 }, level: 3 }]);
    expect(step({ comfort: 10 }, "rough_hug", vocab)).toMatchObject({ comfort: -3, affection: 3 });
  });

  it("level 0 events do not depend on the stage", () => {
    for (const id of ["apology", "kept_promise", "told_truth", "broke_promise", "insult", "threat"]) {
      const a = step(acquaintance, id);
      const b = step({ affection: 5, trust: 5, comfort: 5 }, id);
      for (const k of ["trust", "comfort", "respect", "attraction", "affection"]) expect(a[k]).toBe(b[k]);
    }
  });

  it("a cold bond gets no bonus and no cut", () => {
    expect(step({ affection: -30, trust: -30 }, "hug")).toMatchObject({ comfort: 2, affection: 1 });
  });

  it("the pulse numbers are not scaled", () => {
    const a = turn(prevOf({}), [ev("kiss")]).pulse;
    const b = turn(prevOf(couple), [ev("kiss")]).pulse;
    expect(a.arousal).toBe(b.arousal);
  });

  it("a row someone tuned keeps its level unless the row says another", () => {
    const row = { id: "hug", family: "body", meaning: "hugged", deltas: { comfort: 4 } };
    expect(P.buildVocab([row]).hug.level).toBe(2);
    expect(P.buildVocab([{ ...row, level: null }]).hug.level).toBe(null);
    expect(P.buildVocab([{ ...row, level: 0 }]).hug.level).toBe(0);
    expect(P.buildVocab([{ id: "my_own", family: "body", meaning: "x", deltas: { comfort: 1 } }]).my_own.level).toBeUndefined();
    expect(step(acquaintance, "hug", P.buildVocab([row])).comfort).toBe(6);
  });

  it("vocabRows and the editor's rows carry the level", () => {
    const rows = P.vocabRows([{ id: "hug", family: "body", meaning: "hugged", deltas: { comfort: 2, affection: 1 } }, { id: "mine", family: "play", meaning: "x", deltas: {}, level: 2 }]) as any[];
    const by = (id: string) => rows.find((r) => r.id === id);
    expect(by("hug")).toMatchObject({ level: 2, source: "changed" }); // the meaning differs, the level is inherited
    expect(by("kiss")).toMatchObject({ level: 3, source: "default" });
    expect(by("mine")).toMatchObject({ level: 2, source: "custom" });
    const none = P.vocabRows([{ id: "kiss", family: "body", meaning: "kissed on the lips or romantically (welcome)", deltas: { attraction: 2, affection: 1, arousal: 12 }, level: null }]) as any[];
    expect(none.find((r) => r.id === "kiss")).toMatchObject({ level: null, source: "changed" });
  });
});

describe("the event table", () => {
  const rows = P.vocabRows([]) as { id: string; family: string; meaning: string; deltas: Record<string, number>; level: number | null }[];

  it("has 88 rows with unique snake_case ids and a known family", () => {
    expect(rows.length).toBe(88);
    expect(new Set(rows.map((r) => r.id)).size).toBe(88);
    for (const r of rows) {
      expect(r.id).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(["trust", "warmth", "power", "body", "conflict", "care", "knowledge", "other"].includes(r.family)).toBe(true);
      expect(r.meaning.length).toBeGreaterThan(3);
    }
  });

  it("every row has a closeness level from 0 to 3", () => {
    for (const r of rows) expect([0, 1, 2, 3]).toContain(r.level as number);
  });

  it("a row that is not for anyone has only good effects on the numbers, and harm sits at level 0", () => {
    for (const r of rows) {
      const stat = Object.entries(r.deltas).filter(([k]) => ["trust", "comfort", "attraction", "respect", "affection"].includes(k));
      if ((r.level ?? 0) >= 1) expect(stat.every(([, v]) => v >= 0)).toBe(true);
    }
  });

  it("keeps the house scale: a good act moves a number by 1 to 2, harm by up to 5, the pulses by up to 20", () => {
    for (const r of rows) {
      for (const [k, v] of Object.entries(r.deltas)) {
        if (["excitement", "arousal"].includes(k)) expect(Math.abs(v)).toBeLessThanOrEqual(20);
        else if (v > 0 && k !== "hostility") expect(v).toBeLessThanOrEqual(2);
        else expect(Math.abs(v)).toBeLessThanOrEqual(5);
      }
    }
  });

  it("intimate rows are the ones that need a couple: kiss, intimacy, a confession, living together", () => {
    const l3 = rows.filter((r) => r.level === 3).map((r) => r.id);
    for (const id of ["kiss", "intimacy", "confessed_feelings", "moved_in", "cuddled", "slept_beside", "promised_future"]) expect(l3).toContain(id);
  });

  it("the sensor's old ids are all still there", () => {
    for (const id of ["kept_promise", "hug", "tender_kiss", "kiss", "gentle_touch", "unwanted_touch", "compliment", "apology", "other"]) expect(rows.some((r) => r.id === id)).toBe(true);
  });
});
