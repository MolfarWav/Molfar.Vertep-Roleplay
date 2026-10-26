/** The Agent sets screen's arithmetic (src/lib/agent-sets.ts): lanes, what a turn costs from real runs, edits. */
import { describe, expect, it } from "bun:test";
import { costsFromRuns, freeName, inLane, laneOf, putInLane, sameItems, setsWith, simulate, GUESS_CALL_MS } from "../src/lib/agent-sets";
import type { AgentInfo, AgentRun } from "../src/lib/agents";

const info = (id: string, when?: AgentInfo["trigger"]["when"], maxCalls = 1): AgentInfo => ({
  id, name: id, description: "", author: "", version: "1.0.0", trigger: when ? { when } : {}, needs: [], granted: [], missing: [], unsupported: [],
  maxCalls, errors: [], warnings: [], runnable: true, blocker: "",
});
const run = (agent: string, ms: number, calls = 1, at = 1, status: "ok" | "failed" = "ok"): AgentRun => ({ agent, key: `m${at}#0`, at, ms, status, calls });

describe("laneOf", () => {
  it("takes the set's phase, else the agent's own trigger, else after", () => {
    expect(laneOf({ agent: "a", on: true, phase: "before" }, info("a", "after"))).toBe("before");
    expect(laneOf({ agent: "a", on: true }, info("a", "parallel"))).toBe("parallel");
    expect(laneOf({ agent: "a", on: true }, info("a"))).toBe("after");
    expect(laneOf({ agent: "a", on: true }, undefined)).toBe("after");
  });
  it("puts a before agent that does not make the reply wait beside the reply", () => {
    expect(laneOf({ agent: "a", on: true, phase: "before", wait: false }, info("a"))).toBe("parallel");
    expect(laneOf({ agent: "a", on: true, wait: false }, info("a", "before"))).toBe("parallel");
  });
});

describe("costsFromRuns", () => {
  it("takes the median of the good runs and ignores failed ones", () => {
    const c = costsFromRuns([run("a", 1000, 1, 1), run("a", 3000, 1, 2), run("a", 2000, 1, 3), run("a", 90000, 1, 4, "failed")], [info("a")]);
    expect(c.byAgent.get("a")).toEqual({ ms: 2000, calls: 1, known: true });
  });
  it("guesses an agent with no runs from its calls and the chat's call time", () => {
    const c = costsFromRuns([run("a", 3000, 2)], [info("a"), info("b", undefined, 3)]);
    expect(c.callMs).toBe(1500);
    expect(c.byAgent.get("b")).toEqual({ ms: 4500, calls: 3, known: false });
  });
  it("falls back to a fixed call time with no runs at all", () => {
    expect(costsFromRuns([], [info("b", undefined, 2)]).byAgent.get("b")).toEqual({ ms: 2 * GUESS_CALL_MS, calls: 2, known: false });
  });
});

describe("simulate", () => {
  const infos = [info("plan", "before"), info("judge", "parallel"), info("mood", "after"), info("btn", "manual")];
  const costs = costsFromRuns([run("plan", 1200), run("judge", 2400), run("mood", 2000)], infos);
  const items = infos.map((a) => ({ agent: a.id, on: true }));

  it("makes the reply wait for the before agents, not for the others", () => {
    const t = simulate(items, infos, costs, 6000);
    expect(t.waitMs).toBe(1200);
    expect(t.reply).toEqual({ from: 1200, to: 7200 });
    expect(t.turnMs).toBe(7200);
    const by = Object.fromEntries(t.bars.map((b) => [b.agent, b]));
    expect(by.judge).toMatchObject({ from: 0, to: 2400 });
    expect(by.mood).toMatchObject({ from: 7200, to: 9200 });
    expect(by.btn).toBeUndefined();
    expect(t.end).toBe(9200);
    expect(t.calls).toBe(4);
  });
  it("shortens the wait when the before agent is moved beside the reply, and skips off agents", () => {
    const moved = items.map((it) => (it.agent === "plan" ? inLane(it, "parallel") : it.agent === "mood" ? { ...it, on: false } : it));
    const t = simulate(moved, infos, costs, 6000);
    expect(t.waitMs).toBe(0);
    expect(t.turnMs).toBe(6000);
    expect(t.bars.map((b) => b.agent).sort()).toEqual(["judge", "plan"]);
    expect(t.calls).toBe(3);
  });
  it("counts an empty set as just the reply", () => {
    const t = simulate([], infos, costs, 6000);
    expect(t).toMatchObject({ waitMs: 0, turnMs: 6000, end: 6000, calls: 1, bars: [] });
  });
});

describe("edits", () => {
  it("moves an agent to a lane and drops its wait switch; adds an agent that is not in the set", () => {
    const items = [{ agent: "a", on: true, phase: "before" as const, wait: false }];
    expect(putInLane(items, "a", "after")).toEqual([{ agent: "a", on: true, phase: "after" }]);
    expect(putInLane(items, "b", "before")).toEqual([...items, { agent: "b", on: true, phase: "before" }]);
  });
  it("puts an agent beside the reply as before with the wait switch off, which the lane reads back as beside", () => {
    const moved = putInLane([{ agent: "a", on: true, phase: "after" as const }], "a", "parallel");
    expect(moved).toEqual([{ agent: "a", on: true, phase: "before", wait: false }]);
    expect(laneOf(moved[0]!, info("a"))).toBe("parallel");
  });
  it("sameItems tells a change from none", () => {
    expect(sameItems([{ agent: "a", on: true }], [{ agent: "a", on: true }])).toBe(true);
    expect(sameItems([{ agent: "a", on: true }], [{ agent: "a", on: false }])).toBe(false);
  });
  it("freeName counts up past taken names, ignoring case", () => {
    expect(freeName("RP", ["rp", "RP 2"])).toBe("RP 3");
    expect(freeName("New", [])).toBe("New");
  });
  it("setsWith lists the sets that hold an agent", () => {
    const sets = [{ id: "x", name: "X", items: [{ agent: "a", on: true }] }, { id: "y", name: "Y", items: [] }];
    expect(setsWith(sets, "a").map((s) => s.id)).toEqual(["x"]);
  });
});
