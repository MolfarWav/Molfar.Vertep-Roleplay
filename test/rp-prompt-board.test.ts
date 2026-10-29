/**
 * Per-chat prompt switches (promptBoard): cleanPromptBoard() sorts good keys from junk, and
 * assemble() leaves whatever the chat switched off out of the request, saying why. The fixture
 * here has no author's note, data bank or Litopys/relations plugins, so those keys are only
 * unit-tested through cleanPromptBoard; the lorebook key is covered end to end.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
type Engine = typeof import("../plugins/engine/plugin.js");
const eng = (await import(engineUrl)) as Engine;

type Part = { kind: string; label: string; detail?: string; text: string; located: boolean; key?: string };
type Omitted = { kind: string; label: string; reason: string; detail?: string; key?: string };
type BoardItem = { key: string; label: string; kind: string; state: string };
type Preview = {
  messages: { role: string; content: string }[];
  systemPrompt?: string;
  sources: { parts: Part[]; omitted: Omitted[]; vars: { name: string; value: string }[]; board: BoardItem[] };
  sourceSpans: { msg: number; start: number; end: number; part: number }[];
};

let root: string;
const PRESET = {
  id: "fx", name: "FX",
  prompts: [
    { identifier: "main", name: "Main", role: "system", content: "You are the narrator of {{char}}'s story.", marker: true },
    { identifier: "worldInfoBefore", name: "World info", role: "system", content: "", marker: true },
    { identifier: "charDescription", name: "Char", role: "system", content: "", marker: true },
    { identifier: "personaDescription", name: "Persona", role: "system", content: "", marker: true },
    { identifier: "style", name: "Style", role: "system", content: "Write in {{tense}} tense." },
    { identifier: "gated", name: "Gated", role: "system", content: "Gated text." },
    { identifier: "off", name: "Off", role: "system", content: "Never sent." },
    { identifier: "chatHistory", name: "Chat history", marker: true },
  ],
  prompt_order: [{
    character_id: 100001,
    order: [
      ...["main", "worldInfoBefore", "charDescription", "personaDescription", "style", "gated"].map((identifier) => ({ identifier, enabled: true })),
      { identifier: "off", enabled: false },
      { identifier: "chatHistory", enabled: true },
    ],
  }],
  studio: {
    sections: [{ id: "gated", condition: "tense==present" }],
    variables: [
      { id: "v1", name: "tense", label: "Tense", type: "choice", defaultValue: "", choices: [{ id: "past", label: "Past", value: "past" }, { id: "present", label: "Present", value: "present" }], defaults: ["past"] },
    ],
  },
};
const BOOK = {
  id: "b", name: "City", settings: {},
  entries: [
    { uid: 1, title: "Tower", keys: ["tower"], content: "The tower is old.", enabled: true, order: 100, position: "before_char" },
    { uid: 2, title: "River", keys: ["river"], content: "The river is cold.", enabled: true, order: 100, position: "before_char" },
  ],
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-board-"));
  for (const d of ["characters/aria", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "presets", "fx.json"), JSON.stringify(PRESET));
  fs.writeFileSync(path.join(root, "lorebooks", "b.json"), JSON.stringify(BOOK));
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista who hums.", first_mes: "Hi." }));
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "Taras", description: "A tired courier." }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

function host() {
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
const call = (method: string, p: string, body?: unknown) =>
  (eng.handleRoute({ method, path: p, query: {}, body }, host()) as { json: Record<string, any> }).json;

// like the chat() helper in the sources test, but the meta may also carry a promptBoard
function chat(promptBoard?: unknown, messages?: { role: string; content: string }[]): string {
  const meta = call("POST", "/chats", { characterId: "aria", presetId: "fx" }).meta as { id: string };
  const file = path.join(root, "chats", meta.id + ".meta.json");
  const extra = promptBoard === undefined ? {} : { promptBoard };
  const chatData = JSON.parse(fs.readFileSync(file, "utf8"));
  if (messages) {
    const lines = messages.map((m, i) => JSON.stringify({ id: "m" + i, role: m.role, name: m.role === "user" ? "Taras" : "Aria", text: m.content }));
    fs.writeFileSync(path.join(root, "chats", meta.id + ".jsonl"), lines.join("\n") + "\n");
  }
  fs.writeFileSync(file, JSON.stringify({ ...chatData, lorebookIds: ["b"], ...extra }));
  return meta.id;
}
const preview = (chatId: string, userText: string) => call("POST", "/prompt/preview", { chatId, userText }) as unknown as Preview;
const allText = (p: Preview) => [p.systemPrompt ?? "", ...p.messages.map((m) => m.content)].join("\n");

describe("prompt board", () => {
  it("cleanPromptBoard: junk in, null out; bad keys dropped; dedupe keeps order", () => {
    expect(eng.cleanPromptBoard(null)).toBe(null);
    expect(eng.cleanPromptBoard("style")).toBe(null);
    expect(eng.cleanPromptBoard(3)).toBe(null);
    expect(eng.cleanPromptBoard(["databank"])).toBe(null);
    // only well-formed keys survive, in order, without duplicates
    expect(eng.cleanPromptBoard({ off: ["section:style", "nope", "book:", "section:", "plugin:bogus", "databank", "databank"] }))
      .toEqual({ v: 1, off: ["section:style", "databank"] });
    // the chat history marker is never allowed, not even as a duplicate among good keys
    expect(eng.cleanPromptBoard({ off: ["section:chatHistory"] })).toBe(null);
    expect(eng.cleanPromptBoard({ v: 7, off: ["plugin:litopys", "plugin:relations", "section:chatHistory", "section:main", "book:b", "authorNote"] }))
      .toEqual({ v: 1, off: ["plugin:litopys", "plugin:relations", "section:main", "book:b", "authorNote"] });
  });

  it("cleanPromptBoard: default history dropped, odd values fall back, real history kept", () => {
    expect(eng.cleanPromptBoard({ history: { lastN: 0, only: "all", thinking: true } })).toBe(null);
    expect(eng.cleanPromptBoard({ history: { lastN: -5, only: "weird", thinking: "yes" } })).toBe(null);
    expect(eng.cleanPromptBoard({ off: ["authorNote"], history: { lastN: 40, only: "char", thinking: false } }))
      .toEqual({ v: 1, off: ["authorNote"], history: { lastN: 40, only: "char", thinking: false } });
  });

  it("a section switched off is absent from the text and named in omitted; the rest is unchanged", () => {
    const base = preview(chat(), "Hello.");
    const p = preview(chat({ v: 1, off: ["section:style"] }), "Hello.");
    expect(allText(p)).not.toContain("Write in");
    const off = p.sources.omitted.find((x) => x.label === "FX · Style")!;
    expect([off.kind, off.reason]).toEqual(["preset", "off for this chat"]);
    expect(off.key).toBe("section:style");
    // same request as without a board, minus the Style part
    expect(p.sources.parts.map((x) => [x.kind, x.label, x.text]))
      .toEqual(base.sources.parts.map((x) => [x.kind, x.label, x.text]).filter((x) => x[1] !== "FX · Style"));
  });

  it("a marker section off: the card description is not sent", () => {
    const p = preview(chat({ v: 1, off: ["section:charDescription"] }), "Hello.");
    expect(allText(p)).not.toContain("A barista who hums.");
    const off = p.sources.omitted.find((x) => x.label === "FX · Char")!;
    expect([off.kind, off.reason]).toEqual(["preset", "off for this chat"]);
    expect(off.key).toBe("section:charDescription");
    // the persona and the greeting still arrive
    expect(allText(p)).toContain("A tired courier.");
    expect(allText(p)).toContain("Hi.");
  });

  it("an absent board and an empty board give the same request", () => {
    const a = preview(chat(), "Look at the tower.");
    const b = preview(chat({}), "Look at the tower.");
    expect(b.messages).toEqual(a.messages);
    expect(b.systemPrompt).toEqual(a.systemPrompt);
    expect(b.sources.parts).toEqual(a.sources.parts);
    expect(b.sources.omitted).toEqual(a.sources.omitted);
  });

  it("a lorebook switched off is not scanned at all", () => {
    const p = preview(chat({ v: 1, off: ["book:b"] }), "Look at the tower.");
    expect(allText(p)).not.toContain("The tower is old.");
    expect(p.sources.parts.some((x) => x.kind === "lorebook")).toBe(false);
    const off = p.sources.omitted.find((x) => x.reason === "off for this chat")!;
    expect([off.kind, off.label, off.key]).toEqual(["lorebook", "City", "book:b"]);
  });

  it("the chat history marker itself stays on", () => {
    const p = preview(chat({ v: 1, off: ["section:chatHistory"] }), "Hello.");
    expect(p.sources.parts.some((x) => x.kind === "history")).toBe(true);
    expect(allText(p)).toContain("Hello.");
  });
});

describe("prompt board: keys, board list, history filter", () => {
  it("every part has a key except utility kinds; preset sections, lorebook, history are keyed", () => {
    const p = preview(chat(), "Look at the tower.");
    const parts = p.sources.parts;
    // sections
    for (const part of parts.filter((x) => x.kind === "preset")) {
      expect(part.key).toBeString();
      expect(part.key.startsWith("section:")).toBe(true);
    }
    // lorebook
    for (const part of parts.filter((x) => x.kind === "lorebook")) {
      expect(part.key).toBe("book:b");
    }
    // history
    for (const part of parts.filter((x) => x.kind === "history")) {
      expect(part.key).toBe("history");
    }
    // utility kinds have no key
    for (const part of parts.filter((x) => ["newChatMarker", "groupNudge", "hint", "prefill"].includes(x.kind))) {
      expect(part.key).toBeUndefined();
    }
  });

  it("sources.board lists all sections in order with states, lorebook, and the four fixed keys", () => {
    const p = preview(chat(), "Hello.");
    const board = p.sources.board;
    expect(board).toBeArray();
    // preset order: main, worldInfoBefore, charDescription, personaDescription, style, gated, off, chatHistory
    const presetKeys = board.filter((x) => x.key.startsWith("section:") || x.key === "history").map((x) => x.key);
    expect(presetKeys).toEqual([
      "section:main",
      "section:worldInfoBefore",
      "section:charDescription",
      "section:personaDescription",
      "section:style",
      "section:gated",
      "section:off",
      "history",
    ]);
    // check states
    const main = board.find((x) => x.key === "section:main")!;
    expect(main.state).toBe("on");
    const off = board.find((x) => x.key === "section:off")!;
    expect(off.state).toBe("preset-off");
    const gated = board.find((x) => x.key === "section:gated")!;
    expect(gated.state).toBe("condition");
    const history = board.find((x) => x.key === "history")!;
    expect(history.kind).toBe("history");
    expect(history.state).toBe("on");

    // lorebook
    const book = board.find((x) => x.key === "book:b")!;
    expect(book).toEqual({ key: "book:b", label: "City", kind: "lorebook", state: "on" });

    // last eight fixed keys
    const fixed = board.slice(-8).map((x) => x.key);
    expect(fixed).toEqual(["databank", "authorNote", "plugin:litopys", "plugin:relations", "plugin:said", "plugin:cardmemory", "plugin:cardhabits", "plugin:recollections"]);
    const authorNote = board.find((x) => x.key === "authorNote")!;
    expect(authorNote.state).toBe("empty");
  });

  it("a section switched off by chat has state off", () => {
    const p = preview(chat({ v: 1, off: ["section:style"] }), "Hello.");
    const style = p.sources.board.find((x) => x.key === "section:style")!;
    expect(style.state).toBe("off");
  });

  it("history filter lastN:2 sends only last 2 and omits the rest", () => {
    const chatId = chat(
      { v: 1, history: { lastN: 2 } },
      [
        { role: "user", content: "First user" },
        { role: "char", content: "First char" },
        { role: "user", content: "Second user" },
        { role: "char", content: "Second char" },
        { role: "user", content: "Third user" },
        { role: "char", content: "Third char" },
      ]
    );
    const p = preview(chatId, "Final user");
    // the last 2 of the history: the last reply and the turn being previewed
    expect(p.sources.parts.filter((x) => x.kind === "history").length).toBe(2);
    const text = allText(p);
    for (const gone of ["First user", "First char", "Second user", "Second char", "Third user"]) expect(text).not.toContain(gone);
    expect(text).toContain("Third char");
    expect(text).toContain("Final user");

    const omitted = p.sources.omitted.find((x) => x.key === "history")!;
    expect(omitted).toBeDefined();
    expect(omitted.reason).toContain("history filter: last 2");
  });

  it("history filter only:user sends no character replies", () => {
    const chatId = chat(
      { v: 1, history: { only: "user" } },
      [
        { role: "user", content: "User one" },
        { role: "char", content: "Char one" },
        { role: "user", content: "User two" },
        { role: "char", content: "Char two" },
      ]
    );
    const p = preview(chatId, "User three");
    const text = allText(p);
    expect(text).toContain("User one");
    expect(text).toContain("User two");
    expect(text).not.toContain("Char one");
    expect(text).not.toContain("Char two");
    const omitted = p.sources.omitted.find((x) => x.key === "history")!;
    expect(omitted.reason).toContain("only the player");
  });

  it("history filter thinking:false removes think blocks but keeps the rest", () => {
    const chatId = chat(
      { v: 1, history: { thinking: false } },
      [
        { role: "user", content: "User one" },
        { role: "char", content: "Before <think>secret stuff\nmore</think> After <THINKING>also secret</THINKING>" },
        { role: "user", content: "User two" },
        { role: "char", content: "Char two" },
      ]
    );
    const p = preview(chatId, "User three");
    const text = allText(p);
    expect(text).toMatch(/Before\s+After/);
    expect(text).not.toContain("secret");
    expect(text).not.toContain("<think");
    // no omitted row for stripped thinking
    const omitted = p.sources.omitted.find((x) => x.key === "history");
    expect(omitted).toBeUndefined();
  });

  it("without promptBoard.history all messages are sent", () => {
    const chatId = chat(
      undefined,
      [
        { role: "user", content: "User one" },
        { role: "char", content: "Char one" },
        { role: "user", content: "User two" },
        { role: "char", content: "Char two" },
      ]
    );
    const p = preview(chatId, "User three");
    const text = allText(p);
    expect(text).toContain("User one");
    expect(text).toContain("Char one");
    expect(text).toContain("User two");
    expect(text).toContain("Char two");
    const omitted = p.sources.omitted.find((x) => x.key === "history");
    expect(omitted).toBeUndefined();
  });
});

type Hook = { llmRequest: (ctx: unknown, host: unknown) => unknown };
const lit = (await import(new URL("../plugins/litopys/plugin.js", import.meta.url).href)) as Hook;
const rel = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Hook;

describe("prompt board: plugins honour their own switch", () => {
  // a host whose files are only the chat's meta; any other read is recorded (a hook that is off reads nothing else)
  const hostWith = (off: string[]) => {
    const reads: string[] = [];
    const meta = JSON.stringify({ id: "c1", promptBoard: { v: 1, off } });
    return {
      reads,
      host: {
        log: () => {},
        fs: {
          read: (p: string) => {
            if (p === "chats/c1.meta.json") return meta;
            reads.push(p);
            throw new Error("missing");
          },
          write: () => {},
        },
      },
    };
  };
  const request = { sessionId: "c1", messages: [{ role: "user", content: "hi" }] };
  const turn = { op: "send", chatId: "c1", speakerId: "", speakerName: "" };

  it("Litopys, the card memory and the card habits all switched off returns nothing and reads nothing else", () => {
    const h = hostWith(["plugin:litopys", "plugin:cardmemory", "plugin:cardhabits"]);
    expect(lit.llmRequest({ key: "reply", request, turn }, h.host)).toBeNull();
    expect(h.reads).toEqual([]);
  });

  it("Litopys switched off alone leaves the card memory its own switch: nothing without a card, and no Litopys file read", () => {
    const h = hostWith(["plugin:litopys"]);
    expect(lit.llmRequest({ key: "reply", request, turn }, h.host)).toBeNull();
    expect(h.reads.filter((p) => p.startsWith("litopys/") && p !== "litopys/config.json")).toEqual([]);
  });

  it("the Dashboard switched off returns nothing and reads nothing else", () => {
    const h = hostWith(["plugin:relations"]);
    expect(rel.llmRequest({ key: "reply", request, turn }, h.host)).toBeNull();
    expect(h.reads).toEqual([]);
  });

  it("a switch for the other plugin does not stop a plugin from working", () => {
    const h = hostWith(["plugin:relations"]);
    lit.llmRequest({ key: "reply", request, turn }, h.host);
    expect(h.reads.length).toBeGreaterThan(0);
  });
});
