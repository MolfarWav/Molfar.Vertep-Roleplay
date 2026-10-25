// What a reply's own CSS may do (Molfar Vertep issue #93): dress the message, not leave it.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { safeDeclarations, safeRuleBody, stripRiskyAtRules } from "../src/lib/safe-style";
import { scopeCss } from "../src/lib/scope-css";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { Markdown } = await import("../src/components/markdown");
const html = (md: string) => renderToStaticMarkup(<Markdown content={md} />);

const NOTE = "background:#fdf6e3;color:#333;padding:12px;border:1px solid #c9b88a;transform:rotate(-2deg);font-family:'Caveat',cursive;box-shadow:2px 2px 6px rgba(0,0,0,.3)";

describe("safeDeclarations", () => {
  it("keeps the look of a paper note whole", () => {
    expect(safeDeclarations(NOTE)).toBe(NOTE.split(";").join("; "));
  });
  it("drops boxes pinned to the screen, keeps absolute and relative", () => {
    expect(safeDeclarations("position:fixed;top:0;left:0")).toBe("top:0; left:0");
    expect(safeDeclarations("position: STICKY; color:red")).toBe("color:red");
    expect(safeDeclarations("position:absolute; top:4px")).toBe("position:absolute; top:4px");
    expect(safeDeclarations("position:relative")).toBe("position:relative");
  });
  it("drops boxes sized by the viewport; max-* and offsets may use it up to one screen", () => {
    expect(safeDeclarations("width:100vw;height:100vh;min-height:50vh;color:red")).toBe("color:red");
    expect(safeDeclarations("width:calc(100vw - 40px)")).toBe("");
    expect(safeDeclarations("width:300px;max-width:60vw;max-height:80vh")).toBe("width:300px; max-width:60vw; max-height:80vh");
    expect(safeDeclarations("max-width:300vw")).toBe("");
    expect(safeDeclarations("position:absolute;top:500vh;left:10vw")).toBe("position:absolute; left:10vw");
  });
  it("caps z-index so a reply cannot stack over the app's controls", () => {
    expect(safeDeclarations("z-index:2")).toBe("z-index:2");
    expect(safeDeclarations("z-index:9999;color:red")).toBe("color:red");
    expect(safeDeclarations("z-index:auto")).toBe("");
  });
  it("lets url() point at this engine or an inline image only", () => {
    expect(safeDeclarations("background:url(/v1/assets/abc)")).toBe("background:url(/v1/assets/abc)");
    expect(safeDeclarations("background:url('data:image/png;base64,AAAA');color:red")).toBe("background:url('data:image/png;base64,AAAA'); color:red");
    expect(safeDeclarations("background:url(https://evil.example/x.png)")).toBe("");
    expect(safeDeclarations("background:url(//evil.example/x.png)")).toBe("");
    expect(safeDeclarations("background:url(data:image/svg+xml;utf8,<svg/>)")).toBe("");
  });
  it("drops script-ish values and empty or broken declarations", () => {
    expect(safeDeclarations("width:expression(alert(1));color:red;;nonsense")).toBe("color:red");
  });
});

describe("style blocks", () => {
  it("strip @import and @font-face, filter rule bodies, keep scoping", () => {
    const css = stripRiskyAtRules("@import url(//evil); @font-face{font-family:x;src:url(https://e/f.woff)} .n{position:fixed;color:red} @media (max-width:600px){.n{max-width:400vw;margin:0}}");
    const out = scopeCss(css, ".mes_text", safeRuleBody);
    expect(out).not.toContain("@import");
    expect(out).not.toContain("font-face");
    expect(out).toContain(".mes_text .n{color:red}");
    expect(out).toContain("@media (max-width:600px){.mes_text .n{margin:0}}");
  });
  it("filter the frames of a @keyframes block", () => {
    const out = scopeCss("@keyframes sway{from{transform:rotate(-2deg);position:fixed}to{transform:rotate(2deg)}}", ".mes_text", safeRuleBody);
    expect(out).toBe("@keyframes sway{from{transform:rotate(-2deg)}to{transform:rotate(2deg)}}");
  });
  it("scopeCss without a filter is unchanged (Custom CSS stays the user's own)", () => {
    expect(scopeCss("p{position:fixed}")).toBe(".mes_text p{position:fixed}");
  });
});

describe("a reply rendered as the chat does", () => {
  it("keeps the paper note and removes what would cover the app", () => {
    const out = html(`She slides a note over.\n\n<div style="${NOTE};position:fixed;top:0;left:0;width:100vw;height:200vh;z-index:99999"><b>Meet me at dusk.</b></div>`);
    expect(out).toContain("transform:rotate(-2deg)");
    expect(out).toContain("box-shadow:2px 2px 6px rgba(0,0,0,.3)");
    expect(out).toContain("<b>Meet me at dusk.</b>");
    expect(out).not.toContain("fixed");
    expect(out).not.toContain("vh");
    expect(out).not.toContain("100vw");
    expect(out).not.toContain("99999");
  });
  it("scopes and filters a message's <style> block", () => {
    const out = html(`<style>@import url(//evil);.note{background:url(https://evil.example/x.png);color:red;position:fixed}</style><div class="note">hi</div>`);
    expect(out).toContain(".mes_text .note{color:red}");
    expect(out).not.toContain("evil");
    expect(out).not.toContain("fixed");
  });
  it("renders the inline HTML a reply uses: line break, bold, colour span, font", () => {
    const out = html(`<div style="padding:8px"><b>Meet me at dusk.</b><br>— <span style="color:#c00">A.</span> <font color="red">P.S.</font></div>`);
    expect(out).toContain("<b>Meet me at dusk.</b><br/>");
    expect(out).toContain("color:#c00");
    expect(out).toContain('<font color="red">P.S.</font>');
  });
  it("still removes scripts, handlers and javascript: links", () => {
    const out = html(`<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>`);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("javascript:");
  });
});
