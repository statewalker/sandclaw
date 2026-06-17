import { agentToolsSlot } from "@statewalker/ai-agent-runtime";
import {
  AiConfig,
  createLiveProviderRegistry,
  formatModelReference,
  type LiveProviderRegistry,
} from "@statewalker/ai-config";
import { createDefaultRegistry } from "@statewalker/content-extractors";
import { Slots } from "@statewalker/shared-slots";
import {
  createWikiTools,
  registerWiki,
  type WikiConfigData,
  type WikiNature,
  wikiNatureOf,
} from "@statewalker/wiki";
import { getWorkspace } from "@statewalker/workspace.core";

/** Default embedding dimensionality when deriving a new wiki's config (the create-wiki
 * UI lets the user override it; OpenAI `text-embedding-3-*` and most defaults are 1536). */
const DEFAULT_EMBED_DIM = 1536;

/** How often each bound wiki is re-scanned, and how often new wikis are picked up.
 * The scan is content-hash-gated, so no-op ticks are cheap. */
const SCAN_INTERVAL_MS = 30_000;

/**
 * Derive a default per-project wiki config from AiConfig's active selection: the
 * active chat model drives every text stage, and the first embedding-capable model on
 * the same connection is the embedder. References are `connectionId:modelId` URIs.
 * The create-wiki flow passes the result to `WikiNature.initialize(config)`.
 */
export function deriveWikiConfig(aiConfig: AiConfig): WikiConfigData {
  const { connectionId, modelId } = aiConfig.getActive();
  if (!connectionId || !modelId) {
    throw new Error("deriveWikiConfig: no active AiConfig model is selected");
  }
  const embedding = aiConfig.getModels(connectionId, "embedding")[0];
  if (!embedding) {
    throw new Error(
      `deriveWikiConfig: connection "${connectionId}" has no embedding-capable model`,
    );
  }
  return {
    models: { default: formatModelReference(connectionId, modelId) },
    embedModel: formatModelReference(connectionId, embedding.id),
    dimensionality: DEFAULT_EMBED_DIM,
  };
}

/**
 * Per-wiki polling scan loop: drive `scan().run()` to convergence, then wait the
 * interval and repeat. Chaining the next tick only after the previous run completes
 * inherently prevents overlapping runs. Returns a stop function.
 */
function startScanLoop(nature: WikiNature, name: string, isStopped: () => boolean): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async (): Promise<void> => {
    if (stopped || isStopped()) return;
    try {
      for await (const _ of nature.scan().run()) {
        if (stopped || isStopped()) return;
      }
    } catch (err) {
      console.error(`[wiki] scan failed for "${name}":`, err);
    }
    if (!stopped && !isStopped()) timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * Logic fragment: register the wiki on the app's `Workspace` (models from AiConfig,
 * no `process.env`), bind every wiki-nature project on the opened workspace with a
 * polling re-scan, and expose the `wiki_search`/`wiki_ask` tools to the chat agent.
 * The AiConfig-backed provider registry rebuilds on config changes, so key/connection
 * edits take effect without re-registration.
 */
export default function initWiki(ctx: Record<string, unknown>): () => void {
  const workspace = getWorkspace(ctx);
  const aiConfig = workspace.requireAdapter(AiConfig);
  const slots = workspace.requireAdapter(Slots);

  let registry: LiveProviderRegistry | undefined;
  let ready = false;
  let disposed = false;
  const bound = new Set<string>();
  const disposers: Array<() => void> = [];
  const isStopped = () => disposed;

  /** Enumerate the opened workspace and start a scan loop for each not-yet-bound wiki. */
  const bindNewWikis = async (): Promise<void> => {
    if (disposed || !ready || !workspace.isOpened) return;
    for (const project of await workspace.getProjects()) {
      const name = project.projectName;
      if (bound.has(name)) continue;
      const nature = wikiNatureOf(project);
      if (!(await nature.exists())) continue;
      bound.add(name);
      disposers.push(startScanLoop(nature, name, isStopped));
    }
  };

  void (async () => {
    registry = await createLiveProviderRegistry(aiConfig);
    if (disposed) return;
    registerWiki(workspace, { provider: registry, extractors: createDefaultRegistry() });
    disposers.push(slots.provide(agentToolsSlot, createWikiTools(workspace)));
    ready = true;
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
        console.error("[wiki] dispose threw:", err);
      }
    }
    registry?.dispose();
  };
}
