/**
 * Translating a card from the Store — the pure parts: which texts are sent,
 * how answers become a character patch (originals kept in the card's
 * extensions) and a lorebook (translated keys added next to the originals),
 * the request limit and the stop-after-failures pass.
 */
import { describe, it, expect } from "bun:test";
import {
  runLimited, planPreview, buildPreview, planCardJobs, applyCardResults, planBookJobs, applyBookResults,
  splitKeys, mergeKeys, translateInstalled, TRANSLATE_LANGUAGES,
} from "../src/lib/card-translate";
import type { Character, LoreEntry, Lorebook } from "../src/lib/types";

const META = { target: "English", provider: "llm", at: "2026-10-10T00:00:00.000Z" };

const char = (over: Partial<Character> = {}): Character => ({
  id: "c1", name: "Mira", description: "Опис", personality: "", scenario: "Сцена", firstMessage: "Привіт!",
  altGreetings: ["Добрий день", "", "Вітаю"], exampleDialogue: "", creatorNotes: "Нотатки", systemPromptOverride: "",
  postHistoryInstructions: "", embeddedLorebookId: null, ...over,
} as Character);

const entry = (over: Partial<LoreEntry> = {}): LoreEntry => ({
  id: "e1", title: "Місто", memo: "Місто", keys: ["місто", "Київ"], keysRegex: false, secondaryKeys: [], content: "Велике місто", ...over,
} as LoreEntry);
const book = (entries: LoreEntry[]): Lorebook => ({ id: "b1", name: "Lore", entries } as Lorebook);

describe("runLimited", () => {
  it("never runs more than the limit at once", async () => {
    let now = 0, peak = 0;
    await runLimited([1, 2, 3, 4, 5, 6], 2, async () => {
      now++; peak = Math.max(peak, now);
      await new Promise((r) => setTimeout(r, 5));
      now--;
    });
    expect(peak).toBe(2);
  });
  it("stops starting new items once told to", async () => {
    const seen: number[] = [];
    await runLimited([1, 2, 3, 4, 5], 1, async (n) => { seen.push(n); }, () => seen.length >= 2);
    expect(seen).toEqual([1, 2]);
  });
});

describe("preview", () => {
  const detail = { greeting: "Hi", alternateGreetings: ["Yo", " "], personality: "", scenario: "S", exampleDialogs: "", creatorNotes: "N", systemPrompt: "", postHistoryInstructions: "" };
  it("plans only non-empty texts, with stable ids", () => {
    const plan = planPreview({ tagline: "T", description: "T\nmore", detail });
    expect(plan.map((p) => p.id)).toEqual(["tagline", "description", "greeting", "scenario", "creatorNotes", "alt.0"]);
  });
  it("sends a description equal to the tagline once", () => {
    const plan = planPreview({ tagline: "Same", description: "Same", detail: null });
    expect(plan.map((p) => p.id)).toEqual(["tagline"]);
    const out = buildPreview({ tagline: "Same", description: "Same", detail: null }, { tagline: "Те саме" });
    expect(out.description).toBe("Те саме");
  });
  it("keeps what has no answer", () => {
    const out = buildPreview({ tagline: "T", description: "D", detail }, { greeting: "Привіт", "alt.0": "Йо" });
    expect(out.detail!.greeting).toBe("Привіт");
    expect(out.detail!.alternateGreetings).toEqual(["Йо", " "]);
    expect(out.detail!.scenario).toBe("S");
    expect(out.tagline).toBe("T");
  });
});

describe("character", () => {
  it("plans the fields with text and the non-empty greetings", () => {
    const jobs = planCardJobs(char());
    expect(jobs.map((j) => (j.kind === "field" ? j.field : `g${j.index}`))).toEqual(["description", "scenario", "firstMessage", "creatorNotes", "g0", "g2"]);
  });
  it("patches the changed fields and keeps the originals in extensions", () => {
    const c = char({ cardExtras: { extensions: { chub: { id: 1 } }, nickname: "x" } });
    const jobs = planCardJobs(c);
    const answers = ["Desc", null, "Hello!", "Notes", "Good day", "Greetings"];
    const { patch, changed } = applyCardResults(c, jobs, answers, META);
    expect(patch.description).toBe("Desc");
    expect(patch.scenario).toBeUndefined();
    expect(patch.firstMessage).toBe("Hello!");
    expect(patch.altGreetings).toEqual(["Good day", "", "Greetings"]);
    expect(changed).toContain("firstMessage");
    expect(changed).not.toContain("scenario");
    const ext = (patch.cardExtras as { extensions: Record<string, any> }).extensions;
    expect(ext.chub).toEqual({ id: 1 });
    expect(ext.molfar_translation.target).toBe("English");
    expect(ext.molfar_translation.original).toEqual({
      description: "Опис", firstMessage: "Привіт!", creatorNotes: "Нотатки", altGreetings: ["Добрий день", "", "Вітаю"],
    });
    expect((patch.cardExtras as Record<string, unknown>).nickname).toBe("x");
  });
  it("changes nothing when no answer differs", () => {
    const c = char();
    const jobs = planCardJobs(c);
    const { patch, changed } = applyCardResults(c, jobs, jobs.map((j) => j.text), META);
    expect(changed).toEqual([]);
    expect(patch).toEqual({});
  });
  it("keeps the first originals when translated again", () => {
    const c = char({ description: "Translated once", cardExtras: { extensions: { molfar_translation: { target: "French", provider: "llm", at: "x", original: { description: "Опис" } } } } });
    const jobs = planCardJobs(c).filter((j) => j.kind === "field" && j.field === "description");
    const { patch } = applyCardResults(c, jobs, ["Again"], META);
    const orig = (patch.cardExtras as any).extensions.molfar_translation.original;
    expect(orig.description).toBe("Опис");
  });
});

