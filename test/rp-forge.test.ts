/** The agent editor's model (src/lib/forge.ts): an edit stays tidy and the checker stays the judge. */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { blankAgent, check, defaultParams, fileOf, issuesByNode, newCard, nextNodeId, prune, roomy, cardHeight, setCard, setWire, tidyHeader, wireChoices, CARD_ORDER } from "../src/lib/forge";
import { generated } from "../scripts/sync-agent-recipes";
import { AGENT_RECIPES } from "../src/lib/forge-recipes";
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
