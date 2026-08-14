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
| `@statewalker/content-extractors` | [`packages/content-extractors`](packages/content-extractors) | Text extraction from PDF/DOCX/XLSX/Markdown/HTML. Moved here from the archived `statewalker-content`. |
| `@statewalker/chat-mini.chat` | [`apps/chat-mini.chat`](apps/chat-mini.chat) | Chat fragment (React-free). A library, still located under `apps/`. |
| `@statewalker/chat-mini.chat-react` | [`apps/chat-mini.chat-react`](apps/chat-mini.chat-react) | Chat fragment renderer (React). Also a library under `apps/`. |

Each moved package kept its history, both in `main`'s ancestry and on a `history/*`
branch (`history/wiki.core`, `history/wiki.view.react`, `history/content-extractors`).

## Building

These packages depend on other StateWalker repositories via `workspace:*` and are
**not built standalone**. They build inside a StateWalker umbrella workspace, which
checks this repository out alongside the repositories listed below and resolves the
cross-repo links.

## Cross-repo dependencies

This repository depends on:

| Repository | Packages used |
| --- | --- |
| [`statewalker-fsm`](https://github.com/statewalker/statewalker-fsm) | `@statewalker/fsm` |
| [`statewalker-indexer`](https://github.com/statewalker/statewalker-indexer) | `@statewalker/indexer-api`, `@statewalker/indexer-fulltext`, `@statewalker/indexer-mem-flexsearch`, `@statewalker/indexer-vector` |
| [`statewalker-shared`](https://github.com/statewalker/statewalker-shared) | `@statewalker/shared-adapters`, `@statewalker/shared-baseclass`, `@statewalker/shared-commands`, `@statewalker/shared-logger`, `@statewalker/shared-registry`, `@statewalker/shared-slots` |
| [`statewalker-workbench`](https://github.com/statewalker/statewalker-workbench) | `@statewalker/ai-agent-runtime.core`, `@statewalker/ai-agent.core`, `@statewalker/ai-config.core`, `@statewalker/ai-config.view.react`, `@statewalker/ai-local-models.browser`, `@statewalker/ai-local-models.core`, `@statewalker/ai-local-models.view.react`, `@statewalker/explorer.core`, `@statewalker/explorer.view.react`, `@statewalker/inline.core`, `@statewalker/inline.view.react`, `@statewalker/mime.core`, `@statewalker/mime.view.image`, `@statewalker/mime.view.markdown`, `@statewalker/mime.view.pdf`, `@statewalker/mime.view.video`, `@statewalker/platform.browser`, `@statewalker/platform.core`, `@statewalker/platform.node`, `@statewalker/render.core`, `@statewalker/render.view.react`, `@statewalker/settings.core`, `@statewalker/settings.view.react`, `@statewalker/shell.core`, `@statewalker/shell.view.react`, `@statewalker/ui.view.react`, `@statewalker/ui.view.shadcn`, `@statewalker/workspace.browser`, `@statewalker/workspace.core`, `@statewalker/workspace.view.react` |
| [`webrun-files`](https://github.com/statewalker/webrun-files) | `@statewalker/webrun-files`, `@statewalker/webrun-files-browser`, `@statewalker/webrun-files-node` |

**Depended on by:** nothing else in the workspace — it sits at the top of the graph.

Cross-repo dependencies are declared `workspace:*` rather than `catalog:`. This is
deliberate: turbo derives its task graph from `workspace:` specifiers and does **not**
resolve `catalog:`, so a `catalog:` cross-repo dependency is invisible to the scheduler
and its consumer can be built before it.

## License

MIT.