describe("lorebook", () => {
  it("splits and merges keys without dropping the originals", () => {
    expect(splitKeys('city, "Kyiv"，capital、town;\n')).toEqual(["city", "Kyiv", "capital", "town"]);
    expect(mergeKeys(["місто", "Київ"], ["City", "kyiv", "Місто", "київ", "capital"])).toEqual(["місто", "Київ", "City", "kyiv", "capital"]);
  });
  it("plans content, comment and both key lists; regex keys are left alone", () => {
    const b = book([entry({ secondaryKeys: ["ніч"] }), entry({ id: "e2", keysRegex: true, keys: ["^foo"], memo: "", content: "x" })]);
    expect(planBookJobs(b).map((j) => `${j.entry}:${j.part}`)).toEqual(["0:content", "0:memo", "0:keys", "0:secondaryKeys", "1:content"]);
  });
  it("replaces content and comment (and the title that copied it), adds keys", () => {
    const b = book([entry({ secondaryKeys: ["ніч"] })]);
    const jobs = planBookJobs(b);
    const { entries, changed } = applyBookResults(b, jobs, ["Big city", "City", "city, capital", "night"]);
    const e = entries[0]!;
    expect(e.content).toBe("Big city");
    expect(e.memo).toBe("City");
    expect(e.title).toBe("City");
    expect(e.keys).toEqual(["місто", "Київ", "city", "capital"]);
    expect(e.secondaryKeys).toEqual(["ніч", "night"]);
    expect(changed).toBe(4);
    expect(b.entries[0]!.content).toBe("Велике місто"); // the input is not mutated
  });
  it("keeps a title that was its own", () => {
    const b = book([entry({ title: "Entry 1", memo: "Місто" })]);
    const { entries } = applyBookResults(b, planBookJobs(b), [null, "City", null]);
    expect(entries[0]!.title).toBe("Entry 1");
    expect(entries[0]!.memo).toBe("City");
  });
});

describe("translateInstalled", () => {
  const harness = (c: Character, b: Lorebook | undefined, translate: (t: string) => Promise<string>) => {
    const state = { c, b, updates: [] as string[], progress: [] as string[] };
    return {
      state,
      deps: {
        translate,
        getCharacter: () => state.c,
        updateCharacter: (_id: string, patch: Partial<Character>) => { state.c = { ...state.c, ...patch }; state.updates.push("char"); },
        getBook: () => state.b,
        updateBook: (_id: string, patch: Partial<Lorebook>) => { state.b = { ...state.b!, ...patch }; state.updates.push("book"); },
        progress: (d: number, t: number) => { state.progress.push(`${d}/${t}`); },
      },
    };
  };

  it("translates the card and its embedded book and saves both", async () => {
    const h = harness(char({ embeddedLorebookId: "b1" }), book([entry()]), async (t) => `EN(${t})`);
    const r = await translateInstalled("c1", h.deps, META);
    expect(r.notTranslated).toEqual([]);
    expect(r.done).toBe(r.total);
    expect(h.state.c.description).toBe("EN(Опис)");
    expect(h.state.b!.entries[0]!.content).toBe("EN(Велике місто)");
    expect(h.state.b!.entries[0]!.keys).toContain("EN(місто");
    expect(h.state.updates).toEqual(["char", "book"]);
    expect(h.state.progress.at(-1)).toBe(`${r.total}/${r.total}`);
  });

  it("stops after repeated failures, saves what it has and says what is left", async () => {
    let calls = 0;
    const h = harness(char({ embeddedLorebookId: "b1" }), book([entry(), entry({ id: "e2" })]), async (t) => {
      calls++;
      if (calls > 2) throw new Error("provider down");
      return `EN(${t})`;
    });
    const r = await translateInstalled("c1", h.deps, META);
    expect(r.notTranslated.length).toBeGreaterThan(0);
    expect(r.notTranslated.some((n) => n.includes("lorebook"))).toBe(true);
    expect(h.state.c.description).toBe("EN(Опис)");
    expect(calls).toBeLessThan(r.total);
    expect(h.state.b!.entries[0]!.content).toBe("Велике місто");
  });

  it("works without a lorebook", async () => {
    const h = harness(char(), undefined, async (t) => t.toUpperCase());
    const r = await translateInstalled("c1", h.deps, META);
    expect(r.notTranslated).toEqual([]);
    expect(h.state.c.firstMessage).toBe("ПРИВІТ!");
  });
});

it("offers the languages of the translation tab", () => {
  expect(TRANSLATE_LANGUAGES[0]).toBe("English");
  expect(TRANSLATE_LANGUAGES).toContain("Ukrainian");
});
