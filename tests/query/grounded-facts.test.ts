import { describe, expect, it } from "vitest";
import { filterGroundedFacts } from "../../src/query/fsm/retrieval.js";

/** Section ref → its document uri, for two documents a/b. */
const refToUri = new Map<string, string>([
  ["/a.md#intro", "a.md"],
  ["/a.md#founders", "a.md"],
  ["/b.md#intro", "b.md"],
]);

describe("filterGroundedFacts — single-document grounding", () => {
  it("drops a fact with no batch-resolvable citation", () => {
    const out = filterGroundedFacts(
      [{ statement: "ungrounded", citations: ["/c.md#nope"] }],
      refToUri,
    );
    expect(out).toEqual([]);
  });

  it("drops a fact whose citations span two documents (no conflation)", () => {
    const out = filterGroundedFacts(
      [{ statement: "blended", citations: ["/a.md#intro", "/b.md#intro"] }],
      refToUri,
    );
    expect(out).toEqual([]);
  });

  it("keeps a fact corroborated by two sections of the SAME document", () => {
    const out = filterGroundedFacts(
      [{ statement: "same doc", citations: ["/a.md#intro", "/a.md#founders"] }],
      refToUri,
    );
    expect(out).toEqual([{ statement: "same doc", citations: ["/a.md#intro", "/a.md#founders"] }]);
  });

  it("strips out-of-batch citations but keeps the fact when a valid same-doc citation remains", () => {
    const out = filterGroundedFacts(
      [{ statement: "partial", citations: ["/a.md#intro", "/c.md#nope"] }],
      refToUri,
    );
    expect(out).toEqual([{ statement: "partial", citations: ["/a.md#intro"] }]);
  });
});
