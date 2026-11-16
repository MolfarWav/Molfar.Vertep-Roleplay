/**
 * World book, step 3 (#424): kinds a record may be written with, why a thing is in the book, the code tidy-up that puts played-out things
 * to rest (and wakes them), the sweep that no longer offers scene objects, and what the player removed (step 0 of the DM's memory).
 */
import { describe, expect, it } from "bun:test";
import { applyReport, dmInput, emptyState, handleRoute, normalizeState, removedNames, sweepCandidates, tidyBook } from "../plugins/world/plugin.js";

const rec = (id: string, kind: string, name: string, text: string, extra: Record<string, unknown> = {}) => ({ id, kind, name, aliases: [] as string[], text, status: "active", uid: 0, at: 1, ...extra });
const msg = (i: number, role: string, text: string) => ({ id: "m" + i, role, name: role === "user" ? "Taras" : "Odarka", text, swipe: 0 });
const jsonl = (msgs: object[]) => msgs.map((m) => JSON.stringify(m)).join("\n") + "\n";
/** n messages alternating user and char (n / 2 replies), none of which names anything */
const filler = (n: number, from = 0, text = "The road goes on.") => Array.from({ length: n }, (_, k) => msg(from + k, (from + k) % 2 === 0 ? "user" : "char", text));
const st = (entities: object[], over: Record<string, unknown> = {}) => ({ ...emptyState("c1"), entities, nextId: 40, ...over }) as any;
const names = (list: any[]) => list.map((e) => e.name).sort();

describe("what a record is", () => {
  it("a thing keeps a valid reason; other kinds and unknown words have none", () => {
    const s = normalizeState({ entities: [
      { id: "n1", kind: "thing", name: "Letter", text: "x", why: "hidden" },
      { id: "n2", kind: "thing", name: "Cup", text: "x", why: "because" },
      { id: "n3", kind: "person", name: "Mira", text: "x", why: "clue" },
    ] }, "c1");
    expect(s.entities.map((e: any) => [e.id, e.why])).toEqual([["n1", "hidden"], ["n2", undefined], ["n3", undefined]]);
  });

  it("an old note is still read; a kind nobody knows is dropped", () => {
    const s = normalizeState({ entities: [{ id: "n1", kind: "fact", name: "Custom", text: "x" }, { id: "n2", kind: "weird", name: "W", text: "x" }] }, "c1");
    expect(s.entities.map((e: any) => e.id)).toEqual(["n1"]);
  });

  it("the DM writes persons, places, groups and things; a fact or an unknown kind is skipped, not turned into a note", () => {
    const state = st([]);
    const n = applyReport(state, { add: [
      { kind: "fact", name: "Toll custom", text: "Everybody pays." },
      { kind: "weird", name: "Odd", text: "x" },
      { kind: "thing", name: "Sealed letter", text: "A letter nobody opened.", why: "hidden" },
      { kind: "place", name: "Red Tower", text: "A tower." },
    ] }, { cards: [], userName: "Taras", now: 5 } as any);
    expect(n).toBe(2);
    expect(state.entities.map((e: any) => [e.name, e.kind, e.why])).toEqual([["Sealed letter", "thing", "hidden"], ["Red Tower", "place", undefined]]);
  });

  it("an update sets or clears the reason", () => {
    const state = st([rec("n1", "thing", "Key", "A brass key.", { holder: "Taras" })]);
    applyReport(state, { update: [{ id: "n1", why: "weapon" }] }, { cards: [], userName: "Taras", now: 5 } as any);
    expect(state.entities[0].why).toBe("weapon");
    applyReport(state, { update: [{ id: "n1", why: "" }] }, { cards: [], userName: "Taras", now: 6 } as any);
    expect(state.entities[0].why).toBeUndefined();
  });
});

describe("the sweep", () => {
  it("offers places, never the objects lying around", () => {
    const scene = { key: "m1#0", direction: "social", before: null, stagnant: 1, place: "hall", present: [], chars: {}, places: ["hall", "cellar"], objects: [{ item: "cup of noodles", where: "on the barrel" }], left: { place: "cellar", objects: [{ item: "gym bag", where: "by the door" }] } };
    const c = sweepCandidates(emptyState("c1") as any, scene as any);
    expect(c.places).toEqual(["hall", "cellar"]);
    expect(c.things).toEqual([]);
  });
});

