// SillyTavern modular presets (#239) and our own format's round trip (#238).
// The rule both keep: with its default picks the imported preset sends what the file sends.
import { describe, expect, it } from "bun:test";
import { presetExport, presetImportFull } from "../src/lib/import-shapes.js";
import { pickTag, isHeaderName, cleanTitle, commentHint, lockOf } from "../src/lib/st-structure.js";
import { buildDefaultPreset } from "../src/lib/seed.js";
import { expandMacros, resolvePresetVars, sectionCondPasses } from "../plugins/engine/plugin.js";
import type { Preset } from "../src/lib/types.js";
import { EMBER, VOYAGE } from "./fixtures/st-presets.js";

const run = (json: unknown, name = "Imported") => presetImportFull(json, name, buildDefaultPreset())!;

/** What SillyTavern sends: the enabled prompts in order, macros expanded with one variable map. */
function stSends(file: typeof EMBER): string[] {
  const vars: Record<string, string> = {};
  const byId = new Map(file.prompts.map((p) => [p.identifier, p]));
  return file.prompt_order[0]!.order
    .filter((o) => o.enabled)
    .map((o) => byId.get(o.identifier)!)
    .filter((p) => !p.marker)
    .map((p) => expandMacros(p.content ?? "", { userName: "User", charName: "Char", vars }).trim())
    .filter(Boolean);
}

/** What the imported preset sends with its default picks (the engine's own condition and macro code). */
function weSend(p: Preset, picks: Record<string, string[]> = {}): string[] {
  const vars: Record<string, string> = {};
  const pv = resolvePresetVars({ id: p.id, studio: { variables: p.variables } }, { presetVars: { [p.id]: picks } });
  return [...p.sections]
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.enabled && !(s.marker && !s.content.trim()) && sectionCondPasses(s.condition, pv, vars))
    .map((s) => expandMacros(s.content, { userName: "User", charName: "Char", presetVars: pv, vars }).trim())
    .filter(Boolean);
}

const sec = (p: Preset, name: string) => p.sections.find((s) => s.name === name)!;
const v = (p: Preset, label: string) => p.variables.find((x) => x.label === label)!;
const ids = (r: ReturnType<typeof run>) => r.report.came.map((i) => i.id);

describe("pick tags and headers", () => {
  it("reads [PICK n: TAG] anywhere in a name, and arrows as pairs", () => {
    expect(pickTag("Riot Sola [PICK 1: MIND]")).toEqual({ n: 1, tag: "MIND" });
    expect(pickTag("[PICK 2: STYLE] Purple")).toEqual({ n: 2, tag: "STYLE" });
    expect(pickTag("[PICK 1: ↓] Anti-Slop Full")).toEqual({ n: 1, tag: "↓" });
    expect(pickTag("[PICK 1: ↑] Anti-Slop Lite")).toEqual({ n: 1, tag: "↑" });
    expect(pickTag("Third Person")).toBeNull();
  });

  it("a pick tag never makes a header; the tag leaves the label", () => {
    expect(isHeaderName("[PICK 1: ↓] Agency-Lite")).toBe(false);
    expect(isHeaderName("Riot Sola [PICK 1: MIND]")).toBe(false);
    expect(isHeaderName("🔻PICK: AGENCY🔻")).toBe(true);
    expect(cleanTitle("[PICK 1: ↑] Director Mode")).toBe("Director Mode");
    expect(cleanTitle("Riot Sola [PICK 1: POV]")).toBe("Riot Sola");
    expect(cleanTitle("Master Blueprint 🚫DO NOT TOUCH🚫")).toBe("Master Blueprint");
  });

  it("locks come from the name or the first comment, not from instructions further down", () => {
    expect(lockOf("Blueprint 🚫DO NOT TOUCH🚫", "")).toBe("keep");
    expect(lockOf("Core", "{{// DO NOT TURN OFF OR DELETE}}rules")).toBe("keep");
    expect(lockOf("━🚫 DO NOT ENABLE 🚫━", "")).toBe("off");
    expect(lockOf("Consent", "{{// Respect limits. }}Do not touch {{user}} without asking.")).toBeNull();
  });

  it("the hint is the first prose comment's first sentence; macro notes are skipped", () => {
    expect(commentHint("{{// Macro state zeroing }}{{// The narrator thinks fast. Best for action. }}x")).toBe("The narrator thinks fast.");
    expect(commentHint("{{// DO NOT TURN OFF OR DELETE }}x")).toBeUndefined();
  });
});

