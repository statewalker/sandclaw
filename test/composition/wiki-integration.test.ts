import { agentToolsSlot } from "@statewalker/ai-agent-runtime";
import { AiConfig } from "@statewalker/ai-config";
import { Slots } from "@statewalker/shared-slots";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { SearchAdapter, WikiNature, WikiQuery, WikiSnapshotsAdapter } from "@statewalker/wiki";
import { Workspace } from "@statewalker/workspace.core";
import { describe, expect, it } from "vitest";
import initWiki, { deriveWikiConfig } from "../../src/init-wiki.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A minimal AiConfig with one connection, an active chat model, and one
 * embedding-capable model — enough to drive the registry + `deriveWikiConfig`. */
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

describe("wiki integration in chat-mini.app", () => {
  it("registerWiki via the AiConfig-derived provider resolves the wiki adapters", async () => {
    const workspace = new Workspace().setFileSystem(new MemFilesApi());
    await workspace.open();
    workspace.setAdapter(AiConfig, () => fakeAiConfig());
    workspace.setAdapter(Slots, () => new Slots());
    const ctx: Record<string, unknown> = { "workspace:workspace": workspace };

    const cleanup = initWiki(ctx);
    // `initWiki` builds the provider registry asynchronously, then `registerWiki`.
    await tick();

    const project = await workspace.getProject("proj", true);
    if (!project) throw new Error("no project");
    expect(project.getAdapter(WikiNature)).toBeTruthy();
    expect(project.getAdapter(WikiQuery)).toBeTruthy();
    expect(project.getAdapter(SearchAdapter)).toBeTruthy();
    expect(project.getAdapter(WikiSnapshotsAdapter)).toBeTruthy();

    cleanup();
  });

  it("contributes wiki_search + wiki_ask to the agent:tools slot", async () => {
    const workspace = new Workspace().setFileSystem(new MemFilesApi());
    await workspace.open();
    workspace.setAdapter(AiConfig, () => fakeAiConfig());
    const slots = new Slots();
    workspace.setAdapter(Slots, () => slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": workspace };

    const cleanup = initWiki(ctx);
    await tick();

    const toolKeys = slots
      .getSnapshot(agentToolsSlot)
      .flatMap((contribution) => Object.keys(contribution as Record<string, unknown>));
    expect(toolKeys).toContain("wiki_search");
    expect(toolKeys).toContain("wiki_ask");

    cleanup();
    // Disposed: the slot contribution is withdrawn.
    expect(slots.getSnapshot(agentToolsSlot)).toHaveLength(0);
  });

  it("deriveWikiConfig builds connectionId:modelId references from the active selection", () => {
    expect(deriveWikiConfig(fakeAiConfig())).toEqual({
      models: { default: "openai:gpt-4.1-mini" },
      embedModel: "openai:text-embedding-3-small",
      dimensionality: 1536,
    });
  });
});
