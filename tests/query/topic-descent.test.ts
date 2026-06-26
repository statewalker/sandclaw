import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { type Project, ProjectBuilder, Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contentBuilder,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  type LlmApi,
  LlmProjectAdapter,
  metaBuilder,
  QueryProgress,
  registerContentExtraction,
  registerKnowledgeAdapters,
  registerQuery,
  SearchAdapter,
  summarizeBuilder,
  type TopicIndex,
  type TopicNode,
  type WikiConfigData,
  WikiLlmConfiguration,
  WikiQuery,
  WikiTopicIndex,
  WikiTopicNodeEmbeddings,
  wikiConfigOf,
} from "../../src/index.js";
import { topicDescent } from "../../src/query/fsm/topic-descent.js";
import { makeStubLlm } from "../util/stub-llm.js";

/** `query/fsm/topic-descent.ts` `DESCENT_BATCH` — kept in sync with the source. */
const DESCENT_BATCH = 16;
const DIM = 2;

// One real document, two sections; meta declares topics keyed by section.
const SUMMARY: DocumentSummaryOutput = {
  title: "Acme",
  summary: "Acme and its founders.",
  sections: [
    {
      key: "intro",
      title: "Intro",
      startLine: 0,
      endLine: 0,
      summary: "Acme is a company.",
    },
    {
      key: "founders",
      title: "Founders",
      startLine: 1,
      endLine: 1,
      summary: "Jane founded Acme.",
    },
  ],
};
const FOUNDERS_TOPIC = {
  key: "company-founders",
  name: "Company founders",
  description: "People who found companies.",
  sectionKeys: ["founders"],
  brief: "Jane founded Acme.",
};
const INTRO_TOPIC = {
  key: "acme-intro",
  name: "Acme overview",
  description: "What Acme is.",
  sectionKeys: ["intro"],
  brief: "Acme is a company.",
};
const META_ONE_TOPIC: DocumentMetaOutput = { topics: [FOUNDERS_TOPIC], outliers: [] };
const META_TWO_TOPICS: DocumentMetaOutput = {
  topics: [FOUNDERS_TOPIC, INTRO_TOPIC],
  outliers: [],
};

const REF_RE = /ref="([^"]+)"/g;

// Per-test controls + observations.
let meta: DocumentMetaOutput;
/** Node keys passed to each `topic-descent` call (call → keys). */
let descentCalls: string[][];
/** Override a node's relevance score (default: 2 = relevant). */
let descentScore: ((key: string) => number) | undefined;
/** When set, the descent stub throws if a single call exceeds this node count. */
let maxBatch: number | undefined;
/** Compose reports "sufficient" only after this many compose calls (0 = always). */
let sufficientAfter: number;
/** The `availableTopics` keys passed to the last intent-detection call. */
let intentTopicKeys: string[];

