import { describe, expect, it } from "bun:test";
import { freshEarned, readSkillsSeen, skillCounts, takeEarned, writeSkillsSeen, type SeenStore } from "../src/lib/skill-earned";
import type { LitSkill } from "../src/components/library/litopys-api";

const mem = (): SeenStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => { data[k] = v; } };
};
const skill = (id: string, over: Partial<LitSkill> = {}): LitSkill => ({
  id, who: "Aria", name: "Hums when afraid", rule: "She hums.", when: "", status: "active", on: true, seen: 2, chapters: ["c1", "c2"], evidence: [], origin: "chapter", earnedAt: 1000, ...over,
});

describe("the earned-skill event", () => {
  it("seeds a chat never seen before with now and says nothing", () => {
    const store = mem();
    expect(takeEarned("c1", [skill("k1", { earnedAt: 500 })], { now: 2000, store })).toBeNull();
    expect(readSkillsSeen("c1", store)).toBe(2000);
    // an old skill never comes up afterwards
    expect(takeEarned("c1", [skill("k1", { earnedAt: 500 })], { now: 3000, store })).toBeNull();
  });

  it("announces the newest skill earned after the remembered time, once", () => {
    const store = mem();
    writeSkillsSeen("c1", 1000, store);
    const list = [skill("k1", { earnedAt: 900 }), skill("k2", { earnedAt: 1500, name: "B" }), skill("k3", { earnedAt: 2500, name: "C" })];
    const hit = takeEarned("c1", list, { store });
    expect(hit?.skill.id).toBe("k3");
    expect(hit?.more).toBe(1);
    expect(readSkillsSeen("c1", store)).toBe(2500);
    expect(takeEarned("c1", list, { store })).toBeNull();
  });

  it("ignores candidates, and remembers per chat", () => {
    const store = mem();
    writeSkillsSeen("c1", 1000, store);
    expect(takeEarned("c1", [skill("k1", { status: "proposed", earnedAt: undefined })], { store })).toBeNull();
    expect(readSkillsSeen("c2", store)).toBeNull();
  });

  it("quiet moves the time forward without announcing (the user just did it)", () => {
    const store = mem();
    writeSkillsSeen("c1", 1000, store);
    expect(takeEarned("c1", [skill("k1", { earnedAt: 4000 })], { store, quiet: true })).toBeNull();
    expect(takeEarned("c1", [skill("k1", { earnedAt: 4000 })], { store })).toBeNull();
  });

  it("survives a store that is missing or throws", () => {
    expect(takeEarned("c1", [skill("k1")], { store: null, now: 5 })).toBeNull();
    const bad: SeenStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(takeEarned("c1", [skill("k1")], { store: bad, now: 5 })).toBeNull();
  });

  it("lists fresh skills newest first and counts earned and candidates", () => {
    const list = [skill("k1", { earnedAt: 10 }), skill("k2", { earnedAt: 30 }), skill("k3", { status: "proposed" })];
    expect(freshEarned(list, 5).map((k) => k.id)).toEqual(["k2", "k1"]);
    expect(skillCounts(list)).toEqual({ earned: 2, candidates: 1 });
    expect(skillCounts(undefined)).toEqual({ earned: 0, candidates: 0 });
  });
});
