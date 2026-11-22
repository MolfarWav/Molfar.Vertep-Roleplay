// Direction (#496, phase 3b): people of the chat's World (its bench) in beats and in genre rules. Reading them, who a rule picks
// (members, the World, either), the note that says who they are, the director being asked about them for the one reply that carries
// the note, and the judgement (came / mentioned / sent).
import { describe, expect, it } from "bun:test";
// @ts-expect-error plain JS plugin
import * as d from "../plugins/direction/plugin.js";

type Files = Record<string, string>;
const CHAT = "c1";
const GROUP = "grp_a";
const members = [{ id: "hana", name: "Hana Morimoto" }, { id: "yuzu", name: "Yuzu Takane" }];
const named = d.memberNames(members, []);

const SATO = { id: "n3", kind: "person", name: "Mr. Sato", aliases: ["Sato-sensei"], text: "The strict maths teacher. He dislikes noise in the corridor.", status: "active" };
const entities = [
  SATO,
  { id: "n4", kind: "person", name: "Hana Morimoto", aliases: [], text: "A member's own record.", status: "active" },
  { id: "n5", kind: "person", name: "Kaito", aliases: [], text: "The player.", status: "active" },
  { id: "n6", kind: "person", name: "Old Ren", aliases: [], text: "Left the story.", status: "retired" },
  { id: "n7", kind: "person", name: "Aunt Mie", aliases: [], text: "Visits on Sundays. She brings sweets.", status: "active", noReturn: true },
  { id: "n8", kind: "place", name: "The roof", aliases: [], text: "A flat roof.", status: "active" },
];

function makeFs(files: Files) {
  return {
    read: (p: string) => {
      if (!(p in files)) throw new Error("ENOENT " + p);
      return files[p];
    },
    write: (p: string, t: string) => void (files[p] = t),
    list: () => [],
    remove: (p: string) => void delete files[p],
  };
}
const msg = (id: string, role: string, text: string, more: Record<string, unknown> = {}) => ({ id, role, text, swipe: 0, ...more });
const lines = (n: number, last = "Reply") => {
  const out: any[] = [msg("g", "system", "Morning.", { greeting: true })];
  for (let i = 1; i <= n; i++) out.push(msg("u" + i, "user", "Go on " + i), msg("r" + i, "char", i === n ? last : "Reply " + i));
  return out;
};
const jsonl = (list: any[]) => list.map((m) => JSON.stringify(m)).join("\n");
function world(list: any[], more: Files = {}): Files {
  return {
    ["chats/" + CHAT + ".meta.json"]: JSON.stringify({ id: CHAT, groupId: GROUP, userName: "Kaito" }),
    ["chats/" + CHAT + ".jsonl"]: jsonl(list),
    ["groups/" + GROUP + ".json"]: JSON.stringify({ id: GROUP, memberIds: ["hana", "yuzu"], generationMode: "narrator" }),
    "characters/hana/card.json": JSON.stringify({ name: "Hana Morimoto" }),
    "characters/yuzu/card.json": JSON.stringify({ name: "Yuzu Takane" }),
    "direction/config.json": JSON.stringify({ v: 1, model: "nano/flash" }),
    ["world/state/" + CHAT + ".json"]: JSON.stringify({ v: 1, chatId: CHAT, entities }),
    ...more,
  };
}
type Host = { fs: ReturnType<typeof makeFs>; llm: { results: Record<string, unknown>; request: (k: string, r: any) => void }; asked: { key: string; req: any }[] };
function makeHost(files: Files): Host {
  const asked: { key: string; req: any }[] = [];
  return { fs: makeFs(files), llm: { results: {}, request: (key, req) => void asked.push({ key, req }) }, asked };
}
const post = (path: string, body: unknown, stash?: unknown) => ({ method: "POST", path, body, query: {}, ...(stash ? { stash } : {}) });
const put = (path: string, body: unknown) => ({ method: "PUT", path, body, query: {} });
const get = (path: string, query: Record<string, string>) => ({ method: "GET", path, query });
const stateOf = (files: Files) => JSON.parse(files["direction/state/" + CHAT + ".json"]!);
const rep = (n: number, present: string[], tag = "break") => ({ key: "r" + n + "#0", at: 1, tag, present, sceneNew: false, model: "m", ms: 1 });
const reqOf = (op: string) => ({ key: "reply", request: { sessionId: CHAT, messages: [{ role: "user", content: "Hi." }] }, turn: { op } });

