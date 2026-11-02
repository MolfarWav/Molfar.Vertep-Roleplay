/**
 * Recall bench at 500 / 2000 / 5000 messages (issue #184, P0 last part). Not for correctness: it measures what the Litopys
 * insert (the 800-token budget) carries when the player asks about something that happened long ago, and how that changes
 * as the chat grows, so the owner can decide whether verbatim recall of old passages (merged-order step 8) and
 * chunk vectors (DB-vec) are worth building.
 *
 * The chat is the synthetic group chat of rp-longchat-bench (5 characters, a chapter every 15 messages, 5 facts each), but
 * every fact and chapter says something of its own, built from word tables (stored word <-> paraphrase, no shared stem):
 *   fact     "Bram hides the old silver locket in the cellar."
 *   chapter  "The company reached the harbour, where Edda mends the lantern."
 * The probes are questions whose answer is one fact or one chapter, in three wordings:
 *   echo     the stored words ("Where did Bram hide the old silver locket?"), the lexical best case
 *   partial  the object word kept, the rest paraphrased
 *   para     every content word paraphrased, only the name kept ("Where did Bram conceal the ancient argent pendant?")
 * The probe targets are the same facts and chapters at every size (all from the first 270 messages), so a drop between sizes
 * is the effect of the chat growing, not of different questions.
 *
 * Three ways of ranking: `words` (what Litopys does without vectors), and two MOCK embedders (`vec good` and `vec weak`):
 * a word vector is a mix of its concept's vector and its own, so a paraphrase is near but not equal, plus per-text noise.
 * They are NOT a real embedding model: they show what a decent and a poor embedder could rescue, not what one does.
 *
 * Reported per cell: MRR over the whole ranking (is the answer found at all), and `in prompt` = the share of probes whose
 * answer is in the insert that reaches the model, with the mean 1/position for facts (the insert lists facts in rank order).
 * The table prints with `bun test test/rp-recall-mrr-bench.test.ts`; the asserts only catch a collapse.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { L, useRoot } from "./rp-memory-m2-kit";
import { ACTORS, ADJECTIVES, EMBEDDERS, EVERY, KINDS, MODES, OBJECTS, PLACES, USER, TARGET_CHAPTERS, VERBS, chapterQuestion, factQuestion, rng, world, type Kind, type Mode } from "./rp-recall-world";

useRoot();

// ---------- the chat at size n ----------
function chatAt(n: number) {
  const chapters = Math.floor(n / EVERY);
  const { facts, chaps } = world(chapters);
  const msgs = Array.from({ length: n }, (_, i) => (i % 6 === 0 ? { id: "m" + i, role: "user" as const, name: USER, text: "Jude speaks, turn " + i } : { id: "m" + i, role: "char" as const, name: ACTORS[i % 5]!, text: ACTORS[i % 5] + " answers, turn " + i, swipe: 0 }));
  const line = L.activeLine(msgs);
  const st = L.emptyChat("hall");
  st.migrated = true;
  st.chapters = chaps.map((c, i) => {
    const a = i * EVERY;
    const b = a + EVERY - 1;
    return { id: c.id, from: "m" + a, to: "m" + b, count: EVERY, sig: L.chapterSig(line.slice(a, b + 1)), label: "Scene " + c.n, text: c.text, kind: "scene", at: c.n };
  });
  st.facts = facts.map((f, i) => ({ id: f.id, text: f.text, subject: f.slots.a, knownBy: "all", type: "event", weight: "everyday", status: "active", at: 1, updatedAt: i + 1, src: { chapter: "c" + f.chapter } }));
  st.counters.chapter = chaps.length;
  st.counters.fact = facts.length;
  return { msgs, line, st, facts, chaps };
}

const cfg = () => ({ ...L.DEFAULT_CONFIG, recentMessages: 100, budget: 800, budgetMode: "fixed" });
const filler = (line: any[]) => line.slice(-2).map((m) => m.text).join("\n");

type Cell = { carried: number; pool: number; n: number; mode: string; kind: Kind; factMrr: number; factInPrompt: number; factPos: number; chapMrr: number; chapInPrompt: number; tokens: number };

/** Search words (`also`) for the "words + also" rows: the oracle is the probe's own paraphrase words (a ceiling no model reaches: it is the answer key),
 *  each other row is what a real model wrote for the same texts under the worker's SEARCH_RULE (test/fixtures/recall-also.<tag>.json, made by
 *  scripts/recall-also.ts). Both go through the plugin's own cleanAlso, as the worker does. */
