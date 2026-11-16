/**
 * The DM's memory, half A (#425, step 5): proposals raised by code from what the player removed and rewrote (a share, not a count),
 * the three answers, the rules for one chat and for all chats, and the exact levers they move (things, text length, returns).
 */
import { describe, expect, it } from "bun:test";
import {
  addRule,
  answerProposal,
  applyReport,
  dmInput,
  drawCard,
  editRule,
  emptyState,
  handleRoute,
  leverStricter,
  learnEvidence,
  learnNote,
  learnedView,
  loadLearned,
  normalizeState,
  raiseProposals,
  removeRule,
  resetLearned,
  syncGlobalRules,
} from "../plugins/world/plugin.js";

const DAY = 86400000;
const NOW = 100 * DAY;
const rec = (id: string, kind: string, name: string, text: string, extra: Record<string, unknown> = {}) => ({ id, kind, name, aliases: [] as string[], text, status: "active", uid: 0, at: 1, ...extra });
const gone = (names: string[], extra: Record<string, unknown> = {}, at = NOW - DAY) => names.map((name, i) => ({ at: at + i, op: "delete", kind: "thing", name, madeBy: "dm", ...extra }));
const st = (entities: object[] = [], over: Record<string, unknown> = {}) => ({ ...emptyState("c1"), entities, nextId: 40, ...over }) as any;

function memFs(files: Record<string, string> = {}) {
  return {
    files,
    fs: {
      read: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      write: (p: string, v: string) => {
        files[p] = v;
      },
      remove: (p: string) => {
        delete files[p];
      },
      list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
    },
  };
}

describe("levers", () => {
  it("a lever is stricter when it writes fewer things, fewer returns or shorter text", () => {
    expect(leverStricter("things", "all", "reasons")).toBe(true);
    expect(leverStricter("things", "off", "reasons")).toBe(false);
    expect(leverStricter("cast", "normal", "rare")).toBe(true);
    expect(leverStricter("cast", "rare", "often")).toBe(false);
    expect(leverStricter("textMax", 900, 500)).toBe(true);
    expect(leverStricter("textMax", 500, 900)).toBe(false);
    expect(leverStricter("textMax", 900, 50)).toBe(false);
    expect(leverStricter("nope", 1, 0)).toBe(false);
  });

  it("the things lever limits what the DM may add, and the DM is told in plain words", () => {
    const base = { cards: [], userName: "Taras", now: 5 } as any;
    const report = { add: [{ kind: "thing", name: "Cup", text: "A cup.", why: "gift" }, { kind: "thing", name: "Letter", text: "Sealed.", why: "hidden" }, { kind: "place", name: "Hall", text: "A hall." }] };
    const all = st();
    applyReport(all, report, base);
    expect(all.entities.map((e: any) => e.name)).toEqual(["Cup", "Letter", "Hall"]);
    const few = st([], { settings: { ...emptyState("c1").settings, things: "reasons" } });
    applyReport(few, report, base);
    expect(few.entities.map((e: any) => e.name)).toEqual(["Letter", "Hall"]);
    const none = st([], { settings: { ...emptyState("c1").settings, things: "off" } });
    applyReport(none, report, base);
    expect(none.entities.map((e: any) => e.name)).toEqual(["Hall"]);
    expect(learnNote({ things: "all" })).toBe("");
    expect(dmInput({ cards: [], userName: "Taras", entities: [], msgs: [{ role: "char", text: "x" }], learned: learnNote({ things: "off" }) } as any)).toContain("places, people and groups only");
  });

  it("a thing already in the book is still updated when the lever is off", () => {
    const state = st([rec("n1", "thing", "Key", "A brass key.")], { settings: { ...emptyState("c1").settings, things: "off" } });
    applyReport(state, { add: [{ kind: "thing", name: "Key", text: "A bent brass key." }] }, { cards: [], userName: "Taras", now: 5 } as any);
    expect(state.entities[0].text).toBe("A bent brass key.");
  });

  it("settings keep the new keys and refuse a bad value", () => {
    const s = normalizeState({ settings: { level: "chronicler", things: "off", learn: false } }, "c1");
    expect(s.settings.things).toBe("off");
    expect(s.settings.learn).toBe(false);
    expect(normalizeState({ settings: { level: "chronicler", things: "weird" } }, "c1").settings.things).toBe("all");
    expect(emptyState("c1").settings.learn).toBe(true);
  });
});

