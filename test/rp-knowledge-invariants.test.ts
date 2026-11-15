/**
 * Who perceives and who knows (Molfar.Vertep#415, #416), as invariants in the spirit of Umwelt's conformance cases:
 * - someone in touch from elsewhere gets a note after the player's message: only what came through reaches them;
 * - the Dashboard's leak check looks at a remote scene every reply, with the player's messages of that scene;
 * - a suspect is not a knower: the fact reaches them marked as a suspicion, the brief says who suspects, the leak check
 *   leaves them alone; a fact kept secret says so;
 * - a fact is never known by someone outside its knowers; a chapter without a cast is visible to all (the known trap).
 */
import { describe, expect, it } from "bun:test";
import { L, useRoot, type Msg } from "./rp-memory-m2-kit";

useRoot();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RP = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Vlad", text });
const C = (id: string, name: string, text: string): Msg => ({ id, role: "char", name, text, swipe: 0 });
const request = (msgs: Msg[]) => [{ role: "system", content: "sys" }, ...msgs.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }))];
const histOf = (msgs: Msg[]) => msgs.map((m) => ({ id: m.id, h: L.promptHash(m.role === "user" ? "user" : "assistant", m.text) }));
const snap = (present: string[], contact: Record<string, string> = {}) => ({
  present,
  chars: Object.fromEntries(present.map((n) => [n, contact[n] ? { contact: contact[n] } : {}])),
});

// the coffee machine (#415): Vlad at home, Yae in her office, they text
const CHAT: Msg[] = [
  U("m1", "Vlad walks into the tavern."),
  C("m2", "Yae", "Yae waits at the table."),
  U("m3", "Vlad goes home. He texts Yae: **Let the prey stew an hour.** Then, alone, he sighs: I need a good coffee machine."),
  C("m4", "Yae", "Yae reads the text in her office."),
  U("m5", "Vlad texts: **Find the accounts.**"),
];
const DASH = { snapshots: { "m2#0": snap(["Yae"]), "m4#0": snap(["Yae"], { Yae: "text" }) } };

describe("#415 a note after the player's message in a remote scene", () => {
  const run = (msgs = CHAT, dash: unknown = DASH, messages = request(msgs)) => L.remoteNotesFor({ messages, hist: histOf(msgs), line: L.activeLine(msgs), dash });

  it("the older message and the newest both get it; the in-person one does not", () => {
    const r = run();
    expect(r.notes).toBe(2);
    const texts = r.messages.map((m: { content: string }) => m.content);
    const at3 = texts.indexOf(CHAT[2]!.text);
    expect(texts[at3 + 1]).toContain("Yae is elsewhere, in touch by text");
    expect(texts[at3 + 1]).toContain("only the text Vlad sends");
    expect(texts[texts.length - 1]).toContain("Yae is elsewhere");
    const at1 = texts.indexOf(CHAT[0]!.text);
    expect(texts[at1 + 1]).toBe(CHAT[1]!.text);
  });
  it("a call says what a call carries", () => {
    const r = run(CHAT, { snapshots: { ...DASH.snapshots, "m4#0": snap(["Yae"], { Yae: "call" }) } });
    expect(r.lines[0]).toContain("on a call with Vlad");
    expect(r.lines[0]).toContain("nothing done in silence");
  });
  it("nobody far away: nothing changes", () => {
    const r = run(CHAT, { snapshots: { "m2#0": snap(["Yae"]), "m4#0": snap(["Yae"]) } });
    expect(r.notes).toBe(0);
  });
  it("a message the presence cut already removed gets no note", () => {
    const messages = request(CHAT).filter((m) => m.content !== CHAT[2]!.text);
    const r = run(CHAT, DASH, messages);
    expect(r.notes).toBe(1);
  });
});

