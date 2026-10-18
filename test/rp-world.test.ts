/**
 * World DM (plugins/world, #52): the chronicler records people, places and facts from the
 * story into the chat's own world book; the engine plugin scans that book in its chat only,
 * copies it on a fork and removes it with the chat; the app's library never lists it.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyReport, dmInput, dueIn, emptyState, handleRoute, normalizeState, parseReply, shortText, unreadMessages } from "../plugins/world/plugin.js";

// world.ts reaches engine.ts, which reads the frame URL at import time
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { libraryBooks } = await import("../src/lib/world");

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const eng = (await import(engineUrl)) as { handleRoute: Function };

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; spec: Record<string, any> }[] = [];
  const host = {
    fs: {
      read: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
      list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
    },
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results },
  };
  return { host, files, results, requests };
}

const msg = (i: number, role: string, text: string, name?: string) => ({ id: "m" + i, role, name: name ?? (role === "user" ? "Taras" : "Odarka"), text, swipe: 0 });
const STORY = [
  msg(0, "char", "Odarka stirs the pot."),
  msg(1, "user", "Who lives up the pass?"),
  msg(2, "char", "Old Maksym keeps the toll at the Red Tower. Nobody crosses without paying him."),
  msg(3, "user", "Then we go at night."),
  msg(4, "char", "Odarka nods. The tower's lantern glows above the pines."),
];

const seed = (msgs = STORY) => ({
  "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
  "chats/c1.jsonl": msgs.map((m) => JSON.stringify(m)).join("\n") + "\n",
  "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
  "settings.json": JSON.stringify({ model: "c/default" }),
});

const route = (h: ReturnType<typeof memHost>["host"], method: string, p: string, body?: unknown, query: Record<string, string> = {}, stash?: unknown) =>
  handleRoute({ method, path: p, query, body, ...(stash ? { stash } : {}) }, h) as any;

const REPORT = JSON.stringify({
  add: [
    { kind: "person", name: "Maksym", aliases: ["Old Maksym", "the toll keeper"], text: "Keeps the toll at the Red Tower; nobody crosses the pass without paying him." },
    { kind: "place", name: "Red Tower", aliases: [], text: "A tower up the pass with a lantern that glows above the pines." },
    { kind: "person", name: "Odarka", text: "The witch." },
    { kind: "person", name: "Taras", text: "The courier." },
  ],
  update: [],
  retire: [],
  summary: "The toll keeper and his tower.",
});

describe("world state", () => {
  it("normalizeState drops junk and keeps ids unique", () => {
    const s = normalizeState({
      settings: { level: "chaos!", everyN: 999 },
      entities: [
        { id: "n1", kind: "person", name: "A", text: "x", status: "active" },
        { id: "n1", kind: "person", name: "dup", text: "y" },
        { id: "bad", name: "B" },
        { id: "n7", kind: "weird", name: "C", text: "z", status: "past", aliases: ["C", "Cee", ""] },
      ],
      log: [1, { at: 1 }],
    }, "c1");
    expect(s.settings).toEqual({ level: "off", everyN: 50 });
    expect(s.entities.map((e) => [e.id, e.kind, e.status, e.aliases])).toEqual([["n1", "person", "active", []], ["n7", "fact", "past", ["Cee"]]]);
    expect(s.nextId).toBe(8);
    expect(s.log).toEqual([{ at: 1 }]);
    expect(s.bookId).toBe("world-c1");
  });

  it("unread messages and every-N count replies after the last one read", () => {
    const st = emptyState("c1");
    st.settings.everyN = 2;
    expect(dueIn(st, STORY)).toBe(0);
    st.lastKey = "m2#0";
    expect(unreadMessages(STORY, st.lastKey).map((m) => m.id)).toEqual(["m3", "m4"]);
    expect(dueIn(st, STORY)).toBe(1);
    // a message the DM read that is gone: read everything again
    expect(unreadMessages(STORY, "gone#0").length).toBe(5);
  });

  it("parseReply reads fenced JSON, thinking first, trailing commas", () => {
    expect(parseReply("<think>{no}</think>```json\n{\"add\":[],}\n```")).toEqual({ add: [] });
    expect(parseReply("not json")).toBe(null);
  });

  it("shortText keeps two sentences", () => {
    expect(shortText("He died. At the bridge. Long ago, in winter.")).toBe("He died. At the bridge.");
  });
});

describe("applyReport", () => {
  it("adds records, never the cards or the user, folds a known name into an update", () => {
    const st = emptyState("c1");
    const n = applyReport(st, parseReply(REPORT)!, { cards: ["Odarka"], userName: "Taras", now: 5 });
    expect(n).toBe(2);
    expect(st.entities.map((e) => [e.id, e.name])).toEqual([["n1", "Maksym"], ["n2", "Red Tower"]]);
    expect(st.entities[0]!.aliases).toEqual(["Old Maksym", "the toll keeper"]);
    // the same name again (by an alias) is an update, not a second record
    const again = applyReport(st, { add: [{ kind: "person", name: "old maksym", text: "Lost his toll to the bandits." }] }, { cards: [], userName: "", now: 6 });
    expect(again).toBe(1);
    expect(st.entities.length).toBe(2);
    expect(st.entities[0]!.text).toBe("Lost his toll to the bandits.");
  });

  it("retires a record short and leaves it retired", () => {
    const st = emptyState("c1");
    applyReport(st, parseReply(REPORT)!, { cards: [], userName: "", now: 1 });
    applyReport(st, { retire: [{ id: "n1", text: "The old toll keeper of the Red Tower. Bandits killed him on the third night. His lantern went out." }] }, { cards: [], userName: "", now: 2 });
    const m = st.entities.find((e) => e.id === "n1")!;
    expect(m.status).toBe("past");
    expect(m.text).toBe("The old toll keeper of the Red Tower. Bandits killed him on the third night.");
    expect(applyReport(st, { update: [{ id: "n1", text: "Alive after all." }] }, { cards: [], userName: "", now: 3 })).toBe(0);
  });

  it("caps the changes of one run", () => {
    const st = emptyState("c1");
    const add = Array.from({ length: 20 }, (_, i) => ({ kind: "place", name: "Place " + i, text: "A place." }));
    expect(applyReport(st, { add }, { cards: [], userName: "", now: 1 })).toBe(8);
  });

  it("dmInput lists the cast, the record and the new story", () => {
    const st = emptyState("c1");
    applyReport(st, parseReply(REPORT)!, { cards: [], userName: "", now: 1 });
    const text = dmInput({ cards: ["Odarka"], userName: "Taras", entities: st.entities, msgs: STORY.slice(3) });
    expect(text).toContain("own cards (do not record): Odarka.");
    expect(text).toContain("n1 · person · Maksym (Old Maksym, the toll keeper): Keeps the toll");
    expect(text).toContain("[Taras] Then we go at night.");
    expect(text).not.toContain("Who lives up the pass?");
  });
});

describe("routes", () => {
  it("off by default; settings refuse unfinished levels; switching on starts near the end", () => {
    const m = memHost(seed());
    expect(route(m.host, "GET", "/world/state", undefined, { chatId: "c1" }).json).toMatchObject({ settings: { level: "off", everyN: 5 }, records: 0 });
    expect(route(m.host, "POST", "/world/update", { chatId: "c1" }).json).toEqual({ ok: true, skipped: "off" });
    expect(route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "director" }).status).toBe(400);
    const on = route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1 }).json;
    expect(on.settings).toEqual({ level: "chronicler", everyN: 1 });
    // reads the last two messages (everyN * 2, at least 2), not the whole chat
    expect(JSON.parse(m.files["world/state/c1.json"]!).lastKey).toBe("m2#0");
  });

  it("a run asks the DM model, writes the world book and binds it to the chat", () => {
    const m = memHost({ ...seed(), "world/config.json": JSON.stringify({ model: "c/dm" }) });
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1, fromStart: true });
    const first = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true });
    expect(first.__llmPending).toBe(true);
    expect(m.requests[0]!.key).toBe("world");
    expect(m.requests[0]!.spec.model).toBe("c/dm");
    expect(m.requests[0]!.spec.systemPrompt).toContain("world keeper");
    expect(m.requests[0]!.spec.messages[0].content).toContain("Old Maksym keeps the toll");
    m.results.world = { text: REPORT, model: "c/dm" };
    const done = route(m.host, "POST", "/world/update", { chatId: "c1", auto: true }, {}, first.stash).json;
    expect(done).toMatchObject({ ok: true, changes: 2, records: 2, dueIn: 1, lastSummary: "The toll keeper and his tower." });
    const book = JSON.parse(m.files["lorebooks/world-c1.json"]!);
    expect(book).toMatchObject({ id: "world-c1", ownerChatId: "c1", globalActive: false, name: "World: The Pass" });
    expect(book.entries.map((e: any) => [e.uid, e.title, e.keys, e.status, e.memo])).toEqual([
      [1, "Maksym", ["Maksym", "Old Maksym", "the toll keeper"], "normal", "world:n1"],
      [2, "Red Tower", ["Red Tower"], "normal", "world:n2"],
    ]);
    expect(book.entries[0].content).toBe("Maksym: Keeps the toll at the Red Tower; nobody crosses the pass without paying him.");
    expect(JSON.parse(m.files["chats/c1.meta.json"]!).worldBookId).toBe("world-c1");
    // nothing new to read: no call
    expect(route(m.host, "POST", "/world/update", { chatId: "c1" }).json).toEqual({ ok: true, skipped: "nothing new" });
  });

  it("keeps uids and the user's own entries in the book across runs; retired entries lose order", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1, fromStart: true });
    m.results.world = { text: REPORT };
    route(m.host, "POST", "/world/update", { chatId: "c1" });
    const book = JSON.parse(m.files["lorebooks/world-c1.json"]!);
    book.entries.push({ uid: 9, title: "Mine", memo: "by hand", keys: ["x"], content: "x" });
    m.files["lorebooks/world-c1.json"] = JSON.stringify(book);
    m.files["chats/c1.jsonl"] += JSON.stringify(msg(5, "char", "Bandits took the tower; Maksym is dead.")) + "\n";
    m.results.world = { text: JSON.stringify({ retire: [{ id: "n1", text: "The toll keeper of the Red Tower. Bandits killed him." }] }) };
    route(m.host, "POST", "/world/update", { chatId: "c1" });
    const after = JSON.parse(m.files["lorebooks/world-c1.json"]!);
    expect(after.entries.map((e: any) => [e.uid, e.title, e.order])).toEqual([[9, "Mine", undefined], [1, "Maksym", 50], [2, "Red Tower", 100]]);
    expect(after.entries[1].memo).toBe("world:n1 (retired)");
  });

  it("a failed run records the error and reads the same messages next time", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", fromStart: true });
    m.results.world = { text: "Sorry, I cannot." };
    expect(route(m.host, "POST", "/world/update", { chatId: "c1" }).json).toEqual({ ok: false, error: "the DM's reply was not JSON" });
    const st = JSON.parse(m.files["world/state/c1.json"]!);
    expect(st.lastKey).toBe(null);
    expect(st.lastError.message).toBe("the DM's reply was not JSON");
    expect(m.files["lorebooks/world-c1.json"]).toBeUndefined();
  });

  it("the model falls back to the chat's, then the app's", () => {
    const m = memHost(seed());
    route(m.host, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", fromStart: true });
    route(m.host, "POST", "/world/update", { chatId: "c1" });
    expect(m.requests[0]!.spec.model).toBe("c/chat");
    expect(route(m.host, "PUT", "/world/config", { model: "c/dm", maxTokens: 99999 }).json).toEqual({ model: "c/dm", maxTokens: 8000 });
    expect(route(m.host, "PUT", "/world/config", { model: "", maxTokens: 1500 }).json).toEqual({ model: "", maxTokens: 1500 });
    expect(m.files["world/config.json"]).toBeUndefined();
  });
});

describe("the app's library", () => {
  it("never lists a chat's world book", () => {
    expect(libraryBooks([{ id: "a" }, { id: "world-c1", ownerChatId: "c1" }, { id: "b", ownerChatId: "" }]).map((b) => b.id)).toEqual(["a", "b"]);
  });
});

// ---------- the engine plugin: scope, fork, delete ----------
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "world-"));
  for (const d of ["characters/odarka", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "characters", "odarka", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Odarka", description: "A witch.", first_mes: "Hi." }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

function fsHost() {
  return {
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
  };
}
const call = (method: string, p: string, body?: unknown) => (eng.handleRoute({ method, path: p, query: {}, body }, fsHost()) as { json: Record<string, any> }).json;
const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const readRel = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

function worldChat(): string {
  const id = call("POST", "/chats", { characterId: "odarka" }).meta.id as string;
  const lines = STORY.map((m) => JSON.stringify(m));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), lines.join("\n") + "\n");
  const meta = readRel("chats/" + id + ".meta.json");
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ ...meta, worldBookId: "world-" + id }));
  fs.writeFileSync(path.join(root, "lorebooks", "world-" + id + ".json"), JSON.stringify({
    id: "world-" + id, name: "World", ownerChatId: id, settings: {},
    entries: [{ uid: 1, title: "Maksym", keys: ["Maksym"], content: "Maksym keeps the toll.", enabled: true, order: 100, position: "before_char", memo: "world:n1" }],
  }));
  fs.mkdirSync(path.join(root, "world", "state"), { recursive: true });
  fs.writeFileSync(path.join(root, "world", "state", id + ".json"), JSON.stringify({ ...emptyState(id), lastKey: "m4#0" }));
  return id;
}
const allText = (p: any) => [p.systemPrompt ?? "", ...p.messages.map((m: any) => m.content)].join("\n");

describe("engine plugin: the chat's world book", () => {
  it("is scanned in its own chat, though no lorebookIds name it, and not in another", () => {
    const id = worldChat();
    expect(allText(call("POST", "/prompt/preview", { chatId: id, userText: "Where is Maksym?" }))).toContain("Maksym keeps the toll.");
    const other = call("POST", "/chats", { characterId: "odarka" }).meta.id as string;
    expect(allText(call("POST", "/prompt/preview", { chatId: other, userText: "Where is Maksym?" }))).not.toContain("Maksym keeps the toll.");
  });

  it("a fork gets its own copy; the DM's place moves back to the fork point", () => {
    const id = worldChat();
    const fork = call("POST", "/chats/" + id + "/fork", { messageId: "m2" }).meta as { id: string; worldBookId: string };
    expect(fork.worldBookId).toBe("world-" + fork.id);
    expect(readRel("lorebooks/world-" + fork.id + ".json")).toMatchObject({ id: "world-" + fork.id, ownerChatId: fork.id });
    expect(readRel("world/state/" + fork.id + ".json")).toMatchObject({ chatId: fork.id, bookId: "world-" + fork.id, lastKey: "m2#0" });
    expect(readRel("lorebooks/world-" + id + ".json").ownerChatId).toBe(id);
  });

  it("goes with its chat when the chat is deleted", () => {
    const id = worldChat();
    call("DELETE", "/chats/" + id);
    expect(exists("lorebooks/world-" + id + ".json")).toBe(false);
    expect(exists("world/state/" + id + ".json")).toBe(false);
  });
});
