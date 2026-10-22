/**
 * The card editor's working copy (GitHub #103): which fields really changed, how a save meets a card
 * that changed in the meantime, and the guard that asks before the user leaves with unsaved changes.
 */
import { describe, expect, it } from "bun:test";
import { changedCount, changedPanels, conflictLabels, effectivePatch, mergeDraft, sameValue } from "../src/lib/card-draft";
import { guardLeaving, movesAway, setLeaveGuard } from "../src/lib/leave-guard";
import type { Character } from "../src/lib/types";

const card = (over: Partial<Character> = {}): Character => ({
  id: "c1", name: "Elias", description: "A surgeon.", personality: "dry", scenario: "", firstMessage: "Hello.", altGreetings: ["Hi"], groupGreetings: [],
  exampleDialogue: "", systemPromptOverride: "", postHistoryInstructions: "", tags: ["a"], favorite: false,
  descVariants: [], personalityVariants: [], scenarioVariants: [], versions: [], gallery: [], expressions: [],
  cardExtras: { extensions: { talkativeness: "0.5", molfar_profile: { v: 1, notes: { description: "x" } } } },
  ...over,
}) as unknown as Character;

describe("effectivePatch", () => {
  it("keeps only the fields whose value really differs", () => {
    const base = card();
    const patch = effectivePatch(base, { name: "Elias", description: "A doctor.", altGreetings: ["Hi"], tags: ["a", "b"] });
    expect(Object.keys(patch).sort()).toEqual(["description", "tags"]);
  });

  it("a field put back to what it was is no change", () => {
    const base = card();
    expect(changedCount(base, { description: "changed then back".replace(/.*/, base.description) })).toBe(0);
  });

  it("compares objects by their saved form", () => {
    expect(sameValue({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue("a", "b")).toBe(false);
  });
});

describe("changedPanels", () => {
  it("names the panel that holds each change", () => {
    const base = card();
    expect([...changedPanels(base, { exampleDialogue: "x", css: "p{}" })].sort()).toEqual(["colors", "dialogue"]);
    expect([...changedPanels(base, { description: "x", tags: ["z"] })]).toEqual(["core"]);
  });

  it("a profile edit marks the Profile tab, not the Core and More tabs its compiled text lands in", () => {
    const base = card();
    const extras = { extensions: { talkativeness: "0.5", molfar_profile: { v: 1, notes: { description: "changed" } } } };
    const panels = changedPanels(base, { cardExtras: extras as never, description: "compiled", personality: "compiled too" });
    expect([...panels]).toEqual(["profile"]);
  });
});

describe("mergeDraft", () => {
  it("writes what the stored card left alone", () => {
    const base = card();
    const m = mergeDraft(base, base, { description: "mine", tags: ["x"] });
    expect(m.patch).toEqual({ description: "mine", tags: ["x"] });
    expect(m.conflicting).toEqual({});
  });

  it("a field only the stored card changed is not touched", () => {
    const base = card();
    const stored = card({ personality: "warm" });
    const m = mergeDraft(base, stored, { description: "mine" });
    expect(m.patch).toEqual({ description: "mine" });
  });

  it("a field both sides changed is a conflict, kept apart from the rest", () => {
    const base = card();
    const stored = card({ description: "Molfar's version" });
    const m = mergeDraft(base, stored, { description: "mine", tags: ["x"] });
    expect(m.patch).toEqual({ tags: ["x"] });
    expect(m.conflicting).toEqual({ description: "mine" });
    expect(conflictLabels(m)).toEqual(["Description"]);
  });

  it("a field already stored with the same value is no conflict and nothing to write", () => {
    const base = card();
    const stored = card({ description: "same" });
    const m = mergeDraft(base, stored, { description: "same" });
    expect(m.patch).toEqual({});
    expect(m.conflicting).toEqual({});
  });

  it("card extras merge one key at a time: the Soul tab's write and my profile edit both survive", () => {
    const base = card();
    const stored = card({ cardExtras: { extensions: { talkativeness: "0.5", molfar_profile: { v: 1, notes: { description: "x" } }, molfar_soul: { a: 1 } } } as never });
    const mine = { extensions: { talkativeness: "0.5", molfar_profile: { v: 1, notes: { description: "edited" } } } };
    const m = mergeDraft(base, stored, { cardExtras: mine as never });
    expect(m.conflicting).toEqual({});
    const ext = (m.patch.cardExtras as { extensions: Record<string, unknown> }).extensions;
    expect(ext.molfar_soul).toEqual({ a: 1 });
    expect(ext.molfar_profile).toEqual({ v: 1, notes: { description: "edited" } });
  });

  it("card extras changed on the same key by both sides is a conflict", () => {
    const base = card();
    const stored = card({ cardExtras: { extensions: { talkativeness: "0.9", molfar_profile: { v: 1, notes: { description: "x" } } } } as never });
    const mine = { extensions: { talkativeness: "0.1", molfar_profile: { v: 1, notes: { description: "x" } } } };
    const m = mergeDraft(base, stored, { cardExtras: mine as never });
    expect(Object.keys(m.conflicting)).toEqual(["cardExtras"]);
  });
});

describe("the leave guard", () => {
  const make = () => {
    const log: unknown[] = [];
    const state: Record<string, unknown> = { view: "characters", drawer: null, activeCharacterId: "c1", activeChatId: null, characters: [] };
    const raw = (partial: unknown) => {
      const next = typeof partial === "function" ? (partial as (s: unknown) => object)(state) : partial;
      Object.assign(state, next);
      log.push(next);
    };
    return { state, log, set: guardLeaving(raw, () => state) };
  };

  it("tells a change of place from a change of data", () => {
    const s = { view: "characters", drawer: null, activeCharacterId: "c1", activeChatId: null };
    expect(movesAway(s, { characters: [] })).toBe(false);
    expect(movesAway(s, { view: "characters" })).toBe(false);
    expect(movesAway(s, { view: "chats" })).toBe(true);
    expect(movesAway(s, { activeCharacterId: null })).toBe(true);
    expect(movesAway(s, null)).toBe(false);
  });

  it("lets everything through while nothing is unsaved", () => {
    const { set, state } = make();
    const off = setLeaveGuard({ dirty: () => false, ask: () => { throw new Error("must not ask"); } });
    set({ view: "chats" });
    expect(state.view).toBe("chats");
    off();
  });

  it("holds a move away until the user answers, then replays it", () => {
    const { set, state } = make();
    let go: (() => void) | null = null;
    const off = setLeaveGuard({ dirty: () => true, ask: (fn) => { go = fn; } });
    set({ view: "chats" });
    expect(state.view).toBe("characters");
    expect(go).not.toBeNull();
    go!();
    expect(state.view).toBe("chats");
    off();
  });

  it("does not hold a change that keeps the user on the card (data, same place)", () => {
    const { set, state } = make();
    const off = setLeaveGuard({ dirty: () => true, ask: () => { throw new Error("must not ask"); } });
    set((s: unknown) => ({ characters: [...((s as { characters: unknown[] }).characters), 1] }));
    expect((state.characters as unknown[]).length).toBe(1);
    off();
  });

  it("a stay (no replay) leaves the place as it was", () => {
    const { set, state } = make();
    const off = setLeaveGuard({ dirty: () => true, ask: () => { /* the user stays */ } });
    set({ activeCharacterId: null });
    expect(state.activeCharacterId).toBe("c1");
    off();
  });
});
