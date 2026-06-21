import { describe, expect, it } from "vitest";
import { resolveWikiMasks, type WikiResources } from "../../src/tools/path-masks.js";

const WIKIS: WikiResources[] = [
  { name: "a", resources: ["docs/intro.md", "docs/api/ref.md", "notes/todo.md"] },
  { name: "b", resources: ["docs/guide.md", "readme.md"] },
];

/** Sort targets + their paths for order-insensitive comparison. */
function norm(targets: { project: string; paths: string[] }[]) {
  return targets
    .map((t) => ({ project: t.project, paths: [...t.paths].sort() }))
    .sort((x, y) => x.project.localeCompare(y.project));
}

describe("resolveWikiMasks", () => {
  it("targets every wiki (whole) when masks are empty", () => {
    expect(norm(resolveWikiMasks([], WIKIS))).toEqual([
      { project: "a", paths: [] },
      { project: "b", paths: [] },
    ]);
    expect(norm(resolveWikiMasks(undefined, WIKIS))).toEqual([
      { project: "a", paths: [] },
      { project: "b", paths: [] },
    ]);
  });

  it("a no-slash mask matches project names only (whole wiki)", () => {
    expect(norm(resolveWikiMasks(["a"], WIKIS))).toEqual([{ project: "a", paths: [] }]);
  });

  it("expands the inner glob against each matched wiki's resources", () => {
    expect(norm(resolveWikiMasks(["*/docs/*"], WIKIS))).toEqual([
      { project: "a", paths: ["docs/intro.md"] },
      { project: "b", paths: ["docs/guide.md"] },
    ]);
  });

  it("`**` crosses path segments", () => {
    expect(norm(resolveWikiMasks(["a/docs/**"], WIKIS))).toEqual([
      { project: "a", paths: ["docs/api/ref.md", "docs/intro.md"] },
    ]);
  });

  it("omits a wiki whose relpath glob matches no resource", () => {
    // `b` has no `notes/` resources → it contributes nothing.
    expect(norm(resolveWikiMasks(["*/notes/*"], WIKIS))).toEqual([
      { project: "a", paths: ["notes/todo.md"] },
    ]);
  });

  it("a whole-wiki mask wins over a restricted one for the same wiki", () => {
    expect(norm(resolveWikiMasks(["a", "a/docs/*"], WIKIS))).toEqual([{ project: "a", paths: [] }]);
  });
});
