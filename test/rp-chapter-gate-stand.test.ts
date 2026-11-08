/**
 * #264 PR B stand (scripts/chapter-gate-stand.ts): builds the probes and the pool from a chain of chats, scores them with
 * vectors, and prints numbers without any chat text. Checked here with a hashed bag-of-words as the "model".
 */
import { describe, expect, it } from "bun:test";
import { L, env, readJson, readText, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";
import { DOC_CHARS, WINDOW_CHARS, dumpStand, printStand, readOnlyFs, scoreStand } from "../scripts/chapter-gate-stand";

useRoot();

const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
const C = (id: string, text: string): Msg => ({ id, role: "char", name: "Aria", text, swipe: 0 });
const filler = (c: string, i: number) => `${c} day ${i} passed and the cart rolled on past marker${i} and ${c}${i % 11} pasture.`;

function oldChat(id: string, theme: string, secret: string) {
  const msgs: Msg[] = [];
  for (let i = 1; i <= 60; i++) msgs.push(i % 2 ? U(`${id}u${i}`, filler(id, i)) : C(`${id}a${i}`, filler(id, i)));
  msgs.splice(6, 1, C(`${id}secret`, secret));
  writeChat(id, msgs, { title: id, userName: "Jude" });
  const chapters = [0, 1, 2, 3].map((k) => ({ id: "c" + (k + 1), from: msgs[k * 15]!.id, to: msgs[k * 15 + 14]!.id, count: 15, kind: "scene", text: k === 0 ? `${theme} ${secret}` : `Quiet ${id} travel number ${k} through the hills.`, label: "L", at: k, cast: ["Aria"], sig: "x" }));
  writeJson(`litopys/chats/${id}.json`, { ...L.emptyChat(id), migrated: true, chapters });
}

// a bag-of-words "embedder": each word sets a few dimensions
const embed = (text: string) => {
  const v = new Array(512).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let h = 7;
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % 512] += 1;
    v[(h >>> 6) % 512] += 0.5;
  }
  const n = Math.sqrt(v.reduce((t, x) => t + x * x, 0)) || 1;
  return v.map((x) => x / n);
};

function build() {
  oldChat("one", "A harbour fog.", "Aria wore the turquoise cloak with a silver clasp shaped like a heron.");
  oldChat("two", "A mill by the river.", "Bram buried the brass lantern beneath the willow near the quarry.");
  const now: Msg[] = [];
  for (let i = 1; i <= 40; i++) now.push(i % 2 ? U(`n${i}`, `now ${i} nothing special happens near ordinary place${i}.`) : C(`n${i}`, `Aria answers ${i} with ordinary words about place${i}.`));
  now.splice(20, 3, U("n21", "Do you remember the turquoise cloak?"), C("n22", "The silver clasp, shaped like a heron, yes."), U("n23", "And the heron on the clasp."));
  writeChat("now", now, { title: "now", userName: "Jude" });
  writeJson("litopys/links.json", { v: 1, links: { two: { from: "one", at: 1 }, now: { from: "two", at: 2 } } });
  return readOnlyFs(env.root);
}

