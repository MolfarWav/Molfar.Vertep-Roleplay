/**
 * Portraits for cards without one (plugins/profile/plugin.js POST /profile/portrait-prompt): the two-phase route, the
 * model chain, tags or a paragraph, what is read from the card, and what comes back clean. The client side (which
 * cards need a portrait, the style of the picked image model) is tested here too.
 */
import { describe, expect, it } from "bun:test";
import { cleanPortraitDesc, cleanPortraitTags, handleRoute, portraitContent } from "../plugins/profile/plugin.js";

(globalThis as any).location ??= { pathname: "/app/nimrod/roleplay/", host: "127.0.0.1:8788", protocol: "http:", href: "http://127.0.0.1:8788/" };
const { missingPortraits, needsPortrait } = await import("../src/lib/portrait-draw");
const { imageTargetOf } = await import("../src/lib/image-gen");

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; spec: Record<string, any> }[] = [];
  const host = {
    fs: {
      read: (p: string) => { if (!(p in files)) throw new Error("ENOENT " + p); return files[p]!; },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
    },
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results },
  };
  return { host, files, results, requests };
}
const post = (body: unknown) => ({ method: "POST", path: "/profile/portrait-prompt", query: {}, body });
const card = (o: Record<string, unknown> = {}) => JSON.stringify({ name: "Cecily", description: "A tall girl with red hair and green eyes, in a school uniform.", personality: "Quiet.", scenario: "", ...o });
const files = (extra: Record<string, string> = {}) => ({ "characters/cec/card.json": card(), "settings.json": JSON.stringify({ model: "c/default", ui: { cardTasks: { model: "c/cards" } } }), ...extra });

describe("POST /profile/portrait-prompt", () => {
  it("asks the card tasks model once, with the card's own words, then answers with the clean description", () => {
    const m = memHost(files());
    const req = post({ characterId: "cec" });
    expect((handleRoute(req, m.host) as { __llmPending?: boolean }).__llmPending).toBe(true);
    const spec = m.requests[0]!.spec;
    expect(m.requests[0]!.key).toBe("portrait");
    expect(spec.model).toBe("c/cards");
    expect(spec.systemPrompt).toContain("plain visual description");
    expect(spec.systemPrompt).not.toContain("Danbooru");
    expect(spec.messages[0].content).toContain("Name: Cecily");
    expect(spec.messages[0].content).toContain("red hair");
    m.results.portrait = { text: "Here is the portrait: A tall young woman with red hair.\n", model: "c/cards" };
    const out = handleRoute(req, m.host) as { json: { ok: boolean; prompt: string } };
    expect(out.json).toMatchObject({ ok: true, prompt: "A tall young woman with red hair." });
    // nothing is written
    expect(Object.keys(m.files).sort()).toEqual(["characters/cec/card.json", "settings.json"]);
  });

  it("style tags: the tag rules, and the reply is cut to clean tags", () => {
    const m = memHost(files());
    const req = post({ characterId: "cec", style: "tags", guide: "Use booru tags." });
    handleRoute(req, m.host);
    expect(m.requests[0]!.spec.systemPrompt).toContain("Danbooru");
    expect(m.requests[0]!.spec.systemPrompt).toContain("Use booru tags.");
    m.results.portrait = { text: "1girl, Red Hair, solo, green eyes, 1girl, <b>x</b>, portrait", model: "m" };
    const out = handleRoute(req, m.host) as { json: { prompt: string } };
    expect(out.json.prompt).toBe("1girl, red_hair, solo, green_eyes, portrait");
  });

  it("reads the editor's working text over the saved card, and its own model pick over the chain", () => {
    const m = memHost(files({ "characters/cec/card-tasks.json": JSON.stringify({ model: "c/own" }) }));
    handleRoute(post({ characterId: "cec", card: { description: "Short and blue-haired." } }), m.host);
    expect(m.requests[0]!.spec.messages[0].content).toContain("blue-haired");
    expect(m.requests[0]!.spec.messages[0].content).not.toContain("red hair");
    expect(m.requests[0]!.spec.model).toBe("c/own");
    handleRoute(post({ characterId: "cec", model: "c/picked" }), m.host);
    expect(m.requests[1]!.spec.model).toBe("c/picked");
  });

  it("a card with only a name has nothing to describe, and no call is made", () => {
    const m = memHost(files({ "characters/cec/card.json": card({ description: "", personality: "" }) }));
    const out = handleRoute(post({ characterId: "cec" }), m.host) as { json: { ok: boolean; code: string; error: string } };
    expect(out.json).toMatchObject({ ok: false, code: "nothing" });
    expect(out.json.error).toContain("Cecily");
    expect(m.requests.length).toBe(0);
  });

  it("a bad id or a missing card is refused; a failed or empty model reply says so", () => {
    const m = memHost(files());
    expect((handleRoute(post({}), m.host) as { status: number }).status).toBe(400);
    expect((handleRoute(post({ characterId: "../x" }), m.host) as { status: number }).status).toBe(400);
    expect((handleRoute(post({ characterId: "nobody" }), m.host) as { status: number }).status).toBe(404);
    const req = post({ characterId: "cec" });
    handleRoute(req, m.host);
    m.results.portrait = { error: { message: "rate limited" } };
    expect((handleRoute(req, m.host) as { json: { ok: boolean; code: string; error: string } }).json).toMatchObject({ ok: false, code: "model", error: "rate limited" });
    m.results.portrait = { text: "   ", model: "m" };
    expect((handleRoute(req, m.host) as { json: { code: string } }).json.code).toBe("empty");
  });

  it("the cleaners drop reasoning, fences, lead-ins and bad tags", () => {
    expect(cleanPortraitDesc("<think>hm</think>```\nA girl.\n```")).toBe("A girl.");
    expect(cleanPortraitDesc("Description: A  girl\nwith red hair.")).toBe("A girl with red hair.");
    expect(cleanPortraitTags("solo; 1girl\nlong hair,  ,  日本語, x".replace("x", "x".repeat(60)))).toBe("solo, 1girl, long_hair");
    expect(portraitContent({ name: "A" })).toBe("");
    expect(portraitContent({ name: "A", scenario: "A mill." })).toContain("Scenario:\nA mill.");
  });
});

