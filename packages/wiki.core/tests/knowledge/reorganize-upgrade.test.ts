import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ProjectBuilder, Workspace } from "@statewalker/workspace.core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contentBuilder,
  docTopicEmbedderBuilder,
  isCategory,
  type LlmApi,
  metaBuilder,
  pruneBuilder,
  registerContentExtraction,
  registerKnowledgeAdapters,
  reorganizeBuilder,
  summarizeBuilder,
  type TopicIndex,
  WikiTopicIndex,
} from "../../src/index.js";
import { registerStubLlm } from "../util/stub-llm.js";

const DOCS = 40;
const calls: string[] = [];
const out = (o: unknown) => ({ output: o as never, usage: { inputTokens: 0, outputTokens: 0 } });
const generateObject: LlmApi["generateObject"] = async (spec) => {
  calls.push(spec.name);
  const input = spec.input as { uri?: string };
  switch (spec.name) {
    case "summarize-document":
      return out({
        title: "t",
        summary: "s",
        sections: [{ key: "s", title: "S", startLine: 0, endLine: 0, summary: "x" }],
      });
    case "extract-document-meta": {
      const id = (input.uri ?? "").replace(/\W/g, "");
      return out({
        topics: [{ key: `k-${id}`, name: `N ${id}`, description: "d", sectionKeys: ["s"] }],
        outliers: [],
      });
    }
    case "attribute-topics":
      return out({ actions: [] });
    case "split-category":
      return out({ subcategories: [] });
    case "refine-topic":
      return out({ subthemes: [] });
    case "name-category":
      return out({ name: "Cat", description: "d" });
    default:
      throw new Error(`unexpected ${spec.name}`);
  }
};
const embed = async (t: string) => {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 97;
  return new Float32Array([1, h / 97]);
};

/** A session over `files`: the wiki builders up to the reorganizer, 16 sources per scan batch. */
async function session(files: MemFilesApi) {
  const workspace = new Workspace().setFileSystem(files);
  registerContentExtraction(workspace);
  registerKnowledgeAdapters();
  registerStubLlm(workspace, { generateObject, embed });
  const project = await workspace.getProject("proj", true);
  if (!project) throw new Error("no project");
  const builder = project.requireAdapter(ProjectBuilder).configureScanBatch(16);
  for (const b of [
    contentBuilder(),
    summarizeBuilder(),
    metaBuilder(),
    docTopicEmbedderBuilder(),
    reorganizeBuilder(),
    pruneBuilder(),
  ]) {
    builder.registerBuilder(b);
  }
  const leaves = (index: TopicIndex) =>
    Object.values(index.nodes).filter((n) => !isCategory(n)).length;
  const readLeaves = async () => leaves(await project.requireAdapter(WikiTopicIndex).read());
  const hasLeaf = async (key: string) =>
    !!(await project.requireAdapter(WikiTopicIndex).read()).nodes[key];
  return { builder, leaves, readLeaves, hasLeaf };
}

describe("reorganizer on a fresh build store (upgrade)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the existing topic DAG while later scan batches are pending; no re-attribution", async () => {
    const files = new MemFilesApi({ initialFiles: {} });
    for (let i = 0; i < DOCS; i++) {
      await files.write(`proj/d${String(i).padStart(2, "0")}.md`, [
        new TextEncoder().encode(`doc ${i}`),
      ]);
    }
    const first = await session(files);
    await first.builder.run();
    expect(await first.readLeaves()).toBe(DOCS);

    // Upgrade: the build state starts empty (the old engine kept it elsewhere).
    await files.remove("proj/.project/state/build");
    calls.length = 0;
    const second = await session(files);
    const written: number[] = [];
    const write = WikiTopicIndex.prototype.write;
    vi.spyOn(WikiTopicIndex.prototype, "write").mockImplementation(function (
      this: WikiTopicIndex,
      index,
    ) {
      written.push(second.leaves(index));
      return write.call(this, index);
    });
    await second.builder.run();

    // Every write of the tree during the batched rebuild kept all the leaves.
    expect(written.length).toBeGreaterThan(1);
    expect(written.every((n) => n === DOCS)).toBe(true);
    expect(await second.readLeaves()).toBe(DOCS);
    // Hash-gated stages and key-matched attribution: no LLM work at all.
    expect(calls).toEqual([]);
  });

  it("strips a deferred document once it is scanned without producing topics", async () => {
    const files = new MemFilesApi({ initialFiles: {} });
    for (let i = 0; i < DOCS; i++) {
      await files.write(`proj/d${String(i).padStart(2, "0")}.md`, [
        new TextEncoder().encode(`doc ${i}`),
      ]);
    }
    const first = await session(files);
    await first.builder.run();
    expect(await first.readLeaves()).toBe(DOCS);

    // Upgrade, and the last document (scanned in the last batch) became empty: no rows.
    await files.remove("proj/.project/state/build");
    await files.write("proj/d39.md", [new TextEncoder().encode("")]);
    const second = await session(files);
    await second.builder.run();
    expect(await second.readLeaves()).toBe(DOCS - 1);
    expect(await second.hasLeaf("k-d39md")).toBe(false);
  });
});
