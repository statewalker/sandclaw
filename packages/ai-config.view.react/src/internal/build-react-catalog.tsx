import { defineCatalog } from "@json-render/core";
import { shadcnComponents } from "@json-render/shadcn";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import {
  type Actions,
  type Components,
  type DefineRegistryResult,
  defineRegistry,
  schema,
} from "@statewalker/render.view.react";
import { z } from "zod";
import type { ConnectionsActionHandlers } from "./action-handlers.js";
import { ControlledCollapsible } from "./controlled-collapsible.js";
import { FieldInput } from "./field-input.js";
import { StatusTabs } from "./status-tabs.js";

/**
 * Schema-typed catalog for the connections panel. Per ADR 0002 the typed
 * catalog (which needs `@json-render/react`'s `schema`, reached via
 * `render.view.react`) and the React bindings live here on the renderer side;
 * the opaque spec + the catalog id/component/action name-sets live in the
 * React-free `@statewalker/ai-config` logic fragment.
 *
 * Two stock components are re-typed for the panel's controlled variants:
 *   - `Collapsible` gains `openPath` (controlled fold, replacing `defaultOpen`)
 *   - `Tabs` items gain an optional `status` for the per-connection status dot
 * plus the bespoke `FieldInput`.
 */
export const connectionsCatalog = defineCatalog(schema, {
  components: {
    ...shadcnComponentDefinitions,
    Collapsible: {
      ...shadcnComponentDefinitions.Collapsible,
      props: z.object({ title: z.string(), openPath: z.string() }),
    },
    Tabs: {
      ...shadcnComponentDefinitions.Tabs,
      props: z.object({
        tabs: z.array(
          z.object({
            label: z.string(),
            value: z.string(),
            status: z.enum(["connected", "idle", "error", "testing"]).nullable(),
          }),
        ),
        value: z.string().nullable(),
      }),
    },
    FieldInput: {
      props: z.object({
        label: z.string().nullable(),
        name: z.string(),
        type: z.enum(["text", "password"]).nullable(),
        placeholder: z.string().nullable(),
        value: z.string().nullable(),
      }),
      description: "Form input with autofill disabled and a show/hide toggle when type=password.",
    },
  },
  actions: {
    addConnection: {
      params: z.object({ type: z.string().optional() }),
      description: "Persist a new connection shell of the chosen type and select its tab.",
    },
    connectConnection: {
      params: z.object({}),
      description:
        "Flush the form key to Secrets, persist the connection shape, discover models, seed stars.",
    },
    disconnectConnection: {
      params: z.object({}),
      description: "Clear the stored key, discovered models, and stars; keep the shell.",
    },
    removeConnection: {
      params: z.object({ confirmed: z.boolean().optional() }),
      description: "Remove the active connection (confirm first when it has a stored key).",
    },
    toggleModelStar: {
      params: z.object({ modelId: z.string() }),
      description: "Toggle a discovered model's membership in the connection's starred set.",
    },
    addHeader: {
      params: z.object({}),
      description: "Append a blank header row to the connection form.",
    },
    removeHeader: {
      params: z.object({ index: z.number() }),
      description: "Remove the header row at the given index.",
    },
  },
});

export type ConnectionsCatalog = typeof connectionsCatalog;

export interface BuildRegistryOptions {
  /** Action implementations (see action-handlers.ts). */
  actions: ConnectionsActionHandlers;
}

/**
 * Build the json-render `Registry` for the connections catalog: the shadcn
 * React bindings plus the panel's three custom components (controlled
 * Collapsible, status Tabs, FieldInput), bound to the supplied action handlers.
 */
export function buildConnectionsRegistry(options: BuildRegistryOptions): DefineRegistryResult {
  const components = {
    ...shadcnComponents,
    Collapsible: ControlledCollapsible,
    Tabs: StatusTabs,
    FieldInput,
  } as unknown as Components<ConnectionsCatalog>;
  const actions = options.actions as unknown as Actions<ConnectionsCatalog>;
  return defineRegistry(connectionsCatalog, { components, actions });
}
