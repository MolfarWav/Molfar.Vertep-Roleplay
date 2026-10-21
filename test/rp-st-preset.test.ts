// SillyTavern preset import (GitHub #57): sections, toggle groups as Choices, regex, macros, samplers, report.
// Fixtures are small files written here; no real preset is copied into the repo.
import { describe, expect, it } from "bun:test";
import { presetImportFull, presetImport, regexImport, regexScriptsOf } from "../src/lib/import-shapes.js";
import { buildDefaultPreset } from "../src/lib/seed.js";
import { expandIfBlocks } from "../plugins/engine/plugin.js";

const P = (name: string, content = "", extra: Record<string, unknown> = {}) => ({ identifier: "id_" + name, name, role: "system", content, ...extra });
const order = (prompts: { identifier: string }[], off: string[] = []) => [
  { character_id: 100001, order: prompts.map((p) => ({ identifier: p.identifier, enabled: !off.includes(p.identifier) })) },
];
const make = (prompts: any[], off: string[] = [], extra: Record<string, unknown> = {}) => ({ prompts, prompt_order: order(prompts, off), ...extra });
const run = (json: unknown, name = "My Preset") => presetImportFull(json, name, buildDefaultPreset())!;
const find = (r: ReturnType<typeof run>, name: string) => r.preset.sections.find((s) => s.name === name)!;
const ids = (r: ReturnType<typeof run>, bucket: "came" | "approx" | "dropped") => r[bucket === "came" ? "report" : "report"][bucket].map((i) => i.id);

