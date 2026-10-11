import { readText } from "@statewalker/webrun-files";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { newDemoStorages } from "../src/file-panels/demo-storages.js";
import { readDropped } from "../src/file-panels/dropped-files.js";
import { FileCommander } from "../src/file-panels/file-commander.js";

afterEach(cleanup);

const panel = (title: string) => screen.getByRole("region", { name: title });

describe("FileCommander", () => {
  it("F5 copies the selection to the other panel after the dialog", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes", "/archive/2026"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "todo.md" }));
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F5" });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Copy" })).toHaveProperty("checked", true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Done")).toBeTruthy();
    expect(await readText(storages.files, "/archive/2026/todo.md")).toContain("# Todo");
    expect(await within(panel("2026")).findByRole("row", { name: "todo.md" })).toBeTruthy();
  });

  const dragged = (paths: string[]) => ({
    types: ["application/x-sandclaw-paths"],
    getData: () => JSON.stringify(paths),
  });

  it("a drop within one storage preselects Move and moves", async () => {
    const storages = newDemoStorages();
    render(
      <FileCommander storages={storages} panels={["/documents/notes", "/documents/reports"]} />,
    );
    const target = await within(panel("reports")).findByRole("grid");
    fireEvent.drop(target, { dataTransfer: dragged(["/documents/notes/todo.md"]) });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Move" })).toHaveProperty("checked", true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    await screen.findByText("Done");
    expect(await storages.files.exists("/documents/notes/todo.md")).toBe(false);
    expect(await storages.files.exists("/documents/reports/todo.md")).toBe(true);
  });

  it("a drop across storages preselects Copy and keeps the original", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes", "/browser/drafts"]} />);
    const target = await within(panel("drafts")).findByRole("grid");
    fireEvent.drop(target, { dataTransfer: dragged(["/documents/notes/todo.md"]) });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "Copy" })).toHaveProperty("checked", true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    await screen.findByText("Done");
    expect(await storages.files.exists("/documents/notes/todo.md")).toBe(true);
    expect(await storages.files.exists("/browser/drafts/todo.md")).toBe(true);
  });

  it("several clashing items offer one choice; Skip leaves the target alone", async () => {
    const storages = newDemoStorages();
    await storages.files.write("/archive/2026/todo.md", [new TextEncoder().encode("old")]);
    render(<FileCommander storages={storages} panels={["/documents/notes", "/archive/2026"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "meeting-2026-10-02.md" }));
    fireEvent.click(within(left).getByRole("row", { name: "todo.md" }), { ctrlKey: true });
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F5" });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("radio", { name: "Skip" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    await screen.findByText("Done");
    expect(await readText(storages.files, "/archive/2026/todo.md")).toBe("old");
    expect(await storages.files.exists("/archive/2026/meeting-2026-10-02.md")).toBe(true);
  });

  it("F8 deletes after the confirmation that says there is no trash", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes", "/archive"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "todo.md" }));
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F8" });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("no trash");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await act(async () => {});
    expect(await storages.files.exists("/documents/notes/todo.md")).toBe(false);
  });

  it("the dialog says a target storage is locked before anything starts", async () => {
    const locked = { cause: "locked" as const, message: "Locked: unlock to use the S3 storages." };
    const storages = newDemoStorages({ unavailable: { archive: locked } });
    render(
      <FileCommander storages={storages} panels={["/documents/notes", "/documents/clients"]} />,
    );
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "todo.md" }));
    fireEvent.contextMenu(within(left).getByRole("row", { name: "todo.md" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy to…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Folder"), { target: { value: "/archive" } });
    expect(await within(dialog).findByText("Locked: unlock to use the S3 storages.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Copy" })).toHaveProperty("disabled", true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("Opens Settings → Storage")).toBeTruthy();
  });

  it("one item never replaces a file that appeared after the dialog checked", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes", "/archive/2026"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "todo.md" }));
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F5" });
    const dialog = await screen.findByRole("dialog");
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(within(dialog).queryByText(/will be replaced/)).toBeNull();
    await storages.files.write("/archive/2026/todo.md", [new TextEncoder().encode("mine")]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("1 skipped")).toBeTruthy();
    expect(await readText(storages.files, "/archive/2026/todo.md")).toBe("mine");
  });

  it("a rename never replaces a name taken after the dialog opened", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "todo.md" }));
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F2" });
    const dialog = await screen.findByRole("dialog");
    await act(() => new Promise((r) => setTimeout(r, 20)));
    await storages.files.write("/documents/notes/done.md", [new TextEncoder().encode("mine")]);
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "done.md" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
    expect(await screen.findByText("done.md already exists here.")).toBeTruthy();
    expect(await readText(storages.files, "/documents/notes/done.md")).toBe("mine");
    expect(await readText(storages.files, "/documents/notes/todo.md")).toContain("# Todo");
  });

  it("a new folder may not take a name that is already there", async () => {
    render(<FileCommander panels={["/documents/notes", "/archive"]} />);
    const left = panel("notes");
    await within(left).findByRole("row", { name: "todo.md" });
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F7" });
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "todo.md" } });
    expect(await within(dialog).findByText("todo.md already exists here.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Create" })).toHaveProperty("disabled", true);
  });

  it("on a phone shows one panel at a time, without drag, commands behind ⋯", async () => {
    render(<FileCommander phone panels={["/documents/notes", "/archive/2026"]} />);
    const row = await within(panel("notes")).findByRole("row", { name: "todo.md" });
    expect(row.getAttribute("draggable")).not.toBe("true");
    expect(screen.queryByRole("region", { name: "2026" })).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Actions for todo.md" }));
    expect(await screen.findByRole("menuitem", { name: "Copy to…" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "2026" }));
    expect(await within(panel("2026")).findByRole("row", { name: "readme.md" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "notes" })).toBeNull();
  });
});

