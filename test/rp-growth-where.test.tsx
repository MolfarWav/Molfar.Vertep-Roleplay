// "Where it acts" for a block of the portrait (Molfar.Vertep#450): the chip under an accepted block, the dialog's rows, and the reach
// helper that the dialog and the plugin both rely on (static markup, no DOM library here).
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { t } = await import("../src/lib/i18n");
const { GrowthBody, SECTION_ORDER } = await import("../src/components/character/memory-growth");
const { whereLabel } = await import("../src/components/character/memory-growth-where");
const { growthActs, growthReach } = await import("../src/components/character/memory-api");
type GrowthEntry = import("../src/components/character/memory-api").GrowthEntry;
type GrowthView = import("../src/components/character/memory-api").GrowthView;

const tt = ((key: never, vars?: never) => t(key, "en", vars)) as Parameters<typeof GrowthBody>[0]["t"];
const entry = (id: string, over: Partial<GrowthEntry> = {}): GrowthEntry => ({ id, section: "personality", kind: "changed", text: `text ${id}`, on: true, state: "accepted", origin: "agent", at: 1, ...over });
const story = (chatId: string, over: Partial<GrowthEntry> = {}): Partial<GrowthEntry> => ({ scope: "story", from: { chatId, title: "Night in the keep", at: 1 }, ...over });
const view = (entries: GrowthEntry[]): GrowthView => ({
  growth: { v: 2, next: 9, entries, inject: { enabled: true, maxTokens: 1500 } },
  sections: [...SECTION_ORDER],
  tokens: { used: 120, room: 1500, sent: entries.length, omitted: 0, live: entries.length },
});
const render = (data: GrowthView) => renderToStaticMarkup(<GrowthBody card={{ id: "aria", name: "Aria" }} data={data} t={tt} act={async () => true} busy={false} chats={[{ id: "a1", title: "Night in the keep", updatedAt: 5 }]} />);

describe("why a block acts in a chat", () => {
  const e = entry("g1", story("a1", { continues: ["a2"], chats: ["b1"], skip: ["a3"] }));
  it("source, continuation, chosen, skipped, none; a card-wide block acts everywhere except where it is skipped", () => {
    expect(growthReach(e, "a1")).toBe("source");
    expect(growthReach(e, "a2")).toBe("continues");
    expect(growthReach(e, "b1")).toBe("chosen");
    expect(growthReach(e, "a3")).toBe("skipped");
    expect(growthReach(e, "zz")).toBe("none");
    expect(growthReach(entry("g2"), "zz")).toBe("card");
    expect(growthReach(entry("g2", { skip: ["zz"] }), "zz")).toBe("skipped");
    // a story block with no chat it came from cannot be bound
    expect(growthReach(entry("g3", { scope: "story" }), "zz")).toBe("card");
  });
  it("acts unless skipped or not part of the story", () => {
    expect(["card", "source", "continues", "chosen"].every((r) => growthActs(r as never))).toBe(true);
    expect(growthActs("skipped")).toBe(false);
    expect(growthActs("none")).toBe(false);
  });
});

describe("the chip", () => {
  it("says where the block acts, with the numbers of chats added and switched off", () => {
    expect(whereLabel(entry("g1"), "Aria", tt)).toBe("Every chat of Aria");
    expect(whereLabel(entry("g1", { skip: ["a"] }), "Aria", tt)).toBe("Every chat of Aria, off in 1 chat");
    expect(whereLabel(entry("g1", story("a1")), "Aria", tt)).toBe("This story");
    expect(whereLabel(entry("g1", story("a1", { chats: ["b", "c"] })), "Aria", tt)).toBe("This story and 2 more chats");
    expect(whereLabel(entry("g1", story("a1", { skip: ["b"] })), "Aria", tt)).toBe("This story, off in 1 chat");
  });
  it("every accepted block carries one, as a button with its own label; a waiting proposal does not", () => {
    const html = render(view([entry("g1", story("a1")), entry("g2"), entry("g3", { state: "proposed", ...story("a1") })]));
    expect(html.split('data-testid="mem-grow-where-chip"').length - 1).toBe(2);
    expect(html).toContain("This story");
    expect(html).toContain("Every chat of Aria");
    expect(html).toContain('aria-label="Where');
    // a proposal says it will act in its story once accepted
    expect(html).toContain("Accepted, it acts in that story.");
  });
});
