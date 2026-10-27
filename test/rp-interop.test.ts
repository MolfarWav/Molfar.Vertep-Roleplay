/**
 * Client interop — the portable preset/regex JSON importers (the Import
 * button path). Fixtures mirror the outside chat-completion preset format:
 * prompts[] plus prompt_order lists keyed by a reserved character id, where
 * the ACTIVE arrangement lives under 100001 (100000 is a different layout
 * that rides along in the same file).
 */
import { describe, it, expect } from "bun:test";
import { presetImport, presetExport, regexImport, regexExport } from "../src/lib/import-shapes.js";
import { buildDefaultPreset } from "../src/lib/seed.js";
import type { Preset } from "../src/lib/types.js";

const base = (): Preset => buildDefaultPreset();

const portablePreset = (over: Record<string, unknown> = {}) => ({
  prompts: [
    { identifier: "main", name: "Main Prompt", role: "system", marker: true, content: "Be vivid." },
    { identifier: "chatHistory", name: "Chat History", role: "system", marker: true },
    { identifier: "auth-1", name: "Author Note", role: "system", content: "AUTHOR-MARK" },
  ],
  prompt_order: [
    { character_id: 100000, order: [
      { identifier: "main", enabled: true }, { identifier: "chatHistory", enabled: true },
    ] },
    { character_id: 100001, order: [
      { identifier: "main", enabled: true }, { identifier: "auth-1", enabled: true }, { identifier: "chatHistory", enabled: true },
    ] },
  ],
  ...over,
});

