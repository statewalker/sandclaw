import { Button } from "@statewalker/ui.view.shadcn";
import { AlertTriangle, ExternalLink, Globe, ListTree, Loader2, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { siteHtml } from "./site-html.js";
import { progressOf, type Site, siteState } from "./site-model.js";
import { OnlyHere, StateDot } from "./site-parts.js";

export interface SiteViewerProps {
  site: Site;
  /** Asks before regenerating; the components above decide what follows. */
  onRegenerate?: () => void;
  onEditToc?: (siteId: string) => void;
  /** Shown in the banner while pages are written or when some failed. */
  onShowPages?: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The site's tab: our small toolbar, a banner when the site is not current, the site itself. */
export function SiteViewer({ site, onRegenerate, onEditToc, onShowPages }: SiteViewerProps) {
  const html = useMemo(() => siteHtml(site), [site]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [notice, setNotice] = useState("");

  // A citation in the site asks the app to open the cited file.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "sandclaw:open-file") setNotice(`Here ${e.data.path} would open.`);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const openWindow = () => {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank");
  };

  const action = (label: string, Icon: typeof Globe, onClick?: () => void) => (
    <Button variant="ghost" size="sm" aria-label={label} title={label} onClick={onClick}>
      <Icon /> <span className="hidden @2xl:inline">{label}</span>
    </Button>
  );

  const p = progressOf(site.pages);
  const state = siteState(site);
  let banner: ReactNode = null;
  if (state === "generating") {
    banner = (
      <Banner icon={<Loader2 className="size-4 shrink-0 animate-spin" />}>
        Writing page {Math.min(p.total, p.done + p.failed + 1)} of {p.total}. Pages are replaced as
        they're written.
        {onShowPages && <InlineLink onClick={onShowPages}>See progress</InlineLink>}
      </Banner>
    );
  } else if (state === "failed") {
    banner = (
      <Banner icon={<AlertTriangle className="text-destructive size-4 shrink-0" />}>
        {plural(p.failed, "page")} failed and {p.failed === 1 ? "is" : "are"} not in the site.
        {onShowPages && <InlineLink onClick={onShowPages}>See pages</InlineLink>}
      </Banner>
    );
  } else if (state === "stale") {
    banner = (
      <Banner icon={<StateDot state="stale" />}>
        {plural(site.changedFiles.length, "file")} changed since this site was built.
        <InlineLink onClick={onRegenerate}>Regenerate</InlineLink>
      </Banner>
    );
  }

  return (
    <div className="bg-background @container flex h-full min-h-0 w-full min-w-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2">
        <Globe className="text-muted-foreground size-5 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-sm font-medium" title={site.name}>
            {site.name}
          </h2>
          <OnlyHere />
        </div>
        <div className="flex items-center gap-0.5">
          {action("Open in new window", ExternalLink, openWindow)}
          {action("Regenerate", RefreshCw, onRegenerate)}
          {action("Edit table of contents", ListTree, () => onEditToc?.(site.id))}
        </div>
      </header>
      {notice && (
        <p role="status" className="bg-muted text-muted-foreground border-b px-3 py-1.5 text-xs">
          {notice}
        </p>
      )}
      {banner}
      <iframe
        ref={frame}
        title={site.name}
        srcDoc={html}
        sandbox="allow-scripts"
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}

function Banner({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b bg-yellow-100/70 px-3 py-1.5 text-xs dark:bg-yellow-500/15">
      {icon}
      <p className="min-w-0 flex-1">{children}</p>
    </div>
  );
}

function InlineLink({ onClick, children }: { onClick?: () => void; children: ReactNode }) {
  return (
    <>
      {" "}
      <button type="button" onClick={onClick} className="font-medium underline">
        {children}
      </button>
    </>
  );
}
