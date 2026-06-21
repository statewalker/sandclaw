import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbedFn } from "@statewalker/indexer-api";
import type { FilesApi } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { NodeFilesApi } from "@statewalker/webrun-files-node";
import { Workspace } from "@statewalker/workspace.core";
import { afterEach, describe, expect, it } from "vitest";
import {
  type DocumentGraphOutput,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  type LlmApi,
  registerWiki,
  type WikiConfigData,
  WikiPageSummary,
  WikiQuery,
  WikiTopicIndex,
  wikiConfigOf,
  wireWikiProject,
} from "../../src/index.js";
import { makeStubLlm, seedWikiConfig } from "../util/stub-llm.js";

const DIM = 2;
const embed: EmbedFn = async (text) => {
  const v = new Float32Array(DIM);
  if (text.toLowerCase().includes("acme")) v[0] = 1;
  return v;
};

const SUMMARY: DocumentSummaryOutput = {
  title: "Acme",
  summary: "Acme overview.",
  sections: [
    { key: "intro", title: "Intro", startLine: 0, endLine: 0, summary: "Acme is a company." },
  ],
};
const META: DocumentMetaOutput = {
  topics: [
    {
      key: "companies",
      name: "Companies",
      description: "Business organisations.",
      sectionKeys: ["intro"],
      brief: "Acme.",
    },
  ],
  outliers: [],
};
const GRAPH: DocumentGraphOutput = {
  sections: [{ sectionKey: "intro", entities: [{ value: "Acme" }], statements: [], relations: [] }],
};
const REF_RE = /ref="([^"]+)"/g;

const generateObject: LlmApi["generateObject"] = async (spec) => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const out = (o: unknown) => ({ output: o as never, usage });
  switch (spec.name) {
    case "summarize-document":
      return out(SUMMARY);
    case "extract-document-meta":
      return out(META);
    case "extract-document-graph":
      return out(GRAPH);
    case "intent-detection":
      return out({
        onCorpus: true,
        subjects: [{ prompt: (spec.input as { question: string }).question }],
      });
    case "topic-descent": {
      // Keep every frontier node (the corpus is tiny); grounding narrows later.
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
    case "section-select": {
      // Keep every candidate section in the batch.
      const docs = (spec.input as { documents: { sections: { uri: string }[] }[] }).documents;
      return out({ relevantUris: docs.flatMap((d) => d.sections.map((s) => s.uri)) });
    }
    case "summarize-batch": {
      // Carry every marker in the batch into the summary so citations propagate.
      const sections = (spec.input as { request: string }).request;
      const refs = [...sections.matchAll(REF_RE)].map((m) => m[1]);
      return out({ facts: refs.map((r) => ({ statement: "fact", citations: [r] })) });
    }
    case "compose-answer": {
      // One grounded claim per marker the rolling summaries carried.
      const claims = (spec.input as { facts: { statement: string; citations: string[] }[] }).facts.map((m) => ({
        statement: "Acme is a company.",
        citations: m.citations,
      }));
      return out({ claims, suggestions: [], sufficient: true, missing: null });
    }
    default:
      throw new Error(`unexpected ${spec.name}`);
  }
};

const llm = makeStubLlm({ generateObject, embed });

async function writeFile(filesApi: FilesApi, path: string, text: string): Promise<void> {
  await filesApi.write(
    path,
    (async function* () {
      yield new TextEncoder().encode(text);
    })(),
  );
}

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop() as string, { recursive: true, force: true });
});

async function makeFilesApi(kind: "mem" | "node"): Promise<FilesApi> {
  if (kind === "mem") return new MemFilesApi();
  const dir = await mkdtemp(join(tmpdir(), "wiki-smoke-"));
  tmpDirs.push(dir);
  return new NodeFilesApi({ rootDir: dir });
}

describe.each(["mem", "node"] as const)("registerWiki end-to-end (%s FilesApi)", (kind) => {
  it("scans a project into a queryable wiki", async () => {
    const filesApi = await makeFilesApi(kind);
    const repository = new Workspace().setFileSystem(filesApi);
    registerWiki(repository, { llm });

    const workspace = repository;
    const project = await workspace.getProject("proj", true);
    if (!project) throw new Error("no project");
    await seedWikiConfig(project, {
      models: { default: "fixture-model" },
      embedModel: "fixture",
      dimensionality: DIM,
    });
    await writeFile(filesApi, "proj/a.md", "Acme is a company.");

    const builder = wireWikiProject(project);
    for await (const _ of builder.run()) {
      // drain
    }

    // The page was summarized and the global topic index aggregated.
    const resource = await project.getProjectResource("a.md");
    const summary = await resource?.requireAdapter(WikiPageSummary).get();
    expect(summary?.title).toBe("Acme");
    const topic = (await project.requireAdapter(WikiTopicIndex).get("companies")) as
      | { references: { uri: string }[] }
      | undefined;
    expect(topic?.references.map((r) => r.uri)).toEqual(["a.md#companies"]);

    // Status reports no pending work after a full scan.
    const status = await builder.status();
    expect(status.builders.every((b) => b.pending === 0)).toBe(true);

    // A query returns a grounded, cited answer.
    const answer = await project.requireAdapter(WikiQuery).ask("What is Acme?").complete();
    expect(answer.text).toMatch(/\[\[\/a\.md#intro\]\]/);
    expect(answer.evidenceCount).toBeGreaterThan(0);
  });
});

describe("registerWiki text-only (no embedding model)", () => {
  it("builds and queries via full-text only, never embedding", async () => {
    const filesApi = new MemFilesApi();
    const workspace = new Workspace().setFileSystem(filesApi);
    // An embedder that throws: proves neither the build nor the query touches the
    // vector path when no embedding model is configured.
    const textOnlyLlm = makeStubLlm({
      generateObject,
      embed: async () => {
        throw new Error("embed must not be called when no embedding model is configured");
      },
    });
    registerWiki(workspace, { llm: textOnlyLlm });

    const project = await workspace.getProject("proj", true);
    if (!project) throw new Error("no project");
    // Text-only config: no `embedModel` / `dimensionality`.
    await wikiConfigOf(project).write({ models: { default: "fixture-model" } } as WikiConfigData);
    await writeFile(filesApi, "proj/a.md", "Acme is a company.");

    const builder = wireWikiProject(project);
    for await (const _ of builder.run()) {
      // drain — must complete despite embed() throwing
    }

    const status = await builder.status();
    expect(status.builders.every((b) => b.pending === 0)).toBe(true);

    // The full-text-only query still returns a grounded, cited answer.
    const answer = await project.requireAdapter(WikiQuery).ask("What is Acme?").complete();
    expect(answer.text).toMatch(/\[\[\/a\.md#intro\]\]/);
    expect(answer.evidenceCount).toBeGreaterThan(0);
  });
});
