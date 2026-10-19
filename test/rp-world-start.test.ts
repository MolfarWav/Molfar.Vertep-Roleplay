// World DM P3 stage 3: building a world from the chat's cards (recipes, sources, chunks, build prompts).
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyLevel, buildInput, chunkSources, dmInput, handleRoute, listRecipes, recipeOf, startPlan, startSources } from "../plugins/world/plugin.js";

function memFs(files: Record<string, string> = {}) {
  return {
    read: (p: string) => {
      if (!(p in files)) throw new Error("ENOENT " + p);
      return files[p]!;
    },
    write: (p: string, s: string) => { files[p] = s; },
    remove: (p: string) => { delete files[p]; },
    list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
  };
}
const J = (v: unknown) => JSON.stringify(v);

describe("world start: recipes", () => {
  it("lists the built-ins, lets a file replace one and adds the player's own", () => {
    const fsx = memFs({
      "world/recipes/interview.json": J({ name: "My interview", questions: [{ id: "genre", text: "Genre?" }], sections: [{ id: "all", prompt: "Build it.", kinds: ["place", "nope"], max: 99 }] }),
      "world/recipes/heist.json": J({ name: "Heist", sections: [{ prompt: "Crew and target." }], fronts: { count: 20 } }),
      "world/recipes/broken.json": J({ name: "No sections" }),
      "world/recipes/Bad Id.json": J({ sections: [{ prompt: "x" }] }),
    });
    const list = listRecipes(fsx);
    expect(list.map((r) => r.id)).toEqual(["from-cards", "interview", "heist"]);
    const iv = recipeOf(fsx, "interview")!;
    expect(iv.name).toBe("My interview");
    expect(iv.builtin).toBe(true);
    expect(iv.sections[0]).toEqual({ id: "all", kinds: ["place"], max: 8, prompt: "Build it." });
    const heist = recipeOf(fsx, "heist")!;
    expect(heist.builtin).toBe(false);
    expect(heist.fronts.count).toBe(8);
    expect(heist.sections[0]!.kinds).toEqual(["person", "place", "group", "thing", "fact"]);
  });
});

describe("world start: sources", () => {
  const files = () => ({
    "chats/c1.meta.json": J({ id: "c1", groupId: "g1", worldBookId: "world-c1" }),
    "groups/g1.json": J({ name: "Crew", memberIds: ["a", "b"], scenario: "A ship at sea.", linkedLorebookIds: ["sea"] }),
    "characters/a/card.json": J({ name: "Anna", description: "A sailor.", personality: "Bold.", scenario: "", studio: { embeddedLorebookId: "sea", linkedLorebookIds: ["port"] } }),
    "characters/b/card.json": J({ data: { name: "Bohdan", description: "The cook." } }),
    "lorebooks/sea.json": J({ name: "Sea", entries: [{ title: "Storm", content: "Storms come at night." }, { title: "Off", enabled: false, content: "hidden" }] }),
    "lorebooks/port.json": J({ name: "Port", entries: [{ keys: ["Odesa"], content: "The port city." }] }),
    "lorebooks/world-c1.json": J({ name: "World", ownerChatId: "c1", entries: [{ content: "never read" }] }),
  });
  it("reads card fields, the group's scenario and each book once, never the world book", () => {
    const fsx = memFs(files());
    const parts = startSources(fsx, JSON.parse(fsx.read("chats/c1.meta.json")), undefined);
    expect(parts.map((p) => p.label)).toEqual(["Anna: description", "Anna: personality", "Bohdan: description", "Crew: scenario", "Sea: Storm", "Port: Odesa"]);
    expect(parts.some((p) => p.text === "hidden" || p.text === "never read")).toBe(false);
  });
  it("limits to the chosen cards", () => {
    const fsx = memFs(files());
    const parts = startSources(fsx, { groupId: "g1" }, ["b"]);
    expect(parts.map((p) => p.label)).toEqual(["Bohdan: description", "Crew: scenario", "Sea: Storm"]);
  });
});

