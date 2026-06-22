import initChat from "@repo/chat-mini.chat/fragment";
import { AgentRuntimeAdapter } from "@statewalker/ai-agent-runtime.core";
import initAgentRuntime from "@statewalker/ai-agent-runtime.core/fragment";
import { AiConfig } from "@statewalker/ai-config.core";
import initAiConfig from "@statewalker/ai-config.core/fragment";
import initAiLocalModels from "@statewalker/ai-local-models.core/fragment";
import initActiveModelProjection from "../../src/init-active-model-projection.js";
import initDock from "@statewalker/shell.core/fragment";
import {
  MARKDOWN_VIEWER_CATALOG_ID,
  markdownViewerSpecId,
} from "@statewalker/mime.view.markdown";
import initMarkdownViewer from "@statewalker/mime.view.markdown/fragment";
import {
  mimeRenderersSlot,
  VisualizeFileCommand,
} from "@statewalker/mime.core";
import initFiles from "@statewalker/mime.core/fragment";
import { SpecStore } from "@statewalker/render.core";
import initSpecStore from "@statewalker/render.core/fragment";
import initSettings from "@statewalker/settings.core/fragment";
import { Commands } from "@statewalker/shared-commands";
import { Slots } from "@statewalker/shared-slots";
import { writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ChangeWorkspaceCommand, getWorkspace } from "@statewalker/workspace.core";
import initWorkspaceFiles from "@statewalker/workspace.core/files-fragment";
import initWorkspaceBridge from "@statewalker/workspace.browser/fragment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end integration test for the cross-fragment contract chain at the
 * logic-only layer (no React), post AI-migration:
 *
 *   1. All built-in logic fragments register against the same Workspace,
 *      including `ai-config` (unified config), the chat-app active-model
 *      projection (AiConfig → `ActiveModel` + runtime empty-state), and
 *      `ai-local-models` (the local-model domain with its own store).
 *   2. `ChangeWorkspaceCommand` opens the workspace against a MemFilesApi
 *      (registering `Secrets` via `initWorkspace`).
 *   3. With no AiConfig connections, the runtime is `no-providers`.
 *   4. Seeding an AiConfig connection (key → Secrets) + an active selection
 *      projects a remote `ActiveModel` whose `createProvider()` is buildable.
 *   5. The agent-runtime manager observes `ActiveModel`, builds the AgentRuntime,
 *      and `AgentRuntimeAdapter.getState().status` becomes `"ready"`.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("chat-mini end-to-end (logic fragments)", () => {
  it("connect folder → seed AiConfig → ActiveModel resolves → AgentRuntime ready", async () => {
    const ctx: Record<string, unknown> = {};
    const cleanups: Array<() => Promise<void> | void> = [];

    cleanups.push(await initSpecStore(ctx));
    cleanups.push(initDock(ctx));
    cleanups.push(initWorkspaceBridge(ctx));
    cleanups.push(initAgentRuntime(ctx));
    cleanups.push(initSettings(ctx));
    cleanups.push(await initAiConfig(ctx));
    cleanups.push(initActiveModelProjection(ctx));
    cleanups.push(initAiLocalModels(ctx));
    cleanups.push(initWorkspaceFiles(ctx));
    cleanups.push(initFiles(ctx));
    cleanups.push(initMarkdownViewer(ctx));
    cleanups.push(initChat(ctx));

    try {
      const workspace = getWorkspace(ctx);
      const commands = workspace.requireAdapter(Commands);
      const adapter = workspace.requireAdapter(AgentRuntimeAdapter);
      const slots = workspace.requireAdapter(Slots);
      const store = workspace.requireAdapter(SpecStore);

      const files = new MemFilesApi();

      // Fire the canonical workspace-change command — the workspace-bridge
      // handler runs close → initWorkspace (registers Secrets/Settings) →
      // open, firing onLoad listeners (ai-config.load, the chat-app
      // active-model projection, ai-local-models.load, ...) and triggering
      // the rebuild chain.
      await commands.call(ChangeWorkspaceCommand, { files, label: "test" })
        .promise;
      await vi.runAllTimersAsync();

      // No AiConfig connections yet → the runtime empty-state owner
      // (the chat-app active-model projection) reports `no-providers`.
      expect(adapter.getState().status).toBe("no-providers");

      // Seed an AiConfig connection (key → Secrets) and an active selection.
      // This fires AiConfig.onUpdate → applyRemoteActive projects a remote
      // ActiveModel whose pre-resolved provider is buildable.
      const aiConfig = workspace.requireAdapter(AiConfig);
      await aiConfig.upsertConnection(
        { id: "openai", type: "openai", name: "OpenAI", starredModelIds: [] },
        "sk-test-fixture",
      );
      await aiConfig.setActive("openai", "gpt-4o");

      // Drain debounced rebuild + buildRuntime promise.
      await vi.runAllTimersAsync();
      await vi.runAllTimersAsync();

      const state = adapter.getState();
      expect(state.status).toBe("ready");
      if (state.status === "ready") {
        expect(state.activeProviderId).toBe("openai");
        expect(state.activeModelId).toBe("gpt-4o");
      }

      // Wave 5.2: markdown-viewer registers into the
      // `files:mime-renderers` slot, and `files:visualize` for an
      // .md URI registers a spec in `SpecStore` and asks the dock
      // fragment to open a panel. The dock host queues the call
      // until a real `<DockviewReact>` mounts (no React here), so
      // we don't await the visualize promise — we only verify the
      // synchronous SpecStore.create runs before the queued await.
      const renderers = slots.getSnapshot(mimeRenderersSlot);
      expect(renderers).toHaveLength(1);
      expect(renderers[0]?.mimeTypePattern).toBe("text/markdown");

      await writeText(files, "/note.md", "# hello");
      // Suppress the never-settling promise — the dock host's
      // pending queue holds the show-panel call indefinitely.
      void commands
        .call(VisualizeFileCommand, { uri: "/note.md" })
        .promise.catch(() => {});
      const specRecord = store.get(markdownViewerSpecId("/note.md"));
      expect(specRecord?.catalogId).toBe(MARKDOWN_VIEWER_CATALOG_ID);
    } finally {
      for (const fn of cleanups.reverse()) await fn();
    }
  });
});
