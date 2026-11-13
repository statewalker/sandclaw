import type { EmbedFn } from "@statewalker/indexer-api";
import type { FilesApi } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { Workspace } from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type DocumentMetaOutput,
  type LlmApi,
  ResourceTextContentCache,
  registerWiki,
  restartWikiFrom,
  SearchAdapter,
  WikiPageEmbeddings,
  WikiPageMeta,
  WikiPageSummary,
  WikiTopicIndex,
  wikiNatureOf,
  wireWikiProject,
} from "../../src/index.js";
import { ScanLock } from "../../src/runtime/scan-lock.js";
import { makeStubLlm, seedWikiConfig } from "../util/stub-llm.js";

const DIM = 2;
const embed: EmbedFn = async (text) => {
  const v = new Float32Array(DIM);
  v[0] = text.length % 2;
  v[1] = text.length % 3;
  return v;
};

/** Tracks LLM calls and derives outputs from the input so freshness is observable. */
function tracker() {
  const calls: { name: string; uri?: string }[] = [];
  // Per-uri topic key, mutable so a test can drop a topic on re-ingest.
  const topicByUri = new Map<string, string>();
  // Documents whose summarization throws (an unparseable / poisoned source).
  const failSummarize = new Set<string>();
  // While set, summarization waits for it (to hold a run in progress).
  const gate: { hold?: Promise<void> } = {};
  const generateObject: LlmApi["generateObject"] = async (spec) => {
    const input = spec.input as { uri?: string; rawLines?: [number, string][] };
    calls.push({ name: spec.name, uri: input.uri });
    if (spec.name === "summarize-document" && gate.hold) await gate.hold;
    if (spec.name === "summarize-document" && failSummarize.has(input.uri ?? "")) {
      throw new Error(`cannot summarize ${input.uri}`);
    }
    const out = (o: unknown) => ({
      output: o as never,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    switch (spec.name) {
      case "summarize-document": {
        // Title echoes the FIRST raw line so a stale cache is detectable. A single-section
        // document makes the root node the section itself, so the leaf carries that title.
        const firstLine = input.rawLines?.[0]?.[1] ?? "";
        return out({
          title: firstLine,
          summary: firstLine,
          sections: [
            {
              key: "s",
              title: firstLine,
              startLine: 0,
              endLine: 0,
              summary: firstLine,
            },
          ],
        });
      }
      case "extract-tables":
        return out({ tables: [] });
      case "extract-document-meta": {
        const uri = input.uri ?? "";
        const key = topicByUri.get(uri);
        const meta: DocumentMetaOutput = key
          ? {
              topics: [
                {
                  key,
                  name: key,
                  description: "d",
                  sectionKeys: ["s"],
                  brief: "b",
                },
              ],
              outliers: [],
            }
          : { topics: [], outliers: [] };
        return out(meta);
      }
      case "extract-document-graph":
        return out({
          sections: [{ sectionKey: "s", entities: [], statements: [], relations: [] }],
        });
      case "attribute-topics":
        // No semantic attach — the backstop coins each leftover by its own key,
        // preserving the mechanical exact-key behaviour.
        return out({ actions: [] });
      case "split-category":
        return out({ subcategories: [] });
      case "refine-topic":
        return out({ subthemes: [] });
      case "merge-topics":
        return out({ merges: [] });
      case "name-category":
        return out({ name: "Cat", description: "d" });
      default:
        throw new Error(`unexpected ${spec.name}`);
    }
  };
  const llm = makeStubLlm({ generateObject, embed });
  return { llm, calls, topicByUri, failSummarize, gate };
}

async function writeFile(filesApi: FilesApi, path: string, text: string): Promise<void> {
  await filesApi.write(
    path,
    (async function* () {
      yield new TextEncoder().encode(text);
    })(),
  );
}

describe("wiki builders — incremental behaviour", () => {
  let filesApi: MemFilesApi;
  let repository: Workspace;
  let t: ReturnType<typeof tracker>;

  beforeEach(() => {
    filesApi = new MemFilesApi({
      initialFiles: { "proj/a.md": "Acme.", "proj/b.md": "Bravo." },
    });
    repository = new Workspace().setFileSystem(filesApi);
    t = tracker();
    t.topicByUri.set("a.md", "alpha");
    t.topicByUri.set("b.md", "bravo");
    registerWiki(repository, { llm: t.llm });
  });

  async function openProject() {
    const workspace = repository;
    const project = await workspace.getProject("proj", true);
    if (!project) throw new Error("no project");
    await seedWikiConfig(project, {
      models: { default: "fx-model" },
      embedModel: "fx",
      dimensionality: DIM,
    });
    return project;
  }

  async function scan(project: Awaited<ReturnType<typeof openProject>>) {
    const builder = wireWikiProject(project);
    await builder.run();
    return builder;
  }

  it("re-summarizes ONLY the changed page, with fresh content", async () => {
    const project = await openProject();
    await scan(project);
    expect(
      t.calls
        .filter((c) => c.name === "summarize-document")
        .map((c) => c.uri)
        .sort(),
    ).toEqual(["a.md", "b.md"]);

    // Change a.md only.
    t.calls.length = 0;
    await writeFile(filesApi, "proj/a.md", "Globex.");
    await scan(project);

    const summarized = t.calls.filter((c) => c.name === "summarize-document").map((c) => c.uri);
    expect(summarized).toEqual(["a.md"]); // b.md untouched

    // The new summary reflects the NEW content (cache was refreshed, not stale).
    const resource = await project.getProjectResource("a.md");
    const summary = await resource?.requireAdapter(WikiPageSummary).get();
    expect(summary?.title).toBe("Globex.");
  });

  it("is a no-op when nothing changed", async () => {
    const project = await openProject();
    await scan(project);
    t.calls.length = 0;
    await scan(project);
    expect(t.calls).toEqual([]);
  });

  it("removing a source prunes its page artifacts and global topic reference", async () => {
    const project = await openProject();
    await scan(project);
    expect(
      (
        (await project.requireAdapter(WikiTopicIndex).get("bravo")) as
          | { references: { uri: string }[] }
          | undefined
      )?.references.map((r) => r.uri),
    ).toEqual(["b.md#bravo"]);
    const search = project.requireAdapter(SearchAdapter);
    const hits = async () =>
      (await search.search({ query: "Bravo", modes: ["fts"] })).map((m) => m.uri);
    expect(await hits()).toContain("b.md");

    await filesApi.remove("proj/b.md");
    await scan(project);
    // The removal retracted the page's chain, so the search indexer dropped it.
    expect(await hits()).not.toContain("b.md");

    // Page artifacts gone, and the topic the source contributed is pruned.
    const resource = await project.getProjectResource("b.md");
    expect(await resource?.requireAdapter(WikiPageSummary).get()).toBeUndefined();
    expect(await resource?.requireAdapter(WikiPageMeta).get()).toBeUndefined();
    expect(await project.requireAdapter(WikiTopicIndex).get("bravo")).toBeUndefined();
  });

  it("prunes a newly-.indexignore'd source and re-indexes it when un-ignored", async () => {
    const project = await openProject();
    await scan(project);
    expect(await project.requireAdapter(WikiTopicIndex).get("bravo")).toBeDefined();

    // Ignore b.md: the next scan drops it from the source set → pruned like a deletion.
    await writeFile(filesApi, "proj/.indexignore", "b.md\n");
    await scan(project);
    const resource = await project.getProjectResource("b.md");
    expect(await resource?.requireAdapter(WikiPageSummary).get()).toBeUndefined();
    expect(await project.requireAdapter(WikiTopicIndex).get("bravo")).toBeUndefined();

    // Un-ignore: b.md re-enters the source set and is re-indexed.
    await writeFile(filesApi, "proj/.indexignore", "");
    await scan(project);
    expect((await resource?.requireAdapter(WikiPageSummary).get())?.title).toBe("Bravo.");
    expect(await project.requireAdapter(WikiTopicIndex).get("bravo")).toBeDefined();
  });

  it("dropping a topic on re-ingest updates the global topic index", async () => {
    const project = await openProject();
    await scan(project);
    expect(await project.requireAdapter(WikiTopicIndex).get("alpha")).toBeDefined();

    // a.md no longer declares the 'alpha' topic; force re-ingest by changing content.
    t.topicByUri.delete("a.md");
    await writeFile(filesApi, "proj/a.md", "Acme v2.");
    await scan(project);

    expect(await project.requireAdapter(WikiTopicIndex).get("alpha")).toBeUndefined();
  });

  it("restartFrom('Summarizer') re-triggers but hash-skips unchanged pages (no LLM)", async () => {
    const project = await openProject();
    await scan(project);

    const builder = wireWikiProject(project);
    await builder.restartFrom("Summarizer");
    t.calls.length = 0;
    await builder.run();
    // Re-triggered, but the source hash is unchanged → the summarizer does no work.
    expect(t.calls.filter((c) => c.name === "summarize-document")).toEqual([]);
  });

  it("invalidating Summarizer rebuilds a deleted downstream artifact without LLM (restart + downstream)", async () => {
    const project = await openProject();
    await scan(project);
    const resource = await project.getProjectResource("a.md");
    // The Embedder produced embeddings during the scan: JSON metadata + the Arrow
    // sidecar, decoded back into per-section Float32Array vectors.
    expect(await resource?.requireAdapter(WikiPageEmbeddings).getMeta("fx", DIM)).toBeDefined();
    const vectors = await resource?.requireAdapter(WikiPageEmbeddings).getVectors("fx", DIM);
    expect(vectors?.get("s")).toBeInstanceOf(Float32Array);
    expect(vectors?.get("s")?.length).toBe(DIM);

    // Delete the embeddings artifact, then invalidate Summarizer (+ downstream).
    await filesApi.remove("proj/.project/pages/a.md/embeddings.fx.2.json");
    const builder = wireWikiProject(project);
    expect(await restartWikiFrom(builder, "Summarizer")).toContain("Embedder");
    t.calls.length = 0;
    await builder.run();

    // No LLM: summaries/meta are fresh and hash-skip. But the downstream Embedder is
    // restarted too, so it re-runs and recreates the deleted embeddings.
    expect(t.calls.filter((c) => c.name === "summarize-document")).toEqual([]);
    expect(t.calls.filter((c) => c.name === "extract-document-meta")).toEqual([]);
    expect(await resource?.requireAdapter(WikiPageEmbeddings).getMeta("fx", DIM)).toBeDefined();
  });

  it("force re-derives every page even when the source hash is unchanged", async () => {
    const project = await openProject();
    await scan(project);

    const builder = wireWikiProject(project, { force: true });
    await builder.restartFrom("Summarizer");
    t.calls.length = 0;
    await builder.run();
    expect(
      t.calls
        .filter((c) => c.name === "summarize-document")
        .map((c) => c.uri)
        .sort(),
    ).toEqual(["a.md", "b.md"]);
  });

  it("skips re-summarization when content is unchanged despite a new mtime (hash-gated)", async () => {
    const project = await openProject();
    await scan(project);
    t.calls.length = 0;
    // Rewrite a.md with IDENTICAL content → new mtime, same source hash.
    await writeFile(filesApi, "proj/a.md", "Acme.");
    await scan(project);
    expect(t.calls.filter((c) => c.name === "summarize-document")).toEqual([]);
  });

  it("a failing document is reported, keeps the rest building, and is retried only on change", async () => {
    const project = await openProject();
    t.failSummarize.add("b.md");
    const scan = wikiNatureOf(project).scan();
    const first = await scan.run();
    expect(first?.failures.map((f) => [f.builder, f.key])).toEqual([["Summarizer", "b.md"]]);
    // a.md went through the whole pipeline regardless.
    expect(await project.requireAdapter(WikiTopicIndex).get("alpha")).toBeDefined();
    expect(await project.requireAdapter(WikiTopicIndex).get("bravo")).toBeUndefined();

    // Not retried while its source is unchanged (an LLM step would fail the same way).
    t.calls.length = 0;
    const second = await scan.run();
    expect(second?.failures).toHaveLength(1);
    expect(t.calls).toEqual([]);

    // An explicit retry runs it again (and it still fails).
    const retried = await scan.run({ retryFailed: true });
    expect(t.calls.filter((c) => c.name === "summarize-document").map((c) => c.uri)).toContain(
      "b.md",
    );
    expect(retried?.failures).toHaveLength(1);

    // Fixed + changed: retried and indexed.
    t.failSummarize.delete("b.md");
    await writeFile(filesApi, "proj/b.md", "Bravo v2.");
    const third = await scan.run();
    expect(third?.failures).toEqual([]);
    expect(await project.requireAdapter(WikiTopicIndex).get("bravo")).toBeDefined();
  });

  it("alternating writers (tabs/CLI) continue from each other's persisted build state", async () => {
    const project = await openProject();
    const tabA = wikiNatureOf(project).scan();
    await tabA.run();

    // Another writer (a second tab) over the same files indexes a new document.
    const other = new Workspace().setFileSystem(filesApi);
    registerWiki(other, { llm: t.llm });
    const otherProject = await other.getProject("proj");
    if (!otherProject) throw new Error("no project");
    await writeFile(filesApi, "proj/c.md", "Charlie.");
    const tabB = wikiNatureOf(otherProject).scan();
    expect((await tabB.run())?.scanned.changed).toBe(1);

    // Tab A reloads the store when it takes the lease: nothing is left to do.
    const again = await tabA.run();
    expect(again?.scanned.changed).toBe(0);
    expect(again?.executed).toBe(0);
  });

  it("skips scan and restart while another writer holds the lease", async () => {
    const project = await openProject();
    const scan = wikiNatureOf(project).scan();
    const lock = new ScanLock(filesApi, "proj/.project/state/scan.lock", { holderId: "other" });
    expect(await lock.tryAcquire()).toBe(true);
    expect(await scan.run()).toBeUndefined();
    expect(await scan.restartFrom("Embedder")).toBeUndefined();
    await lock.release();
    expect(await scan.restartFrom("Embedder")).toEqual(["Embedder", "SearchIndexer"]);
  });

  it("overlapping operations share the lease; it is released when the last one ends", async () => {
    const project = await openProject();
    const scan = wikiNatureOf(project).scan();
    const lockFile = "proj/.project/state/scan.lock";
    let open = () => {};
    t.gate.hold = new Promise<void>((r) => {
      open = r;
    });
    const running = scan.run();
    while (!t.calls.some((c) => c.name === "summarize-document")) {
      await new Promise((r) => setTimeout(r, 5));
    }
    // A restart while the run works: same holder → shares the lease (not skipped)…
    expect(await scan.restartFrom("Embedder")).toEqual(["Embedder", "SearchIndexer"]);
    // …and finishing first does not release it under the running scan.
    expect(await filesApi.exists(lockFile)).toBe(true);
    t.gate.hold = undefined;
    open();
    expect((await running)?.failures).toEqual([]);
    expect(await filesApi.exists(lockFile)).toBe(false);
  });

  it("stop() before the run has taken the lease still stops it", async () => {
    const project = await openProject();
    const scan = wikiNatureOf(project).scan();
    const running = scan.run();
    scan.stop();
    expect(await running).toBeUndefined();
    expect(t.calls).toEqual([]);
  });

  it("records the source hash in raw.meta.json and stamps it onto the page artifacts", async () => {
    const project = await openProject();
    await scan(project);
    const resource = await project.getProjectResource("a.md");
    if (!resource) throw new Error("no resource");
    const rawMeta = await resource.requireAdapter(ResourceTextContentCache).getRawMeta();
    expect(rawMeta?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await resource.requireAdapter(WikiPageSummary).get())?.sourceHash).toBe(rawMeta?.hash);
    expect((await resource.requireAdapter(WikiPageMeta).get())?.sourceHash).toBe(rawMeta?.hash);
  });
});
