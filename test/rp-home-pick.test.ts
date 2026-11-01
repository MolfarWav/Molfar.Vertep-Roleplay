// Home's pure picks (src/lib/home-pick.ts): the seeded pick, the tip pool, open quests, the Marketplace cache shape,
// and the link to the releases page, which must be the repository in manifest.json.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MARKET_TTL_MS, RELEASES_URL, freshMarket, latestTips, gatherQuests, normalizeMarket, openQuests, pickAt, shortCount, tipPool,
} from "../src/lib/home-pick";
import { TIPS } from "../src/lib/guide-tips";
import type { Tip } from "../src/lib/guide";

// home-market imports the engine client, which reads the frame's location at load (like the other component tests)
(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { marketBody } = await import("../src/lib/home-market");

const tip = (id: string, extra: Partial<Tip> = {}): Tip => ({ id, title: { en: id, uk: id }, body: { en: id, uk: id }, ...extra });

describe("pickAt", () => {
  it("lands on one index for a seed and moves on with each step, wrapping", () => {
    expect(pickAt(0, 4)).toBe(0);
    expect(pickAt(0.99, 4)).toBe(3);
    expect(pickAt(0.3, 4, 0)).toBe(1);
    expect(pickAt(0.3, 4, 1)).toBe(2);
    expect(pickAt(0.3, 4, 3)).toBe(0);
  });

  it("is -1 for an empty list and tolerates a bad seed", () => {
    expect(pickAt(0.5, 0)).toBe(-1);
    expect(pickAt(Number.NaN, 3)).toBe(0);
  });
});

describe("tipPool", () => {
  const tips = [
    tip("old", { help: "chat" }),
    tip("new-a", { help: "chat", since: "4.79.0" }),
    tip("new-b", { since: "4.70.0" }),
    tip("tour-only"),
    tip("seen-new", { help: "chat", since: "4.78.0" }),
  ];

  it("prefers the unseen tips that announce a release, newest first, and leaves out tour steps", () => {
    expect(tipPool(tips, ["seen-new"]).map((t) => t.id)).toEqual(["new-a", "new-b"]);
  });

  it("falls back to the unseen help tips, then to all of them", () => {
    expect(tipPool([tip("a", { help: "chat" }), tip("b", { help: "chat" })], ["a"]).map((t) => t.id)).toEqual(["b"]);
    expect(tipPool([tip("a", { help: "chat" })], ["a"]).map((t) => t.id)).toEqual(["a"]);
  });

  it("works on the real registry", () => {
    expect(tipPool(TIPS, []).length).toBeGreaterThan(0);
    for (const t of tipPool(TIPS, [])) expect(t.help !== undefined || t.since !== undefined).toBe(true);
  });
});

describe("latestTips and openQuests", () => {
  it("latestTips takes the newest release notes first", () => {
    const got = latestTips([tip("a", { since: "4.70.0" }), tip("b"), tip("c", { since: "4.79.0" }), tip("d", { since: "4.78.0" })], 2);
    expect(got.map((t) => t.id)).toEqual(["c", "d"]);
  });

  it("openQuests keeps the open ones, main first, then newest", () => {
    const q = openQuests([
      { id: "s1", text: "side old", status: "open", since: 1, kind: "side" },
      { id: "m1", text: "main", status: "open", since: 2, kind: "main" },
      { id: "done", text: "resolved", status: "resolved", since: 9, kind: "main" },
      { id: "s2", text: "side new", status: "open", since: 5 },
      { id: "e1", text: "everyday", status: "open", since: 7, kind: "everyday" },
    ]);
    expect(q.map((x) => x.id)).toEqual(["m1", "s2", "s1", "e1"]);
  });
});

describe("gatherQuests", () => {
  const th = (id: string, since: number, kind: "main" | "side" | "everyday" = "side", status: "open" | "resolved" = "open") => ({ id, text: id, status, since, kind });
  const chats = [
    { chatId: "c1", chatTitle: "One", threads: [th("a1", 5), th("a2", 4), th("a3", 3), th("done", 9, "main", "resolved")] },
    { chatId: "c2", chatTitle: "Two", threads: [th("b1", 1, "main"), th("b2", 8)] },
  ];
  it("main quests first, then chats in the order given, newest first; resolved threads are left out", () => {
    const { items, total } = gatherQuests(chats, 10);
    expect(items.map((q) => q.thread.id)).toEqual(["b1", "a1", "a2", "b2"]);
    expect(items.map((q) => q.chatId)).toEqual(["c2", "c1", "c1", "c2"]);
    expect(total).toBe(5);
  });
  it("one chat shows at most perChat rows and the list at most limit", () => {
    expect(gatherQuests(chats, 10, 1).items.map((q) => q.thread.id)).toEqual(["b1", "a1"]);
    expect(gatherQuests(chats, 2).items).toHaveLength(2);
    expect(gatherQuests([], 5)).toEqual({ items: [], total: 0 });
  });
});

describe("the Marketplace cache", () => {
  it("normalizes listings and drops the ones without a name or id", () => {
    const got = normalizeMarket([
      { id: "a/one", name: " One ", creator: "x", tagline: "t", avatar: "https://x/y.png", downloads: 12, tokens: 900, nsfw: true },
      { id: "", name: "no id" },
      { id: "b/two", name: "" },
      null,
      { id: "c/three", name: "Three", avatar: "", downloads: "many" },
    ]);
    expect(got).toEqual([
      { id: "a/one", name: "One", creator: "x", tagline: "t", avatar: "https://x/y.png", downloads: 12, tokens: 900 },
      { id: "c/three", name: "Three", creator: "", tagline: "", avatar: null, downloads: 0, tokens: 0 },
    ]);
    expect(normalizeMarket("nope")).toEqual([]);
  });

  it("a stored set is reused for an hour and no longer", () => {
    const now = 1_000_000_000;
    const items = [{ id: "a/one", name: "One" }];
    expect(freshMarket({ at: now - 1000, items }, now)).toHaveLength(1);
    expect(freshMarket({ at: now - MARKET_TTL_MS - 1, items }, now)).toBeNull();
    expect(freshMarket({ at: now + MARKET_TTL_MS * 2, items }, now)).toBeNull();
    expect(freshMarket({ at: now, items: [] }, now)).toBeNull();
    expect(freshMarket(null, now)).toBeNull();
    expect(freshMarket({ items }, now)).toBeNull();
  });

  it("asks the Marketplace's own Chub route shape: trending, 24 per page, adult listings hidden", () => {
    const body = marketBody();
    expect(body).toMatchObject({ source: "chub", trending: true, first: 24, page: 1, nsfw: false, nsfwOnly: false });
  });
});

describe("shortCount and the releases link", () => {
  it("shortens counts the way the Marketplace does", () => {
    expect(shortCount(980)).toBe("980");
    expect(shortCount(1234)).toBe("1.2k");
    expect(shortCount(12400)).toBe("12k");
    expect(shortCount(0)).toBe("0");
  });

  it("the releases link is the repository in manifest.json", () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, "..", "manifest.json"), "utf8")) as { repository: string };
    expect(RELEASES_URL).toBe(`${manifest.repository.replace(/\/$/, "")}/releases`);
  });
});
