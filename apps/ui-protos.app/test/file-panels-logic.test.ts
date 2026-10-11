import { basename, type FilesApi, readText, writeText } from "@statewalker/webrun-files";
import { describe, expect, it, vi } from "vitest";
import { newDemoStorages } from "../src/file-panels/demo-storages.js";
import { breadcrumb, clickSelect, siblings, sortEntries } from "../src/file-panels/paths.js";
import { MountUnavailable } from "../src/file-panels/problem.js";
import {
  findClashes,
  freeName,
  planTransfer,
  validateName,
} from "../src/file-panels/transfer-plan.js";
import { runTransfer } from "../src/file-panels/transfer-run.js";

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

describe("planTransfer", () => {
  it("refuses a folder into itself or below it", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, {
      op: "move",
      sources: ["/documents/clients"],
      targetDir: "/documents/clients/dupont",
      clash: "skip",
    });
    expect(plan.invalid).toBe("A folder can't be copied or moved into itself.");
    expect(plan.steps).toEqual([]);
  });

  it("dropping into the source's own folder copies under a free name", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, {
      op: "move",
      sources: ["/documents/readme.md"],
      targetDir: "/documents",
      clash: "skip",
    });
    expect(plan.steps).toEqual([
      {
        op: "copy",
        from: "/documents/readme.md",
        to: "/documents/readme copy.md",
        overwrite: false,
      },
    ]);
  });

  it("applies the clash policy: skip, overwrite, keep both", async () => {
    const { files } = newDemoStorages();
    await files.write("/archive/2026/todo.md", [new TextEncoder().encode("old")]);
    const req = {
      op: "copy" as const,
      sources: ["/documents/notes/todo.md"],
      targetDir: "/archive/2026",
    };
    expect(await findClashes(files, req.sources, req.targetDir)).toEqual(["todo.md"]);
    expect((await planTransfer(files, { ...req, clash: "skip" })).skipped).toEqual([
      "/documents/notes/todo.md",
    ]);
    expect((await planTransfer(files, { ...req, clash: "overwrite" })).steps[0]).toMatchObject({
      to: "/archive/2026/todo.md",
      overwrite: true,
    });
    expect((await planTransfer(files, { ...req, clash: "keep-both" })).steps[0]).toMatchObject({
      to: "/archive/2026/todo copy.md",
      overwrite: false,
    });
  });

  it("two sources with the same name never overwrite each other", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, {
      op: "copy",
      sources: ["/documents/readme.md", "/archive/2026/readme.md"],
      targetDir: "/browser",
      clash: "keep-both",
    });
    expect(plan.steps.map((s) => s.to)).toEqual(["/browser/readme.md", "/browser/readme copy.md"]);
  });

  it("a single source can be renamed", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, {
      op: "copy",
      sources: ["/documents/readme.md"],
      targetDir: "/browser",
      rename: "intro.md",
      clash: "skip",
    });
    expect(plan.steps[0]?.to).toBe("/browser/intro.md");
  });
});

describe("names", () => {
  it("frees a name", () => {
    expect(freeName("a.md", new Set(["a.md"]))).toBe("a copy.md");
    expect(freeName("a.md", new Set(["a.md", "a copy.md"]))).toBe("a copy 2.md");
    expect(freeName("folder", new Set(["folder"]))).toBe("folder copy");
  });
  it("validates a name", () => {
    expect(validateName("")).toBe("Enter a name.");
    expect(validateName("a/b")).toBe("A name can't contain / or \\.");
    expect(validateName("..")).toBe("This name is reserved.");
    expect(validateName("ok.md")).toBeUndefined();
  });
});

