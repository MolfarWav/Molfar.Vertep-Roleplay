/**
 * The agents plugin (plugins/agents/plugin.js): install, permissions, a run after a reply in the engine's
 * two-phase style (the plugin asks, the test plays the model), the agent's own state, the run log and the hint for
 * the next reply. The generated copy of the checker and the executor must match their sources.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import keeper from "./fixtures/dungeon-keeper.vertep-agent.json";
import echo from "./fixtures/scene-echo.vertep-agent.json";
import moves from "./fixtures/next-moves.vertep-agent.json";
import mood from "./fixtures/mood-tracker.vertep-agent.json";
import { AGENT_MAX_ROUNDS, compileAgent } from "../src/canvas-kit/boards/agent-check.js";
import { generatedBlock, withBlock } from "../scripts/sync-agents-plugin";
import { chainAgent, hintAgent } from "./fixtures/chain-agent";

const plugin = (await import(new URL("../plugins/agents/plugin.js", import.meta.url).href)) as typeof import("../plugins/agents/plugin.js");
const engine = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as typeof import("../plugins/engine/plugin.js");

type Json = Record<string, any>;
const copy = (f: unknown): any => JSON.parse(JSON.stringify(f));

describe("the generated block", () => {
  it("is what the sources say (run: bun scripts/sync-agents-plugin.ts)", () => {
    const now = fs.readFileSync(new URL("../plugins/agents/plugin.js", import.meta.url), "utf8");
    expect(withBlock(now, generatedBlock())).toBe(now);
  });
});

let root: string;
let requests: [string, Json][];
let results: Record<string, Json>;
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
const call = (method: string, p: string, body?: unknown, query?: Json, stash?: Json) =>
  plugin.handleRoute({ method, path: p, query: query ?? {}, body, stash } as never, host() as never) as { status?: number; json?: Json; __llmPending?: boolean };
const j = (p: string, method = "GET", body?: unknown, query?: Json) => call(method, p, body, query).json as Json;
const disk = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

/** A chat on disk: the transcript is the list of [role, text]. */
function makeChat(id: string, msgs: [string, string][], meta: Json = {}) {
  fs.mkdirSync(path.join(root, "chats"), { recursive: true });
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ id, title: "t", characterId: null, ...meta }));
  setMessages(id, msgs);
}
function setMessages(id: string, msgs: [string, string][], swipes: Record<number, number> = {}) {
  const lines = msgs.map(([role, text], i) => JSON.stringify({ id: "m" + i, role, name: role === "user" ? "Taras" : "Aria", text, swipe: swipes[i] ?? 0 }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), lines.join("\n") + "\n");
}
const CHAT: [string, string][] = [["char", "Welcome, keeper."], ["user", "I summon an imp."], ["char", "A small imp pops into the dark."]];
const useAgent = (id: string, extra: Json = {}) => {
  fs.mkdirSync(path.join(root, "agents", "presets"), { recursive: true });
  fs.writeFileSync(path.join(root, "agents", "presets", "p.json"), JSON.stringify({ format: "vertep-agent-preset", version: 1, id: "p", name: "P", items: [{ agent: id, on: true, ...extra }] }));
  fs.writeFileSync(path.join(root, "agents", "settings.json"), JSON.stringify({ defaultPreset: "p" }));
};
/** Run until the plugin stops asking, the way the engine does: it hands over only the newest pass's answers, and the stash
 *  the plugin returned. `answer` plays the model for each question. */
