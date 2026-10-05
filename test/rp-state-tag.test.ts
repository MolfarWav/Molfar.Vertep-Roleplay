import { describe, it, expect } from "bun:test";
import { hideStateTag } from "../src/lib/state-tag.js";

describe("hideStateTag", () => {
  it("drops a closed tag at the end and the whitespace before it", () => {
    expect(hideStateTag('She nods.\n<vertep_state>{"present":["Aria"]}</vertep_state>')).toBe("She nods.");
    expect(hideStateTag('She nods.\n<vertep_state>{"a":1}</vertep_state>\n', true)).toBe("She nods.");
  });

  it("drops an unclosed tail", () => {
    expect(hideStateTag('She nods.\n<vertep_state>{"present":["Ar', true)).toBe("She nods.");
    expect(hideStateTag("She nods.\n<vertep_state>", true)).toBe("She nods.");
    // a saved reply cut off by the token limit
    expect(hideStateTag('She nods.\n<vertep_state>{"pre')).toBe("She nods.");
  });

  it("hides every partial prefix of the opening tag at the very end while streaming", () => {
    const open = "<vertep_state>";
    for (let n = 1; n < open.length; n++) {
      expect(hideStateTag("She nods.\n" + open.slice(0, n), true)).toBe("She nods.");
    }
    // the full opening tag is an unclosed tag
    expect(hideStateTag("She nods.\n" + open, true)).toBe("She nods.");
  });

  it("keeps a partial prefix when the reply is not streaming, and a prefix that is not at the end", () => {
    expect(hideStateTag("a <vert", false)).toBe("a <vert");
    expect(hideStateTag("a <vert b", true)).toBe("a <vert b");
    expect(hideStateTag("x < 3 and y <", false)).toBe("x < 3 and y <");
  });

  it("leaves text without a tag unchanged, trailing space included", () => {
    for (const s of ["", "plain", "plain  \n", "*italic* <b>bold</b>", "1 < 2 > 0"]) {
      expect(hideStateTag(s)).toBe(s);
      expect(hideStateTag(s, true)).toBe(s);
    }
  });

  it("cuts a tag in the middle and keeps what follows", () => {
    expect(hideStateTag("Before <vertep_state>{}</vertep_state> after.")).toBe("Before  after.");
  });

  it("a streaming reply never shows a piece of the tag at any length", () => {
    const full = 'Rain falls.\n<vertep_state>{"present":["Aria"],"minutes":5}</vertep_state>';
    for (let i = 0; i <= full.length; i++) {
      const shown = hideStateTag(full.slice(0, i), true);
      expect(shown).not.toContain("vert");
      expect(shown).not.toContain("{");
      expect(shown.endsWith("<")).toBe(false);
    }
  });
});
