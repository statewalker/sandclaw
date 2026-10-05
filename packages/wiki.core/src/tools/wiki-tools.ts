import type { Workspace } from "@statewalker/workspace.core";
import { type ToolSet, tool } from "ai";
import { z } from "zod";
import { wikiAsk, wikiSearch } from "./wiki-ops.js";

const MASK_HELP =
  "Optional path masks `<project-glob>/<relpath-glob>` (project glob `*` + inner glob " +
  "`docs` targets every wiki's `docs/` subtree). A mask with no `/` matches wiki names " +
  "only. Omit to target all bound wikis. The bound wiki names are returned as `availableWikis`.";

/** Prefix asserting these tools are the preferred first stop for project/wiki questions. */
const PREFER_FIRST =
  "Use this FIRST for any question about the user's projects, codebase, notes, or wiki " +
  "content — before reading files — and cite the returned URIs. ";

/**
 * The workspace-level wiki chat tools, contributed to the `agent:tools` slot:
 * `wiki_search` (cross-wiki retrieval, project-qualified URIs) and `wiki_ask`
 * (per-wiki grounded answers). Thin wrappers over the shared `wikiSearch`/`wikiAsk`
 * core (also used by the `wiki:search`/`wiki:ask` commands). Both honour
 * `<project-glob>/<relpath-glob>` path masks. React-free logic.
 */
export function createWikiTools(workspace: Workspace): ToolSet {
  return {
    wiki_search: tool({
      description:
        `${PREFER_FIRST}Search the bound wikis' indexed pages (hybrid full-text + vector) and ` +
        `return aggregated section matches, each URI prefixed with its wiki. ${MASK_HELP}`,
      inputSchema: z.object({
        query: z.string().describe("The search query."),
        paths: z.array(z.string()).optional().describe("Path masks scoping the search."),
      }),
      outputSchema: z.object({
        availableWikis: z.array(z.string()),
        matches: z.array(
          z.object({
            uri: z.string().describe("`<project>/<relpath>` of the matching page."),
            section: z.string(),
            score: z.number(),
            snippet: z.string().optional(),
          }),
        ),
      }),
      execute: ({ query, paths }) => wikiSearch(workspace, { query, paths }),
    }),

    wiki_ask: tool({
      description:
        `${PREFER_FIRST}Ask each matching bound wiki a question and return per-wiki grounded, ` +
        `cited answers (tagged by project). ${MASK_HELP}`,
      inputSchema: z.object({
        question: z.string().describe("The question to answer from the wikis."),
        paths: z.array(z.string()).optional().describe("Path masks scoping retrieval."),
      }),
      outputSchema: z.object({
        availableWikis: z.array(z.string()),
        answers: z.array(
          z.object({
            project: z.string(),
            text: z.string(),
            citations: z.array(z.string()),
            evidenceCount: z.number(),
          }),
        ),
      }),
      execute: ({ question, paths }) => wikiAsk(workspace, { question, paths }),
    }),
  };
}
