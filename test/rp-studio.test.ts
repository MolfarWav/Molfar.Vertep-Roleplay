/**
 * Roleplay studio tests — the engine + import plugin, driven
 * with a mock host (fs → tmp dir, llm → two-phase simulator). Mirrors the
 * rp-app harness: each route run starts with fresh llm results, paths exclude
 * the query string.
 */
import { afterEach, describe, it, expect, beforeEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { fileURLToPath } from "node:url";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const stUrl = new URL("../plugins/studio-import/plugin.js", import.meta.url).href;

// gate: the app ships as a standard web app, with nothing left of the retired
// look tier (a leftover file would ship a broken app the UI tests can't see)
describe("app layout", () => {
  const appDir = fileURLToPath(new URL("..", import.meta.url));
  it("is a standard web app: index.html + src/, no bundler config, no look tier", () => {
    expect(fs.existsSync(path.join(appDir, "src", "main.tsx"))).toBe(true);
    // built in the browser: index.html + src/, and no bundler config to run
    expect(fs.existsSync(path.join(appDir, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "vite.config.ts"))).toBe(false);
    expect(fs.existsSync(path.join(appDir, "look"))).toBe(false);
    const m = JSON.parse(fs.readFileSync(path.join(appDir, "manifest.json"), "utf8")) as Record<string, unknown>;
    // fields the runtime-ESM tier used; nothing reads them any more
    for (const dead of ["packages", "jsxImportSource", "tailwind", "stylesheets", "compat"]) {
      expect(m[dead], `manifest still carries "${dead}"`).toBeUndefined();
    }
  });
});

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
  // ship the default preset + a character so chats have something to draw on
  fs.writeFileSync(
    path.join(root, "presets", "default.json"),
    JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], temperature: 0.8, top_p: 0.95, openai_max_tokens: 512, openai_max_context: 8192 }),
  );
  fs.mkdirSync(path.join(root, "characters", "aria"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "characters", "aria", "card.json"),
    JSON.stringify({
      spec: "chara_card_v2", name: "Aria",
      description: "A barista.", personality: "dry", scenario: "night",
      first_mes: "Welcome in, {{user}}.", mes_example: "",
      alternate_greetings: ["Second greeting.", "Third greeting."],
    }),
  );
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
});

afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

function mockHost(
  llmReply?: { text: string } | "error",
  netReply?: (key: string, req: Record<string, unknown>) => Record<string, unknown>,
  embedder?: (texts: string[]) => number[][] | null,
) {
  const results: Record<string, unknown> = {};
  const netResults: Record<string, unknown> = {};
  const embedResults: Record<string, unknown> = {};
  const requests: { key: string; req: Record<string, unknown> }[] = [];
  const netRequests: { key: string; req: Record<string, unknown> }[] = [];
  const embedRequests: { key: string; req: { texts: string[] } }[] = [];
  const resolve = () => {
    for (const { key } of requests) {
      results[key] =
        llmReply === "error"
          ? { text: "", model: "error", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costTotal: 0 } }
          : llmReply ?? { text: "MOCK-REPLY", model: "mock/model", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costTotal: 0 } };
    }
    for (const { key, req } of netRequests) {
      netResults[key] = netReply
        ? netReply(key, req)
        : { ok: false, status: 0, error: "no netReply configured" };
    }
    for (const { key, req } of embedRequests) {
      embedResults[key] = embedder ? embedder(req.texts ?? []) : [[0.1, 0.9]];
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
      request: (key: string, req: Record<string, unknown>) => { requests.push({ key, req }); },
      results,
      embed: (key: string, req: { texts: string[] }) => { embedRequests.push({ key, req }); },
      embedResults,
    },
    net: { request: (key: string, req: Record<string, unknown>) => { netRequests.push({ key, req }); }, results: netResults },
    zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
    log: () => {},
  };
  return { host, requests, netRequests, embedRequests, resolve };
}

async function drive(
  pluginUrl: string,
  req: { method: string; path: string; body?: unknown },
  mock: ReturnType<typeof mockHost>,
): Promise<{ status: number; json: Record<string, unknown> } & { __llmPending?: boolean }> {
  const mod = (await import(pluginUrl)) as { handleRoute: Function };
  const results = mock.host.llm.results as Record<string, unknown>;
  for (const k of Object.keys(results)) delete results[k];
  const netResults = (mock.host as { net?: { results: Record<string, unknown> } }).net?.results ?? {};
  for (const k of Object.keys(netResults)) delete netResults[k];
  const qIdx = req.path.indexOf("?");
  const query: Record<string, string> = {};
  let pathOnly = req.path;
  if (qIdx >= 0) {
    pathOnly = req.path.slice(0, qIdx);
    for (const [k, v] of new URLSearchParams(req.path.slice(qIdx + 1))) query[k] = v;
  }
  const call = { method: req.method, path: pathOnly, query, body: req.body };
  let out = mod.handleRoute(call, mock.host) as { status?: number; json?: Record<string, unknown>; __llmPending?: boolean; stash?: Record<string, unknown> };
  for (let pass = 0; out && out.__llmPending && pass < 3; pass++) {
    // the kernel threads each pass's stash into the next pass's ctx
    if (out.stash && typeof out.stash === "object") (call as { stash?: unknown }).stash = out.stash;
    mock.resolve();
    out = mod.handleRoute(call, mock.host) as typeof out;
  }
  return { status: out?.status ?? 200, json: (out?.json ?? {}) as Record<string, unknown>, __llmPending: out?.__llmPending };
}

/**
 * /bootstrap used to inline every chat's full transcript, so the payload grew
 * with every message ever written and was assembled inside a 64MB sandbox
 * heap. It now ships metas plus engine-side totals; these pin the parts the
 * client can no longer work out for itself.
 */
