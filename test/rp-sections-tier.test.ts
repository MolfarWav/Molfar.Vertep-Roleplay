// The tier of every section (#448, T2): the rail's groups follow the tiers, so a group never mixes the lobby and Backstage.
import { describe, expect, it } from "bun:test";
import { RAIL_SECTIONS, SECTIONS, sectionGroups } from "../src/components/shell/sections";

describe("section tiers", () => {
  it("every section has a tier, and the Stage is not a section", () => {
    for (const s of SECTIONS) expect(["playbill", "backstage"]).toContain(s.tier);
  });

  it("a rail group holds one tier", () => {
    for (const g of sectionGroups()) expect(new Set(g.map((s) => s.tier)).size).toBe(1);
  });

  it("the lobby comes first on the rail, Backstage after it", () => {
    const tiers = RAIL_SECTIONS.map((s) => s.tier);
    expect(tiers.indexOf("backstage")).toBeGreaterThan(tiers.lastIndexOf("playbill"));
  });

  it("the rail's lobby is Home, Chats and the people", () => {
    const lobby = RAIL_SECTIONS.filter((s) => s.tier === "playbill").map((s) => s.key);
    expect(lobby).toEqual(["home", "chats", "characters", "groups", "marketplace", "personas"]);
  });
});
