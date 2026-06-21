import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ProjectBuilder, Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type AttributeActions,
  type AttributeInput,
  contentBuilder,
  type DocumentMetaOutput,
  docTopicEmbedderBuilder,
  isCategory,
  type LlmApi,
  LlmProjectAdapter,
  metaBuilder,
  pruneBuilder,
  registerContentExtraction,
  registerKnowledgeAdapters,
  reorganizeBuilder,
  summarizeBuilder,
  WikiLlmConfiguration,
  WikiTopicIndex,
  WikiTopicNodeEmbeddings,
} from "../../src/index.js";
import { ATTRIBUTE_BATCH_SIZE } from "../../src/knowledge/reorganize.js";
import { makeStubLlm, registerStubLlm } from "../util/stub-llm.js";

interface Decl {
  key: string;
  name: string;
  description: string;
}
type AttributeFn = (input: AttributeInput) => AttributeActions;

/** A non-zero embedding for a name (overridable per-name for similarity control). */
function defaultVec(name: string): Float32Array {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 97;
  return new Float32Array([1, h / 97]);
}

function tracker() {
  const calls: string[] = [];
  const attributeInputs: AttributeInput[] = [];
  const topicsByUri = new Map<string, Decl[]>();
  const vecByName = new Map<string, Float32Array>();
  let attribute: AttributeFn = () => ({ actions: [] });
  const out = (o: unknown) => ({ output: o as never, usage: { inputTokens: 0, outputTokens: 0 } });
  const generateObject: LlmApi["generateObject"] = async (spec) => {
    calls.push(spec.name);
    if (spec.name === "summarize-document") {
      return out({
        title: "t",
        summary: "s",
        sections: [{ key: "s", title: "S", startLine: 0, endLine: 0, summary: "x" }],
      });
    }
    if (spec.name === "extract-document-meta") {
      const uri = (spec.input as { uri?: string }).uri ?? "";
      const meta: DocumentMetaOutput = {
        topics: (topicsByUri.get(uri) ?? []).map((d) => ({ ...d, sectionKeys: ["s"], brief: "b" })),
        outliers: [],
      };
      return out(meta);
    }
    if (spec.name === "attribute-topics") {
      const input = spec.input as AttributeInput;
      attributeInputs.push(input);
      return out(attribute(input));
    }
    if (spec.name === "split-category") return out({ subcategories: [] });
    if (spec.name === "refine-topic") return out({ subthemes: [] });
    if (spec.name === "merge-topics") return out({ merges: [] });
    if (spec.name === "name-category") return out({ name: "Cat", description: "d" });
    throw new Error(`unexpected ${spec.name}`);
  };
  const embed = async (text: string) =>
    vecByName.get(text.split("\n")[0] ?? "") ?? defaultVec(text);
  return {
    generateObject,
    embed,
    calls,
    attributeInputs,
    topicsByUri,
    vecByName,
    setAttribute: (f: AttributeFn) => {
      attribute = f;
    },
  };
}

async function setup(opts: { embed?: boolean } = {}) {
  const files = new MemFilesApi({ initialFiles: {} });
  const repository = new Workspace().setFileSystem(files);
  registerContentExtraction(repository);
  registerKnowledgeAdapters();
  const t = tracker();
  if (opts.embed === false) {
    // Text-only wiki: no embed model configured.
    const llm = makeStubLlm({ generateObject: t.generateObject });
    repository.adaptersRegistry.register("project", LlmProjectAdapter, () => llm);
    repository.adaptersRegistry.register(
      "project",
      WikiLlmConfiguration,
      (p) => new WikiLlmConfiguration(p, { config: { models: { default: "m" } } }),
    );
  } else {
    registerStubLlm(repository, { generateObject: t.generateObject, embed: t.embed });
  }
  const project = (await repository.getProject("proj", true))!;
  const builder = project.requireAdapter(ProjectBuilder);
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
  const write = async (path: string, text: string) => {
    await files.write(
      path,
      (async function* () {
        yield new TextEncoder().encode(text);
      })(),
    );
  };
  const run = async () => {
    for await (const _ of builder.run()) {
      // drain
    }
  };
  const index = () => project.requireAdapter(WikiTopicIndex).read();
  const leafKeys = async () =>
    Object.values((await index()).nodes)
      .filter((n) => !isCategory(n))
      .map((n) => n.key)
      .sort();
  const refsOf = async (key: string) => {
    const node = (await index()).nodes[key];
    return node && !isCategory(node) ? node.references.map((r) => r.uri).sort() : undefined;
  };
  const nodeVectors = () =>
    project.requireAdapter(WikiTopicNodeEmbeddings).getVectors("fixture", 2);
  return { t, write, run, index, leafKeys, refsOf, nodeVectors };
}