describe("the tidy-up pass", () => {
  const base = () => st([
    rec("n1", "thing", "Cup of noodles", "A cheap supper."),
    rec("n2", "thing", "Brass key", "Opens the cellar.", { why: "clue" }),
    rec("n3", "thing", "Sealed letter", "Never opened.", { pinned: true }),
    rec("n4", "thing", "Sword", "A plain sword.", { holder: "Taras" }),
    rec("n5", "thing", "Lantern", "Carried by Mira.", { holder: "Mira" }),
    rec("n6", "thing", "Old map", "A torn map.", { why: "gift" }),
    rec("n7", "person", "Mira", "A friend."),
    rec("n8", "place", "Cellar", "Under the tower."),
    rec("n9", "thing", "Rope", "A coil of rope."),
  ]);
  const args = (msgs: object[], over: Record<string, unknown> = {}) => ({ msgs: msgs as any, scene: null, cards: ["Odarka"], userName: "Taras", now: 100, ...over });

  it("a young chat is left alone", () => {
    const s = base();
    expect(tidyBook(s, args(filler(12)))).toMatchObject({ ran: false });
    expect(s.tidy).toBeUndefined();
  });

  it("the first automatic pass only takes the list; nothing is archived", () => {
    const s = base();
    const out = tidyBook(s, args(filler(40)));
    expect(out).toMatchObject({ ran: true, archived: [], woken: [] });
    expect(s.tidy.n).toBe(20);
    expect(s.tidy.seen.sort()).toEqual(["n1", "n2", "n3", "n4", "n5", "n6", "n9"]);
    expect(s.entities.every((e: any) => e.status === "active")).toBe(true);
  });

  it("the next pass puts to rest what was seen before and is named less than 3 times, owns to nobody and has no reason to stay", () => {
    const s = base();
    tidyBook(s, args(filler(40)));
    // a thing added after the first pass is not judged yet
    s.entities.push(rec("n10", "thing", "New coin", "A coin."));
    // 10 more replies: the Rope is named three times, the Old map twice (not enough), the Lantern's holder is an active person
    const more = filler(20, 40);
    more[1] = msg(41, "char", "Rope lies here.");
    more[3] = msg(43, "char", "She coils the rope.");
    more[5] = msg(45, "char", "The rope is tied.");
    more[7] = msg(47, "char", "The old map shows a road.");
    more[9] = msg(49, "char", "Old map again.");
    const out = tidyBook(s, args([...filler(40), ...more]));
    expect(names(out.archived)).toEqual(["Cup of noodles", "Old map"]);
    expect(s.entities.find((e: any) => e.id === "n1").status).toBe("dormant");
    // kept: a clue, a pinned thing, a thing the player's character holds, the active person's thing, a thing named 3 times, a younger thing
    for (const id of ["n2", "n3", "n4", "n5", "n9", "n10"]) expect(s.entities.find((e: any) => e.id === id).status).toBe("active");
    // people and places are never put to rest
    expect(s.entities.find((e: any) => e.id === "n7").status).toBe("active");
    expect(s.entities.find((e: any) => e.id === "n8").status).toBe("active");
    expect(s.tidyLog.map((l: any) => [l.act, l.name, l.count, l.via])).toEqual([["archive", "Cup of noodles", 0, "code"], ["archive", "Old map", 2, "code"]]);
    expect(s.tidyLog[1]).toMatchObject({ why: "gift", n: 30 });
    expect(s.tidy.n).toBe(30);
  });

  it("a resting thing named twice in the last ten replies is woken, with a log line", () => {
    const s = base();
    s.entities[0].status = "dormant";
    s.tidy = { n: 20, seen: [] };
    const more = filler(20, 40);
    more[3] = msg(43, "char", "The cup of noodles goes cold.");
    more[7] = msg(47, "char", "She eats the cup of noodles.");
    const out = tidyBook(s, args([...filler(40), ...more]));
    expect(names(out.woken)).toEqual(["Cup of noodles"]);
    expect(s.entities[0].status).toBe("active");
    expect(s.tidyLog.at(-1)).toMatchObject({ act: "wake", name: "Cup of noodles", count: 2, via: "code" });
  });

  it("a thing in the Dashboard's scene hands of someone stays", () => {
    const s = base();
    tidyBook(s, args(filler(40)));
    const scene = { chars: { Mira: { holding: "a cup of noodles", items: [] } } };
    const out = tidyBook(s, args(filler(80), { scene }));
    expect(names(out.archived)).not.toContain("Cup of noodles");
  });

  it("the switch off stops the pass; Tidy now runs anyway, and with no earlier pass judges everything", () => {
    const s = base();
    s.settings.tidy = false;
    expect(tidyBook(s, args(filler(40))).ran).toBe(false);
    const out = tidyBook(s, args(filler(40), { force: true }));
    expect(out.ran).toBe(true);
    // every thing that is not kept: the noodles, the rope
    expect(names(out.archived)).toEqual(["Cup of noodles", "Old map", "Rope"]);
  });
});

