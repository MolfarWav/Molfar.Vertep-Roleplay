/**
 * Stand for #264 PR B: can the MEANING of a scene find the right chapter of an older chat of the same story, and can that
 * decide whether to look into the old chat at all? It runs on the owner's machine over the owner's real chats and prints
 * numbers only: no chat text, no card names. Nothing here ships; it is a measuring tool.
 *
 * Three steps (the embedding step is the same tool as the recall bench, `scripts/recall-embed.ts`):
 *
 *   1. bun scripts/chapter-gate-stand.ts dump <data folder of the Roleplay app> /tmp/gate-texts.json [--probes 40] [--split]
 *        The data folder is the one with `chats/` and `litopys/` (data/users/<name>/apps/roleplay/data in the engine folder).
 *        `--split` also cuts each long chat that continues nothing in two (the first ~60%, ending at a chapter border, stands for
 *        an earlier chat; the probes come from the rest), for an owner who has no chains yet; `--split-all` does it for every chat.
 *        It reads the folder only. The output file HOLDS CHAT TEXT: keep it on this machine and delete it afterwards.
 *   2. bun scripts/recall-embed.ts bge-m3 /tmp/gate-texts.json --lib <path to @huggingface/transformers> --tag gate-bge-m3
 *        (any preset of that script; embeds the chapter texts and the scene windows with a real model; no network but the
 *        model download.) The result lands in test/fixtures/recall-vec/gate-bge-m3.json (gitignored).
 *   3. bun scripts/chapter-gate-stand.ts score /tmp/gate-texts.json test/fixtures/recall-vec/gate-bge-m3.json
 *        Prints the numbers. These are the only thing to paste back.
 *
 * What is measured. A probe is the window the engine really scans (the last three messages) at evenly spread points of a chat
 * that continues others. Its "word hit" is what the shipped rule finds: a chunk of an earlier chat of the chain that shares
 * enough rare words (`recallCandidates`); the chunk's chapter is the word-found chapter. The pool of one probe is every chapter
 * of the earlier chats of its chain. Per probe: the cosine to every pool chapter, the z-score of the best one against the pool
 * (the same "relative to the pool" the Data Bank uses, because models disagree on what "unrelated" scores), and where the
 * word-found chapter ranks.
 *
 *   - agreement: where the words found something, do the vectors put that chapter first (or in the first 3, 5)?
 *   - gate: the z of the best chapter for word-hit probes against the probes the words found nothing for. If those two
 *     distributions overlap, a vector-only gate would open the old chat in every reply (the Data Bank calibration said so).
 *   - rate: for a few z lines, how many of each kind would open the old chat. The second kind is where meaning could add
 *     something the words missed, or only noise: only reading the listed spots can tell, so the listing gives ids, never text.
 */
import fs from "node:fs";
import path from "node:path";
import { activeLine, loadChatFile, loadLinks, readChat, recallBuild, recallCandidates, recallChain, recallStemsOf, rangeOf } from "../plugins/litopys/plugin.js";

const SCAN_MESSAGES = 3;
const MIN_POOL = 4;

type Fsx = { read(p: string): string; write(p: string, c: string): void; list(p?: string): string[]; remove(p: string): void };

/** A read-only view of the app's data folder, in the shape the plugin expects. */
export function readOnlyFs(root: string): Fsx {
  return {
    read: (rel) => fs.readFileSync(path.resolve(root, rel), "utf8"),
    write: () => {},
    list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
    remove: () => {},
  };
}

