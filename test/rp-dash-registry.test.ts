/**
 * #240 phase A: the Dashboard goes through the entity registry, so one person never becomes two Dashboard characters.
 * Names of the sensor are resolved to the people of the chat (cards, souls, earlier names); labels that are no people
 * (card titles, narrators) never become characters; a doubtful pair is suggested, never merged in silence; the user
 * merges (merge-character) or keeps them apart (apart-characters).
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "dash-registry-"));
  for (const d of ["chats", "dashboard", "litopys", "groups"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ autoSoul: false }));
});
afterEach(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {}
});

function mockHost(replies: string[] = []) {
  const results: Record<string, unknown> = {};
  let pending: string[] = [];
  const queue = replies.slice();
  const host = {
    fs: {
      read: (rel: string) => fs.readFileSync(path.resolve(root, rel), "utf8"),
      write: (rel: string, content: string) => {
        const full = path.resolve(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, "utf8");
      },
      list: (rel = ".") => fs.readdirSync(path.resolve(root, rel)).sort(),
      remove: (rel: string) => fs.rmSync(path.resolve(root, rel), { recursive: true, force: true }),
    },
    store: { get: () => null, put: () => {}, delete: () => {}, keys: () => [] },
    llm: {
      request: (key: string) => {
        pending.push(key);
      },
      results,
      embed: () => {},
      embedResults: {},
    },
    net: { request: () => {}, results: {} },
    log: () => {},
  };
  const answer = () => {
    for (const k of Object.keys(results)) delete results[k];
    for (const key of pending) {
      const next = queue.shift();
      if (next === undefined) throw new Error("no scripted reply left for " + key);
      results[key] = { text: next, model: "mock/sensor", usage: { input: 100, output: 20 }, genTimeMs: 42 };
    }
    pending = [];
  };
  return { host, answer, push: (...r: string[]) => queue.push(...r) };
}
type Mock = ReturnType<typeof mockHost>;

function drive(mock: Mock, req: { method: string; path: string; body?: unknown; query?: Record<string, string> }) {
  const call: any = { query: {}, ...req };
  for (const k of Object.keys(mock.host.llm.results)) delete (mock.host.llm.results as any)[k];
  let out = P.handleRoute(call, mock.host) as any;
  for (let pass = 0; out?.__llmPending && pass < 3; pass++) {
    if (out.stash) call.stash = out.stash;
    mock.answer();
    out = P.handleRoute(call, mock.host);
  }
  return out;
}
const reply = (o: Record<string, unknown>) => JSON.stringify(o);
/** One sensor run: the reply is scripted, the chat is whatever was written last. */
function run(mock: Mock, chatId: string, o: Record<string, unknown>) {
  mock.push(reply({ minutes: 5, ...o }));
  const out = drive(mock, { method: "POST", path: "/dashboard/update", body: { chatId, op: "send" } });
  expect(out.json.ok).toBe(true);
  return readState(chatId);
}
const view = (mock: Mock, chatId: string) => drive(mock, { method: "GET", path: "/dashboard/state", query: { chatId, view: "1" } }).json.view;
const people = (mock: Mock, chatId: string, body: Record<string, unknown>) => drive(mock, { method: "POST", path: "/dashboard/notes", body: { chatId, ...body } });

const stateFile = (id: string) => path.join(root, "dashboard/state", id + ".json");
const readState = (id: string) => JSON.parse(fs.readFileSync(stateFile(id), "utf8"));
const writeState = (id: string, st: unknown) => fs.writeFileSync(stateFile(id), JSON.stringify(st));
const readRegistry = (id: string) => JSON.parse(fs.readFileSync(path.join(root, "registry", id + ".json"), "utf8"));
const lastSnap = (id: string) => {
  const st = readState(id);
  return Object.values(st.snapshots as Record<string, any>).sort((a, b) => b.at - a.at)[0];
};

