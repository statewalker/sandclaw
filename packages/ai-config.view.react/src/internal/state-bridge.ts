import type { StateStore } from "@json-render/core";
import { type AiConfig, type Connection, capabilitiesFor } from "@statewalker/ai-config.core";

/** A connection is "connected" once a discovery has cached models on it. */
function isConnected(c: Connection): boolean {
  return (c.discoveredModels?.length ?? 0) > 0;
}

/** Tab-strip projection (consumed by the custom status `Tabs`). */
function toTab(c: Connection): { value: string; label: string; status: "connected" | "idle" } {
  return { value: c.id, label: c.name, status: isConnected(c) ? "connected" : "idle" };
}

/** Active-connection display projection (header + discovered-model list). */
function toActiveView(c: Connection): Record<string, unknown> {
  const starred = new Set(c.starredModelIds);
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    connected: isConnected(c),
    models: (c.discoveredModels ?? []).map((m) => ({
      id: m.id,
      label: m.label,
      capabilities: (m.capabilities ?? capabilitiesFor(m.id)).join(", "),
      starred: starred.has(m.id),
    })),
  };
}

/** Seed the transient `/ui/form` slot from the active connection. The API key
 * is never read back from the domain — it starts blank and is flushed to
 * Secrets on connect. The form starts expanded for a not-yet-connected shell. */
function formFromConnection(c: Connection): Record<string, unknown> {
  return {
    name: c.name,
    apiKey: "",
    url: c.url ?? "",
    headers: (c.headers ?? []).map((h) => ({ name: h.name, value: h.value })),
    settingsOpen: !isConnected(c),
    testing: false,
    error: null,
  };
}

export interface ConnectionsBridge {
  /** Re-project `AiConfig` into the store for the current `/ui/activeConnectionId`. */
  sync: () => void;
  /** Stop listening to `AiConfig` updates. */
  dispose: () => void;
}

/**
 * Project `AiConfig.listConnections()` into the connections spec's state tree:
 * `/persistent/{hasConnections,tabs,active}`, and swap `/ui/form` to the
 * selected connection's draft when the active tab changes. Re-runs on every
 * `AiConfig` update; the host component also calls `sync()` when
 * `/ui/activeConnectionId` changes (tab clicks) — neither subscribes to the
 * store, avoiding the new-reference notification loop.
 */
export function createConnectionsBridge(store: StateStore, aiConfig: AiConfig): ConnectionsBridge {
  // The connection id whose draft currently occupies `/ui/form`; the form is
  // only re-seeded when the active connection actually changes, so in-progress
  // edits survive unrelated `AiConfig` updates.
  let loadedFormId: string | null = null;

  function sync(): void {
    const conns = aiConfig.listConnections();
    let activeId = (store.get("/ui/activeConnectionId") as string) || "";
    if (conns.length > 0 && !conns.some((c) => c.id === activeId)) {
      activeId = conns[0]?.id ?? "";
      store.set("/ui/activeConnectionId", activeId);
    }
    if (conns.length === 0) activeId = "";
    const active = conns.find((c) => c.id === activeId) ?? null;

    store.update({
      "/persistent/hasConnections": conns.length > 0,
      "/persistent/tabs": conns.map(toTab),
      "/persistent/active": active ? toActiveView(active) : null,
    });

    if (active && active.id !== loadedFormId) {
      store.set("/ui/form", formFromConnection(active));
      loadedFormId = active.id;
      // Populate the saved key (async, from Secrets) so it's visible/editable.
      const id = active.id;
      void aiConfig.getApiKey(id).then((key) => {
        if (loadedFormId === id) store.set("/ui/form/apiKey", key);
      });
    } else if (!active) {
      loadedFormId = null;
    }
  }

  const dispose = aiConfig.onUpdate(sync);
  sync();
  return { sync, dispose };
}
