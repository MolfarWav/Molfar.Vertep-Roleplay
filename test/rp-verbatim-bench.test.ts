/**
 * #184 step 8 bench: how often does word-for-word recall speak when it should not, and how often does it find a planted
 * detail? A chain of five chats of 400 messages each in a made-up vocabulary where a few hundred words are everyday and the
 * rest rare (a Zipf-like draw), ten details planted in one message each, probed with three of their words, and 120 ordinary
 * scans drawn from the same vocabulary. Synthetic text, one seed: it checks the rule, not a real story.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();

let seed = 20261107;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const SYL = ["ka", "vo", "ri", "me", "tu", "sha", "lor", "den", "mi", "zu", "bra", "fel", "gan", "ho", "ys", "pen", "tar", "ul", "wen", "oc"];
const word = (i: number) => {
  let n = i + 7;
  let w = "";
  for (let k = 0; k < 3; k++) {
    w += SYL[n % SYL.length];
    n = Math.floor(n / SYL.length) + 3 * k + 1;
  }
  return w + (i % 5 === 0 ? "n" : "");
};
const VOCAB = Array.from({ length: 1800 }, (_, i) => word(i));
/** A Zipf-like draw: the first words are everyday, the tail is rare. */
const draw = () => VOCAB[Math.min(VOCAB.length - 1, Math.floor(Math.pow(rnd(), 2.6) * VOCAB.length))];
const sentence = (n = 14) => Array.from({ length: n }, draw).join(" ") + ".";

const DETAILS = Array.from({ length: 10 }, (_, d) => [`quorvelle${d}x`, `zandrith${d}y`, `mirebloom${d}z`, `silverthorn${d}q`]);

function build() {
  const ids = ["c1", "c2", "c3", "c4", "c5", "now"];
  const planted: Array<{ chat: string; words: string[] }> = [];
  ids.slice(0, 5).forEach((id, ci) => {
    const msgs: Msg[] = [];
    for (let i = 0; i < 400; i++) {
      const text = sentence(18) + " " + sentence(12);
      msgs.push(i % 2 ? { id: `${id}u${i}`, role: "user", name: "Jude", text } : { id: `${id}a${i}`, role: "char", name: "Aria", text, swipe: 0 });
    }
    DETAILS.slice(ci * 2, ci * 2 + 2).forEach((words, k) => {
      const at = 60 + k * 170;
      const m = msgs[at];
      m.text = `${m.text} The ${words[0]} lay beside the ${words[1]} and the ${words[2]} with a ${words[3]}.`;
      planted.push({ chat: id, words });
    });
    writeChat(id, msgs, { title: "Chat " + id, userName: "Jude" });
  });
  writeChat("now", [{ id: "n1", role: "user", name: "Jude", text: "Hello." }], { title: "Now", userName: "Jude" });
  writeJson("litopys/config.json", { verbatim: true });
  const m = mockHost();
  let prev = "";
  for (const id of ids) {
    if (prev) L.handleRoute({ method: "POST", path: "/litopys/links", query: {}, body: { chatId: id, from: prev } }, m.host);
    prev = id;
  }
  return { m, planted };
}

describe("verbatim recall bench (synthetic, one seed)", () => {
  it("finds a planted detail from three of its words, and almost never speaks for an ordinary scan", () => {
    const { m, planted } = build();
    const find = (scanText: string) => L.verbatimFor({ fsx: m.host.fs, chatId: "now", scanText, voices: null });
    // the first call builds the five indexes
    find("warm up the indexes");
    let found = 0;
    for (const p of planted) {
      const r = find(`Do you remember the ${p.words[0]}, the ${p.words[1]} and the ${p.words[2]}?`);
      if (r && r.rows.some((x: any) => x.c === p.chat) && r.text.includes(p.words[3])) found++;
    }
    let spoke = 0;
    const SCANS = 120;
    for (let i = 0; i < SCANS; i++) if (find([sentence(16), sentence(12), sentence(14)].join("\n"))) spoke++;
    console.log(`verbatim bench: planted details found ${found}/${planted.length}; ordinary scans that brought a passage ${spoke}/${SCANS}`);
    expect(found).toBeGreaterThanOrEqual(9);
    expect(spoke / SCANS).toBeLessThanOrEqual(0.05);
  });

  it("a scan with one planted word is not enough", () => {
    const { m, planted } = build();
    const one = L.verbatimFor({ fsx: m.host.fs, chatId: "now", scanText: `Something about the ${planted[0].words[0]} again, today and tomorrow, and the road ahead.`, voices: null });
    expect(one).toBeNull();
  });
});