describe("what the player's signals say", () => {
  it("7 of 9 things deleted is a preference; 5 of 60 is tidying", () => {
    const a = st(
      [rec("n1", "thing", "A", "x"), rec("n2", "thing", "B", "x")],
      { signals: gone(["T1", "T2", "T3", "T4", "T5", "T6", "T7"]) },
    );
    const ev = learnEvidence(a, NOW);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ key: "things", lever: { from: "all", to: "reasons" }, ev: { n: 7, total: 9, share: 78, min: 5, thr: 60 } });
    const many = Array.from({ length: 55 }, (_, i) => rec("n" + (i + 1), "thing", "K" + i, "x"));
    expect(learnEvidence(st(many, { signals: gone(["T1", "T2", "T3", "T4", "T5"]) }), NOW)).toEqual([]);
  });

  it("counts only what the DM wrote, only things, only inside the window", () => {
    const old = gone(["O1", "O2", "O3", "O4", "O5"], {}, NOW - 40 * DAY);
    const player = gone(["P1", "P2", "P3", "P4", "P5"], { madeBy: "player" });
    const places = gone(["L1", "L2", "L3", "L4", "L5"], { kind: "place" });
    expect(learnEvidence(st([], { signals: [...old, ...player, ...places] }), NOW)).toEqual([]);
    // a record the player wrote does not dilute the share either
    const mine = Array.from({ length: 20 }, (_, i) => rec("n" + (i + 1), "thing", "M" + i, "x", { by: "player" }));
    expect(learnEvidence(st(mine, { signals: gone(["T1", "T2", "T3", "T4", "T5"]) }), NOW)).toHaveLength(1);
  });

  it("the same name deleted twice counts once", () => {
    const s = st([], { signals: gone(["A", "A", "A", "B", "B"]) });
    expect(learnEvidence(s, NOW)).toEqual([]);
  });

  it("the ladder goes one step at a time and stops at none", () => {
    const sig = gone(["T1", "T2", "T3", "T4", "T5"]);
    const s = st([], { signals: sig, settings: { ...emptyState("c1").settings, things: "reasons" } });
    expect(learnEvidence(s, NOW)[0].lever).toMatchObject({ from: "reasons", to: "off" });
    expect(learnEvidence(st([], { signals: sig, settings: { ...emptyState("c1").settings, things: "off" } }), NOW)).toEqual([]);
  });

  it("three records rewritten shorter, one kind, is a preference about length", () => {
    const edit = (name: string, before: number, after: number) => ({ at: NOW - DAY, op: "edit", kind: "person", name, madeBy: "dm", lenBefore: before, lenAfter: after });
    const sig = [edit("A", 800, 300), edit("B", 700, 320), edit("C", 900, 410)];
    const s = st([rec("n1", "person", "D", "x")], { signals: sig });
    const ev = learnEvidence(s, NOW);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ key: "textMax", lever: { from: 900, to: 450 }, ev: { n: 3, total: 4, kind: "person", len: 450 } });
    // a small trim is not a preference, and neither is a record the player had written
    expect(learnEvidence(st([], { signals: [edit("A", 800, 700), edit("B", 700, 650), edit("C", 900, 800)] }), NOW)).toEqual([]);
    expect(learnEvidence(st([], { signals: sig.map((g) => ({ ...g, madeBy: "player" })) }), NOW)).toEqual([]);
  });

  it("people from the deck or the lorebooks that the player deleted lower the returns", () => {
    const sig = [
      ...gone(["Zoya", "Pavlo", "Ira"], { kind: "person", src: "deck" }),
      ...gone(["Bench one"], { kind: "person", src: "bench" }),
    ];
    const s = st([rec("n1", "person", "Kept", "x", { src: "deck" })], { signals: sig, settings: { ...emptyState("c1").settings, cast: "normal" } });
    const ev = learnEvidence(s, NOW);
    expect(ev[0]).toMatchObject({ key: "cast", lever: { from: "normal", to: "rare" }, ev: { n: 4, total: 5, share: 80 } });
    // a person the DM wrote on its own is not the cast's
    const own = [...gone(["A", "B", "C"], { kind: "person" })];
    expect(learnEvidence(st([], { signals: own, settings: { ...emptyState("c1").settings, cast: "normal" } }), NOW)).toEqual([]);
  });

  it("a person drawn from the deck is marked, and a delete of them is a signal with src", () => {
    const state = st([], { cast: [{ id: "c1", name: "Zoya", aliases: [], faction: "", tie: "", want: "", text: "A pedlar." }] });
    const made = drawCard(state, state.cast[0], 5);
    expect(made.src).toBe("deck");
    expect(normalizeState(JSON.parse(JSON.stringify(state)), "c1").entities[0].src).toBe("deck");
  });
});

