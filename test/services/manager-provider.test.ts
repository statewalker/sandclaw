import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { ModelManager } from "@statewalker/ai-agent/models";
import { describe, expect, it } from "vitest";
import { createManagerProvider } from "@/services/local-models/manager-provider";

function fakeManager(
  modelsByKey: Record<string, LanguageModelV3>,
): ModelManager {
  return {
    store: {
      getLanguageModel(key: string) {
        const model = modelsByKey[key];
        if (!model) throw new Error(`not ready: ${key}`);
        return model;
      },
    },
  } as unknown as ModelManager;
}

describe("createManagerProvider", () => {
  it("delegates to manager.store.getLanguageModel(activeKey)", () => {
    const stub = { fake: "model-instance" } as unknown as LanguageModelV3;
    const provider = createManagerProvider(
      fakeManager({ "webllm:llama-3.2-3b": stub }),
      "webllm:llama-3.2-3b",
    );
    expect(provider.languageModel("webllm:llama-3.2-3b")).toBe(stub);
  });

  it("throws when asked for a model id different from the active key", () => {
    const stub = {} as unknown as LanguageModelV3;
    const provider = createManagerProvider(
      fakeManager({ "webllm:llama-3.2-3b": stub }),
      "webllm:llama-3.2-3b",
    );
    expect(() => provider.languageModel("webllm:other")).toThrow(
      /active key is "webllm:llama-3\.2-3b"/,
    );
  });

  it("propagates the manager's not-ready error if the model isn't activated", () => {
    const provider = createManagerProvider(
      fakeManager({}),
      "webllm:llama-3.2-3b",
    );
    expect(() => provider.languageModel("webllm:llama-3.2-3b")).toThrow(
      /not ready/,
    );
  });
});
