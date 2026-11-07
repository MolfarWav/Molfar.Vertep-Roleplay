// #184 P4: in the Memory view a belief reads as a belief, so "why did Bram act on that?" has an answer in the trace.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { FactRow } = await import("../src/components/memory/trace-parts");

const fact = (type: string) => ({ id: "f2", state: "in" as const, why: "rank", rank: 1, gone: false, text: "The debt is paid.", type, weight: "important", subject: null, by: [] });
const t = ((key: string) => key) as never;

describe("a belief in the Memory view (#184 P4)", () => {
  it("is marked as a belief; an ordinary fact is not", () => {
    expect(renderToStaticMarkup(<FactRow f={fact("belief")} t={t} />)).toContain('data-testid="trace-belief"');
    expect(renderToStaticMarkup(<FactRow f={fact("event")} t={t} />)).not.toContain('data-testid="trace-belief"');
  });
});