function runChat(chatId: string, body: Json = {}, answer: (q: Json, key: string) => Json = () => ({ text: "YES" })): Json {
  results = {};
  let stash: Json = { started: 1 };
  for (let pass = 0; pass < 12; pass++) {
    requests = [];
    const r = call("POST", "/agents/run", { chatId, ...body }, undefined, stash) as { json?: Json; __llmPending?: boolean; stash?: Json };
    if (!r.__llmPending) return r.json as Json;
    stash = r.stash ?? stash;
    results = {};
    for (const [k, q] of requests) results[k] = answer(q, k);
  }
  throw new Error("never finished");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-plugin-"));
  requests = [];
  results = {};
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

describe("install and permissions", () => {
  it("installs a checked file, keeps it compiled, and waits for the user to confirm the permissions", () => {
    const r = j("/agents/install", "PUT", { file: copy(keeper) });
    expect(r).toMatchObject({ ok: true, id: "dungeon-keeper", updated: false, granted: [], unsupported: [] });
    expect(r.needs).toEqual(["llm", "read:lastUserMessage", "read:own.mana", "show:panel", "write:own.mana"]);
    expect(r.missing).toEqual(r.needs);
    const row = j("/agents/list").agents[0];
    expect(row).toMatchObject({ id: "dungeon-keeper", runnable: false, maxCalls: 1 });
    expect(row.blocker).toMatch(/Waiting for permission/);
    j("/agents/grant", "POST", { id: "dungeon-keeper", tokens: true });
    expect(j("/agents/list").agents[0]).toMatchObject({ runnable: true, blocker: "", missing: [] });
  });

  it("a file without a derived section is compiled on install", () => {
    const f = copy(keeper);
    delete f.agent.derived;
    const r = j("/agents/install", "PUT", { file: f, grant: true });
    expect(r.ok).toBe(true);
    expect(disk("agents/dungeon-keeper.vertep-agent.json").agent.derived.hash).toBe(keeper.agent.derived.hash);
    expect(r.missing).toEqual([]);
  });

  it("a file that lies about what it needs, or does not pass the check, is refused and not stored", () => {
    const lie = copy(keeper);
    lie.agent.derived.needs = ["llm"];
    const res = call("PUT", "/agents/install", { file: lie });
    expect(res.status).toBe(400);
    expect(res.json?.errors.map((e: Json) => e.code)).toContain("E_NEEDS_MISMATCH");
    const broken = copy(keeper);
    delete broken.agent.derived;
    broken.edges.pop();
    expect(call("PUT", "/agents/install", { file: broken }).status).toBe(400);
    expect(call("PUT", "/agents/install", { file: { nope: 1 } }).status).toBe(400);
    expect(call("PUT", "/agents/install", { file: { ...copy(keeper), title: "x".repeat(300000) } }).status).toBe(400);
    expect(exists("agents/dungeon-keeper.vertep-agent.json")).toBe(false);
  });

  it("only the permissions asked for can be granted, and an update keeps what was confirmed", () => {
    j("/agents/install", "PUT", { file: copy(keeper), grant: ["llm", "show:panel", "write:own.bogus"] });
    expect(j("/agents/list").agents[0].granted).toEqual(["llm", "show:panel"]);
    const f = copy(keeper);
    f.agent.version = "1.1.0";
    delete f.agent.derived;
    const r = j("/agents/install", "PUT", { file: f });
    expect(r).toMatchObject({ updated: true, granted: ["llm", "show:panel"] });
  });

  it("an agent that needs Dashboard fields installs but cannot be granted them or run", () => {
    const r = j("/agents/install", "PUT", { file: copy(mood), grant: true });
    expect(r.unsupported).toEqual(["read:state.mood", "write:state.mood"]);
    expect(r.missing).toEqual(["read:state.mood", "write:state.mood"]);
    expect(j("/agents/list").agents[0].blocker).toMatch(/cannot give yet/);
  });

  it("remove deletes the file and the permissions", () => {
    j("/agents/install", "PUT", { file: copy(keeper), grant: true });
    j("/agents/dungeon-keeper", "DELETE");
    expect(j("/agents/list").agents).toEqual([]);
    expect(exists("agents/grants/dungeon-keeper.json")).toBe(false);
  });

  it("other paths are not ours", () => {
    expect(plugin.handleRoute({ method: "GET", path: "/world/state", query: {} } as never, host() as never)).toBeNull();
  });
});

describe("a run after a reply", () => {
  beforeEach(() => {
    j("/agents/install", "PUT", { file: copy(keeper), grant: true });
    makeChat("c1", CHAT);
    useAgent("dungeon-keeper");
  });

  it("asks the model first and changes nothing until it has the answer", () => {
    requests = [];
    const r = call("POST", "/agents/run", { chatId: "c1" });
    expect(r.__llmPending).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0][0]).toBe("ag_0_" + keeper.nodes.findIndex((n) => n.id === "ask"));
    expect(requests[0][1].messages[0].content).toContain("I summon an imp.");
    expect(requests[0][1].messages[0].content).toMatch(/YES or NO/);
    expect(exists("agents/state/c1/dungeon-keeper.json")).toBe(false);
  });

  it("YES pays 10 mana; the state, the log and the output are kept", () => {
    const r = runChat("c1");
    expect(r.ran).toEqual([{ agent: "dungeon-keeper", status: "ok", calls: 1, writes: 1, outputs: 1 }]);
    expect(j("/agents/state", "GET", undefined, { chatId: "c1", agent: "dungeon-keeper" }).own).toEqual({ mana: 40, rooms: [] });
    const log = j("/agents/runs", "GET", undefined, { chatId: "c1" }).runs;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ agent: "dungeon-keeper", key: "m2#0", status: "ok", calls: 1, writes: [{ op: "own.add", field: "mana", by: -10 }] });
  });

  it("the same reply is not run twice, a regenerated one replaces the run instead of counting twice, a new reply counts", () => {
    runChat("c1");
    expect(runChat("c1").skipped).toEqual([{ agent: "dungeon-keeper", why: "already ran for this reply" }]);
    setMessages("c1", CHAT, { 2: 1 }); // swipe 2 of the last reply
    runChat("c1");
    expect(j("/agents/state", "GET", undefined, { chatId: "c1", agent: "dungeon-keeper" }).own.mana).toBe(40);
    setMessages("c1", [...CHAT, ["user", "Again."], ["char", "Another imp."]]);
    runChat("c1");
    expect(j("/agents/state", "GET", undefined, { chatId: "c1", agent: "dungeon-keeper" }).own.mana).toBe(30);
  });

  it("NO and an unreadable answer change nothing", () => {
    runChat("c1", {}, () => ({ text: "No." }));
    expect(j("/agents/state", "GET", undefined, { chatId: "c1", agent: "dungeon-keeper" }).own.mana).toBe(50);
    setMessages("c1", [...CHAT, ["user", "x"], ["char", "y"]]);
    runChat("c1", {}, () => ({ text: "Hmm, hard to say" }));
    expect(j("/agents/state", "GET", undefined, { chatId: "c1", agent: "dungeon-keeper" }).own.mana).toBe(50);
  });

  it("a failed model call is logged, leaves the state alone, and the next reply tries again", () => {
    const r = runChat("c1", {}, () => ({ error: "429 rate limit" }));
    expect(r.ran[0]).toMatchObject({ status: "failed" });
    expect(r.ran[0].reason).toContain("429");
    expect(exists("agents/state/c1/dungeon-keeper.json")).toBe(false);
    expect(runChat("c1").ran[0].status).toBe("ok"); // a failed run does not block a retry of the same reply
  });

  it("an empty answer counts as a failed call", () => {
    expect(runChat("c1", {}, () => ({ text: "  " })).ran[0].status).toBe("failed");
  });

  it("skips an agent that is off in the chat, is not installed, has no permission, or runs only by hand", () => {
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({ id: "c1", agents: { v: 1, own: [{ agent: "dungeon-keeper", on: false }, { agent: "ghost-agent", on: true }] } }));
    expect(runChat("c1")).toEqual({ ok: true, ran: [], skipped: [{ agent: "ghost-agent", why: "not installed" }] });
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({ id: "c1", agents: { v: 1, own: [{ agent: "dungeon-keeper", on: true, phase: "manual" }] } }));
    expect(runChat("c1").ran).toEqual([]);
    j("/agents/grant", "POST", { id: "dungeon-keeper", tokens: ["llm"] });
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({ id: "c1" }));
    expect(runChat("c1").skipped[0].why).toMatch(/Waiting for permission/);
  });

  it("a manual run goes ahead whatever the trigger says; a before-agent is not started after a reply", () => {
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({ id: "c1", agents: { v: 1, own: [{ agent: "dungeon-keeper", on: true, phase: "before" }] } }));
    expect(runChat("c1").skipped[0].why).toMatch(/runs before the reply, not after it/);
    expect(runChat("c1", { agent: "dungeon-keeper" }).ran[0].status).toBe("ok");
  });

  it("everyN and keywords gate the run", () => {
    const install = (trigger: Json) => { const f = copy(keeper); f.agent.trigger = trigger; delete f.agent.derived; j("/agents/install", "PUT", { file: f, grant: true }); };
    install({ when: "after", everyN: 2 });
    expect(runChat("c1").ran[0].status).toBe("ok"); // two replies: 2 % 2 == 0
    setMessages("c1", [...CHAT, ["user", "x"], ["char", "y"]]); // three replies
    expect(runChat("c1").skipped[0].why).toMatch(/trigger did not fire/);
    install({ when: "after", keywords: ["dragon"] });
    expect(runChat("c1").skipped[0].why).toMatch(/trigger did not fire/);
    setMessages("c1", [...CHAT, ["user", "x"], ["char", "The IMP bows."]]);
    install({ when: "after", keywords: ["imp"] });
    expect(runChat("c1").ran[0].status).toBe("ok"); // not case-sensitive, looked for in the last two messages
  });
});

