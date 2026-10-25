/**
 * The agent executor (src/canvas-kit/boards/agent-run.js): a pure, stateless run over a checked agent file.
 * The model is never called here; the tests play its answers. The same scenarios run again in a bare context
 * (the runner plugin's sandbox) and must give the same results.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import vm from "node:vm";
import mood from "./fixtures/mood-tracker.vertep-agent.json";
import keeper from "./fixtures/dungeon-keeper.vertep-agent.json";
import { validateAgent } from "../src/canvas-kit/boards/agent-check.js";
import * as run from "../src/canvas-kit/boards/agent-run.js";

type Json = Record<string, any>;
const copy = (f: unknown): any => JSON.parse(JSON.stringify(f));
const same = (x: unknown) => JSON.parse(JSON.stringify(x));

/** agent-check.js and agent-run.js as one classic script, the way the plugin carries them. */
function bundle(): Record<string, any> {
  const read = (n: string) => fs.readFileSync(new URL(`../src/canvas-kit/boards/${n}`, import.meta.url), "utf8");
  const code = read("agent-check.js") + "\n" + read("agent-run.js").replace(/^import .*$/gm, "");
  const script = code.replace(/^export /gm, "") + "\n;({ runAgent, applyWrites, parseYesNo, extractJson, ruleResult, combineRules })";
  return vm.runInContext(script, vm.createContext({})) as Record<string, any>;
}
const bare = bundle();

// every scenario goes through both copies
const both: [string, any][] = [["imported", run], ["bare context", bare]];

describe.each(both)("mood-tracker (%s)", (_name, r) => {
  const ctx = (old?: string) => ({ inputs: { lastReply: "Aria clenches her fists." }, dash: { mood: old } }); // `state` sources come from the Dashboard
  const ask = (f: Json, c: Json, text: string) => same(r.runAgent(f, c, { ask: { text } }));

  it("asks one question first, with the reply in it and the answer shape", () => {
    const res = same(r.runAgent(copy(mood), ctx("calm"), {}));
    expect(res.status).toBe("need");
    expect(res.requests).toHaveLength(1);
    expect(res.requests[0]).toMatchObject({ node: "ask", role: "fast", maxTokens: 120 });
    expect(res.requests[0].prompt).toContain("Aria clenches her fists.");
    expect(res.requests[0].prompt).toContain('"mood": "calm|tense|angry|sad"');
  });

  it("a changed mood is written", () => {
    const res = ask(copy(mood), ctx("calm"), '```json\n{"mood": "tense"}\n```');
    expect(res.status).toBe("done");
    expect(res.writes).toEqual([{ op: "dash.set", field: "mood", value: "tense" }]);
    expect(res.calls).toBe(1);
    expect(res.outputs).toEqual([{ node: "out", kind: "state-patch" }]);
  });

  it("the same mood writes nothing, and the Output does not fire", () => {
    const res = ask(copy(mood), ctx("tense"), '{"mood":"tense"}');
    expect(res.status).toBe("done");
    expect(res.writes).toEqual([]);
    expect(res.outputs).toEqual([]);
    expect(res.trace.find((s: Json) => s.node === "save").status).toBe("skipped");
  });

  it("no mood on file yet is Unknown, and Unknown still saves (the author's rule)", () => {
    const res = ask(copy(mood), ctx(undefined), '{"mood":"sad"}');
    expect(res.writes).toEqual([{ op: "dash.set", field: "mood", value: "sad" }]);
    expect(res.trace.find((s: Json) => s.node === "chg").out.verdict).toBe("unknown");
  });

  it("an answer that is not the shape stops the run with a reason", () => {
    for (const text of ["I think she is angry", '{"mood":"furious"}', '{"feeling":"calm"}']) {
      const res = ask(copy(mood), ctx("calm"), text);
      expect(res.status).toBe("failed");
      expect(res.reason).toMatch(/Read the mood/);
    }
  });

  it("a failed model call stops the run", () => {
    const res = same(r.runAgent(copy(mood), ctx("calm"), { ask: { error: "429 rate limit" } }));
    expect(res).toMatchObject({ status: "failed", node: "ask" });
    expect(res.reason).toContain("429");
  });

  it("thinking blocks in the reply are ignored", () => {
    const res = ask(copy(mood), ctx("calm"), '<think>she is {"mood":"calm"}</think>{"mood":"angry"}');
    expect(res.writes[0].value).toBe("angry");
  });

  it("no reply to read: the card that needs it is skipped, nothing is asked", () => {
    const res = same(r.runAgent(copy(mood), { inputs: {} }, {}));
    expect(res.status).toBe("done");
    expect(res.calls).toBe(0);
    expect(res.writes).toEqual([]);
  });
});

