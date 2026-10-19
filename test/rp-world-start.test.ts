// World DM P3 stage 3: building a world from the chat's cards (recipes, sources, chunks, build prompts).
import { describe, expect, it } from "bun:test";
import { buildInput, chunkSources, listRecipes, recipeOf, startPlan, startSources } from "../plugins/world/plugin.js";

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
