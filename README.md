# sandclaw

## What it is

The StateWalker chat and wiki applications, and the packages they are built from. Two web apps live here: `chat-mini.app`, a browser chat client with an AI agent, file viewers and self-indexing wikis, and `wiki-viewer.app`, a server-rendered viewer for wiki reports and live wiki questions. `ui-protos.app` is a Storybook of Sandclaw UI prototypes. Four packages are published to npm: `@statewalker/wiki.core` (the wiki engine), `@statewalker/wiki.view.react` (its React panel), `@statewalker/file-mounts.core` (storages mounted as one `FilesApi`) and `@statewalker/file-panels.core` (the logic behind a file panel). Everything else is private to this workspace.

## Layout

```
packages/
  wiki.core/            @statewalker/wiki.core         (npm)
  wiki.view.react/      @statewalker/wiki.view.react   (npm)
  file-mounts.core/     @statewalker/file-mounts.core  (npm)
  file-panels.core/     @statewalker/file-panels.core  (npm)
  app-shell/            @statewalker/app-shell         (private)
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
| [`@statewalker/file-mounts.core`](packages/file-mounts.core) | Storages mounted side by side as one `FilesApi`: local folders, browser storage, S3 buckets, an encrypted key vault. React-free. | [npm](https://www.npmjs.com/package/@statewalker/file-mounts.core) |
| [`@statewalker/file-panels.core`](packages/file-panels.core) | File-panel logic: breadcrumb, safe copy and move across storages with byte progress, file operations, a panel model. React-free. | [npm](https://www.npmjs.com/package/@statewalker/file-panels.core) |
| [`@statewalker/app-shell`](packages/app-shell) | `bootShell` / `bootHeadless`: boots the workbench substrate in a fixed order under an app. | private |
| [`@statewalker/chat-mini.chat`](apps/chat-mini.chat) | Chat logic fragment: `chat:open-session`, chat catalog, turn-block and composer slots. | private |
| [`@statewalker/chat-mini.chat-react`](apps/chat-mini.chat-react) | Chat renderer fragment: chat panel, turn views, sessions panel, deep links. | private |
| [`@statewalker/chat-mini-app`](apps/chat-mini.app) | The chat web app (Vite, port 3460). | private app |
| [`@statewalker/wiki-viewer-app`](apps/wiki-viewer.app) | The wiki viewer web app (HonoX, Vite port 5173). | private app |
| [`@statewalker/ui-protos-app`](apps/ui-protos.app) | Storybook of Sandclaw UI prototypes (port 6006), built to a static site. | private app |

```
chat-mini.app ──▶ app-shell, chat-mini.chat(-react), wiki.core, wiki.view.react
wiki-viewer.app ─▶ wiki.core
wiki.view.react ─▶ wiki.core
```

## How to run it

Requirements: Node 24 and pnpm 10 through corepack (the root `package.json` pins `pnpm@10.16.1`).

1. `corepack enable`
2. `pnpm install`
3. `pnpm run build`
4. Start an app: `pnpm --filter @statewalker/chat-mini-app dev` or `pnpm --filter @statewalker/wiki-viewer-app dev`. Each app's README has the details.

Run one package's scripts with `pnpm --filter <name> <script>`, for example `pnpm --filter @statewalker/wiki.core test`.

## Why it is the way it is

- **Logic and React are split into separate packages.** `wiki.core` and `chat-mini.chat` hold commands, state and slot definitions; `wiki.view.react` and `chat-mini.chat-react` hold the components. Code that only dispatches commands (other fragments, the CLI, the HonoX server) does not pull in chat or wiki components.
- **Published packages ship sources next to `dist/`.** Their `exports` point at `dist/` for consumers and add a `source` condition pointing at `src/`. The apps' Vite and Vitest configs resolve the `source` condition first, so in development they use the TypeScript sources of workspace packages directly.
- **Other StateWalker packages come from npm.** External dependencies are declared with `catalog:` ranges in `pnpm-workspace.yaml`; packages of this workspace reference each other with `workspace:^`. The workspace installs, builds and tests on its own.

## What will surprise you

- **`chat-mini.chat` and `chat-mini.chat-react` are libraries under `apps/`.** They are consumed only by `chat-mini.app` and are not published.
- **Some packages have no build step.** `app-shell`, `chat-mini.chat` and `chat-mini.chat-react` export `src/*.ts` directly; the app bundler compiles them.
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

### Releases are published by hand, not by CI

CI only runs the checks; it never publishes. The public packages are released by the maintainer from a local checkout of `main`, with npm 2FA:

1. `pnpm changeset` for each change to release, then `pnpm changeset version` to bump the versions and write the changelogs; commit that.
2. `pnpm run build`, then `pnpm pack` in each package whose new version is not on npm. `pnpm pack` turns `workspace:` and `catalog:` dependencies into version ranges; a plain `npm publish` from the package folder would ship them unresolved.
3. `npm publish <tarball> --access public`, dependencies first (`file-mounts.core` before `file-panels.core`, `wiki.core` before `wiki.view.react`).

A newly published package can answer 404 for a few minutes: npm replies "Your package is being processed and may take a few minutes to become available".

### License

MIT. See [LICENSE](LICENSE).
