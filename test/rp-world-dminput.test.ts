/**
 * World DM input (#424, step 2.5): the DM reads in full only the records the new part of the story touches (named, the scene's
 * place and what lies there, the people in the scene, pinned, bench people due soon); every other record is one line.
 */
import { describe, expect, it } from "bun:test";
import { benchSoon, castThreshold, dmInput, emptyState, fullRecordIds, handleRoute } from "../plugins/world/plugin.js";

const rec = (id: string, kind: string, name: string, text: string, extra: Record<string, unknown> = {}) => ({ id, kind, name, aliases: [], text, status: "active", uid: 0, at: 1, ...extra });
const ENTITIES = [
  rec("n1", "person", "Olya", "Taras's best friend from school.", { aliases: ["Olechka"] }),
  rec("n2", "person", "Maksym", "Keeps the toll at the Red Tower."),
  rec("n3", "place", "Red Tower", "A tower up the pass."),
  rec("n4", "place", "Cellar", "Under the tower.", { inside: "Red Tower", size: "spot" }),
  rec("n5", "thing", "Brass key", "Opens the cellar.", { place: "Red Tower" }),
  rec("n6", "thing", "Cup of noodles", "A cheap supper.", { place: "Harbour" }),
  rec("n7", "thing", "Sealed letter", "Never opened.", { pinned: true }),
  rec("n8", "thing", "Lantern", "Carried by Odarka.", { holder: "Odarka" }),
  rec("n9", "person", "Odarka", "Taras's guide."),
  rec("n10", "place", "Harbour", "Far away."),
  rec("n11", "group", "Guild", "Merchants."),
];
const state = (extra: Record<string, unknown> = {}) => ({ ...emptyState("c1"), entities: ENTITIES.map((e) => ({ ...e })), nextId: 20, ...extra }) as any;
const ids = (s: Set<string>) => [...s].sort();

describe("fullRecordIds", () => {
  it("a record named in the new part is read in full, by name or by alias", () => {
    const full = fullRecordIds(state(), { story: "Olechka laughed. The Guild sent word.", scene: null, reg: null, soon: [] });
    expect(ids(full)).toEqual(["n1", "n11", "n7"]);
  });

  it("the scene's place, what lies there, what a person in the scene holds, and the people in the scene", () => {
    const scene = { place: "Red Tower", present: ["Odarka"] };
    const full = fullRecordIds(state(), { story: "Nothing is named.", scene, reg: null, soon: [] });
    // Red Tower, its spot Cellar, the Brass key lying there, the Lantern Odarka holds, Odarka herself, and the pinned letter
    expect(ids(full)).toEqual(["n3", "n4", "n5", "n7", "n8", "n9"]);
  });

  it("a record of another place, nobody names it: not in full", () => {
    const full = fullRecordIds(state(), { story: "We go on.", scene: { place: "Red Tower", present: [] }, reg: null, soon: [] });
    expect(full.has("n6")).toBe(false);
    expect(full.has("n10")).toBe(false);
  });

  it("bench people who are due soon are in", () => {
    const full = fullRecordIds(state(), { story: "We go on.", scene: null, reg: null, soon: ["n2"] });
    expect(full.has("n2")).toBe(true);
  });

  it("retired and dormant records are never in the set", () => {
    const s = state();
    s.entities[1].status = "past";
    expect(fullRecordIds(s, { story: "Maksym nods.", scene: null, reg: null, soon: [] }).has("n2")).toBe(false);
  });
});

describe("dmInput with a set of full records", () => {
  const msgs = [{ role: "assistant", name: "Odarka", text: "Olya wrote again." }];
  it("full records keep their text, the rest are one line `id · kind · name`, and a note says so", () => {
    const full = fullRecordIds(state(), { story: "Olya wrote again.", scene: null, reg: null, soon: [] });
    const text = dmInput({ cards: [], userName: "Taras", entities: state().entities, msgs, full });
    expect(text).toContain("n1 · person · Olya (Olechka): Taras's best friend from school.");
    expect(text).toContain("\nn6 · thing · Cup of noodles\n");
    expect(text).not.toContain("A cheap supper.");
    expect(text).toContain("Records listed by name only are known to you but not shown in full here");
    // the pinned letter stays in full
    expect(text).toContain("n7 · thing · Sealed letter: Never opened.");
  });

  it("no set = every record in full and no note (as before)", () => {
    const text = dmInput({ cards: [], userName: "Taras", entities: state().entities, msgs });
    expect(text).toContain("A cheap supper.");
    expect(text).not.toContain("listed by name only");
  });

  it("every record in full = no note", () => {
    const all = new Set(ENTITIES.map((e) => e.id));
    expect(dmInput({ cards: [], userName: "Taras", entities: state().entities, msgs, full: all })).not.toContain("listed by name only");
  });
});

describe("benchSoon", () => {
  const msgs = Array.from({ length: 60 }, (_, i) => ({ id: "m" + i, role: i % 2 === 0 ? "user" : "char", name: "x", text: "The road goes on." }));
  const call = (freq: string, within: number) => benchSoon({ state: state(), msgs, snaps: {}, reg: null, personIds: {}, freq, within });
  it("people within one cadence of their threshold (or past it) are listed; Off lists nobody", () => {
    // 60 messages = 30 replies of silence for everyone
    const t = castThreshold("normal", "c1", "n1");
    expect(t).toBeGreaterThan(0);
    expect(call("normal", 100)).toContain("n1");
    expect(call("off", 100)).toEqual([]);
  });
  it("a person far from the threshold is not listed", () => {
    expect(call("rare", 0)).toEqual([]);
  });
  it("a person the player switched off is not listed", () => {
    const s = state();
    s.entities[0].noReturn = true;
    expect(benchSoon({ state: s, msgs, snaps: {}, reg: null, personIds: {}, freq: "normal", within: 100 })).not.toContain("n1");
  });
});

describe("the DM run sends the short input", () => {
  it("an unnamed thing of another place goes in as one line, a named one in full", () => {
    const sent: any[] = [];
    const files: Record<string, string> = {
      "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
      "chats/c1.jsonl": ["Maksym keeps the toll.", "Then we go at night."].map((t, i) => JSON.stringify({ id: "m" + i, role: i % 2 ? "user" : "char", name: i % 2 ? "Taras" : "Odarka", text: t, swipe: 0 })).join("\n") + "\n",
      "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
      "settings.json": JSON.stringify({ model: "c/default" }),
      "world/state/c1.json": JSON.stringify({ ...state(), settings: { level: "chronicler", everyN: 1, stagnation: 6, onTransition: true, onPlace: true, insert: true, cast: "off" } }),
    };
    const host = {
      fs: {
        read: (p: string) => { if (!(p in files)) throw new Error("ENOENT " + p); return files[p]!; },
        write: (p: string, s: string) => { files[p] = s; },
        remove: (p: string) => { delete files[p]; },
        list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
      },
      llm: { request: (_k: string, o: any) => { sent.push(o); }, results: {} as Record<string, any> },
    };
    const out = handleRoute({ method: "POST", path: "/world/update", query: {}, body: { chatId: "c1" } }, host) as any;
    expect(out.json?.skipped ?? out.__llmPending ?? "pending").toBeDefined();
    const content: string = sent[0].messages[0].content;
    expect(content).toContain("n2 · person · Maksym: Keeps the toll at the Red Tower.");
    expect(content).toContain("\nn6 · thing · Cup of noodles\n");
    expect(content).not.toContain("A cheap supper.");
  });
});
