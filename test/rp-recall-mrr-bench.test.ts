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
import { L, useRoot } from "./rp-memory-m2-kit";

useRoot();

type Pair = { s: string; p: string; sb?: string; pb?: string };
const P = (s: string, p: string): Pair => ({ s, p });
const V = (s: string, sb: string, p: string, pb: string): Pair => ({ s, sb, p, pb });

const OBJECTS: Pair[] = [
  P("locket", "pendant"), P("dagger", "stiletto"), P("ledger", "register"), P("lantern", "torch"), P("goblet", "chalice"),
  P("compass", "wayfinder"), P("saddle", "harness"), P("cloak", "mantle"), P("ring", "signet"), P("scroll", "parchment"),
  P("crown", "diadem"), P("flute", "recorder"), P("hammer", "mallet"), P("barrel", "cask"), P("satchel", "knapsack"),
  P("banner", "pennant"), P("amulet", "talisman"), P("mirror", "reflector"), P("chest", "coffer"), P("candle", "taper"),
  P("helmet", "casque"), P("shield", "buckler"), P("sword", "rapier"), P("spear", "lance"), P("arrow", "bolt"),
  P("quiver", "holster"), P("whistle", "hooter"), P("boots", "footwear"), P("gloves", "gauntlets"), P("belt", "girdle"),
  P("necklace", "choker"), P("bracelet", "bangle"), P("brooch", "clasp"), P("key", "opener"), P("map", "chart"),
  P("letter", "missive"), P("journal", "diary"), P("book", "tome"), P("quill", "nib"), P("inkwell", "inkpot"),
  P("bottle", "flask"), P("vial", "phial"), P("potion", "elixir"), P("coin", "sovereign"), P("purse", "pouch"),
  P("sack", "bundle"), P("rope", "cord"), P("chain", "shackle"), P("padlock", "deadbolt"), P("bell", "chime"),
  P("drum", "tabor"), P("harp", "lyre"), P("lute", "mandolin"), P("fiddle", "violin"), P("cart", "wagon"),
  P("wheel", "cogwheel"), P("net", "mesh"), P("anchor", "grapnel"), P("oar", "paddle"), P("sail", "canvas"),
  P("tent", "pavilion"), P("blanket", "coverlet"), P("pillow", "cushion"), P("kettle", "cauldron"), P("knife", "cleaver"),
  P("axe", "hatchet"), P("pickaxe", "mattock"), P("shovel", "spade"), P("scythe", "sickle"), P("plough", "harrow"),
];
const PLACES: Pair[] = [
  P("cellar", "basement"), P("attic", "garret"), P("stable", "barn"), P("well", "cistern"), P("chapel", "sanctuary"),
  P("bridge", "viaduct"), P("tower", "turret"), P("harbour", "wharf"), P("foundry", "ironworks"), P("market", "bazaar"),
  P("inn", "hostel"), P("orchard", "grove"), P("quarry", "excavation"), P("mill", "grange"), P("crypt", "vault"),
  P("garden", "courtyard"), P("gate", "portal"), P("kitchen", "galley"), P("library", "archive"), P("armory", "arsenal"),
  P("dock", "jetty"), P("temple", "shrine"), P("cave", "grotto"), P("hut", "hovel"), P("barracks", "garrison"),
  P("tavern", "alehouse"), P("cottage", "lodge"), P("lighthouse", "beacon"), P("cemetery", "graveyard"), P("dungeon", "oubliette"),
  P("hall", "chamber"), P("cliff", "crag"), P("ford", "crossing"), P("marsh", "fen"), P("meadow", "pasture"), P("valley", "dale"),
];
const VERBS: Pair[] = [
  V("hides", "hide", "conceals", "conceal"), V("carries", "carry", "transports", "transport"), V("buys", "buy", "purchases", "purchase"),
  V("steals", "steal", "pilfers", "pilfer"), V("finds", "find", "discovers", "discover"), V("loses", "lose", "mislays", "mislay"),
  V("breaks", "break", "shatters", "shatter"), V("repairs", "repair", "mends", "mend"), V("sells", "sell", "vends", "vend"),
  V("guards", "guard", "protects", "protect"), V("burns", "burn", "incinerates", "incinerate"), V("forges", "forge", "fashions", "fashion"),
];
const ADJECTIVES: Pair[] = [
  P("old", "ancient"), P("small", "tiny"), P("heavy", "weighty"), P("red", "crimson"), P("golden", "gilded"), P("wooden", "timber"),
  P("rusty", "corroded"), P("carved", "engraved"), P("dusty", "grimy"), P("cracked", "fissured"), P("silver", "argent"), P("blue", "azure"),
];
const ACTORS = ["Aria", "Bram", "Cael", "Dara", "Eno"];
const NPCS = [
  "Edda", "Orin", "Tamsin", "Hobb", "Wren", "Cyril", "Maud", "Piers", "Isolde", "Garrick", "Linnet", "Osric", "Perrin", "Yvaine", "Corwin",
  "Brenna", "Dunstan", "Elspeth", "Fenwick", "Gwyn", "Halric", "Imogen", "Jory", "Kestrel", "Lorcan", "Mabel", "Niall", "Odalys", "Pell",
  "Quillon", "Rowan", "Sibyl", "Tobias", "Ulric", "Vesper", "Wystan", "Xanthe", "Yorick", "Zelda", "Alden",
];
const USER = "Jude";
const EVERY = 15;
const PER_CHAPTER = 5;
/** Targets come from the first TARGET_CHAPTERS chapters (messages 0..269): older than the recent window at every size. */
const TARGET_CHAPTERS = 18;

