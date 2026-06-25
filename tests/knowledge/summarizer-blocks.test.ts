import { describe, expect, it } from "vitest";
import type { LlmApi } from "../../src/index.js";
import { buildOutline, sectionizeDocument } from "../../src/knowledge/summarizer.js";

const usage = { inputTokens: 0, outputTokens: 0 };
const cfg = (documentChapterFanout: number) =>
  ({ modelFor: () => "m", documentChapterFanout }) as unknown as Parameters<typeof buildOutline>[1];

/** A block-aware sectioning stub: splits each block into a kept head and a (possibly-cut) tail. */
function sectionizeLlm(): { llm: LlmApi; prevSeen: (boolean | undefined)[] } {
  const prevSeen: (boolean | undefined)[] = [];
  const llm = {
    generateObject: async (spec: { input: unknown }) => {
      const input = spec.input as { rawLines: [number, string][]; previousSection?: string };
      prevSeen.push(input.previousSection !== undefined);
      const ls = input.rawLines.map(([n]) => n);
      const s = ls[0] ?? 0;
      const e = ls.at(-1) ?? 0;
      const sections =
        s === e
          ? [{ key: `sec-${s}`, title: `T${s}`, startLine: s, endLine: s, summary: `sum ${s}` }]
          : (() => {
              const mid = Math.floor((s + e) / 2);
              return [
                {
                  key: `sec-${s}`,
                  title: `T${s}`,
                  startLine: s,
                  endLine: mid,
                  summary: `sum ${s}`,
                },
                {
                  key: `sec-${mid + 1}`,
                  title: `T${mid + 1}`,
                  startLine: mid + 1,
                  endLine: e,
                  summary: `sum ${mid + 1}`,
                },
              ];
            })();
      return { output: { title: "Doc", summary: "base", sections } as never, usage };
    },
  } as unknown as LlmApi;
  return { llm, prevSeen };
}

describe("sectionizeDocument — block walk with section-boundary overlap", () => {
  it("walks multiple blocks and assembles gap-free sections covering the whole document", async () => {
    const text = Array.from({ length: 10 }, (_, i) => `${i}`).join("\n"); // 10 one-char lines
    const { llm, prevSeen } = sectionizeLlm();
    const { title, sections } = await sectionizeDocument(llm, cfg(8), "sys", "a.md", text, 6);

    expect(title).toBe("Doc");
    // Contiguous coverage of lines 0..9 with no gap and no overlap in the kept set.
    expect(sections[0]?.startLine).toBe(0);
    expect(sections[sections.length - 1]?.endLine).toBe(9);
    for (let i = 1; i < sections.length; i++) {
      const prev = sections[i - 1];
      const cur = sections[i];
      if (!prev || !cur) throw new Error("missing section");
      expect(cur.startLine).toBe(prev.endLine + 1);
    }
    // More than one block was needed, and rolling context was supplied after the first block.
    expect(prevSeen.length).toBeGreaterThan(1);
    expect(prevSeen[0]).toBe(false);
    expect(prevSeen.slice(1).every((p) => p === true)).toBe(true);
  });

  it("dedupes colliding section keys assembled across blocks", async () => {
    // A stub that always coins key "dup" so the walk produces collisions to dedupe.
    const llm = {
      generateObject: async (spec: { input: unknown }) => {
        const ls = (spec.input as { rawLines: [number, string][] }).rawLines.map(([n]) => n);
        const s = ls[0] ?? 0;
        const e = ls.at(-1) ?? 0;
        const mid = Math.floor((s + e) / 2);
        const sections =
          s === e
            ? [{ key: "dup", title: "D", startLine: s, endLine: s, summary: "x" }]
            : [
                { key: "dup", title: "D", startLine: s, endLine: mid, summary: "x" },
                { key: "dup", title: "D", startLine: mid + 1, endLine: e, summary: "x" },
              ];
        return { output: { title: "Doc", summary: "base", sections } as never, usage };
      },
    } as unknown as LlmApi;
    const { sections } = await sectionizeDocument(llm, cfg(8), "sys", "a.md", "0\n1\n2\n3", 4);
    const keys = sections.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length); // all unique
    expect(keys[0]).toBe("dup");
  });
});

describe("buildOutline — chapter overlay", () => {
  const sections = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      key: `s${i}`,
      title: `S${i}`,
      startLine: i,
      endLine: i,
      summary: `sum${i}`,
      details: `details${i}`,
      tables: [],
    }));

  it("wraps a small section set in one chapter with no aggregation call", async () => {
    let calls = 0;
    const llm = {
      generateObject: async () => {
        calls++;
        return { output: {} as never, usage };
      },
    } as unknown as LlmApi;
    const { outline, summary } = await buildOutline(llm, cfg(8), "sys", "Doc", "base", sections(2));
    expect(calls).toBe(0); // mechanical — no LLM
    expect(outline).toHaveLength(1);
    expect(outline[0]?.sectionKeys).toEqual(["s0", "s1"]);
    expect(summary).toBe("base");
  });

  it("aggregates leaf chapters and re-aggregates into super-chapters past the fan-out", async () => {
    let calls = 0;
    const llm = {
      generateObject: async (spec: { input: unknown }) => {
        calls++;
        const members = (spec.input as { members: { key: string }[] }).members;
        const chapters = [];
        for (let i = 0; i < members.length; i += 2) {
          const grp = members.slice(i, i + 2);
          chapters.push({
            title: `Ch${i}`,
            summary: `csum${i}`,
            memberKeys: grp.map((m) => m.key),
          });
        }
        return { output: { chapters } as never, usage };
      },
    } as unknown as LlmApi;
    const { outline } = await buildOutline(llm, cfg(2), "sys", "Doc", "base", sections(5));
    // 5 sections → 3 leaf chapters (> fanout 2) → re-aggregated into 2 super-chapters.
    expect(calls).toBe(2);
    expect(outline).toHaveLength(2);
    expect(outline[0]?.children).toBeDefined();
    expect(outline[0]?.children?.[0]?.sectionKeys).toBeDefined();
  });
});
