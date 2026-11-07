// #184 P4 step 2: a lie of the Dashboard's Said list that has aged out becomes a belief fact for each person who still
// believes it; the insert gives it to its holder only, as what they were told; it ends when the holder learns the truth or
// the lie is removed; the worker is told the lie is not a fact. No card-memory path carries it.
import { beforeEach, describe, expect, it } from "bun:test";
import { L, useRoot, readJson, writeJson, story, writeChat, line, mockHost, tick } from "./rp-memory-m2-kit";

useRoot();
// these tests are about beliefs, not about which changes wait (#184 P5 has its own file)
beforeEach(() => writeJson("litopys/config.json", { arcNotice: "done", proposals: "ask" }));

const LIE = "The debt to the tavern is already paid.";

function writeDashWithLie(chatId: string, said: Record<string, any[]>, turn = 50) {
  writeJson(`dashboard/state/${chatId}.json`, {
    v: 2,
    chatId,
    snapshots: { "m5#0": { clock: { day: 1, time: null, place: null }, present: ["Aria", "Bram"], turn } },
    notebook: {},
    said,
  });
}
const lie = (over: Record<string, any> = {}) => ({ id: "s1", text: LIE, kind: "lie", hidden: true, heardBy: ["Bram", "Cora"], turn: 10, src: "m1#0", source: "chat", ...over });

describe("a lie that aged out becomes a belief (#184 P4)", () => {
  it("one belief fact for each person who still believes it, in their own section only, once", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    writeDashWithLie("c1", { Aria: [lie()] });
    tick(mockHost());
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts).toHaveLength(2);
    expect(st.facts[0]).toMatchObject({
      text: LIE,
      type: "belief",
      holder: "Bram",
      subject: "Bram",
      knownBy: ["Bram"],
      truth: false,
      prov: { Bram: { how: "told", from: "Aria" } },
      lie: "s1",
      origin: "dashboard",
      status: "active",
    });
    expect(st.facts.map((f: any) => f.holder)).toEqual(["Bram", "Cora"]);
    expect(st.fromLies).toEqual(["s1~Bram", "s1~Cora"]);
    tick(mockHost());
    expect(readJson("litopys/chats/c1.json").facts).toHaveLength(2);
  });

  it("a young lie stays with the Dashboard; a lie nobody believes, or a promise, never moves", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    writeDashWithLie("c1", { Aria: [lie({ turn: 45 }), lie({ id: "s2", heardBy: [], turn: 10 }), lie({ id: "s3", kind: "promise", turn: 10 })] });
    tick(mockHost());
    expect(readJson("litopys/chats/c1.json").facts).toHaveLength(0);
  });

  it("a person who already learned the truth, and a lie the user removed, make nothing", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    writeDashWithLie("c1", { Aria: [lie({ exposed: [{ who: "Bram", by: "m5#0", turn: 20 }], heardBy: ["Bram"] })] });
    tick(mockHost());
    expect(readJson("litopys/chats/c1.json").facts).toHaveLength(0);
    writeChat("c2", story(5), { updatedAt: Date.now() });
    writeDashWithLie("c2", { Aria: [lie()] });
    writeJson("dashboard/notes/c2.json", { edits: { s1: { retired: true } } });
    tick(mockHost());
    expect(readJson("litopys/chats/c2.json").facts).toHaveLength(0);
  });

  it("a belief ends when its holder learns the truth, for that holder only", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    writeDashWithLie("c1", { Aria: [lie()] });
    tick(mockHost());
    writeJson("dashboard/notes/c1.json", { edits: { s1: { exposed: ["Bram"] } } });
    tick(mockHost());
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts.map((f: any) => [f.holder, f.status])).toEqual([["Bram", "retired"], ["Cora", "active"]]);
    expect(st.activity.some((a: any) => a.kind === "belief.end")).toBe(true);
  });

  it("a belief ends when the lie is removed; a lie that is only off the line (a rewind) leaves it alone", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    writeDashWithLie("c1", { Aria: [lie()] });
    tick(mockHost());
    writeJson("dashboard/notes/c1.json", { edits: { s1: { retired: true } } });
    tick(mockHost());
    expect(readJson("litopys/chats/c1.json").facts.map((f: any) => f.status)).toEqual(["retired", "retired"]);
    writeChat("c2", story(5), { updatedAt: Date.now() });
    writeDashWithLie("c2", { Aria: [lie()] });
    tick(mockHost());
    writeDashWithLie("c2", { Aria: [lie({ src: "m9#0" })] });
    tick(mockHost());
    expect(readJson("litopys/chats/c2.json").facts.map((f: any) => f.status)).toEqual(["active", "active"]);
  });
});

