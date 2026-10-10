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
      utilityPrompts: { impersonation: "", continueNudge: "", newChat: "", groupNudge: "", emptySend: "" },
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
          { variableName: "pov", question: "Whose eyes?", options: JSON.stringify([{ id: "o1", label: "Third", value: "third person" }, { id: "o2", label: "First", value: "first person" }]), multiSelect: "false", displayMode: "listbox", sortOrder: 0 },
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
    expect(sys).toContain("Write Ukrainian prose");
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
