/** The agent editor's model (src/lib/forge.ts): an edit stays tidy and the checker stays the judge. */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { blankAgent, check, defaultParams, fileOf, issuesByNode, newCard, nextNodeId, prune, roomy, cardHeight, setCard, fieldsFor, newPanel, newWidget, setWidgetKind, renameField, exportOf, copyOf, freeId, moveItem, renameInTemplate, starterTemplate, lostWhen, WIDGET_KINDS, setWire, tidyHeader, wireChoices, CARD_ORDER, portsOf, INPUT_SOURCES } from "../src/lib/forge";
import { generated } from "../scripts/sync-agent-recipes";
import { AGENT_RECIPES } from "../src/lib/forge-recipes";
import { removeNode } from "../src/canvas-kit/graph";
import { templateProblems } from "../src/canvas-kit/boards/agent-check";
import { AGENT_CARDS } from "../src/canvas-kit/boards/agent";
import type { Graph } from "../src/canvas-kit/graph";

type Json = Record<string, any>;
const recipe = (name: string): Json => JSON.parse(fs.readFileSync(new URL(`../.skills/agent-craft/references/${name}.vertep-agent.json`, import.meta.url), "utf8"));
const graphOf = (f: Json): Graph => ({ nodes: f.nodes, edges: f.edges });

