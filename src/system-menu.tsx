import { useAdapter } from "@statewalker/core-react";
import { runOpenSettings } from "@statewalker/settings";
import { Button } from "@statewalker/shadcn-react";
import { Intents } from "@statewalker/shared-intents";
import {
  runChangeWorkspace,
  runWorkspaceDisconnect,
} from "@statewalker/workspace-bridge";
import { ChevronDown, LogOut, Settings as SettingsIcon } from "lucide-react";
import {
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Trailing-header dropdown that groups system-level actions:
 *
 *   - Settings (`runOpenSettings`)
 *   - Switch workspace (`runWorkspaceDisconnect` → `runChangeWorkspace`)
 *
 * The two actions used to render as separate header buttons (one per
 * substrate fragment); the canonical shell collapses them under a
 * single "System" entry to keep the trailing area clean and to give
 * future global actions a stable home.
 *
 * Implementation is intentionally low-dep — a controlled `useState`
 * popover with click-outside / Escape-to-close — so `app-shell`
 * doesn't need to pull in a new shadcn / radix primitive.
 */
export function SystemMenu(): ReactElement {
  const intents = useAdapter(Intents);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openSettings() {
    setOpen(false);
    runOpenSettings(intents, {});
  }

  async function switchWorkspace() {
    setOpen(false);
    await runWorkspaceDisconnect(intents, {}).promise;
    try {
      await runChangeWorkspace(intents, {}).promise;
    } catch (e) {
      // User cancellation throws AbortError; user already in `empty`.
      if (e instanceof DOMException && e.name === "AbortError") return;
      throw e;
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <Button
        size="sm"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        System
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: container relays clicks to the menu items, which are buttons handling Enter/Space themselves
        <div
          // Reset bubbling clicks from menu items so the document-level
          // pointerdown handler doesn't immediately close on the same gesture.
          onClick={(e: MouseEvent) => e.stopPropagation()}
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md z-50"
        >
          <MenuItem onClick={() => void openSettings()}>
            <SettingsIcon className="h-3.5 w-3.5" />
            <span>Settings</span>
          </MenuItem>
          <MenuItem onClick={() => void switchWorkspace()}>
            <LogOut className="h-3.5 w-3.5" />
            <span>Switch workspace</span>
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left"
    >
      {children}
    </button>
  );
}
