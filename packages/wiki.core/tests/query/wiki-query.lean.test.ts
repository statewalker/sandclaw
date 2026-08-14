import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ProjectBuilder, type Resource, Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contentBuilder,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  docTopicEmbedderBuilder,
  type EmbedFn,
  type LlmApi,
  metaBuilder,
  type QueryMode,
  registerContentExtraction,
  registerKnowledgeAdapters,
  registerQuery,
  registerSearch,
  reorganizeBuilder,
  type SearchBlock,
  searchBuilder,
  summarizeBuilder,
  summaryLeaves,
  WikiPageSummary,
  WikiQuery,
} from "../../src/index.js";
import { stubHypothesize, stubScore } from "../util/abductive-stubs.js";
import { registerStubLlm } from "../util/stub-llm.js";

/**
 * Acceptance for the lean-first query path: a `lookup` query runs a single hybrid-search pass and a
 * cheap compose, escalating into the abductive loop only when the lean answer is insufficient, the
 * lean pool is empty, or the query is classified `synthesis`. Distinct model refs per tier let the
 * tests assert which tier composed (queryFast on the lean pass, queryStrong on the escalated final).
 */

const DIM = 2;
const embed: EmbedFn = async (text) => {
  const v = new Float32Array(DIM);
  if (text.toLowerCase().includes("acme")) v[0] = 1;
  if (text.toLowerCase().includes("found")) v[1] = 1;
  return v;
};

const SUMMARY: DocumentSummaryOutput = {
  title: "Acme",
  summary: "Acme and its founders.",
  sections: [
    { key: "intro", title: "Intro", startLine: 0, endLine: 0, summary: "Acme is a company." },
    { key: "founders", title: "Founders", startLine: 1, endLine: 1, summary: "Jane founded Acme." },
  ],
};
const META: DocumentMetaOutput = {
  topics: [
    {
      key: "company-founders",
      name: "Company founders",
      description: "People who found companies.",
      sectionKeys: ["founders"],
      brief: "Jane founded Acme.",
    },
  ],
  outliers: [],
};

const REF_RE = /ref="([^"]+)"/g;
const MODELS = {
  default: "m-default",
  queryFast: "m-fast",
  queryStrong: "m-strong",
  query: "m-query",
};

// Per-test controls + observations.
interface Intent {
  onCorpus: boolean;
  subjects: { prompt: string; ftsQueries?: string[] }[];
  queryKind?: "lookup" | "synthesis";
  offCorpusReason?: string;
}
let intent: Intent;
let queryMode: QueryMode | undefined;
/** Whether the lean (queryFast) compose judges its answer sufficient (false → escalation). */
let leanSufficient: boolean;
/** When set, the escalated (queryStrong) compose reports insufficient with this `missing` sentence. */
let fullMissing: string | null;
let calls: Record<string, number>;
/** The model ref each `compose-answer` call used, in order (queryFast = lean, queryStrong = full). */
let composeModels: string[];

const generateObject: LlmApi["generateObject"] = async (spec) => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const out = (o: unknown) => ({ output: o as never, usage });
  calls[spec.name] = (calls[spec.name] ?? 0) + 1;
  switch (spec.name) {
    case "summarize-document":
      return out(SUMMARY);
    case "extract-tables":
      return out({ tables: [] });
    case "extract-document-meta":
      return out(META);
    case "intent-detection":
      return out({ ...intent, constraints: [], language: "English" });
    case "hypothesize":
      return out(stubHypothesize(spec.input as Parameters<typeof stubHypothesize>[0]));
    case "score":
      return out(stubScore());
    case "topic-descent": {
      const nodes = (spec.input as { nodes: { key: string; children: { key: string }[] }[] }).nodes;
      return out({
        nodes: nodes.map((n) => ({
          key: n.key,
          relevance: 2,
          descendKeys: n.children.map((c) => c.key),
        })),
      });
    }
    case "outlier-select":
      return out({ topicKeys: [], outlierKeys: [] });
    case "rolling-summarize": {
      const sources = (spec.input as { request: string }).request;
      const refs = [...sources.matchAll(REF_RE)].map((m) => m[1]);
      return out({ summaries: refs.map((r) => ({ sectionRef: r, summary: "fact" })) });
    }
    case "compose-answer": {
      composeModels.push(spec.model);
      const claims = (
        spec.input as { facts: { statement: string; citations: string[] }[] }
      ).facts.map((m) => ({ statement: "fact", citations: m.citations }));
      // The lean (queryFast) compose's sufficiency is per-test. The escalated (queryStrong) compose is
      // sufficient by default (loop terminates), unless `fullMissing` forces an insufficient final answer.
      if (spec.model === MODELS.queryStrong && fullMissing) {
        return out({ claims, suggestions: [], sufficient: false, missing: fullMissing });
      }
      const sufficient = spec.model === MODELS.queryFast ? leanSufficient : true;
      return out({
        claims,
        suggestions: [],
        sufficient,
        missing: sufficient ? null : "more detail",
      });
    }
    default:
      throw new Error(`unexpected call ${spec.name}`);
  }
};

const blocks = async (resource: Resource): Promise<SearchBlock[]> => {
  const summary = await resource.getAdapter(WikiPageSummary)?.get();
  if (!summary) return [];
  return summaryLeaves(summary).map((s) => ({ blockId: s.key, text: `${s.title} ${s.summary}` }));
};

