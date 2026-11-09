/**
 * An If rule that reads the World DM's dice (#155): the executor side. The host hands over `ctx.dice`
 * ({ fate|life|pace: { rolled: "yes"|"no", outcome? } }); a rule reads "rolled" (a flag) or "outcome" (text).
 * Every scenario goes through both copies (imported and the bare context of the runner plugin).
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import vm from "node:vm";
import * as run from "../src/canvas-kit/boards/agent-run.js";

type Json = Record<string, any>;

function bundle(): Record<string, any> {
  const read = (n: string) => fs.readFileSync(new URL(`../src/canvas-kit/boards/${n}`, import.meta.url), "utf8");
  const code = read("agent-check.js") + "\n" + read("agent-run.js").replace(/^import .*$/gm, "");
  const script = code.replace(/^export /gm, "") + "\n;({ runAgent })";
  return vm.runInContext(script, vm.createContext({})) as Record<string, any>;
}
const both: [string, any][] = [["imported", run], ["bare context", bundle()]];

/** Input -> If (one rule on a die) -> yes -> add 1 to `hits`. */
function agent(rule: Json): Json {
  return {
    format: "vertep-canvas", version: 1, kind: "agent", title: "Dice reader",
    agent: { formatVersion: 1, id: "dice-reader", version: "1.0.0", name: "Dice reader", description: "x", author: "t", trigger: { when: "after", everyN: 1, keywords: [] }, models: {}, limits: { maxCalls: 0, concurrency: 1 }, state: { hits: { type: "number", min: 0, max: 100, start: 0 } } },
    nodes: [
      { id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give: [] } },
      { id: "chk", type: "logic.if", x: 200, y: 0, title: "Check", params: { inputs: [], match: "all", rows: [rule] } },
      { id: "add", type: "state.add", x: 400, y: 0, title: "Count", params: { field: "hits", amount: 1 } },
      { id: "out", type: "agent.output", x: 600, y: 0, title: "Out", params: { kind: "state-patch" } },
    ],
    edges: [
      { id: "e2", from: "chk:yes", to: "add:when" },
      { id: "e3", from: "add:done", to: "out:in" },
    ],
  };
}
const go = (r: any, f: Json, dice?: Json): Json => JSON.parse(JSON.stringify(r.runAgent(f, { inputs: {}, dice, n: 1 }, {})));

describe.each(both)("If rules on the dice (%s)", (_name, r) => {
  it("rolled is a flag: yes when that die put a note into this reply", () => {
    const f = agent({ left: { from: "dice", die: "pace", what: "rolled" }, op: "isYes" });
    expect(go(r, f, { pace: { rolled: "yes", outcome: "miss" } }).writes.length).toBe(1);
    expect(go(r, f, { pace: { rolled: "no" } }).writes).toEqual([]);
    expect(go(r, f, undefined).writes).toEqual([]); // the host gave no dice: nothing rolled
  });

  it("outcome is text: it can be matched, and a die that did not roll is unknown", () => {
    const f = agent({ left: { from: "dice", die: "pace", what: "outcome" }, op: "in", right: { value: ["miss", "no_but"] } });
    expect(go(r, f, { pace: { rolled: "yes", outcome: "no_but" } }).writes.length).toBe(1);
    expect(go(r, f, { pace: { rolled: "yes", outcome: "full" } }).writes).toEqual([]);
    expect(go(r, f, { pace: { rolled: "no" } }).writes).toEqual([]);
  });

  it("each die is read by its own name", () => {
    const f = agent({ left: { from: "dice", die: "life", what: "outcome" }, op: "eq", right: { value: "major" } });
    expect(go(r, f, { fate: { rolled: "yes", outcome: "major" }, life: { rolled: "yes", outcome: "major" } }).writes.length).toBe(1);
    expect(go(r, f, { fate: { rolled: "yes", outcome: "major" }, life: { rolled: "yes", outcome: "minor" } }).writes).toEqual([]);
  });

  it("the run log names what was read", () => {
    const f = agent({ left: { from: "dice", die: "pace", what: "outcome" }, op: "eq", right: { value: "miss" } });
    const res = go(r, f, { pace: { rolled: "yes", outcome: "miss" } });
    expect(res.trace.find((t: Json) => t.node === "chk").out.why).toBe('pace die outcome ("miss") eq "miss" = yes');
  });
});