const generateObject: LlmApi["generateObject"] = async (spec) => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const out = (o: unknown) => ({ output: o as never, usage });
  switch (spec.name) {
    case "summarize-document":
      return out(SUMMARY);
    case "aggregate-chapters":
      return out({
        chapters: [
          {
            title: "All",
            summary: "All members.",
            memberCount: (spec.input as { members: unknown[] }).members.length,
          },
        ],
      });
    case "extract-tables":
      return out({ tables: [] });
    case "extract-document-meta":
      return out(meta);
    case "intent-detection": {
      intentTopicKeys = (spec.input as { availableTopics: { key: string }[] }).availableTopics.map(
        (t) => t.key,
      );
      return out({ onCorpus: true, subjects: [{ prompt: "founders" }] });
    }
    case "topic-descent": {
      const nodes = (spec.input as { nodes: { key: string; children: { key: string }[] }[] }).nodes;
      if (maxBatch && nodes.length > maxBatch) throw new Error("context_length_exceeded");
      descentCalls.push(nodes.map((n) => n.key));
      return out({
        nodes: nodes.map((n) => {
          const rel = descentScore ? descentScore(n.key) : 2;
          return {
            key: n.key,
            relevance: rel,
            descendKeys: rel > 0 ? n.children.map((c) => c.key) : [],
          };
        }),
      });
    }
    case "outlier-select":
      return out({ topicKeys: [], outlierKeys: [] });
    case "section-select": {
      const docs = (spec.input as { documents: { sections: { uri: string }[] }[] }).documents;
      return out({ relevantUris: docs.flatMap((d) => d.sections.map((s) => s.uri)) });
    }
    case "rolling-summarize": {
      const sources = (spec.input as { request: string }).request;
      const refs = [...sources.matchAll(REF_RE)].map((m) => m[1]);
      return out({ summaries: refs.map((r) => ({ sectionRef: r, summary: "fact" })) });
    }
    case "compose-answer": {
      const claims = (
        spec.input as { facts: { statement: string; citations: string[] }[] }
      ).facts.map((m) => ({
        statement: "fact",
        citations: m.citations,
      }));
      const sufficient = sufficientAfter === 0;
      return out({ claims, suggestions: [], sufficient, missing: sufficient ? null : "more" });
    }
    default:
      throw new Error(`unexpected call ${spec.name}`);
  }
};

/** Subject embedding fixture: "far" → [0,1]; everything else → [1,0]. */
const embed = async (text: string): Promise<Float32Array> => {
  const v = new Float32Array(DIM);
  if (text.toLowerCase().includes("far")) v[1] = 1;
  else v[0] = 1;
  return v;
};

/** A fixed hybrid-search result, or no search adapter at all when omitted. */
type SearchStub = {
  search: () => Promise<
    { uri: string; sections: { sectionKey: string; modes: ("fts" | "vector")[] }[] }[]
  >;
};

/** Build a project with one real document (content → summarize → meta only). */
async function buildBase(config: WikiConfigData, searchStub?: SearchStub): Promise<Project> {
  const filesApi = new MemFilesApi({
    initialFiles: { "proj/a.md": "Acme is a company.\nJane founded Acme." },
  });
  const repo = new Workspace().setFileSystem(filesApi);
  registerContentExtraction(repo);
  registerKnowledgeAdapters();
  registerQuery(repo);
  const llm = makeStubLlm({ generateObject, embed });
  repo.adaptersRegistry.register("project", LlmProjectAdapter, () => llm);
  repo.adaptersRegistry.register(
    "project",
    WikiLlmConfiguration,
    (project) => new WikiLlmConfiguration(project, { config }),
  );
  if (searchStub) {
    repo.adaptersRegistry.register(
      "project",
      SearchAdapter,
      () => searchStub as unknown as SearchAdapter,
    );
  }

  const project = await repo.getProject("proj", true);
  if (!project) throw new Error("no project");
  const builder = project.requireAdapter(ProjectBuilder);
  builder.registerBuilder(contentBuilder());
  builder.registerBuilder(summarizeBuilder());
  builder.registerBuilder(metaBuilder());
  for await (const _ of builder.run()) {
    // drain
  }
  return project;
}

const EMBED_CONFIG: WikiConfigData = {
  models: { default: "stub-model" },
  embedModel: "fixture",
  dimensionality: DIM,
};
const TEXT_ONLY_CONFIG: WikiConfigData = { models: { default: "stub-model" } };

/** A leaf node referencing the document's `company-founders` topic (→ section `founders`). */
function leaf(key: string): TopicNode {
  return {
    kind: "topic",
    key,
    name: key,
    description: "",
    references: [{ uri: "a.md#company-founders" }],
  };
}
function category(key: string, childKeys: string[]): TopicNode {
  return { kind: "category", key, name: key, description: "", childKeys };
}

async function run(
  project: Project,
  subject: string,
): Promise<{ uri: string; sectionKey: string }[]> {
  const llm = project.requireAdapter(LlmProjectAdapter) as unknown as LlmApi;
  return topicDescent(project, llm, wikiConfigOf(project), new QueryProgress(), subject, new Map());
}