describe("step 1: sections", () => {
  it("keeps the order, enabled flags, roles and depth; markers take our marker ids", () => {
    const prompts = [
      P("Main", "Write the reply.", { identifier: "main" }),
      { identifier: "worldInfoBefore", name: "World Info", marker: true },
      { identifier: "charDescription", name: "Char", marker: true },
      P("Depth note", "Remember.", { role: "user", injection_position: 1, injection_depth: 2 }),
      { identifier: "chatHistory", name: "History", marker: true },
    ];
    const r = run(make(prompts, ["id_Depth note"]));
    const s = r.preset.sections;
    expect(s.map((x) => x.name)).toEqual(["Main", "World Info", "Char", "Depth note", "History"]);
    expect(s.map((x) => x.marker)).toEqual(["main", "wiBefore", "charDescription", null, "chatHistory"]);
    expect(s[3]).toMatchObject({ enabled: false, role: "user", position: "in-chat", depth: 2 });
    expect(s.map((x) => x.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("an unplaced prompt goes to the library, disabled", () => {
    const prompts = [P("Main", "x", { identifier: "main" }), P("Spare", "spare text")];
    const json = make(prompts.slice(0, 1));
    (json as any).prompts = prompts;
    const r = run(json);
    expect(r.preset.sections).toHaveLength(1);
    expect(r.preset.library?.map((x) => [x.name, x.enabled, x.content])).toEqual([["Spare", false, "spare text"]]);
  });

  it("extension markers (author's note, vectors) are dropped and reported; the summary marker too", () => {
    const prompts = [
      P("Main", "x", { identifier: "main" }),
      { identifier: "authorsNote", name: "Author's Note", marker: true },
      { identifier: "vectorsMemory", name: "Vector Storage", marker: true },
      { identifier: "summary", name: "Summary", marker: true },
    ];
    const r = run(make(prompts));
    expect(r.preset.sections.map((x) => x.name)).toEqual(["Main", "Summary"]);
    expect(r.report.dropped.map((i) => i.id)).toEqual(["extensionMarkers", "summaryMarker"]);
    expect(r.report.dropped[0]!.names).toEqual(["Author's Note", "Vector Storage"]);
  });

  it("keeps the file's name and the author and licence it states", () => {
    const readme = P("READ ME", "# Cool Preset\nCreated by Someone\nLicense: CC BY-NC-ND 4.0\nenjoy");
    const r = run(make([P("Main", "x", { identifier: "main" }), readme], [], { author: "Someone" }), "cool-preset");
    expect(r.preset.description).toContain('"cool-preset"');
    expect(r.preset.description).toContain("Author: Someone");
    expect(r.preset.description).toContain("License: CC BY-NC-ND 4.0");
    expect(r.preset.description).toContain("Created by Someone");
  });

  it("presetImport still returns just the preset", () => {
    expect(presetImport(make([P("Main", "x", { identifier: "main" })]), "T", buildDefaultPreset())!.sections).toHaveLength(1);
    expect(presetImport({ nothing: true }, "T", buildDefaultPreset())).toBeNull();
  });
});

describe("step 2: toggle groups become Choices", () => {
  const povPrompts = () => [
    P("━🧍 Point-of-View", "{{// Whose eyes the story is told through. }}\n## Point of View"),
    P("Third Person", "{{// Narrator stays outside the characters. }}{{trim}}\nWrite in third person."),
    P("Second Person", "Write in second person."),
    P("First Person", "Write in first person."),
  ];

  it("one on by default = a single choice; options are sections gated by a condition", () => {
    const prompts = [P("Main", "x", { identifier: "main" }), ...povPrompts()];
    const r = run(make(prompts, ["id_Second Person", "id_First Person"]));
    const v = r.preset.variables.find((x) => x.name === "point_of_view")!;
    expect(v).toMatchObject({ type: "choice", multi: false, label: "Point-of-View", question: "Whose eyes the story is told through." });
    expect(v.choices!.map((c) => [c.label, c.value])).toEqual([["Third Person", "third_person"], ["Second Person", "second_person"], ["First Person", "first_person"]]);
    expect(v.choices![0]!.hint).toBe("Narrator stays outside the characters.");
    expect(v.defaults).toEqual([v.choices![0]!.id]);
    expect(find(r, "Third Person")).toMatchObject({ condition: "point_of_view==third_person", enabled: true, content: expect.stringContaining("Write in third person.") });
    expect(r.preset.groups.map((g) => g.name)).toEqual(["Point-of-View"]);
    expect(find(r, "Third Person").groupId).toBe(r.preset.groups[0]!.id);
    expect(r.report.came.map((i) => i.id)).toContain("choices");
    expect(r.report.approx.map((i) => i.id)).toContain("assumedOne");
  });

  it("a header that says PICK ONE with nothing on gets a None option, on by default", () => {
    const prompts = [P("=Pick one NSFW 👇 ====", ""), P("Soft", "soft"), P("Hard", "hard")];
    const r = run(make(prompts, ["id_Soft", "id_Hard"]));
    const v = r.preset.variables[0]!;
    expect(v.multi).toBe(false);
    expect(v.choices!.map((c) => c.value)).toEqual(["none", "soft", "hard"]);
    expect(v.defaults).toEqual([v.choices![0]!.id]);
    expect(r.report.approx.map((i) => i.id)).not.toContain("assumedOne");
  });

  it("several on by default = several allowed; options show through {{#if name contains}} blocks", () => {
    const prompts = [P("━ Extras", ""), P("Sparks", "sparks"), P("Rain", "rain"), P("Fog", "fog"), P("Wind", "wind")];
    const r = run(make(prompts, ["id_Fog", "id_Wind"]));
    const v = r.preset.variables[0]!;
    expect(v).toMatchObject({ multi: true, name: "extras" });
    expect(v.defaults).toHaveLength(2);
    expect(r.report.approx.map((i) => i.id)).toContain("severalAllowed");
    const rain = find(r, "Rain");
    expect(rain.condition ?? null).toBeNull();
    expect(rain.content).toBe('{{#if extras contains "rain"}}\nrain\n{{/if}}');
    const lookup = (picked: string[]) => (n: string) => (n === "extras" ? { value: picked.join(", "), picks: picked.map((p) => ({ label: p, value: p })) } : undefined);
    expect(expandIfBlocks(rain.content, lookup(["rain"])).trim()).toBe("rain");
    expect(expandIfBlocks(rain.content, lookup(["fog"])).trim()).toBe("");
  });

  it("a header whose toggles are mostly on is a plain group: the toggles keep their own switches", () => {
    const prompts = [P("━ Core", ""), P("A", "a"), P("B", "b"), P("C", "c")];
    const r = run(make(prompts, ["id_C"]));
    expect(r.preset.variables).toHaveLength(0);
    expect(r.preset.groups.map((g) => g.name)).toEqual(["Core"]);
    expect(r.preset.sections.map((s) => [s.name, s.enabled])).toEqual([["━ Core", true], ["A", true], ["B", true], ["C", false]]);
  });

  it("an empty custom marker heads a group; a real marker closes it", () => {
    const prompts = [
      { identifier: "hdr", name: "🔻PICK: AGENCY🔻", marker: true },
      P("User drives", "u"), P("Director", "d"),
      { identifier: "chatHistory", name: "History", marker: true },
      P("After history", "after"),
    ];
    const r = run(make(prompts, ["id_Director"]));
    expect(r.preset.variables.map((v) => v.name)).toEqual(["agency"]);
    expect(find(r, "After history").groupId).toBeNull();
    expect(find(r, "History").marker).toBe("chatHistory");
  });

  it("a prompt of only {{setvar}} lines becomes text and number variables, and {{getvar}} keeps reading them", () => {
    const vars = P("Prompt Variables (EDIT ME)", "{{// Language of the story. }}{{trim}}\n{{setvar::lang::English}}{{trim}}\n{{setvar::words::850}}{{trim}}\n");
    const use = P("Length", "Write {{getvar::words}} words in {{getvar::lang}}.");
    const r = run(make([vars, use]));
    expect(r.preset.sections.map((s) => s.name)).toEqual(["Length"]);
    expect(r.preset.variables.map((v) => [v.name, v.type, v.defaultValue])).toEqual([["lang", "text", "English"], ["words", "number", "850"]]);
    expect(r.preset.variables[0]!.question).toBe("Language of the story.");
    expect(r.report.came.find((i) => i.id === "settingVars")!.n).toBe(2);
  });

  it("variable names stay valid: digits, repeats and engine macro names", () => {
    const prompts = [P("━ 18+ Level (PICK ONE)", ""), P("Low", "l"), P("High", "h"), P("━ 18+ Level (PICK ONE) ", ""), P("Mid", "m"), P("Top", "t"), P("━ User", ""), P("A", "a"), P("B", "b")];
    const r = run(make(prompts, ["id_High", "id_Top", "id_B"]));
    const names = r.preset.variables.map((v) => v.name);
    expect(names.every((n) => /^[\w.-]+$/.test(n))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("user");
    expect(ids(r, "came")).toContain("groups");
  });
});

describe("step 3: regex scripts", () => {
  const st = (over: Record<string, unknown> = {}) => ({
    scriptName: "Hide notes", findRegex: "/<note>(.*?)<\/note>/gi", replaceString: "", trimStrings: [" "], placement: [2], disabled: false,
    markdownOnly: true, promptOnly: false, runOnEdit: true, substituteRegex: 0, minDepth: 1, maxDepth: 6, ...over,
  });

  it("the preset's own regex scripts come over bound to the preset, with placement, flags and depth", () => {
    const r = run(make([P("Main", "x", { identifier: "main" })], [], { extensions: { regex_scripts: [st(), st({ scriptName: "Off", disabled: true, placement: [1, 2, 6] })] } }));
    expect(r.regex.map((x) => [x.name, x.enabled, x.scope])).toEqual([["Hide notes", true, "preset"], ["Off", false, "preset"]]);
    expect(r.regex[0]).toMatchObject({ find: "<note>(.*?)<\/note>", flags: "gi", markdownOnly: true, runOnEdit: true, minDepth: 1, maxDepth: 6, trimStrings: [" "] });
    expect(r.regex[0]!.placements).toMatchObject({ aiOutput: true, userInput: false });
    expect(r.regex[1]!.placements).toMatchObject({ userInput: true, aiOutput: true, reasoning: true });
    expect(r.report.came.find((i) => i.id === "regex")!.n).toBe(2);
    expect(r.report.approx.find((i) => i.id === "regexOff")!.n).toBe(1);
  });

  it("a script whose pattern cannot compile is left out and named", () => {
    const r = run(make([P("Main", "x", { identifier: "main" })], [], { extensions: { regex_scripts: [st(), st({ scriptName: "Broken", findRegex: "/(unclosed/g" })] } }));
    expect(r.regex.map((x) => x.name)).toEqual(["Hide notes"]);
    expect(r.report.dropped.find((i) => i.id === "regexBad")).toMatchObject({ n: 1, names: ["Broken"] });
  });

  it("a Marinara regex file reads: word placements, separate flags, enabled, applyMode", () => {
    const file = { kind: "marinara.regex-scripts", version: 1, regexScripts: [
      { name: "Clean HTML", enabled: true, findRegex: "<b>", replaceString: "", flags: "gi", placement: ["user_input", "ai_output"], promptOnly: true, applyMode: "prompt" },
      { name: "Show only", enabled: false, findRegex: "x", replaceString: "y", flags: "g", placement: ["world_info", "reasoning"], applyMode: "display" },
    ] };
    const items = regexScriptsOf(file);
    expect(items).toHaveLength(2);
    const [a, b] = items.map((i) => regexImport(i)!);
    expect(a).toMatchObject({ name: "Clean HTML", find: "<b>", flags: "gi", enabled: true, promptOnly: true });
    expect(a!.placements).toMatchObject({ userInput: true, aiOutput: true, slash: false });
    expect(b).toMatchObject({ enabled: false, markdownOnly: true });
    expect(b!.placements).toMatchObject({ wi: true, reasoning: true, aiOutput: false });
    expect(regexScriptsOf([1, 2])).toEqual([1, 2]);
    expect(regexScriptsOf(st())).toHaveLength(1);
  });
});

describe("step 4: macros", () => {
  const withText = (text: string, extra: Record<string, unknown> = {}) => run(make([P("Main", text, { identifier: "main" })], [], extra));

  it("what this app expands passes silently; the rest is listed with counts", () => {
    const r = withText("{{char}} and {{user}} {{random::a::b}} {{roll:1d6}} {{getvar::x}} {{setvar::y::1}} {{// a note with {{char}} in it }}{{trim}} {{#if x}}ok{{/if}} {{lastMessage}} {{outlet::top}} {{outlet::top}} {{original}} {{Model}}");
    const macros = r.report.dropped.find((i) => i.id === "macros")!;
    expect(macros.names).toEqual(["{{outlet}} x2", "{{original}} x1", "{{model}} x1"]);
  });

  it("{{noop}} is dropped, global variable macros become chat variables", () => {
    const r = withText("a{{noop}}b {{setglobalvar::mood::calm}}{{getglobalvar::mood}} {{incglobalvar::n}}");
    expect(r.preset.sections[0]!.content).toBe("ab {{setvar::mood::calm}}{{getvar::mood}} {{incvar::n}}");
    expect(r.report.approx.find((i) => i.id === "noopMacro")!.n).toBe(1);
    expect(r.report.approx.find((i) => i.id === "globalVars")!.n).toBe(3);
    expect(r.report.dropped.find((i) => i.id === "macros")).toBeUndefined();
  });

  it("ST scoped variables: the assignment is removed (no leak into the prompt), the condition still passes", () => {
    const text = "{{#if !.pick_pacing}}\n{{.pick_pacing = adaptive}}\n{{.pacing = on}}{{trim}}\nKeep moving.\n{{/if}}";
    const r = withText(text);
    const out = r.preset.sections[0]!.content;
    expect(out).not.toContain(".pick_pacing =");
    expect(out).toContain("Keep moving.");
    expect(r.report.approx.find((i) => i.id === "localVars")).toMatchObject({ n: 2, names: ["pick_pacing", "pacing"] });
    expect(r.report.dropped.find((i) => i.id === "macros")).toBeUndefined();
    expect(expandIfBlocks(out, () => undefined)).toContain("Keep moving.");
  });

  it("the preset's own variables and {{summary}} are not reported as unknown", () => {
    const prompts = [P("Prompt Variables", "{{setvar::lang::English}}"), P("Main", "Write in {{lang}}. {{summary}}", { identifier: "main" })];
    const r = run(make(prompts));
    expect(r.report.dropped.find((i) => i.id === "macros")).toBeUndefined();
    expect(r.report.approx.map((i) => i.id)).toContain("summaryMacro");
  });
});

describe("step 5: samplers, reasoning, prefill, squash", () => {
  const withKeys = (extra: Record<string, unknown>) => run(make([P("Main", "x", { identifier: "main" })], [], extra));

  it("the sampler knobs, context, prefill, squash, stop strings and extended sweep come over", () => {
    const r = withKeys({ temperature: 0.8, top_p: 0.9, top_k: 40, min_p: 0.05, top_a: 0.2, repetition_penalty: 1.1, frequency_penalty: 0.3, presence_penalty: 0.2,
      openai_max_tokens: 1500, openai_max_context: 64000, max_context_unlocked: true, assistant_prefill: "Sure.", squash_system_messages: true,
      stop: ["\nUser:"], seed: 7, stream_openai: false, dry_multiplier: 0.8 });
    const s = r.preset.samplers;
    expect([s.temperature.value, s.top_p.value, s.top_k.value, s.min_p.value, s.rep_pen.value, s.freq_pen.value, s.pres_pen.value]).toEqual([0.8, 0.9, 40, 0.05, 1.1, 0.3, 0.2]);
    expect([s.maxTokens, s.contextSize, s.contextUnlocked, s.assistantPrefill, s.seed, s.streaming]).toEqual([1500, 64000, true, "Sure.", 7, false]);
    expect(s.stopStrings).toEqual(["\nUser:"]);
    expect(r.preset.squashSystemMessages).toBe(true);
    expect(r.preset.extendedSamplers).toMatchObject({ top_a: 0.2, dry_multiplier: 0.8 });
    expect(r.report.came.map((i) => i.id)).toEqual(expect.arrayContaining(["samplers", "prefill", "squash"]));
  });

  it("reasoning effort maps to ours, auto leaves it to the model, show_thoughts off hides the block", () => {
    expect(withKeys({ reasoning_effort: "max" }).preset.samplers.reasoning).toMatchObject({ enabled: true, effort: "max" });
    expect(withKeys({ reasoning_effort: "min" }).preset.samplers.reasoning).toMatchObject({ enabled: true, effort: "min" });
    const auto = withKeys({ reasoning_effort: "auto", show_thoughts: false });
    expect(auto.preset.samplers.reasoning.enabled).toBe(buildDefaultPreset().samplers.reasoning.enabled);
    expect(auto.preset.samplers.reasoning.display).toBe("hidden");
    expect(auto.report.approx.map((i) => i.id)).toContain("reasoningAuto");
  });

  it("settings with no equivalent are named; ST's own defaults are not", () => {
    const quiet = withKeys({ wi_format: "{0}", scenario_format: "{{scenario}}", new_example_chat_prompt: "[Example Chat]", function_calling: false });
    expect(quiet.report.dropped.find((i) => i.id === "settings")).toBeUndefined();
    const r = withKeys({ wi_format: "[Lore: {0}]", function_calling: true, enable_web_search: true, n: 3, use_sysprompt: false });
    expect(r.report.dropped.find((i) => i.id === "settings")!.names).toEqual(["wi_format", "function_calling", "enable_web_search", "n"]);
  });
});
