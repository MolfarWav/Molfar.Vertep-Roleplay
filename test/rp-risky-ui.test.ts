// #184 P5: the UI side of review by risk that is plain code: the reason codes have a sentence, the Inbox row carries
// the main reason a chat's suggestions wait, and a code the app does not know reads as a plain wait.
import { describe, expect, it } from "bun:test";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { whyKey } = await import("../src/components/library/ledger-proposals");
const { litWhy, inboxRows, toastPlan } = await import("../src/lib/attention-core");
const { DICTIONARIES } = await import("../src/lib/i18n");

describe("why a suggestion waits (#184 P5)", () => {
  it("every reason the plugin writes has a sentence in both languages; an unknown one has the plain one", () => {
    for (const code of ["widens", "protected", "kind", "change", "belief", "contradicts"]) {
      const key = whyKey(code);
      expect(key).toBe(`lit.why.${code}`);
      expect((DICTIONARIES.en as Record<string, string>)[key]).toBeTruthy();
      expect((DICTIONARIES.uk as Record<string, string>)[key]).toBeTruthy();
    }
    expect(whyKey("something-new")).toBe("lit.why.other");
  });

  it("the Inbox row of a chat carries the reason most of its waiting suggestions have", () => {
    expect(litWhy([{ id: "c1", why: { widens: 1, protected: 3 } }, { id: "c2" }, { id: "c3", why: {} }])).toEqual({ c1: "protected" });
    const rows = inboxRows({
      settings: undefined,
      litopys: { c1: 4, c2: 1 },
      litWhy: { c1: "protected" },
      soul: [],
      chatName: (id: string) => "Chat " + id,
      cardName: (id: string) => id,
    } as never);
    const lit = rows.rows.filter((r) => r.kind === "litopys") as { chatId: string; why?: string }[];
    expect(lit.find((r) => r.chatId === "c1")?.why).toBe("protected");
    expect(lit.find((r) => r.chatId === "c2")?.why).toBeUndefined();
  });

  it("a proposal to add a fact has its own toast line", () => {
    const plan = toastPlan([{ chatId: "c1", name: "Aria", id: "p1", op: "add", text: "Aria lost her arm." } as never], "en");
    expect(plan.title).toContain("adding a fact");
  });
});
