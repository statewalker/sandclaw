import { describe, expect, it } from "vitest";
import { isCategory, isIndexTopic, type TopicIndex } from "../../src/index.js";
import {
  finalizeIndex,
  isAcyclic,
  mergeLeaves,
  promoteLeafToCategory,
  splitCategoryInPlace,
} from "../../src/knowledge/topic-graph.js";

function leaf(key: string, refs: string[] = []): TopicIndex["nodes"][string] {
  return {
    kind: "topic",
    key,
    name: key,
    description: "",
    references: refs.map((uri) => ({ uri })),
  };
}
function category(key: string, childKeys: string[]): TopicIndex["nodes"][string] {
  return { kind: "category", key, name: key, description: "", childKeys };
}

describe("topic-graph mutations", () => {
  it("splits an over-large category so its direct fan-out drops", () => {
    const index: TopicIndex = {
      generated: "",
      roots: ["root"],
      nodes: {
        root: category("root", ["a", "b", "c", "d"]),
        a: leaf("a", ["x#a"]),
        b: leaf("b", ["x#b"]),
        c: leaf("c", ["x#c"]),
        d: leaf("d", ["x#d"]),
      },
    };
    splitCategoryInPlace(index, "root", [
      { name: "Group one", description: "", childKeys: ["a", "b"] },
      { name: "Group two", description: "", childKeys: ["c", "d"] },
    ]);
    finalizeIndex(index);
    const root = index.nodes.root;
    expect(root && isCategory(root) && root.childKeys.length).toBe(2);
    expect(isAcyclic(index)).toBe(true);
    // The four leaves still live under the two new sub-categories.
    const leafKeys = Object.values(index.nodes)
      .filter(isIndexTopic)
      .map((n) => n.key)
      .sort();
    expect(leafKeys).toEqual(["a", "b", "c", "d"]);
  });

  it("promotes an over-large index topic to a category partitioning its references", () => {
    const index: TopicIndex = {
      generated: "",
      roots: ["big"],
      nodes: { big: leaf("big", ["u0#k", "u1#k", "u2#k", "u3#k"]) },
    };
    promoteLeafToCategory(index, "big", [
      { name: "Sub a", description: "", refUris: ["u0#k", "u1#k"] },
      { name: "Sub b", description: "", refUris: ["u2#k", "u3#k"] },
    ]);
    finalizeIndex(index);
    const big = index.nodes.big;
    expect(big && isCategory(big)).toBe(true);
    const children = (big && isCategory(big) ? big.childKeys : []).map((k) => index.nodes[k]);
    const partitioned = children.flatMap((n) =>
      n && isIndexTopic(n) ? n.references.map((r) => r.uri) : [],
    );
    expect(partitioned.sort()).toEqual(["u0#k", "u1#k", "u2#k", "u3#k"]);
    expect(isAcyclic(index)).toBe(true);
  });

  it("declines to promote when no sub-themes are offered (node stays oversized)", () => {
    const index: TopicIndex = {
      generated: "",
      roots: ["big"],
      nodes: { big: leaf("big", ["u0#k", "u1#k"]) },
    };
    promoteLeafToCategory(index, "big", []);
    expect(index.nodes.big && isIndexTopic(index.nodes.big)).toBe(true);
  });

  it("merges same-class leaves: canonical name, unioned refs, unioned parents, alias kept", () => {
    const index: TopicIndex = {
      generated: "",
      roots: ["cat-a", "cat-b"],
      nodes: {
        "cat-a": category("cat-a", ["x"]),
        "cat-b": category("cat-b", ["y"]),
        x: leaf("x", ["d1#x"]),
        y: leaf("y", ["d2#y"]),
      },
    };
    const survivor = mergeLeaves(index, "x", ["y"], "Canonical", "merged");
    expect(survivor?.name).toBe("Canonical");
    // y is absorbed (gone) and recorded as an alias of the survivor.
    expect(index.nodes.y).toBeUndefined();
    expect(survivor?.aliases).toContain("y");
    // Unioned references.
    expect(survivor?.references.map((r) => r.uri).sort()).toEqual(["d1#x", "d2#y"]);
    // Unioned parents: both categories now point at the survivor.
    const a = index.nodes["cat-a"];
    const b = index.nodes["cat-b"];
    expect(a && isCategory(a) && a.childKeys).toEqual(["x"]);
    expect(b && isCategory(b) && b.childKeys).toEqual(["x"]);
    expect(isAcyclic(index)).toBe(true);
  });

  it("finalize prunes zero-reference leaves and childless categories, recomputing roots", () => {
    const index: TopicIndex = {
      generated: "",
      roots: ["root"],
      nodes: {
        root: category("root", ["empty", "kept"]),
        empty: leaf("empty", []),
        kept: leaf("kept", ["d#kept"]),
        orphanCat: category("orphanCat", ["empty"]),
      },
    };
    finalizeIndex(index);
    expect(index.nodes.empty).toBeUndefined();
    expect(index.nodes.orphanCat).toBeUndefined(); // childless after empty pruned
    expect(index.roots).toEqual(["root"]);
  });
});
