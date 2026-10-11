import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { IndexingPage, IndexingTree } from "../src/indexing/indexing.js";
import { topFolders } from "../src/indexing/reading.js";

afterEach(cleanup);

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const summary = () => screen.getByLabelText("Summary").textContent ?? "";
const row = (name: string) => screen.getByRole("listitem", { name });

it("excluding a folder asks first, then shows it off and the totals drop", async () => {
  render(<IndexingPage scenario="first-reading" />);
  expect(summary()).toBe("The assistant has read 212 of 340 files");
  fireEvent.click(screen.getByRole("switch", { name: "Read by the assistant: Finance" }));
  expect(await screen.findByText(/forget what it learnt from 78 files in Finance/)).toBeTruthy();
  click("Stop reading Finance");
  expect(within(row("Finance")).getByText(/won't answer from them/)).toBeTruthy();
  expect(summary()).toBe("The assistant has read 134 of 260 files");
});

it("including a folder again queues its files", async () => {
  render(<IndexingPage scenario="all-read" />);
  fireEvent.click(screen.getByRole("switch", { name: "Read by the assistant: Photos" }));
  click("Stop reading Photos");
  fireEvent.click(screen.getByRole("switch", { name: "Read by the assistant: Photos" }));
  expect(within(row("Photos")).getByText("0 of 80 read · 80 waiting")).toBeTruthy();
  expect(summary()).toBe("The assistant has read 260 of 340 files");
});

it("a file it can't read shows why, and Try again queues it", () => {
  render(<IndexingPage scenario="with-failures" />);
  const list = screen.getByRole("list", { name: "Files the assistant can't read" });
  const payroll = within(list).getByRole("listitem", { name: "payroll 2026.pdf" });
  expect(within(payroll).getByText("Protected by a password")).toBeTruthy();
  fireEvent.click(within(payroll).getByRole("button", { name: "Try again" }));
  expect(within(list).queryByRole("listitem", { name: "payroll 2026.pdf" })).toBeNull();
  expect(within(row("Finance")).getByText(/2 waiting · 1 can't be read/)).toBeTruthy();
});

it("the summary counts match the folder rows", () => {
  render(<IndexingPage scenario="first-reading" />);
  let read = 0;
  let total = 0;
  for (const name of topFolders) {
    const [, r, t] =
      within(row(name))
        .getByText(/\d+ of \d+ read/)
        .textContent?.match(/(\d+) of (\d+)/) ?? [];
    read += Number(r);
    total += Number(t);
  }
  expect(summary()).toBe(`The assistant has read ${read} of ${total} files`);
});

it("in the tree, the row menu excludes a folder after confirmation", async () => {
  render(<IndexingTree scenario="all-read" />);
  click("More for Notes");
  fireEvent.click(
    screen.getByRole("menuitem", { name: "Don't let the assistant read this folder" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Stop reading Notes" }));
  expect(screen.getByText("Read all 304 files")).toBeTruthy();
});
