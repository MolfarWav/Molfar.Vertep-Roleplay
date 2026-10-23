import { describe, it, expect } from "bun:test";
import { DICTIONARIES, detectLanguage, relativeTime, resolveLanguage, t, type MsgKey } from "../src/lib/i18n";
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
    expect(resolveLanguage("English")).toBe("en");
    expect(resolveLanguage("Ukrainian")).toBe("uk");
    expect(resolveLanguage("Українська")).toBe("uk");
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

describe("placeholders and relative time", () => {
  it("fills {n} and {name}", () => {
    expect(t("home.deleteN", "en", { n: 3 })).toBe("Delete 3");
    expect(t("home.confirmBodyOne", "en", { name: "Ember" })).toContain("\"Ember\"");
    expect(t("home.selectedN", "uk", { n: 2 })).toBe("Вибрано: 2");
  });

  it("every Ukrainian string keeps the placeholders of the English one", () => {
    for (const key of Object.keys(DICTIONARIES.en) as MsgKey[]) {
      // plain placeholders only: plural forms ({n|one|other}) differ by language on purpose
      const ph = (s: string) => [...new Set(s.match(/\{\w+(?=[|}])/g) ?? [])].sort().join(",");
      expect(ph(DICTIONARIES.uk[key]), key).toBe(ph(DICTIONARIES.en[key]));
    }
  });

  it("picks plural forms by count in each language", () => {
    expect(t("lore.books.entries", "en", { n: 1 })).toBe("1 entry");
    expect(t("lore.books.entries", "en", { n: 2 })).toBe("2 entries");
    expect(t("lore.cb.globals", "en", { n: 1 })).toBe("Plus 1 global book in every chat");
    expect(t("lore.cb.globals", "en", { n: 3 })).toBe("Plus 3 global books in every chat");
    expect(t("lore.vector.note", "en", { n: 1 })).toStartWith("1 entry matches by meaning; its vector is made");
    expect(t("lore.badge.sticky", "uk", { n: 1 })).toBe("Липкий: лишається 1 повідомлення");
    expect(t("lore.badge.sticky", "uk", { n: 3 })).toBe("Липкий: лишається 3 повідомлення");
    expect(t("lore.badge.sticky", "uk", { n: 5 })).toBe("Липкий: лишається 5 повідомлень");
    expect(t("lore.badge.sticky", "uk", { n: 21 })).toBe("Липкий: лишається 21 повідомлення");
    expect(t("soul.notice", "uk", { n: 2, card: "Ember" })).toBe("Душі запропоновано для 2 персонажів картки «Ember»");
    expect(t("soul.notice", "uk", { n: 1, card: "Ember" })).toBe("Душі запропоновано для 1 персонажа картки «Ember»");
    // without vars the text is left as it is
    expect(t("lore.books.entries", "en")).toBe("{n} {n|entry|entries}");
  });

  it("formats relative times in both languages", () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(now - 30_000, "en", now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, "en", now)).toBe("5m ago");
    expect(relativeTime(now - 2 * 3_600_000, "uk", now)).toBe("2 год тому");
    expect(relativeTime(now - 3 * 86_400_000, "uk", now)).toBe("3 дн. тому");
    expect(relativeTime(now - 65 * 86_400_000, "en", now)).toBe("2mo ago");
  });
});

describe("rail groups", () => {
  it("split Home+Chats | Characters, Groups, Marketplace, Personas, Lorebooks, Litopys, Canvas, World | Presets | Shortcuts, Tools | Settings", () => {
    const groups = sectionGroups().map((g) => g.map((s) => s.key));
    expect(groups).toEqual([
      ["home", "chats"],
      ["characters", "groups", "marketplace", "personas", "lorebooks", "litopys", "canvas", "world"],
      ["presets"],
      ["quickreplies", "extensions"],
      ["settings"],
    ]);
    // Settings is the one pinned to the bottom
    expect(sectionGroups().at(-1)![0]!.group).toBe("end");
  });
});