describe("proposals are raised, kept and dropped", () => {
  const withSignals = () => st([], { signals: gone(["T1", "T2", "T3", "T4", "T5"]) });

  it("a raise writes the proposal and a log line with the signals, the share and the threshold; a second pass adds nothing", () => {
    const s = withSignals();
    expect(raiseProposals(s, NOW)).toBe(true);
    expect(s.learned.proposals).toHaveLength(1);
    expect(s.learned.log[0]).toMatchObject({ act: "raise", key: "things", to: "reasons", ev: { n: 5, share: 100, thr: 60, min: 5 } });
    expect(raiseProposals(s, NOW)).toBe(false);
    expect(s.learned.proposals).toHaveLength(1);
  });

  it("the switch turns it off", () => {
    const s = withSignals();
    s.settings.learn = false;
    expect(raiseProposals(s, NOW)).toBe(false);
    expect(s.learned).toBeUndefined();
  });

  it("a proposal the setting has overtaken is dropped", () => {
    const s = withSignals();
    raiseProposals(s, NOW);
    s.settings.things = "off";
    expect(raiseProposals(s, NOW)).toBe(true);
    expect(s.learned.proposals).toEqual([]);
  });

  it("the memory is saved with the state and cleaned on the way back", () => {
    const s = withSignals();
    raiseProposals(s, NOW);
    const back = normalizeState(JSON.parse(JSON.stringify(s)), "c1");
    expect(back.learned.proposals[0]).toMatchObject({ key: "things", lever: { to: "reasons" } });
    expect(normalizeState({ learned: { proposals: [{ id: "x", key: "things" }], rules: [{ id: "r1", at: 1, lever: { key: "bogus", to: 1 } }] } }, "c1").learned).toBeUndefined();
  });
});

describe("the answers", () => {
  const ready = () => {
    const s = st([], { signals: gone(["T1", "T2", "T3", "T4", "T5"]) });
    raiseProposals(s, NOW);
    return s;
  };

  it("this chat: the setting moves, a rule for this chat is kept, the log says so", () => {
    const { fs } = memFs();
    const s = ready();
    expect(answerProposal(fs, s, s.learned.proposals[0].id, "chat", NOW + 5)).toBe("");
    expect(s.settings.things).toBe("reasons");
    expect(s.learned.proposals).toEqual([]);
    expect(s.learned.rules[0]).toMatchObject({ scope: "chat", lever: { key: "things", to: "reasons" }, was: "all", source: "proposal" });
    expect(s.learned.log.at(-1)).toMatchObject({ act: "answer", answer: "chat" });
    expect(loadLearned(fs).rules).toEqual([]);
  });

  it("all chats: the rule goes to the file and this chat takes it at once", () => {
    const { fs, files } = memFs();
    const s = ready();
    answerProposal(fs, s, s.learned.proposals[0].id, "all", NOW + 5);
    expect(s.settings.things).toBe("reasons");
    expect(JSON.parse(files["world/learned.json"]!).rules[0]).toMatchObject({ scope: "all", lever: { key: "things", to: "reasons" } });
    expect(s.learned.applied[0]).toMatchObject({ key: "things", to: "reasons", was: "all" });
    expect(s.learned.rules).toEqual([]);
  });

  it("no: nothing changes, and the same proposal waits for as many fresh signals", () => {
    const { fs } = memFs();
    const s = ready();
    answerProposal(fs, s, s.learned.proposals[0].id, "no", NOW + 5);
    expect(s.settings.things).toBe("all");
    expect(raiseProposals(s, NOW + 10)).toBe(false);
    s.signals = [...s.signals, ...gone(["N1", "N2", "N3", "N4", "N5"], {}, NOW + 100)];
    expect(raiseProposals(s, NOW + 200)).toBe(true);
  });

  it("an unknown id or answer is refused", () => {
    const { fs } = memFs();
    const s = ready();
    expect(answerProposal(fs, s, "q99", "chat", NOW)).toBe("no such proposal");
    expect(answerProposal(fs, s, s.learned.proposals[0].id, "maybe", NOW)).toBe("unknown answer");
  });

  it("removing a rule gives the old value back, and not when the player already changed it", () => {
    const { fs } = memFs();
    const s = ready();
    answerProposal(fs, s, s.learned.proposals[0].id, "chat", NOW);
    const id = s.learned.rules[0].id;
    expect(removeRule(fs, s, id, NOW + 1)).toBe("");
    expect(s.settings.things).toBe("all");
    expect(s.learned.rules).toEqual([]);
    expect(s.learned.answered.at(-1)).toMatchObject({ answer: "removed" });
    const t = ready();
    answerProposal(fs, t, t.learned.proposals[0].id, "chat", NOW);
    t.settings.things = "off";
    removeRule(fs, t, t.learned.rules[0].id, NOW + 1);
    expect(t.settings.things).toBe("off");
    expect(removeRule(fs, t, "r99", NOW)).toBe("no such rule");
  });

  it("a rule written by hand sets the lever exactly for this chat; for all chats it is a file rule", () => {
    const { fs } = memFs();
    const s = st();
    expect(addRule(fs, s, "chat", "textMax", 500, NOW)).toBe("");
    expect(s.settings.textMax).toBe(500);
    expect(s.learned.rules[0]).toMatchObject({ source: "player", was: 900 });
    expect(addRule(fs, s, "all", "cast", "rare", NOW)).toBe("");
    expect(loadLearned(fs).rules[0].lever).toEqual({ key: "cast", to: "rare" });
    expect(addRule(fs, s, "chat", "textMax", 5, NOW)).toBe("unknown lever or value");
    expect(addRule(fs, s, "chat", "bogus", 1, NOW)).toBe("unknown lever or value");
  });

  it("editing a rule moves this chat, and the other chats follow where they held the old value", () => {
    const { fs } = memFs();
    const s = st();
    addRule(fs, s, "all", "textMax", 600, NOW);
    const id = loadLearned(fs).rules[0].id;
    const other = st([], {});
    syncGlobalRules(other, loadLearned(fs));
    expect(other.settings.textMax).toBe(600);
    expect(editRule(fs, s, id, 400, NOW + 1)).toBe("");
    expect(s.settings.textMax).toBe(400);
    syncGlobalRules(other, loadLearned(fs));
    expect(other.settings.textMax).toBe(400);
    expect(editRule(fs, s, id, 5, NOW)).toBe("unknown value");
  });
});

