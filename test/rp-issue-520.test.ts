/**
 * #520: World DM reads the story the way the sensor does (#85): the blocks a preset hides in a reply with prompt-only scripts that delete
 * them (a notebook of guesses, an out-of-character chat, a HUD) never reach the DM's prompt, its event check or its tidy-up. The stored
 * messages stay as they are. Meanwhile reads no message text (it takes the scene from the Dashboard's snapshots), so it needs nothing.
 */
import { describe, expect, it } from "bun:test";
import { emptyState, handleRoute, storyMsgs, storyView, tidyBook } from "../plugins/world/plugin.js";

const script = (id: string, over: Record<string, unknown> = {}) => ({ scriptName: id, flags: "g", replaceString: "", placement: ["ai_output"], promptOnly: true, ...over });
const meta = { id: "c1", presetId: "st", characterId: "odarka" };
const msg = (i: number, role: string, text: string) => ({ id: "m" + i, role, name: role === "user" ? "Taras" : "Odarka", text, swipe: 0 });

/** A file system of strings that counts what is asked of it. */
function memfs(files: Record<string, string>) {
  const calls = { list: 0, read: 0 };
  return {
    calls,
    read: (p: string) => { calls.read++; if (!(p in files)) throw new Error("ENOENT " + p); return files[p]!; },
    write: (p: string, s: string) => { files[p] = s; },
    remove: (p: string) => { delete files[p]; },
    list: (dir: string) => { calls.list++; return Object.keys(files).filter((k) => k.startsWith(dir + "/")).map((k) => k.slice(dir.length + 1)); },
  };
}
const scripts = (list: Record<string, unknown>) => Object.fromEntries(Object.entries(list).map(([id, s]) => ["regex/" + id + ".json", JSON.stringify(s)]));

describe("the helper (the same as the sensor's)", () => {
  it("deletes what prompt-only scripts delete, for the chat's scope only", () => {
    const fsx = memfs(scripts({
      hud: script("hud", { findRegex: "<sola_hud>[\\s\\S]*?</sola_hud>" }),
      voice: script("voice", { findRegex: "<inner_voice>[\\s\\S]*?</inner_voice>", scope: "preset", scopeTargetId: "st" }),
      other: script("other", { findRegex: "SECRET", scope: "preset", scopeTargetId: "another-preset" }),
    }));
    const view = storyView(fsx, meta);
    expect(view("<sola_hud>HP 3</sola_hud>She smiles. SECRET<inner_voice>hm</inner_voice>", "char")).toBe("She smiles. SECRET");
  });

  it("leaves alone display-only scripts, replacements, depth limits, the other role, and a missing folder", () => {
    const fsx = memfs(scripts({
      shown: script("shown", { findRegex: "<b>", promptOnly: false, markdownOnly: true }),
      swap: script("swap", { findRegex: "cat", replaceString: "dog" }),
      deep: script("deep", { findRegex: "deep", maxDepth: 2 }),
      mine: script("mine", { findRegex: "HI", placement: ["user_input"] }),
      off: script("off", { findRegex: "x", disabled: true }),
    }));
    const view = storyView(fsx, meta);
    expect(view("<b>cat HI x deep", "char")).toBe("<b>cat HI x deep");
    expect(view("<b>cat HI x", "user")).toBe("<b>cat  x");
    expect(storyView(memfs({}), meta)("kept", "char")).toBe("kept");
  });

  it("reads the scripts on the first use, not before", () => {
    const fsx = memfs(scripts({ hud: script("hud", { findRegex: "<h>.*?</h>" }) }));
    const view = storyView(fsx, meta);
    expect(fsx.calls).toEqual({ list: 0, read: 0 });
    view("a<h>b</h>", "char");
    view("a<h>b</h>", "char");
    expect(fsx.calls.list).toBe(1);
  });

  it("storyMsgs changes the text only: the key, the role and the swipe stay; a reply that was all hidden block is empty", () => {
    const view = storyView(memfs(scripts({ hud: script("hud", { findRegex: "<h>.*?</h>" }) })), meta);
    const out = storyMsgs(view, [{ ...msg(1, "char", "Hello.<h>x</h>"), swipe: 2 }, msg(2, "char", "<h>only</h>"), { id: "m3", role: "char" }]) as any[];
    expect(out[0]).toMatchObject({ id: "m1", role: "char", swipe: 2, text: "Hello." });
    expect(out[1].text).toBe("");
    expect(out[2]).toEqual({ id: "m3", role: "char" });
  });
});

