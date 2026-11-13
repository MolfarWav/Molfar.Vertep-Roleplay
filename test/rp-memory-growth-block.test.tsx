// The "How they changed" portrait of a card's Memory tab (Molfar.Vertep#396), rendered to static markup (no DOM library here):
// proposals wait on top as cards (section and kind chips, the full text, "Replaces", the block a revision replaces), accepted blocks
// sit under a heading per section with a switch each, the room line, the "not sent" warning, the empty state; and the pure helpers
// (grouping by section, revision detection, folding, the save bodies, the plural forms).
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { t } = await import("../src/lib/i18n");
const { GrowthBody, SECTION_ORDER, addPatch, editPatch, groupBySection, growthLabel, isLong, revisedBlock, splitGrowth } = await import("../src/components/character/memory-growth");
type GrowthEntry = import("../src/components/character/memory-api").GrowthEntry;
type GrowthView = import("../src/components/character/memory-api").GrowthView;

const tt = ((key: never, vars?: never) => t(key, "en", vars)) as Parameters<typeof GrowthBody>[0]["t"];
const entry = (id: string, over: Partial<GrowthEntry> = {}): GrowthEntry => ({ id, section: "personality", kind: "changed", text: `text ${id}`, on: true, state: "accepted", origin: "user", at: 1, ...over });
const view = (entries: GrowthEntry[], over: { enabled?: boolean; maxTokens?: number; tokens?: Partial<GrowthView["tokens"]> } = {}): GrowthView => ({
  growth: { v: 2, next: 9, entries, inject: { enabled: over.enabled ?? true, maxTokens: over.maxTokens ?? 1500 } },
  sections: [...SECTION_ORDER],
  tokens: { used: 120, room: over.maxTokens ?? 1500, sent: entries.length, omitted: 0, live: entries.length, ...over.tokens },
});
const render = (data: GrowthView) => renderToStaticMarkup(<GrowthBody card={{ id: "aria", name: "Aria" }} data={data} t={tt} act={async () => true} busy={false} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;

const LONG = "She no longer hides behind sharp remarks. ".repeat(14).trim();
const BASE = entry("g1", { section: "personality", text: "Sharp-tongued and guarded. She denies her feelings and hides behind jokes.", prev: ["Cold and distant."] });
const REVISION = entry("g2", { state: "proposed", origin: "agent", section: "personality", text: "Open and teasing, says what she means.", revises: "g1", basis: "the guarded temper in the card", from: { chatId: "c1", title: "Night in the keep", at: 5 } });
const NEWBLOCK = entry("g3", { state: "proposed", origin: "agent", kind: "added", section: "relationships", title: "The courier", text: LONG });
const OFF = entry("g4", { on: false, section: "goals", kind: "added", title: "The northern road", text: "She wants to see the northern road." });
const PAST = entry("g5", { section: "background", text: "Grew up in the keep." });
const ALL = [BASE, REVISION, NEWBLOCK, OFF, PAST];

describe("the list, grouped", () => {
  it("proposals are split off, the accepted blocks keep the server's order", () => {
    const { proposed, accepted } = splitGrowth([BASE, REVISION, OFF, NEWBLOCK]);
    expect(proposed.map((e) => e.id)).toEqual(["g2", "g3"]);
    expect(accepted.map((e) => e.id)).toEqual(["g1", "g4"]);
  });
  it("accepted blocks go under their section in the portrait's order; empty sections are left out; an unknown section goes to other", () => {
    const stray = entry("g6", { section: "weird" as never });
    const groups = groupBySection([OFF, BASE, stray, PAST]);
    expect(groups.map((g) => g.section)).toEqual(["background", "personality", "goals", "other"]);
    expect(groups.find((g) => g.section === "other")?.entries.map((e) => e.id)).toEqual(["g6"]);
    expect(groupBySection([])).toEqual([]);
  });
  it("the server's section list sets the order when it sends one", () => {
    expect(groupBySection([BASE, PAST], ["personality", "background"]).map((g) => g.section)).toEqual(["personality", "background"]);
  });
});

describe("revisions", () => {
  it("a proposal finds the accepted block it revises; a new block, a gone block and an accepted one find none", () => {
    expect(revisedBlock(REVISION, ALL)?.id).toBe("g1");
    expect(revisedBlock(NEWBLOCK, ALL)).toBeNull();
    expect(revisedBlock(REVISION, [REVISION, NEWBLOCK])).toBeNull();
    expect(revisedBlock(entry("g7", { revises: "g1" }), ALL)).toBeNull();
    // the target must be accepted, not another proposal
    expect(revisedBlock(REVISION, [entry("g1", { state: "proposed" }), REVISION])).toBeNull();
  });
});

describe("folding and labels", () => {
  it("a paragraph folds past about six lines or 420 characters, a short one never", () => {
    expect(isLong("short")).toBe(false);
    expect(isLong("x".repeat(420))).toBe(false);
    expect(isLong("x".repeat(421))).toBe(true);
    expect(isLong("a\nb\nc\nd\ne\nf\ng")).toBe(true);
    expect(isLong("a\nb\nc\nd\ne\nf")).toBe(false);
  });
  it("a label is the title, else the start of the text, cut short", () => {
    expect(growthLabel(NEWBLOCK)).toBe("The courier");
    expect(growthLabel(entry("g8", { text: "x".repeat(200) }), 20).length).toBe(20);
  });
});

describe("what the forms send", () => {
  const v = { section: "relationships" as const, kind: "added" as const, title: " The courier ", text: " A friend now. ", basis: "  " };
  it("add sends only what is filled in, trimmed", () => {
    expect(addPatch(v)).toEqual({ op: "add", section: "relationships", kind: "added", text: "A friend now.", title: "The courier" });
    expect(addPatch({ ...v, kind: "changed", basis: "the old line" })).toEqual({ op: "add", section: "relationships", kind: "changed", text: "A friend now.", basis: "the old line" });
  });
  it("edit sends an empty title and basis as empty (the server removes them); a block that is not 'added' has no title", () => {
    expect(editPatch("g3", v)).toEqual({ op: "edit", id: "g3", section: "relationships", kind: "added", title: "The courier", text: "A friend now.", basis: "" });
    expect(editPatch("g3", { ...v, kind: "changed" })).toMatchObject({ kind: "changed", title: "" });
  });
});

describe("plural forms", () => {
  it("the omitted line has its verb in the right form in English and Ukrainian", () => {
    expect(t("mem.grow.omitted", "en", { n: 1 })).toBe("1 block is not sent: they do not fit the room.");
    expect(t("mem.grow.omitted", "en", { n: 3 })).toBe("3 blocks are not sent: they do not fit the room.");
    expect(t("mem.grow.omitted", "uk", { n: 1 })).toContain("1 блок не надсилається");
    expect(t("mem.grow.omitted", "uk", { n: 2 })).toContain("2 блоки не надсилаються");
    expect(t("mem.grow.omitted", "uk", { n: 5 })).toContain("5 блоків не надсилається");
  });
});

describe("GrowthBody", () => {
  const html = render(view(ALL, { maxTokens: 250, tokens: { omitted: 2, sent: 1, live: 3, used: 240, room: 250 } }));

  it("the waiting group counts the proposals and shows each as a card with its chips, title and full text", () => {
    expect(html).toContain('data-testid="mem-grow-waiting"');
    expect(html).toContain("Waiting for your yes (2)");
    expect(count(html, 'data-testid="mem-grow-proposal"')).toBe(2);
    expect(count(html, 'data-testid="mem-grow-chip-section"')).toBe(2);
    expect(html).toContain("Updates what the card says");
    expect(html).toContain("Something new");
    expect(html).toContain("The courier");
    expect(html).toContain(LONG.slice(0, 120));
    expect(html).toContain("From the chat “Night in the keep”");
    expect(html).toContain("Proposed by an agent");
  });

  it("a revision shows its 'Replaces' line and the current text of the block it revises; its button says it updates", () => {
    expect(html).toContain("Replaces: the guarded temper in the card");
    expect(count(html, 'data-testid="mem-grow-current"')).toBe(1);
    expect(html).toContain("Now in the portrait");
    expect(html).toContain("Sharp-tongued and guarded.");
    expect(html).toContain("Accept the update");
    expect(count(html, ">Accept<")).toBe(1);
  });

  it("was and now are nowhere", () => {
    expect(html).not.toContain(">Was<");
    expect(html).not.toContain(">Now<");
  });

  it("a long paragraph has Show more (and the text is still all in the markup), a short one does not", () => {
    expect(html).toContain("Show more");
    expect(html).toContain("line-clamp-6");
    const short = render(view([PAST]));
    expect(short).not.toContain("Show more");
    expect(short).not.toContain("line-clamp-6");
  });

  it("accepted blocks sit under a heading per section, in order, each with a switch; the off one is muted; the count is in the title", () => {
    const order = ["background", "personality", "goals"].map((s) => html.indexOf(`data-testid="mem-grow-section-${s}"`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain('data-testid="mem-grow-section-relationships"');
    expect(count(html, 'data-testid="mem-grow-entry"')).toBe(3);
    expect(count(html, 'role="switch"')).toBe(4); // three blocks and the master switch
    expect(html).toMatch(/aria-label="Use the block: The northern road"[^>]*aria-checked="false"|aria-checked="false"[^>]*aria-label="Use the block: The northern road"/);
    expect(html).toContain(">Goals<");
    expect(html).toContain(">Background<");
  });

  it("the room: step 100, the used line, the cost hint, and the warning with the count when blocks do not fit", () => {
    expect(html).toContain('type="number"');
    expect(html).toContain('step="100"');
    expect(html).toContain('min="100"');
    expect(html).toContain('max="8000"');
    expect(html).toContain("Used 240 of 250 tokens.");
    expect(html).toContain("A bigger room means a fuller portrait, but it costs tokens in every reply.");
    expect(html).toContain('data-testid="mem-grow-omitted"');
    expect(html).toContain("2 blocks are not sent: they do not fit the room.");
    expect(html).toContain("Raise the room to send them.");
    expect(render(view([PAST], { tokens: { omitted: 1 } }))).toContain("1 block is not sent");
  });

  it("no warning when everything fits; with the master switch off the room line says so and the warning goes", () => {
    expect(render(view([PAST]))).not.toContain('data-testid="mem-grow-omitted"');
    const off = render(view([PAST], { enabled: false, tokens: { omitted: 3 } }));
    expect(off).toContain("Off: nothing from the portrait goes into replies");
    expect(off).not.toContain('data-testid="mem-grow-omitted"');
  });

  it("an empty list is one calm sentence that names the agent and the board, an Add button, and no room controls", () => {
    const empty = render(view([]));
    expect(empty).toContain('data-testid="mem-grow-empty"');
    expect(empty).toContain("“Character growth” agent");
    expect(empty).toContain("Agents board");
    expect(empty).toContain("Add a block");
    expect(empty).not.toContain('data-testid="mem-grow-room"');
    expect(empty).not.toContain('data-testid="mem-grow-waiting"');
  });

  it("touch targets on a phone: the buttons are 40 px tall below md", () => {
    expect(html).toContain("max-md:h-10");
  });
});
