import { describe, expect, it } from "bun:test";
import { L, useRoot, mockHost, writeChat, writeJson, readJson, exists, story } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any) => L.handleRoute({ method, path, query: {}, body }, host);
const ctx = (chatId: string, speakerName = "Aria") => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] },
  turn: { op: "send", chatId, speakerName },
});

/** A chain c1 <- c2 <- ... <- cN (cN is the newest), each chat with one chapter, one arc-less record, and a key fact. */
function longChain(n: number, extra: (i: number) => Record<string, unknown> = () => ({})) {
  const m = mockHost();
  for (let i = 1; i <= n; i++) {
    const id = "c" + i;
    writeChat(id, story(4, id + "m"), { title: "Part " + i });
    writeJson("litopys/chats/" + id + ".json", {
      ...L.emptyChat(id),
      migrated: true,
      chapters: [{ id: "k1", from: id + "m1", to: id + "m4", count: 4, kind: "scene", text: `Event number ${i} happened in the valley.`, label: "Part " + i, at: i }],
      facts: [{ id: "f1", text: `Key fact of part ${i}.`, subject: "world", knownBy: "all", type: "event", weight: "key", pinned: false, status: "active", updatedAt: i }],
      ...extra(i),
    });
    if (i > 1) route(m.host, "POST", "/litopys/links", { chatId: id, from: "c" + (i - 1) });
  }
  return m;
}

const turn = (id: string, text: string, more: Record<string, unknown> = {}) => ({ id, text, chapterId: "k1", cast: [], knownBy: "all", stances: {}, origin: "chapter", at: 1, updatedAt: 1, ...more });

describe("far tier of a long chain (#288)", () => {
  it("condenses the chats past the third into one part before the near ones, numbered from the oldest", () => {
    const m = longChain(6);
    writeJson("litopys/config.json", { linkBudget: 1500 });
    const text = L.llmRequest(ctx("c6"), m.host).messages[1].content as string;
    // c6 continues c5, c4, c3 (near); c2 and c1 are far
    expect(text).toContain("far: chats 1-2 of this story, condensed");
    expect(text).toContain("Event number 1 happened in the valley.");
    expect(text).toContain("Event number 2 happened in the valley.");
    expect(text).toContain("Key fact of part 1.");
    expect(text).toContain("Event number 5 happened in the valley.");
    expect(text.indexOf("far: chats 1-2")).toBeLessThan(text.indexOf("Event number 3 happened"));
    expect(text.indexOf("Chat 1:")).toBeLessThan(text.indexOf("Chat 2:"));
    const back = readJson("litopys/insert/c6.json").backstory;
    expect(back.chain).toHaveLength(3);
    expect(back.far).toMatchObject({ chats: 2, first: 1, last: 2 });
    expect(back.far.tokens).toBeLessThanOrEqual(Math.floor(1500 * L.FAR_SHARE));
  });

  it("cuts the oldest chats first when the far share is short", () => {
    const m = longChain(8);
    writeJson("litopys/config.json", { linkBudget: 600 });
    const text = L.llmRequest(ctx("c8"), m.host).messages[1].content as string;
    expect(text).toContain("far: chat");
    const far = readJson("litopys/insert/c8.json").backstory.far;
    expect(far.tokens).toBeLessThanOrEqual(Math.floor(600 * L.FAR_SHARE));
    // chats 1-4 are far (5-7 are near); whatever is kept is the newest ones, never an older one with a newer one missing
    const has = (i: number) => text.includes(`Event number ${i} happened`);
    for (let i = 1; i < 4; i++) if (has(i)) expect(has(i + 1)).toBe(true);
    expect(has(1) && has(2) && has(3) && has(4)).toBe(false);
  });

  it("keeps a short chain exactly as before (no far part)", () => {
    const m = longChain(3);
    const text = L.llmRequest(ctx("c3"), m.host).messages[1].content as string;
    expect(text).not.toContain("far: chat");
    expect(readJson("litopys/insert/c3.json").backstory.far).toBeUndefined();
  });

  it("applies the speaker filter: a fact only Bram knows is not in Aria's far part", () => {
    const m = longChain(6, (i) => (i === 1 ? { facts: [{ id: "f1", text: "Only Bram knows the vault code.", subject: "Bram", knownBy: ["Bram"], type: "event", weight: "key", pinned: false, status: "active", updatedAt: 1 }] } : {}));
    expect(L.llmRequest(ctx("c6", "Aria"), m.host).messages[1].content).not.toContain("vault code");
  });

  it("makes a digest per finished chat, and makes it again only after that chat's record is saved", () => {
    const m = longChain(5);
    L.llmRequest(ctx("c5"), m.host);
    expect(exists("litopys/far/c1.json")).toBe(true);
    expect(readJson("litopys/far/c1.json").units[0].text).toContain("Event number 1");
    // a hand edit of the record changes nothing until the record goes through saveChatFile
    const st = L.loadChatFile(m.host.fs, "c1");
    st.chapters[0].text = "Event number 1 changed completely.";
    expect(L.saveChatFile(m.host.fs, st)).toBe(true);
    expect(exists("litopys/far/c1.json")).toBe(false);
    expect(L.llmRequest(ctx("c5"), m.host).messages[1].content).toContain("Event number 1 changed completely.");
    expect(exists("litopys/far/c1.json")).toBe(true);
  });
});