export interface StandProbe {
  /** The chat the window comes from, and the position of the window's last message in its active line. */
  chat: string;
  pos: number;
  /** Index into `docs` of the chapters the word rule found (empty: the words found nothing). */
  wordDocs: number[];
  /** Indexes into `docs`: the chapters this probe may find (its pool). */
  pool: number[];
  /** "chain" = the chapters of the earlier chats of its chain; "split" = the earlier part of the same chat. */
  kind: "chain" | "split";
}
export interface StandDump {
  v: 2;
  /** Texts for the embedder (recall-embed's shape). */
  doc: string[];
  query: string[];
  /** Per chapter text: the chat it belongs to and its id. */
  docs: { chat: string; id: string }[];
  /** Per probe, in the order of `query` (q = its index there). */
  probes: (StandProbe & { q: number })[];
  /** Chat -> the chats before it in its chain, nearest first. */
  chains: Record<string, string[]>;
  /** Chats cut in two (first part = the "earlier chat", second part = the probes). */
  splits: number;
  skipped: { noChapters: number; shortScan: number };
}

const textOf = (m: { name?: string; text?: string }) => String(m.text ?? "").replace(/\s+/g, " ").trim();

export interface DumpOptions {
  probesPerChat?: number;
  /** Also cut each long chat that continues nothing (or, with `splitAll`, every chat) in two: the first 60% stands for an earlier chat. */
  split?: boolean;
  splitAll?: boolean;
}

