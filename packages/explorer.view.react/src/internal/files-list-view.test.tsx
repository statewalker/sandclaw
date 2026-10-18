import { FilesListModel } from "@statewalker/explorer.core";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilesListView } from "./files-list-view.js";

describe("FilesListView", () => {
  it("renders breadcrumb + visible entries from the model", () => {
    const model = new FilesListModel();
    model.path = "/projects";
    model.entries = [
      { name: "..", path: "/", kind: "directory" },
      { name: "src", path: "/projects/src", kind: "directory" },
      { name: "README.md", path: "/projects/README.md", kind: "file", size: 1024, lastModified: 0 },
    ];

    render(<FilesListView model={model} panelId="left" onOpen={() => {}} />);

    expect(screen.getByText("README.md")).toBeTruthy();
    expect(screen.getByText("src")).toBeTruthy();
    // Breadcrumb has the trailing path segment
    expect(screen.getByText("projects")).toBeTruthy();
  });

  it("re-renders when the model notifies", () => {
    const model = new FilesListModel();
    model.entries = [
      { name: "first.txt", path: "/first.txt", kind: "file", size: 0, lastModified: 0 },
    ];
    render(<FilesListView model={model} panelId="left" onOpen={() => {}} />);

    expect(screen.queryByText("second.txt")).toBeNull();

    act(() => {
      model.entries = [
        { name: "second.txt", path: "/second.txt", kind: "file", size: 0, lastModified: 0 },
      ];
      model.notify();
    });

    expect(screen.getByText("second.txt")).toBeTruthy();
  });
});