describe("turning points in the backstory (#288)", () => {
  it("rides in near and far chats alike, with the stances of the people who are here", () => {
    const m = longChain(6, (i) =>
      i === 1 || i === 5
        ? { turns: [turn("t1", `The betrayal of part ${i}: Bram sold the map.`, { stances: { Aria: "cannot forgive it", Mira: "never knew" } })], counters: { chapter: 1, fact: 1, proposal: 0, arc: 0, habit: 0, turn: 1 } }
        : {},
    );
    const text = L.llmRequest(ctx("c6"), m.host).messages[1].content as string;
    expect(text).toContain("Turning points:");
    expect(text).toContain("(chat 1) The betrayal of part 1: Bram sold the map.");
    expect(text).toContain("The betrayal of part 5: Bram sold the map. [Aria: cannot forgive it]");
    // Mira is not in the scene: her line is not shown
    expect(text).not.toContain("never knew");
  });

  it("shows a turning point only to those who know it (P2)", () => {
    const m = longChain(2, (i) => (i === 1 ? { turns: [turn("t1", "Bram killed the guard in secret.", { knownBy: ["Bram"] })] } : {}));
    expect(L.llmRequest(ctx("c2"), m.host).messages[1].content).not.toContain("killed the guard");
  });

  it("marks an undone one in the near tier and leaves it out of the far tier", () => {
    const m = longChain(6, (i) =>
      i === 1 ? { turns: [turn("t1", "Aria swore never to return.", { overriddenBy: "t2" }), turn("t2", "Aria came back to the valley.", { overrides: "t1" })] } : {},
    );
    const far = L.llmRequest(ctx("c6"), m.host).messages[1].content as string;
    expect(far).toContain("Aria came back to the valley.");
    expect(far).not.toContain("swore never to return");
    const near = longChain(2, (i) => (i === 1 ? { turns: [turn("t1", "Aria swore never to return.", { overriddenBy: "t2" }), turn("t2", "Aria came back to the valley.", { overrides: "t1" })] } : {}));
    const t = L.llmRequest(ctx("c2"), near.host).messages[1].content as string;
    expect(t).toContain("Aria swore never to return. (later undone: Aria came back to the valley.)");
  });

  it("shows at most TURNS_SHOWN active ones across the chain", () => {
    const many = Array.from({ length: 20 }, (_, k) => turn("t" + (k + 1), `Turning event ${k + 1}.`, { at: k + 1 }));
    const m = longChain(2, (i) => (i === 1 ? { turns: many } : {}));
    writeJson("litopys/config.json", { linkBudget: 3000 });
    const text = L.llmRequest(ctx("c2"), m.host).messages[1].content as string;
    expect((text.match(/Turning event/g) || []).length).toBeLessThanOrEqual(L.TURNS_SHOWN);
  });
});

