// A side sheet's width defaults must lose to the caller's own width classes. The defaults used to be written as
// `data-[side=right]:w-3/4 data-[side=right]:sm:max-w-sm`: tailwind-merge dedupes only within one variant prefix, so a
// caller's `w-full sm:max-w-md` could not replace them and the World DM sheet stayed 384 px wide (and 3/4 of a phone).
import { describe, expect, it } from "bun:test";

const { sheetClasses } = await import("../src/components/ui/sheet");

const has = (cls: string, c: string) => cls.split(/\s+/).includes(c);

describe("sheetClasses", () => {
  it("gives a right sheet its default width when the caller passes none", () => {
    const cls = sheetClasses("right", "gap-0");
    expect(has(cls, "w-3/4")).toBe(true);
    expect(has(cls, "sm:max-w-sm")).toBe(true);
  });

  it("lets a caller's width win: w-full sm:max-w-md replaces both defaults", () => {
    const cls = sheetClasses("right", "w-full sm:max-w-md");
    expect(has(cls, "w-full")).toBe(true);
    expect(has(cls, "sm:max-w-md")).toBe(true);
    expect(has(cls, "w-3/4")).toBe(false);
    expect(has(cls, "sm:max-w-sm")).toBe(false);
  });

  it("works the same for the left side and for arbitrary widths", () => {
    const cls = sheetClasses("left", "w-[min(320px,88vw)] sm:max-w-[420px]");
    expect(has(cls, "w-[min(320px,88vw)]")).toBe(true);
    expect(has(cls, "sm:max-w-[420px]")).toBe(true);
    expect(has(cls, "w-3/4")).toBe(false);
    expect(has(cls, "sm:max-w-sm")).toBe(false);
  });

  it("keeps the data-[side=..] form out-ranking by specificity (it is not merged away)", () => {
    const cls = sheetClasses("right", "data-[side=right]:w-full data-[side=right]:sm:max-w-xl");
    expect(has(cls, "data-[side=right]:w-full")).toBe(true);
    expect(has(cls, "data-[side=right]:sm:max-w-xl")).toBe(true);
  });

  it("gives top and bottom sheets no side width", () => {
    expect(has(sheetClasses("bottom", "max-h-[80dvh]"), "w-3/4")).toBe(false);
    expect(has(sheetClasses("top", ""), "sm:max-w-sm")).toBe(false);
  });
});
