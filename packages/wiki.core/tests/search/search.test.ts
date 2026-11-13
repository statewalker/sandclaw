import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import {
  ProjectBuilder,
  type RegisteredBuilder,
  type Resource,
  SOURCES_COLLECTION,
  Workspace,
} from "@statewalker/workspace.core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerContentExtraction,
  registerSearch,
  SearchAdapter,
  type SearchBlock,
  searchBuilder,
} from "../../src/index.js";

// A tiny deterministic embedder: each block embeds to a one-hot-ish vector keyed
// by which fixture keyword it contains, so vector search is predictable.
const DIM = 4;
const KEYWORDS = ["alpha", "bravo", "charlie", "delta"];
function vec(text: string): Float32Array {
  const v = new Float32Array(DIM);
  KEYWORDS.forEach((k, i) => {
    if (text.toLowerCase().includes(k)) v[i] = 1;
  });
  return v;
}

// Fixture sections per source URI, each with a precomputed embedding (as the
// Embedder stage would have produced).
const SECTIONS: Record<string, SearchBlock[]> = {
  "a.md": [
    { blockId: "intro", text: "alpha alpha intro", embedding: vec("alpha") },
    { blockId: "body", text: "bravo body text", embedding: vec("bravo") },
  ],
  "b.md": [
    {
      blockId: "main",
      text: "charlie main content",
      embedding: vec("charlie"),
    },
  ],
};

const blocks = async (_resource: Resource, uri: string): Promise<SearchBlock[]> =>
  SECTIONS[uri] ?? [];

function newRepository(
  filesApi = new MemFilesApi({
    initialFiles: { "proj/a.md": "# A", "proj/b.md": "# B" },
  }),
) {
  const repository = new Workspace().setFileSystem(filesApi);
  registerContentExtraction(repository);
  registerSearch(repository, {
    embed: async (_project, text) => vec(text),
    model: () => "fixture",
    dimensionality: () => DIM,
    blocks,
  });
  return repository;
}

