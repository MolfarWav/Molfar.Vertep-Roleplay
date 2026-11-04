/**
 * Entity registry phase B2 (docs/ENTITY-REGISTRY.md): the World DM's thing and place records share ids with the registry,
 * so the World DM and the Dashboard mean the same sword and the same room.
 */
import { describe, expect, it } from "bun:test";

(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const W = (await import("../plugins/world/plugin.js")) as Record<string, any>;

function memFs(files: Record<string, string>) {
  return {
    files,
    read: (p: string) => {
      if (!(p in files)) throw new Error("ENOENT " + p);
      return files[p]!;
    },
    write: (p: string, s: string) => {
      files[p] = s;
    },
    list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
  };
}

const kaede = { name: "Kaede Fuji", description: "A quiet swordswoman.\nAliases: Kaede" };
const meta = { id: "c1", userName: "Taras", characterId: "kaede" };
const ent = (id: string, kind: string, name: string) => ({ id, kind, name, aliases: [], src: "seen" });

/** A chat whose registry already holds what the Dashboard registered, and a Dashboard snapshot. */
function setup(snapshot: Record<string, unknown> = {}) {
  const reg = { v: 1, chatId: "c1", from: null, next: { p: 3, o: 6, l: 4 }, entities: [ent("o5", "thing", "silver sword"), ent("l3", "place", "Hall of Mirrors")], apart: [], suggest: [] };
  return memFs({
    "characters/kaede/card.json": JSON.stringify(kaede),
    "registry/c1.json": JSON.stringify(reg),
    "dashboard/state/c1.json": JSON.stringify({ snapshots: { "m1#0": { present: ["Kaede Fuji"], ...snapshot } } }),
  });
}
const msgs = [{ id: "m1", role: "assistant", swipe: 0 }];
const ctxOf = (rc: any) => ({ cards: ["Kaede Fuji"], userName: "Taras", now: 1, rc });

describe("World thing records and the registry", () => {
  it("links the DM's sword to the t# the Dashboard registered", () => {
    const fsx = setup();
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "thing", name: "the silver sword", text: "A blade with a worn grip.", holder: "Kaede" }] }, ctxOf(rc));
    expect(st.regIds).toEqual({ n1: "o5" });
    // the spelling is kept as an alias; no second registry thing
    W.regFlush(fsx, rc);
    const file = JSON.parse(fsx.files["registry/c1.json"]!);
    expect(file.entities.filter((e: any) => e.kind === "thing").length).toBe(1);
    expect(file.entities.find((e: any) => e.id === "o5").aliases.map((a: any) => a.text)).toContain("the silver sword");
  });

  it("a new thing joins the registry as src world", () => {
    const fsx = setup();
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "thing", name: "Brass lantern", text: "Dented." }] }, ctxOf(rc));
    expect(st.regIds).toEqual({ n1: "o6" });
    W.regFlush(fsx, rc);
    expect(JSON.parse(fsx.files["registry/c1.json"]!).entities.find((e: any) => e.id === "o6")).toMatchObject({ name: "Brass lantern", src: "world" });
  });

  it("one record when the DM writes Silver Sword under two spellings", () => {
    const rc = W.openRegistry(setup(), "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "thing", name: "Silver Sword", text: "A blade." }] }, ctxOf(rc));
    const n = W.applyReport(st, { add: [{ kind: "thing", name: "the silver sword", text: "A blade, now chipped." }] }, ctxOf(rc));
    expect(n).toBe(1);
    expect(st.entities.length).toBe(1);
    expect(st.entities[0].text).toBe("A blade, now chipped.");
    W.applyReport(st, { update: [{ name: "silver  sword", text: "Mended." }] }, ctxOf(rc));
    expect(st.entities[0].text).toBe("Mended.");
  });

  it("links an old state without regIds on the next run, and drops links that do not fit a record", () => {
    const rc = W.openRegistry(setup(), "c1", meta);
    const old = W.normalizeState({ entities: [{ id: "n1", kind: "thing", name: "Silver sword", text: "A blade.", status: "active" }, { id: "n2", kind: "place", name: "The Hall", aliases: ["Hall of Mirrors"], text: "Mirrors.", status: "active" }] }, "c1");
    expect(old.regIds).toBeUndefined();
    W.applyReport(old, {}, ctxOf(rc));
    expect(old.regIds).toEqual({ n1: "o5", n2: "l3" });
    expect(W.normalizeState(JSON.parse(JSON.stringify(old)), "c1").regIds).toEqual({ n1: "o5", n2: "l3" });
    // a place cannot hold a t# and a person record cannot hold a l#
    const bad = W.normalizeState({ entities: [{ id: "n1", kind: "place", name: "Hall", text: "x", status: "active" }, { id: "n2", kind: "person", name: "Ren", text: "x", status: "active" }], regIds: { n1: "o5", n2: "l3" } }, "c1");
    expect(bad.regIds).toBeUndefined();
  });
});

