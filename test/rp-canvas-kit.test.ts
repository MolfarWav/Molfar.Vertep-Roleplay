import { describe, expect, it } from "bun:test";
import {
  addNode,
  boardKindFallback,
  canConnect,
  commit,
  connect,
  fromFile,
  historyOf,
  insertOnEdge,
  layoutForest,
  redo,
  removeNode,
  toFile,
  undo,
  wouldCycle,
} from "../src/canvas-kit/graph";
import type { BoardKind, Graph, History } from "../src/canvas-kit/graph";
import { CHAT_LINKS, boardFromChats, linkChanges } from "../src/canvas-kit/boards/chat-links";
import { wireControls, wirePath, wirePoint } from "../src/canvas-kit/wire";
import type { LitChatItem } from "../src/components/library/litopys-api";

const testBoard: BoardKind = {
  kind: "test",
  types: {
    src: {
      type: "src",
      label: "S",
      colorVar: "--x",
      hint: "",
      ports: [{ id: "o", side: "out", type: "t" }],
    },
    sink: {
      type: "sink",
      label: "K",
      colorVar: "--x",
      hint: "",
      ports: [
        { id: "i", side: "in", type: "t" },
        { id: "i2", side: "in", type: "u" },
      ],
    },
    hub: {
      type: "hub",
      label: "H",
      colorVar: "--x",
      hint: "",
      ports: [
        { id: "i", side: "in", type: "t" },
        { id: "o", side: "out", type: "t" },
      ],
    },
  },
};

const node = (id: string, type = "hub"): { id: string; type: string; x: number; y: number; title: string } => ({
  id,
  type,
  x: 0,
  y: 0,
  title: id.toUpperCase(),
});

const chatGraph = (n: number): Graph => ({
  nodes: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, type: "chat", x: 0, y: 0, title: `Chat ${i}` })),
  edges: [],
});

const item = (id: string, continues: string | null, parentChatId: string | null = null): LitChatItem => ({
  id,
  title: `Title ${id}`,
  name: `name-${id}`,
  parentChatId,
  continues,
  updatedAt: 0,
  hasData: true,
  chapters: 1,
  facts: 0,
  proposals: 0,
  worker: null,
});

describe("canConnect generic rules", () => {
  const g: Graph = {
    nodes: [node("s", "src"), node("k", "sink"), node("h")],
    edges: [{ id: "e1", from: "s:o", to: "k:i" }],
  };

  it("refuses unknown ports", () => {
    expect(canConnect(testBoard, g, "nope:o", "k:i")).toEqual({ ok: false, reason: "Unknown port" });
    expect(canConnect(testBoard, g, "s:o", "k:zzz")).toEqual({ ok: false, reason: "Unknown port" });
  });

  it("refuses out to out", () => {
    expect(canConnect(testBoard, g, "h:o", "h:o")).toEqual({
      ok: false,
      reason: "Connect an output to an input",
    });
  });

  it("refuses self connection", () => {
    expect(canConnect(testBoard, g, "h:o", "h:i")).toEqual({
      ok: false,
      reason: "A card cannot connect to itself",
    });
  });

  it("refuses type mismatch", () => {
    expect(canConnect(testBoard, g, "s:o", "k:i2")).toEqual({
      ok: false,
      reason: "These ports do not fit together",
    });
  });

  it("refuses duplicates", () => {
    expect(canConnect(testBoard, g, "s:o", "k:i")).toEqual({ ok: false, reason: "Already connected" });
  });
});