async function buildProject() {
  const filesApi = new MemFilesApi({
    initialFiles: { "proj/a.md": "Acme is a company.\nJane founded Acme." },
  });
  const repository = new Workspace().setFileSystem(filesApi);
  registerContentExtraction(repository);
  registerKnowledgeAdapters();
  registerStubLlm(repository, {
    generateObject,
    embed,
    embedModel: "fixture",
    dimensionality: DIM,
    models: MODELS,
    queryMode,
  });
  registerSearch(repository, {
    embed: async (_project, text) => embed(text),
    model: () => "fixture",
    dimensionality: () => DIM,
    blocks,
  });
  registerQuery(repository);

  const project = await repository.getProject("proj", true);
  if (!project) throw new Error("no project");
  const builder = project.requireAdapter(ProjectBuilder);
  builder.registerBuilder(contentBuilder());
  builder.registerBuilder(summarizeBuilder());
  builder.registerBuilder(metaBuilder());
  builder.registerBuilder(docTopicEmbedderBuilder());
  builder.registerBuilder(reorganizeBuilder());
  builder.registerBuilder(searchBuilder({ inputSignal: "summarized" }));
  for await (const _ of builder.run()) {
    // drain
  }
  return project;
}

describe("WikiQuery — lean-first path", () => {
  beforeEach(() => {
    intent = {
      onCorpus: true,
      subjects: [{ prompt: "Who founded Acme?", ftsQueries: ["Acme", "founded"] }],
      queryKind: "lookup",
    };
    queryMode = undefined; // default lean-first
    leanSufficient = true;
    fullMissing = null;
    calls = {};
    composeModels = [];
  });

  it("answers a lookup query in one lean pass: no hypothesize, no topic descent, cheap compose", async () => {
    const project = await buildProject();
    const progress = project.requireAdapter(WikiQuery).ask("Who founded Acme?");
    const answer = await progress.complete();

    expect(answer.citations.length).toBeGreaterThan(0);
    expect(calls.hypothesize).toBeUndefined();
    expect(calls["topic-descent"]).toBeUndefined();
    expect(composeModels).toEqual([MODELS.queryFast]); // a single, cheap-tier compose
    expect(progress.stages.map((s) => s.name)).toContain("lean-retrieve");
    // Observability: predicted kind recorded, and the lean pass did NOT escalate.
    expect(progress.queryKind).toBe("lookup");
    expect(progress.escalated).toBe(false);
  });

  it("escalates into the abductive loop when the lean answer is insufficient, composing once more on the strong tier", async () => {
    // The lean (queryFast) compose returns insufficient → escalate; the strong compose terminates.
    leanSufficient = false;
    const project = await buildProject();
    const progress = project.requireAdapter(WikiQuery).ask("Who founded Acme?");
    await progress.complete();

    expect(calls.hypothesize).toBeGreaterThanOrEqual(1);
    // Lean compose (cheap) then escalated final compose (strong) — never the strong tier twice.
    expect(composeModels).toEqual([MODELS.queryFast, MODELS.queryStrong]);
    expect(progress.escalated).toBe(true); // observability: predicted-vs-actual
  });

  it("leads the answer with the explicit insufficiency statement when the evidence does not answer", async () => {
    // Force the final compose to report insufficient with a user-facing `missing` sentence.
    leanSufficient = false;
    fullMissing = "Les documents ne précisent pas la dette de la société.";
    const project = await buildProject();
    const answer = await project.requireAdapter(WikiQuery).ask("Quelle est la dette ?").complete();

    // The insufficiency sentence is the FIRST line of the answer (not a trailing caveat).
    expect(answer.text.startsWith(fullMissing)).toBe(true);
  });

  it("short-circuits an empty lean pool straight to the abductive loop without a lean compose", async () => {
    // A subject whose terms are absent from the corpus → hybrid search finds nothing on the lean pass.
    intent = {
      onCorpus: true,
      subjects: [{ prompt: "unrelated xyzzy", ftsQueries: ["xyzzy"] }],
      queryKind: "lookup",
    };
    const project = await buildProject();
    await project.requireAdapter(WikiQuery).ask("unrelated xyzzy").complete();

    expect(calls.hypothesize).toBeGreaterThanOrEqual(1); // escalated
    // No lean compose happened — only the strong-tier escalated compose (topic descent found evidence).
    expect(composeModels).toEqual([MODELS.queryStrong]);
  });

  it("fast-forwards a synthesis query straight to the abductive loop, skipping the lean path", async () => {
    intent = {
      onCorpus: true,
      subjects: [{ prompt: "Who founded Acme?", ftsQueries: ["Acme"] }],
      queryKind: "synthesis",
    };
    const project = await buildProject();
    const progress = project
      .requireAdapter(WikiQuery)
      .ask("Compare the founders of Acme and Globex");
    await progress.complete();

    expect(calls.hypothesize).toBeGreaterThanOrEqual(1);
    expect(composeModels).toEqual([MODELS.queryStrong]); // no lean compose
    expect(progress.stages.map((s) => s.name)).not.toContain("lean-retrieve");
  });

  it("under full-only, a lookup query still runs the abductive loop (no lean path)", async () => {
    queryMode = "full-only";
    const project = await buildProject();
    const progress = project.requireAdapter(WikiQuery).ask("Who founded Acme?");
    await progress.complete();

    expect(calls.hypothesize).toBeGreaterThanOrEqual(1);
    expect(composeModels).toEqual([MODELS.queryStrong]);
    expect(progress.stages.map((s) => s.name)).not.toContain("lean-retrieve");
  });
});