describe("#415 the leak check looks at every reply of a remote scene", () => {
  const line = RP.activeLine([...CHAT, C("m6", "Yae", "Yae texts back: I will send you a coffee machine.")]);
  const snaps = { ...DASH.snapshots };
  it("one candidate per far character, with the player's messages of the scene, newest first", () => {
    const c = RP.remoteCandidates({ line, snaps, base: { snap: snaps["m4#0"] }, userName: "Vlad" });
    expect(c).toHaveLength(1);
    expect(c[0].who).toBe("Yae");
    expect(c[0].factId).toBe("remote:m5");
    expect(c[0].remote).toBe("text");
    expect(c[0].line).toContain("coffee machine");
    expect(c[0].line.indexOf("Find the accounts")).toBeLessThan(c[0].line.indexOf("coffee machine"));
  });
  it("an in-person scene has none", () => {
    expect(RP.remoteCandidates({ line, snaps, base: { snap: snap(["Yae"]) }, userName: "Vlad" })).toEqual([]);
  });
  it("the sensor's answer keeps the kind of the hit", () => {
    const cands = RP.remoteCandidates({ line, snaps, base: { snap: snaps["m4#0"] }, userName: "Vlad" });
    const hits = RP.cleanLeaks([{ id: "L1", quote: "I will send you a coffee machine." }], cands);
    expect(hits[0]).toMatchObject({ who: "Yae", factId: "remote:m5", remote: "text", status: "open" });
  });
});

describe("#416 a suspect is not a knower", () => {
  const facts = [
    { id: "f1", text: "Bram poisoned the well.", subject: "Bram", knownBy: ["Bram"], suspectedBy: ["Aria"], secret: true, status: "active", type: "event" },
    { id: "f2", text: "The mill is haunted.", subject: "world", knownBy: ["Lia"], status: "active", type: "world" },
  ];
  it("the line says who suspects and that it is kept secret; a suspect reads it as a suspicion", () => {
    expect(L.factLineOf(facts[0], true, null)).toBe("- Bram poisoned the well. (known to: Bram; suspected by: Aria; kept secret)");
    expect(L.factLineOf(facts[0], true, null, true)).toContain("(only a suspicion, not known for sure) Bram poisoned");
  });
  it("the brief: who knows, who suspects, kept secret; a suspect may hint, never act as if certain", () => {
    const b = L.castKnowledgeFor({ st: { facts }, line: L.activeLine([C("m1", "Aria", "x"), C("m2", "Bram", "y")]), dash: null, meta: { userName: "Jude" }, speakerName: "" });
    expect(b.text).toContain("Only Bram knows (Aria suspects; keeps it secret): Bram poisoned the well.");
    expect(b.text).toContain("never act as if certain");
  });
  it("suspects never overlap the knowers", () => {
    expect(L.suspectsOf(["Bram", "Aria", "aria", ""], ["Bram"])).toEqual(["Aria"]);
  });
  it("the leak check does not flag a suspect", () => {
    const c = RP.leakCandidates({
      facts: [{ id: "f1", text: "Bram poisoned the well.", knownBy: ["Bram", "Aria"] }],
      reply: "Aria hisses: you poisoned the well, Bram.",
      userText: "",
      people: ["Aria", "Bram"],
      speakers: ["Aria"],
      userNames: ["Jude"],
    });
    expect(c).toEqual([]);
  });
});

