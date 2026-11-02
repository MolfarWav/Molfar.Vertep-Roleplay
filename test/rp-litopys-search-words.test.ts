/**
 * #184: search words. The chapter worker also writes `also` (synonyms, the story's own language) for each new fact and for the
 * chapter; the word search reads them, the insert never shows them. A question in other words finds the fact through them.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, story, useRoot } from "./rp-memory-m2-kit";

useRoot();

const work = { scene: { from: "m1", to: "m6", fromIdx: 0, toIdx: 5, count: 6, kind: "scene", label: "" }, replaces: null };
const ln = () => L.activeLine(story(10));
const apply = (st: any, reply: unknown, ctx: Record<string, unknown> = {}) => L.applyWorkerResult(st, work, L.parseWorkerReply(JSON.stringify(reply)), { now: 5, line: ln(), ...ctx });
const request = (cfg: Record<string, unknown> = {}) => L.buildWorkerRequest(L.emptyChat("c1"), { ...work, scene: { ...work.scene } }, ln(), {}, { ...L.DEFAULT_CONFIG, ...L.DEFAULT_PROMPTS, ...cfg }, { userName: "You" });

describe("search words: asking for them", () => {
  it("is on by default and adds the rule and the shape to the chapter prompt; off leaves the prompt as it was", () => {
    expect(L.DEFAULT_CONFIG.searchWords).toBe(true);
    const on = request().systemPrompt;
    expect(on).toContain("Search words (optional):");
    expect(on).toContain('"weight":"everyday|important|key","also":["word"]?}');
    expect(on).toContain('"text":"3-6 sentences","also":["word"]?}');
    const off = request({ searchWords: false }).systemPrompt;
    expect(off).not.toContain("Search words");
    expect(off).not.toContain('"also"');
  });
  it("sits after the cause shape on a fact, and keeps the other rules", () => {
    const st = L.emptyChat("c1");
    st.facts.push({ id: "f1", text: "The river thawed.", subject: "world", knownBy: "all", type: "event", weight: "everyday", status: "active", at: 1, updatedAt: 1 });
    const p = L.buildWorkerRequest(st, work, ln(), {}, { ...L.DEFAULT_CONFIG, ...L.DEFAULT_PROMPTS }, { userName: "You" }).systemPrompt;
    expect(p).toContain('"because":"f3"?,"also":["word"]?}');
    expect(p).toContain("Causes (optional");
  });
  it("the switch is saved by the config and survives a partial save", () => {
    const fsx = mockHost().host.fs;
    expect(L.patchConfig(fsx, { searchWords: false }).searchWords).toBe(false);
    expect(L.patchConfig(fsx, { searchWords: "off" }).searchWords).toBe(false);
    expect(L.patchConfig(fsx, { searchWords: true }).searchWords).toBe(true);
  });
});

describe("search words: keeping them", () => {
  it("cleanAlso keeps short lowercase words, drops repeats, words the text has and long phrases, at most 8", () => {
    const text = "Bram hides the silver locket in the cellar.";
    expect(L.cleanAlso(["Pendant", "pendant", "conceals", "locket", "hides", "very long phrase of words", "a b", "x".repeat(40)], text)).toEqual(["pendant", "conceals", "a b", "x".repeat(24)]);
    expect(L.cleanAlso(Array.from({ length: 20 }, (_, i) => "word" + String.fromCharCode(97 + i)), text).length).toBe(8);
    expect(L.cleanAlso("not a list", text)).toEqual([]);
    expect(L.cleanAlso(undefined, text)).toEqual([]);
  });
  it("a new fact and the chapter keep theirs; a fact without any gets no key; off keeps none", () => {
    const reply = { chapter: { label: "The vault", text: "They opened the vault.", also: ["treasury", "opened"] }, facts: [{ op: "add", text: "Bram hides the silver locket.", subject: "Bram", knownBy: "all", also: ["pendant", "conceals"] }, { op: "add", text: "The door is oak.", subject: "world", knownBy: "all" }] };
    const st = L.emptyChat("c1");
    apply(st, reply);
    expect(st.chapters[0].also).toEqual(["treasury"]);
    expect(st.facts[0].also).toEqual(["pendant", "conceals"]);
    expect("also" in st.facts[1]).toBe(false);
    const off = L.emptyChat("c2");
    apply(off, reply, { searchWords: false });
    expect("also" in off.chapters[0]).toBe(false);
    expect("also" in off.facts[0]).toBe(false);
  });
});

describe("search words: searching with them", () => {
  const facts = [
    { id: "f1", text: "Bram hides the silver locket in the cellar.", also: ["pendant", "basement"] },
    { id: "f2", text: "Aria sells the iron dagger in the market.", also: ["blade", "bazaar"] },
    { id: "f3", text: "Cael finds the old map in the tower.", also: [] },
    { id: "f4", text: "Dara burns the red scroll in the forge.", also: ["parchment"] },
  ].map((f, i) => ({ ...f, subject: "world", knownBy: "all", weight: "everyday", status: "active", updatedAt: i + 1 }));
  const ids = (scan: string, list = facts) => L.rankFacts(list, scan, undefined, undefined, {}).map((f: any) => f.id);

  it("a question in other words finds the fact through its search words, with both rankers", () => {
    expect(ids("Where is the pendant?")[0]).toBe("f1");
    expect(ids("Who sold a blade at the bazaar?")[0]).toBe("f2");
    // the plain ranker (no options) reads them too
    expect(L.rankFacts(facts, "Where is the pendant?")[0].id).toBe("f1");
    // without search words the same question finds nothing special: the order is the tie order
    const bare = facts.map(({ also, ...f }: any) => f);
    expect(ids("Where is the pendant?", bare)[0]).not.toBe("f1");
  });
  it("chapters are found through theirs too, and the insert never shows them", () => {
    const chapters = [
      { id: "c1", label: "Scene 1", text: "The company reached the cellar.", also: ["basement"], at: 1 },
      { id: "c2", label: "Scene 2", text: "The company reached the tower.", also: [], at: 2 },
    ];
    expect(L.rankChapters(chapters, "the basement", undefined, {})[0].id).toBe("c1");
    expect(L.rankChapters(chapters, "the basement")[0].id).toBe("c1");
    const msgs = Array.from({ length: 140 }, (_, i) => ({ id: "m" + i, role: i % 2 ? ("char" as const) : ("user" as const), name: i % 2 ? "Aria" : "Jude", text: "turn " + i, swipe: 0 }));
    const line = L.activeLine(msgs);
    const st = L.emptyChat("c1");
    st.migrated = true;
    st.chapters = [{ id: "c1", from: "m0", to: "m9", count: 10, sig: L.chapterSig(line.slice(0, 10)), label: "Scene 1", text: "The company reached the cellar.", also: ["basement"], kind: "scene", at: 1 }];
    st.facts = [{ id: "f1", text: "Bram hides the silver locket.", subject: "Bram", knownBy: "all", type: "event", weight: "everyday", status: "active", at: 1, updatedAt: 1, also: ["pendant"], src: { chapter: "c1" } }];
    const res = L.buildInsert({ st, line, dash: null, meta: { userName: "Jude" }, cfg: { ...L.DEFAULT_CONFIG, recentMessages: 100 }, scanText: "the pendant", speakerName: "", used: {} });
    const text = res.head + res.tail;
    expect(text).toContain("silver locket");
    expect(text).not.toContain("pendant");
    expect(text).not.toContain("basement");
  });
});
