import { describe, expect, it } from "bun:test";
import example from "./fixtures/mood-tracker.vertep-agent.json";
import keeperExample from "./fixtures/dungeon-keeper.vertep-agent.json";
import { AGENT_BOARD, agentHash, compileAgent, validateAgent } from "../src/canvas-kit/boards/agent";
import { canConnect, fromFile, insertOnEdge, portOf, portsOfNode, toFile } from "../src/canvas-kit/graph";
import type { CanvasFile, Graph } from "../src/canvas-kit/graph";

type Json = Record<string, any>;
const copy = (): Json => JSON.parse(JSON.stringify(example));
const node = (f: Json, id: string): Json => f.nodes.find((n: Json) => n.id === id);

const codes = (r: Awaited<ReturnType<typeof validateAgent>>) => [...r.errors, ...r.warnings].map((x) => x.code);

describe("agent file: the example is valid", () => {
  it("passes with no errors and no warnings", async () => {
    const r = await validateAgent(copy());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.derived?.needs).toEqual(["llm", "read:lastReply", "read:state.mood", "write:state.mood"]);
    expect(r.derived?.maxCalls).toBe(1);
  });

  it("computes the same hash the format reference computed", async () => {
    const f = fromFile(copy());
    expect("file" in f).toBe(true);
    if ("file" in f) expect(await agentHash(f.file)).toBe((example as Json).agent.derived.hash);
  });
});

// each broken copy of the example must raise the named code
const cases: [string, (f: Json) => Json, string | null][] = [
  ["clean file", (f) => f, null],
  ["type mismatch (text into signal)", (f) => { f.edges.find((e: Json) => e.id === "e4").to = "save:when"; f.edges = f.edges.filter((e: Json) => e.id !== "e5c"); return f; }, "E_TYPE"],
  ["two wires into one input", (f) => { f.edges.push({ id: "x", from: "ask:mood", to: "chg:new" }); return f; }, "E_TWO_WIRES"],
  ["unwired required input", (f) => { f.edges = f.edges.filter((e: Json) => e.id !== "e3"); return f; }, "E_UNWIRED"],
  ["loop", (f) => { node(f, "any").params.count = 3; f.edges.push({ id: "x", from: "save:done", to: "any:i3" }, { id: "y", from: "any:out", to: "chg:new" }); f.edges = f.edges.filter((e: Json) => e.id !== "e2"); return f; }, "E_CYCLE"],
  ["file lies about needs", (f) => { f.agent.derived.needs = ["llm"]; return f; }, "E_NEEDS_MISMATCH"],
  ["file lies about calls", (f) => { f.agent.derived.maxCalls = 0; return f; }, "E_CALLS_MISMATCH"],
  ["edited after compile", (f) => { node(f, "ask").params.maxTokens = 999; return f; }, "E_HASH"],
  ["moving a card is fine", (f) => { node(f, "ask").x = 999; return f; }, null],
  ["undeclared model role", (f) => { node(f, "ask").params.role = "main"; return f; }, "E_ROLE"],
  ["colon in a port id", (f) => { node(f, "in").params.give[0].id = "last:reply"; return f; }, "E_PORT_ID"],
  ["budget below real calls", (f) => { f.agent.limits.maxCalls = 0; return f; }, "E_BUDGET"],
  ["operator not for the type", (f) => { node(f, "chg").params.rows[0].op = "gt"; return f; }, "E_IF_OP"],
  ["no rules in If", (f) => { node(f, "chg").params.rows = []; return f; }, "E_IF_EMPTY"],
  ["parallel agent with a prompt insert", (f) => { f.agent.trigger.when = "parallel"; node(f, "out").params.kind = "prompt-insert"; node(f, "out").params.position = "after-history"; return f; }, "E_PARALLEL_INSERT"],
  ["show place not allowed for the kind", (f) => { node(f, "out").params.show = "bottom"; return f; }, "E_SHOW_NOT_ALLOWED"],
  ["note output wants text, not a signal", (f) => { node(f, "out").params.kind = "note"; return f; }, "E_TYPE"],
  ["an allowed show place passes (only the hash goes stale)", (f) => { node(f, "out").params.show = "top1"; return f; }, "E_HASH"],
  ["two Input cards", (f) => { f.nodes.push({ id: "in2", type: "agent.input", x: 0, y: 0, title: "Input 2", params: { give: [] } }); return f; }, "E_INPUT_COUNT"],
  ["unknown card type is kept as a warning", (f) => { f.nodes.push({ id: "z", type: "future.thing", x: 0, y: 0, title: "Z" }); return f; }, "W_UNKNOWN_TYPE"],
];