describe("the DM names a resting thing again", () => {
  it("it is active again and the log says the DM did it", () => {
    const s = st([rec("n1", "thing", "Cup of noodles", "A cheap supper.", { status: "dormant" })]);
    const n = applyReport(s, { add: [{ kind: "thing", name: "Cup of noodles", text: "She eats the supper.", why: "gift" }] }, { cards: [], userName: "Taras", now: 9 } as any);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(s.entities[0].status).toBe("active");
    expect(s.entities[0].text).toBe("She eats the supper.");
    expect(s.tidyLog.at(-1)).toMatchObject({ act: "wake", name: "Cup of noodles", via: "dm" });
  });
});

describe("what the player removed", () => {
  function memHost(files: Record<string, string>) {
    return {
      host: {
        fs: {
          read: (p: string) => { if (!(p in files)) throw new Error("ENOENT " + p); return files[p]!; },
          write: (p: string, v: string) => { files[p] = v; },
          remove: (p: string) => { delete files[p]; },
          list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
        },
        llm: { request: () => {}, results: {} as Record<string, any> },
      },
      files,
    };
  }
  const setup = (entities: object[]) => memHost({
    "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
    "chats/c1.jsonl": jsonl(filler(6)),
    "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
    "settings.json": JSON.stringify({ model: "c/default" }),
    "world/state/c1.json": JSON.stringify({ ...st(entities), settings: { level: "chronicler", everyN: 5, stagnation: 6, onTransition: true, onPlace: true, insert: true, cast: "off" } }),
  });
  const route = (m: any, body: object) => handleRoute({ method: "PUT", path: "/world/records", query: {}, body: { chatId: "c1", ...body } }, m.host) as any;
  const state = (m: any) => JSON.parse(m.files["world/state/c1.json"]!);

  it("every hand action leaves a signal: add, edit with the lengths, pin, retire, restore, delete", () => {
    const m = setup([rec("n1", "thing", "Rope", "A coil of rope."), rec("n2", "place", "Cellar", "Dark.")]);
    route(m, { op: "add", record: { kind: "thing", name: "Lamp", text: "A lamp." } });
    route(m, { op: "update", record: { id: "n1", text: "A short rope." } });
    route(m, { op: "update", record: { id: "n1", pinned: true } });
    route(m, { op: "retire", record: { id: "n2" } });
    route(m, { op: "restore", record: { id: "n2" } });
    route(m, { op: "delete", record: { id: "n1" } });
    const ops = state(m).signals.map((g: any) => [g.op, g.name]);
    expect(ops).toEqual([["add", "Lamp"], ["edit", "Rope"], ["pin", "Rope"], ["retire", "Cellar"], ["restore", "Cellar"], ["delete", "Rope"]]);
    const edit = state(m).signals.find((g: any) => g.op === "edit");
    expect(edit).toMatchObject({ kind: "thing", lenBefore: 15, lenAfter: 13, madeBy: "dm" });
    expect(state(m).signals.find((g: any) => g.op === "add").madeBy).toBe("player");
  });

  it("a record cannot be added with the kind fact; the form's old notes can still be edited", () => {
    const m = setup([rec("n1", "fact", "Custom", "Everybody pays.")]);
    expect(route(m, { op: "add", record: { kind: "fact", name: "X", text: "y" } }).status).toBe(400);
    expect(route(m, { op: "update", record: { id: "n1", text: "Everybody pays twice." } }).status).toBe(200);
    expect(state(m).entities[0]).toMatchObject({ kind: "fact", text: "Everybody pays twice." });
  });

  it("a deleted name is refused by the code and told to the DM; bringing it back by hand clears it", () => {
    const m = setup([rec("n1", "thing", "Rope", "A coil of rope."), rec("n2", "thing", "Lamp", "A lamp.")]);
    route(m, { op: "delete", record: { id: "n1" } });
    route(m, { op: "delete", record: { id: "n2" } });
    const s = state(m);
    expect(removedNames(s)).toEqual(["Lamp", "Rope"]);
    const n = applyReport(s, { add: [{ kind: "thing", name: "rope", text: "A coil of rope again.", why: "clue" }, { kind: "thing", name: "Lantern", text: "A lantern.", why: "clue" }] }, { cards: [], userName: "Taras", now: 9 } as any);
    expect(n).toBe(1);
    expect(s.entities.map((e: any) => e.name)).toEqual(["Lantern"]);
    expect(dmInput({ cards: [], userName: "Taras", entities: s.entities, msgs: [msg(1, "char", "x")], removed: removedNames(s) } as any)).toContain("Do not record (the player removed): Lamp, Rope.");
    expect(dmInput({ cards: [], userName: "Taras", entities: s.entities, msgs: [msg(1, "char", "x")], removed: [] } as any)).not.toContain("Do not record (the player removed)");
    // the player writes the name again by hand: it is not removed any more
    route(m, { op: "add", record: { kind: "thing", name: "Rope", text: "A new rope." } });
    expect(removedNames(state(m))).toEqual(["Lamp"]);
  });

  it("the newest 30 names go to the DM", () => {
    const s = st([]);
    s.signals = Array.from({ length: 40 }, (_, i) => ({ at: i + 1, op: "delete", kind: "thing", name: "T" + i, madeBy: "dm" }));
    const list = removedNames(s, 30);
    expect(list).toHaveLength(30);
    expect(list[0]).toBe("T39");
  });

  it("restoring a resting thing takes it out of the last pass's list, so it is judged only after a full pass", () => {
    const m = setup([rec("n1", "thing", "Rope", "A coil of rope.", { status: "dormant" })]);
    const s = state(m);
    s.tidy = { n: 10, seen: ["n1"] };
    m.files["world/state/c1.json"] = JSON.stringify(s);
    route(m, { op: "restore", record: { id: "n1" } });
    expect(state(m).tidy.seen).toEqual([]);
    expect(state(m).entities[0].status).toBe("active");
  });
});