describe("world start: chunks", () => {
  it("packs parts under the limit, cut between parts", () => {
    const parts = [1, 2, 3].map((i) => ({ label: "p" + i, text: "x".repeat(2500) }));
    const chunks = chunkSources(parts, 6000);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.startsWith("[p1]")).toBe(true);
    expect(chunks[1]!.startsWith("[p3]")).toBe(true);
  });
  it("splits a long part at sentence ends, every piece labelled and under the limit", () => {
    const chunks = chunkSources([{ label: "short", text: "Hi." }, { label: "long", text: "One sentence here. ".repeat(800) }], 6000);
    expect(chunks.every((c) => c.length <= 6000)).toBe(true);
    expect(chunks[0]!.startsWith("[short]")).toBe(true);
    expect(chunks.slice(1).every((c) => c.startsWith("[long]"))).toBe(true);
    for (const c of chunks) expect(c.trimEnd().endsWith(".")).toBe(true);
    expect(chunks.join("").split("One sentence here.").length - 1).toBe(800);
  });
});

describe("world start: plan and input", () => {
  const fsx = memFs();
  it("one call per section and chunk, then fronts", () => {
    const fromCards = recipeOf(fsx, "from-cards")!;
    expect(startPlan(fromCards, ["a", "b"], true)).toEqual([{ section: "world", chunk: 0 }, { section: "world", chunk: 1 }, { fronts: true }]);
    expect(startPlan(fromCards, ["a"], false)).toEqual([{ section: "world", chunk: 0 }]);
    expect(startPlan(recipeOf(fsx, "interview")!, [], false).map((s) => s.section)).toEqual(["places", "people", "facts"]);
  });
  it("carries the answers, the known records and the task", () => {
    const recipe = recipeOf(fsx, "interview")!;
    const text = buildInput({
      cards: ["Anna"], userName: "Taras", recipe, section: recipe.sections[0], chunk: "", lang: "Ukrainian",
      answers: { genre: "dark fantasy", tone: "", extra: "a cursed well" },
      entities: [{ id: "n1", kind: "place", name: "Ruins", aliases: [], text: "Old ruins.", status: "active" }],
    });
    expect(text).toContain("- Genre: dark fantasy");
    expect(text).toContain("- Anything else the world must have: a cursed well");
    expect(text).not.toContain("- Tone:");
    expect(text).toContain("n1 · place · Ruins: Old ruins.");
    expect(text).toContain("Kinds: place. At most 5 records.");
    expect(text).toContain("Write names and text in Ukrainian.");
    expect(text).not.toContain("Texts to learn from");
  });
});

// ---------- routes ----------

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const eng = (await import(engineUrl)) as { handleRoute: Function };

let root: string;
let results: Record<string, unknown>;
let requests: { key: string; spec: Record<string, any> }[];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "world-start-"));
  for (const d of ["characters/odarka", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), J({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "characters", "odarka", "card.json"), J({ spec: "chara_card_v2", name: "Odarka", description: "A witch of the pass.", scenario: "At the card's hut.", first_mes: "Hi, {{user}}.", studio: { linkedLorebookIds: ["pass"] } }));
  fs.writeFileSync(path.join(root, "lorebooks", "pass.json"), J({ id: "pass", name: "Pass", entries: [{ uid: 1, title: "Red Tower", content: "A tower up the pass.", enabled: true }] }));
  fs.writeFileSync(path.join(root, "settings.json"), J({ model: null }));
  results = {};
  requests = [];
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
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
}
const engine = (method: string, p: string, body?: unknown) => (eng.handleRoute({ method, path: p, query: {}, body }, host()) as { json: Record<string, any> }).json;
const world = (method: string, p: string, body?: unknown, query: Record<string, string> = {}) => {
  const r = handleRoute({ method, path: p, query, body }, host()) as any;
  return r.json ?? r;
};
const readRel = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const newChat = () => engine("POST", "/chats", { characterId: "odarka" }).meta.id as string;
const allText = (p: any) => [p.systemPrompt ?? "", ...p.messages.map((m: any) => m.content)].join("\n");

/** Run a start to its end: each step answers with the next reply of the list. */
function runStart(chatId: string, replies: string[]) {
  let out: any;
  for (const text of replies) {
    for (const k of Object.keys(results)) delete results[k];
    results.world_build = { text, model: "b/build", genTimeMs: 10 };
    out = world("POST", "/world/start", { chatId });
  }
  return out;
}

