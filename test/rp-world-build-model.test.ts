/**
 * World DM: the model that builds worlds (#164). World settings shows a "Build model" row backed by
 * `buildModel` in the World's config; `build` in the config says which model is in force and where it
 * came from, so the line under the Build button and the settings row agree.
 */
import { describe, expect, it } from "bun:test";
import { buildModel, handleRoute } from "../plugins/world/plugin.js";

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
  "settings.json": JSON.stringify({ model: "c/default" }),
});

const route = (files: Record<string, string>, method: string, body?: unknown, query: Record<string, string> = {}) =>
  handleRoute({ method, path: "/world/config", query, body }, { fs: memFs(files) }) as any;

describe("world build model", () => {
  it("with nothing stored, the chat's model builds, else the app's default; `from` says which", () => {
    const files = seed();
    expect(route(files, "GET", undefined, { chatId: "c1" }).json.build).toEqual({ model: "c/chat", from: "chat" });
    expect(route(files, "GET").json.build).toEqual({ model: "c/default", from: "default" });
    expect(buildModel(memFs(files), { buildModel: "" }, { model: "c/chat" })).toEqual({ model: "c/chat", from: "chat" });
  });

  it("a stored build model wins over the chat's and the default, for any chat", () => {
    const files = seed();
    const put = route(files, "PUT", { buildModel: "c/builder" }, { chatId: "c1" }).json;
    expect(put.buildModel).toBe("c/builder");
    expect(put.build).toEqual({ model: "c/builder", from: "world" });
    expect(route(files, "GET").json.build).toEqual({ model: "c/builder", from: "world" });
    expect(JSON.parse(files["world/config.json"]!)).toEqual({ buildModel: "c/builder" });
    // the play model is a separate choice
    expect(route(files, "GET", undefined, { chatId: "c1" }).json.play).toEqual({ model: "c/chat", from: "chat" });
  });

  it("an unusable value is dropped, and clearing returns to the old fallback chain", () => {
    const files = seed();
    route(files, "PUT", { buildModel: "c/builder" });
    expect(route(files, "PUT", { buildModel: "has spaces" }).json.build).toEqual({ model: "c/default", from: "default" });
    route(files, "PUT", { buildModel: "c/builder" });
    const cleared = route(files, "PUT", { buildModel: "" }, { chatId: "c1" }).json;
    expect([cleared.buildModel, cleared.build]).toEqual(["", { model: "c/chat", from: "chat" }]);
    expect(files["world/config.json"]).toBeUndefined();
  });

  it("saving the play model keeps the build model", () => {
    const files = seed();
    route(files, "PUT", { buildModel: "c/builder" });
    const r = route(files, "PUT", { model: "c/dm" }).json;
    expect([r.model, r.buildModel, r.build.from, r.play.from]).toEqual(["c/dm", "c/builder", "world", "world"]);
  });
});
