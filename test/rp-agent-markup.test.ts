/**
 * Mode B of the html widget: the model wrote the markup (src/lib/agent-markup.ts). Nothing here trusts it: the text is
 * rewritten from an allow-list, so the tests are mostly hostile inputs and one rule that must hold for ANY input.
 */
import { afterAll, describe, expect, it } from "bun:test";
import { cleanMarkup, cleanStyle, MARKUP_DEPTH, MARKUP_MAX } from "../src/lib/agent-markup";

/** What no output may ever contain, whatever went in. */
function assertSafe(out: string) {
  expect(out).not.toMatch(/<\s*\/?\s*(?:script|style|iframe|frame|frameset|img|image|a|form|input|button|object|embed|link|meta|base|math|video|audio|source|canvas|template|noscript|textarea|select|foreignobject|use|animate|set|title)\b/i);
  // inside the tags only: the same words as plain text, or inside a quoted value, are just words
  for (const tag of out.match(/<[^>]*>/g) ?? []) {
    const names = tag.replace(/"[^"]*"/g, '""');
    expect(names).not.toMatch(/[\s"'/]on[a-z]+\s*=/i);
    expect(names).not.toMatch(/\b(?:href|src|srcdoc|xlink:href|action|formaction|poster|background)\s*=/i);
    expect(tag).not.toMatch(/url\s*\(|@import|javascript:|expression\s*\(|-moz-binding|behavior\s*:/i);
  }
  // well formed: every tag opened is closed, in order
  const stack: string[] = [];
  for (const m of out.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self || /^(?:br|hr)$/i.test(name!)) continue;
    if (close) expect(stack.pop()).toBe(name!);
    else stack.push(name!);
  }
  expect(stack).toEqual([]);
}

const ATTACKS = [
  `<script>alert(1)</script>`,
  `<SCRIPT SRC=//evil/x.js></SCRIPT>`,
  `<img src=x onerror=alert(1)>`,
  `<svg onload=alert(1)>`,
  `<svg><script>alert(1)</script></svg>`,
  `<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>`,
  `<svg><foreignObject><iframe src="//evil"></iframe></foreignObject></svg>`,
  `<svg><use href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=#a"/></svg>`,
  `<svg><animate onbegin=alert(1) attributeName=x dur=1s>`,
  `<svg><set attributeName=href to="javascript:alert(1)"></svg>`,
  `<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;">`,
  `<svg><style>*{background:url(//evil)}</style></svg>`,
  `<div style="background:url(//evil/x.png)">x</div>`,
  `<div style="background:u\\72l(//evil)">x</div>`,
  `<div style="width:expression(alert(1))">x</div>`,
  `<div style="position:fixed;top:0;left:0;width:100%;height:100%">x</div>`,
  `<div style="behavior:url(x.htc)">x</div>`,
  `<div style="background-image:image-set('//evil' 1x)">x</div>`,
  `<div style="-moz-binding:url(//evil)">x</div>`,
  `<div style="color:red;/*" onmouseover="alert(1)">x</div>`,
  `<a href="javascript:alert(1)">x</a>`,
  `<a href="&#106;avascript&colon;alert(1)">x</a>`,
  `<a href="  jav&#x09;ascript:alert(1)">x</a>`,
  `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
  `<object data="//evil"></object><embed src="//evil">`,
  `<form action="//evil"><input name=a><button>go</button></form>`,
  `<link rel=stylesheet href="//evil/x.css"><meta http-equiv=refresh content="0;url=//evil"><base href="//evil/">`,
  `<div onclick=alert(1) onmouseover="alert(2)" ONFOCUS=alert(3)>x</div>`,
  `<div/onclick=alert(1)>x</div>`,
  `<div <script>alert(1)</script>>x</div>`,
  `<scr<script>ipt>alert(1)</scr</script>ipt>`,
  `<<script>script>alert(1)<</script>/script>`,
  `<!--><script>alert(1)</script>-->`,
  `<![CDATA[<script>alert(1)</script>]]>`,
  `<?php echo 1 ?><!DOCTYPE html><html><head><title>x</title></head><body onload=alert(1)>`,
  `<textarea><script>alert(1)</script></textarea><title></title><script>x</script>`,
  `<noscript><p title="</noscript><img src=x onerror=alert(1)>">`,
  `<template><script>alert(1)</script></template>`,
  `<video><source onerror=alert(1)></video><audio src=x onerror=alert(1)>`,
  `<div title="x" onclick="a" class="y z" data-x="1" id="a" name="b">x</div>`,
  `<td colspan="9999" rowspan="x" style="color:red">x</td>`,
  `<path d="M0 0 L10 10 url(//evil)" fill="url(#a)" stroke="javascript:1"/>`,
  `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="10" height="10" fill="red"/></svg>`,
  "`<img src=1 onerror=alert(1)>`",
  `<IMG SRC="jav\tascript:alert(1)">`,
  `<b>unclosed <i>tags <u>everywhere`,
  `</div></p></b>stray closers`,
  `a < b && c > d &amp; &bogus; &#0; &#xD800; &#1114112;`,
  `<div ${"a=b ".repeat(5000)}>x</div>`,
  "<".repeat(5000),
  "<div>".repeat(500) + "x",
  "<svg>".repeat(500),
];

describe("cleanMarkup: hostile input", () => {
  for (const a of ATTACKS) {
    it(`is safe: ${a.slice(0, 60).replace(/\n/g, " ")}`, () => {
      assertSafe(cleanMarkup(a));
    });
  }

  it("holds for any mix of attack pieces (a fuzz over 3000 random strings)", () => {
    let seed = 12345;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
    const parts = ATTACKS.flatMap((a) => [a, a.slice(0, a.length >> 1)]).concat(["<", ">", "\"", "'", "=", "/", " ", "&", "<!--", "-->", "x"]);
    for (let n = 0; n < 3000; n++) {
      let s = "";
      for (let k = 0, len = 1 + Math.floor(rnd() * 6); k < len; k++) s += parts[Math.floor(rnd() * parts.length)];
      assertSafe(cleanMarkup(s));
    }
  });

  it("never returns more than the limit, nor nests deeper than the limit", () => {
    expect(cleanMarkup("<p>" + "word ".repeat(5000)).length).toBeLessThanOrEqual(MARKUP_MAX + 40);
    const deep = cleanMarkup("<div>".repeat(200) + "x");
    expect((deep.match(/<div>/g) ?? []).length).toBe(MARKUP_DEPTH);
    assertSafe(deep);
  });

  it("is cheap on a hostile length (no quadratic blow-up)", () => {
    const t = Date.now();
    cleanMarkup("<a ".repeat(20000));
    cleanMarkup("<div ".repeat(20000));
    cleanMarkup("&".repeat(100000));
    expect(Date.now() - t).toBeLessThan(2000);
  });

  it("takes anything that is not text as empty", () => {
    for (const v of [undefined, null, 5, {}, []]) expect(cleanMarkup(v)).toBe("");
  });
});

describe("cleanMarkup: what survives", () => {
  it("keeps layout and text, with styles that are safe", () => {
    const out = cleanMarkup(`<div style="padding: 8px; background: #223; color: gold; border-radius: 6px"><h3>Letter</h3><p class="hand">Dear <b>Anna</b>,<br>come home.</p></div>`);
    expect(out).toContain("<h3>Letter</h3>");
    expect(out).toContain("<b>Anna</b>");
    expect(out).toContain("<br>");
    expect(out).toContain("padding:8px");
    expect(out).toContain("background:#223");
    expect(out).toContain('class="hand"');
  });

  it("keeps a drawing: svg shapes with their geometry and colours", () => {
    const out = cleanMarkup(`<svg viewBox="0 0 100 50" width="200"><defs><linearGradient id="g"><stop offset="0%" stop-color="#f00"/></linearGradient></defs><rect x="2" y="2" width="96" height="46" fill="#123456" stroke="gold" stroke-width="2"/><circle cx="50" cy="25" r="10" fill="rgb(255, 0, 0)"/><path d="M10 10 L90 40" stroke="white"/><text x="50" y="30" text-anchor="middle" font-size="12">Home</text></svg>`);
    for (const piece of ['viewBox="0 0 100 50"', "<linearGradient>", "<rect", 'r="10"', 'd="M10 10 L90 40"', 'text-anchor="middle"', ">Home</text></svg>"]) expect(out).toContain(piece);
    assertSafe(out);
  });

  it("keeps a table", () => {
    expect(cleanMarkup(`<table><tr><th colspan="2">Gear</th></tr><tr><td>Sword</td><td>1</td></tr></table>`)).toContain('<th colspan="2">Gear</th>');
  });

  it("reads markup inside a code fence", () => {
    expect(cleanMarkup("```html\n<b>hi</b>\n```")).toBe("<b>hi</b>");
  });

  it("shows a refused tag's words as text, and drops code and data with their content", () => {
    expect(cleanMarkup("<a href='x'>link text</a>")).toBe("link text");
    expect(cleanMarkup("before<script>alert(1)</script>after")).toBe("beforeafter");
    expect(cleanMarkup("before<style>p{color:red}</style>after")).toBe("beforeafter");
  });

  it("escapes what looks like a tag but is not", () => {
    expect(cleanMarkup("2 < 3 and 5 > 4 & more")).toBe("2 &lt; 3 and 5 &gt; 4 &amp; more");
  });

  it("closes what the model left open", () => {
    expect(cleanMarkup("<div><p>one")).toBe("<div><p>one</p></div>");
  });
});

describe("cleanStyle", () => {
  it("keeps plain declarations and lowercases the property", () => {
    expect(cleanStyle("COLOR: red; Margin: 0 auto")).toBe("color:red;margin:0 auto");
  });
  it("drops what loads, runs, escapes or covers the frame", () => {
    for (const bad of ["background:url(x)", "color:expression(1)", "width:calc(1px+\\31)", "position:fixed", "color:red !important", "background-image:image-set('x' 1x)", "behavior:url(x)", "background-image:url(data:image/png;base64,AA)"]) expect(cleanStyle(bad)).toBe("");
  });
  it("allows a gradient, which has no url", () => {
    expect(cleanStyle("background-image: linear-gradient(red, blue)")).toBe("background-image:linear-gradient(red, blue)");
  });
});

// ---------- the widget: checker and drawing ----------
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileAgent } from "../src/canvas-kit/boards/agent-check.js";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { TemplateFrame } = await import("../src/components/chat/agent-html");
// only the component's own read of the theme needs a page; set after the imports, which test for a page themselves
(globalThis as unknown as { document: unknown }).document = { documentElement: { classList: { contains: () => false } } };
afterAll(() => { delete (globalThis as unknown as { document?: unknown }).document; });

type Json = Record<string, any>;
function agentWithWidget(widget: Json, state: Json = { scene: { type: "text" }, hp: { type: "number" } }): Json {
  return {
    format: "vertep-canvas", version: 1, kind: "agent", title: "t",
    agent: { formatVersion: 1, id: "painter", version: "1.0.0", name: "Painter", description: "", author: "t", trigger: { when: "after", everyN: 1, keywords: [] }, limits: { maxCalls: 1, concurrency: 1 }, models: { fast: { hint: "x" } }, state, panels: [{ id: "p", title: "Scene", place: "float", widgets: [widget] }] },
    nodes: [
      { id: "in", type: "agent.input", x: 0, y: 0, title: "Input", params: { give: [{ id: "reply", source: "lastReply" }] } },
      { id: "ask", type: "model.ask", x: 250, y: 0, title: "Draw", params: { role: "fast", prompt: "Draw: {{reply}}", answer: { as: "text" }, maxTokens: 800, batchKey: null } },
      { id: "set", type: "state.set", x: 500, y: 0, title: "Keep", params: { field: "scene", as: "text" } },
      { id: "out", type: "agent.output", x: 750, y: 0, title: "Output", params: { kind: "state-patch" } },
    ],
    edges: [{ id: "e1", from: "in:reply", to: "ask:reply" }, { id: "e2", from: "ask:text", to: "set:value" }, { id: "e3", from: "set:done", to: "out:in" }],
  };
}
const codesOf = (f: Json) => { const r = compileAgent(f) as Json; return r.error ? [r.error] : [...r.report.errors, ...r.report.warnings].map((x: Json) => x.code); };

describe("html widget, mode B: the checker", () => {
  it("accepts a bind to a text field, with the panel permission", () => {
    const f = agentWithWidget({ w: "html", bind: "scene", height: 200 });
    expect(codesOf(f)).toEqual([]);
    expect((compileAgent(f) as Json).report.derived.needs).toContain("show:panel");
  });
  it("refuses a bind to a number, to a field that is not there, and both or neither of template and bind", () => {
    expect(codesOf(agentWithWidget({ w: "html", bind: "hp" }))).toContain("E_BIND");
    expect(codesOf(agentWithWidget({ w: "html", bind: "nope" }))).toContain("E_BIND");
    expect(codesOf(agentWithWidget({ w: "html", bind: "scene", template: "<p>{{scene}}</p>" }))).toContain("E_WIDGET");
    expect(codesOf(agentWithWidget({ w: "html" }))).toContain("E_WIDGET");
  });
  it("a template widget is checked as before", () => {
    expect(codesOf(agentWithWidget({ w: "html", template: "<p>{{scene}}</p>" }))).toEqual([]);
    expect(codesOf(agentWithWidget({ w: "html", template: "<script>x</script>" }))).toContain("E_TPL_FORBIDDEN");
  });
});

describe("html widget, mode B: the drawing", () => {
  const draw = (scene: unknown, bind = "scene", schema: Json = { scene: { type: "text" }, hp: { type: "number" } }) =>
    renderToStaticMarkup(createElement(TemplateFrame, { w: { w: "html", bind } as never, set: { schema: schema as never, own: { scene, hp: 3 } as never } }));

  it("puts the model's markup, cleaned, into a sealed frame", () => {
    const html = draw(`<b style="color:gold">Hi</b><script>alert(1)</script><img src=x onerror=alert(1)>`);
    expect(html).toContain('sandbox=""');
    expect(html).toContain("default-src &#x27;none&#x27;");
    const doc = /srcDoc="([^"]*)"/.exec(html)![1]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
    expect(doc).toContain('<b style="color:gold">Hi</b>');
    expect(doc).not.toMatch(/<script|<img|onerror/i);
  });
  it("says so when the field is empty, and when it is not a text field", () => {
    expect(draw("")).toContain("agent-html-empty");
    expect(draw("<p>x</p>", "hp")).toContain("agent-html-bad");
    expect(draw("<p>x</p>", "missing")).toContain("agent-html-bad");
  });
});
