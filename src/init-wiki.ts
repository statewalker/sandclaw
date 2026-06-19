import {
  agentSystemPromptSlot,
  agentToolsSlot,
} from "@statewalker/ai-agent-runtime";
import {
  AiConfig,
  createLiveProviderRegistry,
  formatModelReference,
  type LiveProviderRegistry,
} from "@statewalker/ai-config";
import { createDefaultRegistry } from "@statewalker/content-extractors";
import { Slots } from "@statewalker/shared-slots";
import {
  createWikiSiteTools,
  createWikiTools,
  registerWiki,
  registerWikiCommands,
  type WikiConfigData,
  type WikiNature,
  wikiNatureOf,
} from "@statewalker/wiki";
import {
  getWorkspace,
  type Logger,
  loggerOf,
} from "@statewalker/workspace.core";

/** Steering block contributed to the agent system prompt so the chat agent reaches
 * for the wiki tools first on project questions. */
const WIKI_STEERING = `## Project & wiki content
For questions about the user's projects, codebase, notes, or wiki content, call the \`wiki_search\` / \`wiki_ask\` tools BEFORE reading files, and cite the URIs they return.`;

/** Default embedding dimensionality when deriving a new wiki's config (the create-wiki
 * UI lets the user override it; OpenAI `text-embedding-3-*` and most defaults are 1536). */
const DEFAULT_EMBED_DIM = 1536;

/** How often each bound wiki is re-scanned, and how often new wikis are picked up.
 * The scan is content-hash-gated, so no-op ticks are cheap. */
const SCAN_INTERVAL_MS = 30_000;

/**
 * Derive a default per-project wiki config from AiConfig's active selection: the
 * active chat model drives every text stage. If the active connection has an
 * embedding-capable model, the first one becomes the embedder (hybrid vector search);
 * otherwise the wiki is **text-only** (full-text search, no vectors) — embeddings are
 * optional. References are `connectionId:modelId` URIs. Throws only when no active
 * chat model is selected. The create-wiki flow passes the result to
 * `WikiNature.initialize(config)`.
 */
export function deriveWikiConfig(aiConfig: AiConfig): WikiConfigData {
  const { connectionId, modelId } = aiConfig.getActive();
  if (!connectionId || !modelId) {
    throw new Error("deriveWikiConfig: no active AiConfig model is selected");
  }
  const config: WikiConfigData = {
    models: { default: formatModelReference(connectionId, modelId) },
  };
  const embedding = aiConfig.getModels(connectionId, "embedding")[0];
  if (embedding) {
    config.embedModel = formatModelReference(connectionId, embedding.id);
    config.dimensionality = DEFAULT_EMBED_DIM;
  }
  return config;
}

/**
 * Per-wiki polling scan loop: drive `scan().run()` to convergence, then wait the
 * interval and repeat. Chaining the next tick only after the previous run completes
 * inherently prevents overlapping runs. Returns a stop function.
 */
function startScanLoop(
  nature: WikiNature,
  name: string,
  isStopped: () => boolean,
  log: Logger,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async (): Promise<void> => {
    if (stopped || isStopped()) return;
    try {
      for await (const _ of nature.scan().run()) {
        if (stopped || isStopped()) return;
      }
    } catch (err) {
      log.error("scan failed", {
        project: name,
        error: err instanceof Error ? err.message : err,
      });
    }
    if (!stopped && !isStopped())
      timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Logic fragment: register the wiki on the app's `Workspace` (models from AiConfig,
 * no `process.env`), activate every top-level folder as a wiki on the opened workspace
 * with a polling re-scan, and expose the `wiki_search`/`wiki_ask` tools to the chat agent.
 * The AiConfig-backed provider registry rebuilds on config changes, so key/connection
 * edits take effect without re-registration.
 */
export default function initWiki(ctx: Record<string, unknown>): () => void {
  const workspace = getWorkspace(ctx);
  const aiConfig = workspace.requireAdapter(AiConfig);
  const slots = workspace.requireAdapter(Slots);
  const log = loggerOf(workspace, "wiki");

  let registry: LiveProviderRegistry | undefined;
  let ready = false;
  let disposed = false;
  const bound = new Set<string>();
  const disposers: Array<() => void> = [];
  const isStopped = () => disposed;

  /**
   * Activate every top-level folder as a wiki: enumerate the opened workspace and, for
   * each not-yet-bound project, materialize the wiki nature (a default config derived
   * from AiConfig) when it is absent, then start a polling scan loop. Dot-prefixed folders
   * (`.project`, `.settings`, …) are workspace/system state and are skipped. A folder that
   * cannot be activated yet — e.g. no active/embedding model is selected — is logged and
   * retried on the next pass; folders that are already wikis bind regardless.
   */
  const bindNewWikis = async (): Promise<void> => {
    if (disposed || !ready || !workspace.isOpened) {
      log.debug("activation skipped", {
        ready,
        opened: workspace.isOpened,
        disposed,
      });
      return;
    }
    const projects = await workspace.getProjects();
    log.debug("scanning top-level folders for activation", {
      count: projects.length,
      names: projects.map((p) => p.projectName),
    });
    for (const project of projects) {
      const name = project.projectName;
      if (bound.has(name) || name.startsWith(".")) continue;
      const nature = wikiNatureOf(project);
      try {
        if (await nature.exists()) {
          log.info("binding existing wiki", { project: name });
        } else {
          await nature.initialize(deriveWikiConfig(aiConfig));
          log.info("activated new wiki", { project: name });
        }
      } catch (err) {
        log.warn("not activating", {
          project: name,
          error: err instanceof Error ? err.message : err,
        });
        continue;
      }
      bound.add(name);
      disposers.push(startScanLoop(nature, name, isStopped, log));
    }
  };

  void (async () => {
    try {
      registry = await createLiveProviderRegistry(aiConfig);
    } catch (err) {
      log.error("provider registry failed — wikis will not activate", {
        error: err instanceof Error ? err.message : err,
      });
      return;
    }
    if (disposed) return;
    registerWiki(workspace, {
      provider: registry,
      extractors: createDefaultRegistry(),
    });
    disposers.push(slots.provide(agentToolsSlot, createWikiTools(workspace)));
    disposers.push(
      slots.provide(agentToolsSlot, createWikiSiteTools(workspace)),
    );
    // Expose search/ask as system commands and steer the agent toward the wiki tools.
    disposers.push(registerWikiCommands(workspace));
    disposers.push(slots.provide(agentSystemPromptSlot, WIKI_STEERING));
    ready = true;
    log.info("provider registry ready — activating wikis");
    await bindNewWikis();
  })();

  // Re-bind on workspace open and periodically, to pick up wikis created after boot.
  disposers.push(workspace.onLoad(() => void bindNewWikis()));
  const rebind = setInterval(() => void bindNewWikis(), SCAN_INTERVAL_MS);
  disposers.push(() => clearInterval(rebind));

  return () => {
    disposed = true;
    for (const dispose of disposers) {
      try {
        dispose();
      } catch (err) {
        log.error("dispose threw", {
          error: err instanceof Error ? err.message : err,
        });
      }
    }
    registry?.dispose();
  };
}