describe("topicDescent — embedding-seeded scored DAG descent", () => {
  beforeEach(() => {
    meta = META_ONE_TOPIC;
    descentCalls = [];
    descentScore = undefined;
    maxBatch = undefined;
    sufficientAfter = 0;
  });

  it("seeds entry nodes by similarity and visits only their subtree", async () => {
    const project = await buildBase(EMBED_CONFIG);

    // Two category subtrees. The near subtree (cat-near + 8 leaves = 9 nodes) all embed
    // near the subject; the far subtree embeds away. With 9 near nodes the top-K seed
    // is entirely within cat-near, so cat-far is never seeded — nor visited.
    const nearLeaves = Array.from({ length: 8 }, (_, i) => `near-${i}`);
    const farLeaves = ["far-0", "far-1"];
    const nodes: Record<string, TopicNode> = {};
    for (const n of [category("cat-near", nearLeaves), category("cat-far", farLeaves)]) {
      nodes[n.key] = n;
    }
    for (const k of nearLeaves) nodes[k] = leaf(k);
    for (const k of farLeaves) nodes[k] = leaf(k);
    const index: TopicIndex = { generated: "", roots: ["cat-near", "cat-far"], nodes };
    await project.requireAdapter(WikiTopicIndex).write(index);

    const vecs = new Map<string, Float32Array>();
    for (const k of ["cat-near", ...nearLeaves]) vecs.set(k, new Float32Array([1, 0]));
    for (const k of ["cat-far", ...farLeaves]) vecs.set(k, new Float32Array([0, 1]));
    await project.requireAdapter(WikiTopicNodeEmbeddings).write("fixture", DIM, vecs);

    const hits = await run(project, "near subject");

    const scored = new Set(descentCalls.flat());
    // The far subtree is never scored; a near leaf not in the seed (leaf-7) is reached
    // by descending cat-near, proving subtree descent.
    expect([...scored].some((k) => k.startsWith("far"))).toBe(false);
    expect(scored.has("cat-far")).toBe(false);
    expect(scored.has("near-7")).toBe(true);
    // Relevant index topics expand to their referenced section.
    expect(hits).toContainEqual({ uri: "a.md", sectionKey: "founders" });
  });

  it("falls back to a root descent on a text-only wiki (no embed model)", async () => {
    const project = await buildBase(TEXT_ONLY_CONFIG);
    let embedCalled = false;
    const llm = makeStubLlm({
      generateObject,
      embed: async (t) => {
        embedCalled = true;
        return embed(t);
      },
    });

    // A migrated flat index: every topic is a root leaf.
    const index: TopicIndex = {
      generated: "",
      roots: ["company-founders"],
      nodes: { "company-founders": leaf("company-founders") },
    };
    await project.requireAdapter(WikiTopicIndex).write(index);

    const hits = await topicDescent(
      project,
      llm,
      wikiConfigOf(project),
      new QueryProgress(),
      "founders",
      new Map(),
    );

    expect(embedCalled).toBe(false); // no embed model → no subject embedding
    expect(descentCalls[0]).toEqual(["company-founders"]); // descent started from roots()
    expect(hits).toContainEqual({ uri: "a.md", sectionKey: "founders" });
  });

  it("keeps every descent call bounded so a large index never overflows the context", async () => {
    const project = await buildBase(EMBED_CONFIG);

    // One seeded category fanning out to 40 leaves: descent must batch the level.
    const children = Array.from({ length: 40 }, (_, i) => `leaf-${i}`);
    const nodes: Record<string, TopicNode> = { "root-cat": category("root-cat", children) };
    for (const k of children) nodes[k] = leaf(k);
    const index: TopicIndex = { generated: "", roots: ["root-cat"], nodes };
    await project.requireAdapter(WikiTopicIndex).write(index);
    // Only the category has a stored vector, so it is the sole seed.
    await project
      .requireAdapter(WikiTopicNodeEmbeddings)
      .write("fixture", DIM, new Map([["root-cat", new Float32Array([1, 0])]]));

    maxBatch = DESCENT_BATCH; // the stub simulates context_length_exceeded past this

    const hits = await run(project, "anything");

    // No single call saw the whole 40-child level; each stayed within the bound.
    expect(descentCalls.length).toBeGreaterThan(1);
    for (const call of descentCalls) expect(call.length).toBeLessThanOrEqual(DESCENT_BATCH);
    expect(hits).toContainEqual({ uri: "a.md", sectionKey: "founders" });
  });

  it("surfaces at least the sections a flat select would, for a relevant topic (coverage parity)", async () => {
    const project = await buildBase(TEXT_ONLY_CONFIG);
    const index: TopicIndex = {
      generated: "",
      roots: ["company-founders"],
      nodes: { "company-founders": leaf("company-founders") },
    };
    await project.requireAdapter(WikiTopicIndex).write(index);

    const hits = await run(project, "founders");
    // The flat front-end would expand company-founders → its `founders` section; descent
    // surfaces the same.
    expect(hits).toEqual([{ uri: "a.md", sectionKey: "founders" }]);
  });
});

