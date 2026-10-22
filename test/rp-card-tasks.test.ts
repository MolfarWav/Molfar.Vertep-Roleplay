/**
 * The model for a card's own tasks (GitHub #104): the order the model is chosen in, the limits that follow the
 * model's real window, and the plugin side: the saved settings, the chain, the working text, and a long card
 * read in parts and merged.
 */
import { describe, expect, it } from "bun:test";
import { fitReport, requestLimits, resolveCardModel, shortTokens, taskLimits } from "../src/lib/card-tasks";
import { cardParts, handleRoute, limitsOf, mergeProposals, resolveTaskModel, splitText } from "../plugins/profile/plugin.js";

describe("resolveCardModel", () => {
  it("goes card, app, sensor, default", () => {
    expect(resolveCardModel("c/own", "c/app", "c/sensor", "c/dflt")).toEqual({ model: "c/own", source: "card" });
    expect(resolveCardModel("", "c/app", "c/sensor", "c/dflt")).toEqual({ model: "c/app", source: "app" });
    expect(resolveCardModel("", "", "c/sensor", "c/dflt")).toEqual({ model: "c/sensor", source: "sensor" });
    expect(resolveCardModel("", undefined, undefined, "c/dflt")).toEqual({ model: "c/dflt", source: "default" });
    expect(resolveCardModel("", "", "", null)).toEqual({ model: "", source: "none" });
  });
});

describe("taskLimits", () => {
  it("caps the reply to the model's real maximum instead of a fixed 12000", () => {
    const l = taskLimits({ context: 128000, maxOut: 4096 }, {}, "structure");
    expect(l.outputTokens).toBe(4096);
    expect(l.inputTokens).toBe(128000 - 4096 - 1500);
  });

  it("a big model keeps the task's usual reply size, and the card gets the rest of the window", () => {
    const l = taskLimits({ context: 200000, maxOut: 64000 }, {}, "structure");
    expect(l.outputTokens).toBe(12000);
    expect(l.inputTokens).toBe(200000 - 12000 - 1500);
    expect(taskLimits({ context: 200000, maxOut: 64000 }, {}, "fill").outputTokens).toBe(8000);
  });

  it("a small window keeps half of it for the reply at most", () => {
    const l = taskLimits({ context: 8000, maxOut: 8000 }, {}, "structure");
    expect(l.outputTokens).toBe(4000);
    expect(l.inputTokens).toBe(8000 - 4000 - 1500);
  });

  it("the card's own sizes replace the usual ones but never pass the model", () => {
    const m = { context: 32000, maxOut: 8000 };
    expect(taskLimits(m, { maxOutput: 3000, maxInput: 5000 }, "structure")).toMatchObject({ outputTokens: 3000, inputTokens: 5000 });
    expect(taskLimits(m, { maxOutput: 20000, maxInput: 99999 }, "structure")).toMatchObject({ outputTokens: 8000, inputTokens: 32000 - 8000 - 1500 });
  });

  it("an unknown window falls back to a modest share and the usual reply", () => {
    const l = taskLimits(null, {}, "structure");
    expect(l).toMatchObject({ context: null, maxOut: null, inputTokens: 6000, outputTokens: 12000 });
  });

  it("never asks for less than something usable", () => {
    const l = taskLimits({ context: 1000, maxOut: 100 }, {}, "fill");
    expect(l.outputTokens).toBeGreaterThanOrEqual(800);
    expect(l.inputTokens).toBeGreaterThanOrEqual(500);
  });
});

describe("fit and request limits", () => {
  it("says how many calls a card needs", () => {
    const l = taskLimits({ context: 16000, maxOut: 4000 }, {}, "structure");
    expect(fitReport(1000, l)).toEqual({ parts: 1, fits: true });
    const big = fitReport(l.inputTokens * 2.5, l);
    expect(big).toEqual({ parts: 3, fits: false });
  });

  it("turns the card's share into characters from the text's own density", () => {
    const l = taskLimits({ context: 16000, maxOut: 4000 }, {}, "structure");
    const dense = requestLimits(l, "x".repeat(6000), 3000); // 2 chars per token (Cyrillic-like)
    const loose = requestLimits(l, "x".repeat(6000), 1500); // 4 chars per token
    expect(loose.inputChars).toBeGreaterThan(dense.inputChars);
    expect(dense.outputTokens).toBe(l.outputTokens);
  });

  it("writes tokens short", () => {
    expect(shortTokens(128000)).toBe("128k");
    expect(shortTokens(4096)).toBe("4.1k");
    expect(shortTokens(900)).toBe("900");
    expect(shortTokens(1_000_000)).toBe("1M");
  });
});

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
const jsonFiles = (extra: Record<string, unknown> = {}) => Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, JSON.stringify(v)]));

