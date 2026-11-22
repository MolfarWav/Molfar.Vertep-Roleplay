/**
 * World DM cast (#424, step 2.5): a mention is not the stage. With the Dashboard, a name in the text is only a mention; the person is
 * on stage when the Dashboard puts them in the scene (a far person who texts or calls is in it too). Two silences, the judge says
 * "came" or "mentioned", and a medium or big return that ended as a mention brings the next one sooner and at least medium.
 */
import { describe, expect, it } from "bun:test";
import { benchDue, castGap, castIdentity, emptyState, judgeEntrance, llmRequest, normalizeState, planEntrance, rollEntrance, silenceOf, silencesOf } from "../plugins/world/plugin.js";

const msg = (i: number, role: string, text: string) => ({ id: "m" + i, role, name: role === "user" ? "Taras" : "Odarka", text, swipe: 0 });
const jsonl = (msgs: object[]) => msgs.map((m) => JSON.stringify(m)).join("\n") + "\n";
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, k) => msg(from + k, (from + k) % 2 === 0 ? "user" : "char", "The road goes on, nothing new."));
const KEY = (i: number) => "m" + i + "#0";
const N = 100;
const OLYA = { id: "n1", kind: "person", name: "Olya", aliases: ["Olya K"], text: "Taras's best friend from school.", status: "active", uid: 0, at: 1, weight: 1, relation: "ally" };
const REG = () => ({
  v: 1, chatId: "c1", from: null, next: { p: 3, o: 1, l: 1 }, apart: [], suggest: [],
  entities: [
    { id: "user", kind: "person", name: "Taras", aliases: [], src: "persona" },
    { id: "p1", kind: "person", name: "Odarka", aliases: [], src: "card" },
    { id: "p2", kind: "person", name: "Olya", aliases: [], src: "world" },
  ],
});
const ident = (st: any) => castIdentity(st, REG(), st.entities[0]);
const st = (over: object = {}) => ({ ...emptyState("c1"), entities: [OLYA], regIds: { n1: "p2" }, ...over }) as any;
/** a Dashboard snapshot that has nobody in the scene */
const empty = { present: [], clock: {}, scene: {} };
const snapsFor = (from: number, to: number, present: string[] = []) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, k) => [KEY(from + k), { ...empty, present }]));

describe("two silences", () => {
  it("without a Dashboard the name in the text is the stage: both silences are the same", () => {
    const msgs = [...filler(4), msg(4, "user", "Say hi to Olya."), ...filler(7, 5)];
    expect(silencesOf(ident(st()), OLYA, msgs as any, {}, REG(), {})).toEqual({ stage: 4, mentioned: 4 });
    expect(silenceOf(ident(st()), OLYA, msgs as any, {}, REG(), {})).toBe(4);
  });

  it("with a Dashboard a name in the text is a mention: the silence on stage keeps growing, the mention is short", () => {
    // m80 names her, every message has a snapshot with nobody in the scene
    const msgs = [...filler(80), msg(80, "user", "Olya wrote: hi."), ...filler(19, 81)];
    const snaps = snapsFor(0, 99);
    const s = silencesOf(ident(st()), OLYA, msgs as any, snaps, REG(), {});
    expect(s.mentioned).toBe(10);
    expect(s.stage).toBeGreaterThan(40);
    expect(s.mentioned).toBeLessThan(s.stage);
  });

  it("a message with no snapshot still counts by the name (the Dashboard was off or late)", () => {
    const msgs = [...filler(80), msg(80, "user", "Olya wrote: hi."), ...filler(19, 81)];
    // snapshots for the newer part only
    const snaps = snapsFor(81, 99);
    expect(silencesOf(ident(st()), OLYA, msgs as any, snaps, REG(), {}).stage).toBe(10);
  });

  it("being on stage resets both; a far person in `present` (a call or a text) is on stage", () => {
    const msgs = filler(60);
    const snaps = { ...snapsFor(0, 59), [KEY(50)]: { ...empty, present: ["Olya"], chars: { Olya: { contact: "text" } } } };
    const s = silencesOf(ident(st()), OLYA, msgs as any, snaps, REG(), { Olya: "p2" });
    // m51..m59 hold five replies (m51, m53, m55, m57, m59)
    expect(s).toEqual({ stage: 5, mentioned: 5 });
  });

  it("a mention due long ago does not hold her back: she is due on the stage silence", () => {
    const msgs = [...filler(80), msg(80, "user", "Olya wrote: hi."), ...filler(19, 81)];
    const base = { state: st(), msgs: msgs as any, snaps: snapsFor(0, 99), reg: REG(), personIds: {}, freq: "normal" };
    const due = benchDue(base);
    expect(due.map((x: any) => x.rec.id)).toEqual(["n1"]);
    expect(due[0].seen).toBe(10);
    expect(due[0].silence).toBeGreaterThan(40);
    // without a Dashboard the same chat has her at 10: not due
    expect(benchDue({ ...base, snaps: {} })).toEqual([]);
  });
});