describe("world start: draft from the cards", () => {
  it("begins a draft, builds it step by step, accepts it minus what the player dropped", () => {
    const id = newChat();
    world("PUT", "/world/settings", { chatId: id, level: "living" });
    const begun = world("POST", "/world/start", { chatId: id, begin: true, recipe: "from-cards", lang: "Ukrainian" });
    expect(begun.draft).toMatchObject({ recipe: "from-cards", total: 2, done: 0 });
    // the first pass asks the build model, with the card and its book
    const pending = world("POST", "/world/start", { chatId: id });
    expect(pending.__llmPending).toBe(true);
    expect(requests[0]!.spec.messages[0].content).toContain("[Pass: Red Tower]");
    expect(requests[0]!.spec.messages[0].content).toContain("Write names and text in Ukrainian.");
    const out = runStart(id, [
      J({ add: [{ kind: "place", name: "Red Tower", text: "A tower." }, { kind: "person", name: "Odarka", text: "skip" }, { kind: "person", name: "Maksym", text: "The toll keeper." }] }),
      J({ fronts: [{ name: "The toll", goal: "Close the pass.", size: 4 }] }),
    ]);
    expect(out.draft.done).toBe(2);
    expect(out.draft.entities.map((e: any) => [e.id, e.name])).toEqual([["d1", "Red Tower"], ["d2", "Maksym"]]);
    expect(out.draft.fronts.map((f: any) => f.name)).toEqual(["The toll"]);
    // the world stays empty until the player accepts
    expect(world("GET", "/world/peek", undefined, { chatId: id }).records ?? []).toEqual([]);
    const done = world("PUT", "/world/draft", { chatId: id, op: "accept", drop: { entities: ["d2"] } });
    expect(done.added).toBe(1);
    const state = readRel("world/state/" + id + ".json");
    expect(state.entities.map((e: any) => e.name)).toEqual(["Red Tower"]);
    expect(state.fronts.map((f: any) => [f.id, f.name, f.size])).toEqual([["f1", "The toll", 4]]);
    expect(state.origin).toMatchObject({ kind: "cards", recipe: "from-cards" });
    expect(state.draft).toBeUndefined();
    expect(readRel("chats/" + id + ".meta.json").worldBookId).toBe("world-" + id);
    expect(readRel("world/state/" + id + ".json").log.filter((r: any) => r.reason === "start").length).toBe(2);
  });

  it("a failed step keeps its place and says why; the next call tries it again", () => {
    const id = newChat();
    world("POST", "/world/start", { chatId: id, begin: true });
    results.world_build = { text: "", reasoning: "hmm", model: "b/x" };
    results.world_build_retry = { text: "not json at all", model: "b/x" };
    const failed = handleRoute({ method: "POST", path: "/world/start", query: {}, body: { chatId: id }, stash: { retry: true } }, host()) as any;
    expect(failed.json.ok).toBe(false);
    expect(failed.json.code).toBe("not-json");
    expect(failed.json.draft.done).toBe(0);
    const out = runStart(id, [J({ add: [{ kind: "place", name: "Red Tower", text: "A tower." }] })]);
    expect(out.draft.done).toBe(1);
    expect(out.draft.error).toBeNull();
  });

  it("refuses cards with nothing to read, and a draft that is not there", () => {
    fs.writeFileSync(path.join(root, "characters", "odarka", "card.json"), J({ name: "Odarka" }));
    const id = newChat();
    expect(world("POST", "/world/start", { chatId: id, begin: true }).code).toBe("no-text");
    expect(world("PUT", "/world/draft", { chatId: id, op: "accept" }).error).toBe("no draft");
  });
});

