/**
 * Who knows what (issue #184, P0/P1/P2): a character's reply carries the facts that character knows (or everyone does),
 * never what only the player or another character present knows. A narrator reply, which voices several, still gets
 * what anyone present knows. A new fact whose model said nothing about who knows it is known to the people of the
 * scene, not to everyone. `exposure` counts restricted facts that reach a speaker who does not know them: the number
 * the plan wants at zero for character replies.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();

const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
const C = (id: string, name: string, text: string): Msg => ({ id, role: "char", name, text, swipe: 0 });

const FACTS: Array<{ text: string; knownBy: "all" | string[] }> = [
  { text: "The harbour is closed for the winter.", knownBy: "all" },
  { text: "The brass key opens the hidden vault.", knownBy: ["Jude"] },
  { text: "Bram sold the old map to a stranger.", knownBy: ["Bram"] },
  { text: "The password at the cellar door is thistle.", knownBy: ["Aria", "Bram"] },
];

function seed(kind: "solo" | "swap" | "narrator", extra: Msg[] = []) {
  writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A quiet courier.", extensions: {} });
  writeJson("characters/bram/card.json", { spec: "chara_card_v2", name: "Bram", description: "A grim innkeeper.", extensions: {} });
  const msgs: Msg[] = [U("m1", "Jude knocks."), C("m2", "Aria", "Aria opens."), C("m3", "Bram", "Bram looks up."), U("m4", "Jude sits."), ...extra];
  if (kind !== "solo") writeJson("groups/g1.json", { id: "g1", name: "Tavern", generationMode: kind === "narrator" ? "narrator" : "swap", memberIds: ["aria", "bram"] });
  writeChat("tav", msgs, { title: "Tavern", userName: "Jude", ...(kind === "solo" ? { characterId: "aria" } : { groupId: "g1" }) });
  const st = L.emptyChat("tav");
  st.migrated = true;
  st.facts = FACTS.map((f, i) => ({ id: "f" + (i + 1), text: f.text, subject: "world", knownBy: f.knownBy, type: "event", weight: "everyday", status: "active", at: 1, updatedAt: 1 }));
  st.counters.fact = FACTS.length;
  writeJson("litopys/chats/tav.json", st);
}

const ctx = (speakerName: string) => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] },
  turn: { op: "send", chatId: "tav", speakerName },
});
const textOf = (res: any) => (res ? res.messages.map((m: any) => m.content).join("\n") : "");

/** Restricted facts in the prompt that this speaker is not among the knowers of. */
function exposure(text: string, speaker: string[]) {
  const mine = new Set(speaker.map((s) => s.toLowerCase()));
  return FACTS.filter((f) => f.knownBy !== "all" && text.includes(f.text) && !f.knownBy.some((k) => mine.has(k.toLowerCase()))).length;
}

describe("omniscience: the insert filters by who speaks", () => {
  it("a 1:1 reply never carries what only the player knows", () => {
    seed("solo");
    const text = textOf(L.llmRequest(ctx("Aria"), mockHost().host));
    expect(text).toContain("The harbour is closed");
    expect(text).toContain("thistle");
    expect(text).not.toContain("hidden vault");
    expect(text).not.toContain("old map");
    expect(exposure(text, ["Aria"])).toBe(0);
  });

  it("a group member gets its own secrets and the shared ones, not another's", () => {
    seed("swap");
    const aria = textOf(L.llmRequest(ctx("Aria"), mockHost().host));
    expect(aria).toContain("thistle");
    expect(aria).not.toContain("old map");
    expect(aria).not.toContain("hidden vault");
    expect(exposure(aria, ["Aria"])).toBe(0);
    const bram = textOf(L.llmRequest(ctx("Bram"), mockHost().host));
    expect(bram).toContain("old map");
    expect(bram).toContain("thistle");
    expect(bram).not.toContain("hidden vault");
    expect(exposure(bram, ["Bram"])).toBe(0);
  });

  it("a narrator voicing the group still gets what anyone present knows", () => {
    seed("narrator");
    const text = textOf(L.llmRequest(ctx("Tavern"), mockHost().host));
    for (const f of FACTS) expect(text).toContain(f.text);
  });
});

