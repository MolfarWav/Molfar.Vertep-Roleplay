import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const litopysUrl = new URL("../plugins/litopys/plugin.js", import.meta.url).href;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "m3-engine-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
  fs.mkdirSync(path.join(root, "characters", "kryll"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "characters", "kryll", "card.json"),
    JSON.stringify({
      spec: "chara_card_v2",
      name: "Kryll",
      description: "A bartender on a remote station.",
      personality: "dry",
      scenario: "closing time",
      first_mes: "",
      mes_example: "",
    }),
  );
  fs.writeFileSync(
    path.join(root, "personas", "vey.json"),
    JSON.stringify({ id: "vey", name: "Vey", description: "" }),
  );
  fs.writeFileSync(
    path.join(root, "settings.json"),
    JSON.stringify({ model: null, personaId: "vey" }),
  );
  writePreset({});
});
afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* watcher races */
  }
});

function writePreset(extra: Record<string, unknown>) {
  fs.writeFileSync(
    path.join(root, "presets", "default.json"),
    JSON.stringify({
      id: "default",
      name: "Default",
      prompts: [],
      prompt_order: [],
      temperature: 0.8,
      openai_max_tokens: 512,
      openai_max_context: 8192,
      ...extra,
    }),
  );
}

function writeJson(rel: string, v: unknown) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(v));
}

function readJson(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.resolve(root, rel), "utf8"));
}

type Out = {
  status?: number;
  json?: Record<string, unknown>;
  __llmPending?: boolean;
  stash?: Record<string, unknown>;
};

function mockHost(opts: { reply?: string; embedder?: (texts: string[]) => number[][] | null } = {}) {
  const results: Record<string, unknown> = {};
  const embedResults: Record<string, unknown> = {};
  const requests: { key: string; req: Record<string, unknown> }[] = [];
  const embedRequests: { key: string; req: { texts: string[] } }[] = [];
  const resolve = () => {
    for (const k of Object.keys(embedResults)) delete embedResults[k];
    for (const { key } of requests) {
      results[key] = {
        text: opts.reply ?? "MOCK-REPLY",
        model: "mock/model",
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costTotal: 0 },
      };
    }
    for (const { key, req } of embedRequests) {
      embedResults[key] = opts.embedder ? opts.embedder(req.texts ?? []) : [[0.1, 0.9]];
    }
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
      request: (key: string, req: Record<string, unknown>) => {
        requests.push({ key, req });
      },
      results,
      embed: (key: string, req: { texts: string[] }) => {
        embedRequests.push({ key, req });
      },
      embedResults,
    },
    net: { request: () => {}, results: {} },
    zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
    log: () => {},
  };
  return { host, requests, embedRequests, resolve };
}

async function drive(pluginUrl: string, req: { method: string; path: string; body?: unknown }, mock: ReturnType<typeof mockHost>) {
  const mod = (await import(pluginUrl)) as { handleRoute: Function };
  const results = mock.host.llm.results as Record<string, unknown>;
  for (const k of Object.keys(results)) delete results[k];
  const call: Record<string, unknown> = { method: req.method, path: req.path, query: {}, body: req.body };
  let out = mod.handleRoute(call, mock.host) as Out | null;
  if (out === null) return { status: 404, json: {}, pending: false, passes: 1 };
  let passes = 1;
  while (out && out.__llmPending && passes < 3) {
    if (out.stash && typeof out.stash === "object") call.stash = out.stash;
    mock.resolve();
    out = mod.handleRoute(call, mock.host) as Out | null;
    passes++;
    if (out === null) return { status: 404, json: {}, pending: false, passes };
  }
  return {
    status: out?.status ?? 200,
    json: (out?.json ?? {}) as Record<string, unknown>,
    pending: out?.__llmPending === true,
    passes,
  };
}

function chatIdOf() {
  return (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
}

function seedPairs(id: string, n: number, text: string, tag = "") {
  const file = path.join(root, "chats", id + ".jsonl");
  const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
  for (let i = 0; i < n; i++) {
    lines.push(
      JSON.stringify({
        id: `u${tag}${i}`,
        name: "Vey",
        charId: null,
        role: "user",
        text: "ok",
        at: i,
        swipes: ["ok"],
        swipe: 0,
      }),
    );
    lines.push(
      JSON.stringify({
        id: `c${tag}${i}`,
        name: "Kryll",
        charId: "kryll",
        role: "char",
        text,
        at: i,
        swipes: [text],
        swipe: 0,
      }),
    );
  }
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

function seedNumberedPairs(id: string, n: number) {
  const file = path.join(root, "chats", id + ".jsonl");
  const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
  for (let i = 0; i < n; i++) {
    lines.push(
      JSON.stringify({
        id: `u${i}`,
        name: "Vey",
        charId: null,
        role: "user",
        text: `user turn #${i}`,
        at: i,
        swipes: [`user turn #${i}`],
        swipe: 0,
      }),
    );
    lines.push(
      JSON.stringify({
        id: `c${i}`,
        name: "Kryll",
        charId: "kryll",
        role: "char",
        text: `char reply #${i}`,
        at: i,
        swipes: [`char reply #${i}`],
        swipe: 0,
      }),
    );
  }
  fs.writeFileSync(file, lines.join("\n") + "\n");
}

async function newChat(m: ReturnType<typeof mockHost>) {
  const r = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "kryll" } }, m);
  // the new chat's own id: several chats may share the test root
  return (r.json && (r.json.meta?.id || r.json.id)) || chatIdOf();
}