describe("rp studio engine: bootstrap pages instead of shipping every transcript", () => {
  const T_NOON = new Date(2024, 0, 1, 12, 0).getTime();
  // built from local parts, so getHours() reads 3 in any timezone
  const T_NIGHT = new Date(2024, 0, 1, 3, 30).getTime();

  const writeChat = (id: string, lines: Record<string, unknown>[], meta: Record<string, unknown> = {}) => {
    fs.writeFileSync(
      path.join(root, "chats", `${id}.meta.json`),
      JSON.stringify({ id, title: id, characterId: "aria", groupId: null, createdAt: 1, updatedAt: 2, ...meta }),
    );
    fs.writeFileSync(
      path.join(root, "chats", `${id}.jsonl`),
      lines.map((l) => JSON.stringify(l)).join("\n") + (lines.length ? "\n" : ""),
    );
  };

  const seed = () => {
    // greeting only, never answered
    writeChat("c1", [
      { id: "a1", name: "Aria", charId: "aria", role: "char", text: "Welcome in", at: T_NOON, swipes: ["Welcome in"], swipe: 0 },
    ]);
    // a real conversation: an alternate swipe, a 3:30am user turn, a translation
    writeChat("c2", [
      { id: "b1", name: "Aria", charId: "aria", role: "char", text: "Hi there", at: T_NOON, swipes: ["Hi there", "Hey"], swipe: 0 },
      { id: "b2", name: "You", charId: null, role: "user", text: "one two three", at: T_NIGHT, swipes: ["one two three"], swipe: 0 },
      { id: "b3", name: "Aria", charId: "aria", role: "char", text: "ok", at: T_NOON, translation: "vale", swipes: ["ok"], swipe: 0 },
    ]);
  };

  it("ships chat METAS, never their messages", async () => {
    seed();
    const r = await drive(engineUrl, { method: "GET", path: "/bootstrap" }, mockHost());
    const chats = r.json.chats as Record<string, unknown>[];
    expect(chats.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    for (const c of chats) expect(c.messages).toBeUndefined();
    const c2 = chats.find((c) => c.id === "c2")!;
    expect(c2.messageCount).toBe(3);
    expect(c2.preview).toBe("ok");
    expect(r.json.activeChat).toBeNull();
  });

  it("marks which chats hold a user turn, so the sweep can judge without the transcript", async () => {
    seed();
    const r = await drive(engineUrl, { method: "GET", path: "/bootstrap" }, mockHost());
    const chats = r.json.chats as Record<string, unknown>[];
    expect(chats.find((c) => c.id === "c1")!.hasUser).toBe(false);
    expect(chats.find((c) => c.id === "c2")!.hasUser).toBe(true);
  });

  it("a lone USER message keeps a one-line chat safe from the sweep", async () => {
    // the count alone reads as abandoned here — hasUser is what saves it
    writeChat("solo", [
      { id: "s1", name: "You", charId: null, role: "user", text: "hello", at: T_NOON, swipes: ["hello"], swipe: 0 },
    ]);
    const r = await drive(engineUrl, { method: "GET", path: "/bootstrap" }, mockHost());
    const solo = (r.json.chats as Record<string, unknown>[]).find((c) => c.id === "solo")!;
    expect(solo.messageCount).toBe(1);
    expect(solo.hasUser).toBe(true);
  });

  it("inlines only the chat the client asked for", async () => {
    seed();
    const r = await drive(engineUrl, { method: "GET", path: "/bootstrap?chat=c2" }, mockHost());
    const active = r.json.activeChat as { meta: { id: string }; messages: unknown[] };
    expect(active.meta.id).toBe("c2");
    expect(active.messages).toHaveLength(3);
    for (const c of r.json.chats as Record<string, unknown>[]) expect(c.messages).toBeUndefined();
  });

  it("totals the home screen needs are answerable from the metas alone", async () => {
    seed();
    const r = await drive(engineUrl, { method: "GET", path: "/bootstrap" }, mockHost());
    const chats = r.json.chats as { messageCount: number }[];
    // Home sums these instead of reading four transcripts back
    expect(chats.reduce((n, c) => n + c.messageCount, 0)).toBe(4);
    expect(Math.max(...chats.map((c) => c.messageCount))).toBe(3);
  });
});

describe("rp studio engine: chats + swipes", () => {
  it("creates a chat with the greeting seeded as swipes", async () => {
    const m = mockHost();
    const r = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const meta = r.json.meta as Record<string, unknown>;
    const msgs = r.json.messages as { role: string; text: string; swipes: string[]; swipe: number }[];
    expect(meta.title).toBe("Aria");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.role).toBe("char");
    expect(msgs[0]!.text).toBe("Welcome in, You.");
    expect(msgs[0]!.swipes).toHaveLength(3); // first_mes + 2 alternates
  }, 30_000);

  it("starts a new chat on the preset the user made default", async () => {
    const m = mockHost();
    const stock = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    expect((stock.json.meta as Record<string, unknown>).presetId).toBe("default");
    fs.writeFileSync(
      path.join(root, "presets", "mine.json"),
      JSON.stringify({ id: "mine", name: "Mine", prompts: [], prompt_order: [], temperature: 1.1, studio: { isDefault: true } }),
    );
    const r = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    expect((r.json.meta as Record<string, unknown>).presetId).toBe("mine");
    const picked = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "default" } }, m);
    expect((picked.json.meta as Record<string, unknown>).presetId).toBe("default");
  }, 30_000);

  it("swipes the pristine greeting WITHOUT calling the model (wraps)", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    const r1 = await drive(engineUrl, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: 1 } }, m);
    expect((r1.json.message as { text: string }).text).toBe("Second greeting.");
    const r2 = await drive(engineUrl, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: -1 } }, m);
    expect((r2.json.message as { text: string }).text).toBe("Welcome in, You.");
    const r3 = await drive(engineUrl, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: -1 } }, m);
    expect((r3.json.message as { text: string }).text).toBe("Third greeting."); // wraps
    expect(m.requests).toHaveLength(0); // pure data rotation, no llm
  }, 30_000);

  it("a generation in flight taints the chat so a reload can't sweep it away", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    // PASS A alone — the model hasn't answered, exactly the mid-generation
    // window where a mobile reload used to judge the chat abandoned
    const mod = (await import(engineUrl)) as { handleRoute: Function };
    const call = { method: "POST", path: `/chats/${id}/send`, query: {}, body: { text: "hello" } };
    const passA = mod.handleRoute(call, m.host) as { __llmPending?: boolean; stash?: unknown };
    expect(passA.__llmPending).toBe(true);
    const metaOnDisk = JSON.parse(fs.readFileSync(path.join(root, "chats", `${id}.meta.json`), "utf8")) as { tainted?: boolean };
    expect(metaOnDisk.tainted).toBe(true); // sweep-exempt while generating
    const midLines = fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8").split("\n").filter(Boolean);
    expect(midLines).toHaveLength(1); // greeting only — no transcript write at pass A
    // PASS B: the model answered — the user turn lands exactly once
    (call as { stash?: unknown }).stash = passA.stash;
    m.resolve();
    const passB = mod.handleRoute(call, m.host) as { status?: number };
    expect(passB.status).toBe(200);
    const done = fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8").split("\n").filter(Boolean)
      .map((l) => JSON.parse(l) as { role: string; text: string });
    const users = done.filter((x) => x.role === "user");
    expect(users).toHaveLength(1);
    expect(users[0]!.text).toBe("hello");
  }, 30_000);

  it("send commits user + char messages (two-phase) with macros and sampler", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "One coffee please.", model: "mock/model" } }, m);
    expect(r.json.user as { text: string }).toMatchObject({ text: "One coffee please." });
    expect((r.json.reply as { text: string }).text).toBe("MOCK-REPLY");
    // pass A asked for generation with the assembled prompt + sampler
    const req = m.requests[0]!.req as { systemPrompt?: string; messages: { role: string; content: string }[]; model?: string; presetParams?: Record<string, number> };
    expect(req.model).toBe("mock/model");
    // system parts ride the message array with role "system" (the transport
    // hoists them into the provider system prompt)
    expect(req.messages.some((x) => x.role === "system" && x.content.includes("barista"))).toBe(true);
    expect(req.presetParams).toMatchObject({ temperature: 0.8, max_tokens: 512 });
    expect(req.messages.at(-1)).toMatchObject({ role: "user", content: "One coffee please." });
    // persisted as jsonl
    const lines = fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8").trim().split("\n");
    expect(lines).toHaveLength(3); // greeting + user + reply
  }, 30_000);

  it("a failed generation keeps the user's message instead of deleting it", async () => {
    const m = mockHost("error");
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello", model: "mock/model" } }, m);
    expect(r.status).toBe(503);
    // the user turn commits alone — the client's refresh lands it instead of
    // wiping the staged copy, so a content-filtered turn can be retried
    const done = fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8").split("\n").filter(Boolean)
      .map((l) => JSON.parse(l) as { role: string; text: string });
    const users = done.filter((x) => x.role === "user");
    expect(users).toHaveLength(1);
    expect(users[0]!.text).toBe("hello");
    expect(done.some((x) => x.role === "char" && x.text === "MOCK-REPLY")).toBe(false);
  }, 30_000);

  it("a filtered generation reports the provider's reason, not the generic hint", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    const failing = mockHost({ text: "", model: "error", error: "model error: Provider finish_reason: content_filter" } as { text: string });
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello", model: "mock/model" } }, failing);
    expect(r.status).toBe(503);
    expect(r.json.error as string).toContain("content_filter");
  }, 30_000);

  it("reply requests are tool-accepting (wantsTools marker); trace persists", async () => {
    const m1 = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m1);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi", model: "mock/model" } }, m1);
    const req1 = m1.requests[0]!.req as { tools?: unknown; wantsTools?: unknown };
    expect(req1.tools).toBeUndefined(); // the engine plugin itself ships no tools
    expect(req1.wantsTools).toBe(true); // siblings may contribute theirs

    const trace = [{ name: "roll_dice", args: { count: 2, sides: 6 }, resultText: "2d6 → [1, 4] = 5", isError: false }];
    const parts = [
      { type: "thinking", text: "What could happen…" },
      { type: "text", text: "Let me roll." },
      { type: "tool", name: "roll_dice", args: { count: 2, sides: 6 }, resultText: "2d6 → [1, 4] = 5", isError: false },
      { type: "thinking", text: "A five — the guarded path." },
      { type: "text", text: "A five!" },
    ];
    const m2 = mockHost({ text: "The dice say five.", toolTrace: trace, parts } as { text: string });
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "roll for me", model: "mock/model" } }, m2);
    expect((m2.requests[0]!.req as { wantsTools?: unknown }).wantsTools).toBe(true);
    const extra = (r.json.reply as { extra: { tools: typeof trace; parts: typeof parts } }).extra;
    expect(extra.tools).toEqual(trace);
    expect(extra.parts).toEqual(parts);
  }, 30_000);

  it("forks a chat from a message (new chat, messages truncated at that point)", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "One coffee.", model: "mock/model" } }, m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "Another coffee.", model: "mock/model" } }, m);
    const before = await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m);
    const msgs = before.json.messages as { id: string; text: string }[];
    expect(msgs).toHaveLength(5); // greeting + u/a + u/a
    // fork at the FIRST user message: keeps greeting + that message only
    const fork = await drive(engineUrl, { method: "POST", path: `/chats/${id}/fork`, body: { messageId: msgs[1]!.id } }, m);
    expect(fork.status).toBe(201);
    const fmeta = fork.json.meta as { id: string; characterId: string | null; title: string };
    const fmsgs = fork.json.messages as unknown[];
    expect(fmeta.id).not.toBe(id);
    expect(fmeta.characterId).toBe("aria");
    expect(fmeta.title).toContain("fork");
    expect(fmsgs).toHaveLength(2);
    // original untouched
    const after = await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m);
    expect((after.json.messages as unknown[])).toHaveLength(5);
  }, 30_000);

  it("a card save without sprite images keeps the images already stored", async () => {
    const m = mockHost();
    const put = (studio: Record<string, unknown>) =>
      drive(engineUrl, { method: "PUT", path: "/characters/spritely", body: { name: "Spritely", studio } }, m);
    await put({ expressions: [{ name: "joy", url: "data:image/png;base64,QUJD" }, { name: "anger", url: "data:image/png;base64,WFla" }] });

    // a client that lists characters without the picture bytes saves the card
    // back with names only; the pack must survive
    await put({ expressions: [{ name: "joy", url: null }, { name: "anger", url: null }] });
    const kept = JSON.parse(fs.readFileSync(path.join(root, "characters", "spritely", "card.json"), "utf8")) as {
      studio: { expressions: { name: string; url: string | null }[] }
    };
    expect(kept.studio.expressions).toEqual([
      { name: "joy", url: "data:image/png;base64,QUJD" },
      { name: "anger", url: "data:image/png;base64,WFla" },
    ]);

    // a real replacement still replaces, and a removed slot stays removed
    await put({ expressions: [{ name: "joy", url: "data:image/png;base64,bmV3" }] });
    const after = JSON.parse(fs.readFileSync(path.join(root, "characters", "spritely", "card.json"), "utf8")) as {
      studio: { expressions: { name: string; url: string | null }[] }
    };
    expect(after.studio.expressions).toEqual([{ name: "joy", url: "data:image/png;base64,bmV3" }]);
  }, 30_000);

  it("numbers forks off the root title instead of stacking suffixes", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { title: "Tavern" } }, m);
    const titles: string[] = [];
    let from = id;
    for (let i = 0; i < 3; i++) {
      const r = await drive(engineUrl, { method: "POST", path: `/chats/${from}/fork`, body: {} }, m);
      const meta = r.json.meta as { id: string; title: string };
      titles.push(meta.title);
      from = meta.id; // fork the fork: the title must not grow
    }
    expect(titles).toEqual(["Tavern fork", "Tavern fork 2", "Tavern fork 3"]);
  }, 30_000);

  it("swiping past the last reply generates a NEW swipe and taints the chat", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: 1 } }, m);
    const msg = r.json.message as { swipes: string[]; swipe: number };
    expect(msg.swipes).toHaveLength(2);
    expect(msg.swipes[1]).toBe("MOCK-REPLY");
    expect(msg.swipe).toBe(1);
  }, 30_000);

  it("continue extends the last char message; impersonate drafts without writing", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/continue`, body: {} }, m);
    expect((r.json.message as { text: string }).text).toContain("MOCK-REPLY");
    const before = fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8");
    const imp = await drive(engineUrl, { method: "POST", path: `/chats/${id}/impersonate`, body: {} }, m);
    expect(imp.json.text).toBe("MOCK-REPLY");
    expect(fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8")).toBe(before);
  }, 30_000);

  it("message delete: single removes one line, scope=below truncates", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "one" } }, m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "two" } }, m);
    const chat = JSON.parse(fs.readFileSync(path.join(root, "chats", `${id}.meta.json`), "utf8")) as { id: string };
    void chat;
    const lines = () => fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8").trim().split("\n");
    expect(lines()).toHaveLength(5); // greet + (u,a) + (u,a)
    const userMsg = JSON.parse(lines()[1]!) as { id: string };
    // truncate below the greeting → the greeting STAYS, everything after dies
    const greet = JSON.parse(lines()[0]!) as { id: string };
    const r = await drive(engineUrl, { method: "DELETE", path: `/chats/${id}/messages/${greet.id}?scope=below` }, m);
    expect(r.json.remaining).toBe(1);
    expect(JSON.parse(lines()[0]!).id).toBe(greet.id);
    void userMsg;
  }, 30_000);
});

describe("rp studio engine: groups", () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(root, "characters", "bo"), { recursive: true });
    fs.writeFileSync(path.join(root, "characters", "bo", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Bo", description: "chill", first_mes: "" }));
    fs.mkdirSync(path.join(root, "characters", "cy"), { recursive: true });
    fs.writeFileSync(path.join(root, "groups", "duo.json"), JSON.stringify({ id: "duo", name: "Duo", memberIds: ["aria", "bo"], mode: "list", mutedIds: [] }));
  });

  it("list mode: every member answers each turn, in order; history carries name prefixes", async () => {
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { groupId: "duo" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    const r1 = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello both" } }, m);
    expect((r1.json.reply as { name: string }).name).toBe("Aria"); // first in list
    expect(r1.json.queue).toEqual(["bo"]); // the client runs Bo next
    const r2 = await drive(engineUrl, { method: "POST", path: `/chats/${id}/next`, body: { charId: "bo" } }, m);
    expect((r2.json.reply as { name: string }).name).toBe("Bo");
    const r3 = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "again" } }, m);
    expect((r3.json.reply as { name: string }).name).toBe("Aria"); // a new turn starts the list over
    const req = m.requests.at(-1)!.req as { systemPrompt?: string; messages: { role: string; content: string }[] };
    expect(req.messages.some((x) => x.content.startsWith("Bo:"))).toBe(true); // group name prefixes
    expect(req.messages.some((x) => x.role === "system" && x.content.includes("group scene"))).toBe(true);
  }, 30_000);

  it("natural mode: the members the user names answer, in the order named", async () => {
    fs.writeFileSync(path.join(root, "groups", "duo.json"), JSON.stringify({ id: "duo", name: "Duo", memberIds: ["aria", "bo"], mode: "natural", mutedIds: [] }));
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { groupId: "duo" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "bo, what do you think? and you, aria?" } }, m);
    expect((r.json.reply as { name: string }).name).toBe("Bo");
    expect(r.json.queue).toEqual(["aria"]);
    // a name inside another word is not a mention ("bold" is not Bo; names need 3+ letters)
    const r2 = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "ariadne walks in" } }, m);
    expect(r2.json.queue).toBeUndefined();
  }, 30_000);

  it("natural mode: unnamed turns never hand the floor back to who just spoke, and talkativeness 0 stays quiet", async () => {
    fs.writeFileSync(path.join(root, "characters", "cy", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Cy", description: "shy", first_mes: "", extensions: { talkativeness: "0" } }));
    fs.writeFileSync(path.join(root, "groups", "duo.json"), JSON.stringify({ id: "duo", name: "Trio", memberIds: ["aria", "bo", "cy"], mode: "natural", mutedIds: [] }));
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { groupId: "duo" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    let last = "";
    for (let i = 0; i < 12; i++) {
      const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "go on" } }, m);
      const name = (r.json.reply as { name: string }).name;
      expect(name).not.toBe("Cy");
      expect(name).not.toBe(last);
      last = name;
    }
  }, 30_000);

  it("group-only greetings: members carrying them open the group chat with one", async () => {
    fs.writeFileSync(path.join(root, "characters", "bo", "card.json"), JSON.stringify({
      spec: "chara_card_v2", name: "Bo", description: "chill", first_mes: "",
      group_only_greetings: ["Bo eyes the newcomer warily.", "Bo raises a mug to {{user}}."],
    }));
    fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({
      spec: "chara_card_v2", name: "Aria", description: "barista", first_mes: "Welcome in.",
      extensions: { group_greetings: ["Aria slides two cups onto the counter."] },
    }));
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { groupId: "duo", openingMessage: "The bell rings." } }, m);
    const msgs = chat.json.messages as { name: string; charId: string | null; role: string; text: string; swipes: string[]; greeting?: boolean }[];
    const opening = msgs.find((x) => x.role === "system");
    expect(opening?.text).toBe("The bell rings.");
    // both members greeted; each with one of THEIR group greetings (random pick,
    // all variants swipable); the plain first_mes never shows in a group open
    const bo = msgs.find((x) => x.charId === "bo")!;
    const aria = msgs.find((x) => x.charId === "aria")!;
    expect(["Bo eyes the newcomer warily.", "Bo raises a mug to You."]).toContain(bo.text);
    expect(bo.swipes).toHaveLength(2);
    expect(bo.greeting).toBe(true);
    expect(aria.text).toBe("Aria slides two cups onto the counter."); // legacy extension spelling
    expect(msgs.some((x) => x.text.includes("Welcome in."))).toBe(false);
  }, 30_000);

  it("imported preset shape assembles: canonical markers resolve, order holds", async () => {
    // the shape presetImport writes after the scramble fix: canonical marker
    // identifiers, list-index order, injection_order noise ignored
    fs.writeFileSync(path.join(root, "presets", "imported.json"), JSON.stringify({
      id: "imported", name: "Imported",
      prompts: [
        { identifier: "main", name: "Main Prompt", role: "system", marker: true, content: "MAIN-TEXT", injection_order: 100 },
        { identifier: "note", name: "Author Note", role: "system", content: "NOTE-TEXT", injection_order: 100 },
        { identifier: "charPersonality", name: "Char Personality", role: "system", marker: true },
        { identifier: "chatHistory", name: "Chat History", role: "system", marker: true },
        { identifier: "tail", name: "Tail", role: "system", content: "TAIL-TEXT" },
      ],
      prompt_order: [{ character_id: 100000, order: [
        { identifier: "main", enabled: true }, { identifier: "note", enabled: true },
        { identifier: "charPersonality", enabled: true }, { identifier: "chatHistory", enabled: true },
        { identifier: "tail", enabled: true },
      ] }],
    }));
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "imported" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi", model: "mock/model" } }, m);
    const req = m.requests[0]!.req as { messages: { role: string; content: string }[] };
    const sys = req.messages.map((x) => x.content).join("\n");
    // main marker content, marker-resolved card text, custom sections, all in the author's order
    expect(sys).toContain("MAIN-TEXT");
    expect(sys).toContain("NOTE-TEXT");
    expect(sys).toContain("TAIL-TEXT");
    expect(sys).toContain("dry"); // charPersonality marker pulled the card text
    expect(sys.indexOf("MAIN-TEXT")).toBeLessThan(sys.indexOf("NOTE-TEXT"));
    expect(sys.indexOf("NOTE-TEXT")).toBeLessThan(sys.indexOf("TAIL-TEXT"));
    // chat history marker consumed the history turn slot (no empty marker row)
    expect(sys.match(/Chat History/g)).toBeNull();
    expect(req.messages.filter((x) => x.role === "user").at(-1)).toMatchObject({ role: "user", content: "hi" });
  }, 30_000);

  it("a chat pinned to a deleted preset assembles with the user's default", async () => {
    fs.writeFileSync(path.join(root, "presets", "golden.json"), JSON.stringify({
      id: "golden", name: "Golden",
      prompts: [{ identifier: "main", name: "Main", role: "system", marker: true, content: "GOLDEN-MAIN-TEXT" }],
      prompt_order: [{ character_id: 100000, order: [{ identifier: "main", enabled: true }] }],
      studio: { isDefault: true, sections: [{ id: "main", marker: "main" }] },
    }));
    const m = mockHost();
    // presetId points at a file that does not exist
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "ghost-preset" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi", model: "mock/model" } }, m);
    const sys = (m.requests[0]!.req as { messages: { content: string }[] }).messages.map((x) => x.content).join("\n");
    expect(sys).toContain("GOLDEN-MAIN-TEXT"); // the default's layout, not the bare fallback
  }, 30_000);

  it("manual mode: send writes the user message only; next forces a member", async () => {
    fs.writeFileSync(path.join(root, "groups", "duo.json"), JSON.stringify({ id: "duo", name: "Duo", memberIds: ["aria", "bo"], mode: "manual", mutedIds: [] }));
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { groupId: "duo" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    expect(r.json.reply).toBeNull();
    expect(m.requests).toHaveLength(0);
    const forced = await drive(engineUrl, { method: "POST", path: `/chats/${id}/next`, body: { charId: "bo" } }, m);
    expect((forced.json.reply as { name: string }).name).toBe("Bo");
  }, 30_000);
});

describe("rp studio engine: export + regex + prompt preview", () => {
  it("builds a real (store-mode) zip with entries for everything", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const r = await drive(engineUrl, { method: "GET", path: "/export/backup" }, m);
    const b64 = r.json.base64 as string;
    const bytes = Buffer.from(b64, "base64");
    // local header magic + EOCD magic present, names in the buffer
    expect(bytes[0]).toBe(0x50); // P
    const asText = bytes.toString("latin1");
    expect(asText).toContain("characters/aria.json");
    const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(eocd).toBeGreaterThan(0);
    const count = bytes.readUInt16LE(eocd + 10);
    expect(count).toBeGreaterThanOrEqual(3);
    // entity loops read FILE names (they already end in .json) — personas and
    // presets from the seed data must round-trip, not vanish
    expect(asText).toContain("User Settings/personas.json");
    expect(asText).toContain('"You"');
    expect(asText).toContain("User Settings/openai_settings.json");
    expect(asText).toContain("Default");
  }, 30_000);

  it("regex applies to user_input on the way in and ai_output on the way out", async () => {
    fs.writeFileSync(path.join(root, "regex", "shout.json"), JSON.stringify({ id: "shout", scriptName: "Shout", findRegex: "coffee", replaceString: "COFFEE", placement: ["user_input", "ai_output"], disabled: false }));
    const m = mockHost({ text: "your coffee is ready" });
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "coffee please" } }, m);
    // ai_output regex applies to the reply as it enters the prompt AND is stored as generated? we store raw model text
    const reply = r.json.reply as { text: string };
    expect(reply.text).toBe("your coffee is ready"); // stored raw (display regex is client-side)
    const req = m.requests[0]!.req as { messages: { role: string; content: string }[] };
    const userMsg = req.messages.at(-1)!;
    expect(userMsg.content).toBe("COFFEE please"); // user_input placement rewrote it for the model
  }, 30_000);

  it("prompt preview returns the assembled system + messages", async () => {
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    const r = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "espresso" } }, m);
    expect((r.json.messages as { role: string; content: string }[]).some((x) => x.role === "system" && x.content.includes("barista"))).toBe(true);
    expect((r.json.messages as { content: string }[]).at(-1)!.content).toBe("espresso");
  }, 30_000);

  it("a chat's field-variant selection decides what generation and peek send", async () => {
    fs.writeFileSync(
      path.join(root, "characters", "aria", "card.json"),
      JSON.stringify({
        spec: "chara_card_v2", name: "Aria",
        description: "A quiet barista.", personality: "clipped tone", scenario: "night",
        first_mes: "Welcome in, {{user}}.", mes_example: "",
        alternate_greetings: ["Second greeting."],
        studio: {
          descVariants: [{ id: "var_night", label: "Night shift", content: "A night-shift barista who hums." }],
          personalityVariants: [{ id: "var_warm", label: "Warm", content: "warm and chatty" }],
          scenarioVariants: [],
        },
      }),
    );
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    const joined = (r: { json: Record<string, unknown> }) =>
      (r.json.messages as { content: string }[]).map((x) => x.content).join("\n");

    const before = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect(joined(before)).toContain("A quiet barista.");
    expect(joined(before)).toContain("clipped tone");

    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { fieldVariantSelection: { desc: "var_night", personality: "var_warm" } } }, m);
    const after = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect(joined(after)).toContain("A night-shift barista who hums.");
    expect(joined(after)).toContain("warm and chatty");
    expect(joined(after)).not.toContain("A quiet barista.");
    expect(joined(after)).not.toContain("clipped tone");
  }, 30_000);

  it("peek at a message assembles the prompt AS OF that message, not the chat tail", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "first question" } }, m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "second question" } }, m);
    const chat = await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m);
    const msgs = chat.json.messages as { id: string; role: string }[];
    // the FIRST user message: greeting + its own text, nothing from later turns
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, messageId: msgs[1]!.id } }, m);
    const contents = (peek.json.messages as { content: string }[]).map((x) => x.content);
    expect(contents.some((c) => c.includes("first question"))).toBe(true);
    expect(contents.some((c) => c.includes("second question"))).toBe(false);
    expect(contents.some((c) => c.includes("MOCK-REPLY"))).toBe(false);
    // the greeting is a char message: its prompt ended before it existed
    const peekGreeting = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, messageId: msgs[0]!.id } }, m);
    const g = (peekGreeting.json.messages as { content: string }[]).map((x) => x.content);
    expect(g.some((c) => c.includes("first question"))).toBe(false);
    expect(g.some((c) => c.includes("Welcome in"))).toBe(false); // not even itself
    const missing = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, messageId: "nope" } }, m);
    expect(missing.status).toBe(404);
  }, 30_000);

  it("bootstrap answers the whole app state in one call, transcripts excluded", async () => {
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello there" } }, m);

    const boot = (await drive(engineUrl, { method: "GET", path: "/bootstrap" }, m)).json as {
      characters: { id: string }[]; personas: unknown[]; presets: { id: string }[];
      lorebooks: unknown[]; regex: unknown[]; groups: unknown[];
      settings: { personaId: string }; library: unknown; databank: { files: unknown[] };
      chats: { id: string; messageCount: number; hasUser: boolean; messages?: unknown }[];
      activeChat: unknown;
    };
    expect(boot.characters.map((c) => c.id)).toContain("aria");
    expect(boot.presets.map((p) => p.id)).toContain("default");
    expect(boot.settings.personaId).toBe("you");
    expect(boot.databank.files).toEqual([]);
    // chats travel as METAS now: a transcript arrives when one is opened
    const row = boot.chats.find((c) => c.id === id);
    expect(row).toBeDefined();
    expect(row?.messages).toBeUndefined();
    expect(row?.messageCount).toBeGreaterThan(0);
    expect(row?.hasUser).toBe(true);
    expect(boot.activeChat).toBeNull();

    // asking for one inlines it, and its shape is the individual route's own,
    // not a second definition
    const withChat = (await drive(engineUrl, { method: "GET", path: `/bootstrap?chat=${id}` }, m)).json as {
      activeChat: { meta: { id: string }; messages: unknown[] };
    };
    const solo = (await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m)).json;
    expect(withChat.activeChat.meta.id).toBe(id);
    expect(withChat.activeChat.messages).toEqual((solo as { messages: unknown[] }).messages);
  }, 30_000);

  it("depth injections land inside the history, counted from the newest turn", async () => {
    // preset with a real post-history block after the chat: an author's note
    // at depth 0 must sit at the END of the transcript but still BEFORE it
    fs.writeFileSync(
      path.join(root, "presets", "default.json"),
      JSON.stringify({
        id: "default", name: "Default", openai_max_context: 8192,
        prompts: [
          { identifier: "main", marker: true, role: "system", content: "MAIN" },
          { identifier: "chatHistory", marker: true, role: "system" },
          { identifier: "postHistory", role: "system", content: "LAST-WORD" },
        ],
        prompt_order: [
          { identifier: "main", enabled: true },
          { identifier: "chatHistory", enabled: true },
          { identifier: "postHistory", enabled: true },
        ],
      }),
    );
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "turn one" } }, m);
    await drive(engineUrl, {
      method: "PATCH", path: `/chats/${id}`,
      body: { authorNoteObject: { text: "NOTE", position: "in-chat", depth: 0, role: "system", frequency: 1 } },
    }, m);
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "turn two" } }, m);
    const contents = (peek.json.messages as { content: string }[]).map((x) => x.content);
    const note = contents.findIndex((c) => c.includes("NOTE"));
    const lastTurn = contents.findIndex((c) => c.includes("turn two"));
    const postHistory = contents.findIndex((c) => c.includes("LAST-WORD"));
    expect(note).toBeGreaterThan(lastTurn); // depth 0 = after the newest turn
    expect(postHistory).toBeGreaterThan(note); // and the post-history block still ends the prompt

    // depth 1 sits one turn further back
    await drive(engineUrl, {
      method: "PATCH", path: `/chats/${id}`,
      body: { authorNoteObject: { text: "NOTE", position: "in-chat", depth: 1, role: "system", frequency: 1 } },
    }, m);
    const deeper = (await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "turn two" } }, m)).json;
    const c2 = (deeper.messages as { content: string }[]).map((x) => x.content);
    expect(c2.findIndex((c) => c.includes("NOTE"))).toBeLessThan(c2.findIndex((c) => c.includes("turn two")));
  }, 30_000);

  it("peek carries the tool definitions a wantsTools send would (host.siblingTools)", async () => {
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    // absent on engine builds without the ?siblingtools contract: no tools key
    const bare = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect(bare.json.tools).toBeUndefined();
    // with the sibling set exposed, the peek shows exactly what a send carries
    (m.host as Record<string, unknown>).siblingTools = [
      { name: "roll_dice", description: "Roll dice.", parameters: { type: "object", properties: { sides: { type: "number" } } } },
    ];
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    const tools = peek.json.tools as { name: string; description: string }[];
    expect(tools?.[0]?.name).toBe("roll_dice");
    expect(tools?.[0]?.description).toBe("Roll dice.");
  }, 30_000);

  it("long translations are chunked at the provider cap and stitched back exactly", async () => {
    const seen: { key: string; q: string }[] = [];
    const m = mockHost(undefined, (key, req) => {
      const url = String((req as { url?: string }).url);
      seen.push({ key, q: decodeURIComponent(url.split("q=")[1] ?? "") });
      return { ok: true, status: 200, statusText: "OK", json: [[[`<${key}>`, "orig"]]] };
    });
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const text = `para. ${"x".repeat(60)}\n\n`.repeat(120); // ~8k chars > the 4000 cap
    const r = await drive(engineUrl, { method: "POST", path: "/translate", body: { text, target: "Spanish", provider: "google" } }, m);
    expect(seen.length).toBeGreaterThanOrEqual(2); // actually chunked
    for (const s of seen) expect(s.q.length).toBeLessThanOrEqual(4000); // every piece within cap
    expect(seen.map((s) => s.q).join("")).toBe(text); // exact partition, nothing dropped
    expect(r.json.text).toBe(seen.map((s) => `<${s.key}>`).join("")); // stitched in order
  }, 30_000);

  it("http providers reject unmapped languages instead of silently translating to english", async () => {
    const m = mockHost(undefined, () => ({ ok: true, status: 200, statusText: "OK", json: [] }));
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const r = await drive(engineUrl, { method: "POST", path: "/translate", body: { text: "hello", target: "Klingon", provider: "google" } }, m);
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toContain("Klingon");
  }, 30_000);

  it("a message's translation dies with its text (edit, swipe switch)", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    const chat = await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m);
    const reply = [...(chat.json.messages as { id: string; role: string }[])].reverse().find((x) => x.role === "char")!;
    const set = await drive(engineUrl, { method: "PATCH", path: `/chats/${id}/messages/${reply.id}`, body: { translation: "hola" } }, m);
    expect((set.json.message as { translation?: string }).translation).toBe("hola");
    const edited = await drive(engineUrl, { method: "PATCH", path: `/chats/${id}/messages/${reply.id}`, body: { text: "edited reply" } }, m);
    expect((edited.json.message as { translation?: string }).translation).toBeUndefined();
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}/messages/${reply.id}`, body: { translation: "hola de nuevo" } }, m);
    const swiped = await drive(engineUrl, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: 1 } }, m);
    expect((swiped.json.message as { translation?: string }).translation).toBeUndefined();
  }, 30_000);

  it("every swipe keeps its own generation facts (swipeMeta stays index-aligned)", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    // regen twice: three swipes, three metas
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: 1 } }, m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: 1 } }, m);
    const chat = await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m);
    const reply = [...(chat.json.messages as { id: string; role: string; extra?: { swipeMeta?: unknown[] } }[])].reverse().find((x) => x.role === "char")!;
    expect(reply.extra?.swipeMeta).toHaveLength(3);
    // a cancelled commit appends its own entry: the client-measured elapsed
    // time rides along, no usage (the engine's completion was discarded)
    const target = await drive(engineUrl, { method: "POST", path: `/chats/${id}/cancelled`, body: { text: "frozen bytes", targetMessageId: reply.id, expectedSwipes: 3, genMs: 4200, model: "test/mini" } }, m);
    expect(target.status).toBe(200);
    const chat2 = await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m);
    const reply2 = [...(chat2.json.messages as { id: string; role: string; extra?: { swipeMeta?: unknown[]; genMs?: number; model?: string; usage?: unknown } }[])].reverse().find((x) => x.role === "char")!;
    expect(reply2.extra?.swipeMeta).toHaveLength(4);
    expect(reply2.extra?.swipeMeta?.[3]).toEqual({ genMs: 4200, model: "test/mini" });
    // the message-level facts describe the ACTIVE swipe — the cancelled
    // partial, not the generation it replaced
    expect(reply2.extra?.genMs).toBe(4200);
    expect(reply2.extra?.model).toBe("test/mini");
    expect(reply2.extra?.usage).toBeUndefined();
    // deleting a swipe splices the meta array with it
    const del = await drive(engineUrl, { method: "DELETE", path: `/chats/${id}/messages/${reply2.id}/swipes/3` }, m);
    expect(del.status).toBe(200);
    const chat3 = await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m);
    const reply3 = [...(chat3.json.messages as { id: string; role: string; extra?: { swipeMeta?: unknown[] } }[])].reverse().find((x) => x.role === "char")!;
    expect(reply3.extra?.swipeMeta).toHaveLength(3);
  }, 30_000);

  it("thinking is editable on its own, separate from the reply text", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    const chat = await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m);
    const reply = [...(chat.json.messages as { id: string; role: string; text: string; edited?: boolean; extra?: { reasoning?: string } }[])].reverse().find((x) => x.role === "char")!;
    // edit the reasoning only
    const r = await drive(engineUrl, { method: "PATCH", path: `/chats/${id}/messages/${reply.id}`, body: { reasoning: "revised thinking" } }, m);
    expect(r.status).toBe(200);
    const edited = r.json.message as typeof reply;
    expect(edited.extra?.reasoning).toBe("revised thinking");
    // the reply text is untouched
    expect(edited.text).toBe(reply.text);
    expect(edited.edited).toBeUndefined();
    // clearing sends empty string, stored as absent
    const r2 = await drive(engineUrl, { method: "PATCH", path: `/chats/${id}/messages/${reply.id}`, body: { reasoning: "  " } }, m);
    expect((r2.json.message as typeof reply).extra?.reasoning).toBeUndefined();
    // think-segment edits only touch parts messages; a parts-less message is a no-op
    const r3 = await drive(engineUrl, { method: "PATCH", path: `/chats/${id}/messages/${reply.id}`, body: { think: { index: 0, text: "x" } } }, m);
    expect(r3.status).toBe(200);
  }, 30_000);
});

