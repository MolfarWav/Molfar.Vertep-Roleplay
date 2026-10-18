import { beforeAll, describe, it, expect } from "bun:test";

let resolvePromptStyle: typeof import("../src/lib/image-gen").resolvePromptStyle;
beforeAll(async () => {
  // src/lib/engine.ts reads location when it loads
  (globalThis as any).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
  ({ resolvePromptStyle } = await import("../src/lib/image-gen"));
});

describe("resolvePromptStyle", () => {
  it("an explicit choice wins", () => {
    expect(resolvePromptStyle({ promptStyle: "description", modelApi: "comfyui" })).toBe("description");
    expect(resolvePromptStyle({ promptStyle: "tags", modelApi: "openrouter-images" })).toBe("tags");
  });
  it("auto follows the backend: ComfyUI and Forge write tags", () => {
    expect(resolvePromptStyle({ promptStyle: "auto", modelApi: "comfyui" })).toBe("tags");
    expect(resolvePromptStyle({ modelApi: "a1111" })).toBe("tags");
    expect(resolvePromptStyle({ modelApi: "openrouter-images" })).toBe("description");
    expect(resolvePromptStyle({})).toBe("description");
    expect(resolvePromptStyle(undefined)).toBe("description");
  });
});

describe("sortImageFavorites", () => {
  it("puts the user's list first in its order, with names, and keeps the rest", async () => {
    (globalThis as { location?: unknown }).location ??= { origin: "http://localhost", pathname: "/" };
    const { sortImageFavorites } = await import("../src/lib/engine");
    const m = (provider: string, id: string, api = "openrouter-images") => ({ provider, id, label: id, api, connectionName: null });
    const out = sortImageFavorites([m("or", "a"), m("or", "b"), m("comfy", "c", "comfyui")], [{ ref: "comfy/c", name: "Local", use: "backgrounds" }, { ref: "gone/x" }, { ref: "or/b" }]);
    expect(out.map((x) => `${x.provider}/${x.id}`)).toEqual(["comfy/c", "or/b", "or/a"]);
    expect(out[0]!.favorite).toEqual({ name: "Local", use: "backgrounds" });
    expect(out[1]!.favorite).toEqual({});
    expect(out[2]!.favorite).toBeUndefined();
  });
});
