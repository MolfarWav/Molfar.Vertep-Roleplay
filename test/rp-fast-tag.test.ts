/**
 * Dashboard fast mode, the chat plugin's half: the story reply may end with
 * <vertep_state>{json}</vertep_state>. The tag is cut before a message is saved
 * (in every mode, from text and parts), and in fast mode its body waits in
 * dashboard/fast/<chatId>.json under "<msgId>#<swipe>" for the dashboard update.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const engineUrl = new URL("../plugins/engine/plugin.js", import.meta.url).href;
const E = (await import(engineUrl)) as { handleRoute: Function; cutStateTag: (t: unknown) => { text: string; body: string | null; closed: boolean } };

const TAG = (body: string) => `<vertep_state>${body}</vertep_state>`;
const STATE = '{"present":["Aria"],"minutes":5}';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "fasttag-"));
  for (const d of ["characters", "personas", "presets", "regex", "groups", "lorebooks", "chats"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(
    path.join(root, "presets", "default.json"),
    JSON.stringify({ id: "default", name: "Default", prompts: [], prompt_order: [], temperature: 0.8, top_p: 0.95, openai_max_tokens: 512, openai_max_context: 8192 }),
  );
  for (const [id, name] of [["aria", "Aria"], ["bo", "Bo"]] as const) {
    fs.mkdirSync(path.join(root, "characters", id), { recursive: true });
    fs.writeFileSync(path.join(root, "characters", id, "card.json"), JSON.stringify({ spec: "chara_card_v2", name, description: "x", first_mes: "Welcome in, {{user}}." }));
  }
  fs.writeFileSync(path.join(root, "groups", "duo.json"), JSON.stringify({ id: "duo", name: "Duo", memberIds: ["aria", "bo"], mode: "list", mutedIds: [] }));
  fs.writeFileSync(path.join(root, "personas", "you.json"), JSON.stringify({ id: "you", name: "You", description: "" }));
  fs.writeFileSync(path.join(root, "settings.json"), JSON.stringify({ model: null, personaId: "you" }));
});
afterEach(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* watcher races */ }
});

type Reply = { text: string; parts?: unknown[] };

/** The kernel in miniature: every request is answered with `answer` (the next reply the test wants). */
function mockHost() {
  const results: Record<string, unknown> = {};
  const state = { answer: { text: "story" } as Reply, model: "mock/story" };
  let pending: string[] = [];
  const host = {
    fs: {
      root,
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
    llm: { request: (key: string) => { pending.push(key); }, results, embed: () => {}, embedResults: {} },
    net: { request: () => {}, results: {} },
    zip: { entries: () => { throw new Error("no zip"); }, list: () => 0 },
    log: () => {},
  };
  const resolve = () => {
    for (const key of pending) results[key] = { ...state.answer, model: state.model, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, costTotal: 0 } };
    pending = [];
  };
  return { host, state, resolve, results };
}

async function drive(mock: ReturnType<typeof mockHost>, req: { method: string; path: string; body?: unknown }) {
  for (const k of Object.keys(mock.results)) delete mock.results[k];
  const call = { method: req.method, path: req.path, query: {}, body: req.body } as Record<string, unknown>;
  let out = E.handleRoute(call, mock.host) as { status?: number; json?: Record<string, any>; __llmPending?: boolean; stash?: unknown };
  for (let pass = 0; out && out.__llmPending && pass < 3; pass++) {
    if (out.stash && typeof out.stash === "object") call.stash = out.stash;
    mock.resolve();
    out = E.handleRoute(call, mock.host) as typeof out;
  }
  return { status: out?.status ?? 200, json: (out?.json ?? {}) as Record<string, any> };
}

const setMode = (mode: string) => {
  fs.mkdirSync(path.join(root, "dashboard"), { recursive: true });
  fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ mode }));
};
const newChat = async (mock: ReturnType<typeof mockHost>, body: Record<string, unknown> = { characterId: "aria" }) => {
  const r = await drive(mock, { method: "POST", path: "/chats", body });
  return (r.json.meta as { id: string }).id;
};
const lines = (id: string) => fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const fastFile = (id: string) => path.join(root, "dashboard/fast", `${id}.json`);
const readFast = (id: string) => JSON.parse(fs.readFileSync(fastFile(id), "utf8"));
const say = (mock: ReturnType<typeof mockHost>, text: string, parts?: unknown[]) => { mock.state.answer = parts ? { text, parts } : { text }; };

