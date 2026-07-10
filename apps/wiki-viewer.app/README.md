# @statewalker/wiki-viewer-app

A HonoX (Hono + Vite, React islands) app that **browses generated reports** and
runs **live search** over an LlmWiki vault, tracing every claim back to its
source document.

## What it does

- **Reports** — renders the YAML report sections under `<project>/reports/<set>/`
  with citations, topics/outliers, and an embedded source-PDF panel.
- **Live search** (`/q/<project>`) — streams the `@repo/wiki-runtime` query
  pipeline: a question dispatches the `WikiQueryCommand`, stage progress streams
  back live (NDJSON), and the final answer renders with the same section view as
  a report. Answers can be **saved** to `<project>/answers/<timestamp>.<slug>.yaml`
  — the exact report-section shape — and then appear as a "Saved answers"
  collection beside the reports, ordered chronologically.

A *project* is any directory under the data root with a `.wikiindex/`.

## Architecture

The query engine is **not** reimplemented here. Each operation is a *use case*
declared in `@repo/wiki-runtime` on `@statewalker/shared-commands`. The server
holds one `Commands` bus (`app/lib/query-runtime.ts`), and `app/routes/api/query.ts`
dispatches `WikiQueryCommand` with a `QueryProgress` observable it streams to the
browser. The CLI dispatches the identical command — only the transport differs.

The runtime is imported from its registry-free `@repo/wiki-runtime/embed` entry
so the (CJS) ingestion extractors never enter the app bundle — extraction is a
scan-time concern, the viewer only queries.

## Run

```sh
cp .env.example .env   # set OPENAI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY)
REPORT_DATA_ROOT=/abs/path/to/data pnpm --filter @statewalker/wiki-viewer-app dev
```

Routes: `/` (home), `/r/<project>/<set>` (report / saved answers), `/q/<project>`
(live search). API: `/api/query` (POST, NDJSON stream), `/api/answers` (POST, save),
`/api/{source,citations,topic,pdf}` (citation/topic/PDF resolution).
