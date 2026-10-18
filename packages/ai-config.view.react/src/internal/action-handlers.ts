import type { StateStore } from "@json-render/core";
import {
  type AiConfig,
  applyDefaultStarred,
  type ConnectionType,
} from "@statewalker/ai-config.core";

type Handler = (params: Record<string, unknown>) => Promise<void>;

export interface ConnectionsActionHandlers {
  addConnection: Handler;
  connectConnection: Handler;
  disconnectConnection: Handler;
  removeConnection: Handler;
  toggleModelStar: Handler;
  addHeader: Handler;
  removeHeader: Handler;
}

export interface ActionHandlerContext {
  aiConfig: AiConfig;
  store: StateStore;
}

interface HeaderRow {
  name: string;
  value: string;
}

const TYPE_LABEL: Record<ConnectionType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  "openai-compatible": "OpenAI-compatible",
};

/** url is the configuration for these types (CORS / arbitrary endpoint). */
function urlRequired(type: ConnectionType): boolean {
  return type === "anthropic" || type === "openai-compatible";
}

const newConnectionId = (): string =>
  `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Build the connections action-handler map. Closes over the `AiConfig` adapter
 * (which itself routes credentials through `Secrets`) and the spec `StateStore`.
 * Every write goes through `AiConfig`; the API key is flushed to Secrets via
 * `setApiKey` and never written onto the Connection or the persisted config.
 */
export function buildActionHandlers(ctx: ActionHandlerContext): ConnectionsActionHandlers {
  const { aiConfig, store } = ctx;

  const activeId = (): string => (store.get("/ui/activeConnectionId") as string) || "";
  const form = (): Record<string, unknown> =>
    (store.get("/ui/form") as Record<string, unknown>) ?? {};
  const setForm = (patch: Record<string, unknown>): void => {
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) updates[`/ui/form/${k}`] = v;
    store.update(updates);
  };

  async function addConnection(params: Record<string, unknown>): Promise<void> {
    const type = ((params.type as ConnectionType) ??
      (store.get("/ui/newConnectionType") as ConnectionType) ??
      "openai") as ConnectionType;
    const id = newConnectionId();
    await aiConfig.upsertConnection({ id, type, name: TYPE_LABEL[type], starredModelIds: [] });
    // Select the new tab; the host's active-id effect swaps the (expanded) form.
    store.set("/ui/activeConnectionId", id);
  }

  async function connectConnection(): Promise<void> {
    const id = activeId();
    const conn = aiConfig.getConnection(id);
    if (!conn) return;
    const f = form();
    const url = ((f.url as string) || "").trim();
    if (urlRequired(conn.type) && !url) {
      setForm({ error: `A URL is required for ${TYPE_LABEL[conn.type]} connections.` });
      return;
    }
    const headers = ((f.headers as HeaderRow[]) ?? []).filter((h) => h.name.trim().length > 0);
    setForm({ testing: true, error: null });
    try {
      await aiConfig.upsertConnection({
        id,
        type: conn.type,
        name: ((f.name as string) || conn.name || TYPE_LABEL[conn.type]).trim(),
        url: url || undefined,
        headers: headers.length > 0 ? headers : undefined,
        starredModelIds: conn.starredModelIds,
      });
      // Only write the key when the user actually typed one. A blank field on
      // re-test means "keep the saved key" — never overwrite a stored secret
      // with "" (that silently wiped keys after a reload, since the field is
      // always blank). Require a key only when none is stored yet.
      const formKey = ((f.apiKey as string) ?? "").trim();
      if (formKey) {
        await aiConfig.setApiKey(id, formKey);
      } else if (!(await aiConfig.hasKey(id))) {
        setForm({ testing: false, error: "An API key is required." });
        return;
      }
      const models = await aiConfig.refreshModels(id);
      if (conn.starredModelIds.length === 0) {
        const seed = applyDefaultStarred(
          conn.type,
          models.map((m) => m.id),
        );
        if (seed.length > 0) await aiConfig.starModels(id, seed);
      }
      // Make the connection immediately usable: if nothing is active yet,
      // select this connection's first starred model so the chat runtime can
      // build (the composer lets the user switch later). Without this, a fresh
      // workspace can't reach a "ready" runtime — the composer only renders
      // inside a session, but creating one needs an active model.
      if (!aiConfig.getActive().connectionId) {
        const firstStar = aiConfig.getConnection(id)?.starredModelIds[0];
        if (firstStar) await aiConfig.setActive(id, firstStar);
      }
      setForm({ testing: false, error: null, settingsOpen: false });
    } catch (err) {
      setForm({ testing: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function disconnectConnection(): Promise<void> {
    const id = activeId();
    if (!aiConfig.getConnection(id)) return;
    await aiConfig.disconnect(id);
    setForm({ settingsOpen: true, error: null });
  }

  async function removeConnection(params: Record<string, unknown>): Promise<void> {
    const id = activeId();
    if (!aiConfig.getConnection(id)) return;
    if (!params.confirmed && (await aiConfig.hasKey(id))) {
      store.set("/ui/confirmRemoveOpen", true);
      return;
    }
    const conns = aiConfig.listConnections();
    const idx = conns.findIndex((c) => c.id === id);
    const neighbour = conns[idx + 1] ?? conns[idx - 1];
    await aiConfig.removeConnection(id);
    store.update({
      "/ui/confirmRemoveOpen": false,
      "/ui/activeConnectionId": neighbour?.id ?? "",
    });
  }

  async function toggleModelStar(params: Record<string, unknown>): Promise<void> {
    const id = activeId();
    const conn = aiConfig.getConnection(id);
    if (!conn) return;
    // json-render resolves a `$item` action param to the item's state PATH (for
    // two-way binding), not its value — so `params.modelId` arrives as e.g.
    // `/persistent/active/models/3/id`. Dereference it to the real model id.
    const ref = params.modelId as string;
    const modelId = (typeof ref === "string" && ref.startsWith("/") ? store.get(ref) : ref) as
      | string
      | undefined;
    if (!modelId) return;
    const next = conn.starredModelIds.includes(modelId)
      ? conn.starredModelIds.filter((m) => m !== modelId)
      : [...conn.starredModelIds, modelId];
    await aiConfig.starModels(id, next);
  }

  async function addHeader(): Promise<void> {
    const headers = (store.get("/ui/form/headers") as HeaderRow[]) ?? [];
    store.set("/ui/form/headers", [...headers, { name: "", value: "" }]);
  }

  async function removeHeader(params: Record<string, unknown>): Promise<void> {
    const index = params.index as number;
    const headers = (store.get("/ui/form/headers") as HeaderRow[]) ?? [];
    store.set(
      "/ui/form/headers",
      headers.filter((_, i) => i !== index),
    );
  }

  return {
    addConnection,
    connectConnection,
    disconnectConnection,
    removeConnection,
    toggleModelStar,
    addHeader,
    removeHeader,
  };
}
