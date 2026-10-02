import { describe, it, expect } from "bun:test";
import { DICTIONARIES, detectLanguage, resolveLanguage, t, type MsgKey } from "../src/lib/i18n";
import { SECTIONS, sectionGroups } from "../src/components/shell/sections";

describe("i18n", () => {
  it("every English key has a Ukrainian string", () => {
    for (const key of Object.keys(DICTIONARIES.en) as MsgKey[]) {
      expect(DICTIONARIES.uk[key], key).toBeTruthy();
    }
  });

  it("the browser language picks uk for Ukrainian locales and en otherwise", () => {
    expect(detectLanguage("uk")).toBe("uk");
    expect(detectLanguage("uk-UA")).toBe("uk");
    expect(detectLanguage("en-US")).toBe("en");
    expect(detectLanguage("de")).toBe("en");
    expect(detectLanguage(undefined)).toBe("en");
  });

  it("a stored setting wins; an unknown one (older builds wrote 'English') follows the browser", () => {
    expect(resolveLanguage("uk")).toBe("uk");
    expect(resolveLanguage("en")).toBe("en");
    expect(["en", "uk"]).toContain(resolveLanguage("English"));
    expect(["en", "uk"]).toContain(resolveLanguage(undefined));
  });

  it("t reads the requested language", () => {
    expect(t("nav.characters", "en")).toBe("Characters");
    expect(t("nav.characters", "uk")).toBe("Персонажі");
    expect(t("nav.quickreplies", "uk")).toBe("Швидкі відповіді");
  });

  it("every rail section has a nav label in both languages", () => {
    for (const s of SECTIONS) {
      expect(DICTIONARIES.en[s.labelKey]).toBe(s.label);
      expect(DICTIONARIES.uk[s.labelKey]).toBeTruthy();
    }
  });
});

describe("rail groups", () => {
  it("split Home+Chats | Characters, Marketplace, Personas, Lorebooks | Presets, Connections | Shortcuts, Tools | Settings", () => {
    const groups = sectionGroups().map((g) => g.map((s) => s.key));
    expect(groups).toEqual([
      ["home", "chats"],
      ["characters", "marketplace", "personas", "lorebooks"],
      ["presets", "connections"],
      ["quickreplies", "extensions"],
      ["settings"],
    ]);
    // Settings is the one pinned to the bottom
    expect(sectionGroups().at(-1)![0]!.group).toBe("end");
  });
});
