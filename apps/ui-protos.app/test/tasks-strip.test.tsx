import { composeStories } from "@storybook/react-vite";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  abortChat,
  answerApproval,
  outputsOf,
  scenarios,
  stripSummary,
  tasksFromConversation,
} from "../src/tasks/tasks.js";
import * as stories from "../src/tasks/tasks-strip.stories.js";

afterEach(cleanup);

const { CollapsedRunning, CollapsedDone, Running, AllDone } = composeStories(stories);

const tasksOf = (scenario: keyof typeof scenarios) =>
  scenarios[scenario].flatMap(tasksFromConversation);
const byTitle = (scenario: keyof typeof scenarios, title: string) =>
  tasksOf(scenario).find((t) => t.title === title);

it("derives each status from the replies and settlements", () => {
  const status = Object.fromEntries(tasksOf("everything").map((t) => [t.title, t.status]));
  expect(status).toEqual({
    "Q3 spending summary": "running",
    "Follow-ups → todo list": "waiting",
    "Clients deck": "done",
    "Unpaid invoices": "failed",
    "Contacts list": "done",
    "Last week's mail": "stopped",
  });
});

it("counts plan steps, lists tool steps and produced files", () => {
  const q3 = byTitle("running", "Q3 spending summary");
  expect([q3?.stepNumber, q3?.plan.length]).toEqual([2, 4]);
  expect(q3?.steps.map((s) => [s.label, s.state])).toEqual([
    ["Read Finance/2026-Q3.xlsx", "done"],
    ["Grouping rows by category…", "running"],
  ]);
  expect(q3?.queued).toEqual(["Then draft an email to the accountant with it."]);

  const failed = byTitle("failed", "Unpaid invoices");
  expect(failed?.steps.at(-1)).toMatchObject({
    label: "Couldn't read Finance/invoices/INV-0412.pdf",
    state: "failed",
    reason: "The file is protected by a password.",
  });

  expect(outputsOf(tasksOf("everything")).map((f) => [f.path, f.taskTitle])).toEqual([
    ["Outputs/clients.pptx", "Clients deck"],
    ["Outputs/contacts.xlsx", "Contacts list"],
  ]);
});

it("an approval answer resumes the task; aborting stops it and what is queued", () => {
  const [followUps] = scenarios.waiting;
  if (!followUps) throw new Error("no chat");
  const [allowed] = tasksFromConversation(answerApproval(followUps, "sub_followups", "task"));
  expect(allowed?.status).toBe("done");
  expect(allowed?.files.map((f) => [f.path, f.change])).toEqual([["Notes/todo.md", "changed"]]);

  const [q3] = scenarios.running;
  if (!q3) throw new Error("no chat");
  const stopped = abortChat(q3);
  expect(tasksFromConversation(stopped).map((t) => t.status)).toEqual(["stopped"]);
  expect(stopped.settlements.map((s) => s.outcome)).toEqual(["aborted", "aborted"]);
});

it("the collapsed strip shows step n of m for a running task", () => {
  render(<CollapsedRunning />);
  expect(screen.getByText("Q3 spending summary · step 2 of 4")).toBeTruthy();
  render(<CollapsedDone />);
  expect(screen.getByText("3 tasks today · all done")).toBeTruthy();
  expect(stripSummary(tasksOf("everything")).waiting).toBe(1);
});

it("cancel asks first, says what else it cancels, then marks the task stopped", async () => {
  render(<Running />);
  const row = screen.getByRole("listitem", { name: "Q3 spending summary" });
  fireEvent.click(within(row).getByRole("button", { name: "Cancel task" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText(/Then draft an email to the accountant/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel task" }));
  expect(within(row).getByText(/^Stopped ·/)).toBeTruthy();
  expect(within(row).getByRole("button", { name: /Retry/ })).toBeTruthy();
});

it("undo of a produced file asks, then removes it", async () => {
  render(<AllDone />);
  const row = screen.getByRole("listitem", { name: "Clients deck" });
  fireEvent.click(within(row).getByText("Clients deck"));
  fireEvent.click(within(row).getByRole("button", { name: "Undo Outputs/clients.pptx" }));
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete file" }));
  expect(screen.queryByRole("button", { name: "Open Outputs/clients.pptx" })).toBeNull();
  expect(screen.getByRole("status").textContent).toMatch(/Deleted Outputs\/clients.pptx/);
});
