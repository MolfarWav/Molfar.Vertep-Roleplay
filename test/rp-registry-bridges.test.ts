/**
 * The entity registry's bridges (#240, docs/ENTITY-REGISTRY.md): the World DM and Litopys resolve names through the chat's
 * registry, so a person keeps one name across the two and the Dashboard.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson as readDisk, story, useRoot, writeJson } from "./rp-memory-m2-kit";

// world.ts reaches engine.ts, which reads the frame URL at import time
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const W = (await import("../plugins/world/plugin.js")) as Record<string, any>;

useRoot();

/** In-memory data folder for the World DM (the host's fs shape). */
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
const sera = { name: "Queen Seraphina", description: "The ruler of the valley.\nAliases: Seraphina" };

describe("World DM and the registry", () => {
  const meta = { id: "c1", userName: "Taras", characterId: "kaede" };
  const setup = (extra: Record<string, string> = {}) => memFs({ "characters/kaede/card.json": JSON.stringify(kaede), ...extra });

  it("seeds the chat's registry from its cards and the persona, once", () => {
    const fsx = setup();
    const rc = W.openRegistry(fsx, "c1", meta);
    expect(rc.reg.entities.map((e: any) => [e.id, e.name, e.src])).toEqual([["user", "Taras", "persona"], ["p1", "Kaede Fuji", "card"]]);
    const saved = fsx.files["registry/c1.json"];
    expect(saved).toBeTruthy();
    W.openRegistry(fsx, "c1", meta);
    expect(fsx.files["registry/c1.json"]).toBe(saved);
  });

  it("lists the card characters with the names they answer to", () => {
    const rc = W.openRegistry(setup(), "c1", meta);
    const cast = W.castOf(rc, ["Kaede Fuji"]);
    expect(cast).toEqual(["Kaede Fuji (also Kaede)"]);
    const input = W.dmInput({ cards: cast, userName: "Taras", entities: [], msgs: [] });
    expect(input).toContain("own cards (do not record): Kaede Fuji (also Kaede).");
  });

  it("skips a card character or the user under another spelling, folds an NPC spelled two ways into one record", () => {
    const fsx = setup();
    const rc = W.openRegistry(fsx, "c1", meta);
    const st = W.emptyState("c1");
    const ctx = { cards: ["Kaede Fuji"], userName: "Taras", now: 1, rc };
    const n = W.applyReport(
      st,
      { add: [
        { kind: "person", name: "Каэде", text: "A swordswoman." },
        { kind: "person", name: "Kaede", text: "Again." },
        { kind: "person", name: "Sir Lego", text: "A knight of the gate." },
      ] },
      ctx,
    );
    expect(n).toBe(1);
    expect(st.entities.map((e: any) => e.name)).toEqual(["Sir Lego"]);
    // "Lego" is the same NPC: an update, not a second record
    const again = W.applyReport(st, { add: [{ kind: "person", name: "Lego", text: "A knight, now wounded." }] }, ctx);
    expect(again).toBe(1);
    expect(st.entities.length).toBe(1);
    expect(st.entities[0].text).toBe("A knight, now wounded.");
    expect(st.entities[0].aliases).toContain("Lego");
    // the record keeps the registry id; the NPC is in the registry file with src world
    expect(st.regIds).toEqual({ n1: "p2" });
    W.regFlush(fsx, rc);
    const file = JSON.parse(fsx.files["registry/c1.json"]!);
    expect(file.entities.find((e: any) => e.id === "p2")).toMatchObject({ name: "Sir Lego", src: "world" });
    // an update by another spelling finds the record too
    W.applyReport(st, { update: [{ name: "lego", text: "Healed." }] }, ctx);
    expect(st.entities[0].text).toBe("Healed.");
    // the mapping survives the state file
    expect(W.normalizeState(JSON.parse(JSON.stringify(st)), "c1").regIds).toEqual({ n1: "p2" });
  });

  it("writes a holder as the canonical name: the card's name, the user as `user`", () => {
    const rc = W.openRegistry(setup(), "c1", meta);
    const st = W.emptyState("c1");
    const ctx = { cards: ["Kaede Fuji"], userName: "Taras", now: 1, rc };
    W.applyReport(st, { add: [{ kind: "thing", name: "Iron key", text: "Opens the gate.", holder: "Kaede" }, { kind: "thing", name: "Lamp", text: "Old.", holder: "Taras" }, { kind: "thing", name: "Map", text: "Torn.", holder: "the innkeeper" }] }, ctx);
    expect(st.entities.map((e: any) => e.holder)).toEqual(["Kaede Fuji", "user", "the innkeeper"]);
    W.applyReport(st, { update: [{ id: "n3", holder: "Каэде" }] }, ctx);
    expect(st.entities[2].holder).toBe("Kaede Fuji");
    // the Dashboard's display name for the id wins when it has one
    const rc2 = { ...rc, ids: { "Kaede-chan": "p1" } };
    const st2 = W.emptyState("c1");
    W.applyReport(st2, { add: [{ kind: "thing", name: "Iron key", text: "Opens the gate.", holder: "Kaede" }] }, { ...ctx, rc: rc2 });
    expect(st2.entities[0].holder).toBe("Kaede-chan");
  });

  it("keeps carry under one key per person and shows the user's character by name in the scene", () => {
    const rc = W.openRegistry(setup(), "c1", meta);
    const st = W.emptyState("c1");
    const ctx = { cards: ["Kaede Fuji"], userName: "Taras", now: 1, rc };
    expect(W.applyCarry(st, [{ who: "Kaede", wearing: ["blue kimono"] }, { who: "taras", wearing: ["jacket"] }, { who: "Ren", wearing: ["scarf"] }], ctx)).toEqual(["Kaede Fuji", "user"]);
    expect(Object.keys(st.carry)).toEqual(["Kaede Fuji", "user"]);
    // the same person under another spelling updates that key
    expect(W.applyCarry(st, [{ who: "Каэде", wearing: ["red kimono"] }], ctx)).toEqual(["Kaede Fuji"]);
    expect(st.carry["Kaede Fuji"].wearing).toEqual(["red kimono"]);
    // the scene sees the user's key as the user's name
    st.settings.carrySource = "dm";
    const h = W.hereOf(st, { place: "", present: ["Taras", "Kaede Fuji"] }, ["Taras"]);
    expect(Object.keys(h.carry).sort()).toEqual(["Kaede Fuji", "Taras"]);
  });
});