describe("the DM run", () => {
  const story = [
    msg(0, "user", "Taras knocks on the door."),
    msg(1, "char", "Odarka opens it.<sola_notebook>Guess: Taras is the lost prince of Veldra.</sola_notebook>"),
    msg(2, "user", "Taras steps in."),
    msg(3, "char", "<sola_hud>HP 3</sola_hud>The kitchen smells of bread."),
  ];
  const setup = (withScript: boolean) => {
    const files: Record<string, string> = {
      "chats/c1.meta.json": JSON.stringify({ id: "c1", title: "The Pass", characterId: "odarka", userName: "Taras", model: "c/chat", presetId: "st" }),
      "chats/c1.jsonl": story.map((m) => JSON.stringify(m)).join("\n") + "\n",
      "characters/odarka/card.json": JSON.stringify({ name: "Odarka" }),
      "settings.json": JSON.stringify({ model: "c/default" }),
      "world/state/c1.json": JSON.stringify({ ...emptyState("c1"), settings: { level: "chronicler", everyN: 1, stagnation: 6, onTransition: true, onPlace: true, insert: true } }),
      ...(withScript ? scripts({
        notebook: script("notebook", { findRegex: "<sola_notebook>[\\s\\S]*?</sola_notebook>", scope: "preset", scopeTargetId: "st" }),
        hud: script("hud", { findRegex: "<sola_hud>[\\s\\S]*?</sola_hud>" }),
      }) : {}),
    };
    const sent: any[] = [];
    const host = { fs: memfs(files), llm: { request: (_k: string, o: any) => { sent.push(o); }, results: {} as Record<string, any> } };
    const run = () => handleRoute({ method: "POST", path: "/world/update", query: {}, body: { chatId: "c1", auto: false } }, host) as any;
    return { files, sent, run };
  };

  it("the prompt has the story, not the hidden blocks; the chat file is untouched", () => {
    const { files, sent, run } = setup(true);
    expect(run().__llmPending).toBe(true);
    const prompt = sent[0].messages[0].content as string;
    expect(prompt).toContain("Odarka opens it.");
    expect(prompt).toContain("The kitchen smells of bread.");
    expect(prompt).not.toContain("lost prince");
    expect(prompt).not.toContain("sola_");
    expect(prompt).not.toContain("HP 3");
    expect(files["chats/c1.jsonl"]).toContain("lost prince");
  });

  it("without the scripts the same chat is read whole (the control)", () => {
    const { sent, run } = setup(false);
    run();
    expect(sent[0].messages[0].content).toContain("lost prince");
  });
});

describe("the tidy-up", () => {
  const rec = (id: string, name: string) => ({ id, kind: "thing", name, aliases: [] as string[], text: "A coil.", status: "active", uid: 0, at: 1 });
  const filler = (n: number, from = 0) => Array.from({ length: n }, (_, k) => msg(from + k, (from + k) % 2 === 0 ? "user" : "char", "The road goes on."));
  const args = (msgs: object[], view?: (t: string, r?: string) => string) => ({ msgs: msgs as any, scene: null, cards: ["Odarka"], userName: "Taras", now: 100, ...(view ? { view } : {}) });

  /** 10 more replies; the Rope is named three times, every time inside the notebook block */
  const hidden = () => {
    const more = filler(20, 40);
    for (const i of [1, 3, 5]) more[i] = msg(40 + i, "char", "The road goes on.<sola_notebook>Guess: the rope matters.</sola_notebook>");
    return [...filler(40), ...more];
  };
  const run = (view?: (t: string, r?: string) => string) => {
    const s = { ...emptyState("c1"), entities: [rec("n1", "Rope")], nextId: 5 } as any;
    tidyBook(s, args(filler(40), view));
    tidyBook(s, args(hidden(), view));
    return s.entities[0].status;
  };

  it("a thing named only in a hidden block is not named in the story: it goes to rest", () => {
    const view = storyView(memfs(scripts({ notebook: script("notebook", { findRegex: "<sola_notebook>[\\s\\S]*?</sola_notebook>" }) })), meta);
    expect(run(view)).toBe("dormant");
  });

  it("with no view the old reading stays: the three mentions keep it", () => {
    expect(run()).toBe("active");
  });
});