describe("runTransfer", () => {
  it("copies across mounts with byte progress", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, {
      op: "copy",
      sources: ["/documents/clients/dupont"],
      targetDir: "/archive/2026",
      clash: "skip",
    });
    const seen: number[] = [];
    const result = await runTransfer(files, plan, { onProgress: (p) => seen.push(p.bytesDone) });
    expect(result).toMatchObject({
      done: ["/documents/clients/dupont"],
      failed: [],
      cancelled: false,
    });
    expect(await files.exists("/archive/2026/dupont/offer.pdf")).toBe(true);
    expect(seen.at(-1)).toBe(240_000 + 80_000);
  });

  it("a cross-mount move removes the source only after the copy", async () => {
    const { files } = newDemoStorages();
    const plan = await planTransfer(files, {
      op: "move",
      sources: ["/documents/readme.md"],
      targetDir: "/archive",
      clash: "skip",
    });
    await runTransfer(files, plan);
    expect(await files.exists("/documents/readme.md")).toBe(false);
    expect(await readText(files, "/archive/readme.md")).toBe("# Documents\n");
  });

  it("an overwrite whose copy fails keeps the old target", async () => {
    const { files } = newDemoStorages({ failPaths: ["/archive/2026/readme.md"] });
    const plan = await planTransfer(files, {
      op: "copy",
      sources: ["/documents/readme.md"],
      targetDir: "/archive/2026",
      clash: "overwrite",
    });
    const result = await runTransfer(files, plan);
    expect(result.failed[0]?.problem.message).toContain("connection was reset");
    expect(await readText(files, "/archive/2026/readme.md")).toBe("# Archive 2026\n");
  });

  it("cancelling mid-file removes the partial copy and keeps the source", async () => {
    vi.useFakeTimers();
    const { files } = newDemoStorages({ slowMs: 100 });
    const plan = await planTransfer(files, {
      op: "move",
      sources: ["/archive/2025/backup.zip"],
      targetDir: "/documents",
      clash: "skip",
    });
    const controller = new AbortController();
    const running = runTransfer(files, plan, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(250);
    controller.abort();
    await vi.runAllTimersAsync();
    const result = await running;
    vi.useRealTimers();
    expect(result.cancelled).toBe(true);
    expect(await files.exists("/documents/backup.zip")).toBe(false);
    expect(await files.exists("/archive/2025/backup.zip")).toBe(true);
  });

  it("an unavailable target fails each step with the mount's problem", async () => {
    const locked = {
      cause: "locked" as const,
      message: "Locked: unlock to use the S3 storages.",
    };
    const { files } = newDemoStorages({ unavailable: { archive: locked } });
    const plan = {
      steps: [
        {
          op: "copy" as const,
          from: "/documents/readme.md",
          to: "/archive/readme.md",
          overwrite: false,
        },
      ],
      skipped: [],
      clashes: [],
    };
    const result = await runTransfer(files, plan);
    expect(result.failed).toEqual([{ path: "/documents/readme.md", problem: locked }]);
  });
});

