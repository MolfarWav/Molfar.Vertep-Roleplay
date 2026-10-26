/**
 * Memory wave 1, the behaviour around the insert: arcs on by themselves for a new install (an existing one keeps
 * its choice and is offered the switch once), quiet proposals with an Undo, and the automatic Consolidate.
 */
import { describe, expect, it } from "bun:test";
import { L, abs, exists, mockHost, readJson, story, useRoot, writeChat, writeJson } from "./rp-memory-m2-kit";

useRoot();

const route = (host: any, method: string, path: string, body?: any, query: Record<string, string> = {}) => L.handleRoute({ method, path, query, body }, host);

describe("arcs by themselves", () => {
  it("a new install merges automatically, and a chat file appearing later does not change that", () => {
    const { host } = mockHost();
    const cfg = route(host, "GET", "/litopys/config").json;
    expect(cfg.arcMode).toBe("auto");
    expect(cfg.arcNotice).toBe("done");
    writeJson("litopys/chats/c1.json", L.emptyChat("c1"));
    expect(route(host, "GET", "/litopys/config").json.arcMode).toBe("auto");
    expect(readJson("litopys/config.json").arcMode).toBe("auto");
  });

  it("an install that has chat records keeps asking and is offered the switch", () => {
    writeJson("litopys/chats/c1.json", L.emptyChat("c1"));
    const { host } = mockHost();
    const cfg = route(host, "GET", "/litopys/config").json;
    expect(cfg.arcMode).toBe("ask");
    expect(cfg.arcNotice).toBe("pending");
  });

  it("an install with a saved config and no arc choice keeps asking and is offered the switch", () => {
    writeJson("litopys/config.json", { budget: 1500 });
    const cfg = L.loadConfig(mockHost().host.fs);
    expect(cfg.arcMode).toBe("ask");
    expect(cfg.arcNotice).toBe("pending");
    expect(cfg.budget).toBe(1500);
  });

  it("a saved choice stays, and only 'ask' is offered the switch", () => {
    writeJson("litopys/config.json", { arcMode: "off" });
    expect(L.loadConfig(mockHost().host.fs)).toMatchObject({ arcMode: "off", arcNotice: "done" });
  });

  it("a saved 'auto' stays and nothing is offered", () => {
    writeJson("litopys/config.json", { arcMode: "auto" });
    expect(L.loadConfig(mockHost().host.fs)).toMatchObject({ arcMode: "auto", arcNotice: "done" });
  });

  it("answering the offer settles it for good, either way", () => {
    writeJson("litopys/config.json", { budget: 900 });
    const { host } = mockHost();
    expect(route(host, "GET", "/litopys/config").json.arcNotice).toBe("pending");
    const kept = route(host, "PUT", "/litopys/config", { arcNotice: "done" }).json;
    expect(kept).toMatchObject({ arcMode: "ask", arcNotice: "done" });
    expect(route(host, "GET", "/litopys/config").json.arcNotice).toBe("done");

    writeJson("litopys/config.json", { budget: 900 });
    const again = route(host, "GET", "/litopys/config").json;
    expect(again.arcNotice).toBe("pending");
    const on = route(host, "PUT", "/litopys/config", { arcMode: "auto" }).json;
    expect(on).toMatchObject({ arcMode: "auto", arcNotice: "done" });
    // asking again later by choice does not bring the offer back
    expect(route(host, "PUT", "/litopys/config", { arcMode: "ask" }).json).toMatchObject({ arcMode: "ask", arcNotice: "done" });
  });
});
