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
