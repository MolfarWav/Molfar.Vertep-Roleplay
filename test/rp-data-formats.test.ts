/**
 * docs/DATA-FORMATS.md is what agents (Molfar) and people read before they
 * touch data/ files. Every field the app WRITES must be named there: a card,
 * lorebook or preset field added in code without the docs fails here, so the
 * reference (and the skills that point to it) cannot fall behind silently.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { buildDefaultPreset } from "../src/lib/seed";
import type { Character, LoreEntry, Lorebook } from "../src/lib/types";

// engine.ts reads the frame URL at import time; give it one outside a browser
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { characterToCard, groupToCharacter, lorebookToEngine, presetToEngine } = await import("../src/lib/engine");

const doc = fs.readFileSync(path.join(import.meta.dir, "..", "docs", "DATA-FORMATS.md"), "utf8");
/** Inline code spans of the doc: a field counts as named when one holds it as a word. */
const spans = [...doc.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
const named = (key: string) => spans.some((s) => new RegExp(`(^|[^A-Za-z0-9_])${key.replace(/[$]/g, "\\$")}([^A-Za-z0-9_]|$)`).test(s));
const missing = (keys: Iterable<string>) => [...new Set(keys)].filter((k) => !named(k)).sort();

describe("docs/DATA-FORMATS.md names every field the app writes", () => {
  it("cards and their studio bag", () => {
    const c: Character = {
      ...groupToCharacter({ id: "x", name: "X", memberIds: [] } as never, []),
      isGroup: false,
      systemPromptOverride: "s",
      postHistoryInstructions: "p",
      altGreetings: ["a"],
      groupGreetings: ["g"],
      creatorNotes: "n",
      tags: ["t"],
      avatar: "data:image/png;base64,AA",
      creator: "c",
      version: "1",
    };
    const card = characterToCard(c) as Record<string, unknown>;
    expect(missing(Object.keys(card))).toEqual([]);
    expect(missing(Object.keys(card.studio as object))).toEqual([]);
  });

  it("lorebooks and their entries", () => {
    const entry: LoreEntry = {
      id: "e1", title: "t", memo: "", keys: ["k"], keysRegex: false, secondaryKeys: [], logic: "AND_ANY", status: "normal",
      content: "c", position: "at_depth", depth: 4, role: "system", order: 100, probability: 50, useProbability: true,
      group: "g", groupWeight: 100, groupPrioritize: false, sticky: 0, cooldown: 0, delay: 0, enabled: true,
      characterFilter: [], characterFilterExclude: false, tagFilter: [], triggerFilters: [], nonRecursable: false,
      preventFurtherRecursion: false, delayUntilRecursion: false, ignoreBudget: false, scanDepthOverride: null,
      caseSensitiveOverride: null, wholeWordsOverride: null, groupScoringOverride: null, automationId: "",
      matchSources: { description: false, personality: false, scenario: false, persona: false },
    };
    const book = { id: "b", name: "B", folderId: null, globalActive: false, linkedCharacterIds: [], entries: [entry], settings: {}, vectorized: {}, isEmbedded: false, formatTemplate: "" } as unknown as Lorebook;
    const out = lorebookToEngine(book) as unknown as Record<string, unknown> & { entries: Record<string, unknown>[] };
    expect(missing(Object.keys(out))).toEqual([]);
    expect(missing(Object.keys(out.entries[0]!))).toEqual([]);
  });

  it("presets and their sections", () => {
    const p = buildDefaultPreset();
    // every sampler on, so each conditional field is written
    for (const v of Object.values(p.samplers)) if (v && typeof v === "object" && "enabled" in v) (v as { enabled: boolean }).enabled = true;
    Object.assign(p.samplers, { maxTokens: 300, contextSize: 8000, seed: 7, stopStrings: ["\n"] });
    p.samplers.reasoning = { ...p.samplers.reasoning, enabled: true, effort: "high", autoParse: true, budget: 100 };
    p.sections[0] = { ...p.sections[0]!, position: "in-chat", depth: 2 };
    const out = presetToEngine(p) as unknown as Record<string, unknown> & { prompts: Record<string, unknown>[]; prompt_order: Record<string, unknown>[] };
    expect(missing(Object.keys(out))).toEqual([]);
    expect(missing(out.prompts.flatMap((s) => Object.keys(s)))).toEqual([]);
    expect(missing(Object.keys(out.prompt_order[0]!))).toEqual([]);
  });
});
