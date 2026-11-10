import { describe, expect, it } from "bun:test";
import fs from "node:fs";

// #353: the Characters column of a chat's record let a card grow past the column when a fact had a long "Known by" list.
// A bare `grid` has one `auto` column that grows to the widest unbreakable badge; `grid-cols-1` is minmax(0, 1fr), and a
// badge that holds names has to be able to wrap. This reads the sources because the layout needs a real browser to measure
// (it was measured by hand at 390, 990 and 1500 px); the test only keeps the two causes from coming back.
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("the record's Overview does not widen past its column (#353)", () => {
  it("the cast grid and the Overview grid have an explicit one-column track", () => {
    expect(read("src/components/library/overview-cast.tsx")).toContain('className="grid grid-cols-1 gap-3 @xl:grid-cols-2"');
    expect(read("src/components/library/overview.tsx")).toContain('className="grid grid-cols-1 gap-5 @2xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]"');
  });
  it("a fact's badges that carry names or text may wrap", () => {
    const src = read("src/components/library/ledger-facts.tsx");
    const wrapping = src.split("\n").filter((l) => l.includes("<Badge") && l.includes("whitespace-normal"));
    // Known by, the subject, merged into, supersedes
    expect(wrapping.length + (src.includes("whitespace-normal text-left text-[10px] leading-4") ? 1 : 0)).toBeGreaterThanOrEqual(4);
  });
});
