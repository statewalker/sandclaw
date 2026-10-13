import { describe, expect, it } from "vitest";
import { costOf } from "../../src/index.js";

describe("costOf", () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };

  it("prices an OpenRouter vendor-prefixed id like the bare model id", () => {
    expect(costOf("openai/gpt-4.1-mini", usage)).toEqual(costOf("gpt-4.1-mini", usage));
    expect(costOf("openai/gpt-4.1-mini", usage).totalUsd).toBeCloseTo(2.0);
  });
});