describe("the tidy-up on the routes", () => {
  function memHost(files: Record<string, string>) {
    return {
      host: {
        fs: {
          read: (p: string) => { if (!(p in files)) throw new Error("ENOENT " + p); return files[p]!; },
          write: (p: string, v: string) => { files[p] = v; },
          remove: (p: string) => { delete files[p]; },
          list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
        },
        llm: { request: () => {}, results: {} as Record<string, any> },
      },
      files,
    };
  }
  const setup = (msgs: object[], over: Record<string, unknown> = {}) => memHost({
    "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
    "chats/c1.jsonl": jsonl(msgs),
    "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
    "settings.json": JSON.stringify({ model: "c/default" }),
    "world/state/c1.json": JSON.stringify({ ...st([rec("n1", "thing", "Cup of noodles", "A cheap supper."), rec("n2", "place", "Cellar", "Dark.")]), settings: { level: "chronicler", everyN: 5, stagnation: 6, onTransition: true, onPlace: true, insert: true, cast: "off" }, ...over }),
  });
  const get = (m: any) => handleRoute({ method: "GET", path: "/world/tidy", query: { chatId: "c1" }, body: undefined }, m.host) as any;
  const post = (m: any) => handleRoute({ method: "POST", path: "/world/tidy", query: {}, body: { chatId: "c1" } }, m.host) as any;
  const state = (m: any) => JSON.parse(m.files["world/state/c1.json"]!);

  it("GET tells the switch, the counts and the log; POST runs a pass now, writes the book and answers with what happened", () => {
    const m = setup(filler(40));
    const before = get(m).json;
    expect(before).toMatchObject({ on: true, every: 10, replies: 20, first: true, active: 1, asleep: 0, log: [] });
    const out = post(m).json;
    expect(out.archived).toEqual(["Cup of noodles"]);
    expect(state(m).entities[0].status).toBe("dormant");
    expect(get(m).json).toMatchObject({ asleep: 1, active: 0, first: false });
    expect(get(m).json.log[0]).toMatchObject({ act: "archive", name: "Cup of noodles" });
    // the book entry of a resting thing is switched off
    const book = JSON.parse(m.files["lorebooks/world-c1.json"]!);
    expect(book.entries.find((e: any) => e.title === "Cup of noodles").enabled).toBe(false);
  });

  it("a chat with no world yet is refused; the setting can be switched off through the settings route", () => {
    const m = setup(filler(40));
    delete m.files["world/state/c1.json"];
    expect(post(m).status).toBe(409);
    const m2 = setup(filler(40));
    const put = handleRoute({ method: "PUT", path: "/world/settings", query: {}, body: { chatId: "c1", tidy: false } }, m2.host) as any;
    expect(put.json.settings.tidy).toBe(false);
    expect(get(m2).json.on).toBe(false);
  });

  it("an update call runs the pass by itself: the first one takes the list, the one ten replies later archives", () => {
    const m = setup(filler(40));
    handleRoute({ method: "POST", path: "/world/update", query: {}, body: { chatId: "c1", auto: true } }, m.host);
    expect(state(m).tidy).toMatchObject({ n: 20 });
    expect(state(m).entities[0].status).toBe("active");
    m.files["chats/c1.jsonl"] = jsonl(filler(60));
    handleRoute({ method: "POST", path: "/world/update", query: {}, body: { chatId: "c1", auto: true } }, m.host);
    expect(state(m).entities[0].status).toBe("dormant");
    expect(state(m).tidyLog.map((l: any) => l.act)).toEqual(["archive"]);
  });
});
