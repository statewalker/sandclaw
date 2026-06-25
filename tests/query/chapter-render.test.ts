import { describe, expect, it } from "vitest";
import type { ChapterNode, DetailTable } from "../../src/index.js";
import {
  renderDocumentBlock,
  renderSectionTables,
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
  const section = (ref: string) => ({ ref, title: ref, description: "d", details: "facts" });

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

describe("renderDocumentBlock — details + tables evidence", () => {
  it("renders a <details> block, and a <tables> block when present", () => {
    const out = renderDocumentBlock({
      title: "Doc",
      summary: "ds",
      chapters: [
        {
          title: "Doc",
          summary: "ds",
          sections: [
            {
              ref: "/a.md#s0",
              title: "t",
              description: "d",
              details: "Acme makes widgets.",
              tables: "#### Cap\n| A |\n| --- |\n| 1 |",
            },
          ],
        },
      ],
    });
    expect(out).toContain("<details>\nAcme makes widgets.\n</details>");
    expect(out).toContain("<tables>\n#### Cap");
  });

  it("omits <tables> when the section has none", () => {
    const out = renderDocumentBlock({
      title: "Doc",
      summary: "ds",
      chapters: [
        {
          title: "Doc",
          summary: "ds",
          sections: [{ ref: "/a.md#s0", title: "t", description: "d", details: "facts" }],
        },
      ],
    });
    expect(out).toContain("<details>\nfacts\n</details>");
    expect(out).not.toContain("<tables>");
  });
});

describe("renderSectionTables", () => {
  it("renders each table as a captioned GitHub-flavoured markdown table", () => {
    const tables: DetailTable[] = [
      {
        caption: "Quarterly returns",
        columns: ["Fund", "Return", "Currency"],
        rows: [
          ["Innovators Fund One", "6.8%", "GBP"],
          ["Another Fund", "5.2%", "USD"],
        ],
      },
    ];
    const out = renderSectionTables(tables);
    expect(out).toContain("#### Quarterly returns");
    expect(out).toContain("| Fund | Return | Currency |");
    expect(out).toContain("| --- | --- | --- |");
    expect(out).toContain("| Innovators Fund One | 6.8% | GBP |");
  });
});