describe("rp studio engine: data bank retrieval", () => {
  it("dense short chunks outrank long filler; stopword-only queries match nothing", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    // ~750 chars of stopword filler with ONE glancing content-word hit —
    // exactly the chunk that used to ride into every prompt
    const filler = ("the and she was with that this from they ").repeat(16) + "lantern " + ("the and she was with ").repeat(5);
    await drive(engineUrl, { method: "POST", path: "/databank", body: { name: "filler.txt", content: filler } }, m);
    await drive(engineUrl, { method: "POST", path: "/databank", body: { name: "focused.txt", content: "The lantern shop kept wicks, lantern oil, and spare lantern glass behind the counter." } }, m);
    const empty = await drive(engineUrl, { method: "POST", path: "/databank", body: { name: "x.txt", content: "   " } }, m);
    expect(empty.status).toBe(400);
    const r = await drive(engineUrl, { method: "GET", path: "/databank/search?q=the%20and%20lantern%20wicks" }, m);
    const results = r.json.results as { fileName: string; score: number }[];
    expect(results[0]!.fileName).toBe("focused.txt");
    expect(results[0]!.score).toBeGreaterThan(2);
    expect(results.some((x) => x.fileName === "filler.txt")).toBe(false); // glancing hit stays under the floor
    const none = await drive(engineUrl, { method: "GET", path: "/databank/search?q=the%20and%20was%20with" }, m);
    expect(none.json.results as unknown[]).toHaveLength(0);
  }, 30_000);

  it("enabled files inject into the assembled prompt, disabled ones don't", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    const up = await drive(engineUrl, { method: "POST", path: "/databank", body: { name: "lore.txt", content: "The kerosene ritual demands three matches and a steady hand." } }, m);
    const fid = (up.json.file as { id: string }).id;
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "tell me about the kerosene ritual and matches" } }, m);
    const req = m.requests[0]!.req as { messages: { role: string; content: string }[] };
    expect(req.messages.some((x) => x.content.includes("[Data bank"))).toBe(true);
    expect(req.messages.some((x) => x.content.includes("kerosene ritual"))).toBe(true);
    await drive(engineUrl, { method: "PATCH", path: `/databank/${fid}`, body: { enabled: false } }, m);
    const m2 = mockHost();
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "kerosene ritual matches again" } }, m2);
    const req2 = m2.requests[0]!.req as { messages: { content: string }[] };
    expect(req2.messages.some((x) => x.content.includes("[Data bank"))).toBe(false);
  }, 30_000);
});

describe("rp studio engine: names behavior + prompt post-processing", () => {
  const presetWith = (studio: Record<string, unknown>) => {
    fs.writeFileSync(path.join(root, "presets", "t1.json"), JSON.stringify({
      id: "t1", name: "T1", prompts: [], prompt_order: [], temperature: 0.8, top_p: 0.95,
      openai_max_tokens: 512, openai_max_context: 8192, studio,
    }));
  };
  const newChatWithPreset = async (m: ReturnType<typeof mockHost>) => {
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "t1" } }, m);
    return (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
  };

  it("namesBehavior content prefixes every turn with the speaker name; none never does", async () => {
    presetWith({ sections: [], namesBehavior: "content" });
    const m = mockHost();
    const id = await newChatWithPreset(m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello there" } }, m);
    const req = m.requests[0]!.req as { messages: { role: string; content: string }[] };
    const contents = req.messages.map((x) => x.content);
    expect(contents.some((c) => c.startsWith("You: hello there"))).toBe(true);
    expect(contents.some((c) => c.startsWith("Aria: ") && c.includes("Welcome in"))).toBe(true);

    presetWith({ sections: [], namesBehavior: "none" });
    const m2 = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "t1" } }, m2);
    const id2 = (fs.readdirSync(path.join(root, "chats")).filter((f) => f.endsWith(".meta.json")) as string[]).map((f: string) => f.replace(/\.meta\.json$/, "")).find((x: string) => x !== id)!;
    await drive(engineUrl, { method: "POST", path: `/chats/${id2}/send`, body: { text: "hello again" } }, m2);
    const req2 = m2.requests[0]!.req as { messages: { content: string }[] };
    expect(req2.messages.some((c) => /^You: |^Aria: /.test(c.content))).toBe(false);
  }, 30_000);

  it("post-processing merge collapses consecutive same-role entries; single folds everything", async () => {
    presetWith({ sections: [], promptPostProcessing: { enabled: true, mode: "merge" } });
    const m = mockHost();
    const id = await newChatWithPreset(m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "one" } }, m);
    const req = m.requests[0]!.req as { messages: { role: string }[] };
    const roles = req.messages.map((x) => x.role);
    for (let i = 1; i < roles.length; i++) expect(roles[i]).not.toBe(roles[i - 1]);

    presetWith({ sections: [], promptPostProcessing: { enabled: true, mode: "single" } });
    const m2 = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "t1" } }, m2);
    const id2 = (fs.readdirSync(path.join(root, "chats")).filter((f) => f.endsWith(".meta.json")) as string[]).map((f: string) => f.replace(/\.meta\.json$/, "")).find((x: string) => x !== id)!;
    await drive(engineUrl, { method: "POST", path: `/chats/${id2}/send`, body: { text: "two" } }, m2);
    const req2 = m2.requests[0]!.req as { messages: { role: string }[] };
    expect(req2.messages).toHaveLength(1);
    expect(req2.messages[0]!.role).toBe("user");
  }, 30_000);

  it("squash merges only consecutive system entries, never turns", async () => {
    // custom sections ride the classic prompts/prompt_order wire shape; the
    // studio bag carries the shaping switches (exactly what the client saves)
    fs.writeFileSync(path.join(root, "presets", "t1.json"), JSON.stringify({
      id: "t1", name: "T1",
      prompts: [
        { identifier: "s1", name: "S1", role: "system", content: "first system note" },
        { identifier: "s2", name: "S2", role: "system", content: "second system note" },
      ],
      prompt_order: [{ character_id: 100000, order: [{ identifier: "s1", enabled: true }, { identifier: "s2", enabled: true }] }],
      temperature: 0.8, top_p: 0.95, openai_max_tokens: 512, openai_max_context: 8192,
      studio: { squashSystemMessages: true },
    }));
    const m = mockHost();
    const id = await newChatWithPreset(m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    const req = m.requests[0]!.req as { messages: { role: string; content: string }[] };
    const systems = req.messages.filter((x) => x.role === "system");
    // the two notes collapse into one system entry; user/assistant turns stay separate
    expect(systems.some((x) => x.content.includes("first system note") && x.content.includes("second system note"))).toBe(true);
    expect(req.messages.some((x) => x.role === "user" && x.content.includes("hi"))).toBe(true);
    const roles = req.messages.map((x) => x.role);
    expect(roles.indexOf("user")).toBeGreaterThan(-1);
    expect(roles.filter((r) => r === "user").length).toBe(1); // the turn itself never merges into a neighbor
  }, 30_000);

  it("compact history collapses the whole chat into one labeled message and adds its stop string", async () => {
    presetWith({
      compactHistory: {
        enabled: true, role: "assistant", separator: "double",
        userPrefix: "**{{user}}:** ", userSuffix: "", charPrefix: "", charSuffix: "",
        stopString: "**{{user}}:**",
      },
    });
    const m = mockHost();
    const id = await newChatWithPreset(m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "compress me" } }, m);
    const req = m.requests[0]!.req as {
      messages: { role: string; content: string }[];
      presetParams?: { params?: { stop?: string[] } };
    };
    // the entire visible chat is ONE message — no user/assistant alternation left
    const blob = req.messages.filter((x) => x.content.includes("compress me"));
    expect(blob).toHaveLength(1);
    expect(blob[0]!.role).toBe("assistant");
    // turns keep their speaker labels, greeting before the fresh user turn
    expect(blob[0]!.content).toContain("**You:** compress me");
    expect(blob[0]!.content.indexOf("Welcome in")).toBeLessThan(blob[0]!.content.indexOf("**You:** compress me"));
    expect(req.messages.filter((x) => x.role === "user")).toHaveLength(0);
    // the compact stop string rides the sampler stops, macro-expanded
    expect(req.presetParams?.params?.stop).toContain("**You:**");
  }, 30_000);
});