describe("model calls one behind another", () => {
  const answers = (q: Json) => ({ text: "ANSWER" + (q.messages[0].content as string).length });

  it("a chain of five dependent calls runs to the end, one question per round, with only the newest answers handed over each pass", () => {
    j("/agents/install", "PUT", { file: chainAgent(5), grant: true });
    makeChat("c1", CHAT);
    useAgent("chain");
    const rounds: number[] = [];
    const out = runChat("c1", {}, (q, k) => { rounds.push(1); return answers(q); });
    expect(rounds).toEqual([1, 1, 1, 1, 1]);
    expect(out.ran).toEqual([{ agent: "chain", status: "ok", calls: 5, writes: 0, outputs: 1 }]);
  });

  it("an agent that is still asking at the last allowed pass fails with a reason instead of vanishing", () => {
    j("/agents/install", "PUT", { file: chainAgent(2), grant: true });
    makeChat("c1", CHAT);
    useAgent("chain");
    requests = [];
    const r = call("POST", "/agents/run", { chatId: "c1" }, undefined, { started: 1, pass: 7 });
    expect(r.__llmPending).toBeUndefined();
    expect(requests).toEqual([]);
    expect((r.json as Json).ran[0]).toMatchObject({ agent: "chain", status: "failed" });
    expect((r.json as Json).ran[0].reason).toMatch(/more than 7 model calls one behind another/);
    expect(j("/agents/runs", "GET", undefined, { chatId: "c1" }).runs[0]).toMatchObject({ agent: "chain", status: "failed" });
  });

  it("the manifest asks the engine for the passes the runner needs, and no more", () => {
    const m = JSON.parse(fs.readFileSync(new URL("../plugins/agents/manifest.json", import.meta.url), "utf8"));
    expect(m.limits.passes).toBe(AGENT_MAX_ROUNDS + 1);
    expect(m.limits.concurrency).toBeGreaterThan(1);
    expect(m.limits.concurrency).toBeLessThanOrEqual(4);
  });
});

