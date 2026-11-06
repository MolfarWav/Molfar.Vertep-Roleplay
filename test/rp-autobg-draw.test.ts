/**
 * Drawing the places a scene moves to (World > Backgrounds, "Draw places that have no picture"): the sensor names a place
 * with no picture only when the chat's picture switch is on (plugins/relations readBackdrop / backdropText); the app draws
 * it only past every gate (autoDrawBlock, a failed place waits), from the World's own record of the place when there is one.
 */
import { describe, expect, it } from "bun:test";
import { backdropChoices, backdropDrawOn, backdropText, readBackdrop } from "../plugins/relations/plugin.js";

(globalThis as any).location ??= { pathname: "/app/nimrod/roleplay/", host: "127.0.0.1:8788", protocol: "http:", href: "http://127.0.0.1:8788/" };
const { autoDrawBlock, drawFailedRecently, noteDrawFailed, placeRecordFor, placeSubject, withPlaceStyle, DRAW_RETRY_MS } = await import("../src/lib/world-backgrounds");

const choices = [
  { name: "tavern_night", tags: ["inn", "night"] },
  { name: "forest_path", tags: [] },
];

describe("readBackdrop", () => {
  it("a folder image matches by name, any case, and keeps the folder's exact name", () => {
    expect(readBackdrop("Tavern_Night", choices)).toBe("tavern_night");
    expect(readBackdrop("FOREST_PATH", choices, true)).toBe("forest_path");
  });

  it("without the switch a name outside the folder changes nothing (as before)", () => {
    expect(readBackdrop("misty glade", choices)).toBeNull();
    expect(readBackdrop("", choices)).toBeNull();
    expect(readBackdrop(undefined, choices)).toBeNull();
    expect(readBackdrop(12, choices, true)).toBeNull();
    expect(readBackdrop({ place: "x" }, choices, true)).toBeNull();
  });

  it("with the switch a place with no picture passes through for the app to draw, tidied and capped", () => {
    expect(readBackdrop("misty glade", choices, true)).toBe("misty glade");
    expect(readBackdrop("  Misty \n glade ", choices, true)).toBe("Misty glade");
    expect(readBackdrop("x".repeat(90), choices, true)).toHaveLength(60);
    expect(readBackdrop("tavern_night", choices, true)).toBe("tavern_night");
  });
});

describe("backdropDrawOn and backdropText", () => {
  it("drawing needs the chat's switch, a folder and the picture switch", () => {
    expect(backdropDrawOn({ autoBackground: { on: true, folderId: "f", draw: true } })).toBe(true);
    expect(backdropDrawOn({ autoBackground: { on: true, folderId: "f" } })).toBe(false);
    expect(backdropDrawOn({ autoBackground: { on: false, folderId: "f", draw: true } })).toBe(false);
    expect(backdropDrawOn({ autoBackground: { on: true, folderId: "", draw: true } })).toBe(false);
    expect(backdropDrawOn(null)).toBe(false);
  });

  it("silent while the folder has nothing to pick and drawing is off; the old instruction is unchanged with drawing off", () => {
    expect(backdropText({ backdrops: [], backdropDraw: false })).toBe("");
    const off = backdropText({ backdrops: choices, backdropDraw: false });
    expect(off).toContain("null when none fits");
    expect(off).not.toContain("short name instead");
    expect(off).toContain("- tavern_night: inn, night");
  });

  it("with drawing on, an empty folder is asked for the place itself, and a folder with images may be passed by", () => {
    const empty = backdropText({ backdrops: [], backdropDraw: true });
    expect(empty).toContain("a picture is drawn for it");
    expect(empty).not.toContain("\n- ");
    const some = backdropText({ backdrops: choices, backdropDraw: true, base: { snap: { background: "tavern_night" } } });
    expect(some).toContain("short name instead");
    expect(some).toContain("Now shown: tavern_night");
    expect(some).toContain("- forest_path");
  });

  it("the choices still come only from the chat's folder", () => {
    const fs = { read: () => JSON.stringify({ backgrounds: [{ folderId: "f", name: "Mill", tags: ["day"] }, { folderId: "other", name: "Keep" }] }) };
    expect(backdropChoices(fs as any, { autoBackground: { on: true, folderId: "f", draw: true } })).toEqual([{ name: "Mill", tags: ["day"] }]);
  });
});