function setup(n = 4, more: Files = {}) {
  const files = world(lines(n), more);
  const host = makeHost(files);
  d.handleRoute(put("/direction/chat", { chatId: CHAT, on: true }), host);
  files["direction/state/" + CHAT + ".json"] = JSON.stringify({ ...stateOf(files), reports: Array.from({ length: n }, (_, i) => rep(i + 1, ["hana"])) });
  return { files, host };
}
/** The director reads the newest reply; returns the prompt it was sent and the route's answer. */
function runDirector(host: Host, answer: unknown) {
  const before = host.asked.length;
  const first = d.handleRoute(post("/direction/run", { chatId: CHAT, force: true }), host);
  expect(first.__llmPending).toBe(true);
  const prompt = host.asked[before]!.req.systemPrompt as string;
  host.llm.results = { direction: { text: JSON.stringify(answer), model: "nano/flash" } };
  const done = d.handleRoute(post("/direction/run", { chatId: CHAT, force: true }, first.stash), host);
  host.llm.results = {};
  return { prompt, done };
}

describe("direction world: reading the people", () => {
  it("active people of the book who are not members, not the player, not retired; a place is not a person", () => {
    const files = world(lines(2));
    const people = d.worldPeople(makeFs(files), CHAT, named, "Kaito");
    expect(people.map((p: any) => p.id)).toEqual(["n3", "n7"]);
    expect(people[0]).toMatchObject({ name: "Mr. Sato", text: "The strict maths teacher." });
    expect(people[0].names).toEqual(expect.arrayContaining(["mr. sato", "sato-sensei"]));
    expect(d.worldPeople(makeFs({}), CHAT, named, "Kaito")).toEqual([]);
  });
  it("matchNpc takes a name, an alias or a first word; npcPool leaves out noReturn and people the Dashboard already has in the scene", () => {
    const people = d.worldPeople(makeFs(world(lines(2))), CHAT, named, "Kaito");
    expect(d.matchNpc(["Sato-sensei", "Nobody"], people)).toEqual(["n3"]);
    expect(d.matchNpc(["Aunt"], people)).toEqual(["n7"]);
    expect(d.matchNpc(["Aunt Mie"], people)).toEqual(["n7"]);
    expect(d.npcPool(people, null)).toEqual(["n3"]);
    expect(d.npcPool(people, ["Mr. Sato"])).toEqual([]);
  });
});

describe("direction world: cleaning", () => {
  it("a beat keeps World ids only; a rule edit keeps a known `from`; a queued note may be a World person alone", () => {
    expect(d.cleanBeat({ id: "b1", text: "x", npc: ["n3", "hana", "n3", "n99999999"] }).npc).toEqual(["n3"]);
    expect(d.cleanRules({ set: "romcom", on: true, edits: { nobody: { from: "world" }, crowd: { from: "elsewhere" } } }).edits).toEqual({ nobody: { from: "world" } });
    expect(d.activeRules(d.cleanRules({ set: "romcom", on: true, edits: { nobody: { from: "any" } } })).map((r: any) => r.from)).toEqual(["members", "any", "members"]);
    const next = { id: "f", rule: "nobody", kind: "return", who: [], npc: ["n3"], with: [], after: "r4#0", forced: false, at: 1 };
    expect(d.cleanState({ next }, CHAT).next.npc).toEqual(["n3"]);
    expect(d.cleanState({ next: { ...next, npc: [] } }, CHAT).next).toBeNull();
  });
});

