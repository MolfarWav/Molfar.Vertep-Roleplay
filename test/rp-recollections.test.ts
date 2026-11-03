/**
 * What each character remembers of a closed scene (issue #99, piece 2): the chapter worker writes one recollection per
 * named character when the scene has a cast of two or more (chapter.views); a reply carries its own character's, a
 * narrator's carries everyone's it voices; the user can edit them; a switch mutes the block.
 */
import { describe, expect, it } from "bun:test";
import { L, mockHost, readJson, useRoot, writeChat, writeJson, type Msg } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any, query: Record<string, string> = {}) => L.handleRoute({ method, path, query, body }, host);
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "Jude", text });
const C = (id: string, name: string, text: string): Msg => ({ id, role: "char", name, text, swipe: 0 });

/** Six messages of a scene with two characters, then `after` plain turns of Aria and Jude. */
function cast(after: number): Msg[] {
  const scene = [
    U("m1", "Jude knocks at the tavern door."),
    C("m2", "Aria", "Aria opens it and lets him in."),
    C("m3", "Bram", "Bram looks up from the hearth."),
    U("m4", "Jude hands over the brass key."),
    C("m5", "Aria", "Aria takes the key without a word."),
    C("m6", "Bram", "Bram grunts and pours three cups."),
  ];
  const rest = Array.from({ length: after }, (_, i) => (i % 2 === 0 ? U("x" + i, `Jude asks about the road, turn ${i}.`) : C("x" + i, "Aria", `Aria answers about the road, turn ${i}.`)));
  return [...scene, ...rest];
}

const VIEWS = [
  { who: "Aria", text: "I let Jude in and took his brass key. I trust him, though I said nothing." },
  { who: "Bram", text: "I poured three cups and watched the stranger. I did not like the key." },
];

function seed(opts: { views?: any[]; group?: boolean; after?: number; meta?: Record<string, unknown> } = {}) {
  writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A quiet courier.", extensions: {} });
  writeJson("characters/bram/card.json", { spec: "chara_card_v2", name: "Bram", description: "A grim innkeeper.", extensions: {} });
  const msgs = cast(opts.after ?? 60);
  if (opts.group) writeJson("groups/g1.json", { id: "g1", name: "Tavern", generationMode: "narrator", memberIds: ["aria", "bram"] });
  writeChat("tav", msgs, { title: "Tavern", userName: "Jude", ...(opts.group ? { groupId: "g1" } : { characterId: "aria" }), ...opts.meta });
  const st = L.emptyChat("tav");
  st.migrated = true;
  st.chapters = [{ id: "c1", from: "m1", to: "m6", count: 6, sig: L.chapterSig(L.activeLine(msgs).slice(0, 6)), label: "The key", text: "Jude gave Aria a brass key in Bram's tavern.", kind: "scene", at: 1, ...(opts.views === undefined ? { views: VIEWS } : opts.views.length ? { views: opts.views } : {}) }];
  st.counters.chapter = 1;
  writeJson("litopys/chats/tav.json", st);
  return msgs;
}

/** A scene of the player and one character (Aria only), then turns of Aria and Jude, with one closed chapter holding `views`. */
function seedSolo(views: any[]) {
  writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A quiet courier.", extensions: {} });
  const msgs = cast(60).filter((m) => m.name !== "Bram");
  writeChat("tav", msgs, { title: "Tavern", userName: "Jude", characterId: "aria" });
  const st = L.emptyChat("tav");
  st.migrated = true;
  st.chapters = [{ id: "c1", from: "m1", to: "m5", count: 4, sig: L.chapterSig(L.activeLine(msgs).slice(0, 4)), label: "The key", text: "Jude gave Aria a brass key.", kind: "scene", at: 1, views }];
  st.counters.chapter = 1;
  writeJson("litopys/chats/tav.json", st);
  return msgs;
}

const ctx = (speakerName: string) => ({
  key: "reply",
  request: { messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] },
  turn: { op: "send", chatId: "tav", speakerName },
});
const textOf = (res: any) => (res ? res.messages.map((m: any) => m.content).join("\n") : "");
const labels = (res: any) => (res && res.promptSources ? res.promptSources.parts.map((p: any) => p.label) : []);

