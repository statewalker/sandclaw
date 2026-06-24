import { describe, expect, it } from "vitest";
import {
  buildSearchDocuments,
  renderSearchDocuments,
  type SectionInfo,
} from "../../src/runtime/search-output.js";
import type { DocumentMatch } from "../../src/search/index.js";

const MATCHES: DocumentMatch[] = [
  {
    uri: "a.md",
    sections: [
      { sectionKey: "intro", score: 0.4, modes: ["fts"] },
      { sectionKey: "body", score: 0.9, modes: ["fts", "vector"] },
    ],
  },
  {
    uri: "b.md",
    sections: [{ sectionKey: "main", score: 0.6, modes: ["vector"] }],
  },
];

const INFO = (_uri: string, key: string): SectionInfo => ({
  title: `Title ${key}`,
  summary: `Summary of ${key}`,
  topics: key === "body" ? ["finance", "growth"] : [],
});

describe("buildSearchDocuments", () => {
  it("short: documents carry their matched-section count, ranked by best score", () => {
    const docs = buildSearchDocuments(MATCHES, "short");
    // a.md (best 0.9) ranks above b.md (best 0.6).
    expect(docs.map((d) => d.uri)).toEqual(["a.md", "b.md"]);
    expect(docs[0]).toMatchObject({ uri: "a.md", score: 0.9, sections: 2 });
    expect(docs[1]).toMatchObject({ uri: "b.md", score: 0.6, sections: 1 });
  });

  it("normal: sections carry key + title + score, ordered by score within a document", () => {
    const docs = buildSearchDocuments(MATCHES, "normal", INFO);
    const a = docs.find((d) => d.uri === "a.md");
    const sections = (a as { sections: { sectionKey: string; title: string }[] }).sections;
    expect(sections.map((s) => s.sectionKey)).toEqual(["body", "intro"]);
    expect(sections[0]).toMatchObject({ sectionKey: "body", title: "Title body", score: 0.9 });
    // No summary/topics at normal detail.
    expect(sections[0]).not.toHaveProperty("summary");
    expect(sections[0]).not.toHaveProperty("topics");
  });

  it("full: sections additionally carry summary + topics", () => {
    const docs = buildSearchDocuments(MATCHES, "full", INFO);
    const a = docs.find((d) => d.uri === "a.md");
    const body = (
      a as { sections: { sectionKey: string; summary?: string; topics?: string[] }[] }
    ).sections.find((s) => s.sectionKey === "body");
    expect(body).toMatchObject({
      summary: "Summary of body",
      topics: ["finance", "growth"],
    });
  });

  it("falls back to the section key when no info is supplied", () => {
    const docs = buildSearchDocuments(MATCHES, "normal");
    const sections = (docs[0] as { sections: { title: string }[] }).sections;
    expect(sections[0]?.title).toBe("body");
  });
});

describe("renderSearchDocuments", () => {
  it("short renders one line per document with the section count", () => {
    const lines = renderSearchDocuments(buildSearchDocuments(MATCHES, "short"), "short");
    expect(lines).toEqual(["  a.md  —  2 section(s)", "  b.md  —  1 section(s)"]);
  });

  it("full renders titles, topics and summaries under each document", () => {
    const lines = renderSearchDocuments(buildSearchDocuments(MATCHES, "full", INFO), "full");
    const joined = lines.join("\n");
    expect(joined).toContain("a.md");
    expect(joined).toContain("[0.900] body  Title body");
    expect(joined).toContain("topics: finance, growth");
    expect(joined).toContain("Summary of body");
  });
});
