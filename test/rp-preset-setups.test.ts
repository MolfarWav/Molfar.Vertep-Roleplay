// Named setups of a preset's Choices (Molfar.Vertep#526): the engine route, the default they keep in step, and the
// trip through a preset file's Export and Import.
import { describe, expect, it } from "bun:test";
import * as eng from "../plugins/engine/plugin.js";
import { presetExport, presetImportFull } from "../src/lib/import-shapes";
import { buildDefaultPreset } from "../src/lib/seed";
import { orderedSetups, sameValues } from "../src/lib/preset-setups";
import type { Preset } from "../src/lib/types";

function memHost(files: Record<string, string> = {}) {
  return {
    fs: {
      read: (p: string) => { if (!(p in files)) throw new Error("ENOENT " + p); return files[p]!; },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
      list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
}
const route = (files: Record<string, string>, method: string, path: string, body: unknown = null) =>
  eng.handleRoute({ method, path, query: {}, body } as any, memHost(files) as any) as any;
const json = (files: Record<string, string>, p: string) => JSON.parse(files[p]!);

describe("preset setups route", () => {
  it("shows an older single default as one unnamed setup, starred, without writing anything", () => {
    const files: Record<string, string> = {
      "presets/sola.json": JSON.stringify({ id: "sola", prompts: [], prompt_order: [] }),
      "preset-defaults.json": JSON.stringify({ sola: { mind: "opt_a", length: "opt_b" } }),
    };
    const out = route(files, "GET", "/preset-setups").json;
    expect(out.sola).toEqual({ items: [{ id: "mine", name: "", picks: { mind: "opt_a", length: "opt_b" }, at: 0 }], defaultId: "mine" });
    expect(files["preset-setups.json"]).toBeUndefined();
  });

  it("saves a preset's setups, mirrors the starred one into the defaults new chats read, and forgets it when unstarred", () => {
    const files: Record<string, string> = { "presets/sola.json": JSON.stringify({ id: "sola", prompts: [], prompt_order: [] }) };
    const items = [
      { id: "g", name: "  Golden,   700-900 ", picks: { mind: "opt_golden" }, at: 1 },
      { id: "r", name: "Riot", picks: { mind: "opt_riot", t_x: "false" }, at: 2 },
    ];
    let out = route(files, "PUT", "/preset-setups/sola", { items, defaultId: "r" }).json;
    expect(out.sola.items.map((x: any) => x.name)).toEqual(["Golden, 700-900", "Riot"]);
    expect(json(files, "preset-defaults.json").sola).toEqual({ mind: "opt_riot", t_x: "false" });
    out = route(files, "PUT", "/preset-setups/sola", { items, defaultId: null }).json;
    expect(out.sola.defaultId).toBeNull();
    expect(json(files, "preset-defaults.json").sola).toBeUndefined();
    // an empty list removes the preset's entry
    route(files, "PUT", "/preset-setups/sola", { items: [], defaultId: null });
    expect(json(files, "preset-setups.json").sola).toBeUndefined();
  });

  it("refuses an unknown preset and cleans what it stores", () => {
    const files: Record<string, string> = { "presets/p.json": JSON.stringify({ id: "p", prompts: [], prompt_order: [] }) };
    expect(route(files, "PUT", "/preset-setups/nope", { items: [] }).status).toBe(404);
    const long = "x".repeat(200);
    const out = route(files, "PUT", "/preset-setups/p", {
      items: [{ id: "a", name: long, picks: { "bad key": "1", ok: "2" } }, { id: "a", name: "dup", picks: {} }, "junk", { id: "../evil", name: "n", picks: {} }],
      defaultId: "missing",
    }).json;
    const p = out.p;
    expect(p.items.length).toBe(3);
    expect(p.items[0]).toMatchObject({ id: "a", picks: { ok: "2" } });
    expect(p.items[0].name.length).toBe(80);
    expect(new Set(p.items.map((x: any) => x.id)).size).toBe(3);
    expect(p.items.every((x: any) => /^[\w-]{1,40}$/.test(x.id))).toBe(true);
    expect(p.defaultId).toBeNull();
    expect(eng.cleanPresetSetups({ items: Array.from({ length: 150 }, (_, i) => ({ id: "s" + i, name: "n", picks: {} })) }).items.length).toBe(eng.SETUPS_MAX);
  });
});

describe("preset setups in a file", () => {
  const preset = (): Preset => {
    const base = buildDefaultPreset();
    return {
      ...base, id: "preset_a", name: "Story",
      variables: [{ id: "v1", name: "mind", label: "Mind", type: "choice", defaultValue: "", choices: [{ id: "g", label: "Golden", value: "golden" }, { id: "r", label: "Riot", value: "riot" }], defaults: ["g"] }],
    };
  };

  it("travel with Export and come back on Import, starred one included, only for the preset's own variables", () => {
    const p = preset();
    const file = JSON.parse(JSON.stringify(presetExport(p, [], { items: [
      { id: "x1", name: "Golden", picks: { mind: "g" }, at: 5 },
      { id: "x2", name: "Riot", picks: { mind: "r", stray: "1" }, at: 6 },
    ], defaultId: "x2" })));
    expect(file.vertep_setups).toEqual([{ name: "Golden", picks: { mind: "g" } }, { name: "Riot", picks: { mind: "r", stray: "1" }, default: true }]);
    const back = presetImportFull(file, "Story", buildDefaultPreset());
    expect(back?.setups.items.map((x) => [x.name, x.picks])).toEqual([["Golden", { mind: "g" }], ["Riot", { mind: "r" }]]);
    expect(back?.setups.defaultId).toBe(back?.setups.items[1]?.id ?? "none");
  });

  it("a file without setups imports none, and an export without setups writes no key", () => {
    const p = preset();
    const file = JSON.parse(JSON.stringify(presetExport(p, [])));
    expect("vertep_setups" in file).toBe(false);
    expect(presetImportFull(file, "Story", buildDefaultPreset())?.setups).toEqual({ items: [], defaultId: null });
  });
});

describe("preset setups on screen", () => {
  it("puts the starred setup first and compares choices whatever the key order", () => {
    const v = { items: [{ id: "a", name: "A", picks: {}, at: 0 }, { id: "b", name: "B", picks: {}, at: 0 }], defaultId: "b" };
    expect(orderedSetups(v).map((x) => x.id)).toEqual(["b", "a"]);
    expect(sameValues({ x: "1", y: ["a"] }, { y: ["a"], x: "1" })).toBe(true);
    expect(sameValues({ x: "1" }, { x: "2" })).toBe(false);
  });
});
