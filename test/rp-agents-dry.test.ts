/**
 * POST /agents/dry (#137): the trial of an agent on a real chat. The chat is only read; the agent runs with example
 * answers, answers the person typed, or the model's. The editor's own trial (src/lib/agent-dry.ts) and this route use
 * the same executor, so given the same inputs and answers they must say the same.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import keeper from "./fixtures/dungeon-keeper.vertep-agent.json";
import mood from "./fixtures/mood-tracker.vertep-agent.json";
import { dryRun } from "../src/lib/agent-dry";
import { chainAgent } from "./fixtures/chain-agent";

const plugin = (await import(new URL("../plugins/agents/plugin.js", import.meta.url).href)) as typeof import("../plugins/agents/plugin.js");

type Json = Record<string, any>;
const copy = (f: unknown): any => JSON.parse(JSON.stringify(f));

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
const call = (method: string, p: string, body?: unknown, stash?: Json) =>
  plugin.handleRoute({ method, path: p, query: {}, body, stash } as never, host() as never) as { status?: number; json?: Json; __llmPending?: boolean; stash?: Json };
const dry = (body: Json) => call("POST", "/agents/dry", body);
const put = (rel: string, v: unknown) => { const full = path.join(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, JSON.stringify(v)); };
const tree = (dir = root, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, e.name); if (e.isDirectory()) tree(full, out); else out.push(path.relative(root, full)); }
  return out.sort();
};

function makeChat(id: string, msgs: [string, string][], meta: Json = {}) {
  fs.mkdirSync(path.join(root, "chats"), { recursive: true });
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ id, title: "Keeper chat", characterId: null, ...meta }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map(([role, text], i) => JSON.stringify({ id: "m" + i, role, name: role === "user" ? "Taras" : "Aria", text, swipe: 0 })).join("\n") + "\n");
}
const CHAT: [string, string][] = [["char", "Welcome, keeper."], ["user", "I summon an imp."], ["char", "A small imp pops into the dark."]];

/** Play the engine: answer each pass's questions until the route is done. */
function liveRun(body: Json, answer: (q: Json, key: string) => Json = () => ({ text: "YES", model: "m", usage: { input: 120, output: 4, costTotal: 0.001, priced: true } })): Json {
  results = {};
  let stash: Json = {};
  for (let pass = 0; pass < 12; pass++) {
    requests = [];
    const r = call("POST", "/agents/dry", { live: true, ...body }, stash);
    if (!r.__llmPending) return r as Json;
    stash = r.stash ?? stash;
    results = {};
    for (const [k, q] of requests) results[k] = answer(q, k);
  }
  throw new Error("never finished");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "agents-dry-"));
  requests = [];
  results = {};
  makeChat("c1", CHAT);
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

describe("what the route needs", () => {
  it("asks for a chat, an agent file and a chat that exists", () => {
    expect(dry({ file: copy(keeper) }).status).toBe(400);
    expect(dry({ chatId: "nope", file: copy(keeper) }).status).toBe(404);
    expect(dry({ chatId: "c1" }).status).toBe(400);
    expect(dry({ chatId: "c1", draft: "missing" }).status).toBe(404);
    expect(dry({ chatId: "c1", agent: "missing" }).status).toBe(404);
  });

  it("refuses a file that does not pass the check, and says why", () => {
    const broken = copy(keeper);
    broken.edges.pop();
    const r = dry({ chatId: "c1", file: broken });
    expect(r.status).toBe(400);
    expect(r.json?.errors.length).toBeGreaterThan(0);
  });

  it("takes the file from the editor, a draft by name or an installed agent", () => {
    put("agents/drafts/keeper.vertep-agent.json", keeper);
    put("agents/dungeon-keeper.vertep-agent.json", keeper);
    expect(dry({ chatId: "c1", file: copy(keeper) }).json?.source).toEqual({ kind: "file", id: "dungeon-keeper" });
    expect(dry({ chatId: "c1", draft: "keeper" }).json?.source).toEqual({ kind: "draft", id: "keeper" });
    expect(dry({ chatId: "c1", agent: "dungeon-keeper" }).json?.source).toEqual({ kind: "agent", id: "dungeon-keeper" });
  });
});

