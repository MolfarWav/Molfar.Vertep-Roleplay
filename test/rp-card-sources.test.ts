/**
 * More card sources (studio-import 1.13.0): RisuRealm and CharaVault search
 * and detail, POST /fetch/card for RisuRealm, CharaVault and direct links.
 * host.net is mocked; the fetch rules it stands in for (allowlist per hop,
 * size cap) live in the engine.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const stUrl = new URL("../plugins/studio-import/plugin.js", import.meta.url).href;

// The engine runs plugins in QuickJS, which has none of these: hide them so a
// plugin that leans on them fails here and not only in the live app.
const BROWSER_ONLY = ["atob", "btoa", "TextDecoder", "TextEncoder"] as const;
const saved: Record<string, unknown> = {};
beforeAll(() => {
  for (const k of BROWSER_ONLY) { saved[k] = (globalThis as Record<string, unknown>)[k]; delete (globalThis as Record<string, unknown>)[k]; }
});
afterAll(() => {
  for (const k of BROWSER_ONLY) (globalThis as Record<string, unknown>)[k] = saved[k];
});

type NetReply = (key: string, req: Record<string, unknown>) => Record<string, unknown>;

async function drive(path: string, body: unknown, reply?: NetReply) {
  const mod = (await import(stUrl)) as { handleRoute: Function };
  const results: Record<string, unknown> = {};
  const requests: { key: string; req: Record<string, unknown> }[] = [];
  const host = { net: { request: (key: string, req: Record<string, unknown>) => { requests.push({ key, req }); }, results }, log: () => {} };
  const call = { method: "POST", path, query: {}, body };
  let out = mod.handleRoute(call, host) as { status?: number; json?: Record<string, unknown>; __llmPending?: boolean };
  if (out?.__llmPending) {
    for (const { key, req } of requests) results[key] = reply ? reply(key, req) : { ok: false, error: "no reply" };
    out = mod.handleRoute(call, host) as typeof out;
  }
  return { status: out?.status ?? 200, json: (out?.json ?? {}) as Record<string, unknown>, requests };
}

const b64 = (bytes: Uint8Array | number[]) => Buffer.from(bytes as Uint8Array).toString("base64");

/** A PNG with the given tEXt chunks (the parser does not check CRCs). */
function png(chunks: [string, string][]): Uint8Array {
  const parts: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunk = (type: string, data: number[]) => {
    const n = data.length;
    parts.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...Buffer.from(type, "latin1"), ...data, 0, 0, 0, 0);
  };
  chunk("IHDR", new Array(13).fill(0));
  for (const [kw, text] of chunks) chunk("tEXt", [...Buffer.from(kw, "latin1"), 0, ...Buffer.from(text, "latin1")]);
  chunk("IEND", []);
  return Uint8Array.from(parts);
}
const cardB64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