describe("recollections: the worker", () => {
  const scene = (ln: any[], to = 5) => ({ from: ln[0].id, to: ln[to].id, fromIdx: 0, toIdx: to, count: to + 1, kind: "scene", label: "" });
  const cfg = { ...L.DEFAULT_CONFIG };

  it("lists the cast without the player, a narrator or a repeated name", () => {
    const ln = L.activeLine(cast(0));
    expect(L.sceneCast(scene(ln), ln, null, { userName: "Jude" })).toEqual(["Aria", "Bram"]);
    const withNarrator = L.activeLine([...cast(0).slice(0, 5), C("m6", "Narrator", "Snow falls."), C("m7", "Tavern", "The hearth crackles.")]);
    expect(L.sceneCast(scene(withNarrator, 6), withNarrator, null, { userName: "Jude" }, ["Tavern"])).toEqual(["Aria", "Bram"]);
  });

  it("asks for recollections only when two or more characters are there", () => {
    const ln = L.activeLine(cast(0));
    const st = L.emptyChat("tav");
    const two = L.buildWorkerRequest(st, { scene: scene(ln), replaces: null }, ln, null, cfg, { userName: "Jude" });
    expect(two.systemPrompt).toContain("Recollections:");
    expect(two.systemPrompt).toContain('"views":[');
    expect(two.messages[0].content).toContain("Characters\n- Aria\n- Bram");
    // the rule asks what they want now, and still bans what a character did not witness
    expect(two.systemPrompt).toContain("what they want or mean to do now as a result of it");
    // and no causes wording leaks into the worker prompt when causes are off (rp-litopys-causes)
    expect(two.systemPrompt).not.toContain("because");
    expect(two.systemPrompt).toContain("Nothing they were not present for");
    // a scene of the player and one character: asked for too (#99: one is enough)
    const solo = L.activeLine(cast(0).filter((m) => m.name !== "Bram"));
    const one = L.buildWorkerRequest(st, { scene: scene(solo, 3), replaces: null }, solo, null, cfg, { userName: "Jude" });
    expect(one.systemPrompt).toContain("Recollections:");
    expect(one.systemPrompt).toContain('"views":[');
    expect(one.messages[0].content).toContain("Characters\n- Aria");
    // a scene with no named character besides the player: not asked for
    const none = L.activeLine(cast(0).filter((m) => m.role === "user"));
    const empty = L.buildWorkerRequest(st, { scene: scene(none, 1), replaces: null }, none, null, cfg, { userName: "Jude" });
    expect(empty.systemPrompt).not.toContain("Recollections:");
    expect(empty.systemPrompt).not.toContain('"views"');
    expect(empty.messages[0].content).not.toContain("Characters\n");
    // the switch in the settings
    const off = L.buildWorkerRequest(st, { scene: scene(ln), replaces: null }, ln, null, { ...cfg, recollections: false }, { userName: "Jude" });
    expect(off.systemPrompt).not.toContain("Recollections:");
  });

  it("reads the recollections as a list or as a map from a name to the text", () => {
    const a = L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" }, views: [{ who: "Aria", text: "I stayed." }] }));
    expect(a.views).toEqual([{ who: "Aria", text: "I stayed." }]);
    const b = L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" }, recollections: { Aria: "I stayed.", Bram: "I left." } }));
    expect(b.views).toEqual([{ who: "Aria", text: "I stayed." }, { who: "Bram", text: "I left." }]);
    expect(L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" } })).views).toEqual([]);
  });

  it("keeps a recollection only for a name of the cast, one each, trimmed", () => {
    const ln = L.activeLine(cast(0));
    const st = L.emptyChat("tav");
    const parsed = L.parseWorkerReply(
      JSON.stringify({
        chapter: { label: "The key", text: "Jude gave Aria a brass key." },
        views: [
          { who: "aria", text: "I took the key." },
          { who: "Aria", text: "A second line for Aria." },
          { who: "Jude", text: "The player is never given one." },
          { who: "Stranger", text: "Not in the scene." },
          { who: "Bram", text: "x".repeat(900) },
          { who: "Bram", text: "" },
        ],
      }),
    );
    L.applyWorkerResult(st, { scene: scene(ln), replaces: null }, parsed, { now: 1, line: ln, cast: ["Aria", "Bram"] });
    const views = st.chapters[0].views;
    expect(views.map((v: any) => v.who)).toEqual(["Aria", "Bram"]);
    expect(views[0].text).toBe("I took the key.");
    expect(views[1].text.length).toBeLessThanOrEqual(300);
  });

  it("cuts a long recollection after a whole sentence, never in the middle of a word", () => {
    const text = "I fled my burning capital and bled my palm to summon a man who bowed to me only to mock me to my face. He folded my door like paper and crushed the Minotauress's head, then told me the mark binds me to a Kael Vorn of his choosing. I will not beg, but I need his results, so I am bargaining with him and more words follow here.";
    const cut = L.cleanViews([{ who: "Rhea", text }], null)[0].text;
    expect(cut.length).toBeLessThanOrEqual(300);
    expect(cut.endsWith("choosing.")).toBe(true);
    expect(text.startsWith(cut)).toBe(true);
    // no sentence end in the second half: the last whole word
    expect(L.cutAtSentence("one two three four five six seven", 20)).toBe("one two three four");
    // a text that fits stays whole
    expect(L.cutAtSentence("Short.", 300)).toBe("Short.");
  });

  it("takes the length of one recollection from recollectChars, tells the model, and keeps your edit within it", () => {
    const ln = L.activeLine(cast(0));
    const st = L.emptyChat("tav");
    const long = ("I kept the key and said nothing about it. ").repeat(10).trim(); // 419 characters
    const parsed = L.parseWorkerReply(JSON.stringify({ chapter: { label: "The key", text: "Jude gave Aria a key." }, views: [{ who: "Aria", text: long }] }));
    const keep = (chars?: number) => {
      const s = L.emptyChat("tav");
      L.applyWorkerResult(s, { scene: scene(ln), replaces: null }, parsed, { now: 1, line: ln, cast: ["Aria"], recollectChars: chars });
      return s.chapters[0].views[0].text.length;
    };
    expect(keep()).toBeLessThanOrEqual(300);
    expect(keep(300)).toBeLessThanOrEqual(300);
    expect(keep(500)).toBe(long.length);
    // the prompt names the length (300 by default)
    expect(L.buildWorkerRequest(st, { scene: scene(ln), replaces: null }, ln, null, cfg, { userName: "Jude" }).systemPrompt).toContain("at most 300 characters each");
    expect(L.buildWorkerRequest(st, { scene: scene(ln), replaces: null }, ln, null, { ...cfg, recollectChars: 600 }, { userName: "Jude" }).systemPrompt).toContain("at most 600 characters each");
    // the setting: 150 to 1000, 300 when missing
    const { host } = mockHost();
    expect(route(host, "GET", "/litopys/config").json.recollectChars).toBe(300);
    expect(route(host, "PUT", "/litopys/config", { recollectChars: 5000 }).json.recollectChars).toBe(1000);
    expect(route(host, "PUT", "/litopys/config", { recollectChars: 10 }).json.recollectChars).toBe(150);
    expect(route(host, "PUT", "/litopys/config", { recollectChars: 450 }).json.recollectChars).toBe(450);
    // your edit in the chapter uses the same length
    seed();
    const chat = readJson("litopys/chats/tav.json");
    const id = chat.chapters[0].id;
    route(host, "POST", "/litopys/chapters", { op: "edit", chatId: "tav", id, views: [{ who: "Aria", text: long }] });
    expect(readJson("litopys/chats/tav.json").chapters[0].views[0].text.length).toBe(long.length);
    writeJson("litopys/config.json", {});
  });

  it("keeps the view of a single named character, and writes none when the scene had no character", () => {
    const ln = L.activeLine(cast(0));
    const parsed = L.parseWorkerReply(JSON.stringify({ chapter: { label: "L", text: "T" }, views: VIEWS }));
    // one character in the cast: her view is kept, a view of someone outside the cast is dropped
    const one = L.emptyChat("tav");
    L.applyWorkerResult(one, { scene: scene(ln), replaces: null }, parsed, { now: 1, line: ln, cast: ["Aria"] });
    expect(one.chapters[0].views).toEqual([VIEWS[0]]);
    // no cast (no named character besides the player): nothing is kept
    const none = L.emptyChat("tav");
    L.applyWorkerResult(none, { scene: scene(ln), replaces: null }, parsed, { now: 1, line: ln, cast: [] });
    expect(none.chapters[0].views).toBeUndefined();
    L.applyWorkerResult(L.emptyChat("tav"), { scene: scene(ln), replaces: null }, parsed, { now: 1, line: ln });
  });

  it("a 1:1 scene: her view is asked for, kept, and her reply carries it", () => {
    const solo = L.activeLine(cast(0).filter((m) => m.name !== "Bram"));
    const st = L.emptyChat("tav");
    const req = L.buildWorkerRequest(st, { scene: scene(solo, 3), replaces: null }, solo, null, cfg, { userName: "Jude" });
    expect(req.systemPrompt).toContain("Recollections:");
    const parsed = L.parseWorkerReply(
      JSON.stringify({ chapter: { label: "The key", text: "Jude gave Aria a brass key." }, views: [{ who: "Aria", text: "I took his key and let him in. I want him gone by morning." }] }),
    );
    const kept = L.emptyChat("tav");
    L.applyWorkerResult(kept, { scene: scene(solo, 3), replaces: null }, parsed, { now: 1, line: solo, cast: ["Aria"] });
    expect(kept.chapters[0].views).toEqual([{ who: "Aria", text: "I took his key and let him in. I want him gone by morning." }]);
    seedSolo(kept.chapters[0].views);
    const { host } = mockHost();
    const text = textOf(L.llmRequest(ctx("Aria"), host));
    expect(text).toContain("I want him gone by morning.");
  });
});

describe("recollections: the reply", () => {
  it("gives a character its own recollection and none of the other's", () => {
    seed();
    const { host } = mockHost();
    const res = L.llmRequest(ctx("Aria"), host);
    const text = textOf(res);
    // the only scene is the newest one: it rides next to the reply, not above the history
    expect(text).toContain("[What Aria remembers of the latest scene before these messages (Litopys)");
    expect(text).toContain("- The key: I let Jude in and took his brass key.");
    expect(text).not.toContain("I poured three cups");
    expect(labels(res)).toContain("Litopys · latest recollection");
    expect(labels(res)).not.toContain("Litopys · recollections");
    // it sits right before the player's message
    const msgs = res.messages;
    expect(msgs.at(-2).content).toContain("[What Aria remembers of the latest scene");
    expect(msgs.at(-1).content).toBe("hello");
    // the story record is still there beside it
    expect(text).toContain("Jude gave Aria a brass key in Bram's tavern.");
  });

  it("gives a narrator everyone it voices, each with the name", () => {
    seed({ group: true });
    const { host } = mockHost();
    const text = textOf(L.llmRequest(ctx("Tavern"), host));
    expect(text).toContain("[What each character remembers of the latest scene before these messages (Litopys)");
    expect(text).toContain("- The key: Aria: I let Jude in");
    expect(text).toContain("- The key: Bram: I poured three cups");
    expect(text).toContain("never let one use what only another remembers");
  });

  it("gives a group member its own, as a card of its own", () => {
    seed({ group: true });
    writeJson("groups/g1.json", { id: "g1", name: "Tavern", generationMode: "swap", memberIds: ["aria", "bram"] });
    const { host } = mockHost();
    const text = textOf(L.llmRequest(ctx("Bram"), host));
    expect(text).toContain("[What Bram remembers");
    expect(text).toContain("I poured three cups");
    expect(text).not.toContain("I let Jude in");
  });

  it("leaves out a scene whose messages are still in the prompt", () => {
    seed({ after: 2 });
    const { host } = mockHost();
    expect(textOf(L.llmRequest(ctx("Aria"), host))).not.toContain(" remembers of ");
  });

  it("is silent when the chapter has none, the setting is off, or the chat muted it", () => {
    seed({ views: [] });
    const { host } = mockHost();
    expect(textOf(L.llmRequest(ctx("Aria"), host))).not.toContain(" remembers of ");

    seed();
    writeJson("litopys/config.json", { recollections: false });
    expect(textOf(L.llmRequest(ctx("Aria"), host))).not.toContain(" remembers of ");
    writeJson("litopys/config.json", {});

    writeChat("tav", cast(60), { title: "Tavern", userName: "Jude", characterId: "aria", promptBoard: { v: 1, off: ["plugin:recollections"] } });
    const muted = L.llmRequest(ctx("Aria"), host);
    expect(textOf(muted)).not.toContain(" remembers of ");
    expect(labels(muted)).not.toContain("Litopys · recollections");
    expect(labels(muted)).not.toContain("Litopys · latest recollection");
  });

  it("says the same thing on every reply until a chapter closes", () => {
    seed();
    const { host } = mockHost();
    const a = textOf(L.llmRequest(ctx("Aria"), host));
    const b = textOf(L.llmRequest(ctx("Aria"), host));
    expect(a).toBe(b);
    const rec = (t: string) => t.split("\n").filter((l) => l.startsWith("[What Aria remembers") || l.startsWith("- The key: I let"));
    expect(rec(a).length).toBe(2);
  });

  it("keeps the newest scenes within its room, whole scenes only", () => {
    seed();
    const st = readJson("litopys/chats/tav.json");
    const long = "I remember every grain of that night, ".repeat(10);
    st.chapters = [1, 2, 3, 4].map((n) => ({ ...st.chapters[0], id: "c" + n, from: "m1", to: "m6", label: "Night " + n, views: [{ who: "Aria", text: long + n }] }));
    writeJson("litopys/chats/tav.json", st);
    const { host } = mockHost();
    const text = textOf(L.llmRequest(ctx("Aria"), host));
    const lines = text.split("\n").filter((l) => l.includes("I remember every grain"));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThan(4);
    // the dropped ones are the older, not the newest
    expect(lines.at(-1)).toContain("Night 4");
  });

  it("puts the newest scene next to the reply and the older ones above the history", () => {
    seed();
    const st = readJson("litopys/chats/tav.json");
    st.chapters = [1, 2].map((n) => ({ ...st.chapters[0], id: "c" + n, label: "Night " + n, views: [{ who: "Aria", text: "I remember night " + n + "." }] }));
    writeJson("litopys/chats/tav.json", st);
    const { host } = mockHost();
    const res = L.llmRequest(ctx("Aria"), host);
    const msgs = res.messages.map((m: any) => m.content);
    const older = msgs.findIndex((c: string) => c.includes("I remember night 1."));
    const newest = msgs.findIndex((c: string) => c.includes("I remember night 2."));
    expect(msgs[older]).toContain("[What Aria remembers of earlier scenes (Litopys)");
    expect(msgs[newest]).toContain("[What Aria remembers of the latest scene");
    expect(older).toBeLessThan(newest);
    expect(newest).toBe(msgs.length - 2);
    expect(labels(res)).toEqual(expect.arrayContaining(["Litopys · recollections", "Litopys · latest recollection"]));
  });

  it("tells a character the record may say more than it knows, and a narrator that each knows only their part", () => {
    seed();
    const st = readJson("litopys/chats/tav.json");
    st.chapters = [1, 2].map((n) => ({ ...st.chapters[0], id: "c" + n, label: "Night " + n, views: VIEWS }));
    writeJson("litopys/chats/tav.json", st);
    const { host } = mockHost();
    const one = textOf(L.llmRequest(ctx("Aria"), host));
    expect(one).toContain("Where the story record tells more about those scenes, Aria knows only this part.");
    expect(one).not.toContain("they know nothing of those scenes beyond it");
    seed({ group: true });
    writeJson("litopys/chats/tav.json", st);
    const many = textOf(L.llmRequest(ctx("Tavern"), host));
    expect(many).toContain("The story record shows the narrator the whole of those scenes, but each character knows only their own part");
  });

  it("says once, on the first memory block, to answer in the story's language", () => {
    seed();
    const { host } = mockHost();
    const res = L.llmRequest(ctx("Aria"), host);
    const all = res.messages.map((m: any) => String(m.content)).join("\n");
    expect(all.split(L.LANGUAGE_NOTE).length - 1).toBe(1);
    // on the first Litopys block, the stable one above the history
    expect(res.promptSources.parts[0].text.endsWith(L.LANGUAGE_NOTE)).toBe(true);
    expect(res.messages[1].content).toContain(L.LANGUAGE_NOTE);
  });

  it("takes its room from recollectBudget", () => {
    seed();
    const st = readJson("litopys/chats/tav.json");
    const long = "I remember every grain of that night, ".repeat(10);
    st.chapters = [1, 2, 3, 4].map((n) => ({ ...st.chapters[0], id: "c" + n, label: "Night " + n, views: [{ who: "Aria", text: long + n }] }));
    writeJson("litopys/chats/tav.json", st);
    writeJson("litopys/config.json", { recollectBudget: 1500 });
    const { host } = mockHost();
    const lines = textOf(L.llmRequest(ctx("Aria"), host)).split("\n").filter((l) => l.includes("I remember every grain"));
    expect(lines.length).toBe(4);
    writeJson("litopys/config.json", {});
  });
});

describe("recollections: editing and the carries answer", () => {
  it("edits, adds and clears them without marking the chapter as edited", () => {
    seed();
    const { host } = mockHost();
    const r = route(host, "POST", "/litopys/chapters", { chatId: "tav", op: "edit", id: "c1", views: [{ who: "Aria", text: "I kept the key safe." }, { who: "Bram", text: "" }] });
    expect(r.status).toBe(200);
    const ch = readJson("litopys/chats/tav.json").chapters[0];
    expect(ch.views).toEqual([{ who: "Aria", text: "I kept the key safe." }]);
    expect(ch.edited).toBeUndefined();
    expect(textOf(L.llmRequest(ctx("Aria"), host))).toContain("I kept the key safe.");

    expect(route(host, "POST", "/litopys/chapters", { chatId: "tav", op: "edit", id: "c1", views: "no" }).status).toBe(400);
    expect(route(host, "POST", "/litopys/chapters", { chatId: "tav", op: "edit", id: "c1", views: [] }).status).toBe(200);
    expect(readJson("litopys/chats/tav.json").chapters[0].views).toBeUndefined();
  });

  it("a text edit still marks the chapter as edited and keeps its recollections", () => {
    seed();
    const { host } = mockHost();
    route(host, "POST", "/litopys/chapters", { chatId: "tav", op: "edit", id: "c1", text: "Jude gave Aria the key." });
    const ch = readJson("litopys/chats/tav.json").chapters[0];
    expect(ch.edited).toBe(true);
    expect(ch.views).toHaveLength(2);
  });

  it("/carries tells what the reply would carry", () => {
    seed();
    const { host } = mockHost();
    const r = route(host, "GET", "/litopys/carries", undefined, { chatId: "tav", speaker: "Aria" });
    expect(r.status).toBe(200);
    expect(r.json.recollections.scenes).toBe(1);
    expect(r.json.recollections.who).toEqual(["Aria"]);
    expect(r.json.recollections.tokens).toBeGreaterThan(0);
    expect(r.json.recollections.text).toContain("I let Jude in");
    seed({ views: [] });
    expect(route(host, "GET", "/litopys/carries", undefined, { chatId: "tav", speaker: "Aria" }).json.recollections).toBeNull();
  });

  it("the chat view carries them to the Library", () => {
    seed();
    const { host } = mockHost();
    const r = route(host, "GET", "/litopys/chat", undefined, { chatId: "tav" });
    expect(r.status).toBe(200);
    expect(r.json.chapters[0].views).toEqual(VIEWS);
    seed({ views: [] });
    expect(route(host, "GET", "/litopys/chat", undefined, { chatId: "tav" }).json.chapters[0].views).toBeUndefined();
  });

  it("the settings route takes the switch", () => {
    const { host } = mockHost();
    expect(route(host, "GET", "/litopys/config").json.recollections).toBe(true);
    expect(route(host, "PUT", "/litopys/config", { recollections: false }).json.recollections).toBe(false);
    expect(route(host, "GET", "/litopys/config").json.recollections).toBe(false);
  });
});
