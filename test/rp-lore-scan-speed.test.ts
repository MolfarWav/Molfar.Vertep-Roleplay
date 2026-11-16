/**
 * The lorebook scan answers whole-word keys from the window's runs of letters, checks an apostrophe key where its first
 * part occurs, and builds the word index only for a key that needs it (Molfar.Vertep#422: a send of a long Ukrainian
 * chat spent 6 s of the sandbox's 7 s in the scan). Same answers as before: checked here against the pattern the scan
 * used to run, over random texts and keys.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lore-speed-"));
  for (const d of ["characters", "personas", "presets", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null }));
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], openai_max_context: 8192, openai_max_tokens: 512 }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

const host = () => ({
  fs: {
    root,
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => fs.writeFileSync(path.resolve(root, rel), content, "utf8"),
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
  store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
  llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  log: () => {},
});

async function fired(text: string, entries: Record<string, unknown>[], settings: Record<string, unknown> = {}): Promise<string[]> {
  const mod = (await import(engineUrl)) as { handleRoute: (req: unknown, host: unknown) => unknown };
  const out = mod.handleRoute({ method: "POST", path: "/wi-test", query: {}, body: { text, books: [{ id: "b", name: "Book", settings, entries }] } }, host()) as { json: { fired: { title: string }[] } };
  return out.json.fired.map((r) => r.title).sort();
}
let uid = 0;
const entry = (title: string, keys: string[], extra: Record<string, unknown> = {}) =>
  ({ uid: uid++, title, keys, content: title + " content.", enabled: true, order: 100, position: "before_char", ...extra });

describe("whole-word keys", () => {
  it("a one-word key fires on the word, not inside a longer one", async () => {
    const e = [entry("Yui", ["yui"])];
    expect(await fired("Yui waved.", e)).toEqual(["Yui"]);
    expect(await fired("Yuiko waved.", e)).toEqual([]);
    expect(await fired("ask (yui)!", e)).toEqual(["Yui"]);
  });
  it("a key of several words needs them side by side, each whole", async () => {
    const e = [entry("BF", ["her boyfriend"])];
    expect(await fired("She met her boyfriend today.", e)).toEqual(["BF"]);
    expect(await fired("She met her boyfriends today.", e)).toEqual([]);
    expect(await fired("Boyfriend of her sister.", e)).toEqual([]);
  });
  it("a hyphenated key", async () => {
    const e = [entry("Kae", ["kae-chan"])];
    expect(await fired("Hi, Kae-chan!", e)).toEqual(["Kae"]);
    expect(await fired("Hi, kae-chans!", e)).toEqual([]);
  });
  it("an apostrophe key takes any apostrophe form, whole words only", async () => {
    const e = [entry("Riku", ["riku's"])];
    expect(await fired("Riku’s bag fell.", e)).toEqual(["Riku"]);
    expect(await fired("riku`s bag fell.", e)).toEqual(["Riku"]);
    expect(await fired("Riku's", e)).toEqual(["Riku"]);
    expect(await fired("Rikus bag fell.", e)).toEqual([]);
    expect(await fired("Riku’sa bag fell.", e)).toEqual([]);
    expect(await fired("ariku's bag", e)).toEqual([]);
    expect(await fired("Riku and his bag; it is Riku's.", e)).toEqual(["Riku"]);
  });
  it("a book without whole words still finds a key inside a word", async () => {
    const e = [entry("Kae", ["kae"])];
    expect(await fired("Kaede smiled.", e, { wholeWords: false })).toEqual(["Kae"]);
    expect(await fired("Kaede smiled.", e)).toEqual([]);
  });
});

describe("Cyrillic keys and names across scripts", () => {
  it("a Cyrillic key stays silent in a text with no Cyrillic, and finds its forms in one with", async () => {
    const e = [entry("Tower", ["вежа"])];
    expect(await fired("The tower stood.", e)).toEqual([]);
    expect(await fired("Вони дійшли до вежі.", e)).toEqual(["Tower"]);
  });
  it("a Latin name in an English text fires as written; its Cyrillic form fires in a Ukrainian one", async () => {
    const e = [entry("Kael", ["Kael"])];
    expect(await fired("Kael came in.", e)).toEqual(["Kael"]);
    expect(await fired("Каел зайшов.", e)).toEqual(["Kael"]);
    expect(await fired("Kaela came in.", e)).toEqual([]);
  });
});

// The pattern the scan ran before #422, as the reference for whole-word keys.
const APOS = /['’ʼ‘`´ʹ′]/g;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const reference = (text: string, key: string) =>
  new RegExp("(^|[^\\p{L}\\p{N}])" + key.toLowerCase().split(APOS).map(esc).join("['’ʼ‘`´ʹ′]") + "([^\\p{L}\\p{N}]|$)", "u").test(text.toLowerCase());

describe("the same answers as the pattern it replaced", () => {
  it("random texts and keys", async () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 16807) % 2147483647; return seed % n; };
    const words = ["riku", "Riku", "kae", "chan", "yui", "s", "her", "boy", "friend", "boyfriend", "a", "1", "ä", "é", "мир"];
    const seps = [" ", " ", "-", "'", "’", "`", ".", ", ", "\n", "", "_"];
    const keys = ["riku", "riku's", "riku’s", "kae-chan", "her boyfriend", "yui", "boy friend", "a", "1", "s", "é", "kae chan", "friend's"];
    const make = (n: number) => { let t = ""; for (let i = 0; i < n; i++) t += words[rnd(words.length)] + seps[rnd(seps.length)]; return t; };
    let checked = 0;
    for (let round = 0; round < 60; round++) {
      const text = make(3 + rnd(12));
      const es = keys.map((k) => entry("k:" + k, [k]));
      const got = await fired(text, es);
      const want = keys.filter((k) => reference(text, k)).map((k) => "k:" + k).sort();
      expect({ text, got }).toEqual({ text, got: want });
      checked++;
    }
    expect(checked).toBe(60);
  });
});
