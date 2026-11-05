import { describe, expect, it } from "bun:test";
import { BIG_PROMPT_TOKENS, isBigPrompt, lastPromptTokens, shouldOfferTrim } from "../src/lib/long-chat";
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

  it("is big by cost, or by the share of a known window", () => {
    expect(isBigPrompt(BIG_PROMPT_TOKENS)).toBe(true);
    expect(isBigPrompt(BIG_PROMPT_TOKENS - 1)).toBe(false);
    expect(isBigPrompt(5000, 8000)).toBe(true); // 62% of an 8k window
    expect(isBigPrompt(4000, 8000)).toBe(false);
    expect(isBigPrompt(5000, null)).toBe(false);
    expect(isBigPrompt(0, 8000)).toBe(false);
  });

  it("stays away after Not now until the prompt has grown by half", () => {
    expect(shouldOfferTrim(40000, 200000, null)).toBe(true);
    expect(shouldOfferTrim(40000, 200000, 40000)).toBe(false);
    expect(shouldOfferTrim(59000, 200000, 40000)).toBe(false);
    expect(shouldOfferTrim(60000, 200000, 40000)).toBe(true);
    expect(shouldOfferTrim(10000, 200000, null)).toBe(false);
  });
});
