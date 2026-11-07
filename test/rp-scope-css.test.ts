/**
 * A message can carry its own <style> block. Those rules must reach only that
 * message: a rule that escapes restyles the whole app, and a card written by
 * someone else is the one that would do it.
 */
import { describe, it, expect } from "bun:test";
import { cssAttrValue, scopeChatCss, scopeCss } from "../src/lib/scope-css.js";

describe("chat css scoping", () => {
  const root = '[data-chat-id="c1"]';
  it("prefixes every selector with the chat root", () => {
    expect(scopeChatCss(".mes_text p { color: red } b, i { x: 1 }", root)).toBe(`${root} .mes_text p{ color: red }${root} b, ${root} i{ x: 1 }`);
  });
  it("html, :root and body mean the chat itself, so variables stay inside the chat", () => {
    const out = scopeChatCss(":root { --tap-h1: red } html .x { a: b } body{c:d} .html-like { e: f }", root);
    expect(out).toContain(`${root}{ --tap-h1: red }`);
    expect(out).toContain(`${root} .x{ a: b }`);
    expect(out).toContain(`${root}{c:d}`);
    expect(out).toContain(`${root} .html-like{ e: f }`);
    expect(out).not.toMatch(/(^|\})\s*(html|:root|body)\b/);
  });
  it("drops @import and @font-face and scopes rules inside @media", () => {
    const out = scopeChatCss('@import url("https://x.test/a.css"); @font-face { font-family: X; src: url(a) } @media (min-width: 40em) { p { color: red } }', root);
    expect(out).not.toContain("@import");
    expect(out).not.toContain("@font-face");
    expect(out).toContain(`${root} p{ color: red }`);
  });
});

describe("message style scoping", () => {
  it("prefixes every selector in a rule list", () => {
    expect(scopeCss("p { color: red } b, i { font-weight: 700 }")).toBe(
      ".mes_text p{ color: red }.mes_text b, .mes_text i{ font-weight: 700 }",
    );
  });

  it("scopes rules inside conditional at-rules, including the first one", () => {
    const out = scopeCss("@media (min-width: 40em) { p { color: red } b { color: blue } }");
    expect(out).toContain("@media (min-width: 40em) {");
    expect(out).toContain(".mes_text p{ color: red }");
    expect(out).toContain(".mes_text b{ color: blue }");
    expect(out).not.toMatch(/\{\s*p\s*\{/); // no bare rule survives
  });

  it("leaves at-rules whose body is not selectors alone", () => {
    const frames = "@keyframes spin { from { opacity: 0 } to { opacity: 1 } }";
    expect(scopeCss(frames)).toBe(frames);
    const face = '@font-face { font-family: "X"; src: url(x.woff2) }';
    expect(scopeCss(face)).toBe(face);
  });

  it("cannot reach outside the message even when the selector aims there", () => {
    for (const sel of ["body", "html", ":root", "*", "#root"]) {
      expect(scopeCss(`${sel} { background: red }`)).toBe(`.mes_text ${sel}{ background: red }`);
    }
  });

  it("survives an unclosed block without dropping into the page scope", () => {
    expect(scopeCss("p { color: red")).toBe(".mes_text p{ color: red}");
    expect(scopeCss("")).toBe("");
    expect(scopeCss("/* just a comment */")).toBe("/* just a comment */");
  });

  it("rewrites under a caller-provided boundary", () => {
    expect(scopeCss(".mes_text p, body { color: red }", '[data-message-id="m1"]')).toBe(
      '[data-message-id="m1"] .mes_text p, [data-message-id="m1"] body{ color: red }',
    );
    expect(scopeCss("@media print { p { color: red } }", "#msg-2")).toBe(
      "@media print {#msg-2 p{ color: red } }",
    );
  });

  it("escapes attribute values for selector use", () => {
    expect(cssAttrValue('a"b\\c')).toBe('a\\"b\\\\c');
  });
});
