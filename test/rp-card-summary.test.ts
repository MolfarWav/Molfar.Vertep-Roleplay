/**
 * #113: a story summary for the card's memory. The import dialog asks the model to summarise a whole chat
 * (a job on the chat's record, one request per tick, after the chapters); the user reads and edits the text,
 * and the import writes the text the dialog settled on.
 */
import { describe, expect, it } from "bun:test";
import { L, line, mockHost, readJson, story, tick, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any) => L.handleRoute({ method, path, query: {}, body }, host);

/** A 30-message chat with one fresh chapter of Aria's card. */
function seed(chatId = "winter", extra: Record<string, unknown> = {}) {
  writeJson("litopys/config.json", { arcMode: "off" });
  writeJson("characters/aria/card.json", { spec: "chara_card_v2", name: "Aria", description: "A quiet courier.", extensions: {} });
  const msgs = story(30);
  writeChat(chatId, msgs, { title: "Winter watch", characterId: "aria" });
  writeJson(`litopys/chats/${chatId}.json`, {
    ...L.emptyChat(chatId),
    migrated: true,
    chapters: [
      { id: "c1", from: "m1", to: "m30", count: 30, sig: L.chapterSig(line(msgs)), label: "The gate", text: "Aria guarded the northern gate through the winter and lost her brother there.", kind: "scene", at: 1 },
    ],
    ...extra,
  });
}

const SUMMARY = "Aria held the northern gate through a hard winter. She lost her brother there and swore never to leave the post again.";

describe("story summary: parsing and request", () => {
  it("takes plain prose, a fenced text and a JSON wrapper; rejects scraps", () => {
    expect(L.parseSummaryReply(SUMMARY)).toBe(SUMMARY);
    expect(L.parseSummaryReply("```\n" + SUMMARY + "\n```")).toBe(SUMMARY);
    expect(L.parseSummaryReply(JSON.stringify({ summary: SUMMARY }))).toBe(SUMMARY);
    expect(L.parseSummaryReply(JSON.stringify({ arc: { label: "x", text: SUMMARY } }))).toBe(SUMMARY);
    expect(L.parseSummaryReply('"' + SUMMARY + '"')).toBe(SUMMARY);
    expect(L.parseSummaryReply("OK")).toBeNull();
    expect(L.parseSummaryReply("")).toBeNull();
    expect(L.parseSummaryReply("{ not json")).toBeNull();
  });

  it("puts a fresh arc in place of its chapters, in story order", () => {
    const chapter = (id: string, text: string) => ({ id, label: id, text, sig: "s", kind: "scene" });
    const chapters = [chapter("c1", "One."), chapter("c2", "Two."), chapter("c3", "Three.")];
    const arc = { id: "a1", chapterIds: ["c1", "c2"], label: "Start", text: "One and two.", at: 1 };
    arc.sig = L.arcSig(chapters.slice(0, 2));
    const parts = L.summaryRecord({ chapters, arcs: [arc] });
    expect(parts).toEqual([{ label: "Start", text: "One and two." }, { label: "c3", text: "Three." }]);
  });

  it("builds a request that carries the record, the size and the user's own prompt", () => {
    const parts = [{ label: "The gate", text: "Aria guarded the gate." }];
    const req = L.buildSummaryRequest(parts, { model: "m/x", summary: "Custom summary prompt." }, {});
    expect(req.model).toBe("m/x");
    expect(req.systemPrompt.startsWith("Custom summary prompt.")).toBe(true);
    expect(req.systemPrompt).toContain("at most " + L.SUMMARY_WORDS + " words");
    expect(req.messages[0].content).toContain("Part 1: The gate");
    expect(req.reasoning).toBeUndefined();
    const dflt = L.buildSummaryRequest(parts, {}, { model: "chat/model" });
    expect(dflt.systemPrompt.startsWith(L.DEFAULT_PROMPTS.summary)).toBe(true);
    expect(dflt.model).toBe("chat/model");
  });

  it("cuts a long record evenly instead of dropping its end", () => {
    const parts = Array.from({ length: 40 }, (_, i) => ({ label: "p" + i, text: "x".repeat(1500) + " END" + i }));
    const req = L.buildSummaryRequest(parts, {}, {});
    expect(req.messages[0].content.length).toBeLessThan(20000);
    expect(req.messages[0].content).toContain("Part 40: p39");
  });
});

