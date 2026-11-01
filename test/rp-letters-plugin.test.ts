/**
 * Letters from cards (plugins/letters/plugin.js, #72): the limits, the two-phase write, what the model is given,
 * and how a reply is kept to a clean letter.
 */
import { describe, expect, it } from "bun:test";
import { buildLetterRequest, cleanConfig, handleRoute, limitReason, listLetters, parseLetter, recentLines } from "../plugins/letters/plugin.js";

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; spec: Record<string, any> }[] = [];
  const host = {
    fs: {
      read: (p: string) => { if (!(p in files)) throw new Error("ENOENT " + p); return files[p]!; },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
      list: (dir: string) => Object.keys(files).filter((f) => f.startsWith(dir + "/") && !f.slice(dir.length + 1).includes("/")).map((f) => f.slice(dir.length + 1)),
    },
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results },
  };
  return { host, files, results, requests };
}
const req = (method: string, path: string, body?: unknown) => ({ method, path, query: {}, body });
const card = { name: "Ilsa", description: "A ferry captain.", personality: "Blunt, loyal.", scenario: "A foggy harbour.", first_mes: "Ahoy." };
const base = (extra: Record<string, string> = {}, on = true) => ({
  "letters/config.json": JSON.stringify({ enabled: on }),
  "characters/c1/card.json": JSON.stringify(card),
  "settings.json": JSON.stringify({ model: "c/default" }),
  ...extra,
});
const chatFiles = () => ({
  "chats/ch1.meta.json": JSON.stringify({ id: "ch1", characterId: "c1" }),
  "chats/ch1.jsonl": [1, 2, 3, 4, 5, 6, 7].map((i) => JSON.stringify({ id: "m" + i, role: i % 2 ? "user" : "char", text: "line " + i })).join("\n"),
});
const reply = (text: string) => ({ text, model: "c/m" });

describe("config", () => {
  it("keeps every value in range and the switch off by default", () => {
    expect(cleanConfig(undefined)).toEqual({ enabled: false, idleDays: 14, perDay: 3, perCardDays: 30, model: "" });
    const c = cleanConfig({ enabled: true, idleDays: 1, perDay: 99, perCardDays: "x", model: "has space" });
    expect(c).toEqual({ enabled: true, idleDays: 7, perDay: 10, perCardDays: 30, model: "" });
  });
  it("PUT merges into what is stored and GET reads it back", () => {
    const m = memHost(base());
    const out = handleRoute(req("PUT", "/letters/config", { perDay: 2 }), m.host) as any;
    expect(out.json.config.perDay).toBe(2);
    expect(out.json.config.enabled).toBe(true);
    const got = handleRoute(req("GET", "/letters"), m.host) as any;
    expect(got.json.config.perDay).toBe(2);
    expect(got.json.model).toBe("c/default");
  });
  it("the model: config, else Litopys', else the app's", () => {
    const m = memHost(base({ "litopys/config.json": JSON.stringify({ model: "c/lit" }) }));
    expect((handleRoute(req("GET", "/letters"), m.host) as any).json.model).toBe("c/lit");
    handleRoute(req("PUT", "/letters/config", { model: "c/own" }), m.host);
    expect((handleRoute(req("GET", "/letters"), m.host) as any).json.model).toBe("c/own");
  });
});

describe("limitReason", () => {
  const config = cleanConfig({ enabled: true });
  const free = { config, card: { lastAt: 0, muted: false }, unread: 0, today: 0, now: 100 * 86400000 };
  it("allows a free card", () => expect(limitReason(free)).toBeNull());
  it("names the first limit that stops it", () => {
    expect(limitReason({ ...free, config: { ...config, enabled: false } })).toBe("off");
    expect(limitReason({ ...free, card: { lastAt: 0, muted: true } })).toBe("muted");
    expect(limitReason({ ...free, unread: 1 })).toBe("waiting");
    expect(limitReason({ ...free, today: 3 })).toBe("daily");
    expect(limitReason({ ...free, card: { lastAt: free.now - 5 * 86400000, muted: false } })).toBe("cooldown");
    expect(limitReason({ ...free, card: { lastAt: free.now - 31 * 86400000, muted: false } })).toBeNull();
  });
});

