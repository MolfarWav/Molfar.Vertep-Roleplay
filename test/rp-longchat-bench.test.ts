/**
 * Bench for long chats (issue #184, P0 code part): a synthetic group chat of 500, 2000 and 5000 messages with 5
 * characters, a chapter every 15 messages and 5 facts each, a third of them told to a few. For every speaker it
 * measures the Litopys insert (tokens, ms), the size of the record file, and the exposure: restricted facts that
 * reached a speaker who does not know them, with the rule of before #184 (anyone present) beside the new one.
 * It prints a table; the asserts only catch a collapse and any exposure of the new rule.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { L, abs, mockHost, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();

const NAMES = ["Aria", "Bram", "Cael", "Dara", "Eno"];
const USER = "Jude";
const EVERY = 15;
const PER_CHAPTER = 5;

/** A small seeded generator, so a run is repeatable. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Fact = { id: string; num: number; knownBy: "all" | string[] };

function build(n: number) {
  for (const nm of NAMES) writeJson("characters/" + nm.toLowerCase() + "/card.json", { spec: "chara_card_v2", name: nm, description: nm, extensions: {} });
  writeJson("groups/g5.json", { id: "g5", name: "Hall", generationMode: "swap", memberIds: NAMES.map((x) => x.toLowerCase()) });
  const msgs: Msg[] = Array.from({ length: n }, (_, i) => (i % 6 === 0 ? { id: "m" + i, role: "user", name: USER, text: "Jude speaks, turn " + i } : { id: "m" + i, role: "char", name: NAMES[i % 5]!, text: NAMES[i % 5] + " answers, turn " + i, swipe: 0 }));
  writeChat("hall", msgs, { title: "Hall", userName: USER, groupId: "g5" });
  const line = L.activeLine(msgs);
  const rand = rng(184);
  const st = L.emptyChat("hall");
  st.migrated = true;
  const facts: Fact[] = [];
  const chapters: unknown[] = [];
  for (let c = 0; c * EVERY + EVERY <= n; c++) {
    const a = c * EVERY;
    const b = a + EVERY - 1;
    chapters.push({ id: "c" + (c + 1), from: "m" + a, to: "m" + b, count: EVERY, sig: L.chapterSig(line.slice(a, b + 1)), label: "Scene " + (c + 1), text: "In scene " + (c + 1) + " the company talked and walked on.", kind: "scene", at: c + 1 });
    for (let k = 0; k < PER_CHAPTER; k++) {
      const num = facts.length + 1;
      const r = rand();
      const knownBy: Fact["knownBy"] = r < 0.65 ? "all" : r < 0.9 ? [NAMES[Math.floor(rand() * 5)]!, NAMES[Math.floor(rand() * 5)]!] : [USER];
      facts.push({ id: "f" + num, num, knownBy });
    }
  }
  st.chapters = chapters;
  st.facts = facts.map((f) => ({ id: f.id, text: "Fact " + f.num + " about the road.", subject: "world", knownBy: f.knownBy, type: "event", weight: f.num % 7 === 0 ? "key" : "everyday", status: "active", at: 1, updatedAt: 1 }));
  st.counters.chapter = chapters.length;
  st.counters.fact = facts.length;
  writeJson("litopys/chats/hall.json", st);
  return { msgs, facts };
}

const hasKey = (f: Fact, who: string[]) => f.knownBy === "all" || f.knownBy.some((k) => who.includes(k));

describe("long chat bench", () => {
  const rows: string[] = [];
  for (const n of [500, 2000, 5000]) {
    it(`${n} messages, 5 characters`, () => {
      const { msgs, facts } = build(n);
      let newExposed = 0;
      let oldExposed = 0;
      let tokens = 0;
      let ms = 0;
      let carried = 0;
      for (const nm of NAMES) {
        const t0 = performance.now();
        const res = L.llmRequest({ key: "reply", request: { sessionId: "hall", messages: [{ role: "system", content: "sys" }, { role: "user", content: "go" }] }, turn: { op: "send", chatId: "hall", speakerName: nm } }, mockHost().host);
        ms += performance.now() - t0;
        const text = res ? res.messages.map((m: any) => m.content).join("\n") : "";
        const ids = new Set([...text.matchAll(/Fact (\d+) about/g)].map((m) => Number(m[1])));
        carried += ids.size;
        for (const f of facts) {
          if (!ids.has(f.num) || f.knownBy === "all") continue;
          if (!hasKey(f, [nm])) newExposed++;
        }
        // the rule before #184: the same record, no speaker filter (whoever was present, or the player, counted)
        const before = L.buildInsert({ st: JSON.parse(fs.readFileSync(abs("litopys/chats/hall.json"), "utf8")), line: L.activeLine(msgs), dash: null, meta: { userName: USER }, cfg: { ...L.DEFAULT_CONFIG }, scanText: "go", speakerName: nm, used: {} });
        for (const id of before ? before.factIds : []) {
          const f = facts.find((x) => x.id === id)!;
          if (f.knownBy !== "all" && !hasKey(f, [nm])) oldExposed++;
        }
        tokens += JSON.parse(fs.readFileSync(abs("litopys/insert/hall.json"), "utf8")).tokens;
      }
      const kb = Math.round(fs.statSync(abs("litopys/chats/hall.json")).size / 1024);
      rows.push(`${String(n).padStart(5)} msgs | ${String(facts.length).padStart(4)} facts | record ${String(kb).padStart(5)} KB | insert ${Math.round(tokens / NAMES.length)} tok, ${(ms / NAMES.length).toFixed(1)} ms/reply | facts carried ${Math.round(carried / NAMES.length)} | exposed: new ${newExposed}, before the filter ${oldExposed}`);
      expect(newExposed).toBe(0);
      expect(ms / NAMES.length).toBeLessThan(3000);
      if (n === 5000) console.log("\n" + rows.join("\n"));
    });
  }
});
