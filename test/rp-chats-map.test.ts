import { describe, expect, it } from "bun:test";
import { chainBack, descendants, layoutChatMap } from "../src/components/library/chats-graph";
import type { LitChatItem } from "../src/components/library/litopys-api";

const chat = (id: string, rest: Partial<LitChatItem> = {}): LitChatItem => ({
  id, title: id, name: "", parentChatId: null, continues: null, updatedAt: 0, hasData: true,
  chapters: 0, facts: 0, proposals: 0, worker: null, ...rest,
});

// a -> b (link) -> c (link); c forked into d; b continued by e; x unrelated
const items = [
  chat("a"),
  chat("b", { continues: "a" }),
  chat("c", { continues: "b" }),
  chat("d", { parentChatId: "c" }),
  chat("e", { continues: "b" }),
  chat("x"),
];

describe("map of one chat", () => {
  it("walks the chain back and the descendants", () => {
    expect(chainBack(items[2], items).map((i) => i.id)).toEqual(["a", "b"]);
    expect(descendants(items[1], items).map((i) => i.id).sort()).toEqual(["c", "d", "e"]);
    expect(descendants(items[5], items)).toEqual([]);
  });

  it("puts the chain above in the chat's column and joins every node", () => {
    const l = layoutChatMap(items[2], items);
    const at = (id: string) => l.nodes.find((n) => n.item.id === id)!;
    expect(l.nodes.map((n) => n.item.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(at("a").y).toBeLessThan(at("b").y);
    expect(at("b").y).toBeLessThan(at("c").y);
    expect(at("c").y).toBeLessThan(at("d").y);
    expect(at("a").x).toBe(at("c").x);
    expect(at("a").children.map((n) => n.item.id)).toEqual(["b"]);
    expect(at("b").children.map((n) => n.item.id)).toEqual(["c"]);
    expect(at("c").children.map((n) => n.item.id)).toEqual(["d"]);
    expect(at("b").kind).toBe("link");
    expect(at("d").kind).toBe("fork");
  });

  it("survives a loop in the data", () => {
    const loop = [chat("p", { continues: "q" }), chat("q", { continues: "p" })];
    expect(chainBack(loop[0], loop).length).toBeLessThanOrEqual(12);
    expect(() => layoutChatMap(loop[0], loop)).not.toThrow();
  });
});
