/**
 * Group scene (plugins/profile/plugin.js): the shared scenario and openings are
 * one model call each, filed as a draft; the group file is never written here.
 */
import { describe, expect, it } from "bun:test";
import { cleanSceneText, handleRoute, membersText, sceneModel } from "../plugins/profile/plugin.js";

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
      list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
    },
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results },
  };
  return { host, files, results, requests };
}

const group = { id: "spring", name: "Dusk at the Spring", memberIds: ["odarka", "chuh", "ivas"], mutedIds: ["ivas"] };
const seed = () => ({
  "groups/spring.json": JSON.stringify(group),
  "characters/odarka/card.json": JSON.stringify({ name: "Odarka", description: "The village witch below the pass.", personality: "Sardonic." }),
  "characters/chuh/card.json": JSON.stringify({ name: "Chuhaister", description: "A forest giant.", scenario: "Deep in the beech wood." }),
  "characters/ivas/card.json": JSON.stringify({ name: "Ivas", description: "A shepherd." }),
  "settings.json": JSON.stringify({ model: "c/chat" }),
  "dashboard/config.json": JSON.stringify({ sensorModel: "c/sensor" }),
});

describe("POST /profile/group-scene", () => {
  it("asks the chat model with the unmuted members, then files a draft and leaves the group alone", () => {
    const m = memHost(seed());
    const req = { method: "POST", path: "/profile/group-scene", query: {}, body: { groupId: "spring", mode: "wild", wish: "a rainy night" } };
    const first = handleRoute(req, m.host) as { __llmPending?: boolean };
    expect(first.__llmPending).toBe(true);
    const spec = m.requests[0]!.spec;
    expect(m.requests[0]!.key).toBe("scene");
    expect(spec.model).toBe("c/chat");
    expect(spec.systemPrompt).toContain("Surprise the user");
    const content = spec.messages[0].content as string;
    expect(content).toContain("## Odarka");
    expect(content).toContain("Deep in the beech wood.");
    expect(content).not.toContain("Ivas");
    expect(content).toContain("a rainy night");
    m.results.scene = { text: "```\nScenario: Rain hammers the spring.\n```", model: "c/chat" };
    const second = handleRoute(req, m.host) as { json: { ok: boolean; draft: Record<string, any> } };
    expect(second.json.ok).toBe(true);
    expect(second.json.draft).toMatchObject({ kind: "scenario", text: "Rain hammers the spring.", mode: "wild", model: "c/chat" });
    expect(JSON.parse(m.files["profile-drafts/group-spring.json"]!).text).toBe("Rain hammers the spring.");
    expect(JSON.parse(m.files["groups/spring.json"]!)).toEqual(group);
  });

  it("defaults to the cards mode and reports a failed call without a draft", () => {
    const m = memHost(seed());
    const req = { method: "POST", path: "/profile/group-scene", query: {}, body: { groupId: "spring", mode: "bogus" } };
    handleRoute(req, m.host);
    expect(m.requests[0]!.spec.systemPrompt).toContain("Stay faithful to the cards");
    m.results.scene = { error: "429 rate limited" };
    const out = handleRoute(req, m.host) as { json: Record<string, unknown> };
    expect(out.json).toEqual({ ok: false, error: "429 rate limited" });
    expect(m.files["profile-drafts/group-spring.json"]).toBeUndefined();
  });

  it("refuses a missing group, a bad id and a group with no active member", () => {
    const m = memHost(seed());
    const call = (body: unknown) => (handleRoute({ method: "POST", path: "/profile/group-scene", query: {}, body }, m.host) as { status: number }).status;
    expect(call({ groupId: "../x" })).toBe(400);
    expect(call({ groupId: "nope" })).toBe(404);
    m.files["groups/spring.json"] = JSON.stringify({ ...group, mutedIds: ["odarka", "chuh", "ivas"] });
    expect(call({ groupId: "spring" })).toBe(400);
    expect(m.requests.length).toBe(0);
  });
});

