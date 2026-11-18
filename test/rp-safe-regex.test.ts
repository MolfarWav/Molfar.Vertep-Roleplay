/** The regex worker is a string executed in a Worker, so ordinary imports
 *  cannot typecheck it. This runs it in a vm with a fake `self` and asserts
 *  the substitution semantics the message renderer documents: {{match}},
 *  $n/$<name>, trim strings and {{user}}/{{char}} macros. */
import { describe, it, expect } from "bun:test";
import vm from "node:vm";
import { MAX_OUTPUT_CHARS, WORKER_SRC } from "../src/lib/safe-regex.js";

interface Job {
  find: string;
  flags?: string;
  replace?: string;
  trims?: string[];
  macros?: Record<string, string>;
  input: string;
}

function runJob(job: Job) {
  const messages: Array<{ ok: boolean; output?: string; error?: string; tooBig?: boolean }> = [];
  const self = {
    postMessage: (m: { ok: boolean; output?: string; error?: string; tooBig?: boolean }) => { messages.push(m); },
    onmessage: null as null | ((e: { data: Record<string, unknown> }) => void),
  };
  const ctx = vm.createContext({ self });
  vm.runInContext(WORKER_SRC, ctx);
  self.onmessage?.({ data: { id: 1, flags: "g", replace: "", trims: [], ...job } });
  const first = messages[0];
  if (!first) throw new Error("worker produced no result");
  return first;
}

describe("regex worker semantics", () => {
  it("substitutes captures, named groups, {{match}} and trim strings", () => {
    expect(runJob({ find: "a(b)", replace: "[$1]", input: "xaby" }).output).toBe("x[b]y");
    expect(runJob({ find: "(?<word>\\w+)", replace: "<$<word>>", input: "hi there" }).output).toBe("<hi> <there>");
    expect(runJob({ find: "\\d+", replace: "-{{match}}-", input: "a1b22" }).output).toBe("a-1-b-22-");
    // trims erase from the match and from every substituted capture
    expect(runJob({ find: "(\\d+)", replace: "$1", trims: ["0"], input: "a10b" }).output).toBe("a1b");
  });

  it("substitutes user/char macros in the replacement", () => {
    expect(runJob({ find: "X", replace: "{{char}}", macros: { user: "Alice", char: "Bob" }, input: "X" }).output).toBe("Bob");
    // $& is not a studio token: it stays literal, and macros still apply
    expect(runJob({ find: "X", replace: "$&{{user}}", macros: { user: "Alice", char: "Bob" }, input: "X" }).output).toBe("$&Alice");
  });

  it("survives zero-length matches without hanging", () => {
    const r = runJob({ find: "a*", replace: "_", input: "ba" });
    expect(r.ok).toBe(true);
    expect(r.output).toContain("_");
  });

  // Molfar.Vertep#442: the time limit does not bound memory. A lazy pattern matches the empty string at every
  // position, so an HTML wrapper as the replacement is written thousands of times into one message.
  it("drops a result past the size cap and leaves the text alone", () => {
    const wrapper = '<div class="x" style="color:red;padding:4px;margin:2px;border:1px solid #333;background:#eee">$1</div>'.repeat(10);
    const r = runJob({ find: "(.*?)", flags: "gs", replace: wrapper, input: "word ".repeat(2000) });
    expect(r.ok).toBe(false);
    expect(r.tooBig).toBe(true);
    expect(r.output).toBeUndefined();
  });

  it("keeps an ordinary decoration far under the cap", () => {
    const r = runJob({ find: "\\*([^*]+)\\*", replace: '<em class="a" style="color:#c33">$1</em>', input: "he *waved* and *left*. ".repeat(500) });
    expect(r.ok).toBe(true);
    expect(r.output!.length).toBeLessThan(MAX_OUTPUT_CHARS / 10);
  });
});
