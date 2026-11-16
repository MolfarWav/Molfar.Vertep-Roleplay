/**
 * #424, step 4, point 6 of the review: a reason to come back with no extra call. The DM's ordinary run is told who may come back soon and
 * may say why in `returns`; code keeps it as a hook on the record, the next return uses it in place of the record's first sentence, once.
 */
import { describe, expect, it } from "bun:test";
import { applyReturns, benchSoon, benchSoonList, dmInput, emptyState, entranceInsert, handleRoute, judgeEntrance, normalizeState, parseReply, returnsInput } from "../plugins/world/plugin.js";

const person = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, kind: "person", name, aliases: [] as string[], text: name + " is a friend of Taras. She writes often.", status: "active", uid: 0, at: 1, ...over });
const msg = (i: number, role: string, text = "The road goes on.") => ({ id: "m" + i, role, name: role === "user" ? "Taras" : "Odarka", text, swipe: 0 });
const filler = (n: number) => Array.from({ length: n }, (_, i) => msg(i, i % 2 === 0 ? "user" : "char"));

describe("what the DM is told", () => {
  it("lists who may come back soon with the silence, and how to say why; nobody listed, no line", () => {
    const text = returnsInput([{ id: "n1", name: "Olya", silence: 27 }, { id: "n4", name: "Maksym", silence: 31 }]);
    expect(text).toContain("May come back soon: n1 Olya (silent 27), n4 Maksym (silent 31).");
    expect(text).toContain('"returns": [{"id": "n3", "why": "..."}]');
    expect(text).toContain("at most 200 characters");
    const withIt = dmInput({ cards: [], userName: "Taras", entities: [person("n1", "Olya")] as never, msgs: filler(4) as never, soon: [{ id: "n1", name: "Olya", silence: 27 }] } as never);
    expect(withIt).toContain("May come back soon: n1 Olya (silent 27)");
    expect(dmInput({ cards: [], userName: "Taras", entities: [person("n1", "Olya")] as never, msgs: filler(4) as never } as never)).not.toContain("May come back soon");
  });

  it("the list has names and silences, and its ids are what benchSoon gives", () => {
    const state = { ...emptyState("c1"), entities: [person("n1", "Olya"), person("n2", "Maksym", { noReturn: true })] } as never;
    const args = { state, msgs: filler(60) as never, snaps: {}, reg: null, personIds: {}, freq: "normal", within: 100 };
    expect(benchSoonList(args as never)).toEqual([{ id: "n1", name: "Olya", silence: 30 }]);
    expect(benchSoon(args as never)).toEqual(["n1"]);
  });
});

describe("what is kept", () => {
  it("sets a hook only for the people it was told about, cut to 200 characters, in one line", () => {
    const state = { ...emptyState("c1"), entities: [person("n1", "Olya"), person("n2", "Maksym"), person("n3", "Ivan", { noReturn: true }), { ...person("n4", "Tower"), kind: "place" }] } as never as any;
    const n = applyReturns(state, [
      { id: "n1", why: "She spent  the winter\nin Lviv and wants Taras back." + "x".repeat(300) },
      { id: "n2", why: "not offered" },
      { id: "n3", why: "switched off" },
      { id: "n4", why: "a place" },
      { id: "n1", why: "" },
      "junk",
      { why: "no id" },
    ], new Set(["n1", "n3", "n4"]), 77);
    expect(n).toBe(1);
    expect(state.entities[0].hook.at).toBe(77);
    expect(state.entities[0].hook.text.length).toBe(200);
    expect(state.entities[0].hook.text.startsWith("She spent the winter in Lviv")).toBe(true);
    expect(state.entities[1].hook).toBeUndefined();
    expect(state.entities[2].hook).toBeUndefined();
    expect(state.entities[3].hook).toBeUndefined();
    expect(applyReturns(state, "x", new Set(["n1"]), 1)).toBe(0);
  });

  it("a person keeps a hook through the state file; a place or an empty one does not", () => {
    const s = normalizeState({ entities: [person("n1", "Olya", { hook: { text: "Wants him back.", at: 5 } }), { ...person("n2", "Tower"), kind: "place", hook: { text: "x", at: 1 } }, person("n3", "Ivan", { hook: { text: "  " } })] }, "c1") as any;
    expect(s.entities[0].hook).toEqual({ text: "Wants him back.", at: 5 });
    expect(s.entities[1].hook).toBeUndefined();
    expect(s.entities[2].hook).toBeUndefined();
  });

  it("the reply's returns survive reading the DM's answer", () => {
    expect(parseReply('{"returns":[{"id":"n1","why":"x"}]}')).toEqual({ returns: [{ id: "n1", why: "x" }] });
  });
});