/** What the engine does with a request hook: runs it, and while it asks the model runs it again with the newest answers and what it returned. */
function runHook(ctx: Json, answer: (q: Json) => Json = () => ({ text: "mind the guard" })): { patch: Json | null; passes: number } {
  let cur = ctx;
  results = {};
  for (let pass = 0; pass < 8; pass++) {
    requests = [];
    const out = plugin.llmRequest(cur as never, host() as never) as Json | null;
    if (!requests.length) return { patch: out, passes: pass + 1 };
    results = {};
    for (const [k, q] of requests) results[k] = answer(q);
    cur = out ?? cur;
  }
  throw new Error("the hook never finished");
}
const replyCtx = (text: string, op = "send"): Json => ({
  key: "reply", plugin: "roleplay__engine", turn: { op, chatId: "c1" },
  request: { sessionId: "c1", messages: [{ role: "system", content: "S" }, { role: "user", content: text }] },
});
const lastUserOf = (patch: Json | null): string => (patch ? patch.messages.at(-1).content : "");

describe("agents before the reply", () => {
  beforeEach(() => {
    j("/agents/install", "PUT", { file: hintAgent("watcher", "before"), grant: true });
    makeChat("c1", CHAT);
    useAgent("watcher");
  });

  it("asks about the message the user is sending and puts the answer into this very reply", () => {
    const seen: string[] = [];
    const { patch } = runHook(replyCtx("I open the door"), (q) => { seen.push(q.messages[0].content); return { text: "mind the guard" }; });
    expect(seen).toEqual(["One hint for: I open the door"]);
    expect(lastUserOf(patch)).toContain("I open the door");
    expect(lastUserOf(patch)).toContain("[Hint]\nmind the guard");
    expect(j("/agents/runs", "GET", undefined, { chatId: "c1" }).runs[0]).toMatchObject({ agent: "watcher", status: "ok", phase: "before" });
  });

  it("the same message is not asked twice, a new one is", () => {
    runHook(replyCtx("I open the door"));
    let asked = 0;
    runHook(replyCtx("I open the door"), () => { asked++; return { text: "again" }; });
    expect(asked).toBe(0);
    runHook(replyCtx("I close it"), () => { asked++; return { text: "again" }; });
    expect(asked).toBe(1);
  });

  it("a failed question never stops the reply: no hint, the failure is logged with its reason", () => {
    const { patch } = runHook(replyCtx("I open the door"), () => ({ error: "429 rate limit" }));
    expect(patch).toBeNull();
    expect(j("/agents/runs", "GET", undefined, { chatId: "c1" }).runs[0]).toMatchObject({ agent: "watcher", status: "failed", phase: "before" });
  });

  it("runs only on a send; a swipe reuses the hint of the last run", () => {
    runHook(replyCtx("I open the door"));
    let asked = 0;
    const { patch } = runHook(replyCtx("ignored", "swipe"), () => { asked++; return { text: "no" }; });
    expect(asked).toBe(0);
    expect(lastUserOf(patch)).toContain("mind the guard");
  });

  it("keywords are read in the message being sent", () => {
    const f = hintAgent("watcher", "before", { keywords: ["door"] });
    j("/agents/install", "PUT", { file: f, grant: true });
    let asked = 0;
    runHook(replyCtx("I sleep"), () => { asked++; return { text: "x" }; });
    expect(asked).toBe(0);
    runHook(replyCtx("I open the door"), () => { asked++; return { text: "x" }; });
    expect(asked).toBe(1);
  });

  it("an agent the reply does not wait for is left to the run beside the reply, whose hint goes into the next one", () => {
    useAgent("watcher", { wait: false });
    let asked = 0;
    const first = runHook(replyCtx("I open the door"), () => { asked++; return { text: "x" }; });
    expect(asked).toBe(0);
    expect(first.patch).toBeNull();
    const r = runChat("c1", { phase: "parallel", userText: "I open the door" }, () => ({ text: "mind the guard" }));
    expect(r.ran).toEqual([{ agent: "watcher", status: "ok", calls: 1, writes: 0, outputs: 1 }]);
    expect(j("/agents/runs", "GET", undefined, { chatId: "c1" }).runs[0]).toMatchObject({ agent: "watcher", phase: "parallel" });
    expect(lastUserOf(runHook(replyCtx("I go on"), () => { asked++; return { text: "x" }; }).patch)).toContain("mind the guard");
    expect(asked).toBe(0);
  });
});

