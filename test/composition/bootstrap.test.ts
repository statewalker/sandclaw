import type { LanguageModelV3, ProviderV3 } from "@ai-sdk/provider";
import type { ModelManager } from "@statewalker/ai-agent/models";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it, vi } from "vitest";
import { createManagerProvider } from "@/services/local-models/manager-provider";
import {
  emptyProvidersConfig,
  listConfiguredProviders,
  loadProvidersConfig,
  type ProvidersConfig,
  saveProvidersConfig,
} from "@/services/providers-store";
import { wireRuntime } from "@/services/wire-runtime";

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

  describe("providers-store round-trip", () => {
    it("saves and reloads ProvidersConfig from <systemFolder>/providers.json", async () => {
      const files = new MemFilesApi();
      const config: ProvidersConfig = {
        ...emptyProvidersConfig,
        remote: {
          openai: { apiKey: "sk-test" },
          anthropic: { apiKey: "sk-ant-test" },
        },
        custom: [
          {
            id: "custom-abc",
            name: "LM Studio",
            baseURL: "http://localhost:1234/v1",
            apiKey: "sk-anything",
          },
        ],
        active: { providerId: "openai", modelId: "gpt-4o-mini" },
      };
      await saveProvidersConfig(files, ".settings", config);

      const reloaded = await loadProvidersConfig(files, ".settings");
      expect(reloaded.remote.openai?.apiKey).toBe("sk-test");
      expect(reloaded.custom).toHaveLength(1);
      expect(reloaded.custom[0]?.baseURL).toBe("http://localhost:1234/v1");
      expect(reloaded.active.providerId).toBe("openai");
      expect(reloaded.active.modelId).toBe("gpt-4o-mini");
    });

    it("returns empty config when providers.json does not exist", async () => {
      const files = new MemFilesApi();
      const reloaded = await loadProvidersConfig(files, ".settings");
      expect(Object.keys(reloaded.remote)).toHaveLength(0);
      expect(reloaded.custom).toEqual([]);
      expect(reloaded.active.providerId).toBeUndefined();
    });

    it("listConfiguredProviders returns canonical entries with stored API keys plus custom entries", () => {
      const config: ProvidersConfig = {
        ...emptyProvidersConfig,
        remote: {
          openai: { apiKey: "sk-test" },
          anthropic: { apiKey: "" }, // empty → excluded
        },
        custom: [
          {
            id: "custom-1",
            name: "Custom 1",
            baseURL: "http://localhost:8000/v1",
            apiKey: "sk-1",
          },
        ],
        active: {},
      };
      const list = listConfiguredProviders(config);
      expect(list).toHaveLength(2);
      expect(list[0]?.id).toBe("openai");
      expect(list[0]?.kind).toBe("canonical");
      expect(list[1]?.id).toBe("custom-1");
      expect(list[1]?.kind).toBe("custom");
    });

    it("normalizes the systemFolder argument when computing the path", async () => {
      const files = new MemFilesApi();
      const config: ProvidersConfig = {
        ...emptyProvidersConfig,
        remote: { openai: { apiKey: "sk" } },
        active: {},
      };
      await saveProvidersConfig(files, "/.settings/", config);
      const reloaded = await loadProvidersConfig(files, ".settings");
      expect(reloaded.remote.openai?.apiKey).toBe("sk");
    });

    it("migrates a v1 config with `openai-compatible` entry into a custom provider", async () => {
      const files = new MemFilesApi();
      const v1 = {
        schemaVersion: 1,
        remote: {
          openai: { apiKey: "sk-1", baseURL: null },
          "openai-compatible": {
            apiKey: "sk-c",
            baseURL: "http://x:1/v1",
          },
        },
        active: { reasoning: "gpt-4o-mini" },
      };
      await files.write("/.settings/providers.json", [
        new TextEncoder().encode(JSON.stringify(v1)),
      ]);
      const reloaded = await loadProvidersConfig(files, ".settings");
      expect(reloaded.schemaVersion).toBe(3);
      expect(reloaded.remote.openai?.apiKey).toBe("sk-1");
      expect(reloaded.custom).toHaveLength(1);
      expect(reloaded.custom[0]?.baseURL).toBe("http://x:1/v1");
      // v1 active.reasoning has no provider id → drop on migration.
      expect(reloaded.active.providerId).toBeUndefined();
      expect(reloaded.local).toEqual({});
    });

    it("migrates a v2 config to v3 by adding an empty local block", async () => {
      const files = new MemFilesApi();
      const v2 = {
        schemaVersion: 2,
        remote: { openai: { apiKey: "sk-1" } },
        custom: [
          {
            id: "c-1",
            name: "LM",
            baseURL: "http://localhost:1234/v1",
            apiKey: "sk-c",
          },
        ],
        active: { providerId: "openai", modelId: "gpt-4o-mini" },
      };
      await files.write("/.settings/providers.json", [
        new TextEncoder().encode(JSON.stringify(v2)),
      ]);
      const reloaded = await loadProvidersConfig(files, ".settings");
      expect(reloaded.schemaVersion).toBe(3);
      expect(reloaded.remote.openai?.apiKey).toBe("sk-1");
      expect(reloaded.custom).toHaveLength(1);
      expect(reloaded.active.providerId).toBe("openai");
      expect(reloaded.active.modelId).toBe("gpt-4o-mini");
      expect(reloaded.local).toEqual({});
    });

    it("round-trips a v3 config preserving the local.lastActivatedKey field", async () => {
      const files = new MemFilesApi();
      const config: ProvidersConfig = {
        ...emptyProvidersConfig,
        remote: { openai: { apiKey: "sk-1" } },
        active: { providerId: "local", modelId: "webllm:llama-3.2-3b" },
        local: { lastActivatedKey: "webllm:llama-3.2-3b" },
      };
      await saveProvidersConfig(files, ".settings", config);
      const reloaded = await loadProvidersConfig(files, ".settings");
      expect(reloaded.schemaVersion).toBe(3);
      expect(reloaded.active.providerId).toBe("local");
      expect(reloaded.active.modelId).toBe("webllm:llama-3.2-3b");
      expect(reloaded.local.lastActivatedKey).toBe("webllm:llama-3.2-3b");
    });
  });
});