function card(id: string, name: string, extra: Record<string, unknown> = {}) {
  fs.mkdirSync(path.join(root, "characters", id), { recursive: true });
  fs.writeFileSync(path.join(root, "characters", id, "card.json"), JSON.stringify({ spec: "chara_card_v2", name, extensions: {}, ...extra }));
}
type Msg = { id: string; role: string; name?: string; text: string; swipe?: number; characterId?: string };
const U = (id: string, text: string): Msg => ({ id, role: "user", name: "You", text });
const C = (id: string, name: string, text: string, characterId?: string): Msg => ({ id, role: "char", name, text, swipe: 0, ...(characterId ? { characterId } : {}) });
function chat(id: string, msgs: Msg[], meta: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(root, "chats", id + ".meta.json"), JSON.stringify({ title: "Chat " + id, userName: "You", model: "chat/model", updatedAt: Date.now(), ...meta }));
  fs.writeFileSync(path.join(root, "chats", id + ".jsonl"), msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
}

const story = (name: string, characterId?: string): Msg[] => [U("m1", "Hello."), C("m2", name, "She looked up.", characterId), U("m3", "Why?")];
const more = (name: string, characterId?: string): Msg[] => [...story(name, characterId), C("m4", name, "She laughed.", characterId), U("m5", "Ok.")];

