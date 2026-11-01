// The open Canvas board is shared by the Canvas and the rail's Agents item (lib/canvas-board.ts).
import { describe, expect, it } from "bun:test";
import { BOARD_KEY, parseBoard } from "../src/lib/canvas-board";

describe("canvas board key", () => {
  it("parses the four boards and falls back to links", () => {
    for (const b of ["links", "prompt", "agents", "sets"]) expect(parseBoard(b)).toBe(b);
    expect(parseBoard("nope")).toBe("links");
    expect(parseBoard(null)).toBe("links");
    expect(parseBoard(7)).toBe("links");
  });
  it("keeps the storage key older builds and the guide write", () => {
    expect(BOARD_KEY).toBe("rp.canvas.board");
  });
});
