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

describe("flags and size on the server path (Molfar.Vertep#442)", () => {
  const sheet = "<style>" + ".voyage-main-header{margin:6px 0;overflow:hidden;}".repeat(60) + "</style>";
  it("an empty flags string is the first match only; a script with no flags field stays global", () => {
    expect(applyRegexScript({ findRegex: "a", replaceString: "b", flags: "" }, "aaa", {})).toBe("baa");
    expect(applyRegexScript({ findRegex: "a", replaceString: "b" }, "aaa", {})).toBe("bbb");
  });
  it("a pattern that matches everywhere with a big replacement leaves the text as it was", () => {
    const text = "word ".repeat(3000);
    expect(applyRegexScript({ findRegex: "(?:)", replaceString: sheet, flags: "g" }, text, {})).toBe(text);
    const once = applyRegexScript({ findRegex: "(?:)", replaceString: sheet, flags: "" }, text, {});
    expect(once.length).toBe(text.length + sheet.length);
  });
});