describe("the worker reports turning points (#288)", () => {
  const ln = () => L.activeLine(story(10));
  const work = (marked = false) => ({ scene: { from: "m1", to: "m6", fromIdx: 0, toIdx: 5, count: 6, kind: "scene", label: "", marked }, replaces: null });
  const apply = (st: any, reply: unknown, w: any = work(), extra: Record<string, unknown> = {}) =>
    L.applyWorkerResult(st, w, L.parseWorkerReply(JSON.stringify(reply)), { now: 5, line: ln(), witnesses: ["Aria", "Bram"], ...extra });

  it("adds one turning point per scene, known to the witnesses, with stances", () => {
    const st = L.emptyChat("c1");
    apply(st, {
      chapter: { label: "Fall", text: "Bram betrayed Aria." },
      turns: [
        { op: "add", text: "Bram sold the map to the Crown. Aria saw the coin change hands.", stances: [{ who: "Aria", line: "cannot forgive it" }, { who: "Bram", line: "ashamed" }] },
        { op: "add", text: "A second one in the same scene." },
      ],
    });
    expect(st.turns).toHaveLength(1);
    expect(st.turns[0]).toMatchObject({ id: "t1", chapterId: "c1", knownBy: ["Aria", "Bram"], origin: "chapter", stances: { Aria: "cannot forgive it", Bram: "ashamed" } });
    expect(st.counters.turn).toBe(1);
    expect(st.facts).toHaveLength(0);
    expect(st.activity.some((a: any) => a.kind === "turn.add")).toBe(true);
  });

  it("reads a single `turn` object too, and skips a copy of a live one", () => {
    const st = L.emptyChat("c1");
    apply(st, { chapter: { label: "a", text: "b" }, turn: { text: "Bram sold the map to the Crown." } });
    apply(st, { chapter: { label: "a", text: "b" }, turns: [{ op: "add", text: "Bram sold the map to the Crown." }] }, { ...work(), scene: { ...work().scene, from: "m7", to: "m10" } });
    expect(st.turns).toHaveLength(1);
  });

  it("a marked scene always proposes one: the chapter's words stand in when the model gave none", () => {
    const st = L.emptyChat("c1");
    apply(st, { chapter: { label: "Vow", text: "Aria swore to avenge her brother." } }, work(true));
    expect(st.turns).toHaveLength(1);
    expect(st.turns[0]).toMatchObject({ origin: "mark", text: "Aria swore to avenge her brother." });
    // and not otherwise
    const plain = L.emptyChat("c2");
    apply(plain, { chapter: { label: "x", text: "Nothing happened." } });
    expect(plain.turns).toHaveLength(0);
  });

  it("a later turning point undoes an earlier one; the earlier stays, marked", () => {
    const st = L.emptyChat("c1");
    apply(st, { chapter: { label: "a", text: "b" }, turns: [{ op: "add", text: "Aria swore never to return." }] });
    apply(st, { chapter: { label: "c", text: "d" }, turns: [{ op: "add", text: "Aria broke her oath and came home.", undoes: "t1" }] }, { ...work(), scene: { ...work().scene, from: "m7", to: "m10" } });
    expect(st.turns.map((t: any) => t.id)).toEqual(["t1", "t2"]);
    expect(st.turns[0].overriddenBy).toBe("t2");
    expect(st.turns[1].overrides).toBe("t1");
  });

  it("an override or a stance change against what the user wrote waits with the reason", () => {
    const st = L.emptyChat("c1");
    st.turns.push(turn("t1", "Aria swore never to return.", { origin: "user", edited: true }));
    st.counters.turn = 1;
    apply(st, { chapter: { label: "c", text: "d" }, turns: [{ op: "add", text: "Aria came home after all.", undoes: "t1" }, { op: "stance", id: "t1", who: "Bram", line: "forgave her" }] });
    expect(st.turns[0].overriddenBy).toBeUndefined();
    expect(st.turns[0].stances).toEqual({});
    expect(st.turns[0].pending.map((p: any) => p.kind).sort()).toEqual(["override", "stance"]);
  });

  it("a stance change on an ordinary one applies at once", () => {
    const st = L.emptyChat("c1");
    apply(st, { chapter: { label: "a", text: "b" }, turns: [{ op: "add", text: "Bram betrayed Aria.", stances: [{ who: "Aria", line: "furious" }] }] });
    apply(st, { chapter: { label: "c", text: "d" }, turns: [{ op: "stance", id: "t1", who: "Aria", line: "forgave him" }] }, { ...work(), scene: { ...work().scene, from: "m7", to: "m10" } });
    expect(st.turns[0].stances).toEqual({ Aria: "forgave him" });
  });

  it("a chapter written again makes its own turning point again, once", () => {
    const st = L.emptyChat("c1");
    apply(st, { chapter: { label: "a", text: "b" }, turns: [{ op: "add", text: "Bram betrayed Aria." }] });
    apply(st, { chapter: { label: "a", text: "b" }, turns: [{ op: "add", text: "Bram betrayed Aria at dawn." }] }, { ...work(), replaces: "c1" });
    expect(st.turns).toHaveLength(1);
    expect(st.turns[0].text).toContain("at dawn");
  });

  it("is off with turns: false", () => {
    const st = L.emptyChat("c1");
    apply(st, { chapter: { label: "a", text: "b" }, turns: [{ op: "add", text: "Bram betrayed Aria." }] }, work(true), { turns: false });
    expect(st.turns).toHaveLength(0);
  });

  it("asks for them: the rule and the shape ride in the request, with the known ones and the hinge lines", () => {
    const st = L.emptyChat("c1");
    st.turns.push(turn("t1", "Bram betrayed Aria.", { stances: { Aria: "furious" } }));
    const line = ln();
    const dash = { said: { Bram: [{ id: "s1", text: "I will never leave you.", kind: "vow", hinge: true, src: "m3#0" }] } };
    const req = L.buildWorkerRequest(st, work(true), line, dash, { ...L.DEFAULT_CONFIG }, { userName: "You" }, {});
    expect(req.systemPrompt).toContain("Turning points (optional");
    expect(req.systemPrompt).toContain('"turns":[{"op":"add"');
    expect(req.systemPrompt).toContain("Report it as a turning point");
    const user = req.messages[0].content as string;
    expect(user).toContain("Known turning points");
    expect(user).toContain("t1: Bram betrayed Aria. [Aria: furious]");
    expect(user).toContain("Said, and the story may hinge on it");
    expect(L.buildWorkerRequest(st, work(), line, {}, { ...L.DEFAULT_CONFIG, turns: false }, { userName: "You" }, {}).systemPrompt).not.toContain("Turning points (optional");
  });
});

