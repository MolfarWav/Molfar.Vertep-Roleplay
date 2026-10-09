import { describe, expect, it } from "bun:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { modelLimits, presetToBlock } from "../src/lib/model-params";
import { defaultSamplers } from "../src/lib/seed";
import type { ModelInfo, Preset } from "../src/lib/types";

const E = (await import(pathToFileURL(path.resolve(import.meta.dir, "../plugins/engine/plugin.js")).href)) as {
  limitsOf: (b: unknown) => { contextWindow: number; maxOutput: number };
  withModelLimits: (p: Record<string, unknown> | null, l: { contextWindow: number; maxOutput: number }) => Record<string, unknown> | null;
};

describe("model limits in the engine plugin", () => {
  it("takes only sane positive whole numbers from the request body", () => {
    expect(E.limitsOf({ contextWindow: 64000, maxOutput: 2048 })).toEqual({ contextWindow: 64000, maxOutput: 2048 });
    expect(E.limitsOf({ contextWindow: -1, maxOutput: 1.5 })).toEqual({ contextWindow: 0, maxOutput: 0 });
    expect(E.limitsOf({ contextWindow: "64000" })).toEqual({ contextWindow: 0, maxOutput: 0 });
    expect(E.limitsOf(null)).toEqual({ contextWindow: 0, maxOutput: 0 });
  });

  it("puts the model's numbers in place of the preset's, on a copy", () => {
    const preset = { name: "p", openai_max_context: 128000, openai_max_tokens: 4096 };
    const out = E.withModelLimits(preset, { contextWindow: 32000, maxOutput: 0 });
    expect(out).toMatchObject({ openai_max_context: 32000, openai_max_tokens: 4096 });
    expect(preset.openai_max_context).toBe(128000);
    expect(E.withModelLimits(preset, { contextWindow: 0, maxOutput: 0 })).toBe(preset);
    expect(E.withModelLimits(null, { contextWindow: 1000, maxOutput: 0 })).toBeNull();
  });
});

describe("the client side", () => {
  const model = { id: "m", ref: "nanogpt/m", provider: "NanoGPT", api: "openai-completions", context: 500000, maxOut: 0, reasoning: true, pricing: null } as unknown as ModelInfo;

  it("sends the model's window and its Chat block's max output", () => {
    expect(modelLimits("nanogpt/m", [model], { "nanogpt/m": { chat: { max_tokens: 3000 } } })).toEqual({ contextWindow: 500000, maxOutput: 3000 });
    expect(modelLimits("nanogpt/m", [model], {})).toEqual({ contextWindow: 500000 });
    expect(modelLimits("other/x", [model], {})).toEqual({});
    expect(modelLimits(null, [model], {})).toEqual({});
  });

  it("turns a preset's enabled samplers into a Chat block within the engine's ranges", () => {
    const s = defaultSamplers();
    s.temperature = { value: 0.95, enabled: true };
    s.top_k = { value: 40, enabled: false };
    s.rep_pen = { value: 9, enabled: true }; // out of the engine's range: left out
    s.maxTokens = 4096;
    s.seed = -1;
    s.reasoning = { ...s.reasoning, enabled: true, effort: "med", budget: 2048, autoParse: true, thinkTagOpen: "<think>", thinkTagClose: "</think>" };
    const block = presetToBlock({ samplers: s, extendedSamplers: { dry_multiplier: 0.8, note: "x" } } as unknown as Preset);
    expect(block.temperature).toBe(0.95);
    expect(block.top_k).toBeUndefined();
    expect(block.repetition_penalty).toBeUndefined();
    expect(block.max_tokens).toBe(4096);
    expect(block.seed).toBeUndefined();
    expect(block.reasoning).toBe("medium");
    expect(block.thinkingBudget).toBe(2048);
    expect(block.reasoningTags).toEqual({ open: "<think>", close: "</think>" });
    expect(block.params).toEqual({ dry_multiplier: 0.8 });
  });
});
