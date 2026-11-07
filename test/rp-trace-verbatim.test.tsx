// #184 step 8: the Memory view and the Fired panel show the word-for-word passages of earlier chats, and no fold when there are none.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { LitopysFolds } = await import("../src/components/memory/trace-parts");

const t = ((key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key)) as never;
const lit = (verbatim?: { chat: string; title: string; words: number; text: string }[]) =>
  ({ at: 1, op: "send", speaker: null, one: false, knowers: [], full: true, limit: 800, tokens: 10, n: {}, facts: [], chapters: [], ...(verbatim ? { verbatim } : {}) }) as never;

describe("the word-for-word fold in the memory trace (#184)", () => {
  it("lists each passage with its chat title, the shared-word count and the excerpt", () => {
    const html = renderToStaticMarkup(<LitopysFolds lit={lit([{ chat: "c1", title: "The harbour", words: 3, text: "…a turquoise cloak with a silver clasp…" }])} t={t} />);
    expect(html).toContain("memtrace.foldVerbatim");
    expect(html).toContain("The harbour");
    expect(html).toContain("memtrace.verbatimShares");
    expect(html).toContain("a turquoise cloak with a silver clasp");
  });
  it("has no fold when the array is empty or absent (an older plugin)", () => {
    expect(renderToStaticMarkup(<LitopysFolds lit={lit([])} t={t} />)).not.toContain("memtrace.foldVerbatim");
    expect(renderToStaticMarkup(<LitopysFolds lit={lit()} t={t} />)).not.toContain("memtrace.foldVerbatim");
  });
});
