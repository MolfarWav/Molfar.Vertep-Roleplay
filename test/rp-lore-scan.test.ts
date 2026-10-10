/**
 * Lorebook scanner (0.9.4): Cyrillic word forms in keys, the reasons an entry
 * fired or was held back, minActivations, the keyword-test route.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lore-scan-"));
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

type Row = { title: string; via?: string; key?: string; secondary?: string[]; pass?: number; depth?: number; probability?: number; group?: string; reason?: string; detail?: unknown; winner?: string };
type Res = { fired: Row[]; skipped: Row[]; blocked: Row[]; scanDepth?: number };

async function route(p: string, body: unknown): Promise<{ status: number; json: Res }> {
  const mod = (await import(engineUrl)) as { handleRoute: Function };
  const out = mod.handleRoute({ method: "POST", path: p, query: {}, body }, host()) as { status?: number; json: Res };
  return { status: out.status ?? 200, json: out.json };
}

let uid = 0;
const entry = (title: string, keys: string[], extra: Record<string, unknown> = {}) =>
  ({ uid: uid++, title, keys, content: title + " content.", enabled: true, order: 100, position: "before_char", ...extra });
const book = (entries: Record<string, unknown>[], settings: Record<string, unknown> = {}) => ({ id: "b", name: "Book", settings, entries });
const test = (text: string, entries: Record<string, unknown>[], settings: Record<string, unknown> = {}) =>
  route("/wi-test", { text, books: [book(entries, settings)] }).then((r) => r.json);
const titles = (rows: Row[]) => rows.map((r) => r.title).sort();

describe("Cyrillic keys: word forms", () => {
  it("one base form hits the inflected forms", async () => {
    const r = await test("Вони підійшли до Вежі, а потім побачили вежу знову.", [entry("Tower", ["вежа"])]);
    expect(titles(r.fired)).toEqual(["Tower"]);
    expect(r.fired[0]!.via).toBe("key");
    expect(r.fired[0]!.key).toBe("вежа");
  });

  it("a multi-word key is a phrase: side by side, in order, any form", async () => {
    const e = [entry("Red tower", ["Червона Вежа"])];
    expect(titles((await test("Шлях до Червоної Вежі довгий.", e)).fired)).toEqual(["Red tower"]);
    expect((await test("Червоне вино стояло. Вежа мовчала.", e)).fired).toHaveLength(0);
    expect((await test("Вежа червона.", e)).fired).toHaveLength(0);
  });

  it("short keys match whole words only, never inside a longer word", async () => {
    const e = [entry("Cat", ["кіт"])];
    expect((await test("Він зняв кітель.", e)).fired).toHaveLength(0);
    expect(titles((await test("Чорний кіт спав.", e)).fired)).toEqual(["Cat"]);
  });

  it("a key does not fire on an unrelated word with a similar start", async () => {
    const r = await test("Він купив ворону на ринку.", [entry("Gate", ["ворота"])]);
    expect(r.fired).toHaveLength(0);
  });

  it("apostrophe variants are one word", async () => {
    const r = await test("Пахло мʼятою.", [entry("Mint", ["м'ята"])]);
    expect(titles(r.fired)).toEqual(["Mint"]);
  });

  it("Russian keys too, and ё is е", async () => {
    const r = await test("Они вошли в тёмный лес и нашли ключ от башни.", [entry("Tower RU", ["башня"]), entry("Forest", ["темный лес"])]);
    expect(titles(r.fired)).toEqual(["Forest", "Tower RU"]);
  });

  it("word forms switch off per entry and per book", async () => {
    const text = "Біля вежі.";
    expect((await test(text, [entry("Off", ["вежа"], { wordFormsOverride: false })])).fired).toHaveLength(0);
    expect((await test(text, [entry("Book off", ["вежа"])], { wordForms: false })).fired).toHaveLength(0);
    // the entry override wins over the book
    expect(titles((await test(text, [entry("On", ["вежа"], { wordFormsOverride: true })], { wordForms: false })).fired)).toEqual(["On"]);
  });

  it("regex keys stay regex", async () => {
    const r = await test("Біля вежі.", [entry("Rx", ["/веж[аі]/"])]);
    expect(titles(r.fired)).toEqual(["Rx"]);
  });

  it("Latin keys keep whole-word matching; other scripts get Unicode word boundaries", async () => {
    expect((await test("The towers rose.", [entry("Tower", ["tower"])])).fired).toHaveLength(0);
    expect(titles((await test("Byli w Kraków wczoraj.", [entry("Krakow", ["Kraków"])])).fired)).toEqual(["Krakow"]);
    expect((await test("Krakówek.", [entry("Krakow", ["Kraków"])])).fired).toHaveLength(0);
  });

  it("whole words off still lets a Cyrillic key match inside a word", async () => {
    const r = await test("Драконячий хвіст.", [entry("Dragon", ["дракон"], { wholeWordsOverride: false })]);
    expect(titles(r.fired)).toEqual(["Dragon"]);
  });

  it("book-level case sensitivity applies (it was read from the book name before)", async () => {
    expect((await test("a tower", [entry("Tower", ["Tower"])], { caseSensitive: true })).fired).toHaveLength(0);
    expect(titles((await test("a Tower", [entry("Tower", ["Tower"])], { caseSensitive: true })).fired)).toEqual(["Tower"]);
  });
});

describe("why an entry fired or was held back", () => {
  it("secondary keys: the hits are named, a failed logic is a reason", async () => {
    const r = await test("Маг піднявся на вежу.", [
      entry("And any", ["вежа"], { secondaryKeys: ["маг", "дракон"], selectiveLogic: "AND_ANY" }),
      entry("And all", ["вежа"], { secondaryKeys: ["маг", "дракон"], selectiveLogic: "AND_ALL" }),
    ]);
    expect(titles(r.fired)).toEqual(["And any"]);
    expect(r.fired[0]!.secondary).toEqual(["маг"]);
    const b = r.blocked.find((x) => x.title === "And all")!;
    expect(b.reason).toBe("secondary");
    expect(b.detail).toBe("AND_ALL");
  });

  it("constant, recursion pass and probability (dry run never rolls)", async () => {
    const r = await test("Нічого особливого.", [
      entry("Always", [], { status: "constant", content: "Тут живе мельник." }),
      entry("Miller", ["мельник"], { probability: 30 }),
    ]);
    const always = r.fired.find((x) => x.title === "Always")!;
    const miller = r.fired.find((x) => x.title === "Miller")!;
    expect(always.via).toBe("constant");
    expect(always.pass).toBe(0);
    expect(miller.pass).toBe(1);
    expect(miller.probability).toBe(30);
  });

  it("a group loser names the group and the winner", async () => {
    const r = await test("Вежа.", [
      entry("Winner", ["вежа"], { group: "towers", groupPrioritize: true }),
      entry("Loser", ["вежа"], { group: "towers" }),
    ]);
    expect(titles(r.fired)).toEqual(["Winner"]);
    expect(r.fired[0]!.group).toBe("towers");
    const b = r.blocked.find((x) => x.title === "Loser")!;
    expect(b).toMatchObject({ reason: "group", detail: "towers", winner: "Winner" });
  });

  it("delay and budget", async () => {
    const big = "x".repeat(40000);
    const r = await test("Вежа.", [
      entry("Later", ["вежа"], { delay: 5 }),
      entry("Huge", ["вежа"], { content: big, order: 1 }),
      entry("Small", ["вежа"], { order: 200 }),
    ]);
    expect(r.blocked.find((x) => x.title === "Later")).toMatchObject({ reason: "delay", detail: 5 });
    expect(r.skipped.find((x) => x.title === "Huge")).toMatchObject({ reason: "budget" });
    expect(titles(r.fired)).toEqual(["Small"]);
  });

  it("an entry whose keys do not hit is not listed at all", async () => {
    const r = await test("Ліс.", [entry("Later", ["вежа"], { delay: 5 })]);
    expect(r.blocked).toHaveLength(0);
  });

  it("wi-test needs books", async () => {
    expect((await route("/wi-test", { text: "x" })).status).toBe(400);
  });
});

describe("minActivations", () => {
  const seedChat = (texts: string[], minActivations: number) => {
    fs.writeFileSync(path.join(root, "lorebooks", "b.json"), JSON.stringify(book([entry("Tower", ["вежа"])], { scanDepth: 2, minActivations })));
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({ id: "c1", lorebookIds: ["b"], presetId: "default" }));
    fs.writeFileSync(path.join(root, "chats", "c1.jsonl"), texts.map((t, i) => JSON.stringify({ id: "m" + i, role: i % 2 ? "char" : "user", text: t })).join("\n") + "\n");
  };
  const msgs = ["Ми бачили вежу.", "Так.", "Далі.", "Ще далі.", "І ще.", "Кінець."];

  it("without it, an old mention outside the scan depth does not fire", async () => {
    seedChat(msgs, 0);
    const r = (await route("/wi-status", { chatId: "c1" })).json;
    expect(r.fired).toHaveLength(0);
    expect(r.scanDepth).toBe(2);
  });

  it("with it, the scan goes deeper until enough entries fired", async () => {
    seedChat(msgs, 1);
    const r = (await route("/wi-status", { chatId: "c1" })).json;
    expect(titles(r.fired)).toEqual(["Tower"]);
    expect(r.fired[0]!.depth).toBe(6);
    expect(r.scanDepth).toBe(6);
  });

  it("stops at the end of the history when the target is never reached", async () => {
    seedChat(["Нічого.", "Зовсім."], 3);
    const r = (await route("/wi-status", { chatId: "c1" })).json;
    expect(r.fired).toHaveLength(0);
    expect(r.scanDepth).toBe(2);
  });
});

describe("the app's book adapter keeps what it does not edit", () => {
  it("unknown fields, uids, imported case/whole-word flags and recursion levels survive a save", async () => {
    (globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
    const { engineLorebookToUI, lorebookToEngine } = await import("../src/lib/engine");
    const file = {
      name: "Imported", extensions: { st: 1 }, settings: {},
      entries: [
        { uid: 7, keys: ["a"], content: "A", caseSensitive: true, matchWholeWords: false, groupOverride: true, delayUntilRecursion: 2, extensions: { depth: 3 } },
        { uid: 3, keys: ["b"], content: "B", wordFormsOverride: false, scanDepthOverride: 9 },
      ],
    };
    const ui = engineLorebookToUI(file as never, "imp");
    // reorder in the editor and add a new entry
    ui.entries = [ui.entries[1]!, ui.entries[0]!, { ...ui.entries[0]!, id: "new", uid: undefined, title: "New" }];
    const out = lorebookToEngine(ui) as unknown as { extensions: unknown; entries: Record<string, unknown>[] };
    expect(out.extensions).toEqual({ st: 1 });
    expect(out.entries.map((e) => e.uid)).toEqual([3, 7, 8]);
    const a = out.entries[1]!;
    expect(a).toMatchObject({ caseSensitiveOverride: true, wholeWordsOverride: false, groupPrioritize: true, delayUntilRecursion: 2, extensions: { depth: 3 } });
    expect(a.caseSensitive).toBeUndefined();
    expect(out.entries[0]).toMatchObject({ wordFormsOverride: false, scanDepthOverride: 9 });
  });
});

describe("fields the scanner used to ignore", () => {
  const seed = (bookSettings: Record<string, unknown>, entries: Record<string, unknown>[], extra: { tags?: string[]; mes_example?: string; prompts?: unknown[]; authorNote?: string; formatTemplate?: string; studio?: Record<string, unknown>; more?: Record<string, unknown>[] } = {}) => {
    fs.mkdirSync(path.join(root, "characters", "olena"), { recursive: true });
    fs.writeFileSync(path.join(root, "characters", "olena", "card.json"), JSON.stringify({
      spec: "chara_card_v2", name: "Олена", description: "d", personality: "", scenario: "", first_mes: "", mes_example: extra.mes_example ?? "",
      tags: extra.tags ?? [], studio: extra.studio ?? {},
    }));
    fs.writeFileSync(path.join(root, "lorebooks", "b.json"), JSON.stringify({ ...book(entries, bookSettings), formatTemplate: extra.formatTemplate ?? "" }));
    for (const b of extra.more ?? []) fs.writeFileSync(path.join(root, "lorebooks", (b.id as string) + ".json"), JSON.stringify(b));
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({
      id: "c1", characterId: "olena", lorebookIds: ["b", ...(extra.more ?? []).map((b) => b.id)], presetId: "default",
      ...(extra.authorNote ? { authorNote: extra.authorNote } : {}),
    }));
    fs.writeFileSync(path.join(root, "chats", "c1.jsonl"), [
      JSON.stringify({ id: "m0", role: "user", name: "Вей", text: "Ми біля вежі." }),
      JSON.stringify({ id: "m1", role: "char", name: "Олена", charId: "olena", text: "Так, біля вежі." }),
    ].join("\n") + "\n");
    if (extra.prompts) {
      fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: extra.prompts, prompt_order: [], openai_max_context: 8192, openai_max_tokens: 512 }));
    }
  };
  const status = () => route("/wi-status", { chatId: "c1" }).then((r) => r.json);
  const preview = async () => {
    const r = await route("/prompt/preview", { chatId: "c1" });
    const j = r.json as unknown as { systemPrompt?: string; messages: { role: string; content: string }[] };
    return [j.systemPrompt ?? "", ...j.messages.map((m) => m.content)].join("\n----\n");
  };

  it("character filter: listed names/ids/tags only, or everyone but them", async () => {
    seed({}, [
      entry("For Olena", ["вежа"], { characterFilter: ["Олена"] }),
      entry("For others", ["вежа"], { characterFilter: ["olena"], characterFilterExclude: true }),
      entry("By tag", ["вежа"], { tagFilter: ["маг"] }),
    ], { tags: ["Маг"] });
    const r = await status();
    expect(titles(r.fired)).toEqual(["By tag", "For Olena"]);
    expect(r.blocked.find((x) => x.title === "For others")).toMatchObject({ reason: "character" });
  });

  it("trigger filter: generation types", async () => {
    seed({}, [entry("On continue", ["вежа"], { triggerFilters: ["continue"] }), entry("On send", ["вежа"], { triggerFilters: ["normal"] })]);
    const r = await status();
    expect(titles(r.fired)).toEqual(["On send"]);
    expect(r.blocked.find((x) => x.title === "On continue")).toMatchObject({ reason: "trigger", detail: "continue" });
  });

  it("include names: the speaker's name is in the scan", async () => {
    seed({ includeNames: true }, [entry("Olena", ["Олена"])]);
    expect(titles((await status()).fired)).toEqual(["Olena"]);
    seed({ includeNames: false }, [entry("Olena", ["Олена"])]);
    expect((await status()).fired).toHaveLength(0);
  });

  it("group scoring keeps the member whose keys hit most", async () => {
    seed({ groupScoring: true }, [
      entry("One key", ["вежа", "дракон"], { group: "g" }),
      entry("Two keys", ["вежа", "біля"], { group: "g" }),
    ]);
    const r = await status();
    expect(titles(r.fired)).toEqual(["Two keys"]);
  });

  it("insertion strategy: character books first, then by order", async () => {
    const globalBook = { id: "g1", name: "Global", globalActive: true, settings: {}, entries: [entry("Global low", ["вежа"], { order: 1 })] };
    seed({ insertionStrategy: "character_first" }, [entry("Char high", ["вежа"], { order: 500 })], { studio: { linkedLorebookIds: ["b"] }, more: [globalBook] });
    expect((await status()).fired.map((x) => x.title)).toEqual(["Char high", "Global low"]);
    seed({ insertionStrategy: "evenly" }, [entry("Char high", ["вежа"], { order: 500 })], { studio: { linkedLorebookIds: ["b"] }, more: [globalBook] });
    expect((await status()).fired.map((x) => x.title)).toEqual(["Global low", "Char high"]);
  });

  it("format template wraps each entry of the book", async () => {
    seed({}, [entry("T", ["вежа"], { content: "Вежа стара." })], { formatTemplate: "[Лор: {{original}}]" });
    expect(await preview()).toContain("[Лор: Вежа стара.]");
  });

  it("example and author's-note positions land around the examples and the note", async () => {
    seed({}, [
      entry("EM", ["вежа"], { content: "EM-ENTRY", position: "before_em" }),
      entry("AN", ["вежа"], { content: "AN-ENTRY", position: "after_an" }),
    ], { mes_example: "<START>\nEXAMPLE-TEXT", authorNote: "NOTE-TEXT" });
    const out = await preview();
    expect(out).toMatch(/EM-ENTRY\n\[Example Chat\]\nEXAMPLE-TEXT/);
    expect(out).toMatch(/NOTE-TEXT\nAN-ENTRY/);
  });

  it("an author's-note entry without a note still goes in", async () => {
    seed({}, [entry("AN", ["вежа"], { content: "AN-ALONE", position: "before_an" })]);
    expect(await preview()).toContain("AN-ALONE");
  });

  it("a preset without the world-info markers no longer drops the entries", async () => {
    seed({}, [entry("B", ["вежа"], { content: "BEFORE-ENTRY" }), entry("A", ["вежа"], { content: "AFTER-ENTRY", position: "after_char" })], {
      prompts: [
        { identifier: "main", name: "Main", role: "system", content: "MAIN", enabled: true },
        { identifier: "chatHistory", name: "History", marker: true, enabled: true },
      ],
    });
    const out = await preview();
    expect(out).toContain("BEFORE-ENTRY");
    expect(out).toContain("AFTER-ENTRY");
  });

  it("a world-info marker with its own text keeps the entries under it", async () => {
    seed({}, [entry("B", ["вежа"], { content: "BEFORE-ENTRY" })], {
      prompts: [
        { identifier: "worldInfoBefore", name: "WI", marker: true, role: "system", content: "WORLD:", enabled: true },
        { identifier: "chatHistory", name: "History", marker: true, enabled: true },
      ],
    });
    expect(await preview()).toMatch(/WORLD:\nBEFORE-ENTRY/);
  });
});

describe("card export carries the card's own book", () => {
  it("a V2 envelope with character_book that imports back with positions, filters and the studio bag", async () => {
    (globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
    const { characterToExportCard, engineLorebookToUI, cardToCharacter } = await import("../src/lib/engine");
    const book = engineLorebookToUI({
      name: "Olena lore", settings: { scanDepth: 6, recursiveScan: true },
      entries: [
        { uid: 4, title: "Tower", keys: ["вежа"], content: "Вежа стара.", position: "before_an", characterFilter: ["Олена"], triggerFilters: ["normal"], delayUntilRecursion: 2 },
      ],
    } as never, "olena-book");
    const ch = cardToCharacter({ spec: "chara_card_v2", name: "Олена", description: "d", studio: { embeddedLorebookId: "olena-book", expressions: [{ id: "x1", name: "joy", url: "data:image/png;base64,AA" }] } } as never, "olena");
    const card = characterToExportCard(ch, [book]) as unknown as { spec: string; name: string; data: { name: string; character_book: { entries: unknown[] }; studio: unknown } };
    expect(card.spec).toBe("chara_card_v2");
    expect(card.name).toBe("Олена");
    expect(card.data.character_book.entries).toHaveLength(1);

    const stUrl = new URL("../plugins/studio-import/plugin.js", import.meta.url).href;
    const mod = (await import(stUrl)) as { handleRoute: Function };
    const out = mod.handleRoute({ method: "POST", path: "/import/batch", query: {}, body: { cards: [card] } }, host()) as { json: { characters: string[] } };
    const cid = out.json.characters[0]!;
    const saved = JSON.parse(fs.readFileSync(path.join(root, "characters", cid, "card.json"), "utf8"));
    expect(saved.studio.expressions[0]).toMatchObject({ name: "joy", url: "data:image/png;base64,AA" });
    const bookFile = JSON.parse(fs.readFileSync(path.join(root, "lorebooks", saved.studio.embeddedLorebookId + ".json"), "utf8"));
    expect(bookFile.entries[0]).toMatchObject({ keys: ["вежа"], position: "before_an", characterFilter: ["Олена"], triggerFilters: ["normal"], delayUntilRecursion: 2 });
  });
});

describe("data bank", () => {
  const call = async (method: string, p: string, body?: unknown, query: Record<string, string> = {}) => {
    const mod = (await import(engineUrl)) as { handleRoute: Function };
    const out = mod.handleRoute({ method, path: p, query, body }, host()) as { status?: number; json: Record<string, unknown> };
    return { status: out.status ?? 200, json: out.json };
  };
  const upload = (name: string, content: string, scope = "global", scopeTargetId?: string) =>
    call("POST", "/databank", { name, content, scope, scopeTargetId }).then((r) => (r.json.file as { id: string }).id);
  const search = (q: string, chatId?: string) =>
    call("GET", "/databank/search", undefined, { q, ...(chatId ? { chatId } : {}) }).then((r) => r.json.results as { fileName: string; text: string }[]);
  const seedChat = (id: string, characterId: string) => {
    fs.mkdirSync(path.join(root, "characters", characterId), { recursive: true });
    fs.writeFileSync(path.join(root, "characters", characterId, "card.json"), JSON.stringify({ spec: "chara_card_v2", name: characterId, description: "" }));
    fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ id, characterId, lorebookIds: [], presetId: "default" }));
    fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), "");
  };

  it("word forms: a query form finds the other forms; stopwords do not count", async () => {
    await upload("City", "Старе місто стоїть на пагорбі. У місті є ринок і собор.");
    expect((await search("що сталося в місті")).map((r) => r.fileName)).toEqual(["City"]);
    expect(await search("що як але")).toHaveLength(0);
  });

  it("no substring false hits", async () => {
    await upload("Firm", "Компанія торгувала сукном і вином уздовж ріки.");
    expect(await search("пан")).toHaveLength(0);
  });

  it("scope: a chat file only in its chat, a character file only with its character", async () => {
    seedChat("c1", "aria");
    seedChat("c2", "bran");
    await upload("Chat notes", "Кампанія біля фортеці.", "chat", "c1");
    await upload("Aria book", "Фортеця Арії на скелі.", "character", "aria");
    await upload("World", "Фортеця стоїть віками.");
    const names = async (chatId: string) => (await search("фортеця", chatId)).map((r) => r.fileName).sort();
    expect(await names("c1")).toEqual(["Aria book", "Chat notes", "World"]);
    expect(await names("c2")).toEqual(["World"]);
    expect((await search("фортеця")).length).toBe(3);
  });

  it("chunks end on a sentence or word boundary", async () => {
    const sentence = "Вартові змінюються щоночі біля брами. ";
    const id = await upload("Long", sentence.repeat(80));
    const file = JSON.parse(fs.readFileSync(path.join(root, "databank", id + ".json"), "utf8")) as { chunks: { text: string }[] };
    expect(file.chunks.length).toBeGreaterThan(1);
    for (const c of file.chunks.slice(0, -1)) expect(c.text.trimEnd().endsWith(".")).toBe(true);
  });

  it("the prompt names the source of each passage", async () => {
    seedChat("c1", "aria");
    fs.writeFileSync(path.join(root, "chats", "c1.jsonl"), JSON.stringify({ id: "m0", role: "user", name: "U", text: "Розкажи про фортецю." }) + "\n");
    await upload("World", "Фортеця стоїть віками на скелі над морем.");
    const r = await call("POST", "/prompt/preview", { chatId: "c1" });
    const all = JSON.stringify(r.json);
    expect(all).toContain("[World #1]");
  });
});

describe("review fixes", () => {
  it("an entry's case override beats a case-sensitive book", async () => {
    const r = await test("a tower", [entry("Blind", ["Tower"], { caseSensitiveOverride: false })], { caseSensitive: true });
    expect(titles(r.fired)).toEqual(["Blind"]);
  });

  it("min-activations rounds keep an entry's own shorter scan depth", async () => {
    fs.writeFileSync(path.join(root, "lorebooks", "b.json"), JSON.stringify(book([
      entry("Short", ["вежа"], { scanDepthOverride: 1 }),
      entry("Filler", ["нічогонемає"]),
    ], { scanDepth: 1, minActivations: 2 })));
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({ id: "c1", lorebookIds: ["b"], presetId: "default" }));
    fs.writeFileSync(path.join(root, "chats", "c1.jsonl"), ["Біля вежі.", "Далі.", "Ще."].map((t, i) => JSON.stringify({ id: "m" + i, role: "user", text: t })).join("\n") + "\n");
    const r = (await route("/wi-status", { chatId: "c1" })).json;
    expect(r.fired).toHaveLength(0);
    expect(r.scanDepth).toBe(3);
  });
});

describe("translate (llm provider)", () => {
  it("a long text goes in pieces and comes back stitched in order", async () => {
    const mod = (await import(engineUrl)) as { handleRoute: Function };
    const h = host() as ReturnType<typeof host> & { llm: { request: Function; results: Record<string, unknown> } };
    const reqs: { key: string; text: string }[] = [];
    h.llm.request = (key: string, r: { messages: { content: string }[] }) => { reqs.push({ key, text: r.messages[1]!.content }); };
    const para = (n: number) => "Абзац " + n + ". " + "слово ".repeat(120).trim();
    const text = Array.from({ length: 12 }, (_, i) => para(i)).join("\n\n");
    const call = { method: "POST", path: "/translate", query: {}, body: { text, target: "English", provider: "llm" } };
    const first = mod.handleRoute(call, h) as { __llmPending?: boolean };
    expect(first.__llmPending).toBe(true);
    expect(reqs.length).toBeGreaterThan(2);
    for (const r of reqs) h.llm.results[r.key] = { text: "EN<" + r.text.trim().slice(0, 8) + ">", model: "m" };
    const out = mod.handleRoute(call, h) as { json: { text: string } };
    expect(out.json.text.startsWith("EN<Абзац 0.>")).toBe(true);
    expect(out.json.text.split("EN<").length - 1).toBe(reqs.length);
    expect(out.json.text).toContain(">\n\nEN<");
  });
});

describe("wi-status before the first send", () => {
  it("scans the card's own book and global books though the chat has no stored scope", async () => {
    fs.mkdirSync(path.join(root, "characters", "olena"), { recursive: true });
    fs.writeFileSync(path.join(root, "characters", "olena", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Олена", description: "", studio: { embeddedLorebookId: "own" } }));
    fs.writeFileSync(path.join(root, "lorebooks", "own.json"), JSON.stringify({ id: "own", name: "Own", settings: {}, entries: [entry("Own", ["вежа"])] }));
    fs.writeFileSync(path.join(root, "lorebooks", "glob.json"), JSON.stringify({ id: "glob", name: "Glob", globalActive: true, settings: {}, entries: [entry("Glob", [], { status: "constant" })] }));
    fs.writeFileSync(path.join(root, "lorebooks", "other.json"), JSON.stringify({ id: "other", name: "Other", settings: {}, entries: [entry("Other", ["вежа"])] }));
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), JSON.stringify({ id: "c1", characterId: "olena", presetId: "default" }));
    fs.writeFileSync(path.join(root, "chats", "c1.jsonl"), JSON.stringify({ id: "m0", role: "char", name: "Олена", text: "Біля вежі." }) + "\n");
    const r = (await route("/wi-status", { chatId: "c1" })).json;
    expect(titles(r.fired)).toEqual(["Glob", "Own"]);
  });
});
