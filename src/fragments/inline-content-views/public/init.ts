import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { getWorkspace } from "@statewalker/workspace-api";
import {
  type InlineComponentDescriptor,
  InlineContentRegistry,
  provideInlineComponent,
} from "@/fragments/inline-content";
import { ActionButton } from "../internal/components/action-button.js";
import { DirectoryCard } from "../internal/components/directory-card.js";
import { FileCard } from "../internal/components/file-card.js";
import { LineChart } from "../internal/components/line-chart.js";
import { MetricCard } from "../internal/components/metric-card.js";

const BUILTINS: ReadonlyArray<{
  descriptor: InlineComponentDescriptor;
  component: Parameters<InlineContentRegistry["register"]>[1];
}> = [
  {
    descriptor: {
      id: "metric-card",
      label: "Metric Card",
      description: "Single-value KPI card with optional delta and trend.",
    },
    component: MetricCard,
  },
  {
    descriptor: {
      id: "line-chart",
      label: "Line Chart",
      description: "Compact SVG line chart for a numeric series.",
    },
    component: LineChart,
  },
  {
    descriptor: {
      id: "file-card",
      label: "File Card",
      description: "File reference; clicking fires files:visualize.",
    },
    component: FileCard,
  },
  {
    descriptor: {
      id: "directory-card",
      label: "Directory Card",
      description:
        "Directory reference; clicking children fires files:visualize.",
    },
    component: DirectoryCard,
  },
  {
    descriptor: {
      id: "action-button",
      label: "Action Button",
      description: "Fires an arbitrary intent on click.",
    },
    component: ActionButton,
  },
];

/**
 * Renderer-fragment init for `inline-content-views`. Pairs with
 * `@/fragments/inline-content` (logic).
 *
 * Registers each built-in inline component under its id in
 * `InlineContentRegistry` (rendering lookup) AND contributes a
 * descriptor to `inline-content:components` (discoverability).
 * Plug-in fragments register the same way — the chat surface
 * sees them indistinguishably from built-ins.
 */
export default function initInlineContentViews(
  ctx: Record<string, unknown>,
): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const registry = workspace.requireAdapter(InlineContentRegistry);
  const slots = workspace.requireAdapter(Slots);

  for (const { descriptor, component } of BUILTINS) {
    register(registry.register(descriptor.id, component));
    register(provideInlineComponent(slots, descriptor));
  }

  return cleanup;
}
