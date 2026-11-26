/**
 * Fill empty (GitHub #528, #529, #530): the portrait goes only with the Appearance fields and one Fill empty can be two
 * calls that file one proposal; a card longer than the model's window is read where it matters for the fields asked;
 * the card's picture model is part of its task settings; under Free write a fill does not file a version.
 */
import { describe, expect, it } from "bun:test";
import { cardTextFor, handleRoute, readCardTasks } from "../plugins/profile/plugin.js";
(globalThis as { location?: unknown }).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
const { acceptFill } = await import("../src/lib/profile");
const { sameTasks } = await import("../src/lib/card-tasks");

function memHost(files: Record<string, string> = {}) {
  const results: Record<string, unknown> = {};
  const requests: { key: string; spec: Record<string, any> }[] = [];
  const host = {
    fs: {
      read: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
    },
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results },
  };
  return { host, files, results, requests };
}

const LOOKS = "She has long silver hair and a scar. ".repeat(80);
const MIND = "She fears fire and loves order. ".repeat(80);
const long = { name: "Mira", description: LOOKS, personality: MIND, scenario: "A tavern.", mes_example: "" };

describe("cardTextFor: a long card, read where it matters", () => {
  it("a card that fits goes whole, as before", () => {
    const small = { name: "A", description: "Tall.", personality: "Kind." };
    const r = cardTextFor(small, 12000, { appearance: ["hair"] });
    expect(r.partial).toBe(false);
    expect(r.text).toContain("Tall.");
    expect(r.text).toContain("Kind.");
  });

  it("fields that write Personality read the Personality text first", () => {
    const r = cardTextFor(long, 3000, { lists: ["fears"], behaviors: ["habits"] });
    expect(r.partial).toBe(true);
    expect(r.text).toContain("She fears fire");
    expect(r.text).not.toContain("silver hair");
    expect(r.used).toBeLessThan(r.total);
  });

  it("fields that write Description read the Description text first", () => {
    const r = cardTextFor(long, 3000, { appearance: ["hair"] });
    expect(r.text).toContain("silver hair");
    expect(r.text).not.toContain("She fears fire");
  });

  it("a request for both takes pieces from each text", () => {
    const r = cardTextFor(long, 3000, { appearance: ["hair"], lists: ["fears"] });
    expect(r.text).toContain("silver hair");
    expect(r.text).toContain("She fears fire");
    expect(r.text).toContain("A tavern.");
  });
});

describe("POST /profile/fill on a long card", () => {
  const files = () => ({ "characters/c/card.json": JSON.stringify(long), "settings.json": JSON.stringify({ model: "c/m" }) });

  it("sends the Personality text for a Personality field and files how much was read", () => {
    const m = memHost(files());
    const req = { method: "POST", path: "/profile/fill", query: {}, body: { characterId: "c", fields: { lists: ["fears"] }, limits: { inputChars: 3000, outputTokens: 2000 } } };
    const first = handleRoute(req, m.host) as { stash: Record<string, any> };
    expect(m.requests[0]!.spec.messages[0].content).toContain("She fears fire");
    expect(first.stash.read.used).toBeLessThan(first.stash.read.total);
    m.results.fill = { text: '{"profile":{"lists":{"fears":["fire"]}}}', model: "c/m" };
    const out = handleRoute({ ...req, stash: first.stash }, m.host) as { json: { draft: Record<string, any> } };
    expect(out.json.draft.read).toEqual(first.stash.read);
  });

  it("a card that fits files no `read`", () => {
    const m = memHost(files());
    const req = { method: "POST", path: "/profile/fill", query: {}, body: { characterId: "c", fields: { lists: ["fears"] }, limits: { inputChars: 60000, outputTokens: 2000 } } };
    const first = handleRoute(req, m.host) as { stash: Record<string, any> };
    expect(first.stash.read).toBeUndefined();
  });
});

