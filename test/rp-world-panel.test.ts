// The World DM panel's summaries (chips and fold summaries): pure strings, checked in English and Ukrainian with the real t.
import { describe, expect, it } from "bun:test";
import { t as translate, type Lang, type MsgKey, type Vars } from "../src/lib/i18n";
import { addsChips, diceSummary, limitsSummary, rollsSummary, scheduleChips, writesChips, type T } from "../src/components/world/world-summaries";

const bind = (lang: Lang): T => (key: MsgKey, vars?: Vars) => translate(key, lang, vars);
const en = bind("en");
const uk = bind("uk");

describe("scheduleChips", () => {
  it("English: the cadence and the next run, singular and plural", () => {
    expect(scheduleChips(en, { everyN: 3, dueIn: 2 })).toEqual(["every 3 replies", "next in 2"]);
    expect(scheduleChips(en, { everyN: 1, dueIn: 0 })).toEqual(["every 1 reply", "due now"]);
  });

  it("Ukrainian: the plural forms by count (1, 2-4, 5+) and the next run", () => {
    expect(scheduleChips(uk, { everyN: 1, dueIn: 0 })).toEqual(["кожні 1 відповідь", "зараз"]);
    expect(scheduleChips(uk, { everyN: 2, dueIn: 2 })).toEqual(["кожні 2 відповіді", "наступний через 2"]);
    expect(scheduleChips(uk, { everyN: 5, dueIn: 1 })[0]).toBe("кожні 5 відповідей");
  });
});

describe("writesChips", () => {
  it("English: records every N, or with the run at 0; the size in characters", () => {
    expect(writesChips(en, { recordsEveryN: 5, textMax: 800 })).toEqual(["records every 5", "800 characters"]);
    expect(writesChips(en, { recordsEveryN: 0, textMax: 1200 })).toEqual(["records with the run", "1200 characters"]);
  });

  it("Ukrainian", () => {
    expect(writesChips(uk, { recordsEveryN: 5, textMax: 800 })).toEqual(["записи кожні 5", "800 символів"]);
    expect(writesChips(uk, { recordsEveryN: 0, textMax: 900 })).toEqual(["записи з запуском", "900 символів"]);
  });
});

describe("addsChips", () => {
  it("English: events on or off, then the dice mode when known", () => {
    expect(addsChips(en, { insert: true, dice: "flavour" })).toEqual(["events on", "dice: Hint"]);
    expect(addsChips(en, { insert: false, dice: "strict" })).toEqual(["events off", "dice: Binding"]);
    expect(addsChips(en, { insert: true, dice: "off" })).toEqual(["events on", "dice: Off"]);
  });

  it("without the dice (the view has none yet) only the events chip", () => {
    expect(addsChips(en, { insert: true })).toEqual(["events on"]);
  });

  it("Ukrainian", () => {
    expect(addsChips(uk, { insert: true, dice: "flavour" })).toEqual(["події увімкнено", "кубик: Підказка"]);
    expect(addsChips(uk, { insert: false })).toEqual(["події вимкнено"]);
  });
});

describe("limitsSummary", () => {
  it("English: the plural of change follows the count", () => {
    expect(limitsSummary(en, { textMax: 800, changesMax: 8 })).toBe("800 characters · 8 changes per run");
    expect(limitsSummary(en, { textMax: 200, changesMax: 1 })).toBe("200 characters · 1 change per run");
  });

  it("Ukrainian: 1 зміна, 2 зміни, 5 змін", () => {
    expect(limitsSummary(uk, { textMax: 800, changesMax: 8 })).toBe("800 символів · 8 змін за запуск");
    expect(limitsSummary(uk, { textMax: 800, changesMax: 1 })).toBe("800 символів · 1 зміна за запуск");
    expect(limitsSummary(uk, { textMax: 800, changesMax: 3 })).toBe("800 символів · 3 зміни за запуск");
  });
});

describe("diceSummary", () => {
  it("stat, luck, the share of replies and the world's share, in order", () => {
    expect(diceSummary(en, { stat: "auto", tilt: "even", chance: 30, life: 10 })).toBe("By the action · Even · 30% of replies · world 10%");
    expect(diceSummary(en, { stat: "affection", tilt: "harsh", chance: 100, life: 0 })).toBe("Affection · Harsh · 100% of replies · world 0%");
  });

  it("Ukrainian", () => {
    expect(diceSummary(uk, { stat: "auto", tilt: "kind", chance: 25, life: 5 })).toBe("За дією · М’яко · 25% відповідей · світ 5%");
  });
});

describe("rollsSummary", () => {
  it("no roll: the empty line, whatever the count", () => {
    expect(rollsSummary(en, { last: null, n: 0 })).toBe("No rolls yet");
    expect(rollsSummary(uk, { last: null, n: 0 })).toBe("Кидків ще не було");
  });

  it("the newest roll and how many are shown", () => {
    expect(rollsSummary(en, { last: "8+1 = 9: clean", n: 10 })).toBe("Last: 8+1 = 9: clean · 10 shown");
    expect(rollsSummary(uk, { last: "8+1 = 9", n: 2 })).toBe("Останній: 8+1 = 9 · показано 2");
  });
});
