import { describe, expect, it } from "bun:test";
import { buildCarries, flipOff, type CarriesAnswer } from "../src/lib/carries";

const labels = {
  habits: (n: string) => `Habits of ${n}`,
  growth: (n: string) => `Portrait of ${n}`,
  personaMemory: (n: string) => `Persona memory: ${n}`,
  worldMemory: (n: string) => `World memory: ${n}`,
  recollections: (n: string) => `Recollections: ${n}`,
  characters: (n: number) => `${n} characters`,
  backstory: (t: string) => `Backstory “${t}”`,
  backstoryFar: (r: string) => `Far chats ${r}`,
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
  world: null,
  ...over,
});
const held = { cardId: "aria", name: "Aria", tokens: 120, dupes: 0, habits: ["Keeps a brass key close"], text: "x" };
const backstory = { from: "c0", title: "Winter road", tokens: 80, facts: 3, chapters: 1, text: "y" };
const run = (o: Partial<Parameters<typeof buildCarries>[0]>) => buildCarries({ carries: null, dash: null, noteText: "", estimate, labels, ...o });

describe("what a chat carries: the parts", () => {
  it("lists the parts in order and totals the tokens of those that are on", () => {
    const r = run({
      carries: answer({ cardHabits: held, backstory, litopys: { tokens: 50, facts: 2, chapters: 1 } }),
      dash: { tokens: 200, saidTokens: 30 },
      noteText: "a".repeat(40),
    });
    expect(r.parts.map((p) => p.key)).toEqual(["habits", "backstory", "litopys", "dashboard", "said", "note"]);
    expect(r.parts.map((p) => p.label)).toEqual(["Habits of Aria", "Backstory “Winter road”", "Litopys", "Dashboard", "Said", "Author's note"]);
    expect(r.parts.map((p) => p.switchKey)).toEqual(["plugin:cardhabits", "plugin:litopys", "plugin:litopys", "plugin:relations", "plugin:said", null]);
    expect(r.total).toBe(120 + 80 + 50 + 200 + 30 + 10);
    expect(r.visible).toBe(true);
  });

  it("leaves out parts that do not exist: no habits, no backstory, an empty Litopys record, no Dashboard, no said", () => {
    const r = run({ carries: answer({ cardHabits: held }), dash: { tokens: 90, saidTokens: 0 } });
    expect(r.parts.map((p) => p.key)).toEqual(["habits", "dashboard", "note"]);
    expect(r.parts.at(-1)).toMatchObject({ key: "note", tokens: 0, empty: true, switchKey: null });
  });

  it("shows the Dashboard chip when the view exists even if the carries answer failed", () => {
    const r = run({ carries: null, dash: { tokens: 40, saidTokens: 0 } });
    expect(r.parts.map((p) => p.key)).toEqual(["dashboard", "note"]);
  });

  it("marks switched-off parts, and the total ignores them", () => {
    const r = run({
      carries: answer({ off: ["plugin:cardhabits", "plugin:said"], cardHabits: held, litopys: { tokens: 50, facts: 1, chapters: 1 } }),
      dash: { tokens: 200, saidTokens: 30 },
    });
    const off = Object.fromEntries(r.parts.map((p) => [p.key, p.off]));
    expect(off).toEqual({ habits: true, litopys: false, dashboard: false, said: true, note: false });
    expect(r.total).toBe(50 + 200);
  });

  it("one Litopys switch covers the backstory and the chat's own record", () => {
    const r = run({ carries: answer({ off: ["plugin:litopys"], backstory, litopys: { tokens: 50, facts: 1, chapters: 1 } }) });
    expect(r.parts.filter((p) => p.switchKey === "plugin:litopys").map((p) => [p.key, p.off])).toEqual([["backstory", true], ["litopys", true]]);
    expect(r.total).toBe(0);
  });

  it("keeps a part the user switched off visible, so it can be switched back on", () => {
    const r = run({ carries: answer({ off: ["plugin:litopys", "plugin:said"] }), dash: { tokens: 0, saidTokens: 0 } });
    expect(r.parts.map((p) => p.key)).toEqual(["litopys", "dashboard", "said", "note"]);
  });

  it("counts a written Author's note and never gives it a switch", () => {
    const r = run({ carries: answer({ cardHabits: held }), noteText: "Keep it slow." });
    expect(r.parts.at(-1)).toMatchObject({ key: "note", tokens: estimate("Keep it slow."), switchKey: null });
    expect(r.parts.at(-1)?.empty).toBeUndefined();
  });

  it("shows nothing at all for a plain chat, but a written note alone is enough to show the strip", () => {
    expect(run({})).toEqual({ parts: [], total: 0, visible: false });
    expect(run({ carries: answer() }).visible).toBe(false);
    const r = run({ carries: answer(), noteText: "Slow burn." });
    expect(r.visible).toBe(true);
    expect(r.parts.map((p) => p.key)).toEqual(["note"]);
  });
});

