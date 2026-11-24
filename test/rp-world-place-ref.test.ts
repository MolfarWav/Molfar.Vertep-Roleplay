/**
 * #514: a place ref the DM sent for a second record of the hall took the forest's registry id, so the scene's place stood on
 * the hall for the rest of the chat. A twin record loses its ref; a spot of the linked place may share the place's id.
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
const ctxOf = (rc: any) => ({ cards: ["Kaede Fuji"], userName: "Taras", now: 1, rc });

/** The chat of #514: the tracker saw "a dark forest under dense trees" (l2); the book already has the hall, now gone. */
function chat() {
  const reg = { v: 1, chatId: "c1", from: null, next: { p: 3, o: 6, l: 3 }, entities: [ent("l2", "place", "a dark forest under dense trees")], apart: [], suggest: [] };
  const fsx = memFs({ "characters/kaede/card.json": JSON.stringify(kaede), "registry/c1.json": JSON.stringify(reg) });
  const rc = W.openRegistry(fsx, "c1", meta);
  const st = W.emptyState("c1");
  W.applyReport(st, { add: [{ kind: "place", name: "Heavenly Hall", aliases: ["небесный чертог"], text: "The white hall of the goddess." }] }, ctxOf(rc));
  W.applyReport(st, { retire: [{ name: "Heavenly Hall", text: "Gone when she fell." }] }, ctxOf(rc));
  return { fsx, rc, st };
}

describe("a second record of a place the book has does not take a tracker id (#514)", () => {
  it("an add that shares an alias with another place record is left unlinked from the ref", () => {
    const { rc, st } = chat();
    W.applyReport(st, { add: [{ kind: "place", name: "Чертог Аурелии", aliases: ["небесный чертог", "чертог"], text: "An endless white hall.", ref: "l2" }] }, ctxOf(rc));
    const twin = st.entities.find((e: any) => e.name === "Чертог Аурелии");
    expect(twin).toBeTruthy();
    expect(st.regIds[twin.id]).not.toBe("l2");
    // the forest's id keeps its own names
    expect(rc.reg.entities.find((e: any) => e.id === "l2").aliases.map((a: any) => a.text)).not.toContain("небесный чертог");
  });

  it("an update that sends such a ref is not trusted either", () => {
    const { rc, st } = chat();
    W.applyReport(st, { add: [{ kind: "place", name: "Чертог Аурелии", aliases: ["небесный чертог"], text: "An endless white hall." }] }, ctxOf(rc));
    const twin = st.entities.find((e: any) => e.name === "Чертог Аурелии");
    W.applyReport(st, { update: [{ id: twin.id, text: "The hall is gone.", ref: "l2" }] }, ctxOf(rc));
    expect(st.regIds[twin.id]).not.toBe("l2");
  });

  it("a record with names of its own still links by ref, in another language", () => {
    const { rc, st } = chat();
    W.applyReport(st, { add: [{ kind: "place", name: "Темный лес", aliases: ["лес"], text: "A forest under dense trees.", ref: "l2" }] }, ctxOf(rc));
    const forest = st.entities.find((e: any) => e.name === "Темный лес");
    expect(st.regIds[forest.id]).toBe("l2");
    expect(rc.reg.entities.find((e: any) => e.id === "l2").aliases.map((a: any) => a.text)).toContain("Темный лес");
  });
});