describe("rp studio engine: utility prompts", () => {
  const chatIdOf = () => (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
  const presetWithUtils = (utils: Record<string, string>) => {
    const base = JSON.parse(fs.readFileSync(path.join(root, "presets", "default.json"), "utf8")) as Record<string, unknown>;
    base.utilityPrompts = {
      impersonation: "", continueNudge: "", newChat: "", groupNudge: "", emptySend: "", ...utils,
    };
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify(base));
  };

  it("newChat rides a freshly started chat; continue honors the prefill toggle", async () => {
    presetWithUtils({ newChat: "[BEGIN: {{char}}]", continueNudge: "KEEP GOING NOW" });
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf();
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    // second generation: history > 1 message → newChat must NOT ride
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "more" } }, m);
    const first = m.requests[0]!.req as { messages: { content: string }[] };
    expect(first.messages.some((x) => x.content.includes("[BEGIN: Aria]"))).toBe(true);
    const second = m.requests[1]!.req as { messages: { content: string }[] };
    expect(second.messages.some((x) => x.content.includes("[BEGIN:"))).toBe(false);
    // continue with prefill ON (the default): no nudge, the partial reply
    // stays the trailing assistant turn
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/continue`, body: {} }, m);
    const cont = m.requests[2]!.req as { messages: { role: string; content: string }[] };
    expect(cont.messages.some((x) => x.content.includes("KEEP GOING NOW"))).toBe(false);
    expect(cont.messages.at(-1)!.role).toBe("assistant");
    // prefill OFF: the nudge arrives as a trailing user turn
    const base = JSON.parse(fs.readFileSync(path.join(root, "presets", "default.json"), "utf8")) as { studio?: Record<string, unknown> };
    base.studio = { ...base.studio, continuePrefill: false };
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify(base));
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/continue`, body: {} }, m);
    const cont2 = m.requests[3]!.req as { messages: { role: string; content: string }[] };
    expect(cont2.messages.some((x) => x.role === "user" && x.content.includes("KEEP GOING NOW"))).toBe(true);
  }, 30_000);

  it("verbosity rides the request body when set, nothing on auto", async () => {
    const base = JSON.parse(fs.readFileSync(path.join(root, "presets", "default.json"), "utf8")) as { studio?: Record<string, unknown> };
    base.studio = { ...base.studio, verbosity: "low" };
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify(base));
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf();
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect(((peek.json.presetParams as { params?: Record<string, unknown> }).params ?? {}).verbosity).toBe("low");
    base.studio = { ...base.studio, verbosity: "auto" };
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify(base));
    const peek2 = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect(((peek2.json.presetParams as { params?: Record<string, unknown> }).params ?? {}).verbosity).toBeUndefined();
  }, 30_000);

  it("impersonation drafts the USER's message from history + the utility prompt", async () => {
    presetWithUtils({ impersonation: "DRAFT AS {{user}} PLEASE" });
    const m = mockHost({ text: "I nod slowly." });
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf();
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/impersonate`, body: {} }, m);
    const imp = m.requests[1]!.req as { messages: { role: string; content: string }[] };
    expect(imp.messages.some((x) => x.content.includes("DRAFT AS You PLEASE"))).toBe(true);
    // and the draft never lands in the chat
    const chat = await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m);
    const last = (chat.json.messages as { role: string }[]).at(-1)!;
    expect(last.role).toBe("char");
  }, 30_000);
});

describe("rp studio engine: example separator + echoed name strip", () => {
  const chatIdOf = () => (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");

  it("<START> in example dialogue becomes the [Example Chat] marker line", async () => {
    fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({
      spec: "chara_card_v2", name: "Aria", description: "A barista.", personality: "dry", scenario: "night",
      first_mes: "Welcome in.", mes_example: "You: hi<START>Aria: hello there",
    }));
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf();
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hey" } }, m);
    const req = m.requests[0]!.req as { messages: { content: string }[] };
    const exampleMsg = req.messages.find((x) => x.content.includes("hello there"))!;
    expect(exampleMsg.content).toContain("[Example Chat]");
    expect(exampleMsg.content).not.toContain("<START>");
  }, 30_000);

  const setNames = (v: string) => {
    const base = JSON.parse(fs.readFileSync(path.join(root, "presets", "default.json"), "utf8")) as { studio?: Record<string, unknown> };
    base.studio = { ...base.studio, namesBehavior: v };
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify(base));
  };
  /** One fresh chat with Aria, one send answered with `text`; the stored reply text. */
  const sendOnce = async (text: string) => {
    for (const f of fs.readdirSync(path.join(root, "chats"))) fs.rmSync(path.join(root, "chats", f), { force: true });
    const m = mockHost({ text });
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf();
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "one coffee" } }, m);
    return (r.json.reply as { text: string }).text;
  };

  it("a leading 'Name:' the model echoes is stripped, whether or not names ride the prompt", async () => {
    setNames("content");
    expect(await sendOnce("Aria: Sure thing, coming up.")).toBe("Sure thing, coming up.");
    setNames("none");
    expect(await sendOnce("Aria: Also stripped.")).toBe("Also stripped.");
    setNames("default");
    expect(await sendOnce("Aria: And by default.")).toBe("And by default.");
  }, 30_000);

  it("the bold form, another case and a space before the colon are stripped too", async () => {
    expect(await sendOnce("**Aria:** Bold.")).toBe("Bold.");
    expect(await sendOnce("*Aria*: Italic.")).toBe("Italic.");
    expect(await sendOnce("ARIA : Shouted.")).toBe("Shouted.");
  }, 30_000);

  it("a name that is not at the start, or another name, stays", async () => {
    expect(await sendOnce("Sure, Aria: coming up.")).toBe("Sure, Aria: coming up.");
    expect(await sendOnce("Bo: Not me.")).toBe("Bo: Not me.");
    expect(await sendOnce("Aria smiled.")).toBe("Aria smiled.");
  }, 30_000);

  it("a group turn (next) strips the speaker's own name", async () => {
    fs.mkdirSync(path.join(root, "characters", "bo"), { recursive: true });
    fs.writeFileSync(path.join(root, "characters", "bo", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Bo", description: "chill", first_mes: "" }));
    fs.writeFileSync(path.join(root, "groups", "duo.json"), JSON.stringify({ id: "duo", name: "Duo", memberIds: ["aria", "bo"], mode: "list", mutedIds: [] }));
    const m = mockHost({ text: "Bo: Right here." });
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { groupId: "duo" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello both" } }, m);
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/next`, body: { charId: "bo" } }, m);
    expect((r.json.reply as { name: string; text: string }).name).toBe("Bo");
    expect((r.json.reply as { text: string }).text).toBe("Right here.");
  }, 30_000);

  it("a swipe strips the echo; continue does not", async () => {
    const m = mockHost({ text: "Aria: Fresh take." });
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf();
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } }, m);
    const sw = await drive(engineUrl, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: 1 } }, m);
    expect((sw.json.message as { text: string }).text).toBe("Fresh take.");
    const m2 = mockHost({ text: "Aria: and then more." });
    const c = await drive(engineUrl, { method: "POST", path: `/chats/${id}/continue`, body: {} }, m2);
    expect((c.json.message as { text: string }).text).toContain("Aria: and then more.");
  }, 30_000);
});


describe("rp studio engine: world info scope", () => {
  // a library book that is NOT global and NOT linked to any character —
  // the exact shape that used to fire in every chat via the "empty scope
  // scans everything" fallback
  const shipTownBook = () => {
    fs.writeFileSync(path.join(root, "lorebooks", "town.json"), JSON.stringify({
      id: "town", name: "Town", globalActive: false, linkedCharacterIds: [],
      settings: {}, vectorized: null, isEmbedded: false, formatTemplate: "", folderId: null,
      entries: [{ uid: 0, title: "Tavern", keys: ["tavern"], content: "A cozy tavern.", constant: true, enabled: true, order: 100, position: "before_char" }],
    }));
  };
  const chatIdOf = (r: { json: Record<string, unknown> }) => (r.json.meta as { id: string }).id;
  const shipBook = (id: string, entries: Record<string, unknown>[]) => {
    fs.writeFileSync(path.join(root, "lorebooks", id + ".json"), JSON.stringify({
      id, name: id, globalActive: false, linkedCharacterIds: [], entries,
    }));
  };

  it("a chat with no bound books scans NOTHING — unbound constants never fire", async () => {
    shipTownBook();
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf(chat);
    const status = await drive(engineUrl, { method: "POST", path: "/wi-status", body: { chatId: id } }, m);
    expect(status.json.fired as unknown[]).toHaveLength(0);
    const sent = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello", model: "mock/model" } }, m);
    expect(sent.status).toBe(200);
    const req = m.requests[0]!.req as { messages: { role: string; content: string }[] };
    expect(req.messages.some((x) => x.role === "system" && x.content.includes("A cozy tavern."))).toBe(false);
  }, 30_000);

  it("entry status is the constant source of truth; the legacy boolean only counts when status is absent", async () => {
    shipBook("statusbook", [
      { uid: 0, title: "Status const", keys: [], content: "Status constant, no boolean.", status: "constant", enabled: true, order: 100, position: "before_char" },
      { uid: 1, title: "Contradictory", keys: [], content: "Boolean says constant, status says normal.", status: "normal", constant: true, enabled: true, order: 100, position: "before_char" },
      { uid: 2, title: "Legacy", keys: [], content: "Legacy boolean constant.", constant: true, enabled: true, order: 100, position: "before_char" },
    ]);
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf(chat);
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["statusbook"] } }, m);
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "hello" } }, m);
    const sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("Status constant, no boolean."); // status-only constant fires
    expect(sys).toContain("Legacy boolean constant."); // legacy boolean (no status) still fires
    expect(sys).not.toContain("Boolean says constant"); // contradictory pair: status wins, no keys → stays out
  }, 30_000);

  it("recursion: an entry's content can trigger another entry", async () => {
    shipBook("chain", [
      { uid: 0, title: "Mentions ember", keys: ["lantern"], content: "The lantern holds a captured EMBERFLARE.", enabled: true, order: 100, position: "before_char" },
      { uid: 1, title: "Emberflare lore", keys: ["emberflare"], content: "An emberflare is a fire spirit.", enabled: true, order: 100, position: "before_char" },
      { uid: 2, title: "Not reachable", keys: ["never-said"], content: "Should stay out.", enabled: true, order: 100, position: "before_char" },
    ]);
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf(chat);
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["chain"] } }, m);
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "show me the lantern" } }, m);
    const sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("captured EMBERFLARE"); // keyed by the user text
    expect(sys).toContain("An emberflare is a fire spirit."); // keyed by the FIRST entry's content
    expect(sys).not.toContain("Should stay out.");
  }, 30_000);

  it("preventFurtherRecursion stops the chain; nonRecursable only fires on the base scan", async () => {
    shipBook("chain2", [
      { uid: 0, title: "A", keys: ["alpha"], content: "Alpha reveals BETA-marker.", enabled: true, order: 100, position: "before_char", preventFurtherRecursion: true },
      { uid: 1, title: "B", keys: ["beta-marker"], content: "Beta lore.", enabled: true, order: 100, position: "before_char" },
      { uid: 2, title: "C", keys: ["gamma"], content: "Gamma direct.", enabled: true, order: 100, position: "before_char", nonRecursable: true },
    ]);
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf(chat);
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["chain2"] } }, m);
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "alpha and gamma" } }, m);
    const sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("Alpha reveals"); // fired by user text
    expect(sys).not.toContain("Beta lore."); // A's content must not join the scan
    expect(sys).toContain("Gamma direct."); // nonRecursable fires on the base scan
  }, 30_000);

  it("sticky keeps a fired entry in after its key leaves the window; cooldown then locks it out", async () => {
    shipBook("sticky", [
      // a turn is 2 messages (user + reply): sticky 3 spans the fire turn plus
      // one more, cooldown 3 locks it out for the turn after that
      { uid: 0, title: "Guard", keys: ["guard"], content: "The guard is alert.", enabled: true, order: 100, position: "before_char", sticky: 3, cooldown: 3 },
    ]);
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf(chat);
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["sticky"] } }, m);
    const sysOf = (i: number) => (m.requests[i]!.req as { messages: { content: string }[] }).messages.map((x) => x.content).join("\n");
    // fire it: "guard" in the sent text (scan counts greeting, the user
    // message and its staged copy = tick 3)
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "the guard looks at me", model: "mock/model" } }, m);
    expect(sysOf(0)).toContain("The guard is alert.");
    const meta1 = JSON.parse(fs.readFileSync(path.join(root, "chats", id + ".meta.json"), "utf8"));
    expect(meta1.wiTimed.sticky["sticky#0"]).toMatchObject({ start: 3, end: 6 });
    // next turn WITHOUT the key (tick 5, sticky end 6): still in the prompt
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "small talk", model: "mock/model" } }, m);
    expect(sysOf(1)).toContain("The guard is alert.");
    // the turn after (tick 7 >= end 6): sticky expired, cooldown armed — even
    // a fresh key hit is suppressed
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "the guard again", model: "mock/model" } }, m);
    expect(sysOf(2)).not.toContain("The guard is alert.");
    const meta2 = JSON.parse(fs.readFileSync(path.join(root, "chats", id + ".meta.json"), "utf8"));
    expect(meta2.wiTimed.cooldown["sticky#0"]).toMatchObject({ start: 7, end: 10 });
  }, 30_000);

  it("delay holds an entry back until the chat grows", async () => {
    shipBook("delayed", [
      { uid: 0, title: "Late", keys: ["road"], content: "The road winds north.", enabled: true, order: 100, position: "before_char", delay: 4 },
    ]);
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf(chat);
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["delayed"] } }, m);
    // chat has 1 message (greeting); a peek staged user text leaves tick at 1 < 4
    const early = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "the road" } }, m);
    expect((early.json.messages as { content: string }[]).map((x) => x.content).join("\n")).not.toContain("The road winds north.");
  }, 30_000);

  it("inclusion groups pick ONE winner (override beats the roll)", async () => {
    shipBook("grouped", [
      { uid: 0, title: "G-red", keys: ["color"], content: "The banner is red.", enabled: true, order: 100, position: "before_char", group: "banner" },
      { uid: 1, title: "G-blue", keys: ["color"], content: "The banner is blue.", enabled: true, order: 100, position: "before_char", group: "banner", groupOverride: true },
      { uid: 2, title: "Free", keys: ["color"], content: "The banner flaps.", enabled: true, order: 100, position: "before_char" },
    ]);
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf(chat);
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["grouped"] } }, m);
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "what color" } }, m);
    const sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("The banner is blue."); // override wins
    expect(sys).not.toContain("The banner is red."); // group loser
    expect(sys).toContain("The banner flaps."); // ungrouped entry unaffected
  }, 30_000);

  it("regex keys match as patterns; scan depth is preset-controlled", async () => {
    shipBook("regexed", [
      { uid: 0, title: "Shout", keys: ["/hel+o!/"], content: "Someone shouted.", enabled: true, order: 100, position: "before_char" },
      { uid: 1, title: "Old", keys: ["ancientword"], content: "Ancient lore.", enabled: true, order: 100, position: "before_char" },
    ]);
    // preset: scan only the LAST message (default 4 would still see it — set
    // scanDepth 1 and push the trigger deeper than the window)
    fs.writeFileSync(path.join(root, "presets", "shallows.json"), JSON.stringify({
      id: "shallows", name: "Shallow", prompts: [], prompt_order: [],
      studio: { worldInfo: { scanDepth: 1 } },
    }));
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "shallows" } }, m);
    const id = chatIdOf(chat);
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["regexed"] } }, m);
    // an earlier message carries the plain key; the staged text carries the
    // regex key — scanDepth 1 keeps only the staged text in the window
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "an ancientword passes by", model: "mock/model" } }, m);
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "hellllo!" } }, m);
    const sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("Someone shouted."); // regex key matched
    expect(sys).not.toContain("Ancient lore."); // outside the 1-message window
  }, 30_000);

  it("binding the book to the chat brings it into scope (positive control)", async () => {
    shipTownBook();
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf(chat);
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["town"] } }, m);
    const status = await drive(engineUrl, { method: "POST", path: "/wi-status", body: { chatId: id } }, m);
    expect((status.json.fired as { book: string }[]).some((f) => f.book === "Town")).toBe(true);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello", model: "mock/model" } }, m);
    const req = m.requests[0]!.req as { messages: { role: string; content: string }[] };
    expect(req.messages.some((x) => x.role === "system" && x.content.includes("A cozy tavern."))).toBe(true);
  }, 30_000);
});

