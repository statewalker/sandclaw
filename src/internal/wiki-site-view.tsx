import { Markdown } from "@repo/chat-mini.chat-react";
import { Button } from "@statewalker/ui.view.shadcn";
import { type ReactElement, useState } from "react";
import { pageUri, useFileText, useSiteManifest } from "./site-data.js";
import { SiteNav } from "./site-nav.js";

interface WikiSiteViewProps {
  project: string;
  slug: string;
}

function Centered({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function PageBody({ uri }: { uri: string }): ReactElement {
  const state = useFileText(uri);
  if (state.status === "loading") return <Centered>Loading…</Centered>;
  if (state.status === "error") return <Centered>Failed to load page: {state.message}</Centered>;
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none overflow-auto p-6">
      <Markdown>{state.text}</Markdown>
    </div>
  );
}

/**
 * Site-browser panel: reads a site's `site.json` manifest and renders a TOC
 * sidebar + breadcrumbs + prev/next over its pages, with the selected page's
 * markdown body rendered via the shared `Markdown` component. ADR-0002: all wiki
 * React lives here, never in `@statewalker/wiki`.
 */
export function WikiSiteView({ project, slug }: WikiSiteViewProps): ReactElement {
  const manifest = useSiteManifest(project, slug);
  const [selected, setSelected] = useState(0);

  if (manifest.status === "loading") return <Centered>Loading site…</Centered>;
  if (manifest.status === "error")
    return <Centered>Failed to load site: {manifest.message}</Centered>;
  if (manifest.status === "empty" || manifest.manifest.pages.length === 0) {
    return <Centered>No site generated yet.</Centered>;
  }

  const pages = manifest.manifest.pages;
  const index = Math.min(Math.max(selected, 0), pages.length - 1);
  const page = pages[index];
  if (!page) return <Centered>No site generated yet.</Centered>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
        <span className="font-medium">{manifest.manifest.title}</span>
        <span className="text-muted-foreground">›</span>
        <span>{page.title}</span>
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={index <= 0}
            onClick={() => setSelected(index - 1)}
          >
            Prev
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={index >= pages.length - 1}
            onClick={() => setSelected(index + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <SiteNav pages={pages} selected={index} onSelect={setSelected} />
        <div className="min-w-0 flex-1">
          <PageBody uri={pageUri(project, slug, page.path)} />
        </div>
      </div>
    </div>
  );
}
