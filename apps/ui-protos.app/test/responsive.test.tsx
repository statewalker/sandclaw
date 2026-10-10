import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { modeFor } from "../src/workspace-layout/responsive.js";
import { Workspace } from "../src/workspace-layout/workspace.js";

afterEach(cleanup);

describe("modeFor", () => {
  it("switches at 640 and 1024 px", () => {
    expect(modeFor(639)).toBe("mobile");
    expect(modeFor(640)).toBe("compact");
    expect(modeFor(1023)).toBe("compact");
    expect(modeFor(1024)).toBe("desktop");
  });
});

describe("compact", () => {
  it("keeps documents in the dock and opens side panels as overlays", () => {
    render(<Workspace lockMode="per-zone" initialMode="compact" />);
    expect(screen.getByText("Offer — Dupont & Fils")).toBeTruthy();
    expect(screen.queryByText("Clients")).toBeNull();
    const bar = screen.getByRole("navigation", { name: "Side panels" });
    fireEvent.click(within(bar).getByRole("button", { name: "Folder" }));
    expect(screen.getByRole("complementary", { name: "Folder" })).toBeTruthy();
    expect(screen.getByText("Clients")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.queryByText("Clients")).toBeNull();
  });
});

describe("mobile", () => {
  it("shows one view at a time, switched from the bottom bar", () => {
    render(<Workspace lockMode="per-zone" initialMode="mobile" />);
    expect(document.querySelector(".dv-groupview")).toBeNull();
    expect(screen.getByText("Offer — Dupont & Fils")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "2026-Q3.xlsx" }));
    expect(screen.getByText("Bois Lyonnais")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
    expect(screen.getByPlaceholderText("Ask about your folder…")).toBeTruthy();
    expect(screen.queryByText("Bois Lyonnais")).toBeNull();
  });
});
