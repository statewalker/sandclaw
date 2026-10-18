import { defineCatalog } from "@json-render/core";
import { schema } from "@statewalker/render.view.react";
import { z } from "zod";

/**
 * Catalog declaration for the web-app dock panel — the typed schema only, no React binding.
 * A single `SiteFrame` component whose `baseUrl`/`clientEntry` props lock the tab to one
 * hosted app. Paired with `init.tsx`, which binds the React `<SiteFrame>` and registers the
 * resolved registry into the shell's `json:catalogs` slot under `WEBAPP_DOCK_CATALOG_ID`.
 */
export const siteFrameCatalog = defineCatalog(schema, {
  components: {
    SiteFrame: {
      props: z.object({ baseUrl: z.string(), clientEntry: z.string() }),
    },
  },
  actions: {},
});