describe("a belief in the insert (#184 P4)", () => {
  const belief = (holder: string) => ({ id: "f1", text: LIE, subject: holder, knownBy: [holder], type: "belief", holder, truth: false, prov: { [holder]: { how: "told", from: "Aria" } }, weight: "important", pinned: false, status: "active", src: { from: null, to: null }, origin: "dashboard" });

  it("reads as what the holder was told, plain in the holder's own reply, marked untrue when several voices speak", () => {
    expect(L.factLineOf(belief("Bram"), true)).toBe("- Bram believes, told by Aria: " + LIE);
    expect(L.factLineOf(belief("Bram"), false)).toBe("- Bram believes, told by Aria: " + LIE + " (untrue)");
    expect(L.factLineOf({ text: "Aria is a knight.", knownBy: ["Aria"], type: "trait" }, true)).toBe("- Aria is a knight. (known to: Aria)");
  });

  it("only the holder's reply carries it", () => {
    const msgs = story(5);
    const ln = line(msgs);
    const st = L.emptyChat("c1");
    st.facts = [belief("Bram")];
    st.counters.fact = 1;
    const base = { st, line: ln, dash: { snapshots: { "m5#0": { present: ["Aria", "Bram"] } } }, meta: { userName: "You" }, cfg: { budget: 800, recentMessages: 20, scene: { minMessages: 6, maxMessages: 40 } }, scanText: "the tavern debt" };
    const own = L.buildInsert({ ...base, speakerName: "Bram", voices: new Set(["Bram"]) });
    expect(own && own.text).toContain("Bram believes, told by Aria: " + LIE);
    expect(own && own.text).not.toContain("(untrue)");
    const other = L.buildInsert({ ...base, speakerName: "Aria", voices: new Set(["Aria"]) });
    expect(other === null || !String(other.text).includes(LIE)).toBe(true);
    const narrator = L.buildInsert({ ...base, speakerName: "Narrator" });
    expect(narrator && narrator.text).toContain("(untrue)");
  });
});

describe("the worker is told a lie is not a fact (#184 P4)", () => {
  it("a lie told in the scene rides in the request as 'Told as true, but untrue', and a known belief reads as untrue", () => {
    const msgs = story(6);
    const ln = line(msgs);
    const st = L.emptyChat("c1");
    const dash = { snapshots: { "m6#0": { present: ["Aria", "Bram"], turn: 3 } }, said: { Aria: [lie({ src: "m3#0" })] } };
    expect(L.sceneLies(dash, ln, { fromIdx: 0, toIdx: 5 })).toEqual([{ liar: "Aria", to: ["Bram", "Cora"], text: LIE }]);
    expect(L.sceneLies(dash, ln, { fromIdx: 4, toIdx: 5 })).toEqual([]);
    const work = { scene: { fromIdx: 0, toIdx: 5, from: ln[0].id, to: ln[5].id, label: "" } };
    const req = L.buildWorkerRequest(st, work, ln, dash, { recollections: false }, { userName: "You" }, {});
    const text = JSON.stringify(req);
    expect(text).toContain("Told as true, but untrue");
    expect(text).toContain("Do not record it as a fact");
    st.facts = [{ id: "f1", text: LIE, subject: "Bram", knownBy: ["Bram"], type: "belief", holder: "Bram", status: "active" }];
    const req2 = L.buildWorkerRequest(st, work, ln, { snapshots: dash.snapshots }, { recollections: false }, { userName: "You" }, {});
    expect(JSON.stringify(req2)).toContain("f1: (Bram believes this, and it is untrue) " + LIE);
  });
});

describe("the user's word and the Library's word end up on both sides (#184 P4)", () => {
  it("a statement the user marked as a lie becomes a belief after the age; 'not a lie' retires the belief it made", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    writeDashWithLie("c1", { Aria: [lie({ kind: "promise", heardBy: undefined })] });
    writeJson("dashboard/notes/c1.json", { edits: { s1: { lie: true, heardBy: ["Bram"] } } });
    tick(mockHost());
    const st = readJson("litopys/chats/c1.json");
    expect(st.facts.map((f: any) => [f.type, f.holder])).toEqual([["belief", "Bram"]]);
    writeJson("dashboard/notes/c1.json", { edits: { s1: { lie: false } } });
    tick(mockHost());
    expect(readJson("litopys/chats/c1.json").facts[0].status).toBe("retired");
  });

  it("retiring a belief by hand tells the Dashboard its holder knows the truth, keeping the rest of the overlay", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    writeDashWithLie("c1", { Aria: [lie()] });
    writeJson("dashboard/notes/c1.json", { counter: 3, edits: { s7: { tag: "important" } } });
    tick(mockHost());
    const ok = L.factRoute(mockHost().host.fs, { chatId: "c1", op: "retire", id: "f1" });
    expect(ok.status ?? 200).toBe(200);
    const ov = readJson("dashboard/notes/c1.json");
    expect(ov.counter).toBe(3);
    expect(ov.edits.s7).toEqual({ tag: "important" });
    expect(ov.edits.s1.exposed).toEqual(["Bram"]);
    expect(L.exposeInDashboard(mockHost().host.fs, "c1", "s1", "bram")).toBe(true);
    expect(readJson("dashboard/notes/c1.json").edits.s1.exposed).toEqual(["Bram"]);
  });

  it("'he found out' writes how: the user told them", () => {
    writeChat("c1", story(5), { updatedAt: Date.now() });
    const st = L.emptyChat("c1");
    st.migrated = true;
    st.facts = [{ id: "f1", text: "The vault is empty.", subject: "Aria", knownBy: ["Aria"], type: "event", weight: "important", pinned: false, status: "active", src: { from: null, to: null }, origin: "chapter", at: 1, updatedAt: 1 }];
    st.counters.fact = 1;
    writeJson("litopys/chats/c1.json", st);
    L.factRoute(mockHost().host.fs, { chatId: "c1", op: "know", id: "f1", who: "Bram" });
    expect(readJson("litopys/chats/c1.json").facts[0]).toMatchObject({ knownBy: ["Aria", "Bram"], prov: { Bram: { how: "told", from: "user" } } });
  });
});
