import type { FilesApi } from "@statewalker/webrun-files";
import { NodeFilesApi } from "@statewalker/webrun-files-node";
import { registerWiki, resolveProvidersFromEnv } from "@statewalker/wiki.core";
import { type Project, Workspace } from "@statewalker/workspace.core";
import { dataRoot } from "./paths";

/**
 * Server-side bridge to the `@statewalker/wiki` adapter stack. A single
 * `Workspace` over a `NodeFilesApi` rooted at the data directory backs the whole
 * process; every project is reached through its `Project`/`Resource` adapters, so
 * the viewer reads only through adapters (no bespoke on-disk parsing). Node-only —
 * must never reach a client island.
 */
let workspaceSingleton: Workspace | undefined;

/**
 * LLM + embedding providers from the environment. Browsing (citations, topics,
 * reports) needs no provider — only a live query or search does — so a missing key
 * is deferred to the moment a provider is actually used rather than failing boot.
 * The fallback hands back a provider whose model resolution throws, so the error
 * surfaces at the first generate/embed call (query/search), not at boot.
 */
function providers(): ReturnType<typeof resolveProvidersFromEnv> {
  try {
    return resolveProvidersFromEnv(process.env);
  } catch {
    const unconfigured = (): never => {
      throw new Error(
        "wiki provider not configured — set OPENAI_API_KEY (or WIKI_PROVIDER=google + GOOGLE_GENERATIVE_AI_API_KEY)",
      );
    };
    return {
      provider: { languageModel: unconfigured, textEmbeddingModel: unconfigured },
      models: { default: "unconfigured" },
      embedModel: "unconfigured",
      dimensionality: 1536,
    };
  }
}

/** The process-wide wiki `Workspace`, lazily constructed and wired. */
export function workspace(): Workspace {
  if (!workspaceSingleton) {
    const ws = new Workspace().setFileSystem(new NodeFilesApi({ rootDir: dataRoot() }));
    const p = providers();
    registerWiki(ws, {
      provider: p.provider,
      models: p.models,
      embedModel: p.embedModel,
      dimensionality: p.dimensionality,
    });
    workspaceSingleton = ws;
  }
  return workspaceSingleton;
}

export function filesApi(): FilesApi {
  return workspace().files;
}

/** Open a project read-only (never creates). `null` when it doesn't exist. */
export function getProject(name: string): Promise<Project | null> {
  return workspace().getProject(name, false);
}
