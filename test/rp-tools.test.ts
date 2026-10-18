/**
 * Agentic tools plugin tests — driven in Node with a mock host (fs → tmp dir,
 * net → two-phase simulator), mirroring the rp-studio harness.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const pluginUrl = new URL("../plugins/tools/plugin.js", import.meta.url).href;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rp-tools-"));
  fs.mkdirSync(path.join(root, "tools"), { recursive: true });
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

type Mod = {
  handleRoute: (req: { method: string; path: string; body?: unknown }, host: unknown) => Promise<unknown> | unknown;
  handleTool: (name: string, args: Record<string, unknown>, host: unknown) => { text: string; isError?: boolean };
  appTools: (ctx: unknown, host: unknown) => { tools: { name: string; description: string; parameters: { properties: { prompt: { description: string } } } }[] };
  uiPanel: (ctx: unknown, host: unknown) => { label: string; items: { id: string; enabled: boolean; saveUrl: string; fields?: { key: string }[]; note?: string }[] };
};
let mod: Mod;
beforeEach(async () => {
  mod = (await import(pluginUrl)) as Mod;
});

function mockHost(netResults: Record<string, unknown> = {}) {
  const netRequests: { key: string; req: Record<string, unknown> }[] = [];
  const host = {
    fs: {
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => {
        const full = path.resolve(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    net: {
      request: (key: string, req: Record<string, unknown>) => { netRequests.push({ key, req }); },
      results: netResults,
    },
  };
  return { host, netRequests };
}

async function drive(method: string, p: string, body: unknown, host: unknown) {
  const out = (await mod.handleRoute({ method, path: p, body }, host)) as
    | { status?: number; json?: Record<string, unknown> }
    | null;
  return out;
}

describe("agentic tools plugin", () => {
  it("seeds built-ins OFF (opt-in); appTools exposes nothing until enabled", async () => {
    const m = mockHost();
    const tools = (await drive("GET", "/tools", undefined, m.host))!.json!.tools as { id: string; enabled: boolean; builtin: string }[];
    expect(tools.map((t) => t.id).sort()).toEqual(["dice", "image", "toy"]);
    expect(tools.find((t) => t.id === "dice")!.enabled).toBe(false);
    expect(tools.find((t) => t.id === "image")!.enabled).toBe(false);
    expect(tools.find((t) => t.id === "toy")!.enabled).toBe(false);
    expect(mod.appTools(null, m.host).tools).toEqual([]);
    const panel = mod.uiPanel(null, m.host);
    const lovense = panel.items.find((i) => i.id === "toy")!;
    expect(lovense.note).toContain("127.0.0.1");
  }, 30_000);

  it("panel descriptor: Tool Calling label; every tool exposes the full editable field set", async () => {
    const m = mockHost();
    const panel = mod.uiPanel(null, m.host);
    expect(panel.label).toBe("Tool Calling");
    const toy = panel.items.find((i) => i.id === "toy")!;
    expect(toy.enabled).toBe(false);
    expect(toy.saveUrl).toBe("/tools/toy");
    expect(toy.fields?.map((f) => f.key)).toEqual([
      "config.host", "config.port", "name", "tool.name", "tool.description", "tool.parameters", "description",
    ]);
    const dice = panel.items.find((i) => i.id === "dice")!;
    expect(dice.fields?.map((f) => f.key)).not.toContain("handler"); // built-in handler is code-owned
  }, 30_000);

  it("PUT toggles + toy config persist; builtins drop smuggled handlers", async () => {
    const m = mockHost();
    const r = (await drive("PUT", "/tools/toy", { enabled: true, values: { "config.port": 30000, handler: "malicious()" } }, m.host))!;
    expect(r.status).toBe(200);
    const toy = JSON.parse(fs.readFileSync(path.join(root, "tools", "toy.json"), "utf8")) as { enabled: boolean; config: { port: number }; handler?: string };
    expect(toy.enabled).toBe(true);
    expect(toy.config.port).toBe(30000);
    expect(toy.handler).toBeUndefined();
    expect(mod.appTools(null, m.host).tools.map((t) => t.name)).toContain("lovense");
  }, 30_000);

  it("generate_image gets the Danbooru wording at send time when the image model runs on ComfyUI/Forge", async () => {
    const m = mockHost();
    await drive("PUT", "/tools/image", { enabled: true }, m.host);
    const settings = (api: string | null) =>
      fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ ui: { imageGen: api ? { modelApi: api } : {} } }));
    const img = () => mod.appTools(null, m.host).tools.find((t) => t.name === "generate_image")!;
    const stock = img().description;
    expect(stock).toContain("complete visual description"); // no settings.json: today's text
    settings("openrouter-images");
    expect(img().description).toBe(stock);
    settings("comfyui");
    expect(img().description).toContain("Danbooru tags");
    expect(img().parameters.properties.prompt.description).toBe("Comma-separated Danbooru tags for the picture");
    settings("a1111");
    expect(img().description).toContain("Danbooru tags");
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ ui: { imageGen: { promptStyle: "description", modelApi: "comfyui" } } }));
    expect(img().description).toBe(stock);
    // stored file untouched, and an edited description is never replaced
    settings("comfyui");
    expect(JSON.parse(fs.readFileSync(path.join(root, "tools", "image.json"), "utf8")).tool.description).toBe(stock);
    await drive("PUT", "/tools/image", { values: { "tool.description": "Paint it." } }, m.host);
    expect(img().description).toBe("Paint it.");
  }, 30_000);

  it("generate_image follows the image server's style and carries its prompt guidance", async () => {
    const m = mockHost();
    await drive("PUT", "/tools/image", { enabled: true }, m.host);
    const img = () => mod.appTools(null, m.host).tools.find((t) => t.name === "generate_image")!;
    const stock = img().description;
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ ui: { imageGen: { modelApi: "comfyui", modelStyle: "description", modelInstructions: "Describe  the light." } } }));
    expect(img().description).toBe(stock + " The image server's own guidance for prompts: Describe the light.");
    fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ ui: { imageGen: { modelApi: "openai", modelStyle: "tags" } } }));
    expect(img().description).toContain("Danbooru tags");
  }, 30_000);

  it("built-ins let the user reshape what the model sees (rename + description)", async () => {
    const m = mockHost();
    const r = (await drive("PUT", "/tools/dice", { enabled: true, values: { "tool.name": "roll", "tool.description": "Roll the bones." } }, m.host))!;
    expect(r.status).toBe(200);
    expect(mod.appTools(null, m.host).tools.map((t) => t.name)).toEqual(["roll"]);
    // dispatch follows the renamed tool name; the dice handler still runs
    expect(mod.handleTool("roll", { count: 2, sides: 6 }, m.host).text).toMatch(/^2d6 → /);
  }, 30_000);

  it("create flow: POST /tools/new drafts, PUT saves, appTools exposes, handleTool runs the JS handler", async () => {
    const m = mockHost();
    await drive("PUT", "/tools/dice", { enabled: true, values: {} }, m.host); // built-ins are opt-in
    const draft = ((await drive("POST", "/tools/new", {}, m.host))!.json) as { id: string; saveUrl: string };
    const saved = (await drive("PUT", draft.saveUrl, {
      enabled: true,
      values: {
        name: "Weather",
        "tool.name": "get_weather",
        "tool.description": "Get the current weather.",
        "tool.parameters": JSON.stringify({ type: "object", properties: { city: { type: "string" } } }),
        handler: 'return { text: "sunny in " + (args.city || "nowhere") }',
      },
    }, m.host))!;
    expect(saved.status).toBe(200);
    expect(mod.appTools(null, m.host).tools.map((t) => t.name)).toEqual(expect.arrayContaining(["roll_dice", "get_weather"]));
    const out = mod.handleTool("get_weather", { city: "Osaka" }, m.host);
    expect(out.text).toBe("sunny in Osaka");
    expect(out.isError).toBeFalsy();
  }, 30_000);

  it("PUT rejects bad tool names; custom tools delete for real, builtins reset", async () => {
    const m = mockHost();
    const draft = ((await drive("POST", "/tools/new", {}, m.host))!.json) as { id: string; saveUrl: string };
    const bad = await drive("PUT", draft.saveUrl, { enabled: true, values: { "tool.name": "no good!", "tool.description": "x" } }, m.host);
    expect(bad!.status).toBe(400);

    const okSave = await drive("PUT", draft.saveUrl, { enabled: true, values: { "tool.name": "fine_tool", "tool.description": "x" } }, m.host);
    expect(okSave!.status).toBe(200);
    const del = (await drive("DELETE", draft.saveUrl, undefined, m.host))!.json as { ok: boolean };
    expect(del.ok).toBe(true);
    expect(mod.appTools(null, m.host).tools.map((t) => t.name)).not.toContain("fine_tool");

    // builtin delete = reset: reseeded with defaults on the next read
    await drive("PUT", "/tools/toy", { enabled: true, values: { "config.port": 31337 } }, m.host);
    await drive("DELETE", "/tools/toy", undefined, m.host);
    const after = (await drive("GET", "/tools", undefined, m.host))!.json!.tools as { id: string; enabled: boolean; config?: { port?: number } }[];
    const toy = after.find((t) => t.id === "toy")!;
    expect(toy.enabled).toBe(false);
    expect(toy.config?.port ?? 20010).toBe(20010);
  }, 30_000);

  it("dice rolls; the Lovense tool runs the two-phase net exchange", async () => {
    const m = mockHost();
    // enable dice + the Lovense tool first (built-ins are opt-in)
    await drive("PUT", "/tools/dice", { enabled: true, values: {} }, m.host);
    await drive("PUT", "/tools/toy", { enabled: true, values: {} }, m.host);
    expect(mod.handleTool("roll_dice", { count: 2, sides: 6 }, m.host).text).toMatch(/^2d6 → \[\d+, \d+\] = \d+$/);
    expect(mod.handleTool("roll_dice", { count: 999, sides: "wat" }, m.host).text).toMatch(/^20d6 → /);
    // the reason and the difficulty ride the result line (#14)
    expect(mod.handleTool("roll_dice", { reason: "leap over the gap", count: 1, sides: 20, dc: 1 }, m.host).text).toMatch(/^Leap over the gap: 1d20 → \d+ vs 1, success$/);
    expect(mod.handleTool("roll_dice", { reason: "lift the gate", sides: 6, dc: 99 }, m.host).text).toMatch(/^Lift the gate: 1d6 → \d vs 99, failure$/);
    expect(mod.appTools(null, m.host).tools.find((t: { name: string }) => t.name === "roll_dice").parameters.required).toEqual(["reason"]);
    // a stored copy from before, never edited, follows the new default; an edited one is kept
    const old = { type: "object", properties: { count: { type: "number", description: "How many dice to roll (default 1, max 20)" }, sides: { type: "number", description: "Sides per die (default 6, max 1000)" }, modifier: { type: "number", description: "Flat bonus or penalty added to the total (default 0)" } }, additionalProperties: false };
    const stored = JSON.parse(fs.readFileSync(path.join(root, "tools/dice.json"), "utf8"));
    fs.writeFileSync(path.join(root, "tools/dice.json"), JSON.stringify({ ...stored, tool: { ...stored.tool, parameters: old } }));
    expect(mod.appTools(null, m.host).tools.find((t: { name: string }) => t.name === "roll_dice").parameters.properties.reason).toBeDefined();
    fs.writeFileSync(path.join(root, "tools/dice.json"), JSON.stringify({ ...stored, tool: { ...stored.tool, parameters: { ...old, additionalProperties: true } } }));
    expect(mod.appTools(null, m.host).tools.find((t: { name: string }) => t.name === "roll_dice").parameters.properties.reason).toBeUndefined();
    expect(mod.handleTool("nope", {}, m.host).isError).toBe(true);

    const lv = (args: Record<string, unknown>, results: Record<string, unknown> = {}) =>
      mod.handleTool("lovense", args, mockHost(results).host);

    // pass A: handler registers the net request, returns a placeholder
    const passA = mod.handleTool("lovense", { intensity: 12, duration: 5 }, m.host);
    expect(passA.text).toBe("sending");
    expect(m.netRequests).toHaveLength(1);
    expect((m.netRequests[0]!.req.body as { action: string }).action).toBe("Vibrate:12");
    expect((m.netRequests[0]!.req.body as { timeSec: number }).timeSec).toBe(5);

    // pass B shapes: steady level, per-mode clamp, preset, stop, app error codes
    expect(lv({ intensity: 12 }, { toy: { ok: true, json: { code: 200 } } }).text).toContain("vibrate 12/20");
    expect(lv({ mode: "pump", intensity: 9 }, { toy: { ok: true, json: { code: 200 } } }).text).toContain("pump 3/3");
    expect(lv({ preset: "wave", duration: 20 }, { toy: { ok: true, json: { code: 200 } } }).text).toContain("wave pattern");
    expect(lv({ mode: "stop" }, { toy: { ok: true, json: { code: 200 } } }).text).toContain("stopped");
    expect(lv({ intensity: 8 }, { toy: { ok: true, json: { code: 401 } } }).text).toContain("no Lovense toy is connected");
    expect(lv({ preset: "disco" }, {}).isError).toBe(true);
    // unreachable app → honest error
    expect(lv({ intensity: 3 }, { toy: { ok: false, error: "econnrefused" } }).isError).toBe(true);
  }, 30_000);
});
