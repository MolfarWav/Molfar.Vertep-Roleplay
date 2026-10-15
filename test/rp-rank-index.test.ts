// The note and fact rankers match scene words through an index built once per ranking (Discord
// tracker BUG-001, BUG-002). It must answer exactly as the old pairwise scan did.
import { describe, expect, it } from "bun:test";

const R = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;
const L = (await import(new URL("../plugins/litopys/plugin.js", import.meta.url).href)) as Record<string, any>;

// a small seeded generator: the same cases on every run
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const ROOTS = ["кох", "вовк", "ліс", "дорог", "листа", "зброя", "сестр", "мечник", "ворот", "річк", "капітан", "пристан", "ferry", "letter", "sword", "lett", "swor", "ріка", "рік", "дім", "ми", "ok", "ab"];
const ENDINGS = ["", "а", "и", "і", "у", "ою", "ами", "ові", "ого", "ий", "ах", "ям", "s", "er", "ing", "ers", "о", "ь", "й", "ин", "ина"];
function words(next: () => number, n: number) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const root = ROOTS[Math.floor(next() * ROOTS.length)];
    const end = ENDINGS[Math.floor(next() * ENDINGS.length)];
    out.push(next() < 0.1 ? root.slice(0, 1 + Math.floor(next() * root.length)) : root + end);
  }
  return out;
}

describe("scene index matches the pairwise scan", () => {
  it("relations sceneMatcher equals scene.some(sameWord) on 20,000 cases", () => {
    const next = rng(7);
    let checked = 0;
    for (let round = 0; round < 200; round++) {
      const scene = words(next, Math.floor(next() * 40));
      const has = R.sceneMatcher(scene);
      for (const w of words(next, 100)) {
        expect([w, has(w)]).toEqual([w, scene.some((s) => R.sameWord(w, s))]);
        checked++;
      }
    }
    expect(checked).toBe(20000);
  });

  it("litopys scanMatcherM3b equals scan.some(sameWordM3b), Cyrillic inflections and short words included", () => {
    const next = rng(11);
    for (let round = 0; round < 200; round++) {
      const scan = words(next, Math.floor(next() * 40));
      const has = L.scanMatcherM3b(scan);
      for (const w of words(next, 100)) expect([w, has(w)]).toEqual([w, scan.some((s) => L.sameWordM3b(w, s))]);
    }
    // an empty scan matches nothing
    expect(L.scanMatcherM3b([])("листа")).toBe(false);
  });

  it("a long backlog ranks well inside the script time limit", () => {
    const next = rng(3);
    const scene = words(next, 3000).join(" ");
    const notes = Array.from({ length: 2000 }, (_, i) => ({ id: "n" + i, text: words(next, 25).join(" "), at: i }));
    const facts = notes.map((n) => ({ id: n.id, text: n.text, updatedAt: n.at }));
    const t0 = performance.now();
    const ranked = R.rankNotes(notes, scene);
    L.rankFacts(facts, scene);
    L.rankChapters(facts.map((f) => ({ label: f.id, text: f.text, at: f.updatedAt })), scene);
    expect(ranked.length).toBe(2000);
    // the old pairwise scan took tens of seconds here
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});
