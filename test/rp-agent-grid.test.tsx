// The `grid` widget of an agent panel (a board of tiles, e.g. a map of territory): what the checker refuses, how the
// board is worked out from the agent's list, what the editor offers, and the markup the chat draws.
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { compileAgent } from "../src/canvas-kit/boards/agent-check.js";
import { gridModel, sampleGridEntries } from "../src/lib/agent-grid";
import { fieldsFor, gridFields, newWidget, setWidgetKind } from "../src/lib/forge";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { GridWidget } = await import("../src/components/chat/agent-grid");

type Json = Record<string, any>;
const recipe = (): Json => JSON.parse(fs.readFileSync(new URL("../.skills/agent-craft/references/recipe-territory.vertep-agent.json", import.meta.url), "utf8"));
const grid = (f: Json): Json => f.agent.panels[0].widgets[0];
const codes = (f: Json): string[] => {
  const r = compileAgent(f) as Json;
  return r.error ? [r.error] : [...r.report.errors, ...r.report.warnings].map((x: Json) => x.code);
};

describe("grid widget: the checker", () => {
  it("the territory recipe passes clean", () => expect(codes(recipe())).toEqual([]));

  const cases: [string, (w: Json, f: Json) => void, string][] = [
    ["no columns", (w) => { delete w.cols; }, "E_WIDGET"],
    ["too many rows", (w) => { w.rows = 17; }, "E_WIDGET"],
    ["a fraction of a column", (w) => { w.cols = 2.5; }, "E_WIDGET"],
    ["bound to a number", (w, f) => { f.agent.state.hp = { type: "number" }; w.bind = "hp"; }, "E_BIND"],
    ["bound to a field that is not there", (w) => { w.bind = "nope"; }, "E_BIND"],
    ["x is not an entry field", (w) => { w.x = "nope"; }, "E_BIND"],
    ["x is the text field", (w) => { w.x = "kind"; }, "E_BIND"],
    ["x and y are the same field", (w) => { w.y = "x"; }, "E_BIND"],
    ["the state field is a number", (w) => { w.cell = "y"; }, "E_BIND"],
    ["no legend", (w) => { delete w.legend; }, "E_WIDGET"],
    ["an empty legend", (w) => { w.legend = []; }, "E_WIDGET"],
    ["nine states", (w) => { w.legend = Array.from({ length: 9 }, (_, i) => ({ value: `s${i}`, label: `S${i}`, tone: "ok" })); }, "E_WIDGET"],
    ["a state named twice", (w) => { w.legend[1].value = w.legend[0].value; }, "E_WIDGET"],
    ["a state with no label", (w) => { w.legend[0].label = " "; }, "E_WIDGET"],
    ["a colour that is not a tone", (w) => { w.legend[0].tone = "#ff0000"; }, "E_WIDGET"],
    ["a mark of three characters", (w) => { w.legend[0].mark = "abc"; }, "E_WIDGET"],
  ];
  it.each(cases)("%s is refused", (_name, change, code) => {
    const f = recipe();
    change(grid(f), f);
    expect(codes(f)).toContain(code);
  });

  it("two characters of one symbol are a mark (an emoji counts as one)", () => {
    const f = recipe();
    grid(f).legend[0].mark = "🚩";
    grid(f).legend[1].mark = "ab";
    expect(codes(f)).toEqual([]);
  });

  it("the mark may be left out", () => {
    const f = recipe();
    for (const l of grid(f).legend) delete l.mark;
    expect(codes(f)).toEqual([]);
  });
});

