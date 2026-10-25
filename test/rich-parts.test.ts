/**
 * Rich message part parser — the ```data / ```stat / ```html fenced-block
 * split that message rendering runs on every body (and every stream frame).
 */
import { describe, it, expect } from "bun:test";
import { splitRichBlocks, balanceStreamingMarkdown } from "../src/lib/rich-parts.js";

describe("rich parts: typed blocks", () => {
  it("plain text stays one markdown run", () => {
    expect(splitRichBlocks("just prose, nothing fenced")).toEqual([{ kind: "md", text: "just prose, nothing fenced" }]);
  });

  it("```data with a JSON object becomes a titled data panel", () => {
    const out = splitRichBlocks('Intro.\n```data Scene\n{"time": "dusk", "threat": 3}\n```\nOutro.');
    expect(out).toEqual([
      { kind: "md", text: "Intro.\n" },
      { kind: "data", variant: "data", title: "Scene", rows: [["time", "dusk"], ["threat", "3"]] },
      { kind: "md", text: "\nOutro." },
    ]);
  });

  it("```stat accepts [label, value] pair arrays", () => {
    const out = splitRichBlocks('```stat\n[["HP", "12"], ["MP", "4"]]\n```');
    expect(out).toEqual([{ kind: "data", variant: "stat", title: null, rows: [["HP", "12"], ["MP", "4"]] }]);
  });

  it("```data accepts {label, value} row objects", () => {
    const out = splitRichBlocks('```data\n[{"label": "Mood", "value": "tense"}]\n```');
    expect(out[0]).toMatchObject({ kind: "data", rows: [["Mood", "tense"]] });
  });

  it("```html becomes a sandboxed inlay block", () => {
    const out = splitRichBlocks('```html\n<div style="color:red">hi</div>\n```');
    expect(out).toEqual([{ kind: "html", html: '<div style="color:red">hi</div>\n' }]);
  });

  it("unknown languages stay code blocks", () => {
    const out = splitRichBlocks('```js\nconsole.log(1)\n```');
    expect(out).toEqual([{ kind: "code", lang: "js", text: "console.log(1)\n" }]);
  });

  it("bad JSON in ```data falls back to a code block (never a broken panel)", () => {
    const out = splitRichBlocks('```data\n{not json}\n```');
    expect(out[0]).toMatchObject({ kind: "code", lang: "data" });
  });

  it("an UNCLOSED fence (mid-stream) renders as code, not a half panel", () => {
    const out = splitRichBlocks('She raises a hand.\n```data\n{"hp": 1');
    expect(out).toEqual([
      { kind: "md", text: "She raises a hand.\n" },
      { kind: "code", lang: "data", text: '{"hp": 1' },
    ]);
  });

  it("a closing fence only counts on its own line", () => {
    const out = splitRichBlocks('```data\n{"a": "b```c"}\n```');
    expect(out[0]).toMatchObject({ kind: "data", rows: [["a", "b```c"]] });
  });

  it("several typed blocks and prose interleave in order", () => {
    const out = splitRichBlocks(
      'one\n```stat\n[["A","1"]]\n```\ntwo\n```html\n<p>x</p>\n```\nthree\n```py\npass\n```\nfour',
    );
    expect(out.map((b) => b.kind)).toEqual(["md", "data", "md", "html", "md", "code", "md"]);
  });

  it("```choices becomes clickable options (JSON array or plain lines)", () => {
    const json = splitRichBlocks('```choices Pick one\n["Open the door", "Hide"]\n```');
    expect(json).toEqual([{ kind: "choices", title: "Pick one", options: ["Open the door", "Hide"] }]);
    const lines = splitRichBlocks("```choices\n- Follow her\n- Stay put\n```");
    expect(lines[0]).toMatchObject({ kind: "choices", options: ["Follow her", "Stay put"] });
    const one = splitRichBlocks("```choices\nonly one\n```");
    expect(one[0]).toMatchObject({ kind: "code", lang: "choices" });
  });

  it("empty and whitespace bodies are nothing special", () => {
    expect(splitRichBlocks("")).toEqual([]);
    expect(splitRichBlocks("   ")).toEqual([{ kind: "md", text: "   " }]);
  });
});

