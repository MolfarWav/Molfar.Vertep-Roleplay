// Home's presentational block parts, rendered to static markup (no DOM library here): the edit bar, the hidden tray,
// the Customize panel, and the blocks' views. Texts come from i18n in the store's language, so the checks look at
// structure, attributes and the data shown, not at English wording.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { EditBar, HiddenTray, CustomizePanel } = await import("../src/components/home/home-edit");
const { WaitingView } = await import("../src/components/home/block-waiting");
const { TipView } = await import("../src/components/home/block-help");
const { NewsView } = await import("../src/components/home/block-news");
const { QuestsView } = await import("../src/components/home/block-quests");
const { FavouritesView } = await import("../src/components/home/block-favourites");
const { LibraryView, taglineOf, latestChatOf } = await import("../src/components/home/block-library");
const { MarketView } = await import("../src/components/home/block-market");
const { WorldView } = await import("../src/components/home/block-world");
const { RELEASES_URL } = await import("../src/lib/home-pick");

const noop = () => undefined;

describe("EditBar", () => {
  const base = { name: "From your library", canEarlier: true, canLater: true, size: "sm" as const, onEarlier: noop, onLater: noop, onSize: noop, onHide: noop };

  it("is a named group with four labelled tools", () => {
    const html = renderToStaticMarkup(<EditBar {...base} />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="From your library"');
    expect((html.match(/<button[^>]*aria-label="[^"]+"/g) ?? []).length).toBe(4);
    expect(html).not.toMatch(/ disabled=""/);
  });

  it("disables move earlier on the first block and move later on the last", () => {
    const first = renderToStaticMarkup(<EditBar {...base} canEarlier={false} />);
    expect(first).toMatch(/<button[^>]* disabled=""[^>]*aria-label="Move earlier"/);
    const last = renderToStaticMarkup(<EditBar {...base} canLater={false} />);
    expect(last).toMatch(/<button[^>]* disabled=""[^>]*aria-label="Move later"/);
    expect(last.match(/ disabled=""/g)?.length).toBe(1);
  });

  it("the size tool names the current size", () => {
    const html = renderToStaticMarkup(<EditBar {...base} size="lg" />);
    expect(html).toMatch(/aria-label="[^"]*\(/);
  });
});

describe("HiddenTray and CustomizePanel", () => {
  it("the tray gives one Restore per hidden block, named", () => {
    const html = renderToStaticMarkup(<HiddenTray items={[{ id: "news", name: "What's new" }, { id: "help", name: "Did you know?" }]} onRestore={noop} />);
    expect(html).toContain("What&#x27;s new");
    expect((html.match(/<button/g) ?? []).length).toBe(2);
    expect(html).toMatch(/aria-label="[^"]*What&#x27;s new"/);
  });

  it("the tray with nothing hidden has no buttons", () => {
    expect(renderToStaticMarkup(<HiddenTray items={[]} onRestore={noop} />)).not.toContain("<button");
  });

  it("the panel has the Marketplace switch on, the tray, Reset and Done", () => {
    const html = renderToStaticMarkup(
      <CustomizePanel hidden={[{ id: "world", name: "World" }]} marketSuggest onRestore={noop} onMarketSuggest={noop} onReset={noop} onDone={noop} />,
    );
    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/);
    expect((html.match(/<button/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(html).toContain("World");
  });
});

describe("WaitingView", () => {
  it("says nothing waits when the inbox is empty", () => {
    const html = renderToStaticMarkup(<WaitingView total={0} failures={0} onOpen={noop} />);
    expect(html).not.toContain("text-destructive");
    expect(html).toContain("<button");
  });

  it("turns red when something failed", () => {
    const html = renderToStaticMarkup(<WaitingView total={5} failures={2} onOpen={noop} />);
    expect(html).toContain("text-destructive");
    expect(html).toContain(">5<");
    expect(html).toContain(">2<");
  });

  it("is not red when only suggestions wait", () => {
    const html = renderToStaticMarkup(<WaitingView total={3} failures={0} onOpen={noop} />);
    expect(html).not.toContain("text-destructive");
    expect(html).toContain(">3<");
  });
});

describe("TipView", () => {
  const base = { title: "Profile tab", body: "Splits a card into fields.", showMe: "button" as const, onShowMe: noop, onNext: noop, onAll: noop };

  it("shows the title, the body and a Show me button", () => {
    const html = renderToStaticMarkup(<TipView {...base} where="Card tab" />);
    expect(html).toContain("Profile tab");
    expect(html).toContain("Splits a card into fields.");
    expect(html).toContain("Card tab");
    expect((html.match(/<button/g) ?? []).length).toBe(3);
  });

  it("a tip that needs a chat says so instead of a button", () => {
    const html = renderToStaticMarkup(<TipView {...base} showMe="needsChat" />);
    expect(html.match(/<button/g)?.length).toBe(2);
  });

  it("a tip with no place has neither", () => {
    const html = renderToStaticMarkup(<TipView {...base} showMe="none" />);
    expect(html.match(/<button/g)?.length).toBe(2);
  });
});

describe("NewsView", () => {
  it("lists the notes and links to the releases page in a new tab", () => {
    const html = renderToStaticMarkup(
      <NewsView releasesUrl={RELEASES_URL} items={[{ id: "a", version: "4.79.0", title: "Personas", body: "A new page." }]} />,
    );
    expect(html).toContain("Personas");
    expect(html).toContain("4.79.0");
    expect(html).toContain(`href="${RELEASES_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });
});

describe("QuestsView", () => {
  it("draws nothing until the answer is in", () => {
    const html = renderToStaticMarkup(<QuestsView ready={false} chatTitle={null} items={[]} onOpen={noop} />);
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("<button");
  });

  it("lists the open threads with their chat and kind", () => {
    const html = renderToStaticMarkup(
      <QuestsView ready chatTitle="Harbour" items={[{ id: "q1", text: "Find who burned the harbour", kind: "main" }]} onOpen={noop} />,
    );
    expect(html).toContain("Find who burned the harbour");
    expect(html).toContain("Harbour");
    expect(html).toMatch(/<button[^>]*class="[^"]*min-h-12/);
  });
});

describe("FavouritesView", () => {
  it("shows a hint with no favourites", () => {
    const html = renderToStaticMarkup(<FavouritesView items={[]} onOpen={noop} onAll={noop} />);
    expect(html).not.toContain("<ul");
  });

  it("a tile per character, named", () => {
    const html = renderToStaticMarkup(
      <FavouritesView items={[{ id: "1", name: "Mira", avatar: null }, { id: "2", name: "Eli", avatar: "https://x/e.png" }]} onOpen={noop} onAll={noop} />,
    );
    expect(html).toContain("Mira");
    expect(html).toContain("Eli");
  });
});

describe("LibraryView, MarketView, WorldView", () => {
  it("the library card: name, tagline, the action and Another", () => {
    const html = renderToStaticMarkup(
      <LibraryView name="Tomas" tagline="The lighthouse keeper." portrait={null} chats={1} lorebooks={2} action="Continue" onAction={noop} onAnother={noop} />,
    );
    expect(html).toContain("Tomas");
    expect(html).toContain("The lighthouse keeper.");
    expect(html).toContain("Continue");
    expect(html).toContain('alt=""');
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });

  it("the Marketplace card names its creator and shows the source chip", () => {
    const html = renderToStaticMarkup(
      <MarketView card={{ id: "a/b", name: "Vael", creator: "Kestrel", tagline: "A smuggler.", avatar: null, downloads: 12400, tokens: 0 }} onOpen={noop} onAnother={noop} />,
    );
    expect(html).toContain("Vael");
    expect(html).toContain("Kestrel");
    expect(html).toContain("Chub");
    expect(html).toContain("12k");
  });

  it("the world tile on a picture has an img, and the button on the art is onImage", () => {
    const html = renderToStaticMarkup(<WorldView background={{ url: "/v1/assets/abc", name: "Forest" }} onOpen={noop} onShuffle={noop} />);
    expect(html).toContain('src="/v1/assets/abc"');
    expect(html).toContain("bg-white");
  });

  it("without a picture the tile is a tone and has no img", () => {
    const html = renderToStaticMarkup(<WorldView background={null} onOpen={noop} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("from-teal-600");
  });
});

describe("the helpers the blocks use", () => {
  it("taglineOf takes the first sentence and falls back to the notes", () => {
    expect(taglineOf({ description: "A lighthouse keeper. He never leaves the stairs.", creatorNotes: "x" })).toBe("A lighthouse keeper.");
    expect(taglineOf({ description: "", creatorNotes: "Notes only" })).toBe("Notes only");
    expect(taglineOf({ description: "  spaced   out  ", creatorNotes: "" })).toBe("spaced out");
  });

  it("latestChatOf finds the newest chat of one character", () => {
    const chats = [
      { id: "a", characterId: "c1", updatedAt: 1 },
      { id: "b", characterId: "c1", updatedAt: 5 },
      { id: "c", characterId: "c2", updatedAt: 9 },
    ] as unknown as Parameters<typeof latestChatOf>[0];
    expect(latestChatOf(chats, "c1")?.id).toBe("b");
    expect(latestChatOf(chats, "nope")).toBeNull();
  });
});
