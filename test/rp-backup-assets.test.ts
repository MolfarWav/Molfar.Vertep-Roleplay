// A studio backup carries the pictures its files point at (Molfar Vertep issue #89).
import { describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { addAssetsToBackup, extractSprites, referencedAssetIds, restoreBackupAssets, splitLibrary, type AssetBytes } from "../src/lib/backup-assets";

const ID_A = "a".repeat(64);
const ID_B = "b".repeat(64);
const ID_GONE = "c".repeat(64);
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

const backup = () => zipSync({
  "characters/kit.json": strToU8(JSON.stringify({ name: "Kit", gallery: [{ id: "g1", url: `/v1/assets/${ID_A}`, type: "image" }] })),
  "chats/kit/talk.jsonl": strToU8(`{"mes":"hi","extra":{"chry":{"picture":"/v1/assets/${ID_B}"}}}\n{"mes":"again ${ID_B.slice(0, 10)}"}\n`),
  "library.json": strToU8(JSON.stringify({ backgrounds: [{ url: `/v1/assets/${ID_GONE}` }, { url: `/v1/assets/${ID_A}` }] })),
  "settings.json": strToU8("{}"),
}, { level: 0 });

const store: Record<string, AssetBytes> = {
  [ID_A]: { bytes: new Uint8Array([1, 2, 3]), mime: "image/webp", name: "kit.webp" },
  [ID_B]: { bytes: new Uint8Array([9, 9]), mime: "image/png", name: null },
};

describe("referencedAssetIds", () => {
  it("finds each asset id once, in JSON and JSONL files only", () => {
    const files = unzipSync(backup());
    expect(referencedAssetIds(files)).toEqual([ID_A, ID_B, ID_GONE]);
    expect(referencedAssetIds({ "notes.txt": strToU8(`/v1/assets/${ID_A}`) })).toEqual([]);
    expect(referencedAssetIds({ "a.json": strToU8(`/v1/assets/${"d".repeat(63)} and /v1/assets/${"e".repeat(65)}`) })).toEqual([]);
  });
});

describe("a backup with its pictures", () => {
  it("export adds the bytes and an index, and counts the pictures the store lost", async () => {
    const out = await addAssetsToBackup(b64(backup()), async (id) => store[id] ?? null);
    expect(out.included).toBe(2);
    expect(out.missing).toBe(1);
    const files = unzipSync(unb64(out.base64));
    expect([...files["assets/" + ID_A]!]).toEqual([1, 2, 3]);
    expect(JSON.parse(strFromU8(files["assets/index.json"]!))).toEqual({
      [ID_A]: { mime: "image/webp", name: "kit.webp" },
      [ID_B]: { mime: "image/png", name: null },
    });
    // the original files are untouched
    expect(strFromU8(files["settings.json"]!)).toBe("{}");
    expect(JSON.parse(strFromU8(files["characters/kit.json"]!)).gallery[0].url).toBe(`/v1/assets/${ID_A}`);
  });

  it("export leaves a backup with no pictures as it was, and survives a fetch that throws", async () => {
    const plain = b64(zipSync({ "settings.json": strToU8("{}") }));
    expect((await addAssetsToBackup(plain, async () => { throw new Error("no"); })).base64).toBe(plain);
    const out = await addAssetsToBackup(b64(backup()), async () => { throw new Error("offline"); });
    expect(out).toMatchObject({ included: 0, missing: 3 });
  });

  it("import puts each picture back with its type and returns the zip without them", async () => {
    const withPictures = unb64((await addAssetsToBackup(b64(backup()), async (id) => store[id] ?? null)).base64);
    const put: AssetBytes[] = [];
    const out = await restoreBackupAssets(withPictures, async (a) => { put.push(a); return a.bytes.length !== 2; });
    expect(out.restored).toBe(1);
    expect(out.failed).toBe(1);
    expect(put.map((a) => a.mime).sort()).toEqual(["image/png", "image/webp"]);
    expect(put.find((a) => a.mime === "image/webp")).toMatchObject({ name: "kit.webp" });
    const left = unzipSync(out.zip);
    expect(Object.keys(left).sort()).toEqual(["characters/kit.json", "chats/kit/talk.jsonl", "library.json", "settings.json"]);
  });

  it("import hands back a zip without pictures untouched, and a non-zip for the import to report", async () => {
    const plain = backup();
    expect((await restoreBackupAssets(plain, async () => true)).zip).toBe(plain);
    const junk = new Uint8Array([1, 2, 3, 4]);
    expect((await restoreBackupAssets(junk, async () => true)).zip).toBe(junk);
  });
});

describe("character sprite folders in a library zip", () => {
  const lib = () => zipSync({
    "data/default-user/characters/Seraphina.png": new Uint8Array([1]),
    "data/default-user/characters/Seraphina/joy.png": new Uint8Array([2, 2]),
    "data/default-user/characters/Seraphina/anger.WEBP": new Uint8Array([3]),
    "data/default-user/characters/Kit/neutral.jpg": new Uint8Array([4]),
    "data/default-user/characters/Kit/readme.txt": strToU8("not a picture"),
    "data/default-user/worlds/book.json": strToU8("{}"),
  }, { level: 0 });
  const fakeStore = async (blobs: [string, Blob][]) => Object.fromEntries(blobs.map(([k, b]) => [k, `/v1/assets/${"f".repeat(63)}${b.type.length % 10}`]));

  it("stores the pictures, groups them by folder and leaves the rest of the zip", async () => {
    const seen: [string, string][] = [];
    const out = await extractSprites(lib(), async (blobs) => { for (const [k, b] of blobs) seen.push([k, b.type]); return fakeStore(blobs); });
    expect(out.count).toBe(3);
    expect(Object.keys(out.sprites).sort()).toEqual(["Kit", "Seraphina"]);
    expect(Object.keys(out.sprites.Seraphina!).sort()).toEqual(["anger", "joy"]);
    expect(seen.find(([k]) => k === "Seraphina\u0000anger")?.[1]).toBe("image/webp");
    const left = Object.keys(unzipSync(out.zip)).sort();
    expect(left).toEqual(["data/default-user/characters/Kit/readme.txt", "data/default-user/characters/Seraphina.png", "data/default-user/worlds/book.json"]);
  });

  it("a zip without sprite folders comes back as it was, and the store is not asked", async () => {
    const plain = zipSync({ "characters/a.json": strToU8("{}") }, { level: 0 });
    let asked = 0;
    const out = await extractSprites(plain, async () => { asked++; return {}; });
    expect(out.zip).toBe(plain);
    expect(out.count).toBe(0);
    expect(asked).toBe(0);
  });
});

describe("a library zip cut into requests the bridge accepts", () => {
  // random bytes do not compress, so a part is as big as it looks
  const noise = (n: number, _seed: number) => new Uint8Array(randomBytes(n));
  const names = (z: Uint8Array) => Object.keys(unzipSync(z)).sort();

  it("a small library is one part, and its media outside characters/ is left out", () => {
    const zip = zipSync({
      "characters/Ann.png": new Uint8Array([1, 2]),
      "characters/Ann/joy.png": new Uint8Array([3]),
      "backgrounds/room.jpg": new Uint8Array([4]),
      "worlds/book.json": strToU8("{}"),
      "chats/Ann/talk.jsonl": strToU8("{}\n"),
    }, { level: 0 });
    const out = splitLibrary(zip);
    expect(out.dropped).toBe(2); // the sprite and the background
    expect(out.parts).toHaveLength(1);
    expect(names(out.parts[0]!.zip)).toEqual(["characters/Ann.png", "chats/Ann/talk.jsonl", "worlds/book.json"]);
  });

  it("an untouched small zip comes back as it was", () => {
    const zip = zipSync({ "worlds/a.json": strToU8("{}"), "chats/x/a.jsonl": strToU8("{}\n") }, { level: 0 });
    const out = splitLibrary(zip);
    expect(out.parts).toHaveLength(1);
    expect(out.parts[0]!.zip).toBe(zip);
    expect(out.dropped).toBe(0);
  });

  it("splits by size in the order cards, the rest, chats, and keeps a chat with its sidecars", () => {
    const zip = zipSync({
      "characters/B.png": noise(600, 1),
      "characters/A.png": noise(600, 2),
      "worlds/book.json": strToU8(JSON.stringify({ name: "Book" })),
      "presets/p.json": strToU8("{}"),
      "chats/A/one.jsonl": noise(500, 3),
      "chats/A/one.meta.json": strToU8("{}"),
      "chats/A/one.memories.json": strToU8("[]"),
      "chats/A/two.jsonl": noise(500, 4),
    }, { level: 0 });
    const { parts } = splitLibrary(zip, 1000);
    const listed = parts.map((p) => names(p.zip));
    // cards come first (A before B), then the books and presets together, then the chats
    expect(listed.flat().indexOf("characters/A.png")).toBeLessThan(listed.flat().indexOf("characters/B.png"));
    expect(listed.flat().indexOf("characters/B.png")).toBeLessThan(listed.flat().indexOf("worlds/book.json"));
    expect(listed.flat().indexOf("presets/p.json")).toBeLessThan(listed.flat().indexOf("chats/A/one.jsonl"));
    // the books and presets share a part, and the sidecars sit with their chat
    expect(listed.findIndex((l) => l.includes("worlds/book.json"))).toBe(listed.findIndex((l) => l.includes("presets/p.json")));
    const one = listed.findIndex((l) => l.includes("chats/A/one.jsonl"));
    expect(listed[one]).toContain("chats/A/one.meta.json");
    expect(listed[one]).toContain("chats/A/one.memories.json");
    expect(parts.length).toBeGreaterThan(2);
    // every entry lands in exactly one part
    expect(listed.flat().sort()).toEqual(Object.keys(unzipSync(zip)).sort());
  });

  it("one file over the budget gets a part of its own", () => {
    const zip = zipSync({ "chats/A/huge.jsonl": noise(5000, 9), "chats/A/small.jsonl": strToU8("{}\n") }, { level: 0 });
    const { parts } = splitLibrary(zip, 1000);
    expect(parts.map((p) => names(p.zip))).toEqual([["chats/A/huge.jsonl"], ["chats/A/small.jsonl"]]);
  });
});