describe("cutStateTag", () => {
  it("1. a closed tag at the end: cut with the whitespace before it, the body is what lay between", () => {
    expect(E.cutStateTag("The door opens.\n" + TAG(STATE))).toEqual({ text: "The door opens.", body: STATE, closed: true });
    // text after the closing tag stays
    expect(E.cutStateTag("A\n" + TAG("{}") + "\nB")).toEqual({ text: "A\n\nB", body: "{}", closed: true });
    // the body is raw: line breaks and fences are the dashboard's to read
    expect(E.cutStateTag("A <vertep_state>\n```json\n{}\n```\n</vertep_state>").body).toBe("\n```json\n{}\n```\n");
  });

  it("an unclosed tail (cut off by the token limit): cut from the opening tag to the end, closed false", () => {
    expect(E.cutStateTag('The door opens.\n<vertep_state>{"present":["Ar')).toEqual({ text: "The door opens.", body: '{"present":["Ar', closed: false });
    expect(E.cutStateTag("A<vertep_state>")).toEqual({ text: "A", body: "", closed: false });
  });

  it("two tags: the last one is the report, the earlier one goes too", () => {
    const r = E.cutStateTag("A " + TAG('{"first":1}') + " B\n" + TAG('{"last":1}'));
    expect(r).toEqual({ text: "A  B", body: '{"last":1}', closed: true });
    // an earlier tag that never closed does not swallow the last one
    const r2 = E.cutStateTag("A <vertep_state>{ B\n" + TAG('{"last":1}'));
    expect(r2.body).toBe('{"last":1}');
    expect(r2.text).toBe("A");
  });

  it("no tag: the text comes back as it was, body null (also for odd input)", () => {
    const text = "  Plain reply with <b>html</b> and vertep_state words.  \n";
    expect(E.cutStateTag(text)).toEqual({ text, body: null, closed: false });
    expect(E.cutStateTag("")).toEqual({ text: "", body: null, closed: false });
    expect(E.cutStateTag(undefined)).toEqual({ text: "", body: null, closed: false });
    expect(E.cutStateTag(null).body).toBeNull();
  });
});

