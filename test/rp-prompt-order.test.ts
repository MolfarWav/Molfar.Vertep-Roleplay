import { describe, expect, it } from "bun:test";
import { requestOrder } from "../src/lib/prompt-order";

const row = (key: string) => ({ item: { key } });
const part = (key: string) => ({ kind: "x", label: key, text: key, located: true, key });

describe("requestOrder: the board's request list follows the request, not the switches", () => {
  const parts = [part("section:main"), part("book:b"), part("section:checklist"), part("history"), part("history")];
  // the system prompt holds main then the book; history in messages 0 and 1; the checklist after it
  const spans = [
    { msg: -1, start: 0, end: 10, part: 0 },
    { msg: -1, start: 20, end: 30, part: 1 },
    { msg: 0, start: 0, end: 5, part: 3 },
    { msg: 1, start: 0, end: 5, part: 4 },
    { msg: 2, start: 0, end: 9, part: 2 },
  ];
  it("places sections, books and history where they are sent", () => {
    const board = ["section:main", "section:checklist", "history", "book:b"].map(row);
    expect(requestOrder(board, parts, spans).map((r) => r.item.key)).toEqual(["section:main", "book:b", "history", "section:checklist"]);
  });
  it("puts Litopys just above the history and the dashboard just after it", () => {
    const board = ["section:main", "section:checklist", "history", "plugin:litopys", "plugin:relations"].map(row);
    expect(requestOrder(board, parts, spans).map((r) => r.item.key)).toEqual([
      "section:main", "plugin:litopys", "history", "plugin:relations", "section:checklist",
    ]);
  });
  it("puts the card, persona and world memory in that order just above the history", () => {
    const board = ["plugin:worldmemory", "plugin:personamemory", "plugin:cardmemory", "history", "section:main"].map(row);
    expect(requestOrder(board, parts, spans).map((r) => r.item.key)).toEqual([
      "section:main", "plugin:cardmemory", "plugin:personamemory", "plugin:worldmemory", "history",
    ]);
  });
  it("keeps the board order with no spans, and puts rows with no place last", () => {
    const board = ["b", "a"].map(row);
    expect(requestOrder(board, parts, undefined)).toEqual(board);
    expect(requestOrder([row("nowhere"), row("section:main")], parts, spans).map((r) => r.item.key)).toEqual(["section:main", "nowhere"]);
  });
});
