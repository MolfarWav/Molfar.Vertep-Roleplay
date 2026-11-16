// The cast deck's screens rendered to static markup (no DOM library here): the tile, the log lines, the chat card, the book's list with its
// gate. What happens on a click is checked in a real browser; here: what is on the screen first, and what stays hidden.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { SoFarTiles } = await import("../src/components/world/world-so-far");
const { CastDeckCard, CastDeckList, refillLine } = await import("../src/components/world/world-cast-deck");
const { castLine } = await import("../src/components/world/world-cast");
const { t } = await import("../src/lib/i18n");

const tr = ((key: string, vars?: Record<string, string | number>) => t(key as never, "en", vars)) as never;
const kinds = { person: 12, place: 3, group: 2, thing: 1 };
const tileTag = (html: string, id: string) => new RegExp(`<(?:button|div)[^>]*data-testid="tile-${id}"[^>]*>`).exec(html)?.[0] ?? "";

describe("the Cast deck tile", () => {
  it("shows only while cards are left, as an emerald button with the count and no names", () => {
    const none = renderToStaticMarkup(<SoFarTiles kinds={kinds} notes={0} archive={0} runs={1} onOpen={() => {}} />);
    expect(none).not.toContain('data-testid="tile-cast"');
    const some = renderToStaticMarkup(<SoFarTiles kinds={kinds} notes={0} archive={0} cast={4} runs={1} onOpen={() => {}} />);
    const tag = tileTag(some, "cast");
    expect(tag.startsWith("<button")).toBe(true);
    expect(tag).toContain("emerald");
    expect(some).toContain("Cast deck");
    expect(some).toMatch(/aria-label="Cast deck, 4, open the list"/);
  });
});

describe("the log lines", () => {
  it("a draw says who, the faction, the dice, who they tie to and why this card", () => {
    const line = castLine(tr, { at: 1, kind: "cast", src: "deck", who: "Halyna", faction: "Toll guild", tie: "Maksym", pick: "tie", band: "medium", silence: 41, threshold: 31, d: [3, 4], mod: 1, total: 8, result: "came" } as never);
    expect(line).toContain("Halyna comes in, new (medium): silent 41 of 31, 3+4 +1 silence = 8");
    expect(line).toContain("Toll guild");
    expect(line).toContain("ties to Maksym");
    expect(line).toContain("picked: their tie is in the scene");
    expect(line).toContain("came");
  });

  it("a card with no tie says so; a draw still waiting says it is checked after the next reply", () => {
    const line = castLine(tr, { at: 1, kind: "cast", src: "deck", who: "Zoya", loose: true, pick: "random", band: "small", d: [1, 2] } as never);
    expect(line).toContain("no tie yet");
    expect(line).toContain("picked by chance");
    expect(line).toContain("checked after the next reply");
  });

  it("a refill says how many cards for which factions, whether the player asked, or why it failed", () => {
    expect(refillLine(tr, { at: 1, n: 5, added: 3, factions: ["Crows", "Toll guild"] })).toBe("Refill: 3 cards for Crows, Toll guild");
    expect(refillLine(tr, { at: 1, n: 5, added: 1, factions: ["Crows"], forced: true })).toBe("Refill: 1 card for Crows · asked by you");
    expect(refillLine(tr, { at: 1, n: 5, added: 0, factions: ["Crows"] })).toContain("no usable cards");
    expect(refillLine(tr, { at: 1, n: 5, added: 0, factions: ["Crows"], error: "not-json" })).toContain("failed (not-json)");
  });
});

const view = (over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) =>
  ({ settings: { level: "living", cast: "normal", castDeck: true, castPer: 2, castLen: "normal", ...settings }, lastRunAt: 5, cast: 3, usage: { runs: 2 }, records: 4, ...over }) as never;

describe("the chat's card", () => {
  const card = (v = view(), on = true) => renderToStaticMarkup(<CastDeckCard chatId="c1" view={v} save={async () => {}} on={on} />);

  it("has the switch (on), the count in the header, the refill button with its hint and a log", () => {
    const html = card();
    expect(html).toContain('data-testid="section-deck"');
    expect(html).toContain("Cast deck");
    expect(html).toContain("3 cards");
    expect(html).toMatch(/data-testid="deck-switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-testid="deck-switch"/);
    expect(html).toContain("Add new people now");
    expect(html).toContain("2 per faction");
    expect(html).toContain('data-testid="deck-log"');
    expect(html).not.toContain("Halyna");
  });

  it("with the DM off it is dimmed, says why and disables its controls", () => {
    const html = card(view({}, { level: "off" }), false);
    expect(html).toContain("The DM is off for this chat");
    expect(html).toMatch(/data-testid="deck-refill"[^>]*disabled|disabled[^>]*data-testid="deck-refill"/);
  });

  it("the switch off reads as off", () => {
    expect(card(view({}, { castDeck: false }))).toMatch(/aria-checked="false"[^>]*data-testid="deck-switch"|data-testid="deck-switch"[^>]*aria-checked="false"/);
  });
});

describe("the book's list", () => {
  const list = (cast: number) => {
    return renderToStaticMarkup(<CastDeckList chatId="c1" left={cast} />);
  };

  it("hides the cards behind a gate that shows only how many there are", () => {
    const html = list(3);
    expect(html).toContain('data-testid="deck-gate"');
    expect(html).toContain("3 cards of people who have not appeared yet");
    expect(html).toContain("Show the cards");
    expect(html).not.toContain('data-testid="deck-card"');
    expect(html).toContain("The DM never sees them");
  });

  it("an empty deck says what fills it and offers the button", () => {
    const html = list(0);
    expect(html).not.toContain('data-testid="deck-gate"');
    expect(html).toContain('data-testid="deck-list-empty"');
    expect(html).toContain("Add new people now");
  });
});
