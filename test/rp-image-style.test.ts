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
