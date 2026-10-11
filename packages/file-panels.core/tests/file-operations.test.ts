import { type FileChange, newFileChanges } from "@statewalker/file-mounts.core";
import { readText, writeText } from "@statewalker/webrun-files";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { FileOperations } from "../src/index.js";

const setup = async () => {
  const files = new MemFilesApi();
  await writeText(files, "/docs/a.md", "A");
  await writeText(files, "/docs/b.md", "B");
  await files.mkdir("/out");
  const changes = newFileChanges();
  const seen: FileChange[][] = [];
  changes.subscribe((c) => seen.push([...c]));
  return { files, ops: new FileOperations(files, changes), seen };
};

describe("FileOperations", () => {
  it("a move reports the new paths as added and the old ones as deleted, in one batch", async () => {
    const { files, ops, seen } = await setup();
    const { result } = await ops.transfer({
      op: "move",
      sources: ["/docs/a.md"],
      targetDir: "/out",
      clash: "skip",
    });
    expect(result.done).toEqual(["/docs/a.md"]);
    expect(await readText(files, "/out/a.md")).toBe("A");
    expect(seen).toEqual([
      [
        { type: "added", path: "/out/a.md" },
        { type: "deleted", path: "/docs/a.md" },
      ],
    ]);
  });

  it("an overwrite is reported as updated; nothing is reported for skipped or failed items", async () => {
    const { ops, seen, files } = await setup();
    await writeText(files, "/out/a.md", "old");
    await ops.transfer({
      op: "copy",
      sources: ["/docs/a.md"],
      targetDir: "/out",
      clash: "overwrite",
    });
    await ops.transfer({
      op: "copy",
      sources: ["/docs/b.md", "/docs/a.md"],
      targetDir: "/out",
      clash: "skip",
    });
    expect(seen).toEqual([
      [{ type: "updated", path: "/out/a.md" }],
      [{ type: "added", path: "/out/b.md" }],
    ]);
  });

  it("an invalid request throws its reason and writes nothing", async () => {
    const { ops, seen } = await setup();
    await expect(
      ops.transfer({ op: "copy", sources: ["/docs"], targetDir: "/docs/inner", clash: "skip" }),
    ).rejects.toThrow("A folder can't be copied or moved into itself.");
    expect(seen).toEqual([]);
  });

  it("mkdir and rename refuse a taken or invalid name; rename reports deleted + added", async () => {
    const { files, ops, seen } = await setup();
    await expect(ops.mkdir("/docs", "a.md")).rejects.toThrow("a.md already exists here.");
    await expect(ops.rename("/docs/a.md", "b.md")).rejects.toThrow("b.md already exists here.");
    await expect(ops.rename("/docs/a.md", "x/y")).rejects.toThrow("A name can't contain / or \\.");
    expect(await ops.mkdir("/docs", "new")).toBe("/docs/new");
    expect(await ops.rename("/docs/a.md", "c.md")).toBe("/docs/c.md");
    expect(await readText(files, "/docs/c.md")).toBe("A");
    expect(seen).toEqual([
      [{ type: "added", path: "/docs/new" }],
      [
        { type: "deleted", path: "/docs/a.md" },
        { type: "added", path: "/docs/c.md" },
      ],
    ]);
  });

  it("rename of a vanished source says so and reports nothing", async () => {
    const { ops, seen } = await setup();
    await expect(ops.rename("/docs/gone.md", "z.md")).rejects.toThrow("It no longer exists.");
    expect(seen).toEqual([]);
  });

  it("remove deletes and reports each path", async () => {
    const { files, ops, seen } = await setup();
    await ops.remove(["/docs/a.md", "/docs/b.md"]);
    expect(await files.exists("/docs/a.md")).toBe(false);
    expect(seen).toEqual([
      [
        { type: "deleted", path: "/docs/a.md" },
        { type: "deleted", path: "/docs/b.md" },
      ],
    ]);
  });

  it("remove reports only what it removed when it stops midway", async () => {
    const { ops, seen } = await setup();
    const real = ops.files.remove.bind(ops.files);
    ops.files.remove = async (p: string) => {
      if (p === "/docs/b.md") throw new Error("boom");
      return real(p);
    };
    await expect(ops.remove(["/docs/a.md", "/docs/b.md"])).rejects.toThrow("boom");
    expect(seen).toEqual([[{ type: "deleted", path: "/docs/a.md" }]]);
  });
});
