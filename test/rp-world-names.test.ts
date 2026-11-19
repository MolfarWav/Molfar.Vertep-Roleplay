/**
 * World DM, names from the shared catalog (#373, step 3): the chat's switch and lists, the pool the app sends (cleaned, minus what the world
 * already uses), the block in a DM run's prompt (also on a retry), and in a Start step. Off, nothing changes.
 */
import { describe, expect, it } from "bun:test";
import { DEFAULT_SETTINGS, cleanPool, handleRoute, poolNote, poolWithout } from "../plugins/world/plugin.js";

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; spec: any }[] = [];
  const host = {
    fs: {
      read: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
      list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
    },
    llm: { request: (key: string, spec: unknown) => void requests.push({ key, spec }), results },
  };
  return { host, files, results, requests };
}
type M = ReturnType<typeof memHost>;

const msg = (i: number, role: string, text: string) => ({ id: "m" + i, role, name: role === "user" ? "Taras" : "Odarka", text, swipe: 0 });
const STORY = [msg(0, "char", "Odarka stirs the pot."), msg(1, "user", "Who lives up the pass?"), msg(2, "char", "Old Maksym keeps the toll at the Red Tower.")];
const seed = () => ({
  "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
  "chats/c1.jsonl": STORY.map((m) => JSON.stringify(m)).join("\n") + "\n",
  "characters/odarka/card.json": JSON.stringify({ name: "Odarka", description: "A witch of the pass who keeps a hut by the Red Tower." }),
  "settings.json": JSON.stringify({ model: "c/default" }),
});
const route = (m: M, method: string, p: string, body?: unknown, stash?: unknown) => {
  const r = handleRoute({ method, path: p, query: {}, body, ...(stash ? { stash } : {}) }, m.host) as any;
  return r && r.json !== undefined ? r.json : r;
};

const POOL = {
  persons: { f: ["Olena", "Mira"], m: ["Ivan", "Bohdan"], family: ["Kovalenko", "Maksym"] },
  places: ["Ash Gate", "Red Tower"],
  groups: ["Guild of Patient Locksmiths"],
  things: ["Compass of Second Thoughts"],
};
const on = (m: M, extra: object = {}) => route(m, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", everyN: 1, fromStart: true, names: true, ...extra });

describe("the chat's settings", () => {
  it("are off by default and keep only tag-shaped words, no repeats, within the limits", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ names: false, namesGenres: [], namesCultures: [] });
    const m = memHost(seed());
    const r = route(m, "PUT", "/world/settings", { chatId: "c1", level: "chronicler", names: true, namesGenres: ["dark_fantasy", "dark_fantasy", "Bad Tag", 5, "a", "b", "c", "d", "e", "f"], namesCultures: ["ukrainian"] });
    expect(r.settings.names).toBe(true);
    expect(r.settings.namesGenres).toEqual(["dark_fantasy", "a", "b", "c", "d", "e"]);
    expect(r.settings.namesCultures).toEqual(["ukrainian"]);
    const off = route(memHost(seed()), "PUT", "/world/settings", { chatId: "c1", level: "chronicler" });
    expect(off.settings).toMatchObject({ names: false, namesGenres: [], namesCultures: [] });
  });
});

describe("the pool", () => {
  it("is cleaned: plain short names, no repeats, at most twelve a list, nothing when empty", () => {
    const many = Array.from({ length: 20 }, (_, i) => "Name" + String.fromCharCode(97 + i));
    const p = cleanPool({ persons: { f: ["<b>Olena</b>", "OLENA", "", 7, "x".repeat(100)], m: many }, places: "no", groups: ["A  B"] })!;
    expect(p.persons.f).toEqual(["b Olena /b", "OLENA", "x".repeat(60)]);
    expect(cleanPool({ persons: { f: ["Olena", "olena!", "OLENA"] } })!.persons.f).toEqual(["Olena"]);
    expect(p.persons.m).toHaveLength(12);
    expect(p.places).toEqual([]);
    expect(p.groups).toEqual(["A B"]);
    expect(cleanPool({ persons: { f: [] } })).toBeNull();
    expect(cleanPool("junk")).toBeNull();
  });

  it("leaves out what the world, the cards and the player use: whole names, and the first and family names of people", () => {
    const entities = [
      { kind: "person", name: "Olena Hrytsenko", aliases: ["Lena"] },
      { kind: "place", name: "Red Tower", aliases: [] },
      { kind: "group", name: "Toll guild", aliases: ["The Tolls"] },
    ];
    const out = poolWithout(cleanPool(POOL), entities, ["Odarka", "Ivan Petrenko"])!;
    expect(out.persons.f).toEqual(["Mira"]);
    expect(out.persons.m).toEqual(["Bohdan"]);
    expect(out.places).toEqual(["Ash Gate"]);
    expect(poolWithout(cleanPool({ places: ["Red Tower"] }), entities, [])).toBeNull();
    expect(poolWithout(null, entities, [])).toBeNull();
  });

  it("becomes one block that says how to use it", () => {
    const note = poolNote(cleanPool(POOL));
    expect(note).toContain("Names this world does not use yet");
    expect(note).toContain("never rename an existing record");
    expect(note).toContain("People, women: Olena, Mira; men: Ivan, Bohdan; family names: Kovalenko, Maksym");
    expect(note).toContain("Places: Ash Gate, Red Tower");
    expect(note).toContain("Groups: Guild of Patient Locksmiths");
    expect(note).toContain("Things: Compass of Second Thoughts");
    expect(poolNote(null)).toBe("");
  });
});