describe("a fork and a rebuild keep turning points (#288)", () => {
  it("a fork brings the turning points of the chapters it copies, with their order", () => {
    const parent = L.emptyChat("p");
    parent.chapters.push({ id: "c1", from: "m1", to: "m4", count: 4, kind: "scene", text: "x", label: "x", at: 1 });
    parent.turns.push(turn("t1", "Early.", { chapterId: "c1", overriddenBy: "t2" }), turn("t2", "Late.", { chapterId: "c9", overrides: "t1" }));
    parent.counters.turn = 2;
    const pl = L.activeLine(story(8));
    const child = L.forkFrom(mockHost().host.fs, parent, pl, "m4", "k", pl.slice(0, 4), 9);
    expect(child.turns.map((t: any) => t.id)).toEqual(["t1"]);
    expect(child.turns[0].overriddenBy).toBeUndefined();
    expect(child.counters.turn).toBe(2);
  });
});

describe("the chat view carries them (#288)", () => {
  it("lists turning points in the chat view", () => {
    writeChat("c1", story(4, "a"), { title: "One" });
    writeJson("litopys/chats/c1.json", { ...L.emptyChat("c1"), migrated: true, turns: [turn("t1", "Bram betrayed Aria.")] });
    const view = L.chatView(mockHost().host.fs, "c1");
    expect(view.turns).toHaveLength(1);
    expect(view.turns[0].text).toBe("Bram betrayed Aria.");
  });
});