async function chatWithThirty() {
  const m = mockHost();
  const id = await newChat(m);
  seedNumberedPairs(id, 15);
  writeJson("litopys/config.json", { recentMessages: 6 });
  writeJson(`litopys/chats/${id}.json`, {
    chatId: id,
    migrated: true,
    chapters: [
      { id: "ch1", from: "u0", to: "c4", count: 10, kind: "scene" },
      { id: "ch2", from: "u5", to: "c9", count: 10, kind: "scene" },
    ],
    facts: [],
    proposals: [],
    counters: { chapter: 2, fact: 0, proposal: 0 },
  });
  return { id, m };
}

/** "user turn #1" must not match "user turn #10". */
const hasNum = (c: string, s: string) => {
  const at = c.indexOf(s);
  return at >= 0 && !/\d/.test(c.charAt(at + s.length));
};

function messageContents(r: Record<string, unknown>) {
  return ((r.messages ?? []) as { role: string; content: string }[]).map((x) => x.content);
}

it("chapters 1-10 and 11-20 with recentMessages 6 drop messages 1-20 from the preview", async () => {
  const { id, m } = await chatWithThirty();
  const r = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
  expect(r.status).toBe(200);
  const contents = messageContents(r.json);
  for (let i = 0; i < 10; i++) {
    expect(contents.some((c) => hasNum(c, `user turn #${i}`))).toBe(false);
    expect(contents.some((c) => hasNum(c, `char reply #${i}`))).toBe(false);
  }
  for (let i = 10; i < 15; i++) {
    expect(contents.some((c) => hasNum(c, `user turn #${i}`))).toBe(true);
    expect(contents.some((c) => hasNum(c, `char reply #${i}`))).toBe(true);
  }
});

it("insert off leaves all messages; a gap leaves a gap; stale stops the cut", async () => {
  // insert: false
  {
    const { id, m } = await chatWithThirty();
    writeJson("litopys/config.json", { insert: false, recentMessages: 6 });
    const r = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    const contents = messageContents(r.json);
    for (let i = 0; i < 15; i++) {
      expect(contents.some((c) => hasNum(c, `user turn #${i}`))).toBe(true);
      expect(contents.some((c) => hasNum(c, `char reply #${i}`))).toBe(true);
    }
  }
  // gap: chapters 1-10 and 13-20
  {
    const { id, m } = await chatWithThirty();
    writeJson(`litopys/chats/${id}.json`, {
      chatId: id,
      migrated: true,
      chapters: [
        { id: "ch1", from: "u0", to: "c4", count: 10, kind: "scene" },
        { id: "ch2", from: "u6", to: "c9", count: 8, kind: "scene" },
      ],
      facts: [],
      proposals: [],
      counters: { chapter: 2, fact: 0, proposal: 0 },
    });
    const r = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    const contents = messageContents(r.json);
    // only messages 1-10 (pairs 0-4) are covered without a gap
    for (let i = 0; i < 5; i++) {
      expect(contents.some((c) => hasNum(c, `user turn #${i}`))).toBe(false);
      expect(contents.some((c) => hasNum(c, `char reply #${i}`))).toBe(false);
    }
    for (let i = 10; i < 15; i++) {
      expect(contents.some((c) => hasNum(c, `user turn #${i}`))).toBe(true);
      expect(contents.some((c) => hasNum(c, `char reply #${i}`))).toBe(true);
    }
  }
  // stale first chapter
  {
    const { id, m } = await chatWithThirty();
    writeJson(`litopys/chats/${id}.json`, {
      chatId: id,
      migrated: true,
      chapters: [
        { id: "ch1", from: "u0", to: "c4", count: 10, kind: "scene", stale: true },
        { id: "ch2", from: "u5", to: "c9", count: 10, kind: "scene" },
      ],
      facts: [],
      proposals: [],
      counters: { chapter: 2, fact: 0, proposal: 0 },
    });
    const r = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    const contents = messageContents(r.json);
    for (let i = 0; i < 15; i++) {
      expect(contents.some((c) => hasNum(c, `user turn #${i}`))).toBe(true);
      expect(contents.some((c) => hasNum(c, `char reply #${i}`))).toBe(true);
    }
  }
});

