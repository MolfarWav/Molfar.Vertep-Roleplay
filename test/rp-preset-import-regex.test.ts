// Regex scripts that come with an imported preset are saved bound to that preset (GitHub #57).
import { beforeAll, describe, expect, it } from "bun:test";

const store = new Map<string, string>();
const puts: { url: string; body: any }[] = [];
const posts: number[] = [];
let useApp: any;
let base: any;

beforeAll(async () => {
  (globalThis as any).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") puts.push({ url: String(url), body: JSON.parse(String(init.body)) });
    // scripts travel in batches: each item counts as one save of /regex/<id>
    if (init?.method === "POST" && String(url).endsWith("/regex/batch")) {
      posts.push(JSON.parse(String(init.body)).items.length);
      for (const it of JSON.parse(String(init.body)).items) puts.push({ url: "/regex/" + it.id, body: it });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  useApp = (await import("../src/lib/store")).useApp;
  base = (await import("../src/lib/seed")).buildDefaultPreset();
});

const script = (n: string) => ({ scriptName: n, findRegex: "/foo/g", replaceString: "bar", placement: [2], disabled: false });
const stPreset = { prompts: [{ identifier: "main", name: "Main", role: "system", content: "x" }], prompt_order: [{ character_id: 100001, order: [{ identifier: "main", enabled: true }] }], extensions: { regex_scripts: [script("One"), script("Two")] } };
const marinaraPreset = { type: "marinara_preset", version: 1, data: { preset: { name: "M" }, sections: [{ id: "s1", name: "S", content: "c", role: "system", enabled: "true", isMarker: "false" }], groups: [], choiceBlocks: [] }, extensions: { regex_scripts: [script("Three")] } };

describe("regex scripts of an imported preset", () => {
  for (const [label, file] of [["SillyTavern", stPreset], ["Marinara", marinaraPreset]] as const) {
    it(`${label}: each is saved with scope preset and the new preset's id`, async () => {
      puts.length = 0;
      const r = await useApp.getState().importPreset(file, "Imported", base);
      const rx = puts.filter((p) => p.url.includes("/regex/"));
      expect(rx.length).toBe(label === "SillyTavern" ? 2 : 1);
      for (const p of rx) expect(p.body).toMatchObject({ scope: "preset", scopeTargetId: r.preset.id });
      expect(r.scripts).toBe(rx.length);
      expect(useApp.getState().regexScripts.filter((s: any) => s.scopeTargetId === r.preset.id)).toHaveLength(rx.length);
    });
  }
});

describe("a preset with hundreds of scripts", () => {
  it("is saved in a few calls, not one per script", async () => {
    puts.length = 0;
    posts.length = 0;
    const many = { ...stPreset, extensions: { regex_scripts: Array.from({ length: 223 }, (_, i) => script("S" + i)) } };
    const r = await useApp.getState().importPreset(many, "Big", base);
    expect(r.scripts).toBe(223);
    expect(posts).toEqual([100, 100, 23]);
    expect(new Set(puts.filter((p) => p.url.includes("/regex/")).map((p) => p.body.id)).size).toBe(223);
  });
});

describe("the name of an imported preset", () => {
  it("importing the same file again gives (2), (3) instead of the same name", async () => {
    const { uniquePresetName } = await import("../src/lib/preset-report");
    expect(uniquePresetName("A", ["B"])).toBe("A");
    expect(uniquePresetName("A", ["a", "A (2)"])).toBe("A (3)");
    expect(uniquePresetName("  ", [])).toBe("Imported preset");
    useApp.setState({ presets: [] });
    const names: string[] = [];
    for (let i = 0; i < 3; i++) names.push((await useApp.getState().importPreset(stPreset, "Same file", base)).preset.name);
    expect(names).toEqual(["Same file", "Same file (2)", "Same file (3)"]);
  });
});

describe("the engine's regex batch route", () => {
  it("writes each item under its id and refuses path-shaped ids", async () => {
    const { handleRoute } = await import("../plugins/engine/plugin.js");
    const files: Record<string, string> = {};
    const fs = { read: (p: string) => { if (!(p in files)) throw new Error("ENOENT"); return files[p]!; }, write: (p: string, s: string) => { files[p] = s; }, remove: () => {}, list: () => [] };
    const r = handleRoute({ method: "POST", path: "/regex/batch", query: {}, body: { items: [{ id: "rx_a", scriptName: "A" }, { id: "../evil", scriptName: "B" }, { scriptName: "no id" }, { id: "rx_b", scriptName: "C" }] } }, { fs }) as any;
    expect(r.json).toEqual({ ok: true, written: 2 });
    expect(Object.keys(files).sort()).toEqual(["regex/rx_a.json", "regex/rx_b.json"]);
    expect(JSON.parse(files["regex/rx_a.json"]!).scriptName).toBe("A");
  });
});
