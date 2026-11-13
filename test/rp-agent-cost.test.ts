import { describe, expect, it } from "bun:test";
import { cadenceOf, replyCost } from "../src/lib/agent-cost";
import type { AgentInfo, ChatAgentItem } from "../src/lib/agents";

const info = (id: string, cost: AgentInfo["cost"], extra: Partial<AgentInfo> = {}): AgentInfo => ({ id, trigger: { when: "after", everyN: 1 }, cost, ...extra } as unknown as AgentInfo);
const item = (agent: string, extra: Partial<ChatAgentItem> = {}): ChatAgentItem => ({ agent, on: true, show: null, ...extra } as ChatAgentItem);

describe("what the chat's agents cost for one reply (#396)", () => {
  it("the person's own cadence beats the author's, the author's beats every reply", () => {
    expect(cadenceOf({ trigger: { when: "after" }, own: undefined })).toBe(1);
    expect(cadenceOf({ trigger: { when: "after", everyN: 3 }, own: undefined })).toBe(3);
    expect(cadenceOf({ trigger: { when: "after", everyN: 3 }, own: { models: {}, maxCalls: 0, everyN: 2 } })).toBe(2);
  });

  it("adds the agents that are on, spreading each one's cost over its cadence", () => {
    const list = [
      info("a", { calls: 1, tokensIn: 600, tokensOut: 100 }),
      info("b", { calls: 3, tokensIn: 900, tokensOut: 300 }, { trigger: { when: "after", everyN: 3 } as never }),
      info("off", { calls: 5, tokensIn: 5000, tokensOut: 500 }),
    ];
    const r = replyCost([item("a"), item("b"), item("off", { on: false })], list);
    expect(r.agents).toBe(2);
    expect(r.calls).toBeCloseTo(1 + 1, 5); // 1 call a reply + 3 calls every third reply
    expect(r.tokens).toBeCloseTo(700 + 400, 5);
    expect(r.unknown).toBe(0);
  });

  it("leaves out an agent that has no estimate or is not installed, and counts it as unknown; a hand-only agent adds nothing", () => {
    const list = [info("a", { calls: 1, tokensIn: 100, tokensOut: 100 }), info("nocost", undefined), info("hand", { calls: 2, tokensIn: 100, tokensOut: 100 }, { trigger: { when: "manual" } as never })];
    const r = replyCost([item("a"), item("nocost"), item("ghost"), item("hand")], list);
    expect(r).toMatchObject({ agents: 1, unknown: 2, calls: 1, tokens: 200 });
    // the chat's own phase beats the file's: a "before" agent moved to by-hand costs nothing
    expect(replyCost([item("a", { phase: "manual" })], list).agents).toBe(0);
  });

  it("says nothing before the installed list is read", () => {
    expect(replyCost([item("a")], undefined)).toMatchObject({ agents: 0, unknown: 1 });
  });
});