describe("World place records and the registry", () => {
  it("writes inside as the linked parent's record name, whatever the spelling", () => {
    const rc = W.openRegistry(setup(), "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "place", name: "Hall of Mirrors", text: "A long hall." }] }, ctxOf(rc));
    W.applyReport(st, { add: [{ kind: "place", name: "Window nook", text: "A seat by the glass.", size: "spot", inside: "the hall of mirrors" }] }, ctxOf(rc));
    expect(st.entities.length).toBe(2);
    expect(st.entities[1].inside).toBe("Hall of Mirrors");
    // an update in yet another spelling does not change it, and counts for nothing
    expect(W.applyReport(st, { update: [{ name: "Window nook", inside: "The Hall Of Mirrors" }] }, ctxOf(rc))).toBe(0);
  });

  it("settles a parent named before it was recorded in the same report", () => {
    const rc = W.openRegistry(setup(), "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "place", name: "Window nook", text: "A seat.", size: "spot", inside: "the Hall of Mirrors" }, { kind: "place", name: "Hall of Mirrors", text: "A long hall." }] }, ctxOf(rc));
    expect(st.entities[0].inside).toBe("Hall of Mirrors");
  });
});

describe("the same place by id", () => {
  const stateWithHall = (rc: any) => {
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "place", name: "the hall", aliases: ["Hall of Mirrors"], text: "A long hall." }, { kind: "place", name: "Cellar", text: "Damp." }] }, ctxOf(rc));
    return st;
  };

  it("a scene whose clock.placeId is the record's id matches it even if the sensor wrote other words", () => {
    const fsx = setup({ clock: { place: "grand reception room", placeId: "l3" } });
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = stateWithHall(rc);
    expect(st.regIds.n1).toBe("l3");
    const scene = W.sceneOf(fsx, "c1", msgs);
    expect(scene.placeId).toBe("l3");
    expect(W.hereOf(st, scene, [], rc.reg).place.name).toBe("the hall");
    // words alone would not find it
    expect(W.hereOf(st, { ...scene, placeId: "" }, []).place).toBeNull();
  });

  it("another place id does not match a record by its words", () => {
    const fsx = setup({ clock: { place: "the hall", placeId: "l9" } });
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = stateWithHall(rc);
    const scene = W.sceneOf(fsx, "c1", msgs);
    expect(W.hereOf(st, scene, [], rc.reg).place).toBeNull();
    // an unlinked record still falls back to the words
    const loose = W.normalizeState({ entities: [{ id: "n1", kind: "place", name: "the hall", text: "x", status: "active" }] }, "c1");
    expect(W.hereOf(loose, scene, [], rc.reg).place.name).toBe("the hall");
  });

  it("the move check compares ids first and keeps lastPlaceId", () => {
    const st = W.emptyState("c1");
    st.lastPlace = W.placeKey("Hall of Mirrors");
    st.lastPlaceId = "l3";
    expect(W.placeMoved(st, { place: "the grand hall", placeId: "l3" })).toBe(false);
    expect(W.placeMoved(st, { place: "Hall of Mirrors", placeId: "l4" })).toBe(true);
    // an id missing on one side: the words decide
    expect(W.placeMoved(st, { place: "hall of  mirrors!", placeId: "" })).toBe(false);
    expect(W.placeMoved(st, { place: "Cellar", placeId: "" })).toBe(true);
    expect(W.normalizeState({ lastPlaceId: "l3" }, "c1").lastPlaceId).toBe("l3");
    expect(W.normalizeState({ lastPlaceId: "bad" }, "c1").lastPlaceId).toBeUndefined();
    // dueReason: the same id under new words is not a place change
    const st2 = W.normalizeState({ settings: { level: "chronicler", onPlace: true }, lastPlace: "hall of mirrors", lastPlaceId: "l3", lastKey: "a#0" }, "c1");
    const m = [{ id: "a", role: "assistant" }, { id: "b", role: "assistant" }, { id: "c", role: "assistant" }];
    expect(W.dueReason(st2, m, { place: "grand room", placeId: "l3", key: "c#0" })).not.toBe("place");
    expect(W.dueReason(st2, m, { place: "Hall of Mirrors", placeId: "l4", key: "c#0" })).toBe("place");
  });
});

