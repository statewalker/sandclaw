import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ProjectBuilder, Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contentBuilder,
  type DocumentSummary,
  type DocumentSummaryOutput,
  KNOWLEDGE_SCHEMA_VERSION,
  type LlmApi,
  ResourceTextContentCache,
  registerContentExtraction,
  registerKnowledgeAdapters,
  SUMMARIZED_SIGNAL,
  summarizeBuilder,
  summaryLeaves,
  WikiPageSummary,
} from "../../src/index.js";
import { expectPartition } from "../util/partition.js";
import { registerStubLlm } from "../util/stub-llm.js";

const SUMMARY_OUTPUT: DocumentSummaryOutput = {
  title: "About Acme",
  summary: "Acme makes widgets and was founded in 1999.",
  sections: [
    {
      key: "overview",
      title: "Overview",
      startLine: 0,
      summary: "Acme overview.",
    },
    {
      key: "history",
      title: "History",
      startLine: 2,
      summary: "Founded 1999.",
    },
  ],
};

/** Stub generation: records the last input and returns a fixed summary. */
let capturedInput: unknown;
const generateObject: LlmApi["generateObject"] = async (spec) => {
  capturedInput = spec.input;
  return {
    output: SUMMARY_OUTPUT as unknown as never,
    usage: { inputTokens: 0, outputTokens: 0 },
  };
};

function newRepository(files: Record<string, string>) {
  const repository = new Workspace().setFileSystem(new MemFilesApi({ initialFiles: files }));
  registerContentExtraction(repository);
  registerKnowledgeAdapters();
  registerStubLlm(repository, { generateObject });
  return repository;
}

describe("summarizeBuilder", () => {
  let repository: Workspace;

  beforeEach(() => {
    repository = newRepository({
      "proj/a.md": "# Acme\n\nAcme makes widgets.\nFounded 1999.",
    });
  });

  async function getProject() {
    const workspace = repository;
    const project = await workspace.getProject("proj");
    if (!project) throw new Error("no project");
    return project;
  }

  it("page summary adapter is undefined before the builder has run", async () => {
    const project = await getProject();
    const resource = await project.getProjectResource("a.md");
    expect(await resource?.requireAdapter(WikiPageSummary).get()).toBeUndefined();
  });

  it("summarizes content into Sections, writes them, and emits summarized", async () => {
    const project = await getProject();
    const builder = project.requireAdapter(ProjectBuilder);

    const summarizedUris: string[] = [];
    builder.registerBuilder(contentBuilder());
    builder.registerBuilder(summarizeBuilder());
    builder.registerBuilder({
      id: "summarized-sink",
      inputs: [SUMMARIZED_SIGNAL],
      outputs: [],
      // biome-ignore lint/correctness/useYield: a sink records updates and emits nothing
      async *handler(p) {
        const b = p.requireAdapter(ProjectBuilder);
        for await (const u of b.readUpdates({
          signal: SUMMARIZED_SIGNAL,
          cell: "summarized-sink",
        })) {
          summarizedUris.push(u.uri);
          await u.handled();
        }
        return true;
      },
    });

    for await (const _ of builder.run()) {
      // drain
    }

    // The summarizer received the document's numbered raw lines.
    const input = capturedInput as {
      uri: string;
      rawLines: Array<[number, string]>;
    };
    expect(input.uri).toBe("a.md");
    expect(input.rawLines[0]).toEqual([0, "# Acme"]);

    // The DocumentSummary was written and is readable via WikiPageSummary.
    const resource = await project.getProjectResource("a.md");
    const summary = await resource?.requireAdapter(WikiPageSummary).get();
    expect(summary?.title).toBe("About Acme");
    expect((summary ? summaryLeaves(summary) : []).map((s) => s.key)).toEqual([
      "overview",
      "history",
    ]);

    // Raw text was cached.
    const raw = await resource?.requireAdapter(ResourceTextContentCache).getTextContent();
    expect(raw).toContain("Acme makes widgets.");

    // `summarized` was emitted for the page.
    expect(summarizedUris).toEqual(["a.md"]);
  });

  /** Write a v3 summary with a leading gap, an overlap and a trailing gap over the cached text. */
  async function seedV3Summary() {
    const project = await getProject();
    const resource = await project.getProjectResource("a.md");
    if (!resource) throw new Error("no resource");
    const { hash } = await resource.requireAdapter(ResourceTextContentCache).refresh();
    const v3: DocumentSummary = {
      key: "about-acme",
      title: "About Acme",
      summary: "Acme.",
      startLine: 1,
      endLine: 3,
      children: [
        { key: "overview", title: "Overview", summary: "o", startLine: 1, endLine: 2 },
        { key: "history", title: "History", summary: "h", startLine: 2, endLine: 3 },
      ],
      uri: "a.md",
      generated: "2026-01-01T00:00:00.000Z",
      sourceHash: hash,
      schemaVersion: 3,
    };
    await resource.requireAdapter(WikiPageSummary).write(v3);
    return { project, resource };
  }

  async function runSummarizer(project: Awaited<ReturnType<typeof getProject>>, force = false) {
    const builder = project.requireAdapter(ProjectBuilder);
    builder.registerBuilder(contentBuilder());
    builder.registerBuilder(summarizeBuilder({ force }));
    for await (const _ of builder.run()) {
      // drain
    }
  }

  it("upgrades a v3 summary of an unchanged source to v4 with no LLM call", async () => {
    const { project, resource } = await seedV3Summary();
    capturedInput = undefined;
    await runSummarizer(project);

    expect(capturedInput).toBeUndefined(); // the stub was never called
    const summary = await resource.requireAdapter(WikiPageSummary).get();
    expect(summary?.schemaVersion).toBe(KNOWLEDGE_SCHEMA_VERSION);
    expect(KNOWLEDGE_SCHEMA_VERSION).toBe(4);
    // The fixture text has 4 lines: "# Acme", "", "Acme makes widgets.", "Founded 1999."
    const leaves = summary ? summaryLeaves(summary) : [];
    expect(leaves.map((l) => [l.key, l.startLine, l.endLine])).toEqual([
      ["overview", 0, 2],
      ["history", 3, 3],
    ]);
    expectPartition(leaves, 0, 3);
    expect(summary?.title).toBe("About Acme"); // the stored summary was repaired, not replaced
  });

  it("re-summarizes a v3 summary under --force instead of upgrading it", async () => {
    const { project, resource } = await seedV3Summary();
    capturedInput = undefined;
    await runSummarizer(project, true);

    expect(capturedInput).toBeDefined();
    const summary = await resource.requireAdapter(WikiPageSummary).get();
    expect(summary?.schemaVersion).toBe(4);
    expect((summary ? summaryLeaves(summary) : []).map((s) => s.summary)).toEqual([
      "Acme overview.",
      "Founded 1999.",
    ]);
  });
});
