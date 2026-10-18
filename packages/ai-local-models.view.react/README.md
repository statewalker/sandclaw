# @statewalker/ai-local-models.view.react

## What it is

The "Local Models" tab of the settings dialog. It lists the models that can
run in the browser, shows each model's description, and lets the user
download weights (with progress), cancel a download, delete weights, and pick
a downloaded model as the active one. The tab is a json-render spec from
`@statewalker/ai-local-models.core`; this package supplies the React
bindings, the action handlers and the bridge from the `LocalModels` adapter
into the spec's state.

## Why it exists

`@statewalker/ai-local-models.core` holds the `LocalModels` adapter (catalog
of models, weight storage, downloaded set), the tab spec, and the
`settings:tabs` entry, with no React. This package renders that spec and wires
its buttons to the adapter.

## How to use

```sh
pnpm add @statewalker/ai-local-models.view.react
```

Peer dependencies: `react` and `react-dom` (`>=18`).

| Import | Provides |
| --- | --- |
| `@statewalker/ai-local-models.view.react` | `aiLocalModelsCatalog`, types `AiLocalModelsCatalog`, `LocalModelRow`; default export is the fragment init |
| `@statewalker/ai-local-models.view.react/fragment` | Default export: `init(ctx)` returning `() => Promise<void>` |
| `@statewalker/ai-local-models.view.react/styles` | Tailwind v4 `@source` globs |

Activate the logic fragment first (it contributes the settings tab), then
this one:

```ts
import initLocalModels from "@statewalker/ai-local-models.core/fragment";
import initLocalModelsView from "@statewalker/ai-local-models.view.react/fragment";
import "@statewalker/ai-local-models.view.react/styles";

initLocalModels(ctx);
const cleanup = initLocalModelsView(ctx);
```

The init:

1. Registers the tab component in `core:views` under
   `LOCAL_MODELS_TAB_VIEW_KEY` (the key used by the logic fragment's
   `settings:tabs` entry).
2. Registers a registry for `aiLocalModelsCatalog` in `json:catalogs` under
   `AI_LOCAL_MODELS_CATALOG_ID`.

## Examples

### Validate a spec against the catalog

```ts
import { aiLocalModelsCatalog } from "@statewalker/ai-local-models.view.react";
```

`aiLocalModelsCatalog` is `@json-render/shadcn`'s component definitions plus a
`Markdown` component (`{ source: string }`), and four actions, each taking
`{ key: string }`: `downloadLocalModel`, `cancelDownload`, `removeLocalModel`,
`selectLocalModel`.

`LocalModelRow` is the shape of one entry in `/persistent/localModelsList`.

## Internals

### What each action does

| Action | Effect |
| --- | --- |
| `downloadLocalModel` | Iterates `LocalModels.download(key)` and writes progress to `/ui/downloads/<key>` (`phase`, `progress`, `message`); then `markDownloaded(key)`. An error is written to `/ui/downloads/<key>/error`. |
| `cancelDownload` | `LocalModels.cancelDownload(key)` and clears `/ui/downloads/<key>`. |
| `removeLocalModel` | `LocalModels.removeWeights(key)`. |
| `selectLocalModel` | Calls `SelectLocalModelCommand` with `{ modelId: key }`; the logic fragment handles it. |

### The registry in `json:catalogs` has no working actions

The tab component builds its own store, handlers and registry per mount and
renders through its own `<JSONUIProvider>`. The registry the init puts into
`json:catalogs` is built with an empty handler map. A local-models spec opened
anywhere else (for example as a dock tab) renders, but its buttons log
`No handler registered for action: ...` and do nothing.

### State

`bindLocalModels(store, localModels)` writes `/persistent/localModelsList`
from the curated catalog and the downloaded set, and updates it when the
adapter changes. Model descriptions are rendered with `react-markdown` and
`remark-gfm`; an empty description renders nothing.

### Dependencies

- `@statewalker/ai-local-models.core` — `LocalModels`, spec, ids, `SelectLocalModelCommand`.
- `@json-render/core`, `@json-render/react`, `@json-render/shadcn`, `zod` — store, rendering, catalog. This package imports `@json-render/react` directly instead of going through `@statewalker/render.view.react`.
- `@statewalker/render.core` — `catalogsSlot`.
- `@statewalker/ui.view.react` — `coreViewsSlot`, `useAppWorkspace`.
- `react-markdown`, `remark-gfm` — model descriptions.
- `@statewalker/workspace.core`, `@statewalker/shared-commands`, `@statewalker/shared-registry`, `@statewalker/shared-slots` — fragment wiring.

## License

MIT
