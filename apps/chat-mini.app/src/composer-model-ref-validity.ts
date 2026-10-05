import type { Connection } from "@statewalker/ai-config.core";
import { capabilitiesFor } from "@statewalker/ai-config.core";

/**
 * React-free validity + choice-building logic for the composer session model
 * picker. Extracted from the component so it can be unit-tested without the
 * React / shadcn / chat-react import graph.
 *
 * "Current session readiness" is derived here: a session's stored `modelRef`
 * is usable only while its Connection is connected and the model is still
 * starred + chat-capable. When it is not, the picker surfaces dropdown
 * recovery.
 */

export interface ChoiceRow {
  value: string;
  connectionId: string;
  modelId: string;
  label: string;
  providerLabel: string;
}

export interface ModelRef {
  connectionId: string;
  modelId: string;
}

/** A connection is usable once a discovery has cached models on it. */
export function isConnected(c: Connection): boolean {
  return (c.discoveredModels?.length ?? 0) > 0;
}

export function findConnection(
  connections: readonly Connection[],
  id: string | undefined,
): Connection | undefined {
  return id ? connections.find((c) => c.id === id) : undefined;
}

/**
 * Build the dropdown list: union of (connection, starred modelId) across
 * connected AiConfig connections, filtered by `chat` capability.
 */
export function buildChoices(connections: readonly Connection[]): ChoiceRow[] {
  const out: ChoiceRow[] = [];
  for (const c of connections) {
    if (!isConnected(c)) continue;
    const discovered = new Set((c.discoveredModels ?? []).map((m) => m.id));
    for (const modelId of c.starredModelIds) {
      // Skip stars that no longer correspond to a discovered model.
      if (!discovered.has(modelId)) continue;
      if (!capabilitiesFor(modelId).includes("chat")) continue;
      out.push({
        value: `${c.id}::${modelId}`,
        connectionId: c.id,
        modelId,
        label: modelId,
        providerLabel: c.name,
      });
    }
  }
  return out;
}

/**
 * Is a `modelRef` still usable against the current AiConfig state? Drives the
 * per-session readiness discriminator: invalid → the picker shows recovery.
 */
export function isModelRefValid(
  connections: readonly Connection[],
  ref: ModelRef | undefined,
): boolean {
  if (!ref) return false;
  const conn = findConnection(connections, ref.connectionId);
  if (!conn || !isConnected(conn)) return false;
  if (!conn.starredModelIds.includes(ref.modelId)) return false;
  if (!capabilitiesFor(ref.modelId).includes("chat")) return false;
  return true;
}
