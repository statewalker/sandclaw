import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FirstSteps } from "../src/first-steps/first-steps.js";
import { suggestQuestions, topics } from "../src/first-steps/suggest.js";
import { folder } from "../src/mock.js";

afterEach(cleanup);

it("suggests first questions from the folder's file names", () => {
  expect(suggestQuestions(folder)).toEqual([
    "What's the status of the Dupont job?",
    "Summarise the Q3 figures",
    "What did we agree at the meeting on 2 Oct?",
    "What do we have on Leroy?",
  ]);
  expect(suggestQuestions(folder, 2)).toHaveLength(2);
});

it("the job most files are about comes first", () => {
  expect(topics(["Leroy — brief.pdf", "Martin — quote.pdf", "Martin — plan.pdf"])).toEqual([
    "Martin",
    "Leroy",
  ]);
});

it("an empty folder gets no questions; a folder of anonymous names gets a generic one", () => {
  expect(suggestQuestions([])).toEqual([]);
  expect(suggestQuestions([{ name: "IMG_0042.jpg" }, { name: "scan.pdf" }])).toEqual([
    "What is in this folder?",
  ]);
});

it("clicking a suggestion asks it", () => {
  render(<FirstSteps guide="none" />);
  fireEvent.click(screen.getByRole("button", { name: "Summarise the Q3 figures" }));
  expect(screen.queryByRole("button", { name: "Summarise the Q3 figures" })).toBeNull();
  expect(screen.getByText("Summarise the Q3 figures")).toBeTruthy();
  expect(screen.getByText("Looking through your folder…")).toBeTruthy();
});

it("while reading, the waiting variant holds the suggestions back", () => {
  render(<FirstSteps guide="none" whileReading="wait" read={2} stepMs={0} />);
  expect(screen.getByText(/Suggested questions appear when I'm done/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Summarise the Q3 figures" })).toBeNull();
  cleanup();
  render(<FirstSteps guide="none" whileReading="ask-now" read={2} stepMs={0} />);
  expect(screen.getByText(/Ask now — answers improve as I read/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Summarise the Q3 figures" })).toBeTruthy();
});

it("pointers dismiss one by one, or all for good", () => {
  render(<FirstSteps guide="pointers" />);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss “Your folder”" }));
  expect(screen.queryByRole("note", { name: "Your folder" })).toBeNull();
  expect(screen.getByRole("note", { name: "The assistant" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Don't show this again" }));
  expect(screen.queryAllByRole("note")).toHaveLength(0);
  expect(screen.queryByText(/Welcome to/)).toBeNull();
});
