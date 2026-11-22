// The World cast card's scene-boundary switch (#496, Direction phase 3a), rendered to static markup: the switch with its hint in
// plain words, on unless the setting says false, disabled with the DM off. The status line "Waiting for a new scene" reads
// GET /world/cast after mount, so it is checked in a real browser; here its words exist in both languages.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { CastCard } = await import("../src/components/world/world-cast");
const { t, DICTIONARIES } = await import("../src/lib/i18n");

const view = (settings: Record<string, unknown> = {}) =>
  ({ settings: { level: "living", cast: "normal", castShow: false, ...settings }, lastRunAt: 5, cast: 0, usage: { runs: 2 }, records: 4 }) as never;
const card = (v = view(), on = true) => renderToStaticMarkup(<CastCard chatId="c1" view={v} save={async () => {}} on={on} />);
const tagOf = (html: string, id: string) => html.match(new RegExp(`<[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? "";

describe("the cast card's 'Wait for a new scene' switch", () => {
  it("is shown with its hint, on by default (the setting is absent or true)", () => {
    for (const html of [card(), card(view({ castBoundary: true }))]) {
      expect(html).toContain("Wait for a new scene");
      expect(html).toContain("Someone who is due to come back waits up to 6 replies for a new place or a time jump, then comes anyway.");
      expect(tagOf(html, "cast-boundary")).toContain('aria-checked="true"');
    }
  });
  it("off when the setting is false; disabled while the DM is off", () => {
    expect(tagOf(card(view({ castBoundary: false })), "cast-boundary")).toContain('aria-checked="false"');
    expect(tagOf(card(view(), false), "cast-boundary")).toMatch(/data-disabled|aria-disabled/);
  });
  it("the wait line exists in both languages and takes the count", () => {
    expect(t("world.cast.boundaryWait", "en", { n: 4 })).toBe("Waiting for a new scene: 4 more replies");
    expect(t("world.cast.boundaryWait", "en", { n: 1 })).toBe("Waiting for a new scene: 1 more reply");
    expect(t("world.cast.boundaryWait", "uk", { n: 2 })).toBe("Чекаємо нової сцени: ще 2 відповіді");
    expect(DICTIONARIES.uk["world.cast.boundary"]).toBe("Чекати нової сцени");
  });
});