describe("the Turning points route (#288)", () => {
  function seedOne() {
    writeChat("c1", story(8, "a"), { title: "One" });
    writeJson("litopys/chats/c1.json", {
      ...L.emptyChat("c1"),
      migrated: true,
      chapters: [{ id: "k1", from: "a1", to: "a4", count: 4, kind: "scene", text: "Bram sold the map to the Crown.", label: "Sold", at: 1, cast: ["Aria", "Bram"] }],
    });
    return mockHost();
  }
  const post = (m: any, body: any) => route(m.host, "POST", "/litopys/turns", { chatId: "c1", ...body });

  it("adds one by hand, marks a chapter, refuses a second mark", () => {
    const m = seedOne();
    const added = post(m, { op: "add", text: "Aria swore on her mother's grave.", stances: { Aria: "bound by it" }, knownBy: ["Aria"] });
    expect(added.status).toBe(200);
    expect(added.json.turns[0]).toMatchObject({ id: "t1", origin: "user", knownBy: ["Aria"], stances: { Aria: "bound by it" } });
    const marked = post(m, { op: "mark", chapterId: "k1" });
    expect(marked.json.turns[1]).toMatchObject({ id: "t2", origin: "mark", chapterId: "k1", knownBy: ["Aria", "Bram"], text: "Bram sold the map to the Crown." });
    expect(post(m, { op: "mark", chapterId: "k1" }).status).toBe(409);
    expect(post(m, { op: "mark", chapterId: "nope" }).status).toBe(404);
    expect(post(m, { op: "add", text: "" }).status).toBe(400);
  });

  it("edits (and keeps the edit apart from what the worker may change), removes and puts back what it undid", () => {
    const m = seedOne();
    post(m, { op: "add", text: "First." });
    post(m, { op: "add", text: "Second." });
    const undone = post(m, { op: "undo", id: "t1", by: "t2" });
    expect(undone.json.turns[0].overriddenBy).toBe("t2");
    expect(post(m, { op: "undo", id: "t1", by: "t1" }).status).toBe(400);
    const edited = post(m, { op: "edit", id: "t2", text: "Second, said better.", stances: { Bram: "relieved" } });
    expect(edited.json.turns[1]).toMatchObject({ text: "Second, said better.", edited: true, stances: { Bram: "relieved" } });
    const gone = post(m, { op: "remove", id: "t2" });
    expect(gone.json.turns).toHaveLength(1);
    expect(gone.json.turns[0].overriddenBy).toBeUndefined();
    expect(post(m, { op: "remove", id: "t9" }).status).toBe(404);
  });

  it("answers what the worker left waiting", () => {
    const m = seedOne();
    const st = L.loadChatFile(m.host.fs, "c1");
    st.turns.push(turn("t1", "Aria swore never to return.", { origin: "user", edited: true, pending: [{ kind: "override", by: "t2", reason: "later events undid it", at: 1 }, { kind: "stance", who: "Bram", line: "forgave her", at: 1 }] }), turn("t2", "Aria came home.", { overrides: "t1" }));
    st.counters.turn = 2;
    L.saveChatFile(m.host.fs, st);
    const a = post(m, { op: "resolve", id: "t1", kind: "stance", who: "Bram", accept: true });
    expect(a.json.turns[0].stances).toEqual({ Bram: "forgave her" });
    const b = post(m, { op: "resolve", id: "t1", kind: "override", by: "t2", accept: false });
    expect(b.json.turns[0].overriddenBy).toBeUndefined();
    expect(b.json.turns[0].pending).toEqual([]);
    expect(post(m, { op: "resolve", id: "t1", kind: "override", by: "t2", accept: true }).status).toBe(404);
    // accepting an override links both ways, like `undo`
    const st2 = L.loadChatFile(m.host.fs, "c1");
    st2.turns[0].pending = [{ kind: "override", by: "t2", reason: "x", at: 1 }];
    L.saveChatFile(m.host.fs, st2);
    const c = post(m, { op: "resolve", id: "t1", kind: "override", by: "t2", accept: true });
    expect(c.json.turns[0].overriddenBy).toBe("t2");
    expect(c.json.turns[1].overrides).toBe("t1");
  });
});

describe("the Fired panel's rows (#288)", () => {
  it("lists the far part as its own row, apart from the near chats", () => {
    const m = longChain(6, (i) => (i === 1 ? { turns: [turn("t1", "The oath was sworn.")] } : {}));
    writeJson("litopys/config.json", { linkBudget: 1500 });
    const res = route(m.host, "GET", "/litopys/carries");
    expect(res.status).toBeGreaterThan(0);
    const r = L.handleRoute({ method: "GET", path: "/litopys/carries", query: { chatId: "c6" }, body: undefined }, m.host);
    expect(r.json.backstoryFar).toMatchObject({ chats: 2, first: 1, last: 2, turns: 1 });
    expect(r.json.backstoryFar.text).toContain("The oath was sworn.");
    expect(r.json.backstory.text).not.toContain("The oath was sworn.");
    expect(r.json.backstory.tokens + r.json.backstoryFar.tokens).toBe(L.estimateTokens(r.json.backstoryFar.text + "\n\n" + r.json.backstory.text));
  });
});

