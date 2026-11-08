// The pure helpers of the Turning points tab (#288) and its strings.
import { describe, expect, it } from "bun:test";
import { DICTIONARIES, t, type MsgKey } from "../src/lib/i18n";
import { activeTurnCount, firstWords, sameKnown, sameStances, sortTurns, stancesOfRows, stanceRowsOf, turnNames } from "../src/components/library/turns-util";
import type { LitTurn } from "../src/components/library/litopys-api";

const turn = (id: string, at: number, more: Partial<LitTurn> = {}): LitTurn => ({ id, text: "Text " + id, knownBy: "all", stances: {}, origin: "chapter", at, updatedAt: at, ...more });

describe("turning points helpers", () => {
  it("counts only the ones that are not undone, and survives a plugin without turns", () => {
    expect(activeTurnCount(undefined)).toBe(0);
    expect(activeTurnCount([turn("t1", 1, { overriddenBy: "t2" }), turn("t2", 2), turn("t3", 3)])).toBe(2);
  });

  it("sorts in story order, oldest first, ties by id number", () => {
    const ids = sortTurns([turn("t10", 5), turn("t2", 5), turn("t3", 1)]).map((x) => x.id);
    expect(ids).toEqual(["t3", "t2", "t10"]);
  });

  it("firstWords cuts at a word and keeps a short text whole", () => {
    expect(firstWords("Short text.")).toBe("Short text.");
    const long = "Bram betrayed Ada at the gate and the whole valley heard the horn that night";
    const cut = firstWords(long, 30);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(31);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut).not.toMatch(/\s…$/);
  });

  it("turns stance rows into the map the route takes: incomplete rows go, a repeated name keeps the last line", () => {
    const rows = [{ who: " Ada ", line: "afraid" }, { who: "Bram", line: "" }, { who: "", line: "x" }, { who: "ada", line: "ashamed  now" }];
    expect(stancesOfRows(rows)).toEqual({ ada: "ashamed now" });
    expect(stanceRowsOf({ Ada: "afraid" })).toEqual([{ who: "Ada", line: "afraid" }]);
    expect(stanceRowsOf(undefined)).toEqual([]);
  });

  it("compares stances and who-knows for the editor's change check", () => {
    expect(sameStances({ A: "x" }, { A: "x" })).toBe(true);
    expect(sameStances({ A: "x" }, { A: "y" })).toBe(false);
    expect(sameStances({}, { A: "x" })).toBe(false);
    expect(sameKnown("all", "all")).toBe(true);
    expect(sameKnown("all", ["A"])).toBe(false);
    expect(sameKnown(["A", "B"], ["A", "B"])).toBe(true);
  });

  it("collects the names of the record once each, without groups or the world", () => {
    const facts = [{ subject: "Ada", knownBy: ["Bram", "group:guild-of-ravens"] }, { subject: "world", knownBy: "all" }] as never;
    const turns = [turn("t1", 1, { cast: ["ada", "Cy"], stances: { Dov: "calm" } })];
    expect(turnNames({ facts, turns })).toEqual(["Ada", "Bram", "Cy", "Dov"]);
  });
});

describe("turning points strings", () => {
  it("every lit.turns and turn activity key has both languages", () => {
    const keys = (Object.keys(DICTIONARIES.en) as MsgKey[]).filter((k) => k === "lit.turns" || k.startsWith("lit.turns.") || k.startsWith("lit.act.turn"));
    expect(keys.length).toBeGreaterThan(40);
    for (const k of keys) {
      expect(DICTIONARIES.uk[k], k).toBeTruthy();
      expect(DICTIONARIES.uk[k], k).not.toBe(DICTIONARIES.en[k]);
    }
  });

  it("the count takes the Ukrainian plural forms", () => {
    expect(t("lit.turns.count", "uk", { n: 1 })).toBe("1 поворотний момент");
    expect(t("lit.turns.count", "uk", { n: 3 })).toBe("3 поворотні моменти");
    expect(t("lit.turns.count", "uk", { n: 7 })).toBe("7 поворотних моментів");
    expect(t("lit.turns.count", "en", { n: 2 })).toBe("2 turning points");
  });
});