describe("the chapter-gate stand", () => {
  it("finds the planted word hit, ranks its chapter first, and prints numbers without chat text", () => {
    const fsx = build();
    expect(L.loadLinks(fsx).now.from).toBe("two");
    const dump = dumpStand(fsx, 40);
    expect(dump.chains.now).toEqual(["two", "one"]);
    expect(dump.docs.length).toBeGreaterThanOrEqual(8);
    const hit = dump.probes.filter((p) => p.chat === "now" && p.wordDocs.length);
    expect(hit.length).toBeGreaterThan(0);
    expect(dump.docs[hit[0]!.wordDocs[0]!]).toMatchObject({ chat: "one", id: "c1" });
    const vecs = { doc: Object.fromEntries(dump.doc.map((t) => [t, embed(t)])), query: Object.fromEntries(dump.query.map((t) => [t, embed(t)])) };
    const res = scoreStand(dump, vecs);
    expect(res.wordHit).toBeGreaterThan(0);
    expect(res.agreement?.top1).toBe(1);
    expect(res.auc).toBeGreaterThan(0.5);
    const out = printStand(res, dump);
    expect(out).toContain("agreement");
    expect(out).not.toMatch(/turquoise|heron|lantern|willow/i);
  });

  it("with --split a long chat that continues nothing is cut at a chapter border: the early chapters are the pool, the late windows the probes", () => {
    const msgs: Msg[] = [];
    for (let i = 1; i <= 300; i++) msgs.push(i % 2 ? U(`s${i}`, filler("solo", i)) : C(`s${i}`, filler("solo", i)));
    msgs.splice(6, 1, C("s7", "Aria wore the turquoise cloak with a silver clasp shaped like a heron."));
    msgs.splice(250, 3, U("s251", "Do you remember the turquoise cloak?"), C("s252", "The silver clasp, shaped like a heron, yes."), U("s253", "And the heron on the clasp."));
    writeChat("solo", msgs, { title: "solo", userName: "Jude" });
    const chapters = Array.from({ length: 20 }, (_, k) => ({ id: "c" + (k + 1), from: msgs[k * 15]!.id, to: msgs[k * 15 + 14]!.id, count: 15, kind: "scene", text: k === 0 ? "A harbour fog. Aria wore the turquoise cloak with a silver clasp shaped like a heron." : `Quiet journey number ${k} through the hills.`, label: "L", at: k, cast: ["Aria"], sig: "x" }));
    writeJson("litopys/chats/solo.json", { ...L.emptyChat("solo"), migrated: true, chapters });
    const fsx = readOnlyFs(env.root);
    expect(dumpStand(fsx, { split: false }).probes).toEqual([]);
    const dump = dumpStand(fsx, { split: true });
    expect(dump.splits).toBe(1);
    const hit = dump.probes.filter((p) => p.kind === "split" && p.wordDocs.length);
    expect(hit.length).toBeGreaterThan(0);
    expect(dump.docs[hit[0]!.wordDocs[0]!]).toMatchObject({ chat: "solo", id: "c1" });
    // the pool holds only chapters that end before the cut; no probe lies inside it
    expect(hit[0]!.pool.length).toBeGreaterThanOrEqual(4);
    expect(hit[0]!.pool.length).toBeLessThan(20);
    const vecs = { doc: Object.fromEntries(dump.doc.map((t) => [t, embed(t)])), query: Object.fromEntries(dump.query.map((t) => [t, embed(t)])) };
    const res = scoreStand(dump, vecs);
    expect(res.agreement?.top1).toBe(1);
    expect(printStand(res, dump)).not.toMatch(/turquoise|heron/i);
  });

  it("cuts what goes to the embedder: a long window keeps its tail, a long chapter its head (one huge message once asked for 14 GB)", () => {
    const fsx = build();
    // the same chain, but the newest message is huge and so is a chapter
    const huge = "turquoise cloak silver clasp heron " + "word ".repeat(5000);
    const now = readText("chats/now.jsonl").trim().split("\n").map((l: string) => JSON.parse(l));
    now[22] = { ...now[22], text: huge };
    writeChat("now", now, { title: "now", userName: "Jude" });
    const st = readJson("litopys/chats/one.json");
    st.chapters[0].text = "A harbour fog. " + "long ".repeat(3000);
    writeJson("litopys/chats/one.json", st);
    const dump = dumpStand(fsx, 40);
    expect(dump.query.every((q) => q.length <= WINDOW_CHARS)).toBe(true);
    expect(dump.doc.every((d) => d.length <= DOC_CHARS)).toBe(true);
    expect(dump.query.some((q) => q.length === WINDOW_CHARS)).toBe(true);
  });

  it("scores nothing and does not throw when a chat has no chain", () => {
    writeChat("alone", [U("a1", "Hello there my friend, welcome."), C("a2", "Hello again, welcome back.")], { title: "alone" });
    const dump = dumpStand(readOnlyFs(env.root));
    expect(dump.probes).toEqual([]);
    expect(scoreStand(dump, { doc: {}, query: {} }).withPool).toBe(0);
  });
});