describe("the tag in saved replies", () => {
  it("2. send in fast mode: no tag in the text or the swipes; the entry sits under <msgId>#0", async () => {
    setMode("fast");
    const mock = mockHost();
    const id = await newChat(mock);
    say(mock, "She nods.\n" + TAG(STATE));
    const r = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello" } });
    expect(r.status).toBe(200);
    const msg = r.json.reply as { id: string; text: string; swipes: string[] };
    expect(msg.text).toBe("She nods.");
    expect(msg.swipes).toEqual(["She nods."]);
    const saved = lines(id).at(-1);
    expect(saved.text).toBe("She nods.");
    expect(saved.swipes).toEqual(["She nods."]);
    expect(fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8")).not.toContain("vertep_state");
    const doc = readFast(id);
    expect(doc.v).toBe(1);
    expect(Object.keys(doc.entries)).toEqual([msg.id + "#0"]);
    expect(doc.entries[msg.id + "#0"]).toEqual({ body: STATE, at: expect.any(Number), model: "mock/story", closed: true });
    expect(Date.now() - doc.entries[msg.id + "#0"].at).toBeLessThan(60_000);
  });

  it("send in mode sensor (or no config): the tag is cut and no file is written", async () => {
    for (const mode of [null, "sensor", "manual"]) {
      if (mode) setMode(mode);
      const mock = mockHost();
      const id = await newChat(mock);
      say(mock, "She nods.\n" + TAG(STATE));
      const r = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello" } });
      expect((r.json.reply as { text: string }).text).toBe("She nods.");
      expect(fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8")).not.toContain("vertep_state");
      expect(fs.existsSync(fastFile(id))).toBe(false);
    }
  });

  it("a cut-off reply is kept with closed false; an empty tag or a reply without one writes nothing", async () => {
    setMode("fast");
    const mock = mockHost();
    const id = await newChat(mock);
    say(mock, 'She nods.\n<vertep_state>{"present":["Aria"],"minu');
    const r = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "one" } });
    const msg = r.json.reply as { id: string; text: string };
    expect(msg.text).toBe("She nods.");
    expect(readFast(id).entries[msg.id + "#0"]).toMatchObject({ body: '{"present":["Aria"],"minu', closed: false });
    say(mock, "No report.");
    const plain = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "two" } });
    say(mock, "Empty.\n" + TAG("  \n"));
    const empty = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "three" } });
    expect((empty.json.reply as { text: string }).text).toBe("Empty.");
    expect(Object.keys(readFast(id).entries)).toEqual([msg.id + "#0"]);
    void plain;
  });

  it("the tag is cut from the parts of a tool-using reply (a part that was only the tag goes)", async () => {
    setMode("fast");
    const mock = mockHost();
    const id = await newChat(mock);
    const parts = [
      { type: "text", text: "Let me roll." },
      { type: "tool", name: "roll", args: {}, result: "5" },
      { type: "text", text: "A five!\n" + TAG(STATE) },
    ];
    say(mock, "Let me roll.\nA five!\n" + TAG(STATE), parts);
    const r = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "roll" } });
    const saved = lines(id).at(-1);
    expect(saved.text).toBe("Let me roll.\nA five!");
    expect(saved.extra.parts).toEqual([parts[0], parts[1], { type: "text", text: "A five!" }]);
    expect(JSON.stringify(saved)).not.toContain("vertep_state");
    expect(readFast(id).entries[(r.json.reply as { id: string }).id + "#0"].body).toBe(STATE);
    // the tag alone in its own last part
    say(mock, "Done.\n" + TAG(STATE), [{ type: "text", text: "Done." }, { type: "text", text: TAG(STATE) }]);
    await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "again" } });
    expect(lines(id).at(-1).extra.parts).toEqual([{ type: "text", text: "Done." }]);
  });

  it("3. swipe (generate): the entry sits under <msgId>#1; navigating to an old swipe writes nothing", async () => {
    setMode("fast");
    const mock = mockHost();
    const id = await newChat(mock);
    say(mock, "First.\n" + TAG('{"n":0}'));
    const sent = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } });
    const mid = (sent.json.reply as { id: string }).id;
    say(mock, "Second.\n" + TAG('{"n":1}'));
    const sw = await drive(mock, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: 1 } });
    expect(sw.json.swipe).toBe(1);
    const msg = sw.json.message as { text: string; swipes: string[] };
    expect(msg.text).toBe("Second.");
    expect(msg.swipes).toEqual(["First.", "Second."]);
    expect(Object.keys(readFast(id).entries).sort()).toEqual([mid + "#0", mid + "#1"]);
    expect(readFast(id).entries[mid + "#1"].body).toBe('{"n":1}');
    const before = fs.readFileSync(fastFile(id), "utf8");
    await drive(mock, { method: "POST", path: `/chats/${id}/swipe`, body: { dir: -1 } });
    expect(fs.readFileSync(fastFile(id), "utf8")).toBe(before);
  });

  it("3. continue: the tag is cut, nothing is written, and the entry of that key is forgotten", async () => {
    setMode("fast");
    const mock = mockHost();
    const id = await newChat(mock);
    say(mock, "First.\n" + TAG(STATE));
    const sent = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } });
    const mid = (sent.json.reply as { id: string }).id;
    expect(readFast(id).entries[mid + "#0"]).toBeDefined();
    say(mock, "And more.\n" + TAG('{"n":2}'));
    const r = await drive(mock, { method: "POST", path: `/chats/${id}/continue`, body: {} });
    expect((r.json.message as { text: string }).text).toBe("First. And more.");
    expect(fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8")).not.toContain("vertep_state");
    // the only entry was the continued message's: the file goes with it
    expect(fs.existsSync(fastFile(id))).toBe(false);
  });

  it("3. cancelled: the client's frozen text and parts lose the tag, no entry", async () => {
    setMode("fast");
    const mock = mockHost();
    const id = await newChat(mock);
    const r = await drive(mock, {
      method: "POST",
      path: `/chats/${id}/cancelled`,
      body: { text: "Half a sen<vertep_state>{\"pres", userText: "hi", parts: [{ type: "text", text: "Half a sen<vertep_state>{\"pres" }, { type: "text", text: "<vertep_state>{}</vertep_state>" }] },
    });
    expect(r.status).toBe(200);
    const saved = lines(id).at(-1);
    expect(saved.text).toBe("Half a sen");
    expect(saved.extra.parts).toEqual([{ type: "text", text: "Half a sen" }]);
    expect(fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8")).not.toContain("vertep_state");
    expect(fs.existsSync(fastFile(id))).toBe(false);
    // an in-place regen that was cancelled: appended as a swipe, cut the same way
    const target = lines(id).at(-1).id;
    const again = await drive(mock, { method: "POST", path: `/chats/${id}/cancelled`, body: { text: "Other<vertep_state>{", targetMessageId: target, expectedSwipes: 1 } });
    expect(again.status).toBe(200);
    expect(lines(id).at(-1).swipes).toEqual(["Half a sen", "Other"]);
    expect(fs.existsSync(fastFile(id))).toBe(false);
  });

  it("next (a group member answers): the entry sits under the new message's key", async () => {
    setMode("fast");
    const mock = mockHost();
    const id = await newChat(mock, { groupId: "duo" });
    say(mock, "Aria speaks.\n" + TAG('{"who":"aria"}'));
    await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "hello both" } });
    say(mock, "Bo speaks.\n" + TAG('{"who":"bo"}'));
    const r = await drive(mock, { method: "POST", path: `/chats/${id}/next`, body: { charId: "bo" } });
    const reply = r.json.reply as { id: string; name: string; text: string };
    expect(reply).toMatchObject({ name: "Bo", text: "Bo speaks." });
    expect(readFast(id).entries[reply.id + "#0"].body).toBe('{"who":"bo"}');
    expect(Object.keys(readFast(id).entries).length).toBe(2);
    expect(fs.readFileSync(path.join(root, "chats", `${id}.jsonl`), "utf8")).not.toContain("vertep_state");
  });

  it("a write that fails never fails the reply", async () => {
    setMode("fast");
    const mock = mockHost();
    const id = await newChat(mock);
    // dashboard/fast is a file, so the entry cannot be written
    fs.mkdirSync(path.join(root, "dashboard"), { recursive: true });
    fs.writeFileSync(path.join(root, "dashboard/fast"), "in the way");
    say(mock, "Fine.\n" + TAG(STATE));
    const r = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } });
    expect(r.status).toBe(200);
    expect((r.json.reply as { text: string }).text).toBe("Fine.");
  });
});

