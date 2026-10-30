/**
 * Recall scoring (issue #99, piece 3): names, two words in a row and the words a chat uses in every scene.
 * The bench ranks a small pool of facts for probe messages, once with the old rule (words only) and once with the new,
 * and compares where the fact the probe is about lands. The fixtures are made up to show each signal; the
 * control probes are the cases the old rule already got right, which must not get worse. Run with
 * `bun test test/rp-recall-bench.test.ts` to see the table.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

type Fact = { id: string; text: string; subject: string; knownBy: string; weight: string; updatedAt: number; status: string };
const fact = (n: number, text: string, subject = "world", weight = "everyday"): Fact => ({ id: "f" + n, text, subject, knownBy: "all", weight, updatedAt: n, status: "active" });

/** A chat whose every scene says the same few things: "Aria said the door ... the road". */
function chatLine(n = 60) {
  return Array.from({ length: n }, (_, i) => ({
    id: "m" + (i + 1),
    role: i % 2 ? "char" : "user",
    name: i % 2 ? "Aria" : "Jude",
    text: i % 2 ? `Aria said the door was open, and we went down the road again, turn ${i}.` : `Jude said the road was long and the tavern door stuck, turn ${i}.`,
  }));
}

const EN: Fact[] = [
  fact(1, "Bram hides a silver locket under the hearth stone.", "Bram"),
  fact(2, "Aria said she trusts Jude.", "Aria"),
  fact(3, "The tavern door sticks in winter."),
  fact(4, "Jude owes the guild of Emberfall forty crowns.", "Jude"),
  fact(5, "The road north is closed by snow."),
  fact(6, "Aria carries a brass key on a cord.", "Aria"),
  fact(7, "Cora's key is cast of brass."),
  fact(8, "Bram said the door of the cellar is locked.", "Bram"),
  fact(9, "Cora the herbalist sells lamp oil.", "Cora"),
  fact(10, "Jude said he would take the road at dawn.", "Jude"),
  fact(11, "The northern gate rings a bell at dusk."),
  fact(12, "Aria said nothing about the locket.", "Aria"),
  fact(13, "A crow nests near Lorien.", "world"),
  fact(14, "A crow nests near the cabin.", "world"),
];
const UK: Fact[] = [
  fact(21, "Арія носить латунний ключ на шнурку.", "Арія"),
  fact(22, "Ключ від льоху зроблений із латуні.", "world"),
  fact(23, "Двері таверни рипіть узимку.", "world"),
  fact(24, "Дорога на північ закрита снігом.", "world"),
];

type Probe = { name: string; kind: "signal" | "control"; facts: Fact[]; scan: string; want: string };
const PROBES: Probe[] = [
  { name: "rare name among the chat's stock words", kind: "signal", facts: EN, scan: "Aria said the door was open on the road, and Jude asked about Emberfall.", want: "f4" },
  { name: "two words in a row, not apart", kind: "signal", facts: EN, scan: "She asked about the brass key.", want: "f6" },
  { name: "a name beats a plain word of the same rarity", kind: "signal", facts: EN, scan: "A crow flew over Lorien and the cabin.", want: "f13" },
  { name: "two words in a row (Ukrainian)", kind: "signal", facts: UK, scan: "Вона питала про латунний ключ.", want: "f21" },
  { name: "control: a rare word carries it", kind: "control", facts: EN, scan: "Where is the silver locket? Bram looked at the hearth.", want: "f1" },
  { name: "control: one fact on the topic", kind: "control", facts: EN, scan: "The herbalist has lamp oil to sell.", want: "f9" },
];

const rankOf = (ids: string[], want: string) => ids.indexOf(want) + 1;
const rankedIds = (p: Probe, opts: any) => L.rankFacts(p.facts, p.scan, undefined, undefined, opts).map((f: Fact) => f.id);