describe("SearchAdapter", () => {
  let repository: Workspace;

  beforeEach(() => {
    repository = newRepository();
  });

  async function buildAndSearch() {
    const workspace = repository;
    const project = (await workspace.getProject("proj"))!;
    const builder = project.requireAdapter(ProjectBuilder);
    builder.registerBuilder(searchBuilder({ inputSignal: SOURCES_COLLECTION }));
    await builder.run();
    return project.requireAdapter(SearchAdapter);
  }

  it("returns hybrid hits grouped by document with blockId === sectionKey", async () => {
    const search = await buildAndSearch();
    const results = await search.search({ query: "alpha" });
    const a = results.find((r) => r.uri === "a.md");
    expect(a).toBeDefined();
    expect(a?.sections.some((s) => s.sectionKey === "intro")).toBe(true);
  });

  it("records the embedding model and dimensionality in the index config", async () => {
    await buildAndSearch();
    const filesApi = repository.files;
    const cfg = JSON.parse(
      await (async () => {
        let text = "";
        for await (const chunk of filesApi.read("proj/.project/index/search.json")) {
          text += new TextDecoder().decode(chunk);
        }
        return text;
      })(),
    );
    expect(cfg.model).toBe("fixture");
    expect(cfg.dimensionality).toBe(DIM);
  });

  it("restricts to full-text when modes:['fts']", async () => {
    const search = await buildAndSearch();
    const results = await search.search({ query: "charlie", modes: ["fts"] });
    expect(results.find((r) => r.uri === "b.md")).toBeDefined();
  });

  it("tags each section with the sub-indexes that surfaced it", async () => {
    const search = await buildAndSearch();
    const sectionOf = (
      rs: Awaited<ReturnType<SearchAdapter["search"]>>,
      uri: string,
      key: string,
    ) => rs.find((r) => r.uri === uri)?.sections.find((s) => s.sectionKey === key);

    const fts = await search.search({ query: "charlie", modes: ["fts"] });
    expect(sectionOf(fts, "b.md", "main")?.modes).toEqual(["fts"]);

    const vec = await search.search({ query: "charlie", modes: ["vector"] });
    expect(sectionOf(vec, "b.md", "main")?.modes).toEqual(["vector"]);

    // Hybrid: "charlie" matches both the full-text content and the embedding.
    const hybrid = await search.search({ query: "charlie" });
    expect(sectionOf(hybrid, "b.md", "main")?.modes.sort()).toEqual(["fts", "vector"]);
  });

  it("uses the ftsQueries ladder for full-text, not the (semantic) query", async () => {
    const search = await buildAndSearch();
    // `query` alone matches nothing in FTS; the relaxed ladder entry finds the doc.
    expect(
      (await search.search({ query: "zzz", modes: ["fts"] })).find((r) => r.uri === "b.md"),
    ).toBeUndefined();
    expect(
      (
        await search.search({
          query: "zzz",
          ftsQueries: ["charlie"],
          modes: ["fts"],
        })
      ).find((r) => r.uri === "b.md"),
    ).toBeDefined();
    // The ladder unions its entries: a strict + a relaxed query reach both documents.
    const both = await search.search({
      query: "zzz",
      ftsQueries: ["charlie main content", "alpha"],
      modes: ["fts"],
    });
    expect(both.find((r) => r.uri === "a.md")).toBeDefined();
    expect(both.find((r) => r.uri === "b.md")).toBeDefined();
  });

  it("persists the index and loads it on a fresh adapter without rebuilding", async () => {
    await buildAndSearch();
    const filesApi = repository.files;

    // The serialized index lives under index/search/.
    const persisted: string[] = [];
    for await (const info of filesApi.list("proj/.project/index/search", {
      recursive: true,
    })) {
      if (info.kind === "file") persisted.push(info.path);
    }
    expect(persisted.length).toBeGreaterThan(0);

    // A fresh repository over the SAME files searches the loaded index — the block
    // provider throws if touched, proving no query-time rebuild/re-embedding occurs.
    const repo2 = new Workspace().setFileSystem(filesApi);
    registerContentExtraction(repo2);
    registerSearch(repo2, {
      embed: async (_project, text) => vec(text),
      model: () => "fixture",
      dimensionality: () => DIM,
      blocks: async () => {
        throw new Error("block provider must not be called on a loaded index");
      },
    });
    const project2 = (await repo2.getProject("proj"))!;
    const results = await project2.requireAdapter(SearchAdapter).search({ query: "alpha" });
    expect(results.find((r) => r.uri === "a.md")).toBeDefined();
  });

  it("a reader reloads when another writer advances the on-disk index", async () => {
    // Writer indexes into a shared filesystem.
    const writer = await buildAndSearch();
    const filesApi = repository.files;

    // A second adapter over the SAME files models another tab/process; it loads the
    // current index up-front (before the writer adds more).
    const repo2 = new Workspace().setFileSystem(filesApi);
    registerContentExtraction(repo2);
    registerSearch(repo2, {
      embed: async (_p, text) => vec(text),
      model: () => "fixture",
      dimensionality: () => DIM,
      blocks,
    });
    const readerProject = (await repo2.getProject("proj"))!;
    const readerAdapter = readerProject.requireAdapter(SearchAdapter);
    expect(
      (await readerAdapter.search({ query: "charlie", modes: ["fts"] })).length,
    ).toBeGreaterThan(0);

    // The writer indexes a NEW document after the reader already loaded.
    const newResource = (await (await repository.getProject("proj"))?.getProjectResource("a.md"))!;
    SECTIONS["a.md"] = [
      ...(SECTIONS["a.md"] ?? []),
      {
        blockId: "extra",
        text: "delta freshly added",
        embedding: vec("delta"),
      },
    ];
    await writer.indexPage(newResource, "a.md");
    await writer.persist();

    // Without the rev-based reload the reader's memoised index would miss "delta".
    const hits = await readerAdapter.search({ query: "delta", modes: ["fts"] });
    expect(hits.find((r) => r.uri === "a.md")).toBeDefined();
  });
});

async function openProj(workspace: Workspace) {
  const project = await workspace.getProject("proj");
  if (!project) throw new Error("no project");
  return project;
}