describe("direction world: who a rule picks", () => {
  const rule = (from: string, kind = "return") => ({ from, do: { kind, count: 1 } });
  const rows = [1, 2, 3].map((n) => ({ n, key: "r" + n + "#0", report: rep(n, ["hana"]) }));
  const rnd = () => 0.25;
  it("members only (the default) never touches the pool and picks as in phase 2", () => {
    expect(d.pickWho(rule("members"), { rows, members, here: ["hana"], rnd, npcs: ["n3"] })).toEqual({ who: ["yuzu"], npc: [] });
    expect(d.pickWho({ do: { kind: "return" } }, { rows, members, here: ["hana"], rnd })).toEqual({ who: ["yuzu"], npc: [] });
  });
  it("world only: a person of the pool, or nobody", () => {
    expect(d.pickWho(rule("world"), { rows, members, here: ["hana"], rnd, npcs: ["n3"] })).toEqual({ who: [], npc: ["n3"] });
    expect(d.pickWho(rule("world"), { rows, members, here: ["hana"], rnd, npcs: [] })).toBeNull();
  });
  it("either: a coin from the seeded generator when both exist, whoever exists when only one does", () => {
    expect(d.pickWho(rule("any"), { rows, members, here: ["hana"], rnd: () => 0.25, npcs: ["n3"] })).toEqual({ who: [], npc: ["n3"] });
    expect(d.pickWho(rule("any"), { rows, members, here: ["hana"], rnd: () => 0.75, npcs: ["n3"] })).toEqual({ who: ["yuzu"], npc: [] });
    expect(d.pickWho(rule("any"), { rows, members, here: ["hana", "yuzu"], rnd, npcs: ["n3"] })).toEqual({ who: [], npc: ["n3"] });
    expect(d.pickWho(rule("any"), { rows, members, here: ["hana"], rnd, npcs: [] })).toEqual({ who: ["yuzu"], npc: [] });
  });
});

describe("direction world: the note and the director's question", () => {
  const next = { id: "f1", rule: "nobody", kind: "return", who: [], npc: ["n3"], with: [], after: "r4#0", forced: false, at: 1 };
  const people = d.worldPeople(makeFs(world(lines(2))), CHAT, named, "Kaito");
  it("a rule's note names the person and says who they are; a beat's note too", () => {
    const note = d.ruleNote({ next, members, userName: "Kaito", people });
    expect(note).toContain("Mr. Sato comes back into the scene");
    expect(note).toContain("Who: Mr. Sato (The strict maths teacher.)");
    expect(note).toContain("not one of the group");
    const beat = { id: "b1", text: "The bell rings.", who: [], npc: ["n3"], when: { kind: "manual" }, wait: true };
    const text = d.beatNote({ next: { ...next, kind: "beat" }, beat, members, userName: "Kaito", people, tries: 0 });
    expect(text).toContain("Who: Mr. Sato takes part");
    expect(text).toContain("Who: Mr. Sato (The strict maths teacher.)");
  });
  it("the director prompt asks about others only when given names", () => {
    const base = { members, userName: "Kaito", log: [], prev: "", player: "Hi", reply: "Hello" };
    expect(d.buildPrompt(base).system).not.toContain("others");
    const asked = d.buildPrompt({ ...base, others: ["Mr. Sato"] }).system;
    expect(asked).toContain("- others: of these people, who are not members: Mr. Sato");
    expect(asked).toContain('"others": ["..."]');
  });
});