describe("chat-links board", () => {
  it("max:1 on prev produces replaces", () => {
    const g: Graph = {
      nodes: [
        { id: "a", type: "chat", x: 0, y: 0, title: "A" },
        { id: "b", type: "chat", x: 0, y: 0, title: "B" },
        { id: "c", type: "chat", x: 0, y: 0, title: "C" },
      ],
      edges: [{ id: "l:b", from: "a:next", to: "b:prev" }],
    };
    const v = canConnect(CHAT_LINKS, g, "c:next", "b:prev");
    expect(v).toEqual({ ok: true, replaces: ["l:b"] });
  });

  it("refuses cycles", () => {
    const g: Graph = {
      nodes: [
        { id: "a", type: "chat", x: 0, y: 0, title: "A" },
        { id: "b", type: "chat", x: 0, y: 0, title: "B" },
      ],
      edges: [{ id: "l:b", from: "a:next", to: "b:prev" }],
    };
    expect(canConnect(CHAT_LINKS, g, "b:next", "a:prev")).toEqual({
      ok: false,
      reason: "That would make a loop: a chat cannot continue its own continuation",
    });
    expect(wouldCycle(g, "b:next", "a:prev")).toBe(true);
  });

  it("connect applies replaces", () => {
    const g: Graph = {
      nodes: [
        { id: "a", type: "chat", x: 0, y: 0, title: "A" },
        { id: "b", type: "chat", x: 0, y: 0, title: "B" },
        { id: "c", type: "chat", x: 0, y: 0, title: "C" },
      ],
      edges: [{ id: "l:b", from: "a:next", to: "b:prev" }],
    };
    const { graph, verdict } = connect(CHAT_LINKS, g, "c:next", "b:prev", "new1");
    expect(verdict).toEqual({ ok: true, replaces: ["l:b"] });
    expect(graph.edges).toEqual([{ id: "new1", from: "c:next", to: "b:prev" }]);
  });

  it("connect leaves the graph unchanged on refusal", () => {
    const g: Graph = {
      nodes: [
        { id: "a", type: "chat", x: 0, y: 0, title: "A" },
        { id: "b", type: "chat", x: 0, y: 0, title: "B" },
      ],
      edges: [{ id: "l:b", from: "a:next", to: "b:prev" }],
    };
    const { graph } = connect(CHAT_LINKS, g, "b:next", "a:prev", "x");
    expect(graph).toBe(g);
  });
});

describe("insertOnEdge", () => {
  it("splices a chat into a wire", () => {
    const g: Graph = {
      nodes: [
        { id: "a", type: "chat", x: 0, y: 0, title: "A" },
        { id: "b", type: "chat", x: 0, y: 0, title: "B" },
        { id: "c", type: "chat", x: 0, y: 0, title: "C" },
      ],
      edges: [{ id: "l:b", from: "a:next", to: "b:prev" }],
    };
    const res = insertOnEdge(CHAT_LINKS, g, "l:b", "c");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.graph.edges).toEqual([
      { id: "l:ba", from: "a:next", to: "c:prev" },
      { id: "l:bb", from: "c:next", to: "b:prev" },
    ]);
  });

  it("fails when the node has no matching ports", () => {
    const g: Graph = {
      nodes: [node("s", "src"), node("k", "sink"), node("k2", "sink")],
      edges: [{ id: "e1", from: "s:o", to: "k:i" }],
    };
    const res = insertOnEdge(testBoard, g, "e1", "k2");
    expect(res.ok).toBe(false);
    expect(typeof res.reason).toBe("string");
  });

  it("fails when the node is already an end of the edge", () => {
    const g: Graph = {
      nodes: [
        { id: "a", type: "chat", x: 0, y: 0, title: "A" },
        { id: "b", type: "chat", x: 0, y: 0, title: "B" },
      ],
      edges: [{ id: "l:b", from: "a:next", to: "b:prev" }],
    };
    const res = insertOnEdge(CHAT_LINKS, g, "l:b", "a");
    expect(res.ok).toBe(false);
    expect(res.graph).toBe(g);
  });
});