describe("rp card sources: links", () => {
  it("routes each kind of link to its download, refuses the rest in plain words", async () => {
    const seen: string[] = [];
    const reply: NetReply = (_k, req) => {
      seen.push(String(req.url));
      return { ok: true, status: 200, url: String(req.url), base64: b64(png([["chara", cardB64({ name: "Ann" })]])) };
    };
    const id = "fad65b7c-d924-4086-80ce-352a91779e1f";
    const risu = await drive("/fetch/card", { url: `https://realm.risuai.net/character/${id}` }, reply);
    expect(risu.status).toBe(200);
    expect(risu.json).toMatchObject({ source: "risurealm", sourceLabel: "RisuRealm", kind: "png", fileName: `${id}.png` });
    expect(seen[0]).toBe(`https://realm.risuai.net/api/v1/download/dynamic/${id}?cors=true`);
    expect((risu.requests[0]!.req.headers as Record<string, string>)["x-risu-api-version"]).toBe("4");
    expect(String((risu.requests[0]!.req.headers as Record<string, string>)["user-agent"])).toContain("Molfar-Vertep");
    expect(risu.requests[0]!.req.maxBytes).toBe(16 * 1024 * 1024);

    const cv = await drive("/fetch/card", { url: "https://charavault.net/cards/A%20B/A%20B.card.png" }, reply);
    expect(cv.status).toBe(200);
    expect(seen[1]).toBe("https://charavault.net/api/cards/download/A%20B/A%20B.card.png");
    expect(cv.json.fileName).toBe("A B.png");

    // GitHub and Hugging Face page links become file links
    await drive("/fetch/card", { url: "https://github.com/u/r/blob/main/cards/x.png" }, reply);
    expect(seen[2]).toBe("https://raw.githubusercontent.com/u/r/main/cards/x.png");
    await drive("/fetch/card", { url: "https://huggingface.co/datasets/u/d/blob/main/x.png" }, reply);
    expect(seen[3]).toBe("https://huggingface.co/datasets/u/d/resolve/main/x.png");

    const janny = await drive("/fetch/card", { url: "https://jannyai.com/characters/abc_character-x" }, reply);
    expect(janny.status).toBe(422);
    expect(janny.json.openInBrowser).toBe("https://jannyai.com/characters/abc_character-x");
    expect(janny.requests).toHaveLength(0);

    const other = await drive("/fetch/card", { url: "https://example.com/card.png" }, reply);
    expect(other.status).toBe(422);
    expect(String(other.json.error)).toContain("drop it into the Store");
    expect((await drive("/fetch/card", { url: "http://raw.githubusercontent.com/a/b/c.png" }, reply)).status).toBe(400);
    expect((await drive("/fetch/card", { url: "https://realm.risuai.net/character/not-a-uuid" }, reply)).status).toBe(400);
    expect(seen).toHaveLength(4);
  });

  it("refuses a redirect that leaves the link's service and maps failures to plain words", async () => {
    const away = await drive("/fetch/card", { url: "https://files.catbox.moe/abc.png" }, () => ({
      ok: true, status: 200, url: "https://cdn.discordapp.com/x.png", base64: b64(png([["chara", cardB64({ name: "A" })]])),
    }));
    expect(away.status).toBe(422);
    expect(String(away.json.error)).toContain("redirected away from Catbox");

    const hf = await drive("/fetch/card", { url: "https://huggingface.co/u/m/resolve/main/x.png" }, () => ({
      ok: true, status: 200, url: "https://us.aws.cdn.hf.co/xet-bridge-us/abc", base64: b64(png([["chara", cardB64({ name: "A" })]])),
    }));
    expect(hf.status).toBe(200); // the CDN belongs to Hugging Face

    const slow = await drive("/fetch/card", { url: "https://charavault.net/cards/a/b.png" }, () => ({ ok: false, status: 429 }));
    expect(slow.status).toBe(429);
    expect(String(slow.json.error)).toContain("Wait a minute");
    const big = await drive("/fetch/card", { url: "https://files.catbox.moe/a.png" }, () => ({ ok: false, error: "response too large (20000000 > 16777216)" }));
    expect(big.status).toBe(413);
    const fence = await drive("/fetch/card", { url: "https://files.catbox.moe/a.png" }, () => ({ ok: false, error: "host not in this plugin's networkHosts allowlist: evil.example" }));
    expect(String(fence.json.error)).toContain("evil.example");
  });
});

describe("rp card sources: file types", () => {
  const fetchAs = (bytes: Uint8Array) =>
    drive("/fetch/card", { url: "https://files.catbox.moe/x.bin" }, () => ({ ok: true, status: 200, url: "https://files.catbox.moe/x.bin", base64: b64(bytes) }));

  it("reads a V3 PNG whose ccv3 chunk comes first and is base64, as the spec says", async () => {
    const r = await fetchAs(png([["ccv3", cardB64({ spec: "chara_card_v3", data: { name: "V3" } })], ["chara", cardB64({ name: "V2" })]]));
    expect(r.status).toBe(200);
    expect(r.json.kind).toBe("png");
  });

  it("tells a plain image, a web page and a non-card JSON apart from a card", async () => {
    expect((await fetchAs(png([]))).json.error).toContain("plain image");
    expect(String((await fetchAs(Buffer.from("<!doctype html><html>"))).json.error)).toContain("web page");
    expect(String((await fetchAs(Buffer.from('{"foo":1}'))).json.error)).toContain("not a character card");
    const ok = await fetchAs(Buffer.from('﻿{"spec":"chara_card_v2","data":{"name":"J"}}'));
    expect(ok.json).toMatchObject({ kind: "json", fileName: "x.bin.json" });
  });

  it("finds the zip behind a JPEG cover (RisuRealm charx)", async () => {
    const cover = [0xff, 0xd8, 0xff, 0xe0, ...new Array(100).fill(7)];
    // a minimal zip: one local header, a central directory of 10 bytes at 30, then the end record
    const zip = [0x50, 0x4b, 3, 4, ...new Array(26).fill(0), ...new Array(10).fill(1)];
    const eocd = [0x50, 0x4b, 5, 6, 0, 0, 0, 0, 1, 0, 1, 0, 10, 0, 0, 0, 30, 0, 0, 0, 0, 0];
    const r = await fetchAs(Uint8Array.from([...cover, ...zip, ...eocd]));
    expect(r.json).toMatchObject({ kind: "charx", zipOffset: cover.length });
    const plain = await fetchAs(Uint8Array.from([...zip, ...eocd]));
    expect(plain.json).toMatchObject({ kind: "charx", zipOffset: 0 });
  });
});

