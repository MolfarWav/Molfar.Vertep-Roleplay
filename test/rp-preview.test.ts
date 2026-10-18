import { describe, it, expect } from "bun:test";
import { cleanPreview, firstLine } from "../src/lib/preview";

describe("cleanPreview", () => {
  it("drops tags like <sage:tremble>, <b> and </i>", () => {
    expect(cleanPreview("She <sage:tremble>shivers</sage:tremble> and <b>waits</b>.")).toBe("She shivers and waits.");
    expect(cleanPreview("<sage:tremble>")).toBe("");
    expect(cleanPreview('x <img src="a.png"/> y')).toBe("x y");
    expect(cleanPreview("a<br>b")).toBe("a b");
  });

  it("drops HTML comments", () => {
    expect(cleanPreview("a <!-- hidden --> b")).toBe("a b");
  });

  it("removes emphasis, code and heading/quote markers", () => {
    expect(cleanPreview("*She smiles.* **Hello** ~~no~~ `x`")).toBe("She smiles. Hello no x");
    expect(cleanPreview("# Title\n> quoted line")).toBe("Title quoted line");
    expect(cleanPreview("_soft_ words")).toBe("soft words");
  });

  it("keeps snake_case, comparisons and hearts", () => {
    expect(cleanPreview("my_var is 3 < 5 and I <3 you")).toBe("my_var is 3 < 5 and I <3 you");
  });

  it("turns markdown links into their text", () => {
    expect(cleanPreview("see [the map](http://x/y) now")).toBe("see the map now");
  });

  it("collapses whitespace and truncates with an ellipsis", () => {
    expect(cleanPreview("a \n\n  b\t c")).toBe("a b c");
    expect(cleanPreview("abcdefghij", 5)).toBe("abcde…");
    expect(cleanPreview("abc", 5)).toBe("abc");
  });

  it("never changes its input string (display only)", () => {
    const raw = "*hi* <sage:tremble>";
    cleanPreview(raw);
    expect(raw).toBe("*hi* <sage:tremble>");
  });
});

describe("firstLine", () => {
  it("is the first line that has words after cleaning", () => {
    expect(firstLine("<sage:tremble>\n\n*Ah — Your Majesty… I am fine, truly…*\nsecond")).toBe("Ah — Your Majesty… I am fine, truly…");
    expect(firstLine("   \n  ")).toBe("");
  });
});

describe("reasoning never previews (#44)", () => {
  it("drops whole reasoning blocks and an unclosed one at the start", () => {
    expect(cleanPreview("<think>1. Consequence: Vivian</think>She smiles.")).toBe("She smiles.");
    expect(cleanPreview("<thinking type='x'>plan\nmore</thinking>\n\n*She* smiles.")).toBe("She smiles.");
    expect(cleanPreview("<think>cut off inside the reasoning")).toBe("");
    expect(cleanPreview("She <b>smiles</b>, a < b.")).toBe("She smiles, a < b.");
  });
});

describe("the preview's display scripts (#44)", async () => {
  const { resolveDisplayScripts } = await import("../src/lib/display-scripts");
  const script = (id: string, extra: Record<string, unknown> = {}) => ({
    id, name: id, enabled: true, find: "<plan>[\\s\\S]*?</plan>", replace: "", flags: "g", order: 0, scope: "global", scopeTargetId: null,
    placements: { userInput: false, aiOutput: true }, markdownOnly: true, promptOnly: false, trimStrings: [], macroMode: "none", ...extra,
  });
  const at = { role: "assistant", chatId: "c1", characterId: "ch1", presetId: "molfar", depth: 0, userName: "You", charName: "Aria" };
  it("picks the display-stage scripts in scope of the chat's last reply", () => {
    const list = [
      script("global"),
      script("preset", { scope: "preset", scopeTargetId: "molfar" }),
      script("other-preset", { scope: "preset", scopeTargetId: "frankenx" }),
      script("saved-text", { markdownOnly: false }),
      script("user-only", { placements: { userInput: true, aiOutput: false } }),
      script("off", { enabled: false }),
    ];
    expect(resolveDisplayScripts(list as never, at).length).toBe(2);
  });
});
