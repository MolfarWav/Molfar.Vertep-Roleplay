/**
 * "Stays on" lorebook entries: an entry with `latch: true` goes on firing after its keys have hit once in this chat,
 * even when the keyword has left the scan window. The state is worked out from the chat on every scan, never stored:
 * removing the message that set it off ends it, and a chat without the keyword never has it.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E = (await import(engineUrl)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lore-latch-"));
  for (const d of ["characters", "personas", "presets", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null }));
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], openai_max_context: 8192, openai_max_tokens: 512 }));
});
afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* watcher races */
  }
});

const write = (rel: string, v: unknown) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === "string" ? v : JSON.stringify(v));
};
const host = () => ({
  fs: {
    root,
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => write(rel, content),
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
  store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
  llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  log: () => {},
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const route = (method: string, p: string, body: unknown, query: Record<string, string> = {}): { status: number; json: any } => {
  const out = E.handleRoute({ method, path: p, query, body }, host());
  return { status: out.status ?? 200, json: out.json };
};

const CLAMS = { uid: 1, title: "Clams", keys: ["clam"], content: "Jane craves clams and cannot stop thinking of them.", enabled: true, order: 100, position: "before_char", latch: true };

type M = { id: string; role: "user" | "char"; name: string; text: string };
const filler = (n: number, from = 1): M[] =>
  Array.from({ length: n }, (_, i): M => ({ id: `f${from + i}`, role: i % 2 ? "char" : "user", name: i % 2 ? "Jane" : "Jude", text: `Talk number ${from + i} about the weather.` }));
function chat(msgs: M[], entry: Record<string, unknown> = CLAMS) {
  write("characters/jane/card.json", { name: "Jane", description: "" });
  write("lorebooks/b.json", { id: "b", name: "Book", entries: [entry] });
  write("chats/c1.meta.json", { id: "c1", title: "T", characterId: "jane", userName: "Jude", lorebookIds: ["b"] });
  write("chats/c1.jsonl", msgs.map((m) => JSON.stringify({ swipe: 0, ...m })).join("\n") + "\n");
}
const status = () => route("POST", "/wi-status", { chatId: "c1" }).json;
const row = () => status().fired.find((r: { title: string }) => r.title === "Clams");

describe("an entry that stays on", () => {
  it("fires on its key as usual, saying it is a key hit", () => {
    chat([...filler(2), { id: "k1", role: "user", name: "Jude", text: "Jane is handed a clam." }]);
    const r = row();
    expect(r.via).toBe("key");
  });
  it("keeps firing after the key has left the scan window", () => {
    chat([{ id: "k1", role: "user", name: "Jude", text: "Jane is forced to eat a clam." }, ...filler(12)]);
    const r = row();
    expect(r).toBeTruthy();
    expect(r.via).toBe("latch");
    expect(r.since).toBe(0);
  });
  it("without the flag the same chat stays quiet", () => {
    chat([{ id: "k1", role: "user", name: "Jude", text: "Jane is forced to eat a clam." }, ...filler(12)], { ...CLAMS, latch: false });
    expect(row()).toBeUndefined();
  });
  it("never fired before the key: stays out", () => {
    chat(filler(12));
    expect(row()).toBeUndefined();
  });
  it("takes the first message that hit, not a later one", () => {
    chat([...filler(6), { id: "k1", role: "user", name: "Jude", text: "A clam appears." }, ...filler(8, 20), { id: "k2", role: "user", name: "Jude", text: "Another clam." }, ...filler(8, 40)]);
    expect(row().since).toBe(6);
  });
  it("is not stored: cutting the message that set it off ends it", () => {
    const set: M = { id: "k1", role: "user", name: "Jude", text: "Jane is forced to eat a clam." };
    chat([set, ...filler(12)]);
    expect(row().via).toBe("latch");
    chat(filler(12));
    expect(row()).toBeUndefined();
  });
  it("a secondary key that never held does not set it off", () => {
    const entry = { ...CLAMS, secondaryKeys: ["forced"], selectiveLogic: "AND_ALL" };
    chat([{ id: "k1", role: "user", name: "Jude", text: "Jane sees a clam." }, ...filler(12)], entry);
    expect(row()).toBeUndefined();
    chat([{ id: "k1", role: "user", name: "Jude", text: "Jane is forced to eat a clam." }, ...filler(12)], entry);
    expect(row().via).toBe("latch");
  });
  it("a secret entry that Jane does not know yet stays out, latch or not", () => {
    const entry = { ...CLAMS, secret: { knownBy: [], cover: "", reveal: ["clam"] } };
    chat([{ id: "k1", role: "user", name: "Jude", text: "Jane is forced to eat a clam." }, ...filler(12)], entry);
    // the reveal word was heard by its author (Jude); Jane is not in the snapshot, so she does not know it
    const s = status();
    expect(s.fired.some((r: { title: string }) => r.title === "Clams")).toBe(false);
  });
});
