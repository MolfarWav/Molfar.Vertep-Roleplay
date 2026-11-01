// Home's layout rules (src/lib/home-layout.ts): the default page, repairing a stored layout, moving, hiding, sizes.
import { describe, expect, it } from "bun:test";
import {
  DEFAULT_ORDER, DEFAULT_SIZE, HOME_BLOCKS, SPAN_COLS, cycleSize, defaultHomeLayout, hiddenBlocks, hideBlock, isShown,
  moveBlock, resetHomeLayout, restoreBlock, sanitizeHomeLayout, setMarketSuggest, shownBlocks, sizeOf,
  type HomeBlockId, type HomeLayout,
} from "../src/lib/home-layout";

/** Greedy row packing on the 12-column grid, the way the dense grid places blocks. */
function rows(blocks: HomeBlockId[], layout: HomeLayout): HomeBlockId[][] {
  const out: HomeBlockId[][] = [];
  let row: HomeBlockId[] = [];
  let used = 0;
  for (const id of blocks) {
    const cols = SPAN_COLS[sizeOf(layout, id)];
    if (used + cols > 12) { out.push(row); row = []; used = 0; }
    row.push(id);
    used += cols;
  }
  if (row.length) out.push(row);
  return out;
}

describe("the default page", () => {
  it("has the nine blocks in the order the design gives", () => {
    expect(DEFAULT_ORDER).toEqual(["continue", "library", "market", "world", "waiting", "quests", "favourites", "news", "help"]);
    expect([...HOME_BLOCKS].sort()).toEqual([...DEFAULT_ORDER].sort());
  });

  it("packs into four full rows of 12 columns", () => {
    const layout = defaultHomeLayout();
    expect(rows(shownBlocks(layout), layout)).toEqual([
      ["continue", "library"],
      ["market", "world", "waiting"],
      ["quests", "favourites"],
      ["news", "help"],
    ]);
    expect(DEFAULT_SIZE.continue).toBe("md");
    expect(DEFAULT_SIZE.library).toBe("sm");
  });

  it("starts with market shown and nothing hidden", () => {
    const layout = defaultHomeLayout();
    expect(layout.hidden).toEqual([]);
    expect(layout.marketSuggest).toBe(true);
    expect(shownBlocks(layout)).toHaveLength(9);
    expect(shownBlocks(layout, false)).not.toContain("market");
  });
});

describe("sanitizeHomeLayout", () => {
  it("gives the default page for anything that is not an object", () => {
    expect(sanitizeHomeLayout(undefined)).toEqual(defaultHomeLayout());
    expect(sanitizeHomeLayout("nope")).toEqual(defaultHomeLayout());
    expect(sanitizeHomeLayout([1, 2])).toEqual(defaultHomeLayout());
    expect(sanitizeHomeLayout({})).toEqual(defaultHomeLayout());
  });

  it("drops unknown and duplicate ids, and appends blocks missing from the order", () => {
    const layout = sanitizeHomeLayout({ order: ["news", "ghost", "news", "continue"], hidden: ["help", "ghost", "help"] });
    expect(layout.order.slice(0, 2)).toEqual(["news", "continue"]);
    expect(layout.order).toHaveLength(9);
    expect(new Set(layout.order).size).toBe(9);
    expect(layout.order.slice(2)).toEqual(DEFAULT_ORDER.filter((id) => id !== "news" && id !== "continue"));
    expect(layout.hidden).toEqual(["help"]);
  });

  it("keeps sizes that exist and drops the rest", () => {
    const layout = sanitizeHomeLayout({ sizes: { library: "lg", help: "huge", ghost: "sm", news: 3 } });
    expect(layout.sizes).toEqual({ library: "lg" });
    expect(sizeOf(layout, "library")).toBe("lg");
    expect(sizeOf(layout, "help")).toBe(DEFAULT_SIZE.help);
    expect(sanitizeHomeLayout({ sizes: { help: "bogus" } }).sizes).toBeUndefined();
  });

  it("the Marketplace suggestion is on unless it is stored as false", () => {
    expect(sanitizeHomeLayout({}).marketSuggest).toBe(true);
    expect(sanitizeHomeLayout({ marketSuggest: "no" }).marketSuggest).toBe(true);
    expect(sanitizeHomeLayout({ marketSuggest: false }).marketSuggest).toBe(false);
  });
});

