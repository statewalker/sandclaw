import { Commands } from "@statewalker/shared-commands";
import { joinPath as concatPath } from "@statewalker/webrun-files";
import type { Project, Workspace } from "@statewalker/workspace.core";
import { type ToolSet, tool } from "ai";
import { z } from "zod";
import { wikiNatureOf } from "../runtime/wiki-nature.js";
import { OpenWikiSiteCommand } from "./site-commands.js";
import { SITES_DIR, wikiSiteOf } from "./wiki-site.js";
import { wikiTocOf } from "./wiki-toc.js";

/** Resolve a bound wiki project by name, or throw with a clear message. */
async function resolveWiki(workspace: Workspace, name: string): Promise<Project> {
  const project = await workspace.getProject(name, false);
  if (!project) throw new Error(`No project named "${name}".`);
  if (!(await wikiNatureOf(project).exists())) throw new Error(`"${name}" is not a wiki.`);
  return project;
}

/**
 * Chat-agent tools for authoring a thematic table of contents and generating a
 * site from it, contributed to the `agent:tools` slot. React-free logic. The TOC
 * is authored through dialog (`suggest_toc` → edit → `save_toc`); `generate_site`
 * produces the markdown site and returns a `file://` link to its entry page.
 */
export function createWikiSiteTools(workspace: Workspace): ToolSet {
  return {
    suggest_toc: tool({
      description:
        "Draft a starter table-of-contents markdown for a wiki, derived from its topics. " +
        "Returns markdown the user can edit before saving with save_toc.",
      inputSchema: z.object({
        wiki: z.string().describe("Name of the wiki project."),
      }),
      outputSchema: z.object({ markdown: z.string().optional(), error: z.string().optional() }),
      execute: async ({ wiki }) => {
        const result: { markdown?: string; error?: string } = {};
        try {
          result.markdown = await wikiTocOf(await resolveWiki(workspace, wiki)).suggest();
        } catch (err) {
          result.error = err instanceof Error ? err.message : String(err);
        }
        return result;
      },
    }),

    save_toc: tool({
      description:
        "Save a table-of-contents markdown file for a wiki at tocs/<slug>.md. " +
        "Use ## headings for pages (with a one-line prompt under each), ### for sub-pages.",
      inputSchema: z.object({
        wiki: z.string().describe("Name of the wiki project."),
        slug: z.string().describe("TOC slug (file name without extension)."),
        markdown: z.string().describe("The TOC markdown to save."),
      }),
      outputSchema: z.object({ path: z.string().optional(), error: z.string().optional() }),
      execute: async ({ wiki, slug, markdown }) => {
        const result: { path?: string; error?: string } = {};
        try {
          result.path = await wikiTocOf(await resolveWiki(workspace, wiki)).write(slug, markdown);
        } catch (err) {
          result.error = err instanceof Error ? err.message : String(err);
        }
        return result;
      },
    }),

    generate_site: tool({
      description:
        "Generate (or incrementally update) a thematic markdown site from a saved TOC. " +
        "Each prompted entry becomes a grounded, cited page. Returns a file:// link to the " +
        "site's index page. Pass force to regenerate unchanged pages.",
      inputSchema: z.object({
        wiki: z.string().describe("Name of the wiki project."),
        tocSlug: z.string().describe("Slug of the saved TOC to generate from."),
        force: z.boolean().optional().describe("Regenerate even unchanged pages."),
      }),
      outputSchema: z.object({
        indexUri: z.string().optional(),
        written: z.number().optional(),
        skipped: z.number().optional(),
        pruned: z.number().optional(),
        failed: z.number().optional(),
        failures: z.array(z.object({ id: z.string(), error: z.string().optional() })).optional(),
        error: z.string().optional(),
      }),
      execute: async ({ wiki, tocSlug, force }) => {
        const result: {
          indexUri?: string;
          written?: number;
          skipped?: number;
          pruned?: number;
          failed?: number;
          failures?: { id: string; error?: string }[];
          error?: string;
        } = { written: 0, skipped: 0, pruned: 0, failed: 0, failures: [] };
        let project: Project;
        try {
          project = await resolveWiki(workspace, wiki);
        } catch (err) {
          result.error = err instanceof Error ? err.message : String(err);
          return result;
        }
        try {
          for await (const p of wikiSiteOf(project).generate(tocSlug, { force })) {
            if (p.status === "written") result.written = (result.written ?? 0) + 1;
            else if (p.status === "skipped") result.skipped = (result.skipped ?? 0) + 1;
            else if (p.status === "pruned") result.pruned = (result.pruned ?? 0) + 1;
            else if (p.status === "failed") {
              result.failed = (result.failed ?? 0) + 1;
              result.failures?.push({ id: p.id, error: p.error });
            }
          }
        } catch (err) {
          result.error = err instanceof Error ? err.message : String(err);
          return result;
        }
        result.indexUri = `file://${concatPath(project.path, SITES_DIR, tocSlug, "index.md")}`;
        // Best-effort: open the freshly generated site in the renderer panel. The
        // handler lives in `@statewalker/wiki.view.react`; unhandled in headless/CLI.
        try {
          void workspace
            .requireAdapter(Commands)
            .call(OpenWikiSiteCommand, { project: wiki, slug: tocSlug })
            .promise.catch(() => {});
        } catch {
          /* no Commands adapter — ignore */
        }
        return result;
      },
    }),
  };
}
