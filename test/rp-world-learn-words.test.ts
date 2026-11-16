/**
 * The DM's memory, half B (#425): rules in words. A proposal for people, places and groups the player deleted, the small call of its own that
 * writes the rule, the answers (a rule for all chats needs a second confirmation checked by the server), the block "what this player
 * prefers" in the DM's input (10 rules, 600 characters, newer first), and rules written by hand.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addRule,
  answerProposal,
  cleanLearned,
  dmInput,
  editRule,
  emptyState,
  handleRoute,
  learnEvidence,
  learnTextRules,
  learnedInput,
  learnedView,
  loadLearned,
  normalizeState,
  raiseProposals,
  removeRule,
} from "../plugins/world/plugin.js";

const DAY = 86400000;
const NOW = 100 * DAY;
const J = (v: unknown) => JSON.stringify(v);
const rec = (id: string, kind: string, name: string, text: string, extra: Record<string, unknown> = {}) => ({ id, kind, name, aliases: [] as string[], text, status: "active", uid: 0, at: 1, ...extra });
const gone = (names: string[], extra: Record<string, unknown> = {}, at = NOW - DAY) => names.map((name, i) => ({ at: at + i, op: "delete", kind: "person", name, madeBy: "dm", text: name + " was a passer-by.", ...extra }));
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

describe("the evidence for a rule in words", () => {
  it("5 of 6 people the DM wrote on its own, deleted, raise a pending proposal for people; the lever kinds are not counted here", () => {
    const s = st([rec("n1", "person", "Kept", "x")], { signals: gone(["A", "B", "C", "D", "E"]) });
    const ev = learnEvidence(s, NOW);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ key: "words", kind: "person", ev: { n: 5, total: 6, share: 83, min: 5, thr: 60 } });
    // people from the deck have their own lever; they are not a rule in words
    expect(learnEvidence(st([], { signals: gone(["A", "B", "C", "D", "E"], { src: "deck" }) }), NOW)).toEqual([]);
  });

  it("each kind has its own share; places and groups count too", () => {
    const s = st([], { signals: [...gone(["P1", "P2", "P3", "P4", "P5"], { kind: "place" }), ...gone(["G1", "G2", "G3", "G4", "G5"], { kind: "group" })] });
    expect(learnEvidence(s, NOW).map((e: any) => e.kind).sort()).toEqual(["group", "place"]);
  });

  it("raising writes a pending proposal and a log line; one rule in words at a time; the model is not called", () => {
    const s = st([], { signals: [...gone(["A", "B", "C", "D", "E"]), ...gone(["P1", "P2", "P3", "P4", "P5"], { kind: "place" })] });
    expect(raiseProposals(s, NOW)).toBe(true);
    expect(s.learned.proposals).toHaveLength(1);
    expect(s.learned.proposals[0]).toMatchObject({ key: "words", state: "pending", text: "" });
    expect(s.learned.log[0]).toMatchObject({ act: "raise", key: "words", ev: { kind: "person", thr: 60 } });
  });

  it("a proposal in words survives the clean-up of the state, with its state", () => {
    const s = st([], { signals: gone(["A", "B", "C", "D", "E"]) });
    raiseProposals(s, NOW);
    const back = normalizeState(JSON.parse(J(s)), "c1");
    expect(back.learned.proposals[0]).toMatchObject({ key: "words", state: "pending" });
    back.learned.proposals[0].text = "Do not record passers-by.";
    expect(cleanLearned(JSON.parse(J(back.learned)))!.proposals[0]).toMatchObject({ state: "ready", text: "Do not record passers-by." });
  });
});

describe("the answers to a rule in words", () => {
  const ready = () => {
    const s = st([], { signals: gone(["A", "B", "C", "D", "E"]) });
    raiseProposals(s, NOW);
    return s;
  };
  const write = (s: any, text = "Do not record passers-by who have no part in the story.") => {
    s.learned.proposals[0].text = text;
    s.learned.proposals[0].state = "ready";
  };

  it("a rule that is not written yet cannot be accepted, but can be refused", () => {
    const { fs } = memFs();
    const s = ready();
    expect(answerProposal(fs, s, s.learned.proposals[0].id, "chat", NOW)).toBe("the rule is not written yet");
    expect(answerProposal(fs, s, s.learned.proposals[0].id, "no", NOW)).toBe("");
    expect(s.learned.answered.at(-1)).toMatchObject({ key: "words", kind: "person", answer: "no" });
  });

  it("this chat: the rule is kept in the chat's state, no setting moves", () => {
    const { fs } = memFs();
    const s = ready();
    write(s);
    expect(answerProposal(fs, s, s.learned.proposals[0].id, "chat", NOW + 1)).toBe("");
    expect(s.learned.rules[0]).toMatchObject({ scope: "chat", text: "Do not record passers-by who have no part in the story.", source: "proposal" });
    expect(s.settings).toEqual(emptyState("c1").settings);
  });

  it("all chats: the second confirmation is checked here, not only asked in the app", () => {
    const { fs } = memFs();
    const s = ready();
    write(s);
    const id = s.learned.proposals[0].id;
    expect(answerProposal(fs, s, id, "all", NOW + 1)).toBe("confirm needed");
    expect(s.learned.proposals).toHaveLength(1);
    expect(loadLearned(fs).rules).toEqual([]);
    expect(answerProposal(fs, s, id, "all", NOW + 1, true)).toBe("");
    expect(loadLearned(fs).rules[0]).toMatchObject({ scope: "all", text: expect.stringContaining("passers-by") });
  });

  it("a refused proposal is asked again only after as many fresh signals", () => {
    const { fs } = memFs();
    const s = ready();
    answerProposal(fs, s, s.learned.proposals[0].id, "no", NOW + 5);
    expect(raiseProposals(s, NOW + 10)).toBe(false);
    s.signals = [...s.signals, ...gone(["N1", "N2", "N3", "N4", "N5"], {}, NOW + 100)];
    expect(raiseProposals(s, NOW + 200)).toBe(true);
  });

  it("a rule by hand: cut to one line of 160 characters, a rule for all chats needs the confirmation, an empty one is refused", () => {
    const { fs } = memFs();
    const s = st();
    expect(addRule(fs, s, "chat", "words", "  Keep\n\n   notes   short.  ", NOW)).toBe("");
    expect(s.learned.rules[0].text).toBe("Keep notes short.");
    expect(addRule(fs, s, "chat", "words", "x".repeat(400), NOW)).toBe("");
    expect(s.learned.rules[1].text.length).toBe(160);
    expect(addRule(fs, s, "all", "words", "Fewer strangers.", NOW)).toBe("confirm needed");
    expect(addRule(fs, s, "all", "words", "Fewer strangers.", NOW, true)).toBe("");
    expect(loadLearned(fs).rules[0]).toMatchObject({ scope: "all", source: "player", text: "Fewer strangers." });
    expect(addRule(fs, s, "chat", "words", "   ", NOW)).toBe("a rule needs words");
  });

  it("a rule in words is edited and removed; removing moves no setting and is not asked about again soon", () => {
    const { fs } = memFs();
    const s = st();
    addRule(fs, s, "chat", "words", "Fewer strangers.", NOW);
    const id = s.learned.rules[0].id;
    expect(editRule(fs, s, id, "Far fewer strangers.", NOW + 1)).toBe("");
    expect(s.learned.rules[0].text).toBe("Far fewer strangers.");
    expect(editRule(fs, s, id, "  ", NOW + 1)).toBe("a rule needs words");
    expect(removeRule(fs, s, id, NOW + 2)).toBe("");
    expect(s.learned.rules).toEqual([]);
    expect(s.learned.log.at(-1)).toMatchObject({ act: "remove", key: "words", text: "Far fewer strangers." });
    addRule(fs, s, "all", "words", "Global one.", NOW, true);
    const gid = loadLearned(fs).rules[0].id;
    expect(editRule(fs, s, gid, "Global two.", NOW)).toBe("");
    expect(loadLearned(fs).rules[0].text).toBe("Global two.");
    expect(removeRule(fs, s, gid, NOW)).toBe("");
    expect(loadLearned(fs).rules).toEqual([]);
  });
});

describe("the block the DM reads", () => {
  const r = (id: string, text: string, at: number, scope = "chat") => ({ id, scope, text, source: "player", at });

  it("this chat's and all chats' rules together, newest first, 10 rules at most", () => {
    const mine = Array.from({ length: 8 }, (_, i) => r("r" + (i + 1), "Rule " + (i + 1), 100 + i));
    const all = Array.from({ length: 4 }, (_, i) => r("g" + (i + 1), "Global " + (i + 1), 200 + i, "all"));
    const t = learnTextRules({ rules: mine }, { rules: all });
    expect(t.used).toHaveLength(10);
    expect(t.all).toHaveLength(12);
    expect(t.used[0]!.id).toBe("g4");
    expect(t.used.map((x: any) => x.id)).not.toContain("r1");
  });

  it("600 characters of rule text at most: the older rules that do not fit are left out, never cut", () => {
    const long = "x".repeat(150);
    const rules = [r("r1", long, 1), r("r2", long, 2), r("r3", long, 3), r("r4", long, 4), r("r5", "short", 5)];
    const t = learnTextRules({ rules }, null);
    expect(t.used.map((x: any) => x.id)).toEqual(["r5", "r4", "r3", "r2"]);
    expect(t.used.reduce((n: number, x: any) => n + x.text.length, 0)).toBeLessThanOrEqual(600);
  });

  it("the input carries the lever words and the block; the card shows the same string", () => {
    const set = { ...emptyState("c1").settings, things: "off" };
    const text = learnedInput(set, { rules: [r("r1", "Fewer strangers.", 1)] }, { rules: [r("g1", "Short notes.", 2, "all")] });
    expect(text).toContain("places, people and groups only");
    expect(text).toContain("What this player prefers");
    expect(text.indexOf("- Short notes.")).toBeLessThan(text.indexOf("- Fewer strangers."));
    expect(learnedInput(emptyState("c1").settings, null, null)).toBe("");
    const input = dmInput({ cards: [], userName: "Taras", entities: [], msgs: [{ role: "char", text: "x" }], learned: text } as any);
    expect(input).toContain("- Fewer strangers.");
  });
});

describe("the call that writes the rule", () => {
  let root: string;
  const results: Record<string, unknown> = {};
  let requests: { key: string; spec: Record<string, any> }[] = [];
  beforeEach(() => {
    requests = [];
    root = fs.mkdtempSync(path.join(os.tmpdir(), "world-learn-"));
    for (const d of ["characters/odarka", "chats", "world/state"]) fs.mkdirSync(path.join(root, d), { recursive: true });
    fs.writeFileSync(path.join(root, "characters", "odarka", "card.json"), J({ spec: "chara_card_v2", name: "Odarka", description: "A witch.", scenario: "At the hut.", first_mes: "Hi." }));
    fs.writeFileSync(path.join(root, "settings.json"), J({ model: null }));
    fs.writeFileSync(path.join(root, "chats", "c1.meta.json"), J({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras" }));
    fs.writeFileSync(path.join(root, "chats", "c1.jsonl"), "");
    for (const k of Object.keys(results)) delete results[k];
  });
  afterEach(() => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
  });
  const host = () => ({
    fs: {
      root,
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => { const full = path.resolve(root, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content, "utf8"); },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: { request: (key: string, spec: Record<string, any>) => { requests.push({ key, spec }); }, results, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    log: () => {},
  });
  const call = (method: string, p: string, body?: unknown, query: Record<string, string> = {}) => {
    const r = handleRoute({ method, path: p, query, body }, host()) as any;
    return { status: r.status, ...(r.json ?? r) } as any;
  };
  const state = () => JSON.parse(fs.readFileSync(path.join(root, "world", "state", "c1.json"), "utf8"));
  const seed = (over: Record<string, unknown> = {}) => {
    const s = { ...st([rec("n1", "person", "Kept", "A friend of the road.")], { signals: gone(["A", "B", "C", "D", "E"], { at: Date.now() - 1000 }) }), chatId: "c1", settings: { ...emptyState("c1").settings, level: "chronicler" }, ...over };
    fs.writeFileSync(path.join(root, "world", "state", "c1.json"), J(s));
    const loaded = normalizeState(JSON.parse(J(s)), "c1");
    raiseProposals(loaded, Date.now());
    fs.writeFileSync(path.join(root, "world", "state", "c1.json"), J(loaded));
  };
  const answer = (text: unknown) => {
    for (const k of Object.keys(results)) delete results[k];
    results.world_learn = { text: typeof text === "string" ? text : J(text), model: "b/build", genTimeMs: 10 };
  };

  it("the first call asks the build model, with what was removed and what was kept, and the system prompt asks for one short rule", () => {
    seed();
    const first = call("POST", "/world/learned/phrase", { chatId: "c1" });
    expect(first.__llmPending).toBe(true);
    const asked = requests.find((r) => r.key === "world_learn")!.spec;
    expect(asked.systemPrompt).toContain("ONE rule");
    expect(asked.systemPrompt).toContain("at most 140 characters");
    const content = asked.messages[0].content as string;
    expect(content).toContain("The player deleted these records the DM wrote:\n- person E: E was a passer-by.");
    expect(content).toContain("Records the DM wrote that the player kept:\n- person Kept");
  });

  it("the reply becomes the proposal's text, cut to one line; nothing reaches the DM yet", () => {
    seed();
    answer({ rule: "  Do not record\npassers-by with no part in the story.  " });
    const r = call("POST", "/world/learned/phrase", { chatId: "c1" });
    expect(r.proposals[0]).toMatchObject({ key: "words", state: "ready", text: "Do not record passers-by with no part in the story." });
    expect(r.log[0]).toMatchObject({ act: "phrase", result: "ok", text: expect.stringContaining("passers-by") });
    expect(r.note).toBe("");
    expect(state().usage.runs).toBe(1);
  });

  it("an empty rule means no clear pattern: the proposal goes and is not asked again soon", () => {
    seed();
    answer({ rule: "" });
    const r = call("POST", "/world/learned/phrase", { chatId: "c1" });
    expect(r.phraseNone).toBe(true);
    expect(r.proposals).toEqual([]);
    expect(r.log[0]).toMatchObject({ act: "phrase", result: "none" });
    expect(state().learned.answered.at(-1)).toMatchObject({ key: "words", answer: "no" });
  });

  it("a reply that is not JSON, or a failed call, leaves the proposal in error and says so; a retry asks again", () => {
    seed();
    answer("I think the player dislikes strangers.");
    const bad = call("POST", "/world/learned/phrase", { chatId: "c1" });
    expect(bad.phraseCode).toBe("not-json");
    expect(bad.proposals[0]).toMatchObject({ state: "error" });
    expect(call("POST", "/world/learned/phrase", { chatId: "c1" }).skipped).toBe("nothing to write");
    answer({ rule: "Leave out strangers." });
    const again = call("POST", "/world/learned/phrase", { chatId: "c1", retry: true });
    expect(again.proposals[0]).toMatchObject({ state: "ready", text: "Leave out strangers." });
  });

  it("answering over the route: the second confirmation is refused without it", () => {
    seed();
    answer({ rule: "Leave out strangers." });
    const r = call("POST", "/world/learned/phrase", { chatId: "c1" });
    const id = r.proposals[0].id;
    const refused = call("POST", "/world/learned/answer", { chatId: "c1", id, answer: "all" });
    expect(refused.status).toBe(409);
    expect(refused.error).toBe("confirm needed");
    const done = call("POST", "/world/learned/answer", { chatId: "c1", id, answer: "all", confirm: true });
    expect(done.rules[0]).toMatchObject({ scope: "all", text: "Leave out strangers.", inPrompt: true });
    expect(done.note).toContain("- Leave out strangers.");
    expect(JSON.parse(fs.readFileSync(path.join(root, "world", "learned.json"), "utf8")).rules[0].text).toBe("Leave out strangers.");
  });

  it("a rule by hand over the route; the view says which rules fit in the block", () => {
    seed({ signals: [] });
    const r = call("POST", "/world/learned/rule", { chatId: "c1", scope: "chat", key: "words", to: "Keep notes short." });
    expect(r.rules[0]).toMatchObject({ text: "Keep notes short.", inPrompt: true });
    expect(r.limits).toEqual({ rules: 10, chars: 600, text: 160 });
    expect(call("POST", "/world/learned/rule", { chatId: "c1", scope: "all", key: "words", to: "x" }).status).toBe(409);
  });

  it("\"Suggest a rule\" makes a proposal from what the player removed, any kind, with no threshold; with nothing removed it says so", () => {
    seed({ signals: [] });
    expect(call("POST", "/world/learned/phrase", { chatId: "c1", manual: true }).status).toBe(409);
    seed({ signals: [...gone(["A", "B"], { at: Date.now() - 1000 }), ...gone(["Cup"], { kind: "thing", at: Date.now() - 1000 })] });
    answer({ rule: "Leave out strangers." });
    const r = call("POST", "/world/learned/phrase", { chatId: "c1", manual: true });
    expect(r.proposals[0]).toMatchObject({ key: "words", state: "ready", ev: { manual: true, n: 3, kind: "person" } });
    expect(call("POST", "/world/learned/phrase", { chatId: "c1", manual: true }).status).toBe(409);
  });

  it("the view counts the rules being written", () => {
    seed();
    const view = call("GET", "/world/state", undefined, { chatId: "c1" });
    expect(view.learn).toMatchObject({ rules: 0, waiting: 1, phrasing: 1 });
    expect(learnedView(host().fs as any, null).limits.chars).toBe(600);
  });
});