describe("probe: what the chat would give the agent", () => {
  it("reads the inputs and the memory from the chat, and says which model each role would ask", () => {
    put("agents/state/c1/dungeon-keeper.json", { v: 1, own: { mana: 17, rooms: [] }, last: "", before: null });
    put("settings.json", { model: "app/model" });
    const r = dry({ chatId: "c1", file: copy(keeper), probe: true }).json as Json;
    expect(r).toMatchObject({ probe: true, maxCalls: 1, chat: { id: "c1", title: "Keeper chat", messages: 3, lastSpeaker: "Aria" }, models: { fast: "app/model" } });
    expect(r.inputs).toEqual([expect.objectContaining({ id: "msg", source: "lastUserMessage", text: "I summon an imp.", empty: false })]);
    expect(r.own).toEqual({ mana: 17, rooms: [] });
    // the chat's own model beats the app's; what the user chose for the agent beats both
    makeChat("c2", CHAT, { model: "chat/model" });
    expect(dry({ chatId: "c2", file: copy(keeper), probe: true }).json?.models).toEqual({ fast: "chat/model" });
    put("agents/config.json", { byAgent: { "dungeon-keeper": { models: { fast: "mine/cheap" } } } });
    expect(dry({ chatId: "c2", file: copy(keeper), probe: true }).json?.models).toEqual({ fast: "mine/cheap" });
    // the Dashboard's sensor model is not the chat's model
    put("dashboard/config.json", { sensorModel: "sensor/model" });
    put("agents/config.json", {});
    expect(dry({ chatId: "c2", file: copy(keeper), probe: true }).json?.models).toEqual({ fast: "chat/model" });
  });

  it("shows an empty Dashboard field as empty, and what the person typed instead", () => {
    const r = dry({ chatId: "c1", file: copy(mood), probe: true }).json as Json;
    const old = r.inputs.find((i: Json) => i.id === "oldMood");
    expect(old).toMatchObject({ source: "state", field: "mood", text: "", empty: true });
    const typed = dry({ chatId: "c1", file: copy(mood), probe: true, inputs: { oldMood: "tense" } }).json as Json;
    expect(typed.inputs.find((i: Json) => i.id === "oldMood")).toMatchObject({ text: "tense", empty: false });
  });

  it("writes nothing", () => {
    const before = tree();
    dry({ chatId: "c1", file: copy(keeper), probe: true });
    expect(tree()).toEqual(before);
  });
});

describe("a run without the model", () => {
  it("runs on the chat with an example answer, and the same inputs give the same result as the editor's trial", () => {
    const r = dry({ chatId: "c1", file: copy(keeper) }).json as Json;
    expect(r).toMatchObject({ live: false, status: "done", calls: 1 });
    expect(r.asked).toEqual([expect.objectContaining({ node: "ask", example: true })]);
    const here = dryRun(copy(keeper), {
      inputs: { msg: "I summon an imp." }, own: {}, replies: {}, chat: { messageCount: 3, lastSpeaker: "Aria" }, seed: "c1|dungeon-keeper|dry",
    });
    expect(r.wires).toEqual(JSON.parse(JSON.stringify(here.wires)));
    expect(r.ownWrites).toEqual(here.ownWrites);
    expect(r.ownAfter).toEqual(here.ownAfter);
    expect(r.outputs).toEqual(here.outputs);
    expect(r.nodes).toEqual(here.nodes);
  });

  it("uses the answers it is given, even a bad one", () => {
    const yes = dry({ chatId: "c1", file: copy(keeper), replies: { ask: "YES\nan imp" } }).json as Json;
    expect(yes.ownAfter.mana).toBe(40);
    const no = dry({ chatId: "c1", file: copy(keeper), replies: { ask: "NO" } }).json as Json;
    expect(no.ownWrites).toEqual([]);
    expect(no.asked[0]).toMatchObject({ reply: "NO", example: false });
  });

  it("starts from the memory the chat has saved, with the person's changes on top", () => {
    put("agents/state/c1/dungeon-keeper.json", { v: 1, own: { mana: 17, rooms: [] }, last: "", before: null });
    expect(dry({ chatId: "c1", file: copy(keeper) }).json?.ownAfter.mana).toBe(7);
    expect(dry({ chatId: "c1", file: copy(keeper), own: { mana: 60 } }).json?.ownAfter.mana).toBe(50);
  });

  it("changes nothing on disk", () => {
    put("agents/state/c1/dungeon-keeper.json", { v: 1, own: { mana: 17, rooms: [] }, last: "", before: null });
    const before = tree();
    const text = fs.readFileSync(path.join(root, "agents/state/c1/dungeon-keeper.json"), "utf8");
    dry({ chatId: "c1", file: copy(keeper) });
    dry({ chatId: "c1", file: copy(mood) });
    expect(tree()).toEqual(before);
    expect(fs.readFileSync(path.join(root, "agents/state/c1/dungeon-keeper.json"), "utf8")).toBe(text);
  });

  it("an agent that writes a Dashboard field is tried too: the write is listed, not applied", () => {
    const r = dry({ chatId: "c1", file: copy(mood), replies: { ask: '{"mood":"calm"}' } }).json as Json;
    expect(r.status).toBe("done");
    expect(r.dashWrites.length).toBeGreaterThan(0);
  });
});

