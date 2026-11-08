// #264: the Fired panel's whole-chat view counts the replies that carried a word-for-word passage of an earlier chat, and shows no fold otherwise.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { ChronChat } = await import("../src/components/chat/fired-tabs");
const { buildFiredReport } = await import("../src/lib/fired");

const t = ((key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key)) as never;
const date = () => "today";
const base = { since: 1, replies: 5, factsTotal: 0, chaptersTotal: 0, facts: [], chapters: [] };

describe("the word-for-word counter in the Fired panel (#264)", () => {
  it("shows its own fold, counted by the replies that carried a passage", () => {
    const lit = { ...base, verbatim: { n: 3, at: 5, chunks: 2, chats: 1, tokens: 180 } } as never;
    const html = renderToStaticMarkup(<ChronChat lit={lit} t={t} date={date} />);
    expect(html).toContain("fired.chat.verbatim");
    expect(html).toContain("fold-fired.chat.verbatim");
  });
  it("has no fold when no reply carried a passage", () => {
    expect(renderToStaticMarkup(<ChronChat lit={{ ...base } as never} t={t} date={date} />)).not.toContain("fired.chat.verbatim");
    expect(renderToStaticMarkup(<ChronChat lit={{ ...base, verbatim: null } as never} t={t} date={date} />)).not.toContain("fired.chat.verbatim");
  });
  it("the copied report has a line for it", () => {
    const report = buildFiredReport("Chat", null, null, { ...base, verbatim: { n: 3, at: 5, chunks: 2, chats: 1, tokens: 180 } } as never, 0);
    expect(report).toContain("word for word, from earlier chats: 3/5 replies");
  });
});
