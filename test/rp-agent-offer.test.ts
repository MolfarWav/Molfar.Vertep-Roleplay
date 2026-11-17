/**
 * The offer of ready agents in the new-chat step (Molfar.Vertep#396 item 0): the plugin's POST /agents/inspect (what a file
 * would be, writes nothing) and the pure rules of the step (the order, the suggested three, what the chat starts with).
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AGENT_RECIPES } from "../src/lib/forge-recipes";
import { chatAgentsWith, needsAllowing, STARTER_ORDER, SUGGESTED, starterFiles, usable } from "../src/lib/agent-offer";

const plugin = (await import(new URL("../plugins/agents/plugin.js", import.meta.url).href)) as typeof import("../plugins/agents/plugin.js");

type Json = Record<string, any>;
let root: string;
let withScripts = true;
const host = () => ({
  fs: {
    root,
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
  store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
  llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  ...(withScripts ? { script: { request: () => {}, results: {} } } : {}),
  log: () => {},
});
const call = (method: string, p: string, body?: unknown) =>
  plugin.handleRoute({ method, path: p, query: {}, body } as never, host() as never) as { status?: number; json?: Json };
const inspect = (files: unknown[]) => call("POST", "/agents/inspect", { files });
const byId = (id: string) => AGENT_RECIPES.find((f) => f.agent?.id === id)!;

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "offer-")); withScripts = true; });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("POST /agents/inspect", () => {
  it("reports every recipe with its cost and needs, and writes nothing", () => {
    const r = inspect(AGENT_RECIPES);
    const rows = r.json!.agents as Json[];
    expect(rows.length).toBe(AGENT_RECIPES.length);
    for (const row of rows) {
      expect(row.error).toBeUndefined();
      expect(row.installed).toBe(false);
      expect(row.needs.length).toBeGreaterThan(0);
      expect(row.cost.calls).toBe(row.maxCalls);
    }
    expect(rows.find((x) => x.id === "repetition-guard")!.cost.calls).toBe(0);
    expect(rows.find((x) => x.id === "repetition-guard")!.needs).toContain("run:code");
    expect(rows.find((x) => x.id === "next-moves-ai")!.cost.calls).toBe(1);
    expect(fs.existsSync(path.join(root, "agents"))).toBe(false);
  });

  it("says a Script agent cannot be used where the engine has no script runner", () => {
    withScripts = false;
    const row = (inspect([byId("repetition-guard"), byId("next-moves-ai")]).json!.agents as Json[]);
    expect(row[0].scriptsMissing).toBe(true);
    expect(usable(row[0] as never)).toBe(false);
    expect(row[1].scriptsMissing).toBe(false);
    expect(usable(row[1] as never)).toBe(true);
  });

  it("an installed agent shows as installed, and what it still lacks as missing", () => {
    const file = byId("scene-recap");
    const put = call("PUT", "/agents/install", { file });
    expect(put.json!.ok).toBe(true);
    let row = (inspect([file]).json!.agents as Json[])[0];
    expect(row.installed).toBe(true);
    expect(row.missing.length).toBeGreaterThan(0);
    expect(needsAllowing(row as never).length).toBe(row.missing.length);
    call("PUT", "/agents/install", { file, grant: true });
    row = (inspect([file]).json!.agents as Json[])[0];
    expect(row.missing).toEqual([]);
    expect(row.granted.length).toBe(row.needs.length);
  });

  it("refuses a body without files and marks a bad file instead of failing the rest", () => {
    expect(call("POST", "/agents/inspect", {}).status).toBe(400);
    const rows = inspect([{ nope: true }, byId("scene-recap")]).json!.agents as Json[];
    expect(rows[0].error).toBeTruthy();
    expect(rows[1].id).toBe("scene-recap");
  });

  it("looks at no more than 20 files", () => {
    const many = Array.from({ length: 30 }, () => byId("scene-recap"));
    expect((inspect(many).json!.agents as Json[]).length).toBe(20);
  });
});

describe("the offer's rules", () => {
  it("lists the recipes in the set order and leaves the portrait out of a group", () => {
    const ids = starterFiles(AGENT_RECIPES, false).map((f) => f.agent?.id);
    expect(ids).toEqual(STARTER_ORDER.filter((id) => AGENT_RECIPES.some((f) => f.agent?.id === id)));
    expect(starterFiles(AGENT_RECIPES, true).map((f) => f.agent?.id)).not.toContain("character-growth");
  });

  it("every suggested agent is a real recipe", () => {
    for (const id of SUGGESTED) expect(AGENT_RECIPES.some((f) => f.agent?.id === id)).toBe(true);
    expect(SUGGESTED.length).toBe(3);
  });

  it("a new chat starts with its set's agents, then the picked ones, none twice", () => {
    const base = [{ agent: "pacing-nudge", on: true, phase: "before" as const }, { agent: "scene-recap", on: false }];
    expect(chatAgentsWith(base, ["scene-recap", "ledger"])).toEqual([
      { agent: "pacing-nudge", on: true, phase: "before" },
      { agent: "scene-recap", on: true },
      { agent: "ledger", on: true },
    ]);
    expect(chatAgentsWith([], [])).toEqual([]);
  });
});

describe("what the agents did for the newest reply (#396 item 1)", async () => {
  const { lastReply } = await import("../src/lib/agent-cost");
  it("adds up the runs of the newest reply: calls, tokens, batched, and the longest wait", () => {
    const runs = [
      { key: "a", at: 1, ms: 9000, calls: 5 },
      { key: "b", at: 10, ms: 2000, calls: 1, tokens: { in: 300, out: 40 }, batched: 1 },
      { key: "b", at: 11, ms: 4500, calls: 1, tokens: { in: 100, out: 10 } },
    ];
    expect(lastReply(runs)).toEqual({ runs: 2, calls: 2, tokens: 450, seconds: 4.5, batched: 1 });
    expect(lastReply([])).toBeNull();
    expect(lastReply(undefined)).toBeNull();
  });
});
