# @statewalker/webapp.view.react

## What it is

A view fragment that shows a web app hosted from the workspace inside a dock
tab. It defines `<SiteFrame>`, an `<iframe>` pointed at
`baseUrl + clientEntry`, and registers it as the only component of the
web-app catalog (`WEBAPP_DOCK_CATALOG_ID` from `@statewalker/webapp.browser`)
in the `json:catalogs` slot. The shell's `json` dock panel then renders such
tabs.

## Why it exists

`@statewalker/webapp.browser` hosts the app and handles the open command: it
resolves the URL and creates a dock spec with `makeSiteFrameSpec`. That code
has no React. This package is the renderer for the spec; it only draws the
iframe and never touches the hosting code.

## How to use

```sh
pnpm add @statewalker/webapp.view.react
```

Peer dependencies: `react` and `react-dom` (`>=18`).

| Import | Provides |
| --- | --- |
| `@statewalker/webapp.view.react` | `SiteFrame`, `siteFrameCatalog`; default export is the fragment init |
| `@statewalker/webapp.view.react/fragment` | Default export: `init(ctx)` returning `() => Promise<void>` |

There is no `./styles` entry; the iframe uses inline styles.

```ts
import initWebAppView from "@statewalker/webapp.view.react/fragment";

const cleanup = initWebAppView(ctx);
```

## Examples

### Render the frame directly

```tsx
import { SiteFrame } from "@statewalker/webapp.view.react";

<SiteFrame baseUrl="/apps/demo/" clientEntry="index.html" />;
```

Props are `SiteFrameParams` from `@statewalker/webapp.browser`
(`{ baseUrl, clientEntry }`). The two strings are joined as they are, so
`baseUrl` (a same-origin URL) must end with `/`.

### The catalog

`siteFrameCatalog` declares one component, `SiteFrame`, with props
`{ baseUrl: string, clientEntry: string }` and no actions. The init binds it
to `<SiteFrame>` with `defineRegistry` and registers the result under
`WEBAPP_DOCK_CATALOG_ID`.

## Internals

### What the user sees when it is missing

If this fragment is not activated, a web-app tab shows
`Catalog <catalogId> is not registered.` from the shell's `json` panel.

### Constraints

The iframe fills the tab (`width: 100%`, `height: 100%`, no border) and has
the title `web-app`. It sets no `sandbox` or `allow` attributes.

### Dependencies

- `@statewalker/webapp.browser` — `WEBAPP_DOCK_CATALOG_ID`, `SiteFrameParams`.
- `@statewalker/render.core`, `@statewalker/render.view.react`, `@json-render/core`, `zod` — `catalogsSlot`, `defineRegistry`, `schema`, `defineCatalog`.
- `@statewalker/workspace.core`, `@statewalker/shared-slots`, `@statewalker/shared-registry` — fragment wiring.
- `@statewalker/shell.view.react` — declared but not imported by the source.

## License

MIT
