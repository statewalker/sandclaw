import { ActiveModel, AgentRuntimeAdapter } from "@statewalker/ai-agent-runtime.core";
import { AiConfigImpl } from "@statewalker/ai-config.core";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { Secrets, Workspace } from "@statewalker/workspace.core";
import { afterEach, describe, expect, it } from "vitest";
import { applyRemoteActive, applyRuntimeEmptyState } from "../../src/init-active-model-projection.js";

class FakeSecrets extends Secrets {
  private readonly map = new Map<string, unknown>();
  async get(k: string): Promise<unknown> {
    return this.map.get(k);
  }
  async set(k: string, v: unknown): Promise<void> {
    this.map.set(k, v);
  }
  async delete(k: string): Promise<boolean> {
    return this.map.delete(k);
  }
  async list(): Promise<string[]> {
    return [...this.map.keys()];
  }
  onUpdate(): () => void {
    return () => {};
  }
}

async function bootConfig(): Promise<AiConfigImpl> {
  const ws = new Workspace().setFileSystem(new MemFilesApi());
  ws.setAdapter(Secrets, () => new FakeSecrets());
  const cfg = new AiConfigImpl(ws);
  await cfg.load();
  return cfg;
}

const origFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = origFetch;
});

describe("applyRemoteActive (AiConfig → ActiveModel bridge)", () => {
  it("mirrors a remote active selection into ActiveModel with a buildable provider", async () => {
    const cfg = await bootConfig();
    await cfg.upsertConnection(
      { id: "c1", type: "openai", name: "OpenAI", starredModelIds: [] },
      "sk-1",
    );
    await cfg.setActive("c1", "gpt-4o");

    const activeModel = new ActiveModel();
    await applyRemoteActive(cfg, activeModel);

    const v = activeModel.get();
    expect(v?.kind).toBe("remote");
    expect(v?.providerId).toBe("c1");
    expect(v?.modelId).toBe("gpt-4o");
    // The pre-resolved provider is usable by the agent runtime.
    expect(typeof v?.createProvider().languageModel).toBe("function");
  });

  it("ignores a local active selection (owned by the local-model path)", async () => {
    const cfg = await bootConfig();
    await cfg.setActive("local", "smollm2");
    const activeModel = new ActiveModel();
    await applyRemoteActive(cfg, activeModel);
    expect(activeModel.get()).toBeNull();
  });

  it("no-ops when there is no active selection", async () => {
    const cfg = await bootConfig();
    const activeModel = new ActiveModel();
    await applyRemoteActive(cfg, activeModel);
    expect(activeModel.get()).toBeNull();
  });
});

describe("applyRuntimeEmptyState (single owner of the runtime empty-state)", () => {
  it("sets no-providers when there are no connections and no active model", async () => {
    const cfg = await bootConfig();
    const activeModel = new ActiveModel();
    const adapter = new AgentRuntimeAdapter();
    applyRuntimeEmptyState(cfg, activeModel, adapter);
    expect(adapter.getState().status).toBe("no-providers");
  });

  it("sets no-active-model when connections exist but none is active", async () => {
    const cfg = await bootConfig();
    await cfg.upsertConnection(
      { id: "c1", type: "openai", name: "OpenAI", starredModelIds: [] },
      "sk-1",
    );
    const activeModel = new ActiveModel();
    const adapter = new AgentRuntimeAdapter();
    applyRuntimeEmptyState(cfg, activeModel, adapter);
    expect(adapter.getState().status).toBe("no-active-model");
  });

  it("leaves the adapter alone when a local model is active", async () => {
    const cfg = await bootConfig();
    const activeModel = new ActiveModel();
    activeModel.set({
      kind: "local",
      providerId: "local",
      modelId: "smollm2",
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub for the test
      createProvider: () => ({}) as any,
    });
    const adapter = new AgentRuntimeAdapter();
    applyRuntimeEmptyState(cfg, activeModel, adapter);
    // A model is active — the manager owns ready/error; we must not override it.
    expect(adapter.getState().status).toBe("loading");
  });
});
