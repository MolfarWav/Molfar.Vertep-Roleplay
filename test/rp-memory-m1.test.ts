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

describe("M1.2 every reply op embeds the scan window", () => {
  const harbor = (texts: string[]) => texts.map((t) => (t.includes("harbor") ? [1, 0] : [0, 1]));
  const sentText = (m: ReturnType<typeof mockHost>) =>
    (m.requests.filter((r) => r.key === "reply").at(-1)!.req as { messages: { content: string }[] }).messages.map((x) => x.content).join("\n");

  async function setup() {
    writeJson("lorebooks/vecbook.json", {
      id: "vecbook", name: "vecbook", vectorized: { scoreThreshold: 0.35 },
      entries: [{ uid: 0, title: "V", keys: [], content: "The harbor district floods every spring.", enabled: true, order: 100, position: "before_char", status: "vectorized" }],
    });
    writeJson("groups/duo.json", { id: "duo", name: "Duo", memberIds: ["aria", "bo"], mode: "list", mutedIds: [] });
    writeJson("characters/bo/card.json", { spec: "chara_card_v2", name: "Bo", description: "chill", first_mes: "" });
    const m = mockHost({ embedder: harbor });
    return m;
  }
  async function chatWith(m: ReturnType<typeof mockHost>, body: Record<string, unknown>) {
    await drive(engineUrl, { method: "POST", path: "/chats", body }, m);
    const id = chatIdOf();
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["vecbook"] } }, m);
    seedPairs(id, 3, "We watched the harbor at night.");
    return id;
  }

  it("send: the scan vector reaches assemble (the vectorized entry fires)", async () => {
    const m = await setup();
    const id = await chatWith(m, { characterId: "aria" });
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "and the harbor again" } }, m);
    expect(r.pending).toBe(false);
    expect(r.passes).toBe(3);
    expect(sentText(m)).toContain("harbor district floods");
  });

  for (const [op, body] of [
    ["swipe", { dir: 1 }],
    ["continue", {}],
    ["impersonate", {}],
  ] as const) {
    it(`${op}: embeds first, then the model request carries the vectorized entry, in 3 passes`, async () => {
      const m = await setup();
      const id = await chatWith(m, { characterId: "aria" });
      const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/${op}`, body }, m);
      expect(r.status).toBe(200);
      expect(r.pending).toBe(false);
      expect(r.passes).toBe(3);
      expect(m.embedRequests.length).toBe(1);
      expect(sentText(m)).toContain("harbor district floods");
    });
  }

  it("next: a group member's turn embeds first too", async () => {
    const m = await setup();
    const id = await chatWith(m, { groupId: "duo" });
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/next`, body: { charId: "bo" } }, m);
    expect(r.status).toBe(200);
    expect(r.pending).toBe(false);
    expect(r.passes).toBe(3);
    expect(sentText(m)).toContain("harbor district floods");
  });

  it("without anything to embed a swipe still takes two passes", async () => {
    const m = mockHost({ embedder: harbor });
    const id = await newChat(m);
    seedPairs(id, 2, "plain talk");
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: 1 } }, m);
    expect(r.passes).toBe(2);
    expect(m.embedRequests.length).toBe(0);
  });

  it("a failed embed does not break the op", async () => {
    const m = mockHost({ embedder: () => null });
    writeJson("lorebooks/vecbook.json", {
      id: "vecbook", name: "vecbook", entries: [{ uid: 0, title: "V", keys: [], content: "x harbor", enabled: true, order: 100, position: "before_char", status: "vectorized" }],
    });
    const id = await newChat(m);
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["vecbook"] } }, m);
    seedPairs(id, 2, "harbor");
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/continue`, body: {} }, m);
    expect(r.status).toBe(200);
    expect(r.pending).toBe(false);
    expect(r.passes).toBe(3);
  });
});

describe("M1.3 a deleted chat leaves no memory behind", () => {
  it("DELETE /chats/:id removes the facts vault too", async () => {
    const m = mockHost();
    const id = await newChat(m);
    fs.writeFileSync(path.join(root, "chats", id + ".memories.json"), JSON.stringify([{ id: "m1", text: "a fact", importance: 3 }]));
    const keep = path.join(root, "chats", "other.memories.json");
    fs.writeFileSync(keep, "[]");
    const r = await drive(engineUrl, { method: "DELETE", path: `/chats/${id}` }, m);
    expect(r.status).toBe(200);
    expect(fs.existsSync(path.join(root, "chats", id + ".memories.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, "chats", id + ".jsonl"))).toBe(false);
    expect(fs.existsSync(keep)).toBe(true);
  });

  it("deleting a character takes its solo chats' vaults along", async () => {
    const m = mockHost();
    const id = await newChat(m);
    fs.writeFileSync(path.join(root, "chats", id + ".memories.json"), "[]");
    await drive(engineUrl, { method: "DELETE", path: "/characters/aria" }, m);
    expect(fs.existsSync(path.join(root, "chats", id + ".memories.json"))).toBe(false);
  });

  const litopysTick = async (m: ReturnType<typeof mockHost>) => {
    const mod = (await import(litopysUrl)) as { onTick: Function };
    mod.onTick({}, m.host);
  };
  const entry = (name: string) => ({ charName: name, userName: "You", slug: "x", worldFacts: [{ id: "f1", text: "a fact", kind: "lore", status: "active" }], chronicle: [], storySoFar: null, lastExtractLen: 2, turnsExtracted: 1, lastCurateLen: 0, turnsCurated: 0 });

  it("Litopys onTick drops the entry, proposals and vault page of a chat whose transcript is gone", async () => {
    const live = "c-live-aaaaaa", dead = "c-dead-bbbbbb";
    for (const id of [live]) {
      fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), JSON.stringify({ role: "user", text: "hi" }) + "\n");
      fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ id }));
    }
    writeJson("litopys/store.json", { chats: { [live]: entry("Aria"), [dead]: entry("Aria") } });
    writeJson("litopys/proposals.json", { items: [{ id: "p1", chatId: live, status: "pending" }, { id: "p2", chatId: dead, status: "pending" }] });
    fs.mkdirSync(path.join(root, "vault-chats"), { recursive: true });
    fs.writeFileSync(path.join(root, "vault-chats", "aria-aaaaaa.md"), "live");
    fs.writeFileSync(path.join(root, "vault-chats", "aria-bbbbbb.md"), "dead");
    await litopysTick(mockHost());
    const store = JSON.parse(fs.readFileSync(path.join(root, "litopys", "store.json"), "utf8"));
    expect(Object.keys(store.chats)).toEqual([live]);
    const props = JSON.parse(fs.readFileSync(path.join(root, "litopys", "proposals.json"), "utf8"));
    expect(props.items.map((p: { id: string }) => p.id)).toEqual(["p1"]);
    expect(fs.existsSync(path.join(root, "vault-chats", "aria-bbbbbb.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, "vault-chats", "aria-aaaaaa.md"))).toBe(true);
  });

  it("nothing to drop means nothing is written", async () => {
    const live = "c-live-aaaaaa";
    fs.writeFileSync(path.join(root, "chats", live + ".jsonl"), JSON.stringify({ role: "user", text: "hi" }) + "\n");
    fs.writeFileSync(path.join(root, "chats", live + ".meta.json"), JSON.stringify({ id: live }));
    writeJson("litopys/store.json", { chats: { [live]: entry("Aria") } });
    const before = fs.statSync(path.join(root, "litopys", "store.json")).mtimeMs;
    const writes: string[] = [];
    const m = mockHost();
    const write = m.host.fs.write;
    m.host.fs.write = (rel: string, c: string) => { writes.push(rel); write(rel, c); };
    await litopysTick(m);
    expect(writes.filter((w) => w.startsWith("litopys/"))).toEqual([]);
    expect(fs.statSync(path.join(root, "litopys", "store.json")).mtimeMs).toBe(before);
  });
});

describe("M1.4 Litopys adopts the Archivarius store once", () => {
  const litopysRoute = async (path_: string) => {
    const m = mockHost();
    return drive(litopysUrl, { method: "GET", path: path_ }, m);
  };
  const oldStore = { chats: { "c-old-111111": { charName: "Aria", worldFacts: [{ id: "f1", text: "old fact", kind: "lore", status: "active" }], chronicle: [] } } };

  it("only the old dir: store, proposals and config are copied, the old files stay", async () => {
    writeJson("archivarius/store.json", oldStore);
    writeJson("archivarius/proposals.json", { items: [{ id: "p1", chatId: "c-old-111111", status: "pending" }] });
    writeJson("archivarius/config.json", { extractEveryNTurns: 5 });
    const cfg = await litopysRoute("/litopys/config");
    expect(cfg.json.extractEveryNTurns).toBe(5);
    expect(JSON.parse(fs.readFileSync(path.join(root, "litopys", "store.json"), "utf8"))).toEqual(oldStore);
    expect(JSON.parse(fs.readFileSync(path.join(root, "litopys", "proposals.json"), "utf8")).items[0].id).toBe("p1");
    expect(JSON.parse(fs.readFileSync(path.join(root, "litopys", "config.json"), "utf8")).extractEveryNTurns).toBe(5);
    expect(fs.existsSync(path.join(root, "archivarius", "store.json"))).toBe(true);
    // copied once: a later change to the old files is not read again
    writeJson("archivarius/store.json", { chats: {} });
    const st = await litopysRoute("/litopys/state?chatId=c-old-111111");
    expect(JSON.stringify(st.json)).toContain("\"facts\":1");
  });

  it("both present: litopys wins and nothing is copied", async () => {
    const mine = { chats: { "c-new-222222": { charName: "Bo", worldFacts: [{ id: "f9", text: "new fact", kind: "lore", status: "active" }], chronicle: [] } } };
    writeJson("litopys/store.json", mine);
    writeJson("archivarius/store.json", oldStore);
    writeJson("archivarius/proposals.json", { items: [{ id: "p1", chatId: "x", status: "pending" }] });
    writeJson("archivarius/config.json", { extractEveryNTurns: 9 });
    const cfg = await litopysRoute("/litopys/config");
    expect(cfg.json.extractEveryNTurns).not.toBe(9);
    expect(JSON.parse(fs.readFileSync(path.join(root, "litopys", "store.json"), "utf8"))).toEqual(mine);
    expect(fs.existsSync(path.join(root, "litopys", "proposals.json"))).toBe(false);
    expect(fs.existsSync(path.join(root, "litopys", "config.json"))).toBe(false);
  });

  it("a file litopys already has is not overwritten by the move", async () => {
    writeJson("litopys/config.json", { extractEveryNTurns: 3 });
    writeJson("archivarius/store.json", oldStore);
    writeJson("archivarius/config.json", { extractEveryNTurns: 9 });
    const cfg = await litopysRoute("/litopys/config");
    expect(cfg.json.extractEveryNTurns).toBe(3);
    expect(fs.existsSync(path.join(root, "litopys", "store.json"))).toBe(true);
  });

  it("neither present: nothing is created by reading", async () => {
    await litopysRoute("/litopys/config");
    expect(fs.existsSync(path.join(root, "litopys", "store.json"))).toBe(false);
  });
});
