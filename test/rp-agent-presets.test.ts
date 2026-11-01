/**
 * Agent presets and a chat's binding (chat meta `agents`): the cleaners, the live-follow-then-copy rule
 * (`editChatAgents`), what a chat runs now (`resolveChatAgents`) and the routes that carry them.
 * Format: docs/DATA-FORMATS.md, "Agents".
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
type Engine = typeof import("../plugins/engine/plugin.js");
const eng = (await import(engineUrl)) as Engine;

type Json = Record<string, any>;
const RP = { items: [{ agent: "scene-plan", on: true, phase: "before" }, { agent: "mood-tracker", on: true, phase: "after" }] };
const presets = (): Record<string, any> => ({ rp: eng.cleanAgentPreset({ name: "Default RP", ...RP }, "rp") });

describe("cleanAgentPreset", () => {
  it("keeps good items and drops junk, duplicates and bad ids", () => {
    const p = eng.cleanAgentPreset({ name: " Mine ", items: [
      { agent: "mood-tracker", phase: "after" }, { agent: "mood-tracker" }, { agent: "Bad Id" }, { agent: "x" }, null, "str",
      { agent: "scene-plan", on: false, phase: "sideways" },
    ] }, "mine");
    expect(p).toEqual({ format: "vertep-agent-preset", version: 1, id: "mine", name: "Mine", items: [{ agent: "mood-tracker", on: true, phase: "after" }, { agent: "scene-plan", on: false }] });
  });
  it("is null when there is no items list; the name falls back to the id", () => {
    expect(eng.cleanAgentPreset({ name: "x" }, "a")).toBeNull();
    expect(eng.cleanAgentPreset(null, "a")).toBeNull();
    expect(eng.cleanAgentPreset({ items: [] }, "a")?.name).toBe("a");
  });
  it("caps the list at 50 agents", () => {
    const items = Array.from({ length: 80 }, (_, i) => ({ agent: `agent-${i}` }));
    expect(eng.cleanAgentPreset({ items }, "big")?.items.length).toBe(50);
  });
});

describe("cleanAgentBinding", () => {
  it("is null when nothing is set", () => {
    expect(eng.cleanAgentBinding(null)).toBeNull();
    expect(eng.cleanAgentBinding({})).toBeNull();
    expect(eng.cleanAgentBinding({ preset: "../x", show: { "mood-tracker": "moon" } })).toBeNull();
  });
  it("keeps a preset, an own copy (even an empty one) and allowed places", () => {
    expect(eng.cleanAgentBinding({ preset: "rp" })).toEqual({ v: 1, preset: "rp" });
    expect(eng.cleanAgentBinding({ own: [] })).toEqual({ v: 1, own: [] });
    expect(eng.cleanAgentBinding({ preset: "rp", show: { "mood-tracker": "top1", "scene-plan": "nowhere" } })).toEqual({ v: 1, preset: "rp", show: { "mood-tracker": "top1" } });
  });
});

describe("the block mirror (`also`)", () => {
  const base = [{ agent: "scene-plan", on: true }, { agent: "mood-tracker", on: true }];
  it("keeps only true flags for valid agent ids", () => {
    expect(eng.cleanAgentBinding({ also: { "mood-tracker": true, "scene-plan": false, "Bad Id": true } })).toEqual({ v: 1, also: { "mood-tracker": true } });
    expect(eng.cleanAgentBinding({ also: { "scene-plan": "yes" } })).toBeNull();
  });
  it("is set and cleared one agent at a time, and shows on the items", () => {
    let b: Json = eng.editChatAgents({ v: 1, preset: "rp" }, base, { op: "also", agent: "mood-tracker", on: true }) as Json;
    expect(b.also).toEqual({ "mood-tracker": true });
    const items = eng.resolveChatAgents(b, presets(), null).items;
    expect(items.find((i: Json) => i.agent === "mood-tracker").also).toBe(true);
    expect(items.find((i: Json) => i.agent === "scene-plan").also).toBeUndefined();
    b = eng.editChatAgents(b, base, { op: "also", agent: "mood-tracker", on: false }) as Json;
    expect(b.also).toBeUndefined();
  });
  it("is refused for an agent that is not in the set, and dropped by a reset", () => {
    expect((eng.editChatAgents({ v: 1, preset: "rp" }, base, { op: "also", agent: "ghost-one", on: true }) as Json).error).toBeTruthy();
    const b = eng.editChatAgents({ v: 1, preset: "rp" }, base, { op: "also", agent: "scene-plan", on: true }) as Json;
    expect(eng.editChatAgents(b, base, { op: "reset" })).toEqual({ v: 1, preset: "rp" });
  });
});

describe("resolveChatAgents", () => {
  it("a chat with no binding follows the default preset", () => {
    const r = eng.resolveChatAgents(null, presets(), "rp");
    expect(r).toMatchObject({ presetId: "rp", followsPreset: true, presetMissing: false });
    expect(r.items.map((i: Json) => i.agent)).toEqual(["scene-plan", "mood-tracker"]);
  });
  it("no default and no binding: nothing runs", () => {
    expect(eng.resolveChatAgents(null, presets(), null)).toEqual({ presetId: null, presetMissing: false, followsPreset: true, items: [] });
  });
  it("a preset that was deleted does not break the chat", () => {
    const r = eng.resolveChatAgents({ v: 1, preset: "gone" }, presets(), null);
    expect(r).toMatchObject({ presetId: "gone", presetMissing: true, items: [] });
  });
  it("follows the preset live: a changed preset reaches a chat with no own copy", () => {
    const p = presets();
    const before = eng.resolveChatAgents({ v: 1, preset: "rp" }, p, null).items.length;
    p.rp.items.push({ agent: "extra-one", on: true });
    expect(eng.resolveChatAgents({ v: 1, preset: "rp" }, p, null).items.length).toBe(before + 1);
  });
  it("an own copy does not move when the preset does, and carries the chosen places", () => {
    const p = presets();
    const b = eng.editChatAgents({ v: 1, preset: "rp" }, p.rp.items, { op: "show", agent: "mood-tracker", place: "float" }) as Json;
    p.rp.items.push({ agent: "extra-one", on: true });
    const r = eng.resolveChatAgents(b, p, null);
    expect(r.followsPreset).toBe(false);
    expect(r.items.map((i: Json) => i.agent)).toEqual(["scene-plan", "mood-tracker"]);
    expect(r.items.find((i: Json) => i.agent === "mood-tracker").show).toBe("float");
  });
});

describe("editChatAgents: the first change makes a copy", () => {
  const base = RP.items;
  it("turning an agent off creates own from the preset and leaves the preset alone", () => {
    const b = eng.editChatAgents({ v: 1, preset: "rp" }, base, { op: "toggle", agent: "scene-plan", on: false }) as Json;
    expect(b.preset).toBe("rp");
    expect(b.own).toEqual([{ agent: "scene-plan", on: false, phase: "before" }, { agent: "mood-tracker", on: true, phase: "after" }]);
    expect(base[0].on).toBe(true);
  });
  it("add, remove, phase and move work on the copy", () => {
    let b: Json = eng.editChatAgents(null, base, { op: "add", agent: "extra-one", phase: "parallel" }) as Json;
    expect(b.own.map((i: Json) => i.agent)).toEqual(["scene-plan", "mood-tracker", "extra-one"]);
    b = eng.editChatAgents(b, base, { op: "move", agent: "extra-one", to: 0 }) as Json;
    expect(b.own.map((i: Json) => i.agent)).toEqual(["extra-one", "scene-plan", "mood-tracker"]);
    b = eng.editChatAgents(b, base, { op: "phase", agent: "extra-one", phase: "after" }) as Json;
    expect(b.own[0].phase).toBe("after");
    b = eng.editChatAgents(b, base, { op: "remove", agent: "scene-plan" }) as Json;
    expect(b.own.map((i: Json) => i.agent)).toEqual(["extra-one", "mood-tracker"]);
  });
  it("wait: false is kept on the copy and dropped again when the reply waits (the default)", () => {
    let b: Json = eng.editChatAgents({ v: 1, preset: "rp" }, base, { op: "wait", agent: "scene-plan", wait: false }) as Json;
    expect(b.own[0]).toEqual({ agent: "scene-plan", on: true, phase: "before", wait: false });
    expect(eng.resolveChatAgents(b, presets(), null).items[0]).toMatchObject({ agent: "scene-plan", wait: false });
    b = eng.editChatAgents(b, base, { op: "wait", agent: "scene-plan", wait: true }) as Json;
    expect(b.own[0]).toEqual({ agent: "scene-plan", on: true, phase: "before" });
    expect(eng.cleanAgentPreset({ items: [{ agent: "scene-plan", wait: false }, { agent: "mood-tracker", wait: "no" }] }, "x")?.items).toEqual([{ agent: "scene-plan", on: true, wait: false }, { agent: "mood-tracker", on: true }]);
  });
  it("removing the last agent leaves an empty own copy, not the preset again", () => {
    let b: Json = eng.editChatAgents({ v: 1, preset: "rp" }, base, { op: "remove", agent: "scene-plan" }) as Json;
    b = eng.editChatAgents(b, base, { op: "remove", agent: "mood-tracker" }) as Json;
    expect(b.own).toEqual([]);
    expect(eng.resolveChatAgents(b, presets(), null).items).toEqual([]);
  });
  it("choosing a preset drops the copy; reset drops the copy and the places but keeps the preset", () => {
    const own = eng.editChatAgents({ v: 1, preset: "rp" }, base, { op: "show", agent: "mood-tracker", place: "top2" }) as Json;
    expect(eng.editChatAgents(own, base, { op: "preset", preset: "other" })).toEqual({ v: 1, preset: "other", show: { "mood-tracker": "top2" } });
    expect(eng.editChatAgents(own, base, { op: "reset" })).toEqual({ v: 1, preset: "rp" });
    expect(eng.editChatAgents(own, base, { op: "preset", preset: null })).toEqual({ v: 1, show: { "mood-tracker": "top2" } });
  });
  it("refuses what makes no sense", () => {
    const e = (op: Json) => (eng.editChatAgents({ v: 1, preset: "rp" }, base, op) as Json).error;
    expect(e({ op: "add", agent: "mood-tracker" })).toMatch(/already/);
    expect(e({ op: "toggle", agent: "ghost-agent" })).toMatch(/not in the set/);
    expect(e({ op: "show", agent: "mood-tracker", place: "moon" })).toMatch(/place/);
    expect(e({ op: "phase", agent: "mood-tracker", phase: "never" })).toMatch(/phase/);
    expect(e({ op: "dance", agent: "mood-tracker" })).toMatch(/unknown op/);
    expect(e({ op: "add", agent: "Bad Id" })).toMatch(/agent id/);
    expect(e({ op: "move", agent: "mood-tracker", to: "first" })).toMatch(/number/);
  });
});

describe("routes", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-presets-"));
    for (const d of ["characters/aria", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
    fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
    fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", first_mes: "Hi." }));
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: null }));
  });
  afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ } });

  const host = () => ({
    fs: {
      root,
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    log: () => {},
  });
  const call = (method: string, p: string, body?: unknown) => eng.handleRoute({ method, path: p, query: {}, body }, host() as never) as { status: number; json: Json };

  it("presets: save cleaned, list, read, delete", () => {
    expect(call("GET", "/agent-presets").json.items).toEqual([]);
    expect(call("PUT", "/agent-presets/rp", { name: "Default RP", items: [...RP.items, { agent: "Bad Id" }] }).json.items.length).toBe(2);
    expect(call("PUT", "/agent-presets/bad", { name: "no items" }).status).toBe(400);
    expect(call("GET", "/agent-presets").json.items.map((p: Json) => p.id)).toEqual(["rp"]);
    expect(call("GET", "/agent-presets/rp").json.name).toBe("Default RP");
    expect(call("GET", "/agent-presets/nope").status).toBe(404);
    expect(call("PUT", "/agent-presets/..%2Fx", { items: [] }).status).toBe(400);
    call("DELETE", "/agent-presets/rp");
    expect(call("GET", "/agent-presets").json.items).toEqual([]);
  });

  it("the default preset is a setting; a bad id is refused", () => {
    expect(call("GET", "/agent-settings").json.defaultPreset).toBeNull();
    expect(call("PUT", "/agent-settings", { defaultPreset: "rp" }).json.defaultPreset).toBe("rp");
    expect(call("GET", "/agent-settings").json.defaultPreset).toBe("rp");
    expect(call("PUT", "/agent-settings", { defaultPreset: "../x" }).status).toBe(400);
  });

  it("silentNotes is a setting of its own: a PUT changes only the fields it names", () => {
    expect(call("GET", "/agent-settings").json.silentNotes).toBe(false);
    call("PUT", "/agent-settings", { defaultPreset: "rp" });
    expect(call("PUT", "/agent-settings", { silentNotes: true }).json).toEqual({ defaultPreset: "rp", silentNotes: true });
    // changing the default does not turn the notes back on
    expect(call("PUT", "/agent-settings", { defaultPreset: null }).json).toEqual({ defaultPreset: null, silentNotes: true });
    expect(call("PUT", "/agent-settings", { silentNotes: "yes" }).status).toBe(400);
    expect(call("PUT", "/agent-settings", { silentNotes: false }).json.silentNotes).toBe(false);
  });

  it("a chat follows the default preset, then copies it on the first change, then goes back", () => {
    call("PUT", "/agent-presets/rp", { name: "Default RP", ...RP });
    call("PUT", "/agent-settings", { defaultPreset: "rp" });
    const cid = call("POST", "/chats", { characterId: "aria" }).json.meta.id as string;
    let r = call("GET", `/chats/${cid}/agents`).json;
    expect(r).toMatchObject({ presetId: "rp", followsPreset: true });
    expect(r.items.length).toBe(2);
    r = call("POST", `/chats/${cid}/agents`, { op: "toggle", agent: "scene-plan", on: false }).json;
    expect(r.followsPreset).toBe(false);
    expect(r.items[0]).toMatchObject({ agent: "scene-plan", on: false });
    const meta = JSON.parse(fs.readFileSync(path.join(root, "chats", cid + ".meta.json"), "utf8"));
    expect(meta.agents.own.length).toBe(2);
    // the preset changes: the copy stays as it was
    call("PUT", "/agent-presets/rp", { name: "Default RP", items: [{ agent: "only-one", on: true }] });
    expect(call("GET", `/chats/${cid}/agents`).json.items.map((i: Json) => i.agent)).toEqual(["scene-plan", "mood-tracker"]);
    r = call("POST", `/chats/${cid}/agents`, { op: "reset" }).json;
    expect(r.followsPreset).toBe(true);
    expect(r.items.map((i: Json) => i.agent)).toEqual(["only-one"]);
    expect(JSON.parse(fs.readFileSync(path.join(root, "chats", cid + ".meta.json"), "utf8")).agents).toBeUndefined();
  });

  it("a bad change answers 400 and writes nothing", () => {
    const cid = call("POST", "/chats", { characterId: "aria" }).json.meta.id as string;
    const before = fs.readFileSync(path.join(root, "chats", cid + ".meta.json"), "utf8");
    expect(call("POST", `/chats/${cid}/agents`, { op: "toggle", agent: "ghost-agent" }).status).toBe(400);
    expect(fs.readFileSync(path.join(root, "chats", cid + ".meta.json"), "utf8")).toBe(before);
  });

  it("PATCH /chats/:id carries the whole binding (cleaned), a new chat can start with one, a fork keeps it", () => {
    const cid = call("POST", "/chats", { characterId: "aria", agents: { preset: "rp", show: { "mood-tracker": "moon" } } }).json.meta.id as string;
    expect(call("GET", `/chats/${cid}`).json.meta.agents).toEqual({ v: 1, preset: "rp" });
    call("PATCH", `/chats/${cid}`, { agents: { own: [{ agent: "mood-tracker" }], junk: 1 } });
    expect(call("GET", `/chats/${cid}`).json.meta.agents).toEqual({ v: 1, own: [{ agent: "mood-tracker", on: true }] });
    const fork = call("POST", `/chats/${cid}/fork`, {}).json.meta;
    expect(fork.agents).toEqual({ v: 1, own: [{ agent: "mood-tracker", on: true }] });
    call("PATCH", `/chats/${cid}`, { agents: null });
    expect(call("GET", `/chats/${cid}`).json.meta.agents).toBeUndefined();
  });
});
