// The fan-service comedy level and the DM's memory of the events the story showed (Molfar.Vertep#506).
import { describe, expect, it } from "bun:test";
import { applyLevel, defaultBlocks, dmInput, emptyState, LEVELS, lifeBlock, lifeTiers, normalizeState, systemFor } from "../plugins/world/plugin.js";

const input = (recent: unknown) => dmInput({ cards: [], userName: "Kai", entities: [], msgs: [{ role: "user", text: "Hi." }], level: "director", fronts: [], event: null, recent } as any);

describe("the fan-service comedy level", () => {
  it("is a level of its own with hard events and its own rules", () => {
    expect(LEVELS).toContain("fanservice");
    expect(LEVELS.indexOf("fanservice")).toBe(LEVELS.indexOf("chaos") - 1);
    const sys = systemFor("fanservice");
    expect(sys).toContain("fan-service comedy");
    expect(sys).toContain("only between adult characters");
    expect(sys).toContain("If the scene offers nothing funny, send no event");
    expect(defaultBlocks("fanservice").event).toContain("must happen");
  });

  it("names no stock situations, so a small model is not anchored on one gag", () => {
    const rules = defaultBlocks("fanservice").level.toLowerCase();
    for (const gag of ["shower", "towel", "steam", "door", "zipper", "wind"]) expect(rules).not.toContain(gag);
  });

  it("waits out a fight, like the storyteller", () => {
    const st = emptyState("c1");
    applyLevel(st, { event: { text: "A bucket of water tips over." } }, { level: "fanservice", direction: "combat", now: 1 });
    expect(st.event).toBeNull();
    applyLevel(st, { event: { text: "A bucket of water tips over." } }, { level: "fanservice", direction: "social", now: 2 });
    expect(st.event).toMatchObject({ text: "A bucket of water tips over.", hard: true });
  });

  it("has a life block of its own", () => {
    expect(lifeTiers(lifeBlock("fanservice")).notable).toContain("awkward turn");
  });
});

describe("every level: the event says what happens, the reply decides how it is taken", () => {
  it("the shared block leaves reactions to the reply on all levels with events", () => {
    for (const l of ["living", "director", "antagonist", "anime", "fanservice", "chaos"]) {
      expect(systemFor(l)).toContain("never how the characters feel, answer or take it");
    }
  });

  it("the anime and chaos rules carry no stock examples any more", () => {
    expect(systemFor("anime")).not.toContain("a cat that watches too long");
    expect(systemFor("anime")).toContain("Never jump from nothing to the reveal");
    expect(systemFor("chaos")).not.toContain("killer rabbits");
  });
});

describe("the DM remembers the events the story showed", () => {
  it("a delivered event goes into recent, at most five, the oldest dropped", () => {
    const st = emptyState("c1");
    for (let i = 1; i <= 7; i++) {
      st.event = { text: "Event " + i, hard: true, sent: 1, retried: false };
      applyLevel(st, { delivered: true }, { level: "director", now: i });
    }
    expect(st.recent.map((e: any) => e.text)).toEqual(["Event 3", "Event 4", "Event 5", "Event 6", "Event 7"]);
  });

  it("a missed event is not remembered", () => {
    const st = emptyState("c1");
    st.event = { text: "Missed", hard: true, sent: 1, retried: true };
    applyLevel(st, { delivered: false }, { level: "director", now: 1 });
    expect(st.recent).toBeUndefined();
  });

  it("the DM reads them and is told to send another kind of thing", () => {
    const text = input([{ text: "The lights go out.", at: 1 }]);
    expect(text).toContain("Events the story already showed");
    expect(text).toContain("- The lights go out.");
    expect(input([])).not.toContain("Events the story already showed");
  });

  it("survives a save and load, cleaned", () => {
    const raw = { ...emptyState("c1"), recent: [{ text: "Kept", at: 5 }, { text: "" }, "junk", { text: "x".repeat(500) }] };
    const st = normalizeState(raw, "c1");
    expect(st.recent.length).toBe(2);
    expect(st.recent[0]).toEqual({ text: "Kept", at: 5 });
    expect(st.recent[1].text.length).toBeLessThanOrEqual(200);
  });
});