describe("POST /profile/group-opening", () => {
  it("needs a saved scenario", () => {
    const m = memHost(seed());
    const out = handleRoute({ method: "POST", path: "/profile/group-opening", query: {}, body: { groupId: "spring" } }, m.host) as { status: number; json: { error: string } };
    expect(out.status).toBe(400);
    expect(out.json.error).toContain("no scenario");
  });

  it("takes the scenario the editor sends before the group file has it", () => {
    const m = memHost(seed());
    handleRoute({ method: "POST", path: "/profile/group-opening", query: {}, body: { groupId: "spring", scenario: "Fog on the pass." } }, m.host);
    expect(m.requests[0]!.spec.messages[0].content).toContain("Fog on the pass.");
  });

  it("writes from the scenario, avoids the openings the group has, and files a draft", () => {
    const files = seed();
    files["groups/spring.json"] = JSON.stringify({ ...group, scenario: "Dusk at the cold spring.", openings: ["*The spring talks over the stones.*"] });
    const m = memHost(files);
    const req = { method: "POST", path: "/profile/group-opening", query: {}, body: { groupId: "spring" } };
    expect((handleRoute(req, m.host) as { __llmPending?: boolean }).__llmPending).toBe(true);
    const content = m.requests[0]!.spec.messages[0].content as string;
    expect(m.requests[0]!.key).toBe("opening");
    expect(content).toContain("Dusk at the cold spring.");
    expect(content).toContain("write a different one");
    expect(content).toContain("The spring talks over the stones.");
    m.results.opening = { text: "<think>plan</think>*Mist rises.* \"Late again,\" Odarka says." };
    const out = handleRoute(req, m.host) as { json: { ok: boolean; draft: Record<string, any> } };
    expect(out.json.draft).toMatchObject({ kind: "opening", text: "*Mist rises.* \"Late again,\" Odarka says." });
  });
});

describe("GET and DELETE /profile/draft?groupId=", () => {
  it("reads and discards the group's draft", () => {
    const m = memHost({ "profile-drafts/group-spring.json": JSON.stringify({ v: 1, kind: "scenario", text: "x" }) });
    const get = handleRoute({ method: "GET", path: "/profile/draft", query: { groupId: "spring" } }, m.host) as { json: { draft: unknown } };
    expect(get.json.draft).toMatchObject({ kind: "scenario", text: "x" });
    handleRoute({ method: "DELETE", path: "/profile/draft", query: { groupId: "spring" } }, m.host);
    expect(m.files["profile-drafts/group-spring.json"]).toBeUndefined();
    const bad = handleRoute({ method: "GET", path: "/profile/draft", query: { groupId: "a/b" } }, m.host) as { status: number };
    expect(bad.status).toBe(400);
  });
});

describe("scene text helpers", () => {
  it("cleans labels, fences and wrapping quotes, and keeps inner quotes", () => {
    expect(cleanSceneText("**Scenario:** The pass is closed.")).toBe("The pass is closed.");
    expect(cleanSceneText("\"The pass is closed.\"")).toBe("The pass is closed.");
    expect(cleanSceneText("\"Go,\" she says. \"Now.\"")).toBe("\"Go,\" she says. \"Now.\"");
  });

  it("cuts each card shorter as the group grows", () => {
    const long = "x".repeat(5000);
    const two = membersText([{ name: "A", description: long }, { name: "B", description: long }]);
    const six = membersText(Array.from({ length: 6 }, (_, i) => ({ name: "M" + i, description: long })));
    expect(two.length).toBeLessThan(6500);
    expect(six.length).toBeLessThan(6800);
  });
});

describe("which model writes the scene", () => {
  it("the group's latest chat with its own model, else the app's chat model", () => {
    const files: Record<string, string> = seed();
    const m = memHost(files);
    expect(sceneModel(m.host.fs, "spring")).toBe("c/chat");
    files["chats/a.meta.json"] = JSON.stringify({ groupId: "spring", model: "c/old", updatedAt: 1 });
    files["chats/b.meta.json"] = JSON.stringify({ groupId: "spring", model: "c/prose", updatedAt: 5 });
    files["chats/c.meta.json"] = JSON.stringify({ groupId: "other", model: "c/else", updatedAt: 9 });
    files["chats/d.meta.json"] = JSON.stringify({ groupId: "spring", updatedAt: 9 });
    expect(sceneModel(m.host.fs, "spring")).toBe("c/prose");
  });
});