describe("FileCommander, fix round 1", () => {
  it("choosing a clash policy keeps the choices on screen", async () => {
    const storages = newDemoStorages();
    await storages.files.write("/archive/2026/todo.md", [new TextEncoder().encode("old")]);
    render(<FileCommander storages={storages} panels={["/documents/notes", "/archive/2026"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "meeting-2026-10-02.md" }));
    fireEvent.click(within(left).getByRole("row", { name: "todo.md" }), { ctrlKey: true });
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F5" });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("radio", { name: "Skip" }));
    expect(within(dialog).queryByRole("radio", { name: "Overwrite" })).not.toBeNull();
    await act(async () => {});
    expect(within(dialog).getByRole("radio", { name: "Skip" })).toHaveProperty("checked", true);
  });

  it("a copy keeps the source selection; the target selects the copy, trailing slash or not", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes", "/archive/2026"]} />);
    const left = panel("notes");
    fireEvent.click(await within(left).findByRole("row", { name: "todo.md" }));
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F5" });
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Folder"), {
      target: { value: "/archive/2026/" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    await screen.findByText("Done");
    const copied = await within(panel("2026")).findByRole("row", { name: "todo.md" });
    expect(copied.getAttribute("aria-selected")).toBe("true");
    const source = within(left).getByRole("row", { name: "todo.md" });
    expect(source.getAttribute("aria-selected")).toBe("true");
  });

  it("refuses a second transfer while one runs", async () => {
    const storages = newDemoStorages({ slowMs: 60_000 });
    render(<FileCommander storages={storages} panels={["/archive/2025", "/documents/notes"]} />);
    const left = panel("2025");
    fireEvent.click(await within(left).findByRole("row", { name: "backup.zip" }));
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F5" });
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Copy" }),
    );
    await screen.findByRole("progressbar");
    fireEvent.keyDown(within(left).getByRole("grid"), { key: "F5" });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Wait for the current transfer to finish.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Copy" })).toHaveProperty("disabled", true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Cancelled")).toBeTruthy();
  });

  it("a desktop drop copies into the folder, without a Move choice", async () => {
    const storages = newDemoStorages();
    render(<FileCommander storages={storages} panels={["/documents/notes", "/browser/drafts"]} />);
    const target = await within(panel("drafts")).findByRole("grid");
    const data = { types: ["Files"], files: [new File(["dropped"], "note.txt")] };
    fireEvent.drop(target, { dataTransfer: data });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("radio", { name: "Move" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy" }));
    await screen.findByText("Done");
    expect(await readText(storages.files, "/browser/drafts/note.txt")).toBe("dropped");
  });
});

describe("readDropped", () => {
  it("reads plain dropped files under /drop", async () => {
    const data = { files: [new File(["hello"], "a.txt")] } as unknown as DataTransfer;
    const { files, paths } = await readDropped(data);
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
    const { files, paths } = await readDropped(data);
    expect(paths).toEqual(["/drop/site"]);
    expect(await readText(files, "/drop/site/img/a.png")).toBe("png");
    expect(await readText(files, "/drop/site/index.md")).toBe("# Site");
    expect((await files.stats("/drop/site/empty"))?.kind).toBe("directory");
  });
});