describe("presetImport", () => {
  it("imports the arrangement under character id 100001, not the first list", () => {
    const p = presetImport(portablePreset(), "Test", base())!;
    expect(p.sections.map((s) => s.name)).toEqual(["Main Prompt", "Author Note", "Chat History"]);
    expect(p.sections[1]!.content).toBe("AUTHOR-MARK");
  });

  it("falls back to the first non-empty list, then the prompts order", () => {
    const one = presetImport({ ...portablePreset(), prompt_order: [{ character_id: 100000, order: [{ identifier: "main", enabled: true }] }] }, "T", base())!;
    expect(one.sections).toHaveLength(1);
    const none = presetImport({ ...portablePreset(), prompt_order: [] }, "T", base())!;
    expect(none.sections.map((s) => s.name)).toEqual(["Main Prompt", "Chat History", "Author Note"]);
  });

  it("empty-string roles default to system; in-chat entries keep depth", () => {
    const p = presetImport(portablePreset({
      prompts: [
        { identifier: "main", name: "Main", role: "", content: "x" },
        { identifier: "depth-1", name: "Depth", role: "user", content: "d", injection_position: 1, injection_depth: 7 },
      ],
      prompt_order: [{ character_id: 100001, order: [{ identifier: "main", enabled: true }, { identifier: "depth-1", enabled: true }] }],
    }), "T", base())!;
    expect(p.sections[0]!.role).toBe("system");
    expect(p.sections[1]!.position).toBe("in-chat");
    expect(p.sections[1]!.depth).toBe(7);
    expect(p.sections[0]!.position).toBe("relative");
  });

  it("injection triggers: absent = all; a list = exactly those values", () => {
    const p = presetImport(portablePreset({
      prompts: [
        { identifier: "a", name: "A", role: "system", content: "x" },
        { identifier: "b", name: "B", role: "system", content: "y", injection_trigger: ["normal", "swipe"] },
        { identifier: "c", name: "C", role: "system", content: "z", injection_trigger: ["weird-unknown"] },
      ],
      prompt_order: [{ character_id: 100001, order: [
        { identifier: "a", enabled: true }, { identifier: "b", enabled: true }, { identifier: "c", enabled: true },
      ] }],
    }), "T", base())!;
    expect(p.sections[0]!.injectionTriggers).toHaveLength(6);
    expect(p.sections[1]!.injectionTriggers).toEqual(["normal", "swipe"]);
    // unknown values only → treated as always (empty after filter)
    expect(p.sections[2]!.injectionTriggers).toHaveLength(6);
  });

  it("carries behavior + sampler fields the engine consumes", () => {
    const p = presetImport(portablePreset({
      temperature: 1.21, seed: 42, stop: ["END"], custom_stop_strings: "STOP\nHALT",
      assistant_prefill: "Sure, ",
      squash_system_messages: true,
      reasoning_effort: "high",
      names_behavior: -1,
      send_if_empty: "(none)",
      impersonation_prompt: "IMP", group_nudge_prompt: "NUDGE",
    }), "T", base())!;
    expect(p.samplers.temperature.value).toBe(1.21);
    expect(p.samplers.seed).toBe(42);
    expect(p.samplers.stopStrings).toEqual(["END", "STOP", "HALT"]);
    expect(p.samplers.assistantPrefill).toBe("Sure, ");
    expect(p.squashSystemMessages).toBe(true);
    expect(p.samplers.reasoning.effort).toBe("high");
    expect(p.samplers.reasoning.enabled).toBe(true);
    expect(p.namesBehavior).toBe("none");
    expect(p.utilityPrompts.emptySend).toBe("(none)");
    expect(p.utilityPrompts.impersonation).toBe("IMP");
    expect(p.utilityPrompts.groupNudge).toBe("NUDGE");
  });

  it("reasoning effort aliases map; absent keeps the base", () => {
    const p = presetImport(portablePreset({ reasoning_effort: "minimal" }), "T", base())!;
    expect(p.samplers.reasoning.effort).toBe("min");
    const p2 = presetImport(portablePreset({ reasoning_effort: "xhigh" }), "T", base())!;
    expect(p2.samplers.reasoning.effort).toBe("max");
    const p3 = presetImport(portablePreset({ reasoning_effort: "" }), "T", base())!;
    expect(p3.samplers.reasoning.effort).toBe("med"); // untouched base
  });

  it("negative/absent seed keeps the base; names_behavior 2 = content", () => {
    const p = presetImport(portablePreset({ seed: -1, names_behavior: 2 }), "T", base())!;
    expect(p.samplers.seed).toBe(base().samplers.seed);
    expect(p.namesBehavior).toBe("content");
  });

  it("extended sampler sweep rides extendedSamplers verbatim", () => {
    const p = presetImport(portablePreset({
      dry_multiplier: 0.8, dry_base: 1.75, xtc_probability: 0.5, xtc_threshold: 0.1,
      typical_p: 0.9, mirostat_mode: 2, temperature_last: true,
      negative_prompt: "avoid this", smoothing_factor: 1.5,
    }), "T", base())!;
    expect(p.extendedSamplers).toMatchObject({
      dry_multiplier: 0.8, dry_base: 1.75, xtc_probability: 0.5, xtc_threshold: 0.1,
      typical_p: 0.9, mirostat_mode: 2, temperature_last: true,
      negative_prompt: "avoid this", smoothing_factor: 1.5,
    });
    // classic knobs stay in their first-class slots, not the extension bag
    expect(p.extendedSamplers!.temperature).toBeUndefined();
    expect(p.extendedSamplers!.top_k).toBeUndefined();
    // absent sweep → no bag at all
    const bare = presetImport(portablePreset(), "T", base())!;
    expect(bare.extendedSamplers).toBeUndefined();
  });

  it("constant injection_order never scrambles the arrangement (order = list index)", () => {
    // real-world files stamp injection_order: 100 on most entries; using it
    // as the section order made sort-by-order drag those to the back and
    // jump the few without it (chat history to the top) the moment the
    // preset was written to disk and re-hydrated
    const p = presetImport(portablePreset({
      prompts: [
        { identifier: "main", name: "Main", role: "system", marker: true, content: "M", injection_order: 100 },
        { identifier: "note", name: "Note", role: "system", content: "N", injection_order: 100 },
        { identifier: "chatHistory", name: "Chat History", role: "system", marker: true },
        { identifier: "tail", name: "Tail", role: "system", content: "T" },
      ],
      prompt_order: [{ character_id: 100001, order: [
        { identifier: "main", enabled: true }, { identifier: "note", enabled: true },
        { identifier: "chatHistory", enabled: true }, { identifier: "tail", enabled: true },
      ] }],
    }), "T", base())!;
    expect(p.sections.map((s) => s.name)).toEqual(["Main", "Note", "Chat History", "Tail"]);
    expect(p.sections.map((s) => s.order)).toEqual([0, 1, 2, 3]);
  });

  it("marker sections take canonical engine identifiers as ids", () => {
    const p = presetImport(portablePreset({
      prompts: [
        { identifier: "main", name: "Main", role: "system", marker: true, content: "M" },
        { identifier: "charPersonality", name: "Personality", role: "system", marker: true },
        { identifier: "chatHistory", name: "History", role: "system", marker: true },
        { identifier: "worldInfoBefore", name: "WI", role: "system", marker: true },
        { identifier: "custom", name: "Custom", role: "system", content: "C" },
      ],
      prompt_order: [{ character_id: 100001, order: ["main", "charPersonality", "chatHistory", "worldInfoBefore", "custom"].map((identifier) => ({ identifier, enabled: true })) }],
    }), "T", base())!;
    const byName = Object.fromEntries(p.sections.map((s) => [s.name, s.id]));
    // the engine matches markers BY IDENTIFIER — these must be canonical
    expect(byName.Main).toBe("main");
    expect(byName.Personality).toBe("charPersonality");
    expect(byName.History).toBe("chatHistory");
    expect(byName.WI).toBe("worldInfoBefore");
    // non-markers keep generated ids
    expect(byName.Custom).toMatch(/^sec_/);
  });

  it("rejects non-preset JSON", () => {
    expect(presetImport({ foo: 1 }, "T", base())).toBeNull();
    expect(presetImport({ prompts: [] }, "T", base())).toBeNull();
  });
});

