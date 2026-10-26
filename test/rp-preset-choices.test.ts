/**
 * Preset variables picked per chat (0.9.6): {{name}} and {{#if}} in sections, the chat's picks
 * with defaults, the preset route and its notes, per-character memory, option costs.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
type Engine = typeof import("../plugins/engine/plugin.js");
const eng = (await import(engineUrl)) as Engine;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "preset-choices-"));
  for (const d of ["characters/aria", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "A barista.", first_mes: "Hi." }));
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
  fs.writeFileSync(path.join(root, "presets", "fx.json"), JSON.stringify(FX));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

const FX = {
  id: "fx", name: "FX",
  prompts: [
    { identifier: "style", name: "Style", role: "system", content: "Write in {{tense}} tense, {{var:pov}}. Role: {{role}}." },
    { identifier: "social", name: "Social", role: "system", content: "Rules:\n{{#if Social == \"FRICTION\"}}\nPush back.\n{{/if}}\n{{#if Social == \"NONE\"}}\nAgree.\n{{/if}}\nEnd." },
    { identifier: "kinks", name: "Kinks", role: "system", content: "{{#if extras contains \"Dark\"}}DARK ON{{else}}DARK OFF{{/if}}" },
    { identifier: "gated", name: "Gated", role: "system", content: "Gated text." },
  ],
  prompt_order: [{ character_id: 100001, order: ["style", "social", "kinks", "gated"].map((identifier) => ({ identifier, enabled: true })) }],
  studio: {
    sections: [{ id: "gated", condition: "tense==Present" }],
    variables: [
      { id: "v1", name: "tense", label: "Tense", type: "choice", defaultValue: "", choices: [{ id: "past", label: "Past", value: "past" }, { id: "present", label: "Present", value: "present" }], defaults: ["past"] },
      { id: "v2", name: "pov", label: "POV", type: "choice", defaultValue: "", choices: [{ id: "third", label: "Third", value: "third person about {{char}}" }, { id: "first", label: "First", value: "first person" }] },
      { id: "v3", name: "Social", label: "Social dynamics", type: "choice", defaultValue: "", choices: [{ id: "f", label: "Friction", value: "FRICTION" }, { id: "n", label: "None", value: "NONE" }], defaults: ["f"] },
      { id: "v4", name: "extras", label: "Extras", type: "choice", multi: true, separator: " + ", defaultValue: "", choices: [{ id: "d", label: "Dark", value: "dark themes" }, { id: "h", label: "Humor", value: "humor" }] },
      { id: "v5", name: "role", label: "Role", type: "text", defaultValue: "narrator" },
    ],
  },
};

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
    llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
}
const h = () => host();
const call = (method: string, p: string, body?: unknown) => {
  const out = eng.handleRoute({ method, path: p, query: {}, body }, h()) as { status?: number; json: Record<string, any> };
  return out.json;
};
const newChat = (body: Record<string, unknown>) => call("POST", "/chats", { characterId: "aria", ...body }).meta as Record<string, any>;
const prompt = (chatId: string) => (call("POST", "/prompt/preview", { chatId }).messages as { content: string }[]).map((m) => m.content).join("\n");
const readMeta = (id: string) => JSON.parse(fs.readFileSync(path.join(root, "chats", id + ".meta.json"), "utf8"));

describe("{{#if}} conditions", () => {
  const vars: Record<string, { value: string; picks: { id: string; label: string; value: string }[] | null }> = {
    a: { value: "FRICTION", picks: [{ id: "f", label: "Friction", value: "FRICTION" }] },
    m: { value: "dark, humor", picks: [{ id: "d", label: "Dark", value: "dark" }, { id: "h", label: "Humor", value: "humor" }] },
    t: { value: "TRUE", picks: null },
    e: { value: "", picks: null },
  };
  const look = (n: string) => vars[n];
  const ev = (c: string) => eng.evalIfCondition(c, look);
  it("compares, chains and negates", () => {
    expect(ev('a == "FRICTION"')).toBe(true);
    expect(ev('a == "friction"')).toBe(true); // case is ignored
    expect(ev('a == "Friction"')).toBe(true); // a choice matches by label too
    expect(ev('a != "NONE"')).toBe(true);
    expect(ev('a == "NONE" || "FRICTION"')).toBe(true); // shorthand repeats the comparison
    expect(ev('a == "NONE" || "GREASED"')).toBe(false);
    expect(ev('a == “FRICTION”')).toBe(true); // typographic quotes
    expect(ev('m contains "humor" && !e')).toBe(true);
    expect(ev('m not contains "dark"')).toBe(false);
    expect(ev('(a == "NONE" || t) && a is not "NONE"')).toBe(true);
    expect(ev("t")).toBe(true);
    expect(ev("e")).toBe(false);
    expect(ev("unknown")).toBe(false);
    expect(ev('a == "x" (')).toBe(false); // bad syntax is false
  });
  it("renders branches, nesting and else-if, eating empty lines", () => {
    const out = eng.expandIfBlocks('A\n{{#if a == "NONE"}}\nno\n{{else if t}}\nyes {{#if m contains "dark"}}dark{{/if}}\n{{else}}\nelse\n{{/if}}\nB\n{{#if e}}\nhidden\n{{/if}}\nC', look);
    expect(out).toBe("A\nyes dark\nB\nC");
  });
});

describe("chat picks", () => {
  it("defaults render, {{name}} and {{var:name}} read picks, conditions follow them", () => {
    const meta = newChat({ presetId: "fx" });
    let sys = prompt(meta.id);
    expect(sys).toContain("Write in past tense, third person about Aria. Role: narrator.");
    expect(sys).toContain("Rules:\nPush back.\nEnd.");
    expect(sys).toContain("DARK OFF");
    expect(sys).not.toContain("Gated text.");

    call("POST", `/chats/${meta.id}/preset`, { vars: { tense: "present", pov: "first", Social: "n", extras: ["d", "h"], role: "bard" } });
    sys = prompt(meta.id);
    expect(sys).toContain("Write in present tense, first person. Role: bard.");
    expect(sys).toContain("Rules:\nAgree.\nEnd.");
    expect(sys).toContain("DARK ON");
    expect(sys).toContain("Gated text."); // the section condition reads the choice's label

    // null puts a variable back to its default; ids the preset no longer has do too
    call("POST", `/chats/${meta.id}/preset`, { vars: { tense: null, pov: "gone" } });
    sys = prompt(meta.id);
    expect(sys).toContain("Write in past tense, third person about Aria.");
  });

  it("picks are kept per preset, and a reset clears them", () => {
    const meta = newChat({ presetId: "fx" });
    call("POST", `/chats/${meta.id}/preset`, { vars: { tense: "present" } });
    call("POST", `/chats/${meta.id}/preset`, { presetId: "default" });
    expect(readMeta(meta.id).presetVars.fx.tense).toBe("present");
    call("POST", `/chats/${meta.id}/preset`, { presetId: "fx" });
    expect(prompt(meta.id)).toContain("present tense");
    call("POST", `/chats/${meta.id}/preset`, { reset: true });
    expect(readMeta(meta.id).presetVars.fx).toBeUndefined();
    expect(call("POST", `/chats/${meta.id}/preset`, { presetId: "nope" }).error).toBeTruthy();
  });

  it("notes say what changed after which message, merge until the next one, vanish when undone", () => {
    const meta = newChat({ presetId: "fx" });
    // no user message yet: nothing to explain
    call("POST", `/chats/${meta.id}/preset`, { vars: { tense: "present" } });
    expect(readMeta(meta.id).presetNotes).toBeUndefined();
    const msg = call("POST", `/chats/${meta.id}/messages`, { role: "user", text: "hello" }).message as { id: string };
    call("POST", `/chats/${meta.id}/preset`, { vars: { pov: "first" } });
    call("POST", `/chats/${meta.id}/preset`, { vars: { Social: "n" } });
    let notes = readMeta(meta.id).presetNotes;
    expect(notes.length).toBe(1);
    expect(notes[0].after).toBe(msg.id);
    expect(notes[0].changes).toEqual([
      { kind: "var", label: "POV", shown: "First" },
      { kind: "var", label: "Social dynamics", shown: "None" },
    ]);
    call("POST", `/chats/${meta.id}/preset`, { vars: { pov: "third", Social: "f" } });
    expect(readMeta(meta.id).presetNotes).toBeUndefined();
    call("POST", `/chats/${meta.id}/preset`, { presetId: "default" });
    notes = readMeta(meta.id).presetNotes;
    expect(notes[0].changes).toEqual([{ kind: "preset", label: "Preset", shown: "Default" }]);
    // notes never reach the model
    expect(prompt(meta.id)).not.toContain("Preset");
  });
});

describe("per-character memory", () => {
  it("a new chat starts with the preset and picks the user last chose with the character", () => {
    // chats that never chose leave new chats on the default preset
    newChat({});
    expect(newChat({}).presetId).toBe("default");
    expect(call("GET", "/preset-memory/aria").presetId).toBe(null);
    // the new-chat step sends picks: that is a choice
    const a = newChat({ presetId: "fx", presetVars: { tense: "present" } });
    expect(a.presetAt).toBeGreaterThan(0);
    expect(call("GET", "/preset-memory/aria")).toEqual({ presetId: "fx", vars: { tense: "present" } });
    const b = newChat({});
    expect(b.presetId).toBe("fx");
    expect(b.presetVars).toEqual({ fx: { tense: "present" } });
    // an explicit preset wins over memory
    expect(newChat({ presetId: "default" }).presetId).toBe("default");
  });
});

describe("option costs", () => {
  it("prices the preset and each option", () => {
    const costs = call("POST", "/preset-costs/fx", {}) as { total: number; vars: Record<string, Record<string, number>> };
    expect(costs.total).toBeGreaterThan(10);
    expect(costs.vars.tense.present).toBeGreaterThanOrEqual(costs.vars.tense.past);
    expect(costs.vars.Social.f).toBeGreaterThan(0);
    expect(costs.vars.extras.d).toBeLessThanOrEqual(0); // "DARK ON" replaces the longer else branch
    expect(costs.vars.extras.h).toBe(0);
    expect(costs.vars.role).toBeUndefined(); // free text has no options
    // unsaved picks from the panel or the step
    const withPresent = call("POST", "/preset-costs/fx", { vars: { tense: "present" } }) as { total: number };
    expect(withPresent.total).toBeGreaterThan(costs.total); // the gated section joins
  });
});

describe("toggles and section conditions", () => {
  it("a toggle variable switches its sections; !name shows while it is off", () => {
    const on = { vn: { value: "true", picks: null } };
    const off = { vn: { value: "false", picks: null } };
    expect(eng.sectionCondPasses("vn", on, {})).toBe(true);
    expect(eng.sectionCondPasses("vn", off, {})).toBe(false);
    expect(eng.sectionCondPasses("!vn", off, {})).toBe(true);
    expect(eng.sectionCondPasses("!vn", on, {})).toBe(false);
    // chat variables still work when no preset variable has the name
    expect(eng.sectionCondPasses("mood==tense", {}, { mood: "tense" })).toBe(true);
  });
});

describe("Marinara import", () => {
  it("maps sections, markers, groups, choice blocks with defaults and parameters", async () => {
    const { presetImport } = await import("../src/lib/import-shapes.ts");
    const base = {
      id: "b", name: "B", readOnly: false, isDefault: false, folderId: null, picture: null, sections: [], groups: [], variables: [],
      utilityPrompts: { impersonation: "", continueNudge: "", newChat: "", groupNudge: "", emptySend: "", polish: "" },
      samplers: {
        temperature: { value: 1, enabled: true }, top_p: { value: 1, enabled: true }, top_k: { value: 0, enabled: false }, min_p: { value: 0, enabled: false },
        rep_pen: { value: 1, enabled: false }, freq_pen: { value: 0, enabled: false }, pres_pen: { value: 0, enabled: false },
        maxTokens: 1000, contextSize: 8000, contextUnlocked: false, seed: -1, stopStrings: [], logitBias: [],
        reasoning: { enabled: false, effort: "off", budget: 0, autoParse: true, display: "collapsed", thinkTagOpen: "", thinkTagClose: "" },
        streaming: true, streamingSpeed: 0, assistantPrefill: "",
      },
      namesBehavior: "default", verbosity: "auto", continuePrefill: true, squashSystemMessages: false,
    } as never;
    const json = {
      type: "marinara_preset", version: 1,
      data: {
        preset: {
          name: "Mari", description: "About.", wrapFormat: "xml",
          sectionOrder: JSON.stringify(["s1", "m1", "m2", "m3", "s2"]),
          defaultChoices: JSON.stringify({ pov: "first person", extras: ["humor"] }),
          parameters: JSON.stringify({ temperature: 0.95, topP: 0.9, maxTokens: 8192, maxContext: 128000, reasoningEffort: "maximum", repetitionPenalty: 1.12 }),
        },
        sections: [
          { id: "s2", name: "Depth", content: "Late.", role: "user", enabled: "true", isMarker: "false", groupId: "g1", injectionPosition: "depth", injectionDepth: 1, wrapInXml: "true", xmlTagName: "late" },
          { id: "s1", name: "Role", content: "You are {{pov}}.", role: "system", enabled: "true", isMarker: "false", groupId: "g1", injectionPosition: "ordered" },
          { id: "m1", name: "Characters", content: "", role: "system", enabled: "true", isMarker: "true", markerConfig: { type: "character" } },
          { id: "m2", name: "Past Events", content: "", role: "user", enabled: "true", isMarker: "true", markerConfig: "{\"type\":\"chat_summary\"}" },
          { id: "m3", name: "Chat History", content: "", role: "assistant", enabled: "true", isMarker: "true", markerConfig: "{\"type\":\"chat_history\"}" },
        ],
        groups: [{ id: "g1", name: "Core Identity", enabled: "true" }],
        choiceBlocks: [
          { variableName: "pov", question: "Whose eyes?", options: JSON.stringify([{ id: "o1", label: "Third", value: "third person", description: "  The narrator stays outside her head.  " }, { id: "o2", label: "First", value: "first person" }]), multiSelect: "false", displayMode: "listbox", sortOrder: 0 },
          { variableName: "extras", question: "Extras", options: [{ id: "x1", label: "Dark", value: "dark" }, { id: "x2", label: "Humor", value: "humor" }], multiSelect: "true", separator: " & ", displayMode: "buttons", sortOrder: 1 },
        ],
      },
    };
    const p = presetImport(json, "file-name", base)!;
    expect(p.name).toBe("Mari");
    expect(p.description).toBe("About.");
    expect(p.sections.map((s) => (s.marker ? s.id : s.name))).toEqual(["Role", "charDescription", "charPersonality", "scenario", "chatHistory", "Depth"]);
    const depth = p.sections.find((s) => s.name === "Depth")!;
    expect(depth.position).toBe("in-chat");
    expect(depth.depth).toBe(1);
    expect(depth.content).toBe("<late>\nLate.\n</late>");
    expect(p.sections.some((s) => s.marker === "summary")).toBe(false); // the story memory places itself
    expect(p.groups).toEqual([{ id: "g1", name: "Core Identity", wrapFormat: "xml" }]);
    const pov = p.variables.find((v) => v.name === "pov")!;
    expect(pov.type).toBe("choice");
    expect(pov.defaults).toEqual(["o2"]);
    expect(pov.choices?.[0].hint).toBe("The narrator stays outside her head.");
    expect(pov.choices?.[1].hint).toBeUndefined();
    const extras = p.variables.find((v) => v.name === "extras")!;
    expect(extras.multi).toBe(true);
    expect(extras.separator).toBe(" & ");
    expect(extras.display).toBe("buttons");
    expect(extras.defaults).toEqual(["x2"]);
    expect(p.samplers.temperature.value).toBe(0.95);
    expect(p.samplers.maxTokens).toBe(8192);
    expect(p.samplers.reasoning.effort).toBe("max");
  });
});

describe("built-in Molfar", () => {
  const data = path.join(import.meta.dir, "..", "data");
  const shipped = path.join(data, "presets");
  it("ships as a preset and as the update template, identical and read-only", () => {
    const a = fs.readFileSync(path.join(shipped, "molfar.json"), "utf8");
    expect(fs.readFileSync(path.join(shipped, "_molfar.json"), "utf8")).toBe(a);
    const p = JSON.parse(a);
    expect(p.id).toBe("molfar");
    expect(p.studio.readOnly).toBe(true);
    expect(p.studio.isDefault).toBe(false);
  });
  it("ships its regex scripts bound to it, and the same ones in the update template", () => {
    const files = fs.readdirSync(path.join(data, "regex")).filter((f) => f.startsWith("molfar-"));
    const bundle = JSON.parse(fs.readFileSync(path.join(data, "_molfar-regex.json"), "utf8")).scripts;
    expect(files.length).toBe(8);
    expect(bundle.map((s: { id: string }) => `${s.id}.json`).sort()).toEqual(files.sort());
    for (const s of bundle) {
      expect(s).toMatchObject({ scope: "preset", scopeTargetId: "molfar" });
      expect(JSON.parse(fs.readFileSync(path.join(data, "regex", `${s.id}.json`), "utf8"))).toEqual(s);
    }
  });
  it("an update from before 4.48.0 adds the preset and its scripts once, and keeps a copy the user has", () => {
    fs.copyFileSync(path.join(shipped, "_molfar.json"), path.join(root, "presets", "_molfar.json"));
    fs.copyFileSync(path.join(data, "_molfar-regex.json"), path.join(root, "_molfar-regex.json"));
    fs.mkdirSync(path.join(root, "regex"), { recursive: true });
    fs.writeFileSync(path.join(root, "regex", "molfar-plan-hide-from-chat.json"), '{"id":"molfar-plan-hide-from-chat","mine":true}');
    const first = eng.onAppUpdate({ from: "4.47.0", to: "4.48.0" }, h()).upgraded;
    expect(first).toContain("presets/molfar.json");
    expect(first.filter((x: string) => x.startsWith("regex/molfar-")).length).toBe(7);
    expect(JSON.parse(fs.readFileSync(path.join(root, "regex", "molfar-plan-hide-from-chat.json"), "utf8")).mine).toBe(true);
    const again = eng.onAppUpdate({ from: "4.47.0", to: "4.48.0" }, h()).upgraded;
    expect(again.some((x: string) => x.includes("molfar"))).toBe(false);
  });
  it("every option of both built-in presets has a hint, and an older built-in copy gets them on update", () => {
    for (const id of ["molfar", "frankenx"]) {
      const p = JSON.parse(fs.readFileSync(path.join(shipped, `${id}.json`), "utf8"));
      for (const v of p.studio.variables) for (const c of v.choices ?? []) {
        expect(typeof c.hint).toBe("string");
        expect(c.hint.length).toBeGreaterThan(5);
        expect(c.hint.length).toBeLessThanOrEqual(200);
        expect(c.label).not.toMatch(/\{\{/);
      }
    }
    const tpl = JSON.parse(fs.readFileSync(path.join(shipped, "_frankenx.json"), "utf8"));
    const old = structuredClone(tpl);
    for (const v of old.studio.variables) for (const c of v.choices ?? []) delete c.hint;
    old.studio.variables[0].choices[0].hint = "my own";
    fs.writeFileSync(path.join(root, "presets", "frankenx.json"), JSON.stringify(old));
    fs.copyFileSync(path.join(shipped, "_frankenx.json"), path.join(root, "presets", "_frankenx.json"));
    expect(eng.onAppUpdate({ from: "4.47.0", to: "4.48.0" }, h()).upgraded).toContain("presets/frankenx.json hints");
    // a read-only copy ends up as the shipped template: nobody edits it, so a stray hint does not stay
    const now = JSON.parse(fs.readFileSync(path.join(root, "presets", "frankenx.json"), "utf8"));
    expect(now).toEqual(tpl);
    // a copy the user made their own (not read-only) is left alone
    now.studio.readOnly = false;
    for (const v of now.studio.variables) for (const c of v.choices ?? []) delete c.hint;
    fs.writeFileSync(path.join(root, "presets", "frankenx.json"), JSON.stringify(now));
    expect(eng.onAppUpdate({ from: "4.47.0", to: "4.48.0" }, h()).upgraded).not.toContain("presets/frankenx.json hints");
  });
  it("renders with no macro left, and its picks switch blocks", () => {
    fs.copyFileSync(path.join(shipped, "molfar.json"), path.join(root, "presets", "molfar.json"));
    const meta = newChat({ presetId: "molfar" });
    let sys = prompt(meta.id);
    expect(sys.match(/\{\{(?!suggest:)[^}]*\}\}/g)).toBeNull();
    expect(sys).toContain("### Length: Long");
    expect(sys).not.toContain("Written Plan: Micro");
    expect(sys).not.toContain("Modifier Rotation");
    call("POST", `/chats/${meta.id}/preset`, { vars: { length: "length_short", reasoning: "reasoning_micro", focus_mods: ["focus_mods_brutal"], custom_instructions: "No magic here." } });
    sys = prompt(meta.id);
    expect(sys).toContain("### Length: Short");
    expect(sys).not.toContain("### Length: Long");
    expect(sys).toContain("Written Plan: Micro");
    expect(sys).toContain("Modifier Rotation");
    expect(sys).toContain("No magic here.");
  });
});

describe("built-in FRANKENX", () => {
  const shipped = path.join(import.meta.dir, "..", "data", "presets");
  it("ships as a preset and as the update template, identical and read-only", () => {
    const a = fs.readFileSync(path.join(shipped, "frankenx.json"), "utf8");
    expect(fs.readFileSync(path.join(shipped, "_frankenx.json"), "utf8")).toBe(a);
    const p = JSON.parse(a);
    expect(p.id).toBe("frankenx");
    expect(p.studio.readOnly).toBe(true);
    expect(p.studio.isDefault).toBe(false);
  });
  it("an update from before 4.31.0 adds it once from the template", () => {
    fs.copyFileSync(path.join(shipped, "_frankenx.json"), path.join(root, "presets", "_frankenx.json"));
    expect(eng.onAppUpdate({ from: "4.30.0", to: "4.31.0" }, h()).upgraded).toContain("presets/frankenx.json");
    expect(fs.existsSync(path.join(root, "presets", "frankenx.json"))).toBe(true);
    expect(eng.onAppUpdate({ from: "4.30.0", to: "4.31.0" }, h()).upgraded).not.toContain("presets/frankenx.json");
  });
  it("renders with no macro left, without the scene header, and its toggles switch blocks", () => {
    fs.copyFileSync(path.join(shipped, "frankenx.json"), path.join(root, "presets", "frankenx.json"));
    const meta = newChat({ presetId: "frankenx" });
    let sys = prompt(meta.id);
    expect(sys.match(/\{\{[^}]*\}\}/g)).toBeNull();
    expect(sys).not.toContain("scene_header");
    expect(sys).not.toMatch(/tracker agents/i);
    expect(sys).toContain("# Reasoning Rules");
    expect(sys).not.toContain("colored_dialogue_protocol");
    call("POST", `/chats/${meta.id}/preset`, { vars: { Reasoning_Plan: "false", Colored_Dialogue: "true", Prose_Language: "Ukrainian" } });
    sys = prompt(meta.id);
    expect(sys).not.toContain("# Reasoning Rules");
    expect(sys).toContain('<span style="color:#HEX">');
    expect(sys).toContain("Write prose in Ukrainian,");
    call("POST", `/chats/${meta.id}/preset`, { vars: { Prose_Language: "match_user" } });
    sys = prompt(meta.id);
    expect(sys).toMatch(/Write prose in the same language as [^{]+'s latest message,/);
  });
  it("Prose language is a pick of the 14 interface languages plus the user's own, English by default", () => {
    const p = JSON.parse(fs.readFileSync(path.join(shipped, "frankenx.json"), "utf8"));
    const v = p.studio.variables.find((x: { id: string }) => x.id === "var_prose_language");
    expect(v.type).toBe("choice");
    expect(v.choices.length).toBe(15);
    expect(v.choices[0].id).toBe("match_user");
    expect(v.defaults).toEqual(["English"]);
  });
  it("an update from before 4.37.0 turns the old free-text Prose language into the pick, once", () => {
    const p = JSON.parse(fs.readFileSync(path.join(shipped, "frankenx.json"), "utf8"));
    const at = p.studio.variables.findIndex((x: { id: string }) => x.id === "var_prose_language");
    p.studio.variables[at] = { id: "var_prose_language", name: "Prose_Language", label: "Prose language", type: "text", defaultValue: "English", question: "The language replies are written in." };
    const old = JSON.stringify(p).split("Write prose in {{Prose_Language}}, in the").join("Write {{Prose_Language}} prose in the");
    fs.writeFileSync(path.join(root, "presets", "mycopy.json"), old);
    expect(eng.onAppUpdate({ from: "4.36.0", to: "4.37.0" }, h()).upgraded).toContain("presets/mycopy.json prose language");
    const after = fs.readFileSync(path.join(root, "presets", "mycopy.json"), "utf8");
    expect(after).not.toContain("Write {{Prose_Language}} prose");
    expect(JSON.parse(after).studio.variables[at].type).toBe("choice");
    expect(eng.onAppUpdate({ from: "4.36.0", to: "4.37.0" }, h()).upgraded).not.toContain("presets/mycopy.json prose language");
  });
});

describe("fixes after the UI round", () => {
  it("costs: only the total on request; a marker's own text (the main prompt) counts", () => {
    const quick = call("POST", "/preset-costs/fx", { only: "total" }) as { total: number; vars: Record<string, unknown> };
    expect(quick.total).toBeGreaterThan(10);
    expect(quick.vars).toEqual({});
    fs.writeFileSync(path.join(root, "presets", "mainonly.json"), JSON.stringify({
      id: "mainonly", name: "Main only",
      prompts: [{ identifier: "main", name: "Main", role: "system", marker: true, content: "Write the next reply as the character, in vivid detail." }, { identifier: "chatHistory", marker: true }],
      prompt_order: [{ character_id: 100001, order: [{ identifier: "main", enabled: true }, { identifier: "chatHistory", enabled: true }] }],
    }));
    expect((call("POST", "/preset-costs/mainonly", {}) as { total: number }).total).toBeGreaterThan(5);
  });
  it("a fork keeps only the notes whose message it copied", () => {
    const meta = newChat({ presetId: "fx" });
    const first = call("POST", `/chats/${meta.id}/messages`, { role: "user", text: "one" }).message as { id: string };
    call("POST", `/chats/${meta.id}/preset`, { vars: { tense: "present" } });
    call("POST", `/chats/${meta.id}/messages`, { role: "user", text: "two" });
    call("POST", `/chats/${meta.id}/preset`, { vars: { pov: "first" } });
    expect(readMeta(meta.id).presetNotes.length).toBe(2);
    const fork = call("POST", `/chats/${meta.id}/fork`, { messageId: first.id }).meta as { id: string };
    const notes = readMeta(fork.id).presetNotes;
    expect(notes.length).toBe(1);
    expect(notes[0].after).toBe(first.id);
  });
});

describe("built-in Vertep Lite", () => {
  const shipped = path.join(import.meta.dir, "..", "data", "presets");
  const read = () => JSON.parse(fs.readFileSync(path.join(shipped, "vertep-lite.json"), "utf8"));
  const msgs = (chatId: string) => call("POST", "/prompt/preview", { chatId, userText: "Hello there." }).messages as { role: string; content: string }[];

  it("ships as a preset and as the update template, identical, read-only, every option explained", () => {
    const a = fs.readFileSync(path.join(shipped, "vertep-lite.json"), "utf8");
    expect(fs.readFileSync(path.join(shipped, "_vertep-lite.json"), "utf8")).toBe(a);
    const p = JSON.parse(a);
    expect(p.id).toBe("vertep-lite");
    expect(p.studio.readOnly).toBe(true);
    expect(p.reasoningTags).toEqual({ open: "<plan>", close: "</plan>" });
    for (const v of p.studio.variables) for (const c of v.choices ?? []) {
      expect(c.hint.length).toBeGreaterThan(5);
      expect(c.hint.length).toBeLessThanOrEqual(200);
    }
  });

  it("an update replaces a stale read-only copy with the shipped template, and leaves an editable copy alone", () => {
    const tpl = read();
    fs.copyFileSync(path.join(shipped, "_vertep-lite.json"), path.join(root, "presets", "_vertep-lite.json"));
    const stale = structuredClone(tpl);
    stale.prompts = stale.prompts.filter((x: { identifier: string }) => x.identifier !== "lite_html");
    stale.studio.variables = stale.studio.variables.filter((v: { name: string }) => v.name !== "html");
    fs.writeFileSync(path.join(root, "presets", "vertep-lite.json"), JSON.stringify(stale));
    expect(eng.onAppUpdate({ from: "4.70.0", to: "4.70.1" }, h()).upgraded).toContain("presets/vertep-lite.json");
    const now = JSON.parse(fs.readFileSync(path.join(root, "presets", "vertep-lite.json"), "utf8"));
    expect(now).toEqual(tpl);
    expect(now.prompts.some((x: { identifier: string }) => x.identifier === "lite_html")).toBe(true);
    expect(eng.onAppUpdate({ from: "4.70.0", to: "4.70.1" }, h()).upgraded).not.toContain("presets/vertep-lite.json");
    const mine = { ...stale, studio: { ...stale.studio, readOnly: false } };
    fs.writeFileSync(path.join(root, "presets", "vertep-lite.json"), JSON.stringify(mine));
    expect(eng.onAppUpdate({ from: "4.70.0", to: "4.70.1" }, h()).upgraded).not.toContain("presets/vertep-lite.json");
    expect(JSON.parse(fs.readFileSync(path.join(root, "presets", "vertep-lite.json"), "utf8"))).toEqual(mine);
  });

  it("stays light: under 3k tokens with the heaviest picks", () => {
    const p = read();
    const costs = eng.presetCosts(p, {}, false) as { total: number; vars: Record<string, Record<string, number>> };
    expect(costs.total).toBeLessThan(2500);
    const heaviest = Object.entries(costs.vars).map(([name, by]) => {
      const def = p.studio.variables.find((v: { name: string }) => v.name === name).defaults[0];
      return Math.max(...Object.values(by)) - (by[def] ?? 0);
    });
    expect(costs.total + heaviest.reduce((x, y) => x + y, 0)).toBeLessThan(3000);
  });

  it("keeps the request start fixed for the prompt cache: only the reply notes follow the newest message", () => {
    fs.copyFileSync(path.join(shipped, "vertep-lite.json"), path.join(root, "presets", "vertep-lite.json"));
    const meta = newChat({ presetId: "vertep-lite" });
    const one = msgs(meta.id);
    const two = msgs(meta.id);
    const lastUser = one.map((m) => m.role).lastIndexOf("user");
    // everything up to the newest message is the same from one request to the next (the Muse is random)
    expect(two.slice(0, lastUser + 1)).toEqual(one.slice(0, lastUser + 1));
    expect(one[0]!.content.startsWith("# Vertep Lite")).toBe(true);
    const tail = one.slice(lastUser + 1).map((m) => m.content).join("\n");
    expect(tail).toContain("<plan>");
    expect(tail).toContain("[Muse for this reply");
    expect(tail).toContain("[This reply: at least 700 words");
    expect(tail.indexOf("[This reply:")).toBeGreaterThan(tail.indexOf("[Muse"));
    expect(one.map((m) => m.content).join("\n").match(/\{\{(?!suggest:)[^}]*\}\}/g)).toBeNull();
  });

  it("puts world info below the history, so a change in the active entries keeps the history cached", () => {
    fs.copyFileSync(path.join(shipped, "vertep-lite.json"), path.join(root, "presets", "vertep-lite.json"));
    fs.writeFileSync(path.join(root, "lorebooks", "lb.json"), JSON.stringify({ id: "lb", name: "World", entries: [{ uid: 1, title: "Tower", keys: [], content: "The Crimson Tower stands by the sea.", enabled: true, status: "constant", order: 100, position: "before_char" }] }));
    const meta = newChat({ presetId: "vertep-lite", lorebookIds: ["lb"] });
    call("PATCH", `/chats/${meta.id}`, { lorebookIds: ["lb"] });
    const one = msgs(meta.id);
    const lastUser = one.map((m) => m.role).lastIndexOf("user");
    const at = one.findIndex((m) => m.content.includes("The Crimson Tower"));
    expect(at).toBeGreaterThan(lastUser);
    expect(one[at]!.content).toContain("[World info for this scene");
    // with no entry active the heading stays out
    fs.writeFileSync(path.join(root, "lorebooks", "lb.json"), JSON.stringify({ id: "lb", name: "World", entries: [] }));
    expect(msgs(meta.id).some((m) => m.content.includes("[World info for this scene"))).toBe(false);
  });

  it("its picks switch the plan and the Muse off and change the notes", () => {
    fs.copyFileSync(path.join(shipped, "vertep-lite.json"), path.join(root, "presets", "vertep-lite.json"));
    const meta = newChat({ presetId: "vertep-lite" });
    call("POST", `/chats/${meta.id}/preset`, { vars: { plan: "plan_off", muse: "false", length: "length_short", language: "language_uk", custom: "No magic here." } });
    const all = msgs(meta.id).map((m) => m.content).join("\n");
    expect(all).not.toContain("<plan>");
    expect(all).not.toContain("[Muse");
    expect(all).toContain("about 200-300 words");
    expect(all).toContain("Language: Ukrainian");
    expect(all).toContain("No magic here.");
  });

  it("an update seeds it once and keeps a copy the user already has", () => {
    fs.copyFileSync(path.join(shipped, "_vertep-lite.json"), path.join(root, "presets", "_vertep-lite.json"));
    expect(eng.onAppUpdate({ from: "4.55.0", to: "4.56.0" }, h()).upgraded).toContain("presets/vertep-lite.json");
    expect(eng.onAppUpdate({ from: "4.55.0", to: "4.56.0" }, h()).upgraded).not.toContain("presets/vertep-lite.json");
  });

  it("4.57.0 refreshes the read-only copy and keeps one the user made editable", () => {
    fs.copyFileSync(path.join(shipped, "_vertep-lite.json"), path.join(root, "presets", "_vertep-lite.json"));
    const old = { ...read(), prompts: [] };
    fs.writeFileSync(path.join(root, "presets", "vertep-lite.json"), JSON.stringify(old));
    expect(eng.onAppUpdate({ from: "4.56.0", to: "4.57.0" }, h()).upgraded).toContain("presets/vertep-lite.json");
    expect(JSON.parse(fs.readFileSync(path.join(root, "presets", "vertep-lite.json"), "utf8")).prompts.length).toBeGreaterThan(0);
    fs.writeFileSync(path.join(root, "presets", "vertep-lite.json"), JSON.stringify({ ...old, studio: { ...old.studio, readOnly: false } }));
    expect(eng.onAppUpdate({ from: "4.56.0", to: "4.57.0" }, h()).upgraded).not.toContain("presets/vertep-lite.json");
  });
  it("repeats Only you after the newest message, and drops the reminder for the other picks (#121)", () => {
    fs.copyFileSync(path.join(shipped, "vertep-lite.json"), path.join(root, "presets", "vertep-lite.json"));
    const meta = newChat({ presetId: "vertep-lite" });
    const one = msgs(meta.id);
    const lastUser = one.map((m) => m.role).lastIndexOf("user");
    const tail = one.slice(lastUser + 1).map((m) => m.content).join("\n");
    expect(tail).toContain("belongs to the Human");
    expect(tail.indexOf("belongs to the Human")).toBeGreaterThan(tail.indexOf("[This reply:"));
    call("POST", `/chats/${meta.id}/preset`, { vars: { control: "control_guided" } });
    expect(msgs(meta.id).map((m) => m.content).join("\n")).not.toContain("belongs to the Human");
  });

  it("draws in-world objects as HTML panels by default, and a pick switches that off", () => {
    fs.copyFileSync(path.join(shipped, "vertep-lite.json"), path.join(root, "presets", "vertep-lite.json"));
    const meta = newChat({ presetId: "vertep-lite" });
    const on = msgs(meta.id).map((m) => m.content).join("\n");
    expect(on).toContain("## HTML panels");
    expect(on).toContain("raw HTML in the reply, never inside a code block");
    // the rule sits in the fixed start of the request, not after the newest message
    const first = msgs(meta.id);
    const lastUser = first.map((m) => m.role).lastIndexOf("user");
    expect(first.slice(lastUser + 1).map((m) => m.content).join("\n")).not.toContain("## HTML panels");
    call("POST", `/chats/${meta.id}/preset`, { vars: { html: "html_off" } });
    expect(msgs(meta.id).map((m) => m.content).join("\n")).not.toContain("## HTML panels");
  });

  it("has a fiction frame that is off until picked, then sits in the fixed start with a reminder after the newest message", () => {
    fs.copyFileSync(path.join(shipped, "vertep-lite.json"), path.join(root, "presets", "vertep-lite.json"));
    const meta = newChat({ presetId: "vertep-lite" });
    const all = (m: { content: string }[]) => m.map((x) => x.content).join("\n");
    expect(all(msgs(meta.id))).not.toContain("## Fiction frame");
    call("POST", `/chats/${meta.id}/preset`, { vars: { frame: "frame_on" } });
    const on = msgs(meta.id);
    expect(all(on)).toContain("## Fiction frame");
    expect(all(on)).toContain("never takes part in one");
    const lastUser = on.map((m) => m.role).lastIndexOf("user");
    expect(all(on.slice(0, lastUser + 1))).toContain("## Fiction frame");
    expect(all(on.slice(0, lastUser + 1))).not.toContain("Stay in the story: no refusal");
    expect(all(on.slice(lastUser + 1))).toContain("Stay in the story: no refusal");
    call("POST", `/chats/${meta.id}/preset`, { vars: { frame: "frame_off" } });
    expect(all(msgs(meta.id))).not.toContain("Fiction frame");
    expect(all(msgs(meta.id))).not.toContain("Stay in the story: no refusal");
  });

  it("has a strict point of view that keeps the user's mind closed (#121)", () => {
    fs.copyFileSync(path.join(shipped, "vertep-lite.json"), path.join(root, "presets", "vertep-lite.json"));
    const meta = newChat({ presetId: "vertep-lite" });
    call("POST", `/chats/${meta.id}/preset`, { vars: { pov: "pov_strict" } });
    const all = msgs(meta.id).map((m) => m.content).join("\n");
    expect(all).toContain("strictly from");
    expect(all).toContain("never narrate");
  });

  it("4.66.0 refreshes the read-only copy and keeps an editable one (#121)", () => {
    fs.copyFileSync(path.join(shipped, "_vertep-lite.json"), path.join(root, "presets", "_vertep-lite.json"));
    const old = { ...read(), prompts: [] };
    fs.writeFileSync(path.join(root, "presets", "vertep-lite.json"), JSON.stringify(old));
    expect(eng.onAppUpdate({ from: "4.65.0", to: "4.66.0" }, h()).upgraded).toContain("presets/vertep-lite.json");
    fs.writeFileSync(path.join(root, "presets", "vertep-lite.json"), JSON.stringify({ ...old, studio: { ...old.studio, readOnly: false } }));
    expect(eng.onAppUpdate({ from: "4.65.0", to: "4.66.0" }, h()).upgraded).not.toContain("presets/vertep-lite.json");
  });
});
