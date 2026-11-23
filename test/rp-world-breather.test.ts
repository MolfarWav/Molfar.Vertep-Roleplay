// The pause after a big event (user, 2026-11-23): after a reply that carried a hard DM event or a major "life
// intervenes", the next N replies get no new one. Pure counting (pauseLeft), the hook (held events, held life rolls,
// swipes), the settings and the DM's input line.
import { describe, expect, it } from "bun:test";
import { breatherOf, dmInput, emptyState, handleRoute, llmRequest, pauseLeft } from "../plugins/world/plugin.js";

function memHost(files: Record<string, string> = {}) {
  const host = {
    fs: {
      read: (p: string) => {
        if (!(p in files)) throw new Error("ENOENT " + p);
        return files[p]!;
      },
      write: (p: string, s: string) => { files[p] = s; },
      remove: (p: string) => { delete files[p]; },
      list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
    },
    llm: { request: () => {}, results: {} },
  };
  return { host, files };
}

const msg = (i: number | string, role: string, text: string) => ({ id: "m" + i, role, name: role === "user" ? "Taras" : "Odarka", text, swipe: 0 });
const STORY = [
  msg(0, "char", "Odarka stirs the pot."),
  msg(1, "user", "Who lives up the pass?"),
  msg(2, "char", "Old Maksym keeps the toll."),
  msg(3, "user", "Then we go at night."),
  msg(4, "char", "The tower's lantern glows above the pines."),
];
const more = (from: number, pairs: number) => Array.from({ length: pairs }, (_, k) => [msg(from + 2 * k, "user", "We walk on."), msg(from + 2 * k + 1, "char", "The road climbs.")]).flat();

const files = (msgs: object[], state: Record<string, unknown>) => ({
  "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
  "chats/c1.jsonl": msgs.map((m) => JSON.stringify(m)).join("\n") + "\n",
  "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
  "settings.json": JSON.stringify({ model: "c/default" }),
  "world/state/c1.json": JSON.stringify({ ...emptyState("c1"), settings: { level: "director", everyN: 5, stagnation: 6, onTransition: true, insert: true }, ...state }),
});
const EVENT = { text: "A knock at the door.", hard: true, sent: 0, retried: false };
const req = (op = "send") => ({ key: "reply", request: { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "We go." }] }, turn: { op } });
const route = (h: any, method: string, p: string, body?: unknown, query: Record<string, string> = {}) => handleRoute({ method, path: p, query, body }, h) as any;
const state = (m: { files: Record<string, string> }) => JSON.parse(m.files["world/state/c1.json"]!);
const labels = (out: any) => (out ? out.promptSources.parts.map((p: any) => p.label) : []);

describe("pauseLeft: counting the replies since the big event", () => {
  it("the carrier and the next n replies are the pause; a swipe of the carrier, a gone mark and n = 0 are free", () => {
    const mark = { after: "m1#0" }; // the carrier is m2
    expect(pauseLeft(mark, STORY, 3, 4)).toBe(4); // the reply after m3: only the carrier so far
    expect(pauseLeft(mark, STORY, 4, 4)).toBe(3); // m4 is a reply too
    const long = [...STORY, ...more(5, 3)]; // replies m2, m4, m6, m8, m10 after m1
    expect(pauseLeft(mark, long, long.length - 1, 4)).toBe(0);
    expect(pauseLeft(mark, long, long.length - 3, 4)).toBe(1);
    expect(pauseLeft(mark, STORY, 1, 4)).toBe(0); // a swipe of m2 follows m1 itself
    expect(pauseLeft({ after: "m9#0" }, STORY, 4, 4)).toBe(0);
    expect(pauseLeft(mark, STORY, 3, 0)).toBe(0);
    expect(pauseLeft(null, STORY, 3, 4)).toBe(0);
  });

  it("the chat's own number over the profile's, -1 hands it back, the default is 4", () => {
    expect(breatherOf(null, { breather: -1 })).toBe(4);
    expect(breatherOf({ options: { breather: 2 } }, { breather: -1 })).toBe(2);
    expect(breatherOf({ options: { breather: 2 } }, { breather: 0 })).toBe(0);
    expect(breatherOf({ options: { breather: 2 } }, {})).toBe(2);
  });
});

