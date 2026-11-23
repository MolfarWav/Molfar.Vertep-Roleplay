// The roll shown while the reply is written (Molfar.Vertep#501): which rolls belong to the reply, and their faces.
import { describe, expect, it } from "bun:test";

// world.ts reaches engine.ts, which reads the frame URL at import time
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { freshRolls, facesOf } = await import("../src/components/chat/dice-toss");

const base = { op: "send", mode: "strict", stat: "auto", who: "", value: null, chance: 35, gate: 1 } as const;
const fate = (at: number, extra: object = {}) => ({ ...base, at, gated: true, inserted: true, d1: 4, d2: 3, total: 7, outcome: "no_but", ...extra }) as any;

describe("freshRolls", () => {
  it("takes the newest action, pace and life rolls of this reply; quiet, held, cast and old ones stay out", () => {
    const since = 100_000;
    const rolls = [
      fate(since - 60_000), // an earlier reply
      fate(since + 500),
      fate(since + 600, { gated: false, inserted: false }),
      { ...fate(since + 700), kind: "pace", outcome: "yes_but" },
      { ...base, at: since + 800, kind: "life", gated: true, inserted: false, held: "pause", tier: "major", d: 6 },
      { ...base, at: since + 900, kind: "cast", gated: true, inserted: true },
    ] as any[];
    const got = freshRolls(rolls, since);
    expect(got.map((r) => r.kind ?? "fate")).toEqual(["fate", "pace"]);
    expect(got[0]!.at).toBe(since + 500);
  });

  it("a roll made just before the stream started on this side still counts", () => {
    expect(freshRolls([fate(98_000)], 100_000)).toHaveLength(1);
  });
});

describe("facesOf", () => {
  it("two faces for the action and pace, one for the world", () => {
    expect(facesOf(fate(1))).toEqual([4, 3]);
    expect(facesOf({ ...base, at: 1, kind: "life", gated: true, inserted: true, tier: "minor", d: 2 } as any)).toEqual([2]);
    expect(facesOf({ ...base, at: 1, gated: true, inserted: true } as any)).toEqual([]);
  });
});
