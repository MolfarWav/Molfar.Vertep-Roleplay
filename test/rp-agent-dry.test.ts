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
