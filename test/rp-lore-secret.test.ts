/**
 * Secret lorebook entries (Molfar.Vertep#416): an entry with `secret: { knownBy, cover, reveal }` reaches a reply spoken by
 * one character only when that character knows it; anyone else gets the cover or nothing. A reply that voices several
 * characters gets the truth with a marker saying who knows it. Who knows is read from the chat at every scan: from the
 * start, heard (a reveal word in a message, taught to those the Dashboard lists as present) and added or removed by hand.
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lore-secret-"));
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

const SECRET = { knownBy: ["Mira"], cover: "An old dagger with strange runes.", reveal: ["Soul-eater"] };
const DAGGER = { uid: 1, title: "The dagger", keys: ["dagger"], content: "The dagger is the Soul-eater, a cursed blade.", enabled: true, order: 100, position: "before_char", secret: SECRET };

type M = { id: string; role: "user" | "char"; name: string; text: string; swipe?: number };
function chat(msgs: M[], present: Record<string, string[]> = {}, card = "Bram") {
  write("characters/bram/card.json", { name: card, description: "" });
  write("lorebooks/b.json", { id: "b", name: "Book", entries: [DAGGER] });
  write("chats/c1.meta.json", { id: "c1", title: "T", characterId: "bram", userName: "Jude", lorebookIds: ["b"] });
  write("chats/c1.jsonl", msgs.map((m) => JSON.stringify({ swipe: 0, ...m })).join("\n") + "\n");
  const snapshots: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(present)) snapshots[id + "#0"] = { present: p };
  write("dashboard/state/c1.json", { v: 2, chatId: "c1", snapshots });
}
const status = () => route("POST", "/wi-status", { chatId: "c1" }).json;
const row = () => status().fired.find((r: { title: string }) => r.title === "The dagger");

describe("what a secret entry gives a reply", () => {
  const sec = E.secretOf(DAGGER);
  const one = (n: string) => ({ names: new Set([n.toLowerCase()]), several: false });

  it("a speaker who knows gets the truth", () => {
    const v = E.secretView(DAGGER.content, sec, [{ name: "Mira", how: "start" }], one("Mira"));
    expect(v).toEqual({ mode: "known", text: DAGGER.content });
  });
  it("a speaker who does not know gets the cover, never the truth", () => {
    const v = E.secretView(DAGGER.content, sec, [{ name: "Mira", how: "start" }], one("Bram"));
    expect(v.mode).toBe("cover");
    expect(v.text).toBe(SECRET.cover);
    expect(v.text).not.toContain("Soul-eater");
  });
  it("no cover: the entry stays out for the one who does not know", () => {
    const v = E.secretView(DAGGER.content, { ...sec, cover: "" }, [], one("Bram"));
    expect(v).toEqual({ mode: "hidden", text: "" });
  });
  it("several voices: the truth with a marker that names who knows and what the rest believe", () => {
    const v = E.secretView(DAGGER.content, sec, [{ name: "Mira" }, { name: "Jude" }], { names: new Set(), several: true });
    expect(v.mode).toBe("marked");
    expect(v.text).toContain("Soul-eater");
    expect(v.text).toContain("only Mira and Jude know this");
    expect(v.text).toContain(SECRET.cover);
  });
  it("a card name with a prefix still matches its character", () => {
    expect(E.sameKnower("Yae Miko", "Sugar Mommy | Yae Miko")).toBe(true);
    expect(E.sameKnower("Ann", "Anna")).toBe(false);
  });
});

describe("who knows, read from the chat", () => {
  it("from the start only, before anyone hears the word", () => {
    chat([{ id: "m1", role: "user", name: "Jude", text: "Jude shows Bram the dagger." }], { m1: ["Bram"] });
    const r = row();
    expect(r.secret).toBe("cover");
    expect(r.knowers).toEqual(["Mira"]);
  });
  it("hearing a reveal word teaches everyone the snapshot lists as present", () => {
    chat(
      [
        { id: "m1", role: "user", name: "Jude", text: "This dagger is the Soul-eater, Bram." },
        { id: "m2", role: "char", name: "Bram", text: "Bram stares at the dagger." },
      ],
      { m2: ["Bram", "Lia"] },
    );
    const r = row();
    expect(r.secret).toBe("known");
    expect(r.knowers.sort()).toEqual(["Bram", "Jude", "Lia", "Mira"]);
  });
  it("someone absent when the word was said does not learn it", () => {
    chat(
      [
        { id: "m1", role: "user", name: "Jude", text: "To Lia alone: the dagger is the Soul-eater." },
        { id: "m2", role: "char", name: "Bram", text: "Far away, Bram sharpens the dagger." },
      ],
      { m2: ["Lia"] },
    );
    const r = row();
    expect(r.secret).toBe("cover");
    expect(r.knowers.map((n: string) => n.toLowerCase())).not.toContain("bram");
  });
  it("a removal by hand beats hearing it; an addition by hand teaches", () => {
    chat(
      [
        { id: "m1", role: "user", name: "Jude", text: "The dagger is the Soul-eater." },
        { id: "m2", role: "char", name: "Bram", text: "Bram nods at the dagger." },
      ],
      { m2: ["Bram"] },
    );
    expect(row().secret).toBe("known");
    expect(route("POST", "/lore-known", { chatId: "c1", entry: "b#1", who: "Bram", op: "remove" }).status).toBe(200);
    expect(row().secret).toBe("cover");
    route("POST", "/lore-known", { chatId: "c1", entry: "b#1", who: "Bram", op: "add" });
    expect(row().secret).toBe("known");
    const list = route("GET", "/lore-known", null, { chatId: "c1" }).json;
    expect(list.entries).toHaveLength(1);
    // Bram heard it too: one row per person, the first way they came to know it
    expect(list.entries[0].knowers.filter((k: { name: string }) => k.name === "Bram")).toHaveLength(1);
    expect(list.people).toEqual(["Bram", "Jude"]);
    route("POST", "/lore-known", { chatId: "c1", entry: "b#1", who: "Lia", op: "add" });
    const lia = route("GET", "/lore-known", null, { chatId: "c1" }).json.entries[0].knowers.find((k: { name: string }) => k.name === "Lia");
    expect(lia.how).toBe("manual");
  });
  it("no cover and the speaker does not know: held back with its reason", () => {
    chat([{ id: "m1", role: "user", name: "Jude", text: "The dagger." }], {});
    write("lorebooks/b.json", { id: "b", name: "Book", entries: [{ ...DAGGER, secret: { ...SECRET, cover: "" } }] });
    const s = status();
    expect(s.fired.some((r: { title: string }) => r.title === "The dagger")).toBe(false);
    expect(s.blocked.find((r: { title: string }) => r.title === "The dagger").reason).toBe("secret");
  });
  it("a card that answers to several names is a narrator: the truth, marked", () => {
    chat([{ id: "m1", role: "user", name: "Jude", text: "The dagger." }], {});
    write("characters/bram/card.json", { name: "Tales", extensions: { molfar_soul: { characters: { Bram: {}, Lia: {} } } } });
    expect(row().secret).toBe("marked");
  });
  it("bad input to the route is refused", () => {
    chat([], {});
    expect(route("POST", "/lore-known", { chatId: "c1", entry: "../x", who: "Bram", op: "add" }).status).toBe(400);
    expect(route("POST", "/lore-known", { chatId: "c1", entry: "b#1", who: "", op: "add" }).status).toBe(400);
    expect(route("POST", "/lore-known", { chatId: "c1", entry: "b#1", who: "Bram", op: "wipe" }).status).toBe(400);
    expect(route("POST", "/lore-known", { chatId: "nope", entry: "b#1", who: "Bram", op: "add" }).status).toBe(404);
  });
});
