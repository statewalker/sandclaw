import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  cn,
} from "@statewalker/ui.view.shadcn";
import {
  ChevronDown,
  ChevronRight,
  Globe,
  ListTree,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { today } from "../mock.js";
import { GenerationProgress } from "./generation-progress.js";
import { sites as mockSites, scriptedFailures } from "./mock-sites.js";
import { NewSiteDialog } from "./new-site-dialog.js";
import {
  ago,
  regenerateAll,
  regeneratePage,
  resumeGeneration,
  type Site,
  siteState,
  sourceText,
  step,
  stopGeneration,
} from "./site-model.js";
import { ConfirmRegenerate, OnlyHere, StateTag } from "./site-parts.js";
import { SiteViewer } from "./site-viewer.js";

export interface SitesProps {
  /** `cards`: one card per site; `rows`: a compact list. */
  layout?: "cards" | "rows";
  /** `page`: progress opens on its own page; `inline`: it unfolds under the site. */
  progress?: "page" | "inline";
  sites?: Site[];
  /** What is on screen first. */
  initialView?: View;
  /** Opens the New site dialog, on this source. */
  initialNew?: "folder" | "topics";
  /** Write a page every second or so. Off in tests. */
  live?: boolean;
  /** The table-of-contents editor (E2) lives elsewhere. */
  onEditToc?: (siteId: string) => void;
  now?: Date;
}

export type View =
  | { kind: "list" }
  | { kind: "progress"; siteId: string }
  | { kind: "viewer"; siteId: string };

/** The Sites screen: the list, a site's pages being written, and an opened site in its tab. */
export function Sites({
  layout = "cards",
  progress = "page",
  sites: initialSites = mockSites,
  initialView = { kind: "list" },
  initialNew,
  live = false,
  onEditToc,
  now = today,
}: SitesProps) {
  const [sites, setSites] = useState(initialSites);
  const [view, setView] = useState<View>(initialView);
  const [creating, setCreating] = useState(initialNew !== undefined);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  /** Rows unfolded to their pages (inline progress). */
  const [unfolded, setUnfolded] = useState(() =>
    initialSites.filter((s) => siteState(s) === "generating").map((s) => s.id),
  );

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(
      () => setSites((all) => all.map((s) => step(s, now, scriptedFailures))),
      1200,
    );
    return () => clearInterval(timer);
  }, [live, now]);

  const find = (id: string | null) => sites.find((s) => s.id === id);
  const update = (id: string, change: (site: Site) => Site) =>
    setSites((all) => all.map((s) => (s.id === id ? change(s) : s)));
  const editToc =
    onEditToc ??
    ((id: string) =>
      setNotice(`Here the table of contents of ${find(id)?.name ?? "the new site"} would open.`));
  /** After starting a generation: follow it where this variant shows progress. */
  const follow = (id: string) => {
    if (progress === "page") setView({ kind: "progress", siteId: id });
    else {
      setView({ kind: "list" });
      setUnfolded((u) => [...new Set([...u, id])]);
    }
  };
  const showPages = (id: string) =>
    progress === "page"
      ? setView({ kind: "progress", siteId: id })
      : setUnfolded((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));

  const pagesOf = (site: Site, variant: "page" | "inline") => (
    <GenerationProgress
      site={site}
      variant={variant}
      onRegeneratePage={(pageId) => update(site.id, (s) => regeneratePage(s, pageId))}
      onStop={() => update(site.id, stopGeneration)}
      onResume={() => update(site.id, resumeGeneration)}
      onBack={() => setView({ kind: "list" })}
    />
  );

  const opened = view.kind === "viewer" ? find(view.siteId) : undefined;
  const following = view.kind === "progress" ? find(view.siteId) : undefined;

  let body: ReactNode;
  if (opened) {
    body = (
      <div className="h-[640px] max-h-[80svh]">
        <SiteViewer
          site={opened}
          onRegenerate={() => setConfirming(opened.id)}
          onEditToc={editToc}
          onShowPages={() => setView({ kind: "progress", siteId: opened.id })}
        />
      </div>
    );
  } else if (following) {
    body = pagesOf(following, "page");
  } else {
    body = (
      <>
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <div className="mr-auto">
            <h2 className="font-semibold">Sites</h2>
            <OnlyHere />
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> New site
          </Button>
        </div>
        {sites.length === 0 ? (
          <div className="grid justify-items-center gap-3 p-8 text-center">
            <p className="text-muted-foreground text-sm">
              No sites yet. A site is a set of pages the assistant writes from your files, every
              fact cited.
            </p>
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              Start with a site about your whole folder
            </Button>
          </div>
        ) : (
          <ul className={cn(layout === "cards" ? "grid gap-3 p-4 @xl:grid-cols-2" : "divide-y")}>
            {sites.map((site) => (
              <SiteItem
                key={site.id}
                site={site}
                layout={layout}
                now={now}
                unfolded={progress === "inline" && unfolded.includes(site.id)}
                pages={progress === "inline" ? pagesOf(site, "inline") : null}
                onOpen={() => setView({ kind: "viewer", siteId: site.id })}
                onShowPages={() => showPages(site.id)}
                onRegenerate={() => setConfirming(site.id)}
                onEditToc={() => editToc(site.id)}
                onDelete={() => setDeleting(site.id)}
              />
            ))}
          </ul>
        )}
      </>
    );
  }

  const deletingSite = find(deleting);
  return (
    <Card className="@container w-full max-w-4xl gap-0 overflow-hidden py-0">
      {opened && (
        <div className="bg-muted/50 flex min-w-0 border-b text-sm">
          <button
            type="button"
            onClick={() => setView({ kind: "list" })}
            className="text-muted-foreground px-3 py-1.5"
          >
            Sites
          </button>
          <span className="bg-background flex min-w-0 items-center gap-1.5 border-x px-3 py-1.5">
            <Globe className="size-3.5 shrink-0" />
            <span className="truncate">{opened.name}</span>
            <button
              type="button"
              aria-label="Close tab"
              onClick={() => setView({ kind: "list" })}
              className="hover:bg-accent rounded p-0.5"
            >
              <X className="size-3.5" />
            </button>
          </span>
        </div>
      )}
      {notice && (
        <p role="status" className="bg-muted text-muted-foreground border-b px-4 py-1.5 text-xs">
          {notice}
        </p>
      )}
      {body}
      <NewSiteDialog
        open={creating}
        onOpenChange={setCreating}
        siteId={`site-new-${sites.length + 1}`}
        initialSource={initialNew}
        onEditToc={editToc}
        onCreate={(site) => {
          setSites((all) => [site, ...all]);
          follow(site.id);
        }}
      />
      <ConfirmRegenerate
        site={find(confirming)}
        open={confirming !== null}
        onOpenChange={(o) => !o && setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return;
          update(confirming, regenerateAll);
          if (view.kind !== "viewer") follow(confirming);
          setConfirming(null);
        }}
      />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deletingSite?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {deletingSite?.pages.length} pages are deleted from this computer. Your files are
              not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => {
                setSites((all) => all.filter((s) => s.id !== deleting));
                setDeleting(null);
              }}
            >
              Delete site
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