describe("world start: the events deck", () => {
  it("is built at start when asked, and a run's event comes only from it, used up once sent", () => {
    const id = newChat();
    world("PUT", "/world/settings", { chatId: id, level: "director" });
    world("POST", "/world/start", { chatId: id, begin: true, deck: true });
    runStart(id, [
      J({ add: [{ kind: "place", name: "Red Tower", text: "A tower." }] }),
      J({ fronts: [] }),
      "Here: " + J({ deck: [{ text: "A courier arrives." }, { text: "The bridge burns." }] }),
    ]);
    world("PUT", "/world/draft", { chatId: id, op: "accept" });
    const s = readRel("world/state/" + id + ".json");
    expect(s.deck).toEqual([{ id: "e1", text: "A courier arrives." }, { id: "e2", text: "The bridge burns." }]);
    const input = dmInput({ cards: [], userName: "", entities: [], msgs: [], level: "director", fronts: [], event: null, direction: null, threads: [], options: { clocks: "model", clockEvery: 6, eventByClock: false, deck: true }, deck: s.deck });
    expect(input).toContain("e2 · The bridge burns.");
    const st = { ...s, event: null };
    applyLevel(st, { event: { text: "Made up" } }, { level: "director", useDeck: true });
    expect(st.event).toBeNull();
    applyLevel(st, { event: { deck: "e2" } }, { level: "director", useDeck: true });
    expect(st.event.text).toBe("The bridge burns.");
    expect(st.deck.map((c: any) => c.id)).toEqual(["e1"]);
  });
});

describe("world library and carry", () => {
  it("saves a chat's world, carries it into a new chat with its clocks, and resets the run fields", () => {
    const id = newChat();
    fs.mkdirSync(path.join(root, "world", "state"), { recursive: true });
    fs.writeFileSync(path.join(root, "world", "state", id + ".json"), J({
      chatId: id, settings: { level: "living", everyN: 3 }, lastKey: "m9#0", lastRunAt: 5, event: { text: "x", sent: 0 },
      entities: [{ id: "n1", kind: "place", name: "Red Tower", aliases: [], text: "A tower.", status: "active", uid: 4 }],
      fronts: [{ id: "f1", name: "The toll", goal: "Close it.", clock: 3, size: 6, status: "active" }], deck: [{ id: "e1", text: "A courier." }],
    }));
    const saved = world("POST", "/world/library", { chatId: id, name: "The pass" });
    expect(saved.worlds[0]).toMatchObject({ name: "The pass", records: 1, fronts: 1, deck: 1, level: "living" });
    const to = newChat();
    const carried = world("POST", "/world/carry", { toChatId: to, worldId: saved.id });
    expect(carried.ok).toBe(true);
    const s = readRel("world/state/" + to + ".json");
    expect(s.settings).toMatchObject({ level: "living", everyN: 3 });
    expect(s.fronts[0].clock).toBe(3);
    expect(s.lastKey).toBeNull();
    expect(s.event).toBeNull();
    expect(s.lastRunAt).toBeUndefined();
    expect(s.deck).toEqual([{ id: "e1", text: "A courier." }]);
    expect(s.origin).toMatchObject({ kind: "library", worldId: saved.id });
    expect(readRel("lorebooks/world-" + to + ".json").ownerChatId).toBe(to);
    // a chat that has a world already is refused unless replace
    expect(world("POST", "/world/carry", { toChatId: to, fromChatId: id }).code).toBe("has-world");
    expect(world("POST", "/world/carry", { toChatId: to, fromChatId: id, replace: true }).ok).toBe(true);
    expect(world("PUT", "/world/library", { id: saved.id, name: "Renamed" }).worlds[0].name).toBe("Renamed");
    expect(world("DELETE", "/world/library", undefined, { id: saved.id }).worlds).toEqual([]);
  });
});

