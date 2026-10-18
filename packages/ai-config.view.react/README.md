# @statewalker/ai-config.view.react

## What it is

The "Remote Models" tab of the settings dialog, where a user adds AI provider
connections (Anthropic, OpenAI-compatible endpoints and other types defined in
`@statewalker/ai-config.core`), enters API keys, tests the connection, and
stars models. The tab is a json-render spec from `@statewalker/ai-config.core`
rendered with shadcn components; this package supplies the React bindings, the
action handlers and the bridge that copies `AiConfig` state into the spec's
state.

## Why it exists

`@statewalker/ai-config.core` holds the `AiConfig` adapter, the tab's spec,
and the allowed component and action names, with no React. Anything that needs
React or json-render's React schema lives here: the typed catalog, the
components, the action implementations and the state bridge. The fragment
plugs the tab into the settings dialog.

## How to use

```sh
pnpm add @statewalker/ai-config.view.react
```

Peer dependencies: `react` and `react-dom` (`>=18`).

| Import | Provides |
| --- | --- |
| `@statewalker/ai-config.view.react` | `AiConfigConnectionsTab`, `buildConnectionsRegistry`, `connectionsCatalog`; default export is the fragment init |
| `@statewalker/ai-config.view.react/fragment` | Default export: `init(ctx)` returning `() => Promise<void>` |
| `@statewalker/ai-config.view.react/styles` | An empty stylesheet (comments only), kept as a place for tab-specific styles |

Activate the logic fragment first, then this one:

```ts
import initAiConfig from "@statewalker/ai-config.core/fragment";
import initAiConfigView from "@statewalker/ai-config.view.react/fragment";

initAiConfig(ctx);
const cleanup = initAiConfigView(ctx);
```

The init:

1. Registers `AiConfigConnectionsTab` in `core:views` under
   `AI_CONFIG_CONNECTIONS_TAB_VIEW_KEY`.
2. Adds a `settings:tabs` entry titled "Remote Models", `order: 20`.
3. Handles `ConfigureAiCommand` by calling `OpenSettingsCommand` with that tab.

## Examples

### Open the tab from anywhere

```ts
import { ConfigureAiCommand } from "@statewalker/ai-config.core";

await commands.call(ConfigureAiCommand, undefined).promise;
```

### Mount the tab directly

```tsx
import { AiConfigConnectionsTab } from "@statewalker/ai-config.view.react";

<AiConfigConnectionsTab />; // needs an <AppWorkspaceProvider> ancestor and the AiConfig adapter
```

### Build the registry

```ts
import { buildConnectionsRegistry, connectionsCatalog } from "@statewalker/ai-config.view.react";

const registry = buildConnectionsRegistry({ actions: handlers });
```

`buildConnectionsRegistry` returns json-render's `DefineRegistryResult`.
`handlers` must implement the seven actions: `addConnection`,
`connectConnection`, `disconnectConnection`, `removeConnection`,
`toggleModelStar`, `addHeader`, `removeHeader`. The tab builds these
internally; the function is exported for tests and custom hosts.
`connectionsCatalog` extends `@json-render/shadcn`'s component definitions
with the tab's three custom components.

## Internals

### One store per mounted tab

`AiConfigConnectionsTab` creates a json-render `StateStore` per mount, builds
the action handlers over `{ aiConfig, store }`, builds the registry, and
renders the spec with `SpecRenderer`. It sits outside the
`<JSONUIProvider>`, so it watches `/ui/activeConnectionId` in the store
directly and re-syncs the bridge when the selected tab changes.

### The state bridge

`createConnectionsBridge(store, aiConfig)` writes
`/persistent/{hasConnections,tabs,active}` from `AiConfig.listConnections()`
and loads the selected connection's draft into `/ui/form`. It runs on every
`AiConfig` update and on tab changes. The form is reloaded only when the
selected connection changes, so typing is not lost when an unrelated config
update arrives. A connection counts as connected once models were discovered
for it.

### API keys are write-only

The bridge never reads a key back; the key field always starts empty.
`connectConnection` writes the key to `Secrets` (via `AiConfig.setApiKey`)
only when the field is not empty. An empty field keeps the stored key, so
re-testing does not erase it.

### What "Connect" does, and what the user sees when it fails

1. URL required for `anthropic` and `openai-compatible`; otherwise the form
   shows `A URL is required for <type> connections.`
2. Saves the connection (name, URL, headers).
3. Saves the key, or, if none is typed and none is stored, shows
   `An API key is required.`
4. Fetches the model list. If no models are starred yet, stars the defaults
   from `applyDefaultStarred`.
5. If no model is active yet, makes the first starred model active, so a new
   workspace can start a chat session.
6. Collapses the form. Any thrown error is shown as its message in the form.

Removing a connection that has a stored key asks for confirmation first.

### Custom components

- `Collapsible` (controlled): open state lives in `/ui/form/settingsOpen`, so
  a successful connect can collapse the form. The stock shadcn one only has
  `defaultOpen`.
- `StatusTabs`: tab strip with a status dot (connected, testing, error, idle).
- `FieldInput`: sets `autoComplete`, `data-1p-ignore` and `data-lpignore` to
  stop password managers from filling one connection's key into another, and
  has a show/hide toggle for the key.

The component and action names must stay within
`CONNECTIONS_COMPONENTS` / `CONNECTIONS_ACTIONS` from
`@statewalker/ai-config.core`.

### Dependencies

- `@statewalker/ai-config.core` — `AiConfig`, the spec, ids, `ConfigureAiCommand`, `applyDefaultStarred`.
- `@json-render/core`, `@json-render/shadcn` — `StateStore`, `defineCatalog`, stock shadcn components.
- `@statewalker/render.view.react` — `SpecRenderer`, `defineRegistry`, `schema`, binding hooks.
- `@statewalker/settings.core` — `settingsTabSlot`, `OpenSettingsCommand`.
- `@statewalker/ui.view.react`, `@statewalker/ui.view.shadcn` — `coreViewsSlot`, `useAppWorkspace`, primitives.
- `@statewalker/workspace.core`, `@statewalker/shared-commands`, `@statewalker/shared-registry`, `@statewalker/shared-slots` — fragment wiring.
- `lucide-react` (eye icons), `zod` (schemas).
- `@statewalker/render.core` — declared but not imported by the source.

## License

MIT
