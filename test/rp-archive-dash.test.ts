/** #263: opening or refreshing an archived chat spends no model call: the Dashboard sensor and the automatic soul rating skip it. */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-archive-"));
  for (const d of ["chats", "characters/aria", "dashboard", "litopys"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  // a card with no soul: the automatic rating would want to run for it
  fs.writeFileSync(path.join(root, "characters/aria/card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista." }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

const writeChat = (archived: boolean) => {
  fs.writeFileSync(path.join(root, "chats/c1.meta.json"), JSON.stringify({ id: "c1", title: "t", characterId: "aria", userName: "Taras", ...(archived ? { archived: true } : {}) }));
  const msgs = [
    { id: "m1", role: "char", name: "Aria", charId: "aria", text: "Aria wipes the counter.", swipe: 0 },
    { id: "m2", role: "user", name: "Taras", text: "I sit down by the window.", swipe: 0 },
    { id: "m3", role: "char", name: "Aria", charId: "aria", text: "She brings the coffee without asking.", swipe: 0 },
  ];
  fs.writeFileSync(path.join(root, "chats/c1.jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
};

function host() {
  const requests: string[] = [];
  return {
    requests,
    host: {
      fs: {
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
      llm: { request: (key: string) => { requests.push(key); }, results: {}, embed: () => {}, embedResults: {} },
      net: { request: () => {}, results: {} },
      log: () => {},
    },
  };
}
const call = (h: ReturnType<typeof host>, p: string, body: unknown) => P.handleRoute({ method: "POST", path: p, query: {}, body }, h.host as never) as Record<string, any>;

describe("an archived chat costs no model call", () => {
  it("the Dashboard update asks the model for a chat that is open, and not for an archived one", () => {
    writeChat(false);
    const live = host();
    call(live, "/dashboard/update", { chatId: "c1", op: "catchup" });
    expect(live.requests.length).toBeGreaterThan(0);

    writeChat(true);
    const done = host();
    const out = call(done, "/dashboard/update", { chatId: "c1", op: "catchup" });
    expect(done.requests).toEqual([]);
    expect(JSON.stringify(out)).toContain("archived");
  });

  it("the automatic soul rating is skipped for an archived chat, and still runs for an open one", () => {
    writeChat(false);
    const live = host();
    call(live, "/dashboard/soul/rate", { characterId: "aria", chatId: "c1", auto: true });
    expect(live.requests.length).toBeGreaterThan(0);

    writeChat(true);
    const done = host();
    const out = call(done, "/dashboard/soul/rate", { characterId: "aria", chatId: "c1", auto: true });
    expect(done.requests).toEqual([]);
    expect(out.json.skipped).toBe(true);
  });

  it("a rating the user asks for on purpose is not blocked", () => {
    writeChat(true);
    const asked = host();
    call(asked, "/dashboard/soul/rate", { characterId: "aria", chatId: "c1" });
    expect(asked.requests.length).toBeGreaterThan(0);
  });
});
