import { useBoundProp } from "@statewalker/render.view.react";
import { cn, Tabs, TabsList, TabsTrigger } from "@statewalker/ui.view.shadcn";
import type { ReactElement } from "react";

/** A connection's connect state, projected onto each tab by the state bridge. */
type TabStatus = "connected" | "idle" | "error" | "testing";

interface StatusTab {
  value: string;
  label: string;
  status?: TabStatus;
}

interface StatusTabsProps {
  props: {
    tabs?: StatusTab[];
    value?: string | null;
  };
  bindings?: {
    value?: string;
  };
  emit: (event: string) => void;
}

const DOT_CLASS: Record<TabStatus, string> = {
  connected: "bg-emerald-500",
  error: "bg-destructive",
  testing: "bg-amber-500 animate-pulse",
  idle: "bg-muted-foreground/40",
};

/**
 * Catalog `Tabs` binding — a connection-aware variant of the stock
 * `@json-render/shadcn` Tabs. Each tab trigger carries a small status dot
 * (connected / testing / error / idle) projected onto the tab by the state
 * bridge, matching prototype variant A's per-connection tab strip. The stock
 * Tabs renders plain string labels with no status affordance.
 *
 * Renders only the tab strip; the active connection's body is a sibling element
 * gated on `/persistent/active`, not a `TabsContent` child.
 */
export function StatusTabs({ props, bindings, emit }: StatusTabsProps): ReactElement {
  const tabs = props.tabs ?? [];
  const [value, setValue] = useBoundProp(props.value ?? "", bindings?.value);
  return (
    <Tabs
      value={value ?? ""}
      onValueChange={(v) => {
        setValue(v);
        emit("change");
      }}
      className="min-w-0 flex-1"
    >
      <TabsList className="h-auto justify-start gap-1 overflow-x-auto bg-transparent p-0">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="gap-2 data-[state=active]:bg-accent"
          >
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", DOT_CLASS[tab.status ?? "idle"])}
              aria-hidden="true"
            />
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