interface SiteItemProps {
  site: Site;
  layout: "cards" | "rows";
  now: Date;
  unfolded: boolean;
  /** The inline progress, when this variant has one. */
  pages: ReactNode;
  onOpen: () => void;
  onShowPages: () => void;
  onRegenerate: () => void;
  onEditToc: () => void;
  onDelete: () => void;
}

function SiteItem({ site, layout, now, unfolded, pages, ...on }: SiteItemProps) {
  const state = siteState(site);
  const readable = site.pages.some((p) => p.state === "done");
  const icon = (label: string, Icon: typeof Globe, onClick: () => void, danger = false) => (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(danger && "text-destructive hover:text-destructive")}
    >
      <Icon />
    </Button>
  );
  const Chevron = unfolded ? ChevronDown : ChevronRight;
  const status =
    state === "up-to-date" || state === "stale" ? (
      <StateTag site={site} />
    ) : (
      <button
        type="button"
        aria-expanded={pages ? unfolded : undefined}
        onClick={on.onShowPages}
        className="inline-flex items-center gap-1 rounded-full hover:opacity-80"
      >
        <StateTag site={site} />
        {pages ? (
          <Chevron className="text-muted-foreground size-4" />
        ) : (
          <span className="text-xs underline">See pages</span>
        )}
      </button>
    );

  return (
    <li
      aria-label={site.name}
      className={cn(layout === "cards" && "flex flex-col rounded-lg border")}
    >
      <div
        className={cn(
          "flex gap-3 p-4",
          layout === "cards" ? "flex-1 flex-col" : "flex-wrap items-center",
        )}
      >
        <div className={cn("min-w-0 flex-1", layout === "rows" && "basis-56")}>
          <p className="truncate font-medium">{site.name}</p>
          <p className="text-muted-foreground text-xs">
            {sourceText(site.source)} · {site.pages.length} pages ·{" "}
            {site.builtAt ? `built ${ago(site.builtAt, now)}` : "never built"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className={cn(layout === "cards" ? "mb-1 basis-full" : "mr-auto")}>{status}</span>
          <Button size="sm" variant="outline" disabled={!readable} onClick={on.onOpen}>
            Open
          </Button>
          {state !== "generating" && icon("Regenerate", RefreshCw, on.onRegenerate)}
          {icon("Edit table of contents", ListTree, on.onEditToc)}
          {icon("Delete", Trash2, on.onDelete, true)}
        </div>
      </div>
      {unfolded && pages && <div className="border-t">{pages}</div>}
    </li>
  );
}