describe("direction world: end to end", () => {
  it("a beat naming a person: Fire now, the note on the reply, the director asked once, `came` when it names them", () => {
    const { files, host } = setup(4);
    const id = d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "The bell rings.", who: ["yuzu"], npc: ["n3"], when: { kind: "manual" } }] }), host).json.plan.beats[0].id;
    expect(d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json.world.people.map((p: any) => p.id)).toEqual(["n3", "n7"]);
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, beat: id }), host).json.next).toMatchObject({ kind: "beat", who: ["yuzu"], npc: ["n3"], forced: true });
    const out = d.llmRequest(reqOf("send"), host);
    expect(out.messages[0].content).toContain("Who: Yuzu Takane and Mr. Sato take part");
    expect(out.messages[0].content).toContain("Who: Mr. Sato (The strict maths teacher.)");
    // the reply that carried it arrives: the director is asked about Mr. Sato, and says he is there
    files["chats/" + CHAT + ".jsonl"] = jsonl(lines(5, "Mr. Sato opens the door. Yuzu looks up."));
    const run = runDirector(host, { tag: "break", present: ["Yuzu"], others: ["Sato-sensei"], sceneNew: false });
    expect(run.prompt).toContain("others: of these people, who are not members: Mr. Sato");
    expect(run.done.json.report.others).toEqual(["n3"]);
    const s = stateOf(files);
    expect(s.fires[0].result).toBe("came");
    expect(s.next).toBeNull();
    // the next reply's question has no `others` line
    files["chats/" + CHAT + ".jsonl"] = jsonl(lines(6));
    expect(runDirector(host, { tag: "break", present: ["Hana"], sceneNew: false }).prompt).not.toContain("others");
  });
  it("only mentioned when the director does not name them but the reply does; missed when neither", () => {
    for (const [text, answer, result] of [["Hana says Mr. Sato is late.", [], "mentioned"], ["Hana yawns.", [], "missed"]] as const) {
      const { files, host } = setup(4);
      const id = d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "Someone arrives.", npc: ["n3"], when: { kind: "manual" } }] }), host).json.plan.beats[0].id;
      d.handleRoute(post("/direction/fire", { chatId: CHAT, beat: id }), host);
      files["chats/" + CHAT + ".jsonl"] = jsonl(lines(5, text));
      runDirector(host, { tag: "break", present: ["Hana"], others: answer, sceneNew: false });
      expect(stateOf(files).fires[0].result).toBe(result);
    }
  });
  it("a rule that brings World people: Fire now picks one, the note rides the reply; the edit `from` is kept", () => {
    const { files, host } = setup(4);
    d.handleRoute(put("/direction/rules", { chatId: CHAT, set: "romcom" }), host);
    d.handleRoute(put("/direction/rules", { chatId: CHAT, rule: { id: "nobody", from: "world" } }), host);
    expect(d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json.rules.items.find((r: any) => r.id === "nobody").from).toBe("world");
    const fired = d.handleRoute(post("/direction/fire", { chatId: CHAT, rule: "nobody" }), host);
    expect(fired.json.next).toMatchObject({ rule: "nobody", who: [], npc: ["n3"], forced: true });
    expect(d.llmRequest(reqOf("send"), host).messages[0].content).toContain("Mr. Sato comes back into the scene");
    expect(stateOf(files).fires[0].npc).toEqual(["n3"]);
  });
  it("a rule from the World with nobody in the pool is refused by Fire now, and a rule decides with a person when the dice hit", () => {
    const empty = setup(4, { ["world/state/" + CHAT + ".json"]: JSON.stringify({ v: 1, chatId: CHAT, entities: [] }) });
    d.handleRoute(put("/direction/rules", { chatId: CHAT, set: "romcom" }), empty.host);
    d.handleRoute(put("/direction/rules", { chatId: CHAT, rule: { id: "nobody", from: "world" } }), empty.host);
    expect(d.handleRoute(post("/direction/fire", { chatId: CHAT, rule: "nobody" }), empty.host).json.error).toContain("nobody from the World");
    const st = d.cleanState({ on: true, rules: { set: "romcom", on: true, edits: { interrupted: { on: false }, crowd: { on: false }, nobody: { from: "world", need: 2 } } }, reports: [1, 2, 3, 4].map((n) => rep(n, [])) }, CHAT);
    const out = d.decideRules({ state: st, msgs: lines(4), members, chatId: CHAT, dashDirection: "", now: 1000, npcs: ["n3"] });
    expect(out.fire).toMatchObject({ rule: "nobody", who: [], npc: ["n3"] });
  });
});
