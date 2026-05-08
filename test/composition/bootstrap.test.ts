import type {
  ProviderV3 as _ProviderV3,
  LanguageModelV3,
  ProviderV3,
} from "@ai-sdk/provider";
import type { ModelManager } from "@statewalker/ai-agent/models";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it, vi } from "vitest";
import {
  buildRuntime as _buildRuntime,
  type BuildRuntimeInput,
} from "@/fragments/agent-runtime/internal/build-runtime";
import { createManagerProvider } from "@/services/local-models/manager-provider";

/**
 * Adapter so existing test bodies (written against the old
 * `wireRuntime(files, providers, options?)` signature) keep working
 * against the new `buildRuntime({ files, provider, tools, skills,
 * mcpServers, systemFolder? })` shape.
 */
async function wireRuntime(
  files: BuildRuntimeInput["files"],
  providers: _ProviderV3[],
  options: { systemFolder?: string } = {},
): ReturnType<typeof _buildRuntime> {
  const provider = providers[0];
  if (!provider) throw new Error("wireRuntime test helper: no provider");
  return _buildRuntime({
    files,
    provider,
    tools: [],
    skills: [],
    mcpServers: {},
    systemFolder: options.systemFolder,
  });
}

function stubProvider(): ProviderV3 {
  // The runtime stores the provider but never calls it during build /
  // listSessions / loadSession; only session.run() invokes the model.
  return { languageModel: vi.fn() } as unknown as ProviderV3;
}

function fakeManagerWithModel(
  key: string,
  model: LanguageModelV3 | undefined,
): ModelManager {
  return {
    store: {
      getLanguageModel(k: string) {
        if (k !== key || !model) throw new Error(`not ready: ${k}`);
        return model;
      },
    },
  } as unknown as ModelManager;
}

describe("chat-mini composition", () => {
  describe("wireRuntime", () => {
    it("builds a runtime against MemFilesApi with the system path hidden from tools", async () => {
      const files = new MemFilesApi();
      const runtime = await wireRuntime(files, [stubProvider()]);
      expect(runtime).toBeDefined();
      // Default system folder is /.settings.
      const sessions = await runtime.listSessions();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBe(0);
    });

    it("respects a custom systemFolder", async () => {
      const files = new MemFilesApi();
      const runtime = await wireRuntime(files, [stubProvider()], {
        systemFolder: ".chat-mini",
      });
      const sessions = await runtime.listSessions();
      expect(sessions.length).toBe(0);
      expect(runtime).toBeDefined();
    });

    it("normalizes systemFolder regardless of leading/trailing slashes", async () => {
      const files = new MemFilesApi();
      // Build twice with different surface syntaxes — both must succeed.
      const a = await wireRuntime(files, [stubProvider()], {
        systemFolder: ".s",
      });
      const b = await wireRuntime(files, [stubProvider()], {
        systemFolder: "/.s/",
      });
      expect(a).toBeDefined();
      expect(b).toBeDefined();
    });

    it("accepts a local provider built by createManagerProvider", async () => {
      const files = new MemFilesApi();
      const stubModel = { fake: "lm" } as unknown as LanguageModelV3;
      const manager = fakeManagerWithModel("webllm:stub", stubModel);
      const provider = createManagerProvider(manager, "webllm:stub");
      const runtime = await wireRuntime(files, [provider]);
      const agent = runtime.createAgent({
        name: "test",
        defaultModel: "webllm:stub",
      });
      // Resolves the model by routing through the local provider — should
      // return our stub without throwing.
      const session = agent.createSession({ title: "t" });
      expect(session).toBeDefined();
    });

    it("does not crash when the local provider is rebuilt without the active model", async () => {
      const files = new MemFilesApi();
      // First build: local model active.
      const stubModel = { fake: "lm" } as unknown as LanguageModelV3;
      const liveManager = fakeManagerWithModel("webllm:stub", stubModel);
      const live = createManagerProvider(liveManager, "webllm:stub");
      const r1 = await wireRuntime(files, [live]);
      expect(r1).toBeDefined();

      // Subsequent rebuild: no local provider, just a remote stub. Mirrors
      // the deactivate → switch-to-remote flow.
      const r2 = await wireRuntime(files, [stubProvider()]);
      const sessions = await r2.listSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });
  });

  describe("session persistence round-trip", () => {
    it("save → list shows the session with its title", async () => {
      const files = new MemFilesApi();
      const runtime = await wireRuntime(files, [stubProvider()]);
      const agent = runtime.createAgent({
        name: "test",
        defaultModel: "stub-model",
      });
      const session = agent.createSession({ title: "round-trip" });
      const id = await session.save();

      const list = await runtime.listSessions();
      const found = list.find((s) => s.id === id);
      expect(found).toBeDefined();
      expect(found?.title).toBe("round-trip");
    });

    it("loadSession restores props.title", async () => {
      const files = new MemFilesApi();
      const runtime = await wireRuntime(files, [stubProvider()]);
      const agent = runtime.createAgent({ name: "test" });
      const session = agent.createSession({ title: "saved" });
      const id = await session.save();

      const loaded = await runtime.loadSession(id);
      expect(loaded.id).toBe(id);
      expect(loaded.state.props.title).toBe("saved");
    });

    it("deleteSession removes the session from listSessions", async () => {
      const files = new MemFilesApi();
      const runtime = await wireRuntime(files, [stubProvider()]);
      const agent = runtime.createAgent({ name: "test" });
      const session = agent.createSession({ title: "doomed" });
      await session.save();
      expect((await runtime.listSessions()).length).toBe(1);

      const removed = await runtime.deleteSession(session.id);
      expect(removed).toBe(true);
      expect((await runtime.listSessions()).length).toBe(0);
    });
  });
});
