/**
 * Memory foundations (M1): the history budget counts tokens and reserves room,
 * every reply op gets the scan vector, a deleted chat leaves no memory behind,
 * Litopys adopts the old Archivarius store once, and the dashboard's notes are
 * picked by relevance and deduplicated on write.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const litopysUrl = new URL("../plugins/litopys/plugin.js", import.meta.url).href;
const relationsUrl = new URL("../plugins/relations/plugin.js", import.meta.url).href;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "m1-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
  writePreset({});
  fs.mkdirSync(path.join(root, "characters", "aria"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "characters", "aria", "card.json"),
    JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista.", personality: "dry", scenario: "night", first_mes: "Welcome in, {{user}}.", mes_example: "" }),
  );
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

const writePreset = (extra: Record<string, unknown>) =>
  fs.writeFileSync(
    path.join(root, "presets", "default.json"),
    JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], temperature: 0.8, openai_max_tokens: 512, openai_max_context: 8192, ...extra }),
  );
const writeJson = (rel: string, v: unknown) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(v));
};

type Out = { status?: number; json?: Record<string, unknown>; __llmPending?: boolean; stash?: Record<string, unknown> };

function mockHost(opts: { reply?: string; embedder?: (texts: string[]) => number[][] | null } = {}) {
  const results: Record<string, unknown> = {};
  const embedResults: Record<string, unknown> = {};
  const requests: { key: string; req: Record<string, unknown> }[] = [];
  const embedRequests: { key: string; req: { texts: string[] } }[] = [];
  const resolve = () => {
    for (const k of Object.keys(embedResults)) delete embedResults[k];
    for (const { key } of requests) {
      results[key] = { text: opts.reply ?? "MOCK-REPLY", model: "mock/model", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costTotal: 0 } };
    }
    for (const { key, req } of embedRequests) embedResults[key] = opts.embedder ? opts.embedder(req.texts ?? []) : [[0.1, 0.9]];
  };
  const host = {
    fs: {
      root,
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => {
        const full = path.resolve(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: {
      request: (key: string, req: Record<string, unknown>) => { requests.push({ key, req }); },
      results,
      embed: (key: string, req: { texts: string[] }) => { embedRequests.push({ key, req }); },
      embedResults,
    },
    net: { request: () => {}, results: {} },
    zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
    log: () => {},
  };
  return { host, requests, embedRequests, resolve };
}

/** Like the runtime: at most 3 passes in all, results of one pass feed the next. */
async function drive(pluginUrl: string, req: { method: string; path: string; body?: unknown }, mock: ReturnType<typeof mockHost>) {
  const mod = (await import(pluginUrl)) as { handleRoute: Function };
  const results = mock.host.llm.results as Record<string, unknown>;
  for (const k of Object.keys(results)) delete results[k];
  const call: Record<string, unknown> = { method: req.method, path: req.path, query: {}, body: req.body };
  let out = mod.handleRoute(call, mock.host) as Out;
  let passes = 1;
  while (out && out.__llmPending && passes < 3) {
    if (out.stash && typeof out.stash === "object") call.stash = out.stash;
    mock.resolve();
    out = mod.handleRoute(call, mock.host) as Out;
    passes++;
  }
  return { status: out?.status ?? 200, json: (out?.json ?? {}) as Record<string, unknown>, pending: out?.__llmPending === true, passes };
}

const chatIdOf = () => (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");

/** Adds user/char pairs to an existing chat's transcript. */
function seedPairs(id: string, n: number, text: string, tag = "") {
  const file = path.join(root, "chats", id + ".jsonl");
  const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
  for (let i = 0; i < n; i++) {
    lines.push(JSON.stringify({ id: `u${tag}${i}`, name: "You", charId: null, role: "user", text: "ok", at: i, swipes: ["ok"], swipe: 0 }));
    lines.push(JSON.stringify({ id: `c${tag}${i}`, name: "Aria", charId: "aria", role: "char", text, at: i, swipes: [text], swipe: 0 }));
  }
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

const CYR = "Привіт, мандрівнику, ласкаво просимо до нашої маленької кав'ярні на краю світу. ".repeat(4); // ~320 chars, Cyrillic

async function newChat(m: ReturnType<typeof mockHost>) {
  await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
  return chatIdOf();
}

/** Fresh chat with `pairs` Cyrillic turns; what the next send reports as trimmed. */
async function trimmedFor(presetExtra: Record<string, unknown>, pairs = 22) {
  fs.rmSync(path.join(root, "chats"), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "chats"));
  writePreset(presetExtra);
  const m = mockHost();
  const id = await newChat(m);
  seedPairs(id, pairs, CYR);
  const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "again" } }, m);
  return { trimmed: Number(r.json.trimmed || 0), m };
}

describe("M1.1 history budget in tokens, with reserves", () => {
  it("a Cyrillic history that fit under chars/4 now trims, newest turn kept", async () => {
    // ~7000 chars: the old chars/4 rule (16000 chars here) trimmed nothing
    const { trimmed, m } = await trimmedFor({ openai_max_context: 4000, openai_max_tokens: 256 });
    expect(trimmed).toBeGreaterThan(0);
    const sent = (m.requests.at(-1)!.req as { messages: { content: string }[] }).messages;
    expect(sent.at(-1)!.content).toContain("again");
  });

  it("an English history of the same size does not trim, so the estimate is by script", async () => {
    const m = mockHost();
    writePreset({ openai_max_context: 4000, openai_max_tokens: 256 });
    const id = await newChat(m);
    seedPairs(id, 22, "The traveler walked into the little cafe at the edge of the world and ordered tea. ".repeat(4));
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "again" } }, m);
    expect(r.json.trimmed).toBeUndefined();
  });

  it("the reply reserve grows with openai_max_tokens", async () => {
    const small = (await trimmedFor({ openai_max_context: 4000, openai_max_tokens: 100 }, 12)).trimmed;
    const big = (await trimmedFor({ openai_max_context: 4000, openai_max_tokens: 1500 }, 12)).trimmed;
    expect(big).toBeGreaterThan(small);
  });

  it("no max tokens set reserves 1024 for the reply", async () => {
    const unset = (await trimmedFor({ openai_max_context: 4000, openai_max_tokens: 0 })).trimmed;
    const explicit = (await trimmedFor({ openai_max_context: 4000, openai_max_tokens: 1024 })).trimmed;
    expect(unset).toBeGreaterThan(0);
    expect(unset).toBe(explicit);
  });

  it("a disabled dashboard injection lowers the reserve, an enabled Litopys insert raises it", async () => {
    const preset = { openai_max_context: 4000, openai_max_tokens: 256 };
    const normal = (await trimmedFor(preset)).trimmed;
    writeJson("dashboard/config.json", { injection: { enabled: false } });
    const noDash = (await trimmedFor(preset)).trimmed;
    expect(noDash).toBeLessThan(normal);
    writeJson("litopys/config.json", { inject: true });
    expect((await trimmedFor(preset)).trimmed).toBeGreaterThan(noDash);
    // a bigger dashboard insert reserves more
    writeJson("litopys/config.json", { inject: false });
    writeJson("dashboard/config.json", { injection: { enabled: true, maxTokens: 1000 } });
    expect((await trimmedFor(preset)).trimmed).toBeGreaterThan(normal);
    // unreadable configs fall back to the defaults instead of failing the send
    fs.writeFileSync(path.join(root, "dashboard", "config.json"), "{not json");
    fs.writeFileSync(path.join(root, "litopys", "config.json"), "{not json");
    expect((await trimmedFor(preset)).trimmed).toBe(normal);
  });
});
