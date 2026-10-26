// Dashboard motion: the weather text picks an icon, a row counts as new only after the first showing,
// and the icons are drawn without a script in the page.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WeatherIcon, weatherKind } from "../src/components/dashboard/dash-weather";
import { FRESH_MS, trackFresh } from "../src/components/dashboard/dash-motion";

describe("weatherKind", () => {
  it("reads English, Ukrainian and Russian weather words", () => {
    const cases: [string, string | null][] = [
      ["light rain", "rain"],
      ["Легкий дощ", "rain"],
      ["проливной дождь", "rain"],
      ["heavy snow", "snow"],
      ["сніг із завірюхою", "snow"],
      ["thunderstorm", "storm"],
      ["гроза", "storm"],
      ["thick fog", "fog"],
      ["густий туман", "fog"],
      ["a strong wind", "wind"],
      ["сильний вітер", "wind"],
      ["partly cloudy", "partly"],
      ["мінлива хмарність", "partly"],
      ["overcast", "cloud"],
      ["похмуро", "cloud"],
      ["clear sky", "clear"],
      ["ясно, сонячно", "clear"],
      ["", null],
      ["a faint smell of smoke", null],
    ];
    for (const [text, kind] of cases) expect([text, weatherKind(text)]).toEqual([text, kind]);
  });

  it("lets rain, snow, storm and fog outrank cloud and wind, and the first named win otherwise", () => {
    expect(weatherKind("overcast, light rain")).toBe("rain");
    expect(weatherKind("clear, a light breeze")).toBe("clear");
    expect(weatherKind("a cold wind, then cloudy")).toBe("wind");
    expect(weatherKind("rain, then snow")).toBe("rain");
    expect(weatherKind(null)).toBeNull();
    expect(weatherKind(undefined)).toBeNull();
  });
});

describe("WeatherIcon", () => {
  it("draws every kind as a hidden svg tagged with its kind", () => {
    for (const kind of ["storm", "snow", "rain", "fog", "wind", "partly", "cloud", "clear"] as const) {
      const html = renderToStaticMarkup(<WeatherIcon kind={kind} />);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain(`data-weather="${kind}"`);
    }
  });

  it("draws the moon for a clear night and the sun with its rays for a clear day", () => {
    expect(renderToStaticMarkup(<WeatherIcon kind="clear" night />)).not.toContain("wx-spin");
    expect(renderToStaticMarkup(<WeatherIcon kind="clear" />)).toContain("wx-spin");
  });
});

describe("trackFresh", () => {
  it("marks nothing on the first showing", () => {
    const first = trackFresh(null, new Map(), ["a", "b"], 1000);
    expect([...first.fresh]).toEqual([]);
    expect([...first.seen].sort()).toEqual(["a", "b"]);
  });

  it("marks an id that turns up later, for FRESH_MS only", () => {
    const born = new Map<string, number>();
    const { seen } = trackFresh(null, born, ["a"], 0);
    expect([...trackFresh(seen, born, ["a", "b"], 100).fresh]).toEqual(["b"]);
    expect([...trackFresh(seen, born, ["a", "b"], 100 + FRESH_MS - 1).fresh]).toEqual(["b"]);
    expect([...trackFresh(seen, born, ["a", "b"], 100 + FRESH_MS).fresh]).toEqual([]);
  });

  it("does not mark an id that was there from the start, even when it comes back", () => {
    const born = new Map<string, number>();
    const { seen } = trackFresh(null, born, ["a", "b"], 0);
    expect([...trackFresh(seen, born, ["b"], 50).fresh]).toEqual([]);
    expect([...trackFresh(seen, born, ["a", "b"], 60).fresh]).toEqual([]);
  });
});
