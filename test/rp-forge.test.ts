/** The agent editor's model (src/lib/forge.ts): an edit stays tidy and the checker stays the judge. */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { blankAgent, check, defaultParams, fileOf, issuesByNode, newCard, nextNodeId, prune, roomy, cardHeight, setCard, fieldsFor, newPanel, newWidget, setWidgetKind, renameField, lostWhen, WIDGET_KINDS, setWire, tidyHeader, wireChoices, CARD_ORDER } from "../src/lib/forge";
import { generated } from "../scripts/sync-agent-recipes";
import { AGENT_RECIPES } from "../src/lib/forge-recipes";
import { removeNode } from "../src/canvas-kit/graph";
import { AGENT_CARDS } from "../src/canvas-kit/boards/agent";
import type { Graph } from "../src/canvas-kit/graph";

type Json = Record<string, any>;
const recipe = (name: string): Json => JSON.parse(fs.readFileSync(new URL(`../.skills/agent-craft/references/${name}.vertep-agent.json`, import.meta.url), "utf8"));
const graphOf = (f: Json): Graph => ({ nodes: f.nodes, edges: f.edges });

describe("a new card", () => {
  it("every card the checker knows has a default and a place in the list", () => {
    // write.state writes a Dashboard field, which the runner does not do yet: the editor does not offer it
    for (const type of Object.keys(AGENT_CARDS).filter((t) => t !== "write.state")) expect(CARD_ORDER as readonly string[]).toContain(type);
    for (const type of CARD_ORDER) expect(AGENT_CARDS[type]).toBeDefined();
    expect(defaultParams("agent.output")).toEqual({ kind: "note" });
  });

  it("gets a free id", () => {
    const g = graphOf(recipe("recipe-note"));
    expect(nextNodeId(g, "model.ask")).toBe("ask2");
    expect(nextNodeId(g, "logic.if")).toBe("if");
    expect(newCard(g, "model.ask", { x: 10.6, y: 20 })).toMatchObject({ id: "ask2", type: "model.ask", x: 11, y: 20, title: "Ask the model" });
  });
});

describe("editing", () => {
  it("a prompt without its slot loses the wire that fed it, and nothing else", () => {
    const f = recipe("recipe-note");
    const g = setCard(graphOf(f), "ask", { params: { ...f.nodes[1].params, prompt: "No slot here." } });
    expect(g.edges.map((e) => e.id)).toEqual(["e2"]);
    expect(setCard(graphOf(f), "ask", { title: "Renamed" }).edges).toHaveLength(2);
    const same = graphOf(f);
    expect(prune(same)).toBe(same);
  });

  it("offers only outputs that fit, and not the ones that would make a loop", () => {
    const g = graphOf(recipe("recipe-tracker"));
    const ends = wireChoices(g, "isDanger:mood").map((c) => c.end);
    expect(ends).toContain("ask:mood");
    expect(ends).not.toContain("up:done");
    expect(wireChoices(g, "up:when").map((c) => c.end)).toEqual(expect.arrayContaining(["isDanger:yes", "isDanger:no", "isCalm:yes"]));
    expect(wireChoices(g, "isDanger:mood").find((c) => c.end === "ask:mood")?.wired).toBe(true);
  });

  it("wires, replaces and unplugs an input", () => {
    const g = graphOf(recipe("recipe-tracker"));
    const moved = setWire(g, "up:when", "isCalm:yes").graph;
    expect(moved.edges.filter((e) => e.to === "up:when")).toEqual([expect.objectContaining({ from: "isCalm:yes" })]);
    expect(setWire(g, "up:when", null).graph.edges.some((e) => e.to === "up:when")).toBe(false);
    const bad = setWire(g, "up:when", "ask:mood");
    expect(bad.reason).toBeTruthy();
    expect(bad.graph).toBe(g);
  });
});

describe("the file an edit leaves", () => {
  it("the call budget follows the cards, every asked role exists, and a stale derived is gone", () => {
    const f = recipe("recipe-tracker");
    const head = tidyHeader({ ...f.agent, limits: { maxCalls: 5 }, models: {}, derived: { needs: [], maxCalls: 0, hash: "x" } }, graphOf(f));
    expect(head.limits).toEqual({ maxCalls: 1, concurrency: 1 });
    expect(head.models).toEqual({ fast: { hint: "cheap, short answers" } });
    expect(head.derived).toBeUndefined();
  });

  it("a recipe passes untouched, and the checker's verdict reaches the card it names", () => {
    const f = recipe("recipe-tracker");
    const ok = check(fileOf(f.title, f.agent, graphOf(f)));
    expect(ok.errors).toEqual([]);
    expect(ok.needs).toContain("write:own.tension");
    const g = setWire(graphOf(f), "isDanger:mood", null).graph;
    const broken = check(fileOf(f.title, f.agent, g));
    expect(broken.errors.map((e) => e.code)).toContain("E_UNWIRED");
    expect(issuesByNode(broken).get("isDanger")?.errors).toBeGreaterThan(0);
  });

  it("a blank agent is a file the checker can read, and says what is missing", () => {
    const r = check(blankAgent("my-agent", "My agent"));
    expect(r.errors.map((e) => e.code)).toEqual(["E_UNWIRED"]);
  });
});