describe("agents beside the reply", () => {
  it("a parallel agent runs on what the user sent, which is not saved yet, and a normal run after the reply skips it", () => {
    j("/agents/install", "PUT", { file: hintAgent("side", "parallel", {}, { kind: "note", title: "Hint" }), grant: true });
    makeChat("c1", CHAT);
    useAgent("side");
    expect(runChat("c1").skipped[0].why).toMatch(/runs beside the reply, not after it/);
    expect(runChat("c1", { phase: "parallel" }).error).toBe("userText required");
    const seen: string[] = [];
    const r = runChat("c1", { phase: "parallel", userText: "I open the door" }, (q) => { seen.push(q.messages[0].content); return { text: "ok" }; });
    expect(r.ran[0]).toMatchObject({ agent: "side", status: "ok" });
    expect(seen).toEqual(["One hint for: I open the door"]);
    expect(runChat("c1", { phase: "parallel", userText: "I open the door" }).skipped[0].why).toBe("already ran for this message");
  });

  it("the wait switch is kept in the chat's items, like the engine's rules keep it", () => {
    fs.mkdirSync(path.join(root, "chats"), { recursive: true });
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({ id: "c1", agents: { v: 1, own: [{ agent: "watcher", on: true, phase: "before", wait: false }, { agent: "other", on: true, wait: true }] } }));
    expect(plugin.chatAgents(host().fs as never, { agents: { v: 1, own: [{ agent: "watcher", on: true, wait: false }, { agent: "other", on: true, wait: true }] } } as never)).toEqual([
      { agent: "watcher", on: true, wait: false, show: null },
      { agent: "other", on: true, show: null },
    ]);
  });
});

