import { joinPath as concatPath } from "@statewalker/webrun-files";
import { type Project, ProjectAdapter } from "@statewalker/workspace.core";
import { WikiTopicIndex } from "../knowledge/index.js";
import { tryReadText, writeTextAtomic } from "../util/io.js";
import type { TocEntry } from "./types.js";

/** Project-visible folder holding hand-editable TOC markdown files. */
export const TOCS_DIR = "tocs";

export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "page";
}

/**
 * Parse TOC markdown into an ordered entry tree. `##` headings are top-level pages,
 * `###` headings are their children, and `#` is the document title (ignored). The
 * non-heading text under a heading (until the next heading) becomes that entry's
 * `prompt`. A `###` with no preceding `##` is promoted to top level.
 */
export function parseToc(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let current: TocEntry | undefined;
  let currentChild: TocEntry | undefined;
  let promptLines: string[] = [];

  const flush = (): void => {
    const target = currentChild ?? current;
    if (target) {
      const prompt = promptLines.join(" ").trim();
      if (prompt) target.prompt = prompt;
    }
    promptLines = [];
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(raw);
    if (heading) {
      flush();
      const level = (heading[1] ?? "").length;
      const title = heading[2] ?? "";
      if (level <= 1) {
        current = undefined;
        currentChild = undefined;
      } else if (level === 2) {
        current = { id: slugify(title), title };
        currentChild = undefined;
        entries.push(current);
      } else {
        const entry: TocEntry = { id: slugify(title), title };
        if (current) {
          if (!current.children) current.children = [];
          current.children.push(entry);
          currentChild = entry;
        } else {
          current = entry;
          currentChild = undefined;
          entries.push(entry);
        }
      }
    } else if (raw.trim()) {
      promptLines.push(raw.trim());
    }
  }
  flush();
  return entries;
}

/** Depth-first flatten of a TOC tree (parents before children). */
export function flattenToc(entries: TocEntry[]): TocEntry[] {
  const out: TocEntry[] = [];
  const walk = (es: TocEntry[]): void => {
    for (const e of es) {
      out.push(e);
      if (e.children) walk(e.children);
    }
  };
  walk(entries);
  return out;
}

/**
 * Read/write/list the project's table-of-contents markdown files (one per slug at
 * `<project>/tocs/<slug>.md`), and draft a starter TOC from the wiki's topic index.
 * Self-hosts on a `Project` (no registration), like `WikiQuery`.
 */
export class WikiToc extends ProjectAdapter {
  private dir(): string {
    return concatPath(this.path.replace(/^\/+|\/+$/g, ""), TOCS_DIR);
  }

  private tocPath(slug: string): string {
    return concatPath(this.dir(), `${slug}.md`);
  }

  /** Write a TOC markdown file; returns its project-relative path. */
  async write(slug: string, markdown: string): Promise<string> {
    const path = this.tocPath(slug);
    await writeTextAtomic(this.filesApi, path, markdown);
    return path;
  }

  /** Read a TOC and its parsed entries, or `undefined` when absent. */
  async read(slug: string): Promise<{ markdown: string; entries: TocEntry[] } | undefined> {
    const markdown = await tryReadText(this.filesApi, this.tocPath(slug));
    if (markdown == null) return undefined;
    return { markdown, entries: parseToc(markdown) };
  }

  /** List the available TOCs (slug + document title). */
  async *list(): AsyncIterable<{ slug: string; title: string }> {
    const dir = this.dir();
    if (!(await this.filesApi.exists(dir))) return;
    for await (const info of this.filesApi.list(dir, { recursive: false })) {
      if (info.kind !== "file" || !info.path.endsWith(".md")) continue;
      const slug = (info.path.split("/").pop() ?? "").replace(/\.md$/, "");
      const md = await tryReadText(this.filesApi, info.path);
      const title = /^#\s+(.+?)\s*$/m.exec(md ?? "")?.[1] ?? slug;
      yield { slug, title };
    }
  }

  /**
   * Draft a starter TOC markdown from the wiki's topic index, nesting index topics
   * under their category headings (`##` categories, `###` topics). A bare root index
   * topic (no category) renders as a top-level `##` entry.
   */
  async suggest(): Promise<string> {
    const index = this.project.requireAdapter(WikiTopicIndex);
    const lines = ["# Suggested table of contents", ""];
    const promptFor = (node: { name: string; description: string }): string =>
      node.description.trim() || `Summarize what the wiki says about ${node.name}.`;
    for (const root of await index.roots()) {
      if (root.kind === "category") {
        lines.push(`## ${root.name}`, promptFor(root), "");
        for (const child of await index.children(root.key)) {
          lines.push(`### ${child.name}`, promptFor(child), "");
        }
      } else {
        lines.push(`## ${root.name}`, promptFor(root), "");
      }
    }
    return lines.join("\n");
  }
}

/** Resolve the `WikiToc` adapter for a project. */
export function wikiTocOf(project: Project): WikiToc {
  return project.requireAdapter(WikiToc);
}
