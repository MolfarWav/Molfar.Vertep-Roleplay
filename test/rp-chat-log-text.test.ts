/**
 * A plain-text chat log read into messages (Molfar.Vertep#291): `Name: text` with continuation lines, stamps and bold labels,
 * names that are really sentences ignored, and the public chat-line shape for the importer.
 */
import { describe, expect, it } from "bun:test";
import { parseChatLog, sceneCalls, toChatLines } from "../src/lib/chat-log-text";

const LOG = `Ada: Hello Bram.
Bram: Hi. You came late.
Ada: The road was long.
She shakes the rain off her cloak.
Bram: Sit down. Note: the stew is cold.
`;

describe("parseChatLog", () => {
  it("reads Name: text, joins continuation lines and counts the speakers", () => {
    const r = parseChatLog(LOG);
    expect(r.messages.map((m) => m.speaker)).toEqual(["Ada", "Bram", "Ada", "Bram"]);
    expect(r.messages[2]!.text).toBe("The road was long.\nShe shakes the rain off her cloak.");
    expect(r.speakers).toEqual([{ name: "Ada", count: 2 }, { name: "Bram", count: 2 }]);
  });

  it("a label inside a message that appears only once is text, not a speaker", () => {
    const r = parseChatLog(LOG);
    expect(r.messages[3]!.text).toBe("Sit down. Note: the stew is cold.");
  });

  it("takes stamps and bold labels, in any case", () => {
    const r = parseChatLog("[12:30] **Ada:** one\n12:31 - Bram: two\n(12:32) ada: three\n**Bram**: four\n");
    expect(r.messages.map((m) => m.speaker)).toEqual(["Ada", "Bram", "Ada", "Bram"]);
    expect(r.messages.map((m) => m.text)).toEqual(["one", "two", "three", "four"]);
  });

  it("reads Windows line ends and a leading byte-order mark", () => {
    const r = parseChatLog("﻿Ada: one\r\nBram: two\r\nAda: three\r\n");
    expect(r.messages.length).toBe(3);
  });

  it("two names that appear once each are still a conversation", () => {
    const r = parseChatLog("Ada: hi\nBram: hello\n");
    expect(r.messages.length).toBe(2);
  });

  it("text without the shape, or with one speaker only, gives nothing", () => {
    expect(parseChatLog("Just a paragraph about a road.\nAnother one.").messages).toEqual([]);
    expect(parseChatLog("Ada: one\nAda: two\nAda: three").messages).toEqual([]);
    expect(parseChatLog("").messages).toEqual([]);
  });

  it("a sentence before a colon is no name", () => {
    const r = parseChatLog("Ada: one\nBram: two\nThe door creaked open and then he said: go\nAda: three\n");
    expect(r.messages.length).toBe(3);
    expect(r.messages[1]!.text).toBe("two\nThe door creaked open and then he said: go");
  });
});

describe("toChatLines and sceneCalls", () => {
  it("marks the player's speaker as the user and keeps the order by time", () => {
    const lines = toChatLines(parseChatLog(LOG).messages, "ada", 1_700_000_000_000);
    expect(lines.map((l) => l.is_user)).toEqual([true, false, true, false]);
    expect(lines.map((l) => l.name)).toEqual(["Ada", "Bram", "Ada", "Bram"]);
    const times = lines.map((l) => Date.parse(l.send_date));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("one model call per closed scene: a scene is maxMessages messages when the chat has no Dashboard data", () => {
    expect(sceneCalls(39)).toBe(0);
    expect(sceneCalls(40)).toBe(1);
    expect(sceneCalls(400)).toBe(10);
    expect(sceneCalls(400, 20)).toBe(20);
  });
});
