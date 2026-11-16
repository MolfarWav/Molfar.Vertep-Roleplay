// The DM's memory screens (#425, half A), rendered to static markup (no DOM library here) and the words they ask for: the editor's
// read-only card, the row and the dot of the DM tab, the chat sheet's card, and every i18n key the proposal, rule and log lines use.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { ProfileEditor } = await import("../src/components/world/world-profiles");
const { MemoryRow, LearnedMemoryCard, LearningCard, MemoryView, leverText, learnLine, MEMORY_ID } = await import("../src/components/world/world-memory");
const { DICTIONARIES } = await import("../src/lib/i18n");
type Profile = import("../src/lib/world").WorldProfile;
type View = import("../src/lib/world").WorldView;

const count = (html: string, id: string) => html.split(`data-testid="${id}"`).length - 1;
const en = DICTIONARIES.en as Record<string, string>;
const uk = DICTIONARIES.uk as Record<string, string>;

describe("the screens", () => {
  it("the profile editor ends with the read-only card of the learned memory and a way into Memory", () => {
    const p: Profile = {
      id: "director", builtIn: true, base: "director", name: "", description: "",
      defaults: { everyN: 5, stagnation: 6, onTransition: true, insert: true },
      options: { clocks: "model", clockEvery: 6, eventByClock: false, deck: false, dice: "off", diceStat: "auto", diceChance: 25, diceTilt: "even", diceLife: 0, dicePace: 0 },
      blocks: [{ key: "keeper", text: "k", default: "k", changed: false }], output: "{}", changed: false, chats: 0, default: false,
    };
    const html = renderToStaticMarkup(<ProfileEditor profile={p} onDirty={() => {}} onGone={() => {}} onOpenProfile={() => {}} />);
    expect(count(html, "block-learned")).toBe(1);
    expect(count(html, "learned-open")).toBe(1);
    expect(count(html, "learned-note")).toBe(1);
    expect(html.indexOf("block-output")).toBeLessThan(html.indexOf("block-learned"));
  });

  it("the DM tab's row shows the dot only when a proposal waits, and marks the open one", () => {
    const row = (selected: boolean, overview: { rules: number; waiting: number } | null) => renderToStaticMarkup(<MemoryRow selected={selected} onSelect={() => {}} overview={overview} />);
    expect(count(row(false, { rules: 2, waiting: 1 }), "memory-dot")).toBe(1);
    expect(count(row(false, { rules: 2, waiting: 0 }), "memory-dot")).toBe(0);
    expect(count(row(false, null), "memory-dot")).toBe(0);
    expect(row(true, null)).toContain('aria-current="true"');
    expect(row(false, { rules: 0, waiting: 0 })).toContain(en["world.mem.rowEmpty"]!);
  });

  it("the chat sheet's card has the switch, the things lever, the rules line, a way to Memory and the log", () => {
    const view = { lastRunAt: 0, settings: { things: "all", learn: true }, learn: { on: true, rules: 2, waiting: 1 } } as unknown as View;
    const html = renderToStaticMarkup(<LearningCard chatId="c1" view={view} save={async () => {}} on />);
    expect(count(html, "section-learn")).toBe(1);
    expect(count(html, "learn-rules")).toBe(1);
    expect(count(html, "learn-waiting")).toBe(1);
    expect(count(html, "learn-open")).toBe(1);
    expect(count(html, "learn-log")).toBe(1);
    const calm = renderToStaticMarkup(<LearningCard chatId="c1" view={{ ...view, learn: { on: true, rules: 0, waiting: 0 } } as View} save={async () => {}} on />);
    expect(count(calm, "learn-waiting")).toBe(0);
  });

  it("the Memory view says what it is before it has loaded, and the card shows its note slot", () => {
    const html = renderToStaticMarkup(<MemoryView chats={[]} chatId={null} onChat={() => {}} />);
    expect(count(html, "memory-view")).toBe(1);
    expect(html).toContain(en["world.mem.noChats"]!);
    expect(count(renderToStaticMarkup(<LearnedMemoryCard />), "learned-note")).toBe(1);
    expect(MEMORY_ID.startsWith("__")).toBe(true);
  });
});

describe("every word the lines ask for exists, in English and in Ukrainian", () => {
  const seen = new Set<string>();
  const t = (key: string, params?: Record<string, unknown>) => {
    seen.add(key);
    return key + JSON.stringify(params ?? {});
  };
  it("lever values and log lines", () => {
    for (const [k, to] of [["things", "all"], ["things", "reasons"], ["things", "off"], ["cast", "off"], ["cast", "rare"], ["cast", "normal"], ["cast", "often"], ["textMax", 500]] as const) {
      expect(leverText(t as never, k, to)).toContain("world.");
    }
    const ev = { n: 5, total: 6, share: 83, min: 5, thr: 60, days: 30, names: [] };
    for (const act of ["raise", "remove", "edit", "add", "reset"] as const) {
      for (const key of ["things", "cast", "textMax"] as const) learnLine(t as never, { at: 1, act, key, to: key === "textMax" ? 500 : "off", scope: "all", ev });
    }
    for (const answer of ["chat", "all", "no", "removed"] as const) learnLine(t as never, { at: 1, act: "answer", key: "things", to: "off", answer });
    learnLine(t as never, { at: 1, act: "edit", key: "cast" });
    expect(seen.size).toBeGreaterThan(10);
    for (const key of seen) {
      expect(en[key], key).toBeTruthy();
      expect(uk[key], key).toBeTruthy();
    }
  });

  it("the proposal sentences exist for every lever", () => {
    for (const key of ["world.mem.p.things", "world.mem.p.textMax", "world.mem.p.cast", "world.mem.q.things.reasons", "world.mem.q.things.off", "world.mem.q.text", "world.mem.q.cast", "world.mem.rowStat", "world.mem.elsewhere"]) {
      expect(en[key], key).toBeTruthy();
      expect(uk[key], key).toBeTruthy();
    }
    // the placeholders the screens fill are the same in both languages
    for (const key of Object.keys(en).filter((k) => k.startsWith("world.mem.") || k.startsWith("world.learn."))) {
      const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
      expect(slots(uk[key]!), key).toBe(slots(en[key]!));
    }
  });
});
