import { Intents } from "@statewalker/shared-intents";
import { newRegistry } from "@statewalker/shared-registry";
import { getWorkspace } from "@statewalker/workspace-api";
import { handleCreateSpec, handlePatchSpec } from "./intents.js";
import { SpecStore } from "./spec-store.js";

/**
 * Attach a `SpecStore` to the workspace and register the default
 * `spec:create` / `spec:patch` intent handlers. After this fragment
 * runs, every other fragment can:
 *   - resolve the store via `workspace.requireAdapter(SpecStore)`
 *   - invoke `runCreateSpec(intents, ...)` / `runPatchSpec(intents, ...)`
 *
 * Returns the cleanup; LIFO via shared-registry releases the
 * adapter binding and intent handlers on shutdown.
 */
export function initSpecStore(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const store = workspace.requireAdapter(SpecStore);
  const intents = workspace.requireAdapter(Intents);

  register(
    handleCreateSpec(intents, (intent) => {
      const { catalogId, spec, meta } = intent.payload;
      const specId = store.create({ catalogId, spec, meta });
      intent.resolve({ specId });
      return true;
    }),
  );

  register(
    handlePatchSpec(intents, (intent) => {
      const { specId, patch } = intent.payload;
      store.patch(specId, patch);
      intent.resolve();
      return true;
    }),
  );

  return cleanup;
}
