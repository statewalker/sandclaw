import type { Project, Workspace } from "@statewalker/workspace.core";
import {
  type LlmApi,
  LlmProjectAdapter,
  type StageModelNames,
  type WikiConfigData,
  WikiLlmConfiguration,
  wikiConfigOf,
} from "../../src/index.js";

/** Build a stub per-project wiki config from loose options (test defaults). */
function stubConfig(opts: {
  models?: StageModelNames;
  embedModel?: string;
  dimensionality?: number;
  corpusPurpose?: string;
}): WikiConfigData {
  return {
    models: opts.models ?? { default: "stub-model" },
    embedModel: opts.embedModel ?? "fixture",
    dimensionality: opts.dimensionality ?? 2,
    corpusPurpose: opts.corpusPurpose,
  };
}

export interface StubLlmOptions {
  /** Stands in for structured generation — usually a `switch (spec.name)`. */
  generateObject: LlmApi["generateObject"];
  /** Single-text embedder fixture (also drives `embedBatch`). */
  embed?: (text: string) => Promise<Float32Array>;
  models?: StageModelNames;
  embedModel?: string;
  dimensionality?: number;
  corpusPurpose?: string;
}

/** Build a stub `LlmApi` from a `generateObject` fn + an optional embed fixture. */
export function makeStubLlm(opts: {
  generateObject: LlmApi["generateObject"];
  embed?: (text: string) => Promise<Float32Array>;
}): LlmApi {
  const embed = opts.embed ?? (async () => new Float32Array());
  return {
    generateObject: opts.generateObject,
    generateText: async () => ({ text: "", usage: { inputTokens: 0, outputTokens: 0 } }),
    streamText: async function* () {
      // stub stream emits nothing
    },
    embed: async (text) => embed(text),
    embedBatch: async (texts) => Promise.all(texts.map((t) => embed(t))),
  };
}

/**
 * Register the two model project adapters with stubs — the `LlmProjectAdapter`
 * (generic generation/embedding) and `WikiLlmConfiguration` (stage→model names) —
 * for tests that wire adapters manually instead of through `registerWiki`.
 */
export function registerStubLlm(repository: Workspace, opts: StubLlmOptions): LlmApi {
  const llm = makeStubLlm(opts);
  const config = stubConfig(opts);
  repository.adaptersRegistry.register("project", LlmProjectAdapter, () => llm);
  // Inject the config via `options.config` so the per-project adapter resolves it
  // synchronously without a file (mirrors how the app seeds defaults).
  repository.adaptersRegistry.register(
    "project",
    WikiLlmConfiguration,
    (project) => new WikiLlmConfiguration(project, { config }),
  );
  return llm;
}

/** Write a project's `.project/nature.wiki.json` (and cache it), for tests that go
 * through the real `registerWiki` (no injected config). */
export function seedWikiConfig(
  project: Project,
  opts: {
    models?: StageModelNames;
    embedModel?: string;
    dimensionality?: number;
    corpusPurpose?: string;
  } = {},
): Promise<void> {
  return wikiConfigOf(project).write(stubConfig(opts));
}
