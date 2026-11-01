import { describe, expect, it } from "bun:test";
import { dropIndex, moveTo } from "../src/lib/forge";

describe("moveTo", () => {
  it("puts the item at the place asked and keeps the rest in order", () => {
    expect(moveTo(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveTo(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("returns the same list when nothing moves or the place is out of range", () => {
    const l = ["a", "b"];
    expect(moveTo(l, 1, 1)).toBe(l);
    expect(moveTo(l, 0, 5)).toBe(l);
    expect(moveTo(l, -1, 0)).toBe(l);
  });
  it("does not change the list it was given", () => {
    const l = ["a", "b", "c"];
    moveTo(l, 0, 2);
    expect(l).toEqual(["a", "b", "c"]);
  });
});

describe("dropIndex", () => {
  // four rows, 100 px tall, middles at 50, 150, 250, 350
  const mids = [50, 150, 250, 350];
  it("stays put while the pointer is near the row's own place", () => {
    expect(dropIndex(mids, 1, 150)).toBe(1);
    expect(dropIndex(mids, 1, 100)).toBe(1);
  });
  it("goes down past every row whose middle is above the pointer", () => {
    expect(dropIndex(mids, 0, 260)).toBe(2);
    expect(dropIndex(mids, 0, 999)).toBe(3);
  });
  it("goes up to the first place when the pointer is above everything", () => {
    expect(dropIndex(mids, 3, -20)).toBe(0);
    expect(dropIndex(mids, 3, 140)).toBe(1);
  });
});