describe("the judge: came or mentioned", () => {
  const s0 = (band = "medium"): any => st({ entrance: { id: "n1", name: "Olya", band, silence: 40, via: "silence", sent: 1, retried: false, after: KEY(1) } });
  const carrier = (text: string) => [msg(0, "user", "a"), msg(1, "user", "b"), msg(2, "char", text)] as any;

  it("on stage in the carrier reply: came", () => {
    const s = s0();
    const out = judgeEntrance(s, carrier("The door opens."), { [KEY(2)]: { ...empty, present: ["Olya"] } }, REG(), { Olya: "p2" });
    expect(out).toMatchObject({ ok: true, res: "came", again: false });
    expect(s.lastEntrance).toMatchObject({ id: "n1", ok: true, res: "came" });
  });

  it("only named in it, the Dashboard says she is not there: mentioned, no second try", () => {
    const s = s0();
    const out = judgeEntrance(s, carrier("Odarka says Olya sent a line."), { [KEY(2)]: empty }, REG(), {});
    expect(out).toMatchObject({ ok: false, res: "mentioned", again: false });
    expect(s.entrance).toBeUndefined();
    expect(s.lastEntrance).toMatchObject({ id: "n1", band: "medium", ok: false, res: "mentioned" });
  });

  it("without a snapshot the name still counts as came (as before)", () => {
    const s = s0();
    expect(judgeEntrance(s, carrier("Odarka says Olya sent a line."), {}, REG(), {})).toMatchObject({ res: "came" });
  });

  it("neither on stage nor named: a stricter second try, then missed", () => {
    const s = s0();
    const out = judgeEntrance(s, carrier("The road goes on."), { [KEY(2)]: empty }, REG(), {});
    expect(out).toMatchObject({ ok: false, res: "missed", again: true });
    expect(s.entrance).toMatchObject({ retried: true, sent: 0 });
  });

  it("an older lastEntrance with ok only is read as came or missed", () => {
    expect(normalizeState({ lastEntrance: { id: "n1", n: 3, band: "small", ok: true } }, "c1").lastEntrance).toMatchObject({ res: "came", ok: true });
    expect(normalizeState({ lastEntrance: { id: "n1", n: 3, band: "small", ok: false } }, "c1").lastEntrance).toMatchObject({ res: "missed", ok: false });
    expect(normalizeState({ lastEntrance: { id: "n1", n: 3, band: "big", ok: false, res: "mentioned" } }, "c1").lastEntrance).toMatchObject({ res: "mentioned", ok: false });
  });
});