describe("what is shown", () => {
  it("leaves out hidden blocks and keeps the order", () => {
    const layout = hideBlock(defaultHomeLayout(), "world");
    expect(shownBlocks(layout)).toEqual(DEFAULT_ORDER.filter((id) => id !== "world"));
    expect(hiddenBlocks(layout)).toEqual(["world"]);
  });

  it("the market block is off when its suggestion is switched off or unavailable", () => {
    const off = setMarketSuggest(defaultHomeLayout(), false);
    expect(isShown(off, "market")).toBe(false);
    expect(shownBlocks(off)).not.toContain("market");
    expect(hiddenBlocks(off)).toEqual([]);
    expect(shownBlocks(defaultHomeLayout(), false)).not.toContain("market");
    expect(shownBlocks(defaultHomeLayout(), true)).toContain("market");
  });
});

describe("moving", () => {
  it("swaps a block with its neighbour on the page", () => {
    const layout = defaultHomeLayout();
    const up = moveBlock(layout, "world", -1);
    expect(up.order.indexOf("world")).toBe(layout.order.indexOf("world") - 1);
    expect(moveBlock(up, "world", 1)).toEqual(layout);
  });

  it("does nothing at the ends and for an unknown id", () => {
    const layout = defaultHomeLayout();
    expect(moveBlock(layout, "continue", -1)).toBe(layout);
    expect(moveBlock(layout, "help", 1)).toBe(layout);
    expect(moveBlock(layout, "nope" as HomeBlockId, 1)).toBe(layout);
  });

  it("skips a hidden block: it keeps its place and the shown ones trade places around it", () => {
    const base: HomeLayout = { order: ["continue", "library", "world", "help"], hidden: ["library"], marketSuggest: true };
    // shown: continue, world, help. World moves above continue; the hidden library stays in its slot
    const moved = moveBlock(base, "world", -1);
    expect(moved.order).toEqual(["world", "library", "continue", "help"]);
    expect(shownBlocks(moved)).toEqual(["world", "continue", "help"]);
    const moved2 = moveBlock(base, "help", -1);
    expect(moved2.order).toEqual(["continue", "library", "help", "world"]);
  });

  it("skips the market block while its suggestion is off", () => {
    const base = setMarketSuggest(defaultHomeLayout(), false);
    const moved = moveBlock(base, "world", -1);
    expect(shownBlocks(moved).slice(0, 3)).toEqual(["continue", "world", "library"]);
    expect(moved.order.indexOf("market")).toBe(base.order.indexOf("market"));
  });
});

describe("hiding and restoring", () => {
  it("hide adds once, restore removes, and both keep the other blocks", () => {
    const layout = defaultHomeLayout();
    const hidden = hideBlock(hideBlock(layout, "news"), "news");
    expect(hidden.hidden).toEqual(["news"]);
    expect(restoreBlock(hidden, "news").hidden).toEqual([]);
    expect(restoreBlock(layout, "news")).toEqual(layout);
  });
});

describe("sizes", () => {
  it("cycles sm, md, lg, sm from the block's own size", () => {
    let layout = defaultHomeLayout();
    expect(sizeOf(layout, "continue")).toBe("md");
    layout = cycleSize(layout, "continue");
    expect(sizeOf(layout, "continue")).toBe("lg");
    layout = cycleSize(layout, "continue");
    expect(sizeOf(layout, "continue")).toBe("sm");
    layout = cycleSize(layout, "continue");
    expect(sizeOf(layout, "continue")).toBe("md");
    expect(sizeOf(layout, "library")).toBe("sm");
  });
});

describe("reset", () => {
  it("puts the order back and clears hidden and sizes, but keeps the Marketplace choice", () => {
    let layout = hideBlock(cycleSize(moveBlock(setMarketSuggest(defaultHomeLayout(), false), "help", -1), "library"), "news");
    layout = resetHomeLayout(layout);
    expect(layout.order).toEqual(DEFAULT_ORDER);
    expect(layout.hidden).toEqual([]);
    expect(layout.sizes).toBeUndefined();
    expect(layout.marketSuggest).toBe(false);
  });
});