/** Reads the chats and builds the probes and the pool. Pure over `fsx`; writes nothing. */
export function dumpStand(fsx: Fsx, opts: DumpOptions | number = {}): StandDump {
  const o: DumpOptions = typeof opts === "number" ? { probesPerChat: opts } : opts;
  const probesPerChat = o.probesPerChat ?? 40;
  const links = loadLinks(fsx);
  const doc: string[] = [];
  const docs: StandDump["docs"] = [];
  const docIndex = new Map<string, number>(); // "chat:id" -> doc index
  const chains: Record<string, string[]> = {};
  const probes: StandDump["probes"] = [];
  const query: string[] = [];
  const skipped = { noChapters: 0, shortScan: 0 };
  let splits = 0;

  const chaptersOf = (chatId: string) => {
    const st = loadChatFile(fsx, chatId);
    return (st && Array.isArray(st.chapters) ? st.chapters : []).filter((c: any) => c && !c.stale && typeof c.text === "string" && c.text.trim());
  };
  const indexChapters = (chatId: string, only?: (c: any) => boolean) => {
    const out: number[] = [];
    for (const c of chaptersOf(chatId)) {
      if (only && !only(c)) continue;
      const key = chatId + ":" + c.id;
      if (!docIndex.has(key)) {
        docIndex.set(key, doc.length);
        doc.push(c.text);
        docs.push({ chat: chatId, id: String(c.id) });
      }
      out.push(docIndex.get(key)!);
    }
    return out;
  };
  /** The chunks of one chat (before position `before`, when given) with the chapter every chunk lies in. */
  const chunksOf = (id: string, before?: number) => {
    const rc = readChat(fsx, id);
    if (!rc) return null;
    const st = loadChatFile(fsx, id);
    const line = activeLine(rc.msgs);
    const built = recallBuild(rc.msgs, st);
    const idxOf = new Map(line.map((m: any, i: number) => [m.id, i]));
    const chaps = chaptersOf(id).map((c: any) => ({ c, r: rangeOf(c, line) })).filter((x: any) => !x.r.orphan);
    const chapterOfChunk = (chunk: any) => {
      const at = idxOf.get(chunk.a);
      if (at === undefined || (before !== undefined && at >= before)) return null;
      const hit = chaps.find((x: any) => at >= x.r.fromIdx && at <= x.r.toIdx);
      return hit ? hit.c : null;
    };
    return { id, built, chapterOfChunk };
  };
  /** Probes from `line` at positions from..end, scored against `earlier` (chunk sources) and the pool. */
  const addProbes = (chatId: string, line: any[], from: number, pool: number[], earlier: (ReturnType<typeof chunksOf>)[], kind: "chain" | "split") => {
    const span = line.length - from;
    if (span <= 0) return;
    const n = Math.min(probesPerChat, span);
    for (let k = 0; k < n; k++) {
      const pos = from + Math.floor((k * span) / n);
      const text = line.slice(Math.max(0, pos - SCAN_MESSAGES + 1), pos + 1).map(textOf).filter(Boolean).join("\n");
      const stems = recallStemsOf(text);
      if (stems.length < 3) {
        skipped.shortScan += 1;
        continue;
      }
      const wordDocs = new Set<number>();
      for (const e of earlier) {
        if (!e) continue;
        const index = { n: e.built.chunks.length, p: e.built.p };
        for (const cand of recallCandidates(index, stems)) {
          const ch = e.chapterOfChunk(e.built.chunks[cand.i]);
          const di = ch ? docIndex.get(e.id + ":" + ch.id) : undefined;
          if (di !== undefined) wordDocs.add(di);
        }
      }
      probes.push({ chat: chatId, pos, wordDocs: [...wordDocs], pool, kind, q: query.length });
      query.push(text);
    }
  };

  for (const chatId of Object.keys(links)) {
    const chain = recallChain(fsx, chatId, links);
    if (!chain.length) continue;
    chains[chatId] = chain;
    const pool = chain.flatMap((id) => indexChapters(id));
    if (!pool.length) {
      skipped.noChapters += 1;
      continue;
    }
    const rc = readChat(fsx, chatId);
    if (!rc) continue;
    const line = activeLine(rc.msgs);
    addProbes(chatId, line, SCAN_MESSAGES, pool, chain.map((id) => chunksOf(id)), "chain");
  }

  if (o.split || o.splitAll) {
    let ids: string[] = [];
    try {
      ids = fsx.list("chats").filter((f) => f.endsWith(".meta.json")).map((f) => f.slice(0, -10));
    } catch {}
    for (const chatId of ids) {
      if (!o.splitAll && links[chatId]) continue; // it has a real chain already
      const rc = readChat(fsx, chatId);
      if (!rc) continue;
      const line = activeLine(rc.msgs);
      const ranged = chaptersOf(chatId)
        .map((c: any) => ({ c, r: rangeOf(c, line) }))
        .filter((x: any) => !x.r.orphan)
        .sort((a: any, b: any) => a.r.toIdx - b.r.toIdx);
      if (ranged.length < MIN_POOL + 2) continue;
      // cut at the end of the chapter nearest to 60% of the chat, so a chapter never lies across the cut
      const target = Math.floor(line.length * 0.6);
      const cutAfter = ranged.reduce((best: any, x: any) => (Math.abs(x.r.toIdx + 1 - target) < Math.abs(best.r.toIdx + 1 - target) ? x : best), ranged[0]);
      const cut = cutAfter.r.toIdx + 1;
      const before = ranged.filter((x: any) => x.r.toIdx < cut);
      if (before.length < MIN_POOL || line.length - cut < SCAN_MESSAGES * 3) continue;
      const ids2 = new Set(before.map((x: any) => String(x.c.id)));
      const pool = indexChapters(chatId, (c) => ids2.has(String(c.id)));
      splits += 1;
      addProbes(chatId + "~split", line, cut + SCAN_MESSAGES, pool, [chunksOf(chatId, cut)], "split");
      // the probes of a split carry the real chat id in `chat` for the listing, a marker for the pool
      chains[chatId + "~split"] = [chatId];
    }
  }
  return { v: 2, doc, query, docs, probes, chains, splits, skipped };
}

const cosine = (a: number[], b: number[]) => {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
};
const quantile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! : NaN);
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export const Z_LINES = [2.5, 3, 3.5, 4, 4.5];

export interface StandResult {
  probes: number;
  withPool: number;
  wordHit: number;
  noWordHit: number;
  poolMedian: number;
  agreement: { top1: number; top3: number; top5: number; medianRank: number; medianZ: number } | null;
  zWordHit: { p10: number; p50: number; p90: number } | null;
  zNoWordHit: { p10: number; p50: number; p90: number } | null;
  /** Chance that a word-hit probe's best z beats a no-word-hit probe's (0.5 = no separation). */
  auc: number | null;
  rates: { z: number; wordHit: number; noWordHit: number }[];
  /** Spots to read by hand: probes with no word hit whose best chapter reached the line. */
  spots: { chat: string; pos: number; chapterChat: string; chapter: string; z: number }[];
}

