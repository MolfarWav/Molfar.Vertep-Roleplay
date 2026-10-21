/**
 * Cancelling a card or lorebook translation: no new request starts, the ones in flight are aborted,
 * and nothing is written (no half-translated card, no preview). A request cut short by Cancel is
 * not counted as a failure.
 */
import { describe, it, expect } from "bun:test";
import { translateInstalled, translateBook, raceAbort } from "../src/lib/card-translate";
import type { Character, LoreEntry, Lorebook } from "../src/lib/types";

const META = { target: "English", provider: "llm", at: "2026-10-21T00:00:00.000Z" };
const entry = (n: number): LoreEntry => ({ id: `e${n}`, title: `T${n}`, memo: `M${n}`, keys: [`k${n}`], keysRegex: false, secondaryKeys: [], content: `Content ${n}` } as LoreEntry);
const char = (): Character => ({
  id: "c1", name: "Mira", description: "Опис", personality: "Тиха", scenario: "Сцена", firstMessage: "Привіт!",
  altGreetings: ["Один", "Два", "Три"], exampleDialogue: "Приклад", creatorNotes: "Нотатки", systemPromptOverride: "",
  postHistoryInstructions: "", embeddedLorebookId: "b1",
} as Character);

/** A translator that answers after a tick and honours the signal like fetch does (rejects with an AbortError). */
function slowTranslator(seen: string[]) {
  return (text: string, signal?: AbortSignal) => new Promise<string>((resolve, reject) => {
    seen.push(text);
    const timer = setTimeout(() => resolve(`T:${text}`), 20);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); });
  });
}

describe("cancelling translateInstalled", () => {
  it("cancelled mid-way writes nothing and offers no preview", async () => {
    const ac = new AbortController();
    const seen: string[] = [];
    const writes: string[] = [];
    const book: Lorebook = { id: "b1", name: "Lore", entries: [entry(1), entry(2), entry(3)] } as Lorebook;
    const c = char();
    const p = translateInstalled("c1", {
      translate: slowTranslator(seen), signal: ac.signal,
      getCharacter: () => c, updateCharacter: () => { writes.push("char"); },
      getBook: () => book, updateBook: () => { writes.push("book"); },
      progress: (done) => { if (done === 3) ac.abort(); },
    }, META);
    const res = await p;
    expect(res.cancelled).toBe(true);
    expect(writes).toEqual([]);
    expect(res.pending).toBeUndefined();
    // the pass stopped early: not every text was asked for
    expect(seen.length).toBeLessThan(8 + 3 * 3);
  });

  it("the preview pass (apply: false) is cancelled the same way", async () => {
    const ac = new AbortController();
    const res = await translateInstalled("c1", {
      translate: slowTranslator([]), signal: ac.signal,
      getCharacter: () => char(), updateCharacter: () => {}, getBook: () => undefined, updateBook: () => {},
      progress: (done) => { if (done === 1) ac.abort(); },
    }, META, { apply: false });
    expect(res.cancelled).toBe(true);
    expect(res.pending).toBeUndefined();
  });

  it("an abort while requests are in flight is not a failure and ends the pass quickly", async () => {
    const ac = new AbortController();
    const seen: string[] = [];
    setTimeout(() => ac.abort(), 5);
    const res = await translateInstalled("c1", {
      translate: slowTranslator(seen), signal: ac.signal,
      getCharacter: () => char(), updateCharacter: () => { throw new Error("must not write"); }, getBook: () => undefined, updateBook: () => {},
      progress: () => {},
    }, META);
    expect(res.cancelled).toBe(true);
    // only the first two (the concurrency) were ever started
    expect(seen.length).toBe(2);
    expect(res.notTranslated).toEqual([]);
  });

  it("without a signal nothing changes: the card is written", async () => {
    const written: Record<string, unknown>[] = [];
    const res = await translateInstalled("c1", {
      translate: async (t) => `T:${t}`,
      getCharacter: () => char(), updateCharacter: (_, patch) => { written.push(patch); }, getBook: () => undefined, updateBook: () => {},
      progress: () => {},
    }, META);
    expect(res.cancelled).toBeUndefined();
    expect(written.length).toBe(1);
  });

  it("already aborted before the start: no request is made", async () => {
    const ac = new AbortController();
    ac.abort();
    const seen: string[] = [];
    const res = await translateInstalled("c1", {
      translate: slowTranslator(seen), signal: ac.signal,
      getCharacter: () => char(), updateCharacter: () => {}, getBook: () => undefined, updateBook: () => {},
      progress: () => {},
    }, META);
    expect(res.cancelled).toBe(true);
    expect(seen).toEqual([]);
  });
});

describe("cancelling translateBook", () => {
  it("cancelled mid-way leaves the book as it was", async () => {
    const ac = new AbortController();
    const book: Lorebook = { id: "b1", name: "Lore", entries: [entry(1), entry(2), entry(3), entry(4)] } as Lorebook;
    let updated = false;
    const res = await translateBook("b1", {
      translate: slowTranslator([]), signal: ac.signal,
      getBook: () => book, updateBook: () => { updated = true; },
      progress: (done) => { if (done === 2) ac.abort(); },
    });
    expect(res.cancelled).toBe(true);
    expect(updated).toBe(false);
    expect(book.entries[0]!.content).toBe("Content 1");
  });

  it("without a signal the book is updated as before", async () => {
    const book: Lorebook = { id: "b1", name: "Lore", entries: [entry(1)] } as Lorebook;
    let patch: Partial<Lorebook> | null = null;
    const res = await translateBook("b1", {
      translate: async (t) => `T:${t}`, getBook: () => book, updateBook: (_, p) => { patch = p; }, progress: () => {},
    });
    expect(res.cancelled).toBeUndefined();
    expect(patch).not.toBeNull();
  });
});

describe("raceAbort", () => {
  it("rejects with an AbortError at once when the request ignores the signal", async () => {
    const ac = new AbortController();
    const never = new Promise<string>(() => {});
    setTimeout(() => ac.abort(), 5);
    const t0 = Date.now();
    await expect(raceAbort(never, ac.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it("passes the answer through when nobody cancels", async () => {
    expect(await raceAbort(Promise.resolve("ok"), new AbortController().signal)).toBe("ok");
    expect(await raceAbort(Promise.resolve("ok"))).toBe("ok");
  });
  it("a pass with a translator that ignores the signal still ends at once, writing nothing", async () => {
    const ac = new AbortController();
    let wrote = false;
    setTimeout(() => ac.abort(), 5);
    const t0 = Date.now();
    const res = await translateInstalled("c1", {
      translate: () => new Promise<string>(() => {}), signal: ac.signal,
      getCharacter: () => char(), updateCharacter: () => { wrote = true; }, getBook: () => undefined, updateBook: () => {},
      progress: () => {},
    }, META);
    expect(res.cancelled).toBe(true);
    expect(wrote).toBe(false);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