describe("the same rules as the engine", () => {
  it("chatAgents gives what the engine's resolveChatAgents gives", () => {
    const presets = { rp: engine.cleanAgentPreset({ items: [{ agent: "scene-plan", phase: "before", wait: false }, { agent: "mood-tracker", on: false }] }, "rp") };
    fs.mkdirSync(path.join(root, "agents", "presets"), { recursive: true });
    fs.writeFileSync(path.join(root, "agents", "presets", "rp.json"), JSON.stringify(presets.rp));
    fs.writeFileSync(path.join(root, "agents", "settings.json"), JSON.stringify({ defaultPreset: "rp" }));
    const metas: (Json | undefined)[] = [undefined, {}, { agents: { v: 1, preset: "rp" } }, { agents: { v: 1, preset: "gone" } },
      { agents: { v: 1, own: [{ agent: "x-agent" }, { agent: "Bad Id" }, { agent: "x-agent" }] } },
      { agents: { v: 1, preset: "rp", show: { "scene-plan": "top1", "mood-tracker": "moon" } } }, { agents: "nope" }];
    for (const meta of metas) {
      const want = engine.resolveChatAgents(meta?.agents && typeof meta.agents === "object" ? meta.agents : null, presets, "rp").items;
      expect(plugin.chatAgents(host().fs as never, meta ?? {})).toEqual(want);
    }
  });
});

describe("a hint for the next reply", () => {
  const hinter = () => {
    const f = copy(keeper);
    f.agent = { formatVersion: 1, id: "scene-hint", version: "1.0.0", name: "Scene hint", trigger: { when: "after" }, models: {}, limits: { maxCalls: 0 } };
    f.nodes = [
      { id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give: [{ id: "last", source: "lastReply" }] } },
      { id: "tpl", type: "text.template", x: 0, y: 0, title: "Hint", params: { text: "Keep the imp in view. The last scene: {{last}}" } },
      { id: "out", type: "agent.output", x: 0, y: 0, title: "Out", params: { kind: "prompt-insert", label: "Scene hint", position: "after-history" } },
    ];
    f.edges = [{ id: "a", from: "in:last", to: "tpl:last" }, { id: "b", from: "tpl:text", to: "out:in" }];
    return compileAgent(f).file;
  };
  const reply = (chatId: string, messages: Json[]) => plugin.llmRequest({ key: "reply", request: { sessionId: chatId, messages } } as never, host() as never) as Json | null;

  beforeEach(() => {
    j("/agents/install", "PUT", { file: hinter(), grant: true });
    makeChat("c2", CHAT);
    useAgent("scene-hint");
  });

  it("adds the agent's text to the next reply request, with its label, and says where it came from", () => {
    expect(reply("c2", [{ role: "user", content: "Go on." }])).toBeNull(); // nothing yet
    expect(runChat("c2").ran[0]).toMatchObject({ status: "ok", calls: 0, outputs: 1 });
    const out = reply("c2", [{ role: "system", content: "S" }, { role: "user", content: "Go on." }]) as Json;
    expect(out.messages[1].content).toBe("Go on.\n\n[Scene hint]\nKeep the imp in view. The last scene: A small imp pops into the dark.");
    expect(out.promptSources.parts[0]).toMatchObject({ kind: "plugin", label: "Agent: Scene hint" });
  });

  it("is replaced by the agent's next run, and stops when the agent is switched off in the chat", () => {
    runChat("c2");
    setMessages("c2", [...CHAT, ["user", "x"], ["char", "The imp bows."]]);
    runChat("c2");
    const out = reply("c2", [{ role: "user", content: "Go on." }]) as Json;
    expect(out.messages[0].content).toContain("The imp bows.");
    expect(out.messages[0].content).not.toContain("pops into the dark");
    fs.writeFileSync(path.join(root, "chats", "c2.meta.json"), JSON.stringify({ id: "c2", agents: { v: 1, own: [{ agent: "scene-hint", on: false }] } }));
    expect(reply("c2", [{ role: "user", content: "Go on." }])).toBeNull();
  });

  it("only touches a reply request", () => {
    runChat("c2");
    expect(plugin.llmRequest({ key: "summary", request: { sessionId: "c2", messages: [] } } as never, host() as never)).toBeNull();
  });
});