/** Scores a dump with the vectors of its texts ({ doc: {text: vec}, query: {text: vec} }). */
export function scoreStand(dump: StandDump, vecs: { doc: Record<string, number[]>; query: Record<string, number[]> }, spotLine = 3.5, spotCount = 10): StandResult {
  const res: StandResult = { probes: dump.probes.length, withPool: 0, wordHit: 0, noWordHit: 0, poolMedian: 0, agreement: null, zWordHit: null, zNoWordHit: null, auc: null, rates: [], spots: [] };
  const zHit: number[] = [];
  const zMiss: number[] = [];
  const ranks: number[] = [];
  const zOfFound: number[] = [];
  const poolSizes: number[] = [];
  const spotPool: StandResult["spots"] = [];
  for (const p of dump.probes) {
    const qv = vecs.query[dump.query[p.q]!];
    if (!qv) continue;
    const poolIdx = p.pool.filter((i) => vecs.doc[dump.doc[i]!]);
    if (poolIdx.length < MIN_POOL) continue;
    res.withPool += 1;
    poolSizes.push(poolIdx.length);
    const cos = poolIdx.map((i) => ({ i, c: cosine(vecs.doc[dump.doc[i]!]!, qv) }));
    const mean = cos.reduce((t, x) => t + x.c, 0) / cos.length;
    const sd = Math.sqrt(cos.reduce((t, x) => t + (x.c - mean) ** 2, 0) / cos.length);
    if (!(sd > 1e-6)) continue;
    const ordered = [...cos].sort((a, b) => b.c - a.c);
    const zBest = (ordered[0]!.c - mean) / sd;
    if (p.wordDocs.length) {
      res.wordHit += 1;
      zHit.push(zBest);
      let best = Infinity;
      for (const di of p.wordDocs) {
        const at = ordered.findIndex((x) => x.i === di);
        if (at >= 0) best = Math.min(best, at + 1);
      }
      if (Number.isFinite(best)) {
        ranks.push(best);
        const found = ordered[best - 1]!;
        zOfFound.push((found.c - mean) / sd);
      }
    } else {
      res.noWordHit += 1;
      zMiss.push(zBest);
      if (zBest >= spotLine) {
        const d = dump.docs[ordered[0]!.i]!;
        spotPool.push({ chat: p.chat, pos: p.pos, chapterChat: d.chat, chapter: d.id, z: round(zBest) });
      }
    }
  }
  const sortedHit = [...zHit].sort((a, b) => a - b);
  const sortedMiss = [...zMiss].sort((a, b) => a - b);
  res.poolMedian = quantile([...poolSizes].sort((a, b) => a - b), 0.5);
  const q = (s: number[]) => (s.length ? { p10: round(quantile(s, 0.1)), p50: round(quantile(s, 0.5)), p90: round(quantile(s, 0.9)) } : null);
  res.zWordHit = q(sortedHit);
  res.zNoWordHit = q(sortedMiss);
  if (ranks.length) {
    const sr = [...ranks].sort((a, b) => a - b);
    res.agreement = {
      top1: round(ranks.filter((r) => r === 1).length / ranks.length),
      top3: round(ranks.filter((r) => r <= 3).length / ranks.length),
      top5: round(ranks.filter((r) => r <= 5).length / ranks.length),
      medianRank: quantile(sr, 0.5),
      medianZ: round(quantile([...zOfFound].sort((a, b) => a - b), 0.5)),
    };
  }
  if (zHit.length && zMiss.length) {
    let wins = 0;
    for (const a of zHit) for (const b of zMiss) wins += a > b ? 1 : a === b ? 0.5 : 0;
    res.auc = round(wins / (zHit.length * zMiss.length));
  }
  res.rates = Z_LINES.map((z) => ({ z, wordHit: zHit.length ? round(zHit.filter((x) => x >= z).length / zHit.length) : 0, noWordHit: zMiss.length ? round(zMiss.filter((x) => x >= z).length / zMiss.length) : 0 }));
  // a fixed shuffle (the same spots every run for the same data)
  spotPool.sort((a, b) => ((a.pos * 2654435761) % 1000) - ((b.pos * 2654435761) % 1000));
  res.spots = spotPool.slice(0, spotCount);
  return res;
}

