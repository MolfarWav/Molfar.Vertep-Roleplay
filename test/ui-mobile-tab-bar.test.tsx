// The phone menus keep the rail's hues: every tab and every "All sections" tile gets its section's colour, and the
// Agents board link (missing before) is among the tiles. Rendered to static markup; no DOM library is installed here.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { PHONE_MORE_TILES, PHONE_TABS, itemId } = await import("../src/components/shell/sections");
const { RAIL_HUES } = await import("../src/components/shell/rail-hues");
const { MobileTabBar } = await import("../src/components/shell/mobile-tab-bar");

describe("phone menus", () => {
  it("the bottom bar has Home, Chats and Characters, each with a hue", () => {
    expect(PHONE_TABS.map((s) => s.key)).toEqual(["home", "chats", "characters"]);
    for (const s of PHONE_TABS) expect(RAIL_HUES[s.hue]).toBeTruthy();
  });

  it("every More tile has a hue class, and no section is lost", () => {
    for (const s of PHONE_MORE_TILES) expect(RAIL_HUES[s.hue]).toContain("text-");
    const ids = PHONE_MORE_TILES.map(itemId);
    for (const key of ["groups", "marketplace", "personas", "lorebooks", "litopys", "canvas", "world", "presets", "quickreplies", "extensions", "settings"]) {
      expect(ids).toContain(key);
    }
  });

  it("Agents (a Canvas board link) is a tile of its own, next to Canvas", () => {
    const agents = PHONE_MORE_TILES.find((s) => s.board === "agents");
    expect(agents).toBeTruthy();
    expect(agents!.key).toBe("canvas");
    expect(itemId(agents!)).toBe("agents");
    expect(PHONE_MORE_TILES.filter((s) => s.key === "canvas")).toHaveLength(2);
  });

  it("the rendered bar tints each tab icon with its hue", () => {
    const html = renderToStaticMarkup(<MobileTabBar />);
    for (const s of PHONE_TABS) expect(html).toContain(RAIL_HUES[s.hue].split(" ")[0]!);
  });
});
