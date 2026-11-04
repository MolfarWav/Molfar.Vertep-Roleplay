// #237: presets that know the app's features. The flags (chatFeatures) must say what each plugin's own
// llmRequest hook decides on the same chat; utility prompts expand with the preset's macros; Polish's copy
// of the macro code agrees with the engine's.
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import * as eng from "../plugins/engine/plugin.js";
import * as world from "../plugins/world/plugin.js";
import * as dash from "../plugins/relations/plugin.js";
import * as lit from "../plugins/litopys/plugin.js";
import { expandPolish } from "../plugins/polish/plugin.js";

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
const msg = (i: number, role: string, text: string) => ({ id: "m" + i, role, name: role === "user" ? "Taras" : "Odarka", text, swipe: 0 });
const chat = (meta: Record<string, unknown> = {}, extra: Record<string, string> = {}) => ({
  "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", ...meta }),
  "chats/c1.jsonl": [msg(0, "char", "Odarka stirs the pot."), msg(1, "user", "We go at night.")].map((m) => JSON.stringify(m)).join("\n") + "\n",
  "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
  ...extra,
});
const flags = (files: Record<string, string>) => eng.chatFeatures(memHost(files).fs, JSON.parse(files["chats/c1.meta.json"]!));
const req = (op = "send") => ({ key: "reply", request: { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "We go at night." }] }, turn: { op, chatId: "c1", speakerName: "Odarka" } });
const labels = (out: any) => (out && out.promptSources && Array.isArray(out.promptSources.parts) ? out.promptSources.parts.map((p: any) => p.label) : []);

describe("flags agree with the World DM hook", () => {
  const state = (settings: Record<string, unknown>, event = true) => ({
    "world/state/c1.json": JSON.stringify({
      ...world.emptyState("c1"),
      settings: { everyN: 5, stagnation: 6, onTransition: true, insert: true, ...settings },
      ...(event ? { event: { text: "A knock at the door.", hard: true, sent: 0, retried: false } } : {}),
    }),
  });
  const cases: [string, Record<string, string>][] = [
    ["no World DM state", chat()],
    ["level off", chat({}, state({ level: "off" }))],
    ["chronicler", chat({}, state({ level: "chronicler" }))],
    ["director, dice off", chat({}, state({ level: "director" }))],
    ["director, insert off", chat({}, state({ level: "director", insert: false }))],
    ["switched off for the chat", chat({ promptBoard: { off: ["plugin:world"] } }, state({ level: "director", dice: "strict", diceChance: 100 }))],
    ["dice always, no event", chat({}, state({ level: "director", dice: "strict", diceChance: 100 }, false))],
    ["dice and life always, no event", chat({}, state({ level: "living", dice: "flavour", diceChance: 100, diceLife: 100 }, false))],
    ["life set but dice off", chat({}, state({ level: "living", diceLife: 100 }, false))],
    ["dice from the level's profile", chat({}, { ...state({ level: "living", diceChance: 100 }, false), "world/profiles/living.json": JSON.stringify({ options: { dice: "strict" } }) })],
    ["an own profile turns dice off", chat({}, { ...state({ level: "living", profile: "p-calm", diceChance: 100 }, false), "world/profiles/p-calm.json": JSON.stringify({ base: "living", options: { dice: "off" } }), "world/profiles/living.json": JSON.stringify({ options: { dice: "strict" } }) })],
  ];
  for (const [name, files] of cases) {
    it(name, () => {
      const f = flags(files);
      const got = labels(world.llmRequest(req(), memHost({ ...files })));
      // an event that is due rides only where the flag says the World DM may add events
      if (JSON.parse(files["world/state/c1.json"] ?? "{}").event) expect(got.includes("World DM")).toBe(f.worldnews);
      else expect(got.includes("World DM")).toBe(false);
      // chance 100: a roll and a life beat always fire when the feature is on
      if (!f.dice) expect(got.includes("Dice")).toBe(false);
      if (f.dice && JSON.parse(files["world/state/c1.json"]!).settings.diceChance === 100) expect(got.includes("Dice")).toBe(true);
      expect(got.includes("Life")).toBe(f.life);
      if (!f.world) expect(got).toEqual([]);
    });
  }
});