describe("#416 the chapter worker writes suspects and secrets", () => {
  const msgs = [U("m1", "Vlad watches Bram pour something into the well."), C("m2", "Aria", "Aria frowns at Bram.")];
  const work = { scene: { from: "m1", to: "m2", fromIdx: 0, toIdx: 1, count: 2, kind: "scene", label: "" }, replaces: null };
  const apply = (st: any, reply: unknown) => L.applyWorkerResult(st, work, L.parseWorkerReply(JSON.stringify(reply)), { now: 1, line: L.activeLine(msgs), sources: [], cardRules: [], witnesses: ["Vlad", "Aria", "Bram"] });

  it("a new fact keeps its suspects (never a knower) and its secret", () => {
    const st = L.emptyChat("c1");
    apply(st, { chapter: { label: "Well", text: "Bram poisoned the well." }, facts: [{ op: "add", text: "Bram poisoned the well.", subject: "Bram", knownBy: ["Bram", "Vlad"], suspectedBy: ["Aria", "Vlad"], secret: true, type: "event", weight: "key" }] });
    const f = st.facts.find((x: any) => x.text === "Bram poisoned the well.");
    expect(f.knownBy).toEqual(["Bram", "Vlad"]);
    expect(f.suspectedBy).toEqual(["Aria"]);
    expect(f.secret).toBe(true);
  });
  it("the knows op grows suspects and knowers of a known fact; a suspect who learns leaves the suspects", () => {
    const st = L.emptyChat("c1");
    apply(st, { chapter: { label: "Well", text: "Bram poisoned the well." }, facts: [{ op: "add", text: "Bram poisoned the well.", subject: "Bram", knownBy: ["Bram"], type: "event" }] });
    const id = st.facts[0].id;
    apply(st, { chapter: { label: "Doubt", text: "Aria wonders." }, facts: [{ op: "knows", id, suspectedBy: ["Aria"] }] });
    expect(st.facts[0].suspectedBy).toEqual(["Aria"]);
    apply(st, { chapter: { label: "Proof", text: "Aria finds the vial." }, facts: [{ op: "knows", id, knownBy: ["Aria"] }] });
    expect(st.facts[0].knownBy).toEqual(["Bram", "Aria"]);
    expect(st.facts[0].suspectedBy).toBeUndefined();
  });
  it("the worker is told about suspects and the knows op only when it is on", () => {
    expect(L.KNOWING_RULE).toContain("suspectedBy");
    expect(L.KNOWS_OP_SHAPE).toContain('"op":"knows"');
  });
});

describe("invariants of who knows", () => {
  it("a fact never reaches someone outside its knowers, and does reach a knower", () => {
    const line = L.activeLine([U("m1", "hi"), C("m2", "Aria", "Aria nods.")]);
    const st = { facts: [{ id: "f1", text: "Lia hid the key under the stone.", subject: "Lia", knownBy: ["Lia"], status: "active", type: "event", weight: "important" }], chapters: [] };
    const cfg = { ...L.DEFAULT_CONFIG, budget: 800 };
    const forAria = L.buildInsert({ st, line, dash: null, meta: { userName: "Vlad" }, cfg, scanText: "", speakerName: "Aria", voices: new Set(["aria"]) });
    expect(forAria === null || !JSON.stringify(forAria).includes("hid the key")).toBe(true);
    const forLia = L.buildInsert({ st, line, dash: null, meta: { userName: "Vlad" }, cfg, scanText: "", speakerName: "Lia", voices: new Set(["lia"]) });
    expect(JSON.stringify(forLia)).toContain("hid the key");
  });
  it("a suspect gets the fact marked as a suspicion", () => {
    const line = L.activeLine([U("m1", "hi"), C("m2", "Aria", "Aria nods.")]);
    const st = { facts: [{ id: "f1", text: "Lia hid the key under the stone.", subject: "Lia", knownBy: ["Lia"], suspectedBy: ["Aria"], status: "active", type: "event", weight: "important" }], chapters: [] };
    const r = L.buildInsert({ st, line, dash: null, meta: { userName: "Vlad" }, cfg: { ...L.DEFAULT_CONFIG, budget: 800 }, scanText: "", speakerName: "Aria", voices: new Set(["aria"]) });
    expect(JSON.stringify(r)).toContain("only a suspicion");
  });
  it("a chapter with no cast is visible to every voice (the known trap, kept on purpose)", () => {
    expect(L.witnessed({ id: "c1" }, new Set(["aria"]), (n: string) => n.toLowerCase())).toBe(true);
    expect(L.witnessed({ id: "c1", cast: ["Lia"] }, new Set(["aria"]), (n: string) => n.toLowerCase())).toBe(false);
  });
});