describe("Litopys and the registry", () => {
  const meta = { id: "c1", userName: "Taras", groupId: "g1" };
  const prep = () => {
    writeJson("characters/kaede/card.json", kaede);
    writeJson("characters/sera/card.json", sera);
    writeJson("groups/g1.json", { memberIds: ["kaede", "sera"] });
  };
  const work = { scene: { from: "m1", to: "m6", fromIdx: 0, toIdx: 5, count: 6, kind: "scene", label: "" }, replaces: null };

  it("stores facts under the canonical name: card person, user, world, unknown", () => {
    prep();
    const { host } = mockHost();
    const canon = L.litCanon(host.fs, "c1", meta, {}, true);
    expect(canon("Каэде")).toBe("Kaede Fuji");
    expect(canon("Seraphina")).toBe("Queen Seraphina");
    expect(canon("taras")).toBe("Taras");
    expect(canon("world")).toBe("world");
    expect(canon("The innkeeper")).toBe("The innkeeper");
    const st = L.emptyChat("c1");
    const facts = [
      { op: "add", text: "Kaede swore an oath to the queen.", subject: "Каэде", knownBy: ["Seraphina", "Taras", "Taras"] },
      { op: "add", text: "The bridge is old.", subject: "world", knownBy: "all" },
      { op: "add", text: "The innkeeper hides a key.", subject: "The innkeeper", knownBy: ["The innkeeper"] },
    ];
    L.applyWorkerResult(st, work, L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" }, facts })), { now: 5, line: L.activeLine(story(10)), canon, userName: "Taras" });
    expect(st.facts.map((f: any) => [f.subject, f.knownBy])).toEqual([
      ["Kaede Fuji", ["Kaede Fuji", "Queen Seraphina", "Taras"]],
      ["world", "all"],
      ["The innkeeper", ["The innkeeper"]],
    ]);
    // the registry was seeded on disk, with no person made from a name Litopys only met
    const reg = readDisk("registry/c1.json");
    expect(reg.entities.map((e: any) => e.name)).toEqual(["Taras", "Kaede Fuji", "Queen Seraphina"]);
  });

  it("recollections are kept per canonical name", () => {
    prep();
    const { host } = mockHost();
    const canon = L.litCanon(host.fs, "c1", meta, {}, true);
    const views = L.cleanViews([{ who: "Seraphina", text: "She remembers the oath." }, { who: "Queen Seraphina", text: "dup" }, { who: "Nobody", text: "x" }], ["Queen Seraphina", "Kaede Fuji"], 300, canon);
    expect(views).toEqual([{ who: "Queen Seraphina", text: "She remembers the oath." }]);
  });

  it("a knownBy in an alias spelling still lets that character see the fact", () => {
    prep();
    const { host } = mockHost();
    const canon = L.litCanon(host.fs, "c1", meta, {}, true);
    const st = L.emptyChat("c1");
    st.facts.push({ id: "f1", text: "The vault code is 4417.", subject: "world", knownBy: ["Seraphina"], type: "event", weight: "everyday", pinned: false, status: "active", at: 1, updatedAt: 1 });
    const ln = L.activeLine(story(4));
    const dash = { snapshots: { "m4#0": { clock: { day: 1, time: null, place: null }, present: ["Queen Seraphina", "Taras"] } } };
    const base = { st, line: ln, dash, meta, cfg: { ...L.DEFAULT_CONFIG }, scanText: "", speakerName: "Queen Seraphina", used: {}, voices: new Set(["queen seraphina"]) };
    expect(L.buildInsert(base)).toBeNull();
    const withReg = L.buildInsert({ ...base, canon });
    expect(withReg.factIds).toEqual(["f1"]);
    // someone else's reply does not get it
    expect(L.buildInsert({ ...base, canon, speakerName: "Kaede Fuji", voices: new Set(["kaede fuji"]) })).toBeNull();
    // the worker's known facts follow the same rule
    const req = L.buildWorkerRequest(st, { ...work, scene: { ...work.scene, toIdx: 3 } }, ln, dash, { ...L.DEFAULT_CONFIG, ...L.DEFAULT_PROMPTS }, meta, { canon });
    expect(req.messages[0].content).toContain("Known facts");
  });

  it("without a registry nothing changes", () => {
    const st = L.emptyChat("c1");
    L.applyWorkerResult(st, work, L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" }, facts: [{ op: "add", text: "A thing.", subject: "Kaede", knownBy: ["Seraphina"] }] })), { now: 5, line: L.activeLine(story(10)) });
    expect(st.facts[0].subject).toBe("Kaede");
    expect(st.facts[0].knownBy).toEqual(["Kaede", "Seraphina"]);
  });
});
