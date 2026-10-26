/**
 * Memory wave 1, the prompt insert: the budget ceiling (16000), no fixed count of chapters, a share of the
 * room for chapters and arcs, and the full record when everything fits. The synthetic chat is the one the
 * memory plan was measured on: a chapter about 110 tokens, four facts a chapter, 15 messages a scene.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson, story, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any) => L.handleRoute({ method, path, query: {}, body }, host);

const words = "Rhea Isabella Ember Kael market tower harbour oath storm sword letter guild debt wound night road gate bridge fire".split(" ");
const sent = (n: number, seed: number) =>
  Array.from({ length: n }, (_, i) => `${words[(seed + i) % words.length]} ${words[(seed * 3 + i * 2) % words.length]} decided something about the ${words[(seed + i * 5) % words.length]} and everyone felt it changed.`).join(" ");

/** A chat of `total` messages in scenes of `sceneLen`, one chapter per finished scene, `perChapter` facts a chapter. */
function chat(total: number, o: { sceneLen?: number; perChapter?: number; budget?: number; scan?: string; cfg?: Record<string, unknown> } = {}) {
  const sceneLen = o.sceneLen ?? 15;
  const line = Array.from({ length: total }, (_, i) => ({ id: "m" + i, role: i % 2 ? "char" : "user", name: i % 2 ? "Rhea" : "Me", text: "x" }));
  const chapters: any[] = [];
  for (let s = 0; s < Math.floor(total / sceneLen) - 1; s++) chapters.push({ id: "c" + s, label: "Scene " + s, text: sent(5, s), from: "m" + s * sceneLen, to: "m" + (s * sceneLen + sceneLen - 1), at: s });
  const nFacts = chapters.length * (o.perChapter ?? 4);
  const facts = Array.from({ length: nFacts }, (_, i) => ({
    id: "f" + i,
    status: "active",
    text: sent(1, i + 7),
    subject: i % 3 ? "Rhea" : "world",
    knownBy: "all",
    type: i % 5 ? "event" : "change",
    weight: i % 7 ? "everyday" : "important",
    src: { chapter: "c" + (i % Math.max(1, chapters.length)) },
  }));
  const st = { chatId: "t", chapters, facts, proposals: [], arcs: [], counters: {} };
  const cfg = { ...L.DEFAULT_CONFIG, ...(o.budget ? { budget: o.budget } : {}), ...(o.cfg ?? {}) };
  const ins = L.buildInsert({ st, line, dash: { snapshots: {} }, meta: { userName: "Me" }, cfg, scanText: o.scan ?? "tower oath storm", speakerName: "Rhea", used: {} });
  return { ins, chapters, facts, line, st, cfg };
}

describe("the budget ceiling", () => {
  it("is 16000 in the config, and 200 is the floor", () => {
    const { host } = mockHost();
    expect(route(host, "PUT", "/litopys/config", { budget: 16000 }).json.budget).toBe(16000);
    expect(route(host, "PUT", "/litopys/config", { budget: 99999 }).json.budget).toBe(16000);
    expect(route(host, "PUT", "/litopys/config", { budget: 50 }).json.budget).toBe(200);
    expect(route(host, "GET", "/litopys/config").json.budget).toBe(200);
  });

  it("the arc threshold follows the larger budget", () => {
    expect(L.arcThresholdOf({ budget: 16000, arcThreshold: 0 })).toBe(32000);
    expect(L.arcThresholdOf({ budget: 800, arcThreshold: 0 })).toBe(1600);
    expect(L.arcThresholdOf({ budget: 99999, arcThreshold: 0 })).toBe(32000);
    expect(L.arcThresholdOf({ budget: 16000, arcThreshold: 5000 })).toBe(5000);
  });

  it("the insert is not cut at 4000 tokens", () => {
    const { ins } = chat(600, { budget: 8000 });
    expect(ins.tokens).toBeGreaterThan(4000);
    expect(ins.tokens).toBeLessThanOrEqual(8000);
  });
});

describe("what the prompt holds as the chat grows (the plan's synthetic runs)", () => {
  // [messages, budget, chapters made, full record?]
  const table: [number, number, number, boolean][] = [
    [100, 800, 5, false],
    [300, 800, 19, false],
    [600, 800, 39, false],
    [1000, 800, 65, false],
    [100, 4000, 5, true],
    [300, 4000, 19, true],
    [600, 4000, 39, false],
    [1000, 4000, 65, false],
    [100, 16000, 5, true],
    [300, 16000, 19, true],
    [600, 16000, 39, true],
    [1000, 16000, 65, true],
  ];
  for (const [total, budget, made, full] of table) {
    it(`${total} messages, budget ${budget}: ${full ? "the whole record" : "a ranked part within the budget"}`, () => {
      const { ins, chapters } = chat(total, { budget });
      expect(chapters.length).toBe(made);
      expect(ins.tokens).toBeLessThanOrEqual(budget);
      expect(ins.full).toBe(full);
      // nothing is ranked away: every chapter before the cut (the last one is still in the messages) and every fact
      if (full) expect(ins.chapters).toBeGreaterThanOrEqual(chapters.length - 1);
    });
  }

  it("a bigger budget never holds less", () => {
    for (const total of [300, 600, 1000]) {
      let last = { chapters: 0, facts: 0 };
      for (const budget of [800, 2000, 4000, 8000, 16000]) {
        const { ins } = chat(total, { budget });
        expect(ins.chapters).toBeGreaterThanOrEqual(last.chapters);
        expect(ins.facts).toBeGreaterThanOrEqual(last.facts);
        last = ins;
      }
    }
  });

  it("holds more than 6 chapters when the budget allows (the old fixed cap)", () => {
    const { ins } = chat(600, { budget: 8000 });
    expect(ins.chapters).toBeGreaterThan(6);
    // at 4000 the old code held 7 of the 39 chapters; the share for chapters lifts it
    expect(chat(600, { budget: 4000 }).ins.chapters).toBeGreaterThan(7);
  });
});