describe("presetExport", () => {
  /** Everything the importer reads must survive a trip back out: an export
   *  the app cannot re-import at full fidelity silently downgrades the
   *  preset the next time it comes home. */
  it("round-trips every field presetImport consumes", () => {
    const source = portablePreset({
      temperature: 0.7, top_p: 0.92, top_k: 40, min_p: 0.05,
      repetition_penalty: 1.1, frequency_penalty: 0.3, presence_penalty: 0.2,
      openai_max_tokens: 900, openai_max_context: 16000,
      impersonation_prompt: "IMP", continue_nudge_prompt: "CONT",
      new_chat_prompt: "NEW", group_nudge_prompt: "NUDGE", send_if_empty: "EMPTY",
      names_behavior: 2, verbosity: "low", continue_prefill: false,
      custom_prompt_post_processing: "semi",
      assistant_prefill: "Understood.", squash_system_messages: true,
      stream_openai: false, seed: 12345, stop: ["\nUser:", "END"],
      reasoning_effort: "high",
      top_a: 0.1, dry_multiplier: 0.8, mirostat_mode: 2, temperature_last: true,
    });
    const imported = presetImport(source, "RT", base())!;
    const exported = presetExport(imported);
    const again = presetImport(exported, "RT2", base())!;

    expect(again.samplers.assistantPrefill).toBe("Understood.");
    expect(again.samplers.seed).toBe(12345);
    expect(again.samplers.stopStrings).toEqual(["\nUser:", "END"]);
    expect(again.samplers.streaming).toBe(false);
    expect(again.samplers.reasoning.effort).toBe("high");
    expect(again.squashSystemMessages).toBe(true);
    expect(again.continuePrefill).toBe(false);
    expect(again.namesBehavior).toBe("content");
    expect(again.verbosity).toBe("low");
    expect(again.promptPostProcessing).toMatchObject({ enabled: true, mode: "semi" });
    expect(again.utilityPrompts).toEqual(imported.utilityPrompts);
    expect(again.extendedSamplers).toEqual({ top_a: 0.1, dry_multiplier: 0.8, mirostat_mode: 2, temperature_last: true });
    expect(again.sections.map((x) => [x.name, x.enabled, x.content])).toEqual(
      imported.sections.map((x) => [x.name, x.enabled, x.content]),
    );
    expect(again.samplers.temperature.value).toBe(0.7);
    expect(again.samplers).not.toHaveProperty("contextSize");
  });

  it("writes the arrangement under the id the importer prefers", () => {
    const exported = presetExport(presetImport(portablePreset(), "T", base())!);
    expect(exported.prompt_order.map((o) => o.character_id)).toEqual([100001]);
  });
});