describe("a setvar-module preset (Ember)", () => {
  const r = run(EMBER);
  const p = r.preset;

  it("sends what the file sends with its own on/off state", () => {
    expect(weSend(p)).toEqual(stSends(EMBER));
  });

  it("an off setvar module stays an off section, not an always-on variable", () => {
    expect(p.variables.map((x) => x.name)).not.toContain("ember_opt_staccato");
    expect(sec(p, "Anti-Staccato")).toMatchObject({ enabled: false });
    expect(sec(p, "Anti-Staccato").groupId).toBe(p.groups.find((g) => g.name === "2. OPTIONS")!.id);
    // an on module that nothing switches is still a text variable
    expect(p.variables.find((x) => x.name === "ember_lang")).toMatchObject({ type: "text", defaultValue: "English", question: "Language of the story." });
  });

  it("[PICK 1: MIND] toggles make one pick-one choice named MIND with clean labels", () => {
    const mind = v(p, "MIND");
    expect(mind).toMatchObject({ type: "choice", multi: false });
    expect(mind.choices!.map((c) => c.label)).toEqual(["Riot Mind", "Calm Mind"]);
    expect(mind.defaults).toEqual([mind.choices![0]!.id]);
    expect(mind.choices![0]!.hint).toBe("The narrator thinks fast and breaks things.");
  });

  it("a ↓/↑ pair makes one choice of two", () => {
    const ag = v(p, "Agency");
    expect(ag.choices!.map((c) => c.label)).toEqual(["Agency Full", "Agency Lite"]);
    expect(ag.multi).toBe(false);
    expect(p.variables.some((x) => /\]/.test(x.label) || /\]/.test(x.choices?.map((c) => c.label).join() ?? ""))).toBe(false);
    expect(ids(r)).toEqual(expect.arrayContaining(["pickTags", "pairedPicks"]));
  });

  it("picking the other option sends the other module", () => {
    const mind = v(p, "MIND");
    const sent = weSend(p, { [mind.name]: [mind.choices![1]!.id] }).join("\n");
    expect(sent).toContain("Think calmly");
    expect(sent).not.toContain("riot");
  });

  it("locked blocks are on, locked and in no choice; a do-not-enable group is off and locked", () => {
    const bp = sec(p, "Master Blueprint 🚫DO NOT TOUCH🚫");
    expect(bp).toMatchObject({ enabled: true, locked: true });
    expect(bp.condition ?? null).toBeNull();
    expect(sec(p, "Debug dump")).toMatchObject({ enabled: false, locked: true });
    const labels = p.variables.flatMap((x) => x.choices?.map((c) => c.label) ?? []);
    expect(labels).not.toContain("Master Blueprint");
    expect(labels).not.toContain("Braille note");
    expect(ids(r)).toEqual(expect.arrayContaining(["locked", "lockedOff"]));
  });

  it("the authors' explanations stay: notes in the editor, the README as the description", () => {
    expect(sec(p, "Riot Mind [PICK 1: MIND]").note).toBe("The narrator thinks fast and breaks things. Best for action stories with a lot going on.");
    expect(sec(p, "Master Blueprint 🚫DO NOT TOUCH🚫").note).toBeUndefined();
    expect(p.description).toStartWith("Ember is a modular preset.");
  });
});

describe("a header-style preset (Voyage)", () => {
  const r = run(VOYAGE);
  const p = r.preset;
  it("sends what the file sends, with real Choices", () => {
    expect(weSend(p)).toEqual(stSends(VOYAGE));
    expect(p.variables.map((x) => x.label)).toEqual(["Point of View", "Extras"]);
    expect(v(p, "Point of View").question).toBe("Whose eyes the story is told through.");
    expect(v(p, "Extras").multi).toBe(true);
    // a group with most toggles on stays plain switches
    expect(sec(p, "Slow burn").enabled).toBe(false);
    expect(sec(p, "Slow burn").condition ?? null).toBeNull();
  });
});

describe("our own format round-trips (#238)", () => {
  const source = (): Preset => {
    const p = run(EMBER).preset;
    const s = p.sections.find((x) => x.name === "Braille note")!;
    s.injectionTriggers = ["normal", "swipe"];
    return { ...p, readOnly: true, isDefault: true };
  };

  it("Export -> Import keeps Choices, conditions, groups, triggers, locks and notes", () => {
    const src = source();
    const file = JSON.parse(JSON.stringify(presetExport(src)));
    const back = presetImportFull(file, "file name", buildDefaultPreset())!;
    expect(back.report.source).toBe("vertep");
    const p = back.preset;
    expect(p.id).not.toBe(src.id);
    expect(p.name).toBe(src.name);
    expect(p).toMatchObject({ readOnly: false, isDefault: false });
    expect(p.variables).toEqual(src.variables);
    expect(p.groups).toEqual(src.groups);
    expect(p.sections.map((s) => [s.name, s.enabled, s.condition ?? null, s.groupId, s.locked ?? false, s.note ?? null]))
      .toEqual(src.sections.map((s) => [s.name, s.enabled, s.condition ?? null, s.groupId, s.locked ?? false, s.note ?? null]));
    expect(sec(p, "Braille note").injectionTriggers).toEqual(["normal", "swipe"]);
    expect(weSend(p)).toEqual(weSend(src));
  });

  it("a preset file from data/presets/ (studio.readOnly: true) imports as an editable copy", () => {
    const src = source();
    const file = { name: src.name, prompts: [{ identifier: "x", name: "x" }], prompt_order: [], studio: { ...src, readOnly: true } };
    const p = presetImportFull(file, "f", buildDefaultPreset())!.preset;
    expect(p.readOnly).toBe(false);
    expect(p.variables).toHaveLength(src.variables.length);
  });

  it("the exported file still reads as a SillyTavern preset without the bag", () => {
    const file = JSON.parse(JSON.stringify(presetExport(source())));
    delete file.studio;
    const r = presetImportFull(file, "ST copy", buildDefaultPreset())!;
    expect(r.report.source).toBe("sillytavern");
    expect(r.preset.sections.length).toBeGreaterThan(5);
  });
});
