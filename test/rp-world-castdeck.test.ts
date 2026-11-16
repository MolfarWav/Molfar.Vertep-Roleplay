/**
 * The cast deck (#424, step 4): cards of new people the story has not met. Data first: the card shape, the settings, what a rollback
 * puts back, what a saved world and a carry bring along, and what a Start draft holds.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CAST_CARDS_MAX, CAST_SYSTEM, DEFAULT_OPTIONS, castFactions, castFrom, castInput, cleanCast, cleanCastOpts, coreOf, emptyState, handleRoute, listRecipes, nextCastId, normalizeState, recipeOf, startPlan, startSettings, tieIndex, tieOf } from "../plugins/world/plugin.js";

const J = (v: unknown) => JSON.stringify(v);
const card = (over: Record<string, unknown> = {}) => ({ id: "c1", name: "Halyna", aliases: ["Hala"], faction: "Toll guild", tie: "Maksym", want: "Wants the pass closed.", text: "A tall woman with a ledger. She counts everything.", ...over });

describe("a cast card", () => {
  it("keeps the fields it knows and cuts the rest", () => {
    const [c] = cleanCast([card({ aliases: ["a", "b", "c", "d", "e", "f"], relation: "rival", extra: 1, want: "w".repeat(500), text: "t".repeat(3000) })]);
    expect(c).toMatchObject({ id: "c1", name: "Halyna", faction: "Toll guild", tie: "Maksym", relation: "rival" });
    expect(c!.aliases).toEqual(["a", "b", "c", "d"]);
    expect(c!.want.length).toBe(200);
    expect(c!.text.length).toBe(1200);
    expect((c as any).extra).toBeUndefined();
  });

  it("needs a name and a text; a relation nobody knows is dropped; faction and tie may be empty", () => {
    const list = cleanCast([card({ name: "" }), card({ id: "c2", text: "" }), card({ id: "c3", name: "Ivan", relation: "boss", faction: "", tie: "" }), "text", null]);
    expect(list.map((c) => c.name)).toEqual(["Ivan"]);
    expect((list[0] as any).relation).toBeUndefined();
    expect(list[0]!.tie).toBe("");
  });

  it("a name is kept once, a missing or doubled id gets a new one", () => {
    const list = cleanCast([card(), card({ id: "c1", name: "Ivan" }), card({ id: "x", name: "Olha" }), card({ id: "c9", name: "halyna" })]);
    expect(list.map((c) => [c.id, c.name])).toEqual([["c1", "Halyna"], ["c2", "Ivan"], ["c3", "Olha"]]);
    expect(nextCastId(list)).toBe("c4");
    expect(nextCastId([])).toBe("c1");
  });

  it("holds at most CAST_CARDS_MAX cards", () => {
    const many = Array.from({ length: 40 }, (_, i) => card({ id: "c" + (i + 1), name: "Person " + i }));
    expect(cleanCast(many).length).toBe(CAST_CARDS_MAX);
    expect(CAST_CARDS_MAX).toBe(24);
  });
});

describe("the state and the settings", () => {
  it("an old state has no cast deck and the switch is off; a state with cards keeps them", () => {
    const old = normalizeState({ entities: [], settings: { level: "living", cast: "normal" } }, "c1");
    expect(old.cast).toBeUndefined();
    expect(old.settings).toMatchObject({ castDeck: false, castPer: 2, castLen: "normal" });
    const s = normalizeState({ settings: { castDeck: true, castPer: 9, castLen: "long" }, cast: [card()], castBuild: { n: 12 }, castLog: [{ at: 5, n: 12, added: 2, factions: ["Toll guild"], forced: true }, { n: 1 }] }, "c1");
    expect(s.cast.map((c: any) => c.name)).toEqual(["Halyna"]);
    expect(s.castBuild).toEqual({ n: 12 });
    expect(s.castLog).toEqual([{ at: 5, n: 12, added: 2, factions: ["Toll guild"], forced: true }]);
    expect(s.settings).toMatchObject({ castDeck: true, castPer: 4, castLen: "long" });
  });

  it("a new chat starts with the deck on, from the profile's option or by default", () => {
    expect(DEFAULT_OPTIONS.castDeck).toBe(true);
    expect(startSettings({ read: () => { throw new Error("none"); }, write() {}, list: () => [], remove() {} }, { ...emptyState("c1").settings }, { defaultProfile: "" } as any)).toMatchObject({ level: "chronicler", castDeck: true });
  });

  it("a rollback puts the deck, the refill state and its log back", () => {
    const s = { ...emptyState("c1"), cast: [card()], castBuild: { n: 3 }, castLog: [{ at: 1, n: 3, added: 1, factions: [] }] } as any;
    const core = coreOf(s);
    expect(Object.keys(core)).toEqual(expect.arrayContaining(["cast", "castBuild", "castLog"]));
    s.cast.pop();
    expect(core.cast.length).toBe(1);
  });

  it("a Start asks for 1 to 6 factions, 1 to 4 people each, a short, normal or long card", () => {
    expect(cleanCastOpts({})).toEqual({ factions: 3, per: 2, len: "normal" });
    expect(cleanCastOpts({ factions: 99, per: 0, len: "huge" })).toEqual({ factions: 6, per: 1, len: "normal" });
    expect(cleanCastOpts({ factions: 2, per: 9, len: "long" })).toEqual({ factions: 2, per: 4, len: "long" });
  });
});

// ---------- routes ----------

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const eng = (await import(engineUrl)) as { handleRoute: Function };

let root: string;
const results: Record<string, unknown> = {};
let requests: { key: string; spec: Record<string, any> }[] = [];
beforeEach(() => {
  requests = [];
  root = fs.mkdtempSync(path.join(os.tmpdir(), "world-castdeck-"));
  for (const d of ["characters/odarka", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), J({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "characters", "odarka", "card.json"), J({ spec: "chara_card_v2", name: "Odarka", description: "A witch of the pass.", scenario: "At the hut.", first_mes: "Hi, {{user}}." }));
  fs.writeFileSync(path.join(root, "settings.json"), J({ model: null }));
  for (const k of Object.keys(results)) delete results[k];
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
const writeState = (id: string, state: Record<string, unknown>) => {
  fs.mkdirSync(path.join(root, "world", "state"), { recursive: true });
  fs.writeFileSync(path.join(root, "world", "state", id + ".json"), J({ chatId: id, ...state }));
};

describe("the deck travels with the world", () => {
  const place = { id: "n1", kind: "place", name: "Red Tower", aliases: [], text: "A tower.", status: "active", uid: 4 };

  it("the state view says how many cards are left, not who they are", () => {
    const id = newChat();
    writeState(id, { settings: { level: "living", castDeck: true }, entities: [place], cast: [card(), card({ id: "c2", name: "Ivan" })] });
    const view = world("GET", "/world/state", undefined, { chatId: id });
    expect(view.cast).toBe(2);
    expect(JSON.stringify(view)).not.toContain("Halyna");
  });

  it("a saved world and a carry bring the cards, and the settings with them", () => {
    const id = newChat();
    writeState(id, { settings: { level: "living", castDeck: true, castPer: 3, castLen: "long" }, entities: [place], cast: [card()], castBuild: { n: 4 }, castLog: [{ at: 1, n: 4, added: 1, factions: [] }] });
    const saved = world("POST", "/world/library", { chatId: id, name: "The pass" });
    expect(saved.worlds[0]).toMatchObject({ records: 1, cast: 1 });
    const to = newChat();
    expect(world("POST", "/world/carry", { toChatId: to, worldId: saved.id }).ok).toBe(true);
    const s = readRel("world/state/" + to + ".json");
    expect(s.cast.map((c: any) => c.name)).toEqual(["Halyna"]);
    expect(s.settings).toMatchObject({ castDeck: true, castPer: 3, castLen: "long" });
    // the run fields start fresh
    expect(s.castBuild).toBeUndefined();
    expect(s.castLog).toBeUndefined();
    // from another chat too
    const to2 = newChat();
    expect(world("POST", "/world/carry", { toChatId: to2, fromChatId: id }).ok).toBe(true);
    expect(readRel("world/state/" + to2 + ".json").cast.length).toBe(1);
  });

  it("the settings route sets the switch and the numbers", () => {
    const id = newChat();
    world("PUT", "/world/settings", { chatId: id, level: "living", castDeck: true, castPer: 3, castLen: "short" });
    expect(readRel("world/state/" + id + ".json").settings).toMatchObject({ castDeck: true, castPer: 3, castLen: "short" });
    world("PUT", "/world/settings", { chatId: id, castDeck: false });
    expect(readRel("world/state/" + id + ".json").settings.castDeck).toBe(false);
  });

  it("a Start draft keeps its cards and numbers, and drops what is not a card", () => {
    const id = newChat();
    world("PUT", "/world/settings", { chatId: id, level: "living" });
    const raw = readRel("world/state/" + id + ".json");
    raw.draft = { recipe: "from-cards", steps: [{ fronts: true }, { cast: true, part: 1 }, { cast: true, part: 99 }], done: 0, cast: [card(), { name: "no text" }], castOpts: { factions: 2, per: 3, len: "short" } };
    fs.writeFileSync(path.join(root, "world", "state", id + ".json"), J(raw));
    const peeked = world("POST", "/world/start", { chatId: id, peek: true });
    expect(peeked.draft.cast.map((c: any) => c.name)).toEqual(["Halyna"]);
    expect(peeked.draft.castOpts).toEqual({ factions: 2, per: 3, len: "short" });
    expect(peeked.draft.total).toBe(3);
  });
});

// ---------- the build: factions, ties, the Start step ----------

const rec = (id: string, kind: string, name: string, text: string, extra: Record<string, unknown> = {}) => ({ id, kind, name, aliases: [] as string[], text, status: "active", uid: 0, at: 1, ...extra });
const front = (id: string, name: string, goal = "A goal.", status = "active") => ({ id, name, goal, clock: 1, size: 6, status });

describe("the factions and the ties", () => {
  it("factions are the active groups first, then the active fronts, each name once", () => {
    const list = castFactions(
      [rec("n1", "group", "Toll guild", "Keeps the tolls."), rec("n2", "person", "Maksym", "x"), rec("n3", "group", "Old guild", "gone", { status: "past" }), rec("n4", "group", "Crows", "Thieves.")],
      [front("f1", "The toll"), front("f2", "toll GUILD"), front("f3", "Dead front", "x", "past")],
    );
    expect(list.map((f) => [f.name, f.kind])).toEqual([["Toll guild", "group"], ["Crows", "group"], ["The toll", "front"]]);
  });

  it("who exists: the cards, the user's character and the active people; a tie is read by name or alias, case aside", () => {
    const index = tieIndex([rec("n1", "person", "Maksym", "x", { aliases: ["Max"] }), rec("n2", "person", "Gone", "x", { status: "past" }), rec("n3", "place", "Tower", "x")], ["Odarka"], "Taras");
    expect(index.map((x) => x.name)).toEqual(["Odarka", "Taras", "Maksym"]);
    expect(tieOf(index, "max")).toBe("Maksym");
    expect(tieOf(index, "ODARKA")).toBe("Odarka");
    expect(tieOf(index, "Gone")).toBe("");
    expect(tieOf(index, "")).toBe("");
  });
});

describe("reading a cast answer", () => {
  const entities = [rec("n1", "group", "Toll guild", "Keeps the tolls."), rec("n2", "person", "Maksym", "The toll keeper.", { aliases: ["Max"] }), rec("n3", "place", "Red Tower", "A tower.")];
  const factions = [{ name: "Toll guild", kind: "group", text: "" }, { name: "Crows", kind: "group", text: "" }];
  const ctx = { entities, index: tieIndex(entities, ["Odarka"], "Taras"), factions, per: 2, have: ["Ivan"] };
  const raw = (over: Record<string, unknown>) => ({ faction: "Toll guild", name: "Halyna", aliases: ["Hala", "Max"], tie: "Maksym", want: "Wants the pass shut.", text: "A tall woman with a ledger.", relation: "rival", ...over });

  it("keeps a card with its faction, its tie and its want; an alias the world already owns is dropped", () => {
    const [c] = castFrom({ cast: [raw({})] }, ctx);
    expect(c).toMatchObject({ id: "", name: "Halyna", faction: "Toll guild", tie: "Maksym", want: "Wants the pass shut.", relation: "rival" });
    expect(c!.aliases).toEqual(["Hala"]);
  });

  it("a tie nobody goes by stays empty; the faction may be a part of the name", () => {
    const cards = castFrom({ cast: [raw({ tie: "A stranger", faction: "the Crows" })] }, ctx);
    expect(cards[0]).toMatchObject({ tie: "", faction: "Crows" });
  });

  it("skips a faction that was not asked for, a name the world, the cards or the deck have, a card with no text, and more than per for a faction", () => {
    const out = {
      cast: [
        raw({ faction: "Merchants", name: "Wrong faction" }),
        raw({ name: "Maksym" }),
        raw({ name: "max" }),
        raw({ name: "Odarka" }),
        raw({ name: "Taras" }),
        raw({ name: "Ivan" }),
        raw({ name: "Red Tower" }),
        raw({ name: "No text", text: "" }),
        raw({ name: "One" }),
        raw({ name: "Two" }),
        raw({ name: "Three" }),
        "junk",
      ],
    };
    expect(castFrom(out, ctx).map((c) => c.name)).toEqual(["One", "Two"]);
    expect(castFrom({ cast: "x" }, ctx)).toEqual([]);
    expect(castFrom(null, ctx)).toEqual([]);
  });

  it("the call tells the model the factions, who exists, who is in the deck and how long a card is", () => {
    const text = castInput({ entities, fronts: [front("f1", "The toll")], factions, per: 2, len: "long", index: ctx.index, have: ["Ivan"], prompt: "", lang: "Ukrainian" });
    expect(text).toContain("n2 · person · Maksym");
    expect(text).toContain("- Toll guild (group)\n- Crows (group)");
    expect(text).toContain("Odarka, Taras, Maksym");
    expect(text).toContain("Already in the deck (do not repeat)\nIvan");
    expect(text).toContain("write 2 new people, 8 to 10 sentences");
    expect(text).toContain("Write names and text in Ukrainian.");
    expect(CAST_SYSTEM).toContain("tied to ONE person who already exists");
  });
});

describe("the plan and the recipe", () => {
  it("cast calls come after the fronts, one per part", () => {
    const recipe = recipeOf({ read: () => { throw new Error("none"); }, write() {}, list: () => [], remove() {} } as any, "from-cards")!;
    expect(recipe.cast).toEqual({ factions: 3, per: 2, prompt: "" });
    const steps = startPlan(recipe, [], true, 2);
    expect(steps.slice(-3)).toEqual([{ fronts: true }, { cast: true, part: 0 }, { cast: true, part: 1 }]);
    expect(startPlan(recipe, [], true).some((x: any) => x.cast)).toBe(false);
    expect(startPlan(recipe, [], false, 1).slice(-1)).toEqual([{ cast: true, part: 0 }]);
  });

  it("a recipe file sets its own numbers, kept within bounds", () => {
    const fsx = { read: (p: string) => (p === "world/recipes/heist.json" ? J({ name: "Heist", sections: [{ prompt: "Crew." }], cast: { factions: 40, per: 0, prompt: "Mind the guards." } }) : (() => { throw new Error("none"); })()), write() {}, list: (d: string) => (d === "world/recipes" ? ["heist.json"] : []), remove() {} } as any;
    expect(listRecipes(fsx).find((r: any) => r.id === "heist")!.cast).toEqual({ factions: 6, per: 1, prompt: "Mind the guards." });
  });
});

describe("a Start writes the cards", () => {
  const step = (chatId: string, text: string) => {
    for (const k of Object.keys(results)) delete results[k];
    results.world_build = { text, model: "b/build", genTimeMs: 10 };
    return world("POST", "/world/start", { chatId });
  };
  const sections = [
    J({ add: [{ kind: "group", name: "Toll guild", text: "Keeps the tolls." }, { kind: "group", name: "Crows", text: "Thieves of the road." }] }),
    J({ add: [{ kind: "person", name: "Maksym", text: "The toll keeper." }] }),
    J({ add: [] }),
    J({ fronts: [{ name: "The toll", goal: "Close the pass.", size: 4 }] }),
  ];
  const castReply = J({
    cast: [
      { faction: "Toll guild", name: "Halyna", aliases: ["Hala"], tie: "Maksym", want: "Wants the pass shut.", text: "A tall woman with a ledger.", relation: "rival" },
      { faction: "Toll guild", name: "Pavlo", tie: "Nobody", want: "Wants coin.", text: "A clerk." },
      { faction: "Crows", name: "Zoya", tie: "Odarka", want: "Wants a debt paid.", text: "A thief with a limp." },
    ],
  });

  it("by default, one call for the factions after the fronts; the cards wait in the draft with ids, and accept keeps what the player left", () => {
    const id = newChat();
    world("PUT", "/world/settings", { chatId: id, level: "living" });
    const begun = world("POST", "/world/start", { chatId: id, begin: true, recipe: "from-cards", bench: false });
    expect(begun.draft).toMatchObject({ total: 5, castOpts: { factions: 3, per: 2, len: "normal" } });
    world("POST", "/world/start", { chatId: id });
    let out: any;
    for (const r of sections) out = step(id, r);
    // the first pass of the cast step asks the build model; the second reads its answer
    requests = [];
    for (const k of Object.keys(results)) delete results[k];
    expect(world("POST", "/world/start", { chatId: id }).__llmPending).toBe(true);
    const asked = requests.find((r) => r.key.startsWith("world_build"))!.spec.messages[0].content as string;
    out = step(id, castReply);
    expect(out.draft.done).toBe(5);
    expect(asked).toContain("- Toll guild (group)");
    expect(asked).toContain("- Crows (group)");
    expect(asked).toContain("- The toll (front)");
    expect(asked).toContain("Odarka, User, Maksym");
    expect(out.draft.cast.map((c: any) => [c.id, c.name, c.faction, c.tie])).toEqual([["c1", "Halyna", "Toll guild", "Maksym"], ["c2", "Pavlo", "Toll guild", ""], ["c3", "Zoya", "Crows", "Odarka"]]);
    // nothing is in the world, and the deck has no say in the prompt, until accept
    expect(world("GET", "/world/state", undefined, { chatId: id }).cast).toBe(0);
    const done = world("PUT", "/world/draft", { chatId: id, op: "accept", drop: { cast: ["c2"] } });
    expect(done.cast).toBe(2);
    const s = readRel("world/state/" + id + ".json");
    expect(s.cast.map((c: any) => [c.id, c.name])).toEqual([["c1", "Halyna"], ["c2", "Zoya"]]);
    expect(s.settings).toMatchObject({ castDeck: true, castPer: 2, castLen: "normal" });
    expect(s.draft).toBeUndefined();
  });

  it("the player's numbers reach the call and the settings; cast: false plans no call", () => {
    const id = newChat();
    world("PUT", "/world/settings", { chatId: id, level: "living" });
    const begun = world("POST", "/world/start", { chatId: id, begin: true, recipe: "from-cards", bench: false, cast: { on: true, factions: 6, per: 3, len: "short" } });
    expect(begun.draft).toMatchObject({ total: 6, castOpts: { factions: 6, per: 3, len: "short" } });
    const off = world("POST", "/world/start", { chatId: id, begin: true, recipe: "from-cards", bench: false, cast: false });
    expect(off.draft).toMatchObject({ total: 4, castOpts: null });
    const off2 = world("POST", "/world/start", { chatId: id, begin: true, recipe: "from-cards", bench: false, cast: { on: false } });
    expect(off2.draft.total).toBe(4);
  });

  it("a world with no faction has nothing to write for: the step passes with no call", () => {
    const id = newChat();
    world("PUT", "/world/settings", { chatId: id, level: "living" });
    world("POST", "/world/start", { chatId: id, begin: true, recipe: "from-cards", bench: false });
    world("POST", "/world/start", { chatId: id });
    for (const r of [J({ add: [{ kind: "place", name: "Salt Road", text: "A road." }] }), J({ add: [] }), J({ add: [] }), J({ fronts: [] })]) step(id, r);
    requests = [];
    for (const k of Object.keys(results)) delete results[k];
    const out = world("POST", "/world/start", { chatId: id });
    expect(out.__llmPending).toBeUndefined();
    expect(out.draft.done).toBe(5);
    expect(requests.length).toBe(0);
  });

  it("a card of a name the world got meanwhile is not accepted", () => {
    const id = newChat();
    world("PUT", "/world/settings", { chatId: id, level: "living" });
    world("POST", "/world/start", { chatId: id, begin: true, recipe: "from-cards", bench: false });
    world("POST", "/world/start", { chatId: id });
    for (const r of sections) step(id, r);
    step(id, castReply);
    const raw = readRel("world/state/" + id + ".json");
    raw.entities = [rec("n1", "person", "Zoya", "Already here.")];
    raw.nextId = 2;
    fs.writeFileSync(path.join(root, "world", "state", id + ".json"), J(raw));
    world("PUT", "/world/draft", { chatId: id, op: "accept", drop: {} });
    expect(readRel("world/state/" + id + ".json").cast.map((c: any) => c.name)).toEqual(["Halyna", "Pavlo"]);
  });
});

// ---------- the refill ----------

describe("the refill", () => {
  const guild = { id: "n1", kind: "group", name: "Toll guild", aliases: [], text: "Keeps the tolls.", status: "active", uid: 0 };
  const crows = { id: "n2", kind: "group", name: "Crows", aliases: [], text: "Thieves.", status: "active", uid: 0 };
  const maksym = { id: "n3", kind: "person", name: "Maksym", aliases: [], text: "The toll keeper.", status: "active", uid: 0 };
  const on = { level: "living", cast: "normal", castDeck: true, castPer: 2, castLen: "normal" };
  const refillReply = J({ cast: [
    { faction: "Crows", name: "Zoya", tie: "Maksym", want: "A debt.", text: "A thief with a limp." },
    { faction: "Crows", name: "Yarema", tie: "Odarka", want: "A map.", text: "A fence." },
    { faction: "Toll guild", name: "Halyna", tie: "", want: "Coin.", text: "A clerk." },
  ] });
  const refill = (id: string, body: Record<string, unknown> = {}) => world("POST", "/world/cast/refill", { chatId: id, ...body });
  const answer = (id: string, text: string, body: Record<string, unknown> = {}) => {
    for (const k of Object.keys(results)) delete results[k];
    results.world_cast = { text, model: "b/build", genTimeMs: 10 };
    return refill(id, body);
  };
  const seeded = (over: Record<string, unknown> = {}) => {
    const id = newChat();
    writeState(id, { settings: on, entities: [guild, crows, maksym], nextId: 4, ...over });
    return id;
  };

  it("the view says a refill is due only when the deck is low, on, has a faction to write for and has not just been tried", () => {
    const view = (id: string) => world("GET", "/world/state", undefined, { chatId: id }).castRefill;
    expect(view(seeded())).toBe(true);
    expect(view(seeded({ cast: [card(), card({ id: "c2", name: "A", aliases: [] }), card({ id: "c3", name: "B", aliases: [] })] }))).toBe(false);
    expect(view(seeded({ settings: { ...on, castDeck: false } }))).toBe(false);
    expect(view(seeded({ settings: { ...on, cast: "off" } }))).toBe(false);
    expect(view(seeded({ entities: [maksym] }))).toBe(false);
    expect(view(seeded({ castBuild: { n: 0 } }))).toBe(false);
  });

  it("one call writes for the factions with the fewest cards; the cards merge with what the player has", () => {
    const id = seeded({ cast: [card({ id: "c1", name: "Pavlo", aliases: [], faction: "Toll guild", text: "My own edit." })] });
    requests = [];
    for (const k of Object.keys(results)) delete results[k];
    expect(refill(id).__llmPending).toBe(true);
    const asked = requests.find((r) => r.key === "world_cast")!.spec;
    expect(asked.systemPrompt).toContain("tied to ONE person who already exists");
    const content = asked.messages[0].content as string;
    expect(content).toContain("- Crows (group)\n- Toll guild (group)");
    expect(content).toContain("Already in the deck (do not repeat)\nPavlo");
    expect(content).toContain("write 2 new people");
    const r = answer(id, refillReply);
    expect(r).toMatchObject({ ok: true, added: 3, left: 4 });
    const s = readRel("world/state/" + id + ".json");
    expect(s.cast.map((c: any) => [c.id, c.name, c.tie])).toEqual([["c1", "Pavlo", "Maksym"], ["c2", "Zoya", "Maksym"], ["c3", "Yarema", "Odarka"], ["c4", "Halyna", ""]]);
    expect(s.cast[0].text).toBe("My own edit.");
    // a new chat has its first message: one reply
    expect(s.castBuild).toEqual({ n: 1 });
    expect(s.castLog).toHaveLength(1);
    expect(s.castLog[0]).toMatchObject({ added: 3, factions: ["Crows", "Toll guild"] });
    expect(s.castLog[0].forced).toBeUndefined();
    expect(s.log.at(-1)).toMatchObject({ reason: "cast", changes: 3 });
    // tried just now: not due again, and the route says so
    expect(world("GET", "/world/state", undefined, { chatId: id }).castRefill).toBe(false);
    expect(refill(id)).toMatchObject({ ok: true, skipped: "not due" });
  });

  it("a card is never over the deck's room; a full deck is skipped", () => {
    const many = Array.from({ length: 23 }, (_, i) => card({ id: "c" + (i + 1), name: "Person " + i, aliases: [] }));
    const id = seeded({ cast: many });
    expect(answer(id, refillReply, { force: true })).toMatchObject({ ok: true, added: 1, left: 24 });
    expect(refill(id, { force: true })).toMatchObject({ ok: true, skipped: "full" });
  });

  it("the button forces it, and the log says so", () => {
    const id = seeded({ cast: [card(), card({ id: "c2", name: "A", aliases: [] }), card({ id: "c3", name: "B", aliases: [] })] });
    expect(refill(id)).toMatchObject({ skipped: "not due" });
    // Halyna is in the deck already: her card in the answer is a repeat
    expect(answer(id, refillReply, { force: true })).toMatchObject({ ok: true, added: 2, left: 5 });
    expect(readRel("world/state/" + id + ".json").castLog[0].forced).toBe(true);
  });

  it("a failed call is logged with its code and waits as a try; the deck stays as it was", () => {
    const id = seeded();
    const r = answer(id, "not json at all");
    expect(r).toMatchObject({ ok: false, code: "not-json" });
    const s = readRel("world/state/" + id + ".json");
    expect(s.cast).toBeUndefined();
    expect(s.castBuild).toEqual({ n: 1 });
    expect(s.castLog[0]).toMatchObject({ added: 0, error: "not-json" });
  });

  it("an answer with nothing usable adds nothing and says so", () => {
    const id = seeded();
    expect(answer(id, J({ cast: [{ faction: "Nobody", name: "X", text: "y" }] }))).toMatchObject({ ok: true, added: 0, none: true });
  });

  it("no faction: the button says what is missing; no world: refused", () => {
    const id = seeded({ entities: [maksym] });
    expect(refill(id, { force: true })).toMatchObject({ ok: false, code: "no-factions" });
    const fresh = newChat();
    expect(refill(fresh)).toMatchObject({ error: "this chat has no world yet" });
  });
});

// ---------- the player's own view of the cards ----------

describe("reading and changing the cards", () => {
  const maksym = { id: "n3", kind: "person", name: "Maksym", aliases: [], text: "The toll keeper.", status: "active", uid: 0 };
  const seeded = () => {
    const id = newChat();
    writeState(id, { settings: { level: "living", cast: "normal", castDeck: true }, entities: [maksym], nextId: 4, cast: [card(), card({ id: "c2", name: "Zoya", aliases: [], tie: "" })] });
    return id;
  };
  const cards = (chatId: string, body?: Record<string, unknown>) => (body ? world("POST", "/world/cast/cards", { chatId, ...body }) : world("GET", "/world/cast/cards", undefined, { chatId }));

  it("lists the cards with the deck's numbers", () => {
    const id = seeded();
    const r = cards(id);
    expect(r.cards.map((c: any) => c.name)).toEqual(["Halyna", "Zoya"]);
    expect(r).toMatchObject({ per: 2, len: "normal" });
  });

  it("edits the name, aliases, tie, want and text; the faction and the id stay", () => {
    const id = seeded();
    const r = cards(id, { op: "edit", id: "c2", name: "Zoya K", aliases: ["Zo"], tie: "maksym", want: "A new want.", text: "A new text.", faction: "Hacked", extra: 1 });
    const c = r.cards.find((x: any) => x.id === "c2");
    expect(c).toMatchObject({ name: "Zoya K", aliases: ["Zo"], tie: "Maksym", want: "A new want.", text: "A new text.", faction: "Toll guild" });
    expect(readRel("world/state/" + id + ".json").cast.find((x: any) => x.id === "c2").name).toBe("Zoya K");
    // the tie can be cleared
    expect(cards(id, { op: "edit", id: "c2", tie: "" }).cards.find((x: any) => x.id === "c2").tie).toBe("");
  });

  it("refuses a name a card or a record has, a tie nobody goes by, and an empty card", () => {
    const id = seeded();
    expect(cards(id, { op: "edit", id: "c2", name: "halyna" })).toMatchObject({ code: "clash" });
    expect(cards(id, { op: "edit", id: "c2", name: "Maksym" })).toMatchObject({ code: "clash" });
    expect(cards(id, { op: "edit", id: "c2", tie: "A stranger" })).toMatchObject({ code: "tie" });
    expect(cards(id, { op: "edit", id: "c2", text: "  " })).toMatchObject({ code: "empty" });
    expect(readRel("world/state/" + id + ".json").cast.find((x: any) => x.id === "c2").name).toBe("Zoya");
  });

  it("deletes a card; the last one leaves no empty list; an unknown card or op is refused", () => {
    const id = seeded();
    expect(cards(id, { op: "delete", id: "c1" }).cards.map((c: any) => c.id)).toEqual(["c2"]);
    expect(cards(id, { op: "delete", id: "c2" }).cards).toEqual([]);
    expect(readRel("world/state/" + id + ".json").cast).toBeUndefined();
    expect(cards(id, { op: "delete", id: "c9" }).error).toBe("no such card");
    const id2 = seeded();
    expect(cards(id2, { op: "burn", id: "c1" }).error).toBe("op must be edit or delete");
  });
});
