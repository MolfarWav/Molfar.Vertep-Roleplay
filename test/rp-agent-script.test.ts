/**
 * The Script card (#140): the checker, the executor and the Agents plugin's side of the exchange with the engine's
 * script box. The sandbox itself is the engine's (test/script-box.test.ts there); here a fake `host.script` plays it.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileAgent, validateAgent, SCRIPT_LIMITS } from "../src/canvas-kit/boards/agent-check.js";
import * as run from "../src/canvas-kit/boards/agent-run.js";

type Json = Record<string, any>;
const plugin = (await import(new URL("../plugins/agents/plugin.js", import.meta.url).href)) as typeof import("../plugins/agents/plugin.js");

const CODE = "return { words: input.reply.split(/\\s+/).length, loud: input.reply.toUpperCase(), long: input.reply.length > 20 };";
const script = (params: Json = {}): Json => ({
  id: "sc", type: "code.script", x: 250, y: 0, title: "Count",
  params: { code: CODE, inputs: [{ id: "reply", type: "text" }], outputs: [{ id: "words", type: "number" }, { id: "loud", type: "text" }, { id: "long", type: "flag" }], ...params },
});

/** Input (last reply) -> Script -> two own fields, merged into an Output. */
function agent(sc: Json = script(), extraEdges: Json[] = []): Json {
  return {
    format: "vertep-canvas", version: 1, kind: "agent", title: "t",
    agent: {
      formatVersion: 1, id: "counter", version: "1.0.0", name: "Counter", description: "", author: "t",
      trigger: { when: "after", everyN: 1, keywords: [] }, limits: { maxCalls: 0, concurrency: 1 },
      state: { words: { type: "number", start: 0 }, loud: { type: "text" } },
    },
    nodes: [
      { id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give: [{ id: "reply", source: "lastReply" }] } },
      sc,
      { id: "s1", type: "state.set", x: 500, y: 0, title: "Words", params: { field: "words", as: "number" } },
      { id: "s2", type: "state.set", x: 500, y: 100, title: "Loud", params: { field: "loud", as: "text" } },
      { id: "m", type: "logic.merge", x: 700, y: 0, title: "Merge", params: { count: 2 } },
      { id: "out", type: "agent.output", x: 900, y: 0, title: "Output", params: { kind: "state-patch" } },
    ],
    edges: [
      { id: "e1", from: "in:reply", to: "sc:reply" },
      { id: "e2", from: "sc:words", to: "s1:value" },
      { id: "e3", from: "sc:loud", to: "s2:value" },
      { id: "e4", from: "s1:done", to: "m:i1" },
      { id: "e5", from: "s2:done", to: "m:i2" },
      { id: "e6", from: "m:out", to: "out:in" },
      ...extraEdges,
    ],
  };
}
const compiled = (f: Json) => compileAgent(f) as Json;
const errorsOf = (f: Json) => (compiled(f).report?.errors ?? []).map((e: Json) => e.code);
const ctx = (extra: Json = {}) => ({ inputs: { reply: "the quick brown fox" }, own: {}, dash: {}, chat: { messageCount: 3, lastSpeaker: "Aria" }, seed: "s", ...extra });

describe("the checker", () => {
  it("accepts a Script card; it needs the run:code permission and no model", () => {
    const r = compiled(agent());
    expect(r.report.errors).toEqual([]);
    expect(r.report.derived.needs).toEqual(["read:lastReply", "run:code", "write:own.loud", "write:own.words"]);
    expect(r.report.derived.maxCalls).toBe(0);
  });

  it("has a port for each input and output, a 'when' and a 'failed'", () => {
    expect(errorsOf(agent(script(), [{ id: "e9", from: "sc:long", to: "s1:when" }]))).toContain("E_TYPE"); // a flag is not a signal
    expect(errorsOf(agent(script(), [{ id: "e9", from: "sc:failed", to: "s1:when" }]))).toEqual([]);
  });

  it("refuses a script without code, with too much code, without outputs, or with bad ports", () => {
    expect(errorsOf(agent(script({ code: "  " })))).toContain("E_PARAM");
    expect(errorsOf(agent(script({ code: "return {};" + " ".repeat(SCRIPT_LIMITS.code) })))).toContain("E_PARAM");
    expect(errorsOf(agent(script({ outputs: [] })))).toContain("E_PARAM");
    expect(errorsOf(agent(script({ inputs: [{ id: "1bad", type: "text" }] })))).toContain("E_PARAM");
    expect(errorsOf(agent(script({ outputs: [{ id: "when", type: "text" }] })))).toContain("E_PARAM");
    expect(errorsOf(agent(script({ outputs: [{ id: "failed", type: "text" }] })))).toContain("E_PARAM");
    expect(errorsOf(agent(script({ outputs: [{ id: "a", type: "text" }, { id: "a", type: "text" }] })))).toContain("E_PARAM");
    expect(errorsOf(agent(script({ outputs: [{ id: "a", type: "list" }] })))).toContain("E_PARAM");
    expect(errorsOf(agent(script({ inputs: Array.from({ length: SCRIPT_LIMITS.ports + 1 }, (_, i) => ({ id: "i" + i, type: "text" })) })))).toContain("E_PARAM");
  });

  it("refuses code that does not parse", () => {
    expect(errorsOf(agent(script({ code: "return {" })))).toContain("E_SCRIPT_SYNTAX");
  });

  it("refuses more than six Script cards", () => {
    const f = agent();
    for (let i = 0; i < SCRIPT_LIMITS.perAgent; i++) f.nodes.push({ ...script(), id: "x" + i, title: "X" + i });
    expect(errorsOf(f)).toContain("E_SCRIPT_LIMIT");
  });

  it("counts a script as a round of waiting", () => {
    const chain = agent();
    chain.nodes.push({ id: "a", type: "model.ask", x: 0, y: 0, title: "A", params: { role: "fast", prompt: "{{reply}}", answer: { as: "text" }, maxTokens: 50 } });
    expect(validateAgent(chain).errors.map((e: Json) => e.code)).not.toContain("E_ROUNDS");
  });
});