describe("autoDrawBlock", () => {
  const auto = { on: true, folderId: "fold_w", draw: true };
  const running = new Set<string>();
  const lastAt = new Map<string, number>();
  const now = 1_000_000;

  it("the switch and its folder first, then the picture switch, then image generation", () => {
    expect(autoDrawBlock("c1", null, true, now, running, lastAt)).toBe("no-place");
    expect(autoDrawBlock("c1", { on: true, folderId: "", draw: true }, true, now, running, lastAt)).toBe("no-place");
    expect(autoDrawBlock("c1", { ...auto, draw: false }, true, now, running, lastAt)).toBe("checkbox");
    expect(autoDrawBlock("c1", auto, false, now, running, lastAt)).toBe("image-gen");
    expect(autoDrawBlock("c1", auto, true, now, running, lastAt)).toBeNull();
  });

  it("one drawing at a time for a chat, and a minute between attempts", () => {
    expect(autoDrawBlock("c1", auto, true, now, new Set(["c1"]), lastAt)).toBe("busy");
    expect(autoDrawBlock("c2", auto, true, now, new Set(["c1"]), lastAt)).toBeNull();
    const last = new Map([["c1", now - 30_000]]);
    expect(autoDrawBlock("c1", auto, true, now, running, last)).toBe("cooldown");
    expect(autoDrawBlock("c1", auto, true, now + 31_000, running, last)).toBeNull();
  });
});

describe("a place that failed, and the World's record of a place", () => {
  it("a failed place waits, per chat, then may be tried again", () => {
    expect(drawFailedRecently("c9", "Old Mill", 5_000_000)).toBe(false);
    noteDrawFailed("c9", "Old Mill", 5_000_000);
    expect(drawFailedRecently("c9", "old mill", 5_000_000 + 1000)).toBe(true);
    expect(drawFailedRecently("other", "Old Mill", 5_000_000 + 1000)).toBe(false);
    expect(drawFailedRecently("c9", "Old Mill", 5_000_000 + DRAW_RETRY_MS + 1)).toBe(false);
  });

  const places = [
    { name: "The Old Mill", text: "A stone mill by the river, the wheel broken.", aliases: ["mill"] },
    { name: "Keep", text: "A square tower." },
  ];
  it("the sensor's short name finds the record by name, alias or containment; no record is not an error", () => {
    expect(placeRecordFor("old mill at dusk", places)?.name).toBe("The Old Mill");
    expect(placeRecordFor("the old mill", places)?.name).toBe("The Old Mill");
    expect(placeRecordFor("river bank", places)).toBeUndefined();
    expect(placeRecordFor("", places)).toBeUndefined();
    expect(placeRecordFor("it", places)).toBeUndefined();
  });

  it("the subject is the name plus the record's text, in one line of at most 500 characters", () => {
    expect(placeSubject("old mill at dusk")).toBe("old mill at dusk");
    expect(placeSubject("old mill", places[0])).toBe("old mill. A stone mill by the river, the wheel broken.");
    expect(placeSubject("x", { text: "y\n\n z".repeat(400) }).length).toBe(500);
  });
});

describe("withPlaceStyle", () => {
  it("adds the chat's look to the end of the prompt, tidied", () => {
    expect(withPlaceStyle("A stone chamber with a bed.", "  medieval fantasy,\n candlelight ")).toBe("A stone chamber with a bed, medieval fantasy, candlelight");
    expect(withPlaceStyle("a stone chamber, ", "oil painting,")).toBe("a stone chamber, oil painting");
  });
  it("no look, no change", () => {
    expect(withPlaceStyle("a stone chamber", undefined)).toBe("a stone chamber");
    expect(withPlaceStyle("a stone chamber", "   ")).toBe("a stone chamber");
  });
});
