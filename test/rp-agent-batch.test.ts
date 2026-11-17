/**
 * Batching (Molfar.Vertep#396 item 1): Ask cards of different agents that share a batchKey and a model go to the model as ONE
 * request, and a reply that does not split into the answers asked for sends them back to single requests, so no agent loses its run.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileAgent } from "../src/canvas-kit/boards/agent-check.js";

const plugin = (await import(new URL("../plugins/agents/plugin.js", import.meta.url).href)) as typeof import("../plugins/agents/plugin.js");

type Json = Record<string, any>;
let root: string;
let requests: [string, Json][] = [];
let results: Record<string, Json> = {};
const host = () => ({
  fs: {
    root,
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
  store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
  llm: { request: (k: string, body: Json) => requests.push([k, body]), results, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  log: () => {},
});
const disk = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

/** An agent with one Ask card: it reads the last reply and shows the model's text as a note. */
const asker = (id: string, batchKey: string | null, question: string) => {
  const f = {
    format: "vertep-canvas", version: 1, kind: "agent", title: id,
    agent: { formatVersion: 1, id, version: "1.0.0", name: id, description: "", author: "t", trigger: { when: "after", everyN: 1, keywords: [] }, models: { fast: { hint: "cheap" } }, limits: { maxCalls: 1 } },
    nodes: [
      { id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give: [{ id: "last", source: "lastReply" }] } },
      { id: "ask", type: "model.ask", x: 300, y: 0, title: "Ask", params: { role: "fast", prompt: question + " {{last}}", answer: { as: "text" }, maxTokens: 120, batchKey } },
      { id: "out", type: "agent.output", x: 600, y: 0, title: "Out", params: { kind: "note", title: id } },
    ],
    edges: [{ id: "a", from: "in:last", to: "ask:last" }, { id: "b", from: "ask:text", to: "out:in" }],
  };
  return compileAgent(f as never).file;
};
const install = (files: Json[]) => {
  for (const f of files) plugin.handleRoute({ method: "PUT", path: "/agents/install", query: {}, body: { file: f, grant: true } } as never, host() as never);
  fs.mkdirSync(path.join(root, "agents", "presets"), { recursive: true });
  fs.writeFileSync(path.join(root, "agents", "presets", "p.json"), JSON.stringify({ format: "vertep-agent-preset", version: 1, id: "p", name: "P", items: files.map((f) => ({ agent: f.agent.id, on: true })) }));
  fs.writeFileSync(path.join(root, "agents", "settings.json"), JSON.stringify({ defaultPreset: "p" }));
};
/** Runs to the end like the engine; every pass's requests are kept in `passes`. */
function runChat(answer: (key: string, q: Json) => Json) {
  results = {};
  const passes: [string, Json][][] = [];
  let stash: Json = { started: 1 };
  for (let pass = 0; pass < 12; pass++) {
    requests = [];
    const r = plugin.handleRoute({ method: "POST", path: "/agents/run", query: {}, body: { chatId: "c1" }, stash } as never, host() as never) as { json?: Json; __llmPending?: boolean; stash?: Json };
    if (requests.length) passes.push(requests);
    if (!r.__llmPending) return { done: r.json as Json, passes };
    stash = r.stash ?? stash;
    results = {};
    for (const [k, q] of requests) results[k] = answer(k, q);
  }
  throw new Error("never finished");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-batch-"));
  fs.mkdirSync(path.join(root, "chats"), { recursive: true });
  fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({ id: "c1", title: "t" }));
  fs.writeFileSync(path.join(root, "chats", "c1.jsonl"), [{ id: "m0", role: "user", name: "T", text: "Hello", swipe: 0 }, { id: "m1", role: "char", name: "A", text: "The gate creaks open.", swipe: 0 }].map((m) => JSON.stringify(m)).join("\n") + "\n");
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* */ } });