describe("the share for chapters", () => {
  /** The tokens the rendered chapters take, by the same estimate as the insert. */
  const chapterTokens = (ins: any, chapters: any[]) => {
    const ours = chapters.filter((c) => ins.text.includes(c.text));
    return { n: ours.length, tokens: ours.reduce((n, c) => n + L.estimateTokens("- " + c.label + ": " + c.text), 0) };
  };

  it("chapters take at least 40% of what is left after the pinned facts and the bridge, when both kinds exist", () => {
    const { ins, chapters } = chat(600, { budget: 4000 });
    expect(ins.full).toBe(false);
    const c = chapterTokens(ins, chapters);
    // the bridge and the pinned facts come first, so measure against the whole budget with a margin
    expect(c.tokens).toBeGreaterThanOrEqual(0.3 * 4000);
    expect(ins.facts).toBeGreaterThan(0);
  });

  it("room one kind does not use goes to the other: few chapters, many facts", () => {
    const { ins, facts } = chat(100, { budget: 800, perChapter: 12 });
    // 5 chapters could take their share, but they are small: the facts get the rest
    expect(ins.tokens).toBeGreaterThan(700);
    expect(ins.facts).toBeGreaterThan(10);
    expect(ins.facts).toBeLessThanOrEqual(facts.length);
  });

  it("room one kind does not use goes to the other: many chapters, no facts", () => {
    const { ins } = chat(600, { budget: 4000, perChapter: 0 });
    expect(ins.facts).toBe(0);
    expect(ins.tokens).toBeGreaterThan(3500);
  });

  it("an item goes in whole or not at all", () => {
    const { ins, chapters } = chat(600, { budget: 2000 });
    for (const c of chapters) {
      if (ins.text.includes("- " + c.label + ": ")) expect(ins.text.includes("- " + c.label + ": " + c.text)).toBe(true);
    }
  });

  it("keeps a sanity cap on the chapters it ranks", () => {
    const { ins, chapters } = chat(3000, { budget: 16000, perChapter: 0 });
    // about 200 chapters of ~110 tokens do not fit 16000: ranked, and the budget is not what stops it
    expect(chapters.length).toBeGreaterThan(150);
    expect(ins.full).toBe(false);
    expect(ins.chapters).toBe(61); // the 60 ranked ones and the bridge
  });
});

describe("the full record", () => {
  it("puts the chapters in story order above the history and the facts below it", () => {
    const { ins, chapters } = chat(300, { budget: 16000 });
    expect(ins.full).toBe(true);
    expect(ins.head).toContain("the story so far");
    expect(ins.head).not.toContain("Facts:");
    expect(ins.tail).toContain("Facts:");
    expect(ins.tail).not.toContain("Scene 0:");
    const at = (c: any) => ins.head.indexOf("Scene " + c.id.slice(1) + ":");
    const held = chapters.filter((c) => at(c) >= 0);
    expect(held.length).toBeGreaterThan(10);
    for (let i = 1; i < held.length; i++) expect(at(held[i])).toBeGreaterThan(at(held[i - 1]));
  });

  it("holds the head the same between chapter closings, whatever the scan says", () => {
    const a = chat(300, { budget: 16000, scan: "tower oath" }).ins;
    const b = chat(300, { budget: 16000, scan: "fire gate road" }).ins;
    expect(a.full && b.full).toBe(true);
    expect(a.head).toBe(b.head);
  });

  it("is not used when the record does not fit, and the ranked insert says so", () => {
    const { ins } = chat(300, { budget: 2000 });
    expect(ins.full).toBe(false);
    expect(ins.head).toContain("just before the messages below");
  });

  it("carries every active fact, in or out of ranking, but not those whose scene is still in the prompt", () => {
    const { ins, facts } = chat(300, { budget: 16000 });
    expect(ins.full).toBe(true);
    // the facts of the last, still-open scene are about messages the prompt still holds
    expect(ins.facts).toBeGreaterThanOrEqual(facts.length - 4);
  });

  it("is reported to the sidecar and on the Prompt board", () => {
    const { host } = mockHost();
    writeChat("c1", story(40), { title: "T", characterId: "aria" });
    const record = (n: number) => ({
      ...L.emptyChat("c1"),
      migrated: true,
      chapters: [{ id: "c1", from: "m1", to: "m20", count: 20, kind: "scene", label: "Gate", text: "Aria reached the gate." }],
      facts: Array.from({ length: n }, (_, i) => ({ id: "f" + (i + 1), text: "Aria remembers the harvest number " + (i + 1) + ".", subject: "Aria", knownBy: "all", type: "event", weight: "important", pinned: false, status: "active" })),
    });
    const ask = () => L.llmRequest({ key: "reply", request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] }, turn: { op: "send", chatId: "c1", speakerName: "Aria" } }, host);
    writeJson("litopys/chats/c1.json", record(3));
    const labels = (res: any) => res.promptSources.parts.map((p: any) => p.label);
    expect(labels(ask())).toEqual(["Litopys · full record, story so far", "Litopys · full record, facts"]);
    expect(readJson("litopys/insert/c1.json").full).toBe(true);
    // 300 facts do not fit 800 tokens: the ranked layout, and the sidecar no longer says "full"
    writeJson("litopys/chats/c1.json", record(300));
    expect(labels(ask())).toContain("Litopys · facts and earlier chapters");
    expect(readJson("litopys/insert/c1.json").full).toBeUndefined();
  });
});
