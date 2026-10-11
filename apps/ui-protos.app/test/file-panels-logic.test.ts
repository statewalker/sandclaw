import { readText } from "@statewalker/webrun-files";
import { describe, expect, it } from "vitest";
import { newDemoStorages } from "../src/file-panels/demo-storages.js";
import { breadcrumb, clickSelect, siblings, sortEntries } from "../src/file-panels/paths.js";
import { MountUnavailable } from "../src/file-panels/problem.js";

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

describe("breadcrumb and siblings", () => {
  const mountNames = { documents: "Documents", archive: "Archive (S3)" };

  it("names the mount first, then one crumb per folder", () => {
    expect(breadcrumb("/documents/clients/dupont", mountNames)).toEqual([
      { name: "Documents", path: "/documents", isMount: true },
      { name: "clients", path: "/documents/clients", isMount: false },
      { name: "dupont", path: "/documents/clients/dupont", isMount: false },
    ]);
    expect(breadcrumb("/", mountNames)).toEqual([]);
  });

  it("lists the folders beside a crumb, and the mounts beside a mount", async () => {
    const { files } = newDemoStorages();
    const dupont = { name: "dupont", path: "/documents/clients/dupont", isMount: false };
    expect(await siblings(files, dupont)).toEqual([
      { name: "dupont", path: "/documents/clients/dupont" },
      { name: "martin", path: "/documents/clients/martin" },
    ]);
    const documents = { name: "Documents", path: "/documents", isMount: true };
    expect((await siblings(files, documents)).map((s) => s.name)).toEqual([
      "archive",
      "browser",
      "documents",
      "photos",
    ]);
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
