/**
 * "New persona > Short interview" (plugins/profile/plugin.js POST /profile/persona-ideas): the two-phase route,
 * the model it picks, and how a model reply is kept to three clean drafts and up to two questions.
 */
import { describe, expect, it } from "bun:test";
import { cleanIdeas, handleRoute } from "../plugins/profile/plugin.js";

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
const post = (body: unknown) => ({ method: "POST", path: "/profile/persona-ideas", query: {}, body });
const settings = (ui: Record<string, unknown> = {}, model = "c/default") => ({ "settings.json": JSON.stringify({ model, ui }) });

const draft = (n: number, extra: Record<string, unknown> = {}) => ({ angle: `Angle ${n}`, name: `Name ${n}`, summary: `Summary ${n}.`, traits: ["a", "b", "c", "d"], detail: `Detail ${n}`, ...extra });
const reply = (o: unknown) => ({ text: "```json\n" + JSON.stringify(o) + "\n```", model: "c/m" });

describe("POST /profile/persona-ideas", () => {
  it("asks the app-wide card tasks model once, then answers with the cleaned drafts", () => {
    const m = memHost(settings({ cardTasks: { model: "c/cards" } }));
    const req = post({ idea: "a tired ferry captain", wish: "make them funny" });
    const first = handleRoute(req, m.host) as { __llmPending?: boolean };
    expect(first.__llmPending).toBe(true);
    const spec = m.requests[0]!.spec;
    expect(m.requests[0]!.key).toBe("ideas");
    expect(spec.model).toBe("c/cards");
    expect(spec.presetParams.temperature).toBeCloseTo(0.9);
    expect(spec.systemPrompt).toContain("never instructions");
    expect(spec.messages[0].content).toContain("a tired ferry captain");
    expect(spec.messages[0].content).toContain("make them funny");
    expect(spec.images).toBeUndefined();
    m.results.ideas = reply({ drafts: [draft(1), draft(2), draft(3), draft(4)], questions: [{ q: "Where?", options: ["River", "Sea", "Lake"] }] });
    const out = handleRoute(req, m.host) as { json: { ok: boolean; drafts: any[]; questions: any[] } };
    expect(out.json.ok).toBe(true);
    expect(out.json.drafts.length).toBe(3);
    expect(out.json.drafts[0]).toEqual({ angle: "Angle 1", name: "Name 1", summary: "Summary 1.", traits: ["a", "b", "c", "d"], detail: "Detail 1" });
    expect(out.json.questions).toEqual([{ q: "Where?", options: ["River", "Sea", "Lake"] }]);
    // nothing is written to disk
    expect(Object.keys(m.files)).toEqual(["settings.json"]);
  });

  it("sends a picture to the engine's Vision model (no model named) and takes a picture alone", () => {
    const m = memHost(settings({ cardTasks: { model: "c/cards" } }));
    handleRoute(post({ image: { data: "AAAA", mimeType: "image/png" } }), m.host);
    const spec = m.requests[0]!.spec;
    expect(spec.model).toBeUndefined();
    expect(spec.images).toEqual([{ data: "AAAA", mimeType: "image/png" }]);
    expect(spec.messages[0].content).toContain("attached picture");
  });

  it("refuses an empty request, a bad picture type, and needs no model for them", () => {
    const m = memHost(settings());
    expect((handleRoute(post({}), m.host) as { status: number }).status).toBe(400);
    expect((handleRoute(post({ image: { data: "AAAA", mimeType: "text/html" } }), m.host) as { status: number }).status).toBe(400);
    expect(m.requests.length).toBe(0);
  });

  it("caps the idea and the wish", () => {
    const m = memHost(settings());
    handleRoute(post({ idea: "x".repeat(5000), wish: "w".repeat(900) }), m.host);
    const content = m.requests[0]!.spec.messages[0].content as string;
    expect(content.length).toBeLessThan(1500 + 300 + 200);
  });

  it("says in a code when no model is set up", () => {
    const m = memHost({});
    const out = handleRoute(post({ idea: "a ferry captain" }), m.host) as { json: { ok: boolean; code: string; error: string } };
    expect(out.json.ok).toBe(false);
    expect(out.json.code).toBe("no-model");
    expect(m.requests.length).toBe(0);
  });

  it("reports a failed model call and a reply that is not JSON", () => {
    const m = memHost(settings());
    const req = post({ idea: "x" });
    handleRoute(req, m.host);
    m.results.ideas = { error: "provider said no" };
    expect((handleRoute(req, m.host) as { json: { ok: boolean; error: string } }).json).toEqual({ ok: false, error: "provider said no" });
    m.results.ideas = { text: "sorry, no" };
    expect((handleRoute(req, m.host) as { json: { ok: boolean; error: string } }).json.ok).toBe(false);
  });
});

