/** The memory trace report (#184 P6): the plain-English text a tester or Claude reads. */
import { describe, expect, it } from "bun:test";
import { buildReport, factsOut, personLabel, type MemoryTrace } from "../src/lib/memory-trace";

const p = (name: string, id: string) => ({ name, id });
const trace = (over: Partial<MemoryTrace> = {}): MemoryTrace => ({
  replies: [],
  back: 0,
  worker: null,
  litopys: {
    at: 1_000_000,
    op: "send",
    speaker: p("Aria", "p1"),
    one: true,
    knowers: [p("Aria", "p1")],
    full: false,
    limit: 800,
    tokens: 790,
    n: { live: 70, hidden: 3, seen: 2, inF: 40, drop: 25, unseen: 1 },
    facts: [
      { id: "f1", state: "in", why: "rank", rank: 1, gone: false, text: "The harbour is closed.", type: "event", weight: "everyday", subject: null, by: "all" },
      { id: "f4", state: "in", why: "cause", gone: false, text: "The password is thistle.", type: "event", weight: "key", subject: null, by: [p("Aria", "p1"), p("Bram", "p2")] },
      { id: "f2", state: "out", why: "speaker", gone: false, text: "The brass key opens the vault.", type: "event", weight: "everyday", subject: null, by: [p("Jude", "user")] },
      { id: "f9", state: "out", why: "budget", rank: 41, gone: true, text: "", type: "event", weight: "everyday", subject: null, by: [] },
    ],
    chapters: [{ id: "c3", state: "out", why: "unseen", arc: false, gone: false, label: "The cellar", text: "Bram and Jude go down.", cast: [p("Bram", "p2"), p("Jude", "user")] }],
  },
  databank: { at: 1, gen: "send", off: false, hits: [{ file: "lore.txt", n: 2, score: 5.5, state: "in" }, { file: "map.txt", n: 1, score: 3, state: "room" }], scoped: [{ file: "secret.txt", scope: "character", target: "bram" }], scopedMore: 2 },
  leaks: [{ key: "m5#0", msgId: "m5", swipe: 0, who: "Aria", factId: "f2", text: "The brass key opens the vault.", quote: "Aria reaches for the brass key" }],
  keptOut: { user: 1, absent: 2 },
  unavailable: false,
  ...over,
});

