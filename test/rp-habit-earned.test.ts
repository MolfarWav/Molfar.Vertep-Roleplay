import { describe, expect, it } from "bun:test";
import { freshEarned, readHabitsSeen, habitCounts, takeEarned, writeHabitsSeen, type SeenStore } from "../src/lib/habit-earned";
import type { LitHabit } from "../src/components/library/litopys-api";

const mem = (): SeenStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => { data[k] = v; } };
};
const habit = (id: string, over: Partial<LitHabit> = {}): LitHabit => ({
  id, who: "Aria", name: "Hums when afraid", rule: "She hums.", when: "", status: "active", on: true, seen: 2, chapters: ["c1", "c2"], evidence: [], origin: "chapter", earnedAt: 1000, ...over,
});

describe("the earned-habit event", () => {
  it("seeds a chat never seen before with now and says nothing", () => {
    const store = mem();
    expect(takeEarned("c1", [habit("k1", { earnedAt: 500 })], { now: 2000, store })).toBeNull();
    expect(readHabitsSeen("c1", store)).toBe(2000);
    // an old habit never comes up afterwards
    expect(takeEarned("c1", [habit("k1", { earnedAt: 500 })], { now: 3000, store })).toBeNull();
  });

  it("announces the newest habit earned after the remembered time, once", () => {
    const store = mem();
    writeHabitsSeen("c1", 1000, store);
    const list = [habit("k1", { earnedAt: 900 }), habit("k2", { earnedAt: 1500, name: "B" }), habit("k3", { earnedAt: 2500, name: "C" })];
    const hit = takeEarned("c1", list, { store });
    expect(hit?.habit.id).toBe("k3");
    expect(hit?.more).toBe(1);
    expect(readHabitsSeen("c1", store)).toBe(2500);
    expect(takeEarned("c1", list, { store })).toBeNull();
  });

  it("ignores candidates, and remembers per chat", () => {
    const store = mem();
    writeHabitsSeen("c1", 1000, store);
    expect(takeEarned("c1", [habit("k1", { status: "proposed", earnedAt: undefined })], { store })).toBeNull();
    expect(readHabitsSeen("c2", store)).toBeNull();
  });

  it("quiet moves the time forward without announcing (the user just did it)", () => {
    const store = mem();
    writeHabitsSeen("c1", 1000, store);
    expect(takeEarned("c1", [habit("k1", { earnedAt: 4000 })], { store, quiet: true })).toBeNull();
    expect(takeEarned("c1", [habit("k1", { earnedAt: 4000 })], { store })).toBeNull();
  });

  it("survives a store that is missing or throws", () => {
    expect(takeEarned("c1", [habit("k1")], { store: null, now: 5 })).toBeNull();
    const bad: SeenStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(takeEarned("c1", [habit("k1")], { store: bad, now: 5 })).toBeNull();
  });

  it("lists fresh habits newest first and counts earned and candidates", () => {
    const list = [habit("k1", { earnedAt: 10 }), habit("k2", { earnedAt: 30 }), habit("k3", { status: "proposed" })];
    expect(freshEarned(list, 5).map((k) => k.id)).toEqual(["k2", "k1"]);
    expect(habitCounts(list)).toEqual({ earned: 2, candidates: 1 });
    expect(habitCounts(undefined)).toEqual({ earned: 0, candidates: 0 });
  });
});
