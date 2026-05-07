import type { SpecStore } from "../spec-store/index.js";
import { CHAT_CATALOG_ID, chatSpecId, makeChatSpec } from "./catalog.js";

const PANEL_ID_PREFIX = "chat:";

/**
 * Walk a persisted DockView layout JSON and return the chat
 * sessionIds embedded in panel ids matching `^chat:.+$`. Defensive
 * against shape changes in DockView's serialization — only reads
 * panel ids, ignores everything else.
 *
 * Exported separately for unit testing without touching
 * localStorage.
 */
export function extractChatSessionIds(layoutJson: unknown): string[] {
  if (!layoutJson || typeof layoutJson !== "object") return [];
  const panels = (layoutJson as { panels?: unknown }).panels;
  if (!panels || typeof panels !== "object") return [];
  const ids: string[] = [];
  for (const panelId of Object.keys(panels)) {
    if (
      panelId.startsWith(PANEL_ID_PREFIX) &&
      panelId.length > PANEL_ID_PREFIX.length
    ) {
      ids.push(panelId.slice(PANEL_ID_PREFIX.length));
    }
  }
  return ids;
}

/**
 * On boot (BEFORE React mounts and the dock host calls `fromJSON`),
 * pre-allocate chat specs for every chat-shaped panel id in the
 * persisted layout so restored tabs find their specs in `SpecStore`
 * and render content directly. Without this pass, every restored
 * chat tab would flash the `PanelMissing` placeholder until the
 * user clicks the row.
 *
 * Idempotent: skipping ids whose specs already exist makes repeat
 * calls (hot reload, double-mount in StrictMode) safe.
 */
export function restoreChatSpecsFromLayout(
  store: SpecStore,
  storage: Storage | undefined,
  layoutKey: string,
): void {
  if (!storage) return;
  const raw = storage.getItem(layoutKey);
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  for (const sessionId of extractChatSessionIds(parsed)) {
    const specId = chatSpecId(sessionId);
    if (store.get(specId)) continue;
    store.create({
      id: specId,
      catalogId: CHAT_CATALOG_ID,
      spec: makeChatSpec(sessionId),
      meta: { persistent: true },
    });
  }
}
