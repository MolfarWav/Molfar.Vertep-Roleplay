// React keys in the dashboard lists. Two identical rows (two events with the same id, parties, quote and weight; two
// worn "boots"; two edges between one pair) used to share a key and React warned "two children with the same key".
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { uniqueKeys, withKeys } = await import("../src/lib/unique-keys");
const { EventList, eventRowKey } = await import("../src/components/dashboard/dash-events");

describe("uniqueKeys", () => {
  it("keeps the first of a kind plain and numbers the repeats, in order", () => {
    expect(uniqueKeys(["a", "b", "a", "a"], String)).toEqual(["a", "b", "a~2", "a~3"]);
  });
  it("is stable: a prepended row does not rename the others' first occurrence", () => {
    expect(uniqueKeys(["x", "boots", "boots"], String).slice(1)).toEqual(["boots", "boots~2"]);
    expect(uniqueKeys(["boots", "boots"], String)).toEqual(["boots", "boots~2"]);
  });
  it("withKeys pairs each item with its key", () => {
    expect(withKeys([{ n: 1 }, { n: 1 }], (x) => String(x.n))).toEqual([{ item: { n: 1 }, key: "1" }, { item: { n: 1 }, key: "1~2" }]);
  });
});

describe("event rows", () => {
  const ev = { id: "slap", family: "conflict", weight: "significant", from: "user", to: "Mira", quote: "Enough.", math: ["trust -1 base", "trust -1 base"] };
  it("two identical events (same weight, same id) get different row keys, and so do their repeated math lines", () => {
    const events = [ev, { ...ev }] as never as Parameters<typeof eventRowKey>[0][];
    const rows = uniqueKeys(events, eventRowKey);
    expect(new Set(rows).size).toBe(2);
    const math = withKeys(ev.math, String).map((m) => m.key);
    expect(new Set(math).size).toBe(2);
  });
  it("a different event with the same weight keeps a plain key", () => {
    const other = { ...ev, id: "kiss", quote: "" } as never as Parameters<typeof eventRowKey>[0];
    expect(uniqueKeys([ev, other] as never as Parameters<typeof eventRowKey>[0][], eventRowKey)).toEqual([eventRowKey(ev as never), eventRowKey(other)]);
  });
  it("renders without throwing", () => {
    const html = renderToStaticMarkup(<EventList events={[ev, { ...ev }] as never} userName="Sam" />);
    expect(html.match(/trust -1 base/g)?.length).toBe(4);
  });
});