const FIXTURES = path.join(import.meta.dir, "fixtures");
const modelAlso: Record<string, Record<string, string[]>> = {};
for (const f of fs.readdirSync(FIXTURES)) {
  const m = /^recall-also\.(.+)\.json$/.exec(f);
  if (m) modelAlso["words+also " + m[1]] = JSON.parse(fs.readFileSync(path.join(FIXTURES, f), "utf8"));
}
const ALSO_VARIANTS = ["words+also oracle", ...Object.keys(modelAlso).sort()];
function withAlso(st: any, variant: string, facts: ReturnType<typeof world>["facts"], chaps: ReturnType<typeof world>["chaps"]) {
  const pick = (text: string, oracle: string[]) => L.cleanAlso(variant === "words+also oracle" ? oracle : modelAlso[variant]![text] ?? [], text);
  return {
    ...st,
    facts: st.facts.map((f: any, i: number) => ({ ...f, also: pick(f.text, [facts[i]!.slots.v.p, facts[i]!.slots.adj.p, facts[i]!.slots.o.p, facts[i]!.slots.pl.p]) })),
    chapters: st.chapters.map((c: any, i: number) => ({ ...c, also: pick(c.text, [chaps[i]!.v.p, chaps[i]!.o.p, chaps[i]!.pl.p]) })),
  };
}

function measure(n: number): Cell[] {
  const { line, st: st0, facts, chaps } = chatAt(n);
  const rand = rng(77);
  const factTargets = facts.filter((f) => f.chapter <= TARGET_CHAPTERS);
  const chapTargets = chaps.filter((c) => c.n <= TARGET_CHAPTERS);
  const shuffled = <T>(list: T[]) => list.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const fp = shuffled(factTargets).slice(0, 40);
  const cp = shuffled(chapTargets).slice(0, 12);
  const share = L.chatWordShare(line);
  const cells: Cell[] = [];
  for (const mode of [...MODES, ...ALSO_VARIANTS] as string[]) {
    const embed = (EMBEDDERS as Record<string, ((t: string) => number[]) | null>)[mode] ?? null;
    const st = ALSO_VARIANTS.includes(mode) ? withAlso(st0, mode, facts, chaps) : st0;
    const vectors = embed ? Object.fromEntries([...st.facts, ...st.chapters].map((x: any) => [x.id, { hash: L.fnv1a(x.text), vector: embed(x.text) }])) : undefined;
    for (const kind of KINDS) {
      let fMrr = 0, fIn = 0, fPos = 0, cMrr = 0, cIn = 0, tokens = 0, calls = 0, carried = 0, pool = 0;
      const run = (question: string) => {
        const scanText = filler(line) + "\n" + question;
        const scanVec = embed ? embed(scanText) : undefined;
        const res = L.buildInsert({ st, line, dash: null, meta: { userName: USER }, cfg: cfg(), scanText, speakerName: "", used: {}, scanVec, vectors });
        tokens += res ? res.tokens : 0;
        carried += res ? res.factIds.length : 0;
        calls++;
        return { res, scanText, scanVec };
      };
      fp.forEach((f, i) => {
        const { res, scanText, scanVec } = run(factQuestion(f, kind, i));
        const at = res ? res.factIds.indexOf(f.id) : -1;
        if (at >= 0) {
          fIn++;
          fPos += 1 / (at + 1);
        }
        // the whole ranking, before the budget: is the answer found at all
        const eligible = st.facts.filter((x: any) => !(x.src && Number(x.src.chapter.slice(1)) * EVERY > line.length - 100));
        pool = eligible.length;
        const ranked = L.rankFacts(eligible, scanText, undefined, embed ? { vec: scanVec, of: (x: any) => vectors![x.id].vector } : undefined, { share });
        const r = ranked.findIndex((x: any) => x.id === f.id);
        fMrr += r >= 0 ? 1 / (r + 1) : 0;
      });
      cp.forEach((c, i) => {
        const { res, scanText, scanVec } = run(chapterQuestion(c, kind, i));
        if (res && (res.head + "\n" + res.tail).includes(c.text)) cIn++;
        const earlier = st.chapters.filter((x: any) => x.at * EVERY <= line.length - 100);
        const ranked = L.rankChapters(earlier, scanText, embed ? { vec: scanVec, of: (x: any) => vectors![x.id].vector } : undefined, { share });
        const r = ranked.findIndex((x: any) => x.id === c.id);
        cMrr += r >= 0 ? 1 / (r + 1) : 0;
      });
      cells.push({ n, mode, kind, factMrr: fMrr / fp.length, factInPrompt: fIn / fp.length, factPos: fPos / fp.length, chapMrr: cMrr / cp.length, chapInPrompt: cIn / cp.length, tokens: Math.round(tokens / calls), carried: Math.round(carried / calls), pool });
    }
  }
  return cells;
}