describe("world start: the chat's own scenario and first message", () => {
  it("the build model drafts both from the world and the card", () => {
    const id = newChat();
    fs.mkdirSync(path.join(root, "world", "state"), { recursive: true });
    fs.writeFileSync(path.join(root, "world", "state", id + ".json"), J({ chatId: id, entities: [{ id: "n1", kind: "place", name: "Red Tower", aliases: [], text: "A tower.", status: "active" }] }));
    expect(world("POST", "/world/opening", { chatId: id, lang: "Ukrainian" }).__llmPending).toBe(true);
    expect(requests[0]!.spec.messages[0].content).toContain("Card's first message (style only): Hi, {{user}}.");
    results.world_opening = { text: J({ scenario: "At the Red Tower.", opening: "The lantern burns, {{user}}." }) };
    expect(world("POST", "/world/opening", { chatId: id })).toMatchObject({ ok: true, scenario: "At the Red Tower.", opening: "The lantern burns, {{user}}." });
  });

  it("replaces the card's scenario in the prompt (or follows it), and the greeting gets the new first swipe", () => {
    const id = newChat();
    expect(allText(engine("POST", "/prompt/preview", { chatId: id, userText: "hi" }))).toContain("At the card's hut.");
    world("PUT", "/world/override", { chatId: id, scenario: { text: "At the Red Tower." }, opening: "The lantern burns, {{user}}." });
    let p = allText(engine("POST", "/prompt/preview", { chatId: id, userText: "hi" }));
    expect(p).toContain("At the Red Tower.");
    expect(p).not.toContain("At the card's hut.");
    world("PUT", "/world/override", { chatId: id, scenario: { text: "At the Red Tower.", mode: "append" } });
    p = allText(engine("POST", "/prompt/preview", { chatId: id, userText: "hi" }));
    expect(p).toContain("At the card's hut.");
    expect(p).toContain("At the Red Tower.");
    const msgs = fs.readFileSync(path.join(root, "chats", id + ".jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(msgs[0].swipes[0]).toMatch(/^The lantern burns, /);
    expect(msgs[0].swipes.some((t: string) => t.startsWith("Hi,"))).toBe(true);
    expect(msgs[0].swipe).toBe(0);
    world("PUT", "/world/override", { chatId: id, scenario: null });
    expect(readRel("chats/" + id + ".meta.json").worldScenario).toBeUndefined();
  });

  it("refuses a new first message once the player has written", () => {
    const id = newChat();
    fs.appendFileSync(path.join(root, "chats", id + ".jsonl"), J({ id: "u1", role: "user", text: "hello" }) + "\n");
    expect(world("PUT", "/world/override", { chatId: id, opening: "Too late." }).code).toBe("started");
  });
});

describe("world backgrounds", () => {
  it("cleans file names and tags, keeps names unique and the variants per place", async () => {
    const { cleanFile, cleanTags, cleanPlan } = await import("../plugins/world/plugin.js");
    expect(cleanFile("Red Tower!")).toBe("red_tower");
    expect(cleanFile("  --tavern--kitchen ")).toBe("tavern_kitchen");
    expect(cleanFile("Вежа")).toBe("");
    expect(cleanTags(["Night", "night", "rainy-day", "x", "a", "b", "c", "d"])).toEqual(["night", "rainy day", "x", "a", "b", "c"]);
    const places = [{ name: "Червона Вежа", text: "" }, { name: "Корчма", text: "" }];
    const plan = cleanPlan({ images: [
      { place: "Червона Вежа", file: "red_tower", tags: ["tower"], prompt: "a tower" },
      { place: "червона вежа", file: "red_tower", prompt: "a tower at night" },
      { place: "Червона Вежа", file: "red_tower_3", prompt: "too many" },
      { place: "Nowhere", file: "x", prompt: "unknown place" },
      { place: "Корчма", file: "tavern", prompt: "" },
      { place: "Корчма", file: "Tavern", prompt: "an inn" },
    ] }, places, 2, ["tavern"]);
    expect(plan.map((i: any) => [i.place, i.file])).toEqual([["Червона Вежа", "red_tower"], ["Червона Вежа", "red_tower_2"], ["Корчма", "tavern_2"]]);
  });

  it("plans a set with the build model, from the world's places", () => {
    const id = newChat();
    fs.mkdirSync(path.join(root, "world", "state"), { recursive: true });
    fs.writeFileSync(path.join(root, "world", "state", id + ".json"), J({ chatId: id, entities: [
      { id: "n1", kind: "place", name: "Червона Вежа", aliases: [], text: "A tower up the pass.", status: "active" },
      { id: "n2", kind: "person", name: "Maksym", aliases: [], text: "The toll keeper.", status: "active" },
    ] }));
    expect(world("GET", "/world/backgrounds", undefined, { chatId: id }).places).toEqual([{ name: "Червона Вежа", text: "A tower up the pass." }]);
    const body = { chatId: id, places: [{ name: "Червона Вежа", text: "A tower." }, "Корчма"], direction: "ink and watercolour", variants: 1, lang: "Ukrainian" };
    expect(world("POST", "/world/backgrounds", body).__llmPending).toBe(true);
    const sent = requests[0]!.spec.messages[0].content as string;
    expect(sent).toContain("Style direction for the whole set: ink and watercolour.");
    expect(sent).toContain("- Корчма");
    results.world_backgrounds = { text: J({ images: [{ place: "Червона Вежа", file: "red_tower", tags: ["tower", "dusk"], prompt: "a red tower at dusk" }, { place: "Корчма", file: "tavern", prompt: "a warm inn" }] }) };
    const out = world("POST", "/world/backgrounds", body);
    expect(out.ok).toBe(true);
    expect(out.images.map((i: any) => i.file)).toEqual(["red_tower", "tavern"]);
  });

  it("links a folder to a chat's world and a saved world, and carry takes it with switching off by default", () => {
    const id = newChat();
    fs.mkdirSync(path.join(root, "world", "state"), { recursive: true });
    fs.writeFileSync(path.join(root, "world", "state", id + ".json"), J({ chatId: id, entities: [{ id: "n1", kind: "place", name: "Tower", aliases: [], text: "A tower.", status: "active" }] }));
    expect(world("PUT", "/world/backgrounds", { chatId: id, folderId: "fold_w" }).folderId).toBe("fold_w");
    const saved = world("POST", "/world/library", { chatId: id });
    expect(saved.worlds[0].backgroundFolderId).toBe("fold_w");
    const to = newChat();
    world("POST", "/world/carry", { toChatId: to, worldId: saved.id });
    expect(readRel("world/state/" + to + ".json").backgroundFolderId).toBe("fold_w");
    expect(readRel("chats/" + to + ".meta.json").autoBackground).toEqual({ on: false, folderId: "fold_w" });
    world("PUT", "/world/config", { autoBackground: true });
    const to2 = newChat();
    world("POST", "/world/carry", { toChatId: to2, fromChatId: id });
    expect(readRel("chats/" + to2 + ".meta.json").autoBackground).toEqual({ on: true, folderId: "fold_w" });
    expect(world("PUT", "/world/backgrounds", { worldId: saved.id, folderId: null }).folderId).toBeNull();
  });

  it("offers the card books' entries as places, and the build model finds the places the cards name", () => {
    const id = newChat();
    const got = world("GET", "/world/backgrounds", undefined, { chatId: id });
    expect(got.fromBooks).toEqual([{ name: "Red Tower", text: "A tower up the pass.", book: "Pass" }]);
    expect(world("POST", "/world/backgrounds/places", { chatId: id }).__llmPending).toBe(true);
    const ask = requests.at(-1)!.spec.messages[0].content as string;
    expect(ask).toContain("A witch of the pass.");
    results.world_places = { text: J({ places: [{ name: "The hut", text: "A hut on the pass." }, { name: "the hut", text: "dup" }, { name: "" }] }), model: "b/build" };
    const found = world("POST", "/world/backgrounds/places", { chatId: id });
    expect(found.places).toEqual([{ name: "The hut", text: "A hut on the pass." }]);
  });
  it("a vision model names an image", () => {
    const img = { data: "aGk=", mimeType: "image/webp" };
    expect(world("POST", "/world/backgrounds/name", { image: img, hint: "IMG_2041" }).__llmPending).toBe(true);
    expect(requests[0]!.spec.images).toEqual([img]);
    expect(requests[0]!.spec.model).toBeUndefined();
    results.world_name = { text: '```json\n{"file":"Forest Path","tags":["forest","day"]}\n```' };
    expect(world("POST", "/world/backgrounds/name", { image: img })).toMatchObject({ ok: true, file: "forest_path", tags: ["forest", "day"] });
    expect(world("POST", "/world/backgrounds/name", { image: { data: "x", mimeType: "text/html" } }).error).toBe("image required");
  });
});