describe("omniscience: a new fact with no usable knownBy", () => {
  const scene = (ln: any[]) => ({ from: ln[0].id, to: ln[3].id, fromIdx: 0, toIdx: 3, count: 4, kind: "scene", label: "" });
  const apply = (facts: any[], witnesses?: string[]) => {
    const ln = L.activeLine([U("m1", "Jude knocks."), C("m2", "Aria", "Aria opens."), C("m3", "Bram", "Bram looks up."), U("m4", "Jude sits.")]);
    const st = L.emptyChat("tav");
    L.applyWorkerResult(st, { scene: scene(ln), replaces: null }, L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" }, facts })), { now: 1, line: ln, ...(witnesses ? { witnesses } : {}) });
    return st.facts.map((f: any) => f.knownBy);
  };

  it("falls back to the scene's people, not to everyone", () => {
    expect(apply([{ op: "add", text: "A", subject: "world" }, { op: "add", text: "B", subject: "world", knownBy: [] }, { op: "add", text: "C", subject: "world", knownBy: [" ", ""] }], ["Aria", "Bram"])).toEqual([["Aria", "Bram"], ["Aria", "Bram"], ["Aria", "Bram"]]);
  });

  it("keeps an explicit \"all\" and an explicit list", () => {
    expect(apply([{ op: "add", text: "A", subject: "world", knownBy: "all" }, { op: "add", text: "B", subject: "world", knownBy: ["Bram"] }], ["Aria", "Bram"])).toEqual(["all", ["Bram"]]);
  });

  it("is \"all\" when the scene has no named people", () => {
    expect(apply([{ op: "add", text: "A", subject: "world" }])).toEqual(["all"]);
  });
});

describe("omniscience: bench, exposure by chat size", () => {
  // a long synthetic chat: 5 characters, a restricted fact for each and one for the player, many replies
  const NAMES = ["Aria", "Bram", "Cael", "Dara", "Eno"];
  function longChat(n: number) {
    for (const nm of NAMES) writeJson("characters/" + nm.toLowerCase() + "/card.json", { spec: "chara_card_v2", name: nm, description: nm, extensions: {} });
    writeJson("groups/g5.json", { id: "g5", name: "Hall", generationMode: "swap", memberIds: NAMES.map((x) => x.toLowerCase()) });
    const msgs: Msg[] = Array.from({ length: n }, (_, i) => (i % 6 === 0 ? U("m" + i, "Jude speaks, turn " + i) : C("m" + i, NAMES[i % 5], NAMES[i % 5] + " answers, turn " + i)));
    writeChat("hall", msgs, { title: "Hall", userName: "Jude", groupId: "g5" });
    const st = L.emptyChat("hall");
    st.migrated = true;
    st.facts = [
      ...NAMES.map((nm, i) => ({ id: "s" + i, text: nm + " keeps a private secret number " + i + ".", subject: nm, knownBy: [nm], type: "trait", weight: "important", status: "active", at: 1, updatedAt: 1 })),
      { id: "p", text: "Only Jude knows the player's plan.", subject: "world", knownBy: ["Jude"], type: "plan", weight: "important", status: "active", at: 1, updatedAt: 1 },
    ];
    st.counters.fact = st.facts.length;
    writeJson("litopys/chats/hall.json", st);
    return msgs;
  }

  for (const n of [500, 2000]) {
    it(`no restricted fact reaches another speaker in ${n} messages`, () => {
      longChat(n);
      let leaked = 0;
      let ms = 0;
      for (const nm of NAMES) {
        const t0 = performance.now();
        const text = textOf(L.llmRequest({ key: "reply", request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "go" }] }, turn: { op: "send", chatId: "hall", speakerName: nm } }, mockHost().host));
        ms += performance.now() - t0;
        for (const other of NAMES.filter((x) => x !== nm)) if (text.includes(other + " keeps a private secret")) leaked++;
        if (text.includes("player's plan")) leaked++;
        expect(text).toContain(nm + " keeps a private secret");
      }
      expect(leaked).toBe(0);
      // a coarse ceiling, to see a collapse and nothing else
      expect(ms / NAMES.length).toBeLessThan(2000);
    });
  }
});

describe("omniscience: the who-knows-what brief for a narrator (#184 P1d)", () => {
  const cfgOn = () => writeJson("litopys/config.json", { castKnowledge: true });

  it("is on by default, and off when the setting says so", () => {
    seed("narrator");
    expect(textOf(L.llmRequest(ctx("Tavern"), mockHost().host))).toContain("[Who knows what (Litopys)");
    writeJson("litopys/config.json", { castKnowledge: false });
    expect(textOf(L.llmRequest(ctx("Tavern"), mockHost().host))).not.toContain("Who knows what");
  });

  it("lists facts only some of those present know, grouped by who knows them", () => {
    seed("narrator");
    cfgOn();
    const text = textOf(L.llmRequest(ctx("Tavern"), mockHost().host));
    expect(text).toContain("[Who knows what (Litopys)");
    expect(text).toContain("Only Jude knows: The brass key opens the hidden vault.");
    expect(text).toContain("Only Bram knows: Bram sold the old map to a stranger.");
    expect(text).toContain("Only Aria and Bram know: The password at the cellar door is thistle.");
    // a fact everyone knows is not repeated in the brief
    expect(text.split("[Who knows what")[1]).not.toContain("harbour");
  });

  it("is not added to a single character's reply, which is filtered already", () => {
    seed("swap");
    cfgOn();
    expect(textOf(L.llmRequest(ctx("Aria"), mockHost().host))).not.toContain("Who knows what");
  });

  it("stays within its room and says nothing when everyone knows everything", () => {
    seed("narrator");
    cfgOn();
    const full = L.castKnowledgeFor({ st: { facts: Array.from({ length: 40 }, (_, i) => ({ id: "f" + i, text: "Secret number " + i + " of the long night.", subject: "world", knownBy: ["Bram"], status: "active" })) }, line: L.activeLine([{ id: "m1", role: "char", name: "Aria", text: "x" }, { id: "m2", role: "char", name: "Bram", text: "y" }]), dash: null, meta: { userName: "Jude" }, speakerName: "" });
    expect(full.tokens).toBeLessThanOrEqual(250);
    const none = L.castKnowledgeFor({ st: { facts: [{ id: "f1", text: "Shared.", subject: "world", knownBy: ["Aria", "Bram", "Jude"], status: "active" }] }, line: L.activeLine([{ id: "m1", role: "char", name: "Aria", text: "x" }, { id: "m2", role: "char", name: "Bram", text: "y" }]), dash: null, meta: { userName: "Jude" }, speakerName: "" });
    expect(none).toBeNull();
  });
});

