/** The "What fired" helpers (#253): how the last reply's rows are grouped, how the counted lists are ordered, and the plain-text report. */
import { describe, expect, it } from "bun:test";
import { buildFiredReport, loreGroups, repliesAgo, share, topBank, topLore, type FiredLast, type FiredLog } from "../src/lib/fired";

const row = (title: string, via: string, over: Record<string, unknown> = {}) =>
  ({ uid: 1, title, book: "Town", bookId: "town", via, chars: 40, pass: 0, ...over }) as never;

const last = (over: Partial<FiredLast> = {}): FiredLast => ({
  gen: "send", at: 1_000_000, reply: 3, by: "Aria", used: 200, budget: 4000, scanDepth: 4,
  fired: [row("Tower", "key", { key: "tower" }), row("Rules", "constant"), row("Old inn", "vector", { score: 0.61 }), row("Moat", "vector", { score: 0.83 }), row("Bell", "sticky")],
  skipped: [row("Crypt", "key")],
  blocked: [{ uid: 9, title: "Ghost", book: "Town", reason: "secondary", key: "", via: "vector", score: 0.7 }] as never,
  ...over,
});

const log = (over: Partial<FiredLog> = {}): FiredLog => ({
  v: 1, since: Date.UTC(2026, 10, 5), replies: 10, at: 1_000_000,
  lore: {
    "town:1": { n: 3, at: 10, t: "Tower", b: "Town", v: { key: 3 } },
    "town:2": { n: 7, at: 4, t: "Moat", b: "Town", v: { vector: 7 }, best: 0.83 },
    "town:3": { n: 7, at: 9, t: "Bell", b: "Town", v: { sticky: 7 } },
  },
  bank: { "notes.txt#2": { n: 2, at: 8, f: "notes.txt", p: 2, best: 0.5 }, "notes.txt#1": { n: 5, at: 3, f: "notes.txt", p: 1 } },
  last: last(),
  ...over,
});

describe("what fired: helpers", () => {
  it("groups the last reply by the way in, the closest meaning first, held and cut kept apart", () => {
    const g = loreGroups(last());
    expect(g.vector.map((r) => r.title)).toEqual(["Moat", "Old inn"]);
    expect(g.key.map((r) => r.title)).toEqual(["Tower"]);
    expect(g.sticky.map((r) => r.title)).toEqual(["Bell"]);
    expect(g.constant.map((r) => r.title)).toEqual(["Rules"]);
    expect(g.held.map((r) => r.title)).toEqual(["Ghost"]);
    expect(g.cut.map((r) => r.title)).toEqual(["Crypt"]);
  });

  it("lists the counted entries by how often, then by how lately", () => {
    expect(topLore(log()).map((r) => r.e.t)).toEqual(["Bell", "Moat", "Tower"]);
    expect(topLore(log(), 2)).toHaveLength(2);
    expect(topBank(log()).map((r) => r.id)).toEqual(["notes.txt#1", "notes.txt#2"]);
  });

  it("counts replies ago and the share of replies, never below 0 or above 1", () => {
    expect(repliesAgo({ replies: 10 }, 10)).toBe(0);
    expect(repliesAgo({ replies: 10 }, 4)).toBe(6);
    expect(repliesAgo({ replies: 3 }, 9)).toBe(0);
    expect(share(3, 10)).toBeCloseTo(0.3);
    expect(share(12, 10)).toBe(1);
    expect(share(1, 0)).toBe(0);
  });

  it("writes a report that names the groups, the held reason and the counts, and copes with no record", () => {
    const text = buildFiredReport("Aria chat", log(), null, null, 1_005_000);
    expect(text).toContain("What fired: Aria chat");
    expect(text).toContain("By meaning (2):");
    expect(text).toContain("- Moat [Town] by meaning 0.83");
    expect(text).toContain("Held back (1):");
    expect(text).toContain("Ghost [Town] secondary");
    expect(text).toContain("Bell [Town] 7/10");
    expect(text).toContain("notes.txt #1 5/10");
    expect(buildFiredReport("", null, null, null)).toContain("no record yet");
  });
});