describe("things here by id", () => {
  it("shows a linked thing once: the Dashboard holder wins and fills in a missing holder", () => {
    const fsx = setup({ clock: { place: "Hall of Mirrors", placeId: "l3" }, chars: { "Kaede Fuji": { items: [{ id: "o5", kind: "hold", text: "silver sword" }] } } });
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "thing", name: "the silver sword", text: "A blade.", place: "Cellar" }] }, ctxOf(rc));
    const h = W.hereOf(st, W.sceneOf(fsx, "c1", msgs), [], rc.reg);
    expect(h.held["Kaede Fuji"].map((t: any) => t.name)).toEqual(["the silver sword"]);
    expect(h.things).toEqual([]);
    expect(h.asleep).toEqual([]);
    // the note names it once: the sensor's "holds" line has it, the record is not repeated as "has"
    const note = W.hereInsert(h) as string;
    expect(note.match(/sword/gi)?.length).toBe(1);
    expect(note).toContain("holds");
  });

  it("a record lying in the DM's cellar is here when the Dashboard has it among the objects", () => {
    const fsx = setup({ clock: { place: "Hall of Mirrors", placeId: "l3" }, layout: { objects: [{ id: "o5", item: "silver sword", where: "on the table" }] } });
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "thing", name: "silver sword", text: "A blade.", place: "Cellar" }] }, ctxOf(rc));
    const h = W.hereOf(st, W.sceneOf(fsx, "c1", msgs), [], rc.reg);
    expect(h.things.map((t: any) => t.name)).toEqual(["silver sword"]);
    // and the sweep does not offer the object again
    expect(W.sweepCandidates(st, W.sceneOf(fsx, "c1", msgs)).things).toEqual([]);
  });

  it("two records of one registry thing are listed once; without a Dashboard id the records work as before", () => {
    const rc = W.openRegistry(setup(), "c1", meta);
    const st = W.normalizeState({ entities: [{ id: "n1", kind: "thing", name: "Silver sword", text: "A.", status: "active", holder: "Kaede Fuji" }, { id: "n2", kind: "thing", name: "Old blade", text: "B.", status: "active", holder: "Kaede Fuji" }], regIds: { n1: "o5", n2: "o5" } }, "c1");
    const h = W.hereOf(st, { place: "", present: ["Kaede Fuji"], chars: {}, objects: [] }, [], rc.reg);
    expect(h.held["Kaede Fuji"].map((t: any) => t.id)).toEqual(["n1"]);
    const plain = W.normalizeState({ entities: [{ id: "n1", kind: "thing", name: "Coin", text: "A.", status: "active", holder: "Kaede Fuji" }] }, "c1");
    expect(W.hereOf(plain, { place: "", present: ["Kaede Fuji"], chars: {}, objects: [] }, []).held["Kaede Fuji"].length).toBe(1);
  });
});

