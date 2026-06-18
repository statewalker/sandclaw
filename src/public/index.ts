// Public surface for `@statewalker/wiki.view.react`.

// The open-site command contract lives in `@statewalker/wiki` (React-free) so logic
// can dispatch it; re-exported here for renderer consumers.
export { OpenWikiSiteCommand, type OpenWikiSitePayload } from "@statewalker/wiki";
export {
  makeWikiSiteSpec,
  WIKI_SITE_CATALOG_ID,
  wikiSiteCatalog,
  wikiSitePanelId,
  wikiSiteSpecId,
} from "./catalog.js";
