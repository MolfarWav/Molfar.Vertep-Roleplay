/**
 * Shared helpers for the Litopys 2.0 tests (rp-memory-m2-*.test.ts): a temp
 * app data dir, chat and dashboard fixtures, a mock host, and `tick`, which
 * runs onTick the way the engine does (at most 3 passes; the answers to the
 * requests of one pass are visible only in the next).
 */
import { afterEach, beforeEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const litopysUrl = new URL("../plugins/litopys/plugin.js", import.meta.url).href;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const L = (await import(litopysUrl)) as Record<string, any>;

export const env = { root: "" };

/** A fresh temp dir as the app data dir for every test. */
export function useRoot() {
  beforeEach(() => {
    env.root = fs.mkdtempSync(path.join(os.tmpdir(), "m2-"));
    fs.mkdirSync(path.join(env.root, "chats"), { recursive: true });
  });
  afterEach(() => {
    try {
      fs.rmSync(env.root, { recursive: true, force: true });
    } catch {
      /* watcher races */
    }
  });
}

export const abs = (rel: string) => path.join(env.root, rel);
export const exists = (rel: string) => fs.existsSync(abs(rel));
export const readText = (rel: string) => fs.readFileSync(abs(rel), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const readJson = (rel: string): any => JSON.parse(readText(rel));
export function writeJson(rel: string, v: unknown) {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(v));
}

export type Msg = { id: string; role: "user" | "char"; name: string; text: string; hidden?: boolean; swipe?: number };
export const U = (id: string, text = "I look around the old mill."): Msg => ({ id, role: "user", name: "You", text });
export const A = (id: string, text = "Aria nods and waits by the door."): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });

/** n messages named m1..mn, alternating user / character, with distinct texts. */
export function story(n: number, prefix = "m"): Msg[] {
  return Array.from({ length: n }, (_, i) => {
    const id = prefix + (i + 1);
    return i % 2 === 0 ? U(id, `You say line ${i + 1} about the harvest.`) : A(id, `Aria answers line ${i + 1} about the harvest.`);
  });
}

export function writeChat(id: string, msgs: Msg[], meta: Record<string, unknown> = {}) {
  writeJson(`chats/${id}.meta.json`, { id, title: "Test", userName: "You", model: "chat/model", updatedAt: Date.now(), ...meta });
  fs.writeFileSync(abs(`chats/${id}.jsonl`), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}

export type Snap = { place?: string; day?: number; time?: string; present?: string[]; scene?: { new: boolean; label?: string } };
/** Dashboard snapshots keyed "<msgId>#0". */
export function writeDash(id: string, snaps: Record<string, Snap>) {
  const snapshots: Record<string, unknown> = {};
  for (const [msgId, s] of Object.entries(snaps)) {
    snapshots[`${msgId}#0`] = {
      clock: { day: s.day ?? 1, time: s.time ?? null, place: s.place ?? null },
      present: s.present ?? ["Aria"],
      ...(s.scene ? { scene: s.scene } : {}),
    };
  }
  writeJson(`dashboard/state/${id}.json`, { v: 2, chatId: id, snapshots });
}

/** The plugin's pure helpers want the line (an array of messages). */
export const line = (msgs: Msg[]) => L.activeLine(msgs);

export type Reply = string | { error: string };
type Sent = { key: string; req: Record<string, any> };
type SentEmbed = { key: string; texts: string[] };

export function mockHost(opts: { embed?: boolean; embedder?: (texts: string[]) => number[][] | null } = {}) {
  const results: Record<string, unknown> = {};
  const embedResults: Record<string, unknown> = {};
  const requests: Sent[] = [];
  const embeds: SentEmbed[] = [];
  const replies: Reply[] = [];
  const host: Record<string, any> = {
    fs: {
      read: (rel: string) => fs.readFileSync(path.resolve(env.root, rel), "utf8"),
      write: (rel: string, content: string) => {
        const full = path.resolve(env.root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(env.root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(env.root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: {
      request: (key: string, req: Sent["req"]) => requests.push({ key, req }),
      results,
      embedResults,
      ...(opts.embed === false ? {} : { embed: (key: string, req: { texts: string[] }) => embeds.push({ key, texts: req.texts }) }),
    },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
  return { host, results, embedResults, requests, embeds, replies, embedder: opts.embedder, logged: [] as string[] };
}
export type Mock = ReturnType<typeof mockHost>;

/**
 * One scheduled tick: onTick runs up to 3 passes; whatever a pass requested is
 * answered (replies in order for model calls, vectors for embeds) and visible to the
 * next pass only. Returns everything that was requested during the tick.
 */
export function tick(m: Mock, replies: Reply[] = []) {
  m.replies.push(...replies);
  const sent: Sent[] = [];
  const sentEmbeds: SentEmbed[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const r0 = m.requests.length;
    const e0 = m.embeds.length;
    L.onTick({ pluginId: "litopys" }, m.host);
    const newReq = m.requests.slice(r0);
    const newEmb = m.embeds.slice(e0);
    sent.push(...newReq);
    sentEmbeds.push(...newEmb);
    for (const k of Object.keys(m.results)) delete m.results[k];
    for (const k of Object.keys(m.embedResults)) delete m.embedResults[k];
    if (!newReq.length && !newEmb.length) break;
    for (const { key } of newReq) {
      const next = m.replies.shift();
      if (next === undefined) throw new Error("no scripted reply left for " + key);
      m.results[key] = typeof next === "string" ? { text: next, model: "mock/worker", usage: { input: 10, output: 5 }, genTimeMs: 7 } : { text: "", model: "error", error: next.error };
    }
    for (const { key, texts } of newEmb) m.embedResults[key] = m.embedder ? m.embedder(texts) : texts.map((_, i) => [0.1 * (i + 1), 0.5]);
  }
  return { requests: sent, embeds: sentEmbeds };
}

export type FactOp = Record<string, unknown>;
/** A worker reply as the model would send it. */
export const chapterReply = (label: string, text: string, facts: FactOp[] = []) => JSON.stringify({ chapter: { label, text }, facts });
