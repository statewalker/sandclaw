# @statewalker/wiki-viewer-app

## What it is

A HonoX app (Hono server + Vite, React islands) that browses wikis built by `@statewalker/wiki.core` and runs live questions against them. It lists the wiki projects under a data directory, shows saved reports and answers with their citations, topics and outliers, opens the cited source (including PDFs at the cited page), and streams a live query: you ask a question, stage progress arrives as it happens, and the answer can be saved. This app is private and not published.

## Layout

```
app/
  server.ts            loads .env (dotenv), creates the HonoX app
  client.ts            client entry for the islands
  routes/              file-based routes (see Reference)
    api/               JSON / NDJSON endpoints
  islands/             interactive React parts (vault workspace, topics list)
  components/          server-rendered and shared components; ui/ = shadcn parts
  lib/
    wiki-repo.ts       the one Workspace over NodeFilesApi(dataRoot()), registerWiki()
    paths.ts           dataRoot(): REPORT_DATA_ROOT or a default
    reports.ts         projects, report and answer snapshots
    wiki.ts            citation, topic and source resolution through wiki adapters
```

A *project* is a directory under the data root that has a `.project/` system folder, which a wiki scan creates (the `wiki.core` CLI `scan`, or the chat app).

## How to run it

1. From the repository root, install and build: `pnpm install && pnpm run build`.
2. Create the env file: `cp apps/wiki-viewer.app/.env.example apps/wiki-viewer.app/.env`. Set `REPORT_DATA_ROOT` to the absolute path of the directory that holds your wiki projects, and set `OPENAI_API_KEY` (or `WIKI_PROVIDER=google` and `GOOGLE_GENERATIVE_AI_API_KEY`).
3. Start the dev server: `pnpm --filter @statewalker/wiki-viewer-app dev`, then open http://localhost:5173 (Vite's default port). `/` redirects to `/projects`.
4. For a production build: `pnpm --filter @statewalker/wiki-viewer-app build`, then `pnpm --filter @statewalker/wiki-viewer-app start` (runs `node ./dist/index.js`).

## Why it is the way it is

- **It does not reimplement the wiki.** Every read goes through `@statewalker/wiki.core` adapters (`WikiPageSummary`, `WikiPageMeta`, `WikiTopicIndex`, `WikiSnapshotsAdapter`, `WikiQuery`) on one server-side `Workspace`. The viewer has no on-disk parsing of its own, so it sees the same data as the wiki CLI and the chat app.
- **Reports and saved answers are wiki snapshots.** A saved answer is written with `WikiSnapshotsAdapter.saveAnswer(answer, question)` into `<project>/.project/snapshots/`; reports are `report` snapshots in the same folder. Snapshots are frozen: rebuilding the wiki does not change them.
- **Live query streams NDJSON.** `POST /api/query` returns one JSON object per line: `{ kind: "stage", stages }` on every stage change, then `{ kind: "answer", answer }` or `{ kind: "error", message }`. A query makes many LLM calls, so the page shows progress instead of waiting on one response.
- **Browsing works without an LLM key.** The provider is resolved lazily. Without a key the app still boots and serves projects, reports, topics and citations; only query and search need the provider.
- **SSR externalizes `node_modules`.** HonoX inlines every dependency into the SSR bundle by default, which breaks CommonJS packages such as `yaml` and `use-sync-external-store`. `vite.config.ts` overrides this: only `honox` and `@statewalker/*` packages are inlined, everything else is loaded by Node.
- **`.env` is loaded in `app/server.ts`.** Vite only exposes `VITE_`-prefixed variables to `import.meta.env`, while the wiki provider reads `process.env`, so `dotenv/config` is imported before any route. Variables already set in the shell win over the file.

## What will surprise you

- **Empty project list.** `REPORT_DATA_ROOT` is unset or wrong. Without it, `dataRoot()` falls back to `../../../../data` relative to the process directory, which is outside this repository (the shipped `.env.example` uses the same relative value). Set an absolute path. Directories without `.project/` are not listed.
- **`wiki provider not configured — set OPENAI_API_KEY (or WIKI_PROVIDER=google + GOOGLE_GENERATIVE_AI_API_KEY)`** comes back as the query error when no key is set. Browsing still works.
- **`WikiLlmConfiguration not loaded; call load() first`** can come back from a live query. The per-project model config lives in `<project>/.project/nature.wiki.json` and must be loaded before `WikiQuery` runs; the server calls `WikiQuery.ask` without loading it.
- **`unknown project '<name>'`** (404) from `/api/query` or `/api/answers` when the project directory does not exist under the data root. Pages for an unknown project return 404.
- **No reports.** Nothing in this app creates reports. They appear only after something calls `WikiSnapshotsAdapter.runReport(...)` for the project.

## Reference

### Commands

| Command | What it does |
| --- | --- |
| `pnpm --filter @statewalker/wiki-viewer-app dev` | Vite dev server with HonoX. |
| `pnpm --filter @statewalker/wiki-viewer-app build` | Client build (`--mode client`), then the server build into `dist/`. |
| `pnpm --filter @statewalker/wiki-viewer-app start` | Runs the built server (`node ./dist/index.js`). |
| `pnpm --filter @statewalker/wiki-viewer-app test` | Vitest. |
| `pnpm --filter @statewalker/wiki-viewer-app typecheck` | `tsc --noEmit`. |

### Configuration

| Variable | Meaning |
| --- | --- |
| `REPORT_DATA_ROOT` | Directory holding the wiki projects; the `rootDir` of the server's `NodeFilesApi`. |
| `WIKI_PROVIDER` | `openai` (default) or `google`. |
| `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Key for the selected provider. |
| `WIKI_MODEL`, `WIKI_MODEL_FAST`, `WIKI_MODEL_STRONG`, `WIKI_EMBED_MODEL`, `WIKI_EMBED_DIM` | Model overrides read by `resolveProvidersFromEnv`. |

### Routes

| Route | What |
| --- | --- |
| `/` | Redirects to `/projects`. |
| `/projects` | Wiki projects under the data root. |
| `/projects/<project>` | Project home: reports, answers, topics. |
| `/projects/<project>/reports`, `/projects/<project>/reports/<id>` | Report snapshots. |
| `/projects/<project>/answers`, `/projects/<project>/answers/<id>` | Saved answers. |
| `/projects/<project>/topics` | Topic index. |
| `/projects/<project>/search` | Live query workspace (`?q=` runs a question on load, `?topic=` opens a topic). |
| `POST /api/query` | `{ project, question }` → NDJSON stream. |
| `POST /api/answers` | `{ project, question, answer }` → saves a snapshot, returns its id. |
| `GET /api/source`, `/api/citations`, `/api/topic`, `/api/pdf` | Source text, citation, topic and PDF resolution. |
