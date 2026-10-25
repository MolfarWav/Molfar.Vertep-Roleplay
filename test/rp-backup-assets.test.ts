// A studio backup carries the pictures its files point at (Molfar Vertep issue #89).
import { describe, expect, it } from "bun:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { addAssetsToBackup, referencedAssetIds, restoreBackupAssets, type AssetBytes } from "../src/lib/backup-assets";

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