describe("rp card sources: Wyvern, Pygmalion, JannyAI", () => {
  it("Wyvern: search sends no ordering with a term, the install builds a V2 card with every greeting", async () => {
    const s = await drive("/marketplace/search", { source: "wyvern", search: "knight", sort: "rating", tags: ["Fantasy"], first: 6 }, (_k, req) => {
      const q = new URL(String(req.url)).searchParams;
      expect(String(req.url)).toContain("https://api.wyvern.chat/exploreSearch/characters?");
      expect(q.get("q")).toBe("knight");
      expect(q.has("sort")).toBe(false);
      expect(q.get("tags")).toBe("Fantasy");
      return { ok: true, status: 200, json: { results: [{ id: "_abcDEF123", name: "Kn", creator: { displayName: "Me" }, tags: ["Fantasy"], rating: "none", avatar: "https://imagedelivery.net/a/b/public", lorebooks: [{ id: "x" }] }], total: 7, hasMore: false } };
    });
    expect((s.json.results as unknown[])[0]).toMatchObject({ id: "_abcDEF123", source: "wyvern", creator: "Me", nsfw: false, linkedBooks: 1, pageUrl: "https://app.wyvern.chat/characters/_abcDEF123" });
    const sorted = await drive("/marketplace/search", { source: "wyvern", sort: "rating" }, (_k, req) => {
      expect(new URL(String(req.url)).searchParams.get("sort")).toBe("votes");
      return { ok: true, status: 200, json: { results: [], total: 0 } };
    });
    expect(sorted.status).toBe(200);

    const f = await drive("/fetch/card", { url: "https://wyvern.chat/characters/_abcDEF123" }, (_k, req) => {
      expect(req.url).toBe("https://api.wyvern.chat/characters/_abcDEF123");
      expect(req.json).toBe(true);
      return { ok: true, status: 200, url: String(req.url), json: {
        id: "_abcDEF123", name: "Кн", description: "D", first_mes: "Hi", alternate_greetings: ["Alt"],
        greetings: [{ content: "Hi" }, { content: "Second" }], pre_history_instructions: "SP", avatar: "https://imagedelivery.net/a/b/public", lorebooks: [{ id: "x" }],
      } };
    });
    expect(f.json).toMatchObject({ kind: "json", sourceLabel: "Wyvern", avatarUrl: "https://imagedelivery.net/a/b/public", skippedBooks: 1 });
    const card = JSON.parse(Buffer.from(String(f.json.base64), "base64").toString("utf8"));
    expect(card.data).toMatchObject({ name: "Кн", first_mes: "Hi", alternate_greetings: ["Second", "Alt"], system_prompt: "SP" });
  });

  it("Pygmalion: Connect GET with a 0-based page, persona and greeting become the card", async () => {
    const s = await drive("/marketplace/search", { source: "pygmalion", search: "x", sort: "newest", page: 2, first: 10 }, (_k, req) => {
      const u = new URL(String(req.url));
      expect(u.origin + u.pathname).toBe("https://server.pygmalion.chat/galatea.v1.PublicCharacterService/CharacterSearch");
      expect(JSON.parse(u.searchParams.get("message")!)).toMatchObject({ query: "x", orderBy: "approved_at", orderDescending: true, pageSize: 10, page: 1 });
      return { ok: true, status: 200, json: { totalItems: 25, characters: [{ id: "6b67ca81-f58e-4a16-bf29-5f36313f29b7", displayName: "W", owner: { displayName: "O" }, downloads: 3, stars: 2, avatarUrl: "https://assets.pygmalion.chat/x" }] } };
    });
    expect(s.json).toMatchObject({ count: 25, hasMore: true });
    expect((s.json.results as unknown[])[0]).toMatchObject({ source: "pygmalion", downloads: 3, favorites: 2, pageUrl: "https://pygmalion.chat/character/6b67ca81-f58e-4a16-bf29-5f36313f29b7" });
    const f = await drive("/fetch/card", { url: "https://pygmalion.chat/character/6b67ca81-f58e-4a16-bf29-5f36313f29b7" }, (_k, req) => ({
      ok: true, status: 200, url: String(req.url),
      json: { character: { id: "6b67ca81-f58e-4a16-bf29-5f36313f29b7", displayName: "W", description: "short", avatarUrl: "https://assets.pygmalion.chat/x", tags: ["A"], personality: { name: "World", persona: "P", greeting: "G", characterNotes: "N", mesExample: "E" } } },
    }));
    const card = JSON.parse(Buffer.from(String(f.json.base64), "base64").toString("utf8"));
    expect(card.data).toMatchObject({ name: "World", description: "P", first_mes: "G", mes_example: "E", creator_notes: "short\n\nN", tags: ["A"] });
  });

  it("JannyAI: search only, filters by tag id, plain-text descriptions, never downloads", async () => {
    const s = await drive("/marketplace/search", { source: "janny", search: "elf", tags: ["Fantasy", "nope"], excludeTags: ["Horror"], minTokens: 500 }, (_k, req) => {
      expect(req.url).toBe("https://search.jannyai.com/multi-search");
      expect(req.method).toBe("POST");
      expect(String((req.headers as Record<string, string>).authorization)).toStartWith("Bearer ");
      const q = (req.body as { queries: Record<string, unknown>[] }).queries[0]!;
      expect(q).toMatchObject({ indexUid: "janny-characters", q: "elf", page: 1 });
      expect(q.filter).toEqual(["isNsfw = false", "isLowQuality = false", "totalToken >= 500", "tagIds = 53", "tagIds != 51"]);
      expect(q.sort).toBeUndefined(); // a search term ranks by relevance
      return { ok: true, status: 200, json: { results: [{ totalHits: 1, hits: [{ id: "3321c718-3682-4361-a3c6-fedb5f03e40b", name: "Dusk Elf", description: "<p><span>Line &amp; one</span></p><p>Two</p>", tagIds: [2, 53], isNsfw: false, totalToken: 900, avatar: "a_b.webp" }] }] } };
    });
    expect((s.json.results as unknown[])[0]).toMatchObject({
      tagline: "Line & one", description: "Line & one\nTwo", topics: ["Female", "Fantasy"], browserOnly: true,
      avatar: "https://image.jannyai.com/bot-avatars/a_b.webp",
      pageUrl: "https://jannyai.com/characters/3321c718-3682-4361-a3c6-fedb5f03e40b_character-dusk-elf",
    });
    const rotated = await drive("/marketplace/search", { source: "janny" }, () => ({ ok: false, status: 403 }));
    expect(String(rotated.json.error)).toContain("search key");
    const d = await drive("/marketplace/detail", { source: "janny", id: "3321c718-3682-4361-a3c6-fedb5f03e40b" });
    expect(d.json.browserOnly).toBe(true);
    expect(d.requests).toHaveLength(0);
  });
});