it("recentMessages 20 of 30 messages: chapters covering 1-26 still cut only 1-10", async () => {
  const { id, m } = await chatWithThirty();
  writeJson("litopys/config.json", { recentMessages: 20 });
  writeJson(`litopys/chats/${id}.json`, {
    chatId: id,
    migrated: true,
    chapters: [{ id: "ch1", from: "u0", to: "c12", count: 25, kind: "scene" }],
    facts: [],
    proposals: [],
    counters: { chapter: 1, fact: 0, proposal: 0 },
  });
  const r = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
  expect(r.status).toBe(200);
  const contents = messageContents(r.json);
  for (let i = 0; i < 5; i++) {
    expect(contents.some((c) => hasNum(c, `user turn #${i}`))).toBe(false);
    expect(contents.some((c) => hasNum(c, `char reply #${i}`))).toBe(false);
  }
  for (let i = 5; i < 15; i++) {
    expect(contents.some((c) => hasNum(c, `user turn #${i}`))).toBe(true);
    expect(contents.some((c) => hasNum(c, `char reply #${i}`))).toBe(true);
  }
});

it("GET returns litopysCut matching the cut", async () => {
  const { id, m } = await chatWithThirty();
  const r = await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m);
  expect(r.status).toBe(200);
  expect(r.json.meta).toHaveProperty("litopysCut");
  expect(r.json.meta.litopysCut).toEqual({ count: 20, upTo: "c9" });
});