describe("rich parts: custom HTML tags are transparent to markdown", () => {
  // only REAL block-level tags get block-HTML treatment, so markdown keeps
  // parsing around custom tags: an <ol> of <code> options, the unknown tag
  // stripped at sanitize
  const tagged = `Rain falls.

<choices>
1. \`[traveler]: Ask about the flame\`
2. \`[Ember]: She tilts the lantern away\`
3. \`[narrator]: Wagon lights appear\`
</choices>`;

  it("closed custom tags drop; inner lines flow through as markdown (numbered list, code spans)", () => {
    const out = splitRichBlocks(tagged);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "md" });
    const text = out[0]!.kind === "md" ? out[0]!.text : "";
    expect(text).toContain("Rain falls.");
    expect(text).toContain("1. `[traveler]: Ask about the flame`");
    expect(text).not.toContain("<choices>");
  });

  it("an UNCLOSED custom tag still lets the following lines parse (streaming halves format live)", () => {
    const out = splitRichBlocks("prose\n\n<choices>\n1. `half way`\n2. `more`");
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("md");
    const text = out[0]!.kind === "md" ? out[0]!.text : "";
    expect(text).not.toContain("<choices>");
    expect(text).toContain("1. `half way`");
  });

  it("custom tags with attributes strip too, any tag name", () => {
    const out = splitRichBlocks('<status bar="1">wounded</status> and <scene>night</scene>');
    expect(out[0]!.kind === "md" ? out[0]!.text : "").toBe("wounded and night");
  });

  it("real block-level tags stay (they ARE block HTML in both pipelines)", () => {
    const out = splitRichBlocks('<div class="card">hi</div>\n<table><tr><td>x</td></tr></table>');
    expect(out[0]!.kind === "md" ? out[0]!.text : "").toContain('<div class="card">hi</div>');
    expect(out[0]!.kind === "md" ? out[0]!.text : "").toContain("<table>");
  });

  it("per-message <style> blocks survive (they carry scoped CSS)", () => {
    const out = splitRichBlocks("<style>.mes_text q { color: red; }</style>");
    expect(out[0]!.kind === "md" ? out[0]!.text : "").toContain("<style>");
  });

  it("fenced ```html inlays keep their markup untouched", () => {
    const fence = String.fromCharCode(96, 96, 96);
    const out = splitRichBlocks(`${fence}html\n<div class="card"><my-tag>x</my-tag></div>\n${fence}`);
    expect(out[0]).toMatchObject({ kind: "html" });
    expect(out[0]!.kind === "html" && out[0]!.html).toContain("<my-tag>x</my-tag>");
  });

  it("tag block followed by a fence parses both", () => {
    const fence = String.fromCharCode(96, 96, 96);
    const out = splitRichBlocks(`<choices>\n1. \`a\`\n2. \`b\`\n</choices>\n\n${fence}data Stats\n{"hp": 3}\n${fence}`);
    expect(out.map((b) => b.kind)).toEqual(["md", "data"]);
  });
});

describe("rich parts: streaming markdown balancing", () => {
  it("an unclosed emphasis marker gets a synthetic closer", () => {
    expect(balanceStreamingMarkdown("*waves and turns")).toBe("*waves and turns*");
  });

  it("balanced emphasis is untouched", () => {
    expect(balanceStreamingMarkdown("*waves* and *turns*")).toBe("*waves* and *turns*");
  });

  it("an unclosed code fence closes on its own line", () => {
    const fence = String.fromCharCode(96, 96, 96);
    expect(balanceStreamingMarkdown(`look\n${fence}js\nconst x = 1;`)).toBe(`look\n${fence}js\nconst x = 1;\n${fence}`);
  });

  it("an unclosed quote gets its closer", () => {
    expect(balanceStreamingMarkdown('She said: "wait')).toBe('She said: "wait"');
  });

  it("~~~ fences balance like ``` fences", () => {
    expect(balanceStreamingMarkdown("a\n~~~\nraw")).toBe("a\n~~~\nraw\n~~~");
  });

  it("trailing whitespace is trimmed before the synthetic closer", () => {
    expect(balanceStreamingMarkdown("*half ")).toBe("*half*");
  });

  it("empty text stays empty", () => {
    expect(balanceStreamingMarkdown("")).toBe("");
  });
});

describe("rich parts: real inline HTML stays", () => {
  const md = (t: string) => { const o = splitRichBlocks(t); return o[0]!.kind === "md" ? o[0]!.text : ""; };
  it("keeps b, br, span, img and a amid text", () => {
    const t = '<b>Meet me</b><br>at <span style="color:red">dusk</span> <img src="/v1/assets/a"> <a href="https://x.y">link</a>';
    expect(md(t)).toBe(t);
  });
  it("still drops custom tags beside them", () => {
    expect(md("<b>hi</b> <status>ok</status>")).toBe("<b>hi</b> ok");
  });
  it("drops an inline tag that stands alone on its line, so the markdown below keeps parsing", () => {
    expect(md("<span>\n1. one\n2. two\n</span>")).toBe("\n1. one\n2. two\n");
    expect(md("line<br>\n<br>\n**bold**")).toBe("line<br>\n\n**bold**");
  });
  it("keeps a picture on its own line", () => {
    expect(md('<img src="/v1/assets/a">\ntext')).toBe('<img src="/v1/assets/a">\ntext');
  });
});
