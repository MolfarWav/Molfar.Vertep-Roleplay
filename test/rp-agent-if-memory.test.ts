/**
 * The If card's memory (#155 part 3): edge, once, cooldown and the "changed" rule, and the reason chain in the run log.
 * The executor is pure: the host hands back what the last run returned as `ctx.memo`, with the run count `ctx.n`.
 * Every scenario goes through both copies (imported and the bare context of the runner plugin), like rp-agent-run.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import vm from "node:vm";
import { validateAgent } from "../src/canvas-kit/boards/agent-check.js";
import * as run from "../src/canvas-kit/boards/agent-run.js";

type Json = Record<string, any>;

function bundle(): Record<string, any> {
  const read = (n: string) => fs.readFileSync(new URL(`../src/canvas-kit/boards/${n}`, import.meta.url), "utf8");
  const code = read("agent-check.js") + "\n" + read("agent-run.js").replace(/^import .*$/gm, "");
  const script = code.replace(/^export /gm, "") + "\n;({ runAgent, validateAgent })";
  return vm.runInContext(script, vm.createContext({})) as Record<string, any>;
}
const both: [string, any][] = [["imported", run], ["bare context", bundle()]];

/** Input (the Dashboard's comfort) -> If (rows) -> yes -> add 1 to `hits`. */
function agent(ifParams: Json): Json {
  return {
    format: "vertep-canvas", version: 1, kind: "agent", title: "Gate",
    agent: { formatVersion: 1, id: "gate", version: "1.0.0", name: "Gate", description: "x", author: "t", trigger: { when: "after", everyN: 1, keywords: [] }, models: {}, limits: { maxCalls: 0, concurrency: 1 }, state: { hits: { type: "number", min: 0, max: 100, start: 0 } } },
    nodes: [
      { id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give: [{ id: "lvl", source: "state", field: "comfort", as: "number" }] } },
      { id: "chk", type: "logic.if", x: 200, y: 0, title: "Check", params: { inputs: [{ id: "lvl", type: "number" }], match: "all", rows: [{ left: { from: "wire", port: "lvl" }, op: "lt", right: { value: 20 } }], ...ifParams } },
      { id: "add", type: "state.add", x: 400, y: 0, title: "Count", params: { field: "hits", amount: 1 } },
      { id: "out", type: "agent.output", x: 600, y: 0, title: "Out", params: { kind: "state-patch" } },
    ],
    edges: [
      { id: "e1", from: "in:lvl", to: "chk:lvl" },
      { id: "e2", from: "chk:yes", to: "add:when" },
      { id: "e3", from: "add:done", to: "out:in" },
    ],
  };
}

/** Runs the agent once per comfort value, handing the memo on; returns the run numbers that counted a hit. */
function fires(r: any, f: Json, values: (number | undefined)[]): number[] {
  let memo: Json = {};
  const hit: number[] = [];
  values.forEach((v, i) => {
    const res = JSON.parse(JSON.stringify(r.runAgent(f, { inputs: {}, dash: { comfort: v }, memo, n: i + 1 }, {})));
    expect(res.status).toBe("done");
    memo = res.memo;
    if (res.writes.length) hit.push(i + 1);
  });
  return hit;
}