describe("removeNode", () => {
  it("removes the node and its edges", () => {
    const g: Graph = {
      nodes: [
        { id: "a", type: "chat", x: 0, y: 0, title: "A" },
        { id: "b", type: "chat", x: 0, y: 0, title: "B" },
        { id: "c", type: "chat", x: 0, y: 0, title: "C" },
      ],
      edges: [
        { id: "l:b", from: "a:next", to: "b:prev" },
        { id: "l:c", from: "b:next", to: "c:prev" },
      ],
    };
    const out = removeNode(g, "b");
    expect(out.nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(out.edges).toEqual([]);
  });
});

describe("history", () => {
  const g0: Graph = { nodes: [node("a")], edges: [] };
  const g1 = addNode(g0, node("b"));
  const g2 = addNode(g1, node("c"));

  it("undoes and redoes", () => {
    let h: History = historyOf(g0);
    h = commit(h, g1);
    h = commit(h, g2);
    expect(h.present).toBe(g2);
    h = undo(h);
    expect(h.present).toBe(g1);
    h = redo(h);
    expect(h.present).toBe(g2);
    h = undo(h);
    h = undo(h);
    expect(h.present).toBe(g0);
    expect(undo(h)).toBe(h);
  });

  it("commit is a no-op for the same graph and honours the limit", () => {
    let h = historyOf(g0);
    h = commit(h, g1);
    expect(commit(h, h.present)).toBe(h);
    h = commit(h, g2, 1);
    expect(h.past.length).toBe(1);
    expect(h.past[0]).toBe(g1);
  });
});

describe("toFile / fromFile", () => {
  const g: Graph = {
    nodes: [
      { id: "a", type: "chat", x: 1, y: 2, title: "A", subtitle: "sub" },
      { id: "b", type: "chat", x: 3, y: 4, title: "B" },
    ],
    edges: [{ id: "l:b", from: "a:next", to: "b:prev" }],
  };

  it("round-trips", () => {
    const file = toFile("chat-links", "My board", g);
    const res = fromFile(file);
    expect("file" in res).toBe(true);
    if ("file" in res) {
      expect(res.file.kind).toBe("chat-links");
      expect(res.file.title).toBe("My board");
      expect(res.file.nodes).toEqual(g.nodes);
      expect(res.file.edges).toEqual(g.edges);
      expect(toFile("k", "t", fromFile(file).file as Graph | never) && true).toBe(true);
    }
  });

  it("rejects bad input", () => {
    expect("error" in fromFile(null)).toBe(true);
    expect("error" in fromFile({})).toBe(true);
    expect("error" in fromFile({ format: "nope", version: 1, kind: "k", title: "t", nodes: [], edges: [] })).toBe(true);
    expect("error" in fromFile({ format: "vertep-canvas", version: 2, kind: "k", title: "t", nodes: [], edges: [] })).toBe(true);
    expect(
      "error" in fromFile({ format: "vertep-canvas", version: 1, kind: "k", title: "t", nodes: "x", edges: [] }),
    ).toBe(true);
    expect(
      "error" in
        fromFile({
          format: "vertep-canvas",
          version: 1,
          kind: "k",
          title: "t",
          nodes: [{ id: "a", type: "chat", x: Number.NaN, y: 0, title: "A" }],
          edges: [],
        }),
    ).toBe(true);
    expect(
      "error" in
        fromFile({
          format: "vertep-canvas",
          version: 1,
          kind: "k",
          title: "t",
          nodes: [{ id: "a", type: "chat", x: 0, y: 0, title: "A" }],
          edges: [{ id: "e", from: "zz:next", to: "a:prev" }],
        }),
    ).toBe(true);
  });
});

describe("boardFromChats", () => {
  it("links continuations, shows forks as locked wires, skips missing chats", () => {
    const g = boardFromChats([
      item("a", null),
      item("b", "a"),
      item("c", "a"),
      item("d", "missing"),
      item("e", null, "a"),
    ]);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(g.nodes.find((n) => n.id === "a")?.title).toBe("Title a");
    expect([...g.edges].sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: "f:e", from: "a:next", to: "e:prev", locked: true },
      { id: "l:b", from: "a:next", to: "b:prev" },
      { id: "l:c", from: "a:next", to: "c:prev" },
    ]);
  });

  it("a locked fork wire neither blocks a link nor counts as one", () => {
    const g = boardFromChats([item("a", null), item("b", null), item("e", null, "a")]);
    expect(canConnect(CHAT_LINKS, g, "b:next", "e:prev")).toEqual({ ok: true, replaces: [] });
    const linked = connect(CHAT_LINKS, g, "b:next", "e:prev", "n1").graph;
    expect(linked.edges.some((e) => e.id === "f:e")).toBe(true);
    expect(linkChanges(g, linked)).toEqual([{ chatId: "e", from: "b" }]);
  });

  it("overrides positions for known ids", () => {
    const g = boardFromChats([item("a", null), item("b", "a")], { a: { x: 5, y: 6 } });
    const a = g.nodes.find((n) => n.id === "a")!;
    expect(a.x).toBe(5);
    expect(a.y).toBe(6);
  });

  it("uses Untitled for empty titles", () => {
    const g = boardFromChats([{ ...item("a", null), title: "" }]);
    expect(g.nodes[0].title).toBe("Untitled");
  });
});

describe("linkChanges", () => {
  const nodes = [
    { id: "a", type: "chat", x: 0, y: 0, title: "A" },
    { id: "b", type: "chat", x: 0, y: 0, title: "B" },
    { id: "c", type: "chat", x: 0, y: 0, title: "C" },
  ];

  it("emits set and remove changes sorted by chatId", () => {
    const before: Graph = { nodes, edges: [{ id: "l:b", from: "a:next", to: "b:prev" }] };
    const after: Graph = { nodes, edges: [{ id: "l:c", from: "a:next", to: "c:prev" }] };
    expect(linkChanges(before, after)).toEqual([
      { chatId: "b", from: null },
      { chatId: "c", from: "a" },
    ]);
  });

  it("treats a chat removed from the board as hidden, not unlinked", () => {
    const before: Graph = { nodes, edges: [{ id: "l:b", from: "a:next", to: "b:prev" }] };
    expect(linkChanges(before, removeNode(before, "a"))).toEqual([]);
    expect(linkChanges(before, removeNode(before, "b"))).toEqual([]);
  });

  it("emits nothing when nothing changed", () => {
    const g: Graph = { nodes, edges: [{ id: "l:b", from: "a:next", to: "b:prev" }] };
    expect(linkChanges(g, { nodes: g.nodes, edges: [...g.edges] })).toEqual([]);
  });
});

