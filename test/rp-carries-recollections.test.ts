/** What a chat carries (#99): what the characters remember of closed scenes is a plain board switch like the card's memory. */
import { describe, expect, it } from "bun:test";
import { buildCarries, type CarriesAnswer } from "../src/lib/carries";

const labels = {
  memory: (n: string) => `Memory of ${n}`,
  habits: (n: string) => `Habits of ${n}`,
  personaMemory: (n: string) => `Persona memory: ${n}`,
  worldMemory: (n: string) => `World memory: ${n}`,
  recollections: (n: string) => `Recollections: ${n}`,
  characters: (n: number) => `${n} characters`,
  backstory: (t: string) => `Backstory “${t}”`,
  litopys: "Litopys",
  dashboard: "Dashboard",
  said: "Said",
  world: (l: string) => `World DM · ${l}`,
  note: "Author's note",
};
const estimate = (s: string) => Math.ceil(s.length / 4);
const answer = (over: Partial<CarriesAnswer> = {}): CarriesAnswer => ({
  chatId: "c1",
  off: [],
  litopys: { tokens: 0, facts: 0, chapters: 0 },
  backstory: null,
  cardMemory: null,
  world: null,
  ...over,
});
const recall = (who: string[], over: Record<string, unknown> = {}) => ({ scenes: 2, who, tokens: 60, text: "[x]", ...over });
const run = (carries: CarriesAnswer) => buildCarries({ carries, dash: null, noteText: "", estimate, labels });

describe("what a chat carries: recollections", () => {
  it("shows the part with its tokens and the board switch", () => {
    const r = run(answer({ recollections: recall(["Aria", "Bram"]) }));
    expect(r.parts[0]).toMatchObject({ key: "recollections", kind: "recollections", label: "Recollections: Aria, Bram", tokens: 60, off: false, switchKey: "plugin:recollections" });
    expect(r.parts[0].optIn).toBeUndefined();
    expect(r.total).toBe(60);
    expect(r.visible).toBe(true);
  });

  it("is left out when there is nothing for this reply", () => {
    expect(run(answer({ recollections: null })).visible).toBe(false);
    expect(run(answer({})).parts).toEqual([]);
  });

  it("stays in the list when muted on the board, off, and the total ignores it", () => {
    const r = run(answer({ off: ["plugin:recollections"], recollections: recall(["Aria"]) }));
    expect(r.parts[0]).toMatchObject({ key: "recollections", off: true, tokens: 60 });
    expect(r.total).toBe(0);
  });

  it("sits after the persona and world memory and before the backstory", () => {
    const card = { cardId: "aria", name: "Aria", tokens: 10, dupes: 0, sources: ["Winter"], text: "y" };
    const mem = { id: "x", name: "Jude", taken: true, stories: 1, tokens: 5, dupes: 0, sources: ["s1"], text: "z" };
    const backstory = { from: "c0", title: "Road", tokens: 5, facts: 1, chapters: 1, text: "b" };
    const r = run(answer({ cardMemory: card, personaMemory: mem, worldMemory: { ...mem, id: "w", name: "Emberfall" }, backstory, recollections: recall(["Aria"]) }));
    expect(r.parts.map((p) => p.key)).toEqual(["memory", "personamem", "worldmem", "recollections", "backstory", "note"]);
  });

  it("names one or two people, and counts three or more", () => {
    const label = (who: string[]) => run(answer({ recollections: recall(who) })).parts[0].label;
    expect(label(["Aria"])).toBe("Recollections: Aria");
    expect(label(["Aria", "Bram"])).toBe("Recollections: Aria, Bram");
    expect(label(["Aria", "Bram", "Cora"])).toBe("Recollections: 3 characters");
  });
});
