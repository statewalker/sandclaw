import type { EmbedFn } from "@statewalker/indexer-api";
import type { FilesApi } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { applyNature, NatureBuilders, Workspace } from "@statewalker/workspace.core";
import { describe, expect, it } from "vitest";
import {
  createWikiTools,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  type LlmApi,
  LlmProjectAdapter,
  registerWiki,
  WikiNature,
  WikiQuery,
  wikiNature,
  wireWikiProject,
} from "../../src/index.js";
import { stubHypothesize, stubScore } from "../util/abductive-stubs.js";
import { makeStubLlm, seedWikiConfig } from "../util/stub-llm.js";

// The wikiNature unit checks never run a generation stage; a throwing stub suffices.
const noopGenerate = (async () => ({
  output: {},
  usage: { inputTokens: 0, outputTokens: 0 },
})) as LlmApi["generateObject"];

describe("wikiNature", () => {
  it("yields the wiki adapter pack and the index builders", () => {
    const nature = wikiNature({ llm: makeStubLlm({ generateObject: noopGenerate }) });
    const types = nature.adapters().map((a) => a.type);
    expect(types).toContain(LlmProjectAdapter);
    expect(types).toContain(WikiNature);
    // The builders are the wiki index pipeline (the terminal search indexer is present).
    expect(nature.builders().map((b) => b.id)).toContain("SearchIndexer");
  });

  it("applying it registers the pack + builder provider, and the disposer removes them", async () => {
    const ws = new Workspace().setFileSystem(
      new MemFilesApi({ initialFiles: { "proj/a.md": "x" } }),
    );
    const dispose = applyNature(
      ws,
      wikiNature({ llm: makeStubLlm({ generateObject: noopGenerate }) }),
    );
    const project = await ws.getProject("proj", true);
    if (!project) throw new Error("no project");

    // The façade + query adapters resolve on the project, and the injected LLM is wired.
    expect(project.requireAdapter(WikiNature)).toBeInstanceOf(WikiNature);
    expect(project.requireAdapter(WikiQuery)).toBeInstanceOf(WikiQuery);
    expect(project.getAdapter(LlmProjectAdapter)).not.toBeNull();
    // The nature's builders are exposed per-project via the NatureBuilders provider.
    expect(ws.adaptersRegistry.getFactory("project", NatureBuilders)).toBeDefined();

    dispose();
    expect(ws.adaptersRegistry.getFactory("project", LlmProjectAdapter)).toBeUndefined();
    expect(ws.adaptersRegistry.getFactory("project", NatureBuilders)).toBeUndefined();
  });
});

// ── Composed integration: mount a folder, apply the wiki nature (via registerWiki),
// index the seeded docs, then ask through the M3a `wiki_ask` tool path. Deterministic
// (stub LLM + MemFilesApi primary) — no real model, no browser.

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
    {
      key: "founders",
      title: "Founders",
      startLine: 1,
      endLine: 1,
      summary: "Someone founded Acme.",
    },
  ],
};
const META: DocumentMetaOutput = {
  topics: [
    {
      key: "company-founders",
      name: "Company founders",
      description: "People who found companies.",
      sectionKeys: ["founders"],
      brief: "Acme's founders.",
    },
  ],
  outliers: [],
};
const REF_RE = /ref="([^"]+)"/g;

/** A stub LLM driving both the ingest pipeline and the query FSM deterministically. */
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
      return out(META);
    case "reorganize-topics":
      return out({ actions: [] });
    case "intent-detection":
      return out({ onCorpus: true, subjects: [{ prompt: "Who founded Acme?" }] });
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
    case "outlier-select": {
      const outliers = (spec.input as { availableOutliers: { key: string }[] }).availableOutliers;
      return out({ topicKeys: [], outlierKeys: outliers.map((o) => o.key) });
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
        statement: "Jane founded Acme.",
        citations: m.citations,
      }));
      return out({ claims, suggestions: [], sufficient: true, missing: null });
    }
    default:
      throw new Error(`unexpected ${spec.name}`);
  }
};

// biome-ignore lint/suspicious/noExplicitAny: minimal tool-call options for the test
const execOpts = { toolCallId: "t", messages: [] } as any;

describe("wiki nature — composed (mounted folder → index → wiki_ask)", () => {
  it("indexes a mounted folder and answers a grounded question through the wiki_ask tool", async () => {
    // M2: a folder of seeded docs mounted as the workspace primary.
    const filesApi: FilesApi = new MemFilesApi({
      initialFiles: { "docs/intro.md": "Acme is a company.\nJane founded Acme." },
    });
    const workspace = new Workspace().setFileSystem(filesApi);

    // Apply the wiki nature (registerWiki delegates to applyNature(workspace, wikiNature)).
    registerWiki(workspace, { llm: makeStubLlm({ generateObject, embed }) });
    // The nature was applied: its builder provider is on the shared registry.
    expect(workspace.adaptersRegistry.getFactory("project", NatureBuilders)).toBeDefined();

    const project = await workspace.getProject("docs", true);
    if (!project) throw new Error("no project");
    await seedWikiConfig(project, {
      models: { default: "fx-model" },
      embedModel: "fx",
      dimensionality: DIM,
    });

    // Run the nature's index builders over the mounted folder.
    const builder = wireWikiProject(project);
    for await (const _ of builder.run()) {
      // drain
    }

    // Ask through the M3a path: the wiki_ask agent tool → WikiQuery.ask → grounded answer.
    const tools = createWikiTools(workspace);
    const res = await tools.wiki_ask?.execute?.({ question: "Who founded Acme?" }, execOpts);
    expect(res.availableWikis).toEqual(["docs"]);
    expect(res.answers).toHaveLength(1);
    const [answer] = res.answers;
    expect(answer.project).toBe("docs");
    expect(answer.evidenceCount).toBeGreaterThan(0);
    expect(answer.citations.length).toBeGreaterThan(0);
  });
});