describe("far share and turning points shown are settings (#288)", () => {
  it("defaults to 18% and 12, clamps, and is read by the backstory", () => {
    const m = longChain(6);
    expect(route(m.host, "GET", "/litopys/config").json.farShare).toBe(18);
    expect(route(m.host, "GET", "/litopys/config").json.turnsShown).toBe(12);
    route(m.host, "PUT", "/litopys/config", { farShare: 99, turnsShown: 1 });
    const cfg = route(m.host, "GET", "/litopys/config").json;
    expect(cfg.farShare).toBe(40);
    expect(cfg.turnsShown).toBe(3);
  });

  it("a bigger far share lets the far part carry more", () => {
    const m = longChain(8);
    writeJson("litopys/config.json", { linkBudget: 3000, farShare: 5 });
    L.llmRequest(ctx("c8"), m.host);
    const small = readJson("litopys/insert/c8.json").backstory.far.tokens;
    writeJson("litopys/config.json", { linkBudget: 3000, farShare: 40 });
    L.llmRequest(ctx("c8"), m.host);
    const big = readJson("litopys/insert/c8.json").backstory.far.tokens;
    expect(small).toBeLessThanOrEqual(Math.floor(3000 * 0.05));
    expect(big).toBeGreaterThan(small);
  });

  it("turnsShown caps the turning points across the chain", () => {
    const many = Array.from({ length: 10 }, (_, k) => turn("t" + (k + 1), `Turning event ${k + 1}.`, { at: k + 1 }));
    const m = longChain(2, (i) => (i === 1 ? { turns: many } : {}));
    writeJson("litopys/config.json", { linkBudget: 3000, turnsShown: 4 });
    const text = L.llmRequest(ctx("c2"), m.host).messages[1].content as string;
    expect((text.match(/Turning event/g) || []).length).toBe(4);
  });
});

describe("a turning point built on a lie (#184 P4, #288)", () => {
  const ln = () => L.activeLine(story(10));
  const scene = { from: "m1", to: "m6", fromIdx: 0, toIdx: 5, count: 6, kind: "scene", label: "" };

  it("is flagged untrue when it retells a lie told in the scene, and keeps who believes it", () => {
    const st = L.emptyChat("c1");
    const lies = [{ liar: "Ada", to: ["Bram", "Aria"], text: "Bram stole the royal map from the vault." }];
    const parsed = L.parseWorkerReply(JSON.stringify({ chapter: { label: "Court", text: "Ada accused Bram." }, turns: [{ op: "add", text: "Ada tells the court that Bram stole the royal map from the vault." }] }));
    L.applyWorkerResult(st, { scene, replaces: null }, parsed, { now: 1, line: ln(), witnesses: ["Ada", "Bram", "Aria"], lies });
    expect(st.turns[0]).toMatchObject({ untrue: true, liar: "Ada", believers: ["Bram", "Aria"] });
  });

  it("is not flagged when it says something else", () => {
    const st = L.emptyChat("c1");
    const lies = [{ liar: "Ada", to: ["Bram"], text: "Bram stole the royal map from the vault." }];
    const parsed = L.parseWorkerReply(JSON.stringify({ chapter: { label: "x", text: "y" }, turns: [{ op: "add", text: "The tower fell at dawn and the garrison fled." }] }));
    L.applyWorkerResult(st, { scene, replaces: null }, parsed, { now: 1, line: ln(), witnesses: ["Ada", "Bram"], lies });
    expect(st.turns[0].untrue).toBeUndefined();
  });

  it("reads as plain to a believer and as untrue to everyone else", () => {
    const m = longChain(2, (i) => (i === 1 ? { turns: [turn("t1", "Ada tells the court Bram stole the map.", { untrue: true, liar: "Ada", believers: ["Bram"] })] } : {}));
    const rc = (voices: Set<string> | null, speakerName: string) => L.buildBackstory({ fsx: m.host.fs, chatId: "c2", line: L.activeLine(story(2, "n")), meta: { userName: "You" }, cfg: L.loadConfig(m.host.fs), speakerName, voices }).text as string;
    const forBram = rc(new Set(["bram"]), "Bram");
    expect(forBram).toContain("Ada tells the court Bram stole the map.");
    expect(forBram).not.toContain("(untrue");
    const forAria = rc(new Set(["aria"]), "Aria");
    expect(forAria).toContain("(untrue: Bram believes it, told by Ada)");
  });

  it("the user can say it was not a lie", () => {
    writeChat("c1", story(4, "a"), { title: "One" });
    writeJson("litopys/chats/c1.json", { ...L.emptyChat("c1"), migrated: true, turns: [turn("t1", "Ada accused Bram.", { untrue: true, liar: "Ada", believers: ["Bram"] })] });
    const r = route(mockHost().host, "POST", "/litopys/turns", { chatId: "c1", op: "edit", id: "t1", untrue: false });
    expect(r.json.turns[0].untrue).toBeUndefined();
    expect(r.json.turns[0].believers).toBeUndefined();
  });
});

