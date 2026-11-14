/** #394: contact events are told apart by kind, and the sensor is told whose deed an event is. */
import { describe, expect, it } from "bun:test";

const P = (await import(new URL("../plugins/relations/plugin.js", import.meta.url).href)) as Record<string, any>;

describe("contact events and deeds (#394)", () => {
  it("a tender kiss and a hug raise no arousal; a romantic kiss still does", () => {
    const v = P.buildVocab([]);
    expect(v.tender_kiss.deltas.arousal).toBeUndefined();
    expect(v.hug.deltas.arousal).toBeUndefined();
    expect(v.kiss.deltas.arousal).toBeGreaterThan(0);
    expect(v.gentle_touch.deltas.arousal).toBeLessThanOrEqual(3);
  });

  it("the default sensor prompt says events are the user's deeds and names the kinds of kiss", () => {
    const text: string = P.DEFAULT_PROMPTS.sensor;
    expect(text).toContain("Events are only what the user's character does");
    expect(text).toContain("cheats on them");
    expect(text).toContain("\"tender_kiss\"");
    const past = P.PAST_DEFAULT_PROMPTS.sensor as string[];
    expect(past.at(-3)).not.toContain("tender_kiss");
    expect(past.at(-3)!.length).toBeLessThan(past.at(-2)!.length);
  });
});
