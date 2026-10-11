import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AssistantPanel } from "../src/assistant-panel/assistant-panel.js";

afterEach(cleanup);

it("a task that creates a file shows it as an output", async () => {
  render(<AssistantPanel scenario="deck" stepMs={0} />);
  expect(await screen.findByText("Outputs/clients.pptx")).toBeTruthy();
});

it("changing an existing file waits for approval, then goes on", async () => {
  render(<AssistantPanel scenario="todos" stepMs={0} />);
  fireEvent.click(await screen.findByRole("button", { name: "Allow" }));
  expect(await screen.findByText("Added 2 items to Notes/todo.md")).toBeTruthy();
  expect(screen.getByText("Allowed: change Notes/todo.md")).toBeTruthy();
});

it("declining an approval leaves the file unchanged", async () => {
  render(<AssistantPanel scenario="todos" stepMs={0} />);
  fireEvent.click(await screen.findByRole("button", { name: "Don't change it" }));
  expect(await screen.findByText("Your todo list was not changed.")).toBeTruthy();
  expect(screen.queryByText("Notes/todo.md", { selector: "button" })).toBeNull();
});

it("a pinned request is answered from above the message box", async () => {
  render(<AssistantPanel scenario="mail" placement="pinned" stepMs={0} />);
  fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
  expect(await screen.findByText(/I won't touch your mail/)).toBeTruthy();
  expect(screen.getByText("Declined: use Mail")).toBeTruthy();
});
