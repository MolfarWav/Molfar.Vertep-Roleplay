import { describe, expect, it } from "bun:test";
import { L, line, mockHost, readJson, story, tick, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

function seed(chatId: string, n = 140, per = 10) {
  const msgs = story(n);
  writeChat(chatId, msgs);
  const ln = line(msgs);
  const chapters = [];
  for (let i = 0; i * per + per <= n - 20; i++) {
    const a = i * per;
    const b = a + per - 1;
    chapters.push({ id: "c" + (i + 1), from: msgs[a].id, to: msgs[b].id, count: per, sig: L.chapterSig(ln.slice(a, b + 1)), label: "Part " + (i + 1), text: "Aria and You argued about the harvest and the mill, part " + (i + 1) + ", and the miller lost his key.", kind: "scene", at: i });
  }
  writeJson(`litopys/chats/${chatId}.json`, { v: 2, chatId, migrated: true, chapters, facts: [], proposals: [], scene: { openFrom: null }, counters: { chapter: chapters.length, fact: 0, proposal: 0 }, rev: 1 });
  return { msgs, ln, chapters };
}

describe("arcs smoke", () => {
  it("offers, merges on ask, inserts the arc in place of its chapters", () => {
    writeJson("litopys/config.json", { arcThreshold: 200 });
    const { ln } = seed("ch1");
    const m = mockHost();
    tick(m, []);
    let view = L.chatView(m.host.fs, "ch1");
    expect(view.arcState.suggested).toBeTruthy();
    expect(view.arcState.suggested.chapters).toBe(8);
    const s = view.arcState.suggested;
    const res = L.arcRoute(m.host.fs, { chatId: "ch1", op: "merge", from: s.fromChapter, to: s.toChapter });
    expect(res.status).toBe(200);
    expect(res.json.arcState.queued.chapters).toBe(8);
    const { requests } = tick(m, [JSON.stringify({ arc: { label: "The mill quarrel", text: "Aria and You quarrelled over the mill; the miller lost his key." } })]);
    expect(requests.length).toBe(1);
    expect(requests[0].key.startsWith("lita_ch1_new_")).toBe(true);
    const st = readJson("litopys/chats/ch1.json");
    expect(st.arcs.length).toBe(1);
    expect(st.arcs[0].chapterIds).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]);
    expect(st.arcAsk).toBeUndefined();
    view = L.chatView(m.host.fs, "ch1");
    expect(view.arcs[0].stale).toBe(false);
    expect(view.arcs[0].fromNo).toBe(1);
    expect(view.arcs[0].toNo).toBe(80);
    const ins = L.buildInsert({ st: L.loadChatFile(m.host.fs, "ch1"), line: ln, dash: null, meta: { userName: "You" }, cfg: { ...L.loadConfig(m.host.fs), budget: 4000 }, scanText: "mill", speakerName: "Aria" });
    expect(ins.arcs).toBe(1);
    expect(ins.text).toContain("The mill quarrel");
    expect(ins.text).not.toContain("Part 1:");
    expect(ins.text).toContain("Part 12:");
    // an edited member makes the arc stale and the worker merges it again
    L.chapterRoute(m.host.fs, { chatId: "ch1", op: "edit", id: "c3", text: "The miller found his key again." });
    view = L.chatView(m.host.fs, "ch1");
    expect(view.arcs[0].stale).toBe(true);
    const again = tick(m, [JSON.stringify({ arc: { label: "The mill quarrel", text: "Aria and You quarrelled; the key was found." } })]);
    expect(again.requests[0].key.startsWith("lita_ch1_a1_")).toBe(true);
    view = L.chatView(m.host.fs, "ch1");
    expect(view.arcs[0].stale).toBe(false);
    expect(view.arcs[0].text).toContain("found");
  });

  it("auto merges by itself; snooze and delete hold the offer", () => {
    writeJson("litopys/config.json", { arcThreshold: 200, arcMode: "auto" });
    seed("ch2");
    const m = mockHost();
    const { requests } = tick(m, [JSON.stringify({ arc: { label: "x", text: "Short arc." } })]);
    expect(requests.length).toBe(1);
    expect(readJson("litopys/chats/ch2.json").arcs.length).toBe(1);
    const del = L.arcRoute(m.host.fs, { chatId: "ch2", op: "delete", id: "a1" });
    expect(del.status).toBe(200);
    expect(del.json.arcs.length).toBe(0);
    writeJson("litopys/config.json", { arcThreshold: 200, arcMode: "ask" });
    expect(L.chatView(m.host.fs, "ch2").arcState.suggested).toBeNull();
    expect(L.chatView(m.host.fs, "ch2").arcState.snoozed).toBe(true);
  });

  it("an arc longer than its chapters is refused and waits", () => {
    writeJson("litopys/config.json", { arcThreshold: 200, arcMode: "auto" });
    seed("ch3");
    const m = mockHost();
    tick(m, [JSON.stringify({ arc: { label: "x", text: "word ".repeat(400) } })]);
    const st = readJson("litopys/chats/ch3.json");
    expect(st.arcs.length).toBe(0);
    expect(st.arcFail.error).toContain("longer");
    expect(tick(m, []).requests.length).toBe(0);
  });
});
