/**
 * Import progress (src/lib/import-progress.ts): the bar counts whole units plus the share of the running one,
 * Cancel stops between units, a failed unit is listed, and a job ends as done or cancelled.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { beginImport, forEachImport, jobFraction, useImportProgress } from "../src/lib/import-progress";
import { DICTIONARIES } from "../src/lib/i18n";

const jobs = () => useImportProgress.getState().jobs;
beforeEach(() => useImportProgress.setState({ jobs: [] }));

describe("jobFraction", () => {
  const base = { total: 4, done: 1, inner: 0, status: "running" as const };
  it("is the finished units plus the share of the running one", () => {
    expect(jobFraction(base)).toBe(0.25);
    expect(jobFraction({ ...base, inner: 0.5 })).toBe(0.375);
  });
  it("stays between 0 and 1 and a finished job is whole", () => {
    expect(jobFraction({ ...base, inner: 9 })).toBe(0.5);
    expect(jobFraction({ ...base, inner: -3 })).toBe(0.25);
    expect(jobFraction({ ...base, total: 0 })).toBe(0);
    expect(jobFraction({ ...base, status: "done" })).toBe(1);
  });
});

describe("a job", () => {
  it("moves by units and by the steps inside one", () => {
    const run = beginImport("Importing", 2);
    run.start("a.json", "Reading");
    run.step("Saving", 0.5);
    expect(jobs()[0]).toMatchObject({ current: "a.json", step: "Saving", done: 0, inner: 0.5 });
    expect(jobFraction(jobs()[0]!)).toBe(0.25);
    run.finish();
    expect(jobs()[0]).toMatchObject({ done: 1, inner: 0 });
    run.start("b.json");
    run.finish(false, "bad file");
    expect(jobs()[0]!.failed).toEqual([{ name: "b.json", message: "bad file" }]);
    run.end("Imported 1 of 2");
    expect(jobs()[0]).toMatchObject({ status: "done", summary: "Imported 1 of 2" });
    expect(jobFraction(jobs()[0]!)).toBe(1);
  });

  it("a job of nothing still has one unit, and drop takes it off the screen", () => {
    const run = beginImport("x", 0);
    expect(jobs()[0]!.total).toBe(1);
    run.drop();
    expect(jobs()).toEqual([]);
  });

  it("Cancel is read between units; the job ends as cancelled with what was done", async () => {
    const seen: string[] = [];
    await forEachImport("Importing", ["a", "b", "c"], (x) => x, async (x) => {
      seen.push(x);
      if (x === "a") useImportProgress.getState().requestCancel(jobs()[0]!.id);
    });
    expect(seen).toEqual(["a"]);
    expect(jobs()[0]).toMatchObject({ status: "cancelled", done: 1, total: 3, cancelRequested: true });
  });

  it("a file that returns false or throws is listed as failed, the rest carry on", async () => {
    await forEachImport("Importing", ["a", "b", "c"], (x) => x, async (x) => {
      if (x === "a") return false;
      if (x === "b") throw new Error("boom");
    });
    const job = jobs()[0]!;
    expect(job.status).toBe("done");
    expect(job.done).toBe(3);
    expect(job.failed.map((f) => f.name)).toEqual(["a", "b"]);
    expect(job.failed[1]!.message).toBe("boom");
  });

  it("Cancel on a job that has ended changes nothing", () => {
    const run = beginImport("x", 1);
    run.end();
    useImportProgress.getState().requestCancel(run.id);
    expect(jobs()[0]!.cancelRequested).toBe(false);
  });
});

describe("the strings", () => {
  it("every imp.* key exists in English and Ukrainian", () => {
    const en = Object.keys(DICTIONARIES.en).filter((k) => k.startsWith("imp."));
    const uk = Object.keys(DICTIONARIES.uk).filter((k) => k.startsWith("imp."));
    expect(en.length).toBeGreaterThan(10);
    expect(uk.sort()).toEqual(en.sort());
  });
});
