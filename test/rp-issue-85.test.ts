/**
 * Issue #85: an imported SillyTavern preset keeps the card's post-history instructions (its entry is
 * `jailbreak`), and a cut of a reply for the sensor and Litopys leaves out the blocks a preset hides.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { line as kitLine } from "./rp-memory-m2-kit";

const eng = (await import(new URL("../plugins/engine/plugin.js", import.meta.url).href)) as typeof import("../plugins/engine/plugin.js");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lit = (await import(new URL("../plugins/litopys/plugin.js", import.meta.url).href)) as Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rel = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "issue-85-"));
  for (const d of ["characters/aria", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "presets", "default.json"), JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [] }));
  fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({
    spec: "chara_card_v2", name: "Aria", description: "A barista who hums.", first_mes: "Hi.",
    post_history_instructions: "Aria never breaks the fourth wall.",
  }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

const fsx = () => ({
  root,
  read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
  write: (rel: string, content: string) => {
    const full = path.resolve(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  },
  list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
  remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
});
const host = () => ({
  fs: fsx(),
  store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
  llm: { request: () => {}, results: {}, embed: () => {}, embedResults: {} },
  net: { request: () => {}, results: {} },
  log: () => {},
});
const call = (method: string, p: string, body?: unknown) =>
  (eng.handleRoute({ method, path: p, query: {}, body }, host()) as { json: Record<string, any> }).json;

function presetWith(jailbreak: Record<string, unknown>) {
  const preset = {
    id: "st", name: "ST",
    prompts: [
      { identifier: "main", name: "Main", role: "system", content: "You narrate.", marker: true },
      { identifier: "chatHistory", name: "Chat history", marker: true },
      { identifier: "jailbreak", name: "Post-History Instructions", role: "system", ...jailbreak },
    ],
    prompt_order: [{ character_id: 100001, order: ["main", "chatHistory", "jailbreak"].map((identifier) => ({ identifier, enabled: true })) }],
  };
  fs.writeFileSync(path.join(root, "presets", "st.json"), JSON.stringify(preset));
  return (call("POST", "/chats", { characterId: "aria", presetId: "st" }).meta as { id: string }).id;
}
const lastText = (chatId: string) => {
  const p = call("POST", "/prompt/preview", { chatId, userText: "Hello." }) as { messages: { role: string; content: string }[]; sources: { parts: { label: string }[] } };
  return { p, after: p.messages.at(-1)!.content };
};

describe("post-history instructions on an imported SillyTavern preset (#85a)", () => {
  it("a jailbreak marker brings the card's instructions after the history", () => {
    const { p, after } = lastText(presetWith({ marker: true, content: "" }));
    expect(after).toContain("Aria never breaks the fourth wall.");
    expect(p.sources.parts.map((x) => x.label)).toContain("Aria · post-history instructions");
  });

  it("a plain jailbreak entry gives way to the card's instructions, which may carry {{original}}", () => {
    const { after } = lastText(presetWith({ content: "Preset rule." }));
    expect(after).toContain("Aria never breaks the fourth wall.");
    expect(after).not.toContain("Preset rule.");
    fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({
      spec: "chara_card_v2", name: "Aria", description: "x", first_mes: "Hi.", post_history_instructions: "{{original}} And hum.",
    }));
    expect(lastText(presetWith({ content: "Preset rule." })).after).toContain("Preset rule. And hum.");
  });

  it("with no card instructions the preset's own text goes out", () => {
    fs.writeFileSync(path.join(root, "characters", "aria", "card.json"), JSON.stringify({ spec: "chara_card_v2", name: "Aria", description: "x", first_mes: "Hi." }));
    expect(lastText(presetWith({ content: "Preset rule." })).after).toContain("Preset rule.");
  });
});

describe("what a cut of a reply keeps (#85c)", () => {
  const script = (over: Record<string, unknown>) =>
    fs.writeFileSync(path.join(root, "regex", `${over.id}.json`), JSON.stringify({ scriptName: over.id, flags: "g", replaceString: "", placement: ["ai_output"], promptOnly: true, ...over }));
  const meta = { id: "c1", presetId: "st", characterId: "aria" };

  it("deletes what prompt-only scripts delete, for the chat's scope only", () => {
    script({ id: "plan", findRegex: "<molfar_plan>[\\s\\S]*?</molfar_plan>" });
    script({ id: "voice", findRegex: "<inner_voice>[\\s\\S]*?</inner_voice>", scope: "preset", scopeTargetId: "st" });
    script({ id: "other", findRegex: "SECRET", scope: "preset", scopeTargetId: "another-preset" });
    const view = lit.storyView(fsx(), meta);
    const text = "<molfar_plan>1. do x</molfar_plan>She smiles. SECRET<inner_voice>hm</inner_voice>";
    expect(view(text, "char")).toBe("She smiles. SECRET");
    // the same for the sensor's copy of the helper
    expect(rel.storyView(fsx(), meta)(text, "char")).toBe("She smiles. SECRET");
  });

  it("leaves alone display-only scripts, replacements, other roles and a missing folder", () => {
    script({ id: "shown", findRegex: "<b>", promptOnly: false, markdownOnly: true });
    script({ id: "swap", findRegex: "cat", replaceString: "dog" });
    script({ id: "user-only", findRegex: "HI", placement: ["user_input"] });
    script({ id: "off", findRegex: "x", disabled: true });
    const view = lit.storyView(fsx(), meta);
    expect(view("<b>cat HI x", "char")).toBe("<b>cat HI x");
    expect(view("<b>cat HI x", "user")).toBe("<b>cat  x");
    fs.rmSync(path.join(root, "regex"), { recursive: true, force: true });
    expect(lit.storyView(fsx(), meta)("kept", "char")).toBe("kept");
  });

  it("the scene sent to the Litopys worker shows story text, not the hidden blocks", () => {
    const longPlan = "<molfar_plan>" + "plan ".repeat(400) + "</molfar_plan>";
    const msgs = [
      { id: "m1", role: "user", name: "You", text: "Go on." },
      { id: "m2", role: "char", name: "Aria", text: longPlan + "She opens the door." + "<focus_log>log</focus_log>" },
    ];
    script({ id: "plan", findRegex: "<molfar_plan>[\\s\\S]*?</molfar_plan>" });
    script({ id: "log", findRegex: "<focus_log>[\\s\\S]*?</focus_log>" });
    const line = kitLine(msgs);
    const work = { scene: { from: "m1", to: "m2", fromIdx: 0, toIdx: 1, count: 2, kind: "scene", label: "" }, replaces: null };
    const ask = (opts: Record<string, unknown>) => lit.buildWorkerRequest(lit.emptyChat("c1"), work, line, {}, { ...lit.DEFAULT_CONFIG, ...lit.DEFAULT_PROMPTS }, { userName: "You" }, opts);
    const text = (r: { messages: { content: string }[] }) => r.messages.map((m) => m.content).join("\n");
    expect(text(ask({}))).toContain("<molfar_plan>");
    const clean = text(ask({ view: lit.storyView(fsx(), meta) }));
    expect(clean).toContain("[Aria] She opens the door.");
    expect(clean).not.toContain("molfar_plan");
    expect(clean).not.toContain("focus_log");
  });
});