describe("recall scoring bench", () => {
  const share = L.chatWordShare(chatLine());
  const rows = PROBES.map((p) => ({ p, before: rankOf(rankedIds(p, undefined), p.want), after: rankOf(rankedIds(p, { share }), p.want) }));

  it("prints where the wanted fact lands before and after", () => {
    const mrr = (k: "before" | "after") => rows.reduce((t, r) => t + 1 / r[k], 0) / rows.length;
    const lines = rows.map((r) => `${r.p.kind.padEnd(7)} ${r.p.name.padEnd(48)} rank ${r.before} -> ${r.after}`);
    console.log("recall bench (rank of the wanted fact, 1 = first)\n" + lines.join("\n") + `\nmean reciprocal rank ${mrr("before").toFixed(2)} -> ${mrr("after").toFixed(2)}`);
    expect(mrr("after")).toBeGreaterThan(mrr("before"));
  });

  for (const r of rows) {
    it(`${r.p.kind}: ${r.p.name}`, () => {
      expect(r.after).toBeLessThanOrEqual(r.before);
      if (r.p.kind === "signal") expect(r.after).toBe(1);
      else expect(r.after).toBe(1);
    });
  }

  it("the old rule is what no options give", () => {
    const p = PROBES[1];
    expect(rankedIds(p, undefined)).toEqual(L.rankFacts(p.facts, p.scan).map((f: Fact) => f.id));
    // the same words, only older facts first on a tie: f7 is newer than f6, so it led before
    expect(rankOf(rankedIds(p, undefined), "f6")).toBeGreaterThan(1);
  });

  it("chapters take the same scoring", () => {
    const chapters = [
      { id: "c1", label: "Night", text: "Aria said the door was open on the road.", at: 1 },
      { id: "c2", label: "Debt", text: "Jude owes the guild of Emberfall forty crowns.", at: 0 },
    ];
    const scan = "Aria said the door was shut. Then Jude asked about Emberfall.";
    expect(L.rankChapters(chapters, scan, undefined, { share })[0].id).toBe("c2");
  });
});

describe("recall scoring parts", () => {
  it("counts a word's share of the chat's messages, and says nothing for a short chat", () => {
    expect(L.chatWordShare(chatLine(10))).toBeNull();
    const share = L.chatWordShare(chatLine());
    expect(share("door")).toBeGreaterThan(0.9);
    expect(share("emberfal")).toBe(0);
  });

  it("is off in the hidden setting, on by default", () => {
    const { host } = mockHost();
    expect(L.loadConfig(host.fsx ?? undefined)).toBeDefined();
    writeJson("litopys/config.json", { recallScoring: "words" });
    expect(L.handleRoute({ method: "GET", path: "/litopys/config", query: {}, body: undefined }, host).json.recallScoring).toBe("words");
    writeJson("litopys/config.json", {});
    expect(L.handleRoute({ method: "GET", path: "/litopys/config", query: {}, body: undefined }, host).json.recallScoring).toBe("phrases");
    // a save from the settings page keeps the hand-edited key
    writeJson("litopys/config.json", { recallScoring: "words" });
    L.handleRoute({ method: "PUT", path: "/litopys/config", query: {}, body: { budget: 900 } }, host);
    expect(L.handleRoute({ method: "GET", path: "/litopys/config", query: {}, body: undefined }, host).json.recallScoring).toBe("words");
  });

  it("buildInsert follows the setting", () => {
    writeChat("c", chatLine(40) as any, { title: "T", userName: "Jude" });
    const st = L.emptyChat("c");
    st.facts = EN.map((f) => ({ ...f, src: {}, origin: "chapter" }));
    const line = L.activeLine(chatLine(40) as any);
    const scan = PROBES[1].scan;
    const pick = (cfg: any) => L.buildInsert({ st, line, dash: null, meta: { userName: "Jude" }, cfg: { ...L.DEFAULT_CONFIG, budget: 60, ...cfg }, scanText: scan, speakerName: "Aria", used: {} });
    const a = pick({ recallScoring: "words" });
    const b = pick({ recallScoring: "phrases" });
    expect(a && b).toBeTruthy();
    expect(a.factIds.join()).not.toBe(b.factIds.join());
  });
});