describe("omniscience: chapters follow who witnessed them (#184 P2)", () => {
  const msgs: Msg[] = Array.from({ length: 80 }, (_, i) => (i % 5 === 0 ? U("m" + i, "Jude says line " + i) : C("m" + i, i % 2 ? "Aria" : "Bram", "answer " + i)));
  const line = L.activeLine(msgs);
  const chapter = (id: string, a: number, cast?: string[]) => ({ id, from: "m" + a, to: "m" + (a + 5), count: 6, sig: L.chapterSig(line.slice(a, a + 6)), label: "Scene " + id, text: "Text of chapter " + id + ".", kind: "scene", at: a, ...(cast ? { cast } : {}) });
  const record = (extra: Record<string, unknown> = {}) => {
    const st = L.emptyChat("hall");
    st.migrated = true;
    st.chapters = [chapter("c1", 0, ["Bram"]), chapter("c2", 6, ["Aria", "Bram"]), chapter("c3", 12), chapter("c4", 18, ["Cael"])];
    st.counters.chapter = 4;
    Object.assign(st, extra);
    return st;
  };
  const head = (st: any, voices?: Set<string>) => {
    const r = L.buildInsert({ st, line, dash: null, meta: { userName: "Jude" }, cfg: { ...L.DEFAULT_CONFIG, budget: 4000 }, scanText: "go", speakerName: "Aria", used: {}, voices });
    return r ? r.head + "\n" + r.tail : "";
  };

  it("leaves out a chapter the speaker did not witness; one without a cast is visible to all", () => {
    const aria = head(record(), new Set(["aria"]));
    expect(aria).not.toContain("Text of chapter c1.");
    expect(aria).toContain("Text of chapter c2.");
    expect(aria).toContain("Text of chapter c3.");
    expect(aria).not.toContain("Text of chapter c4.");
    const bram = head(record(), new Set(["bram"]));
    expect(bram).toContain("Text of chapter c1.");
    expect(bram).toContain("Text of chapter c2.");
    expect(bram).not.toContain("Text of chapter c4.");
  });

  it("a reply that voices several gets every chapter", () => {
    const all = head(record());
    for (const id of ["c1", "c2", "c3", "c4"]) expect(all).toContain("Text of chapter " + id + ".");
  });

  it("an arc that holds a chapter the speaker did not see is left out, its witnessed chapters ride alone", () => {
    const st = record();
    st.arcs = [{ id: "a1", chapterIds: ["c1", "c2"], from: "m0", to: "m11", label: "Arc A", text: "Text of arc a1.", sig: L.arcSig([st.chapters[0], st.chapters[1]]), at: 1 }];
    st.counters.arc = 1;
    expect(head(st)).toContain("Text of arc a1.");
    const aria = head(st, new Set(["aria"]));
    expect(aria).not.toContain("Text of arc a1.");
    expect(aria).toContain("Text of chapter c2.");
    expect(aria).not.toContain("Text of chapter c1.");
    const bram = head(st, new Set(["bram"]));
    expect(bram).toContain("Text of arc a1.");
  });

  it("the worker keeps the scene's people as the chapter's cast", () => {
    const ln = L.activeLine([U("m1", "Jude knocks."), C("m2", "Aria", "Aria opens."), C("m3", "Bram", "Bram looks up."), U("m4", "Jude sits.")]);
    const st = L.emptyChat("hall");
    const scene = { from: ln[0].id, to: ln[3].id, fromIdx: 0, toIdx: 3, count: 4, kind: "scene", label: "" };
    const parsed = L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" } }));
    L.applyWorkerResult(st, { scene, replaces: null }, parsed, { now: 1, line: ln, witnesses: ["Aria", "Bram"] });
    expect(st.chapters[0].cast).toEqual(["Aria", "Bram"]);
    const none = L.emptyChat("hall");
    L.applyWorkerResult(none, { scene, replaces: null }, parsed, { now: 1, line: ln });
    expect(none.chapters[0].cast).toBeUndefined();
    expect(L.witnessed({ cast: ["Cael"] }, new Set(["aria"]))).toBe(false);
    expect(L.witnessed({ cast: ["Cael"] }, null)).toBe(true);
    expect(L.witnessed({}, new Set(["aria"]))).toBe(true);
  });
});