describe.each(both)("dungeon-keeper (%s)", (_name, r) => {
  const play = (mana: number, text: string) => {
    const ctx = { inputs: { msg: "I summon an imp." }, own: { mana } };
    const res = same(r.runAgent(copy(keeper), ctx, { ask: { text } }));
    return { res, after: r.applyWrites(copy(keeper).agent.state, { mana }, res.writes ?? []) };
  };
  it("YES with enough mana pays 10, counted by code", () => {
    const { res, after } = play(50, "YES\nThe player says so.");
    expect(res.writes).toEqual([{ op: "own.add", field: "mana", by: -10 }]);
    expect(same(after.own.mana)).toBe(40);
  });
  it("YES without enough mana does nothing", () => {
    const { res } = play(5, "yes");
    expect(res.writes).toEqual([]);
    expect(res.trace.find((s: Json) => s.node === "chg").out.verdict).toBe("no");
  });
  it("NO does nothing", () => {
    expect(play(50, "No. Nothing is summoned.").res.writes).toEqual([]);
  });
  it("a garbled answer is Unknown, and Unknown pays nothing", () => {
    const { res } = play(50, "Hmm, hard to say");
    expect(res.writes).toEqual([]);
    expect(res.trace.find((s: Json) => s.node === "chg").out.verdict).toBe("unknown");
  });
  it("the first run uses the schema's start (50 mana)", () => {
    const res = same(r.runAgent(copy(keeper), { inputs: { msg: "x" } }, { ask: { text: "yes" } }));
    expect(res.writes).toEqual([{ op: "own.add", field: "mana", by: -10 }]);
  });
});

describe("a file the checker passes is a file the executor can run", () => {
  it("both examples validate", () => {
    expect(validateAgent(copy(mood)).errors).toEqual([]);
    expect(validateAgent(copy(keeper)).errors).toEqual([]);
  });
});

describe("If rules", () => {
  const rr = run.ruleResult;
  it("missing data is Unknown, not No", () => {
    for (const op of ["eq", "neq", "contains", "notContains", "in"]) expect(rr("text", op, undefined, "x")).toBe("unknown");
    for (const op of ["lt", "gte", "eq", "between"]) expect(rr("number", op, undefined, 3)).toBe("unknown");
    expect(rr("flag", "isYes", "unknown", undefined)).toBe("unknown");
  });
  it("isSet and isMissing are about exactly that", () => {
    expect(rr("text", "isSet", undefined, undefined)).toBe("no");
    expect(rr("text", "isMissing", "", undefined)).toBe("yes");
    expect(rr("number", "isSet", 0, undefined)).toBe("yes");
    expect(rr("flag", "isUnknown", undefined, undefined)).toBe("yes");
  });
  it("numbers, text and lists", () => {
    expect(rr("number", "gte", 10, 10)).toBe("yes");
    expect(rr("number", "lt", 10, 10)).toBe("no");
    expect(rr("number", "between", 5, [1, 9])).toBe("yes");
    expect(rr("number", "between", 5, 3)).toBe("unknown");
    expect(rr("text", "contains", "The Dark Tower", "tower")).toBe("yes");
    expect(rr("text", "in", "b", "a, b ,c")).toBe("yes");
    expect(rr("text", "in", "z", ["a", "b"])).toBe("no");
    expect(rr("flag", "isNo", "no", undefined)).toBe("yes");
    expect(rr("text", "bogus", "a", "b")).toBe("unknown");
  });
  it("combining: a No decides all, a Yes decides any, Unknown otherwise", () => {
    const c = run.combineRules;
    expect(c("all", ["yes", "unknown"])).toBe("unknown");
    expect(c("all", ["no", "unknown"])).toBe("no");
    expect(c("any", ["no", "unknown"])).toBe("unknown");
    expect(c("any", ["yes", "unknown"])).toBe("yes");
    expect(c("none", ["no", "no"])).toBe("yes");
    expect(c("none", ["yes", "unknown"])).toBe("no");
    expect(c("all", [])).toBe("unknown");
  });
});

describe("model answers", () => {
  it("YES/NO: first word, English or Ukrainian; anything else is Unknown", () => {
    expect(run.parseYesNo("YES\nbecause").answer).toBe("yes");
    expect(run.parseYesNo("Так, звісно").answer).toBe("yes");
    expect(run.parseYesNo("**No**").answer).toBe("no");
    expect(run.parseYesNo("Ні.").answer).toBe("no");
    expect(run.parseYesNo("Nothing happened").answer).toBe("unknown");
    expect(run.parseYesNo("<think>yes</think>no").answer).toBe("no");
    expect(run.parseYesNo("").answer).toBe("unknown");
  });
  it("JSON is found inside chatter and fences", () => {
    expect(run.extractJson('Sure! ```json\n{"a": 1}\n``` done')).toEqual({ a: 1 });
    expect(run.extractJson("no braces")).toBeNull();
    expect(run.extractJson("{broken")).toBeNull();
    expect(run.extractJson("[1,2]")).toBeNull();
  });
  it("shape values: enum, number, bool, text", () => {
    const shape = { m: "enum:a|b", n: "number", ok: "bool", t: "text" };
    expect(run.shapeValues({ m: "a", n: "3", ok: true, t: 5 }, shape)).toEqual({ values: { m: "a", n: 3, ok: "yes", t: "5" } });
    expect("error" in run.shapeValues({ m: "c", n: 1, ok: true, t: "x" }, shape)).toBe(true);
    expect("error" in run.shapeValues({ m: "a", n: "x", ok: true, t: "x" }, shape)).toBe(true);
    expect("error" in run.shapeValues({ m: "a", n: 1, ok: "yes", t: "x" }, shape)).toBe(true);
  });
});

