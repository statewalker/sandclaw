import { agentSystemPromptSlot } from "@statewalker/ai-agent-runtime";
import { AiConfig } from "@statewalker/ai-config";
import { Commands } from "@statewalker/shared-commands";
import { Slots } from "@statewalker/shared-slots";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { WikiAskCommand, WikiSearchCommand } from "@statewalker/wiki";
import { Workspace } from "@statewalker/workspace.core";
import { describe, expect, it } from "vitest";
import initWiki from "../../src/init-wiki.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

async function waitFor(fn: () => boolean, tries = 100): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (fn()) return true;
    await tick();
  }
  return false;
}

/** A minimal AiConfig: one connection, an active chat model, one embedding model. */
function fakeAiConfig(): AiConfig {
  const provider = {
    languageModel: (modelId: string) => ({ modelId }),
    embeddingModel: (modelId: string) => ({ modelId }),
  };
  return {
    listConnections: () => [{ id: "openai", type: "openai", name: "OpenAI", starredModelIds: [] }],
    getProvider: async () => provider,
    onUpdate: () => () => {},
    getActive: () => ({ connectionId: "openai", modelId: "gpt-4.1-mini" }),
    getModels: (_id: string, capability?: string) =>
      capability === "embedding" ? [{ id: "text-embedding-3-small", label: "embed" }] : [],
  } as unknown as AiConfig;
}

describe("wiki commands + steering in chat-mini.app", () => {
  it("registers the commands, contributes the steering block, and disposes on teardown", async () => {
    const workspace = new Workspace().setFileSystem(new MemFilesApi());
    await workspace.open();
    workspace.setAdapter(AiConfig, () => fakeAiConfig());
    const slots = workspace.requireAdapter(Slots);
    const commands = workspace.requireAdapter(Commands);
    const ctx: Record<string, unknown> = { "workspace:workspace": workspace };

    const cleanup = initWiki(ctx);

    // The steering block lands on the agent:system-prompt slot once the fragment is ready.
    const hasSteering = () =>
      slots.getSnapshot(agentSystemPromptSlot).some((b) => b.includes("wiki_search"));
    expect(await waitFor(hasSteering)).toBe(true);

    // The commands are registered and invocable (no bound wiki → empty, not an error).
    const search = await commands.call(WikiSearchCommand, { query: "anything" }).promise;
    const ask = await commands.call(WikiAskCommand, { question: "anything?" }).promise;
    expect(search).toEqual({ availableWikis: [], matches: [] });
    expect(ask).toEqual({ availableWikis: [], answers: [] });

    // Teardown removes the steering contribution.
    cleanup();
    expect(slots.getSnapshot(agentSystemPromptSlot).some((b) => b.includes("wiki_search"))).toBe(
      false,
    );
  });
});
