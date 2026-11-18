// The composer's draft is written after a pause, not on every key (Molfar.Vertep#418).
import { beforeAll, beforeEach, describe, expect, it } from "bun:test";

const store = new Map<string, string>();
let writes = 0;
let drafts: any;

beforeAll(async () => {
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { writes++; store.set(k, v); },
    removeItem: (k: string) => void store.delete(k),
  };
  drafts = await import("../src/lib/drafts");
});
beforeEach(() => { drafts.flushDraft(); store.clear(); writes = 0; });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("draft saving", () => {
  it("a run of keys is one write, after the pause, and reads see the waiting text at once", async () => {
    for (const t of ["h", "he", "hel", "hell", "hello"]) drafts.saveDraft("A", t);
    expect(writes).toBe(0);
    expect(drafts.readDraft("A")).toBe("hello");
    await wait(drafts.DRAFT_SAVE_DELAY_MS + 80);
    expect(writes).toBe(1);
    expect(store.get(drafts.draftKey("A"))).toBe("hello");
  });

  it("flushDraft writes at once (blur, hidden page, reload)", () => {
    drafts.saveDraft("A", "half a thought");
    drafts.flushDraft();
    expect(store.get(drafts.draftKey("A"))).toBe("half a thought");
    drafts.flushDraft();
    expect(writes).toBe(1);
  });

  it("another chat's text writes the first one's, nothing is lost on a chat switch", () => {
    drafts.saveDraft("A", "in A");
    drafts.saveDraft("B", "in B");
    expect(store.get(drafts.draftKey("A"))).toBe("in A");
    expect(drafts.readDraft("B")).toBe("in B");
    drafts.flushDraft();
    expect(store.get(drafts.draftKey("B"))).toBe("in B");
  });

  it("an empty box removes the key at once and cancels a waiting write (sent, cleared)", async () => {
    drafts.saveDraft("A", "to send");
    drafts.flushDraft();
    drafts.saveDraft("A", "to send, edited");
    drafts.saveDraft("A", "");
    expect(store.has(drafts.draftKey("A"))).toBe(false);
    await wait(drafts.DRAFT_SAVE_DELAY_MS + 80);
    expect(store.has(drafts.draftKey("A"))).toBe(false);
    expect(drafts.readDraft("A")).toBe("");
  });

  it("discardDraft drops a saved and a waiting draft", () => {
    drafts.saveDraft("A", "saved");
    drafts.flushDraft();
    drafts.saveDraft("A", "waiting");
    drafts.discardDraft("A");
    expect(store.has(drafts.draftKey("A"))).toBe(false);
    expect(drafts.readDraft("A")).toBe("");
  });
});