describe("a new card", () => {
  it("every card the checker knows has a default and a place in the list", () => {
    for (const type of Object.keys(AGENT_CARDS)) expect(CARD_ORDER as readonly string[]).toContain(type);
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

describe("the Write to Dashboard card (#132)", () => {
  const withWrite = (params: Json) => {
    const f = blankAgent("test-agent", "T");
    const card = { ...newCard(graphOf(f), "write.state", { x: 250, y: 60 }), params };
    return fileOf("T", f.agent as Json, { nodes: [...f.nodes, card], edges: f.edges });
  };

  it("starts as a text field with ports and a permission", () => {
    expect(defaultParams("write.state")).toEqual({ field: "mood", as: "text" });
    const f = withWrite(defaultParams("write.state"));
    const card = f.nodes.find((n) => n.type === "write.state")!;
    expect(portsOf(card).ins.map((p) => p.id).sort()).toEqual(["value", "when"]);
    expect(check(f).needs).toContain("write:state.mood");
  });

  it("the checker keeps its word on the card's field, type, character and limits", () => {
    const codes = (params: Json) => check(withWrite(params)).errors.map((e) => e.code).filter((c) => c.startsWith("E_DASH"));
    expect(codes({ field: "trust", as: "number", of: "Anna", clamp: { min: 0, maxStep: 5 } })).toEqual([]);
    expect(codes({ field: "present", as: "text" })).toEqual(["E_DASH_FIELD"]);
    expect(codes({ field: "trust", as: "text" })).toEqual(["E_DASH_TYPE"]);
    expect(codes({ field: "weather", as: "text", of: "Anna" })).toEqual(["E_DASH_OF"]);
    expect(codes({ field: "mood", as: "text", clamp: { max: 1 } })).toEqual(["E_DASH_CLAMP"]);
  });
});

describe("the cards that work in code", () => {
  const blank = () => graphOf(blankAgent("test-agent", "T"));
  const ids = (ps: { id: string }[]) => ps.map((p) => p.id).sort();

  it("a new card of each kind gets its default params and the right ports", () => {
    expect(defaultParams("random.dice")).toEqual({ count: 1, sides: 20 });
    expect(defaultParams("random.pick")).toEqual({ items: [{ text: "Option A", weight: 1 }, { text: "Option B", weight: 1 }] });
    expect(defaultParams("text.extract")).toEqual({ pattern: "(.+)", group: 1 });
    expect(defaultParams("text.cut")).toEqual({ keep: "first", unit: "words", n: 50 });
    const g = blank();
    const dice = newCard(g, "random.dice", { x: 0, y: 0 });
    expect(dice).toMatchObject({ id: "dice", type: "random.dice", params: { count: 1, sides: 20 } });
    expect(ids(portsOf(dice).ins)).toEqual(["when"]);
    expect(ids(portsOf(dice).outs)).toEqual(["rolls", "total"]);
    expect(portsOf(dice).outs.find((p) => p.id === "total")?.type).toBe("number");
    const pick = newCard(g, "random.pick", { x: 0, y: 0 });
    expect(ids(portsOf(pick).ins)).toEqual(["when"]);
    expect(ids(portsOf(pick).outs)).toEqual(["index", "text"]);
    const ext = newCard(g, "text.extract", { x: 0, y: 0 });
    expect(ids(portsOf(ext).ins)).toEqual(["in"]);
    expect(ids(portsOf(ext).outs)).toEqual(["match", "none"]);
    expect(portsOf(ext).outs.find((p) => p.id === "none")?.type).toBe("signal");
    const cut = newCard(g, "text.cut", { x: 0, y: 0 });
    expect(ids(portsOf(cut).ins)).toEqual(["in"]);
    expect(ids(portsOf(cut).outs)).toEqual(["text"]);
  });

  it("the defaults pass the check, and a bad value is named on its card", () => {
    const f = blankAgent("test-agent", "T");
    const g = graphOf(f);
    const withCards = { nodes: [...g.nodes, ...(["random.dice", "random.pick", "text.extract", "text.cut"] as const).map((t, i) => newCard(g, t, { x: 100 * i, y: 200 }))], edges: g.edges };
    const file = fileOf("T", f.agent as Json, withCards);
    // the cards are not wired here, so only a parameter problem counts
    expect(check(file).errors.filter((e) => e.code !== "E_UNWIRED")).toEqual([]);
    const bad = setCard(withCards, "dice", { params: { count: 99, sides: 20 } });
    const r = check(fileOf("T", f.agent as Json, bad));
    expect(r.errors.find((e) => e.node === "dice")?.code).toBe("E_PARAM");
    expect(issuesByNode(r).get("dice")?.errors).toBe(1);
  });

  it("the Input offers Litopys facts and the lorebook, and accepts a limit", () => {
    expect(INPUT_SOURCES as readonly string[]).toContain("litopysFacts");
    expect(INPUT_SOURCES as readonly string[]).toContain("lorebook");
    const f = blankAgent("test-agent", "T");
    const mk = (limit: unknown) => {
      const g = setCard(graphOf(f), "in", { params: { give: [{ id: "facts", source: "litopysFacts", limit }, { id: "lore", source: "lorebook" }] } });
      return check(fileOf("T", f.agent as Json, g));
    };
    expect(mk(5).errors.filter((e) => e.node === "in")).toEqual([]);
    expect(mk(5).needs).toEqual(expect.arrayContaining(["read:litopysFacts", "read:lorebook"]));
    // the limit is not an error when too large: the plugin clamps it (60 facts, 20 entries)
    expect(mk(61).errors.filter((e) => e.node === "in")).toEqual([]);
  });

  it("a count the host would change is warned about on the Input card (#146)", () => {
    const f = blankAgent("test-agent", "T");
    const warned = (give: Json[]) => {
      const g = setCard(graphOf(f), "in", { params: { give } });
      return check(fileOf("T", f.agent as Json, g)).warnings.filter((w) => w.code === "W_LIMIT").map((w) => w.message);
    };
    expect(warned([{ id: "facts", source: "litopysFacts", limit: 5 }, { id: "h", source: "history", last: 60, tokens: 100 }])).toEqual([]);
    expect(warned([{ id: "facts", source: "litopysFacts", limit: 61 }])[0]).toContain("is over 60, so 60 is used");
    expect(warned([{ id: "lore", source: "lorebook", limit: 0 }])[0]).toContain("whole number from 1 to 20");
    expect(warned([{ id: "lore", source: "lorebook", limit: 2.5 }])).toHaveLength(1);
    expect(warned([{ id: "h", source: "history", last: 61, tokens: 50 }])).toHaveLength(2);
    // sources with no count never warn, whatever is in the entry
    expect(warned([{ id: "r", source: "lastReply", limit: 999 }])).toEqual([]);
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
    expect(AGENT_RECIPES.map((r) => (r.agent as Json).id)).toEqual(["next-moves-ai", "pacing-nudge", "story-map", "scene-recap", "territory-board", "tension-meter"]);
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
    const withTiles = { ...rich, tiles: { type: "list", item: { x: "number", y: "number", kind: "text" }, max: 100 } };
    for (const kind of WIDGET_KINDS) {
      const panel = { id: "p", title: "P", place: "float", widgets: [newWidget(kind, withTiles)] };
      const r = check(file({ state: withTiles, panels: [panel] }));
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

  it("an html widget starts from a template that passes the checker, and changing its kind drops the template", () => {
    const w = newWidget("html", rich);
    expect(String(w.template)).toContain("{{");
    expect(templateProblems(w.template, rich)).toEqual([]);
    const bag = { bag: { type: "list", item: { name: "text", qty: "number" } } };
    expect(templateProblems(starterTemplate(bag), bag)).toEqual([]);
    expect(starterTemplate({})).toBe("<p>Hello</p>");
    const m = setWidgetKind(w, "meter", rich);
    expect(m.template).toBeUndefined();
    expect(m.height).toBeUndefined();
    expect(setWidgetKind(newWidget("meter", rich), "html", rich).w).toBe("html");
  });

  it("renaming a field renames its slots, not the entry fields of a list with the same name", () => {
    expect(renameInTemplate("{{hp}} {{#if hp}}{{hp}}{{/if}} {{#each hp}}{{hp}}{{#if hp}}x{{/if}}{{/each}} {{hp}}", "hp", "life")).toBe(
      "{{life}} {{#if life}}{{life}}{{/if}} {{#each life}}{{hp}}{{#if hp}}x{{/if}}{{/each}} {{life}}");
    expect(renameInTemplate("{{ hp }}", "hp", "life")).toBe("{{life}}");
    expect(renameInTemplate("<b>{{hpx}}</b>", "hp", "life")).toBe("<b>{{hpx}}</b>");
  });

  it("renaming a field also renames it in the templates of the panels", () => {
    const agent = { ...(tension.agent as Json), panels: [{ id: "p", title: "P", widgets: [{ w: "html", template: "<b>{{tension}}</b>{{#if tension}}!{{/if}}" }] }] };
    const g = { nodes: tension.nodes!, edges: tension.edges! } as Graph;
    const { agent: a2, graph: g2 } = renameField(agent, g, "tension", "dread");
    expect(a2.panels[0].widgets[0].template).toBe("<b>{{dread}}</b>{{#if dread}}!{{/if}}");
    expect(check(fileOf("x", a2, g2)).errors).toEqual([]);
  });

  it("exports a good agent as one checked file and refuses one with errors", () => {
    const good = exportOf(fileOf("x", tension.agent as Json, { nodes: tension.nodes!, edges: tension.edges! } as Graph));
    expect("error" in good).toBe(false);
    if ("error" in good) return;
    expect(good.name).toBe(`${(tension.agent as Json).id}.vertep-agent.json`);
    expect((good.file.agent as Json).derived.hash).toMatch(/\w+/);
    expect(check(good.file).errors).toEqual([]);
    const bad = exportOf(fileOf("x", { ...(tension.agent as Json), id: "A" }, { nodes: tension.nodes!, edges: tension.edges! } as Graph));
    expect("error" in bad).toBe(true);
  });

  it("a copy has its own id, its own name and a fresh check", () => {
    const f = fileOf("Tension", tension.agent as Json, { nodes: tension.nodes!, edges: tension.edges! } as Graph);
    const c = copyOf({ ...f, agent: { ...f.agent, derived: { stale: true } } }, ["x"], "Tension (copy)");
    expect(c.id).toBe(`${(tension.agent as Json).id}-copy`);
    expect((c.file.agent as Json).id).toBe(c.id);
    expect((c.file.agent as Json).name).toBe("Tension (copy)");
    expect(c.file.title).toBe("Tension (copy)");
    expect((c.file.agent as Json).derived).toBeUndefined();
    expect(check(c.file).errors).toEqual([]);
    expect(copyOf(f, [c.id], "n").id).toBe(`${c.id}-2`);
    expect(copyOf(c.file, [], "n").id).toBe(c.id);
  });

  it("moves an item one place and leaves the list alone at the ends", () => {
    const l = ["a", "b", "c"];
    expect(moveItem(l, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(l, 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(l, 0, -1)).toBe(l);
    expect(moveItem(l, 2, 1)).toBe(l);
    expect(l).toEqual(["a", "b", "c"]);
  });

  it("free ids stay inside the checker's length", () => {
    expect(freeId("a".repeat(60), []).length).toBe(41);
    expect(freeId("a".repeat(41), ["a".repeat(41)]).length).toBeLessThanOrEqual(41);
    expect(freeId("x", ["x", "x-2"])).toBe("x-3");
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