describe("after a medium or big return that was only a mention", () => {
  const last = (band: string, res: string, n = 40) => ({ id: "n1", n, band, ok: res === "came", res });
  const base = (lastEntrance: object | undefined, replies = 50) => ({ state: st({ lastEntrance }), msgs: filler(replies * 2) as any, snaps: {}, reg: REG(), personIds: {}, freq: "normal" });

  it("the gap is half, rounded up: 5 instead of 10 on Normal", () => {
    expect(castGap("normal", last("medium", "mentioned"))).toBe(5);
    expect(castGap("often", last("big", "mentioned"))).toBe(3);
    expect(castGap("normal", last("small", "mentioned"))).toBe(10);
    expect(castGap("normal", last("medium", "came"))).toBe(10);
    expect(castGap("normal", undefined)).toBe(10);
  });

  it("she is due again after the short gap, and not before", () => {
    // 50 replies now; the last return was at reply 46 (4 ago) or 44 (6 ago)
    expect(benchDue(base(last("medium", "mentioned", 46)))).toEqual([]);
    expect(benchDue(base(last("medium", "mentioned", 44))).length).toBe(1);
    // a came return of the same age still waits for the full gap
    expect(benchDue(base(last("medium", "came", 44)))).toEqual([]);
  });

  it("the next band is at least medium, and the log says why; a die that rolls medium or big is left alone", () => {
    const b = base(last("big", "mentioned", 1));
    let sawSmall = false;
    let sawKept = false;
    for (let i = 0; i < 200 && !(sawSmall && sawKept); i++) {
      const seed = "seed" + i;
      const plan = planEntrance({ ...b, seed })!;
      const die = rollEntrance(seed, plan.silence, plan.threshold, plan.weight);
      expect(plan.band === "small").toBe(false);
      if (die.band === "small") {
        sawSmall = true;
        expect(plan).toMatchObject({ band: "medium", floor: true, roll: die.total });
      } else {
        sawKept = true;
        expect(plan.band).toBe(die.band);
        expect(plan.floor).toBeUndefined();
      }
    }
    expect(sawSmall && sawKept).toBe(true);
  });

  it("after a small mention, or a return that came, the die is not raised", () => {
    for (const l of [last("small", "mentioned", 1), last("medium", "came", 1)]) {
      for (let i = 0; i < 60; i++) {
        const plan = planEntrance({ ...base(l), seed: "x" + i })!;
        expect(plan.floor).toBeUndefined();
      }
    }
  });
});

