// A thematic site: pages the assistant writes from the user's files, one by one,
// on this machine. Pure functions over plain data; the components hold the state.

/** One sentence of a page, with the numbers of the sources it cites. */
export interface Sentence {
  text: string;
  cites: number[];
}

/** A cited file: "Clients/Dupont — offer.docx", section "Prices". */
export interface PageSource {
  n: number;
  path: string;
  section: string;
}

export type PageState = "waiting" | "writing" | "done" | "failed" | "stopped";

export interface SitePage {
  id: string;
  title: string;
  state: PageState;
  /** Why a failed page failed, in the user's words. */
  reason?: string;
  /** The written page: paragraphs of cited sentences. */
  body?: Sentence[][];
  sources?: PageSource[];
  /** A picture taken from the files, shown as a placeholder in the prototype. */
  figure?: { caption: string; path: string };
}

export type SiteSource = { kind: "folder"; path: string } | { kind: "topics" };

export interface Site {
  id: string;
  name: string;
  source: SiteSource;
  pages: SitePage[];
  /** When the last generation finished; absent before the first one. */
  builtAt?: Date;
  /** Source files changed since `builtAt`. */
  changedFiles: string[];
}

/** What the list says about a site, most urgent first. */
export type SiteState = "generating" | "stopped" | "failed" | "stale" | "up-to-date";

export interface Progress {
  total: number;
  done: number;
  failed: number;
  writing: number;
  waiting: number;
  stopped: number;
}

export function progressOf(pages: SitePage[]): Progress {
  const p: Progress = {
    total: pages.length,
    done: 0,
    failed: 0,
    writing: 0,
    waiting: 0,
    stopped: 0,
  };
  for (const page of pages) p[page.state]++;
  return p;
}

export function siteState(site: Site): SiteState {
  const p = progressOf(site.pages);
  if (p.writing + p.waiting > 0) return "generating";
  if (p.stopped > 0) return "stopped";
  if (p.failed > 0) return "failed";
  if (site.changedFiles.length > 0) return "stale";
  return "up-to-date";
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Up to date", "3 files changed since the last build", "Generating page 3 of 8", … */
export function stateText(site: Site): string {
  const p = progressOf(site.pages);
  switch (siteState(site)) {
    case "generating":
      return `Generating page ${Math.min(p.total, p.done + p.failed + 1)} of ${p.total}`;
    case "stopped":
      return `Stopped · ${p.done} of ${p.total} pages written`;
    case "failed":
      return `${plural(p.failed, "page")} failed`;
    case "stale":
      return `${plural(site.changedFiles.length, "file")} changed since the last build`;
    case "up-to-date":
      return "Up to date";
  }
}

const setPages = (site: Site, change: (page: SitePage) => SitePage): Site => ({
  ...site,
  pages: site.pages.map(change),
});

/** Keeps one page writing while any is waiting: pages are written one at a time. */
function kick(site: Site): Site {
  if (site.pages.some((p) => p.state === "writing")) return site;
  const next = site.pages.find((p) => p.state === "waiting");
  return next ? setPages(site, (p) => (p === next ? { ...p, state: "writing" } : p)) : site;
}

/** Queue one page again (a failed one, or a done one to rewrite). */
export function regeneratePage(site: Site, pageId: string): Site {
  return kick(
    setPages(site, (p) => (p.id === pageId ? { ...p, state: "waiting", reason: undefined } : p)),
  );
}

export function regenerateAll(site: Site): Site {
  return kick(setPages(site, (p) => ({ ...p, state: "waiting", reason: undefined })));
}

/** Pages not written yet keep their previous version, if any, and wait for Resume. */
export function stopGeneration(site: Site): Site {
  return setPages(site, (p) =>
    p.state === "waiting" || p.state === "writing" ? { ...p, state: "stopped" } : p,
  );
}

export function resumeGeneration(site: Site): Site {
  return kick(setPages(site, (p) => (p.state === "stopped" ? { ...p, state: "waiting" } : p)));
}

/**
 * The page being written is finished — done, or failed when `failures` names it —
 * and the next one starts. The last page closes the build.
 */
export function step(site: Site, now: Date, failures: Record<string, string> = {}): Site {
  const writing = site.pages.find((p) => p.state === "writing");
  if (!writing) return site;
  const reason = failures[writing.id];
  const next = kick(
    setPages(site, (p) =>
      p === writing ? { ...p, state: reason ? "failed" : "done", reason } : p,
    ),
  );
  return siteState(next) === "generating" ? next : { ...next, builtAt: now, changedFiles: [] };
}

/** "Overview" plus one page per thing in the folder: "Dupont", "Leroy", "Contracts". */
export function suggestFromFolder(folderName: string, entries: { name: string }[]): string[] {
  const subject = (name: string) => (name.split(" — ")[0] ?? name).replace(/\.[^.]+$/, "");
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const titles = entries.map((e) => capital(subject(e.name)));
  return [`${folderName}: overview`, ...new Set(titles)];
}

export function newSite(id: string, name: string, source: SiteSource, titles: string[]): Site {
  const pages = titles.map((title, i) => ({
    id: `${id}-p${i + 1}`,
    title,
    state: "waiting" as const,
  }));
  return kick({ id, name, source, pages, changedFiles: [] });
}

const DAY = 24 * 60 * 60 * 1000;

/** "today", "yesterday", "3 days ago". */
export function ago(at: Date, now: Date): string {
  const days = Math.floor((now.getTime() - at.getTime()) / DAY);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export function sourceText(source: SiteSource): string {
  return source.kind === "topics" ? "From the topics Ask found" : `From the folder ${source.path}`;
}
