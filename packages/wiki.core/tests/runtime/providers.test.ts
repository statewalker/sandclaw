import { embed, generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveProvidersFromEnv } from "../../src/index.js";

/** Stub `fetch`, recording each request URL and auth header, answering with `body`. */
function stubFetch(body: unknown): { url: string; auth: string | null }[] {
  const calls: { url: string; auth: string | null }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveProvidersFromEnv — openrouter", () => {
  const env = { WIKI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-or-test" };

  it("requires OPENROUTER_API_KEY", () => {
    expect(() => resolveProvidersFromEnv({ WIKI_PROVIDER: "openrouter" })).toThrow(
      "missing required env var OPENROUTER_API_KEY",
    );
  });

  it("defaults to OpenRouter-namespaced OpenAI models", () => {
    const resolved = resolveProvidersFromEnv(env);
    expect(resolved.models).toEqual({
      default: "openai/gpt-4.1-mini",
      queryStrong: "openai/gpt-4.1",
    });
    expect(resolved.embedModel).toBe("openai/text-embedding-3-small");
    expect(resolved.dimensionality).toBe(1536);
  });

  it("sends chat completions to OpenRouter with the key", async () => {
    const calls = stubFetch({
      id: "1",
      created: 0,
      model: "openai/gpt-4.1-mini",
      choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    const { provider, models } = resolveProvidersFromEnv(env);
    const result = await generateText({
      model: provider.languageModel(models.default),
      prompt: "x",
    });
    expect(result.text).toBe("hi");
    expect(calls[0]).toEqual({
      url: "https://openrouter.ai/api/v1/chat/completions",
      auth: "Bearer sk-or-test",
    });
  });

  it("sends embeddings to OpenRouter", async () => {
    const calls = stubFetch({
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
    const { provider, embedModel } = resolveProvidersFromEnv(env);
    const result = await embed({ model: provider.textEmbeddingModel(embedModel), value: "x" });
    expect(result.embedding).toEqual([0.1, 0.2]);
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/embeddings");
  });
});