describe("a note for the reply", () => {
  it("an agent with no model call runs at once and its note is kept under the reply's key, with the log fields the chat reads", () => {
    expect(j("/agents/install", "PUT", { file: copy(echo), grant: true })).toMatchObject({ ok: true, id: "scene-echo", missing: [] });
    makeChat("c1", CHAT);
    useAgent("scene-echo");
    expect(runChat("c1").ran).toEqual([{ agent: "scene-echo", status: "ok", calls: 0, writes: 0, outputs: 1 }]);
    const run = j("/agents/runs", "GET", undefined, { chatId: "c1" }).runs[0];
    expect(run).toMatchObject({ agent: "scene-echo", key: "m2#0", status: "ok", calls: 0, writes: [] });
    expect(run.outputs).toEqual([expect.objectContaining({ kind: "note", title: "Scene echo", text: "The scene just said: A small imp pops into the dark." })]);
  });
});

describe("choices for the reply", () => {
  it("are kept as lines under the reply's key, and the agent needs show:choices", () => {
    const r = j("/agents/install", "PUT", { file: copy(moves), grant: true });
    expect(r).toMatchObject({ ok: true, id: "next-moves", missing: [] });
    makeChat("c1", CHAT);
    useAgent("next-moves");
    expect(runChat("c1").ran).toEqual([{ agent: "next-moves", status: "ok", calls: 0, writes: 0, outputs: 1 }]);
    const run = j("/agents/runs", "GET", undefined, { chatId: "c1" }).runs[0];
    expect(run.outputs).toEqual([expect.objectContaining({ kind: "choices", choices: ["Look around", "Ask who is there", "Leave quietly"] })]);
  });
});

describe("drafts", () => {
  const put = (name: string, text: string) => {
    fs.mkdirSync(path.join(root, "agents/drafts"), { recursive: true });
    fs.writeFileSync(path.join(root, "agents/drafts", name + ".vertep-agent.json"), text, "utf8");
  };

  it("lists the files in agents/drafts with what an install would say about each", () => {
    put("scene-echo", JSON.stringify(copy(echo)));
    put("broken", "{ not json");
    const bad = copy(echo) as { edges: unknown[] };
    bad.edges = [{ id: "e1", from: "in:nope", to: "tpl:r" }];
    put("bad-wire", JSON.stringify(bad));
    const list = j("/agents/drafts").drafts;
    expect(list.map((d: Json) => d.name)).toEqual(["bad-wire", "broken", "scene-echo"]);
    const byName = Object.fromEntries(list.map((d: Json) => [d.name, d]));
    expect(byName["scene-echo"]).toMatchObject({ id: "scene-echo", title: "Scene echo", errors: [], needs: ["read:lastReply", "show:note"], installed: false });
    expect(byName["broken"].errors[0]).toMatchObject({ code: "E_JSON" });
    expect(byName["bad-wire"].errors.length).toBeGreaterThan(0);
  });

  it("installs a draft like an install does (the user still has to allow), and removes one", () => {
    put("scene-echo", JSON.stringify(copy(echo)));
    const r = j("/agents/drafts/install", "POST", { name: "scene-echo" });
    expect(r).toMatchObject({ ok: true, id: "scene-echo", granted: [] });
    expect(r.missing.length).toBeGreaterThan(0);
    expect(j("/agents/drafts").drafts[0].installed).toBe(true);
    expect(call("POST", "/agents/drafts/install", { name: "broken" }).status).toBe(404);
    put("broken", "{ not json");
    expect(call("POST", "/agents/drafts/install", { name: "broken" }).status).toBe(400);
    expect(j("/agents/drafts/broken", "DELETE")).toEqual({ ok: true });
    expect(exists("agents/drafts/broken.vertep-agent.json")).toBe(false);
  });
});