describe("the helpers", () => {
  it("batchPrompt numbers the tasks and splitBatchAnswer takes the answers back", () => {
    const p = plugin.batchPrompt(["one?", "two?"]);
    expect(p).toContain("===== TASK 1 =====\none?");
    expect(p).toContain("===== TASK 2 =====\ntwo?");
    expect(plugin.splitBatchAnswer("===== ANSWER 1 =====\nA one\n===== ANSWER 2 =====\nA two\nmore", 2)).toEqual(["A one", "A two\nmore"]);
    expect(plugin.splitBatchAnswer("  ===== answer 1 =====  \nx\n==== ANSWER 2 ====\ny", 2)).toEqual(["x", "y"]);
  });
  it("splitBatchAnswer refuses a missing, doubled, misordered or empty answer", () => {
    expect(plugin.splitBatchAnswer("just text", 2)).toBeNull();
    expect(plugin.splitBatchAnswer("===== ANSWER 1 =====\nx", 2)).toBeNull();
    expect(plugin.splitBatchAnswer("===== ANSWER 2 =====\nx\n===== ANSWER 1 =====\ny", 2)).toBeNull();
    expect(plugin.splitBatchAnswer("===== ANSWER 1 =====\n\n===== ANSWER 2 =====\ny", 2)).toBeNull();
    expect(plugin.splitBatchAnswer("===== ANSWER 1 =====\nx\n===== ANSWER 1 =====\ny\n===== ANSWER 2 =====\nz", 2)).toBeNull();
  });
});

describe("a run with batching", () => {
  it("two agents with the same batchKey make ONE model request, and each gets its own answer", () => {
    install([asker("alpha", "g", "Mood of"), asker("beta", "g", "Place of")]);
    const { done, passes } = runChat((k) => (k.startsWith("bt_") ? { text: "===== ANSWER 1 =====\ntense\n===== ANSWER 2 =====\nthe gate", model: "m/x", usage: { input: 300, output: 40 } } : { text: "?" }));
    expect(passes.length).toBe(1);
    expect(passes[0].length).toBe(1);
    expect(passes[0][0][0]).toBe("bt_0");
    const content = passes[0][0][1].messages[0].content as string;
    expect(content).toContain("Mood of");
    expect(content).toContain("Place of");
    expect(passes[0][0][1].presetParams.max_tokens).toBe(340);
    expect((done.ran as Json[]).map((x) => x.status)).toEqual(["ok", "ok"]);
    const runs = disk("agents/runs/c1.json").runs as Json[];
    expect(runs.map((r) => r.outputs[0].text)).toEqual(["tense", "the gate"]);
    expect(runs[0].batched).toBe(1);
    expect(runs[0].tokens).toEqual({ in: 300, out: 40 });
    expect(runs[1].tokens).toBeUndefined();
  });

  it("a reply that does not split falls back to a single request for each, and both agents still run", () => {
    install([asker("alpha", "g", "Mood of"), asker("beta", "g", "Place of")]);
    const { done, passes } = runChat((k, q) => (k.startsWith("bt_") ? { text: "I will just answer in prose." } : { text: "single for " + String(q.messages[0].content).slice(0, 7) }));
    expect(passes.length).toBe(2);
    expect(passes[0].map((x) => x[0])).toEqual(["bt_0"]);
    expect(passes[1].map((x) => x[0]).sort()).toEqual(["ag_0_1", "ag_1_1"]);
    expect((done.ran as Json[]).map((x) => x.status)).toEqual(["ok", "ok"]);
    const runs = disk("agents/runs/c1.json").runs as Json[];
    expect(runs.every((r) => r.batched === undefined)).toBe(true);
  });

  it("a failed batch call falls back too", () => {
    install([asker("alpha", "g", "Mood of"), asker("beta", "g", "Place of")]);
    const { done } = runChat((k) => (k.startsWith("bt_") ? { error: "rate limit" } : { text: "ok" }));
    expect((done.ran as Json[]).map((x) => x.status)).toEqual(["ok", "ok"]);
  });

  it("different keys, no key, or one alone are asked one by one, as before", () => {
    install([asker("alpha", "g", "Mood of"), asker("beta", "h", "Place of"), asker("gamma", null, "Who is")]);
    const { passes } = runChat(() => ({ text: "x" }));
    expect(passes.length).toBe(1);
    expect(passes[0].map((x) => x[0]).sort()).toEqual(["ag_0_1", "ag_1_1", "ag_2_1"]);
  });

  it("the checker refuses a batch word that is not a plain word", () => {
    const f = asker("alpha", "no good!", "Mood of") as Json;
    expect((compileAgent(f as never) as Json).report.errors.map((e: Json) => e.code)).toContain("E_BATCH_KEY");
    expect((compileAgent(asker("beta", "ok_key-1", "x") as never) as Json).report.errors).toEqual([]);
    expect((compileAgent(asker("gamma", null, "x") as never) as Json).report.errors).toEqual([]);
  });
});