describe("POST /letters/write", () => {
  const body = { characterId: "c1", chatId: "ch1", why: "idle", lang: "uk" };
  it("asks the model once with the card and the last five messages, then files the letter", () => {
    const m = memHost(base(chatFiles()));
    const first = handleRoute(req("POST", "/letters/write", body), m.host) as any;
    expect(first.__llmPending).toBe(true);
    const spec = m.requests[0]!.spec;
    expect(m.requests[0]!.key).toBe("letter");
    expect(spec.model).toBe("c/default");
    expect(spec.reasoning).toBeUndefined();
    const text = spec.messages[0].content as string;
    expect(text).toContain("A ferry captain.");
    expect(text).toContain("line 7");
    expect(text).toContain("line 3");
    expect(text).not.toContain("line 2");
    expect(text).toContain("Ukrainian");
    m.results.letter = reply('"We have not talked in a while. The fog is still here, and so am I."');
    const out = handleRoute(req("POST", "/letters/write", body), m.host) as any;
    expect(out.json.ok).toBe(true);
    expect(out.json.letter.text).toBe("We have not talked in a while. The fog is still here, and so am I.");
    expect(listLetters(m.host.fs).length).toBe(1);
    // nothing in the chat changed
    expect(m.files["chats/ch1.jsonl"]).toBe(chatFiles()["chats/ch1.jsonl"]);
    const state = JSON.parse(m.files["letters/cards/c1.json"]!);
    expect(state.lastWhy).toBe("idle");
  });
  it("reads the Litopys summary when there is one", () => {
    const m = memHost(base({ ...chatFiles(), "litopys/chats/ch1.json": JSON.stringify({ storySummary: { state: "done", text: "They sailed north." } }) }));
    handleRoute(req("POST", "/letters/write", body), m.host);
    expect(m.requests[0]!.spec.messages[0].content).toContain("They sailed north.");
  });
  it("does not ask a model when a limit stops it, and says why", () => {
    const off = memHost(base(chatFiles(), false));
    expect((handleRoute(req("POST", "/letters/write", body), off.host) as any).json).toEqual({ ok: false, reason: "off" });
    expect(off.requests.length).toBe(0);
    const day = memHost(base({ ...chatFiles(), "letters/day.json": JSON.stringify({ day: new Date().toISOString().slice(0, 10), n: 3 }) }));
    expect((handleRoute(req("POST", "/letters/write", body), day.host) as any).json.reason).toBe("daily");
    const cool = memHost(base({ ...chatFiles(), "letters/cards/c1.json": JSON.stringify({ lastAt: Date.now() - 86400000 }) }));
    expect((handleRoute(req("POST", "/letters/write", body), cool.host) as any).json.reason).toBe("cooldown");
  });
  it("refuses a second letter while one is unread, and a card that was muted", () => {
    const m = memHost(base(chatFiles()));
    handleRoute(req("POST", "/letters/write", body), m.host);
    m.results.letter = reply("Come back soon, will you? The tide waits for nobody.");
    handleRoute(req("POST", "/letters/write", body), m.host);
    delete m.results.letter;
    m.files["letters/cards/c1.json"] = JSON.stringify({ lastAt: 0 });
    expect((handleRoute(req("POST", "/letters/write", body), m.host) as any).json.reason).toBe("waiting");
    const out = handleRoute(req("POST", "/letters/mute", { characterId: "c1", muted: true }), m.host) as any;
    expect(out.json.muted).toEqual(["c1"]);
    expect(listLetters(m.host.fs).length).toBe(0);
    expect((handleRoute(req("POST", "/letters/write", body), m.host) as any).json.reason).toBe("muted");
    handleRoute(req("POST", "/letters/mute", { characterId: "c1", muted: false }), m.host);
    expect((handleRoute(req("GET", "/letters"), m.host) as any).json.muted).toEqual([]);
  });
  it("an idle letter needs a chat of that card with something in it", () => {
    const m = memHost(base());
    expect((handleRoute(req("POST", "/letters/write", { characterId: "c1", why: "idle" }), m.host) as any).status).toBe(400);
    expect((handleRoute(req("POST", "/letters/write", body), m.host) as any).json.reason).toBe("no-chat");
    const other = memHost(base({ "chats/ch1.meta.json": JSON.stringify({ characterId: "someone-else" }), "chats/ch1.jsonl": "{}" }));
    expect((handleRoute(req("POST", "/letters/write", body), other.host) as any).json.reason).toBe("no-chat");
  });
  it("a card with a Soul gets no 'nosoul' letter; an unplayed one is built from the card alone", () => {
    const soul = memHost({ ...base(), "characters/c1/card.json": JSON.stringify({ ...card, extensions: { molfar_soul: { characters: { Ilsa: {} } } } }) });
    expect((handleRoute(req("POST", "/letters/write", { characterId: "c1", why: "nosoul" }), soul.host) as any).json.reason).toBe("has-soul");
    const m = memHost(base());
    const first = handleRoute(req("POST", "/letters/write", { characterId: "c1", why: "unplayed", lang: "en" }), m.host) as any;
    expect(first.__llmPending).toBe(true);
    expect(m.requests[0]!.spec.messages[0].content).toContain("never played");
    expect(m.requests[0]!.spec.messages[0].content).not.toContain("The last messages");
  });
  it("no model, a model error and a useless reply file nothing", () => {
    const m = memHost({ "letters/config.json": JSON.stringify({ enabled: true }), "characters/c1/card.json": JSON.stringify(card) });
    expect((handleRoute(req("POST", "/letters/write", { characterId: "c1", why: "unplayed" }), m.host) as any).json.reason).toBe("no-model");
    const e = memHost(base());
    const b = { characterId: "c1", why: "unplayed" };
    handleRoute(req("POST", "/letters/write", b), e.host);
    e.results.letter = { error: "rate limit" };
    expect((handleRoute(req("POST", "/letters/write", b), e.host) as any).json.reason).toBe("error");
    e.results.letter = reply("ok");
    expect((handleRoute(req("POST", "/letters/write", b), e.host) as any).json.reason).toBe("bad-reply");
    expect(listLetters(e.host.fs).length).toBe(0);
    expect(e.files["letters/day.json"]).toBeUndefined();
  });
});