describe("runTransfer fix round 1", () => {
  const wrap = (files: FilesApi, over: Partial<FilesApi>): FilesApi => ({
    read: (p, o) => files.read(p, o),
    write: (p, c) => files.write(p, c),
    mkdir: (p) => files.mkdir(p),
    list: (p, o) => files.list(p, o),
    stats: (p) => files.stats(p),
    exists: (p) => files.exists(p),
    remove: (p) => files.remove(p),
    move: (a, b) => files.move(a, b),
    copy: (a, b) => files.copy(a, b),
    ...over,
  });
  const isPart = (p: string) => basename(p).includes(".part-");
  const listed = async (files: FilesApi, dir: string) => {
    const out: string[] = [];
    for await (const e of files.list(dir)) out.push(e.name);
    return out.sort();
  };

  it("refuses to replace a folder with something inside it", async () => {
    const { files } = newDemoStorages();
    await writeText(files, "/documents/a/a/x.txt", "x");
    const plan = await planTransfer(files, {
      op: "move",
      sources: ["/documents/a/a"],
      targetDir: "/documents",
      clash: "overwrite",
    });
    expect(plan.invalid).toBe("A folder can't be replaced by something inside it.");
    expect(plan.steps).toEqual([]);
    expect(await readText(files, "/documents/a/a/x.txt")).toBe("x");
  });

  it("a same-mount overwrite whose copy fails keeps the old target", async () => {
    const { files: base } = newDemoStorages();
    const files = wrap(base, {
      copy: async (a, b) => {
        if (isPart(b)) throw new Error("copy broke");
        return base.copy(a, b);
      },
    });
    const plan = {
      steps: [
        {
          op: "copy" as const,
          from: "/documents/readme.md",
          to: "/documents/notes/todo.md",
          overwrite: true,
        },
      ],
      skipped: [],
      clashes: [],
    };
    const result = await runTransfer(files, plan);
    expect(result.failed[0]?.problem.message).toBe("copy broke");
    expect(await readText(base, "/documents/notes/todo.md")).toContain("# Todo");
    expect(await listed(base, "/documents/notes")).toEqual(["meeting-2026-10-02.md", "todo.md"]);
  });

  it("a same-mount overwrite replaces the target and a move removes the source", async () => {
    const { files } = newDemoStorages();
    const plan = {
      steps: [
        {
          op: "move" as const,
          from: "/documents/readme.md",
          to: "/documents/notes/todo.md",
          overwrite: true,
        },
      ],
      skipped: [],
      clashes: [],
    };
    const result = await runTransfer(files, plan);
    expect(result.done).toEqual(["/documents/readme.md"]);
    expect(await readText(files, "/documents/notes/todo.md")).toBe("# Documents\n");
    expect(await files.exists("/documents/readme.md")).toBe(false);
    expect(await listed(files, "/documents/notes")).toEqual(["meeting-2026-10-02.md", "todo.md"]);
  });

  it("a failed final swap restores the old target and loses nothing", async () => {
    const { files: base } = newDemoStorages();
    const files = wrap(base, {
      move: async (a, b) => {
        if (isPart(a)) throw new Error("swap broke");
        return base.move(a, b);
      },
    });
    const plan = {
      steps: [
        {
          op: "copy" as const,
          from: "/documents/readme.md",
          to: "/archive/2026/readme.md",
          overwrite: true,
        },
      ],
      skipped: [],
      clashes: [],
    };
    const result = await runTransfer(files, plan);
    expect(result.failed[0]?.problem.message).toBe("swap broke");
    expect(await readText(base, "/archive/2026/readme.md")).toBe("# Archive 2026\n");
    expect(await listed(base, "/archive/2026")).toEqual(["readme.md"]);
    expect(await base.exists("/documents/readme.md")).toBe(true);
  });

  it("an abort raised as an exception is a cancel, not a failure", async () => {
    const { files: base } = newDemoStorages();
    const files = wrap(base, {
      async *read(p, o) {
        for await (const chunk of base.read(p, o)) {
          for (let i = 0; i < chunk.length; i += 1000) {
            if (o?.signal?.aborted) throw new DOMException("aborted", "AbortError");
            yield chunk.subarray(i, i + 1000);
          }
        }
      },
    });
    const controller = new AbortController();
    const plan = await planTransfer(base, {
      op: "move",
      sources: ["/documents/clients/dupont/offer.pdf"],
      targetDir: "/archive",
      clash: "skip",
    });
    const result = await runTransfer(files, plan, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    expect(result).toMatchObject({ cancelled: true, failed: [], done: [] });
    expect(await base.exists("/archive/offer.pdf")).toBe(false);
    expect(await base.exists("/documents/clients/dupont/offer.pdf")).toBe(true);
  });

  it("a copy or move that reports a missing source is a failure", async () => {
    const { files: base } = newDemoStorages();
    const files = wrap(base, { copy: async () => false });
    const plan = {
      steps: [
        {
          op: "copy" as const,
          from: "/documents/readme.md",
          to: "/documents/copy.md",
          overwrite: false,
        },
      ],
      skipped: [],
      clashes: [],
    };
    const result = await runTransfer(files, plan);
    expect(result.done).toEqual([]);
    expect(result.failed[0]?.problem.message).toBe("readme.md no longer exists.");
  });

  it("a cross-mount folder move keeps empty subfolders", async () => {
    const { files } = newDemoStorages();
    await files.mkdir("/documents/clients/dupont/empty");
    const plan = await planTransfer(files, {
      op: "move",
      sources: ["/documents/clients/dupont"],
      targetDir: "/archive",
      clash: "skip",
    });
    await runTransfer(files, plan);
    expect(await files.exists("/archive/dupont/empty")).toBe(true);
    expect(await files.exists("/archive/dupont/offer.pdf")).toBe(true);
  });
});
