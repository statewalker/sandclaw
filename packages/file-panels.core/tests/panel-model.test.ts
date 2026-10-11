import { newFileChanges, unavailableFiles } from "@statewalker/file-mounts.core";
import { type FilesApi, writeText } from "@statewalker/webrun-files";
import { CompositeFilesApi } from "@statewalker/webrun-files-composite";
import { MemFilesApi } from "@statewalker/webrun-files-mem";
import { describe, expect, it } from "vitest";
import { PanelModel } from "../src/index.js";

const names = (panel: PanelModel) => panel.list.entries.map((e) => e.name).sort();

const storages = async () => {
  const docs = new MemFilesApi();
  await writeText(docs, "/clients/dupont/offer.pdf", "pdf");
  await writeText(docs, "/notes/todo.md", "todo");
  const root = new CompositeFilesApi(new MemFilesApi());
  root.mount("/docs", docs);
  root.mount(
    "/archive",
    unavailableFiles("archive", {
      cause: "locked",
      message: "Locked: unlock to use the S3 storages.",
    }),
  );
  return root as FilesApi;
};

describe("PanelModel", () => {
  it("navigates, goes up, and gives the breadcrumb with mount names", async () => {
    const panel = new PanelModel({
      id: "p1",
      files: await storages(),
      mountNames: () => ({ docs: "Documents" }),
    });
    await panel.navigate("/docs/clients/");
    expect(panel.state.path).toBe("/docs/clients");
    expect(names(panel)).toEqual(["dupont"]);
    expect(panel.breadcrumb().map((c) => c.name)).toEqual(["Documents", "clients"]);
    expect(
      (await panel.siblings({ name: "clients", path: "/docs/clients", isMount: false })).map(
        (s) => s.name,
      ),
    ).toEqual(["clients", "notes"]);
    await panel.up();
    expect(names(panel)).toEqual(["clients", "notes"]);
    await panel.navigate("/");
    expect(names(panel)).toEqual(["archive", "docs"]);
  });

  it("a locked storage is a problem with its reason, not an empty folder", async () => {
    const panel = new PanelModel({ id: "p1", files: await storages() });
    await panel.navigate("/archive");
    expect(panel.problem).toEqual({
      cause: "locked",
      message: "Locked: unlock to use the S3 storages.",
    });
    await panel.navigate("/docs");
    expect(panel.problem).toBeUndefined();
  });

  it("a folder that no longer exists sends the panel to its nearest ancestor, with a notice", async () => {
    const panel = new PanelModel({ id: "p1", files: await storages() });
    await panel.navigate("/docs/clients/gone/deeper");
    expect(panel.state.path).toBe("/docs/clients");
    expect(panel.notice).toBe("deeper no longer exists.");
  });

  it("a slow older navigation never replaces a newer one", async () => {
    const base = await storages();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    // A class instance: its methods live on the prototype, so delegate each one.
    const slow: FilesApi = {
      read: (p, o) => base.read(p, o),
      write: (p, c) => base.write(p, c),
      mkdir: (p) => base.mkdir(p),
      list: async function* (path, opts) {
        if (path === "/docs/clients") await gate;
        yield* base.list(path, opts);
      },
      stats: (p) => base.stats(p),
      exists: (p) => base.exists(p),
      remove: (p) => base.remove(p),
      move: (a, b) => base.move(a, b),
      copy: (a, b) => base.copy(a, b),
    };
    const panel = new PanelModel({ id: "p1", files: slow });
    const older = panel.navigate("/docs/clients");
    await panel.navigate("/docs/notes");
    release();
    await older;
    expect(panel.state.path).toBe("/docs/notes");
    expect(names(panel)).toEqual(["todo.md"]);
  });

  it("refreshes when a change touches its folder, and not otherwise", async () => {
    const files = await storages();
    const changes = newFileChanges();
    const panel = new PanelModel({ id: "p1", files, changes });
    await panel.navigate("/docs/notes");
    await writeText(files, "/docs/notes/new.md", "n");
    changes.emit([{ type: "added", path: "/docs/clients/x.md" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(names(panel)).toEqual(["todo.md"]);
    changes.emit([{ type: "added", path: "/docs/notes/new.md" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(names(panel)).toEqual(["new.md", "todo.md"]);
    panel.dispose();
  });

  it("a change in the old folder does not cancel a navigation in flight", async () => {
    const base = await storages();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slow: FilesApi = {
      read: (p, o) => base.read(p, o),
      write: (p, c) => base.write(p, c),
      mkdir: (p) => base.mkdir(p),
      list: async function* (path, opts) {
        if (path === "/docs/clients") await gate;
        yield* base.list(path, opts);
      },
      stats: (p) => base.stats(p),
      exists: (p) => base.exists(p),
      remove: (p) => base.remove(p),
      move: (a, b) => base.move(a, b),
      copy: (a, b) => base.copy(a, b),
    };
    const changes = newFileChanges();
    const panel = new PanelModel({ id: "p1", files: slow, changes });
    await panel.navigate("/docs/notes");
    const pending = panel.navigate("/docs/clients");
    changes.emit([{ type: "added", path: "/docs/notes/x.md" }]);
    release();
    await pending;
    await new Promise((r) => setTimeout(r, 0));
    expect(panel.state.path).toBe("/docs/clients");
    expect(names(panel)).toEqual(["dupont"]);
    panel.dispose();
  });

  it("a deleted current folder falls back to the nearest existing ancestor", async () => {
    const files = await storages();
    const changes = newFileChanges();
    const panel = new PanelModel({ id: "p1", files, changes });
    await panel.navigate("/docs/clients/dupont");
    await files.remove("/docs/clients/dupont");
    changes.emit([{ type: "deleted", path: "/docs/clients/dupont" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(panel.state.path).toBe("/docs/clients");
    expect(panel.notice).toBe("dupont no longer exists.");
    panel.dispose();
  });

  it("after dispose, changes trigger no listing and a late load is ignored", async () => {
    const base = await storages();
    let listed = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const spy: FilesApi = {
      read: (p, o) => base.read(p, o),
      write: (p, c) => base.write(p, c),
      mkdir: (p) => base.mkdir(p),
      list: async function* (path, opts) {
        listed++;
        if (path === "/docs/clients") await gate;
        yield* base.list(path, opts);
      },
      stats: (p) => base.stats(p),
      exists: (p) => base.exists(p),
      remove: (p) => base.remove(p),
      move: (a, b) => base.move(a, b),
      copy: (a, b) => base.copy(a, b),
    };
    const changes = newFileChanges();
    const panel = new PanelModel({ id: "p1", files: spy, changes });
    await panel.navigate("/docs/notes");
    const pending = panel.navigate("/docs/clients");
    panel.dispose();
    release();
    await pending;
    expect(panel.state.path).toBe("/docs/notes");
    const before = listed;
    changes.emit([{ type: "added", path: "/docs/notes/y.md" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(listed).toBe(before);
  });

  it("after a fallback, up goes to the parent of the folder shown", async () => {
    const panel = new PanelModel({ id: "p1", files: await storages() });
    await panel.navigate("/docs/clients/gone/deeper");
    await panel.up();
    expect(panel.state.path).toBe("/docs");
  });

  it("after a fallback, a change in the folder shown refreshes it", async () => {
    const files = await storages();
    const changes = newFileChanges();
    const panel = new PanelModel({ id: "p1", files, changes });
    await panel.navigate("/docs/notes/gone");
    expect(panel.state.path).toBe("/docs/notes");
    await writeText(files, "/docs/notes/new.md", "n");
    changes.emit([{ type: "added", path: "/docs/notes/new.md" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(names(panel)).toEqual(["new.md", "todo.md"]);
    panel.dispose();
  });

  it("state carries the sort for the dock layout", async () => {
    const panel = new PanelModel({ id: "p1", files: await storages() });
    panel.setSort("size");
    expect(panel.state.sort).toEqual({ field: "size", descending: false });
    panel.setSort("size");
    expect(panel.state.sort).toEqual({ field: "size", descending: true });
  });
});
