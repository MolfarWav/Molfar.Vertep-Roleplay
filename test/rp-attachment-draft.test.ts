// Unsent attachments survive a reload as small handles to the asset store (GitHub #31).
import { beforeAll, beforeEach, describe, expect, it } from "bun:test";

const store = new Map<string, string>();
let drafts: any;
const ID = "a".repeat(64);
const att = (n: string, url?: string) => ({ id: "att_" + n, name: n + ".png", type: "image/png", url: url ?? `/v1/assets/${ID}` });

beforeAll(async () => {
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  drafts = await import("../src/lib/drafts");
});
beforeEach(() => store.clear());

describe("attachment drafts", () => {
  it("a draft keeps the handle, never the bytes, and is kept per chat", () => {
    drafts.writeAttachmentDraft("A", [att("one"), att("big", "data:image/png;base64,AAAA")]);
    expect(store.get(drafts.attachmentsKey("A"))!.includes("data:")).toBe(false);
    expect(drafts.readAttachmentDraft("A").map((a: any) => a.id)).toEqual(["att_one"]);
    expect(drafts.readAttachmentDraft("B")).toEqual([]);
  });

  it("an empty draft removes the key", () => {
    drafts.writeAttachmentDraft("A", [att("one")]);
    drafts.writeAttachmentDraft("A", []);
    expect(store.has(drafts.attachmentsKey("A"))).toBe(false);
  });

  it("holds at most eight and ignores malformed or foreign entries", () => {
    drafts.writeAttachmentDraft("A", Array.from({ length: 12 }, (_, i) => att("n" + i)));
    expect(drafts.readAttachmentDraft("A")).toHaveLength(8);
    store.set(drafts.attachmentsKey("A"), JSON.stringify([att("ok"), { id: 1 }, att("x", "https://evil.example/x.png"), att("y", "/v1/assets/../etc"), null]));
    expect(drafts.readAttachmentDraft("A").map((a: any) => a.id)).toEqual(["att_ok"]);
    store.set(drafts.attachmentsKey("A"), "not json");
    expect(drafts.readAttachmentDraft("A")).toEqual([]);
  });

  it("a handle the engine no longer has (404) is dropped; an unreachable engine keeps it", async () => {
    const list = [att("gone"), att("here"), att("offline")];
    const head = async (_url: string) => ({ status: 200 });
    const answers: Record<string, number | "throw"> = { att_gone: 404, att_here: 200, att_offline: "throw" };
    let i = 0;
    const out = await drafts.liveAttachments(list, async () => {
      const a = answers[list[i++]!.id]!;
      if (a === "throw") throw new Error("offline");
      return { status: a };
    });
    expect(out.map((a: any) => a.id)).toEqual(["att_here", "att_offline"]);
    expect(await drafts.liveAttachments([], head)).toEqual([]);
  });
});