describe("editing a draft", () => {
  it("reads one back, saves a file with errors without a word, and copies an installed agent into the drafts", () => {
    expect(call("GET", "/agents/drafts/none").status).toBe(404);
    const edited = copy(echo) as { title: string; edges: unknown[] };
    edited.title = "Echo, half done";
    edited.edges = [];
    expect(j("/agents/drafts/half", "PUT", { file: edited })).toEqual({ ok: true, name: "half" });
    expect(j("/agents/drafts/half").file.title).toBe("Echo, half done");
    expect(j("/agents/drafts").drafts[0].errors.length).toBeGreaterThan(0);
    expect(call("PUT", "/agents/drafts/half", { nope: 1 }).status).toBe(400);
    expect(call("PUT", "/agents/drafts/bad name", { file: edited }).status).toBe(400);
    fs.writeFileSync(path.join(root, "agents/drafts/half.vertep-agent.json"), "{ nope", "utf8");
    expect(j("/agents/drafts/half").text).toBe("{ nope");
    j("/agents/install", "PUT", { file: copy(echo), grant: true });
    expect(j("/agents/drafts/copy", "POST", { id: "scene-echo" })).toEqual({ ok: true, name: "scene-echo" });
    const back = j("/agents/drafts/scene-echo").file;
    expect(back.agent.derived).toBeUndefined();
    expect(j("/agents/drafts/install", "POST", { name: "scene-echo" })).toMatchObject({ ok: true, updated: true });
    // a second copy opens the draft that is there: its edits are not lost
    j("/agents/drafts/scene-echo", "PUT", { file: { ...back, title: "Edited" } });
    expect(j("/agents/drafts/copy", "POST", { id: "scene-echo" })).toEqual({ ok: true, name: "scene-echo", existing: true });
    expect(j("/agents/drafts/scene-echo").file.title).toBe("Edited");
    expect(call("POST", "/agents/drafts/copy", { id: "ghost" }).status).toBe(404);
  });
});

describe("panels", () => {
  beforeEach(() => {
    j("/agents/install", "PUT", { file: copy(keeper), grant: true });
    makeChat("c1", CHAT);
    useAgent("dungeon-keeper");
  });

  it("gives the panels of the agents that are on, with the schema, the state and the state before the last run", () => {
    runChat("c1");
    const r = j("/agents/panels", "GET", undefined, { chatId: "c1" }).panels;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ agent: "dungeon-keeper", name: "Dungeon keeper", own: { mana: 40, rooms: [] }, prev: { mana: 50, rooms: [] } });
    expect(r[0].panels[0]).toMatchObject({ id: "keep", place: "float" });
    expect(r[0].schema.mana).toMatchObject({ type: "number", max: 100 });
  });

  it("an agent that is off, not allowed, or has no panels gives none", () => {
    useAgent("dungeon-keeper", { on: false });
    expect(j("/agents/panels", "GET", undefined, { chatId: "c1" }).panels).toEqual([]);
    useAgent("dungeon-keeper");
    j("/agents/grant", "POST", { id: "dungeon-keeper", tokens: [] });
    expect(j("/agents/panels", "GET", undefined, { chatId: "c1" }).panels).toEqual([]);
    j("/agents/install", "PUT", { file: copy(echo), grant: true });
    useAgent("scene-echo");
    expect(j("/agents/panels", "GET", undefined, { chatId: "c1" }).panels).toEqual([]);
  });

  it("wants a chat", () => {
    expect(call("GET", "/agents/panels", undefined, { chatId: "nope" }).status).toBe(404);
    expect(call("GET", "/agents/panels", undefined, {}).status).toBe(400);
  });
});

describe("config", () => {
  it("keeps a model per role and rejects junk", () => {
    expect(j("/agents/config", "PUT", { model: "openrouter/x", models: { fast: "openrouter/y", "bad role!": "z", slow: "has space" } })).toEqual({ model: "openrouter/x", models: { fast: "openrouter/y" } });
    expect(j("/agents/config")).toEqual({ model: "openrouter/x", models: { fast: "openrouter/y" } });
  });
  it("the question goes to the role's model", () => {
    j("/agents/config", "PUT", { models: { fast: "openrouter/y" } });
    j("/agents/install", "PUT", { file: copy(keeper), grant: true });
    makeChat("c1", CHAT);
    useAgent("dungeon-keeper");
    call("POST", "/agents/run", { chatId: "c1" });
    expect(requests[0][1].model).toBe("openrouter/y");
  });
});
