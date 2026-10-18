import { defineCatalog } from "@json-render/core";
import { schema } from "@statewalker/render.view.react";
import { z } from "zod";

/**
 * Schema-typed catalog for the file-explorer panel. Lives on the React
 * side (ADR 0002): it needs `@json-render/react`'s `schema` — reached
 * via `@statewalker/render.view.react`, the sole json-render/react
 * boundary. The pure spec data + id helpers live in the React-free
 * `@statewalker/file-explorer` logic fragment.
 *
 * One element (`FileExplorerView`) parameterised by `panelId` so each
 * dock tab gets its own controller, label, and starting path.
 */
export const fileExplorerCatalog = defineCatalog(schema, {
  components: {
    FileExplorerView: {
      props: z.object({
        panelId: z.string(),
        label: z.string().optional(),
        initialPath: z.string().optional(),
        mainViewerHost: z.boolean().optional(),
        folderNavigationHost: z.boolean().optional(),
      }),
    },
  },
  actions: {},
});
