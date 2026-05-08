import { createDefaultCatalog } from "@statewalker/ai-agent/models";
import type {
  ProviderDescriptor,
  ProviderModelInfo,
} from "../../public/types.js";
import { createRemoteProvider } from "../create-remote-provider.js";

function listOpenAIModels(): readonly ProviderModelInfo[] {
  const catalog = createDefaultCatalog();
  const out: ProviderModelInfo[] = [];
  for (const entry of Object.values(catalog)) {
    if (entry.runtime !== "remote") continue;
    if (entry.provider !== "openai") continue;
    out.push({
      id: entry.modelId,
      label: entry.label ?? entry.modelId,
    });
  }
  return out;
}

export function buildOpenAIDescriptor(apiKey: string): ProviderDescriptor {
  return {
    id: "openai",
    label: "OpenAI",
    kind: "canonical",
    createProvider: () => createRemoteProvider("openai", apiKey),
    listModels: listOpenAIModels,
  };
}
