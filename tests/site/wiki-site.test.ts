import type { EmbedFn } from "@statewalker/indexer-api";
import { readText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { type Project, Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  type LlmApi,
  registerWiki,
  type SitePageProgress,
  wikiSiteOf,
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
      details: "Acme is a company.",
      tables: [],
    },
    {
      key: "founders",
      title: "Founders",
      startLine: 1,
      endLine: 1,
      summary: "Jane founded Acme.",
      details: "Jane founded Acme.",
      tables: [],
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
    case "summarize-batch": {
      const sections = (spec.input as { request: string }).request;
      const refs = [...sections.matchAll(REF_RE)].map((m) => m[1]);
      return out({ facts: refs.map((r) => ({ statement: "fact", citations: [r] })) });
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

const TWO_PAGE_TOC = `# Acme themes

## Founders
Who founded Acme?

## Products
What products does Acme make?
`;

async function buildProject(): Promise<Project> {
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
    // drain the index build
  }
  return project;
}

async function drain(it: AsyncIterable<SitePageProgress>): Promise<SitePageProgress[]> {
  const out: SitePageProgress[] = [];
  for await (const p of it) out.push(p);
  return out;
}

describe("WikiSite.generate", () => {
  let project: Project;

  beforeEach(async () => {
    project = await buildProject();
    await wikiTocOf(project).write("themes", TWO_PAGE_TOC);
  });

  it("generates one markdown page per prompted entry, plus index.md + site.json", async () => {
    const progress = await drain(wikiSiteOf(project).generate("themes"));
    expect(
      progress
        .filter((p) => p.status === "written")
        .map((p) => p.id)
        .sort(),
    ).toEqual(["founders", "products"]);

    const files = project.workspace.files;
    const founders = await files.exists("proj/sites/themes/founders.md");
    const products = await files.exists("proj/sites/themes/products.md");
    const index = await files.exists("proj/sites/themes/index.md");
    expect([founders, products, index]).toEqual([true, true, true]);

    const manifest = await wikiSiteOf(project).manifest("themes");
    expect(manifest?.pages.map((p) => p.id)).toEqual(["founders", "products"]);
    expect(manifest?.title).toBe("Acme themes");

    // The founders page is grounded with a citation footnote.
    const body = await readText(files, "proj/sites/themes/founders.md");
    expect(body).toContain("# Founders");
    expect(body).toContain("## Citations");
  });

  it("skips unchanged pages on re-run and regenerates with force", async () => {
    await drain(wikiSiteOf(project).generate("themes"));

    const second = await drain(wikiSiteOf(project).generate("themes"));
    expect(
      second
        .filter((p) => p.status === "skipped")
        .map((p) => p.id)
        .sort(),
    ).toEqual(["founders", "products"]);
    expect(second.some((p) => p.status === "written")).toBe(false);

    const forced = await drain(wikiSiteOf(project).generate("themes", { force: true }));
    expect(
      forced
        .filter((p) => p.status === "written")
        .map((p) => p.id)
        .sort(),
    ).toEqual(["founders", "products"]);
  });

  it("prunes pages whose TOC entry was removed", async () => {
    await drain(wikiSiteOf(project).generate("themes"));

    // Drop the Products entry and regenerate.
    await wikiTocOf(project).write("themes", "# Acme themes\n\n## Founders\nWho founded Acme?\n");
    const progress = await drain(wikiSiteOf(project).generate("themes"));

    expect(progress.some((p) => p.status === "pruned" && p.id === "products")).toBe(true);
    expect(await project.workspace.files.exists("proj/sites/themes/products.md")).toBe(false);
    const manifest = await wikiSiteOf(project).manifest("themes");
    expect(manifest?.pages.map((p) => p.id)).toEqual(["founders"]);
  });
});