describe("grid widget: the board", () => {
  const spec = { cols: 4, rows: 3, x: "x", y: "y", cell: "kind", legend: [
    { value: "seen", label: "Seen", tone: "info", mark: "○" },
    { value: "ours", label: "Ours", tone: "ok" },
  ] };

  it("counts columns and rows from 1 and gives each tile its look", () => {
    const m = gridModel(spec, [{ x: 1, y: 1, kind: "seen" }, { x: 4, y: 3, kind: "ours" }]);
    expect(m.tiles).toEqual([
      { col: 1, row: 1, value: "seen", label: "Seen", tone: "info", mark: "○" },
      { col: 4, row: 3, value: "ours", label: "Ours", tone: "ok", mark: "O" }, // no mark given: the first letter of the label
    ]);
    expect(m.outside).toBe(0);
  });

  it("the later entry wins when two name one tile", () => {
    const m = gridModel(spec, [{ x: 2, y: 2, kind: "seen" }, { x: 2, y: 2, kind: "ours" }]);
    expect(m.tiles.map((t) => t.value)).toEqual(["ours"]);
  });

  it("entries off the board are counted, not drawn", () => {
    const m = gridModel(spec, [{ x: 0, y: 1, kind: "seen" }, { x: 5, y: 1, kind: "seen" }, { x: 1, y: 4, kind: "seen" }, { x: "a", y: 1, kind: "seen" }, null, "x"]);
    expect(m.tiles).toEqual([]);
    expect(m.outside).toBe(4);
  });

  it("rounds a fraction to the nearest tile", () => {
    expect(gridModel(spec, [{ x: 2.4, y: 2.6, kind: "seen" }]).tiles[0]).toMatchObject({ col: 2, row: 3 });
  });

  it("a state the legend does not name is a grey tile with a question mark", () => {
    expect(gridModel(spec, [{ x: 1, y: 1, kind: "lava" }]).tiles[0]).toMatchObject({ value: "lava", label: "lava", tone: "muted", mark: "?" });
  });

  it("a board from a hand-edited file is held to the limits", () => {
    const m = gridModel({ ...spec, cols: 99, rows: 0, legend: Array.from({ length: 20 }, (_, i) => ({ value: `s${i}`, label: `S${i}`, tone: "weird" })) }, []);
    expect(m.cols).toBe(16);
    expect(m.rows).toBe(1);
    expect(m.legend).toHaveLength(8);
    expect(m.legend[0]!.tone).toBe("muted");
  });

  it("the editor's sample fills the board with every state, and is empty for a new chat", () => {
    const filled = gridModel(spec, sampleGridEntries(spec, true));
    expect(new Set(filled.tiles.map((t) => t.value))).toEqual(new Set(["seen", "ours"]));
    expect(filled.outside).toBe(0);
    expect(sampleGridEntries(spec, false)).toEqual([]);
  });
});

describe("grid widget: the editor's helpers", () => {
  const state = {
    hp: { type: "number" },
    rooms: { type: "list", item: { name: "text", level: "number" } },
    tiles: { type: "list", item: { x: "number", y: "number", kind: "text" } },
  };
  it("a list is a board only with two numbers and a text", () => {
    expect(gridFields(state.rooms)).toBeNull();
    expect(gridFields(state.hp)).toBeNull();
    expect(gridFields(state.tiles)).toEqual({ x: "x", y: "y", cell: "kind" });
    expect(fieldsFor("grid", state)).toEqual(["tiles"]);
  });
  it("a new grid widget is bound to the first list that fits and passes the checker", () => {
    const w = newWidget("grid", state);
    expect(w).toMatchObject({ w: "grid", bind: "tiles", x: "x", y: "y", cell: "kind" });
    const f = recipe();
    f.agent.state = { tiles: { type: "list", item: state.tiles.item, max: 100 } };
    f.agent.panels[0].widgets = [w];
    expect(codes(f)).toEqual([]);
  });
  it("changing a widget to a grid and back builds a fresh widget", () => {
    const meter = newWidget("meter", state);
    expect(setWidgetKind(meter, "grid", state).w).toBe("grid");
    expect(setWidgetKind(newWidget("grid", state), "meter", state)).toMatchObject({ w: "meter", bind: "hp" });
  });
});

describe("grid widget: what the chat draws", () => {
  const w = grid(recipe());
  const draw = (own: Json) => renderToStaticMarkup(<GridWidget w={w as never} set={{ own }} />);
  it("one cell for each tile of the board, the known ones named for a screen reader", () => {
    const html = draw({ tiles: [{ x: 3, y: 4, kind: "claimed" }, { x: 1, y: 1, kind: "danger" }] });
    expect(html.match(/<span[^>]*aria-hidden="true"[^>]*border-dashed/g)?.length).toBe(46); // 48 tiles, 2 known
    expect(html.match(/role="img"/g)?.length).toBe(2);
    expect(html).toContain("⚑");
    expect(html).toContain("!");
    expect(html).toContain("grid-template-columns:repeat(8, minmax(0, 1fr))");
  });
  it("the legend names every state, so colour is never the only sign", () => {
    const html = draw({ tiles: [] });
    for (const l of w.legend) expect(html).toContain(l.label);
  });
  it("says so when a note names a tile outside the board", () => {
    expect(draw({ tiles: [{ x: 99, y: 1, kind: "claimed" }] })).toContain("agent-grid-outside");
    expect(draw({ tiles: [] })).not.toContain("agent-grid-outside");
  });
});