describe("omniscience: a flagged leak is held back from the story record (#184 P3)", () => {
  const ln = L.activeLine([U("m1", "Where did the map go?"), C("m2", "Aria", "Bram sold the guild's map to the Duke's spy, I am sure."), C("m3", "Bram", "Bram scowls."), U("m4", "Hm.")]);
  const scene = { from: ln[0].id, to: ln[3].id, fromIdx: 0, toIdx: 3, count: 4, kind: "scene", label: "" };
  const dash = { leaks: { "m2#0": { at: 1, items: [{ who: "Aria", factId: "f1", text: "Bram sold the guild's map to the Duke's spy.", quote: "Bram sold the guild's map", status: "open" }] } } };
  const fact = (text: string, knownBy: unknown) => L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" }, facts: [{ op: "add", text, subject: "world", knownBy }] }));

  it("finds the open hits of the scene's replies, and none once answered or outside it", () => {
    expect(L.heldLeaks(dash, ln, scene)).toEqual([{ who: "Aria", texts: ["Bram sold the guild's map to the Duke's spy.", "Bram sold the guild's map"] }]);
    const answered = { leaks: { "m2#0": { items: [{ who: "Aria", text: "x", status: "ignored" }] } } };
    expect(L.heldLeaks(answered, ln, scene)).toEqual([]);
    expect(L.heldLeaks(dash, ln, { ...scene, fromIdx: 2, toIdx: 3 })).toEqual([]);
    expect(L.heldLeaks(null, ln, scene)).toEqual([]);
  });

  it("a new fact that says what leaked does not make the leaking character a knower; other facts are untouched", () => {
    const held = L.heldLeaks(dash, ln, scene);
    const run = (parsed: any) => {
      const st = L.emptyChat("hall");
      L.applyWorkerResult(st, { scene, replaces: null }, parsed, { now: 1, line: ln, witnesses: ["Aria", "Bram"], held });
      return st.facts[0].knownBy;
    };
    expect(run(fact("Aria knows that Bram sold the map to the Duke's spy.", ["Aria", "Bram"]))).toEqual(["Bram"]);
    expect(run(fact("Bram sold the guild's map to the spy.", "all"))).toEqual(["Bram"]);
    expect(run(fact("Aria wears a green cloak.", ["Aria", "Bram"]))).toEqual(["Aria", "Bram"]);
  });

  it("the worker is told which reply is not canon", () => {
    const st = L.emptyChat("hall");
    const req = L.buildWorkerRequest(st, { scene, replaces: null }, ln, dash, { ...L.DEFAULT_CONFIG }, { userName: "You" });
    const text = req.messages.map((m: any) => m.content).join("\n");
    expect(text).toContain("Not canon (flagged)");
    expect(text).toContain("Do not record that Aria knows it.");
    expect(L.buildWorkerRequest(st, { scene, replaces: null }, ln, null, { ...L.DEFAULT_CONFIG }, { userName: "You" }).messages.map((m: any) => m.content).join("\n")).not.toContain("Not canon");
  });
});

describe("omniscience: the user says a character found out (#184 P3)", () => {
  it("adds the name to the fact's knowers, once, and leaves an \"all\" fact alone", () => {
    seed("swap");
    const { host } = mockHost();
    const call = (id: string, who: string) => L.handleRoute({ method: "POST", path: "/litopys/facts", query: {}, body: { chatId: "tav", op: "know", id, who } }, host);
    expect(call("f3", "Aria").status).toBe(200);
    expect(readJson("litopys/chats/tav.json").facts.find((f: any) => f.id === "f3").knownBy).toEqual(["Bram", "Aria"]);
    expect(call("f3", "aria").status).toBe(200);
    expect(readJson("litopys/chats/tav.json").facts.find((f: any) => f.id === "f3").knownBy).toEqual(["Bram", "Aria"]);
    expect(call("f1", "Aria").status).toBe(200);
    expect(readJson("litopys/chats/tav.json").facts.find((f: any) => f.id === "f1").knownBy).toBe("all");
    expect(call("f3", "").status).toBe(400);
    expect(call("f99", "Aria").status).toBe(404);
  });
});
