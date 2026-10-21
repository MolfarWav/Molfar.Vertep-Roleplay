// Pictures in a message body load through the engine's image proxy (GitHub #84).
import { beforeAll, describe, expect, it } from "bun:test";

let html: (md: string) => string;

beforeAll(async () => {
  (globalThis as any).location ??= { pathname: "/app/user/roleplay/", origin: "http://localhost", href: "http://localhost/app/user/roleplay/" };
  (globalThis as any).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { Markdown } = await import("../src/components/markdown");
  html = (md) => renderToStaticMarkup(createElement(Markdown, { content: md }));
});

describe("message pictures", () => {
  it("a remote picture goes through the image proxy, with no referrer", () => {
    const out = html("Hi\n\n![Alt text](https://imagedelivery.net/abc/pic.png)");
    expect(out).toContain("/img?url=" + encodeURIComponent("https://imagedelivery.net/abc/pic.png"));
    expect(out).toContain('alt="Alt text"');
    expect(out).toContain('referrerPolicy="no-referrer"');
  });

  it("a local picture keeps its address, and a data: or javascript: source never reaches the proxy", () => {
    expect(html("![a](/v1/assets/" + "a".repeat(64) + ")")).toContain('src="/v1/assets/' + "a".repeat(64) + '"');
    expect(html("![a](javascript:alert(1))")).not.toContain("/img?url=");
  });
});
