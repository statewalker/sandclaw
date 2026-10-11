import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AskChat } from "../src/ask/grounded-answer.js";
import * as stories from "../src/ask/grounded-answer.stories.js";

afterEach(cleanup);

const { Inline, Side, NotFound, Partial } = composeStories(stories);

const numbers = (els: HTMLElement[]) => [...new Set(els.map((e) => e.textContent?.trim()))].sort();

it.each([
  ["A", Inline],
  ["B", Side],
])("variant %s numbers citations and source cards alike", (_, Story) => {
  render(<Story />);
  const citations = screen.getAllByRole("button", { name: /^Source \d+$/ });
  const cards = within(screen.getByRole("list", { name: "Sources" })).getAllByRole("button");
  expect(numbers(citations)).toEqual(["1", "2", "3"]);
  expect(cards.map((c) => c.getAttribute("aria-label")?.match(/\d+/)?.[0])).toEqual([
    "1",
    "2",
    "3",
  ]);
});

it("clicking a citation shows the cited passage, highlighted", () => {
  render(<Inline />);
  fireEvent.click(screen.getByRole("button", { name: "Source 2" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Dupont — offer.docx")).toBeTruthy();
  expect(within(dialog).getByTestId("cited-passage").textContent).toMatch(
    /Phase 1 — removal of the old kitchen and floor/,
  );
  expect(within(dialog).getByRole("button", { name: "Open file" })).toBeTruthy();
});

it("not found says so, shows what was searched, and no sources", () => {
  render(<NotFound />);
  expect(screen.getByText("I didn't find this in your files.")).toBeTruthy();
  expect(screen.getByText(/Leroy roof timber price/)).toBeTruthy();
  expect(screen.queryByRole("list", { name: "Sources" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Source \d+$/ })).toBeNull();
});

it("a partial answer says plainly what it did not find", () => {
  render(<Partial />);
  expect(screen.getByText(/didn't find who the site foreman is/)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /^Source \d+$/ })).toHaveLength(1);
});

it("in chat, a sent question shows, then the answer with its sources", async () => {
  render(<AskChat delay={0} />);
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "When does the Dupont job start?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText("When does the Dupont job start?")).toBeTruthy();
  const tool = await screen.findByText(/Searched your files · 3 sources/);
  expect(await screen.findByText(/takes two weeks from that day/)).toBeTruthy();
  expect(numbers(await screen.findAllByRole("button", { name: /^Source \d+$/ }))).toEqual([
    "1",
    "2",
    "3",
  ]);
  fireEvent.click(tool);
  expect(screen.getByRole("button", { name: /^Open source 3, Dupont — notes.md$/ })).toBeTruthy();
});