describe("the hook holds a hard event during the pause", () => {
  it("a waiting hard event waits, then goes once the pause is over", () => {
    // the carrier was m4 (it followed m3); the next reply follows m4: 4 more replies to go
    const m = memHost(files(STORY, { event: EVENT, breath: { after: "m3#0" } }));
    expect(labels(llmRequest(req(), m.host))).not.toContain("World DM");
    expect(state(m).event.sent).toBe(0);
    // three more replies: still in the pause
    const m2 = memHost(files([...STORY, ...more(5, 3)], { event: EVENT, breath: { after: "m3#0" } }));
    expect(labels(llmRequest(req(), m2.host))).not.toContain("World DM");
    // four more: free
    const m3 = memHost(files([...STORY, ...more(5, 4)], { event: EVENT, breath: { after: "m3#0" } }));
    expect(labels(llmRequest(req(), m3.host))).toContain("World DM");
    expect(state(m3).event.sent).toBe(1);
  });

  it("sending a hard event marks the pause; soft news neither waits nor marks", () => {
    const m = memHost(files(STORY, { event: EVENT }));
    expect(labels(llmRequest(req(), m.host))).toContain("World DM");
    expect(state(m).breath).toEqual({ after: "m4#0" });
    const soft = memHost(files(STORY, { event: { ...EVENT, hard: false }, breath: { after: "m3#0" } }));
    expect(labels(llmRequest(req(), soft.host))).toContain("World DM");
    expect(state(soft).breath).toEqual({ after: "m3#0" });
  });

  it("a swipe of the carrier rewrites it: the event may come again, and the mark is set again", () => {
    const m = memHost(files(STORY, { event: EVENT, breath: { after: "m3#0" } }));
    // a swipe rewrites m4, which followed m3
    expect(labels(llmRequest(req("swipe"), m.host))).toContain("World DM");
    expect(state(m).breath).toEqual({ after: "m3#0" });
  });

  it("0 in the chat means no pause; the sheet's view shows the number and what is left", () => {
    const m = memHost(files(STORY, { event: EVENT, breath: { after: "m3#0" } }));
    const view = route(m.host, "PUT", "/world/settings", { chatId: "c1", breather: 0 }).json;
    expect(view.breather).toBe(0);
    expect(view.pause).toBe(0);
    expect(labels(llmRequest(req(), m.host))).toContain("World DM");
    const back = route(m.host, "PUT", "/world/settings", { chatId: "c1", breather: -1 }).json;
    expect(back.breather).toBe(4);
    expect(back.pause).toBe(4);
  });
});

describe("a major life roll waits out the pause", () => {
  it("logged as held, not sent; small ones still come", () => {
    let seenMajor = false;
    for (let i = 0; i < 80 && !seenMajor; i++) {
      const story = [...STORY, msg("x" + i, "user", "We wait."), msg("y" + i, "char", "Wind in the pines.")];
      const m = memHost({ ...files(story, { breath: { after: "m3#0" } }) });
      route(m.host, "PUT", "/world/profiles", { id: "director", options: { dice: "flavour", diceStat: "auto", diceChance: 1, diceLife: 100 } });
      const out = llmRequest(req(), m.host);
      const rolls = JSON.parse(m.files["world/dice/c1.json"]!).rolls;
      const life = rolls.find((r: any) => r.kind === "life");
      if (life.tier === "major") {
        seenMajor = true;
        expect(life).toMatchObject({ gated: true, inserted: false, held: "pause" });
        expect(labels(out)).not.toContain("Life");
      } else {
        expect(life.inserted).toBe(true);
        expect(labels(out)).toContain("Life");
      }
    }
    expect(seenMajor).toBe(true);
  });

  it("a major one outside the pause is sent and starts one", () => {
    let done = false;
    for (let i = 0; i < 80 && !done; i++) {
      const story = [...STORY, msg("x" + i, "user", "We wait."), msg("y" + i, "char", "Wind in the pines.")];
      const m = memHost(files(story, {}));
      route(m.host, "PUT", "/world/profiles", { id: "director", options: { dice: "flavour", diceStat: "auto", diceChance: 1, diceLife: 100 } });
      llmRequest(req(), m.host);
      const life = JSON.parse(m.files["world/dice/c1.json"]!).rolls.find((r: any) => r.kind === "life");
      if (life.tier !== "major") continue;
      done = true;
      expect(life.inserted).toBe(true);
      expect(state(m).breath).toEqual({ after: "my" + i + "#0" });
    }
    expect(done).toBe(true);
  });
});

describe("the DM is told about the pause", () => {
  it("one line while it lasts, none after", () => {
    const base = { cards: [], userName: "Taras", entities: [], msgs: STORY, level: "director", fronts: [], event: null };
    expect(dmInput({ ...base, pause: 2 } as any)).toContain("the next 2 replies are its pause");
    expect(dmInput({ ...base, pause: 0 } as any)).not.toContain("its pause");
  });
});
