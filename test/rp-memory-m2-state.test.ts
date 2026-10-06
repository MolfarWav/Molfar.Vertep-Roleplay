import { beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  useRoot,
  env,
  L,
  readJson,
  readText,
  writeJson,
  exists,
  U,
  A,
  story,
  writeChat,
  writeDash,
  mockHost,
  tick,
  line,
  chapterReply,
} from "./rp-memory-m2-kit";

useRoot();

describe("Litopys 2.0 state", () => {
  it("migrates all three sources and is idempotent", () => {
    const chatId = "migrate";
    const msgs = story(30);
    writeChat(chatId, msgs, {
      summary: "Aria and You met at the old mill.",
      memoryCutoffMessageId: "m10",
    });

    writeJson("litopys/store.json", {
      chats: {
        [chatId]: {
          worldFacts: [
            { id: "wf1", text: "The old mill stands by the river.", kind: "place", status: "active", at: 1000, updatedAt: 2000 },
            { id: "wf2", text: "A rusted key opens the cellar.", kind: "item", status: "active", at: 1000, updatedAt: 2000 },
            { id: "wf3", text: "Local legend speaks of a lantern ghost.", kind: "lore", status: "active", at: 1000, updatedAt: 2000 },
            { id: "wf4", text: "Bram keeps a journal of routes.", kind: "manual", status: "active", at: 1000, updatedAt: 2000 },
            { id: "wf5", text: "Bram is a travelling merchant.", kind: "npc", status: "active", at: 1000, updatedAt: 2000 },
            { id: "wf6", text: "The harvest festival ended early.", kind: "event", status: "active", at: 1000, updatedAt: 2000 },
            { id: "wf7", text: "The bridge was washed out last spring.", kind: "place", status: "retired", at: 1000, updatedAt: 2000 },
          ],
        },
      },
    });

    writeJson(`chats/${chatId}.memories.json`, [
      { id: "mem1", text: "You remember the smell of rain.", importance: 1, pinned: false, at: 10 },
      { id: "mem2", text: "Aria smiled when she saw the map.", importance: 2, pinned: true, at: 20 },
      { id: "mem3", text: "The cart lost a wheel on the hill.", importance: 3, at: 30 },
      { id: "mem4", text: "A secret door lies behind the tapestry.", importance: 4, at: 40 },
      { id: "mem5", text: "The hidden key was under the board.", importance: 5, pinned: true, at: 50, vector: [0.9, 0.8] },
      { id: "mem6", text: "The old mill stands by the river.", importance: 5, at: 60 },
    ]);

    const m = mockHost();
    const metaBefore = readText(`chats/${chatId}.meta.json`);
    const memBefore = readText(`chats/${chatId}.memories.json`);
    const storeBefore = readText("litopys/store.json");

    const { requests } = tick(m, []);
    expect(requests).toHaveLength(0);

    const st = readJson(`litopys/chats/${chatId}.json`);
    expect(st.migrated).toBe(true);
    expect(st.counters).toEqual({ chapter: 1, fact: 12, proposal: 0 });

    const facts = st.facts;
    expect(facts).toHaveLength(12);

    const worldFacts = facts.slice(0, 7);
    expect(worldFacts.map((f: any) => ({ text: f.text, type: f.type, status: f.status }))).toEqual([
      { text: "The old mill stands by the river.", type: "world", status: "active" },
      { text: "A rusted key opens the cellar.", type: "world", status: "active" },
      { text: "Local legend speaks of a lantern ghost.", type: "world", status: "active" },
      { text: "Bram keeps a journal of routes.", type: "world", status: "active" },
      { text: "Bram is a travelling merchant.", type: "trait", status: "active" },
      { text: "The harvest festival ended early.", type: "event", status: "active" },
      { text: "The bridge was washed out last spring.", type: "world", status: "retired" },
    ]);
    for (const f of worldFacts) {
      expect(f.subject).toBe("world");
      expect(f.knownBy).toBe("all");
      expect(f.weight).toBe("important");
      expect(f.origin).toBe("migrated");
      expect(typeof f.at).toBe("number");
      expect(typeof f.updatedAt).toBe("number");
    }

    const memFacts = facts.slice(7);
    expect(memFacts.map((f: any) => ({ text: f.text, weight: f.weight, pinned: f.pinned }))).toEqual([
      { text: "You remember the smell of rain.", weight: "everyday", pinned: false },
      { text: "Aria smiled when she saw the map.", weight: "everyday", pinned: true },
      { text: "The cart lost a wheel on the hill.", weight: "important", pinned: false },
      { text: "A secret door lies behind the tapestry.", weight: "important", pinned: false },
      { text: "The hidden key was under the board.", weight: "key", pinned: true },
    ]);

    const vectorFact = facts.find((f: any) => f.text === "The hidden key was under the board.");
    const sidecar = readJson(`litopys/vectors/${chatId}.json`);
    expect(Object.keys(sidecar)).toEqual([vectorFact.id]);
    expect(sidecar[vectorFact.id]).toEqual({
      hash: L.fnv1a(vectorFact.text),
      vector: [0.9, 0.8],
    });

    expect(st.chapters).toHaveLength(1);
    expect(st.chapters[0]).toMatchObject({
      id: "c1",
      kind: "merged",
      from: "m1",
      to: "m10",
      count: 10,
      label: "",
      text: "Aria and You met at the old mill.",
    });
    expect(st.chapters[0].sig).toBe(L.chapterSig(line(msgs).slice(0, 10)));
    expect(typeof st.chapters[0].at).toBe("number");

    const afterText = readText(`litopys/chats/${chatId}.json`);
    const { requests: r2 } = tick(m, []);
    expect(readText(`litopys/chats/${chatId}.json`)).toBe(afterText);
    expect(r2).toHaveLength(0);

    const { requests: r3 } = tick(m, []);
    expect(readText(`litopys/chats/${chatId}.json`)).toBe(afterText);
    expect(r3).toHaveLength(0);

    expect(readText(`chats/${chatId}.meta.json`)).toBe(metaBefore);
    expect(readText(`chats/${chatId}.memories.json`)).toBe(memBefore);
    expect(readText("litopys/store.json")).toBe(storeBefore);
  });

  it("migrates facts from archivarius/store.json", () => {
    const chatId = "arc";
    writeChat(chatId, story(30));
    writeJson("archivarius/store.json", {
      chats: {
        [chatId]: {
          worldFacts: [{ id: "o1", text: "The lighthouse is abandoned.", kind: "lore", status: "active", at: 1, updatedAt: 2 }],
        },
      },
    });

    const m = mockHost();
    const { requests } = tick(m, []);
    expect(requests).toHaveLength(0);

    const st = readJson(`litopys/chats/${chatId}.json`);
    expect(st.migrated).toBe(true);
    expect(st.facts).toHaveLength(1);
    expect(st.facts[0]).toMatchObject({
      text: "The lighthouse is abandoned.",
      type: "world",
      status: "active",
      subject: "world",
      knownBy: "all",
      weight: "important",
      origin: "migrated",
    });
  });

  describe("fork", () => {
    const parentId = "parent";
    let pmsgs: ReturnType<typeof story>;
    let pline: ReturnType<typeof line>;

    beforeEach(() => {
      pmsgs = story(60);
      pline = line(pmsgs);
      writeChat(parentId, pmsgs);

      writeJson(`litopys/chats/${parentId}.json`, {
        v: 2,
        chatId: parentId,
        migrated: true,
        chapters: [
          {
            id: "c1",
            from: "m1",
            to: "m20",
            count: 20,
            sig: L.chapterSig(pline.slice(0, 20)),
            label: "At the mill",
            text: "Aria and You arrived at the old mill.",
            kind: "scene",
            at: 1000,
          },
          {
            id: "c2",
            from: "m21",
            to: "m40",
            count: 20,
            sig: L.chapterSig(pline.slice(20, 40)),
            label: "The cellar",
            text: "They found a hidden cellar.",
            kind: "scene",
            at: 1000,
          },
          {
            id: "c3",
            from: "m41",
            to: "m60",
            count: 20,
            sig: L.chapterSig(pline.slice(40, 60)),
            label: "The road",
            text: "They left before dawn.",
            kind: "scene",
            at: 1000,
          },
        ],
        facts: [
          {
            id: "f1",
            text: "The mill wheel is broken.",
            subject: "world",
            knownBy: "all",
            type: "world",
            weight: "important",
            pinned: false,
            status: "active",
            src: { from: "m1", to: "m20", chapter: "c1" },
            origin: "migrated",
            at: 1000,
            updatedAt: 1000,
          },
          {
            id: "f2",
            text: "Aria distrusts strangers.",
            subject: "Aria",
            knownBy: "all",
            type: "trait",
            weight: "important",
            pinned: false,
            status: "superseded",
            src: { from: "m21", to: "m40", chapter: "c2" },
            origin: "chapter",
            at: 1000,
            updatedAt: 1000,
          },
          {
            id: "f3",
            text: "Aria trusts Bram after he shared food.",
            subject: "Aria",
            knownBy: "all",
            type: "change",
            weight: "important",
            pinned: false,
            status: "active",
            supersedes: "f2",
            src: { from: "m41", to: "m60", chapter: "c3" },
            origin: "chapter",
            at: 1000,
            updatedAt: 1000,
          },
          {
            id: "f4",
            text: "A lantern never goes out.",
            subject: "world",
            knownBy: "all",
            type: "world",
            weight: "everyday",
            pinned: false,
            status: "active",
            origin: "migrated",
            at: 1000,
            updatedAt: 1000,
          },
          {
            id: "f5",
            text: "Fact with missing source.",
            subject: "world",
            knownBy: "all",
            type: "world",
            weight: "everyday",
            pinned: false,
            status: "active",
            src: { from: "mX", to: "mx99", chapter: "c0" },
            origin: "chapter",
            at: 1000,
            updatedAt: 1000,
          },
        ],
        proposals: [
          {
            id: "p1",
            op: "rewrite",
            targets: ["f1"],
            text: "Maybe the wheel is fixed.",
            reason: "test",
            status: "pending",
            chapter: "c1",
            at: 1000,
          },
        ],
        scene: { openFrom: "m60" },
        counters: { chapter: 3, fact: 5, proposal: 1 },
      });

      writeJson(`litopys/vectors/${parentId}.json`, {
        c1: { hash: L.fnv1a("Aria and You arrived at the old mill."), vector: [0.1] },
        c2: { hash: L.fnv1a("They found a hidden cellar."), vector: [0.2] },
        c3: { hash: L.fnv1a("They left before dawn."), vector: [0.3] },
        f1: { hash: L.fnv1a("The mill wheel is broken."), vector: [0.4] },
        f2: { hash: L.fnv1a("Aria distrusts strangers."), vector: [0.5] },
        f3: { hash: L.fnv1a("Aria trusts Bram after he shared food."), vector: [0.6] },
        f4: { hash: L.fnv1a("A lantern never goes out."), vector: [0.7] },
      });
    });

    it("copies chapters and facts up to parentMessageId", () => {
      const childId = "child";
      const childMsgs = pline.slice(0, 40).concat(story(10, "n"));
      writeChat(childId, childMsgs, { parentChatId: parentId, parentMessageId: "m40" });

      const m = mockHost();
      const { requests } = tick(m, []);
      expect(requests).toHaveLength(0);

      const child = readJson(`litopys/chats/${childId}.json`);
      expect(child.migrated).toBe(true);
      expect(child.chapters.map((c: any) => c.id)).toEqual(["c1", "c2"]);
      expect(child.facts.map((f: any) => f.id).sort()).toEqual(["f1", "f2", "f4"]);
      expect(child.facts.find((f: any) => f.id === "f2").status).toBe("active");
      expect(child.proposals).toHaveLength(0);
      expect(child.counters).toEqual({ chapter: 3, fact: 5, proposal: 1 });
      expect(child.chapters.every((c: any) => !c.stale)).toBe(true);

      const childVectors = readJson(`litopys/vectors/${childId}.json`);
      expect(Object.keys(childVectors).sort()).toEqual(["c1", "c2", "f1", "f2", "f4"]);
      expect(childVectors.c1).toEqual({ hash: L.fnv1a("Aria and You arrived at the old mill."), vector: [0.1] });
    });

    it("copies everything when parentMessageId is null", () => {
      const childId = "childAll";
      writeChat(childId, pmsgs, { parentChatId: parentId, parentMessageId: null });

      const m = mockHost();
      const { requests } = tick(m, []);
      expect(requests).toHaveLength(0);

      const child = readJson(`litopys/chats/${childId}.json`);
      expect(child.chapters.map((c: any) => c.id)).toEqual(["c1", "c2", "c3"]);
      expect(child.facts.map((f: any) => f.id).sort()).toEqual(["f1", "f2", "f3", "f4"]);
      expect(child.facts.find((f: any) => f.id === "f2").status).toBe("superseded");
      expect(child.proposals).toHaveLength(0);

      const childVectors = readJson(`litopys/vectors/${childId}.json`);
      expect(Object.keys(childVectors).sort()).toEqual(["c1", "c2", "c3", "f1", "f2", "f3", "f4"]);
    });

    it("creates the parent's file first if missing", () => {
      const plainId = "plain";
      const childId = "plainChild";
      writeChat(plainId, story(50));
      const childMsgs = story(50).slice(0, 40).concat(story(10, "n"));
      writeChat(childId, childMsgs, { parentChatId: plainId, parentMessageId: "m40" });

      const m = mockHost();
      const { requests } = tick(m, []);
      expect(requests).toHaveLength(0);

      expect(exists(`litopys/chats/${plainId}.json`)).toBe(true);
      const parent = readJson(`litopys/chats/${plainId}.json`);
      expect(parent.migrated).toBe(true);

      const child = readJson(`litopys/chats/${childId}.json`);
      expect(child.migrated).toBe(true);
      expect(child.chapters).toHaveLength(0);
      expect(child.facts).toHaveLength(0);
    });

    it("migrates normally when the parent chat is gone", () => {
      const childId = "orphanChild";
      writeChat(childId, story(30), { parentChatId: "ghost", parentMessageId: "m10" });

      const m = mockHost();
      const { requests } = tick(m, []);
      expect(requests).toHaveLength(0);

      const child = readJson(`litopys/chats/${childId}.json`);
      expect(child.migrated).toBe(true);
      expect(child.chapters).toHaveLength(0);
      expect(child.facts).toHaveLength(0);
    });
  });

  describe("prune", () => {
    it("removes deleted chat files and trims legacy data", () => {
      writeChat("live1", story(30));

      writeJson("litopys/store.json", {
        chats: {
          live1: { worldFacts: [] },
          dead01: { worldFacts: [{ text: "gone", kind: "event", status: "active" }] },
        },
      });
      writeJson("litopys/proposals.json", {
        items: [
          { chatId: "live1", op: "add", text: "keep" },
          { chatId: "dead01", op: "add", text: "drop" },
        ],
      });
      writeJson("litopys/chats/dead01.json", { v: 2, chatId: "dead01", migrated: true, chapters: [], facts: [], proposals: [], scene: {}, counters: { chapter: 0, fact: 0, proposal: 0 } });
      writeJson("litopys/vectors/dead01.json", {});

      fs.mkdirSync(path.join(env.root, "vault-chats"), { recursive: true });
      fs.writeFileSync(path.join(env.root, "vault-chats", "summary-dead01.md"), "# dead");

      const m = mockHost();
      tick(m, []);

      expect(exists("litopys/chats/live1.json")).toBe(true);
      expect(exists("litopys/chats/dead01.json")).toBe(false);
      expect(exists("litopys/vectors/dead01.json")).toBe(false);
      expect(exists("vault-chats/summary-dead01.md")).toBe(false);

      const store = readJson("litopys/store.json");
      expect(store.chats.dead01).toBeUndefined();
      expect(store.chats.live1).toBeDefined();

      const proposals = readJson("litopys/proposals.json");
      expect(proposals.items).toHaveLength(1);
      expect(proposals.items[0].chatId).toBe("live1");
    });

    it("does not rewrite store.json when there is nothing to drop", () => {
      writeChat("onlylive", story(30));
      writeJson("litopys/store.json", { chats: { onlylive: { worldFacts: [] } } });

      const m = mockHost();
      const beforeText = readText("litopys/store.json");
      const beforeMtime = fs.statSync(path.join(env.root, "litopys/store.json")).mtimeMs;

      tick(m, []);

      expect(readText("litopys/store.json")).toBe(beforeText);
      expect(fs.statSync(path.join(env.root, "litopys/store.json")).mtimeMs).toBe(beforeMtime);
    });

    it("returns false when listing fails", () => {
      const m = mockHost();
      const result = L.pruneOrphans(m.host.fs, { chats: {} }, null);
      expect(result).toBe(false);
    });
  });

  describe("vectors", () => {
    it("embeds the new chapter and added facts in the same tick", () => {
      writeChat("vec1", story(70));
      const m = mockHost();
      const reply = chapterReply("The old mill", "Aria and You entered the old mill and found a rusted key.", [
        { op: "add", text: "The cellar door was locked.", subject: "world", knownBy: "all", type: "world", weight: "important" },
        { op: "add", text: "Aria carries a lantern.", subject: "Aria", knownBy: "all", type: "trait", weight: "everyday" },
      ]);

      const { requests, embeds } = tick(m, [reply]);
      expect(requests).toHaveLength(1);
      expect(embeds).toHaveLength(1);
      expect(embeds[0].key).toBe("lit_emb_vec1");

      const expected = [
        "Aria and You entered the old mill and found a rusted key.",
        "The cellar door was locked.",
        "Aria carries a lantern.",
      ];
      expect(embeds[0].texts).toEqual(expected);

      const sidecar = readJson("litopys/vectors/vec1.json");
      expect(Object.keys(sidecar).sort()).toEqual(["c1", "f1", "f2"]);
      for (const [id, text] of [["c1", expected[0]], ["f1", expected[1]], ["f2", expected[2]]]) {
        expect(sidecar[id]).toEqual({ hash: L.fnv1a(text), vector: [expect.any(Number), expect.any(Number)] });
      }
    });

    it("makes no embed request when all vectors are present", () => {
      writeChat("vec1b", story(70));
      const m = mockHost();
      const reply = chapterReply("X", "Chapter text.", [{ op: "add", text: "Fact.", subject: "world", type: "world", weight: "everyday" }]);
      tick(m, [reply]);

      const { requests, embeds } = tick(m, []);
      expect(requests).toHaveLength(0);
      expect(embeds).toHaveLength(0);
    });

    it("pauses embeds for an hour after a null response", () => {
      writeChat("vec2", story(120));
      const m = mockHost({ embedder: () => null });

      const reply1 = chapterReply("The mill", "They reached the old mill.", [{ op: "add", text: "The door was open.", subject: "world", type: "world", weight: "everyday" }]);
      tick(m, [reply1]);
      expect(readJson("litopys/embed-status.json").ok).toBe(false);

      m.embedder = (texts: string[]) => texts.map((_, i) => [0.1 * (i + 1), 0.5]);
      const reply2 = chapterReply("The cellar", "They entered the cellar.", [{ op: "add", text: "A draft blew upward.", subject: "world", type: "world", weight: "everyday" }]);
      const { requests: r2, embeds: e2 } = tick(m, [reply2]);
      expect(r2).toHaveLength(1);
      expect(e2).toHaveLength(0);

      const status = readJson("litopys/embed-status.json");
      status.checkedAt = Date.now() - 2 * 3600 * 1000;
      writeJson("litopys/embed-status.json", status);

      writeChat("vec3", story(70));
      const reply3 = chapterReply("The road", "They left the mill.", [{ op: "add", text: "Rain began to fall.", subject: "world", type: "world", weight: "everyday" }]);
      const { requests: r3, embeds: e3 } = tick(m, [reply3]);
      expect(r3).toHaveLength(1);
      expect(e3).toHaveLength(1);
      expect(e3[0].key).toBe("lit_emb_vec3");
    });

    it("stores the chapter when there is no embed function", () => {
      writeChat("vec4", story(70));
      const m = mockHost({ embed: false });
      const reply = chapterReply("The mill", "They reached the old mill.", [{ op: "add", text: "Fact one.", subject: "world", type: "world", weight: "everyday" }]);

      expect(() => tick(m, [reply])).not.toThrow();
      expect(readJson("litopys/chats/vec4.json").chapters).toHaveLength(1);
    });

    it("stores only valid vectors when the embedder returns garbage", () => {
      writeChat("vec5", story(70));
      const m = mockHost({ embedder: () => [[0.1, 0.2], "bad" as any, [0.3, 0.4]] });
      const reply = chapterReply("The mill", "They reached the old mill.", [
        { op: "add", text: "Fact one.", subject: "world", type: "world", weight: "everyday" },
        { op: "add", text: "Fact two.", subject: "world", type: "world", weight: "everyday" },
      ]);

      tick(m, [reply]);
      const sidecar = readJson("litopys/vectors/vec5.json");
      expect(Object.keys(sidecar).sort()).toEqual(["c1", "f2"]);
    });

    it("lists a fact again after its text is edited", () => {
      const chatId = "vec6";
      writeChat(chatId, story(30));
      const m = mockHost();

      const st = L.emptyChat(chatId);
      st.migrated = true;
      st.facts.push({
        id: "f1",
        text: "Original text.",
        subject: "world",
        knownBy: "all",
        type: "world",
        weight: "everyday",
        pinned: false,
        status: "active",
        origin: "migrated",
        at: 1,
        updatedAt: 1,
      });
      L.saveChatFile(m.host.fs, st);
      writeJson("litopys/vectors/vec6.json", { f1: { hash: L.fnv1a("Original text."), vector: [0.1, 0.2] } });

      const before = L.needVectors(m.host.fs, L.loadChatFile(m.host.fs, chatId));
      expect(before).toHaveLength(0);

      const edited = L.loadChatFile(m.host.fs, chatId);
      edited.facts[0].text = "Edited text.";
      L.saveChatFile(m.host.fs, edited);

      const needed = L.needVectors(m.host.fs, L.loadChatFile(m.host.fs, chatId));
      expect(needed).toEqual([{ id: "f1", text: "Edited text.", hash: L.fnv1a("Edited text.") }]);
    });

    it("requests at most 64 vectors", () => {
      const chatId = "vec7";
      const m = mockHost();
      const st = L.emptyChat(chatId);
      st.migrated = true;
      for (let i = 0; i < 40; i++) {
        st.chapters.push({
          id: `c${i + 1}`,
          from: `m${i * 2 + 1}`,
          to: `m${i * 2 + 2}`,
          count: 2,
          sig: "x",
          label: "",
          text: `Chapter ${i + 1}.`,
          kind: "scene",
          at: 1,
        });
      }
      for (let i = 0; i < 40; i++) {
        st.facts.push({
          id: `f${i + 1}`,
          text: `Fact ${i + 1}.`,
          subject: "world",
          knownBy: "all",
          type: "world",
          weight: "everyday",
          pinned: false,
          status: "active",
          origin: "migrated",
          at: 1,
          updatedAt: 1,
        });
      }
      L.saveChatFile(m.host.fs, st);

      const needed = L.needVectors(m.host.fs, L.loadChatFile(m.host.fs, chatId));
      expect(needed).toHaveLength(64);
    });
  });

  describe("config", () => {
    it("returns the default config", () => {
      const m = mockHost();
      const res = L.handleRoute({ method: "GET", path: "/litopys/config" }, m.host);
      expect(res).toBeDefined();
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ ...L.DEFAULT_CONFIG, ...L.DEFAULT_PROMPTS });
    });

    it("clamps flat and nested values on PUT", () => {
      const m = mockHost();
      const res = L.handleRoute(
        { method: "PUT", path: "/litopys/config", body: { enabled: "off", model: "  provider/model  ", recentMessages: 3, pinLimit: 0, scene_minMessages: 4, scene_maxMessages: 2 } },
        m.host,
      );
      expect(res.json.enabled).toBe(false);
      expect(res.json.model).toBe("provider/model");
      expect(res.json.recentMessages).toBe(6);
      expect(res.json.pinLimit).toBe(1);
      expect(res.json.scene).toEqual({ minMessages: 4, maxMessages: 10 });
    });

    it("accepts nested scene values and clamps large recentMessages", () => {
      const m = mockHost();
      const res = L.handleRoute(
        { method: "PUT", path: "/litopys/config", body: { values: { recentMessages: 9999, scene: { minMessages: 8, maxMessages: 12 } } } },
        m.host,
      );
      expect(res.json.recentMessages).toBe(200);
      expect(res.json.scene).toEqual({ minMessages: 8, maxMessages: 12 });
    });

    it("does not store the default prompt text", () => {
      const m = mockHost();
      L.handleRoute({ method: "PUT", path: "/litopys/config", body: { chapter: L.DEFAULT_PROMPTS.chapter } }, m.host);
      const stored = readJson("litopys/config.json");
      expect(stored.chapter).toBeUndefined();
    });

    it("stores and returns a custom prompt", () => {
      const m = mockHost();
      const custom = "Custom chapter prompt.\nNever invent names.";
      const res = L.handleRoute({ method: "PUT", path: "/litopys/config", body: { chapter: custom } }, m.host);
      expect(res.json.chapter).toBe(custom);
      expect(readJson("litopys/config.json").chapter).toBe(custom);
    });

    it("restores the default prompt on DELETE", () => {
      const m = mockHost();
      L.handleRoute({ method: "PUT", path: "/litopys/config", body: { chapter: "Custom prompt." } }, m.host);
      const res = L.handleRoute({ method: "DELETE", path: "/litopys/config/prompts" }, m.host);
      expect(res.json.chapter).toBe(L.DEFAULT_PROMPTS.chapter);
      expect(readJson("litopys/config.json").chapter).toBeUndefined();
    });

    it("ignores old 1.x config keys", () => {
      const m = mockHost();
      writeJson("litopys/config.json", { model: "x", recentMessages: 50, extractEveryNTurns: 5, inject: true, scribePrompt: "old" });
      const res = L.handleRoute({ method: "GET", path: "/litopys/config" }, m.host);
      expect(res.json.model).toBe("x");
      expect(res.json.recentMessages).toBe(50);
      expect(res.json.extractEveryNTurns).toBeUndefined();
      expect(res.json.inject).toBeUndefined();
      expect(res.json.scribePrompt).toBeUndefined();
    });

    it("returns null for unknown paths and methods", () => {
      const m = mockHost();
      expect(L.handleRoute({ method: "GET", path: "/litopys/other" }, m.host)).toBeNull();
      expect(L.handleRoute({ method: "POST", path: "/litopys/config" }, m.host)).toBeNull();
    });

    it("exposes the panel save URL", () => {
      const m = mockHost();
      const panel = L.uiPanel({}, m.host);
      expect(panel.items[0].saveUrl).toBe("/litopys/config");
    });
  });

  it("keeps engine files untouched and writes only under litopys/", () => {
    const chatId = "iso";
    writeChat(chatId, story(70));
    writeDash(chatId, { m10: { place: "Hall", day: 1, time: "10:00", scene: { new: true, label: "Arrival" } } });

    const snap = (rel: string) => {
      const dir = path.join(env.root, rel);
      const map: Record<string, string> = {};
      if (!fs.existsSync(dir)) return map;
      const walk = (p: string, prefix: string) => {
        for (const ent of fs.readdirSync(p).sort()) {
          const full = path.join(p, ent);
          const key = prefix ? `${prefix}/${ent}` : ent;
          const stat = fs.statSync(full);
          if (stat.isDirectory()) walk(full, key);
          else map[key] = fs.readFileSync(full, "utf8");
        }
      };
      walk(dir, "");
      return map;
    };

    const beforeChats = snap("chats");
    const beforeDash = snap("dashboard");

    const m = mockHost();
    const reply = chapterReply("Arrival", "Aria and You stepped into the hall.", [
      { op: "add", text: "The hall was empty.", subject: "world", type: "world", weight: "everyday" },
    ]);
    tick(m, [reply]);

    expect(snap("chats")).toEqual(beforeChats);
    expect(snap("dashboard")).toEqual(beforeDash);
    expect(exists(`litopys/chats/${chatId}.json`)).toBe(true);
  });
});
