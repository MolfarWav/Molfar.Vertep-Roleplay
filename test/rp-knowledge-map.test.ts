// The knowledge map (#449, S1): which facts are secrets, who knows or suspects them, and the order.
import { describe, expect, it } from "bun:test";
import { knowledgeMap, stateOf } from "../src/lib/knowledge-map";
import { DICTIONARIES, type MsgKey } from "../src/lib/i18n";
import type { LitFact } from "../src/components/library/litopys-api";

const fact = (id: string, more: Partial<LitFact> = {}): LitFact => ({
  id, text: "Text " + id, subject: "Ada", knownBy: "all", type: "event", weight: "everyday", pinned: false,
  status: "active", at: 1, updatedAt: 1, ...more,
});
const map = (facts: LitFact[], chapters: { views?: { who: string; text: string }[] }[] = []) =>
  knowledgeMap({ facts, chapters: chapters as never });

describe("knowledge map", () => {
  it("leaves out facts told to everyone and counts them as open", () => {
    const m = map([fact("f1"), fact("f2", { knownBy: ["Ada", "Bram"] })]);
    expect(m.rows).toEqual([]);
    expect(m.open).toBe(2);
  });

  it("a fact known by fewer people than the cast is a secret, and the cast comes from every name", () => {
    const m = map([
      fact("f1", { knownBy: ["Ada"] }),
      fact("f2", { knownBy: ["Ada", "Bram", "Cora"] }),
    ]);
    expect(m.rows.map((r) => r.id)).toEqual(["f1"]);
    expect(m.open).toBe(1);
    expect(m.people.map((p) => p.name)).toEqual(["Ada"]);
  });

  it("the cast also holds the people a chapter remembers a scene for, and suspects", () => {
    const m = map(
      [fact("f1", { knownBy: ["Ada"], suspectedBy: ["Bram"] })],
      [{ views: [{ who: "Cora", text: "x" }] }],
    );
    expect(m.rows).toHaveLength(1);
    const row = m.rows[0]!;
    expect(stateOf(row, "ada")).toBe("knows");
    expect(stateOf(row, "bram")).toBe("suspects");
    expect(stateOf(row, "cora")).toBe("none");
    // Cora knows no secret, so she has no column
    expect(m.people.map((p) => p.key).sort()).toEqual(["ada", "bram"]);
  });

  it("a marked secret is shown even when everyone in the cast knows it; a retired fact never", () => {
    const m = map([
      fact("f1", { knownBy: ["Ada", "Bram"], secret: true }),
      fact("f2", { knownBy: ["Ada"], status: "retired" }),
    ]);
    expect(m.rows.map((r) => r.id)).toEqual(["f1"]);
    expect(m.rows[0]!.marked).toBe(true);
  });

  it("a belief is not a secret unless it is marked", () => {
    const m = map([
      fact("f1", { type: "belief", knownBy: ["Ada"] }),
      fact("f2", { knownBy: ["Bram"] }),
      fact("f3", { type: "belief", knownBy: ["Ada"], secret: true }),
    ]);
    expect(m.rows.map((r) => r.id).sort()).toEqual(["f2", "f3"]);
  });

  it("names are matched without case and spaces; a group token is its own column, after the people", () => {
    const m = map([
      fact("f1", { knownBy: ["Ada", "group:guild-of-ravens"] }),
      fact("f2", { knownBy: [" ada ", "Bram"], suspectedBy: ["BRAM"] }),
      fact("f3", { knownBy: ["Cora"] }),
    ]);
    const names = m.people.map((p) => `${p.name}${p.group ? "*" : ""}`);
    expect(names[names.length - 1]).toBe("Guild of ravens*");
    expect(m.people.filter((p) => p.key === "ada")).toHaveLength(1);
    // a suspect who is also listed as knowing counts once, as knowing
    const f2 = m.rows.find((r) => r.id === "f2")!;
    expect(f2.suspects).toEqual([]);
    expect(f2.knows).toEqual(["ada", "bram"]);
  });

  it("orders marked first, then the fewest knowers, then the newest", () => {
    const m = map([
      fact("old2", { knownBy: ["Ada", "Bram"], updatedAt: 1 }),
      fact("new1", { knownBy: ["Ada"], updatedAt: 9 }),
      fact("old1", { knownBy: ["Bram"], updatedAt: 2 }),
      fact("marked", { knownBy: ["Ada", "Bram"], secret: true, updatedAt: 0 }),
      fact("c", { knownBy: ["Cora", "Ada", "Bram"], updatedAt: 0 }),
    ]);
    expect(m.rows.map((r) => r.id)).toEqual(["marked", "new1", "old1", "old2"]);
  });

  it("a fact with no named knower is flagged unnamed", () => {
    const m = map([fact("f1", { knownBy: [] }), fact("f2", { knownBy: ["Ada"] })]);
    expect(m.rows.find((r) => r.id === "f1")!.unnamed).toBe(true);
  });

  it("orders people by how many secrets they touch", () => {
    const m = map([
      fact("f1", { knownBy: ["Bram"] }),
      fact("f2", { knownBy: ["Bram", "Ada"] }),
      fact("f3", { knownBy: ["Bram"] }),
      fact("f4", { knownBy: ["Ada"] }),
    ], [{ views: [{ who: "Cora", text: "x" }] }]);
    expect(m.people.map((p) => [p.name, p.involved])).toEqual([["Bram", 3], ["Ada", 2]]);
  });
});

describe("knowledge map strings", () => {
  it("every kn.* key exists in both languages", () => {
    const keys = Object.keys(DICTIONARIES.en).filter((k) => k.startsWith("lit.kn.")) as MsgKey[];
    expect(keys.length).toBeGreaterThan(8);
    for (const k of keys) expect(DICTIONARIES.uk[k]).toBeTruthy();
  });
});