describe("flags agree with the Dashboard and Litopys gates", () => {
  it("a Dashboard switched off adds nothing, and both flags are off", () => {
    const files = chat({ promptBoard: { off: ["plugin:relations"] } }, { "dashboard/config.json": JSON.stringify({ mode: "fast" }) });
    expect(dash.llmRequest(req(), memHost({ ...files }))).toBe(null);
    expect(flags(files)).toMatchObject({ dashboard: false, fastsensor: false });
  });
  it("injection off: no Dashboard block, flag off; fast mode follows the config", () => {
    const files = chat({}, { "dashboard/config.json": JSON.stringify({ injection: { enabled: false } }) });
    expect(labels(dash.llmRequest(req(), memHost({ ...files })))).not.toContain("Relationship dashboard");
    expect(flags(files)).toMatchObject({ dashboard: false, fastsensor: false });
    expect(flags(chat({}, { "dashboard/config.json": JSON.stringify({ mode: "fast" }) }))).toMatchObject({ dashboard: true, fastsensor: true });
  });
  it("Litopys off in its config adds nothing, and every Litopys flag is off", () => {
    for (const cfg of [{ enabled: false }, { insert: false }]) {
      const files = chat({}, { "litopys/config.json": JSON.stringify(cfg) });
      expect(lit.llmRequest(req(), memHost({ ...files }))).toBe(null);
      expect(flags(files)).toMatchObject({ litopys: false, memories: false, castknowledge: false, hiddenplan: false });
    }
  });
  it("Litopys's own switches: recollections and the hidden plan", () => {
    expect(flags(chat())).toMatchObject({ litopys: true, memories: true, castknowledge: true, hiddenplan: false });
    expect(flags(chat({ promptBoard: { off: ["plugin:recollections"] } }))).toMatchObject({ litopys: true, memories: false });
    expect(flags(chat({}, { "litopys/config.json": JSON.stringify({ hiddenPlan: true }) }))).toMatchObject({ hiddenplan: true });
    expect(flags(chat({ promptBoard: { off: ["plugin:litopys"] } }))).toMatchObject({ litopys: false, memories: false, castknowledge: false });
  });
  it("the Data bank and the author's note follow the chat's board", () => {
    expect(flags(chat())).toMatchObject({ databank: true, authornote: false });
    expect(flags(chat({ authorNote: "Rain all day.", promptBoard: { off: ["databank"] } }))).toMatchObject({ databank: false, authornote: true });
  });
});

