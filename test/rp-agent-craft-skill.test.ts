/**
 * The recipes the agent-craft skill hands to Molfar (.skills/agent-craft/references): each must pass the checker
 * with no error and no warning, and do what the skill says it does. A format change that breaks a recipe fails here,
 * so the skill cannot drift behind the format.
 */
import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import { compileAgent, templateProblems } from "../src/canvas-kit/boards/agent-check.js";
import * as run from "../src/canvas-kit/boards/agent-run.js";
import { drawTemplate } from "../src/lib/agent-template";

type Json = Record<string, any>;
const dir = new URL("../.skills/agent-craft/references/", import.meta.url);
const load = (name: string): Json => JSON.parse(fs.readFileSync(new URL(name, dir), "utf8"));
const same = (x: unknown) => JSON.parse(JSON.stringify(x));
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".vertep-agent.json")).sort();

describe("agent-craft recipes", () => {
  it("there are the six the skill names", () => {
    expect(files).toEqual(["recipe-choices.vertep-agent.json", "recipe-hint.vertep-agent.json", "recipe-map.vertep-agent.json", "recipe-note.vertep-agent.json", "recipe-territory.vertep-agent.json", "recipe-tracker.vertep-agent.json"]);
    const skill = fs.readFileSync(new URL("../SKILL.md", dir), "utf8");
    for (const f of files) expect(skill).toContain(f);
  });

  it("tells Molfar to say so when the cards cannot do the job, not to invent one", () => {
    const skill = fs.readFileSync(new URL("../SKILL.md", dir), "utf8");
    expect(skill).toContain("Say so when the cards cannot do it");
    expect(skill).toContain("Never invent a card type");
  });

  it("knows the html widget is drawn, and its example template passes the check", () => {
    const skill = fs.readFileSync(new URL("../SKILL.md", dir), "utf8");
    const cards = fs.readFileSync(new URL("cards.md", dir), "utf8");
    expect(`${skill}${cards}`).not.toMatch(/`html` is not drawn yet|`html` and grid widgets are not drawn/);
    expect(cards).toContain("E_TPL_FORBIDDEN");
    const example = /<b>Tension \{\{tension\}\}<\/b>[^`]*/.exec(cards)?.[0];
    expect(example).toBeTruthy();
    const schema = { tension: { type: "number" }, events: { type: "list", item: { name: "text" } } };
    expect(templateProblems(example, schema)).toEqual([]);
    // what the page says is refused really is refused
    for (const bad of ["<script>1</script>", '<img src="x">', '<a href="y">z</a>', '<div onclick="1">z</div>', "<style>@import 'x';</style>", "<div style=\"background:url(x)\">z</div>"]) {
      expect(templateProblems(bad, schema).map((p: Json) => p.code)).toContain("E_TPL_FORBIDDEN");
    }
  });

  it.each(files)("%s passes the checker clean and compiles without help", (f) => {
    const r = compileAgent(load(f)) as Json;
    expect(r.error).toBeUndefined();
    expect(r.report.errors).toEqual([]);
    expect(r.report.warnings).toEqual([]);
    expect(r.report.derived.maxCalls).toBeLessThanOrEqual(r.file.agent.limits.maxCalls);
  });

  const ctx = { inputs: { reply: "The door bursts open." } };
  const answer = (f: string, text: string, own?: Json) => same(run.runAgent(load(f), { ...ctx, ...(own ? { own } : {}) }, { ask: { text } }));

  it("recipe-note: the model's sentence becomes a note", () => {
    const res = answer("recipe-note.vertep-agent.json", "A door bursts open.");
    expect(res.outputs).toEqual([expect.objectContaining({ kind: "note", title: "Recap", text: "A door bursts open." })]);
  });

  it("recipe-choices: one line, one choice", () => {
    const res = answer("recipe-choices.vertep-agent.json", "Run\nHide\nFight back");
    expect(res.outputs).toEqual([expect.objectContaining({ kind: "choices", choices: ["Run", "Hide", "Fight back"], show: "bottom" })]);
  });

  it("recipe-hint: the sentence is a prompt insert", () => {
    const res = answer("recipe-hint.vertep-agent.json", "Let the stranger speak first.");
    expect(res.outputs).toEqual([expect.objectContaining({ kind: "prompt-insert", text: "Let the stranger speak first.", label: "Pacing nudge" })]);
  });

  describe("recipe-tracker: the code counts, the model only names the mood", () => {
    const tracker = load("recipe-tracker.vertep-agent.json");
    const play = (tension: number, mood: string) => {
      const res = same(run.runAgent(tracker, { ...ctx, own: { tension } }, { ask: { text: `{"mood": "${mood}"}` } }));
      return { res, after: same(run.applyWrites(tracker.agent.state, { tension }, res.writes ?? [])).own.tension };
    };
    it("danger adds 2", () => expect(play(3, "danger").after).toBe(5));
    it("calm takes 1", () => expect(play(3, "calm").after).toBe(2));
    it("tense changes nothing", () => expect(play(3, "tense").res.writes).toEqual([]));
    it("stays inside 0 to 10", () => {
      expect(play(9, "danger").after).toBe(10);
      expect(play(0, "calm").after).toBe(0);
    });
  });

  describe("recipe-map: the code decides what is a new place, the model only names it", () => {
    const map = load("recipe-map.vertep-agent.json");
    const play = (known: string, places: Json[], answer: Json) => {
      const own = { known, places };
      const res = same(run.runAgent(map, { ...ctx, own }, { ask: { text: JSON.stringify(answer) } }));
      return { res, after: same(run.applyWrites(map.agent.state, own, res.writes ?? [])).own };
    };
    it("a place that is not on the map yet is added with its spot, and its name is remembered", () => {
      const { after } = play("(none yet)", [], { place: "Harbor", x: 20, y: 70 });
      expect(after.places).toEqual([{ name: "Harbor", x: 20, y: 70 }]);
      expect(after.known).toBe("(none yet); Harbor");
      expect(after.here).toBe("Harbor");
    });
    it("a place already on the map is not added twice, whatever case the model writes", () => {
      const places = [{ name: "Harbor", x: 20, y: 70 }];
      const { after } = play("(none yet); Harbor", places, { place: "harbor", x: 55, y: 10 });
      expect(after.places).toEqual(places);
      expect(after.here).toBe("harbor");
    });
    it("a spot outside the map is not drawn", () => {
      expect(play("(none yet)", [], { place: "Moon", x: 400, y: 10 }).after.places).toEqual([]);
      expect(play("(none yet)", [], { place: "Moon", x: 10, y: -5 }).after.places).toEqual([]);
    });
    it("the map fits the template and the template draws every place, escaped", () => {
      const w = map.agent.panels[0].widgets[0];
      expect(w.w).toBe("html");
      const drawn = drawTemplate(w.template, map.agent.state, { places: [{ name: "<b>Keep</b>", x: 60, y: 30 }], here: "Keep" });
      expect("html" in drawn && drawn.html).toContain('cx="60" cy="30"');
      expect("html" in drawn && drawn.html).toContain("&lt;b&gt;Keep&lt;/b&gt;");
      expect("html" in drawn && drawn.html).toContain("Now: <b>Keep</b>");
    });
  });

  describe("recipe-territory: a tile changes only when it is on the board", () => {
    const board = load("recipe-territory.vertep-agent.json");
    const play = (answer: Json) => same(run.runAgent(board, { ...ctx, own: { tiles: [] } }, { ask: { text: JSON.stringify(answer) } })).writes ?? [];
    it("a tile on the board is written", () => {
      expect(play({ kind: "claimed", x: 3, y: 4 })).toEqual([expect.objectContaining({ op: "list.add", field: "tiles", item: { x: 3, y: 4, kind: "claimed" } })]);
    });
    it("none, a column or a row off the board change nothing", () => {
      expect(play({ kind: "none", x: 3, y: 4 })).toEqual([]);
      expect(play({ kind: "danger", x: 9, y: 4 })).toEqual([]);
      expect(play({ kind: "danger", x: 3, y: 7 })).toEqual([]);
      expect(play({ kind: "danger", x: 0, y: 1 })).toEqual([]);
    });
    it("its legend names the kinds the model may answer with", () => {
      const asked = board.nodes.find((n: Json) => n.id === "ask").params.answer.shape.kind.replace("enum:", "").split("|").filter((k: string) => k !== "none");
      expect(board.agent.panels[0].widgets[0].legend.map((l: Json) => l.value).sort()).toEqual(asked.sort());
    });
  });
});
