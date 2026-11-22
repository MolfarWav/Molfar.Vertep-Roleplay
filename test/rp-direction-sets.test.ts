// Direction (#496, phase 4): the built-in genre sets (rules, tags, beat templates) and the draft of a plan from the members' cards.
import { describe, expect, it } from "bun:test";
// @ts-expect-error plain JS plugin
import * as d from "../plugins/direction/plugin.js";

type Files = Record<string, string>;
const CHAT = "c1";
const GROUP = "grp_a";
const members = [{ id: "hana", name: "Hana Morimoto" }, { id: "yuzu", name: "Yuzu Takane" }];
const named = d.memberNames(members, []);

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
const msg = (id: string, role: string, text: string) => ({ id, role, text, swipe: 0 });
const lines = (n: number) => {
  const out: any[] = [{ ...msg("g", "system", "Morning."), greeting: true }];
  for (let i = 1; i <= n; i++) out.push(msg("u" + i, "user", "Go on " + i), msg("r" + i, "char", "Reply " + i));
  return out;
};
function world(n = 4, more: Files = {}): Files {
  return {
    ["chats/" + CHAT + ".meta.json"]: JSON.stringify({ id: CHAT, groupId: GROUP, userName: "Kaito" }),
    ["chats/" + CHAT + ".jsonl"]: lines(n).map((m) => JSON.stringify(m)).join("\n"),
    ["groups/" + GROUP + ".json"]: JSON.stringify({ id: GROUP, memberIds: ["hana", "yuzu"], generationMode: "narrator" }),
    "characters/hana/card.json": JSON.stringify({ name: "Hana Morimoto", description: "A quiet class representative who hides how much she cares.", personality: "Careful, dry humour." }),
    "characters/yuzu/card.json": JSON.stringify({ name: "Yuzu Takane", description: "A loud athletic girl who cannot sit still." }),
    "direction/config.json": JSON.stringify({ v: 1, model: "nano/flash" }),
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
const get = (path: string, query: Record<string, string> = {}) => ({ method: "GET", path, query });
const rep = (n: number, present: string[], tag = "break") => ({ key: "r" + n + "#0", at: 1, tag, present, sceneNew: false, model: "m", ms: 1 });

describe("direction sets: the built-in sets are well formed", () => {
  const ids = Object.keys(d.SETS);
  it("nine sets, rom-com first", () => {
    expect(ids).toEqual(["romcom", "harem", "slice", "drama", "thriller", "detective", "steamy", "adventure", "horror"]);
  });
  for (const id of Object.keys(d.SETS)) {
    it(id + ": rules, tags and templates hold together", () => {
      const set = d.SETS[id];
      const offered = d.tagsFor(id);
      expect(set.name.length).toBeGreaterThan(2);
      expect(set.rules.length).toBe(3);
      expect(new Set(set.rules.map((r: any) => r.id)).size).toBe(set.rules.length);
      for (const t of set.tags) expect(d.EXTRA_TAGS).toContain(t);
      for (const r of set.rules) {
        expect(d.KINDS).toContain(r.do.kind);
        expect(r.need).toBeGreaterThanOrEqual(2);
        expect(r.need).toBeLessThanOrEqual(12);
        expect(r.cooldown).toBeGreaterThan(0);
        for (const t of r.when.tag || []) expect(offered).toContain(t);
        for (const t of r.when.tagNot || []) expect(offered).toContain(t);
      }
      expect(set.templates.length).toBeGreaterThanOrEqual(3);
      for (const t of set.templates) {
        const beat = d.cleanBeat({ id: "x", text: t.text, when: t.when, wait: t.wait });
        expect(beat).not.toBeNull();
        expect(beat.when).toEqual(t.when);
        if (t.when.kind === "tag") expect(offered).toContain(t.when.tag);
      }
    });
  }
  it("rule ids are unique inside a set and the numbers a chat edits are clamped as before", () => {
    const rules = d.activeRules(d.cleanRules({ set: "thriller", on: true, edits: { ally: { need: 99, cooldown: -3 } } }));
    expect(rules.map((r: any) => r.id)).toEqual(["ally", "followed", "back"]);
    expect(rules[0].need).toBe(13);
    expect(rules[0].cooldown).toBe(0);
    expect(rules[0].defaults).toEqual({ need: 8, cooldown: 5, k: 0, m: 0, from: "members" });
  });
});

describe("direction sets: tags and the director's prompt", () => {
  const base = { members, userName: "Kaito", log: [], prev: "", player: "Hi", reply: "Hello" };
  it("a chat with no set, or the rom-com set, offers the phase 1 list only", () => {
    expect(d.tagsFor("")).toEqual(d.BASE_TAGS);
    expect(d.tagsFor("romcom")).toEqual(d.BASE_TAGS);
    const plain = d.buildPrompt(base).system;
    expect(plain).not.toContain("danger (");
    expect(plain).toContain("event (a festival");
  });
  it("a set adds its own scene kinds, in words", () => {
    const sys = d.buildPrompt({ ...base, extraTags: d.tagsFor("horror").filter((t: string) => d.EXTRA_TAGS.includes(t)) }).system;
    expect(sys).toContain("danger (a threat, a chase");
    expect(sys).toContain("night (late at night");
    expect(sys).not.toContain("meal (");
  });
  it("a report may carry a set's tag, and an unknown one is dropped", () => {
    expect(d.applyPrecedence("danger", 2)).toBe("danger");
    expect(d.applyPrecedence("nonsense", 2)).toBeNull();
  });
});

describe("direction sets: through the routes", () => {
  it("GET /direction/sets lists them; the state route returns the chat's tags, templates and each rule's defaults", () => {
    const files = world();
    const host = makeHost(files);
    const sets = d.handleRoute(get("/direction/sets"), host).json.sets;
    expect(sets.map((s: any) => s.id)).toContain("detective");
    expect(sets.find((s: any) => s.id === "drama").rules.map((r: any) => r.id)).toEqual(["worst", "overheard", "return"]);
    d.handleRoute(put("/direction/chat", { chatId: CHAT, on: true }), host);
    expect(d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json.plan.tags).toEqual(d.BASE_TAGS);
    d.handleRoute(put("/direction/rules", { chatId: CHAT, set: "thriller" }), host);
    const st = d.handleRoute(get("/direction/state", { chatId: CHAT }), host).json;
    expect(st.plan.tags).toEqual(d.tagsFor("thriller"));
    expect(st.plan.templates.map((t: any) => t.id)).toEqual(["clock", "betrayal", "escape"]);
    expect(st.rules.items.map((r: any) => r.id)).toEqual(["ally", "followed", "back"]);
    expect(st.rules.items[0].defaults.need).toBe(8);
    expect(st.rules.sets.length).toBe(9);
  });
  it("a rule of a new set fires like a rom-com rule (drama: someone walks in at the worst moment)", () => {
    const state = d.cleanState({ on: true, rules: { set: "drama", on: true, edits: { worst: { need: 2 }, overheard: { on: false }, return: { on: false } } }, reports: [1, 2, 3].map((n) => rep(n, ["hana"], "argument")) }, CHAT);
    const out = d.decideRules({ state, msgs: lines(3), members, chatId: CHAT, dashDirection: "", now: 1000 });
    expect(out.fire).toMatchObject({ rule: "worst", kind: "interrupt", who: ["yuzu"] });
  });
  it("the director's prompt for a chat with a set offers the set's kinds (through the run route)", () => {
    const files = world();
    const host = makeHost(files);
    d.handleRoute(put("/direction/chat", { chatId: CHAT, on: true }), host);
    d.handleRoute(put("/direction/rules", { chatId: CHAT, set: "detective" }), host);
    expect(d.handleRoute(post("/direction/run", { chatId: CHAT }), host).__llmPending).toBe(true);
    expect(host.asked[0]!.req.systemPrompt).toContain("investigation (searching, questioning");
  });
});

describe("direction draft: the prompt and the cleaning", () => {
  const cards = [{ id: "hana", name: "Hana Morimoto", about: "A quiet class representative." }, { id: "yuzu", name: "Yuzu Takane", about: "" }];
  it("the prompt carries the members' cards, the genre, the allowed kinds and the beats already planned", () => {
    const p = d.buildDraftPrompt({ cards, userName: "Kaito", setName: "Drama", tags: d.tagsFor("drama"), existing: ["The bell rings."] });
    expect(p.system).toContain("- Hana Morimoto: A quiet class representative.");
    expect(p.system).toContain("- Yuzu Takane\n");
    expect(p.system).toContain("Genre: Drama.");
    expect(p.system).toContain("argument");
    expect(p.user).toContain("- The bell rings.");
    expect(d.buildDraftPrompt({ cards, userName: "Kaito", setName: "", tags: d.BASE_TAGS, existing: [] }).system).not.toContain("Genre:");
  });
  it("parseDraft reads fences and a thinking block", () => {
    expect(d.parseDraft('<think>x</think>```json\n{"beats":[{"text":"a"}]}\n```')).toEqual([{ text: "a" }]);
    expect(d.parseDraft("no json")).toBeNull();
    expect(d.parseDraft('{"beats":"no"}')).toBeNull();
  });
  it("cleanDraft: names to ids, tag kinds only from the offered list, no repeats of the plan, at most 8", () => {
    const raw = [
      { text: "Yuzu bursts in with news.", who: ["Yuzu", "Ghost"], when: { kind: "replies", n: 4 } },
      { text: "A quarrel starts.", who: [], when: { kind: "tag", tag: "argument" } },
      { text: "A storm.", when: { kind: "tag", tag: "danger" } },
      { text: "the bell rings.", when: { kind: "replies", n: 2 } },
      { text: "A place thing.", when: { kind: "place", place: "roof" } },
      { text: "   " },
      ...Array.from({ length: 12 }, (_, i) => ({ text: "Extra " + i, when: { kind: "replies", n: 99999 } })),
    ];
    const out = d.cleanDraft(raw, { named, tags: d.tagsFor("drama"), existing: ["The bell rings."] });
    expect(out.length).toBe(8);
    expect(out[0]).toEqual({ text: "Yuzu bursts in with news.", who: ["yuzu"], npc: [], when: { kind: "replies", n: 4 }, wait: true });
    expect(out[1].when).toEqual({ kind: "tag", tag: "argument" });
    // "danger" is not offered in drama; place beats are not drafted; the plan's own text is not repeated
    expect(out[2].when).toEqual({ kind: "replies", n: 5 });
    expect(out.map((b: any) => b.text)).not.toContain("the bell rings.");
    expect(out[3].when).toEqual({ kind: "replies", n: 5 });
    expect(out[4].when.n).toBe(60);
  });
});

describe("direction draft: the route", () => {
  const answer = (beats: unknown) => ({ text: JSON.stringify({ beats }), model: "nano/flash" });
  function ask(host: Host, result: unknown, extra: Record<string, unknown> = {}) {
    const first = d.handleRoute(post("/direction/draft", { chatId: CHAT }), host);
    expect(first.__llmPending).toBe(true);
    host.llm.results = { direction_draft: result, ...extra };
    const done = d.handleRoute(post("/direction/draft", { chatId: CHAT }, first.stash), host);
    host.llm.results = {};
    return done;
  }
  it("one call on the director's model reads the cards and returns clean beats; nothing is saved", () => {
    const files = world();
    const host = makeHost(files);
    const done = ask(host, answer([{ text: "Hana finally says what she thinks.", who: ["Hana"], when: { kind: "replies", n: 6 } }]));
    expect(done.json).toMatchObject({ ok: true, beats: [{ text: "Hana finally says what she thinks.", who: ["hana"], when: { kind: "replies", n: 6 }, wait: true }] });
    const sent = host.asked[0]!;
    expect(sent.key).toBe("direction_draft");
    expect(sent.req.model).toBe("nano/flash");
    expect(sent.req.systemPrompt).toContain("A quiet class representative who hides how much she cares.");
    expect(sent.req.presetParams.max_tokens).toBe(1800);
    expect(files["direction/state/" + CHAT + ".json"]).toBeUndefined();
  });
  it("refuses without a model or a group; an empty answer is tried once more; a bad answer says so", () => {
    const noModel = makeHost(world(4, { "direction/config.json": JSON.stringify({ v: 1, model: "" }) }));
    expect(d.handleRoute(post("/direction/draft", { chatId: CHAT }), noModel).json).toMatchObject({ ok: false, reason: "no-model" });
    const host = makeHost(world());
    const first = d.handleRoute(post("/direction/draft", { chatId: CHAT }), host);
    host.llm.results = { direction_draft: { text: "", model: "m" } };
    const retry = d.handleRoute(post("/direction/draft", { chatId: CHAT }, first.stash), host);
    expect(retry.__llmPending).toBe(true);
    expect(host.asked[1]!.key).toBe("direction_draft_retry");
    host.llm.results = { direction_draft_retry: { text: "I cannot", model: "m" } };
    const bad = d.handleRoute(post("/direction/draft", { chatId: CHAT }, retry.stash), host);
    expect(bad.json).toMatchObject({ ok: false, reason: "bad-reply" });
    const empty = ask(makeHost(world()), answer([{ text: " " }]));
    expect(empty.json).toMatchObject({ ok: false, reason: "empty" });
    const err = ask(makeHost(world()), { error: "boom", model: "m" });
    expect(err.json).toMatchObject({ ok: false, reason: "error" });
  });
  it("the plan's own beats are not drafted again, and the genre is named in the prompt", () => {
    const files = world();
    const host = makeHost(files);
    d.handleRoute(put("/direction/chat", { chatId: CHAT, on: true }), host);
    d.handleRoute(put("/direction/rules", { chatId: CHAT, set: "drama" }), host);
    d.handleRoute(put("/direction/plan", { chatId: CHAT, beats: [{ text: "The letter arrives.", when: { kind: "manual" } }] }), host);
    const done = ask(host, answer([{ text: "The letter arrives." }, { text: "A choice must be made.", when: { kind: "tag", tag: "argument" } }]));
    expect(done.json.beats.map((b: any) => b.text)).toEqual(["A choice must be made."]);
    expect(host.asked[0]!.req.systemPrompt).toContain("Genre: Drama.");
    expect(host.asked[0]!.req.messages[0].content).toContain("- The letter arrives.");
  });
});
