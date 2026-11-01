import { describe, expect, it } from "bun:test";
import { modelLines, permissionRows, previewKey, startDraft, stillWaiting, tokensToSend, trimDraft } from "../src/lib/agent-permissions";

const agent = (over: Record<string, unknown> = {}) => ({
  needs: ["llm", "read:history", "write:prompt", "show:note"], granted: [] as string[], unsupported: [] as string[],
  models: { fast: { hint: "cheap" }, main: {} } as Record<string, { hint?: string }>, own: { models: {} as Record<string, string>, maxCalls: 0 },
  ...over,
});

describe("permission rows", () => {
  it("a fresh install has nothing allowed and nothing marked new", () => {
    const rows = permissionRows(agent());
    expect(rows.map((r) => r.granted)).toEqual([false, false, false, false]);
    expect(rows.some((r) => r.isNew)).toBe(false);
    expect(startDraft(agent())).toEqual([]);
  });
  it("an update marks only the permissions it adds", () => {
    const a = agent({ granted: ["llm", "read:history"] });
    expect(permissionRows(a).filter((r) => r.isNew).map((r) => r.token)).toEqual(["write:prompt", "show:note"]);
    expect(startDraft(a)).toEqual(["llm", "read:history"]);
  });
  it("an unsupported permission shows but is never switched on or sent", () => {
    const a = agent({ unsupported: ["write:prompt"] });
    expect(permissionRows(a)[2]).toMatchObject({ token: "write:prompt", supported: false, isNew: false });
    expect(tokensToSend(a, ["llm", "write:prompt", "show:note"])).toEqual(["llm", "show:note"]);
    expect(stillWaiting(a, ["llm", "read:history", "show:note"])).toEqual([]);
  });
});

describe("what is sent", () => {
  it("is the draft in the agent's order, without strangers", () => {
    expect(tokensToSend(agent(), ["show:note", "llm", "write:fire"])).toEqual(["llm", "show:note"]);
  });
  it("says what the agent would still wait for", () => {
    expect(stillWaiting(agent(), ["llm"])).toEqual(["read:history", "write:prompt", "show:note"]);
    expect(stillWaiting(agent(), agent().needs)).toEqual([]);
  });
  it("an update that drops a permission drops its switch", () => {
    expect(trimDraft(agent({ needs: ["llm", "show:note"] }), ["llm", "read:history", "show:note"])).toEqual(["llm", "show:note"]);
  });
});

describe("the preview stands for the models too", () => {
  it("lists a role with no model as the default", () => {
    expect(modelLines(agent())).toEqual([{ role: "fast", ref: null }, { role: "main", ref: null }]);
    expect(modelLines(agent({ own: { models: { fast: "openrouter/x" }, maxCalls: 0 } }))[0]).toEqual({ role: "fast", ref: "openrouter/x" });
  });
  it("changes when a role's model changes, and when the permissions change, but not when a limit does", () => {
    const base = previewKey(agent());
    expect(previewKey(agent({ own: { models: { main: "p/m" }, maxCalls: 0 } }))).not.toBe(base);
    expect(previewKey(agent({ needs: ["llm"] }))).not.toBe(base);
    expect(previewKey(agent({ own: { models: {}, maxCalls: 5 } }))).toBe(base);
  });
});