describe("objects kept by place id", () => {
  it("layout.byPlace of the scene's place id lists a linked record as lying here", () => {
    const fsx = setup({ clock: { place: "Hall of Mirrors", placeId: "l3" }, layout: { objects: [], byPlace: { l3: [{ id: "o5", item: "silver sword", where: "by the door" }] } } });
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "thing", name: "silver sword", text: "A blade.", place: "Cellar" }] }, ctxOf(rc));
    const scene = W.sceneOf(fsx, "c1", msgs);
    expect(scene.byPlace.l3[0].id).toBe("o5");
    expect(W.hereOf(st, scene, [], rc.reg).things.map((t: any) => t.name)).toEqual(["silver sword"]);
  });
});

describe("the DM names the tracker's id (ref)", () => {
  it("a thing named in another language links to the tracker's o# by ref, and the name becomes its alias", () => {
    const fsx = setup();
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "thing", name: "серебряный меч", text: "Клинок со стёртой рукоятью.", holder: "Kaede", ref: "o5" }] }, ctxOf(rc));
    expect(st.regIds).toEqual({ n1: "o5" });
    W.regFlush(fsx, rc);
    const file = JSON.parse(fsx.files["registry/c1.json"]!);
    expect(file.entities.filter((e: any) => e.kind === "thing").length).toBe(1);
    expect(file.entities.find((e: any) => e.id === "o5").aliases.map((a: any) => a.text)).toContain("серебряный меч");
  });

  it("a ref of the wrong kind, an unknown id or a made-up one is ignored", () => {
    const fsx = setup();
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [
      { kind: "thing", name: "лампа", text: "Медная.", ref: "l3" },
      { kind: "thing", name: "кружка", text: "Пустая.", ref: "o99" },
      { kind: "place", name: "подвал", text: "Сырой.", ref: "kitchen" },
    ] }, ctxOf(rc));
    expect(Object.values(st.regIds).every((id) => !["l3", "o5"].includes(id as string))).toBe(true);
  });

  it("an update with ref folds the World's own copy into the tracker's thing", () => {
    const fsx = setup();
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = W.emptyState("c1");
    W.applyReport(st, { add: [{ kind: "thing", name: "клинок", text: "Старый клинок." }] }, ctxOf(rc));
    const own = st.regIds.n1;
    expect(own).not.toBe("o5");
    W.applyReport(st, { update: [{ id: "n1", text: "Старый клинок, теперь в ножнах.", ref: "o5" }] }, ctxOf(rc));
    expect(st.regIds.n1).toBe("o5");
    W.regFlush(fsx, rc);
    const file = JSON.parse(fsx.files["registry/c1.json"]!);
    expect(file.entities.find((e: any) => e.id === own).merged).toBe("o5");
  });

  it("the sweep and the scene line show the tracker's ids", () => {
    const st = W.emptyState("c1");
    const scene = { place: "forest clearing", placeId: "l3", places: ["forest clearing"], objects: [{ id: "o5", item: "a vial", where: "at Ember's feet" }] };
    const sweep = W.sweepCandidates(st, scene);
    const text = W.dmInput({ cards: [], userName: "Taras", entities: [], msgs: [{ role: "assistant", name: "N", text: "Ember picks up the vial." }], place: scene.place, placeId: scene.placeId, sweep });
    expect(text).toContain("Where the scene is now (from the scene tracker): l3 forest clearing.");
    expect(text).toContain("Places: l3 forest clearing.");
    expect(text).toContain("Things: o5 a vial (at Ember's feet");
    expect(W.CHRONICLER_SYSTEM).toContain('"ref":"o3"');
  });
});
