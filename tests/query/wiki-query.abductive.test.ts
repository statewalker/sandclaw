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
import { registerStubLlm } from "../util/stub-llm.js";

/**
 * Acceptance regression for the abductive hypothesis-driven retrieval loop, reconstructing the
 * naive-agent-vs-FSM probe (D12). The hard question carries three constraints — entity E ("Acme"),
 * an analytic predicate ("most costly"), and a scope token H ("within the first year").
 *
 * Corpus genres:
 *  - TRANSCRIPT  `transcripts/call.md`  — full-coverage answer: raw text holds E + predicate + H.
 *  - FORMAL-REPORT `reports/q*.md`      — a vivid near-miss: raw holds E + predicate but NOT H.
 *
 * The near-miss is engineered to rank HIGHER in mechanical search (the entity is repeated and the
 * predicate words are dense), so a linear top-ranked pipeline would surface it. The loop's coverage
 * gate must instead find and cite the transcript (which alone covers H), and reject the near-miss.
 */

const DIM = 2;
const embed: EmbedFn = async (text) => {
  const v = new Float32Array(DIM);
  if (text.toLowerCase().includes("acme")) v[0] = 1;
  if (text.toLowerCase().includes("cost")) v[1] = 1;
  return v;
};

// Each document is a single section spanning its whole raw body; the gate reads that raw.
const TRANSCRIPT_URI = "/transcripts/call.md";
const REPORT_URIS = ["/reports/q1.md", "/reports/q2.md"];

// Whether the scope token H appears in the transcript raw — toggled per scenario.
let transcriptHasScope: boolean;

/** Build a one-section summary for a document; the summary text seeds FTS retrieval. */
function summaryFor(uri: string): DocumentSummaryOutput {
  const isTranscript = uri.endsWith("call.md");
  return {
    title: isTranscript ? "Acme earnings call transcript" : "Acme formal report",
    summary: "Acme cost analysis.",
    sections: [
      {
        key: "body",
        title: isTranscript ? "Call body" : "Report body",
        startLine: 0,
        endLine: 0,
        // The summary deliberately OMITS the scope token (an LLM summary filter would drop the
        // answer); the gate reads the raw line, not this summary.
        summary: "Acme cost discussion.",
      },
    ],
  };
}

const META: DocumentMetaOutput = { topics: [], outliers: [] };

const REF_RE = /ref="([^"]+)"/g;

let calls: Record<string, number>;
/** Captured `unmetConstraints` passed into the compose stage (drives the caveat assertion). */
let composeUnmet: string[];

const generateObject: LlmApi["generateObject"] = async (spec) => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const out = (o: unknown) => ({ output: o as never, usage });
  calls[spec.name] = (calls[spec.name] ?? 0) + 1;
  switch (spec.name) {
    case "summarize-document":
      return out(summaryFor((spec.input as { uri: string }).uri));
    case "extract-tables":
      return out({ tables: [] });
    case "extract-document-meta":
      return out(META);
    case "intent-detection":
      // The hard question's three constraints: entity (gated), scope/horizon (gated), predicate
      // (advisory). The scope tokens cover the literal phrase and its tokens.
      return out({
        onCorpus: true,
        subjects: [{ prompt: "What is Acme's most costly item within the first year?" }],
        constraints: [
          { kind: "entity", tokens: ["Acme"], text: "" },
          { kind: "scope", tokens: ["within the first year", "first year"], text: "" },
          { kind: "predicate", tokens: [], text: "the most costly item" },
        ],
        language: "English",
      });
    case "hypothesize": {
      const input = spec.input as { consumedRivals: string[] };
      // Advance the rival on re-entry so a contradicted hypothesis does not repeat.
      const n = input.consumedRivals.length;
      return out({
        claim: `Candidate answer ${n + 1}: Acme's most costly first-year item`,
        ftsQueries: ["Acme", "cost", "costly"],
        semanticQuery: "Acme's most costly item within the first year is the data centre buildout.",
        synonyms: [],
      });
    }
    case "topic-descent": {
      const nodes = (spec.input as { nodes: { key: string; children: { key: string }[] }[] }).nodes;
      return out({ nodes: nodes.map((n) => ({ key: n.key, relevance: 0, descendKeys: [] })) });
    }
    case "outlier-select":
      return out({ topicKeys: [], outlierKeys: [] });
    case "score":
      // Only reached when coverage is incomplete; the candidate stays plausible → widen search.
      return out({ failureMode: "narrow" });
    case "rolling-summarize": {
      const sources = (spec.input as { request: string }).request;
      const refs = [...sources.matchAll(REF_RE)].map((m) => m[1]);
      return out({ summaries: refs.map((r) => ({ sectionRef: r, summary: `summary of ${r}` })) });
    }
    case "compose-answer": {
      composeUnmet = (spec.input as { unmetConstraints: string[] }).unmetConstraints;
      const claims = (
        spec.input as { facts: { statement: string; citations: string[] }[] }
      ).facts.map((m) => ({ statement: m.statement, citations: m.citations }));
      return out({ claims, suggestions: [], sufficient: true, missing: null });
    }
    default:
      throw new Error(`unexpected call ${spec.name}`);
  }
};