describe("the note and its use", () => {
  const en = { id: "n1", name: "Olya", band: "medium", silence: 40, via: "silence", sent: 0, retried: false } as never;
  it("the hook stands in place of the first sentence; without one the note is as before", () => {
    const rec = person("n1", "Olya", { hook: { text: "She spent the winter in Lviv and wants Taras back.", at: 1 } });
    const hooked = entranceInsert(en, rec as never);
    expect(hooked).toContain("[CAST: Olya (She spent the winter in Lviv and wants Taras back.) has not been around for 40 replies.");
    expect(hooked).not.toContain("Olya is a friend of Taras.");
    expect(entranceInsert(en, person("n1", "Olya") as never)).toContain("[CAST: Olya (Olya is a friend of Taras.) has not been around");
  });

  it("is used once: after the return is judged the hook is gone, but a second try keeps it", () => {
    const rec = person("n1", "Olya", { hook: { text: "Wants him back.", at: 1 } });
    const state = normalizeState({ entities: [rec], nextId: 2, entrance: { id: "n1", name: "Olya", band: "small", silence: 40, via: "silence", sent: 1, after: "m5#0" } }, "c1") as any;
    // the reply after m5 does not name her: asked again, the hook stays
    const missed = [...filler(6), msg(6, "user"), msg(7, "char", "Nothing happens.")];
    expect(judgeEntrance(state, missed as never, {}, null, {})!.again).toBe(true);
    expect(state.entities[0].hook).toBeDefined();
    // and when she comes, it is spent
    state.entrance = { ...state.entrance, sent: 1, after: "m5#0" };
    const came = [...filler(6), msg(6, "user"), msg(7, "char", "Olya came in.")];
    judgeEntrance(state, came as never, {}, null, {});
    expect(state.entities[0].hook).toBeUndefined();
  });
});

describe("the DM run, the whole way", () => {
  it("is told who may come back soon, and the reason it gives lands on the record", () => {
    const sent: any[] = [];
    const results: Record<string, any> = {};
    const files: Record<string, string> = {
      "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
      "chats/c1.jsonl": filler(60).map((m) => JSON.stringify(m)).join("\n") + "\n",
      "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
      "settings.json": JSON.stringify({ model: "c/default" }),
      "world/state/c1.json": JSON.stringify({ ...emptyState("c1"), entities: [person("n1", "Olya")], nextId: 2, settings: { level: "chronicler", everyN: 50, stagnation: 6, onTransition: true, onPlace: true, insert: true, cast: "normal" } }),
    };
    const host = {
      fs: {
        read: (p: string) => { if (!(p in files)) throw new Error("ENOENT " + p); return files[p]!; },
        write: (p: string, s: string) => { files[p] = s; },
        remove: (p: string) => { delete files[p]; },
        list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
      },
      llm: { request: (_k: string, o: any) => { sent.push(o); }, results },
    };
    const run = () => handleRoute({ method: "POST", path: "/world/update", query: {}, body: { chatId: "c1" } }, host) as any;
    expect(run().__llmPending).toBe(true);
    expect(sent[0].messages[0].content).toContain("May come back soon: n1 Olya (silent 30)");
    results.world = { text: JSON.stringify({ add: [], summary: "x", returns: [{ id: "n1", why: "Olya wrote that the winter was long and she wants to see him." }, { id: "n9", why: "nobody" }] }), model: "c/default", genTimeMs: 5 };
    run();
    const s = JSON.parse(files["world/state/c1.json"]!);
    expect(s.entities[0].hook.text).toBe("Olya wrote that the winter was long and she wants to see him.");
    // the record list the app reads carries it
    const peek = (handleRoute({ method: "GET", path: "/world/peek", query: { chatId: "c1" } }, host) as any).json;
    expect(peek.records[0].hook.text).toContain("the winter was long");
  });
});
