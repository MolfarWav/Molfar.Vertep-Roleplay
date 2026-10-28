/** onImageError (#167): an `/v1/` picture in the cookieless app frame fails once before the bridge swaps in a blob. */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { onImageError } from "../src/lib/utils";

type Img = { src: string; isConnected: boolean; complete: boolean; naturalWidth: number; getAttribute: (n: string) => string | null };
const img = (src: string, over: Partial<Img> = {}): HTMLImageElement =>
  ({ src, isConnected: true, complete: false, naturalWidth: 0, getAttribute: function (this: Img) { return this.src }, ...over }) as unknown as HTMLImageElement;

let timers: (() => void)[] = [];
const realWindow = (globalThis as { window?: unknown }).window;
beforeEach(() => {
  timers = [];
  (globalThis as { window?: unknown }).window = { setTimeout: (fn: () => void) => { timers.push(fn); return timers.length } };
});
afterEach(() => { (globalThis as { window?: unknown }).window = realWindow; });

describe("onImageError", () => {
  it("gives up at once on an address that is not the asset store's", () => {
    let gave = 0;
    onImageError(img("https://example.com/a.png"), () => gave++);
    onImageError(img("blob:abc"), () => gave++);
    expect(gave).toBe(2);
    expect(timers).toHaveLength(0);
  });

  it("waits on an /v1/ picture, and gives up only if it has still not loaded", () => {
    let gave = 0;
    const a = img("/v1/assets/" + "a".repeat(64));
    onImageError(a, () => gave++);
    expect(gave).toBe(0);
    // the bridge swapped in a blob and it loaded
    Object.assign(a, { src: "blob:x", complete: true, naturalWidth: 683 });
    timers[0]!();
    expect(gave).toBe(0);
    // one that never loads
    onImageError(img("/v1/assets/" + "b".repeat(64)), () => gave++);
    timers[1]!();
    expect(gave).toBe(1);
    // one that left the page meanwhile is not reported
    onImageError(img("/v1/assets/" + "c".repeat(64), { isConnected: false }), () => gave++);
    timers[2]!();
    expect(gave).toBe(1);
  });
});
