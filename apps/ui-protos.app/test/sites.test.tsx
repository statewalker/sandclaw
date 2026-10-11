import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { today } from "../src/mock.js";
import { dupont, finance, howWeWork } from "../src/sites/mock-sites.js";
import {
  progressOf,
  regenerateAll,
  regeneratePage,
  siteState,
  stateText,
  step,
  stopGeneration,
} from "../src/sites/site-model.js";
import { Sites } from "../src/sites/sites.js";
import * as stories from "../src/sites/sites.stories.js";

afterEach(cleanup);

describe("site state", () => {
  it("comes from its pages first, then from source changes", () => {
    expect(stateText(howWeWork)).toBe("Generating page 3 of 8");
    expect(stateText(finance)).toBe("2 pages failed");
    expect(stateText(dupont)).toBe("3 files changed since the last build");
    expect(siteState({ ...dupont, changedFiles: [] })).toBe("up-to-date");
    expect(stateText(stopGeneration(howWeWork))).toBe("Stopped · 2 of 8 pages written");
  });

  it("counts pages by state", () => {
    expect(progressOf(howWeWork.pages)).toEqual({
      total: 8,
      done: 2,
      failed: 0,
      writing: 1,
      waiting: 5,
      stopped: 0,
    });
  });

  it("retrying a failed page writes it alone; the other failure stays", () => {
    const retried = regeneratePage(finance, "fin-invoices");
    const invoices = retried.pages.find((p) => p.id === "fin-invoices");
    expect(invoices).toMatchObject({ state: "writing", reason: undefined });
    const after = step(retried, today);
    expect(progressOf(after.pages)).toMatchObject({ done: 4, failed: 1, writing: 0 });
    expect(siteState(after)).toBe("failed");
  });

  it("a finished build is up to date and dated", () => {
    let site = regenerateAll(dupont);
    for (const _ of site.pages) site = step(site, today);
    expect(siteState(site)).toBe("up-to-date");
    expect(site.builtAt).toEqual(today);
  });
});

describe("Sites screen", () => {
  const { SomeFailed, ViewerStale, Viewer } = composeStories(stories);

  it("retries one failed page from the progress page", () => {
    render(<SomeFailed />);
    fireEvent.click(screen.getByRole("button", { name: "Try again: Invoices" }));
    const invoices = screen.getByText("Invoices").closest("li") as HTMLElement;
    expect(within(invoices).getByText("Writing…")).toBeTruthy();
    expect(screen.queryByText("Failed: The AI model didn't answer")).toBeNull();
    expect(screen.getByText("Failed: No source files left for this section")).toBeTruthy();
  });

  it("a new site from topics starts generating at once", () => {
    render(<Sites />);
    fireEvent.click(screen.getByRole("button", { name: "New site" }));
    fireEvent.click(screen.getByRole("button", { name: /The topics Ask found/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getByRole("heading", { name: "About Atelier Morel" })).toBeTruthy();
    expect(screen.getByText(/0 of 6 pages written/)).toBeTruthy();
    const first = screen.getByText("How we price a renovation").closest("li") as HTMLElement;
    expect(within(first).getByText("Writing…")).toBeTruthy();
  });

  it("the viewer of a stale site names the changed files' count", () => {
    render(<ViewerStale />);
    expect(screen.getByText(/3 files changed since this site was built/)).toBeTruthy();
    cleanup();
    render(<Viewer />);
    expect(screen.queryByText(/changed since this site was built/)).toBeNull();
  });
});