describe("agent file: mutations", () => {
  for (const [name, mutate, want] of cases) {
    it(name, async () => {
      const r = await validateAgent(mutate(copy()));
      if (want) expect(codes(r)).toContain(want);
      else expect(r.errors).toEqual([]);
    });
  }

  it("a file of another kind or version is refused at the envelope", async () => {
    expect(codes(await validateAgent({ ...copy(), kind: "chat-links" }))).toEqual(["E_ENVELOPE"]);
    expect(codes(await validateAgent({ ...copy(), version: 2 }))).toEqual(["E_ENVELOPE"]);
    expect(codes(await validateAgent(null))).toEqual(["E_ENVELOPE"]);
  });
});

describe("compileAgent", () => {
  it("fills derived so a freshly edited file validates clean", async () => {
    const f = copy();
    node(f, "ask").params.maxTokens = 999;
    delete f.agent.derived;
    const res = await compileAgent(f);
    expect("file" in res).toBe(true);
    if ("file" in res) {
      expect(res.report.errors).toEqual([]);
      expect((res.file.agent as Json).derived.hash).not.toBe((example as Json).agent.derived.hash);
    }
  });
  it("does not hide real errors", async () => {
    const f = copy();
    f.edges = f.edges.filter((e: Json) => e.id !== "e3");
    const res = await compileAgent(f);
    expect("file" in res && res.report.errors.map((e) => e.code)).toContain("E_UNWIRED");
  });
});

describe("canvas kit: agent header and derived ports", () => {
  it("fromFile keeps the agent header and toFile writes it back", () => {
    const res = fromFile(copy());
    expect("file" in res).toBe(true);
    if (!("file" in res)) return;
    expect((res.file.agent as Json).id).toBe("mood-tracker");
    const g: Graph = { nodes: res.file.nodes, edges: res.file.edges };
    const out: CanvasFile = toFile("agent", res.file.title, g, { agent: res.file.agent });
    expect(out.agent).toEqual(res.file.agent);
    expect(toFile("chat-links", "t", g).agent).toBeUndefined();
  });

  it("a header that is not an object is dropped", () => {
    const res = fromFile({ ...copy(), agent: "nope" });
    expect("file" in res && res.file.agent).toBeUndefined();
  });

  it("ports come from the card's params", () => {
    const g: Graph = { nodes: copy().nodes, edges: copy().edges };
    expect(portsOfNode(AGENT_BOARD, node(g as never, "ask") as never)?.map((p) => p.id)).toEqual(["lastReply", "mood"]);
    expect(portOf(AGENT_BOARD, g, "ask:mood")?.type).toBe("text");
    expect(portOf(AGENT_BOARD, g, "chg:yes")?.type).toBe("signal");
    expect(portOf(AGENT_BOARD, g, "ask:nope")).toBeNull();
  });

  it("canConnect applies the same wiring rules as the checker", () => {
    const g: Graph = { nodes: copy().nodes, edges: copy().edges };
    expect(canConnect(AGENT_BOARD, g, "ask:mood", "save:when").ok).toBe(false); // text into signal
    const again = canConnect(AGENT_BOARD, g, "in:oldMood", "chg:new");
    expect(again.ok).toBe(true); // a second wire into an input replaces the first
    if (again.ok) expect(again.replaces).toEqual(["e2"]);
    const loop = canConnect(AGENT_BOARD, g, "save:done", "any:i1");
    expect(loop.ok).toBe(false);
  });

  it("insertOnEdge finds matching ports on a derived-port card", () => {
    const g: Graph = { nodes: [...copy().nodes, { id: "tpl", type: "text.template", x: 0, y: 0, title: "T", params: { text: "{{a}}" } }], edges: copy().edges };
    const r = insertOnEdge(AGENT_BOARD, g, "e1", "tpl");
    expect(r.ok).toBe(true);
  });
});

