import { describe, expect, it } from "bun:test";
import {
  MAX_BOARDS, allBoards, boardsOf, cleanBoardName, deleteBoard, renameBoard, startBoard, switchBoard, toSettings,
} from "../src/canvas-kit/boards/saved-boards";

const ids = (...list: string[]) => { let i = 0; return () => list[i++] ?? `x${i++}`; };
const legacy = { placed: ["a", "b"], positions: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } } };

describe("saved Chat links boards (#108)", () => {
  it("an install from before named boards has one board, the main one, with what it had", () => {
    const s = boardsOf(legacy, undefined, "Main board");
    expect(s.others).toEqual([]);
    expect(s.active).toMatchObject({ id: "main", name: "Main board", placed: ["a", "b"], seq: 0 });
    expect(s.active.positions.a).toEqual({ x: 1, y: 2 });
  });

  it("a new board is empty and the old one is kept as it was", () => {
    const s = startBoard(boardsOf(legacy, undefined, "Main board"), "  Winter   arc ", ids("w"));
    expect(s.active).toMatchObject({ id: "w", name: "Winter arc", placed: [], positions: {} });
    expect(s.others).toHaveLength(1);
    expect(s.others[0]).toMatchObject({ id: "main", placed: ["a", "b"] });
  });

  it("switching puts the board on screen back in the list and brings the picked one forward", () => {
    let s = startBoard(boardsOf(legacy, undefined, "Main board"), "Second", ids("s"));
    s = { ...s, active: { ...s.active, placed: ["c"] } }; // an edit on the board on screen
    s = switchBoard(s, "main");
    expect(s.active).toMatchObject({ id: "main", placed: ["a", "b"] });
    expect(s.others.find((b) => b.id === "s")).toMatchObject({ placed: ["c"] });
    expect(switchBoard(s, "missing")).toBe(s);
  });

  it("the menu keeps the order the boards were made in, whichever is on screen", () => {
    let s = startBoard(boardsOf(legacy, undefined, "Main board"), "Two", ids("b2"));
    s = startBoard(s, "Three", ids("b3"));
    const order = () => allBoards(s).map((b) => b.id);
    expect(order()).toEqual(["main", "b2", "b3"]);
    s = switchBoard(s, "b2");
    expect(order()).toEqual(["main", "b2", "b3"]);
    s = switchBoard(s, "b3");
    expect(order()).toEqual(["main", "b2", "b3"]);
    expect(allBoards(s).find((b) => b.isActive)?.id).toBe("b3");
  });

  it("rename cleans the name and keeps the old one for a blank; delete never removes the board on screen", () => {
    let s = startBoard(boardsOf(legacy, undefined, "Main board"), "Two", ids("b2"));
    s = renameBoard(s, "main", "   ");
    expect(allBoards(s).find((b) => b.id === "main")?.name).toBe("Main board");
    s = renameBoard(s, "main", "Old\n story");
    expect(allBoards(s).find((b) => b.id === "main")?.name).toBe("Old story");
    expect(deleteBoard(s, "b2")).toBe(s);
    const gone = deleteBoard(s, "main");
    expect(allBoards(gone).map((b) => b.id)).toEqual(["b2"]);
  });

  it("a blank new name gets a numbered one, and the list stops at the limit", () => {
    let s = boardsOf(legacy, undefined, "Main board");
    s = startBoard(s, "", ids("b2"));
    expect(s.active.name).toBe("Board 2");
    let n = 0;
    while (allBoards(s).length < MAX_BOARDS) s = startBoard(s, "x", () => `id${n++}`);
    expect(startBoard(s, "one more", () => "late")).toBe(s);
    expect(cleanBoardName("a".repeat(100), "f")).toHaveLength(40);
  });

  it("round-trips through the settings keys and tolerates damaged entries", () => {
    const s = startBoard(boardsOf(legacy, undefined, "Main board"), "Two", ids("b2"));
    const saved = JSON.parse(JSON.stringify(toSettings(s)));
    expect(boardsOf(saved.canvasBoard, saved.canvasBoards, "Main board")).toEqual(s);
    const odd = boardsOf(
      { id: "main", placed: ["a", 5 as unknown as string] },
      [{ id: "main", name: "dup of the active one" }, { placed: "nope" as unknown as string[] }, { id: "k", name: "K", placed: ["z"] }],
      "Main board",
    );
    expect(odd.active.placed).toEqual(["a"]);
    expect(odd.others.map((b) => b.id)).toEqual(["board-2", "k"]);
    expect(odd.others[0]?.placed).toEqual([]);
  });
});
