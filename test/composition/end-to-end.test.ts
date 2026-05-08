import { Intents } from "@statewalker/shared-intents";
import { writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { getWorkspace, runChangeWorkspace } from "@statewalker/workspace-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import initAgentRuntime, {
  AgentRuntimeAdapter,
} from "@/fragments/agent-runtime";
import initCatalogRegistry from "@/fragments/catalog-registry";
import initChat from "@/fragments/chat";
import initDock from "@/fragments/dock";
import initProviders, {
  emptyProvidersConfig,
  Providers,
} from "@/fragments/providers";
import initSettings from "@/fragments/settings";
import initSpecStore from "@/fragments/spec-store";
import initWorkspaceBridge from "@/fragments/workspace-bridge";

/**
 * End-to-end integration test for the M3 milestone (Wave 4.4).
 * Exercises the cross-fragment contract chain at the logic-only
 * layer (no React):
 *
 *   1. All built-in logic fragments register against the same
 *      Workspace.
 *   2. `runChangeWorkspace` opens the workspace against a
 *      MemFilesApi.
 *   3. `Providers.saveProviders` writes credentials + an active
 *      OpenAI model selection.
 *   4. The providers manager contributes a descriptor to
 *      `providers:remote` and resolves `ActiveModel`.
 *   5. The agent-runtime manager observes ActiveModel, builds the
 *      AgentRuntime, and `AgentRuntimeAdapter.getState().status`
 *      becomes `"ready"`.
 *
 * All of this happens without any chat-mini-app code editing the
 * intermediate steps directly — the slot bus + adapters carry the
 * cross-fragment data.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("chat-mini end-to-end (logic fragments)", () => {
  it("connect folder → save providers → ActiveModel resolves → AgentRuntime ready", async () => {
    const ctx: Record<string, unknown> = {};
    const cleanups: Array<() => Promise<void> | void> = [];

    cleanups.push(initCatalogRegistry(ctx));
    cleanups.push(initSpecStore(ctx));
    cleanups.push(initDock(ctx));
    cleanups.push(initWorkspaceBridge(ctx));
    cleanups.push(initAgentRuntime(ctx));
    cleanups.push(initSettings(ctx));
    cleanups.push(initProviders(ctx));
    cleanups.push(initChat(ctx));

    try {
      const workspace = getWorkspace(ctx);
      const intents = workspace.requireAdapter(Intents);
      const providers = workspace.requireAdapter(Providers);
      const adapter = workspace.requireAdapter(AgentRuntimeAdapter);

      // Pre-seed providers.json so the providers manager picks it
      // up on workspace.open(). Mirrors the real flow where the
      // file lives in the user's directory before they connect.
      const files = new MemFilesApi();
      await writeText(
        files,
        "/.settings/providers.json",
        JSON.stringify({
          ...emptyProvidersConfig,
          remote: { openai: { apiKey: "sk-test-fixture" } },
          active: { providerId: "openai", modelId: "gpt-4o" },
        }),
      );

      // Fire the canonical workspace-change intent — the
      // workspace-bridge handler runs close → setFileSystem →
      // open, which fires onLoad listeners (chat, providers,
      // ...) and triggers the rebuild chain.
      await runChangeWorkspace(intents, { files, label: "test" }).promise;

      // Drain debounced rebuild + buildRuntime promise.
      await vi.runAllTimersAsync();
      await vi.runAllTimersAsync();

      const state = adapter.getState();
      expect(state.status).toBe("ready");
      if (state.status === "ready") {
        expect(state.activeProviderId).toBe("openai");
        expect(state.activeModelId).toBe("gpt-4o");
      }
      expect(providers.config.active.providerId).toBe("openai");

      // Switching to no active model collapses back to no-active-model.
      await providers.saveProviders({
        ...providers.config,
        active: {},
      });
      await vi.runAllTimersAsync();
      expect(adapter.getState().status).toBe("no-active-model");
    } finally {
      for (const fn of cleanups.reverse()) await fn();
    }
  });
});
