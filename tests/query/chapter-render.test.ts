import { describe, expect, it } from "vitest";
import type { ChapterNode, SectionGraph } from "../../src/index.js";
import {
  renderDocumentBlock,
  renderSectionGraph,
  sectionChapters,
} from "../../src/query/fsm/retrieval.js";

describe("sectionChapters — section → parent chapter", () => {
  it("maps section keys to their leaf chapter, including nested sub-chapters", () => {
    const outline: ChapterNode[] = [
      {
        key: "part-1",
        title: "Part 1",
        summary: "p1",
        children: [{ key: "intro", title: "Intro", summary: "i", sectionKeys: ["s0", "s1"] }],
      },
      { key: "body", title: "Body", summary: "b", sectionKeys: ["s2"] },
    ];
    const map = sectionChapters(outline);
    expect(map.get("s0")?.title).toBe("Intro");
    expect(map.get("s1")?.key).toBe("intro");
    expect(map.get("s2")?.title).toBe("Body");
    expect(map.has("s9")).toBe(false);
  });
});

describe("renderDocumentBlock — chapter overlay", () => {
  const section = (ref: string) => ({ ref, title: ref, description: "d", raw: "r" });

  it("wraps sections under chapter headers for a multi-chapter document", () => {
    const out = renderDocumentBlock({
      title: "Doc",
      summary: "ds",
      chapters: [
        { title: "Intro", summary: "isum", sections: [section("/a.md#s0")] },
        { title: "Body", summary: "bsum", sections: [section("/a.md#s2")] },
      ],
    });
    expect(out).toContain('<chapter title="Intro">');
    expect(out).toContain("<chapter_summary>\nisum\n</chapter_summary>");
    expect(out).toContain('<chapter title="Body">');
    expect(out).toContain('<section ref="/a.md#s0">');
  });

  it("skips the chapter wrapper when the only chapter mirrors the document (small-doc case)", () => {
    const out = renderDocumentBlock({
      title: "Doc",
      summary: "ds",
      chapters: [{ title: "Doc", summary: "ds", sections: [section("/a.md#s0")] }],
    });
    expect(out).not.toContain("<chapter ");
    expect(out).toContain('<section ref="/a.md#s0">');
  });
});

describe("renderDocumentBlock — graph vs raw evidence", () => {
  it("renders a <graph> block when the section has a graph (no raw)", () => {
    const out = renderDocumentBlock({
      title: "Doc",
      summary: "ds",
      chapters: [
        {
          title: "Doc",
          summary: "ds",
          sections: [{ ref: "/a.md#s0", title: "t", description: "d", graph: "Entities: Acme" }],
        },
      ],
    });
    expect(out).toContain("<graph>\nEntities: Acme\n</graph>");
    expect(out).not.toContain("<raw_content>");
  });

  it("falls back to <raw_content> when the section has no graph", () => {
    const out = renderDocumentBlock({
      title: "Doc",
      summary: "ds",
      chapters: [
        {
          title: "Doc",
          summary: "ds",
          sections: [{ ref: "/a.md#s0", title: "t", description: "d", raw: "RAW" }],
        },
      ],
    });
    expect(out).toContain("<raw_content>\nRAW\n</raw_content>");
    expect(out).not.toContain("<graph>");
  });
});

describe("renderSectionGraph", () => {
  it("renders entities and statements/relations, with a trailing details object", () => {
    const g: SectionGraph = {
      sectionKey: "s",
      entities: [
        { value: "Fund", type: "fund" },
        { value: "MSCI World Index", type: "index" },
      ],
      statements: [["MSCI World Index", "returns", "28.24%", { year: 2016, currency: "GBP" }]],
      relations: [["Fund", "benchmarked against", "MSCI World Index"]],
    };
    const out = renderSectionGraph(g);
    expect(out).toContain("Entities: Fund (fund); MSCI World Index (index)");
    expect(out).toContain('- MSCI World Index — returns — 28.24% {"year":2016,"currency":"GBP"}');
    expect(out).toContain("Relations:");
    expect(out).toContain("- Fund — benchmarked against — MSCI World Index");
  });
});
