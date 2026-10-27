import { describe, expect, it } from "bun:test";
import { rollsFor } from "../src/components/chat/dice-note";
import type { WorldDiceRoll } from "../src/lib/world";

const roll = (extra: Partial<WorldDiceRoll>): WorldDiceRoll => ({ at: 1, op: "send", mode: "flavour", stat: "auto", who: "", value: null, chance: 100, gated: true, gate: 1, inserted: true, ...extra }) as WorldDiceRoll;

describe("the marks under the replies", () => {
  it("a sent reply takes the roll made when the chat had as many messages as its index", () => {
    const rolls = [roll({ at: 1, n: 2, last: "u1#0" }), roll({ at: 2, n: 4, last: "u2#0" })];
    expect(rollsFor(rolls, "r2", 4, 0).map((r) => r.at)).toEqual([2]);
    expect(rollsFor(rolls, "r1", 2, 0).map((r) => r.at)).toEqual([1]);
    expect(rollsFor(rolls, "r1", 3, 0)).toEqual([]);
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