describe("a spot of the linked place shares its id (#514)", () => {
  function withForest() {
    const c = chat();
    W.applyReport(c.st, { add: [{ kind: "place", name: "Темный лес", aliases: ["лес"], text: "A forest under dense trees.", ref: "l2" }] }, ctxOf(c.rc));
    return { ...c, forest: c.st.entities.find((e: any) => e.name === "Темный лес") };
  }

  it("an add of a spot with the parent's ref is a record of its own and does not rewrite the parent", () => {
    const { rc, st, forest } = withForest();
    W.applyReport(st, { add: [{ kind: "place", name: "Лагерь бандитов", size: "spot", inside: "Темный лес", text: "A wrecked camp.", ref: "l2" }] }, ctxOf(rc));
    const camp = st.entities.find((e: any) => e.name === "Лагерь бандитов");
    expect(camp).toBeTruthy();
    expect(camp.size).toBe("spot");
    expect(forest.text).toBe("A forest under dense trees.");
    expect(st.regIds[camp.id]).toBe("l2");
    expect(st.regIds[forest.id]).toBe("l2");
  });

  it("the scene's record is the spot while the tracker's place is the forest", () => {
    const { rc, st } = withForest();
    W.applyReport(st, { add: [{ kind: "place", name: "Лагерь бандитов", size: "spot", inside: "Темный лес", text: "A wrecked camp.", ref: "l2" }] }, ctxOf(rc));
    const rec = W.placeRecordOf(st, { place: "dark forest, camp with loot", placeId: "l2" }, rc.reg);
    expect(rec && rec.name).toBe("Лагерь бандитов");
  });

  it("an update that makes a record a spot of the forest links it to the forest's id and merges its own copy", () => {
    const { rc, st } = withForest();
    W.applyReport(st, { add: [{ kind: "place", name: "Лагерь бандитов", text: "A camp in the woods." }] }, ctxOf(rc));
    const camp = st.entities.find((e: any) => e.name === "Лагерь бандитов");
    const own = st.regIds[camp.id];
    expect(own).not.toBe("l2");
    W.applyReport(st, { update: [{ id: camp.id, size: "spot", inside: "Темный лес", text: "A wrecked camp.", ref: "l2" }] }, ctxOf(rc));
    expect(st.regIds[camp.id]).toBe("l2");
    expect(rc.reg.entities.find((e: any) => e.id === own).merged).toBe("l2");
  });

  it("a record that is not a spot of the linked one still cannot share the id", () => {
    const { rc, st } = withForest();
    W.applyReport(st, { add: [{ kind: "place", name: "Лагерь бандитов", text: "A camp in the woods." }] }, ctxOf(rc));
    const camp = st.entities.find((e: any) => e.name === "Лагерь бандитов");
    W.applyReport(st, { update: [{ id: camp.id, text: "A wrecked camp.", ref: "l2" }] }, ctxOf(rc));
    expect(st.regIds[camp.id]).not.toBe("l2");
  });
});

describe("the DM is told when the scene's place names a part (#514)", () => {
  it("offers the linked place again with the unlinked records, only while its text has two levels", () => {
    const { rc, st } = chat();
    W.applyReport(st, { add: [{ kind: "place", name: "Темный лес", text: "A forest.", ref: "l2" }, { kind: "place", name: "Лагерь бандитов", text: "A camp." }] }, ctxOf(rc));
    const two = W.trackedThings(st, { place: "dark forest, camp with loot", placeId: "l2", objects: [], chars: {} }, rc, { things: [] });
    expect(two.map((t: any) => t.id)).toEqual(["l2"]);
    expect(two[0].where).toContain("Лагерь бандитов");
    expect(two[0].where).toContain("size spot");
    const one = W.trackedThings(st, { place: "dark forest", placeId: "l2", objects: [], chars: {} }, rc, { things: [] });
    expect(one).toEqual([]);
  });

  it("stops offering once the camp is linked to the forest's id", () => {
    const { rc, st } = chat();
    W.applyReport(st, { add: [{ kind: "place", name: "Темный лес", text: "A forest.", ref: "l2" }, { kind: "place", name: "Лагерь бандитов", text: "A camp." }] }, ctxOf(rc));
    const camp = st.entities.find((e: any) => e.name === "Лагерь бандитов");
    W.applyReport(st, { update: [{ id: camp.id, size: "spot", inside: "Темный лес", ref: "l2" }] }, ctxOf(rc));
    expect(W.trackedThings(st, { place: "dark forest, camp with loot", placeId: "l2", objects: [], chars: {} }, rc, { things: [] })).toEqual([]);
  });
});
