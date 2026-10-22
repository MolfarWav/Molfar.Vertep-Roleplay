/** Per-chat choice of the card's stories: PATCH /chats/:id { memory: { sources } } writes meta.memory.sources only. */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const eng = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as typeof import("../plugins/engine/plugin.js");

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "chat-memory-"));
  for (const d of ["characters/aria", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista.", first_mes: "Hi." }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

const host = () => ({
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
  llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  log: () => {},
});
const call = (method: string, p: string, body?: unknown) =>
  (eng.handleRoute({ method, path: p, query: {}, body }, host()) as { json: Record<string, any> }).json;
const newChat = () => (call("POST", "/chats", { characterId: "aria" }).meta as { id: string }).id;
const metaFile = (id: string) => path.join(root, "chats", id + ".meta.json");
const readMeta = (id: string) => JSON.parse(fs.readFileSync(metaFile(id), "utf8"));

describe("chat memory: which stories feed this chat", () => {
  it("cleans the map: ids like s1, booleans only, at most 60", () => {
    expect(eng.cleanChatMemorySources(null)).toBeNull();
    expect(eng.cleanChatMemorySources({ sources: [true] })).toBeNull();
    expect(eng.cleanChatMemorySources({ sources: { s1: false, s2: true, x3: true, s4: "yes", "s5 ": true, s: false, s7: null } })).toEqual({ s1: false, s2: true });
    const many = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`s${i + 1}`, i % 2 === 0]));
    expect(Object.keys(eng.cleanChatMemorySources({ sources: many }) ?? {}).length).toBe(60);
  });

  it("sets, replaces and clears meta.memory.sources, keeping the other keys of meta.memory and of the meta", () => {
    const id = newChat();
    const before = readMeta(id);
    fs.writeFileSync(metaFile(id), JSON.stringify({ ...before, memory: { note: "keep me" }, authorNote: "hello" }));

    let meta = call("PATCH", "/chats/" + id, { memory: { sources: { s1: false, s2: true, junk: true } } }) as Record<string, any>;
    expect(meta.memory).toEqual({ note: "keep me", sources: { s1: false, s2: true } });
    expect(readMeta(id).memory.sources).toEqual({ s1: false, s2: true });
    expect(readMeta(id).authorNote).toBe("hello");
    expect(readMeta(id).id).toBe(before.id);

    meta = call("PATCH", "/chats/" + id, { memory: { sources: { s3: false } } }) as Record<string, any>;
    expect(meta.memory.sources).toEqual({ s3: false });

    // junk only, or null: the choice is cleared, the rest of meta.memory stays
    for (const clear of [null, { sources: { nope: 1 } }, { sources: {} }]) {
      call("PATCH", "/chats/" + id, { memory: { sources: { s1: false } } });
      meta = call("PATCH", "/chats/" + id, { memory: clear }) as Record<string, any>;
      expect(meta.memory).toEqual({ note: "keep me" });
    }
  });

  it("drops meta.memory altogether when nothing else is in it, and a PATCH without `memory` leaves it alone", () => {
    const id = newChat();
    call("PATCH", "/chats/" + id, { memory: { sources: { s1: false } } });
    call("PATCH", "/chats/" + id, { title: "Renamed" });
    expect(readMeta(id).memory).toEqual({ sources: { s1: false } });
    expect(readMeta(id).title).toBe("Renamed");
    call("PATCH", "/chats/" + id, { memory: null });
    expect("memory" in readMeta(id)).toBe(false);
  });

  it("an identical write touches nothing (the no-op guard)", () => {
    const id = newChat();
    call("PATCH", "/chats/" + id, { memory: { sources: { s1: false } } });
    const stamp = fs.statSync(metaFile(id)).mtimeMs;
    const text = fs.readFileSync(metaFile(id), "utf8");
    call("PATCH", "/chats/" + id, { memory: { sources: { s1: false } } });
    expect(fs.readFileSync(metaFile(id), "utf8")).toBe(text);
    expect(fs.statSync(metaFile(id)).mtimeMs).toBe(stamp);
  });
});
