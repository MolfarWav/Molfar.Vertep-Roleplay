/**
 * The start-up list of characters (#46): /bootstrap ships summaries built from an index in the app's
 * local cache, never whole cards. A whole card per character ran the plugin sandbox out of memory
 * at ~700 characters and the app no longer started.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;

let root: string;
let reads: string[];
let statCalls = 0;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rp-index-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: null }));
  reads = [];
  statCalls = 0;
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

const AVATAR = "data:image/jpeg;base64," + "A".repeat(40_000);
function card(id: string, over: Record<string, unknown> = {}) {
  const dir = path.join(root, "characters", id);
  fs.mkdirSync(dir, { recursive: true });
  const c = {
    spec: "chara_card_v2", name: id[0]!.toUpperCase() + id.slice(1), creator: "me", character_version: "2", tags: ["noir"],
    description: "D".repeat(1500), personality: "dry", scenario: "night", first_mes: "Hello.", mes_example: "",
    alternate_greetings: ["Hi."], avatar: AVATAR, extensions: { talkativeness: "0.5", molfar_card_type: "single" },
    character_book: { entries: [{ keys: ["k"], content: "lore" }] },
    studio: {
      favorite: true, folderId: "f1", lastChatAt: 5, colors: { name: "#fff" }, linkedLorebookIds: ["b1"],
      expressions: [{ name: "joy", url: AVATAR }], versions: [{ id: "v", snapshot: { description: "old" } }],
      gallery: [{ id: "g", url: AVATAR }], css: ".x{}", descVariants: [{ id: "d", text: "alt" }],
    },
    ...over,
  };
  fs.writeFileSync(path.join(dir, "card.json"), JSON.stringify(c));
  return c;
}

function host(opts: { stat?: boolean } = {}) {
  const fsx: Record<string, unknown> = {
    read: (rel: string) => { reads.push(rel); return fs.readFileSync(path.resolve(root, rel), "utf8"); },
    write: (rel: string, content: string) => {
      const full = path.resolve(root, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    },
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
  };
  if (opts.stat !== false) {
    const one = (rel: string) => {
      try {
        const st = fs.statSync(path.resolve(root, rel));
        return { size: st.size, mtimeMs: Math.floor(st.mtimeMs), dir: st.isDirectory() };
      } catch { return null; }
    };
    // like the engine: a list of paths answers a list, in one call
    fsx.stat = (rel: string | string[]) => {
      statCalls++;
      return Array.isArray(rel) ? rel.map(one) : one(rel);
    };
  }
  return { fs: fsx, store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] }, log: () => {} };
}

async function route(method: string, p: string, body?: unknown, h = host()) {
  const mod = (await import(engineUrl)) as { handleRoute: Function };
  const out = mod.handleRoute({ method, path: p, query: {}, body }, h) as { status?: number; json?: Record<string, unknown> };
  return { status: out?.status ?? 200, json: (out?.json ?? {}) as Record<string, unknown> };
}
const cardReads = () => reads.filter((r) => r.endsWith("card.json")).length;

describe("character summaries at start", () => {
  it("ships summaries: light fields, a blurb and a token count, no texts, books, sprites or data-URL portraits", async () => {
    card("aria");
    card("bram", { avatar: "/v1/assets/abc" });
    const r = await route("GET", "/bootstrap");
    expect(r.status).toBe(200);
    const list = r.json.characters as Record<string, unknown>[];
    expect(list.map((c) => c.id).sort()).toEqual(["aria", "bram"]);
    const aria = list.find((c) => c.id === "aria")!;
    expect(aria.stub).toBe(true);
    expect(aria.name).toBe("Aria");
    expect(aria.tags).toEqual(["noir"]);
    expect(aria.creator).toBe("me");
    expect((aria.blurb as string).length).toBe(1000);
    expect(aria.tokens as number).toBeGreaterThan(250);
    for (const heavy of ["description", "personality", "first_mes", "alternate_greetings", "character_book", "avatar"]) {
      expect(aria[heavy], heavy).toBeUndefined();
    }
    // of the extensions only the card's kind (a badge on the list)
    expect(aria.extensions).toEqual({ molfar_card_type: "single" });
    expect(aria.avatarLazy).toBe(true);
    expect(aria.studio).toEqual({ favorite: true, folderId: "f1", lastChatAt: 5, colors: { name: "#fff" }, linkedLorebookIds: ["b1"] });
    // a portrait that is a stored file's address rides along: it is short
    const bram = list.find((c) => c.id === "bram")!;
    expect(bram.avatar).toBe("/v1/assets/abc");
    expect(bram.avatarLazy).toBeUndefined();
    expect(r.json.charactersPending).toBe(0);
    expect(JSON.stringify(r.json).length).toBeLessThan(5000);
  });

  it("keeps the index in the local cache and reads no card again until it changes", async () => {
    card("aria");
    card("bram");
    await route("GET", "/bootstrap");
    expect(cardReads()).toBe(2);
    const shards = fs.readdirSync(path.join(root, ".cache", "characters-index"));
    expect(shards.length).toBeGreaterThan(0);
    reads = [];
    statCalls = 0;
    const again = await route("GET", "/characters/summaries");
    expect((again.json.characters as unknown[]).length).toBe(2);
    expect(cardReads()).toBe(0);
    // every card checked in one call: one call per card cost seconds for a big library
    expect(statCalls).toBe(1);
  });

  it("picks up an edit made outside the app (Molfar, a sync pull, a git undo) on the next read", async () => {
    card("aria");
    await route("GET", "/bootstrap");
    card("aria", { name: "Aria Renamed", description: "short" });
    // same size and second is possible on a fast disk: the change time decides, so move it on
    const f = path.join(root, "characters", "aria", "card.json");
    fs.utimesSync(f, new Date(), new Date(Date.now() + 5000));
    reads = [];
    const r = await route("GET", "/characters/summaries");
    const aria = (r.json.characters as Record<string, unknown>[])[0]!;
    expect(aria.name).toBe("Aria Renamed");
    expect(aria.blurb).toBe("short");
    expect(cardReads()).toBe(1);
  });

  it("drops a deleted character from the index", async () => {
    card("aria");
    card("bram");
    await route("GET", "/bootstrap");
    fs.rmSync(path.join(root, "characters", "bram"), { recursive: true });
    const r = await route("GET", "/characters/summaries");
    expect((r.json.characters as Record<string, unknown>[]).map((c) => c.id)).toEqual(["aria"]);
    const indexed = fs.readdirSync(path.join(root, ".cache", "characters-index"))
      .flatMap((f) => Object.keys(JSON.parse(fs.readFileSync(path.join(root, ".cache", "characters-index", f), "utf8")).entries));
    expect(indexed).toEqual(["aria"]);
  });

  it("stops reading cards when its time is up and says how many are left; the next call goes on", async () => {
    for (const id of ["a1", "a2", "a3", "a4", "a5"]) card(id);
    let clock = 1_000_000;
    const now = spyOn(Date, "now").mockImplementation(() => clock);
    const h = host();
    const read = h.fs.read as (rel: string) => string;
    h.fs.read = (rel: string) => { if (rel.endsWith("card.json")) clock += 1500; return read(rel); };
    try {
      const first = await route("GET", "/bootstrap", undefined, h);
      expect((first.json.characters as unknown[]).length).toBe(2);
      expect(first.json.charactersPending).toBe(3);
      const second = await route("GET", "/characters/summaries", undefined, h);
      expect((second.json.characters as unknown[]).length).toBe(5);
      expect(second.json.pending).toBe(0);
    } finally {
      now.mockRestore();
    }
  });

  it("works on an engine without fs.stat: no index, every card read, still summaries", async () => {
    card("aria");
    const r = await route("GET", "/bootstrap", undefined, host({ stat: false }));
    const aria = (r.json.characters as Record<string, unknown>[])[0]!;
    expect(aria.stub).toBe(true);
    expect(aria.description).toBeUndefined();
    expect(fs.existsSync(path.join(root, ".cache"))).toBe(false);
  });

  it("hands out the left-out portraits in batches and says which ids to ask for again", async () => {
    card("aria");
    card("bram");
    const r = await route("POST", "/characters/avatars", { ids: ["aria", "bram", "../x", "nobody"] });
    expect(r.json.avatars).toEqual({ aria: AVATAR, bram: AVATAR });
    expect(r.json.rest).toEqual([]);
  });

  it("the full card is still one GET away, with the same rev as its summary until the file changes", async () => {
    const c = card("aria");
    const r = await route("GET", "/characters/aria");
    expect(r.json.description).toBe(c.description);
    expect(r.json.avatar).toBe(AVATAR);
    const boot = await route("GET", "/bootstrap");
    const rev = (boot.json.characters as Record<string, unknown>[])[0]!.rev;
    expect(typeof rev).toBe("string");
    expect(r.json.rev).toBe(rev);
    card("aria", { description: "changed" });
    fs.utimesSync(path.join(root, "characters", "aria", "card.json"), new Date(), new Date(Date.now() + 5000));
    const after = await route("GET", "/characters/summaries");
    expect((after.json.characters as Record<string, unknown>[])[0]!.rev).not.toBe(rev);
  });

  it("refuses to write a summary over a card", async () => {
    const c = card("aria");
    const r = await route("PUT", "/characters/aria", { name: "Aria", _stub: true, description: "" });
    expect(r.status).toBe(409);
    const disk = JSON.parse(fs.readFileSync(path.join(root, "characters", "aria", "card.json"), "utf8"));
    expect(disk.description).toBe(c.description);
  });
});