describe("rp studio import", () => {
  it("batch: cards + worlds + presets + regex land in the app data", async () => {
    const m = mockHost();
    const r = await drive(stUrl, {
      method: "POST", path: "/import/batch",
      body: {
        cards: [{ name: "Imported Bot", description: "test", first_mes: "hi" }],
        worldInfo: [{ name: "Town", entries: { 0: { key: ["tavern"], content: "A cozy tavern.", constant: false } } }],
        presets: [{ name: "Imported Preset", temperature: 1.2, prompts: [{ identifier: "main", name: "Main", role: "system", content: "be nice" }] }],
        regex: [{ scriptName: "Trim", findRegex: "/foo/g", replaceString: "", placement: [1] }],
        personas: [{ name: "Hero", description: "brave" }],
      },
    }, m);
    expect(r.json.characters).toHaveLength(1);
    expect(r.json.lorebooks).toHaveLength(1);
    expect(r.json.presets).toHaveLength(1);
    expect(r.json.regex).toHaveLength(1);
    expect(r.json.personas).toHaveLength(1);
    // preset kept the prompts[] shape with prompt_order normalized
    const preset = JSON.parse(fs.readFileSync(path.join(root, "presets", `${(r.json.presets as string[])[0]}.json`), "utf8"));
    expect(preset.prompts[0].content).toBe("be nice");
    expect(preset.prompt_order[0].order[0].identifier).toBe("main");
    // regex placement numbers: 1 user input, 2 AI output; /re/flags parsed
    const rx = JSON.parse(fs.readFileSync(path.join(root, "regex", `${(r.json.regex as string[])[0]}.json`), "utf8"));
    expect(rx.placement).toEqual(["user_input"]);
    expect(rx.findRegex).toBe("foo");
    expect(rx.flags).toBe("g");
  }, 30_000);

  it("preset section groups wrap consecutive members; conditions gate sections", async () => {
    fs.writeFileSync(path.join(root, "presets", "grouped.json"), JSON.stringify({
      id: "grouped", name: "Grouped",
      prompts: [
        { identifier: "a", name: "A", role: "system", content: "Alpha text." },
        { identifier: "b", name: "B", role: "system", content: "Beta text." },
        { identifier: "c", name: "C", role: "system", content: "Gamma text." },
        { identifier: "cond", name: "Cond", role: "system", content: "Night mode text." },
      ],
      prompt_order: [{ character_id: 100000, order: [
        { identifier: "a", enabled: true }, { identifier: "b", enabled: true },
        { identifier: "c", enabled: true }, { identifier: "cond", enabled: true },
      ] }],
      studio: {
        groups: [{ id: "g1", name: "Style Notes", wrapFormat: "xml" }],
        sections: [
          { id: "a", groupId: "g1" }, { id: "b", groupId: "g1" },
          { id: "c", groupId: null }, { id: "cond", groupId: null, condition: "mood==tense" },
        ],
      },
    }));
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "grouped" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    const sysOf = async () => {
      const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
      return (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    };
    // group members merge into one xml-wrapped block; the condition fails (no var)
    let sys = await sysOf();
    expect(sys).toContain("<style-notes>\nAlpha text.\nBeta text.\n</style-notes>");
    expect(sys).toContain("Gamma text.");
    expect(sys).not.toContain("Night mode text.");
    // set the chat var the condition waits on: the section appears
    const metaPath = path.join(root, "chats", id + ".meta.json");
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    meta.chatVars = { mood: "tense" };
    fs.writeFileSync(metaPath, JSON.stringify(meta));
    sys = await sysOf();
    expect(sys).toContain("Night mode text.");
  }, 30_000);

  it("author's note object: position, depth and role all honored", async () => {
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    const peekMsgs = async () => {
      const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "hello" } }, m);
      return peek.json.messages as { role: string; content: string }[];
    };
    // in-chat @ depth 1, system role: the note sits right before the staged user turn
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { authorNoteObject: { text: "keep it tense", position: "in-chat", depth: 1, role: "system" } } }, m);
    let msgs = await peekMsgs();
    expect(msgs[msgs.length - 2]!.content).toContain("[Author's note]");
    expect(msgs[msgs.length - 2]!.role).toBe("system");
    // in-chat @ depth 2: one earlier (between greeting and user turn)
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { authorNoteObject: { text: "keep it tense", position: "in-chat", depth: 2, role: "user" } } }, m);
    msgs = await peekMsgs();
    expect(msgs[msgs.length - 3]!.content).toContain("[Author's note]");
    expect(msgs[msgs.length - 3]!.role).toBe("user");
    // before-system: the note leads the whole prompt
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { authorNoteObject: { text: "keep it tense", position: "before-system", role: "system" } } }, m);
    msgs = await peekMsgs();
    expect(msgs[0]!.content).toContain("[Author's note]");
    // after-system: after the system block, still above the chat history
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { authorNoteObject: { text: "keep it tense", position: "after-system", role: "system" } } }, m);
    msgs = await peekMsgs();
    const noteIdx = msgs.findIndex((x) => x.content.includes("[Author's note]"));
    const greetIdx = msgs.findIndex((x) => x.content.includes("Welcome in"));
    expect(noteIdx).toBeGreaterThan(0);
    expect(noteIdx).toBeLessThan(greetIdx);
  }, 30_000);

  it("author's note with includeInWIScan feeds world-info keys", async () => {
    fs.writeFileSync(path.join(root, "lorebooks", "notekey.json"), JSON.stringify({
      id: "notekey", name: "notekey", globalActive: false, linkedCharacterIds: [],
      entries: [{ uid: 0, title: "Codeword", keys: ["secretrailway"], content: "The secret railway opens at dusk.", enabled: true, order: 100, position: "before_char" }],
    }));
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["notekey"] } }, m);
    // without the scan flag the note's keyword does not fire the entry
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { authorNoteObject: { text: "the secretrailway hums", position: "after-system", role: "system" } } }, m);
    let peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    let sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).not.toContain("The secret railway opens at dusk.");
    // with it, the entry activates off the note text
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { authorNoteObject: { text: "the secretrailway hums", position: "after-system", role: "system", includeInWIScan: true } } }, m);
    peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("The secret railway opens at dusk.");
  }, 30_000);

  it("audit fixes: regex depth bounds, case-sensitive WI, matchSources, budget knobs, note frequency", async () => {
    const m = mockHost();
    // regex depth: a script bounded to depth 0-1 must not touch older messages
    fs.writeFileSync(path.join(root, "regex", "near.json"), JSON.stringify({ scriptName: "NearOnly", findRegex: "old", replaceString: "NEW", placement: ["user_input", "ai_output"], minDepth: 0, maxDepth: 1 }));
    let chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    let id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "old things", model: "mock/model" } }, m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "fresh", model: "mock/model" } }, m);
    let peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    let sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("old things"); // depth 3: outside the 0-1 window, untouched
    expect(sys).not.toContain("NEW"); // so the bounded script never rewrote it

    // case-sensitive book: key "Lantern" fires on the raw card text, and a
    // lowercase "lantern" in chat does NOT fire it
    fs.writeFileSync(path.join(root, "lorebooks", "cased.json"), JSON.stringify({
      id: "cased", name: "cased", entries: [{ uid: 0, title: "C", keys: ["Lantern"], content: "Case-fired lore.", enabled: true, order: 100, position: "before_char", caseSensitive: true }],
      settings: { caseSensitive: true },
    }));
    chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["cased"] } }, m);
    peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "the lantern glows" } }, m);
    sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).not.toContain("Case-fired lore."); // lowercase chat text misses

    // matchSources: an entry keyed on a word only present in the card's
    // DESCRIPTION fires when its matchSources.description flag is on
    fs.writeFileSync(path.join(root, "lorebooks", "srcd.json"), JSON.stringify({
      id: "srcd", name: "srcd", entries: [{ uid: 0, title: "S", keys: ["barista"], content: "Source-fired lore.", enabled: true, order: 100, position: "before_char", matchSources: { description: true, personality: false, scenario: false, persona: false } }],
    }));
    chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["srcd"] } }, m);
    peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("Source-fired lore."); // "A barista." is in the card description

    // author's note frequency 2: with an even message count it rides, odd it does not
    chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { authorNoteObject: { text: "every other", position: "in-chat", depth: 1, role: "system", frequency: 2 } } }, m);
    peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect((peek.json.messages as { content: string }[]).map((x) => x.content).join("\n")).not.toContain("every other"); // 1 message: odd
    peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "hi" } }, m);
    expect((peek.json.messages as { content: string }[]).map((x) => x.content).join("\n")).toContain("every other"); // 2: even
  }, 30_000);





  it("vectorized lorebook entries activate on similarity, with a cached sidecar", async () => {
    fs.writeFileSync(path.join(root, "lorebooks", "vecbook.json"), JSON.stringify({
      id: "vecbook", name: "vecbook", entries: [
        { uid: 0, title: "V", keys: [], content: "The harbor district floods every spring.", enabled: true, order: 100, position: "before_char", status: "vectorized" },
      ],
      vectorized: { scoreThreshold: 0.35 },
    }));
    // harbor-ish text -> [1,0]; everything else [0,1]
    const m = mockHost(undefined, undefined, (texts) => texts.map((t) => (t.includes("harbor") ? [1, 0] : [0, 1])));
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["vecbook"] } }, m);
    // user text about rain and docks embeds [0,1]... give it the harbor word to embed [1,0]
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "harbor at night" } }, m);
    let sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("harbor district floods"); // fired by cosine, not keys
    // the sidecar cached the entry vector
    const sidecar = JSON.parse(fs.readFileSync(path.join(root, "lorebooks", ".vectors.json"), "utf8")) as Record<string, { vector: number[] }>;
    expect(sidecar["vecbook#0"]!.vector).toEqual([1, 0]);
    // second peek: entry now cached, only the scan embeds
    const peek2 = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "harbor again" } }, m);
    sys = (peek2.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("harbor district floods");
  }, 30_000);



  it("normalizes legacy world positions and skips empty entries", async () => {
    const m = mockHost();
    const r = await drive(stUrl, {
      method: "POST", path: "/import/batch",
      body: { worldInfo: [{ name: "W", entries: { a: { key: ["x"], content: "kept", position: 1 }, b: { key: ["y"], content: "  " } } }] },
    }, m);
    expect(r.json.lorebooks).toHaveLength(1);
    const book = JSON.parse(fs.readFileSync(path.join(root, "lorebooks", `${(r.json.lorebooks as string[])[0]}.json`), "utf8"));
    expect(book.entries).toHaveLength(1);
    expect(book.entries[0].position).toBe("after_char");
  }, 30_000);

  it("preset import carries the full sampler set, utility prompts and behavior flags", async () => {
    const m = mockHost();
    const r = await drive(stUrl, {
      method: "POST", path: "/import/batch",
      body: {
        presets: [{
          name: "Full Sweep",
          temperature: 0.9, openai_max_tokens: 350, truncation_length: 16384,
          top_k: 40, min_p: 0.05, dry_multiplier: 0.8, dry_base: 1.75, dry_allowed_length: 2, dry_last_n: 0,
          xtc_probability: 0.5, xtc_threshold: 0.1, typical_p: 0.9, smoothing_factor: 2.5, temperature_last: true,
          negative_prompt: "avoid this", guidance_scale: 1.2, mirostat_mode: 2, seed: 1234,
          names_behavior: 2, squash_system_messages: true, continue_prefill: false,
          assistant_prefill: "Sure, ",
          stop: ["\\nUser:", "\\n{{user}}:"], custom_stop_strings: "\\nYou:",
          impersonation_prompt: "write the user's next message", continue_nudge_prompt: "[Continue]",
          new_chat_prompt: "[Start a new chat]", group_nudge_prompt: "[Group]",
          reasoning_effort: "low",
          prompts: [{ identifier: "main", name: "Main", role: "system", content: "be nice" }],
        }],
      },
    }, m);
    expect(r.json.presets).toHaveLength(1);
    const preset = JSON.parse(fs.readFileSync(path.join(root, "presets", `${(r.json.presets as string[])[0]}.json`), "utf8"));
    expect(preset.openai_max_context).toBe(16384); // truncation_length alias
    expect(preset.dry_multiplier).toBe(0.8);
    expect(preset.xtc_probability).toBe(0.5);
    expect(preset.typical_p).toBe(0.9);
    expect(preset.smoothing_factor).toBe(2.5);
    expect(preset.temperature_last).toBe(true);
    expect(preset.negative_prompt).toBe("avoid this");
    expect(preset.reasoning).toBe("low");
    expect(preset.studio.namesBehavior).toBe("content"); // names_behavior 2 = always prefix
    expect(preset.studio.squashSystemMessages).toBe(true);
    expect(preset.studio.continuePrefill).toBe(false);
    expect(preset.studio.samplers.assistantPrefill).toBe("Sure, ");
    expect(preset.studio.samplers.stopStrings).toEqual(["\\nUser:", "\\n{{user}}:", "\\nYou:"]);
    expect(preset.utilityPrompts.impersonation).toBe("write the user's next message");
    expect(preset.utilityPrompts.continueNudge).toBe("[Continue]");
    expect(preset.utilityPrompts.newChat).toBe("[Start a new chat]");
    expect(preset.utilityPrompts.groupNudge).toBe("[Group]");

    // the engine forwards the whole set: peek a chat pinned to this preset
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: preset.id } }, m);
    const id = fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json"))!.replace(/\.meta\.json$/, "");
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    const params = ((peek.json.presetParams as { params?: Record<string, unknown> }).params ?? {});
    expect(params.dry_multiplier).toBe(0.8);
    expect(params.xtc_threshold).toBe(0.1);
    expect(params.typical_p).toBe(0.9);
    expect(params.negative_prompt).toBe("avoid this");
    expect(params.seed).toBe(1234);
    expect(params.temperature_last).toBe(true);
    expect(params.stop).toContain("\\nUser:");
    expect(peek.json.assistantPrefill).toBe("Sure, ");
  }, 30_000);

  it("regex import honors markdownOnly/promptOnly and depth bounds", async () => {
    const m = mockHost();
    const r = await drive(stUrl, {
      method: "POST", path: "/import/batch",
      body: {
        regex: [
          { scriptName: "DisplayOnly", findRegex: "foo", replaceString: "bar", placement: [1, 2], markdownOnly: true },
          { scriptName: "PromptOnly", findRegex: "baz", replaceString: "qux", placement: [1], promptOnly: true },
          { scriptName: "Deep", findRegex: "a", replaceString: "b", placement: [1], minDepth: 2, maxDepth: 8 },
        ],
      },
    }, m);
    expect(r.json.regex).toHaveLength(3);
    const all = fs.readdirSync(path.join(root, "regex")).map((f) => JSON.parse(fs.readFileSync(path.join(root, "regex", f), "utf8")) as { scriptName: string; placement: string[]; markdownOnly: boolean; promptOnly: boolean; minDepth: number | null; maxDepth: number | null });
    const display = all.find((x) => x.scriptName === "DisplayOnly")!;
    expect(display.placement).toEqual(["user_input", "ai_output"]);
    expect([display.markdownOnly, display.promptOnly]).toEqual([true, false]);
    const prompt = all.find((x) => x.scriptName === "PromptOnly")!;
    expect(prompt.placement).toEqual(["user_input"]);
    expect([prompt.markdownOnly, prompt.promptOnly]).toEqual([false, true]);
    expect(all.find((x) => x.scriptName === "Deep")?.minDepth).toBe(2);
    expect(all.find((x) => x.scriptName === "Deep")?.maxDepth).toBe(8);
  }, 30_000);
});