describe("rules for all chats reach the chats", () => {
  const globalFile = (rules: object[]) => memFs({ "world/learned.json": JSON.stringify({ v: 1, next: 5, rules, queue: [] }) });
  const rule = { id: "g1", scope: "all", lever: { key: "things", to: "off" }, source: "proposal", at: 1 };

  it("a chat takes a rule the first time it is read, and remembers what it replaced", () => {
    const { fs } = globalFile([rule]);
    const s = st();
    syncGlobalRules(s, loadLearned(fs));
    expect(s.settings.things).toBe("off");
    expect(s.learned.applied).toEqual([{ id: "g1", key: "things", to: "off", was: "all" }]);
  });

  it("a chat the player set by hand after the rule keeps its own value; a chat already stricter is left alone", () => {
    const { fs } = globalFile([{ ...rule, lever: { key: "things", to: "reasons" } }]);
    const s = st();
    syncGlobalRules(s, loadLearned(fs));
    s.settings.things = "all";
    syncGlobalRules(s, loadLearned(fs));
    expect(s.settings.things).toBe("all");
    const strict = st([], { settings: { ...emptyState("c1").settings, things: "off" } });
    syncGlobalRules(strict, loadLearned(fs));
    expect(strict.settings.things).toBe("off");
    expect(strict.learned).toBeUndefined();
  });

  it("a rule that is gone gives the value back in a chat that still holds it", () => {
    const { fs, files } = globalFile([rule]);
    const s = st();
    syncGlobalRules(s, loadLearned(fs));
    delete files["world/learned.json"];
    syncGlobalRules(s, loadLearned(fs));
    expect(s.settings.things).toBe("all");
    expect(s.learned.applied).toEqual([]);
  });

  it("loading a chat through the route applies the rule, so a save keeps it", () => {
    const { fs, files } = globalFile([rule]);
    files["chats/c1.meta.json"] = JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras" });
    files["chats/c1.jsonl"] = "";
    files["world/state/c1.json"] = JSON.stringify({ ...st(), settings: { level: "chronicler" } });
    const res = handleRoute({ method: "GET", path: "/world/state", query: { chatId: "c1" } }, { fs, llm: { request: () => {}, results: {} } } as any) as any;
    expect(res.json.settings.things).toBe("off");
    expect(res.json.learn).toMatchObject({ on: true, rules: 1, waiting: 0 });
  });
});

