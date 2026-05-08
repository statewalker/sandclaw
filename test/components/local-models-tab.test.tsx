/// <reference types="@testing-library/jest-dom" />
import "@testing-library/jest-dom/vitest";
import type {
  ActivationProgress,
  ModelManager,
  ModelState,
} from "@statewalker/ai-agent/models";
import { Workspace } from "@statewalker/workspace-api";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocalModelsTab } from "@/components/local-models/local-models-tab";
import { ActiveModel, AgentRuntimeAdapter } from "@/fragments/agent-runtime";
import { Providers } from "@/fragments/providers";
import { AppWorkspaceProvider } from "@/fragments/workspace-bridge-views";

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
 * Build a workspace with the new Providers + agent-runtime adapters
 * wired so the `useRuntime()` shim resolves through `useAdapter`.
 * Wave 4.2 dropped the in-fragment local-model manager — the WebLLM
 * UI's catalog-rendering paths are exercised once the dedicated
 * `local-models/` fragment lands and re-introduces a manager
 * adapter.
 */
function makeWorkspace(): Workspace {
  const ws = new Workspace();
  ws.setAdapter(ActiveModel);
  ws.setAdapter(AgentRuntimeAdapter);
  ws.setAdapter(Providers);
  return ws;
}

function renderTab(): { container: HTMLElement } {
  const ws = makeWorkspace();
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
    renderTab();
    expect(screen.getByText(/WebGPU is not available/i)).toBeInTheDocument();
  });

  // Catalog-rendering tests skipped pending the dedicated
  // `local-models/` fragment that supplies a `ModelManager` to the
  // tab. Until then `useRuntime().manager === null` and the tab
  // renders the not-ready placeholder.
  it.skip("hoists downloaded entries into a top-level Available section", () => {
    void makeFakeManager;
  });
});
