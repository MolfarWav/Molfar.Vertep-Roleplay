// The "Current setup" chips of the Dashboard's Sensor settings (src/components/dashboard/sensor-summary.ts), and the
// i18n strings those chips and card headers use. Pure: a fake `t` returns the key and its vars, so a test checks which
// key each chip asks for and which numbers it passes.
import { describe, expect, it } from "bun:test";
import {
  groupsChip,
  howChips,
  insertChip,
  questsChip,
  remindedChips,
  summaryChips,
  type SensorSummaryInput,
  type T,
} from "../src/components/dashboard/sensor-summary";
import { DICTIONARIES, type MsgKey } from "../src/lib/i18n";

const t = ((key: string, vars?: Record<string, unknown>) => (vars ? key + ":" + JSON.stringify(vars) : key)) as unknown as T;

const base: SensorSummaryInput = {
  mode: "sensor",
  sensorModel: "",
  insertOn: true,
  insertTokens: 80,
  saidOn: true,
  groupsOn: 7,
  groupsTotal: 7,
  hasQuests: true,
  maxMain: 2,
  maxThreads: 4,
};

describe("insertChip", () => {
  it("insert on: dash.set.chip.insertOn with the token count", () => {
    expect(insertChip(t, { insertOn: true, insertTokens: 80 })).toBe('dash.set.chip.insertOn:{"n":80}');
  });

  it("insert off: dash.set.chip.insertOff, with no count", () => {
    expect(insertChip(t, { insertOn: false, insertTokens: 80 })).toBe("dash.set.chip.insertOff");
  });
});

describe("groupsChip", () => {
  it("passes the groups on and the total", () => {
    expect(groupsChip(t, { groupsOn: 5, groupsTotal: 7 })).toBe('dash.set.chip.groups:{"n":5,"total":7}');
  });
});

describe("questsChip", () => {
  it("is null when the plugin has no quest limits", () => {
    expect(questsChip(t, { hasQuests: false, maxMain: 2, maxThreads: 4 })).toBeNull();
  });

  it("has main and side counts when the plugin offers quests", () => {
    expect(questsChip(t, { hasQuests: true, maxMain: 2, maxThreads: 4 })).toBe('dash.set.chip.quests:{"main":2,"side":4}');
  });
});

describe("summaryChips", () => {
  it("lists mode, model, insert, groups, then quests, each with its tone", () => {
    const chips = summaryChips(t, base);
    expect(chips.map((c) => c.text)).toEqual([
      "dash.set.mode.sensor",
      "dash.set.chatModel",
      'dash.set.chip.insertOn:{"n":80}',
      'dash.set.chip.groups:{"n":7,"total":7}',
      'dash.set.chip.quests:{"main":2,"side":4}',
    ]);
    expect(chips.map((c) => c.tone)).toEqual(["sky", "sky", "violet", "teal", "pink"]);
  });

  it("has no quests chip when hasQuests is false", () => {
    const chips = summaryChips(t, { ...base, hasQuests: false });
    expect(chips).toHaveLength(4);
    expect(chips.map((c) => c.text)).not.toContain("dash.set.chip.quests:{\"main\":2,\"side\":4}");
    expect(chips[chips.length - 1]?.text).toBe('dash.set.chip.groups:{"n":7,"total":7}');
  });

  it("an empty sensor model falls back to dash.set.chatModel", () => {
    expect(summaryChips(t, { ...base, sensorModel: "" })[1]?.text).toBe("dash.set.chatModel");
  });

  it("a set sensor model is shown as it is", () => {
    expect(summaryChips(t, { ...base, sensorModel: "my-sensor" })[1]?.text).toBe("my-sensor");
  });
});

describe("howChips and remindedChips", () => {
  it("howChips is the mode chip only", () => {
    expect(howChips(t, { mode: "fast" })).toEqual(["dash.set.mode.fast"]);
  });

  it("remindedChips is the insert chip then the groups chip", () => {
    expect(remindedChips(t, { insertOn: true, insertTokens: 80, groupsOn: 5, groupsTotal: 7 })).toEqual([
      'dash.set.chip.insertOn:{"n":80}',
      'dash.set.chip.groups:{"n":5,"total":7}',
    ]);
  });
});

const KEYS: MsgKey[] = [
  "dash.set.card.how",
  "dash.set.card.reminded",
  "dash.set.card.quests",
  "dash.set.summary",
  "dash.set.chip.insertOn",
  "dash.set.chip.insertOff",
  "dash.set.chip.groups",
  "dash.set.chip.quests",
  "dash.set.hint.never",
  "dash.set.hint.noteAge",
  "dash.set.hint.said",
  "dash.set.hint.mainQuests",
  "dash.set.hint.sideQuests",
  "dash.set.hint.sensorTokens",
  "dash.set.prompts.sum",
  "dash.set.prompts.sumChanged",
];

const placeholders = (s: string): string[] => s.match(/\{\w+\}/g) ?? [];

describe("i18n parity for the sensor settings strings", () => {
  for (const key of KEYS) {
    it(`${key} has a non-empty English and Ukrainian string`, () => {
      expect(DICTIONARIES.en[key].length, `en ${key}`).toBeGreaterThan(0);
      expect(DICTIONARIES.uk[key].length, `uk ${key}`).toBeGreaterThan(0);
    });
  }

  it("the placeholders of the English strings ({n}, {total}, {main}, {side}, {c}) also appear in the Ukrainian ones", () => {
    const wanted = new Set(["{n}", "{total}", "{main}", "{side}", "{c}"]);
    const seen = new Set<string>();
    for (const key of KEYS) {
      for (const ph of placeholders(DICTIONARIES.en[key])) {
        if (!wanted.has(ph)) continue;
        seen.add(ph);
        expect(DICTIONARIES.uk[key], `${key} uk is missing ${ph}`).toContain(ph);
      }
    }
    // the chip keys use n, total, main and side; {c} is in prompts.sumChanged. Each must be seen at least once.
    expect([...seen].sort()).toEqual(["{c}", "{main}", "{n}", "{side}", "{total}"]);
  });

  it("the chip keys' placeholders match between English and Ukrainian", () => {
    for (const key of ["dash.set.chip.insertOn", "dash.set.chip.groups", "dash.set.chip.quests"] as MsgKey[]) {
      expect(placeholders(DICTIONARIES.uk[key]).sort(), key).toEqual(placeholders(DICTIONARIES.en[key]).sort());
    }
  });
});
