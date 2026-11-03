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

const render = (present: string[]) =>
  renderToStaticMarkup(<DashTop view={view(present)} here={null} focus="Aria" onFocus={() => {}} avatars={{}} weatherSize={16} onTab={() => {}} />);

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
