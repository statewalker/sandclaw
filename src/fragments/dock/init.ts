import { Intents } from "@statewalker/shared-intents";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import { SpecStore } from "../spec-store/index.js";
import { installBusTrace } from "./bus-trace.js";
import { DockHost } from "./dock-host.js";
import {
  handleClosePanel,
  handleFocusPanel,
  handleShowDockPanel,
} from "./intents.js";

/**
 * Attach the `DockHost` adapter to the workspace and register the
 * three `dock:*` intent handlers. Also installs the bus-trace
 * toggle (no-op unless `localStorage["chat-mini:bus-trace"]` is
 * `"1"`).
 *
 * The `<DockviewReact>` host (`dock-view-host.tsx`) mounts later
 * inside the React tree (in `MainShell`); intent calls that fire
 * before then are queued by `DockHost` and drain on `setApi`.
 *
 * Eviction policy: `dock:close-panel` removes the panel from
 * DockView and deletes the spec from `SpecStore` UNLESS
 * `meta.persistent === true`. Per the §3.1 / §5.5 contract.
 */
export function initDockFragment(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const intents = workspace.requireAdapter(Intents);
  const slots = workspace.requireAdapter(Slots);
  const dockHost = workspace.requireAdapter(DockHost);
  const store = workspace.requireAdapter(SpecStore);

  register(installBusTrace(intents, slots));

  register(
    handleShowDockPanel(intents, (intent) => {
      dockHost
        .showOrFocus(intent.payload)
        .then(() => intent.resolve())
        .catch((error) => intent.reject(error));
      return true;
    }),
  );

  register(
    handleClosePanel(intents, (intent) => {
      const { panelId } = intent.payload;
      // Resolve the spec id from the panel before closing — once the
      // panel is gone, the dock api forgets `params.specId`.
      const api = dockHost._getApi();
      const panel = api?.getPanel(panelId);
      const specId = (panel?.params as { specId?: string } | undefined)?.specId;
      dockHost.closePanel(panelId);
      // Eviction: delete the spec only when no other open panel
      // references the same specId. Multi-panel sharing a spec
      // (e.g. preview + main view) keeps the spec alive until the
      // last panel closes. Persistent specs are never evicted.
      if (specId) {
        const record = store.get(specId);
        const stillReferenced =
          api?.panels.some(
            (p) =>
              p.id !== panelId &&
              (p.params as { specId?: string })?.specId === specId,
          ) ?? false;
        if (record && record.meta.persistent !== true && !stillReferenced) {
          store.delete(specId);
        }
      }
      intent.resolve();
      return true;
    }),
  );

  register(
    handleFocusPanel(intents, (intent) => {
      dockHost.focusPanel(intent.payload.panelId);
      intent.resolve();
      return true;
    }),
  );

  register(() => dockHost.detach());

  return cleanup;
}
