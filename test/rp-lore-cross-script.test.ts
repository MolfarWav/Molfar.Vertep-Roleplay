/**
 * Lorebook keys across scripts (Molfar.Vertep#254): "Каел" in the chat fires the key "Kael" and the other way round, by the
 * phonetic spelling, whole words only, under the book's word-forms switch.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { regTranslit } from "../src/lib/entity-registry.js";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lore-xs-"));
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

type Row = { title: string; key?: string };
async function fired(text: string, entries: Record<string, unknown>[], settings: Record<string, unknown> = {}): Promise<string[]> {
  const mod = (await import(engineUrl)) as { handleRoute: Function };
  const out = mod.handleRoute({ method: "POST", path: "/wi-test", query: {}, body: { text, books: [{ id: "b", name: "Book", settings, entries }] } }, host()) as { json: { fired: Row[] } };
  return out.json.fired.map((r) => r.title).sort();
}
let uid = 0;
const entry = (title: string, keys: string[], extra: Record<string, unknown> = {}) =>
  ({ uid: uid++, title, keys, content: title + " content.", enabled: true, order: 100, position: "before_char", ...extra });

describe("a Latin key meets the name in Cyrillic", () => {
  const e = () => [entry("Kael", ["Kael"])];
  it("fires on the name in any case of the sentence", async () => {
    expect(await fired("Каел зайшов до зали.", e())).toEqual(["Kael"]);
    expect(await fired("Вона подивилась на Каела.", e())).toEqual(["Kael"]);
    expect(await fired("Він віддав ключ Каелу.", e())).toEqual(["Kael"]);
    expect(await fired("Каэль молча кивнул.", e())).toEqual(["Kael"]);
  });
  it("an ending that is a vowel of the name: Kaede / Каеде / Каеди", async () => {
    const k = [entry("Kaede", ["Kaede"])];
    expect(await fired("Каеде усміхнулась.", k)).toEqual(["Kaede"]);
    expect(await fired("Голос Каеди дрижав.", k)).toEqual(["Kaede"]);
  });
  it("a phrase key: every word, side by side, in order", async () => {
    const k = [entry("Lord Kael", ["Lord Kael"])];
    expect(await fired("Лорд Каел підняв голову.", k)).toEqual(["Lord Kael"]);
    expect(await fired("Лорд мовчав, а Каел пішов.", k)).toEqual([]);
  });
  it("a different sound is a different name", async () => {
    expect(await fired("Кейл зайшов до зали.", e())).toEqual([]);
    expect(await fired("Каелен зайшов до зали.", e())).toEqual([]);
    expect(await fired("Каелінг зайшов.", e())).toEqual([]);
  });
  it("short words never cross: a 3-letter key stays exact", async () => {
    expect(await fired("Син зайшов до зали.", [entry("Sin", ["Sin"])])).toEqual([]);
    expect(await fired("Мир усім.", [entry("Mir", ["Mir"])])).toEqual([]);
    expect(await fired("Мира зайшла.", [entry("Mira", ["Mira"])])).toEqual(["Mira"]);
    expect(await fired("Мир усім.", [entry("Mira", ["Mira"])])).toEqual([]);
  });
});

describe("a Cyrillic key meets the name in Latin", () => {
  it("fires on the Latin spelling, with an English possessive", async () => {
    const e = [entry("Каел", ["Каел"])];
    expect(await fired("Kael walked in.", e)).toEqual(["Каел"]);
    expect(await fired("They followed Kael's tracks.", e)).toEqual(["Каел"]);
    expect(await fired("Kaelen walked in.", e)).toEqual([]);
  });
  it("a Cyrillic key with an ending still finds the plain Latin name", async () => {
    expect(await fired("Kaede smiled.", [entry("Каеде", ["Каеде"])])).toEqual(["Каеде"]);
  });
});

describe("the switch and the other key kinds", () => {
  it("follows the word-forms switch of the book and of the entry", async () => {
    const text = "Каел зайшов до зали.";
    expect(await fired(text, [entry("Kael", ["Kael"])], { wordForms: false })).toEqual([]);
    expect(await fired(text, [entry("Kael", ["Kael"], { wordFormsOverride: false })])).toEqual([]);
    expect(await fired(text, [entry("Kael", ["Kael"], { wordFormsOverride: true })], { wordForms: false })).toEqual(["Kael"]);
  });
  it("regex keys and case-sensitive entries are left as they are", async () => {
    expect(await fired("Каел зайшов.", [entry("Rx", ["/kael/"])])).toEqual([]);
    expect(await fired("Каел зайшов.", [entry("Cs", ["Kael"], { caseSensitiveOverride: true })])).toEqual([]);
  });
  it("secondary keys cross too, and a key in the same script still wins as before", async () => {
    expect(await fired("Каел і вежа.", [entry("Pair", ["Kael"], { secondaryKeys: ["вежа"], selectiveLogic: 0 })])).toEqual(["Pair"]);
    expect(await fired("Kael came.", [entry("Plain", ["Kael"])])).toEqual(["Plain"]);
    expect(await fired("The towers rose.", [entry("Tower", ["tower"])])).toEqual([]);
  });
});

describe("the engine's phonetic spelling agrees with the registry's", () => {
  it("the same key for the same words", async () => {
    // the registry's own examples: equal keys across scripts
    for (const [a, b] of [["Kaede", "Каеде"], ["Isabella", "Ізабелла"], ["Ember", "Ембер"], ["Rhea", "Рея"], ["Geralt", "Геральт"], ["Denis", "Денис"], ["Sina", "Сіна"], ["Saki", "Сакі"]]) {
      expect(regTranslit(a!)).toBe(regTranslit(b!));
      // and the engine's scanner agrees: the Latin key fires on the Cyrillic word
      expect(await fired(`Прийшов ${b}.`, [entry("n", [a!])])).toEqual(["n"]);
    }
  });
});
