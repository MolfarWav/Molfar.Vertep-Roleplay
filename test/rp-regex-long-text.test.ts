import { describe, expect, it } from "bun:test";

const { applyRegexScript } = await import(new URL("../plugins/engine/plugin.js", import.meta.url).href);

const script = { findRegex: "cat", replaceString: "dog", flags: "g" };

describe("a regex script over a text longer than 20,000 characters", () => {
  it("replaces in the first 20,000 characters and returns the rest untouched", () => {
    const head = "cat ".repeat(5000); // 20,000 characters
    const tail = "cat and more text after the cap ".repeat(40);
    const out = applyRegexScript(script, head + tail, {});
    expect(out.length).toBe(head.length + tail.length);
    expect(out.startsWith("dog dog dog")).toBe(true);
    expect(out.slice(20000)).toBe(tail);
  });
  it("a 25,000 character text keeps every character past the cap", () => {
    const text = "a cat sat. ".repeat(2273).slice(0, 25000);
    const out = applyRegexScript(script, text, {});
    expect(out.length).toBeGreaterThanOrEqual(25000 - 2 * 20000 / 11 | 0);
    expect(out.endsWith(text.slice(20000))).toBe(true);
  });
  it("a short text is replaced whole, as before", () => {
    expect(applyRegexScript(script, "one cat", {})).toBe("one dog");
  });
  it("a text with the literal head only past the cap is returned as it was", () => {
    const text = "x".repeat(20010) + "cat";
    expect(applyRegexScript(script, text, {})).toBe(text);
  });
});
