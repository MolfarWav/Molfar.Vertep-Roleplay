import { describe, it, expect } from "bun:test";
import { seedThemes, defaultSettings, withBuiltinThemes } from "../src/lib/seed";

describe("built-in themes", () => {
  it("a fresh install starts on a theme that exists in the seed", () => {
    const id = defaultSettings().activeThemeId;
    expect(id).toBe("theme_vertep");
    expect(seedThemes.some((t) => t.id === id)).toBe(true);
  });

  it("Vertep is built in, dark, and carries the second accent", () => {
    const v = seedThemes.find((t) => t.id === "theme_vertep");
    expect(v?.builtin).toBe(true);
    expect(v?.name).toBe("Vertep");
    expect(v?.colors.accent).toBe("#e2213a");
    expect(v?.colors.cta).toBe("#39d5ff");
    // dark only: the background is far below mid-grey
    expect(parseInt(v!.colors.chatBg.slice(1, 3), 16)).toBeLessThan(0x40);
  });

  it("the old default is plain Void now, and the other themes need no cta", () => {
    expect(seedThemes.find((t) => t.id === "theme_void")?.name).toBe("Void");
    for (const t of seedThemes.filter((t) => t.id !== "theme_vertep")) expect(t.colors.cta).toBeUndefined();
  });

  it("theme ids are unique", () => {
    const ids = seedThemes.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("an existing library gains the missing built-ins and keeps its own entries", () => {
    const custom = { id: "theme_mine", name: "Mine", builtin: false, colors: { ...seedThemes[1].colors } };
    const old = [...seedThemes.filter((t) => t.id !== "theme_vertep"), custom];
    const merged = withBuiltinThemes(old);
    expect(merged.map((t) => t.id)).toEqual(["theme_vertep", ...old.map((t) => t.id)]);
    // already complete: the same array comes back untouched
    expect(withBuiltinThemes(merged)).toBe(merged);
    // an edited built-in is never overwritten
    const edited = [{ ...seedThemes[0], name: "My Vertep" }];
    expect(withBuiltinThemes(edited).find((t) => t.id === "theme_vertep")?.name).toBe("My Vertep");
  });
});
