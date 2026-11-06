import { describe, expect, it } from "bun:test";
import { ALERT_SHARE, alertLimit, lastPromptTokens, shouldOfferTrim } from "../src/lib/long-chat";
import type { Message } from "../src/lib/types";

const reply = (usage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }, role: Message["role"] = "assistant"): Message =>
  ({ id: Math.random().toString(36), role, characterId: null, activeSwipe: 0, timestamp: 0, edited: false, hidden: false, bookmarked: false,
    swipes: [{ id: "s", content: "x", model: "m", genTimeMs: 1, timestamp: 0, ...(usage ? { usage } : {}) }] }) as Message;

describe("a chat that has grown large (#261)", () => {
  it("reads the prompt size of the newest reply, cached input included", () => {
    expect(lastPromptTokens([reply({ input: 5000, output: 100 }), reply(undefined, "user"), reply({ input: 40000, output: 200, cacheRead: 2000, cacheWrite: 500 })])).toBe(42500);
  });

  it("looks past a reply that is still streaming, but not far", () => {
    expect(lastPromptTokens([reply({ input: 31000, output: 1 }), reply(undefined)])).toBe(31000);
    expect(lastPromptTokens([reply({ input: 31000, output: 1 }), reply(undefined), reply(undefined), reply(undefined), reply(undefined)])).toBe(0);
  });

  it("is zero for a chat without usage", () => {
    expect(lastPromptTokens([])).toBe(0);
    expect(lastPromptTokens([reply(undefined, "user")])).toBe(0);
  });

  it("the limit is 60% of the window by default, and nothing when the window is unknown", () => {
    expect(ALERT_SHARE).toBe(0.6);
    expect(alertLimit(null, 200000)).toBe(120000);
    expect(alertLimit({ promptAlert: "auto" }, 32768)).toBe(19661);
    expect(alertLimit(undefined, null)).toBeNull();
    expect(alertLimit({ promptAlert: "auto" }, 0)).toBeNull();
  });

  it("the person's own size wins over the window, and Never switches it off", () => {
    expect(alertLimit({ promptAlert: "tokens", promptAlertTokens: 45000 }, 1000000)).toBe(45000);
    expect(alertLimit({ promptAlert: "tokens", promptAlertTokens: 45000 }, null)).toBe(45000);
    expect(alertLimit({ promptAlert: "tokens" }, 1000000)).toBeNull();
    expect(alertLimit({ promptAlert: "off", promptAlertTokens: 45000 }, 1000000)).toBeNull();
  });

  it("offers the trim from the limit up, not below it", () => {
    expect(shouldOfferTrim(120000, 120000, null)).toBe(true);
    expect(shouldOfferTrim(119999, 120000, null)).toBe(false);
    expect(shouldOfferTrim(0, 100, null)).toBe(false);
    expect(shouldOfferTrim(500000, null, null)).toBe(false);
  });

  it("stays away after Not now until the prompt has grown by half", () => {
    expect(shouldOfferTrim(40000, 30000, 40000)).toBe(false);
    expect(shouldOfferTrim(59000, 30000, 40000)).toBe(false);
    expect(shouldOfferTrim(60000, 30000, 40000)).toBe(true);
  });
});
