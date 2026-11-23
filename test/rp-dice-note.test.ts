import { describe, expect, it } from "bun:test";
import type { WorldDiceRoll } from "../src/lib/world";

// world.ts reaches engine.ts, which reads the frame URL at import time (so the file also runs alone)
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { rollsFor } = await import("../src/components/chat/dice-note");

const roll = (extra: Partial<WorldDiceRoll>): WorldDiceRoll => ({ at: 1, op: "send", mode: "flavour", stat: "auto", who: "", value: null, chance: 100, gated: true, gate: 1, inserted: true, ...extra }) as WorldDiceRoll;

describe("the marks under the replies", () => {
  it("a sent reply takes the roll made when the chat had as many messages as its index", () => {
    const rolls = [roll({ at: 1, n: 2, last: "u1#0" }), roll({ at: 2, n: 4, last: "u2#0" })];
    expect(rollsFor(rolls, "r2", 4, 0).map((r) => r.at)).toEqual([2]);
    expect(rollsFor(rolls, "r1", 2, 0).map((r) => r.at)).toEqual([1]);
    expect(rollsFor(rolls, "r1", 3, 0)).toEqual([]);
  });

  it("a sent reply whose player line was saved after the request takes the roll one short, found by the message before that line", () => {
    // the chat had 13 messages (the last a reply r12) when the roll was made; then the player's line u13 and the reply r14 came
    const rolls = [roll({ at: 1, n: 13, last: "r12#0" })];
    expect(rollsFor(rolls, "r14", 14, 0, ["u13", "r12"]).map((r) => r.at)).toEqual([1]);
    // the reply after it does not take it, nor a swipe, nor a reply whose earlier message differs
    expect(rollsFor(rolls, "r16", 16, 0, ["u15", "r14"])).toEqual([]);
    expect(rollsFor(rolls, "r14", 14, 1, ["u13", "r12"])).toEqual([]);
    expect(rollsFor(rolls, "r14", 14, 0, ["u13", "x"])).toEqual([]);
  });

  it("a return of the cast follows the message it was sent after, whether or not the player's line was saved yet", () => {
    const rolls = [roll({ at: 1, kind: "cast", n: 100, last: "s99#0" })];
    // reply right after s99 (the player's line was saved after the request) or after the player's line that follows it
    expect(rollsFor(rolls, "r", 101, 0, ["s99"]).map((r) => r.at)).toEqual([1]);
    expect(rollsFor(rolls, "r", 102, 0, ["u", "s99"]).map((r) => r.at)).toEqual([1]);
    expect(rollsFor(rolls, "r", 103, 0, ["x", "u"])).toEqual([]);
  });

  it("each swipe takes its own roll, found by the swipe count at the time", () => {
    const rolls = [
      roll({ at: 1, op: "send", n: 2, last: "u#0" }),
      roll({ at: 2, op: "swipe", n: 3, last: "r#0", lastSwipes: 1 }),
      roll({ at: 3, op: "swipe", n: 3, last: "r#1", lastSwipes: 2 }),
    ];
    expect(rollsFor(rolls, "r", 2, 0).map((r) => r.at)).toEqual([1]);
    expect(rollsFor(rolls, "r", 2, 1).map((r) => r.at)).toEqual([2]);
    expect(rollsFor(rolls, "r", 2, 2).map((r) => r.at)).toEqual([3]);
  });

  it("shows quiet rolls nowhere, and the action's roll before the world's", () => {
    const rolls = [roll({ at: 1, n: 2, inserted: false, gated: false }), roll({ at: 2, n: 2, kind: "life", tier: "minor" }), roll({ at: 3, n: 2 })];
    expect(rollsFor(rolls, "r", 2, 0).map((r) => r.at)).toEqual([3, 2]);
  });
});