describe("what a chat carries: the card habits", () => {
  const habits = { cardId: "aria", name: "Aria", tokens: 60, dupes: 0, habits: ["Answers threats with silence"], text: "z" };
  it("comes first, with its own switch, and drops out of the total when it is off", () => {
    const r = run({ carries: answer({ cardHabits: habits, backstory }) });
    expect(r.parts.map((p) => p.key)).toEqual(["habits", "backstory", "note"]);
    expect(r.parts[0]).toMatchObject({ label: "Habits of Aria", tokens: 60, switchKey: "plugin:cardhabits", off: false });
    expect(r.total).toBe(60 + 80);
    const off = run({ carries: answer({ off: ["plugin:cardhabits"], cardHabits: habits }) });
    expect(off.parts[0]).toMatchObject({ key: "habits", off: true });
    expect(off.total).toBe(0);
  });
  it("is left out when the server sends none (the card has no habits, or they are off for the chat)", () => {
    expect(run({ carries: answer({ cardHabits: null }) }).visible).toBe(false);
  });
});

describe("what a chat carries: the World DM", () => {
  const world = (over: object = {}) => ({ level: "living" as const, insert: true, waiting: true, tokens: 45, text: "A bell rings.", ...over });
  it("comes after Said and before the note, with its level in the label and its own switch", () => {
    const r = run({ carries: answer({ cardHabits: held, world: world() }), dash: { tokens: 90, saidTokens: 10 } });
    expect(r.parts.map((p) => p.key)).toEqual(["habits", "dashboard", "said", "world", "note"]);
    expect(r.parts.find((p) => p.key === "world")).toMatchObject({ label: "World DM · living", tokens: 45, switchKey: "plugin:world", off: false });
    expect(r.total).toBe(120 + 90 + 10 + 45);
  });
  it("shows whenever the World DM is on for the chat, even with nothing waiting, and lets a switched-off one drop out of the total", () => {
    const idle = run({ carries: answer({ world: world({ waiting: false, tokens: 0, text: "" }) }) });
    expect(idle.parts.map((p) => p.key)).toEqual(["world", "note"]);
    expect(idle.parts[0].tokens).toBe(0);
    const off = run({ carries: answer({ off: ["plugin:world"], world: world() }) });
    expect(off.parts[0]).toMatchObject({ key: "world", off: true });
    expect(off.total).toBe(0);
  });
  it("leaves it out when the World DM is off for the chat", () => {
    expect(run({ carries: answer({ world: null }) }).visible).toBe(false);
  });
});

describe("what a chat carries: the switches", () => {
  it("flips one key in the off list without touching the others", () => {
    expect(flipOff([], "plugin:said")).toEqual(["plugin:said"]);
    expect(flipOff(["databank", "plugin:said"], "plugin:said")).toEqual(["databank"]);
    expect(flipOff(["databank"], "plugin:litopys")).toEqual(["databank", "plugin:litopys"]);
  });
});

describe('the portrait of a character (#396)', () => {
  const cardGrowth = { cardId: 'aria', name: 'Aria', tokens: 90, blocks: 2, omitted: 0, text: 'z' };
  it('sits after the habits, has its own board switch and counts while it is on', () => {
    const r = run({ carries: answer({ cardHabits: held, cardGrowth }) });
    expect(r.parts.map((p) => p.key)).toEqual(['habits', 'growth', 'note']);
    const g = r.parts.find((p) => p.key === 'growth')!;
    expect(g.label).toBe('Portrait of Aria');
    expect(g.switchKey).toBe('plugin:cardgrowth');
    expect(r.total).toBe(120 + 90 + 0);
  });
  it('is off, and not counted, when the chat switched it off', () => {
    const r = run({ carries: answer({ off: ['plugin:cardgrowth'], cardGrowth }) });
    const g = r.parts.find((p) => p.key === 'growth')!;
    expect(g.off).toBe(true);
    expect(r.total).toBe(0);
  });
  it('is left out when the card has no accepted block that is on', () => {
    expect(run({ carries: answer({ cardHabits: held }) }).parts.some((p) => p.key === 'growth')).toBe(false);
  });
});
