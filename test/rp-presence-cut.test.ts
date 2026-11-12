/**
 * The presence cut (Molfar.Vertep#289): a reply spoken by one character does not get the recent messages of scenes that
 * character was not in. Who was there is the Dashboard's `present` of the message's snapshot (a player's message takes
 * the snapshot of the reply that answers it). A run of cut messages becomes one system line; the speaker's own messages, the
 * newest message and anything unknown stay; a speaker the Dashboard never lists cuts nothing.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson, useRoot, writeChat, writeDash, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();
const RP = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
const C = (id: string, name: string, text: string): Msg => ({ id, role: "char", name, text, swipe: 0 });

/** The request the engine would build: a system block, then every message of the chat as its own turn. */
function request(msgs: Msg[]) {
  return [{ role: "system", content: "sys" }, ...msgs.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: (m.role === "user" ? "" : m.name + ": ") + m.text }))];
}
const histOf = (msgs: Msg[]) => msgs.map((m) => ({ id: m.id, h: L.promptHash(m.role === "user" ? "user" : "assistant", (m.role === "user" ? "" : m.name + ": ") + m.text) }));
const voices = (...n: string[]) => new Set(n.map((x) => x.toLowerCase()));
const dashOf = (present: Record<string, string[]>, place: Record<string, string> = {}) => {
  const snapshots: Record<string, unknown> = {};
  for (const [id, p] of Object.entries(present)) snapshots[id + "#0"] = { present: p, clock: { place: place[id] ?? "" } };
  return { snapshots };
};

// Bram leaves after m3; m4-m7 happen without him; m8 he is back.
const STORY: Msg[] = [
  U("m1", "Jude knocks."),
  C("m2", "Aria", "Aria opens the door."),
  C("m3", "Bram", "Bram nods and walks out."),
  U("m4", "Jude whispers a secret to Aria."),
  C("m5", "Aria", "Aria leans in."),
  U("m6", "Jude hands her the key."),
  C("m7", "Aria", "Aria hides it."),
  U("m8", "Jude calls Bram back."),
  C("m9", "Bram", "Bram returns."),
  U("m10", "Jude asks what he heard."),
];
const PRESENT = {
  m2: ["Aria", "Bram", "Jude"],
  m3: ["Aria", "Bram", "Jude"],
  m5: ["Aria", "Jude"],
  m7: ["Aria", "Jude"],
  m9: ["Aria", "Bram", "Jude"],
};
const run = (speaker: string, over: Partial<Parameters<typeof L.presenceCutFor>[0]> = {}, msgs = STORY, present: Record<string, string[]> = PRESENT, place: Record<string, string> = {}) =>
  L.presenceCutFor({
    messages: request(msgs),
    hist: histOf(msgs),
    line: L.activeLine(msgs),
    dash: dashOf(present, place),
    speakerName: speaker,
    voices: voices(speaker),
    canon: (n: string) => n,
    ...over,
  });
const texts = (r: any) => r.messages.map((m: any) => m.content);

