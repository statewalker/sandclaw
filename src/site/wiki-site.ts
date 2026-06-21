import { joinPath as concatPath } from "@statewalker/webrun-files";
import { type Project, ProjectAdapter } from "@statewalker/workspace.core";
import type { Answer } from "../query/index.js";
import { WikiQuery } from "../query/index.js";
import { formatCitation, parseWikiUri } from "../uri/index.js";
import { tryReadJson, tryReadText, writeJsonAtomic, writeTextAtomic } from "../util/io.js";
import type { SiteManifest, SitePageProgress, TocEntry } from "./types.js";
import { flattenToc, wikiTocOf } from "./wiki-toc.js";

/** Project-visible folder holding generated thematic sites. */
export const SITES_DIR = "sites";

/** FNV-1a 32-bit hash of a prompt — a cheap, synchronous, deterministic stamp used to
 * skip regenerating a page whose prompt is unchanged. */
function hashPrompt(prompt: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Render a citation uri as a `[[…]]` wikilink, falling back to the raw string. */
function citation(uri: string): string {
  try {
    return formatCitation(parseWikiUri(uri));
  } catch {
    return uri;
  }
}

function docTitle(markdown: string): string | undefined {
  return /^#\s+(.+?)\s*$/m.exec(markdown)?.[1];
}

/** Render one TOC entry's grounded answer to a markdown page (frontmatter-stamped). */
function renderPage(entry: TocEntry, answer: Answer): string {
  const lines = [
    "---",
    `entryId: ${entry.id}`,
    `promptHash: ${hashPrompt(entry.prompt ?? "")}`,
    "---",
    "",
    `# ${entry.title}`,
    "",
    answer.text.trim(),
  ];
  if (answer.citations.length > 0) {
    lines.push("", "## Citations", "");
    answer.citations.forEach((c, i) => {
      lines.push(`${i + 1}. ${citation(c)}`);
    });
  }
  if (answer.caveats.length > 0) {
    lines.push("", "## Caveats", "", ...answer.caveats.map((c) => `- ${c}`));
  }
  return `${lines.join("\n")}\n`;
}

function renderIndex(manifest: SiteManifest): string {
  const lines = [`# ${manifest.title}`, ""];
  for (const page of manifest.pages) lines.push(`${page.order + 1}. [${page.title}](${page.path})`);
  return `${lines.join("\n")}\n`;
}

/** Read the `promptHash` from a page's frontmatter, if present. */
function frontmatterHash(markdown: string): string | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!block) return undefined;
  return /promptHash:\s*(\S+)/.exec(block[1] ?? "")?.[1];
}

/**
 * Generate and incrementally update a thematic markdown site from a `WikiToc`. Each
 * TOC leaf with a prompt becomes one page (`sites/<slug>/<id>.md`) whose body is the
 * grounded `WikiQuery` answer; an `index.md` nav page and a `site.json` manifest are
 * (re)written. Re-running skips pages whose prompt hash is unchanged (unless `force`)
 * and prunes pages whose entry was removed. Self-hosts on a `Project`.
 */
export class WikiSite extends ProjectAdapter {
  private siteDir(slug: string): string {
    return concatPath(this.path.replace(/^\/+|\/+$/g, ""), SITES_DIR, slug);
  }

  async *generate(
    tocSlug: string,
    opts: { force?: boolean } = {},
  ): AsyncIterable<SitePageProgress> {
    const toc = await wikiTocOf(this.project).read(tocSlug);
    if (!toc) throw new Error(`TOC not found: ${tocSlug}`);

    const pages = flattenToc(toc.entries).filter((e) => e.prompt);
    const query = this.project.requireAdapter(WikiQuery);
    const dir = this.siteDir(tocSlug);
    const keepIds = new Set(pages.map((p) => p.id));

    const manifest: SiteManifest = {
      slug: tocSlug,
      title: docTitle(toc.markdown) ?? tocSlug,
      generated: "",
      pages: [],
    };

    let order = 0;
    for (const entry of pages) {
      const promptHash = hashPrompt(entry.prompt ?? "");
      const path = concatPath(dir, `${entry.id}.md`);
      const record = {
        id: entry.id,
        title: entry.title,
        path: `${entry.id}.md`,
        order: order++,
        promptHash,
      };

      const existing = await tryReadText(this.filesApi, path);
      if (!opts.force && existing != null && frontmatterHash(existing) === promptHash) {
        manifest.pages.push(record);
        yield { id: entry.id, title: entry.title, status: "skipped", path };
        continue;
      }

      yield { id: entry.id, title: entry.title, status: "generating" };
      try {
        const answer = await query.ask(entry.prompt ?? "").complete();
        await writeTextAtomic(this.filesApi, path, renderPage(entry, answer));
        manifest.pages.push(record);
        yield { id: entry.id, title: entry.title, status: "written", path };
      } catch (err) {
        order--;
        yield {
          id: entry.id,
          title: entry.title,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // Prune pages whose TOC entry was removed (and stale system files are kept).
    if (await this.filesApi.exists(dir)) {
      for await (const info of this.filesApi.list(dir, { recursive: false })) {
        if (info.kind !== "file" || !info.path.endsWith(".md")) continue;
        const base = (info.path.split("/").pop() ?? "").replace(/\.md$/, "");
        if (base === "index" || keepIds.has(base)) continue;
        await this.filesApi.remove(info.path);
        yield { id: base, title: base, status: "pruned", path: info.path };
      }
    }

    await writeTextAtomic(this.filesApi, concatPath(dir, "index.md"), renderIndex(manifest));
    await writeJsonAtomic(this.filesApi, concatPath(dir, "site.json"), manifest);
  }

  /** Read a generated site's manifest, or `undefined` when absent. */
  async manifest(slug: string): Promise<SiteManifest | undefined> {
    return tryReadJson<SiteManifest>(this.filesApi, concatPath(this.siteDir(slug), "site.json"));
  }
}

/** Resolve the `WikiSite` adapter for a project. */
export function wikiSiteOf(project: Project): WikiSite {
  return project.requireAdapter(WikiSite);
}
