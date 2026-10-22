import { describe, expect, it } from "bun:test";
import { ALL_PANELS, EDITOR_TABS, TAB_PANELS, panelGroup, panelStep, tabOfPanel } from "../src/lib/editor-tabs";

describe("the card editor's tabs", () => {
  it("holds every panel of the old eleven-tab row plus Memory, once each", () => {
    expect(EDITOR_TABS.flatMap((tab) => [...TAB_PANELS[tab]]).sort()).toEqual([
      "advanced", "colors", "core", "dialogue", "gallery", "lorebook",
      "memory", "profile", "regex", "soul", "sprites", "voice",
    ]);
  });

  it("maps every old tab to the tab that holds it now", () => {
    const held: Record<string, string> = {
      core: "core", dialogue: "core",
      profile: "profile", soul: "soul", memory: "memory", lorebook: "lorebook",
      advanced: "more", colors: "more", sprites: "more", gallery: "more", regex: "more", voice: "more",
    };
    for (const [panel, tab] of Object.entries(held)) expect(tabOfPanel(panel), panel).toBe(tab);
  });

  it("opens a tab name itself, and Core for anything unknown", () => {
    expect(tabOfPanel("more")).toBe("more");
    expect(tabOfPanel(null)).toBe("core");
    expect(tabOfPanel("nope")).toBe("core");
  });

  it("paints all twelve panels on desktop, each with its group's color", () => {
    expect([...ALL_PANELS].sort()).toEqual([
      "advanced", "colors", "core", "dialogue", "gallery", "lorebook",
      "memory", "profile", "regex", "soul", "sprites", "voice",
    ]);
    expect(panelGroup("dialogue")).toBe("core");
    expect(panelGroup("voice")).toBe("more");
    expect(panelGroup("soul")).toBe("soul");
    expect(panelGroup("memory")).toBe("memory");
  });

  it("steps through a tab's panels with the arrow keys", () => {
    expect(panelStep(TAB_PANELS.more, "advanced", "ArrowRight")).toBe("colors");
    expect(panelStep(TAB_PANELS.more, "voice", "ArrowRight")).toBe("advanced");
    expect(panelStep(TAB_PANELS.core, "dialogue", "ArrowLeft")).toBe("core");
    expect(panelStep(TAB_PANELS.more, "advanced", "End")).toBe("voice");
    expect(panelStep(TAB_PANELS.more, "advanced", "a")).toBeUndefined();
  });
});