describe("story summary: the job", () => {
  it("asks, sends one request, and keeps the answer on the record", () => {
    seed();
    const m = mockHost();
    const r = route(m.host, "POST", "/litopys/story-summary", { chatId: "winter", op: "start" });
    expect(r.status).toBe(200);
    expect(r.json.summary.state).toBe("working");
    const t = tick(m, [SUMMARY]);
    expect(t.requests.map((x) => x.key)).toEqual([expect.stringMatching(/^lit_sum_winter_/)]);
    expect(t.requests[0].req.messages[0].content).toContain("northern gate");
    const st = readJson("litopys/chats/winter.json");
    expect(st.storySummary).toMatchObject({ state: "done", text: SUMMARY });
    expect(st.activity.map((a: any) => a.kind)).toEqual(expect.arrayContaining(["summary.ask", "summary.done"]));
  });

  it("shows up in the import preview, and says when the record has moved on", () => {
    seed();
    const m = mockHost();
    route(m.host, "POST", "/litopys/story-summary", { chatId: "winter", op: "start" });
    tick(m, [SUMMARY]);
    const p = route(m.host, "POST", "/litopys/card-memory/preview", { cardId: "aria", chatId: "winter" }).json;
    expect(p.summary).toMatchObject({ can: true, state: "done", text: SUMMARY, stale: false });
    expect(p.summary.tokens).toBeGreaterThan(10);
    // a chapter edited after the summary was written
    const st = readJson("litopys/chats/winter.json");
    st.chapters[0].text = "Aria left the gate in the spring.";
    writeJson("litopys/chats/winter.json", st);
    const again = route(m.host, "POST", "/litopys/card-memory/preview", { cardId: "aria", chatId: "winter" }).json;
    expect(again.summary.stale).toBe(true);
    expect(again.summary.text).toBe(SUMMARY);
  });

  it("records a failed answer with its reason and lets the user ask again", () => {
    seed();
    const m = mockHost();
    route(m.host, "POST", "/litopys/story-summary", { chatId: "winter", op: "start" });
    tick(m, [{ error: "rate limited" }]);
    expect(readJson("litopys/chats/winter.json").storySummary).toMatchObject({ state: "failed", error: "rate limited" });
    const view = route(m.host, "POST", "/litopys/card-memory/preview", { cardId: "aria", chatId: "winter" }).json.summary;
    expect(view).toMatchObject({ state: "failed", error: "rate limited" });
    expect(route(m.host, "POST", "/litopys/story-summary", { chatId: "winter", op: "start" }).status).toBe(200);
    tick(m, [SUMMARY]);
    expect(readJson("litopys/chats/winter.json").storySummary.state).toBe("done");
  });

  it("fails on a reply with no summary in it", () => {
    seed();
    const m = mockHost();
    route(m.host, "POST", "/litopys/story-summary", { chatId: "winter", op: "start" });
    tick(m, ["ok"]);
    expect(readJson("litopys/chats/winter.json").storySummary.state).toBe("failed");
  });

  it("cancel drops a running job and an answer that arrives late changes nothing", () => {
    seed();
    const m = mockHost();
    route(m.host, "POST", "/litopys/story-summary", { chatId: "winter", op: "start" });
    const res = route(m.host, "POST", "/litopys/story-summary", { chatId: "winter", op: "cancel" });
    expect(res.json.summary.state).toBe("idle");
    expect(readJson("litopys/chats/winter.json").storySummary).toBeUndefined();
    // nothing is asked on the next tick, and a late answer to the old key finds no job to fill
    expect(tick(m).requests).toEqual([]);
    expect(readJson("litopys/chats/winter.json").storySummary).toBeUndefined();
  });

  it("refuses a second ask while one runs, a record with no chapter, and a rebuild", () => {
    seed();
    const m = mockHost();
    expect(route(m.host, "POST", "/litopys/story-summary", { chatId: "winter", op: "start" }).status).toBe(200);
    expect(route(m.host, "POST", "/litopys/story-summary", { chatId: "winter", op: "start" }).status).toBe(409);
    seed("empty", { chapters: [] });
    expect(route(m.host, "POST", "/litopys/story-summary", { chatId: "empty", op: "start" }).status).toBe(409);
    expect(route(m.host, "POST", "/litopys/story-summary", { chatId: "winter", op: "nope" }).status).toBe(400);
    seed("busy", { rebuild: { chapters: [], facts: [] } });
    expect(route(m.host, "POST", "/litopys/story-summary", { chatId: "busy", op: "start" }).status).toBe(409);
  });

  it("is a prompt the user can change and restore like the others", () => {
    seed();
    const { host } = mockHost();
    const custom = "Summarise the story in three sentences.";
    expect(route(host, "PUT", "/litopys/config", { summary: custom }).json.summary).toBe(custom);
    expect(route(host, "GET", "/litopys/config").json.custom).toContain("summary");
    expect(L.resetPrompts(host.fs, "summary").summary).toBe(L.DEFAULT_PROMPTS.summary);
  });
});

describe("story summary: the import", () => {
  it("writes the text the dialog settled on in place of the one built from the record", () => {
    seed();
    const { host } = mockHost();
    const edited = "Aria held the gate and lost her brother. She will not leave a post again.";
    const r = route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", arc: true, arcText: edited });
    expect(r.status).toBe(200);
    expect(readJson("characters/aria/memory.json").sources[0].arc).toBe(edited);
  });

  it("without arcText, or with the arc unticked, the old behaviour holds", () => {
    seed();
    const { host } = mockHost();
    const none = route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "winter", arc: true, facts: [], notes: [], said: [] });
    expect(none.status).toBe(200);
    expect(readJson("characters/aria/memory.json").sources[0].arc).toContain("northern gate");
    seed("second");
    const off = route(host, "POST", "/litopys/card-memory/import", { cardId: "aria", chatId: "second", arc: false, arcText: "Ignored." });
    expect(off.status).toBe(400);
  });
});
