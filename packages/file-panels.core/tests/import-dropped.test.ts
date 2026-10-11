// @vitest-environment node
import { readText } from "@statewalker/webrun-files";
import { describe, expect, it } from "vitest";
import { importDropped } from "../src/index.js";

describe("importDropped", () => {
  it("reads plain dropped files under /drop", async () => {
    const data = { files: [new File(["hello"], "a.txt")] } as unknown as DataTransfer;
    const { files, paths } = await importDropped(data);
    expect(paths).toEqual(["/drop/a.txt"]);
    expect(await readText(files, "/drop/a.txt")).toBe("hello");
  });

  it("reads a dropped folder recursively through its entries", async () => {
    const file = (name: string, fullPath: string, text: string) => ({
      isFile: true,
      isDirectory: false,
      name,
      fullPath,
      file: (ok: (f: File) => void) => ok(new File([text], name)),
    });
    const dir = (name: string, fullPath: string, children: unknown[]) => ({
      isFile: false,
      isDirectory: true,
      name,
      fullPath,
      createReader: () => {
        let read = false;
        return {
          readEntries: (ok: (e: unknown[]) => void) => {
            ok(read ? [] : children);
            read = true;
          },
        };
      },
    });
    const tree = dir("site", "/site", [
      file("index.md", "/site/index.md", "# Site"),
      dir("img", "/site/img", [file("a.png", "/site/img/a.png", "png")]),
      dir("empty", "/site/empty", []),
    ]);
    const data = {
      items: [{ kind: "file", webkitGetAsEntry: () => tree }],
      files: [],
    } as unknown as DataTransfer;
    const { files, paths } = await importDropped(data);
    expect(paths).toEqual(["/drop/site"]);
    expect(await readText(files, "/drop/site/img/a.png")).toBe("png");
    expect(await readText(files, "/drop/site/index.md")).toBe("# Site");
    expect((await files.stats("/drop/site/empty"))?.kind).toBe("directory");
  });
});