describe("the executor", () => {
  const file = () => compiled(agent()).file;

  it("asks for the script with the typed input, and waits", () => {
    const r = run.runAgent(file(), ctx(), {}) as Json;
    expect(r.status).toBe("need");
    expect(r.requests).toEqual([{ node: "sc", kind: "script", code: CODE, input: { reply: "the quick brown fox" } }]);
  });

  it("takes the answer: outputs by type, a flag as yes/no, and the state writes follow", () => {
    const r = run.runAgent(file(), ctx(), { sc: { value: { words: 4, loud: "THE QUICK BROWN FOX", long: false } } }) as Json;
    expect(r.status).toBe("done");
    expect(r.writes).toEqual([{ op: "own.set", field: "words", value: 4 }, { op: "own.set", field: "loud", value: "THE QUICK BROWN FOX" }]);
  });

  it("an output the script leaves out is missing data: what depends on it is skipped, never a zero", () => {
    const r = run.runAgent(file(), ctx(), { sc: { value: { loud: "X" } } }) as Json;
    expect(r.status).toBe("done");
    expect(r.writes).toEqual([{ op: "own.set", field: "loud", value: "X" }]);
  });

  it("an output of the wrong type fails the card with the output's name", () => {
    for (const value of [{ words: "four" }, { words: Infinity }, { loud: { a: 1 } }, { long: "yes" }]) {
      const r = run.runAgent(file(), ctx(), { sc: { value } }) as Json;
      expect(r.status).toBe("failed");
      expect(r.node).toBe("sc");
    }
  });

  it("a script error fails the run, unless 'failed' is wired: then the run goes on down that path", () => {
    const err = run.runAgent(file(), ctx(), { sc: { error: "boom" } }) as Json;
    expect(err).toMatchObject({ status: "failed", node: "sc" });
    expect(err.reason).toContain("boom");
    const wired = compiled(agent(script(), [{ id: "e9", from: "sc:failed", to: "s1:when" }])).file;
    // s1 now fires on 'failed' only through its optional when; its own value input is skipped, so nothing is written
    const r = run.runAgent(wired, ctx(), { sc: { error: "boom" } }) as Json;
    expect(r.status).toBe("done");
    expect(r.writes).toEqual([]);
  });

  it("a flag input arrives as true, false or null", () => {
    const f = compiled(agent(script({ code: "return {};", inputs: [{ id: "reply", type: "text" }, { id: "ok", type: "flag" }], outputs: [{ id: "words", type: "number" }] }))).file;
    // the flag input has no wire in this agent: the checker would refuse the file, so give it one from a state.read
    f.nodes.push({ id: "rd", type: "state.read", x: 0, y: 200, title: "Read", params: { field: "flag", as: "flag" } });
    f.agent.state.flag = { type: "flag" };
    f.edges.push({ id: "e8", from: "rd:value", to: "sc:ok" });
    expect((run.runAgent(f, ctx({ own: { flag: true } }), {}) as Json).requests[0].input).toEqual({ reply: "the quick brown fox", ok: true });
    expect((run.runAgent(f, ctx({ own: { flag: false } }), {}) as Json).requests[0].input).toEqual({ reply: "the quick brown fox", ok: false });
  });

  it("is skipped when its input is missing", () => {
    const r = run.runAgent(file(), ctx({ inputs: {} }), {}) as Json;
    expect(r.status).toBe("done");
    expect(r.requests).toBeUndefined();
  });
});