describe("rp studio marketplace (chub search)", () => {
  it("searches gateway.chub.ai with a browser UA and normalizes the catalog", async () => {
    const m = mockHost(undefined, (key, req) => {
      expect(key).toBe("search");
      const url = String(req.url);
      expect(url).toContain("https://gateway.chub.ai/search?");
      expect(url).toContain("namespace=characters");
      expect(url).toContain("search=sera");
      expect(String((req.headers as Record<string, string>)["user-agent"])).toContain("Mozilla/5.0");
      return {
        ok: true, status: 200,
        json: { data: { count: 42, page: 1, nodes: [
          {
            name: "Sera", fullPath: "someuser/sera-abc", tagline: "an angel",
            description: "An angel of great renown.", topics: ["RPG", "Female"],
            starCount: 1234, n_favorites: 7, nTokens: 795, rating: 4.5, ratingCount: 7, nChats: 9, nMessages: 90,
            nsfw_image: true, avatar_url: "https://avatars.charhub.io/avatars/someuser/sera-abc/avatar.webp",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ] } },
      };
    });
    const r = await drive(stUrl, { method: "POST", path: "/marketplace/search", body: { source: "chub", search: "sera" } }, m);
    expect(r.status).toBe(200);
    expect(r.json.count).toBe(42);
    const item = (r.json.results as Record<string, unknown>[])[0]!;
    expect(item).toMatchObject({
      id: "someuser/sera-abc", creator: "someuser", name: "Sera", nsfw: true,
      // chub's starCount is the DOWNLOAD count; n_favorites is real favorites
      downloads: 1234, favorites: 7, tokens: 795,
      avatar: "https://avatars.charhub.io/avatars/someuser/sera-abc/avatar.webp",
    });
  }, 30_000);

  it("unknown source is refused, rogue sort falls back to downloads, fetch failure maps to 502", async () => {
    const bad = await drive(stUrl, { method: "POST", path: "/marketplace/search", body: { source: "evilcorp" } }, mockHost());
    expect(bad.status).toBe(400);
    expect(String(bad.json.error)).toContain("unknown marketplace source");

    // an unknown sort key is a 400 at the catalog, never a silent fallback
    // there — so it must never leave here
    const m = mockHost(undefined, (_key, req) => {
      expect(String(req.url)).toContain("sort=download_count");
      return { ok: false, status: 403, error: "forbidden" };
    });
    const r = await drive(stUrl, { method: "POST", path: "/marketplace/search", body: { sort: "DROP TABLE" } }, m);
    expect(r.status).toBe(502);
    expect(String(r.json.error)).toContain("403");
  }, 30_000);

  it("adult listings are asked for by default; trending replaces the ordering", async () => {
    // the catalog hides adult cards unless all three flags are stated, which
    // silently cuts the pool by ~95%
    const m = mockHost(undefined, (_key, req) => {
      const url = String(req.url);
      expect(url).toContain("nsfw=true");
      expect(url).toContain("nsfl=false");
      expect(url).toContain("nsfw_only=false");
      expect(url).toContain("include_forks=true");
      return { ok: true, status: 200, json: { data: { count: 1, page: 1, nodes: [] } } };
    });
    expect((await drive(stUrl, { method: "POST", path: "/marketplace/search", body: {} }, m)).status).toBe(200);

    const safe = mockHost(undefined, (_key, req) => {
      const url = String(req.url);
      expect(url).toContain("nsfw=false");
      expect(url).toContain("nsfw_only=false");
      return { ok: true, status: 200, json: { data: { count: 1, page: 1, nodes: [] } } };
    });
    expect((await drive(stUrl, { method: "POST", path: "/marketplace/search", body: { nsfw: false } }, safe)).status).toBe(200);

    // trending is a different POOL, not an ordering: it takes over the sort
    const hot = mockHost(undefined, (_key, req) => {
      const url = String(req.url);
      expect(url).toContain("sort=trending");
      expect(url).not.toContain("sort=rating");
      return { ok: true, status: 200, json: { data: { count: 1, page: 1, nodes: [] } } };
    });
    expect((await drive(stUrl, { method: "POST", path: "/marketplace/search", body: { trending: true, sort: "rating" } }, hot)).status).toBe(200);
  }, 30_000);

  it("fine-grained filters ride through; blanks and bad numbers are dropped", async () => {
    const m = mockHost(undefined, (_key, req) => {
      const url = String(req.url);
      expect(url).toContain("min_tokens=500");
      expect(url).toContain("max_days_ago=30");
      expect(url).toContain("min_ai_rating=4");
      expect(url).toContain("require_lore=true");
      expect(url).toContain("require_example_dialogues=true");
      expect(url).toContain("excludetopics=gore");
      // false requirements narrow nothing, so they are never sent
      expect(url).not.toContain("require_images");
      // out-of-range numbers are dropped rather than clamped into a lie
      expect(url).not.toContain("min_tags");
      return { ok: true, status: 200, json: { data: { count: 1, page: 1, nodes: [] } } };
    });
    const r = await drive(stUrl, { method: "POST", path: "/marketplace/search", body: {
      minTokens: 500, maxDaysAgo: 30, minAiRating: 4, minTags: 0,
      requireLore: true, requireExamples: true, requireImages: false,
      excludeTags: ["gore"],
    } }, m);
    expect(r.status).toBe(200);
  }, 30_000);

  it("tag filters ride through (AND default, ANY opt-in) with sanitizing", async () => {
    const m = mockHost(undefined, (_key, req) => {
      const url = String(req.url);
      // embedded commas/spaces are neutralized so a tag can't smuggle extra
      // filter params; empty entries dropped; AND is the default
      expect(url).toContain("topics=Female%2CMale%2CFem+ale");
      expect(url).not.toContain("inclusive_or");
      return { ok: true, status: 200, json: { data: { count: 2, page: 1, nodes: [] } } };
    });
    const r = await drive(stUrl, { method: "POST", path: "/marketplace/search", body: { tags: ["Female", "Male", "Fem,ale", ""] } }, m);
    expect(r.status).toBe(200);
    // OR is inclusive_or — tags_mode is not a parameter the catalog reads, so
    // sending it left every "any" search silently ANDed
    const m2 = mockHost(undefined, (_key, req) => {
      expect(String(req.url)).toContain("inclusive_or=true");
      return { ok: true, status: 200, json: { data: { count: 368, page: 1, nodes: [] } } };
    });
    const r2 = await drive(stUrl, { method: "POST", path: "/marketplace/search", body: { tags: ["Female", "Male"], tagsMode: "any" } }, m2);
    expect(r2.status).toBe(200);
    // creator rides as chub's username param
    const m3 = mockHost(undefined, (_key, req) => {
      const url = String(req.url);
      expect(url).toContain("username=Jay_D");
      expect(url).toContain("search=abby");
      return { ok: true, status: 200, json: { data: { count: 1, page: 1, nodes: [] } } };
    });
    const r3 = await drive(stUrl, { method: "POST", path: "/marketplace/search", body: { search: "abby", creator: "Jay_D" } }, m3);
    expect(r3.status).toBe(200);
  }, 30_000);

  it("detail returns the full card definition (greeting, alternates, lorebook count)", async () => {
    const m = mockHost(undefined, (key, req) => {
      expect(key).toBe("detail");
      expect(String(req.url)).toBe("https://api.chub.ai/api/characters/someuser/sera-abc?full=true");
      return {
        ok: true, status: 200,
        json: { node: { definition: {
          first_message: "Hello there.",
          alternate_greetings: ["Alt one.", "Alt two."],
          personality: "A wary ranger.",
          scenario: "A cold forest.",
          example_dialogs: "<START>...",
          description: "Made for a contest.",
          system_prompt: "",
          post_history_instructions: "",
          embedded_lorebook: { entries: { a: { content: "x" }, b: { content: "y" } } },
        } } },
      };
    });
    const r = await drive(stUrl, { method: "POST", path: "/marketplace/detail", body: { source: "chub", id: "someuser/sera-abc" } }, m);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      id: "someuser/sera-abc", greeting: "Hello there.",
      alternateGreetings: ["Alt one.", "Alt two."],
      personality: "A wary ranger.", scenario: "A cold forest.",
      creatorNotes: "Made for a contest.", lorebookEntries: 2,
    });
    const bad = await drive(stUrl, { method: "POST", path: "/marketplace/detail", body: { id: "../etc/passwd" } }, mockHost());
    expect(bad.status).toBe(400);
  }, 30_000);
});

describe("rp studio: scoped regex + extended samplers + v3 cards", () => {
  it("preset-scoped regex applies only when the chat uses that preset", async () => {
    fs.writeFileSync(path.join(root, "regex", "scoped.json"), JSON.stringify({
      id: "scoped", scriptName: "Scoped", scope: "preset", scopeTargetId: "scoped-preset",
      findRegex: "PLAIN", replaceString: "SCRUBBED", placement: ["ai_output", "user_input", "prompt"], disabled: false,
    }));
    fs.writeFileSync(path.join(root, "regex", "global.json"), JSON.stringify({
      id: "global", scriptName: "Global", scope: "global",
      findRegex: "MARKER", replaceString: "GONE", placement: ["prompt"], disabled: false,
    }));
    fs.writeFileSync(path.join(root, "presets", "scoped-preset.json"), JSON.stringify({
      id: "scoped-preset", name: "Scoped", prompts: [{ identifier: "main", name: "Main", role: "system", marker: true, content: "Say PLAIN things." }],
      prompt_order: [{ character_id: 100000, order: [{ identifier: "main", enabled: true }] }],
    }));
    const m1 = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "scoped-preset" } }, m1);
    const id1 = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id1}/send`, body: { text: "keep PLAIN here", model: "mock/model" } }, m1);
    const sys1 = (m1.requests[0]!.req as { messages: { role: string; content: string }[] }).messages.map((x) => x.content).join("\n");
    expect(sys1).toContain("Say PLAIN things."); // preset text is never regexed
    expect(sys1).toContain("keep SCRUBBED here"); // the scoped script fired on the turn
    // a chat on a DIFFERENT preset: the scoped script must NOT fire
    const m2 = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "default" } }, m2);
    const id2 = (fs.readdirSync(path.join(root, "chats")).filter((f) => f.endsWith(".meta.json")).map((f) => f.replace(/\.meta\.json$/, "")) as string[]).find((x) => x !== id1)!;
    await drive(engineUrl, { method: "POST", path: `/chats/${id2}/send`, body: { text: "keep PLAIN here", model: "mock/model" } }, m2);
    const sys2 = (m2.requests[0]!.req as { messages: { role: string; content: string }[] }).messages.map((x) => x.content).join("\n");
    expect(sys2).toContain("PLAIN"); // untouched — wrong preset
    expect(sys2).not.toContain("SCRUBBED");
    // global script applies to both chats
    expect(sys1).not.toContain("MARKER");
    expect(sys2).not.toContain("MARKER");
  }, 30_000);

  it("character-scoped regex skips other characters' chats", async () => {
    fs.writeFileSync(path.join(root, "regex", "charonly.json"), JSON.stringify({
      id: "charonly", scriptName: "Aria only", scope: "character", scopeTargetId: "aria",
      findRegex: "scone", replaceString: "muffin", placement: ["user_input"], disabled: false,
    }));
    fs.mkdirSync(path.join(root, "characters", "zeta"), { recursive: true });
    fs.writeFileSync(path.join(root, "characters", "zeta", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Zeta", description: "other", first_mes: "hi" }));
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const idA = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${idA}/send`, body: { text: "a scone please", model: "mock/model" } }, m);
    const msgA = (m.requests[0]!.req as { messages: { content: string }[] }).messages;
    expect(msgA.some((x) => x.content.includes("muffin"))).toBe(true);
    const m2 = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "zeta" } }, m2);
    const idZ = (fs.readdirSync(path.join(root, "chats")).filter((f) => f.endsWith(".meta.json")).map((f) => f.replace(/\.meta\.json$/, "")) as string[]).find((x) => x !== idA)!;
    await drive(engineUrl, { method: "POST", path: `/chats/${idZ}/send`, body: { text: "a scone please", model: "mock/model" } }, m2);
    const msgZ = (m2.requests[0]!.req as { messages: { content: string }[] }).messages;
    expect(msgZ.some((x) => x.content.includes("scone"))).toBe(true);
    expect(msgZ.some((x) => x.content.includes("muffin"))).toBe(false);
  }, 30_000);

  it("extended samplers ride the engine preset into the generation params", async () => {
    fs.writeFileSync(path.join(root, "presets", "sweep.json"), JSON.stringify({
      id: "sweep", name: "Sweep", temperature: 0.7,
      dry_multiplier: 0.8, xtc_probability: 0.5, xtc_threshold: 0.1, typical_p: 0.9,
      temperature_last: true, negative_prompt: "avoid this",
      prompts: [{ identifier: "main", name: "Main", role: "system", marker: true, content: "x" }],
      prompt_order: [{ character_id: 100000, order: [{ identifier: "main", enabled: true }] }],
    }));
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "sweep" } }, m);
    const id = (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi", model: "mock/model" } }, m);
    const params = (m.requests[0]!.req as { presetParams?: { params?: Record<string, unknown> } }).presetParams?.params ?? {};
    expect(params.dry_multiplier).toBe(0.8);
    expect(params.xtc_probability).toBe(0.5);
    expect(params.typical_p).toBe(0.9);
    expect(params.temperature_last).toBe(true);
    expect(params.negative_prompt).toBe("avoid this");
  }, 30_000);

  it("v3 cards: fields survive import; charx assets resolve avatar + emotions", async () => {
    const m = mockHost();
    const r = await drive(stUrl, {
      method: "POST", path: "/import/batch",
      body: {
        cards: [{
          spec: "chara_card_v3",
          data: {
            name: "Vee Three",
            description: "spec three bot",
            nickname: "Vee",
            group_only_greetings: ["(group) Vee waves."],
            assets: [
              { type: "icon", name: "main", uri: "data:image/png;base64,aVQ=" },
              { type: "emotion", name: "smug", uri: "data:image/png;base64,aVQ=" },
            ],
            source: ["https://example.com/card"],
          },
        }],
      },
    }, m);
    expect(r.json.characters).toHaveLength(1);
    const card = JSON.parse(fs.readFileSync(path.join(root, "characters", `${(r.json.characters as string[])[0]}`, "card.json"), "utf8"));
    expect(card.spec).toBe("chara_card_v3");
    expect(card.nickname).toBe("Vee");
    expect(card.group_only_greetings).toEqual(["(group) Vee waves."]);
    expect(card.source).toEqual(["https://example.com/card"]);
    // inline data: assets resolve — icon/main becomes the avatar, emotion becomes a sprite
    expect(card.avatar).toBe("data:image/png;base64,aVQ=");
    expect(card.studio.expressions).toEqual([{ name: "smug", url: "data:image/png;base64,aVQ=" }]);
  }, 30_000);

  it("charx package: card.json + __asset: bytes resolve the avatar and sprites", async () => {
    const entries: Record<string, unknown> = {
      "card.json": JSON.stringify({
        spec: "chara_card_v3",
        data: {
          name: "Packaged",
          description: "from a package",
          assets: [
            { type: "icon", name: "main", uri: "__asset:assets/avatar.png", ext: "png" },
            { type: "emotion", name: "joy", uri: "__asset:assets/joy.png", ext: "png" },
          ],
        },
      }),
      "assets/avatar.png": { __b64: true, base64: "QUFB" },
      "assets/joy.png": { __b64: true, base64: "QkND" },
    };
    const m = mockHost();
    (m.host as { zip: unknown }).zip = { entries: () => entries, list: () => 3 };
    const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m);
    expect(r.json.characters).toHaveLength(1);
    const card = JSON.parse(fs.readFileSync(path.join(root, "characters", `${(r.json.characters as string[])[0]}`, "card.json"), "utf8"));
    expect(card.name).toBe("Packaged");
    expect(card.avatar).toBe("data:image/png;base64,QUFB");
    expect(card.studio.expressions).toEqual([{ name: "joy", url: "data:image/png;base64,QkND" }]);
    // the assets list rides the card verbatim (spec: never destroy)
    expect(Array.isArray(card.assets)).toBe(true);
  }, 30_000);
});

describe("rp studio: backup import stays inside its collections", () => {
  it("an entry id cannot move the write outside the collection its entry names", async () => {
    fs.mkdirSync(path.join(root, "tools"), { recursive: true });
    // zip-slip is caught on entry names by the engine; this rides an entry
    // the importer accepts and hides the traversal in the id it writes into
    // the path
    const entries = { "groups/innocent.json": JSON.stringify({ id: "../tools/pwned", name: "normal group", memberIds: [] }) };
    const m = mockHost();
    (m.host as { zip: unknown }).zip = { entries: () => entries, list: () => 1 };
    const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m);
    expect(fs.existsSync(path.join(root, "tools", "pwned.json")), `wrote outside groups/: ${JSON.stringify(r.json)}`).toBe(false);
    expect(fs.existsSync(path.join(root, "groups", "tools-pwned.json"))).toBe(true);
  }, 30_000);
});

describe("rp studio: export → import zip round-trip", () => {
  it("the exported backup re-imports through /import/zip (text entries)", async () => {
    const m = mockHost();
    // fresh root with one char + chat
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const exp = await drive(engineUrl, { method: "GET", path: "/export/backup" }, m);
    const files = unzipSync(Buffer.from(exp.json.base64 as string, "base64")) as Record<string, Uint8Array>;
    const entries: Record<string, string> = {};
    for (const [name, data] of Object.entries(files)) {
      if (!name.endsWith(".png")) entries[name] = new TextDecoder().decode(data); // kernel zip service: text only
    }
    const m2 = mockHost();
    (m2.host as { zip: unknown }).zip = { entries: () => entries, list: () => Object.keys(entries).length };
    const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m2);
    expect(r.json.characters).toHaveLength(1);
    expect(r.json.personas).toHaveLength(1);
    expect(r.json.chats).toHaveLength(1);
    expect(r.json.errors).toHaveLength(0);
  }, 30_000);
});