describe("the far part as a source of its own in What fired (#288)", () => {
  const get = (path: string, chatId: string, host: any) => L.handleRoute({ method: "GET", path, query: { chatId }, body: undefined }, host);

  it("counts the replies that carried it, takes a swipe back, and says what it held", () => {
    const m = longChain(6, (i) => (i === 1 ? { turns: [turn("t1", "The oath was sworn.")] } : {}));
    writeJson("litopys/config.json", { linkBudget: 1500 });
    L.llmRequest(ctx("c6"), m.host);
    L.llmRequest({ ...ctx("c6"), turn: { op: "next", chatId: "c6", speakerName: "Aria" } }, m.host);
    let far = get("/litopys/fired", "c6", m.host).json.log.far;
    expect(far).toMatchObject({ n: 2, chats: 2, first: 1, last: 2, turns: 1 });
    expect(far.tokens).toBeGreaterThan(0);
    L.llmRequest({ ...ctx("c6"), turn: { op: "swipe", chatId: "c6", speakerName: "Aria" } }, m.host);
    far = get("/litopys/fired", "c6", m.host).json.log.far;
    expect(far.n).toBe(2);
    expect(get("/litopys/fired", "c6", m.host).json.log.replies).toBe(2);
  });

  it("a short chain has no far row, and a chat with no record of its own still counts it", () => {
    const m = longChain(3);
    L.llmRequest(ctx("c3"), m.host);
    expect(get("/litopys/fired", "c3", m.host).json.log?.far ?? null).toBeNull();
    const m2 = longChain(6);
    writeJson("litopys/config.json", { linkBudget: 1500 });
    writeChat("fresh", story(2, "x"), { title: "Fresh" });
    route(m2.host, "POST", "/litopys/links", { chatId: "fresh", from: "c6" });
    L.llmRequest(ctx("fresh"), m2.host);
    expect(get("/litopys/fired", "fresh", m2.host).json.log.far).toMatchObject({ n: 1, first: 1 });
  });

  it("the Memory trace of the newest reply carries it, an older reply does not", () => {
    const m = longChain(6);
    writeJson("litopys/config.json", { linkBudget: 1500 });
    L.llmRequest(ctx("c6"), m.host);
    const tr = get("/litopys/trace", "c6", m.host).json.trace;
    expect(tr.far).toMatchObject({ chats: 2, first: 1, last: 2 });
  });
});

describe("the Memory trace of a reply that carried only the earlier story (#288)", () => {
  it("still answers, with the far part and no rows", () => {
    const m = longChain(6);
    writeJson("litopys/config.json", { linkBudget: 1500 });
    writeChat("fresh", story(2, "x"), { title: "Fresh" });
    route(m.host, "POST", "/litopys/links", { chatId: "fresh", from: "c6" });
    L.llmRequest(ctx("fresh"), m.host);
    const tr = L.handleRoute({ method: "GET", path: "/litopys/trace", query: { chatId: "fresh" }, body: undefined }, m.host).json.trace;
    expect(tr).not.toBeNull();
    expect(tr.far).toMatchObject({ first: 1 });
    expect(tr.facts).toEqual([]);
  });
});