describe("topicDescent fusion — descent score stays internal (ADR 0001)", () => {
  beforeEach(() => {
    meta = META_TWO_TOPICS;
    descentCalls = [];
    descentScore = undefined;
    maxBatch = undefined;
    sufficientAfter = 0;
  });

  it("retrieves both a both-front-end section and a descent-only section (filter disabled)", async () => {
    // Hybrid search surfaces ONLY the founders section (both fronts); intro is descent-only.
    // The descent score stays internal (ADR 0001); with the relevance filter disabled BOTH
    // candidates are rolling-summarized and become evidence.
    const project = await buildBase(TEXT_ONLY_CONFIG, {
      search: async () => [{ uri: "a.md", sections: [{ sectionKey: "founders", modes: ["fts"] }] }],
    });
    // Two root leaves: founders + intro, both judged relevant (internal score 2).
    const index: TopicIndex = {
      generated: "",
      roots: ["company-founders", "acme-intro"],
      nodes: {
        "company-founders": leaf("company-founders"),
        "acme-intro": {
          kind: "topic",
          key: "acme-intro",
          name: "acme-intro",
          description: "",
          references: [{ uri: "a.md#acme-intro" }],
        },
      },
    };
    await project.requireAdapter(WikiTopicIndex).write(index);

    const answer = await project.requireAdapter(WikiQuery).ask("founders").complete();

    // No tier gating: both the corroborated `founders` and the descent-only `intro` are evidence.
    expect(answer.evidenceCount).toBe(2);
    expect(answer.citations.some((c) => c.includes("#founders"))).toBe(true);
    expect(answer.citations.some((c) => c.includes("#intro"))).toBe(true);
  });
});

describe("IntentDetection — DAG-safe vocabulary (root categories, not every topic)", () => {
  beforeEach(() => {
    meta = META_ONE_TOPIC;
    descentCalls = [];
    descentScore = undefined;
    maxBatch = undefined;
    sufficientAfter = 0;
    intentTopicKeys = [];
  });

  it("shows the topic index's root categories, not its leaf topics", async () => {
    const project = await buildBase(TEXT_ONLY_CONFIG, { search: async () => [] });
    // A category root over a leaf: the corpus vocabulary should be the category, the
    // leaf is reachable only via descent.
    const index: TopicIndex = {
      generated: "",
      roots: ["theme"],
      nodes: {
        theme: category("theme", ["company-founders"]),
        "company-founders": leaf("company-founders"),
      },
    };
    await project.requireAdapter(WikiTopicIndex).write(index);

    await project.requireAdapter(WikiQuery).ask("founders").complete();

    expect(intentTopicKeys).toEqual(["theme"]);
    expect(intentTopicKeys).not.toContain("company-founders");
  });
});