describe("rp studio: outside preset/book formats", () => {
  it("assembly follows the order list under character id 100001, not the first list", async () => {
    // two order lists in one file: 100000 is the stock layout, 100001 is the
    // author's arrangement (the reserved chat-completion id)
    fs.writeFileSync(path.join(root, "presets", "dual.json"), JSON.stringify({
      id: "dual", name: "Dual Order",
      prompts: [
        { identifier: "main", name: "Main", role: "system", marker: true, content: "Main text." },
        { identifier: "worldInfoBefore", name: "WI Before", role: "system", marker: true },
        { identifier: "charDescription", name: "Char", role: "system", marker: true },
        { identifier: "chatHistory", name: "History", role: "system", marker: true },
        { identifier: "author-note", name: "Author Only", role: "system", content: "AUTHOR-ARRANGEMENT-MARK" },
      ],
      prompt_order: [
        { character_id: 100000, order: [
          { identifier: "main", enabled: true }, { identifier: "worldInfoBefore", enabled: true },
          { identifier: "charDescription", enabled: true }, { identifier: "chatHistory", enabled: true },
        ] },
        { character_id: 100001, order: [
          { identifier: "main", enabled: true }, { identifier: "author-note", enabled: true },
          { identifier: "charDescription", enabled: true }, { identifier: "chatHistory", enabled: true },
        ] },
      ],
    }));
    const m = mockHost();
    const chat = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", presetId: "dual" } }, m);
    const id = (chat.json.meta as { id: string }).id;
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    const sys = (peek.json.messages as { content: string }[]).map((x) => x.content).join("\n");
    expect(sys).toContain("AUTHOR-ARRANGEMENT-MARK");
  }, 30_000);

  it("a card's embedded lorebook imports as a linked, scoped book", async () => {
    const m = mockHost();
    const r = await drive(stUrl, {
      method: "POST", path: "/import/batch",
      body: {
        cards: [{
          spec: "chara_card_v2",
          name: "Bookkeeper",
          description: "keeps books",
          character_book: {
            name: "Bookkeeper Lore",
            scan_depth: 6,
            entries: [
              { keys: ["vault"], content: "The vault under the shop.", enabled: true, insertion_order: 5, position: "before_char", selective: true, secondary_keys: ["bank"] },
              { keys: ["ledger"], content: "The ledger lists debts.", enabled: true, insertion_order: 3, constant: true, extensions: { position: 4, depth: 2, role: 1, probability: 60, useProbability: true, sticky: 3 } },
            ],
          },
        }],
      },
    }, m);
    expect(r.json.characters).toHaveLength(1);
    expect(r.json.lorebooks).toHaveLength(1);
    const bookId = (r.json.lorebooks as string[])[0]!;
    const book = JSON.parse(fs.readFileSync(path.join(root, "lorebooks", `${bookId}.json`), "utf8"));
    expect(book.name).toBe("Bookkeeper Lore");
    expect(book.isEmbedded).toBe(true);
    expect(book.settings.scanDepth).toBe(6);
    expect(book.entries).toHaveLength(2);
    const first = book.entries[0];
    expect(first.keys).toEqual(["vault"]);
    expect(first.secondaryKeys).toEqual(["bank"]);
    expect(first.order).toBe(5);
    expect(first.position).toBe("before_char");
    const second = book.entries[1];
    expect(second.constant).toBe(true);
    expect(second.position).toBe("at_depth");
    expect(second.depth).toBe(2);
    expect(second.role).toBe("user");
    expect(second.probability).toBe(60);
    expect(second.sticky).toBe(3);
    // the card links the book: it enters scope for that character's chats
    const card = JSON.parse(fs.readFileSync(path.join(root, "characters", `${(r.json.characters as string[])[0]}`, "card.json"), "utf8"));
    expect(card.studio.embeddedLorebookId).toBe(bookId);
  }, 30_000);

  it("backup-zip presets keep their map-key names", async () => {
    const entries: Record<string, string> = {
      "User Settings/openai_settings.json": JSON.stringify({
        "My Custom Mix": { temperature: 1.1, prompts: [{ identifier: "main", name: "Main", role: "system", content: "x" }] },
      }),
    };
    const m = mockHost();
    (m.host as { zip: unknown }).zip = { entries: () => entries, list: () => 1 };
    const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m);
    expect(r.json.presets).toHaveLength(1);
    const preset = JSON.parse(fs.readFileSync(path.join(root, "presets", `${(r.json.presets as string[])[0]}.json`), "utf8"));
    expect(preset.name).toBe("My Custom Mix");
    expect(preset.temperature).toBe(1.1);
  }, 30_000);

  it("a preset keeps its sections' generation types through backup and restore", async () => {
    const m = mockHost();
    const all = ["normal", "continue", "impersonate", "swipe", "regenerate", "quiet"];
    fs.writeFileSync(path.join(root, "presets", "mine.json"), JSON.stringify({
      id: "mine", name: "Mine", temperature: 0.95,
      prompts: [{ identifier: "cyoa", name: "Cyoa", role: "user", content: "End with choices." }],
      prompt_order: [{ character_id: 100001, order: [{ identifier: "cyoa", enabled: true }] }],
      studio: { isDefault: true, sections: [{ id: "cyoa", name: "Cyoa", injectionTriggers: all, groupId: "g1" }], samplers: { bannedTokens: ["x"] } },
    }));
    const zip = await drive(engineUrl, { method: "GET", path: "/export/backup" }, m);
    const files = unzipSync(Buffer.from(zip.json.base64 as string, "base64")) as Record<string, Uint8Array>;
    const entries = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, new TextDecoder().decode(v)]));
    fs.rmSync(path.join(root, "presets", "mine.json"));
    (m.host as { zip: unknown }).zip = { entries: () => entries, list: () => 1 };
    const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m);
    const id = (r.json.presets as string[]).find((x) => x.startsWith("mine"))!;
    const back = JSON.parse(fs.readFileSync(path.join(root, "presets", `${id}.json`), "utf8"));
    expect(back.name).toBe("Mine");
    expect(back.studio.sections[0].injectionTriggers).toEqual(all);
    expect(back.studio.sections[0].groupId).toBe("g1");
    expect(back.studio.samplers.bannedTokens).toEqual(["x"]);
    expect(back.studio.isDefault).toBeUndefined();
  }, 30_000);

  it("an update gives every generation type back to presets limited to normal everywhere", async () => {
    const m = mockHost();
    const sec = (id: string, injectionTriggers: string[]) => ({ id, name: id, injectionTriggers });
    fs.writeFileSync(path.join(root, "presets", "damaged.json"), JSON.stringify({
      id: "damaged", name: "Damaged", studio: { sections: [sec("main", ["normal"]), sec("cyoa", ["normal"]), sec("chatHistory", ["normal"])] },
    }));
    fs.writeFileSync(path.join(root, "presets", "chosen.json"), JSON.stringify({
      id: "chosen", name: "Chosen", studio: { sections: [sec("main", ["normal", "swipe"]), sec("note", ["normal"])] },
    }));
    const mod = await import(engineUrl);
    const out = mod.onAppUpdate({ from: "4.18.1", to: "4.18.2" }, m.host);
    expect(out.upgraded).toEqual(["presets/damaged.json generation types"]);
    const damaged = JSON.parse(fs.readFileSync(path.join(root, "presets", "damaged.json"), "utf8"));
    for (const s of damaged.studio.sections) expect(s.injectionTriggers).toContain("swipe");
    const chosen = JSON.parse(fs.readFileSync(path.join(root, "presets", "chosen.json"), "utf8"));
    expect(chosen.studio.sections[1].injectionTriggers).toEqual(["normal"]);
    expect(mod.onAppUpdate({ from: "4.18.2", to: "4.18.3" }, m.host).upgraded).toEqual([]);
  }, 30_000);

  it("a world file survives the export/import round trip intact", async () => {
    const m = mockHost();
    const source = {
      name: "Round Trip",
      entries: {
        0: {
          uid: 0, key: ["temple", "shrine"], keysecondary: ["priest"], comment: "Temple",
          content: "Incense-heavy halls.", selectiveLogic: 2, order: 20,
          sticky: 4, cooldown: 2, delay: 1, position: 4, depth: 3, role: 2,
          group: "places", groupWeight: 40, probability: 60, useProbability: true,
          excludeRecursion: true, preventRecursion: true, ignoreBudget: true,
          automationId: "temple-visit", matchCharacterDescription: true, matchScenario: true,
        },
        1: { uid: 1, key: ["ruin"], content: "Collapsed ages ago.", constant: true, vectorized: true },
      },
    };
    const imported = await drive(stUrl, { method: "POST", path: "/import/batch", body: { worldInfo: [source] } }, m);
    const bookId = (imported.json.lorebooks as string[])[0]!;

    // export the whole workspace, pull the world file back out of the zip
    const zip = await drive(engineUrl, { method: "GET", path: "/export/backup" }, m);
    const files = unzipSync(Buffer.from(zip.json.base64 as string, "base64")) as Record<string, Uint8Array>;
    const worldName = Object.keys(files).find((n) => n.startsWith("worlds/"));
    expect(worldName).toBeTruthy();
    const world = JSON.parse(new TextDecoder().decode(files[worldName!]!)) as Record<string, unknown>;

    // wipe the book, re-import what the export wrote
    fs.rmSync(path.join(root, "lorebooks", `${bookId}.json`));
    const back = await drive(stUrl, { method: "POST", path: "/import/batch", body: { worldInfo: [world] } }, m);
    const again = JSON.parse(fs.readFileSync(path.join(root, "lorebooks", `${(back.json.lorebooks as string[])[0]!}.json`), "utf8"));

    const temple = again.entries.find((e: { title: string }) => e.title === "Temple");
    expect(temple).toMatchObject({
      keys: ["temple", "shrine"], secondaryKeys: ["priest"], selectiveLogic: "NOT_ANY",
      order: 20, sticky: 4, cooldown: 2, delay: 1, position: "at_depth", depth: 3, role: "assistant",
      group: "places", groupWeight: 40, probability: 60,
      nonRecursable: true, preventFurtherRecursion: true, ignoreBudget: true,
      automationId: "temple-visit",
    });
    expect(temple.matchSources).toMatchObject({ description: true, scenario: true, personality: false, persona: false });
    const ruin = again.entries.find((e: { content: string }) => e.content === "Collapsed ages ago.");
    expect(ruin.status).toBe("vectorized");
  }, 30_000);

  it("world files keep sticky/cooldown/vectorized and at-depth entries", async () => {
    const m = mockHost();
    const r = await drive(stUrl, {
      method: "POST", path: "/import/batch",
      body: {
        worldInfo: [{
          name: "Outside World",
          entries: {
            0: { uid: 0, key: ["temple"], keysecondary: ["priest"], comment: "Temple", content: " incense-heavy halls", selectiveLogic: 2, order: 20, sticky: 4, cooldown: 2 },
            1: { uid: 1, key: ["echo"], content: "The echoes answer.", position: 4, depth: 1, role: 2, vectorized: true },
            2: { uid: 2, key: ["ruin"], content: "Collapsed ages ago.", constant: true, ignoreBudget: true, delayUntilRecursion: true },
          },
        }],
      },
    }, m);
    const bookId = (r.json.lorebooks as string[])[0]!;
    const book = JSON.parse(fs.readFileSync(path.join(root, "lorebooks", `${bookId}.json`), "utf8"));
    expect(book.entries).toHaveLength(3);
    const [temple, echo, ruin] = book.entries;
    expect(temple.title).toBe("Temple");
    expect(temple.secondaryKeys).toEqual(["priest"]);
    expect(temple.selectiveLogic).toBe("NOT_ANY");
    expect(temple.sticky).toBe(4);
    expect(temple.cooldown).toBe(2);
    expect(echo.position).toBe("at_depth");
    expect(echo.role).toBe("assistant");
    expect(echo.status).toBe("vectorized");
    expect(ruin.constant).toBe(true);
    expect(ruin.ignoreBudget).toBe(true);
    expect(ruin.delayUntilRecursion).toBe(true);
  }, 30_000);
});

