import { defineCatalog, type Spec } from "@json-render/core";
import { schema } from "@statewalker/render.view.react";
import { z } from "zod";

/**
 * Catalog declaration for the wiki site-browser panel — typed schema only. The
 * `WikiSiteView` React binding lives in `init.tsx` (ADR-0002 logic/renderer split).
 * The single element carries `{ project, slug }`; the component reads `site.json`.
 */
export const wikiSiteCatalog = defineCatalog(schema, {
  components: {
    WikiSiteView: { props: z.object({ project: z.string(), slug: z.string() }) },
  },
  actions: {},
});

export const WIKI_SITE_CATALOG_ID = "wiki-site";

/** Build the one-element spec for a (project, slug) site. */
export function makeWikiSiteSpec(project: string, slug: string): Spec {
  return {
    root: "panel",
    elements: {
      panel: {
        type: "WikiSiteView",
        props: { project, slug },
        children: [],
      },
    },
  } as Spec;
}

/** Deterministic panel id so reopening the same site focuses the tab. */
export function wikiSitePanelId(project: string, slug: string): string {
  return `wiki-site:${project}/${slug}`;
}

/** Deterministic spec id; pairs with `wikiSitePanelId`. */
export function wikiSiteSpecId(project: string, slug: string): string {
  return `spec:wiki-site:${project}/${slug}`;
}
