import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ProjectBuilder, Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contentBuilder,
  type DocumentGraphOutput,
  type DocumentMetaOutput,
  type DocumentSummaryOutput,
  documentGraphSchema,
  filterUnknownSubjects,
  graphBuilder,
  type LlmApi,
  metaBuilder,
  normalizeMeta,
  ResourceTextContentCache,
  registerContentExtraction,
  registerKnowledgeAdapters,
  type SectionGraph,
  summarizeBuilder,
  WikiPageGraph,
  WikiPageMeta,
} from "../../src/index.js";
import { registerStubLlm } from "../util/stub-llm.js";

const SUMMARY: DocumentSummaryOutput = {
  title: "About Acme",
  summary: "Acme makes widgets.",
  sections: [
    { key: "overview", title: "Overview", startLine: 0, endLine: 1, summary: "Acme overview." },
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
const GRAPH: DocumentGraphOutput = {
  sections: [
    {
      sectionKey: "overview",
      entities: [{ value: "Acme", type: "organisation" }],
      statements: [
        ["Acme", "makes", "widgets"],
        ["Ghost", "is", "undeclared"], // subject not an entity → must be dropped
      ],
      relations: [],
    },
  ],
};

const generateObject: LlmApi["generateObject"] = async (spec) => {
  const usage = { inputTokens: 0, outputTokens: 0 };
  if (spec.name === "summarize-document") return { output: SUMMARY as unknown as never, usage };
  if (spec.name === "extract-document-meta") return { output: META as unknown as never, usage };
  if (spec.name === "extract-document-graph") return { output: GRAPH as unknown as never, usage };
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

/** A stub that records the section inputs each graph-extraction call received and
 * counts the calls — used to assert the extractor input shape and freshness. */
function recordingStub() {
  const graphInputs: { key: string; title: string; summary: string; raw: string }[][] = [];
  let graphCalls = 0;
  const gen: LlmApi["generateObject"] = async (spec) => {
    const usage = { inputTokens: 0, outputTokens: 0 };
    if (spec.name === "summarize-document") return { output: SUMMARY as unknown as never, usage };
    if (spec.name === "extract-document-meta") return { output: META as unknown as never, usage };
    if (spec.name === "extract-document-graph") {
      graphCalls += 1;
      const input = spec.input as { sections: (typeof graphInputs)[number] };
      graphInputs.push(input.sections);
      return { output: GRAPH as unknown as never, usage };
    }
    throw new Error(`unexpected call ${spec.name}`);
  };
  return { gen, graphInputs, calls: () => graphCalls };
}

async function buildAll(project: Awaited<ReturnType<Workspace["getProject"]>>) {
  if (!project) throw new Error("project not found");
  const builder = project.requireAdapter(ProjectBuilder);
  builder.registerBuilder(contentBuilder());
  builder.registerBuilder(summarizeBuilder());
  builder.registerBuilder(metaBuilder());
  builder.registerBuilder(graphBuilder());
  for await (const _ of builder.run()) {
    // drain
  }
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

describe("filterUnknownSubjects", () => {
  it("drops triples whose subject is not a declared entity", () => {
    const sections: SectionGraph[] = [
      {
        sectionKey: "s",
        entities: [{ value: "Acme" }],
        statements: [
          ["Acme", "makes", "widgets"],
          ["Ghost", "is", "bad"],
        ],
        relations: [["Ghost", "rel", "Acme"]],
      },
    ];
    const out = filterUnknownSubjects(sections)[0]!;
    expect(out.statements).toEqual([["Acme", "makes", "widgets"]]);
    expect(out.relations).toEqual([]);
  });

  it("drops off-shape triples (wrong arity or empty fields)", () => {
    const sections: SectionGraph[] = [
      {
        sectionKey: "s",
        entities: [{ value: "Acme" }],
        statements: [
          ["Acme", "makes", "widgets"],
          ["Acme", "phone"], // 2 elements — résumé field with no value
          ["Acme", "email", ""], // empty object literal
          ["Acme", "based", "in", "NY"], // 4 elements but 4th is a string, not a details object
        ],
        relations: [],
      },
    ];
    const out = filterUnknownSubjects(sections)[0]!;
    expect(out.statements).toEqual([["Acme", "makes", "widgets"]]);
  });

  it("keeps a triple's optional 4th details object; drops a non-object 4th element", () => {
    const sections: SectionGraph[] = [
      {
        sectionKey: "s",
        entities: [{ value: "MSCI World Index" }],
        statements: [
          ["MSCI World Index", "returns", "5% in GBP", { year: 2015 }],
          ["MSCI World Index", "returns", "x", "GBP"], // 4th is a string, not details → dropped
        ],
        relations: [],
      },
    ];
    const out = filterUnknownSubjects(sections)[0]!;
    expect(out.statements).toEqual([["MSCI World Index", "returns", "5% in GBP", { year: 2015 }]]);
  });
});

describe("graph schema leniency", () => {
  it("parses off-shape triples (stray number, non-primitive detail) WITHOUT throwing; the filter drops/keeps", () => {
    // Regression: a stricter element schema made the whole-document parse throw and
    // dropped the document. The triple schema must accept anything; shape is enforced
    // only by filterUnknownSubjects.
    const parsed = documentGraphSchema.parse({
      sections: [
        {
          sectionKey: "s",
          entities: [{ value: "Acme" }],
          statements: [
            ["Acme", "makes", "widgets"],
            ["Acme", "count", 5], // bare number element — must not throw the parse
            ["Acme", "returns", "5%", { period: ["2016", "2017"] }], // non-primitive detail value
          ],
          relations: [],
        },
      ],
    });
    const out = filterUnknownSubjects(parsed.sections)[0]!;
    expect(out.statements).toEqual([
      ["Acme", "makes", "widgets"],
      ["Acme", "returns", "5%", { period: ["2016", "2017"] }],
    ]);
  });
});

describe("meta + graph builders", () => {
  let repository: Workspace;

  beforeEach(() => {
    repository = newRepository({ "proj/a.md": "# Acme\n\nAcme makes widgets." });
  });

  it("writes DocumentMeta and DocumentGraph, dropping orphan-subject triples", async () => {
    const workspace = repository;
    const project = (await workspace.getProject("proj"))!;
    const builder = project.requireAdapter(ProjectBuilder);

    builder.registerBuilder(contentBuilder());
    builder.registerBuilder(summarizeBuilder());
    builder.registerBuilder(metaBuilder());
    builder.registerBuilder(graphBuilder());

    for await (const _ of builder.run()) {
      // drain
    }

    const resource = (await project.getProjectResource("a.md"))!;

    const meta = await resource.requireAdapter(WikiPageMeta).get();
    expect(meta?.topics.map((t) => t.key)).toEqual(["company-founders"]);

    const graph = await resource.requireAdapter(WikiPageGraph).get();
    expect(graph?.sections[0]?.entities.map((e) => e.value)).toEqual(["Acme"]);
    // The orphan-subject statement ("Ghost") was dropped by validation.
    expect(graph?.sections[0]?.statements).toEqual([["Acme", "makes", "widgets"]]);
  });
});

describe("graph extractor input", () => {
  it("passes each section's title, summary, and its own raw block (not the whole document)", async () => {
    const stub = recordingStub();
    const repository = newRepository(
      { "proj/b.md": "Overview line one\nOverview line two\nDetails line three." },
      stub.gen,
    );
    const project = await repository.getProject("proj");
    await buildAll(project);

    expect(stub.calls()).toBe(1);
    const resource = (await project?.getProjectResource("b.md"))!;
    const text = await resource.requireAdapter(ResourceTextContentCache).getTextContent();
    // SUMMARY's stub section spans lines 0..1, so the raw block is the first two lines only.
    const expectedRaw = text.split("\n").slice(0, 2).join("\n");

    expect(stub.graphInputs[0]).toEqual([
      { key: "overview", title: "Overview", summary: "Acme overview.", raw: expectedRaw },
    ]);
    // The raw block is a slice, not the whole document.
    expect(stub.graphInputs[0]?.[0]?.raw).not.toContain("Details line three.");
  });
});
