import { Slots } from "@statewalker/shared-slots";
import { useSlot } from "@statewalker/shared-slots/react";
import { type ReactElement, useMemo } from "react";
import {
  compareByOrderAndId,
  useRegistry,
  ViewRegistry,
} from "@/fragments/core-views";
import { type DockHeaderItem, observeDockHeaderItems } from "@/fragments/dock";
import { useAdapter } from "@/fragments/workspace-bridge-views";

/**
 * Top-of-shell header rendered by `<MainShell/>`. Subscribes to
 * `dock:header-items`, splits contributions into the `leading` and
 * `trailing` groups, sorts each group by `order`, and renders the
 * components looked up via `ViewRegistry.get(viewKey)`.
 */
export function ShellHeader(): ReactElement {
  const slots = useAdapter(Slots);
  const registry = useRegistry(ViewRegistry);
  const items = useSlot(slots, observeDockHeaderItems);

  const { leading, trailing } = useMemo(() => {
    const lead: DockHeaderItem[] = [];
    const trail: DockHeaderItem[] = [];
    for (const item of items) {
      (item.slot === "leading" ? lead : trail).push(item);
    }
    lead.sort(compareByOrderAndId);
    trail.sort(compareByOrderAndId);
    return { leading: lead, trailing: trail };
  }, [items]);

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 border-b bg-background px-3">
      {leading.map((item) => (
        <HeaderItemView key={item.id} registry={registry} item={item} />
      ))}
      <div className="ml-auto" />
      {trailing.map((item) => (
        <HeaderItemView key={item.id} registry={registry} item={item} />
      ))}
    </header>
  );
}

function HeaderItemView({
  registry,
  item,
}: {
  registry: ViewRegistry;
  item: DockHeaderItem;
}): ReactElement | null {
  const Component = registry.get(item.viewKey);
  return Component ? <Component /> : null;
}
