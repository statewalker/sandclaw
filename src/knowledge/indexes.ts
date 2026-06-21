import type { FilesApi } from "@statewalker/webrun-files";
import { type Project, ProjectAdapter } from "@statewalker/workspace.core";
import { tryReadJson, writeJsonAtomic } from "../util/io.js";
import { projectIndexPath } from "./page-paths.js";
import { childrenOf, getNode, leavesOf, migrateIndex, rootsOf } from "./topic-graph.js";
import type {
  ExistingClass,
  GlobalOutlier,
  OutlierIndex,
  TopicIndex,
  TopicIndexNode,
  TopicNode,
} from "./types.js";

function filesApiOf(adapter: { filesApi: FilesApi }): FilesApi {
  return adapter.filesApi;
}

/**
 * Project-level read/write of the global topic index (`index/topics.json`), a
 * bounded-fan-out DAG of categories over index topics. `read()` lazily migrates a
 * legacy flat `{ topics: [] }` artifact into the DAG shape. The flat `leaves()`
 * view yields exactly the index topics so retrieval/CLI stay unchanged;
 * `roots()`/`children()` expose the category hierarchy; `get()` resolves aliases.
 */
export class WikiTopicIndex extends ProjectAdapter {
  private artifactPath(): string {
    return projectIndexPath(this.project.root, "topics.json");
  }

  async read(): Promise<TopicIndex> {
    return migrateIndex(await tryReadJson<unknown>(filesApiOf(this), this.artifactPath()));
  }

  /** The index topics (leaves) as a flat iterable — the former flat topic list. */
  async *leaves(): AsyncIterable<TopicIndexNode> {
    yield* leavesOf(await this.read());
  }

  /** Resolve a key (or absorbed alias) to its surviving node. */
  async get(key: string): Promise<TopicNode | undefined> {
    return getNode(await this.read(), key);
  }

  /** The top-level nodes (categories and/or bare index topics). */
  async roots(): Promise<TopicNode[]> {
    return rootsOf(await this.read());
  }

  /** The direct child nodes of a category key. */
  async children(key: string): Promise<TopicNode[]> {
    return childrenOf(await this.read(), key);
  }

  async write(index: TopicIndex): Promise<void> {
    await writeJsonAtomic(filesApiOf(this), this.artifactPath(), index);
  }
}

/** Project-level read/write of the global outlier index (`index/outliers.json`). */
export class WikiOutlierIndex extends ProjectAdapter {
  private artifactPath(): string {
    return projectIndexPath(this.project.root, "outliers.json");
  }

  async read(): Promise<OutlierIndex> {
    return (
      (await tryReadJson<OutlierIndex>(filesApiOf(this), this.artifactPath())) ?? {
        generated: "",
        outliers: [],
      }
    );
  }

  async *list(): AsyncIterable<GlobalOutlier> {
    for (const o of (await this.read()).outliers) yield o;
  }

  async get(key: string): Promise<GlobalOutlier | undefined> {
    return (await this.read()).outliers.find((o) => o.key === key);
  }

  async write(index: OutlierIndex): Promise<void> {
    await writeJsonAtomic(filesApiOf(this), this.artifactPath(), index);
  }
}

/** Collect every already-coined class from the global indexes (for meta reuse). */
export async function collectExistingClasses(project: Project): Promise<ExistingClass[]> {
  const out: ExistingClass[] = [];
  for await (const t of project.requireAdapter(WikiTopicIndex).leaves()) {
    out.push({ kind: "topic", key: t.key, name: t.name, description: t.description });
  }
  for await (const o of project.requireAdapter(WikiOutlierIndex).list()) {
    out.push({ kind: "outlier", key: o.key, name: o.name, description: o.description });
  }
  return out;
}