describe("applyWrites", () => {
  const schema: any = {
    mana: { type: "number", min: 0, max: 100, start: 50 },
    name: { type: "text" }, on: { type: "flag" },
    rooms: { type: "list", item: { name: "text", level: "number" }, max: 2 },
  };
  it("numbers stay inside min and max, and maxStep limits one change", () => {
    const w = (by: number, clamp?: any) => run.applyWrites(schema, { mana: 95 }, [{ op: "own.add", field: "mana", by, ...(clamp ? { clamp } : {}) }]).own.mana;
    expect(w(50)).toBe(100);
    expect(w(-500)).toBe(0);
    expect(w(-500, { maxStep: 20 })).toBe(75);
  });
  it("set checks the type", () => {
    const r = run.applyWrites(schema, {}, [
      { op: "own.set", field: "mana", value: 300 }, { op: "own.set", field: "name", value: "Rook" }, { op: "own.set", field: "on", value: true },
      { op: "own.set", field: "name", value: 5 }, { op: "own.set", field: "ghost", value: 1 },
    ] as any);
    expect(r.own).toMatchObject({ mana: 100, name: "Rook", on: true });
    expect(r.refused.map((x: Json) => x.why)).toEqual(["wrong type", "no such field"]);
  });
  it("lists: add, update by key, remove, and a full list refuses", () => {
    const w: any[] = [
      { op: "list.add", field: "rooms", item: { name: "Vault", level: 1 } },
      { op: "list.add", field: "rooms", item: { name: "Pit", level: 1 } },
      { op: "list.add", field: "rooms", item: { name: "Third", level: 1 } },
      { op: "list.update", field: "rooms", key: "name", id: "Pit", item: { name: "Pit", level: 3 } },
      { op: "list.remove", field: "rooms", key: "name", id: "Vault" },
      { op: "list.remove", field: "rooms", key: "name", id: "Nope" },
    ];
    const r = run.applyWrites(schema, {}, w);
    expect(r.own.rooms).toEqual([{ name: "Pit", level: 3 }]);
    expect(r.refused.map((x: Json) => x.why)).toEqual(["list is full", "no such entry"]);
  });
  it("does not change the state it was given", () => {
    const own = { mana: 10, rooms: [{ name: "A", level: 1 }] };
    const before = JSON.stringify(own);
    run.applyWrites(schema, own, [{ op: "own.add", field: "mana", by: 5 }, { op: "list.update", field: "rooms", key: "name", id: "A", item: { level: 9 } }] as any);
    expect(JSON.stringify(own)).toBe(before);
  });
});

describe("list cards, run end to end", () => {
  const agent = (): Json => ({
    format: "vertep-canvas", version: 1, kind: "agent", title: "Rooms",
    agent: { formatVersion: 1, id: "rooms-test", version: "1.0.0", name: "Rooms", trigger: { when: "manual" }, models: {}, limits: { maxCalls: 0 },
      state: { rooms: { type: "list", item: { name: "text", level: "number" }, max: 5 } } },
    nodes: [
      { id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give: [{ id: "who", source: "lastReply" }, { id: "lv", source: "state", field: "lv", as: "number" }] } },
      { id: "add", type: "state.list", x: 0, y: 0, title: "Add", params: { field: "rooms", op: "add", item: { name: "text", level: "number" } } },
      { id: "out", type: "agent.output", x: 0, y: 0, title: "Out", params: { kind: "state-patch" } },
    ],
    edges: [{ id: "a", from: "in:who", to: "add:name" }, { id: "b", from: "in:lv", to: "add:level" }, { id: "c", from: "add:done", to: "out:in" }],
  });
  it("adds an entry from wires", () => {
    expect(validateAgent(agent()).errors).toEqual([]);
    const res = run.runAgent(agent(), { inputs: { who: "Vault" }, dash: { lv: 2 } }, {});
    expect(res).toMatchObject({ status: "done", writes: [{ op: "list.add", field: "rooms", item: { name: "Vault", level: 2 } }] });
  });
  it("a missing value skips the card", () => {
    const res = run.runAgent(agent(), { inputs: { who: "Vault" }, dash: {} }, {}) as Json;
    expect(res.writes).toEqual([]);
  });
});