describe("rp card sources: search and detail", () => {
  it("RisuRealm: reads the site's page data and maps it to Store items", async () => {
    // devalue: object members and array items are indexes into the same array
    const data = [
      { cards: 1, page: 9, nsfw: 10, search: 11 },
      [2],
      { name: 3, desc: 4, download: 5, id: 6, img: 7, tags: 8, haslore: 12, hasEmotion: 10, hasAsset: 12, authorname: 13, date: 14 },
      "Knight", "A brave knight\nmore", "17.2k", "fad65b7c-d924-4086-80ce-352a91779e1f",
      "cc0dd42a87df7cc798287771fe21c426a07804b7f1e569e5d333d0d2cf72079f", [], 1, false, "knight", true, "someone", 29832809,
    ];
    const r = await drive("/marketplace/search", { source: "risurealm", search: "knight", sort: "downloads" }, (_k, req) => {
      expect(String(req.url)).toBe("https://realm.risuai.net/__data.json?q=knight&page=1&nsfw=false&sort=download");
      return { ok: true, status: 200, json: { type: "data", nodes: [null, { type: "data", data }] } };
    });
    expect(r.status).toBe(200);
    expect(r.json.hasMore).toBe(false);
    expect((r.json.results as unknown[])[0]).toMatchObject({
      id: "fad65b7c-d924-4086-80ce-352a91779e1f", source: "risurealm", name: "Knight", creator: "someone",
      tagline: "A brave knight", downloads: 17200, hasLore: true, hasEmotions: true,
      avatar: "https://sv.risuai.xyz/resource/cc0dd42a87df7cc798287771fe21c426a07804b7f1e569e5d333d0d2cf72079f",
      pageUrl: "https://realm.risuai.net/character/fad65b7c-d924-4086-80ce-352a91779e1f",
    });
    for (const [sort, sent] of [["trending", "trending"], ["newest", "date"], ["random", "random"], ["recommended", null], ["rating", null]] as const) {
      await drive("/marketplace/search", { source: "risurealm", sort }, (_k, req) => {
        expect(new URL(String(req.url)).searchParams.get("sort")).toBe(sent);
        return { ok: true, status: 200, json: { nodes: [null, { type: "data", data: [{ cards: 1 }, []] }] } };
      });
    }
    const broken = await drive("/marketplace/search", { source: "risurealm" }, () => ({ ok: true, status: 200, json: { nodes: [] } }));
    expect(String(broken.json.error)).toContain("changed its search page");
  });

  it("CharaVault: NSFW stays off unless asked, items carry the source and the page link", async () => {
    const r = await drive("/marketplace/search", { source: "charavault", search: "elf", page: 2, first: 10 }, (_k, req) => {
      const url = String(req.url);
      expect(url).toContain("https://charavault.net/api/cards?");
      expect(url).toContain("nsfw=false");
      expect(url).toContain("offset=10");
      expect(url).toContain("sort=most_downloaded");
      return { ok: true, status: 200, json: { total: 25, limit: 10, offset: 10, results: [{ file: "E.card.png", folder: "E", name: "Elf", creator: "c", tags: ["x"], nsfw: false, description_preview: "d", token_count: 900, has_lorebook: true }] } };
    });
    expect(r.json).toMatchObject({ count: 25, hasMore: true });
    expect((r.json.results as unknown[])[0]).toMatchObject({ id: "E/E.card.png", source: "charavault", hasLore: true, tokens: 900, pageUrl: "https://charavault.net/cards/E/E.card.png" });
    const adult = await drive("/marketplace/search", { source: "charavault", nsfw: true }, (_k, req) => {
      expect(String(req.url)).toContain("nsfw=true");
      return { ok: true, status: 200, json: { total: 0, results: [] } };
    });
    expect(adult.status).toBe(200);

    const filtered = await drive("/marketplace/search", {
      source: "charavault", sort: "rating", tags: ["elf", "a,b"], excludeTags: ["gore"], origin: "risuai",
      creator: "Some One", requireLore: true, minTokens: 500, maxTokens: "x",
    }, (_k, req) => {
      const q = new URL(String(req.url)).searchParams;
      expect(q.get("sort")).toBe("top_rated");
      expect(q.get("tags")).toBe("elf,a b,risuai");
      expect(q.get("exclude_tags")).toBe("gore");
      expect(q.get("creator")).toBe("Some One");
      expect(q.get("has_book")).toBe("true");
      expect(q.get("token_min")).toBe("500");
      expect(q.has("token_max")).toBe(false);
      return { ok: true, status: 200, json: { total: 1, results: [{ file: "E F.png", folder: "E F", name: "Elf" }] } };
    });
    expect((filtered.json.results as { avatar: string }[])[0]!.avatar).toBe("https://charavault.net/cards/thumb/E%20F/E%20F.png");
    const rogue = await drive("/marketplace/search", { source: "charavault", origin: "evil", sort: "DROP" }, (_k, req) => {
      const q = new URL(String(req.url)).searchParams;
      expect(q.has("tags")).toBe(false);
      expect(q.get("sort")).toBe("most_downloaded");
      return { ok: true, status: 200, json: { total: 0, results: [] } };
    });
    expect(rogue.status).toBe(200);

    const d = await drive("/marketplace/detail", { source: "charavault", id: "E/E.card.png" }, (_k, req) => {
      expect(String(req.url)).toBe("https://charavault.net/api/cards/E/E.card.png");
      return { ok: true, status: 200, json: { full_metadata: { data: { first_mes: "Hi", description: "Desc", character_book: { entries: [{}, {}] } } } } };
    });
    expect(d.json).toMatchObject({ greeting: "Hi", personality: "Desc", lorebookEntries: 2 });
  });
});
