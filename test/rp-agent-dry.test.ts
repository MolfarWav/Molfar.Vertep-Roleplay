/** The editor's trial run (src/lib/agent-dry.ts): the real executor over a made-up turn, no model, no chat. */
import { describe, expect, it } from "bun:test";
import keeper from "./fixtures/dungeon-keeper.vertep-agent.json";
import mood from "./fixtures/mood-tracker.vertep-agent.json";
import * as run from "../src/canvas-kit/boards/agent-run.js";
import { describeWrite, dryRun, exampleReply, sampleInputs, type DrySetup } from "../src/lib/agent-dry";

type Json = Record<string, any>;
const copy = (f: unknown): any => JSON.parse(JSON.stringify(f));
const setup = (file: Json, patch: Partial<DrySetup> = {}): DrySetup => ({ inputs: sampleInputs(file as any), own: {}, replies: {}, chat: { messageCount: 4, lastSpeaker: "Ember" }, ...patch });

describe("sampleInputs and exampleReply", () => {
  it("gives text for a chat source and nothing for a Dashboard field", () => {
    const s = sampleInputs(mood as any);
    expect(s.lastReply).toContain("guard");
    expect(s.oldMood).toBe("");
    expect(sampleInputs(keeper as any).msg.length).toBeGreaterThan(5);
  });
  it("answers in the format the card asks for", () => {
    const ask = (keeper.nodes as Json[]).find((n) => n.id === "ask")!;
    expect(run.parseYesNo(exampleReply(ask)).answer).toBe("yes");
    const json = (mood.nodes as Json[]).find((n) => n.id === "ask")!;
    expect(JSON.parse(exampleReply(json))).toEqual({ mood: "calm" });
    expect(exampleReply({ params: { answer: { as: "text" } } })).toContain("example");
  });
});

describe("describeWrite", () => {
  it("says a write in one short line", () => {
    expect(describeWrite({ op: "own.add", field: "mana", by: -10 })).toBe("mana −10");
    expect(describeWrite({ op: "own.add", field: "mana", by: 3 })).toBe("mana +3");
    expect(describeWrite({ op: "dash.set", field: "mood", value: "tense" })).toBe("mood = tense");
    expect(describeWrite({ op: "list.add", field: "rooms", item: { name: "Cellar", level: 1 } })).toBe('rooms + {"name":"Cellar","level":1}');
    expect(describeWrite({ op: "list.remove", field: "rooms", id: "Cellar" })).toBe("rooms − Cellar");
    expect(describeWrite({ op: "own.set", field: "note", value: "x".repeat(100) }).length).toBeLessThan(80);
  });
});

describe("dryRun", () => {
  it("runs the whole agent on examples and says what every wire carried", () => {
    const r = dryRun(keeper as any, setup(keeper));
    expect(r.status).toBe("done");
    expect(r.calls).toBe(1);
    expect(r.asked).toHaveLength(1);
    expect(r.asked[0]!.example).toBe(true);
    expect(r.wires["in:msg"]).toEqual({ state: "value", value: expect.any(String) });
    expect(r.wires["ask:answer"]).toEqual({ state: "value", value: "yes" });
    expect(r.wires["mana:value"]).toEqual({ state: "value", value: 50 });
    expect(r.wires["chg:yes"]).toEqual({ state: "value", value: true });
    expect(r.wires["chg:no"]).toEqual({ state: "skip" });
    expect(r.nodes.pay).toBe("ran");
    expect(r.ownWrites[0]).toMatchObject({ op: "own.add", field: "mana", by: -10 });
    expect(r.ownAfter.mana).toBe(40);
  });
  it("follows the answer the person types", () => {
    const r = dryRun(keeper as any, setup(keeper, { replies: { ask: "NO\nNothing of the kind." } }));
    expect(r.asked[0]).toMatchObject({ reply: "NO\nNothing of the kind.", example: false });
    expect(r.wires["ask:answer"]).toEqual({ state: "value", value: "no" });
    expect(r.nodes.pay).toBe("skipped");
    expect(r.ownWrites).toEqual([]);
    expect(r.ownAfter.mana).toBe(50);
  });
  it("starts from the memory the person sets, and clamps like the real run", () => {
    const r = dryRun(keeper as any, setup(keeper, { own: { mana: 5 } }));
    expect(r.wires["mana:value"]).toEqual({ state: "value", value: 5 });
    expect(r.wires["chg:yes"]).toEqual({ state: "skip" });
    expect(r.ownAfter.mana).toBe(5);
  });
  it("a reply the card cannot read fails the run, naming the card", () => {
    const r = dryRun(mood as any, setup(mood, { replies: { ask: "I feel nothing in particular." } }));
    expect(r.status).toBe("failed");
    expect(r.node).toBe("ask");
    expect(r.reason).toContain("JSON");
    expect(r.nodes.ask).toBe("failed");
  });
  it("an empty Dashboard field is missing data, not a value", () => {
    const r = dryRun(mood as any, setup(mood));
    expect(r.wires["in:oldMood"]).toEqual({ state: "missing" });
    expect(r.status).toBe("done");
    expect(r.dashWrites[0]).toMatchObject({ op: "dash.set", field: "mood" });
    expect(r.ownWrites).toEqual([]);
  });
  it("never changes the file or the setup it was given", () => {
    const f = copy(keeper);
    const s = setup(f, { own: { mana: 70 } });
    const before = JSON.stringify([f, s]);
    dryRun(f, s);
    expect(JSON.stringify([f, s])).toBe(before);
  });
  it("without `explain` the executor returns no wires", () => {
    const r: Json = run.runAgent(copy(keeper), { inputs: { msg: "x" }, own: {} }, {});
    expect(r.wires).toBeUndefined();
  });
});

