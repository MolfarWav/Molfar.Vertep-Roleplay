import { describe, expect, it } from "bun:test";
import { povCast, povDirection } from "../src/lib/pov";

describe("continue from someone's view", () => {
  it("is one stage direction, with no words of the player's own", () => {
    expect(povDirection("Mark")).toBe("[[Continue the story from Mark's point of view.]]");
  });
  it("keeps a name from closing the direction early", () => {
    expect(povDirection("Ma]]rk [x]\n  Jr")).toBe("[[Continue the story from Mark x Jr's point of view.]]");
    expect(povDirection("x".repeat(200)).length).toBeLessThan(120);
  });
  it("lists the people in the scene first, then the others, then the card's members, one row per name", () => {
    const cast = povCast({ order: ["Ada", "Bram", "Cleo"], present: ["Cleo"] }, ["bram", "Dina"]);
    expect(cast).toEqual([
      { name: "Cleo", inScene: true },
      { name: "Ada", inScene: false },
      { name: "Bram", inScene: false },
      { name: "Dina", inScene: false },
    ]);
  });
  it("works without a Dashboard: the card or the group members", () => {
    expect(povCast(null, ["Odarka", "Mavka"])).toEqual([{ name: "Odarka", inScene: false }, { name: "Mavka", inScene: false }]);
    expect(povCast(null, [])).toEqual([]);
  });
});