describe("the hook: a mention instead of a visit", () => {
  function memHost(files: Record<string, string>) {
    return {
      host: {
        fs: {
          read: (p: string) => { if (!(p in files)) throw new Error("ENOENT " + p); return files[p]!; },
          write: (p: string, v: string) => { files[p] = v; },
          remove: (p: string) => { delete files[p]; },
          list: (dir: string) => Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)),
        },
        llm: { request: () => {}, results: {} },
      },
      files,
    };
  }
  const setup = () => memHost({
    "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat" }),
    "chats/c1.jsonl": jsonl(filler(N)),
    "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
    "settings.json": JSON.stringify({ model: "c/default" }),
    "registry/c1.json": JSON.stringify(REG()),
    "world/state/c1.json": JSON.stringify(st({ settings: { level: "chronicler", everyN: 5, stagnation: 6, onTransition: true, onPlace: true, insert: true, cast: "normal", castBoundary: false } })),
  });
  const req = () => ({ key: "reply", request: { sessionId: "c1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "We go on." }] }, turn: { op: "send" } });
  const rolls = (m: any) => JSON.parse(m.files["world/dice/c1.json"]!).rolls;

  it("the note goes in; the carrier reply only names her and the Dashboard has nobody there: the log says mentioned", () => {
    const m = setup();
    // a medium entrance is not guaranteed by the dice: force the band the judge reads (the result does not depend on it for the log)
    const out = llmRequest(req(), m.host) as any;
    expect(out.messages.at(-1).content).toContain("[CAST: Olya");
    m.files["chats/c1.jsonl"] += JSON.stringify(msg(N, "char", "Odarka says Olya sent a line.")) + "\n" + JSON.stringify(msg(N + 1, "user", "Good.")) + "\n";
    m.files["dashboard/state/c1.json"] = JSON.stringify({ snapshots: { [KEY(N)]: empty } });
    expect(llmRequest(req(), m.host)).toBe(null);
    const s = JSON.parse(m.files["world/state/c1.json"]!);
    expect(s.entrance).toBeUndefined();
    expect(s.lastEntrance).toMatchObject({ id: "n1", res: "mentioned", ok: false });
    expect(rolls(m).filter((r: any) => r.kind === "cast")).toHaveLength(1);
    expect(rolls(m).at(-1)).toMatchObject({ kind: "cast", id: "n1", result: "mentioned" });
  });

  it("on stage in the Dashboard's scene of the carrier: the log says came", () => {
    const m = setup();
    llmRequest(req(), m.host);
    m.files["chats/c1.jsonl"] += JSON.stringify(msg(N, "char", "The door opens.")) + "\n" + JSON.stringify(msg(N + 1, "user", "Good.")) + "\n";
    m.files["dashboard/state/c1.json"] = JSON.stringify({ personIds: { Olya: "p2" }, snapshots: { [KEY(N)]: { ...empty, present: ["Olya"] } } });
    expect(llmRequest(req(), m.host)).toBe(null);
    expect(rolls(m).at(-1)).toMatchObject({ kind: "cast", result: "came" });
    expect(JSON.parse(m.files["world/state/c1.json"]!).lastEntrance).toMatchObject({ res: "came", ok: true });
  });

  it("the log line carries how long ago she was last named, only when it differs from the silence on stage", () => {
    const m = setup();
    m.files["chats/c1.jsonl"] = jsonl([...filler(80), msg(80, "user", "Olya wrote: hi."), ...filler(19, 81)]);
    m.files["dashboard/state/c1.json"] = JSON.stringify({ snapshots: snapsFor(0, 99) });
    llmRequest(req(), m.host);
    const line = rolls(m).at(-1);
    expect(line).toMatchObject({ kind: "cast", id: "n1", seen: 10 });
    expect(line.silence).toBeGreaterThan(40);
    // no Dashboard: the two are the same, nothing extra
    const plain = setup();
    llmRequest(req(), plain.host);
    expect(rolls(plain).at(-1).seen).toBeUndefined();
  });

  // #496: a due person waits for the scene to change, up to six replies, then comes anyway
  const withBoundary = (snap: object | null) => {
    const m = setup();
    const w = JSON.parse(m.files["world/state/c1.json"]!);
    w.settings.castBoundary = true;
    m.files["world/state/c1.json"] = JSON.stringify(w);
    if (snap) m.files["dashboard/state/c1.json"] = JSON.stringify({ snapshots: { [KEY(N - 1)]: snap } });
    return m;
  };
  it("a due person is held while the Dashboard says the scene has not changed", () => {
    const m = withBoundary(empty);
    expect(llmRequest(req(), m.host)).toBe(null);
    const s = JSON.parse(m.files["world/state/c1.json"]!);
    expect(s.entrance).toBeUndefined();
    expect(s.castWait).toEqual({ n: 50 });
  });
  it("the same person comes when the newest reply starts a new scene, and the wait is cleared", () => {
    const m = withBoundary({ ...empty, scene: { new: true } });
    const out = llmRequest(req(), m.host) as any;
    expect(out.messages.at(-1).content).toContain("[CAST: Olya");
    expect(JSON.parse(m.files["world/state/c1.json"]!).castWait).toBeUndefined();
  });
  it("with no Dashboard and no director nobody waits; and after six replies of waiting the person comes anyway", () => {
    expect((llmRequest(req(), withBoundary(null).host) as any).messages.at(-1).content).toContain("[CAST: Olya");
    const m = withBoundary(empty);
    const w = JSON.parse(m.files["world/state/c1.json"]!);
    w.castWait = { n: 50 - 6 };
    m.files["world/state/c1.json"] = JSON.stringify(w);
    expect((llmRequest(req(), m.host) as any).messages.at(-1).content).toContain("[CAST: Olya");
  });
});
