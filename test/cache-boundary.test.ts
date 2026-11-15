// Which part of the prompt the cache covered (#112): the usage of the last reply against the prompt peek's blocks.
import { describe, expect, it } from "bun:test";
import { blockStates, cacheBoundary, cacheSplit, lastReplyUsage, partStates, stateOf } from "../src/lib/cache-boundary";
import type { Message } from "../src/lib/types";

const reply = (usage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }) =>
  ({ role: "assistant", activeSwipe: 0, swipes: [{ usage }] }) as unknown as Message;
const user = () => ({ role: "user", activeSwipe: 0, swipes: [{}] }) as unknown as Message;

describe("lastReplyUsage", () => {
  it("adds what was read and written to the full-price input", () => {
    const u = lastReplyUsage([user(), reply({ input: 1000, output: 50, cacheRead: 20000, cacheWrite: 300 })]);
    expect(u).toEqual({ input: 1000, cacheRead: 20000, cacheWrite: 300, prompt: 21300 });
    expect(cacheSplit(u!)).toEqual({ read: 20000, written: 300, fresh: 1000, prompt: 21300 });
  });
  it("looks past a reply that is still streaming, and says null when no reply has usage", () => {
    expect(lastReplyUsage([reply({ input: 500, output: 5 }), user(), reply(undefined)])?.prompt).toBe(500);
    expect(lastReplyUsage([user(), reply(undefined)])).toBeNull();
  });
});

describe("cacheBoundary", () => {
  const blocks = [{ tokens: 4000 }, { tokens: 3000 }, { tokens: 2000 }, { tokens: 1000 }];
  it("puts the cut where the cached share of the last prompt reaches in the preview", () => {
    // 5000 of a 10000-token prompt came from the cache: half the preview, the cut falls inside the second block
    const b = cacheBoundary(blocks, 5000, 10000)!;
    expect(b).toMatchObject({ at: 5000, total: 10000, block: 1 });
    expect(b.within).toBeCloseTo(1 / 3, 5);
    expect(blockStates(blocks, b)).toEqual(["cached", "partial", "new", "new"]);
  });
  it("is the whole prompt when everything was cached, and null with no cache or no numbers", () => {
    expect(cacheBoundary(blocks, 10000, 10000)).toMatchObject({ at: 10000, block: 4 });
    expect(blockStates(blocks, cacheBoundary(blocks, 10000, 10000)!)).toEqual(["cached", "cached", "cached", "cached"]);
    expect(cacheBoundary(blocks, 0, 10000)).toBeNull();
    expect(cacheBoundary(blocks, 100, 0)).toBeNull();
    expect(cacheBoundary([], 100, 200)).toBeNull();
  });
  it("never counts more cache than the provider reported, even when the prompt shrank", () => {
    expect(cacheBoundary(blocks, 30000, 10000)!.at).toBe(10000);
  });
  it("tells a stretch's state", () => {
    const b = cacheBoundary(blocks, 5000, 10000)!;
    expect(stateOf(0, 4000, b)).toBe("cached");
    expect(stateOf(4000, 6000, b)).toBe("partial");
    expect(stateOf(5000, 6000, b)).toBe("new");
  });
});

describe("partStates", () => {
  it("reads each part's place from where its marks sit, in proportion to the block", () => {
    // the system prompt (msg -1) is 4000 tokens over 400 characters; two messages follow
    const blocks = [
      { msg: -1, tokens: 4000, length: 400 },
      { msg: 0, tokens: 3000, length: 300 },
      { msg: 1, tokens: 3000, length: 300 },
    ];
    const b = cacheBoundary(blocks, 5000, 10000)!; // the cut is 1000 tokens into message 0
    const spans = [
      { msg: -1, start: 0, end: 200, part: 0 }, // the first half of the system prompt: cached
      { msg: -1, start: 300, end: 400, part: 1 }, // its end: still before the cut
      { msg: 0, start: 0, end: 300, part: 2 }, // all of message 0: the cut is inside it
      { msg: 1, start: 0, end: 100, part: 3 }, // after the cut
    ];
    expect(partStates(blocks, spans, 5, b)).toEqual(["cached", "cached", "partial", "new", null]);
  });
});
