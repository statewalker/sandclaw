import type { EmbedFn } from "@statewalker/indexer-api";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { type Project, Workspace } from "@statewalker/workspace.core";
import {
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  type LlmApi,
  registerWiki,
  wireWikiProject,
} from "../../src/index.js";
import { makeStubLlm, seedWikiConfig } from "./stub-llm.js";

/** Embedding dimensionality the fixture builds its index with. */
export const DIM = 2;

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

/** A stub LLM that drives both the ingest pipeline and the query FSM deterministically. */
const generateObject: LlmApi["generateObject"] = async (spec) => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const out = (o: unknown) => ({ output: o as never, usage });
  switch (spec.name) {
    case "summarize-document":
      return out(SUMMARY);
    case "aggregate-chapters":
      // Group all members under one chapter (only reached when leaves exceed the fan-out).
      return out({
        chapters: [
          {
            title: "All",
            summary: "All members.",
            memberKeys: (spec.input as { members: { key: string }[] }).members.map((m) => m.key),
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
        statement: "fact",
        citations: m.citations,
      }));
      return out({ claims, suggestions: [], sufficient: true, missing: null });
    }
    default:
      throw new Error(`unexpected call ${spec.name}`);
  }
};

/**
 * Build a workspace with two indexed wikis (`a`, `b`) about Acme founders, plus a
 * non-`docs` folder under `a`. Shared by the wiki tools and wiki commands tests.
 */
export async function buildMultiWikiWorkspace(): Promise<Workspace> {
  const filesApi = new MemFilesApi({
    initialFiles: {
      "a/docs/intro.md": "Acme is a company.\nJane founded Acme.",
      "a/notes/x.md": "Acme is a company.\nMallory founded Acme.",
      "b/docs/guide.md": "Acme is a company.\nBob founded Acme.",
    },
  });
  const workspace = new Workspace().setFileSystem(filesApi);
  registerWiki(workspace, { llm: makeStubLlm({ generateObject, embed }) });

  for (const name of ["a", "b"]) {
    const project = (await workspace.getProject(name, true)) as Project;
    await seedWikiConfig(project, {
      models: { default: "fx-model" },
      embedModel: "fx",
      dimensionality: DIM,
    });
    const builder = wireWikiProject(project);
    for await (const _ of builder.run()) {
      // drain
    }
  }
  return workspace;
}