describe("SearchIndexer full pass (no saved state)", () => {
  afterEach(() => vi.restoreAllMocks());

  /** Index proj/ in one session, then start a new session over a FRESH build store. */
  async function rebuiltAfterReset(
    filesApi: MemFilesApi,
    between: () => Promise<void>,
    scanBatch?: number,
  ) {
    const first = await openProj(newRepository(filesApi));
    first
      .requireAdapter(ProjectBuilder)
      .registerBuilder(searchBuilder({ inputSignal: SOURCES_COLLECTION }));
    await first.requireAdapter(ProjectBuilder).run();
    await filesApi.remove("proj/.project/state/build");
    await between();
    const project = await openProj(newRepository(filesApi));
    const builder = project.requireAdapter(ProjectBuilder).configureScanBatch(scanBatch);
    builder.registerBuilder(searchBuilder({ inputSignal: SOURCES_COLLECTION }));
    return { project, builder };
  }

  it("drops indexed pages whose source is gone", async () => {
    const filesApi = new MemFilesApi({ initialFiles: { "proj/a.md": "# A", "proj/b.md": "# B" } });
    const { project, builder } = await rebuiltAfterReset(filesApi, () =>
      filesApi.remove("proj/b.md").then(() => undefined),
    );
    await builder.run();
    const search = project.requireAdapter(SearchAdapter);
    expect(await search.indexedPages()).toEqual(["a.md"]);
    expect((await search.search({ query: "charlie", modes: ["fts"] })).map((r) => r.uri)).toEqual(
      [],
    );
  });

  it("keeps pages of a scan batch still to come searchable", async () => {
    const filesApi = new MemFilesApi({ initialFiles: { "proj/a.md": "# A", "proj/b.md": "# B" } });
    const { project, builder } = await rebuiltAfterReset(filesApi, async () => {}, 1);
    const removed = vi.spyOn(SearchAdapter.prototype, "removePage");
    await builder.run();
    expect(removed).not.toHaveBeenCalled();
    expect(await project.requireAdapter(SearchAdapter).indexedPages()).toEqual(["a.md", "b.md"]);
  });

  it("drops a deferred page once it is scanned without reaching the indexer", async () => {
    const filesApi = new MemFilesApi({ initialFiles: { "proj/a.md": "# A", "proj/b.md": "# B" } });
    // A stage in front of the indexer that (in the second session) stops passing b.md on.
    let skip = new Set<string>();
    const filter: RegisteredBuilder = {
      id: "Filter",
      inputs: [SOURCES_COLLECTION],
      outputs: ["listed"],
      async run(ctx) {
        const row = await ctx.get(SOURCES_COLLECTION, ctx.key);
        if (row !== undefined && !skip.has(ctx.key)) ctx.emit("listed", ctx.key, row);
      },
    };
    const session = async (scanBatch?: number) => {
      const project = await openProj(newRepository(filesApi));
      const builder = project.requireAdapter(ProjectBuilder).configureScanBatch(scanBatch);
      builder.registerBuilder(filter);
      builder.registerBuilder(searchBuilder({ inputSignal: "listed" }));
      return { project, builder };
    };
    await (await session()).builder.run();

    // Fresh build store, one source per scan batch: b.md is deferred by the full pass
    // (not scanned yet), then scanned without a `listed` row → removed.
    await filesApi.remove("proj/.project/state/build");
    skip = new Set(["b.md"]);
    const { project, builder } = await session(1);
    await builder.run();
    expect(await project.requireAdapter(SearchAdapter).indexedPages()).toEqual(["a.md"]);
  });
});

describe("SearchAdapter wiki-free contract", () => {
  it("imports no wiki-specific modules", () => {
    const src = readFileSync(
      resolve(import.meta.dirname, "../../src/search/search-adapter.ts"),
      "utf8",
    );
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of imports) {
      expect(spec).not.toMatch(/\/(uri|knowledge|answers)\b/);
    }
    expect(src).not.toMatch(/\bWiki[A-Z]/);
  });
});
