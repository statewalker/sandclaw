import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import {
  ProjectBuilder,
  type Resource,
  SOURCES_SIGNAL,
  Workspace,
} from "@statewalker/workspace.core";
import { beforeEach, describe, expect, it } from "vitest";
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
  "b.md": [{ blockId: "main", text: "charlie main content", embedding: vec("charlie") }],
};

const blocks = async (_resource: Resource, uri: string): Promise<SearchBlock[]> =>
  SECTIONS[uri] ?? [];

function newRepository() {
  const filesApi = new MemFilesApi({ initialFiles: { "proj/a.md": "# A", "proj/b.md": "# B" } });
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
    builder.registerBuilder(searchBuilder({ inputSignal: SOURCES_SIGNAL }));
    for await (const _ of builder.run()) {
      // drain
    }
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
      (await search.search({ query: "zzz", ftsQueries: ["charlie"], modes: ["fts"] })).find(
        (r) => r.uri === "b.md",
      ),
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
    for await (const info of filesApi.list("proj/.project/index/search", { recursive: true })) {
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
      { blockId: "extra", text: "delta freshly added", embedding: vec("delta") },
    ];
    await writer.indexPage(newResource, "a.md");
    await writer.persist();

    // Without the rev-based reload the reader's memoised index would miss "delta".
    const hits = await readerAdapter.search({ query: "delta", modes: ["fts"] });
    expect(hits.find((r) => r.uri === "a.md")).toBeDefined();
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
