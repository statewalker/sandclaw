import { Intents } from "@statewalker/shared-intents";
import { type ReactElement, useCallback } from "react";
import { useAppWorkspace } from "@/fragments/workspace-bridge-views";

interface ActionButtonProps {
  label: string;
  /** Intent key fired when the button is clicked. */
  intent: string;
  /** Payload passed to the intent. Optional. */
  payload?: unknown;
  /** Visual emphasis. Defaults to "default". */
  variant?: "default" | "primary" | "destructive";
}

function isActionButtonProps(value: unknown): value is ActionButtonProps {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.label === "string" && typeof v.intent === "string";
}

/**
 * Inline button that fires an arbitrary intent on click. The
 * spec carries the intent key + payload so a single component
 * covers many use cases without per-action React bindings.
 */
export function ActionButton({ props }: { props: unknown }): ReactElement {
  const workspace = useAppWorkspace();
  const intents = workspace.requireAdapter(Intents);

  const onClick = useCallback(() => {
    if (!isActionButtonProps(props)) return;
    intents.run(props.intent, props.payload, () => true);
  }, [intents, props]);

  if (!isActionButtonProps(props)) {
    return (
      <span className="rounded-sm bg-destructive/10 px-2 py-0.5 font-mono text-xs text-destructive">
        ActionButton: invalid props
      </span>
    );
  }
  const variant = props.variant ?? "default";
  const cls =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : variant === "destructive"
        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
        : "bg-secondary text-secondary-foreground hover:bg-secondary/80";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium ${cls}`}
    >
      {props.label}
    </button>
  );
}
