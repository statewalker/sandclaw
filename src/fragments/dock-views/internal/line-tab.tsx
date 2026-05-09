import { Intents } from "@statewalker/shared-intents";
import type {
  DockviewPanelApi,
  IDockviewPanelHeaderProps,
} from "dockview-react";
import { X } from "lucide-react";
import { type ReactElement, useCallback, useSyncExternalStore } from "react";
import { cn } from "@/fragments/shadcn-views";
import { useAppWorkspace } from "@/fragments/workspace-bridge-views";
import { runClosePanel } from "../../dock/index.js";

/**
 * Shadcn standard tab styling — see https://ui.shadcn.com/docs/components/radix/tabs.
 * The tab strip is a muted "track" (`bg-muted`, set via the CSS
 * override on the DockView container); the active tab is a
 * background-colored "pill" (`bg-background shadow rounded-md`)
 * inset by a small margin so the muted track shows around it.
 * Inactive tabs are transparent with `text-muted-foreground`.
 *
 * Used as DockView's `defaultTabComponent`, so every panel kind
 * (chat sessions today, future file viewers, etc.) renders with
 * the same aesthetic.
 *
 * Close handler: dispatches `dock:close-panel` rather than calling
 * `api.close()` directly so the dock fragment's spec-eviction
 * logic still runs (transient specs evicted, persistent specs
 * preserved). Calling `api.close()` would skip that pass.
 */
export function LineTab({ api }: IDockviewPanelHeaderProps): ReactElement {
  const title = useTabTitle(api);
  const isActive = useTabActive(api);
  const workspace = useAppWorkspace();
  const intents = workspace.requireAdapter(Intents);

  const onClose = useCallback(
    (e: React.MouseEvent): void => {
      // Prevent DockView's tab-click-to-focus from firing when the
      // user clicks the X button.
      e.stopPropagation();
      runClosePanel(intents, { panelId: api.id });
    },
    [intents, api.id],
  );

  return (
    <div
      className={cn(
        // `m-0.5` insets the pill from the surrounding muted track
        // by a hair — keeps the shadcn pill look without making
        // the tab strip feel chunky. `h-full` makes the outer div
        // fill `.dv-tab`'s content area so `items-center` actually
        // centers the pill vertically (without it the pill anchors
        // to the top of the cell).
        "group/tab m-0.5 flex h-full items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="truncate">{title || "Untitled"}</span>
      <button
        type="button"
        aria-label="Close tab"
        onClick={onClose}
        className={cn(
          "rounded-sm p-0.5 transition-opacity hover:bg-muted",
          // Visible when the tab is active OR the user is hovering
          // the tab content; hidden otherwise so inactive tabs stay
          // visually quiet.
          isActive ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100",
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function useTabTitle(api: DockviewPanelApi): string {
  return useSyncExternalStore(
    (cb) => {
      const sub = api.onDidTitleChange(cb);
      return () => sub.dispose();
    },
    () => api.title ?? "",
    () => api.title ?? "",
  );
}

function useTabActive(api: DockviewPanelApi): boolean {
  return useSyncExternalStore(
    (cb) => {
      const sub = api.onDidActiveChange(cb);
      return () => sub.dispose();
    },
    () => api.isActive,
    () => api.isActive,
  );
}