describe("vertep.* in the preset", () => {
  const off = { litopys: false, memories: false, castknowledge: false, hiddenplan: false, dashboard: false, fastsensor: false, world: false, worldnews: false, dice: true, life: false, databank: true, authornote: false };
  it("a condition and an {{#if}} read the flags", () => {
    expect(eng.sectionCondPasses("vertep.dice", {}, {}, off)).toBe(true);
    expect(eng.sectionCondPasses("vertep.world", {}, {}, off)).toBe(false);
    expect(eng.sectionCondPasses("!vertep.world", {}, {}, off)).toBe(true);
    expect(eng.expandMacros("{{#if vertep.dice}}ROLL{{else}}NO{{/if}} {{vertep.world}}", { features: off, vars: {} })).toBe("ROLL false");
  });
  it("neither a preset variable nor {{setvar}} can stand in for a flag", () => {
    const pv = { "vertep.world": { value: "true", picks: null } };
    expect(eng.sectionCondPasses("vertep.world", pv, { "vertep.world": "true" }, off)).toBe(false);
    const vars: Record<string, string> = {};
    expect(eng.expandMacros("{{setvar::vertep.world::true}}{{#if vertep.world}}YES{{else}}NO{{/if}}", { features: off, vars })).toBe("NO");
    expect(vars).toEqual({});
  });
  it("presetFeatureNames finds the flags a preset mentions", () => {
    const p = { prompts: [{ content: "{{#if vertep.dashboard}}x{{/if}}" }], studio: { sections: [{ id: "a", condition: "vertep.dice" }], utilityPrompts: { impersonation: "{{#if vertep.world}}w{{/if}}" } } };
    expect(eng.presetFeatureNames(p)).toEqual(["dashboard", "world", "dice"]);
    expect(eng.presetFeatureNames({ prompts: [{ content: "Vertep is the app." }] })).toEqual([]);
  });
  it("GET /preset-features/:id lists each flag, on here and used by the preset", () => {
    const files = chat({}, { "presets/fx.json": JSON.stringify({ id: "fx", prompts: [{ identifier: "a", content: "{{#if vertep.dice}}d{{/if}} {{#if vertep.litopys}}l{{/if}}" }], prompt_order: [] }) });
    const out = eng.handleRoute({ method: "GET", path: "/preset-features/fx", query: { chatId: "c1" }, body: null }, memHost(files) as any) as any;
    const by = Object.fromEntries(out.json.features.map((f: any) => [f.name, f]));
    expect(by.dice).toEqual({ name: "dice", on: false, used: true });
    expect(by.litopys).toEqual({ name: "litopys", on: true, used: true });
    expect(by.world.used).toBe(false);
  });
});

describe("utility prompts and Polish", () => {
  const builtIns = ["_vertep-lite", "_molfar", "_frankenx"].map((f) => JSON.parse(fs.readFileSync(new URL(`../data/presets/${f}.json`, import.meta.url), "utf8")));
  it("the built-in presets' utility prompts send the same bytes as before", () => {
    for (const p of builtIns) {
      for (const key of ["impersonation", "continueNudge"]) {
        const raw = String((p.utilityPrompts ?? {})[key] ?? "").trim();
        const before = raw.replace(/\{\{user\}\}/g, "Taras").replace(/\{\{char\}\}/g, "Odarka");
        const pv = eng.resolvePresetVars(p, {});
        expect(eng.expandMacros(before, { userName: "Taras", charName: "Odarka", presetVars: pv, features: {}, vars: {} })).toBe(before);
      }
    }
  });
  it("Polish reads the chat's picks the way the chat does (its copy agrees with the engine)", () => {
    const p = { id: "fx", studio: { variables: [
      { id: "v1", name: "narrator", label: "Narrator", type: "choice", defaultValue: "", choices: [{ id: "bard", label: "Bard", value: "a wry bard" }, { id: "oracle", label: "Oracle", value: "a cold oracle" }], defaults: ["bard"] },
      { id: "v2", name: "lang", label: "Language", type: "text", defaultValue: "English" },
      { id: "v3", name: "extras", label: "Extras", type: "choice", multi: true, defaultValue: "", choices: [{ id: "d", label: "Dark", value: "dark" }, { id: "h", label: "Humor", value: "humor" }], defaults: [] },
    ] } };
    const tpl = 'You polish as {{narrator}} in {{var:lang}}. {{#if narrator == "a cold oracle"}}Be terse.{{else}}Be warm.{{/if}}{{#if extras contains "humor"}} Joke.{{/if}} {{getvar::lang}}';
    for (const picks of [{}, { narrator: ["oracle"] }, { narrator: ["oracle"], extras: ["h"], lang: "Ukrainian" }]) {
      const meta = { presetVars: { fx: picks } };
      const engine = eng.expandMacros(tpl, { presetVars: eng.resolvePresetVars(p, meta), vars: {} });
      expect(expandPolish(tpl, p, meta)).toBe(engine);
    }
    expect(expandPolish(tpl, p, { presetVars: { fx: { narrator: ["oracle"] } } })).toContain("as a cold oracle in English. Be terse.");
  });
});
