/**
 * "What fired" log (#253): `assemble` keeps `fired-log/<chatId>.json` for a real reply only. The last reply's rows (with the
 * book ids), counters per lorebook entry and Data Bank passage, a swipe that replaces instead of adding, no write for a
 * preview, a brief answer for the chat header, and a sweep of the logs of chats that are gone.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "fired-log-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], temperature: 0.8, top_p: 0.95, openai_max_tokens: 512, openai_max_context: 8192 }));
  fs.mkdirSync(path.join(root, "characters", "aria"), { recursive: true });
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista.", personality: "dry", scenario: "night", first_mes: "Welcome in, {{user}}.", mes_example: "" }));
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
  fs.writeFileSync(
    path.join(root, "lorebooks", "town.json"),
    JSON.stringify({
      id: "town", name: "Town", globalActive: false, linkedCharacterIds: [], settings: {},
      entries: [
        { uid: 0, title: "Rules", keys: [], content: "Always true.", constant: true, enabled: true, order: 100, position: "before_char" },
        { uid: 1, title: "Tower", keys: ["tower"], content: "An old tower.", enabled: true, order: 100, position: "before_char" },
        { uid: 2, title: "Ghost", keys: ["ghost"], secondaryKeys: ["night"], selectiveLogic: "AND_ANY", content: "A ghost.", enabled: true, order: 100, position: "before_char" },
      ],
    }),
  );
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

function mockHost() {
  const results: Record<string, unknown> = {};
  const requests: { key: string }[] = [];
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
    llm: { request: (key: string) => { requests.push({ key }); }, results, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
    log: () => {},
  };
  const resolve = () => { for (const { key } of requests) results[key] = { text: "MOCK-REPLY", model: "mock/model", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costTotal: 0 } }; };
  return { host, resolve };
}

async function drive(req: { method: string; path: string; body?: unknown }, mock: ReturnType<typeof mockHost>): Promise<{ status: number; json: Record<string, unknown> }> {
  const mod = (await import(engineUrl)) as { handleRoute: Function };
  for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as Record<string, unknown>)[k];
  const qIdx = req.path.indexOf("?");
  const query: Record<string, string> = {};
  if (qIdx >= 0) for (const [k, v] of new URLSearchParams(req.path.slice(qIdx + 1))) query[k] = v;
  const call = { method: req.method, path: qIdx >= 0 ? req.path.slice(0, qIdx) : req.path, query, body: req.body };
  let out = mod.handleRoute(call, mock.host) as { status?: number; json?: Record<string, unknown>; __llmPending?: boolean; stash?: Record<string, unknown> };
  for (let pass = 0; out && out.__llmPending && pass < 3; pass++) {
    if (out.stash && typeof out.stash === "object") (call as { stash?: unknown }).stash = out.stash;
    mock.resolve();
    out = mod.handleRoute(call, mock.host) as typeof out;
  }
  return { status: out?.status ?? 200, json: (out?.json ?? {}) as Record<string, unknown> };
}

type Entry = { n: number; at: number; t: string; b: string; v: Record<string, number> };
type Log = { v: number; replies: number; lore: Record<string, Entry>; bank: Record<string, { n: number }>; last: { gen: string; by: string; reply: number; fired: { title: string; bookId: string; via: string }[]; blocked: { title: string; reason: string }[]; keys: { lore: unknown[] } } };

const newChat = async (m: ReturnType<typeof mockHost>) => {
  const id = ((await drive({ method: "POST", path: "/chats", body: { characterId: "aria" } }, m)).json.meta as { id: string }).id;
  await drive({ method: "PATCH", path: `/chats/${id}`, body: { lorebookIds: ["town"] } }, m);
  return id;
};
const send = (m: ReturnType<typeof mockHost>, id: string, text: string) => drive({ method: "POST", path: `/chats/${id}/send`, body: { text, model: "mock/model" } }, m);
const logOf = async (m: ReturnType<typeof mockHost>, id: string) => ((await drive({ method: "GET", path: `/fired-log?chatId=${id}` }, m)).json as { log: Log | null }).log;

describe("what fired: the per-chat log", () => {
  it("has no log before the first reply, then keeps the rows of the last reply and counts entries (not the always-on ones)", async () => {
    const m = mockHost();
    const id = await newChat(m);
    expect(await logOf(m, id)).toBeNull();
    await send(m, id, "We climbed the tower, the ghost came at night.");
    const log = (await logOf(m, id))!;
    expect(log.v).toBe(1);
    expect(log.replies).toBe(1);
    // the last reply's rows: the constant entry and the key entry fired
    const titles = log.last.fired.map((r) => r.title).sort();
    expect(titles).toContain("Rules");
    expect(titles).toContain("Tower");
    expect(log.last.fired.every((r) => r.bookId === "town")).toBe(true);
    expect(log.last.by).toBe("Aria");
    // counters: Tower and Ghost, never the constant
    const names = Object.values(log.lore).map((e) => e.t).sort();
    expect(names).not.toContain("Rules");
    expect(names).toContain("Tower");
    expect(Object.values(log.lore).find((e) => e.t === "Tower")!.v.key).toBe(1);
  }, 30_000);

  it("counts the replies an entry was really in: the tower stays in the scan window, so the next reply counts it too", async () => {
    const m = mockHost();
    const id = await newChat(m);
    await send(m, id, "The tower looms.");
    await send(m, id, "Anyway, coffee?");
    const log = (await logOf(m, id))!;
    expect(log.replies).toBe(2);
    // the history keeps the tower in the scan window, so it was in the prompt of both replies
    expect(Object.values(log.lore).find((e) => e.t === "Tower")!.n).toBe(2);
    expect(log.last.reply).toBe(2);
  }, 30_000);

  it("a swipe replaces the reply before it: the count does not grow", async () => {
    const m = mockHost();
    const id = await newChat(m);
    await send(m, id, "The tower looms.");
    const before = (await logOf(m, id))!;
    const n = Object.values(before.lore).find((e) => e.t === "Tower")!.n;
    await drive({ method: "POST", path: `/chats/${id}/swipe`, body: { dir: 1 } }, m);
    const after = (await logOf(m, id))!;
    expect(after.replies).toBe(before.replies);
    expect(Object.values(after.lore).find((e) => e.t === "Tower")!.n).toBe(n);
    expect(after.last.gen).toBe("swipe");
  }, 30_000);

  it("a preview writes no log", async () => {
    const m = mockHost();
    const id = await newChat(m);
    await drive({ method: "POST", path: "/prompt/preview", body: { chatId: id, userText: "the tower" } }, m);
    expect(fs.existsSync(path.join(root, "fired-log"))).toBe(false);
    expect(await logOf(m, id)).toBeNull();
  }, 30_000);

  it("?brief=1 answers the numbers the header shows, and a bad id is refused", async () => {
    const m = mockHost();
    const id = await newChat(m);
    await send(m, id, "The tower looms.");
    const b = (await drive({ method: "GET", path: `/fired-log?chatId=${id}&brief=1` }, m)).json as { brief: { replies: number; loreFired: number } };
    expect(b.brief.replies).toBe(1);
    expect(b.brief.loreFired).toBeGreaterThanOrEqual(2);
    expect((await drive({ method: "GET", path: "/fired-log?chatId=../x" }, m)).status).toBe(400);
  }, 30_000);

  it("the rows carry the book id, and a held entry says why", async () => {
    const m = mockHost();
    const id = await newChat(m);
    // the ghost's key hits, its secondary key ("night") does not: held back
    await send(m, id, "A ghost walks here.");
    const log = (await logOf(m, id))!;
    const held = log.last.blocked.find((r) => r.title === "Ghost");
    expect(held?.reason).toBe("secondary");
  }, 30_000);

  it("sweeps the logs of chats that are gone once more than 20 are there", async () => {
    const m = mockHost();
    const id = await newChat(m);
    fs.mkdirSync(path.join(root, "fired-log"), { recursive: true });
    for (let i = 0; i < 24; i++) fs.writeFileSync(path.join(root, "fired-log", `gone${i}.json`), "{}");
    await send(m, id, "The tower looms.");
    expect(fs.readdirSync(path.join(root, "fired-log"))).toEqual([`${id}.json`]);
  }, 30_000);
});
