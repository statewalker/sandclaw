import { agentToolsSlot } from "@statewalker/ai-agent-runtime";
import { AiConfig } from "@statewalker/ai-config";
import { Slots } from "@statewalker/shared-slots";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { Workspace } from "@statewalker/workspace.core";
import { describe, expect, it } from "vitest";
import initWiki from "../../src/init-wiki.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Poll `fn` until it returns truthy or `tries` ticks elapse. */
async function waitFor(fn: () => Promise<boolean> | boolean, tries = 100): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return true;
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

const NATURE = JSON.stringify({
  models: { default: "openai:gpt-4.1-mini" },
  embedModel: "openai:text-embedding-3-small",
  dimensionality: 2,
});

/** A ToolSet contributed to `agent:tools` carrying the wiki tools. */
function wikiToolNames(slots: Slots): string[] {
  const sets = slots.getSnapshot(agentToolsSlot);
  for (const set of sets) {
    if (set && typeof set === "object" && "wiki_search" in set) return Object.keys(set);
  }
  return [];
}

describe("wiki project binding in chat-mini.app", () => {
  it("binds only wiki-nature projects, exposes the tools, and stops on teardown", async () => {
    const filesApi = new MemFilesApi({
      initialFiles: {
        "wiki-proj/.project/nature.wiki.json": NATURE,
        "wiki-proj/doc.md": "Acme is a company.",
        "plain-proj/readme.md": "just a plain folder",
      },
    });
    const workspace = new Workspace().setFileSystem(filesApi);
    await workspace.open();
    workspace.setAdapter(AiConfig, () => fakeAiConfig());
    const slots = workspace.requireAdapter(Slots);
    const ctx: Record<string, unknown> = { "workspace:workspace": workspace };

    const cleanup = initWiki(ctx);

    // The wiki tools are contributed once the provider registry is ready.
    expect(await waitFor(() => wikiToolNames(slots).length > 0)).toBe(true);
    expect(wikiToolNames(slots).sort()).toEqual(["wiki_ask", "wiki_search"]);

    // The wiki-nature project is bound → its scan loop runs (writes scanner state).
    // (A scan with the stub provider runs the scanner + content stages; full
    // index correctness is covered by the @statewalker/wiki package tests.)
    const scanned = () =>
      filesApi.stats("wiki-proj/.project/state/scanner.json").then((s) => s != null);
    expect(await waitFor(scanned)).toBe(true);

    // The plain project has no wiki nature → it is never bound, never scanned.
    expect(await filesApi.stats("plain-proj/.project")).toBeFalsy();

    // Teardown disposes the slot contribution (and stops the scan loops).
    cleanup();
    expect(wikiToolNames(slots)).toEqual([]);
  });
});
