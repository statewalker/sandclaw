import { describe, expect, it } from "vitest";
import type { ChapterNode } from "../../src/index.js";
import { renderDocumentBlock, sectionChapters } from "../../src/query/fsm/retrieval.js";

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