/** Index each section's title + summary for FTS. The reports repeat "Acme cost" to outrank the
 * transcript on a naive top-ranked retrieval (the near-miss is the "vivid" hit). */
const blocks = async (resource: Resource): Promise<SearchBlock[]> => {
  const summary = await resource.getAdapter(WikiPageSummary)?.get();
  if (!summary) return [];
  return summaryLeaves(summary).map((s) => ({ blockId: s.key, text: `${s.title} ${s.summary}` }));
};

async function buildProject() {
  // Reports densely repeat E + predicate (vivid near-miss) but never the scope token H. The
  // transcript carries H ("within the first year") in its raw body — only when `transcriptHasScope`.
  const transcriptRaw = transcriptHasScope
    ? "Acme says the data centre buildout is the most costly item within the first year."
    : "Acme says the data centre buildout is the most costly item overall.";
  const filesApi = new MemFilesApi({
    initialFiles: {
      [`proj${TRANSCRIPT_URI}`]: transcriptRaw,
      [`proj${REPORT_URIS[0]}`]: "Acme cost: Acme's most costly cost item is marketing cost.",
      [`proj${REPORT_URIS[1]}`]: "Acme cost report: Acme's costly cost line items by cost.",
    },
  });
  const repository = new Workspace().setFileSystem(filesApi);
  registerContentExtraction(repository);
  registerKnowledgeAdapters();
  registerStubLlm(repository, {
    generateObject,
    embed,
    embedModel: "fixture",
    dimensionality: DIM,
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

const QUESTION = "What is Acme's most costly item within the first year?";

describe("WikiQuery — abductive hypothesis-driven loop (probe regression)", () => {
  beforeEach(() => {
    calls = {};
    composeUnmet = [];
    transcriptHasScope = true;
  });

  it("retrieves and cites the full-coverage transcript answer the linear pipeline would drop", async () => {
    const project = await buildProject();
    const answer = await project.requireAdapter(WikiQuery).ask(QUESTION).complete();

    // (a) The loop cites the transcript section — the only one whose raw covers BOTH the entity and
    // the scope token. (A linear top-ranked pipeline would surface a denser formal report instead.)
    const citedUris = new Set(answer.citations.map((c) => c.split("#")[0]));
    expect(citedUris.has(TRANSCRIPT_URI)).toBe(true);

    // The full-coverage path emits no unmet-constraint caveat.
    expect(composeUnmet).toEqual([]);
    expect(answer.caveats.join(" ")).not.toMatch(/no retrieved evidence satisfied/i);
  });

  it("pools the formal-report near-miss but does not let it win on the unmet scope", async () => {
    const project = await buildProject();
    const progress = project.requireAdapter(WikiQuery).ask(QUESTION);
    const answer = await progress.complete();

    // (b) The near-miss reports ARE retrieved into the evidence pool (they cover the entity)...
    // (evidence `uri` is project-relative without a leading slash; citations are canonical).
    const evidenceUris = new Set(progress.evidence.map((e) => `/${e.uri}`));
    expect(REPORT_URIS.some((u) => evidenceUris.has(u))).toBe(true);
    // ...but the answer's coverage rests on the transcript, which alone satisfies the scope token.
    const citedUris = new Set(answer.citations.map((c) => c.split("#")[0]));
    expect(citedUris.has(TRANSCRIPT_URI)).toBe(true);
  });

  it("degrades to a best-partial answer naming the unmet scope when H is absent everywhere", async () => {
    transcriptHasScope = false; // no document carries the scope token anywhere
    const project = await buildProject();
    const answer = await project.requireAdapter(WikiQuery).ask(QUESTION).complete();

    // (c) The exhausted-over-non-empty-pool path composes a grounded best-partial answer with an
    // explicit caveat naming the unmet scope constraint.
    expect(composeUnmet).toContain("within the first year / first year");
    expect(answer.caveats.join(" ")).toMatch(/within the first year/i);
    // Still grounded — real citations, not a bare negative response.
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.evidenceCount).toBeGreaterThan(0);
  });

  it("keeps iteration count within the budget bound", async () => {
    transcriptHasScope = false; // force the loop to iterate to exhaustion
    const project = await buildProject();
    await project.requireAdapter(WikiQuery).ask(QUESTION).complete();

    // (d) Abductive-always runs hypothesize at least once; the bounded loop never exceeds the
    // small iteration budget (4) — the doom-loop guard halts as soon as no new section appears.
    expect(calls.hypothesize).toBeGreaterThanOrEqual(1);
    expect(calls.hypothesize).toBeLessThanOrEqual(4);
    // The loop did iterate: the `narrow` widen path drove at least one advisory `score` call,
    // and the doom-loop guard kept the total scoring rounds within the budget.
    expect(calls.score).toBeGreaterThanOrEqual(1);
    expect(calls.score).toBeLessThanOrEqual(4);
  });
});
