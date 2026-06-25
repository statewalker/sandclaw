import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ProjectBuilder, Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contentBuilder,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  type LlmApi,
  metaBuilder,
  normalizeMeta,
  registerContentExtraction,
  registerKnowledgeAdapters,
  summarizeBuilder,
  WikiPageMeta,
  WikiPageSummary,
} from "../../src/index.js";
import { registerStubLlm } from "../util/stub-llm.js";

const SUMMARY: DocumentSummaryOutput = {
  title: "About Acme",
  summary: "Acme makes widgets.",
  sections: [
    {
      key: "overview",
      title: "Overview",
      startLine: 0,
      endLine: 1,
      summary: "What Acme does.",
      details: "Acme Corporation makes widgets.",
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
      sectionKeys: ["overview"],
      brief: "Acme was founded by Jane.",
    },
  ],
  outliers: [],
};

const generateObject: LlmApi["generateObject"] = async (spec) => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  if (spec.name === "summarize-document") return { output: SUMMARY as unknown as never, usage };
  if (spec.name === "extract-document-meta") return { output: META as unknown as never, usage };
  throw new Error(`unexpected call ${spec.name}`);
};

function newRepository(
  files: Record<string, string>,
  gen: LlmApi["generateObject"] = generateObject,
) {
  const repository = new Workspace().setFileSystem(new MemFilesApi({ initialFiles: files }));
  registerContentExtraction(repository);
  registerKnowledgeAdapters();
  registerStubLlm(repository, { generateObject: gen });
  return repository;
}

describe("normalizeMeta", () => {
  it("drops blank-key topics/outliers and outliers missing whySurprising; tolerates omitted arrays", () => {
    const out = normalizeMeta({
      topics: [
        { key: "good", name: "Good", description: "d", sectionKeys: ["s"], brief: "b" },
        { key: "  ", name: "Blank", description: "d", sectionKeys: ["s"], brief: "b" },
      ],
      outliers: [
        { key: "o1", name: "O1", sectionKeys: ["s"], brief: "b", whySurprising: "unexpected" },
        { key: "o2", name: "O2", sectionKeys: ["s"], brief: "b", whySurprising: "" },
      ],
    });
    expect(out.topics.map((t) => t.key)).toEqual(["good"]);
    expect(out.outliers.map((o) => o.key)).toEqual(["o1"]);
    expect(normalizeMeta({})).toEqual({ topics: [], outliers: [] });
  });

  it("keeps a topic whose model omitted `brief`/`sectionKeys`, defaulting the missing fields", () => {
    const out = normalizeMeta({
      topics: [{ key: "investment-funds", name: "Investment funds", description: "d" }],
    });
    expect(out.topics).toEqual([
      {
        key: "investment-funds",
        name: "Investment funds",
        description: "d",
        sectionKeys: [],
        brief: "",
      },
    ]);
  });
});

describe("meta builder", () => {
  let repository: Workspace;

  beforeEach(() => {
    repository = newRepository({ "proj/a.md": "# Acme\n\nAcme makes widgets." });
  });

  it("writes DocumentMeta from the summarizer's routing payload", async () => {
    const project = (await repository.getProject("proj"))!;
    const builder = project.requireAdapter(ProjectBuilder);
    builder.registerBuilder(contentBuilder());
    builder.registerBuilder(summarizeBuilder());
    builder.registerBuilder(metaBuilder());
    for await (const _ of builder.run()) {
      // drain
    }
    const resource = (await project.getProjectResource("a.md"))!;
    const meta = await resource.requireAdapter(WikiPageMeta).get();
    expect(meta?.topics.map((t) => t.key)).toEqual(["company-founders"]);
  });

  it("feeds the meta extractor each section's details (routing payload), not its tables", async () => {
    let metaInput: unknown;
    const gen: LlmApi["generateObject"] = async (spec) => {
      const usage = { inputTokens: 0, outputTokens: 0 };
      if (spec.name === "summarize-document") return { output: SUMMARY as unknown as never, usage };
      if (spec.name === "extract-document-meta") {
        metaInput = spec.input;
        return { output: META as unknown as never, usage };
      }
      throw new Error(`unexpected call ${spec.name}`);
    };
    const project = (await newRepository(
      { "proj/a.md": "# Acme\n\nAcme makes widgets." },
      gen,
    ).getProject("proj"))!;
    const builder = project.requireAdapter(ProjectBuilder);
    builder.registerBuilder(contentBuilder());
    builder.registerBuilder(summarizeBuilder());
    builder.registerBuilder(metaBuilder());
    for await (const _ of builder.run()) {
      // drain
    }
    const section = (metaInput as { summary: { sections: Record<string, unknown>[] } }).summary
      .sections[0];
    expect(section).toMatchObject({ key: "overview", details: "Acme Corporation makes widgets." });
    expect(section).not.toHaveProperty("tables");
  });
});

describe("summarizer details/tables", () => {
  it("persists details + tables and drops malformed rows / empty tables", async () => {
    const dirty: DocumentSummaryOutput = {
      title: "Funds",
      summary: "Fund returns.",
      sections: [
        {
          key: "returns",
          title: "Returns",
          startLine: 0,
          endLine: 1,
          summary: "Quarterly returns by fund.",
          details: "Returns range −2% to +7%; see the returns table.",
          tables: [
            {
              caption: "Quarterly returns",
              columns: ["Fund", "Return"],
              rows: [
                ["Innovators Fund One", "6.8%"],
                ["Broken Row"], // wrong arity → dropped
              ],
            },
            { caption: "Empty", columns: ["X"], rows: [] }, // empty → dropped
          ],
        },
      ],
    };
    const gen: LlmApi["generateObject"] = async (spec) => {
      const usage = { inputTokens: 0, outputTokens: 0 };
      if (spec.name === "summarize-document") return { output: dirty as unknown as never, usage };
      throw new Error(`unexpected call ${spec.name}`);
    };
    const project = (await newRepository(
      { "proj/f.md": "Returns line one\nReturns line two." },
      gen,
    ).getProject("proj"))!;
    const builder = project.requireAdapter(ProjectBuilder);
    builder.registerBuilder(contentBuilder());
    builder.registerBuilder(summarizeBuilder());
    for await (const _ of builder.run()) {
      // drain
    }
    const resource = (await project.getProjectResource("f.md"))!;
    const summary = await resource.requireAdapter(WikiPageSummary).get();
    const section = summary?.sections[0];
    expect(section?.details).toContain("Returns range");
    expect(section?.tables).toEqual([
      {
        caption: "Quarterly returns",
        columns: ["Fund", "Return"],
        rows: [["Innovators Fund One", "6.8%"]],
      },
    ]);
  });
});