describe.each(both)("If memory (%s)", (_name, r) => {
  it("without options it fires every time and keeps no memory", () => {
    const f = agent({});
    expect(fires(r, f, [10, 10, 30, 10])).toEqual([1, 2, 4]);
    expect(JSON.parse(JSON.stringify(r.runAgent(f, { inputs: {}, dash: { comfort: 10 } }, {}))).memo).toEqual({});
  });

  it("edge fires only when the condition turns from false to true", () => {
    expect(fires(r, agent({ edge: true }), [30, 10, 10, 30, 10, 10])).toEqual([2, 5]);
    expect(fires(r, agent({ edge: true }), [10, 10, 10])).toEqual([1]); // true from the start counts as a rise
  });

  it("once fires the first time it is true and never again", () => {
    expect(fires(r, agent({ once: true }), [30, 10, 30, 10, 10])).toEqual([2]);
  });

  it("cooldown holds a true condition back for that many runs", () => {
    expect(fires(r, agent({ cooldown: 2 }), [10, 10, 10, 10, 10, 10, 10])).toEqual([1, 4, 7]);
    expect(fires(r, agent({ cooldown: 2 }), [10, 30, 30, 10, 10])).toEqual([1, 4]);
  });

  it("edge and cooldown together: both must allow it", () => {
    expect(fires(r, agent({ edge: true, cooldown: 3 }), [10, 30, 10, 30, 30, 10])).toEqual([1, 6]);
  });

  it("an unknown answer does not break an edge: missing data keeps what was seen", () => {
    expect(fires(r, agent({ edge: true }), [10, undefined, 10])).toEqual([1]);
    expect(fires(r, agent({ edge: true }), [30, undefined, 10])).toEqual([3]);
  });

  it("the changed rule is true when the value differs from the last run", () => {
    const f = agent({ rows: [{ left: { from: "wire", port: "lvl" }, op: "changed" }] });
    expect(fires(r, f, [10, 10, 15, 15, 20, undefined, 20])).toEqual([3, 5]);
  });

  it("a held run says why, a fired run lists the rules it read", () => {
    const f = agent({ edge: true });
    const first = JSON.parse(JSON.stringify(r.runAgent(f, { inputs: {}, dash: { comfort: 10 }, memo: {}, n: 1 }, {})));
    const step = first.trace.find((t: Json) => t.node === "chk");
    expect(step.status).toBe("ran");
    expect(step.out.why).toBe("lvl (10) lt 20 = yes");
    const again = JSON.parse(JSON.stringify(r.runAgent(f, { inputs: {}, dash: { comfort: 10 }, memo: first.memo, n: 2 }, {})));
    const held = again.trace.find((t: Json) => t.node === "chk");
    expect(held).toMatchObject({ status: "skipped", out: { verdict: "yes", held: "edge: it was already true last time" } });
    expect(held.out.why).toContain("lvl (10) lt 20 = yes");
    expect(again.writes).toEqual([]);
  });

  it("the memory of a card that is gone is dropped, and a missing memo starts fresh", () => {
    const f = agent({ once: true });
    const res = JSON.parse(JSON.stringify(r.runAgent(f, { inputs: {}, dash: { comfort: 10 }, memo: { chk: { fired: 1 }, ghost: { fired: 3 } }, n: 5 }, {})));
    expect(Object.keys(res.memo)).toEqual(["chk"]);
    expect(res.writes).toEqual([]);
  });

  it("the same memo and run number give the same result (a regenerated reply replays the run)", () => {
    const f = agent({ cooldown: 2 });
    const memo = { chk: { last: "yes", fired: 1, count: 1 } };
    const a = JSON.parse(JSON.stringify(r.runAgent(f, { inputs: {}, dash: { comfort: 10 }, memo, n: 3 }, {})));
    const b = JSON.parse(JSON.stringify(r.runAgent(f, { inputs: {}, dash: { comfort: 10 }, memo, n: 3 }, {})));
    expect(a).toEqual(b);
    expect(memo).toEqual({ chk: { last: "yes", fired: 1, count: 1 } }); // the caller's memo is never touched
  });
});

describe("If options in the checker", () => {
  const codes = (f: Json) => validateAgent(f).errors.map((e: Json) => e.code);
  it("accepts the options and the changed rule", () => {
    expect(codes(agent({ edge: true, once: false, cooldown: 3 }))).toEqual([]);
    expect(codes(agent({ rows: [{ left: { from: "wire", port: "lvl" }, op: "changed" }] }))).toEqual([]);
  });
  it("refuses a wrong type or a cooldown outside 0..50", () => {
    expect(codes(agent({ edge: "yes" }))).toContain("E_IF_FIRE");
    expect(codes(agent({ once: 1 }))).toContain("E_IF_FIRE");
    expect(codes(agent({ cooldown: 51 }))).toContain("E_IF_FIRE");
    expect(codes(agent({ cooldown: 1.5 }))).toContain("E_IF_FIRE");
    expect(codes(agent({ cooldown: -1 }))).toContain("E_IF_FIRE");
  });
});