describe("the plugin's model chain", () => {
  const files = () => memHost(jsonFiles({
    "settings.json": { model: "c/default", ui: { cardTasks: { model: "c/app" } } },
    "dashboard/config.json": { sensorModel: "c/sensor" },
    "characters/eli/card.json": { name: "Elias", description: "d" },
    "characters/eli/card-tasks.json": { model: "c/own" },
  }));

  it("an unsaved pick, then the card's own, then the app's, the sensor's, the default", () => {
    const m = files();
    expect(resolveTaskModel(m.host.fs, "eli", "c/picked")).toEqual({ model: "c/picked", source: "card" });
    expect(resolveTaskModel(m.host.fs, "eli", "")).toEqual({ model: "c/own", source: "card" });
    delete m.files["characters/eli/card-tasks.json"];
    expect(resolveTaskModel(m.host.fs, "eli", "")).toEqual({ model: "c/app", source: "app" });
    m.files["settings.json"] = JSON.stringify({ model: "c/default" });
    expect(resolveTaskModel(m.host.fs, "eli", "")).toEqual({ model: "c/sensor", source: "sensor" });
    delete m.files["dashboard/config.json"];
    expect(resolveTaskModel(m.host.fs, "eli", "")).toEqual({ model: "c/default", source: "default" });
    delete m.files["settings.json"];
    expect(resolveTaskModel(m.host.fs, "eli", "")).toEqual({ model: "", source: "none" });
  });

  it("another card keeps its own choice", () => {
    const m = files();
    m.files["characters/mira/card.json"] = JSON.stringify({ name: "Mira" });
    expect(resolveTaskModel(m.host.fs, "mira", "").model).toBe("c/app");
    expect(resolveTaskModel(m.host.fs, "eli", "").model).toBe("c/own");
  });

  it("Structure it runs on the card's model with the limits it was sent", () => {
    const m = files();
    handleRoute({ method: "POST", path: "/profile/structure", query: {}, body: { characterId: "eli", limits: { inputChars: 20000, outputTokens: 3000 } } }, m.host);
    expect(m.requests[0]!.spec.model).toBe("c/own");
    expect(m.requests[0]!.spec.presetParams.max_tokens).toBe(3000);
  });

  it("the editor's unsaved pick wins over the saved one, and its working text is what the model reads", () => {
    const m = files();
    handleRoute({ method: "POST", path: "/profile/structure", query: {}, body: { characterId: "eli", taskModel: "c/picked", card: { description: "Fresh text from the editor." } } }, m.host);
    expect(m.requests[0]!.spec.model).toBe("c/picked");
    expect(m.requests[0]!.spec.messages[0].content).toContain("Fresh text from the editor.");
    expect(m.requests[0]!.spec.messages[0].content).not.toContain("Card: unnamed");
  });

  it("reply limits are kept to sane bounds", () => {
    expect(limitsOf({ limits: { inputChars: 10, outputTokens: 99999999 } }, 12000)).toEqual({ inputChars: 3000, outputTokens: 64000 });
    expect(limitsOf({}, 8000)).toEqual({ inputChars: 12000, outputTokens: 8000 });
    expect(limitsOf({ limits: { inputChars: "x", outputTokens: -4 } }, 8000)).toEqual({ inputChars: 12000, outputTokens: 8000 });
  });
});

describe("GET and PUT /profile/card-tasks", () => {
  it("saves a model and sizes next to the card, reports who will run, and clears them", () => {
    const m = memHost(jsonFiles({ "characters/eli/card.json": { name: "Elias" }, "settings.json": { model: "c/default" } }));
    const get = () => (handleRoute({ method: "GET", path: "/profile/card-tasks", query: { characterId: "eli" }, body: null }, m.host) as { json: any }).json;
    expect(get()).toEqual({ own: {}, resolved: { model: "c/default", source: "default" } });
    const put = (body: object) => handleRoute({ method: "PUT", path: "/profile/card-tasks", query: {}, body: { characterId: "eli", ...body } }, m.host) as { json: any };
    expect(put({ model: "c/big", maxInput: 20000, maxOutput: 6000 }).json).toEqual({ own: { model: "c/big", maxInput: 20000, maxOutput: 6000 }, resolved: { model: "c/big", source: "card" } });
    expect(JSON.parse(m.files["characters/eli/card-tasks.json"]!)).toEqual({ model: "c/big", maxInput: 20000, maxOutput: 6000 });
    expect(JSON.parse(m.files["characters/eli/card.json"]!)).toEqual({ name: "Elias" });
    expect(put({}).json.own).toEqual({});
    expect(m.files["characters/eli/card-tasks.json"]).toBeUndefined();
  });

  it("refuses a bad id and a card that is not there", () => {
    const m = memHost(jsonFiles({ "characters/eli/card.json": { name: "Elias" } }));
    const status = (id: string) => (handleRoute({ method: "GET", path: "/profile/card-tasks", query: { characterId: id }, body: null }, m.host) as { status: number }).status;
    expect(status("../x")).toBe(400);
    expect(status("nobody")).toBe(404);
  });
});

