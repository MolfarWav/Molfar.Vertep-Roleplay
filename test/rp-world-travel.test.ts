// Travel on the places map (Molfar.Vertep#454): the two small calls the player starts from the travel window: the time
// between two places, and the name a journey's reply gave the road. Each runs on the DM's build model and only when asked.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TRAVEL_ROAD_SYSTEM, TRAVEL_TIME_SYSTEM, handleRoute } from "../plugins/world/plugin.js";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const eng = (await import(engineUrl)) as { handleRoute: Function };
const J = (v: unknown) => JSON.stringify(v);

let root: string;
let results: Record<string, unknown>;
let requests: { key: string; spec: Record<string, any> }[];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "world-travel-"));
  for (const d of ["characters/odarka", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), J({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "characters", "odarka", "card.json"), J({ spec: "chara_card_v2", name: "Odarka", description: "A witch.", first_mes: "Hi." }));
  fs.writeFileSync(path.join(root, "settings.json"), J({ model: null }));
  results = {};
  requests = [];
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});
function host() {
  return {
    fs: {
      root,
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => {
        const full = path.resolve(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
}
const engine = (method: string, p: string, body?: unknown) => (eng.handleRoute({ method, path: p, query: {}, body }, host()) as { json: Record<string, any> }).json;
const world = (method: string, p: string, body?: unknown) => {
  const r = handleRoute({ method, path: p, query: {}, body }, host()) as any;
  return r.json ?? r;
};
const newChat = () => engine("POST", "/chats", { characterId: "odarka" }).meta.id as string;
const withBook = (chatId: string) => {
  fs.mkdirSync(path.join(root, "world", "state"), { recursive: true });
  fs.writeFileSync(path.join(root, "world", "state", chatId + ".json"), J({
    chatId, settings: { level: "chronicler" },
    entities: [
      { id: "n1", kind: "place", name: "Hearthstone Inn", aliases: [], text: "A warm inn at the crossroads.", status: "active", uid: 0 },
      { id: "n2", kind: "place", name: "Old Forge", aliases: [], text: "Smoke and anvils at the edge of the village.", status: "active", uid: 0 },
    ],
  }));
};

describe("travel time: one call, asked by the player", () => {
  it("asks the build model about the two places and the distance, and gives the minutes on foot", () => {
    const id = newChat();
    withBook(id);
    const body = { chatId: id, from: "Hearthstone Inn", to: "Old Forge", distance: 300, mode: "ride" };
    expect(world("POST", "/world/travel/time", body).__llmPending).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.key).toBe("world_travel_time");
    expect(requests[0]!.spec.systemPrompt).toBe(TRAVEL_TIME_SYSTEM);
    const ask = requests[0]!.spec.messages[0].content as string;
    expect(ask).toContain("Hearthstone Inn: A warm inn at the crossroads.");
    expect(ask).toContain("Old Forge: Smoke and anvils");
    expect(ask).toContain("Distance on the map: 300 units.");
    expect(ask).toContain("riding");
    results.world_travel_time = { text: J({ minutes: 25.4 }), model: "b/build", genTimeMs: 10 };
    const out = world("POST", "/world/travel/time", body);
    expect(out).toMatchObject({ ok: true, minutes: 25, model: "b/build" });
  });
  it("a place the book does not have is still asked about, by name; no usable answer says so", () => {
    const id = newChat();
    withBook(id);
    world("POST", "/world/travel/time", { chatId: id, from: "Somewhere", to: "Old Forge" });
    expect(requests[0]!.spec.messages[0].content).toContain("Somewhere (nothing in the book)");
    results.world_travel_time = { text: J({ minutes: 0 }), model: "b/build" };
    expect(world("POST", "/world/travel/time", { chatId: id, from: "Somewhere", to: "Old Forge" })).toMatchObject({ ok: false, code: "empty" });
  });
  it("needs a chat and a destination, and makes no call without them", () => {
    expect(world("POST", "/world/travel/time", { to: "x" }).error).toBe("chatId required");
    const id = newChat();
    withBook(id);
    expect(world("POST", "/world/travel/time", { chatId: id }).error).toBe("to required");
    expect(requests).toHaveLength(0);
  });
});

describe("the road's name, read from the journey's reply", () => {
  const body = (reply: string) => ({ chatId: "", from: "Hearthstone Inn", to: "Old Forge", reply });
  it("sends the telling and gives the name the text wrote, cleaned", () => {
    const id = newChat();
    withBook(id);
    const b = { ...body("They took Tanners' Lane past the dyers, and the smoke of the forge grew thick."), chatId: id };
    expect(world("POST", "/world/travel/road", b).__llmPending).toBe(true);
    expect(requests[0]!.key).toBe("world_travel_road");
    expect(requests[0]!.spec.systemPrompt).toBe(TRAVEL_ROAD_SYSTEM);
    expect(requests[0]!.spec.messages[0].content).toContain("Tanners' Lane past the dyers");
    results.world_travel_road = { text: J({ name: '  "Tanners\' [Lane]"  ' }), model: "b/build" };
    expect(world("POST", "/world/travel/road", b)).toMatchObject({ ok: true, name: "Tanners' Lane" });
  });
  it("an empty name means the text named no road", () => {
    const id = newChat();
    withBook(id);
    const b = { ...body("They walked on."), chatId: id };
    world("POST", "/world/travel/road", b);
    results.world_travel_road = { text: J({ name: "" }), model: "b/build" };
    expect(world("POST", "/world/travel/road", b)).toMatchObject({ ok: true, name: "" });
  });
  it("needs the reply, and cuts a long one", () => {
    const id = newChat();
    withBook(id);
    expect(world("POST", "/world/travel/road", { chatId: id, to: "Old Forge" }).error).toBe("reply required");
    world("POST", "/world/travel/road", { ...body("x".repeat(20000)), chatId: id });
    expect((requests[0]!.spec.messages[0].content as string).length).toBeLessThan(6300);
  });
});