// ---------- the plugin ----------

let root: string;
let scriptReqs: [string, Json][];
let scriptResults: Record<string, Json>;
let withScript = true;
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
  ...(withScript ? { script: { request: (k: string, req: Json) => scriptReqs.push([k, req]), results: scriptResults } } : {}),
  log: () => {},
});
const call = (method: string, p: string, body?: unknown, stash?: Json) =>
  plugin.handleRoute({ method, path: p, query: {}, body, stash } as never, host() as never) as { status?: number; json?: Json; __llmPending?: boolean; stash?: Json };
const j = (p: string, method = "GET", body?: unknown, query?: Json) => (plugin.handleRoute({ method, path: p, query: query ?? {}, body } as never, host() as never) as { json?: Json }).json as Json;

function makeChat(id: string, msgs: [string, string][]) {
  fs.mkdirSync(path.join(root, "chats"), { recursive: true });
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ id, title: "t", characterId: null }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map(([role, text], i) => JSON.stringify({ id: "m" + i, role, name: role === "user" ? "Taras" : "Aria", text, swipe: 0 })).join("\n") + "\n");
}
const useAgent = (id: string) => {
  fs.mkdirSync(path.join(root, "agents", "presets"), { recursive: true });
  fs.writeFileSync(path.join(root, "agents", "presets", "p.json"), JSON.stringify({ format: "vertep-agent-preset", version: 1, id: "p", name: "P", items: [{ agent: id, on: true }] }));
  fs.writeFileSync(path.join(root, "agents", "settings.json"), JSON.stringify({ defaultPreset: "p" }));
};
/** Run until the plugin stops asking; `answer` plays the engine's script box. */
function runChat(chatId: string, answer: (req: Json) => Json): Json {
  scriptResults = {};
  let stash: Json = { started: 1 };
  for (let pass = 0; pass < 12; pass++) {
    scriptReqs = [];
    const r = call("POST", "/agents/run", { chatId }, stash);
    if (!r.__llmPending) return r.json as Json;
    stash = r.stash ?? stash;
    scriptResults = {};
    for (const [k, q] of scriptReqs) scriptResults[k] = answer(q);
  }
  throw new Error("never finished");
}
const own = () => j("/agents/state", "GET", undefined, { chatId: "c1", agent: "counter" }).own;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-script-"));
  scriptReqs = [];
  scriptResults = {};
  withScript = true;
  const inst = j("/agents/install", "PUT", { file: JSON.parse(JSON.stringify(agent())), grant: true });
  expect(inst.ok).toBe(true);
  makeChat("c1", [["char", "Welcome, keeper."], ["user", "I summon an imp."], ["char", "A small imp pops into the dark."]]);
  useAgent("counter");
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

describe("the Agents plugin", () => {
  it("asks the engine for the script with the chat's reply, a seed for this card, and keeps what comes back", () => {
    let asked: Json | null = null;
    const r = runChat("c1", (req) => { asked = req; return { ok: true, value: { words: 7, loud: "A SMALL IMP" } }; });
    expect(asked).toMatchObject({ code: CODE, input: { reply: "A small imp pops into the dark." } });
    expect((asked as unknown as Json).seed).toMatch(/counter.*\|sc$/);
    expect(r.ran).toMatchObject([{ agent: "counter", status: "ok", writes: 2 }]);
    expect(own()).toMatchObject({ words: 7, loud: "A SMALL IMP" });
  });

  it("a script the engine could not finish fails the run with its reason, and changes nothing", () => {
    const r = runChat("c1", () => ({ ok: false, error: "the script ran longer than 500 ms" }));
    expect(r.ran).toMatchObject([{ agent: "counter", status: "failed" }]);
    expect(JSON.stringify(r)).toContain("500 ms");
    expect(own()).toMatchObject({ words: 0 });
  });

  it("an engine without the script box fails the agent with a plain message, not a hang", () => {
    withScript = false;
    const r = call("POST", "/agents/run", { chatId: "c1" }, { started: 1 });
    expect(r.__llmPending).toBeFalsy();
    expect(JSON.stringify(r.json)).toContain("too old to run one");
  });

  it("the same reply asks for the same seed again; a new reply asks for another", () => {
    const seeds: string[] = [];
    runChat("c1", (req) => { seeds.push(req.seed); return { ok: true, value: { words: 1, loud: "X" } }; });
    fs.appendFileSync(path.join(root, "chats", "c1.jsonl"), JSON.stringify({ id: "m3", role: "char", name: "Aria", text: "More.", swipe: 0 }) + "\n");
    runChat("c1", (req) => { seeds.push(req.seed); return { ok: true, value: { words: 1, loud: "X" } }; });
    expect(seeds).toHaveLength(2);
    expect(seeds[0]).not.toBe(seeds[1]);
  });
});
