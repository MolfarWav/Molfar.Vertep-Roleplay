/**
 * #184 P8: the sensor's `edges` (a role and a warmth between two characters) reach the Dashboard insert as one short line.
 * A speaker gets only the ties it is part of; a narrator gets the ties of the people the turn is about first; at most four.
 */
import { describe, expect, it } from "bun:test";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

const snap = {
  edges: [
    { from: "Ada", to: "Bram", role: "rival", warmth: "cold" },
    { from: "Bram", to: "Cara", role: "sister", warmth: "warm" },
    { from: "Ada", to: "Cara", role: "", warmth: "" },
    { from: "Ada", to: "Gone", role: "friend", warmth: "warm" },
  ],
};

describe("edgesLine", () => {
  it("names only ties between people who are here", () => {
    const line = P.edgesLine(snap, ["Ada", "Bram", "Cara"], null, []);
    expect(line).toContain("Ada to Bram: rival, cold");
    expect(line).toContain("Bram to Cara: sister, warm");
    expect(line).not.toContain("Gone");
  });

  it("leaves out a tie with neither a role nor a warmth", () => {
    expect(P.edgesLine(snap, ["Ada", "Cara"], null, [])).toBe("");
  });

  it("gives a speaker only the ties it is part of", () => {
    const line = P.edgesLine(snap, ["Ada", "Bram", "Cara"], "Cara", ["Cara"]);
    expect(line).toContain("Bram to Cara");
    expect(line).not.toContain("Ada to Bram");
  });

  it("puts the ties of the focus first for a narrator and stops at four", () => {
    const many = { edges: ["B", "C", "D", "E", "F"].map((to) => ({ from: "A", to, role: "r", warmth: "w" })).concat([{ from: "F", to: "E", role: "x", warmth: "y" }]) };
    const line = P.edgesLine(many, ["A", "B", "C", "D", "E", "F"], null, ["F"]);
    expect(line.split(";").length).toBe(4);
    expect(line.indexOf("F to E")).toBeLessThan(line.indexOf("A to B"));
  });

  it("is empty without edges", () => {
    expect(P.edgesLine({}, ["Ada"], null, [])).toBe("");
    expect(P.edgesLine(null, [], null, [])).toBe("");
  });
});
