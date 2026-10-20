/**
 * A thinking model that also writes the preset's inline tags (Vertep Lite's <plan>): the engine
 * splits inline tags only when the provider reported no reasoning, so the app moves them itself.
 */
import { describe, expect, it } from "bun:test";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
type Engine = typeof import("../plugins/engine/plugin.js");
const eng = (await import(engineUrl)) as Engine;
const tags = { open: "<plan>", close: "</plan>" };

describe("cutInlineThinking", () => {
  it("moves the plan from the text to the end of the model's own reasoning", () => {
    const r = eng.cutInlineThinking({ text: "<plan>\n1. Now: the party.\n</plan>\n\nJess smiles.", reasoning: "native thought" }, tags);
    expect(r.text).toBe("Jess smiles.");
    expect(r.reasoning).toBe("native thought\n\n1. Now: the party.");
  });

  it("works with no reasoning, and on the text parts of a tool-using reply", () => {
    const r = eng.cutInlineThinking({ text: "<plan>a</plan>Story.", parts: [{ type: "thinking", text: "t" }, { type: "text", text: "<plan>a</plan>" }, { type: "text", text: "Story." }] }, tags);
    expect(r.text).toBe("Story.");
    expect(r.reasoning).toBe("a");
    expect(r.parts).toEqual([{ type: "thinking", text: "t" }, { type: "text", text: "Story." }]);
  });

  it("keeps an unclosed block in the story, without its tag", () => {
    const r = eng.cutInlineThinking({ text: "<plan>Jess walks out into the night." }, tags);
    expect(r.text).toBe("Jess walks out into the night.");
    expect(r.reasoning).toBeUndefined();
  });

  it("leaves a reply without tags, or a preset without tags, as it is", () => {
    const plain = { text: "Story.", reasoning: "x" };
    expect(eng.cutInlineThinking({ ...plain }, tags)).toEqual(plain);
    expect(eng.cutInlineThinking({ text: "<plan>a</plan>b" }, null)).toEqual({ text: "<plan>a</plan>b" });
  });
});
