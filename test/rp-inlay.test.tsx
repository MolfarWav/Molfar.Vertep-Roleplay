// The ```html inlay: a block that sets its own colours keeps a white sheet, one that sets none follows the
// theme; the document it gets has theme defaults first (Molfar Vertep issue #93).
import { describe, expect, it } from "bun:test";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { inlayDoc, inlayIsStyled } = await import("../src/components/rich-blocks");

describe("inlayIsStyled", () => {
  it("is true when the block sets a colour or a background", () => {
    expect(inlayIsStyled('<div style="background:#fdf6e3">note</div>')).toBe(true);
    expect(inlayIsStyled('<p style="margin:0;color: #333">x</p>')).toBe(true);
    expect(inlayIsStyled("<style>.a{background-color:red}</style><p class=a>x</p>")).toBe(true);
    expect(inlayIsStyled('<font color="red">x</font>')).toBe(true);
    expect(inlayIsStyled('<table bgcolor="#eee"><tr><td>x</td></tr></table>')).toBe(true);
  });
  it("is false for plain markup and for properties that only end in the word", () => {
    expect(inlayIsStyled("<h3>Inventory</h3><ul><li>rope</li></ul>")).toBe(false);
    expect(inlayIsStyled('<div style="border-color-ish:1;padding:4px;text-align:center">x</div>')).toBe(false);
    expect(inlayIsStyled('<div style="accent-color:red">x</div>')).toBe(false);
  });
});

describe("inlayDoc", () => {
  it("puts the theme defaults before the block so the block wins", () => {
    const doc = inlayDoc("<p>hi</p>", true);
    expect(doc.startsWith("<!doctype html><style>:root{color-scheme:dark}")).toBe(true);
    expect(doc.endsWith("<p>hi</p>")).toBe(true);
    expect(inlayDoc("x", false)).toContain("color-scheme:light");
  });
});