describe("one person, one Dashboard character", () => {
  it("a card Queen Seraphina: the sensor writing Seraphina is the same character", () => {
    card("queen", "Queen Seraphina");
    chat("c1", story("Queen Seraphina", "queen"), { characterId: "queen" });
    const mock = mockHost();
    run(mock, "c1", { present: ["Seraphina"], chars: { Seraphina: { mood: "calm" } } });
    const snap = lastSnap("c1");
    expect(Object.keys(snap.chars)).toEqual(["Queen Seraphina"]);
    expect(snap.present).toEqual(["Queen Seraphina"]);
    expect(snap.chars["Queen Seraphina"].mood).toBe("calm");
    // the spelling is kept, so the next lookup is exact
    const reg = readRegistry("c1");
    expect(reg.entities.find((e: any) => e.name === "Queen Seraphina").aliases.map((a: any) => a.text)).toContain("Seraphina");
    expect(reg.entities.filter((e: any) => e.kind === "person" && e.id !== "user")).toHaveLength(1);
  });

  it("a card Sina Rose and the name Sina; a card Kaede Fuji and the name in Cyrillic", () => {
    card("sina", "Sina Rose");
    chat("c1", story("Sina Rose", "sina"), { characterId: "sina" });
    const mock = mockHost();
    run(mock, "c1", { present: ["Sina Rose", "Sina"], chars: { Sina: { mood: "playful" } } });
    expect(Object.keys(lastSnap("c1").chars)).toEqual(["Sina Rose"]);
    expect(lastSnap("c1").chars["Sina Rose"].mood).toBe("playful");

    card("kaede", "Kaede Fuji");
    chat("c2", story("Kaede Fuji", "kaede"), { characterId: "kaede" });
    run(mock, "c2", { present: ["Каэде"], chars: { "Каэде": { mood: "shy" } } });
    expect(Object.keys(lastSnap("c2").chars)).toEqual(["Kaede Fuji"]);
    expect(lastSnap("c2").chars["Kaede Fuji"].mood).toBe("shy");
  });

  it("the Characters block lists a person once, with up to four other spellings and never the user's", () => {
    card("kaede", "Kaede Fuji", { description: "Name: Kaede Fuji\nNickname: Kae" });
    chat("c1", story("Kaede Fuji", "kaede"), { characterId: "kaede", userName: "Denis" });
    const sent: string[] = [];
    const mock = mockHost();
    const orig = mock.host.llm.request;
    mock.host.llm.request = (key: string, req: any) => {
      sent.push(String(req.messages[0].content));
      orig(key);
    };
    run(mock, "c1", { present: ["Kaede Fuji"] });
    const block = sent[0]!.split("\n\n")[0]!;
    expect(block).toContain("Kaede Fuji (");
    expect(block).toContain("also: Kae");
    expect(block).not.toContain("Denis (");
    expect(block.match(/Kaede Fuji/g)).toHaveLength(1);
  });

  it("a narrator card titled Campus Sluts with ### Alice Yamada and ### Carolina Bell: the names map to the sections, the title is never a character", () => {
    card("campus", "Campus Sluts", { description: "### Alice Yamada\nShy student.\n\n### Carolina Bell\nLoud student.\n" });
    chat("c1", story("Campus Sluts", "campus"), { characterId: "campus" });
    const mock = mockHost();
    run(mock, "c1", { present: ["Alice", "Carolina", "Campus Sluts"], chars: { "Campus Sluts": { mood: "x" }, Alice: { mood: "nervous" } } });
    const snap = lastSnap("c1");
    expect(Object.keys(snap.chars).sort()).toEqual(["Alice Yamada", "Carolina Bell"]);
    expect(snap.chars["Alice Yamada"].mood).toBe("nervous");
    expect(readState("c1").notPersons).toContain("campus sluts");
    expect(readRegistry("c1").entities.some((e: any) => /campus/i.test(e.name))).toBe(false);
    // later turns keep it out too, also when the speaker of the new messages is the title
    chat("c1", more("Campus Sluts", "campus"), { characterId: "campus" });
    run(mock, "c1", { present: ["Campus Sluts", "Alice"] });
    expect(Object.keys(lastSnap("c1").chars).sort()).toEqual(["Alice Yamada", "Carolina Bell"]);
    expect(lastSnap("c1").present).toEqual(["Alice Yamada"]);
    expect(Object.keys(view(mock, "c1").chars).sort()).toEqual(["Alice Yamada", "Carolina Bell"]);
  });

  it("a speaker label that is a card title is an alias of the card's person, not a second person", () => {
    card("queen", "Queen Seraphina");
    const label = "Fallen Queen Turned Public Use   Slave";
    chat("c1", story(label, "queen"), { characterId: "queen" });
    const mock = mockHost();
    run(mock, "c1", { present: [label, "Queen Seraphina"], chars: { [label]: { mood: "broken" } } });
    const snap = lastSnap("c1");
    expect(Object.keys(snap.chars)).toEqual(["Queen Seraphina"]);
    expect(snap.chars["Queen Seraphina"].mood).toBe("broken");
    const aliases = readRegistry("c1").entities.find((e: any) => e.name === "Queen Seraphina").aliases.map((a: any) => a.text);
    expect(aliases).toContain("Fallen Queen Turned Public Use Slave");
    // it is not listed to the sensor as another spelling (too long)
    expect(readState("c1").notPersons).toEqual([]);
  });

  it("a truly new name is a character; Mark and Marko are suggested as one person; the user's names are not characters", () => {
    card("aria", "Aria");
    chat("c1", story("Aria", "aria"), { characterId: "aria", userName: "Denis" });
    const mock = mockHost();
    run(mock, "c1", { present: ["Aria", "Mark"], chars: { Mark: { mood: "gruff" } } });
    expect(Object.keys(lastSnap("c1").chars).sort()).toEqual(["Aria", "Mark"]);
    expect(view(mock, "c1").suggest).toEqual([]);
    chat("c1", more("Aria", "aria"), { characterId: "aria", userName: "Denis" });
    run(mock, "c1", { present: ["Aria", "Marko"], chars: { Marko: { mood: "gruff" } } });
    expect(Object.keys(lastSnap("c1").chars).sort()).toEqual(["Aria", "Mark", "Marko"]);
    expect(view(mock, "c1").suggest).toEqual([{ a: "Marko", b: "Mark", why: "one letter apart" }]);

    // the user's names, the current one and an earlier one, are never characters
    const msgs = [...more("Aria", "aria"), { ...U("m6", "Hi again."), name: "Dan" }, C("m7", "Aria", "Hm.", "aria"), U("m8", "Bye.")];
    chat("c1", msgs, { characterId: "aria", userName: "Denis" });
    run(mock, "c1", { present: ["Aria", "Denis", "Dan", "user", "You"], events: [{ id: "compliment", weight: "routine", from: "Dan", to: "Aria", quote: "x" }] });
    expect(Object.keys(lastSnap("c1").chars).sort()).toEqual(["Aria", "Mark", "Marko"]);
    expect(lastSnap("c1").present).toEqual(["Aria"]);
    const reg = readRegistry("c1");
    expect(reg.entities.find((e: any) => e.id === "user").name).toBe("Denis");
    expect(reg.entities.some((e: any) => e.id !== "user" && ["denis", "dan", "you"].includes(e.name.toLowerCase()))).toBe(false);
  });

  it("an ambiguous first name makes a new person and suggests both candidates", () => {
    card("ay", "Alice Yamada");
    card("ac", "Alice Cooper");
    fs.writeFileSync(path.join(root, "groups/g1.json"), JSON.stringify({ memberIds: ["ay", "ac"], mode: "round" }));
    chat("g", [U("m1", "Hello."), C("m2", "Alice Yamada", "Hi.", "ay"), U("m3", "Which one?")], { characterId: undefined, groupId: "g1" });
    const mock = mockHost();
    run(mock, "g", { present: ["Alice"], chars: { Alice: { mood: "unclear" } } });
    expect(Object.keys(lastSnap("g").chars)).toEqual(["Alice"]);
    const reg = readRegistry("g");
    const alice = reg.entities.find((e: any) => e.name === "Alice");
    const ay = reg.entities.find((e: any) => e.name === "Alice Yamada");
    const ac = reg.entities.find((e: any) => e.name === "Alice Cooper");
    expect(reg.suggest).toEqual(
      expect.arrayContaining([
        { a: alice.id, b: ay.id, why: "two people fit" },
        { a: alice.id, b: ac.id, why: "two people fit" },
      ]),
    );
  });
});