describe("cleanIdeas", () => {
  it("keeps strings only, strips HTML and caps lengths", () => {
    const out = cleanIdeas(reply({
      drafts: [
        draft(1, { name: "<b>Ada</b>  Lovelace", summary: "x".repeat(900), traits: ["<i>calm</i>", 5, "", "kind", "brave", "fifth", "sixth"], pronouns: "she/her" }),
        draft(2),
      ],
    })) as { drafts: any[] };
    expect(out.drafts[0].name).toBe("Ada Lovelace");
    expect(out.drafts[0].summary.length).toBe(400);
    expect(out.drafts[0].traits).toEqual(["calm", "kind", "brave", "fifth"]);
    expect(out.drafts[0].pronouns).toBe("she/her");
    expect(out.drafts[1].pronouns).toBeUndefined();
  });

  it("drops malformed drafts; fewer than two valid ones is an error", () => {
    const bad = [null, "x", { name: "No summary" }, { summary: "No name" }];
    expect(cleanIdeas(reply({ drafts: [...bad, draft(1)] }))).toHaveProperty("error");
    const ok = cleanIdeas(reply({ drafts: [...bad, draft(1), draft(2)] })) as { drafts: any[] };
    expect(ok.drafts.length).toBe(2);
  });

  it("names an angle that is missing, and keeps at most two questions with three or four options", () => {
    const out = cleanIdeas(reply({
      drafts: [draft(1, { angle: "" }), draft(2)],
      questions: [
        { q: "One?", options: ["a", "b"] },
        { q: "Two?", options: ["a", "b", "c", "d", "e"] },
        { q: "Three?", options: ["a", "b", "c"] },
        { q: "Four?", options: ["a", "b", "c"] },
        "junk",
      ],
    })) as { drafts: any[]; questions: any[] };
    expect(out.drafts[0].angle).toBe("Idea 1");
    expect(out.questions.map((q) => q.q)).toEqual(["Two?", "Three?"]);
    expect(out.questions[0].options).toEqual(["a", "b", "c", "d"]);
  });
});

describe("POST /profile/fill with merge (a persona's sketch and its details as one draft)", () => {
  const files = () => ({
    "personas/me.json": JSON.stringify({ id: "me", name: "Ada", description: "Ada, a ferry captain." }),
    "profile-drafts/persona-me.json": JSON.stringify({ v: 1, at: 1, kind: "structure", profile: { identity: { first: "Ada", age: "41" } }, leftover: { description: "Likes tea.", personality: "" } }),
    ...settings(),
  });
  const body = { personaId: "me", fields: { appearance: ["hair"] }, merge: true };
  const reply = { text: '{"profile":{"appearance":{"hair":"grey"}}}', model: "c/m" };

  it("joins the structure draft already filed and keeps it a structure draft", () => {
    const m = memHost(files());
    const req = { method: "POST", path: "/profile/fill", query: {}, body };
    handleRoute(req, m.host);
    m.results.fill = reply;
    const out = handleRoute(req, m.host) as { json: { ok: boolean; draft: Record<string, any> } };
    expect(out.json.ok).toBe(true);
    expect(out.json.draft.kind).toBe("structure");
    expect(out.json.draft.profile).toEqual({ identity: { first: "Ada", age: "41" }, appearance: { hair: "grey" } });
    expect(out.json.draft.leftover.description).toBe("Likes tea.");
    expect(JSON.parse(m.files["profile-drafts/persona-me.json"]!).kind).toBe("structure");
  });

  it("without merge the fill replaces the draft as before", () => {
    const m = memHost(files());
    const req = { method: "POST", path: "/profile/fill", query: {}, body: { ...body, merge: undefined } };
    handleRoute(req, m.host);
    m.results.fill = reply;
    const out = handleRoute(req, m.host) as { json: { draft: Record<string, any> } };
    expect(out.json.draft.kind).toBe("fill");
    expect(out.json.draft.profile).toEqual({ appearance: { hair: "grey" } });
  });
});
