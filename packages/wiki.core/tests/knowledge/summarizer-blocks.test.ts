import { describe, expect, it } from "vitest";
import type { LlmApi } from "../../src/index.js";
import { SUMMARIZER_SYSTEM_PROMPT } from "../../src/knowledge/prompts.js";
import {
  buildTree,
  type SectionizeCheckpoint,
  sectionizeDocument,
} from "../../src/knowledge/summarizer.js";
import { findSummaryNode } from "../../src/knowledge/types.js";
import { expectPartition } from "../util/partition.js";

const usage = { inputTokens: 0, outputTokens: 0 };
const cfg = (documentChapterFanout: number) =>
  ({ modelFor: () => "m", documentChapterFanout }) as unknown as Parameters<typeof buildTree>[1];

/** A block-aware sectioning stub: splits each block into a kept head and a (possibly-cut) tail. */
function sectionizeLlm(): { llm: LlmApi; prevSeen: (boolean | undefined)[] } {
  const prevSeen: (boolean | undefined)[] = [];
  const llm = {
    generateObject: async (spec: { input: unknown }) => {
      const input = spec.input as {
        rawLines: [number, string][];
        previousSection?: string;
      };
      prevSeen.push(input.previousSection !== undefined);
      const ls = input.rawLines.map(([n]) => n);
      const s = ls[0] ?? 0;
      const e = ls.at(-1) ?? 0;
      const sections =
        s === e
          ? [
              {
                key: `sec-${s}`,
                title: `T${s}`,
                startLine: s,
                endLine: s,
                summary: `sum ${s}`,
              },
            ]
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
      return {
        output: { title: "Doc", summary: "base", sections } as never,
        usage,
      };
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
            ? [
                {
                  key: "dup",
                  title: "D",
                  startLine: s,
                  endLine: s,
                  summary: "x",
                },
              ]
            : [
                {
                  key: "dup",
                  title: "D",
                  startLine: s,
                  endLine: mid,
                  summary: "x",
                },
                {
                  key: "dup",
                  title: "D",
                  startLine: mid + 1,
                  endLine: e,
                  summary: "x",
                },
              ];
        return {
          output: { title: "Doc", summary: "base", sections } as never,
          usage,
        };
      },
    } as unknown as LlmApi;
    const { sections } = await sectionizeDocument(llm, cfg(8), "sys", "a.md", "0\n1\n2\n3", 4);
    const keys = sections.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length); // all unique
    expect(keys[0]).toBe("dup");
  });
});

describe("sectionizeDocument — checkpoint + resume", () => {
  const text = Array.from({ length: 10 }, (_, i) => `${i}`).join("\n"); // 10 one-char lines

  it("dumps a checkpoint after each block with a strictly-advancing nextStart", async () => {
    const { llm } = sectionizeLlm();
    const checkpoints: SectionizeCheckpoint[] = [];
    await sectionizeDocument(llm, cfg(8), "sys", "a.md", text, 6, {
      onBlock: async (cp) => {
        // The walk mutates one array across blocks; snapshot it.
        checkpoints.push({ ...cp, sections: [...cp.sections] });
      },
    });
    expect(checkpoints.length).toBeGreaterThan(1);
    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1];
      const cur = checkpoints[i];
      if (!prev || !cur) throw new Error("missing checkpoint");
      expect(cur.nextStart).toBeGreaterThan(prev.nextStart);
      expect(cur.sections.length).toBeGreaterThanOrEqual(prev.sections.length);
    }
  });

  it("resumes from a checkpoint and still covers the whole document", async () => {
    const { llm } = sectionizeLlm();
    const checkpoints: SectionizeCheckpoint[] = [];
    await sectionizeDocument(llm, cfg(8), "sys", "a.md", text, 6, {
      onBlock: async (cp) => {
        checkpoints.push({ ...cp, sections: [...cp.sections] });
      },
    });
    const mid = checkpoints[0];
    if (!mid) throw new Error("no checkpoint");

    // Resume from the first checkpoint with a fresh LLM; the result spans the whole document.
    const { llm: llm2 } = sectionizeLlm();
    const resumed = await sectionizeDocument(llm2, cfg(8), "sys", "a.md", text, 6, { resume: mid });
    expect(resumed.sections[0]?.startLine).toBe(0);
    expect(resumed.sections.at(-1)?.endLine).toBe(9);
    // Contiguous, gap-free coverage across the resume boundary.
    for (let i = 1; i < resumed.sections.length; i++) {
      const prev = resumed.sections[i - 1];
      const cur = resumed.sections[i];
      if (!prev || !cur) throw new Error("missing section");
      expect(cur.startLine).toBe(prev.endLine + 1);
    }
  });
});

