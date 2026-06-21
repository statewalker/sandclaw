import {
  catalogsSlot,
  DOCK_LAYOUT_STORAGE_KEY,
  restorePanelSpecsFromLayout,
  SpecStore,
} from "@statewalker/render.core";
import { defineRegistry } from "@statewalker/render.view.react";
import { Commands } from "@statewalker/shared-commands";
import { newRegistry } from "@statewalker/shared-registry";
import { Slots } from "@statewalker/shared-slots";
import { ShowDockPanelCommand } from "@statewalker/shell.core";
import { dockTabIconSlot } from "@statewalker/shell.view.react";
import { OpenWikiSiteCommand } from "@statewalker/wiki.core";
import { getWorkspace } from "@statewalker/workspace.core";
import { BookText } from "lucide-react";
import { WikiSiteView } from "../internal/wiki-site-view.js";
import {
  makeWikiSiteSpec,
  WIKI_SITE_CATALOG_ID,
  wikiSiteCatalog,
  wikiSitePanelId,
  wikiSiteSpecId,
} from "./catalog.js";

/** Split a restored panel id suffix (`<project>/<slug>`) back into its parts. */
function splitSiteId(id: string): { project: string; slug: string } {
  const slash = id.indexOf("/");
  return slash < 0
    ? { project: id, slug: "" }
    : { project: id.slice(0, slash), slug: id.slice(slash + 1) };
}

/**
 * Renderer-fragment init for `@statewalker/wiki.view.react`. Registers the
 * `wiki-site` json-render catalog (binding `WikiSiteView`) and the `wiki:open-site`
 * command that opens a generated thematic site as a dock panel. ADR-0002: all wiki
 * React lives here, never in `@statewalker/wiki`.
 */
export default function initWikiReact(ctx: Record<string, unknown>): () => Promise<void> {
  const [register, cleanup] = newRegistry();
  const workspace = getWorkspace(ctx);
  const slots = workspace.requireAdapter(Slots);
  const store = workspace.requireAdapter(SpecStore);
  const commands = workspace.requireAdapter(Commands);

  restorePanelSpecsFromLayout({
    store,
    storage: globalThis.localStorage,
    layoutKey: DOCK_LAYOUT_STORAGE_KEY,
    panelIdPrefix: "wiki-site:",
    catalogId: WIKI_SITE_CATALOG_ID,
    buildSpec: (id) => {
      const { project, slug } = splitSiteId(id);
      return makeWikiSiteSpec(project, slug);
    },
    buildSpecId: (id) => {
      const { project, slug } = splitSiteId(id);
      return wikiSiteSpecId(project, slug);
    },
  });

  const { registry } = defineRegistry(wikiSiteCatalog, {
    components: {
      WikiSiteView: ({ props }) => <WikiSiteView project={props.project} slug={props.slug} />,
    },
    actions: {},
  });
  register(slots.register(catalogsSlot, WIKI_SITE_CATALOG_ID, registry));

  register(
    commands.listen(OpenWikiSiteCommand, (command) => {
      const { project, slug } = command.payload;
      const specId = wikiSiteSpecId(project, slug);
      const panelId = wikiSitePanelId(project, slug);
      if (!store.get(specId)) {
        store.create({
          id: specId,
          catalogId: WIKI_SITE_CATALOG_ID,
          spec: makeWikiSiteSpec(project, slug),
        });
      }
      void commands
        .call(ShowDockPanelCommand, { panelId, specId, title: slug })
        .promise.then(() => command.resolve())
        .catch((error) => command.reject(error));
      return true;
    }),
  );

  register(slots.provide(dockTabIconSlot, { panelIdPrefix: "wiki-site:", Icon: BookText }));

  return cleanup;
}