describe("the recipes the editor starts from", () => {
  it("are the skill's files (run: bun scripts/sync-agent-recipes.ts)", () => {
    expect(fs.readFileSync(new URL("../src/lib/forge-recipes.ts", import.meta.url), "utf8")).toBe(generated());
    expect(AGENT_RECIPES.map((r) => (r.agent as Json).id)).toEqual(["next-moves-ai", "pacing-nudge", "scene-recap", "tension-meter"]);
  });
});

describe("room for the wires", () => {
  const tension = AGENT_RECIPES.find((r) => (r.agent as Json).id === "tension-meter")!;
  const asGraph = (f: { nodes?: Graph["nodes"]; edges?: Graph["edges"] }): Graph => ({ nodes: f.nodes ?? [], edges: f.edges ?? [] });

  it("opens up columns that are too close and leaves a roomy file alone", () => {
    const g = asGraph(tension);
    const wide = roomy(g);
    const xs = (x: Graph) => [...new Set(x.nodes.map((n) => n.x))].sort((a, b) => a - b);
    const gaps = (x: Graph) => xs(x).slice(1).map((v, i) => v - xs(x)[i]!);
    expect(Math.min(...gaps(wide).filter((d) => d > 60))).toBeGreaterThanOrEqual(230);
    expect(roomy(wide)).toBe(wide);
    expect(wide.edges).toEqual(g.edges);
  });

  it("never leaves two cards of a column on top of each other", () => {
    const g = asGraph(tension);
    const wide = roomy(g);
    for (const a of wide.nodes) for (const b of wide.nodes) {
      if (a.id >= b.id || Math.abs(a.x - b.x) > 60) continue;
      const [hi, lo] = a.y <= b.y ? [a, b] : [b, a];
      expect(lo.y).toBeGreaterThanOrEqual(hi.y + cardHeight(hi));
    }
  });
});

describe("panels and memory", () => {
  const tension = AGENT_RECIPES.find((r) => (r.agent as Json).id === "tension-meter")!;
  const state = (tension.agent as Json).state as Record<string, { type: string; item?: Record<string, string> }>;
  const rich = { tension: { type: "number", min: 0, max: 10, start: 0 }, note: { type: "text" }, rooms: { type: "list", item: { name: "text", level: "number" }, max: 20 } };
  const file = (agent: Json) => ({ ...(tension as Json), agent: { ...(tension.agent as Json), ...agent } }) as never;

  it("offers a widget only the fields that fit it", () => {
    expect(fieldsFor("meter", rich)).toEqual(["tension"]);
    expect(fieldsFor("text", rich)).toEqual(["note"]);
    expect(fieldsFor("table", rich)).toEqual(["rooms"]);
    expect(fieldsFor("actions", rich)).toEqual([]);
  });

  it("makes a widget for every kind that the checker accepts", () => {
    for (const kind of WIDGET_KINDS) {
      const panel = { id: "p", title: "P", place: "float", widgets: [newWidget(kind, rich)] };
      const r = check(file({ state: rich, panels: [panel] }));
      expect(r.errors.filter((e) => e.code === "E_PANEL" || e.code === "E_WIDGET" || e.code === "E_BIND").map((e) => e.message)).toEqual([]);
    }
  });

  it("a new panel starts with a widget that fits and has an id nobody uses", () => {
    const a = newPanel([], rich, "Panel");
    const b = newPanel([a], rich, "Panel");
    expect(a.id).toBe("panel");
    expect(b.id).toBe("panel-2");
    expect((a.widgets as Json[])[0]!.w).toBe("meter");
    expect((newPanel([], {}, "P").widgets as Json[])[0]!.w).toBe("actions");
  });

  it("changing the kind of a widget keeps the field when it still fits and picks another when it does not", () => {
    const meter = newWidget("meter", rich);
    expect(setWidgetKind(meter, "counter", rich).bind).toBe("tension");
    const t = setWidgetKind(meter, "text", rich);
    expect(t.bind).toBe("note");
    expect(setWidgetKind(meter, "table", rich).columns).toEqual(["name", "level"]);
    expect(setWidgetKind(meter, "actions", rich).w).toBe("actions");
  });

  it("renaming a field moves the cards and the panels with it", () => {
    const agent = { ...(tension.agent as Json), panels: [{ id: "p", title: "P", place: "top1", widgets: [{ w: "meter", label: "T", bind: "tension" }] }] };
    const g = { nodes: tension.nodes!, edges: tension.edges! } as Graph;
    const before = check(fileOf("x", agent, g));
    expect(before.errors).toEqual([]);
    const { agent: a2, graph: g2 } = renameField(agent, g, "tension", "dread");
    expect(Object.keys(a2.state)).toEqual(["dread"]);
    expect(a2.panels[0].widgets[0].bind).toBe("dread");
    expect(g2.nodes.filter((n) => n.params?.field).every((n) => n.params!.field === "dread")).toBe(true);
    expect(check(fileOf("x", a2, g2)).errors).toEqual([]);
  });

  it("names the cards that lose their trigger when a card is removed", () => {
    const g = { nodes: tension.nodes!, edges: tension.edges! } as Graph;
    const gate = g.edges.find((e) => e.to.endsWith(":when"))!;
    const gateNode = gate.from.split(":")[0]!;
    const lost = lostWhen(g, prune(removeNode(g, gateNode)));
    expect(lost.length).toBeGreaterThan(0);
    expect(lostWhen(g, g)).toEqual([]);
  });
});
