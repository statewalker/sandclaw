# sandclaw

Public home of the StateWalker **chat** and **wiki** applications, and of the packages
they are built from.

This repository is the **staging ground for the product tier**: the applications and
their supporting libraries are gathered here so they can be extracted together into the
[sandclaw-ai](https://github.com/sandclaw-ai) organisation, which is where end-user
applications live with their own CI/CD. The `statewalker` organisation holds the
low-level libraries; this repository is the boundary between the two.

## Applications

| Package | Path | What |
| --- | --- | --- |
| `@statewalker/chat-mini-app` | [`apps/chat-mini.app`](apps/chat-mini.app) | The chat web app (Vite, dev `:3460`). |
| `@statewalker/wiki-viewer-app` | [`apps/wiki-viewer.app`](apps/wiki-viewer.app) | The wiki viewer web app (HonoX, Vite `:5173`). |

## Packages

| Package | Path | What |
| --- | --- | --- |
| `@statewalker/app-shell` | [`packages/app-shell`](packages/app-shell) | Shared application shell both apps boot from. |
| `@statewalker/wiki.core` | [`packages/wiki.core`](packages/wiki.core) | Wiki domain logic (React-free). Moved here from `statewalker-workbench`. |
| `@statewalker/wiki.view.react` | [`packages/wiki.view.react`](packages/wiki.view.react) | Wiki renderer (React). Moved with `wiki.core`, which was its only remaining consumer outside this repo. |
| `@statewalker/chat-mini.chat` | [`apps/chat-mini.chat`](apps/chat-mini.chat) | Chat fragment (React-free). A library, still located under `apps/`. |
| `@statewalker/chat-mini.chat-react` | [`apps/chat-mini.chat-react`](apps/chat-mini.chat-react) | Chat fragment renderer (React). Also a library under `apps/`. |

Each moved package kept its history, both in `main`'s ancestry and on a `history/*`
branch (`history/wiki.core`, `history/wiki.view.react`, `history/content-extractors`).
`content-extractors` has since been removed here: it was a byte-identical copy of the one
in `statewalker-search`, which is now its only home.

## Building

The repository installs, builds and tests on its own: other StateWalker packages come
from the registry.

```sh
pnpm install
pnpm run build
pnpm run test
```

## Cross-repo dependencies

This repository depends on:

| Repository | Packages used |
| --- | --- |
| [`statewalker-ai`](https://github.com/statewalker/statewalker-ai) | `@statewalker/ai-agent-runtime.core`, `@statewalker/ai-agent.core`, `@statewalker/ai-config.core`, `@statewalker/ai-local-models.browser`, `@statewalker/ai-local-models.core` |
| [`statewalker-fsm`](https://github.com/statewalker/statewalker-fsm) | `@statewalker/fsm` |
| [`statewalker-kernel`](https://github.com/statewalker/statewalker-kernel) | `@statewalker/explorer.core`, `@statewalker/inline.core`, `@statewalker/mime.core`, `@statewalker/platform.browser`, `@statewalker/platform.core`, `@statewalker/platform.node`, `@statewalker/render.core`, `@statewalker/settings.core`, `@statewalker/shell.core`, `@statewalker/workspace.browser`, `@statewalker/workspace.core` |
| [`statewalker-search`](https://github.com/statewalker/statewalker-search) | `@statewalker/content-extractors`, `@statewalker/indexer-api`, `@statewalker/indexer-fulltext`, `@statewalker/indexer-mem-flexsearch`, `@statewalker/indexer-vector` |
| [`statewalker-shared`](https://github.com/statewalker/statewalker-shared) | `@statewalker/shared-adapters`, `@statewalker/shared-baseclass`, `@statewalker/shared-commands`, `@statewalker/shared-logger`, `@statewalker/shared-registry`, `@statewalker/shared-slots` |
| [`statewalker-workbench`](https://github.com/statewalker/statewalker-workbench) | `@statewalker/ai-config.view.react`, `@statewalker/ai-local-models.view.react`, `@statewalker/explorer.view.react`, `@statewalker/inline.view.react`, `@statewalker/mime.view.image`, `@statewalker/mime.view.markdown`, `@statewalker/mime.view.pdf`, `@statewalker/mime.view.video`, `@statewalker/render.view.react`, `@statewalker/settings.view.react`, `@statewalker/shell.view.react`, `@statewalker/ui.view.react`, `@statewalker/ui.view.shadcn`, `@statewalker/workspace.view.react` |
| [`webrun-files`](https://github.com/statewalker/webrun-files) | `@statewalker/webrun-files`, `@statewalker/webrun-files-browser`, `@statewalker/webrun-files-node` |

Cross-repo dependencies are declared `catalog:` with ranges on the released versions (see
`pnpm-workspace.yaml`); packages of this repository reference each other with `workspace:^`.

## License

MIT.
