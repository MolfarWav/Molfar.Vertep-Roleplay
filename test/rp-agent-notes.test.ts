import { describe, expect, it } from "bun:test";
import { noteAgentIds, notesMode, QUIET_PLACE } from "../src/lib/agent-notes";
import { usageFor } from "../src/lib/agent-sets";
import type { AgentInfo, ChatAgentItem } from "../src/lib/agents";

const info = (id: string, places: string[]) => ({ id, places } as unknown as AgentInfo);
const item = (agent: string, show: string | null = null): ChatAgentItem => ({ agent, on: true, show });

describe("the notes switch", () => {
  const infos = [info("notes", ["note", "log", "feed"]), info("both", ["note", "bottom", "log"]), info("state", ["log", "feed", "top1"]), info("plain", [])];
  it("reaches the agents that make notes and leaves choices and state agents alone", () => {
    const items = [item("notes"), item("both"), item("state"), item("plain"), item("gone")];
    expect(noteAgentIds(items, infos)).toEqual(["notes"]);
    expect(noteAgentIds(items, null)).toEqual([]);
  });
  it("reads loud, quiet and mixed from what the chat set", () => {
    const ids = ["a", "b"];
    expect(notesMode([item("a"), item("b")], ids)).toBe("loud");
    expect(notesMode([item("a", QUIET_PLACE), item("b", QUIET_PLACE)], ids)).toBe("quiet");
    expect(notesMode([item("a", QUIET_PLACE), item("b", "top1")], ids)).toBe("mixed");
    expect(notesMode([item("a", "feed"), item("b")], ids)).toBe("loud");
  });
});

describe("usageFor", () => {
  it("is null while unknown, else the count of the set and whether it is a floor", () => {
    expect(usageFor(undefined, "rp")).toBeNull();
    expect(usageFor(null, "rp")).toBeNull();
    expect(usageFor({ follows: { rp: 3 }, own: 1, total: 4, partial: false }, "rp")).toEqual({ n: 3, partial: false });
    expect(usageFor({ follows: {}, own: 0, total: 4000, partial: true }, "rp")).toEqual({ n: 0, partial: true });
  });
});
