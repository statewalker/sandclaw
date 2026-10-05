# @statewalker/wiki.view.react

## What it is

A React renderer fragment for wikis built with `@statewalker/wiki.core`. It adds one dock panel, the wiki site browser: it opens a generated thematic site (`<project>/sites/<slug>/`) and shows a table-of-contents sidebar, breadcrumbs, previous/next links, and the selected page rendered as markdown. It handles the `wiki:open-site` command, so any logic code can open a site by dispatching `OpenWikiSiteCommand`.

## Why it exists

`@statewalker/wiki.core` generates sites (`WikiSite`) but contains no React, so it can run in Node, in a CLI, or in a worker. This package holds the wiki's React side and plugs it into the shell the same way other renderer fragments do: a json-render catalog, a command handler, and slot contributions. Apps that do not show wiki sites do not pay for React code in the wiki core.

## How to use

### Install

```sh
pnpm add @statewalker/wiki.view.react @statewalker/wiki.core
```

Peer dependencies: `react` and `react-dom` (^19.3.0).

### Entry points

| Subpath | What it gives |
| --- | --- |
| `@statewalker/wiki.view.react` | Catalog and id helpers: `wikiSiteCatalog`, `WIKI_SITE_CATALOG_ID` (`"wiki-site"`), `makeWikiSiteSpec`, `wikiSitePanelId`, `wikiSiteSpecId`, plus `OpenWikiSiteCommand` / `OpenWikiSitePayload` re-exported from `@statewalker/wiki.core`. |
| `@statewalker/wiki.view.react/fragment` | Default export: the renderer-fragment init `(ctx) => cleanup`. |
| `@statewalker/wiki.view.react/styles` | `src/styles.css`: Tailwind v4 `@source` directives so the host's Tailwind build picks up this package's classes. |

The code runs in the browser, inside a shell that has booted the workbench substrate.

### Register the fragment

Run the fragment init as a renderer, after the logic fragments, and import the styles once:

```ts
import initWikiReact from "@statewalker/wiki.view.react/fragment";
import "@statewalker/wiki.view.react/styles";

// e.g. with @statewalker/app-shell:
bootShell({ renderers: [initWikiReact] });
```

The init reads these adapters from the workspace in `ctx`: `Slots`, `SpecStore`, `Commands`, `LayoutStore`. If the substrate has not registered one of them, it fails with `No adapter registered for …`.

## Examples

### Open a generated site from logic code

```ts
import { Commands } from "@statewalker/shared-commands";
import { OpenWikiSiteCommand } from "@statewalker/wiki.core";

await workspace
  .requireAdapter(Commands)
  .call(OpenWikiSiteCommand, { project: "notes", slug: "overview" }).promise;
```

The handler creates the spec `spec:wiki-site:notes/overview` if needed and shows it in the dock panel `wiki-site:notes/overview` (via `ShowDockPanelCommand`), titled with the slug.

### Build the ids and spec yourself

```ts
import {
  makeWikiSiteSpec,
  wikiSitePanelId,
  wikiSiteSpecId,
} from "@statewalker/wiki.view.react";

wikiSitePanelId("notes", "overview"); // "wiki-site:notes/overview"
wikiSiteSpecId("notes", "overview");  // "spec:wiki-site:notes/overview"
makeWikiSiteSpec("notes", "overview"); // one WikiSiteView element with { project, slug }
```

## Internals

### Why ids are deterministic

The panel id and spec id are derived from `(project, slug)`. Opening the same site twice focuses the existing tab instead of opening a second one. On workspace load, the fragment walks the saved dock layout for panels with the `wiki-site:` prefix and recreates their specs from the id alone, so restored tabs render without any extra stored state.

### What the panel reads, and what it shows when something is missing

The view loads `/<project>/sites/<slug>/site.json` and the page files next to it through the `files:load-file` command (`LoadFileCommand`), so it works on any `FilesApi` the workspace uses. The states a user sees:

- `Loading site…` / `Loading…` while files load.
- `No site generated yet.` when `site.json` is missing or lists no pages. Generate the site first (`WikiSite.generate`, or the `generate_site` tool from `createWikiSiteTools`).
- `Failed to load site: <message>` when `site.json` is not valid JSON.
- `Failed to load page: <message>` when a page file cannot be read.

### What it depends on, and why

- `@statewalker/wiki.core`: the `OpenWikiSiteCommand` contract and the `SiteManifest` type.
- `@json-render/core`, `zod`, `@statewalker/render.core`, `@statewalker/render.view.react`: the catalog, spec store, layout restore, and React registry.
- `@statewalker/shell.core`, `@statewalker/shell.view.react`: `ShowDockPanelCommand` and the dock tab icon slot.
- `@statewalker/shared-commands`, `@statewalker/shared-registry`, `@statewalker/shared-slots`, `@statewalker/workspace.core`: command bus, cleanup registry, slots, workspace access.
- `@statewalker/mime.view.markdown`, `@statewalker/ui.view.react`, `@statewalker/ui.view.shadcn`, `lucide-react`: markdown rendering, workspace hook, buttons, the tab icon.

## License

MIT. See [LICENSE](../../LICENSE).
