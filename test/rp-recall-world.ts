/**
 * The synthetic world of the recall bench (issue #184): word tables with a paraphrase for every word, facts and chapters
 * generated in order (a smaller chat is the prefix of a bigger one), probe wordings, and the mock embedders. Shared by
 * `rp-recall-mrr-bench.test.ts` and `scripts/recall-also.ts`. Synthetic text only.
 */
export type Pair = { s: string; p: string; sb?: string; pb?: string };
export const P = (s: string, p: string): Pair => ({ s, p });
export const V = (s: string, sb: string, p: string, pb: string): Pair => ({ s, sb, p, pb });

export const OBJECTS: Pair[] = [
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
export const PLACES: Pair[] = [
  P("cellar", "basement"), P("attic", "garret"), P("stable", "barn"), P("well", "cistern"), P("chapel", "sanctuary"),
  P("bridge", "viaduct"), P("tower", "turret"), P("harbour", "wharf"), P("foundry", "ironworks"), P("market", "bazaar"),
  P("inn", "hostel"), P("orchard", "grove"), P("quarry", "excavation"), P("mill", "grange"), P("crypt", "vault"),
  P("garden", "courtyard"), P("gate", "portal"), P("kitchen", "galley"), P("library", "archive"), P("armory", "arsenal"),
  P("dock", "jetty"), P("temple", "shrine"), P("cave", "grotto"), P("hut", "hovel"), P("barracks", "garrison"),
  P("tavern", "alehouse"), P("cottage", "lodge"), P("lighthouse", "beacon"), P("cemetery", "graveyard"), P("dungeon", "oubliette"),
  P("hall", "chamber"), P("cliff", "crag"), P("ford", "crossing"), P("marsh", "fen"), P("meadow", "pasture"), P("valley", "dale"),
];
export const VERBS: Pair[] = [
  V("hides", "hide", "conceals", "conceal"), V("carries", "carry", "transports", "transport"), V("buys", "buy", "purchases", "purchase"),
  V("steals", "steal", "pilfers", "pilfer"), V("finds", "find", "discovers", "discover"), V("loses", "lose", "mislays", "mislay"),
  V("breaks", "break", "shatters", "shatter"), V("repairs", "repair", "mends", "mend"), V("sells", "sell", "vends", "vend"),
  V("guards", "guard", "protects", "protect"), V("burns", "burn", "incinerates", "incinerate"), V("forges", "forge", "fashions", "fashion"),
];
export const ADJECTIVES: Pair[] = [
  P("old", "ancient"), P("small", "tiny"), P("heavy", "weighty"), P("red", "crimson"), P("golden", "gilded"), P("wooden", "timber"),
  P("rusty", "corroded"), P("carved", "engraved"), P("dusty", "grimy"), P("cracked", "fissured"), P("silver", "argent"), P("blue", "azure"),
];
export const ACTORS = ["Aria", "Bram", "Cael", "Dara", "Eno"];
export const NPCS = [
  "Edda", "Orin", "Tamsin", "Hobb", "Wren", "Cyril", "Maud", "Piers", "Isolde", "Garrick", "Linnet", "Osric", "Perrin", "Yvaine", "Corwin",
  "Brenna", "Dunstan", "Elspeth", "Fenwick", "Gwyn", "Halric", "Imogen", "Jory", "Kestrel", "Lorcan", "Mabel", "Niall", "Odalys", "Pell",
  "Quillon", "Rowan", "Sibyl", "Tobias", "Ulric", "Vesper", "Wystan", "Xanthe", "Yorick", "Zelda", "Alden",
];
export const USER = "Jude";
export const EVERY = 15;
export const PER_CHAPTER = 5;
/** Targets come from the first TARGET_CHAPTERS chapters (messages 0..269): older than the recent window at every size. */
export const TARGET_CHAPTERS = 18;

/** A small seeded generator, so a run is repeatable. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
};

// ---------- the world: facts and chapters, generated in order so a smaller chat is the prefix of a bigger one ----------
export type Slots = { a: string; v: Pair; adj: Pair; o: Pair; pl: Pair };
export type FactRec = { id: string; text: string; slots: Slots; chapter: number };
export type ChapRec = { id: string; n: number; text: string; npc: string; v: Pair; o: Pair; pl: Pair };

export function world(chapters: number) {
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
export type Kind = "echo" | "partial" | "para";
export const KINDS: Kind[] = ["echo", "partial", "para"];
export const word = (p: Pair, kind: Kind, role: "obj" | "other", base = false) => {
  const stored = kind === "echo" || (kind === "partial" && role === "obj");
  return stored ? (base ? p.sb ?? p.s : p.s) : base ? p.pb ?? p.p : p.p;
};
export function factQuestion(f: FactRec, kind: Kind, form: number) {
  const { a, v, adj, o, pl } = f.slots;
  return form % 2 === 0
    ? `Where did ${a} ${word(v, kind, "other", true)} the ${word(adj, kind, "other")} ${word(o, kind, "obj")}?`
    : `Which ${word(adj, kind, "other")} ${word(o, kind, "obj")} did ${a} ${word(v, kind, "other", true)} in the ${word(pl, kind, "other")}?`;
}
export function chapterQuestion(c: ChapRec, kind: Kind, form: number) {
  return form % 2 === 0
    ? `At the ${word(c.pl, kind, "other")}, which ${word(c.o, kind, "obj")} did ${c.npc} ${word(c.v, kind, "other", true)}?`
    : `Who ${word(c.v, kind, "other")} the ${word(c.o, kind, "obj")} when the company came to the ${word(c.pl, kind, "other")}?`;
}

// ---------- mock embedders ----------
export const DIM = 96;
export const unit = (key: string, noise = 0) => {
  const r = rng(hashOf(key));
  const v = Array.from({ length: DIM }, () => r() + r() + r() - 1.5);
  const n = Math.sqrt(v.reduce((t, x) => t + x * x, 0)) || 1;
  return v.map((x) => x / n);
};
export const concepts = new Map<string, string>();
for (const [tag, list] of [["o", OBJECTS], ["p", PLACES], ["v", VERBS], ["j", ADJECTIVES]] as const) {
  for (const pr of list) for (const w of [pr.s, pr.sb, pr.p, pr.pb]) if (w) concepts.set(w, tag + ":" + pr.s);
}
export const FILLER = new Set(["the", "in", "at", "did", "where", "which", "who", "when", "to", "came", "company", "reached", "where"]);
export function embedder(alpha: number, sigma: number) {
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
export const EMBEDDERS = { words: null, "vec good": embedder(0.85, 0.15), "vec weak": embedder(0.6, 0.4) } as const;
export type Mode = keyof typeof EMBEDDERS;
export const MODES = Object.keys(EMBEDDERS) as Mode[];