describe("the presence cut", () => {
  it("leaves out the messages of a scene the speaker was not in, as one line", () => {
    const r = run("Bram");
    // m4 belongs to the snapshot of m5 (Aria, Jude), m5 and m6 and m7 too: four messages without Bram
    expect(r.cut).toBe(4);
    const t = texts(r);
    expect(t).not.toContain("Jude whispers a secret to Aria.");
    expect(t).not.toContain("Aria: Aria hides it.");
    expect(t.filter((x: string) => x.includes("was not here"))).toEqual(["[Bram was not here: 4 messages]"]);
    // the line sits where the run began; the neighbours stay
    expect(t.indexOf("[Bram was not here: 4 messages]")).toBe(t.indexOf("Bram: Bram nods and walks out.") + 1);
    expect(t).toContain("Jude calls Bram back.");
  });

  it("keeps the speaker's own messages even when the snapshot lists the speaker as gone", () => {
    const own = run("Bram", {}, STORY, { ...PRESENT, m3: ["Aria", "Jude"] });
    expect(texts(own)).toContain("Bram: Bram nods and walks out.");
  });

  it("the other character in a group does not lose the scene it was in", () => {
    const r = run("Aria");
    expect(r.cut).toBe(0);
    expect(texts(r)).toContain("Jude whispers a secret to Aria.");
  });

  it("a message with no snapshot stays; the newest message always stays", () => {
    const noSnap = { ...PRESENT } as Record<string, string[]>;
    delete noSnap.m5;
    const r = run("Bram", {}, STORY, noSnap);
    // m5 has none, so m4 (which reads the next reply's snapshot, m5) and m5 stay; m6 and m7 go
    expect(texts(r)).toContain("Aria: Aria leans in.");
    expect(texts(r)).toContain("Jude whispers a secret to Aria.");
    expect(r.cut).toBe(2);
    // the newest message is never cut, however the snapshot reads
    const lastOnly = run("Bram", {}, STORY.slice(0, 7), { m2: ["Aria", "Bram"], m5: ["Aria"], m7: ["Aria"] });
    expect(texts(lastOnly)[texts(lastOnly).length - 1]).toBe("Aria: Aria hides it.");
  });

  it("cuts nothing when the speaker is on no snapshot (a name the Dashboard does not match)", () => {
    const r = run("Bramwell", { voices: voices("Bramwell") });
    expect(r.cut ?? 0).toBe(0);
    expect(r.reason).toContain("no Dashboard snapshot");
  });

  it("cuts nothing without one voice (a narrator or a roster turn)", () => {
    expect(run("Bram", { voices: null as any }).reason).toBe("not one voice");
    expect(run("Bram", { voices: new Set() }).reason).toBe("not one voice");
  });

  it("a name the registry resolves counts as the speaker", () => {
    const canon = (n: string) => (n.toLowerCase() === "bramwell" ? "Bram" : n);
    // no snapshot lists "Bram" itself, so without the registry the speaker is nowhere and nothing is cut
    const r = run("Bram", {}, STORY, { ...PRESENT, m2: ["Aria", "Bramwell", "Jude"], m3: ["Aria", "Bramwell", "Jude"], m9: ["Aria", "Bramwell", "Jude"] }, {});
    expect(r.cut ?? 0).toBe(0);
    const same = L.presenceCutFor({
      messages: request(STORY),
      hist: histOf(STORY),
      line: L.activeLine(STORY),
      dash: dashOf({ ...PRESENT, m2: ["Aria", "Bramwell", "Jude"], m3: ["Aria", "Bramwell", "Jude"], m9: ["Aria", "Bramwell", "Jude"] }),
      speakerName: "Bram",
      voices: voices("Bram"),
      canon,
    });
    expect(same.cut).toBe(4);
  });

  it("a message it cannot find in the request stays", () => {
    const messages = request(STORY);
    messages[6] = { role: "user", content: "Jude hands her the key. [edited by another plugin]" };
    const r = L.presenceCutFor({ messages, hist: histOf(STORY), line: L.activeLine(STORY), dash: dashOf(PRESENT), speakerName: "Bram", voices: voices("Bram"), canon: (n: string) => n });
    expect(texts(r)).toContain("Jude hands her the key. [edited by another plugin]");
    // the run is broken in two: m4+m5 and m7
    expect(texts(r).filter((x: string) => x.includes("was not here")).length).toBe(2);
  });

  it("says Bram was within earshot when the scene's place did not change after he left", () => {
    const place = { m3: "the tavern", m5: "the tavern", m7: "the tavern" };
    const r = run("Bram", {}, STORY, PRESENT, place);
    const line = texts(r).find((x: string) => x.includes("within earshot"));
    expect(line).toBe("[Bram was out of the room, within earshot, for 4 messages: Bram heard voices and noise, not the words]");
    // the scene moved to another place: he was simply not there
    const moved = run("Bram", {}, STORY, PRESENT, { m3: "the tavern", m5: "a ship far out at sea", m7: "a ship far out at sea" });
    expect(texts(moved).some((x: string) => x.includes("within earshot"))).toBe(false);
    expect(texts(moved)).toContain("[Bram was not here: 4 messages]");
  });
});