describe("rp studio engine: pictures, personas, card regex", () => {
  const chatIdOf = () => (fs.readdirSync(path.join(root, "chats")).find((f) => f.endsWith(".meta.json")) as string).replace(/\.meta\.json$/, "");

  it("image-prompt asks the chat model to describe the scene and writes nothing", async () => {
    const m = mockHost({ text: "Prompt: \"A barista behind a counter at night.\"" });
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf();
    const before = fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8");
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/image-prompt`, body: { mode: "character" } }, m);
    expect(r.json.prompt).toBe("A barista behind a counter at night.");
    const asked = (m.requests.at(-1)!.req as { messages: { content: string }[] }).messages[0]!.content;
    expect(asked).toContain("Describe Aria as they look right now");
    expect(asked).toContain("A barista."); // the card rides along
    expect(fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8")).toBe(before);
  }, 30_000);

  it("a posted picture stays out of the prompt, and swipes skip past it", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf();
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello" } }, m);
    const pic = await drive(engineUrl, { method: "POST", path: `/chats/${id}/messages`, body: { text: "", hidden: true, picture: true, attachments: [{ id: "a", name: "SECRET-PROMPT", type: "image/png", url: "/v1/assets/x" }] } }, m);
    expect(pic.status).toBe(201);
    const sw = await drive(engineUrl, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: 1 } }, m);
    expect((sw.json.message as { picture?: boolean }).picture).toBeUndefined(); // the reply got the swipe
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "again" } }, m);
    const sent = JSON.stringify(m.requests.at(-1)!.req);
    expect(sent).not.toContain("SECRET-PROMPT");
  }, 30_000);

  it("editing a persona mid-chat changes {{user}} from then on; past turns keep who sent them", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf();
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "first" } }, m);
    fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "Renamed", description: "now tall" }));
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "second {{user}}" } }, m);
    const msgs = (await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m)).json.messages as { role: string; name: string; personaId?: string }[];
    const users = msgs.filter((x) => x.role === "user");
    expect(users.map((u) => u.name)).toEqual(["You", "Renamed"]);
    expect(users.every((u) => u.personaId === "you")).toBe(true);
    const req = JSON.stringify(m.requests.at(-1)!.req);
    expect(req).toContain("second Renamed");
    expect(req).toContain("now tall");
  }, 30_000);

  it("a new chat pins the persona in use, so changing the default later leaves it alone", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = chatIdOf();
    expect((await drive(engineUrl, { method: "GET", path: `/chats/${id}` }, m)).json.meta).toMatchObject({ personaId: "you" });
    fs.writeFileSync(path.join(root, "personas", "other.json"), JSON.stringify({ id: "other", name: "Other" }));
    await drive(engineUrl, { method: "PUT", path: "/settings", body: { personaId: "other" } }, m);
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi {{user}}" } }, m);
    expect(JSON.stringify(m.requests.at(-1)!.req)).toContain("hi You");
  }, 30_000);

  it("regex scripts inside an imported card become that character's scripts", async () => {
    const m = mockHost();
    const r = await drive(stUrl, { method: "POST", path: "/import/batch", body: { cards: [{
      spec: "chara_card_v2", data: { name: "Rex", description: "d", first_mes: "hi", extensions: { regex_scripts: [
        { scriptName: "Hide HTML", findRegex: "/<div>.*?<\\/div>/gs", replaceString: "", placement: [2], markdownOnly: true },
      ] } },
    }] } }, m);
    expect(r.json.regex).toHaveLength(1);
    const charId = (r.json.characters as string[])[0];
    const script = JSON.parse(fs.readFileSync(path.join(root, "regex", `${(r.json.regex as string[])[0]}.json`), "utf8")) as Record<string, unknown>;
    expect(script).toMatchObject({ scope: "character", scopeTargetId: charId, placement: ["ai_output"], markdownOnly: true, promptOnly: false, flags: "gs" });
  }, 30_000);
});


// ── the bugs that made a move to a second device lossy ──────────────────────

describe("rp studio: a chat with no persona to resolve", () => {
  // chatPersona used to fall back through chatUserName, which is chatPersona's
  // own accessor: every chat that could not resolve a persona recursed until
  // the sandbox stack gave out. A restored backup is exactly that state —
  // fresh persona ids, nothing marked default in settings.json.
  const strand = () => {
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null }));
    fs.rmSync(path.join(root, "personas", "you.json"));
  };

  it("generates instead of blowing the stack", async () => {
    strand();
    const m = mockHost();
    const c = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (c.json.meta as { id: string }).id;
    const r = await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello", model: "mock/model" } }, m);
    expect(r.status).toBe(200);
    expect((r.json.reply as { text: string }).text).toBe("MOCK-REPLY");
  }, 30_000);

  it("peeks the prompt instead of blowing the stack", async () => {
    strand();
    const m = mockHost();
    const c = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (c.json.meta as { id: string }).id;
    const r = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect(r.status).toBe(200);
    expect(r.json.presetName).toBe("Default");
  }, 30_000);

  it("falls back to the name the chat stored, then to User", async () => {
    strand();
    // a prompt that says {{user}}, so the assembled text shows who we are
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({
      id: "default", name: "Default",
      prompts: [{ identifier: "main", name: "Main", role: "system", content: "Speaking with {{user}}." }],
      prompt_order: [{ character_id: 100000, order: [{ identifier: "main", enabled: true }] }],
    }));
    const m = mockHost();
    const c = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (c.json.meta as { id: string }).id;
    const bare = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect(JSON.stringify(bare.json.messages) + String(bare.json.systemPrompt)).toContain("Speaking with User.");

    const metaPath = path.join(root, "chats", `${id}.meta.json`);
    fs.writeFileSync(metaPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(metaPath, "utf8")), userName: "Robin" }));
    const r = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect(JSON.stringify(r.json.messages) + String(r.json.systemPrompt)).toContain("Speaking with Robin.");
  }, 30_000);
});

describe("rp studio: backup zips survive the trip", () => {
  const exportEntries = async (m: ReturnType<typeof mockHost>) => {
    const exp = await drive(engineUrl, { method: "GET", path: "/export/backup" }, m);
    const files = unzipSync(Buffer.from(exp.json.base64 as string, "base64")) as Record<string, Uint8Array>;
    const entries: Record<string, string> = {};
    for (const [name, data] of Object.entries(files)) entries[name] = new TextDecoder().decode(data);
    return entries;
  };

  it("writes UTF-8, not latin1 with every other character punched out", async () => {
    // curly quotes, an em dash, an accent and an emoji — ordinary prose
    const prose = "“Café” — naïve 🦋 日本語";
    fs.writeFileSync(
      path.join(root, "characters", "aria", "card.json"),
      JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: prose, personality: "", scenario: "", first_mes: "hi", mes_example: "" }),
    );
    const entries = await exportEntries(mockHost());
    const card = JSON.parse(entries["characters/aria.json"]!) as { description: string };
    expect(card.description).toBe(prose);
    expect(card.description).not.toContain("?");
  }, 30_000);

  it("carries the chat's preset, persona, model and notes, not just its lines", async () => {
    const m = mockHost();
    fs.writeFileSync(path.join(root, "presets", "mine.json"), JSON.stringify({ id: "mine", name: "My Preset", prompts: [], prompt_order: [], temperature: 0.4 }));
    fs.writeFileSync(path.join(root, "personas", "robin.json"), JSON.stringify({ id: "robin", name: "Robin", description: "a detective", title: "PI", pronouns: "they/them", avatar: "data:image/png;base64,AAA", isDefault: true }));
    const c = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (c.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi", model: "mock/model" } }, m);
    await drive(engineUrl, {
      method: "PATCH", path: `/chats/${id}`,
      body: { presetId: "mine", personaId: "robin", title: "Crossroads at Dusk", chatTags: ["noir"] },
    }, m);

    const entries = await exportEntries(m);
    const m2 = mockHost();
    (m2.host as { zip: unknown }).zip = { entries: () => entries, list: () => Object.keys(entries).length };
    const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m2);
    expect(r.json.errors).toEqual([]);

    const chatId = (r.json.chats as string[])[0]!;
    const meta = JSON.parse(fs.readFileSync(path.join(root, "chats", `${chatId}.meta.json`), "utf8")) as Record<string, unknown>;
    // the title is the real one, not the filename slug title-cased back
    expect(meta.title).toBe("Crossroads at Dusk");
    expect(meta.chatTags).toEqual(["noir"]);
    // and it still rides the preset and persona it was pinned to
    const preset = JSON.parse(fs.readFileSync(path.join(root, "presets", `${meta.presetId}.json`), "utf8")) as { name: string };
    expect(preset.name).toBe("My Preset");
    const persona = JSON.parse(fs.readFileSync(path.join(root, "personas", `${meta.personaId}.json`), "utf8")) as Record<string, unknown>;
    expect(persona.name).toBe("Robin");
    // …with the persona whole, not just its name and description
    expect(persona.title).toBe("PI");
    expect(persona.pronouns).toBe("they/them");
    expect(persona.avatar).toBe("data:image/png;base64,AAA");
    expect(persona.isDefault).toBe(true);
  }, 30_000);

  it("keeps hidden turns, bookmarks and the model stamp on each message", async () => {
    const m = mockHost();
    const c = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria" } }, m);
    const id = (c.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi", model: "mock/model" } }, m);
    const lines = fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    lines[0]!.hidden = true;
    lines[0]!.bookmark = "opening";
    fs.writeFileSync(path.join(root, "chats", `${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");

    const entries = await exportEntries(m);
    const m2 = mockHost();
    (m2.host as { zip: unknown }).zip = { entries: () => entries, list: () => Object.keys(entries).length };
    const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m2);
    const chatId = (r.json.chats as string[])[0]!;
    const back = fs.readFileSync(path.join(root, "chats", `${chatId}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(back[0]!.hidden).toBe(true);
    expect(back[0]!.bookmark).toBe("opening");
    // the reply keeps which model wrote it
    const reply = back.find((x) => x.role === "char" && (x.extra as { model?: string } | undefined)?.model);
    expect((reply!.extra as { model: string }).model).toBe("mock/model");
  }, 30_000);

  it("brings app settings and the local collections back", async () => {
    const m = mockHost();
    await drive(engineUrl, { method: "PUT", path: "/settings", body: { ui: { theme: "midnight", proseFont: "noto" } } }, m);
    await drive(engineUrl, { method: "PUT", path: "/library", body: { themes: [{ id: "t1", name: "Midnight" }], tags: ["noir"] } }, m);
    const entries = await exportEntries(m);
    // wipe what we are about to restore, so the assertions can only pass if
    // the zip actually carried it
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
    fs.rmSync(path.join(root, "library.json"), { force: true });
    const m2 = mockHost();
    (m2.host as { zip: unknown }).zip = { entries: () => entries, list: () => Object.keys(entries).length };
    await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m2);
    const settings = JSON.parse(fs.readFileSync(path.join(root, "settings.json"), "utf8")) as { ui: { theme: string } };
    expect(settings.ui.theme).toBe("midnight");
    const lib = JSON.parse(fs.readFileSync(path.join(root, "library.json"), "utf8")) as { tags: string[] };
    expect(lib.tags).toEqual(["noir"]);
  }, 30_000);

  it("keeps a lorebook's own settings and its link to a card", async () => {
    const m = mockHost();
    fs.writeFileSync(path.join(root, "lorebooks", "b1.json"), JSON.stringify({
      id: "b1", name: "City Lore", globalActive: true, linkedCharacterIds: ["aria"],
      settings: { scanDepth: 9, contextPercent: 40, recursiveScan: false },
      entries: [{ uid: 0, title: "Docks", memo: "Docks", keys: ["docks"], content: "Cold water.", enabled: true, order: 100, position: "after_char" }],
    }));
    const entries = await exportEntries(m);
    const m2 = mockHost();
    (m2.host as { zip: unknown }).zip = { entries: () => entries, list: () => Object.keys(entries).length };
    const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m2);
    const bookId = (r.json.lorebooks as string[])[0]!;
    const book = JSON.parse(fs.readFileSync(path.join(root, "lorebooks", `${bookId}.json`), "utf8")) as Record<string, unknown>;
    expect(book.globalActive).toBe(true);
    expect((book.settings as { scanDepth: number }).scanDepth).toBe(9);
    // linked by NAME across the trip: it lands on whichever id this workspace
    // minted for Aria, not the id the other machine used
    const linked = (book.linkedCharacterIds as string[])[0]!;
    expect(JSON.parse(fs.readFileSync(path.join(root, "characters", linked, "card.json"), "utf8")).name).toBe("Aria");
  }, 30_000);
});

describe("rp studio: foreign backup layouts", () => {
  const card = {
    spec: "chara_card_v2",
    data: { name: "Nadia", description: "A locksmith.", personality: "wry", scenario: "", first_mes: "Hey.", mes_example: "" },
  };

  // The three ways people actually hand us one of these zips. Only the first
  // was ever recognised, and only at one exact nesting depth.
  for (const [label, prefix] of [
    ["the tool's own backup", "default-user/"],
    ["the data folder", "data/default-user/"],
    ["the whole install directory", "MyTool-1.13.4/data/default-user/"],
    ["just the folders they wanted", ""],
  ] as const) {
    it(`imports ${label}`, async () => {
      const entries: Record<string, unknown> = {
        [`${prefix}characters/nadia.json`]: JSON.stringify(card),
        [`${prefix}worlds/City.json`]: JSON.stringify({ name: "City", entries: { 0: { uid: 0, key: ["docks"], content: "Cold water.", comment: "Docks" } } }),
        [`${prefix}OpenAI Settings/Night Shift.json`]: JSON.stringify({ temperature: 0.7, openai_max_tokens: 900, prompts: [], prompt_order: [] }),
        [`${prefix}settings.json`]: JSON.stringify({
          personas: { "robin.png": "Robin" },
          persona_descriptions: { "robin.png": { description: "a detective" } },
        }),
      };
      const m = mockHost();
      (m.host as { zip: unknown }).zip = { entries: () => entries, list: () => Object.keys(entries).length };
      const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m);
      expect(r.json.characters).toHaveLength(1);
      expect(r.json.lorebooks).toHaveLength(1);
      expect(r.json.presets).toHaveLength(1);
      expect(r.json.personas).toHaveLength(1);
      const preset = JSON.parse(fs.readFileSync(path.join(root, "presets", `${(r.json.presets as string[])[0]}.json`), "utf8")) as { name: string };
      expect(preset.name).toBe("Night Shift");
      const persona = JSON.parse(fs.readFileSync(path.join(root, "personas", `${(r.json.personas as string[])[0]}.json`), "utf8")) as { name: string; description: string };
      expect(persona.name).toBe("Robin");
      expect(persona.description).toBe("a detective");
    }, 30_000);
  }

  it("imports PNG cards out of a backup zip", async () => {
    // a minimal PNG with a tEXt "chara" chunk — the shape a card file has
    const payload = Buffer.from(JSON.stringify(card)).toString("base64");
    const chunk = (type: string, body: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(body.length);
      const crc = Buffer.alloc(4); // the reader never checks it
      return Buffer.concat([len, Buffer.from(type, "latin1"), body, crc]);
    };
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("tEXt", Buffer.concat([Buffer.from("chara", "latin1"), Buffer.from([0]), Buffer.from(payload, "latin1")])),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    // the kernel's zip service tags a binary entry __b64__; the importer read
    // __b64, so every PNG card in every backup was reported as unreadable
    const entries: Record<string, unknown> = {
      "data/default-user/characters/Nadia.png": { __b64__: true, base64: png.toString("base64"), size: png.length },
    };
    const m = mockHost();
    (m.host as { zip: unknown }).zip = { entries: () => entries, list: () => 1 };
    const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m);
    expect(r.json.errors).toEqual([]);
    expect(r.json.characters).toHaveLength(1);
    const written = JSON.parse(fs.readFileSync(path.join(root, "characters", (r.json.characters as string[])[0]!, "card.json"), "utf8")) as { name: string };
    expect(written.name).toBe("Nadia");
  }, 30_000);
});

describe("rp studio: personas stay where you put them", () => {
  const seedPersonas = () => {
    fs.writeFileSync(path.join(root, "personas", "robin.json"), JSON.stringify({ id: "robin", name: "Robin", description: "a detective" }));
    fs.writeFileSync(path.join(root, "personas", "sam.json"), JSON.stringify({ id: "sam", name: "Sam", description: "a courier" }));
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({
      id: "default", name: "Default",
      prompts: [{ identifier: "main", name: "Main", role: "system", content: "Speaking with {{user}}." }],
      prompt_order: [{ character_id: 100000, order: [{ identifier: "main", enabled: true }] }],
    }));
  };
  const spoken = (r: { json: Record<string, unknown> }) =>
    JSON.stringify(r.json.messages) + String(r.json.systemPrompt);

  it("switches mid-chat without rewriting the turns already sent", async () => {
    seedPersonas();
    const m = mockHost();
    const c = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", personaId: "robin" } }, m);
    const id = (c.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi", model: "mock/model" } }, m);

    const patched = await drive(engineUrl, { method: "PATCH", path: `/chats/${id}`, body: { personaId: "sam" } }, m);
    expect((patched.json as { personaId: string }).personaId).toBe("sam");
    // new turns speak as Sam…
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect(spoken(peek)).toContain("Speaking with Sam.");
    // …and the turn already sent keeps the name it was sent under
    const lines = fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l) as { role: string; name: string });
    expect(lines.find((l) => l.role === "user")!.name).toBe("Robin");
  }, 30_000);

  it("leaves the other chats alone", async () => {
    seedPersonas();
    const m = mockHost();
    const a = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", personaId: "robin" } }, m);
    const b = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", personaId: "robin" } }, m);
    const aId = (a.json.meta as { id: string }).id;
    const bId = (b.json.meta as { id: string }).id;
    await drive(engineUrl, { method: "PATCH", path: `/chats/${aId}`, body: { personaId: "sam" } }, m);
    const other = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: bId } }, m);
    expect(spoken(other)).toContain("Speaking with Robin.");
  }, 30_000);

  it("a chat that pinned a persona ignores a change of the default", async () => {
    seedPersonas();
    const m = mockHost();
    const c = await drive(engineUrl, { method: "POST", path: "/chats", body: { characterId: "aria", personaId: "robin" } }, m);
    const id = (c.json.meta as { id: string }).id;
    // the app-wide default moves; the pinned chat must not follow
    await drive(engineUrl, { method: "PUT", path: "/settings", body: { personaId: "sam" } }, m);
    const peek = await drive(engineUrl, { method: "POST", path: "/prompt/preview", body: { chatId: id } }, m);
    expect(spoken(peek)).toContain("Speaking with Robin.");
  }, 30_000);
});

describe("rp studio: backups from older versions still import", () => {
  // The shape a pre-4.17.1 export produced: no chat meta sidecar, no memories,
  // no full persona records, a three-field settings stamp and no library.
  // Everything the newer importer reads is optional, so an old backup must
  // still land — nobody should have to re-export before restoring.
  it("imports a v1 backup with no sidecars", async () => {
    const entries: Record<string, string> = {
      "characters/nadia.json": JSON.stringify({ spec: "chara_card_v2", name: "Nadia", description: "A locksmith.", personality: "", scenario: "", first_mes: "Hey.", mes_example: "" }),
      "User Settings/personas.json": JSON.stringify({ Robin: "a detective" }),
      "User Settings/openai_settings.json": JSON.stringify({ "Night Shift": { temperature: 0.7, prompts: [], prompt_order: [] } }),
      "worlds/city.json": JSON.stringify({ name: "City", entries: { 0: { uid: 0, key: ["docks"], content: "Cold water.", comment: "Docks" } } }),
      "chats/nadia/a-quiet-word-cabc123.jsonl": [
        JSON.stringify({ name: "Nadia", is_user: false, is_system: false, send_date: new Date(0).toISOString(), mes: "Hey.", swipes: ["Hey."], swipe_id: 0, extra: {} }),
        JSON.stringify({ name: "Robin", is_user: true, is_system: false, send_date: new Date(0).toISOString(), mes: "Evening.", swipes: ["Evening."], swipe_id: 0, extra: {} }),
      ].join("\n") + "\n",
      "settings.json": JSON.stringify({ app: "studio", exportedAt: "2026-01-01T00:00:00.000Z", version: 1 }),
    };
    const m = mockHost();
    (m.host as { zip: unknown }).zip = { entries: () => entries, list: () => Object.keys(entries).length };
    const r = await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m);
    expect(r.json.errors).toEqual([]);
    expect(r.json.characters).toHaveLength(1);
    expect(r.json.personas).toHaveLength(1);
    expect(r.json.presets).toHaveLength(1);
    expect(r.json.lorebooks).toHaveLength(1);
    expect(r.json.chats).toHaveLength(1);
    // no sidecar: the chat falls back to the old behaviour (default preset,
    // title recovered from the filename) rather than failing
    const chatId = (r.json.chats as string[])[0]!;
    const meta = JSON.parse(fs.readFileSync(path.join(root, "chats", `${chatId}.meta.json`), "utf8")) as Record<string, unknown>;
    expect(meta.presetId).toBe("default");
    expect(String(meta.title)).toContain("A Quiet Word");
    // a v1 settings stamp carries no `settings` key — it must not wipe ours
    const settings = JSON.parse(fs.readFileSync(path.join(root, "settings.json"), "utf8")) as { personaId: string };
    expect(settings.personaId).toBe("you");
  }, 30_000);

  it("leaves an existing library alone when the backup has none", async () => {
    fs.writeFileSync(path.join(root, "library.json"), JSON.stringify({ tags: ["keep-me"] }));
    const entries: Record<string, string> = {
      "characters/nadia.json": JSON.stringify({ spec: "chara_card_v2", name: "Nadia", description: "x", personality: "", scenario: "", first_mes: "hi", mes_example: "" }),
      "settings.json": JSON.stringify({ app: "studio", version: 1 }),
    };
    const m = mockHost();
    (m.host as { zip: unknown }).zip = { entries: () => entries, list: () => Object.keys(entries).length };
    await drive(stUrl, { method: "POST", path: "/import/zip", body: { zipBase64: "x" } }, m);
    const lib = JSON.parse(fs.readFileSync(path.join(root, "library.json"), "utf8")) as { tags: string[] };
    expect(lib.tags).toEqual(["keep-me"]);
  }, 30_000);
});