describe("dismiss", () => {
  it("deletes the letter and keeps the card's cooldown", () => {
    const m = memHost(base());
    const b = { characterId: "c1", why: "unplayed" };
    handleRoute(req("POST", "/letters/write", b), m.host);
    m.results.letter = reply("A letter long enough to be kept as it is.");
    const out = handleRoute(req("POST", "/letters/write", b), m.host) as any;
    handleRoute(req("POST", "/letters/dismiss", { ids: [out.json.letter.id] }), m.host);
    expect(listLetters(m.host.fs).length).toBe(0);
    delete m.results.letter;
    expect((handleRoute(req("POST", "/letters/write", b), m.host) as any).json.reason).toBe("cooldown");
  });
});

describe("helpers", () => {
  it("parseLetter strips fences, quotes and a JSON wrapper, and drops the empty", () => {
    expect(parseLetter("```\nHello there, traveller of the fog.\n```")).toBe("Hello there, traveller of the fog.");
    expect(parseLetter('{"letter":"Still alive? Come here, we are not done."}')).toBe("Still alive? Come here, we are not done.");
    expect(parseLetter("short")).toBeNull();
    expect(parseLetter("")).toBeNull();
    expect(parseLetter("x".repeat(2000))!.length).toBe(700);
  });
  it("recentLines takes the newest visible messages in order", () => {
    const msgs = [{ role: "user", text: "a" }, { role: "char", name: "Ilsa", text: "b", hidden: true }, { role: "char", name: "Ilsa", text: "c" }, { role: "system", text: "d" }];
    expect(recentLines(msgs, 5)).toEqual(["Player: a", "Ilsa: c"]);
  });
  it("buildLetterRequest never sets reasoning and names the language only as a fallback", () => {
    const r = buildLetterRequest({ why: "unplayed", card, recent: [], summary: "", lang: "en", model: "" });
    expect(r.model).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain("reasoning");
    expect(r.messages[0].content).toContain("if there is none, write in English");
  });
});
