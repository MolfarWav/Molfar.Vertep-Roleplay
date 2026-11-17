/** A failed reply from a model that refuses tools says so and names the way out (Molfar.Vertep#306). */
import { describe, expect, it, mock } from "bun:test";

const calls: { fn: string; args: unknown[] }[] = [];
mock.module("sonner", () => ({ toast: { error: (...args: unknown[]) => { calls.push({ fn: "error", args }) } } }));
const { toolsRefused, toastGenerationError } = await import("../src/lib/gen-error");

describe("a model that cannot use tools", () => {
  it.each([
    'model error: 404: {"message":"No endpoints found that support tool use. To learn more about provider routing, visit: https://openrouter.ai/docs/provider-routing","code":404}',
    "model error: 400: registry.ollama.ai/library/gemma:2b does not support tools",
    "model error: 400: This model doesn't support function calling",
    "model error: 400: tools are not supported by this model",
    "model error: 400: Function calling is not enabled for this model",
    "model error: 422: tool_choice parameter is not supported",
  ])("is recognised: %s", (m) => expect(toolsRefused(m)).toBe(true));

  it.each([
    "model error: 429: Rate limit exceeded",
    "model error: 404: model not found",
    "model error: 400: context length exceeded",
    "model error: Provider finish_reason: content_filter",
    "model error: 502: Bad gateway while calling the dice tool server",
  ])("other errors are left alone: %s", (m) => expect(toolsRefused(m)).toBe(false));

  it("the toast says what to do and opens the Tools page", () => {
    calls.length = 0;
    let opened = 0;
    toastGenerationError(new Error("model error: 404: No endpoints found that support tool use."), "en", () => { opened++ });
    expect(calls).toHaveLength(1);
    const [title, opts] = calls[0]!.args as [string, { description: string; action: { label: string; onClick: () => void } }];
    expect(title).toBe("This model cannot use tools.");
    expect(opts.description).toContain("Tool Calling");
    expect(opts.action.label).toBe("Open Tools");
    opts.action.onClick();
    expect(opened).toBe(1);
  });

  it("any other error is shown as it came", () => {
    calls.length = 0;
    toastGenerationError(new Error("model error: 429: Rate limit exceeded"), "en", () => {});
    expect(calls[0]!.args).toEqual(["model error: 429: Rate limit exceeded"]);
  });
});
