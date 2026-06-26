import type { EmbedFn } from "@statewalker/indexer-api";
import { Commands } from "@statewalker/shared-commands";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { type Project, Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createWikiSiteTools,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  type LlmApi,
  OpenWikiSiteCommand,
  type OpenWikiSitePayload,
  registerWiki,
  wikiTocOf,
  wireWikiProject,
} from "../../src/index.js";
import { makeStubLlm, seedWikiConfig } from "../util/stub-llm.js";

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
      return out({ claims, suggestions: [], sufficient: true, missing: null });
    }
    default:
      throw new Error(`unexpected call ${spec.name}`);
  }
};

// biome-ignore lint/suspicious/noExplicitAny: minimal tool-call options for the test
const execOpts = { toolCallId: "t", messages: [] } as any;

async function buildWorkspace(): Promise<Workspace> {
  const filesApi = new MemFilesApi({
    initialFiles: { "proj/docs/intro.md": "Acme is a company.\nJane founded Acme." },
  });
  const workspace = new Workspace().setFileSystem(filesApi);
  registerWiki(workspace, { llm: makeStubLlm({ generateObject, embed }) });
  const project = (await workspace.getProject("proj", true)) as Project;
  await seedWikiConfig(project, {
    models: { default: "fx" },
    embedModel: "fx",
    dimensionality: DIM,
  });
  const builder = wireWikiProject(project);
  for await (const _ of builder.run()) {
    // drain
  }
  return workspace;
}

describe("createWikiSiteTools", () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = await buildWorkspace();
  });

  it("exposes suggest_toc, save_toc, generate_site", () => {
    expect(Object.keys(createWikiSiteTools(workspace)).sort()).toEqual([
      "generate_site",
      "save_toc",
      "suggest_toc",
    ]);
  });

  it("suggest_toc drafts markdown from the wiki topics", async () => {
    const tools = createWikiSiteTools(workspace);
    const res = await tools.suggest_toc?.execute?.({ wiki: "proj" }, execOpts);
    expect(res.markdown).toContain("## Company founders");
  });

  it("save_toc then generate_site produces a site and returns a file:// index link", async () => {
    const tools = createWikiSiteTools(workspace);
    const toc = "# Acme\n\n## Founders\nWho founded Acme?\n";
    const saved = await tools.save_toc?.execute?.(
      { wiki: "proj", slug: "themes", markdown: toc },
      execOpts,
    );
    expect(saved.path).toContain("tocs/themes.md");

    const gen = await tools.generate_site?.execute?.({ wiki: "proj", tocSlug: "themes" }, execOpts);
    expect(gen.written).toBe(1);
    expect(gen.indexUri).toMatch(/^file:\/\/.*\/sites\/themes\/index\.md$/);
    expect(await workspace.files.exists("proj/sites/themes/founders.md")).toBe(true);
  });

  it("rejects a non-wiki project name", async () => {
    await wikiTocOf((await workspace.getProject("proj", true)) as Project); // ensure project exists
    const tools = createWikiSiteTools(workspace);
    const res = await tools.generate_site?.execute?.(
      { wiki: "ghost", tocSlug: "themes" },
      execOpts,
    );
    expect(res.error).toContain("ghost");
  });

  it("generate_site dispatches wiki:open-site for the generated site", async () => {
    const tools = createWikiSiteTools(workspace);
    await tools.save_toc?.execute?.(
      { wiki: "proj", slug: "themes", markdown: "# Acme\n\n## Founders\nWho founded Acme?\n" },
      execOpts,
    );
    const opened: OpenWikiSitePayload[] = [];
    const off = workspace.requireAdapter(Commands).listen(OpenWikiSiteCommand, (command) => {
      opened.push(command.payload);
      command.resolve();
      return true;
    });

    await tools.generate_site?.execute?.({ wiki: "proj", tocSlug: "themes" }, execOpts);
    await new Promise((resolve) => setTimeout(resolve, 0)); // settle the fire-and-forget dispatch
    expect(opened).toEqual([{ project: "proj", slug: "themes" }]);
    off();
  });
});