// ---------- the code cards: dice, pick, extract, cut, and the new Input sources ----------

const oneOut = (middle: Json[], edges: Json[], give: Json[] = [{ id: "reply", source: "lastReply" }]): Json => ({
  format: "vertep-canvas", version: 1, kind: "agent", title: "t",
  agent: { formatVersion: 1, id: "t", version: "1.0.0", name: "t", description: "", author: "t", trigger: { when: "after", everyN: 1, keywords: [] }, limits: { maxCalls: 0, concurrency: 1 } },
  nodes: [{ id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give } }, ...middle, { id: "out", type: "agent.output", x: 900, y: 0, title: "Output", params: { kind: "note", title: "Out" } }],
  edges,
});
const diceAgent = (): Json => oneOut(
  [{ id: "dice", type: "random.dice", x: 300, y: 0, title: "Dice", params: { count: 2, sides: 6, bonus: 1 } }],
  [{ id: "e1", from: "dice:rolls", to: "out:in" }],
);

describe("the new Input sources", () => {
  it("sampleInputs gives fact lines and lorebook lines", () => {
    const f = oneOut([], [], [{ id: "facts", source: "litopysFacts", limit: 5 }, { id: "lore", source: "lorebook" }]);
    const s = sampleInputs(f as any);
    expect(s.facts.split("\n").length).toBeGreaterThanOrEqual(2);
    expect(s.facts.split("\n").every((l) => l.startsWith("- "))).toBe(true);
    const lore = s.lore.split("\n");
    expect(lore.length).toBeGreaterThanOrEqual(2);
    expect(lore.every((l) => /^- [^:]+: .+/.test(l))).toBe(true);
  });
});

describe("dryRun with a seed", () => {
  const rollOf = (seed: string | undefined, f: Json = diceAgent()) => {
    const r = dryRun(f as any, setup(f, { seed }));
    expect(r.status).toBe("done");
    return String(r.outputs[0]!.text);
  };
  it("the same seed rolls the same, and another seed rolls differently", () => {
    expect(rollOf("a")).toBe(rollOf("a"));
    expect(rollOf(undefined)).toBe(rollOf(undefined));
    expect(rollOf(undefined)).toBe(rollOf(""));
    const seen = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((x) => rollOf(x)));
    expect(seen.size).toBeGreaterThan(1);
  });
  it("editing a field of another card does not move the roll", () => {
    const f = diceAgent();
    const g = copy(f);
    g.nodes.find((n: Json) => n.id === "out").params.title = "Another title";
    expect(rollOf("a", g)).toBe(rollOf("a", f));
  });
  it("a pick follows the seed and the weights", () => {
    const f = oneOut(
      [{ id: "pick", type: "random.pick", x: 300, y: 0, title: "Pick", params: { items: [{ text: "rare", weight: 1 }, { text: "common", weight: 99 }] } }],
      [{ id: "e1", from: "pick:text", to: "out:in" }],
    );
    const picks = Array.from({ length: 30 }, (_, i) => rollOf(`s${i}`, f));
    expect(picks.every((x) => x === "rare" || x === "common")).toBe(true);
    expect(picks.filter((x) => x === "common").length).toBeGreaterThan(20);
    expect(rollOf("s1", f)).toBe(rollOf("s1", f));
  });
});

describe("Extract and Cut in a trial", () => {
  const extractAgent = (): Json => oneOut(
    [{ id: "get", type: "text.extract", x: 300, y: 0, title: "Extract", params: { pattern: "\\[MEMORY\\]:\\s*(.+)", group: 1 } }],
    [{ id: "e1", from: "in:reply", to: "get:in" }, { id: "e2", from: "get:match", to: "out:in" }],
  );
  it("shows the match, and skips the path when there is none", () => {
    const f = extractAgent();
    const hit = dryRun(f as any, setup(f, { inputs: { reply: "Fine.\n[MEMORY]: the key is under the mat" } }));
    expect(hit.status).toBe("done");
    expect(hit.outputs[0]!.text).toBe("the key is under the mat");
    const miss = dryRun(f as any, setup(f, { inputs: { reply: "Nothing to remember." } }));
    expect(miss.outputs).toEqual([]);
    expect(miss.nodes.out).toBe("skipped");
    expect(miss.wires["get:none"]).toEqual({ state: "value", value: true });
  });
  it("Cut keeps the last words", () => {
    const f = oneOut(
      [{ id: "cut", type: "text.cut", x: 300, y: 0, title: "Cut", params: { keep: "last", unit: "words", n: 5 } }],
      [{ id: "e1", from: "in:reply", to: "cut:in" }, { id: "e2", from: "cut:text", to: "out:in" }],
    );
    const r = dryRun(f as any, setup(f, { inputs: { reply: "one two three four five six seven" } }));
    expect(r.outputs[0]!.text).toBe("three four five six seven");
  });
});
