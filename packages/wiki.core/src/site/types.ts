/** One entry in a thematic-site table of contents. A leaf entry with a `prompt`
 * generates one page; `children` nest sub-entries. `id` is a slug of the title. */
export interface TocEntry {
  id: string;
  title: string;
  prompt?: string;
  children?: TocEntry[];
}

/** A generated page recorded in a site's `site.json` manifest. */
export interface SitePage {
  id: string;
  title: string;
  /** Project-relative path of the markdown page (under `sites/<slug>/`). */
  path: string;
  order: number;
  /** SHA-style hash of the prompt that produced this page (for incremental skip). */
  promptHash: string;
}

/** The `site.json` manifest the renderer consumes. */
export interface SiteManifest {
  slug: string;
  title: string;
  /** ISO timestamp the caller stamps after generation (kept out of the engine). */
  generated: string;
  pages: SitePage[];
}

/** Per-page progress yielded by `WikiSite.generate`. */
export interface SitePageProgress {
  id: string;
  title: string;
  status: "generating" | "written" | "skipped" | "pruned" | "failed";
  path?: string;
  error?: string;
}