describe("regexImport", () => {
  it("parses /pattern/flags into find + flags", () => {
    const r = regexImport({ scriptName: "Scrub", findRegex: "/\\*/g", replaceString: "", placement: [2] })!;
    expect(r.find).toBe("\\*");
    expect(r.flags).toBe("g");
    expect(r.placements.aiOutput).toBe(true);
    expect(r.placements.userInput).toBe(false);
  });

  it("placement numbers: 1 user input, 2 AI output", () => {
    const r = regexImport({ scriptName: "X", findRegex: "/a/", replaceString: "b", placement: [1, 2] })!;
    expect(r.placements.userInput).toBe(true);
    expect(r.placements.aiOutput).toBe(true);
  });

  it("the only-flags carry through as the when-axis; placement stays the where-axis", () => {
    const saved = regexImport({ scriptName: "X", findRegex: "a", replaceString: "b", placement: [2] })!;
    expect(saved.markdownOnly).toBe(false);
    expect(saved.promptOnly).toBe(false);
    const md = regexImport({ scriptName: "X", findRegex: "a", replaceString: "b", placement: [2], markdownOnly: true })!;
    expect(md.markdownOnly).toBe(true);
    expect(md.promptOnly).toBe(false);
    const po = regexImport({ scriptName: "X", findRegex: "a", replaceString: "b", placement: [2], promptOnly: true })!;
    expect(po.promptOnly).toBe(true);
    expect(po.placements.aiOutput).toBe(true);
  });

  it("placement numbers 3, 5 and 6 are slash commands, world info, reasoning", () => {
    const r = regexImport({ scriptName: "X", findRegex: "a", replaceString: "b", placement: [3, 5, 6] })!;
    expect(r.placements).toEqual({ userInput: false, aiOutput: false, slash: true, wi: true, reasoning: true });
  });

  it("exports back to the same numbers and flags", () => {
    const wire = { scriptName: "X", findRegex: "/a\\/b/gi", replaceString: "c", placement: [1, 5], markdownOnly: false, promptOnly: true, runOnEdit: false, substituteRegex: 1, minDepth: null, maxDepth: 3, trimStrings: ["z"], disabled: false };
    const back = regexExport({ ...regexImport(wire)!, id: "r", order: 0 });
    expect(back.placement).toEqual([1, 5]);
    expect(back.promptOnly).toBe(true);
    expect(back.markdownOnly).toBe(false);
    expect(back.findRegex).toBe("/a\\/b/gi");
    expect(back.substituteRegex).toBe(1);
  });

  it("disabled + depth bounds + macro mode ride through", () => {
    const r = regexImport({ scriptName: "X", findRegex: "a", replaceString: "b", placement: [2], disabled: true, minDepth: 2, maxDepth: 8, substituteRegex: 2 })!;
    expect(r.enabled).toBe(false);
    expect(r.minDepth).toBe(2);
    expect(r.maxDepth).toBe(8);
    expect(r.macroMode).toBe("escaped");
  });

  it("rejects scripts without a findRegex", () => {
    expect(regexImport({ scriptName: "X" })).toBeNull();
  });
});
