/**
 * "Structure it" (plugins/profile/plugin.js): the two-phase route, the draft it
 * files, and how a model reply is kept to the known fields.
 */
import { describe, expect, it } from "bun:test";
import { cleanProfile, draftFromReply, handleRoute, parseReply } from "../plugins/profile/plugin.js";

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

const card = { spec: "chara_card_v2", name: "Elias", description: "Elias Thorne, 34. Grey eyes. The city is ruled by guilds.", personality: "Patient. Afraid of fire." };

describe("POST /profile/structure", () => {
  it("asks the model once, then files the draft and leaves the card alone", () => {
    const m = memHost({ "characters/eli/card.json": JSON.stringify(card), "settings.json": JSON.stringify({ model: "c/m" }) });
    const req = { method: "POST", path: "/profile/structure", query: {}, body: { characterId: "eli" } };
    const first = handleRoute(req, m.host) as { __llmPending?: boolean };
    expect(first.__llmPending).toBe(true);
    expect(m.requests[0]!.key).toBe("structure");
    expect(m.requests[0]!.spec.model).toBe("c/m");
    expect(m.requests[0]!.spec.messages[0].content).toContain("Grey eyes");
    m.results.structure = {
      text: '```json\n{"profile":{"identity":{"first":"Elias","family":"Thorne","age":"34","bogus":"x"},"appearance":{"eyes":"grey"},"lists":{"strengths":["patient"],"fears":"fire, smoke"}},"leftover":{"description":"The city is ruled by guilds.","personality":""},"note":"world fact kept"}\n```',
      model: "c/m",
    };
    const second = handleRoute(req, m.host) as { json: { ok: boolean; draft: Record<string, any> } };
    expect(second.json.ok).toBe(true);
    const saved = JSON.parse(m.files["profile-drafts/eli.json"]!);
    expect(saved.profile).toEqual({
      identity: { first: "Elias", family: "Thorne", age: "34" },
      appearance: { eyes: "grey" },
      lists: { strengths: ["patient"], fears: ["fire", "smoke"] },
    });
    expect(saved.leftover).toEqual({ description: "The city is ruled by guilds.", personality: "" });
    expect(saved.note).toBe("world fact kept");
    expect(JSON.parse(m.files["characters/eli/card.json"]!)).toEqual(card);
  });

  it("a failed call files nothing", () => {
    const m = memHost({ "characters/eli/card.json": JSON.stringify(card) });
    m.results.structure = { error: "429 rate limited" };
    const out = handleRoute({ method: "POST", path: "/profile/structure", query: {}, body: { characterId: "eli" } }, m.host) as { json: Record<string, unknown> };
    expect(out.json).toEqual({ ok: false, error: "429 rate limited" });
    expect(m.files["profile-drafts/eli.json"]).toBeUndefined();
  });

  it("refuses a bad id, a missing card and an empty card", () => {
    const m = memHost({ "characters/e/card.json": JSON.stringify({ name: "E", description: "", personality: "" }) });
    const call = (id: string) => (handleRoute({ method: "POST", path: "/profile/structure", query: {}, body: { characterId: id } }, m.host) as { status: number }).status;
    expect(call("../x")).toBe(400);
    expect(call("nope")).toBe(404);
    expect(call("e")).toBe(400);
    expect(m.requests).toEqual([]);
  });
});

describe("GET and DELETE /profile/draft", () => {
  it("reads and discards the draft; other paths are not ours", () => {
    const m = memHost({ "profile-drafts/eli.json": JSON.stringify({ v: 1, profile: { goals: { life: "x" } } }) });
    const get = () => (handleRoute({ method: "GET", path: "/profile/draft", query: { characterId: "eli" }, body: null }, m.host) as { json: { draft: unknown } }).json.draft;
    expect(get()).toEqual({ v: 1, profile: { goals: { life: "x" } } });
    handleRoute({ method: "DELETE", path: "/profile/draft", query: { characterId: "eli" }, body: null }, m.host);
    expect(get()).toBeNull();
    expect(handleRoute({ method: "GET", path: "/dashboard/state", query: {}, body: null }, m.host)).toBeNull();
  });
});

describe("keeping a reply to the profile", () => {
  it("drops unknown sections and keys, caps lists, switches on stated adult details", () => {
    const p = cleanProfile({
      evil: { x: 1 },
      lists: { traits: Array.from({ length: 20 }, (_, i) => `t${i}`), flaws: [1, "", "rude", "rude"] },
      relationships: [{ name: "Mira", relation: "sister" }, { relation: "nobody" }, "x"],
      sexuality: { orientation: "bi" },
    });
    expect(Object.keys(p).sort()).toEqual(["lists", "relationships", "sexuality"]);
    expect(p.lists.traits).toHaveLength(12);
    expect(p.lists.flaws).toEqual(["rude"]);
    expect(p.relationships).toEqual([{ name: "Mira", relation: "sister", notes: "" }]);
    expect(p.sexuality).toEqual({ orientation: "bi", enabled: true });
  });

  it("names what went wrong with a reply", () => {
    expect(draftFromReply({ text: "no json here" }, 1)).toEqual({ v: 1, at: 1, error: "the reply was not JSON" });
    expect(draftFromReply({ text: '{"profile":{}}' }, 1)).toEqual({ v: 1, at: 1, error: "the reply filled no field" });
    expect(draftFromReply({ text: "" }, 1).error).toBe("the model returned nothing");
    expect(parseReply('Sure! {"a": {"b": 1}} done')).toEqual({ a: { b: 1 } });
  });
});