describe("a card longer than one call", () => {
  it("is cut at paragraph edges, each piece under its field's label, not cut off", () => {
    const para = "Elias is a surgeon. ".repeat(20).trim(); // 399 chars
    const description = Array.from({ length: 12 }, () => para).join("\n\n");
    const parts = cardParts({ name: "Elias", description, personality: "Patient.", scenario: "In the city.", mes_example: "Hi." }, 1500);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) expect(p.length).toBeLessThan(1500 + 200 + 3200);
    expect(parts[0]).toContain("Scenario (context only");
    expect(parts[1]).not.toContain("Scenario (context only");
    expect(parts[1]).toContain("Description (continued)");
    expect(parts.join("\n")).toContain("Personality\nPatient.");
    // nothing lost: every paragraph is somewhere
    expect(parts.join("\n\n").split(para).length - 1).toBe(12);
  });

  it("a card that fits is one part", () => {
    expect(cardParts({ name: "E", description: "short", personality: "p" }, 12000)).toHaveLength(1);
  });

  it("splitText falls back to lines and then words for one huge paragraph", () => {
    const words = Array.from({ length: 600 }, (_, i) => `w${i}`).join(" ");
    const out = splitText(words, 500);
    expect(out.every((x: string) => x.length <= 500)).toBe(true);
    expect(out.join(" ").replace(/\s+/g, " ")).toBe(words);
  });

  it("Structure it asks once per part and merges what each part found", () => {
    const description = Array.from({ length: 8 }, (_, i) => `Paragraph ${i}. ` + "text ".repeat(120)).join("\n\n");
    const m = memHost(jsonFiles({ "characters/eli/card.json": { name: "Elias", description, personality: "" }, "settings.json": { model: "c/m" } }));
    const call = (part: number) => handleRoute({ method: "POST", path: "/profile/structure", query: {}, body: { characterId: "eli", part, limits: { inputChars: 3000, outputTokens: 4000 } } }, m.host) as { __llmPending?: boolean; json?: any };
    expect(call(0).__llmPending).toBe(true);
    expect(m.requests[0]!.spec.messages[0].content).toContain("Part 1 of ");
    m.results.structure = { text: '{"profile":{"identity":{"first":"Elias","age":"34"},"lists":{"fears":["fire"]}},"leftover":{"description":"first leftover","personality":""}}', model: "c/m" };
    const one = call(0).json;
    expect(one.ok).toBe(true);
    expect(one.done).toBe(false);
    expect(one.parts).toBeGreaterThan(1);
    expect(JSON.parse(m.files["profile-drafts/eli.json"]!).partial).toBe(true);

    delete m.results.structure;
    m.requests.length = 0;
    call(1);
    expect(m.requests[0]!.spec.messages[0].content).toContain("Part 2 of ");
    m.results.structure = { text: '{"profile":{"identity":{"first":"Elias","family":"Thorne"},"lists":{"fears":["water","Fire"]},"goals":{"life":"find her"}},"leftover":{"description":"second leftover","personality":""}}', model: "c/m" };
    const two = call(1).json;
    expect(two.ok).toBe(true);
    expect(two.done).toBe(two.parts === 2);
    const filed = JSON.parse(m.files["profile-drafts/eli.json"]!);
    expect(filed.profile.identity).toEqual({ first: "Elias", age: "34", family: "Thorne" });
    expect(filed.profile.lists.fears).toEqual(["fire", "water"]);
    expect(filed.profile.goals).toEqual({ life: "find her" });
    expect(filed.leftover.description).toBe("first leftover\n\nsecond leftover");
  });

  it("a part that fails drops the half-made proposal, and says which part", () => {
    const description = Array.from({ length: 8 }, (_, i) => `Paragraph ${i}. ` + "text ".repeat(120)).join("\n\n");
    const m = memHost(jsonFiles({ "characters/eli/card.json": { name: "Elias", description, personality: "" }, "profile-drafts/eli.json": { partial: true, part: 0, parts: 3, profile: { goals: { life: "x" } } } }));
    m.results.structure = { error: "429 rate limited" };
    const out = handleRoute({ method: "POST", path: "/profile/structure", query: {}, body: { characterId: "eli", part: 1, limits: { inputChars: 3000, outputTokens: 4000 } } }, m.host) as { json: any };
    expect(out.json.ok).toBe(false);
    expect(out.json.error).toContain("part 2 of");
    expect(m.files["profile-drafts/eli.json"]).toBeUndefined();
  });

  it("mergeProposals joins different text and keeps one copy of the same", () => {
    const a = { profile: { appearance: { hair: "red", eyes: "grey" } }, leftover: { description: "a", personality: "" } };
    const b = { profile: { appearance: { hair: "long", eyes: "grey" } }, leftover: { description: "", personality: "p" } };
    const m = mergeProposals(a, b);
    expect(m.profile.appearance).toEqual({ hair: "red; long", eyes: "grey" });
    expect(m.leftover).toEqual({ description: "a", personality: "p" });
  });
});