/** A small seeded generator, so a run is repeatable. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
};

// ---------- the world: facts and chapters, generated in order so a smaller chat is the prefix of a bigger one ----------
type Slots = { a: string; v: Pair; adj: Pair; o: Pair; pl: Pair };
type FactRec = { id: string; text: string; slots: Slots; chapter: number };
type ChapRec = { id: string; n: number; text: string; npc: string; v: Pair; o: Pair; pl: Pair };

function world(chapters: number) {
  const rand = rng(1840);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)]!;
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const usedC = new Set<string>();
  const facts: FactRec[] = [];
  const chaps: ChapRec[] = [];
  for (let c = 0; c < chapters; c++) {
    for (let k = 0; k < PER_CHAPTER; k++) {
      let slots: Slots;
      // unique (actor, verb, object) and unique (object, place): one right answer per question
      for (;;) {
        slots = { a: pick(ACTORS), v: pick(VERBS), adj: pick(ADJECTIVES), o: pick(OBJECTS), pl: pick(PLACES) };
        const ka = [slots.a, slots.v.s, slots.o.s].join("|");
        const kb = [slots.o.s, slots.pl.s].join("|");
        if (!usedA.has(ka) && !usedB.has(kb)) {
          usedA.add(ka);
          usedB.add(kb);
          break;
        }
      }
      facts.push({ id: "f" + (facts.length + 1), text: `${slots.a} ${slots.v.s} the ${slots.adj.s} ${slots.o.s} in the ${slots.pl.s}.`, slots, chapter: c + 1 });
    }
    let npc: string, v: Pair, o: Pair, pl: Pair;
    for (;;) {
      npc = pick(NPCS);
      v = pick(VERBS);
      o = pick(OBJECTS);
      pl = pick(PLACES);
      const key = [npc, v.s, o.s].join("|");
      if (!usedC.has(key)) {
        usedC.add(key);
        break;
      }
    }
    chaps.push({ id: "c" + (c + 1), n: c + 1, text: `The company reached the ${pl.s}, where ${npc} ${v.s} the ${o.s}.`, npc, v, o, pl });
  }
  return { facts, chaps };
}

// ---------- probes ----------
type Kind = "echo" | "partial" | "para";
const KINDS: Kind[] = ["echo", "partial", "para"];
const word = (p: Pair, kind: Kind, role: "obj" | "other", base = false) => {
  const stored = kind === "echo" || (kind === "partial" && role === "obj");
  return stored ? (base ? p.sb ?? p.s : p.s) : base ? p.pb ?? p.p : p.p;
};
function factQuestion(f: FactRec, kind: Kind, form: number) {
  const { a, v, adj, o, pl } = f.slots;
  return form % 2 === 0
    ? `Where did ${a} ${word(v, kind, "other", true)} the ${word(adj, kind, "other")} ${word(o, kind, "obj")}?`
    : `Which ${word(adj, kind, "other")} ${word(o, kind, "obj")} did ${a} ${word(v, kind, "other", true)} in the ${word(pl, kind, "other")}?`;
}
function chapterQuestion(c: ChapRec, kind: Kind, form: number) {
  return form % 2 === 0
    ? `At the ${word(c.pl, kind, "other")}, which ${word(c.o, kind, "obj")} did ${c.npc} ${word(c.v, kind, "other", true)}?`
    : `Who ${word(c.v, kind, "other")} the ${word(c.o, kind, "obj")} when the company came to the ${word(c.pl, kind, "other")}?`;
}

// ---------- mock embedders ----------
const DIM = 96;
const unit = (key: string, noise = 0) => {
  const r = rng(hashOf(key));
  const v = Array.from({ length: DIM }, () => r() + r() + r() - 1.5);
  const n = Math.sqrt(v.reduce((t, x) => t + x * x, 0)) || 1;
  return v.map((x) => x / n);
};
const concepts = new Map<string, string>();
for (const [tag, list] of [["o", OBJECTS], ["p", PLACES], ["v", VERBS], ["j", ADJECTIVES]] as const) {
  for (const pr of list) for (const w of [pr.s, pr.sb, pr.p, pr.pb]) if (w) concepts.set(w, tag + ":" + pr.s);
}
const FILLER = new Set(["the", "in", "at", "did", "where", "which", "who", "when", "to", "came", "company", "reached", "where"]);
function embedder(alpha: number, sigma: number) {
  const cache = new Map<string, number[]>();
  const wordVec = (w: string) => {
    let v = cache.get(w);
    if (!v) {
      const c = concepts.get(w);
      if (c) {
        const a = unit("concept:" + c);
        const b = unit("word:" + w);
        v = a.map((x, i) => alpha * x + Math.sqrt(1 - alpha * alpha) * b[i]!);
      } else v = unit("word:" + w);
      cache.set(w, v);
    }
    return v;
  };
  return (text: string) => {
    const sum = new Array<number>(DIM).fill(0);
    for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) {
      const weight = FILLER.has(w) ? 0.15 : 1;
      const v = wordVec(w);
      for (let i = 0; i < DIM; i++) sum[i]! += weight * v[i]!;
    }
    const norm = Math.sqrt(sum.reduce((t, x) => t + x * x, 0)) || 1;
    const noise = unit("text:" + text);
    return sum.map((x, i) => x / norm + sigma * noise[i]!);
  };
}
const EMBEDDERS = { words: null, "vec good": embedder(0.85, 0.15), "vec weak": embedder(0.6, 0.4) } as const;
type Mode = keyof typeof EMBEDDERS;
const MODES = Object.keys(EMBEDDERS) as Mode[];

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

type Cell = { carried: number; pool: number; n: number; mode: Mode; kind: Kind; factMrr: number; factInPrompt: number; factPos: number; chapMrr: number; chapInPrompt: number; tokens: number };

function measure(n: number): Cell[] {
  const { line, st, facts, chaps } = chatAt(n);
  const rand = rng(77);
  const factTargets = facts.filter((f) => f.chapter <= TARGET_CHAPTERS);
  const chapTargets = chaps.filter((c) => c.n <= TARGET_CHAPTERS);
  const shuffled = <T>(list: T[]) => list.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const fp = shuffled(factTargets).slice(0, 40);
  const cp = shuffled(chapTargets).slice(0, 12);
  const share = L.chatWordShare(line);
  const cells: Cell[] = [];
  for (const mode of MODES) {
    const embed = EMBEDDERS[mode];
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
      const get = (mode: Mode, kind: Kind) => cells.find((c) => c.mode === mode && c.kind === kind)!;
      // a collapse only: the exact words must still bring the answer into the prompt; vectors must not hurt the paraphrase
      expect(get("words", "echo").factInPrompt).toBeGreaterThan(0.5);
      expect(get("words", "echo").chapInPrompt).toBeGreaterThan(0.3);
      expect(get("vec good", "para").factMrr).toBeGreaterThanOrEqual(get("words", "para").factMrr);
      if (n === 5000) {
        const pct = (x: number) => String(Math.round(x * 100)).padStart(3) + "%";
        const lines = ["", "recall bench: fact / chapter probes, same targets at every size (MRR over the whole ranking; in prompt = answer in the 800-token insert; pos = mean 1/position of the fact in the insert)"];
        lines.push("   size | mode     | wording | fact MRR | fact in prompt | fact pos | chapter MRR | chapter in prompt | insert tok | facts in insert / pool");
        for (const c of all) {
          lines.push(`${String(c.n).padStart(6)} | ${c.mode.padEnd(8)} | ${c.kind.padEnd(7)} | ${c.factMrr.toFixed(2).padStart(8)} | ${pct(c.factInPrompt).padStart(14)} | ${c.factPos.toFixed(2).padStart(8)} | ${c.chapMrr.toFixed(2).padStart(11)} | ${pct(c.chapInPrompt).padStart(17)} | ${String(c.tokens).padStart(10)} | ${c.carried} / ${c.pool}`);
        }
        console.log(lines.join("\n"));
      }
    }, 300_000);
  }
});
