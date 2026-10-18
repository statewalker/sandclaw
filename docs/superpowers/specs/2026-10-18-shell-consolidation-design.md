# Shell consolidation and the extension kernel — design

The StateWalker shell lived in four places. This change brings them into sandclaw and puts one extension system under all of them:

- **Kernel loader.** The kernel loads app fragments (plugins).
- **App context.** It holds the common systems and configs, reached through context adapters.
- **Slots.** Services and views are slot contributions.
- **Commands.** Fragments call each other only through commands.

## What was analysed

| Project | What it is | What happens to it |
| --- | --- | --- |
| [statewalker-kernel](https://github.com/statewalker/statewalker-kernel) | 17 headless packages: `backbone.*` (module resolver), `workspace.*`, `platform.*`, `render.core`, `shell.core`, `mime.core`, `explorer.core`, `settings.core`, `inline.core`, `webapp.*`, `workspace-vcs.core` | Imported into `packages/` unchanged (commit "Import statewalker-kernel and statewalker-shell-react packages") |
| [statewalker-shell-react](https://github.com/statewalker/statewalker-shell-react) | 15 React renderer packages (`*.view.react`, `mime.view.*`, `ui.view.shadcn`) for the kernel | Imported into `packages/` |
| [statewalker-shell-theia](https://github.com/statewalker/statewalker-shell-theia) | A browser-only Eclipse Theia shell over a `FilesApi`: 12 `theia-*` extensions, prototypes P1–P8 | Not imported (see [The Theia shell](#the-theia-shell)); its framework-free cores are ported as `.core` packages |
| [sandclaw `apps/ui-protos.app`](../../../apps/ui-protos.app) | Storybook of Sandclaw prototypes; the App story has its own `Feature.contribute(rt)` runtime over slots and commands | Its runtime now runs features as kernel fragments over a kernel context |

### Findings that shaped the design

**There were four plugin mechanisms, and none had metadata.**

- `app-shell`'s `bootShell` called a fixed list of `init(ctx)` functions, ordered only by position.
- `backbone.core` had a resolver, but it followed only `workspace:` ranges, and nothing in sandclaw used it.
- `workspace.core`'s natures were not used by its own natures.
- ui-protos had `Feature`s.

No mechanism gave a fragment an id or requirements, isolated failures, or loaded fragments at runtime.

**Every package reached the buses through the workspace.** The app context (`ctx`) held only `workspace:workspace` and a QueryClient, and fragments reached everything else with `getWorkspace(ctx).requireAdapter(X)`. The workspace was doing two jobs: a file system model, and the app's service locator.

**There was a silent mismatch on the QueryClient.** `ui.view.react` read `core-views:query-client`, while `app-shell` and the apps wrote `core-react:query-client`. The host's `queryClientOptions` never reached React. It is fixed by `queryClientAdapter`, a single context adapter that owns the key.

**Menus carried closures.** `MenubarItem.onActivate` is a closure. `chat-mini.app` had copied the same "new session" closure into two menus. The unified-app spec had already recorded that menu items should name a command.

**The browser bundle loaded Node code.** `app-shell` imported `platform.node` for `bootHeadless`. That only stayed hidden while the kernel came pre-bundled from npm; with the sources in the workspace, Vite reported `node:os` in the browser.

**npm copies duplicated the substrate.** npm-only packages (`ai-config.core`, `ai-agent-runtime.core`, …) depend on the substrate. Without overrides they pulled a second `workspace.core` from the registry, which meant two `Secrets` classes, and `requireAdapter` resolved the wrong one.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Import the kernel and shell-react packages as source under `packages/`, keeping names, versions and exports | One repository for the substrate and the apps; nothing downstream has to change its imports |
| 2 | `pnpm` overrides map every local package to `workspace:*` | npm-only packages (`ai-*.core`) must link to the local substrate, or adapters and types are duplicated |
| 3 | A new framework-free `@statewalker/kernel.core` holds the loader, context adapters, config, services, views, actions and command helpers | One small contract under the existing fragments, instead of a fifth mechanism next to the others |
| 4 | Fragments are descriptors: `{ id, requires?, after?, activate }`, or `{ id, requires?, load }` for lazy ones; plain `init(ctx)` functions are wrapped with `fromInit` | Ordering, failure isolation and runtime loading need metadata before the code is loaded; every existing `/fragment` export keeps working |
| 5 | Stable topological order: requirements first, the given order otherwise | The host's listing still decides everything requirements do not; the substrate keeps its historical order |
| 6 | Failures are isolated: `failed` for the fragment, `blocked` for what requires it, the rest starts | A broken plugin must not take the app down |
| 7 | Synchronous fragments activate and tear down synchronously | `bootShell` mounts React in the same tick as before, and ui-protos contributes inside `useState` |
| 8 | Systems live on the app context behind context adapters (`kernel:slots`, `kernel:commands`, `kernel:config`, `kernel:logger`, `kernel:handled-commands`, `kernel:kernel`); `createWorkspaceContext` binds the workspace's `Slots`/`Commands` adapters to them | Fragments no longer need a workspace to reach the buses, and fragments not yet migrated share the same bus |
| 9 | Services are a plain slot of prioritized providers (`defineService`) | Services get the same contribution, disposal and observation semantics as views and menus; a plugin can replace a service at runtime |
| 10 | Views stay in the `core:views` keyed slot (`provideView`), keyed by `viewKey` | Logic fragments place views by key; renderers register components; the existing React host resolves them unchanged |
| 11 | Menus, palettes and shortcuts read `kernel:actions`: `{ command, payload, menu?, order?, shortcut?, icon? }` | An action names a command instead of carrying a closure; `handledCommandsAdapter` tells a UI which actions work |
| 12 | `app-shell` splits into `.` (browser) and `./headless` (Node) | The browser bundle must not import `platform.node` |
| 13 | The Theia shell is not imported | See below |

## Architecture

```
            ┌──────────────── app context (AppContext) ────────────────┐
host  ──▶   │ kernel:kernel   kernel:config   kernel:logger            │
(bootShell) │ kernel:slots ── services · views · actions · fragments   │
            │ kernel:commands ── every call between fragments          │
            │ workspace:workspace ── Slots/Commands adapters = above    │
            └──────────────────────────────────────────────────────────┘
                 ▲ activate(ctx) in dependency order, cleanup in reverse
   Kernel ── [platform] [render.core] [shell.core] [workspace] … [app fragments] … [ui.view.react] …
```

- **Fragment.** It adds what it brings in `activate(ctx)` and returns a cleanup that takes everything back.
- **Context adapter.** `defineContextAdapter<T>(key, create?)` gives typed `get` / `find` / `set` / `remove`, walking `ctx.parent`.
- **Config.** A fragment declares `defineConfig(key, defaults)`; the host passes `config: { key: {...} }`; the fragment reads `getConfig(ctx, decl)`.
- **Service.** `provideService(ctx, decl, impl, { priority })` provides an implementation; consumers use `getService`, `requireService`, `observeService` or `waitForService`.
- **View.** A renderer registers a component with `provideView(ctx, viewKey, Component)`. Logic places views by key through the dock's `dockSidePanelsSlot`, `dockHeaderItemsSlot` and `dockOverlaysSlot`, or `settings:tabs`.
- **Command.** One fragment answers with `handleCommand(ctx, decl, handler)`; anyone calls with `callCommand(ctx, decl, payload)`.
- **Action.** `provideAction(ctx, defineAction(decl, payload, { menu, label }))` adds a menu or palette entry.
- **Fragment states.** These are published in the `kernel:fragments` keyed slot, so a plugin manager view can be built on it.

## What changed in the apps

- **`chat-mini.app`** lists its fragments with ids and requirements.
  - `chat-mini:new-session` is one command, answered by `init-new-session`; the Chat and Wiki menus are two actions over it.
  - The Files menu is an action over `file-explorer:new-panel`.
- **`ui-protos.app`**: `createRuntime()` is a view onto a kernel context, `handle` is `handleCommand`, and `contributeAll` activates the features as kernel fragments.
- **`app-shell`**:
  - The substrate is a set of fragments with `SUBSTRATE` ids.
  - The menubar renders kernel actions next to the legacy `MenubarItem`s.
  - The System menu is two actions; switch-workspace is the `app-shell:switch-workspace` command.

## The Theia shell

`statewalker-shell-theia` is built on Theia's inversify container. It needs:

- decorators with emitted metadata;
- a hoisted `node_modules`;
- `@theia/cli` with a patched `decompress`;
- a 24–37 MB bundle.

Importing it would force those constraints on the whole workspace, so the Theia packages stay in their repository.

### How its contributions map onto the kernel

| Theia | Kernel |
| --- | --- |
| `ContainerModule` per package, ordered by `theiaExtensions` dependency order | A fragment with `requires` |
| `rebind(X)` overriding by load order | A higher-priority `provideService`, or a context adapter set by the host |
| `bindContributionProvider(X)` + multi-bound `X` (`MountType`, `FilesApiLayer`, `MeshContribution`, `OpenHandler`, `WidgetFactory`) | `defineSlot<X>(…)` / `defineService` |
| Single DI symbols (`FilesApiSource`, `VaultLocation`, `MountDefaults`, `MainStorageInitializer`) | Context adapters or `defineConfig` sections |
| `CommandContribution` + `MenuContribution` + `KeybindingContribution` | `handleCommand` + `provideAction` (`menu`, `shortcut`) |
| `FrontendApplicationContribution.onStart` | `activate` |
| `OpenHandler.canHandle(uri) → priority` | `mimeRenderersSlot` (`mime.core`) with `order` |

### What is ported

The framework-free cores are the part worth keeping. Most of the file layer is already ported:

- **Already in sandclaw:**
  - `file-mounts.core` holds the mount table, mount types, main storage and vault, ported from `theia-files-mounts`, `theia-files-s3` and `theia-secret-vault`.
  - `file-panels.core` holds the transfer planner and runner, breadcrumbs and sorting, ported from `theia-file-panels`.
- **Still to port as `.core` packages**, each with its tests, and replacing Theia's `Event`/`URI`/`nls` with plain types:
  - `theia-llm-chat/src/common` → `llm-chat.core`: chat controller, OpenAI-compatible streaming client, session stores, setup state machine, mesh discovery.
  - `theia-httpeers-proxy/src/common` → `httpeers-proxy.core`: proxy table, route store, `assertNoSecrets`.
  - `theia-markdown/src/common` → `markdown-edits.core`: outline parser, toggle wrap and heading, `nextUntitledName`, safe render.
  - `theia-httpeers/src/common/mesh-model.ts` → the mesh model behind a `MeshContribution`-style slot `{ configureMounts?, advertisements? }`.
  - Image zoom math and `createTextPdf` → `mime.view.image` and test helpers.
- **Recorded gotchas:**
  - EmbedPDF works offline only with the wasm as a data URL and `fonts:{ui:null,signature:null}`.
  - S3 buckets need `x-amz-copy-source` in their CORS rule.
  - A non-ESM bundle has no `import.meta.url`.
  - The ServiceWorker must be served at `/sw.js`.

## Next steps

1. Give each fragment package a descriptor next to its init: `export const fragment = defineFragment({ id, requires, activate })` on `./fragment`. `app-shell`'s `substrate-*` lists then shrink to imports.
2. Move the substrate packages' `workspace.requireAdapter(Slots | Commands)` calls to `getSlots(ctx)` / `getCommands(ctx)`, so they no longer need a workspace to reach the buses.
3. A plugin-manager view over `fragmentsSlot`, plus `importFragment(url)` for plugins installed at runtime (the role P6 played in the Theia shell).
4. Replace `backbone.core`'s activation loop with the kernel. Keep its resolver and import-map builders as a source of `LazyFragment`s for dynamic loading.
5. Port the Theia cores listed above, then build their views as fragments.
