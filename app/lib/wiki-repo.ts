import {
  registerWiki,
  resolveProvidersFromEnv,
} from "@statewalker/resources-wiki";
import {
  type Project,
  ResourceRepository,
  Workspace,
} from "@statewalker/resources-workspace";
import type { FilesApi } from "@statewalker/webrun-files";
import { NodeFilesApi } from "@statewalker/webrun-files-node";
import { dataRoot } from "./paths";

/**
 * Server-side bridge to the `@statewalker/resources-wiki` adapter stack. A single
 * `ResourceRepository` over a `NodeFilesApi` rooted at the data directory backs the
 * whole process; every project is reached through its `Workspace`/`Project` adapters,
 * so the viewer reads only through adapters (no bespoke on-disk parsing). Node-only —
 * must never reach a client island.
 */
let repoSingleton: ResourceRepository | undefined;

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

export function repository(): ResourceRepository {
  if (!repoSingleton) {
    const repo = new ResourceRepository({
      filesApi: new NodeFilesApi({ rootDir: dataRoot() }),
    });
    const p = providers();
    registerWiki(repo, {
      provider: p.provider,
      models: p.models,
      embedModel: p.embedModel,
      dimensionality: p.dimensionality,
    });
    repoSingleton = repo;
  }
  return repoSingleton;
}

export function filesApi(): FilesApi {
  return repository().filesApi;
}

export function workspace(): Workspace {
  return repository().requireAdapter<Workspace>(Workspace);
}

/** Open a project read-only (never creates). `null` when it doesn't exist. */
export function getProject(name: string): Promise<Project | null> {
  return workspace().getProject(name, false);
}
