/**
 * The cast deck (#424, step 4): cards of new people the story has not met. Data first: the card shape, the settings, what a rollback
 * puts back, what a saved world and a carry bring along, and what a Start draft holds.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CAST_CARDS_MAX, DEFAULT_OPTIONS, cleanCast, cleanCastOpts, coreOf, emptyState, handleRoute, nextCastId, normalizeState, startSettings } from "../plugins/world/plugin.js";

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
beforeEach(() => {
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
    llm: { request: () => {}, results, embed: () => {}, embedResults: {} },
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