describe("buildTree — homogeneous summary node tree", () => {
  const sections = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      key: `s${i}`,
      title: `S${i}`,
      startLine: i,
      endLine: i,
      summary: `sum${i}`,
    }));

  it("a single-section document IS its root (no synthetic wrapper, no LLM call)", async () => {
    let calls = 0;
    const llm = {
      generateObject: async () => {
        calls++;
        return { output: {} as never, usage };
      },
    } as unknown as LlmApi;
    const root = await buildTree(llm, cfg(8), "sys", "Doc", "base", sections(1));
    expect(calls).toBe(0);
    expect(root.key).toBe("s0");
    expect(root.children).toBeUndefined();
  });

  it("wraps a small section set directly under the root with no aggregation call", async () => {
    let calls = 0;
    const llm = {
      generateObject: async () => {
        calls++;
        return { output: {} as never, usage };
      },
    } as unknown as LlmApi;
    const root = await buildTree(llm, cfg(8), "sys", "Doc", "base", sections(2));
    expect(calls).toBe(0); // mechanical — no LLM
    expect(root.title).toBe("Doc");
    expect(root.summary).toBe("base");
    expect(root.children?.map((c) => c.key)).toEqual(["s0", "s1"]);
    // Root line range spans its leaves.
    expect(root.startLine).toBe(0);
    expect(root.endLine).toBe(1);
  });

  it("aggregates leaves and re-aggregates into super-nodes past the fan-out", async () => {
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
            memberCount: grp.length,
          });
        }
        return { output: { chapters } as never, usage };
      },
    } as unknown as LlmApi;
    const root = await buildTree(llm, cfg(2), "sys", "Doc", "base", sections(5));
    // 5 leaves → 3 TOC nodes (> fanout 2) → re-aggregated into 2 → wrapped under one root.
    expect(calls).toBe(2);
    expect(root.children).toBeDefined();
    // The root's children are TOC nodes that themselves have children (the leaves/sub-nodes).
    expect(root.children?.[0]?.children).toBeDefined();
  });

  it("groups only contiguous members in document order (run-length, never reorders)", async () => {
    // The model returns run-length counts only — grouping is positional, so reordering is
    // structurally impossible regardless of what the model "intends".
    const llm = {
      generateObject: async (spec: { input: unknown }) => {
        const members = (spec.input as { members: unknown[] }).members;
        const chapters = [];
        for (let i = 0; i < members.length; i += 2) {
          chapters.push({
            title: `Ch${i}`,
            summary: `c${i}`,
            memberCount: Math.min(2, members.length - i),
          });
        }
        return { output: { chapters } as never, usage };
      },
    } as unknown as LlmApi;
    const root = await buildTree(llm, cfg(2), "sys", "Doc", "base", sections(5));
    // DFS: every node's children are strictly ascending by startLine; leaves stay in order.
    const leaves: number[] = [];
    const walk = (n: { startLine: number; children?: { startLine: number }[] }) => {
      const kids = n.children as { startLine: number; children?: never }[] | undefined;
      if (!kids?.length) {
        leaves.push(n.startLine);
        return;
      }
      let prev = -1;
      for (const k of kids) {
        expect(k.startLine).toBeGreaterThan(prev);
        prev = k.startLine;
        walk(k);
      }
    };
    walk(root);
    expect(leaves).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("sectionizeDocument — cut points tile the document", () => {
  const text = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n"); // 30 lines

  /** A stub returning messy cuts: one before the block, a duplicate, one past the block. */
  function messyLlm(): { llm: LlmApi; inputs: { outline: string[]; first: number }[] } {
    const inputs: { outline: string[]; first: number }[] = [];
    const llm = {
      generateObject: async (spec: { input: unknown }) => {
        const input = spec.input as { rawLines: [number, string][]; outline: string[] };
        const s = input.rawLines[0]?.[0] ?? 0;
        inputs.push({ outline: input.outline, first: s });
        const sections = [
          { key: `a-${s}`, title: `A${s}`, startLine: s - 5, summary: "a" },
          { key: `b-${s}`, title: `B${s}`, startLine: s + 2, summary: "b" },
          { key: `dup-${s}`, title: `D${s}`, startLine: s + 2, summary: "dup" },
          { key: `c-${s}`, title: `C${s}`, startLine: s + 4, summary: "c" },
          { key: `z-${s}`, title: `Z${s}`, startLine: s + 500, summary: "z" },
        ];
        return { output: { title: "Doc", summary: "base", sections } as never, usage };
      },
    } as unknown as LlmApi;
    return { llm, inputs };
  }

  it("partitions every line across blocks despite messy cuts", async () => {
    const { llm } = messyLlm();
    const { sections, stats } = await sectionizeDocument(llm, cfg(8), "sys", "a.md", text, 64);
    expectPartition(sections, 0, 29);
    expect(stats.droppedCuts).toBeGreaterThan(0); // the duplicate cut in every block
  });

  it("sends the outline of the sections kept so far with each block", async () => {
    const { llm, inputs } = messyLlm();
    await sectionizeDocument(llm, cfg(8), "sys", "a.md", text, 64);
    expect(inputs.length).toBeGreaterThan(1);
    expect(inputs[0]?.outline).toEqual([]);
    expect(inputs[1]?.outline.length).toBeGreaterThan(0);
    expect(inputs[1]?.outline[0]).toBe("A0");
  });

  it("caps the outline at the last 50 titles", async () => {
    const long = Array.from({ length: 400 }, (_, i) => `${i}`).join("\n");
    const { llm, inputs } = messyLlm();
    await sectionizeDocument(llm, cfg(8), "sys", "a.md", long, 40);
    expect(Math.max(...inputs.map((i) => i.outline.length))).toBe(50);
  });

  it("covers a block for which the model returns no sections", async () => {
    let call = 0;
    const llm = {
      generateObject: async (spec: { input: unknown }) => {
        const s = (spec.input as { rawLines: [number, string][] }).rawLines[0]?.[0] ?? 0;
        call++;
        const sections =
          call === 2
            ? []
            : [
                { key: `a-${s}`, title: `A${s}`, startLine: s, summary: "a" },
                { key: `b-${s}`, title: `B${s}`, startLine: s + 3, summary: "b" },
              ];
        return { output: { title: "Doc", summary: "base", sections } as never, usage };
      },
    } as unknown as LlmApi;
    const { sections, stats } = await sectionizeDocument(llm, cfg(8), "sys", "a.md", text, 64);
    expectPartition(sections, 0, 29);
    expect(stats.emptyBlocks).toBe(1);
  });

  it("rebuilds the outline from a resumed checkpoint and stays contiguous", async () => {
    const first = messyLlm();
    const checkpoints: SectionizeCheckpoint[] = [];
    await sectionizeDocument(first.llm, cfg(8), "sys", "a.md", text, 64, {
      onBlock: async (cp) => {
        checkpoints.push({ ...cp, sections: [...cp.sections] });
      },
    });
    const mid = checkpoints[0];
    if (!mid) throw new Error("no checkpoint");
    const second = messyLlm();
    const { sections } = await sectionizeDocument(second.llm, cfg(8), "sys", "a.md", text, 64, {
      resume: mid,
    });
    expect(second.inputs[0]?.outline).toEqual(mid.sections.map((s) => s.title));
    expectPartition(sections, 0, 29);
  });
});

describe("sectionizeDocument — the model is asked for cut points only", () => {
  it("never asks the model for an endLine or a range", async () => {
    const descriptions: string[] = [];
    const llm = {
      generateObject: async (spec: { description: string; input: unknown }) => {
        descriptions.push(spec.description);
        const s = (spec.input as { rawLines: [number, string][] }).rawLines[0]?.[0] ?? 0;
        const sections = [{ key: `a-${s}`, title: `A${s}`, startLine: s, summary: "a" }];
        return { output: { title: "Doc", summary: "base", sections } as never, usage };
      },
    } as unknown as LlmApi;
    await sectionizeDocument(llm, cfg(8), "sys", "a.md", "0\n1\n2", 64);
    for (const text of [SUMMARIZER_SYSTEM_PROMPT, ...descriptions]) {
      expect(text).not.toMatch(/endLine/);
    }
  });

  it("gives an empty block's fallback section a key distinct from the document root", async () => {
    const text = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    let call = 0;
    const llm = {
      generateObject: async (spec: { input: unknown }) => {
        const s = (spec.input as { rawLines: [number, string][] }).rawLines[0]?.[0] ?? 0;
        call++;
        const sections =
          call === 2
            ? []
            : [
                { key: `a-${s}`, title: `A${s}`, startLine: s, summary: "a" },
                { key: `b-${s}`, title: `B${s}`, startLine: s + 3, summary: "b" },
              ];
        return { output: { title: "Doc", summary: "base", sections } as never, usage };
      },
    } as unknown as LlmApi;
    const { title, baseSummary, sections } = await sectionizeDocument(
      llm,
      cfg(100),
      "sys",
      "a.md",
      text,
      64,
    );
    const fallback = sections.find((s) => s.summary === "");
    if (!fallback) throw new Error("no fallback section");
    const root = await buildTree(llm, cfg(100), "sys", title, baseSummary, sections);
    expect(findSummaryNode(root, fallback.key)).toBe(
      root.children?.find((c) => c.key === fallback.key),
    );
    expect(fallback.key).not.toBe(root.key);
  });
});
