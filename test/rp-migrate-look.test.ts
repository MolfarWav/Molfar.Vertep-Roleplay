import { describe, expect, it } from "bun:test";
import { migrateLook } from "../src/lib/migrate-look";
import { defaultSettings } from "../src/lib/seed";

const old = () => ({ ...defaultSettings(), proseFont: "noto" as const, lineSpacing: 136, paragraphSpacing: 10, lookVersion: undefined });

describe("migrateLook", () => {
  it("moves the three old defaults and stamps version 2", () => {
    const r = migrateLook(old());
    expect(r.changed).toBe(true);
    expect(r.settings.proseFont).toBe("noto-serif");
    expect(r.settings.lineSpacing).toBe(180);
    expect(r.settings.paragraphSpacing).toBe(14);
    expect(r.settings.lookVersion).toBe(2);
  });
  it("keeps the user's own choices", () => {
    const r = migrateLook({ ...old(), proseFont: "inter", lineSpacing: 150, paragraphSpacing: 6 });
    expect(r.changed).toBe(true);
    expect(r.settings.proseFont).toBe("inter");
    expect(r.settings.lineSpacing).toBe(150);
    expect(r.settings.paragraphSpacing).toBe(6);
    expect(r.settings.lookVersion).toBe(2);
  });
  it("is idempotent", () => {
    const once = migrateLook(old()).settings;
    const twice = migrateLook(once);
    expect(twice.changed).toBe(false);
    expect(twice.settings).toBe(once);
  });
  it("does nothing at version 2, even for old-looking values", () => {
    const s = { ...old(), lookVersion: 2 };
    const r = migrateLook(s);
    expect(r.changed).toBe(false);
    expect(r.settings.lineSpacing).toBe(136);
  });
  it("an explicit `from` beats the settings' own version (engine copy not yet moved)", () => {
    const r = migrateLook({ ...old(), lookVersion: 2 }, 1);
    expect(r.changed).toBe(true);
    expect(r.settings.proseFont).toBe("noto-serif");
  });
  it("new installs already carry the new defaults", () => {
    const d = defaultSettings();
    expect(d.proseFont).toBe("noto-serif");
    expect(d.lineSpacing).toBe(180);
    expect(d.paragraphSpacing).toBe(14);
    expect(d.lookVersion).toBe(2);
    expect(migrateLook(d).changed).toBe(false);
  });
});
