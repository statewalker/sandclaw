import { Button, cn } from "@statewalker/ui.view.shadcn";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Circle,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { type PageState, progressOf, type Site, type SitePage, siteState } from "./site-model.js";
import { OnlyHere, ProgressBar } from "./site-parts.js";

export interface GenerationProgressProps {
  site: Site;
  /** `page`: a page of its own with a title and a way back; `inline`: under a list row. */
  variant?: "page" | "inline";
  onRegeneratePage: (pageId: string) => void;
  onStop: () => void;
  onResume: () => void;
  onBack?: () => void;
}

const icons: Record<PageState, typeof Check> = {
  waiting: Circle,
  writing: Loader2,
  done: Check,
  failed: AlertTriangle,
  stopped: Pause,
};

const iconClass: Record<PageState, string> = {
  waiting: "text-muted-foreground",
  writing: "text-primary animate-spin",
  done: "text-success",
  failed: "text-destructive",
  stopped: "text-muted-foreground",
};

const words: Record<PageState, string> = {
  waiting: "Waiting",
  writing: "Writing…",
  done: "Written",
  failed: "Failed",
  stopped: "Not written — stopped",
};

function PageRow({ page, onRegenerate }: { page: SitePage; onRegenerate: () => void }) {
  const Icon = icons[page.state];
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <Icon className={cn("size-4 shrink-0", iconClass[page.state])} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{page.title}</p>
        <p
          className={cn(
            "text-xs",
            page.state === "failed" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {page.state === "failed" ? `Failed: ${page.reason}` : words[page.state]}
        </p>
      </div>
      {page.state === "failed" && (
        <Button
          size="sm"
          variant="outline"
          aria-label={`Try again: ${page.title}`}
          onClick={onRegenerate}
        >
          <RotateCcw /> Try again
        </Button>
      )}
      {page.state === "done" && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Regenerate ${page.title}`}
          title="Regenerate this page"
          onClick={onRegenerate}
        >
          <RefreshCw />
        </Button>
      )}
    </li>
  );
}

/** Page by page: what is written, what is being written, what failed and why. */
export function GenerationProgress({
  site,
  variant = "page",
  onRegeneratePage,
  onStop,
  onResume,
  onBack,
}: GenerationProgressProps) {
  const p = progressOf(site.pages);
  const state = siteState(site);
  const left = p.writing + p.waiting;
  return (
    <section aria-label={`Pages of ${site.name}`} className="grid">
      <div className="grid gap-2 border-b p-4">
        {variant === "page" && (
          <div className="flex flex-wrap items-center gap-2">
            {onBack && (
              <Button size="icon-sm" variant="ghost" aria-label="Back to sites" onClick={onBack}>
                <ArrowLeft />
              </Button>
            )}
            <h2 className="mr-auto font-semibold">{site.name}</h2>
            <OnlyHere />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="mr-auto text-sm" aria-live="polite">
            {p.done} of {p.total} pages written
            {p.failed > 0 && ` · ${p.failed} failed`}
            {left > 0 && <span className="text-muted-foreground"> · about {left} min left</span>}
          </p>
          {state === "generating" && (
            <Button size="sm" variant="outline" onClick={onStop}>
              <Pause /> Stop
            </Button>
          )}
          {state === "stopped" && (
            <Button size="sm" variant="outline" onClick={onResume}>
              <Play /> Resume
            </Button>
          )}
        </div>
        <ProgressBar progress={p} />
        {state === "generating" && (
          <p className="text-muted-foreground text-xs">
            Pages are written on this computer, one at a time. Keep this browser open.
          </p>
        )}
      </div>
      <ol className="divide-y">
        {site.pages.map((page) => (
          <PageRow key={page.id} page={page} onRegenerate={() => onRegeneratePage(page.id)} />
        ))}
      </ol>
    </section>
  );
}