it("old Memory meta keys are stripped on save when Litopys holds the chat, kept otherwise, and never forked", async () => {
  const oldKeys = ["summary", "memoryCutoffMessageId", "compactions", "memoryExtractedAt"];
  // migrated Litopys file: keys stripped
  {
    const m = mockHost();
    const id = await newChat(m);
    const meta = readJson(`chats/${id}.meta.json`) as Record<string, unknown>;
    meta.summary = "Old summary";
    meta.memoryCutoffMessageId = "u0";
    meta.compactions = [{}];
    meta.memoryExtractedAt = Date.now();
    writeJson(`chats/${id}.meta.json`, meta);
    writeJson(`litopys/chats/${id}.json`, {
      chatId: id,
      migrated: true,
      chapters: [],
      facts: [],
      proposals: [],
      counters: { chapter: 0, fact: 0, proposal: 0 },
    });
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello" } }, m);
    const saved = readJson(`chats/${id}.meta.json`) as Record<string, unknown>;
    for (const k of oldKeys) expect(saved).not.toHaveProperty(k);
  }
  // no Litopys file: keys stay
  {
    const m = mockHost();
    const id = await newChat(m);
    const meta = readJson(`chats/${id}.meta.json`) as Record<string, unknown>;
    meta.summary = "Old summary";
    meta.memoryCutoffMessageId = "u0";
    meta.compactions = [{}];
    meta.memoryExtractedAt = Date.now();
    writeJson(`chats/${id}.meta.json`, meta);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello" } }, m);
    const saved = readJson(`chats/${id}.meta.json`) as Record<string, unknown>;
    for (const k of oldKeys) expect(saved).toHaveProperty(k);
  }
  // fork: new chat has none of them
  {
    const m = mockHost();
    const id = await newChat(m);
    seedPairs(id, 1, "ok");
    const meta = readJson(`chats/${id}.meta.json`) as Record<string, unknown>;
    meta.summary = "Old summary";
    meta.memoryCutoffMessageId = "u0";
    meta.compactions = [{}];
    meta.memoryExtractedAt = Date.now();
    writeJson(`chats/${id}.meta.json`, meta);
    const msgs = fs.readFileSync(path.join(root, "chats", id + ".jsonl"), "utf8");
    const lastId = (msgs.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).pop() as { id: string }).id;
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/fork`, body: { messageId: lastId } }, m);
    expect(r.status).toBe(201);
    const forked = readJson(`chats/${r.json.meta.id}.meta.json`) as Record<string, unknown>;
    for (const k of oldKeys) expect(forked).not.toHaveProperty(k);
  }
});

it("PATCH ignores summary and memoryCutoffMessageId", async () => {
  const m = mockHost();
  const id = await newChat(m);
  const r = await drive(engineUrl, {
    method: "PATCH",
    path: `/chats/${id}`,
    body: {
      title: "Patched title",
      authorNote: "note",
      summary: "ignored",
      memoryCutoffMessageId: "ignored",
    },
  }, m);
  expect(r.status).toBe(200);
  const saved = readJson(`chats/${id}.meta.json`) as Record<string, unknown>;
  expect(saved.title).toBe("Patched title");
  expect(saved.authorNote).toBe("note");
  expect(saved).not.toHaveProperty("summary");
  expect(saved).not.toHaveProperty("memoryCutoffMessageId");
});

it("preview never shows old Memory blocks and {{summary}} expands to nothing", async () => {
  const m = mockHost();
  const id = await newChat(m);
  const meta = readJson(`chats/${id}.meta.json`) as Record<string, unknown>;
  meta.summary = "A long tale";
  writeJson(`chats/${id}.meta.json`, meta);
  writeJson(`chats/${id}.memories.json`, [{ id: "m1", text: "A memory", importance: 3 }]);
  writePreset({
    prompts: [
      {
        identifier: "main",
        name: "Main",
        role: "system",
        content: "Recap: {{summary}} Done.",
      },
    ],
    prompt_order: [{ character_id: 100000, order: [{ identifier: "main", enabled: true }] }],
  });
  const r = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
  expect(r.status).toBe(200);
  const contents = messageContents(r.json);
  const joined = contents.join("\n");
  expect(joined).not.toContain("[Summary");
  expect(joined).not.toContain("[Long-term memories");
  const main = contents.find((c) => c.includes("Recap:"));
  expect(main).toBeDefined();
  expect(main).not.toContain("{{summary}}");
  expect(main).not.toContain("A long tale");
});

it("the removed compact, undo and memories routes do not answer 200", async () => {
  const mod = (await import(engineUrl)) as { handleRoute: Function };
  const m = mockHost();
  const id = await newChat(m);
  for (const p of [`/chats/${id}/compact`, `/compact/undo`, `/chats/${id}/memories`]) {
    const out = mod.handleRoute({ method: "POST", path: p, query: {}, body: {} }, m.host);
    const status = out?.status ?? (out === null ? 404 : 200);
    expect(status).not.toBe(200);
  }
});

it("Litopys llmRequest inserts one story block after leading system messages and returns nothing for impersonate", async () => {
  const m = mockHost();
  const id = await newChat(m);
  seedNumberedPairs(id, 6);
  writePreset({
    prompts: [
      {
        identifier: "main",
        name: "Main",
        role: "system",
        content: "[Main system prompt]",
      },
    ],
    prompt_order: [{ character_id: 100000, order: [{ identifier: "main", enabled: true }] }],
  });
  writeJson("litopys/config.json", { recentMessages: 6 });
  writeJson(`litopys/chats/${id}.json`, {
    chatId: id,
    migrated: true,
    chapters: [
      {
        id: "ch1",
        from: "u0",
        to: "c2",
        count: 6,
        kind: "scene",
        label: "Opening",
        text: "The station doors opened.",
      },
    ],
    facts: [
      {
        id: "f1",
        text: "Kryll keeps a hidden bottle under the counter.",
        subject: "Kryll",
        knownBy: "all",
        type: "trait",
        weight: "important",
        status: "active",
        pinned: false,
      },
    ],
    proposals: [],
    counters: { chapter: 1, fact: 1, proposal: 0 },
  });

  const mod = (await import(engineUrl)) as { handleRoute: Function };
  const out = mod.handleRoute(
    { method: "POST", path: `/chats/${id}/send`, query: {}, body: { text: "hello" } },
    m.host,
  ) as Out | null;
  expect(out?.__llmPending).toBe(true);
  const replyReq = m.requests.find((r) => r.key === "reply")!.req as {
    messages: { role: string; content: string }[];
    turn: { op: string; chatId: string; speakerName: string };
  };

  const L = (await import(litopysUrl)) as { llmRequest: Function };
  const hooked = L.llmRequest({ key: "reply", request: replyReq, turn: replyReq.turn }, m.host);
  expect(hooked).not.toBeNull();
  const messages = hooked.messages as { role: string; content: string }[];
  const headerIndexes = messages
    .map((x, i) => (x.content.startsWith("[Story record (Litopys)") ? i : -1))
    .filter((i) => i >= 0);
  expect(headerIndexes.length).toBe(1);

  const insertIdx = headerIndexes[0];
  const originalLead = replyReq.messages.findIndex((x) => x.role !== "system");
  const lead = originalLead === -1 ? replyReq.messages.length : originalLead;
  expect(insertIdx).toBe(lead);
  for (let i = 0; i < insertIdx; i++) {
    expect(messages[i].role).toBe("system");
  }

  const joined = messages.map((x) => x.content).join("\n");
  expect(joined).not.toContain("[Summary");
  expect(joined).not.toContain("[Long-term memories");

  const imp = L.llmRequest(
    { key: "reply", request: replyReq, turn: { op: "impersonate", chatId: id, speakerName: "Kryll" } },
    m.host,
  );
  expect(imp).toBeNull();
});
