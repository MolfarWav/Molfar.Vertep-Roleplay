/** What a chat carries (#99): a persona's and a saved world's memory are parts the chat opts into. */
import { describe, expect, it } from "bun:test";
import { buildCarries, type CarriesAnswer } from "../src/lib/carries";

const labels = {
  memory: (n: string) => `Memory of ${n}`,
  habits: (n: string) => `Habits of ${n}`,
  personaMemory: (n: string) => `Persona memory: ${n}`,
  worldMemory: (n: string) => `World memory: ${n}`,
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
const shared = (over: Record<string, unknown> = {}) => ({ id: "pers_jude", name: "Jude", taken: true, stories: 2, tokens: 90, dupes: 0, sources: ["Winter"], text: "x", ...over });
const run = (carries: CarriesAnswer) => buildCarries({ carries, dash: null, noteText: "", estimate, labels });

describe("what a chat carries: persona and world memory", () => {
  it("shows both parts, after the card's, with the label, the tokens and the Prompt board key", () => {
    const r = run(answer({ personaMemory: shared(), worldMemory: shared({ id: "w-ember1", name: "Emberfall", tokens: 40 }) }));
    expect(r.parts.map((p) => p.key)).toEqual(["personamem", "worldmem", "note"]);
    expect(r.parts.map((p) => p.label)).toEqual(["Persona memory: Jude", "World memory: Emberfall", "Author's note"]);
    expect(r.parts.map((p) => p.switchKey)).toEqual(["plugin:personamemory", "plugin:worldmemory", null]);
    expect(r.parts.map((p) => p.optIn)).toEqual([{ owner: "persona", taken: true }, { owner: "world", taken: true }, undefined]);
    expect(r.parts.slice(0, 2).map((p) => [p.off, p.tokens])).toEqual([[false, 90], [false, 40]]);
    expect(r.total).toBe(130);
  });

  it("comes after the card memory and before the backstory", () => {
    const card = { cardId: "aria", name: "Aria", tokens: 10, dupes: 0, sources: ["Winter"], text: "y" };
    const backstory = { from: "c0", title: "Road", tokens: 5, facts: 1, chapters: 1, text: "z" };
    const r = run(answer({ cardMemory: card, backstory, personaMemory: shared() }));
    expect(r.parts.map((p) => p.key)).toEqual(["memory", "personamem", "backstory", "note"]);
  });

  it("a chat that did not opt in shows the part off with no tokens, and the total ignores it", () => {
    const r = run(answer({ personaMemory: shared({ taken: false, tokens: 0 }) }));
    const p = r.parts[0];
    expect(p).toMatchObject({ key: "personamem", off: true, tokens: 0, optIn: { owner: "persona", taken: false } });
    expect(r.total).toBe(0);
    // a plain chat with only this part still shows the strip: that is where the user turns it on
    expect(r.visible).toBe(true);
  });

  it("leaves the part out when the owner has no story on, or the chat has no such owner", () => {
    expect(run(answer({ personaMemory: shared({ stories: 0, taken: false }) })).visible).toBe(false);
    expect(run(answer({ personaMemory: null, worldMemory: null })).visible).toBe(false);
    expect(run(answer({})).parts.map((p) => p.key)).toEqual([]);
  });

  it("a chat that took it in but muted it on the Prompt board shows it off, and its tokens do not count", () => {
    const r = run(answer({ off: ["plugin:worldmemory"], worldMemory: shared({ id: "w-ember1", name: "Emberfall", tokens: 40 }) }));
    expect(r.parts[0]).toMatchObject({ key: "worldmem", off: true, optIn: { owner: "world", taken: true } });
    expect(r.total).toBe(0);
  });

  it("a mute of one does not touch the other", () => {
    const r = run(answer({ off: ["plugin:personamemory"], personaMemory: shared(), worldMemory: shared({ tokens: 40 }) }));
    expect(r.parts.slice(0, 2).map((p) => p.off)).toEqual([true, false]);
    expect(r.total).toBe(40);
  });
});
