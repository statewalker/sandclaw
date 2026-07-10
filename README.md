# sandclaw

Public home of the StateWalker **chat** and **wiki** applications.

| Package | Path | What |
| --- | --- | --- |
| `@statewalker/chat-mini-app` | [`apps/chat-mini.app`](apps/chat-mini.app) | The chat web app (Vite, dev `:3460`). |
| `@statewalker/wiki-viewer-app` | [`apps/wiki-viewer.app`](apps/wiki-viewer.app) | The wiki viewer web app (HonoX, Vite `:5173`). |
| `@statewalker/app-shell` | [`packages/app-shell`](packages/app-shell) | Shared application shell used by the apps. |
| `@statewalker/chat-mini.chat` | [`apps/chat-mini.chat`](apps/chat-mini.chat) | Chat fragment (React-free). |
| `@statewalker/chat-mini.chat-react` | [`apps/chat-mini.chat-react`](apps/chat-mini.chat-react) | Chat fragment renderer (React). |

## Building

These packages depend on other StateWalker sub-repos (`@statewalker/shell.core`,
`@statewalker/wiki.core`, `@statewalker/mime.view.markdown`, `@statewalker/shared-*`,
`@statewalker/indexer-*`, `@statewalker/content-extractors`, …) via `workspace:*`.
They are **not built standalone** — they build inside the **apps-umbrella** parent,
which checks out this repo alongside its public dependency repos
(`statewalker-shared`, `statewalker-workbench`, `statewalker-indexer`,
`statewalker-content`) and resolves the cross-repo links via `workspace:*` overrides.
`@statewalker/fsm` and `@statewalker/webrun-files*` come from npm.

See the `apps-umbrella` repository for the clone → install → build → dev-run flow.

## License

MIT.