/** A chat whose state holds both "Queen Seraphina" and "Seraphina" (what an older version made). */
function oldDuplicateState(mock: Mock) {
  card("queen", "Queen Seraphina");
  chat("c1", story("Queen Seraphina", "queen"), { characterId: "queen" });
  run(mock, "c1", { present: ["Queen Seraphina"], chars: { "Queen Seraphina": { mood: "calm", outfit: "a red gown" } }, learned: [{ who: "Queen Seraphina", text: "The user keeps a secret", how: "saw" }] });
  const st = readState("c1");
  const key = Object.keys(st.snapshots)[0]!;
  const snap = st.snapshots[key];
  // the older version also had the short name: its own numbers, notebook, history and things
  snap.chars.Seraphina = { ...JSON.parse(JSON.stringify(snap.chars["Queen Seraphina"])), stats: { trust: 11, comfort: 0, attraction: 0, respect: 0, affection: 0 }, items: [{ id: "i1", kind: "hold", text: "a silver key" }], itemSeq: 1, outfit: null, holding: "a silver key" };
  snap.chars["Queen Seraphina"].items = [{ id: "i1", kind: "wear", text: "a red gown" }];
  snap.chars["Queen Seraphina"].itemSeq = 1;
  snap.present = ["Queen Seraphina", "Seraphina"];
  st.notebook.Seraphina = [
    { id: "n90", text: "The user keeps a secret", how: "saw", from: null, turn: 1, src: key },
    { id: "n91", text: "The user owes her a debt", how: "heard", from: "Queen Seraphina", believes: true, turn: 1, src: key },
  ];
  st.history.Seraphina = [{ turn: 1, kind: "calls", from: "", to: "stranger", src: key }];
  // an older state has no ids for its names and no registry
  delete st.personIds;
  delete st.notPersons;
  writeState("c1", st);
  fs.rmSync(path.join(root, "registry"), { recursive: true, force: true });
  chat("c1", more("Queen Seraphina", "queen"), { characterId: "queen" });
  run(mock, "c1", { present: ["Queen Seraphina"], chars: { "Queen Seraphina": { mood: "calm" } } });
  return key;
}

