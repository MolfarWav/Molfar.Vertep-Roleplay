/**
 * Meanwhile from the app's side (#449, M1b): the pass after a reply is asked for only when the switch is on (the switch is remembered, so
 * a chat with it off makes no plugin call), never while the next reply is being written, once at a time per chat; and the card's lines.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
// the app code reads location when it loads (it runs in a frame); a test has none
(globalThis as any).location ??= { pathname: "/app/u/roleplay/", origin: "http://localhost", href: "http://localhost/app/u/roleplay/", search: "", hash: "" };
const { triggerMeanwhile, saveMeanwhileConfig, resetMeanwhileCache } = await import("../src/lib/meanwhile");
const { eventLine, logLine, dueText } = await import("../src/components/world/world-meanwhile");
const { DICTIONARIES } = await import("../src/lib/i18n");

const realFetch = globalThis.fetch;
let calls: { path: string; method: string; body: any }[] = [];
let enabled = false;
let status = 200;
beforeEach(() => {
  calls = [];
  enabled = false;
  status = 200;
  resetMeanwhileCache();
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^.*?(\/meanwhile\/)/, "/meanwhile/");
    calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    const json = path.startsWith("/meanwhile/config") ? { config: { enabled } } : path.startsWith("/meanwhile/run") ? { ok: true, kept: 1 } : {};
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
const runs = () => calls.filter((c) => c.path === "/meanwhile/run");
const reads = () => calls.filter((c) => c.path === "/meanwhile/config" && c.method === "GET");

describe("the pass after a reply", () => {
  it("makes no pass while the switch is off, and asks for the switch only once", async () => {
    await triggerMeanwhile("c1", () => false);
    await triggerMeanwhile("c1", () => false);
    await triggerMeanwhile("c2", () => false);
    expect(runs()).toHaveLength(0);
    expect(reads()).toHaveLength(1);
  });

  it("asks for a pass of this chat when the switch is on", async () => {
    enabled = true;
    await triggerMeanwhile("c1", () => false);
    expect(runs()).toHaveLength(1);
    expect(runs()[0]!.body).toEqual({ chatId: "c1" });
  });

  it("does nothing while the next reply is being written", async () => {
    enabled = true;
    await triggerMeanwhile("c1", () => true);
    expect(calls).toHaveLength(0);
  });

  it("the card's switch is remembered at once", async () => {
    enabled = true;
    await saveMeanwhileConfig({ enabled: true });
    await triggerMeanwhile("c1", () => false);
    expect(reads()).toHaveLength(0);
    expect(runs()).toHaveLength(1);
  });

  it("an app without the plugin stays silent", async () => {
    status = 404;
    await triggerMeanwhile("c1", () => false);
    expect(runs()).toHaveLength(0);
  });

  it("one pass at a time for a chat", async () => {
    enabled = true;
    await Promise.all([triggerMeanwhile("c1", () => false), triggerMeanwhile("c1", () => false)]);
    expect(runs()).toHaveLength(1);
  });
});

const t = (key: string, vars?: Record<string, string | number>) => (DICTIONARIES.en as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ""));

describe("the card's lines", () => {
  it("an event by the spoiler setting", () => {
    expect(eventLine(t as any, { id: "m1", visibility: "secret", status: "active" })).toBe("Something happened off screen (secret)");
    expect(eventLine(t as any, { id: "m1", visibility: "local", status: "active", who: ["Ada", "Bram"], where: "the mill", when: "at night" })).toBe("Ada, Bram: the mill, at night (local)");
    expect(eventLine(t as any, { id: "m1", visibility: "public", status: "active", who: ["Ada"], where: "", when: "" })).toBe("Ada: … (public)");
    expect(eventLine(t as any, { id: "m1", visibility: "secret", status: "active", who: ["Ada"], where: "the mill", when: "", what: "Ada hides the ledger." })).toBe("Ada hides the ledger. (Ada, the mill) · secret");
  });

  it("a log line: kept of offered, the reasons dropped, an error", () => {
    const base = { at: 1, reason: "scene", model: "m", ms: 5, offered: 3, kept: 2, dropped: [] };
    expect(logLine(t as any, base)).toBe("Scene closed: 2 of 3 events kept.");
    expect(logLine(t as any, { ...base, dropped: ["who: p3 is in the scene"] })).toBe("Scene closed: 2 of 3 events kept. Dropped: who: p3 is in the scene.");
    expect(logLine(t as any, { ...base, undone: true })).toBe("Scene closed: 2 of 3 events kept. Taken back: the reply was swiped or deleted.");
    expect(logLine(t as any, { ...base, reason: "manual", error: "bad-reply: no events list in the answer" })).toBe("Run by hand: failed, bad-reply: no events list in the answer");
  });

  it("what the next pass waits for", () => {
    expect(dueText(t as any, { due: false, reason: "few", replies: 1, spanMinutes: 0 }, 6)).toBe("Waiting for more replies (1 so far).");
    expect(dueText(t as any, { due: true, reason: "clock", replies: 4, spanMinutes: 400 }, 6)).toContain("about 7 h");
    expect(dueText(t as any, { due: false, reason: "quiet", replies: 4, spanMinutes: 10 }, 6)).toContain("6 h");
    expect(dueText(t as any, { due: true, reason: "scene", replies: 4, spanMinutes: 0 }, 6)).toContain("scene has closed");
  });

  it("every key the card can ask for exists in both languages", () => {
    const keys = Object.keys(DICTIONARIES.en).filter((k) => k.startsWith("world.mw."));
    expect(keys.length).toBeGreaterThan(50);
    for (const k of keys) expect((DICTIONARIES.uk as Record<string, string>)[k]).toBeTruthy();
    for (const reason of ["off", "combat", "no-dashboard", "few", "quiet", "cooldown", "nobody", "no-model", "error", "empty", "bad-reply", "no-chat", "no-plugin"]) expect(keys).toContain("world.mw.why." + reason);
    for (const reason of ["scene", "clock", "manual"]) expect(keys).toContain("world.mw.reason." + reason);
    for (const reason of ["scene", "clock", "few", "quiet", "no-dashboard", "combat"]) expect(keys).toContain("world.mw.due." + reason);
  });
});

describe("what a character did off screen (the Dashboard journal)", () => {
  const ev = (id: string, who: string[], more: Record<string, unknown> = {}) => ({ id, visibility: "secret", status: "active", who, where: "the harbour", when: "at dusk", ...more }) as any;
  it("gives a character the events that name them, matching a full name by its first word, and none under Nothing", async () => {
    const { awayEvents } = await import("../src/lib/meanwhile");
    const list = [ev("m1", ["Ada Vale"]), ev("m2", ["Bram"]), ev("m3", ["Cora", "ada"]), { id: "m4", visibility: "local", status: "active" }];
    expect(awayEvents(list, "Ada").map((e) => e.id)).toEqual(["m1", "m3"]);
    expect(awayEvents(list, "Mira")).toEqual([]);
    expect(awayEvents(list, "  ")).toEqual([]);
  });

  it("a line by the spoiler setting", async () => {
    const { awayLine } = await import("../src/components/dashboard/dash-journal");
    const t2 = (key: string, vars?: Record<string, string | number>) => t(key, vars);
    expect(awayLine(t2 as any, ev("m1", ["Ada"]))).toBe("the harbour, at dusk · secret");
    expect(awayLine(t2 as any, ev("m1", ["Ada"], { where: "", when: "" }))).toBe("Something happened off screen · secret");
    expect(awayLine(t2 as any, ev("m1", ["Ada"], { what: "Ada hides the ledger.", visibility: "local" }))).toBe("Ada hides the ledger. · local");
  });
});
