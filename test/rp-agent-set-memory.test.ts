/**
 * #138: how many chats follow each agent set (`agentUsage`, GET /agent-usage), the set a character's last chat chose
 * (`agentSetMemory`, GET /agent-memory/:id, applied when a chat is created) and the chat-wide place for notes (op `showAll`).
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const eng = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as typeof import("../plugins/engine/plugin.js");
type Json = Record<string, any>;

const ITEMS = [{ agent: "scene-plan", on: true }, { agent: "mood-tracker", on: true }];

describe("agent set usage, memory and the notes switch", () => {
  let root: string;
  let clock = 1_000_000;
  const realNow = Date.now;
  beforeEach(() => {
    clock = 1_000_000;
    Date.now = () => ++clock;
    root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-memory-"));
    for (const d of ["characters/aria", "characters/bo", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
    for (const c of ["aria", "bo"]) fs.writeFileSync(path.join(root, "characters", c, "card.json"), JSON.stringify({ spec: "chara_card_v2", name: c, first_mes: "Hi." }));
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: null }));
  });
  afterEach(() => { Date.now = realNow; try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

  const fsx = () => ({
    root,
    read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  });
  const host = () => ({
    fs: fsx(), store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} }, net: { request: () => {}, results: {} }, log: () => {},
  });
  const call = (method: string, p: string, body?: unknown) => eng.handleRoute({ method, path: p, query: {}, body }, host() as never) as { status: number; json: Json };
  const meta = (cid: string) => JSON.parse(fs.readFileSync(path.join(root, "chats", cid + ".meta.json"), "utf8")) as Json;
  const newChat = (body: Json) => call("POST", "/chats", body).json.meta.id as string;
  const sets = () => { for (const id of ["rp", "lite"]) call("PUT", `/agent-presets/${id}`, { name: id, items: ITEMS }); };

  describe("usage", () => {
    it("counts the chats that follow each set; an own copy and a temporary chat do not count", () => {
      sets();
      call("PUT", "/agent-settings", { defaultPreset: "rp" });
      newChat({ characterId: "aria" }); // follows the default
      newChat({ characterId: "aria" });
      newChat({ characterId: "bo", agents: { preset: "lite" } });
      const own = newChat({ characterId: "bo", agents: { preset: "lite" } });
      call("POST", `/chats/${own}/agents`, { op: "toggle", agent: "scene-plan", on: false }); // the first change makes the chat's own copy
      const temp = newChat({ characterId: "bo", agents: { preset: "lite" } });
      fs.writeFileSync(path.join(root, "chats", temp + ".meta.json"), JSON.stringify({ ...meta(temp), temporary: true }, null, 2));
      expect(call("GET", "/agent-usage").json).toEqual({ follows: { rp: 2, lite: 1 }, own: 1, total: 4, partial: false });
    });
    it("with no default set, a chat with no binding follows nothing", () => {
      sets();
      newChat({ characterId: "aria", agentsChosen: true });
      expect(call("GET", "/agent-usage").json).toMatchObject({ follows: {}, total: 1 });
    });
    it("stops at the cap and says so", () => {
      sets();
      call("PUT", "/agent-settings", { defaultPreset: "rp" });
      for (let i = 0; i < 5; i++) newChat({ characterId: "aria", agentsChosen: true });
      expect(eng.agentUsage(fsx() as never, "rp", 3)).toEqual({ follows: { rp: 3 }, own: 0, total: 3, partial: true });
      expect(eng.agentUsage(fsx() as never, "rp", 5).partial).toBe(false);
    });
  });

  describe("the set a character's last chat chose", () => {
    it("is nothing before any choice", () => {
      sets();
      expect(call("GET", "/agent-memory/aria").json).toEqual({ pick: null });
    });
    it("follows the newest choice, including 'default' and 'none'", () => {
      sets();
      newChat({ characterId: "aria", agents: { preset: "lite" } });
      expect(call("GET", "/agent-memory/aria").json.pick).toBe("lite");
      expect(call("GET", "/agent-memory/bo").json.pick).toBeNull();
      newChat({ characterId: "aria", agents: { own: [] } });
      expect(call("GET", "/agent-memory/aria").json.pick).toBe("none");
      newChat({ characterId: "aria", agentsChosen: true });
      expect(call("GET", "/agent-memory/aria").json.pick).toBe("default");
    });
    it("a new chat that sends nothing starts from it, but does not count as a choice", () => {
      sets();
      call("PUT", "/agent-settings", { defaultPreset: "rp" });
      const first = newChat({ characterId: "aria", agents: { preset: "lite" } });
      const second = newChat({ characterId: "aria" });
      expect(meta(second).agents).toEqual({ v: 1, preset: "lite" });
      expect(meta(second).agentsAt).toBeUndefined();
      expect(call("GET", `/chats/${second}/agents`).json).toMatchObject({ presetId: "lite", followsPreset: true });
      // another character is not touched
      expect(meta(newChat({ characterId: "bo" })).agents).toBeUndefined();
      expect(meta(first).agentsAt).toBeGreaterThan(0);
    });
    it("'none' starts a chat with no agents", () => {
      sets();
      newChat({ characterId: "aria", agents: { own: [] } });
      const c = newChat({ characterId: "aria" });
      expect(call("GET", `/chats/${c}/agents`).json.items).toEqual([]);
    });
    it("the person picking 'default' beats an older explicit set", () => {
      sets();
      call("PUT", "/agent-settings", { defaultPreset: "rp" });
      newChat({ characterId: "aria", agents: { preset: "lite" } });
      const c = newChat({ characterId: "aria", agentsChosen: true });
      expect(meta(c).agents).toBeUndefined();
      expect(call("GET", `/chats/${c}/agents`).json.presetId).toBe("rp");
      expect(newChat({ characterId: "aria" })).toBeTruthy();
      expect(call("GET", "/agent-memory/aria").json.pick).toBe("default");
    });
    it("a set that was deleted is forgotten: the chat follows the default", () => {
      sets();
      call("PUT", "/agent-settings", { defaultPreset: "rp" });
      newChat({ characterId: "aria", agents: { preset: "lite" } });
      call("DELETE", "/agent-presets/lite");
      expect(call("GET", "/agent-memory/aria").json.pick).toBeNull();
      const c = newChat({ characterId: "aria" });
      expect(meta(c).agents).toBeUndefined();
    });
    it("choosing a set inside a chat counts too", () => {
      sets();
      const a = newChat({ characterId: "aria", agents: { preset: "rp" } });
      expect(call("GET", "/agent-memory/aria").json.pick).toBe("rp");
      call("POST", `/chats/${a}/agents`, { op: "preset", preset: "lite" });
      expect(call("GET", "/agent-memory/aria").json.pick).toBe("lite");
      // toggling an agent in the chat is not a choice of a set, and the chat keeps its base set for the memory
      call("POST", `/chats/${a}/agents`, { op: "toggle", agent: "scene-plan", on: false });
      expect(call("GET", "/agent-memory/aria").json.pick).toBe("lite");
    });
    it("a group is remembered by its own id", () => {
      sets();
      newChat({ groupId: "crew", agents: { preset: "lite" } });
      expect(call("GET", "/agent-memory/crew").json.pick).toBe("lite");
    });
  });

  describe("one place for every agent's notes (op showAll)", () => {
    it("sets and clears `show` for the agents named, keeps the others, and does not detach the chat from its set", () => {
      sets();
      const c = newChat({ characterId: "aria", agents: { preset: "rp" } });
      call("POST", `/chats/${c}/agents`, { op: "showAll", place: "log", agents: ["scene-plan", "mood-tracker"] });
      let r = call("GET", `/chats/${c}/agents`).json;
      expect(r.followsPreset).toBe(true);
      expect(r.items.map((i: Json) => i.show)).toEqual(["log", "log"]);
      call("POST", `/chats/${c}/agents`, { op: "show", agent: "scene-plan", place: "top1" });
      call("POST", `/chats/${c}/agents`, { op: "showAll", place: null, agents: ["mood-tracker"] });
      r = call("GET", `/chats/${c}/agents`).json;
      expect(r.items.map((i: Json) => i.show)).toEqual(["top1", null]);
    });
    it("refuses an unknown place, ignores bad ids, and leaves nothing set when everything is cleared", () => {
      expect(eng.editChatAgents({ v: 1, preset: "rp" }, ITEMS, { op: "showAll", place: "moon", agents: ["scene-plan"] })).toEqual({ error: "unknown place" });
      expect(eng.editChatAgents({ v: 1, preset: "rp" }, ITEMS, { op: "showAll", place: "log", agents: ["Bad Id", 5] })).toEqual({ v: 1, preset: "rp" });
      expect(eng.editChatAgents({ v: 1, show: { "scene-plan": "log" } }, ITEMS, { op: "showAll", place: null, agents: ["scene-plan"] })).toBeNull();
    });
  });
});
