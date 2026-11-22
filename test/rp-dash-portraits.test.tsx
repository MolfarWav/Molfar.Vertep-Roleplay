// Everyone in the scene has a portrait in the Dashboard's top row, also the fifth and later whose block is compact (#236):
// `compact` trims what the prompt insert says about them, it is not a reason to hide them from the user.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashChar, DashView } from "../src/lib/dashboard";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { DashTop } = await import("../src/components/dashboard/dash-tabs");

const stats = { trust: 0, comfort: 0, attraction: 0, respect: 0, affection: 0 };
const char = (compact: boolean): DashChar =>
  ({
    cls: "neutral", stats, pulse: { excitement: 0, arousal: 0 }, hostility: null, constellation: "strangers", prevConstellation: null,
    mood: null, moodWas: null, condition: null, outfit: null, holding: null, goal: null, leads: null, blindSpot: null, compact, pronouns: null,
    rated: true, pulseBase: { excitement: 0, arousal: 0 }, prev: null, notebook: [], name: null, history: [], series: [],
  }) as unknown as DashChar;
const names = ["Aria", "Bram", "Cleo", "Dara", "Elin"];
const view = (present: string[]): DashView =>
  ({
    key: "k", turn: 5, at: 0, op: null, partial: false, sensorModel: "", stale: false, clock: null, present, order: names,
    events: [], threads: [], edges: [], chars: Object.fromEntries(names.map((n, i) => [n, char(i >= 4)])),
    usage: { calls: 0, inTokens: 0, outTokens: 0, lastMs: 0 }, lastError: null, insert: null, insertEnabled: true, mode: "sensor",
  }) as unknown as DashView;

const render = (present: string[], awayNames?: string[]) =>
  renderToStaticMarkup(<DashTop view={view(present)} here={null} focus="Aria" onFocus={() => {}} avatars={{}} weatherSize={16} onTab={() => {}} awayNames={awayNames} />);

describe("DashTop portraits", () => {
  it("shows a portrait for each of five characters present, the compact fifth too", () => {
    const html = render(names);
    for (const n of names) expect(html).toContain(n);
    expect((html.match(/<button/g) ?? []).length).toBe(5);
  });

  it("does not show a character who is not in the scene", () => {
    const html = render(["Aria", "Bram"]);
    expect((html.match(/<button/g) ?? []).length).toBe(2);
    expect(html).not.toContain("Elin");
  });
});

// #499: the director says who is not in the scene; the Dashboard fades those portraits and says so in a line.
describe("DashTop and the director's away list (#499)", () => {
  const { useDirectionAway, isDirectorAway } = require("../src/lib/direction") as typeof import("../src/lib/direction");
  const { publishAway } = require("../src/lib/direction-ui") as typeof import("../src/lib/direction-ui");
  const state = (source: "director" | "lock" | "dashboard" | "none", present: string[]) =>
    ({ scene: { source, present, tag: null }, members: [{ id: "a", name: "Aria" }, { id: "b", name: "Bram" }, { id: "c", name: "Cleo" }] }) as never;

  it("matches a Dashboard name to a member name ignoring case and punctuation, and nothing else", () => {
    expect(isDirectorAway(["Koharu - Best Friends, Maybe More?"], "koharu — best friends maybe more")).toBe(true);
    expect(isDirectorAway(["Koharu"], "Koharu Sato")).toBe(false);
    expect(isDirectorAway([], "Aria")).toBe(false);
    expect(isDirectorAway(["Aria"], "")).toBe(false);
  });

  it("publishes the members out of the scene only from a director's report or a lock", () => {
    publishAway(state("director", ["a"]));
    expect(useDirectionAway.getState().names).toEqual(["Bram", "Cleo"]);
    publishAway(state("lock", ["a", "b"]));
    expect(useDirectionAway.getState().names).toEqual(["Cleo"]);
    publishAway(state("dashboard", ["a"]));
    expect(useDirectionAway.getState().names).toEqual([]);
    publishAway(state("none", []));
    expect(useDirectionAway.getState().names).toEqual([]);
    publishAway(null);
    expect(useDirectionAway.getState().names).toEqual([]);
  });

  it("fades the portrait of a person the director says is away and names them in a line; nobody away, no line", () => {
    const html = render(["Aria", "Bram", "Cleo"], ["Bram"]);
    expect(html).toContain('data-testid="dash-director-away"');
    expect(html).toContain("The director says not in the scene: Bram");
    expect((html.match(/grayscale/g) ?? []).length).toBeGreaterThan(0);
    expect(html).toContain("Bram (not in the scene)");
    expect(html).not.toContain("Aria (not in the scene)");
    const clear = render(["Aria", "Bram", "Cleo"], []);
    expect(clear).not.toContain("dash-director-away");
    expect(clear).not.toContain("grayscale");
  });
});
