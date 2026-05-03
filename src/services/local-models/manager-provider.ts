import type { LanguageModelV3, ProviderV3 } from "@ai-sdk/provider";
import type { ModelManager } from "@statewalker/ai-agent/models";

/**
 * Wrap an already-activated local model as a `ProviderV3`. The provider's
 * name is the literal `"local"` and the only exposed model id is
 * `activeKey` (the catalog key of the currently-loaded WebLLM model).
 *
 * The runtime calls `provider.languageModel(modelId)` to resolve a model
 * for routing; we delegate to `manager.store.getLanguageModel(activeKey)`
 * which throws if the model isn't ready.
 */
export function createManagerProvider(
  manager: ModelManager,
  activeKey: string,
): ProviderV3 {
  return {
    languageModel(modelId: string): LanguageModelV3 {
      if (modelId !== activeKey) {
        throw new Error(
          `local provider: requested model "${modelId}" but active key is "${activeKey}"`,
        );
      }
      return manager.store.getLanguageModel(activeKey);
    },
  } as unknown as ProviderV3;
}
