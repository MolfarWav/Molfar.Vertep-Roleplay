import { describe, expect, it } from "bun:test";
import { ownStoryChats, storyChoices, withStoryChoice, type StoryRow } from "../src/lib/carries";

const story = (id: string, over: Partial<StoryRow> = {}): StoryRow => ({ id, chatId: "chat-" + id, title: "T" + id, on: true, canon: "main", ...over });

describe("chat memory: the story choices of a chat", () => {
  it("the chat and its backstory chain carry their story themselves (at most three links, loops stop)", () => {
    expect([...ownStoryChats("a", {})]).toEqual(["a"]);
    expect([...ownStoryChats("a", { a: { from: "b" }, b: { from: "c" }, c: { from: "d" }, d: { from: "e" } })]).toEqual(["a", "b", "c", "d"]);
    expect([...ownStoryChats("a", { a: { from: "b" }, b: { from: "a" } })]).toEqual(["a", "b"]);
  });

  it("an override wins, else the default: on and canon main", () => {
    const list = [story("s1"), story("s2", { canon: "separate" }), story("s3", { on: false }), story("s4", { canon: "separate" })];
    expect(storyChoices(list, "x", {}, null).map((s) => s.checked)).toEqual([true, false, false, false]);
    const c = storyChoices(list, "x", {}, { s1: false, s2: true, s3: true, s4: false });
    expect(c.map((s) => s.checked)).toEqual([false, true, false, false]);
    expect(c[2]?.cardOff).toBe(true);
  });

  it("marks a story the chat already has by itself", () => {
    const c = storyChoices([story("s1", { chatId: "x" }), story("s2", { chatId: "b" }), story("s3", { chatId: "z" })], "x", { x: { from: "b" } }, null);
    expect(c.map((s) => s.own)).toEqual([true, true, false]);
  });

  it("stores only what differs from the default, and nothing at all when nothing does", () => {
    const main = story("s1");
    const sep = story("s2", { canon: "separate" });
    expect(withStoryChoice(null, main, false)).toEqual({ s1: false });
    expect(withStoryChoice({ s1: false }, main, true)).toBeNull();
    expect(withStoryChoice({ s1: false }, sep, true)).toEqual({ s1: false, s2: true });
    expect(withStoryChoice({ s2: true }, sep, false)).toBeNull();
  });
});
