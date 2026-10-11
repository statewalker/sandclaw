import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ComposerChat } from "../src/composer/composer.js";

afterEach(cleanup);

const message = () => screen.getByLabelText("Message") as HTMLTextAreaElement;
const type = (value: string) => fireEvent.change(message(), { target: { value } });
const send = () => fireEvent.click(screen.getByRole("button", { name: "Send" }));
const context = () => within(screen.getByRole("list", { name: "Context" }));

it("a file attached from the folder shows as a chip and is sent as a reference", async () => {
  render(<ComposerChat delay={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Attach" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "From your folder" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Dupont — offer.docx" }));
  expect(context().getByText("Dupont — offer.docx")).toBeTruthy();

  type("Is the start date confirmed?");
  send();
  const sent = await screen.findByRole("list", { name: "Files referred to" });
  expect(within(sent).getByText("Dupont — offer.docx")).toBeTruthy();
  expect(screen.queryByRole("list", { name: "Context" })).toBeNull();
  // The assistant reads the file by its path, in the browser.
  expect(await screen.findByText(/Read Clients\/Dupont — offer.docx/)).toBeTruthy();
});

it("@ filters the folder as you type, and Enter inserts the mention as a chip", () => {
  render(<ComposerChat delay={0} />);
  type("Compare @lero");
  const list = screen.getByRole("listbox", { name: "Files and folders" });
  expect(
    within(list)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["Leroy — brief.pdfClients"]);

  type("Compare @dup");
  expect(screen.getAllByRole("option")).toHaveLength(3);
  fireEvent.keyDown(message(), { key: "ArrowDown" });
  fireEvent.keyDown(message(), { key: "Enter" });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(message().value).toBe("Compare Dupont — offer.docx");
  expect(context().getByText("Dupont — offer.docx")).toBeTruthy();
});

it("Escape closes the mention list without picking", () => {
  render(<ComposerChat delay={0} variant="B" />);
  type("See @cli");
  fireEvent.keyDown(message(), { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(message().value).toBe("See @cli");
});

it("while an answer runs, Stop keeps the cut answer, marked Stopped", async () => {
  render(<ComposerChat delay={30} />);
  type("What does the Dupont offer cover?");
  send();
  await screen.findByText(/^Short version/);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(await screen.findByText("Stopped")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
});

it("a message sent while an answer runs is queued, then sent after it", async () => {
  render(<ComposerChat delay={15} />);
  type("First question");
  send();
  type("Second question");
  send();
  const pending = screen.getByTestId("pending-message");
  expect(within(pending).getByText("Second question")).toBeTruthy();
  expect(within(pending).getByText(/Will be sent after the current answer/)).toBeTruthy();

  await waitFor(() => expect(screen.queryByTestId("pending-message")).toBeNull(), {
    timeout: 3000,
  });
  expect(screen.getByText("Second question")).toBeTruthy();
  await waitFor(() => expect(screen.getAllByText(/^Short version/)).toHaveLength(2), {
    timeout: 3000,
  });
});

it("offline, a send is kept as Not sent; Retry sends it once the machine is back", async () => {
  render(<ComposerChat delay={0} online={false} />);
  type("Is the start date confirmed?");
  send();
  const pending = screen.getByTestId("pending-message");
  expect(within(pending).getByText(/Not sent — the Sandclaw machine isn't answering/)).toBeTruthy();

  fireEvent.click(within(pending).getByRole("button", { name: "Retry" }));
  expect(screen.getByTestId("pending-message")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Bring the Sandclaw machine back" }));
  fireEvent.click(
    within(screen.getByTestId("pending-message")).getByRole("button", { name: "Retry" }),
  );
  expect(screen.queryByTestId("pending-message")).toBeNull();
  expect(await screen.findByText(/^Short version/)).toBeTruthy();
});
