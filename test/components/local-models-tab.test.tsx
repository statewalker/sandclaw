/// <reference types="@testing-library/jest-dom" />
import "@testing-library/jest-dom/vitest";
import type {
  ActivationProgress,
  ModelManager,
  ModelState,
} from "@statewalker/ai-agent/models";
import { Workspace } from "@statewalker/workspace-api";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalModelsTab } from "@/components/local-models/local-models-tab";
import {
  ActiveModel,
  AgentRuntimeAdapter,
  ProvidersBootstrap,
} from "@/fragments/agent-runtime";
import { AppWorkspaceProvider } from "@/fragments/workspace-bridge-views";
import { emptyProvidersConfig } from "@/services/providers-store";

interface FakeManager {
  manager: ModelManager;
  fireUpdate: () => void;
  setState: (key: string, state: ModelState) => void;
  pushProgress: (key: string, progress: ActivationProgress) => void;
  finishActivation: (key: string) => void;
}

function makeFakeManager(catalog: Record<string, ModelState>): FakeManager {
  const states = new Map<string, ModelState>(Object.entries(catalog));
  const listeners = new Set<() => void>();
  const queues = new Map<string, ActivationProgress[]>();
  const resolvers = new Map<string, () => void>();

  const notify = (): void => {
    for (const cb of listeners) cb();
  };

  const manager = {
    store: {
      catalog: Object.fromEntries(
        Object.entries(catalog).map(([k, s]) => [k, s.config]),
      ),
      onUpdate(cb: () => void): () => void {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      getStates: () => new Map(states),
      getState: (key: string) => states.get(key),
      peekActiveModel: () => undefined,
    },
    async *activate(key: string): AsyncGenerator<ActivationProgress> {
      const queue = queues.get(key) ?? [];
      queues.set(key, queue);
      while (true) {
        const next = queue.shift();
        if (next) {
          yield next;
          if (next.phase === "ready" || next.phase === "error") return;
          continue;
        }
        await new Promise<void>((resolve) => resolvers.set(key, resolve));
      }
    },
    cancel: () => {},
  } as unknown as ModelManager;

  return {
    manager,
    fireUpdate: notify,
    setState(key, state) {
      states.set(key, state);
      notify();
    },
    pushProgress(key, progress) {
      const queue = queues.get(key) ?? [];
      queue.push(progress);
      queues.set(key, queue);
      const resolve = resolvers.get(key);
      if (resolve) {
        resolvers.delete(key);
        resolve();
      }
    },
    finishActivation(key) {
      this.pushProgress(key, {
        modelKey: key,
        phase: "ready",
        message: "ready",
      });
    },
  };
}

/**
 * Build a workspace with the agent-runtime adapters wired so the
 * `useRuntime()` shim resolves through `useAdapter`. The bootstrap is
 * directly populated with the fake manager and an empty config —
 * mirrors the post-onLoad steady state without going through the
 * disk read path.
 */
function makeWorkspace(fake: FakeManager): Workspace {
  const ws = new Workspace();
  ws.setAdapter(ActiveModel);
  ws.setAdapter(AgentRuntimeAdapter);
  ws.setAdapter(ProvidersBootstrap);
  const bootstrap = ws.requireAdapter(ProvidersBootstrap);
  bootstrap.attach({
    workspace: ws,
    activeModel: ws.requireAdapter(ActiveModel),
    adapter: ws.requireAdapter(AgentRuntimeAdapter),
    systemFolder: ".settings",
  });
  // Inject the fake manager + empty config without going through the
  // disk-read code path.
  // biome-ignore lint/suspicious/noExplicitAny: test-only adapter
  (bootstrap as any)._manager = fake.manager;
  // biome-ignore lint/suspicious/noExplicitAny: test-only adapter
  (bootstrap as any)._config = emptyProvidersConfig;
  ws.requireAdapter(AgentRuntimeAdapter)._setState({
    status: "no-active-model",
  });
  return ws;
}

function renderTab(fake: FakeManager): { container: HTMLElement } {
  const ws = makeWorkspace(fake);
  return render(
    <AppWorkspaceProvider workspace={ws}>
      <LocalModelsTab />
    </AppWorkspaceProvider>,
  );
}

const ORIGINAL_GPU = (navigator as Navigator & { gpu?: unknown }).gpu;

describe("LocalModelsTab", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "gpu", {
      value: ORIGINAL_GPU,
      configurable: true,
    });
  });

  it("renders the WebGPU placeholder when navigator.gpu is missing", () => {
    Object.defineProperty(navigator, "gpu", {
      value: undefined,
      configurable: true,
    });
    const fake = makeFakeManager({});
    renderTab(fake);
    expect(screen.getByText(/WebGPU is not available/i)).toBeInTheDocument();
  });

  describe("with WebGPU stub", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "gpu", {
        value: { __stub: true },
        configurable: true,
      });
    });

    it("hoists downloaded entries into a top-level Available section", () => {
      const fake = makeFakeManager({
        "webllm:hermes": {
          config: {
            runtime: "local",
            engine: "webllm",
            modelId: "mlc-ai/Hermes-3-Llama-3.1-8B-q4f16_1-MLC",
            label: "Hermes 3 Llama (WebGPU)",
            family: "Hermes 3",
            dtype: "q4f16_1",
            size: "4.9 GB",
            sizeBytes: 1,
          },
          status: "downloaded",
        },
      });
      renderTab(fake);
      expect(screen.getByText("Available")).toBeInTheDocument();
      expect(screen.getByText("Hermes 3 Llama (WebGPU)")).toBeInTheDocument();
      expect(screen.getByText("Downloaded")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^Activate$/i }),
      ).toBeInTheDocument();
    });

    // WebLLM section currently disabled in local-models-tab.tsx (see
    // comment near `WebLLM models section disabled`). Re-enable when
    // the WebLLM imports are restored.
    it.skip("transitions an entry from a per-engine accordion into Available when its status changes", () => {
      const fake = makeFakeManager({
        "webllm:hermes": {
          config: {
            runtime: "local",
            engine: "webllm",
            modelId: "mlc-ai/Hermes-3-Llama-3.1-8B-q4f16_1-MLC",
            label: "Hermes 3 Llama (WebGPU)",
            family: "Hermes 3",
            dtype: "q4f16_1",
            size: "4.9 GB",
            sizeBytes: 1,
          },
          status: "not-downloaded",
        },
      });
      renderTab(fake);
      // Not-downloaded entries live inside the closed WebLLM accordion.
      expect(screen.getByText(/WebLLM models \(1\)/)).toBeInTheDocument();
      expect(screen.queryByText("Available")).not.toBeInTheDocument();

      act(() => {
        const config = fake.manager.store.catalog["webllm:hermes"];
        if (!config) throw new Error("missing test catalog entry");
        fake.setState("webllm:hermes", {
          config,
          status: "downloaded",
        });
      });
      expect(screen.getByText("Available")).toBeInTheDocument();
      expect(screen.getByText("Hermes 3 Llama (WebGPU)")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^Activate$/i }),
      ).toBeInTheDocument();
    });

    // WebLLM section currently disabled (see above). Re-enable with
    // the WebLLM imports.
    it.skip("groups not-downloaded entries by engine in separate accordions", () => {
      const fake = makeFakeManager({
        "webllm:hermes": {
          config: {
            runtime: "local",
            engine: "webllm",
            modelId: "mlc-ai/Hermes-3-Llama-3.1-8B-q4f16_1-MLC",
            label: "Hermes 3 Llama",
            family: "Hermes 3",
            dtype: "q4f16_1",
            size: "4.9 GB",
            sizeBytes: 1,
          },
          status: "not-downloaded",
        },
        "local:smollm2-360m": {
          config: {
            runtime: "local",
            engine: "tjs",
            modelId: "onnx-community/SmolLM2-360M-Instruct-ONNX",
            label: "SmolLM2-360M",
            family: "SmolLM2",
            dtype: "q4f16",
            size: "260 MB",
            sizeBytes: 1,
          },
          status: "not-downloaded",
        },
      });
      renderTab(fake);
      expect(screen.getByText(/WebLLM models \(1\)/)).toBeInTheDocument();
      expect(
        screen.getByText(/Transformers\.js models \(1\)/),
      ).toBeInTheDocument();
      // Both accordions are closed by default — neither entry's label
      // is visible in the DOM.
      expect(screen.queryByText("Hermes 3 Llama")).not.toBeInTheDocument();
      expect(screen.queryByText("SmolLM2-360M")).not.toBeInTheDocument();
    });
  });
});