describe("one Fill empty as two calls", () => {
  const files = () => ({ "characters/c/card.json": JSON.stringify(long), "settings.json": JSON.stringify({ model: "c/m" }), "characters/c/card-tasks.json": JSON.stringify({ model: "c/text" }) });

  it("the picture call joins the draft of the text call", () => {
    const m = memHost(files());
    const textReq = { method: "POST", path: "/profile/fill", query: {}, body: { characterId: "c", fields: { lists: ["fears"] } } };
    const t1 = handleRoute(textReq, m.host) as { stash: Record<string, any> };
    // the card's task model, text only
    expect(m.requests[0]!.spec.model).toBe("c/text");
    expect(m.requests[0]!.spec.images).toBeUndefined();
    m.results.fill = { text: '{"profile":{"lists":{"fears":["fire"]}}}', model: "c/text" };
    const d1 = (handleRoute({ ...textReq, stash: t1.stash }, m.host) as { json: { draft: { at: number } } }).json.draft;
    delete m.results.fill;

    const picReq = { method: "POST", path: "/profile/fill", query: {}, body: { characterId: "c", fields: { appearance: ["hair"] }, image: { data: "AAAA", mimeType: "image/png" }, model: "c/vision", mergeAt: d1.at, limits: { inputChars: 3000, outputTokens: 900 } } };
    const t2 = handleRoute(picReq, m.host) as { stash: Record<string, any> };
    const spec = m.requests[1]!.spec;
    expect(spec.model).toBe("c/vision");
    expect(spec.images).toHaveLength(1);
    expect(spec.presetParams.max_tokens).toBe(900);
    m.results.fill = { text: '{"profile":{"appearance":{"hair":"silver"}}}', model: "c/vision" };
    const out = handleRoute({ ...picReq, stash: t2.stash }, m.host) as { json: { draft: Record<string, any> } };
    expect(out.json.draft.profile).toEqual({ lists: { fears: ["fire"] }, appearance: { hair: "silver" } });
    expect(out.json.draft.models).toEqual(["c/text", "c/vision"]);
    expect(JSON.parse(m.files["profile-drafts/c.json"]!).profile.appearance).toEqual({ hair: "silver" });
  });

  it("a mergeAt that names no draft of this run changes nothing", () => {
    const m = memHost({ ...files(), "profile-drafts/c.json": JSON.stringify({ kind: "fill", at: 1, profile: { lists: { fears: ["old"] } } }) });
    const req = { method: "POST", path: "/profile/fill", query: {}, body: { characterId: "c", fields: { appearance: ["hair"] }, mergeAt: 2 } };
    const first = handleRoute(req, m.host) as { stash: Record<string, any> };
    m.results.fill = { text: '{"profile":{"appearance":{"hair":"silver"}}}', model: "c/m" };
    const out = handleRoute({ ...req, stash: first.stash }, m.host) as { json: { draft: Record<string, any> } };
    expect(out.json.draft.profile).toEqual({ appearance: { hair: "silver" } });
  });
});

describe("the card's picture model", () => {
  it("is saved with the card's task settings and read back", () => {
    const m = memHost({ "characters/c/card.json": JSON.stringify(long) });
    handleRoute({ method: "PUT", path: "/profile/card-tasks", query: {}, body: { characterId: "c", model: "c/text", visionModel: "c/vision" } }, m.host);
    expect(readCardTasks(m.host.fs, "c")).toEqual({ model: "c/text", visionModel: "c/vision" });
    handleRoute({ method: "PUT", path: "/profile/card-tasks", query: {}, body: { characterId: "c", visionModel: "none" } }, m.host);
    expect(readCardTasks(m.host.fs, "c")).toEqual({ visionModel: "none" });
  });

  it("counts as a change in the editor", () => {
    expect(sameTasks({ model: "a" }, { model: "a", visionModel: "none" })).toBe(false);
    expect(sameTasks({ visionModel: "none" }, { visionModel: "none" })).toBe(true);
  });
});

describe("accepting a Fill empty under Free write", () => {
  const card = (profile: Record<string, unknown>) => ({ cardExtras: { extensions: { molfar_profile: profile } }, versions: [], description: "hand", personality: "hand", scenario: "", firstMessage: "", exampleDialogue: "", systemPromptOverride: "", postHistoryInstructions: "" }) as any;
  const draft = { kind: "fill", profile: { appearance: { hair: "silver" } } } as any;

  it("files no version, the text did not change", () => {
    const patch = acceptFill(card({ free: true }), draft);
    expect(patch.versions).toBeUndefined();
    expect(patch.description).toBeUndefined();
  });

  it("files one when the profile writes the text", () => {
    const patch = acceptFill(card({}), draft);
    expect(patch.versions).toHaveLength(1);
  });
});
