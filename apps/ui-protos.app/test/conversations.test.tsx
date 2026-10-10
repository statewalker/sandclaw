import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import * as stories from "../src/conversations/conversations.stories.js";

afterEach(cleanup);

const { Sidebar, Switcher, SwitcherOpen, FirstVisit } = composeStories(stories);

const list = () => screen.getByRole("navigation", { name: "Chats" });
const current = () => list().querySelector("[aria-current='true']")?.textContent ?? "";
const titles = () =>
  within(list())
    .queryAllByRole("button")
    .map((b) => b.textContent ?? "");

it("a new chat appears at the top, becomes current, and is titled by its first question", async () => {
  render(<Sidebar delay={0} />);
  expect(current()).toMatch(/Dupont start date/);
  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  expect(titles()[0]).toMatch(/^New chat/);
  expect(current()).toMatch(/^New chat/);
  fireEvent.click(
    screen.getByRole("button", { name: "What is the Dupont budget, and who is the site foreman?" }),
  );
  expect(await screen.findByText(/€18,400 excl\. VAT/, { selector: "nav *" })).toBeTruthy();
  expect(current()).toMatch(/^What is the Dupont budget, and who is the site…/);
});

it("renaming changes the title in the header and the list", () => {
  render(<Sidebar delay={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Rename" }));
  const input = screen.getByLabelText("Chat title");
  fireEvent.change(input, { target: { value: "Dupont — when we start" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.getByRole("heading", { name: "Dupont — when we start" })).toBeTruthy();
  expect(current()).toMatch(/Dupont — when we start/);
});

it("search finds a chat by a word from its messages, accents ignored", () => {
  render(<Sidebar delay={0} />);
  const search = screen.getByLabelText("Search chats");
  fireEvent.change(search, { target: { value: "skylights" } });
  expect(titles()).toHaveLength(1);
  expect(titles()[0]).toMatch(/^Leroy brief summary/);
  fireEvent.change(search, { target: { value: "ines" } });
  expect(within(list()).getByText("Dupont kitchen plan")).toBeTruthy();
  expect(within(list()).getByText(/Inès Garnier drew it/)).toBeTruthy();
  expect(within(list()).queryByText("Leroy brief summary")).toBeNull();
});

it("archiving moves a chat to Archived, and restore brings it back", () => {
  render(<Sidebar delay={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  expect(screen.getByRole("status").textContent).toMatch(
    /Archived “Dupont start date” — you can find it under Archived/,
  );
  expect(within(list()).queryByText("Dupont start date")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Archived \(2\)/ }));
  const archived = screen.getByRole("list", { name: "Archived" });
  const row = within(archived).getByText("Dupont start date").closest("li") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: /Restore/ }));
  expect(within(list()).getByText("Dupont start date")).toBeTruthy();
  expect(within(archived).queryByText("Dupont start date")).toBeNull();
});

it("save as note confirms the note's path, and opens it", () => {
  render(<Switcher delay={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Save as note" }));
  expect(screen.getByRole("status").textContent).toMatch(/Saved as Notes\/Dupont start date\.md/);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  const note = screen.getByRole("dialog");
  expect(within(note).getByText(/## When does the Dupont job start\?/)).toBeTruthy();
});

it("the switcher opens the list over the chat, and picking a chat resumes it", async () => {
  render(<Switcher delay={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Chats — Dupont start date" }));
  fireEvent.click(within(list()).getByText("Leroy brief summary"));
  expect(screen.queryByRole("navigation", { name: "Chats" })).toBeNull();
  expect(screen.getByText(/two skylights/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "When does the Dupont job start?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(await screen.findByText(/takes two weeks from that day/)).toBeTruthy();
});

it("the first visit suggests questions over the folder", () => {
  render(<FirstVisit delay={0} />);
  expect(screen.getByText("Ask anything about the files in your folder.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "When does the Dupont job start?" })).toBeTruthy();
});

it("the list groups chats by time and marks the one still answering", () => {
  render(<SwitcherOpen delay={600} />);
  const groups = within(list())
    .getAllByRole("heading")
    .map((h) => h.textContent);
  expect(groups).toEqual(["Today", "Yesterday", "Previous 7 days", "Earlier"]);
  const today = within(list()).getByRole("region", { name: "Today" });
  expect(within(today).getAllByRole("button")[0]?.textContent).toMatch(
    /^How much did we pay for the Leroy roof timber\s*Answering…/,
  );
});
