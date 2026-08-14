import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { ProjectBuilder, Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  contentBuilder,
  type DocumentMetaOutput,
  docTopicEmbedderBuilder,
  isAcyclic,
  isCategory,
  type LlmApi,
  type MergeOutput,
  metaBuilder,
  reclusterTopics,
  registerContentExtraction,
  registerKnowledgeAdapters,
  reorganizeBuilder,
  summarizeBuilder,
  type TopicIndex,
  topicCleanupBuilder,
  WikiTopicIndex,
  WikiTopicNodeEmbeddings,
} from "../../src/index.js";
import { registerStubLlm } from "../util/stub-llm.js";

interface Decl {
  key: string;
  name: string;
  description: string;
}

function harness() {
  const topicsByUri = new Map<string, Decl[]>();
  const vecByName = new Map<string, Float32Array>();
  let merge: (input: { cluster: { key: string }[] }) => MergeOutput = () => ({ merges: [] });
  const out = (o: unknown) => ({ output: o as never, usage: { inputTokens: 0, outputTokens: 0 } });
  const generateObject: LlmApi["generateObject"] = async (spec) => {
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
    if (spec.name === "attribute-topics") return out({ actions: [] }); // coin via backstop
    if (spec.name === "merge-topics")
      return out(merge(spec.input as { cluster: { key: string }[] }));
    if (spec.name === "split-category") return out({ subcategories: [] });
    if (spec.name === "refine-topic") return out({ subthemes: [] });
    if (spec.name === "name-category") return out({ name: "Cat", description: "d" });
    throw new Error(`unexpected ${spec.name}`);
  };
  const embed = async (text: string) =>
    vecByName.get(text.split("\n")[0] ?? "") ?? new Float32Array([0, 1]);
  return {
    generateObject,
    embed,
    topicsByUri,
    vecByName,
    setMerge: (f: typeof merge) => {
      merge = f;
    },
  };
}

async function setup() {
  const files = new MemFilesApi({ initialFiles: {} });
  const repository = new Workspace().setFileSystem(files);
  registerContentExtraction(repository);
  registerKnowledgeAdapters();
  const t = harness();
  registerStubLlm(repository, { generateObject: t.generateObject, embed: t.embed });
  const project = (await repository.getProject("proj", true))!;
  const builder = project.requireAdapter(ProjectBuilder);
  for (const b of [
    contentBuilder(),
    summarizeBuilder(),
    metaBuilder(),
    docTopicEmbedderBuilder(),
    reorganizeBuilder(),
    topicCleanupBuilder(),
  ]) {
    builder.registerBuilder(b);
  }
  const write = async (path: string, text: string) =>
    files.write(
      path,
      (async function* () {
        yield new TextEncoder().encode(text);
      })(),
    );
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
  return { t, project, write, run, index, leafKeys, refsOf };
}

describe("automatic topic cleanup (near-duplicate merge)", () => {
  let h: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    h = await setup();
    // Two distinct keys whose names embed to the SAME vector → near-duplicates.
    h.t.vecByName.set("Topic A", new Float32Array([1, 0]));
    h.t.vecByName.set("Topic B", new Float32Array([1, 0]));
  });

  it("merges two same-class index topics under one canonical, unioning refs + recording an alias", async () => {
    h.t.topicsByUri.set("a.md", [{ key: "topic-a", name: "Topic A", description: "d" }]);
    h.t.topicsByUri.set("b.md", [{ key: "topic-b", name: "Topic B", description: "d" }]);
    h.t.setMerge(() => ({
      merges: [
        { canonicalKey: "topic-a", name: "Topic", description: "d", absorbedKeys: ["topic-b"] },
      ],
    }));
    await h.write("proj/a.md", "a");
    await h.write("proj/b.md", "b");
    await h.run();

    expect(await h.leafKeys()).toEqual(["topic-a"]);
    expect(await h.refsOf("topic-a")).toEqual(["a.md#topic-a", "b.md#topic-b"]);
    const survivor = (await h.index()).nodes["topic-a"];
    expect(survivor && !isCategory(survivor) && survivor.aliases).toContain("topic-b");
  });

  it("routes a re-ingested absorbed key to the survivor via the alias (no duplicate)", async () => {
    h.t.topicsByUri.set("a.md", [{ key: "topic-a", name: "Topic A", description: "d" }]);
    h.t.topicsByUri.set("b.md", [{ key: "topic-b", name: "Topic B", description: "d" }]);
    h.t.setMerge(() => ({
      merges: [
        { canonicalKey: "topic-a", name: "Topic", description: "d", absorbedKeys: ["topic-b"] },
      ],
    }));
    await h.write("proj/a.md", "a");
    await h.write("proj/b.md", "b");
    await h.run();

    // A NEW document re-declares the absorbed key topic-b.
    h.t.topicsByUri.set("c.md", [{ key: "topic-b", name: "Topic B", description: "d" }]);
    await h.write("proj/c.md", "c");
    await h.run();

    // It folds into the survivor via the alias; no topic-b leaf is recreated.
    expect(await h.leafKeys()).toEqual(["topic-a"]);
    expect(await h.refsOf("topic-a")).toContain("c.md#topic-b");
  });
});

describe("manual recluster", () => {
  it("leaves a valid acyclic DAG and converges on re-run", async () => {
    const h = await setup();
    // Seed an index of bare root leaves plus their node vectors (two clusters).
    const dag: TopicIndex = {
      generated: "",
      roots: ["a1", "a2", "b1"],
      nodes: {
        a1: {
          kind: "topic",
          key: "a1",
          name: "A1",
          description: "",
          references: [{ uri: "x#a1" }],
        },
        a2: {
          kind: "topic",
          key: "a2",
          name: "A2",
          description: "",
          references: [{ uri: "x#a2" }],
        },
        b1: {
          kind: "topic",
          key: "b1",
          name: "B1",
          description: "",
          references: [{ uri: "x#b1" }],
        },
      },
    };
    await h.project.requireAdapter(WikiTopicIndex).write(dag);
    const store = h.project.requireAdapter(WikiTopicNodeEmbeddings);
    await store.write(
      "fixture",
      2,
      new Map([
        ["a1", new Float32Array([1, 0])],
        ["a2", new Float32Array([1, 0.01])], // near a1 → same cluster
        ["b1", new Float32Array([0, 1])], // far → its own singleton
      ]),
    );

    await reclusterTopics(h.project);
    const after = await h.index();
    expect(isAcyclic(after)).toBe(true);
    // All three index topics survive (recluster only regroups).
    expect(await h.leafKeys()).toEqual(["a1", "a2", "b1"]);
    // a1 + a2 are grouped under a new category; b1 stays a root leaf.
    const cats = Object.values(after.nodes).filter(isCategory);
    expect(cats.length).toBe(1);
    expect(cats[0] && isCategory(cats[0]) && cats[0].childKeys.sort()).toEqual(["a1", "a2"]);

    // Re-running converges: still a valid DAG with the same leaves.
    await reclusterTopics(h.project);
    expect(isAcyclic(await h.index())).toBe(true);
    expect(await h.leafKeys()).toEqual(["a1", "a2", "b1"]);
  });
});