describe("a run with the model", () => {
  it("asks the chosen model once, with the prompt a real run would send, and uses its answer", () => {
    put("settings.json", { model: "app/model" });
    const r = liveRun({ chatId: "c1", file: copy(keeper) });
    expect(r).toMatchObject({ status: 200 });
    const out = r.json as Json;
    expect(out).toMatchObject({ live: true, status: "done", calls: 1, ownAfter: { mana: 40 }, usage: { input: 120, output: 4, priced: true } });
    expect(out.asked).toEqual([expect.objectContaining({ node: "ask", example: false, model: "m", reply: "YES" })]);
    expect(out.asked[0].prompt).toContain("I summon an imp.");
  });

  it("sends the model it said it would", () => {
    put("settings.json", { model: "app/model" });
    let seen: Json | null = null;
    liveRun({ chatId: "c1", file: copy(keeper) }, (q) => { seen = q; return { text: "NO", model: "m" }; });
    results = {};
    requests = [];
    call("POST", "/agents/dry", { chatId: "c1", file: copy(keeper), live: true });
    expect(requests[0][1].model).toBe("app/model");
    expect(requests[0][1].messages[0].content).toMatch(/YES or NO/);
    expect(seen).not.toBeNull();
    requests = [];
    call("POST", "/agents/dry", { chatId: "c1", file: copy(keeper), live: true, model: "other/one" });
    expect(requests[0][1].model).toBe("other/one");
  });

  it("a model that fails or says nothing stops the run with a reason, and the error is kept", () => {
    const out = liveRun({ chatId: "c1", file: copy(keeper) }, () => ({ text: "", model: "m", error: "429 rate limited" })).json as Json;
    expect(out.status).toBe("failed");
    expect(out.asked[0]).toMatchObject({ node: "ask", error: "429 rate limited" });
    expect(out.ownWrites).toEqual([]);
  });

  it("writes nothing", () => {
    const before = tree();
    liveRun({ chatId: "c1", file: copy(keeper) });
    expect(tree()).toEqual(before);
  });

  it("follows a chain of questions, one pass for each, and adds up the cost", () => {
    const out = liveRun({ chatId: "c1", file: chainAgent(3) }, (_q, key) => ({ text: "answer " + key, model: "m", usage: { input: 10, output: 2, costTotal: 0.5, priced: true } })).json as Json;
    expect(out).toMatchObject({ status: "done", calls: 3, usage: { input: 30, output: 6, cost: 1.5 } });
    expect(out.asked.map((a: Json) => a.node)).toEqual(["a1", "a2", "a3"]);
    expect(out.asked[1].prompt).toContain("answer dry_1");
  });

  it("is refused when the agent can make more calls than the user allowed it; a trial without the model is not", () => {
    put("agents/config.json", { byAgent: { chain: { maxCalls: 2 } } });
    const r = call("POST", "/agents/dry", { chatId: "c1", file: chainAgent(3), live: true });
    expect(r.status).toBe(400);
    expect(r.json?.error).toMatch(/limit of 2/);
    expect(call("POST", "/agents/dry", { chatId: "c1", file: chainAgent(3) }).status).toBe(200);
  });
});
