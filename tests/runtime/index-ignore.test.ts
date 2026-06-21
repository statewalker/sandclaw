import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { buildIndexIgnore } from "../../src/index.js";

async function matcher(files: Record<string, string>): Promise<(uri: string) => boolean> {
  const filesApi = new MemFilesApi({ initialFiles: files });
  return buildIndexIgnore(filesApi, "proj");
}

describe("buildIndexIgnore", () => {
  it("excludes a directory listed in .indexignore", async () => {
    const isIgnored = await matcher({
      "proj/.indexignore": "drafts/\n",
      "proj/drafts/x.md": "x",
      "proj/keep.md": "k",
    });
    expect(isIgnored("drafts/x.md")).toBe(true);
    expect(isIgnored("keep.md")).toBe(false);
  });

  it("honours negation (last match wins within a file)", async () => {
    const isIgnored = await matcher({
      "proj/.indexignore": "*.tmp\n!keep.tmp\n",
      "proj/a.tmp": "a",
      "proj/keep.tmp": "k",
    });
    expect(isIgnored("a.tmp")).toBe(true);
    expect(isIgnored("keep.tmp")).toBe(false);
  });

  it("scopes a nested .indexignore to its own subtree", async () => {
    const isIgnored = await matcher({
      "proj/sub/.indexignore": "notes/\n",
      "proj/sub/notes/a.md": "a",
      "proj/notes/b.md": "b",
    });
    expect(isIgnored("sub/notes/a.md")).toBe(true);
    expect(isIgnored("notes/b.md")).toBe(false);
  });

  it("always excludes the implicit .project/tocs/sites defaults", async () => {
    const isIgnored = await matcher({ "proj/page.md": "p" });
    expect(isIgnored(".project/index/search.json")).toBe(true);
    expect(isIgnored("tocs/overview.md")).toBe(true);
    expect(isIgnored("sites/blog/post.md")).toBe(true);
    expect(isIgnored("page.md")).toBe(false);
  });

  it("cannot re-include an implicit default via negation", async () => {
    const isIgnored = await matcher({
      "proj/.indexignore": "!sites/keep.md\n",
      "proj/sites/keep.md": "k",
    });
    expect(isIgnored("sites/keep.md")).toBe(true);
  });
});
