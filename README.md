# sandclaw

## What it is

The StateWalker chat and wiki applications, the workbench they run on, and the packages they are built from. Every app is a set of fragments (plugins) run by one kernel: the kernel loader orders and activates them, the app context holds the shared systems and configs behind context adapters, services and views are slot contributions, and fragments call each other through commands (see [`kernel.core`](packages/kernel.core) and [the design](docs/superpowers/specs/2026-10-18-shell-consolidation-design.md)).

The workbench substrate (formerly `statewalker-kernel`) and its React renderers (formerly `statewalker-shell-react`) live here as source. Two web apps live here: `chat-mini.app`, a browser chat client with an AI agent, file viewers and self-indexing wikis, and `wiki-viewer.app`, a server-rendered viewer for wiki reports and live wiki questions. `ui-protos.app` is a Storybook of Sandclaw UI prototypes. The substrate packages, `kernel.core`, `file-*.core` and `wiki.*` are published to npm; `app-shell` and the apps are private to this workspace.

## Layout

```
packages/
  kernel.core/          @statewalker/kernel.core       extension kernel (npm)
  app-shell/            @statewalker/app-shell         boot on the kernel (private)
  backbone.*            module resolver / bootstrap (browser, node)
  platform.*            host capabilities as platform:* commands (browser, node)
  workspace.*           workspace model, FS-Access bridge, VCS nature
  render.core           json-render spec + layout stores
  shell.core            dock state and dock:* commands
  mime.core             viewer dispatch by MIME type
  explorer.core, settings.core, inline.core, webapp.*
  *.view.react, mime.view.*, ui.view.shadcn            React renderers of the above
  file-mounts.core, file-panels.core                   mounts, vault, file panels
  wiki.core/            @statewalker/wiki.core         (npm)
  wiki.view.react/      @statewalker/wiki.view.react   (npm)
apps/
  chat-mini.app/        @statewalker/chat-mini-app     (private app)
  chat-mini.chat/       @statewalker/chat-mini.chat        (private library)
  chat-mini.chat-react/ @statewalker/chat-mini.chat-react  (private library)
  wiki-viewer.app/      @statewalker/wiki-viewer-app   (private app)
  ui-protos.app/        @statewalker/ui-protos-app     (private app)
```

| Package | What | Published |
| --- | --- | --- |
| [`@statewalker/wiki.core`](packages/wiki.core) | LLM-curated wiki on the workspace model: ingestion pipeline, hybrid full-text + vector search, cited query answers, generated sites, CLI. React-free. | [npm](https://www.npmjs.com/package/@statewalker/wiki.core) |
| [`@statewalker/wiki.view.react`](packages/wiki.view.react) | React renderer fragment: dock panel that browses generated wiki sites. | [npm](https://www.npmjs.com/package/@statewalker/wiki.view.react) |
| [`@statewalker/kernel.core`](packages/kernel.core) | Kernel loader for app fragments; app context with context adapters; config; services, views and actions as slots; command helpers. React-free. | npm |
| [`@statewalker/app-shell`](packages/app-shell) | `bootShell` / `bootHeadless` (`./headless`): the workbench substrate and the app's fragments, run by the kernel. | private |
| [`@statewalker/chat-mini.chat`](apps/chat-mini.chat) | Chat logic fragment: `chat:open-session`, chat catalog, turn-block and composer slots. | private |
| [`@statewalker/chat-mini.chat-react`](apps/chat-mini.chat-react) | Chat renderer fragment: chat panel, turn views, sessions panel, deep links. | private |
| [`@statewalker/chat-mini-app`](apps/chat-mini.app) | The chat web app (Vite, port 3460). | private app |
| [`@statewalker/wiki-viewer-app`](apps/wiki-viewer.app) | The wiki viewer web app (HonoX, Vite port 5173). | private app |
| [`@statewalker/ui-protos-app`](apps/ui-protos.app) | Storybook of Sandclaw UI prototypes (port 6006), built to a static site. | private app |

```
chat-mini.app ──▶ app-shell, chat-mini.chat(-react), wiki.core, wiki.view.react
app-shell ──────▶ kernel.core, substrate (*.core, *.browser) and renderers (*.view.*)
ui-protos.app ──▶ kernel.core, file-mounts.core, file-panels.core
wiki-viewer.app ─▶ wiki.core
wiki.view.react ─▶ wiki.core
```

## How to run it

Requirements: Node 24 (some tests rely on the `URLPattern` global, which Node 22 lacks) and pnpm 10 through corepack (the root `package.json` pins `pnpm@10.16.1`).

1. `corepack enable`
2. `pnpm install`
3. `pnpm run build`
4. Start an app: `pnpm --filter @statewalker/chat-mini-app dev` or `pnpm --filter @statewalker/wiki-viewer-app dev`. Each app's README has the details.

Run one package's scripts with `pnpm --filter <name> <script>`, for example `pnpm --filter @statewalker/wiki.core test`.

## Why it is the way it is

- **Logic and React are split into separate packages.** `wiki.core` and `chat-mini.chat` hold commands, state and slot definitions; `wiki.view.react` and `chat-mini.chat-react` hold the components. Code that only dispatches commands (other fragments, the CLI, the HonoX server) does not pull in chat or wiki components.
- **Published packages ship sources next to `dist/`.** Their `exports` point at `dist/` for consumers and add a `source` condition pointing at `src/`. The apps' Vite and Vitest configs resolve the `source` condition first, so in development they use the TypeScript sources of workspace packages directly.
- **One kernel under every app.** Fragments are descriptors with an id and `requires`; the kernel orders them, isolates failures (a failing fragment blocks only what requires it) and can load or unload them at runtime. Fragments reach shared systems through context adapters and talk through commands, so none imports another to call it.
- **The substrate lives here as source.** The former `statewalker-kernel` and `statewalker-shell-react` packages keep their names and exports. `pnpm-workspace.yaml` overrides every local package to `workspace:*`, so npm-only packages that depend on the substrate (`ai-config.core`, `ai-agent-runtime.core`, …) link to the local copy instead of pulling a second one. Other external dependencies are declared with `catalog:` ranges; packages of this workspace reference each other with `workspace:^`.

## What will surprise you

- **`chat-mini.chat` and `chat-mini.chat-react` are libraries under `apps/`.** They are consumed only by `chat-mini.app` and are not published.
- **Some packages have no build step.** `app-shell`, `chat-mini.chat` and `chat-mini.chat-react` export `src/*.ts` directly; the app bundler compiles them.
- **`tsc --noEmit` reads sibling packages from `dist/`.** Run `pnpm run build` once before `pnpm run typecheck` on a fresh clone.
- **Tests that mix npm and linked `@statewalker` packages inline them** (`server.deps.inline: [/@statewalker\//]`): otherwise Node loads the npm package's copy of a linked dependency and Vite loads another, and class-keyed adapters stop matching.
- **`pnpm run lint` rewrites files** (`biome check --write`). Use `pnpm run lint:check` to only check.

## Reference

### Commands

| Command | What it does |
| --- | --- |
| `pnpm run build` | `pnpm -r run build` in every package that has a build script. |
| `pnpm run test` | `pnpm -r run test`. |
| `pnpm run typecheck` | `pnpm -r run typecheck`. |
| `pnpm run lint` / `pnpm run lint:check` | Biome check, with or without writing fixes. |
| `pnpm run format` / `pnpm run format:check` | Biome format, with or without writing. |

### Releases

The public packages are published to npm from CI with changesets. To choose the version bump or the changelog text yourself, add a changeset with `pnpm changeset`.

### License

MIT. See [LICENSE](LICENSE).