// ---- own state and panels (dungeon-keeper) ----
const keeper = (): Json => JSON.parse(JSON.stringify(keeperExample));
const panel = (f: Json): Json => f.agent.panels[0];
const list = (extra: Json = {}): Json => ({ id: "ls", type: "state.list", x: 0, y: 0, title: "List", params: { field: "rooms", op: "add", item: { name: "text", level: "number" }, ...extra } });

const keeperCases: [string, (f: Json) => Json, string | null][] = [
  ["the example passes", (f) => f, null],
  ["a field the schema does not have", (f) => { node(f, "pay").params.field = "gold"; return f; }, "E_STATE_UNKNOWN"],
  ["adding to a field that is not a number", (f) => { f.agent.state.mana = { type: "text" }; return f; }, "E_STATE_TYPE"],
  ["reading with the wrong type", (f) => { node(f, "mana").params.as = "text"; return f; }, "E_STATE_TYPE"],
  ["reading a list straight into a wire", (f) => { node(f, "mana").params = { field: "rooms", as: "text" }; return f; }, "E_STATE_TYPE"],
  ["state.add with neither a wire nor an amount", (f) => { delete node(f, "pay").params.amount; return f; }, "E_UNWIRED"],
  ["list without max", (f) => { delete f.agent.state.rooms.max; return f; }, "E_STATE_LIMIT"],
  ["list with max over 500", (f) => { f.agent.state.rooms.max = 501; return f; }, "E_STATE_LIMIT"],
  ["list entry with a bad type", (f) => { f.agent.state.rooms.item.name = "color"; return f; }, "E_STATE_FIELD"],
  ["number with min above max", (f) => { f.agent.state.mana.min = 200; return f; }, "E_STATE_FIELD"],
  ["start outside the range", (f) => { f.agent.state.mana.start = 500; return f; }, "E_STATE_FIELD"],
  ["state field name with a space", (f) => { f.agent.state["bad name"] = { type: "flag" }; return f; }, "E_STATE_FIELD"],
  ["state.list that does not match the schema", (f) => { f.nodes.push(list({ item: { name: "text" } })); return f; }, "E_STATE_TYPE"],
  ["state.list with an unknown op", (f) => { f.nodes.push(list({ op: "wipe" })); return f; }, "E_STATE_OP"],
  ["state.list update/remove needs a key from the entry", (f) => { f.nodes.push(list({ op: "remove", key: "nope" })); return f; }, "E_STATE_TYPE"],
  ["meter bound to a list", (f) => { panel(f).widgets[0].bind = "rooms"; return f; }, "E_BIND"],
  ["bind to a field that is not there", (f) => { panel(f).widgets[0].bind = "gold"; return f; }, "E_BIND"],
  ["table column that is not in the entry", (f) => { panel(f).widgets[1].columns = ["name", "size"]; return f; }, "E_BIND"],
  ["unknown widget", (f) => { panel(f).widgets.push({ w: "gauge", bind: "mana" }); return f; }, "E_WIDGET"],
  ["actions without a send text", (f) => { panel(f).widgets[2].items[0].send = ""; return f; }, "E_WIDGET"],
  ["panel place that is not allowed", (f) => { panel(f).place = "bottom"; return f; }, "E_PANEL"],
  ["five panels", (f) => { f.agent.panels = Array.from({ length: 5 }, (_, i) => ({ ...panel(f), id: `p${i}` })); return f; }, "E_PANEL"],
  ["two panels with one id", (f) => { f.agent.panels.push({ ...panel(f) }); return f; }, "E_PANEL"],
  ["file lies about show:panel", (f) => { f.agent.derived.needs = f.agent.derived.needs.filter((t: string) => t !== "show:panel"); return f; }, "E_NEEDS_MISMATCH"],
];