describe("a DM run", () => {
  const asked = (m: M) => m.requests[m.requests.length - 1]!.spec.messages[0].content as string;

  it("carries the pool in its prompt when the switch is on, minus the names in use and the cards' names", () => {
    const m = memHost(seed());
    on(m);
    const r = route(m, "POST", "/world/update", { chatId: "c1", pool: { ...POOL, persons: { ...POOL.persons, f: [...POOL.persons.f, "Odarka"] } } });
    expect(r.__llmPending).toBe(true);
    const text = asked(m);
    expect(text).toContain("Names this world does not use yet");
    expect(text).toContain("Olena, Mira");
    const block = text.slice(text.indexOf("Names this world does not use yet"));
    expect(block).not.toContain("Odarka");
    // the story is still in the same message, before the block
    expect(text.indexOf("Old Maksym keeps the toll")).toBeLessThan(text.indexOf("Names this world does not use yet"));
    expect(r.stash.pool).toContain("Olena, Mira");
  });

  it("sends nothing when the switch is off, whatever the app sent, or when no pool came", () => {
    const m = memHost(seed());
    on(m, { names: false });
    route(m, "POST", "/world/update", { chatId: "c1", pool: POOL });
    expect(asked(m)).not.toContain("Names this world does not use yet");
    const n = memHost(seed());
    on(n);
    const r = route(n, "POST", "/world/update", { chatId: "c1" });
    expect(asked(n)).not.toContain("Names this world does not use yet");
    expect(r.stash.pool).toBe("");
  });

  it("keeps the same block on the retry that follows a rate limit, from the stash", () => {
    const m = memHost(seed());
    on(m);
    const first = route(m, "POST", "/world/update", { chatId: "c1", pool: POOL });
    m.results.world = { error: "429 rate limit exceeded", code: "rate_limit" };
    const retry = route(m, "POST", "/world/update", { chatId: "c1" }, first.stash);
    expect(retry.__llmPending).toBe(true);
    expect(m.requests[m.requests.length - 1]!.key).toBe("world_retry");
    expect(asked(m)).toContain("Olena, Mira");
    expect(retry.stash.pool).toContain("Olena, Mira");
  });

  it("does not use what a first run wrote: a person the DM named is out of the next pool", () => {
    const m = memHost(seed());
    on(m);
    const first = route(m, "POST", "/world/update", { chatId: "c1", pool: POOL });
    m.results.world = { text: JSON.stringify({ add: [{ kind: "person", name: "Olena Hrytsenko", text: "The herbalist." }], summary: "A herbalist." }) };
    route(m, "POST", "/world/update", { chatId: "c1" }, first.stash);
    delete m.results.world;
    m.files["chats/c1.jsonl"] += JSON.stringify(msg(3, "user", "We go at night.")) + "\n";
    route(m, "POST", "/world/update", { chatId: "c1", pool: POOL });
    const text = asked(m);
    const block = text.slice(text.indexOf("Names this world does not use yet"));
    expect(block).not.toContain("Olena");
    expect(block).toContain("Mira");
  });
});

describe("a Start", () => {
  it("keeps the pool in the draft only when the switch is on and puts it into the step's prompt", () => {
    const m = memHost(seed());
    on(m);
    const begun = route(m, "POST", "/world/start", { chatId: "c1", begin: true, recipe: "from-cards", bench: false, cast: false, pool: POOL });
    expect(begun.ok).toBe(true);
    expect(JSON.parse(m.files["world/state/c1.json"]!).draft.pool.places).toEqual(["Ash Gate", "Red Tower"]);
    route(m, "POST", "/world/start", { chatId: "c1" });
    const text = m.requests[m.requests.length - 1]!.spec.messages[0].content as string;
    expect(text).toContain("Names this world does not use yet");
    expect(text).toContain("Ash Gate");

    const off = memHost(seed());
    on(off, { names: false });
    route(off, "POST", "/world/start", { chatId: "c1", begin: true, recipe: "from-cards", bench: false, cast: false, pool: POOL });
    expect(JSON.parse(off.files["world/state/c1.json"]!).draft.pool).toBeUndefined();
    route(off, "POST", "/world/start", { chatId: "c1" });
    expect(off.requests[off.requests.length - 1]!.spec.messages[0].content).not.toContain("Names this world does not use yet");
  });
});