describe("reset and the routes", () => {
  const setup = () => {
    const m = memFs({
      "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras" }),
      "chats/c1.jsonl": "",
      "world/state/c1.json": JSON.stringify({ ...st([rec("n1", "thing", "Lamp", "x")], { signals: gone(["T1", "T2", "T3", "T4", "T5"], {}, Date.now() - 100000) }), settings: { ...emptyState("c1").settings, level: "chronicler" } }),
    });
    const call = (method: string, path: string, body: object = {}) => handleRoute({ method, path, query: method === "GET" ? body : {}, body }, { fs: m.fs, llm: { request: () => {}, results: {} } } as any) as any;
    return { ...m, call, state: () => JSON.parse(m.files["world/state/c1.json"]!) };
  };

  it("a rule written by hand goes over the route and shows in the view with the thresholds", () => {
    const m = setup();
    expect(m.call("POST", "/world/learned/rule", { chatId: "c1", scope: "chat", key: "textMax", to: 600 }).status).toBe(200);
    expect(m.state().settings.textMax).toBe(600);
    const view = m.call("GET", "/world/learned", { chatId: "c1" }).json;
    expect(view.rules).toHaveLength(1);
    expect(view.thresholds.things).toEqual({ min: 5, share: 60 });
  });

  it("answer, remove, clear and reset work over POST; a chat with no world is refused", () => {
    const m = setup();
    const s = normalizeState(m.state(), "c1");
    raiseProposals(s, Date.now());
    m.files["world/state/c1.json"] = JSON.stringify(s);
    const pid = s.learned.proposals[0].id;
    expect(m.call("POST", "/world/learned/answer", { chatId: "c1", id: pid, answer: "all" }).json.rules[0].scope).toBe("all");
    expect(m.state().settings.things).toBe("reasons");
    const gid = loadLearned(m.fs).rules[0].id;
    expect(m.call("POST", "/world/learned/remove", { chatId: "c1", id: gid }).json.rules).toEqual([]);
    expect(m.state().settings.things).toBe("all");
    expect(m.call("POST", "/world/learned/remove", { chatId: "c1", id: "r9" }).status).toBe(400);
    expect(m.call("GET", "/world/learned", { chatId: "c1" }).json.remembered).toEqual(["T5", "T4", "T3", "T2", "T1"]);
    expect(m.call("POST", "/world/learned/clear", { chatId: "c1" }).json.remembered).toEqual([]);
    addRule(m.fs, s, "all", "things", "off", NOW);
    expect(m.call("POST", "/world/learned/reset", { chatId: "c1" }).json.rules).toEqual([]);
    expect(m.state().learned).toBeUndefined();
    expect(m.files["world/learned.json"]).toBeUndefined();
    m.files["chats/c2.meta.json"] = JSON.stringify({ id: "c2", title: "X", characterId: "odarka" });
    m.files["chats/c2.jsonl"] = "";
    expect(m.call("POST", "/world/learned/answer", { chatId: "c2", id: "q1", answer: "no" }).status).toBe(409);
  });

  it("the view without a chat lists the rules for all chats and the proposals waiting in chats that still exist", () => {
    const m = setup();
    m.files["world/learned.json"] = JSON.stringify({ v: 1, next: 2, rules: [{ id: "g1", scope: "all", lever: { key: "things", to: "off" }, source: "proposal", at: 1 }], queue: [{ chatId: "c1", id: "q1", key: "things", at: 2 }, { chatId: "gone", id: "q1", key: "cast", at: 3 }] });
    const view = m.call("GET", "/world/learned").json;
    expect(view.rules).toHaveLength(1);
    expect(view.waiting).toEqual([{ chatId: "c1", id: "q1", key: "things", at: 2 }]);
    expect(view.note).toContain("places, people and groups only");
    expect(learnedView(m.fs, null).chatId).toBe("");
  });

  it("resetLearned gives the moved settings back", () => {
    const { fs } = memFs();
    const s = st();
    addRule(fs, s, "chat", "textMax", 500, NOW);
    addRule(fs, s, "all", "things", "off", NOW);
    resetLearned(fs, s);
    expect(s.settings.textMax).toBe(900);
    expect(s.settings.things).toBe("all");
    expect(s.learned).toBeUndefined();
  });
});
