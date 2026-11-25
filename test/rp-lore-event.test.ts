/**
 * A secret lorebook entry that opens on a happening (`secret.happens`): the Dashboard sensor is told the sentence in its
 * own prompt, marks it in the snapshot (`happened`) when it clearly took place, and the engine teaches everyone in that
 * scene. Nothing is added to the sensor's prompt for a chat that has no such entry.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;
const E = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lore-event-"));
  for (const d of ["chats", "characters/jane", "dashboard", "litopys", "lorebooks", "presets", "personas"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "characters/jane/card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Jane" }));
  fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null }));
  fs.writeFileSync(path.join(root, "presets/default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], openai_max_context: 8192, openai_max_tokens: 512 }));
});
afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {}
});

function mockHost(replies: string[] = []) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; req: any }[] = [];
  let pending: { key: string; req: any }[] = [];
  const queue = replies.slice();
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
      request: (key: string, req: any) => {
        const s = { key, req };
        requests.push(s);
        pending.push(s);
      },
      results,
      embed: () => {},
      embedResults: {},
    },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
  const answer = () => {
    for (const k of Object.keys(results)) delete results[k];
    for (const { key } of pending) {
      const next = queue.shift();
      if (next === undefined) throw new Error("no scripted reply left for " + key);
      results[key] = { text: next, model: "mock/sensor", usage: { input: 100, output: 20 }, genTimeMs: 42 };
    }
    pending = [];
  };
  return { host, requests, answer, push: (...r: string[]) => queue.push(...r) };
}
function drive(mock: ReturnType<typeof mockHost>, req: { method: string; path: string; body?: unknown; query?: Record<string, string> }) {
  const call: any = { query: {}, ...req };
  for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as any)[k];
  let out = P.handleRoute(call, mock.host) as any;
  for (let pass = 0; out?.__llmPending && pass < 3; pass++) {
    if (out.stash) call.stash = out.stash;
    mock.answer();
    out = P.handleRoute(call, mock.host);
  }
  return out;
}
const update = (m: ReturnType<typeof mockHost>, chatId: string) => drive(m, { method: "POST", path: "/dashboard/update", body: { chatId, op: "send" } });
const stateOf = (id: string) => JSON.parse(fs.readFileSync(path.join(root, "dashboard/state", id + ".json"), "utf8"));
const systemOf = (m: ReturnType<typeof mockHost>) => String(m.requests.at(-1)!.req.systemPrompt);

type Msg = { id: string; role: string; name?: string; text: string; swipe?: number };
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "You", text });
const A = (id: string, text: string): Msg => ({ id, role: "char", name: "Jane", text, swipe: 0 });
const TRAIT = { uid: 1, title: "Clams", keys: [], status: "constant", content: "Jane craves clams.", enabled: true, order: 100, position: "before_char", secret: { knownBy: [], cover: "", reveal: [], happens: "Jane is made to eat a clam" } };
function writeChat(id: string, msgs: Msg[], entries: unknown[] = [TRAIT]) {
  fs.writeFileSync(path.join(root, "lorebooks/b.json"), JSON.stringify({ id: "b", name: "Book", entries }));
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ id, title: "T", characterId: "jane", userName: "You", model: "chat/model", lorebookIds: ["b"], updatedAt: Date.now() }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}
const reply = (o: Record<string, unknown>) => JSON.stringify(o);
const talk = (): Msg[] => [U("m1", "Try this."), A("m2", "Jane takes the clam and swallows it, wincing."), U("m3", "How was it?")];

const engineRoute = (method: string, p: string, body: unknown, query: Record<string, string> = {}) => {
  const out = E.handleRoute({ method, path: p, query, body }, mockHost().host);
  return { status: out.status ?? 200, json: out.json };
};
const firedClams = () => engineRoute("POST", "/wi-status", { chatId: "c1" }).json.fired.find((r: { title: string }) => r.title === "Clams");

describe("watched happenings: the sensor's prompt", () => {
  it("lists the entry and asks for `happened`", () => {
    writeChat("c1", talk());
    const mock = mockHost([reply({ present: ["Jane"] })]);
    update(mock, "c1");
    expect(systemOf(mock)).toContain("Watched happenings");
    expect(systemOf(mock)).toContain("b#1: Jane is made to eat a clam");
  });
  it("adds nothing for a chat with no such entry", () => {
    writeChat("c1", talk(), [{ ...TRAIT, secret: { knownBy: [], cover: "", reveal: ["clam"] } }]);
    const mock = mockHost([reply({ present: ["Jane"] })]);
    update(mock, "c1");
    expect(systemOf(mock)).not.toContain("Watched happenings");
  });
  it("a disabled entry is not watched, and at most eight are", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...TRAIT, uid: i + 1, secret: { knownBy: [], cover: "", reveal: [], happens: "Thing " + (i + 1) } }));
    writeChat("c1", talk(), [{ ...many[0], enabled: false }, ...many.slice(1)]);
    const w = P.watchedHappenings(mockHost().host.fs, { lorebookIds: ["b"] }, { snapshots: {} });
    expect(w).toHaveLength(8);
    expect(w.some((x: { id: string }) => x.id === "b#1")).toBe(false);
  });
});

describe("watched happenings: what the sensor reports", () => {
  it("keeps an id it was asked about and drops any other", () => {
    writeChat("c1", talk());
    const mock = mockHost([reply({ present: ["Jane"], happened: ["b#1", "b#99", "x#1"] })]);
    update(mock, "c1");
    expect(stateOf("c1").snapshots["m3#0"].happened).toEqual(["b#1"]);
  });
  it("no `happened` in the report, nothing in the snapshot", () => {
    writeChat("c1", talk());
    const mock = mockHost([reply({ present: ["Jane"] })]);
    update(mock, "c1");
    expect(stateOf("c1").snapshots["m3#0"].happened).toBeUndefined();
  });
  it("a happening already marked is not asked again", () => {
    writeChat("c1", talk());
    const mock = mockHost([reply({ present: ["Jane"], happened: ["b#1"] })]);
    update(mock, "c1");
    writeChat("c1", [...talk(), A("m4", "Jane licks her lips."), U("m5", "Again?")]);
    mock.push(reply({ present: ["Jane"] }));
    update(mock, "c1");
    expect(systemOf(mock)).not.toContain("Watched happenings");
  });
});

describe("watched happenings: who learns it", () => {
  const withSnapshot = (happened: string[] | undefined, present: string[], key = "m2#0") => {
    writeChat("c1", talk());
    fs.mkdirSync(path.join(root, "dashboard/state"), { recursive: true });
    fs.writeFileSync(path.join(root, "dashboard/state/c1.json"), JSON.stringify({ v: 2, chatId: "c1", snapshots: { [key]: { present, ...(happened ? { happened } : {}) } } }));
  };
  it("before it happens nobody knows, so the speaker gets nothing", () => {
    withSnapshot(undefined, ["Jane"]);
    expect(firedClams()).toBeUndefined();
  });
  it("after it happened, whoever was in the scene knows", () => {
    withSnapshot(["b#1"], ["Jane", "Bram"]);
    const r = firedClams();
    expect(r.secret).toBe("known");
    const list = engineRoute("GET", "/lore-known", null, { chatId: "c1" }).json;
    const jane = list.entries[0].knowers.find((k: { name: string }) => k.name === "Jane");
    expect(jane.how).toBe("happened");
    expect(jane.word).toBe("Jane is made to eat a clam");
  });
  it("someone who was not in the scene does not learn it", () => {
    withSnapshot(["b#1"], ["Bram"]);
    expect(firedClams()).toBeUndefined();
  });
  it("a snapshot of a swipe that is gone teaches nothing", () => {
    withSnapshot(["b#1"], ["Jane"], "m2#1");
    expect(firedClams()).toBeUndefined();
  });
  it("a hand removal still beats it", () => {
    withSnapshot(["b#1"], ["Jane"]);
    expect(firedClams().secret).toBe("known");
    engineRoute("POST", "/lore-known", { chatId: "c1", entry: "b#1", who: "Jane", op: "remove" });
    expect(firedClams()).toBeUndefined();
  });
});
