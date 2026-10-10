/**
 * Prompt sources (0.9.7): assemble() says where each part of the request came from (card fields,
 * persona, preset sections, lorebook entries, history), what was left out and why, and the preset's
 * choices; the peek route locates every part in the text it returns.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
type Engine = typeof import("../plugins/engine/plugin.js");
const eng = (await import(engineUrl)) as Engine;

type Part = { kind: string; label: string; detail?: string; text: string; located: boolean };
type Preview = {
  messages: { role: string; content: string }[];
  systemPrompt?: string;
  sources: { parts: Part[]; omitted: { kind: string; label: string; reason: string }[]; vars: { name: string; value: string }[] };
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-sources-"));
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

function chat(): string {
  const meta = call("POST", "/chats", { characterId: "aria", presetId: "fx" }).meta as { id: string };
  const file = path.join(root, "chats", meta.id + ".meta.json");
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), lorebookIds: ["b"] }));
  return meta.id;
}
const preview = (chatId: string, userText: string) => call("POST", "/prompt/preview", { chatId, userText }) as unknown as Preview;
const textAt = (p: Preview, msg: number) => (msg === -1 ? p.systemPrompt ?? "" : p.messages[msg]!.content);

describe("prompt sources", () => {
  it("labels card, persona, preset sections, lorebook entries and history, and finds each one", () => {
    const p = preview(chat(), "Look at the tower.");
    const labels = p.sources.parts.map((x) => [x.kind, x.label]);
    expect(labels).toContainEqual(["preset", "FX · Main"]);
    expect(labels).toContainEqual(["card", "Aria · description"]);
    expect(labels).toContainEqual(["persona", "Persona · Taras"]);
    expect(labels).toContainEqual(["preset", "FX · Style"]);
    expect(labels).toContainEqual(["lorebook", "City · Tower"]);
    expect(labels).toContainEqual(["history", "Aria · #1"]);
    expect(labels).toContainEqual(["history", "Taras · #2"]);
    expect(p.sources.parts.find((x) => x.label === "City · Tower")!.detail).toBe("key: tower");
    // every part is located, and each span holds exactly the part's text
    expect(p.sources.parts.filter((x) => !x.located).map((x) => x.label)).toEqual([]);
    for (const s of p.sourceSpans) expect(textAt(p, s.msg).slice(s.start, s.end)).toBe(p.sources.parts[s.part]!.text);
  });

  it("lists what was left out and why, and the choices in effect", () => {
    const p = preview(chat(), "Hello.");
    const omitted = p.sources.omitted.map((x) => [x.label, x.reason]);
    expect(omitted).toContainEqual(["FX · Off", "switched off"]);
    expect(omitted).toContainEqual(["FX · Gated", "condition: tense==present"]);
    // no entry fired without its key
    expect(p.sources.parts.some((x) => x.kind === "lorebook")).toBe(false);
    expect(p.sources.vars).toContainEqual({ name: "tense", value: "Past" });
  });

  it("names the regex scripts that changed a history message", () => {
    fs.writeFileSync(path.join(root, "regex", "r1.json"), JSON.stringify({
      id: "r1", scriptName: "Shout", findRegex: "hello", flags: "g", replaceString: "HELLO", placement: ["user_input"], promptOnly: true,
    }));
    const p = preview(chat(), "hello there");
    const user = p.sources.parts.find((x) => x.kind === "history" && x.label === "Taras · #2")!;
    expect(user.text).toContain("HELLO");
    expect(user.detail).toBe("regex: Shout");
  });

  it("regex speed-ups keep results: literal heads, alternation, case, a cached list", () => {
    expect(eng.literalHead("<solatag[\\s\\S]{0,50000}?<\\/solatag>")).toBe("<solatag");
    expect(eng.literalHead("<\\/date>")).toBe("</date>");
    expect(eng.literalHead("<\\s{0,8}story_notes")).toBe("<");
    expect(eng.literalHead("ab?c")).toBe("a");
    expect(eng.literalHead("abc|xyz")).toBe("");
    expect(eng.literalHead("x(a|b)y[|]")).toBe("x");
    expect(eng.literalHead("Time:\\s*(Dusk)")).toBe("Time:");
    const write = (id: string, findRegex: string, flags: string, replaceString: string) =>
      fs.writeFileSync(path.join(root, "regex", id + ".json"), JSON.stringify({ id, scriptName: id, findRegex, flags, replaceString, placement: ["user_input"], promptOnly: true }));
    write("alt", "abc|xyz", "g", "ALT");
    write("case", "<DATE>[\\s\\S]*?<\\/date>", "gi", "");
    write("absent", "<solatag[\\s\\S]*?<\\/solatag>", "g", "GONE");
    const id = chat();
    const p = preview(id, "xyz then <date>Day 3</date> end");
    const user = p.sources.parts.find((x) => x.label === "Taras · #2")!;
    expect(user.text).toBe("ALT then  end");
    expect(user.detail).toBe("regex: alt, case");
    // a second preview in a new pass reads the scripts again (an edited script applies)
    write("alt", "abc|xyz", "g", "ALT2");
    expect(preview(id, "xyz").sources.parts.find((x) => x.label === "Taras · #2")!.text).toBe("ALT2");
  });

  it("the locator: in order, unclaimed, short texts only as whole messages", () => {
    const sources = { parts: [{ text: "Hi" }, { text: "A long enough text" }, { text: "Hi" }, { text: "zz" }] };
    const r = eng.locateSources(sources, "A long enough text", [{ content: "Hi" }, { content: "Hi" }]);
    expect(r.located).toEqual([true, true, true, false]);
    expect(r.spans).toEqual([
      { msg: -1, start: 0, end: 18, part: 1 },
      { msg: 0, start: 0, end: 2, part: 0 },
      { msg: 1, start: 0, end: 2, part: 2 },
    ]);
  });
});