describe("a state that already holds the same person twice", () => {
  it("is not merged in silence: both stay, and the pair is suggested", () => {
    const mock = mockHost();
    oldDuplicateState(mock);
    expect(Object.keys(lastSnap("c1").chars).sort()).toEqual(["Queen Seraphina", "Seraphina"]);
    expect(view(mock, "c1").suggest).toEqual([{ a: "Seraphina", b: "Queen Seraphina", why: "same first name" }]);
    // the two keep their own ids from now on
    const ids = readState("c1").personIds;
    expect(ids["Queen Seraphina"]).not.toBe(ids.Seraphina);
  });

  it("merge folds the numbers, notes, history and things across every snapshot, and the name finds the target afterwards", () => {
    const mock = mockHost();
    const key = oldDuplicateState(mock);
    // an older snapshot where only the short name existed
    const st = readState("c1");
    st.snapshots["m1#0"] = JSON.parse(JSON.stringify(st.snapshots[key]));
    st.snapshots["m1#0"].turn = 0;
    delete st.snapshots["m1#0"].chars["Queen Seraphina"];
    st.snapshots["m1#0"].present = ["Seraphina"];
    st.snapshots["m1#0"].edges = [{ from: "Seraphina", to: "Queen Seraphina", role: "self", warmth: "x" }];
    writeState("c1", st);
    const out = people(mock, "c1", { op: "merge-character", from: "Seraphina", into: "Queen Seraphina" });
    expect(out.json.ok).toBe(true);
    expect(out.json.view.suggest).toEqual([]);
    expect(Object.keys(out.json.view.chars)).toEqual(["Queen Seraphina"]);
    const after = readState("c1");
    for (const sn of Object.values(after.snapshots as Record<string, any>)) {
      expect(Object.keys(sn.chars)).not.toContain("Seraphina");
      expect(sn.present).not.toContain("Seraphina");
    }
    // the stats of the target stay; the older snapshot only had the short name: renamed
    expect(Object.keys(after.snapshots["m1#0"].chars)).toEqual(["Queen Seraphina"]);
    expect(after.snapshots["m1#0"].edges).toEqual([]);
    const merged = after.snapshots[key].chars["Queen Seraphina"];
    expect(merged.stats.trust).not.toBe(11);
    // things of the short name join the target's, each keeping its registry id (the update gave them o1, o2)
    expect(merged.items).toEqual([
      { id: "o1", kind: "wear", text: "a red gown" },
      { id: "o2", kind: "hold", text: "a silver key" },
    ]);
    expect(merged.holding).toBe("a silver key");
    // notes without a duplicate, and a note told by the target stays its own
    expect(after.notebook["Queen Seraphina"].map((n: any) => n.text).sort()).toEqual(["The user keeps a secret", "The user owes her a debt"]);
    expect(after.notebook.Seraphina).toBeUndefined();
    expect(after.history.Seraphina).toBeUndefined();
    expect(after.history["Queen Seraphina"].some((h: any) => h.to === "stranger")).toBe(true);
    expect(after.personIds.Seraphina).toBeUndefined();
    // the registry joined them, and the short name is a spelling of the target
    const reg = readRegistry("c1");
    expect(reg.entities.filter((e: any) => e.merged)).toHaveLength(1);
    expect(reg.suggest).toEqual([]);
    // the sensor writing the short name later is the target
    chat("c1", [...more("Queen Seraphina", "queen"), C("m6", "Queen Seraphina", "Again.", "queen"), U("m7", "Go on.")], { characterId: "queen" });
    run(mock, "c1", { present: ["Seraphina"], chars: { Seraphina: { mood: "tender" } } });
    expect(Object.keys(lastSnap("c1").chars)).toEqual(["Queen Seraphina"]);
    expect(lastSnap("c1").chars["Queen Seraphina"].mood).toBe("tender");
  });

  it("merge refuses the user, unknown names, the same name and a pair marked different", () => {
    const mock = mockHost();
    oldDuplicateState(mock);
    const m = (from: string, into: string) => people(mock, "c1", { op: "merge-character", from, into });
    expect(m("user", "Seraphina").status).toBe(400);
    expect(m("You", "Seraphina").status).toBe(400);
    expect(m("Seraphina", "Seraphina").status).toBe(400);
    expect(m("Seraphina", "seraphina").status).toBe(400);
    expect(m("Nobody", "Seraphina").status).toBe(404);
    expect(m("", "Seraphina").status).toBe(400);
    expect(people(mock, "c1", { op: "apart-characters", a: "Seraphina", b: "Queen Seraphina" }).json.ok).toBe(true);
    const refused = m("Seraphina", "Queen Seraphina");
    expect(refused.status).toBe(409);
    expect(refused.json.error).toContain("different");
    // nothing changed
    expect(Object.keys(lastSnap("c1").chars).sort()).toEqual(["Queen Seraphina", "Seraphina"]);
  });

  it("apart removes the suggestion, and later reports keep the two apart", () => {
    const mock = mockHost();
    oldDuplicateState(mock);
    const out = people(mock, "c1", { op: "apart-characters", a: "Seraphina", b: "Queen Seraphina" });
    expect(out.json.ok).toBe(true);
    expect(out.json.view.suggest).toEqual([]);
    const reg = readRegistry("c1");
    expect(reg.apart).toHaveLength(1);
    expect(reg.suggest).toEqual([]);
    chat("c1", [...more("Queen Seraphina", "queen"), C("m6", "Queen Seraphina", "Again.", "queen"), U("m7", "Go on.")], { characterId: "queen" });
    run(mock, "c1", { present: ["Queen Seraphina", "Seraphina"], chars: { Seraphina: { mood: "other" } } });
    const snap = lastSnap("c1");
    expect(Object.keys(snap.chars).sort()).toEqual(["Queen Seraphina", "Seraphina"]);
    expect(snap.chars.Seraphina.mood).toBe("other");
    expect(view(mock, "c1").suggest).toEqual([]);
  });
});

