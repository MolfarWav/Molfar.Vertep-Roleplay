// The anime fantasy level (Molfar.Vertep#500) and the "life intervenes" texts that follow the level (a profile block).
import { describe, expect, it } from "bun:test";
import { applyLevel, defaultBlocks, emptyState, handleRoute, lifeBlock, lifeInsert, lifeTiers, LEVELS, systemFor } from "../plugins/world/plugin.js";

function memHost(files: Record<string, string> = {}) {
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
    llm: { request: () => {}, results: {} },
  };
  return { host, files };
}
const route = (h: any, method: string, p: string, body?: unknown) => handleRoute({ method, path: p, query: {}, body }, h) as any;

describe("the anime level", () => {
  it("is a level of its own, with hard events, its own rules and the ladder", () => {
    expect(LEVELS).toContain("anime");
    const sys = systemFor("anime");
    expect(sys).toContain("anime fantasy");
    expect(sys).toContain("Never jump from nothing to the reveal");
    expect(sys).toContain('"delivered"');
    expect(defaultBlocks("anime").event).toContain("must happen");
  });

  it("sends events in a fight, like the antagonist; the director waits", () => {
    for (const [level, sent] of [["anime", true], ["director", false]] as const) {
      const st = emptyState("c1");
      applyLevel(st, { event: { text: "Her palm glows." } }, { level, direction: "combat", now: 1 });
      expect(!!st.event).toBe(sent);
    }
  });

  it("its built-in profile reads news by the clock unless the player turns it off", () => {
    const m = memHost({});
    const list = route(m.host, "GET", "/world/profiles").json.profiles;
    expect(list.find((p: any) => p.id === "anime").options.eventByClock).toBe(true);
    expect(list.find((p: any) => p.id === "director").options.eventByClock).toBe(false);
    const after = route(m.host, "PUT", "/world/profiles", { id: "anime", options: { eventByClock: false } }).json.profiles;
    expect(after.find((p: any) => p.id === "anime").options.eventByClock).toBe(false);
  });
});

describe("life intervenes follows the level", () => {
  it("each level with events has a life block of three lines; the antagonist keeps the old text", () => {
    expect(defaultBlocks("chronicler").life).toBeUndefined();
    for (const l of ["living", "director", "antagonist", "anime", "fanservice", "chaos"]) expect(Object.keys(lifeTiers(defaultBlocks(l).life))).toEqual(["minor", "notable", "major"]);
    expect(lifeTiers(lifeBlock("antagonist")).major).toBe("a large turn: a danger, a revelation or a reversal the scene must answer");
    expect(lifeTiers(lifeBlock("director")).major).toContain("danger only where the story is already dangerous");
    expect(lifeTiers(lifeBlock("anime")).major).toContain("the hidden world breaks through");
  });

  it("the insert uses the block; a broken or missing line keeps the built-in one", () => {
    expect(lifeInsert({ tier: "major" } as any, lifeBlock("anime"))).toContain("the hidden world breaks through");
    const own = lifeTiers("major: a dragon lands\nnonsense line");
    expect(own.major).toBe("a dragon lands");
    expect(own.minor).toBe(lifeTiers("").minor);
    expect(lifeInsert({ tier: "minor" } as any)).toContain("a change of light or weather");
  });

  it("a player's edit of the block is kept per profile and resets alone", () => {
    const m = memHost({});
    const list = route(m.host, "PUT", "/world/profiles", { id: "director", blocks: { life: "major: a letter arrives" } }).json.profiles;
    const life = list.find((p: any) => p.id === "director").blocks.find((b: any) => b.key === "life");
    expect(life).toMatchObject({ text: "major: a letter arrives", changed: true });
    const back = route(m.host, "PUT", "/world/profiles", { id: "director", blocks: { life: null } }).json.profiles;
    expect(back.find((p: any) => p.id === "director").blocks.find((b: any) => b.key === "life").changed).toBe(false);
  });
});
