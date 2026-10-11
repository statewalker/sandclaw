import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newDemoStorages } from "../src/file-panels/demo-storages.js";
import { FilePanel, type FilePanelProps } from "../src/file-panels/file-panel.js";

afterEach(cleanup);

function Harness(
  props: Partial<FilePanelProps> & {
    start?: string;
    storages?: ReturnType<typeof newDemoStorages>;
  },
) {
  const storages = props.storages ?? newDemoStorages();
  const [path, setPath] = useState(props.start ?? "/documents");
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <FilePanel
      files={storages.files}
      mounts={storages.mounts}
      path={path}
      onNavigate={setPath}
      selected={selected}
      onSelect={setSelected}
      {...props}
    />
  );
}

const rows = async () =>
  (await screen.findAllByRole("row")).map((r) => r.getAttribute("data-name"));

describe("FilePanel", () => {
  it("lists folders first and opens a folder", async () => {
    render(<Harness />);
    expect(await rows()).toEqual(["clients", "notes", "reports", "readme.md"]);
    fireEvent.doubleClick(screen.getByRole("row", { name: /clients/ }));
    expect(await rows()).toEqual(["dupont", "martin"]);
  });

  it("the breadcrumb menu lists the folders beside a crumb and navigates", async () => {
    render(<Harness start="/documents/clients/dupont" />);
    fireEvent.click(await screen.findByRole("button", { name: "Folders beside dupont" }));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "martin" }));
    expect(await rows()).toEqual(["contract.docx", "notes.md"]);
  });

  it("the first crumb's menu lists the mounts by name", async () => {
    render(<Harness start="/documents/notes" />);
    fireEvent.click(await screen.findByRole("button", { name: "Folders beside Documents" }));
    const items = within(await screen.findByRole("menu"))
      .getAllByRole("menuitem")
      .map((i) => i.textContent);
    expect(items).toEqual(["Archive (S3)", "Browser storage", "Documents", "Photos (S3)"]);
  });

  it("shows a locked mount's problem with Unlock, not an empty folder", async () => {
    const onProblemAction = vi.fn();
    const storages = newDemoStorages({
      unavailable: {
        archive: { cause: "locked", message: "Locked: unlock to use the S3 storages." },
      },
    });
    render(<Harness storages={storages} start="/archive" onProblemAction={onProblemAction} />);
    expect(await screen.findByText("Locked: unlock to use the S3 storages.")).toBeTruthy();
    expect(screen.queryAllByRole("row")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(onProblemAction).toHaveBeenCalledWith(
      "archive",
      expect.objectContaining({ cause: "locked" }),
    );
  });

  it("keys: shift+arrow extends the selection, F5 asks to copy it", async () => {
    const onCommand = vi.fn();
    render(<Harness onCommand={onCommand} />);
    await rows();
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(grid, { key: "F5" });
    expect(onCommand).toHaveBeenCalledWith("copy", {
      path: "/documents",
      selected: ["/documents/clients", "/documents/notes"],
    });
  });

  it("a drop from another panel reports the paths, the target and the copy modifier", async () => {
    const onDropPaths = vi.fn();
    render(<Harness onDropPaths={onDropPaths} />);
    const target = await screen.findByRole("row", { name: /notes/ });
    const data = {
      types: ["application/x-sandclaw-paths"],
      getData: () => JSON.stringify(["/archive/2026/readme.md"]),
    };
    fireEvent.drop(target, { dataTransfer: data, ctrlKey: true });
    expect(onDropPaths).toHaveBeenCalledWith(["/archive/2026/readme.md"], "/documents/notes", true);
  });

  it("an open menu keeps its focused item when the parent re-renders", async () => {
    const { rerender } = render(<Harness start="/documents/clients/dupont" />);
    fireEvent.click(await screen.findByRole("button", { name: "Folders beside clients" }));
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    rerender(<Harness start="/documents/clients/dupont" refreshKey={1} />);
    expect(document.activeElement).toBe(items[1]);
  });

  it("nothing can be dropped at the root: not on All storages, not on the list at /", async () => {
    const onDropPaths = vi.fn();
    const onDropExternal = vi.fn();
    render(<Harness onDropPaths={onDropPaths} onDropExternal={onDropExternal} />);
    const data = {
      types: ["application/x-sandclaw-paths"],
      getData: () => JSON.stringify(["/a/b"]),
    };
    fireEvent.drop(await screen.findByRole("button", { name: "All storages" }), {
      dataTransfer: data,
    });
    fireEvent.click(screen.getByRole("button", { name: "All storages" }));
    await rows();
    fireEvent.drop(screen.getByRole("grid"), { dataTransfer: data });
    fireEvent.drop(screen.getByRole("grid"), {
      dataTransfer: { types: ["Files"], getData: () => "" },
    });
    expect(onDropPaths).not.toHaveBeenCalled();
    expect(onDropExternal).not.toHaveBeenCalled();
  });

  it("commands act on the cursor row when nothing is selected, and on nothing without one", async () => {
    const onCommand = vi.fn();
    render(<Harness onCommand={onCommand} />);
    await rows();
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "F8" });
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("row", { name: /clients/ }), { ctrlKey: true });
    fireEvent.keyDown(grid, { key: "F8" });
    expect(onCommand).toHaveBeenCalledWith("delete", {
      path: "/documents",
      selected: ["/documents/clients"],
    });
  });

  it("a space does not start the filter", async () => {
    render(<Harness />);
    await rows();
    fireEvent.keyDown(screen.getByRole("grid"), { key: " " });
    expect((screen.getByLabelText("Filter by name") as HTMLInputElement).value).toBe("");
  });

  it("after changing folder, shift+arrow does not extend from the old anchor", async () => {
    render(<Harness />);
    await rows();
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.doubleClick(screen.getByRole("row", { name: /clients/ }));
    await screen.findByRole("row", { name: /dupont/ });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    expect(
      screen.getAllByRole("row", { selected: true }).map((r) => r.getAttribute("data-name")),
    ).toEqual(["dupont"]);
  });

  it("at the root only Open, Copy to… and their kind work: no rename, move, delete or new folder", async () => {
    const onCommand = vi.fn();
    render(<Harness start="/" onCommand={onCommand} />);
    const row = await screen.findByRole("row", { name: "Documents" });
    expect(screen.getByRole("button", { name: "New folder" })).toHaveProperty("disabled", true);
    fireEvent.contextMenu(row);
    const items = within(await screen.findByRole("menu"))
      .getAllByRole("menuitem")
      .map((i) => i.textContent);
    expect(items.some((i) => /Rename|Move to|Delete/.test(i ?? ""))).toBe(false);
    expect(items.some((i) => i?.startsWith("Open"))).toBe(true);
    expect(items.some((i) => i?.startsWith("Copy to"))).toBe(true);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    const grid = screen.getByRole("grid");
    for (const key of ["F2", "F6", "F7", "F8", "Delete"]) fireEvent.keyDown(grid, { key });
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.keyDown(grid, { key: "F5" });
    expect(onCommand).toHaveBeenCalledWith("copy", { path: "/", selected: ["/documents"] });
  });

  it("a command acts only on the selected rows the filter still shows", async () => {
    const onCommand = vi.fn();
    render(<Harness onCommand={onCommand} />);
    fireEvent.click(await screen.findByRole("row", { name: /clients/ }));
    fireEvent.click(screen.getByRole("row", { name: /readme/ }), { ctrlKey: true });
    fireEvent.change(screen.getByLabelText("Filter by name"), { target: { value: "read" } });
    expect(await rows()).toEqual(["readme.md"]);
    fireEvent.keyDown(screen.getByRole("grid"), { key: "F8" });
    expect(onCommand).toHaveBeenCalledWith("delete", {
      path: "/documents",
      selected: ["/documents/readme.md"],
    });
  });
});
