# @statewalker/mime.view.markdown

## What it is

A view fragment that opens Markdown files in a dock tab, plus the `<Markdown>`
component it renders them with. The fragment adds a `MimeRenderer` for
`text/markdown` to the `files:mime-renderers` slot of `@statewalker/mime.core`
and registers the `markdown-viewer` json-render catalog. `<Markdown>` renders
a Markdown string with GitHub-flavored Markdown, line breaks kept, and
syntax-highlighted code blocks.

## Why it exists

`@statewalker/mime.core` sends a file URI to whichever renderer claims its
MIME type, but contains no viewers. This package is the Markdown viewer. The
`<Markdown>` component is exported so other views (for example chat output)
render Markdown the same way as files.

## How to use

```sh
pnpm add @statewalker/mime.view.markdown
```

Peer dependencies: `react` and `react-dom` (`>=18`).

| Import | Provides |
| --- | --- |
| `@statewalker/mime.view.markdown` | `Markdown`, `MarkdownProps`, the catalog and id helpers; default export is the fragment init |
| `@statewalker/mime.view.markdown/fragment` | Default export: `init(ctx)` returning `() => Promise<void>` |
| `@statewalker/mime.view.markdown/styles` | Tailwind v4 `@source` globs |

```ts
import "@statewalker/mime.view.markdown/styles";
import initMarkdownViewer from "@statewalker/mime.view.markdown/fragment";

const cleanup = initMarkdownViewer(ctx); // after the mime.core, render.core and shell.core logic fragments
```

The init registers the catalog, provides the `text/markdown` renderer, adds a
`FileText` icon for tabs whose id starts with `markdown-viewer:`, and, each
time the workspace opens, creates specs for `markdown-viewer:` tabs in the
saved layout.

## Examples

### Render a Markdown string

```tsx
import { Markdown } from "@statewalker/mime.view.markdown";

<Markdown className="prose prose-sm">{"# Title\n\n- one\n- two\n\n```ts\nconst x = 1;\n```"}</Markdown>;
```

`MarkdownProps`:

- `children: string` — the Markdown source.
- `id?: string` — prefix for block keys; a `useId()` value by default.
- `className?: string` — class of the wrapping `<div>`.
- `components?: Partial<Components>` — `react-markdown` component overrides,
  merged over the built-in `code` and `pre`.
- `remarkPlugins?: PluggableList` — added after `remark-gfm` and `remark-breaks`.
- `urlTransform?: UrlTransform` — passed to `react-markdown`; its default
  applies when omitted.

### Open a file

```ts
import { VisualizeFileCommand } from "@statewalker/mime.core";

await commands.call(VisualizeFileCommand, { uri: "file:///docs/readme.md" }).promise;
```

### Build the panel plan yourself

```ts
import {
  MARKDOWN_VIEWER_CATALOG_ID,
  makeMarkdownSpec,
  markdownViewerPanelId,
  markdownViewerSpecId,
} from "@statewalker/mime.view.markdown";

const uri = "file:///docs/readme.md";
const plan = {
  catalogId: MARKDOWN_VIEWER_CATALOG_ID, // "markdown-viewer"
  spec: makeMarkdownSpec(uri),
  panelId: markdownViewerPanelId(uri),
  specId: markdownViewerSpecId(uri),
};
```

This is what the registered `MimeRenderer.buildPanel(uri)` returns. Ids are
derived from the URI, so opening the same file again focuses the existing tab.
`markdownViewerCatalog` (the typed catalog) is exported too.

## Internals

### Why the text is split into blocks

`<Markdown>` splits the source into top-level blocks with `marked.lexer` and
renders each block with a memoized `react-markdown` instance. When the text
grows (for example while a chat answer streams in), the text is split again,
but only blocks whose text changed go through `react-markdown` again.

### Code blocks

Fenced code is highlighted with `shiki` (`codeToHtml`, theme `github-light`)
asynchronously, after the first render. The language comes from the
`language-*` class; without one, `plaintext`. Inline code (a code element that
starts and ends on the same line) is a styled `<span>`. The theme does not
change in dark mode.

### File tabs

`MarkdownView` calls `LoadFileCommand` (`files:load-file`), decodes the bytes
as UTF-8 with `TextDecoder`, and renders them inside a `prose` container. A
failed load shows `Failed to load file` and the error message. The dock
restores tabs from the saved layout (read from the `LayoutStore` adapter); a
restored tab without a spec would show `Spec <specId> is missing.`, so the init
creates specs for saved `markdown-viewer:` tabs when the workspace opens.

### Dependencies

- `react-markdown`, `remark-gfm`, `remark-breaks`, `marked`, `shiki` — parsing, rendering, highlighting.
- `@statewalker/mime.core` — `mimeRenderersSlot`.
- `@statewalker/render.core`, `@statewalker/render.view.react`, `@json-render/core`, `zod` — catalog, specs, `SpecStore`, `LayoutStore`.
- `@statewalker/shell.view.react` — `dockTabIconSlot`.
- `@statewalker/workspace.core` — `LoadFileCommand`, `getWorkspace`.
- `@statewalker/ui.view.react`, `@statewalker/ui.view.shadcn` — `useAppWorkspace`, `cn()`.
- `@statewalker/shared-commands`, `@statewalker/shared-slots`, `@statewalker/shared-registry` — fragment wiring.
- `lucide-react` — the `FileText` icon.
- `@statewalker/workspace.view.react` — declared but not imported by the source.

## License

MIT