describe("the presence cut inside the Litopys hook", () => {
  const seed = (extra: Record<string, unknown> = {}) => {
    writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A courier.", extensions: {} });
    writeJson("characters/bram/card.json", { spec: "chara_card_v2", name: "Bram", description: "An innkeeper.", extensions: {} });
    writeJson("groups/g1.json", { id: "g1", name: "Tavern", generationMode: "swap", memberIds: ["aria", "bram"] });
    writeChat("tav", STORY, { title: "Tavern", userName: "Jude", groupId: "g1", ...extra });
    const snaps: Record<string, any> = {};
    for (const [id, p] of Object.entries(PRESENT)) snaps[id] = { present: p };
    writeDash("tav", snaps);
    writeJson("litopys/prompt-cut/tav.json", { count: 0, upTo: null, hist: histOf(STORY) });
  };
  const ctx = (speakerName: string) => ({ key: "reply", request: { messages: request(STORY) }, turn: { op: "send", chatId: "tav", speakerName } });

  it("a group reply by the absent member loses the scene, and the trace says how many", () => {
    seed();
    const res = L.llmRequest(ctx("Bram"), mockHost().host);
    const t = res.messages.map((m: any) => m.content).join("\n");
    expect(t).toContain("[Bram was not here: 4 messages]");
    expect(t).not.toContain("Jude whispers a secret to Aria.");
    expect(res.promptSources.parts.some((p: any) => /Presence/.test(p.label))).toBe(true);
    expect(readJson("litopys/insert/tav.json").presence).toEqual({ cut: 4, runs: 1, near: 0, speaker: "Bram" });
  });

  it("the member who was there keeps everything, and nothing is returned when nothing changed", () => {
    seed();
    expect(L.llmRequest(ctx("Aria"), mockHost().host)).toBeNull();
  });

  it("the chat's own switch and the Library setting turn it off", () => {
    seed({ promptBoard: { off: ["plugin:presence"] } });
    expect(L.llmRequest(ctx("Bram"), mockHost().host)).toBeNull();
    seed();
    writeJson("litopys/config.json", { presenceCut: "off" });
    expect(L.llmRequest(ctx("Bram"), mockHost().host)).toBeNull();
  });

  it("a card chat is left alone unless the setting says every chat", () => {
    writeJson("characters/bram/card.json", { spec: "chara_card_v2", name: "Bram", description: "An innkeeper.", extensions: {} });
    writeChat("tav", STORY, { title: "Tavern", userName: "Jude", characterId: "bram" });
    const snaps: Record<string, any> = {};
    for (const [id, p] of Object.entries(PRESENT)) snaps[id] = { present: p };
    writeDash("tav", snaps);
    writeJson("litopys/prompt-cut/tav.json", { count: 0, upTo: null, hist: histOf(STORY) });
    expect(L.llmRequest(ctx("Bram"), mockHost().host)).toBeNull();
    writeJson("litopys/config.json", { presenceCut: "all" });
    const res = L.llmRequest(ctx("Bram"), mockHost().host);
    expect(res.messages.map((m: any) => m.content).join("\n")).toContain("was not here");
  });

  it("the config keeps only known modes", () => {
    seed();
    expect(L.patchConfig(mockHost().host.fs, { presenceCut: "all" }).presenceCut).toBe("all");
    expect(L.patchConfig(mockHost().host.fs, { presenceCut: "nonsense" }).presenceCut).toBe("groups");
  });
});

describe("remote contact: what reaches the far character (#289)", () => {
  it("a sentence per kind of contact says what the far character perceives", () => {
    expect(RP.remoteSenses("text", ["Bram"], "Ada")).toBe("Bram knows only the words Ada sends; what Ada does meanwhile, Bram does not know.");
    expect(RP.remoteSenses("call", ["Bram"], "Ada")).toContain("only hears Ada: the voice and the sounds near the phone");
    expect(RP.remoteSenses("video", ["Bram", "Cy"], "Ada")).toBe("Bram, Cy see only what is in Ada's camera and hear what is near it.");
    expect(RP.remoteSenses("none", ["Bram"], "Ada")).toBe("");
    expect(RP.remoteSenses("text", [], "Ada")).toBe("");
  });
});

describe("the engine and Litopys hash a prompt message the same way", () => {
  it("promptHash is one function in two plugins, and the engine records the hashes of the history it sent", async () => {
    const fs = await import("node:fs");
    const body = (file: string) => {
      const src = fs.readFileSync(new URL(`../plugins/${file}/plugin.js`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
      const at = src.indexOf("function promptHash(");
      expect(at).toBeGreaterThan(0);
      return src.slice(at, src.indexOf("\n}\n", at) + 3);
    };
    expect(body("engine")).toBe(body("litopys"));
    const engine = fs.readFileSync(new URL("../plugins/engine/plugin.js", import.meta.url), "utf8");
    expect(engine).toContain("hist }));");
    expect(engine).toContain("promptHash(h.role, h.content)");
  });
});

describe("the viewpoint character is the speaker (#392)", () => {
  it("reads the name from the stage direction block of the newest turn", () => {
    const sys = { role: "system", content: "[Stage directions, an out-of-character instruction.\n- Continue the story from Alice's point of view.]" };
    expect(L.povNameOf([{ role: "user", content: "hi" }, sys])).toBe("Alice");
    expect(L.povNameOf([{ role: "user", content: "text\n\nStage directions for this reply:\n- Continue the story from Влад's point of view." }])).toBe("Влад");
    expect(L.povNameOf([{ role: "user", content: "hi" }])).toBe("");
    expect(L.povNameOf([sys, ...Array.from({ length: 4 }, () => ({ role: "user", content: "later" }))])).toBe("");
    expect(L.povNameOf(null)).toBe("");
  });

  it("a narrator chat with no sole voice still cuts a scene the viewpoint character missed", () => {
    // every message is the narrator card's: no speaker name to cut for, only the viewpoint name
    const msgs: Msg[] = [
      U("m1", "Jude knocks."),
      C("m2", "Narrator", "Bram is alone in the lab and hides the key in his bag."),
      U("m3", "Jude goes to the hall."),
      C("m4", "Narrator", "Aria waits in the hall."),
      U("m5", "Continue."),
    ];
    const r = run("Aria", {}, msgs, { m2: ["Bram"], m4: ["Aria", "Jude"] });
    expect(r.cut).toBeGreaterThan(0);
    expect(JSON.stringify(r.messages)).not.toContain("hides the key");
    expect(JSON.stringify(r.messages)).toContain("Aria was not here");
  });
});