describe("the entries file", () => {
  it("keeps the newest 20, drops what is a day old, cuts a body to 16000 characters", async () => {
    setMode("fast");
    const mock = mockHost();
    const id = await newChat(mock);
    const now = Date.now();
    const old: Record<string, unknown> = { "gone#0": { body: "{}", at: now - 25 * 3600 * 1000, model: "m", closed: true } };
    for (let i = 0; i < 20; i++) old["k" + i + "#0"] = { body: "{}", at: now - 1000 * (i + 1), model: "m", closed: true };
    fs.mkdirSync(path.join(root, "dashboard/fast"), { recursive: true });
    fs.writeFileSync(fastFile(id), JSON.stringify({ v: 1, entries: old }));
    say(mock, "Long.\n" + TAG("x".repeat(20000)));
    const r = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "hi" } });
    const key = (r.json.reply as { id: string }).id + "#0";
    const entries = readFast(id).entries as Record<string, { body: string }>;
    expect(Object.keys(entries).length).toBe(20);
    expect(entries[key]!.body.length).toBe(16000);
    expect(entries["gone#0"]).toBeUndefined();
    // the oldest of the fresh ones made room
    expect(entries["k19#0"]).toBeUndefined();
    expect(entries["k0#0"]).toBeDefined();
  });
});

describe("both halves together", () => {
  it("a fast-mode reply saved by the chat plugin is applied by the dashboard update with no model call", async () => {
    fs.mkdirSync(path.join(root, "dashboard"), { recursive: true });
    fs.writeFileSync(path.join(root, "dashboard/config.json"), JSON.stringify({ mode: "fast", autoSoul: false }));
    const relations = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as { handleRoute: Function };
    const mock = mockHost();
    const id = await newChat(mock);
    say(mock, "She nods.\n" + TAG('{"present":["Aria"],"minutes":5,"events":[{"id":"compliment","weight":"routine","from":"user","to":"Aria"}]}'));
    const sent = await drive(mock, { method: "POST", path: `/chats/${id}/send`, body: { text: "You did well." } });
    const mid = (sent.json.reply as { id: string }).id;
    const out = relations.handleRoute({ method: "POST", path: "/dashboard/update", query: {}, body: { chatId: id, op: "send" } }, mock.host) as { __llmPending?: boolean; json?: Record<string, any> };
    expect(out.__llmPending).toBeUndefined();
    expect(out.json?.ok).toBe(true);
    expect(out.json?.snapshot).toBe(mid + "#0");
    const st = JSON.parse(fs.readFileSync(path.join(root, "dashboard/state", id + ".json"), "utf8"));
    expect(st.snapshots[mid + "#0"]).toMatchObject({ fast: true, sensorModel: "mock/story", op: "send" });
    expect(st.snapshots[mid + "#0"].chars.Aria.stats.affection).toBe(1);
    expect(fs.existsSync(fastFile(id))).toBe(false);
    // the story text the sensor would have read is the saved, tag-free one
    const again = relations.handleRoute({ method: "POST", path: "/dashboard/update", query: {}, body: { chatId: id, op: "send" } }, mock.host) as { json?: Record<string, any> };
    expect(again.json?.unchanged).toBe(true);
  });
});