describe("topic attribution onto the index DAG", () => {
  let h: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    h = await setup();
  });

  it("attaches an exact key match mechanically, with no attribution LLM call", async () => {
    h.t.topicsByUri.set("a.md", [{ key: "shared", name: "Shared", description: "d" }]);
    await h.write("proj/a.md", "alpha");
    await h.run();

    // Second document declares the SAME key → key fast path, no attribution round.
    h.t.topicsByUri.set("b.md", [{ key: "shared", name: "Shared", description: "d" }]);
    await h.write("proj/b.md", "bravo");
    h.t.calls.length = 0;
    await h.run();

    expect(await h.leafKeys()).toEqual(["shared"]);
    expect(await h.refsOf("shared")).toEqual(["a.md#shared", "b.md#shared"]);
    expect(h.t.calls).not.toContain("attribute-topics");
  });

  it("covers every document topic — coins an index topic when nothing fits", async () => {
    h.t.topicsByUri.set("a.md", [{ key: "fresh", name: "Fresh", description: "d" }]);
    await h.write("proj/a.md", "alpha");
    await h.run();
    expect(await h.leafKeys()).toEqual(["fresh"]);
    expect(await h.refsOf("fresh")).toEqual(["a.md#fresh"]);
  });

  it("attaches a near-duplicate candidate to an existing index topic via the LLM", async () => {
    h.t.topicsByUri.set("a.md", [
      { key: "fund", name: "Fund performance", description: "returns" },
    ]);
    await h.write("proj/a.md", "alpha");
    await h.run();

    h.t.topicsByUri.set("b.md", [
      { key: "inv-fund", name: "Investment fund performance", description: "returns" },
    ]);
    h.t.setAttribute((input) => ({
      actions: input.candidates.map((c) => ({
        kind: "attach" as const,
        candidateKey: c.key,
        nodeKeys: ["fund"],
      })),
    }));
    await h.write("proj/b.md", "bravo");
    await h.run();

    expect(h.t.calls).toContain("attribute-topics");
    expect(await h.leafKeys()).toEqual(["fund"]);
    expect(await h.refsOf("fund")).toEqual(["a.md#fund", "b.md#inv-fund"]);
  });

  it("attaches a span-multiple candidate to several index topics", async () => {
    h.t.topicsByUri.set("a.md", [{ key: "p", name: "P", description: "d" }]);
    await h.write("proj/a.md", "a");
    await h.run();
    h.t.topicsByUri.set("b.md", [{ key: "q", name: "Q", description: "d" }]);
    h.t.setAttribute(() => ({ actions: [] })); // coin q via backstop
    await h.write("proj/b.md", "b");
    await h.run();

    // c spans both p and q.
    h.t.topicsByUri.set("c.md", [{ key: "r", name: "R", description: "d" }]);
    h.t.setAttribute((input) => ({
      actions: input.candidates.map((cand) => ({
        kind: "attach" as const,
        candidateKey: cand.key,
        nodeKeys: ["p", "q"],
      })),
    }));
    await h.write("proj/c.md", "c");
    await h.run();

    expect(await h.refsOf("p")).toEqual(["a.md#p", "c.md#r"]);
    expect(await h.refsOf("q")).toEqual(["b.md#q", "c.md#r"]);
  });

  it("embeds a coined index topic into the node store (same-cycle candidate availability)", async () => {
    h.t.topicsByUri.set("a.md", [{ key: "p", name: "P", description: "d" }]);
    await h.write("proj/a.md", "a");
    await h.run();
    expect([...(await h.nodeVectors()).keys()]).toContain("p");
  });

  it("re-ingesting unchanged declarations leaves the index unchanged", async () => {
    h.t.topicsByUri.set("a.md", [{ key: "p", name: "P", description: "d" }]);
    await h.write("proj/a.md", "a");
    await h.run();
    const before = JSON.stringify(await h.index());
    await h.run(); // nothing changed
    expect(JSON.stringify(await h.index())).toBe(before);
  });

  it("indexes a large topic set in bounded rounds (no whole-index LLM call)", async () => {
    const n = ATTRIBUTE_BATCH_SIZE + 5;
    h.t.topicsByUri.set(
      "a.md",
      Array.from({ length: n }, (_, i) => ({ key: `t-${i}`, name: `T ${i}`, description: "d" })),
    );
    h.t.setAttribute(() => ({ actions: [] })); // backstop coins each
    await h.write("proj/a.md", "alpha");
    await h.run();

    expect((await h.leafKeys()).length).toBe(n);
    // Every attribution call's input stayed within the batch bound.
    for (const input of h.t.attributeInputs) {
      expect(input.candidates.length).toBeLessThanOrEqual(ATTRIBUTE_BATCH_SIZE);
    }
  });

  it("attributes without an embedding model via key match + coin (no error)", async () => {
    const g = await setup({ embed: false });
    g.t.topicsByUri.set("a.md", [{ key: "p", name: "P", description: "d" }]);
    g.t.topicsByUri.set("b.md", [{ key: "q", name: "Q", description: "d" }]);
    await g.write("proj/a.md", "a");
    await g.write("proj/b.md", "b");
    await g.run();
    expect(await g.leafKeys()).toEqual(["p", "q"]);
    expect(g.t.calls).not.toContain("attribute-topics"); // no options → coined mechanically
  });
});
