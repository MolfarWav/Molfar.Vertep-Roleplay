import { describe, expect, it } from "bun:test";
import { splitDirections } from "../src/lib/stage-directions";
import { spanText, timeSkipDirection } from "../src/lib/time-skip";

describe("skip time", () => {
  it("words the span with a singular or a plural unit", () => {
    expect(spanText(1, "hour")).toBe("1 hour");
    expect(spanText(3, "day")).toBe("3 days");
    expect(spanText(2.9, "week")).toBe("2 weeks");
    expect(spanText(5000, "year")).toBe("999 years");
  });
  it("has no span for zero, a negative or a missing number", () => {
    expect(spanText(0, "day")).toBe("");
    expect(spanText(-2, "day")).toBe("");
    expect(spanText(Number.NaN, "day")).toBe("");
  });
  it("is one stage direction the engine cuts out whole", () => {
    const d = timeSkipDirection(3, "day", "");
    expect(d).toStartWith("[[Time skip: 3 days.");
    const { text, directions } = splitDirections(d as string);
    expect(directions).toHaveLength(1);
    expect(text).toBe("");
  });
  it("adds the note after the span", () => {
    expect(timeSkipDirection(2, "hour", "The train arrives!")).toContain("Time skip: 2 hours. The train arrives.");
  });
  it("lets a note alone say the span", () => {
    const d = timeSkipDirection(0, "hour", "until the morning");
    expect(d).toStartWith("[[Time skip: until the morning.");
    expect(d?.match(/until the morning/g)).toHaveLength(1);
  });
  it("is nothing without a number or a note", () => {
    expect(timeSkipDirection(0, "day", "   ")).toBeNull();
  });
  it("keeps the note from closing the direction early", () => {
    const d = timeSkipDirection(1, "day", "a]] b [[c");
    expect(splitDirections(d as string).directions).toHaveLength(1);
    expect(d).not.toContain("]] b");
  });
});