export function printStand(r: StandResult, dump: StandDump): string {
  const chats = Object.keys(dump.chains).filter((k) => !k.endsWith("~split")).length;
  const L: string[] = [];
  L.push(`chats with a chain: ${chats}, long chats cut in two: ${dump.splits}, chapters in pools: ${dump.docs.length}, probes: ${r.probes} (skipped: ${dump.skipped.noChapters} chats without chapters, ${dump.skipped.shortScan} short windows)`);
  L.push(`probes scored: ${r.withPool} (median pool ${r.poolMedian} chapters); words found something for ${r.wordHit}, nothing for ${r.noWordHit}`);
  L.push(r.agreement ? `agreement (where words found a chapter): vectors rank it first ${r.agreement.top1}, in the first 3 ${r.agreement.top3}, in the first 5 ${r.agreement.top5}; median rank ${r.agreement.medianRank}, median z ${r.agreement.medianZ}` : "agreement: no probe with a word hit inside the pool");
  L.push(`best-chapter z, probes with a word hit: ${r.zWordHit ? `p10 ${r.zWordHit.p10}, median ${r.zWordHit.p50}, p90 ${r.zWordHit.p90}` : "none"}`);
  L.push(`best-chapter z, probes with no word hit: ${r.zNoWordHit ? `p10 ${r.zNoWordHit.p10}, median ${r.zNoWordHit.p50}, p90 ${r.zNoWordHit.p90}` : "none"}`);
  L.push(`separation (chance a word-hit probe has the higher z; 0.5 = none, 1 = perfect): ${r.auc ?? "n/a"}`);
  L.push("share of probes that would open the old chat at a z line:");
  for (const x of r.rates) L.push(`  z >= ${x.z}: word-hit ${x.wordHit}, no-word-hit ${x.noWordHit}`);
  if (r.spots.length) {
    L.push("spots to read by hand (no word hit, best chapter at or above the line): chat, message position -> chapter of which chat, z");
    for (const s of r.spots) L.push(`  ${s.chat} #${s.pos} -> ${s.chapterChat} / ${s.chapter}  z ${s.z}`);
  }
  return L.join("\n");
}

if (import.meta.main) {
  const [cmd, a, b, c] = process.argv.slice(2).filter((x) => !x.startsWith("--"));
  const flag = (name: string) => {
    const i = process.argv.indexOf("--" + name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  if (cmd === "dump" && a && b) {
    const dump = dumpStand(readOnlyFs(a), { probesPerChat: Number(flag("probes")) || 40, split: process.argv.includes("--split"), splitAll: process.argv.includes("--split-all") });
    fs.writeFileSync(b, JSON.stringify(dump));
    console.log(`${dump.probes.length} probes, ${dump.doc.length} chapter texts, ${Object.keys(dump.chains).filter((k) => !k.endsWith("~split")).length} chats with a chain, ${dump.splits} cut in two. ${b} holds chat text: keep it here and delete it after the run.`);
  } else if (cmd === "score" && a && b) {
    const dump = JSON.parse(fs.readFileSync(a, "utf8")) as StandDump;
    const vecs = JSON.parse(fs.readFileSync(b, "utf8"));
    console.log(printStand(scoreStand(dump, vecs, Number(flag("spot-line")) || 3.5), dump));
  } else {
    console.error("usage:\n  bun scripts/chapter-gate-stand.ts dump <app data folder> <out.json> [--probes 40] [--split | --split-all]\n  bun scripts/chapter-gate-stand.ts score <out.json> <vectors.json> [--spot-line 3.5]");
    process.exit(1);
  }
  void c;
}