describe("a registry made by the old card reader", () => {
  const description = [
    "### Queen of Elves Rhea Faeth", "Full name: Queen of Elves Rhea Faeth", "Occupation: Queen", "",
    "### Maid and Familiar of Rhea Ember Feath", "Full name: Maid and Familiar of Rhea Ember Feath", "",
    "### Royal Knight Isabella Falafel", "Full name: Royal Knight Isabella Falafel",
  ].join("\r\n");
  const ent = (id: string, name: string, src: string, extra: Record<string, unknown> = {}) => ({ id, kind: "person", name, aliases: [], src, ...extra });

  it("loses the card title, joins the souls to the sections, and re-points the Dashboard names", () => {
    card("queen", "Summoned to the Queen", { description });
    chat("c1", story("Summoned to the Queen", "queen"), { characterId: "queen" });
    const mock = mockHost();
    run(mock, "c1", { present: ["Rhea Faeth"], chars: { "Rhea Faeth": { mood: "calm" } } });
    // what the old reader left: the title as a person, the first section, and a second entity per soul
    fs.writeFileSync(
      path.join(root, "registry/c1.json"),
      JSON.stringify({
        v: 1,
        chatId: "c1",
        from: null,
        next: { p: 6, o: 1, l: 1 },
        entities: [
          ent("p1", "Summoned to the Queen", "card", { card: "queen" }),
          ent("p2", "Queen of Elves Rhea Faeth", "card", { card: "queen" }),
          ent("p3", "Rhea Faeth", "soul"),
          ent("p4", "Ember", "soul"),
          ent("p5", "Isabella Falafel", "soul"),
        ],
        apart: [],
        suggest: [],
      }),
    );
    const st = readState("c1");
    st.personIds = { "Rhea Faeth": "p3", "Summoned to the Queen": "p1", Ember: "p4", Gone: "p9" };
    writeState("c1", st);
    chat("c1", more("Summoned to the Queen", "queen"), { characterId: "queen" });
    run(mock, "c1", { present: ["Ember"] });

    const reg = readRegistry("c1");
    const live = reg.entities.filter((e: any) => !e.merged && e.id !== "user");
    // the title stays: the Dashboard still shows it, so something refers to it
    expect(live.map((e: any) => e.name)).toEqual(["Summoned to the Queen", "Queen of Elves Rhea Faeth", "Maid and Familiar of Rhea Ember Feath", "Royal Knight Isabella Falafel"]);
    const byName = (n: string) => reg.entities.find((e: any) => e.name === n);
    expect(byName("Rhea Faeth").merged).toBe("p2");
    expect(byName("Ember").merged).toBe(byName("Maid and Familiar of Rhea Ember Feath").id);
    expect(byName("Isabella Falafel").merged).toBe(byName("Royal Knight Isabella Falafel").id);
    const ids = readState("c1").personIds;
    expect(ids["Rhea Faeth"]).toBe("p2");
    expect(ids.Ember).toBe(byName("Maid and Familiar of Rhea Ember Feath").id);
    expect(ids["Summoned to the Queen"]).toBe("p1");
    expect(ids.Gone).toBeUndefined();
  });

  it("drops the title when the Dashboard never used it", () => {
    card("queen", "Summoned to the Queen", { description });
    chat("c1", story("Summoned to the Queen", "queen"), { characterId: "queen" });
    const mock = mockHost();
    run(mock, "c1", { present: ["Ember"] });
    fs.writeFileSync(
      path.join(root, "registry/c1.json"),
      JSON.stringify({ v: 1, chatId: "c1", from: null, next: { p: 3, o: 1, l: 1 }, entities: [ent("p1", "Summoned to the Queen", "card", { card: "queen" }), ent("p2", "Queen of Elves Rhea Faeth", "card", { card: "queen" })], apart: [], suggest: [] }),
    );
    const st = readState("c1");
    st.personIds = {};
    writeState("c1", st);
    chat("c1", more("Summoned to the Queen", "queen"), { characterId: "queen" });
    run(mock, "c1", { present: ["Rhea Faeth"] });
    const names = readRegistry("c1").entities.filter((e: any) => !e.merged && e.id !== "user").map((e: any) => e.name);
    expect(names).toEqual(["Queen of Elves Rhea Faeth", "Maid and Familiar of Rhea Ember Feath", "Royal Knight Isabella Falafel"]);
  });
});