describe("recall bench: the paraphrase tables", () => {
  it("a paraphrase shares no word with its stored one, and no two entries of the tables clash", () => {
    const all = [...OBJECTS, ...PLACES, ...VERBS, ...ADJECTIVES];
    const words = all.flatMap((pr) => [pr.s, pr.sb, pr.p, pr.pb].filter(Boolean).map((w) => [w as string, pr.s] as const));
    // Litopys' own word match decides: two words of different entries must never count as the same word
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const [x, ex] = words[i]!;
        const [y, ey] = words[j]!;
        if (ex !== ey && L.sameWordM3b(x, y)) throw new Error(`word clash: ${x} (${ex}) and ${y} (${ey})`);
      }
    }
    for (const pr of all) {
      expect(L.sameWordM3b(pr.s, pr.p)).toBe(false);
      if (pr.sb) expect(L.sameWordM3b(pr.sb, pr.pb!)).toBe(false);
    }
    expect(OBJECTS.length * PLACES.length).toBeGreaterThan(2000);
  });

  it("the world is the same prefix at every size, and a question has one right answer", () => {
    const small = world(33);
    const big = world(333);
    expect(big.facts.slice(0, small.facts.length).map((f) => f.text)).toEqual(small.facts.map((f) => f.text));
    const f = small.facts[3]!;
    expect(factQuestion(f, "para", 0)).not.toContain(f.slots.o.s);
    expect(factQuestion(f, "partial", 0)).toContain(f.slots.o.s);
    expect(factQuestion(f, "echo", 1)).toContain(f.slots.pl.s);
    // a para question shares no content word with its fact except the name
    const content = (t: string) => (L.wordTokensM3b(t) as string[]).filter((w) => w.length > 3);
    const shared = content(factQuestion(f, "para", 1)).filter((w) => content(f.text).some((x) => L.sameWordM3b(w, x)));
    expect(shared).toEqual([f.slots.a.toLowerCase()]);
  });
});

describe("recall bench: 500 / 2000 / 5000 messages", () => {
  const all: Cell[] = [];
  for (const n of [500, 2000, 5000]) {
    it(`${n} messages`, () => {
      const cells = measure(n);
      all.push(...cells);
      const get = (mode: string, kind: Kind) => cells.find((c) => c.mode === mode && c.kind === kind)!;
      // a collapse only: the exact words must still bring the answer into the prompt; vectors must not hurt the paraphrase
      expect(get("words", "echo").factInPrompt).toBeGreaterThan(0.5);
      expect(get("words", "echo").chapInPrompt).toBeGreaterThan(0.3);
      expect(get("vec good", "para").factMrr).toBeGreaterThanOrEqual(get("words", "para").factMrr);
      if (n === 5000) {
        const pct = (x: number) => String(Math.round(x * 100)).padStart(3) + "%";
        const lines = ["", "recall bench: fact / chapter probes, same targets at every size (MRR over the whole ranking; in prompt = answer in the 800-token insert; pos = mean 1/position of the fact in the insert)"];
        lines.push("   size | mode              | wording | fact MRR | fact in prompt | fact pos | chapter MRR | chapter in prompt | insert tok | facts in insert / pool");
        for (const c of all) {
          lines.push(`${String(c.n).padStart(6)} | ${c.mode.padEnd(17)} | ${c.kind.padEnd(7)} | ${c.factMrr.toFixed(2).padStart(8)} | ${pct(c.factInPrompt).padStart(14)} | ${c.factPos.toFixed(2).padStart(8)} | ${c.chapMrr.toFixed(2).padStart(11)} | ${pct(c.chapInPrompt).padStart(17)} | ${String(c.tokens).padStart(10)} | ${c.carried} / ${c.pool}`);
        }
        console.log(lines.join("\n"));
      }
    }, 300_000);
  }
});
