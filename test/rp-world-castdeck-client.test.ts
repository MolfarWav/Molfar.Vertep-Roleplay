/**
 * The cast deck's refill from the app's side (#424, step 4): after a DM run that says the deck is low the app asks for one refill, once;
 * nothing when the run did not say so, when it failed, or when the next reply is already being written.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
// the app code reads location when it loads (it runs in a frame); a test has none
(globalThis as any).location ??= { pathname: "/app/u/roleplay/", origin: "http://localhost", href: "http://localhost/app/u/roleplay/", search: "", hash: "" };
const { refillWorldCast, triggerWorldUpdate } = await import("../src/lib/world");

const realFetch = globalThis.fetch;
let calls: { path: string; body: any }[] = [];
let answers: Record<string, () => unknown> = {};
beforeEach(() => {
  calls = [];
  answers = {};
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^.*?(\/world\/)/, "/world/");
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
    const make = Object.entries(answers).find(([p]) => path.startsWith(p));
    const json = make ? make[1]() : {};
    return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});
const view = (extra: Record<string, unknown> = {}) => ({ ok: true, settings: { level: "living" }, cast: 1, ...extra });
const refills = () => calls.filter((c) => c.path === "/world/cast/refill");
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("after a DM run", () => {
  it("asks for one refill when the run says the deck is low", async () => {
    answers["/world/update"] = () => view({ castRefill: true });
    answers["/world/cast/refill"] = () => ({ ok: true, added: 3, left: 4 });
    await triggerWorldUpdate("c1", () => false);
    await settle();
    expect(refills()).toHaveLength(1);
    expect(refills()[0]!.body).toEqual({ chatId: "c1" });
  });

  it("asks for nothing when the run does not say so, failed, or the next reply is being written", async () => {
    answers["/world/update"] = () => view({ castRefill: false });
    await triggerWorldUpdate("c1", () => false);
    answers["/world/update"] = () => ({ ok: false, error: "x", castRefill: true });
    await triggerWorldUpdate("c1", () => false);
    answers["/world/update"] = () => view({ castRefill: true });
    await triggerWorldUpdate("c1", () => true);
    await settle();
    expect(refills()).toHaveLength(0);
  });
});

describe("a refill", () => {
  it("goes one at a time for a chat; the button forces it", async () => {
    answers["/world/cast/refill"] = () => ({ ok: true, added: 2, left: 5 });
    const [a, b] = await Promise.all([refillWorldCast("c1", true), refillWorldCast("c1", true)]);
    expect([a.skipped, b.skipped].filter(Boolean)).toEqual(["busy"]);
    expect(refills()).toHaveLength(1);
    expect(refills()[0]!.body).toEqual({ chatId: "c1", force: true });
    // and again once the first is done
    await refillWorldCast("c1");
    expect(refills()).toHaveLength(2);
  });

  it("an app without the plugin stays silent", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    expect(await refillWorldCast("c1")).toMatchObject({ ok: true, skipped: "no world" });
  });
});
