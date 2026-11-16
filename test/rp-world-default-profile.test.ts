/**
 * World DM: a default profile for new chats. `defaultProfile` in the World's config (all chats) names the profile a chat
 * starts with when the DM switches itself on; "" is the chronicler. Chats that already have a state file keep theirs.
 */
import { describe, expect, it } from "bun:test";
import { handleRoute, loadConfig, startSettings } from "../plugins/world/plugin.js";

function memFs(files: Record<string, string>) {
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

const seed = (): Record<string, string> => ({
  "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", model: "c/chat" }),
  "chats/c1.jsonl": JSON.stringify({ id: "m0", role: "char", name: "Odarka", text: "Odarka stirs the pot.", swipe: 0 }) + "\n",
  "settings.json": JSON.stringify({ model: "c/default" }),
});

const world = (files: Record<string, string>, method: string, path: string, body?: unknown, query: Record<string, string> = {}) =>
  handleRoute({ method, path, query, body }, { fs: memFs(files) }) as any;

const setDefault = (files: Record<string, string>, id: string) => world(files, "PUT", "/world/config", { defaultProfile: id });
const stateOf = (files: Record<string, string>, chatId = "c1") => world(files, "GET", "/world/state", undefined, { chatId }).json;
const defaultOf = (files: Record<string, string>) => world(files, "GET", "/world/profiles").json.profiles.filter((p: any) => p.default).map((p: any) => p.id);

describe("default profile: the config", () => {
  it("is empty out of the box, and the chronicler is the one marked default", () => {
    const files = seed();
    expect(world(files, "GET", "/world/config").json.defaultProfile).toBe("");
    expect(defaultOf(files)).toEqual(["chronicler"]);
  });

  it("a built-in level above the chronicler can be chosen, and only the difference is stored", () => {
    const files = seed();
    expect(setDefault(files, "director").json.defaultProfile).toBe("director");
    expect(JSON.parse(files["world/config.json"]!)).toEqual({ defaultProfile: "director" });
    expect(defaultOf(files)).toEqual(["director"]);
  });

  it("choosing the chronicler (or an empty value) puts the lowest level back and removes the file", () => {
    const files = seed();
    setDefault(files, "director");
    expect(setDefault(files, "chronicler").json.defaultProfile).toBe("");
    expect(files["world/config.json"]).toBeUndefined();
    setDefault(files, "living");
    setDefault(files, "");
    expect(defaultOf(files)).toEqual(["chronicler"]);
  });

  it("a profile that does not exist is refused, the DM 'off' is not a profile, and nothing is saved", () => {
    const files = seed();
    expect(setDefault(files, "p-nope").status).toBe(400);
    expect(setDefault(files, "off").status).toBe(400);
    expect(files["world/config.json"]).toBeUndefined();
  });

  it("saving a model keeps the default, and the default does not wipe the models", () => {
    const files = seed();
    setDefault(files, "director");
    world(files, "PUT", "/world/config", { buildModel: "c/builder" });
    expect(JSON.parse(files["world/config.json"]!)).toEqual({ buildModel: "c/builder", defaultProfile: "director" });
  });
});

describe("default profile: a new chat starts with it", () => {
  it("without a choice the chat starts on the chronicler, as before", () => {
    const files = seed();
    const s = stateOf(files);
    expect([s.settings.level, s.settings.profile]).toEqual(["chronicler", ""]);
  });

  it("a built-in default gives the level and the profile's numbers", () => {
    const files = seed();
    files["world/profiles/director.json"] = JSON.stringify({ defaults: { everyN: 3, stagnation: 4, onTransition: false, insert: true } });
    setDefault(files, "director");
    const s = stateOf(files);
    expect(s.settings.level).toBe("director");
    expect(s.settings.profile).toBe("");
    expect([s.settings.everyN, s.settings.stagnation, s.settings.onTransition]).toEqual([3, 4, false]);
    expect(s.profile).toBe("director");
  });

  it("an own profile as the default runs the chat on its base, under its own id", () => {
    const files = seed();
    files["world/profiles/p-calm.json"] = JSON.stringify({ v: 1, name: "Calm", base: "living", defaults: { everyN: 7 } });
    setDefault(files, "p-calm");
    const s = stateOf(files);
    expect([s.settings.level, s.settings.profile, s.settings.everyN]).toEqual(["living", "p-calm", 7]);
    expect(s.profile).toBe("p-calm");
  });

  it("a chat that already has a state file keeps its own settings, switched off or not", () => {
    const files = seed();
    files["world/state/c1.json"] = JSON.stringify({ v: 1, chatId: "c1", settings: { level: "off" } });
    setDefault(files, "director");
    expect(stateOf(files).settings.level).toBe("off");
    files["world/state/c1.json"] = JSON.stringify({ v: 1, chatId: "c1", settings: { level: "chronicler" } });
    expect(stateOf(files).settings.level).toBe("chronicler");
  });

  it("the first save of a chat that has no file (a dice change, say) starts it with the default too", () => {
    const files = seed();
    setDefault(files, "antagonist");
    const saved = world(files, "PUT", "/world/settings", { chatId: "c1", dice: "strict" }).json;
    expect(saved.settings.level).toBe("antagonist");
    expect(saved.settings.dice).toBe("strict");
  });

  it("choosing a profile on the chat itself still wins over the default", () => {
    const files = seed();
    setDefault(files, "director");
    const saved = world(files, "PUT", "/world/settings", { chatId: "c1", profile: "living" }).json;
    expect(saved.settings.level).toBe("living");
  });
});

describe("default profile: it goes away with its profile", () => {
  it("deleting the default own profile makes new chats start on the chronicler again", () => {
    const files = seed();
    files["world/profiles/p-calm.json"] = JSON.stringify({ v: 1, name: "Calm", base: "living" });
    setDefault(files, "p-calm");
    expect(defaultOf(files)).toEqual(["p-calm"]);
    const after = world(files, "DELETE", "/world/profiles", undefined, { id: "p-calm" }).json.profiles;
    expect(after.filter((p: any) => p.default).map((p: any) => p.id)).toEqual(["chronicler"]);
    expect(files["world/config.json"]).toBeUndefined();
    expect(stateOf(files).settings.level).toBe("chronicler");
  });

  it("a default that vanished behind the code's back is the chronicler, quietly", () => {
    const files = seed();
    files["world/config.json"] = JSON.stringify({ defaultProfile: "p-gone" });
    expect(defaultOf(files)).toEqual(["chronicler"]);
    expect(stateOf(files).settings.level).toBe("chronicler");
  });

  it("deleting another profile leaves the default alone", () => {
    const files = seed();
    files["world/profiles/p-a.json"] = JSON.stringify({ v: 1, name: "A", base: "living" });
    setDefault(files, "director");
    world(files, "DELETE", "/world/profiles", undefined, { id: "p-a" });
    expect(JSON.parse(files["world/config.json"]!)).toEqual({ defaultProfile: "director" });
  });
});

describe("startSettings", () => {
  it("keeps the other settings of the state it is given and never returns the DM off", () => {
    const files = seed();
    const fsx = memFs(files);
    const base = { level: "off", everyN: 5, textMax: 1234, profile: "" };
    expect(startSettings(fsx, base, { defaultProfile: "" }).level).toBe("chronicler");
    const next = startSettings(fsx, base, { defaultProfile: "chaos" });
    expect(next.level).toBe("chaos");
    expect(next.textMax).toBe(1234);
    expect(loadConfig(fsx).defaultProfile).toBe("");
  });
});
