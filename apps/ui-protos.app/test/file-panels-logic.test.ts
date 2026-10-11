import { MountUnavailable } from "@statewalker/file-mounts.core";
import { readText } from "@statewalker/webrun-files";
import { describe, expect, it } from "vitest";
import { newDemoStorages } from "../src/file-panels/demo-storages.js";
import { clickSelect, sortEntries } from "../src/file-panels/paths.js";

const names = async (files: import("@statewalker/webrun-files").FilesApi, path: string) => {
  const out: string[] = [];
  for await (const e of files.list(path)) out.push(e.name);
  return out;
};

describe("demo storages", () => {
  it("lists the mounts at the root and reads through them", async () => {
    const { files, mounts } = newDemoStorages();
    expect(mounts.map((m) => m.key)).toEqual(["documents", "browser", "archive", "photos"]);
    expect(await names(files, "/")).toEqual(["archive", "browser", "documents", "photos"]);
    expect(await readText(files, "/documents/notes/todo.md")).toContain("# Todo");
  });

  it("an unavailable mount throws MountUnavailable instead of listing nothing", async () => {
    const { files } = newDemoStorages({
      unavailable: {
        archive: { cause: "locked", message: "Locked: unlock to use the S3 storages." },
      },
    });
    await expect(names(files, "/archive")).rejects.toBeInstanceOf(MountUnavailable);
  });
});

describe("sorting and selection", () => {
  const f = (name: string, size = 0, lastModified = 0) => ({
    kind: "file" as const,
    name,
    path: `/${name}`,
    size,
    lastModified,
  });
  const d = (name: string) => ({ kind: "directory" as const, name, path: `/${name}` });

  it("puts folders first and sorts numbers naturally", () => {
    const out = sortEntries([f("file10"), d("z"), f("file2"), d("a")], {
      field: "name",
      descending: false,
    });
    expect(out.map((e) => e.name)).toEqual(["a", "z", "file2", "file10"]);
  });

  it("sorts by size descending, folders still first", () => {
    const out = sortEntries([f("s", 1), d("x"), f("b", 9)], { field: "size", descending: true });
    expect(out.map((e) => e.name)).toEqual(["x", "b", "s"]);
  });

  it("click selects one, ctrl toggles, shift extends from the anchor", () => {
    const order = ["/a", "/b", "/c", "/d"];
    let s = clickSelect([], undefined, order, "/b", { shift: false, ctrl: false });
    expect(s.selected).toEqual(["/b"]);
    s = clickSelect(s.selected, s.anchor, order, "/d", { shift: true, ctrl: false });
    expect(s.selected).toEqual(["/b", "/c", "/d"]);
    s = clickSelect(s.selected, s.anchor, order, "/c", { shift: false, ctrl: true });
    expect(s.selected).toEqual(["/b", "/d"]);
  });
});