describe("layoutForest", () => {
  it("centres a parent over two children", () => {
    const g: Graph = {
      nodes: [
        { id: "p", type: "chat", x: 0, y: 0, title: "P" },
        { id: "k1", type: "chat", x: 0, y: 0, title: "A" },
        { id: "k2", type: "chat", x: 0, y: 0, title: "B" },
      ],
      edges: [
        { id: "e1", from: "p:next", to: "k1:prev" },
        { id: "e2", from: "p:next", to: "k2:prev" },
      ],
    };
    const out = layoutForest(g);
    const at = (id: string) => out.nodes.find((n) => n.id === id)!;
    expect(at("k1").x).toBe(0);
    expect(at("k2").x).toBe(220);
    expect(at("k1").y).toBe(150);
    expect(at("k2").y).toBe(150);
    expect(at("p").x).toBe(110);
    expect(at("p").y).toBe(0);
  });

  it("places isolated nodes in a row after the trees", () => {
    const g: Graph = {
      nodes: [
        { id: "p", type: "chat", x: 0, y: 0, title: "P" },
        { id: "k", type: "chat", x: 0, y: 0, title: "A" },
        { id: "z1", type: "chat", x: 0, y: 0, title: "Z1" },
        { id: "z2", type: "chat", x: 0, y: 0, title: "Z2" },
      ],
      edges: [{ id: "e1", from: "p:next", to: "k:prev" }],
    };
    const out = layoutForest(g);
    const at = (id: string) => out.nodes.find((n) => n.id === id)!;
    expect(at("k").x).toBe(0);
    expect(at("p").x).toBe(0);
    expect(at("z1").x).toBe(220);
    expect(at("z2").x).toBe(440);
    expect(at("z1").y).toBe(0);
  });
});

describe("max on an output port", () => {
  it("replaces the oldest wire leaving a full output", () => {
    const board: BoardKind = {
      kind: "m",
      types: {
        a: { type: "a", label: "A", colorVar: "--x", hint: "", ports: [{ id: "o", side: "out", type: "t", max: 1 }] },
        b: { type: "b", label: "B", colorVar: "--x", hint: "", ports: [{ id: "i", side: "in", type: "t" }] },
      },
    };
    const g: Graph = {
      nodes: [
        { id: "x", type: "a", x: 0, y: 0, title: "x" },
        { id: "y", type: "b", x: 0, y: 0, title: "y" },
        { id: "z", type: "b", x: 0, y: 0, title: "z" },
      ],
      edges: [{ id: "e1", from: "x:o", to: "y:i" }],
    };
    expect(canConnect(board, g, "x:o", "z:i")).toEqual({ ok: true, replaces: ["e1"] });
  });
});

describe("wires (#41)", () => {
  const a = { x: 100, y: 100 };

  it("a target well below the source keeps the plain S-curve", () => {
    const b = { x: 140, y: 300 };
    const { c1, c2 } = wireControls(a, b);
    expect(c1).toEqual({ x: 100, y: 200 });
    expect(c2).toEqual({ x: 140, y: 200 });
    expect(wirePath(a, b)).toBe("M100,100 C100,200 140,200 140,300");
  });

  it("a target above (or beside) the source swings out sideways instead of looping over its card", () => {
    for (const b of [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 260, y: 40 }, { x: -60, y: 40 }]) {
      const { c1, c2 } = wireControls(a, b);
      const side = b.x >= a.x ? 1 : -1;
      expect(Math.abs(c1.x - a.x)).toBeGreaterThanOrEqual(90);
      expect(Math.sign(c1.x - a.x)).toBe(side);
      expect(Math.sign(c2.x - b.x)).toBe(-side);
      // still leaves downwards and enters from above
      expect(c1.y).toBeGreaterThan(a.y);
      expect(c2.y).toBeLessThan(b.y);
    }
  });

  it("wirePoint runs from the source to the target", () => {
    const b = { x: 100, y: 0 };
    expect(wirePoint(a, b, 0)).toEqual(a);
    expect(wirePoint(a, b, 1)).toEqual(b);
  });
});