describe("memory trace report", () => {
  it("names the speaker with the registry id and says which filter applied", () => {
    const r = buildReport("Tavern", trace(), 1_010_000);
    expect(r).toContain("Memory trace of the last reply: Tavern");
    expect(r).toContain("Reply: send by Aria (p1) (10 s before this report)");
    expect(r).toContain("Filter: only what Aria knows, plus what everyone knows");
    expect(r).toContain("Insert: 790 of 800 tokens, ranked: not everything fitted");
  });

  it("lists facts with the reason, the rank and who knows them, ids beside names", () => {
    const r = buildReport("", trace());
    expect(r).toContain("- f1 [in, ranked, rank 1] (known to: everyone) The harbour is closed.");
    expect(r).toContain("- f4 [in, pulled in as the cause of the fact before it] (known to: Aria (p1), Bram (p2)) The password is thistle.");
    expect(r).toContain("- f2 [out, not known to the speaker] (known to: Jude (user)) The brass key opens the vault.");
    expect(r).toContain("- f9 [out, no room, rank 41] (known to: ) (removed since)");
    expect(r).toContain("Kept out, not known to the speaker (3, newest 1 listed)");
    expect(r).toContain("Kept out, no room (25, best 1 listed)");
  });

  it("covers chapters, the Data Bank and the checks after the reply", () => {
    const r = buildReport("", trace());
    expect(r).toContain("the speaker did not witness it");
    expect(r).toContain("1 not witnessed by the speaker");
    expect(r).toContain("- lore.txt #2 score 5.5 in the prompt");
    expect(r).toContain("- map.txt #1 score 3 left out: over the Data Bank room");
    expect(r).toContain("- secret.txt kept out by its scope (character bram)");
    expect(r).toContain("- and 2 more files kept out by scope");
    expect(r).toContain("the sensor kept out 1 fact(s) about the user's character and 2 about people not in the scene");
    expect(r).toContain('possible leak: Aria may know "The brass key opens the vault." (fact f2)');
  });

  it("says plainly when there is nothing, or the plugin did not answer", () => {
    const none = buildReport("", trace({ litopys: null, databank: null, leaks: [], keptOut: null }));
    expect(none).toContain("Litopys inserted nothing for the last reply, or no reply has been traced yet.");
    expect(none).toContain("- no reply traced yet");
    expect(none).toContain("- nothing flagged");
    expect(buildReport("", trace({ litopys: null, unavailable: true }))).toContain("Litopys did not answer");
  });

  it("says which of the remembered replies it is, and lists what the worker left out with the reason", () => {
    const two = [{ at: 1_000_000, op: "send", speaker: p("Aria", "p1") }, { at: 990_000, op: "next", speaker: null }];
    const worker = { at: 1, chapter: "c4", got: 3, added: 1, skips: [{ why: "dup", text: "The river thawed.", id: "" }, { why: "gone", text: "Tam left.", id: "f77" }] };
    const r = buildReport("Tavern", trace({ replies: two, back: 1, worker }), 1_010_000);
    expect(r).toContain("Reply 2 of 2 remembered (1 = the newest)");
    expect(r).toContain("The worker left out 2 fact op(s) of its last scene (chapter c4), 1 of 3 were kept:");
    expect(r).toContain("- [a near copy of a fact it already had] The river thawed.");
    expect(r).toContain("- f77 [the fact it names is gone or not active] Tam left.");
    expect(buildReport("", trace())).not.toContain("remembered (1 = the newest)");
    expect(buildReport("", trace())).not.toContain("The worker left out");
  });

  it("lists the facts the sensor could not keep, one line each with the reason", () => {
    const rows = [
      { why: "user", who: "user", text: "The market is loud" },
      { why: "absent", who: "Nobody", text: "The user is a stranger" },
      { why: "noQuote", who: "", text: "betrayal" },
    ];
    const r = buildReport("", trace({ keptOut: { user: 1, absent: 1, noQuote: 1, rows } }));
    expect(r).toContain("1 significant event(s) with no quote counted as routine");
    expect(r).toContain("  - [about the user's character] user: The market is loud");
    expect(r).toContain("  - [not in the scene] Nobody: The user is a stranger");
    expect(r).toContain("  - [significant, but no quote: counted as routine] betrayal");
  });

  it("a narrator reply says the filter is anyone present; helpers pick rows by reason", () => {
    const t = trace();
    t.litopys!.one = false;
    t.litopys!.speaker = null;
    t.litopys!.knowers = [p("Aria", "p1"), p("Bram", "p2")];
    expect(buildReport("", t)).toContain("Filter: what anyone present knows (Aria (p1), Bram (p2))");
    expect(factsOut(t.litopys!, "speaker").map((f) => f.id)).toEqual(["f2"]);
    expect(personLabel(p("Ghost", ""))).toBe("Ghost");
  });

  it("lists the word-for-word passages of earlier chats, and leaves the section out when there are none (#184)", () => {
    const none = buildReport("", trace());
    expect(none).not.toContain("word for word");
    const t = trace();
    t.litopys!.verbatim = [
      { chat: "c1", title: "The harbour", words: 3, text: "…she wore a turquoise cloak\nwith a silver clasp…" },
      { chat: "c2", title: "", words: 1, text: "A heron." },
    ];
    const r = buildReport("", t);
    expect(r).toContain("Earlier, word for word (2):");
    expect(r).toContain('- "The harbour" shares 3 rare words: …she wore a turquoise cloak with a silver clasp…');
    expect(r).toContain('- "c2" shares 1 rare word: A heron.');
    t.litopys!.verbatim = [];
    expect(buildReport("", t)).not.toContain("word for word");
  });
});
