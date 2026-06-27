import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { type Project, Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import { isCategory, isIndexTopic, type TopicIndex, WikiTopicIndex } from "../../src/index.js";

async function makeProject(initialFiles: Record<string, string> = {}): Promise<{
  project: Project;
  files: MemFilesApi;
}> {
  const files = new MemFilesApi({ initialFiles });
  const ws = new Workspace().setFileSystem(files);
  const project = await ws.getProject("proj", true);
  if (!project) throw new Error("no project");
  return { project, files };
}

describe("WikiTopicIndex — DAG read surface + lazy migration", () => {
  let project: Project;
  let index: WikiTopicIndex;

  beforeEach(async () => {
    ({ project } = await makeProject());
    index = project.requireAdapter(WikiTopicIndex);
  });

  it("lifts a legacy flat { topics: [] } artifact into a valid DAG", async () => {
    // A legacy artifact written directly to the index path.
    const legacy = {
      generated: "2020",
      topics: [
        { key: "alpha", name: "Alpha", description: "a", references: [{ uri: "a.md#alpha" }] },
        { key: "bravo", name: "Bravo", description: "b", references: [{ uri: "b.md#bravo" }] },
      ],
    };
    const { project: p2 } = await makeProject({
      "proj/.project/index/topics.json": JSON.stringify(legacy),
    });
    const idx = await p2.requireAdapter(WikiTopicIndex).read();

    // Every former topic is an index topic directly under roots; no data lost.
    expect(idx.roots.sort()).toEqual(["alpha", "bravo"]);
    const allLeaves = Object.values(idx.nodes).every(isIndexTopic);
    expect(allLeaves).toBe(true);
    const alpha = idx.nodes.alpha;
    expect(alpha && isIndexTopic(alpha) && alpha.references).toEqual([{ uri: "a.md#alpha" }]);
    const bravo = idx.nodes.bravo;
    expect(bravo && isIndexTopic(bravo) && bravo.references).toEqual([{ uri: "b.md#bravo" }]);
  });

  it("leaves() yields the index topics; get() resolves aliases; roots()/children() traverse", async () => {
    const dag: TopicIndex = {
      generated: "now",
      roots: ["cat-product"],
      nodes: {
        "cat-product": {
          kind: "category",
          key: "cat-product",
          name: "Product",
          description: "grouping",
          childKeys: ["release-planning", "roadmap"],
        },
        "release-planning": {
          kind: "topic",
          key: "release-planning",
          name: "Release planning",
          description: "d",
          references: [{ uri: "a.md#release-planning" }],
          aliases: ["software-release-planning"],
        },
        roadmap: {
          kind: "topic",
          key: "roadmap",
          name: "Roadmap",
          description: "d",
          references: [{ uri: "b.md#roadmap" }],
        },
      },
    };
    await index.write(dag);

    // leaves() = exactly the index topics (sorted), not the category.
    const leafKeys: string[] = [];
    for await (const leaf of index.leaves()) leafKeys.push(leaf.key);
    expect(leafKeys).toEqual(["release-planning", "roadmap"]);

    // get() resolves an absorbed alias to the surviving node.
    expect((await index.get("software-release-planning"))?.key).toBe("release-planning");

    // roots() then children() traverse down to the leaves.
    const roots = await index.roots();
    expect(roots.map((r) => r.key)).toEqual(["cat-product"]);
    expect(roots[0] && isCategory(roots[0])).toBe(true);
    const children = await index.children("cat-product");
    expect(children.map((c) => c.key).sort()).toEqual(["release-planning", "roadmap"]);
  });
});
