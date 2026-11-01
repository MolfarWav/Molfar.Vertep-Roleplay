// How far the side portrait may grow left into the free margin beside the chat column (src/lib/avatar-extra.ts).
// Pure numbers: the cap, the gutter kept from the log's edge, and the zero floor for narrow windows.
import { describe, expect, it } from "bun:test";
import { AVATAR_EDGE_GUTTER, AVATAR_EXTRA_MAX, avatarExtra } from "../src/lib/avatar-extra";

describe("avatarExtra constants", () => {
  it("the cap is 100 px and the edge gutter is 16 px", () => {
    expect(AVATAR_EXTRA_MAX).toBe(100);
    expect(AVATAR_EDGE_GUTTER).toBe(16);
  });
});

describe("avatarExtra", () => {
  it("a wide log grows the portrait to the cap", () => {
    // margin (1600 - 1152) / 2 = 224, room 224 + 32 - 16 = 240, capped at 100
    expect(avatarExtra(1600, 1152, 32)).toBe(AVATAR_EXTRA_MAX);
    expect(avatarExtra(1600, 1152, 32)).toBe(100);
  });

  it("a log no wider than the column gives only the padding less the gutter", () => {
    // no margin: 0 + 32 - 16 = 16
    expect(avatarExtra(1000, 1000, 32)).toBe(16);
  });

  it("a phone never gets a negative extra", () => {
    // 0 + 12 - 16 = -4, floored to 0
    expect(avatarExtra(390, 390, 12)).toBe(0);
    expect(avatarExtra(390, 390, 0)).toBe(0);
  });

  it("zero or NaN widths give 0", () => {
    expect(avatarExtra(0, 1152, 32)).toBe(0);
    expect(avatarExtra(1600, 0, 32)).toBe(0);
    expect(avatarExtra(0, 0, 32)).toBe(0);
    expect(avatarExtra(Number.NaN, 1152, 32)).toBe(0);
    expect(avatarExtra(1600, Number.NaN, 32)).toBe(0);
  });

  it("a mid case adds the margin and the padding, less the gutter: 40 + 32 - 16 = 56", () => {
    // (1232 - 1152) / 2 = 40
    expect(avatarExtra(1232, 1152, 32)).toBe(56);
  });

  it("always returns an integer", () => {
    // margins of 39.5 and 40.5 px would otherwise leave fractions
    for (const logWidth of [1231, 1233, 1299, 1301, 1500.5, 1777.3]) {
      const v = avatarExtra(logWidth, 1152, 32);
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(avatarExtra(1231, 1152, 32)).toBe(56);
    expect(avatarExtra(1233, 1152, 32)).toBe(57);
  });
});
