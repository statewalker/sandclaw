# @statewalker/chat-mini-app

## What it is

A browser chat app built on the workbench shell. You pick a local folder as the workspace; the app gives you chat sessions with an AI agent (remote providers or local in-browser models), a file explorer, file viewers (markdown, images, PDF, video), and wikis: every top-level folder of the workspace becomes a wiki that is indexed in the background and that the agent can search and ask. It is a Vite + React single-page app with no server of its own. This app is private and not published.

## Layout

```
index.html, vite.config.ts     Vite entry and config (dev port 3460)
src/
  main.tsx                     boot: bootShell({ logic, onLogicReady, renderers })
  init-wiki.ts                 wiki activation, background scans, agent tools
  init-*-menu.ts               menubar entries (Chat, Files, Wiki)
  init-composer-picker.tsx     model picker in the chat composer
  init-active-model-projection.ts
  prototype-connections/       throwaway UI prototype behind ?prototype=connections
test/                          Vitest (jsdom): architecture + composition tests
release.sh                     builds a static zip with a start script
disabled-assets/               WebLLM weight-bridge service worker, not wired into the build
```

`main.tsx` composes fragments from other packages: the shell substrate from `@statewalker/app-shell`, chat from `@statewalker/chat-mini.chat` and `@statewalker/chat-mini.chat-react`, AI configuration and local models from `@statewalker/ai-*`, the file explorer from `@statewalker/explorer.*`, and the wiki from `@statewalker/wiki.core` and `@statewalker/wiki.view.react`.

## How to run it

1. From the repository root: `pnpm install && pnpm run build`.
2. `pnpm --filter @statewalker/chat-mini-app dev`, then open http://localhost:3460 (the server also listens on the network: `host: true`).
3. Pick a workspace folder when asked. Use a Chromium-based browser: the workspace is opened through the File System Access directory picker and restored from IndexedDB on the next visit.
4. Add a model connection in Settings and select an active model. Chat and wiki indexing both need it.

To ship a static build: `apps/chat-mini.app/release.sh`. It runs `pnpm build`, checks for `dist/index.html`, and writes `dist/<YYYY-MM-DD>.chat-mini.zip` containing `dist/` and a `start.sh` that installs Deno if missing and serves `dist/` with `jsr:@std/http/file-server`.

## Why it is the way it is

- **Logic and renderer fragments are separate.** Each feature has a React-free logic fragment (commands, slots, state) and a renderer fragment (components, catalogs). Logic fragments all run before renderers, so renderers can read slots that logic filled. `main.tsx` lists logic and renderers separately for that reason.
- **All app state lives in the workspace folder.** Fragment state (dock layout, provider config, sessions, settings, secrets, downloaded model weights) is stored under `<workspace>/.settings/` through the `SystemFiles` adapter, not in browser storage. User files stay in the folder itself. Moving the folder moves the app state with it.
- **Every top-level folder is a wiki.** `init-wiki.ts` gives each non-dot top-level folder the wiki nature: it writes `<folder>/.project/nature.wiki.json` with models derived from the active AI selection (the active chat model for every text stage; the connection's first embedding model, if any, for vectors; otherwise the wiki is full-text only). It then re-scans each wiki every 30 seconds. Scans are content-hash-gated, so a tick with no changes is cheap. New folders are picked up on the same 30-second interval.
- **The agent is steered to the wiki.** The wiki fragment contributes `wiki_search`, `wiki_ask` and site tools to the agent and a system-prompt block telling it to call them before reading files.

## What will surprise you

- **A folder is not indexed.** No active model is selected, so activation fails with `deriveWikiConfig: no active AiConfig model is selected`. It is logged as `not activating` (warn level) and retried every 30 seconds.
- **No wiki activates at all.** The provider registry failed to build; the log shows `provider registry failed — wikis will not activate`.
- **Dot folders are skipped.** `.project`, `.settings` and any other dot-prefixed top-level folder are never wikis.
- **The connections prototype replaces the app.** With `?prototype=connections` in the URL the throwaway prototype mounts instead of the real app.
- **The served zip needs network access once.** `start.sh` downloads Deno and the file-server module from JSR on first run.

## Reference

### Commands

| Command | What it does |
| --- | --- |
| `pnpm --filter @statewalker/chat-mini-app dev` | Vite dev server on port 3460. |
| `pnpm --filter @statewalker/chat-mini-app build` | Production build into `dist/`. |
| `pnpm --filter @statewalker/chat-mini-app preview` | Serves the built `dist/`. |
| `pnpm --filter @statewalker/chat-mini-app test` | Vitest, jsdom environment (`test/**` and `src/**`). |
| `pnpm --filter @statewalker/chat-mini-app typecheck` | `tsc --noEmit`. |
| `pnpm --filter @statewalker/chat-mini-app lint:check` | Biome check. |
| `apps/chat-mini.app/release.sh` | Build and package `dist/<date>.chat-mini.zip`. |

### Further reading

`CONTEXT.md` in this folder defines the app's domain terms (storage surfaces, fragments, slots, commands).