describe("a chat that continues another", () => {
  it("keeps the same person ids, and the same names", () => {
    card("aria", "Aria");
    chat("c1", story("Aria", "aria"), { characterId: "aria" });
    const mock = mockHost();
    run(mock, "c1", { present: ["Aria", "Mark"], chars: { Mark: { mood: "gruff" } } });
    const first = readRegistry("c1");
    const idOf = (reg: any, name: string) => reg.entities.find((e: any) => e.name === name)?.id;

    chat("c2", [C("n1", "Aria", "A new morning.", "aria")], { characterId: "aria" });
    fs.writeFileSync(path.join(root, "litopys/links.json"), JSON.stringify({ v: 1, links: { c2: { from: "c1", at: 1 } } }));
    run(mock, "c2", { present: ["Aria", "Mark"], chars: { Mark: { mood: "gruff" } } });
    const second = readRegistry("c2");
    expect(second.from).toBe("c1");
    expect(idOf(second, "Aria")).toBe(idOf(first, "Aria"));
    expect(idOf(second, "Mark")).toBe(idOf(first, "Mark"));
    expect(second.entities.filter((e: any) => e.name === "Mark")).toHaveLength(1);
    expect(readState("c2").personIds).toEqual(readState("c1").personIds);
    expect(Object.keys(lastSnap("c2").chars).sort()).toEqual(["Aria", "Mark"]);
  });
});

describe("the name a section person is shown with (#240)", () => {
  it("a heading with a role in front shows the name at its end, whichever spelling the sensor writes", () => {
    const crlf = String.fromCharCode(13, 10);
    card("queen", "Summoned to the Queen", { description: ["### Queen of Elves Rhea Faeth", "A queen.", "", "### Royal Knight Isabella Falafel", "A knight."].join(crlf) });
    chat("c1", story("Summoned to the Queen", "queen"), { characterId: "queen" });
    const mock = mockHost();
    run(mock, "c1", { present: ["Queen of Elves Rhea Faeth", "Isabella"], chars: { "Queen of Elves Rhea Faeth": { mood: "cold" } } });
    expect(Object.keys(lastSnap("c1").chars).sort()).toEqual(["Isabella Falafel", "Rhea Faeth"]);
    expect(lastSnap("c1").chars["Rhea Faeth"].mood).toBe("cold");
  });
});
