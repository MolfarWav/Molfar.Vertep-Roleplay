/**
 * More conditions on a lorebook entry (Molfar.Vertep#547): extra key blocks (`moreKeys`) that must all hold, and scene
 * conditions (`sceneFilter`): the place (a room counts as part of its building), who is in the scene, the time of day and
 * the weather, read from the Dashboard's snapshot. A part nobody read holds an "only here" condition back and lets an
 * "everywhere except" one through.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E = (await import(engineUrl)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lore-cond-"));
  for (const d of ["characters", "personas", "presets", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null }));
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], openai_max_context: 8192, openai_max_tokens: 512 }));
});
afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* watcher races */
  }
});

const write = (rel: string, v: unknown) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof v === "string" ? v : JSON.stringify(v));
};
const host = () => ({
  fs: {
    root,
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => write(rel, content),
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  },
  store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
  llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  log: () => {},
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const route = (p: string, body: unknown): any => E.handleRoute({ method: "POST", path: p, query: {}, body }, host()).json;

let uid = 0;
const entry = (title: string, extra: Record<string, unknown> = {}) =>
  ({ uid: ++uid, title, keys: ["door"], content: title + " content.", enabled: true, order: 100, position: "before_char", ...extra });
type Row = { title: string; reason?: string; detail?: any; block?: number; secondary?: string[] };
const titles = (rows: Row[]) => rows.map((r) => r.title).sort();
const tryText = (text: string, entries: Record<string, unknown>[], extra: Record<string, unknown> = {}) =>
  route("/wi-test", { text, books: [{ id: "b", name: "Book", settings: {}, entries }], ...extra }) as { fired: Row[]; blocked: Row[] };

describe("extra key blocks", () => {
  const e = () => entry("Cellar", { secondaryKeys: ["key", "lock"], selectiveLogic: "AND_ANY", moreKeys: [{ logic: "NOT_ANY", keys: ["guard"] }] });

  it("every block must hold", () => {
    expect(titles(tryText("the door and its lock", [e()]).fired)).toEqual(["Cellar"]);
    const noSecond = tryText("the door, the lock, a guard", [e()]);
    expect(noSecond.fired).toEqual([]);
    expect(noSecond.blocked[0]).toMatchObject({ reason: "secondary", detail: "NOT_ANY", block: 2 });
    const noFirst = tryText("the door", [e()]);
    expect(noFirst.blocked[0]).toMatchObject({ reason: "secondary", detail: "AND_ANY" });
    expect(noFirst.blocked[0]!.block).toBeUndefined();
  });

  it("works with no secondary keys, and an empty block says nothing", () => {
    const only = entry("Only more", { moreKeys: [{ logic: "AND_ALL", keys: ["red", "iron"] }, { logic: "NOT_ANY", keys: [] }] });
    expect(titles(tryText("a red iron door", [only]).fired)).toEqual(["Only more"]);
    expect(tryText("a red door", [only]).fired).toEqual([]);
  });

  it("takes at most four blocks besides the secondary keys", () => {
    const many = Array.from({ length: 8 }, () => ({ logic: "AND_ANY", keys: ["door"] }));
    expect(E.wiKeyBlocks({ secondaryKeys: ["a"], moreKeys: many }).map((b: { block: number }) => b.block)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("the scene a condition reads", () => {
  const world = {
    entities: [
      { id: "n1", kind: "place", status: "active", name: "The Gilded Boar", aliases: ["tavern"] },
      { id: "n2", kind: "place", status: "active", name: "Back room", aliases: [], size: "spot", inside: "The Gilded Boar" },
      { id: "n3", kind: "place", status: "active", name: "Market square", aliases: [] },
    ],
    regIds: { n1: "l1" },
  };
  const registry = { entities: [{ id: "l1", kind: "place", name: "The Gilded Boar", aliases: [{ text: "Золотий Вепр" }] }, { id: "p1", kind: "person", name: "Mira Holt", aliases: [{ text: "Міра" }] }] };
  const scene = (place: string, extra: Record<string, unknown> = {}) => E.sceneOfSnapshot({ clock: { place, ...extra }, present: ["Mira Holt"] }, world, registry);
  const filter = (f: Record<string, unknown>) => E.wiSceneFilter({ sceneFilter: f });

  it("a room counts as part of its building, not the other way round", () => {
    expect(E.wiSceneStop(filter({ places: ["The Gilded Boar"] }), scene("back room"))).toBeNull();
    expect(E.wiSceneStop(filter({ places: ["Back room"] }), scene("The Gilded Boar"))).toMatchObject({ reason: "place" });
    expect(E.wiSceneStop(filter({ places: ["tavern"] }), scene("Back room"))).toBeNull();
    expect(E.wiSceneStop(filter({ places: ["Золотий Вепр"] }), scene("Back room"))).toBeNull();
    expect(E.wiSceneStop(filter({ places: ["tavern"] }), scene("Market square"))).toMatchObject({ reason: "place", detail: { want: ["tavern"], have: "Market square", exclude: false } });
  });

  it("without a World book the words of the place line are matched", () => {
    const s = E.sceneOfSnapshot({ clock: { place: "the old harbour, pier two" } }, null, null);
    expect(E.wiSceneStop(filter({ places: ["harbour"] }), s)).toBeNull();
    expect(E.wiSceneStop(filter({ places: ["harbour"], placesExclude: true }), s)).toMatchObject({ reason: "place" });
    expect(E.wiSceneStop(filter({ places: ["har"] }), s)).toMatchObject({ reason: "place" });
  });

  it("who is in the scene, by any spelling", () => {
    expect(E.wiSceneStop(filter({ present: ["Mira"] }), scene("x"))).toBeNull();
    expect(E.wiSceneStop(filter({ present: ["Міра"] }), scene("x"))).toBeNull();
    expect(E.wiSceneStop(filter({ present: ["Bram"] }), scene("x"))).toMatchObject({ reason: "present", detail: { have: "Mira Holt" } });
    expect(E.wiSceneStop(filter({ present: ["Mira"], presentExclude: true }), scene("x"))).toMatchObject({ reason: "present" });
    // a scene that was read and has nobody else in it is known, not unknown
    const alone = E.sceneOfSnapshot({ clock: {}, present: [] }, null, null);
    expect(E.wiSceneStop(filter({ present: ["Mira"] }), alone)!.detail.unknown).toBeUndefined();
  });

  it("time of day and weather", () => {
    const s = scene("x", { band: "night", weather: "heavy rain" });
    expect(E.wiSceneStop(filter({ times: ["night", "dawn"], weather: ["rain"] }), s)).toBeNull();
    expect(E.wiSceneStop(filter({ times: ["day"] }), s)).toMatchObject({ reason: "time", detail: { have: "night" } });
    expect(E.wiSceneStop(filter({ weather: ["snow"] }), s)).toMatchObject({ reason: "weather" });
    expect(E.wiSceneStop(filter({ weather: ["rain"], weatherExclude: true }), s)).toMatchObject({ reason: "weather" });
  });

  it("nothing read: an only-here condition holds, an except one passes", () => {
    for (const f of [{ places: ["tavern"] }, { present: ["Mira"] }, { times: ["night"] }, { weather: ["rain"] }])
      expect(E.wiSceneStop(filter(f), null)!.detail.unknown).toBe(true);
    for (const f of [{ places: ["tavern"], placesExclude: true }, { present: ["Mira"], presentExclude: true }, { weather: ["rain"], weatherExclude: true }])
      expect(E.wiSceneStop(filter(f), null)).toBeNull();
    expect(E.wiSceneFilter({ sceneFilter: { places: [], times: ["noonish"] } })).toBeNull();
  });
});

describe("in a chat", () => {
  const HERE = () => entry("Tavern talk", { sceneFilter: { places: ["tavern"] }, status: "constant", sticky: 5 });
  function chat(places: string[], entries: Record<string, unknown>[]) {
    write("characters/bram/card.json", { name: "Bram", description: "" });
    write("lorebooks/b.json", { id: "b", name: "Book", entries });
    write("chats/c1.meta.json", { id: "c1", title: "T", characterId: "bram", userName: "Jude", lorebookIds: ["b"] });
    write("chats/c1.jsonl", places.map((_, i) => JSON.stringify({ id: "m" + i, role: "char", name: "Bram", text: "A door.", swipe: 0 })).join("\n") + "\n");
    write("dashboard/state/c1.json", { v: 2, chatId: "c1", snapshots: Object.fromEntries(places.map((p, i) => ["m" + i + "#0", { clock: { place: p }, present: [] }])) });
  }
  const status = () => route("/wi-status", { chatId: "c1" }) as { fired: Row[]; blocked: Row[] };

  it("the newest reading decides, and a constant entry needs no keys", () => {
    chat(["tavern"], [HERE()]);
    expect(titles(status().fired)).toEqual(["Tavern talk"]);
    chat(["tavern", "road"], [HERE()]);
    expect(status().fired).toEqual([]);
    expect(status().blocked[0]).toMatchObject({ title: "Tavern talk", reason: "place" });
  });

  it("with no Dashboard reading the entry says why it is out", () => {
    chat([], [HERE()]);
    expect(status().blocked[0]).toMatchObject({ reason: "place", detail: { unknown: true } });
  });

  it("the keyword test takes a scene typed by hand", () => {
    const e = entry("Night watch", { sceneFilter: { times: ["night"], places: ["gate"], present: ["Bram"] } });
    expect(tryText("the door", [e]).blocked[0]).toMatchObject({ reason: "place" });
    expect(titles(tryText("the door", [e], { scene: { place: "north gate", time: "night", present: ["Bram"] } }).fired)).toEqual(["Night watch"]);
    expect(tryText("the door", [e], { scene: { place: "north gate", time: "day", present: ["Bram"] } }).blocked[0]).toMatchObject({ reason: "time" });
    chat(["north gate"], [e]);
    expect(tryText("the door", [e], { chatId: "c1", scene: { time: "night", present: ["Bram"] } }).fired.length).toBe(1);
  });

  it("an entry held by the scene says so only when its keys would hit", () => {
    const e = entry("Quiet", { sceneFilter: { places: ["tavern"] } });
    expect(tryText("nothing here", [e]).blocked).toEqual([]);
    expect(tryText("the door", [e]).blocked.length).toBe(1);
  });
});
