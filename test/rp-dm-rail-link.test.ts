// The DM item on the rail (#183): a link to the World section's DM tab, like Agents is to a Canvas board. It sits right
// after World, is current only while the DM tab is open, and the World item is not current then.
import { describe, expect, it } from "bun:test";

(globalThis as unknown as { window: unknown }).window ??= { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true } };
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent ??= class { constructor(public type: string, public init?: unknown) {} };
const { SECTIONS, RAIL_SECTIONS, PHONE_MORE_TILES, itemActive, itemId, isLinkItem, sectionsFor, sectionItemOf } = await import("../src/components/shell/sections");
const { parseWorldTop, readWorldTop, writeWorldTop } = await import("../src/lib/world-nav");
const { RAIL_HUES } = await import("../src/components/shell/rail-hues");

const dm = SECTIONS.find((s) => s.worldTop === "dm")!;
const world = SECTIONS.find((s) => s.key === "world" && !s.worldTop)!;

describe("DM rail link", () => {
  it("is a World link with its own id, label, icon and hue, right after World", () => {
    expect(dm).toBeTruthy();
    expect(dm.key).toBe("world");
    expect(itemId(dm)).toBe("dm");
    expect(dm.labelKey).toBe("nav.dm");
    expect(dm.tier).toBe("backstage");
    expect(RAIL_HUES[dm.hue]).toContain("text-");
    const ids = RAIL_SECTIONS.map(itemId);
    expect(ids.indexOf("dm")).toBe(ids.indexOf("world") + 1);
    // every rail item keeps a hue of its own
    expect(new Set(RAIL_SECTIONS.map((s) => s.hue)).size).toBe(RAIL_SECTIONS.length);
  });

  it("is a tile in the phone's All sections sheet, but never a section in menus that list sections", () => {
    expect(PHONE_MORE_TILES.map(itemId)).toContain("dm");
    expect(isLinkItem(dm)).toBe(true);
    expect(sectionsFor(["world"])).toEqual([world]);
    // the World page keeps its own title while the DM tab is open
    expect(sectionItemOf("world")).toBe(world);
  });

  it("is current only while World is open on the DM tab, and World only while it is not", () => {
    expect(itemActive(dm, true, "links", "dm")).toBe(true);
    expect(itemActive(world, true, "links", "dm")).toBe(false);
    expect(itemActive(dm, true, "links", "chats")).toBe(false);
    expect(itemActive(world, true, "links", "worlds")).toBe(true);
    expect(itemActive(dm, false, "links", "dm")).toBe(false);
  });

  it("the World tab is read safely and shared", () => {
    expect(parseWorldTop("dm")).toBe("dm");
    expect(parseWorldTop("nonsense")).toBe("chats");
    expect(parseWorldTop(null)).toBe("chats");
    writeWorldTop("worlds");
    expect(readWorldTop()).toBe("worlds");
    writeWorldTop("chats");
    expect(readWorldTop()).toBe("chats");
  });
});
