/**
 * #184: once embedding works, the tick asks for the missing vectors of every chat and Data Bank file by itself
 * (a look every 5 minutes, 300,000 tokens at most for one target and for one look, a switch, never while failing).
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { L, env, useRoot, story, writeChat, writeJson, readJson, exists, mockHost, tick } from "./rp-memory-m2-kit";

useRoot();

const fact = (id: string, text: string) => ({ id, text, subject: "world", knownBy: "all", type: "event", weight: "everyday", pinned: false, status: "active", origin: "migrated", at: 1, updatedAt: 1 });
function chat(chatId: string, m: ReturnType<typeof mockHost>, facts = 3, size = 30) {
  writeChat(chatId, story(12));
  const st = L.emptyChat(chatId);
  st.migrated = true;
  st.facts = Array.from({ length: facts }, (_, i) => fact("f" + i, `Fact ${i} of ${chatId}: ` + "x".repeat(size)));
  L.saveChatFile(m.host.fs, st);
}
const bankFile = (id: string, texts: string[]) =>
  writeJson(`databank/${id}.json`, { id, name: id, scope: "global", enabled: true, addedAt: 1, size: 1, chunks: texts.map((text, i) => ({ i, text })) });
const primed = () => writeJson(".cache/litopys/embed-status.json", { ok: true, checkedAt: Date.now(), model: "mock-embed", via: "Mock", dim: 2 });
const cfg = (over: Record<string, unknown> = {}) => ({ ...L.DEFAULT_CONFIG, ...over });
const wants = () => (exists("litopys/embed-want") ? fs.readdirSync(path.join(env.root, "litopys/embed-want")).sort() : []);

describe("autoEmbedScan", () => {
  it("does nothing before an embeddings call has worked, and nothing with the switch off", () => {
    const m = mockHost();
    chat("a1", m);
    expect(L.autoEmbedScan(m.host.fs, m.host, cfg())).toBe(0);
    primed();
    expect(L.autoEmbedScan(m.host.fs, m.host, cfg({ autoEmbed: false }))).toBe(0);
    expect(wants()).toEqual([]);
  });

  it("asks for every chat and file with gaps once embedding has worked", () => {
    const m = mockHost();
    chat("a2", m);
    chat("a3", m);
    bankFile("lore", ["The pendant is in the cellar."]);
    primed();
    expect(L.autoEmbedScan(m.host.fs, m.host, cfg())).toBe(3);
    expect(wants()).toEqual(["a2.json", "a3.json", "db_lore.json"]);
  });

  it("the engine's own status (a reply embedded its scan window) counts as embedding working", () => {
    const m = mockHost();
    chat("a4", m);
    writeJson(".cache/embed-status.json", { ok: true, checkedAt: Date.now() });
    expect(L.autoEmbedScan(m.host.fs, m.host, cfg())).toBe(1);
  });

  it("not while the last call failed (for an hour), and not while a request is running", () => {
    const m = mockHost();
    chat("a5", m);
    writeJson(".cache/litopys/embed-status.json", { ok: false, checkedAt: Date.now(), model: "mock-embed" });
    expect(L.autoEmbedScan(m.host.fs, m.host, cfg())).toBe(0);
    primed();
    writeJson("litopys/embed-want/other.json", { more: true, at: Date.now(), batch: [] });
    expect(L.autoEmbedScan(m.host.fs, m.host, cfg())).toBe(0);
  });

  it("looks at most every five minutes", () => {
    const m = mockHost();
    chat("a6", m);
    primed();
    const t0 = Date.now();
    expect(L.autoEmbedScan(m.host.fs, m.host, cfg(), t0)).toBe(1);
    expect(L.autoEmbedScan(m.host.fs, m.host, cfg(), t0 + 60000)).toBe(0);
    // the request is carried out, then a new chat appears: the next look finds it
    fs.rmSync(path.join(env.root, "litopys/embed-want"), { recursive: true, force: true });
    chat("a7", m);
    expect(L.autoEmbedScan(m.host.fs, m.host, cfg(), t0 + 6 * 60000)).toBe(2);
  });

  it("a target over 300,000 tokens stays a button, and one look asks for 300,000 at most in all", () => {
    const m = mockHost();
    primed();
    chat("big", m, 1, 1_300_000); // about 325,000 tokens
    chat("c1", m, 1, 800_000); // about 200,000
    chat("c2", m, 1, 800_000);
    chat("c3", m, 1, 100);
    L.autoEmbedScan(m.host.fs, m.host, cfg());
    const asked = wants();
    expect(asked).not.toContain("big.json");
    expect(asked).toContain("c1.json");
    expect(asked).not.toContain("c2.json"); // 200,000 + 200,000 would pass the limit of one look
    expect(asked).toContain("c3.json");
  });

  it("the tick does it: one chat per tick, the vectors are stored, a second look finds nothing", () => {
    const m = mockHost();
    chat("t1", m, 3);
    bankFile("lore", ["The pendant is in the cellar."]);
    primed();
    m.host.llm.embedInfo = { lit_emb_t1: { model: "mock-embed", via: "Mock" }, lit_db_lore: { model: "mock-embed", via: "Mock" } };
    for (let i = 0; i < 4; i++) tick(m);
    expect(Object.keys(readJson(".cache/litopys/vectors/t1.json"))).toHaveLength(3);
    expect(Object.keys(readJson(".cache/databank-vectors/lore.json").chunks)).toHaveLength(1);
    expect(L.autoEmbedScan(m.host.fs, m.host, cfg(), Date.now() + 6 * 60000)).toBe(0);
  });

  it("the switch is part of the config and survives the sanitizer", () => {
    expect(L.DEFAULT_CONFIG.autoEmbed).toBe(true);
    const m = mockHost();
    const r = L.handleRoute({ method: "PUT", path: "/litopys/config", body: { autoEmbed: false } }, m.host);
    expect(r.json.autoEmbed ?? readJson("litopys/config.json").autoEmbed).toBe(false);
  });
});