describe("agent file: own state, state cards and panels", () => {
  it("the example needs read:own, write:own and show:panel", async () => {
    const r = await validateAgent(keeper());
    expect(r.errors).toEqual([]);
    expect(r.derived?.needs).toEqual(["llm", "read:lastUserMessage", "read:own.mana", "show:panel", "write:own.mana"]);
  });
  for (const [name, mutate, want] of keeperCases) {
    it(name, async () => {
      const r = await validateAgent(mutate(keeper()));
      if (want) expect(codes(r)).toContain(want);
      else expect(r.errors).toEqual([]);
    });
  }
  it("state cards derive their ports from params", () => {
    const g = (n: Json): never => n as never;
    expect(portsOfNode(AGENT_BOARD, g(list()))?.map((p) => `${p.id}:${p.type}`)).toEqual(["name:text", "level:number", "when:signal", "done:signal"]);
    expect(portsOfNode(AGENT_BOARD, g(list({ op: "remove", key: "level" })))?.map((p) => `${p.id}:${p.type}`)).toEqual(["key:number", "when:signal", "done:signal"]);
    const add = keeper().nodes.find((n: Json) => n.id === "pay");
    expect(portsOfNode(AGENT_BOARD, g(add))?.find((p) => p.id === "by")?.optional).toBe(true);
  });
  it("a state file is hashed with its state and panels (editing a panel makes the hash stale)", async () => {
    const f = keeper();
    panel(f).title = "Other";
    expect(codes(await validateAgent(f))).toEqual(["E_HASH"]);
  });
});

// html widget: the template is checked at save time, and an invalid one is never rendered
const tpl = (t: string) => (f: Json) => { panel(f).widgets.push({ w: "html", label: "Card", template: t }); return f; };
const tplCases: [string, string, string | null][] = [
  ["slots, each and if over real fields", "<b>{{mana}}</b>{{#each rooms}}<i>{{name}} {{level}}</i>{{/each}}", "E_HASH"], // valid; only the hash is stale
  ["a slot that is not in the state", "{{gold}}", "E_TPL_FIELD"],
  ["an entry field used outside each", "{{name}}", "E_TPL_FIELD"],
  ["a list printed as a value", "{{rooms}}", "E_TPL_FIELD"],
  ["each over a number", "{{#each mana}}x{{/each}}", "E_TPL_FIELD"],
  ["each inside each", "{{#each rooms}}{{#each rooms}}x{{/each}}{{/each}}", "E_TPL_FIELD"],
  ["each that is never closed", "{{#each rooms}}x", "E_TPL_UNCLOSED"],
  ["a close without an open", "x{{/if}}", "E_TPL_UNCLOSED"],
  ["crossed close", "{{#each rooms}}{{#if level}}x{{/each}}{{/if}}", "E_TPL_UNCLOSED"],
  ["a script tag", "<script>1</script>", "E_TPL_FORBIDDEN"],
  ["an iframe", "<IFRAME src=x>", "E_TPL_FORBIDDEN"],
  ["an event handler", "<b onclick=\"x()\">a</b>", "E_TPL_FORBIDDEN"],
  ["an event handler without quotes", "<img onerror=x>", "E_TPL_FORBIDDEN"],
  ["an outside image", "<img src=\"https://a.example/x.png\">", "E_TPL_FORBIDDEN"],
  ["a link", "<a href=\"javascript:1\">x</a>", "E_TPL_FORBIDDEN"],
  ["css url()", "<div style=\"background:url(x)\">a</div>", "E_TPL_FORBIDDEN"],
  ["css @import", "<style>@import 'x';</style>", "E_TPL_FORBIDDEN"],
  ["prose like \"online = fun\" is refused too: the check is deliberately loose, a tag cannot hide a handler behind a > in a value", "<p>go online = fun</p>", "E_TPL_FORBIDDEN"],
];

describe("agent file: html widget template", () => {
  for (const [name, t, want] of tplCases) {
    it(name, async () => {
      const got = codes(await validateAgent(tpl(t)(keeper())));
      if (want === "E_HASH") expect(got.filter((c) => c.startsWith("E_TPL"))).toEqual([]); // valid template: nothing but the stale hash
      expect(got).toContain(want!);
    });
  }
  it("a template over 8192 characters is refused", async () => {
    expect(codes(await validateAgent(tpl("a".repeat(8193))(keeper())))).toContain("E_WIDGET");
  });
});
