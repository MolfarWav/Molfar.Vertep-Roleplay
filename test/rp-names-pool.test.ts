// Names from the shared catalog (#373, step 3), the app's side: what it asks the engine for and how it fails soft.
import { afterEach, describe, expect, it } from "bun:test";
import { fetchNamePool, loadCatalogInfo, poolFor, tagLabel } from "../src/lib/names-pool";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fake(handler: (url: URL) => unknown | null) {
  const urls: URL[] = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input), "http://localhost");
    urls.push(url);
    const body = handler(url);
    return body === null ? new Response("no", { status: 404 }) : new Response(JSON.stringify(body));
  }) as unknown as typeof fetch;
  return urls;
}

const CATALOG = {
  enabled: true,
  packs: [{ kinds: { name: 3, place: 2 } }, { kinds: { organization: 4, item: 1, place: 1 } }],
  tags: { genres: ["fantasy", "dark_fantasy"], cultures: ["ukrainian", 5] },
};

describe("the catalog's vocabulary", () => {
  it("is read with the counts, and a bad value is left out", async () => {
    fake(() => CATALOG);
    expect(await loadCatalogInfo()).toEqual({ available: true, genres: ["fantasy", "dark_fantasy"], cultures: ["ukrainian"], kinds: { name: 3, place: 3, organization: 4, item: 1 } });
  });

  it("says not available for an engine without the routes, a Store that is off, no packs, or an error", async () => {
    for (const answer of [null, { enabled: false, packs: [] }, { enabled: true, packs: [] }]) {
      fake(() => answer);
      expect((await loadCatalogInfo()).available).toBe(false);
    }
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect((await loadCatalogInfo()).available).toBe(false);
  });
});

describe("the pool", () => {
  const search = (url: URL) => {
    const kind = url.searchParams.get("kind");
    const gender = url.searchParams.get("gender");
    const part = url.searchParams.get("part");
    const list = kind === "name" ? (part === "family" ? ["Kovalenko"] : gender === "f" ? ["Olena"] : ["Ivan"]) : kind === "place" ? ["Ash Gate"] : kind === "organization" ? ["Locksmiths"] : ["Compass"];
    return { items: list.map((name) => ({ name })) };
  };

  it("asks for random names of each kind with the chosen style and cultures", async () => {
    const urls = fake(search);
    const pool = await fetchNamePool({ namesGenres: ["dark_fantasy", "medieval"], namesCultures: ["ukrainian", "polish"] });
    expect(pool).toEqual({ persons: { f: ["Olena"], m: ["Ivan"], family: ["Kovalenko"] }, places: ["Ash Gate"], groups: ["Locksmiths"], things: ["Compass"] });
    expect(urls).toHaveLength(6);
    for (const u of urls) {
      expect(u.pathname).toBe("/v1/catalog/search");
      expect(u.searchParams.get("random")).toBe("1");
      expect(u.searchParams.get("limit")).toBe("12");
    }
    const place = urls.find((u) => u.searchParams.get("kind") === "place")!;
    expect(place.searchParams.get("anyTags")).toBe("dark_fantasy,medieval");
    expect(place.searchParams.get("culture")).toBeNull();
    const given = urls.find((u) => u.searchParams.get("gender") === "f")!;
    expect(given.searchParams.get("culture")).toBe("ukrainian,polish");
    expect(given.searchParams.get("anyTags")).toBeNull();
  });

  it("with nothing chosen asks for any style and any culture", async () => {
    const urls = fake(search);
    await fetchNamePool({ namesGenres: [], namesCultures: [] });
    for (const u of urls) {
      expect(u.searchParams.get("anyTags")).toBeNull();
      expect(u.searchParams.get("culture")).toBeNull();
    }
  });

  it("is null when nothing came (an engine without the routes), so nothing is sent", async () => {
    fake(() => null);
    expect(await fetchNamePool({ namesGenres: [], namesCultures: [] })).toBeNull();
  });

  it("is only fetched for a chat whose switch is on", async () => {
    const urls = fake(search);
    expect(await poolFor(undefined)).toBeNull();
    expect(await poolFor({ names: false, namesGenres: ["fantasy"] })).toBeNull();
    expect(urls).toHaveLength(0);
    expect((await poolFor({ names: true }))?.places).toEqual(["Ash Gate"]);
  });
});

describe("the chips", () => {
  it("read a vocabulary word as words", () => {
    expect(tagLabel("dark_fantasy")).toBe("Dark fantasy");
    expect(tagLabel("scottish_irish")).toBe("Scottish irish");
  });
});