describe("which cards get a portrait, and how the picked model is prompted", () => {
  it("a card with no picture or the default one needs a portrait; a lazy-loaded one has it; groups are left alone", () => {
    expect(needsPortrait({ avatar: "" })).toBe(true);
    expect(needsPortrait({ avatar: "/assets/avatar-default.png" })).toBe(true);
    expect(needsPortrait({ avatar: "/v1/assets/x.webp" })).toBe(false);
    expect(needsPortrait({ avatar: "", avatarLazy: true })).toBe(false);
    const list = [{ id: "a", avatar: "" }, { id: "g", avatar: "", isGroup: true }, { id: "b", avatar: "data:image/png;base64,xx" }, { id: "c", avatar: "", avatarLazy: true as const }, { id: "d", avatar: null }];
    expect(missingPortraits(list).map((x) => x.id)).toEqual(["a", "d"]);
  });

  const models = [
    { provider: "comfy", id: "sdxl", label: "SDXL", api: "comfyui", connectionName: "Local ComfyUI" },
    { provider: "or", id: "flux", label: "Flux", api: "openrouter", connectionName: "OpenRouter", style: "description" as const, instructions: "Plain prose." },
    { provider: "forge", id: "il", label: "Illustrious", api: "a1111", connectionName: "Forge", favorite: { name: "My anime" } },
  ];
  const ig = { enabled: true, model: "or/flux", promptPrefix: "", negativePrompt: "", interactive: false };

  it("the style and guidance come from the picked model, not from the app's", () => {
    expect(imageTargetOf(ig, models, "")).toMatchObject({ model: "or/flux", style: "description", guide: "Plain prose.", label: "Flux" });
    expect(imageTargetOf(ig, models, "comfy/sdxl")).toMatchObject({ model: "comfy/sdxl", style: "tags", label: "SDXL" });
    expect(imageTargetOf(ig, models, "forge/il")).toMatchObject({ style: "tags", label: "My anime" });
    // an explicit choice in Extensions still wins
    expect(imageTargetOf({ ...ig, promptStyle: "description" }, models, "comfy/sdxl").style).toBe("description");
    // an unknown ref (models not loaded) falls back to the app's habit
    expect(imageTargetOf(ig, [], "x/y")).toMatchObject({ model: "x/y", style: "description" });
  });
});
